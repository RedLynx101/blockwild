import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";
import { pruneRendererArtifacts, rendererArtifactDirectories, resolveRendererArtifactDirectory } from "./renderer-artifact-store.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = path.join(ROOT, "engine");
const PUBLIC = path.join(ROOT, "public", "renderer");
const WORK_ROOT = path.join(ROOT, "work", "hybrid-rust-migration", "renderer-r11");
const BINDGEN = path.join(WORK_ROOT, "wasm-bindgen");
const MATRIX_FIXTURES = path.join(WORK_ROOT, "published-fixtures");
const CHECK = process.argv.includes("--check");

function assertTaskDirectory(target) {
  const resolved = path.resolve(target);
  const relative = path.relative(WORK_ROOT, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`refusing recursive operation outside a child of ${WORK_ROOT}: ${resolved}`);
  }
  return resolved;
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}`);
}

async function filesUnder(root, prefix = "") {
  const output = [];
  for (const entry of await readdir(path.join(root, prefix), { withFileTypes: true })) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory()) output.push(...await filesUnder(root, relative));
    else if (entry.isFile()) output.push(relative.replaceAll("\\", "/"));
  }
  return output.sort();
}

async function digestFiles(root, files) {
  const hash = createHash("sha256");
  for (const relative of files) {
    const bytes = await readFile(path.join(root, relative));
    hash.update(relative); hash.update("\0"); hash.update(bytes);
  }
  return hash.digest("hex");
}

function compressedByteLengths(bytes) {
  return {
    gzipBytes: gzipSync(bytes, { level: 9 }).byteLength,
    brotliBytes: brotliCompressSync(bytes, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
    }).byteLength,
  };
}

async function validatePublishedFiles(root, records) {
  for (const record of records) {
    const published = await readFile(path.join(root, record.path));
    const actual = createHash("sha256").update(published).digest("hex");
    if (actual !== record.sha256 || published.byteLength !== record.bytes) throw new Error(`renderer artifact file drift: ${record.path}`);
    const compressed = compressedByteLengths(published);
    if (compressed.gzipBytes !== record.gzipBytes || compressed.brotliBytes !== record.brotliBytes) {
      throw new Error(`renderer artifact compression budget drift: ${record.path}`);
    }
  }
}

await mkdir(WORK_ROOT, { recursive: true });
await rm(assertTaskDirectory(BINDGEN), { recursive: true, force: true });
await rm(assertTaskDirectory(MATRIX_FIXTURES), { recursive: true, force: true });
await mkdir(BINDGEN, { recursive: true });
await mkdir(MATRIX_FIXTURES, { recursive: true });
run("cargo", ["build", "-p", "blockwild-render-web", "--target", "wasm32-unknown-unknown", "--release"], ENGINE);
run("wasm-bindgen", [
  path.join(ENGINE, "target", "wasm32-unknown-unknown", "release", "blockwild_render_web.wasm"),
  "--target", "web", "--out-dir", BINDGEN, "--out-name", "renderer",
], ROOT);
run("cargo", [
  "run", "--release", "-p", "blockwild-render", "--example", "r11_visual_matrix", "--",
  "../work/hybrid-rust-migration/renderer-r11/published-fixtures", "--fixtures-only",
], ENGINE);
await cp(path.join(ROOT, "tests", "fixtures", "rust-engine", "r11-renderer", "canonical-resources.bwrd"), path.join(BINDGEN, "canonical-resources.bwrd"));
await cp(path.join(ROOT, "tests", "fixtures", "rust-engine", "r11-renderer", "canonical-frame.bwrf"), path.join(BINDGEN, "canonical-frame.bwrf"));
await cp(path.join(MATRIX_FIXTURES, "live-resources.bwrd"), path.join(BINDGEN, "live-resources.bwrd"));
await cp(path.join(MATRIX_FIXTURES, "live-frame.bwrf"), path.join(BINDGEN, "live-frame.bwrf"));
for (const name of await readdir(MATRIX_FIXTURES)) {
  if (!/^(?:[a-z0-9-]+-(?:resources\.bwrd|frame\.bwrf)|matrix\.json)$/u.test(name)) continue;
  await cp(path.join(MATRIX_FIXTURES, name), path.join(BINDGEN, name));
}
const matrixManifest = JSON.parse(await readFile(path.join(MATRIX_FIXTURES, "matrix.json"), "utf8"));
if (matrixManifest.schema !== 1 || !Array.isArray(matrixManifest.scenes) || matrixManifest.scenes.length !== 7) {
  throw new Error("renderer visual matrix manifest is incomplete");
}
const matrixSceneNames = new Set();
const matrixScenes = matrixManifest.scenes.map((scene) => {
  if (typeof scene?.name !== "string" || !/^[a-z0-9-]+$/u.test(scene.name) || typeof scene.purpose !== "string") {
    throw new Error("renderer visual matrix scene identity is unsafe");
  }
  if (matrixSceneNames.has(scene.name)) throw new Error(`renderer visual matrix scene ${scene.name} is duplicated`);
  matrixSceneNames.add(scene.name);
  return scene;
});

const files = await filesUnder(BINDGEN);
const hash = await digestFiles(BINDGEN, files);
const artifactRoot = path.join(PUBLIC, hash);
const fileRecords = [];
for (const relative of files) {
  const source = path.join(BINDGEN, relative);
  const size = (await stat(source)).size;
  const bytes = await readFile(source);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  fileRecords.push({
    path: relative,
    role: relative === "renderer.js" ? "glue"
      : relative === "renderer_bg.wasm" ? "wasm"
        : relative.endsWith(".bwrd") ? "resource-fixture"
          : relative.endsWith(".bwrf") ? "frame-fixture"
            : "support",
    bytes: size,
    sha256,
    ...compressedByteLengths(bytes),
  });
}
const manifestPath = path.join(PUBLIC, "manifest.json");
const existing = JSON.parse(await readFile(manifestPath, "utf8"));
const bootFiles = new Set(["renderer.js", "renderer_bg.wasm", "live-resources.bwrd", "live-frame.bwrf"]);
const bootRecords = fileRecords.filter((record) => bootFiles.has(record.path));
const coldStartBudget = {
  rawBytes: bootRecords.reduce((total, record) => total + record.bytes, 0),
  gzipBytes: bootRecords.reduce((total, record) => total + record.gzipBytes, 0),
  brotliBytes: bootRecords.reduce((total, record) => total + record.brotliBytes, 0),
  files: [...bootFiles].sort(),
};
const next = {
  ...existing,
  runtime: {
    schema: 1,
    backend: "wgpu-webgpu",
    artifactHash: hash,
    directory: hash,
    module: `${hash}/renderer.js`,
    wasm: `${hash}/renderer_bg.wasm`,
    resourceFixture: `${hash}/canonical-resources.bwrd`,
    frameFixture: `${hash}/canonical-frame.bwrf`,
    liveResourceFixture: `${hash}/live-resources.bwrd`,
    liveFrameFixture: `${hash}/live-frame.bwrf`,
    visualMatrix: {
      manifest: `${hash}/matrix.json`,
      scenes: matrixScenes.map((scene) => ({
        name: scene.name,
        purpose: scene.purpose,
        resourceFixture: `${hash}/${scene.name}-resources.bwrd`,
        frameFixture: `${hash}/${scene.name}-frame.bwrf`,
      })),
    },
    coldStartBudget,
    files: fileRecords,
  },
};

const modelHash = next.current;
if (typeof modelHash !== "string" || !/^[a-f0-9]{64}$/u.test(modelHash)) throw new Error("renderer model manifest current hash is invalid");
if (next.artifact !== `/${modelHash}/models.bwm2`) throw new Error("renderer model artifact path is not canonical");
const modelRoot = resolveRendererArtifactDirectory(PUBLIC, modelHash);
const modelBytes = await readFile(path.join(modelRoot, "models.bwm2"));
if (modelBytes.byteLength !== next.byteLength || createHash("sha256").update(modelBytes).digest("hex") !== next.sha256) {
  throw new Error("renderer model catalog bytes do not match manifest");
}
const retained = new Set([modelHash, hash]);

if (CHECK) {
  if (JSON.stringify(existing.runtime) !== JSON.stringify(next.runtime)) throw new Error(`renderer artifact drift: manifest=${existing.runtime?.artifactHash ?? "missing"} build=${hash}`);
  await validatePublishedFiles(artifactRoot, fileRecords);
  const stale = (await rendererArtifactDirectories(PUBLIC)).filter((directory) => !retained.has(directory));
  if (stale.length) throw new Error(`stale renderer artifacts remain: ${stale.join(", ")}`);
  console.log(`rust_renderer_r11_check=ok hash=${hash} files=${files.length}`);
} else {
  await mkdir(artifactRoot, { recursive: true });
  for (const relative of files) {
    const destination = path.join(artifactRoot, relative);
    await mkdir(path.dirname(destination), { recursive: true });
    await cp(path.join(BINDGEN, relative), destination);
  }
  await writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
  await validatePublishedFiles(artifactRoot, fileRecords);
  const removed = await pruneRendererArtifacts(PUBLIC, retained);
  console.log(`rust_renderer_r11_publish=ok hash=${hash} files=${files.length} pruned=${removed.length} raw=${coldStartBudget.rawBytes} gzip=${coldStartBudget.gzipBytes} brotli=${coldStartBudget.brotliBytes}`);
}
