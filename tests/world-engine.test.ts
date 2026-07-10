import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BlockId, ITEMS, Item, type InventorySlot } from "../app/game/data.ts";
import { VoxelEngine, migrateSavedWorld, restoreChestStorage, type WorldSave } from "../app/game/engine.ts";
import { ChunkWorld, BIOME_NAMES, MIN_Y, SECTION_HEIGHT, WORLD_HEIGHT, blockIndex, chunkKey, splitCoordinate } from "../app/game/world.ts";
import { MOB_DEFS, MOB_ORDER } from "../app/game/mobs.ts";
import { createHeldToolSpec, createZombieSpec } from "../app/game/model-specs.ts";

test("chunk coordinates remain correct across negative boundaries", () => {
  assert.equal(MIN_Y, -64);
  assert.equal(WORLD_HEIGHT, 192);
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

test("generator-v2 saves migrate their voxel edit indices into the deeper world", () => {
  const legacy = {
    version: 2,
    generatorVersion: 2,
    seed: "LEGACY-WORLD",
    edits: { "0,0": [[8192, BlockId.Glowstone]] },
  } as unknown as WorldSave;
  const migrated = migrateSavedWorld(legacy);
  assert.equal(migrated?.generatorVersion, 3);
  assert.deepEqual(migrated?.edits["0,0"], [[16384, BlockId.Glowstone]], "an old y=0 edit must remain at y=0 after MIN_Y moves from -32 to -64");
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

test("zombie data, bestiary registration, and shared model orientation stay coherent", () => {
  assert.equal(MOB_ORDER.includes("zombie"), true);
  assert.equal(MOB_DEFS.zombie.hostile, true);
  assert.equal(MOB_DEFS.zombie.health, 10);
  assert.equal(ITEMS[Item.RottenFlesh].name, "Rotten Flesh");
  const zombie = createZombieSpec();
  const semanticParts = new Set(zombie.boxes.map((part) => part.part));
  for (const required of ["body", "head", "leftArm", "rightArm", "leftLeg", "rightLeg"]) assert.equal(semanticParts.has(required), true, `missing ${required}`);
  const head = zombie.boxes.find((part) => part.id === "head")!;
  const eyes = zombie.boxes.filter((part) => part.id.endsWith("eye"));
  assert.ok(eyes.every((eye) => eye.position[2] < head.position[2]), "eyes must sit on the declared local -Z front");
});

test("held-tool production specs form connected silhouettes without floating heads", () => {
  for (const kind of ["pickaxe", "axe", "shovel", "sword"] as const) {
    const spec = createHeldToolSpec(kind, "#888");
    const structural = spec.boxes.filter((part) => part.part === "handle" || part.part === "guard" || part.part === "head");
    const connected = new Set([structural[0].id]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const candidate of structural) {
        if (connected.has(candidate.id)) continue;
        const touches = structural.some((other) => {
          if (!connected.has(other.id)) return false;
          return [0, 1, 2].every((axis) => Math.abs(candidate.position[axis] - other.position[axis]) <= (candidate.size[axis] + other.size[axis]) / 2 + 0.075);
        });
        if (touches) { connected.add(candidate.id); changed = true; }
      }
    }
    assert.equal(connected.size, structural.length, `${kind} contains a visually detached component`);
  }
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
  const section = Math.floor((0 - MIN_Y) / SECTION_HEIGHT);
  world.rebuildSection(left, section);
  world.rebuildSection(right, section);
  const vertexCount = [left, right].reduce((total, chunk) => {
    const mesh = chunk.sections.get(section)?.opaque;
    return total + (mesh?.geometry.getAttribute("position").count ?? 0);
  }, 0);
  assert.equal(vertexCount, 40, "two touching cubes should expose exactly ten quads");
  world.dispose();
});

test("partial block shapes preserve the full cube faces beside them", () => {
  const world = new ChunkWorld();
  world.reset("PARTIAL-FACE");
  const chunk = world.generateChunk(0, 0);
  chunk.blocks.fill(BlockId.Air);
  chunk.blocks[blockIndex(0, 0, 0)] = BlockId.Stone;
  chunk.blocks[blockIndex(1, 0, 0)] = BlockId.Chest;
  const section = Math.floor((0 - MIN_Y) / SECTION_HEIGHT);
  world.rebuildSection(chunk, section);

  const vertexCount = chunk.sections.get(section)?.opaque?.geometry.getAttribute("position").count ?? 0;
  assert.equal(vertexCount, 48, "an inset chest must not remove the neighboring stone face");
  assert.equal(world.faceVisible(BlockId.Stone, BlockId.Chest), true);
  assert.equal(world.faceVisible(BlockId.Stone, BlockId.DoorClosedLower), true);
  assert.equal(world.faceVisible(BlockId.Stone, BlockId.Stone), false);
  world.dispose();
});

test("urgent edits rebuild the visible section immediately and keep the light index current", () => {
  const world = new ChunkWorld();
  world.reset("URGENT-EDIT");
  const chunk = world.generateChunk(0, 0);
  chunk.blocks.fill(BlockId.Air);
  chunk.lightIndices.clear();
  const y = 0;
  const section = Math.floor((y - MIN_Y) / SECTION_HEIGHT);
  world.rebuildSection(chunk, section);

  world.setBlock(3, y, 4, BlockId.Stone, true, true);
  assert.equal(chunk.sections.get(section)?.opaque?.geometry.getAttribute("position").count, 24, "a placed cube should be visible without waiting for the mesh queue");

  world.setBlock(3, y, 4, BlockId.Air, true, true);
  assert.equal(chunk.sections.get(section)?.opaque, undefined, "a broken cube should disappear in the same update");

  world.setBlock(5, y, 6, BlockId.Torch, true, true);
  assert.deepEqual(world.lightSourcesNear(5, y, 6, 2).map((source) => source.type), [BlockId.Torch]);
  world.setBlock(5, y, 4, BlockId.Stone, true, true);
  assert.deepEqual(world.lightSourcesNear(5, y, 2, 8).map((source) => source.type), [BlockId.Torch], "an intervening wall must not evict a nearby placed light");
  world.setBlock(5, y, 4, BlockId.Air, true, true);
  world.setBlocksBatch([{ x: 5, y, z: 6, type: BlockId.Air }], true, true);
  assert.equal(world.lightSourcesNear(5, y, 6, 2).length, 0, "breaking a light source must remove it from the pooled-light index");
  world.dispose();
});

test("edits to retained invisible chunks remesh when the chunk becomes visible again", () => {
  const world = new ChunkWorld();
  world.reset("RETAINED-REMESH");
  const chunk = world.generateChunk(0, 0);
  chunk.blocks.fill(BlockId.Air);
  const y = 0;
  const section = Math.floor((y - MIN_Y) / SECTION_HEIGHT);
  for (let current = 0; current < WORLD_HEIGHT / SECTION_HEIGHT; current += 1) world.rebuildSection(chunk, current);
  chunk.group.visible = false;

  world.setBlock(2, y, 2, BlockId.Stone, true, false);
  world.processMesh();
  assert.equal(chunk.sections.get(section)?.opaque, undefined, "hidden chunks should avoid wasted remesh work");
  assert.equal(chunk.dirty.has(section), true, "the skipped remesh must remain dirty");

  world.scheduleAround(0, 0, true);
  for (let index = 0; index < 3; index += 1) world.processMesh();
  assert.equal(chunk.sections.get(section)?.opaque?.geometry.getAttribute("position").count, 24);
  assert.equal(chunk.dirty.has(section), false);
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

test("shift-click moves stacks both ways between the player and an open chest", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.inventory = Array.from({ length: 36 }, () => null);
  engine.inventory[0] = { item: Item.Coal, count: 10 };
  engine.chests = new Map([["0,0,0", [{ item: Item.Coal, count: 60 }, ...Array.from({ length: 26 }, () => null)]]]);
  engine.activeChestKey = "0,0,0";
  engine.activeFurnaceKey = null;
  engine.equipment = { head: null, chest: null, legs: null, feet: null };
  engine.audio = { play: () => undefined } as unknown as VoxelEngine["audio"];
  engine.saveSoon = () => undefined;
  engine.emitHud = () => undefined;

  engine.inventoryClick(0, "left", true);
  const chest = engine.chests.get("0,0,0")!;
  assert.equal(engine.inventory[0], null);
  assert.deepEqual(chest[0], { item: Item.Coal, count: 64 });
  assert.deepEqual(chest[1], { item: Item.Coal, count: 6 });

  engine.machineClick("chest", 1, "left", true);
  assert.deepEqual(engine.inventory[9], { item: Item.Coal, count: 6 });
  assert.equal(chest[1], null);
});

test("an open container wins over armor auto-equip when shift-clicking", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.inventory = Array.from({ length: 36 }, () => null);
  engine.inventory[0] = { item: Item.HideHood, count: 1, durability: 90 };
  engine.equipment = { head: null, chest: null, legs: null, feet: null };
  engine.chests = new Map([["0,0,0", Array.from({ length: 27 }, () => null)]]);
  engine.activeChestKey = "0,0,0";
  engine.activeFurnaceKey = null;
  engine.saveSoon = () => undefined;
  engine.shiftMove(0);
  assert.equal(engine.equipment.head, null);
  assert.deepEqual(engine.chests.get("0,0,0")?.[0], { item: Item.HideHood, count: 1, durability: 90 });
});

test("double-click collection gathers matching visible stacks up to the stack limit", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.inventory = Array.from({ length: 36 }, () => null);
  engine.inventory[0] = { item: Item.Coal, count: 20 };
  engine.inventory[9] = { item: Item.Coal, count: 30 };
  engine.craftGrid = Array.from({ length: 9 }, () => null);
  engine.craftGrid[0] = { item: Item.Coal, count: 10 };
  engine.chests = new Map([["0,0,0", [{ item: Item.Coal, count: 12 }, ...Array.from({ length: 26 }, () => null)]]]);
  engine.activeChestKey = "0,0,0";
  engine.activeFurnaceKey = null;
  engine.cursor = null;
  engine.audio = { play: () => undefined } as unknown as VoxelEngine["audio"];
  engine.saveSoon = () => undefined;
  engine.emitHud = () => undefined;

  engine.collectMatching(Item.Coal);
  assert.deepEqual(engine.cursor, { item: Item.Coal, count: 64 });
  assert.equal(engine.inventory[0], null);
  assert.equal(engine.inventory[9], null);
  assert.equal(engine.craftGrid[0], null);
  assert.deepEqual(engine.chests.get("0,0,0")?.[0], { item: Item.Coal, count: 8 });
});

test("adjacent chests merge into one canonical 54-slot double chest", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const first: Array<InventorySlot | null> = [{ item: Item.Coal, count: 1 }, ...Array.from({ length: 26 }, () => null)];
  const second: Array<InventorySlot | null> = [{ item: Item.Stick, count: 2 }, ...Array.from({ length: 26 }, () => null)];
  engine.chests = new Map([["0,0,0", first], ["1,0,0", second]]);
  engine.world = {
    getBlock: (x: number, y: number, z: number) => y === 0 && z === 0 && (x === 0 || x === 1) ? BlockId.Chest : BlockId.Air,
  } as unknown as VoxelEngine["world"];

  const key = engine.resolveChest("0,0,0");
  assert.equal(key, "0,0,0|1,0,0");
  assert.equal(engine.chests.get(key)?.length, 54);
  assert.deepEqual(engine.chests.get(key)?.[0], { item: Item.Coal, count: 1 });
  assert.deepEqual(engine.chests.get(key)?.[27], { item: Item.Stick, count: 2 });
  assert.equal(engine.chests.has("0,0,0"), false);
  assert.equal(engine.chests.has("1,0,0"), false);
});

test("double-chest storage preserves all 54 slots when a world is rehydrated", () => {
  const saved: Array<InventorySlot | null> = Array.from({ length: 54 }, () => null);
  saved[0] = { item: Item.Coal, count: 3 };
  saved[53] = { item: Item.CrystalShard, count: 2 };
  const restored = restoreChestStorage({ "0,0,0|1,0,0": saved });
  assert.equal(restored.get("0,0,0|1,0,0")?.length, 54);
  assert.deepEqual(restored.get("0,0,0|1,0,0")?.[0], { item: Item.Coal, count: 3 });
  assert.deepEqual(restored.get("0,0,0|1,0,0")?.[53], { item: Item.CrystalShard, count: 2 });
});

test("shift-click equips armor and armor reduces damage while losing durability", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.inventory = Array.from({ length: 36 }, () => null);
  engine.inventory[0] = { item: Item.SunmetalPlate, count: 1, durability: 100 };
  engine.equipment = { head: null, chest: null, legs: null, feet: null };
  engine.activeChestKey = null;
  engine.activeFurnaceKey = null;
  engine.saveSoon = () => undefined;
  engine.shiftMove(0);
  assert.deepEqual(engine.equipment.chest, { item: Item.SunmetalPlate, count: 1, durability: 100 });
  assert.equal(engine.inventory[0], null);
  assert.equal(engine.armorPoints(), 4);

  engine.mode = "survival";
  engine.health = 10;
  engine.playerInvulnerability = 0;
  engine.spawnProtection = 0;
  engine.audio = { play: () => undefined } as unknown as VoxelEngine["audio"];
  engine.events = { onToast: () => undefined } as unknown as VoxelEngine["events"];
  engine.damagePlayer(4, "ridgeback");
  assert.equal(engine.health, 6.5);
  assert.equal(engine.equipment.chest?.durability, 99);
});

test("door interaction updates both halves with an immediate batch edit", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const writes: Array<{ x: number; y: number; z: number; type: BlockId }> = [];
  let immediate = false;
  engine.world = {
    setBlocksBatch: (changes: typeof writes, _record?: boolean, urgent?: boolean) => { writes.push(...changes); immediate = Boolean(urgent); },
  } as unknown as VoxelEngine["world"];
  engine.audio = { play: () => undefined } as unknown as VoxelEngine["audio"];
  engine.saveSoon = () => undefined;
  engine.toggleDoor(4, 9, 2, BlockId.DoorClosedUpper);
  assert.deepEqual(writes, [
    { x: 4, y: 8, z: 2, type: BlockId.DoorOpenLower },
    { x: 4, y: 9, z: 2, type: BlockId.DoorOpenUpper },
  ]);
  assert.equal(immediate, true);
});

test("door collision matches the thin closed slab and the edge-hinged open slab", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  assert.equal(engine.playerIntersectsDoorCell(new THREE.Vector3(0, 0, 0), 0, 0, 0, BlockId.DoorClosedLower), true);
  assert.equal(engine.playerIntersectsDoorCell(new THREE.Vector3(0, 0, 0.4), 0, 0, 0, BlockId.DoorClosedLower), false);
  assert.equal(engine.playerIntersectsDoorCell(new THREE.Vector3(0, 0, 0), 0, 0, 0, BlockId.DoorOpenLower), false);
  assert.equal(engine.playerIntersectsDoorCell(new THREE.Vector3(-0.42, 0, 0), 0, 0, 0, BlockId.DoorOpenLower), true);
});

test("a door cannot close around the player and X-axis doors keep their orientation", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const writes: Array<{ x: number; y: number; z: number; type: BlockId }> = [];
  engine.world = { setBlocksBatch: (changes: typeof writes) => writes.push(...changes) } as unknown as VoxelEngine["world"];
  engine.audio = { play: () => undefined } as unknown as VoxelEngine["audio"];
  engine.events = { onToast: () => undefined } as unknown as VoxelEngine["events"];
  engine.saveSoon = () => undefined;
  engine.position = new THREE.Vector3(0, 0, 0);
  engine.toggleDoor(0, 0, 0, BlockId.DoorOpenLower);
  assert.equal(writes.length, 0);

  engine.position.set(3, 0, 3);
  engine.toggleDoor(0, 0, 0, BlockId.DoorXClosedLower);
  assert.deepEqual(writes, [
    { x: 0, y: 0, z: 0, type: BlockId.DoorXOpenLower },
    { x: 0, y: 1, z: 0, type: BlockId.DoorXOpenUpper },
  ]);
});

test("due saplings remain scheduled while their chunk is unloaded", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.saplings = new Map([["64,10,64", 0]]);
  engine.saplingCheckTimer = 0;
  engine.world = { getBlock: () => undefined } as unknown as VoxelEngine["world"];
  engine.updateSaplings(1);
  assert.equal(engine.saplings.has("64,10,64"), true);
  assert.ok((engine.saplings.get("64,10,64") ?? 0) > Date.now());
});

test("tree felling takes only the rooted vertical trunk and leaves attached builds intact", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.world = new ChunkWorld();
  engine.world.reset("TREE-OWNERSHIP");
  const chunk = engine.world.generateChunk(0, 0);
  chunk.blocks.fill(BlockId.Air);
  engine.world.setBlock(4, 0, 4, BlockId.Dirt, false);
  for (let y = 1; y <= 3; y += 1) engine.world.setBlock(4, y, 4, BlockId.WildwoodLog, false);
  engine.world.setBlock(5, 1, 4, BlockId.WildwoodLog, false);
  for (const [dx, dy, dz] of [[-2, 0, -1], [-2, 0, 0], [-2, 0, 1], [-1, 0, -2], [-1, 0, -1], [-1, 0, 0], [-1, 0, 1], [-1, 0, 2], [0, 1, -1], [0, 1, 1]] as Array<[number, number, number]>) {
    engine.world.setBlock(4 + dx, 3 + dy, 4 + dz, BlockId.WildwoodLeaves, false);
  }
  engine.scene = new THREE.Scene();
  engine.position = new THREE.Vector3(0, 1, 0);
  engine.fallingTrees = [];
  engine.mode = "builder";
  engine.persistent = false;
  engine.yaw = 0;
  engine.audio = { play: () => undefined } as unknown as VoxelEngine["audio"];
  engine.events = { onToast: () => undefined } as unknown as VoxelEngine["events"];
  assert.equal(engine.tryFellTree(4, 1, 4, BlockId.WildwoodLog), true);
  assert.equal(engine.fallingTrees[0]?.logCount, 3);
  assert.equal(engine.world.getBlock(5, 1, 4), BlockId.WildwoodLog, "a touching horizontal build log must not join the tree entity");
  for (const tree of engine.fallingTrees) engine.disposeObject(tree.group);
  engine.world.dispose();
});

test("furnaces complete smelting even when the surrounding game simulation is paused", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.furnaces = new Map([["0,0,0", { input: { item: Item.RawSunmetal, count: 1 }, fuel: { item: Item.Coal, count: 1 }, output: null, progress: 0, burn: 0, burnMax: 0 }]]);
  engine.audio = { play: () => undefined } as unknown as VoxelEngine["audio"];
  engine.saveSoon = () => undefined;
  engine.paused = true;
  engine.updateFurnaces(8.1);
  assert.deepEqual(engine.furnaces.get("0,0,0")?.output, { item: Item.SunmetalIngot, count: 1 });
  assert.equal(engine.furnaces.get("0,0,0")?.input, null);
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

test("oversized world drops split into legal stacks instead of losing items on save", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.drops = [];
  engine.nextDropId = 1;
  engine.dropMaterials = new Map();
  engine.dropGroup = new THREE.Group();
  engine.sharedDropGeometry = new THREE.BoxGeometry(0.2, 0.2, 0.2);
  engine.spawnDrop(BlockId.WildwoodLog, 96, new THREE.Vector3());
  assert.deepEqual(engine.drops.map((drop) => drop.count), [64, 32]);
  assert.equal(engine.drops.reduce((total, drop) => total + drop.count, 0), 96);
  engine.sharedDropGeometry.dispose();
  for (const material of engine.dropMaterials.values()) material.dispose();
});

test("mob deaths detach semantic body blocks and fully burn them away", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.scene = new THREE.Scene();
  engine.creatureGroup = new THREE.Group();
  engine.mobs = [];
  engine.mobRemains = [];
  engine.nextMobId = 1;
  engine.world = { getBlock: () => BlockId.Air } as unknown as VoxelEngine["world"];
  const zombie = engine.spawnMob("zombie", new THREE.Vector3(0, 1, 0));
  engine.spawnMobRemains(zombie);
  assert.ok(engine.mobRemains[0]?.fragments.length >= 8);
  const parts = new Set(engine.mobRemains[0]?.fragments.map((fragment) => fragment.mesh.userData.bodyPart));
  for (const required of ["body", "head", "leftArm", "rightArm", "leftLeg", "rightLeg"]) assert.equal(parts.has(required), true, `death breakup missing ${required}`);
  engine.removeMob(0);
  engine.updateMobRemains(2.4);
  assert.equal(engine.mobRemains.length, 0, "burn-away fragments must have a finite lifetime");
});
