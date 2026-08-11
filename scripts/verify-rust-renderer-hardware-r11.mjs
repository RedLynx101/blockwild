import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_RENDERER = path.join(ROOT, "public", "renderer");
const DEFAULT_OUTPUT = path.join(ROOT, "work", "hybrid-rust-migration", "renderer-hardware-r11");
const PROFILE_PREFIX = "blockwild-renderer-hardware-r11-";
const EDGE_CANDIDATES = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
];
const EDGE_GPU_FLAGS = [
  "--enable-gpu",
  "--enable-unsafe-webgpu",
  "--ignore-gpu-blocklist",
  "--force-high-performance-gpu",
  "--use-angle=d3d11",
];

function renderPassed(report) {
  return Boolean(report
    && typeof report === "object"
    && Number(report.visibleInstances) > 0
    && Number(report.drawCalls) > 0
    && Number(report.transparentDrawCalls) > 0
    && report.deviceLost !== true
    && typeof report.skipped !== "string");
}

/**
 * Fail-closed promotion evidence. This verifies a real hardware-backed browser
 * render, but deliberately does not claim that the production selector may be
 * promoted; full-game visual/performance gates remain separate.
 */
export function validateRendererHardwareEvidenceR11(evidence) {
  const checks = {
    secureContext: evidence?.browser?.secureContext === true,
    webGpu: evidence?.browser?.webGpu === true,
    offscreenCanvas: evidence?.browser?.offscreenCanvas === true,
    nonFallbackAdapter: evidence?.adapter?.available === true && evidence?.adapter?.isFallbackAdapter === false,
    publishedArtifact: /^[a-f0-9]{64}$/u.test(evidence?.artifact?.hash ?? "")
      && evidence?.artifact?.manifestBackend === "wgpu-webgpu"
      && evidence?.artifact?.loadedHash === evidence?.artifact?.hash,
    initialResourceApply: Number(evidence?.renderer?.initialResources?.applied) > 0,
    initialRender: renderPassed(evidence?.renderer?.initialFrame),
    resizedRender: evidence?.renderer?.resize?.width === 800
      && evidence?.renderer?.resize?.height === 450
      && renderPassed(evidence?.renderer?.resizedFrame),
    recoveryRequiresReplay: evidence?.renderer?.recovery?.recovered === true
      && evidence?.renderer?.recovery?.requiresResourceReplay === true,
    resourceReplay: Number(evidence?.renderer?.replayedResources?.applied) > 0,
    recoveredRender: renderPassed(evidence?.renderer?.recoveredFrame),
    fullscreenAttempted: evidence?.fullscreen?.attempted === true,
    cleanPageDiagnostics: Array.isArray(evidence?.diagnostics?.consoleErrors)
      && evidence.diagnostics.consoleErrors.length === 0
      && Array.isArray(evidence?.diagnostics?.pageErrors)
      && evidence.diagnostics.pageErrors.length === 0
      && Array.isArray(evidence?.diagnostics?.logErrors)
      && evidence.diagnostics.logErrors.length === 0,
    rendererReleased: evidence?.cleanup?.rendererReleased === true,
    processCleanup: evidence?.cleanup?.edgeStopped === true
      && evidence?.cleanup?.serverClosed === true
      && evidence?.cleanup?.profileRemoved === true,
  };
  return Object.freeze({
    schema: 1,
    pass: Object.values(checks).every(Boolean),
    checks: Object.freeze(checks),
    promotionAuthorized: false,
    promotionBlocker: "Normal-path full-game parity, supported-device conformance, and comparative performance gates remain open.",
  });
}

function harnessHtml() {
  return String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Blockwild Rust Renderer Hardware Gate</title>
<style>
  :root{color-scheme:dark;font:15px/1.45 ui-monospace,SFMono-Regular,Consolas,monospace;background:#07130f;color:#e7f7ee}
  body{margin:0;padding:24px;background:radial-gradient(circle at 72% 12%,#173e35 0,#07130f 46%);min-height:100vh;box-sizing:border-box}
  header{display:flex;align-items:center;justify-content:space-between;gap:20px;margin-bottom:16px}h1{margin:0;font:700 24px/1.2 system-ui,sans-serif}
  button{border:1px solid #5dd49a;background:#123f30;color:#effff6;border-radius:7px;padding:10px 13px;font:inherit;cursor:pointer}
  main{display:grid;grid-template-columns:minmax(0,2fr) minmax(320px,1fr);gap:18px}.panel{border:1px solid #2d5e4e;border-radius:12px;background:#0b1d17dd;box-shadow:0 16px 48px #0008;overflow:hidden}
  canvas{display:block;width:100%;height:auto;aspect-ratio:16/9;background:#10261f}.meta{padding:16px}.status{color:#6be1a7}.failed{color:#ff8d83}pre{white-space:pre-wrap;word-break:break-word;margin:0;font-size:12px;max-height:70vh;overflow:auto}
  @media(max-width:900px){main{grid-template-columns:1fr}}
</style></head><body>
<header><div><div>BLOCKWILD · R11 · PUBLISHED BWRD/BWRF</div><h1>Rust WebGPU hardware gate</h1></div><button id="fullscreen" type="button">Exercise fullscreen</button></header>
<main><section class="panel" id="surface"><canvas id="renderer" width="960" height="540"></canvas><div class="meta"><strong id="status" class="status">Starting published renderer…</strong></div></section><section class="panel meta"><pre id="evidence">pending</pre></section></main>
<script type="module">
const evidence = {
  schema: 1,
  complete: false,
  browser: { secureContext: isSecureContext, webGpu: Boolean(navigator.gpu), offscreenCanvas: typeof HTMLCanvasElement.prototype.transferControlToOffscreen === "function", userAgent: navigator.userAgent },
  adapter: { available: false, isFallbackAdapter: null, info: null },
  artifact: { hash: null, loadedHash: null, manifestBackend: null },
  renderer: {}, fullscreen: { supported: Boolean(document.fullscreenEnabled), attempted: false, granted: false, exited: false, error: null },
  diagnostics: { consoleErrors: [], pageErrors: [], logErrors: [] }, cleanup: { rendererReleased: false }, error: null,
};
let surface = null;
const status = document.querySelector("#status"), output = document.querySelector("#evidence"), canvas = document.querySelector("#renderer");
const show = () => { output.textContent = JSON.stringify(evidence, null, 2); };
window.__blockwildRendererHardwareEvidence = evidence;
window.__shutdownBlockwildRendererVerifier = () => {
  try { surface?.shutdown?.(); surface?.free?.(); evidence.cleanup.rendererReleased = true; }
  catch (error) { evidence.cleanup.releaseError = error?.message ?? String(error); }
  surface = null; show(); return evidence.cleanup;
};
window.addEventListener("error", event => { evidence.diagnostics.pageErrors.push(event.message || "window error"); show(); });
window.addEventListener("unhandledrejection", event => { evidence.diagnostics.pageErrors.push(event.reason?.message ?? String(event.reason)); show(); });
document.querySelector("#fullscreen").addEventListener("click", async () => {
  evidence.fullscreen.attempted = true;
  try {
    if (!document.fullscreenEnabled) throw new Error("Fullscreen API unavailable");
    await document.querySelector("#surface").requestFullscreen();
    evidence.fullscreen.granted = document.fullscreenElement !== null;
  } catch (error) { evidence.fullscreen.error = error?.message ?? String(error); }
  show();
});
document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && evidence.fullscreen.granted) evidence.fullscreen.exited = true; show(); });

const json = (value, label) => { try { return typeof value === "string" ? JSON.parse(value) : value; } catch { throw new Error(label + " returned invalid JSON"); } };
const requireResponse = async (url, kind) => { const response = await fetch(url, { cache: "no-store" }); if (!response.ok) throw new Error(kind + " returned HTTP " + response.status); return response; };
try {
  if (!navigator.gpu) throw new Error("navigator.gpu is unavailable");
  if (typeof canvas.transferControlToOffscreen !== "function") throw new Error("OffscreenCanvas transfer is unavailable");
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: "high-performance", forceFallbackAdapter: false });
  if (!adapter) throw new Error("WebGPU did not return a high-performance adapter");
  const info = adapter.info ?? {};
  const fallback = info.isFallbackAdapter ?? adapter.isFallbackAdapter ?? null;
  evidence.adapter = { available: true, isFallbackAdapter: fallback, info: { vendor: info.vendor ?? null, architecture: info.architecture ?? null, device: info.device ?? null, description: info.description ?? null, subgroupMinSize: info.subgroupMinSize ?? null, subgroupMaxSize: info.subgroupMaxSize ?? null } };
  if (fallback !== false) throw new Error("adapter fallback status is not explicitly false");
  const probeDevice = await adapter.requestDevice(); await probeDevice.queue.onSubmittedWorkDone(); probeDevice.destroy();

  const manifest = await requireResponse("/renderer/manifest.json", "renderer manifest").then(response => response.json());
  const runtime = manifest.runtime, hash = runtime?.artifactHash;
  if (runtime?.schema !== 1 || runtime.backend !== "wgpu-webgpu" || !/^[a-f0-9]{64}$/.test(hash ?? "")) throw new Error("published renderer manifest is invalid");
  for (const key of ["module", "wasm", "liveResourceFixture", "liveFrameFixture"]) {
    const value = runtime[key]; if (typeof value !== "string" || !value.startsWith(hash + "/") || value.includes("..") || value.includes("\\\\")) throw new Error("unsafe renderer manifest path: " + key);
  }
  evidence.artifact = { hash, loadedHash: hash, manifestBackend: runtime.backend };
  const moduleUrl = "/renderer/" + runtime.module, wasmUrl = "/renderer/" + runtime.wasm;
  const rendererModule = await import(moduleUrl);
  await rendererModule.default({ module_or_path: wasmUrl });
  const resources = new Uint8Array(await requireResponse("/renderer/" + runtime.liveResourceFixture, "live resources").then(response => response.arrayBuffer()));
  const frame = new Uint8Array(await requireResponse("/renderer/" + runtime.liveFrameFixture, "live frame").then(response => response.arrayBuffer()));
  const resizedFrame = new Uint8Array(await requireResponse("/generated/resized-frame.bwrf", "contract-derived resized frame").then(response => response.arrayBuffer()));
  surface = await rendererModule.create_blockwild_renderer(canvas.transferControlToOffscreen(), 960, 540);
  evidence.renderer.capabilities = json(surface.capabilities(), "capabilities");
  evidence.renderer.initialResources = json(surface.apply_resources(resources), "initial resources");
  evidence.renderer.initialFrame = json(surface.render_frame(frame), "initial frame");
  surface.resize(800, 450);
  evidence.renderer.resize = { width: 800, height: 450, frameSource: "published-live-frame-derived-through-extraction-v2" };
  evidence.renderer.resizedFrame = json(surface.render_frame(resizedFrame), "resized frame");
  evidence.renderer.recovery = json(await surface.recover(), "recovery");
  evidence.renderer.replayedResources = json(surface.apply_resources(resources), "replayed resources");
  evidence.renderer.recoveredFrame = json(surface.render_frame(frame), "recovered frame");
  evidence.complete = true; status.textContent = "Hardware renderer, resize, and recovery passed"; show();
} catch (error) {
  evidence.error = { message: error?.message ?? String(error), stack: error?.stack ?? null };
  evidence.complete = true; status.textContent = "Hardware gate failed"; status.className = "failed"; show();
}
</script></body></html>`;
}

function safeRendererPath(urlPath) {
  const decoded = decodeURIComponent(urlPath).replace(/^\/renderer\//u, "");
  const candidate = path.resolve(PUBLIC_RENDERER, decoded);
  const relative = path.relative(PUBLIC_RENDERER, candidate);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return candidate;
}

async function startServer() {
  const html = harnessHtml();
  const resizedFrame = await buildResizedFrameFixture();
  const server = createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
      if (pathname === "/" || pathname === "/renderer-hardware-r11") {
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" }); response.end(html); return;
      }
      if (pathname === "/favicon.ico") { response.writeHead(204).end(); return; }
      if (pathname === "/generated/resized-frame.bwrf") {
        response.writeHead(200, { "content-type": "application/octet-stream", "cache-control": "no-store" }); response.end(resizedFrame); return;
      }
      if (pathname.startsWith("/renderer/")) {
        const target = safeRendererPath(pathname);
        if (!target) { response.writeHead(403).end("forbidden"); return; }
        const bytes = await readFile(target);
        const contentType = target.endsWith(".wasm") ? "application/wasm"
          : target.endsWith(".js") ? "text/javascript; charset=utf-8"
            : target.endsWith(".json") ? "application/json; charset=utf-8" : "application/octet-stream";
        response.writeHead(200, { "content-type": contentType, "cache-control": "no-store" }); response.end(bytes); return;
      }
      response.writeHead(404).end("not found");
    } catch (error) { response.writeHead(500).end(error instanceof Error ? error.message : String(error)); }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("renderer verifier server did not bind a TCP port");
  return { server, url: `http://127.0.0.1:${address.port}/renderer-hardware-r11` };
}

async function buildResizedFrameFixture() {
  const manifest = JSON.parse(await readFile(path.join(PUBLIC_RENDERER, "manifest.json"), "utf8"));
  const runtime = manifest.runtime;
  if (runtime?.schema !== 1 || runtime.backend !== "wgpu-webgpu" || typeof runtime.liveFrameFixture !== "string") {
    throw new Error("published renderer manifest cannot supply the resize fixture");
  }
  const sourcePath = safeRendererPath(`/renderer/${runtime.liveFrameFixture}`);
  if (!sourcePath) throw new Error("published live frame path escaped the renderer store");
  const { tsImport } = await import("tsx/esm/api");
  const contract = await tsImport(pathToFileURL(path.join(ROOT, "app", "game", "rust-render-extraction-v2.ts")).href, import.meta.url);
  const base = contract.decodeRenderFrameV2(new Uint8Array(await readFile(sourcePath)));
  const resized = contract.createRenderFrameV2({
    epoch: base.epoch,
    frameSequence: base.frameSequence + BigInt(1),
    simulationTick: base.simulationTick,
    animationTimeMicros: base.animationTimeMicros,
    resourceRevision: base.resourceRevision,
    camera: { ...base.camera, viewport: [800, 450] },
    environment: base.environment,
    instances: base.instances,
    particles: base.particles,
  });
  return contract.encodeRenderFrameV2(resized);
}

async function closeServer(server) {
  if (!server) return true;
  await new Promise((resolve) => server.closeAllConnections?.() || resolve());
  if (server.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return !server.listening;
}

class CdpClient {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.events = new Map(); }
  async connect() {
    this.socket = new WebSocket(this.url);
    this.socket.addEventListener("message", event => this.receive(JSON.parse(String(event.data))));
    await new Promise((resolve, reject) => { this.socket.addEventListener("open", resolve, { once: true }); this.socket.addEventListener("error", reject, { once: true }); });
  }
  receive(message) {
    if (message.id) {
      const pending = this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(`${pending.method}: ${message.error.message}`)); else pending.resolve(message.result);
      return;
    }
    for (const listener of this.events.get(message.method) ?? []) listener(message.params ?? {});
  }
  on(method, listener) { const listeners = this.events.get(method) ?? []; listeners.push(listener); this.events.set(method, listeners); }
  send(method, params = {}) {
    const id = ++this.id;
    return new Promise((resolve, reject) => { this.pending.set(id, { method, resolve, reject }); this.socket.send(JSON.stringify({ id, method, params })); });
  }
  close() { try { this.socket?.close(); } catch {} }
}

async function waitForFile(file, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try { return await readFile(file, "utf8"); } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error(`timed out waiting for ${file}`);
}

async function withTimeout(promise, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs} ms`)), timeoutMs); })]);
  } finally { clearTimeout(timer); }
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text ?? "browser evaluation failed");
  return result.result?.value;
}

async function launchEdge(executable, profile, url, timeoutMs, headless) {
  const stderr = [];
  const child = spawn(executable, [
    headless ? "--headless=new" : "--start-maximized",
    "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-background-networking",
    // Playwright passes this for its local Chromium harness as well. The
    // verifier serves only a loopback page from an ephemeral owned profile.
    "--no-sandbox",
    ...EDGE_GPU_FLAGS, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"], windowsHide: headless });
  child.stderr?.on("data", chunk => { stderr.push(String(chunk)); if (stderr.join("").length > 65_536) stderr.splice(0, Math.max(1, stderr.length - 8)); });
  const activePort = (await waitForFile(path.join(profile, "DevToolsActivePort"), timeoutMs)).split(/\r?\n/u);
  const port = Number(activePort[0]);
  if (!Number.isInteger(port) || port <= 0) throw new Error("Edge DevToolsActivePort was invalid");
  const target = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`, { method: "PUT" }).then(response => {
    if (!response.ok) throw new Error(`Edge target creation returned HTTP ${response.status}`); return response.json();
  });
  if (typeof target.webSocketDebuggerUrl !== "string") throw new Error("Edge target did not expose a debugger URL");
  return { child, stderr, target };
}

async function stopOwnedEdge(child) {
  if (!child) return true;
  const pid = child.pid;
  if (child.exitCode === null && child.signalCode === null && pid) {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    else child.kill("SIGTERM");
  }
  if (child.exitCode === null && child.signalCode === null) {
    await Promise.race([new Promise(resolve => child.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 5_000))]);
  }
  child.stderr?.destroy(); child.stdout?.destroy(); child.unref();
  if (process.platform !== "win32" || !pid) return child.exitCode !== null || child.signalCode !== null;
  const remaining = spawnSync("tasklist", ["/FI", `PID eq ${pid}`, "/NH", "/FO", "CSV"], { encoding: "utf8", windowsHide: true });
  return !new RegExp(`"${pid}"`, "u").test(remaining.stdout ?? "");
}

async function removeOwnedProfile(profile) {
  const canonicalTemp = path.resolve(tmpdir());
  const canonicalProfile = path.resolve(profile);
  if (path.dirname(canonicalProfile) !== canonicalTemp || !path.basename(canonicalProfile).startsWith(PROFILE_PREFIX)) {
    throw new Error(`refusing to remove unowned browser profile ${canonicalProfile}`);
  }
  await rm(canonicalProfile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  return true;
}

async function resolveEdge(explicit) {
  const candidates = explicit ? [path.resolve(explicit)] : EDGE_CANDIDATES;
  for (const candidate of candidates) { try { await readFile(candidate); return candidate; } catch {} }
  throw new Error(`Microsoft Edge was not found; checked ${candidates.join(", ")}`);
}

function parseArgs(argv) {
  const options = { output: DEFAULT_OUTPUT, edge: null, timeoutMs: 60_000, headless: true };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--output") options.output = path.resolve(argv[++index]);
    else if (argument === "--edge") options.edge = argv[++index];
    else if (argument === "--timeout") options.timeoutMs = Number(argv[++index]);
    else if (argument === "--headed") options.headless = false;
    else if (argument === "--help") options.help = true;
    else throw new Error(`unknown argument ${argument}`);
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 10_000) throw new RangeError("--timeout must be at least 10000 ms");
  return options;
}

export async function runRendererHardwareVerifierR11(options) {
  const output = path.resolve(options.output ?? DEFAULT_OUTPUT);
  await mkdir(output, { recursive: true });
  const prefix = path.join(output, "edge-headless-d3d11-rust-renderer-r11");
  const profile = await mkdtemp(path.join(tmpdir(), PROFILE_PREFIX));
  const diagnostics = { consoleErrors: [], pageErrors: [], logErrors: [] };
  const cleanup = { rendererReleased: false, edgeStopped: false, serverClosed: false, profileRemoved: false };
  let server = null, edge = null, client = null, rawEvidence = null, screenshotBytes = null;
  try {
    const executable = await resolveEdge(options.edge);
    const started = await startServer(); server = started.server;
    edge = await launchEdge(executable, profile, started.url, options.timeoutMs, options.headless !== false);
    client = new CdpClient(edge.target.webSocketDebuggerUrl); await client.connect();
    client.on("Runtime.exceptionThrown", event => diagnostics.pageErrors.push(event.exceptionDetails?.exception?.description ?? event.exceptionDetails?.text ?? "runtime exception"));
    client.on("Runtime.consoleAPICalled", event => { if (["error", "assert"].includes(event.type)) diagnostics.consoleErrors.push(event.args?.map(value => value.value ?? value.description).join(" ") ?? event.type); });
    client.on("Log.entryAdded", event => { if (event.entry?.level === "error") diagnostics.logErrors.push(event.entry.text ?? "browser log error"); });
    await client.send("Runtime.enable"); await client.send("Page.enable"); await client.send("Log.enable");
    await withTimeout(evaluate(client, `new Promise(resolve => { const poll = () => window.__blockwildRendererHardwareEvidence?.complete ? resolve(window.__blockwildRendererHardwareEvidence) : setTimeout(poll, 50); poll(); })`), options.timeoutMs, "published renderer hardware run");

    const button = await evaluate(client, `(() => { const r = document.querySelector('#fullscreen').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; })()`);
    await client.send("Input.dispatchMouseEvent", { type: "mousePressed", x: button.x, y: button.y, button: "left", clickCount: 1 });
    await client.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: button.x, y: button.y, button: "left", clickCount: 1 });
    await evaluate(client, `new Promise(resolve => setTimeout(() => resolve(window.__blockwildRendererHardwareEvidence.fullscreen), 300))`);
    await client.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await client.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await evaluate(client, `new Promise(resolve => setTimeout(resolve, 200))`);
    screenshotBytes = Buffer.from((await client.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, fromSurface: true })).data, "base64");
    cleanup.rendererReleased = (await evaluate(client, `window.__shutdownBlockwildRendererVerifier()`))?.rendererReleased === true;
    rawEvidence = await evaluate(client, `window.__blockwildRendererHardwareEvidence`);
    rawEvidence.diagnostics = diagnostics;
  } catch (error) {
    rawEvidence ??= { schema: 1, complete: true, browser: {}, adapter: {}, artifact: {}, renderer: {}, fullscreen: { attempted: false }, diagnostics, cleanup, error: { message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : null } };
  } finally {
    if (client) { try { await Promise.race([client.send("Browser.close"), new Promise(resolve => setTimeout(resolve, 1_000))]); } catch {} }
    try { client?.close(); } catch {}
    cleanup.edgeStopped = await stopOwnedEdge(edge?.child);
    cleanup.serverClosed = await closeServer(server);
    try { cleanup.profileRemoved = await removeOwnedProfile(profile); } catch (error) { cleanup.profileError = error instanceof Error ? error.message : String(error); }
  }
  rawEvidence.cleanup = { ...rawEvidence.cleanup, ...cleanup };
  rawEvidence.process = { edgePid: edge?.child?.pid ?? null, flags: EDGE_GPU_FLAGS, stderrTail: edge?.stderr?.join("").slice(-8_192) ?? "" };
  rawEvidence.artifacts = { screenshot: `${prefix}.png`, json: `${prefix}.json`, text: `${prefix}.txt` };
  rawEvidence.gate = validateRendererHardwareEvidenceR11(rawEvidence);
  if (screenshotBytes) await writeFile(`${prefix}.png`, screenshotBytes);
  await writeFile(`${prefix}.json`, `${JSON.stringify(rawEvidence, null, 2)}\n`);
  const lines = [
    `rust_renderer_hardware_r11=${rawEvidence.gate.pass ? "pass" : "fail"}`,
    `artifact=${rawEvidence.artifact?.hash ?? "unavailable"}`,
    `adapter=${rawEvidence.renderer?.capabilities?.adapter ?? rawEvidence.adapter?.info?.description ?? "unavailable"}`,
    `fallback=${String(rawEvidence.adapter?.isFallbackAdapter ?? "unknown")}`,
    `initial_visible=${rawEvidence.renderer?.initialFrame?.visibleInstances ?? 0}`,
    `initial_culled=${rawEvidence.renderer?.initialFrame?.culledInstances ?? 0}`,
    `initial_draws=${rawEvidence.renderer?.initialFrame?.drawCalls ?? 0}`,
    `transparent_draws=${rawEvidence.renderer?.initialFrame?.transparentDrawCalls ?? 0}`,
    `recovery_requires_resource_replay=${String(rawEvidence.renderer?.recovery?.requiresResourceReplay === true)}`,
    `fullscreen=${rawEvidence.fullscreen?.granted ? "granted" : rawEvidence.fullscreen?.supported ? "declined" : "unsupported"}`,
    `clean_diagnostics=${String(rawEvidence.gate.checks.cleanPageDiagnostics)}`,
    `cleanup=${JSON.stringify(cleanup)}`,
    `promotion_authorized=false`,
  ];
  await writeFile(`${prefix}.txt`, `${lines.join("\n")}\n`);
  return rawEvidence;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/verify-rust-renderer-hardware-r11.mjs [--output DIR] [--edge PATH] [--timeout MS] [--headed]"); return;
  }
  const evidence = await runRendererHardwareVerifierR11(options);
  console.log(JSON.stringify({ pass: evidence.gate.pass, checks: evidence.gate.checks, artifacts: evidence.artifacts }));
  if (!evidence.gate.pass) process.exitCode = 1;
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) await main();
