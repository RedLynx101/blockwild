/**
 * Renderer-neutral terrain exchange formats for the R2 migration boundary.
 *
 * V1 deliberately mirrors Blockwild's current 16x16x16 section shape and
 * packed Three.js terrain attributes. It does not make Rust authoritative:
 * both the TypeScript reference mesher and a Rust shadow worker consume this
 * exact contract, and a caller decides which result may be installed.
 */

export const SECTION_SNAPSHOT_SCHEMA_V1 = 1 as const;
export const MESH_PACKET_SCHEMA_V1 = 1 as const;
export const TERRAIN_MESH_PROTOCOL_V1 = 1 as const;
export const TERRAIN_SECTION_SIZE_V1 = 16 as const;
export const TERRAIN_SECTION_HALO_V1 = 1 as const;
export const TERRAIN_SECTION_HALO_SIZE_V1 = TERRAIN_SECTION_SIZE_V1 + TERRAIN_SECTION_HALO_V1 * 2;
export const TERRAIN_SECTION_CORE_CELL_COUNT_V1 = TERRAIN_SECTION_SIZE_V1 ** 3;
export const TERRAIN_SECTION_HALO_CELL_COUNT_V1 = TERRAIN_SECTION_HALO_SIZE_V1 ** 3;
export const TERRAIN_SECTION_HALO_COLUMN_COUNT_V1 = TERRAIN_SECTION_HALO_SIZE_V1 ** 2;

/** The order is the current world.ts render order and therefore wire-stable. */
export const TERRAIN_MESH_LAYERS_V1 = [
  "opaque",
  "cutout",
  "emissive",
  "translucentSolid",
  "water",
  "transparent",
  "glass",
] as const;

export type TerrainMeshLayerV1 = (typeof TERRAIN_MESH_LAYERS_V1)[number];

export const TerrainHiddenFlagV1 = Object.freeze({
  /** Suppress authored geometry, such as a chest represented by an articulated model. */
  Geometry: 1 << 0,
  /** Cell is a provisional/unloaded-border value and must not author a permanent seam. */
  UnknownHalo: 1 << 1,
} as const);

export const TerrainFluidFlagV1 = Object.freeze({
  Present: 1 << 0,
  Source: 1 << 1,
  Falling: 1 << 2,
  Waterlogged: 1 << 3,
} as const);

export type TerrainSectionAddressV1 = Readonly<{
  /** Decimal or authored stable ID. Strings avoid truncating future Rust u64 IDs. */
  universeId: string;
  locationId: string;
  chunkX: number;
  chunkZ: number;
  sectionY: number;
}>;

export type TerrainSectionRevisionV1 = Readonly<{
  /** Monotonic revision of the section's authoritative cells and metadata. */
  section: number;
  /** Monotonic revision of the one-cell neighbor halo used for face decisions. */
  halo: number;
  /** Monotonic revision of propagated packed light consumed by this snapshot. */
  lighting: number;
}>;

export type TerrainSectionSnapshotStreamsV1 = Readonly<{
  /** x + width * (z + depth * y), including one cell of halo on every face. */
  blocks: Uint16Array;
  /** Current packed sky/red/green/blue nibbles, including the halo. */
  light: Uint16Array;
  /** Cardinal 0=N, 1=E, 2=S, 3=W. Non-directional cells remain zero. */
  facing: Uint8Array;
  /** TerrainHiddenFlagV1 bitset for articulated/provisional cells. */
  hidden: Uint8Array;
  /** Simulation-defined fluid level. Zero is dry; flags disambiguate full/source states. */
  fluidLevel: Uint8Array;
  /** TerrainFluidFlagV1 bitset, including halo state used by liquid surfaces. */
  fluidFlags: Uint8Array;
  /** One biome ID per x/z column, including the horizontal halo. */
  biomes: Uint8Array;
}>;

export type SectionSnapshotV1 = Readonly<{
  schemaVersion: typeof SECTION_SNAPSHOT_SCHEMA_V1;
  /** Hash of the block/material registry used to interpret numeric block IDs. */
  contentHash: string;
  address: TerrainSectionAddressV1;
  revision: TerrainSectionRevisionV1;
  dimensions: Readonly<{
    width: typeof TERRAIN_SECTION_SIZE_V1;
    height: typeof TERRAIN_SECTION_SIZE_V1;
    depth: typeof TERRAIN_SECTION_SIZE_V1;
    halo: typeof TERRAIN_SECTION_HALO_V1;
  }>;
  streams: TerrainSectionSnapshotStreamsV1;
  /** Canonical 128-bit hash of all preceding fields and stream bytes. */
  snapshotHash: string;
}>;

export type SectionSnapshotV1Input = Omit<SectionSnapshotV1, "schemaVersion" | "snapshotHash" | "dimensions"> & Readonly<{
  dimensions?: SectionSnapshotV1["dimensions"];
}>;

export type TerrainMeshStreamsV1 = Readonly<{
  /** f32x3 local/world-compatible positions. */
  positions: Float32Array;
  /** snorm8x3 normals. */
  normals: Int8Array;
  /** unorm8x3 colors; world.ts restores its 1.1 authored color headroom. */
  colors: Uint8Array;
  /** unorm8x4 packed sky/red/green/blue light. */
  lights: Uint8Array;
  /** unorm8 scalar emission. */
  emissions: Uint8Array;
  /** unorm8 scalar ambient occlusion. */
  occlusions: Uint8Array;
  /** unorm16x2 atlas UVs. */
  uvs: Uint16Array;
  /** Global vertex indices for all contiguous layer spans. */
  indices: Uint16Array | Uint32Array;
}>;

export type TerrainMeshLayerSpanV1 = Readonly<{
  layer: TerrainMeshLayerV1;
  vertexStart: number;
  vertexCount: number;
  indexStart: number;
  indexCount: number;
}>;

export type TerrainLightingDeltaV1 = Readonly<{
  /** Sorted unique core cell indexes (x + 16 * (z + 16 * y)). */
  changedCellIndices: Uint16Array;
  /** Packed sky/red/green/blue nibbles, one per changed index. */
  packedLight: Uint16Array;
}>;

export type MeshPacketV1 = Readonly<{
  schemaVersion: typeof MESH_PACKET_SCHEMA_V1;
  sourceSnapshotHash: string;
  contentHash: string;
  address: TerrainSectionAddressV1;
  revision: TerrainSectionRevisionV1;
  layers: readonly TerrainMeshLayerSpanV1[];
  streams: TerrainMeshStreamsV1;
  lightingDelta?: TerrainLightingDeltaV1;
  /** Canonical 128-bit hash of the packet metadata and all stream bytes. */
  packetHash: string;
}>;

export type MeshPacketV1Input = Omit<MeshPacketV1, "schemaVersion" | "packetHash">;

export type TerrainBufferPurpose =
  | `snapshot-${keyof TerrainSectionSnapshotStreamsV1}`
  | `mesh-${keyof TerrainMeshStreamsV1}`
  | "mesh-lighting-indices"
  | "mesh-lighting-values";

/** Optional hook for exact-sized ArrayBuffer reuse across worker jobs. */
export interface TerrainBufferPool {
  acquire(byteLength: number, purpose: TerrainBufferPurpose): ArrayBuffer | undefined;
  release(buffer: ArrayBuffer, purpose: TerrainBufferPurpose): void;
}

export class TerrainMeshContractError extends Error {
  readonly name = "TerrainMeshContractError";

  constructor(readonly issues: readonly string[]) {
    super(`Terrain mesh contract rejected: ${issues.join("; ")}`);
  }
}

const HASH_PATTERN = /^[0-9a-f]{32}$/;
const FNV_64_OFFSET = BigInt("14695981039346656037");
const FNV_64_PRIME = BigInt("1099511628211");
const HIGH_LANE_SALT = BigInt("11562461410679940143");
const HIGH_LANE_PRIME = FNV_64_PRIME ^ BigInt("315");
const BYTE_MASK = BigInt("255");

/** Mirrors engine/blockwild-types::CanonicalHasher without importing Wasm. */
class CanonicalTerrainHasher {
  private low = FNV_64_OFFSET;
  private high = FNV_64_OFFSET ^ HIGH_LANE_SALT;

  constructor(domain: string) { this.writeString(domain); }

  private wrap(value: bigint) { return BigInt.asUintN(64, value); }

  private writeRawByte(byte: number) {
    const value = BigInt(byte);
    this.low = this.wrap((this.low ^ value) * FNV_64_PRIME);
    this.high = this.wrap((this.high ^ ((value << BigInt(1)) | BigInt(1))) * HIGH_LANE_PRIME);
  }

  writeU16(value: number) {
    for (let shift = 0; shift < 16; shift += 8) this.writeRawByte((value >>> shift) & 0xff);
  }

  writeU32(value: number) {
    const normalized = value >>> 0;
    for (let shift = 0; shift < 32; shift += 8) this.writeRawByte((normalized >>> shift) & 0xff);
  }

  writeI32(value: number) { this.writeU32(value); }

  writeU64(value: number) {
    let remaining = BigInt(value);
    for (let index = 0; index < 8; index += 1) {
      this.writeRawByte(Number(remaining & BYTE_MASK));
      remaining >>= BigInt(8);
    }
  }

  writeBytes(bytes: Uint8Array) {
    this.writeU64(bytes.byteLength);
    for (const byte of bytes) {
      const value = BigInt(byte);
      this.low = this.wrap((this.low ^ value) * FNV_64_PRIME);
      this.high = this.wrap((this.high ^ (value << BigInt(1))) * HIGH_LANE_PRIME);
    }
  }

  writeString(value: string) { this.writeBytes(new TextEncoder().encode(value)); }

  finish() {
    const bytes = new Uint8Array(16);
    for (const [offset, lane] of [[0, this.low], [8, this.high]] as const) {
      let remaining = lane;
      for (let index = 0; index < 8; index += 1) {
        bytes[offset + index] = Number(remaining & BYTE_MASK);
        remaining >>= BigInt(8);
      }
    }
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
}

function bytesOf(view: ArrayBufferView) {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

function writeAddress(hasher: CanonicalTerrainHasher, address: TerrainSectionAddressV1) {
  hasher.writeString(address.universeId);
  hasher.writeString(address.locationId);
  hasher.writeI32(address.chunkX);
  hasher.writeI32(address.chunkZ);
  hasher.writeI32(address.sectionY);
}

function writeRevision(hasher: CanonicalTerrainHasher, revision: TerrainSectionRevisionV1) {
  hasher.writeU32(revision.section);
  hasher.writeU32(revision.halo);
  hasher.writeU32(revision.lighting);
}

export function hashSectionSnapshotV1(snapshot: Omit<SectionSnapshotV1, "snapshotHash">) {
  const hasher = new CanonicalTerrainHasher("blockwild-section-snapshot-v1");
  hasher.writeU16(snapshot.schemaVersion);
  hasher.writeString(snapshot.contentHash);
  writeAddress(hasher, snapshot.address);
  writeRevision(hasher, snapshot.revision);
  hasher.writeU16(snapshot.dimensions.width);
  hasher.writeU16(snapshot.dimensions.height);
  hasher.writeU16(snapshot.dimensions.depth);
  hasher.writeU16(snapshot.dimensions.halo);
  for (const stream of [
    snapshot.streams.blocks,
    snapshot.streams.light,
    snapshot.streams.facing,
    snapshot.streams.hidden,
    snapshot.streams.fluidLevel,
    snapshot.streams.fluidFlags,
    snapshot.streams.biomes,
  ]) hasher.writeBytes(bytesOf(stream));
  return hasher.finish();
}

export function createSectionSnapshotV1(input: SectionSnapshotV1Input): SectionSnapshotV1 {
  const withoutHash: Omit<SectionSnapshotV1, "snapshotHash"> = {
    ...input,
    schemaVersion: SECTION_SNAPSHOT_SCHEMA_V1,
    dimensions: input.dimensions ?? {
      width: TERRAIN_SECTION_SIZE_V1,
      height: TERRAIN_SECTION_SIZE_V1,
      depth: TERRAIN_SECTION_SIZE_V1,
      halo: TERRAIN_SECTION_HALO_V1,
    },
  };
  const snapshot = { ...withoutHash, snapshotHash: hashSectionSnapshotV1(withoutHash) } as const;
  assertSectionSnapshotV1(snapshot);
  return snapshot;
}

export function hashMeshPacketV1(packet: Omit<MeshPacketV1, "packetHash">) {
  const hasher = new CanonicalTerrainHasher("blockwild-mesh-packet-v1");
  hasher.writeU16(packet.schemaVersion);
  hasher.writeString(packet.sourceSnapshotHash);
  hasher.writeString(packet.contentHash);
  writeAddress(hasher, packet.address);
  writeRevision(hasher, packet.revision);
  hasher.writeU32(packet.layers.length);
  for (const span of packet.layers) {
    hasher.writeU16(TERRAIN_MESH_LAYERS_V1.indexOf(span.layer));
    hasher.writeU32(span.vertexStart);
    hasher.writeU32(span.vertexCount);
    hasher.writeU32(span.indexStart);
    hasher.writeU32(span.indexCount);
  }
  for (const stream of [
    packet.streams.positions,
    packet.streams.normals,
    packet.streams.colors,
    packet.streams.lights,
    packet.streams.emissions,
    packet.streams.occlusions,
    packet.streams.uvs,
    packet.streams.indices,
  ]) hasher.writeBytes(bytesOf(stream));
  hasher.writeU16(packet.lightingDelta ? 1 : 0);
  if (packet.lightingDelta) {
    hasher.writeBytes(bytesOf(packet.lightingDelta.changedCellIndices));
    hasher.writeBytes(bytesOf(packet.lightingDelta.packedLight));
  }
  return hasher.finish();
}

export function createMeshPacketV1(input: MeshPacketV1Input): MeshPacketV1 {
  const withoutHash: Omit<MeshPacketV1, "packetHash"> = {
    ...input,
    schemaVersion: MESH_PACKET_SCHEMA_V1,
  };
  const packet = { ...withoutHash, packetHash: hashMeshPacketV1(withoutHash) } as const;
  assertMeshPacketV1(packet);
  return packet;
}

function recordIssue(issues: string[], condition: boolean, message: string) {
  if (!condition) issues.push(message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function validSafeInteger(value: unknown, minimum = Number.MIN_SAFE_INTEGER, maximum = Number.MAX_SAFE_INTEGER) {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum;
}

function validHash(value: unknown) { return typeof value === "string" && HASH_PATTERN.test(value); }

function validateAddress(value: unknown, issues: string[], path: string): value is TerrainSectionAddressV1 {
  if (!isRecord(value)) { issues.push(`${path} must be an object`); return false; }
  recordIssue(issues, typeof value.universeId === "string" && value.universeId.length > 0 && value.universeId.length <= 128, `${path}.universeId must be a non-empty bounded string`);
  recordIssue(issues, typeof value.locationId === "string" && value.locationId.length > 0 && value.locationId.length <= 128, `${path}.locationId must be a non-empty bounded string`);
  for (const key of ["chunkX", "chunkZ", "sectionY"] as const) {
    recordIssue(issues, validSafeInteger(value[key], -0x80000000, 0x7fffffff), `${path}.${key} must be an i32`);
  }
  return true;
}

function validateRevision(value: unknown, issues: string[], path: string): value is TerrainSectionRevisionV1 {
  if (!isRecord(value)) { issues.push(`${path} must be an object`); return false; }
  for (const key of ["section", "halo", "lighting"] as const) {
    recordIssue(issues, validSafeInteger(value[key], 0, 0xffffffff), `${path}.${key} must be a u32`);
  }
  return true;
}

function expectTypedArray<T extends ArrayBufferView>(
  value: unknown,
  constructor: { new(length: number): T; readonly name: string },
  length: number,
  issues: string[],
  path: string,
): value is T {
  const validType = value instanceof constructor;
  recordIssue(issues, validType, `${path} must be ${constructor.name}`);
  if (validType) recordIssue(issues, (value as unknown as { length: number }).length === length, `${path} must contain ${length} elements`);
  return validType;
}

export function sectionSnapshotV1Issues(value: unknown, verifyHash = true) {
  const issues: string[] = [];
  if (!isRecord(value)) return ["snapshot must be an object"];
  recordIssue(issues, value.schemaVersion === SECTION_SNAPSHOT_SCHEMA_V1, `schemaVersion must be ${SECTION_SNAPSHOT_SCHEMA_V1}`);
  recordIssue(issues, validHash(value.contentHash), "contentHash must be 32 lowercase hexadecimal characters");
  validateAddress(value.address, issues, "address");
  validateRevision(value.revision, issues, "revision");
  if (!isRecord(value.dimensions)) issues.push("dimensions must be an object");
  else {
    recordIssue(issues, value.dimensions.width === TERRAIN_SECTION_SIZE_V1, `dimensions.width must be ${TERRAIN_SECTION_SIZE_V1}`);
    recordIssue(issues, value.dimensions.height === TERRAIN_SECTION_SIZE_V1, `dimensions.height must be ${TERRAIN_SECTION_SIZE_V1}`);
    recordIssue(issues, value.dimensions.depth === TERRAIN_SECTION_SIZE_V1, `dimensions.depth must be ${TERRAIN_SECTION_SIZE_V1}`);
    recordIssue(issues, value.dimensions.halo === TERRAIN_SECTION_HALO_V1, `dimensions.halo must be ${TERRAIN_SECTION_HALO_V1}`);
  }
  if (!isRecord(value.streams)) issues.push("streams must be an object");
  else {
    expectTypedArray(value.streams.blocks, Uint16Array, TERRAIN_SECTION_HALO_CELL_COUNT_V1, issues, "streams.blocks");
    expectTypedArray(value.streams.light, Uint16Array, TERRAIN_SECTION_HALO_CELL_COUNT_V1, issues, "streams.light");
    const facing = expectTypedArray(value.streams.facing, Uint8Array, TERRAIN_SECTION_HALO_CELL_COUNT_V1, issues, "streams.facing");
    expectTypedArray(value.streams.hidden, Uint8Array, TERRAIN_SECTION_HALO_CELL_COUNT_V1, issues, "streams.hidden");
    expectTypedArray(value.streams.fluidLevel, Uint8Array, TERRAIN_SECTION_HALO_CELL_COUNT_V1, issues, "streams.fluidLevel");
    expectTypedArray(value.streams.fluidFlags, Uint8Array, TERRAIN_SECTION_HALO_CELL_COUNT_V1, issues, "streams.fluidFlags");
    expectTypedArray(value.streams.biomes, Uint8Array, TERRAIN_SECTION_HALO_COLUMN_COUNT_V1, issues, "streams.biomes");
    if (facing && !(value.streams.facing as Uint8Array).every((entry) => entry <= 3)) issues.push("streams.facing contains a value outside 0..3");
  }
  recordIssue(issues, validHash(value.snapshotHash), "snapshotHash must be 32 lowercase hexadecimal characters");
  if (!issues.length && verifyHash) {
    const snapshot = value as unknown as SectionSnapshotV1;
    recordIssue(issues, hashSectionSnapshotV1(snapshot) === snapshot.snapshotHash, "snapshotHash does not match snapshot content");
  }
  return issues;
}

export function assertSectionSnapshotV1(value: unknown, verifyHash = true): asserts value is SectionSnapshotV1 {
  const issues = sectionSnapshotV1Issues(value, verifyHash);
  if (issues.length) throw new TerrainMeshContractError(issues);
}

function expectMeshStreams(value: unknown, issues: string[]) {
  if (!isRecord(value)) { issues.push("streams must be an object"); return 0; }
  const positions = value.positions instanceof Float32Array ? value.positions : null;
  recordIssue(issues, Boolean(positions), "streams.positions must be Float32Array");
  if (positions) {
    recordIssue(issues, positions.length % 3 === 0, "streams.positions length must be divisible by 3");
    recordIssue(issues, positions.every(Number.isFinite), "streams.positions must contain only finite values");
  }
  const vertexCount = positions && positions.length % 3 === 0 ? positions.length / 3 : 0;
  expectTypedArray(value.normals, Int8Array, vertexCount * 3, issues, "streams.normals");
  expectTypedArray(value.colors, Uint8Array, vertexCount * 3, issues, "streams.colors");
  expectTypedArray(value.lights, Uint8Array, vertexCount * 4, issues, "streams.lights");
  expectTypedArray(value.emissions, Uint8Array, vertexCount, issues, "streams.emissions");
  expectTypedArray(value.occlusions, Uint8Array, vertexCount, issues, "streams.occlusions");
  expectTypedArray(value.uvs, Uint16Array, vertexCount * 2, issues, "streams.uvs");
  recordIssue(issues, value.indices instanceof Uint16Array || value.indices instanceof Uint32Array, "streams.indices must be Uint16Array or Uint32Array");
  if (value.indices instanceof Uint16Array && vertexCount > 0xffff) issues.push("streams.indices must use Uint32Array when vertex count exceeds 65535");
  return vertexCount;
}

export function meshPacketV1Issues(value: unknown, verifyHash = true) {
  const issues: string[] = [];
  if (!isRecord(value)) return ["packet must be an object"];
  recordIssue(issues, value.schemaVersion === MESH_PACKET_SCHEMA_V1, `schemaVersion must be ${MESH_PACKET_SCHEMA_V1}`);
  recordIssue(issues, validHash(value.sourceSnapshotHash), "sourceSnapshotHash must be 32 lowercase hexadecimal characters");
  recordIssue(issues, validHash(value.contentHash), "contentHash must be 32 lowercase hexadecimal characters");
  validateAddress(value.address, issues, "address");
  validateRevision(value.revision, issues, "revision");
  const vertexCount = expectMeshStreams(value.streams, issues);
  const streams = isRecord(value.streams) ? value.streams : {};
  const indices = streams.indices instanceof Uint16Array || streams.indices instanceof Uint32Array ? streams.indices : null;
  if (!Array.isArray(value.layers)) issues.push("layers must be an array");
  else {
    let nextVertex = 0;
    let nextIndex = 0;
    let lastLayerOrder = -1;
    for (let index = 0; index < value.layers.length; index += 1) {
      const span = value.layers[index];
      const path = `layers[${index}]`;
      if (!isRecord(span)) { issues.push(`${path} must be an object`); continue; }
      const layerOrder = TERRAIN_MESH_LAYERS_V1.indexOf(span.layer as TerrainMeshLayerV1);
      recordIssue(issues, layerOrder >= 0, `${path}.layer is unknown`);
      recordIssue(issues, layerOrder > lastLayerOrder, `${path}.layer must follow canonical order without duplicates`);
      lastLayerOrder = Math.max(lastLayerOrder, layerOrder);
      for (const key of ["vertexStart", "vertexCount", "indexStart", "indexCount"] as const) {
        recordIssue(issues, validSafeInteger(span[key], 0, 0xffffffff), `${path}.${key} must be a u32`);
      }
      if (![span.vertexStart, span.vertexCount, span.indexStart, span.indexCount].every((entry) => validSafeInteger(entry, 0, 0xffffffff))) continue;
      const vertexStart = span.vertexStart as number;
      const verticesInSpan = span.vertexCount as number;
      const indexStart = span.indexStart as number;
      const indicesInSpan = span.indexCount as number;
      recordIssue(issues, vertexStart === nextVertex, `${path}.vertexStart must be contiguous (${nextVertex})`);
      recordIssue(issues, indexStart === nextIndex, `${path}.indexStart must be contiguous (${nextIndex})`);
      recordIssue(issues, verticesInSpan > 0, `${path}.vertexCount must be positive; omit empty layers`);
      recordIssue(issues, indicesInSpan > 0 && indicesInSpan % 3 === 0, `${path}.indexCount must be a positive triangle count`);
      if (indices && indexStart + indicesInSpan <= indices.length) {
        const endVertex = vertexStart + verticesInSpan;
        for (let cursor = indexStart; cursor < indexStart + indicesInSpan; cursor += 1) {
          const referenced = indices[cursor];
          if (referenced < vertexStart || referenced >= endVertex) {
            issues.push(`${path} index ${cursor} references vertex ${referenced} outside its layer span`);
            break;
          }
        }
      }
      nextVertex = vertexStart + verticesInSpan;
      nextIndex = indexStart + indicesInSpan;
    }
    recordIssue(issues, nextVertex === vertexCount, `layers must cover all ${vertexCount} vertices`);
    if (indices) recordIssue(issues, nextIndex === indices.length, `layers must cover all ${indices.length} indices`);
    if (!value.layers.length) {
      recordIssue(issues, vertexCount === 0, "an empty layer list requires empty vertex streams");
      if (indices) recordIssue(issues, indices.length === 0, "an empty layer list requires empty indices");
    }
  }
  if (value.lightingDelta !== undefined) {
    if (!isRecord(value.lightingDelta)) issues.push("lightingDelta must be an object");
    else {
      const changed = value.lightingDelta.changedCellIndices;
      const packed = value.lightingDelta.packedLight;
      recordIssue(issues, changed instanceof Uint16Array, "lightingDelta.changedCellIndices must be Uint16Array");
      recordIssue(issues, packed instanceof Uint16Array, "lightingDelta.packedLight must be Uint16Array");
      if (changed instanceof Uint16Array && packed instanceof Uint16Array) {
        recordIssue(issues, changed.length === packed.length, "lightingDelta streams must have equal lengths");
        let previous = -1;
        for (const cell of changed) {
          if (cell >= TERRAIN_SECTION_CORE_CELL_COUNT_V1 || cell <= previous) {
            issues.push("lightingDelta.changedCellIndices must be sorted, unique, and inside the core section");
            break;
          }
          previous = cell;
        }
      }
    }
  }
  recordIssue(issues, validHash(value.packetHash), "packetHash must be 32 lowercase hexadecimal characters");
  if (!issues.length && verifyHash) {
    const packet = value as unknown as MeshPacketV1;
    recordIssue(issues, hashMeshPacketV1(packet) === packet.packetHash, "packetHash does not match packet content");
  }
  return issues;
}

export function assertMeshPacketV1(value: unknown, verifyHash = true): asserts value is MeshPacketV1 {
  const issues = meshPacketV1Issues(value, verifyHash);
  if (issues.length) throw new TerrainMeshContractError(issues);
}

export function terrainSectionAddressKeyV1(address: TerrainSectionAddressV1) {
  return `${address.universeId}/${address.locationId}/${address.chunkX}/${address.chunkZ}/${address.sectionY}`;
}

export function terrainSectionRevisionKeyV1(revision: TerrainSectionRevisionV1) {
  return `${revision.section}:${revision.halo}:${revision.lighting}`;
}

export function meshPacketMatchesSnapshotV1(packet: MeshPacketV1, snapshot: SectionSnapshotV1) {
  return packet.sourceSnapshotHash === snapshot.snapshotHash
    && packet.contentHash === snapshot.contentHash
    && terrainSectionAddressKeyV1(packet.address) === terrainSectionAddressKeyV1(snapshot.address)
    && terrainSectionRevisionKeyV1(packet.revision) === terrainSectionRevisionKeyV1(snapshot.revision);
}

export function assertMeshPacketMatchesSnapshotV1(packet: MeshPacketV1, snapshot: SectionSnapshotV1) {
  assertMeshPacketV1(packet);
  assertSectionSnapshotV1(snapshot);
  if (!meshPacketMatchesSnapshotV1(packet, snapshot)) {
    throw new TerrainMeshContractError(["mesh packet source hash, content hash, address, or revision does not match its section snapshot"]);
  }
}

export function haloCellIndexV1(localX: number, localY: number, localZ: number) {
  for (const [axis, value] of [["x", localX], ["y", localY], ["z", localZ]] as const) {
    if (!Number.isInteger(value) || value < -1 || value > TERRAIN_SECTION_SIZE_V1) throw new RangeError(`halo ${axis} must be an integer in -1..${TERRAIN_SECTION_SIZE_V1}`);
  }
  const x = localX + TERRAIN_SECTION_HALO_V1;
  const y = localY + TERRAIN_SECTION_HALO_V1;
  const z = localZ + TERRAIN_SECTION_HALO_V1;
  return x + TERRAIN_SECTION_HALO_SIZE_V1 * (z + TERRAIN_SECTION_HALO_SIZE_V1 * y);
}

export function haloBiomeIndexV1(localX: number, localZ: number) {
  for (const [axis, value] of [["x", localX], ["z", localZ]] as const) {
    if (!Number.isInteger(value) || value < -1 || value > TERRAIN_SECTION_SIZE_V1) throw new RangeError(`halo biome ${axis} must be an integer in -1..${TERRAIN_SECTION_SIZE_V1}`);
  }
  return localX + TERRAIN_SECTION_HALO_V1 + TERRAIN_SECTION_HALO_SIZE_V1 * (localZ + TERRAIN_SECTION_HALO_V1);
}

function uniqueTransferBuffers(views: readonly ArrayBufferView[]) {
  const buffers: ArrayBuffer[] = [];
  const seen = new Set<ArrayBuffer>();
  for (const view of views) {
    if (!(view.buffer instanceof ArrayBuffer)) throw new TerrainMeshContractError(["shared memory is not transferable in the V1 compatibility contract"]);
    const buffer = view.buffer;
    if (!seen.has(buffer)) { seen.add(buffer); buffers.push(buffer); }
  }
  return buffers;
}

/** Exactly the unique buffers reachable from SectionSnapshotV1 typed streams. */
export function sectionSnapshotTransferListV1(snapshot: SectionSnapshotV1) {
  assertSectionSnapshotV1(snapshot);
  return uniqueTransferBuffers([
    snapshot.streams.blocks,
    snapshot.streams.light,
    snapshot.streams.facing,
    snapshot.streams.hidden,
    snapshot.streams.fluidLevel,
    snapshot.streams.fluidFlags,
    snapshot.streams.biomes,
  ]);
}

/** Exactly the unique buffers reachable from MeshPacketV1 typed streams. */
export function meshPacketTransferListV1(packet: MeshPacketV1) {
  assertMeshPacketV1(packet);
  return uniqueTransferBuffers([
    packet.streams.positions,
    packet.streams.normals,
    packet.streams.colors,
    packet.streams.lights,
    packet.streams.emissions,
    packet.streams.occlusions,
    packet.streams.uvs,
    packet.streams.indices,
    ...(packet.lightingDelta ? [packet.lightingDelta.changedCellIndices, packet.lightingDelta.packedLight] : []),
  ]);
}

function cloneView<T extends ArrayBufferView>(
  source: T,
  constructor: { new(buffer: ArrayBuffer): T },
  pool: TerrainBufferPool | undefined,
  purpose: TerrainBufferPurpose,
) {
  const buffer = pool?.acquire(source.byteLength, purpose) ?? new ArrayBuffer(source.byteLength);
  if (!(buffer instanceof ArrayBuffer) || buffer.byteLength !== source.byteLength) {
    throw new TerrainMeshContractError([`buffer pool must return an exact ${source.byteLength}-byte ArrayBuffer for ${purpose}`]);
  }
  new Uint8Array(buffer).set(bytesOf(source));
  return new constructor(buffer);
}

export function cloneSectionSnapshotV1(snapshot: SectionSnapshotV1, pool?: TerrainBufferPool): SectionSnapshotV1 {
  assertSectionSnapshotV1(snapshot);
  return {
    ...snapshot,
    streams: {
      blocks: cloneView(snapshot.streams.blocks, Uint16Array, pool, "snapshot-blocks"),
      light: cloneView(snapshot.streams.light, Uint16Array, pool, "snapshot-light"),
      facing: cloneView(snapshot.streams.facing, Uint8Array, pool, "snapshot-facing"),
      hidden: cloneView(snapshot.streams.hidden, Uint8Array, pool, "snapshot-hidden"),
      fluidLevel: cloneView(snapshot.streams.fluidLevel, Uint8Array, pool, "snapshot-fluidLevel"),
      fluidFlags: cloneView(snapshot.streams.fluidFlags, Uint8Array, pool, "snapshot-fluidFlags"),
      biomes: cloneView(snapshot.streams.biomes, Uint8Array, pool, "snapshot-biomes"),
    },
  };
}

function releaseViews(
  entries: readonly (readonly [ArrayBufferView, TerrainBufferPurpose])[],
  pool: TerrainBufferPool,
) {
  const seen = new Set<ArrayBuffer>();
  for (const [view, purpose] of entries) {
    if (!(view.buffer instanceof ArrayBuffer) || seen.has(view.buffer) || view.buffer.byteLength === 0) continue;
    seen.add(view.buffer);
    pool.release(view.buffer, purpose);
  }
}

export function releaseSectionSnapshotBuffersV1(snapshot: SectionSnapshotV1, pool: TerrainBufferPool) {
  releaseViews([
    [snapshot.streams.blocks, "snapshot-blocks"],
    [snapshot.streams.light, "snapshot-light"],
    [snapshot.streams.facing, "snapshot-facing"],
    [snapshot.streams.hidden, "snapshot-hidden"],
    [snapshot.streams.fluidLevel, "snapshot-fluidLevel"],
    [snapshot.streams.fluidFlags, "snapshot-fluidFlags"],
    [snapshot.streams.biomes, "snapshot-biomes"],
  ], pool);
}

export function releaseMeshPacketBuffersV1(packet: MeshPacketV1, pool: TerrainBufferPool) {
  releaseViews([
    [packet.streams.positions, "mesh-positions"],
    [packet.streams.normals, "mesh-normals"],
    [packet.streams.colors, "mesh-colors"],
    [packet.streams.lights, "mesh-lights"],
    [packet.streams.emissions, "mesh-emissions"],
    [packet.streams.occlusions, "mesh-occlusions"],
    [packet.streams.uvs, "mesh-uvs"],
    [packet.streams.indices, "mesh-indices"],
    ...(packet.lightingDelta ? [
      [packet.lightingDelta.changedCellIndices, "mesh-lighting-indices"],
      [packet.lightingDelta.packedLight, "mesh-lighting-values"],
    ] as const : []),
  ], pool);
}
