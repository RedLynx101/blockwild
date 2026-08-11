import type { StructureMarker } from "./structures";
import {
  GENERATED_CHUNK_SCHEMA_V2,
  GENERATE_CHUNK_REQUEST_SCHEMA_V2,
  LEGACY_TERRAIN_CONTENT_HASH_V2,
  TERRAIN_GENERATION_PROTOCOL_V2,
  assertGeneratedChunkMatchesRequestV2,
  createGenerateChunkRequestV2,
  decodeTerrainGenerationMarkerTableV2,
  generateChunkRequestTransferListV2,
  generatedChunkTransferListV2,
  hashTerrainGenerationIdentityV2,
  legacyTerrainGeneratorHashV2,
  stableTerrainGenerationJsonV2,
  type GeneratedChunkV2,
  type GenerateChunkRequestV2,
  type TerrainGenerationEditPair,
  type TerrainGenerationWorkerRequestV2,
  type TerrainGenerationWorkerResponseV2,
} from "./terrain-generation-contract";

export type TerrainGenerationRequest = Readonly<{
  namespace: string;
  seedText: string;
  generationOptions: Readonly<Record<string, unknown>>;
  key: string;
  cx: number;
  cz: number;
  edits: readonly TerrainGenerationEditPair[];
  /** Future Rust callers may supply explicit authority metadata. */
  epoch?: number;
  revision?: number;
  contentHash?: string;
  generatorHash?: string;
}>;

/** Compatibility view consumed by ChunkWorld's exact installation seam. */
export type TerrainGenerationResult = GeneratedChunkV2 & Readonly<{
  structureMarkers: readonly (readonly [string, StructureMarker])[];
}>;

export interface TerrainGenerationWorkerLike {
  onmessage: ((event: MessageEvent<TerrainGenerationWorkerResponseV2>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror?: ((event: MessageEvent) => void) | null;
  postMessage(message: TerrainGenerationWorkerRequestV2, transfer?: Transferable[]): void;
  terminate(): void;
}

export type TerrainGenerationPipelineOptions = Readonly<{
  workerFactory?: () => TerrainGenerationWorkerLike;
  taskTimeoutMilliseconds?: number;
  setTimeout?: typeof globalThis.setTimeout;
  clearTimeout?: typeof globalThis.clearTimeout;
}>;

type WorkerCallback = Readonly<{
  request: GenerateChunkRequestV2;
  complete: (result: TerrainGenerationResult) => void;
  fail: (error?: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}>;

type Slot = {
  worker: TerrainGenerationWorkerLike;
  ready: boolean;
  busy: boolean;
  currentId: number | null;
  generation: number;
};

export type TerrainGenerationSubmission = Readonly<{
  epoch: number;
  taskId: number;
  revision: number;
  cancel: () => boolean;
}>;

class TerrainGenerationPipelineError extends Error {
  readonly name = "TerrainGenerationPipelineError";
}

/** Reserves one of a bounded 2-4 worker graph for whole-chunk generation. */
export function recommendedTerrainWorkerCount(
  logicalProcessors = typeof navigator === "undefined" ? 4 : navigator.hardwareConcurrency || 4,
  deviceMemoryGiB = typeof navigator === "undefined" ? 4 : Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4),
) {
  if (logicalProcessors <= 4 || deviceMemoryGiB <= 4) return 1;
  if (logicalProcessors <= 8 || deviceMemoryGiB <= 8) return 2;
  return 3;
}

/**
 * V2 transfer pipeline. TypeScript remains authoritative: bad, stale, timed
 * out or crashed worker tasks always release the existing synchronous path.
 */
export class TerrainGenerationPipeline {
  private slots: Slot[] = [];
  private nextId = 1;
  private workerGeneration = 0;
  private authorityEpoch = 0;
  private authorityIdentity: string | null = null;
  private latestTaskByLane = new Map<string, number>();
  private canceledTasks = new Set<number>();
  private callbacks = new Map<number, WorkerCallback>();
  private readonly workerFactory?: () => TerrainGenerationWorkerLike;
  private readonly taskTimeoutMilliseconds: number;
  private readonly scheduleTimeout: typeof globalThis.setTimeout;
  private readonly cancelTimeout: typeof globalThis.clearTimeout;
  submitted = 0;
  completed = 0;
  failed = 0;
  stale = 0;
  canceled = 0;
  rejected = 0;
  transferBytes = 0;
  restarts = 0;
  lastError: Readonly<{
    message: string;
    filename: string | null;
    line: number | null;
    column: number | null;
    phase: "startup" | "task";
  }> | null = null;

  constructor(
    workerCount = recommendedTerrainWorkerCount(),
    private readonly maximumRestarts = 2,
    options: TerrainGenerationPipelineOptions = {},
  ) {
    this.workerFactory = options.workerFactory;
    this.taskTimeoutMilliseconds = Math.max(1, options.taskTimeoutMilliseconds ?? 30_000);
    this.scheduleTimeout = options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
    this.cancelTimeout = options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
    const browserWorkerAvailable = this.workerFactory || (typeof document !== "undefined" && typeof Worker !== "undefined");
    if (!browserWorkerAvailable) return;
    for (let index = 0; index < workerCount; index += 1) this.addWorker();
  }

  private createWorker() {
    return this.workerFactory
      ? this.workerFactory()
      : new Worker(new URL("./terrain-generation-worker.ts", import.meta.url), { type: "module" });
  }

  private addWorker() {
    try {
      const slot: Slot = {
        worker: this.createWorker(),
        ready: false,
        busy: false,
        currentId: null,
        generation: ++this.workerGeneration,
      };
      slot.worker.onmessage = (event) => this.handleMessage(slot, event.data);
      slot.worker.onerror = (event) => this.failSlot(slot, event);
      slot.worker.onmessageerror = (event) => this.failSlot(slot, new Error(`Terrain generation worker message error: ${event.type}`));
      this.slots.push(slot);
    } catch (error) {
      this.lastError = {
        message: error instanceof Error ? error.message : String(error),
        filename: null,
        line: null,
        column: null,
        phase: "startup",
      };
      // Browser/CSP fallback remains the existing resumable main-thread path.
    }
  }

  private handleMessage(slot: Slot, message: TerrainGenerationWorkerResponseV2) {
    if (!this.slots.includes(slot)) { this.stale += 1; return; }
    if (message.type === "terrain-generation-ready-v2") {
      const valid = message.protocolVersion === TERRAIN_GENERATION_PROTOCOL_V2
        && message.requestSchemaVersion === GENERATE_CHUNK_REQUEST_SCHEMA_V2
        && message.resultSchemaVersion === GENERATED_CHUNK_SCHEMA_V2
        && message.backend === "typescript-compatibility-oracle";
      if (!valid) {
        this.failSlot(slot, new Error("Terrain generation worker negotiated an incompatible V2 contract"));
        return;
      }
      slot.ready = true;
      this.lastError = null;
      return;
    }
    if (slot.currentId !== message.taskId) {
      this.stale += 1;
      return;
    }
    const callback = this.callbacks.get(message.taskId);
    slot.busy = false;
    slot.currentId = null;
    if (!callback) {
      if (this.canceledTasks.delete(message.taskId)) return;
      this.stale += 1;
      return;
    }
    this.callbacks.delete(message.taskId);
    this.finishCallback(callback);
    if (message.type === "generate-chunk-error-v2") {
      this.failed += 1;
      this.lastError = { message: message.message, filename: null, line: null, column: null, phase: "task" };
      callback.fail(new TerrainGenerationPipelineError(message.message));
      return;
    }
    if (message.type === "generate-chunk-cancelled-v2") {
      this.canceled += 1;
      callback.fail(new TerrainGenerationPipelineError("Terrain generation task was cancelled"));
      return;
    }
    const lane = `${callback.request.epoch}:${callback.request.key}`;
    const stale = message.epoch !== callback.request.epoch
      || message.taskId !== callback.request.taskId
      || callback.request.epoch !== this.authorityEpoch
      || this.latestTaskByLane.get(lane) !== callback.request.taskId;
    if (stale) {
      this.stale += 1;
      callback.fail(new TerrainGenerationPipelineError("Terrain generation result is stale"));
      return;
    }
    try {
      assertGeneratedChunkMatchesRequestV2(message.result, callback.request);
      const structureMarkers = decodeTerrainGenerationMarkerTableV2(message.result.markerTable);
      this.transferBytes += generatedChunkTransferListV2(message.result).reduce((total, buffer) => total + buffer.byteLength, 0);
      this.completed += 1;
      this.lastError = null;
      callback.complete({ ...message.result, structureMarkers });
    } catch (error) {
      this.rejected += 1;
      this.failed += 1;
      this.lastError = {
        message: error instanceof Error ? error.message : String(error),
        filename: null,
        line: null,
        column: null,
        phase: "task",
      };
      callback.fail(error instanceof Error ? error : new TerrainGenerationPipelineError(String(error)));
    }
  }

  private finishCallback(callback: WorkerCallback) { this.cancelTimeout(callback.timer); }

  private failSlot(slot: Slot, event: ErrorEvent | Error) {
    const failedId = slot.currentId;
    this.lastError = {
      message: event.message || "Terrain generation worker failed without an error message",
      filename: "filename" in event ? event.filename || null : null,
      line: "lineno" in event ? event.lineno || null : null,
      column: "colno" in event ? event.colno || null : null,
      phase: slot.ready ? "task" : "startup",
    };
    slot.busy = false;
    slot.currentId = null;
    slot.worker.onmessage = null;
    slot.worker.onerror = null;
    slot.worker.onmessageerror = null;
    slot.worker.terminate();
    this.slots = this.slots.filter((candidate) => candidate !== slot);
    if (failedId !== null) {
      this.canceledTasks.delete(failedId);
      const callback = this.callbacks.get(failedId);
      this.callbacks.delete(failedId);
      if (callback) {
        this.finishCallback(callback);
        this.failed += 1;
        callback.fail(new TerrainGenerationPipelineError(this.lastError.message));
      }
    }
    if (this.restarts < this.maximumRestarts) {
      this.restarts += 1;
      this.addWorker();
    }
  }

  private authorityFor(request: TerrainGenerationRequest) {
    const contentHash = request.contentHash ?? LEGACY_TERRAIN_CONTENT_HASH_V2;
    const generatorHash = request.generatorHash ?? legacyTerrainGeneratorHashV2(request.namespace);
    const identity = hashTerrainGenerationIdentityV2(
      "blockwild-terrain-authority-epoch-v2",
      request.seedText,
      stableTerrainGenerationJsonV2(request.generationOptions),
      contentHash,
      generatorHash,
    );
    if (request.epoch !== undefined) {
      if (request.epoch !== this.authorityEpoch || identity !== this.authorityIdentity) {
        this.authorityEpoch = request.epoch;
        this.authorityIdentity = identity;
      }
    } else if (identity !== this.authorityIdentity) {
      this.authorityIdentity = identity;
      this.authorityEpoch = (this.authorityEpoch + 1) >>> 0;
      if (this.authorityEpoch === 0) this.authorityEpoch = 1;
    }
    return { epoch: this.authorityEpoch, contentHash, generatorHash };
  }

  private revisionFor(request: TerrainGenerationRequest) {
    if (request.revision !== undefined) return request.revision;
    const hash = hashTerrainGenerationIdentityV2(
      "blockwild-terrain-revision-v2",
      request.namespace,
      stableTerrainGenerationJsonV2(request.edits),
    );
    return Number.parseInt(hash.slice(0, 8), 16) >>> 0;
  }

  get supported() { return this.slots.length > 0; }
  get availableSlots() { return this.slots.filter((slot) => slot.ready && !slot.busy).length; }

  submitWithHandle(
    request: TerrainGenerationRequest,
    complete: (result: TerrainGenerationResult) => void,
    fail: (error?: Error) => void = () => {},
  ): TerrainGenerationSubmission | null {
    const slot = this.slots.find((candidate) => candidate.ready && !candidate.busy);
    if (!slot) return null;
    if (this.nextId > 0xffffffff) {
      this.nextId = 1;
      this.authorityEpoch = (this.authorityEpoch + 1) >>> 0 || 1;
    }
    const taskId = this.nextId++;
    let canonical: GenerateChunkRequestV2;
    try {
      const authority = this.authorityFor(request);
      canonical = createGenerateChunkRequestV2({
        epoch: authority.epoch,
        taskId,
        revision: this.revisionFor(request),
        namespace: request.namespace,
        contentHash: authority.contentHash,
        generatorHash: authority.generatorHash,
        seedText: request.seedText,
        generationOptions: request.generationOptions,
        key: request.key,
        cx: request.cx,
        cz: request.cz,
        edits: request.edits,
      });
    } catch (error) {
      this.rejected += 1;
      this.lastError = {
        message: error instanceof Error ? error.message : String(error),
        filename: null,
        line: null,
        column: null,
        phase: "task",
      };
      return null;
    }
    const lane = `${canonical.epoch}:${canonical.key}`;
    this.latestTaskByLane.set(lane, canonical.taskId);
    slot.busy = true;
    slot.currentId = canonical.taskId;
    const timer = this.scheduleTimeout(() => this.failSlot(
      slot,
      new Error(`Terrain generation task ${canonical.taskId} timed out after ${this.taskTimeoutMilliseconds} ms`),
    ), this.taskTimeoutMilliseconds);
    this.callbacks.set(canonical.taskId, { request: canonical, complete, fail, timer });
    this.submitted += 1;
    try {
      // Keep one authoritative copy for response validation. Only the worker
      // copy is detached; transferring gameplay-owned input would make its
      // request checksum unverifiable when the result returns.
      const workerRequest: GenerateChunkRequestV2 = { ...canonical, edits: canonical.edits.slice() };
      const transfer = generateChunkRequestTransferListV2(workerRequest);
      this.transferBytes += transfer.reduce((total, buffer) => total + buffer.byteLength, 0);
      slot.worker.postMessage({ type: "generate-chunk-v2", request: workerRequest }, transfer);
    } catch (error) {
      const callback = this.callbacks.get(canonical.taskId);
      this.callbacks.delete(canonical.taskId);
      if (callback) this.finishCallback(callback);
      slot.busy = false;
      slot.currentId = null;
      this.failed += 1;
      this.failSlot(slot, error instanceof Error ? error : new Error(String(error)));
      return null;
    }
    return {
      epoch: canonical.epoch,
      taskId: canonical.taskId,
      revision: canonical.revision,
      cancel: () => this.cancel(canonical.taskId),
    };
  }

  submit(
    request: TerrainGenerationRequest,
    complete: (result: TerrainGenerationResult) => void,
    fail: (error?: Error) => void = () => {},
  ) { return this.submitWithHandle(request, complete, fail) !== null; }

  cancel(taskId: number) {
    const callback = this.callbacks.get(taskId);
    if (!callback) return false;
    this.callbacks.delete(taskId);
    this.finishCallback(callback);
    this.canceledTasks.add(taskId);
    const slot = this.slots.find((candidate) => candidate.currentId === taskId);
    try {
      slot?.worker.postMessage({ type: "cancel-generate-chunk-v2", epoch: callback.request.epoch, taskId });
    } catch { /* worker failure/result will clear the occupied slot */ }
    this.canceled += 1;
    callback.fail(new TerrainGenerationPipelineError("Terrain generation task was cancelled"));
    return true;
  }

  diagnostics() {
    return {
      supported: this.supported,
      workers: this.slots.length,
      busy: this.slots.filter((slot) => slot.busy).length,
      submitted: this.submitted,
      completed: this.completed,
      failed: this.failed,
      stale: this.stale,
      canceled: this.canceled,
      rejected: this.rejected,
      transferBytes: this.transferBytes,
      ready: this.slots.filter((slot) => slot.ready).length,
      restarts: this.restarts,
      epoch: this.authorityEpoch,
      lastError: this.lastError,
    } as const;
  }

  dispose() {
    for (const slot of this.slots) {
      slot.worker.onmessage = null;
      slot.worker.onerror = null;
      slot.worker.onmessageerror = null;
      slot.worker.terminate();
    }
    for (const callback of this.callbacks.values()) this.finishCallback(callback);
    this.slots = [];
    this.callbacks.clear();
    this.latestTaskByLane.clear();
    this.canceledTasks.clear();
  }
}
