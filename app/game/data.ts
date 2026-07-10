export enum BlockId {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Sand = 4,
  WildwoodLog = 5,
  WildwoodLeaves = 6,
  Water = 7,
  CoalOre = 8,
  IronOre = 9,
  Planks = 10,
  StoneBrick = 11,
  Glass = 12,
  Glowstone = 13,
  Bedrock = 14,
  SnowyGrass = 15,
  Snow = 16,
  PineLog = 17,
  PineLeaves = 18,
  BirchLog = 19,
  BirchLeaves = 20,
  RedSand = 21,
  Clay = 22,
  Cactus = 23,
  Mud = 24,
  SwampGrass = 25,
  SavannaGrass = 26,
  BloomLog = 27,
  BloomLeaves = 28,
  Cobblestone = 29,
  CraftingTable = 30,
  Furnace = 31,
  Torch = 32,
  CopperOre = 33,
  GoldOre = 34,
  CrystalOre = 35,
  Deepstone = 36,
  Lava = 37,
  MushroomCap = 38,
  Moss = 39,
  Gravel = 40,
  Ice = 41,
  Basalt = 42,
  Obsidian = 43,
  CrystalBlock = 44,
  Chest = 45,
  TallGrass = 46,
  RedFlower = 47,
  BlueFlower = 48,
  WheatCrop = 49,
  Farmland = 50,
  WildwoodSapling = 51,
  DoorClosedLower = 52,
  DoorClosedUpper = 53,
  DoorOpenLower = 54,
  DoorOpenUpper = 55,
  DoorXClosedLower = 56,
  DoorXClosedUpper = 57,
  DoorXOpenLower = 58,
  DoorXOpenUpper = 59,
  TorchWallNorth = 60,
  TorchWallSouth = 61,
  TorchWallEast = 62,
  TorchWallWest = 63,
  BedNorthFoot = 64,
  BedNorthHead = 65,
  BedSouthFoot = 66,
  BedSouthHead = 67,
  BedEastFoot = 68,
  BedEastHead = 69,
  BedWestFoot = 70,
  BedWestHead = 71,
}

export const Item = {
  None: 0,
  Stick: 100,
  Coal: 101,
  RawSunmetal: 102,
  SunmetalIngot: 103,
  RawGold: 104,
  GoldIngot: 105,
  CrystalShard: 106,
  WoodPickaxe: 107,
  StonePickaxe: 108,
  IronPickaxe: 109,
  CrystalPickaxe: 110,
  WoodAxe: 111,
  StoneAxe: 112,
  IronAxe: 113,
  CrystalAxe: 114,
  WoodSword: 115,
  StoneSword: 116,
  IronSword: 117,
  CrystalSword: 118,
  WoodShovel: 119,
  StoneShovel: 120,
  IronShovel: 121,
  RawMeat: 122,
  CookedMeat: 123,
  Berry: 124,
  Fiber: 125,
  Hide: 126,
  BoneShard: 127,
  GlowDust: 128,
  Wool: 129,
  Wheat: 130,
  Bread: 131,
  Flint: 132,
  CaveGel: 133,
  ShadowShard: 134,
  Apple: 135,
  Charcoal: 136,
  WildwoodDoor: 137,
  HideHood: 138,
  HideTunic: 139,
  HideLeggings: 140,
  HideBoots: 141,
  SunmetalHelm: 142,
  SunmetalPlate: 143,
  SunmetalGreaves: 144,
  SunmetalBoots: 145,
  RottenFlesh: 146,
  ButterflyNet: 147,
  MeadowwingJar: 148,
  AzureSkipperJar: 149,
  EmbertipJar: 150,
  FrostveilJar: 151,
  BloomMonarchJar: 152,
  FenLanternJar: 153,
  WildwoodBed: 154,
} as const;

export type ItemCode = number;
export type GameMode = "builder" | "survival";
export type Weather = "clear" | "rain";
export type RenderLayer = "opaque" | "cutout" | "transparent" | "emissive" | "none";
export type ToolKind = "pickaxe" | "axe" | "shovel" | "sword";
export type BlockTool = "pickaxe" | "axe" | "shovel" | "hand";
export type EquipmentSlot = "head" | "chest" | "legs" | "feet";

export type InventorySlot = {
  item: ItemCode;
  count: number;
  durability?: number;
};

export type BlockDefinition = {
  id: BlockId;
  name: string;
  top: number;
  side: number;
  bottom: number;
  hardness: number;
  solid: boolean;
  layer: RenderLayer;
  color: string;
  preferredTool: BlockTool;
  requiredTier: number;
  shape?: "cube" | "cross" | "torch" | "door" | "chest" | "bed";
  replaceable?: boolean;
  liquid?: "water" | "lava";
};

export type ItemDefinition = {
  id: ItemCode;
  name: string;
  color: string;
  maxStack: number;
  placeBlock?: BlockId;
  toolKind?: ToolKind;
  tier?: number;
  miningSpeed?: number;
  damage?: number;
  maxDurability?: number;
  equipmentSlot?: EquipmentSlot;
  armor?: number;
  food?: number;
  fuel?: number;
  useKind?: "net" | "release-creature";
  creatureKind?: string;
};

const block = (
  id: BlockId,
  name: string,
  top: number,
  side: number,
  bottom: number,
  hardness: number,
  color: string,
  preferredTool: BlockTool,
  requiredTier = 0,
  extras: Partial<BlockDefinition> = {},
): BlockDefinition => ({
  id,
  name,
  top,
  side,
  bottom,
  hardness,
  color,
  preferredTool,
  requiredTier,
  solid: true,
  layer: "opaque",
  ...extras,
});

export const BLOCKS: Record<number, BlockDefinition> = {
  [BlockId.Air]: block(BlockId.Air, "Air", 0, 0, 0, 0, "#ffffff", "hand", 0, { solid: false, layer: "none", replaceable: true }),
  [BlockId.Grass]: block(BlockId.Grass, "Grass Block", 0, 1, 2, 0.65, "#68a341", "shovel"),
  [BlockId.Dirt]: block(BlockId.Dirt, "Dirt", 2, 2, 2, 0.55, "#7b5636", "shovel"),
  [BlockId.Stone]: block(BlockId.Stone, "Stone", 3, 3, 3, 1.55, "#777d7e", "pickaxe", 1),
  [BlockId.Sand]: block(BlockId.Sand, "Sand", 4, 4, 4, 0.5, "#d8c27b", "shovel"),
  [BlockId.WildwoodLog]: block(BlockId.WildwoodLog, "Wildwood Log", 6, 5, 6, 1.05, "#705033", "axe"),
  [BlockId.WildwoodLeaves]: block(BlockId.WildwoodLeaves, "Wildwood Leaves", 7, 7, 7, 0.28, "#3f7d36", "hand", 0, { layer: "cutout" }),
  [BlockId.Water]: block(BlockId.Water, "Water", 8, 8, 8, 0, "#3e83c6", "hand", 0, { solid: false, layer: "transparent", replaceable: true, liquid: "water" }),
  [BlockId.CoalOre]: block(BlockId.CoalOre, "Coal Ore", 9, 9, 9, 1.8, "#444849", "pickaxe", 1),
  [BlockId.IronOre]: block(BlockId.IronOre, "Sunmetal Ore", 10, 10, 10, 2.15, "#a68168", "pickaxe", 2),
  [BlockId.Planks]: block(BlockId.Planks, "Wildwood Planks", 11, 11, 11, 0.9, "#b6844d", "axe"),
  [BlockId.StoneBrick]: block(BlockId.StoneBrick, "Stone Brick", 12, 12, 12, 1.65, "#8b7770", "pickaxe", 1),
  [BlockId.Glass]: block(BlockId.Glass, "Glass", 13, 13, 13, 0.35, "#b9e5e3", "hand", 0, { layer: "transparent" }),
  [BlockId.Glowstone]: block(BlockId.Glowstone, "Glowstone", 14, 14, 14, 0.7, "#e3c35c", "pickaxe", 0, { layer: "emissive" }),
  [BlockId.Bedrock]: block(BlockId.Bedrock, "Bedrock", 15, 15, 15, 9999, "#303334", "pickaxe", 99),
  [BlockId.SnowyGrass]: block(BlockId.SnowyGrass, "Snowy Grass", 16, 17, 2, 0.65, "#dfe7e4", "shovel"),
  [BlockId.Snow]: block(BlockId.Snow, "Snow Block", 16, 16, 16, 0.35, "#e8efee", "shovel"),
  [BlockId.PineLog]: block(BlockId.PineLog, "Frostpine Log", 19, 18, 19, 1.1, "#604734", "axe"),
  [BlockId.PineLeaves]: block(BlockId.PineLeaves, "Frostpine Needles", 20, 20, 20, 0.3, "#2f6042", "hand", 0, { layer: "cutout" }),
  [BlockId.BirchLog]: block(BlockId.BirchLog, "Birchlight Log", 22, 21, 22, 1, "#d1c9ad", "axe"),
  [BlockId.BirchLeaves]: block(BlockId.BirchLeaves, "Birchlight Leaves", 23, 23, 23, 0.3, "#78a84c", "hand", 0, { layer: "cutout" }),
  [BlockId.RedSand]: block(BlockId.RedSand, "Red Sand", 24, 24, 24, 0.52, "#bd7046", "shovel"),
  [BlockId.Clay]: block(BlockId.Clay, "Clay", 25, 25, 25, 0.65, "#8998a0", "shovel"),
  [BlockId.Cactus]: block(BlockId.Cactus, "Cactus", 26, 26, 26, 0.45, "#4e913e", "hand"),
  [BlockId.Mud]: block(BlockId.Mud, "Mud", 27, 27, 27, 0.6, "#4f4034", "shovel"),
  [BlockId.SwampGrass]: block(BlockId.SwampGrass, "Siltfen Grass", 28, 29, 24, 0.65, "#566d35", "shovel"),
  [BlockId.SavannaGrass]: block(BlockId.SavannaGrass, "Sunstep Grass", 30, 31, 2, 0.65, "#a99f4e", "shovel"),
  [BlockId.BloomLog]: block(BlockId.BloomLog, "Bloomwood Log", 33, 32, 33, 1.05, "#7b4f58", "axe"),
  [BlockId.BloomLeaves]: block(BlockId.BloomLeaves, "Bloomwood Leaves", 34, 34, 34, 0.3, "#d887ad", "hand", 0, { layer: "cutout" }),
  [BlockId.Cobblestone]: block(BlockId.Cobblestone, "Cobblestone", 35, 35, 35, 1.75, "#6a706f", "pickaxe", 1),
  [BlockId.CraftingTable]: block(BlockId.CraftingTable, "Crafting Table", 36, 37, 11, 1.1, "#9b6536", "axe"),
  [BlockId.Furnace]: block(BlockId.Furnace, "Furnace", 3, 38, 3, 2, "#666c6d", "pickaxe", 1),
  [BlockId.Torch]: block(BlockId.Torch, "Torch", 39, 39, 39, 0.05, "#f4bd4f", "hand", 0, { solid: false, layer: "emissive", shape: "torch", replaceable: true }),
  [BlockId.CopperOre]: block(BlockId.CopperOre, "Copper Ore", 40, 40, 40, 1.9, "#b16d4e", "pickaxe", 1),
  [BlockId.GoldOre]: block(BlockId.GoldOre, "Gold Ore", 41, 41, 41, 2.4, "#cda934", "pickaxe", 2),
  [BlockId.CrystalOre]: block(BlockId.CrystalOre, "Star Crystal Ore", 42, 42, 42, 3.1, "#64d6df", "pickaxe", 3),
  [BlockId.Deepstone]: block(BlockId.Deepstone, "Deepstone", 43, 43, 43, 2.15, "#3e454a", "pickaxe", 2),
  [BlockId.Lava]: block(BlockId.Lava, "Lava", 44, 44, 44, 0, "#ed642f", "hand", 0, { solid: false, layer: "transparent", replaceable: true, liquid: "lava" }),
  [BlockId.MushroomCap]: block(BlockId.MushroomCap, "Giant Mushroom", 45, 45, 45, 0.55, "#a94e62", "axe"),
  [BlockId.Moss]: block(BlockId.Moss, "Cave Moss", 46, 46, 46, 0.35, "#4b8245", "shovel"),
  [BlockId.Gravel]: block(BlockId.Gravel, "Gravel", 47, 47, 47, 0.6, "#85817c", "shovel"),
  [BlockId.Ice]: block(BlockId.Ice, "Ice", 48, 48, 48, 0.45, "#8fd0e2", "pickaxe", 0, { layer: "transparent" }),
  [BlockId.Basalt]: block(BlockId.Basalt, "Basalt", 49, 49, 49, 2.35, "#3a3437", "pickaxe", 2),
  [BlockId.Obsidian]: block(BlockId.Obsidian, "Obsidian", 50, 50, 50, 7.5, "#29213d", "pickaxe", 4),
  [BlockId.CrystalBlock]: block(BlockId.CrystalBlock, "Star Crystal Block", 51, 51, 51, 3.2, "#61dce5", "pickaxe", 3, { layer: "emissive" }),
  [BlockId.Chest]: block(BlockId.Chest, "Wildwood Chest", 11, 52, 11, 1.2, "#9f6b35", "axe", 0, { shape: "chest" }),
  [BlockId.TallGrass]: block(BlockId.TallGrass, "Tall Grass", 53, 53, 53, 0.05, "#68a744", "hand", 0, { solid: false, layer: "cutout", shape: "cross", replaceable: true }),
  [BlockId.RedFlower]: block(BlockId.RedFlower, "Ember Bloom", 54, 54, 54, 0.05, "#d64f49", "hand", 0, { solid: false, layer: "cutout", shape: "cross", replaceable: true }),
  [BlockId.BlueFlower]: block(BlockId.BlueFlower, "Skybell", 55, 55, 55, 0.05, "#558ed9", "hand", 0, { solid: false, layer: "cutout", shape: "cross", replaceable: true }),
  [BlockId.WheatCrop]: block(BlockId.WheatCrop, "Wild Wheat", 56, 56, 56, 0.08, "#cba74e", "hand", 0, { solid: false, layer: "cutout", shape: "cross", replaceable: true }),
  [BlockId.Farmland]: block(BlockId.Farmland, "Farmland", 57, 58, 2, 0.55, "#6b4328", "shovel"),
  [BlockId.WildwoodSapling]: block(BlockId.WildwoodSapling, "Wildwood Sapling", 59, 59, 59, 0.08, "#67a94a", "hand", 0, { solid: false, layer: "cutout", shape: "cross", replaceable: true }),
  [BlockId.DoorClosedLower]: block(BlockId.DoorClosedLower, "Wildwood Door", 60, 60, 60, 0.9, "#9b6839", "axe", 0, { layer: "cutout", shape: "door" }),
  [BlockId.DoorClosedUpper]: block(BlockId.DoorClosedUpper, "Wildwood Door", 61, 61, 61, 0.9, "#9b6839", "axe", 0, { layer: "cutout", shape: "door" }),
  [BlockId.DoorOpenLower]: block(BlockId.DoorOpenLower, "Open Wildwood Door", 60, 60, 60, 0.9, "#9b6839", "axe", 0, { solid: false, layer: "cutout", shape: "door" }),
  [BlockId.DoorOpenUpper]: block(BlockId.DoorOpenUpper, "Open Wildwood Door", 61, 61, 61, 0.9, "#9b6839", "axe", 0, { solid: false, layer: "cutout", shape: "door" }),
  [BlockId.DoorXClosedLower]: block(BlockId.DoorXClosedLower, "Wildwood Door", 60, 60, 60, 0.9, "#9b6839", "axe", 0, { layer: "cutout", shape: "door" }),
  [BlockId.DoorXClosedUpper]: block(BlockId.DoorXClosedUpper, "Wildwood Door", 61, 61, 61, 0.9, "#9b6839", "axe", 0, { layer: "cutout", shape: "door" }),
  [BlockId.DoorXOpenLower]: block(BlockId.DoorXOpenLower, "Open Wildwood Door", 60, 60, 60, 0.9, "#9b6839", "axe", 0, { solid: false, layer: "cutout", shape: "door" }),
  [BlockId.DoorXOpenUpper]: block(BlockId.DoorXOpenUpper, "Open Wildwood Door", 61, 61, 61, 0.9, "#9b6839", "axe", 0, { solid: false, layer: "cutout", shape: "door" }),
  [BlockId.TorchWallNorth]: block(BlockId.TorchWallNorth, "Wall Torch", 39, 39, 39, 0.05, "#f4bd4f", "hand", 0, { solid: false, layer: "emissive", shape: "torch", replaceable: true }),
  [BlockId.TorchWallSouth]: block(BlockId.TorchWallSouth, "Wall Torch", 39, 39, 39, 0.05, "#f4bd4f", "hand", 0, { solid: false, layer: "emissive", shape: "torch", replaceable: true }),
  [BlockId.TorchWallEast]: block(BlockId.TorchWallEast, "Wall Torch", 39, 39, 39, 0.05, "#f4bd4f", "hand", 0, { solid: false, layer: "emissive", shape: "torch", replaceable: true }),
  [BlockId.TorchWallWest]: block(BlockId.TorchWallWest, "Wall Torch", 39, 39, 39, 0.05, "#f4bd4f", "hand", 0, { solid: false, layer: "emissive", shape: "torch", replaceable: true }),
  [BlockId.BedNorthFoot]: block(BlockId.BedNorthFoot, "Wildwood Bed", 63, 63, 11, 0.45, "#a7463f", "axe", 0, { layer: "cutout", shape: "bed" }),
  [BlockId.BedNorthHead]: block(BlockId.BedNorthHead, "Wildwood Bed", 63, 63, 11, 0.45, "#a7463f", "axe", 0, { layer: "cutout", shape: "bed" }),
  [BlockId.BedSouthFoot]: block(BlockId.BedSouthFoot, "Wildwood Bed", 63, 63, 11, 0.45, "#a7463f", "axe", 0, { layer: "cutout", shape: "bed" }),
  [BlockId.BedSouthHead]: block(BlockId.BedSouthHead, "Wildwood Bed", 63, 63, 11, 0.45, "#a7463f", "axe", 0, { layer: "cutout", shape: "bed" }),
  [BlockId.BedEastFoot]: block(BlockId.BedEastFoot, "Wildwood Bed", 63, 63, 11, 0.45, "#a7463f", "axe", 0, { layer: "cutout", shape: "bed" }),
  [BlockId.BedEastHead]: block(BlockId.BedEastHead, "Wildwood Bed", 63, 63, 11, 0.45, "#a7463f", "axe", 0, { layer: "cutout", shape: "bed" }),
  [BlockId.BedWestFoot]: block(BlockId.BedWestFoot, "Wildwood Bed", 63, 63, 11, 0.45, "#a7463f", "axe", 0, { layer: "cutout", shape: "bed" }),
  [BlockId.BedWestHead]: block(BlockId.BedWestHead, "Wildwood Bed", 63, 63, 11, 0.45, "#a7463f", "axe", 0, { layer: "cutout", shape: "bed" }),
};

export const TORCH_BLOCKS: readonly BlockId[] = [
  BlockId.Torch,
  BlockId.TorchWallNorth,
  BlockId.TorchWallSouth,
  BlockId.TorchWallEast,
  BlockId.TorchWallWest,
];

export const BED_BLOCKS: readonly BlockId[] = [
  BlockId.BedNorthFoot, BlockId.BedNorthHead,
  BlockId.BedSouthFoot, BlockId.BedSouthHead,
  BlockId.BedEastFoot, BlockId.BedEastHead,
  BlockId.BedWestFoot, BlockId.BedWestHead,
];

export function isTorchBlock(type: BlockId | undefined): type is BlockId {
  return type !== undefined && TORCH_BLOCKS.includes(type);
}

export function isBedBlock(type: BlockId | undefined): type is BlockId {
  return type !== undefined && BED_BLOCKS.includes(type);
}

const tool = (
  id: ItemCode,
  name: string,
  color: string,
  toolKind: ToolKind,
  tier: number,
  miningSpeed: number,
  damage: number,
  maxDurability: number,
): ItemDefinition => ({ id, name, color, maxStack: 1, toolKind, tier, miningSpeed, damage, maxDurability });

const armorItem = (
  id: ItemCode,
  name: string,
  color: string,
  equipmentSlot: EquipmentSlot,
  armor: number,
  maxDurability: number,
): ItemDefinition => ({ id, name, color, maxStack: 1, equipmentSlot, armor, maxDurability });

export const ITEMS: Record<number, ItemDefinition> = {};
const technicalBlocks = new Set<BlockId>([
  BlockId.DoorClosedLower, BlockId.DoorClosedUpper, BlockId.DoorOpenLower, BlockId.DoorOpenUpper,
  BlockId.DoorXClosedLower, BlockId.DoorXClosedUpper, BlockId.DoorXOpenLower, BlockId.DoorXOpenUpper,
  BlockId.TorchWallNorth, BlockId.TorchWallSouth, BlockId.TorchWallEast, BlockId.TorchWallWest,
  ...BED_BLOCKS,
]);
for (const definition of Object.values(BLOCKS)) {
  if (definition.id === BlockId.Air || definition.id === BlockId.Water || definition.id === BlockId.Lava || definition.id === BlockId.Bedrock || technicalBlocks.has(definition.id)) continue;
  ITEMS[definition.id] = { id: definition.id, name: definition.name, color: definition.color, maxStack: 64, placeBlock: definition.id };
}

Object.assign(ITEMS, {
  [Item.Stick]: { id: Item.Stick, name: "Stick", color: "#9a6b3b", maxStack: 64, fuel: 5 },
  [Item.Coal]: { id: Item.Coal, name: "Coal", color: "#34383a", maxStack: 64, fuel: 80 },
  [Item.RawSunmetal]: { id: Item.RawSunmetal, name: "Raw Sunmetal", color: "#b38468", maxStack: 64 },
  [Item.SunmetalIngot]: { id: Item.SunmetalIngot, name: "Sunmetal Ingot", color: "#d3b7a4", maxStack: 64 },
  [Item.RawGold]: { id: Item.RawGold, name: "Raw Gold", color: "#d3aa37", maxStack: 64 },
  [Item.GoldIngot]: { id: Item.GoldIngot, name: "Gold Ingot", color: "#f2cd52", maxStack: 64 },
  [Item.CrystalShard]: { id: Item.CrystalShard, name: "Star Crystal", color: "#6de7ef", maxStack: 64 },
  [Item.WoodPickaxe]: tool(Item.WoodPickaxe, "Wooden Pickaxe", "#aa7542", "pickaxe", 1, 2.1, 2, 64),
  [Item.StonePickaxe]: tool(Item.StonePickaxe, "Stone Pickaxe", "#858b89", "pickaxe", 2, 3.4, 3, 132),
  [Item.IronPickaxe]: tool(Item.IronPickaxe, "Sunmetal Pickaxe", "#d4b9a7", "pickaxe", 3, 5.3, 4, 251),
  [Item.CrystalPickaxe]: tool(Item.CrystalPickaxe, "Star Pickaxe", "#67e1e9", "pickaxe", 4, 8.2, 6, 620),
  [Item.WoodAxe]: tool(Item.WoodAxe, "Wooden Axe", "#aa7542", "axe", 1, 2.5, 3, 64),
  [Item.StoneAxe]: tool(Item.StoneAxe, "Stone Axe", "#858b89", "axe", 2, 4, 4, 132),
  [Item.IronAxe]: tool(Item.IronAxe, "Sunmetal Axe", "#d4b9a7", "axe", 3, 6, 6, 251),
  [Item.CrystalAxe]: tool(Item.CrystalAxe, "Star Axe", "#67e1e9", "axe", 4, 8.6, 8, 620),
  [Item.WoodSword]: tool(Item.WoodSword, "Wooden Sword", "#aa7542", "sword", 1, 1, 4, 64),
  [Item.StoneSword]: tool(Item.StoneSword, "Stone Sword", "#858b89", "sword", 2, 1, 5, 132),
  [Item.IronSword]: tool(Item.IronSword, "Sunmetal Sword", "#d4b9a7", "sword", 3, 1, 7, 251),
  [Item.CrystalSword]: tool(Item.CrystalSword, "Star Sword", "#67e1e9", "sword", 4, 1, 9, 620),
  [Item.WoodShovel]: tool(Item.WoodShovel, "Wooden Shovel", "#aa7542", "shovel", 1, 2.5, 2, 64),
  [Item.StoneShovel]: tool(Item.StoneShovel, "Stone Shovel", "#858b89", "shovel", 2, 4, 2, 132),
  [Item.IronShovel]: tool(Item.IronShovel, "Sunmetal Shovel", "#d4b9a7", "shovel", 3, 6, 3, 251),
  [Item.RawMeat]: { id: Item.RawMeat, name: "Raw Ridgeback", color: "#c7635d", maxStack: 64, food: 2 },
  [Item.CookedMeat]: { id: Item.CookedMeat, name: "Cooked Ridgeback", color: "#9a4933", maxStack: 64, food: 7 },
  [Item.Berry]: { id: Item.Berry, name: "Moonberry", color: "#854fa8", maxStack: 64, food: 2 },
  [Item.Fiber]: { id: Item.Fiber, name: "Plant Fiber", color: "#83a854", maxStack: 64 },
  [Item.Hide]: { id: Item.Hide, name: "Soft Hide", color: "#8b5d3c", maxStack: 64 },
  [Item.BoneShard]: { id: Item.BoneShard, name: "Bone Shard", color: "#ddd4bb", maxStack: 64 },
  [Item.GlowDust]: { id: Item.GlowDust, name: "Glow Dust", color: "#f4d768", maxStack: 64 },
  [Item.Wool]: { id: Item.Wool, name: "Cloudwool", color: "#e5e2d4", maxStack: 64 },
  [Item.Wheat]: { id: Item.Wheat, name: "Wild Wheat", color: "#caa74b", maxStack: 64 },
  [Item.Bread]: { id: Item.Bread, name: "Field Bread", color: "#c8893f", maxStack: 64, food: 5 },
  [Item.Flint]: { id: Item.Flint, name: "Flint", color: "#4f5354", maxStack: 64 },
  [Item.CaveGel]: { id: Item.CaveGel, name: "Cave Gel", color: "#70c99d", maxStack: 64 },
  [Item.ShadowShard]: { id: Item.ShadowShard, name: "Shadow Shard", color: "#51426b", maxStack: 64 },
  [Item.Apple]: { id: Item.Apple, name: "Wild Apple", color: "#c8493e", maxStack: 64, food: 4 },
  [Item.Charcoal]: { id: Item.Charcoal, name: "Charcoal", color: "#3d3d3b", maxStack: 64, fuel: 72 },
  [Item.WildwoodDoor]: { id: Item.WildwoodDoor, name: "Wildwood Door", color: "#9b6839", maxStack: 64, placeBlock: BlockId.DoorClosedLower },
  [Item.HideHood]: armorItem(Item.HideHood, "Trailhide Hood", "#8a6548", "head", 1, 90),
  [Item.HideTunic]: armorItem(Item.HideTunic, "Trailhide Tunic", "#8a6548", "chest", 2, 130),
  [Item.HideLeggings]: armorItem(Item.HideLeggings, "Trailhide Leggings", "#73533d", "legs", 2, 120),
  [Item.HideBoots]: armorItem(Item.HideBoots, "Trailhide Boots", "#654733", "feet", 1, 80),
  [Item.SunmetalHelm]: armorItem(Item.SunmetalHelm, "Sunmetal Helm", "#d4b9a7", "head", 2, 190),
  [Item.SunmetalPlate]: armorItem(Item.SunmetalPlate, "Sunmetal Plate", "#d4b9a7", "chest", 4, 280),
  [Item.SunmetalGreaves]: armorItem(Item.SunmetalGreaves, "Sunmetal Greaves", "#c7a995", "legs", 3, 250),
  [Item.SunmetalBoots]: armorItem(Item.SunmetalBoots, "Sunmetal Boots", "#b99580", "feet", 2, 170),
  [Item.RottenFlesh]: { id: Item.RottenFlesh, name: "Rotten Flesh", color: "#866044", maxStack: 64, food: 1 },
  [Item.ButterflyNet]: { id: Item.ButterflyNet, name: "Butterfly Net", color: "#d8c892", maxStack: 1, maxDurability: 96, useKind: "net" },
  [Item.MeadowwingJar]: { id: Item.MeadowwingJar, name: "Jarred Meadowwing", color: "#f3d451", maxStack: 16, useKind: "release-creature", creatureKind: "meadowwing" },
  [Item.AzureSkipperJar]: { id: Item.AzureSkipperJar, name: "Jarred Azure Skipper", color: "#54bce8", maxStack: 16, useKind: "release-creature", creatureKind: "azure-skippers" },
  [Item.EmbertipJar]: { id: Item.EmbertipJar, name: "Jarred Embertip", color: "#ed743d", maxStack: 16, useKind: "release-creature", creatureKind: "embertip" },
  [Item.FrostveilJar]: { id: Item.FrostveilJar, name: "Jarred Frostveil", color: "#d8f2f5", maxStack: 16, useKind: "release-creature", creatureKind: "frostveil" },
  [Item.BloomMonarchJar]: { id: Item.BloomMonarchJar, name: "Jarred Bloom Monarch", color: "#e88fc8", maxStack: 16, useKind: "release-creature", creatureKind: "bloom-monarch" },
  [Item.FenLanternJar]: { id: Item.FenLanternJar, name: "Jarred Fen Lantern", color: "#b6df62", maxStack: 16, useKind: "release-creature", creatureKind: "fen-lantern" },
  [Item.WildwoodBed]: { id: Item.WildwoodBed, name: "Wildwood Bed", color: "#a7463f", maxStack: 1, placeBlock: BlockId.BedNorthFoot },
} satisfies Record<number, ItemDefinition>);

export const LOG_ITEMS: ItemCode[] = [BlockId.WildwoodLog, BlockId.PineLog, BlockId.BirchLog, BlockId.BloomLog];
export const LEAF_BLOCKS: BlockId[] = [BlockId.WildwoodLeaves, BlockId.PineLeaves, BlockId.BirchLeaves, BlockId.BloomLeaves];
export const CREATIVE_BLOCKS: ItemCode[] = [...Object.values(BLOCKS)
  .filter((definition) => ITEMS[definition.id] && !definition.replaceable && definition.id !== BlockId.WheatCrop)
  .map((definition) => definition.id), Item.WildwoodDoor, Item.WildwoodBed, Item.ButterflyNet, Item.MeadowwingJar, Item.AzureSkipperJar, Item.EmbertipJar, Item.FrostveilJar, Item.BloomMonarchJar, Item.FenLanternJar, Item.HideHood, Item.HideTunic, Item.HideLeggings, Item.HideBoots, Item.SunmetalHelm, Item.SunmetalPlate, Item.SunmetalGreaves, Item.SunmetalBoots];

export type Ingredient = ItemCode | ItemCode[];
export type Recipe = {
  id: string;
  name: string;
  width: number;
  height: number;
  pattern: Array<Ingredient | 0>;
  output: InventorySlot;
  table: boolean;
};

const anyLog: ItemCode[] = [...LOG_ITEMS];

export const RECIPES: Recipe[] = [
  { id: "planks", name: "Wildwood Planks", width: 1, height: 1, pattern: [anyLog], output: { item: BlockId.Planks, count: 4 }, table: false },
  { id: "sticks", name: "Sticks", width: 1, height: 2, pattern: [BlockId.Planks, BlockId.Planks], output: { item: Item.Stick, count: 4 }, table: false },
  { id: "table", name: "Crafting Table", width: 2, height: 2, pattern: [BlockId.Planks, BlockId.Planks, BlockId.Planks, BlockId.Planks], output: { item: BlockId.CraftingTable, count: 1 }, table: false },
  { id: "torch", name: "Torches", width: 1, height: 2, pattern: [Item.Coal, Item.Stick], output: { item: BlockId.Torch, count: 4 }, table: false },
  { id: "bread", name: "Field Bread", width: 3, height: 1, pattern: [Item.Wheat, Item.Wheat, Item.Wheat], output: { item: Item.Bread, count: 1 }, table: true },
  { id: "furnace", name: "Furnace", width: 3, height: 3, pattern: [BlockId.Cobblestone, BlockId.Cobblestone, BlockId.Cobblestone, BlockId.Cobblestone, 0, BlockId.Cobblestone, BlockId.Cobblestone, BlockId.Cobblestone, BlockId.Cobblestone], output: { item: BlockId.Furnace, count: 1 }, table: true },
  { id: "chest", name: "Wildwood Chest", width: 3, height: 3, pattern: [BlockId.Planks, BlockId.Planks, BlockId.Planks, BlockId.Planks, 0, BlockId.Planks, BlockId.Planks, BlockId.Planks, BlockId.Planks], output: { item: BlockId.Chest, count: 1 }, table: true },
  { id: "door", name: "Wildwood Doors", width: 2, height: 3, pattern: [BlockId.Planks, BlockId.Planks, BlockId.Planks, BlockId.Planks, BlockId.Planks, BlockId.Planks], output: { item: Item.WildwoodDoor, count: 3 }, table: true },
  { id: "bed", name: "Wildwood Bed", width: 3, height: 2, pattern: [Item.Wool, Item.Wool, Item.Wool, BlockId.Planks, BlockId.Planks, BlockId.Planks], output: { item: Item.WildwoodBed, count: 1 }, table: true },
  { id: "butterfly_net", name: "Butterfly Net", width: 3, height: 3, pattern: [Item.Fiber, Item.Fiber, Item.Fiber, Item.Fiber, 0, Item.Stick, 0, Item.Stick, 0], output: { item: Item.ButterflyNet, count: 1 }, table: true },
  { id: "wood_pick", name: "Wooden Pickaxe", width: 3, height: 3, pattern: [BlockId.Planks, BlockId.Planks, BlockId.Planks, 0, Item.Stick, 0, 0, Item.Stick, 0], output: { item: Item.WoodPickaxe, count: 1 }, table: true },
  { id: "stone_pick", name: "Stone Pickaxe", width: 3, height: 3, pattern: [BlockId.Cobblestone, BlockId.Cobblestone, BlockId.Cobblestone, 0, Item.Stick, 0, 0, Item.Stick, 0], output: { item: Item.StonePickaxe, count: 1 }, table: true },
  { id: "iron_pick", name: "Sunmetal Pickaxe", width: 3, height: 3, pattern: [Item.SunmetalIngot, Item.SunmetalIngot, Item.SunmetalIngot, 0, Item.Stick, 0, 0, Item.Stick, 0], output: { item: Item.IronPickaxe, count: 1 }, table: true },
  { id: "crystal_pick", name: "Star Pickaxe", width: 3, height: 3, pattern: [Item.CrystalShard, Item.CrystalShard, Item.CrystalShard, 0, Item.Stick, 0, 0, Item.Stick, 0], output: { item: Item.CrystalPickaxe, count: 1 }, table: true },
  { id: "wood_axe", name: "Wooden Axe", width: 2, height: 3, pattern: [BlockId.Planks, BlockId.Planks, BlockId.Planks, Item.Stick, 0, Item.Stick], output: { item: Item.WoodAxe, count: 1 }, table: true },
  { id: "stone_axe", name: "Stone Axe", width: 2, height: 3, pattern: [BlockId.Cobblestone, BlockId.Cobblestone, BlockId.Cobblestone, Item.Stick, 0, Item.Stick], output: { item: Item.StoneAxe, count: 1 }, table: true },
  { id: "iron_axe", name: "Sunmetal Axe", width: 2, height: 3, pattern: [Item.SunmetalIngot, Item.SunmetalIngot, Item.SunmetalIngot, Item.Stick, 0, Item.Stick], output: { item: Item.IronAxe, count: 1 }, table: true },
  { id: "crystal_axe", name: "Star Axe", width: 2, height: 3, pattern: [Item.CrystalShard, Item.CrystalShard, Item.CrystalShard, Item.Stick, 0, Item.Stick], output: { item: Item.CrystalAxe, count: 1 }, table: true },
  { id: "wood_sword", name: "Wooden Sword", width: 1, height: 3, pattern: [BlockId.Planks, BlockId.Planks, Item.Stick], output: { item: Item.WoodSword, count: 1 }, table: true },
  { id: "stone_sword", name: "Stone Sword", width: 1, height: 3, pattern: [BlockId.Cobblestone, BlockId.Cobblestone, Item.Stick], output: { item: Item.StoneSword, count: 1 }, table: true },
  { id: "iron_sword", name: "Sunmetal Sword", width: 1, height: 3, pattern: [Item.SunmetalIngot, Item.SunmetalIngot, Item.Stick], output: { item: Item.IronSword, count: 1 }, table: true },
  { id: "crystal_sword", name: "Star Sword", width: 1, height: 3, pattern: [Item.CrystalShard, Item.CrystalShard, Item.Stick], output: { item: Item.CrystalSword, count: 1 }, table: true },
  { id: "wood_shovel", name: "Wooden Shovel", width: 1, height: 3, pattern: [BlockId.Planks, Item.Stick, Item.Stick], output: { item: Item.WoodShovel, count: 1 }, table: true },
  { id: "stone_shovel", name: "Stone Shovel", width: 1, height: 3, pattern: [BlockId.Cobblestone, Item.Stick, Item.Stick], output: { item: Item.StoneShovel, count: 1 }, table: true },
  { id: "iron_shovel", name: "Sunmetal Shovel", width: 1, height: 3, pattern: [Item.SunmetalIngot, Item.Stick, Item.Stick], output: { item: Item.IronShovel, count: 1 }, table: true },
  { id: "hide_hood", name: "Trailhide Hood", width: 3, height: 2, pattern: [Item.Hide, Item.Hide, Item.Hide, Item.Hide, 0, Item.Hide], output: { item: Item.HideHood, count: 1 }, table: true },
  { id: "hide_tunic", name: "Trailhide Tunic", width: 3, height: 3, pattern: [Item.Hide, 0, Item.Hide, Item.Hide, Item.Hide, Item.Hide, Item.Hide, Item.Hide, Item.Hide], output: { item: Item.HideTunic, count: 1 }, table: true },
  { id: "hide_leggings", name: "Trailhide Leggings", width: 3, height: 3, pattern: [Item.Hide, Item.Hide, Item.Hide, Item.Hide, 0, Item.Hide, Item.Hide, 0, Item.Hide], output: { item: Item.HideLeggings, count: 1 }, table: true },
  { id: "hide_boots", name: "Trailhide Boots", width: 3, height: 2, pattern: [Item.Hide, 0, Item.Hide, Item.Hide, 0, Item.Hide], output: { item: Item.HideBoots, count: 1 }, table: true },
  { id: "sunmetal_helm", name: "Sunmetal Helm", width: 3, height: 2, pattern: [Item.SunmetalIngot, Item.SunmetalIngot, Item.SunmetalIngot, Item.SunmetalIngot, 0, Item.SunmetalIngot], output: { item: Item.SunmetalHelm, count: 1 }, table: true },
  { id: "sunmetal_plate", name: "Sunmetal Plate", width: 3, height: 3, pattern: [Item.SunmetalIngot, 0, Item.SunmetalIngot, Item.SunmetalIngot, Item.SunmetalIngot, Item.SunmetalIngot, Item.SunmetalIngot, Item.SunmetalIngot, Item.SunmetalIngot], output: { item: Item.SunmetalPlate, count: 1 }, table: true },
  { id: "sunmetal_greaves", name: "Sunmetal Greaves", width: 3, height: 3, pattern: [Item.SunmetalIngot, Item.SunmetalIngot, Item.SunmetalIngot, Item.SunmetalIngot, 0, Item.SunmetalIngot, Item.SunmetalIngot, 0, Item.SunmetalIngot], output: { item: Item.SunmetalGreaves, count: 1 }, table: true },
  { id: "sunmetal_boots", name: "Sunmetal Boots", width: 3, height: 2, pattern: [Item.SunmetalIngot, 0, Item.SunmetalIngot, Item.SunmetalIngot, 0, Item.SunmetalIngot], output: { item: Item.SunmetalBoots, count: 1 }, table: true },
  { id: "glowstone", name: "Glowstone", width: 2, height: 2, pattern: [Item.GlowDust, Item.GlowDust, Item.GlowDust, Item.GlowDust], output: { item: BlockId.Glowstone, count: 1 }, table: false },
];

export const SMELTING: Record<number, InventorySlot> = {
  [BlockId.IronOre]: { item: Item.SunmetalIngot, count: 1 },
  [Item.RawSunmetal]: { item: Item.SunmetalIngot, count: 1 },
  [BlockId.GoldOre]: { item: Item.GoldIngot, count: 1 },
  [Item.RawGold]: { item: Item.GoldIngot, count: 1 },
  [BlockId.Sand]: { item: BlockId.Glass, count: 1 },
  [Item.RawMeat]: { item: Item.CookedMeat, count: 1 },
  [BlockId.Cobblestone]: { item: BlockId.Stone, count: 1 },
  [BlockId.WildwoodLog]: { item: Item.Charcoal, count: 1 },
  [BlockId.PineLog]: { item: Item.Charcoal, count: 1 },
  [BlockId.BirchLog]: { item: Item.Charcoal, count: 1 },
  [BlockId.BloomLog]: { item: Item.Charcoal, count: 1 },
};

export function cloneSlot(slot: InventorySlot | null): InventorySlot | null {
  return slot ? { ...slot } : null;
}

export function itemName(item: ItemCode) {
  return ITEMS[item]?.name ?? "Unknown Item";
}

export function maxStack(item: ItemCode) {
  return ITEMS[item]?.maxStack ?? 64;
}
