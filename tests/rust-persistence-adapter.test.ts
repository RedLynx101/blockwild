import assert from "node:assert/strict";
import test from "node:test";
import { MemoryPersistenceAdapterV1, persistenceAdapterSchemaV1 } from "../app/game/indexeddb-persistence-adapter.ts";
import {
  PERSISTENCE_SCHEMA_V1,
  createPersistenceCheckpointV1,
  createPersistenceTransactionV1,
  persistenceRecordKeyV1,
} from "../app/game/persistence-journal-contract.ts";
import {
  rustPersistencePlatformPayloadHashV1,
  type RustPersistencePlatformRequestV1,
} from "../app/game/rust-persistence-runtime-contract.ts";

const HASH_A = "0123456789abcdef0123456789abcdef";
const HASH_B = "fedcba9876543210fedcba9876543210";
const address = (recordId: string) => ({ universeId: "world:fixture", locationId: "overworld", kind: "entity" as const, recordId });

test("memory platform adapter preflights revisions and commits multi-record work atomically", async () => {
  const adapter = new MemoryPersistenceAdapterV1();
  const first = createPersistenceTransactionV1({
    transactionId: "transaction:1", worldId: "world:fixture", checkpointId: "checkpoint:base", expectedJournalSequence: 0, nextJournalSequence: 1,
    mutations: [
      { operation: "put", address: address("alpha"), expectedRecordRevision: null, nextRecordRevision: 1, payload: Uint8Array.from([1, 2]) },
      { operation: "put", address: address("zeta"), expectedRecordRevision: null, nextRecordRevision: 1, payload: Uint8Array.from([9, 8]) },
    ],
  });
  assert.equal((await adapter.commit(first)).status, "committed");
  const alphaBefore = await adapter.readRecord(address("alpha"));
  const conflicting = createPersistenceTransactionV1({
    transactionId: "transaction:2", worldId: "world:fixture", checkpointId: "checkpoint:base", expectedJournalSequence: 1, nextJournalSequence: 2,
    mutations: [
      { operation: "put", address: address("alpha"), expectedRecordRevision: 1, nextRecordRevision: 2, payload: Uint8Array.from([3]) },
      { operation: "put", address: address("zeta"), expectedRecordRevision: 9, nextRecordRevision: 10, payload: Uint8Array.from([7]) },
    ],
  });
  const rejected = await adapter.commit(conflicting);
  assert.equal(rejected.status, "rejected");
  if (rejected.status === "rejected") assert.equal(rejected.code, "record-conflict");
  assert.deepEqual(await adapter.readRecord(address("alpha")), alphaBefore, "a failed second record preflight leaves the first untouched");
  assert.equal((await adapter.estimate()).usage, 4);
});

test("checkpoint adapter copies records and resolves exact revisions", async () => {
  const adapter = new MemoryPersistenceAdapterV1();
  const transaction = createPersistenceTransactionV1({
    transactionId: "transaction:1", worldId: "world:fixture", checkpointId: "checkpoint:base", expectedJournalSequence: 0, nextJournalSequence: 1,
    mutations: [{ operation: "put", address: address("alpha"), expectedRecordRevision: null, nextRecordRevision: 1, payload: Uint8Array.from([1, 2]) }],
  });
  await adapter.commit(transaction);
  const mutation = transaction.mutations[0];
  assert.equal(mutation.operation, "put");
  if (mutation.operation !== "put") return;
  const checkpoint = createPersistenceCheckpointV1({
    checkpointId: "checkpoint:one", parentCheckpointId: null, worldId: "world:fixture", journalSequence: 1,
    generatorHash: HASH_A, contentHash: HASH_B, createdAt: 10,
    records: [{ address: mutation.address, revision: mutation.nextRecordRevision, byteLength: mutation.payload.byteLength, payloadHash: mutation.payloadHash }],
  });
  await adapter.putCheckpoint(checkpoint);
  const loaded = await adapter.readCheckpoint(checkpoint.worldId, checkpoint.checkpointId);
  assert.deepEqual(loaded, checkpoint);
  assert.notEqual(loaded, checkpoint);
  assert.deepEqual(await adapter.readRecord(address("alpha"), 1), Uint8Array.from([1, 2]));
  assert.equal(await adapter.readRecord(address("alpha"), 2), null);
  assert.match(persistenceRecordKeyV1(address("alpha")), /alpha$/u);
  assert.equal(persistenceAdapterSchemaV1(), PERSISTENCE_SCHEMA_V1);
});

test("immutable record versions keep exact parent checkpoints recoverable until Rust compacts them", async () => {
  const adapter = new MemoryPersistenceAdapterV1();
  const first = createPersistenceTransactionV1({
    transactionId: "transaction:version-1", worldId: "world:fixture", checkpointId: "checkpoint:one", expectedJournalSequence: 0, nextJournalSequence: 1,
    mutations: [{ operation: "put", address: address("alpha"), expectedRecordRevision: null, nextRecordRevision: 1, payload: Uint8Array.from([1, 2, 3]) }],
  });
  const firstMutation = first.mutations[0];
  assert.equal(firstMutation.operation, "put");
  if (firstMutation.operation !== "put") return;
  const firstCheckpoint = createPersistenceCheckpointV1({
    checkpointId: "checkpoint:one", parentCheckpointId: null, worldId: first.worldId, journalSequence: 1,
    generatorHash: HASH_A, contentHash: HASH_B, createdAt: 1,
    records: [{ address: firstMutation.address, revision: 1, byteLength: firstMutation.payload.byteLength, payloadHash: firstMutation.payloadHash }],
  });
  assert.equal((await adapter.commit(first, firstCheckpoint)).status, "committed");

  const second = createPersistenceTransactionV1({
    transactionId: "transaction:version-2", worldId: "world:fixture", checkpointId: "checkpoint:two", expectedJournalSequence: 1, nextJournalSequence: 2,
    mutations: [{ operation: "put", address: address("alpha"), expectedRecordRevision: 1, nextRecordRevision: 2, payload: Uint8Array.from([9, 8, 7]) }],
  });
  const secondMutation = second.mutations[0];
  assert.equal(secondMutation.operation, "put");
  if (secondMutation.operation !== "put") return;
  const secondCheckpoint = createPersistenceCheckpointV1({
    checkpointId: "checkpoint:two", parentCheckpointId: firstCheckpoint.checkpointId, worldId: second.worldId, journalSequence: 2,
    generatorHash: HASH_A, contentHash: HASH_B, createdAt: 2,
    records: [{ address: secondMutation.address, revision: 2, byteLength: secondMutation.payload.byteLength, payloadHash: secondMutation.payloadHash }],
  });
  assert.equal((await adapter.commit(second, secondCheckpoint)).status, "committed");
  assert.deepEqual(await adapter.readRecord(address("alpha"), 1), Uint8Array.from([1, 2, 3]));
  assert.deepEqual(await adapter.readRecord(address("alpha"), 2), Uint8Array.from([9, 8, 7]));

  const compact = (limit: number, requestId: number): RustPersistencePlatformRequestV1 => {
    const payload = new Uint8Array();
    return Object.freeze({
      kind: "platform", operation: "compact", requestId, worldId: second.worldId,
      objectId: secondCheckpoint.checkpointId, expectedHeadHash: secondCheckpoint.checkpointHash,
      cursor: 0, limit, totalBytes: 0, payloadHash: rustPersistencePlatformPayloadHashV1(payload), payload,
    });
  };
  assert.equal((await adapter.executePlatform(compact(1, 1))).code, "accepted");
  assert.ok(await adapter.readCheckpoint(firstCheckpoint.worldId, firstCheckpoint.checkpointId));
  assert.deepEqual(await adapter.readRecord(address("alpha"), 1), Uint8Array.from([1, 2, 3]));
  assert.equal((await adapter.executePlatform(compact(0, 2))).code, "accepted");
  assert.equal(await adapter.readCheckpoint(firstCheckpoint.worldId, firstCheckpoint.checkpointId), null);
  assert.equal(await adapter.readRecord(address("alpha"), 1), null);
  assert.deepEqual(await adapter.readRecord(address("alpha"), 2), Uint8Array.from([9, 8, 7]));
});

test("legacy catalog and native location world ids both delete their immutable record history", async () => {
  const adapter = new MemoryPersistenceAdapterV1();
  const legacyAddress = { universeId: "world:catalog-fixture", locationId: "overworld", kind: "entity" as const, recordId: "legacy" };
  const transaction = createPersistenceTransactionV1({
    transactionId: "transaction:legacy-delete", worldId: "catalog-fixture", checkpointId: "checkpoint:legacy",
    expectedJournalSequence: 0, nextJournalSequence: 1,
    mutations: [{ operation: "put", address: legacyAddress, expectedRecordRevision: null, nextRecordRevision: 1, payload: Uint8Array.of(4, 2) }],
  });
  assert.equal((await adapter.commit(transaction)).status, "committed");
  await adapter.deleteWorld("catalog-fixture");
  assert.equal(await adapter.readRecord(legacyAddress), null);
  assert.equal(await adapter.readRecord(legacyAddress, 1), null);
});
