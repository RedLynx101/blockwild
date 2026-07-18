import { CREATURE_TYPE_IDS, type CreatureTypeId, type TypedEffectPacket } from "./creature-types";

export type MoveChannel = "physical" | "magical" | "mixed" | "healing" | "control" | "traversal" | "field" | "stance";
export type MoveTargetRule = "self" | "ally" | "hostile" | "point" | "area";
export type MoveShape = "contact" | "line" | "cone" | "circle" | "arc" | "dash";
export type CreatureStatusId = "burning" | "chilled" | "soaked" | "shocked" | "rooted" | "poisoned" | "dazzled" | "veiled" | "fractured" | "hushed" | "inspired" | "guarded";
export type CreatureReactionId = "conductive" | "shatter" | "steamveil" | "brushfire" | "breach" | "revealed" | "broken-silence" | "concord";
export type MoveAiTag = "basic" | "opener" | "finisher" | "defense" | "support" | "mobility" | "control" | "signature" | "field-utility";

export type CreatureMoveDefinition = Readonly<{
  id: string;
  name: string;
  description: string;
  type: CreatureTypeId;
  packets: readonly TypedEffectPacket[];
  channel: MoveChannel;
  target: MoveTargetRule;
  shape: MoveShape;
  range: number;
  radius: number;
  verticalTolerance: number;
  windupSeconds: number;
  activeSeconds: number;
  recoverySeconds: number;
  cooldownSeconds: number;
  power: number;
  exertionCost: number;
  interruptible: boolean;
  superArmor: boolean;
  requiresLineOfSight: boolean;
  mountedUse: boolean;
  friendlyFire: boolean;
  worldImpact: "none" | "visual" | "soft";
  appliesStatus?: CreatureStatusId;
  statusDurationSeconds?: number;
  aiTags: readonly MoveAiTag[];
  telegraph: string;
  soundCue: string;
}>;

export type CreatureMoveUnlock = Readonly<{ moveId: string; level: number; bondTier?: "trusted" | "partnered" | "kindred" }>;
export type CreatureMoveSet = Readonly<{
  basicMoveId: string;
  unlocks: readonly CreatureMoveUnlock[];
  fieldUtilityMoveId: string;
  passiveStanceMoveId: string;
}>;

export type CreatureStatusDefinition = Readonly<{
  id: CreatureStatusId;
  name: string;
  description: string;
  maximumStacks: number;
  maximumDurationSeconds: number;
  harmful: boolean;
  typeStepModifiers?: Partial<Record<CreatureTypeId, number>>;
}>;

export type CreatureReactionDefinition = Readonly<{
  id: CreatureReactionId;
  name: string;
  setupStatus: CreatureStatusId;
  followupTypes: readonly CreatureTypeId[];
  followupChannels?: readonly MoveChannel[];
  consumesSetup: boolean;
  cooldownSeconds: number;
  description: string;
}>;

const typeTitle = (id: CreatureTypeId) => id.charAt(0).toUpperCase() + id.slice(1);
const tags = (...values: MoveAiTag[]) => Object.freeze(values);
const TYPE_VERBS: Readonly<Record<CreatureTypeId, readonly [string, string, string, string]>> = Object.freeze({
  neutral: ["Body Check", "Steady Rush", "Brace", "Forage Sense"],
  wild: ["Claw and Hoof", "Pack Rush", "Bristle Guard", "Trail Sense"],
  verdant: ["Vine Snap", "Briar Surge", "Rootguard", "Greenkeeping"],
  sky: ["Wing Buffet", "Gale Dive", "Updraft Veil", "Far Sight"],
  tide: ["Current Slap", "Riptide Rush", "Foamguard", "Waterfinding"],
  stone: ["Shell Bash", "Faultline Charge", "Bedrock Brace", "Ore Sense"],
  flame: ["Ember Bite", "Cinder Rush", "Heat Mantle", "Kindle"],
  frost: ["Rime Snap", "Hoarfrost Rush", "Iceguard", "Snowtrace"],
  storm: ["Static Jab", "Thunder Rush", "Stormguard", "Weather Sense"],
  metal: ["Iron Strike", "Gearline Charge", "Plate Guard", "Salvage Sense"],
  venom: ["Venom Nip", "Toxic Lunge", "Irritant Veil", "Toxin Sense"],
  radiant: ["Sunflash", "Dawn Rush", "Halo Guard", "Lantern Heart"],
  umbral: ["Shade Cut", "Gloam Rush", "Night Veil", "Dark Sight"],
  spirit: ["Soul Tap", "Ancestor Rush", "Memory Ward", "Spirit Sense"],
  arcane: ["Rune Bolt", "Sigil Rush", "Aegis Script", "Rune Reading"],
  draconic: ["Sovereign Claw", "Dragon Rush", "Scale Ward", "Ancient Sense"],
  confection: ["Sugar Snap", "Syrup Rush", "Candycoat", "Sweetfinding"],
  echo: ["Resonant Cry", "Soundbreak Rush", "Echo Ward", "Call Reading"],
  dream: ["Reverie Touch", "Dreamrush", "Lucid Veil", "Dreamsense"],
  hush: ["Silent Cut", "Null Rush", "Quiet Ward", "Silence Sense"],
  mirror: ["Glass Gleam", "Refraction Rush", "Mirror Ward", "Reflection Step"],
});

const TYPE_STATUS: Partial<Record<CreatureTypeId, CreatureStatusId>> = Object.freeze({
  flame: "burning", frost: "chilled", tide: "soaked", storm: "shocked", verdant: "rooted", venom: "poisoned",
  radiant: "dazzled", umbral: "veiled", stone: "fractured", hush: "hushed", spirit: "inspired", metal: "guarded",
});

function makeTypeMoves(type: CreatureTypeId): readonly CreatureMoveDefinition[] {
  const names = TYPE_VERBS[type];
  const status = TYPE_STATUS[type];
  const prefix = type;
  return Object.freeze([
    Object.freeze({
      id: `${prefix}-basic`, name: names[0], description: `A fast, readable ${typeTitle(type)}-aligned basic action.`, type,
      packets: Object.freeze([{ type, share: 1 }]), channel: type === "arcane" || type === "spirit" || type === "dream" ? "magical" : "physical",
      target: "hostile", shape: type === "sky" || type === "arcane" || type === "echo" ? "line" : "contact",
      range: type === "sky" || type === "arcane" || type === "echo" ? 5.5 : 1.65, radius: 0.55, verticalTolerance: 1.75,
      windupSeconds: 0.22, activeSeconds: 0.12, recoverySeconds: 0.32, cooldownSeconds: 0.8, power: 0.72, exertionCost: 0,
      interruptible: true, superArmor: false, requiresLineOfSight: true, mountedUse: true, friendlyFire: false, worldImpact: "none",
      aiTags: tags("basic"), telegraph: "Short body or casting tell", soundCue: `${type}-light`,
    }),
    Object.freeze({
      id: `${prefix}-surge`, name: names[1], description: `Commits to a stronger ${typeTitle(type)} attack with a clear windup.`, type,
      packets: Object.freeze([{ type, share: 1 }]), channel: type === "arcane" || type === "radiant" || type === "umbral" || type === "dream" ? "magical" : "physical",
      target: "hostile", shape: "dash", range: 4.5, radius: 0.85, verticalTolerance: 2,
      windupSeconds: 0.58, activeSeconds: 0.22, recoverySeconds: 0.68, cooldownSeconds: 5.2, power: 1.3, exertionCost: 14,
      interruptible: true, superArmor: false, requiresLineOfSight: true, mountedUse: true, friendlyFire: false, worldImpact: "visual",
      appliesStatus: status, statusDurationSeconds: status ? 4.5 : undefined,
      aiTags: tags("opener", "finisher", "mobility"), telegraph: `Gathering ${typeTitle(type)} motes and a planted stance`, soundCue: `${type}-surge`,
    }),
    Object.freeze({
      id: `${prefix}-guard`, name: names[2], description: `Adopts a brief ${typeTitle(type)} defensive stance.`, type,
      packets: Object.freeze([{ type, share: 1 }]), channel: "stance", target: "self", shape: "circle", range: 0, radius: 1.4, verticalTolerance: 1,
      windupSeconds: 0.34, activeSeconds: 1.6, recoverySeconds: 0.28, cooldownSeconds: 8, power: 0, exertionCost: 8,
      interruptible: true, superArmor: true, requiresLineOfSight: false, mountedUse: false, friendlyFire: false, worldImpact: "visual",
      appliesStatus: "guarded", statusDurationSeconds: 4,
      aiTags: tags("defense", "support"), telegraph: `Distinct ${typeTitle(type)} guard posture`, soundCue: `${type}-guard`,
    }),
    Object.freeze({
      id: `${prefix}-utility`, name: names[3], description: `A non-destructive ${typeTitle(type)} field skill used for exploration and creature work.`, type,
      packets: Object.freeze([{ type, share: 1 }]), channel: "field", target: "point", shape: "circle", range: 7, radius: 2.5, verticalTolerance: 3,
      windupSeconds: 0.4, activeSeconds: 0.8, recoverySeconds: 0.3, cooldownSeconds: 4, power: 0, exertionCost: 4,
      interruptible: true, superArmor: false, requiresLineOfSight: true, mountedUse: true, friendlyFire: false, worldImpact: "soft",
      aiTags: tags("field-utility", "support"), telegraph: `Small ${typeTitle(type)}-marked search ring`, soundCue: `${type}-utility`,
    }),
  ]);
}

type AuthoredMoveSheet = Readonly<{ types: readonly CreatureTypeId[]; moves: readonly string[] }>;

const FUNCTIONAL_FISH_MOVE_SHEETS: Readonly<Record<string, AuthoredMoveSheet>> = Object.freeze({
  shoalfin: { types: ["tide", "wild"], moves: ["Shoal Slip", "School Call", "Current Sense", "Silver Scatter"] },
  coralback: { types: ["tide", "stone"], moves: ["Reef Dash", "Coral Brace", "Color Display", "Comfort Circuit"] },
  brookdart: { types: ["tide", "wild"], moves: ["Brook Dash", "School Turn", "Water Sense", "Reed Shelter"] },
  gloomfin: { types: ["tide", "umbral"], moves: ["Shadow Slip", "Depth Sense", "Low Light", "Predator Warning"] },
  silverthread: { types: ["tide", "radiant"], moves: ["Thread Flash", "School Call", "Silver Display", "Current Weave"] },
  reedneedle: { types: ["tide", "verdant"], moves: ["Needle Slip", "Plant Pruning", "Water Sense", "Reed Veil"] },
  emberribbon: { types: ["tide", "flame"], moves: ["Ribbon Dash", "Heat Warning", "Ember Display", "Warm Current"] },
  cavefilament: { types: ["tide", "stone"], moves: ["Filament Fold", "Mineral Sense", "Low Light", "Cave School"] },
  "redfin-salmon": { types: ["tide", "wild"], moves: ["Rapid Leap", "Upstream Drive", "Water Sense", "Spawning Call"] },
  "blue-mackerel": { types: ["tide", "wild"], moves: ["Bluebolt Dash", "School Turn", "Predator Warning", "Openwater Circuit"] },
  glassfin: { types: ["tide", "mirror"], moves: ["Refraction Slip", "Mineral Sense", "Glass Display", "Clearwater Veil"] },
  lanternjaw: { types: ["tide", "radiant"], moves: ["Lantern Lunge", "Depth Sense", "Low Light", "Jawflash Warning"] },
  syrupfin: { types: ["tide", "confection"], moves: ["Syrup Skip", "Comfort Circuit", "Bait Shed", "Sweetwater Sense"] },
  glowfin: { types: ["tide", "radiant"], moves: ["Glow Slip", "Low Light", "School Call", "Lumen Display"] },
  "pocket-goldfish": { types: ["tide", "radiant"], moves: ["Pocket Dart", "Comfort Circuit", "Lineage Dance", "Sunscale Display"] },
  "sunwheel-angelfish": { types: ["tide", "radiant"], moves: ["Sunwheel Turn", "School Call", "Fin Display", "Reef Comfort"] },
  "stonewhisker-loach": { types: ["tide", "stone"], moves: ["Silt Slip", "Glass Clean", "Sediment Sense", "Algae Graze"] },
});

const SEA_SLUG_MOVE_SHEETS: Readonly<Record<string, AuthoredMoveSheet>> = Object.freeze({
  "sunset-sea-slug": { types: ["tide", "radiant"], moves: ["Sunset Ripple", "Mantle Flare", "Plant Pruning", "Dusk Display"] },
  "moonlace-sea-slug": { types: ["tide", "dream"], moves: ["Moonlace Drift", "Lace Veil", "Low Light", "Nocturnal Comfort"] },
  "blue-dragon-sea-slug": { types: ["tide", "venom"], moves: ["Bluewing Sail", "Cerata Warning", "Poison Sense", "Pelagic Display"] },
  "leafsheep-sea-slug": { types: ["tide", "verdant"], moves: ["Leafsheep Crawl", "Solar Fold", "Plant Pruning", "Water Clarity"] },
  "sea-bunny-nudibranch": { types: ["tide", "wild"], moves: ["Bunny Hop", "Rhinophore Curl", "Glass Clean", "Resident Comfort"] },
  "spanish-dancer-sea-slug": { types: ["tide", "radiant"], moves: ["Dancer Undulation", "Scarlet Fan", "Breeding Comfort", "Ribbon Display"] },
  "crystal-tipped-nudibranch": { types: ["tide", "stone"], moves: ["Crystal Crawl", "Shard Bristle", "Mineral Stabilizer", "Prism Display"] },
  "ringed-phyllidia": { types: ["tide", "venom"], moves: ["Ringed Crawl", "Warning Rings", "Poison Sense", "Algae Clean"] },
  "hooded-melibe": { types: ["tide", "wild"], moves: ["Hood Sweep", "Hood Closure", "Bait Shed", "Water Clarity"] },
  "sea-angel-slug": { types: ["tide", "sky"], moves: ["Angel Flutter", "Wing Fold", "Low Light", "Water Clarity"] },
  "embercrown-sea-slug": { types: ["tide", "flame"], moves: ["Ember Crawl", "Crown Flare", "Heat Warning", "Plant Pruning"] },
  "kelpwarden-sea-slug": { types: ["tide", "verdant"], moves: ["Kelp Crawl", "Frond Brace", "Plant Pruning", "Algae Clean"] },
  "starlight-choir-sea-slug": { types: ["tide", "echo"], moves: ["Choir Drift", "Silent Chorus", "Low Light", "School Comfort"] },
  "voidglass-sea-slug": { types: ["tide", "umbral"], moves: ["Void Crawl", "Glass Veil", "Mineral Stabilizer", "Poison Warning"] },
});

const AUTHORED_MOVE_SHEETS: Readonly<Record<string, AuthoredMoveSheet>> = Object.freeze({
  ...FUNCTIONAL_FISH_MOVE_SHEETS,
  ...SEA_SLUG_MOVE_SHEETS,
  petalfox: { types: ["wild", "verdant"], moves: ["Briar Pounce", "Petal Feint", "Pollen Hush", "Blossom Search"] },
  "emberbrush-fox": { types: ["wild", "flame"], moves: ["Cinder Pounce", "Petal Feint", "Ashnose Search", "Brushfire Veil"] },
  "moonpetal-fox": { types: ["wild", "dream"], moves: ["Dream Pounce", "Petal Feint", "Moonnose Search", "Pollen Hush"] },
  mossling: { types: ["verdant", "wild"], moves: ["Root Tangle", "Spore Puff", "Moss Mend", "Soil Restoration"] },
  "boglantern-mossling": { types: ["verdant", "tide", "radiant"], moves: ["Root Tangle", "Lantern Spore", "Moss Mend", "Wetbed Recovery"] },
  "cindercone-mossling": { types: ["verdant", "flame"], moves: ["Root Tangle", "Ash Spore", "Moss Mend", "Ashbed Recovery"] },
  "moonbloom-mossling": { types: ["verdant", "dream"], moves: ["Root Tangle", "Dream Spore", "Moss Mend", "Seed Gathering"] },
  emberjay: { types: ["sky", "flame"], moves: ["Cinder Cry", "Hostile Warning", "Perch Rest", "Scout Route"] },
  "canopy-lark": { types: ["sky", "verdant"], moves: ["Leafbeat", "Mature Tree Mark", "Perch Rest", "Canopy Scout"] },
  "tidewing-gull": { types: ["sky", "tide"], moves: ["Brine Dive", "Fishschool Mark", "Drop Retrieval", "Coast Scout"] },
  frostquill: { types: ["sky", "frost"], moves: ["Quill Flurry", "Storm Warning", "Perch Rest", "Snowline Scout"] },
  runeowl: { types: ["sky", "arcane", "dream"], moves: ["Rune Peck", "Magic Trail Sense", "Night Perch", "Dream Scout"] },
  puddlehopper: { types: ["wild", "tide"], moves: ["Springheel", "Croak Ward", "Mud Splash", "Seep Sense"] },
  burrowbell: { types: ["wild", "echo", "stone"], moves: ["Bell Bump", "Perimeter Bell", "Home Marker", "Ally Chime"] },
  woolhorn: { types: ["wild", "frost"], moves: ["Horn Brace", "Fleece Guard", "Herd Call", "Snow Insulation"] },
  "meadow-cow": { types: ["wild", "verdant"], moves: ["Clover Calm", "Herd Call", "Grazing Circuit", "Compost Drop"] },
  "sunstep-grazer": { types: ["wild", "radiant"], moves: ["Sunward Stomp", "Heat Endurance", "Herd Call", "Savanna Trail"] },
  ridgeback: { types: ["wild", "stone"], moves: ["Ridge Brace", "Pack Carry", "Stone Nudge", "Grounded Stand"] },
  mistmane: { types: ["wild", "dream"], moves: ["Mist Calm", "Fog Sense", "Herd Call", "Quiet Passage"] },
  pebbletortoise: { types: ["wild", "stone"], moves: ["Shell Brace", "Steadying Wake", "Stone Nudge", "Shellbed Tend"] },
  "reefglide-terrapin": { types: ["wild", "stone", "tide"], moves: ["Shell Brace", "Steadying Wake", "Stone Nudge", "Waterplant Tend"] },
  "grotto-grazer": { types: ["wild", "verdant"], moves: ["Root Graze", "Fiber Shake", "Glowroot Tend", "Grotto Brace"] },
  lanternray: { types: ["tide", "radiant", "sky"], moves: ["Lantern Sweep", "Living Light", "Cavern Glide", "Rescue Screen"] },
  "prismtail-swift": { types: ["sky", "stone", "arcane"], moves: ["Prism Dart", "Crystal Warning", "Tailflash", "Gallery Scout"] },
  "glassback-newt": { types: ["wild", "tide", "verdant"], moves: ["Newt Dash", "Gill Mend", "Plant Tend", "Water Warning"] },
  "sailfin-skimmer": { types: ["tide", "stone"], moves: ["Sail Dash", "Mineral Sense", "Fin Brace", "Water Warning"] },
  "ashnose-bat": { types: ["sky", "echo", "wild"], moves: ["Echo Nip", "Warm Cave Sense", "Guano Cycle", "Ceiling Rest"] },
  chimewing: { types: ["sky", "echo", "spirit"], moves: ["Chimebeat", "Opening Resonance", "Spirit Warning", "Cavern Scout"] },
  "cinder-kite": { types: ["sky", "flame", "stone"], moves: ["Cinder Swoop", "Pressure Warning", "Fumarole Sense", "Ash Glide"] },
  veinling: { types: ["metal", "stone"], moves: ["Seam Tap", "Ore Memory", "Unresolved Pulse", "Vein Sense"] },
  caveblob: { types: ["tide", "venom"], moves: ["Gel Slap", "Waste Process", "Containment Fold", "Acid Warning"] },
  rattlekin: { types: ["spirit", "stone"], moves: ["Bone Club", "Reliquary Rattle", "Seal Brace", "Dungeon Memory"] },
  skeleton: { types: ["spirit", "metal"], moves: ["Nocked Shot", "Bone Guard", "Reliquary Rattle", "Dungeon Memory"] },
  zombie: { types: ["spirit", "umbral"], moves: ["Grave Swipe", "Rotten Guard", "Containment Groan", "Dungeon Memory"] },
  "wild-horse": { types: ["wild"], moves: ["Hoof Check", "Trail Canter", "Herd Call", "Steady Gallop"] },
  "rimehoof-courser": { types: ["wild", "frost"], moves: ["Rime Hoof", "Snow Canter", "Frost Guard", "Ice Confidence"] },
  "sunscar-courser": { types: ["wild", "flame"], moves: ["Sunscar Kick", "Dune Canter", "Heat Guard", "Sand Confidence"] },
  "mirestride-courser": { types: ["wild", "tide"], moves: ["Mire Hoof", "Bog Canter", "Mud Guard", "Wetland Confidence"] },
  "starbough-courser": { types: ["wild", "dream"], moves: ["Star Hoof", "Dream Canter", "Moon Guard", "Glimmer Confidence"] },
  "deepgear-courser-golem": { types: ["metal", "storm"], moves: ["Rivet Hoof", "Charge Canter", "Aether Guard", "Chassis Calibration"] },
  reedstrider: { types: ["wild", "tide"], moves: ["Reed Kick", "Wading Step", "Wing Screen", "Shallowwater Sense"] },
  warg: { types: ["wild", "umbral"], moves: ["Mounted Bite", "Road Scent", "Pack Howl", "Shadow Pursuit"] },
  taffalo: { types: ["wild", "confection"], moves: ["Taffy Shove", "Cargo Brace", "Group Comfort", "Sweetroad Trudge"] },
  "meadow-cottontail": { types: ["wild"], moves: ["Burrow Hop", "Garden Sense", "Soft Warning", "Companion Rest"] },
  "russet-rabbit": { types: ["wild"], moves: ["Russet Hop", "Burrow Sense", "Garden Nibble", "Companion Rest"] },
  "frost-hare": { types: ["wild", "frost"], moves: ["Snow Hop", "Storm Warning", "Burrow Sense", "Companion Rest"] },
  "chocolate-bunny": { types: ["wild", "confection"], moves: ["Cocoa Hop", "Sweet Comfort", "Burrow Sense", "Companion Rest"] },
  "praline-cat": { types: ["wild", "confection"], moves: ["Soft Pounce", "Pest Sense", "Stealth Step", "Hearth Comfort"] },
  "bramblewhisk-cat": { types: ["wild", "verdant"], moves: ["Briar Pounce", "Pest Sense", "Stealth Step", "Hearth Comfort"] },
  "taffy-hound": { types: ["wild", "confection"], moves: ["Guard Bark", "Trail Scent", "Drop Retrieval", "Hearth Comfort"] },
  "rimecoat-hound": { types: ["wild", "frost"], moves: ["Guard Bark", "Snow Scent", "Drop Retrieval", "Storm Warning"] },
  "copper-mole": { types: ["wild", "stone", "metal"], moves: ["Copper Claw", "Ore Chirp", "Burrow Sense", "Tunnel Brace"] },
  tidepup: { types: ["wild", "tide"], moves: ["Tide Nip", "Dive Fetch", "Rescue Tow", "Current Warning"] },
  peelop: { types: ["wild", "confection"], moves: ["Peelop Bonk", "Sugar Shed", "Companion Cheer", "Soft Roll"] },
  "copper-scout-golem": { types: ["metal", "storm"], moves: ["Copper Jab", "Survey Pulse", "Core Guard", "Chassis Calibration"] },
  "stone-bulwark-golem": { types: ["metal", "stone"], moves: ["Bulwark Slam", "Rampart Guard", "Anchor Step", "Chassis Calibration"] },
  "aetherforged-sentinel": { types: ["metal", "arcane"], moves: ["Aether Lance", "Ward Screen", "Threat Sense", "Chassis Calibration"] },
  "clockwork-hound-golem": { types: ["metal", "wild"], moves: ["Clockwork Bite", "Track Signal", "Core Guard", "Chassis Calibration"] },
  "webspinner-golem": { types: ["metal", "venom"], moves: ["Web Bolt", "Loom Snare", "Core Guard", "Chassis Calibration"] },
  "thornhide-trufflehog": { types: ["wild", "verdant"], moves: ["Snuffle", "Root Toss", "Bramble Brace", "Truffle Trail"] },
  "orchard-glider": { types: ["wild", "sky"], moves: ["Canopy Leap", "Seed Carry", "Fruitmark Call", "Slipstream"] },
  "petalmask-tanuki": { types: ["wild", "dream", "verdant"], moves: ["False Trail", "Petal Feint", "Moonmask", "Borrowed Scent"] },
  "ironbeak-magpie": { types: ["sky", "metal", "wild"], moves: ["Shiny Lure", "Peck", "Cachemark", "Snatch and Return"] },
  "hearthback-badger": { types: ["wild", "stone"], moves: ["Dig", "Root Rake", "Burrow Guard", "Hearthstand"] },
  "sunfoil-pangolin": { types: ["wild", "metal", "radiant"], moves: ["Tongue Flick", "Scale Curl", "Sunfoil Flash", "Mound Break"] },
  "glassstep-jerboa": { types: ["wild", "stone"], moves: ["Sand Skip", "Burrow Sense", "Glassstep", "Dust Decoy"] },
  "stormcrest-ibex": { types: ["wild", "stone", "storm"], moves: ["Horn Check", "Cliffstep", "Static Coat", "Fall Rescue"] },
  "cindercoil-gecko": { types: ["wild", "flame", "stone"], moves: ["Heat Sense", "Ember Spit", "Wall Cling", "Kiln Nap"] },
  "cloudkite-pika": { types: ["wild", "sky", "echo"], moves: ["Wind Chime", "Updraft Pulse", "Warning Whistle", "Soft Landing"] },
  "briarclaw-lynx": { types: ["wild", "verdant"], moves: ["Stalk", "Briar Pounce", "Rake", "Vanish into Cover"] },
  "gravebell-jackal": { types: ["wild", "spirit", "umbral"], moves: ["Grave Scent", "Bell Howl", "Spirit Nip", "Relic Guard"] },
  "cragglass-basilisk": { types: ["wild", "stone", "arcane"], moves: ["Heavy Bite", "Glass Gaze", "Stonewake", "Reflective Molt"] },
  "stormglass-roclet": { types: ["sky", "storm", "stone"], moves: ["Gust Peck", "Static Wing", "Carry Rescue", "Thunder Dive"] },
  "brinewhisk-otter": { types: ["wild", "tide"], moves: ["Shell Toss", "Dive Fetch", "Playful Feint", "Rescue Tow"] },
  "riverwright-beaver": { types: ["wild", "tide", "verdant"], moves: ["Log Carry", "Tail Slap", "Current Read", "Lodge Mend"] },
  "mirecrown-crane": { types: ["sky", "tide", "verdant"], moves: ["Reed Call", "Cleansing Step", "Wing Screen", "Pond Sense"] },
  "inkveil-cuttle": { types: ["tide", "umbral", "dream"], moves: ["Ink Cloud", "Colorveil", "Jet Dash", "False Silhouette"] },
  "prismclaw-mantis-shrimp": { types: ["tide", "stone", "radiant"], moves: ["Prism Punch", "Shell Brace", "Crack Finder", "Flashburst"] },
  "reefmender-shrimp": { types: ["tide", "verdant", "radiant"], moves: ["Clean", "Mend Gill", "Alarm Flick", "Coral Tend"] },
  "currentweaver-eel": { types: ["tide", "storm"], moves: ["Current Coil", "Charge Drink", "Arc Snap", "Lamp Link"] },
  "shellcarrier-hermit": { types: ["wild", "tide", "stone"], moves: ["Shell Swap", "Scuttle", "Sand Sift", "Satchel Brace"] },
  "wreckwhistle-porpoise": { types: ["wild", "tide", "echo"], moves: ["Wrecksong", "Wake Dash", "Rescue Lift", "Pod Call"] },
  "kilnscale-salamander": { types: ["wild", "flame", "stone"], moves: ["Warmth Field", "Emberlick", "Fumarole Vent", "Cooled Skin"] },
  "sporeback-gardener": { types: ["verdant", "wild", "venom"], moves: ["Spore Sow", "Compost", "Mycelial Mend", "Puff Screen"] },
  "voidmantle-ray": { types: ["sky", "umbral", "tide"], moves: ["Lumen Feed", "Silent Glide", "Mantle Screen", "Abyssal Sweep"] },
  "fossilback-trilobite": { types: ["stone", "tide", "wild"], moves: ["Sediment Sense", "Curl", "Fossil Tap", "Ancient Wake"] },
  "ilyr-virebloom": { types: ["verdant", "tide", "dream", "radiant", "spirit"], moves: ["Springstep", "Antler Orchard", "Dreaming Rain", "Sanctuary Charge", "Root of Mercy"] },
  thalassene: { types: ["tide", "stone", "verdant", "radiant"], moves: ["Reefwall", "Current Cathedral", "Sunlit Breach", "Cleaning Tide", "Deep Roll"] },
  orichalc: { types: ["metal", "stone", "spirit"], moves: ["Faultline Hand", "Ore Memory", "Rivet Rain", "Unfinished Heart"] },
  "varkesh-stormmane": { types: ["sky", "storm", "wild"], moves: ["Roadless Gale", "Thunder Dive", "Cloud Carry", "Beacon Cry"] },
  kharza: { types: ["wild", "umbral", "metal"], moves: ["Banner Rend", "Packbreak Howl", "Chain Leap", "Red Pursuit"] },
  "sugarwake-sovereign": { types: ["confection", "arcane", "flame", "dream", "draconic"], moves: ["Caramel Rampart", "Festival Flare", "Ribbon Charge", "Tempering Song"] },
  asterjaw: { types: ["sky", "radiant", "spirit"], moves: ["Meridian Scent", "Roadless Leap", "Starbite", "Homeward Arc"] },
  "vellum-warden": { types: ["arcane", "dream", "spirit"], moves: ["Margin Guard", "Redline", "Borrowed Clause", "Blank Page"] },
  "choir-of-one": { types: ["hush", "echo", "umbral"], moves: ["Quiet Measure", "Answering Note", "Unsaid Step", "Final Rest"] },
  "glasswake-stag": { types: ["mirror", "tide", "dream"], moves: ["Refracted Charge", "Wakeglass Screen", "Tide Through Air", "Second Shore"] },
});

const slug = (value: string) => value.toLocaleLowerCase().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
const supportWords = /guard|brace|screen|wall|coat|molt|skin|curl|stand|rampart/iu;
const healingWords = /mend|clean|mercy|rescue|rest|landing|tend|cathedral/iu;
const utilityWords = /sense|scent|trail|finder|mark|read|carry|fetch|call|song|memory|compost|link|sift|swap|tow|lift|page|warning|search|scout|perch|rest|comfort|clean|clarity|pruning|stabilizer|display|light|cycle|tend|retrieval|calibration|confidence|hush|chirp|gathering|shed|home marker/iu;
const mobilityWords = /leap|step|dash|glide|charge|dive|scuttle|pursuit|wake/iu;

function authoredMovesForSheet(kind: string, sheet: AuthoredMoveSheet): readonly CreatureMoveDefinition[] {
  return Object.freeze(sheet.moves.map((name, index) => {
    const type = sheet.types[index % sheet.types.length] ?? "neutral";
    const support = supportWords.test(name);
    const healing = healingWords.test(name);
    const utility = utilityWords.test(name);
    const mobility = mobilityWords.test(name);
    const last = index === sheet.moves.length - 1;
    const channel: MoveChannel = healing ? "healing" : support ? "stance" : utility && !mobility ? "field" : index % 3 === 2 ? "magical" : "physical";
    const target: MoveTargetRule = healing ? "ally" : support ? "self" : utility && !mobility ? "point" : "hostile";
    const damaging = target === "hostile";
    const signature = sheet.moves.length > 4 ? last : index === 2;
    return Object.freeze({
      id: `${kind}--${slug(name)}`, name,
      description: `An authored ${typeTitle(type)} technique belonging to ${kind.replaceAll("-", " ")}.`, type,
      packets: Object.freeze([{ type, share: 1 }]), channel, target,
      shape: support || healing ? "circle" : mobility ? "dash" : index % 2 ? "line" : "contact",
      range: target === "self" ? 0 : utility ? 7 : mobility ? 4.8 : index % 2 ? 5.4 : 1.75,
      radius: support || healing ? 2.4 : utility ? 2.2 : .72,
      verticalTolerance: mobility || utility ? 3.4 : 1.9,
      windupSeconds: damaging ? .25 + index * .1 : .32,
      activeSeconds: damaging ? .16 + Math.min(.16, index * .03) : .72,
      recoverySeconds: damaging ? .34 + index * .09 : .3,
      cooldownSeconds: index === 0 ? 1.05 : 4.2 + index * 1.5,
      power: damaging ? .72 + index * .18 : 0,
      exertionCost: mobility ? 12 : signature ? 10 : 4,
      interruptible: !support, superArmor: support, requiresLineOfSight: target !== "self",
      mountedUse: mobility || index === 0, friendlyFire: false, worldImpact: utility ? "soft" : damaging ? "visual" : "none",
      appliesStatus: healing ? "inspired" : support ? "guarded" : TYPE_STATUS[type],
      statusDurationSeconds: healing || support ? 5 : TYPE_STATUS[type] ? 4 : undefined,
      aiTags: tags(index === 0 ? "basic" : signature ? "signature" : mobility ? "mobility" : support ? "defense" : utility ? "field-utility" : "control", ...(healing ? ["support" as const] : [])),
      telegraph: `${name} begins with a distinct ${typeTitle(type)} posture and color-independent silhouette change.`,
      soundCue: `${kind}-${slug(name)}`,
    });
  }));
}

const AUTHORED_MOVE_LIST = Object.freeze(Object.entries(AUTHORED_MOVE_SHEETS).flatMap(([kind, sheet]) => authoredMovesForSheet(kind, sheet)));

const GENERATED_MOVES = CREATURE_TYPE_IDS.flatMap((type) => makeTypeMoves(type));
export const CREATURE_MOVES: Readonly<Record<string, CreatureMoveDefinition>> = Object.freeze(Object.fromEntries([...GENERATED_MOVES, ...AUTHORED_MOVE_LIST].map((move) => [move.id, move])));
export const CREATURE_MOVE_IDS = Object.freeze(Object.keys(CREATURE_MOVES));

export const CREATURE_STATUSES: Readonly<Record<CreatureStatusId, CreatureStatusDefinition>> = Object.freeze({
  burning: { id: "burning", name: "Burning", description: "Takes bounded heat damage and becomes vulnerable to Tide relief.", maximumStacks: 3, maximumDurationSeconds: 12, harmful: true, typeStepModifiers: { flame: -1, tide: 1 } },
  chilled: { id: "chilled", name: "Chilled", description: "Slower recovery; blunt or Stone impacts can Shatter the chill.", maximumStacks: 2, maximumDurationSeconds: 10, harmful: true },
  soaked: { id: "soaked", name: "Soaked", description: "Enables one Conductive arc and dampens Burning.", maximumStacks: 2, maximumDurationSeconds: 12, harmful: false, typeStepModifiers: { storm: 1, flame: -1 } },
  shocked: { id: "shocked", name: "Shocked", description: "Briefly disrupts move windups.", maximumStacks: 2, maximumDurationSeconds: 6, harmful: true },
  rooted: { id: "rooted", name: "Rooted", description: "Restricts translation while preserving turning and defensive actions.", maximumStacks: 1, maximumDurationSeconds: 5, harmful: true },
  poisoned: { id: "poisoned", name: "Poisoned", description: "Bounded damage over time that cannot finish protected story actors.", maximumStacks: 3, maximumDurationSeconds: 14, harmful: true },
  dazzled: { id: "dazzled", name: "Dazzled", description: "Reduces target confidence and ranged accuracy.", maximumStacks: 1, maximumDurationSeconds: 6, harmful: true },
  veiled: { id: "veiled", name: "Veiled", description: "Harder to target at range until Radiant or Echo reveals it.", maximumStacks: 1, maximumDurationSeconds: 8, harmful: false },
  fractured: { id: "fractured", name: "Fractured", description: "The next suitable physical hit can Breach part of Guard.", maximumStacks: 2, maximumDurationSeconds: 10, harmful: true },
  hushed: { id: "hushed", name: "Hushed", description: "Suppresses Echo and prolonged casting until broken.", maximumStacks: 1, maximumDurationSeconds: 7, harmful: true },
  inspired: { id: "inspired", name: "Inspired", description: "The next signature move gains a modest cooldown refund.", maximumStacks: 1, maximumDurationSeconds: 15, harmful: false },
  guarded: { id: "guarded", name: "Guarded", description: "Raises physical and magical mitigation without granting immunity.", maximumStacks: 2, maximumDurationSeconds: 8, harmful: false },
});

export const CREATURE_REACTIONS: readonly CreatureReactionDefinition[] = Object.freeze([
  { id: "conductive", name: "Conductive", setupStatus: "soaked", followupTypes: ["storm"], consumesSetup: false, cooldownSeconds: 4, description: "One bounded nearby arc, then Soaked loses one stack." },
  { id: "shatter", name: "Shatter", setupStatus: "chilled", followupTypes: ["stone"], followupChannels: ["physical"], consumesSetup: true, cooldownSeconds: 5, description: "Adds stagger, never a universal damage explosion." },
  { id: "steamveil", name: "Steamveil", setupStatus: "burning", followupTypes: ["tide"], consumesSetup: true, cooldownSeconds: 3, description: "Removes Burning and creates a brief obscuring steam tell." },
  { id: "brushfire", name: "Brushfire", setupStatus: "rooted", followupTypes: ["flame"], consumesSetup: true, cooldownSeconds: 6, description: "Ends Rooted and creates a small bounded Flame pulse." },
  { id: "breach", name: "Breach", setupStatus: "fractured", followupTypes: ["neutral", "metal"], followupChannels: ["physical", "mixed"], consumesSetup: true, cooldownSeconds: 4, description: "Ignores part of Guard for one hit." },
  { id: "revealed", name: "Revealed", setupStatus: "veiled", followupTypes: ["radiant", "echo"], consumesSetup: true, cooldownSeconds: 4, description: "Ends concealment and briefly preserves tracking." },
  { id: "broken-silence", name: "Broken Silence", setupStatus: "hushed", followupTypes: ["storm", "wild"], consumesSetup: true, cooldownSeconds: 5, description: "Ends Hush with a readable sound burst." },
  { id: "concord", name: "Concord", setupStatus: "inspired", followupTypes: [...CREATURE_TYPE_IDS], consumesSetup: true, cooldownSeconds: 8, description: "A signature move receives a modest cooldown refund." },
]);

export function defaultMoveSetForTypes(naturalTypes: readonly CreatureTypeId[]): CreatureMoveSet {
  const primary = naturalTypes[0] ?? "neutral";
  const secondary = naturalTypes[1] ?? (primary === "neutral" ? "wild" : "neutral");
  const unique = (ids: readonly string[]) => [...new Set(ids)];
  const unlocks = unique([
    `${primary}-basic`, `${primary}-surge`, `${secondary}-basic`, `${primary}-guard`, `${secondary}-surge`, `${secondary}-guard`,
  ]).map((moveId, index) => Object.freeze({ moveId, level: [1, 5, 10, 18, 28, 40][Math.min(index, 5)] }));
  return Object.freeze({
    basicMoveId: `${primary}-basic`,
    unlocks: Object.freeze(unlocks),
    fieldUtilityMoveId: `${primary}-utility`,
    passiveStanceMoveId: `${primary}-guard`,
  });
}

export function authoredMoveSetForKind(kind: string): CreatureMoveSet | null {
  const sheet = AUTHORED_MOVE_SHEETS[kind];
  if (!sheet) return null;
  const ids = sheet.moves.map((name) => `${kind}--${slug(name)}`);
  return Object.freeze({
    basicMoveId: ids[0],
    unlocks: Object.freeze(ids.map((moveId, index) => Object.freeze({ moveId, level: [1, 5, 10, 18, 28, 40][Math.min(index, 5)] }))),
    fieldUtilityMoveId: ids.find((id) => CREATURE_MOVES[id]?.aiTags.includes("field-utility")) ?? ids[ids.length - 1],
    passiveStanceMoveId: ids.find((id) => CREATURE_MOVES[id]?.aiTags.includes("defense")) ?? ids[0],
  });
}

export function learnedMovesAtLevel(moveSet: CreatureMoveSet, level: number, bondTier: "wary" | "familiar" | "trusted" | "partnered" | "kindred" = "wary") {
  const bondRank = { wary: 0, familiar: 1, trusted: 2, partnered: 3, kindred: 4 } as const;
  return Object.freeze(moveSet.unlocks
    .filter((unlock) => level >= unlock.level && (!unlock.bondTier || bondRank[bondTier] >= bondRank[unlock.bondTier]))
    .map((unlock) => unlock.moveId));
}

export function selectAiLoadout(moveSet: CreatureMoveSet, level: number) {
  const learned = learnedMovesAtLevel(moveSet, level);
  return Object.freeze([...learned].sort((left, right) => {
    const leftBasic = CREATURE_MOVES[left]?.aiTags.includes("basic") ? 1 : 0;
    const rightBasic = CREATURE_MOVES[right]?.aiTags.includes("basic") ? 1 : 0;
    return rightBasic - leftBasic || (CREATURE_MOVES[right]?.power ?? 0) - (CREATURE_MOVES[left]?.power ?? 0);
  }).slice(0, 4));
}

export function validateCreatureMoveRegistry() {
  const errors: string[] = [];
  const ids = Object.keys(CREATURE_MOVES);
  if (new Set(ids).size !== ids.length) errors.push("Move ids must be unique.");
  for (const move of Object.values(CREATURE_MOVES)) {
    if (!move.name.trim() || !move.telegraph.trim() || !move.soundCue.trim()) errors.push(`${move.id} lacks readable presentation.`);
    if (move.windupSeconds < 0.15 && move.power > 1) errors.push(`${move.id} deals strong damage without a readable windup.`);
    if (move.activeSeconds <= 0 || move.cooldownSeconds < 0) errors.push(`${move.id} has invalid timing.`);
    if (!move.packets.length || move.packets.some((packet) => packet.share <= 0)) errors.push(`${move.id} has invalid typed packets.`);
  }
  return Object.freeze(errors);
}
