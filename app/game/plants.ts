import { BlockId, Item, type ItemCode } from "./data";
import { BiomeId } from "./world";

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
  { id: "rainveil-tree", name: "Rainveil Tree", category: "tree", blocks: [BlockId.JungleLog, BlockId.JungleLeaves, BlockId.JungleSapling], habitat: "Rainveil Jungle", growth: "Massive connected crowns thrive in hot rainfall.", utility: "Dense green timber, canopy cover and future jungle construction.", drops: [{ item: Item.RainveilLog, label: "Rainveil logs" }, { item: Item.RainveilSapling, label: "Saplings" }] },
  { id: "sakurabloom-tree", name: "Sakurabloom Tree", category: "tree", blocks: [BlockId.SakuraLog, BlockId.SakuraLeaves, BlockId.SakuraSapling], habitat: "Sakurabloom Grove", growth: "Pale trunks support layered pink crowns.", utility: "Decorative timber, petals and pollinator shelter.", drops: [{ item: Item.SakurabloomLog, label: "Sakurabloom logs" }, { item: Item.SakurabloomSapling, label: "Saplings" }] },
  { id: "candywood-tree", name: "Candywood Tree", category: "tree", blocks: [BlockId.CandywoodLog, BlockId.CandywoodLeaves, BlockId.CandywoodSapling], habitat: "Sugarplum Vale", growth: "Connected striped trunks carry dense cotton-candy crowns.", utility: "Sugarcourt timber, candy furnishings and sweet-smoke fuel.", drops: [{ item: Item.CandywoodLogItem, label: "Candywood logs" }, { item: Item.CandywoodSaplingItem, label: "Candywood saplings" }] },
  { id: "wild-apple", name: "Wild Apple Tree", category: "tree", blocks: [BlockId.AppleSapling, BlockId.AppleLeaves, BlockId.AppleFruit], habitat: "Meadows and tended orchards", growth: "Plant a whole apple; fruit regrows beneath mature leaves.", utility: "Renewable food, animal feed and health-potion stock.", drops: [{ item: Item.Apple, label: "Wild apples" }] },
  { id: "wild-wheat", name: "Wild Wheat", category: "farm", blocks: [BlockId.WheatSprout, BlockId.WheatYoung, BlockId.WheatCrop], habitat: "Sparse wild patches and farmland", growth: "Fastest on tilled, hydrated soil. A scythe harvest replants it.", utility: "Bread, breeding feed and trade crop.", drops: [{ item: Item.Wheat, label: "Wheat" }, { item: Item.WheatSeeds, label: "Seeds" }] },
  { id: "moonrice", name: "Moonrice", category: "farm", blocks: [BlockId.MoonriceSprout, BlockId.MoonriceYoung, BlockId.MoonriceCrop], habitat: "Tended wetlands and rare Siltfen patches", growth: "Three stages on tilled soil; nearby water shortens each stage.", utility: "Soft staple food and a future fermentation grain.", drops: [{ item: Item.Moonrice, label: "Moonrice" }, { item: Item.MoonriceSeeds, label: "Seeds" }] },
  { id: "sunroot", name: "Sunroot", category: "farm", blocks: [BlockId.SunrootSprout, BlockId.SunrootYoung, BlockId.SunrootCrop], habitat: "Tended fields and rare Sunstep patches", growth: "Three sunny stages on tilled soil.", utility: "Hearty food, animal feed and warm alchemy stock.", drops: [{ item: Item.Sunroot, label: "Sunroot tubers" }, { item: Item.SunrootStarts, label: "Starts" }] },
  { id: "peppermint-cane", name: "Peppermint Cane", category: "farm", blocks: [BlockId.PeppermintSprout, BlockId.PeppermintYoung, BlockId.PeppermintCrop], habitat: "Sugarcourt farms and player fields", growth: "Three quick stages on tilled soil; nearby water speeds the crop.", utility: "Edible cane, Sugarworks recipes and Peppermint Rush brewing.", drops: [{ item: Item.PeppermintCane, label: "Peppermint canes" }, { item: Item.PeppermintSeeds, label: "Peppermint starts" }] },
  { id: "cocoa-puff", name: "Cocoa Puff", category: "farm", blocks: [BlockId.CocoaSprout, BlockId.CocoaYoung, BlockId.CocoaCrop], habitat: "Sugarcourt farms and player fields", growth: "Three stages on tilled soil, with fuller yields from hydrated plots.", utility: "Edible nibs, confectionery and potion stock.", drops: [{ item: Item.CocoaNib, label: "Cocoa puff nibs" }, { item: Item.CocoaSeeds, label: "Cocoa seeds" }] },
  { id: "field-cotton", name: "Field Cotton", category: "farm", blocks: [BlockId.CottonSprout, BlockId.CottonYoung, BlockId.CottonCrop], habitat: "Sparse temperate clearings and tended fields", growth: "Three stages on tilled soil; hydrated rows produce usable bolls sooner.", utility: "Bolls spin into string, and four lengths of string weave into Cloudwool for beds.", drops: [{ item: Item.CottonBoll, label: "Cotton bolls" }, { item: Item.CottonSeeds, label: "Cotton seeds" }] },
  { id: "suncrest-carrot", name: "Suncrest Carrot", category: "farm", blocks: [BlockId.SunCarrotSprout, BlockId.SunCarrotYoung, BlockId.SunCarrotCrop], habitat: "Rare sunny meadow and savanna patches; tended fields", growth: "A quick three-stage root crop on tilled soil.", utility: "Crisp food and the favorite lure of overworld rabbits.", drops: [{ item: Item.SunCarrot, label: "Suncrest carrots" }, { item: Item.SunCarrotSeeds, label: "Carrot seeds" }] },
  { id: "bluepod-bean", name: "Bluepod Bean", category: "farm", blocks: [BlockId.BluepodSprout, BlockId.BluepodYoung, BlockId.BluepodCrop], habitat: "Rare damp woodland and Siltfen edges; tended fields", growth: "A shade-tolerant three-stage field crop that still benefits from nearby water.", utility: "Renewable food, rabbit feed and a cool-toned future alchemy ingredient.", drops: [{ item: Item.BluepodBeans, label: "Bluepod beans" }, { item: Item.BluepodSeeds, label: "Bluepod seeds" }] },
  { id: "moonberry", name: "Moonberry Bush", category: "bush", blocks: [BlockId.MoonberryShoot, BlockId.MoonberryBush, BlockId.MoonberryBushRipe], habitat: "Cool woodland and player gardens", growth: "Plant a berry; ripe fruit returns after harvest.", utility: "Food, creature care and alchemy reagent.", drops: [{ item: Item.Berry, label: "Moonberries" }] },
  { id: "sunberry", name: "Sunberry Bush", category: "bush", blocks: [BlockId.SunberryShoot, BlockId.SunberryBush, BlockId.SunberryBushRipe], habitat: "Savanna and sunny gardens", growth: "Plant a berry on living soil; right-click ripe bushes.", utility: "Food, trade crop and warm-toned potion reagent.", drops: [{ item: Item.Sunberry, label: "Sunberries" }] },
  { id: "gumdrop-bush", name: "Gumdrop Bush", category: "bush", blocks: [BlockId.GumdropBush], habitat: "Sugarplum Vale understory", growth: "Plant a wild gumdrop on living soil to establish a new shrub.", utility: "Edible gumdrops, animal treats and confectionery stock.", drops: [{ item: Item.Gumdrop, label: "Wild gumdrops" }] },
  { id: "marshmallow-shrub", name: "Marshmallow Shrub", category: "bush", blocks: [BlockId.MarshmallowShrub], habitat: "Sparse Sugarplum Vale hollows", growth: "Soft cuttings root on living soil.", utility: "Edible tufts and the base of Marshmallow Ward draughts.", drops: [{ item: Item.MarshmallowTuft, label: "Marshmallow tufts" }] },
  { id: "ember-bloom", name: "Ember Bloom", category: "flower", blocks: [BlockId.RedFlower, BlockId.GiantEmberBloom], habitat: "Temperate clearings", growth: "On tilled soil it matures into a tall, high-yield cultivated flower.", utility: "Pollinator forage, dye color and recipes.", drops: [{ item: BlockId.RedFlower, label: "Flowers" }] },
  { id: "skybell", name: "Skybell", category: "flower", blocks: [BlockId.BlueFlower, BlockId.GiantSkybell], habitat: "Moist grassland", growth: "On tilled soil it matures into a tall, high-yield cultivated flower.", utility: "Pollinator forage and cool-toned alchemy.", drops: [{ item: BlockId.BlueFlower, label: "Flowers" }] },
  { id: "sunpetal", name: "Sunpetal", category: "flower", blocks: [BlockId.Sunpetal, BlockId.GiantSunpetal], habitat: "Flower meadows", growth: "Tilled soil produces a tall form that yields many blooms.", utility: "Butterfly forage and bright decoration.", drops: [{ item: BlockId.Sunpetal, label: "Flowers" }] },
  { id: "moon-orchid", name: "Moon Orchid", category: "flower", blocks: [BlockId.MoonOrchid, BlockId.GiantMoonOrchid], habitat: "Meadow sanctuaries and dusk-clearings", growth: "Tilled soil produces a tall form that yields many blooms.", utility: "Butterfly forage and wayfarer potion reagent.", drops: [{ item: BlockId.MoonOrchid, label: "Flowers" }] },
  { id: "river-ribbon", name: "River Ribbon", category: "aquatic", blocks: [BlockId.RiverRibbon], habitat: "Shallow rivers", growth: "Shares its water cell rather than displacing the current.", utility: "Fish cover and decorative river planting.", drops: [{ item: BlockId.RiverRibbon, label: "River ribbon" }] },
  { id: "glow-kelp", name: "Glow Kelp", category: "aquatic", blocks: [BlockId.GlowKelp], habitat: "Ocean and underground water", growth: "Submerged strands draw trace minerals from stone.", utility: "Soft underwater light and aquatic cover.", drops: [{ item: BlockId.GlowKelp, label: "Glow kelp" }] },
  { id: "reed-bloom", name: "Reed Bloom", category: "aquatic", blocks: [BlockId.ReedBloom], habitat: "River margins and wetlands", growth: "Roots at the waterline.", utility: "Bird and dragonfly habitat, fiber and decoration.", drops: [{ item: BlockId.ReedBloom, label: "Reed bloom" }] },
  { id: "lumen-kelp", name: "Lumen Kelp", category: "aquatic", blocks: [BlockId.LumenKelp], habitat: "Deep ocean and Lumen Trench", growth: "Replant on a submerged mineral bed; a waterlogged column grows up to seven cells.", utility: "Bioluminescent cover and Tidebreath reagent.", drops: [{ item: Item.LumenKelpFrond, label: "Lumen kelp fronds" }] },
  { id: "star-coral", name: "Star Coral", category: "aquatic", blocks: [BlockId.StarCoral], habitat: "Ocean shelves and trenches", growth: "A single waterlogged colony grows on stone, clay, gravel or sand.", utility: "Glowing decoration and durable coral shards.", drops: [{ item: Item.StarCoralShard, label: "Star coral shards" }] },
  { id: "abyss-bloom", name: "Abyss Bloom", category: "aquatic", blocks: [BlockId.AbyssBloom], habitat: "Lumen Trench", growth: "A rare waterlogged bloom limited to short colonies.", utility: "Its nectar is the active Tidebreath reagent.", drops: [{ item: Item.AbyssBloomNectar, label: "Abyss nectar" }] },
  { id: "tidevine", name: "Tidevine", category: "aquatic", blocks: [BlockId.Tidevine], habitat: "Coasts, ocean shelves and deep water", growth: "Replanted vines grow upward through water to five cells.", utility: "Strong wet fiber and fish shelter.", drops: [{ item: Item.TidevineFiber, label: "Tidevine fiber" }] },
  { id: "cloudbell", name: "Cloudbell", category: "flower", blocks: [BlockId.Cloudbell, BlockId.GiantCloudbell], habitat: "Cloudreed highlands", growth: "Wind-hardened in the wild; tilled soil supports a tall cultivated form.", utility: "Rare scenic flower and potion reagent.", drops: [{ item: BlockId.Cloudbell, label: "Cloudbells" }] },
  { id: "coast-aster", name: "Coast Aster", category: "flower", blocks: [BlockId.CoastAster, BlockId.GiantCoastAster], habitat: "Sparse Sunwash Coast patches", growth: "Salt-tolerant in sand; tilled soil supports a tall cultivated form.", utility: "Pollinator forage and fragrant petals.", drops: [{ item: Item.CoastAsterPetal, label: "Aster petals" }] },
  { id: "sakura-bloom", name: "Sakura Bloom", category: "flower", blocks: [BlockId.SakuraBloom, BlockId.GiantSakuraBloom], habitat: "Sakurabloom Grove", growth: "Tilled soil supports a tall, repeat-harvest form.", utility: "Pollinator forage and rose decoration.", drops: [{ item: Item.SakuraBloomItem, label: "Sakura blooms" }] },
  { id: "dreamblossom", name: "Dreamblossom", category: "flower", blocks: [BlockId.Dreamblossom, BlockId.GiantDreamblossom], habitat: "Rare Sakurabloom clearings", growth: "Tilled soil supports a luminous cultivated form.", utility: "Future sleep and dream alchemy reagent.", drops: [{ item: Item.DreamblossomItem, label: "Dreamblossoms" }] },
  { id: "lantern-lotus", name: "Lantern Lotus", category: "flower", blocks: [BlockId.LanternLotus, BlockId.GiantLanternLotus], habitat: "Rainveil Jungle clearings", growth: "Tilled soil supports a tall luminous form.", utility: "Pollinator beacon and future restorative ingredient.", drops: [{ item: Item.LanternLotusItem, label: "Lantern lotuses" }] },
  { id: "lollipop-orchid", name: "Lollipop Orchid", category: "flower", blocks: [BlockId.LollipopOrchid, BlockId.GiantLollipopOrchid], habitat: "Sugarplum Vale clearings", growth: "Tilled soil supports a tall, high-yield cultivated flower.", utility: "Bonbonwing forage, edible petals and bright Sugarcourt decoration.", drops: [{ item: Item.LollipopPetal, label: "Lollipop orchid petals" }] },
  { id: "wild-peppermint", name: "Wild Peppermint", category: "wild", blocks: [BlockId.PeppermintTuft], habitat: "Cool Sugarplum Vale slopes", growth: "A harvested cane can be replanted on living soil.", utility: "Fresh food, crop starts and speed-potion stock.", drops: [{ item: Item.PeppermintCane, label: "Peppermint cane" }] },
  { id: "rainveil-fern", name: "Rainveil Fern", category: "wild", blocks: [BlockId.RainveilFern], habitat: "Rainveil Jungle understory", growth: "Spreads sparsely beneath humid crowns.", utility: "Decorative groundcover and future herbal stock.", drops: [{ item: Item.RainveilFernItem, label: "Rainveil ferns" }] },
  { id: "saltbrush", name: "Saltbrush", category: "wild", blocks: [BlockId.Saltbrush], habitat: "Sparse Sunwash Coast patches", growth: "Survives salt spray above the tide line.", utility: "Salty sprigs for food and future coastal alchemy.", drops: [{ item: Item.SaltbrushSprig, label: "Saltbrush sprigs" }] },
  { id: "dune-brush", name: "Dune Brush", category: "wild", blocks: [BlockId.DesertShrub], habitat: "Desert and badlands", growth: "Conserves water beneath loose sand.", utility: "Dry fiber and desert cover.", drops: [{ item: Item.Fiber, label: "Plant fiber" }] },
  { id: "cactus", name: "Cactus", category: "wild", blocks: [BlockId.Cactus], habitat: "Desert", growth: "Slow-growing succulent on dry sand.", utility: "Landmark vegetation and future alchemy stock.", drops: [{ item: BlockId.Cactus, label: "Cactus" }] },
  { id: "mooncap-mushroom", name: "Mooncap Mushroom", category: "wild", blocks: [BlockId.MushroomCap], habitat: "Mooncap Fen hummocks", growth: "Large caps rise from saturated shaded soil.", utility: "Shelter for tiny fen life and a visible marker of deep humidity.", drops: [{ item: BlockId.MushroomCap, label: "Mushroom caps" }] },
  { id: "moonpetal", name: "Moonpetal", category: "flower", blocks: [BlockId.Moonpetal, BlockId.GiantMoonpetal], habitat: "Glimmerwood moonwells", growth: "Opens under dim light; tilled soil supports a taller cultivated form.", utility: "Dragon care, silver alchemy and luminous decoration.", drops: [{ item: Item.Moonpetal, label: "Moonpetals" }] },
  { id: "starfern", name: "Starfern", category: "wild", blocks: [BlockId.Starfern], habitat: "Glimmerwood and high Snowcap shelters", growth: "Spreads slowly over cool enchanted soil.", utility: "Glimmerbow craft, animal forage and low ground light.", drops: [{ item: Item.StarfernFrond, label: "Starfern fronds" }] },
  { id: "dreamcap", name: "Dreamcap", category: "wild", blocks: [BlockId.Dreamcap], habitat: "Glimmerwood and Snowcap hollows", growth: "Favors cool shade and mana-rich ground.", utility: "Food, creature care and dream-alchemy stock.", drops: [{ item: Item.Dreamcap, label: "Dreamcaps" }] },
]);

/**
 * Native field-guide ranges used by the ecology audit and plant compendium.
 * An omitted plant is cultivated, broadly distributed, or not yet tied to a
 * naturally generated biome. These ranges are descriptive and never caps.
 */
export const PLANT_NATIVE_BIOMES: Readonly<Record<string, readonly BiomeId[]>> = Object.freeze({
  wildwood: [BiomeId.Wildwood],
  frostpine: [BiomeId.Frostpine, BiomeId.Snowfield, BiomeId.SnowcapRange],
  birchlight: [BiomeId.Birchlight],
  bloomwood: [BiomeId.Bloomwood],
  "rainveil-tree": [BiomeId.RainveilJungle],
  "sakurabloom-tree": [BiomeId.SakurabloomGrove],
  "candywood-tree": [BiomeId.SugarplumVale],
  "wild-apple": [BiomeId.Meadow],
  "wild-wheat": [BiomeId.Meadow],
  moonrice: [BiomeId.Siltfen],
  sunroot: [BiomeId.Savanna],
  "peppermint-cane": [BiomeId.SugarplumVale],
  "cocoa-puff": [BiomeId.SugarplumVale],
  "field-cotton": [BiomeId.Meadow, BiomeId.Wildwood, BiomeId.Birchlight, BiomeId.Bloomwood],
  "suncrest-carrot": [BiomeId.Meadow, BiomeId.Savanna],
  "bluepod-bean": [BiomeId.Siltfen, BiomeId.Wildwood, BiomeId.Birchlight, BiomeId.Bloomwood],
  moonberry: [BiomeId.Frostpine, BiomeId.Wildwood, BiomeId.Birchlight, BiomeId.Bloomwood],
  sunberry: [BiomeId.Savanna],
  "gumdrop-bush": [BiomeId.SugarplumVale],
  "marshmallow-shrub": [BiomeId.SugarplumVale],
  "ember-bloom": [BiomeId.Meadow, BiomeId.Wildwood, BiomeId.Birchlight, BiomeId.Bloomwood, BiomeId.Volcanic],
  skybell: [BiomeId.Meadow, BiomeId.CloudreedGlen],
  sunpetal: [BiomeId.Meadow],
  "moon-orchid": [BiomeId.Meadow, BiomeId.Glimmerwood],
  "river-ribbon": [BiomeId.River],
  "glow-kelp": [BiomeId.Ocean, BiomeId.DeepOcean, BiomeId.LumenTrench],
  "reed-bloom": [BiomeId.Beach, BiomeId.River, BiomeId.Siltfen],
  "lumen-kelp": [BiomeId.DeepOcean, BiomeId.LumenTrench],
  "star-coral": [BiomeId.Ocean, BiomeId.DeepOcean, BiomeId.LumenTrench],
  "abyss-bloom": [BiomeId.DeepOcean, BiomeId.LumenTrench],
  tidevine: [BiomeId.Beach, BiomeId.Ocean, BiomeId.DeepOcean],
  cloudbell: [BiomeId.Highlands, BiomeId.CloudreedGlen],
  "coast-aster": [BiomeId.Beach],
  "sakura-bloom": [BiomeId.SakurabloomGrove],
  dreamblossom: [BiomeId.SakurabloomGrove],
  "lantern-lotus": [BiomeId.RainveilJungle],
  "lollipop-orchid": [BiomeId.SugarplumVale],
  "wild-peppermint": [BiomeId.SugarplumVale],
  "rainveil-fern": [BiomeId.RainveilJungle],
  saltbrush: [BiomeId.Beach],
  "dune-brush": [BiomeId.Desert, BiomeId.Badlands, BiomeId.Volcanic],
  cactus: [BiomeId.Desert],
  "mooncap-mushroom": [BiomeId.MushroomFen],
  moonpetal: [BiomeId.Glimmerwood],
  starfern: [BiomeId.Glimmerwood, BiomeId.SnowcapRange],
  dreamcap: [BiomeId.Glimmerwood, BiomeId.SnowcapRange],
});

export function nativeBiomesForPlant(plantId: string): readonly BiomeId[] {
  return PLANT_NATIVE_BIOMES[plantId] ?? [];
}

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
