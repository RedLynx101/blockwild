/**
 * R10's renderer-neutral view of the offline-compiled Blockwild model catalog.
 *
 * The decoder intentionally verifies both the artifact SHA-256 and the
 * canonical BWM2 hash before exposing any model. It never imports Three.js or
 * reconstructs a model from a live scene graph.
 */

import { TypeScriptCanonicalHasher } from "./rust-kernel-shadow.ts";
import type {
  RenderGeometryV2,
  RenderMaterialV2,
  RenderResourceOperationV2,
  RenderTransformV2,
} from "./rust-render-extraction-v2.ts";

export const RENDER_ENTITY_MODEL_CATALOG_SCHEMA_R10 = 2 as const;
export const RENDER_ENTITY_MODEL_CATALOG_FORMAT_R10 = "blockwild-compiled-model-catalog-v2" as const;
export const RENDER_ENTITY_MODEL_CATALOG_MAX_BYTES_R10 = 64 * 1_048_576;
export const RENDER_ENTITY_MODEL_CATALOG_MAX_MODELS_R10 = 4_096;
export const RENDER_ENTITY_MODEL_MAX_NODES_R10 = 16_384;

const MAGIC = Uint8Array.of(0x42, 0x57, 0x4d, 0x32); // BWM2
const TEXT_DECODER = new TextDecoder("utf-8", { fatal: true });
const U64_MASK = BigInt("0xffffffffffffffff");

export type RenderEntityCompiledModelCategoryR10 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export type RenderEntityCompiledModelNodeR10 = Readonly<{
  nodeId: number;
  parentNodeId: number | null;
  partTag: number;
  transform: RenderTransformV2;
  colorRgba8: readonly [number, number, number, number];
  emissive: boolean;
  animationFlags: number;
}>;

export type RenderEntityCompiledModelR10 = Readonly<{
  modelId: string;
  label: string;
  category: RenderEntityCompiledModelCategoryR10;
  groundY: number | null;
  nodes: readonly RenderEntityCompiledModelNodeR10[];
}>;

export type RenderEntityModelCatalogManifestR10 = Readonly<{
  schema: 2;
  format: typeof RENDER_ENTITY_MODEL_CATALOG_FORMAT_R10;
  revision: bigint;
  current: string;
  sha256: string;
  catalogHash: string;
  byteLength: number;
  modelCount: number;
  nodeCount: number;
}>;

export type RenderEntityCompiledModelCatalogR10 = Readonly<{
  schema: 2;
  revision: bigint;
  contentSha256: string;
  catalogHashHex: string;
  byteLength: number;
  nodeCount: number;
  models: readonly RenderEntityCompiledModelR10[];
}>;

export type RenderEntityModelResourcesR10 = Readonly<{
  modelId: string;
  geometryId: bigint;
  operations: readonly RenderResourceOperationV2[];
  materialByPaletteKey: ReadonlyMap<string, bigint>;
}>;

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new TypeError(message);
}

function equalBytes(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

function toHex(bytes: Uint8Array) {
  return [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function fromHex(value: string) {
  invariant(value.length % 2 === 0 && /^[0-9a-f]+$/u.test(value), "hex value is invalid");
  return Uint8Array.from(value.match(/../gu)!.map((item) => Number.parseInt(item, 16)));
}

function normalizedSha256(value: string, label: string) {
  invariant(/^[0-9a-f]{64}$/u.test(value), `${label} is not a lowercase SHA-256 digest`);
  return value;
}

function finite(value: number, label: string) {
  invariant(Number.isFinite(value), `${label} is not finite`);
  return Math.fround(value);
}

function positiveScale(value: number, label: string) {
  const result = finite(value, label);
  invariant(result > 0, `${label} is not positive`);
  return result;
}

function validCatalogString(value: string, maximumBytes: number, label: string) {
  const length = new TextEncoder().encode(value).byteLength;
  invariant(length > 0 && length <= maximumBytes && !/\p{Cc}/u.test(value), `${label} is invalid`);
  return value;
}

class Reader {
  private readonly view: DataView;
  private cursor = 0;

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }

  take(length: number) {
    invariant(Number.isInteger(length) && length >= 0, "BWM2 read length is invalid");
    const end = this.cursor + length;
    invariant(Number.isSafeInteger(end) && end <= this.bytes.byteLength, "BWM2 catalog is truncated");
    const result = this.bytes.subarray(this.cursor, end);
    this.cursor = end;
    return result;
  }

  u8() { return this.take(1)[0]; }
  u16() { const value = this.view.getUint16(this.cursor, true); this.take(2); return value; }
  u32() { const value = this.view.getUint32(this.cursor, true); this.take(4); return value; }
  f32() { const value = this.view.getFloat32(this.cursor, true); this.take(4); return value; }

  count(maximum: number, label: string) {
    const value = this.u32();
    invariant(value <= maximum, `${label} exceeds its bound`);
    return value;
  }

  string(maximumBytes: number, label: string) {
    const length = this.count(maximumBytes, `${label} byte length`);
    let value: string;
    try {
      value = TEXT_DECODER.decode(this.take(length));
    } catch {
      throw new TypeError(`${label} is not UTF-8`);
    }
    return validCatalogString(value, maximumBytes, label);
  }

  done() {
    invariant(this.cursor === this.bytes.byteLength, "BWM2 catalog has trailing bytes");
  }
}

function f32Bits(value: number) {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, Math.fround(value), true);
  return view.getUint32(0, true);
}

function catalogCanonicalHash(models: readonly RenderEntityCompiledModelR10[]) {
  const hasher = new TypeScriptCanonicalHasher("blockwild.render.model-catalog.v2")
    .writeU16(RENDER_ENTITY_MODEL_CATALOG_SCHEMA_R10)
    .writeU32(models.length);
  for (const model of models) {
    hasher.writeString(model.modelId).writeString(model.label).writeU16(model.category)
      .writeU16(model.groundY === null ? 0 : 1);
    if (model.groundY !== null) hasher.writeU32(f32Bits(model.groundY));
    hasher.writeU32(model.nodes.length);
    for (const node of model.nodes) {
      hasher.writeU32(node.nodeId).writeU32(node.parentNodeId ?? 0).writeU16(node.partTag);
      for (const value of [
        ...node.transform.translation,
        ...node.transform.rotation,
        ...node.transform.scale,
      ]) hasher.writeU32(f32Bits(value));
      hasher.writeBytes(Uint8Array.from(node.colorRgba8)).writeU16(node.emissive ? 1 : 0)
        .writeU32(node.animationFlags);
    }
  }
  return hasher.finish();
}

async function sha256Hex(bytes: Uint8Array) {
  invariant(globalThis.crypto?.subtle !== undefined, "Web Crypto SHA-256 is unavailable");
  const copy = Uint8Array.from(bytes);
  return toHex(new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", copy)));
}

function decodeCatalogUnchecked(bytes: Uint8Array) {
  invariant(bytes.byteLength > 0 && bytes.byteLength <= RENDER_ENTITY_MODEL_CATALOG_MAX_BYTES_R10,
    "BWM2 catalog byte length is invalid");
  const reader = new Reader(bytes);
  invariant(equalBytes(reader.take(4), MAGIC), "BWM2 catalog magic is invalid");
  invariant(reader.u16() === RENDER_ENTITY_MODEL_CATALOG_SCHEMA_R10, "BWM2 catalog schema is unsupported");
  const modelCount = reader.count(RENDER_ENTITY_MODEL_CATALOG_MAX_MODELS_R10, "BWM2 model count");
  invariant(modelCount > 0, "BWM2 model catalog is empty");
  const models: RenderEntityCompiledModelR10[] = [];
  let previousModelId: string | null = null;
  let nodeCount = 0;
  for (let modelIndex = 0; modelIndex < modelCount; modelIndex += 1) {
    const modelId = reader.string(128, "BWM2 model id");
    invariant(previousModelId === null || previousModelId < modelId, "BWM2 models are not canonical and unique");
    previousModelId = modelId;
    const label = reader.string(192, "BWM2 model label");
    const category = reader.u8();
    invariant(category <= 8, "BWM2 model category is invalid");
    const groundFlag = reader.u8();
    invariant(groundFlag <= 1, "BWM2 ground flag is invalid");
    const groundY = groundFlag === 1 ? finite(reader.f32(), "BWM2 ground plane") : null;
    const modelNodeCount = reader.count(RENDER_ENTITY_MODEL_MAX_NODES_R10, "BWM2 model node count");
    invariant(modelNodeCount > 0, "BWM2 model has no nodes");
    nodeCount += modelNodeCount;
    invariant(Number.isSafeInteger(nodeCount), "BWM2 node total overflowed");
    const knownNodes = new Set<number>();
    const nodes: RenderEntityCompiledModelNodeR10[] = [];
    for (let nodeIndex = 0; nodeIndex < modelNodeCount; nodeIndex += 1) {
      const nodeId = reader.u32();
      const parentRaw = reader.u32();
      invariant(nodeId > 0 && !knownNodes.has(nodeId), "BWM2 model node id is invalid");
      invariant(parentRaw === 0 || knownNodes.has(parentRaw), "BWM2 node parent does not precede its child");
      knownNodes.add(nodeId);
      const partTag = reader.u16();
      const translation = Object.freeze([
        finite(reader.f32(), "BWM2 node translation"),
        finite(reader.f32(), "BWM2 node translation"),
        finite(reader.f32(), "BWM2 node translation"),
      ] as const);
      const rotation = Object.freeze([
        finite(reader.f32(), "BWM2 node rotation"),
        finite(reader.f32(), "BWM2 node rotation"),
        finite(reader.f32(), "BWM2 node rotation"),
        finite(reader.f32(), "BWM2 node rotation"),
      ] as const);
      const norm = rotation.reduce((sum, value) => sum + value * value, 0);
      invariant(norm >= 0.98 && norm <= 1.02, "BWM2 node rotation is not normalized");
      const scale = Object.freeze([
        positiveScale(reader.f32(), "BWM2 node scale"),
        positiveScale(reader.f32(), "BWM2 node scale"),
        positiveScale(reader.f32(), "BWM2 node scale"),
      ] as const);
      const color = reader.take(4);
      const emissive = reader.u8();
      invariant(emissive <= 1, "BWM2 emissive flag is invalid");
      nodes.push(Object.freeze({
        nodeId,
        parentNodeId: parentRaw === 0 ? null : parentRaw,
        partTag,
        transform: Object.freeze({ translation, rotation, scale }),
        colorRgba8: Object.freeze([color[0], color[1], color[2], color[3]] as const),
        emissive: emissive === 1,
        animationFlags: reader.u32(),
      }));
    }
    models.push(Object.freeze({
      modelId,
      label,
      category: category as RenderEntityCompiledModelCategoryR10,
      groundY,
      nodes: Object.freeze(nodes),
    }));
  }
  const catalogHash = Uint8Array.from(reader.take(16));
  reader.done();
  const computed = catalogCanonicalHash(models);
  invariant(equalBytes(catalogHash, computed), "BWM2 canonical catalog hash mismatch");
  return { models: Object.freeze(models), catalogHash, nodeCount };
}

export async function decodeRenderEntityModelCatalogR10(
  bytes: Uint8Array,
  manifest: RenderEntityModelCatalogManifestR10,
): Promise<RenderEntityCompiledModelCatalogR10> {
  invariant(manifest.schema === RENDER_ENTITY_MODEL_CATALOG_SCHEMA_R10, "model manifest schema is unsupported");
  invariant(manifest.format === RENDER_ENTITY_MODEL_CATALOG_FORMAT_R10, "model manifest format is unsupported");
  invariant(manifest.revision > BigInt(0) && manifest.revision <= BigInt(0xffff_ffff), "model manifest revision is invalid");
  invariant(Number.isInteger(manifest.byteLength) && manifest.byteLength === bytes.byteLength,
    "model manifest byte length does not match the artifact");
  invariant(Number.isInteger(manifest.modelCount) && manifest.modelCount > 0
    && manifest.modelCount <= RENDER_ENTITY_MODEL_CATALOG_MAX_MODELS_R10, "model manifest count is invalid");
  invariant(Number.isInteger(manifest.nodeCount) && manifest.nodeCount > 0, "model manifest node count is invalid");
  const current = normalizedSha256(manifest.current, "model manifest current hash");
  const expectedSha256 = normalizedSha256(manifest.sha256, "model manifest SHA-256");
  invariant(current === expectedSha256, "model manifest current and SHA-256 disagree");
  invariant(/^[0-9a-f]{32}$/u.test(manifest.catalogHash), "model manifest canonical hash is invalid");
  const actualSha256 = await sha256Hex(bytes);
  invariant(actualSha256 === expectedSha256, "model catalog SHA-256 mismatch");
  const decoded = decodeCatalogUnchecked(bytes);
  const catalogHashHex = toHex(decoded.catalogHash);
  invariant(catalogHashHex === manifest.catalogHash, "model manifest canonical hash mismatch");
  invariant(decoded.models.length === manifest.modelCount, "model manifest count does not match the artifact");
  invariant(decoded.nodeCount === manifest.nodeCount, "model manifest node count does not match the artifact");
  return Object.freeze({
    schema: 2,
    revision: manifest.revision,
    contentSha256: actualSha256,
    catalogHashHex,
    byteLength: bytes.byteLength,
    nodeCount: decoded.nodeCount,
    models: decoded.models,
  });
}

export function findRenderEntityCompiledModelR10(
  catalog: RenderEntityCompiledModelCatalogR10,
  modelId: string,
) {
  let low = 0;
  let high = catalog.models.length - 1;
  while (low <= high) {
    const middle = (low + high) >>> 1;
    const candidate = catalog.models[middle];
    if (candidate.modelId === modelId) return candidate;
    if (candidate.modelId < modelId) low = middle + 1;
    else high = middle - 1;
  }
  return null;
}

function canonicalU64(domain: string, ...values: readonly (string | number | bigint | Uint8Array)[]) {
  const hasher = new TypeScriptCanonicalHasher(domain);
  for (const value of values) {
    if (typeof value === "string") hasher.writeString(value);
    else if (typeof value === "bigint") hasher.writeU64(value);
    else if (typeof value === "number") hasher.writeU32(value);
    else hasher.writeBytes(value);
  }
  const bytes = hasher.finish();
  let result = BigInt(0);
  for (let index = 7; index >= 0; index -= 1) result = result << BigInt(8) | BigInt(bytes[index]);
  result &= U64_MASK;
  invariant(result !== BigInt(0), `${domain} produced the reserved zero id`);
  return result;
}

export function renderEntityStableIdR10(entityId: bigint, nodeId: number) {
  invariant(entityId > BigInt(0) && entityId <= U64_MASK, "entity id is invalid");
  invariant(Number.isInteger(nodeId) && nodeId > 0 && nodeId <= 0xffff_ffff, "model node id is invalid");
  return canonicalU64("blockwild.render.entity-instance.r10", entityId, nodeId);
}

export function renderEntityAttachmentStableIdR10(entityId: bigint, attachmentKey: string, nodeId: number) {
  invariant(entityId > BigInt(0) && entityId <= U64_MASK, "entity id is invalid");
  validCatalogString(attachmentKey, 256, "entity attachment key");
  invariant(Number.isInteger(nodeId) && nodeId >= 0 && nodeId <= 0xffff_ffff, "attachment node id is invalid");
  return canonicalU64("blockwild.render.entity-attachment.r10", entityId, attachmentKey, nodeId);
}

export function renderEntityPaletteKeyR10(color: readonly number[], emissive: boolean) {
  invariant(color.length === 4 && color.every((value) => Number.isInteger(value) && value >= 0 && value <= 255),
    "model palette color is invalid");
  return `${color[0].toString(16).padStart(2, "0")}${color[1].toString(16).padStart(2, "0")}${color[2].toString(16).padStart(2, "0")}${color[3].toString(16).padStart(2, "0")}:${emissive ? 1 : 0}`;
}

function unitBoxGeometry(id: bigint, revision: number): RenderGeometryV2 {
  const faces = [
    [[1, 0, 0], [[0.5, -0.5, -0.5], [0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]]],
    [[-1, 0, 0], [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5]]],
    [[0, 1, 0], [[-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5]]],
    [[0, -1, 0], [[-0.5, -0.5, 0.5], [0.5, -0.5, 0.5], [0.5, -0.5, -0.5], [-0.5, -0.5, -0.5]]],
    [[0, 0, 1], [[0.5, -0.5, 0.5], [-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5]]],
    [[0, 0, -1], [[-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [-0.5, 0.5, -0.5]]],
  ] as const;
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const lights: number[] = [];
  const emissions: number[] = [];
  const occlusions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  faces.forEach(([normal, corners], faceIndex) => {
    const base = faceIndex * 4;
    corners.forEach((position, cornerIndex) => {
      positions.push(...position);
      normals.push(...normal.map((value) => value * 127));
      colors.push(255, 255, 255);
      lights.push(255, 0, 0, 0);
      emissions.push(0);
      occlusions.push(255);
      uvs.push(...cornerIndex === 0 ? [0, 0] : cornerIndex === 1 ? [0xffff, 0]
        : cornerIndex === 2 ? [0xffff, 0xffff] : [0, 0xffff]);
    });
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return Object.freeze({
    id,
    revision,
    kind: 1,
    bounds: Object.freeze({
      minimum: Object.freeze([-0.5, -0.5, -0.5] as const),
      maximum: Object.freeze([0.5, 0.5, 0.5] as const),
    }),
    positions: Float32Array.from(positions),
    normals: Int8Array.from(normals),
    colors: Uint8Array.from(colors),
    lights: Uint8Array.from(lights),
    emissions: Uint8Array.from(emissions),
    occlusions: Uint8Array.from(occlusions),
    uvs: Uint16Array.from(uvs),
    indices: Uint32Array.from(indices),
  });
}

function materialForPalette(
  id: bigint,
  revision: number,
  color: readonly [number, number, number, number],
  emissive: boolean,
): RenderMaterialV2 {
  return Object.freeze({
    id,
    revision,
    shading: 1,
    blend: color[3] === 255 ? 0 : 2,
    baseColorRgba8: color,
    emissiveRgb8: Object.freeze([color[0], color[1], color[2]] as const),
    emissiveStrength: emissive ? 0.85 : 0,
    roughness: 0.82,
    metalness: 0,
    alphaCutoff: 0,
    atlasTile: null,
    doubleSided: false,
    depthWrite: color[3] === 255,
  });
}

export function compileRenderEntityModelResourcesR10(
  catalog: RenderEntityCompiledModelCatalogR10,
  model: RenderEntityCompiledModelR10,
): RenderEntityModelResourcesR10 {
  invariant(findRenderEntityCompiledModelR10(catalog, model.modelId) === model, "model does not belong to the supplied catalog");
  const revision = Number(catalog.revision);
  invariant(Number.isSafeInteger(revision) && revision > 0 && revision <= 0xffff_ffff, "catalog revision exceeds render resources");
  const catalogHash = fromHex(catalog.catalogHashHex);
  const geometryId = canonicalU64("blockwild.render.entity-geometry.r10", catalogHash, model.modelId);
  const palette = new Map<string, { color: readonly [number, number, number, number]; emissive: boolean }>();
  for (const node of model.nodes) {
    const key = renderEntityPaletteKeyR10(node.colorRgba8, node.emissive);
    if (!palette.has(key)) palette.set(key, { color: node.colorRgba8, emissive: node.emissive });
  }
  const materialByPaletteKey = new Map<string, bigint>();
  const operations: RenderResourceOperationV2[] = [{ kind: "upsert-geometry", geometry: unitBoxGeometry(geometryId, revision) }];
  for (const [key, value] of [...palette.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) {
    const id = canonicalU64("blockwild.render.entity-material.r10", catalogHash, model.modelId, key);
    invariant(id !== geometryId && ![...materialByPaletteKey.values()].includes(id), "model resource id collision");
    materialByPaletteKey.set(key, id);
    operations.push({ kind: "upsert-material", material: materialForPalette(id, revision, value.color, value.emissive) });
  }
  return Object.freeze({ modelId: model.modelId, geometryId, operations: Object.freeze(operations), materialByPaletteKey });
}
