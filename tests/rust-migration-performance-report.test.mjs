import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMigrationPerformanceComparison,
  renderComparisonMarkdown,
  renderComparisonSvg,
} from "../scripts/report-rust-migration-performance.mjs";

const summary = (label, factor = 1) => ({
  schema: 1,
  label,
  repetitions: 5,
  environment: {
    platform: "win32",
    architecture: "x64",
    cpu: "fixture",
    logicalCpuCount: 20,
  },
  scenarioMedians: {
    walk: {
      averageMilliseconds: 10 * factor,
      p95Milliseconds: 20 * factor,
      p99Milliseconds: 25 * factor,
      maximumMilliseconds: 30 * factor,
    },
    edit: {
      averageMilliseconds: 4 * factor,
      p95Milliseconds: 8 * factor,
      p99Milliseconds: 10 * factor,
      maximumMilliseconds: 12 * factor,
    },
  },
  guardrails: { ready: true, parity: true },
});

test("migration report compares the identical scenario corpus without averaging percentiles", () => {
  const comparison = buildMigrationPerformanceComparison(summary("before"), summary("after", 0.5));
  assert.equal(comparison.environment.comparable, true);
  assert.equal(comparison.guardrails.allAfterPass, true);
  assert.equal(comparison.aggregate.p95GeometricMeanRatio, 0.5);
  assert.equal(comparison.aggregate.speedup, 2);
  assert.equal(comparison.aggregate.worstScenarioRatio, 0.5);
  assert.equal(comparison.scenarios[0].metrics.p95Milliseconds.percentChange, -50);
});

test("migration report fails closed on missing scenarios or incompatible numbers", () => {
  const missing = summary("after", 0.5);
  delete missing.scenarioMedians.walk;
  assert.throws(() => buildMigrationPerformanceComparison(summary("before"), missing), /scenario sets differ/u);
  const invalid = summary("after", 0.5);
  invalid.scenarioMedians.walk.p95Milliseconds = 0;
  assert.throws(() => buildMigrationPerformanceComparison(summary("before"), invalid), /finite positive/u);
});

test("migration report emits reviewable Markdown and accessible SVG", () => {
  const comparison = buildMigrationPerformanceComparison(summary("before"), summary("after", 0.75));
  const markdown = renderComparisonMarkdown(comparison);
  const svg = renderComparisonSvg(comparison);
  assert.match(markdown, /Aggregate speedup: \*\*1\.33x\*\*/u);
  assert.match(markdown, /\| walk \| 20\.000 \| 15\.000 \| 0\.750x \| -25\.0% \|/u);
  assert.match(svg, /role="img" aria-labelledby="title description"/u);
  assert.match(svg, /1\.33x faster aggregate p95/u);
  assert.match(svg, /TypeScript \/ Three baseline/u);
  assert.match(svg, /Rust \/ wgpu candidate/u);
});
