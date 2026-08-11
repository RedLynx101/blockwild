import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  RustEngineToolError,
  findRepositoryRoot,
  isDirectInvocation,
  parseCommandLine,
  validatePublishedArtifacts,
} from "./rust-engine-common.mjs";

const OPTIONS = {
  "repo-root": { type: "string", default: null },
  "public-dir": { type: "string", default: "public/engine" },
  "base-url": { type: "string", default: null },
  variant: { type: "string", default: null },
  runs: { type: "integer", default: 15 },
  "transfer-runs": { type: "integer", default: 30 },
  "transfer-sizes": { type: "string", default: "65536,1048576,4194304" },
  output: { type: "string", default: null },
  "heartbeat-export": { type: "string", default: null },
  "playwright-module": { type: "string", default: process.env.BLOCKWILD_PLAYWRIGHT_MODULE ?? null },
  "browser-executable": { type: "string", default: process.env.BLOCKWILD_BROWSER_EXECUTABLE ?? null },
  "timeout-ms": { type: "integer", default: 120_000 },
};

const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".wasm", "application/wasm"],
  [".ts", "text/plain; charset=utf-8"],
]);

function normalizeRuns(value, label, maximum = 500) {
  if (!Number.isInteger(value) || value < 1 || value > maximum) {
    throw new RustEngineToolError(`${label} must be an integer from 1 to ${maximum}.`);
  }
  return value;
}

export function parseTransferSizes(value) {
  const sizes = value.split(",").map((entry) => Number.parseInt(entry.trim(), 10));
  if (sizes.length === 0 || sizes.some((size) => !Number.isInteger(size) || size < 1 || size > 64 * 1024 * 1024)) {
    throw new RustEngineToolError("--transfer-sizes must contain comma-separated byte counts between 1 and 67108864.");
  }
  return [...new Set(sizes)].sort((left, right) => left - right);
}

export function selectBrowserArtifact(verification, requestedVariant) {
  const variant = requestedVariant ?? verification.index.defaultVariant;
  const artifact = verification.artifacts.find((candidate) => candidate.variant === variant);
  if (!artifact) {
    throw new RustEngineToolError(
      `Rust engine variant ${variant} is unavailable. Published variants: ${verification.artifacts.map((entry) => entry.variant).join(", ")}.`,
    );
  }
  const wasm = artifact.files.find((file) => file.role === "wasm");
  const glue = artifact.files.find((file) => file.role === "glue");
  if (!wasm || !glue) throw new RustEngineToolError(`Rust engine variant ${variant} is missing browser glue or Wasm.`);
  return { variant, artifact, wasm, glue };
}

function contentType(filePath) {
  if (filePath.endsWith(".d.ts")) return "text/plain; charset=utf-8";
  return MIME_TYPES.get(path.extname(filePath).toLowerCase()) ?? "application/octet-stream";
}

async function startStaticServer(publicRoot) {
  const root = path.resolve(publicRoot);
  const server = createServer((request, response) => {
    try {
      const requestUrl = new URL(request.url ?? "/", "http://127.0.0.1");
      if (requestUrl.pathname === "/__rust_engine_benchmark__") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
        response.end("<!doctype html><meta charset=utf-8><link rel=icon href=data:,><title>Blockwild Rust Engine Benchmark</title><main>benchmark</main>");
        return;
      }
      const decoded = decodeURIComponent(requestUrl.pathname).replace(/^\/+/, "");
      const candidate = path.resolve(root, decoded);
      if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }
      if (!existsSync(candidate) || !statSync(candidate).isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }
      const immutable = /^engine\/[a-f0-9]{64}\//.test(decoded);
      response.writeHead(200, {
        "Content-Type": contentType(candidate),
        "Cache-Control": immutable ? "public, max-age=31536000, immutable" : "no-cache",
        "Cross-Origin-Resource-Policy": "same-origin",
      });
      response.end(readFileSync(candidate));
    } catch (error) {
      response.writeHead(500).end(error instanceof Error ? error.message : String(error));
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new RustEngineToolError("Benchmark HTTP server did not expose a TCP port.");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

function playwrightCandidates(explicitPath) {
  const candidates = [];
  if (explicitPath) candidates.push(explicitPath);
  candidates.push("playwright");
  const bundled = path.join(os.homedir(), ".codex", "skills", "develop-web-game", "scripts", "node_modules", "playwright", "index.mjs");
  if (existsSync(bundled)) candidates.push(bundled);
  return candidates;
}

async function loadPlaywright(explicitPath) {
  const failures = [];
  for (const candidate of playwrightCandidates(explicitPath)) {
    try {
      const specifier = path.isAbsolute(candidate) ? pathToFileURL(candidate).href : candidate;
      const playwrightModule = await import(specifier);
      if (playwrightModule.chromium) return { module: playwrightModule, source: candidate };
      failures.push(`${candidate}: no chromium export`);
    } catch (error) {
      failures.push(`${candidate}: ${error.code ?? error.message}`);
    }
  }
  throw new RustEngineToolError(
    "A local Playwright installation is required for browser measurement. Install it in the project or pass --playwright-module/ BLOCKWILD_PLAYWRIGHT_MODULE. This tool never downloads a browser or package.",
    { failures },
  );
}

function discoverBrowserExecutable(explicitPath) {
  if (explicitPath) {
    if (!existsSync(explicitPath)) throw new RustEngineToolError(`Browser executable does not exist: ${explicitPath}`);
    return explicitPath;
  }
  const candidates = process.platform === "win32" ? [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    path.join(process.env.LOCALAPPDATA ?? "", "Google", "Chrome", "Application", "chrome.exe"),
  ] : [
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  return candidates.find((candidate) => candidate && existsSync(candidate)) ?? null;
}

function benchmarkInBrowser() {
  return async (configuration) => {
    const summarize = (samples) => {
      const sorted = [...samples].sort((left, right) => left - right);
      const percentile = (fraction) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
      return {
        count: samples.length,
        averageMilliseconds: samples.reduce((total, value) => total + value, 0) / samples.length,
        p50Milliseconds: percentile(0.5),
        p95Milliseconds: percentile(0.95),
        p99Milliseconds: percentile(0.99),
        minimumMilliseconds: sorted[0],
        maximumMilliseconds: sorted[sorted.length - 1],
      };
    };
    const measure = async (operation) => {
      const startedAt = performance.now();
      const value = await operation();
      return { milliseconds: performance.now() - startedAt, value };
    };

    const fetchSamples = [];
    let wasmBytes;
    for (let index = 0; index < configuration.runs; index += 1) {
      const measured = await measure(async () => {
        const response = await fetch(`${configuration.wasmUrl}?fetch-run=${configuration.nonce}-${index}`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Wasm fetch failed with HTTP ${response.status}`);
        const contentType = (response.headers.get("content-type") ?? "").split(";", 1)[0].trim();
        if (contentType !== "application/wasm") throw new Error(`Expected application/wasm, received ${contentType || "no Content-Type"}`);
        return response.arrayBuffer();
      });
      fetchSamples.push(measured.milliseconds);
      wasmBytes = measured.value;
    }

    const compileSamples = [];
    let compiledModule;
    for (let index = 0; index < configuration.runs; index += 1) {
      const measured = await measure(() => WebAssembly.compile(wasmBytes.slice(0)));
      compileSamples.push(measured.milliseconds);
      compiledModule = measured.value;
    }

    const instantiateSamples = [];
    let glueExports;
    for (let index = 0; index < configuration.runs; index += 1) {
      const moduleUrl = `${configuration.glueUrl}?instantiate-run=${configuration.nonce}-${index}`;
      const measured = await measure(async () => {
        const glue = await import(moduleUrl);
        if (typeof glue.default !== "function") throw new Error("wasm-bindgen glue has no default initializer");
        await glue.default({ module_or_path: compiledModule });
        return glue;
      });
      instantiateSamples.push(measured.milliseconds);
      glueExports = measured.value;
    }

    const candidates = configuration.heartbeatExport
      ? [configuration.heartbeatExport]
      : ["blockwild_protocol_version", "engine_heartbeat", "heartbeat", "protocol_version", "wasm_heartbeat"];
    const heartbeatExport = candidates.find((candidate) => typeof glueExports[candidate] === "function");
    if (!heartbeatExport) throw new Error(`No zero-argument heartbeat export found. Checked: ${candidates.join(", ")}`);
    if (glueExports[heartbeatExport].length !== 0) throw new Error(`Heartbeat export ${heartbeatExport} must accept zero arguments.`);
    const heartbeatSamples = [];
    let heartbeatValue;
    for (let index = 0; index < Math.max(20, configuration.runs); index += 1) {
      const measured = await measure(() => glueExports[heartbeatExport]());
      heartbeatSamples.push(measured.milliseconds);
      heartbeatValue = typeof measured.value === "bigint" ? measured.value.toString() : measured.value;
    }

    const workerSource = `self.onmessage = (event) => { const { id, buffer } = event.data; self.postMessage({ id, buffer }, [buffer]); };`;
    const workerUrl = URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
    const worker = new Worker(workerUrl);
    const pending = new Map();
    worker.onmessage = (event) => {
      const entry = pending.get(event.data.id);
      if (!entry) return;
      pending.delete(event.data.id);
      clearTimeout(entry.timeout);
      entry.resolve(event.data.buffer);
    };
    worker.onerror = (event) => {
      for (const entry of pending.values()) {
        clearTimeout(entry.timeout);
        entry.reject(new Error(event.message || "Transfer worker failed"));
      }
      pending.clear();
    };
    const roundTrip = (id, buffer) => new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Transfer worker timed out for ${id}`));
      }, 5_000);
      pending.set(id, { resolve, reject, timeout });
      worker.postMessage({ id, buffer }, [buffer]);
    });
    const transfers = {};
    try {
      for (const size of configuration.transferSizes) {
        const samples = [];
        for (let index = 0; index < configuration.transferRuns; index += 1) {
          const input = new ArrayBuffer(size);
          new Uint8Array(input)[0] = index & 0xff;
          const measured = await measure(() => roundTrip(`${size}-${index}`, input));
          if (measured.value.byteLength !== size) throw new Error(`Transfer worker returned ${measured.value.byteLength} bytes for ${size}`);
          samples.push(measured.milliseconds);
        }
        transfers[String(size)] = summarize(samples);
      }
    } finally {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
    }

    return {
      environment: {
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        hardwareConcurrency: navigator.hardwareConcurrency,
        deviceMemoryGiB: navigator.deviceMemory ?? null,
        crossOriginIsolated,
        webAssemblyStreaming: typeof WebAssembly.instantiateStreaming === "function",
      },
      wasmBytes: wasmBytes.byteLength,
      fetch: summarize(fetchSamples),
      compile: summarize(compileSamples),
      instantiate: summarize(instantiateSamples),
      heartbeat: {
        export: heartbeatExport,
        value: heartbeatValue ?? null,
        ...summarize(heartbeatSamples),
      },
      transferableArrayBufferRoundTrip: transfers,
    };
  };
}

export async function benchmarkRustBrowser(argv = process.argv) {
  const options = parseCommandLine(argv, OPTIONS);
  if (!options.output) throw new RustEngineToolError("--output is required so every browser measurement is retained as JSON.");
  const runs = normalizeRuns(options.runs, "--runs");
  const transferRuns = normalizeRuns(options["transfer-runs"], "--transfer-runs", 2_000);
  const transferSizes = parseTransferSizes(options["transfer-sizes"]);
  const repositoryRoot = findRepositoryRoot(options["repo-root"] ?? process.cwd());
  const publicEngineDirectory = path.resolve(repositoryRoot, options["public-dir"]);
  const verification = validatePublishedArtifacts(publicEngineDirectory);
  const selected = selectBrowserArtifact(verification, options.variant);
  const { module: playwright, source: playwrightSource } = await loadPlaywright(options["playwright-module"]);
  const browserExecutable = discoverBrowserExecutable(options["browser-executable"]);
  let staticServer;
  let browser;
  const consoleErrors = [];
  try {
    const baseUrl = options["base-url"]
      ? new URL(options["base-url"]).href.replace(/\/$/, "")
      : (staticServer = await startStaticServer(path.join(repositoryRoot, "public"))).baseUrl;
    browser = await playwright.chromium.launch({
      headless: true,
      ...(browserExecutable ? { executablePath: browserExecutable } : {}),
    });
    const page = await browser.newPage();
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));
    const benchmarkPageUrl = options["base-url"]
      ? new URL("/wiki", baseUrl).href
      : `${baseUrl}/__rust_engine_benchmark__`;
    await page.goto(benchmarkPageUrl, { waitUntil: "load", timeout: options["timeout-ms"] });
    const prefix = new URL(`/engine/${selected.artifact.hash}/`, baseUrl).href.replace(/\/$/, "");
    const configuration = {
      runs,
      transferRuns,
      transferSizes,
      wasmUrl: `${prefix}/${selected.wasm.path}`,
      glueUrl: `${prefix}/${selected.glue.path}`,
      heartbeatExport: options["heartbeat-export"],
      nonce: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    };
    const browserResult = await page.evaluate(benchmarkInBrowser(), configuration);
    if (consoleErrors.length > 0) {
      throw new RustEngineToolError(`Browser benchmark emitted console errors: ${consoleErrors.join(" | ")}`);
    }
    const result = {
      schema: 1,
      benchmark: "blockwild-rust-browser-bootstrap-v1",
      createdAt: new Date().toISOString(),
      repositoryRoot,
      artifact: {
        variant: selected.variant,
        hash: selected.artifact.hash,
        wasm: selected.wasm.path,
        glue: selected.glue.path,
      },
      harness: {
        runs,
        transferRuns,
        transferSizes,
        playwrightSource,
        browserExecutable: browserExecutable ?? "playwright-managed",
        baseUrl,
        benchmarkPageUrl,
      },
      nodeEnvironment: {
        node: process.version,
        platform: process.platform,
        architecture: process.arch,
        cpu: os.cpus()[0]?.model ?? "unknown",
        logicalCpuCount: os.cpus().length,
        totalMemoryBytes: os.totalmem(),
      },
      browser: browserResult,
      consoleErrors,
    };
    const outputPath = path.resolve(repositoryRoot, options.output);
    mkdirSync(path.dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
    return { ...result, outputPath };
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (staticServer) await staticServer.close().catch(() => {});
  }
}

async function main() {
  try {
    process.stdout.write(`${JSON.stringify(await benchmarkRustBrowser(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Rust browser benchmark failed: ${error instanceof Error ? error.message : String(error)}\n`);
    if (error instanceof RustEngineToolError && error.details) process.stderr.write(`${JSON.stringify(error.details, null, 2)}\n`);
    process.exitCode = 1;
  }
}

if (isDirectInvocation(import.meta.url)) await main();
