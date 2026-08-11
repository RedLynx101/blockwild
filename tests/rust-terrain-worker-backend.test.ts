import assert from "node:assert/strict";
import test from "node:test";
import {
  TERRAIN_MESH_PROTOCOL_V1,
  TERRAIN_SECTION_HALO_CELL_COUNT_V1,
  TERRAIN_SECTION_HALO_COLUMN_COUNT_V1,
  createMeshPacketV1,
  createSectionSnapshotV1,
  sectionSnapshotTransferListV1,
  type MeshPacketV1,
  type SectionSnapshotV1,
  type TerrainBufferPool,
} from "../app/game/terrain-mesh-contract.ts";
import { TypeScriptTerrainMesherBackend } from "../app/game/typescript-terrain-mesher.ts";
import {
  RustTerrainMesherBackend,
  type TerrainMesherWorkerLike,
  type TerrainMesherWorkerRequestV1,
  type TerrainMesherWorkerResponseV1,
} from "../app/game/rust-terrain-mesher.ts";

const HASH = "0123456789abcdef0123456789abcdef";

function snapshot(revision: number): SectionSnapshotV1 {
  return createSectionSnapshotV1({
    contentHash: HASH,
    address: { universeId: "1", locationId: "overworld", chunkX: -5, chunkZ: 9, sectionY: 2 },
    revision: { section: revision, halo: revision + 10, lighting: revision + 20 },
    streams: {
      blocks: new Uint16Array(TERRAIN_SECTION_HALO_CELL_COUNT_V1).fill(revision),
      light: new Uint16Array(TERRAIN_SECTION_HALO_CELL_COUNT_V1),
      facing: new Uint8Array(TERRAIN_SECTION_HALO_CELL_COUNT_V1),
      hidden: new Uint8Array(TERRAIN_SECTION_HALO_CELL_COUNT_V1),
      fluidLevel: new Uint8Array(TERRAIN_SECTION_HALO_CELL_COUNT_V1),
      fluidFlags: new Uint8Array(TERRAIN_SECTION_HALO_CELL_COUNT_V1),
      biomes: new Uint8Array(TERRAIN_SECTION_HALO_COLUMN_COUNT_V1),
    },
  });
}

function packet(source: SectionSnapshotV1): MeshPacketV1 {
  return createMeshPacketV1({
    sourceSnapshotHash: source.snapshotHash,
    contentHash: source.contentHash,
    address: source.address,
    revision: source.revision,
    layers: [],
    streams: {
      positions: new Float32Array(), normals: new Int8Array(), colors: new Uint8Array(), lights: new Uint8Array(),
      emissions: new Uint8Array(), occlusions: new Uint8Array(), uvs: new Uint16Array(), indices: new Uint16Array(),
    },
  });
}

type WorkerBehavior = (worker: FakeWorker, message: TerrainMesherWorkerRequestV1) => void;

class FakeWorker implements TerrainMesherWorkerLike {
  onmessage: ((event: MessageEvent<TerrainMesherWorkerResponseV1>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  terminated = false;
  sent: TerrainMesherWorkerRequestV1[] = [];
  transferCounts: number[] = [];

  constructor(private readonly behavior: WorkerBehavior) {}

  postMessage(message: TerrainMesherWorkerRequestV1, transfer: Transferable[] = []) {
    const clone = structuredClone(message, { transfer }) as TerrainMesherWorkerRequestV1;
    this.sent.push(clone);
    this.transferCounts.push(transfer.length);
    this.behavior(this, clone);
  }

  terminate() { this.terminated = true; }

  respond(message: TerrainMesherWorkerResponseV1) {
    queueMicrotask(() => this.onmessage?.({ data: message } as MessageEvent<TerrainMesherWorkerResponseV1>));
  }

  ready() {
    this.respond({
      type: "terrain-mesher-ready-v1",
      protocolVersion: TERRAIN_MESH_PROTOCOL_V1,
      snapshotSchemaVersion: 1,
      meshSchemaVersion: 1,
      backend: "rust-wasm",
    });
  }

  fail(message = "worker exploded") {
    this.onerror?.({ message } as ErrorEvent);
  }
}

function referenceBackend(onMesh?: (source: SectionSnapshotV1) => void) {
  return new TypeScriptTerrainMesherBackend({ mesh: (source) => { onMesh?.(source); return packet(source); } });
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

test("Rust shadow adapter negotiates once and transfers a whole cloned section without detaching authority", async () => {
  const released: string[] = [];
  const pool: TerrainBufferPool = {
    acquire: (bytes) => new ArrayBuffer(bytes),
    release: (_buffer, purpose) => { released.push(purpose); },
  };
  const worker = new FakeWorker((instance, message) => {
    if (message.type === "terrain-mesher-hello-v1") instance.ready();
    if (message.type === "terrain-mesh-section-v1") {
      const returnedInputBuffers = sectionSnapshotTransferListV1(message.snapshot);
      instance.respond({ type: "terrain-mesh-result-v1", requestId: message.requestId, packet: packet(message.snapshot), returnedInputBuffers });
    }
  });
  const fallback = referenceBackend();
  const backend = new RustTerrainMesherBackend({ workerFactory: () => worker, fallback, bufferPool: pool, maximumRestarts: 0 });
  const source = snapshot(1);
  const originalByteLength = source.streams.blocks.byteLength;
  const result = await backend.mesh(source);
  assert.equal(result.status, "ready");
  assert.equal(result.backend, "rust-worker-shadow");
  assert.equal(source.streams.blocks.byteLength, originalByteLength, "authoritative snapshot buffers remain owned by the caller");
  assert.deepEqual(worker.transferCounts, [0, 7]);
  assert.equal(released.length, 7, "all returned worker inputs re-enter the buffer pool");
  assert.ok(backend.diagnostics().transferredToWorkerBytes > 0);
  assert.equal(backend.diagnostics().returnedInputBytes, backend.diagnostics().transferredToWorkerBytes);
  assert.equal(backend.diagnostics().fallback, 0);
  await backend.dispose();
  fallback.dispose();
});

test("out-of-order Rust results can never overwrite a newer section revision", async () => {
  const requests = new Map<number, { worker: FakeWorker; requestId: number; source: SectionSnapshotV1 }>();
  const worker = new FakeWorker((instance, message) => {
    if (message.type === "terrain-mesher-hello-v1") instance.ready();
    if (message.type === "terrain-mesh-section-v1") requests.set(message.snapshot.revision.section, {
      worker: instance,
      requestId: message.requestId,
      source: message.snapshot,
    });
  });
  const fallback = referenceBackend();
  const backend = new RustTerrainMesherBackend({ workerFactory: () => worker, fallback, maximumRestarts: 0 });
  const oldPromise = backend.mesh(snapshot(2));
  await tick();
  const newPromise = backend.mesh(snapshot(3));
  await tick();
  const newer = requests.get(3)!;
  newer.worker.respond({ type: "terrain-mesh-result-v1", requestId: newer.requestId, packet: packet(newer.source) });
  const older = requests.get(2)!;
  older.worker.respond({ type: "terrain-mesh-result-v1", requestId: older.requestId, packet: packet(older.source) });
  assert.equal((await newPromise).status, "ready");
  const stale = await oldPromise;
  assert.equal(stale.status, "stale");
  if (stale.status === "stale") assert.equal(stale.reason, "superseded-request");
  assert.equal(backend.diagnostics().stale, 1);
  await backend.dispose();
  fallback.dispose();
});

test("worker crash releases every pending request to the exact TypeScript fallback", async () => {
  let fallbackCalls = 0;
  const fallback = referenceBackend(() => { fallbackCalls += 1; });
  const worker = new FakeWorker((instance, message) => {
    if (message.type === "terrain-mesher-hello-v1") instance.ready();
  });
  const backend = new RustTerrainMesherBackend({ workerFactory: () => worker, fallback, maximumRestarts: 0 });
  const pending = backend.mesh(snapshot(5));
  await tick();
  worker.fail("simulated panic");
  const result = await pending;
  assert.equal(result.status, "ready");
  assert.equal(result.backend, "typescript-reference");
  if (result.status === "ready") {
    assert.equal(result.fallbackFrom, "rust-worker-shadow");
    assert.equal(result.fallbackReason, "worker-crash");
  }
  assert.equal(fallbackCalls, 1);
  assert.equal(worker.terminated, true);
  assert.equal(backend.diagnostics().pending, 0);
  assert.equal(backend.diagnostics().fallback, 1);
  await backend.dispose();
  fallback.dispose();
});

test("unavailable, incompatible, and invalid Rust paths fall back instead of claiming authority", async () => {
  const source = snapshot(8);
  const fallback = referenceBackend();
  const unavailable = new RustTerrainMesherBackend({ fallback });
  const unavailableResult = await unavailable.mesh(source);
  assert.equal(unavailableResult.status, "ready");
  if (unavailableResult.status === "ready") assert.equal(unavailableResult.fallbackReason, "worker-unavailable");
  await unavailable.dispose();

  const incompatibleWorker = new FakeWorker((instance, message) => {
    if (message.type === "terrain-mesher-hello-v1") instance.respond({
      type: "terrain-mesher-ready-v1",
      protocolVersion: 99,
      snapshotSchemaVersion: 1,
      meshSchemaVersion: 1,
      backend: "rust-wasm",
    });
  });
  const incompatible = new RustTerrainMesherBackend({ workerFactory: () => incompatibleWorker, fallback, maximumRestarts: 0 });
  const incompatibleResult = await incompatible.mesh(source);
  assert.equal(incompatibleResult.status, "ready");
  if (incompatibleResult.status === "ready") assert.equal(incompatibleResult.fallbackReason, "protocol-error");
  assert.equal(incompatibleWorker.terminated, true);
  await incompatible.dispose();

  const invalidWorker = new FakeWorker((instance, message) => {
    if (message.type === "terrain-mesher-hello-v1") instance.ready();
    if (message.type === "terrain-mesh-section-v1") instance.respond({
      type: "terrain-mesh-result-v1",
      requestId: message.requestId,
      packet: { ...packet(message.snapshot), sourceSnapshotHash: "ffffffffffffffffffffffffffffffff" },
    });
  });
  const invalid = new RustTerrainMesherBackend({ workerFactory: () => invalidWorker, fallback, maximumRestarts: 0 });
  const invalidResult = await invalid.mesh(source);
  assert.equal(invalidResult.status, "ready");
  if (invalidResult.status === "ready") assert.equal(invalidResult.fallbackReason, "invalid-packet");
  assert.equal(invalid.diagnostics().failed, 1);
  await invalid.dispose();
  fallback.dispose();
});

