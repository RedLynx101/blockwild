import { BlockId, Item, archiveShelfBlockForBookCount, type ItemCode } from "./data";
import type { TreePlanBlock } from "./ecology";
import type { PlannedBlock, StructureMarker, WorldPosition } from "./structures";

export const DRAGON_LAIR_REGION_BLOCKS = 44 * 16;
export const DRAGON_LAIR_STAGE_FIVE_CHANCE = 0.22;

export type DragonType = "fire" | "ice" | "steel";
export type DragonSex = "male" | "female";
export type DragonLairStage = 4 | 5;

export type DragonLairPlan = Readonly<{
  id: string;
  type: DragonType;
  stage: DragonLairStage;
  sex: DragonSex;
  origin: WorldPosition;
  bounds: Readonly<{ min: WorldPosition; max: WorldPosition }>;
  placements: readonly PlannedBlock[];
  markers: readonly StructureMarker[];
  eggPositions: readonly WorldPosition[];
}>;

export type DragonLairSurvey = Readonly<{
  lairId: string;
  dragonType: DragonType;
  minimumStage: DragonLairStage;
  actualStage: DragonLairStage;
  position: WorldPosition;
  distanceBlocks: number;
  markerName: string;
}>;

export const SPELL_TOME_ITEMS: readonly ItemCode[] = Object.freeze([
  Item.TomeFlameJet,
  Item.TomeFrostLance,
  Item.TomeSteelSpear,
  Item.TomeHealingLight,
  Item.TomeBlinkstep,
  Item.TomeArcaneWard,
]);
export const ARCHIVABLE_BOOK_ITEMS: readonly ItemCode[] = Object.freeze([Item.BoundBook, ...SPELL_TOME_ITEMS]);

export type ArchiveShelfState = Readonly<{ schema: 1; tomes: readonly ItemCode[] }>;
export type TomeDisplayState = Readonly<{ schema: 1; tome: ItemCode | null }>;

export function isSpellTomeItem(item: ItemCode): boolean {
  return SPELL_TOME_ITEMS.includes(item);
}

export function isArchiveBookItem(item: ItemCode): boolean {
  return ARCHIVABLE_BOOK_ITEMS.includes(item);
}

export function normalizeArchiveShelf(value: unknown): ArchiveShelfState {
  const source = value && typeof value === "object" && Array.isArray((value as Partial<ArchiveShelfState>).tomes)
    ? (value as Partial<ArchiveShelfState>).tomes ?? []
    : [];
  return { schema: 1, tomes: source.filter((item): item is ItemCode => typeof item === "number" && isArchiveBookItem(item)).slice(0, 6) };
}

export function insertArchiveTome(state: ArchiveShelfState, item: ItemCode) {
  const normalized = normalizeArchiveShelf(state);
  if (!isArchiveBookItem(item)) return { state: normalized, inserted: false, reason: "not-a-book" as const };
  if (normalized.tomes.length >= 6) return { state: normalized, inserted: false, reason: "full" as const };
  const next = { schema: 1 as const, tomes: [...normalized.tomes, item] };
  return { state: next, inserted: true, reason: "ok" as const, block: archiveShelfBlockForBookCount(next.tomes.length) };
}

export function removeArchiveTome(state: ArchiveShelfState, slot = -1) {
  const normalized = normalizeArchiveShelf(state);
  if (!normalized.tomes.length) return { state: normalized, item: null, removed: false, block: archiveShelfBlockForBookCount(0) };
  const index = slot < 0 ? normalized.tomes.length - 1 : clamp(Math.trunc(slot), 0, normalized.tomes.length - 1);
  const tomes = [...normalized.tomes];
  const [item] = tomes.splice(index, 1);
  return { state: { schema: 1 as const, tomes }, item, removed: true, block: archiveShelfBlockForBookCount(tomes.length) };
}

export function normalizeTomeDisplay(value: unknown): TomeDisplayState {
  const tome = value && typeof value === "object" ? (value as Partial<TomeDisplayState>).tome : null;
  return { schema: 1, tome: typeof tome === "number" && isArchiveBookItem(tome) ? tome : null };
}

export function setDisplayedTome(state: TomeDisplayState, tome: ItemCode | null) {
  const normalized = normalizeTomeDisplay(state);
  if (tome !== null && !isArchiveBookItem(tome)) return { state: normalized, replaced: null, applied: false };
  return { state: { schema: 1 as const, tome }, replaced: normalized.tome, applied: true };
}

export type DragonLairRegionInput = Readonly<{
  seed: string | number;
  regionX: number;
  regionZ: number;
  surfaceYAt?: (x: number, z: number) => number;
  forceType?: DragonType;
  forceStage?: DragonLairStage;
  forceSex?: DragonSex;
}>;

export type DragonLairCandidate = Readonly<{
  id: string;
  type: DragonType;
  stage: DragonLairStage;
  sex: DragonSex;
  regionX: number;
  regionZ: number;
  origin: WorldPosition;
  radiusX: number;
  radiusY: number;
  radiusZ: number;
  bounds: Readonly<{ min: WorldPosition; max: WorldPosition }>;
}>;

const FACE_NEIGHBORS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;
const AXIS_ORDERS = [
  ["y", "x", "z"], ["y", "z", "x"], ["x", "y", "z"],
  ["x", "z", "y"], ["z", "y", "x"], ["z", "x", "y"],
] as const;

const positionKey = (position: Readonly<{ x: number; y: number; z: number }>) => `${position.x},${position.y},${position.z}`;
const columnKey = (position: Readonly<{ x: number; z: number }>) => `${position.x},${position.z}`;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function seedHash(seed: string | number) {
  const source = String(seed);
  let value = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    value ^= source.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function hashUnit(seed: string | number, salt: string) {
  let value = seedHash(`${seed}|${salt}`);
  value = Math.imul(value ^ (value >>> 15), 2246822519);
  value = Math.imul(value ^ (value >>> 13), 3266489917);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function dragonTypeFor(seed: string | number, regionX: number, regionZ: number): DragonType {
  const roll = hashUnit(seed, `dragon-type:${regionX},${regionZ}`);
  return roll < 1 / 3 ? "fire" : roll < 2 / 3 ? "ice" : "steel";
}

export const DRAGON_LAIR_PALETTES: Readonly<Record<DragonType, Readonly<{
  wall: BlockId;
  eggBlock: BlockId;
  eggItem: ItemCode;
  heartItem: ItemCode;
  scaleItem: ItemCode;
  surveyItem: ItemCode;
}>>> = Object.freeze({
  fire: { wall: BlockId.CharredDragonstone, eggBlock: BlockId.FireDragonEggBlock, eggItem: Item.FireDragonEgg, heartItem: Item.FireDragonHeart, scaleItem: Item.FireDragonScale, surveyItem: Item.FireLairSurvey },
  ice: { wall: BlockId.RimeDragonstone, eggBlock: BlockId.IceDragonEggBlock, eggItem: Item.IceDragonEgg, heartItem: Item.IceDragonHeart, scaleItem: Item.IceDragonScale, surveyItem: Item.IceLairSurvey },
  steel: { wall: BlockId.RivetedDragonstone, eggBlock: BlockId.SteelDragonEggBlock, eggItem: Item.SteelDragonEgg, heartItem: Item.SteelDragonHeart, scaleItem: Item.SteelDragonScale, surveyItem: Item.SteelLairSurvey },
});

export const DRAGON_EGG_HATCH_RULES = Object.freeze({
  fire: Object.freeze({ naturalCondition: "sustained-fire", incubationSeconds: 360, description: "Keep the placed egg beside sustained flame for six uninterrupted minutes." }),
  ice: Object.freeze({ naturalCondition: "freezing-water", incubationSeconds: 360, description: "Submerge the placed egg in source water ringed by ice for six uninterrupted minutes." }),
  steel: Object.freeze({ naturalCondition: "pressurized-steam", incubationSeconds: 420, description: "Keep the egg between water and a safe heat source so steam cycles across its shell." }),
});

/** Female stage-five lairs may carry extra eggs; males never generate eggs. */
export function dragonLairEggCount(seed: string | number, type: DragonType, stage: DragonLairStage, sex: DragonSex) {
  if (sex !== "female") return 0;
  if (stage === 4) return 1;
  return 1 + Math.floor(hashUnit(seed, `egg-count:${type}`) * 3);
}

export function dragonLairCandidateForRegion(input: DragonLairRegionInput): DragonLairCandidate | null {
  const { seed, regionX, regionZ } = input;
  // Not every region receives a lair. The 704-block grid keeps them rare while
  // still making survey-charter scans bounded and deterministic.
  if (hashUnit(seed, `dragon-lair-present:${regionX},${regionZ}`) < 0.29) return null;
  const margin = 112;
  const span = DRAGON_LAIR_REGION_BLOCKS - margin * 2;
  const centerX = regionX * DRAGON_LAIR_REGION_BLOCKS + margin + Math.floor(hashUnit(seed, `dragon-lair-x:${regionX},${regionZ}`) * span);
  const centerZ = regionZ * DRAGON_LAIR_REGION_BLOCKS + margin + Math.floor(hashUnit(seed, `dragon-lair-z:${regionX},${regionZ}`) * span);
  const surfaceY = input.surfaceYAt?.(centerX, centerZ) ?? 34;
  const centerY = clamp(Math.min(surfaceY - 22, -18 - Math.floor(hashUnit(seed, `dragon-lair-y:${regionX},${regionZ}`) * 22)), -46, -16);
  const type = input.forceType ?? dragonTypeFor(seed, regionX, regionZ);
  const stage = input.forceStage ?? (hashUnit(seed, `dragon-lair-stage:${regionX},${regionZ}`) < DRAGON_LAIR_STAGE_FIVE_CHANCE ? 5 : 4);
  const sex = input.forceSex ?? (hashUnit(seed, `dragon-lair-sex:${regionX},${regionZ}`) < 0.5 ? "female" : "male");
  const radiusX = stage === 5 ? 13 : 10;
  const radiusY = stage === 5 ? 8 : 6;
  const radiusZ = stage === 5 ? 12 : 10;
  const id = `dragon-lair:${type}:${regionX}:${regionZ}`;
  return {
    id, type, stage, sex, regionX, regionZ,
    origin: { x: centerX, y: centerY, z: centerZ },
    radiusX, radiusY, radiusZ,
    bounds: {
      min: { x: centerX - radiusX, y: centerY - radiusY, z: centerZ - radiusZ },
      max: { x: centerX + radiusX, y: centerY + radiusY, z: centerZ + radiusZ },
    },
  };
}

export function planDragonLairForRegion(input: DragonLairRegionInput): DragonLairPlan | null {
  const candidate = dragonLairCandidateForRegion(input);
  if (!candidate) return null;
  const { seed } = input;
  const { id, type, stage, sex, regionX, regionZ, radiusX, radiusY, radiusZ } = candidate;
  const { x: centerX, y: centerY, z: centerZ } = candidate.origin;
  const palette = DRAGON_LAIR_PALETTES[type];
  const placements = new Map<string, PlannedBlock>();
  const set = (x: number, y: number, z: number, block: BlockId, variant: string) => placements.set(`${x},${y},${z}`, { x, y, z, block, variant });

  for (let dy = -radiusY; dy <= radiusY; dy += 1) for (let dz = -radiusZ; dz <= radiusZ; dz += 1) for (let dx = -radiusX; dx <= radiusX; dx += 1) {
    const distance = (dx / radiusX) ** 2 + (dy / radiusY) ** 2 + (dz / radiusZ) ** 2;
    if (distance > 1) continue;
    const shellNoise = (hashUnit(seed, `lair-shell:${regionX},${regionZ}:${dx},${dy},${dz}`) - 0.5) * 0.06;
    if (distance + shellNoise >= 0.7) set(centerX + dx, centerY + dy, centerZ + dz, palette.wall, `${type}-dragonstone`);
    else set(centerX + dx, centerY + dy, centerZ + dz, BlockId.Air, "dragon-cavern");
  }

  const floorY = centerY - radiusY + 2;
  const treasureCount = stage === 5 ? 30 : 18;
  for (let index = 0; index < treasureCount; index += 1) {
    const angle = hashUnit(seed, `treasure-angle:${regionX},${regionZ}:${index}`) * Math.PI * 2;
    const radial = 2 + Math.sqrt(hashUnit(seed, `treasure-radius:${regionX},${regionZ}:${index}`)) * (Math.min(radiusX, radiusZ) - 4);
    const x = centerX + Math.round(Math.cos(angle) * radial);
    const z = centerZ + Math.round(Math.sin(angle) * radial);
    set(x, floorY, z, index < (stage === 5 ? 7 : 4) ? BlockId.GoldBlock : BlockId.GoldPile, index < (stage === 5 ? 7 : 4) ? "dragon-hoard-block" : "dragon-hoard-pile");
  }

  const markers: StructureMarker[] = [];
  const chestCount = stage === 5 ? 4 : 3;
  const tomeKeys = type === "fire" ? ["tome-flame-jet", "tome-blinkstep"] : type === "ice" ? ["tome-frost-lance", "tome-arcane-ward"] : ["tome-steel-spear", "tome-healing-light"];
  for (let index = 0; index < chestCount; index += 1) {
    const angle = (index / chestCount) * Math.PI * 2 + hashUnit(seed, `chest-angle:${regionX},${regionZ}`);
    const position = { x: centerX + Math.round(Math.cos(angle) * (radiusX - 4)), y: floorY, z: centerZ + Math.round(Math.sin(angle) * (radiusZ - 4)) };
    set(position.x, position.y, position.z, BlockId.Chest, "dragon-hoard-chest");
    const rareRoll = hashUnit(seed, `chest-rare:${regionX},${regionZ}:${index}`);
    markers.push({
      type: "chest",
      id: `${id}:chest:${index}`,
      position,
      lootTable: "desert-temple",
      loot: [
        { itemKey: "gold-ingot", count: 5 + Math.floor(hashUnit(seed, `chest-gold:${index}`) * (stage === 5 ? 18 : 10)) },
        { itemKey: "crystal-shard", count: 2 + Math.floor(hashUnit(seed, `chest-crystal:${index}`) * 7) },
        { itemKey: type === "fire" ? "fire-dragon-scale" : type === "ice" ? "ice-dragon-scale" : "steel-dragon-scale", count: stage === 5 ? 5 : 3 },
        ...(rareRoll < 0.2 ? [{ itemKey: tomeKeys[index % tomeKeys.length], count: 1 }] : []),
        ...(rareRoll > 0.92 ? [{ itemKey: index % 2 ? "blueprint-dragonbone-arms" : "blueprint-dragon-scale-armor", count: 1 }] : []),
      ],
    });
  }

  const eggCount = dragonLairEggCount(`${seed}:${regionX}:${regionZ}`, type, stage, sex);
  const eggPositions: WorldPosition[] = [];
  for (let index = 0; index < eggCount; index += 1) {
    const offsetX = index - Math.floor(eggCount / 2);
    const position = { x: centerX + offsetX * 2, y: floorY, z: centerZ + radiusZ - 4 };
    set(position.x, position.y, position.z, palette.eggBlock, `${type}-dragon-egg`);
    eggPositions.push(position);
  }

  markers.push({
    type: "spawn",
    id: `${id}:guardian`,
    position: { x: centerX, y: floorY + 1, z: centerZ },
    mobKind: `${type}-dragon`,
    count: 1,
    radius: 1,
    persistent: true,
    tags: [`dragon:${type}`, `stage:${stage}`, `sex:${sex}`, `lair:${id}`, "permanent:true", "guardian:true"],
  });
  markers.push({
    type: "landmark",
    id,
    position: { x: centerX, y: centerY, z: centerZ },
    tag: `dragon-lair:${type}:stage-${stage}:${sex}`,
  });

  return Object.freeze({
    id,
    type,
    stage,
    sex,
    origin: { x: centerX, y: centerY, z: centerZ },
    bounds: candidate.bounds,
    placements: Object.freeze([...placements.values()].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x)),
    markers: Object.freeze(markers),
    eggPositions: Object.freeze(eggPositions),
  });
}

export function dragonLairPlacementsForChunk(plan: DragonLairPlan, chunkX: number, chunkZ: number, chunkSize = 16) {
  const minX = chunkX * chunkSize;
  const minZ = chunkZ * chunkSize;
  return plan.placements.filter((placement) => placement.x >= minX && placement.x < minX + chunkSize && placement.z >= minZ && placement.z < minZ + chunkSize);
}

export function dragonLairMarkersForChunk(plan: DragonLairPlan, chunkX: number, chunkZ: number, chunkSize = 16) {
  const minX = chunkX * chunkSize;
  const minZ = chunkZ * chunkSize;
  return plan.markers.filter((marker) => marker.position.x >= minX && marker.position.x < minX + chunkSize && marker.position.z >= minZ && marker.position.z < minZ + chunkSize);
}

export function dragonLairsIntersectingChunk(input: Readonly<{
  seed: string | number;
  chunkX: number;
  chunkZ: number;
  chunkSize?: number;
  surfaceYAt?: (x: number, z: number) => number;
}>) {
  const chunkSize = input.chunkSize ?? 16;
  const minX = input.chunkX * chunkSize;
  const minZ = input.chunkZ * chunkSize;
  const reach = 14;
  const regionMinX = Math.floor((minX - reach) / DRAGON_LAIR_REGION_BLOCKS);
  const regionMaxX = Math.floor((minX + chunkSize + reach) / DRAGON_LAIR_REGION_BLOCKS);
  const regionMinZ = Math.floor((minZ - reach) / DRAGON_LAIR_REGION_BLOCKS);
  const regionMaxZ = Math.floor((minZ + chunkSize + reach) / DRAGON_LAIR_REGION_BLOCKS);
  const plans: DragonLairPlan[] = [];
  for (let regionX = regionMinX; regionX <= regionMaxX; regionX += 1) for (let regionZ = regionMinZ; regionZ <= regionMaxZ; regionZ += 1) {
    const candidateInput = { seed: input.seed, regionX, regionZ, surfaceYAt: input.surfaceYAt };
    const candidate = dragonLairCandidateForRegion(candidateInput);
    if (!candidate || candidate.bounds.max.x < minX || candidate.bounds.min.x >= minX + chunkSize || candidate.bounds.max.z < minZ || candidate.bounds.min.z >= minZ + chunkSize) continue;
    const plan = planDragonLairForRegion(candidateInput);
    if (plan) plans.push(plan);
  }
  return plans;
}

/**
 * Scans deterministic region rings, not loaded chunks, so a charter can mark a
 * genuinely undiscovered lair without generating or retaining its cavern.
 */
export function surveyNearestUndiscoveredDragonLair(input: Readonly<{
  seed: string | number;
  origin: Readonly<{ x: number; z: number }>;
  dragonType: DragonType;
  minimumStage: DragonLairStage;
  discoveredLairIds?: ReadonlySet<string> | readonly string[];
  maxRegionRadius?: number;
  surfaceYAt?: (x: number, z: number) => number;
}>): DragonLairSurvey | null {
  const known = input.discoveredLairIds instanceof Set ? input.discoveredLairIds : new Set(input.discoveredLairIds ?? []);
  const originRegionX = Math.floor(input.origin.x / DRAGON_LAIR_REGION_BLOCKS);
  const originRegionZ = Math.floor(input.origin.z / DRAGON_LAIR_REGION_BLOCKS);
  const maxRadius = clamp(Math.floor(input.maxRegionRadius ?? 24), 1, 64);
  let best: DragonLairCandidate | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let radius = 0; radius <= maxRadius; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) for (let dz = -radius; dz <= radius; dz += 1) {
      if (radius > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
      const candidate = dragonLairCandidateForRegion({ seed: input.seed, regionX: originRegionX + dx, regionZ: originRegionZ + dz, surfaceYAt: input.surfaceYAt });
      if (!candidate || candidate.type !== input.dragonType || candidate.stage < input.minimumStage || known.has(candidate.id)) continue;
      const distance = Math.hypot(candidate.origin.x - input.origin.x, candidate.origin.z - input.origin.z);
      if (distance < bestDistance || (distance === bestDistance && candidate.id < (best?.id ?? "~"))) {
        best = candidate;
        bestDistance = distance;
      }
    }
    // Once the next complete region ring begins farther away than the current
    // best, no later region can win; survey work remains bounded in real play.
    if (best && radius * DRAGON_LAIR_REGION_BLOCKS > bestDistance + DRAGON_LAIR_REGION_BLOCKS * 1.5) break;
  }
  const resolvedBest = best as DragonLairCandidate | null;
  if (!resolvedBest) return null;
  return {
    lairId: resolvedBest.id,
    dragonType: resolvedBest.type,
    minimumStage: input.minimumStage,
    actualStage: resolvedBest.stage,
    position: resolvedBest.origin,
    distanceBlocks: Math.round(bestDistance),
    markerName: `${resolvedBest.type[0].toUpperCase()}${resolvedBest.type.slice(1)} Dragon Lair · Stage ${resolvedBest.stage}+ survey`,
  };
}

export function useDragonLairSurveyCharter(input: Parameters<typeof surveyNearestUndiscoveredDragonLair>[0]) {
  const survey = surveyNearestUndiscoveredDragonLair(input);
  return survey ? { outcome: "revealed" as const, consumeItem: true, survey } : { outcome: "none-found" as const, consumeItem: false, survey: null };
}

function connectedKeys(blocks: ReadonlyMap<string, TreePlanBlock>, rootKey: string, predicate: (block: TreePlanBlock) => boolean) {
  if (!blocks.has(rootKey) || !predicate(blocks.get(rootKey)!)) return new Set<string>();
  const visited = new Set<string>([rootKey]);
  const queue = [rootKey];
  while (queue.length) {
    const key = queue.shift()!;
    const current = blocks.get(key)!;
    for (const [dx, dy, dz] of FACE_NEIGHBORS) {
      const nextKey = `${current.x + dx},${current.y + dy},${current.z + dz}`;
      const next = blocks.get(nextKey);
      if (!next || visited.has(nextKey) || !predicate(next)) continue;
      visited.add(nextKey);
      queue.push(nextKey);
    }
  }
  return visited;
}

export function treePlanIsFaceConnected(plan: readonly TreePlanBlock[], root: Readonly<{ x: number; y: number; z: number }>) {
  const blocks = new Map(plan.map((block) => [positionKey(block), block]));
  return blocks.size > 0 && connectedKeys(blocks, positionKey(root), () => true).size === blocks.size;
}

/**
 * Bridges authored log islands, then removes only orphaned leaf components.
 * The result preserves form variety while guaranteeing that every retained
 * voxel has a face-connected path to the rooted trunk—even at chunk seams or
 * when a liquid/POI exclusion clips one side of a crown.
 */
export function repairGeneratedTreePlan(input: Readonly<{
  plan: readonly TreePlanBlock[];
  root: Readonly<{ x: number; y: number; z: number }>;
  logBlock: BlockId;
  forbiddenColumns?: ReadonlySet<string>;
}>): TreePlanBlock[] {
  const forbidden = input.forbiddenColumns ?? new Set<string>();
  if (forbidden.has(columnKey(input.root))) return [];
  const blocks = new Map<string, TreePlanBlock>();
  for (const block of input.plan) {
    if (forbidden.has(columnKey(block))) continue;
    const key = positionKey(block);
    if (blocks.get(key)?.block === input.logBlock && block.block !== input.logBlock) continue;
    blocks.set(key, block);
  }
  const rootKey = positionKey(input.root);
  blocks.set(rootKey, { ...input.root, block: input.logBlock });

  let logConnected = connectedKeys(blocks, rootKey, (block) => block.block === input.logBlock);
  const orphanLogs = () => [...blocks.values()].filter((block) => block.block === input.logBlock && !logConnected.has(positionKey(block)));
  while (orphanLogs().length) {
    const target = orphanLogs().sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z)[0];
    const anchors = [...logConnected].map((key) => blocks.get(key)!).sort((a, b) => {
      const da = Math.abs(target.x - a.x) + Math.abs(target.y - a.y) + Math.abs(target.z - a.z);
      const db = Math.abs(target.x - b.x) + Math.abs(target.y - b.y) + Math.abs(target.z - b.z);
      return da - db || a.y - b.y || a.x - b.x || a.z - b.z;
    });
    let bridge: TreePlanBlock[] | null = null;
    for (const anchor of anchors.slice(0, 16)) {
      for (const order of AXIS_ORDERS) {
        const cursor = { x: anchor.x, y: anchor.y, z: anchor.z };
        const candidate: TreePlanBlock[] = [];
        let valid = true;
        for (const axis of order) while (cursor[axis] !== target[axis]) {
          cursor[axis] += Math.sign(target[axis] - cursor[axis]);
          if (forbidden.has(columnKey(cursor))) { valid = false; break; }
          candidate.push({ ...cursor, block: input.logBlock });
        }
        if (valid) { bridge = candidate; break; }
      }
      if (bridge) break;
    }
    if (!bridge) {
      blocks.delete(positionKey(target));
    } else {
      for (const block of bridge) blocks.set(positionKey(block), block);
    }
    logConnected = connectedKeys(blocks, rootKey, (block) => block.block === input.logBlock);
  }

  // Logs form the structural skeleton. Connect leaf islands through the
  // shortest deterministic in-crown path; prune a component only when a
  // forbidden liquid/POI column makes every Manhattan route invalid.
  let attached = connectedKeys(blocks, rootKey, () => true);
  const orphanLeaves = () => [...blocks.values()].filter((block) => block.block !== input.logBlock && !attached.has(positionKey(block)));
  while (orphanLeaves().length) {
    const target = orphanLeaves().sort((a, b) => a.y - b.y || a.x - b.x || a.z - b.z)[0];
    const anchors = [...attached].map((key) => blocks.get(key)!).sort((a, b) => {
      const da = Math.abs(target.x - a.x) + Math.abs(target.y - a.y) + Math.abs(target.z - a.z);
      const db = Math.abs(target.x - b.x) + Math.abs(target.y - b.y) + Math.abs(target.z - b.z);
      return da - db || a.y - b.y || a.x - b.x || a.z - b.z;
    });
    let bridge: TreePlanBlock[] | null = null;
    for (const anchor of anchors.slice(0, 24)) {
      const distance = Math.abs(target.x - anchor.x) + Math.abs(target.y - anchor.y) + Math.abs(target.z - anchor.z);
      if (distance > 4) break;
      for (const order of AXIS_ORDERS) {
        const cursor = { x: anchor.x, y: anchor.y, z: anchor.z };
        const candidate: TreePlanBlock[] = [];
        let valid = true;
        for (const axis of order) while (cursor[axis] !== target[axis]) {
          cursor[axis] += Math.sign(target[axis] - cursor[axis]);
          if (forbidden.has(columnKey(cursor))) { valid = false; break; }
          candidate.push({ ...cursor, block: target.block });
        }
        if (valid) { bridge = candidate; break; }
      }
      if (bridge) break;
    }
    if (bridge) {
      for (const block of bridge) if (blocks.get(positionKey(block))?.block !== input.logBlock) blocks.set(positionKey(block), block);
    } else {
      // Remove this whole inaccessible leaf component in one bounded flood.
      const component = new Set<string>([positionKey(target)]);
      const queue = [target];
      while (queue.length) {
        const current = queue.shift()!;
        for (const [dx, dy, dz] of FACE_NEIGHBORS) {
          const key = `${current.x + dx},${current.y + dy},${current.z + dz}`;
          const next = blocks.get(key);
          if (!next || next.block === input.logBlock || attached.has(key) || component.has(key)) continue;
          component.add(key);
          queue.push(next);
        }
      }
      for (const key of component) blocks.delete(key);
    }
    attached = connectedKeys(blocks, rootKey, () => true);
  }
  return [...blocks.values()].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
}
