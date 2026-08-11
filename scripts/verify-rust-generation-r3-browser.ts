import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import {
  LEGACY_TERRAIN_CONTENT_HASH_V2,
  createGenerateChunkRequestV2,
  createGeneratedChunkV2,
  legacyTerrainGeneratorHashV2,
  stableTerrainGenerationJsonV2,
  type GenerateChunkRequestV2,
  type TerrainGenerationEditPair,
} from "../app/game/terrain-generation-contract.ts";
import { terrainGenerationChunksByteEqualV2 } from "../app/game/rust-terrain-generation-backend.ts";
import {
  decodeRustTerrainGenerationResultV2,
  encodeRustTerrainGenerationRequestV2,
  parseTerrainGenerationParityCertificateV2,
} from "../app/game/rust-terrain-generation-bridge.ts";
import { generateChunkWithLegacyOracleV2 } from "../app/game/rust-terrain-generation-legacy-oracle.ts";

type CorpusCase = Readonly<{
  id: string;
  seed: string;
  chunk: readonly [number, number];
  options?: Readonly<Record<string, unknown>>;
  edits?: readonly TerrainGenerationEditPair[];
}>;
type CorpusManifest = Readonly<{
  cases: readonly CorpusCase[];
  genericSweep: Readonly<{
    cases: number;
    seedModulo: number;
    xMultiplier: number;
    zMultiplier: number;
    coordinateModulus: number;
    coordinateOffset: number;
  }>;
}>;
type BrowserInitialization = Readonly<{
  certificate: number[];
  coldMilliseconds: number;
}>;
type BrowserGeneration = Readonly<{ result: number[]; duration: number }>;

const ROOT = path.resolve(import.meta.dirname, "..");
const WORK = path.join(ROOT, "work", "hybrid-rust-migration", "r3-generation");
const FIXTURE = path.join(ROOT, "engine", "target", "release", `blockwild-generation-fixture${process.platform === "win32" ? ".exe" : ""}`);

function percentile(values: readonly number[], fraction: number) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * fraction) - 1))] ?? 0;
}

function timingSummary(values: readonly number[]) {
  return {
    samples: values.length,
    mean: values.reduce((total, value) => total + value, 0) / Math.max(1, values.length),
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
  };
}

function expandedCases(manifest: CorpusManifest) {
  const generic = Array.from({ length: manifest.genericSweep.cases }, (_, index): CorpusCase => ({
    id: `generic-${index.toString().padStart(3, "0")}`,
    seed: `r3-v18-corpus-${index % manifest.genericSweep.seedModulo}`,
    chunk: [
      (Math.imul(index, manifest.genericSweep.xMultiplier) % manifest.genericSweep.coordinateModulus) - manifest.genericSweep.coordinateOffset,
      manifest.genericSweep.coordinateOffset - (Math.imul(index, manifest.genericSweep.zMultiplier) % manifest.genericSweep.coordinateModulus),
    ],
  }));
  return [...manifest.cases, ...generic];
}

function requestFor(entry: CorpusCase, taskId: number): GenerateChunkRequestV2 {
  const [cx, cz] = entry.chunk;
  const generationOptions = entry.options ?? {};
  const namespace = `terrain-v5|g18|${entry.seed}|${stableTerrainGenerationJsonV2(generationOptions)}|${cx},${cz}|${entry.edits?.length ? 1 : 0}`;
  return createGenerateChunkRequestV2({
    epoch: 1,
    taskId,
    revision: taskId,
    namespace,
    contentHash: LEGACY_TERRAIN_CONTENT_HASH_V2,
    generatorHash: legacyTerrainGeneratorHashV2(namespace),
    seedText: entry.seed,
    generationOptions,
    key: `${cx},${cz}`,
    cx,
    cz,
    edits: entry.edits ?? [],
  });
}

async function playwrightModule() {
  for (const candidate of [
    "playwright",
    path.join(os.homedir(), ".codex", "skills", "develop-web-game", "scripts", "node_modules", "playwright", "index.mjs"),
  ]) {
    try { return await import(candidate.startsWith("playwright") ? candidate : pathToFileURL(candidate).href); } catch { /* next */ }
  }
  throw new Error("A local Playwright runtime is required for the R3 browser audit");
}

function browserExecutable() {
  return [
    process.env.BLOCKWILD_BROWSER_EXECUTABLE,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    path.join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  ].find((candidate) => candidate && existsSync(candidate));
}

function writePacketBatch(packets: readonly Uint8Array[]) {
  const size = 4 + packets.reduce((total, packet) => total + 4 + packet.byteLength, 0);
  const result = new Uint8Array(size);
  const view = new DataView(result.buffer);
  view.setUint32(0, packets.length, true);
  let offset = 4;
  for (const packet of packets) {
    view.setUint32(offset, packet.byteLength, true);
    offset += 4;
    result.set(packet, offset);
    offset += packet.byteLength;
  }
  return result;
}

function readPacketBatch(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = view.getUint32(0, true);
  const results: Uint8Array[] = [];
  let offset = 4;
  for (let index = 0; index < count; index += 1) {
    const length = view.getUint32(offset, true);
    offset += 4;
    results.push(bytes.slice(offset, offset + length));
    offset += length;
  }
  if (offset !== bytes.byteLength) throw new Error("native batch result has trailing bytes");
  return results;
}

async function main() {
  const manifest = JSON.parse(await readFile(path.join(ROOT, "tests", "fixtures", "rust-engine", "r3", "promotion-corpus.json"), "utf8")) as CorpusManifest;
  const engineManifest = JSON.parse(await readFile(path.join(ROOT, "public", "engine", "manifest.json"), "utf8"));
  const artifactHash = engineManifest.artifacts[engineManifest.defaultVariant].hash as string;
  const artifact = path.join(ROOT, "public", "engine", artifactHash);
  const cases = expandedCases(manifest);
  const requests = cases.map((entry, index) => requestFor(entry, index + 1));
  const packets = requests.map(encodeRustTerrainGenerationRequestV2);

  const referenceDurations: number[] = [];
  const references = requests.map((request) => {
    const started = performance.now();
    const result = createGeneratedChunkV2(request, generateChunkWithLegacyOracleV2(request));
    referenceDurations.push(performance.now() - started);
    return result;
  });

  const server = createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (pathname === "/") {
      response.writeHead(200, { "content-type": "text/html", "cross-origin-opener-policy": "same-origin", "cross-origin-embedder-policy": "require-corp" });
      response.end("<!doctype html><title>Blockwild R3 generation audit</title><main id=ready>ready</main>");
      return;
    }
    const file = pathname === "/engine.js" ? "engine.js" : pathname === "/engine_bg.wasm" ? "engine_bg.wasm" : null;
    if (!file) { response.writeHead(404); response.end(); return; }
    const bytes = await readFile(path.join(artifact, file));
    response.writeHead(200, {
      "content-type": file.endsWith(".wasm") ? "application/wasm" : "text/javascript",
      "content-length": bytes.byteLength,
      "cross-origin-resource-policy": "same-origin",
      "cache-control": "no-store",
    });
    response.end(bytes);
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("R3 audit server did not bind a TCP port");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  const playwright = await playwrightModule();
  const browser = await playwright.chromium.launch({ headless: true, executablePath: browserExecutable(), args: ["--ignore-gpu-blocklist"] });
  let browserInitialization: BrowserInitialization;
  const browserDurations: number[] = [];
  try {
    const page = await browser.newPage();
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    const workerSource = `
        self.onmessage = async (event) => {
          if (event.data.kind === 'initialize') {
            const coldStarted = performance.now();
            const module = await import(event.data.baseUrl + '/engine.js?worker=' + Date.now());
            const wasm = new Uint8Array(await (await fetch(event.data.baseUrl + '/engine_bg.wasm', { cache: 'no-store' })).arrayBuffer());
            await module.default({ module_or_path: wasm });
            self.blockwildGenerationModule = module;
            self.postMessage({ id: event.data.id, certificate: Array.from(module.blockwild_generation_parity_certificate_v2()), coldMilliseconds: performance.now() - coldStarted });
          } else {
            const started = performance.now();
            const result = self.blockwildGenerationModule.blockwild_generate_chunk_v2(Uint8Array.from(event.data.packet));
            self.postMessage({ id: event.data.id, result: Array.from(result), duration: performance.now() - started });
          }
        };
      `;
    browserInitialization = await page.evaluate(`(async () => {
      const worker = new Worker(URL.createObjectURL(new Blob([${JSON.stringify(workerSource)}], { type: "text/javascript" })));
      const pending = new Map();
      worker.onmessage = (event) => pending.get(event.data.id)?.(event.data);
      let nextId = 1;
      const send = (payload) => new Promise((resolve) => {
        const id = nextId++;
        pending.set(id, (value) => { pending.delete(id); resolve(value); });
        worker.postMessage({ ...payload, id });
      });
      Object.assign(globalThis, { blockwildR3GenerationWorker: { send, terminate: () => worker.terminate() } });
      return await send({ kind: "initialize", baseUrl: ${JSON.stringify(baseUrl)} });
    })()`) as BrowserInitialization;
    const certificate = parseTerrainGenerationParityCertificateV2(Uint8Array.from(browserInitialization.certificate));
    if (!certificate.byteEqual || certificate.corpusCases !== cases.length) throw new Error("browser Worker rejected the promotion certificate");
    for (const [index, packet] of packets.entries()) {
      const generated = await page.evaluate(`globalThis.blockwildR3GenerationWorker.send({ kind: "generate", packet: ${JSON.stringify(Array.from(packet))} })`) as BrowserGeneration;
      browserDurations.push(generated.duration);
      const candidate = decodeRustTerrainGenerationResultV2(Uint8Array.from(generated.result), requests[index]);
      if (!terrainGenerationChunksByteEqualV2(references[index], candidate)) throw new Error(`${cases[index].id}: browser Worker result differs from TS oracle`);
    }
    await page.evaluate("globalThis.blockwildR3GenerationWorker.terminate()");
  } finally {
    await browser.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
  const certificate = parseTerrainGenerationParityCertificateV2(Uint8Array.from(browserInitialization.certificate));

  const releaseBuild = spawnSync("cargo", ["build", "--release", "-p", "blockwild-generation", "--bin", "blockwild-generation-fixture"], {
    cwd: path.join(ROOT, "engine"), encoding: "utf8", timeout: 300_000,
  });
  if (releaseBuild.status !== 0) throw new Error(releaseBuild.stderr || releaseBuild.stdout);
  await mkdir(WORK, { recursive: true });
  const input = path.join(WORK, "benchmark-requests.bin");
  const output = path.join(WORK, "benchmark-results.bin");
  await writeFile(input, writePacketBatch(packets));
  const native = spawnSync(FIXTURE, ["--packet-benchmark", input, output], { cwd: ROOT, encoding: "utf8", timeout: 300_000 });
  if (native.status !== 0) throw new Error(native.stderr || native.stdout);
  const nativeMetrics = JSON.parse(native.stdout.trim()) as Record<string, number> & { perCaseUs: number[] };
  const nativeResults = readPacketBatch(new Uint8Array(await readFile(output)));
  for (const [index, result] of nativeResults.entries()) {
    const candidate = decodeRustTerrainGenerationResultV2(result, requests[index]);
    if (!terrainGenerationChunksByteEqualV2(references[index], candidate)) throw new Error(`${cases[index].id}: native benchmark result differs from TS oracle`);
  }

  const wasmBytes = (await readFile(path.join(artifact, "engine_bg.wasm"))).byteLength;
  const jsBytes = (await readFile(path.join(artifact, "engine.js"))).byteLength;
  const result = {
    schema: 1,
    generatorVersion: 18,
    corpusCases: cases.length,
    certificate,
    artifactHash,
    transferredBytes: { wasm: wasmBytes, javascript: jsBytes, total: wasmBytes + jsBytes },
    timingMilliseconds: {
      typescriptOracle: timingSummary(referenceDurations),
      nativeRust: {
        samples: nativeMetrics.samples,
        cold: nativeMetrics.coldUs / 1_000,
        mean: nativeMetrics.warmMeanUs / 1_000,
        p50: nativeMetrics.warmP50Us / 1_000, p95: nativeMetrics.warmP95Us / 1_000, p99: nativeMetrics.warmP99Us / 1_000,
      },
      browserWorkerWasm: {
        coldImportInstantiate: browserInitialization.coldMilliseconds,
        ...timingSummary(browserDurations),
      },
      genericSweep: {
        typescriptOracle: timingSummary(referenceDurations.slice(manifest.cases.length)),
        nativeRust: timingSummary(nativeMetrics.perCaseUs.slice(manifest.cases.length).map((value) => value / 1_000)),
        browserWorkerWasm: timingSummary(browserDurations.slice(manifest.cases.length)),
      },
    },
    slowestCases: cases.map((entry, index) => ({
      id: entry.id,
      typescriptMilliseconds: referenceDurations[index],
      nativeMilliseconds: nativeMetrics.perCaseUs[index] / 1_000,
      browserWorkerMilliseconds: browserDurations[index],
    })).sort((left, right) => right.nativeMilliseconds - left.nativeMilliseconds).slice(0, 12),
    assertions: {
      exactTypeScriptNative: true,
      exactTypeScriptBrowserWorkerWasm: true,
      certificateFailClosed: true,
      workerConstructsChunkWorld: false,
    },
  };
  await writeFile(path.join(WORK, "browser-worker-performance.json"), `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

await main();
