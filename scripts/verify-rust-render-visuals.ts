import { spawnSync } from "node:child_process";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

type MatrixScene = Readonly<{
  name: string;
  purpose: string;
  width: number;
  height: number;
  instances: number;
  particles: number;
  drawCalls: number;
  culled: number;
  rgbaBytes: number;
  policy: Readonly<{ perChannelTolerance: number; maxMismatchedPixels: number }>;
}>;
type MatrixManifest = Readonly<{ schema: number; renderer: string; fixturesOnly: boolean; scenes: readonly MatrixScene[] }>;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = path.join(ROOT, "engine");
const WORK_ROOT = path.join(ROOT, "work", "hybrid-rust-migration", "renderer-r11");
const CURRENT = path.join(WORK_ROOT, "visual-matrix");
const BASELINES = path.join(ROOT, "tests", "fixtures", "rust-engine", "r11-renderer", "visual-baselines");
const UPDATE = process.argv.includes("--update");
const SKIP_RENDER = process.argv.includes("--skip-render");

function assertTaskChild(target: string) {
  const resolved = path.resolve(target);
  const relative = path.relative(WORK_ROOT, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`refusing recursive operation outside a child of ${WORK_ROOT}: ${resolved}`);
  }
  return resolved;
}

function run(command: string, args: readonly string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

if (!SKIP_RENDER) {
  await rm(assertTaskChild(CURRENT), { recursive: true, force: true });
  await mkdir(CURRENT, { recursive: true });
  run("cargo", ["run", "--release", "-p", "blockwild-render", "--example", "r11_visual_matrix", "--", "../work/hybrid-rust-migration/renderer-r11/visual-matrix"], ENGINE);
}

const manifest = JSON.parse(await readFile(path.join(CURRENT, "matrix.json"), "utf8")) as MatrixManifest;
if (manifest.schema !== 1 || manifest.renderer !== "blockwild-wgpu-r11" || manifest.fixturesOnly || manifest.scenes.length < 7) {
  throw new Error("renderer visual matrix manifest is not a complete R11 render");
}

await mkdir(BASELINES, { recursive: true });
const rendered: Array<{ scene: MatrixScene; png: Buffer }> = [];
const results: Array<Record<string, string | number | boolean>> = [];
for (const scene of manifest.scenes) {
  const rgba = await readFile(path.join(CURRENT, `${scene.name}.rgba`));
  const expected = scene.width * scene.height * 4;
  if (rgba.byteLength !== expected || scene.rgbaBytes !== expected) throw new Error(`${scene.name}: invalid RGBA byte length`);
  const png = await sharp(rgba, { raw: { width: scene.width, height: scene.height, channels: 4 } }).png({ compressionLevel: 9, adaptiveFiltering: true }).toBuffer();
  const currentPng = path.join(CURRENT, `${scene.name}.png`);
  await writeFile(currentPng, png);
  rendered.push({ scene, png });
  const baseline = path.join(BASELINES, `${scene.name}.png`);
  if (UPDATE) await cp(currentPng, baseline);
  const baselineRgba = await sharp(baseline).ensureAlpha().raw().toBuffer();
  if (baselineRgba.byteLength !== rgba.byteLength) throw new Error(`${scene.name}: baseline dimensions differ`);
  let mismatchedPixels = 0, maximumDelta = 0, totalDelta = 0;
  const channels = rgba.byteLength;
  for (let offset = 0; offset < channels; offset += 4) {
    let pixelMismatch = false;
    for (let channel = 0; channel < 4; channel += 1) {
      const delta = Math.abs(rgba[offset + channel]! - baselineRgba[offset + channel]!);
      maximumDelta = Math.max(maximumDelta, delta); totalDelta += delta;
      if (delta > scene.policy.perChannelTolerance) pixelMismatch = true;
    }
    if (pixelMismatch) mismatchedPixels += 1;
  }
  const passed = mismatchedPixels <= scene.policy.maxMismatchedPixels;
  results.push({
    scene: scene.name,
    passed,
    mismatchedPixels,
    maximumDelta,
    meanChannelDelta: Number((totalDelta / channels).toFixed(4)),
    perChannelTolerance: scene.policy.perChannelTolerance,
    maxMismatchedPixels: scene.policy.maxMismatchedPixels,
    instances: scene.instances,
    particles: scene.particles,
    drawCalls: scene.drawCalls,
  });
  if (!passed) throw new Error(`${scene.name}: ${mismatchedPixels} pixels exceeded tolerance; maximum ${scene.policy.maxMismatchedPixels}`);
}

const tileWidth = 480, tileHeight = 300, columns = 2;
const rows = Math.ceil(rendered.length / columns);
const contact = sharp({ create: { width: tileWidth * columns, height: tileHeight * rows, channels: 4, background: "#08110f" } });
const composites: sharp.OverlayOptions[] = [];
for (const [index, item] of rendered.entries()) {
  const left = (index % columns) * tileWidth, top = Math.floor(index / columns) * tileHeight;
  const image = await sharp(item.png).resize(tileWidth, 270, { fit: "cover" }).toBuffer();
  const label = Buffer.from(`<svg width="${tileWidth}" height="30"><rect width="100%" height="100%" fill="#101b17"/><text x="14" y="20" fill="#f0df9c" font-family="monospace" font-size="13">${escapeXml(item.scene.name)} / ${item.scene.instances} instances / ${item.scene.drawCalls} draws</text></svg>`);
  composites.push({ input: image, left, top }, { input: label, left, top: top + 270 });
}
if (rendered.length % columns !== 0) {
  const index = rendered.length, left = (index % columns) * tileWidth, top = Math.floor(index / columns) * tileHeight;
  const totalInstances = rendered.reduce((total, item) => total + item.scene.instances, 0);
  const totalDraws = rendered.reduce((total, item) => total + item.scene.drawCalls, 0);
  const summary = Buffer.from(`<svg width="${tileWidth}" height="${tileHeight}">
    <rect width="100%" height="100%" fill="#101b17"/>
    <text x="28" y="48" fill="#d9b955" font-family="monospace" font-size="13" letter-spacing="2">DETERMINISTIC WGPU MATRIX</text>
    <text x="28" y="92" fill="#f0e8cb" font-family="Georgia,serif" font-size="28">Renderer acceptance layer</text>
    <text x="28" y="128" fill="#9fb5a8" font-family="monospace" font-size="13">${rendered.length} scenes / ${totalInstances} instances / ${totalDraws} draws</text>
    <text x="28" y="164" fill="#c9d4cb" font-family="monospace" font-size="12">Terrain / creatures / players / items / props</text>
    <text x="28" y="184" fill="#c9d4cb" font-family="monospace" font-size="12">machines / vehicles / projectiles / effects</text>
    <line x1="28" y1="214" x2="452" y2="214" stroke="#43584a"/>
    <text x="28" y="244" fill="#f0b36a" font-family="monospace" font-size="11">MICRO-FIXTURE EVIDENCE, NOT PRODUCTION PROMOTION.</text>
    <text x="28" y="266" fill="#84978b" font-family="monospace" font-size="10">Live same-state oracle diffs remain a separate gate.</text>
  </svg>`);
  composites.push({ input: summary, left, top });
}
await contact.composite(composites).png().toFile(path.join(CURRENT, "visual-matrix-contact-sheet.png"));
await writeFile(path.join(CURRENT, "diff-report.json"), `${JSON.stringify({ schema: 1, update: UPDATE, scenes: results }, null, 2)}\n`);
console.log(`rust_renderer_visuals=ok scenes=${rendered.length} updated=${UPDATE} contact=${path.join(CURRENT, "visual-matrix-contact-sheet.png")}`);

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
