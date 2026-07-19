/**
 * Persistent dragon lifecycle and combat contracts.
 *
 * This module deliberately has no renderer, world, inventory, or React
 * dependency. The engine can therefore save, unload, simulate, and test a
 * dragon without keeping its Three.js model alive. Values are finite and
 * normalized at every public boundary so old or edited save data cannot make
 * an immortal NaN dragon.
 */

export const DRAGON_SCHEMA_VERSION = 2 as const;
export const LEGACY_DRAGON_SCHEMA_VERSION = 1 as const;
export const DRAGON_TICKS_PER_DAY = 24_000;
export const DRAGON_DAYS_PER_STAGE = 25;
export const DRAGON_STAGE_COUNT = 5;
export const DRAGON_FULL_GROWTH_DAYS = DRAGON_DAYS_PER_STAGE * DRAGON_STAGE_COUNT;
export const DRAGON_SCALE_SHED_TICKS = DRAGON_TICKS_PER_DAY * 3;
export const DRAGON_BREED_COOLDOWN_TICKS = DRAGON_TICKS_PER_DAY * 2;
export const DRAGON_EGG_INCUBATION_TICKS = 7_200;
export const DRAGON_BREEDING_STAGE = 3 as const;

/**
 * Portable eggs are heirloom drops, not ordinary cleanup fodder. The engine
 * converts this tick policy through the world's configured day length so an
 * egg remains recoverable for at least one complete dawn-to-dawn cycle.
 */
export const DRAGON_EGG_DROP_POLICY = Object.freeze({
  fireImmune: true,
  lavaImmune: true,
  minimumLifetimeTicks: DRAGON_TICKS_PER_DAY,
  maximumDeathClutch: 3,
} as const);

export type DragonType = "fire" | "ice" | "steel" | "sea" | "gold" | "silver";
export type DragonKind = `${DragonType}-dragon`;
export type DragonVariantId =
  | "furnacecrest" | "cindercoil" | "crownflare" | "emberkite"
  | "glacierhorn" | "rimeplume" | "hoarfang" | "prismcoil"
  | "rivetback" | "gearwing" | "anvilback" | "razorfan"
  | "tidemane" | "mantaroyal" | "ribboncoil" | "reefcrown"
  | "sunmane" | "auric-roc" | "treasury-coil" | "idolback"
  | "moonhart" | "argent-moth" | "mirrorcoil" | "crescent-wyvern";
export type DragonStage = 1 | 2 | 3 | 4 | 5;
export type DragonSex = "female" | "male";
export type DragonCommand = "follow" | "stay" | "guard-lair" | "wander";
export type DragonArmorSlot = "head" | "neck" | "body" | "tail";
export type DragonAttackKind = "melee" | "breath" | "projectile";
export type DragonAiIntent = "idle" | "return-home" | "guard" | "pursue" | "circle" | "attack" | "flee";
export type DragonDisposition = "passive" | "defensive" | "hostile";
export type DragonCombatPhase = "approach" | "attack-run" | "breakaway" | "orbit" | "reposition";

export type DragonPoint = Readonly<{ x: number; y: number; z: number }>;

/**
 * Ephemeral host-side flight state. It intentionally does not belong to the
 * persisted DragonState or multiplayer payload: guests interpolate the
 * authoritative host pose, while a reloaded host can safely begin a new pass.
 */
export type DragonCombatManeuverState = Readonly<{
  phase: DragonCombatPhase;
  phaseSeconds: number;
  passIndex: number;
  passBearing: number;
  orbitDirection: -1 | 1;
  targetToken: number | null;
  attackCommitted: boolean;
  lastAttack: DragonAttackKind | null;
}>;

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
  /** Stable adult body plan; young stages retain the shared species silhouette. */
  variant: DragonVariantId;
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
  variant: DragonVariantId;
  sex: DragonSex;
  geneticSeed: number;
  parentIds: readonly [string | null, string | null];
  laidAtTick: number;
  incubationTicks: number;
  requiredTicks: number;
  wild: boolean;
  lairId: string | null;
}>;

export type DragonEggDropMetadata = Readonly<{
  kind: "dragon-egg";
  egg: DragonEgg;
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
export const DRAGON_VARIANTS: Readonly<Record<DragonType, readonly DragonVariantId[]>> = Object.freeze({
  fire: Object.freeze(["furnacecrest", "cindercoil", "crownflare", "emberkite"] as const),
  ice: Object.freeze(["glacierhorn", "rimeplume", "hoarfang", "prismcoil"] as const),
  steel: Object.freeze(["rivetback", "gearwing", "anvilback", "razorfan"] as const),
  sea: Object.freeze(["tidemane", "mantaroyal", "ribboncoil", "reefcrown"] as const),
  gold: Object.freeze(["sunmane", "auric-roc", "treasury-coil", "idolback"] as const),
  silver: Object.freeze(["moonhart", "argent-moth", "mirrorcoil", "crescent-wyvern"] as const),
});
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

export function dragonVariantForSeed(type: DragonType, geneticSeed: number): DragonVariantId {
  const variants = DRAGON_VARIANTS[type];
  const mixed = (Math.imul((safeInteger(geneticSeed, 0, 0xffff_ffff) >>> 0) ^ 0x9e3779b9, 0x85ebca6b) ^ (type.length * 0xc2b2ae35)) >>> 0;
  return variants[mixed % variants.length];
}

export function isDragonVariantForType(type: DragonType, value: unknown): value is DragonVariantId {
  return typeof value === "string" && DRAGON_VARIANTS[type].includes(value as DragonVariantId);
}

export function normalizeDragonVariant(type: DragonType, value: unknown, geneticSeed: number): DragonVariantId {
  return isDragonVariantForType(type, value) ? value : dragonVariantForSeed(type, geneticSeed);
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
    variant?: DragonVariantId;
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
    variant: normalizeDragonVariant(safeType, options.variant, seed),
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
    variant: normalizeDragonVariant(type, input.variant, geneticSeed),
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
    && first.stage >= DRAGON_BREEDING_STAGE && second.stage >= DRAGON_BREEDING_STAGE
    && first.breedCooldownTicks <= 0 && second.breedCooldownTicks <= 0;
}

/** Read a portable egg payload without accepting placed/incubating egg state. */
export function dragonEggFromDropMetadata(value: unknown): DragonEgg | null {
  if (!value || typeof value !== "object") return null;
  const metadata = value as Partial<DragonEggDropMetadata>;
  if (metadata.kind !== "dragon-egg" || !metadata.egg || typeof metadata.egg !== "object") return null;
  const egg = metadata.egg as Partial<DragonEgg>;
  if (egg.schemaVersion !== DRAGON_SCHEMA_VERSION && egg.schemaVersion !== LEGACY_DRAGON_SCHEMA_VERSION
    || !DRAGON_TYPES.includes(egg.type as DragonType)
    || !DRAGON_SEXES.includes(egg.sex as DragonSex)
    || typeof egg.eggId !== "string" || !egg.eggId.trim()
    || typeof egg.geneticSeed !== "number" || !Number.isFinite(egg.geneticSeed)
    || typeof egg.laidAtTick !== "number" || !Number.isFinite(egg.laidAtTick)
    || typeof egg.incubationTicks !== "number" || !Number.isFinite(egg.incubationTicks)
    || typeof egg.requiredTicks !== "number" || !Number.isFinite(egg.requiredTicks)
    || !Array.isArray(egg.parentIds) || egg.parentIds.length !== 2
    || typeof egg.wild !== "boolean"
    || !(egg.lairId === null || typeof egg.lairId === "string")) return null;
  const type = egg.type as DragonType;
  const geneticSeed = safeInteger(Number(egg.geneticSeed), 0, 0xffff_ffff) >>> 0;
  return {
    ...(egg as Omit<DragonEgg, "schemaVersion" | "variant" | "geneticSeed">),
    schemaVersion: DRAGON_SCHEMA_VERSION,
    geneticSeed,
    variant: normalizeDragonVariant(type, egg.variant, geneticSeed),
  };
}

export function dragonEggMinimumDropLifetimeSeconds(dayLengthMinutes: number) {
  const finiteMinutes = Number.isFinite(dayLengthMinutes) ? dayLengthMinutes : 20;
  return Math.max(60, finiteMinutes * 60) * (DRAGON_EGG_DROP_POLICY.minimumLifetimeTicks / DRAGON_TICKS_PER_DAY);
}

export function dragonEggDropIsProtected(metadata: unknown, ageSeconds: number, dayLengthMinutes: number) {
  return dragonEggFromDropMetadata(metadata) !== null
    && Math.max(0, Number.isFinite(ageSeconds) ? ageSeconds : 0) < dragonEggMinimumDropLifetimeSeconds(dayLengthMinutes);
}

export function createDragonEgg(
  type: DragonType,
  options: Readonly<{
    eggId?: string;
    geneticSeed?: number;
    variant?: DragonVariantId;
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
    variant: normalizeDragonVariant(type, options.variant, geneticSeed),
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
    // Most clutches visibly inherit one parent's body plan. A one-in-sixteen
    // recombination roll selects from the full species quartet so every
    // reviewed alternative remains obtainable without mutation currencies.
    variant: (seed & 15) === 0
      ? dragonVariantForSeed(first.type, seed ^ 0xa5a5a5a5)
      : ((seed & 1) === 0 ? first.variant : second.variant),
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
    variant: egg.variant,
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

export type DragonCombatProfile = Readonly<{
  style: "cinder-dive" | "frost-control" | "steel-strafe" | "tide-skimming" | "solar-orbit" | "lunar-orbit";
  entryRadius: number;
  orbitRadius: number;
  missDistance: number;
  breakawayRadius: number;
  attackAltitude: number;
  cruiseAltitude: number;
  orbitSeconds: number;
  attackRunSeconds: number;
  speedScale: number;
  preferredAttacks: readonly [DragonAttackKind, DragonAttackKind, DragonAttackKind];
}>;

type DragonCombatProfileBase = Omit<DragonCombatProfile, "entryRadius" | "orbitRadius" | "missDistance" | "breakawayRadius"> & Readonly<{
  entryRadius: number;
  orbitRadius: number;
  missDistance: number;
  breakawayRadius: number;
}>;

const DRAGON_COMBAT_PROFILE_BASE: Readonly<Record<DragonType, DragonCombatProfileBase>> = Object.freeze({
  fire: {
    style: "cinder-dive", entryRadius: 15, orbitRadius: 12, missDistance: 3, breakawayRadius: 19,
    attackAltitude: 3.4, cruiseAltitude: 7.8, orbitSeconds: 1.8, attackRunSeconds: 2.5, speedScale: 1.14,
    preferredAttacks: ["breath", "melee", "projectile"],
  },
  ice: {
    style: "frost-control", entryRadius: 18, orbitRadius: 16, missDistance: 5.2, breakawayRadius: 22,
    attackAltitude: 6.2, cruiseAltitude: 8.8, orbitSeconds: 3.1, attackRunSeconds: 2.8, speedScale: 0.96,
    preferredAttacks: ["breath", "projectile", "melee"],
  },
  steel: {
    style: "steel-strafe", entryRadius: 25, orbitRadius: 22, missDistance: 6.2, breakawayRadius: 30,
    attackAltitude: 7.2, cruiseAltitude: 10.2, orbitSeconds: 2.35, attackRunSeconds: 3.1, speedScale: 1.06,
    preferredAttacks: ["projectile", "breath", "melee"],
  },
  sea: {
    style: "tide-skimming", entryRadius: 13, orbitRadius: 11, missDistance: 3, breakawayRadius: 17,
    attackAltitude: 2.6, cruiseAltitude: 5.2, orbitSeconds: 1.75, attackRunSeconds: 2.35, speedScale: 1.18,
    preferredAttacks: ["breath", "projectile", "melee"],
  },
  gold: {
    style: "solar-orbit", entryRadius: 28, orbitRadius: 25, missDistance: 7.2, breakawayRadius: 33,
    attackAltitude: 9.4, cruiseAltitude: 12.4, orbitSeconds: 3.15, attackRunSeconds: 3.2, speedScale: 1.1,
    preferredAttacks: ["projectile", "breath", "melee"],
  },
  silver: {
    style: "lunar-orbit", entryRadius: 26, orbitRadius: 23, missDistance: 6.8, breakawayRadius: 31,
    attackAltitude: 10.2, cruiseAltitude: 12.8, orbitSeconds: 2.8, attackRunSeconds: 3, speedScale: 1.12,
    preferredAttacks: ["projectile", "breath", "melee"],
  },
});

/** Distinct bounded spacing/cadence for each lineage, scaled modestly by age. */
export function dragonCombatProfile(type: DragonType, stage: DragonStage, swimming = false): DragonCombatProfile {
  const base = DRAGON_COMBAT_PROFILE_BASE[type];
  if (stage === 1) {
    return {
      ...base,
      entryRadius: 4.2,
      orbitRadius: 3.6,
      missDistance: 1.05,
      breakawayRadius: 5.4,
      attackAltitude: 0,
      cruiseAltitude: 0,
      orbitSeconds: 1.25,
      attackRunSeconds: 1.7,
      speedScale: Math.min(1.08, base.speedScale),
    };
  }
  const scale = 0.72 + stage * 0.1;
  const aquaticAltitude = type === "sea" && swimming;
  return {
    ...base,
    entryRadius: base.entryRadius * scale,
    orbitRadius: base.orbitRadius * scale,
    missDistance: base.missDistance * scale,
    breakawayRadius: base.breakawayRadius * scale,
    attackAltitude: aquaticAltitude ? 0.45 : base.attackAltitude + (stage - 3) * 0.28,
    cruiseAltitude: aquaticAltitude ? 1.15 : base.cruiseAltitude + (stage - 3) * 0.38,
  };
}

function dragonCombatUnit(seed: number, salt: number) {
  let mixed = Math.imul((Math.trunc(seed) | 0) ^ Math.imul((Math.trunc(salt) | 0) + 1, 0x45d9f3b), 0x27d4eb2d);
  mixed ^= mixed >>> 15;
  mixed = Math.imul(mixed, 0x85ebca6b);
  mixed ^= mixed >>> 13;
  return (mixed >>> 0) / 0x1_0000_0000;
}

export function createDragonCombatManeuverState(combatSeed = 0): DragonCombatManeuverState {
  return {
    phase: "approach",
    phaseSeconds: 0,
    passIndex: 0,
    passBearing: dragonCombatUnit(combatSeed, 3) * Math.PI * 2 - Math.PI,
    orbitDirection: dragonCombatUnit(combatSeed, 7) < 0.5 ? -1 : 1,
    targetToken: null,
    attackCommitted: false,
    lastAttack: null,
  };
}

export type DragonCombatManeuverInput = Readonly<{
  dragonState: DragonState;
  maneuver: DragonCombatManeuverState;
  dt: number;
  combatSeed: number;
  targetToken: number;
  dragonPosition: DragonPoint;
  targetPosition: DragonPoint;
  lineOfSight: boolean;
  swimming?: boolean;
  meleeReady?: boolean;
  breathReady?: boolean;
  projectileReady?: boolean;
}>;

export type DragonCombatManeuverPlan = Readonly<{
  maneuver: DragonCombatManeuverState;
  destination: DragonPoint;
  attack: DragonAttackPlan | null;
  style: DragonCombatProfile["style"];
  speedScale: number;
  /** Minimum terrain clearance for the current pass. Signature melee runs dip lower than cruise flight. */
  terrainClearance: number;
  minimumHorizontalSeparation: number;
  horizontalSeparation: number;
}>;

export type DragonAttackFacingPose = Readonly<{
  visualHeading: number;
  /** Local rig yaw. The dragon model faces -Z, so this intentionally opposes the remaining world-heading delta. */
  lookYaw: number;
}>;

/**
 * Splits a world-space attack heading between a bounded body turn and the
 * articulated neck. Keeping this pure makes the model's -Z/group-yaw
 * convention testable instead of burying a sign-sensitive transform in the
 * render loop.
 */
export function dragonAttackFacingPose(
  currentHeading: number,
  attackHeading: number,
  kind: DragonAttackKind,
  attackProgress: number,
): DragonAttackFacingPose {
  const progress = clampFinite(attackProgress, 0, 1, 0);
  const acquisition = 0.72 + Math.sin(Math.min(1, progress / 0.72) * Math.PI * 0.5) * 0.28;
  const recoveryProgress = clampFinite((progress - 0.72) / 0.28, 0, 1, 0);
  const recovery = 1 - recoveryProgress * recoveryProgress * (3 - 2 * recoveryProgress);
  // Aim is held through the release/strike window, then reaches exactly zero
  // before the short animation is cleared, avoiding a terminal body/head snap.
  const engagement = acquisition * recovery;
  if (engagement <= Number.EPSILON) return { visualHeading: currentHeading, lookYaw: 0 };
  const delta = Math.atan2(
    Math.sin(attackHeading - currentHeading),
    Math.cos(attackHeading - currentHeading),
  );
  const bodyLimit = kind === "melee" ? 0.72 : 0.52;
  const bodyTurn = clampFinite(delta, -bodyLimit, bodyLimit, 0) * engagement;
  return {
    visualHeading: currentHeading + bodyTurn,
    // A positive local Y rotation turns the rig's -Z muzzle toward a lower
    // world heading, hence the deliberate inverse of the residual delta.
    lookYaw: clampFinite(bodyTurn - delta, -0.95, 0.95, 0) * engagement,
  };
}

/** Hard safety rail for discrete engine steps around a moving target. */
export function constrainDragonCombatPosition(
  candidate: DragonPoint,
  target: DragonPoint,
  minimumHorizontalSeparation: number,
  fallbackBearing = 0,
): DragonPoint {
  const minimum = Math.max(0, minimumHorizontalSeparation);
  const protectedRadius = minimum > 0 ? minimum + 0.01 : 0;
  const dx = candidate.x - target.x;
  const dz = candidate.z - target.z;
  const separation = Math.hypot(dx, dz);
  if (separation >= protectedRadius || protectedRadius <= 0) return candidate;
  const bearing = separation > 0.0001 ? Math.atan2(dz, dx) : fallbackBearing;
  return {
    x: target.x + Math.cos(bearing) * protectedRadius,
    y: candidate.y,
    z: target.z + Math.sin(bearing) * protectedRadius,
  };
}

function horizontalDistance(first: DragonPoint, second: DragonPoint) {
  return Math.hypot(first.x - second.x, first.z - second.z);
}

function isSignatureMeleePass(state: DragonState, maneuver: DragonCombatManeuverState, swimming: boolean) {
  if (state.stage < 3) return false;
  return (state.type === "fire" && maneuver.passIndex % 3 === 2)
    || (state.type === "sea" && swimming && maneuver.passIndex % 3 === 1);
}

function combatAttackRunSeconds(
  state: DragonState,
  maneuver: DragonCombatManeuverState,
  profile: DragonCombatProfile,
  swimming: boolean,
) {
  if (!isSignatureMeleePass(state, maneuver, swimming)) return profile.attackRunSeconds;
  // The close pass must last long enough for a Stage III dragon to traverse
  // the whole offset lane at its real engine speed and descend into reach.
  return profile.attackRunSeconds + (state.type === "fire" ? 0.9 : 0.55);
}

function combatDestination(
  state: DragonState,
  maneuver: DragonCombatManeuverState,
  profile: DragonCombatProfile,
  target: DragonPoint,
  swimming: boolean,
): DragonPoint {
  const forwardX = Math.cos(maneuver.passBearing);
  const forwardZ = Math.sin(maneuver.passBearing);
  const tangentX = -forwardZ * maneuver.orbitDirection;
  const tangentZ = forwardX * maneuver.orbitDirection;
  const signatureMelee = isSignatureMeleePass(state, maneuver, swimming);
  // Ranged passes keep a generous buffer for interpolation. A deliberate
  // claw/bite pass closes nearer without ever crossing the protected lane.
  const attackLane = profile.missDistance * (signatureMelee ? 1.08 : 1.27);
  const clawDive = signatureMelee && profile.style === "cinder-dive";
  const tideBite = signatureMelee && profile.style === "tide-skimming";
  const ripple = Math.sin(maneuver.passIndex * 1.73 + maneuver.phaseSeconds * 0.82) * (swimming ? 0.28 : 0.7);

  if (maneuver.phase === "approach") return {
    x: target.x + forwardX * profile.entryRadius + tangentX * attackLane,
    y: target.y + profile.cruiseAltitude + ripple,
    z: target.z + forwardZ * profile.entryRadius + tangentZ * attackLane,
  };
  if (maneuver.phase === "attack-run") return {
    x: target.x - forwardX * profile.entryRadius + tangentX * attackLane,
    y: target.y + (clawDive ? 0.25 : tideBite ? 0.18 : profile.attackAltitude) + ripple * 0.32,
    z: target.z - forwardZ * profile.entryRadius + tangentZ * attackLane,
  };
  if (maneuver.phase === "breakaway") return {
    x: target.x - forwardX * profile.breakawayRadius + tangentX * attackLane * 1.45,
    y: target.y + profile.cruiseAltitude + (swimming ? -0.2 : 1.4) + ripple,
    z: target.z - forwardZ * profile.breakawayRadius + tangentZ * attackLane * 1.45,
  };

  const repositioning = maneuver.phase === "reposition";
  const radius = repositioning ? profile.orbitRadius * 1.22 : profile.orbitRadius;
  const orbitRate = (repositioning ? 0.62 : 0.48) * maneuver.orbitDirection;
  const angle = maneuver.passBearing + maneuver.phaseSeconds * orbitRate;
  return {
    x: target.x + Math.cos(angle) * radius,
    y: target.y + profile.cruiseAltitude + (repositioning && !swimming ? 2.2 : 0) + ripple,
    z: target.z + Math.sin(angle) * radius,
  };
}

function attackReady(kind: DragonAttackKind, input: DragonCombatManeuverInput) {
  if (kind === "melee") return input.meleeReady !== false;
  if (kind === "breath") return input.breathReady !== false;
  return input.projectileReady !== false;
}

function maneuverAttack(
  input: DragonCombatManeuverInput,
  maneuver: DragonCombatManeuverState,
  distance: number,
  profile: DragonCombatProfile,
) {
  if (maneuver.phase !== "attack-run" || maneuver.attackCommitted || !input.lineOfSight) return null;
  const state = input.dragonState;
  let order = profile.preferredAttacks;
  const signatureMelee = isSignatureMeleePass(state, maneuver, Boolean(input.swimming));
  const attackRunSeconds = combatAttackRunSeconds(state, maneuver, profile, Boolean(input.swimming));
  const fireClawPass = signatureMelee && state.type === "fire" && input.meleeReady !== false;
  const seaBitePass = signatureMelee && state.type === "sea" && input.meleeReady !== false;
  const closeMeleePlan = fireClawPass || seaBitePass ? dragonAttackPlan(state.type, state.stage, "melee") : null;
  if (fireClawPass) order = ["melee", "breath", "projectile"];
  else if (state.type === "ice" && maneuver.passIndex % 2 === 1) order = ["projectile", "breath", "melee"];
  else if (seaBitePass) order = ["melee", "breath", "projectile"];

  for (const kind of order) {
    if (!attackReady(kind, input) || (kind !== "melee" && state.stage < 2)) continue;
    const plan = dragonAttackPlan(state.type, state.stage, kind);
    if (distance > plan.range) continue;
    if (closeMeleePlan && kind !== "melee" && distance > closeMeleePlan.range
      && maneuver.phaseSeconds < attackRunSeconds * 0.82) continue;
    // Fire and Sea dragons commit to closing for their signature stream instead
    // of throwing a fallback projectile the instant they enter the lane.
    if (kind === "projectile" && (state.type === "fire" || state.type === "sea")
      && maneuver.phaseSeconds < profile.attackRunSeconds * 0.56) continue;
    return plan;
  }
  return null;
}

/**
 * Deterministic host-authoritative attack-pass planner. Its attack lane always
 * carries a non-zero lateral miss distance, so an airborne dragon never seeks
 * the target's exact horizontal coordinate or parks directly overhead.
 */
export function planDragonCombatManeuver(input: DragonCombatManeuverInput): DragonCombatManeuverPlan {
  const dt = clampFinite(input.dt, 0, 0.25, 0);
  const swimming = Boolean(input.swimming && input.dragonState.type === "sea");
  const profile = dragonCombatProfile(input.dragonState.type, input.dragonState.stage, swimming);
  const relativeX = input.dragonPosition.x - input.targetPosition.x;
  const relativeZ = input.dragonPosition.z - input.targetPosition.z;
  const currentSeparation = Math.hypot(relativeX, relativeZ);
  let maneuver = input.maneuver;

  if (maneuver.targetToken !== input.targetToken) {
    const fallbackBearing = dragonCombatUnit(input.combatSeed, input.targetToken) * Math.PI * 2 - Math.PI;
    maneuver = {
      ...createDragonCombatManeuverState(input.combatSeed ^ input.targetToken),
      passBearing: currentSeparation > 0.1 ? Math.atan2(relativeZ, relativeX) : fallbackBearing,
      targetToken: input.targetToken,
    };
  } else maneuver = { ...maneuver, phaseSeconds: maneuver.phaseSeconds + dt };

  if (!input.lineOfSight && maneuver.phase !== "reposition" && maneuver.phase !== "breakaway") {
    maneuver = {
      ...maneuver,
      phase: "reposition",
      phaseSeconds: 0,
      passBearing: currentSeparation > 0.1 ? Math.atan2(relativeZ, relativeX) : maneuver.passBearing,
      attackCommitted: false,
    };
  } else if (maneuver.phase === "reposition"
    && ((input.lineOfSight && maneuver.phaseSeconds >= 0.45) || maneuver.phaseSeconds >= 4.2)) {
    maneuver = {
      ...maneuver,
      phase: "approach",
      phaseSeconds: 0,
      passIndex: maneuver.passIndex + 1,
      passBearing: currentSeparation > 0.1 ? Math.atan2(relativeZ, relativeX) : maneuver.passBearing,
      attackCommitted: false,
    };
  }

  let destination = combatDestination(input.dragonState, maneuver, profile, input.targetPosition, swimming);
  const arrivalDistance = horizontalDistance(input.dragonPosition, destination);
  if (maneuver.phase === "approach" && (arrivalDistance <= Math.max(2.1, profile.missDistance * 0.48) || maneuver.phaseSeconds >= 4.8)) {
    maneuver = { ...maneuver, phase: "attack-run", phaseSeconds: 0, attackCommitted: false };
    destination = combatDestination(input.dragonState, maneuver, profile, input.targetPosition, swimming);
  } else if (maneuver.phase === "attack-run"
    && ((maneuver.attackCommitted && maneuver.phaseSeconds >= 0.55)
      || maneuver.phaseSeconds >= combatAttackRunSeconds(input.dragonState, maneuver, profile, swimming))) {
    maneuver = { ...maneuver, phase: "breakaway", phaseSeconds: 0 };
    destination = combatDestination(input.dragonState, maneuver, profile, input.targetPosition, swimming);
  } else if (maneuver.phase === "breakaway"
    && (maneuver.phaseSeconds >= 2.15 || currentSeparation >= profile.breakawayRadius * 0.88)) {
    maneuver = {
      ...maneuver,
      phase: "orbit",
      phaseSeconds: 0,
      passBearing: currentSeparation > 0.1 ? Math.atan2(relativeZ, relativeX) : maneuver.passBearing,
      attackCommitted: false,
    };
    destination = combatDestination(input.dragonState, maneuver, profile, input.targetPosition, swimming);
  } else if (maneuver.phase === "orbit" && maneuver.phaseSeconds >= profile.orbitSeconds) {
    maneuver = {
      ...maneuver,
      phase: "approach",
      phaseSeconds: 0,
      passIndex: maneuver.passIndex + 1,
      passBearing: currentSeparation > 0.1 ? Math.atan2(relativeZ, relativeX) : maneuver.passBearing,
      attackCommitted: false,
    };
    destination = combatDestination(input.dragonState, maneuver, profile, input.targetPosition, swimming);
  }

  const distance3d = Math.hypot(relativeX, input.dragonPosition.y - input.targetPosition.y, relativeZ);
  const attack = maneuverAttack(input, maneuver, distance3d, profile);
  const phaseSpeed = maneuver.phase === "attack-run" ? 1.28
    : maneuver.phase === "breakaway" ? 1.16
      : maneuver.phase === "orbit" ? 0.82
        : maneuver.phase === "reposition" ? 0.94 : 1;
  return {
    maneuver,
    destination,
    attack,
    style: profile.style,
    speedScale: profile.speedScale * phaseSpeed,
    terrainClearance: maneuver.phase === "attack-run"
      && isSignatureMeleePass(input.dragonState, maneuver, swimming)
      && input.dragonState.type === "fire" ? 1.45 : 4.5,
    minimumHorizontalSeparation: profile.missDistance,
    horizontalSeparation: currentSeparation,
  };
}

export function commitDragonCombatAttack(maneuver: DragonCombatManeuverState, attack: DragonAttackKind): DragonCombatManeuverState {
  return {
    ...maneuver,
    phase: "attack-run",
    phaseSeconds: 0,
    attackCommitted: true,
    lastAttack: attack,
  };
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

/**
 * Every dragon old enough to breed leaves a bounded, lineage-preserving egg
 * clutch when defeated. This is separate from eggs already present in female
 * lairs: a corpse may yield one legacy egg regardless of sex, while only a
 * stage-five female can yield one or two additional legacy eggs.
 */
export function createDragonDeathEggClutch(
  state: DragonState,
  deathTick = 0,
  seed = state.geneticSeed,
): DragonEgg[] {
  if (state.stage < DRAGON_BREEDING_STAGE) return [];
  const count = state.stage === 5 && state.sex === "female"
    ? 1 + Math.floor(seededRoll(seed, 29) * DRAGON_EGG_DROP_POLICY.maximumDeathClutch)
    : 1;
  const boundedCount = Math.min(DRAGON_EGG_DROP_POLICY.maximumDeathClutch, count);
  const laidAtTick = safeInteger(deathTick);
  return Array.from({ length: boundedCount }, (_, index) => createDragonEgg(state.type, {
    eggId: `${state.dragonId}:legacy:${laidAtTick}:${index + 1}`,
    geneticSeed: mixSeed(seed, state.geneticSeed, laidAtTick, index + 1),
    parentIds: [state.dragonId, null],
    laidAtTick,
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
  const clutch = createDragonDeathEggClutch(state, 0, seed);
  if (clutch.length) loot.push({
    item: typeLootItem(state.type, "Egg"),
    count: clutch.length,
    metadata: { lairId: state.home?.lairId ?? "unknown", parentId: state.dragonId, stage, sex: state.sex },
  });
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
