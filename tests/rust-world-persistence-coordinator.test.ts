import assert from "node:assert/strict";
import test from "node:test";
import type { WorldSave } from "../app/game/engine.ts";
import { MemoryPersistenceAdapterV1 } from "../app/game/indexeddb-persistence-adapter.ts";
import { WorldPersistenceCoordinatorV1 } from "../app/game/world-persistence-coordinator.ts";
import { encodeCanonicalWorldSaveValueV1 } from "../app/game/world-save-sharding.ts";

const decoder = new TextDecoder();
const canonical = (value: unknown) => JSON.parse(decoder.decode(encodeCanonicalWorldSaveValueV1(value))) as unknown;

function save(day = 1): WorldSave {
  return {
    version: 2, generatorVersion: 18, seed: "COORDINATOR", mode: "survival", edits: { "0,0": [[17, 3]] },
    player: { x: 1, y: 50, z: -2, yaw: 0.3, pitch: -0.1 }, spawn: { x: 0, y: 48, z: 0 }, inventory: [], selected: 0,
    health: 10, hunger: 10, xp: 0, level: 0, time: 0.32, day, weather: "clear", furnaces: {}, chests: {}, savedAt: 900 + day,
  };
}

test("world persistence coordinator atomically advances records and head checkpoints", async () => {
  const adapter = new MemoryPersistenceAdapterV1();
  const coordinator = new WorldPersistenceCoordinatorV1(adapter, () => 1_000);
  const first = await coordinator.persistWorld("world-a", save(1));
  assert.equal(first.status, "committed");
  assert.equal(first.checkpoint.journalSequence, 1);
  assert.deepEqual(canonical(await coordinator.readWorld("world-a")), canonical(save(1)));

  const unchanged = await coordinator.persistWorld("world-a", save(1));
  assert.equal(unchanged.status, "unchanged");
  assert.equal(unchanged.checkpoint.checkpointHash, first.checkpoint.checkpointHash);

  const second = await coordinator.persistWorld("world-a", save(2));
  assert.equal(second.checkpoint.journalSequence, 2);
  assert.ok(second.dirtyRecordKeys.length >= 1);
  assert.deepEqual(canonical(await coordinator.readWorld("world-a")), canonical(save(2)));
});

test("a fresh coordinator hydrates the durable head without renderer or localStorage", async () => {
  const adapter = new MemoryPersistenceAdapterV1();
  const writer = new WorldPersistenceCoordinatorV1(adapter, () => 2_000);
  await Promise.all([writer.persistWorld("world-a", save(1)), writer.persistWorld("world-a", save(2)), writer.persistWorld("world-a", save(3))]);
  await writer.flush();

  const reader = new WorldPersistenceCoordinatorV1(adapter, () => 3_000);
  const hydrated = await reader.readWorld("world-a");
  assert.deepEqual(canonical(hydrated), canonical(save(3)));
  const checkpoint = await adapter.readLatestCheckpoint("world-a");
  assert.equal(checkpoint?.journalSequence, 3, "queued writes must retain strict per-world ordering");
});

test("different worlds use independent queues and checkpoints", async () => {
  const adapter = new MemoryPersistenceAdapterV1();
  const coordinator = new WorldPersistenceCoordinatorV1(adapter, () => 4_000);
  await Promise.all([coordinator.persistWorld("world-a", save(4)), coordinator.persistWorld("world-b", { ...save(5), seed: "OTHER" })]);
  assert.equal((await adapter.readLatestCheckpoint("world-a"))?.journalSequence, 1);
  assert.equal((await adapter.readLatestCheckpoint("world-b"))?.journalSequence, 1);
  assert.equal((await coordinator.readWorld("world-a"))?.seed, "COORDINATOR");
  assert.equal((await coordinator.readWorld("world-b"))?.seed, "OTHER");
});

test("cross-tab stale heads reload once and deleted worlds leave no durable head", async () => {
  const adapter = new MemoryPersistenceAdapterV1();
  const first = new WorldPersistenceCoordinatorV1(adapter, () => 5_000);
  await first.persistWorld("world-a", save(1));
  const second = new WorldPersistenceCoordinatorV1(adapter, () => 5_001);
  assert.equal((await second.readWorld("world-a"))?.day, 1, "second tab caches the initial head");
  await first.persistWorld("world-a", save(2));
  const recovered = await second.persistWorld("world-a", save(3));
  assert.equal(recovered.checkpoint.journalSequence, 3, "stale cross-tab state should reload and retry exactly once");
  assert.equal((await second.readWorld("world-a"))?.day, 3);

  await second.deleteWorld("world-a");
  assert.equal(await adapter.readLatestCheckpoint("world-a"), null);
  const emptyReader = new WorldPersistenceCoordinatorV1(adapter);
  assert.equal(await emptyReader.readWorld("world-a"), null);
});
