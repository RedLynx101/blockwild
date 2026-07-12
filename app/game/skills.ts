/** Pure, extensible RPG skills and perk progression for Blockwild saves. */

export const SKILLS_SCHEMA = 3 as const;
export const MAX_SKILL_LEVEL = 1_000;
export const PERK_POINT_INTERVAL = 25;
export const MAX_PERSISTED_XP = Number.MAX_SAFE_INTEGER;
export const MAX_PERK_SAVE_ENTRIES = 256;

export const SKILL_IDS = [
  "melee",
  "ranged",
  "mining",
  "crafting",
  "survival",
  "husbandry",
  "exploration",
  "magic",
  "bartering",
  "luck",
] as const;

export type SkillId = (typeof SKILL_IDS)[number];

export type AscendantTraitDefinition = Readonly<{
  skillId: SkillId;
  name: string;
  description: string;
}>;

export type SkillDefinition = Readonly<{
  id: SkillId;
  name: string;
  description: string;
  practice: string;
  accent: string;
}>;

export const SKILLS: readonly SkillDefinition[] = Object.freeze([
  { id: "melee", name: "Melee", description: "Each rank adds 1% close-weapon damage; perks improve control, stamina use, and committed strikes.", practice: "Land melee hits against living threats.", accent: "#e57b64" },
  { id: "ranged", name: "Ranged", description: "Each rank adds 1% projectile damage and reload effectiveness; perks improve steadiness and handling.", practice: "Hit valid targets with bows, crossbows, or thrown weapons.", accent: "#d9a45d" },
  { id: "mining", name: "Mining", description: "Each rank adds 1% mining speed with the correct tool; perks preserve tools and reveal useful stone.", practice: "Break naturally generated stone and ore with the right tool.", accent: "#92a6b2" },
  { id: "crafting", name: "Crafting", description: "Each rank adds 1% station and repair effectiveness; perks improve fabrication, brewing, and finished work.", practice: "Finish recipes and collect completed station batches.", accent: "#c69868" },
  { id: "survival", name: "Survival", description: "Each rank adds 1% environmental resilience and recovery effectiveness, including food and hostile weather.", practice: "Travel, recover, eat, and survive genuine environmental danger.", accent: "#82ae70" },
  { id: "husbandry", name: "Husbandry", description: "Each rank adds 1% creature-care and companion effectiveness across trust, breeding, riding, and commands.", practice: "Feed, heal, tame, breed, or train creatures responsibly.", accent: "#d98aa5" },
  { id: "exploration", name: "Exploration", description: "Each rank improves travel knowledge; perks expand map scale, tracking, POI legibility, and mastered travel.", practice: "Render new chunks, discover POIs, and complete difficult journeys.", accent: "#67afad" },
  { id: "magic", name: "Magic", description: "Each rank adds 1% spell damage, mana recovery, and summon effectiveness.", practice: "Cast useful spells against valid targets or hazards.", accent: "#9d83d8" },
  { id: "bartering", name: "Bartering", description: "Each rank closes the local buy/sell spread by 1%; faction alignment improves the bargain further.", practice: "Complete fair purchases, sales, contracts, and faction negotiations.", accent: "#d4b45f" },
  { id: "luck", name: "Luck", description: "Each rank adds 1% effective chance to eligible creature, block, and treasure-table drops.", practice: "Find uncommon natural drops and open newly generated treasure caches.", accent: "#8ecf8b" },
] satisfies readonly SkillDefinition[]);

/**
 * Every discipline has its own level-1000 capstone. Runtime systems can opt in
 * to the matching flag without making unrelated skills a prerequisite.
 */
export const ASCENDANT_TRAITS: Readonly<Record<SkillId, AscendantTraitDefinition>> = Object.freeze({
  melee: { skillId: "melee", name: "Relentless Hand", description: "Committed melee attacks no longer spend stamina." },
  ranged: { skillId: "ranged", name: "Deadeye", description: "Ranged weapons settle instantly and reload at their mastered rate." },
  mining: { skillId: "mining", name: "Stonewake", description: "Correct mining tools no longer lose durability from ordinary blocks." },
  crafting: { skillId: "crafting", name: "Masterwork Hands", description: "Crafting stations work at their mastered rate without fatigue." },
  survival: { skillId: "survival", name: "Deathless Ember", description: "Damage cannot lower health below ten percent while enabled." },
  husbandry: { skillId: "husbandry", name: "Soulherd", description: "Tamed followers and creature summons gain the mastered bond bonus." },
  exploration: { skillId: "exploration", name: "Worldwalker", description: "Map-charge travel becomes free and tracked destinations remain visible at any distance while enabled." },
  magic: { skillId: "magic", name: "Infinite Wellspring", description: "Mana becomes infinite and the mana bar recedes." },
  bartering: { skillId: "bartering", name: "Perfect Exchange", description: "Anything may be sold and bought back at the same location for the same local market price." },
  luck: { skillId: "luck", name: "Fortune Incarnate", description: "Eligible rare loot rolls use the full eleven-times mastered chance and never roll below their average quantity." },
});

export type PerkEffect =
  | Readonly<{ kind: "percent-bonus"; stat: string; amount: number }>
  | Readonly<{ kind: "flat-bonus"; stat: string; amount: number }>
  | Readonly<{ kind: "unlock"; ability: string }>;

export type PerkDefinition = Readonly<{
  id: string;
  skillId: SkillId;
  name: string;
  description: string;
  requiredLevel: number;
  cost: number;
  prerequisites: readonly string[];
  effects: readonly PerkEffect[];
}>;

export const PERKS: readonly PerkDefinition[] = Object.freeze([
  { id: "melee-measured-strikes", skillId: "melee", name: "Measured Strikes", description: "Committed melee hits spend 8% less stamina.", requiredLevel: 25, cost: 1, prerequisites: [], effects: [{ kind: "percent-bonus", stat: "melee-stamina-efficiency", amount: 8 }] },
  { id: "melee-cleaving-line", skillId: "melee", name: "Cleaving Line", description: "Full-strength swings may carry reduced damage into one nearby target.", requiredLevel: 150, cost: 2, prerequisites: ["melee-measured-strikes"], effects: [{ kind: "unlock", ability: "melee-cleave" }] },
  { id: "ranged-steady-breath", skillId: "ranged", name: "Steady Breath", description: "Aiming sway settles 10% faster while grounded.", requiredLevel: 25, cost: 1, prerequisites: [], effects: [{ kind: "percent-bonus", stat: "aim-settle-rate", amount: 10 }] },
  { id: "ranged-field-reload", skillId: "ranged", name: "Field Reload", description: "Crossbow and future magazine reload actions are 8% quicker.", requiredLevel: 150, cost: 2, prerequisites: ["ranged-steady-breath"], effects: [{ kind: "percent-bonus", stat: "reload-speed", amount: 8 }] },
  { id: "mining-clean-break", skillId: "mining", name: "Clean Break", description: "Correct mining tools lose 8% less durability.", requiredLevel: 25, cost: 1, prerequisites: [], effects: [{ kind: "percent-bonus", stat: "mining-durability-efficiency", amount: 8 }] },
  { id: "mining-deep-listener", skillId: "mining", name: "Deep Listener", description: "Freshly exposed ore gives a brief, quiet edge shimmer.", requiredLevel: 150, cost: 2, prerequisites: ["mining-clean-break"], effects: [{ kind: "unlock", ability: "nearby-exposed-ore-cue" }] },
  { id: "crafting-careful-hands", skillId: "crafting", name: "Careful Hands", description: "Repairs restore 8% more durability from the same materials.", requiredLevel: 25, cost: 1, prerequisites: [], effects: [{ kind: "percent-bonus", stat: "repair-yield", amount: 8 }] },
  { id: "crafting-masterwork", skillId: "crafting", name: "Masterwork", description: "Unlocks a future quality roll for demanding equipment recipes.", requiredLevel: 150, cost: 2, prerequisites: ["crafting-careful-hands"], effects: [{ kind: "unlock", ability: "masterwork-crafting-roll" }] },
  { id: "survival-road-hardened", skillId: "survival", name: "Road Hardened", description: "Hunger gained from sprinting and swimming is reduced by 6%.", requiredLevel: 25, cost: 1, prerequisites: [], effects: [{ kind: "percent-bonus", stat: "travel-hunger-efficiency", amount: 6 }] },
  { id: "survival-second-wind", skillId: "survival", name: "Second Wind", description: "Once per day, leaving combat below one-quarter health grants a short recovery pulse.", requiredLevel: 150, cost: 2, prerequisites: ["survival-road-hardened"], effects: [{ kind: "unlock", ability: "daily-second-wind" }] },
  { id: "husbandry-gentle-presence", skillId: "husbandry", name: "Gentle Presence", description: "Neutral creatures become alarmed 10% closer to the player.", requiredLevel: 25, cost: 1, prerequisites: [], effects: [{ kind: "percent-bonus", stat: "neutral-creature-calm-radius", amount: 10 }] },
  { id: "husbandry-herdkeeper", skillId: "husbandry", name: "Herdkeeper", description: "Dynamic follower formations gain one additional wide spacing band.", requiredLevel: 150, cost: 2, prerequisites: ["husbandry-gentle-presence"], effects: [{ kind: "unlock", ability: "wide-follower-formation" }] },
  { id: "exploration-trail-memory", skillId: "exploration", name: "Trail Memory", description: "The field map can zoom out to twice its normal survey scale.", requiredLevel: 25, cost: 1, prerequisites: [], effects: [{ kind: "unlock", ability: "extended-map-zoom" }] },
  { id: "exploration-horizon-step", skillId: "exploration", name: "Wayfinder's Sense", description: "Tracked players or places stay on the compass beyond the ordinary nearby survey radius.", requiredLevel: 200, cost: 2, prerequisites: ["exploration-trail-memory"], effects: [{ kind: "unlock", ability: "world-compass-tracking" }] },
  { id: "magic-calm-channel", skillId: "magic", name: "Calm Channel", description: "Taking light damage during a channeled working no longer erases all accumulated cast progress.", requiredLevel: 25, cost: 1, prerequisites: [], effects: [{ kind: "unlock", ability: "partial-channel-retention" }] },
  { id: "magic-spellweaver", skillId: "magic", name: "Spellweaver", description: "Switching wheel favorites cancels less of the current casting recovery.", requiredLevel: 150, cost: 2, prerequisites: ["magic-calm-channel"], effects: [{ kind: "percent-bonus", stat: "spell-switch-recovery", amount: 15 }] },
  { id: "bartering-open-ledger", skillId: "bartering", name: "Open Ledger", description: "Positive faction alignment counts more strongly when merchants set both purchase and sale prices.", requiredLevel: 25, cost: 1, prerequisites: [], effects: [{ kind: "percent-bonus", stat: "alignment-price-influence", amount: 25 }] },
  { id: "bartering-known-customer", skillId: "bartering", name: "Known Customer", description: "Merchants keep one additional restock band available to a trusted negotiator.", requiredLevel: 200, cost: 2, prerequisites: ["bartering-open-ledger"], effects: [{ kind: "unlock", ability: "merchant-reserve-stock" }] },
  { id: "luck-careful-search", skillId: "luck", name: "Careful Search", description: "Treasure bonuses receive an additional 10% of your current Luck multiplier.", requiredLevel: 25, cost: 1, prerequisites: [], effects: [{ kind: "percent-bonus", stat: "treasure-luck-effectiveness", amount: 10 }] },
  { id: "luck-second-chance", skillId: "luck", name: "Second Chance", description: "The first failed rare drop roll each day may be rolled once more at half its normal chance.", requiredLevel: 200, cost: 2, prerequisites: ["luck-careful-search"], effects: [{ kind: "unlock", ability: "daily-luck-reroll" }] },
] satisfies readonly PerkDefinition[]);

const PERK_BY_ID = new Map(PERKS.map((perk) => [perk.id, perk]));
const SKILL_ID_SET = new Set<string>(SKILL_IDS);

export type SkillProgress = Readonly<{
  level: number;
  xp: number;
}>;

export type SkillState = Readonly<{
  schema: typeof SKILLS_SCHEMA;
  skills: Readonly<Record<SkillId, SkillProgress>>;
  characterLevel: number;
  characterXp: number;
  perkPoints: number;
  unlockedPerkIds: readonly string[];
  /** Per-discipline opt-in capstones. Old saves migrate the health-floor flag to Survival. */
  ascendantTraits: Readonly<Record<SkillId, boolean>>;
  /** Legacy mirror retained for save/network compatibility. */
  ascendantHealthFloorEnabled: boolean;
}>;

export type SkillXpResult = Readonly<{
  state: SkillState;
  skillId: SkillId;
  gainedLevels: number;
  characterLevelsGained: number;
  perkPointsGained: number;
}>;

export type UnlockPerkResult = Readonly<{
  state: SkillState;
  unlocked: boolean;
  reason: "unlocked" | "unknown-perk" | "already-unlocked" | "skill-too-low" | "missing-prerequisite" | "not-enough-points";
}>;

const finite = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const whole = (value: unknown, fallback = 0) => Math.trunc(finite(value, fallback));

export function isSkillId(value: unknown): value is SkillId {
  return typeof value === "string" && SKILL_ID_SET.has(value);
}

export function skillMultiplier(level: number) {
  return 1 + clamp(whole(level), 0, MAX_SKILL_LEVEL) * 0.01;
}

/** Linear per-rank cost; the cumulative curve is intentionally much softer than exponential progression. */
export function skillXpForNextRank(level: number) {
  const safeLevel = clamp(whole(level), 0, MAX_SKILL_LEVEL);
  return safeLevel >= MAX_SKILL_LEVEL ? 0 : 120 + safeLevel * 18;
}

export function characterXpForNextLevel(level: number) {
  const safeLevel = clamp(whole(level, 1), 1, Number.MAX_SAFE_INTEGER);
  return Math.min(MAX_PERSISTED_XP, 250 + safeLevel * 75);
}

function blankSkills(): Record<SkillId, SkillProgress> {
  return Object.fromEntries(SKILL_IDS.map((skillId) => [skillId, { level: 0, xp: 0 }])) as Record<SkillId, SkillProgress>;
}

function blankAscendantTraits(): Record<SkillId, boolean> {
  return Object.fromEntries(SKILL_IDS.map((skillId) => [skillId, false])) as Record<SkillId, boolean>;
}

export function createSkillState(): SkillState {
  return {
    schema: SKILLS_SCHEMA,
    skills: blankSkills(),
    characterLevel: 1,
    characterXp: 0,
    perkPoints: 0,
    unlockedPerkIds: [],
    ascendantTraits: blankAscendantTraits(),
    ascendantHealthFloorEnabled: false,
  };
}

function normalizeProgress(value: unknown): SkillProgress {
  if (!value || typeof value !== "object") return { level: 0, xp: 0 };
  const input = value as Partial<SkillProgress>;
  const level = clamp(whole(input.level), 0, MAX_SKILL_LEVEL);
  const next = skillXpForNextRank(level);
  const xp = level >= MAX_SKILL_LEVEL ? 0 : clamp(finite(input.xp), 0, Math.max(0, next - 1));
  return { level, xp };
}

export function normalizeSkillState(value: unknown): SkillState {
  if (!value || typeof value !== "object") return createSkillState();
  const input = value as Partial<SkillState>;
  const skills = blankSkills();
  if (input.skills && typeof input.skills === "object") {
    for (const skillId of SKILL_IDS) skills[skillId] = normalizeProgress(input.skills[skillId]);
  }
  const unlocked = new Set<string>();
  const requested = new Set(Array.isArray(input.unlockedPerkIds) ? input.unlockedPerkIds.slice(0, MAX_PERK_SAVE_ENTRIES).filter((id): id is string => typeof id === "string") : []);
  for (const perk of PERKS) {
    if (!requested.has(perk.id)) continue;
    if (skills[perk.skillId].level < perk.requiredLevel) continue;
    if (!perk.prerequisites.every((id) => unlocked.has(id))) continue;
    unlocked.add(perk.id);
  }
  const state: SkillState = {
    schema: SKILLS_SCHEMA,
    skills,
    characterLevel: clamp(whole(input.characterLevel, 1), 1, Number.MAX_SAFE_INTEGER),
    characterXp: clamp(finite(input.characterXp), 0, MAX_PERSISTED_XP),
    perkPoints: clamp(whole(input.perkPoints), 0, Number.MAX_SAFE_INTEGER),
    unlockedPerkIds: PERKS.map((perk) => perk.id).filter((id) => unlocked.has(id)),
    ascendantTraits: blankAscendantTraits(),
    ascendantHealthFloorEnabled: false,
  };
  const requestedTraits = input.ascendantTraits && typeof input.ascendantTraits === "object"
    ? input.ascendantTraits as Partial<Record<SkillId, unknown>>
    : {};
  const ascendantTraits = blankAscendantTraits();
  for (const skillId of SKILL_IDS) {
    ascendantTraits[skillId] = skills[skillId].level >= MAX_SKILL_LEVEL && requestedTraits[skillId] === true;
  }
  // v1 saves exposed only one all-skills health-floor toggle. It now belongs
  // solely to Survival and remains enabled when that one discipline is mastered.
  if (input.ascendantHealthFloorEnabled === true && skills.survival.level >= MAX_SKILL_LEVEL) ascendantTraits.survival = true;
  const nextCharacterXp = characterXpForNextLevel(state.characterLevel);
  return {
    ...state,
    characterXp: Math.min(state.characterXp, Math.max(0, nextCharacterXp - 1)),
    ascendantTraits,
    ascendantHealthFloorEnabled: ascendantTraits.survival,
  };
}

function linearCharacterCost(startLevel: number, levels: number) {
  if (levels <= 0) return 0;
  const first = 250 + startLevel * 75;
  const cost = levels * first + 75 * levels * (levels - 1) / 2;
  return Number.isFinite(cost) ? cost : Number.POSITIVE_INFINITY;
}

/** Adds uncapped character XP using a bounded binary search rather than a level-by-level loop. */
export function addCharacterXp(state: SkillState, amount: number) {
  const gained = clamp(finite(amount), 0, MAX_PERSISTED_XP);
  if (gained <= 0 || state.characterLevel >= Number.MAX_SAFE_INTEGER) return { state, gainedLevels: 0 };
  const available = Math.min(MAX_PERSISTED_XP, state.characterXp + gained);
  const maximumLevels = Number.MAX_SAFE_INTEGER - state.characterLevel;
  let low = 0;
  let high = 1;
  while (high < maximumLevels && linearCharacterCost(state.characterLevel, high) <= available) {
    high = Math.min(maximumLevels, high * 2);
  }
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (linearCharacterCost(state.characterLevel, middle) <= available) low = middle;
    else high = middle - 1;
  }
  const spent = linearCharacterCost(state.characterLevel, low);
  return {
    state: {
      ...state,
      characterLevel: state.characterLevel + low,
      characterXp: Math.max(0, available - spent),
    },
    gainedLevels: low,
  };
}

export function addSkillXp(state: SkillState, skillId: SkillId, amount: number): SkillXpResult {
  const current = state.skills[skillId];
  const gainedXp = clamp(finite(amount), 0, MAX_PERSISTED_XP);
  if (gainedXp <= 0 || current.level >= MAX_SKILL_LEVEL) {
    return { state, skillId, gainedLevels: 0, characterLevelsGained: 0, perkPointsGained: 0 };
  }
  let level = current.level;
  let xp = Math.min(MAX_PERSISTED_XP, current.xp + gainedXp);
  while (level < MAX_SKILL_LEVEL) {
    const needed = skillXpForNextRank(level);
    if (xp < needed) break;
    xp -= needed;
    level += 1;
  }
  if (level >= MAX_SKILL_LEVEL) xp = 0;
  const gainedLevels = level - current.level;
  const oldMilestones = Math.floor(current.level / PERK_POINT_INTERVAL);
  const newMilestones = Math.floor(level / PERK_POINT_INTERVAL);
  const perkPointsGained = newMilestones - oldMilestones;
  let next: SkillState = {
    ...state,
    skills: { ...state.skills, [skillId]: { level, xp } },
    perkPoints: Math.min(Number.MAX_SAFE_INTEGER, state.perkPoints + perkPointsGained),
  };
  const character = addCharacterXp(next, gainedXp * 0.35);
  next = character.state;
  return { state: next, skillId, gainedLevels, characterLevelsGained: character.gainedLevels, perkPointsGained };
}

export function perkDefinition(perkId: string) {
  return PERK_BY_ID.get(perkId) ?? null;
}

export function unlockPerk(state: SkillState, perkId: string): UnlockPerkResult {
  const perk = perkDefinition(perkId);
  if (!perk) return { state, unlocked: false, reason: "unknown-perk" };
  if (state.unlockedPerkIds.includes(perk.id)) return { state, unlocked: false, reason: "already-unlocked" };
  if (state.skills[perk.skillId].level < perk.requiredLevel) return { state, unlocked: false, reason: "skill-too-low" };
  if (!perk.prerequisites.every((id) => state.unlockedPerkIds.includes(id))) return { state, unlocked: false, reason: "missing-prerequisite" };
  if (state.perkPoints < perk.cost) return { state, unlocked: false, reason: "not-enough-points" };
  return {
    state: {
      ...state,
      perkPoints: state.perkPoints - perk.cost,
      unlockedPerkIds: PERKS.map((definition) => definition.id).filter((id) => id === perk.id || state.unlockedPerkIds.includes(id)),
    },
    unlocked: true,
    reason: "unlocked",
  };
}

export function perkEffects(state: SkillState, skillId?: SkillId) {
  return state.unlockedPerkIds
    .map((id) => PERK_BY_ID.get(id))
    .filter((perk): perk is PerkDefinition => Boolean(perk && (!skillId || perk.skillId === skillId)))
    .flatMap((perk) => perk.effects);
}

export function hasPerkAbility(state: SkillState, ability: string) {
  return perkEffects(state).some((effect) => effect.kind === "unlock" && effect.ability === ability);
}

/**
 * Ordinary maps stop at the explored bounds. Trail Memory adds useful context
 * around those bounds; the Exploration capstone turns the map into a true
 * world-scale survey without changing chunk coordinates.
 */
export function explorationMinimumMapZoom(state: SkillState) {
  if (ascendantTraitEnabled(state, "exploration")) return 0.2;
  return hasPerkAbility(state, "extended-map-zoom") ? 0.5 : 1;
}

export function explorationShowsDistantPoiLabels(_state: SkillState) {
  void _state;
  // Discovered POIs are navigation information, not a progression tax. Their
  // names stay readable at every scale; Exploration perks expand view and
  // tracking range instead.
  return true;
}

export function explorationTracksAtAnyDistance(state: SkillState) {
  return ascendantTraitEnabled(state, "exploration") || hasPerkAbility(state, "world-compass-tracking");
}

export function explorationHasFreeMapTravel(state: SkillState) {
  return ascendantTraitEnabled(state, "exploration");
}

/** Alignment changes how quickly the spread closes, but rank 1000 is exact. */
export function barteringConvergence(level: number, factionAlignment = 0, alignmentInfluenceBonusPercent = 0) {
  const rank = clamp(whole(level), 0, MAX_SKILL_LEVEL);
  if (rank >= MAX_SKILL_LEVEL) return 1;
  const alignmentScale = 1 + clamp(finite(alignmentInfluenceBonusPercent), 0, 200) / 100;
  const alignmentRanks = clamp(finite(factionAlignment), -10_000, 10_000) / 10_000 * 180 * alignmentScale;
  return clamp((rank + alignmentRanks) / MAX_SKILL_LEVEL, 0, 1);
}

/** Every Luck rank is a literal one-percent multiplier, capped at certainty. */
export function luckAdjustedChance(baseChance: number, level: number, effectivenessBonusPercent = 0) {
  const safeChance = clamp(finite(baseChance), 0, 1);
  const bonus = 1 + clamp(finite(effectivenessBonusPercent), 0, 500) / 100;
  const adjustedMultiplier = 1 + (skillMultiplier(level) - 1) * bonus;
  return clamp(safeChance * adjustedMultiplier, 0, 1);
}

export function hasAllSkillsMastered(state: SkillState) {
  return SKILL_IDS.every((skillId) => state.skills[skillId].level >= MAX_SKILL_LEVEL);
}

export function isSkillMastered(state: SkillState, skillId: SkillId) {
  return state.skills[skillId].level >= MAX_SKILL_LEVEL;
}

export function ascendantTraitEnabled(state: SkillState, skillId: SkillId) {
  return isSkillMastered(state, skillId) && state.ascendantTraits?.[skillId] === true;
}

export function setAscendantTraitEnabled(state: SkillState, skillId: SkillId, enabled: boolean) {
  if (enabled && !isSkillMastered(state, skillId)) return { state, changed: false, reason: "mastery-required" as const };
  const current = ascendantTraitEnabled(state, skillId);
  if (current === enabled) return { state, changed: false, reason: "unchanged" as const };
  const ascendantTraits = { ...state.ascendantTraits, [skillId]: enabled };
  return {
    state: {
      ...state,
      ascendantTraits,
      ascendantHealthFloorEnabled: ascendantTraits.survival === true,
    },
    changed: true,
    reason: enabled ? "enabled" as const : "disabled" as const,
  };
}

export function setAscendantHealthFloorEnabled(state: SkillState, enabled: boolean) {
  return setAscendantTraitEnabled(state, "survival", enabled);
}

/** Apply after damage resolution; it does not heal above the ten-percent safeguard. */
export function applyAscendantHealthFloor(state: SkillState, incomingHealth: number, maxHealth: number) {
  const safeMax = Math.max(0, finite(maxHealth));
  const candidate = clamp(finite(incomingHealth), 0, safeMax);
  return ascendantTraitEnabled(state, "survival")
    ? Math.max(candidate, safeMax * 0.1)
    : candidate;
}
