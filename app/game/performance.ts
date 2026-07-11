/** Performance policy and low-overhead instrumentation for the world loop. */

export const MIN_RENDER_DISTANCE = 2;
export const DEFAULT_RENDER_DISTANCE = 10;
export const MAX_RENDER_DISTANCE = 16;
export const DEFAULT_SIMULATION_DISTANCE = 8;
export type ResourceMode = "auto" | "cpu" | "memory";

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
}>;

const finiteInteger = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;

export function normalizeViewDistances(value: Partial<ViewDistanceSettings> | null | undefined): ViewDistanceSettings {
  const renderDistance = Math.max(
    MIN_RENDER_DISTANCE,
    Math.min(MAX_RENDER_DISTANCE, finiteInteger(value?.renderDistance, DEFAULT_RENDER_DISTANCE)),
  );
  const simulationDistance = Math.max(
    MIN_RENDER_DISTANCE,
    Math.min(renderDistance, finiteInteger(value?.simulationDistance, DEFAULT_SIMULATION_DISTANCE)),
  );
  return { renderDistance, simulationDistance };
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
  simulationMilliseconds?: number;
  chunkWorkMilliseconds?: number;
  visibleChunks?: number;
  simulatedEntities?: number;
  triangles?: number;
}>;

export type PerformanceSummary = Readonly<{
  sampleCount: number;
  averageFrameMilliseconds: number;
  p50FrameMilliseconds: number;
  p95FrameMilliseconds: number;
  p99FrameMilliseconds: number;
  framesPerSecond: number;
  longFrameRatio: number;
  averageSimulationMilliseconds: number;
  averageChunkWorkMilliseconds: number;
  peakVisibleChunks: number;
  peakSimulatedEntities: number;
  peakTriangles: number;
}>;

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
      simulationMilliseconds: Math.max(0, sample.simulationMilliseconds ?? 0),
      chunkWorkMilliseconds: Math.max(0, sample.chunkWorkMilliseconds ?? 0),
      visibleChunks: Math.max(0, Math.round(sample.visibleChunks ?? 0)),
      simulatedEntities: Math.max(0, Math.round(sample.simulatedEntities ?? 0)),
      triangles: Math.max(0, Math.round(sample.triangles ?? 0)),
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
    const sum = (selector: (sample: PerformanceSample) => number) =>
      this.samples.reduce((total, sample) => total + selector(sample), 0);
    const averageFrameMilliseconds = sampleCount ? sum((sample) => sample.frameMilliseconds) / sampleCount : 0;
    const max = (selector: (sample: PerformanceSample) => number) =>
      this.samples.reduce((peak, sample) => Math.max(peak, selector(sample)), 0);
    return {
      sampleCount,
      averageFrameMilliseconds,
      p50FrameMilliseconds: percentile(frames, 0.5),
      p95FrameMilliseconds: percentile(frames, 0.95),
      p99FrameMilliseconds: percentile(frames, 0.99),
      framesPerSecond: averageFrameMilliseconds > 0 ? 1000 / averageFrameMilliseconds : 0,
      longFrameRatio: sampleCount ? this.samples.filter((sample) => sample.frameMilliseconds >= longFrameThresholdMilliseconds).length / sampleCount : 0,
      averageSimulationMilliseconds: sampleCount ? sum((sample) => sample.simulationMilliseconds ?? 0) / sampleCount : 0,
      averageChunkWorkMilliseconds: sampleCount ? sum((sample) => sample.chunkWorkMilliseconds ?? 0) / sampleCount : 0,
      peakVisibleChunks: max((sample) => sample.visibleChunks ?? 0),
      peakSimulatedEntities: max((sample) => sample.simulatedEntities ?? 0),
      peakTriangles: max((sample) => sample.triangles ?? 0),
    };
  }
}

export type FrameWorkBudget = Readonly<{
  chunkGenerations: number;
  chunkMeshSections: number;
  liquidOperations: number;
  entitySteps: number;
  structureColumns: number;
}>;

export function applyResourceMode(mode: ResourceMode, adaptive: FrameWorkBudget): FrameWorkBudget {
  if (mode !== "cpu") return adaptive;
  return {
    chunkGenerations: Math.max(2, adaptive.chunkGenerations),
    chunkMeshSections: Math.max(5, adaptive.chunkMeshSections),
    liquidOperations: Math.max(384, adaptive.liquidOperations),
    entitySteps: Math.max(256, adaptive.entitySteps),
    structureColumns: Math.max(64, adaptive.structureColumns),
  };
}

export const chunkRetentionPadding = (mode: ResourceMode) => mode === "memory" ? 6 : 2;

export const DEFAULT_FRAME_WORK_BUDGET: FrameWorkBudget = Object.freeze({
  chunkGenerations: 1,
  chunkMeshSections: 3,
  liquidOperations: 192,
  entitySteps: 160,
  structureColumns: 32,
});

const MIN_FRAME_WORK_BUDGET: FrameWorkBudget = Object.freeze({
  chunkGenerations: 1,
  chunkMeshSections: 1,
  liquidOperations: 48,
  entitySteps: 48,
  structureColumns: 8,
});

const MAX_FRAME_WORK_BUDGET: FrameWorkBudget = Object.freeze({
  chunkGenerations: 3,
  chunkMeshSections: 8,
  liquidOperations: 768,
  entitySteps: 512,
  structureColumns: 128,
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
  };
};

export type BudgetPressure = "high" | "balanced" | "headroom";

export function classifyBudgetPressure(summary: PerformanceSummary, targetFrameMilliseconds = 1000 / 60): BudgetPressure {
  if (summary.sampleCount < 30) return "balanced";
  if (summary.p95FrameMilliseconds > targetFrameMilliseconds * 1.45 || summary.longFrameRatio > 0.12) return "high";
  if (summary.p95FrameMilliseconds < targetFrameMilliseconds * 0.88 && summary.longFrameRatio < 0.02) return "headroom";
  return "balanced";
}

export function recommendFrameWorkBudget(
  summary: PerformanceSummary,
  current: FrameWorkBudget = DEFAULT_FRAME_WORK_BUDGET,
  targetFrameMilliseconds = 1000 / 60,
) {
  const pressure = classifyBudgetPressure(summary, targetFrameMilliseconds);
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

  observe(summary: PerformanceSummary, targetFrameMilliseconds = 1000 / 60) {
    const pressure = classifyBudgetPressure(summary, targetFrameMilliseconds);
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
      this.budget = recommendFrameWorkBudget(summary, this.budget, targetFrameMilliseconds);
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
