import { performance } from "node:perf_hooks";
import { ChunkWorld } from "../app/game/world.ts";

type PassResult = Readonly<{
  label: string;
  frames: number;
  busyFrames: number;
  readiness: { transitionsReady: number; notReadyFrames: number; averageDelayFrames: number; maximumDelayFrames: number };
  updateMilliseconds: { average: number; p50: number; p95: number; p99: number; maximum: number };
  averageStageMilliseconds: Record<string, number>;
}>;

const percentile = (values: readonly number[], fraction: number) => {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))] ?? 0;
};

const runPass = (world: ChunkWorld, label: string, reverse: boolean): PassResult => {
  const samples: number[] = [];
  const stages = { scheduling: 0, generation: 0, lighting: 0, meshing: 0, installation: 0 };
  const readinessDelays: number[] = [];
  let busyFrames = 0;
  let notReadyFrames = 0;
  let routeChunkKey = "";
  let routeChunkEnteredFrame = 0;
  let routeChunkRecorded = false;
  for (let frame = 0; frame < 720; frame += 1) {
    const progress = reverse ? 719 - frame : frame;
    const routeChunk = Math.floor(progress / 72);
    const local = (progress % 72) / 72;
    const x = routeChunk * 16 + local * 16;
    const z = Math.sin(routeChunk * 0.8) * 32;
    const velocityX = reverse ? -4.5 : 4.5;
    const startedAt = performance.now();
    const report = world.update(x, z, 32, velocityX, 0);
    samples.push(performance.now() - startedAt);
    stages.scheduling += report.schedulingMilliseconds;
    stages.generation += report.generationMilliseconds;
    stages.lighting += report.lightingMilliseconds;
    stages.meshing += report.meshingMilliseconds;
    stages.installation += report.installationMilliseconds;
    if (report.generationSlices + report.lightingSlices + report.meshSlices + report.installationSlices > 0) busyFrames += 1;
    const diagnostics = world.streamingDiagnostics();
    if (diagnostics.playerChunk !== routeChunkKey) {
      routeChunkKey = diagnostics.playerChunk;
      routeChunkEnteredFrame = frame;
      routeChunkRecorded = false;
    }
    if (!diagnostics.playerChunkReady) notReadyFrames += 1;
    else if (!routeChunkRecorded) {
      readinessDelays.push(frame - routeChunkEnteredFrame);
      routeChunkRecorded = true;
    }
  }
  return {
    label,
    frames: samples.length,
    busyFrames,
    readiness: {
      transitionsReady: readinessDelays.length,
      notReadyFrames,
      averageDelayFrames: readinessDelays.reduce((sum, value) => sum + value, 0) / Math.max(1, readinessDelays.length),
      maximumDelayFrames: Math.max(0, ...readinessDelays),
    },
    updateMilliseconds: {
      average: samples.reduce((sum, value) => sum + value, 0) / samples.length,
      p50: percentile(samples, 0.5),
      p95: percentile(samples, 0.95),
      p99: percentile(samples, 0.99),
      maximum: Math.max(0, ...samples),
    },
    averageStageMilliseconds: Object.fromEntries(Object.entries(stages).map(([key, total]) => [key, total / samples.length])),
  };
};

const world = new ChunkWorld();
world.reset("WILDERNESS", undefined, { structures: false });
world.setRenderDistance(2);
world.setStreamingBudgets(1, 3, 5);
const cold = runPass(world, "cold-forward", false);
const warm = runPass(world, "cached-reverse", true);
let settleFrames = 0;
for (; settleFrames < 900; settleFrames += 1) {
  world.update(0, 0, 32, 0, 0);
  const diagnostics = world.streamingDiagnostics();
  if (diagnostics.immediateRing.ratio === 1 && diagnostics.midRing.ratio >= 0.95
    && diagnostics.debt.oldestNearJobMilliseconds === 0) break;
}
console.log(JSON.stringify({
  benchmark: "blockwild-streaming-v2",
  environment: { node: process.version, renderDistance: 2, framesPerPass: 720 },
  cold,
  warm,
  cacheEffect: {
    readinessFrameReduction: 1 - warm.readiness.notReadyFrames / Math.max(1, cold.readiness.notReadyFrames),
    averageUpdateReduction: 1 - warm.updateMilliseconds.average / Math.max(0.001, cold.updateMilliseconds.average),
    settleFrames,
  },
  final: world.streamingDiagnostics(),
}, null, 2));
world.dispose();
