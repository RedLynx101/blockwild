#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const engineRoot = join(repositoryRoot, "engine");
const fixturePath = join(repositoryRoot, "tests", "fixtures", "rust-engine", "r5", "simulation-golden-v2.jsonl");

function runCargo(args) {
  const result = spawnSync("cargo", args, {
    cwd: engineRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.status !== 0) {
    process.stderr.write(result.stdout ?? "");
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 1);
  }
  return (result.stdout ?? "").trim().replaceAll("\r\n", "\n");
}

const expected = readFileSync(fixturePath, "utf8").trim().replaceAll("\r\n", "\n");
const first = runCargo(["run", "-q", "-p", "blockwild-simulation", "--example", "r5_golden"]);
const second = runCargo(["run", "-q", "-p", "blockwild-simulation", "--example", "r5_golden"]);
assert.equal(first, expected, "native R5 output diverged from the checked cross-language fixture");
assert.equal(second, first, "repeated native R5 output was not deterministic");

const rows = first.split("\n").map((line) => JSON.parse(line));
assert.deepEqual(
  rows.filter((row) => row.scenario === "flight-replay").map((row) => row.hz),
  [30, 60, 120],
  "the replay fixture must retain all three requested cadences",
);
for (const scenario of [
  "hit-hop",
  "shore-exit",
  "boat",
  "negative-chunk-ray",
  "doors-and-unloaded",
  "stairs",
  "liquid-order",
  "path-tie",
  "atmosphere-unknown",
  "fixed-gas",
]) {
  assert.ok(rows.some((row) => row.scenario === scenario), `missing R5 scenario ${scenario}`);
}

let benchmark = null;
if (process.argv.includes("--benchmark")) {
  const output = runCargo(["run", "-q", "--release", "-p", "blockwild-simulation", "--example", "r5_benchmark"]);
  const match = /iterations=(\d+) physics_us=(\d+) liquid_us=(\d+) path_us=(\d+) air_us=(\d+) query_us=(\d+) kinematics_us=(\d+) gas_us=(\d+) digest=([0-9a-f]+)/u.exec(output);
  assert.ok(match, "native benchmark did not emit the versioned report fields");
  benchmark = {
    iterations: Number(match[1]),
    physicsMicros: Number(match[2]),
    liquidMicros: Number(match[3]),
    pathMicros: Number(match[4]),
    airMicros: Number(match[5]),
    queryMicros: Number(match[6]),
    kinematicsMicros: Number(match[7]),
    gasMicros: Number(match[8]),
    digest: match[9],
    classification: "allocation-inclusive native microbenchmark; not browser or promotion evidence",
  };
}

console.log(JSON.stringify({
  ok: true,
  fixture: "tests/fixtures/rust-engine/r5/simulation-golden-v2.jsonl",
  rows: rows.length,
  deterministicRuns: 2,
  benchmark,
}, null, 2));
