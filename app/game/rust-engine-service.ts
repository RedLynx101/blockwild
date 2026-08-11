import {
  decodeRustEngineEnvelope,
  decodeRustEngineJson,
  encodeRustEngineEnvelope,
  encodeRustEngineJson,
  hasRustEngineFlag,
  RUST_ENGINE_PROTOCOL_VERSION,
  RUST_ENGINE_SCHEMA_VERSION,
  RustEngineMessageFlag,
  RustEngineMessageKind,
  type RustEngineEnvelopeHeader,
  type RustEngineWireMessage,
} from "./rust-engine-protocol";

export interface RustEngineWorkerLike {
  onmessage: ((event: MessageEvent<RustEngineWireMessage | ArrayBuffer>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: RustEngineWireMessage, transfer?: Transferable[]): void;
  terminate(): void;
}

export type RustEngineCapabilities = Readonly<{
  protocolVersion: number;
  schemaVersion: number;
  buildKind: "compatibility" | "accelerated";
  buildHash: string | null;
  engineHandle: number;
  transferableBuffers: boolean;
  sharedMemory: boolean;
  renderer: string;
}>;

export type RustEngineServiceErrorCode =
  | "worker-unavailable"
  | "worker-failed"
  | "message-error"
  | "request-timeout"
  | "protocol-error"
  | "unexpected-response"
  | "remote-error"
  | "remote-panic"
  | "service-stopped";

export class RustEngineServiceError extends Error {
  readonly name = "RustEngineServiceError";

  constructor(
    readonly code: RustEngineServiceErrorCode,
    message: string,
    readonly recoverable: boolean,
    readonly cause?: unknown,
  ) {
    super(message);
  }
}

export type RustEngineServiceState = "idle" | "starting" | "ready" | "failed" | "stopping" | "stopped";

export type RustEngineServiceOptions = Readonly<{
  workerFactory?: () => RustEngineWorkerLike;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  heartbeatIntervalMs?: number;
  heartbeatTimeoutMs?: number;
  maximumRestarts?: number;
  autoRestart?: boolean;
  now?: () => number;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
  setInterval?: typeof globalThis.setInterval;
  clearInterval?: typeof globalThis.clearInterval;
  clientBuildHash?: string;
  engineSelection?: string;
  rendererSelection?: string;
}>;

type PendingRequest = {
  expectedKind: RustEngineMessageKind | null;
  resolve: (response: RustEngineResponse) => void;
  reject: (error: RustEngineServiceError) => void;
  timer: ReturnType<typeof setTimeout>;
  sentAt: number;
};

export class RustEngineResponse {
  private isReleased = false;

  constructor(
    readonly header: RustEngineEnvelopeHeader,
    private readonly sourceBuffer: ArrayBuffer,
    private readonly payloadView: Uint8Array,
    private readonly releaseOwnedBuffer: (response: RustEngineResponse, buffer: ArrayBuffer) => void,
  ) {}

  get released() { return this.isReleased; }
  get byteLength() { return this.sourceBuffer.byteLength; }
  get payload() {
    if (this.isReleased) throw new RustEngineServiceError("protocol-error", "Engine response payload was accessed after its buffer was released", false);
    return this.payloadView;
  }

  copyPayload() { return this.payload.slice(); }

  release() {
    if (this.isReleased) return false;
    this.isReleased = true;
    this.releaseOwnedBuffer(this, this.sourceBuffer);
    return true;
  }
}

function defaultWorkerFactory(): RustEngineWorkerLike {
  if (typeof Worker === "undefined") {
    throw new RustEngineServiceError("worker-unavailable", "Web Workers are unavailable in this environment", true);
  }
  return new Worker(new URL("./rust-engine-worker.ts", import.meta.url), {
    type: "module",
    name: "blockwild-rust-engine",
  }) as unknown as RustEngineWorkerLike;
}

function toServiceError(error: unknown, code: RustEngineServiceErrorCode = "worker-failed") {
  return error instanceof RustEngineServiceError
    ? error
    : new RustEngineServiceError(code, error instanceof Error ? error.message : String(error), true, error);
}

function readCapabilities(payload: Uint8Array): RustEngineCapabilities {
  const value = decodeRustEngineJson<Partial<RustEngineCapabilities>>(payload);
  if (
    value.protocolVersion !== RUST_ENGINE_PROTOCOL_VERSION
    || value.schemaVersion !== RUST_ENGINE_SCHEMA_VERSION
    || (value.buildKind !== "compatibility" && value.buildKind !== "accelerated")
    || typeof value.engineHandle !== "number"
    || !Number.isInteger(value.engineHandle)
    || value.engineHandle <= 0
    || typeof value.transferableBuffers !== "boolean"
    || typeof value.sharedMemory !== "boolean"
    || typeof value.renderer !== "string"
  ) {
    throw new RustEngineServiceError("protocol-error", "Rust engine capability acknowledgement is malformed or incompatible", false);
  }
  return {
    protocolVersion: value.protocolVersion,
    schemaVersion: value.schemaVersion,
    buildKind: value.buildKind,
    buildHash: typeof value.buildHash === "string" ? value.buildHash : null,
    engineHandle: value.engineHandle,
    transferableBuffers: value.transferableBuffers,
    sharedMemory: value.sharedMemory,
    renderer: value.renderer,
  };
}

export class RustEngineService {
  private readonly workerFactory: () => RustEngineWorkerLike;
  private readonly startupTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly heartbeatIntervalMs: number;
  private readonly heartbeatTimeoutMs: number;
  private readonly maximumRestarts: number;
  private readonly autoRestart: boolean;
  private readonly now: () => number;
  private readonly scheduleTimeout: typeof globalThis.setTimeout;
  private readonly cancelTimeout: typeof globalThis.clearTimeout;
  private readonly scheduleInterval: typeof globalThis.setInterval;
  private readonly cancelInterval: typeof globalThis.clearInterval;
  private readonly clientBuildHash: string;
  private readonly engineSelection: string;
  private readonly rendererSelection: string;
  private worker: RustEngineWorkerLike | null = null;
  private state: RustEngineServiceState = "idle";
  private capabilitiesValue: RustEngineCapabilities | null = null;
  private startPromise: Promise<RustEngineCapabilities> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private pending = new Map<number, PendingRequest>();
  private ownedResponses = new Set<RustEngineResponse>();
  private nextRequestId = 1;
  private epoch = 1;
  private generation = 0;
  private desired = false;
  private restarts = 0;
  private requests = 0;
  private responses = 0;
  private timeouts = 0;
  private failures = 0;
  private staleResponses = 0;
  private transferredToWorkerBytes = 0;
  private transferredFromWorkerBytes = 0;
  private returnedBufferBytes = 0;
  private lastHeartbeatAt: number | null = null;
  private lastError: Readonly<{ code: RustEngineServiceErrorCode; message: string }> | null = null;

  constructor(options: RustEngineServiceOptions = {}) {
    this.workerFactory = options.workerFactory ?? defaultWorkerFactory;
    this.startupTimeoutMs = Math.max(1, options.startupTimeoutMs ?? 4_000);
    this.requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? 2_000);
    this.heartbeatIntervalMs = Math.max(0, options.heartbeatIntervalMs ?? 1_000);
    this.heartbeatTimeoutMs = Math.max(1, options.heartbeatTimeoutMs ?? 2_500);
    this.maximumRestarts = Math.max(0, options.maximumRestarts ?? 1);
    this.autoRestart = options.autoRestart ?? true;
    this.now = options.now ?? (() => typeof performance === "undefined" ? Date.now() : performance.now());
    this.scheduleTimeout = options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
    this.cancelTimeout = options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
    this.scheduleInterval = options.setInterval ?? globalThis.setInterval.bind(globalThis);
    this.cancelInterval = options.clearInterval ?? globalThis.clearInterval.bind(globalThis);
    this.clientBuildHash = options.clientBuildHash ?? "development";
    this.engineSelection = options.engineSelection ?? "typescript";
    this.rendererSelection = options.rendererSelection ?? "three";
  }

  get lifecycleState() { return this.state; }
  get capabilities() { return this.capabilitiesValue; }
  get ready() { return this.state === "ready" && Boolean(this.worker); }

  start(): Promise<RustEngineCapabilities> {
    if (this.ready && this.capabilitiesValue) return Promise.resolve(this.capabilitiesValue);
    if (this.startPromise) return this.startPromise;
    this.desired = true;
    this.startPromise = this.startWithRetry().finally(() => {
      this.startPromise = null;
    });
    return this.startPromise;
  }

  private async startWithRetry() {
    while (true) {
      try {
        return await this.startOnce();
      } catch (error) {
        const normalized = toServiceError(error);
        const incompatible = normalized.code === "protocol-error" || normalized.code === "remote-panic";
        if (incompatible || !this.desired || this.restarts >= this.maximumRestarts) {
          this.state = "failed";
          this.lastError = { code: normalized.code, message: normalized.message };
          throw normalized;
        }
        this.restarts += 1;
      }
    }
  }

  private async startOnce() {
    this.stopHeartbeat();
    this.teardownWorker(new RustEngineServiceError("worker-failed", "Rust engine worker replaced during startup", true), false);
    this.state = "starting";
    this.capabilitiesValue = null;
    const generation = ++this.generation;
    this.epoch += 1;
    try {
      this.worker = this.workerFactory();
    } catch (error) {
      throw toServiceError(error, "worker-unavailable");
    }
    const worker = this.worker;
    worker.onmessage = (event) => this.handleMessage(event.data, generation);
    worker.onerror = (event) => this.handleWorkerFault(
      new RustEngineServiceError("worker-failed", event.message || "Rust engine worker failed", true, event),
      generation,
    );
    worker.onmessageerror = (event) => this.handleWorkerFault(
      new RustEngineServiceError("message-error", "Rust engine worker produced an unreadable structured-clone message", true, event),
      generation,
    );
    const response = await this.sendRequest(
      RustEngineMessageKind.CapabilityHello,
      encodeRustEngineJson({
        protocolVersion: RUST_ENGINE_PROTOCOL_VERSION,
        schemaVersion: RUST_ENGINE_SCHEMA_VERSION,
        clientBuildHash: this.clientBuildHash,
        engineSelection: this.engineSelection,
        rendererSelection: this.rendererSelection,
        crossOriginIsolated: typeof crossOriginIsolated === "boolean" && crossOriginIsolated,
        sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
        webGpu: typeof navigator !== "undefined" && "gpu" in navigator,
      }),
      RustEngineMessageKind.CapabilityAck,
      this.startupTimeoutMs,
      true,
    );
    try {
      const capabilities = readCapabilities(response.payload);
      response.release();
      this.capabilitiesValue = capabilities;
      this.state = "ready";
      this.lastError = null;
      this.startHeartbeat();
      return capabilities;
    } catch (error) {
      response.release();
      this.teardownWorker(toServiceError(error, "protocol-error"), false);
      throw toServiceError(error, "protocol-error");
    }
  }

  async request(
    kind: RustEngineMessageKind,
    payload?: ArrayBuffer | ArrayBufferView,
    expectedKind: RustEngineMessageKind | null = null,
    timeoutMs = this.requestTimeoutMs,
  ) {
    if (!this.ready) await this.start();
    return this.sendRequest(kind, payload, expectedKind, timeoutMs, false);
  }

  ingest(batch: ArrayBuffer | ArrayBufferView) {
    return this.request(RustEngineMessageKind.CommandBatch, batch);
  }

  step(monotonicTimeUs: number, budgetUs: number) {
    return this.request(
      RustEngineMessageKind.Step,
      encodeRustEngineJson({ monotonicTimeUs, budgetUs }),
      RustEngineMessageKind.Step,
    );
  }

  takeEvents() {
    return this.request(RustEngineMessageKind.Events, undefined, RustEngineMessageKind.Events);
  }

  stateHash() {
    return this.request(RustEngineMessageKind.StateHash, undefined, RustEngineMessageKind.StateHash);
  }

  private sendRequest(
    kind: RustEngineMessageKind,
    payload: ArrayBuffer | ArrayBufferView | undefined,
    expectedKind: RustEngineMessageKind | null,
    timeoutMs: number,
    allowStarting: boolean,
  ) {
    if (!this.worker || (!allowStarting && this.state !== "ready")) {
      return Promise.reject(new RustEngineServiceError("service-stopped", `Rust engine service cannot send ${RustEngineMessageKind[kind]} while ${this.state}`, true));
    }
    const requestId = this.nextRequestId++;
    const envelope = encodeRustEngineEnvelope({ kind, requestId, epoch: this.epoch, payload });
    this.requests += 1;
    this.transferredToWorkerBytes += envelope.byteLength;
    return new Promise<RustEngineResponse>((resolve, reject) => {
      const timer = this.scheduleTimeout(() => {
        const pending = this.pending.get(requestId);
        if (!pending) return;
        this.pending.delete(requestId);
        this.timeouts += 1;
        const error = new RustEngineServiceError("request-timeout", `${RustEngineMessageKind[kind]} request ${requestId} timed out after ${timeoutMs} ms`, true);
        this.lastError = { code: error.code, message: error.message };
        reject(error);
      }, timeoutMs);
      this.pending.set(requestId, { expectedKind, resolve, reject, timer, sentAt: this.now() });
      try {
        this.worker!.postMessage({ envelope }, [envelope]);
      } catch (error) {
        this.cancelTimeout(timer);
        this.pending.delete(requestId);
        const normalized = toServiceError(error);
        this.failures += 1;
        reject(normalized);
      }
    });
  }

  private handleMessage(wire: RustEngineWireMessage | ArrayBuffer, generation: number) {
    if (generation !== this.generation) return;
    const buffer = wire instanceof ArrayBuffer ? wire : wire.envelope;
    let envelope;
    try {
      envelope = decodeRustEngineEnvelope(buffer);
    } catch (error) {
      this.handleWorkerFault(new RustEngineServiceError("protocol-error", `Rust engine response was invalid: ${error instanceof Error ? error.message : String(error)}`, false, error), generation);
      return;
    }
    this.transferredFromWorkerBytes += buffer.byteLength;
    const pending = this.pending.get(envelope.header.requestId);
    if (!pending) {
      this.staleResponses += 1;
      this.returnUnclaimedBuffer(envelope.header, envelope.buffer);
      return;
    }
    this.pending.delete(envelope.header.requestId);
    this.cancelTimeout(pending.timer);
    if (envelope.header.kind === RustEngineMessageKind.Error || envelope.header.kind === RustEngineMessageKind.Panic || hasRustEngineFlag(envelope.header, RustEngineMessageFlag.Error)) {
      let remote: { message?: unknown; recoverable?: unknown } = {};
      try { remote = decodeRustEngineJson(envelope.payload); } catch { /* retain bounded generic error */ }
      const panic = envelope.header.kind === RustEngineMessageKind.Panic;
      const recoverable = !panic && (remote.recoverable === true || hasRustEngineFlag(envelope.header, RustEngineMessageFlag.Recoverable));
      const error = new RustEngineServiceError(
        panic ? "remote-panic" : "remote-error",
        typeof remote.message === "string" ? remote.message : panic ? "Rust engine panicked" : "Rust engine rejected the request",
        recoverable,
      );
      this.lastError = { code: error.code, message: error.message };
      this.returnUnclaimedBuffer(envelope.header, envelope.buffer);
      pending.reject(error);
      return;
    }
    if (!hasRustEngineFlag(envelope.header, RustEngineMessageFlag.Response)) {
      this.returnUnclaimedBuffer(envelope.header, envelope.buffer);
      pending.reject(new RustEngineServiceError("unexpected-response", `Engine reply ${envelope.header.requestId} is missing the response flag`, false));
      return;
    }
    if (pending.expectedKind !== null && envelope.header.kind !== pending.expectedKind) {
      this.returnUnclaimedBuffer(envelope.header, envelope.buffer);
      pending.reject(new RustEngineServiceError(
        "unexpected-response",
        `Engine request ${envelope.header.requestId} expected ${RustEngineMessageKind[pending.expectedKind]} but received ${RustEngineMessageKind[envelope.header.kind] ?? envelope.header.kind}`,
        false,
      ));
      return;
    }
    const response = new RustEngineResponse(
      envelope.header,
      envelope.buffer,
      envelope.payload,
      (owned, source) => this.releaseResponse(owned, source),
    );
    if (envelope.header.ownershipToken !== BigInt(0) || hasRustEngineFlag(envelope.header, RustEngineMessageFlag.TransfersOwnership)) {
      this.ownedResponses.add(response);
    }
    this.responses += 1;
    pending.resolve(response);
  }

  private releaseResponse(response: RustEngineResponse, source: ArrayBuffer) {
    if (!this.ownedResponses.delete(response)) return;
    this.postBufferRelease(response.header, source);
  }

  private returnUnclaimedBuffer(header: RustEngineEnvelopeHeader, source: ArrayBuffer) {
    if (header.ownershipToken === BigInt(0) && !hasRustEngineFlag(header, RustEngineMessageFlag.TransfersOwnership)) return;
    this.postBufferRelease(header, source);
  }

  private postBufferRelease(header: RustEngineEnvelopeHeader, source: ArrayBuffer) {
    const release = encodeRustEngineEnvelope({
      kind: RustEngineMessageKind.BufferRelease,
      epoch: header.epoch,
      ownershipToken: header.ownershipToken,
    });
    this.returnedBufferBytes += source.byteLength;
    if (!this.worker || this.state === "stopped") return;
    try {
      this.worker.postMessage({ envelope: release, returnedBuffer: source }, [release, source]);
    } catch (error) {
      this.lastError = { code: "worker-failed", message: error instanceof Error ? error.message : String(error) };
    }
  }

  private startHeartbeat() {
    this.stopHeartbeat();
    if (!this.heartbeatIntervalMs) return;
    this.heartbeatTimer = this.scheduleInterval(() => {
      if (!this.ready) return;
      void this.sendRequest(
        RustEngineMessageKind.Heartbeat,
        encodeRustEngineJson({ sentAt: this.now() }),
        RustEngineMessageKind.Heartbeat,
        this.heartbeatTimeoutMs,
        false,
      ).then((response) => {
        this.lastHeartbeatAt = this.now();
        response.release();
      }).catch((error) => {
        const normalized = toServiceError(error);
        this.lastError = { code: normalized.code, message: normalized.message };
        if (this.autoRestart && this.desired) void this.restart("heartbeat-timeout").catch(() => {});
      });
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer !== null) this.cancelInterval(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private handleWorkerFault(error: RustEngineServiceError, generation: number) {
    if (generation !== this.generation) return;
    const shouldRestart = this.autoRestart && this.desired && this.state !== "stopping" && this.state !== "stopped" && this.restarts < this.maximumRestarts;
    this.failures += 1;
    this.lastError = { code: error.code, message: error.message };
    this.state = "failed";
    this.stopHeartbeat();
    this.teardownWorker(error, true);
    if (shouldRestart) {
      this.restarts += 1;
      void this.start().catch(() => {});
    }
  }

  async restart(reason = "manual") {
    if (this.state === "stopping") throw new RustEngineServiceError("service-stopped", "Cannot restart while shutdown is in progress", false);
    this.desired = true;
    const error = new RustEngineServiceError("worker-failed", `Rust engine worker restarting: ${reason}`, true);
    this.stopHeartbeat();
    this.teardownWorker(error, true);
    this.state = "idle";
    this.capabilitiesValue = null;
    this.startPromise = null;
    return this.start();
  }

  async shutdown() {
    if (this.state === "stopped") return;
    this.desired = false;
    this.state = "stopping";
    this.stopHeartbeat();
    for (const response of [...this.ownedResponses]) response.release();
    if (this.worker) {
      try {
        const response = await this.sendRequest(
          RustEngineMessageKind.Shutdown,
          encodeRustEngineJson({ reason: "browser-shutdown" }),
          RustEngineMessageKind.Shutdown,
          Math.min(this.requestTimeoutMs, 1_000),
          true,
        );
        response.release();
      } catch (error) {
        const normalized = toServiceError(error);
        this.lastError = { code: normalized.code, message: normalized.message };
      }
    }
    this.teardownWorker(new RustEngineServiceError("service-stopped", "Rust engine service shut down", true), true);
    this.capabilitiesValue = null;
    this.state = "stopped";
  }

  private teardownWorker(error: RustEngineServiceError, rejectPending: boolean) {
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.onmessageerror = null;
      this.worker.terminate();
      this.worker = null;
    }
    if (rejectPending) {
      for (const pending of this.pending.values()) {
        this.cancelTimeout(pending.timer);
        pending.reject(error);
      }
      this.pending.clear();
    }
  }

  diagnostics() {
    const now = this.now();
    const pendingOldestMs = [...this.pending.values()].reduce((oldest, pending) => Math.max(oldest, now - pending.sentAt), 0);
    return {
      state: this.state,
      ready: this.ready,
      capabilities: this.capabilitiesValue,
      requests: this.requests,
      responses: this.responses,
      pending: this.pending.size,
      pendingOldestMs,
      timeouts: this.timeouts,
      failures: this.failures,
      restarts: this.restarts,
      staleResponses: this.staleResponses,
      transferredToWorkerBytes: this.transferredToWorkerBytes,
      transferredFromWorkerBytes: this.transferredFromWorkerBytes,
      returnedBufferBytes: this.returnedBufferBytes,
      outstandingOwnedBuffers: this.ownedResponses.size,
      outstandingOwnedBytes: [...this.ownedResponses].reduce((total, response) => total + response.byteLength, 0),
      epoch: this.epoch,
      generation: this.generation,
      lastHeartbeatAt: this.lastHeartbeatAt,
      lastError: this.lastError,
    } as const;
  }
}
