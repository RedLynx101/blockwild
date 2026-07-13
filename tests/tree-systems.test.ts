import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BlockId } from "../app/game/data.ts";
import { repairGeneratedTreePlan, treePlanIsFaceConnected } from "../app/game/dragon-world.ts";
import { planFullTree, treeLogsAreFaceConnected, type TreeForm, type TreePlanBlock } from "../app/game/ecology.ts";
import { VoxelEngine } from "../app/game/engine.ts";
import { discoverRootedTree, isRootableTreeSoil, isTreeLogBlock, planAppleTree } from "../app/game/farming.ts";
import { BiomeId, CHUNK_SIZE, MAX_Y, MIN_Y, ChunkWorld } from "../app/game/world.ts";

const FORMS: readonly TreeForm[] = ["rounded", "layered", "windswept", "ancient"];
const SPECIES = [
  [BlockId.WildwoodLog, BlockId.WildwoodLeaves],
  [BlockId.PineLog, BlockId.PineLeaves],
  [BlockId.BirchLog, BlockId.BirchLeaves],
  [BlockId.BloomLog, BlockId.BloomLeaves],
  [BlockId.JungleLog, BlockId.JungleLeaves],
  [BlockId.SakuraLog, BlockId.SakuraLeaves],
  [BlockId.CandywoodLog, BlockId.CandywoodLeaves],
] as const;
const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;

function flatTreeMap(plan: readonly TreePlanBlock[], origin: Readonly<{ x: number; y: number; z: number }>) {
  const blocks = new Map(plan.map((block) => [keyOf(block.x, block.y, block.z), block.block] as const));
  for (let x = origin.x - 2; x <= origin.x + 2; x += 1) for (let z = origin.z - 2; z <= origin.z + 2; z += 1) {
    blocks.set(keyOf(x, origin.y - 1, z), BlockId.MeadowGrass);
  }
  return blocks;
}

test("every tree form and species is deterministic and wholly face-connected across seeds and chunk seams", () => {
  const seeds = Array.from({ length: 24 }, (_, index) => `TREE-TOPOLOGY-${index}`);
  const seamOrigins = [
    { x: 15, y: 31, z: 15 }, { x: 16, y: 31, z: 16 },
    { x: -1, y: 31, z: -1 }, { x: 0, y: 31, z: 0 },
    { x: 31, y: 31, z: -16 }, { x: 32, y: 31, z: -17 },
  ] as const;
  for (const [log, leaves] of SPECIES) for (const form of FORMS) for (const seed of seeds) for (const origin of seamOrigins) {
    const plan = planFullTree(seed, origin, form, log, leaves, { groundYAt: () => origin.y - 1 });
    assert.deepEqual(plan, planFullTree(seed, origin, form, log, leaves, { groundYAt: () => origin.y - 1 }), `${form}/${seed} changed between identical calls`);
    assert.equal(new Set(plan.map((block) => keyOf(block.x, block.y, block.z))).size, plan.length, `${form}/${seed} duplicated a voxel`);
    assert.equal(treeLogsAreFaceConnected(plan, log), true, `${form}/${seed} contains disconnected wood`);
    assert.equal(treePlanIsFaceConnected(plan, origin), true, `${form}/${seed} contains a floating crown component`);
    assert.ok(plan.some((block) => block.x === origin.x && block.y === origin.y && block.z === origin.z && block.block === log));
  }
});

test("wide ancient roots meet variable terrain and every buttress belongs to felling", () => {
  const origin = { x: 15, y: 34, z: 15 };
  const groundYAt = (x: number, z: number) => x === origin.x && z === origin.z
    ? origin.y - 1
    : origin.y - 1 + ((Math.abs(x * 3 + z * 5) % 3) - 1);
  for (const seed of Array.from({ length: 18 }, (_, index) => `ANCIENT-BUTTRESS-${index}`)) {
    const plan = planFullTree(seed, origin, "ancient", BlockId.WildwoodLog, BlockId.WildwoodLeaves, { groundYAt });
    const blocks = new Map(plan.map((block) => [keyOf(block.x, block.y, block.z), block.block] as const));
    for (let x = origin.x - 2; x <= origin.x + 2; x += 1) for (let z = origin.z - 2; z <= origin.z + 2; z += 1) {
      blocks.set(keyOf(x, groundYAt(x, z), z), BlockId.MeadowGrass);
    }
    const read = (x: number, y: number, z: number) => blocks.get(keyOf(x, y, z)) ?? BlockId.Air;
    const tree = discoverRootedTree(origin, read);
    const plannedLogs = plan.filter((block) => block.block === BlockId.WildwoodLog);
    const plannedLeaves = plan.filter((block) => block.block === BlockId.WildwoodLeaves);
    assert.ok(tree, seed);
    assert.equal(tree.logs.length, plannedLogs.length, `${seed} left a trunk or buttress behind`);
    assert.equal(tree.leaves.length, plannedLeaves.length, `${seed} clipped the broad crown`);
    const baseColumns = new Set(tree.logs.filter((block) => isRootableTreeSoil(read(block.x, block.y - 1, block.z))).map((block) => `${block.x},${block.z}`));
    assert.ok(baseColumns.size >= 4, `${seed} did not retain a wide rooted footprint`);
  }
});

test("full-tree discovery takes every authored voxel for every form without swallowing an attached build", () => {
  for (const [speciesIndex, [log, leaves]] of SPECIES.entries()) for (const form of FORMS) for (let seedIndex = 0; seedIndex < 3; seedIndex += 1) {
    const origin = { x: 15, y: 1, z: -1 };
    const seed = `FELL-${speciesIndex}-${form}-${seedIndex}`;
    const plan = planFullTree(seed, origin, form, log, leaves, { groundYAt: () => 0 });
    const blocks = flatTreeMap(plan, origin);
    const lowLogs = plan.filter((block) => block.block === log && block.y <= origin.y + 2).sort((left, right) => left.y - right.y || left.x - right.x || left.z - right.z);
    let build: Array<{ x: number; y: number; z: number }> | undefined;
    findAttachment: for (const attachment of lowLogs) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const candidate = Array.from({ length: 5 }, (_, index) => ({ x: attachment.x + dx * (index + 1), y: attachment.y, z: attachment.z + dz * (index + 1) }));
      if (candidate.every((block) => !blocks.has(keyOf(block.x, block.y, block.z)))) { build = candidate; break findAttachment; }
    }
    assert.ok(build, `${seed} has no clear beam attachment`);
    for (const block of build) {
      blocks.delete(keyOf(block.x, block.y - 1, block.z));
      blocks.set(keyOf(block.x, block.y, block.z), log);
    }
    const read = (x: number, y: number, z: number) => blocks.get(keyOf(x, y, z)) ?? BlockId.Air;
    const tree = discoverRootedTree(origin, read);
    assert.ok(tree, seed);
    assert.equal(tree.logs.length, plan.filter((block) => block.block === log).length, `${seed} missed authored wood`);
    assert.equal(tree.leaves.length, plan.filter((block) => block.block === leaves).length, `${seed} missed authored foliage`);
    assert.equal(build.some((block) => tree.logs.some((owned) => owned.x === block.x && owned.y === block.y && owned.z === block.z)), false, `${seed} consumed a player beam`);
  }
});

test("root ownership splits legacy touching trees instead of felling both", () => {
  const blocks = new Map<string, BlockId>();
  const put = (x: number, y: number, z: number, block: BlockId) => blocks.set(keyOf(x, y, z), block);
  for (const rootX of [0, 8]) {
    put(rootX, 0, 0, BlockId.MeadowGrass);
    for (let y = 1; y <= 7; y += 1) put(rootX, y, 0, BlockId.WildwoodLog);
    for (let x = rootX - 2; x <= rootX + 2; x += 1) for (let z = -2; z <= 2; z += 1) put(x, 8, z, BlockId.WildwoodLeaves);
  }
  // A malformed old branch bridge makes the log graph one component.
  for (let x = 1; x <= 7; x += 1) put(x, 6, 0, BlockId.WildwoodLog);
  const read = (x: number, y: number, z: number) => blocks.get(keyOf(x, y, z)) ?? BlockId.Air;
  const left = discoverRootedTree({ x: 0, y: 1, z: 0 }, read);
  assert.ok(left);
  assert.equal(left.logs.some((block) => block.x === 8), false, "the neighboring rooted trunk was claimed");
  assert.ok(left.logs.some((block) => block.x === 0 && block.y === 7));
});

test("orchard felling owns every hanging fruit attachment", () => {
  const origin = { x: 0, y: 1, z: 0 };
  const plan = planAppleTree(origin, "TREE-ORCHARD-FELLING");
  const blocks = new Map(plan.map((block) => [keyOf(block.x, block.y, block.z), block.type] as const));
  blocks.set(keyOf(0, 0, 0), BlockId.MeadowGrass);
  const tree = discoverRootedTree(origin, (x, y, z) => blocks.get(keyOf(x, y, z)) ?? BlockId.Air);
  const fruit = plan.filter((block) => block.type === BlockId.AppleFruit);
  assert.ok(tree);
  assert.ok(fruit.length >= 2);
  assert.deepEqual(tree.attachments.map((block) => keyOf(block.x, block.y, block.z)).sort(), fruit.map((block) => keyOf(block.x, block.y, block.z)).sort());
});

test("liquid and POI clipping cannot leave floating tree islands across seam-shaped exclusions", () => {
  const seeds = Array.from({ length: 20 }, (_, index) => `TREE-CLIP-${index}`);
  for (const form of FORMS) for (const seed of seeds) for (const seam of [-17, -1, 15, 31]) {
    const root = { x: seam, y: 35, z: 15 };
    const plan = planFullTree(seed, root, form, BlockId.CandywoodLog, BlockId.CandywoodLeaves, { groundYAt: () => root.y - 1 });
    const forbidden = new Set<string>();
    for (let z = root.z - 3; z <= root.z + 3; z += 1) forbidden.add(`${root.x + 4},${z}`);
    const repaired = repairGeneratedTreePlan({ plan, root, logBlock: BlockId.CandywoodLog, forbiddenColumns: forbidden });
    assert.ok(repaired.length > 0);
    assert.equal(treePlanIsFaceConnected(repaired, root), true, `${form}/${seed}/${seam} retained a floating island`);
    assert.equal(treeLogsAreFaceConnected(repaired, BlockId.CandywoodLog), true, `${form}/${seed}/${seam} severed its wood`);
    assert.equal(repaired.some((block) => forbidden.has(`${block.x},${block.z}`)), false);
  }
});

test("real generated trees remain rooted through chunk seams", () => {
  let seamTrees = 0;
  let inspectedTrees = 0;
  for (const seed of ["ROOTED-SEAMS-A", "ROOTED-SEAMS-B", "ROOTED-SEAMS-C", "ROOTED-SEAMS-D"]) {
    const world = new ChunkWorld();
    world.reset(seed, undefined, { structures: false });
    for (let cz = -2; cz <= 2; cz += 1) for (let cx = -2; cx <= 2; cx += 1) world.generateChunk(cx, cz);
    const signatures = new Set<string>();
    for (let z = -16; z < 32; z += 1) for (let x = -16; x < 32; x += 1) for (let y = MIN_Y + 1; y <= MAX_Y; y += 1) {
      const type = world.getBlock(x, y, z);
      if (!isTreeLogBlock(type) || !isRootableTreeSoil(world.getBlock(x, y - 1, z))) continue;
      const tree = discoverRootedTree({ x, y, z }, (bx, by, bz) => world.getBlock(bx, by, bz));
      assert.ok(tree, `generated root at ${x},${y},${z} was not fellable`);
      const signature = tree.logs.map((block) => keyOf(block.x, block.y, block.z)).sort()[0];
      if (signatures.has(signature)) continue;
      signatures.add(signature);
      inspectedTrees += 1;
      assert.ok(tree.logs.length >= 3);
      assert.ok(tree.leaves.length >= 8);
      const chunks = new Set([...tree.logs, ...tree.leaves].map((block) => `${Math.floor(block.x / CHUNK_SIZE)},${Math.floor(block.z / CHUNK_SIZE)}`));
      if (chunks.size > 1) seamTrees += 1;
    }
    world.dispose();
  }
  assert.ok(inspectedTrees >= 12, `only inspected ${inspectedTrees} generated trees`);
  assert.ok(seamTrees >= 4, `only found ${seamTrees} seam-crossing trees`);
});

test("HEARTHROADS biome-edge ancient tree neither authors beach roots nor strands its legacy collar", () => {
  const world = new ChunkWorld();
  // This coordinate records an already-deployed v14 tree/save edge case.
  // Generator 15 intentionally reallocates its surface biome, so preserve the
  // historical terrain profile while continuing to audit legacy felling.
  world.reset("HEARTHROADS", undefined, { profile: "legacy-v14", structures: false });
  for (let cz = -191; cz <= -190; cz += 1) for (let cx = -130; cx <= -129; cx += 1) world.generateChunk(cx, cz);
  const stranded = { x: -2067, y: 35, z: -3038 };
  const root = { x: -2066, y: 36, z: -3037 };
  assert.equal(world.sampleColumn(stranded.x, stranded.z).biome, BiomeId.Beach);
  assert.equal(isTreeLogBlock(world.getBlock(stranded.x, stranded.y, stranded.z)), false, "fresh generation authored a root onto beach sand");
  const fresh = discoverRootedTree(root, (x, y, z) => world.getBlock(x, y, z));
  assert.ok(fresh);
  assert.ok(fresh.logs.length >= 20);
  for (let z = -3042; z <= -3032; z += 1) for (let x = -2071; x <= -2061; x += 1) for (let y = 34; y <= 50; y += 1) {
    if (!isTreeLogBlock(world.getBlock(x, y, z))) continue;
    assert.ok(discoverRootedTree({ x, y, z }, (bx, by, bz) => world.getBlock(bx, by, bz)), `fresh orphan at ${x},${y},${z}`);
  }

  // Reconstruct the previously deployed plan without the new soil predicate.
  // Its sand-side three-log collar must remain fully fellable for old saves.
  const legacyPlan = planFullTree("HEARTHROADS:-2066,-3037", root, "ancient", BlockId.WildwoodLog, BlockId.WildwoodLeaves, {
    groundYAt: (x, z) => world.sampleColumn(x, z).height,
  });
  const legacyBlocks = new Map(legacyPlan.map((block) => [keyOf(block.x, block.y, block.z), block.block] as const));
  const legacyRead = (x: number, y: number, z: number) => legacyBlocks.get(keyOf(x, y, z)) ?? world.getBlock(x, y, z);
  assert.equal(legacyBlocks.get(keyOf(stranded.x, stranded.y, stranded.z)), BlockId.WildwoodLog);
  const legacy = discoverRootedTree(stranded, legacyRead);
  assert.ok(legacy);
  assert.equal(legacy.logs.length, legacyPlan.filter((block) => block.block === BlockId.WildwoodLog).length);
  assert.ok(legacy.logs.some((block) => block.x === stranded.x && block.y === stranded.y && block.z === stranded.z));
  world.dispose();
});

test("engine felling removes one complete wide tree across chunks and preserves a touching beam", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.world = new ChunkWorld();
  engine.world.reset("TREE-ENGINE-V1", undefined, { structures: false });
  for (let cz = 0; cz <= 1; cz += 1) for (let cx = 0; cx <= 1; cx += 1) {
    const chunk = engine.world.generateChunk(cx, cz);
    chunk.blocks.fill(BlockId.Air);
  }
  const origin = { x: 15, y: 1, z: 15 };
  const plan = planFullTree("ENGINE-ANCIENT", origin, "ancient", BlockId.WildwoodLog, BlockId.WildwoodLeaves, { groundYAt: () => 0, crownFullness: 1 });
  for (let x = 14; x <= 16; x += 1) for (let z = 14; z <= 16; z += 1) engine.world.setBlock(x, 0, z, BlockId.MeadowGrass, false);
  for (const block of plan) engine.world.setBlock(block.x, block.y, block.z, block.block, false);
  const beam = [{ x: 17, y: 1, z: 15 }, { x: 18, y: 1, z: 15 }, { x: 19, y: 1, z: 15 }];
  for (const block of beam) engine.world.setBlock(block.x, block.y, block.z, BlockId.WildwoodLog, false);
  engine.scene = new THREE.Scene();
  engine.position = new THREE.Vector3(15, 1, 10);
  engine.fallingTrees = [];
  engine.mode = "builder";
  engine.persistent = false;
  engine.yaw = 0;
  engine.audio = { play: () => undefined } as unknown as VoxelEngine["audio"];
  engine.events = { onToast: () => undefined } as unknown as VoxelEngine["events"];
  engine.publishBlockEdits = () => undefined;
  assert.equal(engine.tryFellTree(origin.x, origin.y, origin.z, BlockId.WildwoodLog), true);
  assert.equal(engine.fallingTrees[0]?.logCount, plan.filter((block) => block.block === BlockId.WildwoodLog).length);
  assert.equal(engine.fallingTrees[0]?.leafCount, plan.filter((block) => block.block === BlockId.WildwoodLeaves).length);
  for (const block of plan) assert.equal(engine.world.getBlock(block.x, block.y, block.z), BlockId.Air, `tree voxel remained at ${keyOf(block.x, block.y, block.z)}`);
  for (const block of beam) assert.equal(engine.world.getBlock(block.x, block.y, block.z), BlockId.WildwoodLog, "touching build was felled");
  for (const falling of engine.fallingTrees) engine.disposeObject(falling.group);
  engine.world.dispose();
});
