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
  | "peppermint"
  | "cocoa"
  | "field-cotton"
  | "sun-carrot"
  | "bluepod-bean"
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

/** Farming, orchard, sapling, and aquatic-flora growth share this world pace. */
export const PLANT_GROWTH_TIME_MULTIPLIER = 5;

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
  peppermint: Object.freeze({
    kind: "peppermint",
    stages: Object.freeze([BlockId.PeppermintSprout, BlockId.PeppermintYoung, BlockId.PeppermintCrop]),
    minimumLight: 0.4,
    baseStageSeconds: 56,
    requiresFarmland: true,
  }),
  cocoa: Object.freeze({
    kind: "cocoa",
    stages: Object.freeze([BlockId.CocoaSprout, BlockId.CocoaYoung, BlockId.CocoaCrop]),
    minimumLight: 0.48,
    baseStageSeconds: 68,
    requiresFarmland: true,
  }),
  "field-cotton": Object.freeze({
    kind: "field-cotton",
    stages: Object.freeze([BlockId.CottonSprout, BlockId.CottonYoung, BlockId.CottonCrop]),
    minimumLight: 0.46,
    baseStageSeconds: 66,
    requiresFarmland: true,
  }),
  "sun-carrot": Object.freeze({
    kind: "sun-carrot",
    stages: Object.freeze([BlockId.SunCarrotSprout, BlockId.SunCarrotYoung, BlockId.SunCarrotCrop]),
    minimumLight: 0.5,
    baseStageSeconds: 52,
    requiresFarmland: true,
  }),
  "bluepod-bean": Object.freeze({
    kind: "bluepod-bean",
    stages: Object.freeze([BlockId.BluepodSprout, BlockId.BluepodYoung, BlockId.BluepodCrop]),
    minimumLight: 0.34,
    baseStageSeconds: 60,
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

/** Orchard fruit now returns over several minutes rather than every minute. */
export const ORCHARD_REGROWTH_BASE_MS = 45_000 * PLANT_GROWTH_TIME_MULTIPLIER;
export const ORCHARD_REGROWTH_JITTER_MS = 30_000 * PLANT_GROWTH_TIME_MULTIPLIER;

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
  BlockId.SugarplumGrass,
  BlockId.SugarSoil,
  BlockId.Farmland,
  BlockId.HydratedFarmland,
]);
const SAPLING_SOILS = new Set<BlockId>([
  ...LIVING_SOILS,
  BlockId.GlimmerGrass,
  BlockId.CloudreedGrass,
]);

export function canPlantSaplingOn(soil: BlockId | undefined) {
  return soil !== undefined && SAPLING_SOILS.has(soil);
}
const TILLABLE_SOILS = new Set<BlockId>([
  BlockId.Grass,
  BlockId.Dirt,
  BlockId.MeadowGrass,
  BlockId.SavannaGrass,
  BlockId.SwampGrass,
  BlockId.JungleGrass,
  BlockId.SakuraGrass,
  BlockId.SugarplumGrass,
  BlockId.SugarSoil,
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
  /** Hanging fruit and future crown ornaments removed with their support. */
  attachments: readonly DiscoveredTreeBlock[];
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
  maximumLogs = 512,
  maximumLeaves = 1_024,
): DiscoveredRootedTree | null {
  const startType = readBlock(start.x, start.y, start.z);
  if (!isTreeLogBlock(startType)) return null;
  const logLimit = Math.max(3, Math.min(768, Math.floor(maximumLogs)));
  const leafLimit = Math.max(0, Math.min(2_048, Math.floor(maximumLeaves)));
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

  const logNeighbors = (position: DiscoveredTreeBlock) => {
    const neighbors: DiscoveredTreeBlock[] = [];
    for (const [dx, dy, dz] of TREE_NEIGHBORS) {
      const next = logs.get(keyOf(position.x + dx, position.y + dy, position.z + dz));
      if (next) neighbors.push(next);
    }
    // Old saves can still contain the pre-v0.9 diagonal branch step. It is
    // admitted only beside foliage, while all newly generated wood is strictly
    // face-connected.
    for (const stepY of [-1, 1]) for (let dx = -1; dx <= 1; dx += 1) for (let dz = -1; dz <= 1; dz += 1) {
      if (!dx && !dz) continue;
      const next = logs.get(keyOf(position.x + dx, position.y + stepY, position.z + dz));
      if (!next || neighbors.includes(next)) continue;
      let canopyEvidence = false;
      for (let ox = -1; ox <= 1 && !canopyEvidence; ox += 1) for (let oy = -1; oy <= 1 && !canopyEvidence; oy += 1) for (let oz = -1; oz <= 1; oz += 1) {
        if (isTreeLeafBlock(readBlock(next.x + ox, next.y + oy, next.z + oz))) { canopyEvidence = true; break; }
      }
      if (canopyEvidence) neighbors.push(next);
    }
    return neighbors;
  };

  // Root cells within a natural wide footprint belong to one trunk. Distinct
  // trees remain separate clusters even when old overlapping branches touch.
  const unclusteredRoots = new Map(roots.map((root) => [keyOf(root.x, root.y, root.z), root]));
  const rootClusters: DiscoveredTreeBlock[][] = [];
  while (unclusteredRoots.size) {
    const first = unclusteredRoots.values().next().value as DiscoveredTreeBlock;
    const cluster: DiscoveredTreeBlock[] = [];
    const queue = [first];
    unclusteredRoots.delete(keyOf(first.x, first.y, first.z));
    while (queue.length) {
      const current = queue.shift()!;
      cluster.push(current);
      for (const candidate of [...unclusteredRoots.values()]) {
        const horizontalDistance = Math.max(Math.abs(candidate.x - current.x), Math.abs(candidate.z - current.z));
        if (candidate.type !== current.type || horizontalDistance > 1 || Math.abs(candidate.y - current.y) > 2) continue;
        unclusteredRoots.delete(keyOf(candidate.x, candidate.y, candidate.z));
        queue.push(candidate);
      }
    }
    rootClusters.push(cluster.sort((left, right) => left.y - right.y || left.x - right.x || left.z - right.z));
  }
  rootClusters.sort((left, right) => keyOf(left[0].x, left[0].y, left[0].z).localeCompare(keyOf(right[0].x, right[0].y, right[0].z)));

  const distancesByCluster = rootClusters.map((cluster) => {
    const distances = new Map<string, number>();
    const queue = cluster.map((root) => ({ block: root, distance: 0 }));
    for (const root of cluster) distances.set(keyOf(root.x, root.y, root.z), 0);
    while (queue.length) {
      const { block, distance } = queue.shift()!;
      for (const next of logNeighbors(block)) {
        const key = keyOf(next.x, next.y, next.z);
        if (distances.has(key)) continue;
        distances.set(key, distance + 1);
        queue.push({ block: next, distance: distance + 1 });
      }
    }
    return distances;
  });
  const ownerFor = (key: string) => {
    let owner = -1;
    let best = Number.POSITIVE_INFINITY;
    for (let index = 0; index < distancesByCluster.length; index += 1) {
      const distance = distancesByCluster[index].get(key) ?? Number.POSITIVE_INFINITY;
      if (distance < best) { owner = index; best = distance; }
    }
    return owner;
  };
  const startKey = keyOf(start.x, start.y, start.z);
  const selectedClusterIndex = ownerFor(startKey);
  if (selectedClusterIndex < 0) return null;
  const selectedRoots = rootClusters[selectedClusterIndex];
  const ownedCandidates = new Map([...logs].filter(([key]) => ownerFor(key) === selectedClusterIndex));

  // Multi-source parents provide a deterministic route from every natural
  // branch back to the complete rooted footprint.
  const parents = new Map<string, string | null>();
  const connectedQueue: DiscoveredTreeBlock[] = [];
  for (const root of selectedRoots) {
    const key = keyOf(root.x, root.y, root.z);
    parents.set(key, null);
    connectedQueue.push(root);
  }
  while (connectedQueue.length) {
    const current = connectedQueue.shift()!;
    const currentKey = keyOf(current.x, current.y, current.z);
    for (const next of logNeighbors(current)) {
      const nextKey = keyOf(next.x, next.y, next.z);
      if (!ownedCandidates.has(nextKey) || parents.has(nextKey)) continue;
      parents.set(nextKey, currentKey);
      connectedQueue.push(next);
    }
  }

  const retained = new Set<string>();
  const retainPath = (initialKey: string) => {
    let key: string | null | undefined = initialKey;
    while (key && !retained.has(key)) {
      retained.add(key);
      key = parents.get(key);
    }
  };
  for (const root of selectedRoots) {
    const rootKey = keyOf(root.x, root.y, root.z);
    retained.add(rootKey);
    // Wide-trunk buttresses are genuine tree structure even when they taper
    // out below the crown. Following each rooted vertical run fixes the old
    // half-felled ancient trees without accepting an unrooted horizontal beam.
    for (let y = root.y + 1; ; y += 1) {
      const key = keyOf(root.x, y, root.z);
      if (!ownedCandidates.has(key)) break;
      retained.add(key);
    }
  }
  // Legacy v1 previews could author an ancient tree's 3x3 buttress over a
  // nearby sand/rock biome edge. Those columns remain natural structure even
  // though only the center is on living soil. Admit a low, same-species,
  // multi-log root collar when the rooted footprint is already wide or at
  // least two such tapered columns surround it. A lone horizontal beam (one
  // log per column) and a lone player-built post remain excluded.
  const collarColumns = new Map<string, DiscoveredTreeBlock[]>();
  const rootType = selectedRoots[0].type;
  for (const log of ownedCandidates.values()) {
    if (log.type !== rootType) continue;
    const nearRoot = selectedRoots.some((root) => Math.max(Math.abs(log.x - root.x), Math.abs(log.z - root.z)) <= 1
      && log.y >= root.y - 2 && log.y <= root.y + 3);
    if (!nearRoot) continue;
    const columnKey = `${log.x},${log.z}`;
    collarColumns.set(columnKey, [...(collarColumns.get(columnKey) ?? []), log]);
  }
  const rootedColumns = new Set(selectedRoots.map((root) => `${root.x},${root.z}`));
  const taperedCollarColumns = [...collarColumns.entries()].filter(([columnKey, column]) => {
    if (rootedColumns.has(columnKey) || column.length < 2) return false;
    const ys = [...new Set(column.map((log) => log.y))].sort((left, right) => left - right);
    return ys.some((y, index) => index > 0 && y === ys[index - 1] + 1);
  });
  if (selectedRoots.length > 1 || taperedCollarColumns.length >= 2) {
    for (const [, column] of taperedCollarColumns) for (const log of column) retainPath(keyOf(log.x, log.y, log.z));
  }
  for (const log of ownedCandidates.values()) {
    let touchesCanopy = false;
    for (let dx = -1; dx <= 1 && !touchesCanopy; dx += 1) for (let dy = -1; dy <= 1 && !touchesCanopy; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
      if (isTreeLeafBlock(readBlock(log.x + dx, log.y + dy, log.z + dz))) { touchesCanopy = true; break; }
    }
    if (!touchesCanopy) continue;
    retainPath(keyOf(log.x, log.y, log.z));
  }
  if (!retained.has(startKey)) return null;
  const treeLogs = [...ownedCandidates.values()].filter((log) => retained.has(keyOf(log.x, log.y, log.z)));
  if (treeLogs.length < 3) return null;

  const foreignLogs = [...logs.values()].filter((log) => ownerFor(keyOf(log.x, log.y, log.z)) !== selectedClusterIndex);
  const leaves = new Map<string, DiscoveredTreeBlock>();
  const examinedLeaves = new Set<string>();
  const leafQueue: BlockPosition[] = [];
  for (const log of treeLogs) for (let dx = -1; dx <= 1; dx += 1) for (let dy = -1; dy <= 1; dy += 1) for (let dz = -1; dz <= 1; dz += 1) {
    if (!dx && !dy && !dz) continue;
    leafQueue.push({ x: log.x + dx, y: log.y + dy, z: log.z + dz });
  }
  while (leafQueue.length && leaves.size < leafLimit) {
    const position = leafQueue.shift()!;
    const key = keyOf(position.x, position.y, position.z);
    if (examinedLeaves.has(key)) continue;
    examinedLeaves.add(key);
    const type = readBlock(position.x, position.y, position.z);
    if (!isTreeLeafBlock(type)) continue;
    const ownDistance = treeLogs.reduce((best, log) => Math.min(best,
      (position.x - log.x) ** 2 + (position.y - log.y) ** 2 + (position.z - log.z) ** 2), Number.POSITIVE_INFINITY);
    // All production crowns stay within seven cells of their supporting wood.
    // This bound prevents a decorative/player-built leaf wall from being swept
    // into a natural felling operation merely because one corner touches.
    if (ownDistance > 49) continue;
    let foreignDistance = foreignLogs.reduce((best, log) => Math.min(best,
      (position.x - log.x) ** 2 + (position.y - log.y) ** 2 + (position.z - log.z) ** 2), Number.POSITIVE_INFINITY);
    const radius = Math.min(7, Math.max(2, Math.ceil(Math.sqrt(ownDistance)) + 1));
    for (let dx = -radius; dx <= radius; dx += 1) for (let dy = -radius; dy <= radius; dy += 1) for (let dz = -radius; dz <= radius; dz += 1) {
      const candidateKey = keyOf(position.x + dx, position.y + dy, position.z + dz);
      if (retained.has(candidateKey)) continue;
      // A deliberately excluded beam can still be part of the selected root's
      // connected log graph. It must remain standing, but it is not a competing
      // tree and therefore must not steal the genuine crown around it.
      if (logs.has(candidateKey) && ownerFor(candidateKey) === selectedClusterIndex) continue;
      const candidate = readBlock(position.x + dx, position.y + dy, position.z + dz);
      if (!isTreeLogBlock(candidate)) continue;
      foreignDistance = Math.min(foreignDistance, dx * dx + dy * dy + dz * dz);
    }
    if (foreignDistance < ownDistance) continue;
    leaves.set(key, { ...position, type: type! });
    for (const [dx, dy, dz] of TREE_NEIGHBORS) leafQueue.push({ x: position.x + dx, y: position.y + dy, z: position.z + dz });
  }

  const selectedRoot = [...selectedRoots].sort((left, right) => {
    const leftRun = treeLogs.filter((log) => log.x === left.x && log.z === left.z && log.y >= left.y).length;
    const rightRun = treeLogs.filter((log) => log.x === right.x && log.z === right.z && log.y >= right.y).length;
    return rightRun - leftRun || left.y - right.y || left.x - right.x || left.z - right.z;
  })[0];
  const attachments = new Map<string, DiscoveredTreeBlock>();
  for (const leaf of leaves.values()) {
    const attachmentY = leaf.y - 1;
    const type = readBlock(leaf.x, attachmentY, leaf.z);
    if (type !== BlockId.AppleFruit) continue;
    attachments.set(keyOf(leaf.x, attachmentY, leaf.z), { x: leaf.x, y: attachmentY, z: leaf.z, type });
  }
  const stableSort = (left: DiscoveredTreeBlock, right: DiscoveredTreeBlock) => left.y - right.y || left.x - right.x || left.z - right.z;
  return {
    root: selectedRoot,
    logs: treeLogs.sort(stableSort),
    leaves: [...leaves.values()].sort(stableSort),
    attachments: [...attachments.values()].sort(stableSort),
  };
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
  return found.profile.baseStageSeconds * hydrationFactor * jitter * PLANT_GROWTH_TIME_MULTIPLIER;
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
  const requestedPlant = ITEMS[item]?.plantBlock;
  const aquaticRequest = (requestedPlant !== undefined && AQUATIC_FLORA_SET.has(requestedPlant)) || AQUATIC_PROPAGULES[item] !== undefined;
  if (!aquaticRequest && above !== BlockId.Air && (Boolean(BLOCKS[above ?? BlockId.Air]?.liquid) || Boolean(BLOCKS[above ?? BlockId.Air]?.waterlogged))) return null;
  if (above !== BlockId.Air && !BLOCKS[above ?? BlockId.Air]?.replaceable) return null;
  if (item === Item.WheatSeeds && FARM_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.WheatSprout, consumes: item, description: "Wild wheat seeds" };
  if (item === Item.MoonriceSeeds && FARM_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.MoonriceSprout, consumes: item, description: "Moonrice seeds" };
  if (item === Item.SunrootStarts && FARM_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.SunrootSprout, consumes: item, description: "Sunroot starts" };
  if (item === Item.PeppermintSeeds && FARM_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.PeppermintSprout, consumes: item, description: "Peppermint starts" };
  if (item === Item.CocoaSeeds && FARM_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.CocoaSprout, consumes: item, description: "Cocoa puff seeds" };
  if (item === Item.CottonSeeds && FARM_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.CottonSprout, consumes: item, description: "Field cotton seeds" };
  if (item === Item.SunCarrotSeeds && FARM_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.SunCarrotSprout, consumes: item, description: "Suncrest carrot seeds" };
  if (item === Item.BluepodSeeds && FARM_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.BluepodSprout, consumes: item, description: "Bluepod bean seeds" };
  if (item === Item.Berry && LIVING_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.MoonberryShoot, consumes: item, description: "Moonberry cutting" };
  if (item === Item.Sunberry && LIVING_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.SunberryShoot, consumes: item, description: "Sunberry cutting" };
  if (item === Item.Apple && LIVING_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.AppleSapling, consumes: item, description: "Wild apple pip" };
  if (item === Item.SaltbrushSprig && LIVING_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.Saltbrush, consumes: item, description: "Saltbrush cutting" };
  if (item === Item.CoastAsterPetal && LIVING_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.CoastAster, consumes: item, description: "Coast aster seedhead" };
  if (item === Item.Gumdrop && LIVING_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.GumdropBush, consumes: item, description: "Gumdrop cutting" };
  if (item === Item.PeppermintCane && LIVING_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.PeppermintTuft, consumes: item, description: "Wild peppermint cane" };
  if (item === Item.MarshmallowTuft && LIVING_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.MarshmallowShrub, consumes: item, description: "Marshmallow shrub cutting" };
  if (item === Item.CandywoodSaplingItem && LIVING_SOILS.has(soil ?? BlockId.Air)) return { block: BlockId.CandywoodSapling, consumes: item, description: "Candywood sapling" };
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
  [BlockId.Lumenreed]: 4,
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

/** Breaking or harvesting a lower wild cane also clears every segment above. */
export function planPeppermintColumnRemoval(position: BlockPosition, readBlock: ReadBlock) {
  if (readBlock(position.x, position.y, position.z) !== BlockId.PeppermintTuft) return [] as Array<BlockPosition & { type: BlockId.Air }>;
  const edits: Array<BlockPosition & { type: BlockId.Air }> = [];
  for (let offset = 0; offset < 3; offset += 1) {
    const y = position.y + offset;
    if (readBlock(position.x, y, position.z) !== BlockId.PeppermintTuft) break;
    edits.push({ x: position.x, y, z: position.z, type: BlockId.Air });
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
  if (block === BlockId.PeppermintCrop) {
    return {
      replacement: useScythe ? BlockId.PeppermintSprout : BlockId.Air,
      drops: [{ item: Item.PeppermintCane, count: 2 + Math.floor(roll * 3) + (useScythe ? 1 : 0) }, { item: Item.PeppermintSeeds, count: 1 + (roll > 0.58 ? 1 : 0) }],
      replanted: useScythe,
    };
  }
  if (block === BlockId.CocoaCrop) {
    return {
      replacement: useScythe ? BlockId.CocoaSprout : BlockId.Air,
      drops: [{ item: Item.CocoaNib, count: 2 + Math.floor(roll * 3) + (useScythe ? 1 : 0) }, { item: Item.CocoaSeeds, count: 1 + (roll > 0.62 ? 1 : 0) }],
      replanted: useScythe,
    };
  }
  if (block === BlockId.CottonCrop) {
    return {
      replacement: useScythe ? BlockId.CottonSprout : BlockId.Air,
      drops: [{ item: Item.CottonBoll, count: 2 + Math.floor(roll * 3) + (useScythe ? 1 : 0) }, { item: Item.CottonSeeds, count: 1 + (roll > 0.55 ? 1 : 0) }],
      replanted: useScythe,
    };
  }
  if (block === BlockId.SunCarrotCrop) {
    return {
      replacement: useScythe ? BlockId.SunCarrotSprout : BlockId.Air,
      drops: [{ item: Item.SunCarrot, count: 2 + Math.floor(roll * 2) + (useScythe ? 1 : 0) }, { item: Item.SunCarrotSeeds, count: 1 + (roll > 0.62 ? 1 : 0) }],
      replanted: useScythe,
    };
  }
  if (block === BlockId.BluepodCrop) {
    return {
      replacement: useScythe ? BlockId.BluepodSprout : BlockId.Air,
      drops: [{ item: Item.BluepodBeans, count: 2 + Math.floor(roll * 3) + (useScythe ? 1 : 0) }, { item: Item.BluepodSeeds, count: 1 + (roll > 0.58 ? 1 : 0) }],
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
  if (block === BlockId.GumdropBush) return { replacement: BlockId.Air, drops: [{ item: Item.Gumdrop, count: 1 + Math.floor(roll * 3) }], replanted: false };
  if (block === BlockId.PeppermintTuft) return { replacement: BlockId.Air, drops: [{ item: Item.PeppermintCane, count: 1 + Math.floor(roll * 2) }], replanted: false };
  if (block === BlockId.LollipopOrchid) return { replacement: BlockId.Air, drops: [{ item: Item.LollipopPetal, count: 1 + Math.floor(roll * 2) }], replanted: false };
  if (block === BlockId.MarshmallowShrub) return { replacement: BlockId.Air, drops: [{ item: Item.MarshmallowTuft, count: 1 + Math.floor(roll * 2) }], replanted: false };
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

export function resolveBucketAction(
  item: ItemCode,
  target: BlockId | undefined,
  placement: BlockId | undefined,
  targetIsSource = true,
): BucketAction | null {
  if (item === Item.Bucket && targetIsSource && target === BlockId.Water) return { kind: "fill", removeTarget: true, resultItem: Item.WaterBucket };
  if (item === Item.Bucket && targetIsSource && target === BlockId.Lava) return { kind: "fill", removeTarget: true, resultItem: Item.LavaBucket };
  if (item === Item.Bucket && targetIsSource && target === BlockId.Honey) return { kind: "fill", removeTarget: true, resultItem: Item.HoneyBucket };
  if (item === Item.Bucket && targetIsSource && target === BlockId.Syrup) return { kind: "fill", removeTarget: true, resultItem: Item.SyrupBucket };
  const canReplace = placement === BlockId.Air || Boolean(BLOCKS[placement ?? BlockId.Air]?.replaceable);
  if (!canReplace) return null;
  if (item === Item.WaterBucket) return { kind: "pour", removeTarget: false, place: BlockId.Water, resultItem: Item.Bucket };
  if (item === Item.LavaBucket) return { kind: "pour", removeTarget: false, place: BlockId.Lava, resultItem: Item.Bucket };
  if (item === Item.HoneyBucket) return { kind: "pour", removeTarget: false, place: BlockId.Honey, resultItem: Item.Bucket };
  if (item === Item.SyrupBucket) return { kind: "pour", removeTarget: false, place: BlockId.Syrup, resultItem: Item.Bucket };
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
  /** Keeper for an unfenced lead. Null retains the legacy local-player behavior. */
  ownerId?: string | null;
  fence?: BlockPosition;
  maximumLength: number;
}>;

export type SavedLeadAnchor = Readonly<{
  mobId: number;
  ownerId?: string | null;
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
      ...(typeof lead.ownerId === "string" && lead.ownerId.trim() ? { ownerId: lead.ownerId.trim().slice(0, 160) } : {}),
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
      ...(typeof entry.ownerId === "string" && entry.ownerId.trim() ? { ownerId: entry.ownerId.trim().slice(0, 160) } : {}),
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
