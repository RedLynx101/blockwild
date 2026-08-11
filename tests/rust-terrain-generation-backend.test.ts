import assert from "node:assert/strict";
import test from "node:test";
import {
  LEGACY_TERRAIN_CONTENT_HASH_V2,
  TERRAIN_GENERATION_CELL_COUNT_V2,
  TERRAIN_GENERATION_COLUMN_COUNT_V2,
  TERRAIN_GENERATION_SECTION_COUNT_V2,
  createGenerateChunkRequestV2,
  legacyTerrainGeneratorHashV2,
  type GeneratedChunkV2Payload,
} from "../app/game/terrain-generation-contract.ts";
import {
  InjectedTerrainGenerationBackendV2,
  TerrainGenerationBackendError,
} from "../app/game/rust-terrain-generation-backend.ts";

function request(taskId: number, revision = taskId) {
  return createGenerateChunkRequestV2({
    epoch: 3,
    taskId,
    revision,
    namespace: `terrain-v5|g18|backend|{}|-2,3|${revision}`,
    contentHash: LEGACY_TERRAIN_CONTENT_HASH_V2,
    generatorHash: legacyTerrainGeneratorHashV2("g18"),
    seedText: "backend",
    generationOptions: {},
    key: "-2,3",
    cx: -2,
    cz: 3,
    edits: [],
  });
}

function payload(source = request(1)): GeneratedChunkV2Payload {
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
    lightIndices: [],
    leafIndices: [],
    structureMarkers: [],
  };
}

type Deferred = Readonly<{
  promise: Promise<GeneratedChunkV2Payload>;
  resolve: (value: GeneratedChunkV2Payload) => void;
}>;

function deferred(): Deferred {
  let resolve!: (value: GeneratedChunkV2Payload) => void;
  return { promise: new Promise((done) => { resolve = done; }), resolve };
}

test("the injected backend creates and validates a complete renderer-free result", async () => {
  const backend = new InjectedTerrainGenerationBackendV2((source) => payload(source));
  const source = request(1);
  const result = await backend.generate(source);
  assert.equal(result.status, "ready");
  if (result.status === "ready") {
    assert.equal(result.chunk.requestHash, source.requestHash);
    assert.equal(result.chunk.blocks.byteLength, TERRAIN_GENERATION_CELL_COUNT_V2 * Uint16Array.BYTES_PER_ELEMENT);
  }
  assert.equal(backend.diagnostics().completed, 1);
  backend.dispose();
});

test("epoch, revision and superseded-task checks reject stale asynchronous output", async () => {
  const jobs = new Map<number, Deferred>();
  const backend = new InjectedTerrainGenerationBackendV2((source) => {
    const job = deferred();
    jobs.set(source.taskId, job);
    return job.promise;
  });
  let epoch = 3;
  let revision = 1;
  const oldRequest = request(1, 1);
  const superseded = backend.generate(oldRequest, { currentEpoch: () => epoch, currentRevision: () => revision });
  const newRequest = request(2, 2);
  revision = 2;
  const current = backend.generate(newRequest, { currentEpoch: () => epoch, currentRevision: () => revision });
  jobs.get(2)!.resolve(payload(newRequest));
  jobs.get(1)!.resolve(payload(oldRequest));
  assert.equal((await current).status, "ready");
  const old = await superseded;
  assert.equal(old.status, "stale");
  if (old.status === "stale") assert.equal(old.reason, "revision-changed");

  const epochRequest = request(3, 3);
  revision = 3;
  const staleEpoch = backend.generate(epochRequest, { currentEpoch: () => epoch, currentRevision: () => revision });
  epoch = 4;
  jobs.get(3)!.resolve(payload(epochRequest));
  const epochResult = await staleEpoch;
  assert.equal(epochResult.status, "stale");
  if (epochResult.status === "stale") assert.equal(epochResult.reason, "epoch-changed");
  backend.dispose();
});

test("cancellation and disposal fail closed", async () => {
  const backend = new InjectedTerrainGenerationBackendV2((source) => payload(source));
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(backend.generate(request(1), { signal: controller.signal }), (error: unknown) => (
    error instanceof TerrainGenerationBackendError && error.code === "aborted"
  ));
  backend.dispose();
  await assert.rejects(backend.generate(request(2)), (error: unknown) => (
    error instanceof TerrainGenerationBackendError && error.code === "backend-disposed"
  ));
});
