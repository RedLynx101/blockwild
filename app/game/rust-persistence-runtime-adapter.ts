import {
  persistencePayloadMatchesV1,
  persistenceRecordKeyV1,
  type PersistenceCheckpointV1,
  type PersistenceCommitResultV1,
  type PersistenceRecordAddressV1,
  type PersistenceTransactionV1,
} from "./persistence-journal-contract";
import {
  RustPersistenceRuntimeContractError,
  decodeRustPersistenceRequestV1,
  encodeRustPersistenceResponseV1,
  rustPersistenceZeroHashV1,
  type RustPersistenceRecoveryResponseV1,
  type RustPersistenceResponseV1,
} from "./rust-persistence-runtime-contract";

/** Browser-only capabilities required by the Rust R8 platform adapter. */
export interface RustPersistencePlatformAdapterV1 {
  commit(transaction: PersistenceTransactionV1, checkpoint: PersistenceCheckpointV1): Promise<PersistenceCommitResultV1>;
  readLatestCheckpoint(worldId: string): Promise<PersistenceCheckpointV1 | null>;
  readCheckpoint(worldId: string, checkpointId: string): Promise<PersistenceCheckpointV1 | null>;
  readRecord(address: PersistenceRecordAddressV1, revision?: number): Promise<Uint8Array | null>;
}

function sameCheckpoint(left: PersistenceCheckpointV1 | null, right: PersistenceCheckpointV1) {
  return left?.worldId === right.worldId && left.checkpointId === right.checkpointId && left.journalSequence === right.journalSequence && left.checkpointHash === right.checkpointHash;
}

function classifyError(error: unknown) {
  if (error instanceof RustPersistenceRuntimeContractError) return Object.freeze({ code: error.code, message: error.message });
  const candidate = error as { name?: string; message?: string } | null;
  return Object.freeze({ code: candidate?.name ?? "unavailable", message: candidate?.message ?? "Persistence platform adapter failed." });
}

/**
 * Executes Rust-prepared persistence operations without acquiring save authority.
 * The injected adapter should be `IndexedDbPersistenceAdapterV1` in production;
 * its `commit` method binds mutations, journal sequence, and checkpoint head in
 * one strict asynchronous IndexedDB transaction.
 */
export class RustPersistenceBrowserRuntimeV1 {
  private readonly queues = new Map<string, Promise<Uint8Array>>();

  constructor(private readonly adapter: RustPersistencePlatformAdapterV1) {}

  execute(message: Uint8Array): Promise<Uint8Array> {
    let request;
    try { request = decodeRustPersistenceRequestV1(message); }
    catch (error) {
      const failure = classifyError(error);
      return Promise.resolve(encodeRustPersistenceResponseV1({ kind: "error", requestId: 0, ...failure }));
    }
    const worldId = request.kind === "commit" ? request.transaction.worldId : request.worldId;
    const previous = this.queues.get(worldId) ?? Promise.resolve(new Uint8Array());
    const next = previous.catch(() => new Uint8Array()).then(async () => {
      try {
        if (request.kind === "commit") return this.commit(request.requestId, request.transaction, request.checkpoint);
        return this.recover(request.requestId, request.worldId, request.kind === "read-checkpoint" ? request.checkpointId : null);
      } catch (error) {
        const failure = classifyError(error);
        return encodeRustPersistenceResponseV1({ kind: "error", requestId: request.requestId, ...failure });
      }
    });
    this.queues.set(worldId, next);
    void next.finally(() => { if (this.queues.get(worldId) === next) this.queues.delete(worldId); });
    return next;
  }

  private async commit(requestId: number, transaction: PersistenceTransactionV1, checkpoint: PersistenceCheckpointV1) {
    const result = await this.adapter.commit(transaction, checkpoint);
    if (result.status === "rejected") return encodeRustPersistenceResponseV1({
      kind: "commit", requestId, code: result.code, transactionId: transaction.transactionId,
      journalSequence: transaction.expectedJournalSequence, durableHash: rustPersistenceZeroHashV1(), checkpointHash: checkpoint.checkpointHash,
      verifiedReadback: false, message: result.message,
    });
    const durableCheckpoint = await this.adapter.readCheckpoint(checkpoint.worldId, checkpoint.checkpointId);
    let verifiedReadback = sameCheckpoint(durableCheckpoint, checkpoint);
    for (const mutation of transaction.mutations) {
      if (!verifiedReadback) break;
      const payload = await this.adapter.readRecord(mutation.address, mutation.operation === "put" ? mutation.nextRecordRevision : undefined);
      verifiedReadback = mutation.operation === "delete"
        ? payload === null
        : payload !== null && payload.byteLength === mutation.payload.byteLength && persistencePayloadMatchesV1(payload, mutation.payloadHash);
    }
    return encodeRustPersistenceResponseV1({
      kind: "commit", requestId, code: verifiedReadback ? "committed" : "corrupt", transactionId: transaction.transactionId,
      journalSequence: result.journalSequence, durableHash: result.durableHash, checkpointHash: checkpoint.checkpointHash,
      verifiedReadback, message: verifiedReadback ? "IndexedDB transaction and exact readback committed." : "IndexedDB committed but exact semantic readback failed.",
    });
  }

  private async recover(requestId: number, worldId: string, checkpointId: string | null) {
    const checkpoint = checkpointId === null ? await this.adapter.readLatestCheckpoint(worldId) : await this.adapter.readCheckpoint(worldId, checkpointId);
    if (!checkpoint) return encodeRustPersistenceResponseV1({
      kind: "recovery", requestId, code: "empty", worldId, checkpoint: null, recordPayloads: Object.freeze([]), missingRecordKeys: Object.freeze([]), corruptRecordKeys: Object.freeze([]), message: "No Rust checkpoint exists for this world.",
    });
    const recordPayloads: Array<Uint8Array | null> = [];
    const missingRecordKeys: string[] = [];
    const corruptRecordKeys: string[] = [];
    for (const descriptor of checkpoint.records) {
      const payload = await this.adapter.readRecord(descriptor.address, descriptor.revision);
      recordPayloads.push(payload);
      const key = persistenceRecordKeyV1(descriptor.address);
      if (!payload) missingRecordKeys.push(key);
      else if (payload.byteLength !== descriptor.byteLength || !persistencePayloadMatchesV1(payload, descriptor.payloadHash)) corruptRecordKeys.push(key);
    }
    const ready = missingRecordKeys.length === 0 && corruptRecordKeys.length === 0;
    const response: RustPersistenceRecoveryResponseV1 = Object.freeze({
      kind: "recovery", requestId, code: ready ? "ready" : "corrupt", worldId, checkpoint,
      recordPayloads: Object.freeze(recordPayloads), missingRecordKeys: Object.freeze(missingRecordKeys), corruptRecordKeys: Object.freeze(corruptRecordKeys),
      message: ready ? "Newest exact checkpoint is ready for Rust hydration." : "Checkpoint needs Rust repair or an older complete fallback.",
    });
    return encodeRustPersistenceResponseV1(response);
  }
}

export type { RustPersistenceResponseV1 };
