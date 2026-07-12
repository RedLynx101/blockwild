import test from "node:test";
import assert from "node:assert/strict";
import { BlockId, Item } from "../app/game/data";
import {
  DRAGON_EGG_HATCH_RULES,
  dragonLairCandidateForRegion,
  dragonLairMarkersForChunk,
  dragonLairPlacementsForChunk,
  planDragonLairForRegion,
  repairGeneratedTreePlan,
  insertArchiveTome,
  normalizeArchiveShelf,
  normalizeTomeDisplay,
  removeArchiveTome,
  setDisplayedTome,
  surveyNearestUndiscoveredDragonLair,
  treePlanIsFaceConnected,
  type DragonType,
} from "../app/game/dragon-world";
import { planFullTree, type TreeForm, type TreePlanBlock } from "../app/game/ecology";
import { ChunkWorld, GENERATOR_VERSION } from "../app/game/world";

test("Fire, Ice, and Steel lairs are bounded, deterministic, guarded hoards", () => {
  const expected = {
    fire: { wall: BlockId.CharredDragonstone, egg: BlockId.FireDragonEggBlock },
    ice: { wall: BlockId.RimeDragonstone, egg: BlockId.IceDragonEggBlock },
    steel: { wall: BlockId.RivetedDragonstone, egg: BlockId.SteelDragonEggBlock },
  } as const;
  for (const type of Object.keys(expected) as DragonType[]) {
    const input = { seed: "DRAGONWAKE-LAIRS", regionX: 8, regionZ: type === "fire" ? 3 : type === "ice" ? 4 : 5, forceType: type, forceStage: 5 as const, forceSex: "female" as const };
    const plan = planDragonLairForRegion(input);
    // Regions have a deterministic rarity gate; choose the next present one.
    const resolved = plan ?? Array.from({ length: 32 }, (_, offset) => planDragonLairForRegion({ ...input, regionX: input.regionX + offset + 1 })).find(Boolean) ?? null;
    assert.ok(resolved, `${type} lair should be discoverable in bounded regions`);
    assert.equal(resolved.type, type);
    assert.equal(resolved.stage, 5);
    assert.equal(resolved.sex, "female");
    assert.ok(resolved.origin.y <= -16);
    assert.ok(resolved.placements.length < 20_000, "lair planning stays bounded");
    assert.ok(resolved.placements.some((entry) => entry.block === expected[type].wall));
    assert.ok(resolved.placements.some((entry) => entry.block === BlockId.GoldBlock));
    assert.ok(resolved.placements.some((entry) => entry.block === BlockId.GoldPile));
    assert.ok(resolved.placements.some((entry) => entry.block === BlockId.Chest));
    assert.ok(resolved.placements.some((entry) => entry.block === expected[type].egg));
    const guardian = resolved.markers.find((marker) => marker.type === "spawn");
    assert.ok(guardian && guardian.type === "spawn");
    assert.equal(guardian.mobKind, `${type}-dragon`);
    assert.ok(guardian.persistent);
    assert.ok(guardian.tags?.includes("stage:5"));
    assert.ok(guardian.tags?.includes("permanent:true"));
    assert.deepEqual(planDragonLairForRegion({ ...input, regionX: Number(resolved.id.split(":")[2]), regionZ: Number(resolved.id.split(":")[3]) }), resolved);
  }
});

test("lair sex and age determine egg presence", () => {
  const find = (sex: "male" | "female", stage: 4 | 5) => {
    for (let regionX = 0; regionX < 80; regionX += 1) {
      const plan = planDragonLairForRegion({ seed: "EGG-RULES", regionX, regionZ: 2, forceType: "fire", forceStage: stage, forceSex: sex });
      if (plan) return plan;
    }
    throw new Error("expected a present deterministic lair");
  };
  assert.equal(find("male", 5).eggPositions.length, 0);
  assert.equal(find("female", 4).eggPositions.length, 1);
  assert.ok(find("female", 5).eggPositions.length >= 1 && find("female", 5).eggPositions.length <= 3);
  assert.equal(DRAGON_EGG_HATCH_RULES.fire.naturalCondition, "sustained-fire");
  assert.equal(DRAGON_EGG_HATCH_RULES.ice.naturalCondition, "freezing-water");
  assert.equal(DRAGON_EGG_HATCH_RULES.steel.naturalCondition, "pressurized-steam");
  assert.equal(DRAGON_EGG_HATCH_RULES.sea.naturalCondition, "living-coral-current");
});

test("chunk slices reconstruct a lair exactly across seams", () => {
  let plan = null;
  for (let regionX = -8; regionX <= 8 && !plan; regionX += 1) {
    plan = planDragonLairForRegion({ seed: "SEAM-LAIR", regionX, regionZ: -3, forceType: "steel", forceStage: 5, forceSex: "female" });
  }
  assert.ok(plan);
  const chunks = new Set(plan.placements.map((entry) => `${Math.floor(entry.x / 16)},${Math.floor(entry.z / 16)}`));
  assert.ok(chunks.size >= 4);
  const reconstructed = [...chunks].flatMap((key) => {
    const [chunkX, chunkZ] = key.split(",").map(Number);
    return dragonLairPlacementsForChunk(plan!, chunkX, chunkZ);
  });
  assert.deepEqual(new Set(reconstructed.map((entry) => `${entry.x},${entry.y},${entry.z}:${entry.block}`)), new Set(plan.placements.map((entry) => `${entry.x},${entry.y},${entry.z}:${entry.block}`)));
  const markerSlices = [...chunks].flatMap((key) => {
    const [chunkX, chunkZ] = key.split(",").map(Number);
    return dragonLairMarkersForChunk(plan!, chunkX, chunkZ);
  });
  assert.equal(markerSlices.length, plan.markers.length);
});

test("survey charter finds the nearest matching undiscovered lair and skips known lairs", () => {
  const first = surveyNearestUndiscoveredDragonLair({ seed: "SURVEY-ROAD", origin: { x: 0, z: 0 }, dragonType: "ice", minimumStage: 4, maxRegionRadius: 18 });
  assert.ok(first);
  assert.equal(first.dragonType, "ice");
  const second = surveyNearestUndiscoveredDragonLair({ seed: "SURVEY-ROAD", origin: { x: 0, z: 0 }, dragonType: "ice", minimumStage: 4, discoveredLairIds: [first.lairId], maxRegionRadius: 24 });
  assert.ok(second);
  assert.notEqual(second.lairId, first.lairId);
  const stageFive = surveyNearestUndiscoveredDragonLair({ seed: "SURVEY-ROAD", origin: { x: 0, z: 0 }, dragonType: "ice", minimumStage: 5, maxRegionRadius: 32 });
  assert.ok(stageFive);
  assert.equal(stageFive.actualStage, 5);
});

test("tree repair bridges log islands and prunes floating leaves", () => {
  const plan: TreePlanBlock[] = [
    { x: 15, y: 10, z: 0, block: BlockId.WildwoodLog },
    { x: 15, y: 11, z: 0, block: BlockId.WildwoodLog },
    { x: 17, y: 12, z: 0, block: BlockId.WildwoodLog },
    { x: 18, y: 12, z: 0, block: BlockId.WildwoodLeaves },
    { x: 28, y: 15, z: 0, block: BlockId.WildwoodLeaves },
  ];
  const repaired = repairGeneratedTreePlan({ plan, root: { x: 15, y: 10, z: 0 }, logBlock: BlockId.WildwoodLog });
  assert.ok(treePlanIsFaceConnected(repaired, { x: 15, y: 10, z: 0 }));
  assert.ok(repaired.some((entry) => entry.x === 16), "log bridge crosses the chunk seam at x=16");
  assert.ok(!repaired.some((entry) => entry.x === 28), "unattached leaf island is removed");
});

test("all authored tree forms remain connected across representative seeds and seams", () => {
  const forms: TreeForm[] = ["rounded", "layered", "windswept", "ancient"];
  const seeds = ["ASH-14", "RIME-29", "STEEL-91", "SEAM-15", "SEAM-16"];
  for (const form of forms) for (const seed of seeds) for (const originX of [15, 16, -1, 0]) {
    const root = { x: originX, y: 33, z: 15 };
    const original = planFullTree(seed, root, form, BlockId.WildwoodLog, BlockId.WildwoodLeaves);
    const repaired = repairGeneratedTreePlan({ plan: original, root, logBlock: BlockId.WildwoodLog });
    assert.ok(treePlanIsFaceConnected(repaired, root), `${form}/${seed}/${originX}`);
    assert.ok(repaired.length >= original.length * 0.9, "repair preserves authored crown variety");
  }
});

test("liquid-clipped crowns never retain floating components", () => {
  const root = { x: 14, y: 34, z: 14 };
  const original = planFullTree("POND-SEAM", root, "ancient", BlockId.CandywoodLog, BlockId.CandywoodLeaves);
  const forbidden = new Set(["17,14", "17,15", "17,16", "18,14", "18,15", "18,16"]);
  const repaired = repairGeneratedTreePlan({ plan: original, root, logBlock: BlockId.CandywoodLog, forbiddenColumns: forbidden });
  assert.ok(treePlanIsFaceConnected(repaired, root));
  assert.ok(repaired.every((entry) => !forbidden.has(`${entry.x},${entry.z}`)));
});

test("dragon world item contracts stay stable", () => {
  assert.equal(Item.FireDragonEgg, 307);
  assert.equal(Item.DragonHusbandryBlueprint, 367);
});

test("generator v10 stamps a candidate lair and its persistent marker into real chunks", () => {
  assert.equal(GENERATOR_VERSION, 11);
  const world = new ChunkWorld();
  world.reset("LIVE-DRAGON-LAIR", undefined, { structures: true });
  let candidate = null as ReturnType<typeof dragonLairCandidateForRegion>;
  for (let regionX = -12; regionX <= 12 && !candidate; regionX += 1) for (let regionZ = -12; regionZ <= 12 && !candidate; regionZ += 1) {
    candidate = dragonLairCandidateForRegion({ seed: world.seedText, regionX, regionZ, surfaceYAt: (x, z) => world.sampleColumn(x, z).height });
  }
  assert.ok(candidate);
  const chunkX = Math.floor(candidate.origin.x / 16);
  const chunkZ = Math.floor(candidate.origin.z / 16);
  const chunk = world.generateChunk(chunkX, chunkZ);
  assert.ok([...chunk.blocks].some((block) => [BlockId.CharredDragonstone, BlockId.RimeDragonstone, BlockId.RivetedDragonstone].includes(block as BlockId)));
  const guardian = [...world.structureMarkers.values()].find((marker) => marker.type === "spawn" && marker.id === `${candidate.id}:guardian`);
  assert.ok(guardian && guardian.type === "spawn");
  assert.ok(guardian.persistent);
  assert.ok(guardian.tags?.includes("permanent:true"));
  world.dispose();
});

test("archive shelves store six reusable tomes and drive their visible block occupancy", () => {
  let shelf = normalizeArchiveShelf({ tomes: [Item.Stick, Item.TomeFlameJet] });
  assert.deepEqual(shelf.tomes, [Item.TomeFlameJet]);
  for (const tome of [Item.TomeFrostLance, Item.TomeSteelSpear, Item.TomeHealingLight, Item.TomeBlinkstep, Item.TomeArcaneWard]) {
    const result = insertArchiveTome(shelf, tome);
    assert.ok(result.inserted);
    shelf = result.state;
  }
  assert.equal(shelf.tomes.length, 6);
  assert.equal(insertArchiveTome(shelf, Item.TomeFlameJet).reason, "full");
  assert.equal(insertArchiveTome(shelf, Item.Stick).reason, "not-a-book");
  const removed = removeArchiveTome(shelf, 2);
  assert.ok(removed.removed);
  assert.equal(removed.item, Item.TomeSteelSpear);
  assert.equal(removed.block, BlockId.ArchiveShelfFive);

  const emptyDisplay = normalizeTomeDisplay({ tome: Item.Stick });
  assert.equal(emptyDisplay.tome, null);
  const displayed = setDisplayedTome(emptyDisplay, Item.TomeArcaneWard);
  assert.ok(displayed.applied);
  assert.equal(displayed.state.tome, Item.TomeArcaneWard);
  const cleared = setDisplayedTome(displayed.state, null);
  assert.equal(cleared.replaced, Item.TomeArcaneWard);
  assert.equal(setDisplayedTome(cleared.state, Item.BoundBook).state.tome, Item.BoundBook);
});
