import {
  AQUATIC_FLORA,
  BLOCKS,
  CULTIVATED_FLOWERS,
  LEAF_BLOCKS,
  ORDINARY_FLOWERS,
  BlockId,
  Item,
  ITEMS,
  itemForBlock,
  type ItemCode,
} from "./data";

export type BlockPosition = Readonly<{ x: number; y: number; z: number }>;
export type ReadBlock = (x: number, y: number, z: number) => BlockId | undefined;

export type PlantKind =
  | "wild-wheat"
  | "moonrice"
  | "sunroot"
  | "moonberry"
  | "sunberry"
  | `cultivated-flower-${number}`;

export type PlantGrowthProfile = Readonly<{
  kind: PlantKind;
  stages: readonly BlockId[];
  minimumLight: number;
  baseStageSeconds: number;
  requiresFarmland: boolean;
}>;

const CULTIVATED_FLOWER_GROWTH: Readonly<Record<`cultivated-flower-${number}`, PlantGrowthProfile>> = Object.fromEntries(
  ORDINARY_FLOWERS.map((flower, index) => {
    const kind = `cultivated-flower-${flower}` as const;
    return [kind, Object.freeze({
      kind,
      stages: Object.freeze([flower, CULTIVATED_FLOWERS[index]]),
      minimumLight: 0.38,
      baseStageSeconds: 70,
      requiresFarmland: true,
    })];
  }),
) as Record<`cultivated-flower-${number}`, PlantGrowthProfile>;

export const PLANT_GROWTH: Readonly<Record<PlantKind, PlantGrowthProfile>> = Object.freeze({
  "wild-wheat": Object.freeze({
    kind: "wild-wheat",
    stages: Object.freeze([BlockId.WheatSprout, BlockId.WheatYoung, BlockId.WheatCrop]),
    minimumLight: 0.42,
    baseStageSeconds: 58,
    requiresFarmland: true,
  }),
  moonrice: Object.freeze({
    kind: "moonrice",
    stages: Object.freeze([BlockId.MoonriceSprout, BlockId.MoonriceYoung, BlockId.MoonriceCrop]),
    minimumLight: 0.3,
    baseStageSeconds: 64,
    requiresFarmland: true,
  }),
  sunroot: Object.freeze({
    kind: "sunroot",
    stages: Object.freeze([BlockId.SunrootSprout, BlockId.SunrootYoung, BlockId.SunrootCrop]),
    minimumLight: 0.54,
    baseStageSeconds: 72,
    requiresFarmland: true,
  }),
  moonberry: Object.freeze({
    kind: "moonberry",
    stages: Object.freeze([BlockId.MoonberryShoot, BlockId.MoonberryBush, BlockId.MoonberryBushRipe]),
    minimumLight: 0.24,
    baseStageSeconds: 50,
    requiresFarmland: false,
  }),
  sunberry: Object.freeze({
    kind: "sunberry",
    stages: Object.freeze([BlockId.SunberryShoot, BlockId.SunberryBush, BlockId.SunberryBushRipe]),
    minimumLight: 0.55,
    baseStageSeconds: 44,
    requiresFarmland: false,
  }),
  ...CULTIVATED_FLOWER_GROWTH,
});

/** Orchard fruit returns in roughly one in-game minute instead of several. */
export const ORCHARD_REGROWTH_BASE_MS = 45_000;
export const ORCHARD_REGROWTH_JITTER_MS = 30_000;

const FARM_SOILS = new Set<BlockId>([BlockId.Farmland, BlockId.HydratedFarmland]);
const LIVING_SOILS = new Set<BlockId>([
  BlockId.Grass,
  BlockId.Dirt,
  BlockId.MeadowGrass,
  BlockId.SnowyGrass,
  BlockId.SavannaGrass,
  BlockId.SwampGrass,
  BlockId.JungleGrass,
  BlockId.SakuraGrass,
  BlockId.Farmland,
  BlockId.HydratedFarmland,
]);
const TILLABLE_SOILS = new Set<BlockId>([
  BlockId.Grass,
  BlockId.Dirt,
  BlockId.MeadowGrass,
  BlockId.SavannaGrass,
  BlockId.SwampGrass,
  BlockId.JungleGrass,
  BlockId.SakuraGrass,
]);
const AQUATIC_SOILS = new Set<BlockId>([BlockId.Sand, BlockId.Gravel, BlockId.Clay, BlockId.Mud, BlockId.Stone, BlockId.Deepstone, BlockId.MoonSlate, BlockId.Limestone]);
const AQUATIC_FLORA_SET = new Set<BlockId>(AQUATIC_FLORA);
export const AQUATIC_PROPAGULES: Readonly<Partial<Record<ItemCode, BlockId>>> = Object.freeze({
  [Item.LumenKelpFrond]: BlockId.LumenKelp,
  [Item.StarCoralShard]: BlockId.StarCoral,
  [Item.AbyssBloomNectar]: BlockId.AbyssBloom,
  [Item.TidevineFiber]: BlockId.Tidevine,
});
const TREE_LEAF_BLOCKS = new Set<BlockId>(LEAF_BLOCKS);
const TREE_NEIGHBORS = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
] as const;

export type DiscoveredTreeBlock = Readonly<BlockPosition & { type: BlockId }>;
export type DiscoveredRootedTree = Readonly<{
  root: DiscoveredTreeBlock;
  logs: readonly DiscoveredTreeBlock[];
  leaves: readonly DiscoveredTreeBlock[];
}>;

/** Catalog-driven so future generated log variants join felling without another hardcoded map. */
export function isTreeLogBlock(block: BlockId | undefined) {
  const definition = block === undefined ? undefined : BLOCKS[block];
  return Boolean(definition?.solid && definition.preferredTool === "axe" && /(?:^|\s)(?:log|trunk|stem)(?:$|\s)/iu.test(definition.name));
}

export function isTreeLeafBlock(block: BlockId | undefined) {
  if (block === undefined) return false;
  const definition = BLOCKS[block];
  return TREE_LEAF_BLOCKS.has(block)
    || Boolean(definition?.layer === "cutout" && /leaves|needles|foliage/iu.test(definition.name));
}

export function isRootableTreeSoil(block: BlockId | undefined) {
  if (block === undefined) return false;
  if (LIVING_SOILS.has(block) || block === BlockId.Mud) return true;
  return /grass|dirt|farmland|soil|moss|mud/iu.test(BLOCKS[block]?.name ?? "");
}

/**
 * Finds the complete face-connected trunk first, proves it reaches living
 * soil, then claims only nearby canopy cells that are not closer to another
 * trunk. This handles branches and mixed future log variants without felling
 * a neighboring tree merely because their leaves touch.
 */
export function discoverRootedTree(
  start: BlockPosition,
  readBlock: ReadBlock,
  maximumLogs = 192,
  maximumLeaves = 384,
): DiscoveredRootedTree | null {
  const startType = readBlock(start.x, start.y, start.z);
  if (!isTreeLogBlock(startType)) return null;
  const logLimit = Math.max(3, Math.min(512, Math.floor(maximumLogs)));
  const leafLimit = Math.max(0, Math.min(768, Math.floor(maximumLeaves)));
  const keyOf = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const logs = new Map<string, DiscoveredTreeBlock>();
  const logQueue: BlockPosition[] = [start];
  while (logQueue.length && logs.size < logLimit) {
    const position = logQueue.shift()!;
    const key = keyOf(position.x, position.y, position.z);
    if (logs.has(key)) continue;
    const type = readBlock(position.x, position.y, position.z);
    if (!isTreeLogBlock(type)) continue;
    logs.set(key, { ...position, type: type! });
    for (const [dx, dy, dz] of TREE_NEIGHBORS) logQueue.push({ x: position.x + dx, y: position.y + dy, z: position.z + dz });
    // v0.6 windswept crowns could contain a one-cell diagonal rise between
    // authored branch logs. Admit diagonal rises/falls only when the candidate
    // is already surrounded by canopy; ground-level building beams remain excluded.
    for (const stepY of [-1, 1]) for (let dx = -1; dx <= 1; dx += 1) for (let dz = -1; dz <= 1; dz += 1) {
      if (!dx && !dz) continue;
      const candidate = { x: position.x + dx, y: position.y + stepY, z: position.z + dz };
      const candidateType = readBlock(candidate.x, candidate.y, candidate.z);
      if (!isTreeLogBlock(candidateType)) continue;
      let canopyEvidence = false;
      for (let ox = -1; ox <= 1 && !canopyEvidence; ox += 1) for (let oy = -1; oy <= 2 && !canopyEvidence; oy += 1) for (let oz = -1; oz <= 1; oz += 1) {
        if (isTreeLeafBlock(readBlock(candidate.x + ox, candidate.y + oy, candidate.z + oz))) { canopyEvidence = true; break; }
      }
      if (canopyEvidence) logQueue.push(candidate);
    }
  }
  if (logs.size < 3) return null;
  const roots = [...logs.values()]
    .filter((log) => isRootableTreeSoil(readBlock(log.x, log.y - 1, log.z)))
    .sort((left, right) => left.y - right.y || left.x - right.x || left.z - right.z);
  if (!roots.length) return null;

  const ownedLogs = [...logs.values()];
  const leaves = new Map<string, DiscoveredTreeBlock>();
  const leafQueue: Array<{ position: BlockPosition; depth: number }> = [];
  for (const log of ownedLogs) {
    for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
      if (!dx && !dy && !dz) continue;
      leafQueue.push({ position: { x: log.x + dx, y: log.y + dy, z: log.z + dz }, depth: 0 });
    }
  }
  while (leafQueue.length && leaves.size < leafLimit) {
    const { position, depth } = leafQueue.shift()!;
    const key = keyOf(position.x, position.y, position.z);
    if (leaves.has(key)) continue;
    const type = readBlock(position.x, position.y, position.z);
    if (!isTreeLeafBlock(type)) continue;
    const ownDistance = ownedLogs.reduce((best, log) => Math.min(best,
      (position.x - log.x) ** 2 + (position.y - log.y) ** 2 + (position.z - log.z) ** 2), Number.POSITIVE_INFINITY);
    let foreignDistance = Number.POSITIVE_INFINITY;
    const radius = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(ownDistance))));
    for (let dx = -radius; dx <= radius; dx += 1) for (let dy = -radius; dy <= radius; dy += 1) for (let dz = -radius; dz <= radius; dz += 1) {
      const candidateKey = keyOf(position.x + dx, position.y + dy, position.z + dz);
      const candidate = readBlock(position.x + dx, position.y + dy, position.z + dz);
      if (!isTreeLogBlock(candidate) || logs.has(candidateKey)) continue;
      foreignDistance = Math.min(foreignDistance, dx * dx + dy * dy + dz * dz);
    }
    if (foreignDistance < ownDistance) continue;
    leaves.set(key, { ...position, type: type! });
    if (depth >= 4) continue;
    for (const [dx, dy, dz] of TREE_NEIGHBORS) leafQueue.push({
      position: { x: position.x + dx, y: position.y + dy, z: position.z + dz },
      depth: depth + 1,
    });
  }
  const selectedRoot = roots[0];
  const rootKey = keyOf(selectedRoot.x, selectedRoot.y, selectedRoot.z);
  const parents = new Map<string, string | null>([[rootKey, null]]);
  const connectedQueue = [selectedRoot];
  while (connectedQueue.length) {
    const current = connectedQueue.shift()!;
    const currentKey = keyOf(current.x, current.y, current.z);
    for (const [dx, dy, dz] of TREE_NEIGHBORS) {
      const nextKey = keyOf(current.x + dx, current.y + dy, current.z + dz);
      const next = logs.get(nextKey);
      if (!next || parents.has(nextKey)) continue;
      parents.set(nextKey, currentKey);
      connectedQueue.push(next);
    }
  }
  const retained = new Set<string>([rootKey]);
  for (const log of ownedLogs) {
    let touchesCanopy = false;
    for (let dx = -1; dx <= 1 && !touchesCanopy; dx += 1) for (let dy = -1; dy <= 1 && !touchesCanopy; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
      if (leaves.has(keyOf(log.x + dx, log.y + dy, log.z + dz))) { touchesCanopy = true; break; }
    }
    if (!touchesCanopy) continue;
    let key: string | null | undefined = keyOf(log.x, log.y, log.z);
    while (key && !retained.has(key)) {
      retained.add(key);
      key = parents.get(key);
    }
  }
  const treeLogs = ownedLogs.filter((log) => retained.has(keyOf(log.x, log.y, log.z)));
  if (treeLogs.length < 3) return null;
  const stableSort = (left: DiscoveredTreeBlock, right: DiscoveredTreeBlock) => left.y - right.y || left.x - right.x || left.z - right.z;
  return { root: selectedRoot, logs: treeLogs.sort(stableSort), leaves: [...leaves.values()].sort(stableSort) };
}

export function plantProfileForBlock(block: BlockId): { profile: PlantGrowthProfile; stage: number } | null {
  for (const profile of Object.values(PLANT_GROWTH)) {
    const stage = profile.stages.indexOf(block);
    if (stage >= 0) return { profile, stage };
  }
  return null;
}

export function isRipePlant(block: BlockId) {
  const found = plantProfileForBlock(block);
  return Boolean(found && found.stage === found.profile.stages.length - 1);
}

export function nextPlantStage(block: BlockId): BlockId | null {
  const found = plantProfileForBlock(block);
  if (!found || found.stage >= found.profile.stages.length - 1) return null;
  return found.profile.stages[found.stage + 1];
}

/** A stable 0..1 value suitable for growth jitter without touching Math.random. */
export function farmHash01(seed: string | number, x: number, y: number, z: number, cycle = 0) {
  let state = typeof seed === "number" ? seed | 0 : 2166136261;
  if (typeof seed === "string") for (let index = 0; index < seed.length; index += 1) state = Math.imul(state ^ seed.charCodeAt(index), 16777619);
  state ^= Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1103515245) ^ Math.imul(cycle | 0, 2246822519);
  state = Math.imul(state ^ (state >>> 13), 1274126177);
  state ^= state >>> 16;
  return (state >>> 0) / 4294967295;
}

export function growthDelaySeconds(block: BlockId, hydrated: boolean, seed: string | number, position: BlockPosition, cycle = 0) {
  const found = plantProfileForBlock(block);
  if (!found) return null;
  const hydrationFactor = found.profile.requiresFarmland ? (hydrated ? 0.72 : 1.8) : (hydrated ? 0.9 : 1);
  const jitter = 0.82 + farmHash01(seed, position.x, position.y, position.z, cycle) * 0.36;
  return found.profile.baseStageSeconds * hydrationFactor * jitter;
}

export function canGrowPlant(block: BlockId, soil: BlockId | undefined, light: number) {
  const found = plantProfileForBlock(block);
  if (!found || light < found.profile.minimumLight) return false;
  return found.profile.requiresFarmland ? FARM_SOILS.has(soil ?? BlockId.Air) : LIVING_SOILS.has(soil ?? BlockId.Air);
}

export function hasNearbyWater(readBlock: ReadBlock, position: BlockPosition, radius = 4) {
  const boundedRadius = Math.max(1, Math.min(6, Math.floor(radius)));
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -boundedRadius; dx <= boundedRadius; dx += 1) {
      for (let dz = -boundedRadius; dz <= boundedRadius; dz += 1) {
        if (Math.abs(dx) + Math.abs(dz) > boundedRadius * 1.5) continue;
        if (readBlock(position.x + dx, position.y + dy, position.z + dz) === BlockId.Water) return true;
      }
    }
  }
  return false;
}

export function farmlandState(readBlock: ReadBlock, position: BlockPosition) {
  return hasNearbyWater(readBlock, position) ? BlockId.HydratedFarmland : BlockId.Farmland;
}

export function canTill(soil: BlockId | undefined, above: BlockId | undefined) {
  return TILLABLE_SOILS.has(soil ?? BlockId.Air)
    && (above === BlockId.Air || Boolean(BLOCKS[above ?? BlockId.Air]?.replaceable));
}

export type PlantingResult = Readonly<{ block: BlockId; consumes: ItemCode; description: string }>;

export function plantingResult(item: ItemCode, soil: BlockId | undefined, above: BlockId | undefined): PlantingResult | null {
  if (above !== BlockId.Air && !BLOCKS[above ?? BlockId.Air]?.replaceable) return null;
  if (item === Item.WheatSeeds && FARM_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.WheatSprout, consumes: item, description: "Wild wheat seeds" };
  if (item === Item.MoonriceSeeds && FARM_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.MoonriceSprout, consumes: item, description: "Moonrice seeds" };
  if (item === Item.SunrootStarts && FARM_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.SunrootSprout, consumes: item, description: "Sunroot starts" };
  if (item === Item.Berry && LIVING_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.MoonberryShoot, consumes: item, description: "Moonberry cutting" };
  if (item === Item.Sunberry && LIVING_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.SunberryShoot, consumes: item, description: "Sunberry cutting" };
  if (item === Item.Apple && LIVING_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.AppleSapling, consumes: item, description: "Wild apple pip" };
  if (item === Item.SaltbrushSprig && LIVING_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.Saltbrush, consumes: item, description: "Saltbrush cutting" };
  if (item === Item.CoastAsterPetal && LIVING_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.CoastAster, consumes: item, description: "Coast aster seedhead" };
  const requestedPlant = ITEMS[item]?.plantBlock;
  if (requestedPlant !== undefined && ORDINARY_FLOWERS.includes(requestedPlant) && FARM_SOILS.has(soil ?? BlockId.Air)) {
    return { block: requestedPlant, consumes: item, description: `Cultivated ${BLOCKS[requestedPlant]?.name ?? "flower"}` };
  }
  if (requestedPlant !== undefined && ORDINARY_FLOWERS.includes(requestedPlant) && LIVING_SOILS.has(soil ?? BlockId.Air)) {
    return { block: requestedPlant, consumes: item, description: BLOCKS[requestedPlant]?.name ?? "Flower" };
  }
  if (requestedPlant !== undefined && AQUATIC_FLORA_SET.has(requestedPlant) && AQUATIC_SOILS.has(soil ?? BlockId.Air) && above === BlockId.Water) {
    return { block: requestedPlant, consumes: item, description: BLOCKS[requestedPlant]?.name ?? "Aquatic flora" };
  }
  const aquaticPropagule = AQUATIC_PROPAGULES[item];
  if (aquaticPropagule !== undefined && AQUATIC_SOILS.has(soil ?? BlockId.Air) && above === BlockId.Water) {
    return { block: aquaticPropagule, consumes: item, description: BLOCKS[aquaticPropagule].name };
  }
  return null;
}

export type AquaticGrowthPlan = Readonly<{ x: number; y: number; z: number; type: BlockId; maximumHeight: number }>;
export type AquaticColumnRemovalPlan = Readonly<BlockPosition & { type: BlockId.Water }>;

export const AQUATIC_GROWTH_LIMITS: Readonly<Partial<Record<BlockId, number>>> = Object.freeze({
  [BlockId.RiverRibbon]: 3,
  [BlockId.GlowKelp]: 5,
  [BlockId.ReedBloom]: 2,
  [BlockId.LumenKelp]: 7,
  [BlockId.StarCoral]: 3,
  [BlockId.AbyssBloom]: 2,
  [BlockId.Tidevine]: 5,
});

/** One bounded upward growth step; every occupied cell remains waterlogged. */
export function planAquaticGrowth(block: BlockId, position: BlockPosition, readBlock: ReadBlock): AquaticGrowthPlan | null {
  const maximumHeight = AQUATIC_GROWTH_LIMITS[block] ?? 0;
  if (maximumHeight <= 1 || !AQUATIC_FLORA_SET.has(block)) return null;
  let baseY = position.y;
  for (let step = 1; step < maximumHeight && readBlock(position.x, baseY - 1, position.z) === block; step += 1) baseY -= 1;
  let topY = position.y;
  for (let step = 1; step < maximumHeight && readBlock(position.x, topY + 1, position.z) === block; step += 1) topY += 1;
  const currentHeight = topY - baseY + 1;
  if (currentHeight >= maximumHeight || readBlock(position.x, topY + 1, position.z) !== BlockId.Water) return null;
  return { x: position.x, y: topY + 1, z: position.z, type: block, maximumHeight };
}

/**
 * Removing any segment clears the contiguous column above it back to water.
 * This mirrors rooted plants: a missing lower segment cannot leave an upper
 * half floating, while a surviving segment immediately below can regrow.
 */
export function planAquaticColumnRemoval(block: BlockId, position: BlockPosition, readBlock: ReadBlock) {
  if (!AQUATIC_FLORA_SET.has(block) || readBlock(position.x, position.y, position.z) !== block) return [] as AquaticColumnRemovalPlan[];
  const edits: AquaticColumnRemovalPlan[] = [];
  for (let offset = 0; offset < 32; offset += 1) {
    const y = position.y + offset;
    if (readBlock(position.x, y, position.z) !== block) break;
    edits.push({ x: position.x, y, z: position.z, type: BlockId.Water });
  }
  return edits;
}

export type HarvestDrop = Readonly<{ item: ItemCode; count: number }>;
export type HarvestResult = Readonly<{
  replacement: BlockId;
  drops: readonly HarvestDrop[];
  replanted: boolean;
}>;

export function harvestPlant(block: BlockId, useScythe = false, yieldRoll = 0.5): HarvestResult | null {
  const roll = Math.max(0, Math.min(0.9999, yieldRoll));
  if (block === BlockId.WheatCrop) {
    const wheat = 2 + Math.floor(roll * 2) + (useScythe ? 1 : 0);
    const seeds = 1 + (roll > 0.56 ? 1 : 0) + (useScythe && roll > 0.82 ? 1 : 0);
    return {
      replacement: useScythe ? BlockId.WheatSprout : BlockId.Air,
      drops: [{ item: Item.Wheat, count: wheat }, { item: Item.WheatSeeds, count: seeds }],
      replanted: useScythe,
    };
  }
  if (block === BlockId.MoonriceCrop) {
    return {
      replacement: useScythe ? BlockId.MoonriceSprout : BlockId.Air,
      drops: [{ item: Item.Moonrice, count: 2 + Math.floor(roll * 3) + (useScythe ? 1 : 0) }, { item: Item.MoonriceSeeds, count: 1 + (roll > 0.5 ? 1 : 0) }],
      replanted: useScythe,
    };
  }
  if (block === BlockId.SunrootCrop) {
    return {
      replacement: useScythe ? BlockId.SunrootSprout : BlockId.Air,
      drops: [{ item: Item.Sunroot, count: 2 + Math.floor(roll * 3) + (useScythe ? 1 : 0) }, { item: Item.SunrootStarts, count: 1 + (roll > 0.62 ? 1 : 0) }],
      replanted: useScythe,
    };
  }
  if (block === BlockId.MoonberryBushRipe) {
    return {
      replacement: BlockId.MoonberryBush,
      drops: [{ item: Item.Berry, count: 2 + Math.floor(roll * 3) + (useScythe ? 1 : 0) }],
      replanted: true,
    };
  }
  if (block === BlockId.SunberryBushRipe) {
    return {
      replacement: BlockId.SunberryBush,
      drops: [{ item: Item.Sunberry, count: 2 + Math.floor(roll * 2) + (useScythe ? 1 : 0) }],
      replanted: true,
    };
  }
  if (block === BlockId.AppleFruit) return { replacement: BlockId.Air, drops: [{ item: Item.Apple, count: 1 }], replanted: false };
  const cultivatedIndex = CULTIVATED_FLOWERS.indexOf(block);
  if (cultivatedIndex >= 0) {
    const flower = ORDINARY_FLOWERS[cultivatedIndex];
    return { replacement: flower, drops: [{ item: itemForBlock(flower), count: 4 + Math.floor(roll * 4) + (useScythe ? 2 : 0) }], replanted: true };
  }
  if (block === BlockId.Saltbrush) return { replacement: BlockId.Air, drops: [{ item: Item.SaltbrushSprig, count: 1 + Math.floor(roll * 2) }], replanted: false };
  if (block === BlockId.CoastAster) return { replacement: BlockId.Air, drops: [{ item: Item.CoastAsterPetal, count: 2 + Math.floor(roll * 2) }], replanted: false };
  if (block === BlockId.SakuraBloom) return { replacement: BlockId.Air, drops: [{ item: Item.SakuraBloomItem, count: 1 + Math.floor(roll * 2) }], replanted: false };
  if (block === BlockId.Dreamblossom) return { replacement: BlockId.Air, drops: [{ item: Item.DreamblossomItem, count: 1 + Math.floor(roll * 2) }], replanted: false };
  if (block === BlockId.LanternLotus) return { replacement: BlockId.Air, drops: [{ item: Item.LanternLotusItem, count: 1 + Math.floor(roll * 2) }], replanted: false };
  if (block === BlockId.RainveilFern) return { replacement: BlockId.Air, drops: [{ item: Item.RainveilFernItem, count: 1 }], replanted: false };
  if (block === BlockId.LumenKelp) return { replacement: BlockId.Water, drops: [{ item: Item.LumenKelpFrond, count: 1 + Math.floor(roll * 2) }], replanted: false };
  if (block === BlockId.StarCoral) return { replacement: BlockId.Water, drops: [{ item: Item.StarCoralShard, count: 1 + Math.floor(roll * 2) }], replanted: false };
  if (block === BlockId.AbyssBloom) return { replacement: BlockId.Water, drops: [{ item: Item.AbyssBloomNectar, count: 1 }], replanted: false };
  if (block === BlockId.Tidevine) return { replacement: BlockId.Water, drops: [{ item: Item.TidevineFiber, count: 1 + Math.floor(roll * 3) }], replanted: false };
  return null;
}

export type PlannedFarmBlock = Readonly<{ x: number; y: number; z: number; type: BlockId }>;

/**
 * Plans a compact, asymmetric orchard tree. Fruit occupies its own hanging
 * block below lower canopy leaves, so players can harvest it without damaging
 * the tree. The same seed/origin always produces the same plan.
 */
export function planAppleTree(origin: BlockPosition, seed: string | number): readonly PlannedFarmBlock[] {
  const height = 5 + Math.floor(farmHash01(seed, origin.x, origin.y, origin.z) * 2);
  const blocks = new Map<string, PlannedFarmBlock>();
  const put = (x: number, y: number, z: number, type: BlockId) => blocks.set(`${x},${y},${z}`, { x, y, z, type });
  for (let dy = 0; dy < height; dy += 1) put(origin.x, origin.y + dy, origin.z, BlockId.WildwoodLog);

  const canopyY = origin.y + height - 1;
  for (let dy = -1; dy <= 2; dy += 1) {
    const radius = dy >= 2 ? 1 : 2;
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dz = -radius; dz <= radius; dz += 1) {
        const edge = Math.abs(dx) + Math.abs(dz) + Math.max(0, dy);
        if (edge > 4 || (dx === 0 && dz === 0 && dy <= 0)) continue;
        if (edge === 4 && farmHash01(seed, origin.x + dx, canopyY + dy, origin.z + dz, 3) < 0.34) continue;
        put(origin.x + dx, canopyY + dy, origin.z + dz, BlockId.AppleLeaves);
      }
    }
  }

  const fruitCandidates: BlockPosition[] = [];
  for (let dx = -2; dx <= 2; dx += 1) for (let dz = -2; dz <= 2; dz += 1) {
    if (Math.abs(dx) + Math.abs(dz) < 2 || Math.abs(dx) + Math.abs(dz) > 3) continue;
    const x = origin.x + dx;
    const y = canopyY - 2;
    const z = origin.z + dz;
    if (blocks.get(`${x},${y + 1},${z}`)?.type === BlockId.AppleLeaves && !blocks.has(`${x},${y},${z}`)) fruitCandidates.push({ x, y, z });
  }
  fruitCandidates
    .sort((a, b) => farmHash01(seed, a.x, a.y, a.z, 9) - farmHash01(seed, b.x, b.y, b.z, 9))
    .slice(0, 2 + Math.floor(farmHash01(seed, origin.x, origin.y, origin.z, 10) * 3))
    .forEach(({ x, y, z }) => put(x, y, z, BlockId.AppleFruit));
  return [...blocks.values()];
}

/** Selects a bounded set of empty hanging-fruit positions for periodic regrowth. */
export function planAppleFruitRegrowth(
  origin: BlockPosition,
  seed: string | number,
  cycle: number,
  readBlock: ReadBlock,
  maximum = 3,
) {
  const tree = planAppleTree(origin, seed);
  const candidates = tree
    .filter((block) => block.type === BlockId.AppleFruit)
    .filter((block) => readBlock(block.x, block.y, block.z) === BlockId.Air && readBlock(block.x, block.y + 1, block.z) === BlockId.AppleLeaves)
    .sort((a, b) => farmHash01(seed, a.x, a.y, a.z, cycle) - farmHash01(seed, b.x, b.y, b.z, cycle));
  return candidates.slice(0, Math.max(0, Math.min(maximum, 4)));
}

export type BucketAction = Readonly<{
  kind: "fill" | "pour";
  removeTarget: boolean;
  place?: BlockId;
  resultItem: ItemCode;
}>;

export function resolveBucketAction(item: ItemCode, target: BlockId | undefined, placement: BlockId | undefined): BucketAction | null {
  if (item === Item.Bucket && target === BlockId.Water) return { kind: "fill", removeTarget: true, resultItem: Item.WaterBucket };
  if (item === Item.Bucket && target === BlockId.Lava) return { kind: "fill", removeTarget: true, resultItem: Item.LavaBucket };
  const canReplace = placement === BlockId.Air || Boolean(BLOCKS[placement ?? BlockId.Air]?.replaceable);
  if (!canReplace) return null;
  if (item === Item.WaterBucket) return { kind: "pour", removeTarget: false, place: BlockId.Water, resultItem: Item.Bucket };
  if (item === Item.LavaBucket) return { kind: "pour", removeTarget: false, place: BlockId.Lava, resultItem: Item.Bucket };
  return null;
}

export const FENCE_BLOCKS = new Set<BlockId>([
  BlockId.WildwoodFence,
  BlockId.FenceGateNorthSouthClosed,
  BlockId.FenceGateEastWestClosed,
  BlockId.FenceGateNorthSouthOpen,
  BlockId.FenceGateEastWestOpen,
]);

export type FenceConnections = Readonly<{ north: boolean; east: boolean; south: boolean; west: boolean; mask: number }>;

export function fenceConnections(readBlock: ReadBlock, position: BlockPosition): FenceConnections {
  const connects = (x: number, z: number) => {
    const type = readBlock(x, position.y, z);
    const definition = BLOCKS[type ?? BlockId.Air];
    return FENCE_BLOCKS.has(type ?? BlockId.Air) || Boolean(definition?.solid && (!definition.shape || definition.shape === "cube"));
  };
  const north = connects(position.x, position.z - 1);
  const east = connects(position.x + 1, position.z);
  const south = connects(position.x, position.z + 1);
  const west = connects(position.x - 1, position.z);
  return { north, east, south, west, mask: (north ? 1 : 0) | (east ? 2 : 0) | (south ? 4 : 0) | (west ? 8 : 0) };
}

export function fenceGateForYaw(yaw: number) {
  return Math.abs(Math.sin(yaw)) > Math.abs(Math.cos(yaw)) ? BlockId.FenceGateEastWestClosed : BlockId.FenceGateNorthSouthClosed;
}

export function toggleFenceGate(block: BlockId): BlockId | null {
  if (block === BlockId.FenceGateNorthSouthClosed) return BlockId.FenceGateNorthSouthOpen;
  if (block === BlockId.FenceGateEastWestClosed) return BlockId.FenceGateEastWestOpen;
  if (block === BlockId.FenceGateNorthSouthOpen) return BlockId.FenceGateNorthSouthClosed;
  if (block === BlockId.FenceGateEastWestOpen) return BlockId.FenceGateEastWestClosed;
  return null;
}

export function fenceCollisionHeight(block: BlockId) {
  return BLOCKS[block]?.collisionHeight ?? (BLOCKS[block]?.solid ? 1 : 0);
}

export type LeadAnchor = Readonly<{
  mobId: string;
  fence?: BlockPosition;
  maximumLength: number;
}>;

export type SavedLeadAnchor = Readonly<{
  mobId: number;
  fence?: BlockPosition;
  maximumLength: number;
}>;

const MAX_SAVED_LEADS = 128;
const MAX_LEAD_COORDINATE = 30_000_000;

function safeLeadCoordinate(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= MAX_LEAD_COORDINATE
    ? Math.round(value)
    : null;
}

/** Produces a small, data-only save payload and ignores stale creature ids. */
export function serializeLeadAnchors(leads: ReadonlyMap<number, LeadAnchor>, liveMobIds: ReadonlySet<number>) {
  const saved: SavedLeadAnchor[] = [];
  for (const [mobId, lead] of leads) {
    if (saved.length >= MAX_SAVED_LEADS) break;
    if (!Number.isSafeInteger(mobId) || mobId < 0 || !liveMobIds.has(mobId)) continue;
    const maximumLength = Math.max(2, Math.min(16, Number.isFinite(lead.maximumLength) ? lead.maximumLength : 9));
    const fenceX = safeLeadCoordinate(lead.fence?.x);
    const fenceY = safeLeadCoordinate(lead.fence?.y);
    const fenceZ = safeLeadCoordinate(lead.fence?.z);
    saved.push({
      mobId,
      maximumLength,
      ...(fenceX !== null && fenceY !== null && fenceZ !== null ? { fence: { x: fenceX, y: fenceY, z: fenceZ } } : {}),
    });
  }
  return saved;
}

/** Backward-compatible and hostile-input-safe lead restoration. */
export function restoreLeadAnchors(value: unknown, liveMobIds: ReadonlySet<number>) {
  const restored = new Map<number, LeadAnchor>();
  if (!Array.isArray(value)) return restored;
  for (const candidate of value.slice(0, MAX_SAVED_LEADS)) {
    if (!candidate || typeof candidate !== "object") continue;
    const entry = candidate as Partial<SavedLeadAnchor>;
    const mobId = entry.mobId;
    if (!Number.isSafeInteger(mobId) || (mobId ?? -1) < 0 || !liveMobIds.has(mobId!)) continue;
    const maximumLength = Math.max(2, Math.min(16, typeof entry.maximumLength === "number" && Number.isFinite(entry.maximumLength) ? entry.maximumLength : 9));
    const fenceX = safeLeadCoordinate(entry.fence?.x);
    const fenceY = safeLeadCoordinate(entry.fence?.y);
    const fenceZ = safeLeadCoordinate(entry.fence?.z);
    restored.set(mobId!, {
      mobId: String(mobId),
      maximumLength,
      ...(fenceX !== null && fenceY !== null && fenceZ !== null ? { fence: { x: fenceX, y: fenceY, z: fenceZ } } : {}),
    });
  }
  return restored;
}

/**
 * Hitching completes an already-consumed lead, so it must not depend on the
 * player still holding a second lead item after attaching the first one.
 */
export function canHitchLead(crouching: boolean, target: BlockId, leads: Iterable<LeadAnchor>) {
  if (!crouching || !FENCE_BLOCKS.has(target)) return false;
  for (const lead of leads) if (!lead.fence) return true;
  return false;
}

export type LeadConstraint = Readonly<{ x: number; y: number; z: number; distance: number; taut: boolean; breaks: boolean }>;

export function constrainLead(mob: BlockPosition, anchor: BlockPosition, maximumLength = 9): LeadConstraint {
  const dx = anchor.x - mob.x;
  const dy = anchor.y - mob.y;
  const dz = anchor.z - mob.z;
  const distance = Math.hypot(dx, dy, dz);
  const limit = Math.max(2, maximumLength);
  if (distance <= limit || distance === 0) return { x: 0, y: 0, z: 0, distance, taut: false, breaks: false };
  const correction = Math.min(0.45, (distance - limit) * 0.28);
  return {
    x: dx / distance * correction,
    y: dy / distance * correction * 0.35,
    z: dz / distance * correction,
    distance,
    taut: true,
    breaks: distance > limit * 1.85,
  };
}
