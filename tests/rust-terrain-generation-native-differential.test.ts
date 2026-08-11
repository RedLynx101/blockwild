import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import test from "node:test";
import {
  LEGACY_TERRAIN_CONTENT_HASH_V2,
  createGenerateChunkRequestV2,
  createGeneratedChunkV2,
  decodeTerrainGenerationMarkerTableV2,
  legacyTerrainGeneratorHashV2,
  type GeneratedChunkV2,
} from "../app/game/terrain-generation-contract.ts";
import { generateChunkWithLegacyOracleV2 } from "../app/game/rust-terrain-generation-legacy-oracle.ts";
import {
  decodeRustTerrainGenerationResultV2,
  encodeRustTerrainGenerationRequestV2,
} from "../app/game/rust-terrain-generation-bridge.ts";
import { terrainGenerationChunksByteEqualV2 } from "../app/game/rust-terrain-generation-backend.ts";

const ROOT = resolve(import.meta.dirname, "..");
const executable = join(ROOT, "engine", "target", "debug", `blockwild-generation-fixture${process.platform === "win32" ? ".exe" : ""}`);
const enabled = process.env.BLOCKWILD_R3_NATIVE_DIAGNOSTIC === "1" || process.env.BLOCKWILD_R3_NATIVE_PARITY === "1";

function request(seedText: string, cx: number, cz: number, taskId: number) {
  const generationOptions = process.env.BLOCKWILD_R3_STRUCTURES_FALSE === "1" ? { structures: false } : {};
  const optionsJson = JSON.stringify(generationOptions);
  const namespace = `terrain-v5|g18|${seedText}|${optionsJson}|${cx},${cz}|0`;
  return createGenerateChunkRequestV2({
    epoch: 1,
    taskId,
    revision: taskId,
    namespace,
    contentHash: LEGACY_TERRAIN_CONTENT_HASH_V2,
    generatorHash: legacyTerrainGeneratorHashV2(namespace),
    seedText,
    generationOptions,
    key: `${cx},${cz}`,
    cx,
    cz,
    edits: [],
  });
}

function differingStreams(reference: GeneratedChunkV2, candidate: GeneratedChunkV2) {
  const equal = (left: ArrayBufferView, right: ArrayBufferView) => {
    const a = new Uint8Array(left.buffer, left.byteOffset, left.byteLength);
    const b = new Uint8Array(right.buffer, right.byteOffset, right.byteLength);
    return a.byteLength === b.byteLength && a.every((value, index) => value === b[index]);
  };
  return (["blocks", "heightmap", "biomes", "sectionBlockCounts", "skyTops", "light", "lightIndices", "leafIndices"] as const)
    .filter((stream) => !equal(reference[stream], candidate[stream]));
}

function mismatchCounts(reference: GeneratedChunkV2, candidate: GeneratedChunkV2) {
  const count = (left: ArrayLike<number>, right: ArrayLike<number>) => {
    let mismatches = Math.abs(left.length - right.length);
    for (let index = 0; index < Math.min(left.length, right.length); index += 1) if (left[index] !== right[index]) mismatches += 1;
    return mismatches;
  };
  return {
    blocks: count(reference.blocks, candidate.blocks),
    heightmap: count(reference.heightmap, candidate.heightmap),
    biomes: count(reference.biomes, candidate.biomes),
    sectionBlockCounts: count(reference.sectionBlockCounts, candidate.sectionBlockCounts),
    skyTops: count(reference.skyTops, candidate.skyTops),
    light: count(reference.light, candidate.light),
    lightIndices: count(reference.lightIndices, candidate.lightIndices),
    leafIndices: count(reference.leafIndices, candidate.leafIndices),
    markerOffsets: count(reference.markerTable.offsets, candidate.markerTable.offsets),
    markerBytes: count(reference.markerTable.bytes, candidate.markerTable.bytes),
  };
}

function blockMismatchHistogram(reference: GeneratedChunkV2, candidate: GeneratedChunkV2) {
  const counts = new Map<string, number>();
  for (let index = 0; index < reference.blocks.length; index += 1) {
    const expected = reference.blocks[index];
    const actual = candidate.blocks[index];
    if (expected === actual) continue;
    const key = `${expected}->${actual}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort((left, right) => right[1] - left[1]).slice(0, 20);
}

function blockMismatchSamples(reference: GeneratedChunkV2, candidate: GeneratedChunkV2) {
  const samples = [];
  for (let index = 0; index < reference.blocks.length && samples.length < 20; index += 1) {
    if (reference.blocks[index] === candidate.blocks[index]) continue;
    const layer = Math.floor(index / 256);
    const horizontal = index % 256;
    samples.push({ index, lx: horizontal % 16, y: layer - 64, lz: Math.floor(horizontal / 16), expected: reference.blocks[index], actual: candidate.blocks[index] });
  }
  return samples;
}

function selectedBlockPositions(chunk: GeneratedChunkV2, selected: ReadonlySet<number>) {
  const positions = [];
  for (let index = 0; index < chunk.blocks.length; index += 1) {
    if (!selected.has(chunk.blocks[index])) continue;
    const layer = Math.floor(index / 256);
    const horizontal = index % 256;
    positions.push({ lx: horizontal % 16, y: layer - 64, lz: Math.floor(horizontal / 16), block: chunk.blocks[index] });
  }
  return positions;
}

test("native generator v18 differential corpus", { skip: !enabled || !existsSync(executable) }, async () => {
  const directory = join(ROOT, "work", "r3-native-differential");
  await mkdir(directory, { recursive: true });
  const explicitCases = process.env.BLOCKWILD_R3_EXPLICIT_CASES
    ? JSON.parse(process.env.BLOCKWILD_R3_EXPLICIT_CASES) as Array<readonly [string, number, number]>
    : null;
  const cases: Array<readonly [string, number, number]> = explicitCases ?? [
    ["WILDERNESS", -8, -1],
    ["CONNECTED-WATER-DATUM", 0, 0],
    ["OCEAN-V07", -16, 23],
    ["large-negative-9007199254740991", -511, 509],
  ];
  const requestedCases = explicitCases
    ? cases.length
    : Math.max(4, Math.floor(Number(process.env.BLOCKWILD_R3_CORPUS_CASES ?? cases.length)));
  for (let index = cases.length; index < requestedCases; index += 1) {
    const coordinate = index - 4;
    cases.push([
      `r3-v18-corpus-${coordinate % 17}`,
      (Math.imul(coordinate, 7_919) % 4_093) - 2_046,
      2_046 - (Math.imul(coordinate, 3_571) % 4_093),
    ]);
  }
  const report = [];
  for (let caseIndex = 0; caseIndex < cases.length; caseIndex += 1) {
    const [seed, cx, cz] = cases[caseIndex];
    const source = request(seed, cx, cz, caseIndex + 1);
    const reference = createGeneratedChunkV2(source, generateChunkWithLegacyOracleV2(source));
    const input = join(directory, `${caseIndex}.request.bin`);
    const output = join(directory, `${caseIndex}.result.bin`);
    await writeFile(input, encodeRustTerrainGenerationRequestV2(source));
    const processResult = spawnSync(executable, ["--packet", input, output], { cwd: ROOT, encoding: "utf8" });
    assert.equal(processResult.status, 0, processResult.stderr);
    const candidate = decodeRustTerrainGenerationResultV2(await readFile(output), source);
    const equal = terrainGenerationChunksByteEqualV2(reference, candidate);
    report.push({ seed, cx, cz, equal, centerBiome: reference.biomes[8 + 8 * 16], streams: differingStreams(reference, candidate), counts: mismatchCounts(reference, candidate), blockMismatchHistogram: blockMismatchHistogram(reference, candidate), blockMismatchSamples: blockMismatchSamples(reference, candidate), referenceFeaturePositions: process.env.BLOCKWILD_R3_FEATURE_DETAIL === "1" ? selectedBlockPositions(reference, new Set([17, 18, 540, 541])) : [], candidateFeaturePositions: process.env.BLOCKWILD_R3_FEATURE_DETAIL === "1" ? selectedBlockPositions(candidate, new Set([17, 18, 540, 541])) : [], referenceMarkers: decodeTerrainGenerationMarkerTableV2(reference.markerTable), candidateMarkers: decodeTerrainGenerationMarkerTableV2(candidate.markerTable), reference: reference.chunkHash, candidate: candidate.chunkHash });
    if (process.env.BLOCKWILD_R3_NATIVE_PARITY === "1") assert.equal(equal, true, JSON.stringify(report.at(-1)));
  }
  const selectedReport = process.env.BLOCKWILD_R3_MISMATCH_ONLY === "1"
    ? report.filter(({ equal }) => !equal)
    : report;
  const output = process.env.BLOCKWILD_R3_SUMMARY === "1"
    ? selectedReport.map(({ seed, cx, cz, equal, centerBiome, streams, counts, blockMismatchHistogram, blockMismatchSamples, referenceFeaturePositions, candidateFeaturePositions, referenceMarkers, candidateMarkers }) => ({
      seed, cx, cz, equal, centerBiome, streams, counts, blockMismatchHistogram, blockMismatchSamples, referenceFeaturePositions, candidateFeaturePositions,
      referenceMarkerKeys: referenceMarkers.map(([key]) => key),
      candidateMarkerKeys: candidateMarkers.map(([key]) => key),
    }))
    : selectedReport;
  console.log(`R3_NATIVE_DIFFERENTIAL ${JSON.stringify(output)}`);
});
