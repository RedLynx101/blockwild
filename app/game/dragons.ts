/**
 * Persistent dragon lifecycle and combat contracts.
 *
 * This module deliberately has no renderer, world, inventory, or React
 * dependency. The engine can therefore save, unload, simulate, and test a
 * dragon without keeping its Three.js model alive. Values are finite and
 * normalized at every public boundary so old or edited save data cannot make
 * an immortal NaN dragon.
 */

export const DRAGON_SCHEMA_VERSION = 1 as const;
export const DRAGON_TICKS_PER_DAY = 24_000;
export const DRAGON_DAYS_PER_STAGE = 25;
export const DRAGON_STAGE_COUNT = 5;
export const DRAGON_FULL_GROWTH_DAYS = DRAGON_DAYS_PER_STAGE * DRAGON_STAGE_COUNT;
export const DRAGON_SCALE_SHED_TICKS = DRAGON_TICKS_PER_DAY * 3;
export const DRAGON_BREED_COOLDOWN_TICKS = DRAGON_TICKS_PER_DAY * 2;
export const DRAGON_EGG_INCUBATION_TICKS = 7_200;

export type DragonType = "fire" | "ice" | "steel" | "sea" | "gold" | "silver";
export type DragonKind = `${DragonType}-dragon`;
export type DragonStage = 1 | 2 | 3 | 4 | 5;
export type DragonSex = "female" | "male";
export type DragonCommand = "follow" | "stay" | "guard-lair" | "wander";
export type DragonArmorSlot = "head" | "neck" | "body" | "tail";
export type DragonAttackKind = "melee" | "breath" | "projectile";
export type DragonAiIntent = "idle" | "return-home" | "guard" | "pursue" | "circle" | "attack" | "flee";
export type DragonDisposition = "passive" | "defensive" | "hostile";

export type DragonPoint = Readonly<{ x: number; y: number; z: number }>;

export type DragonHome = Readonly<{
  lairId: string;
  dimension: string;
  position: DragonPoint;
  guardRadius: number;
}>;

export type DragonEquipment = Readonly<{
  saddle: boolean;
  chests: readonly [boolean, boolean];
  armor: Readonly<Record<DragonArmorSlot, string | null>>;
}>;

export type DragonState = Readonly<{
  schemaVersion: typeof DRAGON_SCHEMA_VERSION;
  dragonId: string;
  type: DragonType;
  sex: DragonSex;
  geneticSeed: number;
  ageTicks: number;
  stage: DragonStage;
  growthScale: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  tamed: boolean;
  ownerId: string | null;
  trust: number;
  command: DragonCommand;
  onShoulder: boolean;
  equipment: DragonEquipment;
  scaleReserve: number;
  scaleShedTicks: number;
  breedCooldownTicks: number;
  customName: string | null;
  home: DragonHome | null;
  /** Dragons can unload into save state, but world cleanup must never erase them. */
  persistent: true;
}>;

export type DragonEgg = Readonly<{
  schemaVersion: typeof DRAGON_SCHEMA_VERSION;
  eggId: string;
  type: DragonType;
  sex: DragonSex;
  geneticSeed: number;
  parentIds: readonly [string | null, string | null];
  laidAtTick: number;
  incubationTicks: number;
  requiredTicks: number;
  wild: boolean;
  lairId: string | null;
}>;

export type DragonSpawnEgg = Readonly<{
  schemaVersion: typeof DRAGON_SCHEMA_VERSION;
  kind: "ready-dragon-spawn-egg";
  preparedAtTick: number;
  egg: DragonEgg;
}>;

export type DragonIncubationEnvironment = Readonly<{
  openFlame?: boolean;
  submerged?: boolean;
  freezing?: boolean;
  heatedMetal?: boolean;
  steam?: boolean;
  livingCoral?: boolean;
  directSunlight?: boolean;
  moonlight?: boolean;
  preciousMetal?: boolean;
  incubator?: boolean;
}>;

export type DragonEggStep = Readonly<{
  egg: DragonEgg | null;
  spawnEgg: DragonSpawnEgg | null;
  hatchling: DragonState | null;
  progressed: boolean;
  condition: string;
}>;

export const DRAGON_TYPES = Object.freeze(["fire", "ice", "steel", "sea", "gold", "silver"] as const);
export const DRAGON_SEXES = Object.freeze(["female", "male"] as const);
export const DRAGON_COMMANDS = Object.freeze(["follow", "stay", "guard-lair", "wander"] as const);
export const DRAGON_ARMOR_SLOTS = Object.freeze(["head", "neck", "body", "tail"] as const);

function clampFinite(value: number, minimum: number, maximum: number, fallback = minimum) {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(minimum, Math.min(maximum, value));
}

function safeInteger(value: number, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) {
  return Math.floor(clampFinite(value, minimum, maximum, minimum));
}

function safeIdentifier(value: unknown, fallback: string) {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().replace(/[^a-zA-Z0-9:_-]+/g, "-").slice(0, 96);
  return normalized || fallback;
}

function safeName(value: unknown) {
  if (typeof value !== "string") return null;
  return value.trim().replace(/\s+/g, " ").slice(0, 48) || null;
}

function isDragonType(value: unknown): value is DragonType {
  return typeof value === "string" && DRAGON_TYPES.includes(value as DragonType);
}

function isDragonSex(value: unknown): value is DragonSex {
  return typeof value === "string" && DRAGON_SEXES.includes(value as DragonSex);
}

function isDragonCommand(value: unknown): value is DragonCommand {
  return typeof value === "string" && DRAGON_COMMANDS.includes(value as DragonCommand);
}

function emptyEquipment(): DragonEquipment {
  return {
    saddle: false,
    chests: [false, false],
    armor: { head: null, neck: null, body: null, tail: null },
  };
}

function safePoint(value: unknown): DragonPoint {
  const point = value && typeof value === "object" ? value as Partial<DragonPoint> : {};
  return {
    x: clampFinite(Number(point.x), -30_000_000, 30_000_000, 0),
    y: clampFinite(Number(point.y), -2_048, 2_048, 0),
    z: clampFinite(Number(point.z), -30_000_000, 30_000_000, 0),
  };
}

function safeHome(value: unknown): DragonHome | null {
  if (!value || typeof value !== "object") return null;
  const home = value as Partial<DragonHome>;
  return {
    lairId: safeIdentifier(home.lairId, "dragon-lair"),
    dimension: safeIdentifier(home.dimension, "overworld"),
    position: safePoint(home.position),
    guardRadius: clampFinite(Number(home.guardRadius), 12, 256, 48),
  };
}

export function dragonStageForAgeTicks(ageTicks: number): DragonStage {
  return Math.min(DRAGON_STAGE_COUNT, Math.floor(Math.max(0, ageTicks) / (DRAGON_TICKS_PER_DAY * DRAGON_DAYS_PER_STAGE)) + 1) as DragonStage;
}

export function dragonAgeDays(state: DragonState) {
  return state.ageTicks / DRAGON_TICKS_PER_DAY;
}

export function dragonKindForType(type: DragonType): DragonKind {
  return `${type}-dragon`;
}

export function dragonTypeForKind(kind: string): DragonType | null {
  const type = kind.endsWith("-dragon") ? kind.slice(0, -"-dragon".length) : "";
  return isDragonType(type) ? type : null;
}

/** Smooth size changes avoid a visible pop on each 25-day stage boundary. */
export function dragonGrowthScale(ageTicks: number) {
  const days = clampFinite(ageTicks / DRAGON_TICKS_PER_DAY, 0, DRAGON_FULL_GROWTH_DAYS, 0);
  const anchors = [0.16, 0.34, 0.64, 1.02, 1.48, 1.82] as const;
  const segment = Math.min(4, Math.floor(days / DRAGON_DAYS_PER_STAGE));
  const progress = (days - segment * DRAGON_DAYS_PER_STAGE) / DRAGON_DAYS_PER_STAGE;
  return anchors[segment] + (anchors[segment + 1] - anchors[segment]) * clampFinite(progress, 0, 1, 0);
}

const TYPE_HEALTH_MULTIPLIER: Readonly<Record<DragonType, number>> = Object.freeze({
  fire: 1, ice: 1.04, steel: 1.14, sea: 1.08, gold: 1.24, silver: 1.2,
});
const STAGE_HEALTH = Object.freeze([0, 34, 88, 188, 328, 500] as const);

export function dragonMaxHealth(type: DragonType, stage: DragonStage, ageTicks = 0) {
  const stageStart = (stage - 1) * DRAGON_DAYS_PER_STAGE * DRAGON_TICKS_PER_DAY;
  const stageProgress = stage === 5
    ? clampFinite((ageTicks - stageStart) / (DRAGON_DAYS_PER_STAGE * DRAGON_TICKS_PER_DAY), 0, 1, 0)
    : clampFinite((ageTicks - stageStart) / (DRAGON_DAYS_PER_STAGE * DRAGON_TICKS_PER_DAY), 0, 1, 0);
  const current = STAGE_HEALTH[stage];
  const next = stage === 5 ? 560 : STAGE_HEALTH[(stage + 1) as DragonStage];
  return Math.round((current + (next - current) * stageProgress) * TYPE_HEALTH_MULTIPLIER[type]);
}

function normalizeEquipment(value: unknown): DragonEquipment {
  const equipment = value && typeof value === "object" ? value as Partial<DragonEquipment> : {};
  const chests = Array.isArray(equipment.chests) ? equipment.chests : [];
  const armor = equipment.armor && typeof equipment.armor === "object" ? equipment.armor as Partial<Record<DragonArmorSlot, unknown>> : {};
  return {
    saddle: equipment.saddle === true,
    chests: [chests[0] === true, chests[1] === true],
    armor: Object.fromEntries(DRAGON_ARMOR_SLOTS.map((slot) => [slot, typeof armor[slot] === "string" ? safeIdentifier(armor[slot], `${slot}-armor`) : null])) as Record<DragonArmorSlot, string | null>,
  };
}

export function createDragonState(
  type: DragonType,
  options: Readonly<{
    dragonId?: string;
    sex?: DragonSex;
    geneticSeed?: number;
    ageDays?: number;
    health?: number;
    tamed?: boolean;
    ownerId?: string | null;
    home?: DragonHome | null;
    customName?: string | null;
  }> = {},
): DragonState {
  const safeType = isDragonType(type) ? type : "fire";
  const seed = safeInteger(options.geneticSeed ?? 0, 0, 0xffff_ffff) >>> 0;
  const ageTicks = safeInteger((options.ageDays ?? 0) * DRAGON_TICKS_PER_DAY, 0);
  const stage = dragonStageForAgeTicks(ageTicks);
  const maxHealth = dragonMaxHealth(safeType, stage, ageTicks);
  const ownerId = options.ownerId ? safeIdentifier(options.ownerId, "dragon-keeper") : null;
  return {
    schemaVersion: DRAGON_SCHEMA_VERSION,
    dragonId: safeIdentifier(options.dragonId ?? `${safeType}:${seed}`, `${safeType}:dragon`),
    type: safeType,
    sex: options.sex ?? ((seed & 1) === 0 ? "female" : "male"),
    geneticSeed: seed,
    ageTicks,
    stage,
    growthScale: dragonGrowthScale(ageTicks),
    health: clampFinite(options.health ?? maxHealth, 0, maxHealth, maxHealth),
    maxHealth,
    alive: (options.health ?? maxHealth) > 0,
    tamed: options.tamed === true,
    ownerId: options.tamed === true ? ownerId : null,
    trust: options.tamed === true ? 3 : 0,
    command: options.tamed === true ? "follow" : "guard-lair",
    onShoulder: false,
    equipment: emptyEquipment(),
    scaleReserve: 0,
    scaleShedTicks: 0,
    breedCooldownTicks: 0,
    customName: safeName(options.customName),
    home: options.home ? safeHome(options.home) : null,
    persistent: true,
  };
}

/** Migration-safe decoder for dragon save metadata. Unknown fields are ignored. */
export function normalizeDragonState(value: unknown): DragonState {
  const input = value && typeof value === "object" ? value as Partial<DragonState> : {};
  const type = isDragonType(input.type) ? input.type : "fire";
  const dragonId = safeIdentifier(input.dragonId, `${type}:dragon`);
  const geneticSeed = safeInteger(Number(input.geneticSeed), 0, 0xffff_ffff) >>> 0;
  const ageTicks = safeInteger(Number(input.ageTicks), 0);
  const stage = dragonStageForAgeTicks(ageTicks);
  const maxHealth = dragonMaxHealth(type, stage, ageTicks);
  const tamed = input.tamed === true;
  const trust = tamed ? 3 : safeInteger(Number(input.trust), 0, 3);
  const ownerId = (tamed || trust > 0) && input.ownerId ? safeIdentifier(input.ownerId, "dragon-keeper") : null;
  const health = clampFinite(Number(input.health), 0, maxHealth, maxHealth);
  return {
    schemaVersion: DRAGON_SCHEMA_VERSION,
    dragonId,
    type,
    sex: isDragonSex(input.sex) ? input.sex : ((geneticSeed & 1) === 0 ? "female" : "male"),
    geneticSeed,
    ageTicks,
    stage,
    growthScale: dragonGrowthScale(ageTicks),
    health,
    maxHealth,
    alive: input.alive !== false && health > 0,
    tamed,
    ownerId,
    trust,
    command: isDragonCommand(input.command) ? input.command : (tamed ? "follow" : "guard-lair"),
    onShoulder: input.onShoulder === true && tamed && stage === 1,
    equipment: normalizeEquipment(input.equipment),
    scaleReserve: safeInteger(Number(input.scaleReserve), 0, stage * 12),
    scaleShedTicks: safeInteger(Number(input.scaleShedTicks), 0, DRAGON_SCALE_SHED_TICKS - 1),
    breedCooldownTicks: safeInteger(Number(input.breedCooldownTicks), 0),
    customName: safeName(input.customName),
    home: safeHome(input.home),
    persistent: true,
  };
}

export function serializeDragonState(state: DragonState): DragonState {
  const normalized = normalizeDragonState(state);
  return {
    ...normalized,
    equipment: {
      ...normalized.equipment,
      chests: [...normalized.equipment.chests] as [boolean, boolean],
      armor: { ...normalized.equipment.armor },
    },
    home: normalized.home ? { ...normalized.home, position: { ...normalized.home.position } } : null,
  };
}

export type DragonStepInput = Readonly<{
  elapsedTicks: number;
  dragonMeals?: number;
}>;

/** Advances age, healing ceiling, cooldowns, and renewable carried scales. */
export function stepDragonState(state: DragonState, input: DragonStepInput): DragonState {
  if (!state.alive) return state;
  // A bounded year still permits sleep/fast-forward and offline catch-up while
  // rejecting corrupt save deltas large enough to overflow progression.
  const elapsedTicks = safeInteger(input.elapsedTicks, 0, DRAGON_TICKS_PER_DAY * 365);
  const meals = safeInteger(input.dragonMeals ?? 0, 0, 64);
  const growthTicks = elapsedTicks + meals * DRAGON_TICKS_PER_DAY;
  const ageTicks = state.ageTicks + growthTicks;
  const stage = dragonStageForAgeTicks(ageTicks);
  const maxHealth = dragonMaxHealth(state.type, stage, ageTicks);
  const gainedCeiling = Math.max(0, maxHealth - state.maxHealth);
  const reserveCap = stage * 12;
  const sheddingStartsAt = DRAGON_DAYS_PER_STAGE * DRAGON_TICKS_PER_DAY;
  const eligibleBefore = Math.max(0, state.ageTicks - sheddingStartsAt);
  const eligibleAfter = Math.max(0, state.ageTicks + elapsedTicks - sheddingStartsAt);
  const shedTotal = state.scaleShedTicks + Math.max(0, eligibleAfter - eligibleBefore);
  const shedCount = Math.floor(shedTotal / DRAGON_SCALE_SHED_TICKS);
  return {
    ...state,
    ageTicks,
    stage,
    growthScale: dragonGrowthScale(ageTicks),
    maxHealth,
    health: Math.min(maxHealth, state.health + gainedCeiling),
    onShoulder: state.onShoulder && stage === 1,
    scaleReserve: Math.min(reserveCap, state.scaleReserve + shedCount),
    scaleShedTicks: shedTotal % DRAGON_SCALE_SHED_TICKS,
    breedCooldownTicks: Math.max(0, state.breedCooldownTicks - elapsedTicks),
  };
}

export type DragonFood = "raw-meat" | "cooked-meat" | "fish" | "dragon-meat";
const FOOD_HEALING: Readonly<Record<DragonFood, number>> = Object.freeze({
  "raw-meat": 8,
  "cooked-meat": 13,
  fish: 5,
  "dragon-meat": 20,
});

export function feedDragon(state: DragonState, food: DragonFood, portions = 1) {
  if (!state.alive) return { state, consumed: 0, healed: 0 } as const;
  const count = safeInteger(portions, 0, 64);
  const missing = Math.max(0, state.maxHealth - state.health);
  if (count === 0 || missing === 0) return { state, consumed: 0, healed: 0 } as const;
  const perPortion = FOOD_HEALING[food];
  const consumed = Math.min(count, Math.ceil(missing / perPortion));
  const healed = Math.min(missing, consumed * perPortion);
  return { state: { ...state, health: state.health + healed }, consumed, healed } as const;
}

/** Three patient meat feeds bond a defensive stage-one hatchling. */
export function bondDragonHatchling(state: DragonState, ownerId: string) {
  if (!state.alive || state.stage !== 1 || state.tamed) return { state, accepted: false, tamed: state.tamed } as const;
  const owner = safeIdentifier(ownerId, "dragon-keeper");
  if (state.ownerId && state.ownerId !== owner) return { state, accepted: false, tamed: false } as const;
  const trust = Math.min(3, state.trust + 1);
  const tamed = trust >= 3;
  return {
    state: { ...state, trust, tamed, ownerId: owner, command: tamed ? "follow" : state.command },
    accepted: true,
    tamed,
  } as const;
}

export function setDragonShoulder(state: DragonState, ownerId: string, carried: boolean, occupiedShoulderSlots = 0) {
  const owner = safeIdentifier(ownerId, "dragon-keeper");
  const allowed = !carried || (
    state.alive && state.stage === 1 && state.tamed && state.ownerId === owner
    && occupiedShoulderSlots < 3 && !state.equipment.saddle && !state.equipment.chests.some(Boolean)
  );
  return { state: allowed ? { ...state, onShoulder: carried } : state, changed: allowed && state.onShoulder !== carried } as const;
}

export function setDragonCommand(state: DragonState, ownerId: string, command: DragonCommand) {
  const allowed = state.tamed && state.ownerId === safeIdentifier(ownerId, "dragon-keeper") && isDragonCommand(command);
  return { state: allowed ? { ...state, command, onShoulder: false } : state, changed: allowed && state.command !== command } as const;
}

export function equipDragonSaddle(state: DragonState, ownerId: string) {
  const allowed = state.alive && state.stage >= 3 && state.tamed && state.ownerId === safeIdentifier(ownerId, "dragon-keeper");
  return {
    state: allowed ? { ...state, equipment: { ...state.equipment, saddle: true }, onShoulder: false } : state,
    equipped: allowed,
  } as const;
}

export function attachDragonChest(state: DragonState, ownerId: string) {
  const allowed = state.alive && state.stage >= 3 && state.tamed && state.ownerId === safeIdentifier(ownerId, "dragon-keeper");
  const index = state.equipment.chests.findIndex((attached) => !attached);
  if (!allowed || index < 0) return { state, attached: false, chestCount: state.equipment.chests.filter(Boolean).length } as const;
  const chests: [boolean, boolean] = [...state.equipment.chests] as [boolean, boolean];
  chests[index] = true;
  return {
    state: { ...state, equipment: { ...state.equipment, chests } },
    attached: true,
    chestCount: chests.filter(Boolean).length,
  } as const;
}

export function equipDragonArmor(state: DragonState, ownerId: string, slot: DragonArmorSlot, armorItemId: string) {
  const allowed = state.alive && state.stage >= 3 && state.tamed && state.ownerId === safeIdentifier(ownerId, "dragon-keeper") && DRAGON_ARMOR_SLOTS.includes(slot);
  if (!allowed) return { state, equipped: false } as const;
  const armor = { ...state.equipment.armor, [slot]: safeIdentifier(armorItemId, `${state.type}-dragon-${slot}-armor`) };
  return { state: { ...state, equipment: { ...state.equipment, armor } }, equipped: true } as const;
}

export function dragonCargoSlots(state: DragonState) {
  return state.equipment.chests.filter(Boolean).length * 18;
}

export function harvestDragonScales(state: DragonState, amount = Number.MAX_SAFE_INTEGER) {
  const taken = Math.min(state.scaleReserve, safeInteger(amount, 0));
  return { state: { ...state, scaleReserve: state.scaleReserve - taken }, taken } as const;
}

export function canMountDragon(state: DragonState, ownerId: string) {
  return state.alive && state.stage >= 3 && state.tamed && state.ownerId === safeIdentifier(ownerId, "dragon-keeper") && state.equipment.saddle;
}

export type DragonPersistenceDecision = Readonly<{
  loaded: boolean;
  persistInSave: true;
  deleteFromWorld: false;
  reason: "nearby" | "mounted" | "shoulder" | "unloaded-distance";
}>;

export function dragonPersistenceDecision(state: DragonState, distanceFromPlayer: number, unloadDistance = 192): DragonPersistenceDecision {
  if (state.onShoulder) return { loaded: true, persistInSave: true, deleteFromWorld: false, reason: "shoulder" };
  if (state.equipment.saddle && state.tamed && distanceFromPlayer < 4) return { loaded: true, persistInSave: true, deleteFromWorld: false, reason: "mounted" };
  if (distanceFromPlayer <= unloadDistance) return { loaded: true, persistInSave: true, deleteFromWorld: false, reason: "nearby" };
  return { loaded: false, persistInSave: true, deleteFromWorld: false, reason: "unloaded-distance" };
}

/** World cleanup is intentionally unable to erase a dragon record. */
export function shouldPermanentlyDeleteDragon(state: DragonState) {
  void state;
  return false;
}

function mixSeed(...values: number[]) {
  let value = 0x9e3779b9;
  for (const next of values) {
    value = (value ^ Math.imul(next | 0, 0x85ebca6b)) >>> 0;
    value ^= value >>> 13;
    value = Math.imul(value, 0xc2b2ae35) >>> 0;
  }
  return (value ^ (value >>> 16)) >>> 0;
}

export function canBreedDragons(first: DragonState, second: DragonState) {
  return first.dragonId !== second.dragonId
    && first.alive && second.alive
    && first.type === second.type
    && first.sex !== second.sex
    && first.stage >= 3 && second.stage >= 3
    && first.breedCooldownTicks <= 0 && second.breedCooldownTicks <= 0;
}

export function createDragonEgg(
  type: DragonType,
  options: Readonly<{
    eggId?: string;
    geneticSeed?: number;
    sex?: DragonSex;
    parentIds?: readonly [string | null, string | null];
    laidAtTick?: number;
    wild?: boolean;
    lairId?: string | null;
  }> = {},
): DragonEgg {
  const laidAtTick = safeInteger(options.laidAtTick ?? 0);
  const geneticSeed = safeInteger(options.geneticSeed ?? 0, 0, 0xffff_ffff) >>> 0;
  return {
    schemaVersion: DRAGON_SCHEMA_VERSION,
    eggId: safeIdentifier(options.eggId ?? `${type}:egg:${laidAtTick}:${geneticSeed}`, `${type}:egg`),
    type,
    sex: options.sex ?? ((geneticSeed & 1) === 0 ? "female" : "male"),
    geneticSeed,
    parentIds: [
      options.parentIds?.[0] ? safeIdentifier(options.parentIds[0], "parent-a") : null,
      options.parentIds?.[1] ? safeIdentifier(options.parentIds[1], "parent-b") : null,
    ],
    laidAtTick,
    incubationTicks: 0,
    requiredTicks: DRAGON_EGG_INCUBATION_TICKS,
    wild: options.wild === true,
    lairId: options.lairId ? safeIdentifier(options.lairId, "dragon-lair") : null,
  };
}

export function breedDragons(first: DragonState, second: DragonState, nowTick: number, catalystType: DragonType) {
  if (!canBreedDragons(first, second) || catalystType !== first.type) return { parents: [first, second] as const, egg: null } as const;
  const ordered = [first, second].sort((left, right) => left.dragonId.localeCompare(right.dragonId));
  const tick = safeInteger(nowTick);
  const seed = mixSeed(ordered[0].geneticSeed, ordered[1].geneticSeed, tick);
  const female = first.sex === "female" ? first : second;
  const egg = createDragonEgg(first.type, {
    eggId: `${first.type}:egg:${ordered[0].dragonId}:${ordered[1].dragonId}:${tick}`,
    geneticSeed: seed,
    parentIds: [ordered[0].dragonId, ordered[1].dragonId],
    laidAtTick: tick,
    lairId: female.home?.lairId ?? null,
  });
  const cool = (dragon: DragonState): DragonState => ({ ...dragon, breedCooldownTicks: DRAGON_BREED_COOLDOWN_TICKS });
  return { parents: [cool(first), cool(second)] as const, egg } as const;
}

export function dragonEggCondition(type: DragonType, environment: DragonIncubationEnvironment) {
  if (environment.incubator) return { met: true, description: "Incubator stabilized" } as const;
  if (type === "fire") return { met: environment.openFlame === true, description: "Keep the egg in an open flame" } as const;
  if (type === "ice") return { met: environment.submerged === true && environment.freezing === true, description: "Submerge the egg in freezing water" } as const;
  if (type === "sea") return { met: environment.submerged === true && environment.livingCoral === true, description: "Submerge the egg beside living coral" } as const;
  if (type === "gold") return { met: environment.directSunlight === true && environment.preciousMetal === true, description: "Rest the egg on gilded stone beneath direct sunlight" } as const;
  if (type === "silver") return { met: environment.moonlight === true && environment.preciousMetal === true, description: "Rest the egg on argent stone beneath moonlight" } as const;
  return { met: environment.heatedMetal === true && environment.steam === true, description: "Rest the egg on heated metal in active steam" } as const;
}

function hatchDragon(egg: DragonEgg): DragonState {
  return createDragonState(egg.type, {
    dragonId: `${egg.eggId}:hatchling`,
    geneticSeed: egg.geneticSeed,
    sex: egg.sex,
    ageDays: 0,
    home: egg.lairId ? { lairId: egg.lairId, dimension: "overworld", position: { x: 0, y: 0, z: 0 }, guardRadius: 32 } : null,
  });
}

/**
 * Natural incubation hatches in place. An incubator instead returns a stable
 * spawn-egg payload so the player chooses where the hatchling enters the world.
 */
export function stepDragonEgg(egg: DragonEgg, elapsedTicks: number, environment: DragonIncubationEnvironment, nowTick = 0): DragonEggStep {
  const condition = dragonEggCondition(egg.type, environment);
  const delta = safeInteger(elapsedTicks, 0, egg.requiredTicks);
  if (!condition.met || delta === 0) return { egg, spawnEgg: null, hatchling: null, progressed: false, condition: condition.description };
  const incubationTicks = Math.min(egg.requiredTicks, egg.incubationTicks + delta);
  const next = { ...egg, incubationTicks };
  if (incubationTicks < egg.requiredTicks) return { egg: next, spawnEgg: null, hatchling: null, progressed: true, condition: condition.description };
  if (environment.incubator) {
    return {
      egg: null,
      spawnEgg: { schemaVersion: DRAGON_SCHEMA_VERSION, kind: "ready-dragon-spawn-egg", preparedAtTick: safeInteger(nowTick), egg: next },
      hatchling: null,
      progressed: true,
      condition: condition.description,
    };
  }
  return { egg: null, spawnEgg: null, hatchling: hatchDragon(next), progressed: true, condition: condition.description };
}

export function placeDragonSpawnEgg(spawnEgg: DragonSpawnEgg) {
  return hatchDragon(spawnEgg.egg);
}

export type DragonAttackPlan = Readonly<{
  kind: DragonAttackKind;
  damage: number;
  range: number;
  cooldownSeconds: number;
  velocity: number;
  color: number;
  secondaryColor: number;
  shape: "bite-claw" | "cone-stream" | "fireball" | "ice-shard" | "metal-spear" | "brine-lance" | "solar-disc" | "moon-crescent";
  status: "burning" | "slowed" | "scalded" | "knockback";
  statusSeconds: number;
  sound: string;
  particles: readonly number[];
}>;

const TYPE_COLORS: Readonly<Record<DragonType, readonly [number, number]>> = Object.freeze({
  fire: [0xf05a35, 0xffd15c],
  ice: [0x7fd9ff, 0xe9fbff],
  steel: [0x83939b, 0xd8edf0],
  sea: [0x43b9c6, 0xc5ffff],
  gold: [0xffb51b, 0xfff4a8],
  silver: [0x9fb9d8, 0xf8fdff],
});

export function dragonAttackPlan(type: DragonType, stage: DragonStage, kind: DragonAttackKind): DragonAttackPlan {
  const [color, secondaryColor] = TYPE_COLORS[type];
  const base = stage * (type === "gold" ? 9.25 : type === "silver" ? 8.9 : type === "steel" ? 8.2 : type === "fire" ? 8.6 : type === "sea" ? 8.1 : 8);
  if (kind === "melee") {
    return {
      kind, damage: Math.round(base * 1.08), range: 1.8 + stage * 0.72, cooldownSeconds: Math.max(0.58, 1.2 - stage * 0.08), velocity: 0,
      color, secondaryColor, shape: "bite-claw", status: "knockback", statusSeconds: 0.35 + stage * 0.1,
      sound: `${type}-dragon-melee`, particles: [color, secondaryColor],
    };
  }
  if (kind === "breath") {
    return {
      kind, damage: Math.round(base * 0.68), range: 6 + stage * 2.15, cooldownSeconds: Math.max(3.4, 6.2 - stage * 0.35), velocity: 12 + stage * 1.5,
      color, secondaryColor, shape: "cone-stream", status: type === "fire" || type === "gold" ? "burning" : type === "ice" || type === "sea" || type === "silver" ? "slowed" : "scalded",
      statusSeconds: 1.5 + stage * 0.55, sound: `${type}-dragon-breath`, particles: type === "steel" ? [0xd8edf0, 0x9fb4bb, 0xffffff] : [color, secondaryColor, 0xffffff],
    };
  }
  const shape = type === "gold" ? "solar-disc" : type === "silver" ? "moon-crescent" : type === "steel" ? "metal-spear" : type === "ice" ? "ice-shard" : type === "sea" ? "brine-lance" : "fireball";
  return {
    kind, damage: Math.round(base * (type === "gold" ? 1.32 : type === "silver" ? 1.2 : type === "steel" ? 1.25 : type === "sea" ? 1.02 : 0.92)), range: type === "gold" || type === "silver" ? 38 + stage * 4.2 : type === "steel" ? 34 + stage * 4 : type === "sea" ? 26 + stage * 3.5 : 18 + stage * 3,
    cooldownSeconds: type === "gold" || type === "silver" ? Math.max(4.8, 8.1 - stage * 0.42) : type === "steel" ? Math.max(4.6, 7.8 - stage * 0.4) : type === "sea" ? Math.max(3.8, 6.2 - stage * 0.32) : Math.max(3.2, 5.4 - stage * 0.3),
    velocity: type === "gold" ? 34 + stage * 3.2 : type === "silver" ? 38 + stage * 3.4 : type === "steel" ? 28 + stage * 3 : type === "sea" ? 31 + stage * 2.6 : 18 + stage * 2.4, color, secondaryColor, shape,
    status: type === "fire" || type === "gold" ? "burning" : type === "ice" || type === "sea" || type === "silver" ? "slowed" : "knockback", statusSeconds: 1 + stage * 0.35,
    sound: `${type}-dragon-projectile`, particles: [color, secondaryColor],
  };
}

export type DragonCombatContext = Readonly<{
  distance: number;
  altitudeDelta: number;
  lineOfSight: boolean;
  friendlyFireRisk?: boolean;
  airborne?: boolean;
  meleeReady?: boolean;
  breathReady?: boolean;
  projectileReady?: boolean;
}>;

export function chooseDragonAttack(state: DragonState, context: DragonCombatContext): DragonAttackPlan | null {
  if (!state.alive) return null;
  const distance = Math.max(0, context.distance);
  const melee = dragonAttackPlan(state.type, state.stage, "melee");
  if (context.meleeReady !== false && distance <= melee.range) return melee;
  if (!context.lineOfSight || context.friendlyFireRisk) return null;
  const projectile = dragonAttackPlan(state.type, state.stage, "projectile");
  const breath = dragonAttackPlan(state.type, state.stage, "breath");
  if (state.stage >= 2 && context.projectileReady !== false && distance > breath.range * 0.72 && distance <= projectile.range) return projectile;
  if (context.breathReady !== false && state.stage >= 2 && distance <= breath.range) return breath;
  if (state.stage >= 2 && context.projectileReady !== false && distance <= projectile.range) return projectile;
  return null;
}

export const DRAGON_RIDER_CONTROLS = Object.freeze({ melee: "KeyZ", breath: "KeyX", projectile: "KeyC" } as const);

export function riderDragonAttack(state: DragonState, riderId: string, controlCode: string) {
  if (!canMountDragon(state, riderId)) return null;
  const entry = Object.entries(DRAGON_RIDER_CONTROLS).find(([, code]) => code === controlCode);
  return entry ? dragonAttackPlan(state.type, state.stage, entry[0] as DragonAttackKind) : null;
}

export type DragonAiContext = Readonly<{
  distanceFromHome: number;
  distanceToTarget: number | null;
  lineOfSight: boolean;
  healthRatio: number;
  defendingEggs?: boolean;
  targetThreateningOwner?: boolean;
  provoked?: boolean;
}>;

/** Hatchlings never hunt: they defend only after provocation. */
export function dragonDisposition(state: DragonState, provoked = false): DragonDisposition {
  if (state.stage === 1) return provoked ? "defensive" : "passive";
  return state.tamed ? "defensive" : "hostile";
}

export function chooseDragonAiIntent(state: DragonState, context: DragonAiContext): DragonAiIntent {
  if (!state.alive) return "idle";
  if (dragonDisposition(state, context.provoked) === "passive") return "idle";
  if (state.tamed && state.command === "stay") return context.targetThreateningOwner && context.distanceToTarget !== null ? "guard" : "idle";
  if (context.healthRatio < 0.16 && !context.defendingEggs) return "flee";
  const guardRadius = state.home?.guardRadius ?? 48;
  if (context.distanceFromHome > guardRadius * 1.35) return "return-home";
  if (context.distanceToTarget === null) return state.command === "wander" ? "circle" : "idle";
  if (!context.lineOfSight) return "pursue";
  const attack = chooseDragonAttack(state, { distance: context.distanceToTarget, altitudeDelta: 0, lineOfSight: true });
  return attack ? "attack" : "circle";
}

export type DragonLootItem =
  | "RawDragonMeat" | "DragonBone"
  | "FireDragonScale" | "IceDragonScale" | "SteelDragonScale" | "SeaDragonScale"
  | "GoldDragonScale" | "SilverDragonScale"
  | "FireDragonHeart" | "IceDragonHeart" | "SteelDragonHeart" | "SeaDragonHeart"
  | "GoldDragonHeart" | "SilverDragonHeart"
  | "FireDragonSkull" | "IceDragonSkull" | "SteelDragonSkull" | "SeaDragonSkull"
  | "GoldDragonSkull" | "SilverDragonSkull"
  | "FireDragonEgg" | "IceDragonEgg" | "SteelDragonEgg" | "SeaDragonEgg" | "GoldDragonEgg" | "SilverDragonEgg";

export type DragonLoot = Readonly<{
  item: DragonLootItem;
  count: number;
  metadata?: Readonly<Record<string, string | number>>;
}>;

function typeLootItem(type: DragonType, suffix: "Scale" | "Heart" | "Skull" | "Egg") {
  return `${type[0].toUpperCase()}${type.slice(1)}Dragon${suffix}` as DragonLootItem;
}

function seededRoll(seed: number, salt: number) {
  return mixSeed(seed, salt) / 0x1_0000_0000;
}

export function createLairEggClutch(state: DragonState, seed = state.geneticSeed): DragonEgg[] {
  if (state.sex !== "female" || state.stage < 4) return [];
  const count = state.stage === 5 ? 1 + Math.floor(seededRoll(seed, 17) * 3) : 1;
  return Array.from({ length: count }, (_, index) => createDragonEgg(state.type, {
    eggId: `${state.dragonId}:clutch:${index + 1}`,
    geneticSeed: mixSeed(seed, index + 1, state.geneticSeed),
    parentIds: [state.dragonId, null],
    wild: true,
    lairId: state.home?.lairId ?? null,
  }));
}

/** Deterministic corpse/lair loot; large dragons yield materially plentiful stacks. */
export function rollDragonLoot(state: DragonState, seed = state.geneticSeed): DragonLoot[] {
  const stage = state.stage;
  const variance = (salt: number, span: number) => Math.floor(seededRoll(seed, salt) * (span + 1));
  const loot: DragonLoot[] = [
    { item: "RawDragonMeat", count: stage * 4 + variance(1, stage * 2) },
    { item: typeLootItem(state.type, "Scale"), count: stage * 7 + variance(2, stage * 5) },
    { item: "DragonBone", count: stage * 6 + variance(3, stage * 4) },
    { item: typeLootItem(state.type, "Skull"), count: 1, metadata: { type: state.type, stage, sex: state.sex } },
  ];
  if (stage >= 2) loot.push({ item: typeLootItem(state.type, "Heart"), count: 1 });
  const clutch = createLairEggClutch(state, seed);
  if (clutch.length) loot.push({ item: typeLootItem(state.type, "Egg"), count: clutch.length, metadata: { lairId: state.home?.lairId ?? "unknown" } });
  return loot;
}

export type DragonSoundEvent = "ambient" | "roar" | "hurt" | "death" | "wing" | "melee" | "breath" | "projectile" | "egg-crack";
export type DragonSoundProfile = Readonly<Record<DragonSoundEvent, string>>;

export const DRAGON_SOUND_PROFILES: Readonly<Record<DragonType, DragonSoundProfile>> = Object.freeze(Object.fromEntries(
  DRAGON_TYPES.map((type) => [type, Object.freeze({
    ambient: `${type}-dragon-ambient`, roar: `${type}-dragon-roar`, hurt: `${type}-dragon-hurt`, death: `${type}-dragon-death`,
    wing: `${type}-dragon-wing`, melee: `${type}-dragon-melee`, breath: `${type}-dragon-breath`, projectile: `${type}-dragon-projectile`,
    "egg-crack": `${type}-dragon-egg-crack`,
  })]),
) as Record<DragonType, DragonSoundProfile>);

/** Hidden future contract: hybrids intentionally remain unsupported in v1.0. */
export const DRAGON_FUTURE_FEATURES = Object.freeze(["cross-type-hybrids", "stage-six-elder-dragons"] as const);
