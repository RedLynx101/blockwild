import assert from "node:assert/strict";
import test from "node:test";

import {
  createRustWorldRuntimeLiveConfigV1,
  createRustWorldRuntimeSessionIdV1,
} from "../app/game/rust-world-runtime-live-config";
import { GENERATOR_VERSION } from "../app/game/world";

test("live config uses durable world identity and the exact g18 generator", () => {
  assert.equal(GENERATOR_VERSION, 18);
  const config = createRustWorldRuntimeLiveConfigV1({
    worldId: "world-copy_01",
    worldSeed: "shared-seed",
    sessionId: "runtime.12345678",
  });
  assert.equal(config.universeId, "world:world-copy_01");
  assert.equal(config.locationId, "overworld");
  assert.equal(config.generatorHash, "161eef7e34381d450067b7ebedbcb4e1");
  assert.equal(config.waterBlockId, 7);
  assert.ok(config.directionalBlockIds.length > 0);
  assert.ok(config.waterloggedBlockIds.length > 0);
});

test("duplicated seeds remain separate universes and future locations remain explicit", () => {
  const base = { worldSeed: "same", sessionId: "runtime.12345678" } as const;
  const first = createRustWorldRuntimeLiveConfigV1({ ...base, worldId: "first" });
  const second = createRustWorldRuntimeLiveConfigV1({ ...base, worldId: "second", locationId: "orbit:station-1" });
  assert.notEqual(first.universeId, second.universeId);
  assert.equal(second.locationId, "orbit:station-1");
});

test("session generation is secure-injectable and invalid identities fail closed", () => {
  assert.equal(
    createRustWorldRuntimeSessionIdV1(() => "123e4567-e89b-12d3-a456-426614174000"),
    "runtime.123e4567-e89b-12d3-a456-426614174000",
  );
  assert.throws(() => createRustWorldRuntimeLiveConfigV1({ worldId: "../other", worldSeed: "x", sessionId: "runtime.12345678" }), /world ID/u);
  assert.throws(() => createRustWorldRuntimeLiveConfigV1({ worldId: "world", worldSeed: "", sessionId: "runtime.12345678" }), /world seed/u);
  assert.throws(() => createRustWorldRuntimeLiveConfigV1({ worldId: "world", worldSeed: "x", sessionId: "short" }), /session ID/u);
  assert.throws(() => createRustWorldRuntimeLiveConfigV1({ worldId: "world", worldSeed: "x", sessionId: "runtime.12345678", locationId: "../moon" }), /location ID/u);
});
