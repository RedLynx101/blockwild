import assert from "node:assert/strict";
import test from "node:test";
import {
  AdaptiveBudgetController,
  advanceCreatureSimulation,
  creatureSimulationPhase,
  advanceSentientCoarseSimulation,
  applyResourceMode,
  DEFAULT_FRAME_WORK_BUDGET,
  DEFAULT_RENDER_DISTANCE,
  DEFAULT_SIMULATION_DISTANCE,
  MAX_BASIC_RENDER_DISTANCE,
  MAX_RENDER_DISTANCE,
  PerformanceSampler,
  benchmarkTask,
  chunkOffsetsByDistance,
  chunksWithinDistance,
  chunkRetentionPadding,
  classifyBudgetPressure,
  creatureSimulationTier,
  normalizeViewDistances,
  recommendFrameWorkBudget,
  sentientSimulationTier,
  SENTIENT_COARSE_STEP_SECONDS,
  SENTIENT_FULL_DETAIL_DISTANCE,
} from "../app/game/performance.ts";
import {
  CreatureRenderAdmissionController,
  creatureHeroBudget,
} from "../app/game/creature-render-admission.ts";
import { CreatureArticulatedBatcher } from "../app/game/creature-articulated-batcher.ts";

test("view distances preserve simulation <= render <= basic", () => {
  assert.deepEqual(normalizeViewDistances(undefined), {
    renderDistance: DEFAULT_RENDER_DISTANCE,
    simulationDistance: DEFAULT_SIMULATION_DISTANCE,
    basicRenderDistance: DEFAULT_RENDER_DISTANCE,
  });
  assert.deepEqual(normalizeViewDistances({ renderDistance: 99, simulationDistance: 99 }), {
    renderDistance: MAX_RENDER_DISTANCE,
    simulationDistance: MAX_RENDER_DISTANCE,
    basicRenderDistance: MAX_RENDER_DISTANCE,
  });
  assert.deepEqual(normalizeViewDistances({ renderDistance: 6, simulationDistance: 12, basicRenderDistance: 4 }), {
    renderDistance: 6,
    simulationDistance: 6,
    basicRenderDistance: 6,
  });
  assert.equal(normalizeViewDistances({ basicRenderDistance: 99 }).basicRenderDistance, DEFAULT_RENDER_DISTANCE);
  assert.equal(
    normalizeViewDistances({ basicRenderDistance: 99 }, { basicRenderDistanceEnabled: true }).basicRenderDistance,
    MAX_BASIC_RENDER_DISTANCE,
    "an explicit debug build restores the previous far-field distance",
  );
  assert.equal(
    normalizeViewDistances({ renderDistance: 6, basicRenderDistance: 18 }, { basicRenderDistanceEnabled: true }).basicRenderDistance,
    18,
  );
});

test("chunk estimates and streaming order are exact", () => {
  assert.equal(chunksWithinDistance(10), 441);
  assert.equal(chunksWithinDistance(16), 1089);
  const offsets = chunkOffsetsByDistance(2);
  assert.equal(offsets.length, 25);
  assert.deepEqual(offsets[0], { x: 0, z: 0, distance: 0 });
  assert.equal(offsets.at(-1)?.distance, 2);
});

test("the fixed sampler reports percentiles and adaptive pressure", () => {
  const smooth = new PerformanceSampler(60);
  for (let index = 0; index < 60; index += 1) smooth.record({
    frameMilliseconds: 10,
    phaseSampled: index % 12 === 0,
    activeCpuMilliseconds: 8,
    mobSimulationMilliseconds: 2,
    chunkWorkMilliseconds: 4,
    chunkSchedulingMilliseconds: 0.25,
    chunkGenerationMilliseconds: 1,
    chunkLightingMilliseconds: 1.25,
    chunkMeshingMilliseconds: 1.5,
    renderSubmissionMilliseconds: 1.25,
    gpuMilliseconds: 4,
    visibleChunks: 441,
    triangles: 120_000,
    drawCalls: 780,
    geometries: 640,
    textures: 38,
    creaturePresentationMilliseconds: 0.75,
    environmentPresentationMilliseconds: 0.5,
    hudMilliseconds: 0.25,
    terrainSectionDrawCalls: 40,
    terrainCombinedDrawCalls: 20,
    heroCreatureDrawCalls: 80,
    articulatedCreatureDrawCalls: 1,
    silhouetteCreatureDrawCalls: 1,
    otherDrawCalls: 638,
  });
  const smoothSummary = smooth.summary();
  assert.equal(smoothSummary.sampleCount, 60);
  assert.equal(smoothSummary.framesPerSecond, 100);
  assert.equal(smoothSummary.peakVisibleChunks, 441);
  assert.equal(smoothSummary.peakDrawCalls, 780);
  assert.equal(smoothSummary.peakGeometries, 640);
  assert.equal(smoothSummary.peakTextures, 38);
  assert.equal(smoothSummary.averageChunkWorkMilliseconds, 4);
  assert.equal(smoothSummary.averageChunkSchedulingMilliseconds, 0.25);
  assert.equal(smoothSummary.averageChunkGenerationMilliseconds, 1);
  assert.equal(smoothSummary.averageChunkLightingMilliseconds, 1.25);
  assert.equal(smoothSummary.averageChunkMeshingMilliseconds, 1.5);
  assert.equal(smoothSummary.averageActiveCpuMilliseconds, 8);
  assert.equal(smoothSummary.averageMobSimulationMilliseconds, 2);
  assert.equal(smoothSummary.averageRenderSubmissionMilliseconds, 1.25);
  assert.equal(smoothSummary.averageGpuMilliseconds, 4);
  assert.equal(smoothSummary.gpuSampleCount, 60);
  assert.equal(smoothSummary.phaseSampleCount, 5);
  assert.equal(smoothSummary.averageCreaturePresentationMilliseconds, 0.75);
  assert.equal(smoothSummary.averageEnvironmentPresentationMilliseconds, 0.5);
  assert.equal(smoothSummary.averageHudMilliseconds, 0.25);
  assert.equal(smoothSummary.peakHeroCreatureDrawCalls, 80);
  assert.equal(smoothSummary.peakArticulatedCreatureDrawCalls, 1);
  assert.equal(smoothSummary.peakSilhouetteCreatureDrawCalls, 1);
  assert.equal(classifyBudgetPressure(smoothSummary), "headroom");
  assert.equal(classifyBudgetPressure({ ...smoothSummary, p95FrameMilliseconds: 16, averageActiveCpuMilliseconds: 7 }, 1000 / 60, {
    weightedDebt: 20,
    oldestNearJobMilliseconds: 1_500,
    immediateRingCompleteness: 0.8,
  }), "headroom", "streaming debt may borrow proven CPU headroom without ignoring p99 stalls");
  assert.equal(classifyBudgetPressure({
    ...smoothSummary,
    p95FrameMilliseconds: 50,
    p99FrameMilliseconds: 50,
    longFrameRatio: 0.6,
    averageActiveCpuMilliseconds: 4.5,
  }, 1000 / 60, {
    weightedDebt: 50,
    oldestNearJobMilliseconds: 5_000,
    immediateRingCompleteness: 0.9,
  }), "headroom", "GPU-bound presentation stalls may repair an incomplete immediate ring");
  assert.equal(classifyBudgetPressure({
    ...smoothSummary,
    p95FrameMilliseconds: 50,
    p99FrameMilliseconds: 50,
    longFrameRatio: 0.6,
    averageActiveCpuMilliseconds: 4.5,
  }, 1000 / 60, {
    weightedDebt: 50,
    oldestNearJobMilliseconds: 5_000,
    immediateRingCompleteness: 1,
  }), "balanced", "GPU-bound far-field debt must not consume unlimited main-thread time");
  assert.ok(recommendFrameWorkBudget(smoothSummary).liquidOperations > DEFAULT_FRAME_WORK_BUDGET.liquidOperations);

  const slow = new PerformanceSampler(60);
  for (let index = 0; index < 60; index += 1) slow.record({ frameMilliseconds: 38, simulationMilliseconds: 9 });
  const slowSummary = slow.summary();
  assert.equal(classifyBudgetPressure(slowSummary), "high");
  assert.ok(recommendFrameWorkBudget(slowSummary).entitySteps < DEFAULT_FRAME_WORK_BUDGET.entitySteps);

  const controller = new AdaptiveBudgetController(DEFAULT_FRAME_WORK_BUDGET, 3);
  controller.observe(slowSummary);
  controller.observe(slowSummary);
  assert.deepEqual(controller.current, DEFAULT_FRAME_WORK_BUDGET);
  controller.observe(slowSummary);
  assert.ok(controller.current.liquidOperations < DEFAULT_FRAME_WORK_BUDGET.liquidOperations);
});

test("telemetry interval summaries drain instead of overlapping", () => {
  const sampler = new PerformanceSampler(60);
  sampler.record({ frameMilliseconds: 10 });
  sampler.record({ frameMilliseconds: 20 });
  const first = sampler.drainSummary();
  assert.equal(first.averageFrameMilliseconds, 15);
  assert.equal(first.frameHistogram.find((bucket) => bucket.upperBoundMilliseconds === 25)?.count, 2);
  assert.equal(sampler.size, 0);
  sampler.record({ frameMilliseconds: 30 });
  assert.equal(sampler.drainSummary().averageFrameMilliseconds, 30);
});

test("ordinary wildlife uses deterministic full, active, coarse, and sleep tiers", () => {
  assert.equal(creatureSimulationTier({ distance: 10, simulationRadius: 140 }), "full");
  assert.equal(creatureSimulationTier({ distance: 48, simulationRadius: 140 }), "active");
  assert.equal(creatureSimulationTier({ distance: 90, simulationRadius: 140 }), "coarse");
  assert.equal(creatureSimulationTier({ distance: 141, simulationRadius: 140 }), "sleep");
  assert.equal(creatureSimulationTier({ distance: 90, simulationRadius: 140, requiresFullDetail: true }), "full");
  let accumulator = 0;
  let activeUpdates = 0;
  for (let frame = 0; frame < 60; frame += 1) {
    const step = advanceCreatureSimulation("active", accumulator, 1 / 60);
    accumulator = step.accumulator;
    if (step.advance) activeUpdates += 1;
  }
  assert.equal(activeUpdates, 10);
  assert.notEqual(creatureSimulationPhase(1, "active"), creatureSimulationPhase(2, "active"));
  assert.equal(creatureSimulationPhase(9, "active"), creatureSimulationPhase(1, "active"));
});

test("creature render admission preserves critical heroes while shedding distant work", () => {
  const controller = new CreatureRenderAdmissionController();
  const candidates = Array.from({ length: 30 }, (_, index) => ({
    id: index + 1,
    distance: 10 + index * 3,
    projectedSize: 1 / (index + 1),
    inFrustum: index < 24,
    critical: index === 29,
    important: index === 12,
    engaged: index === 1,
  }));
  controller.evaluate(candidates, { averageFrameMilliseconds: 42, drawCalls: 900 }, 1_000);
  assert.equal(controller.tierFor(30), "hero", "critical creatures never lose authored presentation");
  assert.equal(controller.tierFor(2), "hero", "an engaged visible threat wins admission");
  assert.equal(controller.tierFor(29), "hidden", "off-camera distant work is not submitted");
  assert.ok(controller.diagnostics().tiers.hero <= creatureHeroBudget({ averageFrameMilliseconds: 42, drawCalls: 900 }) + 1);
  assert.ok(controller.diagnostics().tiers.articulated > 0);
});

test("the middle-distance creature tier batches articulated silhouettes into one draw", () => {
  const batcher = new CreatureArticulatedBatcher();
  batcher.update(Array.from({ length: 20 }, (_, index) => ({
    id: index,
    kind: "meadow-cow" as const,
    color: 0x6b8f52,
    accentColor: 0xd5c38c,
    movement: "ground" as const,
    position: { x: index * 2, y: 0, z: 0 },
    yaw: 0,
    width: 1.1,
    height: 1.25,
    depth: 1.4,
    gait: index * 0.2,
    age: 3,
  })));
  const diagnostics = batcher.diagnostics();
  assert.equal(diagnostics.activeCreatures, 20);
  assert.equal(diagnostics.activeBatches, 1);
  assert.equal(diagnostics.activeParts, 180);
  assert.ok(diagnostics.allocatedCapacity >= diagnostics.activeParts);
  batcher.dispose();
});

test("resource modes trade CPU or memory for steadier traversal", () => {
  const cpu = applyResourceMode("cpu", DEFAULT_FRAME_WORK_BUDGET);
  assert.deepEqual(cpu, DEFAULT_FRAME_WORK_BUDGET, "CPU reserve must not override adaptive retreat with hard minimums");
  const headroom = applyResourceMode("cpu", {
    chunkGenerations: 8,
    chunkMeshSections: 12,
    liquidOperations: 1_024,
    entitySteps: 1_024,
    structureColumns: 512,
    streamingFrameMilliseconds: 20,
  });
  assert.deepEqual(headroom, {
    chunkGenerations: 2,
    chunkMeshSections: 5,
    liquidOperations: 384,
    entitySteps: 256,
    structureColumns: 64,
    streamingFrameMilliseconds: 7.5,
  });
  assert.deepEqual(applyResourceMode("memory", DEFAULT_FRAME_WORK_BUDGET), DEFAULT_FRAME_WORK_BUDGET);
  assert.equal(chunkRetentionPadding("auto"), 2);
  assert.equal(chunkRetentionPadding("memory"), 6);
});

test("task benchmarks accept an injectable clock", () => {
  const times = [5, 8.75];
  const measured = benchmarkTask("chunk-mesh", () => 42, () => times.shift() ?? 0);
  assert.deepEqual(measured, { label: "chunk-mesh", milliseconds: 3.75, result: 42 });
});

test("sentient towns keep full nearby detail and throttle distant residents", () => {
  assert.equal(sentientSimulationTier({ distance: 5, simulationRadius: 138 }), "full", "conversation range must never use a proxy");
  assert.equal(sentientSimulationTier({ distance: SENTIENT_FULL_DETAIL_DISTANCE + 1, simulationRadius: 138 }), "coarse");
  assert.equal(sentientSimulationTier({ distance: 139, simulationRadius: 138 }), "sleep");
  assert.equal(sentientSimulationTier({ distance: 80, simulationRadius: 138, requiresFullDetail: true }), "full", "active followers can force a full simulation tick");
  assert.ok(SENTIENT_COARSE_STEP_SECONDS >= 0.1, "distant residents should run at no more than ten AI updates per second");
  assert.ok(Math.ceil(1 / SENTIENT_COARSE_STEP_SECONDS) <= 5, "the authored coarse policy should reduce 60 Hz AI work by at least twelvefold");
  let accumulator = 0;
  let updates = 0;
  for (let frame = 0; frame < 60; frame += 1) {
    const step = advanceSentientCoarseSimulation(accumulator, 1 / 60);
    accumulator = step.accumulator;
    if (step.advance) updates += 1;
  }
  assert.equal(updates, 5, "sixty rendered frames should schedule exactly five distant resident AI steps");
});
