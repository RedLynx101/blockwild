import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  BLOCK_FACING_EAST,
  BLOCK_FACING_NORTH,
  BLOCK_FACING_SOUTH,
  BLOCK_FACING_WEST,
  blockFacingForYaw,
  blockFacingFront,
  blockFacingRight,
  isDirectionallyPlacedBlock,
  rotateBlockOffset,
} from "../app/game/block-facing.ts";
import { BlockId } from "../app/game/data.ts";
import { VoxelEngine } from "../app/game/engine.ts";
import { validatePayload } from "../app/game/multiplayer.ts";
import { ChunkWorld } from "../app/game/world.ts";

test("directional placement faces an asymmetric block toward its builder", () => {
  assert.equal(blockFacingForYaw(0), BLOCK_FACING_SOUTH);
  assert.equal(blockFacingForYaw(Math.PI / 2), BLOCK_FACING_EAST);
  assert.equal(blockFacingForYaw(Math.PI), BLOCK_FACING_NORTH);
  assert.equal(blockFacingForYaw(-Math.PI / 2), BLOCK_FACING_WEST);
  assert.deepEqual(blockFacingFront(BLOCK_FACING_EAST), { x: 1, z: 0 });
  assert.deepEqual(blockFacingRight(BLOCK_FACING_EAST), { x: 0, z: 1 });
  assert.deepEqual(rotateBlockOffset(0.25, -0.5, BLOCK_FACING_SOUTH), { x: -0.25, z: 0.5 });
  for (const block of [BlockId.Chest, BlockId.Furnace, BlockId.CaptureOrbRack, BlockId.CreatureHealer, BlockId.WildwoodShelf, BlockId.WildwoodTable]) {
    assert.equal(isDirectionallyPlacedBlock(block), true, `block ${block} should store a facing`);
  }
});

test("placed facings round-trip sparsely and are cleared with their block", () => {
  const world = new ChunkWorld();
  world.reset("FACING-ROUND-TRIP", undefined, { structures: false });
  world.generateChunk(0, 0);
  world.setBlock(2, 0, 3, BlockId.Furnace, false, false);
  world.setBlockFacing(2, 0, 3, BLOCK_FACING_WEST, false);
  world.setBlock(4, 0, 3, BlockId.Chest, false, false);
  world.setBlockFacing(4, 0, 3, BLOCK_FACING_NORTH, false);
  assert.deepEqual(world.serializeBlockFacings(), { "2,0,3": BLOCK_FACING_WEST }, "legacy north is the zero-cost default");

  const restored = new ChunkWorld();
  restored.reset("FACING-ROUND-TRIP", undefined, { structures: false }, world.serializeBlockFacings());
  assert.equal(restored.blockFacingAt(2, 0, 3), BLOCK_FACING_WEST);
  world.setBlock(2, 0, 3, BlockId.Air, false, false);
  assert.deepEqual(world.serializeBlockFacings(), {});
  world.dispose();
  restored.dispose();
});

test("multiplayer block edits accept only bounded cardinal facing metadata", () => {
  const action = {
    requestId: "place-facing",
    actorId: "keeper-01",
    tick: 12,
    kind: "place",
    edits: [{ x: 2, y: 8, z: -4, type: BlockId.CaptureOrbRack, facing: BLOCK_FACING_WEST }],
  };
  assert.equal(validatePayload("block-action", action), true);
  assert.equal(validatePayload("block-action", { ...action, edits: [{ ...action.edits[0], facing: 4 }] }), false);
});

test("table, shelf, archive shelf, and fireplace use bounded solid furniture collision", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.world = { getBlock: () => BlockId.WildwoodShelf, blockFacingAt: () => BLOCK_FACING_NORTH } as never;
  assert.equal(engine.playerIntersectsFurnitureCell(new THREE.Vector3(0, 0, 0), 0, 0, 0, BlockId.WildwoodShelf), true);
  assert.equal(engine.playerIntersectsFurnitureCell(new THREE.Vector3(0, 0, 0.8), 0, 0, 0, BlockId.WildwoodShelf), false, "a shallow shelf should not behave like a full cube");
  engine.world = { getBlock: () => BlockId.WildwoodShelf, blockFacingAt: () => BLOCK_FACING_EAST } as never;
  assert.equal(engine.playerIntersectsFurnitureCell(new THREE.Vector3(0, 0, 0), 0, 0, 0, BlockId.WildwoodShelf), true);
  assert.equal(engine.playerIntersectsFurnitureCell(new THREE.Vector3(0.8, 0, 0), 0, 0, 0, BlockId.WildwoodShelf), false, "the shallow bound rotates with the shelf");
});
