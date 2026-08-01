import { creatureProfile } from "./creature-profiles";
import { ITEMS } from "./data";
import { ITEM_GUIDE_ENTRIES, type ItemGuideEntry } from "./item-guide";
import { MOB_DEFS, MOB_ORDER, type MobDefinition } from "./mobs";
import { PLANTS, type PlantDefinition } from "./plants";
import { BIOME_NAMES, BiomeId } from "./world";

export const WIKI_SCHEMA = 1 as const;
export const WIKI_CATEGORY_ORDER = Object.freeze(["system", "item", "creature", "plant", "biome"] as const);
export type WikiCategory = (typeof WIKI_CATEGORY_ORDER)[number];

export type WikiFact = Readonly<{ label: string; value: string }>;
export type WikiSection = Readonly<{ heading: string; paragraphs: readonly string[] }>;
export type WikiEntry = Readonly<{
  schema: typeof WIKI_SCHEMA;
  key: string;
  category: WikiCategory;
  name: string;
  eyebrow: string;
  summary: string;
  image: string | null;
  facts: readonly WikiFact[];
  sections: readonly WikiSection[];
  tags: readonly string[];
  relatedKeys: readonly string[];
}>;

export type WikiIndexEntry = Pick<WikiEntry, "key" | "category" | "name" | "eyebrow" | "summary" | "image" | "tags">;

const categoryLabel: Readonly<Record<WikiCategory, string>> = Object.freeze({
  system: "Field Manual",
  item: "Item & Recipe",
  creature: "Creature",
  plant: "Flora",
  biome: "Biome",
});

const unique = <T>(values: readonly T[]) => Object.freeze([...new Set(values)]);
const titleCase = (value: string) => value.replace(/-/gu, " ").replace(/\b\w/gu, (letter) => letter.toUpperCase());

function section(heading: string, paragraphs: readonly string[]): WikiSection {
  return Object.freeze({ heading, paragraphs: Object.freeze(paragraphs.filter(Boolean)) });
}

function entry(input: Omit<WikiEntry, "schema">): WikiEntry {
  return Object.freeze({
    schema: WIKI_SCHEMA,
    ...input,
    facts: Object.freeze([...input.facts]),
    sections: Object.freeze([...input.sections]),
    tags: unique(input.tags.map((tag) => tag.trim().toLocaleLowerCase()).filter(Boolean)),
    relatedKeys: unique(input.relatedKeys),
  });
}

function processLine(process: ItemGuideEntry["madeBy"][number]) {
  const inputs = process.inputs.map((ingredient) => `${ingredient.count} x ${ingredient.label}`).join(", ");
  return `${process.station}: ${inputs || "No material input"} produces ${process.outputCount} x ${ITEMS[process.outputItem]?.name ?? process.name}. ${process.description}`;
}

function itemWikiEntry(item: ItemGuideEntry): WikiEntry {
  const definition = ITEMS[item.item];
  return entry({
    key: `item:${item.item}`,
    category: "item",
    name: item.name,
    eyebrow: categoryLabel.item,
    summary: item.description,
    image: null,
    facts: [
      { label: "Registry", value: `Item ${item.item}` },
      ...(definition.maxStack ? [{ label: "Stack", value: String(definition.maxStack) }] : []),
      ...(definition.food ? [{ label: "Food", value: `Restores ${definition.food}` }] : []),
      ...(definition.damage ? [{ label: "Damage", value: String(definition.damage) }] : []),
    ],
    sections: [
      section("Where it comes from", item.origins),
      section("How to make it", item.madeBy.length ? item.madeBy.map(processLine) : ["No manufacturing process is recorded. Follow the field origins above."]),
      section("What it makes", item.usedIn.length ? item.usedIn.map(processLine) : ["No downstream recipe currently uses this item."]),
    ],
    tags: [item.name, "item", ...item.origins, ...item.madeBy.map((process) => process.station), ...item.usedIn.map((process) => process.name)],
    relatedKeys: unique([
      ...item.madeBy.flatMap((process) => process.inputs.flatMap((ingredient) => ingredient.items.map((code) => `item:${code}`))),
      ...item.usedIn.map((process) => `item:${process.outputItem}`),
    ]).filter((key) => key !== `item:${item.item}`),
  });
}

function movementLabel(definition: MobDefinition) {
  if (definition.movement) return titleCase(definition.movement);
  if (definition.aquatic) return "Aquatic";
  if (definition.flying) return "Flying";
  return "Ground";
}

function captureSummary(definition: MobDefinition) {
  if (definition.sentient || definition.family === "sentient") return "A person, not a capturable wild creature. Meet them through settlement, faction, quest, or recruitment systems.";
  if (definition.family === "construct") return "Constructs use their authored commission, blueprint, or attunement path rather than ordinary creature bonding.";
  if (definition.tameable) return "An eligible captured specimen can be stabilized, nourished, connected with, and finally bonded at Creature Camp.";
  return "This species can be researched and recorded. Its current field definition does not advertise an ordinary companion bond.";
}

function creatureWikiEntry(definition: MobDefinition): WikiEntry {
  const profile = creatureProfile(definition.kind);
  const drops = definition.drops.map((drop) => {
    const range = drop.min === drop.max ? String(drop.min) : `${drop.min}-${drop.max}`;
    return `${ITEMS[drop.item]?.name ?? `Item ${drop.item}`}: ${range}${drop.chance < 1 ? ` at ${Math.round(drop.chance * 100)}%` : ""}.`;
  });
  return entry({
    key: `creature:${definition.kind}`,
    category: "creature",
    name: definition.name,
    eyebrow: `${categoryLabel.creature} - ${definition.temperament}`,
    summary: definition.lore,
    image: `/creatures/${definition.family === "butterfly" ? `butterfly-${definition.kind}` : definition.kind}.svg`,
    facts: [
      { label: "Habitat", value: definition.habitat },
      { label: "Active", value: definition.active },
      { label: "Movement", value: movementLabel(definition) },
      { label: "Types", value: profile.naturalTypes.map(titleCase).join(" / ") },
      { label: "Disposition", value: definition.temperament },
      ...(definition.rideable ? [{ label: "Field use", value: "Rideable after its proper bond or recruitment path" }] : []),
    ],
    sections: [
      section("Ecology", [definition.behavior, definition.discoveryHint ?? `Look for signs in ${definition.habitat.toLocaleLowerCase()}.`]),
      section("Capture and care", [captureSummary(definition), definition.utility ?? "Observe its behavior and habitat before approaching."]),
      section("Known drops", drops.length ? drops : ["No ordinary field drops are recorded."]),
      ...(definition.fieldNotes?.length ? [section("Research trail", definition.fieldNotes.map((note) => `${note.title}: ${note.hint}`))] : []),
    ],
    tags: [definition.name, definition.kind, definition.family ?? "wildlife", definition.temperament, definition.habitat, definition.active, ...profile.naturalTypes, ...profile.ecologyRoles],
    relatedKeys: definition.drops.map((drop) => `item:${drop.item}`),
  });
}

function plantWikiEntry(plant: PlantDefinition): WikiEntry {
  return entry({
    key: `plant:${plant.id}`,
    category: "plant",
    name: plant.name,
    eyebrow: `${categoryLabel.plant} - ${titleCase(plant.category)}`,
    summary: plant.utility,
    image: `/plants/${plant.id}.svg`,
    facts: [
      { label: "Habitat", value: plant.habitat },
      { label: "Growth", value: plant.growth },
      { label: "Category", value: titleCase(plant.category) },
    ],
    sections: [
      section("Field notes", [plant.growth, plant.utility]),
      section("Recorded yields", plant.drops.map((drop) => drop.label)),
    ],
    tags: [plant.name, plant.id, plant.category, plant.habitat, plant.utility],
    relatedKeys: plant.drops.map((drop) => `item:${drop.item}`),
  });
}

const BIOME_SUMMARIES: Readonly<Record<number, string>> = Object.freeze({
  [BiomeId.DeepOcean]: "Cold, light-starved open water above deep shelves, leviathan routes, wrecks, and rare luminous refuges.",
  [BiomeId.Ocean]: "The broad saltwater heart of Blockwild, shaped by brinegrass meadows, sailkelp stands, shoals, reefs, and crossings.",
  [BiomeId.Beach]: "A bright tidal boundary of sand, dune plants, shellfish, sea birds, and weathered shore structures.",
  [BiomeId.Meadow]: "Open, gently rolling country rich in flowers, farms, grazing wildlife, roads, and early settlements.",
  [BiomeId.Wildwood]: "Temperate woodland of dense canopies, mossy clearings, timber, forest wildlife, and old trails.",
  [BiomeId.Frostpine]: "A cold evergreen forest with sheltered orchards, winter creatures, and snow-bound resources.",
  [BiomeId.Desert]: "Sun-baked dunes and stone flats where sparse life gathers around ruins, shade, and buried water.",
  [BiomeId.Savanna]: "Warm grassland with long sightlines, scattered trees, large grazers, and exposed travel routes.",
  [BiomeId.Siltfen]: "Waterlogged lowland of reeds, mud, frogs, insects, wetland crops, and half-submerged paths.",
  [BiomeId.Snowfield]: "Broad winter country where shelter, tracks, and isolated stands of flora matter more than abundance.",
  [BiomeId.Badlands]: "Layered dry ridges, mineral faces, scrub, hardy wildlife, and long eroded corridors.",
  [BiomeId.Birchlight]: "An airy pale-barked grove with luminous ground cover and gentler forest edges.",
  [BiomeId.Bloomwood]: "A moist flowering forest built around broad rose-toned crowns and pollinator-rich understory.",
  [BiomeId.Highlands]: "Wind-cut ridges, steep approaches, exposed ore, mountain wildlife, and dwarven routes.",
  [BiomeId.Volcanic]: "Ash, lava, fumaroles, heat-adapted life, and dangerous mineral country at the surface.",
  [BiomeId.MushroomFen]: "A dim, damp fungal wetland where giant caps and spores reshape the usual fen ecology.",
  [BiomeId.River]: "A connected freshwater corridor joining inland biomes, fish habitats, farmland, bridges, and settlements.",
  [BiomeId.CloudreedGlen]: "A sheltered high meadow of tall reeds, mist, flying life, and soft terrain folds.",
  [BiomeId.RainveilJungle]: "Hot, rain-heavy country with massive connected crowns, layered vegetation, ravines, and canopy life.",
  [BiomeId.SakurabloomGrove]: "A calm pink-canopied woodland with open paths, ornamental timber, and seasonal pollinators.",
  [BiomeId.LumenTrench]: "A rare oceanic ecological center where darkness makes concentrated bioluminescence meaningful.",
  [BiomeId.SugarplumVale]: "A confection-shaped ecosystem and Sugarcourt homeland with edible flora, syrup waters, and bright craft materials.",
  [BiomeId.Glimmerwood]: "An uncommon magical woodland where restrained luminous flora gathers in ecological pockets.",
  [BiomeId.SnowcapRange]: "Blockwild's severe mountain belt: high relief, snow, dragons, exposed traversals, and dwarven holds.",
});

function biomeMatches(text: string, name: string) {
  const terms = name.toLocaleLowerCase().split(/[^a-z]+/u).filter((term) => term.length >= 5 && !["brightwater", "whispering", "wandering", "flower"].includes(term));
  const normalized = text.toLocaleLowerCase();
  return terms.some((term) => normalized.includes(term)) || normalized.includes(name.toLocaleLowerCase());
}

function biomeWikiEntry(id: number, name: string): WikiEntry {
  const flora = PLANTS.filter((plant) => biomeMatches(plant.habitat, name)).slice(0, 8);
  const fauna = MOB_ORDER.map((kind) => MOB_DEFS[kind]).filter((mob) => biomeMatches(mob.habitat, name)).slice(0, 10);
  return entry({
    key: `biome:${id}`,
    category: "biome",
    name,
    eyebrow: `${categoryLabel.biome} - Surface region`,
    summary: BIOME_SUMMARIES[id] ?? "A distinct deterministic region in Blockwild's surface ecology.",
    image: null,
    facts: [
      { label: "Biome registry", value: String(id) },
      { label: "Recorded flora", value: String(flora.length) },
      { label: "Recorded fauna", value: String(fauna.length) },
    ],
    sections: [
      section("Landscape", [BIOME_SUMMARIES[id] ?? "A distinct deterministic surface region."]),
      section("Representative flora", flora.length ? flora.map((plant) => plant.name) : ["Field records currently describe this region through world observation rather than a dedicated flora tag."]),
      section("Representative fauna", fauna.length ? fauna.map((mob) => mob.name) : ["Field records currently describe this region through world observation rather than a dedicated fauna tag."]),
    ],
    tags: [name, "biome", "surface", ...flora.map((plant) => plant.name), ...fauna.map((mob) => mob.name)],
    relatedKeys: [...flora.map((plant) => `plant:${plant.id}`), ...fauna.map((mob) => `creature:${mob.kind}`)],
  });
}

type SystemTopic = Readonly<{
  id: string;
  name: string;
  summary: string;
  facts?: readonly WikiFact[];
  sections: readonly WikiSection[];
  tags: readonly string[];
  relatedKeys?: readonly string[];
}>;

const SYSTEM_TOPICS: readonly SystemTopic[] = Object.freeze([
  {
    id: "getting-started", name: "First Days in Blockwild", summary: "A practical route from a new world to a safe, equipped explorer without prescribing one correct play style.",
    facts: [{ label: "Core loop", value: "Explore, gather, craft, build, survive" }],
    sections: [section("A useful opening", ["Gather nearby wood and stone, make a basic tool set, and establish a lit shelter before ranging farther.", "Food, a bed, spare blocks, and a marked return route make exploration much safer than raw combat power alone."]), section("Then choose a direction", ["Follow roads and rivers toward settlements, study a local creature, begin a farm, descend into a supported cave, or prepare for multiplayer."])],
    tags: ["start", "beginner", "survival", "shelter", "food", "tools"],
  },
  {
    id: "crafting-and-machines", name: "Crafting, Stations, and Machines", summary: "One linked production language connects hand recipes, shaped crafting, furnaces, mills, alchemy, distilling, and faction machines.",
    sections: [section("Find any material", ["Press ? while an item is selected to open its exact wiki page. Origins, recipes, stations, and downstream uses are drawn from the same live registries used by the game."]), section("Blueprints", ["Some advanced designs require a learned blueprint. The item page names that requirement instead of hiding it in a separate recipe list."])],
    tags: ["crafting", "recipe", "furnace", "alchemy", "distillery", "sugarworks", "blueprint"],
  },
  {
    id: "capture-and-bonding", name: "Capture and Bonding", summary: "Capture establishes safe custody; trust and companionship are earned through a separate, visible care path.",
    facts: [{ label: "Capture tool", value: "One normal Capture Orb" }, { label: "Aggressive fallback", value: "40% health or one heart" }],
    sections: [section("Capture readiness", ["Passive creatures must be calm. Aggressive creatures always retain the reliable health-threshold route, with visible non-damage alternatives when their behavior supports them.", "Aquatic targets must share the correct water medium, but do not need a special orb."]), section("From custody to companionship", ["Eligible specimens move through Stabilize, Nourish, Connect, and Form Bond at Creature Camp. Only the final bond grants ownership and companion use."]), section("Exceptions", ["People, commissioned constructs, covenant creatures, faction-aligned specimens, and authored summons report their own recruitment or attunement path rather than silently failing."])],
    tags: ["capture", "orb", "tame", "bond", "creature camp", "subdued", "calm"],
  },
  {
    id: "bestiary-research", name: "Bestiary Research", summary: "The Bestiary records what your character has personally learned; this wiki explains the stable public rules around it.",
    sections: [section("Progressive notes", ["Seeing, defeating, capturing, taming, breeding, and authored milestones can reveal later field notes. Complex creatures such as dragons can therefore grow across many discoveries without changing the save schema."]), section("Public knowledge versus character knowledge", ["The wiki describes general ecology and systems. Locked Bestiary text, variants, and mastery remain character progression and are not bypassed here."])],
    tags: ["bestiary", "research", "field notes", "discovery", "variants", "mastery"],
  },
  {
    id: "farming-and-flora", name: "Farming and Flora", summary: "Wild plants, tended crops, orchards, aquatic cultivation, and processing stations form one renewable resource layer.",
    sections: [section("Cultivation", ["Plant pages record the appropriate habitat, growth rule, and known yield. Mature crops can be harvested in place where their field behavior supports it."]), section("Ecology", ["Not every useful plant belongs in a farm. Trees, wetland plants, ocean staples, fungi, and rare ecological-center flora remain tied to exploration."])],
    tags: ["farm", "crop", "plant", "orchard", "underwater", "flora", "harvest"],
  },
  {
    id: "exploration-and-map", name: "Exploration, Maps, and Travel", summary: "Maps remember explored terrain, discoveries, custom pins, waystones, and the routes that make an endless world legible.",
    sections: [section("Wayfinding", ["Use the compass for heading and nearby discoveries, the map for terrain and pins, and waystones for the fast-travel network."]), section("World layers", ["The surface, oceans, dark connecting tunnels, ecological cavern centers, settlements, dungeons, and landmark POIs reward different preparation."])],
    tags: ["map", "compass", "pin", "waystone", "fast travel", "poi", "cave"],
  },
  {
    id: "world-below", name: "The World Below", summary: "A connected cave world of dark stone roads, rare luminous ecologies, great caverns, settlements, hazards, and authored destinations.",
    sections: [section("Contrast matters", ["Ordinary tunnels remain dark. Bioluminescence concentrates in ecological centers so a living cavern feels discovered rather than becoming the default wallpaper."]), section("Travel prepared", ["Bring light, food, markers, spare blocks, and vertical traversal tools. Large chambers can contain water, lava, flying life, rare resources, ruins, and routes to deeper bands."])],
    tags: ["underground", "cave", "cavern", "bioluminescence", "world below", "dungeon"],
  },
  {
    id: "multiplayer", name: "Shared Worlds", summary: "Direct multiplayer keeps one host authoritative over world state while each player brings a persistent browser-local character.",
    sections: [section("Authority", ["The host validates world edits, inventories, creature state, combat, containers, and other shared actions. Guests keep their personal identity while the shared world stays coherent."]), section("Invites", ["Host or join from the Multiplayer menu with an invite code. Export important local worlds and characters as part of normal browser-save hygiene."])],
    tags: ["multiplayer", "host", "guest", "invite", "authority", "character"],
  },
  {
    id: "cardforge", name: "Cardforge", summary: "A deterministic in-world card game built from Blockwild's creatures, factions, locations, and stories.",
    sections: [section("Creature identity", ["Standard creature cards use the canonical production model as their source of truth. Full Art printings may change staging and atmosphere, but not the creature's anatomy or identity."]), section("Collection", ["Cards can be opened, collected, archived, traded, organized into decks, and played without generating art or rules text at runtime."])],
    tags: ["cardforge", "cards", "binder", "deck", "full art", "trading"],
  },
  {
    id: "controls-and-accessibility", name: "Controls and Accessibility", summary: "Keyboard, mouse, touch, camera, audio, UI scale, and performance settings can be adjusted without changing world identity.",
    sections: [section("Useful shortcuts", ["Press ? for the selected item's wiki page. Use the pause menu for the complete current control list and accessibility settings."]), section("Performance", ["Simulation, full render, and basic render distances are separate. Lower them independently when a device needs more headroom."])],
    tags: ["controls", "keyboard", "touch", "accessibility", "settings", "performance", "wiki"],
  },
]);

function systemWikiEntry(topic: SystemTopic): WikiEntry {
  return entry({
    key: `system:${topic.id}`,
    category: "system",
    name: topic.name,
    eyebrow: categoryLabel.system,
    summary: topic.summary,
    image: null,
    facts: topic.facts ?? [],
    sections: topic.sections,
    tags: [topic.name, "guide", ...topic.tags],
    relatedKeys: topic.relatedKeys ?? [],
  });
}

export function buildWikiEntries(): readonly WikiEntry[] {
  return Object.freeze([
    ...SYSTEM_TOPICS.map(systemWikiEntry),
    ...ITEM_GUIDE_ENTRIES.map(itemWikiEntry),
    ...MOB_ORDER.map((kind) => creatureWikiEntry(MOB_DEFS[kind])),
    ...PLANTS.map(plantWikiEntry),
    ...Object.entries(BIOME_NAMES).map(([id, name]) => biomeWikiEntry(Number(id), name)),
  ]);
}

export const WIKI_ENTRIES = buildWikiEntries();
export const WIKI_ENTRY_BY_KEY: Readonly<Record<string, WikiEntry>> = Object.freeze(Object.fromEntries(WIKI_ENTRIES.map((wikiEntry) => [wikiEntry.key, wikiEntry])));

export function wikiIndex(entries: readonly WikiEntry[] = WIKI_ENTRIES): readonly WikiIndexEntry[] {
  return Object.freeze(entries.map(({ key, category, name, eyebrow, summary, image, tags }) => Object.freeze({ key, category, name, eyebrow, summary, image, tags })));
}

export function wikiEntryMatches(wikiEntry: WikiIndexEntry | WikiEntry, query: string) {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return true;
  return [wikiEntry.name, wikiEntry.eyebrow, wikiEntry.summary, ...wikiEntry.tags].some((value) => value.toLocaleLowerCase().includes(normalized));
}
