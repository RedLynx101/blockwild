import { BlockId, type BlockDefinition } from "./data";
import type { MobDefinition, MobKind } from "./mobs";

export const BLOCKWILD_VISUAL_THEME = Object.freeze({
  version: 1,
  thesis: "handcrafted voxel naturalism",
  creatureLanguage: "high-detail cubic storybook anatomy",
  worldLanguage: "grounded storybook materialism",
  textureTileSize: 16,
  ordinaryEmissionCoverageMaximum: .25,
} as const);

export type CreatureVisualTier = "tiny" | "ordinary" | "signature" | "legendary";

export const CREATURE_VISUAL_BUDGETS = Object.freeze({
  tiny: { minimumParts: 14, maximumParts: 30, minimumTriangles: 168, maximumTriangles: 360 },
  ordinary: { minimumParts: 28, maximumParts: 60, minimumTriangles: 336, maximumTriangles: 720 },
  signature: { minimumParts: 50, maximumParts: 90, minimumTriangles: 600, maximumTriangles: 1_080 },
  legendary: { minimumParts: 75, maximumParts: 140, minimumTriangles: 900, maximumTriangles: 1_680 },
} as const satisfies Record<CreatureVisualTier, Readonly<{
  minimumParts: number;
  maximumParts: number;
  minimumTriangles: number;
  maximumTriangles: number;
}>>);

export type CreatureReferenceModel = Readonly<{
  kind: MobKind;
  role: string;
  portrait: string;
}>;

export const CREATURE_REFERENCE_MODELS = Object.freeze([
  { kind: "asterjaw", role: "magical anatomy, internal storytelling, and controlled transparency", portrait: "/creatures/asterjaw.svg" },
  { kind: "hearthback-badger", role: "grounded quadruped anatomy, face, paws, and embedded claws", portrait: "/creatures/hearthback-badger.svg" },
  { kind: "wreckwhistle-porpoise", role: "aquatic face, propulsion anatomy, and readable rostrum", portrait: "/creatures/wreckwhistle-porpoise.svg" },
  { kind: "ilyr-virebloom", role: "ecology integrated into locomotion and luminous material routes", portrait: "/creatures/ilyr-virebloom.svg" },
  { kind: "kharza", role: "equipment-bearing anatomy and structural cultural detail", portrait: "/creatures/kharza.svg" },
  { kind: "sugarwake-sovereign", role: "layered confection materials with a coherent animal underneath", portrait: "/creatures/sugarwake-sovereign.svg" },
  { kind: "glasswake-stag", role: "transparent frame, internal motion, face, antlers, and planted feet", portrait: "/creatures/glasswake-stag.svg" },
] as const satisfies readonly CreatureReferenceModel[]);

export const CREATURE_VISUAL_EXCEPTIONS: Readonly<Partial<Record<MobKind, string>>> = Object.freeze({
  thalassene: "Continuous living-reef growth and layered organic mantle flow are essential to the silhouette.",
  orichalc: "The oath structure depends on true central negative space and a continuous encircling form.",
  "vellum-warden": "Folded paper strata and thin living-ink joints require layered planes.",
  "choir-of-one": "The suspended bell and sound-body depend on hanging curved volume and deliberate open space.",
});

export type CreatureBodyPlan = "quadruped" | "biped" | "bird" | "arthropod" | "serpentine" | "aquatic" | "flying" | "abstract";

export function creatureVisualTier(definition: MobDefinition): CreatureVisualTier {
  if (definition.family === "legendary" || definition.family === "summon" || definition.family === "dragon" || definition.family === "leviathan") return "legendary";
  if (definition.hostile || definition.rideable || definition.family === "construct" || definition.family === "sentient") return "signature";
  if (definition.radius <= .28 && definition.height <= .42) return "tiny";
  return "ordinary";
}

export function creatureBodyPlan(definition: MobDefinition): CreatureBodyPlan {
  if (/blob/u.test(definition.kind)) return "abstract";
  if (/lanternshell/u.test(definition.kind)) return "serpentine";
  if (definition.family === "sea-slug" || /eel|coil|serpent|slug/u.test(definition.kind)) return "serpentine";
  if (definition.family === "fish" || definition.aquatic || definition.movement === "aquatic") return "aquatic";
  if (definition.family === "bird") return "bird";
  if (definition.family === "butterfly" || /crab|shrimp|scarab|spider|bug|bee|dragonfly|clatter|trilobite/u.test(definition.kind)) return "arthropod";
  if (definition.flying || definition.movement === "flying") return "flying";
  if (definition.family === "construct") {
    if (/hound|courser/u.test(definition.kind)) return "quadruped";
    if (/webspinner/u.test(definition.kind)) return "arthropod";
    return "biped";
  }
  if (definition.family === "sentient" || definition.family === "undead" || /skeleton|zombie|rattlekin/u.test(definition.kind)) return "biped";
  if (definition.family === "summon" && /warden|choir/u.test(definition.kind)) return "abstract";
  return "quadruped";
}

export type BlockVisualFamilyId =
  | "fluids-and-air"
  | "terrain-and-geology"
  | "wildwood-and-hearth"
  | "frostlands"
  | "drylands"
  | "wetlands-and-coast"
  | "rainveil"
  | "sakurabloom"
  | "glimmerwood"
  | "deepgear"
  | "atlantian"
  | "sugarcourt"
  | "dragonwake"
  | "waygrid-and-arcane"
  | "world-below"
  | "flora-and-farming"
  | "neutral-utility";

export type BlockVisualFamily = Readonly<{
  id: BlockVisualFamilyId;
  label: string;
  materialRule: string;
  constructionRule: string;
  accentRule: string;
}>;

export const BLOCK_VISUAL_FAMILIES = Object.freeze([
  { id: "fluids-and-air", label: "Fluids & Air", materialRule: "Clear medium, directional flow marks, and readable boundaries.", constructionRule: "Fluids occupy world volume rather than imitating painted stone.", accentRule: "Highlights stay sparse enough to see depth and contents." },
  { id: "terrain-and-geology", label: "Terrain & Geology", materialRule: "Host rock, bedding, aggregate, fracture, and ore seams dominate.", constructionRule: "Natural faces avoid manufactured repetition.", accentRule: "Precious material remains subordinate to host geology." },
  { id: "wildwood-and-hearth", label: "Wildwood & Hearth", materialRule: "Warm timber, fieldstone, cloth, soil, and practical domestic wear.", constructionRule: "Visible beams, pegs, rims, braces, and repairable joinery.", accentRule: "Warm metal and cloth accents mark interaction points." },
  { id: "frostlands", label: "Frostlands", materialRule: "Snow layering, cool stone, ice edges, pale timber, and protected dark joints.", constructionRule: "Forms shed snow and retain legible dark support.", accentRule: "Cold highlights are framed by muted blue-grey structure." },
  { id: "drylands", label: "Drylands", materialRule: "Sand grain, baked clay, weathered stone, thorny growth, and sun bleaching.", constructionRule: "Heavy shade, recessed openings, and erosion-aware courses.", accentRule: "Saturated growth or mineral color remains scarce." },
  { id: "wetlands-and-coast", label: "Wetlands & Coast", materialRule: "Silt, wet stone, reeds, salt wear, shell, and water-darkened wood.", constructionRule: "Drainage, stilts, lashings, and tide-facing edges remain visible.", accentRule: "Flowers and shells punctuate broad quiet wet materials." },
  { id: "rainveil", label: "Rainveil", materialRule: "Deep wet greens, rain-dark wood, broad foliage, and woven plant fiber.", constructionRule: "Raised floors, fitted branches, and runoff paths.", accentRule: "Bright life appears in small canopy or flower signals." },
  { id: "sakurabloom", label: "Sakurabloom", materialRule: "Pale bark, warm dark timber, green ground, petals, and restrained dreamlight.", constructionRule: "Fine fitted wood and deliberate open framing.", accentRule: "Pink and violet stay focal rather than coating every surface." },
  { id: "glimmerwood", label: "Glimmerwood", materialRule: "Living wood, moon-slate, whisperglass, woven panels, and cool plant light.", constructionRule: "Fitted branches and slender structural rhythm remain load-bearing.", accentRule: "Moonlight and glass occupy bounded seams or lenses." },
  { id: "deepgear", label: "Deepgear", materialRule: "Deep stone, dark iron, riveted brass, timber service parts, and soot.", constructionRule: "Broad frames, access panels, pivots, vents, and visible fasteners.", accentRule: "Aether light identifies mechanisms rather than flooding walls." },
  { id: "atlantian", label: "Atlantian", materialRule: "Coral, shell, water-worn stone, glass, pearl, kelp, and tideglass.", constructionRule: "Openings and structure remain readable through water.", accentRule: "Bioluminescence traces circulation and living centers." },
  { id: "sugarcourt", label: "Sugarcourt", materialRule: "Baked structure, wafer, hard sugar, syrup, jam, icing, and candy glass stay distinct.", constructionRule: "Confection still shows layers, supports, seams, and functional edges.", accentRule: "Candy color follows material identity, not random decoration." },
  { id: "dragonwake", label: "Dragonwake", materialRule: "Element-treated stone, metal fittings, eggshell, hoard metal, and archive wood.", constructionRule: "Massive load paths and heat/cold/pressure adaptations remain explicit.", accentRule: "Elemental emission is concentrated in veins, cracks, or mechanisms." },
  { id: "waygrid-and-arcane", label: "Waygrid & Arcane", materialRule: "Ordinary frame, readable conduit, then a bounded active field.", constructionRule: "Every lens, rune, terminal, or cell has a socket and serviceable body.", accentRule: "Active light ordinarily covers less than one quarter of a face." },
  { id: "world-below", label: "World Below", materialRule: "Dark host geology frames living roots, water shelves, fungi, crystal, sulfur, and Veinmetal.", constructionRule: "Ecological centers stay rich while ordinary tunnel material stays quiet.", accentRule: "Bioluminescence marks organisms and active seams, not every cave wall." },
  { id: "flora-and-farming", label: "Flora & Farming", materialRule: "Growth stage, stem direction, leaf grouping, fruit, flower, and soil relationship are legible.", constructionRule: "Tall plants connect vertically and cultivated forms retain a plausible growth path.", accentRule: "Bloom and fruit color concentrates at the reproductive structure." },
  { id: "neutral-utility", label: "Neutral Utility", materialRule: "The local material family remains visible beneath function.", constructionRule: "Interaction follows silhouette, joinery, hinges, storage, or mechanism.", accentRule: "UI-like symbols are secondary to physical construction." },
] as const satisfies readonly BlockVisualFamily[]);

const BLOCK_FAMILY_BY_ID = new Map(BLOCK_VISUAL_FAMILIES.map((family) => [family.id, family]));

export function blockVisualFamily(id: BlockId, definition: BlockDefinition): BlockVisualFamily {
  const name = definition.name.toLowerCase();
  const enumName = String(BlockId[id] ?? "").toLowerCase();
  const text = `${enumName} ${name}`;
  let family: BlockVisualFamilyId;
  if (id === BlockId.Air || definition.liquid) family = "fluids-and-air";
  else if (id >= BlockId.RootweaveSoil) family = "world-below";
  else if (/dragon|gold block|gold pile|incubator|archive shelf|tome display/u.test(text)) family = "dragonwake";
  else if (/sugar|candy|peppermint|cocoa|lollipop|marshmallow|gumdrop|syrup|honey/u.test(text)) family = "sugarcourt";
  else if (/deepgear|riveted brass|golem forge|powderworks|gear table|aether conduit|dwarf stool|snowcap stone/u.test(text)) family = "deepgear";
  else if (/waygrid|wayshrine|creature healer|capture orb|rune stone|crystal block|glowstone/u.test(text)) family = "waygrid-and-arcane";
  else if (/glimmer|moonbough|moonpetal|starfern|dreamcap|lumenreed|moonwell|whisperglass/u.test(text)) family = "glimmerwood";
  else if (/sakura|dreamblossom/u.test(text)) family = "sakurabloom";
  else if (/jungle|rainveil|lantern lotus/u.test(text)) family = "rainveil";
  else if (/atlant|lumen kelp|star coral|abyss bloom|tidevine|moonrice|aquarium|river ribbon|glow kelp|reed bloom/u.test(text)) family = "atlantian";
  else if (/snow|frost|pine|ice/u.test(text)) family = "frostlands";
  else if (/sand|cactus|savanna|sunstep|sunbaked|temple sandstone/u.test(text)) family = "drylands";
  else if (/swamp|siltfen|mud|saltbrush|coast|clay|limestone/u.test(text)) family = "wetlands-and-coast";
  else if (definition.shape === "cross" || definition.shape === "tall-flower" || definition.shape === "aquatic" || definition.shape === "bush" || definition.shape === "fruit" || /crop|sprout|young|sapling|leaves|flower|grass|orchid|shrub|farmland|wheat|cotton|carrot|bluepod/u.test(text)) family = "flora-and-farming";
  else if (/wildwood|hearth|meadow|apple|berry|planks|thatch|barrel/u.test(text)) family = "wildwood-and-hearth";
  else if (definition.shape && definition.shape !== "cube") family = "neutral-utility";
  else family = "terrain-and-geology";
  const resolved = BLOCK_FAMILY_BY_ID.get(family);
  if (!resolved) throw new Error(`Unknown block visual family ${family}`);
  return resolved;
}

export function isCreatureVisualException(kind: MobKind) {
  return Object.prototype.hasOwnProperty.call(CREATURE_VISUAL_EXCEPTIONS, kind);
}
