import { TypeScriptCanonicalHasher } from "./rust-kernel-shadow";
import { type WorldAddressV1 } from "./world-authority-contract";

/** Canonical R8 journal/checkpoint boundary. IndexedDB remains a TS platform adapter. */
export const PERSISTENCE_SCHEMA_V1 = 1 as const;
export const PERSISTENCE_PROTOCOL_V1 = 1 as const;
export const PERSISTENCE_MAX_MUTATIONS_V1 = 4_096;
export const PERSISTENCE_MAX_RECORD_BYTES_V1 = 64 * 1024 * 1024;
export const PERSISTENCE_MAX_TRANSACTION_BYTES_V1 = 96 * 1024 * 1024;

const HASH_PATTERN = /^[0-9a-f]{32}$/u;

export type PersistenceRecordKindV1 =
  | "location-manifest"
  | "chunk-edits"
  | "entity"
  | "actor-digest"
  | "machine"
  | "player"
  | "map-knowledge"
  | "cardforge"
  | "quest"
  | "settings-reference";

export const PERSISTENCE_RECORD_KIND_ORDER_V1: readonly PersistenceRecordKindV1[] = Object.freeze([
  "location-manifest", "chunk-edits", "entity", "actor-digest", "machine", "player",
  "map-knowledge", "cardforge", "quest", "settings-reference",
]);

export type PersistenceRecordAddressV1 = WorldAddressV1 & Readonly<{
  kind: PersistenceRecordKindV1;
  recordId: string;
}>;

export type PersistenceRecordRevisionV1 = Readonly<{
  epoch: number;
  sequence: number;
  record: number;
}>;

export type PersistencePutV1 = Readonly<{
  operation: "put";
  address: PersistenceRecordAddressV1;
  expectedRecordRevision: number | null;
  nextRecordRevision: number;
  payload: Uint8Array;
  payloadHash: string;
}>;

export type PersistenceDeleteV1 = Readonly<{
  operation: "delete";
  address: PersistenceRecordAddressV1;
  expectedRecordRevision: number;
  nextRecordRevision: number;
}>;

export type PersistenceMutationV1 = PersistencePutV1 | PersistenceDeleteV1;

export type PersistenceTransactionV1 = Readonly<{
  schemaVersion: typeof PERSISTENCE_SCHEMA_V1;
  transactionId: string;
  worldId: string;
  checkpointId: string;
  expectedJournalSequence: number;
  nextJournalSequence: number;
  mutations: readonly PersistenceMutationV1[];
  byteLength: number;
  transactionHash: string;
}>;

export type PersistenceTransactionV1Source = Omit<PersistenceTransactionV1, "schemaVersion" | "mutations" | "byteLength" | "transactionHash"> & Readonly<{
  mutations: readonly (Omit<PersistencePutV1, "payloadHash" | "payload"> & Readonly<{ payload: Uint8Array }> | PersistenceDeleteV1)[];
}>;

export type PersistenceRecordDescriptorV1 = Readonly<{
  address: PersistenceRecordAddressV1;
  revision: number;
  byteLength: number;
  payloadHash: string;
}>;

export type PersistenceCheckpointV1 = Readonly<{
  schemaVersion: typeof PERSISTENCE_SCHEMA_V1;
  checkpointId: string;
  parentCheckpointId: string | null;
  worldId: string;
  journalSequence: number;
  generatorHash: string;
  contentHash: string;
  createdAt: number;
  records: readonly PersistenceRecordDescriptorV1[];
  checkpointHash: string;
}>;

export type PersistenceCheckpointV1Source = Omit<PersistenceCheckpointV1, "schemaVersion" | "records" | "checkpointHash"> & Readonly<{
  records: readonly PersistenceRecordDescriptorV1[];
}>;

export type PersistenceLegacyMigrationBundleV1 = Readonly<{
  schemaVersion: typeof PERSISTENCE_SCHEMA_V1;
  sourceKey: string;
  sourceFormat: "blockwild-world-v2" | "blockwild-world-export-v1";
  worldId: string;
  normalizedPayload: Uint8Array;
  sourceHash: string;
  normalizedHash: string;
  migrationHash: string;
}>;

export type PersistenceCommitResultV1 =
  | Readonly<{ status: "committed"; transactionId: string; journalSequence: number; durableHash: string }>
  | Readonly<{ status: "rejected"; transactionId: string; code: "stale-sequence" | "record-conflict" | "quota" | "corrupt" | "unavailable"; message: string }>;

export interface PersistencePlatformAdapterV1 {
  /** One IndexedDB readwrite transaction; partial mutation visibility is forbidden. */
  commit(transaction: PersistenceTransactionV1): Promise<PersistenceCommitResultV1>;
  readCheckpoint(worldId: string, checkpointId: string): Promise<PersistenceCheckpointV1 | null>;
  readRecord(address: PersistenceRecordAddressV1, revision?: number): Promise<Uint8Array | null>;
  estimate(): Promise<Readonly<{ usage: number; quota: number | null }>>;
}

export type PersistenceRecoveryCandidateV1 = Readonly<{
  checkpoint: PersistenceCheckpointV1;
  availableRecordHashes: ReadonlyMap<string, string>;
}>;

export type PersistenceRecoveryDecisionV1 = Readonly<{
  status: "ready" | "repairable" | "unrecoverable";
  checkpoint: PersistenceCheckpointV1 | null;
  missingRecords: readonly string[];
  corruptRecords: readonly string[];
  message: string;
}>;

export class PersistenceContractError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "PersistenceContractError";
  }
}

function integer(value: number, minimum: number, maximum: number, name: string) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new PersistenceContractError("invalid-integer", `${name} must be an integer in ${minimum}..${maximum}`);
  return Object.is(value, -0) ? 0 : value;
}

function label(value: string, name: string, maximum = 180) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximum) throw new PersistenceContractError("invalid-label", `${name} must be a non-empty string no longer than ${maximum} code units`);
  return value;
}

function hash(value: string, name: string) {
  if (!HASH_PATTERN.test(value)) throw new PersistenceContractError("invalid-hash", `${name} must be a canonical 128-bit lowercase hash`);
  return value;
}

/** Match JavaScript's code-unit ordering without locale or platform dependence. */
function compareOrdinal(left: string, right: string) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function bytes(view: ArrayBufferView) {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

export function persistenceRecordKeyV1(address: PersistenceRecordAddressV1) {
  label(address.universeId, "address.universeId", 64);
  label(address.locationId, "address.locationId", 128);
  if (!PERSISTENCE_RECORD_KIND_ORDER_V1.includes(address.kind)) throw new PersistenceContractError("record-kind", "persistence record kind is unknown");
  label(address.recordId, "address.recordId", 256);
  return `${encodeURIComponent(address.universeId)}@${encodeURIComponent(address.locationId)}/${address.kind}/${encodeURIComponent(address.recordId)}`;
}

export function persistencePayloadHashV1(payload: Uint8Array) {
  return new TypeScriptCanonicalHasher("blockwild-persistence-record-v1").writeBytes(payload).finishHex();
}

function writeAddress(hasher: TypeScriptCanonicalHasher, address: PersistenceRecordAddressV1) {
  hasher.writeString(address.universeId).writeString(address.locationId).writeString(address.kind).writeString(address.recordId);
}

function normalizeMutation(value: PersistenceTransactionV1Source["mutations"][number], index: number): PersistenceMutationV1 {
  const address = Object.freeze({ ...value.address });
  persistenceRecordKeyV1(address);
  const expectedRecordRevision = value.expectedRecordRevision === null ? null : integer(value.expectedRecordRevision, 0, Number.MAX_SAFE_INTEGER, `mutations[${index}].expectedRecordRevision`);
  const nextRecordRevision = integer(value.nextRecordRevision, 1, Number.MAX_SAFE_INTEGER, `mutations[${index}].nextRecordRevision`);
  if (expectedRecordRevision !== null && nextRecordRevision !== expectedRecordRevision + 1) throw new PersistenceContractError("record-revision", "next record revision must be exactly one greater than expected");
  if (expectedRecordRevision === null && nextRecordRevision !== 1) throw new PersistenceContractError("record-create-revision", "a newly created record begins at revision 1");
  if (value.operation === "delete") {
    if (expectedRecordRevision === null) throw new PersistenceContractError("delete-missing-record", "delete requires an existing expected record revision");
    return Object.freeze({ operation: "delete", address, expectedRecordRevision, nextRecordRevision });
  }
  if (!(value.payload instanceof Uint8Array)) throw new PersistenceContractError("record-payload", "record payload must be Uint8Array");
  if (value.payload.byteLength > PERSISTENCE_MAX_RECORD_BYTES_V1) throw new PersistenceContractError("record-size", "record payload exceeds the V1 byte budget");
  const payload = Uint8Array.from(value.payload);
  return Object.freeze({ operation: "put", address, expectedRecordRevision, nextRecordRevision, payload, payloadHash: persistencePayloadHashV1(payload) });
}

export function createPersistenceTransactionV1(source: PersistenceTransactionV1Source): PersistenceTransactionV1 {
  label(source.transactionId, "transactionId"); label(source.worldId, "worldId"); label(source.checkpointId, "checkpointId");
  const expectedJournalSequence = integer(source.expectedJournalSequence, 0, Number.MAX_SAFE_INTEGER, "expectedJournalSequence");
  const nextJournalSequence = integer(source.nextJournalSequence, 1, Number.MAX_SAFE_INTEGER, "nextJournalSequence");
  if (nextJournalSequence !== expectedJournalSequence + 1) throw new PersistenceContractError("journal-sequence", "next journal sequence must be exactly one greater than expected");
  if (source.mutations.length < 1 || source.mutations.length > PERSISTENCE_MAX_MUTATIONS_V1) throw new PersistenceContractError("mutation-count", `transaction requires 1..${PERSISTENCE_MAX_MUTATIONS_V1} mutations`);
  const mutations = source.mutations.map(normalizeMutation).sort((left, right) => compareOrdinal(persistenceRecordKeyV1(left.address), persistenceRecordKeyV1(right.address)));
  for (let index = 1; index < mutations.length; index += 1) if (persistenceRecordKeyV1(mutations[index - 1].address) === persistenceRecordKeyV1(mutations[index].address)) throw new PersistenceContractError("duplicate-record", "one transaction may mutate each record at most once");
  const byteLength = mutations.reduce((total, mutation) => total + (mutation.operation === "put" ? mutation.payload.byteLength : 0), 0);
  if (byteLength > PERSISTENCE_MAX_TRANSACTION_BYTES_V1) throw new PersistenceContractError("transaction-size", "transaction payload exceeds the V1 byte budget");
  const withoutHash = Object.freeze({ schemaVersion: PERSISTENCE_SCHEMA_V1, transactionId: source.transactionId, worldId: source.worldId, checkpointId: source.checkpointId,
    expectedJournalSequence, nextJournalSequence, mutations: Object.freeze(mutations), byteLength });
  const hasher = new TypeScriptCanonicalHasher("blockwild-persistence-transaction-v1");
  hasher.writeU16(withoutHash.schemaVersion).writeString(withoutHash.transactionId).writeString(withoutHash.worldId).writeString(withoutHash.checkpointId)
    .writeU64(expectedJournalSequence).writeU64(nextJournalSequence).writeU32(mutations.length);
  for (const mutation of mutations) {
    hasher.writeString(mutation.operation); writeAddress(hasher, mutation.address); hasher.writeU16(mutation.expectedRecordRevision === null ? 0 : 1);
    if (mutation.expectedRecordRevision !== null) hasher.writeU64(mutation.expectedRecordRevision);
    hasher.writeU64(mutation.nextRecordRevision);
    if (mutation.operation === "put") hasher.writeString(mutation.payloadHash).writeBytes(mutation.payload);
  }
  return Object.freeze({ ...withoutHash, transactionHash: hasher.finishHex() });
}

export function persistenceTransactionTransferListV1(transaction: PersistenceTransactionV1) {
  const result: ArrayBuffer[] = [];
  const seen = new Set<ArrayBuffer>();
  for (const mutation of transaction.mutations) if (mutation.operation === "put") {
    if (!(mutation.payload.buffer instanceof ArrayBuffer)) throw new PersistenceContractError("shared-buffer", "V1 persistence payloads require transferable ArrayBuffers");
    if (!seen.has(mutation.payload.buffer)) { seen.add(mutation.payload.buffer); result.push(mutation.payload.buffer); }
  }
  return result;
}

export function createPersistenceCheckpointV1(source: PersistenceCheckpointV1Source): PersistenceCheckpointV1 {
  label(source.checkpointId, "checkpointId"); if (source.parentCheckpointId !== null) label(source.parentCheckpointId, "parentCheckpointId"); label(source.worldId, "worldId");
  const journalSequence = integer(source.journalSequence, 0, Number.MAX_SAFE_INTEGER, "journalSequence"); hash(source.generatorHash, "generatorHash"); hash(source.contentHash, "contentHash");
  const createdAt = integer(source.createdAt, 0, Number.MAX_SAFE_INTEGER, "createdAt");
  const records = source.records.map((record) => Object.freeze({ address: Object.freeze({ ...record.address }), revision: integer(record.revision, 1, Number.MAX_SAFE_INTEGER, "record.revision"),
    byteLength: integer(record.byteLength, 0, PERSISTENCE_MAX_RECORD_BYTES_V1, "record.byteLength"), payloadHash: hash(record.payloadHash, "record.payloadHash") }))
    .sort((left, right) => compareOrdinal(persistenceRecordKeyV1(left.address), persistenceRecordKeyV1(right.address)));
  for (let index = 1; index < records.length; index += 1) if (persistenceRecordKeyV1(records[index - 1].address) === persistenceRecordKeyV1(records[index].address)) throw new PersistenceContractError("duplicate-record", "checkpoint contains duplicate record addresses");
  const withoutHash = Object.freeze({ schemaVersion: PERSISTENCE_SCHEMA_V1, checkpointId: source.checkpointId, parentCheckpointId: source.parentCheckpointId, worldId: source.worldId,
    journalSequence, generatorHash: source.generatorHash, contentHash: source.contentHash, createdAt, records: Object.freeze(records) });
  const hasher = new TypeScriptCanonicalHasher("blockwild-persistence-checkpoint-v1");
  hasher.writeU16(withoutHash.schemaVersion).writeString(withoutHash.checkpointId).writeU16(withoutHash.parentCheckpointId === null ? 0 : 1);
  if (withoutHash.parentCheckpointId) hasher.writeString(withoutHash.parentCheckpointId);
  hasher.writeString(withoutHash.worldId).writeU64(journalSequence).writeString(withoutHash.generatorHash).writeString(withoutHash.contentHash).writeU64(createdAt).writeU32(records.length);
  for (const record of records) { writeAddress(hasher, record.address); hasher.writeU64(record.revision).writeU32(record.byteLength).writeString(record.payloadHash); }
  return Object.freeze({ ...withoutHash, checkpointHash: hasher.finishHex() });
}

export function createLegacyMigrationBundleV1(source: Omit<PersistenceLegacyMigrationBundleV1, "schemaVersion" | "normalizedPayload" | "sourceHash" | "normalizedHash" | "migrationHash"> & Readonly<{ sourcePayload: Uint8Array; normalizedPayload: Uint8Array }>): PersistenceLegacyMigrationBundleV1 {
  label(source.sourceKey, "sourceKey", 256); label(source.worldId, "worldId");
  if (!(source.sourcePayload instanceof Uint8Array) || !(source.normalizedPayload instanceof Uint8Array)) throw new PersistenceContractError("migration-payload", "legacy and normalized migration payloads must be Uint8Array");
  const normalizedPayload = Uint8Array.from(source.normalizedPayload);
  const sourceHash = persistencePayloadHashV1(source.sourcePayload);
  const normalizedHash = persistencePayloadHashV1(normalizedPayload);
  const hasher = new TypeScriptCanonicalHasher("blockwild-persistence-migration-v1");
  hasher.writeU16(PERSISTENCE_SCHEMA_V1).writeString(source.sourceKey).writeString(source.sourceFormat).writeString(source.worldId).writeString(sourceHash).writeString(normalizedHash);
  return Object.freeze({ schemaVersion: PERSISTENCE_SCHEMA_V1, sourceKey: source.sourceKey, sourceFormat: source.sourceFormat, worldId: source.worldId, normalizedPayload, sourceHash, normalizedHash, migrationHash: hasher.finishHex() });
}

/** Select the newest semantically complete checkpoint without mutating any source. */
export function decidePersistenceRecoveryV1(candidates: readonly PersistenceRecoveryCandidateV1[]): PersistenceRecoveryDecisionV1 {
  const ordered = [...candidates].sort((left, right) => right.checkpoint.journalSequence - left.checkpoint.journalSequence || right.checkpoint.createdAt - left.checkpoint.createdAt);
  let bestRepair: PersistenceRecoveryDecisionV1 | null = null;
  for (const candidate of ordered) {
    const missing: string[] = [];
    const corrupt: string[] = [];
    for (const record of candidate.checkpoint.records) {
      const key = persistenceRecordKeyV1(record.address);
      const available = candidate.availableRecordHashes.get(key);
      if (available === undefined) missing.push(key);
      else if (available !== record.payloadHash) corrupt.push(key);
    }
    if (!missing.length && !corrupt.length) return Object.freeze({ status: "ready", checkpoint: candidate.checkpoint, missingRecords: Object.freeze([]), corruptRecords: Object.freeze([]), message: "Newest complete checkpoint is ready." });
    if (!bestRepair || missing.length + corrupt.length < bestRepair.missingRecords.length + bestRepair.corruptRecords.length) {
      bestRepair = Object.freeze({ status: "repairable", checkpoint: candidate.checkpoint, missingRecords: Object.freeze(missing), corruptRecords: Object.freeze(corrupt), message: "Checkpoint requires record repair or fallback to an older complete checkpoint." });
    }
  }
  return bestRepair ?? Object.freeze({ status: "unrecoverable", checkpoint: null, missingRecords: Object.freeze([]), corruptRecords: Object.freeze([]), message: "No checkpoint is available; preserve the legacy source and request import or repair." });
}

/** Dirty-record compaction never rewrites unchanged payloads. */
export function planPersistenceCompactionV1(checkpoint: PersistenceCheckpointV1, journal: readonly PersistenceTransactionV1[]) {
  const latest = new Map(checkpoint.records.map((record) => [persistenceRecordKeyV1(record.address), record]));
  let expectedSequence = checkpoint.journalSequence;
  for (const transaction of [...journal].sort((left, right) => left.nextJournalSequence - right.nextJournalSequence)) {
    if (transaction.expectedJournalSequence !== expectedSequence) throw new PersistenceContractError("journal-gap", `journal sequence gap after ${expectedSequence}`);
    expectedSequence = transaction.nextJournalSequence;
    for (const mutation of transaction.mutations) {
      const key = persistenceRecordKeyV1(mutation.address);
      if (mutation.operation === "delete") latest.delete(key);
      else latest.set(key, Object.freeze({ address: mutation.address, revision: mutation.nextRecordRevision, byteLength: mutation.payload.byteLength, payloadHash: mutation.payloadHash }));
    }
  }
  return Object.freeze({ journalSequence: expectedSequence, records: Object.freeze([...latest.values()].sort((left, right) => compareOrdinal(persistenceRecordKeyV1(left.address), persistenceRecordKeyV1(right.address)))) });
}

export function persistencePayloadMatchesV1(payload: Uint8Array, expectedHash: string) {
  return persistencePayloadHashV1(bytes(payload)) === hash(expectedHash, "expectedHash");
}
