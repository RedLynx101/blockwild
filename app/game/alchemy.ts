import { canCraftBlueprintRecipe, type BlueprintState } from "./blueprints";

export const ALCHEMY_SCHEMA = 1 as const;
export const DISTILLERY_SCHEMA = 1 as const;
export const STATION_OUTPUT_CAP = 64;

export type ResourceStack = Readonly<{ item: string; count: number }>;
export type ResourceInventory = Readonly<Record<string, number>>;
export type RecipeIngredient = Readonly<{
  item: string;
  count: number;
  consume?: boolean;
  /** Equivalent inventory resources accepted in place of the display item. */
  alternatives?: readonly string[];
}>;

export type PotionEffect =
  | Readonly<{ kind: "heal"; amount: number }>
  | Readonly<{ kind: "bank-fast-travel"; charges: number }>
  | Readonly<{ kind: "timed-buff"; buff: "hearthward" | "gloamstep" | "tidebreath" | "peppermint-rush" | "marshmallow-ward" | "moonstep"; durationSeconds: number }>;

export type AlchemyRecipe = Readonly<{
  id: string;
  name: string;
  description: string;
  inputs: readonly RecipeIngredient[];
  output: ResourceStack;
  brewSeconds: number;
  blueprintId: string | null;
  effect: PotionEffect | null;
}>;

export type DistilleryRecipe = Readonly<{
  id: string;
  name: string;
  description: string;
  inputs: readonly RecipeIngredient[];
  output: ResourceStack;
  fermentSeconds: number;
  blueprintId: string;
}>;

export const ALCHEMY_RECIPES: readonly AlchemyRecipe[] = Object.freeze([
  {
    id: "fill-water-bottle",
    name: "Water Bottle",
    description: "Fill a clean glass bottle from an adjacent water source.",
    inputs: [{ item: "glass-bottle", count: 1 }, { item: "water-source", count: 1, consume: false }],
    output: { item: "water-bottle", count: 1 },
    brewSeconds: 1,
    blueprintId: null,
    effect: null,
  },
  {
    id: "appleheart-potion",
    name: "Appleheart Potion",
    description: "A bright restorative draught with familiar orchard sweetness.",
    inputs: [{ item: "water-bottle", count: 1 }, { item: "apple", count: 2 }, { item: "moonberry", count: 1 }],
    output: { item: "appleheart-potion", count: 1 },
    brewSeconds: 18,
    blueprintId: null,
    effect: { kind: "heal", amount: 8 },
  },
  {
    id: "wayfarer-draught",
    name: "Wayfarer's Draught",
    description: "Banks one stable journey to a known POI, bed spawn, or wayshrine.",
    inputs: [{ item: "water-bottle", count: 1 }, { item: "moonberry", count: 2 }, { item: "glow-scale", count: 1 }],
    output: { item: "wayfarer-draught", count: 1 },
    brewSeconds: 45,
    blueprintId: null,
    effect: { kind: "bank-fast-travel", charges: 1 },
  },
  {
    id: "hearthward-tonic",
    name: "Hearthward Tonic",
    description: "Hobbit herbcraft that wards cold and softens incoming harm.",
    inputs: [{ item: "water-bottle", count: 1 }, { item: "apple", count: 1 }, { item: "honey-jar", count: 1 }, { item: "cloudbell", count: 1 }],
    output: { item: "hearthward-tonic", count: 1 },
    brewSeconds: 36,
    blueprintId: "hobbit-hearthward-tonic",
    effect: { kind: "timed-buff", buff: "hearthward", durationSeconds: 180 },
  },
  {
    id: "gloamstep-elixir",
    name: "Gloamstep Elixir",
    description: "Goblin cavecraft for low-light sight and sure underground footing.",
    inputs: [{ item: "water-bottle", count: 1 }, { item: "cave-gel", count: 1 }, { item: "wild-wheat", count: 1 }, { item: "glow-scale", count: 1 }],
    output: { item: "gloamstep-elixir", count: 1 },
    brewSeconds: 42,
    blueprintId: "goblin-gloamstep-elixir",
    effect: { kind: "timed-buff", buff: "gloamstep", durationSeconds: 240 },
  },
  {
    id: "tidebreath-philter",
    name: "Tidebreath Philter",
    description: "Lumen kelp and abyss-bloom nectar hold a pocket of living current in the lungs.",
    inputs: [{ item: "water-bottle", count: 1 }, { item: "lumen-kelp-frond", count: 2 }, { item: "abyss-bloom-nectar", count: 1 }],
    output: { item: "tidebreath-philter", count: 1 },
    brewSeconds: 34,
    blueprintId: null,
    effect: { kind: "timed-buff", buff: "tidebreath", durationSeconds: 300 },
  },
  {
    id: "peppermint-rush",
    name: "Peppermint Rush",
    description: "Ribbon-bright mint and a wild gumdrop lend quick feet without shortening the road ahead.",
    inputs: [{ item: "water-bottle", count: 1 }, { item: "peppermint-cane", count: 2 }, { item: "gumdrop", count: 1 }],
    output: { item: "peppermint-rush", count: 1 },
    brewSeconds: 38,
    blueprintId: "sugarcourt-peppermint-rush",
    effect: { kind: "timed-buff", buff: "peppermint-rush", durationSeconds: 180 },
  },
  {
    id: "marshmallow-ward",
    name: "Marshmallow Ward",
    description: "Honey suspends a soft marshmallow charm that cushions harm and knockback.",
    inputs: [{ item: "water-bottle", count: 1 }, { item: "marshmallow-tuft", count: 2 }, { item: "honey-jar", count: 1 }],
    output: { item: "marshmallow-ward", count: 1 },
    brewSeconds: 44,
    blueprintId: "sugarcourt-marshmallow-ward",
    effect: { kind: "timed-buff", buff: "marshmallow-ward", durationSeconds: 210 },
  },
  {
    id: "manaheart-draught",
    name: "Manaheart Draught",
    description: "Raw gold steadies the enduring spark drawn from any elemental dragon heart.",
    inputs: [
      { item: "water-bottle", count: 1 },
      { item: "raw-gold", count: 4 },
      {
        item: "dragon-heart",
        count: 1,
        alternatives: ["fire-dragon-heart", "ice-dragon-heart", "steel-dragon-heart", "sea-dragon-heart", "gold-dragon-heart", "silver-dragon-heart"],
      },
    ],
    output: { item: "manaheart-draught", count: 1 },
    brewSeconds: 90,
    blueprintId: null,
    effect: null,
  },
  {
    id: "moonstep-elixir",
    name: "Moonstep Elixir",
    description: "Moonpetal and Dreamcap lend quiet speed beneath starlight and dense canopy.",
    inputs: [{ item: "water-bottle", count: 1 }, { item: "moonpetal", count: 2 }, { item: "dreamcap", count: 1 }],
    output: { item: "moonstep-elixir", count: 1 },
    brewSeconds: 44,
    blueprintId: "moonstep",
    effect: { kind: "timed-buff", buff: "moonstep", durationSeconds: 210 },
  },
  {
    id: "verdant-renewal",
    name: "Verdant Renewal",
    description: "Starfern and living Lumenreed knit cuts with a cool, clean pulse.",
    inputs: [{ item: "water-bottle", count: 1 }, { item: "starfern", count: 2 }, { item: "lumenreed-frond", count: 1 }, { item: "moonpetal", count: 1 }],
    output: { item: "verdant-renewal", count: 1 },
    brewSeconds: 52,
    blueprintId: "verdant-renewal",
    effect: { kind: "heal", amount: 6 },
  },
]);

export const DISTILLERY_RECIPES: readonly DistilleryRecipe[] = Object.freeze([
  {
    id: "honeymead-batch",
    name: "Honeymead Batch",
    description: "Slow-fermented honeymead, bottled four at a time.",
    inputs: [{ item: "water-bottle", count: 2 }, { item: "honey-jar", count: 3 }, { item: "wild-wheat", count: 2 }],
    output: { item: "honeymead", count: 4 },
    fermentSeconds: 240,
    blueprintId: "mead-distilling",
  },
]);

const ALCHEMY_BY_ID = new Map(ALCHEMY_RECIPES.map((recipe) => [recipe.id, recipe]));
const DISTILLERY_BY_ID = new Map(DISTILLERY_RECIPES.map((recipe) => [recipe.id, recipe]));

export type ActiveStationBatch = Readonly<{
  recipeId: string;
  progressSeconds: number;
  durationSeconds: number;
}>;

export type AlchemyStandState = Readonly<{
  schema: typeof ALCHEMY_SCHEMA;
  selectedRecipeId: string | null;
  activeBatch: ActiveStationBatch | null;
  output: ResourceStack | null;
}>;

export type DistilleryState = Readonly<{
  schema: typeof DISTILLERY_SCHEMA;
  selectedRecipeId: string | null;
  activeBatch: ActiveStationBatch | null;
  output: ResourceStack | null;
}>;

export type PotionConsumerState = Readonly<{
  health: number;
  maxHealth: number;
  fastTravelCharges: number;
  buffs: Readonly<Record<string, number>>;
}>;

const finite = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const cleanResourceId = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 96) : "";

export type AlchemyStationPosition = Readonly<{ x: number; y: number; z: number }>;

/**
 * Bounded spherical catalyst scan shared by the runtime and deterministic
 * tests. The callback owns the world's source/flow distinction, so a flowing
 * cell can never accidentally satisfy the alchemy contract.
 */
export function hasAlchemyWaterSourceWithin(
  origin: AlchemyStationPosition,
  radius: number,
  isWaterSourceAt: (x: number, y: number, z: number) => boolean,
) {
  const boundedRadius = clamp(Math.floor(finite(radius)), 0, 16);
  const radiusSquared = boundedRadius * boundedRadius;
  for (let dy = -boundedRadius; dy <= boundedRadius; dy += 1) {
    for (let dz = -boundedRadius; dz <= boundedRadius; dz += 1) {
      for (let dx = -boundedRadius; dx <= boundedRadius; dx += 1) {
        if (dx * dx + dy * dy + dz * dz > radiusSquared) continue;
        if (isWaterSourceAt(origin.x + dx, origin.y + dy, origin.z + dz)) return true;
      }
    }
  }
  return false;
}

export function normalizeResourceInventory(value: unknown): ResourceInventory {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized: Record<string, number> = {};
  for (const [rawId, rawCount] of Object.entries(value)) {
    const id = cleanResourceId(rawId);
    const count = clamp(Math.trunc(finite(rawCount)), 0, 999_999);
    if (id && count > 0) normalized[id] = count;
  }
  return normalized;
}

function normalizeOutput(value: unknown): ResourceStack | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<ResourceStack>;
  const item = cleanResourceId(input.item);
  const count = clamp(Math.trunc(finite(input.count)), 0, STATION_OUTPUT_CAP);
  return item && count > 0 ? { item, count } : null;
}

export function createAlchemyStand(): AlchemyStandState {
  return { schema: ALCHEMY_SCHEMA, selectedRecipeId: null, activeBatch: null, output: null };
}

export function createDistillery(): DistilleryState {
  return { schema: DISTILLERY_SCHEMA, selectedRecipeId: null, activeBatch: null, output: null };
}

function normalizeActiveBatch(value: unknown, durationFor: (recipeId: string) => number | null): ActiveStationBatch | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<ActiveStationBatch>;
  const recipeId = cleanResourceId(input.recipeId);
  const canonicalDuration = durationFor(recipeId);
  if (!recipeId || canonicalDuration === null) return null;
  return {
    recipeId,
    progressSeconds: clamp(finite(input.progressSeconds), 0, canonicalDuration),
    durationSeconds: canonicalDuration,
  };
}

export function normalizeAlchemyStand(value: unknown): AlchemyStandState {
  if (!value || typeof value !== "object") return createAlchemyStand();
  const input = value as Partial<AlchemyStandState>;
  const selectedRecipeId = typeof input.selectedRecipeId === "string" && ALCHEMY_BY_ID.has(input.selectedRecipeId) ? input.selectedRecipeId : null;
  return {
    schema: ALCHEMY_SCHEMA,
    selectedRecipeId,
    activeBatch: normalizeActiveBatch(input.activeBatch, (id) => ALCHEMY_BY_ID.get(id)?.brewSeconds ?? null),
    output: normalizeOutput(input.output),
  };
}

export function normalizeDistillery(value: unknown): DistilleryState {
  if (!value || typeof value !== "object") return createDistillery();
  const input = value as Partial<DistilleryState>;
  const selectedRecipeId = typeof input.selectedRecipeId === "string" && DISTILLERY_BY_ID.has(input.selectedRecipeId) ? input.selectedRecipeId : null;
  return {
    schema: DISTILLERY_SCHEMA,
    selectedRecipeId,
    activeBatch: normalizeActiveBatch(input.activeBatch, (id) => DISTILLERY_BY_ID.get(id)?.fermentSeconds ?? null),
    output: normalizeOutput(input.output),
  };
}

export function selectAlchemyRecipe(state: AlchemyStandState, recipeId: string | null): AlchemyStandState {
  const normalized = normalizeAlchemyStand(state);
  if (normalized.activeBatch) return normalized;
  return { ...normalized, selectedRecipeId: recipeId && ALCHEMY_BY_ID.has(recipeId) ? recipeId : null };
}

export function selectDistilleryRecipe(state: DistilleryState, recipeId: string | null): DistilleryState {
  const normalized = normalizeDistillery(state);
  if (normalized.activeBatch) return normalized;
  return { ...normalized, selectedRecipeId: recipeId && DISTILLERY_BY_ID.has(recipeId) ? recipeId : null };
}

function outputCanAccept(output: ResourceStack | null, stack: ResourceStack) {
  return (!output || output.item === stack.item) && (output?.count ?? 0) + stack.count <= STATION_OUTPUT_CAP;
}

export function ingredientAvailableCount(ingredient: RecipeIngredient, inventory: ResourceInventory) {
  const resourceIds = [...new Set([ingredient.item, ...(ingredient.alternatives ?? [])])];
  return resourceIds.reduce((total, resourceId) => total + (inventory[resourceId] ?? 0), 0);
}

function ingredientsAvailable(inventory: ResourceInventory, inputs: readonly RecipeIngredient[]) {
  return inputs.every((input) => ingredientAvailableCount(input, inventory) >= input.count);
}

function reserveIngredients(inventory: ResourceInventory, inputs: readonly RecipeIngredient[]) {
  const next = { ...inventory };
  for (const input of inputs) {
    if (input.consume === false) continue;
    let remaining = input.count;
    for (const resourceId of new Set([input.item, ...(input.alternatives ?? [])])) {
      const available = next[resourceId] ?? 0;
      const consumed = Math.min(available, remaining);
      const count = available - consumed;
      if (count > 0) next[resourceId] = count;
      else delete next[resourceId];
      remaining -= consumed;
      if (remaining <= 0) break;
    }
  }
  return next;
}

export function startAlchemyBatch(
  state: AlchemyStandState,
  recipeId: string,
  inventory: ResourceInventory,
  blueprints: BlueprintState,
) {
  const normalized = normalizeAlchemyStand(state);
  const resources = normalizeResourceInventory(inventory);
  const recipe = ALCHEMY_BY_ID.get(recipeId);
  if (!recipe) return { ok: false, reason: "unknown-recipe", state: normalized, inventory: resources } as const;
  if (normalized.activeBatch) return { ok: false, reason: "station-busy", state: normalized, inventory: resources } as const;
  if (!canCraftBlueprintRecipe(blueprints, recipe.id, recipe.blueprintId)) {
    return { ok: false, reason: "blueprint-locked", state: normalized, inventory: resources } as const;
  }
  if (!outputCanAccept(normalized.output, recipe.output)) return { ok: false, reason: "output-blocked", state: normalized, inventory: resources } as const;
  if (!ingredientsAvailable(resources, recipe.inputs)) return { ok: false, reason: "missing-inputs", state: normalized, inventory: resources } as const;
  return {
    ok: true,
    reason: null,
    state: {
      ...normalized,
      selectedRecipeId: recipe.id,
      activeBatch: { recipeId: recipe.id, progressSeconds: 0, durationSeconds: recipe.brewSeconds },
    },
    inventory: reserveIngredients(resources, recipe.inputs),
  } as const;
}

export function startDistilleryBatch(
  state: DistilleryState,
  recipeId: string,
  inventory: ResourceInventory,
  blueprints: BlueprintState,
) {
  const normalized = normalizeDistillery(state);
  const resources = normalizeResourceInventory(inventory);
  const recipe = DISTILLERY_BY_ID.get(recipeId);
  if (!recipe) return { ok: false, reason: "unknown-recipe", state: normalized, inventory: resources } as const;
  if (normalized.activeBatch) return { ok: false, reason: "station-busy", state: normalized, inventory: resources } as const;
  if (!canCraftBlueprintRecipe(blueprints, recipe.id, recipe.blueprintId)) {
    return { ok: false, reason: "blueprint-locked", state: normalized, inventory: resources } as const;
  }
  if (!outputCanAccept(normalized.output, recipe.output)) return { ok: false, reason: "output-blocked", state: normalized, inventory: resources } as const;
  if (!ingredientsAvailable(resources, recipe.inputs)) return { ok: false, reason: "missing-inputs", state: normalized, inventory: resources } as const;
  return {
    ok: true,
    reason: null,
    state: {
      ...normalized,
      selectedRecipeId: recipe.id,
      activeBatch: { recipeId: recipe.id, progressSeconds: 0, durationSeconds: recipe.fermentSeconds },
    },
    inventory: reserveIngredients(resources, recipe.inputs),
  } as const;
}

function stepStation<T extends AlchemyStandState | DistilleryState>(
  state: T,
  deltaSeconds: number,
  outputFor: (recipeId: string) => ResourceStack | null,
) {
  if (!state.activeBatch) return state;
  const progressSeconds = clamp(state.activeBatch.progressSeconds + clamp(finite(deltaSeconds), 0, 86_400), 0, state.activeBatch.durationSeconds);
  if (progressSeconds < state.activeBatch.durationSeconds) {
    return { ...state, activeBatch: { ...state.activeBatch, progressSeconds } };
  }
  const produced = outputFor(state.activeBatch.recipeId);
  if (!produced || !outputCanAccept(state.output, produced)) return { ...state, activeBatch: { ...state.activeBatch, progressSeconds } };
  return {
    ...state,
    activeBatch: null,
    output: { item: produced.item, count: (state.output?.count ?? 0) + produced.count },
  };
}

export function stepAlchemyStand(state: AlchemyStandState, deltaSeconds: number): AlchemyStandState {
  return stepStation(normalizeAlchemyStand(state), deltaSeconds, (id) => ALCHEMY_BY_ID.get(id)?.output ?? null);
}

export function stepDistillery(state: DistilleryState, deltaSeconds: number): DistilleryState {
  return stepStation(normalizeDistillery(state), deltaSeconds, (id) => DISTILLERY_BY_ID.get(id)?.output ?? null);
}

function collectOutput<T extends AlchemyStandState | DistilleryState>(state: T, requested = STATION_OUTPUT_CAP) {
  if (!state.output) return { state, collected: null } as const;
  const count = clamp(Math.trunc(finite(requested)), 1, state.output.count);
  const collected = { item: state.output.item, count };
  const remaining = state.output.count - count;
  return { state: { ...state, output: remaining > 0 ? { ...state.output, count: remaining } : null }, collected } as const;
}

export function collectAlchemyOutput(state: AlchemyStandState, requested?: number) {
  return collectOutput(normalizeAlchemyStand(state), requested);
}

export function collectDistilleryOutput(state: DistilleryState, requested?: number) {
  return collectOutput(normalizeDistillery(state), requested);
}

export function alchemyRecipe(recipeId: string) {
  return ALCHEMY_BY_ID.get(recipeId) ?? null;
}

export function distilleryRecipe(recipeId: string) {
  return DISTILLERY_BY_ID.get(recipeId) ?? null;
}

export function applyPotionEffect(state: PotionConsumerState, recipeId: string, nowSeconds: number): PotionConsumerState {
  const effect = ALCHEMY_BY_ID.get(recipeId)?.effect;
  if (!effect) return state;
  if (effect.kind === "heal") return { ...state, health: Math.min(state.maxHealth, state.health + effect.amount) };
  if (effect.kind === "bank-fast-travel") return { ...state, fastTravelCharges: clamp(state.fastTravelCharges + effect.charges, 0, 999) };
  return {
    ...state,
    buffs: { ...state.buffs, [effect.buff]: Math.max(state.buffs[effect.buff] ?? 0, finite(nowSeconds) + effect.durationSeconds) },
  };
}
