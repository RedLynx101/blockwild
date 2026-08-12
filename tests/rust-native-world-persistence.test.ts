import assert from "node:assert/strict";
import test from "node:test";
import {
  createPersistenceCheckpointV1,
  type PersistenceCheckpointV1,
} from "../app/game/persistence-journal-contract.ts";
import {
  RustNativeWorldPersistenceSessionV1,
  type RustNativeWorldPersistenceSessionOptionsV1,
} from "../app/game/rust-native-world-persistence.ts";
import { RustIntegratedRuntimeServiceError } from "../app/game/rust-integrated-runtime-service.ts";

const HASH_A = "0123456789abcdef0123456789abcdef";
const HASH_B = "fedcba9876543210fedcba9876543210";
const STATE = Object.freeze({
  revision: Object.freeze({ epoch: 1, world: 1, entities: 1, gameplay: 1, persistence: 1, network: 1, simulation: 1 }),
  tick: 1,
  stateHash: "1".repeat(32),
});

function checkpoint(checkpointId: string, parentCheckpointId: string | null, sequence: number): PersistenceCheckpointV1 {
  const kinds = ["location-manifest", "chunk-edits", "entity", "player", "settings-reference"] as const;
  return createPersistenceCheckpointV1({
    checkpointId,
    parentCheckpointId,
    worldId: "universe:fixture@overworld",
    journalSequence: sequence,
    generatorHash: HASH_A,
    contentHash: HASH_B,
    createdAt: sequence,
    records: kinds.map((kind, index) => ({
      address: { universeId: "universe:fixture", locationId: "overworld", kind, recordId: `native-world-state-${index}-v1` },
      revision: sequence,
      byteLength: 4,
      payloadHash: HASH_A,
    })),
  });
}

function saveProgress(stageId: string) {
  return Object.freeze({
    type: "runtime-bulk-save-progress-v1" as const,
    requestId: 1,
    clientEpoch: 1,
    workerEpoch: 1,
    current: STATE,
    stageId,
    state: "finalized" as const,
    receivedChunks: 0,
    chunkCount: 0,
    receivedBytes: 0,
    setHash: HASH_A,
    manifestHash: HASH_B,
    dispatcherRequestId: 1,
    remainingDirtyRecords: 0,
  });
}

function hydration(recoveryId: string, compatibility = false) {
  return Object.freeze({
    type: "runtime-bulk-hydration-v1" as const,
    requestId: 1,
    clientEpoch: 1,
    workerEpoch: 1,
    current: STATE,
    recoveryId,
    nativeDomains: 5,
    chunkCount: compatibility ? 1 : 0,
    totalBytes: compatibility ? 128 : 0,
    compatibilityHash: compatibility ? HASH_A : "0".repeat(32),
  });
}

function receipt() {
  return Promise.resolve(Object.freeze({ requestId: 1, persistenceRevision: 1, pending: 1, queuedBytes: 1, stateHash: HASH_A, closed: false }));
}

function fixture(options: Readonly<{
  latest?: PersistenceCheckpointV1 | null;
  hydrate?(checkpointId: string): Promise<ReturnType<typeof hydration>>;
  initialize?(saveId: string, createdAt: number): Promise<ReturnType<typeof saveProgress>>;
}> = {}) {
  const checkpoints = new Map<string, PersistenceCheckpointV1>();
  let latest = options.latest ?? null;
  if (latest) {
    let cursor: PersistenceCheckpointV1 | null = latest;
    while (cursor) {
      checkpoints.set(cursor.checkpointId, cursor);
      cursor = null;
    }
  }
  const operations: string[] = [];
  let pumpClosed = false;
  let flushes = 0;
  const runtime = {
    async initializeNativeSave(saveId: string, createdAt: number) {
      operations.push(`initialize:${saveId}:${createdAt}`);
      if (options.initialize) return options.initialize(saveId, createdAt);
      latest = checkpoint(`checkpoint:${createdAt}`, latest?.checkpointId ?? null, (latest?.journalSequence ?? 0) + 1);
      checkpoints.set(latest.checkpointId, latest);
      return saveProgress(saveId);
    },
    async hydrateCompatibilityRecovery(checkpointId: string) {
      operations.push(`hydrate:${checkpointId}`);
      return options.hydrate ? options.hydrate(checkpointId) : hydration(checkpointId);
    },
  } as unknown as RustNativeWorldPersistenceSessionOptionsV1["runtime"];
  const port = {
    recover(_worldId: string, checkpointId?: string) { operations.push(`recover:${checkpointId ?? "latest"}`); return receipt(); },
    readRecoveryPage(_worldId: string, checkpointId: string, start: number) { operations.push(`page:${checkpointId}:${start}`); return receipt(); },
    close() { operations.push("close"); return receipt(); },
  } as unknown as RustNativeWorldPersistenceSessionOptionsV1["port"];
  const pump = {
    async flush() { flushes += 1; operations.push("flush"); return Object.freeze({ operations: 1, requestBytes: 10, responseBytes: 11, idle: true }); },
    async shutdown() { operations.push("pump-shutdown"); pumpClosed = true; },
    isClosed() { return pumpClosed; },
  } as unknown as RustNativeWorldPersistenceSessionOptionsV1["pump"];
  const reader = {
    async readLatestCheckpoint() { return latest; },
    async readCheckpoint(_worldId: string, checkpointId: string) { return checkpoints.get(checkpointId) ?? null; },
  };
  const session = new RustNativeWorldPersistenceSessionV1({
    worldId: "universe:fixture@overworld",
    runtime,
    port,
    pump,
    checkpoints: reader,
  });
  return { session, operations, checkpoints, setLatest(value: PersistenceCheckpointV1) { latest = value; checkpoints.set(value.checkpointId, value); }, get flushes() { return flushes; } };
}

test("new native world initialization uses the durable bulk lane and proves a checkpoint head", async () => {
  const value = fixture();
  const saved = await value.session.initializeNewWorld(100);
  assert.equal(saved.worldId, "universe:fixture@overworld");
  assert.equal(saved.checkpointId, "checkpoint:100");
  assert.equal(saved.records, 5);
  assert.equal(saved.commits, 1);
  assert.deepEqual(value.operations.map((entry) => entry.split(":")[0]), ["initialize", "flush"]);
  assert.equal(value.session.diagnostics().saves, 1);
  await assert.rejects(value.session.initializeNewWorld(101), /already-initialized/u);
});

test("paged recovery falls back from a corrupt head to the exact retained parent", async () => {
  const parent = checkpoint("checkpoint:parent", null, 1);
  const head = checkpoint("checkpoint:head", parent.checkpointId, 2);
  const value = fixture({
    latest: head,
    hydrate: async (checkpointId) => {
      if (checkpointId === head.checkpointId) throw new RustIntegratedRuntimeServiceError("bulk-platform", "recovery-native-world: head bytes are corrupt");
      return hydration(checkpointId);
    },
  });
  value.checkpoints.set(parent.checkpointId, parent);
  const recovered = await value.session.recoverAndHydrate();
  assert.equal(recovered.status, "hydrated");
  if (recovered.status !== "hydrated") return;
  assert.equal(recovered.checkpointId, parent.checkpointId);
  assert.equal(recovered.fallbackDepth, 1);
  assert.deepEqual(value.operations.filter((entry) => !entry.startsWith("flush")), [
    "recover:checkpoint:head",
    "page:checkpoint:head:0",
    "page:checkpoint:head:1",
    "page:checkpoint:head:2",
    "page:checkpoint:head:3",
    "page:checkpoint:head:4",
    "hydrate:checkpoint:head",
    "recover:checkpoint:parent",
    "page:checkpoint:parent:0",
    "page:checkpoint:parent:1",
    "page:checkpoint:parent:2",
    "page:checkpoint:parent:3",
    "page:checkpoint:parent:4",
    "hydrate:checkpoint:parent",
  ]);
  assert.equal(value.session.diagnostics().parentFallbacks, 1);
});

test("compatibility-bearing hydration remains explicitly blocked without a lossless adapter", async () => {
  const head = checkpoint("checkpoint:legacy", null, 1);
  const value = fixture({ latest: head, hydrate: async (checkpointId) => hydration(checkpointId, true) });
  const recovered = await value.session.recoverAndHydrate();
  assert.equal(recovered.status, "blocked");
  if (recovered.status !== "blocked") return;
  assert.equal(recovered.code, "compatibility-adapter-required");
  assert.match(recovered.message, /protected compatibility bytes/u);
});

test("quota rejection does not fabricate a durable head and shutdown drains before close", async () => {
  const rejected = fixture({
    initialize: async () => { throw new RustIntegratedRuntimeServiceError("bulk-platform", "quota: fixture rejected"); },
  });
  await assert.rejects(rejected.session.initializeNewWorld(1), /quota/u);
  assert.equal(rejected.session.diagnostics().saves, 0);

  const value = fixture();
  await value.session.initializeNewWorld(2);
  await value.session.shutdown();
  assert.deepEqual(value.operations.slice(-4), ["flush", "flush", "close", "pump-shutdown"]);
  assert.equal(value.session.diagnostics().state, "closed");
  await assert.rejects(value.session.saveNative(3), /closed/u);
});
