export const QUEST_BOOK_SCHEMA = 1 as const;
export const MAX_ACTIVE_QUESTS = 128;
export const MAX_QUEST_HISTORY = 2_048;
export const MAX_FACTION_ALIGNMENT = 10_000;
export const MAX_PINNED_QUESTS = 3;

export type QuestKind = "main" | "side";
export type QuestProgressStatus = "active" | "ready";
export type QuestAvailability = "locked" | "available" | "active" | "ready" | "completed" | "failed" | "abandoned";

export type QuestObjective =
  | Readonly<{ id: string; label: string; kind: "survive-day"; targetDay: number }>
  | Readonly<{ id: string; label: string; kind: "discover-town"; factionId?: string | null }>
  | Readonly<{ id: string; label: string; kind: "trade"; count: number; factionId?: string | null }>
  | Readonly<{ id: string; label: string; kind: "kill"; mobKind: string; count: number }>
  | Readonly<{ id: string; label: string; kind: "collect-item"; itemId: string; count: number }>
  | Readonly<{ id: string; label: string; kind: "deliver-item"; itemId: string; count: number }>
  | Readonly<{ id: string; label: string; kind: "interact"; count: number; entityId?: string | null; role?: string | null }>
  | Readonly<{ id: string; label: string; kind: "custom"; eventId: string; count: number }>;

export type QuestFailureCondition =
  | Readonly<{ kind: "deadline"; afterDay: number; reason: string }>
  | Readonly<{ kind: "entity-dies"; entityId?: string | null; role?: string | null; reason: string }>
  | Readonly<{ kind: "custom"; eventId: string; reason: string }>;

export type QuestReward = Readonly<{
  gold: number;
  items: readonly Readonly<{ itemId: string; count: number }>[];
  blueprints: readonly string[];
  factionAlignment: Readonly<Record<string, number>>;
}>;

export type QuestGiverScope = "individual" | "faction-mayor";
export type QuestSource = Readonly<{
  entityId: string;
  role: string | null;
  factionId: string | null;
  isMayor: boolean;
}>;
export type QuestTurnInRoute =
  | Readonly<{ kind: "menu" }>
  | Readonly<{ kind: "individual"; entityId: string; role: string | null; factionId: string | null }>
  | Readonly<{ kind: "faction-mayor"; factionId: string }>;

export type QuestDefinition = Readonly<{
  id: string;
  questlineId: string;
  kind: QuestKind;
  name: string;
  summary: string;
  objectives: readonly QuestObjective[];
  prerequisites?: Readonly<{ allOf?: readonly string[]; anyOf?: readonly string[] }>;
  giver?: Readonly<{
    scope?: QuestGiverScope;
    entityId?: string | null;
    role?: string | null;
    factionId?: string | null;
    failOnDeath?: boolean;
  }> | null;
  failureConditions?: readonly QuestFailureCondition[];
  rewards: QuestReward;
  abandonable?: boolean;
  reacceptAfterAbandon?: boolean;
}>;

export type QuestlineDefinition = Readonly<{
  id: string;
  name: string;
  description: string;
  kind: QuestKind;
  questIds: readonly string[];
}>;

export type ActiveQuest = Readonly<{
  questId: string;
  status: QuestProgressStatus;
  acceptedAt: number;
  giverEntityId: string | null;
  turnInRoute: QuestTurnInRoute;
  objectiveProgress: Readonly<Record<string, number>>;
}>;

export type FailedQuest = Readonly<{ questId: string; failedAt: number; reason: string }>;

export type QuestBook = Readonly<{
  schema: typeof QUEST_BOOK_SCHEMA;
  active: readonly ActiveQuest[];
  completed: readonly string[];
  failed: readonly FailedQuest[];
  abandoned: readonly string[];
  /** Up to three HUD pins. `pinnedQuestId` remains a save/UI compatibility alias for the first pin. */
  pinnedQuestIds: readonly string[];
  pinnedQuestId: string | null;
  factionAlignment: Readonly<Record<string, number>>;
}>;

export type QuestEvent =
  | Readonly<{ type: "day-reached"; day: number; at: number }>
  | Readonly<{ type: "town-discovered"; townId: string; factionId: string; at: number }>
  | Readonly<{ type: "trade-completed"; factionId: string; count?: number; at: number }>
  | Readonly<{ type: "mob-killed"; mobKind: string; count?: number; at: number }>
  | Readonly<{ type: "item-acquired"; itemId: string; count: number; at: number }>
  | Readonly<{ type: "entity-interacted"; entityId: string; role?: string | null; count?: number; at: number }>
  | Readonly<{ type: "entity-died"; entityId: string; role?: string | null; at: number }>
  | Readonly<{ type: "custom"; eventId: string; count?: number; at: number }>;

export type QuestDurableFacts = Readonly<{
  currentDay?: number;
  discoveredTowns?: readonly Readonly<{ townId: string; factionId: string }>[];
  trades?: readonly Readonly<{ factionId: string; count: number }>[];
  kills?: readonly Readonly<{ mobKind: string; count: number }>[];
  acquiredItems?: readonly Readonly<{ itemId: string; count: number }>[];
  interactions?: readonly Readonly<{ entityId: string; role?: string | null; count: number }>[];
  customEvents?: readonly Readonly<{ eventId: string; count: number }>[];
}>;

export type SystemQuestBootstrapOptions = Readonly<{
  acceptedAt?: number;
  facts?: QuestDurableFacts;
  /** Extra system-owned quests for a mode or authored origin. */
  mainQuestIds?: readonly string[];
  sideQuestIds?: readonly string[];
  /** Makes a culture's giver-less discovery quest appropriate at world start. */
  appropriateFactionIds?: readonly string[];
}>;

export const DEFAULT_SYSTEM_MAIN_QUEST_IDS = Object.freeze(["main-first-dawn"] as const);
export const DEFAULT_SYSTEM_SIDE_QUEST_IDS = Object.freeze(["dragonwake-living-archive"] as const);

const EMPTY_REWARD: QuestReward = Object.freeze({ gold: 0, items: [], blueprints: [], factionAlignment: {} });
const finite = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const count = (value: unknown, fallback = 0) => Math.max(0, Math.trunc(finite(value, fallback)));
const cleanId = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 96) : "";

function cleanNullableId(value: unknown) {
  const cleaned = cleanId(value);
  return cleaned || null;
}

function normalizeTurnInRoute(value: unknown, legacyGiverEntityId: string | null): QuestTurnInRoute {
  if (value && typeof value === "object") {
    const route = value as Partial<QuestTurnInRoute> & { entityId?: unknown; role?: unknown; factionId?: unknown };
    if (route.kind === "individual") {
      const entityId = cleanId(route.entityId);
      if (entityId) return { kind: "individual", entityId, role: cleanNullableId(route.role), factionId: cleanNullableId(route.factionId) };
    }
    if (route.kind === "faction-mayor") {
      const factionId = cleanId(route.factionId);
      if (factionId) return { kind: "faction-mayor", factionId };
    }
    if (route.kind === "menu") return { kind: "menu" };
  }
  return legacyGiverEntityId
    ? { kind: "individual", entityId: legacyGiverEntityId, role: null, factionId: null }
    : { kind: "menu" };
}

function giverScope(definition: QuestDefinition): QuestGiverScope | "menu" {
  if (!definition.giver) return "menu";
  return definition.giver.scope === "faction-mayor" ? "faction-mayor" : "individual";
}

export function questSourceCanOffer(definition: QuestDefinition, source: QuestSource | null) {
  const scope = giverScope(definition);
  if (scope === "menu") return true;
  if (!source) return false;
  if (definition.giver?.factionId && definition.giver.factionId !== source.factionId) return false;
  if (scope === "faction-mayor") return source.isMayor;
  if (definition.giver?.entityId && definition.giver.entityId !== source.entityId) return false;
  if (definition.giver?.role && definition.giver.role !== source.role) return false;
  return Boolean(source.entityId);
}

function routeForAcceptance(definition: QuestDefinition, source: QuestSource | null, giverEntityId: string | null): QuestTurnInRoute {
  const scope = giverScope(definition);
  if (scope === "menu") return { kind: "menu" };
  if (scope === "faction-mayor") {
    const factionId = cleanId(definition.giver?.factionId ?? source?.factionId);
    return factionId ? { kind: "faction-mayor", factionId } : { kind: "menu" };
  }
  const entityId = cleanId(source?.entityId ?? giverEntityId ?? definition.giver?.entityId);
  return entityId ? {
    kind: "individual",
    entityId,
    role: cleanNullableId(source?.role ?? definition.giver?.role),
    factionId: cleanNullableId(source?.factionId ?? definition.giver?.factionId),
  } : { kind: "menu" };
}

export function questTurnInRoute(book: QuestBook, definition: QuestDefinition): QuestTurnInRoute {
  const active = normalizeQuestBook(book).active.find((entry) => entry.questId === definition.id);
  return active?.turnInRoute ?? { kind: "menu" };
}

export function questSourceCanTurnIn(book: QuestBook, definition: QuestDefinition, source: QuestSource | null) {
  const route = questTurnInRoute(book, definition);
  if (route.kind === "menu") return true;
  if (!source) return false;
  if (route.kind === "individual") return route.entityId === source.entityId;
  return source.isMayor && source.factionId === route.factionId;
}

export const HEARTHROADS_MAIN_QUESTS: readonly QuestDefinition[] = Object.freeze([
  {
    id: "main-first-dawn",
    questlineId: "hearthroads-main",
    kind: "main",
    name: "A Fire Through First Dawn",
    summary: "Find your footing and live to see the first sunrise.",
    objectives: [{ id: "survive-day-one", label: "Survive through day 1", kind: "survive-day", targetDay: 1 }],
    rewards: { gold: 8, items: [{ itemId: "appleheart-potion", count: 1 }], blueprints: [], factionAlignment: {} },
  },
  {
    id: "main-five-campfires",
    questlineId: "hearthroads-main",
    kind: "main",
    name: "Five Campfires Burning",
    summary: "Hold a home together long enough for the wild to feel familiar.",
    objectives: [{ id: "survive-day-five", label: "Survive through day 5", kind: "survive-day", targetDay: 5 }],
    prerequisites: { allOf: ["main-first-dawn"] },
    rewards: { gold: 22, items: [{ itemId: "wayfarer-draught", count: 1 }], blueprints: [], factionAlignment: {} },
  },
  {
    id: "main-lanterns-on-the-road",
    questlineId: "hearthroads-main",
    kind: "main",
    name: "Lanterns on the Road",
    summary: "Follow smoke, walls, or lamplight until you find a living town.",
    objectives: [{ id: "find-town", label: "Discover a settlement", kind: "discover-town" }],
    prerequisites: { allOf: ["main-first-dawn"] },
    rewards: { gold: 12, items: [], blueprints: [], factionAlignment: {} },
  },
  {
    id: "main-open-hand",
    questlineId: "hearthroads-main",
    kind: "main",
    name: "An Open Hand",
    summary: "Learn the road's oldest language: offer something useful and trade fairly.",
    objectives: [{ id: "first-trade", label: "Complete your first trade", kind: "trade", count: 1 }],
    prerequisites: { allOf: ["main-lanterns-on-the-road"], anyOf: ["main-five-campfires", "main-lanterns-on-the-road"] },
    rewards: { gold: 18, items: [{ itemId: "glass-bottle", count: 3 }], blueprints: [], factionAlignment: { hobbits: 1, goblins: 1 } },
  },
  {
    id: "main-rumor-under-stone",
    questlineId: "hearthroads-main",
    kind: "main",
    name: "A Rumor Under Stone",
    summary: "Follow a survey, a cavern tremor, or your own luck to the threshold of an elder dragon's underground lair.",
    objectives: [{ id: "discover-dragon-lair", label: "Discover a stage 4 or 5 dragon lair", kind: "custom", eventId: "dragon-lair-discovered", count: 1 }],
    prerequisites: { allOf: ["main-five-campfires", "main-open-hand"] },
    rewards: { gold: 80, items: [{ itemId: "dragon-meal", count: 2 }], blueprints: ["draconic-incubator"], factionAlignment: {} },
  },
  {
    id: "main-teeth-of-the-deep",
    questlineId: "hearthroads-main",
    kind: "main",
    name: "Teeth of the Deep",
    summary: "Survive an elder dragon on its own ground and bring the road proof that these buried powers can be faced.",
    objectives: [{ id: "slay-elder-dragon", label: "Defeat a dragon of stage 4 or higher", kind: "custom", eventId: "dragon-killed-stage-4-plus", count: 1 }],
    prerequisites: { allOf: ["main-rumor-under-stone"] },
    rewards: { gold: 180, items: [{ itemId: "dragon-bone", count: 8 }], blueprints: ["dragonbone-arms"], factionAlignment: {} },
  },
  {
    id: "main-dragonwake-attunement",
    questlineId: "hearthroads-main",
    kind: "main",
    name: "The Dragonwake Accord",
    summary: "Shape the remains without becoming the thing you defeated. Wearing or wielding your first draconic craft completes the attunement that awakens mana.",
    objectives: [{ id: "equip-draconic-craft", label: "Equip a dragonbone weapon, tool, or dragon-scale armor piece", kind: "custom", eventId: "draconic-gear-equipped", count: 1 }],
    prerequisites: { allOf: ["main-teeth-of-the-deep"] },
    rewards: { gold: 240, items: [{ itemId: "manaheart-draught", count: 1 }, { itemId: "tome-arcane-ward", count: 1 }], blueprints: ["dragon-scale-armor", "dragon-husbandry"], factionAlignment: {} },
  },
  {
    id: "main-the-fifth-shadow",
    questlineId: "hearthroads-main",
    kind: "main",
    name: "The Fifth Shadow",
    summary: "Face a fully elder stage-five dragon after attunement. This is proof of mastery, not the price of learning magic.",
    objectives: [{ id: "slay-stage-five-dragon", label: "Defeat a stage 5 dragon", kind: "custom", eventId: "dragon-killed-stage-5", count: 1 }],
    prerequisites: { allOf: ["main-dragonwake-attunement"] },
    rewards: { gold: 420, items: [{ itemId: "manaheart-draught", count: 3 }, { itemId: "tome-flame-jet", count: 1 }], blueprints: [], factionAlignment: {} },
  },
] as readonly QuestDefinition[]);

export const DRAGONWAKE_SIDE_QUESTS: readonly QuestDefinition[] = Object.freeze([
  {
    id: "dragonwake-living-archive",
    questlineId: "dragonwake-field-studies",
    kind: "side",
    name: "A Living Archive",
    summary: "The first spell archivists learned by watching the impossible creatures of Blockwild was movement itself.",
    objectives: [{ id: "capture-rare-creatures", label: "Capture three different rare creatures", kind: "custom", eventId: "rare-creature-species-captured", count: 3 }],
    rewards: { gold: 95, items: [{ itemId: "tome-blinkstep", count: 1 }], blueprints: [], factionAlignment: {} },
    abandonable: true,
    reacceptAfterAbandon: true,
  },
  {
    id: "dragonwake-scale-scholar",
    questlineId: "dragonwake-field-studies",
    kind: "side",
    name: "Scale, Spark, and Script",
    summary: "Bring an intact elemental scale to a learned merchant so its natural pattern can be translated into a reusable spell tome.",
    objectives: [{ id: "deliver-dragon-scale", label: "Deliver an elemental dragon scale", kind: "custom", eventId: "dragon-scale-delivered", count: 1 }],
    giver: { role: "alchemist", failOnDeath: true },
    failureConditions: [{ kind: "entity-dies", role: "alchemist", reason: "The scholar who commissioned the translation has died." }],
    rewards: { gold: 120, items: [{ itemId: "tome-healing-light", count: 1 }], blueprints: [], factionAlignment: {} },
    abandonable: true,
    reacceptAfterAbandon: true,
  },
  {
    id: "dragonwake-three-temperatures",
    questlineId: "dragonwake-field-studies",
    kind: "side",
    name: "Three Temperatures of Courage",
    summary: "Record Fire, Ice, and Steel dragon lairs without needing to defeat their guardians.",
    objectives: [
      { id: "survey-fire-lair", label: "Record a Fire Dragon lair", kind: "custom", eventId: "fire-dragon-lair-recorded", count: 1 },
      { id: "survey-ice-lair", label: "Record an Ice Dragon lair", kind: "custom", eventId: "ice-dragon-lair-recorded", count: 1 },
      { id: "survey-steel-lair", label: "Record a Steel Dragon lair", kind: "custom", eventId: "steel-dragon-lair-recorded", count: 1 },
    ],
    prerequisites: { allOf: ["main-rumor-under-stone"] },
    rewards: { gold: 210, items: [{ itemId: "tome-frost-lance", count: 1 }, { itemId: "tome-steel-spear", count: 1 }], blueprints: [], factionAlignment: {} },
    abandonable: true,
    reacceptAfterAbandon: true,
  },
]);

export const HOBBIT_FACTION_QUESTS: readonly QuestDefinition[] = Object.freeze([
  {
    id: "hobbit-smoke-on-the-hedgerow",
    questlineId: "hobbit-hearth-and-hedge",
    kind: "side",
    name: "Smoke on the Hedgerow",
    summary: "Find a Hearthkin freehold where lamps, tilled rows, and low walls make a warm mark against the wild.",
    objectives: [{ id: "discover-hobbit-town", label: "Discover a Hearthkin settlement", kind: "discover-town", factionId: "hobbits" }],
    giver: null,
    rewards: { gold: 24, items: [{ itemId: "apple", count: 4 }], blueprints: [], factionAlignment: { hobbits: 5 } },
    abandonable: true,
    reacceptAfterAbandon: true,
  },
  {
    id: "hobbit-long-table-watch",
    questlineId: "hobbit-hearth-and-hedge",
    kind: "side",
    name: "The Long-Table Watch",
    summary: "Provision the freehold and clear the dead from its roads before the next long-table gathering.",
    objectives: [
      { id: "deliver-honeymead", label: "Deliver 8 bottles of Honeymead", kind: "deliver-item", itemId: "honeymead", count: 8 },
      { id: "defeat-freehold-zombies", label: "Defeat 12 Zombies", kind: "kill", mobKind: "zombie", count: 12 },
    ],
    prerequisites: { allOf: ["hobbit-smoke-on-the-hedgerow"] },
    giver: { scope: "faction-mayor", factionId: "hobbits" },
    rewards: { gold: 165, items: [{ itemId: "fine-crossbow", count: 1 }, { itemId: "crossbow-bolt", count: 24 }], blueprints: [], factionAlignment: { hobbits: 16 } },
    abandonable: true,
    reacceptAfterAbandon: true,
  },
] as readonly QuestDefinition[]);

export const GOBLIN_FACTION_QUESTS: readonly QuestDefinition[] = Object.freeze([
  {
    id: "goblin-brass-on-the-ridge",
    questlineId: "goblin-root-and-brass",
    kind: "side",
    name: "Brass on the Ridge",
    summary: "Find a Brassroot clanhold where steep roads and watchful gates divide useful stone from empty danger.",
    objectives: [{ id: "discover-goblin-town", label: "Discover a Goblin settlement", kind: "discover-town", factionId: "goblins" }],
    giver: null,
    rewards: { gold: 24, items: [{ itemId: "fiber", count: 8 }], blueprints: [], factionAlignment: { goblins: 5 } },
    abandonable: true,
    reacceptAfterAbandon: true,
  },
  {
    id: "goblin-ridge-under-bone",
    questlineId: "goblin-root-and-brass",
    kind: "side",
    name: "A Ridge Under Bone",
    summary: "Bring worked metal to the clanhold and break the archers haunting its higher switchbacks.",
    objectives: [
      // Objective id is intentionally stable for pre-overhaul quest-book saves.
      { id: "deliver-sunmetal", label: "Deliver 12 Iron Ingots", kind: "deliver-item", itemId: "iron-ingot", count: 12 },
      { id: "defeat-ridge-skeletons", label: "Defeat 10 Skeleton Archers", kind: "kill", mobKind: "skeleton", count: 10 },
    ],
    prerequisites: { allOf: ["goblin-brass-on-the-ridge"] },
    giver: { scope: "faction-mayor", factionId: "goblins" },
    rewards: { gold: 175, items: [{ itemId: "tempered-spear", count: 1 }, { itemId: "goblin-tonic", count: 2 }], blueprints: [], factionAlignment: { goblins: 16 } },
    abandonable: true,
    reacceptAfterAbandon: true,
  },
] as readonly QuestDefinition[]);

export const ATLANTIAN_FACTION_QUESTS: readonly QuestDefinition[] = Object.freeze([
  {
    id: "atlantian-light-below",
    questlineId: "atlantian-lumen-tides",
    kind: "side",
    name: "The Light Below",
    summary: "Find the patient lights of an Atlantian tidehold beneath the open sea.",
    objectives: [{ id: "discover-atlantian-town", label: "Discover an Atlantian settlement", kind: "discover-town", factionId: "atlantians" }],
    // Static discovery quests are accepted from the journal, never bound to a
    // transient resident id. This keeps old partially active saves pinnable.
    giver: null,
    rewards: { gold: 20, items: [{ itemId: "glowmender-salve", count: 1 }], blueprints: [], factionAlignment: { atlantians: 5 } },
    abandonable: true,
    reacceptAfterAbandon: true,
  },
  {
    id: "atlantian-fair-current",
    questlineId: "atlantian-lumen-tides",
    kind: "side",
    name: "A Fair Current",
    summary: "Learn what the tidehold values by making a peaceful trade with its people.",
    objectives: [{ id: "trade-with-atlantians", label: "Complete an Atlantian trade", kind: "trade", count: 1, factionId: "atlantians" }],
    prerequisites: { allOf: ["atlantian-light-below"] },
    giver: { scope: "faction-mayor", factionId: "atlantians" },
    rewards: { gold: 32, items: [{ itemId: "lumen-pearl", count: 1 }], blueprints: [], factionAlignment: { atlantians: 7 } },
    abandonable: true,
    reacceptAfterAbandon: true,
  },
] as readonly QuestDefinition[]);

export const SUGARCOURT_FACTION_QUESTS: readonly QuestDefinition[] = Object.freeze([
  {
    id: "sugarcourt-beyond-sugarwind",
    questlineId: "sugarcourt-measured-welcome",
    kind: "side",
    name: "Beyond the Sugarwind",
    summary: "Find a Bonbon Borough where the Sugarplum Vale begins to smell of mint and warm syrup.",
    objectives: [{ id: "discover-sugarcourt-town", label: "Discover a Sugarcourt settlement", kind: "discover-town", factionId: "sugarcourt" }],
    rewards: { gold: 20, items: [{ itemId: "peppermint-starts", count: 3 }], blueprints: [], factionAlignment: { sugarcourt: 5 } },
    abandonable: true,
    reacceptAfterAbandon: true,
  },
  {
    id: "sugarcourt-measured-trade",
    questlineId: "sugarcourt-measured-welcome",
    kind: "side",
    name: "A Measured Welcome",
    summary: "Learn the Concord's rule of hospitality: a sweet bargain should leave both sides glad they measured twice.",
    objectives: [{ id: "trade-with-sugarcourt", label: "Complete a Sugarcourt trade", kind: "trade", count: 1, factionId: "sugarcourt" }],
    prerequisites: { allOf: ["sugarcourt-beyond-sugarwind"] },
    giver: { scope: "faction-mayor", factionId: "sugarcourt" },
    rewards: { gold: 32, items: [{ itemId: "syrup-bucket", count: 1 }], blueprints: [], factionAlignment: { sugarcourt: 7 } },
    abandonable: true,
    reacceptAfterAbandon: true,
  },
] as readonly QuestDefinition[]);

export const WOOD_ELF_FACTION_QUESTS: readonly QuestDefinition[] = Object.freeze([
  {
    id: "wood-elf-under-living-light", questlineId: "wood-elf-moonbough-oaths", kind: "side", name: "Under Living Light",
    summary: "Find a Moonbough Enclave where Glimmerwood paths continue to glow after sunset.",
    objectives: [{ id: "discover-wood-elf-town", label: "Discover a Wood Elf settlement", kind: "discover-town", factionId: "wood-elves" }],
    giver: null,
    rewards: { gold: 28, items: [{ itemId: "moonpetal", count: 4 }], blueprints: [], factionAlignment: { "wood-elves": 5 } },
    abandonable: true, reacceptAfterAbandon: true,
  },
  {
    id: "wood-elf-leaves-remember", questlineId: "wood-elf-moonbough-oaths", kind: "side", name: "The Leaves Remember",
    summary: "Help a Leafwarden preserve the enclave without cutting down the thing it protects.",
    objectives: [{ id: "defend-enclave", label: "Defend a Moonbough Enclave", kind: "custom", eventId: "wood-elf-enclave-defended", count: 1 }],
    prerequisites: { allOf: ["wood-elf-under-living-light"] }, giver: { role: "wood-elf-leafwarden", factionId: "wood-elves", failOnDeath: true },
    rewards: { gold: 86, items: [{ itemId: "tome-verdant-volley", count: 1 }], blueprints: ["glimmerbow"], factionAlignment: { "wood-elves": 10 } },
    abandonable: true, reacceptAfterAbandon: true,
  },
  {
    id: "wood-elf-moonwell-constellations", questlineId: "wood-elf-moonbough-oaths", kind: "side", name: "Constellations in the Well",
    summary: "Bring luminous ingredients to a Potioner so the Moonwell can reflect a clear sky even beneath leaves.",
    objectives: [
      { id: "deliver-moonpetals", label: "Deliver 8 Moonpetals", kind: "deliver-item", itemId: "moonpetal", count: 8 },
      { id: "deliver-starfern", label: "Deliver 6 Starfern Fronds", kind: "deliver-item", itemId: "starfern", count: 6 },
    ],
    prerequisites: { allOf: ["wood-elf-under-living-light"] }, giver: { role: "wood-elf-potioner", factionId: "wood-elves", failOnDeath: true },
    rewards: { gold: 72, items: [{ itemId: "moonstep-elixir", count: 2 }], blueprints: ["moonstep", "verdant-renewal"], factionAlignment: { "wood-elves": 8 } },
    abandonable: true, reacceptAfterAbandon: true,
  },
] as readonly QuestDefinition[]);

export const DWARF_FACTION_QUESTS: readonly QuestDefinition[] = Object.freeze([
  {
    id: "dwarf-lantern-in-snow", questlineId: "dwarf-deepgear-oaths", kind: "side", name: "A Lantern in the Snow",
    summary: "Find a guarded Deepgear entrance and follow its bright lanterns into the mountain.",
    objectives: [{ id: "discover-dwarf-town", label: "Discover a Dwarven settlement", kind: "discover-town", factionId: "dwarves" }],
    giver: null,
    rewards: { gold: 30, items: [{ itemId: "deepgear-lantern", count: 1 }], blueprints: [], factionAlignment: { dwarves: 5 } },
    abandonable: true, reacceptAfterAbandon: true,
  },
  {
    id: "dwarf-first-spark", questlineId: "dwarf-deepgear-oaths", kind: "side", name: "The First Useful Spark",
    summary: "Learn a golem's real cost: a proven blueprint, prepared materials, patient assembly, and mana committed at finalization.",
    objectives: [{ id: "forge-copper-scout", label: "Complete a Copper Scout at a Golem Forge", kind: "custom", eventId: "golem-copper-scout-completed", count: 1 }],
    prerequisites: { allOf: ["dwarf-lantern-in-snow"] }, giver: { role: "dwarf-golemsmith", factionId: "dwarves", failOnDeath: true },
    rewards: { gold: 110, items: [{ itemId: "gear-cluster", count: 4 }], blueprints: ["golem-stone-bulwark"], factionAlignment: { dwarves: 11 } },
    abandonable: true, reacceptAfterAbandon: true,
  },
  {
    id: "dwarf-smoke-and-measure", questlineId: "dwarf-deepgear-oaths", kind: "side", name: "Smoke and Measure",
    summary: "Prove that a flintlock is a measured tool by learning its plan and striking a hostile creature at range.",
    objectives: [
      { id: "unlock-flintlock", label: "Learn the Deepgear Flintlock blueprint", kind: "custom", eventId: "blueprint-flintlock-pistol-unlocked", count: 1 },
      { id: "flintlock-hit", label: "Hit a hostile creature with a flintlock", kind: "custom", eventId: "flintlock-hostile-hit", count: 1 },
    ],
    prerequisites: { allOf: ["dwarf-lantern-in-snow"] }, giver: { role: "dwarf-powderwright", factionId: "dwarves", failOnDeath: true },
    rewards: { gold: 95, items: [{ itemId: "lead-ball", count: 24 }], blueprints: [], factionAlignment: { dwarves: 8 } },
    abandonable: true, reacceptAfterAbandon: true,
  },
] as readonly QuestDefinition[]);

export const SEA_DRAGON_QUESTS: readonly QuestDefinition[] = Object.freeze([
  {
    id: "sea-dragon-pressure-lines", questlineId: "sea-dragon-deep-current", kind: "side", name: "Pressure Lines",
    summary: "Use an Atlantian chart or your own deep-sea exploration to locate a Sea Dragon nest.",
    objectives: [{ id: "discover-sea-nest", label: "Discover a Sea Dragon nest", kind: "custom", eventId: "sea-dragon-nest-discovered", count: 1 }],
    prerequisites: { allOf: ["atlantian-light-below"] }, giver: null,
    rewards: { gold: 130, items: [{ itemId: "water-breathing-potion", count: 2 }], blueprints: [], factionAlignment: { atlantians: 6 } },
    abandonable: true, reacceptAfterAbandon: true,
  },
  {
    id: "sea-dragon-tidebound-hatchling", questlineId: "sea-dragon-deep-current", kind: "side", name: "Tidebound Hatchling",
    summary: "Hatch a Sea Dragon egg beneath water and form a patient bond before it grows large enough to ride.",
    objectives: [
      { id: "hatch-sea-dragon", label: "Hatch a Sea Dragon egg", kind: "custom", eventId: "sea-dragon-hatched", count: 1 },
      { id: "tame-sea-dragon", label: "Tame the Sea Dragon hatchling", kind: "custom", eventId: "sea-dragon-tamed", count: 1 },
    ],
    prerequisites: { allOf: ["sea-dragon-pressure-lines", "main-dragonwake-attunement"] },
    rewards: { gold: 260, items: [{ itemId: "dragon-meal", count: 4 }], blueprints: ["dragon-husbandry"], factionAlignment: { atlantians: 12 } },
    abandonable: true, reacceptAfterAbandon: true,
  },
] as readonly QuestDefinition[]);

export const HEARTHROADS_QUESTLINES: readonly QuestlineDefinition[] = Object.freeze([
  {
    id: "hearthroads-main",
    name: "The Hearthroads",
    description: "A branching main story about surviving, finding other people, and choosing what kind of place to build among them.",
    kind: "main",
    questIds: HEARTHROADS_MAIN_QUESTS.map((quest) => quest.id),
  },
]);

export const ATLANTIAN_QUESTLINE: QuestlineDefinition = Object.freeze({
  id: "atlantian-lumen-tides",
  name: "The Lumen Tides",
  description: "A peaceful first-contact line about reaching an underwater settlement and learning its current of trade.",
  kind: "side",
  questIds: ATLANTIAN_FACTION_QUESTS.map((quest) => quest.id),
});

export const SUGARCOURT_QUESTLINE: QuestlineDefinition = Object.freeze({
  id: "sugarcourt-measured-welcome",
  name: "A Measured Welcome",
  description: "A first-contact line about finding a Bonbon Borough and learning the Sugarcourt Concord's careful craft of trade.",
  kind: "side",
  questIds: SUGARCOURT_FACTION_QUESTS.map((quest) => quest.id),
});

export const HOBBIT_QUESTLINE: QuestlineDefinition = Object.freeze({
  id: "hobbit-hearth-and-hedge",
  name: "Hearth and Hedge",
  description: "Hearthkin faction work about provisioning a freehold and keeping its roads safe enough for ordinary life.",
  kind: "side",
  questIds: HOBBIT_FACTION_QUESTS.map((quest) => quest.id),
});

export const GOBLIN_QUESTLINE: QuestlineDefinition = Object.freeze({
  id: "goblin-root-and-brass",
  name: "Root and Brass",
  description: "Brassroot faction work about measured materials, defended switchbacks, and hard bargains earned in the field.",
  kind: "side",
  questIds: GOBLIN_FACTION_QUESTS.map((quest) => quest.id),
});

export const DRAGONWAKE_QUESTLINE: QuestlineDefinition = Object.freeze({
  id: "dragonwake-field-studies",
  name: "The Dragonwake Field Studies",
  description: "Optional archive work about rare creatures, elemental lairs, and the repeatable patterns that became Blockwild's first spells.",
  kind: "side",
  questIds: DRAGONWAKE_SIDE_QUESTS.map((quest) => quest.id),
});

export const WOOD_ELF_QUESTLINE: QuestlineDefinition = Object.freeze({
  id: "wood-elf-moonbough-oaths",
  name: "Moonbough Oaths",
  description: "A quiet faction line about living magic, luminous stewardship, and defending an enclave without consuming it.",
  kind: "side",
  questIds: WOOD_ELF_FACTION_QUESTS.map((quest) => quest.id),
});

export const DWARF_QUESTLINE: QuestlineDefinition = Object.freeze({
  id: "dwarf-deepgear-oaths",
  name: "Deepgear Oaths",
  description: "A mountain faction line about safe galleries, measured powder, and mana committed to useful constructs.",
  kind: "side",
  questIds: DWARF_FACTION_QUESTS.map((quest) => quest.id),
});

export const SEA_DRAGON_QUESTLINE: QuestlineDefinition = Object.freeze({
  id: "sea-dragon-deep-current",
  name: "The Deep Current",
  description: "Atlantian-assisted fieldwork around rare Sea Dragon nests, underwater hatching, and tidebound husbandry.",
  kind: "side",
  questIds: SEA_DRAGON_QUESTS.map((quest) => quest.id),
});

export const DEFAULT_QUEST_DEFINITIONS: readonly QuestDefinition[] = Object.freeze([
  ...HEARTHROADS_MAIN_QUESTS,
  ...HOBBIT_FACTION_QUESTS,
  ...GOBLIN_FACTION_QUESTS,
  ...ATLANTIAN_FACTION_QUESTS,
  ...SUGARCOURT_FACTION_QUESTS,
  ...DRAGONWAKE_SIDE_QUESTS,
  ...WOOD_ELF_FACTION_QUESTS,
  ...DWARF_FACTION_QUESTS,
  ...SEA_DRAGON_QUESTS,
]);

export const DEFAULT_QUESTLINES: readonly QuestlineDefinition[] = Object.freeze([
  ...HEARTHROADS_QUESTLINES,
  HOBBIT_QUESTLINE,
  GOBLIN_QUESTLINE,
  ATLANTIAN_QUESTLINE,
  SUGARCOURT_QUESTLINE,
  DRAGONWAKE_QUESTLINE,
  WOOD_ELF_QUESTLINE,
  DWARF_QUESTLINE,
  SEA_DRAGON_QUESTLINE,
]);

export function createQuestBook(): QuestBook {
  return { schema: QUEST_BOOK_SCHEMA, active: [], completed: [], failed: [], abandoned: [], pinnedQuestIds: [], pinnedQuestId: null, factionAlignment: {} };
}

function normalizeActiveQuest(value: unknown): ActiveQuest | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<ActiveQuest>;
  const questId = cleanId(input.questId);
  if (!questId) return null;
  const objectiveProgress: Record<string, number> = {};
  if (input.objectiveProgress && typeof input.objectiveProgress === "object") {
    for (const [id, value] of Object.entries(input.objectiveProgress)) {
      const clean = cleanId(id);
      if (clean) objectiveProgress[clean] = Math.min(1_000_000_000, count(value));
    }
  }
  const giverEntityId = input.giverEntityId === null ? null : cleanId(input.giverEntityId) || null;
  return {
    questId,
    status: input.status === "ready" ? "ready" : "active",
    acceptedAt: count(input.acceptedAt),
    giverEntityId,
    turnInRoute: normalizeTurnInRoute(input.turnInRoute, giverEntityId),
    objectiveProgress,
  };
}

export function normalizeQuestBook(value: unknown): QuestBook {
  if (!value || typeof value !== "object") return createQuestBook();
  const input = value as Partial<QuestBook>;
  const activeById = new Map<string, ActiveQuest>();
  for (const raw of Array.isArray(input.active) ? input.active : []) {
    const quest = normalizeActiveQuest(raw);
    if (quest && !activeById.has(quest.questId) && activeById.size < MAX_ACTIVE_QUESTS) activeById.set(quest.questId, quest);
  }
  const completed = [...new Set((Array.isArray(input.completed) ? input.completed : []).map(cleanId).filter(Boolean))]
    .slice(0, MAX_QUEST_HISTORY);
  const failedById = new Map<string, FailedQuest>();
  for (const raw of Array.isArray(input.failed) ? input.failed : []) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as Partial<FailedQuest>;
    const questId = cleanId(entry.questId);
    if (!questId || failedById.has(questId)) continue;
    failedById.set(questId, { questId, failedAt: count(entry.failedAt), reason: typeof entry.reason === "string" ? entry.reason.slice(0, 160) : "Quest failed." });
    if (failedById.size >= MAX_QUEST_HISTORY) break;
  }
  const abandoned = [...new Set((Array.isArray(input.abandoned) ? input.abandoned : []).map(cleanId).filter(Boolean))]
    .slice(0, MAX_QUEST_HISTORY);
  const factionAlignment: Record<string, number> = {};
  if (input.factionAlignment && typeof input.factionAlignment === "object") {
    for (const [rawFaction, rawValue] of Object.entries(input.factionAlignment)) {
      const faction = cleanId(rawFaction);
      if (faction) factionAlignment[faction] = Math.max(-MAX_FACTION_ALIGNMENT, Math.min(MAX_FACTION_ALIGNMENT, Math.trunc(finite(rawValue))));
    }
  }
  const active = [...activeById.values()];
  const legacyPin = typeof input.pinnedQuestId === "string" ? input.pinnedQuestId : null;
  const requestedPins = Array.isArray(input.pinnedQuestIds) ? input.pinnedQuestIds : legacyPin ? [legacyPin] : [];
  const pinnedQuestIds = [...new Set(requestedPins.map(cleanId).filter((questId) => activeById.has(questId)))].slice(0, MAX_PINNED_QUESTS);
  const pinnedQuestId = pinnedQuestIds[0] ?? null;
  return { schema: QUEST_BOOK_SCHEMA, active, completed, failed: [...failedById.values()], abandoned, pinnedQuestIds, pinnedQuestId, factionAlignment };
}

function definitionsById(definitions: readonly QuestDefinition[]) {
  return new Map(definitions.map((definition) => [definition.id, definition]));
}

function prerequisitesMet(book: QuestBook, definition: QuestDefinition) {
  const allOf = definition.prerequisites?.allOf ?? [];
  const anyOf = definition.prerequisites?.anyOf ?? [];
  return allOf.every((questId) => book.completed.includes(questId))
    && (anyOf.length === 0 || anyOf.some((questId) => book.completed.includes(questId)));
}

export function questAvailability(book: QuestBook, definition: QuestDefinition): QuestAvailability {
  const normalized = normalizeQuestBook(book);
  const active = normalized.active.find((entry) => entry.questId === definition.id);
  if (active) return active.status;
  if (normalized.completed.includes(definition.id)) return "completed";
  if (normalized.failed.some((entry) => entry.questId === definition.id)) return "failed";
  if (normalized.abandoned.includes(definition.id)) return "abandoned";
  return prerequisitesMet(normalized, definition) ? "available" : "locked";
}

/** Locked work stays out of the journal; offerable, active, and historical work remains legible. */
export function questVisibleInJournal(book: QuestBook, definition: QuestDefinition, source: QuestSource | null = null) {
  const availability = questAvailability(book, definition);
  if (availability === "locked") return false;
  if (availability === "available" || availability === "abandoned") return questSourceCanOffer(definition, source);
  return true;
}

function targetForObjective(objective: QuestObjective) {
  if (objective.kind === "survive-day") return objective.targetDay;
  if (objective.kind === "discover-town") return 1;
  return objective.count;
}

function reportableObjectivesComplete(definition: QuestDefinition, progress: Readonly<Record<string, number>>) {
  return definition.objectives
    .filter((objective) => objective.kind !== "deliver-item")
    .every((objective) => (progress[objective.id] ?? 0) >= targetForObjective(objective));
}

export function acceptQuest(
  book: QuestBook,
  definitions: readonly QuestDefinition[],
  questId: string,
  acceptedAt: number,
  giverEntityId: string | null = null,
  source: QuestSource | null = null,
) {
  const normalized = normalizeQuestBook(book);
  const definition = definitionsById(definitions).get(questId);
  if (!definition) return { ok: false, reason: "unknown-quest", book: normalized } as const;
  const availability = questAvailability(normalized, definition);
  if (!(availability === "available" || (availability === "abandoned" && definition.kind === "side" && definition.reacceptAfterAbandon !== false))) {
    return { ok: false, reason: availability === "locked" ? "prerequisites" : "unavailable", book: normalized } as const;
  }
  if (normalized.active.length >= MAX_ACTIVE_QUESTS) return { ok: false, reason: "quest-log-full", book: normalized } as const;
  const objectiveProgress = Object.fromEntries(definition.objectives.map((objective) => [objective.id, 0]));
  const status = reportableObjectivesComplete(definition, objectiveProgress) ? "ready" : "active";
  const active: ActiveQuest = {
    questId,
    status,
    acceptedAt: count(acceptedAt),
    giverEntityId: giverScope(definition) === "faction-mayor" ? null : cleanId(source?.entityId ?? giverEntityId) || null,
    turnInRoute: routeForAcceptance(definition, source, giverEntityId),
    objectiveProgress,
  };
  return {
    ok: true,
    reason: null,
    book: { ...normalized, active: [...normalized.active, active], abandoned: normalized.abandoned.filter((id) => id !== questId) },
  } as const;
}

/**
 * Interaction-facing entry point. Individual work is visible/acceptable only
 * from that resident; faction-wide work may be issued by any mayor of the
 * matching faction. System/main-story quests remain journal-owned.
 */
export function acceptQuestFromSource(
  book: QuestBook,
  definitions: readonly QuestDefinition[],
  questId: string,
  acceptedAt: number,
  source: QuestSource | null,
) {
  const normalized = normalizeQuestBook(book);
  const definition = definitionsById(definitions).get(questId);
  if (!definition) return { ok: false, reason: "unknown-quest", book: normalized } as const;
  if (!questSourceCanOffer(definition, source)) return { ok: false, reason: "wrong-source", book: normalized } as const;
  return acceptQuest(normalized, definitions, questId, acceptedAt, source?.entityId ?? null, source);
}

export function pinQuest(book: QuestBook, questId: string | null) {
  const normalized = normalizeQuestBook(book);
  if (questId === null) return { ...normalized, pinnedQuestIds: [], pinnedQuestId: null };
  if (!normalized.active.some((quest) => quest.questId === questId) || normalized.pinnedQuestIds.includes(questId) || normalized.pinnedQuestIds.length >= MAX_PINNED_QUESTS) return normalized;
  const pinnedQuestIds = [...normalized.pinnedQuestIds, questId];
  return { ...normalized, pinnedQuestIds, pinnedQuestId: pinnedQuestIds[0] ?? null };
}

export function togglePinnedQuest(book: QuestBook, questId: string) {
  const normalized = normalizeQuestBook(book);
  if (normalized.pinnedQuestIds.includes(questId)) {
    const pinnedQuestIds = normalized.pinnedQuestIds.filter((id) => id !== questId);
    return { ...normalized, pinnedQuestIds, pinnedQuestId: pinnedQuestIds[0] ?? null };
  }
  return pinQuest(normalized, questId);
}

export function abandonQuest(book: QuestBook, definitions: readonly QuestDefinition[], questId: string) {
  const normalized = normalizeQuestBook(book);
  const definition = definitionsById(definitions).get(questId);
  const active = normalized.active.find((entry) => entry.questId === questId);
  if (!definition || !active) return { ok: false, reason: "not-active", book: normalized } as const;
  if (definition.kind !== "side" || definition.abandonable === false) return { ok: false, reason: "cannot-abandon", book: normalized } as const;
  return {
    ok: true,
    reason: null,
    book: {
      ...normalized,
      active: normalized.active.filter((entry) => entry.questId !== questId),
      abandoned: [...new Set([...normalized.abandoned, questId])].slice(-MAX_QUEST_HISTORY),
      pinnedQuestIds: normalized.pinnedQuestIds.filter((id) => id !== questId),
      pinnedQuestId: normalized.pinnedQuestIds.filter((id) => id !== questId)[0] ?? null,
    },
  } as const;
}

function eventProgress(objective: QuestObjective, previous: number, event: QuestEvent) {
  if (objective.kind === "survive-day" && event.type === "day-reached") return Math.max(previous, count(event.day));
  if (objective.kind === "discover-town" && event.type === "town-discovered" && (!objective.factionId || objective.factionId === event.factionId)) return 1;
  if (objective.kind === "trade" && event.type === "trade-completed" && (!objective.factionId || objective.factionId === event.factionId)) return previous + Math.max(1, count(event.count, 1));
  if (objective.kind === "kill" && event.type === "mob-killed" && objective.mobKind === event.mobKind) return previous + Math.max(1, count(event.count, 1));
  if (objective.kind === "collect-item" && event.type === "item-acquired" && objective.itemId === event.itemId) return previous + count(event.count);
  if (objective.kind === "interact" && event.type === "entity-interacted"
    && (!objective.entityId || objective.entityId === event.entityId)
    && (!objective.role || objective.role === event.role)) return previous + Math.max(1, count(event.count, 1));
  if (objective.kind === "custom" && event.type === "custom" && objective.eventId === event.eventId) return previous + Math.max(1, count(event.count, 1));
  return previous;
}

function failureReason(definition: QuestDefinition, active: ActiveQuest, event: QuestEvent) {
  if (event.type === "entity-died" && definition.giver?.failOnDeath && active.giverEntityId === event.entityId) return "The quest giver died.";
  for (const condition of definition.failureConditions ?? []) {
    if (condition.kind === "deadline" && event.type === "day-reached" && event.day > condition.afterDay) return condition.reason;
    if (condition.kind === "entity-dies" && event.type === "entity-died"
      && (!condition.entityId || condition.entityId === event.entityId)
      && (!condition.role || condition.role === event.role)) return condition.reason;
    if (condition.kind === "custom" && event.type === "custom" && condition.eventId === event.eventId) return condition.reason;
  }
  return null;
}

export function applyQuestEvent(book: QuestBook, definitions: readonly QuestDefinition[], event: QuestEvent) {
  const normalized = normalizeQuestBook(book);
  const byId = definitionsById(definitions);
  const failed: FailedQuest[] = [...normalized.failed];
  const active: ActiveQuest[] = [];
  let pinnedQuestIds = [...normalized.pinnedQuestIds];
  for (const current of normalized.active) {
    const definition = byId.get(current.questId);
    if (!definition) {
      active.push(current);
      continue;
    }
    const reason = failureReason(definition, current, event);
    if (reason) {
      failed.push({ questId: current.questId, failedAt: count(event.at), reason });
      pinnedQuestIds = pinnedQuestIds.filter((id) => id !== current.questId);
      continue;
    }
    const objectiveProgress = { ...current.objectiveProgress };
    for (const objective of definition.objectives) {
      objectiveProgress[objective.id] = Math.min(targetForObjective(objective), eventProgress(objective, objectiveProgress[objective.id] ?? 0, event));
    }
    active.push({
      ...current,
      objectiveProgress,
      status: reportableObjectivesComplete(definition, objectiveProgress) ? "ready" : "active",
    });
  }
  return { ...normalized, active, failed: failed.slice(-MAX_QUEST_HISTORY), pinnedQuestIds, pinnedQuestId: pinnedQuestIds[0] ?? null };
}

function durableObjectiveProgress(objective: QuestObjective, facts: QuestDurableFacts) {
  if (objective.kind === "survive-day") return count(facts.currentDay);
  if (objective.kind === "discover-town") return (facts.discoveredTowns ?? []).some((town) => {
    const townId = cleanId(town.townId);
    const factionId = cleanId(town.factionId);
    return Boolean(townId) && (!objective.factionId || objective.factionId === factionId);
  }) ? 1 : 0;
  if (objective.kind === "trade") return (facts.trades ?? []).reduce((total, trade) => (
    !objective.factionId || objective.factionId === cleanId(trade.factionId) ? total + count(trade.count) : total
  ), 0);
  if (objective.kind === "kill") return (facts.kills ?? []).reduce((total, kill) => (
    objective.mobKind === cleanId(kill.mobKind) ? total + count(kill.count) : total
  ), 0);
  if (objective.kind === "collect-item") return (facts.acquiredItems ?? []).reduce((total, item) => (
    objective.itemId === cleanId(item.itemId) ? total + count(item.count) : total
  ), 0);
  // Delivery objectives intentionally use current inventory at turn-in. Past
  // acquisition is not proof that the player still possesses the goods.
  if (objective.kind === "deliver-item") return 0;
  if (objective.kind === "interact") return (facts.interactions ?? []).reduce((total, interaction) => {
    if (objective.entityId && objective.entityId !== cleanId(interaction.entityId)) return total;
    if (objective.role && objective.role !== cleanNullableId(interaction.role)) return total;
    return total + count(interaction.count);
  }, 0);
  return (facts.customEvents ?? []).reduce((total, event) => (
    objective.eventId === cleanId(event.eventId) ? total + count(event.count) : total
  ), 0);
}

/**
 * Replays durable world facts into active quests without reducing live event
 * progress. This makes late acceptance and migrated saves deterministic.
 */
export function reconcileQuestBookWithDurableFacts(
  book: QuestBook,
  definitions: readonly QuestDefinition[],
  facts: QuestDurableFacts = {},
) {
  const normalized = normalizeQuestBook(book);
  const byId = definitionsById(definitions);
  const active = normalized.active.map((current): ActiveQuest => {
    const definition = byId.get(current.questId);
    if (!definition) return current;
    const objectiveProgress = { ...current.objectiveProgress };
    for (const objective of definition.objectives) {
      objectiveProgress[objective.id] = Math.min(
        targetForObjective(objective),
        Math.max(objectiveProgress[objective.id] ?? 0, durableObjectiveProgress(objective, facts)),
      );
    }
    return {
      ...current,
      objectiveProgress,
      status: reportableObjectivesComplete(definition, objectiveProgress) ? "ready" : "active",
    };
  });
  return { ...normalized, active };
}

export function acceptQuestWithDurableFacts(
  book: QuestBook,
  definitions: readonly QuestDefinition[],
  questId: string,
  acceptedAt: number,
  facts: QuestDurableFacts,
  giverEntityId: string | null = null,
  source: QuestSource | null = null,
) {
  const accepted = acceptQuest(book, definitions, questId, acceptedAt, giverEntityId, source);
  return accepted.ok
    ? { ...accepted, book: reconcileQuestBookWithDurableFacts(accepted.book, definitions, facts) }
    : accepted;
}

/**
 * Adds system-owned opening quests exactly once. Generic side work is always
 * eligible; culture discovery quests opt in only for known/selected factions.
 * Abandoned or historical quests are respected rather than silently revived.
 */
export function bootstrapSystemQuests(
  book: QuestBook,
  definitions: readonly QuestDefinition[],
  options: SystemQuestBootstrapOptions = {},
) {
  let next = normalizeQuestBook(book);
  const facts = options.facts ?? {};
  const appropriateFactions = new Set([
    ...(options.appropriateFactionIds ?? []).map(cleanId).filter(Boolean),
    ...(facts.discoveredTowns ?? []).map((town) => cleanId(town.factionId)).filter(Boolean),
  ]);
  const requested = new Set<string>([
    ...DEFAULT_SYSTEM_MAIN_QUEST_IDS,
    ...DEFAULT_SYSTEM_SIDE_QUEST_IDS,
    ...(options.mainQuestIds ?? []),
    ...(options.sideQuestIds ?? []),
  ]);
  for (const definition of definitions) {
    if (definition.giver) continue;
    if (definition.kind === "main") {
      requested.add(definition.id);
      continue;
    }
    const factions = definition.objectives
      .filter((objective): objective is Extract<QuestObjective, { kind: "discover-town" }> => objective.kind === "discover-town")
      .map((objective) => cleanNullableId(objective.factionId))
      .filter((factionId): factionId is string => Boolean(factionId));
    if (factions.length === 0 || factions.some((factionId) => appropriateFactions.has(factionId))) requested.add(definition.id);
  }
  for (const questId of requested) {
    const definition = definitions.find((entry) => entry.id === questId);
    if (!definition || definition.giver || questAvailability(next, definition) !== "available") continue;
    const accepted = acceptQuest(next, definitions, questId, count(options.acceptedAt));
    if (accepted.ok) next = accepted.book;
  }
  return reconcileQuestBookWithDurableFacts(next, definitions, facts);
}

export function failQuest(book: QuestBook, questId: string, reason: string, failedAt: number) {
  const normalized = normalizeQuestBook(book);
  if (!normalized.active.some((entry) => entry.questId === questId)) return normalized;
  const pinnedQuestIds = normalized.pinnedQuestIds.filter((id) => id !== questId);
  return {
    ...normalized,
    active: normalized.active.filter((entry) => entry.questId !== questId),
    failed: [...normalized.failed.filter((entry) => entry.questId !== questId), { questId, failedAt: count(failedAt), reason: reason.slice(0, 160) }].slice(-MAX_QUEST_HISTORY),
    pinnedQuestIds,
    pinnedQuestId: pinnedQuestIds[0] ?? null,
  };
}

function deliveryRequirements(definition: QuestDefinition) {
  const requirements: Record<string, number> = {};
  for (const objective of definition.objectives) {
    if (objective.kind === "deliver-item") requirements[objective.itemId] = (requirements[objective.itemId] ?? 0) + objective.count;
  }
  return requirements;
}

function applyAlignment(book: QuestBook, reward: QuestReward) {
  const factionAlignment = { ...book.factionAlignment };
  for (const [faction, delta] of Object.entries(reward.factionAlignment)) {
    factionAlignment[faction] = Math.max(-MAX_FACTION_ALIGNMENT, Math.min(MAX_FACTION_ALIGNMENT, (factionAlignment[faction] ?? 0) + Math.trunc(delta)));
  }
  return factionAlignment;
}

export function turnInQuest(
  book: QuestBook,
  definitions: readonly QuestDefinition[],
  questId: string,
  inventory: Readonly<Record<string, number>>,
  completedAt: number,
  giverEntityId: string | null = null,
) {
  const normalized = normalizeQuestBook(book);
  const definition = definitionsById(definitions).get(questId);
  const active = normalized.active.find((entry) => entry.questId === questId);
  if (!definition || !active) return { ok: false, reason: "not-active", book: normalized, inventory } as const;
  if (!reportableObjectivesComplete(definition, active.objectiveProgress)) return { ok: false, reason: "objectives-incomplete", book: normalized, inventory } as const;
  // Procedural resident quests bind to an exact giver. Curated field-study
  // quests may name a role without being instantiated for one resident.
  if (definition.giver && active.giverEntityId && active.giverEntityId !== giverEntityId) {
    return { ok: false, reason: "wrong-giver", book: normalized, inventory } as const;
  }
  const requirements = deliveryRequirements(definition);
  if (Object.entries(requirements).some(([itemId, required]) => (inventory[itemId] ?? 0) < required)) {
    return { ok: false, reason: "delivery-items-missing", book: normalized, inventory } as const;
  }
  const nextInventory: Record<string, number> = { ...inventory };
  for (const [itemId, required] of Object.entries(requirements)) {
    const remaining = (nextInventory[itemId] ?? 0) - required;
    if (remaining > 0) nextInventory[itemId] = remaining;
    else delete nextInventory[itemId];
  }
  const reward = definition.rewards ?? EMPTY_REWARD;
  const pinnedQuestIds = normalized.pinnedQuestIds.filter((id) => id !== questId);
  const nextBook: QuestBook = {
    ...normalized,
    active: normalized.active.filter((entry) => entry.questId !== questId),
    completed: [...new Set([...normalized.completed, questId])].slice(-MAX_QUEST_HISTORY),
    failed: normalized.failed.filter((entry) => entry.questId !== questId),
    abandoned: normalized.abandoned.filter((id) => id !== questId),
    pinnedQuestIds,
    pinnedQuestId: pinnedQuestIds[0] ?? null,
    factionAlignment: applyAlignment(normalized, reward),
  };
  return {
    ok: true,
    reason: null,
    book: nextBook,
    inventory: nextInventory,
    reward,
    completedAt: count(completedAt),
    rewardDelivery: definition.giver ? "giver-drop" : "quest-menu",
    consumed: requirements,
  } as const;
}

export function turnInQuestAtSource(
  book: QuestBook,
  definitions: readonly QuestDefinition[],
  questId: string,
  inventory: Readonly<Record<string, number>>,
  completedAt: number,
  source: QuestSource | null,
) {
  const normalized = normalizeQuestBook(book);
  const definition = definitionsById(definitions).get(questId);
  if (!definition) return { ok: false, reason: "not-active", book: normalized, inventory } as const;
  if (!questSourceCanTurnIn(normalized, definition, source)) {
    return { ok: false, reason: "wrong-giver", book: normalized, inventory } as const;
  }
  const route = questTurnInRoute(normalized, definition);
  const giverEntityId = route.kind === "individual" ? route.entityId : source?.entityId ?? null;
  return turnInQuest(normalized, definitions, questId, inventory, completedAt, giverEntityId);
}

export function createDeliverySideQuest(input: Readonly<{
  id: string;
  questlineId?: string;
  name: string;
  summary: string;
  giverRole: string;
  giverFactionId: string;
  itemId: string;
  count: number;
  gold: number;
  alignment: number;
  bonusItems?: readonly Readonly<{ itemId: string; count: number }>[];
}>): QuestDefinition {
  const id = cleanId(input.id) || "delivery-side-quest";
  const itemCount = Math.max(1, count(input.count, 1));
  return {
    id,
    questlineId: cleanId(input.questlineId) || `side-${cleanId(input.giverFactionId) || "local"}`,
    kind: "side",
    name: input.name.trim().slice(0, 64) || "A Neighborly Delivery",
    summary: input.summary.trim().slice(0, 240),
    objectives: [{ id: `${id}-delivery`, label: `Deliver ${itemCount} ${input.itemId}`, kind: "deliver-item", itemId: cleanId(input.itemId), count: itemCount }],
    giver: { scope: "individual", role: cleanId(input.giverRole), factionId: cleanId(input.giverFactionId), failOnDeath: true },
    rewards: {
      gold: Math.max(0, count(input.gold)),
      items: input.bonusItems ?? [],
      blueprints: [],
      factionAlignment: { [cleanId(input.giverFactionId)]: Math.trunc(finite(input.alignment)) },
    },
    abandonable: true,
    reacceptAfterAbandon: true,
  };
}

export function questlineBranches(definitions: readonly QuestDefinition[], questlineId: string) {
  const inLine = definitions.filter((definition) => definition.questlineId === questlineId);
  return inLine.map((definition) => ({
    questId: definition.id,
    unlocks: inLine.filter((candidate) => (candidate.prerequisites?.allOf ?? []).includes(definition.id)
      || (candidate.prerequisites?.anyOf ?? []).includes(definition.id)).map((candidate) => candidate.id),
  }));
}
