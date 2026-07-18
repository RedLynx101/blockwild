export type RoadNode = Readonly<{ id: string; x: number; z: number; y?: number; factionId?: string; settlementSize?: "hamlet" | "village" | "town" | "capital" }>;
export type RoadEdge = Readonly<{ id: string; from: RoadNode; to: RoadNode; length: number; loop: boolean }>;
export type RoadSample = Readonly<{ height: number; waterline: number; water: boolean; forbidden?: boolean; slopeRisk?: number }>;
export type RoadPointKind = "road" | "switchback" | "bridge" | "causeway" | "ferry";
export type RoadPoint = Readonly<{ x: number; y: number; z: number; kind: RoadPointKind; grade: number }>;

const distance = (left: RoadNode, right: RoadNode) => Math.hypot(left.x - right.x, left.z - right.z);
const edgeId = (left: RoadNode, right: RoadNode) => [left.id, right.id].sort().join("<->");

/** Sparse deterministic graph: MST for reachability, then a few short loops, degree capped at three. */
export function planRegionalRoadGraph(nodes: readonly RoadNode[]): readonly RoadEdge[] {
  const ordered = [...nodes].sort((a, b) => a.id.localeCompare(b.id));
  if (ordered.length < 2) return Object.freeze([]);
  const degreeLimit = (node: RoadNode) => node.settlementSize === "town" || node.settlementSize === "capital" ? 3 : 2;
  const degrees = new Map(ordered.map((node) => [node.id, 0])); const edges: RoadEdge[] = []; const connected = new Set([ordered[0].id]);
  while (connected.size < ordered.length) {
    let best: { from: RoadNode; to: RoadNode; length: number } | null = null;
    for (const from of ordered) if (connected.has(from.id) && (degrees.get(from.id) ?? 0) < degreeLimit(from)) for (const to of ordered) if (!connected.has(to.id) && (degrees.get(to.id) ?? 0) < degreeLimit(to)) {
      const length = distance(from, to); if (length > 1_200) continue;
      if (!best || length < best.length || length === best.length && edgeId(from, to) < edgeId(best.from, best.to)) best = { from, to, length };
    }
    if (!best) break;
    edges.push(Object.freeze({ id: edgeId(best.from, best.to), from: best.from, to: best.to, length: best.length, loop: false })); connected.add(best.to.id); degrees.set(best.from.id, (degrees.get(best.from.id) ?? 0) + 1); degrees.set(best.to.id, (degrees.get(best.to.id) ?? 0) + 1);
  }
  const candidates = ordered.flatMap((from, index) => ordered.slice(index + 1).map((to) => ({ from, to, length: distance(from, to), id: edgeId(from, to) }))).filter((candidate) => !edges.some((edge) => edge.id === candidate.id)).sort((a, b) => a.length - b.length || a.id.localeCompare(b.id));
  const loopBudget = Math.max(1, Math.floor(ordered.length / 4));
  for (const candidate of candidates) {
    if (edges.filter((edge) => edge.loop).length >= loopBudget) break;
    if ((degrees.get(candidate.from.id) ?? 0) >= degreeLimit(candidate.from) || (degrees.get(candidate.to.id) ?? 0) >= degreeLimit(candidate.to)) continue;
    if (candidate.length > Math.max(256, edges.reduce((sum, edge) => sum + edge.length, 0) / Math.max(1, edges.length) * 1.45)) continue;
    edges.push(Object.freeze({ ...candidate, loop: true })); degrees.set(candidate.from.id, (degrees.get(candidate.from.id) ?? 0) + 1); degrees.set(candidate.to.id, (degrees.get(candidate.to.id) ?? 0) + 1);
  }
  return Object.freeze(edges);
}

type SearchNode = { key: string; x: number; z: number; g: number; f: number; parent: string | null };
const key = (x: number, z: number) => `${x},${z}`;

/** Bounded coarse A* that prefers gentle terrain, skirts protected cells, and accepts authored crossings. */
export function planTerrainFollowingRoad(from: RoadNode, to: RoadNode, sample: (x: number, z: number) => RoadSample, grid = 4): readonly RoadPoint[] {
  const step = Math.max(2, Math.min(8, Math.floor(grid)));
  const sx = Math.round(from.x / step) * step, sz = Math.round(from.z / step) * step, tx = Math.round(to.x / step) * step, tz = Math.round(to.z / step) * step;
  const padding = Math.min(128, Math.max(48, Math.hypot(tx - sx, tz - sz) * .18));
  const minX = Math.min(sx, tx) - padding, maxX = Math.max(sx, tx) + padding, minZ = Math.min(sz, tz) - padding, maxZ = Math.max(sz, tz) + padding;
  const open = new Map<string, SearchNode>(); const closed = new Map<string, SearchNode>();
  const start: SearchNode = { key: key(sx, sz), x: sx, z: sz, g: 0, f: Math.hypot(tx - sx, tz - sz), parent: null }; open.set(start.key, start);
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]] as const;
  let goal: SearchNode | null = null; let expansions = 0;
  while (open.size && expansions < 32000) {
    let current: SearchNode | null = null; for (const node of open.values()) if (!current || node.f < current.f || node.f === current.f && node.key < current.key) current = node;
    if (!current) break; open.delete(current.key); closed.set(current.key, current); expansions += 1;
    if (Math.hypot(current.x - tx, current.z - tz) <= step * 1.5) { goal = current; break; }
    const currentSample = sample(current.x, current.z);
    for (const [dx, dz] of directions) {
      const x = current.x + dx * step, z = current.z + dz * step; if (x < minX || x > maxX || z < minZ || z > maxZ) continue;
      const id = key(x, z); if (closed.has(id)) continue; const nextSample = sample(x, z); if (nextSample.forbidden) continue;
      const diagonal = dx !== 0 && dz !== 0 ? Math.SQRT2 : 1; const rise = Math.abs(nextSample.height - currentSample.height);
      const waterCost = nextSample.water ? 4.5 : 0; const slopeCost = rise * rise * 1.65 + Math.max(0, nextSample.slopeRisk ?? 0) * 5; const turnCost = current.parent ? .12 : 0;
      const g = current.g + step * diagonal + waterCost + slopeCost + turnCost; const prior = open.get(id); if (prior && prior.g <= g) continue;
      open.set(id, { key: id, x, z, g, f: g + Math.hypot(tx - x, tz - z), parent: current.key });
    }
  }
  if (!goal) {
    const fallback: RoadPoint[] = []; const count = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z)));
    for (let index = 0; index <= count; index += 1) { const t = index / count, x = Math.round(from.x + (to.x - from.x) * t), z = Math.round(from.z + (to.z - from.z) * t), terrain = sample(x, z); fallback.push(Object.freeze({ x, z, y: terrain.water ? terrain.waterline + 1 : terrain.height, kind: terrain.water ? "bridge" : "road", grade: 0 })); }
    return Object.freeze(fallback);
  }
  const coarse: SearchNode[] = []; let cursor: SearchNode | undefined | null = goal;
  while (cursor) { coarse.push(cursor); cursor = cursor.parent ? closed.get(cursor.parent) ?? open.get(cursor.parent) : null; }
  coarse.reverse(); coarse.unshift({ ...start }); coarse.push({ key: key(tx, tz), x: tx, z: tz, g: goal.g, f: goal.f, parent: goal.key });
  const points: RoadPoint[] = []; let priorY = sample(from.x, from.z).height; let consecutiveWater = 0;
  for (let segment = 0; segment < coarse.length - 1; segment += 1) {
    const a = coarse[segment], b = coarse[segment + 1]; const count = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z)));
    for (let index = segment === 0 ? 0 : 1; index <= count; index += 1) {
      const t = index / count, x = Math.round(a.x + (b.x - a.x) * t), z = Math.round(a.z + (b.z - a.z) * t), terrain = sample(x, z);
      const targetY = terrain.water ? terrain.waterline + 1 : terrain.height; const y = Math.abs(targetY - priorY) > 1 ? priorY + Math.sign(targetY - priorY) : targetY; const grade = y - priorY;
      consecutiveWater = terrain.water ? consecutiveWater + 1 : 0; const kind: RoadPointKind = terrain.water ? (consecutiveWater > 28 ? "ferry" : consecutiveWater > 8 ? "causeway" : "bridge") : Math.abs(targetY - y) > 1 ? "switchback" : "road";
      points.push(Object.freeze({ x, y, z, kind, grade })); priorY = y;
    }
  }
  // Rasterized diagonal segments can revisit a coordinate while climbing. The
  // final seam pass removes the duplicate and reclamps elevation, otherwise a
  // removed intermediate tread can expose a two-block step at segment joins.
  const unique = points.filter((point, index) => index === 0 || point.x !== points[index - 1].x || point.z !== points[index - 1].z);
  let previousY = unique[0]?.y ?? sample(from.x, from.z).height;
  return Object.freeze(unique.map((point, index) => {
    const y = index === 0 ? point.y : Math.abs(point.y - previousY) > 1 ? previousY + Math.sign(point.y - previousY) : point.y;
    const normalized = Object.freeze({ ...point, y, grade: index === 0 ? 0 : y - previousY });
    previousY = y;
    return normalized;
  }));
}

export function auditRoadPlan(points: readonly RoadPoint[]) {
  const errors: string[] = [];
  for (let index = 1; index < points.length; index += 1) { const previous = points[index - 1], point = points[index]; if (Math.abs(point.y - previous.y) > 1) errors.push(`grade jump at ${index}`); if (Math.hypot(point.x - previous.x, point.z - previous.z) > 1.5) errors.push(`horizontal gap at ${index}`); }
  return Object.freeze(errors);
}
