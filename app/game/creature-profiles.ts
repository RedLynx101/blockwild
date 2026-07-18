import { authoredMoveSetForKind, defaultMoveSetForTypes, type CreatureMoveSet } from "./creature-moves";
import { creatureStatProfile, type CreatureStatProfile } from "./creature-stats";
import { CREATURE_TYPES, resolveCreatureTypes, type CreatureTypeId, type CreatureTypeSource } from "./creature-types";
import { MOB_DEFS, MOB_ORDER, type MobDefinition, type MobKind } from "./mobs";

export type CaptureProfileId = "open" | "gentle" | "pursuit" | "armored" | "territorial" | "aquatic" | "resonant" | "rescue" | "legendary" | "uncapturable";
export type EcologyRole = "grazer" | "browser" | "predator" | "scavenger" | "pollinator" | "seed-spreader" | "reef-helper" | "filter-feeder" | "burrower" | "sentinel" | "construct" | "citizen" | "mount" | "companion" | "ambient" | "boss";

export type CreatureProfile = Readonly<{
  kind: MobKind;
  naturalTypes: readonly CreatureTypeId[];
  stats: CreatureStatProfile;
  moves: CreatureMoveSet;
  captureProfile: CaptureProfileId;
  ecologyRoles: readonly EcologyRole[];
  researchClues: readonly string[];
}>;

const EXACT_TYPES: Readonly<Partial<Record<MobKind, readonly CreatureTypeId[]>>> = Object.freeze({
  mossling: ["verdant", "wild"], "boglantern-mossling": ["verdant", "radiant"], "cindercone-mossling": ["verdant", "flame"], "moonbloom-mossling": ["verdant", "dream"],
  ridgeback: ["stone", "wild"], woolhorn: ["wild", "frost"], glowmoth: ["radiant", "sky"], shadecrawler: ["umbral", "venom"], caveblob: ["tide", "umbral"], rattlekin: ["spirit", "neutral"], zombie: ["umbral", "spirit"],
  "sunstep-grazer": ["radiant", "wild"], pebbletortoise: ["stone", "wild"], brambleboar: ["verdant", "wild"], petalfox: ["verdant", "wild"], "emberbrush-fox": ["flame", "wild"], "moonpetal-fox": ["dream", "wild"],
  duneclatter: ["stone", "wild"], thimbledeer: ["verdant", "wild"], "frostlace-hart": ["frost", "wild"], "reedcrown-deer": ["tide", "verdant"], lanternshell: ["radiant", "stone"], puddlehopper: ["tide", "wild"], reedstrider: ["tide", "sky"],
  "wild-horse": ["wild"], "rimehoof-courser": ["frost", "wild"], "sunscar-courser": ["flame", "wild"], "mirestride-courser": ["tide", "verdant"], "starbough-courser": ["dream", "verdant"],
  "meadow-cow": ["wild"], "sunbloom-longhorn": ["radiant", "wild"], mistmane: ["dream", "wild"], sakurakit: ["verdant", "dream"], "sunwash-crab": ["tide", "stone"], taffalo: ["confection", "wild"],
  "deepgear-courser-golem": ["metal", "storm"], "clockwork-hound-golem": ["metal", "wild"], "webspinner-golem": ["metal", "venom"], "copper-scout-golem": ["metal", "storm"], "stone-bulwark-golem": ["metal", "stone"], "aetherforged-sentinel": ["metal", "arcane"],
  emberjay: ["flame", "sky"], "canopy-lark": ["verdant", "sky"], "tidewing-gull": ["tide", "sky"], frostquill: ["frost", "sky"],
  honeybee: ["verdant", "wild"], "hive-queen": ["verdant", "radiant"], "reed-dragonfly": ["tide", "sky"], "lightning-bug": ["radiant", "storm"],
  "worldshell-leviathan": ["stone", "tide"], "aetherbell-larva": ["radiant", "tide"], "aetherbell-leviathan": ["radiant", "arcane"],
  "fire-dragon": ["draconic", "flame"], "ice-dragon": ["draconic", "frost"], "steel-dragon": ["draconic", "metal"], "sea-dragon": ["draconic", "tide"], "gold-dragon": ["draconic", "radiant"], "silver-dragon": ["draconic", "arcane"],
  glimmerhart: ["radiant", "spirit"], runeowl: ["arcane", "sky"], glowfin: ["radiant", "tide"], "copper-mole": ["metal", "stone"],
  peelop: ["verdant", "wild"], "reliquary-sentinel": ["spirit", "metal"], skeleton: ["spirit", "neutral"], warg: ["umbral", "wild"],
  "grotto-grazer": ["stone", "wild"], lanternray: ["radiant", "sky"], "prismtail-swift": ["mirror", "sky"], "glassback-newt": ["tide", "stone"], "sailfin-skimmer": ["tide", "sky"], "ashnose-bat": ["echo", "umbral"], chimewing: ["echo", "sky"], "cinder-kite": ["flame", "sky"], veinling: ["metal", "spirit"],
  "auric-scarab": ["metal", "radiant"], rootwrithe: ["verdant", "venom"], "bellroot-matron": ["verdant", "echo"], vaultwing: ["umbral", "sky"], "cinder-maw": ["flame", "stone"], "ossuary-keeper": ["spirit", "stone"], "mossback-kite": ["verdant", "sky"], "clockwork-marmot": ["metal", "wild"], "inkmaw-curator": ["umbral", "arcane"],
  bonbonwing: ["confection", "sky"], "moonveil-wing": ["dream", "sky"],
  "thornhide-trufflehog": ["wild", "verdant"], "orchard-glider": ["wild", "sky"], "petalmask-tanuki": ["wild", "dream", "verdant"],
  "ironbeak-magpie": ["sky", "metal", "wild"], "hearthback-badger": ["wild", "stone"], "sunfoil-pangolin": ["wild", "metal", "radiant"],
  "glassstep-jerboa": ["wild", "stone"], "stormcrest-ibex": ["wild", "stone", "storm"], "cindercoil-gecko": ["wild", "flame", "stone"],
  "cloudkite-pika": ["wild", "sky", "echo"], "briarclaw-lynx": ["wild", "verdant"], "gravebell-jackal": ["wild", "spirit", "umbral"],
  "cragglass-basilisk": ["wild", "stone", "arcane"], "stormglass-roclet": ["sky", "storm", "stone"], "brinewhisk-otter": ["wild", "tide"],
  "riverwright-beaver": ["wild", "tide", "verdant"], "mirecrown-crane": ["sky", "tide", "verdant"], "inkveil-cuttle": ["tide", "umbral", "dream"],
  "prismclaw-mantis-shrimp": ["tide", "stone", "radiant"], "reefmender-shrimp": ["tide", "verdant", "radiant"], "currentweaver-eel": ["tide"],
  "shellcarrier-hermit": ["wild", "tide", "stone"], "wreckwhistle-porpoise": ["wild", "tide", "echo"], "kilnscale-salamander": ["wild", "flame", "stone"],
  "sporeback-gardener": ["verdant", "wild", "venom"], "voidmantle-ray": ["sky", "umbral", "tide"], "fossilback-trilobite": ["stone", "tide", "wild"],
  "ilyr-virebloom": ["verdant", "tide", "dream", "radiant", "spirit"], thalassene: ["tide", "stone", "verdant", "radiant"],
  orichalc: ["metal", "stone"], "varkesh-stormmane": ["sky", "storm", "wild"], kharza: ["wild", "umbral", "metal"],
  "sugarwake-sovereign": ["confection", "arcane", "flame"], asterjaw: ["sky", "radiant", "spirit"],
  "vellum-warden": ["arcane", "dream", "spirit"], "choir-of-one": ["hush", "echo", "umbral"], "glasswake-stag": ["mirror", "tide", "dream"],
});

function typePair(definition: MobDefinition): readonly CreatureTypeId[] {
  const exact = EXACT_TYPES[definition.kind];
  if (exact) return Object.freeze([...new Set(exact)]);
  const id = definition.kind;
  if (definition.family === "sentient") {
    if (definition.culture === "atlantians") return Object.freeze(["tide", "neutral"]);
    if (definition.culture === "sugarcourt") return Object.freeze(["confection", "neutral"]);
    if (definition.culture === "wood-elves") return Object.freeze(["verdant", "arcane"]);
    if (definition.culture === "dwarves") return Object.freeze(["stone", "metal"]);
    if (id.startsWith("goblin")) return Object.freeze(["wild", "metal"]);
    return Object.freeze(["neutral", "wild"]);
  }
  if (definition.family === "construct") return Object.freeze(["metal", "stone"]);
  if (definition.family === "undead") return Object.freeze(["spirit", "umbral"]);
  if (definition.family === "sea-slug") {
    if (/ember|sunset/iu.test(id)) return Object.freeze(["tide", "flame"]);
    if (/void|moon|starlight|crystal/iu.test(id)) return Object.freeze(["tide", "arcane"]);
    if (/leaf|kelp|sheep/iu.test(id)) return Object.freeze(["tide", "verdant"]);
    return Object.freeze(["tide", "venom"]);
  }
  if (definition.family === "fish" || definition.aquatic || definition.movement === "aquatic") {
    if (/gloom|deep|abyss|dread/iu.test(id)) return Object.freeze(["tide", "umbral"]);
    if (/coral|reef|kelp|reed/iu.test(id)) return Object.freeze(["tide", "verdant"]);
    if (/glass|silver|prism|aether|lantern|glow/iu.test(id)) return Object.freeze(["tide", "radiant"]);
    return Object.freeze(["tide", "wild"]);
  }
  if (definition.family === "bird" || definition.flying) return Object.freeze(["sky", /moon|mist|dream/iu.test(id) ? "dream" : "wild"]);
  if (definition.family === "butterfly") return Object.freeze(["sky", /frost/iu.test(id) ? "frost" : /ember/iu.test(id) ? "flame" : /fen|bloom|meadow/iu.test(id) ? "verdant" : "wild"]);
  if (definition.family === "pet") return Object.freeze([/taffy|praline/iu.test(id) ? "confection" : "wild", /rime/iu.test(id) ? "frost" : /bramble/iu.test(id) ? "verdant" : "neutral"]);
  if (/frost|rime|ice/iu.test(id)) return Object.freeze(["wild", "frost"]);
  if (/ember|cinder|sun/iu.test(id)) return Object.freeze(["wild", "flame"]);
  if (/moon|mist|dream/iu.test(id)) return Object.freeze(["wild", "dream"]);
  if (/moss|clover|petal|bramble|reed|dew|burrow/iu.test(id)) return Object.freeze(["wild", "verdant"]);
  return Object.freeze(["wild", "neutral"]);
}

function captureProfile(definition: MobDefinition): CaptureProfileId {
  if (definition.sentient || definition.family === "sentient" || definition.family === "construct" || definition.family === "undead") return "uncapturable";
  if (definition.family === "legendary" || definition.family === "dragon" || definition.family === "leviathan" || definition.health >= 180) return "legendary";
  if (definition.aquatic || definition.family === "fish" || definition.family === "sea-slug") return "aquatic";
  if (/glow|rune|chime|aether|prism|mist|moon|dream|lantern/iu.test(`${definition.kind} ${definition.behavior}`)) return "resonant";
  if (definition.hostile) return definition.radius >= 0.75 ? "territorial" : "pursuit";
  if (definition.radius >= 0.8 || /shell|tortoise|ridge|crab/iu.test(definition.kind)) return "armored";
  if (definition.temperament === "Skittish") return "gentle";
  return "open";
}

function ecologyRoles(definition: MobDefinition): readonly EcologyRole[] {
  const roles = new Set<EcologyRole>();
  if (definition.family === "sentient") roles.add("citizen");
  if (definition.family === "construct") roles.add("construct");
  if (definition.family === "pollinator" || definition.family === "butterfly") roles.add("pollinator");
  if (definition.family === "fish" || definition.family === "sea-slug") roles.add(definition.bottomDweller ? "reef-helper" : "filter-feeder");
  if (/mole|burrow|rabbit|hare|cottontail/iu.test(definition.kind)) roles.add("burrower");
  if (definition.hostile) roles.add(/boar|warg|fox|shark|maw|crawler|lynx|jackal/iu.test(definition.kind) ? "predator" : "sentinel");
  else if (!definition.sentient && definition.family !== "construct") roles.add(/deer|cow|grazer|horse|woolhorn|tapir|tortoise/iu.test(definition.kind) ? "grazer" : "ambient");
  if (definition.rideable) roles.add("mount");
  if (definition.tameable) roles.add("companion");
  if (definition.family === "dragon" || definition.family === "leviathan") roles.add("boss");
  return Object.freeze([...roles]);
}

function researchClues(definition: MobDefinition): readonly string[] {
  const clues = [definition.discoveryHint ?? `Search ${definition.habitat.toLowerCase()} for tracks, calls, or disturbed flora.`];
  if (definition.diet?.length || definition.tameItems?.length) clues.push("Observe it feeding to reveal care and capture alternatives.");
  if (definition.active) clues.push(`Most active: ${definition.active}.`);
  return Object.freeze(clues);
}

function makeProfile(kind: MobKind): CreatureProfile {
  const definition = MOB_DEFS[kind];
  const naturalTypes = typePair(definition);
  return Object.freeze({
    kind,
    naturalTypes,
    stats: creatureStatProfile(kind, definition),
    moves: authoredMoveSetForKind(kind) ?? defaultMoveSetForTypes(naturalTypes),
    captureProfile: captureProfile(definition),
    ecologyRoles: ecologyRoles(definition),
    researchClues: researchClues(definition),
  });
}

export const CREATURE_PROFILES: Readonly<Record<MobKind, CreatureProfile>> = Object.freeze(Object.fromEntries(MOB_ORDER.map((kind) => [kind, makeProfile(kind)])) as Record<MobKind, CreatureProfile>);

export function creatureProfile(kind: MobKind) {
  return CREATURE_PROFILES[kind];
}

export function validateCreatureProfiles(): readonly string[] {
  const errors: string[] = [];
  for (const kind of MOB_ORDER) {
    const profile = CREATURE_PROFILES[kind];
    if (!profile) { errors.push(`${kind}: missing creature profile.`); continue; }
    if (!profile.naturalTypes.length) errors.push(`${kind}: missing natural type.`);
    if (!profile.moves.basicMoveId) errors.push(`${kind}: missing basic move.`);
    if (profile.moves.unlocks.length < 4) errors.push(`${kind}: fewer than four level moves.`);
    if (profile.moves.unlocks.filter((unlock) => unlock.moveId !== profile.moves.basicMoveId).length < 3) errors.push(`${kind}: fewer than three progression moves.`);
    if (!profile.captureProfile) errors.push(`${kind}: missing capture profile.`);
    if (!profile.ecologyRoles.length) errors.push(`${kind}: missing ecology role.`);
    if (!profile.researchClues.length) errors.push(`${kind}: missing research clue.`);
  }
  return Object.freeze(errors);
}

/** Compact developer-facing inspection used by the in-game debug pane and audits. */
export function inspectCreatureProfile(kind: MobKind, level = 1, sources: readonly CreatureTypeSource[] = [], nowSeconds = 0) {
  const profile = creatureProfile(kind);
  const resolved = resolveCreatureTypes(profile.naturalTypes, sources, nowSeconds);
  return Object.freeze({
    kind,
    name: MOB_DEFS[kind].name,
    level: Math.max(1, Math.min(profile.stats.maximumLevel, Math.floor(level))),
    naturalTypes: Object.freeze(profile.naturalTypes.map((type) => CREATURE_TYPES[type].name)),
    currentTypes: Object.freeze(resolved.types.map((type) => CREATURE_TYPES[type].name)),
    typeSources: resolved.sources,
    revisionKey: resolved.revisionKey,
    stats: profile.stats,
    basicMoveId: profile.moves.basicMoveId,
    progressionMoves: profile.moves.unlocks,
    captureProfile: profile.captureProfile,
    ecologyRoles: profile.ecologyRoles,
  });
}
