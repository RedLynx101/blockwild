import assert from "node:assert/strict";
import test from "node:test";
import { BLOCKS, AQUATIC_FLORA, BlockId, Item } from "../app/game/data.ts";
import { caveEntranceAt } from "../app/game/caves.ts";
import { wildPeppermintHeight } from "../app/game/ecology.ts";
import { canPlantSaplingOn, plantingResult, planPeppermintColumnRemoval } from "../app/game/farming.ts";
import { rayDistanceToTorchBounds, torchInteractionBounds } from "../app/game/engine.ts";
import { BAKED_LIGHT_SOURCE_LIMIT, planPoiAmenities, ChunkWorld, LIQUID_SURFACE_INSET, WILD_PEPPERMINT_STEM_TILE } from "../app/game/world.ts";
import { planStructure } from "../app/game/structures.ts";
import { isSeatBlock, seatAnchorForBlock } from "../app/game/seating.ts";

test("chairs and stools resolve stable floor-level sitting anchors", () => {
  for (const block of [BlockId.WildwoodStool, BlockId.DwarfStool, BlockId.HearthChair, BlockId.MoonboughChair]) {
    assert.equal(isSeatBlock(block), true);
    const anchor = seatAnchorForBlock(block, 4, 20, -3);
    assert.ok(anchor);
    assert.equal(anchor.y, 19.51);
  }
  assert.equal(seatAnchorForBlock(BlockId.Stone, 0, 0, 0), null);
  assert.equal(seatAnchorForBlock(BlockId.HearthChair, 0, 1, 0)?.yaw, 0);
});

test("Meadow Grass accepts saplings and wild peppermint columns remain connected", () => {
  assert.equal(canPlantSaplingOn(BlockId.MeadowGrass), true);
  assert.equal(canPlantSaplingOn(BlockId.CloudreedGrass), true);
  assert.equal(canPlantSaplingOn(BlockId.Stone), false);
  assert.equal(plantingResult(Item.CandywoodSaplingItem, BlockId.MeadowGrass, BlockId.Air)?.block, BlockId.CandywoodSapling);
  assert.equal(BLOCKS[BlockId.PeppermintTuft].verticalConnectGroup, "wild-peppermint");
  const heights = new Set<number>();
  for (let x = -24; x <= 24; x += 1) heights.add(wildPeppermintHeight("CANE-COLUMNS", x, x * 3));
  assert.deepEqual([...heights].sort(), [1, 2, 3]);
  const column = new Map([["2,10,4", BlockId.PeppermintTuft], ["2,11,4", BlockId.PeppermintTuft], ["2,12,4", BlockId.PeppermintTuft]]);
  assert.deepEqual(planPeppermintColumnRemoval({ x: 2, y: 10, z: 4 }, (x, y, z) => column.get(`${x},${y},${z}`) ?? BlockId.Air), [
    { x: 2, y: 10, z: 4, type: BlockId.Air },
    { x: 2, y: 11, z: 4, type: BlockId.Air },
    { x: 2, y: 12, z: 4, type: BlockId.Air },
  ]);
  assert.equal(WILD_PEPPERMINT_STEM_TILE, 162, "lower cane segments need a dedicated full-height tile");
  assert.deepEqual(
    Object.values(BLOCKS).filter((definition) => [definition.side, definition.top, definition.bottom].includes(WILD_PEPPERMINT_STEM_TILE)).map((definition) => definition.name),
    [],
    "the renderer-only stem tile must not overwrite any save-stable block texture",
  );
  assert.equal(BAKED_LIGHT_SOURCE_LIMIT, 1024, "dense builds should keep broad baked glow beyond the animated pool");
});

test("Dreamblossoms glow and aquatic flora use flush species-specific stack contracts", () => {
  assert.equal(BLOCKS[BlockId.Dreamblossom].layer, "emissive");
  assert.equal(BLOCKS[BlockId.GiantDreamblossom].layer, "emissive");
  assert.equal(LIQUID_SURFACE_INSET, 0.09);
  const connectionGroups = new Set<string>();
  for (const block of AQUATIC_FLORA) {
    assert.equal(BLOCKS[block].waterlogged, true, BLOCKS[block].name);
    assert.ok(BLOCKS[block].verticalConnectGroup, BLOCKS[block].name);
    assert.ok(BLOCKS[block].aquaticProfile, BLOCKS[block].name);
    connectionGroups.add(BLOCKS[block].verticalConnectGroup!);
  }
  assert.equal(connectionGroups.size, AQUATIC_FLORA.length, "different aquatic species must not visually fuse into one column");
});

test("torch targeting follows the narrow floor and directional wall silhouettes", () => {
  const floor = torchInteractionBounds(BlockId.Torch, 0, 0, 0)!;
  assert.ok(rayDistanceToTorchBounds({ x: -2, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, floor, 6) !== null);
  assert.equal(rayDistanceToTorchBounds({ x: -2, y: 0, z: 0.3 }, { x: 1, y: 0, z: 0 }, floor, 6), null);
  const east = torchInteractionBounds(BlockId.TorchWallEast, 0, 0, 0)!;
  const west = torchInteractionBounds(BlockId.TorchWallWest, 0, 0, 0)!;
  assert.ok(east.maxX < 0 && west.minX > 0);
});

test("forest temple polish includes a rooted entry, working door, sconces, and blooms", () => {
  const plan = planStructure("forest-temple", { x: 0, y: 40, z: 0 }, "POLISHED-TEMPLE");
  assert.ok(plan.placements.some((entry) => entry.variant === "root-entry-arch"));
  assert.ok(plan.placements.some((entry) => entry.variant === "court-bloom"));
  const amenities = planPoiAmenities("forest-temple", { x: 0, y: 40, z: 0 });
  assert.ok(amenities.some((entry) => entry.block === BlockId.DoorClosedLower));
  assert.ok(amenities.some((entry) => entry.block === BlockId.TorchWallEast));
  const shell = new Map(plan.placements.map((entry) => [`${entry.x},${entry.y},${entry.z}`, entry.block]));
  for (const entry of amenities) shell.set(`${entry.x},${entry.y},${entry.z}`, entry.block);
  for (let edge = -5; edge <= 5; edge += 1) for (let y = 41; y <= 44; y += 1) {
    for (const [x, z] of [[-5, edge], [5, edge], [edge, -5], [edge, 5]] as const) {
      assert.ok(shell.has(`${x},${y},${z}`), `temple shell missing at ${x},${y},${z}`);
      assert.notEqual(shell.get(`${x},${y},${z}`), BlockId.Air, `temple shell gap at ${x},${y},${z}`);
    }
  }
  assert.ok(plan.placements.some((entry) => entry.variant === "temple-wall"));
  assert.ok(plan.placements.some((entry) => entry.variant === "leaflight-window"));
  assert.notEqual(BLOCKS[BlockId.RuneStone].layer, "emissive", "Rune Stone should read as natural stone with isolated green flecks");
  assert.equal(BLOCKS[BlockId.HobbitThatch].side, 144, "Hearthkin roofs use their dense woven tile, not transparent wheat");
});

test("surface cave mouths remain free of generated plants", () => {
  const world = new ChunkWorld();
  world.reset("FARM-CAVES-V4", undefined, { structures: false });
  let checked = 0;
  for (let z = -96; z <= 96 && checked < 12; z += 1) for (let x = -96; x <= 96 && checked < 12; x += 1) {
    const column = world.sampleColumn(x, z);
    if (!caveEntranceAt(world.seed, x, z, column.height, column.waterline)) continue;
    world.generateChunk(Math.floor(x / 16), Math.floor(z / 16));
    assert.equal(world.getBlock(x, column.height, z), BlockId.Air);
    const above = world.getBlock(x, column.height + 1, z);
    assert.equal(BLOCKS[above ?? BlockId.Air]?.replaceable === true && above !== BlockId.Air, false);
    checked += 1;
  }
  assert.ok(checked > 0);
  world.dispose();
});
