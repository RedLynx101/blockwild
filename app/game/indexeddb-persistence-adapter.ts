import {
  PERSISTENCE_SCHEMA_V1,
  persistencePayloadMatchesV1,
  persistenceRecordKeyV1,
  type PersistenceCheckpointV1,
  type PersistenceCommitResultV1,
  type PersistenceLegacyMigrationBundleV1,
  type PersistencePlatformAdapterV1,
  type PersistenceRecordAddressV1,
  type PersistenceTransactionV1,
} from "./persistence-journal-contract";

export const RUST_PERSISTENCE_DATABASE_V1 = "blockwild-rust-persistence-v1";
export const RUST_PERSISTENCE_DATABASE_VERSION_V1 = 1;

const STORE_META = "meta";
const STORE_JOURNAL = "journal";
const STORE_RECORDS = "records";
const STORE_CHECKPOINTS = "checkpoints";
const STORE_LEGACY_BACKUPS = "legacy-backups";

type StoredMeta = Readonly<{ key: string; value: number | string | boolean }>;
type StoredRecord = Readonly<{
  key: string;
  address: PersistenceRecordAddressV1;
  revision: number;
  payload: Uint8Array;
  payloadHash: string;
}>;
type StoredCheckpoint = Readonly<{ key: string; checkpoint: PersistenceCheckpointV1 }>;
type StoredJournal = Readonly<{ key: string; worldId: string; sequence: number; transaction: PersistenceTransactionV1 }>;
type StoredLegacyBackup = Readonly<{
  key: string;
  worldId: string;
  sourceKey: string;
  bundle: PersistenceLegacyMigrationBundleV1;
  sourcePayload: Uint8Array;
}>;

export type PersistenceMigrationWriteV1 = Readonly<{
  bundle: PersistenceLegacyMigrationBundleV1;
  sourcePayload: Uint8Array;
  checkpoint: PersistenceCheckpointV1;
  recordPayloads: ReadonlyMap<string, Uint8Array>;
}>;

export type PersistenceMigrationReadbackV1 = Readonly<{
  ready: boolean;
  checkpointHash: string | null;
  missingRecords: readonly string[];
  corruptRecords: readonly string[];
  backupPreserved: boolean;
}>;

function checkpointKey(worldId: string, checkpointId: string) { return `${encodeURIComponent(worldId)}|${encodeURIComponent(checkpointId)}`; }
function journalKey(worldId: string, sequence: number) { return `${encodeURIComponent(worldId)}|${sequence.toString().padStart(16, "0")}`; }
function sequenceKey(worldId: string) { return `journal-sequence|${encodeURIComponent(worldId)}`; }
function latestCheckpointKey(worldId: string) { return `latest-checkpoint|${encodeURIComponent(worldId)}`; }
function migrationKey(worldId: string) { return `migration-complete|${encodeURIComponent(worldId)}`; }
function backupKey(bundle: PersistenceLegacyMigrationBundleV1) { return `${encodeURIComponent(bundle.worldId)}|${encodeURIComponent(bundle.sourceKey)}`; }

function cloneCheckpoint(checkpoint: PersistenceCheckpointV1): PersistenceCheckpointV1 {
  return Object.freeze({
    ...checkpoint,
    records: Object.freeze(checkpoint.records.map((record) => Object.freeze({ address: Object.freeze({ ...record.address }), revision: record.revision, byteLength: record.byteLength, payloadHash: record.payloadHash }))),
  });
}

function cloneTransaction(transaction: PersistenceTransactionV1): PersistenceTransactionV1 {
  return Object.freeze({
    ...transaction,
    mutations: Object.freeze(transaction.mutations.map((mutation) => mutation.operation === "put"
      ? Object.freeze({ ...mutation, address: Object.freeze({ ...mutation.address }), payload: Uint8Array.from(mutation.payload) })
      : Object.freeze({ ...mutation, address: Object.freeze({ ...mutation.address }) }))),
  });
}

function reject(transaction: PersistenceTransactionV1, code: Extract<PersistenceCommitResultV1, { status: "rejected" }>["code"], message: string): PersistenceCommitResultV1 {
  return Object.freeze({ status: "rejected", transactionId: transaction.transactionId, code, message });
}

function classifyCommitError(transaction: PersistenceTransactionV1, error: unknown): PersistenceCommitResultV1 {
  const candidate = error as { name?: string; message?: string } | null;
  const quota = candidate?.name === "QuotaExceededError" || candidate?.name === "NS_ERROR_DOM_QUOTA_REACHED";
  return reject(transaction, quota ? "quota" : "unavailable", quota ? "Browser storage quota rejected the Rust journal transaction." : `IndexedDB transaction failed: ${candidate?.message ?? "unavailable"}`);
}

function requestValue<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, rejectRequest) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => rejectRequest(request.error ?? new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction: IDBTransaction) {
  return new Promise<void>((resolve, rejectTransaction) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => rejectTransaction(transaction.error ?? new DOMException("IndexedDB transaction aborted", "AbortError"));
    transaction.onerror = () => rejectTransaction(transaction.error ?? new Error("IndexedDB transaction failed"));
  });
}

function deleteMatching(store: IDBObjectStore, predicate: (value: unknown, key: IDBValidKey) => boolean) {
  return new Promise<void>((resolve, rejectCursor) => {
    const request = store.openCursor();
    request.onerror = () => rejectCursor(request.error ?? new Error("IndexedDB cursor failed"));
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) { resolve(); return; }
      if (predicate(cursor.value, cursor.primaryKey)) cursor.delete();
      cursor.continue();
    };
  });
}

async function abortTransaction(transaction: IDBTransaction) {
  try { transaction.abort(); } catch { /* transaction already settled */ }
  try { await transactionDone(transaction); } catch { /* expected abort */ }
}

export class IndexedDbPersistenceAdapterV1 implements PersistencePlatformAdapterV1 {
  private databasePromise: Promise<IDBDatabase> | null = null;
  readonly supported: boolean;

  constructor(
    private readonly factory: IDBFactory | null = typeof indexedDB === "undefined" ? null : indexedDB,
    private readonly databaseName = RUST_PERSISTENCE_DATABASE_V1,
  ) {
    this.supported = factory !== null;
  }

  private open() {
    if (!this.factory) return Promise.reject(new Error("IndexedDB is unavailable"));
    if (this.databasePromise) return this.databasePromise;
    this.databasePromise = new Promise<IDBDatabase>((resolve, rejectOpen) => {
      const request = this.factory!.open(this.databaseName, RUST_PERSISTENCE_DATABASE_VERSION_V1);
      request.onupgradeneeded = () => {
        const database = request.result;
        for (const name of [STORE_META, STORE_JOURNAL, STORE_RECORDS, STORE_CHECKPOINTS, STORE_LEGACY_BACKUPS]) {
          if (!database.objectStoreNames.contains(name)) database.createObjectStore(name, { keyPath: "key" });
        }
      };
      request.onsuccess = () => {
        const database = request.result;
        database.onversionchange = () => { database.close(); this.databasePromise = null; };
        resolve(database);
      };
      request.onerror = () => { this.databasePromise = null; rejectOpen(request.error ?? new Error("IndexedDB open failed")); };
      request.onblocked = () => { this.databasePromise = null; rejectOpen(new Error("IndexedDB upgrade is blocked by another Blockwild tab")); };
    });
    return this.databasePromise;
  }

  async commit(transaction: PersistenceTransactionV1, checkpoint?: PersistenceCheckpointV1): Promise<PersistenceCommitResultV1> {
    let database: IDBDatabase;
    try { database = await this.open(); } catch (error) { return classifyCommitError(transaction, error); }
    if (checkpoint && (checkpoint.worldId !== transaction.worldId || checkpoint.journalSequence !== transaction.nextJournalSequence)) {
      return reject(transaction, "corrupt", "Checkpoint does not describe the transaction's committed world revision.");
    }
    const idb = database.transaction(checkpoint ? [STORE_META, STORE_JOURNAL, STORE_RECORDS, STORE_CHECKPOINTS] : [STORE_META, STORE_JOURNAL, STORE_RECORDS], "readwrite", { durability: "strict" });
    const done = transactionDone(idb);
    try {
      const metaStore = idb.objectStore(STORE_META);
      const recordStore = idb.objectStore(STORE_RECORDS);
      const journalStore = idb.objectStore(STORE_JOURNAL);
      const sequenceRecord = await requestValue(metaStore.get(sequenceKey(transaction.worldId))) as StoredMeta | undefined;
      const currentSequence = typeof sequenceRecord?.value === "number" ? sequenceRecord.value : 0;
      if (currentSequence !== transaction.expectedJournalSequence || transaction.nextJournalSequence !== currentSequence + 1) {
        await abortTransaction(idb);
        return reject(transaction, "stale-sequence", `Expected durable journal sequence ${currentSequence}.`);
      }
      for (const mutation of transaction.mutations) {
        const key = persistenceRecordKeyV1(mutation.address);
        const current = await requestValue(recordStore.get(key)) as StoredRecord | undefined;
        const currentRevision = current?.revision ?? null;
        if (currentRevision !== mutation.expectedRecordRevision) {
          await abortTransaction(idb);
          return reject(transaction, "record-conflict", `Record ${key} changed before the transaction committed.`);
        }
      }
      for (const mutation of transaction.mutations) {
        const key = persistenceRecordKeyV1(mutation.address);
        if (mutation.operation === "delete") recordStore.delete(key);
        else recordStore.put(Object.freeze({ key, address: mutation.address, revision: mutation.nextRecordRevision, payload: Uint8Array.from(mutation.payload), payloadHash: mutation.payloadHash }) satisfies StoredRecord);
      }
      journalStore.put(Object.freeze({ key: journalKey(transaction.worldId, transaction.nextJournalSequence), worldId: transaction.worldId, sequence: transaction.nextJournalSequence, transaction: cloneTransaction(transaction) }) satisfies StoredJournal);
      metaStore.put(Object.freeze({ key: sequenceKey(transaction.worldId), value: transaction.nextJournalSequence }) satisfies StoredMeta);
      if (checkpoint) {
        idb.objectStore(STORE_CHECKPOINTS).put(Object.freeze({ key: checkpointKey(checkpoint.worldId, checkpoint.checkpointId), checkpoint: cloneCheckpoint(checkpoint) }) satisfies StoredCheckpoint);
        metaStore.put(Object.freeze({ key: latestCheckpointKey(checkpoint.worldId), value: checkpoint.checkpointId }) satisfies StoredMeta);
      }
      await done;
      return Object.freeze({ status: "committed", transactionId: transaction.transactionId, journalSequence: transaction.nextJournalSequence, durableHash: transaction.transactionHash });
    } catch (error) {
      try { idb.abort(); } catch { /* already settled */ }
      try { await done; } catch { /* error classified below */ }
      return classifyCommitError(transaction, error);
    }
  }

  async putCheckpoint(checkpoint: PersistenceCheckpointV1, markLatest = true) {
    const database = await this.open();
    const idb = database.transaction(markLatest ? [STORE_CHECKPOINTS, STORE_META] : [STORE_CHECKPOINTS], "readwrite", { durability: "strict" });
    idb.objectStore(STORE_CHECKPOINTS).put(Object.freeze({ key: checkpointKey(checkpoint.worldId, checkpoint.checkpointId), checkpoint: cloneCheckpoint(checkpoint) }) satisfies StoredCheckpoint);
    if (markLatest) idb.objectStore(STORE_META).put(Object.freeze({ key: latestCheckpointKey(checkpoint.worldId), value: checkpoint.checkpointId }) satisfies StoredMeta);
    await transactionDone(idb);
  }

  async readLatestCheckpoint(worldId: string) {
    const database = await this.open();
    const meta = database.transaction(STORE_META, "readonly");
    const head = await requestValue(meta.objectStore(STORE_META).get(latestCheckpointKey(worldId))) as StoredMeta | undefined;
    await transactionDone(meta);
    return typeof head?.value === "string" ? this.readCheckpoint(worldId, head.value) : null;
  }

  async readCheckpoint(worldId: string, checkpointId: string) {
    const database = await this.open();
    const idb = database.transaction(STORE_CHECKPOINTS, "readonly");
    const result = await requestValue(idb.objectStore(STORE_CHECKPOINTS).get(checkpointKey(worldId, checkpointId))) as StoredCheckpoint | undefined;
    await transactionDone(idb);
    return result ? cloneCheckpoint(result.checkpoint) : null;
  }

  async readRecord(address: PersistenceRecordAddressV1, revision?: number) {
    const database = await this.open();
    const idb = database.transaction(STORE_RECORDS, "readonly");
    const result = await requestValue(idb.objectStore(STORE_RECORDS).get(persistenceRecordKeyV1(address))) as StoredRecord | undefined;
    await transactionDone(idb);
    if (!result || revision !== undefined && result.revision !== revision) return null;
    return Uint8Array.from(result.payload);
  }

  async estimate() {
    const storage = typeof navigator !== "undefined" ? navigator.storage : undefined;
    if (!storage?.estimate) return Object.freeze({ usage: 0, quota: null });
    const estimate = await storage.estimate();
    return Object.freeze({ usage: Math.max(0, estimate.usage ?? 0), quota: estimate.quota === undefined ? null : Math.max(0, estimate.quota) });
  }

  /** Separate-namespace migration: source bytes and new records commit together; no legacy key is deleted. */
  async commitMigration(input: PersistenceMigrationWriteV1) {
    if (!persistencePayloadMatchesV1(input.sourcePayload, input.bundle.sourceHash)) throw new Error("legacy source payload does not match migration fingerprint");
    if (input.checkpoint.worldId !== input.bundle.worldId) throw new Error("migration checkpoint belongs to another world");
    for (const descriptor of input.checkpoint.records) {
      const key = persistenceRecordKeyV1(descriptor.address);
      const payload = input.recordPayloads.get(key);
      if (!payload) throw new Error(`migration record ${key} is missing`);
      if (payload.byteLength !== descriptor.byteLength || !persistencePayloadMatchesV1(payload, descriptor.payloadHash)) throw new Error(`migration record ${key} failed semantic readback hashing`);
    }
    const database = await this.open();
    const idb = database.transaction([STORE_META, STORE_RECORDS, STORE_CHECKPOINTS, STORE_LEGACY_BACKUPS], "readwrite", { durability: "strict" });
    const records = idb.objectStore(STORE_RECORDS);
    for (const descriptor of input.checkpoint.records) {
      const key = persistenceRecordKeyV1(descriptor.address);
      records.put(Object.freeze({ key, address: descriptor.address, revision: descriptor.revision, payload: Uint8Array.from(input.recordPayloads.get(key)!), payloadHash: descriptor.payloadHash }) satisfies StoredRecord);
    }
    idb.objectStore(STORE_CHECKPOINTS).put(Object.freeze({ key: checkpointKey(input.checkpoint.worldId, input.checkpoint.checkpointId), checkpoint: cloneCheckpoint(input.checkpoint) }) satisfies StoredCheckpoint);
    idb.objectStore(STORE_LEGACY_BACKUPS).put(Object.freeze({ key: backupKey(input.bundle), worldId: input.bundle.worldId, sourceKey: input.bundle.sourceKey, bundle: input.bundle, sourcePayload: Uint8Array.from(input.sourcePayload) }) satisfies StoredLegacyBackup);
    idb.objectStore(STORE_META).put(Object.freeze({ key: migrationKey(input.bundle.worldId), value: input.checkpoint.checkpointHash }) satisfies StoredMeta);
    idb.objectStore(STORE_META).put(Object.freeze({ key: latestCheckpointKey(input.bundle.worldId), value: input.checkpoint.checkpointId }) satisfies StoredMeta);
    await transactionDone(idb);
  }

  async verifyMigrationReadback(input: Pick<PersistenceMigrationWriteV1, "bundle" | "checkpoint">): Promise<PersistenceMigrationReadbackV1> {
    const database = await this.open();
    const idb = database.transaction([STORE_RECORDS, STORE_CHECKPOINTS, STORE_LEGACY_BACKUPS], "readonly");
    const checkpointRecord = await requestValue(idb.objectStore(STORE_CHECKPOINTS).get(checkpointKey(input.checkpoint.worldId, input.checkpoint.checkpointId))) as StoredCheckpoint | undefined;
    const backup = await requestValue(idb.objectStore(STORE_LEGACY_BACKUPS).get(backupKey(input.bundle))) as StoredLegacyBackup | undefined;
    const missingRecords: string[] = [];
    const corruptRecords: string[] = [];
    for (const descriptor of input.checkpoint.records) {
      const key = persistenceRecordKeyV1(descriptor.address);
      const record = await requestValue(idb.objectStore(STORE_RECORDS).get(key)) as StoredRecord | undefined;
      if (!record) missingRecords.push(key);
      else if (record.revision !== descriptor.revision || record.payloadHash !== descriptor.payloadHash || !persistencePayloadMatchesV1(record.payload, descriptor.payloadHash)) corruptRecords.push(key);
    }
    await transactionDone(idb);
    const backupPreserved = Boolean(backup && persistencePayloadMatchesV1(backup.sourcePayload, input.bundle.sourceHash));
    const checkpointHash = checkpointRecord?.checkpoint.checkpointHash ?? null;
    return Object.freeze({ ready: checkpointHash === input.checkpoint.checkpointHash && backupPreserved && !missingRecords.length && !corruptRecords.length, checkpointHash, missingRecords: Object.freeze(missingRecords), corruptRecords: Object.freeze(corruptRecords), backupPreserved });
  }

  async deleteWorld(worldId: string) {
    const database = await this.open();
    const idb = database.transaction([STORE_META, STORE_JOURNAL, STORE_RECORDS, STORE_CHECKPOINTS, STORE_LEGACY_BACKUPS], "readwrite", { durability: "strict" });
    const encodedWorldId = encodeURIComponent(worldId);
    await Promise.all([
      deleteMatching(idb.objectStore(STORE_META), (_value, key) => typeof key === "string" && (key.endsWith(`|${encodedWorldId}`) || key.includes(`|${encodedWorldId}|`))),
      deleteMatching(idb.objectStore(STORE_JOURNAL), (value) => (value as StoredJournal | undefined)?.worldId === worldId),
      deleteMatching(idb.objectStore(STORE_RECORDS), (value) => (value as StoredRecord | undefined)?.address?.universeId === `world:${worldId}`),
      deleteMatching(idb.objectStore(STORE_CHECKPOINTS), (value) => (value as StoredCheckpoint | undefined)?.checkpoint?.worldId === worldId),
      deleteMatching(idb.objectStore(STORE_LEGACY_BACKUPS), (value) => (value as StoredLegacyBackup | undefined)?.worldId === worldId),
    ]);
    await transactionDone(idb);
  }

  async close() {
    const pending = this.databasePromise;
    this.databasePromise = null;
    if (pending) (await pending).close();
  }

  async destroyForDiagnostics() {
    await this.close();
    if (!this.factory) return;
    await new Promise<void>((resolve, rejectDelete) => {
      const request = this.factory!.deleteDatabase(this.databaseName);
      request.onsuccess = () => resolve();
      request.onerror = () => rejectDelete(request.error ?? new Error("IndexedDB diagnostic cleanup failed"));
      request.onblocked = () => rejectDelete(new Error("IndexedDB diagnostic cleanup was blocked"));
    });
  }
}

/** Deterministic test/headless adapter with the same atomic preflight semantics. */
export class MemoryPersistenceAdapterV1 implements PersistencePlatformAdapterV1 {
  private readonly sequences = new Map<string, number>();
  private readonly records = new Map<string, StoredRecord>();
  private readonly checkpoints = new Map<string, PersistenceCheckpointV1>();
  private readonly latestCheckpoints = new Map<string, string>();

  async commit(transaction: PersistenceTransactionV1, checkpoint?: PersistenceCheckpointV1): Promise<PersistenceCommitResultV1> {
    const sequence = this.sequences.get(transaction.worldId) ?? 0;
    if (sequence !== transaction.expectedJournalSequence || transaction.nextJournalSequence !== sequence + 1) return reject(transaction, "stale-sequence", `Expected durable journal sequence ${sequence}.`);
    if (checkpoint && (checkpoint.worldId !== transaction.worldId || checkpoint.journalSequence !== transaction.nextJournalSequence)) return reject(transaction, "corrupt", "Checkpoint does not describe the transaction.");
    for (const mutation of transaction.mutations) {
      const key = persistenceRecordKeyV1(mutation.address);
      if ((this.records.get(key)?.revision ?? null) !== mutation.expectedRecordRevision) return reject(transaction, "record-conflict", `Record ${key} changed.`);
    }
    const next = new Map(this.records);
    for (const mutation of transaction.mutations) {
      const key = persistenceRecordKeyV1(mutation.address);
      if (mutation.operation === "delete") next.delete(key);
      else next.set(key, Object.freeze({ key, address: mutation.address, revision: mutation.nextRecordRevision, payload: Uint8Array.from(mutation.payload), payloadHash: mutation.payloadHash }));
    }
    this.records.clear(); for (const [key, value] of next) this.records.set(key, value);
    this.sequences.set(transaction.worldId, transaction.nextJournalSequence);
    if (checkpoint) await this.putCheckpoint(checkpoint);
    return Object.freeze({ status: "committed", transactionId: transaction.transactionId, journalSequence: transaction.nextJournalSequence, durableHash: transaction.transactionHash });
  }
  async putCheckpoint(checkpoint: PersistenceCheckpointV1, markLatest = true) {
    this.checkpoints.set(checkpointKey(checkpoint.worldId, checkpoint.checkpointId), cloneCheckpoint(checkpoint));
    if (markLatest) this.latestCheckpoints.set(checkpoint.worldId, checkpoint.checkpointId);
  }
  async readLatestCheckpoint(worldId: string) {
    const checkpointId = this.latestCheckpoints.get(worldId);
    return checkpointId ? this.readCheckpoint(worldId, checkpointId) : null;
  }
  async readCheckpoint(worldId: string, checkpointId: string) { const value = this.checkpoints.get(checkpointKey(worldId, checkpointId)); return value ? cloneCheckpoint(value) : null; }
  async readRecord(address: PersistenceRecordAddressV1, revision?: number) { const value = this.records.get(persistenceRecordKeyV1(address)); return !value || revision !== undefined && value.revision !== revision ? null : Uint8Array.from(value.payload); }
  async estimate() { return Object.freeze({ usage: [...this.records.values()].reduce((total, record) => total + record.payload.byteLength, 0), quota: null }); }
  async deleteWorld(worldId: string) {
    this.sequences.delete(worldId);
    this.latestCheckpoints.delete(worldId);
    for (const [key, record] of this.records) if (record.address.universeId === `world:${worldId}`) this.records.delete(key);
    for (const [key, checkpoint] of this.checkpoints) if (checkpoint.worldId === worldId) this.checkpoints.delete(key);
  }
}

export function persistenceAdapterSchemaV1() { return PERSISTENCE_SCHEMA_V1; }
