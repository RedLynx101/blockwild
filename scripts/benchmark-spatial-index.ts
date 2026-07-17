import assert from "node:assert/strict";
import { performance } from "node:perf_hooks";
import { XZSpatialIndex } from "../app/game/spatial-index";

type Point = Readonly<{ id: number; x: number; z: number; y: number; radius: number; height: number }>;

const REPEATS = 120;

function points(count: number) {
  const side = Math.ceil(Math.sqrt(count));
  return Array.from({ length: count }, (_, id): Point => ({
    id,
    x: (id % side) * 1.55 + (id % 3) * 0.07,
    z: Math.floor(id / side) * 1.55 + (id % 5) * 0.05,
    y: (id % 7) * 0.15,
    radius: 0.42 + (id % 4) * 0.09,
    height: 0.8 + (id % 5) * 0.24,
  }));
}

function collisionScore(origin: Point, candidates: readonly Point[]) {
  let crowding = 0;
  let blocked = false;
  for (const candidate of candidates) {
    if (candidate.id === origin.id || origin.y + origin.height <= candidate.y || origin.y >= candidate.y + candidate.height) continue;
    const distance = Math.hypot(candidate.x - origin.x, candidate.z - origin.z);
    const gap = distance - origin.radius - candidate.radius;
    crowding = Math.max(crowding, Math.max(0, Math.min(1.25, (1.05 - gap) / 1.05)));
    if (distance < origin.radius + candidate.radius + 0.055) blocked = true;
  }
  return crowding + (blocked ? 2 : 0);
}

function naiveQueries(entries: readonly Point[]) {
  let score = 0;
  for (const origin of entries) score += collisionScore(origin, entries);
  return score;
}

for (const count of [100, 200, 300]) {
  const entries = points(count);
  const index = new XZSpatialIndex<Point>(8);
  const buildStart = performance.now();
  index.rebuild(entries.map((entry, order) => ({ ...entry, value: entry, order, radius: entry.radius })));
  const buildMs = performance.now() - buildStart;

  const expectedScore = naiveQueries(entries);
  let indexedCandidateVisits = 0;
  const indexedScore = entries.reduce((sum, entry) => {
    const candidates = index.queryOverlappingCircle(entry.x, entry.z, entry.radius + 1.05).map((candidate) => candidate.value);
    indexedCandidateVisits += candidates.length;
    return sum + collisionScore(entry, candidates);
  }, 0);
  assert.ok(Math.abs(indexedScore - expectedScore) < 1e-9);

  const naiveStart = performance.now();
  let naiveTotal = 0;
  for (let repeat = 0; repeat < REPEATS; repeat += 1) naiveTotal += naiveQueries(entries);
  const naiveMs = performance.now() - naiveStart;

  const indexedStart = performance.now();
  let indexedTotal = 0;
  for (let repeat = 0; repeat < REPEATS; repeat += 1) {
    for (const entry of entries) {
      const candidates = index.queryOverlappingCircle(entry.x, entry.z, entry.radius + 1.05).map((candidate) => candidate.value);
      indexedTotal += collisionScore(entry, candidates);
    }
  }
  const indexedMs = performance.now() - indexedStart;
  assert.ok(Math.abs(indexedTotal - naiveTotal) < 1e-7);

  const candidateReduction = 1 - indexedCandidateVisits / (count * count);
  console.log(JSON.stringify({
    entities: count,
    buildMs: Number(buildMs.toFixed(3)),
    naiveMs: Number(naiveMs.toFixed(3)),
    indexedMs: Number(indexedMs.toFixed(3)),
    speedup: Number((naiveMs / indexedMs).toFixed(2)),
    naivePairChecks: count * count,
    exactLocalCandidates: indexedCandidateVisits,
    candidateReductionPercent: Number((candidateReduction * 100).toFixed(1)),
  }));
}
