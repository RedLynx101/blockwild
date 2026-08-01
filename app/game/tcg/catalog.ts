import { creatureProfile } from "../creature-profiles";
import { CREATURE_TYPE_IDS, type CreatureTypeId } from "../creature-types";
import { GUILDS, type GuildId } from "../guilds";
import { BUTTERFLY_ORDER, MOB_DEFS, MOB_ORDER, type MobDefinition, type MobKind } from "../mobs";
import { CARDFORGE_FEATURED_FULL_ART_MOBS, canonicalFullArtPath } from "./creature-art";
import {
  TCG_CATALOG_REVISION,
  type TcgAbility,
  type TcgAbilityEffect,
  type TcgCardClass,
  type TcgCardDefinition,
  type TcgCatalog,
  type TcgKeyword,
  type TcgPackProduct,
  type TcgPrinting,
  type TcgRarity,
  type TcgSetDefinition,
  type TcgSetId,
  type TcgVariant,
} from "./types";

export const TCG_RARITY_ORDER = Object.freeze(["common", "uncommon", "rare", "epic", "legendary"] as const);
export const TCG_KEYWORDS: readonly TcgKeyword[] = Object.freeze(["guard", "swift", "ambush", "bond", "faint", "forage", "attune", "rally", "dive", "prime"]);
export const TCG_RARITY_RANK: Readonly<Record<TcgRarity, number>> = Object.freeze({
  common: 0,
  uncommon: 1,
  rare: 2,
  epic: 3,
  legendary: 4,
});

export const TCG_RARITY_VALUE: Readonly<Record<TcgRarity, number>> = Object.freeze({
  common: 4,
  uncommon: 12,
  rare: 40,
  epic: 140,
  legendary: 450,
});

export const TCG_SETS: Readonly<Record<TcgSetId, TcgSetDefinition>> = Object.freeze({
  "wildroads-core": Object.freeze({
    id: "wildroads-core",
    name: "Wildroads Core",
    symbol: "◇",
    description: "Creatures, trails, tools, and the broad ecology of Blockwild.",
    artDirection: "Grounded field-guide adventure with clear silhouettes and warm trail-map framing.",
  }),
  "halls-and-hearths": Object.freeze({
    id: "halls-and-hearths",
    name: "Halls & Hearths",
    symbol: "⌂",
    description: "Residents, factions, professions, settlements, and the guilds of the Hearthroads.",
    artDirection: "Character-forward storybook scenes, carved signage, lamplight, and faction materials.",
  }),
  "vaults-below": Object.freeze({
    id: "vaults-below",
    name: "Vaults Below",
    symbol: "⬙",
    description: "Dungeon specialists, bosses, relics, and the dangerous World Below.",
    artDirection: "Dramatic subterranean staging, strong rim light, ancient masonry, and restrained menace.",
  }),
});

export const TCG_PACKS: Readonly<Record<string, TcgPackProduct>> = Object.freeze({
  "wildroads-booster": Object.freeze({
    id: "wildroads-booster",
    name: "Wildroads Booster",
    setIds: Object.freeze(["wildroads-core"] satisfies TcgSetId[]),
    themeTags: Object.freeze(["surface", "wild", "starter"]),
    retailPrice: 65,
    illustrationKey: "pack:wildroads",
  }),
  "hearths-booster": Object.freeze({
    id: "hearths-booster",
    name: "Halls & Hearths Booster",
    setIds: Object.freeze(["halls-and-hearths"] satisfies TcgSetId[]),
    themeTags: Object.freeze(["settlement", "faction", "guild"]),
    retailPrice: 80,
    illustrationKey: "pack:hearths",
  }),
  "vaults-booster": Object.freeze({
    id: "vaults-booster",
    name: "Vaults Below Booster",
    setIds: Object.freeze(["vaults-below"] satisfies TcgSetId[]),
    themeTags: Object.freeze(["dungeon", "boss", "underground"]),
    retailPrice: 80,
    illustrationKey: "pack:vaults",
  }),
  "cardforge-variety-booster": Object.freeze({
    id: "cardforge-variety-booster",
    name: "Cardforge Variety Booster",
    setIds: Object.freeze(["wildroads-core", "halls-and-hearths", "vaults-below"] satisfies TcgSetId[]),
    themeTags: Object.freeze(["variety"]),
    retailPrice: 75,
    illustrationKey: "pack:variety",
  }),
});

export const TCG_FULL_ART_ILLUSTRATIONS: Readonly<Record<string, string>> = Object.freeze({
  "card:authored:migration-confluence": "/cardforge/full-art/migration-confluence.webp",
  "card:authored:cardwright-collegium": "/cardforge/full-art/cardwrights-collegium.webp",
  "card:authored:reliquary-vault": "/cardforge/full-art/reliquary-vault.webp",
  ...Object.fromEntries(CARDFORGE_FEATURED_FULL_ART_MOBS.map((kind) => [`card:mob:${kind}`, canonicalFullArtPath(kind)])),
});

const frozen = <T>(value: T): Readonly<T> => Object.freeze(value);
const unique = <T>(values: readonly T[]) => Object.freeze([...new Set(values)]);

function mobRarity(definition: MobDefinition) {
  const profile = creatureProfile(definition.kind);
  if (profile.ecologyRoles.includes("boss") || definition.dragonType || definition.health >= 80) return "legendary" as const;
  if (definition.persistent || definition.health >= 45 || definition.xp >= 35) return "epic" as const;
  if (definition.sentient || definition.health >= 24 || definition.ranged) return "rare" as const;
  if (definition.tameable || definition.flying || definition.aquatic || definition.health >= 14) return "uncommon" as const;
  return "common" as const;
}

function mobSet(definition: MobDefinition): TcgSetId {
  const profile = creatureProfile(definition.kind);
  if (definition.sentient || definition.family === "sentient" || definition.faction || definition.culture) return "halls-and-hearths";
  if (profile.ecologyRoles.includes("boss")
    || definition.persistent
    || /(cave|underground|dungeon|vault|abyss|deep|ruin|crypt|world below)/iu.test(`${definition.habitat} ${definition.lore}`)) return "vaults-below";
  return "wildroads-core";
}

function mobKeywords(definition: MobDefinition): readonly TcgKeyword[] {
  const profile = creatureProfile(definition.kind);
  const keywords: TcgKeyword[] = [];
  if (definition.hostile && !definition.persistent) keywords.push("ambush");
  if (definition.flying || definition.speed >= 4.5) keywords.push("swift");
  if (definition.health >= 24 || profile.ecologyRoles.includes("guardian") || profile.ecologyRoles.includes("sentinel")) keywords.push("guard");
  if (definition.tameable || profile.ecologyRoles.includes("companion")) keywords.push("bond");
  if (definition.aquatic || definition.movement === "aquatic") keywords.push("dive");
  if (profile.ecologyRoles.includes("forager") || profile.ecologyRoles.includes("scavenger")) keywords.push("forage");
  if (profile.naturalTypes.some((type) => type === "arcane" || type === "spirit")) keywords.push("attune");
  if (definition.sentient) keywords.push("rally");
  if (profile.ecologyRoles.includes("boss") || definition.persistent) keywords.push("prime");
  if (definition.hostile && !keywords.includes("prime")) keywords.push("faint");
  return unique(keywords.slice(0, 4));
}

function ability(id: string, trigger: TcgAbility["trigger"], text: string, effect: TcgAbilityEffect): TcgAbility {
  return frozen({ id, trigger, text, effect });
}

function mobAbilities(definition: MobDefinition, keywords: readonly TcgKeyword[]) {
  const abilities: TcgAbility[] = [];
  if (keywords.includes("rally")) {
    abilities.push(ability(`${definition.kind}:rally`, "play", "Rally — Draw a card.", { kind: "draw", count: 1 }));
  } else if (keywords.includes("forage")) {
    abilities.push(ability(`${definition.kind}:forage`, "play", "Forage — Draw a card, then this enters exhausted.", { kind: "draw", count: 1 }));
  } else if (keywords.includes("prime")) {
    abilities.push(ability(`${definition.kind}:prime`, "play", "Prime — Restore 2 Resolve.", { kind: "heal", amount: 2, target: "self-resolve" }));
  } else if (definition.hostile) {
    abilities.push(ability(`${definition.kind}:strike`, "play", "On arrival, deal 1 to enemy Resolve.", { kind: "damage", amount: 1, target: "enemy-resolve" }));
  } else if (definition.tameable) {
    abilities.push(ability(`${definition.kind}:bond`, "play", "Bond — Give a friendly Being +1 Power this turn.", { kind: "buff", power: 1, guard: 0, target: "friendly-being" }));
  }
  if (keywords.includes("faint")) {
    abilities.push(ability(`${definition.kind}:faint`, "faint", "Faint — Draw a card.", { kind: "draw", count: 1 }));
  }
  return Object.freeze(abilities);
}

function mobCardDefinition(kind: MobKind): TcgCardDefinition {
  const definition = MOB_DEFS[kind];
  const profile = creatureProfile(kind);
  const rarity = mobRarity(definition);
  const keywords = mobKeywords(definition);
  const basePower = Math.max(1, Math.min(9, Math.round(definition.damage * 0.8 + (definition.hostile ? 1 : 0))));
  const baseGuard = Math.max(1, Math.min(12, Math.round(definition.health / 4)));
  const cost = Math.max(1, Math.min(10, Math.round((basePower + baseGuard) / 3.2) + TCG_RARITY_RANK[rarity]));
  return frozen({
    schema: 1,
    id: `card:mob:${kind}`,
    rulesRevision: 1,
    name: definition.name,
    class: definition.sentient ? "character" : "creature",
    source: frozen({ kind: "mob", id: kind }),
    rarity,
    primaryType: profile.naturalTypes[0],
    secondaryTypes: Object.freeze(profile.naturalTypes.slice(1, 3)),
    factions: unique([definition.faction, definition.factionAffinity, definition.culture]
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))),
    guilds: Object.freeze([]),
    traits: unique([
      definition.family,
      definition.habitat.toLowerCase().replace(/[^a-z0-9]+/gu, "-"),
      definition.sentient ? "sentient" : "wild",
      definition.dragonType ? "dragon" : undefined,
      ...profile.ecologyRoles,
    ].filter((entry): entry is string => Boolean(entry))),
    cost,
    power: basePower,
    guard: baseGuard,
    keywords,
    abilities: mobAbilities(definition, keywords),
    flavorText: definition.lore,
  });
}

type CuratedCardInput = Readonly<{
  id: string;
  name: string;
  class: TcgCardClass;
  setId: TcgSetId;
  rarity: TcgRarity;
  type?: CreatureTypeId;
  cost: number;
  text: string;
  effect: TcgAbilityEffect;
  traits: readonly string[];
  flavor: string;
}>;

const CURATED_CARDS: readonly CuratedCardInput[] = Object.freeze([
  { id: "trail-spark", name: "Trail Spark", class: "technique", setId: "wildroads-core", rarity: "common", type: "radiant", cost: 0, text: "Gain 1 temporary Trail Energy.", effect: { kind: "gain-energy", amount: 1 }, traits: ["starter"], flavor: "A second step finds the road the first one missed." },
  { id: "field-notes", name: "Field Notes", class: "technique", setId: "wildroads-core", rarity: "common", type: "neutral", cost: 1, text: "Draw 2 cards.", effect: { kind: "draw", count: 2 }, traits: ["research"], flavor: "The margin is where certainty goes to become useful." },
  { id: "gentle-capture", name: "Gentle Capture", class: "technique", setId: "wildroads-core", rarity: "uncommon", type: "wild", cost: 2, text: "Ready a friendly Being.", effect: { kind: "ready", target: "friendly-being" }, traits: ["capture"], flavor: "A patient hand leaves both traveler and creature with choices." },
  { id: "migration-confluence", name: "Migration Confluence", class: "technique", setId: "wildroads-core", rarity: "epic", type: "wild", cost: 5, text: "Draw 3 cards.", effect: { kind: "draw", count: 3 }, traits: ["migration", "surface"], flavor: "The road is briefly visible because every creature chose it at once." },
  { id: "worldroot-crossroads", name: "Worldroot Crossroads", class: "place", setId: "wildroads-core", rarity: "legendary", type: "verdant", cost: 6, text: "Restore 4 Resolve.", effect: { kind: "heal", amount: 4, target: "self-resolve" }, traits: ["road", "prime", "surface"], flavor: "No map agrees where it begins, but every old path remembers the roots." },
  { id: "hearthmeal", name: "Hearthmeal", class: "technique", setId: "halls-and-hearths", rarity: "common", type: "neutral", cost: 2, text: "Restore 3 Resolve.", effect: { kind: "heal", amount: 3, target: "self-resolve" }, traits: ["food", "hearthkin"], flavor: "Every road is shorter from the warm side of a table." },
  { id: "brassroot-challenge", name: "Brassroot Challenge", class: "technique", setId: "halls-and-hearths", rarity: "uncommon", type: "metal", cost: 2, text: "Deal 2 to an enemy Being.", effect: { kind: "damage", amount: 2, target: "enemy-being" }, traits: ["goblin", "guild", "brassroot"], flavor: "An honest contest ends with two signatures and no excuses." },
  { id: "moonbough-mending", name: "Moonbough Mending", class: "technique", setId: "halls-and-hearths", rarity: "rare", type: "verdant", cost: 3, text: "Give a friendly Being +1 Power and +3 Guard.", effect: { kind: "buff", power: 1, guard: 3, target: "friendly-being" }, traits: ["wood-elves", "guild", "moonbough"], flavor: "The branch remembers the shape it held before the storm." },
  { id: "waykeeper-release", name: "Waykeeper Release", class: "technique", setId: "halls-and-hearths", rarity: "uncommon", type: "wild", cost: 2, text: "Ready a friendly Being.", effect: { kind: "ready", target: "friendly-being" }, traits: ["guild", "waykeeper", "habitat"], flavor: "The empty orb is entered in the ledger as a successful return." },
  { id: "tideglass-current", name: "Tideglass Current", class: "technique", setId: "halls-and-hearths", rarity: "uncommon", type: "tide", cost: 2, text: "Draw a card.", effect: { kind: "draw", count: 1 }, traits: ["guild", "tideglass", "aquatic"], flavor: "Nine lamps mark the route out, never the creature within." },
  { id: "sugarcourt-provision", name: "Sugarcourt Provision", class: "technique", setId: "halls-and-hearths", rarity: "uncommon", type: "neutral", cost: 2, text: "Restore 3 Resolve.", effect: { kind: "heal", amount: 3, target: "self-resolve" }, traits: ["guild", "sugarcourt-makers", "food"], flavor: "Pretty is allowed after useful." },
  { id: "vault-collapse", name: "Vault Collapse", class: "technique", setId: "vaults-below", rarity: "rare", type: "stone", cost: 4, text: "Deal 4 to an enemy Being.", effect: { kind: "damage", amount: 4, target: "enemy-being" }, traits: ["dungeon"], flavor: "Some doors close from every direction." },
  { id: "echoing-depths", name: "Echoing Depths", class: "technique", setId: "vaults-below", rarity: "epic", type: "echo", cost: 5, text: "Draw 3 cards.", effect: { kind: "draw", count: 3 }, traits: ["underground", "research"], flavor: "The cave answers eventually. The question is what heard you first." },
  { id: "capture-orb", name: "Capture Orb", class: "relic", setId: "wildroads-core", rarity: "common", type: "arcane", cost: 1, text: "When played, draw a card.", effect: { kind: "draw", count: 1 }, traits: ["capture", "tool"], flavor: "A compact promise to bring something home alive." },
  { id: "wayfarer-compass", name: "Wayfarer Compass", class: "relic", setId: "wildroads-core", rarity: "uncommon", type: "neutral", cost: 2, text: "Gain 1 Trail Energy.", effect: { kind: "gain-energy", amount: 1 }, traits: ["travel", "tool"], flavor: "It points toward the route you can still survive." },
  { id: "cardwright-binder", name: "Cardwright Binder", class: "relic", setId: "halls-and-hearths", rarity: "rare", type: "arcane", cost: 3, text: "Draw 2 cards.", effect: { kind: "draw", count: 2 }, traits: ["cardwright", "guild"], flavor: "A collection is a story whose pages can argue back." },
  { id: "deepgear-brace", name: "Deepgear Brace", class: "relic", setId: "vaults-below", rarity: "uncommon", type: "metal", cost: 2, text: "Give a friendly Being +0 Power and +3 Guard.", effect: { kind: "buff", power: 0, guard: 3, target: "friendly-being" }, traits: ["dwarf", "underground", "guild", "deepgear"], flavor: "Measure twice. Brace once. Leave together." },
  { id: "wildroads-crossing", name: "Wildroads Crossing", class: "place", setId: "wildroads-core", rarity: "common", type: "wild", cost: 2, text: "On arrival, draw a card.", effect: { kind: "draw", count: 1 }, traits: ["road", "surface"], flavor: "Four directions, three warnings, and one very confident signpost." },
  { id: "hearthroads-waytable", name: "Hearthroads Waytable", class: "place", setId: "halls-and-hearths", rarity: "rare", type: "neutral", cost: 3, text: "Restore 2 Resolve.", effect: { kind: "heal", amount: 2, target: "self-resolve" }, traits: ["town", "waytable", "guild", "hearthroad"], flavor: "Disputes become games here, and games become friendships if everyone is lucky." },
  { id: "cardwright-collegium", name: "Cardwrights' Collegium", class: "place", setId: "halls-and-hearths", rarity: "epic", type: "arcane", cost: 4, text: "Draw 2 cards.", effect: { kind: "draw", count: 2 }, traits: ["guild", "cardwright"], flavor: "Ink, lacquer, provenance, and the occasional argument about numbering." },
  { id: "grand-waytable-circuit", name: "Grand Waytable Circuit", class: "place", setId: "halls-and-hearths", rarity: "legendary", type: "radiant", cost: 6, text: "Restore 4 Resolve.", effect: { kind: "heal", amount: 4, target: "self-resolve" }, traits: ["guild", "waytable", "championship"], flavor: "For one evening, every road in Blockwild leads to the same table." },
  { id: "reliquary-vault", name: "Reliquary Vault", class: "place", setId: "vaults-below", rarity: "epic", type: "spirit", cost: 4, text: "Gain 2 Trail Energy.", effect: { kind: "gain-energy", amount: 2 }, traits: ["dungeon", "vault"], flavor: "The lock is newer than the bones beside it." },
]);

function curatedDefinition(input: CuratedCardInput): TcgCardDefinition {
  const representedGuild = (Object.keys(GUILDS) as GuildId[]).find((guildId) => input.traits.includes(guildId));
  return frozen({
    schema: 1,
    id: `card:authored:${input.id}`,
    rulesRevision: 1,
    name: input.name,
    class: input.class,
    source: frozen({ kind: "authored", id: input.id }),
    rarity: input.rarity,
    ...(input.type ? { primaryType: input.type } : {}),
    secondaryTypes: Object.freeze([]),
    factions: Object.freeze([]),
    guilds: representedGuild ? Object.freeze([representedGuild]) : Object.freeze([]),
    traits: Object.freeze([...input.traits]),
    cost: input.cost,
    keywords: Object.freeze([]),
    abilities: Object.freeze([ability(`${input.id}:play`, "play", input.text, input.effect)]),
    flavorText: input.flavor,
  });
}

function printingIdFor(definitionId: string, setId: TcgSetId, variant: TcgVariant, finish: TcgPrinting["finish"] = "standard") {
  return `print:${setId}:${definitionId.replace(/^card:/u, "").replaceAll(":", "-")}:${variant}:${finish}`;
}

function printingFor(
  definition: TcgCardDefinition,
  setId: TcgSetId,
  collectorNumber: number,
  variant: TcgVariant,
  finish: TcgPrinting["finish"] = "standard",
): TcgPrinting {
  const sourceMob = definition.source.kind === "mob" ? definition.source.id : null;
  const fullArtIllustration = variant === "full-art" ? TCG_FULL_ART_ILLUSTRATIONS[definition.id] : null;
  if (variant === "full-art" && !fullArtIllustration) throw new Error(`Full-art printing ${definition.id} lacks generated art`);
  return frozen({
    schema: 1,
    id: printingIdFor(definition.id, setId, variant, finish),
    cardDefinitionId: definition.id,
    setId,
    collectorNumber: `${setId === "wildroads-core" ? "WRC" : setId === "halls-and-hearths" ? "HAH" : "VBL"}-${String(collectorNumber).padStart(3, "0")}${variant === "standard" && finish === "standard" ? "" : `-${variant.slice(0, 3).toUpperCase()}${finish === "standard" ? "" : `-${finish.slice(0, 3).toUpperCase()}`}`}`,
    variant,
    finish,
    illustrationKey: fullArtIllustration ?? (sourceMob
      ? `/creatures/${BUTTERFLY_ORDER.includes(sourceMob as (typeof BUTTERFLY_ORDER)[number]) ? `butterfly-${sourceMob}` : sourceMob}.svg`
      : `cardforge:${definition.source.id}`),
    frameKey: `${setId}:${definition.primaryType ?? "neutral"}:${variant}`,
    acquisitionTags: unique([
      setId,
      variant,
      definition.rarity,
      ...definition.traits.slice(0, 4),
      ...(variant === "capture" ? ["capture"] : []),
      ...(variant === "boss-signature" ? ["boss", "signature"] : []),
      ...(variant === "full-art" ? ["full-art", sourceMob ? "canonical-model-art" : "authored-scene", "wildlight"] : []),
    ]),
    valueModifierPermille: variant === "full-art" ? 5_000
      : variant === "showcase" ? 1_750
        : finish === "foil" ? 1_250
          : variant === "boss-signature" ? 2_500 : 1_000,
    released: true,
  });
}

function buildCatalog(): TcgCatalog {
  const definitions: Record<string, TcgCardDefinition> = {};
  const printings: Record<string, TcgPrinting> = {};
  const definitionOrder: string[] = [];
  const printingOrder: string[] = [];
  const printingsByDefinition: Record<string, string[]> = {};
  const collectorBySet: Record<TcgSetId, number> = { "wildroads-core": 0, "halls-and-hearths": 0, "vaults-below": 0 };

  const addDefinition = (definition: TcgCardDefinition, setId: TcgSetId, variants: readonly TcgVariant[]) => {
    if (definitions[definition.id]) throw new Error(`Duplicate TCG definition id ${definition.id}`);
    definitions[definition.id] = definition;
    definitionOrder.push(definition.id);
    const collectorNumber = ++collectorBySet[setId];
    const ids: string[] = [];
    for (const variant of variants) {
      const finish = variant === "boss-signature" ? "signature" : variant === "full-art" ? "etched" : "standard";
      const printing = printingFor(definition, setId, collectorNumber, variant, finish);
      if (printings[printing.id]) throw new Error(`Duplicate TCG printing id ${printing.id}`);
      printings[printing.id] = printing;
      printingOrder.push(printing.id);
      ids.push(printing.id);
      if (variant === "standard" && definition.rarity !== "legendary") {
        const foil = printingFor(definition, setId, collectorNumber, variant, "foil");
        printings[foil.id] = foil;
        printingOrder.push(foil.id);
        ids.push(foil.id);
      }
    }
    printingsByDefinition[definition.id] = ids;
  };

  for (const kind of MOB_ORDER) {
    const definition = mobCardDefinition(kind);
    const mob = MOB_DEFS[kind];
    const rarity = definition.rarity;
    const variants: TcgVariant[] = ["standard"];
    if (!mob.sentient && mob.family !== "sentient") variants.push("capture");
    if (rarity === "legendary") variants.push("boss-signature");
    else if (rarity === "epic" || mob.dragonType) variants.push("showcase");
    if (TCG_FULL_ART_ILLUSTRATIONS[definition.id]) variants.push("full-art");
    addDefinition(definition, mobSet(mob), variants);
  }
  for (const input of CURATED_CARDS) {
    const definition = curatedDefinition(input);
    const variants: TcgVariant[] = input.rarity === "epic" ? ["standard", "showcase"] : ["standard"];
    if (TCG_FULL_ART_ILLUSTRATIONS[definition.id]) variants.push("full-art");
    addDefinition(definition, input.setId, variants);
  }

  return frozen({
    revision: TCG_CATALOG_REVISION,
    definitions: frozen(definitions),
    printings: frozen(printings),
    definitionOrder: Object.freeze(definitionOrder),
    printingOrder: Object.freeze(printingOrder),
    printingsByDefinition: frozen(Object.fromEntries(Object.entries(printingsByDefinition).map(([key, value]) => [key, Object.freeze(value)]))),
    sets: TCG_SETS,
    packs: TCG_PACKS,
  });
}

export const TCG_CATALOG = buildCatalog();

export function defaultPrintingForDefinition(definitionId: string, catalog = TCG_CATALOG) {
  const ids = catalog.printingsByDefinition[definitionId] ?? [];
  return ids.map((id) => catalog.printings[id]).find((printing) => printing.variant === "standard" && printing.finish === "standard") ?? null;
}

export function tcgDefinitionForPrinting(printingId: string, catalog = TCG_CATALOG) {
  const printing = catalog.printings[printingId];
  return printing ? catalog.definitions[printing.cardDefinitionId] ?? null : null;
}

export function tcgPrintingsForPack(productId: string, rarity?: TcgRarity, catalog = TCG_CATALOG) {
  const product = catalog.packs[productId];
  if (!product) return Object.freeze([] as TcgPrinting[]);
  return Object.freeze(catalog.printingOrder
    .map((id) => catalog.printings[id])
    .filter((printing) => printing.released
      && product.setIds.includes(printing.setId)
      && printing.variant === "standard"
      && printing.finish === "standard"
      && (!rarity || catalog.definitions[printing.cardDefinitionId]?.rarity === rarity)));
}

export function tcgCatalogAudit(catalog = TCG_CATALOG) {
  const errors: string[] = [];
  const mobSources = new Set<string>();
  const guildSources = new Set<string>();
  const keywordSources = new Set<TcgKeyword>();
  const collectorNumbers = new Set<string>();
  const abilityIds = new Set<string>();
  const typeIds = new Set(CREATURE_TYPE_IDS);
  for (const definitionId of catalog.definitionOrder) {
    const definition = catalog.definitions[definitionId];
    if (!definition) { errors.push(`Missing definition ${definitionId}`); continue; }
    if (definition.source.kind === "mob") mobSources.add(definition.source.id);
    for (const guildId of definition.guilds) guildSources.add(guildId);
    for (const keyword of definition.keywords) keywordSources.add(keyword);
    for (const typeId of [definition.primaryType, ...definition.secondaryTypes].filter(Boolean)) {
      if (!typeIds.has(typeId as CreatureTypeId)) errors.push(`Definition ${definitionId} uses unknown type ${typeId}`);
    }
    for (const ability of definition.abilities) {
      if (abilityIds.has(ability.id)) errors.push(`Duplicate ability id ${ability.id}`);
      abilityIds.add(ability.id);
      if (!ability.text.trim() || ability.text.length > 240) errors.push(`Ability ${ability.id} has invalid display text`);
      if ("amount" in ability.effect && (!Number.isInteger(ability.effect.amount) || ability.effect.amount < 0 || ability.effect.amount > 20)) errors.push(`Ability ${ability.id} has invalid amount`);
      if (ability.effect.kind === "draw" && (ability.effect.count < 1 || ability.effect.count > 5)) errors.push(`Ability ${ability.id} has invalid draw count`);
    }
    if (!(catalog.printingsByDefinition[definitionId]?.length > 0)) errors.push(`Definition ${definitionId} has no printing`);
    if (definition.cost < 0 || definition.cost > 10) errors.push(`Definition ${definitionId} has invalid cost`);
    if (definition.class === "creature" || definition.class === "character") {
      if (!Number.isFinite(definition.power) || !Number.isFinite(definition.guard)) errors.push(`Being ${definitionId} lacks combat stats`);
    }
  }
  for (const kind of MOB_ORDER) if (!mobSources.has(kind)) errors.push(`Mob ${kind} has no card`);
  for (const guildId of Object.keys(GUILDS) as GuildId[]) if (!guildSources.has(guildId)) errors.push(`Guild ${guildId} has no card representation`);
  for (const keyword of TCG_KEYWORDS) if (!keywordSources.has(keyword)) errors.push(`Keyword ${keyword} has no released card`);
  for (const printingId of catalog.printingOrder) {
    const printing = catalog.printings[printingId];
    if (!printing) errors.push(`Missing printing ${printingId}`);
    else {
      if (!catalog.definitions[printing.cardDefinitionId]) errors.push(`Printing ${printingId} references unknown definition`);
      const collectorKey = `${printing.setId}:${printing.collectorNumber}`;
      if (collectorNumbers.has(collectorKey)) errors.push(`Duplicate collector number ${collectorKey}`);
      collectorNumbers.add(collectorKey);
      if (!catalog.sets[printing.setId]) errors.push(`Printing ${printingId} references unknown set`);
      if (!printing.illustrationKey) errors.push(`Printing ${printingId} lacks an illustration fallback`);
      if (printing.variant === "full-art" && !printing.illustrationKey.startsWith("/cardforge/full-art")) {
        errors.push(`Full-art printing ${printingId} lacks a reviewed full-bleed illustration`);
      }
    }
  }
  for (const product of Object.values(catalog.packs)) {
    for (const rarity of TCG_RARITY_ORDER) if (tcgPrintingsForPack(product.id, rarity, catalog).length === 0) {
      errors.push(`Pack ${product.id} has no ${rarity} pool`);
    }
  }
  return frozen({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    mobCoverage: mobSources.size,
    mobTotal: MOB_ORDER.length,
    definitions: catalog.definitionOrder.length,
    printings: catalog.printingOrder.length,
  });
}

const catalogAudit = tcgCatalogAudit();
if (!catalogAudit.valid) throw new Error(`Invalid Cardforge catalog:\n${catalogAudit.errors.join("\n")}`);

export function starterDeckPrintingIds(catalog = TCG_CATALOG) {
  const beings = catalog.definitionOrder
    .map((id) => catalog.definitions[id])
    .filter((definition) => (definition.class === "creature" || definition.class === "character") && definition.rarity !== "legendary")
    .sort((left, right) => left.cost - right.cost || left.name.localeCompare(right.name))
    .slice(0, 10);
  const supportIds = [
    "card:authored:field-notes",
    "card:authored:gentle-capture",
    "card:authored:hearthmeal",
    "card:authored:capture-orb",
    "card:authored:wayfarer-compass",
  ];
  const recipe = [
    ...beings.flatMap((definition) => [definition.id, definition.id]),
    ...supportIds.flatMap((id) => [id, id]),
  ].slice(0, 30);
  return Object.freeze(recipe.map((definitionId) => defaultPrintingForDefinition(definitionId, catalog)?.id).filter((id): id is string => Boolean(id)));
}

export function tcgCardSearchText(definition: TcgCardDefinition, printing?: TcgPrinting | null) {
  return [
    definition.name,
    definition.class,
    definition.rarity,
    definition.source.kind,
    definition.source.id,
    definition.primaryType,
    ...definition.secondaryTypes,
    ...definition.factions,
    ...definition.guilds,
    ...definition.traits,
    ...definition.keywords,
    ...definition.abilities.map((entry) => entry.text),
    definition.flavorText,
    printing?.setId,
    printing?.variant,
    printing?.finish,
  ].filter(Boolean).join(" ").toLowerCase();
}
