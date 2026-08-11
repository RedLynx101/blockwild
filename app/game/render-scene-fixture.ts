import { TypeScriptCanonicalHasher } from "./rust-kernel-shadow";

export const RENDER_SCENE_FIXTURE_SCHEMA = 1 as const;

export type RenderFixtureLayer =
  | "opaque"
  | "cutout"
  | "translucent-solid"
  | "water"
  | "transparent"
  | "glass"
  | "emissive";

export type RenderMaterialProbeV1 = Readonly<{
  id: string;
  layer: RenderFixtureLayer;
  baseColor: readonly [number, number, number, number];
  emissiveColor: readonly [number, number, number];
  roughness: number;
  metalness: number;
  alphaTest: number;
  depthWrite: boolean;
  doubleSided: boolean;
}>;

export type RenderMeshProbeV1 = Readonly<{
  id: string;
  materialId: string;
  transform: Float32Array;
  positions: Float32Array;
  normals: Int8Array;
  colors: Uint8Array;
  uvs: Uint16Array;
  indices: Uint32Array;
}>;

export type RenderSceneFixtureV1 = Readonly<{
  schema: typeof RENDER_SCENE_FIXTURE_SCHEMA;
  fixtureId: string;
  animationTimeMs: number;
  viewport: Readonly<{ width: number; height: number; pixelRatio: number }>;
  camera: Readonly<{
    position: readonly [number, number, number];
    target: readonly [number, number, number];
    up: readonly [number, number, number];
    fieldOfViewDegrees: number;
    near: number;
    far: number;
  }>;
  environment: Readonly<{
    clearColor: readonly [number, number, number, number];
    ambientColor: readonly [number, number, number];
    ambientIntensity: number;
    fogColor: readonly [number, number, number];
    fogNear: number;
    fogFar: number;
  }>;
  materials: readonly RenderMaterialProbeV1[];
  meshes: readonly RenderMeshProbeV1[];
}>;

const LAYERS: readonly RenderFixtureLayer[] = [
  "opaque",
  "cutout",
  "translucent-solid",
  "water",
  "transparent",
  "glass",
  "emissive",
];

function finite(value: number, label: string) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function unit(value: number, label: string) {
  finite(value, label);
  if (value < 0 || value > 1) throw new RangeError(`${label} must be in 0..1`);
  return value;
}

function positiveInteger(value: number, label: string) {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive integer`);
  return value;
}

function nonEmpty(value: string, label: string) {
  if (value.trim().length === 0) throw new TypeError(`${label} must not be empty`);
  return value;
}

function finiteVector(values: readonly number[], expected: number, label: string) {
  if (values.length !== expected) throw new RangeError(`${label} must contain ${expected} values`);
  values.forEach((value, index) => finite(value, `${label}[${index}]`));
}

function canonicalFloat64(value: number) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, Object.is(value, -0) ? 0 : value, true);
  return bytes;
}

function canonicalFloat32(values: Float32Array) {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setFloat32(index * 4, Object.is(value, -0) ? 0 : value, true));
  return bytes;
}

function canonicalUint16(values: Uint16Array) {
  const bytes = new Uint8Array(values.length * 2);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint16(index * 2, value, true));
  return bytes;
}

function canonicalUint32(values: Uint32Array) {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  values.forEach((value, index) => view.setUint32(index * 4, value, true));
  return bytes;
}

function hashFloat(hasher: TypeScriptCanonicalHasher, value: number) {
  hasher.writeBytes(canonicalFloat64(finite(value, "render fixture number")));
}

function hashVector(hasher: TypeScriptCanonicalHasher, values: readonly number[]) {
  hasher.writeU32(values.length);
  values.forEach((value) => hashFloat(hasher, value));
}

function sortedUnique<T extends { id: string }>(values: readonly T[], label: string) {
  const sorted = [...values].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  sorted.forEach((value, index) => {
    nonEmpty(value.id, `${label}[${index}].id`);
    if (index > 0 && sorted[index - 1]?.id === value.id) throw new TypeError(`${label} contains duplicate id ${value.id}`);
  });
  return sorted;
}

export function validateRenderSceneFixture(fixture: RenderSceneFixtureV1) {
  if (fixture.schema !== RENDER_SCENE_FIXTURE_SCHEMA) throw new TypeError(`unsupported render fixture schema ${fixture.schema}`);
  nonEmpty(fixture.fixtureId, "fixtureId");
  if (!Number.isInteger(fixture.animationTimeMs) || fixture.animationTimeMs < 0) {
    throw new RangeError("animationTimeMs must be a non-negative integer");
  }
  positiveInteger(fixture.viewport.width, "viewport.width");
  positiveInteger(fixture.viewport.height, "viewport.height");
  finite(fixture.viewport.pixelRatio, "viewport.pixelRatio");
  if (fixture.viewport.pixelRatio <= 0 || fixture.viewport.pixelRatio > 4) throw new RangeError("viewport.pixelRatio must be in (0, 4]");
  finiteVector(fixture.camera.position, 3, "camera.position");
  finiteVector(fixture.camera.target, 3, "camera.target");
  finiteVector(fixture.camera.up, 3, "camera.up");
  finite(fixture.camera.fieldOfViewDegrees, "camera.fieldOfViewDegrees");
  if (fixture.camera.fieldOfViewDegrees <= 0 || fixture.camera.fieldOfViewDegrees >= 180) throw new RangeError("camera field of view must be in (0, 180)");
  finite(fixture.camera.near, "camera.near");
  finite(fixture.camera.far, "camera.far");
  if (fixture.camera.near <= 0 || fixture.camera.far <= fixture.camera.near) throw new RangeError("camera clipping range is invalid");
  finiteVector(fixture.environment.clearColor, 4, "environment.clearColor");
  fixture.environment.clearColor.forEach((value, index) => unit(value, `environment.clearColor[${index}]`));
  finiteVector(fixture.environment.ambientColor, 3, "environment.ambientColor");
  fixture.environment.ambientColor.forEach((value, index) => unit(value, `environment.ambientColor[${index}]`));
  finiteVector(fixture.environment.fogColor, 3, "environment.fogColor");
  fixture.environment.fogColor.forEach((value, index) => unit(value, `environment.fogColor[${index}]`));
  finite(fixture.environment.ambientIntensity, "environment.ambientIntensity");
  finite(fixture.environment.fogNear, "environment.fogNear");
  finite(fixture.environment.fogFar, "environment.fogFar");
  if (fixture.environment.ambientIntensity < 0) throw new RangeError("ambient intensity must be non-negative");
  if (fixture.environment.fogNear < 0 || fixture.environment.fogFar <= fixture.environment.fogNear) throw new RangeError("fog range is invalid");

  const materials = sortedUnique(fixture.materials, "materials");
  const materialIds = new Set(materials.map((material) => material.id));
  materials.forEach((material) => {
    if (!LAYERS.includes(material.layer)) throw new TypeError(`material ${material.id} has unsupported layer ${material.layer}`);
    finiteVector(material.baseColor, 4, `material ${material.id} baseColor`);
    material.baseColor.forEach((value, index) => unit(value, `material ${material.id} baseColor[${index}]`));
    finiteVector(material.emissiveColor, 3, `material ${material.id} emissiveColor`);
    material.emissiveColor.forEach((value, index) => unit(value, `material ${material.id} emissiveColor[${index}]`));
    unit(material.roughness, `material ${material.id} roughness`);
    unit(material.metalness, `material ${material.id} metalness`);
    unit(material.alphaTest, `material ${material.id} alphaTest`);
  });

  sortedUnique(fixture.meshes, "meshes").forEach((mesh) => {
    if (!materialIds.has(mesh.materialId)) throw new TypeError(`mesh ${mesh.id} references missing material ${mesh.materialId}`);
    if (mesh.transform.length !== 16) throw new RangeError(`mesh ${mesh.id} transform must contain 16 values`);
    mesh.transform.forEach((value, index) => finite(value, `mesh ${mesh.id} transform[${index}]`));
    if (mesh.positions.length === 0 || mesh.positions.length % 3 !== 0) throw new RangeError(`mesh ${mesh.id} positions must contain xyz triples`);
    const vertexCount = mesh.positions.length / 3;
    if (mesh.normals.length !== vertexCount * 3) throw new RangeError(`mesh ${mesh.id} normals length does not match positions`);
    if (mesh.colors.length !== vertexCount * 4) throw new RangeError(`mesh ${mesh.id} colors length does not match positions`);
    if (mesh.uvs.length !== vertexCount * 2) throw new RangeError(`mesh ${mesh.id} uvs length does not match positions`);
    if (mesh.indices.length === 0 || mesh.indices.length % 3 !== 0) throw new RangeError(`mesh ${mesh.id} indices must contain triangles`);
    mesh.positions.forEach((value, index) => finite(value, `mesh ${mesh.id} positions[${index}]`));
    mesh.indices.forEach((index) => {
      if (index >= vertexCount) throw new RangeError(`mesh ${mesh.id} index ${index} exceeds vertex count ${vertexCount}`);
    });
  });
  return fixture;
}

export function renderSceneFixtureHash(fixture: RenderSceneFixtureV1) {
  validateRenderSceneFixture(fixture);
  const hasher = new TypeScriptCanonicalHasher("blockwild-render-scene-v1");
  hasher.writeU16(fixture.schema).writeString(fixture.fixtureId).writeU64(fixture.animationTimeMs);
  hasher.writeU32(fixture.viewport.width).writeU32(fixture.viewport.height);
  hashFloat(hasher, fixture.viewport.pixelRatio);
  hashVector(hasher, fixture.camera.position);
  hashVector(hasher, fixture.camera.target);
  hashVector(hasher, fixture.camera.up);
  hashFloat(hasher, fixture.camera.fieldOfViewDegrees);
  hashFloat(hasher, fixture.camera.near);
  hashFloat(hasher, fixture.camera.far);
  hashVector(hasher, fixture.environment.clearColor);
  hashVector(hasher, fixture.environment.ambientColor);
  hashFloat(hasher, fixture.environment.ambientIntensity);
  hashVector(hasher, fixture.environment.fogColor);
  hashFloat(hasher, fixture.environment.fogNear);
  hashFloat(hasher, fixture.environment.fogFar);
  const materials = sortedUnique(fixture.materials, "materials");
  hasher.writeU32(materials.length);
  materials.forEach((material) => {
    hasher.writeString(material.id).writeString(material.layer);
    hashVector(hasher, material.baseColor);
    hashVector(hasher, material.emissiveColor);
    hashFloat(hasher, material.roughness);
    hashFloat(hasher, material.metalness);
    hashFloat(hasher, material.alphaTest);
    hasher.writeU16(material.depthWrite ? 1 : 0).writeU16(material.doubleSided ? 1 : 0);
  });
  const meshes = sortedUnique(fixture.meshes, "meshes");
  hasher.writeU32(meshes.length);
  meshes.forEach((mesh) => {
    hasher.writeString(mesh.id).writeString(mesh.materialId);
    hasher.writeBytes(canonicalFloat32(mesh.transform));
    hasher.writeBytes(canonicalFloat32(mesh.positions));
    hasher.writeBytes(new Uint8Array(mesh.normals.buffer, mesh.normals.byteOffset, mesh.normals.byteLength));
    hasher.writeBytes(new Uint8Array(mesh.colors.buffer, mesh.colors.byteOffset, mesh.colors.byteLength));
    hasher.writeBytes(canonicalUint16(mesh.uvs));
    hasher.writeBytes(canonicalUint32(mesh.indices));
  });
  return hasher.finishHex();
}

export function renderSceneTransferList(fixture: RenderSceneFixtureV1) {
  validateRenderSceneFixture(fixture);
  const buffers = new Set<ArrayBuffer>();
  fixture.meshes.forEach((mesh) => {
    for (const view of [mesh.transform, mesh.positions, mesh.normals, mesh.colors, mesh.uvs, mesh.indices]) {
      if (view.buffer instanceof ArrayBuffer) buffers.add(view.buffer);
    }
  });
  return [...buffers];
}

export function createCanonicalRenderSceneFixture(): RenderSceneFixtureV1 {
  return {
    schema: RENDER_SCENE_FIXTURE_SCHEMA,
    fixtureId: "r1-canonical-triangle",
    animationTimeMs: 1_250,
    viewport: { width: 640, height: 430, pixelRatio: 1 },
    camera: {
      position: [0, 0, 2],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fieldOfViewDegrees: 60,
      near: 0.01,
      far: 10,
    },
    environment: {
      clearColor: [0.071, 0.125, 0.11, 1],
      ambientColor: [1, 1, 1],
      ambientIntensity: 1,
      fogColor: [0.071, 0.125, 0.11],
      fogNear: 8,
      fogFar: 10,
    },
    materials: [{
      id: "canonical-vertex-color",
      layer: "opaque",
      baseColor: [1, 1, 1, 1],
      emissiveColor: [0, 0, 0],
      roughness: 1,
      metalness: 0,
      alphaTest: 0,
      depthWrite: true,
      doubleSided: true,
    }],
    meshes: [{
      id: "canonical-triangle",
      materialId: "canonical-vertex-color",
      transform: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
      positions: new Float32Array([0, .72, 0, -.68, -.55, 0, .68, -.55, 0]),
      normals: new Int8Array([0, 0, 127, 0, 0, 127, 0, 0, 127]),
      colors: new Uint8Array([240, 171, 51, 255, 56, 158, 92, 255, 61, 122, 184, 255]),
      uvs: new Uint16Array([32768, 65535, 0, 0, 65535, 0]),
      indices: new Uint32Array([0, 1, 2]),
    }],
  };
}
