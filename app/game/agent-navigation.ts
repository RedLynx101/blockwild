import type { AgentVector3 } from "./agent-platform";

export type AgentPathCell = Readonly<{ x: number; y: number; z: number; transition: "walk" | "step" | "jump" | "swim" | "door" }>;
export type AgentNavigationQuery = Readonly<{
  isLoaded(x: number, y: number, z: number): boolean;
  isPassable(x: number, y: number, z: number): boolean;
  hasSupport(x: number, y: number, z: number): boolean;
  isLiquid(x: number, y: number, z: number): boolean;
  isDoorOrGate?(x: number, y: number, z: number): boolean;
}>;

export type AgentPathResult = Readonly<{
  ok: boolean;
  cells: readonly AgentPathCell[];
  code: "path_found" | "path_unloaded" | "path_too_far" | "path_blocked" | "path_budget_exhausted";
  visited: number;
  nearest: AgentVector3;
}>;

const key = (x: number, y: number, z: number) => `${x},${y},${z}`;
const heuristic = (x: number, y: number, z: number, goal: AgentVector3) => Math.abs(goal.x - x) + Math.abs(goal.z - z) + Math.abs(goal.y - y) * 1.25;

function walkable(query: AgentNavigationQuery, x: number, y: number, z: number) {
  if (!query.isLoaded(x, y, z) || !query.isLoaded(x, y + 1, z)) return false;
  const clear = query.isPassable(x, y, z) && query.isPassable(x, y + 1, z);
  return clear && (query.hasSupport(x, y, z) || query.isLiquid(x, y, z));
}

/** Bounded local voxel A*. Chunk-to-chunk goals are executed as repeated local legs. */
export function findAgentVoxelPath(query: AgentNavigationQuery, startInput: AgentVector3, goalInput: AgentVector3, maxNodes = 4_096): AgentPathResult {
  const start = { x: Math.round(startInput.x), y: Math.floor(startInput.y + 0.5), z: Math.round(startInput.z) };
  const goal = { x: Math.round(goalInput.x), y: Math.floor(goalInput.y + 0.5), z: Math.round(goalInput.z) };
  const distance = Math.hypot(goal.x - start.x, goal.y - start.y, goal.z - start.z);
  if (distance > 96) return { ok: false, cells: [], code: "path_too_far", visited: 0, nearest: start };
  if (!query.isLoaded(start.x, start.y, start.z) || !query.isLoaded(goal.x, goal.y, goal.z)) return { ok: false, cells: [], code: "path_unloaded", visited: 0, nearest: start };

  const open: Array<{ x: number; y: number; z: number; score: number }> = [{ ...start, score: heuristic(start.x, start.y, start.z, goal) }];
  const cameFrom = new Map<string, { previous: string; transition: AgentPathCell["transition"] }>();
  const positions = new Map<string, { x: number; y: number; z: number }>([[key(start.x, start.y, start.z), start]]);
  const cost = new Map<string, number>([[key(start.x, start.y, start.z), 0]]);
  const closed = new Set<string>();
  let nearest = start;
  let nearestDistance = heuristic(start.x, start.y, start.z, goal);

  while (open.length && closed.size < maxNodes) {
    open.sort((left, right) => left.score - right.score);
    const current = open.shift()!;
    const currentKey = key(current.x, current.y, current.z);
    if (closed.has(currentKey)) continue;
    closed.add(currentKey);
    const currentDistance = heuristic(current.x, current.y, current.z, goal);
    if (currentDistance < nearestDistance) { nearest = { x: current.x, y: current.y, z: current.z }; nearestDistance = currentDistance; }
    if (current.x === goal.x && current.z === goal.z && Math.abs(current.y - goal.y) <= 1) {
      const cells: AgentPathCell[] = [];
      let cursor = currentKey;
      while (cursor !== key(start.x, start.y, start.z)) {
        const position = positions.get(cursor)!;
        const link = cameFrom.get(cursor)!;
        cells.push({ ...position, transition: link.transition });
        cursor = link.previous;
      }
      cells.reverse();
      return { ok: true, cells, code: "path_found", visited: closed.size, nearest: current };
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const x = current.x + dx, z = current.z + dz;
      let selected: { y: number; transition: AgentPathCell["transition"]; stepCost: number } | null = null;
      for (const dy of [0, 1, -1] as const) {
        const y = current.y + dy;
        if (!walkable(query, x, y, z)) continue;
        const door = query.isDoorOrGate?.(x, y, z) === true;
        selected = { y, transition: door ? "door" : query.isLiquid(x, y, z) ? "swim" : dy > 0 ? "jump" : dy < 0 ? "step" : "walk", stepCost: 1 + Math.abs(dy) * 0.35 + (door ? 0.15 : 0) };
        break;
      }
      if (!selected) continue;
      const nextKey = key(x, selected.y, z);
      const nextCost = (cost.get(currentKey) ?? 0) + selected.stepCost;
      if (nextCost >= (cost.get(nextKey) ?? Number.POSITIVE_INFINITY)) continue;
      cost.set(nextKey, nextCost);
      positions.set(nextKey, { x, y: selected.y, z });
      cameFrom.set(nextKey, { previous: currentKey, transition: selected.transition });
      open.push({ x, y: selected.y, z, score: nextCost + heuristic(x, selected.y, z, goal) });
    }
  }
  return { ok: false, cells: [], code: open.length ? "path_budget_exhausted" : "path_blocked", visited: closed.size, nearest };
}

export function advanceAgentAlongPath(current: AgentVector3, target: AgentPathCell, speed: number, deltaSeconds: number) {
  const targetPosition = { x: target.x + 0.5, y: target.y - 0.49, z: target.z + 0.5 };
  const dx = targetPosition.x - current.x, dy = targetPosition.y - current.y, dz = targetPosition.z - current.z;
  const distance = Math.hypot(dx, dy, dz);
  if (distance <= 0.08) return { position: targetPosition, reached: true, yaw: Math.atan2(-dx, -dz) };
  const travel = Math.min(distance, Math.max(0, speed * deltaSeconds));
  return {
    position: { x: current.x + dx / distance * travel, y: current.y + dy / distance * travel, z: current.z + dz / distance * travel },
    reached: travel >= distance - 0.08,
    yaw: Math.atan2(-dx, -dz),
  };
}
