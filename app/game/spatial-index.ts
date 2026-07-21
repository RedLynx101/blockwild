export type SpatialId = number | string;

export type XZSpatialEntry<T> = Readonly<{
  id: SpatialId;
  value: T;
  x: number;
  z: number;
  /** Radius used only for broad-phase overlap queries. */
  radius?: number;
  /** Stable source order used to preserve deterministic tie semantics. */
  order?: number;
}>;

type StoredEntry<T> = {
  id: SpatialId;
  value: T;
  x: number;
  z: number;
  radius: number;
  order: number;
  cells: readonly string[];
  queryToken: number;
};

/**
 * Deterministic X/Z spatial hash for frame-local simulation broad phases.
 *
 * Entries occupy every cell touched by their radius. Queries then apply an
 * exact circle check, so touching objects cannot disappear at cell boundaries.
 */
export class XZSpatialIndex<T> {
  readonly cellSize: number;
  private readonly buckets = new Map<string, Map<SpatialId, StoredEntry<T>>>();
  private readonly entries = new Map<SpatialId, StoredEntry<T>>();
  private readonly occupiedOrders = new Set<number>();
  private nextOrder = 0;
  private queryToken = 0;

  constructor(cellSize = 8) {
    if (!Number.isFinite(cellSize) || cellSize <= 0) throw new RangeError("cellSize must be a finite positive number");
    this.cellSize = cellSize;
  }

  get size() {
    return this.entries.size;
  }

  clear() {
    this.buckets.clear();
    this.entries.clear();
    this.occupiedOrders.clear();
    this.nextOrder = 0;
  }

  rebuild(entries: Iterable<XZSpatialEntry<T>>) {
    this.clear();
    for (const entry of entries) this.upsert(entry);
  }

  get(id: SpatialId) {
    return this.entries.get(id);
  }

  delete(id: SpatialId) {
    const previous = this.entries.get(id);
    if (!previous) return false;
    for (const key of previous.cells) {
      const bucket = this.buckets.get(key);
      bucket?.delete(id);
      if (bucket?.size === 0) this.buckets.delete(key);
    }
    this.entries.delete(id);
    this.occupiedOrders.delete(previous.order);
    return true;
  }

  upsert(entry: XZSpatialEntry<T>) {
    if (!Number.isFinite(entry.x) || !Number.isFinite(entry.z)) throw new RangeError("entry coordinates must be finite");
    const previous = this.entries.get(entry.id);
    const radius = Math.max(0, Number.isFinite(entry.radius) ? entry.radius ?? 0 : 0);
    const requestedOrder = entry.order ?? previous?.order;
    const cells = this.cellKeys(entry.x - radius, entry.z - radius, entry.x + radius, entry.z + radius);
    if (previous && requestedOrder === previous.order
      && cells.length === previous.cells.length
      && cells.every((key, index) => key === previous.cells[index])) {
      // Most simulated bodies remain inside the same spatial cells from one
      // frame to the next. Mutating the shared bucket record avoids clearing
      // and rebuilding every Map plus allocating a replacement entry.
      previous.value = entry.value;
      previous.x = entry.x;
      previous.z = entry.z;
      previous.radius = radius;
      return previous;
    }
    if (previous) this.delete(entry.id);
    let order = Number.isFinite(requestedOrder) ? requestedOrder as number : this.nextOrder;
    // A removal compacts the source array, so a newly appended entry can be
    // offered an order that still belongs to a surviving entry. Keep orders
    // unique and append that newcomer after all stable survivors instead.
    if (this.occupiedOrders.has(order)) order = this.nextOrder;
    while (this.occupiedOrders.has(order)) order += 1;
    this.nextOrder = Math.max(this.nextOrder, order + 1);
    const stored: StoredEntry<T> = { ...entry, radius, order, cells, queryToken: 0 };
    this.entries.set(entry.id, stored);
    this.occupiedOrders.add(order);
    for (const key of cells) {
      let bucket = this.buckets.get(key);
      if (!bucket) {
        bucket = new Map();
        this.buckets.set(key, bucket);
      }
      bucket.set(entry.id, stored);
    }
    return stored;
  }

  /** Exact center-distance query. Entry radii are ignored. */
  queryCircle(x: number, z: number, radius: number) {
    return this.queryCircleInternal(x, z, radius, false);
  }

  /** Exact circle-overlap query, including each entry's broad-phase radius. */
  queryOverlappingCircle(x: number, z: number, radius: number) {
    return this.queryCircleInternal(x, z, radius, true);
  }

  private queryCircleInternal(x: number, z: number, radius: number, includeEntryRadius: boolean) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return [];
    const queryRadius = Math.max(0, Number.isFinite(radius) ? radius : 0);
    this.queryToken += 1;
    if (this.queryToken >= Number.MAX_SAFE_INTEGER) {
      this.queryToken = 1;
      for (const entry of this.entries.values()) entry.queryToken = 0;
    }
    const token = this.queryToken;
    const matches: StoredEntry<T>[] = [];
    const firstX = Math.floor((x - queryRadius) / this.cellSize);
    const lastX = Math.floor((x + queryRadius) / this.cellSize);
    const firstZ = Math.floor((z - queryRadius) / this.cellSize);
    const lastZ = Math.floor((z + queryRadius) / this.cellSize);
    for (let cellX = firstX; cellX <= lastX; cellX += 1) {
      for (let cellZ = firstZ; cellZ <= lastZ; cellZ += 1) {
        for (const entry of this.buckets.get(`${cellX},${cellZ}`)?.values() ?? []) {
          if (entry.queryToken === token) continue;
          entry.queryToken = token;
          const exactRadius = queryRadius + (includeEntryRadius ? entry.radius : 0);
          const dx = entry.x - x;
          const dz = entry.z - z;
          if (dx * dx + dz * dz <= exactRadius * exactRadius) matches.push(entry);
        }
      }
    }
    matches.sort((left, right) => left.order - right.order);
    return matches;
  }

  private cellKeys(minX: number, minZ: number, maxX: number, maxZ: number) {
    const keys: string[] = [];
    const firstX = Math.floor(minX / this.cellSize);
    const lastX = Math.floor(maxX / this.cellSize);
    const firstZ = Math.floor(minZ / this.cellSize);
    const lastZ = Math.floor(maxZ / this.cellSize);
    for (let cellX = firstX; cellX <= lastX; cellX += 1) {
      for (let cellZ = firstZ; cellZ <= lastZ; cellZ += 1) keys.push(`${cellX},${cellZ}`);
    }
    return keys;
  }
}
