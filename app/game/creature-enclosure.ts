export type EnclosureCell = Readonly<{ x: number; z: number }>;

export type CraftedFenceEnclosureOptions = Readonly<{
  /** Maximum pen half-span. Reaching this boundary means the area is open. */
  maxRadius?: number;
  /** Hard CPU guard for malformed or very large spaces. */
  maxVisited?: number;
  /** Reject isolated posts and tiny decorative arrangements. */
  minimumBarrierCells?: number;
}>;

export type CraftedFenceEnclosureScan = Readonly<{
  enclosed: boolean;
  /** Passable cells reached inside the bounded search, useful for shared caching. */
  interior: readonly EnclosureCell[];
}>;

const CARDINAL_STEPS = Object.freeze([
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const);

/**
 * Bounded flood fill for an enclosure made only from crafted fences and closed
 * fence gates. Terrain, cave walls, and ordinary blocks deliberately do not
 * count: the caller controls the exact barrier predicate.
 */
export function scanCraftedFenceEnclosure(
  start: EnclosureCell,
  isCraftedBarrier: (x: number, z: number) => boolean,
  options: CraftedFenceEnclosureOptions = {},
): CraftedFenceEnclosureScan {
  const maxRadius = Math.max(3, Math.floor(options.maxRadius ?? 18));
  const maxVisited = Math.max(32, Math.floor(options.maxVisited ?? 1_024));
  const minimumBarrierCells = Math.max(4, Math.floor(options.minimumBarrierCells ?? 8));
  if (isCraftedBarrier(start.x, start.z)) return { enclosed: false, interior: [] };

  const cellKey = (x: number, z: number) => `${x},${z}`;
  const queue: EnclosureCell[] = [start];
  const visited = new Set([cellKey(start.x, start.z)]);
  const barriers = new Set<string>();

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    if (visited.size > maxVisited) return { enclosed: false, interior: queue };
    const cell = queue[cursor];
    for (const [dx, dz] of CARDINAL_STEPS) {
      const x = cell.x + dx;
      const z = cell.z + dz;
      const key = cellKey(x, z);
      if (isCraftedBarrier(x, z)) {
        barriers.add(key);
        continue;
      }
      if (Math.abs(x - start.x) >= maxRadius || Math.abs(z - start.z) >= maxRadius) return { enclosed: false, interior: queue };
      if (visited.has(key)) continue;
      visited.add(key);
      queue.push({ x, z });
    }
  }

  return { enclosed: barriers.size >= minimumBarrierCells, interior: queue };
}

export function craftedFenceEncloses(
  start: EnclosureCell,
  isCraftedBarrier: (x: number, z: number) => boolean,
  options: CraftedFenceEnclosureOptions = {},
) {
  return scanCraftedFenceEnclosure(start, isCraftedBarrier, options).enclosed;
}
