import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BlockId, ITEMS, Item } from "../app/game/data.ts";
import { VoxelEngine } from "../app/game/engine.ts";
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

test("climate sampler can produce all seventeen advertised biomes", () => {
  const world = new ChunkWorld();
  world.reset("BIOME-SAFARI");
  const biomes = new Set<number>();
  for (let index = 0; index < 200_000; index += 1) {
    const x = ((index * 7919) % 200_000) - 100_000;
    const z = ((index * 104729) % 240_000) - 120_000;
    biomes.add(world.sampleColumn(x, z).biome);
  }
  assert.equal(biomes.size, 17, `expected all biomes, found ${[...biomes].map((id) => BIOME_NAMES[id]).join(", ")}`);
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

test("spawn search finds dry, walkable land across varied seeds", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.world = new ChunkWorld();
  for (let index = 0; index < 40; index += 1) {
    engine.world.reset(`SPAWN-${index}`);
    const spawn = engine.findSpawn();
    const column = engine.world.sampleColumn(spawn.x, spawn.z);
    assert.ok(column.height > column.waterline + 2, `SPAWN-${index} selected submerged terrain at ${spawn.x},${spawn.z}`);
  }
  engine.world.dispose();
});

test("streaming queues re-center after a long-distance jump", () => {
  const world = new ChunkWorld();
  world.reset("QUEUE-REBASE");
  world.setRenderDistance(2);
  world.scheduleAround(0, 0, true);
  world.scheduleAround(1600, -1600, true);
  assert.ok(world.generationQueue.length > 0);
  assert.ok(world.generationQueue.every((entry) => Math.max(Math.abs(entry.cx - 100), Math.abs(entry.cz + 100)) <= 3));
  assert.equal(world.generationQueued.size, world.generationQueue.length);
  world.dispose();
});

test("adjacent blocks across a chunk seam do not render hidden faces", () => {
  const world = new ChunkWorld();
  world.reset("SEAM-TEST");
  const left = world.generateChunk(0, 0);
  const right = world.generateChunk(1, 0);
  left.blocks.fill(BlockId.Air);
  right.blocks.fill(BlockId.Air);
  left.blocks[blockIndex(15, 0, 0)] = BlockId.Stone;
  right.blocks[blockIndex(0, 0, 0)] = BlockId.Stone;
  world.rebuildSection(left, 2);
  world.rebuildSection(right, 2);
  const vertexCount = [left, right].reduce((total, chunk) => {
    const mesh = chunk.sections.get(2)?.opaque;
    return total + (mesh?.geometry.getAttribute("position").count ?? 0);
  }, 0);
  assert.equal(vertexCount, 40, "two touching cubes should expose exactly ten quads");
  world.dispose();
});

test("stack inventory fills existing stacks before empty slots", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.inventory = Array.from({ length: 36 }, () => null);
  engine.inventory[0] = { item: Item.Coal, count: 60 };
  assert.equal(engine.addItem(Item.Coal, 10), 0);
  assert.equal(engine.inventory[0]?.count, 64);
  assert.deepEqual(engine.inventory[1], { item: Item.Coal, count: 6 });
});

test("2×2 and 3×3 crafting recognize shaped recipes", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.craftGrid = Array.from({ length: 9 }, () => null);
  engine.craftingSize = 2;
  engine.craftGrid[0] = { item: BlockId.WildwoodLog, count: 1 };
  assert.equal(engine.findRecipe()?.recipe.id, "planks");

  engine.craftGrid = Array.from({ length: 9 }, () => null);
  for (const index of [0, 1, 3, 4]) engine.craftGrid[index] = { item: BlockId.Planks, count: 1 };
  assert.equal(engine.findRecipe()?.recipe.id, "table");

  engine.craftingSize = 3;
  engine.craftGrid = Array.from({ length: 9 }, () => null);
  for (const index of [0, 1, 2]) engine.craftGrid[index] = { item: BlockId.Cobblestone, count: 1 };
  for (const index of [4, 7]) engine.craftGrid[index] = { item: Item.Stick, count: 1 };
  assert.equal(engine.findRecipe()?.recipe.id, "stone_pick");

  engine.audio = { play: () => undefined } as unknown as VoxelEngine["audio"];
  engine.saveSoon = () => undefined;
  engine.emitHud = () => undefined;
  engine.craftOutputClick();
  assert.equal(engine.cursor?.durability, ITEMS[Item.StonePickaxe].maxDurability, "manually crafted tools start at full durability");
});

test("rejected solid placement records its rollback and player chests start empty", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const writes: Array<{ type: BlockId; record?: boolean }> = [];
  engine.world = {
    getBlock: () => BlockId.TallGrass,
    setBlock: (_x: number, _y: number, _z: number, type: BlockId, record?: boolean) => { writes.push({ type, record }); return true; },
  } as unknown as VoxelEngine["world"];
  engine.target = { x: 2, y: 4, z: 6, placeX: 2, placeY: 5, placeZ: 6, type: BlockId.TallGrass, distance: 1 };
  engine.placeCooldown = 0;
  engine.selected = 0;
  engine.inventory = Array.from({ length: 36 }, () => null);
  engine.inventory[0] = { item: BlockId.Stone, count: 1 };
  engine.mode = "survival";
  engine.position = new THREE.Vector3();
  engine.collidesAt = () => true;
  engine.events = { onToast: () => undefined } as unknown as VoxelEngine["events"];
  engine.placeBlock();
  assert.deepEqual(writes.map((write) => write.type), [BlockId.Stone, BlockId.TallGrass]);
  assert.notEqual(writes[1].record, false, "rollback must persist across chunk regeneration");

  writes.length = 0;
  engine.inventory[0] = { item: BlockId.Chest, count: 1 };
  engine.collidesAt = () => false;
  engine.chests = new Map();
  engine.furnaces = new Map();
  engine.audio = { play: () => undefined } as unknown as VoxelEngine["audio"];
  engine.spawnParticles = () => undefined;
  engine.saveSoon = () => undefined;
  engine.emitHud = () => undefined;
  engine.placeBlock();
  const chest = engine.chests.get("2,4,6");
  assert.equal(chest?.length, 27);
  assert.ok(chest?.every((slot) => slot === null), "player-crafted chests must not inherit structure loot");
});

test("dropped tools preserve their remaining durability", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.drops = [];
  engine.nextDropId = 1;
  engine.dropMaterials = new Map();
  engine.dropGroup = new THREE.Group();
  engine.sharedDropGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  engine.spawnDrop(Item.StonePickaxe, 1, new THREE.Vector3(), 37);
  assert.equal(engine.drops[0]?.durability, 37);
  engine.sharedDropGeometry.dispose();
  for (const material of engine.dropMaterials.values()) material.dispose();
});
