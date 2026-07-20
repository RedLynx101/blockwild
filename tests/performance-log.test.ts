import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { ResourceTelemetryLog, telemetryFileName } from "../app/game/performance-log.ts";

test("resource telemetry is opt-in, one-session, and bounded by the configured emergency limit", () => {
  const log = new ResourceTelemetryLog();
  assert.equal(log.record({ fps: 60 }), false);
  log.start(1_000);
  assert.equal(log.record({ fps: 60, entities: 12 }), true);
  assert.equal(log.hasReachedLimit(1, 60_999), false);
  assert.equal(log.hasReachedLimit(1, 61_000), true);
  const report = log.stop("time-limit", 61_000);
  assert.equal(report?.samples.length, 1);
  assert.equal(report?.elapsedSeconds, 60);
  assert.equal(report?.stopReason, "time-limit");
  assert.equal(log.running, false);
});

test("telemetry download names are deterministic and filesystem-safe", () => {
  assert.equal(telemetryFileName(new Date("2026-07-19T12:34:56.789Z")), "blockwild-performance-2026-07-19T12-34-56-789Z.json");
});

test("settings expose opt-in start, stop, download, and an editable emergency limit", () => {
  const ui = readFileSync(new URL("../app/game/VoxelGame.tsx", import.meta.url), "utf8");
  assert.match(ui, /Performance debug logging/u);
  assert.match(ui, /STOP & DOWNLOAD/u);
  assert.match(ui, /Emergency stop/u);
  assert.match(ui, /debugTelemetryMaxMinutes/u);
});
