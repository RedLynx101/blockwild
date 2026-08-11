import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { TypeScriptCanonicalHasher } from "../app/game/rust-kernel-shadow.ts";
import type { ModelBox, ModelSpec } from "../app/game/model-specs.ts";
import { buildInspectionSpecs, type InspectionModelSpec, type RendererHierarchyNode } from "./render-models.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_ROOT = path.join(ROOT, "public", "renderer");
const SCHEMA = 2;
const MAGIC = new TextEncoder().encode("BWM2");
const MAX_MODELS = 4_096;
const MAX_NODES = 16_384;
const MAX_BYTES = 64 * 1024 * 1024;

const ANIMATION = Object.freeze({ bob: 1, spin: 2, flap: 4, sway: 8, pulse: 16 });

type CompiledNode = Readonly<{
  nodeId: number;
  parentNodeId: number;
  partTag: number;
  translation: readonly [number, number, number];
  rotation: readonly [number, number, number, number];
  scale: readonly [number, number, number];
  color: readonly [number, number, number, number];
  emissive: boolean;
  animationFlags: number;
}>;

type CompiledModel = Readonly<{
  modelId: string;
  label: string;
  category: number;
  groundY: number | null;
  nodes: readonly CompiledNode[];
}>;

class Writer {
  private readonly bytes: number[] = [];
  raw(value: Uint8Array | readonly number[]) { this.bytes.push(...value); }
  u8(value: number) { this.bytes.push(value & 0xff); }
  u16(value: number) { this.u8(value); this.u8(value >>> 8); }
  u32(value: number) { this.u16(value); this.u16(value >>> 16); }
  f32(value: number) {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, true);
    this.raw(new Uint8Array(buffer));
  }
  string(value: string) {
    const bytes = new TextEncoder().encode(value);
    this.u32(bytes.byteLength);
    this.raw(bytes);
  }
  finish() {
    if (this.bytes.length > MAX_BYTES) throw new RangeError("compiled renderer model catalog exceeds 64 MiB");
    return Uint8Array.from(this.bytes);
  }
}

function floatBits(value: number) {
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  view.setFloat32(0, value, true);
  return view.getUint32(0, true);
}

function colorRgba(color: ModelBox["color"], alpha = 255): readonly [number, number, number, number] {
  const parsed = typeof color === "number"
    ? color
    : Number.parseInt(color.startsWith("#") ? color.slice(1) : color, 16);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 0xffffff) {
    throw new TypeError(`invalid model color ${String(color)}`);
  }
  const numeric = parsed >>> 0;
  return [(numeric >>> 16) & 0xff, (numeric >>> 8) & 0xff, numeric & 0xff, alpha];
}

function quaternionFromEuler(rotation: readonly [number, number, number] | undefined): readonly [number, number, number, number] {
  const [x, y, z] = rotation ?? [0, 0, 0];
  const c1 = Math.cos(x / 2), c2 = Math.cos(y / 2), c3 = Math.cos(z / 2);
  const s1 = Math.sin(x / 2), s2 = Math.sin(y / 2), s3 = Math.sin(z / 2);
  return [
    Math.fround(s1 * c2 * c3 + c1 * s2 * s3),
    Math.fround(c1 * s2 * c3 - s1 * c2 * s3),
    Math.fround(c1 * c2 * s3 + s1 * s2 * c3),
    Math.fround(c1 * c2 * c3 - s1 * s2 * s3),
  ];
}

function partTag(part: string) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(part)) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  return hash & 0xffff;
}

function animationFlags(modelId: string, node: Pick<ModelBox, "part" | "id" | "label" | "emissive">) {
  const semantic = `${modelId} ${node.part} ${node.id} ${node.label ?? ""}`.toLowerCase();
  let flags = 0;
  if (/\b(wing|fin|flipper)\b/u.test(semantic)) flags |= ANIMATION.flap;
  if (/\b(tail|ear|antenna|antler|frond|leaf|vine|banner|whisker)\b/u.test(semantic)) flags |= ANIMATION.sway;
  if (/\b(glow|light|lantern|crystal|rune|flame|ember|spark)\b/u.test(semantic) || node.emissive) flags |= ANIMATION.pulse;
  if (/\b(orb|wheel|rotor|gear|halo)\b/u.test(semantic)) flags |= ANIMATION.spin;
  return flags;
}

function category(spec: ModelSpec) {
  if (spec.category === "mob") return 1;
  if (spec.category === "player") return 2;
  if (spec.category === "block") return 3;
  if (spec.category === "utility") return 4;
  return 0;
}

function hierarchySource(spec: InspectionModelSpec): readonly RendererHierarchyNode[] {
  if (spec.rendererHierarchy?.length) return spec.rendererHierarchy;
  return spec.boxes.map((box) => ({ ...box, rotation: box.rotation ?? [0, 0, 0], visible: true }));
}

function compileModel(spec: InspectionModelSpec): CompiledModel {
  if (!spec.id || !spec.label || spec.boxes.length === 0 || spec.boxes.length > MAX_NODES) {
    throw new RangeError(`model ${spec.id || "<unknown>"} has an invalid node count`);
  }
  const sourceNodes = hierarchySource(spec);
  if (sourceNodes.length === 0 || sourceNodes.length > MAX_NODES) throw new RangeError(`model ${spec.id} has an invalid renderer rig node count`);
  const sourceIds = new Map<string, number>();
  for (const [index, node] of sourceNodes.entries()) {
    if (!node.id || sourceIds.has(node.id)) throw new Error(`model ${spec.id} has duplicate renderer node '${node.id}'`);
    sourceIds.set(node.id, index + 1);
  }
  return Object.freeze({
    modelId: spec.id,
    label: spec.label,
    category: category(spec),
    groundY: spec.groundY === undefined ? null : Math.fround(spec.groundY),
    nodes: Object.freeze(sourceNodes.map((box, index) => {
      const parentId = "parentId" in box ? box.parentId : undefined;
      const parentNodeId = parentId ? sourceIds.get(parentId) : undefined;
      if (parentId && parentNodeId === undefined) throw new Error(`model ${spec.id} renderer node '${box.id}' has missing parent '${parentId}'`);
      if (parentNodeId !== undefined && parentNodeId >= index + 1) throw new Error(`model ${spec.id} renderer parent '${parentId}' must precede '${box.id}'`);
      return Object.freeze({
        nodeId: index + 1,
        parentNodeId: parentNodeId ?? 0,
        partTag: partTag(box.part),
        translation: box.position.map(Math.fround) as [number, number, number],
        rotation: quaternionFromEuler(box.rotation),
        scale: box.size.map(Math.fround) as [number, number, number],
        color: colorRgba(box.color, "visible" in box && !box.visible ? 0 : 255),
        emissive: Boolean(box.emissive),
        animationFlags: animationFlags(spec.id, box),
      });
    })),
  });
}

function catalogHash(models: readonly CompiledModel[]) {
  const hasher = new TypeScriptCanonicalHasher("blockwild.render.model-catalog.v2").writeU16(SCHEMA).writeU32(models.length);
  for (const model of models) {
    hasher.writeString(model.modelId).writeString(model.label).writeU16(model.category).writeU16(model.groundY === null ? 0 : 1);
    if (model.groundY !== null) hasher.writeU32(floatBits(model.groundY));
    hasher.writeU32(model.nodes.length);
    for (const node of model.nodes) {
      hasher.writeU32(node.nodeId).writeU32(node.parentNodeId).writeU16(node.partTag);
      for (const value of [...node.translation, ...node.rotation, ...node.scale]) hasher.writeU32(floatBits(value));
      hasher.writeBytes(Uint8Array.from(node.color)).writeU16(node.emissive ? 1 : 0).writeU32(node.animationFlags);
    }
  }
  return hasher.finish();
}

function encode(models: readonly CompiledModel[]) {
  const writer = new Writer();
  writer.raw(MAGIC);
  writer.u16(SCHEMA);
  writer.u32(models.length);
  for (const model of models) {
    writer.string(model.modelId);
    writer.string(model.label);
    writer.u8(model.category);
    writer.u8(model.groundY === null ? 0 : 1);
    if (model.groundY !== null) writer.f32(model.groundY);
    writer.u32(model.nodes.length);
    for (const node of model.nodes) {
      writer.u32(node.nodeId);
      writer.u32(node.parentNodeId);
      writer.u16(node.partTag);
      for (const value of [...node.translation, ...node.rotation, ...node.scale]) writer.f32(value);
      writer.raw(node.color);
      writer.u8(node.emissive ? 1 : 0);
      writer.u32(node.animationFlags);
    }
  }
  const hash = catalogHash(models);
  writer.raw(hash);
  return { bytes: writer.finish(), catalogHash: Buffer.from(hash).toString("hex") };
}

async function build() {
  const models = buildInspectionSpecs()
    .map(compileModel)
    .sort((left, right) => left.modelId < right.modelId ? -1 : left.modelId > right.modelId ? 1 : 0);
  if (models.length === 0 || models.length > MAX_MODELS) throw new RangeError("compiled model count is invalid");
  for (let index = 1; index < models.length; index += 1) {
    if (models[index - 1].modelId === models[index].modelId) throw new Error(`duplicate compiled model ${models[index].modelId}`);
  }
  const { bytes, catalogHash: canonicalHash } = encode(models);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  const manifest = {
    schema: SCHEMA,
    format: "blockwild-compiled-model-catalog-v2",
    current: checksum,
    artifact: `/${checksum}/models.bwm2`,
    sha256: checksum,
    catalogHash: canonicalHash,
    byteLength: bytes.byteLength,
    modelCount: models.length,
    nodeCount: models.reduce((total, model) => total + model.nodes.length, 0),
    source: "renderer-neutral model specs and offline production captures",
  } as const;
  return { bytes, checksum, manifest };
}

async function main() {
  const check = process.argv.includes("--check");
  const built = await build();
  const artifactDirectory = path.join(PUBLIC_ROOT, built.checksum);
  const artifactPath = path.join(artifactDirectory, "models.bwm2");
  const manifestPath = path.join(PUBLIC_ROOT, "manifest.json");
  const existingManifest: Record<string, unknown> = await readFile(manifestPath, "utf8")
    .then((value) => JSON.parse(value) as Record<string, unknown>)
    .catch(() => ({} as Record<string, unknown>));
  const manifest = { ...built.manifest, ...(existingManifest.runtime ? { runtime: existingManifest.runtime } : {}) };
  const manifestBytes = `${JSON.stringify(manifest, null, 2)}\n`;
  if (check) {
    const artifact = await readFile(artifactPath);
    const modelFieldsMatch = Object.entries(built.manifest).every(([key, value]) => JSON.stringify(existingManifest[key]) === JSON.stringify(value));
    if (!artifact.equals(Buffer.from(built.bytes)) || !modelFieldsMatch) {
      throw new Error("public renderer model catalog is stale; run compile-render-model-catalog.ts");
    }
  } else {
    await mkdir(artifactDirectory, { recursive: true });
    await Promise.all([
      writeFile(artifactPath, built.bytes),
      mkdir(PUBLIC_ROOT, { recursive: true }).then(() => writeFile(manifestPath, manifestBytes)),
    ]);
  }
  process.stdout.write(`${check ? "verified" : "compiled"} ${built.manifest.modelCount} models / ${built.manifest.nodeCount} nodes / ${built.bytes.byteLength} bytes / ${built.checksum}\n`);
}

await main();
