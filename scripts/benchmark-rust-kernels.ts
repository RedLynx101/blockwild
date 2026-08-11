import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { performance } from "node:perf_hooks";
import {
  evaluateRustKernelSpatialBatch,
  rustKernelHash2Bits,
  rustKernelHash3Bits,
  type KernelSpatialBatch,
} from "../app/game/rust-kernel-shadow.ts";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function positiveInteger(value: string | undefined, fallback: number) {
  if (value === undefined) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new RangeError(`${value} must be a positive integer`);
  return parsed;
}

function benchmarkCorpus(entryCount: number, queryCount: number): KernelSpatialBatch {
  const entries = Array.from({ length: entryCount }, (_, offset) => {
    const id = offset + 1;
    const x = id % 64 - 32;
    const y = id % 7 - 3;
    const z = Math.floor(id / 64) - 16;
    return {
      id: { index: id, generation: 1 },
      bounds: { min: [x, y, z] as const, max: [x + 0.8, y + 1.8, z + 0.8] as const },
    };
  });
  const aabbQueries = Array.from({ length: queryCount }, (_, offset) => ({
    queryId: queryCount - offset,
    bounds: {
      min: [offset % 32 - 20, -4, Math.floor(offset / 4) - 16] as const,
      max: [offset % 32 - 4, 5, Math.floor(offset / 4)] as const,
    },
  }));
  const rayQueries = Array.from({ length: queryCount }, (_, offset) => ({
    queryId: queryCount * 2 - offset,
    ray: {
      origin: [-40, offset % 5 - 2, Math.floor(offset / 4) - 16] as const,
      direction: [1, 0, 0] as const,
      maxDistance: 80,
    },
  }));
  return { cellSize: 8, entries, aabbQueries, rayQueries };
}

const iterations = positiveInteger(option("--iterations"), 50);
const entries = positiveInteger(option("--entries"), 2_048);
const queriesPerKind = positiveInteger(option("--queries"), 64);
const corpus = benchmarkCorpus(entries, queriesPerKind);
let checksum = 0;

for (let warmup = 0; warmup < 5; warmup += 1) evaluateRustKernelSpatialBatch(corpus);
const spatialStarted = performance.now();
for (let iteration = 0; iteration < iterations; iteration += 1) {
  const output = evaluateRustKernelSpatialBatch(corpus);
  checksum += output.aabb.reduce((total, result) => total + result.ids.length, 0);
  checksum += output.ray.reduce((total, result) => total + result.hits.length, 0);
}
const spatialElapsedMs = performance.now() - spatialStarted;

const hashSamples = entries * 32;
const hashStarted = performance.now();
for (let sample = 0; sample < hashSamples; sample += 1) {
  checksum = (checksum + rustKernelHash2Bits(sample - entries, entries - sample, sample >>> 0)) >>> 0;
  checksum = (checksum + rustKernelHash3Bits(sample - entries, sample % 192 - 64, entries - sample, sample >>> 0)) >>> 0;
}
const hashElapsedMs = performance.now() - hashStarted;

const rustJsonPath = option("--rust-json");
const rust = rustJsonPath ? JSON.parse(readFileSync(resolve(rustJsonPath), "utf8")) as unknown : null;
const report = {
  schemaVersion: 1,
  benchmark: "blockwild-r1-batched-kernels",
  input: { iterations, entries, aabbQueries: queriesPerKind, rayQueries: queriesPerKind, hashSamples },
  boundary: {
    semanticCallsPerIteration: 2,
    queriesPerIteration: queriesPerKind * 2,
    callsPerQuery: 2 / (queriesPerKind * 2),
    note: "The measured API consumes one AABB batch and one ray batch; no query crosses the future Wasm boundary alone.",
  },
  typescript: {
    spatialElapsedMs,
    spatialMillisecondsPerBatchPair: spatialElapsedMs / iterations,
    hashElapsedMs,
    hashNanosecondsPerPair: hashElapsedMs * 1_000_000 / hashSamples,
    checksum,
  },
  rust,
  rustSource: rustJsonPath ? resolve(rustJsonPath) : null,
  measuredAt: new Date().toISOString(),
};

const serialized = `${JSON.stringify(report, null, 2)}\n`;
const output = option("--output");
if (output) {
  const target = resolve(output);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, serialized, "utf8");
}
process.stdout.write(serialized);
