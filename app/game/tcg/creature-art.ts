import { MOB_DEFS, type MobDefinition, type MobKind } from "../mobs";

export type CreatureCardArtTheme = "field" | "forest" | "aquatic" | "cavern" | "frost" | "desert" | "volcanic" | "sugar" | "settlement" | "sky";

export const CARDFORGE_CANONICAL_ART_REVISION = 1 as const;

/**
 * Premium printings are deliberately selective. Each scene is rendered offline
 * from the exact production model, so Full Art changes atmosphere and staging
 * without inventing a second anatomy for the creature.
 */
export const CARDFORGE_FEATURED_FULL_ART_MOBS = Object.freeze([
  "petalfox", "thimbledeer", "brinewhisk-otter", "hobbit-mayor", "wood-elf-elderweaver", "dwarf-thane",
  "fire-dragon", "ice-dragon", "steel-dragon", "sea-dragon", "gold-dragon", "silver-dragon", "worldshell-leviathan",
  "ilyr-virebloom", "thalassene", "orichalc", "varkesh-stormmane", "kharza", "sugarwake-sovereign", "asterjaw",
  "vellum-warden", "choir-of-one", "glasswake-stag", "bellstep-qilin", "aerolith-baleen", "mireglass-kelpie",
  "cinderwing-pyrausta", "nacre-gatewyrm", "frostcauldron-behemoth", "briarcrown-manticore", "ammonarch",
  "handtail-ahuizotl", "tideclock-cetus", "anemoi-gryphon", "sable-gorgon", "namarra-makara",
  "ashen-salamander-king", "mycelial-oneirophant",
] as const satisfies readonly MobKind[]);

export function creatureCardArtTheme(definition: MobDefinition): CreatureCardArtTheme {
  const text = `${definition.habitat} ${definition.lore} ${definition.family ?? ""}`.toLocaleLowerCase();
  if (definition.culture === "sugarcourt" || /sugar|candy|confect|syrup|praline|taffy/u.test(text)) return "sugar";
  if (definition.sentient || definition.family === "sentient" || /settlement|village|guild|hearth/u.test(text)) return "settlement";
  if (definition.movement === "aquatic" || definition.aquatic || /ocean|sea|reef|river|water|trench|tide|brine/u.test(text)) return "aquatic";
  if (/volcan|ember|lava|ash|fumarole|fire/u.test(text)) return "volcanic";
  if (/snow|frost|ice|winter|rime/u.test(text)) return "frost";
  if (/desert|dune|badland|sunwash|savanna/u.test(text)) return "desert";
  if (definition.flying || definition.movement === "flying" || /sky|cloud|storm/u.test(text)) return "sky";
  if (/cave|cavern|underground|deep|vault|crypt|ruin|grotto|hollow/u.test(text)) return "cavern";
  if (/forest|wood|grove|jungle|bloom|moss|fen/u.test(text)) return "forest";
  return "field";
}

export function creatureCardArtThemeForKind(kind: string): CreatureCardArtTheme | null {
  const definition = MOB_DEFS[kind as MobKind];
  return definition ? creatureCardArtTheme(definition) : null;
}

export function canonicalFullArtPath(kind: MobKind) {
  return `/cardforge/full-art-canonical/${kind}.svg`;
}
