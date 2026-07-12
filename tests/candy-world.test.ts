import assert from "node:assert/strict";
import test from "node:test";
import { BlockId, Item } from "../app/game/data.ts";
import { planFullTree, planSyrupPondsForChunk, treeLogsAreFaceConnected } from "../app/game/ecology.ts";
import {
  canTill,
  discoverRootedTree,
  harvestPlant,
  nextPlantStage,
  plantingResult,
  resolveBucketAction,
} from "../app/game/farming.ts";
import {
  LIQUID_PROFILES,
  LiquidSimulator,
  blockContainsLiquid,
  isRenewableLiquidKind,
  liquidBlockForKind,
  liquidKindForBlock,
  type LiquidCell,
  type LiquidPosition,
  type LiquidWorldAdapter,
} from "../app/game/liquids.ts";
import { plantForBlock } from "../app/game/plants.ts";
import {
  BIOME_NAMES,
  BiomeId,
  CHUNK_SIZE,
  ChunkWorld,
  GENERATOR_VERSION,
  blockIndex,
  settlementBlockPalette,
} from "../app/game/world.ts";

const liquidKey = ({ x, y, z }: LiquidPosition) => `${x},${y},${z}`;

class CandyLiquidWorld implements LiquidWorldAdapter {
  readonly liquids = new Map<string, LiquidCell>();
  readonly solids = new Set<string>();
  minY = 0;
  maxY = 4;

  getLiquid(position: LiquidPosition) { return this.liquids.get(liquidKey(position)); }
  setLiquid(position: LiquidPosition, liquid: LiquidCell | undefined) {
    if (liquid) this.liquids.set(liquidKey(position), liquid);
    else this.liquids.delete(liquidKey(position));
  }
  isSolid(position: LiquidPosition) { return this.solids.has(liquidKey(position)); }
}

function settle(simulator: LiquidSimulator) {
  for (let tick = 0; tick < 200 && simulator.pendingCount > 0; tick += 1) simulator.process(256);
  assert.equal(simulator.pendingCount, 0);
}

test("Sugarplum Vale remains stable under generator v13 with its own terrain and keyed settlement palette", () => {
  assert.equal(GENERATOR_VERSION, 13);
  assert.equal(BIOME_NAMES[BiomeId.SugarplumVale], "Sugarplum Vale");
  const world = new ChunkWorld();
  world.reset("CANDY-WORLD", undefined, { structures: false });
  const fixture = world.sampleColumn(-1214, -158);
  assert.equal(fixture.biome, BiomeId.SugarplumVale);
  assert.deepEqual(world.surfaceBlocks(fixture.biome, fixture.height, fixture.temperature), [BlockId.SugarplumGrass, BlockId.SugarSoil]);
  world.dispose();

  const palette = settlementBlockPalette("sugarcourt");
  assert.equal(palette.perimeterWall, BlockId.BoiledSugarbrick, "Sugarcourt walls are hard candy, not Goblin brasswork");
  assert.equal(palette.corner, BlockId.CandywoodLog);
  assert.equal(palette.hallFloor, BlockId.BoiledSugarbrick);
});

test("syrup ponds are deterministic source pools that meet cleanly across chunk seams", () => {
  const world = new ChunkWorld();
  world.reset("CANDY-WORLD", undefined, { structures: false });
  const sample = (x: number, z: number) => world.sampleColumn(x, z);
  const slices = [[-77, -11], [-77, -10], [-76, -11], [-76, -10]].map(([chunkX, chunkZ]) =>
    planSyrupPondsForChunk({ seed: world.seedText, chunkX, chunkZ, chunkSize: CHUNK_SIZE, sample, sugarplumBiome: BiomeId.SugarplumVale })[0]);
  assert.ok(slices.every(Boolean));
  assert.deepEqual(new Set(slices.map((slice) => slice.id)), new Set(["syrup-pond:-26:-4"]));
  assert.deepEqual(new Set(slices.map((slice) => `${slice.center.x},${slice.center.y},${slice.center.z}`)), new Set(["-1214,37,-158"]));
  assert.equal(slices.reduce((sum, slice) => sum + slice.columns.length, 0), 59);

  for (const [index, [chunkX, chunkZ]] of [[-77, -11], [-77, -10], [-76, -11], [-76, -10]].entries()) {
    const chunk = world.generateChunk(chunkX, chunkZ);
    for (const column of slices[index].columns) {
      const lx = column.x - chunkX * CHUNK_SIZE;
      const lz = column.z - chunkZ * CHUNK_SIZE;
      assert.equal(chunk.blocks[blockIndex(lx, column.surfaceY, lz)], BlockId.Syrup);
      assert.equal(chunk.blocks[blockIndex(lx, column.bedY, lz)], BlockId.SugarSoil);
      assert.equal(chunk.heightmap[lx + lz * CHUNK_SIZE], column.bedY);
      for (let y = column.surfaceY + 1; y <= column.originalSurfaceY + 1; y += 1) {
        assert.equal(chunk.blocks[blockIndex(lx, y, lz)], BlockId.Air, `flora or terrain floated above syrup at ${column.x},${y},${column.z}`);
      }
    }
  }
  world.dispose();
});

test("Candywood plans keep every trunk layer connected and are discoverable by full-tree felling", () => {
  const plan = planFullTree("CANDYWOOD", { x: 0, y: 1, z: 0 }, "layered", BlockId.CandywoodLog, BlockId.CandywoodLeaves);
  assert.equal(treeLogsAreFaceConnected(plan, BlockId.CandywoodLog), true);
  const blocks = new Map(plan.map((entry) => [`${entry.x},${entry.y},${entry.z}`, entry.block] as const));
  blocks.set("0,0,0", BlockId.SugarSoil);
  const read = (x: number, y: number, z: number) => blocks.get(`${x},${y},${z}`) ?? BlockId.Air;
  const tree = discoverRootedTree({ x: 0, y: 1, z: 0 }, read);
  assert.ok(tree);
  assert.ok(tree.logs.length >= 7);
  assert.ok(tree.leaves.length >= 40);
  assert.equal(tree.logs.every((entry) => entry.type === BlockId.CandywoodLog), true);
});

test("peppermint, cocoa and Sugarplum forage support planting, harvest and plant-guide discovery", () => {
  assert.equal(plantingResult(Item.PeppermintSeeds, BlockId.HydratedFarmland, BlockId.Air)?.block, BlockId.PeppermintSprout);
  assert.equal(plantingResult(Item.CocoaSeeds, BlockId.Farmland, BlockId.Air)?.block, BlockId.CocoaSprout);
  assert.equal(plantingResult(Item.Gumdrop, BlockId.SugarplumGrass, BlockId.Air)?.block, BlockId.GumdropBush);
  assert.equal(plantingResult(Item.MarshmallowTuft, BlockId.SugarSoil, BlockId.Air)?.block, BlockId.MarshmallowShrub);
  assert.equal(canTill(BlockId.SugarSoil, BlockId.Air), true);
  assert.equal(nextPlantStage(BlockId.PeppermintSprout), BlockId.PeppermintYoung);
  assert.equal(nextPlantStage(BlockId.CocoaYoung), BlockId.CocoaCrop);
  assert.equal(harvestPlant(BlockId.PeppermintCrop, true, 0.8)?.replacement, BlockId.PeppermintSprout);
  assert.equal(harvestPlant(BlockId.CocoaCrop, true, 0.8)?.drops[0].item, Item.CocoaNib);
  assert.equal(harvestPlant(BlockId.LollipopOrchid, false, 0.8)?.drops[0].item, Item.LollipopPetal);
  assert.equal(plantForBlock(BlockId.CandywoodLeaves)?.id, "candywood-tree");
  assert.equal(plantForBlock(BlockId.PeppermintCrop)?.id, "peppermint-cane");
});

test("honey and syrup are bucketable, slow-flowing, and never renew between two sources", () => {
  assert.equal(liquidBlockForKind("honey"), BlockId.Honey);
  assert.equal(liquidKindForBlock(BlockId.Syrup), "syrup");
  assert.equal(liquidKindForBlock(BlockId.LumenKelp), "water", "waterlogged flora preserves the water contract");
  assert.equal(blockContainsLiquid(BlockId.Honey, "honey"), true);
  assert.equal(LIQUID_PROFILES.honey.renewable, false);
  assert.equal(LIQUID_PROFILES.syrup.renewable, false);
  assert.equal(isRenewableLiquidKind("water"), true);
  assert.equal(resolveBucketAction(Item.Bucket, BlockId.Honey, BlockId.Air)?.resultItem, Item.HoneyBucket);
  assert.equal(resolveBucketAction(Item.Bucket, BlockId.Honey, BlockId.Air, false), null, "flowing honey cannot be duplicated into a full bucket");
  assert.equal(resolveBucketAction(Item.Bucket, BlockId.Syrup, BlockId.Air, false), null, "flowing syrup cannot be duplicated into a full bucket");
  assert.equal(resolveBucketAction(Item.SyrupBucket, BlockId.Air, BlockId.Air)?.place, BlockId.Syrup);

  for (const kind of ["honey", "syrup"] as const) {
    const adapter = new CandyLiquidWorld();
    for (let x = -3; x <= 3; x += 1) for (let z = -3; z <= 3; z += 1) adapter.solids.add(`${x},0,${z}`);
    const simulator = new LiquidSimulator(adapter);
    simulator.addSource({ x: -1, y: 1, z: 0 }, kind);
    simulator.addSource({ x: 1, y: 1, z: 0 }, kind);
    settle(simulator);
    assert.deepEqual(adapter.getLiquid({ x: 0, y: 1, z: 0 }), { kind, level: 1, source: false, falling: false });
  }
});
