import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Rust migration completion audit emits a bounded, machine-readable release report", () => {
  const output = execFileSync(process.execPath, ["scripts/audit-rust-migration.mjs"], {
    cwd: root,
    encoding: "utf8",
  });
  const report = JSON.parse(output);
  assert.equal(report.schemaVersion, 1);
  assert.equal(typeof report.complete, "boolean");
  assert.ok(Array.isArray(report.blockers));
  assert.ok(Array.isArray(report.pendingAuthority));
  assert.ok(Array.isArray(report.normalPathThreeImports));
  assert.ok(Array.isArray(report.staticThreeCompatibilityImports));
  assert.ok(Array.isArray(report.legacyAuthoritySymbols));
  assert.ok(Array.isArray(report.missingWasmExports));
  assert.deepEqual(report.missingWasmExports, []);
  assert.equal(report.checks.strictScriptPresent, true);
  assert.equal(report.checks.rustTestDiscoveryPresent, true);
  assert.equal(report.checks.basicRenderProductionOff, true);
  assert.equal(typeof report.checks.facadeWired, "boolean");
  assert.equal(typeof report.checks.runtimeEngineDefault, "string");
  assert.equal(typeof report.checks.runtimeRendererDefault, "string");
  assert.equal(report.checks.artifactValid, true);
});
