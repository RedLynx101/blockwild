import { currentBuildIdentity, type BlockwildBuildIdentity } from "./build-info";

export type ResourceTelemetrySnapshot = Readonly<Record<string, unknown>>;
export type ResourceTelemetryStopReason = "manual" | "save-and-quit" | "time-limit" | "page-exit";

export type ResourceTelemetryReport = Readonly<{
  schema: 3;
  game: "Blockwild";
  startedAt: string;
  stoppedAt: string;
  elapsedSeconds: number;
  stopReason: ResourceTelemetryStopReason;
  sampleIntervalSeconds: 1;
  aggregation: "non-overlapping-frame-histograms";
  build: BlockwildBuildIdentity;
  samples: readonly ResourceTelemetrySnapshot[];
}>;

/** Low-overhead, opt-in one-Hz resource recorder with a bounded emergency stop. */
export class ResourceTelemetryLog {
  private startedAt = 0;
  private samples: ResourceTelemetrySnapshot[] = [];

  get running() { return this.startedAt > 0; }
  get sampleCount() { return this.samples.length; }
  get startTime() { return this.startedAt; }

  start(now = Date.now()) {
    this.startedAt = Math.max(1, now);
    this.samples = [];
  }

  record(snapshot: ResourceTelemetrySnapshot) {
    if (!this.running) return false;
    this.samples.push(Object.freeze({ ...snapshot }));
    return true;
  }

  hasReachedLimit(maxMinutes: number, now = Date.now()) {
    if (!this.running) return false;
    const minutes = Math.max(1, Math.min(180, Number.isFinite(maxMinutes) ? maxMinutes : 60));
    return now - this.startedAt >= minutes * 60_000;
  }

  stop(reason: ResourceTelemetryStopReason, now = Date.now()): ResourceTelemetryReport | null {
    if (!this.running) return null;
    const startedAt = this.startedAt;
    const samples = Object.freeze([...this.samples]);
    this.startedAt = 0;
    this.samples = [];
    return Object.freeze({
      schema: 3,
      game: "Blockwild",
      startedAt: new Date(startedAt).toISOString(),
      stoppedAt: new Date(now).toISOString(),
      elapsedSeconds: Math.max(0, (now - startedAt) / 1000),
      stopReason: reason,
      sampleIntervalSeconds: 1,
      aggregation: "non-overlapping-frame-histograms",
      build: currentBuildIdentity(),
      samples,
    });
  }
}

export function telemetryFileName(now = new Date()) {
  return `blockwild-performance-${now.toISOString().replace(/[:.]/gu, "-")}.json`;
}
