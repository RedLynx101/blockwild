"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  bytesToDiagnosticHex,
  instantiatePreparedRustArtifact,
  preparePublishedRustArtifact,
  runWebGpuSmoke,
  unavailableArtifactReport,
  type BrowserGpu,
  type RustArtifactProbeReport,
  type WebGpuSmokeReport,
  type WebGpuSmokeSession,
} from "../game/rust-render-smoke";
import styles from "./engine-lab.module.css";

type LabPhase = "idle" | "running" | "ready" | "fallback" | "stopping" | "stopped";

type EngineReport = Readonly<{
  status: "idle" | "ready" | "fallback" | "stopped";
  lifecycle: string;
  workerCreated: boolean;
  heartbeatRoundTripMs: number | null;
  stateHashHex: string | null;
  protocolVersion: number | null;
  schemaVersion: number | null;
  buildKind: string | null;
  transferredToWorkerBytes: number;
  transferredFromWorkerBytes: number;
  message: string;
}>;

type EngineLabSnapshot = Readonly<{
  schema: 1;
  route: "/engine-lab";
  phase: LabPhase;
  fallbackActive: boolean;
  artifact: RustArtifactProbeReport;
  engine: EngineReport;
  webgpu: WebGpuSmokeReport;
  three: Readonly<{
    status: "idle" | "rendered" | "failed";
    renderer: "Three.js WebGL";
    message: string;
  }>;
}>;

const EMPTY_ARTIFACT: RustArtifactProbeReport = {
  status: "unavailable",
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
  message: "Artifact probe has not run.",
};

const EMPTY_ENGINE: EngineReport = {
  status: "idle",
  lifecycle: "idle",
  workerCreated: false,
  heartbeatRoundTripMs: null,
  stateHashHex: null,
  protocolVersion: null,
  schemaVersion: null,
  buildKind: null,
  transferredToWorkerBytes: 0,
  transferredFromWorkerBytes: 0,
  message: "Worker service has not started.",
};

const EMPTY_WEBGPU: WebGpuSmokeReport = {
  status: "unavailable",
  adapterName: null,
  vendor: null,
  architecture: null,
  preferredFormat: null,
  maxBufferSize: null,
  maxTextureDimension2D: null,
  deviceLostReason: null,
  message: "WebGPU probe has not run.",
};

const INITIAL_SNAPSHOT: EngineLabSnapshot = {
  schema: 1,
  route: "/engine-lab",
  phase: "idle",
  fallbackActive: true,
  artifact: EMPTY_ARTIFACT,
  engine: EMPTY_ENGINE,
  webgpu: EMPTY_WEBGPU,
  three: {
    status: "idle",
    renderer: "Three.js WebGL",
    message: "Three.js oracle has not rendered.",
  },
};

type EngineServiceHandle = {
  shutdown(): Promise<void>;
  diagnostics(): Readonly<{
    state: string;
    transferredToWorkerBytes: number;
    transferredFromWorkerBytes: number;
  }>;
};

declare global {
  interface Window {
    render_engine_lab_to_text?: () => string;
    render_game_to_text?: () => string;
    advanceTime?: (milliseconds: number) => void;
  }
}

function milliseconds(value: number | null) {
  return value === null ? "—" : `${value.toFixed(2)} ms`;
}

function bytes(value: number) {
  if (!value) return "0 B";
  if (value < 1024) return `${value} B`;
  return `${(value / 1024).toFixed(1)} KiB`;
}

function statusTone(status: string) {
  return status === "ready" || status === "rendered" ? styles.good
    : status === "idle" || status === "stopped" ? styles.neutral
      : styles.warn;
}

export default function EngineLabClient() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const threeCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const serviceRef = useRef<EngineServiceHandle | null>(null);
  const smokeRef = useRef<WebGpuSmokeSession | null>(null);
  const threeCleanupRef = useRef<(() => void) | null>(null);
  const runRef = useRef(0);
  const mountedRef = useRef(true);
  const [snapshot, setSnapshot] = useState<EngineLabSnapshot>(INITIAL_SNAPSHOT);

  const cleanResources = useCallback(async () => {
    abortRef.current?.abort();
    abortRef.current = null;
    smokeRef.current?.shutdown();
    smokeRef.current = null;
    threeCleanupRef.current?.();
    threeCleanupRef.current = null;
    const service = serviceRef.current;
    serviceRef.current = null;
    if (service) await service.shutdown();
  }, []);

  const stop = useCallback(async () => {
    runRef.current += 1;
    setSnapshot((current) => ({ ...current, phase: "stopping" }));
    await cleanResources();
    if (mountedRef.current) {
      setSnapshot((current) => ({
        ...current,
        phase: "stopped",
        fallbackActive: true,
        engine: { ...current.engine, status: "stopped", lifecycle: "stopped", message: "Worker and GPU resources were released." },
      }));
    }
  }, [cleanResources]);

  const runDiagnostics = useCallback(async () => {
    const canvas = canvasRef.current;
    const threeCanvas = threeCanvasRef.current;
    if (!canvas || !threeCanvas) return;
    const run = ++runRef.current;
    await cleanResources();
    if (!mountedRef.current || run !== runRef.current) {
      threeCleanupRef.current?.();
      threeCleanupRef.current = null;
      return;
    }
    const abort = new AbortController();
    abortRef.current = abort;
    setSnapshot({ ...INITIAL_SNAPSHOT, phase: "running" });

    let artifactReport = EMPTY_ARTIFACT;
    try {
      const prepared = await preparePublishedRustArtifact({ signal: abort.signal });
      artifactReport = await instantiatePreparedRustArtifact(prepared);
    } catch (error) {
      if (abort.signal.aborted) return;
      artifactReport = unavailableArtifactReport(error);
    }
    if (!mountedRef.current || run !== runRef.current) return;
    setSnapshot((current) => ({ ...current, artifact: artifactReport }));

    const browserNavigator = navigator as Navigator & { gpu?: BrowserGpu };
    const smoke = await runWebGpuSmoke(canvas, {
      gpu: browserNavigator.gpu,
      pixelRatio: window.devicePixelRatio,
      onDeviceLost: (report) => {
        if (!mountedRef.current || run !== runRef.current) return;
        setSnapshot((current) => ({ ...current, webgpu: report, fallbackActive: true, phase: "fallback" }));
      },
    });
    smokeRef.current = smoke;
    if (!mountedRef.current || run !== runRef.current) {
      smoke.shutdown();
      return;
    }
    setSnapshot((current) => ({ ...current, webgpu: smoke.report }));

    let threeReport: EngineLabSnapshot["three"];
    try {
      const THREE = await import("three");
      const renderer = new THREE.WebGLRenderer({ canvas: threeCanvas, antialias: true, alpha: false, powerPreference: "low-power" });
      // The WebGPU smoke target writes linear vertex colors into a non-sRGB
      // canvas format. Keep the Three oracle in that same output space so the
      // two canvases are a meaningful pixel-level comparison.
      renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
      renderer.toneMapping = THREE.NoToneMapping;
      renderer.setPixelRatio(Math.max(1, Math.min(2, window.devicePixelRatio || 1)));
      renderer.setSize(threeCanvas.clientWidth || 640, threeCanvas.clientHeight || 430, false);
      renderer.setClearColor(0x12201c, 1);
      const scene = new THREE.Scene();
      const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.01, 10);
      camera.position.z = 1;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute([
        0, .72, 0,
        -.68, -.55, 0,
        .68, -.55, 0,
      ], 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute([
        .94, .67, .20,
        .22, .62, .36,
        .24, .48, .72,
      ], 3));
      const material = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
      const triangle = new THREE.Mesh(geometry, material);
      scene.add(triangle);
      renderer.render(scene, camera);
      threeCleanupRef.current = () => {
        geometry.dispose();
        material.dispose();
        renderer.dispose();
      };
      threeReport = {
        status: "rendered",
        renderer: "Three.js WebGL",
        message: "Dedicated Three.js canvas rendered the same canonical positions and vertex colors.",
      };
    } catch (error) {
      threeReport = {
        status: "failed",
        renderer: "Three.js WebGL",
        message: error instanceof Error ? error.message : String(error),
      };
    }
    if (!mountedRef.current || run !== runRef.current) {
      threeCleanupRef.current?.();
      threeCleanupRef.current = null;
      return;
    }
    setSnapshot((current) => ({ ...current, three: threeReport }));

    let engineReport: EngineReport;
    try {
      // Deliberately route-local: neither the game nor wiki bundle evaluates
      // the Rust worker service unless this private lab is opened.
      const [{ RustEngineService }, protocol] = await Promise.all([
        import("../game/rust-engine-service"),
        import("../game/rust-engine-protocol"),
      ]);
      const service = new RustEngineService({
        autoRestart: false,
        maximumRestarts: 0,
        heartbeatIntervalMs: 0,
        startupTimeoutMs: 5_000,
        requestTimeoutMs: 3_000,
        clientBuildHash: "engine-lab-r0",
        engineSelection: "rust-shadow",
        rendererSelection: "wgpu-smoke",
      });
      serviceRef.current = service;
      const capabilities = await service.start();
      const heartbeatStartedAt = performance.now();
      const heartbeat = await service.request(
        protocol.RustEngineMessageKind.Heartbeat,
        protocol.encodeRustEngineJson({ source: "engine-lab", sentAt: heartbeatStartedAt }),
        protocol.RustEngineMessageKind.Heartbeat,
      );
      const heartbeatRoundTripMs = Math.max(0, performance.now() - heartbeatStartedAt);
      heartbeat.release();
      const stateHash = await service.stateHash();
      const stateHashHex = bytesToDiagnosticHex(stateHash.payload, 16);
      stateHash.release();
      const diagnostics = service.diagnostics();
      engineReport = {
        status: "ready",
        lifecycle: diagnostics.state,
        workerCreated: true,
        heartbeatRoundTripMs,
        stateHashHex,
        protocolVersion: capabilities.protocolVersion,
        schemaVersion: capabilities.schemaVersion,
        buildKind: capabilities.buildKind,
        transferredToWorkerBytes: diagnostics.transferredToWorkerBytes,
        transferredFromWorkerBytes: diagnostics.transferredFromWorkerBytes,
        message: "Worker negotiated capabilities, answered a heartbeat, and returned a deterministic state hash.",
      };
    } catch (error) {
      const diagnostics = serviceRef.current?.diagnostics() ?? null;
      engineReport = {
        status: "fallback",
        lifecycle: diagnostics?.state ?? "failed",
        workerCreated: Boolean(serviceRef.current),
        heartbeatRoundTripMs: null,
        stateHashHex: null,
        protocolVersion: null,
        schemaVersion: null,
        buildKind: null,
        transferredToWorkerBytes: diagnostics?.transferredToWorkerBytes ?? 0,
        transferredFromWorkerBytes: diagnostics?.transferredFromWorkerBytes ?? 0,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    if (!mountedRef.current || run !== runRef.current) return;
    const fallbackActive = artifactReport.status !== "ready" || engineReport.status !== "ready";
    setSnapshot((current) => ({
      ...current,
      engine: engineReport,
      fallbackActive,
      phase: fallbackActive ? "fallback" : "ready",
    }));
  }, [cleanResources]);

  useEffect(() => {
    mountedRef.current = true;
    void runDiagnostics();
    return () => {
      mountedRef.current = false;
      runRef.current += 1;
      void cleanResources();
    };
  }, [cleanResources, runDiagnostics]);

  useEffect(() => {
    const render = () => JSON.stringify(snapshot);
    window.render_engine_lab_to_text = render;
    window.render_game_to_text = render;
    window.advanceTime = () => {};
    return () => {
      if (window.render_engine_lab_to_text === render) delete window.render_engine_lab_to_text;
      if (window.render_game_to_text === render) delete window.render_game_to_text;
      delete window.advanceTime;
    };
  }, [snapshot]);

  const busy = snapshot.phase === "running" || snapshot.phase === "stopping";

  return (
    <main className={styles.page} data-engine-lab-phase={snapshot.phase} data-testid="engine-lab">
      <a href="#engine-diagnostics" className={styles.skipLink}>Skip to diagnostics</a>
      <header className={styles.header}>
        <div className={styles.brandLockup}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/blockwild-icon-64.png" width="48" height="48" alt="" />
          <div>
            <span>BLOCKWILD · PRIVATE MIGRATION SURFACE</span>
            <h1>Engine Lab</h1>
          </div>
        </div>
        <div className={`${styles.overallStatus} ${snapshot.fallbackActive ? styles.warn : styles.good}`} role="status" aria-live="polite">
          <span aria-hidden="true" />
          <div><small>ACTIVE PATH</small><strong>{snapshot.fallbackActive ? "TypeScript fallback" : "Rust shadow ready"}</strong></div>
        </div>
        <nav aria-label="Engine lab controls" className={styles.actions}>
          <button type="button" onClick={() => void runDiagnostics()} disabled={busy}>Run diagnostics</button>
          <button type="button" onClick={() => void stop()} disabled={snapshot.phase === "stopped" || snapshot.phase === "stopping"}>Stop &amp; release</button>
          <Link href="/">Return to Blockwild</Link>
        </nav>
      </header>

      <section className={styles.intro}>
        <p className={styles.eyebrow}>R0 · BROWSER SHELL / RUST CORE / WGPU PROBE</p>
        <h2>A contained proving ground for the engine cutover.</h2>
        <p>This route owns its worker, Wasm instance, GPU device, and canvas. Failure leaves the live game untouched and reports the exact fallback boundary.</p>
      </section>

      <section id="engine-diagnostics" className={styles.workspace} aria-label="Engine diagnostics">
        <article className={styles.viewportCard}>
          <header>
            <div><small>CANONICAL SCENE 0001</small><h2>Deterministic smoke target</h2></div>
            <span className={statusTone(snapshot.webgpu.status)}>{snapshot.webgpu.status}</span>
          </header>
          <div className={styles.comparisonGrid} data-testid="engine-smoke-comparison">
            <div className={styles.renderPane}>
              <div className={styles.renderLabel}><b>WebGPU candidate</b><span>{snapshot.webgpu.status}</span></div>
              <div className={styles.canvasFrame}>
                <canvas ref={canvasRef} data-testid="engine-smoke-canvas" aria-label="Dedicated Blockwild WebGPU smoke-test canvas" />
                <div className={styles.canvasLegend} aria-hidden="true"><span>WGPU</span><span>CANONICAL FIXTURE</span></div>
              </div>
              <p className={styles.canvasDescription}>{snapshot.webgpu.message}</p>
            </div>
            <div className={styles.renderPane}>
              <div className={styles.renderLabel}><b>Three.js oracle</b><span>{snapshot.three.status}</span></div>
              <div className={styles.canvasFrame}>
                <canvas ref={threeCanvasRef} data-testid="engine-three-oracle-canvas" aria-label="Dedicated Blockwild Three.js oracle canvas" />
                <div className={styles.canvasLegend} aria-hidden="true"><span>THREE.JS</span><span>SAME FIXTURE</span></div>
              </div>
              <p className={styles.canvasDescription}>{snapshot.three.message}</p>
            </div>
          </div>
        </article>

        <div className={styles.diagnosticStack}>
          <DiagnosticCard title="Published artifact" kicker="FETCH · COMPILE · INSTANTIATE" status={snapshot.artifact.status} message={snapshot.artifact.message}>
            <Metric label="Variant" value={snapshot.artifact.variant ?? "none"} />
            <Metric label="Payload" value={bytes(snapshot.artifact.wasmBytes)} />
            <Metric label="Fetch" value={milliseconds(snapshot.artifact.fetchDurationMs)} />
            <Metric label="Compile" value={milliseconds(snapshot.artifact.compileDurationMs)} />
            <Metric label="Instantiate" value={milliseconds(snapshot.artifact.instantiateDurationMs)} />
            <Metric label="Protocol / schema" value={snapshot.artifact.protocolVersion === null ? "—" : `${snapshot.artifact.protocolVersion} / ${snapshot.artifact.schemaVersion}`} />
          </DiagnosticCard>

          <DiagnosticCard title="Worker engine" kicker="NEGOTIATE · HEARTBEAT · ROUND TRIP" status={snapshot.engine.status} message={snapshot.engine.message}>
            <Metric label="Lifecycle" value={snapshot.engine.lifecycle} />
            <Metric label="Worker created" value={snapshot.engine.workerCreated ? "yes" : "no"} />
            <Metric label="Heartbeat RTT" value={milliseconds(snapshot.engine.heartbeatRoundTripMs)} />
            <Metric label="State hash" value={snapshot.engine.stateHashHex ?? "—"} code />
            <Metric label="Transferred" value={`${bytes(snapshot.engine.transferredToWorkerBytes)} → / ${bytes(snapshot.engine.transferredFromWorkerBytes)} ←`} />
          </DiagnosticCard>

          <DiagnosticCard title="WebGPU device" kicker="ADAPTER · PIPELINE · DEVICE LOSS" status={snapshot.webgpu.status} message={snapshot.webgpu.message}>
            <Metric label="Adapter" value={snapshot.webgpu.adapterName ?? "unavailable"} />
            <Metric label="Vendor / architecture" value={[snapshot.webgpu.vendor, snapshot.webgpu.architecture].filter(Boolean).join(" / ") || "—"} />
            <Metric label="Canvas format" value={snapshot.webgpu.preferredFormat ?? "—"} />
            <Metric label="Max buffer" value={snapshot.webgpu.maxBufferSize === null ? "—" : bytes(snapshot.webgpu.maxBufferSize)} />
            <Metric label="Device loss" value={snapshot.webgpu.deviceLostReason ?? "none observed"} />
          </DiagnosticCard>
        </div>
      </section>

      <footer className={styles.footer}>
        <p><strong>Isolation contract:</strong> the game and wiki do not import this route, create its worker, fetch its Wasm, or touch this canvas.</p>
        <p><strong>Current phase:</strong> {snapshot.phase}. {snapshot.fallbackActive ? "The shipping TypeScript / Three.js path remains authoritative." : "Rust is healthy here but remains shadow-only until a later gate."}</p>
      </footer>
    </main>
  );
}

function DiagnosticCard({ title, kicker, status, message, children }: Readonly<{
  title: string;
  kicker: string;
  status: string;
  message: string;
  children: React.ReactNode;
}>) {
  return (
    <article className={styles.diagnosticCard} data-status={status}>
      <header><div><small>{kicker}</small><h3>{title}</h3></div><span className={statusTone(status)}>{status}</span></header>
      <dl>{children}</dl>
      <p>{message}</p>
    </article>
  );
}

function Metric({ label, value, code = false }: Readonly<{ label: string; value: string; code?: boolean }>) {
  return <div><dt>{label}</dt><dd className={code ? styles.codeValue : undefined}>{value}</dd></div>;
}
