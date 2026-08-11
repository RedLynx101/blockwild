import {
  MESH_PACKET_SCHEMA_V1,
  SECTION_SNAPSHOT_SCHEMA_V1,
  TERRAIN_MESH_LAYERS_V1,
  assertMeshPacketV1,
  assertSectionSnapshotV1,
  type MeshPacketV1,
  type SectionSnapshotV1,
  type TerrainMeshLayerSpanV1,
} from "./terrain-mesh-contract";
import type { TerrainMaterialRegistryV1, TerrainMaterialRegistryV2 } from "./terrain-material-registry";

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });
const MAX_WIRE_BYTES_V1 = 64 * 1024 * 1024;

export class RustTerrainWireError extends Error {
  readonly name = "RustTerrainWireError";
}

class Writer {
  private bytes: number[] = [];

  magic(value: string) {
    if (value.length !== 4) throw new RustTerrainWireError("Terrain wire magic must contain four bytes");
    for (let index = 0; index < value.length; index += 1) this.u8(value.charCodeAt(index));
  }

  u8(value: number) { this.bytes.push(value & 0xff); }
  u16(value: number) { this.u8(value); this.u8(value >>> 8); }
  u32(value: number) {
    const normalized = value >>> 0;
    this.u8(normalized);
    this.u8(normalized >>> 8);
    this.u8(normalized >>> 16);
    this.u8(normalized >>> 24);
  }
  i32(value: number) { this.u32(value); }
  f64(value: number) {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value, true);
    this.raw(new Uint8Array(buffer));
  }
  string(value: string) {
    const encoded = textEncoder.encode(value);
    this.u32(encoded.byteLength);
    this.raw(encoded);
  }
  raw(values: ArrayLike<number>) {
    for (let index = 0; index < values.length; index += 1) this.u8(values[index]);
  }
  u8Vector(values: Uint8Array) { this.u32(values.length); this.raw(values); }
  u16Vector(values: Uint16Array) {
    this.u32(values.length);
    for (const value of values) this.u16(value);
  }
  finish() {
    if (this.bytes.length > MAX_WIRE_BYTES_V1) throw new RustTerrainWireError("Terrain wire payload exceeds the V1 byte limit");
    return Uint8Array.from(this.bytes);
  }
}

class Reader {
  private cursor = 0;
  private readonly view: DataView;

  constructor(private readonly bytes: Uint8Array) {
    if (bytes.byteLength > MAX_WIRE_BYTES_V1) throw new RustTerrainWireError("Terrain wire payload exceeds the V1 byte limit");
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  private require(length: number) {
    const end = this.cursor + length;
    if (!Number.isSafeInteger(end) || end > this.bytes.byteLength) throw new RustTerrainWireError("Terrain wire payload is truncated");
    const start = this.cursor;
    this.cursor = end;
    return start;
  }

  magic() {
    const start = this.require(4);
    return String.fromCharCode(...this.bytes.subarray(start, start + 4));
  }
  u8() { return this.view.getUint8(this.require(1)); }
  i8() { return this.view.getInt8(this.require(1)); }
  u16() { return this.view.getUint16(this.require(2), true); }
  u32() { return this.view.getUint32(this.require(4), true); }
  i32() { return this.view.getInt32(this.require(4), true); }
  f32() { return this.view.getFloat32(this.require(4), true); }
  string() {
    const length = this.u32();
    const start = this.require(length);
    try { return textDecoder.decode(this.bytes.subarray(start, start + length)); }
    catch (error) { throw new RustTerrainWireError(`Terrain wire string is not UTF-8: ${error instanceof Error ? error.message : String(error)}`); }
  }
  u8Vector() {
    const length = this.u32();
    const start = this.require(length);
    return this.bytes.slice(start, start + length);
  }
  i8Vector() {
    const values = this.u8Vector();
    return new Int8Array(values.buffer, values.byteOffset, values.byteLength);
  }
  u16Vector() {
    const length = this.u32();
    const values = new Uint16Array(length);
    for (let index = 0; index < length; index += 1) values[index] = this.u16();
    return values;
  }
  u32Vector() {
    const length = this.u32();
    const values = new Uint32Array(length);
    for (let index = 0; index < length; index += 1) values[index] = this.u32();
    return values;
  }
  f32Vector() {
    const length = this.u32();
    const values = new Float32Array(length);
    for (let index = 0; index < length; index += 1) values[index] = this.f32();
    return values;
  }
  finish() {
    if (this.cursor !== this.bytes.byteLength) throw new RustTerrainWireError("Terrain wire payload has trailing bytes");
  }
}

function writeAddress(writer: Writer, snapshot: SectionSnapshotV1) {
  writer.string(snapshot.address.universeId);
  writer.string(snapshot.address.locationId);
  writer.i32(snapshot.address.chunkX);
  writer.i32(snapshot.address.chunkZ);
  writer.i32(snapshot.address.sectionY);
}

function writeRevision(writer: Writer, snapshot: SectionSnapshotV1) {
  writer.u32(snapshot.revision.section);
  writer.u32(snapshot.revision.halo);
  writer.u32(snapshot.revision.lighting);
}

function readAddress(reader: Reader) {
  return {
    universeId: reader.string(),
    locationId: reader.string(),
    chunkX: reader.i32(),
    chunkZ: reader.i32(),
    sectionY: reader.i32(),
  } as const;
}

function readRevision(reader: Reader) {
  return { section: reader.u32(), halo: reader.u32(), lighting: reader.u32() } as const;
}

export function encodeSectionSnapshotWireV1(snapshot: SectionSnapshotV1) {
  assertSectionSnapshotV1(snapshot);
  const writer = new Writer();
  writer.magic("BWS1");
  writer.u16(SECTION_SNAPSHOT_SCHEMA_V1);
  writer.string(snapshot.contentHash);
  writeAddress(writer, snapshot);
  writeRevision(writer, snapshot);
  writer.u16(snapshot.dimensions.width);
  writer.u16(snapshot.dimensions.height);
  writer.u16(snapshot.dimensions.depth);
  writer.u16(snapshot.dimensions.halo);
  writer.u16Vector(snapshot.streams.blocks);
  writer.u16Vector(snapshot.streams.light);
  writer.u8Vector(snapshot.streams.facing);
  writer.u8Vector(snapshot.streams.hidden);
  writer.u8Vector(snapshot.streams.fluidLevel);
  writer.u8Vector(snapshot.streams.fluidFlags);
  writer.u8Vector(snapshot.streams.biomes);
  writer.string(snapshot.snapshotHash);
  return writer.finish();
}

export function encodeTerrainMaterialRegistryWireV1(registry: TerrainMaterialRegistryV1) {
  const writer = new Writer();
  writer.magic("BWR1");
  writer.string(registry.contentHash);
  writer.u32(registry.blocks.length);
  for (const material of registry.blocks) {
    if (material === null) writer.u8(0);
    else if (material.kind === "air") writer.u8(1);
    else if (material.kind === "opaque-full-cube") {
      writer.u8(2);
      writer.u16(material.sideTile);
      writer.u16(material.topTile);
      writer.u16(material.bottomTile);
      writer.u16(material.emittedLight);
      writer.f64(material.emissiveStrength);
      writer.u8(material.lightDampening);
      writer.u8(material.ambientOcclusion ? 1 : 0);
    } else writer.u8(3);
  }
  writer.u32(registry.biomeTints.length);
  for (const tint of registry.biomeTints) {
    writer.u8(tint ? 1 : 0);
    if (tint) for (const channel of tint) writer.f64(channel);
  }
  return writer.finish();
}

export function encodeTerrainMaterialRegistryWireV2(registry: TerrainMaterialRegistryV2) {
  if (registry.schemaVersion !== 2) throw new RustTerrainWireError("BWR2 registry schemaVersion must be 2");
  if (!/^[0-9a-f]{32}$/.test(registry.contentHash)) throw new RustTerrainWireError("BWR2 contentHash is invalid");
  if (registry.blocks.length > 0x1_0000) throw new RustTerrainWireError("BWR2 block table exceeds the u16 ID space");
  if (registry.biomeTints.length > 0x100) throw new RustTerrainWireError("BWR2 biome table exceeds the u8 ID space");
  const writer = new Writer();
  writer.magic("BWR2");
  writer.string(registry.contentHash);
  writer.u32(registry.blocks.length);
  for (const [blockId, material] of registry.blocks.entries()) {
    if (material === null) writer.u8(0);
    else if (material.kind === "air") writer.u8(1);
    else {
      if (material.layer < 0 || material.layer > 6 || material.shape < 0 || material.shape > 36) {
        throw new RustTerrainWireError(`BWR2 block ${blockId} has an unknown layer or shape`);
      }
      for (const tile of [material.sideTile, material.topTile, material.bottomTile]) {
        if (!Number.isInteger(tile) || tile < 0 || tile >= 256) {
          throw new RustTerrainWireError(`BWR2 block ${blockId} has an out-of-atlas tile`);
        }
      }
      if (material.lightDampening < 0 || material.lightDampening > 15
        || material.emittedLight < 0 || material.emittedLight > 0x0fff
        || !Number.isFinite(material.emissiveStrength) || material.emissiveStrength < 0 || material.emissiveStrength > 1
        || material.geometryRevision !== 1 || material.tintPolicy < 0 || material.tintPolicy > 1) {
        throw new RustTerrainWireError(`BWR2 block ${blockId} has invalid lighting or geometry metadata`);
      }
      writer.u8(2);
      writer.u8(material.layer);
      writer.u8(material.shape);
      writer.u16(material.sideTile);
      writer.u16(material.topTile);
      writer.u16(material.bottomTile);
      writer.u16(Number(material.solid)
        | (Number(material.waterlogged) << 1)
        | (Number(material.connectsFence) << 2)
        | (Number(material.ambientOcclusion) << 3)
        | (Number(material.selectiveInteriorFaces) << 4)
        | (Number(material.directionallyPlaced) << 5)
        | (Number(material.joinsSameHorizontal) << 6)
        | (Number(material.joinsSameVertical) << 7));
      writer.u8(material.liquidKind);
      writer.u8(material.lightDampening);
      writer.u16(material.emittedLight);
      writer.f64(material.emissiveStrength);
      writer.u16(material.verticalConnectGroup);
      writer.u8(material.aquaticProfile);
      writer.u16(material.shapeVariant);
      writer.u16(material.geometryRevision);
      writer.u8(material.tintPolicy);
    }
  }
  writer.u32(registry.biomeTints.length);
  for (const [biomeId, tint] of registry.biomeTints.entries()) {
    writer.u8(tint ? 1 : 0);
    if (!tint) continue;
    for (const channel of tint) {
      if (!Number.isFinite(channel) || channel < 0 || channel > 1.1) {
        throw new RustTerrainWireError(`BWR2 biome ${biomeId} has an invalid tint`);
      }
      writer.f64(channel);
    }
  }
  return writer.finish();
}

function decodeMesh(reader: Reader): MeshPacketV1 {
  const schemaVersion = reader.u16();
  if (schemaVersion !== MESH_PACKET_SCHEMA_V1) throw new RustTerrainWireError(`Unsupported mesh schema ${schemaVersion}`);
  const sourceSnapshotHash = reader.string();
  const contentHash = reader.string();
  const address = readAddress(reader);
  const revision = readRevision(reader);
  const layerCount = reader.u32();
  if (layerCount > TERRAIN_MESH_LAYERS_V1.length) throw new RustTerrainWireError("Terrain mesh has too many layer spans");
  const layers: TerrainMeshLayerSpanV1[] = [];
  for (let index = 0; index < layerCount; index += 1) {
    const layerIndex = reader.u16();
    const layer = TERRAIN_MESH_LAYERS_V1[layerIndex];
    if (!layer) throw new RustTerrainWireError(`Terrain mesh has unknown layer ${layerIndex}`);
    layers.push({
      layer,
      vertexStart: reader.u32(),
      vertexCount: reader.u32(),
      indexStart: reader.u32(),
      indexCount: reader.u32(),
    });
  }
  const positions = reader.f32Vector();
  const normals = reader.i8Vector();
  const colors = reader.u8Vector();
  const lights = reader.u8Vector();
  const emissions = reader.u8Vector();
  const occlusions = reader.u8Vector();
  const uvs = reader.u16Vector();
  const indexWidth = reader.u8();
  const indices = indexWidth === 2 ? reader.u16Vector() : indexWidth === 4 ? reader.u32Vector() : null;
  if (!indices) throw new RustTerrainWireError(`Terrain mesh has unsupported index width ${indexWidth}`);
  const lightingTag = reader.u8();
  const lightingDelta = lightingTag === 0 ? undefined : lightingTag === 1 ? {
    changedCellIndices: reader.u16Vector(),
    packedLight: reader.u16Vector(),
  } : null;
  if (lightingDelta === null) throw new RustTerrainWireError(`Terrain mesh has unsupported lighting tag ${lightingTag}`);
  const packetHash = reader.string();
  reader.finish();
  const packet = {
    schemaVersion,
    sourceSnapshotHash,
    contentHash,
    address,
    revision,
    layers,
    streams: { positions, normals, colors, lights, emissions, occlusions, uvs, indices },
    ...(lightingDelta ? { lightingDelta } : {}),
    packetHash,
  } satisfies MeshPacketV1;
  assertMeshPacketV1(packet);
  return packet;
}

export type RustTerrainIneligibilityV1 = Readonly<{
  kind: "ineligible";
  code: number;
  haloIndex?: number;
  haloColumnIndex?: number;
  blockId?: number;
  flags?: number;
  level?: number;
  biomeId?: number;
  message: string;
}>;

function decodeIneligible(reader: Reader): RustTerrainIneligibilityV1 {
  const code = reader.u16();
  let detail: Omit<RustTerrainIneligibilityV1, "kind" | "code" | "message"> = {};
  let message: string;
  if (code === 1) message = "Snapshot and material-registry content hashes differ";
  else if (code === 2 || code === 3) {
    const haloIndex = reader.u16();
    const blockId = reader.u16();
    detail = { haloIndex, blockId };
    message = code === 2 ? `Unsupported block ${blockId} at halo index ${haloIndex}` : `Specialty block ${blockId} at halo index ${haloIndex}`;
  } else if (code === 4) {
    const haloIndex = reader.u16();
    const flags = reader.u8();
    detail = { haloIndex, flags };
    message = `Hidden/provisional geometry flags ${flags} at halo index ${haloIndex}`;
  } else if (code === 5) {
    const haloIndex = reader.u16();
    const level = reader.u8();
    const flags = reader.u8();
    detail = { haloIndex, level, flags };
    message = `Fluid metadata at halo index ${haloIndex} (level ${level}, flags ${flags})`;
  } else if (code === 6) {
    const haloColumnIndex = reader.u16();
    const biomeId = reader.u8();
    detail = { haloColumnIndex, biomeId };
    message = `Unsupported biome ${biomeId} at halo column ${haloColumnIndex}`;
  } else throw new RustTerrainWireError(`Unknown terrain ineligibility code ${code}`);
  reader.finish();
  return { kind: "ineligible", code, ...detail, message };
}

function decodeError(reader: Reader) {
  const count = reader.u32();
  if (count > 1_024) throw new RustTerrainWireError("Terrain error contains too many issues");
  const issues: string[] = [];
  for (let index = 0; index < count; index += 1) issues.push(reader.string());
  reader.finish();
  return { kind: "error", issues } as const;
}

export type RustTerrainLightingResultV1 = Readonly<{
  kind: "lighting";
  sourceSnapshotHash: string;
  contentHash: string;
  address: MeshPacketV1["address"];
  revision: MeshPacketV1["revision"];
  light: Uint16Array;
  changedCellIndices: Uint16Array;
  packedLight: Uint16Array;
}>;

function decodeLighting(reader: Reader): RustTerrainLightingResultV1 {
  const schema = reader.u16();
  if (schema !== SECTION_SNAPSHOT_SCHEMA_V1) throw new RustTerrainWireError(`Unsupported lighting schema ${schema}`);
  const result: RustTerrainLightingResultV1 = {
    kind: "lighting",
    sourceSnapshotHash: reader.string(),
    contentHash: reader.string(),
    address: readAddress(reader),
    revision: readRevision(reader),
    light: reader.u16Vector(),
    changedCellIndices: reader.u16Vector(),
    packedLight: reader.u16Vector(),
  };
  reader.finish();
  return result;
}

export type RustTerrainWireResponseV1 =
  | Readonly<{ kind: "mesh"; packet: MeshPacketV1 }>
  | RustTerrainLightingResultV1
  | RustTerrainIneligibilityV1
  | Readonly<{ kind: "error"; issues: readonly string[] }>;

export function decodeRustTerrainWireResponseV1(value: Uint8Array | ArrayBuffer): RustTerrainWireResponseV1 {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  const reader = new Reader(bytes);
  const magic = reader.magic();
  if (magic === "BWM1") return { kind: "mesh", packet: decodeMesh(reader) };
  if (magic === "BWL1") return decodeLighting(reader);
  if (magic === "BWI1") return decodeIneligible(reader);
  if (magic === "BWE1") return decodeError(reader);
  throw new RustTerrainWireError(`Terrain wire response has unknown magic ${JSON.stringify(magic)}`);
}
