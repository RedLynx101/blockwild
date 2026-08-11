import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  buildRustKernelFixture,
  evaluateRustKernelSpatialBatch,
  replayBytesFromFixture,
  rustKernelBlockIndex,
  rustKernelFnv1aUtf16,
  rustKernelFnv1aUtf16Units,
  rustKernelHash2,
  rustKernelHash2Bits,
  rustKernelHash3,
  rustKernelHash3Bits,
  rustKernelStableIdHex,
  splitRustKernelCoordinate,
} from "../app/game/rust-kernel-shadow.ts";

const engineDirectory = resolve("engine");

function cargoAvailable() {
  const result = spawnSync("cargo", ["--version"], { encoding: "utf8", windowsHide: true });
  return result.status === 0;
}

test("native Rust replay bytes and canonical state hash match the TypeScript oracle", { timeout: 120_000 }, (context) => {
  if (!cargoAvailable()) {
    context.skip("Rust toolchain is not installed in this environment");
    return;
  }
  const temporary = mkdtempSync(join(tmpdir(), "blockwild-r1-replay-"));
  const replayPath = join(temporary, "canonical.bwr");
  try {
    const result = spawnSync("cargo", ["run", "--quiet", "-p", "blockwild-tools", "--locked", "--", "write-replay", replayPath], {
      cwd: engineDirectory,
      encoding: "utf8",
      timeout: 110_000,
      windowsHide: true,
    });
    assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
    const fixture = buildRustKernelFixture();
    assert.deepEqual(readFileSync(replayPath), Buffer.from(replayBytesFromFixture(fixture)), "the complete BWEP replay envelope must be byte-identical");
    const canonicalHash = result.stdout.match(/hash=([0-9a-f]{32})/u)?.[1];
    assert.equal(canonicalHash, fixture.replay.canonicalHash);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});

test("native Rust fixture JSON matches every TypeScript R1 kernel result", { timeout: 120_000 }, (context) => {
  if (!cargoAvailable()) {
    context.skip("Rust toolchain is not installed in this environment");
    return;
  }
  const result = spawnSync("cargo", ["run", "--quiet", "-p", "blockwild-tools", "--locked", "--", "kernels-json"], {
    cwd: engineDirectory,
    encoding: "utf8",
    timeout: 110_000,
    windowsHide: true,
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  const rustFixture = JSON.parse(result.stdout) as {
    schema: string;
    engineVersion: number;
    protocolVersion: number;
    inputSource: string | null;
    coordinates: Array<{ world: number; chunk: number; local: number }>;
    blockIndices: Array<{ x: number; y: number; z: number; index: number }>;
    seeds: Array<{ label: string; text: string | null; utf16Units: number[]; fnv1aUtf16: number }>;
    hash2: Array<{ x: number; z: number; seed: number; bits: number; unit: number }>;
    hash3: Array<{ x: number; y: number; z: number; seed: number; bits: number; unit: number }>;
    stableIds: Array<{ index: number; generation: number; packedHex: string }>;
    aabbBatches: Array<{ queryId: number; ids: string[] }>;
    rayBatches: Array<{ queryId: number; hits: Array<{ id: string; distance: number; distanceBits: string }> }>;
    replay: { frameCount: number; startingHash: string; finalHash: string; canonicalHash: string; encodedHex: string };
  };
  assert.equal(rustFixture.schema, "blockwild-kernel-fixtures-v1");
  assert.equal(rustFixture.engineVersion, 1);
  assert.equal(rustFixture.protocolVersion, 1);
  assert.equal(rustFixture.inputSource, null);

  for (const coordinate of rustFixture.coordinates) {
    assert.deepEqual({ chunk: coordinate.chunk, local: coordinate.local }, splitRustKernelCoordinate(coordinate.world));
  }
  for (const block of rustFixture.blockIndices) {
    assert.equal(block.index, rustKernelBlockIndex(block.x, block.y, block.z));
  }
  for (const seed of rustFixture.seeds) {
    assert.equal(seed.fnv1aUtf16, rustKernelFnv1aUtf16Units(seed.utf16Units), seed.label);
    if (seed.text !== null) assert.equal(seed.fnv1aUtf16, rustKernelFnv1aUtf16(seed.text), seed.label);
  }
  for (const hash of rustFixture.hash2) {
    assert.equal(hash.bits, rustKernelHash2Bits(hash.x, hash.z, hash.seed));
    assert.equal(Math.abs(hash.unit - rustKernelHash2(hash.x, hash.z, hash.seed)) <= Number.EPSILON, true);
  }
  for (const hash of rustFixture.hash3) {
    assert.equal(hash.bits, rustKernelHash3Bits(hash.x, hash.y, hash.z, hash.seed));
    assert.equal(Math.abs(hash.unit - rustKernelHash3(hash.x, hash.y, hash.z, hash.seed)) <= Number.EPSILON, true);
  }
  for (const id of rustFixture.stableIds) {
    assert.equal(id.packedHex, rustKernelStableIdHex(id));
  }

  const spatial = evaluateRustKernelSpatialBatch({
    cellSize: 4,
    entries: [
      { id: { index: 7, generation: 1 }, bounds: { min: [2, 0, 0], max: [3, 1, 1] } },
      { id: { index: 2, generation: 1 }, bounds: { min: [6, 0, 0], max: [7, 1, 1] } },
      { id: { index: 11, generation: 1 }, bounds: { min: [-3, -1, -2], max: [-1, 2, 0] } },
    ],
    aabbQueries: [
      { queryId: 9, bounds: { min: [-4, -2, -3], max: [4, 3, 2] } },
      { queryId: 3, bounds: { min: [0, 0, 0], max: [8, 2, 2] } },
    ],
    rayQueries: [
      { queryId: 9, ray: { origin: [0, 0.5, 0.5], direction: [1, 0, 0], maxDistance: 10 } },
      { queryId: 3, ray: { origin: [0, 0.5, 0.5], direction: [1, 0, 0], maxDistance: 4 } },
    ],
  });
  assert.deepEqual(rustFixture.aabbBatches, spatial.aabb);
  assert.deepEqual(rustFixture.rayBatches.map((query) => ({
    queryId: query.queryId,
    hits: query.hits.map(({ id, distance }) => ({ id, distance })),
  })), spatial.ray);
  for (const query of rustFixture.rayBatches) {
    for (const hit of query.hits) {
      const bytes = Buffer.allocUnsafe(8);
      bytes.writeDoubleBE(hit.distance, 0);
      assert.equal(hit.distanceBits, bytes.toString("hex"));
    }
  }

  const typescriptReplay = buildRustKernelFixture().replay;
  assert.deepEqual(rustFixture.replay, {
    frameCount: typescriptReplay.frames.length,
    startingHash: typescriptReplay.header.startingHash,
    finalHash: typescriptReplay.frames.at(-1)?.expectedHash,
    canonicalHash: typescriptReplay.canonicalHash,
    encodedHex: typescriptReplay.encodedHex,
  });
});
