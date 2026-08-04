import { readFileSync } from "node:fs";

type FrameHistogramBucket = Readonly<{ upperBoundMilliseconds: number; count: number }>;
type Summary = Record<string, number | null | readonly FrameHistogramBucket[] | undefined> & Readonly<{
  sampleCount?: number;
  frameHistogram?: readonly FrameHistogramBucket[];
}>;
type Snapshot = Readonly<{
  performance?: Summary;
  renderer?: Record<string, unknown>;
  entities?: Readonly<{ creatures?: number }>;
  world?: { streaming?: Record<string, unknown>; player?: { x: number; z: number } };
}>;
type Report = Readonly<{
  schema?: number;
  aggregation?: string;
  build?: Record<string, unknown>;
  samples?: readonly Snapshot[];
  elapsedSeconds?: number;
}>;

const path = process.argv[2];
if (!path) throw new Error("Usage: npm run analyze:performance -- <blockwild-performance.json>");
const report = JSON.parse(readFileSync(path, "utf8")) as Report;
const samples = report.samples ?? [];
const number = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : 0;
const weighted = (field: string) => {
  let total = 0;
  let weight = 0;
  for (const sample of samples) {
    const count = Math.max(1, number(sample.performance?.sampleCount));
    total += number(sample.performance?.[field]) * count;
    weight += count;
  }
  return weight ? total / weight : 0;
};
const final = samples.at(-1);
const first = samples.find((sample) => number(sample.performance?.sampleCount) > 0) ?? samples[0];
const nestedNumber = (sample: Snapshot | undefined, path: readonly string[]) => {
  let value: unknown = sample;
  for (const key of path) value = value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined;
  return number(value);
};
const phaseWeighted = (field: string) => {
  let total = 0;
  let weight = 0;
  for (const sample of samples) {
    const count = number(sample.performance?.phaseSampleCount);
    if (count <= 0) continue;
    total += number(sample.performance?.[field]) * count;
    weight += count;
  }
  return weight ? total / weight : 0;
};
const mergedHistogram = new Map<number, number>();
let histogramSamples = 0;
for (const sample of samples) {
  const histogram = sample.performance?.frameHistogram;
  if (!Array.isArray(histogram)) continue;
  histogramSamples += number(sample.performance?.sampleCount);
  for (const bucket of histogram) mergedHistogram.set(bucket.upperBoundMilliseconds, (mergedHistogram.get(bucket.upperBoundMilliseconds) ?? 0) + bucket.count);
}
const histogramPercentile = (fraction: number) => {
  if (!histogramSamples || !mergedHistogram.size) return 0;
  const target = histogramSamples * fraction;
  for (const [bound, count] of [...mergedHistogram].sort(([a], [b]) => a - b)) if (count >= target) return bound;
  return [...mergedHistogram.keys()].sort((a, b) => a - b).at(-1) ?? 0;
};
const delta = (path: readonly string[]) => nestedNumber(final, path) - nestedNumber(first, path);
const correlation = (x: (sample: Snapshot) => number, y: (sample: Snapshot) => number) => {
  const pairs = samples.map((sample) => [x(sample), y(sample)] as const).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
  if (pairs.length < 3) return null;
  const meanX = pairs.reduce((sum, [value]) => sum + value, 0) / pairs.length;
  const meanY = pairs.reduce((sum, [, value]) => sum + value, 0) / pairs.length;
  let covariance = 0;
  let varianceX = 0;
  let varianceY = 0;
  for (const [a, b] of pairs) {
    covariance += (a - meanX) * (b - meanY);
    varianceX += (a - meanX) ** 2;
    varianceY += (b - meanY) ** 2;
  }
  return varianceX > 0 && varianceY > 0 ? covariance / Math.sqrt(varianceX * varianceY) : null;
};
const frame = (sample: Snapshot) => number(sample.performance?.averageFrameMilliseconds);
let distance = 0;
for (let index = 1; index < samples.length; index += 1) {
  const previous = samples[index - 1].world?.player;
  const current = samples[index].world?.player;
  if (previous && current) distance += Math.hypot(current.x - previous.x, current.z - previous.z);
}
console.log(JSON.stringify({
  schema: report.schema ?? 1,
  build: report.build ?? null,
  warning: (report.schema ?? 1) < 3
    ? "Legacy capture: this run predates build provenance, true session histograms, worker readiness, and creature LOD diagnostics. Verify the deployed endpoint before further tuning."
    : null,
  aggregation: report.aggregation ?? "legacy-overlapping-rolling-windows",
  elapsedSeconds: report.elapsedSeconds ?? 0,
  exportedWindows: samples.length,
  routeDistance: distance,
  weightedFrameMilliseconds: weighted("averageFrameMilliseconds"),
  weightedP95FrameMilliseconds: weighted("p95FrameMilliseconds"),
  weightedP99FrameMilliseconds: weighted("p99FrameMilliseconds"),
  sessionP50FrameMilliseconds: histogramPercentile(0.5),
  sessionP95FrameMilliseconds: histogramPercentile(0.95),
  sessionP99FrameMilliseconds: histogramPercentile(0.99),
  histogramFrameSamples: histogramSamples,
  weightedLongFrameRatio: weighted("longFrameRatio"),
  weightedActiveCpuMilliseconds: weighted("averageActiveCpuMilliseconds"),
  weightedSimulationMilliseconds: weighted("averageSimulationMilliseconds"),
  weightedMobSimulationMilliseconds: weighted("averageMobSimulationMilliseconds"),
  weightedChunkMilliseconds: weighted("averageChunkWorkMilliseconds"),
  weightedRenderSubmissionMilliseconds: weighted("averageRenderSubmissionMilliseconds"),
  sampledCreaturePresentationMilliseconds: phaseWeighted("averageCreaturePresentationMilliseconds"),
  sampledEnvironmentPresentationMilliseconds: phaseWeighted("averageEnvironmentPresentationMilliseconds"),
  sampledHudMilliseconds: phaseWeighted("averageHudMilliseconds"),
  weightedGpuMilliseconds: weighted("averageGpuMilliseconds"),
  correlations: {
    frameVsRenderSubmission: correlation(frame, (sample) => number(sample.performance?.averageRenderSubmissionMilliseconds)),
    frameVsChunkWork: correlation(frame, (sample) => number(sample.performance?.averageChunkWorkMilliseconds)),
    frameVsMobSimulation: correlation(frame, (sample) => number(sample.performance?.averageMobSimulationMilliseconds)),
    frameVsDrawCalls: correlation(frame, (sample) => number(sample.renderer?.drawCalls)),
    frameVsGeometries: correlation(frame, (sample) => number(sample.renderer?.geometries)),
    frameVsCreatures: correlation(frame, (sample) => number(sample.entities?.creatures)),
    frameVsLoadedChunks: correlation(frame, (sample) => nestedNumber(sample, ["world", "loadedChunks"])),
    frameVsCreaturePresentation: correlation(frame, (sample) => number(sample.performance?.averageCreaturePresentationMilliseconds)),
    frameVsEnvironmentPresentation: correlation(frame, (sample) => number(sample.performance?.averageEnvironmentPresentationMilliseconds)),
    frameVsTerrainSectionDraws: correlation(frame, (sample) => number(sample.performance?.peakTerrainSectionDrawCalls)),
    frameVsHeroCreatureDraws: correlation(frame, (sample) => number(sample.performance?.peakHeroCreatureDrawCalls)),
    frameVsArticulatedCreatures: correlation(frame, (sample) => nestedNumber(sample, ["renderer", "articulatedRender", "activeCreatures"])),
    frameVsSilhouetteCreatures: correlation(frame, (sample) => nestedNumber(sample, ["renderer", "renderLod", "activeInstances"])),
  },
  captureDeltas: {
    terrainMergeSubmissions: delta(["world", "streaming", "terrainWorker", "submitted"]),
    terrainTransferBytes: delta(["world", "streaming", "terrainWorker", "transferBytes"]),
    staleTerrainMerges: delta(["world", "streaming", "terrainWorker", "staleResults"]),
    geometriesCreated: delta(["world", "streaming", "terrainSubmission", "geometriesCreated"]),
    geometriesDisposed: delta(["world", "streaming", "terrainSubmission", "geometriesDisposed"]),
    coalescedTerrainMerges: delta(["world", "streaming", "terrainWorker", "coalescedRequests"]),
    invalidatedCombinedMeshes: delta(["world", "streaming", "terrainSubmission", "invalidatedCombinedMeshes"]),
  },
  finalRenderer: final?.renderer ?? null,
  finalStreaming: final?.world?.streaming ?? null,
}, null, 2));
