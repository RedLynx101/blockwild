import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import test from "node:test";
import { BLOCKS, BlockId } from "../app/game/data.ts";
import {
  LightChannel,
  MAX_LIGHT_LEVEL,
  VoxelLightEngine,
  lightChannel,
  packVoxelLight,
  perceivedBlockLight,
  unpackVoxelLight,
  type VoxelLightChunk,
} from "../app/game/lighting.ts";

const SIZE = 8;
const MIN_Y = 0;
const MAX_Y = 15;
const HEIGHT = MAX_Y - MIN_Y + 1;

type Harness = ReturnType<typeof createHarness>;

function createHarness() {
  const chunks = new Map<string, VoxelLightChunk>();
  const dirtySections = new Set<string>();
  const indexAt = (x: number, y: number, z: number) => x + SIZE * (z + SIZE * (y - MIN_Y));
  const split = (value: number) => {
    const chunk = Math.floor(value / SIZE);
    return { chunk, local: value - chunk * SIZE };
  };
  const chunkAt = (x: number, z: number) => chunks.get(`${split(x).chunk},${split(z).chunk}`);
  const engine = new VoxelLightEngine({
    chunkSize: SIZE,
    minY: MIN_Y,
    maxY: MAX_Y,
    getChunk: (cx, cz) => chunks.get(`${cx},${cz}`),
    getDefinition: (type) => BLOCKS[type],
    markLightDirty: (x, y, z) => dirtySections.add(`${Math.floor(x / SIZE)},${Math.floor(z / SIZE)},${Math.floor((y - MIN_Y) / 8)}`),
  });
  const addChunk = (cx: number, cz: number, fill = BlockId.Air) => {
    const chunk: VoxelLightChunk = {
      cx,
      cz,
      blocks: new Uint16Array(SIZE * SIZE * HEIGHT).fill(fill),
      light: new Uint16Array(SIZE * SIZE * HEIGHT),
      lightInitialized: false,
    };
    chunks.set(`${cx},${cz}`, chunk);
    return chunk;
  };
  const blockAt = (x: number, y: number, z: number) => {
    const sx = split(x);
    const sz = split(z);
    const chunk = chunkAt(x, z);
    return chunk?.blocks[indexAt(sx.local, y, sz.local)] as BlockId | undefined;
  };
  const setRaw = (x: number, y: number, z: number, type: BlockId) => {
    const sx = split(x);
    const sz = split(z);
    const chunk = chunkAt(x, z);
    assert.ok(chunk, `missing test chunk at ${x},${z}`);
    chunk.blocks[indexAt(sx.local, y, sz.local)] = type;
  };
  const change = (x: number, y: number, z: number, next: BlockId) => {
    const previous = blockAt(x, y, z);
    assert.notEqual(previous, undefined);
    setRaw(x, y, z, next);
    engine.updateBlock({ x, y, z, previous: previous!, next });
  };
  return { chunks, dirtySections, engine, addChunk, blockAt, setRaw, change };
}

function initialize(harness: Harness, order: readonly [number, number][]) {
  for (const [cx, cz] of order) harness.engine.initializeChunk(harness.chunks.get(`${cx},${cz}`)!);
}

test("packed light preserves independent four-bit sky and RGB channels", () => {
  const packed = packVoxelLight({ sky: 15, red: 13, green: 7, blue: 2 });
  assert.deepEqual(unpackVoxelLight(packed), { sky: 15, red: 13, green: 7, blue: 2 });
  assert.equal(lightChannel(packed, LightChannel.Green), 7);
  assert.equal(perceivedBlockLight(packed), 13);
  assert.equal(packed >>> 16, 0, "one Uint16 owns a complete voxel-light sample");
});

test("skylight enters shafts, diffuses under roofs, and distinguishes a shallow room from a cave", () => {
  const harness = createHarness();
  harness.addChunk(0, 0);
  for (let x = 1; x <= 6; x += 1) for (let z = 1; z <= 6; z += 1) harness.setRaw(x, 10, z, BlockId.Stone);
  // Leave a one-block shaft through the roof.
  harness.setRaw(1, 10, 3, BlockId.Air);
  initialize(harness, [[0, 0]]);
  const shaft = harness.engine.getLevels(1, 8, 3).sky;
  const edge = harness.engine.getLevels(2, 8, 3).sky;
  const deep = harness.engine.getLevels(5, 4, 5).sky;
  assert.equal(shaft, MAX_LIGHT_LEVEL);
  assert.ok(edge > 0 && edge < shaft, `shaft edge skylight was ${edge}`);
  assert.ok(deep < edge, `deep roofed skylight ${deep} should be dimmer than edge ${edge}`);
});

test("colored torch light turns corners but cannot leak through a sealed wall", () => {
  const harness = createHarness();
  harness.addChunk(0, 0);
  for (let y = MIN_Y; y <= MAX_Y; y += 1) for (let z = 0; z < SIZE; z += 1) harness.setRaw(4, y, z, BlockId.Stone);
  harness.setRaw(2, 7, 4, BlockId.Torch);
  initialize(harness, [[0, 0]]);
  const source = harness.engine.getLevels(2, 7, 4);
  const near = harness.engine.getLevels(3, 7, 4);
  const behindWall = harness.engine.getLevels(5, 7, 4);
  assert.ok(source.red > source.green && source.green > source.blue, "torch hue remains warm");
  assert.ok(near.red < source.red && near.red > 0, "block light attenuates one level per open cell");
  assert.equal(perceivedBlockLight(packVoxelLight(behindWall)), 0, "a full wall is an actual propagation barrier");

  // Open one end: the longer path around the corner is illuminated, but dimmer.
  for (let y = 5; y <= 9; y += 1) harness.change(4, y, 0, BlockId.Air);
  const aroundCorner = harness.engine.getLevels(5, 7, 1).red;
  assert.ok(aroundCorner > 0 && aroundCorner < near.red, `corner light was ${aroundCorner}, direct neighbor ${near.red}`);
});

test("removing a source clears dependent light without ghost illumination", () => {
  const harness = createHarness();
  harness.addChunk(0, 0);
  harness.setRaw(3, 7, 3, BlockId.Glowstone);
  initialize(harness, [[0, 0]]);
  assert.ok(perceivedBlockLight(harness.engine.getPacked(6, 7, 3)) > 0);
  harness.change(3, 7, 3, BlockId.Air);
  for (let x = 0; x < SIZE; x += 1) for (let y = MIN_Y; y <= MAX_Y; y += 1) for (let z = 0; z < SIZE; z += 1) {
    assert.equal(perceivedBlockLight(harness.engine.getPacked(x, y, z)), 0, `ghost at ${x},${y},${z}`);
  }
  assert.ok(harness.dirtySections.size > 0, "light-only changes identify affected mesh sections");
});

test("water and leaves attenuate both skylight and block light from their data definitions", () => {
  const open = createHarness();
  open.addChunk(0, 0);
  open.setRaw(2, 12, 2, BlockId.Torch);
  initialize(open, [[0, 0]]);

  const filtered = createHarness();
  filtered.addChunk(0, 0);
  filtered.setRaw(2, 12, 2, BlockId.Torch);
  filtered.setRaw(3, 12, 2, BlockId.Water);
  filtered.setRaw(4, 12, 2, BlockId.WildwoodLeaves);
  initialize(filtered, [[0, 0]]);
  assert.ok(filtered.engine.getLevels(3, 12, 2).red < open.engine.getLevels(3, 12, 2).red);
  assert.ok(filtered.engine.getLevels(4, 10, 2).sky < open.engine.getLevels(4, 10, 2).sky);
  assert.equal(BLOCKS[BlockId.Water].lightDampening, 1);
  assert.equal(BLOCKS[BlockId.WildwoodLeaves].lightDampening, 1);
});

test("chunk seams are load-order independent, including negative coordinates", () => {
  const run = (order: readonly [number, number][]) => {
    const harness = createHarness();
    harness.addChunk(-1, 0);
    harness.addChunk(0, 0);
    harness.setRaw(-1, 8, 3, BlockId.CrystalBlock);
    initialize(harness, order);
    return Array.from({ length: 8 }, (_, x) => harness.engine.getPacked(x, 8, 3));
  };
  const negativeFirst = run([[-1, 0], [0, 0]]);
  const positiveFirst = run([[0, 0], [-1, 0]]);
  assert.deepEqual(negativeFirst, positiveFirst);
  assert.ok(negativeFirst.some((packed) => perceivedBlockLight(packed) > 0), "light crosses the seam at x=0");
});

test("dense-source initialization stays bounded and deterministic", () => {
  const harness = createHarness();
  harness.addChunk(0, 0);
  for (let x = 0; x < SIZE; x += 2) for (let y = 2; y <= 14; y += 3) for (let z = 0; z < SIZE; z += 2) {
    harness.setRaw(x, y, z, (x + y + z) % 4 === 0 ? BlockId.Lava : BlockId.LightningBugJar);
  }
  const start = performance.now();
  initialize(harness, [[0, 0]]);
  const elapsed = performance.now() - start;
  const first = Uint16Array.from(harness.chunks.get("0,0")!.light);
  harness.engine.initializeChunk(harness.chunks.get("0,0")!);
  assert.deepEqual(harness.chunks.get("0,0")!.light, first, "derived lighting is deterministic across reloads");
  assert.ok(elapsed < 750, `dense light initialization took ${elapsed.toFixed(1)}ms`);
});

test("resumable initialization is bit-exact across tiny work slices", () => {
  const populate = (harness: Harness) => {
    harness.addChunk(0, 0);
    for (let x = 0; x < SIZE; x += 1) for (let z = 0; z < SIZE; z += 1) {
      harness.setRaw(x, 5 + ((x + z) % 3), z, BlockId.Stone);
    }
    harness.setRaw(2, 8, 2, BlockId.Torch);
    harness.setRaw(5, 9, 4, BlockId.CrystalBlock);
  };
  const synchronous = createHarness();
  const resumable = createHarness();
  populate(synchronous);
  populate(resumable);
  synchronous.engine.initializeChunk(synchronous.chunks.get("0,0")!);
  const chunk = resumable.chunks.get("0,0")!;
  const task = resumable.engine.beginChunkInitialization(chunk);
  let slices = 0;
  while (!resumable.engine.stepChunkInitialization(task, 13)) {
    slices += 1;
    assert.ok(slices < 20_000, "resumable lighting must converge");
  }
  assert.ok(slices > 10, "the fixture must exercise actual yielding");
  assert.deepEqual(chunk.light, synchronous.chunks.get("0,0")!.light);
  assert.equal(chunk.lightInitialized, true);
});
