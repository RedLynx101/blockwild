import { BlockId, Item, type ItemCode } from "./data";

/** Save-friendly field-guide data for flora. Creature observations live elsewhere. */
export const PLANT_BESTIARY_SCHEMA = 1 as const;

export type PlantCategory = "tree" | "farm" | "bush" | "flower" | "aquatic" | "wild";

export type PlantDefinition = Readonly<{
  id: string;
  name: string;
  category: PlantCategory;
  blocks: readonly BlockId[];
  habitat: string;
  growth: string;
  utility: string;
  drops: readonly Readonly<{ item: ItemCode; label: string }>[];
}>;

export const PLANTS: readonly PlantDefinition[] = Object.freeze([
  { id: "wildwood", name: "Wildwood Tree", category: "tree", blocks: [BlockId.WildwoodLog, BlockId.WildwoodLeaves, BlockId.WildwoodSapling], habitat: "Temperate Wildwood", growth: "Saplings need living soil and open sky.", utility: "Reliable timber, sticks, charcoal and sparse falling leaves.", drops: [{ item: BlockId.WildwoodLog, label: "Wildwood logs" }, { item: BlockId.WildwoodSapling, label: "Saplings" }] },
  { id: "frostpine", name: "Frostpine", category: "tree", blocks: [BlockId.PineLog, BlockId.PineLeaves], habitat: "Taiga and snowfields", growth: "Cold-adapted evergreen with tall, layered crowns.", utility: "Dense construction wood and charcoal.", drops: [{ item: BlockId.PineLog, label: "Frostpine logs" }] },
  { id: "birchlight", name: "Birchlight", category: "tree", blocks: [BlockId.BirchLog, BlockId.BirchLeaves], habitat: "Bright woodland", growth: "Slender trunks favor open forest edges.", utility: "Pale decorative timber and charcoal.", drops: [{ item: BlockId.BirchLog, label: "Birchlight logs" }] },
  { id: "bloomwood", name: "Bloomwood", category: "tree", blocks: [BlockId.BloomLog, BlockId.BloomLeaves], habitat: "Bloomwood forest", growth: "Broad flowering crowns prefer moist soil.", utility: "Rose-toned timber and pollinator shelter.", drops: [{ item: BlockId.BloomLog, label: "Bloomwood logs" }] },
  { id: "wild-apple", name: "Wild Apple Tree", category: "tree", blocks: [BlockId.AppleSapling, BlockId.AppleLeaves, BlockId.AppleFruit], habitat: "Meadows and tended orchards", growth: "Plant a whole apple; fruit regrows beneath mature leaves.", utility: "Renewable food, animal feed and health-potion stock.", drops: [{ item: Item.Apple, label: "Wild apples" }] },
  { id: "wild-wheat", name: "Wild Wheat", category: "farm", blocks: [BlockId.WheatSprout, BlockId.WheatYoung, BlockId.WheatCrop], habitat: "Sparse wild patches and farmland", growth: "Fastest on tilled, hydrated soil. A scythe harvest replants it.", utility: "Bread, breeding feed and trade crop.", drops: [{ item: Item.Wheat, label: "Wheat" }, { item: Item.WheatSeeds, label: "Seeds" }] },
  { id: "moonberry", name: "Moonberry Bush", category: "bush", blocks: [BlockId.MoonberryShoot, BlockId.MoonberryBush, BlockId.MoonberryBushRipe], habitat: "Cool woodland and player gardens", growth: "Plant a berry; ripe fruit returns after harvest.", utility: "Food, creature care and alchemy reagent.", drops: [{ item: Item.Berry, label: "Moonberries" }] },
  { id: "sunberry", name: "Sunberry Bush", category: "bush", blocks: [BlockId.SunberryShoot, BlockId.SunberryBush, BlockId.SunberryBushRipe], habitat: "Savanna and sunny gardens", growth: "Plant a berry on living soil; right-click ripe bushes.", utility: "Food, trade crop and warm-toned potion reagent.", drops: [{ item: Item.Sunberry, label: "Sunberries" }] },
  { id: "ember-bloom", name: "Ember Bloom", category: "flower", blocks: [BlockId.RedFlower], habitat: "Temperate clearings", growth: "A hardy surface flower.", utility: "Pollinator forage, dye color and recipes.", drops: [{ item: BlockId.RedFlower, label: "Flower" }] },
  { id: "skybell", name: "Skybell", category: "flower", blocks: [BlockId.BlueFlower], habitat: "Moist grassland", growth: "Prefers exposed, rain-fed soil.", utility: "Pollinator forage and cool-toned alchemy.", drops: [{ item: BlockId.BlueFlower, label: "Flower" }] },
  { id: "sunpetal", name: "Sunpetal", category: "flower", blocks: [BlockId.Sunpetal], habitat: "Flower meadows", growth: "Thrives in dense meadow mosaics.", utility: "Butterfly forage and bright decoration.", drops: [{ item: BlockId.Sunpetal, label: "Flower" }] },
  { id: "moon-orchid", name: "Moon Orchid", category: "flower", blocks: [BlockId.MoonOrchid], habitat: "Meadow sanctuaries and dusk-clearings", growth: "A rarer flower that favors undisturbed ground.", utility: "Butterfly forage and wayfarer potion reagent.", drops: [{ item: BlockId.MoonOrchid, label: "Flower" }] },
  { id: "river-ribbon", name: "River Ribbon", category: "aquatic", blocks: [BlockId.RiverRibbon], habitat: "Shallow rivers", growth: "Shares its water cell rather than displacing the current.", utility: "Fish cover and decorative river planting.", drops: [{ item: BlockId.RiverRibbon, label: "River ribbon" }] },
  { id: "glow-kelp", name: "Glow Kelp", category: "aquatic", blocks: [BlockId.GlowKelp], habitat: "Ocean and underground water", growth: "Submerged strands draw trace minerals from stone.", utility: "Soft underwater light and aquatic cover.", drops: [{ item: BlockId.GlowKelp, label: "Glow kelp" }] },
  { id: "reed-bloom", name: "Reed Bloom", category: "aquatic", blocks: [BlockId.ReedBloom], habitat: "River margins and wetlands", growth: "Roots at the waterline.", utility: "Bird and dragonfly habitat, fiber and decoration.", drops: [{ item: BlockId.ReedBloom, label: "Reed bloom" }] },
  { id: "cloudbell", name: "Cloudbell", category: "flower", blocks: [BlockId.Cloudbell], habitat: "Cloudreed highlands", growth: "Wind-hardened highland flower.", utility: "Rare scenic flower and potion reagent.", drops: [{ item: BlockId.Cloudbell, label: "Cloudbell" }] },
  { id: "dune-brush", name: "Dune Brush", category: "wild", blocks: [BlockId.DesertShrub], habitat: "Desert and badlands", growth: "Conserves water beneath loose sand.", utility: "Dry fiber and desert cover.", drops: [{ item: Item.Fiber, label: "Plant fiber" }] },
  { id: "cactus", name: "Cactus", category: "wild", blocks: [BlockId.Cactus], habitat: "Desert", growth: "Slow-growing succulent on dry sand.", utility: "Landmark vegetation and future alchemy stock.", drops: [{ item: BlockId.Cactus, label: "Cactus" }] },
]);

const BY_ID = new Map(PLANTS.map((plant) => [plant.id, plant]));
const BY_BLOCK = new Map(PLANTS.flatMap((plant) => plant.blocks.map((block) => [block, plant] as const)));

export type PlantBestiaryState = Readonly<{
  schema: typeof PLANT_BESTIARY_SCHEMA;
  discovered: readonly string[];
}>;

export function createPlantBestiaryState(): PlantBestiaryState {
  return { schema: PLANT_BESTIARY_SCHEMA, discovered: [] };
}

export function normalizePlantBestiaryState(value: unknown): PlantBestiaryState {
  if (!value || typeof value !== "object") return createPlantBestiaryState();
  const candidate = value as Partial<PlantBestiaryState>;
  const discovered = [...new Set((Array.isArray(candidate.discovered) ? candidate.discovered : [])
    .filter((id): id is string => typeof id === "string" && BY_ID.has(id)))]
    .sort();
  return { schema: PLANT_BESTIARY_SCHEMA, discovered };
}

export function plantForBlock(block: BlockId | undefined) {
  return block === undefined ? null : BY_BLOCK.get(block) ?? null;
}

export function discoverPlant(state: PlantBestiaryState, plantId: string): PlantBestiaryState {
  if (!BY_ID.has(plantId) || state.discovered.includes(plantId)) return state;
  return { schema: PLANT_BESTIARY_SCHEMA, discovered: [...state.discovered, plantId].sort() };
}

export function discoverPlantBlock(state: PlantBestiaryState, block: BlockId | undefined): PlantBestiaryState {
  const plant = plantForBlock(block);
  return plant ? discoverPlant(state, plant.id) : state;
}
