import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import test from "node:test";
import {
  LEGACY_TERRAIN_CONTENT_HASH_V2,
  createGenerateChunkRequestV2,
  createGeneratedChunkV2,
  hashTerrainGenerationIdentityV2,
  legacyTerrainGeneratorHashV2,
  stableTerrainGenerationJsonV2,
  type TerrainGenerationEditPair,
} from "../app/game/terrain-generation-contract.ts";
import { terrainGenerationChunksByteEqualV2 } from "../app/game/rust-terrain-generation-backend.ts";
import {
  TERRAIN_GENERATION_PARITY_MINIMUM_CASES_V2,
  decodeRustTerrainGenerationResultV2,
  encodeRustTerrainGenerationRequestV2,
  parseTerrainGenerationParityCertificateV2,
} from "../app/game/rust-terrain-generation-bridge.ts";
import { generateChunkWithLegacyOracleV2 } from "../app/game/rust-terrain-generation-legacy-oracle.ts";

type Case = Readonly<{
  id: string;
  seed: string;
  chunk: readonly [number, number];
  options?: Readonly<Record<string, unknown>>;
  edits?: readonly TerrainGenerationEditPair[];
}>;

type Manifest = Readonly<{
  genericSweep: Readonly<{
    cases: number;
    seedModulo: number;
    xMultiplier: number;
    zMultiplier: number;
    coordinateModulus: number;
    coordinateOffset: number;
  }>;
  cases: readonly Case[];
}>;

type GenerationWasm = Readonly<{
  default(input: { module_or_path: Uint8Array }): Promise<unknown>;
  blockwild_generate_chunk_v2(request: Uint8Array): Uint8Array;
  blockwild_generation_parity_certificate_v2(): Uint8Array;
}>;

const ROOT = resolve(import.meta.dirname, "..");

function expandedCases(manifest: Manifest) {
  const named = [...manifest.cases];
  const sweep = manifest.genericSweep;
  const generic: Case[] = Array.from({ length: sweep.cases }, (_, coordinate) => ({
    id: `generic-${coordinate.toString().padStart(3, "0")}`,
    seed: `r3-v18-corpus-${coordinate % sweep.seedModulo}`,
    chunk: [
      (Math.imul(coordinate, sweep.xMultiplier) % sweep.coordinateModulus) - sweep.coordinateOffset,
      sweep.coordinateOffset - (Math.imul(coordinate, sweep.zMultiplier) % sweep.coordinateModulus),
    ],
  }));
  const genericOrder = generic.map((_, index) => index).sort((left, right) => {
    const leftBand = (left + named.length) % 2, rightBand = (right + named.length) % 2;
    return leftBand - rightBand || right - left;
  });
  return [...named, ...genericOrder.map((index) => generic[index])];
}

function requestFor(entry: Case, taskId: number) {
  const [cx, cz] = entry.chunk;
  const generationOptions = entry.options ?? {};
  const namespace = `terrain-v5|g18|${entry.seed}|${stableTerrainGenerationJsonV2(generationOptions)}|${cx},${cz}|${entry.edits?.length ? 1 : 0}`;
  return createGenerateChunkRequestV2({
    epoch: 1,
    taskId,
    revision: taskId,
    namespace,
    contentHash: LEGACY_TERRAIN_CONTENT_HASH_V2,
    generatorHash: legacyTerrainGeneratorHashV2(namespace),
    seedText: entry.seed,
    generationOptions,
    key: `${cx},${cz}`,
    cx,
    cz,
    edits: entry.edits ?? [],
  });
}

test("published Wasm is exact on the complete R3 promotion corpus", async () => {
  const manifest = JSON.parse(await readFile(resolve(ROOT, "tests/fixtures/rust-engine/r3/promotion-corpus.json"), "utf8")) as Manifest;
  const index = JSON.parse(await readFile(resolve(ROOT, "public/engine/manifest.json"), "utf8"));
  const hash = index.artifacts[index.defaultVariant].hash as string;
  const directory = resolve(ROOT, "public", "engine", hash);
  const module = await import(`${pathToFileURL(resolve(directory, "engine.js")).href}?r3=${Date.now()}`) as GenerationWasm;
  await module.default({ module_or_path: new Uint8Array(await readFile(resolve(directory, "engine_bg.wasm"))) });

  const cases = expandedCases(manifest);
  const chunkHashes: string[] = [];
  for (const [index, entry] of cases.entries()) {
    const request = requestFor(entry, index + 1);
    const reference = createGeneratedChunkV2(request, generateChunkWithLegacyOracleV2(request));
    const candidate = decodeRustTerrainGenerationResultV2(
      module.blockwild_generate_chunk_v2(encodeRustTerrainGenerationRequestV2(request)),
      request,
    );
    assert.equal(terrainGenerationChunksByteEqualV2(reference, candidate), true,
      `${entry.id}: published Wasm artifact ${hash} differs from the TypeScript v18 oracle`);
    chunkHashes.push(`${entry.id}\0${reference.chunkHash}\0${candidate.chunkHash}`);
  }

  const corpusHash = hashTerrainGenerationIdentityV2(
    "blockwild-r3-promotion-corpus-v1",
    stableTerrainGenerationJsonV2(manifest),
    ...chunkHashes.sort(),
  );
  const certificate = parseTerrainGenerationParityCertificateV2(module.blockwild_generation_parity_certificate_v2());
  assert.equal(certificate.byteEqual, true);
  assert.equal(certificate.corpusCases, cases.length);
  assert.equal(certificate.corpusCases, TERRAIN_GENERATION_PARITY_MINIMUM_CASES_V2);
  assert.equal(certificate.corpusHash, corpusHash);
});
