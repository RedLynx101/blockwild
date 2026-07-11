/**
 * Save-friendly spell learning, attunement, mana, casting, and Q-key rules.
 *
 * This module deliberately contains no engine or inventory mutations. Tomes
 * report that they are reusable, casts return effect/animation/audio plans, and
 * the host decides how those plans affect the world.
 */

export const MAGIC_SCHEMA = 1 as const;
export const MAGIC_MASTERY_LEVEL = 1_000;
export const MAX_FAVORITE_SPELLS = 10;
export const MAX_SPELL_JOURNAL_ENTRIES = 256;
export const MAX_MAGIC_SAVE_LIST_ENTRIES = 1_024;
export const MAX_PERSISTED_MANA = Number.MAX_SAFE_INTEGER;
export const SPELL_WHEEL_HOLD_MS = 260;
export const MAGIC_ATTUNEMENT_QUEST_ID = "main-dragonwake-attunement" as const;

export type SpellSchool = "destruction" | "restoration" | "alteration" | "conjuration" | "utility";
export type SpellTargeting = "self" | "aimed" | "ground" | "cone";

export type SpellEffectDescriptor =
  | Readonly<{ kind: "damage"; damageType: "fire" | "frost" | "piercing"; amount: number; radius: number; status?: "burning" | "slowed" | "armor-fracture" }>
  | Readonly<{ kind: "heal"; amount: number }>
  | Readonly<{ kind: "shield"; amount: number; durationSeconds: number }>
  | Readonly<{ kind: "teleport"; distance: number; preserveMomentum: boolean }>
  | Readonly<{ kind: "summoned-projectile"; summon: "steel-spear"; lifetimeSeconds: number }>
  | Readonly<{ kind: "reveal"; radius: number; durationSeconds: number }>;

export type SpellProjectileDescriptor = Readonly<{
  kind: "none" | "bolt" | "lance" | "spear" | "ray";
  speed: number;
  range: number;
  radius: number;
  gravity: number;
  homing: number;
  pierce: number;
  trail: "embers" | "ice-shards" | "metal-sparks" | "sun-motes" | "aether-rings" | "ward-runes";
}>;

export type SpellAnimationCue = Readonly<{
  castPose: "forward-palm" | "two-hand-focus" | "underhand-cast" | "guard-cross";
  dominantHand: "left" | "right" | "both";
  windupSeconds: number;
  releaseSeconds: number;
  recoverySeconds: number;
  handColor: string;
  particleCue: string;
  cameraImpulse: number;
}>;

export type SpellSoundCue = Readonly<{
  charge: string;
  release: string;
  impact: string;
  loop: string | null;
  volume: number;
  pitchVariance: number;
}>;

export type SpellAcquisitionSource =
  | Readonly<{ kind: "faction"; factionId: "hobbits" | "goblins" | "atlantians" | "sugarcourt"; detail: string; rarity: "uncommon" | "rare" }>
  | Readonly<{ kind: "loot"; table: string; rarity: "rare" | "very-rare" }>
  | Readonly<{ kind: "quest"; questId: string; branch: "main" | "side" }>
  | Readonly<{ kind: "dragon-lair"; dragonType: "fire" | "ice" | "steel"; minimumTier: number }>;

type SpellDefinitionInput = Readonly<{
  id: string;
  tomeItemId: string;
  name: string;
  school: SpellSchool;
  description: string;
  journalNote: string;
  manaCost: number;
  cooldownSeconds: number;
  targeting: SpellTargeting;
  effects: readonly SpellEffectDescriptor[];
  projectile: SpellProjectileDescriptor;
  animation: SpellAnimationCue;
  sound: SpellSoundCue;
  sources: readonly SpellAcquisitionSource[];
}>;

export const SPELLS = Object.freeze([
  {
    id: "flame-jet",
    tomeItemId: "tome-flame-jet",
    name: "Flame Jet",
    school: "destruction",
    description: "Pour a short, steerable tongue of dragonfire through the aiming hand.",
    journalNote: "The spell wants room to breathe. Sweep across clustered threats instead of holding it against stone.",
    manaCost: 16,
    cooldownSeconds: 0.65,
    targeting: "cone",
    effects: [{ kind: "damage", damageType: "fire", amount: 5, radius: 2.2, status: "burning" }],
    projectile: { kind: "ray", speed: 20, range: 8, radius: 0.85, gravity: 0, homing: 0, pierce: 4, trail: "embers" },
    animation: { castPose: "forward-palm", dominantHand: "right", windupSeconds: 0.14, releaseSeconds: 0.32, recoverySeconds: 0.18, handColor: "#ff8a3d", particleCue: "spiral-embers-to-cone", cameraImpulse: 0.08 },
    sound: { charge: "spell.fire.inhale", release: "spell.fire.jet", impact: "spell.fire.impact", loop: "spell.fire.jet-loop", volume: 0.82, pitchVariance: 0.06 },
    sources: [
      { kind: "dragon-lair", dragonType: "fire", minimumTier: 2 },
      { kind: "loot", table: "scorched-dragon-archive", rarity: "very-rare" },
    ],
  },
  {
    id: "frost-lance",
    tomeItemId: "tome-frost-lance",
    name: "Frost Lance",
    school: "destruction",
    description: "Compress a needle of winter air and loose it in a brittle, armor-cooling line.",
    journalNote: "A clean release carries much farther than a hurried one; the lance can continue through a second target.",
    manaCost: 22,
    cooldownSeconds: 1.15,
    targeting: "aimed",
    effects: [{ kind: "damage", damageType: "frost", amount: 8, radius: 0.6, status: "slowed" }],
    projectile: { kind: "lance", speed: 34, range: 32, radius: 0.28, gravity: 0.02, homing: 0, pierce: 1, trail: "ice-shards" },
    animation: { castPose: "two-hand-focus", dominantHand: "both", windupSeconds: 0.32, releaseSeconds: 0.12, recoverySeconds: 0.24, handColor: "#bdefff", particleCue: "faceted-frost-lance", cameraImpulse: 0.12 },
    sound: { charge: "spell.frost.crystallize", release: "spell.frost.lance", impact: "spell.frost.shatter", loop: null, volume: 0.86, pitchVariance: 0.04 },
    sources: [
      { kind: "dragon-lair", dragonType: "ice", minimumTier: 2 },
      { kind: "quest", questId: "dragonwake-three-temperatures", branch: "side" },
    ],
  },
  {
    id: "steel-spear",
    tomeItemId: "tome-steel-spear",
    name: "Steel Spear",
    school: "conjuration",
    description: "Call a balanced metal spear into the casting hand and send it downrange in one motion.",
    journalNote: "The spear lasts only for the throw. Its impact briefly opens rigid armor to ordinary weapons.",
    manaCost: 28,
    cooldownSeconds: 1.8,
    targeting: "aimed",
    effects: [
      { kind: "summoned-projectile", summon: "steel-spear", lifetimeSeconds: 2.5 },
      { kind: "damage", damageType: "piercing", amount: 12, radius: 0.45, status: "armor-fracture" },
    ],
    projectile: { kind: "spear", speed: 42, range: 44, radius: 0.34, gravity: 0.13, homing: 0, pierce: 2, trail: "metal-sparks" },
    animation: { castPose: "underhand-cast", dominantHand: "right", windupSeconds: 0.38, releaseSeconds: 0.16, recoverySeconds: 0.3, handColor: "#d7e0e2", particleCue: "forged-runes-to-spear", cameraImpulse: 0.17 },
    sound: { charge: "spell.steel.forge", release: "spell.steel.throw", impact: "spell.steel.impact", loop: null, volume: 0.9, pitchVariance: 0.035 },
    sources: [
      { kind: "dragon-lair", dragonType: "steel", minimumTier: 2 },
      { kind: "quest", questId: "dragonwake-three-temperatures", branch: "side" },
    ],
  },
  {
    id: "healing-light",
    tomeItemId: "tome-healing-light",
    name: "Healing Light",
    school: "restoration",
    description: "Gather a warm knot of light that closes fresh hurts without interrupting movement.",
    journalNote: "Hearthkin illuminators teach that the light follows breath: a calm rhythm makes the mend steadier.",
    manaCost: 20,
    cooldownSeconds: 2.4,
    targeting: "self",
    effects: [{ kind: "heal", amount: 10 }],
    projectile: { kind: "none", speed: 0, range: 0, radius: 0, gravity: 0, homing: 0, pierce: 0, trail: "sun-motes" },
    animation: { castPose: "two-hand-focus", dominantHand: "both", windupSeconds: 0.42, releaseSeconds: 0.28, recoverySeconds: 0.16, handColor: "#ffd77a", particleCue: "ascending-hearth-motes", cameraImpulse: 0.02 },
    sound: { charge: "spell.restoration.gather", release: "spell.restoration.bloom", impact: "spell.restoration.mend", loop: null, volume: 0.68, pitchVariance: 0.08 },
    sources: [
      { kind: "faction", factionId: "hobbits", detail: "Rare stock from a trusted hearth alchemist", rarity: "rare" },
      { kind: "quest", questId: "dragonwake-scale-scholar", branch: "side" },
    ],
  },
  {
    id: "blinkstep",
    tomeItemId: "tome-blinkstep",
    name: "Blinkstep",
    school: "alteration",
    description: "Fold one stride through the near distance, stopping safely at the last open footing.",
    journalNote: "The fold refuses solid ground and unloaded space. Momentum survives, so mind the far edge.",
    manaCost: 32,
    cooldownSeconds: 4.5,
    targeting: "ground",
    effects: [{ kind: "teleport", distance: 9, preserveMomentum: true }],
    projectile: { kind: "none", speed: 0, range: 9, radius: 0.45, gravity: 0, homing: 0, pierce: 0, trail: "aether-rings" },
    animation: { castPose: "underhand-cast", dominantHand: "left", windupSeconds: 0.22, releaseSeconds: 0.08, recoverySeconds: 0.22, handColor: "#b6a0ff", particleCue: "collapse-and-arrival-rings", cameraImpulse: 0.1 },
    sound: { charge: "spell.alteration.fold", release: "spell.alteration.blink", impact: "spell.alteration.arrive", loop: null, volume: 0.72, pitchVariance: 0.05 },
    sources: [
      { kind: "faction", factionId: "goblins", detail: "Rare blueprint-tome traded by a Brassroot alchemist", rarity: "rare" },
      { kind: "quest", questId: "dragonwake-living-archive", branch: "side" },
    ],
  },
  {
    id: "arcane-ward",
    tomeItemId: "tome-arcane-ward",
    name: "Arcane Ward",
    school: "utility",
    description: "Trace a moving ring of runes that absorbs a measured amount of incoming harm.",
    journalNote: "The ward turns with its bearer. It is broad protection, not immunity, and fades after its charge is spent.",
    manaCost: 30,
    cooldownSeconds: 8,
    targeting: "self",
    effects: [
      { kind: "shield", amount: 14, durationSeconds: 18 },
      { kind: "reveal", radius: 5, durationSeconds: 2 },
    ],
    projectile: { kind: "none", speed: 0, range: 0, radius: 1.25, gravity: 0, homing: 0, pierce: 0, trail: "ward-runes" },
    animation: { castPose: "guard-cross", dominantHand: "both", windupSeconds: 0.48, releaseSeconds: 0.24, recoverySeconds: 0.28, handColor: "#7cf4df", particleCue: "orbiting-three-ring-ward", cameraImpulse: 0.05 },
    sound: { charge: "spell.ward.inscribe", release: "spell.ward.raise", impact: "spell.ward.absorb", loop: "spell.ward.hum", volume: 0.64, pitchVariance: 0.025 },
    sources: [
      { kind: "faction", factionId: "atlantians", detail: "A Lumen Tidemoot glowmender quest reward", rarity: "uncommon" },
      { kind: "faction", factionId: "sugarcourt", detail: "Very rare candysmith archive stock", rarity: "rare" },
      { kind: "quest", questId: MAGIC_ATTUNEMENT_QUEST_ID, branch: "main" },
    ],
  },
] as const satisfies readonly SpellDefinitionInput[]);

export type SpellDefinition = (typeof SPELLS)[number];
export type SpellId = SpellDefinition["id"];

export type TomeDefinition = Readonly<{
  itemId: string;
  spellId: SpellId;
  name: string;
  reusable: true;
  sources: readonly SpellAcquisitionSource[];
}>;

export const TOMES: readonly TomeDefinition[] = Object.freeze(SPELLS.map((spell) => ({
  itemId: spell.tomeItemId,
  spellId: spell.id,
  name: `Tome: ${spell.name}`,
  reusable: true as const,
  sources: spell.sources,
})));

const SPELL_BY_ID = new Map<string, SpellDefinition>(SPELLS.map((spell) => [spell.id, spell]));
const TOME_BY_ITEM_ID = new Map<string, TomeDefinition>(TOMES.map((tome) => [tome.itemId, tome]));

export type SpellJournalEntry = Readonly<{
  spellId: SpellId;
  discoveredAt: number;
  learnedAt: number | null;
  castCount: number;
  lastCastAt: number | null;
}>;

export type MagicState = Readonly<{
  schema: typeof MAGIC_SCHEMA;
  attuned: boolean;
  attunedAt: number | null;
  mana: number;
  maxMana: number;
  learnedSpellIds: readonly SpellId[];
  favoriteSpellIds: readonly SpellId[];
  selectedSpellId: SpellId | null;
  journal: Readonly<Partial<Record<SpellId, SpellJournalEntry>>>;
  cooldownReadyAt: Readonly<Partial<Record<SpellId, number>>>;
}>;

export type TomeLearningOutcome = "learned" | "already-known" | "unknown-tome";
export type TomeLearningResult = Readonly<{
  state: MagicState;
  outcome: TomeLearningOutcome;
  spellId: SpellId | null;
  consumeTome: false;
}>;

export type SpellCastFailureReason = "unknown-spell" | "not-learned" | "not-attuned" | "cooldown" | "insufficient-mana" | "no-selected-spell";
export type SpellCastPlan = Readonly<{
  spellId: SpellId;
  school: SpellSchool;
  targeting: SpellTargeting;
  powerMultiplier: number;
  manaSpent: number;
  effects: readonly SpellEffectDescriptor[];
  projectile: SpellProjectileDescriptor;
  animation: SpellAnimationCue;
  sound: SpellSoundCue;
}>;
export type SpellCastResult =
  | Readonly<{ ok: true; state: MagicState; plan: SpellCastPlan; reason: null; readyAt: number }>
  | Readonly<{ ok: false; state: MagicState; plan: null; reason: SpellCastFailureReason; message: string; readyAt?: number }>;
export type SpellCastCheck =
  | Readonly<{ ok: true; definition: SpellDefinition; manaCost: number }>
  | Extract<SpellCastResult, Readonly<{ ok: false }>>;

const finite = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const safeTimestamp = (value: unknown) => clamp(finite(value), 0, Number.MAX_SAFE_INTEGER);
const safeMana = (value: unknown, fallback: number) => clamp(finite(value, fallback), 0, MAX_PERSISTED_MANA);
const isSpellId = (value: unknown): value is SpellId => typeof value === "string" && SPELL_BY_ID.has(value);

function orderedSpellIds(values: unknown, allowed?: ReadonlySet<SpellId>) {
  if (!Array.isArray(values)) return [];
  const found = new Set(values.slice(0, MAX_MAGIC_SAVE_LIST_ENTRIES).filter(isSpellId).filter((id) => !allowed || allowed.has(id)));
  return SPELLS.map((spell) => spell.id).filter((id) => found.has(id));
}

function preservedSpellIds(values: unknown, allowed: ReadonlySet<SpellId>, limit: number) {
  if (!Array.isArray(values)) return [];
  const seen = new Set<SpellId>();
  const result: SpellId[] = [];
  for (const value of values.slice(0, MAX_MAGIC_SAVE_LIST_ENTRIES)) {
    if (!isSpellId(value) || !allowed.has(value) || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
    if (result.length >= limit) break;
  }
  return result;
}

function normalizeJournalEntry(value: unknown, spellId: SpellId): SpellJournalEntry | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<SpellJournalEntry>;
  const learnedAt = input.learnedAt === null ? null : safeTimestamp(input.learnedAt);
  const lastCastAt = input.lastCastAt === null ? null : safeTimestamp(input.lastCastAt);
  return {
    spellId,
    discoveredAt: safeTimestamp(input.discoveredAt),
    learnedAt,
    castCount: clamp(Math.trunc(finite(input.castCount)), 0, Number.MAX_SAFE_INTEGER),
    lastCastAt,
  };
}

export function createMagicState(baseMaxMana = 100): MagicState {
  const maxMana = clamp(safeMana(baseMaxMana, 100), 1, MAX_PERSISTED_MANA);
  return {
    schema: MAGIC_SCHEMA,
    attuned: false,
    attunedAt: null,
    mana: maxMana,
    maxMana,
    learnedSpellIds: [],
    favoriteSpellIds: [],
    selectedSpellId: null,
    journal: {},
    cooldownReadyAt: {},
  };
}

export function normalizeMagicState(value: unknown): MagicState {
  if (!value || typeof value !== "object") return createMagicState();
  const input = value as Partial<MagicState>;
  const maxMana = clamp(safeMana(input.maxMana, 100), 1, MAX_PERSISTED_MANA);
  const learnedSpellIds = orderedSpellIds(input.learnedSpellIds);
  const learned = new Set(learnedSpellIds);
  const favoriteSpellIds = preservedSpellIds(input.favoriteSpellIds, learned, MAX_FAVORITE_SPELLS);
  const selectedSpellId = isSpellId(input.selectedSpellId) && learned.has(input.selectedSpellId)
    ? input.selectedSpellId
    : favoriteSpellIds[0] ?? learnedSpellIds[0] ?? null;
  const journal: Partial<Record<SpellId, SpellJournalEntry>> = {};
  if (input.journal && typeof input.journal === "object") {
    for (const spell of SPELLS.slice(0, MAX_SPELL_JOURNAL_ENTRIES)) {
      const entry = normalizeJournalEntry(input.journal[spell.id], spell.id);
      if (entry) journal[spell.id] = entry;
    }
  }
  for (const spellId of learnedSpellIds) {
    const previous = journal[spellId];
    journal[spellId] = previous
      ? { ...previous, learnedAt: previous.learnedAt ?? previous.discoveredAt }
      : { spellId, discoveredAt: 0, learnedAt: 0, castCount: 0, lastCastAt: null };
  }
  const cooldownReadyAt: Partial<Record<SpellId, number>> = {};
  if (input.cooldownReadyAt && typeof input.cooldownReadyAt === "object") {
    for (const spell of SPELLS) {
      const readyAt = safeTimestamp(input.cooldownReadyAt[spell.id]);
      if (readyAt > 0) cooldownReadyAt[spell.id] = readyAt;
    }
  }
  return {
    schema: MAGIC_SCHEMA,
    attuned: input.attuned === true,
    attunedAt: input.attuned === true ? (input.attunedAt === null ? 0 : safeTimestamp(input.attunedAt)) : null,
    mana: clamp(safeMana(input.mana, maxMana), 0, maxMana),
    maxMana,
    learnedSpellIds,
    favoriteSpellIds,
    selectedSpellId,
    journal,
    cooldownReadyAt,
  };
}

export function spellDefinition(spellId: string) {
  return SPELL_BY_ID.get(spellId) ?? null;
}

export function tomeDefinition(itemId: string) {
  return TOME_BY_ITEM_ID.get(itemId) ?? null;
}

export function discoverSpell(state: MagicState, spellId: string, at: number): MagicState {
  if (!isSpellId(spellId) || state.journal[spellId]) return state;
  return {
    ...state,
    journal: {
      ...state.journal,
      [spellId]: { spellId, discoveredAt: safeTimestamp(at), learnedAt: null, castCount: 0, lastCastAt: null },
    },
  };
}

export function learnSpellFromTome(state: MagicState, tomeItemId: string, at: number): TomeLearningResult {
  const tome = tomeDefinition(tomeItemId);
  if (!tome) return { state, outcome: "unknown-tome", spellId: null, consumeTome: false };
  const discovered = discoverSpell(state, tome.spellId, at);
  if (discovered.learnedSpellIds.includes(tome.spellId)) {
    return { state: discovered, outcome: "already-known", spellId: tome.spellId, consumeTome: false };
  }
  const learnedSpellIds = SPELLS.map((spell) => spell.id).filter((id) => id === tome.spellId || discovered.learnedSpellIds.includes(id));
  const favorites = discovered.favoriteSpellIds.length < MAX_FAVORITE_SPELLS
    ? [...discovered.favoriteSpellIds, tome.spellId]
    : discovered.favoriteSpellIds;
  const previousJournal = discovered.journal[tome.spellId];
  const next: MagicState = {
    ...discovered,
    learnedSpellIds,
    favoriteSpellIds: favorites,
    selectedSpellId: discovered.selectedSpellId ?? tome.spellId,
    journal: {
      ...discovered.journal,
      [tome.spellId]: {
        spellId: tome.spellId,
        discoveredAt: previousJournal?.discoveredAt ?? safeTimestamp(at),
        learnedAt: safeTimestamp(at),
        castCount: previousJournal?.castCount ?? 0,
        lastCastAt: previousJournal?.lastCastAt ?? null,
      },
    },
  };
  return { state: next, outcome: "learned", spellId: tome.spellId, consumeTome: false };
}

export function attuneMagicFromQuest(state: MagicState, completedQuestIds: readonly string[], at: number) {
  if (state.attuned || !completedQuestIds.slice(-MAX_MAGIC_SAVE_LIST_ENTRIES).includes(MAGIC_ATTUNEMENT_QUEST_ID)) {
    return { state, attuned: state.attuned, reason: state.attuned ? "already-attuned" as const : "quest-incomplete" as const };
  }
  return {
    state: { ...state, attuned: true, attunedAt: safeTimestamp(at), mana: state.maxMana },
    attuned: true,
    reason: "attuned" as const,
  };
}

export function setFavoriteSpells(state: MagicState, spellIds: readonly string[]): MagicState {
  const learned = new Set(state.learnedSpellIds);
  const seen = new Set<SpellId>();
  const favoriteSpellIds: SpellId[] = [];
  for (const value of spellIds.slice(0, MAX_MAGIC_SAVE_LIST_ENTRIES)) {
    if (!isSpellId(value) || !learned.has(value) || seen.has(value)) continue;
    seen.add(value);
    favoriteSpellIds.push(value);
    if (favoriteSpellIds.length === MAX_FAVORITE_SPELLS) break;
  }
  const selectedSpellId = state.selectedSpellId && learned.has(state.selectedSpellId)
    ? state.selectedSpellId
    : favoriteSpellIds[0] ?? state.learnedSpellIds[0] ?? null;
  return { ...state, favoriteSpellIds, selectedSpellId };
}

export function toggleFavoriteSpell(state: MagicState, spellId: string) {
  if (!isSpellId(spellId) || !state.learnedSpellIds.includes(spellId)) return { state, changed: false, reason: "not-learned" as const };
  if (state.favoriteSpellIds.includes(spellId)) {
    return { state: setFavoriteSpells(state, state.favoriteSpellIds.filter((id) => id !== spellId)), changed: true, reason: "removed" as const };
  }
  if (state.favoriteSpellIds.length >= MAX_FAVORITE_SPELLS) return { state, changed: false, reason: "wheel-full" as const };
  return { state: setFavoriteSpells(state, [...state.favoriteSpellIds, spellId]), changed: true, reason: "added" as const };
}

export function selectSpell(state: MagicState, spellId: string): MagicState {
  if (!isSpellId(spellId) || !state.learnedSpellIds.includes(spellId)) return state;
  return state.selectedSpellId === spellId ? state : { ...state, selectedSpellId: spellId };
}

export function magicPowerMultiplier(magicSkillLevel: number) {
  return 1 + clamp(Math.trunc(finite(magicSkillLevel)), 0, MAGIC_MASTERY_LEVEL) * 0.01;
}

export function isInfiniteMana(magicSkillLevel: number) {
  return Math.trunc(finite(magicSkillLevel)) >= MAGIC_MASTERY_LEVEL;
}

export function shouldShowManaBar(state: MagicState, magicSkillLevel: number) {
  return state.attuned && !isInfiniteMana(magicSkillLevel);
}

export function canCastSpell(state: MagicState, spellId: string, now: number, magicSkillLevel: number): SpellCastCheck {
  const definition = spellDefinition(spellId);
  if (!definition) return { ok: false, state, plan: null, reason: "unknown-spell", message: "That spell is not part of this journal." };
  if (!state.learnedSpellIds.includes(definition.id)) return { ok: false, state, plan: null, reason: "not-learned", message: "Read its reusable tome before trying to cast it." };
  if (!state.attuned) return { ok: false, state, plan: null, reason: "not-attuned", message: "Complete the Dragonwake Accord to attune your mana first." };
  const readyAt = state.cooldownReadyAt[definition.id] ?? 0;
  if (safeTimestamp(now) < readyAt) return { ok: false, state, plan: null, reason: "cooldown", message: "The working has not settled yet.", readyAt };
  const manaCost = isInfiniteMana(magicSkillLevel) ? 0 : definition.manaCost;
  if (state.mana < manaCost) return { ok: false, state, plan: null, reason: "insufficient-mana", message: `This spell needs ${manaCost} mana.` };
  return { ok: true, definition, manaCost };
}

export function castSpell(state: MagicState, spellId: string, now: number, magicSkillLevel: number): SpellCastResult {
  const check = canCastSpell(state, spellId, now, magicSkillLevel);
  if (!check.ok) return check;
  const at = safeTimestamp(now);
  const readyAt = at + check.definition.cooldownSeconds;
  const previousJournal = state.journal[check.definition.id] ?? {
    spellId: check.definition.id,
    discoveredAt: at,
    learnedAt: at,
    castCount: 0,
    lastCastAt: null,
  };
  const next: MagicState = {
    ...state,
    mana: Math.max(0, state.mana - check.manaCost),
    cooldownReadyAt: { ...state.cooldownReadyAt, [check.definition.id]: readyAt },
    journal: {
      ...state.journal,
      [check.definition.id]: {
        ...previousJournal,
        castCount: Math.min(Number.MAX_SAFE_INTEGER, previousJournal.castCount + 1),
        lastCastAt: at,
      },
    },
  };
  return {
    ok: true,
    state: next,
    reason: null,
    readyAt,
    plan: {
      spellId: check.definition.id,
      school: check.definition.school,
      targeting: check.definition.targeting,
      powerMultiplier: magicPowerMultiplier(magicSkillLevel),
      manaSpent: check.manaCost,
      effects: check.definition.effects,
      projectile: check.definition.projectile,
      animation: check.definition.animation,
      sound: check.definition.sound,
    },
  };
}

export function castSelectedSpell(state: MagicState, now: number, magicSkillLevel: number): SpellCastResult {
  if (!state.selectedSpellId) return { ok: false, state, plan: null, reason: "no-selected-spell", message: "Choose a spell in the journal or wheel first." };
  return castSpell(state, state.selectedSpellId, now, magicSkillLevel);
}

export function restoreMana(state: MagicState, amount: number): MagicState {
  const restored = clamp(finite(amount), 0, MAX_PERSISTED_MANA);
  if (restored <= 0 || state.mana >= state.maxMana) return state;
  return { ...state, mana: Math.min(state.maxMana, state.mana + restored) };
}

export function regenerateMana(state: MagicState, elapsedSeconds: number, magicSkillLevel: number): MagicState {
  if (!state.attuned || isInfiniteMana(magicSkillLevel)) return state;
  const seconds = clamp(finite(elapsedSeconds), 0, 3_600);
  return restoreMana(state, seconds * 1.5 * magicPowerMultiplier(magicSkillLevel));
}

/** Permanent capacity upgrades remain valid before attunement and have no game-design cap. */
export function increaseManaCapacity(state: MagicState, amount: number): MagicState {
  const increase = clamp(finite(amount), 0, MAX_PERSISTED_MANA);
  if (increase <= 0) return state;
  const maxMana = Math.min(MAX_PERSISTED_MANA, state.maxMana + increase);
  const actualIncrease = maxMana - state.maxMana;
  return actualIncrease <= 0 ? state : { ...state, maxMana, mana: Math.min(maxMana, state.mana + actualIncrease) };
}

export type SpellWheelSlot = Readonly<{
  spellId: SpellId;
  index: number;
  angleRadians: number;
  x: number;
  y: number;
  selected: boolean;
}>;

export function spellWheelSlots(state: MagicState): readonly SpellWheelSlot[] {
  const learned = new Set(state.learnedSpellIds);
  const favorites = state.favoriteSpellIds.filter((id) => learned.has(id)).slice(0, MAX_FAVORITE_SPELLS);
  return favorites.map((spellId, index) => {
    const angleRadians = -Math.PI / 2 + (index * Math.PI * 2) / Math.max(1, favorites.length);
    return {
      spellId,
      index,
      angleRadians,
      x: Math.cos(angleRadians),
      y: Math.sin(angleRadians),
      selected: state.selectedSpellId === spellId,
    };
  });
}

export type SpellKeyState = Readonly<{
  pressedAtMs: number | null;
  wheelOpen: boolean;
}>;
export type SpellKeyAction = "none" | "open-wheel" | "close-wheel" | "cast-selected";
export type SpellKeyTransition = Readonly<{ state: SpellKeyState; action: SpellKeyAction }>;

export function createSpellKeyState(): SpellKeyState {
  return { pressedAtMs: null, wheelOpen: false };
}

export function pressSpellKey(state: SpellKeyState, atMs: number): SpellKeyTransition {
  if (state.pressedAtMs !== null) return { state, action: "none" };
  return { state: { pressedAtMs: safeTimestamp(atMs), wheelOpen: false }, action: "none" };
}

export function advanceSpellKey(state: SpellKeyState, atMs: number): SpellKeyTransition {
  if (state.pressedAtMs === null || state.wheelOpen || safeTimestamp(atMs) - state.pressedAtMs < SPELL_WHEEL_HOLD_MS) {
    return { state, action: "none" };
  }
  return { state: { ...state, wheelOpen: true }, action: "open-wheel" };
}

export function releaseSpellKey(state: SpellKeyState, atMs: number): SpellKeyTransition {
  if (state.pressedAtMs === null) return { state, action: "none" };
  const heldLongEnough = safeTimestamp(atMs) - state.pressedAtMs >= SPELL_WHEEL_HOLD_MS;
  const action: SpellKeyAction = state.wheelOpen || heldLongEnough ? "close-wheel" : "cast-selected";
  return { state: createSpellKeyState(), action };
}
