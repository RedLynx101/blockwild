import {
  decodeRenderFrameV2,
  decodeRenderResourceBatchV2,
  encodeRenderFrameV2,
  encodeRenderResourceBatchV2,
  type RenderFrameV2,
  type RenderResourceBatchV2,
} from "./rust-render-extraction-v2.ts";
import type { RustRendererWorkerCommandR11, RustRendererWorkerEventR11 } from "./rust-renderer-worker-r11.ts";

type WorkerLikeR11 = Pick<Worker, "postMessage" | "terminate"> & {
  onmessage: ((event: MessageEvent<RustRendererWorkerEventR11>) => void) | null;
  onerror?: ((event: ErrorEvent) => void) | null;
};

export type RustRendererDiagnosticsR11 = Readonly<{
  state: "idle" | "starting" | "ready" | "recovering" | "failed" | "stopped";
  epoch: bigint;
  resourceRevision: bigint;
  submittedFrames: number;
  presentedFrames: number;
  droppedFrames: number;
  staleFrames: number;
  resourceBytes: number;
  frameBytes: number;
  replayedResourceBytes: number;
  latestCpuMicros: number | null;
  latestGpuMicros: number | null;
  backend: string | null;
  adapter: string | null;
  timestampQuerySupported: boolean;
  visibleInstances: number;
  culledInstances: number;
  drawCalls: number;
  transparentDrawCalls: number;
  geometryBytes: number;
  uploadedInstanceBytes: number;
  residentInstanceBytes: number;
  instanceBufferReallocations: number;
  skippedFrames: number;
  latestSkipReason: string | null;
  lastError: string | null;
}>;

type MutableDiagnosticsR11 = { -readonly [K in keyof RustRendererDiagnosticsR11]: RustRendererDiagnosticsR11[K] };
const MAX_REPLAY_BYTES_R11 = 256 * 1024 * 1024;
const MAX_REPLAY_PAGES_R11 = 65_536;

export type RustRendererArtifactR11 = Readonly<{
  hash: string;
  moduleUrl: string;
  wasmUrl: string;
  resourceFixtureUrl: string;
  frameFixtureUrl: string;
  liveResourceFixtureUrl: string;
  liveFrameFixtureUrl: string;
}>;

export async function loadRustRendererArtifactR11(options: Readonly<{
  fetcher?: typeof fetch;
  baseUrl?: string;
  signal?: AbortSignal;
}> = {}): Promise<RustRendererArtifactR11> {
  const fetcher = options.fetcher ?? fetch;
  const base = (options.baseUrl ?? "/renderer").replace(/\/+$/, "");
  const response = await fetcher(`${base}/manifest.json`, { cache: "no-store", signal: options.signal });
  if (!response.ok) throw new Error(`renderer manifest returned HTTP ${response.status}`);
  const manifest = await response.json() as Record<string, unknown>;
  const runtime = manifest.runtime as Record<string, unknown> | undefined;
  const hash = runtime?.artifactHash;
  if (runtime?.schema !== 1 || runtime.backend !== "wgpu-webgpu" || typeof hash !== "string" || !/^[a-f0-9]{64}$/.test(hash)) {
    throw new TypeError("renderer manifest has no valid WebGPU runtime");
  }
  const pathValue = (key: string) => {
    const value = runtime[key];
    if (typeof value !== "string" || !value.startsWith(`${hash}/`) || value.includes("\\") || value.split("/").some((part) => !part || part === "." || part === "..")) {
      throw new TypeError(`renderer manifest ${key} is not content-addressed safely`);
    }
    return `${base}/${value}`;
  };
  return Object.freeze({
    hash,
    moduleUrl: pathValue("module"),
    wasmUrl: pathValue("wasm"),
    resourceFixtureUrl: pathValue("resourceFixture"),
    frameFixtureUrl: pathValue("frameFixture"),
    liveResourceFixtureUrl: pathValue("liveResourceFixture"),
    liveFrameFixtureUrl: pathValue("liveFrameFixture"),
  });
}

export class RustRendererServiceR11 {
  private readonly replayPages = new Map<bigint, Uint8Array>();
  private inFlight = false;
  private pending: Readonly<{ sequence: bigint; bytes: Uint8Array }> | null = null;
  private pendingSize: Readonly<{ width: number; height: number }> | null = null;
  private sentResourceRevision = BigInt(0);
  private worker: WorkerLikeR11 | null = null;
  private diagnostics: MutableDiagnosticsR11 = {
    state: "idle", epoch: BigInt(0), resourceRevision: BigInt(0), submittedFrames: 0,
    presentedFrames: 0, droppedFrames: 0, staleFrames: 0, resourceBytes: 0, frameBytes: 0,
    replayedResourceBytes: 0, latestCpuMicros: null, latestGpuMicros: null,
    backend: null, adapter: null, timestampQuerySupported: false,
    visibleInstances: 0, culledInstances: 0, drawCalls: 0, transparentDrawCalls: 0,
    geometryBytes: 0, uploadedInstanceBytes: 0, residentInstanceBytes: 0,
    instanceBufferReallocations: 0, skippedFrames: 0, latestSkipReason: null, lastError: null,
  };

  constructor(private readonly createWorker: () => WorkerLikeR11 = () => new Worker(new URL("./rust-renderer-worker-r11.ts", import.meta.url), { type: "module", name: "blockwild-r11-renderer" })) {}

  start(canvas: OffscreenCanvas, artifact: Pick<RustRendererArtifactR11, "moduleUrl" | "wasmUrl">, epoch: bigint, width: number, height: number) {
    if (this.worker) throw new Error("renderer service is already started");
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new RangeError("renderer dimensions must be positive integers");
    this.worker = this.createWorker();
    this.worker.onmessage = (event) => this.handle(event.data);
    this.worker.onerror = (event) => {
      this.inFlight = false;
      this.diagnostics.state = "failed";
      this.diagnostics.lastError = `worker: ${event.message || "renderer worker crashed"}`;
    };
    this.diagnostics = { ...this.diagnostics, state: "starting", epoch, lastError: null };
    this.send({ type: "initialize", canvas, width, height, moduleUrl: artifact.moduleUrl, wasmUrl: artifact.wasmUrl, epoch }, [canvas]);
  }

  applyResources(value: RenderResourceBatchV2 | Uint8Array) {
    const batch = value instanceof Uint8Array ? decodeRenderResourceBatchV2(value) : value;
    const bytes = value instanceof Uint8Array ? value.slice() : encodeRenderResourceBatchV2(batch);
    if (batch.epoch !== this.diagnostics.epoch) throw new Error("renderer resource epoch does not match the active world");
    const expected = this.diagnostics.resourceRevision + BigInt(1);
    if (batch.revision !== expected) throw new Error(`renderer resource revision gap: expected ${expected}, received ${batch.revision}`);
    if (this.replayPages.size >= MAX_REPLAY_PAGES_R11 || this.diagnostics.resourceBytes + bytes.byteLength > MAX_REPLAY_BYTES_R11) {
      throw new RangeError("renderer resource replay budget exceeded");
    }
    this.replayPages.set(batch.revision, bytes.slice());
    this.diagnostics.resourceRevision = batch.revision;
    this.diagnostics.resourceBytes += bytes.byteLength;
    if (this.diagnostics.state === "ready") this.sendUnsentResources();
  }

  present(value: RenderFrameV2 | Uint8Array) {
    if (this.diagnostics.state === "failed" || this.diagnostics.state === "stopped") return false;
    const frame = value instanceof Uint8Array ? decodeRenderFrameV2(value) : value;
    const bytes = value instanceof Uint8Array ? value.slice() : encodeRenderFrameV2(frame);
    if (frame.epoch !== this.diagnostics.epoch || frame.resourceRevision > this.diagnostics.resourceRevision) {
      this.diagnostics.staleFrames += 1;
      return false;
    }
    this.diagnostics.submittedFrames += 1;
    this.diagnostics.frameBytes += bytes.byteLength;
    if (this.inFlight || this.diagnostics.state !== "ready") {
      if (this.pending) this.diagnostics.droppedFrames += 1;
      this.pending = { sequence: frame.frameSequence, bytes };
      return true;
    }
    this.sendFrame(frame.frameSequence, bytes);
    return true;
  }

  resize(width: number, height: number) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) throw new RangeError("renderer dimensions must be positive integers");
    this.pendingSize = { width, height };
    if (this.diagnostics.state === "ready") this.sendPendingSize();
  }

  requestRecovery(reason = "renderer recovery requested") {
    if (!this.worker) throw new Error("renderer service is not started");
    this.inFlight = false;
    this.diagnostics.state = "recovering";
    this.diagnostics.lastError = reason;
    this.send({ type: "recover" });
  }

  switchEpoch(epoch: bigint) {
    this.replayPages.clear(); this.pending = null; this.inFlight = false; this.sentResourceRevision = BigInt(0);
    this.diagnostics = { ...this.diagnostics, epoch, resourceRevision: BigInt(0), state: "recovering" };
    this.send({ type: "recover" });
  }

  stop() {
    if (!this.worker) return;
    this.send({ type: "shutdown" });
    this.worker.terminate(); this.worker = null; this.pending = null; this.pendingSize = null; this.inFlight = false; this.replayPages.clear(); this.sentResourceRevision = BigInt(0);
    this.diagnostics.state = "stopped";
  }

  snapshot(): RustRendererDiagnosticsR11 { return Object.freeze({ ...this.diagnostics }); }

  private handle(event: RustRendererWorkerEventR11) {
    if (event.type === "ready") {
      this.diagnostics.state = "ready";
      this.diagnostics.backend = event.backend;
      this.diagnostics.adapter = event.adapter;
      this.diagnostics.timestampQuerySupported = event.timestampQuerySupported;
      this.sendPendingSize(); this.sendUnsentResources(); this.flush();
    }
    else if (event.type === "frame-presented") {
      this.inFlight = false; this.diagnostics.presentedFrames += 1; this.diagnostics.latestCpuMicros = event.cpuMicros;
      this.diagnostics.latestGpuMicros = event.gpuMicros; this.diagnostics.visibleInstances = event.visibleInstances;
      this.diagnostics.culledInstances = event.culledInstances; this.diagnostics.drawCalls = event.drawCalls;
      this.diagnostics.transparentDrawCalls = event.transparentDrawCalls;
      this.diagnostics.geometryBytes = event.geometryBytes;
      this.diagnostics.uploadedInstanceBytes = event.instanceBytes;
      this.diagnostics.residentInstanceBytes = event.residentInstanceBytes;
      this.diagnostics.instanceBufferReallocations = event.instanceBufferReallocations;
      this.diagnostics.latestSkipReason = event.skippedReason;
      if (event.skippedReason) this.diagnostics.skippedFrames += 1;
      this.flush();
    } else if (event.type === "device-lost") {
      this.inFlight = false; this.diagnostics.state = "recovering"; this.diagnostics.lastError = event.reason; this.send({ type: "recover" });
    } else if (event.type === "replay-required") {
      this.diagnostics.state = "ready";
      this.sentResourceRevision = BigInt(0);
      this.sendUnsentResources(true);
      this.flush();
    } else if (event.type === "error") {
      this.inFlight = false; this.diagnostics.state = "failed"; this.diagnostics.lastError = `${event.operation}: ${event.message}`;
    }
  }

  private flush() {
    if (this.inFlight || this.diagnostics.state !== "ready" || !this.pending) return;
    const next = this.pending; this.pending = null; this.sendFrame(next.sequence, next.bytes);
  }

  private sendPendingSize() {
    if (!this.pendingSize) return;
    const size = this.pendingSize;
    this.pendingSize = null;
    this.send({ type: "resize", ...size });
  }

  private sendFrame(sequence: bigint, bytes: Uint8Array) {
    this.inFlight = true; this.transfer({ type: "frame", bytes: bytes.buffer as ArrayBuffer, sequence }, bytes);
  }

  private sendUnsentResources(replayed = false) {
    for (const [revision, page] of [...this.replayPages].sort(([left], [right]) => left < right ? -1 : 1)) {
      if (revision <= this.sentResourceRevision) continue;
      const copy = page.slice();
      if (replayed) this.diagnostics.replayedResourceBytes += copy.byteLength;
      this.transfer({ type: "resources", bytes: copy.buffer }, copy);
      this.sentResourceRevision = revision;
    }
  }

  private transfer(command: RustRendererWorkerCommandR11, bytes: Uint8Array) {
    if (bytes.byteOffset !== 0 || bytes.byteLength !== bytes.buffer.byteLength) {
      const copy = bytes.slice(); this.send({ ...command, bytes: copy.buffer } as RustRendererWorkerCommandR11, [copy.buffer]);
    } else this.send(command, [bytes.buffer as ArrayBuffer]);
  }

  private send(command: RustRendererWorkerCommandR11, transfer: Transferable[] = []) {
    if (!this.worker) throw new Error("renderer service is not started");
    this.worker.postMessage(command, transfer);
  }
}

export function supportsRustRendererWorkerR11(canvas: HTMLCanvasElement) {
  return typeof Worker !== "undefined" && typeof canvas.transferControlToOffscreen === "function" && typeof navigator !== "undefined" && "gpu" in navigator;
}
