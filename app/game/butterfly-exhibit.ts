import type { ButterflyKind } from "./mobs";
import type { JsonValue } from "./creature-cage";

export const MAX_EXHIBIT_BLOCKS = 20;

export type ExhibitBlockPosition = { x: number; y: number; z: number };
export type ExhibitTier = "flower-floor" | "branch" | "canopy";
export type ExhibitBlock = ExhibitBlockPosition & { key: string; tier: ExhibitTier };
export type ExhibitLandingSite = ExhibitBlockPosition & {
  id: string;
  tier: ExhibitTier;
  flower: "ember-bloom" | "skybell" | "sunpetal" | null;
  localOffset: [number, number, number];
};

export type ExhibitTopology = {
  origin: ExhibitBlockPosition;
  blocks: ExhibitBlock[];
  capacity: number;
  truncated: boolean;
  minY: number;
  maxY: number;
  landingSites: ExhibitLandingSite[];
};

export type ExhibitButterfly = {
  schema: 1;
  id: string;
  kind: ButterflyKind;
  capturedAt: number;
  ageTicks: number;
  name: string | null;
  geneticSeed: number;
  custom: Record<string, JsonValue>;
};

export type ButterflyExhibitInventory = {
  schema: 1;
  butterflies: ExhibitButterfly[];
};

const keyOf = ({ x, y, z }: ExhibitBlockPosition) => `${x},${y},${z}`;
const OFFSETS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

function hashPosition(position: ExhibitBlockPosition) {
  let value = Math.imul(position.x, 73856093) ^ Math.imul(position.y, 19349663) ^ Math.imul(position.z, 83492791);
  value = Math.imul(value ^ (value >>> 13), 0x5bd1e995);
  return (value ^ (value >>> 15)) >>> 0;
}

function tierFor(y: number, minY: number, maxY: number): ExhibitTier {
  const span = Math.max(1, maxY - minY);
  const ratio = (y - minY) / span;
  return ratio <= 0.35 ? "flower-floor" : ratio < 0.72 ? "branch" : "canopy";
}

/** Flood-fills face-connected glass habitat blocks and caps growth at 20. */
export function buildExhibitTopology(allBlocks: readonly ExhibitBlockPosition[], origin: ExhibitBlockPosition): ExhibitTopology {
  const available = new Map(allBlocks.map((block) => [keyOf(block), { ...block }]));
  if (!available.has(keyOf(origin))) available.set(keyOf(origin), { ...origin });
  const queue: ExhibitBlockPosition[] = [{ ...origin }];
  const connected: ExhibitBlockPosition[] = [];
  const visited = new Set<string>();
  while (queue.length && connected.length < MAX_EXHIBIT_BLOCKS) {
    const current = queue.shift()!;
    const currentKey = keyOf(current);
    if (visited.has(currentKey) || !available.has(currentKey)) continue;
    visited.add(currentKey);
    connected.push(current);
    for (const [dx, dy, dz] of OFFSETS) {
      const next = { x: current.x + dx, y: current.y + dy, z: current.z + dz };
      if (available.has(keyOf(next)) && !visited.has(keyOf(next))) queue.push(next);
    }
  }
  const minY = Math.min(...connected.map((block) => block.y));
  const maxY = Math.max(...connected.map((block) => block.y));
  const blocks: ExhibitBlock[] = connected.map((block) => ({ ...block, key: keyOf(block), tier: tierFor(block.y, minY, maxY) }));
  const landingSites: ExhibitLandingSite[] = blocks.flatMap((block) => {
    const hash = hashPosition(block);
    const flower = block.tier === "flower-floor"
      ? (["ember-bloom", "skybell", "sunpetal"] as const)[hash % 3]
      : null;
    const siteY = block.tier === "flower-floor" ? 0.18 : block.tier === "branch" ? 0.46 : 0.68;
    return [{
      id: `${block.key}:landing`, x: block.x, y: block.y, z: block.z, tier: block.tier, flower,
      localOffset: [((hash & 7) - 3.5) / 12, siteY, (((hash >>> 4) & 7) - 3.5) / 12],
    }];
  });
  return {
    origin: { ...origin }, blocks, capacity: blocks.length,
    truncated: connected.length < available.size && connected.length === MAX_EXHIBIT_BLOCKS,
    minY, maxY, landingSites,
  };
}

function cloneButterfly(value: ExhibitButterfly): ExhibitButterfly {
  return JSON.parse(JSON.stringify(value)) as ExhibitButterfly;
}

export function createExhibitInventory(): ButterflyExhibitInventory {
  return { schema: 1, butterflies: [] };
}

export function storeExhibitButterfly(inventory: ButterflyExhibitInventory, topology: ExhibitTopology, butterfly: ExhibitButterfly) {
  if (inventory.butterflies.length >= topology.capacity) return { inventory, stored: false };
  if (inventory.butterflies.some((candidate) => candidate.id === butterfly.id)) return { inventory, stored: false };
  return { inventory: { schema: 1 as const, butterflies: [...inventory.butterflies.map(cloneButterfly), cloneButterfly(butterfly)] }, stored: true };
}

export function takeExhibitButterfly(inventory: ButterflyExhibitInventory, id: string) {
  const butterfly = inventory.butterflies.find((candidate) => candidate.id === id);
  if (!butterfly) return { inventory, butterfly: null };
  return {
    inventory: { schema: 1 as const, butterflies: inventory.butterflies.filter((candidate) => candidate.id !== id).map(cloneButterfly) },
    butterfly: cloneButterfly(butterfly),
  };
}

export type ExhibitButterflyPose = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  landed: boolean;
  landingSiteId: string | null;
};

/** Deterministic animated pose: each stored specimen alternates between landing and looping flight. */
export function sampleExhibitButterflyPose(butterfly: ExhibitButterfly, topology: ExhibitTopology, elapsedSeconds: number): ExhibitButterflyPose {
  const sites = topology.landingSites;
  if (!sites.length) return { x: topology.origin.x, y: topology.origin.y + 0.5, z: topology.origin.z, yaw: 0, landed: false, landingSiteId: null };
  const seed = butterfly.geneticSeed >>> 0;
  const cycle = 8 + (seed % 5);
  const localTime = ((elapsedSeconds + (seed % 997) / 113) % cycle + cycle) % cycle;
  const site = sites[seed % sites.length];
  const landed = localTime > cycle * 0.66;
  if (landed) return {
    x: site.x + site.localOffset[0], y: site.y + site.localOffset[1], z: site.z + site.localOffset[2],
    yaw: ((seed % 360) / 360) * Math.PI * 2, landed: true, landingSiteId: site.id,
  };
  const a = topology.blocks[seed % topology.blocks.length];
  const b = topology.blocks[(seed * 7 + 3) % topology.blocks.length];
  const progress = localTime / (cycle * 0.66);
  const eased = (1 - Math.cos(progress * Math.PI * 2)) * 0.5;
  const x = a.x + 0.5 + (b.x - a.x) * eased + Math.sin(progress * Math.PI * 4 + seed) * 0.18;
  const y = Math.max(topology.minY + 0.38, a.y + 0.55 + (b.y - a.y) * eased + Math.sin(progress * Math.PI * 2) * 0.22);
  const z = a.z + 0.5 + (b.z - a.z) * eased + Math.cos(progress * Math.PI * 4 + seed) * 0.18;
  return { x, y, z, yaw: Math.atan2(b.x - a.x, b.z - a.z), landed: false, landingSiteId: null };
}
