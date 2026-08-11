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

type PersistenceReport = Readonly<{
  status: "idle" | "ready" | "fallback" | "stopped";
  database: string | null;
  commitDurationMs: number | null;
  checkpointRoundTrip: boolean;
  atomicConflictRejected: boolean;
  protocolCommitVerified: boolean;
  reopenedRecoveryVerified: boolean;
  corruptionDetected: boolean;
  quotaClassified: boolean;
  legacyNamespaceUntouched: boolean;
  message: string;
}>;

type EngineLabSnapshot = Readonly<{
  schema: 1;
  route: "/engine-lab";
  phase: LabPhase;
  fallbackActive: boolean;
  artifact: RustArtifactProbeReport;
  engine: EngineReport;
  persistence: PersistenceReport;
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

const EMPTY_PERSISTENCE: PersistenceReport = {
  status: "idle",
  database: null,
  commitDurationMs: null,
  checkpointRoundTrip: false,
  atomicConflictRejected: false,
  protocolCommitVerified: false,
  reopenedRecoveryVerified: false,
  corruptionDetected: false,
  quotaClassified: false,
  legacyNamespaceUntouched: true,
  message: "Transactional persistence probe has not run.",
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
  persistence: EMPTY_PERSISTENCE,
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

type PersistenceDiagnosticHandle = { destroyForDiagnostics(): Promise<void> };

const RUST_PERSISTENCE_COMMIT_FIXTURE_HEX = "4257505201000100080706050403120097010000de9d4c65a885b56180a589948ab71d5cbf0000004257505301000100a3000000abd1fc0d1b6fa825400facb0010574b6130000007472616e73616374696f6e3a62726f777365720d000000776f726c643a62726f777365720f000000636865636b706f696e743a626173650000000000000000010000000000000001000000010d000000776f726c643a62726f77736572090000006f766572776f726c64020d00000063726561747572653ac383c2b100010000000000000006000000007f80ffc3b1888ae5103c911ec390a7961e2dbe878cd00000004257505301000200b400000001bcbcf3582adab980a589948ab71d5c0e000000636865636b706f696e743a6f6e65000d000000776f726c643a62726f77736572010000000000000011111111111111111111111111111111222222222222222222222222222222220700000000000000010000000d000000776f726c643a62726f77736572090000006f766572776f726c64020d00000063726561747572653ac383c2b10100000000000000060000003b522b40a24d651c90a7961e2dfe905d2112991ca7bf42a3c0f06ce27bd65760";

function diagnosticHexBytes(value: string) {
  if (value.length % 2 !== 0 || !/^[0-9a-f]+$/u.test(value)) throw new Error("Persistence fixture is not canonical hexadecimal.");
  return Uint8Array.from({ length: value.length / 2 }, (_, index) => Number.parseInt(value.slice(index * 2, index * 2 + 2), 16));
}

function indexedDbRequest<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB diagnostic request failed."));
  });
}

function indexedDbTransaction(transaction: IDBTransaction) {
  return new Promise<void>((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB diagnostic transaction aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB diagnostic transaction failed."));
  });
}

async function corruptDiagnosticPersistenceRecord(databaseName: string, key: string) {
  const request = indexedDB.open(databaseName, 1);
  const database = await indexedDbRequest(request);
  try {
    const transaction = database.transaction("records", "readwrite", { durability: "strict" });
    const complete = indexedDbTransaction(transaction);
    const store = transaction.objectStore("records");
    const record = await indexedDbRequest(store.get(key)) as Readonly<Record<string, unknown>> | undefined;
    if (!record) throw new Error("Persistence corruption probe could not find its committed record.");
    store.put({ ...record, payload: Uint8Array.of(0xde, 0xad, 0xbe, 0xef) });
    await complete;
  } finally {
    database.close();
  }
}

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
  const persistenceRef = useRef<PersistenceDiagnosticHandle | null>(null);
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
    const persistence = persistenceRef.current;
    persistenceRef.current = null;
    if (persistence) await persistence.destroyForDiagnostics();
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
        persistence: { ...current.persistence, status: "stopped", message: "Diagnostic IndexedDB was closed and deleted." },
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

    let persistenceReport: PersistenceReport;
    try {
      const [{ IndexedDbPersistenceAdapterV1 }, { RustPersistenceBrowserRuntimeV1 }, protocol, persistence] = await Promise.all([
        import("../game/indexeddb-persistence-adapter"),
        import("../game/rust-persistence-runtime-adapter"),
        import("../game/rust-persistence-runtime-contract"),
        import("../game/persistence-journal-contract"),
      ]);
      const database = `blockwild-rust-persistence-lab-${run}-${Date.now().toString(36)}`;
      const adapter = new IndexedDbPersistenceAdapterV1(indexedDB, database);
      persistenceRef.current = adapter;
      const runtime = new RustPersistenceBrowserRuntimeV1(adapter);
      const commitFixture = diagnosticHexBytes(RUST_PERSISTENCE_COMMIT_FIXTURE_HEX);
      const commitStartedAt = performance.now();
      const committed = protocol.decodeRustPersistenceResponseV1(await runtime.execute(commitFixture));
      const commitDurationMs = Math.max(0, performance.now() - commitStartedAt);
      const protocolCommitVerified = committed.kind === "commit" && committed.code === "committed" && committed.verifiedReadback;
      if (!protocolCommitVerified) throw new Error(committed.kind === "error" ? `${committed.code}: ${committed.message}` : "Rust persistence request did not prove an exact commit.");

      const duplicate = protocol.decodeRustPersistenceResponseV1(await runtime.execute(commitFixture));
      const atomicConflictRejected = duplicate.kind === "commit" && (duplicate.code === "stale-sequence" || duplicate.code === "record-conflict") && !duplicate.verifiedReadback;

      await adapter.close();
      const reopenedAdapter = new IndexedDbPersistenceAdapterV1(indexedDB, database);
      persistenceRef.current = reopenedAdapter;
      const reopenedRuntime = new RustPersistenceBrowserRuntimeV1(reopenedAdapter);
      const recovery = protocol.decodeRustPersistenceResponseV1(await reopenedRuntime.execute(
        protocol.encodeRustPersistenceRecoverLatestRequestV1(2, "world:browser"),
      ));
      const recoveredPayload = recovery.kind === "recovery" ? recovery.recordPayloads[0] : null;
      const reopenedRecoveryVerified = recovery.kind === "recovery"
        && recovery.code === "ready"
        && recovery.checkpoint?.checkpointHash === committed.checkpointHash
        && recoveredPayload?.join(",") === "0,127,128,255,195,177";
      const checkpointRoundTrip = reopenedRecoveryVerified;

      const descriptor = recovery.kind === "recovery" ? recovery.checkpoint?.records[0] : null;
      if (!descriptor) throw new Error("Rust recovery did not return the committed descriptor.");
      await corruptDiagnosticPersistenceRecord(database, persistence.persistenceRecordKeyV1(descriptor.address));
      const corrupted = protocol.decodeRustPersistenceResponseV1(await reopenedRuntime.execute(
        protocol.encodeRustPersistenceRecoverLatestRequestV1(3, "world:browser"),
      ));
      const corruptionDetected = corrupted.kind === "recovery"
        && corrupted.code === "corrupt"
        && corrupted.corruptRecordKeys.includes(persistence.persistenceRecordKeyV1(descriptor.address));

      const quotaRuntime = new RustPersistenceBrowserRuntimeV1({
        commit: async (transaction) => Object.freeze({
          status: "rejected" as const,
          transactionId: transaction.transactionId,
          code: "quota" as const,
          message: "Synthetic browser quota gate.",
        }),
        readLatestCheckpoint: async () => null,
        readCheckpoint: async () => null,
        readRecord: async () => null,
      });
      const quota = protocol.decodeRustPersistenceResponseV1(await quotaRuntime.execute(commitFixture));
      const quotaClassified = quota.kind === "commit" && quota.code === "quota" && !quota.verifiedReadback;

      if (!atomicConflictRejected || !reopenedRecoveryVerified || !corruptionDetected || !quotaClassified) {
        throw new Error("Rust browser persistence did not pass duplicate, reopen, corruption, and quota gates.");
      }
      persistenceReport = {
        status: "ready", database, commitDurationMs, checkpointRoundTrip, atomicConflictRejected,
        protocolCommitVerified, reopenedRecoveryVerified, corruptionDetected, quotaClassified, legacyNamespaceUntouched: true,
        message: "A native-Rust BWPR committed through strict IndexedDB, survived close/reopen, rejected a duplicate atomically, reported deliberate corruption, and classified quota failure.",
      };
    } catch (error) {
      persistenceReport = {
        status: "fallback", database: null, commitDurationMs: null, checkpointRoundTrip: false, atomicConflictRejected: false,
        protocolCommitVerified: false, reopenedRecoveryVerified: false, corruptionDetected: false, quotaClassified: false, legacyNamespaceUntouched: true,
        message: error instanceof Error ? error.message : String(error),
      };
    }
    if (!mountedRef.current || run !== runRef.current) return;
    const fallbackActive = artifactReport.status !== "ready" || engineReport.status !== "ready" || persistenceReport.status !== "ready";
    setSnapshot((current) => ({
      ...current,
      engine: engineReport,
      persistence: persistenceReport,
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

          <DiagnosticCard title="Rust journal adapter" kicker="INDEXEDDB · ATOMICITY · READBACK" status={snapshot.persistence.status} message={snapshot.persistence.message}>
            <Metric label="Database" value={snapshot.persistence.database ?? "ephemeral / unavailable"} code />
            <Metric label="BWPR commit" value={milliseconds(snapshot.persistence.commitDurationMs)} />
            <Metric label="Rust protocol receipt" value={snapshot.persistence.protocolCommitVerified ? "verified" : "not verified"} />
            <Metric label="Checkpoint readback" value={snapshot.persistence.checkpointRoundTrip ? "verified" : "not verified"} />
            <Metric label="Close / reopen" value={snapshot.persistence.reopenedRecoveryVerified ? "verified" : "not verified"} />
            <Metric label="Conflict rollback" value={snapshot.persistence.atomicConflictRejected ? "verified" : "not verified"} />
            <Metric label="Corruption report" value={snapshot.persistence.corruptionDetected ? "verified" : "not verified"} />
            <Metric label="Quota response" value={snapshot.persistence.quotaClassified ? "verified" : "not verified"} />
            <Metric label="Legacy namespace" value={snapshot.persistence.legacyNamespaceUntouched ? "untouched" : "modified"} />
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
