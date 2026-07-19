import assert from "node:assert/strict";
import { Item } from "../app/game/data";
import { advanceBestiaryResearch, createLivingBestiary } from "../app/game/living-bestiary";
import { MOB_ORDER } from "../app/game/mobs";
import { resolveContextualLoot } from "../app/game/contextual-loot";
import { updateThreatLedger, type ThreatEntry } from "../app/game/combat-resolver";
import { XZSpatialIndex } from "../app/game/spatial-index";
import { planRoadEvent } from "../app/game/surface-roads";

/**
 * Fast-forwards two representative in-game hours without rendering. This is a
 * collection-growth and deterministic hot-path soak, not a replacement for a
 * real browser playtest. It deliberately exercises more actors than the normal
 * local ecology target while proving every persistent ledger stays bounded.
 */
const SIMULATED_SECONDS = 2 * 60 * 60;
const ACTOR_COUNT = 320;
const PLAYER_INTERESTS = 8;
const startedAt = performance.now();
const startingHeap = process.memoryUsage().heapUsed;

type SoakActor = { id: number; x: number; z: number; radius: number };
const actors: SoakActor[] = Array.from({ length: ACTOR_COUNT }, (_, id) => ({
  id,
  x: (id % 32) * 5 - 80,
  z: Math.floor(id / 32) * 7 - 35,
  radius: .25 + (id % 7) * .08,
}));
const spatial = new XZSpatialIndex<SoakActor>(8);
spatial.rebuild(actors.map((actor, order) => ({ ...actor, value: actor, order })));

const bestiary = createLivingBestiary();
const roadEvents = new Map<string, ReturnType<typeof planRoadEvent>>();
const acquiredUniqueIds = new Set<string>();
let threat: readonly ThreatEntry[] = [];
let largestLocalQuery = 0;
let spatialQueries = 0;
let lootRolls = 0;
let researchWrites = 0;

for (let second = 0; second < SIMULATED_SECONDS; second += 1) {
  // Round-robin only one quarter of the population per simulated second, as
  // runtime ecology does for distant/coarse actors.
  const phase = second % 4;
  for (let index = phase; index < actors.length; index += 4) {
    const actor = actors[index];
    actor.x += Math.sin((second + actor.id * 13) * .017) * .09;
    actor.z += Math.cos((second + actor.id * 7) * .019) * .09;
    spatial.upsert({ id: actor.id, value: actor, x: actor.x, z: actor.z, radius: actor.radius, order: actor.id });
  }
  for (let player = 0; player < PLAYER_INTERESTS; player += 1) {
    const nearby = spatial.queryOverlappingCircle(Math.sin((second + player * 19) * .003) * 72, Math.cos((second + player * 31) * .003) * 72, 26);
    largestLocalQuery = Math.max(largestLocalQuery, nearby.length);
    spatialQueries += 1;
  }

  threat = updateThreatLedger(threat, { kind: "creature", id: second % 40 }, 1 + second % 5, second, 8);

  if (second % 15 === 0) {
    const anchorId = `road-anchor-${Math.floor(second / 15) % 64}`;
    roadEvents.set(anchorId, planRoadEvent("living-world-soak", anchorId, 12 + Math.floor(second / 1_200), second % 10));
  }

  if (second % 30 === 0) {
    const containerId = `soak-container-${Math.floor(second / 30) % 256}`;
    const loot = resolveContextualLoot({
      generatorVersion: 2,
      containerId,
      archetype: "chest",
      structureKind: second % 90 === 0 ? "dungeon-vault" : second % 60 === 0 ? "guild-hall" : "wilderness-cache",
      roomRole: second % 90 === 0 ? "reward" : second % 60 === 0 ? "public" : "supplies",
      biomeId: second % 24,
      depthBand: second % 120 === 0 ? "deep" : "surface",
      dangerTier: second % 10,
      progressionTags: [],
      seed: Math.imul(second + 1, 7919),
      acquiredUniqueIds,
      ...(second === 0 ? { criticalItems: [Item.Worldpin] } : {}),
    });
    for (const uniqueId of loot.uniqueIds) acquiredUniqueIds.add(uniqueId);
    lootRolls += 1;
  }

  if (second % 60 === 0) {
    const kind = MOB_ORDER[Math.floor(second / 60) % MOB_ORDER.length];
    bestiary[kind] = advanceBestiaryResearch(bestiary[kind], {
      id: "long-session-observation",
      title: "Long-session observation",
      goal: 3,
    }, 1, second * 1_000);
    researchWrites += 1;
  }
}

const durationMs = performance.now() - startedAt;
const endingHeap = process.memoryUsage().heapUsed;
const researchNodeCount = Object.values(bestiary).reduce((sum, entry) => sum + Object.keys(entry.research).length, 0);

assert.equal(spatial.size, ACTOR_COUNT);
assert.ok(largestLocalQuery < ACTOR_COUNT, "local broad phases must not degrade into whole-population scans");
assert.ok(threat.length <= 8, "threat ledgers must retain their authored cap");
assert.ok(roadEvents.size <= 64, "road-event anchors must overwrite instead of accumulating by visit");
assert.ok(acquiredUniqueIds.size <= 16, "the release loot families expose only a small bounded unique set");
assert.equal(Object.keys(bestiary).length, MOB_ORDER.length);
assert.ok(researchNodeCount <= MOB_ORDER.length, "the repeated research route must update one stable node per species");
assert.ok(durationMs < 30_000, "the deterministic two-hour fast-forward should remain a practical release gate");

process.stdout.write(`${JSON.stringify({
  simulatedHours: SIMULATED_SECONDS / 3_600,
  durationMs: Math.round(durationMs),
  heapDeltaMiB: Number(((endingHeap - startingHeap) / 1024 / 1024).toFixed(2)),
  actors: spatial.size,
  spatialQueries,
  largestLocalQuery,
  threatEntries: threat.length,
  roadEventAnchors: roadEvents.size,
  lootRolls,
  acquiredUniqueIds: acquiredUniqueIds.size,
  bestiaryEntries: Object.keys(bestiary).length,
  researchWrites,
  researchNodeCount,
  pass: true,
}, null, 2)}\n`);
