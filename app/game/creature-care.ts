import type { ItemCode } from "./data";
import type { MobDefinition, MobKind } from "./mobs";

export type CreatureHusbandryState = {
  schema: 1;
  geneticSeed: number;
  baby: boolean;
  ageTicks: number;
  loveTicks: number;
  loveCooldownTicks: number;
  feedings: number;
};

export type CreatureFeedingResult = {
  accepted: boolean;
  breedingFood: boolean;
  state: CreatureHusbandryState;
};

export function createCreatureHusbandryState(geneticSeed: number, baby = false): CreatureHusbandryState {
  return {
    schema: 1,
    geneticSeed: geneticSeed >>> 0,
    baby,
    ageTicks: baby ? 0 : 24_000,
    loveTicks: 0,
    loveCooldownTicks: 0,
    feedings: 0,
  };
}
export function normalizeCreatureHusbandryState(
  value: Partial<CreatureHusbandryState> | null | undefined,
  fallbackSeed: number,
): CreatureHusbandryState {
  const fallback = createCreatureHusbandryState(fallbackSeed, Boolean(value?.baby));
  if (value?.schema !== 1) return fallback;
  const ageTicks = Math.max(0, Number(value.ageTicks) || 0);
  return {
    schema: 1,
    geneticSeed: (Number(value.geneticSeed) || fallbackSeed) >>> 0,
    baby: ageTicks < 24_000,
    ageTicks,
    loveTicks: Math.max(0, Number(value.loveTicks) || 0),
    loveCooldownTicks: Math.max(0, Number(value.loveCooldownTicks) || 0),
    feedings: Math.max(0, Math.floor(Number(value.feedings) || 0)),
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
) {
  if (!canBreedCreatures(leftKind, left, rightKind, right)) return null;
  return {
    child: createCreatureHusbandryState(mixSeed(left.geneticSeed, right.geneticSeed), true),
    left: { ...left, loveTicks: 0, loveCooldownTicks: 12_000 },
    right: { ...right, loveTicks: 0, loveCooldownTicks: 12_000 },
  };
}
