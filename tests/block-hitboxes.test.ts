import assert from "node:assert/strict";
import test from "node:test";
import { BLOCKS, BlockId } from "../app/game/data.ts";
import { plantInteractionBounds, rayDistanceToInteractionBounds } from "../app/game/block-hitboxes.ts";
import { VoxelEngine } from "../app/game/engine.ts";
import * as THREE from "three";

test("flowers use a narrow interaction silhouette instead of a full block", () => {
  const bounds = plantInteractionBounds(BLOCKS[BlockId.RedFlower], 4, 12, -2);
  assert.ok(bounds);
  assert.ok(Math.abs((bounds.maxX - bounds.minX) - 0.58) < 1e-9);
  assert.ok(rayDistanceToInteractionBounds({ x: 2, y: 12, z: -2 }, { x: 1, y: 0, z: 0 }, bounds, 6) !== null);
  assert.equal(rayDistanceToInteractionBounds({ x: 2, y: 12, z: -1.6 }, { x: 1, y: 0, z: 0 }, bounds, 6), null);
});

test("bushes and fruit retain usable but visually matched silhouettes", () => {
  const bush = plantInteractionBounds(BLOCKS[BlockId.MoonberryBush], 0, 0, 0);
  const fruit = plantInteractionBounds(BLOCKS[BlockId.AppleFruit], 0, 0, 0);
  assert.ok(bush && fruit);
  assert.ok(bush.maxX > fruit.maxX);
  assert.ok(fruit.maxY < bush.maxY);
  assert.equal(plantInteractionBounds(BLOCKS[BlockId.Stone], 0, 0, 0), null);
});

test("voxel casting passes through the empty side of a flower to a solid block", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.world = {
    getBlock: (x: number, y: number, z: number) => x === 0 && y === 0 && z === 0
      ? BlockId.RedFlower
      : x === 1 && y === 0 && z === 0 ? BlockId.Stone : BlockId.Air,
  } as VoxelEngine["world"];
  const hit = engine.castVoxel(new THREE.Vector3(-2, 0, 0.4), new THREE.Vector3(1, 0, 0), 6);
  assert.equal(hit?.type, BlockId.Stone);
  assert.equal(hit?.x, 1);
});
