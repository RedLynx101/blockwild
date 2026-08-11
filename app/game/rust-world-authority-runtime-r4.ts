import { canonicalTerrainMaterialRegistryV2 } from "./terrain-material-registry";
import {
  type RustChunkAuxiliaryInstallR4V1,
  type RustChunkAuxiliaryPatchR4V1,
  type RustResidencyIntentR4V1,
  type RustSectionInstallR4V1,
  type RustWorldBlockCatalogR4V1,
  type RustWorldMutationCommandR4V1,
} from "./rust-world-authority-bridge-r4";
import { RustWorldAuthorityServiceR4V1 } from "./rust-world-authority-service-r4";
import {
  RustWorldAuthorityWorkerTransportR4V1,
  type RustWorldAuthorityWorkerPortR4V1,
} from "./rust-world-authority-worker-r4";
import type { WorldAddressV1, WorldSectionAddressV1 } from "./world-authority-contract";

export type RustWorldAuthorityModeR4V1 = "off" | "shadow" | "canary" | "authority";

const configuredMode = typeof process === "undefined" ? undefined
  : process.env.NEXT_PUBLIC_BLOCKWILD_RUST_WORLD_AUTHORITY;

export function configuredRustWorldAuthorityModeR4V1(): RustWorldAuthorityModeR4V1 {
  if (typeof document === "undefined") return "off";
  const query = new URLSearchParams(location.search).get("rust-world-authority");
  const value = query ?? configuredMode;
  return value === "shadow" || value === "canary" || value === "authority" ? value : "off";
}

export function currentRustWorldBlockCatalogR4V1(): RustWorldBlockCatalogR4V1 {
  const registry = canonicalTerrainMaterialRegistryV2();
  const directionalBlocks: number[] = [];
  const waterloggedBlocks: number[] = [];
  for (let id = 0; id < registry.blocks.length; id += 1) {
    const material = registry.blocks[id];
    if (material?.kind !== "material") continue;
    if (material.directionallyPlaced) directionalBlocks.push(id);
    if (material.waterlogged) waterloggedBlocks.push(id);
  }
  return Object.freeze({ waterBlockId: 7, directionalBlocks: Object.freeze(directionalBlocks), waterloggedBlocks: Object.freeze(waterloggedBlocks) });
}

export function createRustWorldAuthorityWorkerR4V1(): RustWorldAuthorityWorkerPortR4V1 {
  if (typeof Worker !== "function") throw new Error("Web Workers are unavailable");
  return new Worker(new URL("./rust-world-authority-browser-worker-r4.ts", import.meta.url), {
    type: "module",
    name: "blockwild-rust-world-authority-r4",
  }) as unknown as RustWorldAuthorityWorkerPortR4V1;
}

export type RustWorldAuthorityRuntimeDiagnosticsR4V1 = Readonly<{
  configuredMode: RustWorldAuthorityModeR4V1;
  effectiveMode: RustWorldAuthorityModeR4V1;
  state: "idle" | "starting" | "ready" | "recovering" | "fallback" | "disposed";
  artifactHash: string | null;
  requests: number;
  failures: number;
  restarts: number;
  staleRejections: number;
  shadowComparisons: number;
  shadowMismatches: number;
  immediateEvents: number;
  p95Milliseconds: number;
  lastFallbackReason: string | null;
}>;

type RuntimeOptions = Readonly<{
  mode?: RustWorldAuthorityModeR4V1;
  workerFactory?: () => RustWorldAuthorityWorkerPortR4V1;
  onEmergencyFallback?: (reason: string) => void;
  requestTimeoutMs?: number;
}>;

/** Owns the browser worker/service and provides one recovery/fallback policy. */
export class RustWorldAuthorityRuntimeR4V1 {
  readonly configuredMode: RustWorldAuthorityModeR4V1;
  private effectiveModeValue: RustWorldAuthorityModeR4V1;
  private stateValue: RustWorldAuthorityRuntimeDiagnosticsR4V1["state"] = "idle";
  private service: RustWorldAuthorityServiceR4V1 | null = null;
  private activeWorker: RustWorldAuthorityWorkerPortR4V1 | null = null;
  private activeTransport: RustWorldAuthorityWorkerTransportR4V1 | null = null;
  private address: WorldAddressV1 | null = null;
  private artifactHash: string | null = null;
  private failures = 0;
  private restarts = 0;
  private staleRejections = 0;
  private shadowComparisons = 0;
  private shadowMismatches = 0;
  private lastFallbackReason: string | null = null;
  private readonly durations: number[] = [];
  private generation = 0;

  constructor(private readonly options: RuntimeOptions = {}) {
    this.configuredMode = options.mode ?? configuredRustWorldAuthorityModeR4V1();
    this.effectiveModeValue = this.configuredMode;
  }

  mode() { return this.effectiveModeValue; }
  isRustAuthoritative() { return this.effectiveModeValue === "canary" || this.effectiveModeValue === "authority"; }
  identity() { return this.service?.identity() ?? null; }

  async start(address: WorldAddressV1) {
    if (this.configuredMode === "off") return null;
    const generation = ++this.generation;
    this.stateValue = "starting";
    this.address = Object.freeze({ ...address });
    try {
      await this.disposeService();
      if (generation !== this.generation) return null;
      const worker = (this.options.workerFactory ?? createRustWorldAuthorityWorkerR4V1)();
      this.activeWorker = worker;
      let fatal: Error | null = null;
      const transport = new RustWorldAuthorityWorkerTransportR4V1(worker, {
        timeoutMs: this.options.requestTimeoutMs ?? 15_000,
        observeWorkerErrors: this.options.workerFactory === undefined,
        onFatal: (error) => { fatal = error; this.emergencyFallback(error.message); },
      });
      this.activeTransport = transport;
      const service = new RustWorldAuthorityServiceR4V1(transport);
      const started = performance.now();
      const identity = await service.initialize(address, currentRustWorldBlockCatalogR4V1());
      this.recordDuration(performance.now() - started);
      if (generation !== this.generation) { await service.dispose(); return null; }
      if (fatal) throw fatal;
      this.service = service;
      this.artifactHash = service.diagnostics().artifactHash;
      this.stateValue = "ready";
      this.lastFallbackReason = null;
      return identity;
    } catch (error) {
      if (generation === this.generation) this.fail(error);
      return null;
    }
  }

  async installSections(sections: readonly RustSectionInstallR4V1[], auxiliary: readonly RustChunkAuxiliaryInstallR4V1[] = []) {
    return this.execute("install", (service) => service.installSections(sections, auxiliary));
  }

  async patchAuxiliary(patches: readonly RustChunkAuxiliaryPatchR4V1[]) {
    return this.execute("patch-auxiliary", (service) => service.patchAuxiliary(patches));
  }

  async importCompatibilitySave(compatibilityJson: Uint8Array, rustExtension?: Uint8Array) {
    return this.execute("import-save", (service) => service.importCompatibilitySave(compatibilityJson, rustExtension));
  }

  async updateResidency(intents: readonly RustResidencyIntentR4V1[], cancelledRequestIds: readonly number[]) {
    return this.execute("residency", (service) => service.updateResidency(intents, cancelledRequestIds));
  }

  async mutate(batchId: string, authorityId: string, commands: readonly RustWorldMutationCommandR4V1[]) {
    return this.execute("mutation", (service) => service.mutate(batchId, authorityId, commands));
  }

  async readPage(origin: Readonly<{ x: number; y: number; z: number }>, size: Readonly<{ x: number; y: number; z: number }>) {
    return this.execute("read-page", (service) => service.readPage(origin, size));
  }

  async evictSections(sections: readonly WorldSectionAddressV1[]) {
    return this.execute("evict", (service) => service.evictSections(sections));
  }

  async switchLocation(address: WorldAddressV1) {
    const identity = await this.execute("switch-location", (service) => service.switchLocation(address));
    if (identity) this.address = Object.freeze({ ...address });
    return identity;
  }

  async exportSave() { return this.execute("export-save", (service) => service.exportSave()); }

  async exerciseStaleMutationForDiagnostics(commands: readonly RustWorldMutationCommandR4V1[]) {
    const service = this.service;
    if (!service || this.stateValue !== "ready") return null;
    return service.exerciseStaleMutationForDiagnostics(`stale-audit-${Date.now()}`, commands);
  }

  async exerciseRejectedBatchForDiagnostics(commands: readonly RustWorldMutationCommandR4V1[]) {
    const service = this.service;
    if (!service || this.stateValue !== "ready") return null;
    return service.exerciseRejectedBatchForDiagnostics(`rollback-audit-${Date.now()}`, commands);
  }

  async simulateCrashForDiagnostics(rehydrate: (runtime: RustWorldAuthorityRuntimeR4V1) => Promise<void>) {
    const worker = this.activeWorker;
    if (!worker) return false;
    this.activeTransport?.dispose();
    this.emergencyFallback("diagnostic worker termination");
    return this.restart(rehydrate);
  }

  recordShadowComparison(exact: boolean) {
    this.shadowComparisons += 1;
    if (!exact) this.shadowMismatches += 1;
  }

  async restart(rehydrate: (runtime: RustWorldAuthorityRuntimeR4V1) => Promise<void>) {
    if (this.configuredMode === "off" || !this.address) return false;
    this.restarts += 1;
    this.stateValue = "recovering";
    const address = this.address;
    await this.disposeService();
    this.effectiveModeValue = this.configuredMode;
    if (!await this.start(address)) return false;
    try {
      await rehydrate(this);
      return true;
    } catch (error) {
      this.fail(error);
      return false;
    }
  }

  emergencyFallback(reason: string) {
    if (this.stateValue === "disposed") return;
    this.failures += 1;
    this.lastFallbackReason = reason;
    this.effectiveModeValue = "off";
    this.stateValue = "fallback";
    this.options.onEmergencyFallback?.(reason);
  }

  diagnostics(): RustWorldAuthorityRuntimeDiagnosticsR4V1 {
    const service = this.service?.diagnostics();
    const sorted = [...this.durations].sort((left, right) => left - right);
    const p95 = sorted.length ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)] : 0;
    return Object.freeze({
      configuredMode: this.configuredMode,
      effectiveMode: this.effectiveModeValue,
      state: this.stateValue,
      artifactHash: this.artifactHash,
      requests: service?.requests ?? 0,
      failures: this.failures,
      restarts: this.restarts,
      staleRejections: this.staleRejections + (service?.staleResponses ?? 0),
      shadowComparisons: this.shadowComparisons,
      shadowMismatches: this.shadowMismatches,
      immediateEvents: service?.immediateEvents ?? 0,
      p95Milliseconds: p95,
      lastFallbackReason: this.lastFallbackReason,
    });
  }

  async dispose() {
    if (this.stateValue === "disposed") return;
    ++this.generation;
    this.stateValue = "disposed";
    await this.disposeService();
  }

  private async execute<T>(label: string, operation: (service: RustWorldAuthorityServiceR4V1) => Promise<T>): Promise<T | null> {
    const service = this.service;
    if (!service || this.stateValue !== "ready") return null;
    const generation = this.generation;
    const started = performance.now();
    try {
      const value = await operation(service);
      this.recordDuration(performance.now() - started);
      return value;
    } catch (error) {
      if (generation !== this.generation || service !== this.service) return null;
      const message = `${label}: ${error instanceof Error ? error.message : String(error)}`;
      if (/stale/u.test(message)) this.staleRejections += 1;
      this.fail(error);
      return null;
    }
  }

  private fail(error: unknown) {
    this.emergencyFallback(error instanceof Error ? error.message : String(error));
  }

  private recordDuration(milliseconds: number) {
    this.durations.push(Math.max(0, milliseconds));
    if (this.durations.length > 2_048) this.durations.splice(0, this.durations.length - 2_048);
  }

  private async disposeService() {
    const service = this.service;
    const transport = this.activeTransport;
    this.service = null;
    this.activeWorker = null;
    this.activeTransport = null;
    if (service) {
      try { await service.dispose(); } catch { /* worker may already be unavailable */ }
    } else transport?.dispose();
  }
}
