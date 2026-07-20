import assert from "node:assert/strict";
import test from "node:test";
import {
  AdaptiveBudgetController,
  advanceSentientCoarseSimulation,
  applyResourceMode,
  DEFAULT_FRAME_WORK_BUDGET,
  DEFAULT_RENDER_DISTANCE,
  DEFAULT_SIMULATION_DISTANCE,
  MAX_RENDER_DISTANCE,
  PerformanceSampler,
  benchmarkTask,
  chunkOffsetsByDistance,
  chunksWithinDistance,
  chunkRetentionPadding,
  classifyBudgetPressure,
  normalizeViewDistances,
  recommendFrameWorkBudget,
  sentientSimulationTier,
  SENTIENT_COARSE_STEP_SECONDS,
  SENTIENT_FULL_DETAIL_DISTANCE,
} from "../app/game/performance.ts";

test("view distances default to 10/8 and simulation never exceeds rendering", () => {
  assert.deepEqual(normalizeViewDistances(undefined), {
    renderDistance: DEFAULT_RENDER_DISTANCE,
    simulationDistance: DEFAULT_SIMULATION_DISTANCE,
  });
  assert.deepEqual(normalizeViewDistances({ renderDistance: 99, simulationDistance: 99 }), {
    renderDistance: MAX_RENDER_DISTANCE,
    simulationDistance: MAX_RENDER_DISTANCE,
  });
  assert.deepEqual(normalizeViewDistances({ renderDistance: 6, simulationDistance: 12 }), {
    renderDistance: 6,
    simulationDistance: 6,
  });
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
    chunkWorkMilliseconds: 4,
    chunkSchedulingMilliseconds: 0.25,
    chunkGenerationMilliseconds: 1,
    chunkLightingMilliseconds: 1.25,
    chunkMeshingMilliseconds: 1.5,
    visibleChunks: 441,
    triangles: 120_000,
    drawCalls: 780,
    geometries: 640,
    textures: 38,
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
  assert.equal(classifyBudgetPressure(smoothSummary), "headroom");
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

test("resource modes trade CPU or memory for steadier traversal", () => {
  const cpu = applyResourceMode("cpu", DEFAULT_FRAME_WORK_BUDGET);
  assert.ok(cpu.chunkMeshSections >= 5);
  assert.ok(cpu.liquidOperations >= 384);
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
