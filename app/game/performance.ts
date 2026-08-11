/** Performance policy and low-overhead instrumentation for the world loop. */

export const MIN_RENDER_DISTANCE = 2;
export const DEFAULT_RENDER_DISTANCE = 10;
export const MAX_RENDER_DISTANCE = 16;
export const DEFAULT_BASIC_RENDER_DISTANCE = 20;
export const MAX_BASIC_RENDER_DISTANCE = 32;
export const DEFAULT_SIMULATION_DISTANCE = 8;
export type ResourceMode = "auto" | "cpu" | "memory";

/**
 * The legacy far-field proxy is deliberately feature-gated while the streamed
 * Rust/WGPU replacement is built. Next only exposes explicitly prefixed build
 * variables to the browser, so stale local settings cannot turn it back on.
 */
export const BASIC_RENDER_DISTANCE_ENABLED = process.env.NEXT_PUBLIC_BLOCKWILD_BASIC_RENDER_DISTANCE === "1";

/**
 * Sentient residents keep their authored model at conversational range, use a
 * compact role-readable proxy across the wider town, and sleep once outside
 * the active simulation window. The coarse cadence is deliberately independent
 * of render FPS so a large settlement cannot turn AI work into a frame-rate
 * multiplier.
 */
export const SENTIENT_FULL_DETAIL_DISTANCE = 18;
export const SENTIENT_COARSE_STEP_SECONDS = 0.2;
export type SentientSimulationTier = "full" | "coarse" | "sleep";

/**
 * Ordinary wildlife uses the same distance-based policy as residents, with an
 * additional active tier. Rendering remains independent: throttled creatures
 * stay visible and animation time still advances from their wall-clock age.
 */
export const CREATURE_FULL_SIMULATION_DISTANCE = 32;
export const CREATURE_ACTIVE_SIMULATION_DISTANCE = 64;
export const CREATURE_ACTIVE_STEP_SECONDS = 0.1;
export const CREATURE_COARSE_STEP_SECONDS = 0.25;
export type CreatureSimulationTier = "full" | "active" | "coarse" | "sleep";

export function creatureSimulationTier(input: Readonly<{
  distance: number;
  simulationRadius: number;
  requiresFullDetail?: boolean;
}>): CreatureSimulationTier {
  const distance = Math.max(0, Number.isFinite(input.distance) ? input.distance : 0);
  const simulationRadius = Math.max(CREATURE_ACTIVE_SIMULATION_DISTANCE, Number.isFinite(input.simulationRadius)
    ? input.simulationRadius
    : CREATURE_ACTIVE_SIMULATION_DISTANCE);
  if (distance > simulationRadius) return "sleep";
  if (input.requiresFullDetail || distance <= CREATURE_FULL_SIMULATION_DISTANCE) return "full";
  if (distance <= CREATURE_ACTIVE_SIMULATION_DISTANCE) return "active";
  return "coarse";
}

export function advanceCreatureSimulation(tier: CreatureSimulationTier, accumulator: number, elapsedSeconds: number) {
  if (tier === "full") return { advance: true, elapsedSeconds: Math.max(0, elapsedSeconds), accumulator: 0 } as const;
  if (tier === "sleep") return { advance: false, elapsedSeconds: 0, accumulator: 0 } as const;
  const stepSeconds = tier === "active" ? CREATURE_ACTIVE_STEP_SECONDS : CREATURE_COARSE_STEP_SECONDS;
  const next = Math.min(stepSeconds * 3, Math.max(0, Number.isFinite(accumulator) ? accumulator : 0)
    + Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0));
  if (next + 1e-9 < stepSeconds) return { advance: false, elapsedSeconds: 0, accumulator: next } as const;
  return { advance: true, elapsedSeconds: next, accumulator: Math.max(0, next - stepSeconds) } as const;
}

/** Stable phase offsets prevent every throttled creature waking on one frame. */
export function creatureSimulationPhase(entityId: number, tier: Extract<CreatureSimulationTier, "active" | "coarse">) {
  const step = tier === "active" ? CREATURE_ACTIVE_STEP_SECONDS : CREATURE_COARSE_STEP_SECONDS;
  const slot = Math.abs(Math.trunc(entityId)) % 8;
  return slot / 8 * step;
}

export function sentientSimulationTier(input: Readonly<{
  distance: number;
  simulationRadius: number;
  requiresFullDetail?: boolean;
}>): SentientSimulationTier {
  const distance = Math.max(0, Number.isFinite(input.distance) ? input.distance : 0);
  const simulationRadius = Math.max(SENTIENT_FULL_DETAIL_DISTANCE, Number.isFinite(input.simulationRadius)
    ? input.simulationRadius
    : SENTIENT_FULL_DETAIL_DISTANCE);
  if (distance > simulationRadius) return "sleep";
  if (input.requiresFullDetail || distance <= SENTIENT_FULL_DETAIL_DISTANCE) return "full";
  return "coarse";
}

export function advanceSentientCoarseSimulation(accumulator: number, elapsedSeconds: number) {
  const next = Math.min(0.6, Math.max(0, Number.isFinite(accumulator) ? accumulator : 0)
    + Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0));
  if (next + 1e-9 < SENTIENT_COARSE_STEP_SECONDS) {
    return { advance: false, elapsedSeconds: 0, accumulator: next } as const;
  }
  return { advance: true, elapsedSeconds: next, accumulator: 0 } as const;
}

export type ViewDistanceSettings = Readonly<{
  renderDistance: number;
  simulationDistance: number;
  basicRenderDistance: number;
}>;

const finiteInteger = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;

export function normalizeViewDistances(
  value: Partial<ViewDistanceSettings> | null | undefined,
  options: Readonly<{ basicRenderDistanceEnabled?: boolean }> = {},
): ViewDistanceSettings {
  const renderDistance = Math.max(
    MIN_RENDER_DISTANCE,
    Math.min(MAX_RENDER_DISTANCE, finiteInteger(value?.renderDistance, DEFAULT_RENDER_DISTANCE)),
  );
  const simulationDistance = Math.max(
    MIN_RENDER_DISTANCE,
    Math.min(renderDistance, finiteInteger(value?.simulationDistance, DEFAULT_SIMULATION_DISTANCE)),
  );
  const basicRenderDistance = (options.basicRenderDistanceEnabled ?? BASIC_RENDER_DISTANCE_ENABLED)
    ? Math.max(
      renderDistance,
      Math.min(MAX_BASIC_RENDER_DISTANCE, finiteInteger(value?.basicRenderDistance, DEFAULT_BASIC_RENDER_DISTANCE)),
    )
    : renderDistance;
  return { renderDistance, simulationDistance, basicRenderDistance };
}

/** Number of chunks in a square Chebyshev-radius window. */
export const chunksWithinDistance = (distance: number) => {
  const radius = Math.max(0, Math.floor(distance));
  return (radius * 2 + 1) ** 2;
};

/** Near-to-far iteration order for chunk generation and visibility work. */
export function chunkOffsetsByDistance(distance: number) {
  const radius = Math.max(0, Math.floor(distance));
  const offsets: Array<Readonly<{ x: number; z: number; distance: number }>> = [];
  for (let z = -radius; z <= radius; z += 1) {
    for (let x = -radius; x <= radius; x += 1) offsets.push({ x, z, distance: Math.max(Math.abs(x), Math.abs(z)) });
  }
  offsets.sort((a, b) => a.distance - b.distance || (a.x * a.x + a.z * a.z) - (b.x * b.x + b.z * b.z) || a.z - b.z || a.x - b.x);
  return offsets;
}

export type PerformanceSample = Readonly<{
  frameMilliseconds: number;
  /** Expensive sub-phase counters are sampled, not collected on every frame. */
  phaseSampled?: boolean;
  activeCpuMilliseconds?: number;
  simulationMilliseconds?: number;
  mobSimulationMilliseconds?: number;
  chunkWorkMilliseconds?: number;
  chunkSchedulingMilliseconds?: number;
  chunkGenerationMilliseconds?: number;
  chunkLightingMilliseconds?: number;
  chunkMeshingMilliseconds?: number;
  chunkInstallationMilliseconds?: number;
  renderSubmissionMilliseconds?: number;
  postRenderMilliseconds?: number;
  creaturePresentationMilliseconds?: number;
  environmentPresentationMilliseconds?: number;
  hudMilliseconds?: number;
  gpuMilliseconds?: number;
  visibleChunks?: number;
  simulatedEntities?: number;
  triangles?: number;
  drawCalls?: number;
  geometries?: number;
  textures?: number;
  terrainSectionDrawCalls?: number;
  terrainCombinedDrawCalls?: number;
  heroCreatureDrawCalls?: number;
  articulatedCreatureDrawCalls?: number;
  silhouetteCreatureDrawCalls?: number;
  otherDrawCalls?: number;
}>;

export type PerformanceSummary = Readonly<{
  sampleCount: number;
  phaseSampleCount: number;
  averageFrameMilliseconds: number;
  p50FrameMilliseconds: number;
  p95FrameMilliseconds: number;
  p99FrameMilliseconds: number;
  framesPerSecond: number;
  longFrameRatio: number;
  averageActiveCpuMilliseconds: number;
  averageSimulationMilliseconds: number;
  averageMobSimulationMilliseconds: number;
  averageChunkWorkMilliseconds: number;
  averageChunkSchedulingMilliseconds: number;
  averageChunkGenerationMilliseconds: number;
  averageChunkLightingMilliseconds: number;
  averageChunkMeshingMilliseconds: number;
  averageChunkInstallationMilliseconds: number;
  averageRenderSubmissionMilliseconds: number;
  averagePostRenderMilliseconds: number;
  averageCreaturePresentationMilliseconds: number;
  averageEnvironmentPresentationMilliseconds: number;
  averageHudMilliseconds: number;
  averageGpuMilliseconds: number | null;
  gpuSampleCount: number;
  peakVisibleChunks: number;
  peakSimulatedEntities: number;
  peakTriangles: number;
  peakDrawCalls: number;
  peakGeometries: number;
  peakTextures: number;
  peakTerrainSectionDrawCalls: number;
  peakTerrainCombinedDrawCalls: number;
  peakHeroCreatureDrawCalls: number;
  peakArticulatedCreatureDrawCalls: number;
  peakSilhouetteCreatureDrawCalls: number;
  peakOtherDrawCalls: number;
  frameHistogram: readonly Readonly<{ upperBoundMilliseconds: number; count: number }>[];
}>;

export const FRAME_HISTOGRAM_BOUNDS_MS = Object.freeze([8, 12, 16.7, 25, 33.3, 50, 75, 100, 150, 250, 500, 1_000, 5_000, 60_000]);

const percentile = (sorted: readonly number[], fraction: number) => {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
};

/** Fixed-size ring buffer: O(1) record, O(n log n) only when a report is requested. */
export class PerformanceSampler {
  private samples: PerformanceSample[] = [];
  private cursor = 0;

  constructor(readonly capacity = 240) {
    if (!Number.isInteger(capacity) || capacity < 1) throw new RangeError("PerformanceSampler capacity must be a positive integer");
  }

  get size() {
    return this.samples.length;
  }

  clear() {
    this.samples = [];
    this.cursor = 0;
  }

  record(sample: PerformanceSample) {
    const normalized: PerformanceSample = {
      frameMilliseconds: Math.max(0, Number.isFinite(sample.frameMilliseconds) ? sample.frameMilliseconds : 0),
      phaseSampled: sample.phaseSampled === true,
      activeCpuMilliseconds: Math.max(0, sample.activeCpuMilliseconds ?? 0),
      simulationMilliseconds: Math.max(0, sample.simulationMilliseconds ?? 0),
      mobSimulationMilliseconds: Math.max(0, sample.mobSimulationMilliseconds ?? 0),
      chunkWorkMilliseconds: Math.max(0, sample.chunkWorkMilliseconds ?? 0),
      chunkSchedulingMilliseconds: Math.max(0, sample.chunkSchedulingMilliseconds ?? 0),
      chunkGenerationMilliseconds: Math.max(0, sample.chunkGenerationMilliseconds ?? 0),
      chunkLightingMilliseconds: Math.max(0, sample.chunkLightingMilliseconds ?? 0),
      chunkMeshingMilliseconds: Math.max(0, sample.chunkMeshingMilliseconds ?? 0),
      chunkInstallationMilliseconds: Math.max(0, sample.chunkInstallationMilliseconds ?? 0),
      renderSubmissionMilliseconds: Math.max(0, sample.renderSubmissionMilliseconds ?? 0),
      postRenderMilliseconds: Math.max(0, sample.postRenderMilliseconds ?? 0),
      creaturePresentationMilliseconds: sample.phaseSampled ? Math.max(0, sample.creaturePresentationMilliseconds ?? 0) : undefined,
      environmentPresentationMilliseconds: sample.phaseSampled ? Math.max(0, sample.environmentPresentationMilliseconds ?? 0) : undefined,
      hudMilliseconds: sample.phaseSampled ? Math.max(0, sample.hudMilliseconds ?? 0) : undefined,
      gpuMilliseconds: sample.gpuMilliseconds === undefined || !Number.isFinite(sample.gpuMilliseconds)
        ? undefined
        : Math.max(0, sample.gpuMilliseconds),
      visibleChunks: Math.max(0, Math.round(sample.visibleChunks ?? 0)),
      simulatedEntities: Math.max(0, Math.round(sample.simulatedEntities ?? 0)),
      triangles: Math.max(0, Math.round(sample.triangles ?? 0)),
      drawCalls: Math.max(0, Math.round(sample.drawCalls ?? 0)),
      geometries: Math.max(0, Math.round(sample.geometries ?? 0)),
      textures: Math.max(0, Math.round(sample.textures ?? 0)),
      terrainSectionDrawCalls: sample.phaseSampled ? Math.max(0, Math.round(sample.terrainSectionDrawCalls ?? 0)) : undefined,
      terrainCombinedDrawCalls: sample.phaseSampled ? Math.max(0, Math.round(sample.terrainCombinedDrawCalls ?? 0)) : undefined,
      heroCreatureDrawCalls: sample.phaseSampled ? Math.max(0, Math.round(sample.heroCreatureDrawCalls ?? 0)) : undefined,
      articulatedCreatureDrawCalls: sample.phaseSampled ? Math.max(0, Math.round(sample.articulatedCreatureDrawCalls ?? 0)) : undefined,
      silhouetteCreatureDrawCalls: sample.phaseSampled ? Math.max(0, Math.round(sample.silhouetteCreatureDrawCalls ?? 0)) : undefined,
      otherDrawCalls: sample.phaseSampled ? Math.max(0, Math.round(sample.otherDrawCalls ?? 0)) : undefined,
    };
    if (this.samples.length < this.capacity) this.samples.push(normalized);
    else {
      this.samples[this.cursor] = normalized;
      this.cursor = (this.cursor + 1) % this.capacity;
    }
  }

  summary(longFrameThresholdMilliseconds = 25): PerformanceSummary {
    const frames = this.samples.map((sample) => sample.frameMilliseconds).sort((a, b) => a - b);
    const sampleCount = frames.length;
    const phaseSamples = this.samples.filter((sample) => sample.phaseSampled);
    const phaseSampleCount = phaseSamples.length;
    const sum = (selector: (sample: PerformanceSample) => number) =>
      this.samples.reduce((total, sample) => total + selector(sample), 0);
    const averageFrameMilliseconds = sampleCount ? sum((sample) => sample.frameMilliseconds) / sampleCount : 0;
    const max = (selector: (sample: PerformanceSample) => number) =>
      this.samples.reduce((peak, sample) => Math.max(peak, selector(sample)), 0);
    const phaseAverage = (selector: (sample: PerformanceSample) => number) => phaseSampleCount
      ? phaseSamples.reduce((total, sample) => total + selector(sample), 0) / phaseSampleCount
      : 0;
    const phaseMax = (selector: (sample: PerformanceSample) => number) =>
      phaseSamples.reduce((peak, sample) => Math.max(peak, selector(sample)), 0);
    const gpuSamples = this.samples.filter((sample) => sample.gpuMilliseconds !== undefined);
    return {
      sampleCount,
      phaseSampleCount,
      averageFrameMilliseconds,
      p50FrameMilliseconds: percentile(frames, 0.5),
      p95FrameMilliseconds: percentile(frames, 0.95),
      p99FrameMilliseconds: percentile(frames, 0.99),
      framesPerSecond: averageFrameMilliseconds > 0 ? 1000 / averageFrameMilliseconds : 0,
      longFrameRatio: sampleCount ? this.samples.filter((sample) => sample.frameMilliseconds >= longFrameThresholdMilliseconds).length / sampleCount : 0,
      averageActiveCpuMilliseconds: sampleCount ? sum((sample) => sample.activeCpuMilliseconds ?? 0) / sampleCount : 0,
      averageSimulationMilliseconds: sampleCount ? sum((sample) => sample.simulationMilliseconds ?? 0) / sampleCount : 0,
      averageMobSimulationMilliseconds: sampleCount ? sum((sample) => sample.mobSimulationMilliseconds ?? 0) / sampleCount : 0,
      averageChunkWorkMilliseconds: sampleCount ? sum((sample) => sample.chunkWorkMilliseconds ?? 0) / sampleCount : 0,
      averageChunkSchedulingMilliseconds: sampleCount ? sum((sample) => sample.chunkSchedulingMilliseconds ?? 0) / sampleCount : 0,
      averageChunkGenerationMilliseconds: sampleCount ? sum((sample) => sample.chunkGenerationMilliseconds ?? 0) / sampleCount : 0,
      averageChunkLightingMilliseconds: sampleCount ? sum((sample) => sample.chunkLightingMilliseconds ?? 0) / sampleCount : 0,
      averageChunkMeshingMilliseconds: sampleCount ? sum((sample) => sample.chunkMeshingMilliseconds ?? 0) / sampleCount : 0,
      averageChunkInstallationMilliseconds: sampleCount ? sum((sample) => sample.chunkInstallationMilliseconds ?? 0) / sampleCount : 0,
      averageRenderSubmissionMilliseconds: sampleCount ? sum((sample) => sample.renderSubmissionMilliseconds ?? 0) / sampleCount : 0,
      averagePostRenderMilliseconds: sampleCount ? sum((sample) => sample.postRenderMilliseconds ?? 0) / sampleCount : 0,
      averageCreaturePresentationMilliseconds: phaseAverage((sample) => sample.creaturePresentationMilliseconds ?? 0),
      averageEnvironmentPresentationMilliseconds: phaseAverage((sample) => sample.environmentPresentationMilliseconds ?? 0),
      averageHudMilliseconds: phaseAverage((sample) => sample.hudMilliseconds ?? 0),
      averageGpuMilliseconds: gpuSamples.length
        ? gpuSamples.reduce((total, sample) => total + (sample.gpuMilliseconds ?? 0), 0) / gpuSamples.length
        : null,
      gpuSampleCount: gpuSamples.length,
      peakVisibleChunks: max((sample) => sample.visibleChunks ?? 0),
      peakSimulatedEntities: max((sample) => sample.simulatedEntities ?? 0),
      peakTriangles: max((sample) => sample.triangles ?? 0),
      peakDrawCalls: max((sample) => sample.drawCalls ?? 0),
      peakGeometries: max((sample) => sample.geometries ?? 0),
      peakTextures: max((sample) => sample.textures ?? 0),
      peakTerrainSectionDrawCalls: phaseMax((sample) => sample.terrainSectionDrawCalls ?? 0),
      peakTerrainCombinedDrawCalls: phaseMax((sample) => sample.terrainCombinedDrawCalls ?? 0),
      peakHeroCreatureDrawCalls: phaseMax((sample) => sample.heroCreatureDrawCalls ?? 0),
      peakArticulatedCreatureDrawCalls: phaseMax((sample) => sample.articulatedCreatureDrawCalls ?? 0),
      peakSilhouetteCreatureDrawCalls: phaseMax((sample) => sample.silhouetteCreatureDrawCalls ?? 0),
      peakOtherDrawCalls: phaseMax((sample) => sample.otherDrawCalls ?? 0),
      frameHistogram: FRAME_HISTOGRAM_BOUNDS_MS.map((upperBoundMilliseconds) => ({
        upperBoundMilliseconds,
        count: frames.filter((frame) => frame <= upperBoundMilliseconds).length,
      })),
    };
  }

  /** Returns an interval summary and clears the window, avoiding overlap. */
  drainSummary(longFrameThresholdMilliseconds = 25) {
    const result = this.summary(longFrameThresholdMilliseconds);
    this.clear();
    return result;
  }
}

export type LongAnimationFrameSummary = Readonly<{
  supported: boolean;
  count: number;
  totalDurationMilliseconds: number;
  peakDurationMilliseconds: number;
  totalBlockingDurationMilliseconds: number;
  topScripts: readonly Readonly<{ key: string; durationMilliseconds: number; blockingDurationMilliseconds: number; occurrences: number }>[];
}>;

/** Browser-native long-frame observer. Unsupported engines remain a clean no-op. */
export class LongAnimationFrameSampler {
  private observer: PerformanceObserver | null = null;
  private count = 0;
  private totalDurationMilliseconds = 0;
  private peakDurationMilliseconds = 0;
  private totalBlockingDurationMilliseconds = 0;
  private scripts = new Map<string, { durationMilliseconds: number; blockingDurationMilliseconds: number; occurrences: number }>();
  readonly supported: boolean;

  constructor() {
    const entryTypes = typeof PerformanceObserver === "undefined" ? [] : PerformanceObserver.supportedEntryTypes ?? [];
    this.supported = entryTypes.includes("long-animation-frame");
    if (!this.supported) return;
    try {
      this.observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const typedEntry = entry as PerformanceEntry & {
            blockingDuration?: number;
            scripts?: readonly Readonly<{ sourceURL?: string; sourceFunctionName?: string; invoker?: string; duration?: number; forcedStyleAndLayoutDuration?: number; pauseDuration?: number }>[];
          };
          const blockingDuration = Number(typedEntry.blockingDuration ?? 0);
          this.count += 1;
          this.totalDurationMilliseconds += Math.max(0, entry.duration);
          this.peakDurationMilliseconds = Math.max(this.peakDurationMilliseconds, entry.duration);
          this.totalBlockingDurationMilliseconds += Math.max(0, blockingDuration);
          for (const script of typedEntry.scripts ?? []) {
            const key = `${script.sourceFunctionName || script.invoker || "anonymous"}@${script.sourceURL || "inline"}`.slice(0, 240);
            const current = this.scripts.get(key) ?? { durationMilliseconds: 0, blockingDurationMilliseconds: 0, occurrences: 0 };
            current.durationMilliseconds += Math.max(0, Number(script.duration ?? 0));
            current.blockingDurationMilliseconds += Math.max(0, Number(script.forcedStyleAndLayoutDuration ?? 0) + Number(script.pauseDuration ?? 0));
            current.occurrences += 1;
            this.scripts.set(key, current);
          }
        }
      });
      this.observer.observe({ type: "long-animation-frame", buffered: true });
    } catch {
      this.observer?.disconnect();
      this.observer = null;
      this.supported = false;
    }
  }

  drain(): LongAnimationFrameSummary {
    const result = Object.freeze({
      supported: this.supported,
      count: this.count,
      totalDurationMilliseconds: this.totalDurationMilliseconds,
      peakDurationMilliseconds: this.peakDurationMilliseconds,
      totalBlockingDurationMilliseconds: this.totalBlockingDurationMilliseconds,
      topScripts: [...this.scripts.entries()]
        .map(([key, value]) => ({ key, ...value }))
        .sort((a, b) => b.durationMilliseconds - a.durationMilliseconds)
        .slice(0, 8),
    });
    this.count = 0;
    this.totalDurationMilliseconds = 0;
    this.peakDurationMilliseconds = 0;
    this.totalBlockingDurationMilliseconds = 0;
    this.scripts.clear();
    return result;
  }

  dispose() { this.observer?.disconnect(); }
}

export type FrameWorkBudget = Readonly<{
  chunkGenerations: number;
  chunkMeshSections: number;
  liquidOperations: number;
  entitySteps: number;
  structureColumns: number;
  streamingFrameMilliseconds: number;
}>;

export function applyResourceMode(mode: ResourceMode, adaptive: FrameWorkBudget): FrameWorkBudget {
  if (mode !== "cpu") return adaptive;
  // CPU reserve is an allowance, never a floor. The adaptive controller must
  // remain free to retreat to its 2 ms safety budget when frames are late.
  return {
    chunkGenerations: Math.min(2, adaptive.chunkGenerations),
    chunkMeshSections: Math.min(5, adaptive.chunkMeshSections),
    liquidOperations: Math.min(384, adaptive.liquidOperations),
    entitySteps: Math.min(256, adaptive.entitySteps),
    structureColumns: Math.min(64, adaptive.structureColumns),
    streamingFrameMilliseconds: Math.min(7.5, adaptive.streamingFrameMilliseconds),
  };
}

export const chunkRetentionPadding = (mode: ResourceMode) => mode === "memory" ? 6 : 2;

export const DEFAULT_FRAME_WORK_BUDGET: FrameWorkBudget = Object.freeze({
  chunkGenerations: 1,
  chunkMeshSections: 3,
  liquidOperations: 192,
  entitySteps: 160,
  structureColumns: 32,
  streamingFrameMilliseconds: 5,
});

const MIN_FRAME_WORK_BUDGET: FrameWorkBudget = Object.freeze({
  chunkGenerations: 1,
  chunkMeshSections: 1,
  liquidOperations: 48,
  entitySteps: 48,
  structureColumns: 8,
  streamingFrameMilliseconds: 2,
});

const MAX_FRAME_WORK_BUDGET: FrameWorkBudget = Object.freeze({
  chunkGenerations: 3,
  chunkMeshSections: 8,
  liquidOperations: 768,
  entitySteps: 512,
  structureColumns: 128,
  streamingFrameMilliseconds: 10,
});

const scaleBudget = (budget: FrameWorkBudget, factor: number): FrameWorkBudget => {
  const scale = (key: keyof FrameWorkBudget) => Math.max(
    MIN_FRAME_WORK_BUDGET[key],
    Math.min(MAX_FRAME_WORK_BUDGET[key], Math.round(budget[key] * factor)),
  );
  return {
    chunkGenerations: scale("chunkGenerations"),
    chunkMeshSections: scale("chunkMeshSections"),
    liquidOperations: scale("liquidOperations"),
    entitySteps: scale("entitySteps"),
    structureColumns: scale("structureColumns"),
    streamingFrameMilliseconds: Math.max(
      MIN_FRAME_WORK_BUDGET.streamingFrameMilliseconds,
      Math.min(MAX_FRAME_WORK_BUDGET.streamingFrameMilliseconds, budget.streamingFrameMilliseconds * factor),
    ),
  };
};

export type BudgetPressure = "high" | "balanced" | "headroom";
export type StreamingDebtSignal = Readonly<{
  weightedDebt: number;
  oldestNearJobMilliseconds: number;
  immediateRingCompleteness: number;
}>;

export function classifyBudgetPressure(
  summary: PerformanceSummary,
  targetFrameMilliseconds = 1000 / 60,
  streaming?: StreamingDebtSignal,
): BudgetPressure {
  if (summary.sampleCount < 30) return "balanced";
  const framePressure = summary.p99FrameMilliseconds > targetFrameMilliseconds * 2.5
    || summary.p95FrameMilliseconds > targetFrameMilliseconds * 1.45
    || summary.longFrameRatio > 0.12;
  const activeCpuKnown = summary.averageActiveCpuMilliseconds > 0;
  if (framePressure && (!activeCpuKnown || summary.averageActiveCpuMilliseconds > targetFrameMilliseconds * 0.8)) return "high";
  if (streaming && (streaming.immediateRingCompleteness < 1 || streaming.oldestNearJobMilliseconds > 1_000)
    && summary.averageActiveCpuMilliseconds < targetFrameMilliseconds * 0.72
    && (!framePressure || streaming.immediateRingCompleteness < 1)) return "headroom";
  if (summary.p95FrameMilliseconds < targetFrameMilliseconds * 0.88 && summary.longFrameRatio < 0.02) return "headroom";
  return "balanced";
}

export function recommendFrameWorkBudget(
  summary: PerformanceSummary,
  current: FrameWorkBudget = DEFAULT_FRAME_WORK_BUDGET,
  targetFrameMilliseconds = 1000 / 60,
  streaming?: StreamingDebtSignal,
) {
  const pressure = classifyBudgetPressure(summary, targetFrameMilliseconds, streaming);
  if (pressure === "high") return scaleBudget(current, 0.75);
  if (pressure === "headroom") return scaleBudget(current, 1.2);
  return current;
}

/**
 * Adds hysteresis so one GC pause cannot make world streaming visibly pulse.
 * Feed it a summary every 1-2 seconds, not every frame.
 */
export class AdaptiveBudgetController {
  private repeatedPressure: BudgetPressure = "balanced";
  private repetitions = 0;

  constructor(
    private budget: FrameWorkBudget = DEFAULT_FRAME_WORK_BUDGET,
    readonly observationsBeforeChange = 3,
  ) {}

  get current() {
    return this.budget;
  }

  observe(summary: PerformanceSummary, targetFrameMilliseconds = 1000 / 60, streaming?: StreamingDebtSignal) {
    const pressure = classifyBudgetPressure(summary, targetFrameMilliseconds, streaming);
    if (pressure === "balanced") {
      this.repeatedPressure = pressure;
      this.repetitions = 0;
      return this.budget;
    }
    if (pressure !== this.repeatedPressure) {
      this.repeatedPressure = pressure;
      this.repetitions = 1;
      return this.budget;
    }
    this.repetitions += 1;
    if (this.repetitions >= this.observationsBeforeChange) {
      this.budget = recommendFrameWorkBudget(summary, this.budget, targetFrameMilliseconds, streaming);
      this.repetitions = 0;
    }
    return this.budget;
  }
}

export type TaskBenchmark<T> = Readonly<{
  label: string;
  milliseconds: number;
  result: T;
}>;

export function benchmarkTask<T>(label: string, task: () => T, now: () => number = () => performance.now()): TaskBenchmark<T> {
  const start = now();
  const result = task();
  return { label, milliseconds: Math.max(0, now() - start), result };
}
