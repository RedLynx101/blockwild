import assert from "node:assert/strict";
import test from "node:test";
import { BlockId } from "../app/game/data.ts";
import { ChunkWorld, BIOME_NAMES, blockIndex, chunkKey, splitCoordinate } from "../app/game/world.ts";

test("chunk coordinates remain correct across negative boundaries", () => {
  const cases = [
    [-17, -2, 15],
    [-16, -1, 0],
    [-1, -1, 15],
    [0, 0, 0],
    [15, 0, 15],
    [16, 1, 0],
  ];
  for (const [value, expectedChunk, expectedLocal] of cases) {
    assert.deepEqual(splitCoordinate(value), { chunk: expectedChunk, local: expectedLocal });
  }
});

test("world generation is deterministic and seed-sensitive", () => {
  const first = new ChunkWorld();
  const second = new ChunkWorld();
  const third = new ChunkWorld();
  first.reset("SAME-SEED");
  second.reset("SAME-SEED");
  third.reset("DIFFERENT-SEED");
  const a = first.generateChunk(-2, 3).blocks;
  const b = second.generateChunk(-2, 3).blocks;
  const c = third.generateChunk(-2, 3).blocks;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a, c);
  first.dispose();
  second.dispose();
  third.dispose();
});

test("chunk edits survive unload and deterministic regeneration", () => {
  const world = new ChunkWorld();
  world.reset("EDIT-TEST");
  world.generateChunk(-1, -1);
  world.setBlock(-1, 12, -1, BlockId.Glowstone);
  const edits = world.serializeEdits();
  assert.equal(edits[chunkKey(-1, -1)].length, 1);
  world.reset("EDIT-TEST", edits);
  const regenerated = world.generateChunk(-1, -1);
  assert.equal(regenerated.blocks[blockIndex(15, 12, 15)], BlockId.Glowstone);
  world.dispose();
});

test("climate sampler exposes broad biome variety without loading chunks", () => {
  const world = new ChunkWorld();
  world.reset("BIOME-SAFARI");
  const biomes = new Set<number>();
  for (let x = -2400; x <= 2400; x += 160) {
    for (let z = -2400; z <= 2400; z += 160) biomes.add(world.sampleColumn(x, z).biome);
  }
  assert.ok(biomes.size >= 9, `expected at least 9 biomes, found ${[...biomes].map((id) => BIOME_NAMES[id]).join(", ")}`);
  world.dispose();
});

test("the initial 3×3 playable area generates within a bounded budget", () => {
  const world = new ChunkWorld();
  world.reset("PERFORMANCE-CHECK");
  const start = performance.now();
  for (let cx = -1; cx <= 1; cx += 1) for (let cz = -1; cz <= 1; cz += 1) world.generateChunk(cx, cz);
  const elapsed = performance.now() - start;
  assert.equal(world.loadedCount, 9);
  assert.ok(elapsed < 2500, `spawn generation took ${Math.round(elapsed)}ms`);
  world.dispose();
});
