import {
  decodeRustEngineEnvelope,
  decodeRustEngineJson,
  encodeRustEngineEnvelope,
  encodeRustEngineJson,
  RUST_ENGINE_PROTOCOL_VERSION,
  RUST_ENGINE_SCHEMA_VERSION,
  RustEngineMessageFlag,
  RustEngineMessageKind,
  type RustEngineEnvelope,
  type RustEngineWireMessage,
} from "./rust-engine-protocol";
import {
  RustEngineLoader,
  type LoadedRustEngine,
  type RustEngineLoaderOptions,
  type RustEngineBytes,
} from "./rust-engine-loader";

export type RustEngineWorkerScope = {
  onmessage: ((event: MessageEvent<RustEngineWireMessage | ArrayBuffer>) => void) | null;
  onmessageerror?: ((event: MessageEvent) => void) | null;
  postMessage(message: RustEngineWireMessage, transfer: Transferable[]): void;
  close?: () => void;
};

export type RustEngineWorkerOptions = Readonly<{
  loader?: RustEngineLoader;
  loaderOptions?: RustEngineLoaderOptions;
  now?: () => number;
  maximumReturnedBuffers?: number;
}>;

type WorkerErrorPayload = Readonly<{
  code: string;
  message: string;
  phase: "decode" | "load" | "execute" | "shutdown";
  recoverable: boolean;
}>;

function asArrayBuffer(value: RustEngineBytes): ArrayBuffer {
  if (value instanceof ArrayBuffer) return value;
  return value.byteOffset === 0 && value.byteLength === value.buffer.byteLength
    ? value.buffer as ArrayBuffer
    : value.slice().buffer;
}

function boundedMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 1_024 ? `${message.slice(0, 1_021)}...` : message;
}

function isPanic(error: unknown) {
  return error instanceof WebAssembly.RuntimeError || (error instanceof Error && /panic|unreachable/i.test(`${error.name} ${error.message}`));
}

function readCompactRustError(envelope: RustEngineEnvelope) {
  if (envelope.payload.byteLength < 6) return new Error("Rust engine returned a malformed compact error payload");
  const view = new DataView(envelope.payload.buffer, envelope.payload.byteOffset, envelope.payload.byteLength);
  const code = view.getUint16(0, true);
  const detail = view.getUint32(2, true);
  let message = "Rust engine rejected the request";
  try {
    message = new TextDecoder("utf-8", { fatal: true }).decode(envelope.payload.subarray(6)) || message;
  } catch { /* retain the bounded generic message */ }
  return new Error(`${message} (code ${code}, detail ${detail})`);
}

function readHandle(envelope: RustEngineEnvelope) {
  if (envelope.header.kind === RustEngineMessageKind.Error || envelope.header.kind === RustEngineMessageKind.Panic) return null;
  if (envelope.payload.byteLength === 12) {
    const view = new DataView(envelope.payload.buffer, envelope.payload.byteOffset, envelope.payload.byteLength);
    const handle = view.getUint32(0, true);
    const protocol = view.getUint16(4, true);
    const schema = view.getUint16(6, true);
    if (protocol !== RUST_ENGINE_PROTOCOL_VERSION || schema !== RUST_ENGINE_SCHEMA_VERSION) return null;
    return handle > 0 ? handle : null;
  }
  if (envelope.payload.byteLength === 4) {
    const handle = new DataView(envelope.payload.buffer, envelope.payload.byteOffset, 4).getUint32(0, true);
    return handle > 0 ? handle : null;
  }
  try {
    const payload = decodeRustEngineJson<{ handle?: unknown }>(envelope.payload);
    return typeof payload.handle === "number" && Number.isInteger(payload.handle) && payload.handle > 0 ? payload.handle : null;
  } catch {
    return null;
  }
}

export function installRustEngineWorker(scope: RustEngineWorkerScope, options: RustEngineWorkerOptions = {}) {
  const loader = options.loader ?? new RustEngineLoader(options.loaderOptions);
  const now = options.now ?? (() => typeof performance === "undefined" ? Date.now() : performance.now());
  const startedAt = now();
  const maximumReturnedBuffers = Math.max(0, options.maximumReturnedBuffers ?? 8);
  const returnedBuffers: ArrayBuffer[] = [];
  let engine: LoadedRustEngine | null = null;
  let engineHandle: number | null = null;
  let epoch = 0;
  let shuttingDown = false;
  let chain = Promise.resolve();

  const post = (buffer: ArrayBuffer) => {
    scope.postMessage({ envelope: buffer }, [buffer]);
  };

  const replyJson = (request: RustEngineEnvelope, kind: RustEngineMessageKind, payload: unknown, flags = 0) => {
    post(encodeRustEngineEnvelope({
      kind,
      flags: flags | RustEngineMessageFlag.Response,
      requestId: request.header.requestId,
      epoch,
      payload: encodeRustEngineJson(payload),
    }));
  };

  const replyError = (
    requestId: number,
    error: unknown,
    phase: WorkerErrorPayload["phase"],
    recoverable: boolean,
  ) => {
    const panic = isPanic(error);
    const payload: WorkerErrorPayload = {
      code: panic ? "rust-panic" : error instanceof Error ? error.name : "engine-error",
      message: boundedMessage(error),
      phase,
      recoverable,
    };
    post(encodeRustEngineEnvelope({
      kind: panic ? RustEngineMessageKind.Panic : RustEngineMessageKind.Error,
      flags: RustEngineMessageFlag.Response
        | RustEngineMessageFlag.Error
        | RustEngineMessageFlag.Final
        | (recoverable ? RustEngineMessageFlag.Recoverable : 0),
      requestId,
      epoch,
      payload: encodeRustEngineJson(payload),
    }));
  };

  const ensureEngine = async (request: RustEngineEnvelope) => {
    if (engine && engineHandle !== null) return engine;
    engine = await loader.load();
    const createResult = decodeRustEngineEnvelope(asArrayBuffer(engine.exports.blockwild_engine_create(new Uint8Array(request.buffer))));
    if (createResult.header.kind === RustEngineMessageKind.Error || createResult.header.kind === RustEngineMessageKind.Panic) {
      throw readCompactRustError(createResult);
    }
    engineHandle = readHandle(createResult);
    if (engineHandle === null) throw new Error("Rust engine creation response did not contain a valid handle");
    return engine;
  };

  const forwardRustResult = (bytes: RustEngineBytes, request: RustEngineEnvelope) => {
    const buffer = asArrayBuffer(bytes);
    const result = decodeRustEngineEnvelope(buffer);
    if (result.header.kind === RustEngineMessageKind.Error || result.header.kind === RustEngineMessageKind.Panic) {
      throw readCompactRustError(result);
    }
    // Some coarse ABI calls (step/take-events/state-hash) receive only a
    // handle, so the worker owns correlation with the browser request.
    const header = new DataView(buffer);
    header.setUint16(10, result.header.flags | RustEngineMessageFlag.Response, true);
    header.setUint32(12, request.header.requestId, true);
    header.setUint32(16, request.header.epoch, true);
    post(buffer);
  };

  const execute = async (wire: RustEngineWireMessage | ArrayBuffer) => {
    const rawEnvelope = wire instanceof ArrayBuffer ? wire : wire.envelope;
    let request: RustEngineEnvelope;
    try {
      request = decodeRustEngineEnvelope(rawEnvelope);
    } catch (error) {
      replyError(0, error, "decode", false);
      return;
    }
    if (shuttingDown && request.header.kind !== RustEngineMessageKind.Shutdown) {
      replyError(request.header.requestId, new Error("Rust engine worker is shutting down"), "shutdown", false);
      return;
    }
    epoch = Math.max(epoch, request.header.epoch);
    if (request.header.kind === RustEngineMessageKind.BufferRelease) {
      const returned = wire instanceof ArrayBuffer ? undefined : wire.returnedBuffer;
      if (returned && returnedBuffers.length < maximumReturnedBuffers) returnedBuffers.push(returned);
      return;
    }
    if (request.header.kind === RustEngineMessageKind.Heartbeat) {
      replyJson(request, RustEngineMessageKind.Heartbeat, {
        uptimeMs: Math.max(0, now() - startedAt),
        loaded: Boolean(engine),
        epoch,
        returnedBufferCount: returnedBuffers.length,
        returnedBufferBytes: returnedBuffers.reduce((total, buffer) => total + buffer.byteLength, 0),
      });
      return;
    }
    if (request.header.kind === RustEngineMessageKind.Shutdown) {
      shuttingDown = true;
      try {
        if (engine && engineHandle !== null) {
          const result = decodeRustEngineEnvelope(asArrayBuffer(engine.exports.blockwild_engine_destroy(engineHandle)));
          if (result.header.kind === RustEngineMessageKind.Error || result.header.kind === RustEngineMessageKind.Panic) {
            post(result.buffer);
            return;
          }
        }
        engineHandle = null;
        returnedBuffers.length = 0;
        replyJson(request, RustEngineMessageKind.Shutdown, { stopped: true }, RustEngineMessageFlag.Final);
      } catch (error) {
        replyError(request.header.requestId, error, "shutdown", false);
      } finally {
        scope.close?.();
      }
      return;
    }
    if (request.header.kind === RustEngineMessageKind.CapabilityHello) {
      try {
        const loaded = await ensureEngine(request);
        replyJson(request, RustEngineMessageKind.CapabilityAck, {
          protocolVersion: loaded.protocolVersion,
          schemaVersion: loaded.schemaVersion,
          buildKind: loaded.artifact.buildKind,
          buildHash: loaded.artifact.buildHash ?? null,
          engineHandle,
          transferableBuffers: true,
          sharedMemory: false,
          renderer: "three-transition",
        });
      } catch (error) {
        replyError(request.header.requestId, error, "load", true);
      }
      return;
    }
    try {
      const loaded = await ensureEngine(request);
      if (engineHandle === null) throw new Error("Rust engine handle is unavailable");
      switch (request.header.kind) {
        case RustEngineMessageKind.CommandBatch:
          forwardRustResult(loaded.exports.blockwild_engine_ingest(engineHandle, new Uint8Array(request.buffer)), request);
          break;
        case RustEngineMessageKind.Step: {
          const step = decodeRustEngineJson<{ monotonicTimeUs: number; budgetUs: number }>(request.payload);
          if (!Number.isFinite(step.monotonicTimeUs) || !Number.isInteger(step.budgetUs) || step.budgetUs < 0) {
            throw new TypeError("Step payload requires finite monotonicTimeUs and an unsigned integer budgetUs");
          }
          forwardRustResult(loaded.exports.blockwild_engine_step(engineHandle, step.monotonicTimeUs, step.budgetUs), request);
          break;
        }
        case RustEngineMessageKind.Events:
          forwardRustResult(loaded.exports.blockwild_engine_take_events(engineHandle), request);
          break;
        case RustEngineMessageKind.StateHash:
          forwardRustResult(loaded.exports.blockwild_engine_state_hash(engineHandle), request);
          break;
        default:
          throw new TypeError(`Unsupported engine request kind ${request.header.kind}`);
      }
    } catch (error) {
      replyError(request.header.requestId, error, "execute", !isPanic(error));
    }
  };

  scope.onmessage = (event) => {
    chain = chain.then(() => execute(event.data)).catch((error) => replyError(0, error, "execute", false));
  };
  if ("onmessageerror" in scope) {
    scope.onmessageerror = () => replyError(0, new Error("Rust engine worker received an unreadable structured-clone message"), "decode", false);
  }

  return {
    diagnostics: () => ({
      protocolVersion: RUST_ENGINE_PROTOCOL_VERSION,
      schemaVersion: RUST_ENGINE_SCHEMA_VERSION,
      loaded: Boolean(engine),
      engineHandle,
      epoch,
      shuttingDown,
      returnedBufferCount: returnedBuffers.length,
      loader: loader.diagnostics(),
    } as const),
  };
}

const possibleWorkerScope = globalThis as unknown as Partial<RustEngineWorkerScope>;
if (
  typeof document === "undefined"
  && typeof possibleWorkerScope.postMessage === "function"
  && typeof possibleWorkerScope.close === "function"
) {
  installRustEngineWorker(possibleWorkerScope as RustEngineWorkerScope);
}
