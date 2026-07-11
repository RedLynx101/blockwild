import assert from "node:assert/strict";
import test from "node:test";
import { BlockId } from "../app/game/data.ts";
import {
  SUNWARD_COMPASS,
  planBiomeVegetation,
  planStructure,
  rollStructureLoot,
  chunksTouchedByStructure,
  structureMarkersForChunk,
  structurePlacementsForChunk,
  structureCandidateForChunk,
  structureClearanceBounds,
  structureBiomeFromId,
  isInsideStructureClearance,
  structureLootTable,
  type StructureKind,
} from "../app/game/structures.ts";
import {
  createWeatherState,
  isFullOvercastStorm,
  planCloudCluster,
  planCloudField,
  stepWeather,
  weatherBiomeFromId,
  weatherOptionsForBiome,
  weatherVisuals,
} from "../app/game/weather.ts";

test("weather is deterministic and constrained by biome", () => {
  const context = { seed: "field-guide", biome: "desert" as const };
  assert.deepEqual(createWeatherState(context, 7), createWeatherState(context, 7));
  const options = weatherOptionsForBiome("desert").map((entry) => entry.kind);
  assert.ok(options.includes("sandstorm"));
  assert.equal(options.includes("snow"), false);
  assert.equal(weatherBiomeFromId(3), "meadow");
  assert.equal(weatherBiomeFromId(14), "volcanic");
  assert.equal(weatherBiomeFromId(17), "cloudreed");
  assert.equal(weatherBiomeFromId(18), "forest");
  assert.equal(weatherBiomeFromId(19), "forest");
  assert.equal(weatherBiomeFromId(20), "ocean");
  assert.equal(structureBiomeFromId(17), "meadow");
  const cloudreedOptions = weatherOptionsForBiome("cloudreed");
  assert.ok(cloudreedOptions.some((entry) => entry.kind === "mist"));
  assert.ok(cloudreedOptions.some((entry) => entry.kind === "drizzle"));

  const initial = createWeatherState(context, 3);
  const advanced = stepWeather(initial, context, initial.durationSeconds + 1);
  assert.equal(advanced.cycle, 4);
  assert.equal(advanced.elapsedSeconds, 1);
});

test("weather visuals and cloud clusters are bounded and poofy", () => {
  const weather = createWeatherState({ seed: 88, biome: "ocean" }, 2);
  const cluster = planCloudCluster(88, 3, -2, weather);
  assert.ok(cluster.lobes.length >= 9 && cluster.lobes.length <= 15);
  assert.ok(cluster.lobes.every((lobe) => lobe.scaleX >= 2.9 && lobe.scaleY >= 1.3));
  assert.deepEqual(cluster, planCloudCluster(88, 3, -2, weather));
  assert.ok(planCloudField(88, 0, 0, 20, weather).length <= 17 ** 2, "cloud radius is hard-capped at eight cells");
  const visuals = weatherVisuals(weather);
  assert.ok(visuals.cloudCoverage >= 0 && visuals.cloudCoverage <= 1);
});

test("thunder owns the entire sky and hides celestial sprites", () => {
  const storm = {
    kind: "thunder" as const,
    cycle: 4,
    elapsedSeconds: 30,
    durationSeconds: 180,
    intensity: 0.85,
    windAngle: 0,
    windSpeed: 6,
  };
  const visuals = weatherVisuals(storm);
  assert.equal(isFullOvercastStorm(storm), true);
  assert.equal(visuals.fullOvercast, true);
  assert.equal(visuals.cloudCoverage, 1);
  assert.equal(visuals.sunVisibility, 0);
  assert.equal(visuals.celestialVisibility, 0);
  assert.equal(planCloudField("storm", 0, 0, 3, storm).length, 0, "the unified overcast sky replaces discrete storm clouds");
});

test("every POI emits deterministic blocks, a chest, and semantic spawn markers", () => {
  const kinds: StructureKind[] = ["desert-temple", "forest-temple", "sunbun-grove", "meadow-butterfly-sanctuary"];
  for (const kind of kinds) {
    const plan = planStructure(kind, { x: 32, y: 40, z: -16 }, "poi-seed");
    assert.deepEqual(plan, planStructure(kind, { x: 32, y: 40, z: -16 }, "poi-seed"));
    assert.ok(plan.placements.length > 20, `${kind} needs explicit block edits`);
    assert.ok(plan.placements.every((block) => Number.isInteger(block.x) && Number.isInteger(block.y) && Number.isInteger(block.z)));
    const chestMarkers = plan.markers.filter((marker) => marker.type === "chest");
    const spawnMarkers = plan.markers.filter((marker) => marker.type === "spawn");
    assert.ok(chestMarkers.length >= 1, `${kind} needs a loot container`);
    assert.ok(spawnMarkers.length >= 1, `${kind} needs inhabitants or guardians`);
    for (const chest of chestMarkers) {
      assert.ok(plan.placements.some((block) => block.block === BlockId.Chest
        && block.x === chest.position.x && block.y === chest.position.y && block.z === chest.position.z));
    }
  }
  assert.equal(planStructure("desert-temple", { x: 0, y: 40, z: 0 }, 1).markers.some((marker) => marker.type === "spawn" && marker.mobKind === "dune-warden"), true);
  assert.equal(planStructure("forest-temple", { x: 0, y: 40, z: 0 }, 1).markers.some((marker) => marker.type === "spawn" && marker.mobKind === "rootbound-sentinel"), true);
});

test("cross-chunk structure helpers partition every placement and marker exactly once", () => {
  const plan = planStructure("meadow-butterfly-sanctuary", { x: 15, y: 40, z: 15 }, "edge-seed");
  const touched = chunksTouchedByStructure(plan);
  assert.ok(touched.length >= 4);
  const blocks = touched.flatMap(({ chunkX, chunkZ }) => structurePlacementsForChunk(plan, chunkX, chunkZ));
  const markers = touched.flatMap(({ chunkX, chunkZ }) => structureMarkersForChunk(plan, chunkX, chunkZ));
  assert.equal(blocks.length, plan.placements.length);
  assert.equal(new Set(blocks.map((block) => `${block.x},${block.y},${block.z}`)).size, plan.placements.length);
  assert.equal(markers.length, plan.markers.length);

  const clearing = structureClearanceBounds(plan);
  assert.equal(clearing.minX, plan.bounds.min.x - 4);
  assert.equal(clearing.maxZ, plan.bounds.max.z + 4);
  assert.equal(isInsideStructureClearance(plan, plan.bounds.max.x + 4, plan.origin.z), true);
  assert.equal(isInsideStructureClearance(plan, plan.bounds.max.x + 5, plan.origin.z), false);
});

test("temple loot tables include a rare durable magical compass", () => {
  for (const tableId of ["desert-temple", "forest-temple"] as const) {
    const bonus = structureLootTable(tableId).bonuses.find((entry) => entry.itemKey === SUNWARD_COMPASS.itemKey);
    assert.ok(bonus);
    assert.equal(bonus.durability, 4096);
    assert.ok(bonus.chance > 0 && bonus.chance < 0.1);
    assert.deepEqual(rollStructureLoot(tableId, 42), rollStructureLoot(tableId, 42));
  }
});

test("regional POI candidates are sparse and repeatable across negative chunks", () => {
  const found: Array<{ x: number; z: number; kind: StructureKind }> = [];
  for (let z = -24; z <= 24; z += 1) {
    for (let x = -24; x <= 24; x += 1) {
      const kind = structureCandidateForChunk({ seed: "world", chunkX: x, chunkZ: z, biome: "meadow" });
      if (kind) found.push({ x, z, kind });
    }
  }
  assert.ok(found.length > 0 && found.length < 30);
  for (const candidate of found) {
    assert.equal(structureCandidateForChunk({ seed: "world", chunkX: candidate.x, chunkZ: candidate.z, biome: "meadow" }), candidate.kind);
  }
});

test("desert and meadow vegetation planners emit explicit deterministic placements", () => {
  const surfaceYAt = (x: number, z: number) => 30 + ((x + z) & 1);
  const desert = planBiomeVegetation({ seed: "plants", biome: "desert", chunkX: -2, chunkZ: 3, surfaceYAt });
  const meadow = planBiomeVegetation({ seed: "plants", biome: "meadow", chunkX: 2, chunkZ: -3, surfaceYAt });
  assert.deepEqual(desert, planBiomeVegetation({ seed: "plants", biome: "desert", chunkX: -2, chunkZ: 3, surfaceYAt }));
  assert.ok(desert.features.length > 0);
  assert.ok(meadow.features.length > desert.features.length);
  assert.ok(desert.placements.every((placement) => placement.x >= -32 && placement.x < -16 && placement.z >= 48 && placement.z < 64));
  assert.ok(meadow.placements.every((placement) => placement.x >= 32 && placement.x < 48 && placement.z >= -48 && placement.z < -32));
  assert.ok(meadow.features.some((feature) => feature.variant !== "meadow-grass"));
});
