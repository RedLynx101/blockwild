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
  hashTerrainGenerationIdentityV2,
  legacyTerrainGeneratorHashV2,
  stableTerrainGenerationJsonV2,
  type GenerateChunkRequestV2,
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

type CorpusCase = Readonly<{
  id: string;
  seed: string;
  chunk: readonly [number, number];
  options?: Readonly<Record<string, unknown>>;
  edits?: readonly TerrainGenerationEditPair[];
  coverage: readonly string[];
  markerToken?: string;
  absentMarkerToken?: string;
  minimumMarkers?: number;
  maximumMarkers?: number;
}>;

type CorpusManifest = Readonly<{
  schema: number;
  generatorVersion: number;
  genericSweep: Readonly<{
    cases: number;
    seedModulo: number;
    xMultiplier: number;
    zMultiplier: number;
    coordinateModulus: number;
    coordinateOffset: number;
    coverage: readonly string[];
  }>;
  requiredCoverage: readonly string[];
  cases: readonly CorpusCase[];
}>;

const ROOT = resolve(import.meta.dirname, "..");
const MANIFEST_PATH = join(ROOT, "tests", "fixtures", "rust-engine", "r3", "promotion-corpus.json");
const FIXTURE = join(ROOT, "engine", "target", "debug", `blockwild-generation-fixture${process.platform === "win32" ? ".exe" : ""}`);
const WORK = join(ROOT, "work", "r3-promotion-corpus");

function requestFor(entry: CorpusCase, taskId: number): GenerateChunkRequestV2 {
  const [cx, cz] = entry.chunk;
  const generationOptions = entry.options ?? {};
  const optionsJson = stableTerrainGenerationJsonV2(generationOptions);
  const editHalo = entry.edits?.length ? 1 : 0;
  const namespace = `terrain-v5|g18|${entry.seed}|${optionsJson}|${cx},${cz}|${editHalo}`;
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

function genericCases(manifest: CorpusManifest): CorpusCase[] {
  const sweep = manifest.genericSweep;
  return Array.from({ length: sweep.cases }, (_, index) => {
    const coordinate = index;
    return {
      id: `generic-${index.toString().padStart(3, "0")}`,
      seed: `r3-v18-corpus-${coordinate % sweep.seedModulo}`,
      chunk: [
        (Math.imul(coordinate, sweep.xMultiplier) % sweep.coordinateModulus) - sweep.coordinateOffset,
        sweep.coordinateOffset - (Math.imul(coordinate, sweep.zMultiplier) % sweep.coordinateModulus),
      ],
      coverage: sweep.coverage,
    };
  });
}

function buildNativeFixture() {
  const result = spawnSync("cargo", ["build", "-p", "blockwild-generation", "--bin", "blockwild-generation-fixture"], {
    cwd: join(ROOT, "engine"),
    encoding: "utf8",
    timeout: 180_000,
  });
  assert.equal(result.status, 0, `R3 native fixture build failed:\n${result.stderr || result.stdout}`);
  assert.equal(existsSync(FIXTURE), true, `R3 native fixture is absent after build: ${FIXTURE}`);
}

test("R3 named promotion coverage is complete and the exact corpus is byte-equal", async () => {
  assert.equal(existsSync(MANIFEST_PATH), true, `R3 promotion manifest is absent: ${MANIFEST_PATH}`);
  const manifestText = await readFile(MANIFEST_PATH, "utf8");
  const manifest = JSON.parse(manifestText) as CorpusManifest;
  assert.equal(manifest.schema, 1);
  assert.equal(manifest.generatorVersion, 18);
  assert.ok(manifest.genericSweep.cases >= 64, "the deterministic coordinate sweep must remain large enough");

  const ids = manifest.cases.map(({ id }) => id);
  assert.equal(new Set(ids).size, ids.length, "named promotion case ids must be unique");
  const actualCoverage = new Set([
    ...manifest.genericSweep.coverage,
    ...manifest.cases.flatMap(({ coverage }) => coverage),
  ]);
  assert.deepEqual([...actualCoverage].sort(), [...new Set(manifest.requiredCoverage)].sort(),
    "named promotion coverage must match the fail-closed required family list exactly");

  buildNativeFixture();
  await mkdir(WORK, { recursive: true });
  const cases = [...manifest.cases, ...genericCases(manifest)];
  const namedCount = manifest.cases.length;
  const genericOrder = cases.slice(namedCount).map((_, offset) => namedCount + offset).sort((left, right) => {
    const leftBand = left % 2, rightBand = right % 2;
    return leftBand - rightBand || right - left;
  });
  const order = [...cases.slice(0, namedCount).map((_, index) => index), ...genericOrder];
  const chunkHashes: string[] = [];
  for (let sequence = 0; sequence < order.length; sequence += 1) {
    const entry = cases[order[sequence]];
    const request = requestFor(entry, sequence + 1);
    const reference = createGeneratedChunkV2(request, generateChunkWithLegacyOracleV2(request));
    const input = join(WORK, `${sequence}.request.bin`);
    const output = join(WORK, `${sequence}.result.bin`);
    await writeFile(input, encodeRustTerrainGenerationRequestV2(request));
    const result = spawnSync(FIXTURE, ["--packet", input, output], { cwd: ROOT, encoding: "utf8", timeout: 30_000 });
    assert.equal(result.status, 0, `${entry.id}: native fixture failed: ${result.stderr || result.stdout}`);
    assert.equal(existsSync(output), true, `${entry.id}: native fixture omitted its result packet`);
    const candidate = decodeRustTerrainGenerationResultV2(await readFile(output), request);
    assert.equal(terrainGenerationChunksByteEqualV2(reference, candidate), true,
      `${entry.id}: Rust generator is not byte-equal to the TypeScript v18 oracle`);

    const markerRows = decodeTerrainGenerationMarkerTableV2(reference.markerTable);
    const markerText = JSON.stringify(markerRows);
    if (entry.markerToken) assert.match(markerText, new RegExp(entry.markerToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `${entry.id}: the named semantic marker family disappeared`);
    if (entry.absentMarkerToken) assert.doesNotMatch(markerText,
      new RegExp(entry.absentMarkerToken.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      `${entry.id}: a disabled semantic marker family was unexpectedly emitted`);
    if (entry.minimumMarkers !== undefined) assert.ok(markerRows.length >= entry.minimumMarkers,
      `${entry.id}: expected at least ${entry.minimumMarkers} markers, found ${markerRows.length}`);
    if (entry.maximumMarkers !== undefined) assert.ok(markerRows.length <= entry.maximumMarkers,
      `${entry.id}: expected at most ${entry.maximumMarkers} markers, found ${markerRows.length}`);
    chunkHashes.push(`${entry.id}\0${reference.chunkHash}\0${candidate.chunkHash}`);
  }

  const corpusHash = hashTerrainGenerationIdentityV2(
    "blockwild-r3-promotion-corpus-v1",
    stableTerrainGenerationJsonV2(manifest),
    ...chunkHashes.sort(),
  );
  assert.match(corpusHash, /^[0-9a-f]{32}$/);
  const certificateProcess = spawnSync(FIXTURE, ["--certificate"], { cwd: ROOT, encoding: "utf8", timeout: 10_000 });
  assert.equal(certificateProcess.status, 0, certificateProcess.stderr);
  const certificate = parseTerrainGenerationParityCertificateV2(new TextEncoder().encode(certificateProcess.stdout.trim()));
  assert.equal(certificate.byteEqual, true);
  assert.equal(certificate.corpusCases, cases.length);
  assert.equal(certificate.corpusCases, TERRAIN_GENERATION_PARITY_MINIMUM_CASES_V2);
  assert.equal(certificate.corpusHash, corpusHash, "the shipped certificate must identify this exact byte-equal corpus");
  console.log(`R3_PROMOTION_CORPUS ${JSON.stringify({ cases: cases.length, corpusHash })}`);
});
