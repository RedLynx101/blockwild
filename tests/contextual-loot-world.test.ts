import assert from "node:assert/strict";
import test from "node:test";
import {
  CONTEXTUAL_LOOT_GENERATOR_VERSION,
  normalizeContextualLootWorldState,
  resolveContextualLoot,
} from "../app/game/contextual-loot";

const vaultContext = (acquiredUniqueIds = new Set<string>()) => ({
  generatorVersion: CONTEXTUAL_LOOT_GENERATOR_VERSION,
  containerId: "test-vault:0,0,0",
  archetype: "reliquary" as const,
  structureKind: "rootbound-vault-reliquary",
  roomRole: "reward",
  biomeId: 0,
  depthBand: "abyssal" as const,
  dangerTier: 10,
  ownership: "hostile" as const,
  lockTier: 6,
  progressionTags: ["boss-cleared"],
  seed: 27,
  acquiredUniqueIds,
  luck: 1000,
});

test("contextual loot reports ownership and never issues one unique twice in a container", () => {
  const result = resolveContextualLoot(vaultContext());
  assert.equal(result.ownership, "hostile");
  assert.equal(new Set(result.uniqueIds).size, result.uniqueIds.length);
  const replay = resolveContextualLoot(vaultContext(new Set(result.uniqueIds)));
  assert.equal(replay.uniqueIds.length, 0);
  assert.notDeepEqual(replay.slots, result.slots, "issued uniques should deterministically fall back on later world rolls");
});

test("contextual loot world state bounds and migrates unique and container ledgers", () => {
  const state = normalizeContextualLootWorldState({
    acquiredUniqueIds: ["vault-worldpin", "vault-worldpin", "vault-nocturne-heart"],
    containers: {
      "1,2,3": { generatorVersion: 2, familyId: "dungeon-vault", ownership: "private", theft: true, theftReported: false },
      broken: { generatorVersion: 2, familyId: "missing", ownership: "private" },
    },
  });
  assert.deepEqual(state.acquiredUniqueIds, ["vault-worldpin", "vault-nocturne-heart"]);
  assert.deepEqual(Object.keys(state.containers), ["1,2,3"]);
  assert.equal(state.containers["1,2,3"].theft, true);
});
