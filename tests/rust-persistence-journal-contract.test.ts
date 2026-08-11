import assert from "node:assert/strict";
import test from "node:test";
import {
  PersistenceContractError,
  createLegacyMigrationBundleV1,
  createPersistenceCheckpointV1,
  createPersistenceTransactionV1,
  decidePersistenceRecoveryV1,
  persistencePayloadMatchesV1,
  persistenceRecordKeyV1,
  persistenceTransactionTransferListV1,
  planPersistenceCompactionV1,
  type PersistenceRecordAddressV1,
  type PersistenceTransactionV1Source,
} from "../app/game/persistence-journal-contract.ts";

const HASH_A = "0123456789abcdef0123456789abcdef";
const HASH_B = "fedcba9876543210fedcba9876543210";
const address = (recordId: string, kind: PersistenceRecordAddressV1["kind"] = "entity"): PersistenceRecordAddressV1 => Object.freeze({
  universeId: "universe:primary",
  locationId: "overworld",
  kind,
  recordId,
});

function transaction(mutations: PersistenceTransactionV1Source["mutations"], sequence = 0) {
  return createPersistenceTransactionV1({
    transactionId: `transaction:${sequence + 1}`,
    worldId: "world:fixture",
    checkpointId: "checkpoint:base",
    expectedJournalSequence: sequence,
    nextJournalSequence: sequence + 1,
    mutations,
  });
}

function put(recordId: string, payload: readonly number[], expectedRecordRevision: number | null = null) {
  return {
    operation: "put" as const,
    address: address(recordId),
    expectedRecordRevision,
    nextRecordRevision: expectedRecordRevision === null ? 1 : expectedRecordRevision + 1,
    payload: Uint8Array.from(payload),
  };
}

test("journal transactions are canonical, revisioned, and own coarse payload buffers", () => {
  const sourceA = put("zeta", [9, 8, 7]);
  const sourceB = put("alpha", [1, 2, 3]);
  const forward = transaction([sourceA, sourceB]);
  const reverse = transaction([sourceB, sourceA]);
  assert.equal(forward.transactionHash, reverse.transactionHash);
  assert.deepEqual(forward.mutations.map((mutation) => mutation.address.recordId), ["alpha", "zeta"]);
  assert.equal(persistenceTransactionTransferListV1(forward).length, 2);
  const owned = forward.mutations.find((mutation) => mutation.address.recordId === "zeta");
  assert.equal(owned?.operation, "put");
  if (owned?.operation !== "put") return;
  assert.notEqual(owned.payload.buffer, sourceA.payload.buffer);
  sourceA.payload[0] = 0;
  assert.deepEqual([...owned.payload], [9, 8, 7]);
  assert.ok(persistencePayloadMatchesV1(owned.payload, owned.payloadHash));
});

test("duplicate records, journal gaps, and invalid record revisions fail closed", () => {
  assert.throws(() => transaction([put("same", [1]), put("same", [2])]), (error: unknown) => error instanceof PersistenceContractError && error.code === "duplicate-record");
  assert.throws(() => createPersistenceTransactionV1({
    transactionId: "gap",
    worldId: "world:fixture",
    checkpointId: "checkpoint:base",
    expectedJournalSequence: 3,
    nextJournalSequence: 5,
    mutations: [put("one", [1])],
  }), (error: unknown) => error instanceof PersistenceContractError && error.code === "journal-sequence");
  assert.throws(() => transaction([{ ...put("one", [1]), nextRecordRevision: 2 }]), (error: unknown) => error instanceof PersistenceContractError && error.code === "record-create-revision");
});

test("checkpoints have deterministic record order and recovery falls back to the newest complete state", () => {
  const alpha = { address: address("alpha"), revision: 1, byteLength: 3, payloadHash: HASH_A };
  const zeta = { address: address("zeta"), revision: 2, byteLength: 5, payloadHash: HASH_B };
  const older = createPersistenceCheckpointV1({
    checkpointId: "checkpoint:older", parentCheckpointId: null, worldId: "world:fixture", journalSequence: 4,
    generatorHash: HASH_A, contentHash: HASH_B, createdAt: 10, records: [zeta, alpha],
  });
  const newer = createPersistenceCheckpointV1({
    checkpointId: "checkpoint:newer", parentCheckpointId: older.checkpointId, worldId: "world:fixture", journalSequence: 5,
    generatorHash: HASH_A, contentHash: HASH_B, createdAt: 20, records: [alpha, zeta],
  });
  assert.deepEqual(older.records.map((record) => record.address.recordId), ["alpha", "zeta"]);
  assert.equal(older.checkpointHash, createPersistenceCheckpointV1({
    checkpointId: "checkpoint:older", parentCheckpointId: null, worldId: "world:fixture", journalSequence: 4,
    generatorHash: HASH_A, contentHash: HASH_B, createdAt: 10, records: [alpha, zeta],
  }).checkpointHash);
  const complete = new Map([[persistenceRecordKeyV1(alpha.address), HASH_A], [persistenceRecordKeyV1(zeta.address), HASH_B]]);
  const corrupt = new Map([[persistenceRecordKeyV1(alpha.address), HASH_B]]);
  const decision = decidePersistenceRecoveryV1([{ checkpoint: newer, availableRecordHashes: corrupt }, { checkpoint: older, availableRecordHashes: complete }]);
  assert.equal(decision.status, "ready");
  assert.equal(decision.checkpoint?.checkpointId, older.checkpointId);
  const repair = decidePersistenceRecoveryV1([{ checkpoint: newer, availableRecordHashes: corrupt }]);
  assert.equal(repair.status, "repairable");
  assert.deepEqual(repair.corruptRecords, [persistenceRecordKeyV1(alpha.address)]);
  assert.deepEqual(repair.missingRecords, [persistenceRecordKeyV1(zeta.address)]);
});

test("compaction advances contiguous journals and rewrites descriptors only for dirty records", () => {
  const alpha = { address: address("alpha"), revision: 1, byteLength: 1, payloadHash: HASH_A };
  const beta = { address: address("beta"), revision: 1, byteLength: 2, payloadHash: HASH_B };
  const checkpoint = createPersistenceCheckpointV1({
    checkpointId: "checkpoint:base", parentCheckpointId: null, worldId: "world:fixture", journalSequence: 0,
    generatorHash: HASH_A, contentHash: HASH_B, createdAt: 1, records: [alpha, beta],
  });
  const first = transaction([put("alpha", [4, 5], 1)], 0);
  const second = transaction([{ operation: "delete", address: beta.address, expectedRecordRevision: 1, nextRecordRevision: 2 }], 1);
  const compacted = planPersistenceCompactionV1(checkpoint, [second, first]);
  assert.equal(compacted.journalSequence, 2);
  assert.deepEqual(compacted.records.map((record) => [record.address.recordId, record.revision]), [["alpha", 2]]);
  assert.throws(() => planPersistenceCompactionV1(checkpoint, [second]), (error: unknown) => error instanceof PersistenceContractError && error.code === "journal-gap");
});

test("legacy migration hashes copies without mutating the only source", () => {
  const sourcePayload = Uint8Array.from([9, 7, 5, 3]);
  const normalizedPayload = Uint8Array.from([1, 3, 5, 7]);
  const sourceBefore = Uint8Array.from(sourcePayload);
  const bundle = createLegacyMigrationBundleV1({
    sourceKey: "legacy:world:fixture",
    sourceFormat: "blockwild-world-v2",
    worldId: "world:fixture",
    sourcePayload,
    normalizedPayload,
  });
  assert.deepEqual(sourcePayload, sourceBefore);
  assert.notEqual(bundle.normalizedPayload.buffer, normalizedPayload.buffer);
  normalizedPayload[0] = 255;
  assert.deepEqual([...bundle.normalizedPayload], [1, 3, 5, 7]);
  assert.match(bundle.sourceHash, /^[0-9a-f]{32}$/u);
  assert.match(bundle.normalizedHash, /^[0-9a-f]{32}$/u);
  assert.match(bundle.migrationHash, /^[0-9a-f]{32}$/u);
});
