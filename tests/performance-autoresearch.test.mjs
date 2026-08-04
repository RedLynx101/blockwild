import assert from "node:assert/strict";
import test from "node:test";
import { SCENARIO_LABELS, summarizeRuns } from "../scripts/autoresearch/blockwild-performance-evaluator.mjs";

function fixture(multiplier = 1) {
  return {
    scenarios: SCENARIO_LABELS.map((label, index) => ({
      label,
      averageMilliseconds: (index + 1) * multiplier,
      p95Milliseconds: (index + 2) * multiplier,
      p99Milliseconds: (index + 3) * multiplier,
      maximumMilliseconds: (index + 4) * multiplier,
    })),
    finalStreaming: { playerChunkReady: true, generationQueued: 24, cache: { memory: { misses: 0 } } },
    creatureAdmission: { criticalHeroes: 2, tiers: { hero: 9, articulated: 41, silhouette: 32, hidden: 18 } },
    creatureLod: { activeBatches: 1 },
    creatureArticulation: { activeBatches: 1 },
  };
}

test("autoresearch evaluator keeps its scenario contract and geometric score fixed", () => {
  const baseline = summarizeRuns([fixture(), fixture(), fixture()]);
  const candidate = summarizeRuns([fixture(0.9), fixture(0.9), fixture(0.9)], baseline);
  assert.deepEqual(Object.keys(candidate.scenarioMedians), SCENARIO_LABELS);
  assert.ok(Math.abs(candidate.normalizedScore - 0.9) < 1e-12);
  assert.ok(Math.abs(candidate.worstScenarioRatio - 0.9) < 1e-12);
  assert.ok(Object.values(candidate.guardrails).every(Boolean));
});

test("autoresearch guardrails veto missing readiness and batches", () => {
  const broken = fixture();
  broken.finalStreaming.playerChunkReady = false;
  broken.creatureArticulation.activeBatches = 0;
  const summary = summarizeRuns([broken]);
  assert.equal(summary.guardrails.playerChunkReady, false);
  assert.equal(summary.guardrails.creatureBatchesPresent, false);
});
