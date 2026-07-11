export const QUEST_BOOK_SCHEMA = 1 as const;
export const MAX_ACTIVE_QUESTS = 128;
export const MAX_QUEST_HISTORY = 2_048;
export const MAX_FACTION_ALIGNMENT = 10_000;

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

export type QuestDefinition = Readonly<{
  id: string;
  questlineId: string;
  kind: QuestKind;
  name: string;
  summary: string;
  objectives: readonly QuestObjective[];
  prerequisites?: Readonly<{ allOf?: readonly string[]; anyOf?: readonly string[] }>;
  giver?: Readonly<{ role?: string | null; factionId?: string | null; failOnDeath?: boolean }> | null;
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
  objectiveProgress: Readonly<Record<string, number>>;
}>;

export type FailedQuest = Readonly<{ questId: string; failedAt: number; reason: string }>;

export type QuestBook = Readonly<{
  schema: typeof QUEST_BOOK_SCHEMA;
  active: readonly ActiveQuest[];
  completed: readonly string[];
  failed: readonly FailedQuest[];
  abandoned: readonly string[];
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

const EMPTY_REWARD: QuestReward = Object.freeze({ gold: 0, items: [], blueprints: [], factionAlignment: {} });
const finite = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const count = (value: unknown, fallback = 0) => Math.max(0, Math.trunc(finite(value, fallback)));
const cleanId = (value: unknown) => typeof value === "string" ? value.trim().slice(0, 96) : "";

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
] as readonly QuestDefinition[]);

export const ATLANTIAN_FACTION_QUESTS: readonly QuestDefinition[] = Object.freeze([
  {
    id: "atlantian-light-below",
    questlineId: "atlantian-lumen-tides",
    kind: "side",
    name: "The Light Below",
    summary: "Find the patient lights of an Atlantian tidehold beneath the open sea.",
    objectives: [{ id: "discover-atlantian-town", label: "Discover an Atlantian settlement", kind: "discover-town", factionId: "atlantians" }],
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
    rewards: { gold: 32, items: [{ itemId: "lumen-pearl", count: 1 }], blueprints: [], factionAlignment: { atlantians: 7 } },
    abandonable: true,
    reacceptAfterAbandon: true,
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

export const DEFAULT_QUEST_DEFINITIONS: readonly QuestDefinition[] = Object.freeze([
  ...HEARTHROADS_MAIN_QUESTS,
  ...ATLANTIAN_FACTION_QUESTS,
]);

export const DEFAULT_QUESTLINES: readonly QuestlineDefinition[] = Object.freeze([
  ...HEARTHROADS_QUESTLINES,
  ATLANTIAN_QUESTLINE,
]);

export function createQuestBook(): QuestBook {
  return { schema: QUEST_BOOK_SCHEMA, active: [], completed: [], failed: [], abandoned: [], pinnedQuestId: null, factionAlignment: {} };
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
  return {
    questId,
    status: input.status === "ready" ? "ready" : "active",
    acceptedAt: count(input.acceptedAt),
    giverEntityId: input.giverEntityId === null ? null : cleanId(input.giverEntityId) || null,
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
  const pinnedQuestId = typeof input.pinnedQuestId === "string" && activeById.has(input.pinnedQuestId) ? input.pinnedQuestId : null;
  return { schema: QUEST_BOOK_SCHEMA, active, completed, failed: [...failedById.values()], abandoned, pinnedQuestId, factionAlignment };
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
    giverEntityId: cleanId(giverEntityId) || null,
    objectiveProgress,
  };
  return {
    ok: true,
    reason: null,
    book: { ...normalized, active: [...normalized.active, active], abandoned: normalized.abandoned.filter((id) => id !== questId) },
  } as const;
}

export function pinQuest(book: QuestBook, questId: string | null) {
  const normalized = normalizeQuestBook(book);
  if (questId === null) return { ...normalized, pinnedQuestId: null };
  return normalized.active.some((quest) => quest.questId === questId) ? { ...normalized, pinnedQuestId: questId } : normalized;
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
      pinnedQuestId: normalized.pinnedQuestId === questId ? null : normalized.pinnedQuestId,
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
  let pinnedQuestId = normalized.pinnedQuestId;
  for (const current of normalized.active) {
    const definition = byId.get(current.questId);
    if (!definition) {
      active.push(current);
      continue;
    }
    const reason = failureReason(definition, current, event);
    if (reason) {
      failed.push({ questId: current.questId, failedAt: count(event.at), reason });
      if (pinnedQuestId === current.questId) pinnedQuestId = null;
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
  return { ...normalized, active, failed: failed.slice(-MAX_QUEST_HISTORY), pinnedQuestId };
}

export function failQuest(book: QuestBook, questId: string, reason: string, failedAt: number) {
  const normalized = normalizeQuestBook(book);
  if (!normalized.active.some((entry) => entry.questId === questId)) return normalized;
  return {
    ...normalized,
    active: normalized.active.filter((entry) => entry.questId !== questId),
    failed: [...normalized.failed.filter((entry) => entry.questId !== questId), { questId, failedAt: count(failedAt), reason: reason.slice(0, 160) }].slice(-MAX_QUEST_HISTORY),
    pinnedQuestId: normalized.pinnedQuestId === questId ? null : normalized.pinnedQuestId,
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
  if (definition.giver && (!active.giverEntityId || active.giverEntityId !== giverEntityId)) {
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
  const nextBook: QuestBook = {
    ...normalized,
    active: normalized.active.filter((entry) => entry.questId !== questId),
    completed: [...new Set([...normalized.completed, questId])].slice(-MAX_QUEST_HISTORY),
    failed: normalized.failed.filter((entry) => entry.questId !== questId),
    abandoned: normalized.abandoned.filter((id) => id !== questId),
    pinnedQuestId: normalized.pinnedQuestId === questId ? null : normalized.pinnedQuestId,
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
    giver: { role: cleanId(input.giverRole), factionId: cleanId(input.giverFactionId), failOnDeath: true },
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
