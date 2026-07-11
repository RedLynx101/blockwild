import type { CreatureMetadata, JsonValue } from "./creature-cage";
import { MOB_DEFS, type ButterflyKind, type MobKind } from "./mobs";

export const MAX_EXHIBIT_BLOCKS = 20;
export const EXHIBIT_BREEDING_CYCLE_SECONDS = 90;

/** Creatures which remain comfortable after their production model is fitted to one habitat cell. */
export const SMALL_EXHIBIT_CREATURE_KINDS = [
  "mossling",
  "puddlehopper",
  "emberjay",
  "canopy-lark",
] as const satisfies readonly MobKind[];

export type SmallExhibitCreatureKind = (typeof SMALL_EXHIBIT_CREATURE_KINDS)[number];

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

export type ExhibitCreature = {
  schema: 1;
  id: string;
  kind: SmallExhibitCreatureKind;
  capturedAt: number;
  ageTicks: number;
  name: string | null;
  geneticSeed: number;
  custom: Record<string, JsonValue>;
  source: "cage";
  metadata: CreatureMetadata;
};

export type ExhibitResident = (ExhibitButterfly & { source?: "butterfly" }) | ExhibitCreature;

export type ExhibitFrameEdge = {
  axis: "x" | "y" | "z";
  center: [number, number, number];
  length: number;
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

export function isSmallExhibitCreature(kind: MobKind): kind is SmallExhibitCreatureKind {
  return (SMALL_EXHIBIT_CREATURE_KINDS as readonly MobKind[]).includes(kind);
}

type GridPoint = readonly [number, number, number];
type FaceDescription = { normal: GridPoint; corners: readonly [GridPoint, GridPoint, GridPoint, GridPoint] };

const EXHIBIT_FACES: readonly FaceDescription[] = [
  { normal: [1, 0, 0], corners: [[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]] },
  { normal: [-1, 0, 0], corners: [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]] },
  { normal: [0, 1, 0], corners: [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]] },
  { normal: [0, -1, 0], corners: [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]] },
  { normal: [0, 0, 1], corners: [[1, -1, 1], [1, 1, 1], [-1, 1, 1], [-1, -1, 1]] },
  { normal: [0, 0, -1], corners: [[-1, -1, -1], [-1, 1, -1], [1, 1, -1], [1, -1, -1]] },
];

const pointKey = (point: GridPoint) => point.join(",");
const edgeKey = (a: GridPoint, b: GridPoint) => pointKey(a) < pointKey(b) ? `${pointKey(a)}|${pointKey(b)}` : `${pointKey(b)}|${pointKey(a)}`;

/**
 * Returns only silhouette and corner rails for a connected component. Edges
 * shared by coplanar exposed panels are omitted, which removes the internal
 * one-frame-per-block grid seen on the old conservatory texture.
 */
export function exteriorExhibitFrameEdges(topology: Pick<ExhibitTopology, "blocks">): ExhibitFrameEdge[] {
  const occupied = new Set(topology.blocks.map((block) => keyOf(block)));
  const edges = new Map<string, { a: GridPoint; b: GridPoint; normals: GridPoint[] }>();
  for (const block of topology.blocks) for (const face of EXHIBIT_FACES) {
    const [nx, ny, nz] = face.normal;
    if (occupied.has(keyOf({ x: block.x + nx, y: block.y + ny, z: block.z + nz }))) continue;
    const corners = face.corners.map(([x, y, z]) => [block.x * 2 + x, block.y * 2 + y, block.z * 2 + z] as GridPoint);
    for (let index = 0; index < 4; index += 1) {
      const a = corners[index];
      const b = corners[(index + 1) % 4];
      const key = edgeKey(a, b);
      const existing = edges.get(key);
      if (existing) existing.normals.push(face.normal);
      else edges.set(key, { a, b, normals: [face.normal] });
    }
  }
  return [...edges.values()].flatMap(({ a, b, normals }) => {
    // Two occurrences with the same normal are a seam between coplanar panels.
    if (normals.length > 1 && normals.every((normal) => normal[0] === normals[0][0] && normal[1] === normals[0][1] && normal[2] === normals[0][2])) return [];
    const dx = Math.abs(b[0] - a[0]);
    const dy = Math.abs(b[1] - a[1]);
    const dz = Math.abs(b[2] - a[2]);
    return [{
      axis: dx ? "x" as const : dy ? "y" as const : "z" as const,
      center: [(a[0] + b[0]) / 4, (a[1] + b[1]) / 4, (a[2] + b[2]) / 4] as [number, number, number],
      length: Math.max(dx, dy, dz) / 2,
    }];
  });
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

export type ExhibitResidentPose = ExhibitButterflyPose & {
  motion: "flutter" | "fly" | "hop" | "walk";
  cellKey: string;
};

function residentSeed(resident: ExhibitResident) {
  return resident.geneticSeed >>> 0;
}

function residentCell(resident: ExhibitResident, topology: ExhibitTopology) {
  const blocks = topology.blocks.length ? topology.blocks : [{ ...topology.origin, key: keyOf(topology.origin), tier: "flower-floor" as const }];
  return blocks[residentSeed(resident) % blocks.length];
}

/**
 * O(1) per resident and strictly cell-bounded. Assigning each resident a
 * component cell prevents straight-line paths from cutting through glass at
 * concave corners while still allowing flight, hopping, and perching.
 */
export function sampleExhibitResidentPose(resident: ExhibitResident, topology: ExhibitTopology, elapsedSeconds: number): ExhibitResidentPose {
  const seed = residentSeed(resident);
  const cell = residentCell(resident, topology);
  const definition = MOB_DEFS[resident.kind];
  const flying = definition.flying || definition.family === "butterfly";
  const cycle = 6.5 + (seed % 31) / 10;
  const phase = ((elapsedSeconds + (seed % 1009) / 97) % cycle + cycle) % cycle / cycle;
  const angle = phase * Math.PI * 2;
  const radius = definition.family === "butterfly" ? 0.24 : flying ? 0.16 : 0.11;
  const x = cell.x + Math.cos(angle) * radius;
  const z = cell.z + Math.sin(angle * (flying ? 1 : 0.5)) * radius;
  if (flying) {
    const resting = phase > 0.78;
    const site = topology.landingSites.find((candidate) => candidate.x === cell.x && candidate.y === cell.y && candidate.z === cell.z);
    if (resting && site) return {
      x: site.x + site.localOffset[0], y: site.y + Math.min(0.31, site.localOffset[1]), z: site.z + site.localOffset[2],
      yaw: angle + Math.PI / 2, landed: true, landingSiteId: site.id,
      motion: definition.family === "bird" ? "hop" : "flutter", cellKey: cell.key,
    };
    return {
      x, y: cell.y + Math.sin(angle * 2) * 0.12 + 0.08, z,
      yaw: angle + Math.PI / 2, landed: false, landingSiteId: null,
      motion: "fly", cellKey: cell.key,
    };
  }
  const hop = resident.kind === "puddlehopper" ? Math.max(0, Math.sin(angle * 2)) * 0.12 : 0;
  return {
    x, y: cell.y - 0.43 + hop, z, yaw: angle + Math.PI / 2,
    landed: true, landingSiteId: null,
    motion: hop > 0.015 ? "hop" : "walk", cellKey: cell.key,
  };
}

/** Deterministic animated pose: each stored specimen alternates between landing and looping flight. */
export function sampleExhibitButterflyPose(butterfly: ExhibitButterfly, topology: ExhibitTopology, elapsedSeconds: number): ExhibitButterflyPose {
  const pose = sampleExhibitResidentPose({ ...butterfly, source: "butterfly" }, topology, elapsedSeconds);
  return {
    x: pose.x,
    y: pose.y,
    z: pose.z,
    yaw: pose.yaw,
    landed: pose.landed,
    landingSiteId: pose.landingSiteId,
  };
}

export type ExhibitBreedingPlan = {
  kind: SmallExhibitCreatureKind;
  parentIds: [string, string];
  child: CreatureMetadata;
};

/** Plans at most one same-species birth for a component and never exceeds capacity. */
export function planExhibitBreeding(residents: readonly ExhibitResident[], capacity: number, cycle: number): ExhibitBreedingPlan | null {
  if (residents.length >= capacity) return null;
  const eligible = residents.filter((resident): resident is ExhibitCreature => resident.source === "cage" && !resident.metadata.baby && MOB_DEFS[resident.kind].breedable === true);
  for (const kind of SMALL_EXHIBIT_CREATURE_KINDS) {
    const parents = eligible.filter((resident) => resident.kind === kind).sort((a, b) => a.id.localeCompare(b.id));
    if (parents.length < 2) continue;
    const [first, second] = parents;
    const definition = MOB_DEFS[kind];
    const geneticSeed = (Math.imul(first.geneticSeed ^ second.geneticSeed, 2654435761) ^ Math.imul(cycle, 2246822519)) >>> 0;
    const entityId = `${kind}-conservatory-${cycle.toString(36)}-${geneticSeed.toString(36)}`;
    const sharedOwner = first.metadata.ownerId && first.metadata.ownerId === second.metadata.ownerId ? first.metadata.ownerId : null;
    return {
      kind,
      parentIds: [first.id, second.id],
      child: {
        schema: 1,
        entityId,
        kind,
        health: definition.health,
        maxHealth: definition.health,
        ageTicks: 0,
        baby: true,
        temperament: definition.temperament,
        hostile: false,
        tamed: Boolean(sharedOwner && first.metadata.tamed && second.metadata.tamed),
        ownerId: sharedOwner,
        name: null,
        geneticSeed,
        command: null,
        custom: { bornInConservatory: true, parentIds: [first.id, second.id] },
      },
    };
  }
  return null;
}
