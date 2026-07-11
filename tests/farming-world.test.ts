import assert from "node:assert/strict";
import test from "node:test";
import { BlockId, Item, ITEMS, RECIPES, worldTextureBlockForItem } from "../app/game/data.ts";
import { caveEntranceAt, caveFeatureAt } from "../app/game/caves.ts";
import {
  canGrowPlant,
  canHitchLead,
  canTill,
  constrainLead,
  farmlandState,
  fenceCollisionHeight,
  fenceConnections,
  fenceGateForYaw,
  growthDelaySeconds,
  harvestPlant,
  nextPlantStage,
  planAppleFruitRegrowth,
  planAppleTree,
  plantingResult,
  resolveBucketAction,
  restoreLeadAnchors,
  serializeLeadAnchors,
  toggleFenceGate,
  type LeadAnchor,
} from "../app/game/farming.ts";
import { planLeafParticles, stepLeafParticle, torchAnimationSample } from "../app/game/world-effects.ts";
import { ChunkWorld, MIN_Y, blockIndex } from "../app/game/world.ts";

test("berries and wheat plant only on valid soil and advance through explicit stages", () => {
  assert.equal(plantingResult(Item.Berry, BlockId.MeadowGrass, BlockId.Air)?.block, BlockId.MoonberryShoot);
  assert.equal(plantingResult(Item.Sunberry, BlockId.Dirt, BlockId.Air)?.block, BlockId.SunberryShoot);
  assert.equal(plantingResult(Item.Apple, BlockId.Grass, BlockId.Air)?.block, BlockId.AppleSapling);
  assert.equal(plantingResult(Item.WheatSeeds, BlockId.Grass, BlockId.Air), null);
  assert.equal(plantingResult(Item.WheatSeeds, BlockId.HydratedFarmland, BlockId.Air)?.block, BlockId.WheatSprout);
  assert.equal(nextPlantStage(BlockId.WheatSprout), BlockId.WheatYoung);
  assert.equal(nextPlantStage(BlockId.WheatYoung), BlockId.WheatCrop);
  assert.equal(nextPlantStage(BlockId.WheatCrop), null);
  assert.equal(canGrowPlant(BlockId.MoonberryBush, BlockId.Dirt, 0.3), true);
  assert.equal(canGrowPlant(BlockId.SunberryBush, BlockId.Dirt, 0.3), false);
});

test("farmland hydration, tilling, and deterministic growth timings are bounded", () => {
  const blocks = new Map<string, BlockId>([["4,0,0", BlockId.Water]]);
  const read = (x: number, y: number, z: number) => blocks.get(`${x},${y},${z}`) ?? BlockId.Air;
  assert.equal(canTill(BlockId.MeadowGrass, BlockId.Air), true);
  assert.equal(canTill(BlockId.Stone, BlockId.Air), false);
  assert.equal(farmlandState(read, { x: 0, y: 0, z: 0 }), BlockId.HydratedFarmland);
  assert.equal(farmlandState(read, { x: 10, y: 0, z: 0 }), BlockId.Farmland);
  const first = growthDelaySeconds(BlockId.WheatSprout, true, "FARM", { x: 3, y: 20, z: -5 }, 2);
  const again = growthDelaySeconds(BlockId.WheatSprout, true, "FARM", { x: 3, y: 20, z: -5 }, 2);
  const dry = growthDelaySeconds(BlockId.WheatSprout, false, "FARM", { x: 3, y: 20, z: -5 }, 2);
  assert.equal(first, again);
  assert.ok((dry ?? 0) > (first ?? 0));
});

test("right-click harvest preserves bushes and scythes replant wheat with seeds", () => {
  assert.deepEqual(harvestPlant(BlockId.MoonberryBushRipe, false, 0), {
    replacement: BlockId.MoonberryBush,
    drops: [{ item: Item.Berry, count: 2 }],
    replanted: true,
  });
  const wheat = harvestPlant(BlockId.WheatCrop, true, 0.9);
  assert.equal(wheat?.replacement, BlockId.WheatSprout);
  assert.equal(wheat?.replanted, true);
  assert.ok((wheat?.drops.find((drop) => drop.item === Item.WheatSeeds)?.count ?? 0) >= 2);
  assert.deepEqual(harvestPlant(BlockId.AppleFruit), { replacement: BlockId.Air, drops: [{ item: Item.Apple, count: 1 }], replanted: false });
});

test("apple-tree plans are deterministic, attractive canopies with separately harvestable hanging fruit", () => {
  const origin = { x: 10, y: 35, z: -7 };
  const plan = planAppleTree(origin, "ORCHARD");
  assert.deepEqual(plan, planAppleTree(origin, "ORCHARD"));
  assert.ok(plan.filter((block) => block.type === BlockId.WildwoodLog).length >= 5);
  assert.ok(plan.filter((block) => block.type === BlockId.AppleLeaves).length >= 30);
  const fruit = plan.filter((block) => block.type === BlockId.AppleFruit);
  assert.ok(fruit.length >= 2 && fruit.length <= 4);
  for (const apple of fruit) assert.ok(plan.some((block) => block.x === apple.x && block.y === apple.y + 1 && block.z === apple.z && block.type === BlockId.AppleLeaves));

  const occupied = new Map(plan.map((block) => [`${block.x},${block.y},${block.z}`, block.type]));
  for (const apple of fruit) occupied.set(`${apple.x},${apple.y},${apple.z}`, BlockId.Air);
  const regrowth = planAppleFruitRegrowth(origin, "ORCHARD", 5, (x, y, z) => occupied.get(`${x},${y},${z}`) ?? BlockId.Air, 2);
  assert.equal(regrowth.length, 2);
});

test("buckets, connected fences, gates, leads, and their recipes expose complete deterministic contracts", () => {
  assert.deepEqual(resolveBucketAction(Item.Bucket, BlockId.Water, BlockId.Stone), { kind: "fill", removeTarget: true, resultItem: Item.WaterBucket });
  assert.deepEqual(resolveBucketAction(Item.LavaBucket, BlockId.Stone, BlockId.Air), { kind: "pour", removeTarget: false, place: BlockId.Lava, resultItem: Item.Bucket });
  assert.equal(resolveBucketAction(Item.WaterBucket, BlockId.Stone, BlockId.Stone), null);

  const neighbors = new Map<string, BlockId>([["0,0,-1", BlockId.WildwoodFence], ["1,0,0", BlockId.Stone], ["0,0,1", BlockId.Air], ["-1,0,0", BlockId.FenceGateNorthSouthClosed]]);
  const connections = fenceConnections((x, y, z) => neighbors.get(`${x},${y},${z}`) ?? BlockId.Air, { x: 0, y: 0, z: 0 });
  assert.deepEqual(connections, { north: true, east: true, south: false, west: true, mask: 11 });
  assert.equal(fenceCollisionHeight(BlockId.WildwoodFence), 1.25);
  assert.equal(fenceGateForYaw(0), BlockId.FenceGateNorthSouthClosed);
  assert.equal(toggleFenceGate(BlockId.FenceGateNorthSouthClosed), BlockId.FenceGateNorthSouthOpen);
  const attachedLead = { mobId: "peelop-7", maximumLength: 9 };
  assert.equal(canHitchLead(true, BlockId.WildwoodFence, [attachedLead]), true, "an attached lead can hitch after its inventory item was consumed");
  assert.equal(canHitchLead(false, BlockId.WildwoodFence, [attachedLead]), false);
  assert.equal(canHitchLead(true, BlockId.Stone, [attachedLead]), false);
  assert.equal(canHitchLead(true, BlockId.WildwoodFence, [{ ...attachedLead, fence: { x: 0, y: 1, z: 0 } }]), false);
  const activeLeads = new Map<number, LeadAnchor>([
    [7, attachedLead],
    [8, { ...attachedLead, mobId: "8", maximumLength: 12, fence: { x: 14, y: 22, z: -6 } }],
    [99, { ...attachedLead, mobId: "99" }],
  ]);
  const savedLeads = serializeLeadAnchors(activeLeads, new Set([7, 8]));
  assert.deepEqual(savedLeads, [
    { mobId: 7, maximumLength: 9 },
    { mobId: 8, maximumLength: 12, fence: { x: 14, y: 22, z: -6 } },
  ]);
  assert.deepEqual([...restoreLeadAnchors(savedLeads, new Set([7, 8])).entries()], [
    [7, { mobId: "7", maximumLength: 9 }],
    [8, { mobId: "8", maximumLength: 12, fence: { x: 14, y: 22, z: -6 } }],
  ]);
  assert.equal(restoreLeadAnchors(undefined, new Set([7])).size, 0, "old saves without leads remain valid");
  assert.equal(restoreLeadAnchors([{ mobId: 7, maximumLength: Infinity, fence: { x: Number.NaN, y: 1, z: 2 } }], new Set([7])).get(7)?.maximumLength, 9);
  assert.equal(constrainLead({ x: 12, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 8).taut, true);
  assert.equal(constrainLead({ x: 16, y: 0, z: 0 }, { x: 0, y: 0, z: 0 }, 8).breaks, true);
  for (const id of ["wood_hoe", "stone_hoe", "iron_hoe", "harvest_scythe", "bucket", "wildwood_fence", "wildwood_fence_gate", "lead"]) assert.ok(RECIPES.some((recipe) => recipe.id === id), id);
});

test("inventory hooks reuse world flora textures and expose liquid-colored bucket semantics", () => {
  assert.equal(worldTextureBlockForItem(BlockId.RedFlower), BlockId.RedFlower);
  assert.equal(worldTextureBlockForItem(BlockId.MoonOrchid), BlockId.MoonOrchid);
  assert.equal(ITEMS[BlockId.CraftingTable].iconKind, "crafting-table");
  assert.equal(ITEMS[Item.WaterBucket].bucketLiquid, "water");
  assert.equal(ITEMS[Item.LavaBucket].bucketLiquid, "lava");
});

test("cave entrances and room/chimney features stay sparse, deterministic, and varied", () => {
  let entrances = 0;
  for (let x = -128; x <= 128; x += 1) for (let z = -128; z <= 128; z += 1) if (caveEntranceAt(12345, x, z, 48, 32)) entrances += 1;
  assert.ok(entrances > 40, `expected several walkable mouths, got ${entrances} cells`);
  assert.ok(entrances < 1800, `mouths must remain sparse, got ${entrances} cells`);
  assert.deepEqual(caveEntranceAt(12345, 0, 0, 48, 32), caveEntranceAt(12345, 0, 0, 48, 32));
  assert.equal(caveEntranceAt(12345, 0, 0, 34, 32), null, "shorelines must not be punctured");
  let chambers = 0; let chimneys = 0;
  for (let x = 0; x < 96; x += 2) for (let z = 0; z < 96; z += 2) for (let y = -48; y < 35; y += 3) {
    const feature = caveFeatureAt(12345, x, y, z, 48);
    if (feature.chamber) chambers += 1;
    if (feature.chimney) chimneys += 1;
  }
  assert.ok(chambers > 0);
  assert.ok(chimneys > 0);
});

test("world generation exposes surface mouths, biome stone accents, greater relief, and sparse wild wheat", () => {
  const world = new ChunkWorld();
  world.reset("FARM-CAVES-V4", undefined, { structures: false });
  let mouthAir = 0; let accents = 0; let wheat = 0; let flora = 0;
  const heights: number[] = [];
  for (let cx = -2; cx <= 2; cx += 1) for (let cz = -2; cz <= 2; cz += 1) {
    const chunk = world.generateChunk(cx, cz);
    for (let x = 0; x < 16; x += 1) for (let z = 0; z < 16; z += 1) {
      const height = chunk.heightmap[x + z * 16];
      heights.push(height);
      if (chunk.blocks[blockIndex(x, height, z)] === BlockId.Air) mouthAir += 1;
      for (let y = MIN_Y + 5; y <= height + 1; y += 1) {
        const block = chunk.blocks[blockIndex(x, y, z)] as BlockId;
        if ([BlockId.Limestone, BlockId.MoonSlate, BlockId.SunbakedClay].includes(block)) accents += 1;
        if (block === BlockId.WheatCrop) wheat += 1;
        if ([BlockId.WheatCrop, BlockId.TallGrass, BlockId.RedFlower, BlockId.BlueFlower, BlockId.Sunpetal, BlockId.MoonOrchid].includes(block)) flora += 1;
      }
    }
  }
  assert.ok(mouthAir > 0, "some caves should reach the overworld surface");
  assert.ok(accents > 0, "new stone/clay strata should appear naturally");
  assert.ok(Math.max(...heights) - Math.min(...heights) >= 12, "nearby terrain should have readable vertical variance");
  assert.ok(wheat / Math.max(1, flora) < 0.09, `wild wheat should be scarce, got ${(wheat / Math.max(1, flora) * 100).toFixed(1)}%`);
  world.dispose();
});

test("falling leaves are capped, deterministic, and disappear on impact while torches flicker within bounds", () => {
  const leaves = Array.from({ length: 500 }, (_, index) => ({ x: index % 20, y: 40 + index % 5, z: Math.floor(index / 20), type: BlockId.WildwoodLeaves }));
  let particles = planLeafParticles("LEAVES", 20_000, leaves, { x: 10, y: 40, z: 10 }, 4);
  assert.deepEqual(particles, planLeafParticles("LEAVES", 20_000, leaves, { x: 10, y: 40, z: 10 }, 4));
  assert.ok(particles.length <= 4);
  if (!particles.length) particles = planLeafParticles("LEAVES", 20_500, leaves, { x: 10, y: 40, z: 10 }, 4);
  assert.ok(particles.length > 0);
  const particle = { ...particles[0], position: { ...particles[0].position, y: 1.01 }, velocity: { ...particles[0].velocity, y: -1 } };
  assert.equal(stepLeafParticle(particle, 0.1, 1), null);
  const torch = torchAnimationSample(12.5, { x: 3, y: 20, z: -4 });
  assert.ok(torch.flameScale >= 0.9 && torch.flameScale <= 1.1);
  assert.ok(torch.lightIntensity >= 0.85 && torch.lightIntensity <= 1.2);
  assert.ok(torch.atlasFrame >= 0 && torch.atlasFrame <= 3);
});
