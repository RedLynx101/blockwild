import assert from "node:assert/strict";
import test from "node:test";
import {
  TERRAIN_SECTION_HALO_CELL_COUNT_V1,
  TERRAIN_SECTION_HALO_COLUMN_COUNT_V1,
  createMeshPacketV1,
  createSectionSnapshotV1,
  type MeshPacketV1,
  type SectionSnapshotV1,
} from "../app/game/terrain-mesh-contract.ts";
import { TerrainMesherBackendError } from "../app/game/terrain-mesher-backend.ts";
import { TypeScriptTerrainMesherBackend } from "../app/game/typescript-terrain-mesher.ts";

const HASH = "0123456789abcdef0123456789abcdef";

function snapshot(revision: number): SectionSnapshotV1 {
  return createSectionSnapshotV1({
    contentHash: HASH,
    address: { universeId: "1", locationId: "overworld", chunkX: 2, chunkZ: -3, sectionY: 4 },
    revision: { section: revision, halo: revision, lighting: revision },
    streams: {
      blocks: new Uint16Array(TERRAIN_SECTION_HALO_CELL_COUNT_V1),
      light: new Uint16Array(TERRAIN_SECTION_HALO_CELL_COUNT_V1),
      facing: new Uint8Array(TERRAIN_SECTION_HALO_CELL_COUNT_V1),
      hidden: new Uint8Array(TERRAIN_SECTION_HALO_CELL_COUNT_V1),
      fluidLevel: new Uint8Array(TERRAIN_SECTION_HALO_CELL_COUNT_V1),
      fluidFlags: new Uint8Array(TERRAIN_SECTION_HALO_CELL_COUNT_V1),
      biomes: new Uint8Array(TERRAIN_SECTION_HALO_COLUMN_COUNT_V1),
    },
  });
}

function emptyPacket(source: SectionSnapshotV1): MeshPacketV1 {
  return createMeshPacketV1({
    sourceSnapshotHash: source.snapshotHash,
    contentHash: source.contentHash,
    address: source.address,
    revision: source.revision,
    layers: [],
    streams: {
      positions: new Float32Array(),
      normals: new Int8Array(),
      colors: new Uint8Array(),
      lights: new Uint8Array(),
      emissions: new Uint8Array(),
      occlusions: new Uint8Array(),
      uvs: new Uint16Array(),
      indices: new Uint16Array(),
    },
  });
}

type Deferred = Readonly<{
  promise: Promise<MeshPacketV1>;
  resolve: (packet: MeshPacketV1) => void;
}>;

function deferred(): Deferred {
  let resolve!: (packet: MeshPacketV1) => void;
  return { promise: new Promise<MeshPacketV1>((done) => { resolve = done; }), resolve };
}

test("TypeScript reference backend accepts an injected mesher and validates its packet", async () => {
  let observed: SectionSnapshotV1 | null = null;
  const backend = new TypeScriptTerrainMesherBackend({ mesh: (source) => {
    observed = source;
    return emptyPacket(source);
  } });
  const source = snapshot(1);
  const result = await backend.mesh(source);
  assert.equal(observed, source);
  assert.equal(result.status, "ready");
  assert.equal(result.backend, "typescript-reference");
  assert.equal(backend.diagnostics().completed, 1);
  assert.equal(backend.diagnostics().pending, 0);
  backend.dispose();
});

test("a newer section revision makes an older asynchronous result explicitly stale", async () => {
  const jobs = new Map<number, Deferred>();
  const backend = new TypeScriptTerrainMesherBackend({ mesh: (source) => {
    const job = deferred();
    jobs.set(source.revision.section, job);
    return job.promise;
  } });
  const oldSnapshot = snapshot(3);
  const newSnapshot = snapshot(4);
  const oldResult = backend.mesh(oldSnapshot);
  const newResult = backend.mesh(newSnapshot);
  jobs.get(4)!.resolve(emptyPacket(newSnapshot));
  jobs.get(3)!.resolve(emptyPacket(oldSnapshot));
  assert.equal((await newResult).status, "ready");
  const stale = await oldResult;
  assert.equal(stale.status, "stale");
  if (stale.status === "stale") assert.equal(stale.reason, "superseded-request");
  assert.equal(backend.diagnostics().stale, 1);
  backend.dispose();
});

test("the authoritative revision oracle rejects removed or changed sections", async () => {
  const backend = new TypeScriptTerrainMesherBackend({ mesh: emptyPacket });
  const source = snapshot(7);
  const changed = await backend.mesh(source, { currentRevision: () => ({ section: 8, halo: 7, lighting: 7 }) });
  assert.equal(changed.status, "stale");
  if (changed.status === "stale") assert.equal(changed.reason, "authority-revision-changed");
  const removed = await backend.mesh(source, { currentRevision: () => null });
  assert.equal(removed.status, "stale");
  backend.dispose();
});

test("invalid reference packets, aborts, and disposal fail closed", async () => {
  const source = snapshot(1);
  const invalidBackend = new TypeScriptTerrainMesherBackend({ mesh: () => ({
    ...emptyPacket(source),
    sourceSnapshotHash: "ffffffffffffffffffffffffffffffff",
  }) });
  await assert.rejects(invalidBackend.mesh(source), (error: unknown) => (
    error instanceof TerrainMesherBackendError && error.code === "invalid-packet"
  ));
  const controller = new AbortController();
  controller.abort();
  const abortedBackend = new TypeScriptTerrainMesherBackend({ mesh: emptyPacket });
  await assert.rejects(abortedBackend.mesh(source, { signal: controller.signal }), (error: unknown) => (
    error instanceof TerrainMesherBackendError && error.code === "aborted"
  ));
  assert.equal(abortedBackend.diagnostics().aborted, 1);
  abortedBackend.dispose();
  await assert.rejects(abortedBackend.mesh(source), (error: unknown) => (
    error instanceof TerrainMesherBackendError && error.code === "backend-disposed"
  ));
});

