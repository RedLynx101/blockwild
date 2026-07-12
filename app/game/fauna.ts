import * as THREE from "three";
import { BiomeId } from "./world";
import type { BirdKind, CoreMobKind, DragonKind, MobKind, TideglassAquaticKind } from "./mobs";

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

/** Pure state transition helper shared by every bird species. */
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

export type FishHabitat = "ocean" | "deep-ocean" | "lumen-trench" | "river" | "underground" | "syrup-pond" | "glimmer-pond";

export type WeightedMob = readonly [kind: MobKind, weight: number];

const OCEAN_FISH: readonly WeightedMob[] = Object.freeze([
  ["shoalfin", 0.27],
  ["silverthread", 0.22],
  ["blue-mackerel", 0.2],
  ["coralback", 0.13],
  ["emberribbon", 0.08],
  ["glassfin", 0.06],
  ["tidepup", 0.04],
]);
const DEEP_OCEAN_FISH: readonly WeightedMob[] = Object.freeze([
  ["blue-mackerel", 0.22],
  ["glassfin", 0.2],
  ["silverthread", 0.16],
  ["lanternjaw", 0.14],
  ["shoalfin", 0.09],
  ["coralback", 0.07],
  ["deepwater-shark", 0.05],
  ["abyss-skater", 0.035],
  ["tidepup", 0.021],
  ["dreadcoil", 0.008],
  ["worldshell-leviathan", 0.004],
  ["aetherbell-leviathan", 0.002],
]);
const LUMEN_TRENCH_FAUNA: readonly WeightedMob[] = Object.freeze([
  ["glassfin", 0.31],
  ["lanternjaw", 0.25],
  ["abyss-skater", 0.17],
  ["aetherbell-larva", 0.13],
  ["tidepup", 0.08],
  ["deepwater-shark", 0.035],
  ["dreadcoil", 0.016],
  ["aetherbell-leviathan", 0.007],
  ["worldshell-leviathan", 0.002],
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
const SYRUP_POND_FISH: readonly WeightedMob[] = Object.freeze([
  ["syrupfin", 1],
]);
const GLIMMER_POND_FISH: readonly WeightedMob[] = Object.freeze([
  ["glowfin", 0.82], ["brookdart", 0.18],
]);

/** Small immutable tables let the engine choose habitat fish without scanning all mobs. */
export function fishSpawnTableForHabitat(habitat: FishHabitat): readonly WeightedMob[] {
  if (habitat === "ocean") return OCEAN_FISH;
  if (habitat === "deep-ocean") return DEEP_OCEAN_FISH;
  if (habitat === "lumen-trench") return LUMEN_TRENCH_FAUNA;
  if (habitat === "river") return RIVER_FISH;
  if (habitat === "syrup-pond") return SYRUP_POND_FISH;
  if (habitat === "glimmer-pond") return GLIMMER_POND_FISH;
  return UNDERGROUND_FISH;
}

export function fishKindsForHabitat(habitat: FishHabitat): MobKind[] {
  return fishSpawnTableForHabitat(habitat).map(([kind]) => kind);
}

/** Weighted selector; callers must not uniformly choose from fishKindsForHabitat. */
export function fishKindForHabitat(habitat: FishHabitat, roll = Math.random()): MobKind {
  return weightedMob(fishSpawnTableForHabitat(habitat), roll);
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

const SNOW_PASSIVES: readonly WeightedMob[] = Object.freeze([["woolhorn", 0.54], ["frostquill", 0.18], ["canopy-lark", 0.04], ["rimehoof-courser", 0.14], ["thimbledeer", 0.1]]);
const DESERT_PASSIVES: readonly WeightedMob[] = Object.freeze([["duneclatter", 0.52], ["emberjay", 0.24], ["sunscar-courser", 0.16], ["pebbletortoise", 0.08]]);
const BEACH_PASSIVES: readonly WeightedMob[] = Object.freeze([
  ["sunwash-crab", 0.58], ["tidewing-gull", 0.3], ["pebbletortoise", 0.08], ["reed-dragonfly", 0.04],
]);
const SAVANNA_PASSIVES: readonly WeightedMob[] = Object.freeze([["sunstep-grazer", 0.46], ["emberjay", 0.2], ["ridgeback", 0.2], ["reedstrider", 0.14]]);
const SILTFEN_PASSIVES: readonly WeightedMob[] = Object.freeze([
  ["mossling", 0.16], ["lanternshell", 0.18], ["puddlehopper", 0.15], ["reedstrider", 0.15],
  ["mirestride-courser", 0.1], ["reed-dragonfly", 0.08], ["pebbletortoise", 0.04], ["canopy-lark", 0.03], ["dewback-tapir", 0.11],
]);
const FOREST_PASSIVES: readonly WeightedMob[] = Object.freeze([
  ["brambleboar", 0.18], ["mossling", 0.16], ["canopy-lark", 0.13], ["thimbledeer", 0.15],
  ["petalfox", 0.12], ["wild-horse", 0.06], ["meadow-cow", 0.03], ["dewback-tapir", 0.09], ["burrowbell", 0.05], ["sakurakit", 0.03],
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
const RAINVEIL_PASSIVES: readonly WeightedMob[] = Object.freeze([
  ["dewback-tapir", 0.2], ["brambleboar", 0.18], ["canopy-lark", 0.16], ["mossling", 0.14],
  ["reed-dragonfly", 0.1], ["petalfox", 0.1], ["puddlehopper", 0.06], ["sakurakit", 0.06],
]);
const SAKURABLOOM_PASSIVES: readonly WeightedMob[] = Object.freeze([
  ["sakurakit", 0.38], ["petalfox", 0.18], ["thimbledeer", 0.14], ["canopy-lark", 0.1],
  ["mossling", 0.08], ["wild-horse", 0.05], ["burrowbell", 0.04], ["reed-dragonfly", 0.03],
]);
const SUGARPLUM_PASSIVES: readonly WeightedMob[] = Object.freeze([
  ["sprinklebug", 0.56], ["taffalo", 0.34], ["reed-dragonfly", 0.06], ["puddlehopper", 0.04],
]);
const GLIMMERWOOD_PASSIVES: readonly WeightedMob[] = Object.freeze([
  ["glimmerhart", 0.28], ["runeowl", 0.18], ["starbough-courser", 0.12], ["mossling", 0.14], ["glowmoth", 0.11],
  ["thimbledeer", 0.07], ["canopy-lark", 0.05], ["petalfox", 0.05],
]);
const SNOWCAP_PASSIVES: readonly WeightedMob[] = Object.freeze([
  ["woolhorn", 0.42], ["copper-mole", 0.18], ["rimehoof-courser", 0.13], ["frostquill", 0.12],
  ["canopy-lark", 0.02], ["thimbledeer", 0.05], ["pebbletortoise", 0.08],
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
  if (biome === BiomeId.Beach) return BEACH_PASSIVES;
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
  if (biome === BiomeId.RainveilJungle) return RAINVEIL_PASSIVES;
  if (biome === BiomeId.SakurabloomGrove) return SAKURABLOOM_PASSIVES;
  if (biome === BiomeId.SugarplumVale) return SUGARPLUM_PASSIVES;
  if (biome === BiomeId.Glimmerwood) return GLIMMERWOOD_PASSIVES;
  if (biome === BiomeId.SnowcapRange) return SNOWCAP_PASSIVES;
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
  "rimehoof-courser": [3, 5],
  "sunscar-courser": [2, 5],
  "mirestride-courser": [2, 4],
  "starbough-courser": [2, 4],
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
  "sunwash-crab": [2, 5],
  "tidewing-gull": [2, 6],
  frostquill: [2, 5],
  glassfin: [5, 10],
  lanternjaw: [1, 3],
  "abyss-skater": [1, 2],
  dreadcoil: [1, 1],
  tidepup: [2, 4],
  sakurakit: [1, 2],
  "worldshell-leviathan": [1, 1],
  "aetherbell-larva": [2, 5],
  "aetherbell-leviathan": [1, 1],
  "taffy-hound": [1, 3],
  "praline-cat": [1, 3],
  sprinklebug: [3, 7],
  taffalo: [2, 5],
  syrupfin: [4, 8],
  glowfin: [4, 9],
  glimmerhart: [2, 4],
  runeowl: [1, 3],
  "copper-mole": [1, 3],
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
  /** Wild and tamed dragons persist as unloaded records even outside simulation range. */
  dragon?: boolean;
};

/** Tamed, named, caged, leashed, POI-bound, enclosed, or draconic creatures never despawn. */
export function shouldKeepCreatureLoaded(context: PersistenceContext) {
  return Boolean(context.tamed || context.named || context.enclosed || context.captured || context.leashed || context.persistentPoiResident || context.dragon);
}

export type LeviathanSpecies = "worldshell-leviathan" | "aetherbell-leviathan";
export type LeviathanStage = "tiny" | "juvenile" | "adult";

export const LEVIATHAN_LIFECYCLE_CONTRACT = Object.freeze({
  schemaVersion: 1 as const,
  ticksPerDay: 24_000,
  worldshellIncubationTicks: 24_000 * 4,
  aetherbellIncubationTicks: 24_000 * 3,
  tinyUntilTicks: 24_000 * 2,
  juvenileUntilTicks: 24_000 * 9,
  adultAtTicks: 24_000 * 9,
  aetherbellMorphSeconds: 3.2,
});

export type LeviathanEggMetadata = Readonly<{
  schemaVersion: 1;
  eggId: string;
  species: LeviathanSpecies;
  geneticSeed: number;
  laidAtTick: number;
  incubationTicks: number;
  submergedTicks: number;
  parentIds: readonly [string | null, string | null];
  customName: string | null;
}>;

export type LeviathanEggItemMetadata = Readonly<{
  schemaVersion: 1;
  kind: "leviathan-egg";
  collectedAtTick: number;
  egg: LeviathanEggMetadata;
}>;

export type LeviathanEggItemCodes = Readonly<{ worldshell: number; aetherbell: number }>;

/** Numeric mapping is injected by data.ts so this pure ecology module stays save-version agnostic. */
export function leviathanEggItemCode(species: LeviathanSpecies, codes: LeviathanEggItemCodes) {
  return species === "worldshell-leviathan" ? codes.worldshell : codes.aetherbell;
}

export function leviathanSpeciesForEggItem(itemCode: number, codes: LeviathanEggItemCodes): LeviathanSpecies | null {
  if (itemCode === codes.worldshell) return "worldshell-leviathan";
  if (itemCode === codes.aetherbell) return "aetherbell-leviathan";
  return null;
}

export type LeviathanGrowthState = Readonly<{
  schemaVersion: 1;
  creatureId: string;
  sourceEggId: string;
  species: LeviathanSpecies;
  kind: "worldshell-leviathan" | "aetherbell-larva" | "aetherbell-leviathan";
  geneticSeed: number;
  ageTicks: number;
  stage: LeviathanStage;
  growthScale: number;
  aquaticOnly: boolean;
  customName: string | null;
  tamed: boolean;
  ownerId: string | null;
  saddled: boolean;
  chestModules: number;
}>;

function safeInteger(value: number, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, Math.floor(value)));
}

function safeTickDelta(value: number, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  if (!Number.isFinite(value)) return minimum;
  return Math.max(minimum, Math.min(maximum, value));
}

function safeIdentifier(value: string, fallback: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9:_-]+/g, "-").slice(0, 96);
  return normalized || fallback;
}

function safeName(value: string | null | undefined) {
  if (!value) return null;
  return value.trim().replace(/\s+/g, " ").slice(0, 48) || null;
}

export function createLeviathanEgg(
  species: LeviathanSpecies,
  options: Readonly<{
    eggId?: string;
    geneticSeed?: number;
    laidAtTick?: number;
    incubationTicks?: number;
    parentIds?: readonly [string | null, string | null];
    customName?: string | null;
  }> = {},
): LeviathanEggMetadata {
  const laidAtTick = safeInteger(options.laidAtTick ?? 0);
  const geneticSeed = safeInteger(options.geneticSeed ?? 0, 0, 0xffff_ffff) >>> 0;
  const defaultIncubation = species === "worldshell-leviathan"
    ? LEVIATHAN_LIFECYCLE_CONTRACT.worldshellIncubationTicks
    : LEVIATHAN_LIFECYCLE_CONTRACT.aetherbellIncubationTicks;
  const parentIds: [string | null, string | null] = [
    options.parentIds?.[0] ? safeIdentifier(options.parentIds[0], "parent-a") : null,
    options.parentIds?.[1] ? safeIdentifier(options.parentIds[1], "parent-b") : null,
  ];
  return {
    schemaVersion: 1,
    eggId: safeIdentifier(options.eggId ?? `${species}:${laidAtTick}:${geneticSeed}`, `${species}:egg`),
    species,
    geneticSeed,
    laidAtTick,
    incubationTicks: safeInteger(options.incubationTicks ?? defaultIncubation, 1),
    submergedTicks: 0,
    parentIds,
    customName: safeName(options.customName),
  };
}

function mixGeneticSeed(left: number, right: number, tick: number) {
  let value = (left ^ Math.imul(right, 0x9e3779b1) ^ tick) >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b) >>> 0;
  value ^= value >>> 13;
  return value >>> 0;
}

/** Two living adults of one species lay one physical, deterministic egg. */
export function layLeviathanEggFromParents(
  first: LeviathanGrowthState,
  second: LeviathanGrowthState,
  laidAtTick: number,
): LeviathanEggMetadata | null {
  if (first.creatureId === second.creatureId || first.species !== second.species || first.stage !== "adult" || second.stage !== "adult") return null;
  const tick = safeInteger(laidAtTick);
  const [left, right] = [first, second].sort((a, b) => a.creatureId.localeCompare(b.creatureId));
  const geneticSeed = mixGeneticSeed(left.geneticSeed, right.geneticSeed, tick);
  return createLeviathanEgg(first.species, {
    eggId: `${first.species}:${left.creatureId}:${right.creatureId}:${tick}`,
    geneticSeed,
    laidAtTick: tick,
    parentIds: [left.creatureId, right.creatureId],
  });
}

/** Breaking an egg turns it into an inventory-safe payload without losing progress or genetics. */
export function collectLeviathanEgg(egg: LeviathanEggMetadata, collectedAtTick: number): LeviathanEggItemMetadata {
  return {
    schemaVersion: 1,
    kind: "leviathan-egg",
    collectedAtTick: safeInteger(collectedAtTick),
    egg: {
      ...egg,
      parentIds: [...egg.parentIds] as [string | null, string | null],
    },
  };
}

/** Replacing an egg restores the exact incubation payload; item time never advances the egg. */
export function placeLeviathanEgg(item: LeviathanEggItemMetadata): LeviathanEggMetadata {
  return {
    ...item.egg,
    parentIds: [...item.egg.parentIds] as [string | null, string | null],
  };
}

function growthScale(stage: LeviathanStage, ageTicks: number) {
  if (stage === "tiny") return 0.08 + 0.17 * Math.min(1, ageTicks / LEVIATHAN_LIFECYCLE_CONTRACT.tinyUntilTicks);
  if (stage === "juvenile") {
    const span = LEVIATHAN_LIFECYCLE_CONTRACT.juvenileUntilTicks - LEVIATHAN_LIFECYCLE_CONTRACT.tinyUntilTicks;
    return 0.25 + 0.75 * Math.min(1, (ageTicks - LEVIATHAN_LIFECYCLE_CONTRACT.tinyUntilTicks) / span);
  }
  return 1;
}

function createLeviathanHatchling(egg: LeviathanEggMetadata): LeviathanGrowthState {
  return {
    schemaVersion: 1,
    creatureId: safeIdentifier(`${egg.eggId}:hatchling`, "leviathan:hatchling"),
    sourceEggId: egg.eggId,
    species: egg.species,
    kind: egg.species === "aetherbell-leviathan" ? "aetherbell-larva" : "worldshell-leviathan",
    geneticSeed: egg.geneticSeed,
    ageTicks: 0,
    stage: "tiny",
    growthScale: 0.08,
    aquaticOnly: true,
    customName: egg.customName,
    tamed: false,
    ownerId: null,
    saddled: false,
    chestModules: 0,
  };
}

export type LeviathanEggStep = Readonly<{
  egg: LeviathanEggMetadata | null;
  hatchling: LeviathanGrowthState | null;
  progressed: boolean;
}>;

/** Incubation advances only while an intact, placed egg remains underwater. */
export function stepLeviathanEgg(
  egg: LeviathanEggMetadata,
  input: Readonly<{ elapsedTicks: number; underwater: boolean; intact?: boolean }>,
): LeviathanEggStep {
  // Simulation frames commonly contribute less than one world tick. Keeping the
  // fractional remainder here prevents incubation from stalling at normal FPS.
  const elapsedTicks = safeTickDelta(input.elapsedTicks);
  if (!input.underwater || input.intact === false || elapsedTicks <= 0) return { egg, hatchling: null, progressed: false };
  const submergedTicks = Math.min(egg.incubationTicks, egg.submergedTicks + elapsedTicks);
  const next = { ...egg, submergedTicks };
  if (submergedTicks < egg.incubationTicks) return { egg: next, hatchling: null, progressed: true };
  return { egg: null, hatchling: createLeviathanHatchling(next), progressed: true };
}

/** Aquatic-only young pause growth out of water; feeding can add bounded bonus growth. */
export function stepLeviathanGrowth(
  state: LeviathanGrowthState,
  input: Readonly<{ elapsedTicks: number; underwater: boolean; fedGrowthTicks?: number }>,
): LeviathanGrowthState {
  const elapsed = state.aquaticOnly && !input.underwater ? 0 : safeTickDelta(input.elapsedTicks);
  const fed = state.aquaticOnly && !input.underwater ? 0 : safeTickDelta(input.fedGrowthTicks ?? 0, 0, LEVIATHAN_LIFECYCLE_CONTRACT.ticksPerDay);
  const ageTicks = safeTickDelta(state.ageTicks + elapsed + fed);
  const stage: LeviathanStage = ageTicks >= LEVIATHAN_LIFECYCLE_CONTRACT.adultAtTicks
    ? "adult"
    : ageTicks >= LEVIATHAN_LIFECYCLE_CONTRACT.tinyUntilTicks ? "juvenile" : "tiny";
  const adult = stage === "adult";
  return {
    ...state,
    ageTicks,
    stage,
    growthScale: growthScale(stage, ageTicks),
    kind: state.species === "aetherbell-leviathan" && adult ? "aetherbell-leviathan"
      : state.species === "aetherbell-leviathan" ? "aetherbell-larva" : "worldshell-leviathan",
    aquaticOnly: !adult,
  };
}

export function bondLeviathan(state: LeviathanGrowthState, ownerId: string): LeviathanGrowthState {
  const owner = safeIdentifier(ownerId, "keeper");
  return { ...state, tamed: true, ownerId: owner };
}

export function saddleLeviathan(state: LeviathanGrowthState, ownerId: string) {
  const allowed = state.stage === "adult" && state.tamed && state.ownerId === safeIdentifier(ownerId, "keeper");
  return { state: allowed ? { ...state, saddled: true } : state, equipped: allowed } as const;
}

export function attachLeviathanChest(state: LeviathanGrowthState, ownerId: string) {
  const limit = state.species === "worldshell-leviathan" ? 6 : 1;
  const allowed = state.stage === "adult" && state.tamed && state.ownerId === safeIdentifier(ownerId, "keeper") && state.chestModules < limit;
  return { state: allowed ? { ...state, chestModules: state.chestModules + 1 } : state, attached: allowed, limit } as const;
}

export type AetherbellMedium = "sea" | "air";
export type AetherbellMorphState = Readonly<{
  schemaVersion: 1;
  medium: AetherbellMedium;
  targetMedium: AetherbellMedium;
  airProgress: number;
  phase: "sea" | "morphing" | "air";
}>;

export function createAetherbellMorphState(medium: AetherbellMedium = "sea"): AetherbellMorphState {
  return { schemaVersion: 1, medium, targetMedium: medium, airProgress: medium === "air" ? 1 : 0, phase: medium };
}

/** Adults take several seconds to fold between swim-bell and sky-sail shapes; larvae are locked to sea form. */
export function stepAetherbellMorph(
  state: AetherbellMorphState,
  input: Readonly<{ elapsedSeconds: number; underwater: boolean; adult: boolean }>,
): AetherbellMorphState {
  const targetMedium: AetherbellMedium = input.adult && !input.underwater ? "air" : "sea";
  const direction = targetMedium === "air" ? 1 : -1;
  const step = Math.max(0, Math.min(1, input.elapsedSeconds / LEVIATHAN_LIFECYCLE_CONTRACT.aetherbellMorphSeconds));
  const airProgress = THREE.MathUtils.clamp(state.airProgress + direction * step, 0, 1);
  const phase = airProgress <= 0 ? "sea" : airProgress >= 1 ? "air" : "morphing";
  const medium = phase === "morphing" ? state.medium : phase;
  return { schemaVersion: 1, medium, targetMedium, airProgress, phase };
}

export type RideableCreatureKind = "wild-horse" | "rimehoof-courser" | "sunscar-courser" | "mirestride-courser" | "starbough-courser" | "deepgear-courser-golem" | "warg" | "reedstrider" | "taffalo" | "worldshell-leviathan" | "aetherbell-leviathan";
export type CreatureMountProfile = Readonly<{
  kind: RideableCreatureKind;
  saddleRequired: true;
  adultRequired: boolean;
  controllable: true;
  cargoChestLimit: number;
  landSpeed: number;
  waterSpeed: number;
  airSpeed: number;
  alignedCannotTame: boolean;
}>;

export const CREATURE_MOUNT_PROFILES: Readonly<Record<RideableCreatureKind, CreatureMountProfile>> = Object.freeze({
  "wild-horse": Object.freeze({ kind: "wild-horse", saddleRequired: true, adultRequired: true, controllable: true, cargoChestLimit: 0, landSpeed: 4.5, waterSpeed: 1.1, airSpeed: 0, alignedCannotTame: false }),
  "rimehoof-courser": Object.freeze({ kind: "rimehoof-courser", saddleRequired: true, adultRequired: true, controllable: true, cargoChestLimit: 0, landSpeed: 4.2, waterSpeed: 1.05, airSpeed: 0, alignedCannotTame: false }),
  "sunscar-courser": Object.freeze({ kind: "sunscar-courser", saddleRequired: true, adultRequired: true, controllable: true, cargoChestLimit: 0, landSpeed: 4.85, waterSpeed: 0.72, airSpeed: 0, alignedCannotTame: false }),
  "mirestride-courser": Object.freeze({ kind: "mirestride-courser", saddleRequired: true, adultRequired: true, controllable: true, cargoChestLimit: 0, landSpeed: 3.75, waterSpeed: 2.25, airSpeed: 0, alignedCannotTame: false }),
  "starbough-courser": Object.freeze({ kind: "starbough-courser", saddleRequired: true, adultRequired: true, controllable: true, cargoChestLimit: 0, landSpeed: 4.55, waterSpeed: 1.15, airSpeed: 0, alignedCannotTame: false }),
  "deepgear-courser-golem": Object.freeze({ kind: "deepgear-courser-golem", saddleRequired: true, adultRequired: false, controllable: true, cargoChestLimit: 0, landSpeed: 4.45, waterSpeed: 0.65, airSpeed: 0, alignedCannotTame: false }),
  warg: Object.freeze({ kind: "warg", saddleRequired: true, adultRequired: true, controllable: true, cargoChestLimit: 0, landSpeed: 4.25, waterSpeed: 1.05, airSpeed: 0, alignedCannotTame: true }),
  reedstrider: Object.freeze({ kind: "reedstrider", saddleRequired: true, adultRequired: true, controllable: true, cargoChestLimit: 0, landSpeed: 3.15, waterSpeed: 4.4, airSpeed: 0, alignedCannotTame: false }),
  taffalo: Object.freeze({ kind: "taffalo", saddleRequired: true, adultRequired: true, controllable: true, cargoChestLimit: 0, landSpeed: 4.1, waterSpeed: 0.75, airSpeed: 0, alignedCannotTame: false }),
  "worldshell-leviathan": Object.freeze({ kind: "worldshell-leviathan", saddleRequired: true, adultRequired: true, controllable: true, cargoChestLimit: 6, landSpeed: 0.12, waterSpeed: 1.28, airSpeed: 0, alignedCannotTame: false }),
  "aetherbell-leviathan": Object.freeze({ kind: "aetherbell-leviathan", saddleRequired: true, adultRequired: true, controllable: true, cargoChestLimit: 1, landSpeed: 0, waterSpeed: 1.45, airSpeed: 2.6, alignedCannotTame: false }),
});

export type CreatureRideContext = Readonly<{
  kind: CoreMobKind;
  tamed: boolean;
  ownerId: string | null;
  riderId: string;
  saddled: boolean;
  baby?: boolean;
  aligned?: boolean;
}>;

export function creatureMountProfile(kind: CoreMobKind): CreatureMountProfile | null {
  return CREATURE_MOUNT_PROFILES[kind as RideableCreatureKind] ?? null;
}

export function canRideCreature(context: CreatureRideContext) {
  const profile = creatureMountProfile(context.kind);
  if (!profile || !context.tamed || !context.saddled || context.ownerId !== safeIdentifier(context.riderId, "keeper")) return false;
  if (profile.adultRequired && context.baby) return false;
  if (profile.alignedCannotTame && context.aligned) return false;
  return true;
}

export const GENERIC_BOND_MOB_KINDS = Object.freeze([
  "wild-horse", "rimehoof-courser", "sunscar-courser", "mirestride-courser", "starbough-courser", "deepgear-courser-golem",
  "warg", "tidepup", "sakurakit", "taffy-hound", "praline-cat", "taffalo",
  "glimmerhart", "runeowl", "copper-mole",
] as const satisfies readonly CoreMobKind[]);

/** One source of truth for the reusable trust/follow/saddle state in the engine and Capture Orbs. */
export function usesGenericCreatureBond(kind: CoreMobKind): kind is (typeof GENERIC_BOND_MOB_KINDS)[number] {
  return GENERIC_BOND_MOB_KINDS.includes(kind as (typeof GENERIC_BOND_MOB_KINDS)[number]);
}

export const SUGARPLUM_MOB_KINDS = Object.freeze([
  "taffy-hound", "praline-cat", "sprinklebug", "taffalo", "syrupfin", "bonbonwing",
] as const satisfies readonly MobKind[]);

/** Dragons are lair-bound POI guardians, never ambient biome spawn-table entries. */
export const DRAGON_MOB_KINDS = Object.freeze([
  "fire-dragon", "ice-dragon", "steel-dragon", "sea-dragon",
] as const satisfies readonly DragonKind[]);

export function isDragonMobKind(kind: MobKind): kind is DragonKind {
  return DRAGON_MOB_KINDS.includes(kind as DragonKind);
}

/** Roster used by biome integration without exposing settlement-only Atlantians as ambient wildlife. */
export const LUMEN_TRENCH_MOB_KINDS: readonly TideglassAquaticKind[] = Object.freeze([
  "glassfin", "lanternjaw", "abyss-skater", "tidepup", "aetherbell-larva", "dreadcoil", "aetherbell-leviathan", "worldshell-leviathan",
]);
