import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  RUST_KERNEL_COORDINATE_CORPUS,
  RUST_KERNEL_HASH_CORPUS,
  RUST_KERNEL_SEED_CORPUS,
  RUST_KERNEL_SPATIAL_CORPUS,
  buildRustKernelFixture,
  evaluateRustKernelSpatialBatch,
  packRustKernelStableId,
  rustKernelBlockIndex,
  rustKernelBlockPositionFromIndex,
  rustKernelFnv1aUtf16,
  rustKernelFnv1aUtf16Units,
  rustKernelHash2Bits,
  rustKernelHash3Bits,
  rustKernelSeedStream,
  rustKernelStableIdHex,
  rustKernelXorshift32,
  splitRustKernelCoordinate,
} from "../app/game/rust-kernel-shadow.ts";
import { blockIndex, seedToInt, splitCoordinate } from "../app/game/world.ts";

test("R1 coordinate and block-index oracle matches the live TypeScript world", () => {
  for (const entry of RUST_KERNEL_COORDINATE_CORPUS) {
    const value = "negativeZero" in entry && entry.negativeZero ? -0 : entry.value;
    const oracle = splitRustKernelCoordinate(value);
    const live = splitCoordinate(value);
    assert.equal(oracle.chunk === live.chunk, true, entry.label);
    assert.equal(oracle.local, live.local, entry.label);
    if (entry.label === "negative-zero") assert.equal(Object.is(oracle.chunk, -0), false, "the cross-language wire contract canonicalizes -0 to +0");
  }

  for (const [x, y, z] of [[0, -64, 0], [15, -64, 15], [0, -63, 0], [7, 0, 11], [15, 127, 15]] as const) {
    const index = rustKernelBlockIndex(x, y, z);
    assert.equal(index, blockIndex(x, y, z));
    assert.deepEqual(rustKernelBlockPositionFromIndex(index), { x, y, z });
  }

  assert.throws(() => splitRustKernelCoordinate(Number.NaN), /signed 32-bit integer/u);
  assert.throws(() => rustKernelBlockIndex(16, 0, 0), /outside the chunk/u);
  assert.throws(() => rustKernelBlockPositionFromIndex(16 * 16 * 192), /outside the chunk column/u);
});

test("R1 seed oracle preserves JavaScript UTF-16 semantics including lone surrogates", () => {
  for (const entry of RUST_KERNEL_SEED_CORPUS) {
    const value = String.fromCharCode(...entry.utf16Units);
    assert.equal(rustKernelFnv1aUtf16Units(entry.utf16Units), seedToInt(value), entry.label);
    assert.equal(rustKernelFnv1aUtf16(value), seedToInt(value), entry.label);
  }
  assert.equal(rustKernelFnv1aUtf16("A🌿B"), 3_408_612_333);
  assert.notEqual(rustKernelFnv1aUtf16("e\u0301"), rustKernelFnv1aUtf16("é"), "seed hashing must not silently normalize Unicode");
  assert.equal(rustKernelSeedStream("rust-r1-golden", "engine"), rustKernelSeedStream("rust-r1-golden", "engine"));
  assert.notEqual(rustKernelSeedStream("rust-r1-golden", "engine"), rustKernelSeedStream("rust-r1-golden", "terrain"));
  assert.notEqual(rustKernelXorshift32(rustKernelSeedStream("rust-r1-golden", "engine")), 0);
});

test("R1 Math.imul terrain hashes stay pinned at negative and integer boundaries", () => {
  const expected = [
    [0, 0],
    [12_922_865, 2_300_723_848],
    [2_621_441_102, 2_731_425_935],
    [4_109_940_709, 705_115_904],
    [3_330_322_861, 2_921_906_554],
    [413_212_002, 1_837_433_641],
  ] as const;
  for (const [index, entry] of RUST_KERNEL_HASH_CORPUS.entries()) {
    assert.equal(rustKernelHash2Bits(entry.x, entry.z, entry.seed), expected[index][0], `${entry.label}: hash2`);
    assert.equal(rustKernelHash3Bits(entry.x, entry.y, entry.z, entry.seed), expected[index][1], `${entry.label}: hash3`);
  }
});

test("R1 stable IDs preserve generation/index packing and unsigned ordering", () => {
  assert.equal(packRustKernelStableId({ index: 0x1234_5678, generation: 0x90ab_cdef }), BigInt("0x90abcdef12345678"));
  assert.equal(rustKernelStableIdHex({ index: 0x1234_5678, generation: 0x90ab_cdef }), "90abcdef12345678");
  const ids = [
    { index: 7, generation: 1 },
    { index: 2, generation: 1 },
    { index: 1, generation: 2 },
    { index: 0xffff_ffff, generation: 0 },
  ];
  assert.deepEqual(ids.sort((left, right) => packRustKernelStableId(left) < packRustKernelStableId(right) ? -1 : 1).map(rustKernelStableIdHex), [
    "00000000ffffffff",
    "0000000100000002",
    "0000000100000007",
    "0000000200000001",
  ]);
});

test("R1 spatial oracle is batched, boundary-exact, and insertion-order independent", () => {
  const expected = evaluateRustKernelSpatialBatch(RUST_KERNEL_SPATIAL_CORPUS);
  const reversed = evaluateRustKernelSpatialBatch({
    ...RUST_KERNEL_SPATIAL_CORPUS,
    entries: [...RUST_KERNEL_SPATIAL_CORPUS.entries].reverse(),
    aabbQueries: [...RUST_KERNEL_SPATIAL_CORPUS.aabbQueries].reverse(),
    rayQueries: [...RUST_KERNEL_SPATIAL_CORPUS.rayQueries].reverse(),
  });
  assert.deepEqual(reversed, expected);
  assert.deepEqual(expected.aabb.map((query) => query.queryId), [1, 3, 9]);
  assert.deepEqual(expected.ray.map((query) => query.queryId), [2, 5, 8]);
  assert.deepEqual(expected.aabb.find((query) => query.queryId === 9)?.ids, ["0000000200000003"], "touching an exact AABB boundary must count");
  assert.equal(buildRustKernelFixture().contracts.batchBoundary.callsPerEvaluation, 2);
  assert.equal(buildRustKernelFixture().contracts.batchBoundary.aabbQueries + buildRustKernelFixture().contracts.batchBoundary.rayQueries, 6);
});

test("checked-in R1 fixture is an exact regeneration of the TypeScript oracle", () => {
  const checkedIn = JSON.parse(readFileSync("tests/fixtures/rust-engine/r1-kernel-fixture.json", "utf8"));
  assert.deepEqual(checkedIn, buildRustKernelFixture());
});
