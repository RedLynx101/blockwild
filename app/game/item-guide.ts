import { ALCHEMY_RECIPES, DISTILLERY_RECIPES } from "./alchemy";
import { SUGARWORKS_RECIPES } from "./candyworks";
import { BLOCKS, ITEMS, RECIPES, SMELTING, type Ingredient, type ItemCode } from "./data";
import { resourceItemCode } from "./hearthroads-adapter";
import { MOB_DEFS } from "./mobs";
import { PLANTS } from "./plants";

export type ItemGuideStation = "Hand crafting" | "Crafting table" | "Furnace" | "Alchemy Stand" | "Distillery" | "Sugarworks";
export type ItemGuideIngredient = Readonly<{ items: readonly ItemCode[]; count: number; label: string }>;
export type ItemGuideProcess = Readonly<{
  id: string;
  name: string;
  station: ItemGuideStation;
  description: string;
  inputs: readonly ItemGuideIngredient[];
  outputItem: ItemCode;
  outputCount: number;
  craftingRecipeId: string | null;
  blueprintId: string | null;
}>;

export type ItemGuideEntry = Readonly<{
  item: ItemCode;
  name: string;
  description: string;
  origins: readonly string[];
  madeBy: readonly ItemGuideProcess[];
  usedIn: readonly ItemGuideProcess[];
}>;

const names = (items: readonly ItemCode[]) => items.map((item) => ITEMS[item]?.name ?? `Item ${item}`).join(" or ");
const ingredientKey = (ingredient: Ingredient) => (Array.isArray(ingredient) ? [...ingredient].sort((a, b) => a - b) : [ingredient]).join("|");

function craftingInputs(pattern: readonly (Ingredient | 0)[]) {
  const grouped = new Map<string, { items: ItemCode[]; count: number }>();
  for (const ingredient of pattern) {
    if (ingredient === 0) continue;
    const items = (Array.isArray(ingredient) ? ingredient : [ingredient]) as ItemCode[];
    const key = ingredientKey(ingredient);
    const current = grouped.get(key);
    if (current) current.count += 1;
    else grouped.set(key, { items: [...items], count: 1 });
  }
  return [...grouped.values()].map(({ items, count }) => ({ items, count, label: names(items) }));
}

function resourceInputs(inputs: readonly Readonly<{ item: string; count: number; alternatives?: readonly string[] }>[]) {
  return inputs.map((input) => {
    const resources = [input.item, ...(input.alternatives ?? [])];
    const items = resources.map(resourceItemCode).filter((item): item is ItemCode => item !== null);
    return { items, count: input.count, label: items.length ? names(items) : input.item.replace(/-/gu, " ") };
  });
}

export function buildItemGuideProcesses(): readonly ItemGuideProcess[] {
  const processes: ItemGuideProcess[] = RECIPES.map((recipe) => ({
    id: `craft:${recipe.id}`,
    name: recipe.name,
    station: recipe.table ? "Crafting table" : "Hand crafting",
    description: recipe.blueprint ? `A shaped recipe learned from the ${recipe.blueprint.replace(/-/gu, " ")} blueprint.` : "Arrange the shown ingredients on a crafting board.",
    inputs: craftingInputs(recipe.pattern),
    outputItem: recipe.output.item,
    outputCount: recipe.output.count,
    craftingRecipeId: recipe.id,
    blueprintId: recipe.blueprint ?? null,
  }));
  for (const [input, output] of Object.entries(SMELTING)) processes.push({
    id: `smelt:${input}`,
    name: `Smelt ${ITEMS[Number(input)]?.name ?? input}`,
    station: "Furnace",
    description: `Fuel a Furnace to refine ${ITEMS[Number(input)]?.name ?? "the input"}.`,
    inputs: [{ items: [Number(input)], count: 1, label: ITEMS[Number(input)]?.name ?? input }],
    outputItem: output.item,
    outputCount: output.count,
    craftingRecipeId: null,
    blueprintId: null,
  });
  for (const recipe of ALCHEMY_RECIPES) {
    const output = resourceItemCode(recipe.output.item);
    if (output === null) continue;
    processes.push({ id: `alchemy:${recipe.id}`, name: recipe.name, station: "Alchemy Stand", description: recipe.description,
      inputs: resourceInputs(recipe.inputs), outputItem: output, outputCount: recipe.output.count,
      craftingRecipeId: null, blueprintId: recipe.blueprintId });
  }
  for (const recipe of DISTILLERY_RECIPES) {
    const output = resourceItemCode(recipe.output.item);
    if (output === null) continue;
    processes.push({ id: `distillery:${recipe.id}`, name: recipe.name, station: "Distillery", description: recipe.description,
      inputs: resourceInputs(recipe.inputs), outputItem: output, outputCount: recipe.output.count,
      craftingRecipeId: null, blueprintId: recipe.blueprintId });
  }
  for (const recipe of SUGARWORKS_RECIPES) {
    const output = resourceItemCode(recipe.output.item);
    if (output === null) continue;
    processes.push({ id: `sugarworks:${recipe.id}`, name: recipe.name, station: "Sugarworks", description: recipe.description,
      inputs: resourceInputs(recipe.inputs), outputItem: output, outputCount: recipe.output.count,
      craftingRecipeId: null, blueprintId: recipe.blueprintId });
  }
  return Object.freeze(processes.sort((left, right) => left.name.localeCompare(right.name) || left.id.localeCompare(right.id)));
}

const unique = (values: readonly string[]) => Object.freeze([...new Set(values.filter(Boolean))]);

function entryDescription(item: ItemCode, madeBy: readonly ItemGuideProcess[], plantUtilities: readonly string[]) {
  const definition = ITEMS[item];
  if (definition.legendaryEffect) return definition.legendaryEffect;
  const stationDescription = madeBy.find((process) => !process.description.startsWith("Arrange "))?.description;
  if (stationDescription) return stationDescription;
  if (plantUtilities.length) return plantUtilities[0];
  const traits = [
    definition.food ? `Restores ${definition.food} hunger when eaten.` : "",
    definition.damage ? `Deals ${definition.damage} base attack damage.` : "",
    definition.miningSpeed ? `Works at ${definition.miningSpeed} base mining speed.` : "",
    definition.armor ? `Provides ${definition.armor} armor.` : "",
    definition.placeBlock !== undefined ? `Places ${BLOCKS[definition.placeBlock]?.name ?? definition.name} in the world.` : "",
    definition.useKind === "blueprint" ? "Read it to permanently unlock its associated design." : "",
    definition.useKind === "spell-tome" ? "A reusable tome that teaches a recorded spell." : "",
  ].filter(Boolean);
  return traits.length
    ? `${definition.name} has these field properties: ${traits.join(" ")}`
    : `${definition.name} is a registered Blockwild material, tool, furnishing, or field find.`;
}

export function buildItemGuideEntries(processes: readonly ItemGuideProcess[] = buildItemGuideProcesses()): readonly ItemGuideEntry[] {
  const definitions = Object.values(ITEMS).sort((left, right) => left.name.localeCompare(right.name) || left.id - right.id);
  return Object.freeze(definitions.map((definition) => {
    const item = definition.id;
    const madeBy = processes.filter((process) => process.outputItem === item);
    const usedIn = processes.filter((process) => process.inputs.some((input) => input.items.includes(item)));
    const plantSources = PLANTS.filter((plant) => plant.drops.some((drop) => drop.item === item));
    const creatureSources = Object.values(MOB_DEFS).filter((mob) => mob.drops.some((drop) => drop.item === item));
    const origins = unique([
      ...madeBy.map((process) => `${process.station}: ${process.name}${process.blueprintId ? ` (requires ${process.blueprintId.replace(/-/gu, " ")} blueprint)` : ""}.`),
      ...plantSources.map((plant) => `${plant.name}: ${plant.habitat}.`),
      ...creatureSources.map((mob) => `${mob.name}: ${mob.habitat}.`),
      ...(madeBy.length || plantSources.length || creatureSources.length ? []
        : definition.placeBlock !== undefined ? [`Collect or recover ${BLOCKS[definition.placeBlock]?.name ?? definition.name} from placed world blocks.`]
          : definition.useKind === "blueprint" ? ["Faction merchants, quests, and authored treasure pools can carry this blueprint."]
            : ["Exploration, authored loot, creature care, or faction commerce supplies this registered item."]),
    ]);
    return Object.freeze({
      item,
      name: definition.name,
      description: entryDescription(item, madeBy, plantSources.map((plant) => plant.utility)),
      origins,
      madeBy: Object.freeze([...madeBy]),
      usedIn: Object.freeze([...usedIn]),
    });
  }));
}

export const ITEM_GUIDE_PROCESSES = buildItemGuideProcesses();
export const ITEM_GUIDE_ENTRIES = buildItemGuideEntries(ITEM_GUIDE_PROCESSES);

export function itemGuideMatches(entry: ItemGuideEntry, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [entry.name, entry.description, ...entry.origins, ...entry.madeBy.map((recipe) => recipe.name), ...entry.usedIn.map((recipe) => recipe.name)]
    .some((value) => value.toLocaleLowerCase().includes(normalized));
}
