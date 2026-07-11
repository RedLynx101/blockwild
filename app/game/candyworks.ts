import { canCraftBlueprintRecipe, type BlueprintState } from "./blueprints";
import { normalizeResourceInventory, type RecipeIngredient, type ResourceInventory, type ResourceStack } from "./alchemy";

export const SUGARWORKS_SCHEMA = 1 as const;
export const SUGARWORKS_OUTPUT_CAP = 64;

export type SugarworksRecipe = Readonly<{
  id: string;
  name: string;
  description: string;
  inputs: readonly RecipeIngredient[];
  output: ResourceStack;
  batchSeconds: number;
  blueprintId: string | null;
}>;

export const SUGARWORKS_RECIPES: readonly SugarworksRecipe[] = Object.freeze([
  {
    id: "sugarcourt-candied-alloy",
    name: "Tempered Candy Alloy",
    description: "Boils gumdrops, petals, and honey into a resilient candy-metal billet.",
    inputs: [{ item: "gumdrop", count: 4 }, { item: "lollipop-petal", count: 2 }, { item: "honey-jar", count: 1 }],
    output: { item: "candied-alloy", count: 2 },
    batchSeconds: 24,
    blueprintId: null,
  },
  {
    id: "sugarcourt-boiled-sugarbrick",
    name: "Boiled Sugarbricks",
    description: "Cocoa steadies a boiled gumdrop batch into strong translucent masonry.",
    inputs: [{ item: "gumdrop", count: 4 }, { item: "cocoa-nib", count: 1 }],
    output: { item: "boiled-sugarbrick", count: 4 },
    batchSeconds: 18,
    blueprintId: null,
  },
  {
    id: "sugarcourt-rockcandy-saber",
    name: "Rockcandy Saber",
    description: "Draws a candy-alloy edge across a crystal shard until it sets glass-hard.",
    inputs: [{ item: "candied-alloy", count: 4 }, { item: "crystal-shard", count: 2 }, { item: "lollipop-petal", count: 1 }],
    output: { item: "rockcandy-saber", count: 1 },
    batchSeconds: 42,
    blueprintId: "sugarcourt-arms",
  },
  {
    id: "sugarcourt-peppermint-pike",
    name: "Peppermint Pike",
    description: "Tempers a striped reach weapon around a Wildwood haft.",
    inputs: [{ item: "candied-alloy", count: 3 }, { item: "peppermint-cane", count: 2 }, { item: "stick", count: 2 }],
    output: { item: "peppermint-pike", count: 1 },
    batchSeconds: 38,
    blueprintId: "sugarcourt-arms",
  },
  {
    id: "sugarcourt-fondant-crown",
    name: "Sugarplate Crown",
    description: "Laminates a light protective crown from candy alloy and spun marshmallow.",
    inputs: [{ item: "candied-alloy", count: 3 }, { item: "marshmallow-tuft", count: 2 }],
    output: { item: "fondant-crown", count: 1 },
    batchSeconds: 34,
    blueprintId: "sugarcourt-armor",
  },
  {
    id: "sugarcourt-fondant-cuirass",
    name: "Sugarplate Cuirass",
    description: "Builds a layered candy-alloy coat around a yielding marshmallow lining.",
    inputs: [{ item: "candied-alloy", count: 8 }, { item: "marshmallow-tuft", count: 4 }],
    output: { item: "fondant-cuirass", count: 1 },
    batchSeconds: 58,
    blueprintId: "sugarcourt-armor",
  },
  {
    id: "sugarcourt-fondant-greaves",
    name: "Sugarplate Greaves",
    description: "Sets articulated candy plates without making the knees brittle.",
    inputs: [{ item: "candied-alloy", count: 6 }, { item: "marshmallow-tuft", count: 3 }],
    output: { item: "fondant-greaves", count: 1 },
    batchSeconds: 50,
    blueprintId: "sugarcourt-armor",
  },
  {
    id: "sugarcourt-fondant-boots",
    name: "Sugarplate Boots",
    description: "Glazes a flexible pair of roadworthy candy boots.",
    inputs: [{ item: "candied-alloy", count: 4 }, { item: "marshmallow-tuft", count: 2 }],
    output: { item: "fondant-boots", count: 1 },
    batchSeconds: 36,
    blueprintId: "sugarcourt-armor",
  },
]);

const RECIPES_BY_ID = new Map(SUGARWORKS_RECIPES.map((recipe) => [recipe.id, recipe]));

export type SugarworksBatch = Readonly<{
  recipeId: string;
  progressSeconds: number;
  durationSeconds: number;
}>;

export type SugarworksState = Readonly<{
  schema: typeof SUGARWORKS_SCHEMA;
  selectedRecipeId: string | null;
  activeBatch: SugarworksBatch | null;
  output: ResourceStack | null;
}>;

const finite = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));

export function sugarworksRecipe(recipeId: string) {
  return RECIPES_BY_ID.get(recipeId) ?? null;
}

export function createSugarworks(): SugarworksState {
  return { schema: SUGARWORKS_SCHEMA, selectedRecipeId: null, activeBatch: null, output: null };
}

function normalizeOutput(value: unknown): ResourceStack | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<ResourceStack>;
  const item = typeof candidate.item === "string" ? candidate.item.trim().slice(0, 96) : "";
  const count = clamp(Math.trunc(finite(candidate.count)), 0, SUGARWORKS_OUTPUT_CAP);
  return item && count > 0 ? { item, count } : null;
}

export function normalizeSugarworks(value: unknown): SugarworksState {
  if (!value || typeof value !== "object") return createSugarworks();
  const input = value as Partial<SugarworksState>;
  const selectedRecipeId = typeof input.selectedRecipeId === "string" && RECIPES_BY_ID.has(input.selectedRecipeId)
    ? input.selectedRecipeId
    : null;
  let activeBatch: SugarworksBatch | null = null;
  if (input.activeBatch && typeof input.activeBatch === "object") {
    const recipeId = typeof input.activeBatch.recipeId === "string" ? input.activeBatch.recipeId : "";
    const recipe = RECIPES_BY_ID.get(recipeId);
    if (recipe) activeBatch = {
      recipeId,
      progressSeconds: clamp(finite(input.activeBatch.progressSeconds), 0, recipe.batchSeconds),
      durationSeconds: recipe.batchSeconds,
    };
  }
  return { schema: SUGARWORKS_SCHEMA, selectedRecipeId, activeBatch, output: normalizeOutput(input.output) };
}

export function selectSugarworksRecipe(state: SugarworksState, recipeId: string | null): SugarworksState {
  const normalized = normalizeSugarworks(state);
  if (normalized.activeBatch) return normalized;
  return { ...normalized, selectedRecipeId: recipeId && RECIPES_BY_ID.has(recipeId) ? recipeId : null };
}

function outputCanAccept(output: ResourceStack | null, produced: ResourceStack) {
  return (!output || output.item === produced.item) && (output?.count ?? 0) + produced.count <= SUGARWORKS_OUTPUT_CAP;
}

export function startSugarworksBatch(
  state: SugarworksState,
  recipeId: string,
  inventory: ResourceInventory,
  blueprints: BlueprintState,
) {
  const normalized = normalizeSugarworks(state);
  const resources = normalizeResourceInventory(inventory);
  const recipe = RECIPES_BY_ID.get(recipeId);
  if (!recipe) return { ok: false, reason: "unknown-recipe", state: normalized, inventory: resources } as const;
  if (normalized.activeBatch) return { ok: false, reason: "station-busy", state: normalized, inventory: resources } as const;
  if (!canCraftBlueprintRecipe(blueprints, recipe.id, recipe.blueprintId)) {
    return { ok: false, reason: "blueprint-locked", state: normalized, inventory: resources } as const;
  }
  if (!outputCanAccept(normalized.output, recipe.output)) return { ok: false, reason: "output-blocked", state: normalized, inventory: resources } as const;
  if (!recipe.inputs.every((input) => (resources[input.item] ?? 0) >= input.count)) {
    return { ok: false, reason: "missing-inputs", state: normalized, inventory: resources } as const;
  }
  const nextInventory = { ...resources };
  for (const input of recipe.inputs) {
    if (input.consume === false) continue;
    const remaining = (nextInventory[input.item] ?? 0) - input.count;
    if (remaining > 0) nextInventory[input.item] = remaining;
    else delete nextInventory[input.item];
  }
  return {
    ok: true,
    reason: null,
    state: {
      ...normalized,
      selectedRecipeId: recipe.id,
      activeBatch: { recipeId: recipe.id, progressSeconds: 0, durationSeconds: recipe.batchSeconds },
    },
    inventory: nextInventory,
  } as const;
}

export function stepSugarworks(state: SugarworksState, deltaSeconds: number): SugarworksState {
  const normalized = normalizeSugarworks(state);
  const batch = normalized.activeBatch;
  if (!batch) return normalized;
  const progressSeconds = clamp(batch.progressSeconds + clamp(finite(deltaSeconds), 0, 86_400), 0, batch.durationSeconds);
  if (progressSeconds < batch.durationSeconds) return { ...normalized, activeBatch: { ...batch, progressSeconds } };
  const produced = RECIPES_BY_ID.get(batch.recipeId)?.output;
  if (!produced || !outputCanAccept(normalized.output, produced)) {
    return { ...normalized, activeBatch: { ...batch, progressSeconds } };
  }
  return {
    ...normalized,
    activeBatch: null,
    output: { item: produced.item, count: (normalized.output?.count ?? 0) + produced.count },
  };
}

export function collectSugarworksOutput(state: SugarworksState, requested = SUGARWORKS_OUTPUT_CAP) {
  const normalized = normalizeSugarworks(state);
  if (!normalized.output) return { state: normalized, collected: null } as const;
  const count = clamp(Math.trunc(finite(requested, 1)), 1, normalized.output.count);
  const collected = { item: normalized.output.item, count };
  const remaining = normalized.output.count - count;
  return {
    state: { ...normalized, output: remaining > 0 ? { ...normalized.output, count: remaining } : null },
    collected,
  } as const;
}
