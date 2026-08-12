import type { PersistenceCheckpointV1 } from "./persistence-journal-contract";
import type { RustIntegratedPersistenceRuntimePortV1 } from "./rust-integrated-runtime-persistence";
import type { RustIntegratedPersistencePumpV1 } from "./rust-integrated-persistence-pump";
import {
  RustIntegratedRuntimeServiceError,
  type RustIntegratedRuntimeServiceV1,
} from "./rust-integrated-runtime-service";
import { RUST_PERSISTENCE_PLATFORM_MAX_PAGE_RECORDS_V1 } from "./rust-persistence-runtime-contract";

export const RUST_NATIVE_WORLD_PERSISTENCE_MAX_PARENT_FALLBACKS_V1 = 2;
const RUST_NATIVE_WORLD_PERSISTENCE_RECOVERY_RECORDS_PER_PAGE_V1 = 1;

export type RustNativeWorldPersistenceRecoveryV1 =
  | Readonly<{ status: "empty"; worldId: string }>
  | Readonly<{
    status: "hydrated";
    worldId: string;
    checkpointId: string;
    fallbackDepth: number;
    nativeDomains: number;
    checkpointRecords: number;
  }>
  | Readonly<{
    status: "blocked";
    worldId: string;
    code: "compatibility-adapter-required" | "recovery-exhausted" | "storage-corrupt";
    message: string;
    attemptedCheckpointIds: readonly string[];
  }>;

export type RustNativeWorldPersistenceSaveV1 = Readonly<{
  worldId: string;
  saveId: string;
  checkpointId: string;
  checkpointHash: string;
  journalSequence: number;
  records: number;
  commits: number;
  requestBytes: number;
  responseBytes: number;
}>;

export type RustNativeWorldPersistenceDiagnosticsV1 = Readonly<{
  worldId: string;
  state: "open" | "closing" | "closed";
  saves: number;
  recoveries: number;
  parentFallbacks: number;
  platformOperations: number;
  requestBytes: number;
  responseBytes: number;
  lastCheckpointId: string | null;
  lastError: Readonly<{ code: string; message: string }> | null;
}>;

export interface RustNativeWorldCheckpointReaderV1 {
  readLatestCheckpoint(worldId: string): Promise<PersistenceCheckpointV1 | null>;
  readCheckpoint(worldId: string, checkpointId: string): Promise<PersistenceCheckpointV1 | null>;
}

type NativeRuntimeControl = Pick<
  RustIntegratedRuntimeServiceV1,
  "initializeNativeSave" | "hydrateCompatibilityRecovery"
>;

type NativePersistencePort = Pick<
  RustIntegratedPersistenceRuntimePortV1,
  "recover" | "readRecoveryPage" | "close"
>;

type NativePersistencePump = Pick<
  RustIntegratedPersistencePumpV1,
  "flush" | "shutdown" | "isClosed"
>;

export type RustNativeWorldPersistenceSessionOptionsV1 = Readonly<{
  worldId: string;
  runtime: NativeRuntimeControl;
  port: NativePersistencePort;
  pump: NativePersistencePump;
  checkpoints: RustNativeWorldCheckpointReaderV1;
  maxParentFallbacks?: number;
}>;

/**
 * Browser executor for the canonical R8 save lifecycle.
 *
 * This class never serializes a world domain, creates a transaction, selects a
 * retry policy, or decodes a BWPR/BWPA payload. Rust owns those decisions. The
 * browser only invokes coarse native controls, executes the resulting bounded
 * platform queue, and follows immutable checkpoint parent pointers when a
 * newer exact save fails native hydration.
 */
export class RustNativeWorldPersistenceSessionV1 {
  readonly worldId: string;
  private readonly runtime: NativeRuntimeControl;
  private readonly port: NativePersistencePort;
  private readonly pump: NativePersistencePump;
  private readonly checkpoints: RustNativeWorldCheckpointReaderV1;
  private readonly maxParentFallbacks: number;
  private serial = Promise.resolve<unknown>(undefined);
  private state: "open" | "closing" | "closed" = "open";
  private nextSaveId = 1;
  private saves = 0;
  private recoveries = 0;
  private parentFallbacks = 0;
  private platformOperations = 0;
  private requestBytes = 0;
  private responseBytes = 0;
  private lastCheckpointId: string | null = null;
  private lastError: RustNativeWorldPersistenceDiagnosticsV1["lastError"] = null;

  constructor(options: RustNativeWorldPersistenceSessionOptionsV1) {
    if (!options.worldId || [...options.worldId].some((character) => character < " ")) {
      throw new Error("native persistence world id is empty or contains controls");
    }
    const fallbacks = options.maxParentFallbacks ?? RUST_NATIVE_WORLD_PERSISTENCE_MAX_PARENT_FALLBACKS_V1;
    if (!Number.isSafeInteger(fallbacks) || fallbacks < 0 || fallbacks > RUST_NATIVE_WORLD_PERSISTENCE_MAX_PARENT_FALLBACKS_V1) {
      throw new RangeError(`native persistence parent fallback count must be 0..${RUST_NATIVE_WORLD_PERSISTENCE_MAX_PARENT_FALLBACKS_V1}`);
    }
    this.worldId = options.worldId;
    this.runtime = options.runtime;
    this.port = options.port;
    this.pump = options.pump;
    this.checkpoints = options.checkpoints;
    this.maxParentFallbacks = fallbacks;
  }

  initializeNewWorld(createdAt: number) {
    return this.enqueue(async () => {
      const existing = await this.checkpoints.readLatestCheckpoint(this.worldId);
      if (existing) throw this.error("already-initialized", "native world already has a durable checkpoint head");
      return this.performNativeSave(createdAt, "new");
    });
  }

  saveNative(createdAt: number) {
    return this.enqueue(() => this.performNativeSave(createdAt, "save"));
  }

  recoverAndHydrate(): Promise<RustNativeWorldPersistenceRecoveryV1> {
    return this.enqueue(async () => {
      let latest: PersistenceCheckpointV1 | null;
      try { latest = await this.checkpoints.readLatestCheckpoint(this.worldId); }
      catch (error) {
        const message = error instanceof Error ? error.message : "checkpoint head could not be read";
        this.rememberError("storage-corrupt", message);
        return Object.freeze({ status: "blocked", worldId: this.worldId, code: "storage-corrupt", message, attemptedCheckpointIds: Object.freeze([]) });
      }
      if (!latest) return Object.freeze({ status: "empty", worldId: this.worldId });

      const candidates: PersistenceCheckpointV1[] = [];
      const seen = new Set<string>();
      let cursor: PersistenceCheckpointV1 | null = latest;
      while (cursor && candidates.length <= this.maxParentFallbacks) {
        if (cursor.worldId !== this.worldId || seen.has(cursor.checkpointId)) {
          const message = "checkpoint parent chain is cyclic or belongs to another world";
          this.rememberError("storage-corrupt", message);
          return Object.freeze({ status: "blocked", worldId: this.worldId, code: "storage-corrupt", message, attemptedCheckpointIds: Object.freeze(candidates.map((candidate) => candidate.checkpointId)) });
        }
        candidates.push(cursor);
        seen.add(cursor.checkpointId);
        if (!cursor.parentCheckpointId) {
          cursor = null;
          continue;
        }
        try {
          cursor = await this.checkpoints.readCheckpoint(this.worldId, cursor.parentCheckpointId);
        } catch (error) {
          const message = error instanceof Error ? error.message : "checkpoint parent could not be read";
          this.rememberError("storage-corrupt", message);
          return Object.freeze({
            status: "blocked",
            worldId: this.worldId,
            code: "storage-corrupt",
            message,
            attemptedCheckpointIds: Object.freeze(candidates.map((candidate) => candidate.checkpointId)),
          });
        }
      }

      const attempted: string[] = [];
      for (let depth = 0; depth < candidates.length; depth += 1) {
        const checkpoint = candidates[depth];
        attempted.push(checkpoint.checkpointId);
        try {
          await this.port.recover(this.worldId, checkpoint.checkpointId);
          await this.drain();
          // Request one immutable record at a time. The 4 MiB platform byte
          // budget may end a page before a large max-record request reaches
          // its nominal count; a unit stride therefore cannot skip the Rust-
          // reported next cursor. Native save sets currently contain five
          // domain records, so this remains a small bounded sequence.
          for (let start = 0; start < checkpoint.records.length; start += RUST_NATIVE_WORLD_PERSISTENCE_RECOVERY_RECORDS_PER_PAGE_V1) {
            await this.port.readRecoveryPage(
              this.worldId,
              checkpoint.checkpointId,
              start,
              Math.min(
                RUST_PERSISTENCE_PLATFORM_MAX_PAGE_RECORDS_V1,
                RUST_NATIVE_WORLD_PERSISTENCE_RECOVERY_RECORDS_PER_PAGE_V1,
                checkpoint.records.length - start,
              ),
            );
            await this.drain();
          }
          const hydration = await this.runtime.hydrateCompatibilityRecovery(checkpoint.checkpointId);
          this.recoveries += 1;
          this.parentFallbacks += depth;
          this.lastCheckpointId = checkpoint.checkpointId;
          if (hydration.chunkCount > 0 || hydration.totalBytes > 0) {
            const message = "durable save contains protected compatibility bytes but no lossless WorldSave adapter is installed";
            this.rememberError("compatibility-adapter-required", message);
            return Object.freeze({
              status: "blocked",
              worldId: this.worldId,
              code: "compatibility-adapter-required",
              message,
              attemptedCheckpointIds: Object.freeze([...attempted]),
            });
          }
          this.lastError = null;
          return Object.freeze({
            status: "hydrated",
            worldId: this.worldId,
            checkpointId: checkpoint.checkpointId,
            fallbackDepth: depth,
            nativeDomains: hydration.nativeDomains,
            checkpointRecords: checkpoint.records.length,
          });
        } catch (error) {
          if (!(error instanceof RustIntegratedRuntimeServiceError) || error.code !== "bulk-platform") throw error;
          this.rememberError(error.code, error.message);
        }
      }
      const message = this.lastError?.message ?? "no retained checkpoint passed native hydration";
      return Object.freeze({
        status: "blocked",
        worldId: this.worldId,
        code: "recovery-exhausted",
        message,
        attemptedCheckpointIds: Object.freeze([...attempted]),
      });
    });
  }

  flush() {
    return this.enqueue(async () => { await this.drain(); });
  }

  async shutdown() {
    if (this.state === "closed") return;
    if (this.state === "closing") { await this.serial; return; }
    this.state = "closing";
    const work = this.serial.then(async () => {
      let failure: unknown = null;
      try {
        await this.drain(true);
        await this.port.close();
      } catch (error) { failure = error; }
      try { await this.pump.shutdown(); }
      catch (error) { failure ??= error; }
      this.state = "closed";
      if (failure) throw failure;
    });
    this.serial = work.then(() => undefined, () => undefined);
    try { await work; }
    catch (error) { this.state = "closed"; throw error; }
  }

  diagnostics(): RustNativeWorldPersistenceDiagnosticsV1 {
    return Object.freeze({
      worldId: this.worldId,
      state: this.state,
      saves: this.saves,
      recoveries: this.recoveries,
      parentFallbacks: this.parentFallbacks,
      platformOperations: this.platformOperations,
      requestBytes: this.requestBytes,
      responseBytes: this.responseBytes,
      lastCheckpointId: this.lastCheckpointId,
      lastError: this.lastError,
    });
  }

  private async performNativeSave(createdAt: number, purpose: "new" | "save"): Promise<RustNativeWorldPersistenceSaveV1> {
    if (!Number.isSafeInteger(createdAt) || createdAt < 0) throw this.error("created-at", "native save timestamp is outside JavaScript's exact unsigned range");
    const previousHead = await this.checkpoints.readLatestCheckpoint(this.worldId);
    if (purpose === "new" && previousHead) throw this.error("already-initialized", "native world already has a durable checkpoint head");
    const saveId = `native.${purpose}.${createdAt.toString(36)}.${this.nextSaveId++}`;
    const progress = await this.runtime.initializeNativeSave(saveId, createdAt);
    if (progress.dispatcherRequestId < 1) throw this.error("durability", "native save did not issue a Rust persistence transaction");
    const drained = await this.drain();
    const head = await this.checkpoints.readLatestCheckpoint(this.worldId);
    if (!head || head.worldId !== this.worldId) throw this.error("durability", "native save drained without an exact durable checkpoint head");
    if (drained.operations < 1 || head.journalSequence <= (previousHead?.journalSequence ?? 0)) {
      throw this.error("durability", "native save did not advance the exact durable checkpoint head");
    }
    this.saves += 1;
    this.lastCheckpointId = head.checkpointId;
    this.lastError = null;
    return Object.freeze({
      worldId: this.worldId,
      saveId,
      checkpointId: head.checkpointId,
      checkpointHash: head.checkpointHash,
      journalSequence: head.journalSequence,
      records: head.records.length,
      commits: drained.operations,
      requestBytes: drained.requestBytes,
      responseBytes: drained.responseBytes,
    });
  }

  private async drain(allowClosing = false) {
    if (this.pump.isClosed()) throw this.error("closed", "native persistence pump is already closed");
    if (!allowClosing && this.state !== "open") throw this.error("closed", `native persistence session is ${this.state}`);
    const result = await this.pump.flush();
    this.platformOperations += result.operations;
    this.requestBytes += result.requestBytes;
    this.responseBytes += result.responseBytes;
    if (!result.idle) throw this.error("drain", "native persistence pump stopped before Rust became idle");
    return result;
  }

  private enqueue<T>(work: () => Promise<T>) {
    if (this.state !== "open") return Promise.reject(this.error("closed", `native persistence session is ${this.state}`));
    const next = this.serial.then(work, work);
    this.serial = next.then(() => undefined, () => undefined);
    return next;
  }

  private error(code: string, message: string) {
    this.rememberError(code, message);
    return new Error(`${code}: ${message}`);
  }

  private rememberError(code: string, message: string) {
    this.lastError = Object.freeze({ code, message });
  }
}
