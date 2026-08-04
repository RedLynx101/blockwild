import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const SCENARIO_LABELS = Object.freeze([
  "stationary-settled",
  "continuous-walk",
  "continuous-sprint",
  "dense-360-turn-streaming-proxy",
  "frozen-lake-water-boundary-edit",
  "one-hundred-creature-lod-and-broadphase",
  "one-hundred-creature-admission-and-articulation",
  "settlement-traversal",
  "large-cavern-traversal",
  "player-edit-burst",
]);

function parseArgs(argv) {
  const options = { runs: 3, output: null, artifacts: null, baseline: null, label: "candidate" };
  for (let index = 2; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key === "--runs" && value) options.runs = Math.max(1, Math.min(9, Number.parseInt(value, 10) || 3));
    else if (key === "--output" && value) options.output = value;
    else if (key === "--artifacts" && value) options.artifacts = value;
    else if (key === "--baseline" && value) options.baseline = value;
    else if (key === "--label" && value) options.label = value;
    else continue;
    index += 1;
  }
  if (!options.output) throw new Error("--output is required");
  return options;
}

function percentileMedian(values) {
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function parseBenchmark(stdout) {
  const marker = '{\n  "benchmark"';
  const start = stdout.indexOf(marker);
  if (start < 0) throw new Error(`Benchmark JSON marker missing. Tail: ${stdout.slice(-500)}`);
  return JSON.parse(stdout.slice(start));
}

function runBenchmark() {
  const command = process.platform === "win32" ? process.env.ComSpec ?? "cmd.exe" : "npm";
  const commandArgs = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm.cmd", "run", "benchmark:performance-scenarios"]
    : ["run", "benchmark:performance-scenarios"];
  const result = spawnSync(command, commandArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Benchmark failed (${result.status}): ${result.stderr || result.stdout}`);
  return parseBenchmark(result.stdout);
}

function scenarioMap(run) {
  return new Map(run.scenarios.map((scenario) => [scenario.label, scenario]));
}

function geometricMean(values) {
  return Math.exp(values.reduce((total, value) => total + Math.log(Math.max(1e-9, value)), 0) / values.length);
}

export function summarizeRuns(runs, baseline = null) {
  const mapped = runs.map(scenarioMap);
  const scenarioMedians = Object.fromEntries(SCENARIO_LABELS.map((label) => {
    const scenarios = mapped.map((entries) => entries.get(label));
    if (scenarios.some((scenario) => !scenario)) throw new Error(`Missing scenario ${label}`);
    return [label, {
      averageMilliseconds: percentileMedian(scenarios.map((scenario) => scenario.averageMilliseconds)),
      p95Milliseconds: percentileMedian(scenarios.map((scenario) => scenario.p95Milliseconds)),
      p99Milliseconds: percentileMedian(scenarios.map((scenario) => scenario.p99Milliseconds)),
      maximumMilliseconds: percentileMedian(scenarios.map((scenario) => scenario.maximumMilliseconds)),
    }];
  }));
  const finalRuns = runs.map((run) => run.finalStreaming);
  const guardrails = {
    scenarioCompleteness: Object.keys(scenarioMedians).length === SCENARIO_LABELS.length,
    playerChunkReady: finalRuns.every((streaming) => streaming.playerChunkReady === true),
    boundedGenerationQueue: finalRuns.every((streaming) => streaming.generationQueued <= 120),
    boundedFalseCacheMisses: finalRuns.every((streaming) => (streaming.cache?.memory?.misses ?? 0) <= 5),
    admissionCoverage: runs.every((run) => run.creatureAdmission?.tiers?.hero >= run.creatureAdmission?.criticalHeroes
      && run.creatureAdmission?.tiers?.articulated > 0
      && run.creatureAdmission?.tiers?.silhouette > 0),
    creatureBatchesPresent: runs.every((run) => run.creatureLod?.activeBatches === 1 && run.creatureArticulation?.activeBatches === 1),
  };
  const rawP95GeometricMeanMilliseconds = geometricMean(SCENARIO_LABELS.map((label) => scenarioMedians[label].p95Milliseconds));
  let normalizedScore = null;
  let worstScenarioRatio = null;
  if (baseline) {
    const ratios = SCENARIO_LABELS.map((label) => scenarioMedians[label].p95Milliseconds / baseline.scenarioMedians[label].p95Milliseconds);
    normalizedScore = geometricMean(ratios);
    worstScenarioRatio = Math.max(...ratios);
  }
  return { scenarioMedians, rawP95GeometricMeanMilliseconds, normalizedScore, worstScenarioRatio, guardrails };
}

function main() {
  const options = parseArgs(process.argv);
  const artifactDirectory = path.resolve(options.artifacts ?? path.dirname(options.output));
  mkdirSync(artifactDirectory, { recursive: true });
  const runs = [];
  for (let runIndex = 0; runIndex < options.runs; runIndex += 1) {
    const run = runBenchmark();
    runs.push(run);
    writeFileSync(path.join(artifactDirectory, `${options.label}-run-${runIndex + 1}.json`), `${JSON.stringify(run, null, 2)}\n`);
  }
  const baseline = options.baseline ? JSON.parse(readFileSync(options.baseline, "utf8")) : null;
  const summary = summarizeRuns(runs, baseline);
  const result = {
    schema: 1,
    label: options.label,
    repetitions: options.runs,
    createdAt: new Date().toISOString(),
    environment: {
      node: process.version,
      platform: process.platform,
      architecture: process.arch,
      cpu: os.cpus()[0]?.model ?? "unknown",
      logicalCpuCount: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
    },
    ...summary,
  };
  const output = path.resolve(options.output);
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/(?:[A-Za-z]:)/, (match) => match.slice(1)))) main();
