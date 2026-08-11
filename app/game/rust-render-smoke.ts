/**
 * Browser-only diagnostics shared by the private engine lab.
 *
 * Nothing imports this module from the game shell. Keeping artifact discovery
 * and WebGPU setup here makes the R0 probes independently testable without
 * coupling them to the production renderer or its canvas.
 */

export const BLOCKWILD_R0_SMOKE_SHADER = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) color: vec3<f32>,
};

@vertex
fn vertex_main(@builtin(vertex_index) vertex_index: u32) -> VertexOutput {
  var positions = array<vec2<f32>, 3>(
    vec2<f32>(0.0, 0.72),
    vec2<f32>(-0.68, -0.55),
    vec2<f32>(0.68, -0.55),
  );
  var colors = array<vec3<f32>, 3>(
    vec3<f32>(0.94, 0.67, 0.20),
    vec3<f32>(0.22, 0.62, 0.36),
    vec3<f32>(0.24, 0.48, 0.72),
  );
  var output: VertexOutput;
  output.position = vec4<f32>(positions[vertex_index], 0.0, 1.0);
  output.color = colors[vertex_index];
  return output;
}

@fragment
fn fragment_main(input: VertexOutput) -> @location(0) vec4<f32> {
  return vec4<f32>(input.color, 1.0);
}
`;

export type PublishedRustArtifact = Readonly<{
  variant: string;
  hash: string;
  manifestUrl: string;
  moduleUrl: string;
  wasmUrl: string;
}>;

export type RustArtifactProbeReport = Readonly<{
  status: "ready" | "unavailable" | "invalid";
  variant: string | null;
  hash: string | null;
  manifestUrl: string | null;
  moduleUrl: string | null;
  wasmUrl: string | null;
  wasmBytes: number;
  fetchDurationMs: number | null;
  compileDurationMs: number | null;
  instantiateDurationMs: number | null;
  protocolVersion: number | null;
  schemaVersion: number | null;
  message: string;
}>;

export type PreparedRustArtifact = Readonly<{
  artifact: PublishedRustArtifact;
  compiledModule: WebAssembly.Module;
  report: RustArtifactProbeReport;
}>;

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
type Clock = () => number;

const HASH_PATTERN = /^[a-f0-9]{64}$/;

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readableError(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function normalizedBaseUrl(baseUrl: string) {
  return baseUrl.replace(/\/+$/, "");
}

function relativeArtifactPath(value: unknown, label: string) {
  if (typeof value !== "string" || !value || value.startsWith("/") || value.includes("\\")) {
    throw new TypeError(`${label} must be a non-empty relative URL path`);
  }
  const segments = value.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new TypeError(`${label} contains an unsafe path segment`);
  }
  return value;
}

export function selectPublishedRustArtifact(index: unknown, manifest: unknown, baseUrl = "/engine"): PublishedRustArtifact {
  const indexRecord = record(index);
  const artifacts = record(indexRecord?.artifacts);
  const defaultVariant = indexRecord?.defaultVariant;
  if (indexRecord?.schema !== 1 || !artifacts || typeof defaultVariant !== "string") {
    throw new TypeError("Rust artifact index is missing its schema, default variant, or artifacts map");
  }
  const entry = record(artifacts[defaultVariant]);
  if (!entry || typeof entry.hash !== "string" || !HASH_PATTERN.test(entry.hash)) {
    throw new TypeError(`Rust artifact variant ${defaultVariant} has no valid content hash`);
  }
  if (entry.directory !== entry.hash || entry.manifest !== `${entry.hash}/manifest.json`) {
    throw new TypeError(`Rust artifact variant ${defaultVariant} is not content-addressed canonically`);
  }

  const manifestRecord = record(manifest);
  if (
    manifestRecord?.schema !== 1
    || manifestRecord.variant !== defaultVariant
    || manifestRecord.artifactHash !== entry.hash
    || !Array.isArray(manifestRecord.files)
  ) {
    throw new TypeError(`Rust artifact manifest for ${defaultVariant} does not match its index entry`);
  }
  const files = manifestRecord.files.map(record);
  const glue = files.find((file) => file?.role === "glue" && typeof file.path === "string");
  const wasm = files.find((file) => file?.role === "wasm" && typeof file.path === "string");
  if (!glue || !wasm) throw new TypeError(`Rust artifact ${defaultVariant} requires one JavaScript glue file and one Wasm file`);

  const root = normalizedBaseUrl(baseUrl);
  const artifactRoot = `${root}/${entry.hash}`;
  return {
    variant: defaultVariant,
    hash: entry.hash,
    manifestUrl: `${artifactRoot}/manifest.json`,
    moduleUrl: `${artifactRoot}/${relativeArtifactPath(glue.path, "Rust glue path")}`,
    wasmUrl: `${artifactRoot}/${relativeArtifactPath(wasm.path, "Rust Wasm path")}`,
  };
}

async function fetchJson(fetcher: FetchLike, url: string, signal?: AbortSignal) {
  const response = await fetcher(url, { cache: "no-store", signal });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

export async function preparePublishedRustArtifact(options: Readonly<{
  fetcher?: FetchLike;
  now?: Clock;
  baseUrl?: string;
  signal?: AbortSignal;
}> = {}): Promise<PreparedRustArtifact> {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? (() => performance.now());
  const baseUrl = normalizedBaseUrl(options.baseUrl ?? "/engine");
  const startedAt = now();
  const index = await fetchJson(fetcher, `${baseUrl}/manifest.json`, options.signal);
  const indexRecord = record(index);
  const variant = typeof indexRecord?.defaultVariant === "string" ? indexRecord.defaultVariant : "";
  const artifactEntry = record(record(indexRecord?.artifacts)?.[variant]);
  const manifestPath = relativeArtifactPath(artifactEntry?.manifest, "Rust artifact manifest path");
  const manifest = await fetchJson(fetcher, `${baseUrl}/${manifestPath}`, options.signal);
  const artifact = selectPublishedRustArtifact(index, manifest, baseUrl);
  const wasmResponse = await fetcher(artifact.wasmUrl, { cache: "no-store", signal: options.signal });
  if (!wasmResponse.ok) throw new Error(`${artifact.wasmUrl} returned HTTP ${wasmResponse.status}`);
  const bytes = await wasmResponse.arrayBuffer();
  const fetchedAt = now();
  const compiledModule = await WebAssembly.compile(bytes);
  const compiledAt = now();
  return {
    artifact,
    compiledModule,
    report: {
      status: "ready",
      variant: artifact.variant,
      hash: artifact.hash,
      manifestUrl: artifact.manifestUrl,
      moduleUrl: artifact.moduleUrl,
      wasmUrl: artifact.wasmUrl,
      wasmBytes: bytes.byteLength,
      fetchDurationMs: Math.max(0, fetchedAt - startedAt),
      compileDurationMs: Math.max(0, compiledAt - fetchedAt),
      instantiateDurationMs: null,
      protocolVersion: null,
      schemaVersion: null,
      message: "Content-addressed artifact fetched and compiled.",
    },
  };
}

export async function instantiatePreparedRustArtifact(
  prepared: PreparedRustArtifact,
  options: Readonly<{
    importer?: (url: string) => Promise<unknown>;
    now?: Clock;
  }> = {},
): Promise<RustArtifactProbeReport> {
  const importer = options.importer ?? ((url: string) => import(/* webpackIgnore: true */ url) as Promise<unknown>);
  const now = options.now ?? (() => performance.now());
  const startedAt = now();
  const namespace = record(await importer(prepared.artifact.moduleUrl));
  if (!namespace || typeof namespace.default !== "function") {
    throw new TypeError("Rust artifact glue module has no default Wasm initializer");
  }
  await (namespace.default as (options: { module_or_path: WebAssembly.Module }) => Promise<unknown>)({
    module_or_path: prepared.compiledModule,
  });
  const protocol = namespace.blockwild_protocol_version;
  const schema = namespace.blockwild_schema_version;
  if (typeof protocol !== "function" || typeof schema !== "function") {
    throw new TypeError("Rust artifact does not expose protocol and schema version probes");
  }
  const protocolVersion = Number((protocol as () => unknown)());
  const schemaVersion = Number((schema as () => unknown)());
  return {
    ...prepared.report,
    instantiateDurationMs: Math.max(0, now() - startedAt),
    protocolVersion,
    schemaVersion,
    message: "Artifact fetched, compiled, instantiated, and version-probed.",
  };
}

export function unavailableArtifactReport(error: unknown): RustArtifactProbeReport {
  const message = readableError(error);
  const invalid = error instanceof TypeError || error instanceof WebAssembly.CompileError;
  return {
    status: invalid ? "invalid" : "unavailable",
    variant: null,
    hash: null,
    manifestUrl: null,
    moduleUrl: null,
    wasmUrl: null,
    wasmBytes: 0,
    fetchDurationMs: null,
    compileDurationMs: null,
    instantiateDurationMs: null,
    protocolVersion: null,
    schemaVersion: null,
    message,
  };
}

type GpuInfo = Readonly<{
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}>;

type GpuAdapter = {
  info?: GpuInfo;
  limits?: Record<string, number>;
  requestDevice(descriptor?: unknown): Promise<GpuDevice>;
};

type GpuCanvasContext = {
  configure(configuration: unknown): void;
  unconfigure?(): void;
  getCurrentTexture(): { createView(): unknown };
};

type GpuDevice = {
  lost: Promise<Readonly<{ reason?: string; message?: string }>>;
  queue: {
    submit(commandBuffers: unknown[]): void;
    onSubmittedWorkDone?(): Promise<void>;
  };
  limits?: Record<string, number>;
  createShaderModule(descriptor: unknown): unknown;
  createRenderPipeline(descriptor: unknown): unknown;
  createCommandEncoder(descriptor?: unknown): {
    beginRenderPass(descriptor: unknown): {
      setPipeline(pipeline: unknown): void;
      draw(vertexCount: number): void;
      end(): void;
    };
    finish(): unknown;
  };
  pushErrorScope(filter: string): void;
  popErrorScope(): Promise<Readonly<{ message?: string }> | null>;
  destroy(): void;
};

export type BrowserGpu = {
  requestAdapter(options?: unknown): Promise<GpuAdapter | null>;
  getPreferredCanvasFormat(): string;
};

export type WebGpuSmokeReport = Readonly<{
  status: "rendered" | "unavailable" | "failed" | "device-lost";
  adapterName: string | null;
  vendor: string | null;
  architecture: string | null;
  preferredFormat: string | null;
  maxBufferSize: number | null;
  maxTextureDimension2D: number | null;
  deviceLostReason: string | null;
  message: string;
}>;

export type WebGpuSmokeSession = Readonly<{
  report: WebGpuSmokeReport;
  shutdown: () => void;
}>;

export function describeWebGpuAvailability(gpu: BrowserGpu | undefined) {
  return gpu
    ? { available: true as const, message: "WebGPU entry point is available." }
    : { available: false as const, message: "WebGPU is unavailable in this browser; the TypeScript/Canvas fallback remains active." };
}

function resizeCanvas(canvas: HTMLCanvasElement, pixelRatio: number) {
  const ratio = Math.max(1, Math.min(2, Number.isFinite(pixelRatio) ? pixelRatio : 1));
  const width = Math.max(320, Math.round((canvas.clientWidth || 640) * ratio));
  const height = Math.max(220, Math.round((canvas.clientHeight || 420) * ratio));
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
}

export function drawTypeScriptSmokeFallback(canvas: HTMLCanvasElement, message: string) {
  resizeCanvas(canvas, typeof devicePixelRatio === "number" ? devicePixelRatio : 1);
  const context = canvas.getContext("2d");
  if (!context) return;
  const { width, height } = canvas;
  context.clearRect(0, 0, width, height);
  const background = context.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, "#12231f");
  background.addColorStop(1, "#08110f");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = "rgba(231, 205, 126, 0.13)";
  context.lineWidth = 1;
  const grid = Math.max(18, Math.round(width / 24));
  for (let x = 0; x <= width; x += grid) {
    context.beginPath(); context.moveTo(x, 0); context.lineTo(x, height); context.stroke();
  }
  for (let y = 0; y <= height; y += grid) {
    context.beginPath(); context.moveTo(0, y); context.lineTo(width, y); context.stroke();
  }
  const gradient = context.createLinearGradient(width * 0.25, height * 0.76, width * 0.7, height * 0.18);
  gradient.addColorStop(0, "#397abd");
  gradient.addColorStop(0.52, "#389e5c");
  gradient.addColorStop(1, "#f0aa33");
  context.beginPath();
  context.moveTo(width * 0.5, height * 0.16);
  context.lineTo(width * 0.18, height * 0.79);
  context.lineTo(width * 0.82, height * 0.79);
  context.closePath();
  context.fillStyle = gradient;
  context.fill();
  context.strokeStyle = "#f2d47d";
  context.lineWidth = Math.max(2, width / 260);
  context.stroke();
  context.fillStyle = "rgba(7, 14, 12, 0.82)";
  context.fillRect(width * 0.18, height * 0.86, width * 0.64, height * 0.075);
  context.fillStyle = "#d9d9c7";
  context.font = `${Math.max(11, Math.round(width / 54))}px ui-monospace, monospace`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(message.slice(0, 74), width * 0.5, height * 0.897, width * 0.58);
}

function adapterLabel(info: GpuInfo | undefined) {
  return info?.description || info?.device || null;
}

export async function runWebGpuSmoke(
  canvas: HTMLCanvasElement,
  options: Readonly<{
    gpu?: BrowserGpu;
    pixelRatio?: number;
    onDeviceLost?: (report: WebGpuSmokeReport) => void;
  }> = {},
): Promise<WebGpuSmokeSession> {
  const availability = describeWebGpuAvailability(options.gpu);
  if (!availability.available || !options.gpu) {
    drawTypeScriptSmokeFallback(canvas, "Canvas fallback · WebGPU unavailable");
    return {
      report: {
        status: "unavailable",
        adapterName: null,
        vendor: null,
        architecture: null,
        preferredFormat: null,
        maxBufferSize: null,
        maxTextureDimension2D: null,
        deviceLostReason: null,
        message: availability.message,
      },
      shutdown: () => {},
    };
  }

  let device: GpuDevice | null = null;
  let context: GpuCanvasContext | null = null;
  let shutdown = false;
  try {
    const adapter = await options.gpu.requestAdapter({ powerPreference: "low-power" });
    if (!adapter) throw new Error("No WebGPU adapter accepted the smoke request");
    device = await adapter.requestDevice({
      label: "Blockwild R0 engine-lab device",
      requiredFeatures: [],
      requiredLimits: {},
    });
    const rawContext = canvas.getContext("webgpu");
    if (!rawContext) throw new Error("The diagnostic canvas could not create a WebGPU context");
    context = rawContext as unknown as GpuCanvasContext;
    resizeCanvas(canvas, options.pixelRatio ?? 1);
    const preferredFormat = options.gpu.getPreferredCanvasFormat();
    context.configure({ device, format: preferredFormat, alphaMode: "opaque" });
    device.pushErrorScope("validation");
    const shader = device.createShaderModule({ label: "Blockwild R0 smoke shader", code: BLOCKWILD_R0_SMOKE_SHADER });
    const pipeline = device.createRenderPipeline({
      label: "Blockwild R0 smoke pipeline",
      layout: "auto",
      vertex: { module: shader, entryPoint: "vertex_main" },
      fragment: { module: shader, entryPoint: "fragment_main", targets: [{ format: preferredFormat }] },
      primitive: { topology: "triangle-list" },
    });
    const encoder = device.createCommandEncoder({ label: "Blockwild R0 smoke encoder" });
    const pass = encoder.beginRenderPass({
      label: "Blockwild R0 smoke pass",
      colorAttachments: [{
        view: context.getCurrentTexture().createView(),
        clearValue: { r: 0.071, g: 0.125, b: 0.110, a: 1 },
        loadOp: "clear",
        storeOp: "store",
      }],
    });
    pass.setPipeline(pipeline);
    pass.draw(3);
    pass.end();
    device.queue.submit([encoder.finish()]);
    await device.queue.onSubmittedWorkDone?.();
    const validationError = await device.popErrorScope();
    if (validationError) throw new Error(validationError.message || "WebGPU validation rejected the smoke scene");
    const info = adapter.info;
    const limits = device.limits ?? adapter.limits ?? {};
    const report: WebGpuSmokeReport = {
      status: "rendered",
      adapterName: adapterLabel(info),
      vendor: info?.vendor ?? null,
      architecture: info?.architecture ?? null,
      preferredFormat,
      maxBufferSize: typeof limits.maxBufferSize === "number" ? limits.maxBufferSize : null,
      maxTextureDimension2D: typeof limits.maxTextureDimension2D === "number" ? limits.maxTextureDimension2D : null,
      deviceLostReason: null,
      message: "Dedicated WebGPU canvas submitted the canonical Blockwild R0 triangle.",
    };
    void device.lost.then((lost) => {
      if (shutdown) return;
      options.onDeviceLost?.({
        ...report,
        status: "device-lost",
        deviceLostReason: lost.reason ?? "unknown",
        message: lost.message || "The WebGPU device was lost.",
      });
    });
    return {
      report,
      shutdown: () => {
        if (shutdown) return;
        shutdown = true;
        context?.unconfigure?.();
        device?.destroy();
      },
    };
  } catch (error) {
    shutdown = true;
    context?.unconfigure?.();
    device?.destroy();
    const message = readableError(error);
    drawTypeScriptSmokeFallback(canvas, "Canvas fallback · WebGPU probe failed");
    return {
      report: {
        status: "failed",
        adapterName: null,
        vendor: null,
        architecture: null,
        preferredFormat: null,
        maxBufferSize: null,
        maxTextureDimension2D: null,
        deviceLostReason: null,
        message,
      },
      shutdown: () => {},
    };
  }
}

export function bytesToDiagnosticHex(bytes: Uint8Array, maximumBytes = 16) {
  return [...bytes.subarray(0, Math.max(0, maximumBytes))]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
