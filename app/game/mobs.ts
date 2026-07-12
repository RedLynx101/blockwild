import { Item, type ItemCode } from "./data";

export type ButterflyKind = "meadowwing" | "azure-skippers" | "embertip" | "frostveil" | "bloom-monarch" | "fen-lantern" | "bonbonwing" | "moonveil-wing";
export type LegacyMobKind = "mossling" | "ridgeback" | "woolhorn" | "glowmoth" | "shadecrawler" | "caveblob" | "rattlekin" | "zombie";
export type SurfaceMobKind =
  | "sunstep-grazer"
  | "pebbletortoise"
  | "brambleboar"
  | "petalfox"
  | "emberbrush-fox"
  | "moonpetal-fox"
  | "duneclatter"
  | "thimbledeer"
  | "frostlace-hart"
  | "reedcrown-deer"
  | "lanternshell"
  | "puddlehopper"
  | "reedstrider"
  | "wild-horse"
  | "rimehoof-courser"
  | "sunscar-courser"
  | "mirestride-courser"
  | "starbough-courser"
  | "meadow-cow"
  | "sunbloom-longhorn"
  | "mistmane"
  | "sakurakit"
  | "sunwash-crab"
  | "taffy-hound"
  | "praline-cat"
  | "rimecoat-hound"
  | "bramblewhisk-cat"
  | "sprinklebug"
  | "taffalo";
export type BirdKind = "emberjay" | "canopy-lark" | "tidewing-gull" | "frostquill";
export type AquaticMobKind = "shoalfin" | "coralback" | "brookdart" | "gloomfin" | "silverthread" | "reedneedle" | "emberribbon" | "cavefilament";
export type PollinatorKind = "honeybee" | "hive-queen" | "reed-dragonfly";
export type HearthroadsWildlifeKind = "burrowbell" | "dewback-tapir";
export type HearthroadsAquaticKind = "redfin-salmon" | "blue-mackerel" | "deepwater-shark";
export type TideglassAquaticKind =
  | "tideglass-crab"
  | "reefglide-terrapin"
  | "glassfin"
  | "lanternjaw"
  | "abyss-skater"
  | "dreadcoil"
  | "tidepup"
  | "worldshell-leviathan"
  | "aetherbell-larva"
  | "aetherbell-leviathan";
export type MosslingVariantKind = "boglantern-mossling" | "cindercone-mossling" | "moonbloom-mossling";
export type SugarplumAquaticKind = "syrupfin";
export type DragonKind = "fire-dragon" | "ice-dragon" | "steel-dragon" | "sea-dragon";
export type HobbitKind =
  | "hobbit-mayor"
  | "hobbit-farmer"
  | "hobbit-miner"
  | "hobbit-merchant"
  | "hobbit-banker"
  | "hobbit-hammer-guard"
  | "hobbit-crossbow-guard";
export type GoblinKind =
  | "goblin-chieftain"
  | "goblin-worker"
  | "goblin-miner"
  | "goblin-alchemist"
  | "goblin-spear-guard";
export type AtlantianKind =
  | "atlantian-tidewarden"
  | "atlantian-kelpkeeper"
  | "atlantian-coralwright"
  | "atlantian-pearlbroker"
  | "atlantian-glowmender"
  | "atlantian-trident-guard";
export type SugarcourtKind =
  | "sugarcourt-crown-confectioner"
  | "sugarcourt-brittle-guard"
  | "sugarcourt-gumdrop-gardener"
  | "sugarcourt-sweetbroker"
  | "sugarcourt-kennelkeeper"
  | "sugarcourt-sugarboiler"
  | "sugarcourt-candysmith";
export type WoodElfKind =
  | "wood-elf-elderweaver"
  | "wood-elf-leafwarden"
  | "wood-elf-bow-warden"
  | "wood-elf-grovekeeper"
  | "wood-elf-tomekeeper"
  | "wood-elf-potioner"
  | "wood-elf-moonbroker";
export type DwarfKind =
  | "dwarf-thane"
  | "dwarf-gatewarden"
  | "dwarf-delver"
  | "dwarf-gearwright"
  | "dwarf-golemsmith"
  | "dwarf-powderwright"
  | "dwarf-provisioner";
export type GolemKind = "copper-scout-golem" | "stone-bulwark-golem" | "aetherforged-sentinel" | "deepgear-courser-golem";
export type V1FactionCreatureKind = "glimmerhart" | "runeowl" | "glowfin" | "copper-mole" | GolemKind;
export type SentientMobKind = HobbitKind | GoblinKind | AtlantianKind | SugarcourtKind | WoodElfKind | DwarfKind;
export type FactionKind = "hobbits" | "goblins" | "atlantians" | "sugarcourt" | "wood-elves" | "dwarves";
export type SentientRole = "mayor" | "chieftain" | "farmer" | "worker" | "miner" | "merchant" | "banker" | "alchemist" | "blacksmith" | "guard";
export type SpecialMobKind = "peelop" | "reliquary-sentinel" | "skeleton" | "warg";
export type CoreMobKind =
  | LegacyMobKind
  | MosslingVariantKind
  | SurfaceMobKind
  | BirdKind
  | AquaticMobKind
  | PollinatorKind
  | HearthroadsWildlifeKind
  | HearthroadsAquaticKind
  | TideglassAquaticKind
  | SugarplumAquaticKind
  | DragonKind
  | V1FactionCreatureKind
  | SentientMobKind
  | SpecialMobKind;
export type MobKind = CoreMobKind | ButterflyKind;
export type MobTemperament = "Gentle" | "Skittish" | "Defensive" | "Hostile";
export type MobMovement = "ground" | "flying" | "aquatic" | "amphibious";
export type MobFamily = "surface" | "bird" | "fish" | "pet" | "mount" | "leviathan" | "dragon" | "pollinator" | "construct" | "undead" | "sentient" | "butterfly";

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
  /** Hearthroads faction and profession metadata for sentient NPCs. */
  faction?: FactionKind;
  role?: SentientRole;
  profession?: string;
  tradeSpecialty?: string;
  /** Natural specimens can inherit this faction without making the species sentient. */
  factionAffinity?: FactionKind;
  /** Faction-aligned instances must be unaligned before the normal tame path applies. */
  tameRequiresUnaligned?: boolean;
  rideable?: boolean;
  /** Cultural identity used before a culture is wired into diplomacy proper. */
  culture?: "atlantians" | "sugarcourt" | "wood-elves" | "dwarves";
  /** Save-friendly ecology flags consumed by the ocean lifecycle helpers. */
  laysEggs?: boolean;
  aquaticYoungOnly?: boolean;
  airSeaMorph?: boolean;
  cargoChestLimit?: number;
  /** Restricts an aquatic species to a specific liquid rather than ordinary water. */
  liquidHabitat?: "water" | "syrup";
  /** Lifecycle discriminator; detailed stage/sex/equipment state lives in dragons.ts. */
  dragonType?: "fire" | "ice" | "steel" | "sea";
};

type V1SentientSeed = Readonly<{
  kind: WoodElfKind | DwarfKind;
  name: string;
  faction: "wood-elves" | "dwarves";
  role: SentientRole;
  profession: string;
  specialty: string;
  behavior: string;
  lore: string;
  ranged?: boolean;
  guard?: boolean;
}>;

function v1Sentient(seed: V1SentientSeed): MobDefinition {
  const elf = seed.faction === "wood-elves";
  const guard = seed.guard === true;
  return {
    kind: seed.kind,
    name: seed.name,
    temperament: "Defensive",
    hostile: false,
    health: guard ? (elf ? 22 : 28) : elf ? 15 : 20,
    damage: guard ? (seed.ranged ? 9 : 7) : seed.ranged ? 5 : 3,
    xp: guard ? 15 : 9,
    speed: elf ? 0.84 : 0.64,
    chaseSpeed: guard ? (elf ? 3.5 : 2.8) : 2.45,
    turnRate: elf ? 6.5 : 4.8,
    attackRange: seed.ranged ? (elf ? 22 : 19) : 1.2,
    footOffset: elf ? 0.88 : 0.72,
    radius: elf ? 0.42 : 0.5,
    height: elf ? 1.78 : 1.35,
    habitat: elf ? "Glimmerwood Moonbough Enclaves" : "Underground Deepgear Holds beneath the Snowcap Range",
    active: guard ? "All hours" : "Day and shift change",
    behavior: seed.behavior,
    lore: seed.lore,
    colors: elf ? [0x315748, 0x84d5a9, 0xe9fff3] : [0x4c5458, 0xb47c4b, 0xf2d17f],
    drops: [],
    family: "sentient",
    movement: "ground",
    persistent: true,
    ranged: seed.ranged,
    sentient: true,
    faction: seed.faction,
    culture: seed.faction,
    role: seed.role,
    profession: seed.profession,
    tradeSpecialty: seed.specialty,
    discoveryHint: elf ? "Follow the bioluminescent paths of a Moonbough Enclave." : "Follow high-brightness lanterns into a guarded Snowcap tunnel.",
  };
}

const V1_SENTIENT_MOBS = Object.fromEntries(([
  { kind: "wood-elf-elderweaver", name: "Wood Elf Elderweaver", faction: "wood-elves", role: "mayor", profession: "Elderweaver", specialty: "Enclave authority, rare tomes and quests", behavior: "Mediates living-magic oaths and raises a leaf ward when the enclave is threatened.", lore: "An Elderweaver is chosen by consensus and by whether the oldest Moonbough accepts their touch.", ranged: true },
  { kind: "wood-elf-leafwarden", name: "Wood Elf Leafwarden", faction: "wood-elves", role: "guard", profession: "Leafwarden", specialty: "Moonbough staves and settlement defense", behavior: "Aims a staff with both hands and fires a three-leaf Verdant Volley only after identifying a threat.", lore: "Their leaves are never sharpened until the moment the spell is released.", ranged: true, guard: true },
  { kind: "wood-elf-bow-warden", name: "Wood Elf Bow-Warden", faction: "wood-elves", role: "guard", profession: "Bow-Warden", specialty: "Glimmerbows, arrows and patterns", behavior: "Raises both arms into a clean Glimmerbow stance and checks the line beyond every target.", lore: "A bow-warden learns the sound of every gate before the range of a bow.", ranged: true, guard: true },
  { kind: "wood-elf-grovekeeper", name: "Wood Elf Grovekeeper", faction: "wood-elves", role: "farmer", profession: "Grovekeeper", specialty: "Glowing flora and neutral companion orbs", behavior: "Tends luminous plants, Glimmerharts, and moonwell pond edges without extinguishing their light.", lore: "Grovekeepers count successful nights, not harvests." },
  { kind: "wood-elf-tomekeeper", name: "Wood Elf Tomekeeper", faction: "wood-elves", role: "alchemist", profession: "Tomekeeper", specialty: "Reusable spell tomes and Runeowl orbs", behavior: "Curates reusable tomes and uses Starlight Snare to hold danger away from the shelves.", lore: "Every returned tome is welcomed as though it had traveled alone.", ranged: true },
  { kind: "wood-elf-potioner", name: "Wood Elf Potioner", faction: "wood-elves", role: "alchemist", profession: "Moonwell Potioner", specialty: "Moonstep, Verdant Renewal and formulas", behavior: "Brews small moonwell batches and records which plants were gathered rather than cut.", lore: "Moonwell glass is washed in starlight before it touches water." },
  { kind: "wood-elf-moonbroker", name: "Wood Elf Moonbroker", faction: "wood-elves", role: "merchant", profession: "Moonbroker", specialty: "General Glimmerwood goods", behavior: "Trades flora and crafted goods while keeping rare living materials out of careless hands.", lore: "A fair price leaves enough wonder to invite a return journey." },
  { kind: "dwarf-thane", name: "Deepgear Thane", faction: "dwarves", role: "mayor", profession: "Thane", specialty: "Hold authority and master golem blueprints", behavior: "Keeps the hold's oaths, authorizes master blueprints, and joins the entrance defense if needed.", lore: "A thane's chain carries one gear from every public machine completed during their term." },
  { kind: "dwarf-gatewarden", name: "Deepgear Gatewarden", faction: "dwarves", role: "guard", profession: "Gatewarden", specialty: "Hold defense, flintlocks and ammunition", behavior: "Guards the surface ramp in pairs, aiming a hammer or flintlock beyond the entrance before firing.", lore: "Gatewardens polish the entrance lantern before their armor.", ranged: true, guard: true },
  { kind: "dwarf-delver", name: "Deepgear Delver", faction: "dwarves", role: "miner", profession: "Delver", specialty: "Ore, stone and mining supplies", behavior: "Samples stone, braces active galleries, and returns when the brass shift-bell sounds.", lore: "A delver carries chalk in three colors: safe, ask, and absolutely not." },
  { kind: "dwarf-gearwright", name: "Deepgear Gearwright", faction: "dwarves", role: "worker", profession: "Gearwright", specialty: "Deepgear blocks, lanterns and alloys", behavior: "Maintains lanterns, furniture, and civic machinery with a balanced gear-hammer.", lore: "No gear is too small to receive a maker's stamp." },
  { kind: "dwarf-golemsmith", name: "Deepgear Golemsmith", faction: "dwarves", role: "worker", profession: "Golemsmith", specialty: "Golem blueprints, ready Copper Scouts and forge work", behavior: "Builds blueprint-gated constructs and commits mana only during final animation.", lore: "Golemsmiths speak to unfinished frames because silence makes careless work feel acceptable." },
  { kind: "dwarf-powderwright", name: "Deepgear Powderwright", faction: "dwarves", role: "blacksmith", profession: "Powderwright", specialty: "Flintlocks, ammunition and blueprints", behavior: "Mixes sealed charges and demonstrates flintlocks only on the stone range behind the workshop.", lore: "Powderwright eyebrows are a subject one does not raise at dinner.", ranged: true },
  { kind: "dwarf-provisioner", name: "Deepgear Provisioner", faction: "dwarves", role: "merchant", profession: "Provisioner", specialty: "General hold goods and Copper Mole orbs", behavior: "Restocks ore, food, lantern parts, and neutral companion orbs from shared stores.", lore: "Provisioners estimate a tunnel crew's tea consumption from the sound of their boots." },
] as const satisfies readonly V1SentientSeed[]).map((seed) => [seed.kind, v1Sentient(seed)])) as Record<WoodElfKind | DwarfKind, MobDefinition>;

const V1_CREATURE_MOBS: Record<V1FactionCreatureKind, MobDefinition> = {
  glimmerhart: {
    kind: "glimmerhart", name: "Glimmerhart", temperament: "Defensive", hostile: false,
    health: 24, damage: 5, xp: 9, speed: 1.25, chaseSpeed: 3.5, turnRate: 5.6, attackRange: 12,
    footOffset: 1.03, radius: 0.72, height: 1.58, habitat: "Glimmerwood clearings and Moonbough Enclaves", active: "Dusk and night",
    behavior: "Moves in quiet pairs. When an ally is threatened, its antlers launch a spiraling volley of luminous leaves before it retreats.",
    lore: "Moonbough songs call each antler tine a promise the forest chose to remember.", colors: [0x3e705f, 0x8bf0c6, 0xe8fff2],
    drops: [{ item: Item.StarfernFrond, min: 1, max: 2, chance: 0.5 }], family: "pet", movement: "ground", persistent: true, ranged: true,
    sentient: false, factionAffinity: "wood-elves", tameRequiresUnaligned: true, tameable: true, tameItems: [Item.Moonpetal], breedable: true,
    breedingFoods: [Item.Moonpetal], diet: [Item.Moonpetal, Item.StarfernFrond],
    postTameNotes: "A bonded Glimmerhart defends its keeper with Verdant Volley, but stays inside its follower formation.",
    discoveryHint: "Watch for mint-green antler light between Glimmerwood trunks after sunset.",
  },
  runeowl: {
    kind: "runeowl", name: "Runeowl", temperament: "Skittish", hostile: false,
    health: 10, damage: 2, xp: 6, speed: 1.7, chaseSpeed: 4.4, turnRate: 8.2, attackRange: 9,
    footOffset: 1.3, radius: 0.42, height: 0.7, habitat: "Moonbough libraries and Glimmerwood branches", active: "Night",
    behavior: "Perches near books and rune-carved bark, then releases a soft starlight pulse when danger approaches.",
    lore: "A Runeowl never tears a page. Tomekeepers consider that sufficient evidence of wisdom.", colors: [0x5a5d88, 0xb5adff, 0xf8f1a8],
    drops: [{ item: Item.Feather, min: 1, max: 2, chance: 0.68 }], family: "bird", movement: "flying", flying: true, persistent: true,
    sentient: false, factionAffinity: "wood-elves", tameRequiresUnaligned: true, tameable: true, tameItems: [Item.Dreamcap], breedable: true,
    breedingFoods: [Item.Dreamcap], diet: [Item.Dreamcap, Item.Berry], discoveryHint: "Listen for three low notes near Glimmerwood libraries after dark.",
  },
  glowfin: {
    kind: "glowfin", name: "Glowfin", temperament: "Gentle", hostile: false,
    health: 4, damage: 0, xp: 2, speed: 1.38, chaseSpeed: 2.2, turnRate: 8, attackRange: 0,
    footOffset: 0.55, radius: 0.3, height: 0.28, habitat: "Glimmerwood moonwells and ponds", active: "All hours",
    behavior: "Forms small rings around Lumenreeds and pulses brighter when another Glowfin joins its shoal.",
    lore: "Enclaves read their shifting rings as a gentle forecast of tomorrow's rain.", colors: [0x3a8291, 0x77f2dc, 0xeaffff],
    drops: [{ item: Item.RawFish, min: 1, max: 1, chance: 0.72 }], family: "fish", movement: "aquatic", aquatic: true, sentient: false,
    discoveryHint: "Look into the luminous ponds of the Glimmerwood.",
  },
  "copper-mole": {
    kind: "copper-mole", name: "Copper Mole", temperament: "Gentle", hostile: false,
    health: 15, damage: 2, xp: 5, speed: 0.72, chaseSpeed: 2.25, turnRate: 5, attackRange: 1.1,
    footOffset: 0.625744, radius: 0.52, height: 0.62, habitat: "Snowcap Range tunnels and Deepgear Holds", active: "All hours underground",
    behavior: "Sniffs out exposed ore, sleeps beside warm machinery, and digs short harmless furrows when excited.",
    lore: "Its copper-colored guard hairs are keratin, though no Deepgear child accepts that explanation.", colors: [0x7a533d, 0xc17d4f, 0xf3c879],
    drops: [{ item: Item.Flint, min: 1, max: 2, chance: 0.55 }], family: "pet", movement: "ground", persistent: true, sentient: false,
    factionAffinity: "dwarves", tameRequiresUnaligned: true, tameable: true, tameItems: [Item.RawGold], breedable: true,
    breedingFoods: [Item.Wheat], diet: [Item.Wheat, Item.RawGold], postTameNotes: "Chirps when a valuable ore block is exposed nearby.",
    discoveryHint: "Follow tiny fan-shaped tracks around Snowcap cave mouths.",
  },
  "copper-scout-golem": {
    kind: "copper-scout-golem", name: "Copper Scout Golem", temperament: "Defensive", hostile: false,
    health: 34, damage: 4, xp: 12, speed: 1.15, chaseSpeed: 3.1, turnRate: 7, attackRange: 1.3,
    footOffset: 1.08, radius: 0.52, height: 1.05, habitat: "Deepgear entrances and Golem Forges", active: "While its aether key is charged",
    behavior: "Patrols short circuits, marks hazards with a bright eye-lamp, and returns to its assigned forge when damaged.",
    lore: "Every scout's first step is witnessed by its golemsmith.", colors: [0xa96943, 0xd09a55, 0x8ff7ed],
    drops: [{ item: Item.GearCluster, min: 1, max: 2, chance: 0.78 }], family: "construct", movement: "ground", persistent: true,
    sentient: false, factionAffinity: "dwarves", tameRequiresUnaligned: true, tameable: false,
    discoveryHint: "Look beside the high-brightness lanterns at a Deepgear entrance.",
  },
  "stone-bulwark-golem": {
    kind: "stone-bulwark-golem", name: "Stone Bulwark Golem", temperament: "Defensive", hostile: false,
    health: 92, damage: 9, xp: 24, speed: 0.48, chaseSpeed: 1.8, turnRate: 3.2, attackRange: 1.8,
    footOffset: 1.312, radius: 0.9, height: 1.75, habitat: "Deepgear defensive galleries", active: "While its aether key is charged",
    behavior: "Locks broad feet against the floor, shields nearby allies, and answers threats with a piston-driven hammer blow.",
    lore: "Bulwarks have hollow chests so a hold's alarm bell can ring through them.", colors: [0x62696a, 0xaa7f4b, 0x84e6e7],
    drops: [{ item: Item.GearCluster, min: 2, max: 4, chance: 1 }], family: "construct", movement: "ground", persistent: true,
    sentient: false, factionAffinity: "dwarves", tameRequiresUnaligned: true, tameable: false,
    discoveryHint: "Deepgear guards station these constructs inside their first defensive gallery.",
  },
  "aetherforged-sentinel": {
    kind: "aetherforged-sentinel", name: "Aetherforged Sentinel", temperament: "Defensive", hostile: false,
    health: 168, damage: 16, xp: 48, speed: 0.7, chaseSpeed: 2.25, turnRate: 4.2, attackRange: 8,
    footOffset: 1.515, radius: 1.05, height: 2.25, habitat: "Master Deepgear Golem Forges", active: "While its mana core remains attuned",
    behavior: "Alternates crushing strikes with a focused aether pulse and places itself between its keeper and danger.",
    lore: "A completed Sentinel is a public promise that the hold intends to endure.", colors: [0x48565b, 0xb98c50, 0x76f4ef],
    drops: [{ item: Item.DeepgearAlloy, min: 3, max: 6, chance: 1 }], family: "construct", movement: "ground", ranged: true, persistent: true,
    sentient: false, factionAffinity: "dwarves", tameRequiresUnaligned: true, tameable: false,
    discoveryHint: "Only master Golem Forges can finalize this mana-hungry construct.",
  },
  "deepgear-courser-golem": {
    kind: "deepgear-courser-golem", name: "Deepgear Courser", temperament: "Defensive", hostile: false,
    health: 58, damage: 6, xp: 18, speed: 1.12, chaseSpeed: 4.35, turnRate: 5.1, attackRange: 1.35,
    footOffset: 1.05, radius: 0.68, height: 1.82, habitat: "Deepgear stables and Golem Forges", active: "While its aether flywheel is charged",
    behavior: "Carries a rider over steep hold roads, braces on piston legs when threatened, and returns to the nearest forge for repairs.",
    lore: "Deepgear Coursers were built after ordinary packhorses objected, correctly, to freight lifts and powderworks bells.",
    colors: [0x9a6a3d, 0x566268, 0x7df1eb], drops: [{ item: Item.GearCluster, min: 2, max: 4, chance: 1 }],
    family: "construct", movement: "ground", persistent: true, sentient: false, factionAffinity: "dwarves", tameRequiresUnaligned: true,
    tameable: true, tameItems: [Item.DeepgearAlloy, Item.GearCluster], diet: [Item.DeepgearAlloy, Item.GearCluster], rideable: true,
    utility: "A durable mechanical land mount assembled at a Golem Forge or purchased unaligned from a Deepgear Golemsmith.",
    postTameNotes: "Fit a Trail Saddle after attuning its aether key. Deepgear Alloy repairs three hearts.",
    discoveryHint: "Listen for paired piston strokes near a Deepgear Golem Forge.",
  },
};

export const MOB_DEFS: Record<MobKind, MobDefinition> = {
  ...V1_SENTIENT_MOBS,
  ...V1_CREATURE_MOBS,
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
  "boglantern-mossling": {
    kind: "boglantern-mossling", name: "Boglantern Mossling", temperament: "Skittish", hostile: false,
    health: 6, damage: 0, xp: 3, speed: 0.56, chaseSpeed: 1.72, turnRate: 7.2, attackRange: 0,
    footOffset: 0.84, radius: 0.4, height: 0.76, habitat: "Siltfen pools, Mushroom Fen hummocks and Rainveil seep gardens", active: "Rain, dusk and humid daylight",
    behavior: "Wades on splayed roots, freezes until its lantern cap resembles a fen fungus, then splashes into dense reeds.",
    lore: "Its hollow cap keeps one firefly-bright spore alive through every flood, relighting the hummock when the water falls.",
    colors: [0x365c49, 0x8fbf63, 0xe8ff8a],
    drops: [{ item: Item.Fiber, min: 1, max: 2, chance: 0.86 }, { item: Item.GlowDust, min: 1, max: 1, chance: 0.18 }],
    family: "surface", movement: "ground", sentient: false, breedable: true, breedingFoods: [Item.Berry], diet: [Item.Berry, Item.Wheat],
    utility: "Its cap glows softly before rain.", discoveryHint: "Look for a low green lantern walking between Siltfen reed roots.",
  },
  "cindercone-mossling": {
    kind: "cindercone-mossling", name: "Cindercone Mossling", temperament: "Skittish", hostile: false,
    health: 8, damage: 1, xp: 4, speed: 0.48, chaseSpeed: 1.95, turnRate: 6.4, attackRange: 0.7,
    footOffset: 0.82, radius: 0.38, height: 0.8, habitat: "Painted Badlands washes and the shaded feet of desert mesas", active: "Dawn, dusk and after rain",
    behavior: "Locks its overlapping cone scales during heat, unroots after rare rain, and scatters ember-red seeds while fleeing.",
    lore: "A Cindercone can wait a decade for one storm, then cross an entire wash before the ground dries.",
    colors: [0x594236, 0xc36a3d, 0xffc15b],
    drops: [{ item: Item.Fiber, min: 1, max: 2, chance: 0.7 }, { item: Item.Coal, min: 1, max: 1, chance: 0.22 }],
    family: "surface", movement: "ground", sentient: false, breedable: true, breedingFoods: [Item.Sunroot], diet: [Item.Sunroot, Item.Wheat],
    utility: "Scattered seeds briefly mark recent rain paths through badland washes.", discoveryHint: "Check shaded mesa feet after rain for walking pinecone silhouettes.",
  },
  "moonbloom-mossling": {
    kind: "moonbloom-mossling", name: "Moonbloom Mossling", temperament: "Gentle", hostile: false,
    health: 5, damage: 0, xp: 4, speed: 0.62, chaseSpeed: 1.78, turnRate: 7.8, attackRange: 0,
    footOffset: 1, radius: 0.36, height: 1.02, habitat: "Glimmerwood Moonpetal rings and Starfern clearings", active: "Dusk and moonlit night",
    behavior: "Walks on three fine root stilts, opens its translucent flower crown to moonlight, and folds into a bud when startled.",
    lore: "Wood-elves say each Moonbloom carries a map of the last clear sky it saw, written in pale veins across its petals.",
    colors: [0x314d58, 0x8b83d8, 0xd8fff0],
    drops: [{ item: Item.Fiber, min: 1, max: 2, chance: 0.72 }, { item: Item.GlowDust, min: 1, max: 1, chance: 0.28 }],
    family: "surface", movement: "ground", sentient: false, breedable: true, breedingFoods: [Item.Moonpetal], diet: [Item.Moonpetal, Item.StarfernFrond],
    utility: "Its open crown indicates unobstructed moonlight.", discoveryHint: "Wait beside Moonpetals until a closed bud rises onto three roots.",
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
  "emberbrush-fox": {
    kind: "emberbrush-fox", name: "Emberbrush Fox", temperament: "Skittish", hostile: false,
    health: 7, damage: 1, xp: 4, speed: 0.94, chaseSpeed: 3.35, turnRate: 8.4, attackRange: 0.72,
    footOffset: 0.92, radius: 0.38, height: 0.74, habitat: "Sunstep grass, Painted Badlands washes and desert scrub", active: "Dawn and late afternoon",
    behavior: "Listens for burrowers with enormous heat-shedding ears, vaults high over scrub, and shades its face beneath a split brush tail.",
    lore: "Its black tail forks frame a red center like banked coals. Caravans take a distant flash as a promise of firm ground.",
    colors: [0xc45a31, 0xf0ad55, 0x231b1c], drops: [{ item: Item.Fiber, min: 1, max: 1, chance: 0.28 }],
    family: "surface", movement: "ground", sentient: false, breedable: true, breedingFoods: [Item.Sunroot], diet: [Item.Sunroot, Item.Berry],
    utility: "Often pauses above burrows and other disturbed ground.", discoveryHint: "Watch shaded badland washes for two tall ears and a forked ember tail.",
  },
  "moonpetal-fox": {
    kind: "moonpetal-fox", name: "Moonpetal Fox", temperament: "Gentle", hostile: false,
    health: 8, damage: 1, xp: 5, speed: 0.74, chaseSpeed: 2.75, turnRate: 8.8, attackRange: 0.72,
    footOffset: 0.95, radius: 0.42, height: 0.8, habitat: "Glimmerwood moonwells and luminous fern terraces", active: "Dusk and moonlit night",
    behavior: "Steps quietly between glowing plants, fans two petal tails when curious, and disappears by folding both tails around its body.",
    lore: "The pale eyes on its tails are not eyes, but they always seem to face the safest path home.",
    colors: [0x46536f, 0xa68cda, 0xd9fff2], drops: [{ item: Item.Fiber, min: 1, max: 2, chance: 0.32 }, { item: Item.GlowDust, min: 1, max: 1, chance: 0.12 }],
    family: "surface", movement: "ground", sentient: false, breedable: true, breedingFoods: [Item.Moonpetal], diet: [Item.Moonpetal, Item.StarfernFrond, Item.Berry],
    utility: "Its tail eyes turn toward nearby Moonpetals and Starferns.", discoveryHint: "Look for paired crescent tails crossing Glimmerwood moonwell paths.",
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
  "frostlace-hart": {
    kind: "frostlace-hart", name: "Frostlace Hart", temperament: "Skittish", hostile: false,
    health: 11, damage: 1, xp: 5, speed: 0.76, chaseSpeed: 3.2, turnRate: 6.2, attackRange: 0.9,
    footOffset: 1.25, radius: 0.47, height: 1.46, habitat: "Frostpine openings, Snowfields and high Snowcap passes", active: "Clear winter morning and snowfall",
    behavior: "Crosses powder on broad split snowshoes, combs ice from low branches with crystal antlers, and bounds downhill when alarmed.",
    lore: "Every tine begins as frozen breath caught in winter velvet. The rack melts harmlessly when spring reaches the passes.",
    colors: [0xc5d2d4, 0x7896a3, 0xeaffff], drops: [{ item: Item.Hide, min: 1, max: 2, chance: 0.52 }, { item: Item.CrystalShard, min: 1, max: 1, chance: 0.1 }],
    family: "surface", movement: "ground", sentient: false, breedable: true, breedingFoods: [Item.Apple], diet: [Item.Apple, Item.Wheat],
    utility: "Its broad trail marks snow that can support a traveler.", discoveryHint: "Follow paired snowshoe tracks between Frostpine openings.",
  },
  "reedcrown-deer": {
    kind: "reedcrown-deer", name: "Reedcrown Deer", temperament: "Skittish", hostile: false,
    health: 9, damage: 0, xp: 4, speed: 0.68, chaseSpeed: 2.85, turnRate: 7.3, attackRange: 0,
    footOffset: 1.15, radius: 0.45, height: 1.34, habitat: "Siltfen reed islands, Rainveil floodplains and slow river margins", active: "Rain, dawn and overcast daylight",
    behavior: "Places splayed hooves across soft mud, lowers its reed rack beneath branches, and vanishes sideways through watergrass.",
    lore: "Mud and seed build a living crown around its antlers. A mature herd carries one wetland into the next.",
    colors: [0x586b4c, 0xa58d58, 0xe6ed9a], drops: [{ item: Item.Hide, min: 1, max: 1, chance: 0.46 }, { item: Item.Fiber, min: 1, max: 2, chance: 0.56 }],
    family: "surface", movement: "ground", sentient: false, breedable: true, breedingFoods: [Item.Berry], diet: [Item.Berry, Item.Wheat],
    utility: "Carries reed and marsh-flower seed between floodplains.", discoveryHint: "Search reed islands for splayed tracks that never sink deeply into mud.",
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
    rideable: true, postTameNotes: "Build trust with fish, then fit a Trail Saddle. Its long stride is steady on land and exceptionally quick through shallows.",
    secretHint: "Glow Scales build trust much faster than ordinary fish.",
    discoveryHint: "Follow resonant dawn calls across foggy wetlands.",
  },
  "wild-horse": {
    kind: "wild-horse", name: "Wildwood Courser", temperament: "Skittish", hostile: false,
    health: 14, damage: 1, xp: 5, speed: 1.05, chaseSpeed: 4.5, turnRate: 5.2, attackRange: 1.2,
    footOffset: 1.05, radius: 0.62, height: 1.75, habitat: "Open meadows, forest roads and upland glens", active: "Day",
    behavior: "Travels in small family bands, circles foals when threatened, and bolts into open terrain rather than trees.",
    lore: "Wildwood Coursers remember old roads long after roots and flowers have hidden them.",
    colors: [0x8b5b3d, 0xd6b17b, 0xffe69a], drops: [{ item: Item.Hide, min: 1, max: 3, chance: 0.78 }],
    family: "mount", movement: "ground", persistent: true, utility: "A fast land mount after patient feeding and fitting a Trail Saddle.",
    sentient: false, tameable: true, tameItems: [Item.Apple, Item.Wheat], breedable: true, rideable: true,
    breedingFoods: [Item.Apple], diet: [Item.Apple, Item.Wheat], captureItem: Item.CaptureOrb,
    postTameNotes: "A saddled Courser carries one rider and prefers clear ground.",
    discoveryHint: "Look for hoofprints along broad meadow edges and old forest roads.",
  },
  "rimehoof-courser": {
    kind: "rimehoof-courser", name: "Rimehoof Courser", temperament: "Skittish", hostile: false,
    health: 17, damage: 2, xp: 7, speed: 0.94, chaseSpeed: 4.15, turnRate: 4.8, attackRange: 1.25,
    footOffset: 1.05, radius: 0.68, height: 1.72, habitat: "Frostpine taiga, whispering snowfields and Snowcap passes", active: "Day and snowfall",
    behavior: "Breaks crusted snow with broad hooves, shelters foals behind its shaggy shoulder, and follows wind-scoured ridgelines.",
    lore: "Ice gathers on its mane without melting, then falls away in silver sheets when the herd begins to run.",
    colors: [0x9dabb2, 0xe7eee8, 0xa8f5ff], drops: [{ item: Item.Hide, min: 1, max: 3, chance: 0.78 }],
    family: "mount", movement: "ground", persistent: true, utility: "A sure-footed cold-country mount with strong snowfield speed.",
    sentient: false, tameable: true, tameItems: [Item.Apple, Item.Wheat], breedable: true, rideable: true,
    breedingFoods: [Item.Apple], diet: [Item.Apple, Item.Wheat], captureItem: Item.CaptureOrb,
    postTameNotes: "Its broad hooves keep a steady pace across snow and steep stone.", discoveryHint: "Look for wide blue-gray hoofprints where Frostpine opens into snow.",
  },
  "sunscar-courser": {
    kind: "sunscar-courser", name: "Sunscar Courser", temperament: "Skittish", hostile: false,
    health: 13, damage: 1, xp: 6, speed: 1.18, chaseSpeed: 4.8, turnRate: 5.8, attackRange: 1.15,
    footOffset: 1.05, radius: 0.58, height: 1.78, habitat: "Sunglass dunes and Painted Badlands washes", active: "Dawn and late afternoon",
    behavior: "Travels between shaded cuts, lowers its narrow profile into sandstorms, and sprints in short explosive arcs.",
    lore: "The dark line beneath each eye is said to be the first road the sun ever burned into the desert.",
    colors: [0xb96832, 0xe8bd72, 0x241b18], drops: [{ item: Item.Hide, min: 1, max: 2, chance: 0.7 }],
    family: "mount", movement: "ground", persistent: true, utility: "The fastest Courser on dry open ground, though a poor swimmer.",
    sentient: false, tameable: true, tameItems: [Item.Sunroot, Item.Wheat], breedable: true, rideable: true,
    breedingFoods: [Item.Sunroot], diet: [Item.Sunroot, Item.Wheat], captureItem: Item.CaptureOrb,
    postTameNotes: "It accelerates quickly on open dry ground and dislikes deep water.", discoveryHint: "Search cool badlands washes at dawn for a cropped black mane.",
  },
  "mirestride-courser": {
    kind: "mirestride-courser", name: "Mirestride Courser", temperament: "Defensive", hostile: false,
    health: 16, damage: 2, xp: 7, speed: 0.82, chaseSpeed: 3.65, turnRate: 5.4, attackRange: 1.25,
    footOffset: 1.05, radius: 0.7, height: 1.66, habitat: "Siltfen reed islands and flooded forest margins", active: "Overcast day and rain",
    behavior: "Tests mud before every step, spreads broad hooves over soft silt, and drives marsh predators away from young.",
    lore: "Reedcutters follow its paths because a Mirestride never commits its full weight to false ground.",
    colors: [0x516b59, 0x9b8358, 0xd6ef89], drops: [{ item: Item.Hide, min: 1, max: 2, chance: 0.72 }],
    family: "mount", movement: "ground", persistent: true, utility: "A stable marsh mount with unusually good shallow-water pace.",
    sentient: false, tameable: true, tameItems: [Item.Berry, Item.Wheat], breedable: true, rideable: true,
    breedingFoods: [Item.Berry], diet: [Item.Berry, Item.Wheat], captureItem: Item.CaptureOrb,
    postTameNotes: "Its splayed hooves cross mud and shallows more safely than other Coursers.", discoveryHint: "Watch reed islands during rain for a low moss-colored mane.",
  },
  "starbough-courser": {
    kind: "starbough-courser", name: "Starbough Courser", temperament: "Gentle", hostile: false,
    health: 15, damage: 2, xp: 8, speed: 1.08, chaseSpeed: 4.45, turnRate: 6.2, attackRange: 1.2,
    footOffset: 1.05, radius: 0.6, height: 1.86, habitat: "Moonlit Glimmerwood clearings", active: "Dusk and night",
    behavior: "Moves in quiet pairs, brushes its small branch antlers through Starferns, and freezes when moonwell bells ring.",
    lore: "Each pale point along its flank appears only after the Courser has found a safe path home in darkness.",
    colors: [0x344c58, 0x80cbb4, 0xdcfff1], drops: [{ item: Item.StarfernFrond, min: 1, max: 2, chance: 0.45 }],
    family: "mount", movement: "ground", persistent: true, utility: "A nimble nocturnal mount whose markings remain visible without casting strong light.",
    sentient: false, tameable: true, tameItems: [Item.Moonpetal, Item.Apple], breedable: true, rideable: true,
    breedingFoods: [Item.Moonpetal], diet: [Item.Moonpetal, Item.StarfernFrond, Item.Apple], captureItem: Item.CaptureOrb,
    postTameNotes: "Its pale markings make the rider easier to follow on dark forest paths.", discoveryHint: "Wait beside Starferns after dusk and watch for paired antler lights.",
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
  "sunbloom-longhorn": {
    kind: "sunbloom-longhorn", name: "Sunbloom Longhorn", temperament: "Gentle", hostile: false,
    health: 16, damage: 2, xp: 5, speed: 0.43, chaseSpeed: 2.05, turnRate: 3.5, attackRange: 1.35,
    footOffset: 1, radius: 0.76, height: 1.48, habitat: "Sunstep savanna waterholes and Painted Badlands grass washes", active: "Morning and late afternoon",
    behavior: "Grazes in heat-spaced herds, turns its broad horns toward predators, and kneels beneath sparse shade at midday.",
    lore: "Sunflowers root in the dust caught between its shoulders. A herd in bloom can be seen moving across the plain from miles away.",
    colors: [0xa65f32, 0xe2b85e, 0x312018], drops: [{ item: Item.RawMeat, min: 1, max: 3, chance: 1 }, { item: Item.Hide, min: 1, max: 3, chance: 0.76 }],
    family: "surface", movement: "ground", utility: "A hardy dry-country milk and hide animal.",
    sentient: false, breedable: true, breedingFoods: [Item.Wheat], diet: [Item.Wheat, Item.Sunroot], captureItem: Item.CaptureOrb,
    discoveryHint: "Look for sunflower-yellow backs gathering around savanna waterholes.",
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
  frostquill: {
    kind: "frostquill", name: "Frostquill", temperament: "Skittish", hostile: false,
    health: 4, damage: 0, xp: 2, speed: 1.05, chaseSpeed: 3.9, turnRate: 8.8, attackRange: 0,
    footOffset: 1.12, radius: 0.29, height: 0.46, habitat: "Frostpine boughs, Snowfields and Snowcap ledges", active: "Day and light snowfall",
    behavior: "Scratches through powder in small coveys, freezes beneath passing shadows, and erupts into a white wingbeat when startled.",
    lore: "Its layered winter plumage scatters the blue of deep snow. Climbers follow fresh Frostquill tracks toward sheltered passes.",
    colors: [0xe8f1ee, 0x8eb6c7, 0x202b3a], drops: [{ item: Item.Feather, min: 1, max: 2, chance: 1 }],
    family: "bird", movement: "flying", flying: true, breedable: true, breedingFoods: [Item.Wheat], diet: [Item.Wheat, Item.Berry],
    utility: "Coveys favor sheltered snowy routes and make reliable weather signs.", discoveryHint: "Watch for tiny three-toed tracks crossing fresh snow below conifers.",
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
  "hobbit-mayor": {
    kind: "hobbit-mayor", name: "Hobbit Hearthwarden", temperament: "Gentle", hostile: false,
    health: 16, damage: 2, xp: 0, speed: 0.58, chaseSpeed: 1.8, turnRate: 6.2, attackRange: 1.3,
    footOffset: 0.7604, radius: 0.34, height: 1.32, habitat: "Hobbit settlement hearth-halls", active: "Day; appoints a successor at eight in the morning",
    behavior: "Keeps near the settlement hall, hears claims and contracts, and flees toward guards when badly hurt.",
    lore: "A Hearthwarden carries the town ledger and the names of every family who helped raise its walls.",
    colors: [0x7a4667, 0xd1a86f, 0x2d211b], drops: [], family: "sentient", movement: "ground", persistent: true,
    sentient: true, faction: "hobbits", role: "mayor", profession: "Hearthwarden", tradeSpecialty: "Town charters, civic work and trusted hires",
    utility: "Settlement leader for claims, hiring and high-trust civic quests.", discoveryHint: "A tall round-doored hearth-hall marks the center of a Hobbit settlement.",
  },
  "hobbit-farmer": {
    kind: "hobbit-farmer", name: "Hobbit Tiller", temperament: "Gentle", hostile: false,
    health: 11, damage: 1, xp: 0, speed: 0.56, chaseSpeed: 1.72, turnRate: 6, attackRange: 1.2,
    footOffset: 0.7604, radius: 0.33, height: 1.28, habitat: "Hobbit field terraces and orchards", active: "Dawn through dusk",
    behavior: "Tends nearby crops, carries produce between fields and stores, visits neighbors, and sleeps after sunset.",
    lore: "Tiller aprons collect seeds, flour, gossip, and at least one stone that looked useful at the time.",
    colors: [0x6d8b49, 0xd5b56d, 0x302116], drops: [], family: "sentient", movement: "ground", persistent: true,
    sentient: true, faction: "hobbits", role: "farmer", profession: "Tiller", tradeSpecialty: "Crops, seeds, fruit and seasonal food",
    utility: "Buys farm goods eagerly and offers harvest-side work.", discoveryHint: "Look for fenced terraces and broad round-roofed barns.",
  },
  "hobbit-miner": {
    kind: "hobbit-miner", name: "Hobbit Delver", temperament: "Defensive", hostile: false,
    health: 13, damage: 2, xp: 0, speed: 0.54, chaseSpeed: 1.7, turnRate: 5.8, attackRange: 1.25,
    footOffset: 0.7604, radius: 0.34, height: 1.3, habitat: "Hobbit quarries, cellars and stone yards", active: "Day",
    behavior: "Moves ore and stone between the mine shed and workshops, sheltering near guards when monsters approach.",
    lore: "Delvers tap every beam twice: once for safety, and once so the mountain knows they asked politely.",
    colors: [0x66737d, 0xc99a55, 0x2b2119], drops: [], family: "sentient", movement: "ground", persistent: true,
    sentient: true, faction: "hobbits", role: "miner", profession: "Delver", tradeSpecialty: "Stone, coal, ore and mining supplies",
    utility: "Trades raw materials and posts quarry contracts.", discoveryHint: "Stone yards and timber-braced cellar mouths sit near upland Hobbit towns.",
  },
  "hobbit-merchant": {
    kind: "hobbit-merchant", name: "Hobbit Provisioner", temperament: "Gentle", hostile: false,
    health: 11, damage: 1, xp: 0, speed: 0.55, chaseSpeed: 1.7, turnRate: 6.2, attackRange: 1.2,
    footOffset: 0.7604, radius: 0.34, height: 1.29, habitat: "Hobbit markets and roadside inns", active: "Day and early evening",
    behavior: "Circulates between market stalls, assesses any ordinary item, and pays more for what the settlement currently needs.",
    lore: "Provisioners remember the fair price of a sack of onions from years before either trader was born.",
    colors: [0xb06b45, 0xe0bd75, 0x2d1d18], drops: [], family: "sentient", movement: "ground", persistent: true,
    sentient: true, faction: "hobbits", role: "merchant", profession: "Provisioner", tradeSpecialty: "General goods, mead and settlement demand",
    utility: "General Skyrim-style buyer and seller with finite, restocking gold.", discoveryHint: "Canvas awnings and stacked barrels identify the market lane.",
  },
  "hobbit-banker": {
    kind: "hobbit-banker", name: "Hobbit Goldkeeper", temperament: "Gentle", hostile: false,
    health: 12, damage: 1, xp: 0, speed: 0.5, chaseSpeed: 1.62, turnRate: 5.8, attackRange: 1.2,
    footOffset: 0.7604, radius: 0.34, height: 1.28, habitat: "Hobbit counting houses", active: "Day",
    behavior: "Works at a secured counter, manages deposits and investments, and returns home under guard after closing.",
    lore: "Goldkeepers measure wealth in promises kept, though their ledgers remain extremely particular about the gold.",
    colors: [0x385f64, 0xd7b35e, 0x261e18], drops: [], family: "sentient", movement: "ground", persistent: true,
    sentient: true, faction: "hobbits", role: "banker", profession: "Goldkeeper", tradeSpecialty: "Gold deposits, daily interest and investments",
    utility: "Opens the settlement banking and investment ledger.", discoveryHint: "The counting house has brass-bound doors and a gold acorn sign.",
  },
  "hobbit-hammer-guard": {
    kind: "hobbit-hammer-guard", name: "Hobbit Hammerguard", temperament: "Defensive", hostile: false,
    health: 20, damage: 5, xp: 0, speed: 0.68, chaseSpeed: 2.55, turnRate: 7.2, attackRange: 1.7,
    footOffset: 0.7604, radius: 0.38, height: 1.34, habitat: "Hobbit gates, walls and patrol lanes", active: "All shifts",
    behavior: "Patrols gates, intercepts monsters and faction enemies, and keeps its square-headed hammer projected ahead in a ready stance.",
    lore: "A Hammerguard learns every loose stone in the wall and every child who uses the gate as a shortcut.",
    colors: [0x854d3f, 0xd2aa66, 0x201813], drops: [], family: "sentient", movement: "ground", persistent: true,
    sentient: true, faction: "hobbits", role: "guard", profession: "Hammerguard", tradeSpecialty: "Local defense",
    utility: "Melee settlement defender equipped with a compact war hammer.", discoveryHint: "Hammerguards favor the main gate and wall walk.",
  },
  "hobbit-crossbow-guard": {
    kind: "hobbit-crossbow-guard", name: "Hobbit Boltwatch", temperament: "Defensive", hostile: false,
    health: 17, damage: 5, xp: 0, speed: 0.62, chaseSpeed: 2.15, turnRate: 7.5, attackRange: 14,
    footOffset: 0.7604, radius: 0.36, height: 1.33, habitat: "Hobbit gate towers and rooftops", active: "All shifts",
    behavior: "Watches road approaches, shoulders a compact crossbow, and fires visible bolts past civilians only when it has a clear line.",
    lore: "Boltwatches carve one small leaf into a stock for every winter their town has stood unbreached.",
    colors: [0x496b4e, 0xbd8d4f, 0x251b15], drops: [], family: "sentient", movement: "ground", persistent: true, ranged: true,
    sentient: true, faction: "hobbits", role: "guard", profession: "Boltwatch", tradeSpecialty: "Gate defense and crossbow training",
    utility: "Ranged settlement defender using the same readable bolt path as player crossbows.", discoveryHint: "Look along gatehouse balconies for green hooded sentries.",
  },
  "goblin-chieftain": {
    kind: "goblin-chieftain", name: "Goblin Roadboss", temperament: "Defensive", hostile: false,
    health: 19, damage: 4, xp: 0, speed: 0.72, chaseSpeed: 2.45, turnRate: 7, attackRange: 1.5,
    footOffset: 0.88, radius: 0.36, height: 1.5, habitat: "Goblin longhouses and road forts", active: "Day and evening",
    behavior: "Directs patrols from the longhouse, negotiates with trusted outsiders, and chooses force quickly when relations collapse.",
    lore: "A Roadboss earns the iron key-ring by keeping paths open, fires fed, and rival bosses at a useful distance.",
    colors: [0x733c35, 0xb07a3d, 0xf1d45e], drops: [], family: "sentient", movement: "ground", persistent: true,
    sentient: true, faction: "goblins", role: "chieftain", profession: "Roadboss", tradeSpecialty: "Town authority, mercenaries and faction contracts",
    utility: "Goblin settlement leader for claims, hiring and high-trust work.", discoveryHint: "A bannered longhouse rises behind the main palisade gate.",
  },
  "goblin-worker": {
    kind: "goblin-worker", name: "Goblin Grower", temperament: "Defensive", hostile: false,
    health: 11, damage: 2, xp: 0, speed: 0.68, chaseSpeed: 2, turnRate: 7.2, attackRange: 1.25,
    footOffset: 0.88, radius: 0.34, height: 1.45, habitat: "Goblin fungus yards and terrace fields", active: "Dawn through dusk",
    behavior: "Tends hardy crops, hauls supplies, chats around work fires, and defends itself only after being badly wounded.",
    lore: "Growers know which mushrooms cure a stew and which ones convince the stew to leave the pot.",
    colors: [0x69713d, 0xb38143, 0xebcf52], drops: [], family: "sentient", movement: "ground", persistent: true,
    sentient: true, faction: "goblins", role: "worker", profession: "Grower", tradeSpecialty: "Fungus, roots, fiber and common supplies",
    utility: "Produces food and offers practical settlement errands.", discoveryHint: "Smoke, mushroom racks and terraced root beds mark working yards.",
  },
  "goblin-miner": {
    kind: "goblin-miner", name: "Goblin Sparkdelver", temperament: "Defensive", hostile: false,
    health: 14, damage: 3, xp: 0, speed: 0.66, chaseSpeed: 2.05, turnRate: 6.8, attackRange: 1.3,
    footOffset: 0.88, radius: 0.35, height: 1.47, habitat: "Goblin mines, slag heaps and smith yards", active: "Day and late evening",
    behavior: "Moves between mine and forge, tests ore against a chipped pick, and sells raw materials from a limited stock.",
    lore: "Sparkdelvers name promising rock seams and apologize when the seam turns out to be ordinary dirt.",
    colors: [0x495766, 0x9c7244, 0xf2d45f], drops: [], family: "sentient", movement: "ground", persistent: true,
    sentient: true, faction: "goblins", role: "miner", profession: "Sparkdelver", tradeSpecialty: "Ore, coal, flint and tools",
    utility: "Primary Goblin raw-material trader.", discoveryHint: "Follow cart grooves toward a roofed mine mouth and slag piles.",
  },
  "goblin-alchemist": {
    kind: "goblin-alchemist", name: "Goblin Bottlesage", temperament: "Defensive", hostile: false,
    health: 12, damage: 3, xp: 0, speed: 0.65, chaseSpeed: 1.95, turnRate: 7.4, attackRange: 5,
    footOffset: 0.88, radius: 0.34, height: 1.49, habitat: "Goblin markets and smoking bottle shops", active: "Late morning through nightfall",
    behavior: "Trades general goods and alchemical stock, checks bubbling bottles, and throws a weak defensive flask when cornered.",
    lore: "Bottlesages label every mixture. Whether anyone else can read the labels is considered a separate craft.",
    colors: [0x5c3f72, 0x9e7d44, 0xf6dc66], drops: [], family: "sentient", movement: "ground", persistent: true, ranged: true,
    sentient: true, faction: "goblins", role: "alchemist", profession: "Bottlesage", tradeSpecialty: "General goods, potion blueprints and strange reagents",
    utility: "Goblin merchant with special alchemy stock.", discoveryHint: "Colored bottle lanterns and violet smoke mark a Bottlesage shop.",
  },
  "goblin-spear-guard": {
    kind: "goblin-spear-guard", name: "Goblin Spearwarden", temperament: "Defensive", hostile: false,
    health: 18, damage: 5, xp: 0, speed: 0.78, chaseSpeed: 2.75, turnRate: 8, attackRange: 2.25,
    footOffset: 0.88, radius: 0.37, height: 1.52, habitat: "Goblin palisade gates and road patrols", active: "All shifts",
    behavior: "Patrols with Wargs, braces a long spear through gate openings, and closes ranks around civilians during attacks.",
    lore: "Spearwardens keep bright ribbons below each spearhead so allies can read a patrol through dust and rain.",
    colors: [0x68412f, 0xc0643e, 0xf4d75a], drops: [], family: "sentient", movement: "ground", persistent: true,
    sentient: true, faction: "goblins", role: "guard", profession: "Spearwarden", tradeSpecialty: "Gate defense and spear training",
    utility: "Reach-focused Goblin defender whose spear clearly projects ahead of its hands.", discoveryHint: "Red spear pennants move along Goblin walls and gate roads.",
  },
  warg: {
    kind: "warg", name: "Road Warg", temperament: "Defensive", hostile: false,
    health: 18, damage: 5, xp: 7, speed: 0.9, chaseSpeed: 4.25, turnRate: 7.4, attackRange: 1.55,
    footOffset: 1.2, radius: 0.68, height: 1.28, habitat: "Goblin roads, scrubland forts and rare feral upland packs", active: "Dusk, night and patrol shifts",
    behavior: "Runs in coordinated patrol pairs, snaps at faction enemies, and refuses bonding while sworn to a settlement.",
    lore: "A Warg remembers every road it has guarded and every rider who treated it as a partner rather than a tool.",
    colors: [0x4d5148, 0x8a6b45, 0xe5c25a], drops: [{ item: Item.Hide, min: 1, max: 2, chance: 0.72 }, { item: Item.RawMeat, min: 1, max: 2, chance: 0.55 }],
    family: "mount", movement: "ground", persistent: true, sentient: false, factionAffinity: "goblins", tameRequiresUnaligned: true,
    tameable: true, tameItems: [Item.WargFeed, Item.RawMeat, Item.CookedMeat], breedable: true, breedingFoods: [Item.WargFeed, Item.RawMeat], diet: [Item.WargFeed, Item.RawMeat, Item.CookedMeat], rideable: true,
    postTameNotes: "Only an unaligned Warg can bond. A trusted, saddled Warg accepts a rider and keeps its bite available in combat.",
    secretHint: "Settlement patrol Wargs are faction-aligned and cannot be tamed; unaligned specimens from rare orbs can be befriended with meat.",
    utility: "Fast combat-capable mount when unaligned, bonded and saddled.", discoveryHint: "Look for paired tracks beside Goblin patrol roads.",
  },
  burrowbell: {
    kind: "burrowbell", name: "Burrowbell", temperament: "Skittish", hostile: false,
    health: 6, damage: 0, xp: 3, speed: 0.55, chaseSpeed: 2.7, turnRate: 8.5, attackRange: 0,
    footOffset: 0.96, radius: 0.4, height: 0.72, habitat: "Sunny upland meadows and grassy town margins", active: "Morning and late afternoon",
    behavior: "Forages in small family rings, stands upright to whistle at danger, then vanishes into the nearest burrow.",
    lore: "Its hollow tail tip makes a faint bell note when the whole colony races underground.",
    colors: [0xaa7c4f, 0xe3c18a, 0x281d18], drops: [{ item: Item.Fiber, min: 1, max: 1, chance: 0.28 }],
    family: "surface", movement: "ground", sentient: false, breedable: true, breedingFoods: [Item.Berry], diet: [Item.Berry, Item.Wheat],
    utility: "Whistles when hostile creatures approach open grass.", discoveryHint: "Small round burrows and lookout stones dot quiet upland meadows.",
  },
  "dewback-tapir": {
    kind: "dewback-tapir", name: "Dewback Tapir", temperament: "Gentle", hostile: false,
    health: 14, damage: 2, xp: 5, speed: 0.52, chaseSpeed: 2.2, turnRate: 4.6, attackRange: 1.2,
    footOffset: 1.095, radius: 0.68, height: 1.18, habitat: "Rain-dark forest pools and broad Siltfen banks", active: "Rain, dawn and dusk",
    behavior: "Browses low leaves in family pairs, wallows at shallow banks, and shoulder-checks only when a calf is threatened.",
    lore: "Water beads on the pale saddle of its back, carrying seeds until the animal brushes through new ground.",
    colors: [0x564238, 0xc8a986, 0x211a18], drops: [{ item: Item.Hide, min: 1, max: 2, chance: 0.48 }, { item: Item.RawMeat, min: 1, max: 2, chance: 0.58 }],
    family: "surface", movement: "ground", sentient: false, breedable: true, breedingFoods: [Item.Apple], diet: [Item.Apple, Item.Berry, Item.Wheat],
    utility: "Carries wetland seeds between pools and can expose buried roots while browsing.", discoveryHint: "Wide three-toed tracks connect shaded forest pools after rain.",
  },
  "redfin-salmon": {
    kind: "redfin-salmon", name: "Redfin Salmon", temperament: "Skittish", hostile: false,
    health: 4, damage: 0, xp: 3, speed: 1.75, chaseSpeed: 3.8, turnRate: 9, attackRange: 0,
    footOffset: 0, radius: 0.24, height: 0.22, habitat: "Cool rivers and forest tributaries", active: "Morning, rain and seasonal upstream runs",
    behavior: "Holds in small schools below falls, then surges upstream through clear channels.",
    lore: "Its red fins brighten on the long route home, sketching living arrows through a river.",
    colors: [0x8397a2, 0xc74f45, 0x172932], drops: [{ item: Item.RawFish, min: 1, max: 2, chance: 1 }],
    family: "fish", movement: "aquatic", aquatic: true, utility: "A sturdy river food fish.", captureItem: Item.CaptureOrb,
  },
  "blue-mackerel": {
    kind: "blue-mackerel", name: "Blue Mackerel", temperament: "Skittish", hostile: false,
    health: 3, damage: 0, xp: 2, speed: 1.95, chaseSpeed: 4.15, turnRate: 11, attackRange: 0,
    footOffset: 0, radius: 0.22, height: 0.18, habitat: "Open ocean shelves and deep coastal water", active: "Daylight underwater",
    behavior: "Forms tight striped schools that roll together when larger shadows pass overhead.",
    lore: "A turning school flashes blue like rain seen from below the sea.",
    colors: [0x356c94, 0xc7d6ce, 0x152838], drops: [{ item: Item.RawFish, min: 1, max: 1, chance: 1 }],
    family: "fish", movement: "aquatic", aquatic: true, utility: "A common ocean food fish.", captureItem: Item.CaptureOrb,
  },
  "deepwater-shark": {
    kind: "deepwater-shark", name: "Slatefin Shark", temperament: "Hostile", hostile: true,
    health: 22, damage: 5, xp: 10, speed: 1.25, chaseSpeed: 3.45, turnRate: 4.8, attackRange: 1.55,
    footOffset: 0, radius: 0.86, height: 0.78, habitat: "Deep ocean beyond coastal shelves", active: "All hours underwater",
    behavior: "Cruises alone below shoals, investigates swimmers, and deliberately ignores occupied boats.",
    lore: "Slatefins follow the cool seam below storms. Sailors fear them less than an ocean suddenly empty of them.",
    colors: [0x405766, 0xb7c5c4, 0xe6edf0], drops: [{ item: Item.RawFish, min: 2, max: 4, chance: 1 }, { item: Item.BoneShard, min: 1, max: 2, chance: 0.36 }],
    family: "fish", movement: "aquatic", aquatic: true, utility: "A sparse deep-ocean predator that never attacks players seated in boats.",
    discoveryHint: "Watch the dark water below large offshore shoals.",
  },
  "sunwash-crab": {
    kind: "sunwash-crab", name: "Sunwash Crab", temperament: "Defensive", hostile: false,
    health: 5, damage: 1, xp: 2, speed: 0.42, chaseSpeed: 1.7, turnRate: 8.5, attackRange: 0.75,
    footOffset: 0.89742, radius: 0.36, height: 0.38, habitat: "Sunwash Coast tide pools and bright sand shelves", active: "Daylight and low tide",
    behavior: "Scuttles sideways between tide pools, raises both claws when cornered, and buries itself during hard weather.",
    lore: "Every shell carries a different sunburst. Coast children compare them like tiny heraldry.",
    colors: [0xe68a55, 0xf4c87a, 0x2d2a38], drops: [{ item: Item.RawFish, min: 1, max: 1, chance: 0.45 }, { item: Item.Flint, min: 1, max: 1, chance: 0.14 }],
    family: "surface", movement: "ground", utility: "A small coastal food source whose burrows mark safe tide-pool shelves.",
    discoveryHint: "Look for paired tracks around Sunwash Coast tide pools.",
  },
  "tideglass-crab": {
    kind: "tideglass-crab", name: "Tideglass Crab", temperament: "Defensive", hostile: false,
    health: 7, damage: 1, xp: 3, speed: 0.68, chaseSpeed: 2.05, turnRate: 9.4, attackRange: 0.82,
    footOffset: 0, radius: 0.43, height: 0.4, habitat: "Tidelight Shelf seafloors, kelp beds and shallow reef ledges", active: "All hours underwater",
    behavior: "Scuttles along the sea floor, fans luminous paddles through sand, and raises asymmetrical crystal claws when cornered.",
    lore: "Its shell grows a thin tideglass window that catches moonlight even several fathoms below the surface.",
    colors: [0x2d8190, 0x78ddd1, 0xc8fff2], drops: [{ item: Item.RawFish, min: 1, max: 1, chance: 0.35 }, { item: Item.GlowScale, min: 1, max: 1, chance: 0.12 }],
    family: "fish", movement: "aquatic", aquatic: true, captureItem: Item.CaptureOrb,
    utility: "A seafloor scavenger whose glow marks shallow reef shelves.", discoveryHint: "Look below kelp shadows for a moving turquoise star on the sand.",
  },
  "reefglide-terrapin": {
    kind: "reefglide-terrapin", name: "Reefglide Terrapin", temperament: "Gentle", hostile: false,
    health: 16, damage: 0, xp: 5, speed: 0.88, chaseSpeed: 2.2, turnRate: 6.4, attackRange: 0,
    footOffset: 0, radius: 0.68, height: 0.42, habitat: "Tidelight Shelf lagoons, seagrass beds and warm reef arches", active: "Daylight underwater",
    behavior: "Rows with long front flippers, grazes seagrass, and wedges its low coral shell beneath reef arches to sleep.",
    lore: "Each shell garden grows from fragments collected along a decades-long circuit of the coast.",
    colors: [0x397d75, 0xd48f72, 0xbff8dc], drops: [{ item: Item.RawFish, min: 1, max: 2, chance: 0.46 }, { item: Item.CrystalShard, min: 1, max: 1, chance: 0.08 }],
    family: "fish", movement: "aquatic", aquatic: true, sentient: false, breedable: true, breedingFoods: [Item.Berry], diet: [Item.Berry, Item.Wheat], captureItem: Item.CaptureOrb,
    utility: "Its grazing keeps shallow seagrass paths open.", discoveryHint: "Search beneath warm reef arches for a moving coral mosaic.",
  },
  "tidewing-gull": {
    kind: "tidewing-gull", name: "Tidewing Gull", temperament: "Skittish", hostile: false,
    health: 4, damage: 0, xp: 2, speed: 1.4, chaseSpeed: 4.4, turnRate: 10.5, attackRange: 0,
    footOffset: 1.25, radius: 0.31, height: 0.48, habitat: "Sunwash Coast cliffs, beaches and fishing water", active: "Daylight",
    behavior: "Rides sea wind in broad circles, lands near shoals, and noisily flees anyone who rushes its perch.",
    lore: "A Tidewing's cry arrives before the coast itself, carrying over dunes and salt grass.",
    colors: [0xe8eee9, 0x6d9db0, 0x171f31], drops: [{ item: Item.Feather, min: 1, max: 2, chance: 1 }],
    family: "bird", movement: "flying", flying: true, breedable: true, breedingFoods: [Item.RawFish], diet: [Item.RawFish],
    utility: "Circling flocks point toward fish-rich water and nearby coast.", discoveryHint: "Listen for sharp calls above Sunwash cliffs.",
  },
  glassfin: {
    kind: "glassfin", name: "Glassfin", temperament: "Skittish", hostile: false,
    health: 3, damage: 0, xp: 3, speed: 1.75, chaseSpeed: 4.1, turnRate: 11, attackRange: 0,
    footOffset: 0, radius: 0.26, height: 0.2, habitat: "Deep ocean thermoclines and Lumen Trenches", active: "All hours underwater",
    behavior: "Schools in translucent spirals and scatters into dim prismatic flashes when a large shape approaches.",
    lore: "Its clear fins catch colors the surface never sees.",
    colors: [0x7db8c8, 0xa9ecdf, 0xdffcff], drops: [{ item: Item.RawFish, min: 1, max: 1, chance: 0.9 }, { item: Item.GlowScale, min: 1, max: 1, chance: 0.18 }],
    family: "fish", movement: "aquatic", aquatic: true, utility: "A luminous deep-water food fish and future alchemy reagent.", captureItem: Item.CaptureOrb,
    discoveryHint: "Watch for faint rainbow turns beneath the last blue light.",
  },
  lanternjaw: {
    kind: "lanternjaw", name: "Lanternjaw", temperament: "Defensive", hostile: false,
    health: 8, damage: 2, xp: 5, speed: 0.82, chaseSpeed: 2.65, turnRate: 7, attackRange: 0.95,
    footOffset: 0, radius: 0.48, height: 0.42, habitat: "Lumen Trench ledges and deep reef caves", active: "Darkness underwater",
    behavior: "Hovers beneath overhangs, pulses its jaw-lights to communicate, and snaps only after its hiding place is invaded.",
    lore: "The pattern under its jaw is a name, warning and love song written in blue fire.",
    colors: [0x233c52, 0x59d7bf, 0xb8fff0], drops: [{ item: Item.RawFish, min: 1, max: 2, chance: 1 }, { item: Item.GlowScale, min: 1, max: 2, chance: 0.7 }],
    family: "fish", movement: "aquatic", aquatic: true, utility: "A strong renewable source of Glow Scales.", captureItem: Item.CaptureOrb,
    discoveryHint: "Blue jaw-signals blink beneath Lumen Trench overhangs.",
  },
  "abyss-skater": {
    kind: "abyss-skater", name: "Abyss Skater", temperament: "Defensive", hostile: false,
    health: 14, damage: 3, xp: 7, speed: 0.48, chaseSpeed: 1.9, turnRate: 6.5, attackRange: 1.15,
    footOffset: 0, radius: 0.92, height: 0.38, habitat: "Deep sea floor, trench silt and whale-fall gardens", active: "All hours underwater",
    behavior: "Walks on six luminous stilts over silt, filters drifting scraps, and fans a cold warning halo when touched.",
    lore: "Abyss Skaters cross the dark floor without leaving a track, carrying gardens of tiny lights beneath them.",
    colors: [0x342a55, 0x5ce0d0, 0xe9fff2], drops: [{ item: Item.CaveGel, min: 1, max: 2, chance: 0.72 }, { item: Item.GlowDust, min: 1, max: 2, chance: 0.52 }],
    family: "fish", movement: "aquatic", aquatic: true, utility: "Its luminous filter fans provide future deep-water ingredients.",
    discoveryHint: "Look for six moving pin-lights across flat trench silt.",
  },
  dreadcoil: {
    kind: "dreadcoil", name: "Dreadcoil", temperament: "Hostile", hostile: true,
    health: 52, damage: 9, xp: 18, speed: 1.15, chaseSpeed: 3.25, turnRate: 4.3, attackRange: 2.25,
    footOffset: 0, radius: 1.45, height: 1.2, habitat: "Rare deep-ocean ravines and the edges of Lumen Trenches", active: "Night and deep darkness",
    behavior: "Hides its long body along ravine walls, detects swimmers before boats, then attacks in one committed spiraling rush.",
    lore: "Old sailors call a sudden ring of silent fish a Dreadcoil's crown.",
    colors: [0x1e2438, 0x7d315a, 0xff7b9b], drops: [{ item: Item.RawFish, min: 3, max: 6, chance: 1 }, { item: Item.ShadowShard, min: 1, max: 3, chance: 0.68 }],
    family: "fish", movement: "aquatic", aquatic: true, utility: "A rare serious sea encounter with valuable shadow-rich remains.",
    discoveryHint: "An unnaturally empty ring in a deep shoal may be its hunting ground.",
  },
  tidepup: {
    kind: "tidepup", name: "Tidepup", temperament: "Gentle", hostile: false,
    health: 10, damage: 1, xp: 5, speed: 1.05, chaseSpeed: 3.45, turnRate: 9.5, attackRange: 0.9,
    footOffset: 0, radius: 0.48, height: 0.52, habitat: "Kelp shelves, warm reefs and quiet Atlantian outskirts", active: "Day and dusk underwater",
    behavior: "Chases bubbles, naps in kelp, brings dropped shells to patient swimmers, and flees rather than fighting.",
    lore: "A Tidepup recognizes a familiar swimmer by heartbeat before face.",
    colors: [0x4da6a8, 0xa7dfc5, 0x132d43], drops: [{ item: Item.RawFish, min: 1, max: 1, chance: 0.45 }],
    family: "pet", movement: "aquatic", aquatic: true, persistent: true, tameable: true, tameItems: [Item.RawFish, Item.GlowScale],
    breedable: true, breedingFoods: [Item.RawFish], diet: [Item.RawFish, Item.CookedFish, Item.GlowScale], captureItem: Item.CaptureOrb,
    postTameNotes: "A bonded Tidepup follows through water, waits near shore, and retrieves nearby floating drops.",
    utility: "A gentle sea companion and underwater item retriever.", discoveryHint: "Bubbles moving against the current often reveal a playful Tidepup.",
  },
  sakurakit: {
    kind: "sakurakit", name: "Sakurakit", temperament: "Skittish", hostile: false,
    health: 6, damage: 1, xp: 3, speed: 0.72, chaseSpeed: 2.85, turnRate: 8.5, attackRange: 0.72,
    footOffset: 0.94, radius: 0.35, height: 0.7, habitat: "Pink forest glades, Bloomwood edges and quiet orchards", active: "Day and blossom dusk",
    behavior: "Pounces on falling petals, hides in low blossoms, and follows trusted keepers without seeking fights.",
    lore: "Its tail keeps one blossom through every season. Nobody has seen it fall.",
    colors: [0xf0a6c2, 0xffe0d6, 0x3d2753], drops: [{ item: Item.Fiber, min: 1, max: 1, chance: 0.22 }],
    family: "pet", movement: "ground", persistent: true, tameable: true, tameItems: [Item.Berry, Item.Apple],
    breedable: true, breedingFoods: [Item.Berry], diet: [Item.Berry, Item.Apple], captureItem: Item.CaptureOrb,
    postTameNotes: "Sakurakits can sit, follow, stay and wander. They warn their keeper, but remain intentionally weak in combat.",
    utility: "A quiet companion that notices nearby flowers and butterflies.", discoveryHint: "Follow low swirls of pink petals through a blossom glade.",
  },
  "taffy-hound": {
    kind: "taffy-hound", name: "Taffy Hound", temperament: "Defensive", hostile: false,
    health: 12, damage: 2, xp: 4, speed: 0.82, chaseSpeed: 3.55, turnRate: 9.2, attackRange: 0.92,
    footOffset: 0.91, radius: 0.42, height: 0.78, habitat: "Sugarcourt kennels, hard-candy gates and Bonbon Borough lanes", active: "Day and settlement watch shifts",
    behavior: "Patrols beside Sugarcourt guards, wags a curled licorice tail at friends, and challenges danger without straying far from its borough.",
    lore: "Every Taffy Hound is given a collar pressed with its borough's crest. The sweet is ceremonial; the loyalty is entirely real.",
    colors: [0xd96f9f, 0xf2c76e, 0x30213c], drops: [],
    family: "pet", movement: "ground", persistent: true, sentient: false, factionAffinity: "sugarcourt", tameRequiresUnaligned: true,
    tameable: true, tameItems: [Item.Gumdrop, Item.PeppermintCane], breedable: true, breedingFoods: [Item.Gumdrop],
    diet: [Item.Gumdrop, Item.PeppermintCane, Item.CookedMeat], captureItem: Item.CaptureOrb,
    postTameNotes: "Only an unaligned Taffy Hound can bond. A trusted hound follows, holds position, wanders on command, and bravely nips at threats to its keeper.",
    secretHint: "Borough hounds are faction-aligned and cannot be tamed. Sugarcourt Kennelkeepers sometimes sell neutral youngsters in Capture Orbs.",
    utility: "A loyal, low-damage companion and warning dog.", discoveryHint: "Listen for candy-tag collars clicking near Sugarcourt gates.",
  },
  "praline-cat": {
    kind: "praline-cat", name: "Praline Cat", temperament: "Skittish", hostile: false,
    health: 7, damage: 1, xp: 3, speed: 0.76, chaseSpeed: 3.2, turnRate: 10.5, attackRange: 0.68,
    footOffset: 0.88, radius: 0.33, height: 0.62, habitat: "Sugarcourt homes, sweet markets and warm Sugarworks counters", active: "Day, dusk and inconvenient moments",
    behavior: "Stretches across warm counters, pounces on loose sprinkles, and slips behind furniture when fighting reaches the market.",
    lore: "Praline Cats always smell faintly toasted. Sugarboilers insist this proves they understand quality control.",
    colors: [0x8c573e, 0xe0a15e, 0xffefc1], drops: [],
    family: "pet", movement: "ground", persistent: true, sentient: false, factionAffinity: "sugarcourt", tameRequiresUnaligned: true,
    tameable: true, tameItems: [Item.SyrupfinFillet, Item.RawFish], breedable: true, breedingFoods: [Item.SyrupfinFillet],
    diet: [Item.SyrupfinFillet, Item.RawFish, Item.CookedFish], captureItem: Item.CaptureOrb,
    postTameNotes: "An unaligned Praline Cat can sit, follow, hold or wander. It avoids serious fights but alerts its keeper to nearby tiny creatures.",
    secretHint: "Village cats remain loyal to the Sugarcourt. Kennelkeepers occasionally sell neutral cats in filled Capture Orbs.",
    utility: "A gentle decorative companion that notices small fauna.", discoveryHint: "Look on warm counters and candywood shelves inside Bonbon Boroughs.",
  },
  "rimecoat-hound": {
    kind: "rimecoat-hound", name: "Rimecoat Hound", temperament: "Defensive", hostile: false,
    health: 13, damage: 2, xp: 4, speed: 0.78, chaseSpeed: 3.7, turnRate: 8.8, attackRange: 0.95,
    footOffset: 0.94, radius: 0.45, height: 0.82, habitat: "Frostpine trails, Snowfield drifts and sheltered Snowcap passes", active: "Day and snowfall",
    behavior: "Travels in small family groups, noses through fresh powder, and plants itself between a trusted keeper and danger.",
    lore: "Its double coat sheds frost in silver flakes. Deepgear caravans trust a Rimecoat's nose when whiteout winds erase the road.",
    colors: [0xb9cbd0, 0xe9f2ee, 0x26384a], drops: [{ item: Item.Fiber, min: 1, max: 2, chance: 0.32 }],
    family: "pet", movement: "ground", persistent: true, tameable: true, tameItems: [Item.CookedMeat, Item.RawMeat],
    breedable: true, breedingFoods: [Item.CookedMeat], diet: [Item.CookedMeat, Item.RawMeat], captureItem: Item.CaptureOrb,
    postTameNotes: "A bonded Rimecoat follows, holds or wanders on command and guards its keeper without chasing distant threats.",
    utility: "A cold-weather companion and dependable warning hound.", discoveryHint: "Follow broad pawprints where snowfall gathers beneath Frostpine boughs.",
  },
  "bramblewhisk-cat": {
    kind: "bramblewhisk-cat", name: "Bramblewhisk Cat", temperament: "Skittish", hostile: false,
    health: 7, damage: 1, xp: 3, speed: 0.8, chaseSpeed: 3.35, turnRate: 11, attackRange: 0.7,
    footOffset: 0.89, radius: 0.34, height: 0.64, habitat: "Wildwood bramble tunnels, Bloomwood edges and Rainveil understory", active: "Dawn, dusk and rain",
    behavior: "Stalks beetles beneath leaves, climbs low roots, and vanishes into brush before returning to inspect patient travelers.",
    lore: "Seeds cling to the hooked whisker tufts without tangling. Grovekeepers read the little collections to learn where each cat wandered.",
    colors: [0x526b48, 0xb58b5a, 0xf3df9b], drops: [{ item: Item.Fiber, min: 1, max: 1, chance: 0.12 }],
    family: "pet", movement: "ground", persistent: true, tameable: true, tameItems: [Item.RawFish, Item.CookedFish],
    breedable: true, breedingFoods: [Item.CookedFish], diet: [Item.RawFish, Item.CookedFish], captureItem: Item.CaptureOrb,
    postTameNotes: "A bonded Bramblewhisk can follow, hold or wander. It avoids serious combat and alerts its keeper to small nearby fauna.",
    utility: "A forest companion that notices tiny creatures and hidden movement.", discoveryHint: "Watch low bramble arches for a striped tail moving against the leaves.",
  },
  sprinklebug: {
    kind: "sprinklebug", name: "Sprinklebug", temperament: "Skittish", hostile: false,
    health: 2, damage: 0, xp: 1, speed: 0.38, chaseSpeed: 1.65, turnRate: 12, attackRange: 0,
    footOffset: 0.82150109, radius: 0.17, height: 0.2, habitat: "Sugarplum Vale gumdrop bushes, lollipop orchids and marshmallow shade", active: "Warm daylight",
    behavior: "Travels in glittering little clusters, carries candy pollen between low flowers, and vanishes beneath foliage when startled.",
    lore: "One Sprinklebug is almost silent. A whole cluster sounds like a jar of decorations being carefully turned over.",
    colors: [0xf0a1cf, 0x6ac9a7, 0xffec78], drops: [{ item: Item.Gumdrop, min: 1, max: 1, chance: 0.34 }],
    family: "surface", movement: "ground", sentient: false,
    utility: "A harmless candy-pollen carrier and very small forage source.", discoveryHint: "Watch the ground beneath Lollipop Orchids for moving sprinkles.",
  },
  taffalo: {
    kind: "taffalo", name: "Taffalo", temperament: "Defensive", hostile: false,
    health: 28, damage: 2, xp: 7, speed: 0.58, chaseSpeed: 3.15, turnRate: 4.5, attackRange: 1.22,
    footOffset: 1.12, radius: 0.72, height: 1.58, habitat: "Open Sugarplum Vale clearings and peppermint terraces", active: "Morning and late afternoon",
    behavior: "Moves in soft-footed herds, browses peppermint, and plants its broad feet when a calf is threatened rather than seeking a fight.",
    lore: "Pulled taffy folds form its coat, but the warm marshmallow mane never seems to gather dust.",
    colors: [0xb96f98, 0xf6e4e7, 0x40283b], drops: [{ item: Item.MarshmallowTuft, min: 1, max: 2, chance: 0.88 }],
    family: "mount", movement: "ground", persistent: true, sentient: false,
    tameable: true, tameItems: [Item.PeppermintCane, Item.Gumdrop], breedable: true, breedingFoods: [Item.CocoaNib],
    diet: [Item.PeppermintCane, Item.Gumdrop, Item.CocoaNib, Item.MarshmallowTuft], captureItem: Item.CaptureOrb, rideable: true,
    postTameNotes: "A trusted adult Taffalo accepts a Trail Saddle and carries one rider at a steady pace. It remains intentionally weak in combat.",
    secretHint: "Peppermint builds trust quickly. Only an adult bonded to its rider will accept a saddle.",
    utility: "A sturdy one-seat Sugarplum mount with a calm herd temperament.", discoveryHint: "Broad candy-soft tracks cross peppermint clearings in groups.",
  },
  syrupfin: {
    kind: "syrupfin", name: "Syrupfin", temperament: "Skittish", hostile: false,
    health: 4, damage: 0, xp: 3, speed: 1.35, chaseSpeed: 3.25, turnRate: 9.5, attackRange: 0,
    footOffset: 0, radius: 0.23, height: 0.2, habitat: "Natural syrup ponds in the Sugarplum Vale", active: "All hours within syrup",
    behavior: "Shoals through slow amber currents, turns in broad synchronized loops, and cannot survive in ordinary water or honey.",
    lore: "A Syrupfin's glassy fins stay perfectly clean no matter how slowly the pond moves.",
    colors: [0xb96835, 0xf0b467, 0xfff0bf], drops: [{ item: Item.SyrupfinFillet, min: 1, max: 1, chance: 1 }],
    family: "fish", movement: "aquatic", aquatic: true, sentient: false, captureItem: Item.CaptureOrb, liquidHabitat: "syrup",
    utility: "An edible syrup-pond fish and favored Praline Cat food.", discoveryHint: "Look for amber ripples moving against the surface of a Sugarplum syrup pond.",
  },
  "worldshell-leviathan": {
    kind: "worldshell-leviathan", name: "Worldshell Leviathan", temperament: "Gentle", hostile: false,
    health: 1200, damage: 0, xp: 0, speed: 0.34, chaseSpeed: 0.72, turnRate: 0.72, attackRange: 0,
    footOffset: 0, radius: 6.8, height: 4.8, habitat: "Rare open ocean routes, deep shelves and warm migration waters", active: "All hours",
    behavior: "Migrates for days at a time, surfaces like a small green island, and moves almost impossibly slowly whenever it crawls onto land.",
    lore: "Whole gardens take root on old Worldshells. Cartographers have occasionally mapped one by mistake.",
    colors: [0x416d5c, 0x87a86a, 0xffe9a3], drops: [], family: "leviathan", movement: "amphibious", aquatic: true, persistent: true,
    tameable: true, tameItems: [Item.GlowScale, Item.Apple], breedable: true, breedingFoods: [Item.GlowScale, Item.RawFish], diet: [Item.GlowScale, Item.RawFish, Item.Apple],
    rideable: true, laysEggs: true, cargoChestLimit: 6,
    postTameNotes: "Only an adult accepts a saddle. Up to six chest modules can be secured across its shell; it remains extremely slow on land.",
    secretHint: "Raise a submerged hatchling to adulthood, then earn trust with patient Glow Scale feeding.",
    utility: "A rare controllable ocean mount with six-chest cargo capacity.", discoveryHint: "A green island that moves against the wind may be a Worldshell.",
  },
  "aetherbell-larva": {
    kind: "aetherbell-larva", name: "Aetherbell Larva", temperament: "Gentle", hostile: false,
    health: 18, damage: 0, xp: 0, speed: 0.72, chaseSpeed: 1.5, turnRate: 5.4, attackRange: 0,
    footOffset: 0, radius: 0.55, height: 0.95, habitat: "Submerged Lumen Trench nurseries", active: "All hours underwater",
    behavior: "Pulses through nursery water on short glowing tails. It cannot leave water until its final growth molt.",
    lore: "Every tiny bell contains the folded shape of a future sky-sailer.",
    colors: [0x7d6ad9, 0x62e6d0, 0xf3e9ff], drops: [], family: "leviathan", movement: "aquatic", aquatic: true, persistent: true,
    tameable: true, tameItems: [Item.GlowScale, Item.RoyalJelly], diet: [Item.GlowScale, Item.RoyalJelly], aquaticYoungOnly: true,
    postTameNotes: "Feed it underwater as it grows. Its adult molt unlocks air-sea morphing, saddle and chest equipment.",
    utility: "The tameable aquatic juvenile stage of an Aetherbell.", discoveryHint: "Small violet bells gather around submerged luminous gardens.",
  },
  "aetherbell-leviathan": {
    kind: "aetherbell-leviathan", name: "Aetherbell Leviathan", temperament: "Gentle", hostile: false,
    health: 620, damage: 0, xp: 0, speed: 0.64, chaseSpeed: 1.55, turnRate: 1.8, attackRange: 0,
    footOffset: 5.4, radius: 4.4, height: 7.8, habitat: "Lumen Trench migrations and the high cloud sea", active: "All hours",
    behavior: "Folds its fluid tails into lifting sails while leaving water, drifts between layered clouds, and flees upward when provoked.",
    lore: "At night, a migrating Aetherbell makes the stars appear to swim.",
    colors: [0x6f62c4, 0x57dfd3, 0xf4ecff], drops: [], family: "leviathan", movement: "flying", flying: true, aquatic: true, persistent: true,
    tameable: true, tameItems: [Item.GlowScale, Item.RoyalJelly], breedable: true, breedingFoods: [Item.GlowScale], diet: [Item.GlowScale, Item.RoyalJelly],
    rideable: true, laysEggs: true, airSeaMorph: true, cargoChestLimit: 1,
    postTameNotes: "A tame adult accepts a saddle and one chest module, and can be steered through sea or sky as its bell morphs between both forms.",
    secretHint: "Adults grow only from carefully fed aquatic larvae hatched from intact submerged eggs.",
    utility: "A rare luminous sea-and-sky mount with one chest of cargo.", discoveryHint: "Look for a violet moving star above layered clouds or far below deep water.",
  },
  "atlantian-tidewarden": {
    kind: "atlantian-tidewarden", name: "Atlantian Tidewarden", temperament: "Defensive", hostile: false,
    health: 24, damage: 5, xp: 0, speed: 0.7, chaseSpeed: 2.5, turnRate: 6.5, attackRange: 1.55,
    footOffset: 0, radius: 0.38, height: 1.82, habitat: "Atlantian council reefs and pearl halls", active: "All tidal shifts",
    behavior: "Guides a reef-town's currents, hears disputes in the pearl hall, and coordinates defense when danger enters the water.",
    lore: "A Tidewarden wears one shell from every nursery their town has protected.",
    colors: [0x275d78, 0xd5b86f, 0xb9fff1], drops: [], family: "sentient", movement: "aquatic", aquatic: true, persistent: true,
    sentient: true, faction: "atlantians", culture: "atlantians", role: "mayor", profession: "Tidewarden", tradeSpecialty: "Town authority and ocean contracts",
    utility: "Aquatic settlement leader and quest giver.", discoveryHint: "The largest pearl hall shelters a shell-crowned Tidewarden.",
  },
  "atlantian-kelpkeeper": {
    kind: "atlantian-kelpkeeper", name: "Atlantian Kelpkeeper", temperament: "Defensive", hostile: false,
    health: 15, damage: 2, xp: 0, speed: 0.72, chaseSpeed: 2.1, turnRate: 7, attackRange: 1.1,
    footOffset: 0, radius: 0.35, height: 1.72, habitat: "Atlantian kelp terraces and nursery gardens", active: "Daylit tide",
    behavior: "Tends edible kelp, replants luminous shoots, and hides among nursery fronds when monsters approach.",
    lore: "Kelpkeepers measure seasons by the direction their longest gardens lean.",
    colors: [0x2b755f, 0x8fd19b, 0xd8fff0], drops: [], family: "sentient", movement: "aquatic", aquatic: true, persistent: true,
    sentient: true, faction: "atlantians", culture: "atlantians", role: "farmer", profession: "Kelpkeeper", tradeSpecialty: "Aquatic crops and nursery supplies",
    utility: "Aquatic farmer and plant trader.", discoveryHint: "Long planted rows of kelp lead to their keepers.",
  },
  "atlantian-coralwright": {
    kind: "atlantian-coralwright", name: "Atlantian Coralwright", temperament: "Defensive", hostile: false,
    health: 18, damage: 3, xp: 0, speed: 0.68, chaseSpeed: 2.15, turnRate: 6.7, attackRange: 1.25,
    footOffset: 0, radius: 0.37, height: 1.78, habitat: "Atlantian coral workshops and stone gardens", active: "Day and evening tide",
    behavior: "Shapes reefstone without killing living coral, repairs glowstone arches, and examines every new mineral twice.",
    lore: "A Coralwright builds slowly because the building is expected to keep growing after they leave.",
    colors: [0x36718a, 0xe28779, 0xe6fff5], drops: [], family: "sentient", movement: "aquatic", aquatic: true, persistent: true,
    sentient: true, faction: "atlantians", culture: "atlantians", role: "worker", profession: "Coralwright", tradeSpecialty: "Reefstone, coralwork and building materials",
    utility: "Aquatic builder and material merchant.", discoveryHint: "Colored stone frames and tool chimes mark Coralwright yards.",
  },
  "atlantian-pearlbroker": {
    kind: "atlantian-pearlbroker", name: "Atlantian Pearlbroker", temperament: "Defensive", hostile: false,
    health: 14, damage: 2, xp: 0, speed: 0.66, chaseSpeed: 1.95, turnRate: 7.2, attackRange: 1.1,
    footOffset: 0, radius: 0.34, height: 1.7, habitat: "Atlantian current-markets and shell kiosks", active: "Daylit tide",
    behavior: "Trades from a tethered shell counter, adjusts prices to local supply, and closes its shutters when predators pass.",
    lore: "Pearlbrokers value a good story, then insist on paying separately for it.",
    colors: [0x4b5d96, 0xd7bfdf, 0xb8fff5], drops: [], family: "sentient", movement: "aquatic", aquatic: true, persistent: true,
    sentient: true, faction: "atlantians", culture: "atlantians", role: "merchant", profession: "Pearlbroker", tradeSpecialty: "General goods, pearls and ocean curios",
    utility: "Aquatic general merchant.", discoveryHint: "Shell counters cluster where marker-streamers cross.",
  },
  "atlantian-glowmender": {
    kind: "atlantian-glowmender", name: "Atlantian Glowmender", temperament: "Defensive", hostile: false,
    health: 16, damage: 3, xp: 0, speed: 0.67, chaseSpeed: 2, turnRate: 7.5, attackRange: 4.5,
    footOffset: 0, radius: 0.35, height: 1.74, habitat: "Atlantian glow gardens and healing grottoes", active: "All tidal shifts",
    behavior: "Cultivates bioluminescent remedies, tends nursery eggs, and releases a dazzling defensive pulse when trapped.",
    lore: "Glowmenders say light is only medicine that has not chosen a patient yet.",
    colors: [0x315b70, 0x54dfc5, 0xf0fff7], drops: [], family: "sentient", movement: "aquatic", aquatic: true, persistent: true, ranged: true,
    sentient: true, faction: "atlantians", culture: "atlantians", role: "alchemist", profession: "Glowmender", tradeSpecialty: "Water-breathing mixtures and luminous reagents",
    utility: "Aquatic healer and alchemy merchant.", discoveryHint: "Turquoise light-gardens surround a Glowmender grotto.",
  },
  "atlantian-trident-guard": {
    kind: "atlantian-trident-guard", name: "Atlantian Trident Guard", temperament: "Defensive", hostile: false,
    health: 25, damage: 6, xp: 0, speed: 0.82, chaseSpeed: 2.9, turnRate: 8, attackRange: 2.4,
    footOffset: 0, radius: 0.39, height: 1.86, habitat: "Atlantian current gates and open village approaches", active: "All shifts",
    behavior: "Patrols un-walled current lanes, braces a long trident against sea monsters, and drives danger away from nurseries.",
    lore: "Their three points stand for home, current and the stranger safely guided between them.",
    colors: [0x244b67, 0x83b9c9, 0xe4fff8], drops: [], family: "sentient", movement: "aquatic", aquatic: true, persistent: true,
    sentient: true, faction: "atlantians", culture: "atlantians", role: "guard", profession: "Trident Guard", tradeSpecialty: "Aquatic settlement defense",
    utility: "Fast underwater guard with a reach weapon.", discoveryHint: "Trident Guards patrol the glowing current markers outside town.",
  },
  "sugarcourt-crown-confectioner": {
    kind: "sugarcourt-crown-confectioner", name: "Sugarcourt Crown Confectioner", temperament: "Defensive", hostile: false,
    health: 20, damage: 4, xp: 0, speed: 0.68, chaseSpeed: 2.25, turnRate: 7, attackRange: 1.2,
    footOffset: 0.86, radius: 0.36, height: 1.42, habitat: "Sugar Palace halls in Sugarplum Vale Bonbon Boroughs", active: "Day and early evening",
    behavior: "Hears contracts beneath a spun-sugar crown, settles disputes by measured tasting, and directs borough defense when the candywall is threatened.",
    lore: "A Crown Confectioner's first duty is to know when sweetness has become excess.",
    colors: [0xd86e9d, 0xf8dfc5, 0xf7d16b], drops: [], family: "sentient", movement: "ground", persistent: true,
    sentient: true, faction: "sugarcourt", culture: "sugarcourt", role: "mayor", profession: "Crown Confectioner", tradeSpecialty: "Borough authority, contracts and trusted hires",
    utility: "Sugarcourt settlement leader and quest giver.", discoveryHint: "The tallest sugarbrick hall shelters a crown of translucent spun sugar.",
  },
  "sugarcourt-brittle-guard": {
    kind: "sugarcourt-brittle-guard", name: "Sugarcourt Brittle Guard", temperament: "Defensive", hostile: false,
    health: 22, damage: 7, xp: 0, speed: 0.76, chaseSpeed: 2.8, turnRate: 8, attackRange: 2.25,
    footOffset: 0.86, radius: 0.38, height: 1.48, habitat: "Sugarplum Vale hard-candy walls, gate arches and Brittle Barracks", active: "All shifts",
    behavior: "Patrols candybrick gates beside Taffy Hounds, braces a long Peppermint Pike, and cracks into formation rather than pursuing danger alone.",
    lore: "Their armor is tempered to flex once before it breaks, much like the oath beneath it.",
    colors: [0xb94e75, 0x83d8b4, 0x38283c], drops: [], family: "sentient", movement: "ground", persistent: true,
    sentient: true, faction: "sugarcourt", culture: "sugarcourt", role: "guard", profession: "Brittle Guard", tradeSpecialty: "Peppermint Pike training and borough defense",
    utility: "Reach-focused Sugarcourt defender.", discoveryHint: "Mint-striped pikes mark the gates of a Bonbon Borough.",
  },
  "sugarcourt-gumdrop-gardener": {
    kind: "sugarcourt-gumdrop-gardener", name: "Sugarcourt Gumdrop Gardener", temperament: "Gentle", hostile: false,
    health: 12, damage: 1, xp: 0, speed: 0.66, chaseSpeed: 1.9, turnRate: 7.5, attackRange: 0.85,
    footOffset: 0.86, radius: 0.34, height: 1.38, habitat: "Gumdrop gardens and peppermint terraces in Sugarplum Vale Bonbon Boroughs", active: "Dawn through dusk",
    behavior: "Prunes gumdrop bushes by color, turns cocoa soil, and pauses whenever a Bonbonwing needs the flower being tended.",
    lore: "Gardeners claim every gumdrop has a preferred direction to face. Their harvest rows make the claim difficult to dismiss.",
    colors: [0x72b878, 0xef8eba, 0x4b3146], drops: [], family: "sentient", movement: "ground", persistent: true,
    sentient: true, faction: "sugarcourt", culture: "sugarcourt", role: "farmer", profession: "Gumdrop Gardener", tradeSpecialty: "Peppermint, cocoa, gumdrops and planting stock",
    utility: "Sugarcourt crop and flora merchant.", discoveryHint: "Orderly rows of jewel-colored bushes lead to a Gumdrop Gardener.",
  },
  "sugarcourt-sweetbroker": {
    kind: "sugarcourt-sweetbroker", name: "Sugarcourt Sweetbroker", temperament: "Defensive", hostile: false,
    health: 13, damage: 2, xp: 0, speed: 0.67, chaseSpeed: 2, turnRate: 7, attackRange: 0.9,
    footOffset: 0.86, radius: 0.35, height: 1.4, habitat: "Sweet markets and syrup-lit kiosks in Sugarplum Vale Bonbon Boroughs", active: "Day and early evening",
    behavior: "Weighs arbitrary goods against a striped ledger, adjusts demand with local stock, and always keeps one sample where customers can see it.",
    lore: "A Sweetbroker can price anything except a recipe remembered from childhood.",
    colors: [0x8e67b5, 0xf0bd67, 0xffedca], drops: [], family: "sentient", movement: "ground", persistent: true,
    sentient: true, faction: "sugarcourt", culture: "sugarcourt", role: "merchant", profession: "Sweetbroker", tradeSpecialty: "General goods, finished candy and borough materials",
    utility: "Sugarcourt general merchant.", discoveryHint: "Striped awnings and brass candy scales mark the sweet market.",
  },
  "sugarcourt-kennelkeeper": {
    kind: "sugarcourt-kennelkeeper", name: "Sugarcourt Kennelkeeper", temperament: "Defensive", hostile: false,
    health: 15, damage: 2, xp: 0, speed: 0.69, chaseSpeed: 2.15, turnRate: 7.6, attackRange: 1,
    footOffset: 0.86, radius: 0.35, height: 1.42, habitat: "Sugarplum Vale taffy kennels, catteries and quiet borough courtyards", active: "Morning through dusk",
    behavior: "Tends faction hounds and cats, checks every collar twice, and sells only neutral youngsters prepared to choose their own keeper.",
    lore: "Kennelkeepers say a crest may be inherited, but companionship must never be.",
    colors: [0x68b9a5, 0xe98caf, 0x3d2d45], drops: [], family: "sentient", movement: "ground", persistent: true,
    sentient: true, faction: "sugarcourt", culture: "sugarcourt", role: "worker", profession: "Kennelkeeper", tradeSpecialty: "Neutral companion Capture Orbs and care food",
    utility: "Merchant for unaligned Taffy Hounds and Praline Cats.", discoveryHint: "Listen for collar tags and soft paws near the borough kennel yard.",
  },
  "sugarcourt-sugarboiler": {
    kind: "sugarcourt-sugarboiler", name: "Sugarcourt Sugarboiler", temperament: "Defensive", hostile: false,
    health: 15, damage: 3, xp: 0, speed: 0.65, chaseSpeed: 2.05, turnRate: 6.8, attackRange: 1,
    footOffset: 0.86, radius: 0.35, height: 1.43, habitat: "Copper-kettled Sugarworks in Sugarplum Vale Bonbon Boroughs", active: "Late morning through evening",
    behavior: "Keeps syrup at exact heat, cools potion candy on stone slabs, and snaps a kettle lid shut when danger enters the workshop.",
    lore: "A Sugarboiler judges temperature by sound: bubble, sigh, then the single clear note before a batch catches.",
    colors: [0xc87945, 0xf6ddbb, 0x72d2b2], drops: [], family: "sentient", movement: "ground", persistent: true,
    sentient: true, faction: "sugarcourt", culture: "sugarcourt", role: "alchemist", profession: "Sugarboiler", tradeSpecialty: "Syrup goods, potions and Sugarworks formulas",
    utility: "Sugarcourt potion and facility merchant.", discoveryHint: "Copper steam and slow amber bubbles mark an active Sugarworks.",
  },
  "sugarcourt-candysmith": {
    kind: "sugarcourt-candysmith", name: "Sugarcourt Candysmith", temperament: "Defensive", hostile: false,
    health: 18, damage: 5, xp: 0, speed: 0.68, chaseSpeed: 2.35, turnRate: 7.2, attackRange: 1.25,
    footOffset: 0.86, radius: 0.37, height: 1.45, habitat: "Tempering halls and Candysmith forges in Sugarplum Vale Bonbon Boroughs", active: "Day and evening",
    behavior: "Tempers candy alloy through repeated heat and cooling, tests every blade edge on sugar thread, and joins the guard when walls crack.",
    lore: "Candysmiths do not mind when visitors doubt their armor. They keep a hammer nearby for demonstrations.",
    colors: [0xc65a7f, 0xe9b5cd, 0x34313d], drops: [], family: "sentient", movement: "ground", persistent: true,
    sentient: true, faction: "sugarcourt", culture: "sugarcourt", role: "worker", profession: "Candysmith", tradeSpecialty: "Candy weapons, Sugarplate armor and blueprints",
    utility: "Sugarcourt equipment smith and blueprint merchant.", discoveryHint: "Rhythmic glassy hammer notes lead to the borough Candysmith.",
  },
  "fire-dragon": {
    kind: "fire-dragon", name: "Fire Dragon", temperament: "Hostile", hostile: true,
    health: 500, damage: 43, xp: 180, speed: 1.15, chaseSpeed: 4.8, turnRate: 2.6, attackRange: 4.7,
    footOffset: 0.75, radius: 2.55, height: 3.4, habitat: "Charred subterranean lairs beneath warm and temperate country", active: "All hours near a guarded lair",
    behavior: "Circles above intruders, rakes the ground with claws, and alternates a furnace-hot breath stream with arcing firebolts. Older dragons will abandon a chase to defend their hoard and eggs.",
    lore: "Fire Dragons sleep beneath heaps of softened gold. Every twenty-five days of age leaves a darker ring along their horns and a wider shadow over the lair mouth.",
    colors: [0x9d2f27, 0xe26a35, 0xffdf73], family: "dragon", movement: "flying", flying: true, ranged: true, persistent: true,
    dragonType: "fire", tameable: true, tameItems: [Item.RawDragonMeat, Item.CookedDragonMeat], breedable: true,
    breedingFoods: [Item.FireBreedingCatalyst], diet: [Item.RawMeat, Item.CookedMeat, Item.RawDragonMeat, Item.CookedDragonMeat],
    rideable: true, cargoChestLimit: 2, laysEggs: true,
    drops: [
      { item: Item.RawDragonMeat, min: 4, max: 30, chance: 1 }, { item: Item.FireDragonScale, min: 7, max: 60, chance: 1 },
      { item: Item.DragonBone, min: 6, max: 50, chance: 1 }, { item: Item.FireDragonSkull, min: 1, max: 1, chance: 1 },
      { item: Item.FireDragonHeart, min: 1, max: 1, chance: 0.82 },
    ],
    postTameNotes: "A stage-one hatchling bonds after three patient meat feeds and can ride on a shoulder. Stage three unlocks saddling, flight, armor, and two cargo chests. Z, X, and C direct melee, breath, and firebolt attacks while mounted.",
    secretHint: "Fire eggs stir only inside a sustained open flame, unless stabilized in a Draconic Incubator.",
    discoveryHint: "Merchants rarely sell a Fire Lair Survey; otherwise seek scorched cave vents and gold fused into stone.",
  },
  "ice-dragon": {
    kind: "ice-dragon", name: "Ice Dragon", temperament: "Hostile", hostile: true,
    health: 520, damage: 40, xp: 185, speed: 1.08, chaseSpeed: 4.55, turnRate: 2.8, attackRange: 4.8,
    footOffset: 0.75, radius: 2.62, height: 3.45, habitat: "Frozen subterranean lairs below Frostpine and high snowy country", active: "All hours near a guarded lair",
    behavior: "Uses cavern water and open air as one hunting space, slowing prey with a crystalline breath before launching long ice shards or diving into a claw strike.",
    lore: "An Ice Dragon does not merely endure winter; the oldest carry a private winter with them, writing frost across every surface they pass.",
    colors: [0x5d8cae, 0xa9d9e9, 0xf3ffff], family: "dragon", movement: "flying", flying: true, ranged: true, persistent: true,
    dragonType: "ice", tameable: true, tameItems: [Item.RawDragonMeat, Item.CookedDragonMeat], breedable: true,
    breedingFoods: [Item.IceBreedingCatalyst], diet: [Item.RawMeat, Item.CookedMeat, Item.RawFish, Item.RawDragonMeat, Item.CookedDragonMeat],
    rideable: true, cargoChestLimit: 2, laysEggs: true,
    drops: [
      { item: Item.RawDragonMeat, min: 4, max: 30, chance: 1 }, { item: Item.IceDragonScale, min: 7, max: 60, chance: 1 },
      { item: Item.DragonBone, min: 6, max: 50, chance: 1 }, { item: Item.IceDragonSkull, min: 1, max: 1, chance: 1 },
      { item: Item.IceDragonHeart, min: 1, max: 1, chance: 0.82 },
    ],
    postTameNotes: "A stage-one hatchling bonds after three patient meat feeds and can ride on a shoulder. Stage three unlocks saddling, flight, armor, and two cargo chests. Z, X, and C direct melee, freezing breath, and ice-shard attacks while mounted.",
    secretHint: "Ice eggs need freezing water around the shell, unless stabilized in a Draconic Incubator.",
    discoveryHint: "Merchants rarely sell an Ice Lair Survey; otherwise follow unnatural rime into deep Frostpine caves.",
  },
  "steel-dragon": {
    kind: "steel-dragon", name: "Steel Dragon", temperament: "Hostile", hostile: true,
    health: 570, damage: 41, xp: 205, speed: 0.98, chaseSpeed: 4.2, turnRate: 2.35, attackRange: 5,
    footOffset: 0.75, radius: 2.72, height: 3.55, habitat: "Ore-rich subterranean foundry lairs below mountains and badlands", active: "All hours near a guarded lair",
    behavior: "Builds pressure behind interlocking throat plates, scalds close targets with steam, and launches a forged metal spear across the full lair before closing with armored jaws and talons.",
    lore: "Steel Dragons are neither machines nor metal given life. Their scales simply learned the same lesson as a good blade: heat, pressure, patience, and an edge worth respecting.",
    colors: [0x56636b, 0x9aaab1, 0xe9fbff], family: "dragon", movement: "flying", flying: true, ranged: true, persistent: true,
    dragonType: "steel", tameable: true, tameItems: [Item.RawDragonMeat, Item.CookedDragonMeat], breedable: true,
    breedingFoods: [Item.SteelBreedingCatalyst], diet: [Item.RawMeat, Item.CookedMeat, Item.RawDragonMeat, Item.CookedDragonMeat],
    rideable: true, cargoChestLimit: 2, laysEggs: true,
    drops: [
      { item: Item.RawDragonMeat, min: 4, max: 30, chance: 1 }, { item: Item.SteelDragonScale, min: 7, max: 60, chance: 1 },
      { item: Item.DragonBone, min: 6, max: 50, chance: 1 }, { item: Item.SteelDragonSkull, min: 1, max: 1, chance: 1 },
      { item: Item.SteelDragonHeart, min: 1, max: 1, chance: 0.82 },
    ],
    postTameNotes: "A stage-one hatchling bonds after three patient meat feeds and can ride on a shoulder. Stage three unlocks saddling, flight, armor, and two cargo chests. Z, X, and C direct melee, steam breath, and the long-range metal spear while mounted.",
    secretHint: "Steel eggs wake where steam washes over heated metal, unless stabilized in a Draconic Incubator.",
    discoveryHint: "Merchants rarely sell a Steel Lair Survey; otherwise listen for hammerlike wingbeats in ore-rich depths.",
  },
  "sea-dragon": {
    kind: "sea-dragon", name: "Sea Dragon", temperament: "Hostile", hostile: true,
    health: 540, damage: 42, xp: 200, speed: 1.26, chaseSpeed: 6.2, turnRate: 2.9, attackRange: 5.2,
    footOffset: 0.75, radius: 2.7, height: 3.4, habitat: "Rare abyssal nests in deep oceans and Lumen Trenches", active: "All hours near a guarded nest",
    behavior: "Surges through water far faster than it flies, coils through reef arches, and fires a pressurized brine lance before closing with jaws and finned claws. It walks capably on shore but avoids long inland chases.",
    lore: "Its scales remember pressure. Older Sea Dragons carry dark bands for every depth they have mastered.",
    colors: [0x286f83, 0x55c4bf, 0xc9ffff], family: "dragon", movement: "amphibious", aquatic: true, flying: true, ranged: true, persistent: true,
    dragonType: "sea", tameable: true, tameItems: [Item.RawFish, Item.RawDragonMeat], breedable: true,
    breedingFoods: [Item.StarCoralShard], diet: [Item.RawFish, Item.CookedFish, Item.RawDragonMeat, Item.CookedDragonMeat],
    rideable: true, cargoChestLimit: 2, laysEggs: true,
    drops: [
      { item: Item.RawDragonMeat, min: 4, max: 30, chance: 1 }, { item: Item.SeaDragonScale, min: 7, max: 60, chance: 1 },
      { item: Item.DragonBone, min: 6, max: 50, chance: 1 }, { item: Item.SeaDragonSkull, min: 1, max: 1, chance: 1 },
      { item: Item.SeaDragonHeart, min: 1, max: 1, chance: 0.82 },
    ],
    postTameNotes: "Stage-three Sea Dragons accept a saddle. They swim fastest, run at a useful pace, and fly more slowly than Fire, Ice, or Steel dragons.",
    secretHint: "Sea eggs hatch only while fully submerged beside living coral, unless stabilized in a Draconic Incubator.",
    discoveryHint: "Atlantian Pearlbrokers rarely sell charts to the closest undiscovered deep-sea nest.",
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
  bonbonwing: {
    kind: "bonbonwing", name: "Bonbonwing", temperament: "Gentle", hostile: false,
    health: 1, damage: 0, xp: 0, speed: 1.42, chaseSpeed: 2.05, turnRate: 9.8, attackRange: 0,
    footOffset: 0.12, radius: 0.14, height: 0.19, habitat: "Lollipop Orchids and gumdrop clearings in the Sugarplum Vale", active: "Clear daylight",
    behavior: "Loops between candy flowers on four wrapper-shaped wings and rests only briefly before the next bright patch catches its attention.",
    lore: "Bonbonwings are living sweets: caught gently, one may be released again or eaten as a small traveling treat.",
    colors: [0xf08fbd, 0x51314d, 0xffed79], drops: [], family: "butterfly", movement: "flying", flying: true, captureItem: Item.BonbonwingTreat,
    utility: "A releasable and edible candy butterfly.", discoveryHint: "Search sunlit Lollipop Orchids in the Sugarplum Vale.",
  },
  "moonveil-wing": {
    kind: "moonveil-wing", name: "Moonveil Wing", temperament: "Gentle", hostile: false,
    health: 1, damage: 0, xp: 0, speed: 1.38, chaseSpeed: 2.1, turnRate: 9.6, attackRange: 0,
    footOffset: 0.12, radius: 0.14, height: 0.19, habitat: "Moonpetals and Starferns in the Glimmerwood", active: "Dusk and moonlit night",
    behavior: "Drifts between glowing plants and draws a soft crescent with each wingbeat.",
    lore: "Enclaves leave one Moonpetal unharvested for every Moonveil seen that week.",
    colors: [0x8d8bf3, 0x3b466e, 0xd9fff1], drops: [], family: "butterfly", movement: "flying", flying: true, captureItem: Item.FenLanternJar,
    utility: "A luminous Glimmerwood pollinator.", discoveryHint: "Wait beside Moonpetals after sunset in the Glimmerwood.",
  },
};

export const BUTTERFLY_ORDER: ButterflyKind[] = ["meadowwing", "azure-skippers", "embertip", "frostveil", "bloom-monarch", "fen-lantern", "bonbonwing", "moonveil-wing"];
export const LEGACY_MOB_ORDER: LegacyMobKind[] = ["mossling", "ridgeback", "woolhorn", "glowmoth", "shadecrawler", "caveblob", "rattlekin", "zombie"];
export const MOSSLING_VARIANT_ORDER: MosslingVariantKind[] = ["boglantern-mossling", "cindercone-mossling", "moonbloom-mossling"];
export const SURFACE_MOB_ORDER: SurfaceMobKind[] = [
  "sunstep-grazer", "pebbletortoise", "brambleboar", "petalfox", "emberbrush-fox", "moonpetal-fox", "duneclatter",
  "thimbledeer", "frostlace-hart", "reedcrown-deer", "lanternshell", "puddlehopper", "reedstrider", "wild-horse", "rimehoof-courser", "sunscar-courser",
  "mirestride-courser", "starbough-courser", "meadow-cow", "sunbloom-longhorn", "mistmane", "sakurakit", "sunwash-crab",
  "taffy-hound", "praline-cat", "rimecoat-hound", "bramblewhisk-cat", "sprinklebug", "taffalo",
];
export const BIRD_ORDER: BirdKind[] = ["emberjay", "canopy-lark", "tidewing-gull", "frostquill"];
export const AQUATIC_MOB_ORDER: AquaticMobKind[] = ["shoalfin", "coralback", "brookdart", "gloomfin", "silverthread", "reedneedle", "emberribbon", "cavefilament"];
export const POLLINATOR_ORDER: PollinatorKind[] = ["honeybee", "hive-queen", "reed-dragonfly"];
export const HEARTHROADS_WILDLIFE_ORDER: HearthroadsWildlifeKind[] = ["burrowbell", "dewback-tapir"];
export const HEARTHROADS_AQUATIC_ORDER: HearthroadsAquaticKind[] = ["redfin-salmon", "blue-mackerel", "deepwater-shark"];
export const TIDEGLASS_AQUATIC_ORDER: TideglassAquaticKind[] = [
  "tideglass-crab", "reefglide-terrapin", "glassfin", "lanternjaw", "abyss-skater", "dreadcoil", "tidepup", "worldshell-leviathan", "aetherbell-larva", "aetherbell-leviathan",
];
export const SUGARPLUM_AQUATIC_ORDER: SugarplumAquaticKind[] = ["syrupfin"];
export const DRAGON_ORDER: DragonKind[] = ["fire-dragon", "ice-dragon", "steel-dragon", "sea-dragon"];
export const HOBBIT_ORDER: HobbitKind[] = [
  "hobbit-mayor", "hobbit-farmer", "hobbit-miner", "hobbit-merchant", "hobbit-banker", "hobbit-hammer-guard", "hobbit-crossbow-guard",
];
export const GOBLIN_ORDER: GoblinKind[] = ["goblin-chieftain", "goblin-worker", "goblin-miner", "goblin-alchemist", "goblin-spear-guard"];
export const ATLANTIAN_ORDER: AtlantianKind[] = [
  "atlantian-tidewarden", "atlantian-kelpkeeper", "atlantian-coralwright", "atlantian-pearlbroker", "atlantian-glowmender", "atlantian-trident-guard",
];
export const SUGARCOURT_ORDER: SugarcourtKind[] = [
  "sugarcourt-crown-confectioner", "sugarcourt-gumdrop-gardener", "sugarcourt-sugarboiler", "sugarcourt-candysmith",
  "sugarcourt-sweetbroker", "sugarcourt-kennelkeeper", "sugarcourt-brittle-guard",
];
export const WOOD_ELF_ORDER: WoodElfKind[] = ["wood-elf-elderweaver", "wood-elf-leafwarden", "wood-elf-bow-warden", "wood-elf-grovekeeper", "wood-elf-tomekeeper", "wood-elf-potioner", "wood-elf-moonbroker"];
export const DWARF_ORDER: DwarfKind[] = ["dwarf-thane", "dwarf-gatewarden", "dwarf-delver", "dwarf-gearwright", "dwarf-golemsmith", "dwarf-powderwright", "dwarf-provisioner"];
export const V1_FACTION_CREATURE_ORDER: V1FactionCreatureKind[] = ["glimmerhart", "runeowl", "glowfin", "copper-mole", "copper-scout-golem", "stone-bulwark-golem", "aetherforged-sentinel", "deepgear-courser-golem"];
export const SENTIENT_MOB_ORDER: SentientMobKind[] = [...HOBBIT_ORDER, ...GOBLIN_ORDER, ...ATLANTIAN_ORDER, ...SUGARCOURT_ORDER, ...WOOD_ELF_ORDER, ...DWARF_ORDER];
export const SPECIAL_MOB_ORDER: SpecialMobKind[] = ["peelop", "reliquary-sentinel", "skeleton", "warg"];
export const CORE_MOB_ORDER: CoreMobKind[] = [
  ...LEGACY_MOB_ORDER,
  ...MOSSLING_VARIANT_ORDER,
  ...SURFACE_MOB_ORDER,
  ...BIRD_ORDER,
  ...AQUATIC_MOB_ORDER,
  ...POLLINATOR_ORDER,
  ...HEARTHROADS_WILDLIFE_ORDER,
  ...HEARTHROADS_AQUATIC_ORDER,
  ...TIDEGLASS_AQUATIC_ORDER,
  ...SUGARPLUM_AQUATIC_ORDER,
  ...V1_FACTION_CREATURE_ORDER,
  ...DRAGON_ORDER,
  ...SENTIENT_MOB_ORDER,
  ...SPECIAL_MOB_ORDER,
];
export const MOB_ORDER: MobKind[] = [...CORE_MOB_ORDER, ...BUTTERFLY_ORDER];
