"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createRenderFrameV2, decodeRenderFrameV2 } from "../game/rust-render-extraction-v2.ts";
import {
  RustRendererServiceR11,
  loadRustRendererArtifactR11,
  supportsRustRendererWorkerR11,
  type RustRendererDiagnosticsR11,
} from "../game/rust-renderer-service-r11.ts";
import styles from "./renderer-lab.module.css";

type LabState = Readonly<{
  phase: "starting" | "ready" | "fallback" | "stopped";
  artifactHash: string | null;
  message: string;
  diagnostics: RustRendererDiagnosticsR11 | null;
  oracle: "idle" | "ready" | "failed";
}>;

declare global {
  interface Window { render_renderer_lab_to_text?: () => string; }
}

export default function RendererLabClient() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const oracleRef = useRef<HTMLCanvasElement | null>(null);
  const serviceRef = useRef<RustRendererServiceR11 | null>(null);
  const [state, setState] = useState<LabState>({ phase: "starting", artifactHash: null, message: "Loading the content-addressed renderer…", diagnostics: null, oracle: "idle" });

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
        const [resourceResponse, frameResponse] = await Promise.all([
          fetch(artifact.liveResourceFixtureUrl, { cache: "no-store", signal: abort.signal }),
          fetch(artifact.liveFrameFixtureUrl, { cache: "no-store", signal: abort.signal }),
        ]);
        if (!resourceResponse.ok || !frameResponse.ok) throw new Error("Canonical extraction fixtures could not be loaded.");
        const resources = new Uint8Array(await resourceResponse.arrayBuffer());
        const frameBytes = new Uint8Array(await frameResponse.arrayBuffer());
        const baseFrame = decodeRenderFrameV2(frameBytes);
        const ratio = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
        let width = Math.max(640, Math.round((canvas.clientWidth || 960) * ratio));
        let height = Math.max(360, Math.round((canvas.clientHeight || 540) * ratio));
        canvas.width = width; canvas.height = height;
        const service = new RustRendererServiceR11();
        serviceRef.current = service;
        service.start(canvas.transferControlToOffscreen(), artifact, baseFrame.epoch, width, height);
        service.applyResources(resources);
        resizeObserver = new ResizeObserver(([entry]) => {
          if (!entry || disposed) return;
          const nextWidth = Math.max(320, Math.round(entry.contentRect.width * ratio));
          const nextHeight = Math.max(180, Math.round(entry.contentRect.height * ratio));
          if (nextWidth === width && nextHeight === height) return;
          width = nextWidth; height = nextHeight;
          service.resize(width, height);
        });
        resizeObserver.observe(canvas);
        let sequence = baseFrame.frameSequence;
        const render = (timestamp: number) => {
          if (disposed) return;
          sequence += BigInt(1);
          service.present(createRenderFrameV2({
            ...baseFrame,
            frameSequence: sequence,
            animationTimeMicros: BigInt(Math.max(0, Math.round(timestamp * 1_000))),
            camera: { ...baseFrame.camera, viewport: [width, height] },
          }));
          animation = requestAnimationFrame(render);
        };
        animation = requestAnimationFrame(render);
        interval = window.setInterval(() => {
          const diagnostics = service.snapshot();
          setState((current) => ({
            ...current,
            phase: diagnostics.state === "ready" ? "ready" : diagnostics.state === "failed" ? "fallback" : diagnostics.state === "stopped" ? "stopped" : current.phase,
            artifactHash: artifact.hash,
            message: diagnostics.state === "stopped" ? current.message : diagnostics.lastError ?? "Rust wgpu is presenting extraction V2 frames on a dedicated worker.",
            diagnostics,
          }));
        }, 150);

        // The oracle is a separately loaded comparison bundle. Production
        // rendering never imports it and never scrapes its objects.
        try {
          const THREE = await import("three");
          const renderer = new THREE.WebGLRenderer({ canvas: oracleCanvas, antialias: false, alpha: false });
          renderer.setPixelRatio(ratio); renderer.setSize(oracleCanvas.clientWidth || 960, oracleCanvas.clientHeight || 540, false);
          renderer.setClearColor(0x3f698b, 1);
          const scene = new THREE.Scene();
          const camera = new THREE.PerspectiveCamera(47, 16 / 9, .05, 128); camera.position.set(0, 2.45, 6.8); camera.lookAt(0, 0, 0);
          scene.add(new THREE.HemisphereLight(0xb0bfbe, 0x25372e, 1.15));
          const sun = new THREE.DirectionalLight(0xffecbc, 1.0); sun.position.set(3, 7, 4); scene.add(sun);
          const objects = [
            [[0, -.92, 0], [4.4, .36, 3.8], 0x588948, 1],
            [[-1.15, 0, -.2], [.82, 1.2, .82], 0x306954, 1],
            [[1.15, .15, -.35], [.7, 1.5, .7], 0xe3b746, 1],
            [[0, -.55, .95], [3, .14, 1.35], 0x2e7dbe, .64],
          ] as const;
          const geometries: InstanceType<typeof THREE.BoxGeometry>[] = [], materials: InstanceType<typeof THREE.MeshLambertMaterial>[] = [];
          for (const [position, scale, color, opacity] of objects) {
            const geometry = new THREE.BoxGeometry(), material = new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity, depthWrite: opacity === 1 });
            const mesh = new THREE.Mesh(geometry, material); mesh.position.fromArray(position); mesh.scale.fromArray(scale); scene.add(mesh); geometries.push(geometry); materials.push(material);
          }
          renderer.render(scene, camera);
          oracleCleanup = () => { geometries.forEach((value) => value.dispose()); materials.forEach((value) => value.dispose()); renderer.dispose(); };
          if (!disposed) setState((current) => ({ ...current, oracle: "ready" }));
        } catch {
          if (!disposed) setState((current) => ({ ...current, oracle: "failed" }));
        }
      } catch (error) {
        if (!disposed && !abort.signal.aborted) setState((current) => ({ ...current, phase: "fallback", message: error instanceof Error ? error.message : String(error) }));
      }
    })();
    return () => {
      disposed = true; abort.abort(); cancelAnimationFrame(animation); clearInterval(interval); resizeObserver?.disconnect(); oracleCleanup(); serviceRef.current?.stop(); serviceRef.current = null;
    };
  }, []);

  useEffect(() => {
    const render = () => JSON.stringify(state, (_, value) => typeof value === "bigint" ? value.toString() : value);
    window.render_renderer_lab_to_text = render;
    return () => { if (window.render_renderer_lab_to_text === render) delete window.render_renderer_lab_to_text; };
  }, [state]);

  const diagnostics = state.diagnostics;
  return (
    <main className={styles.page} data-testid="renderer-lab" data-phase={state.phase}>
      <header className={styles.header}>
        <div><span>BLOCKWILD · R11 GRAPHICS CUTOVER</span><h1>Renderer Lab</h1></div>
        <nav>
          <button type="button" onClick={() => location.reload()}>Restart lab</button>
          <button type="button" disabled={state.phase !== "ready"} onClick={() => serviceRef.current?.requestRecovery("Manual device-recreate validation")}>Recreate GPU</button>
          <button type="button" onClick={() => {
            const target = canvasRef.current?.parentElement;
            if (!target?.requestFullscreen) {
              setState((current) => ({ ...current, message: "Fullscreen is unavailable in this browser." }));
              return;
            }
            void target.requestFullscreen().catch(() => setState((current) => ({ ...current, message: "The browser declined fullscreen mode." })));
          }}>Fullscreen primary</button>
          <button type="button" disabled={state.phase === "stopped"} onClick={() => { serviceRef.current?.stop(); setState((current) => ({ ...current, phase: "stopped", message: "Worker and GPU resources released." })); }}>Release GPU</button>
          <Link href="/">Return</Link>
        </nav>
      </header>
      <section className={styles.hero}>
        <div><p className={styles.eyebrow}>EXTRACTION V2 · WGPU · OFFSCREEN CANVAS</p><h2>One scene contract. Two independently loaded renderers.</h2><p>{state.message}</p></div>
        <span className={styles.status} data-state={state.phase}>{state.phase}</span>
      </section>
      <section className={styles.compare} aria-label="Renderer comparison">
        <article><header><strong>Rust wgpu primary</strong><span>{state.artifactHash?.slice(0, 12) ?? "loading"}</span></header><canvas ref={canvasRef} data-testid="renderer-wgpu-canvas" /></article>
        <article><header><strong>Three.js oracle</strong><span>{state.oracle}</span></header><canvas ref={oracleRef} data-testid="renderer-three-oracle" /></article>
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
      <footer><strong>Isolation:</strong> this route loads the oracle explicitly. The primary renderer consumes only immutable BWRD/BWRF pages and has no Three.js, world, or per-voxel dependency.</footer>
    </main>
  );
}

function Metric({ label, value }: Readonly<{ label: string; value: string | number }>) { return <div><span>{label}</span><strong>{value}</strong></div>; }
function formatBytes(value: number) { return value < 1024 ? `${value} B` : `${(value / 1024).toFixed(1)} KiB`; }
