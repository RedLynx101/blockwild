import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const METRICS = Object.freeze([
  "averageMilliseconds",
  "p95Milliseconds",
  "p99Milliseconds",
  "maximumMilliseconds",
]);

function argument(name, fallback) {
  const index = process.argv.indexOf(name);
  return index < 0 ? fallback : process.argv[index + 1];
}

function finitePositive(value, label) {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be a finite positive number`);
  return value;
}

function geometricMean(values) {
  if (!values.length) throw new Error("geometric mean requires at least one value");
  return Math.exp(values.reduce((sum, value) => sum + Math.log(finitePositive(value, "ratio")), 0) / values.length);
}

function sameEnvironment(before, after) {
  const keys = ["platform", "architecture", "cpu", "logicalCpuCount"];
  const mismatches = keys.flatMap((key) => before?.[key] === after?.[key]
    ? []
    : [{ key, before: before?.[key] ?? null, after: after?.[key] ?? null }]);
  return Object.freeze({ comparable: mismatches.length === 0, mismatches: Object.freeze(mismatches) });
}

export function buildMigrationPerformanceComparison(before, after) {
  if (before?.schema !== 1 || after?.schema !== 1) throw new Error("both benchmark summaries must use schema 1");
  const beforeOrder = Object.keys(before.scenarioMedians ?? {});
  const beforeNames = [...beforeOrder].sort();
  const afterNames = Object.keys(after.scenarioMedians ?? {}).sort();
  if (!beforeOrder.length || beforeNames.join("\n") !== afterNames.join("\n")) {
    throw new Error(`scenario sets differ: before=${beforeNames.join(",")} after=${afterNames.join(",")}`);
  }
  const scenarios = beforeOrder.map((name) => {
    const metrics = Object.fromEntries(METRICS.map((metric) => {
      const beforeValue = finitePositive(before.scenarioMedians[name]?.[metric], `${name}.${metric}.before`);
      const afterValue = finitePositive(after.scenarioMedians[name]?.[metric], `${name}.${metric}.after`);
      return [metric, Object.freeze({
        before: beforeValue,
        after: afterValue,
        ratio: afterValue / beforeValue,
        percentChange: (afterValue / beforeValue - 1) * 100,
      })];
    }));
    return Object.freeze({ name, metrics: Object.freeze(metrics) });
  });
  const p95Ratios = scenarios.map((scenario) => scenario.metrics.p95Milliseconds.ratio);
  const aggregateRatio = geometricMean(p95Ratios);
  const worst = scenarios.reduce((current, scenario) => (
    scenario.metrics.p95Milliseconds.ratio > current.metrics.p95Milliseconds.ratio ? scenario : current
  ));
  const environment = sameEnvironment(before.environment, after.environment);
  const guardrails = Object.freeze({
    before: Object.freeze(before.guardrails ?? {}),
    after: Object.freeze(after.guardrails ?? {}),
    allAfterPass: Object.values(after.guardrails ?? {}).every(Boolean),
  });
  return Object.freeze({
    schema: 1,
    generatedAt: new Date().toISOString(),
    before: Object.freeze({ label: before.label, repetitions: before.repetitions, environment: before.environment }),
    after: Object.freeze({ label: after.label, repetitions: after.repetitions, environment: after.environment }),
    environment,
    guardrails,
    aggregate: Object.freeze({
      p95GeometricMeanRatio: aggregateRatio,
      p95PercentChange: (aggregateRatio - 1) * 100,
      speedup: 1 / aggregateRatio,
      improved: aggregateRatio < 1,
      flat: Math.abs(aggregateRatio - 1) < 0.0005,
      worstScenario: worst.name,
      worstScenarioRatio: worst.metrics.p95Milliseconds.ratio,
    }),
    scenarios: Object.freeze(scenarios),
  });
}

function escapeXml(value) {
  return String(value).replace(/[&<>"']/gu, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&apos;",
  })[character]);
}

export function renderComparisonSvg(comparison) {
  const width = 1600;
  const rowHeight = 74;
  const top = 180;
  const bottom = 90;
  const height = top + comparison.scenarios.length * rowHeight + bottom;
  const chartX = 530;
  const chartWidth = 940;
  const maximum = Math.max(...comparison.scenarios.flatMap((scenario) => [
    scenario.metrics.p95Milliseconds.before,
    scenario.metrics.p95Milliseconds.after,
  ]));
  const scale = chartWidth / maximum;
  const rows = comparison.scenarios.map((scenario, index) => {
    const y = top + index * rowHeight;
    const metric = scenario.metrics.p95Milliseconds;
    const beforeWidth = Math.max(1, metric.before * scale);
    const afterWidth = Math.max(1, metric.after * scale);
    const delta = `${metric.percentChange >= 0 ? "+" : ""}${metric.percentChange.toFixed(1)}%`;
    const deltaColor = Math.abs(metric.percentChange) < 0.05 ? "#9fb2aa" : metric.ratio < 1 ? "#79d6a4" : "#ff8f82";
    return [
      `<text x="40" y="${y + 31}" class="label">${escapeXml(scenario.name)}</text>`,
      `<rect x="${chartX}" y="${y + 7}" width="${beforeWidth.toFixed(2)}" height="20" rx="3" fill="#8fa3ad"/>`,
      `<rect x="${chartX}" y="${y + 34}" width="${afterWidth.toFixed(2)}" height="20" rx="3" fill="#e3bc55"/>`,
      `<text x="${Math.min(width - 100, chartX + Math.max(beforeWidth, afterWidth) + 14).toFixed(2)}" y="${y + 48}" class="delta" fill="${deltaColor}">${delta}</text>`,
    ].join("\n");
  }).join("\n");
  const aggregate = comparison.aggregate;
  const headline = aggregate.flat
    ? "No aggregate p95 change"
    : aggregate.improved
    ? `${aggregate.speedup.toFixed(2)}x faster aggregate p95`
    : `${(aggregate.p95GeometricMeanRatio).toFixed(2)}x aggregate p95 regression`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">Blockwild hybrid Rust migration performance comparison</title>
  <desc id="description">Before and after p95 milliseconds for the frozen ten-scenario benchmark.</desc>
  <rect width="100%" height="100%" fill="#09110e"/>
  <text x="40" y="58" class="kicker">BLOCKWILD ENGINE MIGRATION</text>
  <text x="40" y="112" class="headline">${escapeXml(headline)}</text>
  <text x="40" y="148" class="summary">Same scenario corpus · lower is better · p95 milliseconds</text>
  <rect x="1120" y="46" width="24" height="16" rx="2" fill="#8fa3ad"/><text x="1156" y="59" class="legend">TypeScript / Three baseline</text>
  <rect x="1120" y="78" width="24" height="16" rx="2" fill="#e3bc55"/><text x="1156" y="91" class="legend">Rust / wgpu candidate</text>
  ${rows}
  <text x="40" y="${height - 42}" class="foot">Environment comparable: ${comparison.environment.comparable ? "yes" : "no"} · after guardrails: ${comparison.guardrails.allAfterPass ? "pass" : "fail"} · worst scenario ratio: ${aggregate.worstScenarioRatio.toFixed(3)}x (${escapeXml(aggregate.worstScenario)})</text>
  <style>
    text { font-family: ui-monospace, SFMono-Regular, Consolas, monospace; }
    .kicker { fill: #79d6a4; font-size: 20px; font-weight: 700; letter-spacing: 3px; }
    .headline { fill: #f5e8bd; font-size: 40px; font-weight: 800; }
    .summary, .legend, .foot { fill: #9fb2aa; font-size: 17px; }
    .label { fill: #e7eee8; font-size: 17px; }
    .delta { font-size: 16px; font-weight: 700; }
  </style>
</svg>\n`;
}

export function renderComparisonMarkdown(comparison) {
  const rows = comparison.scenarios.map((scenario) => {
    const metric = scenario.metrics.p95Milliseconds;
    return `| ${scenario.name} | ${metric.before.toFixed(3)} | ${metric.after.toFixed(3)} | ${metric.ratio.toFixed(3)}x | ${metric.percentChange.toFixed(1)}% |`;
  }).join("\n");
  return `# Hybrid Rust migration performance comparison

- Aggregate p95 geometric-mean ratio: **${comparison.aggregate.p95GeometricMeanRatio.toFixed(4)}x**
- Aggregate speedup: **${comparison.aggregate.speedup.toFixed(2)}x**
- Worst scenario: **${comparison.aggregate.worstScenario}** at **${comparison.aggregate.worstScenarioRatio.toFixed(3)}x**
- Environment comparable: **${comparison.environment.comparable ? "yes" : "no"}**
- Candidate guardrails: **${comparison.guardrails.allAfterPass ? "pass" : "fail"}**

| Scenario | Before p95 ms | After p95 ms | Ratio | Change |
| --- | ---: | ---: | ---: | ---: |
${rows}
`;
}

async function main() {
  const beforePath = path.resolve(argument("--before", "work/hybrid-rust-migration/performance/before-summary.json"));
  const afterPath = path.resolve(argument("--after", "work/hybrid-rust-migration/performance/after-summary.json"));
  const outputDirectory = path.resolve(argument("--output", "work/hybrid-rust-migration/performance/comparison"));
  const [before, after] = await Promise.all([
    readFile(beforePath, "utf8").then(JSON.parse),
    readFile(afterPath, "utf8").then(JSON.parse),
  ]);
  const comparison = buildMigrationPerformanceComparison(before, after);
  await mkdir(outputDirectory, { recursive: true });
  await Promise.all([
    writeFile(path.join(outputDirectory, "comparison.json"), `${JSON.stringify(comparison, null, 2)}\n`, "utf8"),
    writeFile(path.join(outputDirectory, "comparison.md"), renderComparisonMarkdown(comparison), "utf8"),
    writeFile(path.join(outputDirectory, "comparison.svg"), renderComparisonSvg(comparison), "utf8"),
  ]);
  process.stdout.write(`${JSON.stringify(comparison.aggregate, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});
