import { cloneCreatureMetadata, normalizeCreatureMetadata, type CreatureMetadata } from "./creature-cage";
import { BlockId } from "./data";
import { MOB_DEFS } from "./mobs";
import { creatureEcologyContract, summarizeAquariumEcology } from "./creature-ecology";

export const AQUARIUM_MAX_BLOCKS = 20;
export const AQUARIUM_BREED_SECONDS = 180;

export type AquariumBlockPosition = Readonly<{ x: number; y: number; z: number }>;
export type AquariumBlock = AquariumBlockPosition & Readonly<{
  key: string;
  floor: boolean;
  decoration: "pebbles" | "pebbles-flora";
}>;
export type AquariumTopology = Readonly<{
  originKey: string;
  blocks: readonly AquariumBlock[];
  capacity: number;
}>;
export type AquariumResident = Readonly<{
  id: string;
  metadata: CreatureMetadata;
  storedAt: number;
}>;
export type AquariumState = Readonly<{
  schema: 1;
  /** The cell keys last known to belong to this connected component. */
  blockKeys: readonly string[];
  residents: readonly AquariumResident[];
  /** Absolute 180-second epoch bucket. Persisting this prevents reload breeding bursts. */
  lastBreedingCycle: number;
}>;
export type AquariumPose = Readonly<{
  cellKey: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  crawling: boolean;
}>;

const keyFor = ({ x, y, z }: AquariumBlockPosition) => `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
const hashText = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
};
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const validBlockKey = (value: unknown): value is string => typeof value === "string"
  && /^-?\d+,-?\d+,-?\d+$/.test(value)
  && value.split(",").every((part) => Number.isSafeInteger(Number(part)));
const neighborsOf = (block: AquariumBlockPosition): AquariumBlockPosition[] => [
  { x: block.x + 1, y: block.y, z: block.z }, { x: block.x - 1, y: block.y, z: block.z },
  { x: block.x, y: block.y + 1, z: block.z }, { x: block.x, y: block.y - 1, z: block.z },
  { x: block.x, y: block.y, z: block.z + 1 }, { x: block.x, y: block.y, z: block.z - 1 },
];

export function isAquariumBlock(block: BlockId | undefined): block is BlockId.GlassAquarium {
  return block === BlockId.GlassAquarium;
}

/** Bounded world lookup used by placement, UI and storage; never scans beyond the twenty-cell cap. */
export function buildAquariumTopologyFromWorld(
  origin: AquariumBlockPosition,
  readBlock: (x: number, y: number, z: number) => BlockId | undefined,
): AquariumTopology {
  const blocks: AquariumBlockPosition[] = [];
  const visited = new Set<string>();
  const queue: AquariumBlockPosition[] = [{ x: Math.round(origin.x), y: Math.round(origin.y), z: Math.round(origin.z) }];
  while (queue.length && blocks.length < AQUARIUM_MAX_BLOCKS) {
    const current = queue.shift()!;
    const key = keyFor(current);
    if (visited.has(key)) continue;
    visited.add(key);
    if (!isAquariumBlock(readBlock(current.x, current.y, current.z))) continue;
    blocks.push(current);
    for (const neighbor of neighborsOf(current)) if (!visited.has(keyFor(neighbor))) queue.push(neighbor);
  }
  return buildAquariumTopology(blocks, origin);
}

/** Finds only the face-connected tank containing origin; detached glass never shares inventory. */
export function buildAquariumTopology(allBlocks: readonly AquariumBlockPosition[], origin: AquariumBlockPosition): AquariumTopology {
  const available = new Map(allBlocks.map((block) => [keyFor(block), { x: Math.round(block.x), y: Math.round(block.y), z: Math.round(block.z) }]));
  const clickedKey = keyFor(origin);
  if (!available.has(clickedKey)) available.set(clickedKey, { x: Math.round(origin.x), y: Math.round(origin.y), z: Math.round(origin.z) });
  const connected: AquariumBlockPosition[] = [];
  const visited = new Set<string>();
  const queue = [available.get(clickedKey)!];
  while (queue.length && connected.length < AQUARIUM_MAX_BLOCKS) {
    const current = queue.shift()!;
    const key = keyFor(current);
    if (visited.has(key)) continue;
    visited.add(key);
    connected.push(current);
    for (const neighbor of neighborsOf(current)) {
      const candidate = available.get(keyFor(neighbor));
      if (candidate && !visited.has(keyFor(candidate))) queue.push(candidate);
    }
  }
  connected.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  const keys = new Set(connected.map(keyFor));
  const blocks = connected.map((block): AquariumBlock => {
    const key = keyFor(block);
    const floor = !keys.has(keyFor({ x: block.x, y: block.y - 1, z: block.z }));
    return {
      ...block,
      key,
      floor,
      decoration: floor && hashText(key) % 3 === 0 ? "pebbles-flora" : "pebbles",
    };
  });
  // Storage identity belongs to the component, not the cell the player
  // happened to click. Numeric topology order remains stable across clients.
  const originKey = blocks[0]?.key ?? clickedKey;
  return { originKey, blocks, capacity: blocks.length };
}

export function isAquariumCreature(kind: string) {
  const definition = MOB_DEFS[kind as keyof typeof MOB_DEFS];
  if (!definition) return false;
  const roles = creatureEcologyContract(kind as keyof typeof MOB_DEFS).aquariumRoles;
  return roles.length > 0 && Boolean(definition.aquatic || definition.family === "sea-slug") && definition.radius <= .5;
}

export function isAquariumCrawler(kind: string) {
  const definition = MOB_DEFS[kind as keyof typeof MOB_DEFS];
  return Boolean(definition && (definition.family === "sea-slug" || definition.bottomDweller));
}

export function storeAquariumResident(residents: readonly AquariumResident[], topology: AquariumTopology, metadata: CreatureMetadata, storedAt = Date.now()) {
  if (!isAquariumCreature(metadata.kind) || residents.length >= topology.capacity) return null;
  if (residents.some((resident) => resident.id === metadata.entityId)) return null;
  return [...residents, { id: metadata.entityId, metadata: cloneCreatureMetadata(metadata), storedAt } satisfies AquariumResident];
}

export function takeAquariumResident(residents: readonly AquariumResident[], id: string) {
  const resident = residents.find((candidate) => candidate.id === id) ?? null;
  return { resident: resident ? { ...resident, metadata: cloneCreatureMetadata(resident.metadata) } : null, residents: residents.filter((candidate) => candidate.id !== id) };
}

export function createAquariumState(topology: AquariumTopology, lastBreedingCycle = 0): AquariumState {
  return {
    schema: 1,
    blockKeys: topology.blocks.map((block) => block.key),
    residents: [],
    lastBreedingCycle: Math.max(0, Math.floor(lastBreedingCycle)),
  };
}

/** Strictly restores exact creature metadata while dropping malformed or no-longer-eligible entries. */
export function normalizeAquariumStorage(value: unknown) {
  if (!isRecord(value)) return new Map<string, AquariumState>();
  const result = new Map<string, AquariumState>();
  const seenResidents = new Set<string>();
  for (const [originKey, raw] of Object.entries(value)) {
    if (!validBlockKey(originKey) || !isRecord(raw) || raw.schema !== 1 || !Array.isArray(raw.blockKeys) || !Array.isArray(raw.residents)) continue;
    const blockKeys = [...new Set(raw.blockKeys.filter(validBlockKey))].sort((a, b) => {
      const [ax, ay, az] = a.split(",").map(Number);
      const [bx, by, bz] = b.split(",").map(Number);
      return ay - by || az - bz || ax - bx;
    }).slice(0, AQUARIUM_MAX_BLOCKS);
    if (!blockKeys.length) continue;
    const residents: AquariumResident[] = [];
    for (const candidate of raw.residents.slice(0, AQUARIUM_MAX_BLOCKS)) {
      if (!isRecord(candidate)) continue;
      const metadata = normalizeCreatureMetadata(candidate.metadata);
      const id = typeof candidate.id === "string" ? candidate.id : metadata?.entityId;
      if (!metadata || !id || id !== metadata.entityId || seenResidents.has(id) || !isAquariumCreature(metadata.kind)) continue;
      seenResidents.add(id);
      residents.push({
        id,
        metadata,
        storedAt: typeof candidate.storedAt === "number" && Number.isFinite(candidate.storedAt) ? Math.max(0, candidate.storedAt) : 0,
      });
    }
    result.set(originKey, {
      schema: 1,
      blockKeys,
      residents: residents.slice(0, blockKeys.length),
      lastBreedingCycle: typeof raw.lastBreedingCycle === "number" && Number.isFinite(raw.lastBreedingCycle)
        ? Math.max(0, Math.floor(raw.lastBreedingCycle)) : 0,
    });
  }
  return result;
}

export type AquariumReconcileResult = Readonly<{
  states: ReadonlyMap<string, AquariumState>;
  overflow: readonly AquariumResident[];
}>;

/**
 * Rehomes residents after tanks merge or split. A resident is assigned once,
 * deterministically, and never cloned. The caller safely returns overflow to
 * Capture Orbs when physical capacity shrinks.
 */
export function reconcileAquariumStorage(
  previous: ReadonlyMap<string, AquariumState>,
  topologies: readonly AquariumTopology[],
): AquariumReconcileResult {
  const uniqueTopologies = [...new Map(topologies.map((topology) => [topology.originKey, topology])).values()]
    .sort((a, b) => a.originKey.localeCompare(b.originKey));
  const destinationByBlock = new Map<string, AquariumTopology>();
  for (const topology of uniqueTopologies) for (const block of topology.blocks) destinationByBlock.set(block.key, topology);
  const mutable = new Map(uniqueTopologies.map((topology) => [topology.originKey, {
    topology,
    residents: [] as AquariumResident[],
    lastBreedingCycle: 0,
  }]));
  const overflow: AquariumResident[] = [];
  const assigned = new Set<string>();
  for (const [, state] of [...previous.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const destinations = [...new Map(state.blockKeys.flatMap((key) => {
      const topology = destinationByBlock.get(key);
      return topology ? [[topology.originKey, topology] as const] : [];
    })).values()].sort((a, b) => a.originKey.localeCompare(b.originKey));
    for (const destination of destinations) {
      const next = mutable.get(destination.originKey)!;
      next.lastBreedingCycle = Math.max(next.lastBreedingCycle, state.lastBreedingCycle);
    }
    for (const resident of state.residents) {
      if (assigned.has(resident.id)) continue;
      assigned.add(resident.id);
      if (!destinations.length) {
        overflow.push(resident);
        continue;
      }
      const preferred = hashText(resident.id) % destinations.length;
      let placed = false;
      for (let offset = 0; offset < destinations.length; offset += 1) {
        const destination = destinations[(preferred + offset) % destinations.length];
        const next = mutable.get(destination.originKey)!;
        if (next.residents.length >= destination.capacity) continue;
        next.residents.push({ ...resident, metadata: cloneCreatureMetadata(resident.metadata) });
        placed = true;
        break;
      }
      if (!placed) overflow.push(resident);
    }
  }
  return {
    states: new Map([...mutable].map(([originKey, value]) => [originKey, {
      schema: 1 as const,
      blockKeys: value.topology.blocks.map((block) => block.key),
      residents: value.residents,
      lastBreedingCycle: value.lastBreedingCycle,
    }])),
    overflow,
  };
}

export function sampleAquariumPose(resident: AquariumResident, topology: AquariumTopology, elapsedSeconds: number): AquariumPose {
  const seed = hashText(`${resident.id}:${resident.metadata.geneticSeed}`);
  const cell = topology.blocks[seed % Math.max(1, topology.blocks.length)] ?? { key: topology.originKey, x: 0, y: 0, z: 0, floor: true, decoration: "pebbles" as const };
  const phase = elapsedSeconds * (0.42 + (seed % 29) / 100) + (seed % 360) * Math.PI / 180;
  const crawling = isAquariumCrawler(resident.metadata.kind);
  const radius = crawling ? 0.28 : 0.31;
  const x = cell.x + Math.sin(phase) * radius;
  const z = cell.z + Math.cos(phase * 0.83) * radius;
  const y = crawling ? cell.y - 0.37 : cell.y + Math.sin(phase * 0.71) * 0.22;
  return { cellKey: cell.key, x, y, z, yaw: Math.atan2(Math.cos(phase), -Math.sin(phase)), crawling };
}

export type AquariumBreedingPlan = Readonly<{ parentIds: readonly [string, string]; child: CreatureMetadata }>;

export function planAquariumBreeding(residents: readonly AquariumResident[], topology: AquariumTopology, elapsedSeconds: number): AquariumBreedingPlan | null {
  if (residents.length >= topology.capacity || Math.floor(elapsedSeconds / AQUARIUM_BREED_SECONDS) < 1) return null;
  const ecology = summarizeAquariumEcology(residents.map((resident) => resident.metadata.kind));
  // Breeding remains a slow lineage event and requires a healthy, comfortable
  // habitat rather than merely two adults sharing storage.
  if (ecology.health < 55 || ecology.comfort < 55) return null;
  const eligible = residents.filter((resident) => !resident.metadata.baby && resident.metadata.ageTicks >= 24_000);
  const byKind = new Map<string, AquariumResident[]>();
  for (const resident of eligible) {
    const group = byKind.get(resident.metadata.kind) ?? [];
    group.push(resident);
    byKind.set(resident.metadata.kind, group);
  }
  const pair = [...byKind.values()].find((group) => group.length >= 2);
  if (!pair) return null;
  const [first, second] = pair;
  const seed = hashText(`${first.id}:${second.id}:${Math.floor(elapsedSeconds / AQUARIUM_BREED_SECONDS)}`);
  return {
    parentIds: [first.id, second.id],
    child: {
      ...cloneCreatureMetadata(first.metadata),
      entityId: `aquarium-${seed.toString(36)}`,
      health: Math.max(1, Math.ceil(first.metadata.maxHealth * 0.5)),
      ageTicks: 0,
      baby: true,
      tamed: false,
      ownerId: null,
      name: null,
      geneticSeed: seed,
      command: null,
      custom: { bornInAquarium: true, parentIds: [first.id, second.id] },
    },
  };
}
