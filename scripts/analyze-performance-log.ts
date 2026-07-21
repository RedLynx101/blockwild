import { readFileSync } from "node:fs";

type Summary = Record<string, number | null | undefined> & Readonly<{ sampleCount?: number }>;
type Snapshot = Readonly<{
  performance?: Summary;
  renderer?: Record<string, number>;
  world?: { streaming?: Record<string, unknown>; player?: { x: number; z: number } };
}>;
type Report = Readonly<{ schema?: number; aggregation?: string; samples?: readonly Snapshot[]; elapsedSeconds?: number }>;

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
let distance = 0;
for (let index = 1; index < samples.length; index += 1) {
  const previous = samples[index - 1].world?.player;
  const current = samples[index].world?.player;
  if (previous && current) distance += Math.hypot(current.x - previous.x, current.z - previous.z);
}
console.log(JSON.stringify({
  schema: report.schema ?? 1,
  aggregation: report.aggregation ?? "legacy-overlapping-rolling-windows",
  elapsedSeconds: report.elapsedSeconds ?? 0,
  exportedWindows: samples.length,
  routeDistance: distance,
  weightedFrameMilliseconds: weighted("averageFrameMilliseconds"),
  weightedActiveCpuMilliseconds: weighted("averageActiveCpuMilliseconds"),
  weightedSimulationMilliseconds: weighted("averageSimulationMilliseconds"),
  weightedMobSimulationMilliseconds: weighted("averageMobSimulationMilliseconds"),
  weightedChunkMilliseconds: weighted("averageChunkWorkMilliseconds"),
  weightedRenderSubmissionMilliseconds: weighted("averageRenderSubmissionMilliseconds"),
  weightedGpuMilliseconds: weighted("averageGpuMilliseconds"),
  finalRenderer: final?.renderer ?? null,
  finalStreaming: final?.world?.streaming ?? null,
}, null, 2));
