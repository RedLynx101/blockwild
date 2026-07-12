/**
 * Save-friendly recipe knowledge. Blueprint items are consumed only when they
 * teach something new; duplicate finds remain valuable trade goods.
 */

export const BLUEPRINT_SCHEMA = 1 as const;
export const MAX_UNLOCKED_BLUEPRINTS = 512;

export type BlueprintFaction = "hobbits" | "goblins" | "sugarcourt" | "wood-elves" | "dwarves" | "waykeepers" | "neutral";

export type BlueprintDefinition = Readonly<{
  id: string;
  name: string;
  description: string;
  faction: BlueprintFaction;
  recipeIds: readonly string[];
  resaleGold: number;
}>;

export const BLUEPRINTS: readonly BlueprintDefinition[] = Object.freeze([
  {
    id: "hobbit-crossbow",
    name: "Hearthguard Crossbow Blueprint",
    description: "Teaches the sturdy first-tier crossbow used by Hobbit wardens.",
    faction: "hobbits",
    recipeIds: ["hearthguard-crossbow", "crossbow-bolts"],
    resaleGold: 85,
  },
  {
    id: "hobbit-wayfarer-crossbow",
    name: "Wayfarer Crossbow Blueprint",
    description: "Teaches a more durable, harder-hitting crossbow mechanism.",
    faction: "hobbits",
    recipeIds: ["wayfarer-crossbow"],
    resaleGold: 240,
  },
  {
    id: "goblin-spear",
    name: "Goblinsmith Spear Blueprint",
    description: "Teaches a balanced reach weapon with a replaceable head.",
    faction: "goblins",
    recipeIds: ["goblinsmith-spear"],
    resaleGold: 70,
  },
  {
    id: "goblin-gloamstep-elixir",
    name: "Gloamstep Elixir Blueprint",
    description: "A Goblin formula for sure footing and clear sight underground.",
    faction: "goblins",
    recipeIds: ["gloamstep-elixir"],
    resaleGold: 110,
  },
  {
    id: "hobbit-hearthward-tonic",
    name: "Hearthward Tonic Blueprint",
    description: "A Hobbit tonic that grants warmth and brief damage resistance.",
    faction: "hobbits",
    recipeIds: ["hearthward-tonic"],
    resaleGold: 125,
  },
  {
    id: "mead-distilling",
    name: "Honeymead Distilling Blueprint",
    description: "Teaches a patient barrel fermentation for bottled honeymead.",
    faction: "hobbits",
    recipeIds: ["honeymead-batch"],
    resaleGold: 95,
  },
  {
    id: "sugarcourt-arms",
    name: "Sugarcourt Arms Blueprint",
    description: "Teaches the Sugarworks tempering patterns for a Rockcandy Saber and Peppermint Pike.",
    faction: "sugarcourt",
    recipeIds: ["sugarcourt-rockcandy-saber", "sugarcourt-peppermint-pike"],
    resaleGold: 190,
  },
  {
    id: "sugarcourt-armor",
    name: "Sugarplate Armor Pattern",
    description: "Teaches all four resilient layers of glazed Fondant armor.",
    faction: "sugarcourt",
    recipeIds: [
      "sugarcourt-fondant-crown",
      "sugarcourt-fondant-cuirass",
      "sugarcourt-fondant-greaves",
      "sugarcourt-fondant-boots",
    ],
    resaleGold: 280,
  },
  {
    id: "sugarcourt-peppermint-rush",
    name: "Peppermint Rush Formula",
    description: "A Sugarcourt formula for a brisk, clear-footed burst of travel speed.",
    faction: "sugarcourt",
    recipeIds: ["peppermint-rush"],
    resaleGold: 125,
  },
  {
    id: "sugarcourt-marshmallow-ward",
    name: "Marshmallow Ward Formula",
    description: "A pillowy ward that softens hard blows and dangerous knockback.",
    faction: "sugarcourt",
    recipeIds: ["marshmallow-ward"],
    resaleGold: 145,
  },
  {
    id: "dragonbone-arms",
    name: "Dragonbone Arms Treatise",
    description: "A rare field treatise for shaping dragon bone into a greatsword, pickaxe, and mirrored axe.",
    faction: "neutral",
    recipeIds: ["dragonbone-greatsword", "dragonbone-pickaxe", "dragonbone-axe"],
    resaleGold: 520,
  },
  {
    id: "dragon-scale-armor",
    name: "Dragon Scale Armor Treatise",
    description: "Teaches all twelve Ember, Rime, and Steel scale armor patterns without making the elements interchangeable.",
    faction: "neutral",
    recipeIds: [
      "fire-scale-helm", "fire-scale-plate", "fire-scale-greaves", "fire-scale-boots",
      "ice-scale-helm", "ice-scale-plate", "ice-scale-greaves", "ice-scale-boots",
      "steel-scale-helm", "steel-scale-plate", "steel-scale-greaves", "steel-scale-boots",
    ],
    resaleGold: 780,
  },
  {
    id: "draconic-incubator",
    name: "Draconic Incubator Schematics",
    description: "Teaches a crystal-regulated chamber that safely supplies the distinct heat, freezing, or steam cycle each egg requires.",
    faction: "neutral",
    recipeIds: ["draconic-incubator"],
    resaleGold: 680,
  },
  {
    id: "dragon-husbandry",
    name: "Dragon Husbandry Codex",
    description: "Teaches Dragon Meal, flight tack, paired panniers, fitted armor, and same-element breeding catalysts.",
    faction: "neutral",
    recipeIds: [
      "dragon-meal", "dragonflight-saddle", "dragon-pannier",
      "ember-dragon-armor", "rime-dragon-armor", "steel-dragon-armor", "tideglass-dragon-armor",
      "solar-regalia-dragon-armor", "moonmirror-dragon-armor",
      "emberlily-catalyst", "frostlily-catalyst", "ferric-lotus-catalyst", "sunlily-catalyst", "moonlily-catalyst",
    ],
    resaleGold: 740,
  },
  {
    id: "glimmerbow",
    name: "Glimmerbow Pattern",
    description: "Teaches the living-wood bow and its moonlit string geometry.",
    faction: "wood-elves",
    recipeIds: ["glimmerbow"],
    resaleGold: 780,
  },
  {
    id: "moonstep",
    name: "Moonstep Elixir Formula",
    description: "Teaches the Moonbough alchemy used to move lightly through the dark.",
    faction: "wood-elves",
    recipeIds: ["moonstep-elixir"],
    resaleGold: 560,
  },
  {
    id: "verdant-renewal",
    name: "Verdant Renewal Formula",
    description: "Teaches a restorative draught of luminous grove plants.",
    faction: "wood-elves",
    recipeIds: ["verdant-renewal"],
    resaleGold: 680,
  },
  {
    id: "flintlock-pistol",
    name: "Deepgear Flintlock Blueprint",
    description: "Teaches the compact Deepgear pistol and cast ammunition.",
    faction: "dwarves",
    recipeIds: ["flintlock-pistol", "flintlock-balls"],
    resaleGold: 940,
  },
  {
    id: "golem-copper-scout",
    name: "Copper Scout Blueprint",
    description: "Authorizes a Golem Forge to wake a nimble copper scout.",
    faction: "dwarves",
    recipeIds: [],
    resaleGold: 720,
  },
  {
    id: "golem-stone-bulwark",
    name: "Stone Bulwark Blueprint",
    description: "Authorizes a Golem Forge to assemble a defensive stone automaton.",
    faction: "dwarves",
    recipeIds: [],
    resaleGold: 1_280,
  },
  {
    id: "golem-aetherforged-sentinel",
    name: "Aetherforged Sentinel Blueprint",
    description: "Authorizes the costly mana core and frame of a master sentinel.",
    faction: "dwarves",
    recipeIds: [],
    resaleGold: 2_650,
  },
  {
    id: "golem-deepgear-courser",
    name: "Deepgear Courser Blueprint",
    description: "Authorizes a Golem Forge to assemble a piston-legged brass riding construct.",
    faction: "dwarves",
    recipeIds: [],
    resaleGold: 1_860,
  },
]);

const BLUEPRINT_BY_ID = new Map(BLUEPRINTS.map((definition) => [definition.id, definition]));
const BLUEPRINT_BY_RECIPE = new Map(BLUEPRINTS.flatMap((definition) => definition.recipeIds.map((recipeId) => [recipeId, definition.id] as const)));

export type BlueprintState = Readonly<{
  schema: typeof BLUEPRINT_SCHEMA;
  unlocked: readonly string[];
  unlockedAt: Readonly<Record<string, number>>;
}>;

export type BlueprintUseResult = Readonly<{
  state: BlueprintState;
  outcome: "learned" | "already-known" | "unknown-blueprint" | "capacity-reached";
  consumeItem: boolean;
  resaleGold: number;
}>;

const cleanId = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 96) : "";
const finiteTimestamp = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;

export function createBlueprintState(): BlueprintState {
  return { schema: BLUEPRINT_SCHEMA, unlocked: [], unlockedAt: {} };
}

export function normalizeBlueprintState(value: unknown): BlueprintState {
  if (!value || typeof value !== "object") return createBlueprintState();
  const candidate = value as Partial<BlueprintState>;
  const unlocked = [...new Set((Array.isArray(candidate.unlocked) ? candidate.unlocked : [])
    .map(cleanId)
    .filter(Boolean))]
    .sort()
    .slice(0, MAX_UNLOCKED_BLUEPRINTS);
  const sourceTimes = candidate.unlockedAt && typeof candidate.unlockedAt === "object" ? candidate.unlockedAt : {};
  const unlockedAt = Object.fromEntries(unlocked.map((id) => [id, finiteTimestamp(sourceTimes[id])]));
  return { schema: BLUEPRINT_SCHEMA, unlocked, unlockedAt };
}

export function blueprintDefinition(id: string) {
  return BLUEPRINT_BY_ID.get(id) ?? null;
}

export function blueprintForRecipe(recipeId: string) {
  return BLUEPRINT_BY_RECIPE.get(recipeId) ?? null;
}

export function hasBlueprint(state: BlueprintState, blueprintId: string) {
  return state.unlocked.includes(blueprintId);
}

export function canCraftBlueprintRecipe(state: BlueprintState, recipeId: string, explicitBlueprintId?: string | null) {
  const blueprintId = explicitBlueprintId ?? blueprintForRecipe(recipeId);
  return !blueprintId || hasBlueprint(state, blueprintId);
}

export function blueprintCraftingLock(state: BlueprintState, recipeId: string, explicitBlueprintId?: string | null) {
  const blueprintId = explicitBlueprintId ?? blueprintForRecipe(recipeId);
  if (!blueprintId || hasBlueprint(state, blueprintId)) return null;
  const definition = blueprintDefinition(blueprintId);
  return {
    blueprintId,
    message: definition ? `Learn ${definition.name} before making this.` : "A blueprint is required before making this.",
  } as const;
}

export function blueprintResaleValue(blueprintId: string) {
  return blueprintDefinition(blueprintId)?.resaleGold ?? 0;
}

export function useBlueprintItem(state: BlueprintState, blueprintId: string, learnedAt: number): BlueprintUseResult {
  const normalized = normalizeBlueprintState(state);
  const definition = blueprintDefinition(blueprintId);
  if (!definition) return { state: normalized, outcome: "unknown-blueprint", consumeItem: false, resaleGold: 0 };
  if (hasBlueprint(normalized, blueprintId)) {
    return { state: normalized, outcome: "already-known", consumeItem: false, resaleGold: definition.resaleGold };
  }
  if (normalized.unlocked.length >= MAX_UNLOCKED_BLUEPRINTS) {
    return { state: normalized, outcome: "capacity-reached", consumeItem: false, resaleGold: definition.resaleGold };
  }
  const unlocked = [...normalized.unlocked, blueprintId].sort();
  return {
    state: {
      schema: BLUEPRINT_SCHEMA,
      unlocked,
      unlockedAt: { ...normalized.unlockedAt, [blueprintId]: finiteTimestamp(learnedAt) },
    },
    outcome: "learned",
    consumeItem: true,
    resaleGold: definition.resaleGold,
  };
}
