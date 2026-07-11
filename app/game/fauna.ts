import * as THREE from "three";
import { BiomeId } from "./world";
import type { BirdKind, MobKind } from "./mobs";

const TAU = Math.PI * 2;

export function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export type StableSteeringState = {
  heading: number;
  targetHeading: number;
  avoidanceHold: number;
  blockedFrames: number;
  avoidanceSequence: number;
};

export type StableSteeringInput = {
  dt: number;
  turnRate: number;
  blocked: boolean;
  mobId: number;
  desiredHeading?: number;
};

export function createStableSteering(heading = 0): StableSteeringState {
  const normalized = normalizeAngle(heading);
  return { heading: normalized, targetHeading: normalized, avoidanceHold: 0, blockedFrames: 0, avoidanceSequence: 0 };
}

/**
 * Holds one avoidance choice long enough for a creature to translate around an
 * obstacle. Re-rolling a heading on every blocked frame is what caused large
 * Ridgebacks to rapidly twitch left and right without making progress.
 */
export function updateStableSteering(state: StableSteeringState, input: StableSteeringInput): StableSteeringState {
  const dt = Math.max(0, Math.min(input.dt, 0.1));
  let targetHeading = state.targetHeading;
  let avoidanceHold = Math.max(0, state.avoidanceHold - dt);
  const blockedFrames = input.blocked ? state.blockedFrames + 1 : 0;
  let avoidanceSequence = state.avoidanceSequence;

  if (!input.blocked && input.desiredHeading !== undefined && avoidanceHold <= 0) targetHeading = normalizeAngle(input.desiredHeading);
  if (input.blocked && avoidanceHold <= 0) {
    // A stable per-encounter side prevents tiny collision differences from
    // alternating the animal's turn direction across adjacent frames.
    const side = ((input.mobId * 31 + avoidanceSequence * 17) & 1) === 0 ? -1 : 1;
    const turn = 0.96 + ((input.mobId + avoidanceSequence) % 4) * 0.17;
    targetHeading = normalizeAngle(state.heading + side * turn);
    avoidanceHold = 0.78 + (input.mobId % 3) * 0.11;
    avoidanceSequence += 1;
  }

  const delta = normalizeAngle(targetHeading - state.heading);
  const deadZone = 0.012;
  const maxStep = Math.max(0, input.turnRate) * dt;
  const heading = Math.abs(delta) <= deadZone
    ? targetHeading
    : normalizeAngle(state.heading + THREE.MathUtils.clamp(delta, -maxStep, maxStep));
  if (!Number.isFinite(heading) || !Number.isFinite(targetHeading)) return createStableSteering(0);
  return { heading, targetHeading, avoidanceHold, blockedFrames, avoidanceSequence };
}

export type BirdMode = "forage" | "perch" | "takeoff" | "flight" | "flee";
export type BirdBehaviorState = {
  kind: BirdKind;
  mode: BirdMode;
  timer: number;
  perchId: string | null;
  altitude: number;
  wingPhase: number;
};

export type BirdStimulus = {
  dt: number;
  distanceToHuman: number;
  humanSpeed: number;
  attacked: boolean;
  perchId?: string | null;
  perchHeight?: number;
  onGround: boolean;
  random?: number;
};

export function createBirdBehavior(kind: BirdKind, phase = 0): BirdBehaviorState {
  return { kind, mode: "perch", timer: 1.5, perchId: null, altitude: 0.15, wingPhase: phase % TAU };
}

/** Pure state transition helper shared by both bird variants. */
export function updateBirdBehavior(state: BirdBehaviorState, stimulus: BirdStimulus): BirdBehaviorState {
  const dt = Math.max(0, Math.min(stimulus.dt, 0.1));
  const random = THREE.MathUtils.clamp(stimulus.random ?? 0.5, 0, 1);
  const rushed = stimulus.distanceToHuman < 7 && stimulus.humanSpeed > 2.1;
  const crowded = stimulus.distanceToHuman < 2.8;
  let mode = state.mode;
  let timer = Math.max(0, state.timer - dt);
  let perchId = state.perchId;
  let altitude = state.altitude;

  if (stimulus.attacked || rushed || crowded) {
    mode = state.mode === "perch" || state.mode === "forage" ? "takeoff" : "flee";
    timer = stimulus.attacked ? 6 : 3.2;
    perchId = null;
  } else if (mode === "takeoff" && timer < 2.85) {
    mode = "flee";
  } else if (mode === "flee" && timer <= 0) {
    mode = "flight";
    timer = 2 + random * 2;
  } else if (mode === "flight" && timer <= 0 && stimulus.perchId) {
    mode = "perch";
    timer = 2.5 + random * 5;
    perchId = stimulus.perchId;
  } else if (mode === "perch" && timer <= 0) {
    mode = random < 0.58 ? "forage" : "flight";
    timer = 1.5 + random * 3;
    if (mode === "flight") perchId = null;
  } else if (mode === "forage" && timer <= 0) {
    mode = stimulus.perchId ? "flight" : "forage";
    timer = 1.2 + random * 2.2;
  }

  const targetAltitude = mode === "perch" ? Math.max(0.12, stimulus.perchHeight ?? 0.12)
    : mode === "forage" && stimulus.onGround ? 0.08
      : mode === "takeoff" ? 2.6 : mode === "flee" ? 4.2 : 2.4;
  altitude += (targetAltitude - altitude) * (1 - Math.exp(-dt * (mode === "takeoff" ? 7 : 3.5)));
  const flapRate = mode === "perch" || mode === "forage" ? 2.5 : mode === "flee" ? 18 : 12;
  return { ...state, mode, timer, perchId, altitude, wingPhase: (state.wingPhase + dt * flapRate) % TAU };
}

export type FishHabitat = "ocean" | "deep-ocean" | "river" | "underground";

export type WeightedMob = readonly [kind: MobKind, weight: number];

const OCEAN_FISH: readonly WeightedMob[] = Object.freeze([
  ["shoalfin", 0.3],
  ["silverthread", 0.25],
  ["blue-mackerel", 0.22],
  ["coralback", 0.14],
  ["emberribbon", 0.09],
]);
const DEEP_OCEAN_FISH: readonly WeightedMob[] = Object.freeze([
  ["blue-mackerel", 0.36],
  ["silverthread", 0.27],
  ["shoalfin", 0.18],
  ["coralback", 0.12],
  ["deepwater-shark", 0.07],
]);
const RIVER_FISH: readonly WeightedMob[] = Object.freeze([
  ["brookdart", 0.4],
  ["reedneedle", 0.35],
  ["redfin-salmon", 0.25],
]);
const UNDERGROUND_FISH: readonly WeightedMob[] = Object.freeze([
  ["gloomfin", 0.48],
  ["cavefilament", 0.52],
]);

/** Small immutable tables let the engine choose habitat fish without scanning all mobs. */
export function fishSpawnTableForHabitat(habitat: FishHabitat): readonly WeightedMob[] {
  if (habitat === "ocean") return OCEAN_FISH;
  if (habitat === "deep-ocean") return DEEP_OCEAN_FISH;
  if (habitat === "river") return RIVER_FISH;
  return UNDERGROUND_FISH;
}

export function fishKindsForHabitat(habitat: FishHabitat): MobKind[] {
  return fishSpawnTableForHabitat(habitat).map(([kind]) => kind);
}

/**
 * Searches only the ledges a creature can actually step onto. A top-down world
 * query sees a tree canopy before the floor beneath it and was the main reason
 * short creatures stalled under trees despite having ample headroom.
 */
export function chooseLocalWalkableGround(
  currentGround: number,
  isStandable: (groundY: number) => boolean,
  maxStepUp = 1,
  maxDrop = 1,
) {
  const candidates = [0];
  for (let step = 1; step <= Math.max(0, Math.floor(maxStepUp)); step += 1) candidates.push(step);
  for (let drop = 1; drop <= Math.max(0, Math.floor(maxDrop)); drop += 1) candidates.push(-drop);
  for (const offset of candidates) {
    const candidate = currentGround + offset;
    if (isStandable(candidate)) return candidate;
  }
  return null;
}

function weightedMob(entries: readonly WeightedMob[], roll: number) {
  const normalized = THREE.MathUtils.clamp(Number.isFinite(roll) ? roll : 0.5, 0, 0.999999);
  const total = entries.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
  let cursor = normalized * total;
  for (const [kind, weight] of entries) {
    cursor -= Math.max(0, weight);
    if (cursor < 0) return kind;
  }
  return entries.at(-1)?.[0] ?? "mossling";
}

const SNOW_PASSIVES: readonly WeightedMob[] = Object.freeze([["woolhorn", 0.68], ["canopy-lark", 0.22], ["thimbledeer", 0.1]]);
const DESERT_PASSIVES: readonly WeightedMob[] = Object.freeze([["duneclatter", 0.68], ["emberjay", 0.24], ["pebbletortoise", 0.08]]);
const SAVANNA_PASSIVES: readonly WeightedMob[] = Object.freeze([["sunstep-grazer", 0.46], ["emberjay", 0.2], ["ridgeback", 0.2], ["reedstrider", 0.14]]);
const SILTFEN_PASSIVES: readonly WeightedMob[] = Object.freeze([
  ["mossling", 0.19], ["lanternshell", 0.2], ["puddlehopper", 0.17], ["reedstrider", 0.16],
  ["reed-dragonfly", 0.09], ["pebbletortoise", 0.04], ["canopy-lark", 0.03], ["dewback-tapir", 0.12],
]);
const FOREST_PASSIVES: readonly WeightedMob[] = Object.freeze([
  ["brambleboar", 0.18], ["mossling", 0.16], ["canopy-lark", 0.13], ["thimbledeer", 0.15],
  ["petalfox", 0.14], ["wild-horse", 0.06], ["meadow-cow", 0.03], ["dewback-tapir", 0.09], ["burrowbell", 0.06],
]);
const MUSHROOM_PASSIVES: readonly WeightedMob[] = Object.freeze([["lanternshell", 0.38], ["glowmoth", 0.24], ["puddlehopper", 0.22], ["petalfox", 0.16]]);
const MEADOW_PASSIVES: readonly WeightedMob[] = Object.freeze([
  ["thimbledeer", 0.14], ["petalfox", 0.11], ["puddlehopper", 0.06], ["reedstrider", 0.07],
  ["pebbletortoise", 0.08], ["canopy-lark", 0.08], ["peelop", 0.04], ["ridgeback", 0.1],
  ["wild-horse", 0.12], ["meadow-cow", 0.12], ["burrowbell", 0.08],
]);
const RIVER_PASSIVES: readonly WeightedMob[] = Object.freeze([
  ["reedstrider", 0.3], ["reed-dragonfly", 0.22], ["puddlehopper", 0.18], ["lanternshell", 0.12],
  ["pebbletortoise", 0.1], ["canopy-lark", 0.08],
]);
const CLOUDREED_PASSIVES: readonly WeightedMob[] = Object.freeze([
  ["mistmane", 0.45], ["reed-dragonfly", 0.15], ["reedstrider", 0.12], ["canopy-lark", 0.1],
  ["puddlehopper", 0.1], ["lanternshell", 0.08],
]);
const UPLAND_PASSIVES: readonly WeightedMob[] = Object.freeze([
  ["wild-horse", 0.22], ["sunstep-grazer", 0.14], ["pebbletortoise", 0.12], ["petalfox", 0.1],
  ["thimbledeer", 0.12], ["puddlehopper", 0.04], ["reedstrider", 0.04], ["ridgeback", 0.08], ["burrowbell", 0.14],
]);

/**
 * Ambient table for each surface habitat. Hive Queens and worker Honeybees are
 * deliberately absent: they enter through a Wild Beehive/Apiary resident plan,
 * preventing queen spam and preserving colony ownership.
 */
export function passiveMobSpawnTableForBiome(biome: BiomeId): readonly WeightedMob[] {
  if (biome === BiomeId.Snowfield || biome === BiomeId.Frostpine) {
    return SNOW_PASSIVES;
  }
  if (biome === BiomeId.Desert || biome === BiomeId.Badlands) {
    return DESERT_PASSIVES;
  }
  if (biome === BiomeId.Savanna) {
    return SAVANNA_PASSIVES;
  }
  if (biome === BiomeId.Siltfen) {
    return SILTFEN_PASSIVES;
  }
  if (biome === BiomeId.Bloomwood || biome === BiomeId.Wildwood || biome === BiomeId.Birchlight) {
    return FOREST_PASSIVES;
  }
  if (biome === BiomeId.MushroomFen) {
    return MUSHROOM_PASSIVES;
  }
  if (biome === BiomeId.Meadow) {
    return MEADOW_PASSIVES;
  }
  if (biome === BiomeId.River) return RIVER_PASSIVES;
  if (biome === BiomeId.CloudreedGlen) return CLOUDREED_PASSIVES;
  return UPLAND_PASSIVES;
}

/** Shared bounded passive selector for the complete v0.5 surface catalog. */
export function passiveMobKindForBiome(biome: BiomeId, roll = Math.random()): MobKind {
  return weightedMob(passiveMobSpawnTableForBiome(biome), roll);
}

export const NATURAL_GROUP_RANGES: Readonly<Partial<Record<MobKind, readonly [minimum: number, maximum: number]>>> = Object.freeze({
  "sunstep-grazer": [4, 7],
  "wild-horse": [3, 6],
  "meadow-cow": [4, 7],
  mistmane: [3, 5],
  ridgeback: [2, 4],
  woolhorn: [3, 6],
  shoalfin: [6, 10],
  silverthread: [8, 12],
  reedneedle: [6, 10],
  emberribbon: [4, 8],
  cavefilament: [5, 9],
  brookdart: [3, 6],
  gloomfin: [2, 4],
  coralback: [1, 3],
  "redfin-salmon": [3, 7],
  "blue-mackerel": [6, 11],
  "deepwater-shark": [1, 1],
  burrowbell: [3, 6],
  "dewback-tapir": [2, 4],
  warg: [2, 3],
  "reed-dragonfly": [2, 5],
});

/** Bounded group count; unlisted creatures remain solitary. */
export function naturalGroupSizeForMob(kind: MobKind, roll = Math.random()) {
  const [minimum, maximum] = NATURAL_GROUP_RANGES[kind] ?? [1, 1];
  const normalized = THREE.MathUtils.clamp(Number.isFinite(roll) ? roll : 0.5, 0, 0.999999);
  return minimum + Math.floor(normalized * (maximum - minimum + 1));
}

export type HiveResidentSpawn = Readonly<{ kind: "hive-queen" | "honeybee"; count: number; group: "hive" }>;

/** The only natural queen/worker source: one owned queen plus at most eight workers. */
export function wildHiveResidentSpawnPlan(workerCount: number): readonly HiveResidentSpawn[] {
  const workers = Math.max(0, Math.min(8, Math.floor(workerCount)));
  return Object.freeze([
    { kind: "hive-queen", count: 1, group: "hive" as const },
    ...(workers > 0 ? [{ kind: "honeybee" as const, count: workers, group: "hive" as const }] : []),
  ]);
}

export type PersistenceContext = {
  tamed?: boolean;
  named?: boolean;
  enclosed?: boolean;
  captured?: boolean;
  leashed?: boolean;
  persistentPoiResident?: boolean;
};

/** Tamed, named, caged, leashed, POI-bound, or genuinely enclosed creatures never despawn. */
export function shouldKeepCreatureLoaded(context: PersistenceContext) {
  return Boolean(context.tamed || context.named || context.enclosed || context.captured || context.leashed || context.persistentPoiResident);
}
