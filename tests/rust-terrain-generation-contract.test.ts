import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  LEGACY_TERRAIN_CONTENT_HASH_V2,
  TERRAIN_GENERATION_CELL_COUNT_V2,
  TERRAIN_GENERATION_COLUMN_COUNT_V2,
  TERRAIN_GENERATION_SECTION_COUNT_V2,
  TerrainGenerationContractError,
  assertGeneratedChunkV2,
  createGenerateChunkRequestV2,
  createGeneratedChunkV2,
  decodeTerrainGenerationMarkerTableV2,
  generateChunkRequestTransferListV2,
  generatedChunkTransferListV2,
  legacyTerrainGeneratorHashV2,
} from "../app/game/terrain-generation-contract.ts";

function request(cx = -8, cz = -1) {
  return createGenerateChunkRequestV2({
    epoch: 7,
    taskId: 42,
    revision: 11,
    namespace: `terrain-v5|g18|WILDERNESS|{}|${cx},${cz}|0`,
    contentHash: LEGACY_TERRAIN_CONTENT_HASH_V2,
    generatorHash: legacyTerrainGeneratorHashV2("g18"),
    seedText: "WILDERNESS",
    generationOptions: { structures: true, nested: { z: 1, a: true } },
    key: `${cx},${cz}`,
    cx,
    cz,
    edits: [[99, 4], [2, 8], [47, 3]],
  });
}

function payload(source = request()) {
  return {
    key: source.key,
    cx: source.cx,
    cz: source.cz,
    blocks: new Uint16Array(TERRAIN_GENERATION_CELL_COUNT_V2),
    heightmap: new Int16Array(TERRAIN_GENERATION_COLUMN_COUNT_V2),
    biomes: new Uint8Array(TERRAIN_GENERATION_COLUMN_COUNT_V2),
    sectionBlockCounts: new Uint16Array(TERRAIN_GENERATION_SECTION_COUNT_V2),
    skyTops: new Int16Array(TERRAIN_GENERATION_COLUMN_COUNT_V2),
    light: new Uint16Array(TERRAIN_GENERATION_CELL_COUNT_V2),
    lightIndices: [19, 3],
    leafIndices: [12, 4],
    structureMarkers: [
      ["z-marker", { type: "landmark", id: "z", position: { x: -120, y: 40, z: -8 }, tag: "z" }],
      ["a-marker", { type: "spawn", id: "a", position: { x: -127, y: 41, z: -15 }, mobKind: "sunbun", count: 2, radius: 4, persistent: true }],
    ] as const,
  };
}

test("GenerateChunkRequestV2 canonicalizes negative chunks, JSON and sorted edit pairs", () => {
  const first = request();
  const second = createGenerateChunkRequestV2({
    ...first,
    generationOptions: { nested: { a: true, z: 1 }, structures: true },
    edits: [[47, 3], [99, 4], [2, 8]],
  });
  assert.equal(first.key, "-8,-1");
  assert.deepEqual([...first.edits], [2, 8, 47, 3, 99, 4]);
  assert.equal(first.requestHash, second.requestHash);
  assert.equal(generateChunkRequestTransferListV2(first).length, 1);
});

test("GeneratedChunkV2 fixes stream sizes, sorted indexes, marker bytes and checksum", () => {
  const source = request();
  const chunk = createGeneratedChunkV2(source, payload(source));
  assert.deepEqual([...chunk.lightIndices], [3, 19]);
  assert.deepEqual([...chunk.leafIndices], [4, 12]);
  assert.deepEqual(decodeTerrainGenerationMarkerTableV2(chunk.markerTable).map(([key]) => key), ["a-marker", "z-marker"]);
  assert.equal(generatedChunkTransferListV2(chunk).length, 10);
  assert.doesNotThrow(() => assertGeneratedChunkV2(chunk));

  const corrupted = { ...chunk, blocks: chunk.blocks.slice() };
  corrupted.blocks[0] = 1;
  assert.throws(() => assertGeneratedChunkV2(corrupted), TerrainGenerationContractError);
  assert.throws(() => createGeneratedChunkV2(source, { ...payload(source), blocks: new Uint16Array(1) }), TerrainGenerationContractError);
});

test("duplicate edits and marker keys fail closed instead of becoming order-dependent", () => {
  assert.throws(() => createGenerateChunkRequestV2({ ...request(), edits: [[2, 1], [2, 4]] }), TerrainGenerationContractError);
  const source = request();
  assert.throws(() => createGeneratedChunkV2(source, {
    ...payload(source),
    structureMarkers: [payload(source).structureMarkers[0], payload(source).structureMarkers[0]],
  }), TerrainGenerationContractError);
});

test("the V2 worker and injectable boundary contain no renderer import or construction", async () => {
  for (const path of [
    new URL("../app/game/terrain-generation-contract.ts", import.meta.url),
    new URL("../app/game/rust-terrain-generation-backend.ts", import.meta.url),
    new URL("../app/game/terrain-generation-worker.ts", import.meta.url),
  ]) {
    const source = await readFile(path, "utf8");
    assert.doesNotMatch(source, /from\s+["']three["']/);
    assert.doesNotMatch(source, /new\s+THREE\./);
    assert.doesNotMatch(source, /new\s+ChunkWorld\s*\(/);
  }
  const oracle = await readFile(new URL("../app/game/rust-terrain-generation-legacy-oracle.ts", import.meta.url), "utf8");
  assert.match(oracle, /Promotion constraint:/, "the remaining ChunkWorld extraction debt must stay explicit");
});
