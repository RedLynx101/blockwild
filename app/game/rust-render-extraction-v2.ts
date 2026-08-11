/**
 * Exact renderer extraction V2 wire contract shared with blockwild-render.
 *
 * This module deliberately has no Three.js or game-world dependency. The
 * authoritative runtime sends coarse resource pages and presentation frames;
 * a renderer consumes those immutable messages without querying voxels.
 */

import { TypeScriptCanonicalHasher } from "./rust-kernel-shadow.ts";

export const RENDER_EXTRACTION_SCHEMA_V2 = 2;
export const RENDER_MAX_RESOURCE_OPERATIONS_V2 = 65_536;
export const RENDER_MAX_INSTANCES_V2 = 262_144;
export const RENDER_MAX_PARTICLES_V2 = 262_144;
export const RENDER_MAX_WIRE_BYTES_V2 = 256 * 1024 * 1024;

const RESOURCE_MAGIC = new TextEncoder().encode("BWRD");
const FRAME_MAGIC = new TextEncoder().encode("BWRF");
const U64_ZERO = BigInt(0);
const U64_MAX = BigInt("0xffffffffffffffff");

export type Vec3V2 = readonly [number, number, number];
export type QuatV2 = readonly [number, number, number, number];
export type Rgb8V2 = readonly [number, number, number];
export type Rgba8V2 = readonly [number, number, number, number];
export type Hash128V2 = Uint8Array;

export type RenderTransformV2 = Readonly<{ translation: Vec3V2; rotation: QuatV2; scale: Vec3V2 }>;
export type RenderBoundsV2 = Readonly<{ minimum: Vec3V2; maximum: Vec3V2 }>;
export type RenderMaterialV2 = Readonly<{
  id: bigint;
  revision: number;
  shading: 0 | 1 | 2 | 3 | 4;
  blend: 0 | 1 | 2 | 3 | 4;
  baseColorRgba8: Rgba8V2;
  emissiveRgb8: Rgb8V2;
  emissiveStrength: number;
  roughness: number;
  metalness: number;
  alphaCutoff: number;
  atlasTile: number | null;
  doubleSided: boolean;
  depthWrite: boolean;
}>;
export type RenderGeometryV2 = Readonly<{
  id: bigint;
  revision: number;
  kind: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  bounds: RenderBoundsV2;
  positions: Float32Array;
  normals: Int8Array;
  colors: Uint8Array;
  lights: Uint8Array;
  emissions: Uint8Array;
  occlusions: Uint8Array;
  uvs: Uint16Array;
  indices: Uint32Array;
}>;
export type RenderResourceOperationV2 =
  | Readonly<{ kind: "upsert-material"; material: RenderMaterialV2 }>
  | Readonly<{ kind: "upsert-geometry"; geometry: RenderGeometryV2 }>
  | Readonly<{ kind: "remove-material"; id: bigint }>
  | Readonly<{ kind: "remove-geometry"; id: bigint }>;
export type RenderResourceBatchV2 = Readonly<{
  schema: 2;
  epoch: bigint;
  revision: bigint;
  operations: readonly RenderResourceOperationV2[];
  batchHash: Hash128V2;
}>;
export type RenderCameraV2 = Readonly<{
  position: Vec3V2;
  orientation: QuatV2;
  verticalFovRadians: number;
  near: number;
  far: number;
  viewport: readonly [number, number];
}>;
export type RenderEnvironmentV2 = Readonly<{
  clearRgba8: Rgba8V2;
  ambientRgb8: Rgb8V2;
  ambientIntensity: number;
  sunDirection: Vec3V2;
  sunRgb8: Rgb8V2;
  sunIntensity: number;
  fogRgb8: Rgb8V2;
  fogNear: number;
  fogFar: number;
  underwater: number;
  caveOcclusion: number;
}>;
export type RenderInstanceV2 = Readonly<{
  stableId: bigint;
  domain: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  geometry: bigint;
  material: bigint;
  parent: bigint | null;
  transform: RenderTransformV2;
  tintRgba8: Rgba8V2;
  visibilityMask: number;
  sortKey: number;
  animationFlags: number;
}>;
export type RenderParticleV2 = Readonly<{
  stableId: bigint;
  material: bigint;
  position: Vec3V2;
  velocity: Vec3V2;
  size: number;
  rotation: number;
  colorRgba8: Rgba8V2;
  ageSeconds: number;
  lifetimeSeconds: number;
}>;
export type RenderFrameV2 = Readonly<{
  schema: 2;
  epoch: bigint;
  frameSequence: bigint;
  simulationTick: bigint;
  animationTimeMicros: bigint;
  resourceRevision: bigint;
  frameHash: Hash128V2;
  camera: RenderCameraV2;
  environment: RenderEnvironmentV2;
  instances: readonly RenderInstanceV2[];
  particles: readonly RenderParticleV2[];
}>;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new TypeError(message);
}

function u8(value: number, label: string) {
  invariant(Number.isInteger(value) && value >= 0 && value <= 0xff, `${label} is not u8`);
  return value;
}

function u16(value: number, label: string) {
  invariant(Number.isInteger(value) && value >= 0 && value <= 0xffff, `${label} is not u16`);
  return value;
}

function u32(value: number, label: string) {
  invariant(Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff, `${label} is not u32`);
  return value;
}

function i32(value: number, label: string) {
  invariant(Number.isInteger(value) && value >= -0x8000_0000 && value <= 0x7fff_ffff, `${label} is not i32`);
  return value;
}

function uint64(value: bigint, label: string) {
  invariant(typeof value === "bigint" && value >= U64_ZERO && value <= U64_MAX, `${label} is not u64`);
  return value;
}

function finite(value: number, label: string) {
  invariant(Number.isFinite(value), `${label} is not finite`);
  return value;
}

function f32Bits(value: number) {
  const buffer = new ArrayBuffer(4);
  new DataView(buffer).setFloat32(0, Object.is(value, -0) ? 0 : Math.fround(value), true);
  return new DataView(buffer).getUint32(0, true);
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

function checkedTuple(value: readonly number[], size: number, label: string, byte = false) {
  invariant(value.length === size, `${label} has the wrong length`);
  for (const item of value) byte ? u8(item, label) : finite(item, label);
}

function validateTransform(value: RenderTransformV2) {
  checkedTuple(value.translation, 3, "translation");
  checkedTuple(value.rotation, 4, "rotation");
  checkedTuple(value.scale, 3, "scale");
  invariant(value.scale.every((item) => Math.abs(item) <= 1_000_000), "scale exceeds the bounded range");
  const lengthSquared = value.rotation.reduce((sum, item) => sum + item * item, 0);
  invariant(lengthSquared >= 0.998 && lengthSquared <= 1.002, "quaternion is not normalized");
}

function validateMaterial(value: RenderMaterialV2) {
  invariant(uint64(value.id, "material id") !== U64_ZERO, "material id is zero");
  u32(value.revision, "material revision");
  invariant(value.shading >= 0 && value.shading <= 4, "unknown shading model");
  invariant(value.blend >= 0 && value.blend <= 4, "unknown blend mode");
  checkedTuple(value.baseColorRgba8, 4, "base color", true);
  checkedTuple(value.emissiveRgb8, 3, "emissive color", true);
  invariant(finite(value.emissiveStrength, "emissive strength") >= 0 && value.emissiveStrength <= 64, "emissive strength is outside range");
  invariant(finite(value.roughness, "roughness") >= 0 && value.roughness <= 1, "roughness is outside range");
  invariant(finite(value.metalness, "metalness") >= 0 && value.metalness <= 1, "metalness is outside range");
  invariant(finite(value.alphaCutoff, "alpha cutoff") >= 0 && value.alphaCutoff <= 1, "alpha cutoff is outside range");
  if (value.atlasTile !== null) u16(value.atlasTile, "atlas tile");
}

function validateGeometry(value: RenderGeometryV2) {
  invariant(uint64(value.id, "geometry id") !== U64_ZERO, "geometry id is zero");
  u32(value.revision, "geometry revision");
  invariant(value.kind >= 0 && value.kind <= 8, "unknown geometry kind");
  checkedTuple(value.bounds.minimum, 3, "bounds minimum");
  checkedTuple(value.bounds.maximum, 3, "bounds maximum");
  invariant(value.bounds.minimum.every((item, axis) => item <= value.bounds.maximum[axis]), "geometry bounds are invalid");
  invariant(value.positions.length > 0 && value.positions.length % 3 === 0, "geometry position stream is invalid");
  invariant([...value.positions].every(Number.isFinite), "geometry has a non-finite position");
  const vertices = value.positions.length / 3;
  invariant(value.normals.length === vertices * 3, "geometry normal stream is inconsistent");
  invariant(value.colors.length === 0 || value.colors.length === vertices * 3, "geometry color stream is inconsistent");
  invariant(value.lights.length === 0 || value.lights.length === vertices * 4, "geometry light stream is inconsistent");
  invariant(value.emissions.length === 0 || value.emissions.length === vertices, "geometry emission stream is inconsistent");
  invariant(value.occlusions.length === 0 || value.occlusions.length === vertices, "geometry occlusion stream is inconsistent");
  invariant(value.uvs.length === 0 || value.uvs.length === vertices * 2, "geometry UV stream is inconsistent");
  invariant([...value.indices].every((index) => index < vertices), "geometry index is out of range");
}

function validateCamera(value: RenderCameraV2) {
  validateTransform({ translation: value.position, rotation: value.orientation, scale: [1, 1, 1] });
  invariant(value.verticalFovRadians > 0.01 && value.verticalFovRadians < 3.13, "camera FOV is invalid");
  invariant(finite(value.near, "camera near") > 0 && finite(value.far, "camera far") > value.near, "camera planes are invalid");
  invariant(u32(value.viewport[0], "viewport width") > 0 && u32(value.viewport[1], "viewport height") > 0, "camera viewport is empty");
}

function validateEnvironment(value: RenderEnvironmentV2) {
  checkedTuple(value.clearRgba8, 4, "clear color", true);
  checkedTuple(value.ambientRgb8, 3, "ambient color", true);
  checkedTuple(value.sunDirection, 3, "sun direction");
  checkedTuple(value.sunRgb8, 3, "sun color", true);
  checkedTuple(value.fogRgb8, 3, "fog color", true);
  invariant(finite(value.ambientIntensity, "ambient intensity") >= 0, "ambient intensity is negative");
  invariant(finite(value.sunIntensity, "sun intensity") >= 0, "sun intensity is negative");
  invariant(finite(value.fogNear, "fog near") >= 0 && finite(value.fogFar, "fog far") >= value.fogNear, "fog range is invalid");
  invariant(value.underwater >= 0 && value.underwater <= 1 && value.caveOcclusion >= 0 && value.caveOcclusion <= 1, "environment blend is invalid");
}

function validateInstance(value: RenderInstanceV2) {
  invariant(uint64(value.stableId, "instance id") !== U64_ZERO, "instance id is zero");
  invariant(uint64(value.geometry, "instance geometry") !== U64_ZERO && uint64(value.material, "instance material") !== U64_ZERO, "instance resource id is zero");
  invariant(value.parent === null || uint64(value.parent, "instance parent") !== value.stableId, "instance parent is invalid");
  invariant(value.domain >= 0 && value.domain <= 8, "unknown instance domain");
  validateTransform(value.transform);
  checkedTuple(value.tintRgba8, 4, "instance tint", true);
  u32(value.visibilityMask, "visibility mask");
  i32(value.sortKey, "sort key");
  u32(value.animationFlags, "animation flags");
}

function validateParticle(value: RenderParticleV2) {
  invariant(uint64(value.stableId, "particle id") !== U64_ZERO && uint64(value.material, "particle material") !== U64_ZERO, "particle identity is invalid");
  checkedTuple(value.position, 3, "particle position");
  checkedTuple(value.velocity, 3, "particle velocity");
  invariant(finite(value.size, "particle size") >= 0, "particle size is negative");
  finite(value.rotation, "particle rotation");
  checkedTuple(value.colorRgba8, 4, "particle color", true);
  finite(value.ageSeconds, "particle age");
  invariant(finite(value.lifetimeSeconds, "particle lifetime") > 0, "particle lifetime is invalid");
}

function hashTransform(hasher: TypeScriptCanonicalHasher, value: RenderTransformV2) {
  for (const item of [...value.translation, ...value.rotation, ...value.scale]) hasher.writeU32(f32Bits(item));
}

function hashBounds(hasher: TypeScriptCanonicalHasher, value: RenderBoundsV2) {
  for (const item of [...value.minimum, ...value.maximum]) hasher.writeU32(f32Bits(item));
}

function hashMaterial(hasher: TypeScriptCanonicalHasher, value: RenderMaterialV2) {
  hasher.writeU64(value.id).writeU32(value.revision).writeU16(value.shading).writeU16(value.blend);
  hasher.writeBytes(Uint8Array.from(value.baseColorRgba8)).writeBytes(Uint8Array.from(value.emissiveRgb8));
  for (const item of [value.emissiveStrength, value.roughness, value.metalness, value.alphaCutoff]) hasher.writeU32(f32Bits(item));
  hasher.writeU16(value.atlasTile ?? 0xffff).writeU16(Number(value.doubleSided)).writeU16(Number(value.depthWrite));
}

function hashGeometry(hasher: TypeScriptCanonicalHasher, value: RenderGeometryV2) {
  hasher.writeU64(value.id).writeU32(value.revision).writeU16(value.kind);
  hashBounds(hasher, value.bounds);
  hasher.writeU64(value.positions.length);
  for (const item of value.positions) hasher.writeU32(f32Bits(item));
  hasher.writeBytes(new Uint8Array(value.normals.buffer, value.normals.byteOffset, value.normals.byteLength));
  for (const stream of [value.colors, value.lights, value.emissions, value.occlusions]) hasher.writeBytes(stream);
  hasher.writeU64(value.uvs.length);
  for (const item of value.uvs) hasher.writeU16(item);
  hasher.writeU64(value.indices.length);
  for (const item of value.indices) hasher.writeU32(item);
}

function hashInstance(hasher: TypeScriptCanonicalHasher, value: RenderInstanceV2) {
  hasher.writeU64(value.stableId).writeU16(value.domain).writeU64(value.geometry).writeU64(value.material).writeU64(value.parent ?? U64_ZERO);
  hashTransform(hasher, value.transform);
  hasher.writeBytes(Uint8Array.from(value.tintRgba8)).writeU32(value.visibilityMask).writeI32(value.sortKey).writeU32(value.animationFlags);
}

function hashParticle(hasher: TypeScriptCanonicalHasher, value: RenderParticleV2) {
  hasher.writeU64(value.stableId).writeU64(value.material);
  for (const item of [...value.position, ...value.velocity, value.size, value.rotation]) hasher.writeU32(f32Bits(item));
  hasher.writeBytes(Uint8Array.from(value.colorRgba8)).writeU32(f32Bits(value.ageSeconds)).writeU32(f32Bits(value.lifetimeSeconds));
}

export function renderResourceBatchHashV2(value: Omit<RenderResourceBatchV2, "batchHash">) {
  const hasher = new TypeScriptCanonicalHasher("blockwild.render.resources.v2");
  hasher.writeU16(value.schema).writeU64(value.epoch).writeU64(value.revision).writeU64(value.operations.length);
  for (const operation of value.operations) {
    const kind = operation.kind === "upsert-material" ? 0 : operation.kind === "upsert-geometry" ? 1 : operation.kind === "remove-material" ? 2 : 3;
    hasher.writeU16(kind);
    if (operation.kind === "upsert-material") hashMaterial(hasher, operation.material);
    else if (operation.kind === "upsert-geometry") hashGeometry(hasher, operation.geometry);
    else hasher.writeU64(operation.id);
  }
  return hasher.finish();
}

export function renderFrameHashV2(value: Omit<RenderFrameV2, "frameHash">) {
  const hasher = new TypeScriptCanonicalHasher("blockwild.render.frame.v2");
  hasher.writeU16(value.schema).writeU64(value.epoch).writeU64(value.frameSequence).writeU64(value.simulationTick)
    .writeU64(value.animationTimeMicros).writeU64(value.resourceRevision);
  for (const item of [...value.camera.position, ...value.camera.orientation, value.camera.verticalFovRadians, value.camera.near, value.camera.far]) hasher.writeU32(f32Bits(item));
  hasher.writeU32(value.camera.viewport[0]).writeU32(value.camera.viewport[1]);
  hasher.writeBytes(Uint8Array.from(value.environment.clearRgba8)).writeBytes(Uint8Array.from(value.environment.ambientRgb8)).writeU32(f32Bits(value.environment.ambientIntensity));
  for (const item of value.environment.sunDirection) hasher.writeU32(f32Bits(item));
  hasher.writeBytes(Uint8Array.from(value.environment.sunRgb8)).writeU32(f32Bits(value.environment.sunIntensity)).writeBytes(Uint8Array.from(value.environment.fogRgb8));
  for (const item of [value.environment.fogNear, value.environment.fogFar, value.environment.underwater, value.environment.caveOcclusion]) hasher.writeU32(f32Bits(item));
  const instances = [...value.instances].sort((left, right) => left.stableId < right.stableId ? -1 : left.stableId > right.stableId ? 1 : 0);
  hasher.writeU64(instances.length);
  for (const instance of instances) hashInstance(hasher, instance);
  const particles = [...value.particles].sort((left, right) => left.stableId < right.stableId ? -1 : left.stableId > right.stableId ? 1 : 0);
  hasher.writeU64(particles.length);
  for (const particle of particles) hashParticle(hasher, particle);
  return hasher.finish();
}

export function createRenderResourceBatchV2(value: Omit<RenderResourceBatchV2, "schema" | "batchHash">): RenderResourceBatchV2 {
  const result = { ...value, schema: 2 as const, operations: [...value.operations], batchHash: new Uint8Array(16) };
  validateResourceBatch(result, false);
  return Object.freeze({ ...result, batchHash: renderResourceBatchHashV2(result) });
}

export function createRenderFrameV2(value: Omit<RenderFrameV2, "schema" | "frameHash">): RenderFrameV2 {
  const result = { ...value, schema: 2 as const, instances: [...value.instances], particles: [...value.particles], frameHash: new Uint8Array(16) };
  validateFrame(result, false);
  return Object.freeze({ ...result, frameHash: renderFrameHashV2(result) });
}

function validateResourceBatch(value: RenderResourceBatchV2, verifyHash = true) {
  invariant(value.schema === 2, "unsupported renderer extraction schema");
  uint64(value.epoch, "resource epoch");
  uint64(value.revision, "resource revision");
  invariant(value.operations.length <= RENDER_MAX_RESOURCE_OPERATIONS_V2, "too many resource operations");
  const touched = new Set<string>();
  for (const operation of value.operations) {
    const tag = operation.kind === "upsert-material" ? 0 : operation.kind === "upsert-geometry" ? 1 : operation.kind === "remove-material" ? 2 : 3;
    const id = operation.kind === "upsert-material" ? operation.material.id : operation.kind === "upsert-geometry" ? operation.geometry.id : operation.id;
    if (operation.kind === "upsert-material") validateMaterial(operation.material);
    else if (operation.kind === "upsert-geometry") validateGeometry(operation.geometry);
    else invariant(uint64(operation.id, "removed resource id") !== U64_ZERO, "removed resource id is zero");
    const key = `${tag}:${id}`;
    invariant(!touched.has(key), "duplicate resource operation");
    touched.add(key);
  }
  if (verifyHash) invariant(value.batchHash.length === 16 && equalBytes(value.batchHash, renderResourceBatchHashV2(value)), "resource batch hash mismatch");
}

function validateFrame(value: RenderFrameV2, verifyHash = true) {
  invariant(value.schema === 2, "unsupported renderer extraction schema");
  for (const [label, item] of [["epoch", value.epoch], ["frame sequence", value.frameSequence], ["simulation tick", value.simulationTick], ["animation time", value.animationTimeMicros], ["resource revision", value.resourceRevision]] as const) uint64(item, label);
  invariant(value.instances.length <= RENDER_MAX_INSTANCES_V2 && value.particles.length <= RENDER_MAX_PARTICLES_V2, "render frame exceeds protocol limits");
  validateCamera(value.camera);
  validateEnvironment(value.environment);
  const parents = new Map<bigint, bigint | null>();
  for (const instance of value.instances) {
    validateInstance(instance);
    invariant(!parents.has(instance.stableId), "duplicate render instance id");
    parents.set(instance.stableId, instance.parent);
  }
  for (const [id, parent] of parents) {
    if (parent === null) continue;
    invariant(parents.has(parent), "missing instance parent");
    const seen = new Set<bigint>([id]);
    let cursor: bigint | null = parent;
    while (cursor !== null) {
      invariant(!seen.has(cursor), "render hierarchy contains a cycle");
      seen.add(cursor);
      cursor = parents.get(cursor) ?? null;
    }
  }
  const particles = new Set<bigint>();
  for (const particle of value.particles) {
    validateParticle(particle);
    invariant(!particles.has(particle.stableId), "duplicate particle id");
    particles.add(particle.stableId);
  }
  if (verifyHash) invariant(value.frameHash.length === 16 && equalBytes(value.frameHash, renderFrameHashV2(value)), "render frame hash mismatch");
}

class Writer {
  private buffer = new ArrayBuffer(1024);
  private view = new DataView(this.buffer);
  private length = 0;
  private reserve(bytes: number) {
    invariant(this.length + bytes <= RENDER_MAX_WIRE_BYTES_V2, "renderer wire exceeds 256 MiB");
    if (this.length + bytes <= this.buffer.byteLength) return;
    let capacity = this.buffer.byteLength;
    while (capacity < this.length + bytes) capacity = Math.min(RENDER_MAX_WIRE_BYTES_V2, capacity * 2);
    const next = new ArrayBuffer(capacity);
    new Uint8Array(next).set(new Uint8Array(this.buffer, 0, this.length));
    this.buffer = next;
    this.view = new DataView(next);
  }
  raw(bytes: Uint8Array | readonly number[]) { const value = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes); this.reserve(value.byteLength); new Uint8Array(this.buffer, this.length, value.byteLength).set(value); this.length += value.byteLength; }
  u8(value: number) { this.reserve(1); this.view.setUint8(this.length, u8(value, "u8")); this.length += 1; }
  u16(value: number) { this.reserve(2); this.view.setUint16(this.length, u16(value, "u16"), true); this.length += 2; }
  u32(value: number) { this.reserve(4); this.view.setUint32(this.length, u32(value, "u32"), true); this.length += 4; }
  i32(value: number) { this.reserve(4); this.view.setInt32(this.length, i32(value, "i32"), true); this.length += 4; }
  u64(value: bigint) { this.reserve(8); this.view.setBigUint64(this.length, uint64(value, "u64"), true); this.length += 8; }
  f32(value: number) { this.reserve(4); this.view.setUint32(this.length, f32Bits(value), true); this.length += 4; }
  stream<T>(values: ArrayLike<T>, write: (value: T) => void) { this.u32(values.length); for (let index = 0; index < values.length; index += 1) write(values[index]); }
  finish() { return new Uint8Array(this.buffer.slice(0, this.length)); }
}

class Reader {
  private readonly view: DataView;
  private cursor = 0;
  constructor(readonly bytes: Uint8Array) { invariant(bytes.byteLength <= RENDER_MAX_WIRE_BYTES_V2, "renderer wire exceeds 256 MiB"); this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }
  take(length: number) { invariant(Number.isInteger(length) && length >= 0 && this.cursor + length <= this.bytes.byteLength, "renderer wire is truncated"); const result = this.bytes.subarray(this.cursor, this.cursor + length); this.cursor += length; return result; }
  u8() { const result = this.take(1)[0]; return result; }
  u16() { const offset = this.cursor; this.take(2); return this.view.getUint16(offset, true); }
  u32() { const offset = this.cursor; this.take(4); return this.view.getUint32(offset, true); }
  i32() { const offset = this.cursor; this.take(4); return this.view.getInt32(offset, true); }
  u64() { const offset = this.cursor; this.take(8); return this.view.getBigUint64(offset, true); }
  f32() { const offset = this.cursor; this.take(4); return this.view.getFloat32(offset, true); }
  count(label: string) { const result = this.u32(); invariant(result <= this.bytes.byteLength - this.cursor, `${label} is oversized`); return result; }
  done() { invariant(this.cursor === this.bytes.byteLength, "renderer wire has trailing bytes"); }
}

function writeMaterial(writer: Writer, value: RenderMaterialV2) {
  writer.u64(value.id); writer.u32(value.revision); writer.u8(value.shading); writer.u8(value.blend); writer.raw(value.baseColorRgba8); writer.raw(value.emissiveRgb8);
  writer.u8(Number(value.doubleSided) | Number(value.depthWrite) << 1);
  writer.f32(value.emissiveStrength); writer.f32(value.roughness); writer.f32(value.metalness); writer.f32(value.alphaCutoff); writer.u16(value.atlasTile ?? 0xffff);
}

function readMaterial(reader: Reader): RenderMaterialV2 {
  const id = reader.u64(), revision = reader.u32(), shading = reader.u8(), blend = reader.u8();
  invariant(shading <= 4 && blend <= 4, "unknown render material enum");
  const baseColorRgba8 = [...reader.take(4)] as [number, number, number, number];
  const emissiveRgb8 = [...reader.take(3)] as [number, number, number];
  const flags = reader.u8(); invariant((flags & ~3) === 0, "unknown material flags");
  const emissiveStrength = reader.f32(), roughness = reader.f32(), metalness = reader.f32(), alphaCutoff = reader.f32(), tile = reader.u16();
  return { id, revision, shading: shading as RenderMaterialV2["shading"], blend: blend as RenderMaterialV2["blend"], baseColorRgba8, emissiveRgb8, emissiveStrength, roughness, metalness, alphaCutoff, atlasTile: tile === 0xffff ? null : tile, doubleSided: Boolean(flags & 1), depthWrite: Boolean(flags & 2) };
}

function writeGeometry(writer: Writer, value: RenderGeometryV2) {
  writer.u64(value.id); writer.u32(value.revision); writer.u8(value.kind); writer.raw([0, 0, 0]);
  for (const item of [...value.bounds.minimum, ...value.bounds.maximum]) writer.f32(item);
  writer.stream(value.positions, (item) => writer.f32(item));
  writer.u32(value.normals.length); writer.raw(new Uint8Array(value.normals.buffer, value.normals.byteOffset, value.normals.byteLength));
  for (const stream of [value.colors, value.lights, value.emissions, value.occlusions]) { writer.u32(stream.length); writer.raw(stream); }
  writer.stream(value.uvs, (item) => writer.u16(item)); writer.stream(value.indices, (item) => writer.u32(item));
}

function readGeometry(reader: Reader): RenderGeometryV2 {
  const id = reader.u64(), revision = reader.u32(), kind = reader.u8(); invariant(kind <= 8, "unknown geometry kind"); invariant(reader.take(3).every((item) => item === 0), "geometry reserved bits are nonzero");
  const minimum = [reader.f32(), reader.f32(), reader.f32()] as const, maximum = [reader.f32(), reader.f32(), reader.f32()] as const;
  const positions = Float32Array.from({ length: reader.count("positions") }, () => reader.f32());
  const normalBytes = reader.take(reader.count("normals")); const normals = new Int8Array(normalBytes.length); new Uint8Array(normals.buffer).set(normalBytes);
  const readU8Stream = (label: string) => Uint8Array.from(reader.take(reader.count(label)));
  const colors = readU8Stream("colors"), lights = readU8Stream("lights"), emissions = readU8Stream("emissions"), occlusions = readU8Stream("occlusions");
  const uvs = Uint16Array.from({ length: reader.count("uvs") }, () => reader.u16());
  const indices = Uint32Array.from({ length: reader.count("indices") }, () => reader.u32());
  return { id, revision, kind: kind as RenderGeometryV2["kind"], bounds: { minimum, maximum }, positions, normals, colors, lights, emissions, occlusions, uvs, indices };
}

function writeTransform(writer: Writer, value: RenderTransformV2) { for (const item of [...value.translation, ...value.rotation, ...value.scale]) writer.f32(item); }
function readTransform(reader: Reader): RenderTransformV2 { return { translation: [reader.f32(), reader.f32(), reader.f32()], rotation: [reader.f32(), reader.f32(), reader.f32(), reader.f32()], scale: [reader.f32(), reader.f32(), reader.f32()] }; }

export function encodeRenderResourceBatchV2(value: RenderResourceBatchV2) {
  validateResourceBatch(value);
  const writer = new Writer(); writer.raw(RESOURCE_MAGIC); writer.u16(2); writer.u16(0); writer.u64(value.epoch); writer.u64(value.revision); writer.u32(value.operations.length); writer.raw(value.batchHash);
  for (const operation of value.operations) {
    if (operation.kind === "upsert-material") { writer.u8(0); writeMaterial(writer, operation.material); }
    else if (operation.kind === "upsert-geometry") { writer.u8(1); writeGeometry(writer, operation.geometry); }
    else { writer.u8(operation.kind === "remove-material" ? 2 : 3); writer.u64(operation.id); }
  }
  return writer.finish();
}

export function decodeRenderResourceBatchV2(bytes: Uint8Array): RenderResourceBatchV2 {
  const reader = new Reader(bytes); invariant(equalBytes(reader.take(4), RESOURCE_MAGIC), "invalid resource wire magic"); invariant(reader.u16() === 2 && reader.u16() === 0, "invalid resource wire header");
  const epoch = reader.u64(), revision = reader.u64(), count = reader.u32(); invariant(count <= RENDER_MAX_RESOURCE_OPERATIONS_V2, "too many resource operations"); const batchHash = Uint8Array.from(reader.take(16));
  const operations: RenderResourceOperationV2[] = [];
  for (let index = 0; index < count; index += 1) {
    const tag = reader.u8();
    if (tag === 0) operations.push({ kind: "upsert-material", material: readMaterial(reader) });
    else if (tag === 1) operations.push({ kind: "upsert-geometry", geometry: readGeometry(reader) });
    else if (tag === 2 || tag === 3) operations.push({ kind: tag === 2 ? "remove-material" : "remove-geometry", id: reader.u64() });
    else throw new TypeError("unknown render resource operation");
  }
  reader.done(); const result: RenderResourceBatchV2 = { schema: 2, epoch, revision, operations, batchHash }; validateResourceBatch(result); return result;
}

function writeCamera(writer: Writer, value: RenderCameraV2) { for (const item of [...value.position, ...value.orientation, value.verticalFovRadians, value.near, value.far]) writer.f32(item); writer.u32(value.viewport[0]); writer.u32(value.viewport[1]); }
function readCamera(reader: Reader): RenderCameraV2 { return { position: [reader.f32(), reader.f32(), reader.f32()], orientation: [reader.f32(), reader.f32(), reader.f32(), reader.f32()], verticalFovRadians: reader.f32(), near: reader.f32(), far: reader.f32(), viewport: [reader.u32(), reader.u32()] }; }
function writeEnvironment(writer: Writer, value: RenderEnvironmentV2) { writer.raw(value.clearRgba8); writer.raw(value.ambientRgb8); writer.f32(value.ambientIntensity); for (const item of value.sunDirection) writer.f32(item); writer.raw(value.sunRgb8); writer.f32(value.sunIntensity); writer.raw(value.fogRgb8); for (const item of [value.fogNear, value.fogFar, value.underwater, value.caveOcclusion]) writer.f32(item); }
function readEnvironment(reader: Reader): RenderEnvironmentV2 { const clearRgba8 = [...reader.take(4)] as [number, number, number, number], ambientRgb8 = [...reader.take(3)] as [number, number, number], ambientIntensity = reader.f32(), sunDirection = [reader.f32(), reader.f32(), reader.f32()] as const, sunRgb8 = [...reader.take(3)] as [number, number, number], sunIntensity = reader.f32(), fogRgb8 = [...reader.take(3)] as [number, number, number]; return { clearRgba8, ambientRgb8, ambientIntensity, sunDirection, sunRgb8, sunIntensity, fogRgb8, fogNear: reader.f32(), fogFar: reader.f32(), underwater: reader.f32(), caveOcclusion: reader.f32() }; }

export function encodeRenderFrameV2(value: RenderFrameV2) {
  validateFrame(value);
  const writer = new Writer(); writer.raw(FRAME_MAGIC); writer.u16(2); writer.u16(0); writer.u64(value.epoch); writer.u64(value.frameSequence); writer.u64(value.simulationTick); writer.u64(value.animationTimeMicros); writer.u64(value.resourceRevision); writer.raw(value.frameHash); writeCamera(writer, value.camera); writeEnvironment(writer, value.environment); writer.u32(value.instances.length);
  for (const instance of value.instances) { writer.u64(instance.stableId); writer.u8(instance.domain); writer.raw([0, 0, 0]); writer.u64(instance.geometry); writer.u64(instance.material); writer.u64(instance.parent ?? U64_ZERO); writeTransform(writer, instance.transform); writer.raw(instance.tintRgba8); writer.u32(instance.visibilityMask); writer.i32(instance.sortKey); writer.u32(instance.animationFlags); }
  writer.u32(value.particles.length);
  for (const particle of value.particles) { writer.u64(particle.stableId); writer.u64(particle.material); for (const item of [...particle.position, ...particle.velocity, particle.size, particle.rotation]) writer.f32(item); writer.raw(particle.colorRgba8); writer.f32(particle.ageSeconds); writer.f32(particle.lifetimeSeconds); }
  return writer.finish();
}

export function decodeRenderFrameV2(bytes: Uint8Array): RenderFrameV2 {
  const reader = new Reader(bytes); invariant(equalBytes(reader.take(4), FRAME_MAGIC), "invalid frame wire magic"); invariant(reader.u16() === 2 && reader.u16() === 0, "invalid frame wire header");
  const epoch = reader.u64(), frameSequence = reader.u64(), simulationTick = reader.u64(), animationTimeMicros = reader.u64(), resourceRevision = reader.u64(), frameHash = Uint8Array.from(reader.take(16)), camera = readCamera(reader), environment = readEnvironment(reader), instanceCount = reader.u32(); invariant(instanceCount <= RENDER_MAX_INSTANCES_V2, "too many instances");
  const instances: RenderInstanceV2[] = [];
  for (let index = 0; index < instanceCount; index += 1) { const stableId = reader.u64(), domain = reader.u8(); invariant(domain <= 8 && reader.take(3).every((item) => item === 0), "invalid instance header"); const geometry = reader.u64(), material = reader.u64(), rawParent = reader.u64(); instances.push({ stableId, domain: domain as RenderInstanceV2["domain"], geometry, material, parent: rawParent === U64_ZERO ? null : rawParent, transform: readTransform(reader), tintRgba8: [...reader.take(4)] as [number, number, number, number], visibilityMask: reader.u32(), sortKey: reader.i32(), animationFlags: reader.u32() }); }
  const particleCount = reader.u32(); invariant(particleCount <= RENDER_MAX_PARTICLES_V2, "too many particles"); const particles: RenderParticleV2[] = [];
  for (let index = 0; index < particleCount; index += 1) particles.push({ stableId: reader.u64(), material: reader.u64(), position: [reader.f32(), reader.f32(), reader.f32()], velocity: [reader.f32(), reader.f32(), reader.f32()], size: reader.f32(), rotation: reader.f32(), colorRgba8: [...reader.take(4)] as [number, number, number, number], ageSeconds: reader.f32(), lifetimeSeconds: reader.f32() });
  reader.done(); const result: RenderFrameV2 = { schema: 2, epoch, frameSequence, simulationTick, animationTimeMicros, resourceRevision, frameHash, camera, environment, instances, particles }; validateFrame(result); return result;
}

export function renderWireBytesV2(value: RenderResourceBatchV2 | RenderFrameV2) {
  return "operations" in value ? encodeRenderResourceBatchV2(value) : encodeRenderFrameV2(value);
}
