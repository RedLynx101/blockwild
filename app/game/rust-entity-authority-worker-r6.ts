import {
  RUST_ENTITY_AUTHORITY_PROTOCOL_R6_V1,
  RUST_ENTITY_COMMAND_SCHEMA_R6_V1,
  RUST_ENTITY_MAX_COMMANDS_PER_BATCH_R6,
  RUST_ENTITY_MAX_SNAPSHOT_BYTES_R6,
  type RustEntityAuthorityKernelR6,
  type RustEntityAuthorityRequestR6,
  type RustEntityAuthorityResponseR6,
  type RustEntityAuthorityTransportR6,
  type RustEntityCommandBatchR6,
} from "./rust-entity-authority-contract-r6";
import {
  decodeRustEntityAuthoritySnapshotR6V2,
  decodeRustEntityCompatibilityRecordR6V1,
  validateRustEntityCompatibilityRecordR6V1,
  validateRustEntityComponentsR6,
} from "./rust-entity-authority-codec-r6";

const COMMAND_TYPES = new Set([
  "spawn", "spawn-typed", "spawn-at", "spawn-typed-at", "despawn", "hibernate", "wake", "update-motion",
  "set-simulation-tier", "set-protection", "set-vitals-environment", "set-locomotion-body", "set-ai-state",
  "set-social-state", "set-mount-state", "set-protection-provenance", "set-network-authority", "set-care-state",
  "set-husbandry-state", "set-work-state", "set-equipment", "set-dragon-state", "set-legendary-state",
  "set-summon-state", "set-sentient-state", "replace-components", "replace-compatibility-record", "set-range-state",
  "set-dormant-summary",
]);
const EVENT_TYPES = new Set([
  "spawned", "despawned", "residency-changed", "motion-updated", "tier-changed", "protection-changed",
  "vitals-environment-changed", "locomotion-changed", "ai-changed", "social-changed", "mount-changed",
  "network-authority-changed", "care-changed", "husbandry-changed", "work-changed", "equipment-changed",
  "dragon-changed", "legendary-changed", "summon-changed", "sentient-changed", "components-replaced",
  "compatibility-record-changed", "range-state-changed", "dormant-summary-changed",
]);
const U64_MODULUS = BigInt(1) << BigInt(64);
const wireTextEncoder = new TextEncoder();

function requireU32(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) throw new TypeError(`${label} is not a u32`);
}

function requireU64(value: bigint, label: string) {
  if (typeof value !== "bigint" || value < BigInt(0) || value >= (BigInt(1) << BigInt(64))) throw new TypeError(`${label} is not a u64`);
}

function estimateStructuredBytes(value: unknown, remaining = RUST_ENTITY_MAX_SNAPSHOT_BYTES_R6, active = new WeakSet<object>()): number {
  if (remaining < 0) throw new RangeError("R6 entity request exceeds 64 MiB");
  if (value === null || value === undefined || typeof value === "boolean") return 1;
  if (typeof value === "number" || typeof value === "bigint") return 8;
  if (typeof value === "string") return wireTextEncoder.encode(value).byteLength + 4;
  if (value instanceof ArrayBuffer) return value.byteLength;
  if (ArrayBuffer.isView(value)) return value.byteLength;
  if (typeof value !== "object") throw new TypeError("R6 entity request contains an unsupported value");
  if (active.has(value)) throw new TypeError("R6 entity request contains a cycle");
  active.add(value);
  let total = 4;
  const entries = Array.isArray(value) ? value.map((item, index) => [String(index), item] as const) : Object.entries(value);
  for (const [key, item] of entries) {
    total += wireTextEncoder.encode(key).byteLength + 4;
    total += estimateStructuredBytes(item, remaining - total, active);
    if (total > remaining) throw new RangeError("R6 entity request exceeds 64 MiB");
  }
  active.delete(value);
  return total;
}

export function assertRustEntityCommandBatchR6(batch: RustEntityCommandBatchR6) {
  if (!batch || batch.schema !== RUST_ENTITY_COMMAND_SCHEMA_R6_V1) throw new TypeError("R6 entity command schema is incompatible");
  requireU64(batch.sequence, "entity sequence");
  requireU64(batch.expectedRevision, "entity expected revision");
  requireU64(batch.tick, "entity tick");
  if (!Array.isArray(batch.commands) || batch.commands.length > RUST_ENTITY_MAX_COMMANDS_PER_BATCH_R6) {
    throw new RangeError("R6 entity command batch exceeds 4096 commands");
  }
  for (const command of batch.commands) {
    if (!command || !COMMAND_TYPES.has(command.type)) throw new TypeError("R6 entity command has an unknown variant");
    if ("id" in command) requireU64(command.id, "entity id");
    if (command.type === "spawn" || command.type === "spawn-at" || command.type === "spawn-typed" || command.type === "spawn-typed-at") {
      validateRustEntityCompatibilityRecordR6V1(command.record);
    }
    if (command.type === "spawn-typed" || command.type === "spawn-typed-at") validateRustEntityComponentsR6(command.components);
    if (command.type === "replace-components") validateRustEntityComponentsR6(command.value);
    if (command.type === "replace-compatibility-record") validateRustEntityCompatibilityRecordR6V1(command.value);
  }
  estimateStructuredBytes(batch);
  return batch;
}

export function assertRustEntityAuthorityRequestR6(request: RustEntityAuthorityRequestR6) {
  if (!request || request.protocolVersion !== RUST_ENTITY_AUTHORITY_PROTOCOL_R6_V1 || request.schemaVersion !== 1) {
    throw new TypeError("R6 entity request has an incompatible protocol or schema");
  }
  requireU32(request.requestId, "entity request id");
  requireU32(request.runtimeEpoch, "entity runtime epoch");
  if (request.type === "entity-apply-r6-v1") assertRustEntityCommandBatchR6(request.batch);
  else if (request.type === "entity-export-snapshot-r6-v1") requireU64(request.expectedRevision, "entity expected revision");
  else if (request.type === "entity-replace-snapshot-r6-v1") {
    requireU64(request.expectedRevision, "entity expected revision");
    if (!(request.bytes instanceof ArrayBuffer) || request.bytes.byteLength > RUST_ENTITY_MAX_SNAPSHOT_BYTES_R6) throw new RangeError("R6 replacement snapshot exceeds 64 MiB");
    decodeRustEntityAuthoritySnapshotR6V2(request.bytes);
  } else if (request.type === "entity-initialize-r6-v1") {
    if (request.source === "empty") {
      if (request.bytes !== undefined) throw new TypeError("empty R6 initialization cannot include bytes");
    } else {
      if (!(request.bytes instanceof ArrayBuffer) || request.bytes.byteLength > RUST_ENTITY_MAX_SNAPSHOT_BYTES_R6) throw new RangeError("R6 initialization payload exceeds 64 MiB");
      if (request.source === "snapshot") decodeRustEntityAuthoritySnapshotR6V2(request.bytes);
      else if (request.source === "compatibility") decodeRustEntityCompatibilityRecordR6V1(request.bytes);
      else throw new TypeError("R6 initialization source is invalid");
    }
  } else if (request.type !== "entity-dispose-r6-v1") {
    const neverRequest: never = request;
    throw new TypeError(`unknown R6 entity request ${(neverRequest as { type?: unknown }).type as string}`);
  }
  return request;
}

export function assertRustEntityAuthorityResponseR6(response: RustEntityAuthorityResponseR6, request: RustEntityAuthorityRequestR6) {
  if (!response || response.protocolVersion !== 1 || response.schemaVersion !== 1 || response.requestId !== request.requestId || response.runtimeEpoch !== request.runtimeEpoch) {
    throw new TypeError("R6 entity response identity does not match its request");
  }
  if (response.type === "entity-error-r6-v1") {
    if (typeof response.code !== "string" || typeof response.message !== "string" || typeof response.retriable !== "boolean") throw new TypeError("R6 entity error is malformed");
    return response;
  }
  const expected = request.type === "entity-initialize-r6-v1" ? "entity-ready-r6-v1"
    : request.type === "entity-apply-r6-v1" ? "entity-events-r6-v1"
      : request.type === "entity-export-snapshot-r6-v1" ? "entity-snapshot-r6-v1"
        : request.type === "entity-replace-snapshot-r6-v1" ? "entity-snapshot-replaced-r6-v1"
          : "entity-disposed-r6-v1";
  if (response.type !== expected) throw new TypeError(`R6 entity response ${response.type} does not match ${request.type}`);
  if (response.type === "entity-snapshot-r6-v1") {
    if (!(response.bytes instanceof ArrayBuffer) || response.bytes.byteLength > RUST_ENTITY_MAX_SNAPSHOT_BYTES_R6) throw new RangeError("R6 entity response snapshot exceeds 64 MiB");
    const snapshot = decodeRustEntityAuthoritySnapshotR6V2(response.bytes);
    if (snapshot.revision !== response.revision) throw new TypeError("R6 entity response revision diverges from its snapshot");
  }
  if (response.type === "entity-events-r6-v1") {
    if (response.result.schema !== 1) throw new TypeError("R6 entity event schema is incompatible");
    if (request.type !== "entity-apply-r6-v1" || response.result.sequence !== request.batch.sequence) throw new TypeError("R6 entity event sequence diverges from its command batch");
    const expectedRevision = (response.result.previousRevision + BigInt(1)) % U64_MODULUS;
    if (response.result.previousRevision !== request.batch.expectedRevision || response.result.revision !== expectedRevision) throw new TypeError("R6 entity event revisions do not match the atomic batch revision");
    if (response.result.events.length > RUST_ENTITY_MAX_COMMANDS_PER_BATCH_R6) throw new RangeError("R6 entity event batch exceeds its bound");
    for (const event of response.result.events) {
      requireU32(event.commandIndex, "entity event command index");
      if (event.commandIndex >= request.batch.commands.length) throw new RangeError("R6 entity event references a missing command");
      requireU64(event.entityId, "entity event id");
      requireU64(event.previousEntityRevision, "previous entity revision");
      requireU64(event.entityRevision, "entity revision");
      if (!event.kind || !EVENT_TYPES.has(event.kind.type)) throw new TypeError("R6 entity event has an unknown variant");
    }
  }
  return response;
}

export function rustEntityAuthorityRequestTransferListR6(request: RustEntityAuthorityRequestR6) {
  if ((request.type === "entity-initialize-r6-v1" || request.type === "entity-replace-snapshot-r6-v1") && request.bytes) return [request.bytes] as const;
  return [] as const;
}

export function rustEntityAuthorityResponseTransferListR6(response: RustEntityAuthorityResponseR6) {
  return response.type === "entity-snapshot-r6-v1" ? [response.bytes] as const : [] as const;
}

export interface RustEntityAuthorityWorkerPortR6 {
  postMessage(message: RustEntityAuthorityRequestR6, transfer?: readonly ArrayBuffer[]): void;
  addEventListener(type: "message", listener: (event: Readonly<{ data: RustEntityAuthorityResponseR6 }>) => void): void;
  removeEventListener(type: "message", listener: (event: Readonly<{ data: RustEntityAuthorityResponseR6 }>) => void): void;
  terminate?(): void;
}

type Pending = Readonly<{
  request: RustEntityAuthorityRequestR6;
  resolve: (value: RustEntityAuthorityResponseR6) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}>;

export class RustEntityAuthorityWorkerTransportR6 implements RustEntityAuthorityTransportR6 {
  private readonly pending = new Map<number, Pending>();
  private disposed = false;

  private readonly receive = (event: Readonly<{ data: RustEntityAuthorityResponseR6 }>) => {
    const response = event.data;
    const requestId = typeof response?.requestId === "number" ? response.requestId : -1;
    const pending = this.pending.get(requestId);
    if (!pending) { this.options.onStaleResult?.(response); return; }
    if (response.runtimeEpoch !== pending.request.runtimeEpoch) { this.options.onStaleResult?.(response); return; }
    this.pending.delete(requestId);
    clearTimeout(pending.timeout);
    try { pending.resolve(assertRustEntityAuthorityResponseR6(response, pending.request)); }
    catch (error) { pending.reject(error instanceof Error ? error : new Error(String(error))); }
  };

  private readonly failWorker = (event: unknown) => {
    const message = (event as { message?: unknown })?.message;
    const error = new Error(typeof message === "string" ? message : "R6 entity worker crashed");
    for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(error); }
    this.pending.clear();
    this.options.onFatal?.(error);
  };

  constructor(
    private readonly worker: RustEntityAuthorityWorkerPortR6,
    private readonly options: Readonly<{
      timeoutMs?: number;
      onFatal?: (error: Error) => void;
      onStaleResult?: (response: RustEntityAuthorityResponseR6) => void;
    }> = {},
  ) {
    worker.addEventListener("message", this.receive);
    const errorTarget = worker as unknown as { addEventListener(type: "error" | "messageerror", listener: (event: unknown) => void): void };
    errorTarget.addEventListener?.("error", this.failWorker);
    errorTarget.addEventListener?.("messageerror", this.failWorker);
  }

  request(request: RustEntityAuthorityRequestR6, transfer: readonly ArrayBuffer[] = []) {
    if (this.disposed) return Promise.reject(new Error("R6 entity worker transport is disposed"));
    try { assertRustEntityAuthorityRequestR6(request); } catch (error) { return Promise.reject(error); }
    if (this.pending.has(request.requestId)) return Promise.reject(new Error(`duplicate R6 entity request ${request.requestId}`));
    return new Promise<RustEntityAuthorityResponseR6>((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!this.pending.delete(request.requestId)) return;
        const error = new Error(`R6 entity request ${request.requestId} timed out`);
        reject(error);
        this.options.onFatal?.(error);
      }, this.options.timeoutMs ?? 15_000);
      this.pending.set(request.requestId, { request, resolve, reject, timeout });
      try { this.worker.postMessage(request, transfer); }
      catch (error) { this.pending.delete(request.requestId); clearTimeout(timeout); reject(error instanceof Error ? error : new Error(String(error))); }
    });
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.removeEventListener("message", this.receive);
    const errorTarget = this.worker as unknown as { removeEventListener(type: "error" | "messageerror", listener: (event: unknown) => void): void };
    errorTarget.removeEventListener?.("error", this.failWorker);
    errorTarget.removeEventListener?.("messageerror", this.failWorker);
    this.worker.terminate?.();
    for (const pending of this.pending.values()) { clearTimeout(pending.timeout); pending.reject(new Error("R6 entity worker transport disposed")); }
    this.pending.clear();
  }
}

export function installRustEntityAuthorityWorkerHandlerR6(
  scope: Readonly<{
    addEventListener(type: "message", listener: (event: Readonly<{ data: RustEntityAuthorityRequestR6 }>) => void): void;
    postMessage(message: RustEntityAuthorityResponseR6, transfer?: readonly ArrayBuffer[]): void;
  }>,
  kernel: RustEntityAuthorityKernelR6,
) {
  let tail = Promise.resolve();
  scope.addEventListener("message", (event) => {
    tail = tail.then(async () => {
      let response: RustEntityAuthorityResponseR6;
      try {
        const request = assertRustEntityAuthorityRequestR6(event.data);
        response = assertRustEntityAuthorityResponseR6(await kernel.handle(request), request);
      } catch (error) {
        const request = event.data;
        response = {
          protocolVersion: 1,
          schemaVersion: 1,
          requestId: Number.isSafeInteger(request?.requestId) ? request.requestId : 0,
          runtimeEpoch: Number.isSafeInteger(request?.runtimeEpoch) ? request.runtimeEpoch : 0,
          type: "entity-error-r6-v1",
          code: "kernel-error",
          message: error instanceof Error ? error.message : String(error),
          retriable: false,
        };
      }
      scope.postMessage(response, rustEntityAuthorityResponseTransferListR6(response));
      if (event.data.type === "entity-dispose-r6-v1") await kernel.dispose?.();
    });
  });
}
