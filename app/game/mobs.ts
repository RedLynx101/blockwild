import { Item, type ItemCode } from "./data";

export type ButterflyKind = "meadowwing" | "azure-skippers" | "embertip" | "frostveil" | "bloom-monarch" | "fen-lantern";
export type MobKind = "mossling" | "ridgeback" | "woolhorn" | "glowmoth" | "shadecrawler" | "caveblob" | "rattlekin" | "zombie" | ButterflyKind;
export type MobTemperament = "Gentle" | "Skittish" | "Defensive" | "Hostile";

export type MobDrop = {
  item: ItemCode;
  min: number;
  max: number;
  chance: number;
};

export type MobDefinition = {
  kind: MobKind;
  name: string;
  temperament: MobTemperament;
  hostile: boolean;
  health: number;
  damage: number;
  xp: number;
  speed: number;
  chaseSpeed: number;
  turnRate: number;
  attackRange: number;
  footOffset: number;
  radius: number;
  height: number;
  habitat: string;
  active: string;
  behavior: string;
  lore: string;
  colors: [number, number, number];
  drops: MobDrop[];
  family?: "butterfly";
  captureItem?: ItemCode;
};

export const MOB_DEFS: Record<MobKind, MobDefinition> = {
  mossling: {
    kind: "mossling", name: "Mossling", temperament: "Skittish", hostile: false,
    health: 5, damage: 0, xp: 2, speed: 0.72, chaseSpeed: 1.9, turnRate: 6, attackRange: 0,
    footOffset: 0.42, radius: 0.36, height: 0.82, habitat: "Wet forests, Bloomwood and Siltfen", active: "Day and rain",
    behavior: "Forages in short hops, gathers near flowers, and bounds away when struck.",
    lore: "A walking knot of moss and root. Old trailkeepers say every grove begins with one curious Mossling.",
    colors: [0x4f8a43, 0x9bc878, 0x172517],
    drops: [{ item: Item.Fiber, min: 1, max: 2, chance: 0.9 }, { item: Item.Berry, min: 1, max: 1, chance: 0.3 }],
  },
  ridgeback: {
    kind: "ridgeback", name: "Ridgeback", temperament: "Defensive", hostile: false,
    health: 10, damage: 2, xp: 3, speed: 0.52, chaseSpeed: 2.8, turnRate: 4.2, attackRange: 1.35,
    // findWalkableY returns the solid block center; +0.5 is its top surface.
    footOffset: 0.5, radius: 0.62, height: 1.05, habitat: "Meadows, savannas and open woodland", active: "Day",
    behavior: "Travels in loose herds. Usually calm, but an injured Ridgeback lowers its plated head and charges.",
    lore: "Its warm stone plates store the afternoon sun. A charging herd sounds like distant summer thunder.",
    colors: [0x875437, 0xc07d54, 0x291912],
    drops: [{ item: Item.RawMeat, min: 1, max: 3, chance: 1 }, { item: Item.Hide, min: 1, max: 2, chance: 0.62 }],
  },
  woolhorn: {
    kind: "woolhorn", name: "Woolhorn", temperament: "Gentle", hostile: false,
    health: 9, damage: 1, xp: 3, speed: 0.42, chaseSpeed: 1.55, turnRate: 3.8, attackRange: 1.1,
    footOffset: 0.63, radius: 0.52, height: 1.18, habitat: "Frostpine taiga and snowy fields", active: "Day",
    behavior: "Grazes through snow, follows nearby Woolhorns, and braces behind its curled horns when cornered.",
    lore: "Cloud-soft wool hides a stubborn mountain heart. Their tracks are often the safest path through a blizzard.",
    colors: [0xe8e5d8, 0x756c61, 0x20211f],
    drops: [{ item: Item.Wool, min: 1, max: 2, chance: 1 }, { item: Item.RawMeat, min: 1, max: 1, chance: 0.58 }],
  },
  glowmoth: {
    kind: "glowmoth", name: "Glowmoth", temperament: "Gentle", hostile: false,
    health: 3, damage: 0, xp: 2, speed: 1.35, chaseSpeed: 1.8, turnRate: 7.5, attackRange: 0,
    footOffset: 1.8, radius: 0.38, height: 0.45, habitat: "Mooncap fen, flowers and torchlit caves", active: "Dusk and night",
    behavior: "Orbits flowers and warm light in looping flights. Its glow strengthens in darkness.",
    lore: "A lantern with wings. Some ruins are only found by following their silent midnight spirals.",
    colors: [0x6b5030, 0xf4cc55, 0xfff2a8],
    drops: [{ item: Item.GlowDust, min: 1, max: 2, chance: 0.84 }],
  },
  shadecrawler: {
    kind: "shadecrawler", name: "Shadecrawler", temperament: "Hostile", hostile: true,
    health: 11, damage: 2, xp: 6, speed: 1.05, chaseSpeed: 2.55, turnRate: 8, attackRange: 1.45,
    footOffset: 0.32, radius: 0.7, height: 0.62, habitat: "Deep caves and moonless forests", active: "Darkness",
    behavior: "Circles just outside torchlight, then lunges. Bright daylight forces it back underground.",
    lore: "A many-legged absence between stones. Its eyes appear a moment before the rest of it decides to exist.",
    colors: [0x332b43, 0x725d8c, 0xff6e78],
    drops: [{ item: Item.ShadowShard, min: 1, max: 1, chance: 0.84 }, { item: Item.Coal, min: 1, max: 1, chance: 0.34 }],
  },
  caveblob: {
    kind: "caveblob", name: "Cave Blob", temperament: "Hostile", hostile: true,
    health: 7, damage: 1, xp: 4, speed: 0.55, chaseSpeed: 1.65, turnRate: 5, attackRange: 1.25,
    footOffset: 0.42, radius: 0.48, height: 0.82, habitat: "Aquifers and deepstone caverns", active: "Underground",
    behavior: "Squashes flat, springs forward, and splashes cave gel on impact.",
    lore: "Mineral-rich water learned to hop. Cave Blobs remember every boot that has ever stepped in their pools.",
    colors: [0x4ca47e, 0x8ee0b8, 0x15362b],
    drops: [{ item: Item.CaveGel, min: 1, max: 2, chance: 1 }],
  },
  rattlekin: {
    kind: "rattlekin", name: "Rattlekin", temperament: "Hostile", hostile: true,
    health: 13, damage: 3, xp: 7, speed: 0.8, chaseSpeed: 1.85, turnRate: 5.5, attackRange: 1.55,
    footOffset: 0.92, radius: 0.38, height: 1.78, habitat: "Ruins, badlands and the night surface", active: "Night",
    behavior: "Patrols upright, raises a stone club, then commits to a heavy timed swing.",
    lore: "Not bones, but stone remembering the shape of a traveler. The rhythm of its steps is older than the ruins.",
    colors: [0xd8cfb9, 0x807664, 0x2a2520],
    drops: [{ item: Item.BoneShard, min: 1, max: 2, chance: 1 }, { item: Item.Coal, min: 1, max: 1, chance: 0.2 }],
  },
  zombie: {
    kind: "zombie", name: "Zombie", temperament: "Hostile", hostile: true,
    health: 10, damage: 2, xp: 5, speed: 0.66, chaseSpeed: 1.62, turnRate: 5.2, attackRange: 1.42,
    footOffset: 0.9, radius: 0.38, height: 1.8, habitat: "Dark caves and the night surface", active: "Darkness",
    behavior: "Shambles toward living creatures with both arms raised. Direct sunlight slowly burns it away.",
    lore: "A miner who stayed below one night too many. It remembers doors, footsteps, and almost nothing else.",
    colors: [0x5f8f54, 0x3e7470, 0x263c74],
    drops: [{ item: Item.RottenFlesh, min: 1, max: 2, chance: 0.82 }, { item: Item.SunmetalIngot, min: 1, max: 1, chance: 0.025 }],
  },
  meadowwing: {
    kind: "meadowwing", name: "Meadowwing", temperament: "Gentle", hostile: false,
    health: 1, damage: 0, xp: 0, speed: 1.3, chaseSpeed: 1.8, turnRate: 9, attackRange: 0,
    footOffset: 0.12, radius: 0.12, height: 0.18, habitat: "Flower meadows and sunny Wildwood edges", active: "Clear daylight",
    behavior: "Drifts between Ember Blooms, lands to drink, and rises when a shadow passes overhead.",
    lore: "The first bright wings of spring. Trailkeepers judge the health of a meadow by how many dance above it.",
    colors: [0xf3d451, 0x4b3b25, 0xfff4a8], drops: [], family: "butterfly", captureItem: Item.MeadowwingJar,
  },
  "azure-skippers": {
    kind: "azure-skippers", name: "Azure Skipper", temperament: "Skittish", hostile: false,
    health: 1, damage: 0, xp: 0, speed: 1.7, chaseSpeed: 2.2, turnRate: 11, attackRange: 0,
    footOffset: 0.12, radius: 0.11, height: 0.17, habitat: "Skybells in Birchlight and Wildwood", active: "Bright morning",
    behavior: "Flies in quick blue dashes, shares flowers reluctantly, and rarely rests for long.",
    lore: "A chip of summer sky that refused to stay put.",
    colors: [0x54bce8, 0x244f78, 0xdaf7ff], drops: [], family: "butterfly", captureItem: Item.AzureSkipperJar,
  },
  embertip: {
    kind: "embertip", name: "Embertip", temperament: "Gentle", hostile: false,
    health: 1, damage: 0, xp: 0, speed: 1.45, chaseSpeed: 2, turnRate: 9.5, attackRange: 0,
    footOffset: 0.12, radius: 0.12, height: 0.18, habitat: "Savanna blooms and warm badland oases", active: "Hot daylight",
    behavior: "Warms its dark wings on stone before circling red flowers in wide loops.",
    lore: "Its wing tips hold sunset long after noon has passed.",
    colors: [0xed743d, 0x3b2722, 0xffc35a], drops: [], family: "butterfly", captureItem: Item.EmbertipJar,
  },
  frostveil: {
    kind: "frostveil", name: "Frostveil", temperament: "Skittish", hostile: false,
    health: 1, damage: 0, xp: 0, speed: 1.15, chaseSpeed: 1.75, turnRate: 8.5, attackRange: 0,
    footOffset: 0.12, radius: 0.13, height: 0.19, habitat: "Rare flowers along Frostpine snow lines", active: "Still, sunny afternoons",
    behavior: "Glides more than it flaps and folds into the snow whenever the wind rises.",
    lore: "Often mistaken for a loose snowflake until it chooses a flower.",
    colors: [0xd8f2f5, 0x7896af, 0xffffff], drops: [], family: "butterfly", captureItem: Item.FrostveilJar,
  },
  "bloom-monarch": {
    kind: "bloom-monarch", name: "Bloom Monarch", temperament: "Gentle", hostile: false,
    health: 1, damage: 0, xp: 0, speed: 1.25, chaseSpeed: 1.8, turnRate: 8, attackRange: 0,
    footOffset: 0.12, radius: 0.15, height: 0.2, habitat: "Bloomwood Vale flower canopies", active: "Sunlit noon",
    behavior: "Claims a small court of flowers and returns to the same favorite bloom throughout the day.",
    lore: "Bloomwood children insist every Monarch rules exactly seven flowers.",
    colors: [0xe88fc8, 0x713c70, 0xffd5ee], drops: [], family: "butterfly", captureItem: Item.BloomMonarchJar,
  },
  "fen-lantern": {
    kind: "fen-lantern", name: "Fen Lantern", temperament: "Gentle", hostile: false,
    health: 1, damage: 0, xp: 0, speed: 1.05, chaseSpeed: 1.55, turnRate: 7.5, attackRange: 0,
    footOffset: 0.12, radius: 0.13, height: 0.18, habitat: "Sunny clearings in Siltfen and Mooncap Fen", active: "Humid daylight",
    behavior: "Hovers close to flowers and flashes pale green when another tiny creature approaches.",
    lore: "A daytime cousin of the Glowmoth, carrying a softer and more patient light.",
    colors: [0xb6df62, 0x3e6040, 0xf1ffb5], drops: [], family: "butterfly", captureItem: Item.FenLanternJar,
  },
};

export const BUTTERFLY_ORDER: ButterflyKind[] = ["meadowwing", "azure-skippers", "embertip", "frostveil", "bloom-monarch", "fen-lantern"];
export type CoreMobKind = Exclude<MobKind, ButterflyKind>;
export const CORE_MOB_ORDER: CoreMobKind[] = ["mossling", "ridgeback", "woolhorn", "glowmoth", "shadecrawler", "caveblob", "rattlekin", "zombie"];
export const MOB_ORDER: MobKind[] = [...CORE_MOB_ORDER, ...BUTTERFLY_ORDER];
