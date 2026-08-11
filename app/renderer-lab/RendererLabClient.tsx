"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  createRenderFrameV2,
  decodeRenderFrameV2,
  decodeRenderResourceBatchV2,
  type RenderFrameV2,
} from "../game/rust-render-extraction-v2.ts";
import {
  RustRendererServiceR11,
  loadRustRendererArtifactR11,
  supportsRustRendererWorkerR11,
  type RustRendererDiagnosticsR11,
} from "../game/rust-renderer-service-r11.ts";
import styles from "./renderer-lab.module.css";

type LabScene = Readonly<{ name: string; purpose: string }>;
type LabState = Readonly<{
  phase: "starting" | "ready" | "fallback" | "stopped";
  artifactHash: string | null;
  message: string;
  diagnostics: RustRendererDiagnosticsR11 | null;
  oracle: "idle" | "ready" | "failed";
  sceneName: string | null;
  scenes: readonly LabScene[];
}>;

declare global {
  interface Window { render_renderer_lab_to_text?: () => string; }
}

export default function RendererLabClient() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const oracleRef = useRef<HTMLCanvasElement | null>(null);
  const serviceRef = useRef<RustRendererServiceR11 | null>(null);
  const [state, setState] = useState<LabState>({
    phase: "starting",
    artifactHash: null,
    message: "Loading the content-addressed renderer…",
    diagnostics: null,
    oracle: "idle",
    sceneName: null,
    scenes: [],
  });

  useEffect(() => {
    const canvas = canvasRef.current, oracleCanvas = oracleRef.current;
    if (!canvas || !oracleCanvas) return;
    let disposed = false, animation = 0, interval = 0;
    let resizeObserver: ResizeObserver | null = null;
    const abort = new AbortController();
    let oracleCleanup = () => {};

    void (async () => {
      try {
        if (!supportsRustRendererWorkerR11(canvas)) throw new Error("This browser does not expose worker OffscreenCanvas WebGPU.");
        const artifact = await loadRustRendererArtifactR11({ signal: abort.signal });
        const requestedName = new URLSearchParams(window.location.search).get("scene") ?? "overworld-day";
        const selected = artifact.visualMatrixScenes.find((scene) => scene.name === requestedName) ?? artifact.visualMatrixScenes[0];
        if (!selected) throw new Error("The published renderer artifact has no visual matrix scenes.");
        setState((current) => ({
          ...current,
          artifactHash: artifact.hash,
          sceneName: selected.name,
          scenes: artifact.visualMatrixScenes.map(({ name, purpose }) => ({ name, purpose })),
          message: `Loading the tracked ${selected.name} extraction record…`,
        }));

        const [resourceResponse, frameResponse] = await Promise.all([
          fetch(selected.resourceFixtureUrl, { cache: "no-store", signal: abort.signal }),
          fetch(selected.frameFixtureUrl, { cache: "no-store", signal: abort.signal }),
        ]);
        if (!resourceResponse.ok || !frameResponse.ok) throw new Error("Selected extraction fixtures could not be loaded.");
        const resourceBytes = new Uint8Array(await resourceResponse.arrayBuffer());
        const resourceBatch = decodeRenderResourceBatchV2(resourceBytes);
        const baseFrame = decodeRenderFrameV2(new Uint8Array(await frameResponse.arrayBuffer()));
        if (resourceBatch.epoch !== baseFrame.epoch || resourceBatch.revision !== baseFrame.resourceRevision) {
          throw new Error("Selected matrix resource/frame revisions do not describe the same state.");
        }

        const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        let width = Math.max(640, Math.round((canvas.clientWidth || 960) * ratio));
        let height = Math.max(360, Math.round((canvas.clientHeight || 540) * ratio));
        canvas.width = width;
        canvas.height = height;
        const createSizedFrame = (sequence: bigint): RenderFrameV2 => createRenderFrameV2({
          ...baseFrame,
          frameSequence: sequence,
          animationTimeMicros: baseFrame.animationTimeMicros,
          camera: { ...baseFrame.camera, viewport: [width, height] },
        });

        // Explicit compatibility/oracle boundary: production modules never
        // import this Three bundle and no renderer scrapes another's scene.
        const { ThreeExtractionOracleR11 } = await import("../three-compat/renderer-extraction-oracle-r11.ts");
        const oracle = new ThreeExtractionOracleR11(oracleCanvas);
        oracle.applyResources(resourceBatch);
        oracle.render(createSizedFrame(baseFrame.frameSequence));
        oracleCleanup = () => oracle.dispose();
        setState((current) => ({ ...current, oracle: "ready" }));

        const service = new RustRendererServiceR11();
        serviceRef.current = service;
        service.start(canvas.transferControlToOffscreen(), artifact, baseFrame.epoch, width, height);
        service.applyResources(resourceBytes);
        let sequence = baseFrame.frameSequence;
        resizeObserver = new ResizeObserver(([entry]) => {
          if (!entry || disposed) return;
          const nextWidth = Math.max(320, Math.round(entry.contentRect.width * ratio));
          const nextHeight = Math.max(180, Math.round(entry.contentRect.height * ratio));
          if (nextWidth === width && nextHeight === height) return;
          width = nextWidth;
          height = nextHeight;
          service.resize(width, height);
          oracle.render(createSizedFrame(sequence));
        });
        resizeObserver.observe(canvas);
        const render = () => {
          if (disposed) return;
          sequence += BigInt(1);
          service.present(createSizedFrame(sequence));
          animation = requestAnimationFrame(render);
        };
        animation = requestAnimationFrame(render);
        interval = window.setInterval(() => {
          const diagnostics = service.snapshot();
          setState((current) => ({
            ...current,
            phase: diagnostics.state === "ready" ? "ready" : diagnostics.state === "failed" ? "fallback" : diagnostics.state === "stopped" ? "stopped" : current.phase,
            artifactHash: artifact.hash,
            message: diagnostics.state === "stopped" ? current.message : diagnostics.lastError ?? `Both renderers are presenting the immutable ${selected.name} extraction state.`,
            diagnostics,
          }));
        }, 150);
      } catch (error) {
        if (!disposed && !abort.signal.aborted) setState((current) => ({
          ...current,
          phase: "fallback",
          oracle: current.oracle === "ready" ? "ready" : "failed",
          message: error instanceof Error ? error.message : String(error),
        }));
      }
    })();
    return () => {
      disposed = true;
      abort.abort();
      cancelAnimationFrame(animation);
      clearInterval(interval);
      resizeObserver?.disconnect();
      oracleCleanup();
      serviceRef.current?.stop();
      serviceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const render = () => JSON.stringify(state, (_, value) => typeof value === "bigint" ? value.toString() : value);
    window.render_renderer_lab_to_text = render;
    return () => { if (window.render_renderer_lab_to_text === render) delete window.render_renderer_lab_to_text; };
  }, [state]);

  const diagnostics = state.diagnostics;
  const selectedPurpose = state.scenes.find((scene) => scene.name === state.sceneName)?.purpose;
  return (
    <main className={styles.page} data-testid="renderer-lab" data-phase={state.phase} data-scene={state.sceneName ?? "pending"}>
      <header className={styles.header}>
        <div><span>BLOCKWILD · R11 GRAPHICS CUTOVER</span><h1>Renderer Lab</h1></div>
        <nav>
          <select aria-label="Matrix scene" value={state.sceneName ?? ""} disabled={!state.sceneName} onChange={(event) => {
            const url = new URL(window.location.href);
            url.searchParams.set("scene", event.target.value);
            window.location.assign(url);
          }}>
            {!state.sceneName && <option value="">Loading scenes</option>}
            {state.scenes.map((scene) => <option key={scene.name} value={scene.name}>{scene.name}</option>)}
          </select>
          <button type="button" onClick={() => window.location.reload()}>Restart lab</button>
          <button type="button" disabled={state.phase !== "ready"} onClick={() => serviceRef.current?.requestRecovery("Manual device-recreate validation")}>Recreate GPU</button>
          <button type="button" onClick={() => {
            const target = canvasRef.current?.parentElement;
            if (!target?.requestFullscreen) {
              setState((current) => ({ ...current, message: "Fullscreen is unavailable in this browser." }));
              return;
            }
            void target.requestFullscreen().catch(() => setState((current) => ({ ...current, message: "The browser declined fullscreen mode." })));
          }}>Fullscreen candidate</button>
          <button type="button" disabled={state.phase === "stopped"} onClick={() => {
            serviceRef.current?.stop();
            setState((current) => ({ ...current, phase: "stopped", message: "Worker and GPU resources released." }));
          }}>Release GPU</button>
          <Link href="/">Return</Link>
        </nav>
      </header>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>EXTRACTION V2 · WGPU · OFFSCREEN CANVAS</p>
          <h2>One immutable scene record. Two independently loaded renderers.</h2>
          <p>{state.message}</p>
          {state.sceneName && <p><strong>{state.sceneName}</strong>{selectedPurpose ? ` — ${selectedPurpose}` : ""}</p>}
        </div>
        <span className={styles.status} data-state={state.phase}>{state.phase}</span>
      </section>
      <section className={styles.compare} aria-label="Renderer comparison">
        <article><header><strong>Rust wgpu candidate</strong><span>{state.artifactHash?.slice(0, 12) ?? "loading"}</span></header><canvas ref={canvasRef} data-testid="renderer-wgpu-canvas" /></article>
        <article><header><strong>Three.js compatibility oracle</strong><span>{state.oracle}</span></header><canvas ref={oracleRef} data-testid="renderer-three-oracle" /></article>
      </section>
      <section className={styles.metrics} aria-label="Renderer diagnostics">
        <Metric label="Presented" value={diagnostics?.presentedFrames ?? 0} />
        <Metric label="Dropped" value={diagnostics?.droppedFrames ?? 0} />
        <Metric label="Visible / culled" value={`${diagnostics?.visibleInstances ?? 0} / ${diagnostics?.culledInstances ?? 0}`} />
        <Metric label="Draw calls" value={diagnostics?.drawCalls ?? 0} />
        <Metric label="Transparent" value={diagnostics?.transparentDrawCalls ?? 0} />
        <Metric label="Resident instances" value={formatBytes(diagnostics?.residentInstanceBytes ?? 0)} />
        <Metric label="Frame transfer" value={formatBytes(diagnostics?.frameBytes ?? 0)} />
        <Metric label="Resource replay" value={formatBytes(diagnostics?.replayedResourceBytes ?? 0)} />
        <Metric label="Adapter" value={diagnostics?.adapter ?? "pending"} />
        <Metric label="GPU timing" value={diagnostics?.timestampQuerySupported ? "supported" : "CPU only"} />
      </section>
      <footer><strong>Isolation:</strong> this route loads the oracle explicitly. The candidate consumes only immutable BWRD/BWRF pages and has no Three.js, world, or per-voxel dependency.</footer>
    </main>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: string | number }>) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function formatBytes(value: number) { return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KiB`; }
