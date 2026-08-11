import {
  MESH_PACKET_SCHEMA_V1,
  SECTION_SNAPSHOT_SCHEMA_V1,
  TERRAIN_MESH_PROTOCOL_V1,
  assertMeshPacketMatchesSnapshotV1,
  assertSectionSnapshotV1,
  cloneSectionSnapshotV1,
  meshPacketTransferListV1,
  releaseMeshPacketBuffersV1,
  sectionSnapshotTransferListV1,
  terrainSectionAddressKeyV1,
  terrainSectionRevisionKeyV1,
  type MeshPacketV1,
  type SectionSnapshotV1,
  type TerrainBufferPool,
  type TerrainBufferPurpose,
  type TerrainSectionRevisionV1,
} from "./terrain-mesh-contract";
import {
  TerrainMesherBackendError,
  staleTerrainMeshResult,
  throwIfTerrainMeshAborted,
  type TerrainMeshReadyResult,
  type TerrainMesherBackend,
  type TerrainMesherDiagnostics,
  type TerrainMesherFailureCode,
  type TerrainMesherRequestOptions,
  type TerrainMesherResult,
} from "./terrain-mesher-backend";
import type { RustEngineArtifact } from "./rust-engine-loader";

export interface TerrainMesherWorkerLike {
  onmessage: ((event: MessageEvent<TerrainMesherWorkerResponseV1>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
  postMessage(message: TerrainMesherWorkerRequestV1, transfer?: Transferable[]): void;
  terminate(): void;
}

export type TerrainMesherWorkerHelloV1 = Readonly<{
  type: "terrain-mesher-hello-v1";
  protocolVersion: typeof TERRAIN_MESH_PROTOCOL_V1;
  snapshotSchemaVersion: typeof SECTION_SNAPSHOT_SCHEMA_V1;
  meshSchemaVersion: typeof MESH_PACKET_SCHEMA_V1;
  artifact?: RustEngineArtifact;
}>;

export type TerrainMesherWorkerMeshRequestV1 = Readonly<{
  type: "terrain-mesh-section-v1";
  requestId: number;
  snapshot: SectionSnapshotV1;
}>;

export type TerrainMesherWorkerShutdownV1 = Readonly<{ type: "terrain-mesher-shutdown-v1" }>;

export type TerrainMesherWorkerRequestV1 =
  | TerrainMesherWorkerHelloV1
  | TerrainMesherWorkerMeshRequestV1
  | TerrainMesherWorkerShutdownV1;

export type TerrainMesherWorkerReadyV1 = Readonly<{
  type: "terrain-mesher-ready-v1";
  protocolVersion: number;
  snapshotSchemaVersion: number;
  meshSchemaVersion: number;
  backend: "rust-wasm";
}>;

export type TerrainMesherWorkerResultV1 = Readonly<{
  type: "terrain-mesh-result-v1";
  requestId: number;
  packet: MeshPacketV1;
  /** Optional input buffers returned in the exact request transfer-list order. */
  returnedInputBuffers?: readonly ArrayBuffer[];
}>;

export type TerrainMesherWorkerTaskErrorV1 = Readonly<{
  type: "terrain-mesh-task-error-v1";
  requestId: number;
  message: string;
  recoverable: boolean;
  code?: "ineligible-section" | "task-error";
  returnedInputBuffers?: readonly ArrayBuffer[];
}>;

export type TerrainMesherWorkerFatalV1 = Readonly<{
  type: "terrain-mesher-fatal-v1";
  message: string;
}>;

export type TerrainMesherWorkerResponseV1 =
  | TerrainMesherWorkerReadyV1
  | TerrainMesherWorkerResultV1
  | TerrainMesherWorkerTaskErrorV1
  | TerrainMesherWorkerFatalV1;

export type RustTerrainMesherOptions = Readonly<{
  /** Override used by tests or hosts that supply their own worker lifecycle. */
  workerFactory?: () => TerrainMesherWorkerLike;
  artifact?: RustEngineArtifact;
  fallback: TerrainMesherBackend;
  bufferPool?: TerrainBufferPool;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  maximumRestarts?: number;
  autoRestart?: boolean;
  ownsFallback?: boolean;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
}>;

type TransferDescriptor = Readonly<{ purpose: TerrainBufferPurpose; byteLength: number }>;

type PendingRequest = {
  snapshot: SectionSnapshotV1;
  options: TerrainMesherRequestOptions;
  generation: number;
  resolve: (result: TerrainMesherResult) => void;
  reject: (error: unknown) => void;
  timer: ReturnType<typeof setTimeout>;
  abortListener?: () => void;
  transferredInputs: readonly TransferDescriptor[];
  startedAt: number;
};

const SNAPSHOT_TRANSFER_PURPOSES = [
  "snapshot-blocks",
  "snapshot-light",
  "snapshot-facing",
  "snapshot-hidden",
  "snapshot-fluidLevel",
  "snapshot-fluidFlags",
  "snapshot-biomes",
] as const satisfies readonly TerrainBufferPurpose[];

function normalizedError(error: unknown, code: TerrainMesherFailureCode) {
  return error instanceof TerrainMesherBackendError
    ? error
    : new TerrainMesherBackendError(code, error instanceof Error ? error.message : String(error), true, error);
}

export function createRustTerrainMesherWorker(): TerrainMesherWorkerLike {
  if (typeof Worker !== "function") throw new TerrainMesherBackendError("worker-unavailable", "Web Workers are unavailable", true);
  return new Worker(new URL("./rust-terrain-mesher-worker.ts", import.meta.url), { type: "module", name: "blockwild-rust-terrain" });
}

/**
 * Coarse whole-section Rust worker adapter. Every worker failure delegates to
 * the exact TypeScript reference backend with the original, non-detached
 * snapshot; callers separately decide whether an eligible result is promoted.
 */
export class RustTerrainMesherBackend implements TerrainMesherBackend {
  readonly kind = "rust-worker-shadow" as const;
  readonly bufferPool?: TerrainBufferPool;
  private readonly workerFactory?: () => TerrainMesherWorkerLike;
  private readonly artifact?: RustEngineArtifact;
  private readonly fallback: TerrainMesherBackend;
  private readonly startupTimeoutMs: number;
  private readonly requestTimeoutMs: number;
  private readonly maximumRestarts: number;
  private readonly autoRestart: boolean;
  private readonly ownsFallback: boolean;
  private readonly scheduleTimeout: typeof globalThis.setTimeout;
  private readonly cancelTimeout: typeof globalThis.clearTimeout;
  private worker: TerrainMesherWorkerLike | null = null;
  private workerState: "idle" | "starting" | "ready" | "failed" | "disposed" = "idle";
  private workerGeneration = 0;
  private startPromise: Promise<void> | null = null;
  private startupResolve: (() => void) | null = null;
  private startupReject: ((error: unknown) => void) | null = null;
  private startupTimer: ReturnType<typeof setTimeout> | null = null;
  private nextRequestId = 1;
  private pending = new Map<number, PendingRequest>();
  private latestRevision = new Map<string, string>();
  private submitted = 0;
  private completed = 0;
  private failed = 0;
  private stale = 0;
  private aborted = 0;
  private fallbackCount = 0;
  private workerRestarts = 0;
  private transferredToWorkerBytes = 0;
  private transferredFromWorkerBytes = 0;
  private returnedInputBytes = 0;
  private readonly requestDurationsMilliseconds: number[] = [];
  private lastError: TerrainMesherDiagnostics["lastError"] = null;

  constructor(options: RustTerrainMesherOptions) {
    this.workerFactory = options.workerFactory ?? (typeof Worker === "function" ? createRustTerrainMesherWorker : undefined);
    this.artifact = options.artifact;
    this.fallback = options.fallback;
    this.bufferPool = options.bufferPool;
    this.startupTimeoutMs = Math.max(1, options.startupTimeoutMs ?? 4_000);
    this.requestTimeoutMs = Math.max(1, options.requestTimeoutMs ?? 5_000);
    this.maximumRestarts = Math.max(0, options.maximumRestarts ?? 1);
    this.autoRestart = options.autoRestart ?? true;
    this.ownsFallback = options.ownsFallback ?? false;
    this.scheduleTimeout = options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
    this.cancelTimeout = options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
  }

  async mesh(snapshot: SectionSnapshotV1, options: TerrainMesherRequestOptions = {}): Promise<TerrainMesherResult> {
    this.submitted += 1;
    if (this.workerState === "disposed") {
      this.failed += 1;
      throw new TerrainMesherBackendError("backend-disposed", "Rust terrain mesher is disposed", false);
    }
    try {
      assertSectionSnapshotV1(snapshot);
    } catch (error) {
      this.failed += 1;
      this.lastError = { code: "invalid-snapshot", message: error instanceof Error ? error.message : String(error) };
      throw new TerrainMesherBackendError("invalid-snapshot", this.lastError.message, false, error);
    }
    try {
      throwIfTerrainMeshAborted(options.signal);
    } catch (error) {
      this.aborted += 1;
      throw error;
    }
    const addressKey = terrainSectionAddressKeyV1(snapshot.address);
    const revisionKey = terrainSectionRevisionKeyV1(snapshot.revision);
    this.latestRevision.set(addressKey, revisionKey);

    if (!this.workerFactory) return this.runFallback(snapshot, options, "worker-unavailable");
    try {
      await this.ensureWorker();
    } catch (error) {
      const normalized = normalizedError(error, "worker-startup");
      return this.runFallback(snapshot, options, normalized.code);
    }
    const stale = this.staleResultFor(snapshot, options, this.workerGeneration);
    if (stale) { this.stale += 1; return stale; }
    return this.submitWorkerRequest(snapshot, options);
  }

  private ensureWorker() {
    if (this.workerState === "ready" && this.worker) return Promise.resolve();
    if (this.startPromise) return this.startPromise;
    if (this.workerState === "failed" && (!this.autoRestart || this.workerRestarts > this.maximumRestarts)) {
      return Promise.reject(new TerrainMesherBackendError("worker-unavailable", "Rust terrain mesher exhausted its restart budget", true));
    }
    this.workerState = "starting";
    const generation = ++this.workerGeneration;
    this.startPromise = new Promise<void>((resolve, reject) => {
      this.startupResolve = resolve;
      this.startupReject = reject;
      try {
        const worker = this.workerFactory!();
        this.worker = worker;
        worker.onmessage = (event) => this.handleMessage(event.data, generation);
        worker.onerror = (event) => this.handleWorkerFault(
          new TerrainMesherBackendError("worker-crash", event.message || "Rust terrain mesher worker crashed", true, event),
          generation,
        );
        worker.onmessageerror = (event) => this.handleWorkerFault(
          new TerrainMesherBackendError("worker-message", "Rust terrain mesher worker produced an unreadable message", true, event),
          generation,
        );
        this.startupTimer = this.scheduleTimeout(() => this.handleWorkerFault(
          new TerrainMesherBackendError("worker-startup", `Rust terrain mesher did not become ready within ${this.startupTimeoutMs} ms`, true),
          generation,
        ), this.startupTimeoutMs);
        worker.postMessage({
          type: "terrain-mesher-hello-v1",
          protocolVersion: TERRAIN_MESH_PROTOCOL_V1,
          snapshotSchemaVersion: SECTION_SNAPSHOT_SCHEMA_V1,
          meshSchemaVersion: MESH_PACKET_SCHEMA_V1,
          ...(this.artifact ? { artifact: this.artifact } : {}),
        });
      } catch (error) {
        this.handleWorkerFault(normalizedError(error, "worker-startup"), generation);
      }
    }).finally(() => { this.startPromise = null; });
    return this.startPromise;
  }

  private submitWorkerRequest(snapshot: SectionSnapshotV1, options: TerrainMesherRequestOptions) {
    if (!this.worker || this.workerState !== "ready") return this.runFallback(snapshot, options, "worker-unavailable");
    const requestId = this.nextRequestId++;
    let transferredSnapshot: SectionSnapshotV1;
    let transfer: ArrayBuffer[];
    try {
      transferredSnapshot = cloneSectionSnapshotV1(snapshot, this.bufferPool);
      transfer = sectionSnapshotTransferListV1(transferredSnapshot);
    } catch (error) {
      this.failed += 1;
      this.lastError = { code: "protocol-error", message: error instanceof Error ? error.message : String(error) };
      return this.runFallback(snapshot, options, "protocol-error");
    }
    const transferDescriptors = transfer.map((buffer, index) => ({
      purpose: SNAPSHOT_TRANSFER_PURPOSES[index],
      byteLength: buffer.byteLength,
    }));
    this.transferredToWorkerBytes += transferDescriptors.reduce((total, entry) => total + entry.byteLength, 0);
    const generation = this.workerGeneration;
    return new Promise<TerrainMesherResult>((resolve, reject) => {
      const timer = this.scheduleTimeout(() => this.handleWorkerFault(
        new TerrainMesherBackendError("request-timeout", `Rust terrain mesh request ${requestId} timed out after ${this.requestTimeoutMs} ms`, true),
        generation,
      ), this.requestTimeoutMs);
      const pending: PendingRequest = {
        snapshot,
        options,
        generation,
        resolve,
        reject,
        timer,
        transferredInputs: transferDescriptors,
        startedAt: performance.now(),
      };
      if (options.signal) {
        pending.abortListener = () => {
          if (!this.pending.delete(requestId)) return;
          this.cancelTimeout(timer);
          this.aborted += 1;
          reject(new TerrainMesherBackendError("aborted", "Terrain mesh request was aborted", true));
        };
        options.signal.addEventListener("abort", pending.abortListener, { once: true });
      }
      this.pending.set(requestId, pending);
      try {
        this.worker!.postMessage({ type: "terrain-mesh-section-v1", requestId, snapshot: transferredSnapshot }, transfer);
      } catch (error) {
        this.handleWorkerFault(normalizedError(error, "worker-crash"), generation);
      }
    });
  }

  private handleMessage(message: TerrainMesherWorkerResponseV1, generation: number) {
    if (generation !== this.workerGeneration || this.workerState === "disposed") return;
    if (message.type === "terrain-mesher-fatal-v1") {
      this.handleWorkerFault(new TerrainMesherBackendError("worker-startup", message.message || "Rust terrain worker could not start", true), generation);
      return;
    }
    if (message.type === "terrain-mesher-ready-v1") {
      const valid = message.protocolVersion === TERRAIN_MESH_PROTOCOL_V1
        && message.snapshotSchemaVersion === SECTION_SNAPSHOT_SCHEMA_V1
        && message.meshSchemaVersion === MESH_PACKET_SCHEMA_V1
        && message.backend === "rust-wasm";
      if (!valid) {
        this.handleWorkerFault(new TerrainMesherBackendError("protocol-error", "Rust terrain mesher negotiated an incompatible protocol", false), generation);
        return;
      }
      this.clearStartupTimer();
      this.workerState = "ready";
      this.startupResolve?.();
      this.startupResolve = null;
      this.startupReject = null;
      this.lastError = null;
      return;
    }
    if (message.type !== "terrain-mesh-result-v1" && message.type !== "terrain-mesh-task-error-v1") {
      this.handleWorkerFault(new TerrainMesherBackendError("protocol-error", "Rust terrain mesher returned an unknown message", false), generation);
      return;
    }
    const pending = this.pending.get(message.requestId);
    if (!pending) {
      this.stale += 1;
      if (message.type === "terrain-mesh-result-v1" && this.bufferPool) {
        try { releaseMeshPacketBuffersV1(message.packet, this.bufferPool); } catch { /* malformed stale output has no safe pool path */ }
      }
      return;
    }
    this.pending.delete(message.requestId);
    this.finishPending(pending);
    this.recordRequestDuration(performance.now() - pending.startedAt);
    this.releaseReturnedInputs(pending, message.returnedInputBuffers);
    if (message.type === "terrain-mesh-task-error-v1") {
      const code = message.code ?? "task-error";
      if (code !== "ineligible-section") this.failed += 1;
      this.lastError = { code, message: message.message || "Rust terrain mesher rejected a task" };
      void this.runFallback(pending.snapshot, pending.options, code).then(pending.resolve, pending.reject);
      return;
    }
    try {
      assertMeshPacketMatchesSnapshotV1(message.packet, pending.snapshot);
      const packetBuffers = meshPacketTransferListV1(message.packet);
      this.transferredFromWorkerBytes += packetBuffers.reduce((total, buffer) => total + buffer.byteLength, 0);
    } catch (error) {
      this.failed += 1;
      this.lastError = { code: "invalid-packet", message: error instanceof Error ? error.message : String(error) };
      void this.runFallback(pending.snapshot, pending.options, "invalid-packet").then(pending.resolve, pending.reject);
      return;
    }
    const stale = this.staleResultFor(pending.snapshot, pending.options, pending.generation);
    if (stale) {
      this.stale += 1;
      if (this.bufferPool) releaseMeshPacketBuffersV1(message.packet, this.bufferPool);
      pending.resolve(stale);
      return;
    }
    this.completed += 1;
    this.lastError = null;
    pending.resolve({ status: "ready", packet: message.packet, backend: this.kind });
  }

  private staleResultFor(snapshot: SectionSnapshotV1, options: TerrainMesherRequestOptions, generation: number) {
    const addressKey = terrainSectionAddressKeyV1(snapshot.address);
    const revisionKey = terrainSectionRevisionKeyV1(snapshot.revision);
    if (generation !== this.workerGeneration) {
      return staleTerrainMeshResult(this.kind, snapshot, "worker-generation-changed", this.currentRevision(snapshot, options));
    }
    const current = this.currentRevision(snapshot, options);
    if (options.currentRevision && (current === null || terrainSectionRevisionKeyV1(current) !== revisionKey)) {
      return staleTerrainMeshResult(this.kind, snapshot, "authority-revision-changed", current);
    }
    if (this.latestRevision.get(addressKey) !== revisionKey) {
      return staleTerrainMeshResult(this.kind, snapshot, "superseded-request", current);
    }
    return null;
  }

  private currentRevision(snapshot: SectionSnapshotV1, options: TerrainMesherRequestOptions): TerrainSectionRevisionV1 | null {
    return options.currentRevision ? options.currentRevision(snapshot.address) : snapshot.revision;
  }

  private async runFallback(
    snapshot: SectionSnapshotV1,
    options: TerrainMesherRequestOptions,
    reason: TerrainMesherFailureCode,
  ): Promise<TerrainMesherResult> {
    this.fallbackCount += 1;
    this.lastError ??= { code: reason, message: `Rust terrain mesher used the TypeScript reference path (${reason})` };
    const result = await this.fallback.mesh(snapshot, options);
    if (result.status === "stale") return result;
    this.completed += 1;
    return {
      ...result,
      fallbackFrom: this.kind,
      fallbackReason: reason,
    } satisfies TerrainMeshReadyResult;
  }

  private releaseReturnedInputs(pending: PendingRequest, returned: readonly ArrayBuffer[] | undefined) {
    if (!returned?.length) return;
    if (!this.bufferPool || returned.length !== pending.transferredInputs.length) {
      this.lastError = { code: "protocol-error", message: "Rust terrain mesher returned an invalid input-buffer list" };
      return;
    }
    for (let index = 0; index < returned.length; index += 1) {
      const buffer = returned[index];
      const descriptor = pending.transferredInputs[index];
      if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== descriptor.byteLength) {
        this.lastError = { code: "protocol-error", message: "Rust terrain mesher returned an input buffer with the wrong size" };
        continue;
      }
      this.returnedInputBytes += buffer.byteLength;
      this.transferredFromWorkerBytes += buffer.byteLength;
      this.bufferPool.release(buffer, descriptor.purpose);
    }
  }

  private handleWorkerFault(error: TerrainMesherBackendError, generation: number) {
    if (generation !== this.workerGeneration || this.workerState === "disposed") return;
    this.lastError = { code: error.code, message: error.message };
    this.clearStartupTimer();
    this.startupReject?.(error);
    this.startupResolve = null;
    this.startupReject = null;
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.onmessageerror = null;
      this.worker.terminate();
      this.worker = null;
    }
    this.workerGeneration += 1;
    if (this.autoRestart && this.workerRestarts < this.maximumRestarts) {
      this.workerRestarts += 1;
      this.workerState = "idle";
    } else this.workerState = "failed";
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const request of pending) {
      this.finishPending(request);
      this.failed += 1;
      void this.runFallback(request.snapshot, request.options, error.code).then(request.resolve, request.reject);
    }
  }

  private finishPending(pending: PendingRequest) {
    this.cancelTimeout(pending.timer);
    if (pending.abortListener) pending.options.signal?.removeEventListener("abort", pending.abortListener);
  }

  private recordRequestDuration(milliseconds: number) {
    this.requestDurationsMilliseconds.push(Math.max(0, milliseconds));
    if (this.requestDurationsMilliseconds.length > 512) this.requestDurationsMilliseconds.shift();
  }

  /** Explicit audit hook used only by the opt-in R2 browser recovery harness. */
  simulateWorkerCrashForDiagnostics(message = "simulated R2 terrain worker crash") {
    if (!this.worker || (this.workerState !== "ready" && this.workerState !== "starting")) return false;
    this.handleWorkerFault(new TerrainMesherBackendError("worker-crash", message, true), this.workerGeneration);
    return true;
  }

  private clearStartupTimer() {
    if (this.startupTimer !== null) this.cancelTimeout(this.startupTimer);
    this.startupTimer = null;
  }

  diagnostics(): TerrainMesherDiagnostics {
    const durations = [...this.requestDurationsMilliseconds].sort((left, right) => left - right);
    const percentile = (fraction: number) => durations.length
      ? durations[Math.min(durations.length - 1, Math.ceil(durations.length * fraction) - 1)]
      : 0;
    return {
      kind: this.kind,
      disposed: this.workerState === "disposed",
      submitted: this.submitted,
      completed: this.completed,
      failed: this.failed,
      stale: this.stale,
      aborted: this.aborted,
      pending: this.pending.size,
      fallback: this.fallbackCount,
      workerRestarts: this.workerRestarts,
      transferredToWorkerBytes: this.transferredToWorkerBytes,
      transferredFromWorkerBytes: this.transferredFromWorkerBytes,
      returnedInputBytes: this.returnedInputBytes,
      latency: {
        samples: durations.length,
        p50Milliseconds: percentile(0.5),
        p95Milliseconds: percentile(0.95),
        p99Milliseconds: percentile(0.99),
        maximumMilliseconds: durations.at(-1) ?? 0,
      },
      lastError: this.lastError,
    };
  }

  async dispose() {
    if (this.workerState === "disposed") return;
    this.clearStartupTimer();
    const error = new TerrainMesherBackendError("backend-disposed", "Rust terrain mesher was disposed", false);
    this.startupReject?.(error);
    this.startupResolve = null;
    this.startupReject = null;
    if (this.worker) {
      try { this.worker.postMessage({ type: "terrain-mesher-shutdown-v1" }); } catch { /* termination below is authoritative */ }
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.onmessageerror = null;
      this.worker.terminate();
      this.worker = null;
    }
    this.workerState = "disposed";
    this.workerGeneration += 1;
    for (const pending of this.pending.values()) {
      this.finishPending(pending);
      pending.reject(error);
    }
    this.pending.clear();
    this.latestRevision.clear();
    if (this.ownsFallback) await this.fallback.dispose();
  }
}
