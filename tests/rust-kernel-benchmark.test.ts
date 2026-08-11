import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

test("R1 benchmark measures coarse TypeScript batches and consumes Rust JSON", { timeout: 30_000 }, () => {
  const temporary = mkdtempSync(join(tmpdir(), "blockwild-r1-benchmark-"));
  const rustPath = join(temporary, "rust.json");
  const rustMeasurement = {
    schemaVersion: 1,
    benchmark: "blockwild-r1-native-kernels",
    elapsedMs: 1.25,
    checksum: 42,
  };
  writeFileSync(rustPath, JSON.stringify(rustMeasurement), "utf8");
  try {
    const result = spawnSync(process.execPath, [
      "--import",
      "tsx",
      resolve("scripts/benchmark-rust-kernels.ts"),
      "--iterations",
      "2",
      "--entries",
      "64",
      "--queries",
      "4",
      "--rust-json",
      rustPath,
    ], { cwd: resolve("."), encoding: "utf8", timeout: 25_000, windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    const report = JSON.parse(result.stdout);
    assert.equal(report.boundary.semanticCallsPerIteration, 2);
    assert.equal(report.boundary.queriesPerIteration, 8);
    assert.equal(report.boundary.callsPerQuery, 0.25);
    assert.equal(report.typescript.spatialElapsedMs >= 0, true);
    assert.equal(report.typescript.hashElapsedMs >= 0, true);
    assert.deepEqual(report.rust, rustMeasurement);
    assert.equal(report.rustSource, rustPath);
  } finally {
    rmSync(temporary, { recursive: true, force: true });
  }
});
