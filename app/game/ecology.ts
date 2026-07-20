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
  const separationRadius = mode === "herd" ? 2.4 : 1.18;
  const cohesionWeight = mode === "herd" ? 0.16 : 0.21;
  const separationWeight = mode === "herd" ? 1.15 : 1.02;
  const alignmentWeight = mode === "herd" ? 0.1 : 0.28;
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
  const radius = mode === "herd" ? 7 : 4.4;
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

/** Wild Sugarplum canes form short, connected 1-3 block stands. */
export function wildPeppermintHeight(seed: string | number, x: number, z: number): 1 | 2 | 3 {
  const roll = hashUnit(seed, `wild-peppermint-height:${x},${z}`);
  return roll < 0.42 ? 1 : roll < 0.82 ? 2 : 3;
}

const AQUATIC_FLORA_HEIGHT: Readonly<Partial<Record<BlockId, number>>> = Object.freeze({
  [BlockId.Brinegrass]: 2,
  [BlockId.Sailkelp]: 6,
  [BlockId.Featherwrack]: 3,
  [BlockId.Pearlfan]: 1,
  [BlockId.RiverRibbon]: 3,
  [BlockId.GlowKelp]: 5,
  [BlockId.ReedBloom]: 2,
  [BlockId.LumenKelp]: 7,
  [BlockId.StarCoral]: 1,
  [BlockId.AbyssBloom]: 2,
  [BlockId.Tidevine]: 5,
});

export type AquaticFloraWeight = Readonly<{ block: BlockId; weight: number }>;

/**
 * Broad matte plants own ordinary seas; light-producing plants become small
 * signals there and remain abundant only inside the Lumen Trench ecosystem.
 * Keeping the weights public makes that art-direction rule auditable.
 */
export const AQUATIC_FLORA_HABITAT_WEIGHTS = Object.freeze({
  river: Object.freeze([
    { block: BlockId.ReedBloom, weight: .58 },
    { block: BlockId.RiverRibbon, weight: .42 },
  ]),
  coast: Object.freeze([
    { block: BlockId.Brinegrass, weight: .58 },
    { block: BlockId.Sailkelp, weight: .24 },
    { block: BlockId.Featherwrack, weight: .08 },
    { block: BlockId.ReedBloom, weight: .04 },
    { block: BlockId.Tidevine, weight: .025 },
    { block: BlockId.Pearlfan, weight: .025 },
    { block: BlockId.StarCoral, weight: .01 },
  ]),
  ocean: Object.freeze([
    { block: BlockId.Brinegrass, weight: .54 },
    { block: BlockId.Sailkelp, weight: .40 },
    { block: BlockId.Featherwrack, weight: .025 },
    { block: BlockId.Tidevine, weight: .015 },
    { block: BlockId.Pearlfan, weight: .01 },
    { block: BlockId.StarCoral, weight: .007 },
    { block: BlockId.GlowKelp, weight: .003 },
  ]),
  "deep-ocean": Object.freeze([
    { block: BlockId.Sailkelp, weight: .55 },
    { block: BlockId.Brinegrass, weight: .34 },
    { block: BlockId.Featherwrack, weight: .05 },
    { block: BlockId.Tidevine, weight: .03 },
    { block: BlockId.Pearlfan, weight: .025 },
    { block: BlockId.LumenKelp, weight: .003 },
    { block: BlockId.StarCoral, weight: .0015 },
    { block: BlockId.AbyssBloom, weight: .0005 },
  ]),
  "lumen-trench": Object.freeze([
    { block: BlockId.LumenKelp, weight: .38 },
    { block: BlockId.Sailkelp, weight: .22 },
    { block: BlockId.StarCoral, weight: .16 },
    { block: BlockId.GlowKelp, weight: .10 },
    { block: BlockId.Brinegrass, weight: .06 },
    { block: BlockId.AbyssBloom, weight: .05 },
    { block: BlockId.Pearlfan, weight: .03 },
  ]),
} satisfies Readonly<Record<AquaticFloraHabitat, readonly AquaticFloraWeight[]>>);

function pickAquaticFlora(weights: readonly AquaticFloraWeight[], roll: number) {
  let cursor = 0;
  for (const entry of weights) {
    cursor += entry.weight;
    if (roll < cursor) return entry.block;
  }
  return weights.at(-1)?.block ?? BlockId.Brinegrass;
}

const AQUATIC_FLORA_BASE_SPAWN_CHANCE = Object.freeze({
  river: .18,
  coast: .18,
  ocean: .24,
  "deep-ocean": .26,
  "lumen-trench": .33,
} satisfies Readonly<Record<AquaticFloraHabitat, number>>);

const AQUATIC_FLORA_PATCH_SCALE = Object.freeze({
  river: 8,
  coast: 11,
  ocean: 14,
  "deep-ocean": 16,
  "lumen-trench": 13,
} satisfies Readonly<Record<AquaticFloraHabitat, number>>);

const AQUATIC_PATCH_HASH_CACHE_LIMIT = 8_192;
const aquaticPatchHashCache = new Map<string, number>();

function aquaticPatchHash(seed: string | number, salt: string) {
  const key = `${seed}:${salt}`;
  const cached = aquaticPatchHashCache.get(key);
  if (cached !== undefined) return cached;
  const value = hashUnit(seed, salt);
  if (aquaticPatchHashCache.size >= AQUATIC_PATCH_HASH_CACHE_LIMIT) {
    const oldest = aquaticPatchHashCache.keys().next().value as string | undefined;
    if (oldest !== undefined) aquaticPatchHashCache.delete(oldest);
  }
  aquaticPatchHashCache.set(key, value);
  return value;
}

/**
 * Every coarse cell owns one jittered, rotated, softly lobed bed. Dense flora
 * inside and a tiny background chance outside create readable meadow islands
 * with open water between them. Average coverage keeps the multiplier centered
 * near one, preserving each habitat's former spawn chance.
 */
function aquaticPatchSpawnChance(seed: string | number, habitat: AquaticFloraHabitat, x: number, z: number) {
  const scale = AQUATIC_FLORA_PATCH_SCALE[habitat];
  const cellX = Math.floor(x / scale);
  const cellZ = Math.floor(z / scale);
  let insideBed = false;
  for (let offsetX = -1; offsetX <= 1 && !insideBed; offsetX += 1) for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
    const candidateX = cellX + offsetX;
    const candidateZ = cellZ + offsetZ;
    const key = `${habitat}:${candidateX},${candidateZ}`;
    const centerX = (candidateX + .14 + aquaticPatchHash(seed, `submerged-bed-x:${key}`) * .72) * scale;
    const centerZ = (candidateZ + .14 + aquaticPatchHash(seed, `submerged-bed-z:${key}`) * .72) * scale;
    const dx = x - centerX;
    const dz = z - centerZ;
    // No lobe can exceed this conservative radius. Rejecting distant centers
    // before rotations and trigonometry keeps the per-column planner cheap.
    const maximumRadius = scale * .47;
    if (dx * dx + dz * dz > maximumRadius * maximumRadius) continue;
    const radiusX = scale * (.30 + aquaticPatchHash(seed, `submerged-bed-radius-x:${key}`) * .12);
    const radiusZ = scale * (.30 + aquaticPatchHash(seed, `submerged-bed-radius-z:${key}`) * .12);
    const rotation = aquaticPatchHash(seed, `submerged-bed-rotation:${key}`) * Math.PI * 2;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    const rotatedX = dx * cosine - dz * sine;
    const rotatedZ = dx * sine + dz * cosine;
    const normalizedX = rotatedX / radiusX;
    const normalizedZ = rotatedZ / radiusZ;
    const radialAngle = Math.atan2(normalizedZ, normalizedX);
    const phaseA = aquaticPatchHash(seed, `submerged-bed-lobe-a:${key}`) * Math.PI * 2;
    const phaseB = aquaticPatchHash(seed, `submerged-bed-lobe-b:${key}`) * Math.PI * 2;
    const edge = .93 + Math.sin(radialAngle * 3 + phaseA) * .10 + Math.sin(radialAngle * 5 + phaseB) * .055;
    if (normalizedX * normalizedX + normalizedZ * normalizedZ <= edge * edge) {
      insideBed = true;
      break;
    }
  }
  return AQUATIC_FLORA_BASE_SPAWN_CHANCE[habitat] * (insideBed ? 2.7 : .05);
}

/**
 * A jittered nearest-center field gives each species an organic bed instead
 * of a square patch. Nine candidates are enough because centers remain within
 * the middle seventy percent of their owning cell.
 */
function aquaticPatchSpeciesRoll(seed: string | number, habitat: AquaticFloraHabitat, x: number, z: number) {
  // Species groupings sit inside the broader fertility pockets. Keeping them
  // at roughly half that scale prevents one large bed from biasing a region's
  // established habitat mix while retaining organic same-species neighbors.
  const scale = Math.max(4.5, AQUATIC_FLORA_PATCH_SCALE[habitat] * .42);
  const cellX = Math.floor(x / scale);
  const cellZ = Math.floor(z / scale);
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestCellX = cellX;
  let nearestCellZ = cellZ;
  for (let offsetX = -1; offsetX <= 1; offsetX += 1) for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
    const candidateX = cellX + offsetX;
    const candidateZ = cellZ + offsetZ;
    const centerX = (candidateX + .15 + aquaticPatchHash(seed, `submerged-center-x:${habitat}:${candidateX},${candidateZ}`) * .7) * scale;
    const centerZ = (candidateZ + .15 + aquaticPatchHash(seed, `submerged-center-z:${habitat}:${candidateX},${candidateZ}`) * .7) * scale;
    const dx = x - centerX;
    const dz = z - centerZ;
    const distance = dx * dx + dz * dz;
    if (distance >= nearestDistance) continue;
    nearestDistance = distance;
    nearestCellX = candidateX;
    nearestCellZ = candidateZ;
  }
  return aquaticPatchHash(seed, `submerged-species-bed:${habitat}:${nearestCellX},${nearestCellZ}`);
}

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
  const roll = hashUnit(seed, `submerged-scatter:${x},${z}`);
  if (roll >= aquaticPatchSpawnChance(seed, habitat, x, z)) return [];
  const patchSpecies = aquaticPatchSpeciesRoll(seed, habitat, x, z);
  const localSpecies = hashUnit(seed, `submerged-species-local:${habitat}:${x},${z}`);
  const breaksPatch = hashUnit(seed, `submerged-species-mix:${habitat}:${x},${z}`) > .88;
  const block = pickAquaticFlora(AQUATIC_FLORA_HABITAT_WEIGHTS[habitat], breaksPatch ? localSpecies : patchSpecies);
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
export type TreePlanOptions = Readonly<{
  /** Lets wide buttress roots meet the real terrain instead of hovering beside a slope. */
  groundYAt?: (x: number, z: number) => number;
  /** Prevents a wide root foot from being authored onto water, sand, or bare rock. */
  canRootAt?: (x: number, z: number) => boolean;
  /** Optional authored override used by landmark trees; ordinary trees derive it from the seed. */
  crownFullness?: number;
}>;

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
  options: TreePlanOptions = {},
): TreePlanBlock[] {
  const blocks = new Map<string, TreePlanBlock>();
  const set = (x: number, y: number, z: number, block: BlockId) => blocks.set(`${x},${y},${z}`, { x, y, z, block });
  const setLeaf = (x: number, y: number, z: number) => {
    const key = `${x},${y},${z}`;
    if (blocks.get(key)?.block !== log) blocks.set(key, { x, y, z, block: leaves });
  };
  const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
  const fullness = clamp01(options.crownFullness ?? (0.78 + hashUnit(seed, "tree-fullness") * 0.22));
  const trunkHeight = form === "ancient"
    ? 9 + Math.floor(hashUnit(seed, "tree-height") * 3)
    : form === "layered"
      ? 7 + Math.floor(hashUnit(seed, "tree-height") * 2)
      : form === "windswept"
        ? 6 + Math.floor(hashUnit(seed, "tree-height") * 2)
        : 5 + Math.floor(hashUnit(seed, "tree-height") * 3);
  const trunkTop = origin.y + trunkHeight - 1;
  const cardinals = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  const directions = [...cardinals, [1, 1], [-1, 1], [1, -1], [-1, -1]] as const;
  const setLogColumn = (x: number, z: number, bottomY: number, topY: number) => {
    for (let y = Math.min(bottomY, topY); y <= Math.max(bottomY, topY); y += 1) set(x, y, z, log);
  };
  const setBranch = (start: Readonly<{ x: number; y: number; z: number }>, dx: number, dz: number, length: number, riseEvery = 0) => {
    const cursor = { ...start };
    set(cursor.x, cursor.y, cursor.z, log);
    for (let step = 1; step <= length; step += 1) {
      cursor.x += dx;
      cursor.z += dz;
      set(cursor.x, cursor.y, cursor.z, log);
      if (riseEvery > 0 && step % riseEvery === 0) {
        cursor.y += 1;
        set(cursor.x, cursor.y, cursor.z, log);
      }
    }
    return cursor;
  };
  const fillCrownLayer = (centerX: number, y: number, centerZ: number, radiusX: number, radiusZ: number, salt: string, trim = 0) => {
    const maxX = Math.ceil(radiusX);
    const maxZ = Math.ceil(radiusZ);
    for (let dz = -maxZ; dz <= maxZ; dz += 1) for (let dx = -maxX; dx <= maxX; dx += 1) {
      const normalized = (dx * dx) / Math.max(0.25, radiusX * radiusX) + (dz * dz) / Math.max(0.25, radiusZ * radiusZ);
      if (normalized > 1.04) continue;
      // Variation is restricted to the outside ring. The crown core is solid,
      // so random art direction can never create an isolated leaf island.
      const edge = normalized > 0.7;
      const edgeTrim = trim + (1 - fullness) * 0.5;
      if (edge && hashUnit(seed, `${salt}:${dx},${dz}`) < edgeTrim) continue;
      setLeaf(centerX + dx, y, centerZ + dz);
    }
  };

  setLogColumn(origin.x, origin.z, origin.y, trunkTop);
  let crownX = origin.x;
  let crownZ = origin.z;

  if (form === "rounded") {
    const longBranch = Math.floor(hashUnit(seed, "rounded-long-branch") * cardinals.length);
    for (const [index, [dx, dz]] of cardinals.entries()) {
      setBranch({ x: origin.x, y: trunkTop - 2 + (index % 2), z: origin.z }, dx, dz, index === longBranch ? 2 : 1);
    }
  } else if (form === "layered") {
    for (const [dx, dz] of cardinals) {
      setBranch({ x: origin.x, y: trunkTop - 4, z: origin.z }, dx, dz, 2);
      setBranch({ x: origin.x, y: trunkTop - 1, z: origin.z }, dx, dz, 1);
    }
    // The narrow crown peak is supported by wood rather than a detached leaf
    // cap, a common source of the old floating pieces.
    set(origin.x, trunkTop + 1, origin.z, log);
  } else if (form === "windswept") {
    const [windX, windZ] = cardinals[Math.floor(hashUnit(seed, "windswept-direction") * cardinals.length)];
    const tip = setBranch({ x: origin.x, y: trunkTop - 3, z: origin.z }, windX, windZ, 3, 2);
    crownX = tip.x - windX;
    crownZ = tip.z - windZ;
    // A short counterweight makes the silhouette plausible without creating a
    // second disconnected crown.
    setBranch({ x: origin.x, y: trunkTop - 2, z: origin.z }, -windX, -windZ, 1);
  } else {
    // Ancient trees use terrain-aware, tapered buttresses. Each column meets
    // soil when terrain data is available and joins the central trunk by y+2.
    for (const [dx, dz] of cardinals) {
      if (options.canRootAt && !options.canRootAt(origin.x + dx, origin.z + dz)) continue;
      const measuredGround = options.groundYAt?.(origin.x + dx, origin.z + dz);
      const desiredBase = Number.isFinite(measuredGround) ? Math.round(measuredGround!) + 1 : origin.y;
      if (Math.abs(desiredBase - origin.y) <= 2) setLogColumn(origin.x + dx, origin.z + dz, desiredBase, origin.y + 2);
    }
    if (fullness > 0.9) for (const [dx, dz] of directions.slice(4)) {
      if (options.canRootAt && !options.canRootAt(origin.x + dx, origin.z + dz)) continue;
      const measuredGround = options.groundYAt?.(origin.x + dx, origin.z + dz);
      const desiredBase = Number.isFinite(measuredGround) ? Math.round(measuredGround!) + 1 : origin.y;
      if (Math.abs(desiredBase - origin.y) <= 1) setLogColumn(origin.x + dx, origin.z + dz, desiredBase, origin.y + 1);
    }
    for (const [index, [dx, dz]] of cardinals.entries()) {
      setBranch({ x: origin.x, y: trunkTop - 3 + (index % 2), z: origin.z }, dx, dz, 2 + (hashUnit(seed, `ancient-branch:${index}`) > 0.55 ? 1 : 0), 2);
    }
  }

  if (form === "rounded") {
    fillCrownLayer(crownX, trunkTop - 2, crownZ, 2.8, 2.8, "rounded:-2", 0.04);
    fillCrownLayer(crownX, trunkTop - 1, crownZ, 3.2, 3.2, "rounded:-1", 0.03);
    fillCrownLayer(crownX, trunkTop, crownZ, 3.15, 3.15, "rounded:0", 0.02);
    fillCrownLayer(crownX, trunkTop + 1, crownZ, 2.45, 2.45, "rounded:1", 0.03);
    fillCrownLayer(crownX, trunkTop + 2, crownZ, 1.35, 1.35, "rounded:2", 0.02);
  } else if (form === "layered") {
    fillCrownLayer(crownX, trunkTop - 4, crownZ, 3.7, 3.7, "layered:-4", 0.06);
    fillCrownLayer(crownX, trunkTop - 3, crownZ, 2.9, 2.9, "layered:-3", 0.05);
    fillCrownLayer(crownX, trunkTop - 2, crownZ, 1.9, 1.9, "layered:-2", 0.03);
    fillCrownLayer(crownX, trunkTop - 1, crownZ, 3.05, 3.05, "layered:-1", 0.06);
    fillCrownLayer(crownX, trunkTop, crownZ, 2.25, 2.25, "layered:0", 0.04);
    fillCrownLayer(crownX, trunkTop + 1, crownZ, 1.45, 1.45, "layered:1", 0.02);
    fillCrownLayer(crownX, trunkTop + 2, crownZ, 0.8, 0.8, "layered:2");
  } else if (form === "windswept") {
    const stretchedOnX = crownX !== origin.x;
    const radiusX = stretchedOnX ? 3.8 : 2.5;
    const radiusZ = stretchedOnX ? 2.5 : 3.8;
    fillCrownLayer(crownX, trunkTop - 2, crownZ, radiusX, radiusZ, "windswept:-2", 0.08);
    fillCrownLayer(crownX, trunkTop - 1, crownZ, radiusX, radiusZ, "windswept:-1", 0.06);
    fillCrownLayer(crownX, trunkTop, crownZ, radiusX - 0.45, radiusZ - 0.45, "windswept:0", 0.04);
    fillCrownLayer(crownX, trunkTop + 1, crownZ, Math.max(1.6, radiusX - 1.35), Math.max(1.6, radiusZ - 1.35), "windswept:1", 0.03);
  } else {
    fillCrownLayer(crownX, trunkTop - 3, crownZ, 4.45, 4.45, "ancient:-3", 0.05);
    fillCrownLayer(crownX, trunkTop - 2, crownZ, 4.65, 4.65, "ancient:-2", 0.04);
    fillCrownLayer(crownX, trunkTop - 1, crownZ, 4.4, 4.4, "ancient:-1", 0.03);
    fillCrownLayer(crownX, trunkTop, crownZ, 4.0, 4.0, "ancient:0", 0.03);
    fillCrownLayer(crownX, trunkTop + 1, crownZ, 3.55, 3.55, "ancient:1", 0.03);
    fillCrownLayer(crownX, trunkTop + 2, crownZ, 2.75, 2.75, "ancient:2", 0.02);
    fillCrownLayer(crownX, trunkTop + 3, crownZ, 1.55, 1.55, "ancient:3", 0.01);
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
