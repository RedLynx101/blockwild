import assert from "node:assert/strict";
import test from "node:test";
import {
  MESH_PACKET_SCHEMA_V1,
  SECTION_SNAPSHOT_SCHEMA_V1,
  TERRAIN_SECTION_CORE_CELL_COUNT_V1,
  TERRAIN_SECTION_HALO_CELL_COUNT_V1,
  TERRAIN_SECTION_HALO_COLUMN_COUNT_V1,
  TerrainMeshContractError,
  assertMeshPacketMatchesSnapshotV1,
  assertMeshPacketV1,
  assertSectionSnapshotV1,
  cloneSectionSnapshotV1,
  createMeshPacketV1,
  createSectionSnapshotV1,
  haloBiomeIndexV1,
  haloCellIndexV1,
  meshPacketTransferListV1,
  meshPacketV1Issues,
  releaseSectionSnapshotBuffersV1,
  sectionSnapshotTransferListV1,
  sectionSnapshotV1Issues,
  type MeshPacketV1,
  type SectionSnapshotV1,
  type TerrainBufferPool,
} from "../app/game/terrain-mesh-contract.ts";

const HASH = "0123456789abcdef0123456789abcdef";

function snapshot(revision = 1): SectionSnapshotV1 {
  const blocks = new Uint16Array(TERRAIN_SECTION_HALO_CELL_COUNT_V1);
  const light = new Uint16Array(TERRAIN_SECTION_HALO_CELL_COUNT_V1);
  const facing = new Uint8Array(TERRAIN_SECTION_HALO_CELL_COUNT_V1);
  const hidden = new Uint8Array(TERRAIN_SECTION_HALO_CELL_COUNT_V1);
  const fluidLevel = new Uint8Array(TERRAIN_SECTION_HALO_CELL_COUNT_V1);
  const fluidFlags = new Uint8Array(TERRAIN_SECTION_HALO_CELL_COUNT_V1);
  const biomes = new Uint8Array(TERRAIN_SECTION_HALO_COLUMN_COUNT_V1);
  blocks[haloCellIndexV1(0, 0, 0)] = 7;
  light[haloCellIndexV1(0, 0, 0)] = 0xf123;
  facing[haloCellIndexV1(0, 0, 0)] = 3;
  hidden[haloCellIndexV1(-1, 0, 0)] = 2;
  fluidLevel[haloCellIndexV1(15, 0, 15)] = 6;
  fluidFlags[haloCellIndexV1(15, 0, 15)] = 5;
  biomes[haloBiomeIndexV1(0, 0)] = 11;
  return createSectionSnapshotV1({
    contentHash: HASH,
    address: { universeId: "1", locationId: "overworld", chunkX: -12, chunkZ: 8, sectionY: 3 },
    revision: { section: revision, halo: revision + 1, lighting: revision + 2 },
    streams: { blocks, light, facing, hidden, fluidLevel, fluidFlags, biomes },
  });
}

function trianglePacket(source: SectionSnapshotV1): MeshPacketV1 {
  return createMeshPacketV1({
    sourceSnapshotHash: source.snapshotHash,
    contentHash: source.contentHash,
    address: source.address,
    revision: source.revision,
    layers: [{ layer: "opaque", vertexStart: 0, vertexCount: 3, indexStart: 0, indexCount: 3 }],
    streams: {
      positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]),
      normals: new Int8Array([0, 0, 127, 0, 0, 127, 0, 0, 127]),
      colors: new Uint8Array(9).fill(255),
      lights: new Uint8Array(12).fill(128),
      emissions: new Uint8Array(3),
      occlusions: new Uint8Array(3).fill(255),
      uvs: new Uint16Array([0, 0, 65535, 0, 0, 65535]),
      indices: new Uint16Array([0, 1, 2]),
    },
    lightingDelta: {
      changedCellIndices: new Uint16Array([0, TERRAIN_SECTION_CORE_CELL_COUNT_V1 - 1]),
      packedLight: new Uint16Array([0x000f, 0xf000]),
    },
  });
}

test("SectionSnapshotV1 fixes the section, halo, metadata, and canonical hash contract", () => {
  const value = snapshot();
  assert.equal(value.schemaVersion, SECTION_SNAPSHOT_SCHEMA_V1);
  assert.equal(value.streams.blocks.length, 18 ** 3);
  assert.equal(value.streams.biomes.length, 18 ** 2);
  assert.equal(haloCellIndexV1(-1, -1, -1), 0);
  assert.equal(haloCellIndexV1(16, 16, 16), 18 ** 3 - 1);
  assert.equal(haloCellIndexV1(0, 0, 0), 1 + 18 * (1 + 18));
  assert.equal(haloBiomeIndexV1(-1, -1), 0);
  assert.equal(haloBiomeIndexV1(16, 16), 18 ** 2 - 1);
  assert.doesNotThrow(() => assertSectionSnapshotV1(value));
  assert.throws(() => haloCellIndexV1(17, 0, 0), RangeError);

  const changed = snapshot();
  changed.streams.fluidFlags[haloCellIndexV1(1, 1, 1)] = 8;
  assert.match(sectionSnapshotV1Issues(changed).join(" "), /snapshotHash/);
  const rehashed = createSectionSnapshotV1({ ...changed, streams: changed.streams });
  assert.notEqual(rehashed.snapshotHash, value.snapshotHash, "fluid metadata participates in the canonical hash");
});

test("snapshot validation rejects malformed schema, dimensions, streams, facings, and hashes", () => {
  const value = snapshot();
  const malformed = {
    ...value,
    schemaVersion: 2,
    contentHash: "not-a-hash",
    dimensions: { ...value.dimensions, halo: 2 },
    streams: {
      ...value.streams,
      blocks: new Uint8Array(TERRAIN_SECTION_HALO_CELL_COUNT_V1),
      facing: new Uint8Array(TERRAIN_SECTION_HALO_CELL_COUNT_V1).fill(7),
    },
  };
  const issues = sectionSnapshotV1Issues(malformed);
  assert.ok(issues.some((issue) => issue.includes("schemaVersion")));
  assert.ok(issues.some((issue) => issue.includes("contentHash")));
  assert.ok(issues.some((issue) => issue.includes("dimensions.halo")));
  assert.ok(issues.some((issue) => issue.includes("streams.blocks")));
  assert.ok(issues.some((issue) => issue.includes("streams.facing")));
  assert.throws(() => assertSectionSnapshotV1(malformed), TerrainMeshContractError);
});

test("snapshot transfer lists are exact and buffer pool hooks preserve ownership", () => {
  const value = snapshot();
  const transfers = sectionSnapshotTransferListV1(value);
  assert.equal(transfers.length, 7);
  assert.deepEqual(transfers.map((buffer) => buffer.byteLength), [
    18 ** 3 * 2,
    18 ** 3 * 2,
    18 ** 3,
    18 ** 3,
    18 ** 3,
    18 ** 3,
    18 ** 2,
  ]);
  const acquired: Array<[number, string]> = [];
  const released: Array<[number, string]> = [];
  const pool: TerrainBufferPool = {
    acquire(byteLength, purpose) { acquired.push([byteLength, purpose]); return new ArrayBuffer(byteLength); },
    release(buffer, purpose) { released.push([buffer.byteLength, purpose]); },
  };
  const clone = cloneSectionSnapshotV1(value, pool);
  assert.deepEqual(clone.streams.blocks, value.streams.blocks);
  assert.notEqual(clone.streams.blocks.buffer, value.streams.blocks.buffer);
  assert.equal(clone.snapshotHash, value.snapshotHash);
  assert.equal(acquired.length, 7);
  releaseSectionSnapshotBuffersV1(clone, pool);
  assert.equal(released.length, 7);
  assert.deepEqual(released.map((entry) => entry[1]), acquired.map((entry) => entry[1]));
});

test("MeshPacketV1 validates packed streams, contiguous ordered layer spans, and light deltas", () => {
  const source = snapshot();
  const packet = trianglePacket(source);
  assert.equal(packet.schemaVersion, MESH_PACKET_SCHEMA_V1);
  assert.doesNotThrow(() => assertMeshPacketV1(packet));
  assert.doesNotThrow(() => assertMeshPacketMatchesSnapshotV1(packet, source));
  assert.equal(meshPacketTransferListV1(packet).length, 10);

  const badSpan = { ...packet, layers: [{ layer: "opaque", vertexStart: 1, vertexCount: 3, indexStart: 0, indexCount: 3 }] };
  assert.ok(meshPacketV1Issues(badSpan, false).some((issue) => issue.includes("vertexStart")));
  const badIndex = { ...packet, streams: { ...packet.streams, indices: new Uint16Array([0, 1, 7]) } };
  assert.ok(meshPacketV1Issues(badIndex, false).some((issue) => issue.includes("outside its layer span")));
  const badLight = {
    ...packet,
    lightingDelta: { changedCellIndices: new Uint16Array([4, 4]), packedLight: new Uint16Array([1, 2]) },
  };
  assert.ok(meshPacketV1Issues(badLight, false).some((issue) => issue.includes("sorted, unique")));
  const nanPosition = { ...packet, streams: { ...packet.streams, positions: new Float32Array([NaN, 0, 0, 1, 0, 0, 0, 1, 0]) } };
  assert.ok(meshPacketV1Issues(nanPosition, false).some((issue) => issue.includes("finite")));
});

test("mesh packet identity binds source hash, address, content, and every revision lane", () => {
  const source = snapshot(4);
  const packet = trianglePacket(source);
  for (const mismatch of [
    snapshot(5),
    createSectionSnapshotV1({ ...source, address: { ...source.address, chunkX: source.address.chunkX + 1 }, streams: source.streams }),
    createSectionSnapshotV1({ ...source, contentHash: "ffffffffffffffffffffffffffffffff", streams: source.streams }),
  ]) {
    assert.throws(() => assertMeshPacketMatchesSnapshotV1(packet, mismatch), TerrainMeshContractError);
  }
});

