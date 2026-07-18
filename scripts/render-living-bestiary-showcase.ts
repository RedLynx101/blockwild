import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import * as THREE from "three";
import {
  applyLivingBestiaryPose,
  createLivingBestiaryMobVisual,
  LIVING_BESTIARY_VISUAL_KINDS,
  type LivingBestiaryVisualKind,
} from "../app/game/living-bestiary-models";
import { MOB_DEFS } from "../app/game/mobs";

type ShowcasePhase = "before" | "after";
type ShowcaseBackground = "dark" | "transparent";
type ShowcaseCategory = "field" | "legendary" | "summon";

export type RenderableTriangle = Readonly<{
  vertices: readonly [THREE.Vector3, THREE.Vector3, THREE.Vector3];
  depth: number;
  color: string;
  opacity: number;
  glowing: boolean;
  meshName: string;
}>;

export type GeometryStats = Readonly<{
  meshes: number;
  triangles: number;
  transparentTriangles: number;
  glowingTriangles: number;
}>;

type CameraFrame = Readonly<{
  position: THREE.Vector3;
  forward: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
}>;

type TileGeometry = Readonly<{
  kind: LivingBestiaryVisualKind;
  category: ShowcaseCategory;
  triangles: readonly RenderableTriangle[];
  stats: GeometryStats;
}>;

type SheetOptions = Readonly<{
  kinds: readonly LivingBestiaryVisualKind[];
  phase: ShowcasePhase;
  background?: ShowcaseBackground;
  columns?: number;
  tileWidth?: number;
  tileHeight?: number;
  title: string;
  subtitle: string;
  modelModule?: LivingModelModule;
}>;

type LivingModelModule = Readonly<{
  createLivingBestiaryMobVisual: typeof createLivingBestiaryMobVisual;
  applyLivingBestiaryPose: typeof applyLivingBestiaryPose;
}>;

const CURRENT_MODEL_MODULE: LivingModelModule = Object.freeze({ createLivingBestiaryMobVisual, applyLivingBestiaryPose });

export type ShowcaseOutput = Readonly<{
  outputDirectory: string;
  sheets: readonly Readonly<{ name: string; svg: string; png: string; width: number; height: number }>[];
  totals: GeometryStats;
}>;

const LEGENDARY_KINDS = new Set<LivingBestiaryVisualKind>([
  "ilyr-virebloom", "thalassene", "orichalc", "varkesh-stormmane", "kharza", "sugarwake-sovereign",
]);
const SUMMON_KINDS = new Set<LivingBestiaryVisualKind>(["asterjaw", "vellum-warden", "choir-of-one", "glasswake-stag"]);
const DEFAULT_CAMERA_POSITION = new THREE.Vector3(5.4, 3.7, -7.2);
const DEFAULT_CAMERA_TARGET = new THREE.Vector3(0, 1, 0);
const LIGHT_DIRECTION = new THREE.Vector3(-.55, .92, -.64).normalize();

function xml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function numeric(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function categoryOf(kind: LivingBestiaryVisualKind): ShowcaseCategory {
  if (LEGENDARY_KINDS.has(kind)) return "legendary";
  if (SUMMON_KINDS.has(kind)) return "summon";
  return "field";
}

function hashKind(kind: LivingBestiaryVisualKind) {
  let hash = 2166136261;
  for (const code of kind) {
    hash ^= code.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function makeCameraFrame(position = DEFAULT_CAMERA_POSITION, target = DEFAULT_CAMERA_TARGET): CameraFrame {
  const forward = target.clone().sub(position).normalize();
  const right = forward.clone().cross(new THREE.Vector3(0, 1, 0)).normalize();
  const up = right.clone().cross(forward).normalize();
  return { position: position.clone(), forward, right, up };
}

function materialForOffset(mesh: THREE.Mesh, offset: number): THREE.Material | null {
  if (!Array.isArray(mesh.material)) return mesh.material.visible ? mesh.material : null;
  const group = mesh.geometry.groups.find((candidate) => offset >= candidate.start && offset < candidate.start + candidate.count);
  const material = mesh.material[group?.materialIndex ?? 0];
  return material?.visible ? material : null;
}

function srgbHex(color: THREE.Color) {
  const bounded = color.clone();
  bounded.setRGB(clamp(bounded.r, 0, 1), clamp(bounded.g, 0, 1), clamp(bounded.b, 0, 1));
  return `#${bounded.getHexString(THREE.SRGBColorSpace)}`;
}

function triangleColor(material: THREE.Material, normal: THREE.Vector3) {
  const source = "color" in material && material.color instanceof THREE.Color ? material.color.clone() : new THREE.Color(0xc7d4d8);
  const emissive = "emissive" in material && material.emissive instanceof THREE.Color ? material.emissive.clone() : new THREE.Color(0, 0, 0);
  const unlit = material instanceof THREE.MeshBasicMaterial;
  const diffuse = Math.max(0, normal.dot(LIGHT_DIRECTION));
  const shade = unlit ? 1 : .48 + diffuse * .58;
  source.multiplyScalar(shade);
  source.add(emissive.multiplyScalar(1.15));
  // A compact filmic shoulder keeps authored emissive colors bright without
  // turning pale materials into featureless white polygons.
  source.setRGB(
    1 - Math.exp(-source.r * 1.08),
    1 - Math.exp(-source.g * 1.08),
    1 - Math.exp(-source.b * 1.08),
  );
  return srgbHex(source);
}

function isGlowingMaterial(material: THREE.Material, meshName: string) {
  const emissive = "emissive" in material && material.emissive instanceof THREE.Color
    ? Math.max(material.emissive.r, material.emissive.g, material.emissive.b)
    : 0;
  return emissive > .025 || material instanceof THREE.MeshBasicMaterial || /glow|heart|spark|mote|star|note|eye|lumen|light|unwritten-page|shoreline/u.test(meshName);
}

/**
 * Extracts the actual posed BufferGeometry triangles from a Three.js hierarchy.
 * This deliberately does not substitute boxes or project bounding volumes: a
 * sphere, torus, cone, membrane, or future authored mesh retains its topology.
 */
export function extractRenderableTriangles(root: THREE.Object3D, camera = makeCameraFrame()) {
  root.updateMatrixWorld(true);
  const triangles: RenderableTriangle[] = [];
  let meshCount = 0;
  root.traverseVisible((object) => {
    if (!(object instanceof THREE.Mesh) || !(object.geometry instanceof THREE.BufferGeometry)) return;
    const mesh = object as THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>;
    const position = mesh.geometry.getAttribute("position");
    if (!position || position.count < 3) return;
    meshCount += 1;
    const normalAttribute = mesh.geometry.getAttribute("normal");
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const index = mesh.geometry.getIndex();
    const available = index?.count ?? position.count;
    const drawStart = Math.max(0, mesh.geometry.drawRange.start || 0);
    const drawEnd = Math.min(available, Number.isFinite(mesh.geometry.drawRange.count) ? drawStart + mesh.geometry.drawRange.count : available);
    for (let offset = drawStart; offset + 2 < drawEnd; offset += 3) {
      const material = materialForOffset(mesh, offset);
      if (!material || material.opacity <= 0 || material.colorWrite === false) continue;
      const ia = index ? index.getX(offset) : offset;
      const ib = index ? index.getX(offset + 1) : offset + 1;
      const ic = index ? index.getX(offset + 2) : offset + 2;
      const a = new THREE.Vector3().fromBufferAttribute(position, ia).applyMatrix4(mesh.matrixWorld);
      const b = new THREE.Vector3().fromBufferAttribute(position, ib).applyMatrix4(mesh.matrixWorld);
      const c = new THREE.Vector3().fromBufferAttribute(position, ic).applyMatrix4(mesh.matrixWorld);
      const geometricNormal = b.clone().sub(a).cross(c.clone().sub(a));
      if (geometricNormal.lengthSq() < 1e-12) continue;
      geometricNormal.normalize();
      const centroid = a.clone().add(b).add(c).multiplyScalar(1 / 3);
      const facing = geometricNormal.dot(camera.position.clone().sub(centroid));
      if (material.side === THREE.FrontSide && facing <= 0) continue;
      if (material.side === THREE.BackSide && facing >= 0) continue;
      if (material.side === THREE.BackSide) geometricNormal.negate();
      let shadeNormal = geometricNormal;
      if (normalAttribute) {
        const na = new THREE.Vector3().fromBufferAttribute(normalAttribute, ia).applyNormalMatrix(normalMatrix);
        const nb = new THREE.Vector3().fromBufferAttribute(normalAttribute, ib).applyNormalMatrix(normalMatrix);
        const nc = new THREE.Vector3().fromBufferAttribute(normalAttribute, ic).applyNormalMatrix(normalMatrix);
        shadeNormal = na.add(nb).add(nc).normalize();
        if (shadeNormal.dot(geometricNormal) < 0) shadeNormal.negate();
      }
      triangles.push({
        vertices: [a, b, c],
        depth: centroid.clone().sub(camera.position).dot(camera.forward),
        color: triangleColor(material, shadeNormal),
        opacity: clamp(material.opacity, 0, 1),
        glowing: isGlowingMaterial(material, mesh.name),
        meshName: mesh.name,
      });
    }
  });
  return {
    triangles: triangles.sort((left, right) => right.depth - left.depth),
    meshCount,
  } as const;
}

function createTileGeometry(kind: LivingBestiaryVisualKind, camera: CameraFrame, models = CURRENT_MODEL_MODULE): TileGeometry {
  const visual = models.createLivingBestiaryMobVisual(kind, hashKind(kind));
  const phase = hashKind(kind) % 997 / 997 * Math.PI * 2;
  models.applyLivingBestiaryPose(visual.visual, kind, 1.725 + phase, .38, .24);
  // Invisible travel tack remains invisible, matching ordinary field-guide
  // presentation. Every visible articulated child keeps its authored transform.
  const extracted = extractRenderableTriangles(visual.group, camera);
  const transparentTriangles = extracted.triangles.filter((triangle) => triangle.opacity < .999).length;
  const glowingTriangles = extracted.triangles.filter((triangle) => triangle.glowing).length;
  return {
    kind,
    category: categoryOf(kind),
    triangles: extracted.triangles,
    stats: {
      meshes: extracted.meshCount,
      triangles: extracted.triangles.length,
      transparentTriangles,
      glowingTriangles,
    },
  };
}

function categoryStyle(category: ShowcaseCategory) {
  if (category === "legendary") return { label: "LEGENDARY", color: "#f2bf62", wash: "#3b2d1e" };
  if (category === "summon") return { label: "SUMMON", color: "#c9a7ff", wash: "#2c2441" };
  return { label: "FIELD ROSTER", color: "#83d8a4", wash: "#1d342e" };
}

function projectedVertex(vertex: THREE.Vector3, camera: CameraFrame) {
  const relative = vertex.clone().sub(camera.position);
  return { x: relative.dot(camera.right), y: relative.dot(camera.up) };
}

function renderTile(tile: TileGeometry, camera: CameraFrame, x: number, y: number, width: number, height: number) {
  const projected = tile.triangles.flatMap((triangle) => triangle.vertices.map((vertex) => projectedVertex(vertex, camera)));
  const minX = Math.min(...projected.map((point) => point.x));
  const maxX = Math.max(...projected.map((point) => point.x));
  const minY = Math.min(...projected.map((point) => point.y));
  const maxY = Math.max(...projected.map((point) => point.y));
  const labelHeight = 76;
  const content = { x: x + 22, y: y + 16, width: width - 44, height: height - labelHeight - 24 };
  const modelWidth = Math.max(.001, maxX - minX);
  const modelHeight = Math.max(.001, maxY - minY);
  const scale = Math.min(content.width / modelWidth, content.height / modelHeight) * .91;
  const offsetX = content.x + content.width / 2 - (minX + maxX) / 2 * scale;
  const offsetY = content.y + content.height / 2 + (minY + maxY) / 2 * scale;
  const pointString = (triangle: RenderableTriangle) => triangle.vertices.map((vertex) => {
    const point = projectedVertex(vertex, camera);
    return `${(offsetX + point.x * scale).toFixed(2)},${(offsetY - point.y * scale).toFixed(2)}`;
  }).join(" ");
  const style = categoryStyle(tile.category);
  const glow = tile.triangles.filter((triangle) => triangle.glowing).map((triangle) =>
    `<polygon points="${pointString(triangle)}" fill="${triangle.color}" fill-opacity="${(.22 * triangle.opacity).toFixed(3)}"/>`,
  ).join("");
  const surfaces = tile.triangles.map((triangle) =>
    `<polygon points="${pointString(triangle)}" fill="${triangle.color}" fill-opacity="${triangle.opacity.toFixed(3)}"/>`,
  ).join("");
  const label = xml(MOB_DEFS[tile.kind].name);
  const slug = xml(tile.kind);
  const shadowWidth = clamp(modelWidth * scale * .72, width * .24, width * .72);
  return [
    `<g data-kind="${xml(tile.kind)}">`,
    `<rect x="${x + 4}" y="${y + 4}" width="${width - 8}" height="${height - 8}" rx="24" fill="url(#tile-bg)" stroke="#ffffff" stroke-opacity=".09"/>`,
    `<rect x="${x + 5}" y="${y + height - labelHeight - 5}" width="${width - 10}" height="${labelHeight}" rx="19" fill="${style.wash}" fill-opacity=".88"/>`,
    `<ellipse cx="${x + width / 2}" cy="${content.y + content.height - 3}" rx="${(shadowWidth / 2).toFixed(1)}" ry="${(shadowWidth * .095).toFixed(1)}" fill="#02090d" fill-opacity=".54" filter="url(#shadow-blur)"/>`,
    glow ? `<g filter="url(#geometry-glow)">${glow}</g>` : "",
    surfaces,
    `<rect x="${x + 20}" y="${y + height - 62}" width="104" height="20" rx="10" fill="${style.color}" fill-opacity=".15"/>`,
    `<text x="${x + 72}" y="${y + height - 47}" text-anchor="middle" font-size="10.5" font-weight="750" letter-spacing="1.2" fill="${style.color}">${style.label}</text>`,
    `<text x="${x + width - 18}" y="${y + height - 47}" text-anchor="end" font-size="9.5" fill="#aab9b7">${tile.stats.meshes} meshes · ${tile.stats.triangles} visible tris</text>`,
    `<text x="${x + 20}" y="${y + height - 21}" font-size="16" font-weight="680" fill="#f4f8f7">${label}</text>`,
    `<title>${label} — ${slug}</title>`,
    `</g>`,
  ].join("");
}

export function buildLivingBestiarySheet(options: SheetOptions) {
  const columns = Math.max(1, Math.floor(options.columns ?? 5));
  const tileWidth = Math.max(280, Math.floor(options.tileWidth ?? 390));
  const tileHeight = Math.max(280, Math.floor(options.tileHeight ?? 355));
  const headerHeight = 128;
  const rows = Math.ceil(options.kinds.length / columns);
  const width = columns * tileWidth;
  const height = headerHeight + rows * tileHeight + 18;
  const camera = makeCameraFrame();
  const tiles = options.kinds.map((kind) => createTileGeometry(kind, camera, options.modelModule));
  const background = options.background ?? "dark";
  const phaseLabel = options.phase.toUpperCase();
  const tileMarkup = tiles.map((tile, index) => renderTile(
    tile,
    camera,
    index % columns * tileWidth,
    headerHeight + Math.floor(index / columns) * tileHeight,
    tileWidth,
    tileHeight,
  )).join("");
  const totals = tiles.reduce<GeometryStats>((result, tile) => ({
    meshes: result.meshes + tile.stats.meshes,
    triangles: result.triangles + tile.stats.triangles,
    transparentTriangles: result.transparentTriangles + tile.stats.transparentTriangles,
    glowingTriangles: result.glowingTriangles + tile.stats.glowingTriangles,
  }), { meshes: 0, triangles: 0, transparentTriangles: 0, glowingTriangles: 0 });
  const svg = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<defs>`,
    `<linearGradient id="sheet-bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#071216"/><stop offset=".55" stop-color="#10262a"/><stop offset="1" stop-color="#0b1720"/></linearGradient>`,
    `<linearGradient id="tile-bg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#183238" stop-opacity=".88"/><stop offset="1" stop-color="#09161b" stop-opacity=".96"/></linearGradient>`,
    `<filter id="geometry-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="8"/></filter>`,
    `<filter id="shadow-blur" x="-35%" y="-100%" width="170%" height="300%"><feGaussianBlur stdDeviation="7"/></filter>`,
    `</defs>`,
    background === "dark" ? `<rect width="${width}" height="${height}" fill="url(#sheet-bg)"/>` : "",
    `<text x="32" y="44" font-size="12" font-weight="760" letter-spacing="2.4" fill="#83d8a4">BLOCKWILD · LIVING BESTIARY · ${phaseLabel}</text>`,
    `<text x="32" y="78" font-size="29" font-weight="720" fill="#f3f8f6">${xml(options.title)}</text>`,
    `<text x="32" y="105" font-size="13" fill="#a9bcba">${xml(options.subtitle)}</text>`,
    `<text x="${width - 32}" y="48" text-anchor="end" font-size="11" fill="#97aaa8">REAL BUFFERGEOMETRY · FIXED 3/4 POSE · DETERMINISTIC</text>`,
    `<text x="${width - 32}" y="73" text-anchor="end" font-size="11" fill="#97aaa8">${totals.meshes} meshes · ${totals.triangles} visible triangles · ${totals.transparentTriangles} transparent</text>`,
    tileMarkup,
    `</svg>`,
  ].join("");
  return { svg, width, height, totals, tiles } as const;
}

function parseArguments(argv: readonly string[]) {
  const valueAfter = (flag: string) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const phaseValue = valueAfter("--phase") ?? "after";
  if (phaseValue !== "before" && phaseValue !== "after") throw new Error(`--phase must be before or after; received ${phaseValue}`);
  const backgroundValue = valueAfter("--background") ?? "dark";
  if (backgroundValue !== "dark" && backgroundValue !== "transparent") throw new Error(`--background must be dark or transparent; received ${backgroundValue}`);
  return {
    phase: phaseValue as ShowcasePhase,
    background: backgroundValue as ShowcaseBackground,
    outDir: path.resolve(valueAfter("--out") ?? `output/living-bestiary-showcase/geometry-${phaseValue}`),
    columns: Math.floor(numeric(valueAfter("--columns"), 5)),
    modelModulePath: valueAfter("--model-module") ? path.resolve(valueAfter("--model-module")!) : undefined,
    sourceLabel: valueAfter("--source-label") ?? "working tree",
  };
}

export async function renderLivingBestiaryShowcase(options: Readonly<{
  outDir: string;
  phase: ShowcasePhase;
  background?: ShowcaseBackground;
  columns?: number;
  modelModule?: LivingModelModule;
  sourceLabel?: string;
}>): Promise<ShowcaseOutput> {
  await mkdir(options.outDir, { recursive: true });
  const fieldKinds = LIVING_BESTIARY_VISUAL_KINDS.filter((kind) => categoryOf(kind) === "field");
  const mythicKinds = LIVING_BESTIARY_VISUAL_KINDS.filter((kind) => categoryOf(kind) !== "field");
  const definitions = [
    {
      name: "field-roster",
      kinds: fieldKinds,
      title: "Field Roster",
      subtitle: "Twenty-seven ecology-led creatures, posed from their production rigs.",
    },
    {
      name: "mythics-and-summons",
      kinds: mythicKinds,
      title: "Legendary Creatures & Bound Summons",
      subtitle: "Six world-scale encounters and four other-realm companions, with transparent and luminous materials intact.",
    },
    {
      name: "all-creatures",
      kinds: LIVING_BESTIARY_VISUAL_KINDS,
      title: "The Living Bestiary Expansion",
      subtitle: "All thirty-seven added creatures rendered directly from the same authored Three.js geometry used in game.",
    },
  ] as const;
  const sheets: { name: string; svg: string; png: string; width: number; height: number }[] = [];
  let totals: GeometryStats = { meshes: 0, triangles: 0, transparentTriangles: 0, glowingTriangles: 0 };
  for (const definition of definitions) {
    const rendered = buildLivingBestiarySheet({
      kinds: definition.kinds,
      phase: options.phase,
      background: options.background,
      columns: options.columns,
      title: definition.title,
      subtitle: definition.subtitle,
      modelModule: options.modelModule,
    });
    const svgPath = path.join(options.outDir, `${definition.name}.svg`);
    const pngPath = path.join(options.outDir, `${definition.name}.png`);
    await writeFile(svgPath, rendered.svg, "utf8");
    await sharp(Buffer.from(rendered.svg)).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(pngPath);
    sheets.push({ name: definition.name, svg: svgPath, png: pngPath, width: rendered.width, height: rendered.height });
    if (definition.name === "all-creatures") totals = rendered.totals;
  }
  const manifestPath = path.join(options.outDir, "manifest.json");
  await writeFile(manifestPath, `${JSON.stringify({
    schema: 1,
    generatedBy: "scripts/render-living-bestiary-showcase.ts",
    phase: options.phase,
    background: options.background ?? "dark",
    camera: { position: DEFAULT_CAMERA_POSITION.toArray(), target: DEFAULT_CAMERA_TARGET.toArray(), projection: "orthographic three-quarter" },
    deterministicPose: true,
    modelSource: options.sourceLabel ?? "working tree",
    sourceKinds: LIVING_BESTIARY_VISUAL_KINDS,
    totals,
    sheets,
  }, null, 2)}\n`, "utf8");
  return { outputDirectory: options.outDir, sheets, totals };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const modelModule = options.modelModulePath
    ? await import(pathToFileURL(options.modelModulePath).href) as LivingModelModule
    : undefined;
  if (modelModule && (typeof modelModule.createLivingBestiaryMobVisual !== "function" || typeof modelModule.applyLivingBestiaryPose !== "function")) {
    throw new Error(`Model module ${options.modelModulePath} does not export the Living Bestiary visual factory and pose function.`);
  }
  const result = await renderLivingBestiaryShowcase({ ...options, modelModule });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) await main();
