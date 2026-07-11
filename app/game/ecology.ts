import { BlockId, Item, type ItemCode } from "./data";
import type { MobKind } from "./mobs";

const hashUnit = (seed: string | number, salt: string | number) => {
  const text = `${seed}:${salt}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
};

export const SYRUP_POND_CELL_SIZE = 48;

export type SyrupPondSample = Readonly<{
  height: number;
  waterline: number;
  biome: number;
}>;

export type SyrupPondColumn = Readonly<{
  x: number;
  z: number;
  /** Uniform liquid surface shared by every column in one pond. */
  surfaceY: number;
  /** Solid sugar-soil floor beneath the source liquid. */
  bedY: number;
  originalSurfaceY: number;
  floor: BlockId.SugarSoil;
  liquid: BlockId.Syrup;
}>;

export type SyrupPondPlan = Readonly<{
  id: string;
  center: Readonly<{ x: number; y: number; z: number }>;
  radiusX: number;
  radiusZ: number;
  columns: readonly SyrupPondColumn[];
}>;

type SyrupPondCandidate = Omit<SyrupPondPlan, "columns"> & Readonly<{ cellX: number; cellZ: number }>;

function syrupPondCandidate(
  seed: string | number,
  cellX: number,
  cellZ: number,
  sample: (x: number, z: number) => SyrupPondSample,
  sugarplumBiome: number,
): SyrupPondCandidate | null {
  // A cell owns at most one pond and leaves an eight-block inset. This makes
  // candidates independent of chunk traversal and prevents neighboring cells
  // from overlapping even at their widest possible radii.
  if (hashUnit(seed, `syrup-pond:${cellX},${cellZ}:presence`) < 0.46) return null;
  const inset = 8;
  const span = SYRUP_POND_CELL_SIZE - inset * 2;
  const x = cellX * SYRUP_POND_CELL_SIZE + inset + Math.floor(hashUnit(seed, `syrup-pond:${cellX},${cellZ}:x`) * span);
  const z = cellZ * SYRUP_POND_CELL_SIZE + inset + Math.floor(hashUnit(seed, `syrup-pond:${cellX},${cellZ}:z`) * span);
  const radiusX = 4 + Math.floor(hashUnit(seed, `syrup-pond:${cellX},${cellZ}:rx`) * 4);
  const radiusZ = 3 + Math.floor(hashUnit(seed, `syrup-pond:${cellX},${cellZ}:rz`) * 4);
  const center = sample(x, z);
  if (center.biome !== sugarplumBiome || center.height <= center.waterline + 3) return null;
  const edgeSamples = [[radiusX, 0], [-radiusX, 0], [0, radiusZ], [0, -radiusZ]] as const;
  for (const [dx, dz] of edgeSamples) {
    const edge = sample(x + dx, z + dz);
    if (edge.biome !== sugarplumBiome || Math.abs(edge.height - center.height) > 2 || edge.height <= edge.waterline + 2) return null;
  }
  const surfaceY = center.height - 1;
  return {
    id: `syrup-pond:${cellX}:${cellZ}`,
    cellX,
    cellZ,
    center: { x, y: surfaceY, z },
    radiusX,
    radiusZ,
  };
}

function syrupPondColumnForCandidate(
  seed: string | number,
  candidate: SyrupPondCandidate,
  x: number,
  z: number,
  sample: (x: number, z: number) => SyrupPondSample,
  sugarplumBiome: number,
): SyrupPondColumn | null {
  const nx = (x - candidate.center.x) / candidate.radiusX;
  const nz = (z - candidate.center.z) / candidate.radiusZ;
  const radial = nx * nx + nz * nz;
  const edgeWobble = (hashUnit(seed, `${candidate.id}:edge:${x},${z}`) - 0.5) * 0.12;
  if (radial > 1 + edgeWobble) return null;
  const local = sample(x, z);
  if (local.biome !== sugarplumBiome || Math.abs(local.height - candidate.center.y - 1) > 2) return null;
  const depth = 1 + Math.floor(Math.max(0, 1 - radial) * 2.25);
  return {
    x,
    z,
    surfaceY: candidate.center.y,
    bedY: candidate.center.y - depth,
    originalSurfaceY: local.height,
    floor: BlockId.SugarSoil,
    liquid: BlockId.Syrup,
  };
}

/** Returns the deterministic pond cell at one world coordinate, if any. */
export function syrupPondColumnAt(
  seed: string | number,
  x: number,
  z: number,
  sample: (x: number, z: number) => SyrupPondSample,
  sugarplumBiome: number,
): SyrupPondColumn | null {
  const cellX = Math.floor(x / SYRUP_POND_CELL_SIZE);
  const cellZ = Math.floor(z / SYRUP_POND_CELL_SIZE);
  for (let offsetX = -1; offsetX <= 1; offsetX += 1) for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
    const candidate = syrupPondCandidate(seed, cellX + offsetX, cellZ + offsetZ, sample, sugarplumBiome);
    if (!candidate) continue;
    const column = syrupPondColumnForCandidate(seed, candidate, x, z, sample, sugarplumBiome);
    if (column) return column;
  }
  return null;
}

/**
 * Plans only the slice belonging to one chunk. Neighboring chunks derive the
 * same candidate and surface height independently, so ponds cannot tear at a
 * chunk boundary and generation order does not matter.
 */
export function planSyrupPondsForChunk(input: Readonly<{
  seed: string | number;
  chunkX: number;
  chunkZ: number;
  chunkSize: number;
  sample: (x: number, z: number) => SyrupPondSample;
  sugarplumBiome: number;
}>): SyrupPondPlan[] {
  const chunkSize = Math.max(1, Math.floor(input.chunkSize));
  const minX = input.chunkX * chunkSize;
  const minZ = input.chunkZ * chunkSize;
  const maxX = minX + chunkSize - 1;
  const maxZ = minZ + chunkSize - 1;
  const plans: SyrupPondPlan[] = [];
  const cellStartX = Math.floor((minX - 7) / SYRUP_POND_CELL_SIZE);
  const cellEndX = Math.floor((maxX + 7) / SYRUP_POND_CELL_SIZE);
  const cellStartZ = Math.floor((minZ - 7) / SYRUP_POND_CELL_SIZE);
  const cellEndZ = Math.floor((maxZ + 7) / SYRUP_POND_CELL_SIZE);
  for (let cellX = cellStartX; cellX <= cellEndX; cellX += 1) for (let cellZ = cellStartZ; cellZ <= cellEndZ; cellZ += 1) {
    const candidate = syrupPondCandidate(input.seed, cellX, cellZ, input.sample, input.sugarplumBiome);
    if (!candidate) continue;
    const columns: SyrupPondColumn[] = [];
    const startX = Math.max(minX, candidate.center.x - candidate.radiusX);
    const endX = Math.min(maxX, candidate.center.x + candidate.radiusX);
    const startZ = Math.max(minZ, candidate.center.z - candidate.radiusZ);
    const endZ = Math.min(maxZ, candidate.center.z + candidate.radiusZ);
    for (let x = startX; x <= endX; x += 1) for (let z = startZ; z <= endZ; z += 1) {
      const column = syrupPondColumnForCandidate(input.seed, candidate, x, z, input.sample, input.sugarplumBiome);
      if (column) columns.push(column);
    }
    if (columns.length) plans.push({ id: candidate.id, center: candidate.center, radiusX: candidate.radiusX, radiusZ: candidate.radiusZ, columns });
  }
  return plans.sort((left, right) => left.id.localeCompare(right.id));
}

export type SocialGroupMode = "herd" | "shoal";
export type SocialGroupMember = Readonly<{ id: string; x: number; z: number; vx: number; vz: number }>;
export type SocialGroupMotion = Readonly<{ id: string; x: number; z: number; speedScale: number }>;

/** Bounded cohesion/separation/alignment shared by large herds and thin-fish shoals. */
export function planSocialGroupMotion(members: readonly SocialGroupMember[], mode: SocialGroupMode): SocialGroupMotion[] {
  const separationRadius = mode === "herd" ? 2.4 : 0.72;
  const cohesionWeight = mode === "herd" ? 0.16 : 0.28;
  const separationWeight = mode === "herd" ? 1.15 : 0.74;
  const alignmentWeight = mode === "herd" ? 0.1 : 0.32;
  return members.map((member) => {
    const neighbors = members
      .filter((candidate) => candidate.id !== member.id)
      .map((candidate) => ({ candidate, distance: Math.hypot(candidate.x - member.x, candidate.z - member.z) }))
      .sort((left, right) => left.distance - right.distance || left.candidate.id.localeCompare(right.candidate.id))
      .slice(0, 8);
    if (!neighbors.length) return { id: member.id, x: member.vx, z: member.vz, speedScale: 0.86 };
    let centerX = 0; let centerZ = 0; let alignX = 0; let alignZ = 0; let separateX = 0; let separateZ = 0;
    for (const { candidate, distance } of neighbors) {
      centerX += candidate.x; centerZ += candidate.z; alignX += candidate.vx; alignZ += candidate.vz;
      if (distance < separationRadius && distance > 0.0001) {
        const strength = (separationRadius - distance) / separationRadius;
        separateX += (member.x - candidate.x) / distance * strength;
        separateZ += (member.z - candidate.z) / distance * strength;
      }
    }
    const count = neighbors.length;
    const x = (centerX / count - member.x) * cohesionWeight + separateX * separationWeight + alignX / count * alignmentWeight;
    const z = (centerZ / count - member.z) * cohesionWeight + separateZ * separationWeight + alignZ / count * alignmentWeight;
    const length = Math.hypot(x, z) || 1;
    return { id: member.id, x: x / length, z: z / length, speedScale: Math.min(1.3, 0.82 + length * 0.16) };
  });
}

export function planGroupSpawn(seed: string | number, kind: MobKind, center: Readonly<{ x: number; y: number; z: number }>, mode: SocialGroupMode) {
  const count = mode === "herd" ? 4 + Math.floor(hashUnit(seed, `${kind}:herd-count`) * 4) : 6 + Math.floor(hashUnit(seed, `${kind}:shoal-count`) * 7);
  const radius = mode === "herd" ? 7 : 2.8;
  return Array.from({ length: count }, (_, index) => {
    const angle = hashUnit(seed, `${kind}:${index}:angle`) * Math.PI * 2;
    const distance = Math.sqrt(hashUnit(seed, `${kind}:${index}:distance`)) * radius;
    return { kind, x: center.x + Math.cos(angle) * distance, y: center.y, z: center.z + Math.sin(angle) * distance, groupId: `${kind}:${seed}` };
  });
}

export type ReedstriderBond = Readonly<{
  schema: 1;
  trust: number;
  tamed: boolean;
  ownerId: string | null;
  saddled: boolean;
}>;

export const createReedstriderBond = (): ReedstriderBond => ({ schema: 1, trust: 0, tamed: false, ownerId: null, saddled: false });

export function feedReedstrider(state: ReedstriderBond, ownerId: string, item: ItemCode): ReedstriderBond {
  const foods: readonly ItemCode[] = [Item.RawFish, Item.CookedFish, Item.GlowScale];
  if (!foods.includes(item)) return state;
  const gain = item === Item.GlowScale ? 3 : item === Item.CookedFish ? 2 : 1;
  const trust = Math.min(8, state.trust + gain);
  return { ...state, trust, tamed: state.tamed || trust >= 6, ownerId: state.ownerId ?? (trust >= 6 ? ownerId : null) };
}

export function saddleReedstrider(state: ReedstriderBond, ownerId: string) {
  return state.tamed && state.ownerId === ownerId ? { ...state, saddled: true } : state;
}

export function canRideReedstrider(state: ReedstriderBond, ownerId: string) {
  return state.tamed && state.saddled && state.ownerId === ownerId;
}

export function reedstriderRideSpeed(inWater: boolean, sprinting: boolean) {
  return (inWater ? 6.4 : 5.35) * (sprinting ? 1.22 : 1);
}

export type PeelopDefenseInput = Readonly<{
  tamed: boolean;
  selfAttacked: boolean;
  ownerAttacked: boolean;
  hostileDistance: number;
  cooldownSeconds: number;
}>;

export function peelopDefenseAction(input: PeelopDefenseInput) {
  const provoked = input.selfAttacked || (input.tamed && input.ownerAttacked);
  const attacks = provoked && input.cooldownSeconds <= 0 && input.hostileDistance <= 1.55;
  return { attacks, damage: attacks ? 2 : 0, leapVelocity: attacks ? 4.8 : 0, nextCooldownSeconds: attacks ? 1.2 : Math.max(0, input.cooldownSeconds) };
}

export type PeelopSheddingState = Readonly<{ nextShedAge: number; shedCount: number }>;

export function createPeelopSheddingState(geneticSeed: number): PeelopSheddingState {
  return { nextShedAge: 18_000 + Math.floor(hashUnit(geneticSeed, "first-shed") * 6_000), shedCount: 0 };
}

export function stepPeelopShedding(state: PeelopSheddingState, ageTicks: number) {
  if (ageTicks < state.nextShedAge) return { state, drop: null };
  const interval = 18_000 + Math.floor(hashUnit(ageTicks, state.shedCount) * 8_000);
  return { state: { nextShedAge: ageTicks + interval, shedCount: state.shedCount + 1 }, drop: { item: Item.Banana, count: 1 } };
}

export function puddlehopperJumpPlan(seed: string | number, elapsedSeconds: number, raining: boolean, startled: boolean) {
  const interval = raining ? 1.45 : 2.8;
  const cycle = Math.floor(Math.max(0, elapsedSeconds) / interval);
  const jumps = startled || hashUnit(seed, `puddle-hop:${cycle}`) > (raining ? 0.28 : 0.62);
  return {
    jumps,
    verticalVelocity: jumps ? (startled ? 7.1 : raining ? 6.4 : 5.8) : 0,
    forwardVelocity: jumps ? (startled ? 3.2 : 2.1) : 0,
    nextDecisionSeconds: (cycle + 1) * interval,
  };
}

export type SubmergedFloraPlacement = Readonly<{
  x: number;
  y: number;
  z: number;
  block: BlockId;
  /** Flora is an occupant of the water volume, never a replacement source. */
  waterlogged: true;
  coexistsWith: BlockId.Water;
  replacesWater: false;
}>;

export type AquaticFloraHabitat = "river" | "coast" | "ocean" | "deep-ocean" | "lumen-trench";

const AQUATIC_FLORA_HEIGHT: Readonly<Partial<Record<BlockId, number>>> = Object.freeze({
  [BlockId.RiverRibbon]: 3,
  [BlockId.GlowKelp]: 5,
  [BlockId.ReedBloom]: 2,
  [BlockId.LumenKelp]: 7,
  [BlockId.StarCoral]: 1,
  [BlockId.AbyssBloom]: 2,
  [BlockId.Tidevine]: 5,
});

export function planSubmergedFlora(
  seed: string | number,
  x: number,
  bedY: number,
  z: number,
  waterDepth: number,
  habitat: AquaticFloraHabitat = waterDepth >= 14 ? "deep-ocean" : waterDepth >= 7 ? "ocean" : "river",
): SubmergedFloraPlacement[] {
  const depth = Math.max(0, Math.floor(waterDepth));
  if (depth < 2) return [];
  const roll = hashUnit(seed, `submerged:${x},${z}`);
  const densityFloor = habitat === "lumen-trench" ? 0.7 : habitat === "deep-ocean" ? 0.77 : habitat === "ocean" ? 0.81 : habitat === "coast" ? 0.88 : 0.82;
  if (roll < densityFloor) return [];
  const speciesRoll = hashUnit(seed, `submerged-species:${habitat}:${x},${z}`);
  let block: BlockId;
  if (habitat === "lumen-trench") block = speciesRoll > 0.78 ? BlockId.AbyssBloom : speciesRoll > 0.44 ? BlockId.LumenKelp : speciesRoll > 0.2 ? BlockId.StarCoral : BlockId.GlowKelp;
  else if (habitat === "deep-ocean") block = speciesRoll > 0.86 ? BlockId.AbyssBloom : speciesRoll > 0.58 ? BlockId.LumenKelp : speciesRoll > 0.28 ? BlockId.Tidevine : BlockId.StarCoral;
  else if (habitat === "ocean") block = speciesRoll > 0.78 ? BlockId.StarCoral : speciesRoll > 0.42 ? BlockId.Tidevine : BlockId.GlowKelp;
  else if (habitat === "coast") block = speciesRoll > 0.72 ? BlockId.StarCoral : speciesRoll > 0.34 ? BlockId.Tidevine : BlockId.ReedBloom;
  else block = speciesRoll > 0.74 ? BlockId.RiverRibbon : BlockId.ReedBloom;
  const naturalLimit = AQUATIC_FLORA_HEIGHT[block] ?? 1;
  const heightRoll = 0.55 + hashUnit(seed, `submerged-height:${x},${z}`) * 0.75;
  const height = Math.max(1, Math.min(naturalLimit, depth - 1, Math.round(naturalLimit * heightRoll)));
  return Array.from({ length: height }, (_, dy) => ({
    x,
    y: bedY + 1 + dy,
    z,
    block,
    waterlogged: true as const,
    coexistsWith: BlockId.Water as const,
    replacesWater: false as const,
  }));
}

export const CLOUDREED_GLEN = Object.freeze({
  id: "cloudreed-glen",
  name: "Cloudreed Glen",
  climate: { temperature: [0.3, 0.55] as const, moisture: [0.68, 0.92] as const, elevation: [42, 66] as const },
  surface: BlockId.CloudreedGrass,
  flora: [BlockId.Cloudbell, BlockId.ReedBloom, BlockId.RiverRibbon] as const,
  signatureCreature: "mistmane" as MobKind,
  musicMood: "cool upland reeds, glassy bells, slow wind",
});

export type TreeForm = "rounded" | "layered" | "windswept" | "ancient";
export type TreePlanBlock = Readonly<{ x: number; y: number; z: number; block: BlockId }>;

const TREE_FACE_NEIGHBORS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;

/** Public invariant used by generation tests and future authored tree tools. */
export function treeLogsAreFaceConnected(plan: readonly TreePlanBlock[], log: BlockId) {
  const keys = new Set(plan.filter((entry) => entry.block === log).map((entry) => `${entry.x},${entry.y},${entry.z}`));
  const first = keys.values().next().value as string | undefined;
  if (!first) return false;
  const visited = new Set<string>([first]);
  const queue = [first];
  while (queue.length) {
    const [x, y, z] = queue.shift()!.split(",").map(Number);
    for (const [dx, dy, dz] of TREE_FACE_NEIGHBORS) {
      const key = `${x + dx},${y + dy},${z + dz}`;
      if (!keys.has(key) || visited.has(key)) continue;
      visited.add(key);
      queue.push(key);
    }
  }
  return visited.size === keys.size;
}

/**
 * Preserve the original airy cutout art. Crowns look full because generation
 * emits denser leaf volumes and a small deterministic sample of internal faces,
 * not because the texture is turned into an opaque cube.
 */
export const DENSE_CUTOUT_LEAF_POLICY = Object.freeze({
  solidCollision: false,
  preserveTextureCutout: true,
  exteriorPixelCoverage: 0.72,
  alphaTest: 0.42,
  crownDensity: 0.86,
  renderInternalFaceFraction: 0.18,
  cullSameTypeInteriorFaces: "selective" as const,
});

/** @deprecated Use DENSE_CUTOUT_LEAF_POLICY. */
export const FULL_LEAF_POLICY = DENSE_CUTOUT_LEAF_POLICY;

export function planFullTree(
  seed: string | number,
  origin: Readonly<{ x: number; y: number; z: number }>,
  form: TreeForm,
  log: BlockId,
  leaves: BlockId,
): TreePlanBlock[] {
  const blocks = new Map<string, TreePlanBlock>();
  const set = (x: number, y: number, z: number, block: BlockId) => blocks.set(`${x},${y},${z}`, { x, y, z, block });
  const setLeaf = (x: number, y: number, z: number) => {
    const key = `${x},${y},${z}`;
    if (blocks.get(key)?.block !== log) blocks.set(key, { x, y, z, block: leaves });
  };
  const trunkHeight = form === "ancient" ? 8 : form === "layered" ? 7 : 5 + Math.floor(hashUnit(seed, "tree-height") * 2);
  for (let dy = 0; dy < trunkHeight; dy += 1) set(origin.x, origin.y + dy, origin.z, log);
  if (form === "windswept") {
    for (let step = 1; step <= 3; step += 1) {
      const branchY = origin.y + trunkHeight - 2 + Math.floor(step / 2);
      set(origin.x + step, branchY, origin.z, log);
      if (step > 1) set(origin.x + step - 1, branchY, origin.z, log);
    }
  }
  if (form === "ancient") for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) for (let dy = 0; dy < 3; dy += 1) set(origin.x + dx, origin.y + dy, origin.z + dz, log);
  const centerX = origin.x + (form === "windswept" ? 2 : 0);
  const centerY = origin.y + trunkHeight;
  const layers = form === "layered" ? [[-2, 3], [0, 2], [2, 1]] as const : form === "ancient" ? [[-1, 4], [1, 3], [3, 2]] as const : [[-1, 3], [1, 2], [2, 1]] as const;
  for (const [dy, radius] of layers) for (let dz = -radius; dz <= radius; dz += 1) for (let dx = -radius; dx <= radius; dx += 1) {
    const edge = Math.abs(dx) === radius && Math.abs(dz) === radius;
    if (edge && hashUnit(seed, `leaf-edge:${dx},${dy},${dz}`) < 0.45) continue;
    setLeaf(centerX + dx, centerY + dy, origin.z + dz);
  }
  // Defensive topology repair for future authored forms: bridge any remaining
  // log islands along a deterministic Manhattan path. Leaves never overwrite
  // wood, so every vertical layer stays connected to the rooted trunk.
  const connected = new Set<string>();
  const rootKey = `${origin.x},${origin.y},${origin.z}`;
  connected.add(rootKey);
  const flood = () => {
    const queue = [...connected];
    while (queue.length) {
      const key = queue.shift()!;
      const [x, y, z] = key.split(",").map(Number);
      for (const [dx, dy, dz] of TREE_FACE_NEIGHBORS) {
        const nextKey = `${x + dx},${y + dy},${z + dz}`;
        if (connected.has(nextKey) || blocks.get(nextKey)?.block !== log) continue;
        connected.add(nextKey);
        queue.push(nextKey);
      }
    }
  };
  flood();
  const remainingLogs = () => [...blocks.values()].filter((entry) => entry.block === log && !connected.has(`${entry.x},${entry.y},${entry.z}`));
  while (remainingLogs().length) {
    const target = remainingLogs().sort((left, right) => left.y - right.y || left.x - right.x || left.z - right.z)[0];
    const anchors = [...connected].map((key) => {
      const [x, y, z] = key.split(",").map(Number);
      return { x, y, z, distance: Math.abs(target.x - x) + Math.abs(target.y - y) + Math.abs(target.z - z) };
    }).sort((left, right) => left.distance - right.distance || left.y - right.y || left.x - right.x || left.z - right.z);
    const cursor = { x: anchors[0].x, y: anchors[0].y, z: anchors[0].z };
    while (cursor.y !== target.y) { cursor.y += Math.sign(target.y - cursor.y); set(cursor.x, cursor.y, cursor.z, log); connected.add(`${cursor.x},${cursor.y},${cursor.z}`); }
    while (cursor.x !== target.x) { cursor.x += Math.sign(target.x - cursor.x); set(cursor.x, cursor.y, cursor.z, log); connected.add(`${cursor.x},${cursor.y},${cursor.z}`); }
    while (cursor.z !== target.z) { cursor.z += Math.sign(target.z - cursor.z); set(cursor.x, cursor.y, cursor.z, log); connected.add(`${cursor.x},${cursor.y},${cursor.z}`); }
    flood();
  }
  return [...blocks.values()].sort((left, right) => left.y - right.y || left.z - right.z || left.x - right.x);
}
