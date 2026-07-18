import type { CreatureAptitudeId, CreatureProgressionV2 } from "./creature-progression";
import { aptitudesFromSeed, bondTierForPoints, experienceForLevel, levelForExperience } from "./creature-progression";
import type { CreatureMetadata } from "./creature-cage";
import type { ItemCode } from "./data";
import type { MobDefinition, MobKind, MobTemperament } from "./mobs";

export type CreatureProductionKind = "fleece" | "milk" | "feather" | "scale" | "bait" | "compost" | "salvage";
export type CreatureProductionRecord = Readonly<{ count: number; lastDay: number }>;
export type CreatureLineageRecord = Readonly<{
  parentIds: readonly [string, string] | null;
  bornDay: number;
  phenotypeSeed: number;
  aptitudes: readonly CreatureAptitudeId[];
  temperament: MobTemperament;
}>;

export type CreatureHusbandryState = {
  schema: 2;
  geneticSeed: number;
  baby: boolean;
  ageTicks: number;
  loveTicks: number;
  loveCooldownTicks: number;
  feedings: number;
  lineage: CreatureLineageRecord;
  productionHistory: Readonly<Partial<Record<CreatureProductionKind, CreatureProductionRecord>>>;
};

export type CreatureFeedingResult = {
  accepted: boolean;
  breedingFood: boolean;
  state: CreatureHusbandryState;
};

export function createCreatureHusbandryState(
  geneticSeed: number,
  baby = false,
  context: Readonly<Partial<{ parentIds: readonly [string, string]; bornDay: number; temperament: MobTemperament }>> = {},
): CreatureHusbandryState {
  const seed = geneticSeed >>> 0;
  return {
    schema: 2,
    geneticSeed: seed,
    baby,
    ageTicks: baby ? 0 : 24_000,
    loveTicks: 0,
    loveCooldownTicks: 0,
    feedings: 0,
    lineage: Object.freeze({
      parentIds: context.parentIds ? Object.freeze([...context.parentIds]) as readonly [string, string] : null,
      bornDay: Math.max(0, Math.floor(context.bornDay ?? 0)),
      phenotypeSeed: seed,
      aptitudes: aptitudesFromSeed(seed),
      temperament: context.temperament ?? "Gentle",
    }),
    productionHistory: Object.freeze({}),
  };
}

export function normalizeCreatureHusbandryState(
  value: (Partial<Omit<CreatureHusbandryState, "schema">> & { schema?: number }) | null | undefined,
  fallbackSeed: number,
): CreatureHusbandryState {
  const fallback = createCreatureHusbandryState(fallbackSeed, Boolean(value?.baby));
  if (value?.schema !== 1 && value?.schema !== 2) return fallback;
  const ageTicks = Math.max(0, Number(value.ageTicks) || 0);
  const rawLineage = value.lineage;
  const parentIds = rawLineage?.parentIds && rawLineage.parentIds.length === 2
    ? Object.freeze([String(rawLineage.parentIds[0]), String(rawLineage.parentIds[1])]) as readonly [string, string]
    : null;
  const productionHistory: Partial<Record<CreatureProductionKind, CreatureProductionRecord>> = {};
  for (const kind of ["fleece", "milk", "feather", "scale", "bait", "compost", "salvage"] as const) {
    const record = value.productionHistory?.[kind];
    if (record) productionHistory[kind] = Object.freeze({ count: Math.max(0, Math.floor(Number(record.count) || 0)), lastDay: Math.max(-1, Math.floor(Number(record.lastDay) || -1)) });
  }
  return {
    schema: 2,
    geneticSeed: (Number(value.geneticSeed) || fallbackSeed) >>> 0,
    baby: ageTicks < 24_000,
    ageTicks,
    loveTicks: Math.max(0, Number(value.loveTicks) || 0),
    loveCooldownTicks: Math.max(0, Number(value.loveCooldownTicks) || 0),
    feedings: Math.max(0, Math.floor(Number(value.feedings) || 0)),
    lineage: Object.freeze({
      parentIds,
      bornDay: Math.max(0, Math.floor(Number(rawLineage?.bornDay) || 0)),
      phenotypeSeed: (Number(rawLineage?.phenotypeSeed) || value.geneticSeed || fallbackSeed) >>> 0,
      aptitudes: Object.freeze([...(rawLineage?.aptitudes?.length ? rawLineage.aptitudes : aptitudesFromSeed((Number(value.geneticSeed) || fallbackSeed) >>> 0))]),
      temperament: rawLineage?.temperament ?? "Gentle",
    }),
    productionHistory: Object.freeze(productionHistory),
  };
}

export function tickCreatureHusbandry(state: CreatureHusbandryState, ticks: number): CreatureHusbandryState {
  const elapsed = Math.max(0, Number(ticks) || 0);
  const ageTicks = state.ageTicks + elapsed;
  return {
    ...state,
    ageTicks,
    baby: ageTicks < 24_000,
    loveTicks: Math.max(0, state.loveTicks - elapsed),
    loveCooldownTicks: Math.max(0, state.loveCooldownTicks - elapsed),
  };
}

export function feedCreatureForHusbandry(
  definition: Pick<MobDefinition, "diet" | "breedable" | "breedingFoods">,
  state: CreatureHusbandryState,
  item: ItemCode,
): CreatureFeedingResult {
  if (!definition.diet?.includes(item)) return { accepted: false, breedingFood: false, state };
  const breedingFood = Boolean(
    definition.breedable
      && !state.baby
      && state.loveCooldownTicks <= 0
      && definition.breedingFoods?.includes(item),
  );
  return {
    accepted: true,
    breedingFood,
    state: {
      ...state,
      feedings: state.feedings + 1,
      loveTicks: breedingFood ? 400 : state.loveTicks,
    },
  };
}

export function canBreedCreatures(
  leftKind: MobKind,
  left: CreatureHusbandryState,
  rightKind: MobKind,
  right: CreatureHusbandryState,
) {
  return leftKind === rightKind
    && !left.baby && !right.baby
    && left.loveTicks > 0 && right.loveTicks > 0
    && left.loveCooldownTicks <= 0 && right.loveCooldownTicks <= 0;
}

function mixSeed(left: number, right: number) {
  let value = (left ^ ((right << 11) | (right >>> 21)) ^ 0x85ebca6b) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0xc2b2ae35) >>> 0;
  return (value ^ (value >>> 13)) >>> 0;
}

export function breedCreatureStates(
  leftKind: MobKind,
  left: CreatureHusbandryState,
  rightKind: MobKind,
  right: CreatureHusbandryState,
  context: Readonly<Partial<{ leftId: string | number; rightId: string | number; bornDay: number; temperament: MobTemperament }>> = {},
) {
  if (!canBreedCreatures(leftKind, left, rightKind, right)) return null;
  return {
    child: createCreatureHusbandryState(mixSeed(left.geneticSeed, right.geneticSeed), true, {
      ...(context.leftId !== undefined && context.rightId !== undefined ? { parentIds: [String(context.leftId), String(context.rightId)] as const } : {}),
      bornDay: context.bornDay ?? 0,
      temperament: context.temperament ?? left.lineage.temperament,
    }),
    left: { ...left, loveTicks: 0, loveCooldownTicks: 12_000 },
    right: { ...right, loveTicks: 0, loveCooldownTicks: 12_000 },
  };
}

/** Immutable bounded production ledger used by pairing previews and care history. */
export function recordCreatureProduction(state: CreatureHusbandryState, kind: CreatureProductionKind, count: number, worldDay: number): CreatureHusbandryState {
  const prior = state.productionHistory[kind] ?? { count: 0, lastDay: -1 };
  return {
    ...state,
    productionHistory: Object.freeze({
      ...state.productionHistory,
      [kind]: Object.freeze({ count: Math.min(1_000_000, prior.count + Math.max(0, Math.floor(count))), lastDay: Math.max(0, Math.floor(worldDay)) }),
    }),
  };
}

export type CareNeedId = "health" | "exertion" | "presentation" | "cleanliness" | "rest" | "enrichment";
export type HabitatNeedId = "shelter" | "water" | "perch" | "companion" | "temperature" | "substrate";
export type CreatureCareAction = "feed" | "groom" | "wash" | "play" | "train" | "rest";

export type CreatureCareState = Readonly<{
  schemaVersion: 1;
  exertion: number;
  presentation: number;
  cleanliness: number;
  enrichment: number;
  rested: number;
  lastCareDay: number;
  dailyPlayCount: number;
  dailyTrainingCount: number;
  habitatSatisfaction: Readonly<Partial<Record<HabitatNeedId, boolean>>>;
}>;

export const createCreatureCareState = (): CreatureCareState => Object.freeze({
  schemaVersion: 1, exertion: 100, presentation: 80, cleanliness: 80, enrichment: 60, rested: 80,
  lastCareDay: -1, dailyPlayCount: 0, dailyTrainingCount: 0, habitatSatisfaction: Object.freeze({}),
});

export function normalizeCreatureCareState(value: unknown): CreatureCareState {
  const raw = value && typeof value === "object" ? value as Partial<CreatureCareState> : {};
  const score = (candidate: unknown, fallback: number) => Math.max(0, Math.min(100, Number.isFinite(candidate) ? Number(candidate) : fallback));
  return Object.freeze({
    schemaVersion: 1,
    exertion: score(raw.exertion, 100), presentation: score(raw.presentation, 80), cleanliness: score(raw.cleanliness, 80),
    enrichment: score(raw.enrichment, 60), rested: score(raw.rested, 80),
    lastCareDay: Number.isFinite(raw.lastCareDay) ? Math.floor(Number(raw.lastCareDay)) : -1,
    dailyPlayCount: Math.max(0, Math.floor(Number(raw.dailyPlayCount) || 0)),
    dailyTrainingCount: Math.max(0, Math.floor(Number(raw.dailyTrainingCount) || 0)),
    habitatSatisfaction: Object.freeze({ ...(raw.habitatSatisfaction ?? {}) }),
  });
}

export type CareActionResult = Readonly<{
  state: CreatureCareState;
  progression: CreatureProgressionV2;
  health: number;
  accepted: boolean;
  message: string;
  renewableYield: "wool" | "feather" | "scale" | null;
}>;

function resetDaily(state: CreatureCareState, worldDay: number): CreatureCareState {
  return state.lastCareDay === worldDay ? state : Object.freeze({ ...state, lastCareDay: worldDay, dailyPlayCount: 0, dailyTrainingCount: 0 });
}

function progressWith(progression: CreatureProgressionV2, experience: number, bondPoints: number): CreatureProgressionV2 {
  const xp = Math.max(progression.experience, progression.experience + experience);
  const level = Math.min(progression.maximumLevel, levelForExperience(xp, progression.maximumLevel));
  const bond = Math.max(0, progression.bondPoints + bondPoints);
  return Object.freeze({ ...progression, experience: Math.max(xp, experienceForLevel(level)), level, bondPoints: bond, bondTier: bondTierForPoints(bond) });
}

/** One bounded care mutation. No action creates another simulation bubble. */
export function applyCreatureCareAction(input: Readonly<{
  metadata: Pick<CreatureMetadata, "kind" | "health" | "maxHealth">;
  progression: CreatureProgressionV2;
  state?: CreatureCareState | null;
  action: CreatureCareAction;
  worldDay: number;
  preferredFood?: boolean;
  renewableMaterial?: "wool" | "feather" | "scale" | null;
}>): CareActionResult {
  let state = resetDaily(normalizeCreatureCareState(input.state), Math.max(0, Math.floor(input.worldDay)));
  let progression = input.progression;
  let health = input.metadata.health;
  let accepted = true;
  let message = "Care complete.";
  let renewableYield: CareActionResult["renewableYield"] = null;
  if (input.action === "feed") {
    health = Math.min(input.metadata.maxHealth, health + (input.preferredFood ? 3 : 1));
    state = Object.freeze({ ...state, exertion: Math.min(100, state.exertion + 28), enrichment: Math.min(100, state.enrichment + 6) });
    progression = progressWith(progression, 2, input.preferredFood ? 5 : 2);
    message = input.preferredFood ? "Favorite food restored health, exertion, and trust." : "Food restored a little health and exertion.";
  } else if (input.action === "groom") {
    state = Object.freeze({ ...state, presentation: Math.min(100, state.presentation + 35), cleanliness: Math.min(100, state.cleanliness + 12) });
    progression = progressWith(progression, 0, 3);
    renewableYield = state.presentation >= 95 ? input.renewableMaterial ?? null : null;
    message = renewableYield ? `Grooming restored presentation and collected ${renewableYield}.` : "Grooming restored presentation.";
  } else if (input.action === "wash") {
    state = Object.freeze({ ...state, cleanliness: 100, presentation: Math.min(100, state.presentation + 12) });
    message = "Washing removed grime and washable field conditions.";
  } else if (input.action === "play") {
    if (state.dailyPlayCount >= 2) { accepted = false; message = "This companion has had enough structured play today."; }
    else {
      state = Object.freeze({ ...state, dailyPlayCount: state.dailyPlayCount + 1, enrichment: Math.min(100, state.enrichment + 24), exertion: Math.max(0, state.exertion - 8) });
      progression = progressWith(progression, 4, state.dailyPlayCount === 0 ? 8 : 4);
      message = "Play improved enrichment and bond.";
    }
  } else if (input.action === "train") {
    if (state.dailyTrainingCount >= 3 || state.exertion < 15) { accepted = false; message = state.exertion < 15 ? "This companion needs food or rest before training." : "Meaningful training is complete for today."; }
    else {
      const count = state.dailyTrainingCount + 1;
      state = Object.freeze({ ...state, dailyTrainingCount: count, exertion: Math.max(0, state.exertion - 15), enrichment: Math.min(100, state.enrichment + 5) });
      progression = progressWith(progression, count === 1 ? 16 : count === 2 ? 9 : 4, 3);
      message = "Training advanced experience with a daily diminishing return.";
    }
  } else {
    state = Object.freeze({ ...state, rested: Math.min(100, state.rested + 45), exertion: Math.min(100, state.exertion + 18) });
    health = health <= 0 ? Math.min(input.metadata.maxHealth, 1) : Math.min(input.metadata.maxHealth, health + 1);
    message = input.metadata.health <= 0 ? "Rest returned the fainted companion at one health; a Healing Station is still faster." : "Rest restored a little health and exertion.";
  }
  return Object.freeze({ state, progression, health, accepted, message, renewableYield });
}

export type HabitatReview = Readonly<{
  satisfied: number;
  total: number;
  percent: number;
  missing: readonly HabitatNeedId[];
  explanation: string;
}>;

export function reviewCreatureHabitat(required: readonly HabitatNeedId[], state: CreatureCareState): HabitatReview {
  const unique = [...new Set(required)];
  const missing = unique.filter((need) => state.habitatSatisfaction[need] !== true);
  const satisfied = unique.length - missing.length;
  const percent = unique.length ? Math.round(satisfied / unique.length * 100) : 100;
  return Object.freeze({ satisfied, total: unique.length, percent, missing: Object.freeze(missing), explanation: missing.length ? `Missing ${missing.join(", ")}.` : "All authored habitat needs are satisfied." });
}

export const CREATURE_CAMP_ACTIVE_SLOTS = 4;
export const SANCTUARY_ACTIVE_WORK_SLOTS = 8;
