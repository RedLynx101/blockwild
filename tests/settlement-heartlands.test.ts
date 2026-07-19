import assert from "node:assert/strict";
import test from "node:test";

import { FACTIONS } from "../app/game/factions.ts";
import { Item, ITEMS } from "../app/game/data.ts";
import { COMMERCE_CATALOG } from "../app/game/economy.ts";
import { commerceItemCode } from "../app/game/hearthroads-adapter.ts";
import {
  SettlementIndex,
  normalizeSettlementPlacementOptions,
  normalizeWorldOriginPreference,
  querySettlementProvince,
  type SettlementPlacementOptions,
  type SettlementTerrainSampler,
} from "../app/game/settlement-index.ts";
import {
  createMapKnowledge,
  discoverSettlement,
  fastTravelDestination,
  normalizeMapKnowledge,
} from "../app/game/map-system.ts";
import { ChunkWorld, settlementBiomeFromId } from "../app/game/world.ts";

const flatMeadow: SettlementTerrainSampler = () => ({ height: 48, waterline: 32, biome: "flower-meadow" });

const heartlands = normalizeSettlementPlacementOptions({
  settlementPattern: "heartlands-v2",
  settlementDensity: 1,
  settlementClustering: "regional",
  roadCoverage: "regional",
  largeTownFrequency: "balanced",
  structures: true,
  enabledFactions: ["hobbits"],
});

test("heartland provinces are deterministic, clustered, and preserve wild provinces across negative coordinates", () => {
  const seed = "HEARTHLAND-DISTRIBUTION";
  const first = Array.from({ length: 49 }, (_, index) => {
    const provinceX = index % 7 - 3;
    const provinceZ = Math.floor(index / 7) - 3;
    return querySettlementProvince(seed, heartlands, provinceX, provinceZ, flatMeadow);
  });
  const replay = first.map((province) => querySettlementProvince(seed, heartlands, province.provinceX, province.provinceZ, flatMeadow));
  assert.deepEqual(replay, first);
  assert.ok(first.some((province) => province.classification === "wild" && province.memberRegions.length === 0), "the default needs genuine wilderness voids");
  assert.ok(first.some((province) => province.classification === "heartland" && province.memberRegions.length >= 4), "the default needs multi-settlement heartlands");
  for (const province of first) assert.equal(new Set(province.memberRegions.map((region) => `${region.x},${region.z}`)).size, province.memberRegions.length);
});

test("the pure locator and later chunk materialization resolve the exact same settlement identity", () => {
  const world = new ChunkWorld();
  world.reset("GUIDE-PARITY", undefined, {
    ...heartlands,
    profile: "world-below-v15",
    caveFrequency: 1,
    biomeScale: 1.35,
    resourceAbundance: 1,
    origin: { mode: "wilderness" },
  });
  const located = world.queryNearestSettlement({ origin: { x: 0, z: 0 }, maxRegionRadius: 30 });
  assert.ok(located, "a bounded regional search should find a deterministic settlement");
  world.initializeAround(located.candidate.center.x, located.candidate.center.z);
  const generated = world.settlementPlans.get(located.candidate.id);
  assert.ok(generated, "the indexed destination should materialize when its chunks load");
  assert.deepEqual(generated.candidate, located.candidate);
});

test("a guide query finds a faction settlement without allocating chunks or settlement state", () => {
  const world = new ChunkWorld();
  world.reset("REMOTE-FACTION-GUIDE", undefined, {
    ...heartlands,
    profile: "world-below-v15",
    caveFrequency: 1,
    biomeScale: 1.35,
    resourceAbundance: 1,
    origin: { mode: "wilderness" },
  });
  const beforeChunks = world.chunks.size;
  const beforePlans = world.settlementPlans.size;
  const result = world.queryNearestSettlement({ origin: { x: 9000, z: -7000 }, factionIds: ["hobbits"], sizes: ["town", "village"], maxRegionRadius: 48 });
  assert.ok(result);
  assert.equal(result.candidate.factionId, "hobbits");
  assert.ok(result.candidate.size === "town" || result.candidate.size === "village");
  assert.equal(world.chunks.size, beforeChunks);
  assert.equal(world.settlementPlans.size, beforePlans);
  assert.equal(FACTIONS[result.candidate.factionId].name, "Hearthkin Freeholds");
});

test("every enabled culture has a deterministic off-map origin in a compatible habitat", () => {
  const habitats = {
    hobbits: { biome: "flower-meadow", height: 48, waterline: 32 },
    goblins: { biome: "badlands", height: 52, waterline: 32 },
    atlantians: { biome: "deep-ocean", height: 8, waterline: 32 },
    sugarcourt: { biome: "sugarplum-vale", height: 48, waterline: 32 },
    "wood-elves": { biome: "glimmerwood", height: 48, waterline: 32 },
    dwarves: { biome: "snowcap-range", height: 58, waterline: 32 },
  } as const;
  for (const [factionId, terrain] of Object.entries(habitats)) {
    const index = new SettlementIndex();
    const result = index.queryNearest("ORIGIN-CULTURE-AUDIT", {
      ...heartlands,
      enabledFactions: [factionId as keyof typeof habitats],
      settlementDensity: 1.5,
    }, { origin: { x: 0, z: 0 }, maxRegionRadius: 48 }, () => terrain);
    assert.ok(result, `${factionId} should receive a deterministic compatible origin`);
    assert.equal(result.candidate.factionId, factionId);
  }
});

test("legacy worlds keep a queryable scattered guide index", () => {
  const index = new SettlementIndex();
  const result = index.queryNearest("LEGACY-GUIDE-COMPATIBILITY", {
    ...heartlands,
    settlementPattern: "legacy-scattered-v1",
  }, { origin: { x: -4100, z: 3200 }, factionIds: ["hobbits"], maxRegionRadius: 48 }, flatMeadow);
  assert.ok(result);
  assert.equal(result.candidate.factionId, "hobbits");
});

test("settlement knowledge upgrades monotonically and only visited settlements allow charged travel", () => {
  const base = createMapKnowledge("world", "player");
  const rumored = discoverSettlement(base, {
    id: "settlement:freehold-test",
    name: "Rumored Freehold",
    position: { x: 1200, y: 48, z: -500 },
    playerId: "guide",
    discoveredAt: 10,
    icon: "settlement",
    settlementKnowledge: "rumored",
    factionId: "hobbits",
    settlementSize: "village",
  });
  assert.equal(fastTravelDestination(rumored, "settlement:freehold-test"), null);
  const charted = discoverSettlement(rumored, {
    id: "settlement:freehold-test", name: "Charted Freehold", position: { x: 1188, y: 48, z: -512 }, playerId: "cartographer", discoveredAt: 20,
    settlementKnowledge: "charted", factionId: "hobbits", settlementSize: "village",
  });
  assert.equal(charted.markers[0].settlementKnowledge, "charted");
  assert.equal(fastTravelDestination(charted, "settlement:freehold-test"), null);
  const visited = discoverSettlement(charted, {
    id: "settlement:freehold-test", name: "Moonbank Freehold", position: { x: 1188, y: 48, z: -512 }, playerId: "player", discoveredAt: 30,
    settlementKnowledge: "visited", factionId: "hobbits", settlementSize: "village",
  });
  assert.equal(fastTravelDestination(visited, "settlement:freehold-test")?.id, "settlement:freehold-test");
  assert.equal(normalizeMapKnowledge(JSON.parse(JSON.stringify(visited))).markers[0].settlementKnowledge, "visited");
});

test("origin normalization never silently substitutes a disabled culture", () => {
  assert.deepEqual(normalizeWorldOriginPreference({ mode: "culture-settlement", factionId: "goblins", minimumSize: "town" }, ["hobbits"]), { mode: "wilderness" });
  assert.deepEqual(normalizeWorldOriginPreference({ mode: "culture-settlement", factionId: "hobbits", minimumSize: "village" }, ["hobbits"]), { mode: "culture-settlement", factionId: "hobbits", minimumSize: "village" });
});

test("road graphs are deterministic, tiered, and cross-province edges have one stable owner", () => {
  const index = new SettlementIndex();
  let observed = false;
  for (let attempt = 0; attempt < 40 && !observed; attempt += 1) {
    const seed = `ROAD-PROVINCE-${attempt}`;
    const edges = index.roadConnectionsForProvince(seed, { ...heartlands, settlementDensity: 1.6, roadCoverage: "dense" }, 0, 0, flatMeadow);
    const replay = index.roadConnectionsForProvince(seed, { ...heartlands, settlementDensity: 1.6, roadCoverage: "dense" }, 0, 0, flatMeadow);
    assert.deepEqual(replay, edges);
    const trunk = edges.find((edge) => edge.tier === "trunk");
    if (!trunk) continue;
    assert.equal(trunk.ownerProvinceId, "province:0,0");
    const neighborEdges = index.roadConnectionsForProvince(seed, { ...heartlands, settlementDensity: 1.6, roadCoverage: "dense" }, 1, 0, flatMeadow);
    assert.equal(neighborEdges.filter((edge) => edge.id === trunk.id).length, 0, "the neighboring province must not emit the same trunk edge");
    observed = true;
  }
  assert.equal(observed, true, "the seed audit should encounter a cross-province trunk");
});

test("heartland road tiers and ownership survive save restoration", () => {
  const world = new ChunkWorld();
  world.restoreSurfaceRoadGraph({
    "heartroads:-2,3": [{
      id: "trunk:test", from: { id: "a", x: -400, z: 120 }, to: { id: "b", x: 900, z: 120 }, length: 1300, loop: false,
      tier: "trunk", ownerProvinceId: "province:-2,3",
    }],
  });
  assert.deepEqual(world.serializeSurfaceRoadGraph()["heartroads:-2,3"], [{
    id: "trunk:test", from: { id: "a", x: -400, z: 120 }, to: { id: "b", x: 900, z: 120 }, length: 1300, loop: false,
    tier: "trunk", ownerProvinceId: "province:-2,3",
  }]);
});

test("the limited route folio is a real reusable commerce item contract", () => {
  assert.equal(ITEMS[Item.HearthroadsGazetteer].useKind, "settlement-chart");
  assert.equal(commerceItemCode("hearthroads-route-folio"), Item.HearthroadsGazetteer);
  assert.equal(COMMERCE_CATALOG["hearthroads-route-folio"].stackLimit, ITEMS[Item.HearthroadsGazetteer].maxStack);
});

test("index caches are bounded and explicit wilderness settings perform no work", () => {
  const index = new SettlementIndex();
  const options: SettlementPlacementOptions = { ...heartlands, settlementDensity: 0 };
  assert.equal(index.queryNearest("NO-TOWNS", options, { origin: { x: 0, z: 0 }, maxRegionRadius: 96 }, flatMeadow), null);
  assert.equal(index.cacheSize, 0);
});

test("actual terrain adapters expose settlement biomes without chunk allocation", () => {
  const world = new ChunkWorld();
  world.reset("TERRAIN-ADAPTER");
  const before = world.chunks.size;
  const sample = world.sampleColumn(-512, 768);
  assert.equal(typeof sample.height, "number");
  const biome = settlementBiomeFromId(sample.biome);
  assert.ok(biome === null || typeof biome === "string");
  assert.equal(world.chunks.size, before);
});
