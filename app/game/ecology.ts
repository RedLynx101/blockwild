import { BlockId, Item, type ItemCode } from "./data";
import type { MobKind } from "./mobs";

const hashUnit = (seed: string | number, salt: string | number) => {
  const text = `${seed}:${salt}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
};

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

export function planSubmergedFlora(seed: string | number, x: number, bedY: number, z: number, waterDepth: number): SubmergedFloraPlacement[] {
  const depth = Math.max(0, Math.floor(waterDepth));
  if (depth < 2) return [];
  const roll = hashUnit(seed, `submerged:${x},${z}`);
  if (roll < 0.58) return [];
  const block = depth >= 5 && roll > 0.91 ? BlockId.GlowKelp : depth >= 3 && roll > 0.75 ? BlockId.RiverRibbon : BlockId.ReedBloom;
  const height = block === BlockId.GlowKelp ? Math.min(3, depth - 1) : block === BlockId.RiverRibbon ? Math.min(2, depth - 1) : 1;
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
  const trunkHeight = form === "ancient" ? 8 : form === "layered" ? 7 : 5 + Math.floor(hashUnit(seed, "tree-height") * 2);
  for (let dy = 0; dy < trunkHeight; dy += 1) set(origin.x, origin.y + dy, origin.z, log);
  if (form === "windswept") for (let step = 1; step <= 3; step += 1) set(origin.x + step, origin.y + trunkHeight - 2 + Math.floor(step / 2), origin.z, log);
  if (form === "ancient") for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) for (let dy = 0; dy < 3; dy += 1) set(origin.x + dx, origin.y + dy, origin.z + dz, log);
  const centerX = origin.x + (form === "windswept" ? 2 : 0);
  const centerY = origin.y + trunkHeight;
  const layers = form === "layered" ? [[-2, 3], [0, 2], [2, 1]] as const : form === "ancient" ? [[-1, 4], [1, 3], [3, 2]] as const : [[-1, 3], [1, 2], [2, 1]] as const;
  for (const [dy, radius] of layers) for (let dz = -radius; dz <= radius; dz += 1) for (let dx = -radius; dx <= radius; dx += 1) {
    const edge = Math.abs(dx) === radius && Math.abs(dz) === radius;
    if (edge && hashUnit(seed, `leaf-edge:${dx},${dy},${dz}`) < 0.45) continue;
    set(centerX + dx, centerY + dy, origin.z + dz, leaves);
  }
  return [...blocks.values()].sort((left, right) => left.y - right.y || left.z - right.z || left.x - right.x);
}
