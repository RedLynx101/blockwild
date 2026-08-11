import assert from "node:assert/strict";
import test from "node:test";
import {
  TerrainGenerationPipeline,
  type TerrainGenerationWorkerLike,
} from "../app/game/terrain-generation-pipeline.ts";
import {
  GENERATED_CHUNK_SCHEMA_V2,
  GENERATE_CHUNK_REQUEST_SCHEMA_V2,
  TERRAIN_GENERATION_CELL_COUNT_V2,
  TERRAIN_GENERATION_COLUMN_COUNT_V2,
  TERRAIN_GENERATION_PROTOCOL_V2,
  TERRAIN_GENERATION_SECTION_COUNT_V2,
  createGeneratedChunkV2,
  type GenerateChunkRequestV2,
  type TerrainGenerationWorkerRequestV2,
  type TerrainGenerationWorkerResponseV2,
} from "../app/game/terrain-generation-contract.ts";
import { ChunkWorld } from "../app/game/world.ts";

class FailingWorker {
  static instances: FailingWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;

  constructor() { FailingWorker.instances.push(this); }
  postMessage() {}
  terminate() {}
  ready() {
    this.onmessage?.({ data: {
      type: "terrain-generation-ready-v2",
      protocolVersion: TERRAIN_GENERATION_PROTOCOL_V2,
      requestSchemaVersion: GENERATE_CHUNK_REQUEST_SCHEMA_V2,
      resultSchemaVersion: GENERATED_CHUNK_SCHEMA_V2,
      backend: "typescript-compatibility-oracle",
    } } as MessageEvent);
  }
  fail() { this.onerror?.({} as ErrorEvent); }
}

const withFakeBrowserWorker = (run: () => void) => {
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  const workerDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Worker");
  FailingWorker.instances = [];
  Object.defineProperty(globalThis, "document", { configurable: true, value: {} });
  Object.defineProperty(globalThis, "Worker", { configurable: true, value: FailingWorker });
  try {
    run();
  } finally {
    if (documentDescriptor) Object.defineProperty(globalThis, "document", documentDescriptor);
    else delete (globalThis as { document?: unknown }).document;
    if (workerDescriptor) Object.defineProperty(globalThis, "Worker", workerDescriptor);
    else delete (globalThis as { Worker?: unknown }).Worker;
  }
};

test("a failed generation worker releases its job to the synchronous fallback", () => {
  withFakeBrowserWorker(() => {
    const pipeline = new TerrainGenerationPipeline(1, 0);
    FailingWorker.instances[0].ready();
    let failed = 0;
    assert.equal(pipeline.submit({
      namespace: "test",
      seedText: "seed",
      generationOptions: {},
      key: "0,0",
      cx: 0,
      cz: 0,
      edits: [],
    }, () => assert.fail("failed worker must not complete"), () => { failed += 1; }), true);
    FailingWorker.instances[0].fail();
    assert.equal(failed, 1);
    assert.equal(pipeline.supported, false);
    assert.equal(pipeline.diagnostics().failed, 1);
    pipeline.dispose();
  });
});

class ControlledWorker implements TerrainGenerationWorkerLike {
  onmessage: ((event: MessageEvent<TerrainGenerationWorkerResponseV2>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  requests: GenerateChunkRequestV2[] = [];
  transferCounts: number[] = [];
  terminated = false;

  postMessage(message: TerrainGenerationWorkerRequestV2, transfer: Transferable[] = []) {
    if (message.type !== "generate-chunk-v2") return;
    this.requests.push(structuredClone(message.request, { transfer }));
    this.transferCounts.push(transfer.length);
  }

  terminate() { this.terminated = true; }

  ready() {
    this.respond({
      type: "terrain-generation-ready-v2",
      protocolVersion: TERRAIN_GENERATION_PROTOCOL_V2,
      requestSchemaVersion: GENERATE_CHUNK_REQUEST_SCHEMA_V2,
      resultSchemaVersion: GENERATED_CHUNK_SCHEMA_V2,
      backend: "typescript-compatibility-oracle",
    });
  }

  respond(message: TerrainGenerationWorkerResponseV2) {
    this.onmessage?.({ data: message } as MessageEvent<TerrainGenerationWorkerResponseV2>);
  }

  complete(request = this.requests.at(-1)!) {
    const result = createGeneratedChunkV2(request, {
      key: request.key,
      cx: request.cx,
      cz: request.cz,
      blocks: new Uint16Array(TERRAIN_GENERATION_CELL_COUNT_V2),
      heightmap: new Int16Array(TERRAIN_GENERATION_COLUMN_COUNT_V2),
      biomes: new Uint8Array(TERRAIN_GENERATION_COLUMN_COUNT_V2),
      sectionBlockCounts: new Uint16Array(TERRAIN_GENERATION_SECTION_COUNT_V2),
      skyTops: new Int16Array(TERRAIN_GENERATION_COLUMN_COUNT_V2),
      light: new Uint16Array(TERRAIN_GENERATION_CELL_COUNT_V2),
      lightIndices: [],
      leafIndices: [],
      structureMarkers: [],
    });
    this.respond({ type: "generated-chunk-v2", epoch: request.epoch, taskId: request.taskId, result });
  }

  fail(message = "worker exploded") { this.onerror?.({ message } as ErrorEvent); }
}

const generationRequest = (namespace = "terrain-v5|g18|seed|{}|0,0|0") => ({
  namespace,
  seedText: "seed",
  generationOptions: {},
  key: "0,0",
  cx: 0,
  cz: 0,
  edits: [] as const,
});

test("V2 requests transfer canonical edits and results preserve the exact authority metadata", () => {
  const worker = new ControlledWorker();
  const pipeline = new TerrainGenerationPipeline(1, 0, { workerFactory: () => worker });
  worker.ready();
  let completed = 0;
  const submission = pipeline.submitWithHandle({ ...generationRequest(), edits: [[9, 3], [2, 7]] }, (result) => {
    completed += 1;
    assert.equal(result.epoch, submission!.epoch);
    assert.equal(result.revision, submission!.revision);
    assert.equal(result.chunkHash.length, 32);
  });
  assert.ok(submission);
  assert.deepEqual([...worker.requests[0].edits], [2, 7, 9, 3]);
  assert.deepEqual(worker.transferCounts, [1]);
  worker.complete();
  assert.equal(completed, 1);
  assert.equal(pipeline.diagnostics().completed, 1);
  assert.ok(pipeline.diagnostics().transferBytes > 0);
  pipeline.dispose();
});

test("out-of-order chunk results reject stale task and revision lanes", () => {
  const workers = [new ControlledWorker(), new ControlledWorker()];
  let cursor = 0;
  const pipeline = new TerrainGenerationPipeline(2, 0, { workerFactory: () => workers[cursor++] });
  for (const worker of workers) worker.ready();
  let oldFailed = 0;
  let newCompleted = 0;
  assert.ok(pipeline.submitWithHandle(generationRequest("terrain-v5|g18|seed|{}|0,0|old"), () => assert.fail("old task must be stale"), () => { oldFailed += 1; }));
  assert.ok(pipeline.submitWithHandle(generationRequest("terrain-v5|g18|seed|{}|0,0|new"), () => { newCompleted += 1; }));
  workers[1].complete();
  workers[0].complete();
  assert.equal(newCompleted, 1);
  assert.equal(oldFailed, 1);
  assert.equal(pipeline.diagnostics().stale, 1);
  pipeline.dispose();
});

test("a crashed generation worker restarts and the next V2 task completes", () => {
  const workers: ControlledWorker[] = [];
  const pipeline = new TerrainGenerationPipeline(1, 1, { workerFactory: () => {
    const worker = new ControlledWorker();
    workers.push(worker);
    return worker;
  } });
  workers[0].ready();
  let fallback = 0;
  assert.equal(pipeline.submit(generationRequest(), () => assert.fail("crashed task must not complete"), () => { fallback += 1; }), true);
  workers[0].fail("simulated panic");
  assert.equal(fallback, 1);
  assert.equal(workers.length, 2);
  workers[1].ready();
  let completed = 0;
  assert.equal(pipeline.submit(generationRequest(), () => { completed += 1; }), true);
  workers[1].complete();
  assert.equal(completed, 1);
  assert.equal(pipeline.diagnostics().restarts, 1);
  pipeline.dispose();
});

test("explicit cancellation rejects delivery and releases the worker on acknowledgement", () => {
  const worker = new ControlledWorker();
  const pipeline = new TerrainGenerationPipeline(1, 0, { workerFactory: () => worker });
  worker.ready();
  let failed = 0;
  const submission = pipeline.submitWithHandle(generationRequest(), () => assert.fail("cancelled task must not complete"), () => { failed += 1; });
  assert.ok(submission);
  assert.equal(submission.cancel(), true);
  assert.equal(failed, 1);
  assert.equal(pipeline.availableSlots, 0, "ownership remains with the worker until it acknowledges cancellation");
  worker.respond({ type: "generate-chunk-cancelled-v2", epoch: submission.epoch, taskId: submission.taskId });
  assert.equal(pipeline.availableSlots, 1);
  assert.equal(pipeline.diagnostics().canceled, 1);
  assert.equal(pipeline.diagnostics().stale, 0);
  pipeline.dispose();
});

test("worker terrain entry point is byte-exact before neighbor-sensitive lighting", () => {
  const full = new ChunkWorld();
  const worker = new ChunkWorld();
  full.reset("WORKER-PARITY", undefined, { structures: false });
  worker.reset("WORKER-PARITY", undefined, { structures: false });
  const expected = full.generateChunk(2, -3);
  const actual = worker.generateChunkTerrainOnly(2, -3);
  assert.deepEqual(actual.blocks, expected.blocks);
  assert.deepEqual(actual.heightmap, expected.heightmap);
  assert.deepEqual(actual.biomes, expected.biomes);
  assert.deepEqual(actual.sectionBlockCounts, expected.sectionBlockCounts);
  assert.deepEqual(actual.skyTops, expected.skyTops);
  assert.deepEqual([...actual.lightIndices], [...expected.lightIndices]);
  assert.deepEqual([...actual.leafIndices], [...expected.leafIndices]);
  assert.equal(actual.lightInitialized, false, "lighting remains ordered on the main world after installation");
  full.dispose();
  worker.dispose();
});

test("isolated worker lighting reconciles to the sequential cross-chunk solution", () => {
  const reference = new ChunkWorld();
  const isolatedLeft = new ChunkWorld();
  const isolatedRight = new ChunkWorld();
  const installed = new ChunkWorld();
  for (const world of [reference, isolatedLeft, isolatedRight, installed]) {
    world.reset("WORKER-LIGHT-SEAM", undefined, { structures: false });
  }
  const expectedLeft = reference.generateChunk(0, 0);
  const expectedRight = reference.generateChunk(1, 0);
  const leftLight = isolatedLeft.generateChunk(0, 0).light.slice();
  const rightLight = isolatedRight.generateChunk(1, 0).light.slice();
  const actualLeft = installed.generateChunkTerrainOnly(0, 0);
  const actualRight = installed.generateChunkTerrainOnly(1, 0);
  actualLeft.light.set(leftLight);
  actualRight.light.set(rightLight);
  actualLeft.lightInitialized = true;
  actualRight.lightInitialized = true;
  let slices = 0;
  for (const chunk of [actualLeft, actualRight]) {
    const task = installed.lightEngine.beginChunkBoundaryReconciliation(chunk);
    while (!installed.lightEngine.stepChunkInitialization(task, 2_048)) slices += 1;
  }
  assert.ok(slices > 2, "seam reconciliation must remain resumable instead of becoming a hidden frame spike");
  assert.deepEqual(actualLeft.light, expectedLeft.light);
  assert.deepEqual(actualRight.light, expectedRight.light);
  for (const world of [reference, isolatedLeft, isolatedRight, installed]) world.dispose();
});
