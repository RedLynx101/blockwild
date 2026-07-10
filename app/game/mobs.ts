import { Item, type ItemCode } from "./data";

export type ButterflyKind = "meadowwing" | "azure-skippers" | "embertip" | "frostveil" | "bloom-monarch" | "fen-lantern";
export type LegacyMobKind = "mossling" | "ridgeback" | "woolhorn" | "glowmoth" | "shadecrawler" | "caveblob" | "rattlekin" | "zombie";
export type SurfaceMobKind = "sunstep-grazer" | "pebbletortoise" | "brambleboar" | "petalfox" | "duneclatter";
export type BirdKind = "emberjay" | "canopy-lark";
export type AquaticMobKind = "shoalfin" | "coralback" | "brookdart" | "gloomfin";
export type SpecialMobKind = "peelop" | "reliquary-sentinel" | "skeleton";
export type CoreMobKind = LegacyMobKind | SurfaceMobKind | BirdKind | AquaticMobKind | SpecialMobKind;
export type MobKind = CoreMobKind | ButterflyKind;
export type MobTemperament = "Gentle" | "Skittish" | "Defensive" | "Hostile";
export type MobMovement = "ground" | "flying" | "aquatic";
export type MobFamily = "surface" | "bird" | "fish" | "pet" | "construct" | "undead" | "butterfly";

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
  family?: MobFamily;
  movement?: MobMovement;
  aquatic?: boolean;
  flying?: boolean;
  ranged?: boolean;
  persistent?: boolean;
  utility?: string;
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
    family: "undead",
  },
  "sunstep-grazer": {
    kind: "sunstep-grazer", name: "Sunstep Grazer", temperament: "Skittish", hostile: false,
    health: 8, damage: 0, xp: 3, speed: 0.86, chaseSpeed: 2.72, turnRate: 5.4, attackRange: 0,
    footOffset: 0.72, radius: 0.48, height: 1.42, habitat: "Sunstep savannas and meadow margins", active: "Morning and late afternoon",
    behavior: "Browses in pairs, stamps a warning, then escapes in long bounding strides.",
    lore: "Its fan-shaped ears shade its face and flush copper when rain is coming.",
    colors: [0xd7a44e, 0x7b4a2e, 0x20170f], drops: [{ item: Item.Hide, min: 1, max: 2, chance: 0.54 }, { item: Item.RawMeat, min: 1, max: 2, chance: 0.66 }],
    family: "surface", movement: "ground", utility: "A reliable source of hide in dry country, if a player can catch one.",
  },
  pebbletortoise: {
    kind: "pebbletortoise", name: "Pebbletortoise", temperament: "Gentle", hostile: false,
    health: 14, damage: 0, xp: 3, speed: 0.24, chaseSpeed: 0.42, turnRate: 2.2, attackRange: 0,
    footOffset: 0.28, radius: 0.58, height: 0.58, habitat: "Stony meadows, riverbanks and badland shelves", active: "Warm daylight",
    behavior: "Nibbles low plants and withdraws into its lichen-covered shell when startled.",
    lore: "Sleeping specimens are almost indistinguishable from the cairns they slowly rearrange.",
    colors: [0x68705b, 0x9caf73, 0x24291f], drops: [{ item: Item.Flint, min: 1, max: 2, chance: 0.42 }],
    family: "surface", movement: "ground", utility: "Passively clears tall grass around its resting place.",
  },
  brambleboar: {
    kind: "brambleboar", name: "Brambleboar", temperament: "Defensive", hostile: false,
    health: 12, damage: 3, xp: 4, speed: 0.62, chaseSpeed: 2.4, turnRate: 4.4, attackRange: 1.28,
    footOffset: 0.5, radius: 0.62, height: 0.98, habitat: "Dense Wildwood and Bloomwood underbrush", active: "Dawn and dusk",
    behavior: "Roots beneath berry bushes. A threatened boar rattles its thorny mane before a short charge.",
    lore: "Seeds caught in its coat germinate as it travels, leaving crooked green trails through old forest.",
    colors: [0x5e3d2b, 0x486a35, 0xf0d7ac], drops: [{ item: Item.RawMeat, min: 1, max: 3, chance: 0.9 }, { item: Item.Fiber, min: 1, max: 2, chance: 0.72 }],
    family: "surface", movement: "ground", utility: "Occasionally tills a dirt block while rooting.",
  },
  petalfox: {
    kind: "petalfox", name: "Petalfox", temperament: "Skittish", hostile: false,
    health: 6, damage: 0, xp: 3, speed: 0.78, chaseSpeed: 2.9, turnRate: 7.2, attackRange: 0,
    footOffset: 0.42, radius: 0.4, height: 0.78, habitat: "Meadows and flower-rich Bloomwood clearings", active: "Day",
    behavior: "Pounces after insects, naps in flower patches, and flees noisy travelers in a spray of petals.",
    lore: "Its tail changes scent with the flowers it sleeps among.",
    colors: [0xe78ba7, 0xffd4b8, 0x4b2735], drops: [{ item: Item.Fiber, min: 1, max: 1, chance: 0.34 }],
    family: "surface", movement: "ground", utility: "Leads observant players toward dense flower patches and butterflies.",
  },
  duneclatter: {
    kind: "duneclatter", name: "Duneclatter", temperament: "Defensive", hostile: false,
    health: 7, damage: 2, xp: 4, speed: 0.58, chaseSpeed: 1.92, turnRate: 6.2, attackRange: 1.05,
    footOffset: 0.3, radius: 0.5, height: 0.55, habitat: "Desert dunes, cactus flats and temple outskirts", active: "Hot daylight",
    behavior: "Burrows beneath loose sand, then clicks bright wing-cases to warn intruders away.",
    lore: "Caravans follow its evening tracks to firm ground and avoid sinking dunes.",
    colors: [0xc96f32, 0x5f3428, 0xffcf63], drops: [{ item: Item.Flint, min: 1, max: 2, chance: 0.7 }, { item: Item.GlowDust, min: 1, max: 1, chance: 0.16 }],
    family: "surface", movement: "ground", utility: "Its wing-case glint points toward nearby sandstone ruins at sunset.",
  },
  emberjay: {
    kind: "emberjay", name: "Emberjay", temperament: "Skittish", hostile: false,
    health: 3, damage: 0, xp: 2, speed: 1.25, chaseSpeed: 4.1, turnRate: 9, attackRange: 0,
    footOffset: 1.15, radius: 0.26, height: 0.44, habitat: "Savanna acacias, badland cacti and warm forest edges", active: "Day",
    behavior: "Hops along branches, perches to call, and bursts skyward when a human approaches quickly.",
    lore: "A flash of banked fire in the canopy. Its alarm call makes nearby grazers lift their heads.",
    colors: [0xb9432e, 0xe9a141, 0x261b22], drops: [{ item: Item.Feather, min: 1, max: 2, chance: 1 }],
    family: "bird", movement: "flying", flying: true, utility: "Calls when hostile surface creatures are close.",
  },
  "canopy-lark": {
    kind: "canopy-lark", name: "Canopy Lark", temperament: "Skittish", hostile: false,
    health: 3, damage: 0, xp: 2, speed: 1.1, chaseSpeed: 3.7, turnRate: 8.4, attackRange: 0,
    footOffset: 1.1, radius: 0.25, height: 0.42, habitat: "Wildwood, Birchlight and Bloomwood canopies", active: "Morning",
    behavior: "Forages on the ground, returns to a favored branch, and flees sudden movement or attack.",
    lore: "Each flock improvises a local song, so patient explorers can hear when they have crossed into new woods.",
    colors: [0x4f9b75, 0xd9e7a4, 0x20362c], drops: [{ item: Item.Feather, min: 1, max: 2, chance: 1 }],
    family: "bird", movement: "flying", flying: true, utility: "Frequent perching marks mature trees that are suitable for saplings.",
  },
  shoalfin: {
    kind: "shoalfin", name: "Silver Shoalfin", temperament: "Skittish", hostile: false,
    health: 3, damage: 0, xp: 2, speed: 1.4, chaseSpeed: 3.1, turnRate: 8.5, attackRange: 0,
    footOffset: 0, radius: 0.28, height: 0.28, habitat: "Open ocean shallows and kelp shelves", active: "Daylight underwater",
    behavior: "Schools tightly, flashes silver when threatened, and scatters around attackers.",
    lore: "Sailors read the direction of its silver flash to find currents near shore.",
    colors: [0x78b7c8, 0xd9f4ed, 0x17364a], drops: [{ item: Item.RawFish, min: 1, max: 1, chance: 1 }],
    family: "fish", movement: "aquatic", aquatic: true, utility: "A common food fish and a living sign of safe coastal water.",
  },
  coralback: {
    kind: "coralback", name: "Coralback", temperament: "Defensive", hostile: false,
    health: 7, damage: 1, xp: 4, speed: 0.82, chaseSpeed: 1.75, turnRate: 5.5, attackRange: 0.9,
    footOffset: 0, radius: 0.48, height: 0.48, habitat: "Warm ocean reefs and deep coastal shelves", active: "All hours underwater",
    behavior: "Grazes stone clean and presents its harmless coral armor when cornered.",
    lore: "Tiny reef gardens travel on its back, seeding color wherever it rests.",
    colors: [0x387f83, 0xe47f77, 0xffe1a5], drops: [{ item: Item.RawFish, min: 1, max: 2, chance: 1 }, { item: Item.CrystalShard, min: 1, max: 1, chance: 0.08 }],
    family: "fish", movement: "aquatic", aquatic: true, utility: "Slowly encourages decorative coral-like growth on submerged stone.",
  },
  brookdart: {
    kind: "brookdart", name: "Brookdart", temperament: "Skittish", hostile: false,
    health: 2, damage: 0, xp: 2, speed: 1.65, chaseSpeed: 3.4, turnRate: 10, attackRange: 0,
    footOffset: 0, radius: 0.22, height: 0.22, habitat: "Rivers and clear inland pools", active: "Morning and rain",
    behavior: "Faces upstream, darts between stones, and leaps low cascades after rainfall.",
    lore: "Its blue stripe is brightest in clean water, making it a trailkeeper's favorite river gauge.",
    colors: [0x4f78bc, 0xa9d7d2, 0xf3c95f], drops: [{ item: Item.RawFish, min: 1, max: 1, chance: 1 }],
    family: "fish", movement: "aquatic", aquatic: true, utility: "Its presence indicates clean river water.",
  },
  gloomfin: {
    kind: "gloomfin", name: "Gloomfin", temperament: "Defensive", hostile: false,
    health: 5, damage: 1, xp: 4, speed: 0.72, chaseSpeed: 2.2, turnRate: 7, attackRange: 0.95,
    footOffset: 0, radius: 0.34, height: 0.34, habitat: "Underground aquifers and flooded crystal caves", active: "Darkness underwater",
    behavior: "Hovers near cave walls, pulses a cold light, and nips only when trapped.",
    lore: "Miners once carried glass bowls of Gloomfins instead of lanterns. The fish objected.",
    colors: [0x27334f, 0x5bd6ca, 0xc8fff2], drops: [{ item: Item.GlowScale, min: 1, max: 2, chance: 1 }, { item: Item.RawFish, min: 1, max: 1, chance: 0.65 }],
    family: "fish", movement: "aquatic", aquatic: true, utility: "A faint mobile light source for underground pools.",
  },
  peelop: {
    kind: "peelop", name: "Peelop", temperament: "Gentle", hostile: false,
    health: 7, damage: 0, xp: 3, speed: 0.7, chaseSpeed: 2.8, turnRate: 7.8, attackRange: 0,
    footOffset: 0.46, radius: 0.42, height: 0.82, habitat: "Sunny orchard hollows and Peelop picnic groves", active: "Day",
    behavior: "A banana-eared rabbit that loafs in shade, follows trusted keepers, and sits on command.",
    lore: "Its ears ripen from green to gold. A content Peelop smells faintly of warm bread and bananas.",
    colors: [0xf4d34f, 0xfff0a1, 0x5b3a22], drops: [],
    family: "pet", movement: "ground", persistent: true, utility: "Tameable companion; follows, sits, stays, can be named, fed and bred.",
  },
  "reliquary-sentinel": {
    kind: "reliquary-sentinel", name: "Reliquary Sentinel", temperament: "Hostile", hostile: true,
    health: 18, damage: 4, xp: 11, speed: 0.5, chaseSpeed: 1.72, turnRate: 4.8, attackRange: 1.6,
    footOffset: 0.82, radius: 0.5, height: 1.65, habitat: "Desert and forest temple sanctums", active: "When a reliquary is disturbed",
    behavior: "Sleeps as a carved idol, unfolds when a chest is opened, and guards the room with heavy sunlit strikes.",
    lore: "Two vanished orders carved the same guardian in different stone. Neither admitted learning from the other.",
    colors: [0x8d7a62, 0x4f7555, 0xffd36c], drops: [{ item: Item.CrystalShard, min: 1, max: 2, chance: 0.62 }, { item: Item.GoldIngot, min: 1, max: 1, chance: 0.22 }],
    family: "construct", movement: "ground", utility: "Temple guardian and source of rare crystal or gold salvage.",
  },
  skeleton: {
    kind: "skeleton", name: "Skeleton Archer", temperament: "Hostile", hostile: true,
    health: 10, damage: 2, xp: 7, speed: 0.72, chaseSpeed: 1.45, turnRate: 6.2, attackRange: 12,
    footOffset: 0.9, radius: 0.38, height: 1.8, habitat: "Ruins, caves and the night surface", active: "Darkness",
    behavior: "Keeps its distance, draws a visible bone bow, and leads moving targets with arcing arrows.",
    lore: "A patient hunter held together by old cord and an even older grudge.",
    colors: [0xd9d1bb, 0x6e604c, 0x26211d], drops: [{ item: Item.BoneShard, min: 1, max: 3, chance: 1 }, { item: Item.Stick, min: 1, max: 2, chance: 0.4 }],
    family: "undead", movement: "ground", ranged: true, utility: "Ranged night enemy whose arrows provide readable, avoidable pressure.",
  },
  meadowwing: {
    kind: "meadowwing", name: "Meadowwing", temperament: "Gentle", hostile: false,
    health: 1, damage: 0, xp: 0, speed: 1.3, chaseSpeed: 1.8, turnRate: 9, attackRange: 0,
    footOffset: 0.12, radius: 0.12, height: 0.18, habitat: "Flower meadows and sunny Wildwood edges", active: "Clear daylight",
    behavior: "Drifts between Ember Blooms, lands to drink, and rises when a shadow passes overhead.",
    lore: "The first bright wings of spring. Trailkeepers judge the health of a meadow by how many dance above it.",
    colors: [0xf3d451, 0x4b3b25, 0xfff4a8], drops: [], family: "butterfly", movement: "flying", flying: true, captureItem: Item.MeadowwingJar,
  },
  "azure-skippers": {
    kind: "azure-skippers", name: "Azure Skipper", temperament: "Skittish", hostile: false,
    health: 1, damage: 0, xp: 0, speed: 1.7, chaseSpeed: 2.2, turnRate: 11, attackRange: 0,
    footOffset: 0.12, radius: 0.11, height: 0.17, habitat: "Skybells in Birchlight and Wildwood", active: "Bright morning",
    behavior: "Flies in quick blue dashes, shares flowers reluctantly, and rarely rests for long.",
    lore: "A chip of summer sky that refused to stay put.",
    colors: [0x54bce8, 0x244f78, 0xdaf7ff], drops: [], family: "butterfly", movement: "flying", flying: true, captureItem: Item.AzureSkipperJar,
  },
  embertip: {
    kind: "embertip", name: "Embertip", temperament: "Gentle", hostile: false,
    health: 1, damage: 0, xp: 0, speed: 1.45, chaseSpeed: 2, turnRate: 9.5, attackRange: 0,
    footOffset: 0.12, radius: 0.12, height: 0.18, habitat: "Savanna blooms and warm badland oases", active: "Hot daylight",
    behavior: "Warms its dark wings on stone before circling red flowers in wide loops.",
    lore: "Its wing tips hold sunset long after noon has passed.",
    colors: [0xed743d, 0x3b2722, 0xffc35a], drops: [], family: "butterfly", movement: "flying", flying: true, captureItem: Item.EmbertipJar,
  },
  frostveil: {
    kind: "frostveil", name: "Frostveil", temperament: "Skittish", hostile: false,
    health: 1, damage: 0, xp: 0, speed: 1.15, chaseSpeed: 1.75, turnRate: 8.5, attackRange: 0,
    footOffset: 0.12, radius: 0.13, height: 0.19, habitat: "Rare flowers along Frostpine snow lines", active: "Still, sunny afternoons",
    behavior: "Glides more than it flaps and folds into the snow whenever the wind rises.",
    lore: "Often mistaken for a loose snowflake until it chooses a flower.",
    colors: [0xd8f2f5, 0x7896af, 0xffffff], drops: [], family: "butterfly", movement: "flying", flying: true, captureItem: Item.FrostveilJar,
  },
  "bloom-monarch": {
    kind: "bloom-monarch", name: "Bloom Monarch", temperament: "Gentle", hostile: false,
    health: 1, damage: 0, xp: 0, speed: 1.25, chaseSpeed: 1.8, turnRate: 8, attackRange: 0,
    footOffset: 0.12, radius: 0.15, height: 0.2, habitat: "Bloomwood Vale flower canopies", active: "Sunlit noon",
    behavior: "Claims a small court of flowers and returns to the same favorite bloom throughout the day.",
    lore: "Bloomwood children insist every Monarch rules exactly seven flowers.",
    colors: [0xe88fc8, 0x713c70, 0xffd5ee], drops: [], family: "butterfly", movement: "flying", flying: true, captureItem: Item.BloomMonarchJar,
  },
  "fen-lantern": {
    kind: "fen-lantern", name: "Fen Lantern", temperament: "Gentle", hostile: false,
    health: 1, damage: 0, xp: 0, speed: 1.05, chaseSpeed: 1.55, turnRate: 7.5, attackRange: 0,
    footOffset: 0.12, radius: 0.13, height: 0.18, habitat: "Sunny clearings in Siltfen and Mooncap Fen", active: "Humid daylight",
    behavior: "Hovers close to flowers and flashes pale green when another tiny creature approaches.",
    lore: "A daytime cousin of the Glowmoth, carrying a softer and more patient light.",
    colors: [0xb6df62, 0x3e6040, 0xf1ffb5], drops: [], family: "butterfly", movement: "flying", flying: true, captureItem: Item.FenLanternJar,
  },
};

export const BUTTERFLY_ORDER: ButterflyKind[] = ["meadowwing", "azure-skippers", "embertip", "frostveil", "bloom-monarch", "fen-lantern"];
export const LEGACY_MOB_ORDER: LegacyMobKind[] = ["mossling", "ridgeback", "woolhorn", "glowmoth", "shadecrawler", "caveblob", "rattlekin", "zombie"];
export const SURFACE_MOB_ORDER: SurfaceMobKind[] = ["sunstep-grazer", "pebbletortoise", "brambleboar", "petalfox", "duneclatter"];
export const BIRD_ORDER: BirdKind[] = ["emberjay", "canopy-lark"];
export const AQUATIC_MOB_ORDER: AquaticMobKind[] = ["shoalfin", "coralback", "brookdart", "gloomfin"];
export const SPECIAL_MOB_ORDER: SpecialMobKind[] = ["peelop", "reliquary-sentinel", "skeleton"];
export const CORE_MOB_ORDER: CoreMobKind[] = [...LEGACY_MOB_ORDER, ...SURFACE_MOB_ORDER, ...BIRD_ORDER, ...AQUATIC_MOB_ORDER, ...SPECIAL_MOB_ORDER];
export const MOB_ORDER: MobKind[] = [...CORE_MOB_ORDER, ...BUTTERFLY_ORDER];
