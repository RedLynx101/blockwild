import { Item, type ItemCode } from "./data";

export type ButterflyKind = "meadowwing" | "azure-skippers" | "embertip" | "frostveil" | "bloom-monarch" | "fen-lantern";
export type LegacyMobKind = "mossling" | "ridgeback" | "woolhorn" | "glowmoth" | "shadecrawler" | "caveblob" | "rattlekin" | "zombie";
export type SurfaceMobKind =
  | "sunstep-grazer"
  | "pebbletortoise"
  | "brambleboar"
  | "petalfox"
  | "duneclatter"
  | "thimbledeer"
  | "lanternshell"
  | "puddlehopper"
  | "reedstrider"
  | "wild-horse"
  | "meadow-cow"
  | "mistmane";
export type BirdKind = "emberjay" | "canopy-lark";
export type AquaticMobKind = "shoalfin" | "coralback" | "brookdart" | "gloomfin" | "silverthread" | "reedneedle" | "emberribbon" | "cavefilament";
export type PollinatorKind = "honeybee" | "hive-queen" | "reed-dragonfly";
export type SpecialMobKind = "peelop" | "reliquary-sentinel" | "skeleton";
export type CoreMobKind = LegacyMobKind | SurfaceMobKind | BirdKind | AquaticMobKind | PollinatorKind | SpecialMobKind;
export type MobKind = CoreMobKind | ButterflyKind;
export type MobTemperament = "Gentle" | "Skittish" | "Defensive" | "Hostile";
export type MobMovement = "ground" | "flying" | "aquatic";
export type MobFamily = "surface" | "bird" | "fish" | "pet" | "mount" | "pollinator" | "construct" | "undead" | "butterfly";

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
  /** Bestiary-facing care metadata. Omitted values are displayed as false/unknown. */
  sentient?: boolean;
  tameable?: boolean;
  tameItems?: ItemCode[];
  breedable?: boolean;
  breedingFoods?: ItemCode[];
  diet?: ItemCode[];
  /** Extra field notes that only become readable after the creature has been tamed. */
  postTameNotes?: string;
  secretHint?: string;
  /** A useful biome-level clue shown before the creature has been discovered. */
  discoveryHint?: string;
};

export const MOB_DEFS: Record<MobKind, MobDefinition> = {
  mossling: {
    kind: "mossling", name: "Mossling", temperament: "Skittish", hostile: false,
    health: 5, damage: 0, xp: 2, speed: 0.72, chaseSpeed: 1.9, turnRate: 6, attackRange: 0,
    footOffset: 0.9, radius: 0.36, height: 0.82, habitat: "Wet forests, Bloomwood and Siltfen", active: "Day and rain",
    behavior: "Forages in short hops, gathers near flowers, and bounds away when struck.",
    lore: "A walking knot of moss and root. Old trailkeepers say every grove begins with one curious Mossling.",
    colors: [0x4f8a43, 0x9bc878, 0x172517],
    drops: [{ item: Item.Fiber, min: 1, max: 2, chance: 0.9 }, { item: Item.Berry, min: 1, max: 1, chance: 0.3 }],
    sentient: false, breedable: true, breedingFoods: [Item.Berry], diet: [Item.Berry, Item.Wheat],
    discoveryHint: "Look beneath rain-dark leaves in Bloomwood and Siltfen.",
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
    sentient: false, breedable: true, breedingFoods: [Item.Wheat, Item.Apple], diet: [Item.Wheat, Item.Apple, Item.Berry],
    discoveryHint: "Open meadow and savanna herds leave broad, plated tracks.",
  },
  woolhorn: {
    kind: "woolhorn", name: "Woolhorn", temperament: "Gentle", hostile: false,
    health: 9, damage: 1, xp: 3, speed: 0.42, chaseSpeed: 1.55, turnRate: 3.8, attackRange: 1.1,
    footOffset: 1.25, radius: 0.52, height: 1.18, habitat: "Frostpine taiga and snowy fields", active: "Day",
    behavior: "Grazes through snow, follows nearby Woolhorns, and braces behind its curled horns when cornered.",
    lore: "Cloud-soft wool hides a stubborn mountain heart. Their tracks are often the safest path through a blizzard.",
    colors: [0xe8e5d8, 0x756c61, 0x20211f],
    drops: [{ item: Item.Wool, min: 1, max: 2, chance: 1 }, { item: Item.RawMeat, min: 1, max: 1, chance: 0.58 }],
    sentient: false, breedable: true, breedingFoods: [Item.Wheat], diet: [Item.Wheat, Item.Apple],
    discoveryHint: "Follow wool caught on low Frostpine branches.",
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
    footOffset: 0.887916526, radius: 0.7, height: 0.62, habitat: "Deep caves and moonless forests", active: "Darkness",
    behavior: "Circles just outside torchlight, then lunges. Bright daylight forces it back underground.",
    lore: "A many-legged absence between stones. Its eyes appear a moment before the rest of it decides to exist.",
    colors: [0x332b43, 0x725d8c, 0xff6e78],
    drops: [
      { item: Item.ShadowShard, min: 1, max: 1, chance: 0.84 },
      { item: Item.Coal, min: 1, max: 1, chance: 0.34 },
      { item: Item.NocturneHeart, min: 1, max: 1, chance: 0.08 },
    ],
    sentient: false, tameable: true, tameItems: [Item.NocturneHeart], diet: [Item.Berry, Item.RottenFlesh, Item.RawMeat],
    postTameNotes: "Patient feeding deepens the bond and grows a Shadecrawler to three times its wild size. A full-grown companion accepts a saddle and can be ridden.",
    secretHint: "Six Moonberries calm its hunger before a rare Nocturne Heart can form a lasting bond.",
    discoveryHint: "Search broad deepstone chambers beyond direct torchlight.",
  },
  caveblob: {
    kind: "caveblob", name: "Cave Blob", temperament: "Hostile", hostile: true,
    health: 7, damage: 1, xp: 4, speed: 0.55, chaseSpeed: 1.65, turnRate: 5, attackRange: 1.25,
    footOffset: 0.81, radius: 0.48, height: 0.82, habitat: "Aquifers and deepstone caverns", active: "Underground",
    behavior: "Squashes flat, springs forward, and splashes cave gel on impact.",
    lore: "Mineral-rich water learned to hop. Cave Blobs remember every boot that has ever stepped in their pools.",
    colors: [0x4ca47e, 0x8ee0b8, 0x15362b],
    drops: [{ item: Item.CaveGel, min: 1, max: 2, chance: 1 }],
  },
  rattlekin: {
    kind: "rattlekin", name: "Rattlekin", temperament: "Hostile", hostile: true,
    health: 13, damage: 3, xp: 7, speed: 0.8, chaseSpeed: 1.85, turnRate: 5.5, attackRange: 1.55,
    footOffset: 1.04, radius: 0.38, height: 1.78, habitat: "Ruins, badlands and the night surface", active: "Night",
    behavior: "Patrols upright, raises a stone club, then commits to a heavy timed swing.",
    lore: "Not bones, but stone remembering the shape of a traveler. The rhythm of its steps is older than the ruins.",
    colors: [0xd8cfb9, 0x807664, 0x2a2520],
    drops: [{ item: Item.BoneShard, min: 1, max: 2, chance: 1 }, { item: Item.Coal, min: 1, max: 1, chance: 0.2 }],
  },
  zombie: {
    kind: "zombie", name: "Zombie", temperament: "Hostile", hostile: true,
    health: 10, damage: 2, xp: 5, speed: 0.66, chaseSpeed: 1.62, turnRate: 5.2, attackRange: 1.42,
    footOffset: 0.5, radius: 0.38, height: 1.8, habitat: "Dark caves and the night surface", active: "Darkness",
    behavior: "Shambles toward living creatures with both arms raised. Direct sunlight slowly burns it away.",
    lore: "A miner who stayed below one night too many. It remembers doors, footsteps, and almost nothing else.",
    colors: [0x5f8f54, 0x3e7470, 0x263c74],
    drops: [{ item: Item.RottenFlesh, min: 1, max: 2, chance: 0.82 }, { item: Item.SunmetalIngot, min: 1, max: 1, chance: 0.025 }],
    family: "undead",
  },
  "sunstep-grazer": {
    kind: "sunstep-grazer", name: "Sunstep Grazer", temperament: "Skittish", hostile: false,
    health: 11, damage: 0, xp: 4, speed: 0.82, chaseSpeed: 2.72, turnRate: 4.8, attackRange: 0,
    footOffset: 1.4394, radius: 0.62, height: 1.73, habitat: "Sunstep savannas and meadow margins", active: "Morning and late afternoon",
    behavior: "Moves in broad herds of four to seven, stamps a warning, then escapes in coordinated bounding strides.",
    lore: "Its fan-shaped ears shade its face and flush copper when rain is coming.",
    colors: [0xd7a44e, 0x7b4a2e, 0x20170f], drops: [{ item: Item.Hide, min: 1, max: 2, chance: 0.54 }, { item: Item.RawMeat, min: 1, max: 2, chance: 0.66 }],
    family: "surface", movement: "ground", utility: "A reliable source of hide in dry country, if a player can catch one.",
    sentient: false, breedable: true, breedingFoods: [Item.Wheat, Item.Apple], diet: [Item.Wheat, Item.Apple],
    discoveryHint: "Listen for warning stamps along bright savanna margins.",
  },
  pebbletortoise: {
    kind: "pebbletortoise", name: "Pebbletortoise", temperament: "Gentle", hostile: false,
    health: 14, damage: 0, xp: 3, speed: 0.24, chaseSpeed: 0.42, turnRate: 2.2, attackRange: 0,
    footOffset: 0.78, radius: 0.58, height: 0.58, habitat: "Stony meadows, riverbanks and badland shelves", active: "Warm daylight",
    behavior: "Nibbles low plants and withdraws into its lichen-covered shell when startled.",
    lore: "Sleeping specimens are almost indistinguishable from the cairns they slowly rearrange.",
    colors: [0x68705b, 0x9caf73, 0x24291f], drops: [{ item: Item.Flint, min: 1, max: 2, chance: 0.42 }],
    family: "surface", movement: "ground", utility: "Passively clears tall grass around its resting place.",
    sentient: false, breedable: true, breedingFoods: [Item.Berry], diet: [Item.Berry, Item.Wheat],
    discoveryHint: "Inspect lichen-covered stones beside warm riverbanks.",
  },
  brambleboar: {
    kind: "brambleboar", name: "Brambleboar", temperament: "Defensive", hostile: false,
    health: 12, damage: 3, xp: 4, speed: 0.62, chaseSpeed: 2.4, turnRate: 4.4, attackRange: 1.28,
    footOffset: 1.08, radius: 0.62, height: 0.98, habitat: "Dense Wildwood and Bloomwood underbrush", active: "Dawn and dusk",
    behavior: "Roots beneath berry bushes. A threatened boar rattles its thorny mane before a short charge.",
    lore: "Seeds caught in its coat germinate as it travels, leaving crooked green trails through old forest.",
    colors: [0x5e3d2b, 0x486a35, 0xf0d7ac], drops: [{ item: Item.RawMeat, min: 1, max: 3, chance: 0.9 }, { item: Item.Fiber, min: 1, max: 2, chance: 0.72 }],
    family: "surface", movement: "ground", utility: "Occasionally tills a dirt block while rooting.",
    sentient: false, breedable: true, breedingFoods: [Item.Apple, Item.Berry], diet: [Item.Apple, Item.Berry, Item.Wheat],
    discoveryHint: "Bramble trails and freshly rooted soil mark dense forest underbrush.",
  },
  petalfox: {
    kind: "petalfox", name: "Petalfox", temperament: "Skittish", hostile: false,
    health: 6, damage: 0, xp: 3, speed: 0.78, chaseSpeed: 2.9, turnRate: 7.2, attackRange: 0,
    footOffset: 0.95, radius: 0.4, height: 0.78, habitat: "Meadows and flower-rich Bloomwood clearings", active: "Day",
    behavior: "Pounces after insects, naps in flower patches, and flees noisy travelers in a spray of petals.",
    lore: "Its tail changes scent with the flowers it sleeps among.",
    colors: [0xe78ba7, 0xffd4b8, 0x4b2735], drops: [{ item: Item.Fiber, min: 1, max: 1, chance: 0.34 }],
    family: "surface", movement: "ground", utility: "Leads observant players toward dense flower patches and butterflies.",
    sentient: false, breedable: true, breedingFoods: [Item.Berry], diet: [Item.Berry, Item.Apple],
    discoveryHint: "Watch for drifting petals that move against the wind.",
  },
  duneclatter: {
    kind: "duneclatter", name: "Duneclatter", temperament: "Defensive", hostile: false,
    health: 7, damage: 2, xp: 4, speed: 0.58, chaseSpeed: 1.92, turnRate: 6.2, attackRange: 1.05,
    footOffset: 0.87505902, radius: 0.5, height: 0.55, habitat: "Desert dunes, cactus flats and temple outskirts", active: "Hot daylight",
    behavior: "Burrows beneath loose sand, then clicks bright wing-cases to warn intruders away.",
    lore: "Caravans follow its evening tracks to firm ground and avoid sinking dunes.",
    colors: [0xc96f32, 0x5f3428, 0xffcf63], drops: [{ item: Item.Flint, min: 1, max: 2, chance: 0.7 }, { item: Item.GlowDust, min: 1, max: 1, chance: 0.16 }],
    family: "surface", movement: "ground", utility: "Its wing-case glint points toward nearby sandstone ruins at sunset.",
  },
  thimbledeer: {
    kind: "thimbledeer", name: "Thimbledeer", temperament: "Skittish", hostile: false,
    health: 7, damage: 0, xp: 3, speed: 0.82, chaseSpeed: 3.05, turnRate: 6.8, attackRange: 0,
    footOffset: 1.13, radius: 0.42, height: 1.28, habitat: "Meadows and pale Birchlight glades", active: "Morning and late afternoon",
    behavior: "Browses flower heads with its narrow muzzle, freezes when watched, then bounds through openings between trees.",
    lore: "Its tiny thimble-shaped antlers collect seeds. Every seasonal migration quietly redraws the edge of a meadow.",
    colors: [0xb9865b, 0xe8d8b0, 0x292118],
    drops: [{ item: Item.Hide, min: 1, max: 1, chance: 0.48 }, { item: Item.Fiber, min: 1, max: 2, chance: 0.38 }],
    family: "surface", movement: "ground", utility: "Occasionally carries a flower seed from one meadow patch to another.",
    sentient: false, breedable: true, breedingFoods: [Item.Apple], diet: [Item.Apple, Item.Berry, Item.Wheat],
    discoveryHint: "Search quiet Birchlight glades at the edge of flower meadows.",
  },
  lanternshell: {
    kind: "lanternshell", name: "Lanternshell", temperament: "Gentle", hostile: false,
    health: 9, damage: 0, xp: 3, speed: 0.2, chaseSpeed: 0.44, turnRate: 2.2, attackRange: 0,
    footOffset: 0.77, radius: 0.56, height: 0.74, habitat: "Siltfen roots and luminous mushroom hollows", active: "Rain, dusk and humid nights",
    behavior: "Glides over moss, rests beneath broad leaves, and brightens its glassy spiral shell when rain begins.",
    lore: "Fen paths once used sleeping Lanternshells as milestones. They moved slowly enough that the maps were usually right.",
    colors: [0x526845, 0x7fd6a8, 0xf2ffb0],
    drops: [{ item: Item.CaveGel, min: 1, max: 1, chance: 0.42 }, { item: Item.GlowDust, min: 1, max: 1, chance: 0.22 }],
    family: "surface", movement: "ground", utility: "A calm living night-light whose shell glows brighter before rain.",
    sentient: false, breedable: true, breedingFoods: [Item.Berry], diet: [Item.Berry, Item.Wheat],
    discoveryHint: "Look under Siltfen roots after rain or near glowing mushrooms at dusk.",
  },
  puddlehopper: {
    kind: "puddlehopper", name: "Puddlehopper", temperament: "Skittish", hostile: false,
    health: 4, damage: 0, xp: 2, speed: 0.58, chaseSpeed: 2.55, turnRate: 8.2, attackRange: 0,
    footOffset: 0.8, radius: 0.38, height: 0.58, habitat: "River reeds, Siltfen pools and rainy meadow hollows", active: "Rain and humid daylight",
    behavior: "Bounds frequently between reeds, doubles its hop cadence in rain, and launches into faster springing leaps when startled.",
    lore: "Each throat pouch carries a different hollow note. A whole pond sounds like rain falling into clay cups.",
    colors: [0x5e9b69, 0xd5c85b, 0x182a20],
    drops: [{ item: Item.CaveGel, min: 1, max: 1, chance: 0.28 }],
    family: "surface", movement: "ground", utility: "Its evening calls mark nearby surface water and incoming rain.",
    sentient: false, breedable: true, breedingFoods: [Item.Berry], diet: [Item.Berry],
    discoveryHint: "Wait beside reeds during rain and listen for hollow plunks.",
  },
  reedstrider: {
    kind: "reedstrider", name: "Reedstrider", temperament: "Defensive", hostile: false,
    health: 8, damage: 2, xp: 4, speed: 0.64, chaseSpeed: 2.35, turnRate: 5.8, attackRange: 1.25,
    footOffset: 1.1, radius: 0.4, height: 1.64, habitat: "Siltfen shallows, broad rivers and meadow wetlands", active: "Dawn and overcast daylight",
    behavior: "Stalks tiny fish between reeds, fans its broad wings to warn intruders, and only kicks when cornered.",
    lore: "Its hollow crest amplifies a call that carries over fog. River travelers use the answering echoes to judge a channel's width.",
    colors: [0x668a78, 0xc9a65f, 0x243039],
    drops: [{ item: Item.Feather, min: 1, max: 2, chance: 0.86 }, { item: Item.RawFish, min: 1, max: 1, chance: 0.18 }],
    family: "mount", movement: "ground", persistent: true, utility: "A tame, saddled Reedstrider is a fast amphibious mount and crosses water faster than land.",
    sentient: false, tameable: true, tameItems: [Item.RawFish, Item.CookedFish, Item.GlowScale],
    breedable: true, breedingFoods: [Item.RawFish], diet: [Item.RawFish, Item.CookedFish, Item.GlowScale, Item.Berry],
    postTameNotes: "Build trust with fish, then fit a Trail Saddle. Its long stride is steady on land and exceptionally quick through shallows.",
    secretHint: "Glow Scales build trust much faster than ordinary fish.",
    discoveryHint: "Follow resonant dawn calls across foggy wetlands.",
  },
  "wild-horse": {
    kind: "wild-horse", name: "Wildwood Courser", temperament: "Skittish", hostile: false,
    health: 14, damage: 1, xp: 5, speed: 1.05, chaseSpeed: 4.5, turnRate: 5.2, attackRange: 1.2,
    footOffset: 1.05, radius: 0.62, height: 1.75, habitat: "Open meadows, forest roads and upland glens", active: "Day",
    behavior: "Travels in small family bands, circles foals when threatened, and bolts into open terrain rather than trees.",
    lore: "Wildwood Coursers remember old roads long after roots and flowers have hidden them.",
    colors: [0x8b5b3d, 0xd6b17b, 0x2b211d], drops: [{ item: Item.Hide, min: 1, max: 3, chance: 0.78 }],
    family: "mount", movement: "ground", persistent: true, utility: "A fast land mount after patient feeding and fitting a Trail Saddle.",
    sentient: false, tameable: true, tameItems: [Item.Apple, Item.Wheat], breedable: true,
    breedingFoods: [Item.Apple], diet: [Item.Apple, Item.Wheat], captureItem: Item.CaptureOrb,
    postTameNotes: "A saddled Courser carries one rider and prefers clear ground.",
    discoveryHint: "Look for hoofprints along broad meadow edges and old forest roads.",
  },
  "meadow-cow": {
    kind: "meadow-cow", name: "Cloverback", temperament: "Gentle", hostile: false,
    health: 12, damage: 0, xp: 4, speed: 0.45, chaseSpeed: 1.65, turnRate: 3.8, attackRange: 0,
    footOffset: 0.96, radius: 0.66, height: 1.38, habitat: "Flower meadows and settled pasture clearings", active: "Day",
    behavior: "Grazes in loose herds, follows wheat, and stands beneath trees during hard rain.",
    lore: "Clover patterns bloom across its back in spring, making every herd look like a moving meadow.",
    colors: [0xf0e3c2, 0x6f513b, 0x6e9b51], drops: [{ item: Item.RawMeat, min: 1, max: 3, chance: 1 }, { item: Item.Hide, min: 1, max: 2, chance: 0.72 }],
    family: "surface", movement: "ground", utility: "Can be milked for Meadow Milk and bred with wheat.",
    sentient: false, breedable: true, breedingFoods: [Item.Wheat], diet: [Item.Wheat, Item.Apple], captureItem: Item.CaptureOrb,
    discoveryHint: "Listen for soft bells where meadow flowers give way to shade.",
  },
  mistmane: {
    kind: "mistmane", name: "Mistmane", temperament: "Gentle", hostile: false,
    health: 9, damage: 0, xp: 4, speed: 0.62, chaseSpeed: 2.2, turnRate: 5.4, attackRange: 0,
    footOffset: 0.92, radius: 0.48, height: 1.32, habitat: "Cool Cloudreed Glens above wet valleys", active: "Overcast day and dawn",
    behavior: "Browses cloudreeds in quiet groups and shakes beads of fog from its long glassy mane.",
    lore: "Its wool traps morning mist. Trailkeepers once wrung drinking water from shed curls on dry climbs.",
    colors: [0xb8d6cf, 0x6d8f8a, 0xeaf7e9], drops: [{ item: Item.Fiber, min: 1, max: 3, chance: 0.9 }],
    family: "surface", movement: "ground", utility: "A renewable source of soft fiber in Cloudreed country.",
    sentient: false, breedable: true, breedingFoods: [Item.Wheat], diet: [Item.Wheat, Item.Berry], captureItem: Item.CaptureOrb,
    discoveryHint: "Search cool upland reed basins where bells sound in the fog.",
  },
  emberjay: {
    kind: "emberjay", name: "Emberjay", temperament: "Skittish", hostile: false,
    health: 3, damage: 0, xp: 2, speed: 1.25, chaseSpeed: 4.1, turnRate: 9, attackRange: 0,
    footOffset: 1.15, radius: 0.26, height: 0.44, habitat: "Savanna acacias, badland cacti and warm forest edges", active: "Day",
    behavior: "Hops along branches, perches to call, and bursts skyward when a human approaches quickly.",
    lore: "A flash of banked fire in the canopy. Its alarm call makes nearby grazers lift their heads.",
    colors: [0xb9432e, 0xe9a141, 0x261b22], drops: [{ item: Item.Feather, min: 1, max: 2, chance: 1 }],
    family: "bird", movement: "flying", flying: true, utility: "Calls when hostile surface creatures are close.",
    sentient: false, breedable: true, breedingFoods: [Item.Wheat], diet: [Item.Wheat, Item.Berry],
  },
  "canopy-lark": {
    kind: "canopy-lark", name: "Canopy Lark", temperament: "Skittish", hostile: false,
    health: 3, damage: 0, xp: 2, speed: 1.1, chaseSpeed: 3.7, turnRate: 8.4, attackRange: 0,
    footOffset: 1.1, radius: 0.25, height: 0.42, habitat: "Wildwood, Birchlight and Bloomwood canopies", active: "Morning",
    behavior: "Forages on the ground, returns to a favored branch, and flees sudden movement or attack.",
    lore: "Each flock improvises a local song, so patient explorers can hear when they have crossed into new woods.",
    colors: [0x4f9b75, 0xd9e7a4, 0x20362c], drops: [{ item: Item.Feather, min: 1, max: 2, chance: 1 }],
    family: "bird", movement: "flying", flying: true, utility: "Frequent perching marks mature trees that are suitable for saplings.",
    sentient: false, breedable: true, breedingFoods: [Item.Berry], diet: [Item.Berry, Item.Wheat],
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
  silverthread: {
    kind: "silverthread", name: "Silverthread", temperament: "Skittish", hostile: false,
    health: 2, damage: 0, xp: 2, speed: 1.75, chaseSpeed: 3.6, turnRate: 11, attackRange: 0,
    footOffset: 0, radius: 0.13, height: 0.11, habitat: "Sunlit ocean shallows", active: "Daylight underwater",
    behavior: "Forms glittering shoals of six to twelve and folds into narrow ribbons around rocks.",
    lore: "From shore, a turning shoal looks like a silver stitch holding sea to sky.",
    colors: [0xb9e4e8, 0x638fa7, 0xf7ffff], drops: [{ item: Item.RawFish, min: 1, max: 1, chance: 0.72 }],
    family: "fish", movement: "aquatic", aquatic: true, utility: "A quick, delicate food fish.", captureItem: Item.CaptureOrb,
  },
  reedneedle: {
    kind: "reedneedle", name: "Reedneedle", temperament: "Skittish", hostile: false,
    health: 2, damage: 0, xp: 2, speed: 1.9, chaseSpeed: 3.8, turnRate: 12, attackRange: 0,
    footOffset: 0, radius: 0.12, height: 0.1, habitat: "Deep river channels and reed beds", active: "Morning and rain",
    behavior: "Holds perfectly straight into the current, then darts as a single green shoal when startled.",
    lore: "Anglers used to mistake its shadow for waving grass until the grass swam upstream.",
    colors: [0x698d55, 0xc2d68a, 0x243e35], drops: [{ item: Item.RawFish, min: 1, max: 1, chance: 0.8 }],
    family: "fish", movement: "aquatic", aquatic: true, utility: "Its shoals reveal the main current in broad rivers.", captureItem: Item.CaptureOrb,
  },
  emberribbon: {
    kind: "emberribbon", name: "Emberribbon", temperament: "Skittish", hostile: false,
    health: 3, damage: 0, xp: 3, speed: 1.55, chaseSpeed: 3.2, turnRate: 9.5, attackRange: 0,
    footOffset: 0, radius: 0.15, height: 0.12, habitat: "Warm reef shelves and volcanic springs", active: "All hours underwater",
    behavior: "Threads through warm coral in loose red shoals and hides inside steam-dark crevices.",
    lore: "Its heat never boils water, but a handful can keep a traveler's fingers warm.",
    colors: [0xe46c45, 0xffc25e, 0x542a2c], drops: [{ item: Item.RawFish, min: 1, max: 1, chance: 0.84 }, { item: Item.GlowScale, min: 1, max: 1, chance: 0.12 }],
    family: "fish", movement: "aquatic", aquatic: true, utility: "A warm-water food fish with a rare luminous scale.", captureItem: Item.CaptureOrb,
  },
  cavefilament: {
    kind: "cavefilament", name: "Cave Filament", temperament: "Gentle", hostile: false,
    health: 2, damage: 0, xp: 3, speed: 1.2, chaseSpeed: 2.7, turnRate: 8.5, attackRange: 0,
    footOffset: 0, radius: 0.14, height: 0.11, habitat: "Underground water and flooded crystal seams", active: "Darkness underwater",
    behavior: "Suspends in vertical shoals until vibration sends pale lines spiraling through the pool.",
    lore: "Cave Filaments make invisible aquifers readable, sketching every current in living light.",
    colors: [0x6ed6c8, 0xd9fff4, 0x263c5a], drops: [{ item: Item.GlowScale, min: 1, max: 1, chance: 0.55 }],
    family: "fish", movement: "aquatic", aquatic: true, utility: "Reveals hidden movement in dark underground pools.", captureItem: Item.CaptureOrb,
  },
  honeybee: {
    kind: "honeybee", name: "Wild Honeybee", temperament: "Defensive", hostile: false,
    health: 2, damage: 1, xp: 1, speed: 1.55, chaseSpeed: 2.8, turnRate: 11, attackRange: 0.55,
    footOffset: 1.25, radius: 0.12, height: 0.13, habitat: "Flower meadows, orchards and wild apiaries", active: "Daylight",
    behavior: "Selects a flower, lands to gather nectar, and returns to its queen before dusk.",
    lore: "Each worker carries a map of flowers written in sunlight and scent.",
    colors: [0xe8ad32, 0x35291f, 0xf2e4bd], drops: [{ item: Item.Beeswax, min: 1, max: 1, chance: 0.16 }],
    family: "pollinator", movement: "flying", flying: true, persistent: true, utility: "Pollinates crops and returns nectar to a queen.", captureItem: Item.WorkerBee,
  },
  "hive-queen": {
    kind: "hive-queen", name: "Hive Queen", temperament: "Defensive", hostile: false,
    health: 8, damage: 3, xp: 5, speed: 1.1, chaseSpeed: 2.4, turnRate: 8, attackRange: 0.75,
    footOffset: 1.3, radius: 0.2, height: 0.22, habitat: "Wild hives and stocked apiaries", active: "Daylight",
    behavior: "Builds a colony from as few as zero workers, defends it with a heavy sting, and directs workers home at dusk.",
    lore: "A queen's wingbeat is lower than a worker's and can quiet an entire hive.",
    colors: [0xf0c850, 0x3d2b24, 0xffefaf], drops: [{ item: Item.QueenCell, min: 1, max: 1, chance: 0.28 }, { item: Item.Honeycomb, min: 1, max: 2, chance: 0.65 }],
    family: "pollinator", movement: "flying", flying: true, persistent: true, utility: "Produces workers and can be tamed with Royal Jelly below half health.",
    sentient: false, tameable: true, tameItems: [Item.RoyalJelly], diet: [Item.RoyalJelly], captureItem: Item.CaptureOrb,
    postTameNotes: "A trusted queen directs her workers to defend the keeper who fed her Royal Jelly.",
    secretHint: "A net or Capture Orb only catches a queen once she is below half health.",
  },
  "reed-dragonfly": {
    kind: "reed-dragonfly", name: "Reed Dragonfly", temperament: "Skittish", hostile: false,
    health: 2, damage: 0, xp: 1, speed: 2.2, chaseSpeed: 4.4, turnRate: 13, attackRange: 0,
    footOffset: 1.1, radius: 0.19, height: 0.12, habitat: "River ribbons, fen pools and Cloudreed Glens", active: "Warm daylight",
    behavior: "Patrols a short waterline, perches on reed tips, and snaps up tiny insects in abrupt sideways dashes.",
    lore: "Its four glass wings briefly show the color of whatever water lies below.",
    colors: [0x4ab6a0, 0x274958, 0xbdebd9], drops: [],
    family: "pollinator", movement: "flying", flying: true, utility: "A living marker for healthy reeds and insect-rich water.", captureItem: Item.CaptureOrb,
  },
  peelop: {
    kind: "peelop", name: "Peelop", temperament: "Gentle", hostile: false,
    health: 7, damage: 2, xp: 3, speed: 0.7, chaseSpeed: 2.8, turnRate: 7.8, attackRange: 1.55,
    footOffset: 0.95, radius: 0.42, height: 0.82, habitat: "Sunny orchard hollows and Peelop picnic groves", active: "Day",
    behavior: "A banana-eared rabbit that loafs in shade, sheds ripe bananas, and only leap-attacks after it or its keeper is struck.",
    lore: "Its ears ripen from green to gold. A content Peelop smells faintly of warm bread and bananas.",
    colors: [0xf4d34f, 0xfff0a1, 0x5b3a22], drops: [],
    family: "pet", movement: "ground", persistent: true, utility: "Tameable companion; follows, sits, stays, can be named, fed and bred.",
    sentient: false, tameable: true, tameItems: [Item.Banana, Item.Apple, Item.Berry, Item.Wheat],
    breedable: true, breedingFoods: [Item.Banana], diet: [Item.Banana, Item.Apple, Item.Berry, Item.Wheat],
    postTameNotes: "A trusted Peelop can follow, sit, stay or wander; crouch-use opens its detailed companion commands.",
    secretHint: "Golden Bananas are the quickest path to trust and healthy young.",
    discoveryHint: "Sunny orchard hollows and Peelop picnic groves sometimes shelter a small family.",
  },
  "reliquary-sentinel": {
    kind: "reliquary-sentinel", name: "Reliquary Sentinel", temperament: "Hostile", hostile: true,
    health: 18, damage: 4, xp: 11, speed: 0.5, chaseSpeed: 1.72, turnRate: 4.8, attackRange: 1.6,
    footOffset: 1.05, radius: 0.5, height: 1.65, habitat: "Desert and forest temple sanctums", active: "When a reliquary is disturbed",
    behavior: "Sleeps as a carved idol, unfolds when a chest is opened, and guards the room with heavy sunlit strikes.",
    lore: "Two vanished orders carved the same guardian in different stone. Neither admitted learning from the other.",
    colors: [0x8d7a62, 0x4f7555, 0xffd36c], drops: [{ item: Item.CrystalShard, min: 1, max: 2, chance: 0.62 }, { item: Item.GoldIngot, min: 1, max: 1, chance: 0.22 }],
    family: "construct", movement: "ground", utility: "Temple guardian and source of rare crystal or gold salvage.",
  },
  skeleton: {
    kind: "skeleton", name: "Skeleton Archer", temperament: "Hostile", hostile: true,
    health: 10, damage: 2, xp: 7, speed: 0.72, chaseSpeed: 1.45, turnRate: 6.2, attackRange: 12,
    footOffset: 1.03, radius: 0.38, height: 1.8, habitat: "Ruins, caves and the night surface", active: "Darkness",
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
export const SURFACE_MOB_ORDER: SurfaceMobKind[] = [
  "sunstep-grazer", "pebbletortoise", "brambleboar", "petalfox", "duneclatter",
  "thimbledeer", "lanternshell", "puddlehopper", "reedstrider", "wild-horse", "meadow-cow", "mistmane",
];
export const BIRD_ORDER: BirdKind[] = ["emberjay", "canopy-lark"];
export const AQUATIC_MOB_ORDER: AquaticMobKind[] = ["shoalfin", "coralback", "brookdart", "gloomfin", "silverthread", "reedneedle", "emberribbon", "cavefilament"];
export const POLLINATOR_ORDER: PollinatorKind[] = ["honeybee", "hive-queen", "reed-dragonfly"];
export const SPECIAL_MOB_ORDER: SpecialMobKind[] = ["peelop", "reliquary-sentinel", "skeleton"];
export const CORE_MOB_ORDER: CoreMobKind[] = [...LEGACY_MOB_ORDER, ...SURFACE_MOB_ORDER, ...BIRD_ORDER, ...AQUATIC_MOB_ORDER, ...POLLINATOR_ORDER, ...SPECIAL_MOB_ORDER];
export const MOB_ORDER: MobKind[] = [...CORE_MOB_ORDER, ...BUTTERFLY_ORDER];
