/** Pure, extensible RPG skills and perk progression for Blockwild saves. */

export const SKILLS_SCHEMA = 1 as const;
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
] as const;

export type SkillId = (typeof SKILL_IDS)[number];

export type SkillDefinition = Readonly<{
  id: SkillId;
  name: string;
  description: string;
  practice: string;
  accent: string;
}>;

export const SKILLS: readonly SkillDefinition[] = Object.freeze([
  { id: "melee", name: "Melee", description: "Close weapon damage, control, and committed strikes.", practice: "Land melee hits against living threats.", accent: "#e57b64" },
  { id: "ranged", name: "Ranged", description: "Projectile damage and steadiness at distance.", practice: "Hit valid targets with bows, crossbows, or thrown weapons.", accent: "#d9a45d" },
  { id: "mining", name: "Mining", description: "Tool power against stone, ore, and deep materials.", practice: "Break naturally generated stone and ore with the right tool.", accent: "#92a6b2" },
  { id: "crafting", name: "Crafting", description: "Reliable fabrication, repair, brewing, and station work.", practice: "Finish recipes and collect completed station batches.", accent: "#c69868" },
  { id: "survival", name: "Survival", description: "Hardiness, recovery, food use, and hostile-weather endurance.", practice: "Travel, recover, eat, and survive genuine environmental danger.", accent: "#82ae70" },
  { id: "husbandry", name: "Husbandry", description: "Creature care, trust, breeding, riding, and command.", practice: "Feed, heal, tame, breed, or train creatures responsibly.", accent: "#d98aa5" },
  { id: "exploration", name: "Exploration", description: "Efficient travel and knowledge of unseen country.", practice: "Render new chunks, discover POIs, and complete difficult journeys.", accent: "#67afad" },
  { id: "magic", name: "Magic", description: "Spell potency, mana recovery, and arcane control.", practice: "Cast useful spells against valid targets or hazards.", accent: "#9d83d8" },
] satisfies readonly SkillDefinition[]);

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
  { id: "exploration-trail-memory", skillId: "exploration", name: "Trail Memory", description: "Known natural POIs remain legible one map zoom farther out.", requiredLevel: 25, cost: 1, prerequisites: [], effects: [{ kind: "unlock", ability: "far-map-poi-labels" }] },
  { id: "exploration-horizon-step", skillId: "exploration", name: "Horizon Step", description: "Fast-travel channel movement tolerance rises slightly without shortening the channel.", requiredLevel: 150, cost: 2, prerequisites: ["exploration-trail-memory"], effects: [{ kind: "flat-bonus", stat: "fast-travel-movement-tolerance", amount: 0.04 }] },
  { id: "magic-calm-channel", skillId: "magic", name: "Calm Channel", description: "Taking light damage during a channeled working no longer erases all accumulated cast progress.", requiredLevel: 25, cost: 1, prerequisites: [], effects: [{ kind: "unlock", ability: "partial-channel-retention" }] },
  { id: "magic-spellweaver", skillId: "magic", name: "Spellweaver", description: "Switching wheel favorites cancels less of the current casting recovery.", requiredLevel: 150, cost: 2, prerequisites: ["magic-calm-channel"], effects: [{ kind: "percent-bonus", stat: "spell-switch-recovery", amount: 15 }] },
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

export function createSkillState(): SkillState {
  return {
    schema: SKILLS_SCHEMA,
    skills: blankSkills(),
    characterLevel: 1,
    characterXp: 0,
    perkPoints: 0,
    unlockedPerkIds: [],
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
    ascendantHealthFloorEnabled: input.ascendantHealthFloorEnabled === true,
  };
  const nextCharacterXp = characterXpForNextLevel(state.characterLevel);
  const normalized = { ...state, characterXp: Math.min(state.characterXp, Math.max(0, nextCharacterXp - 1)) };
  return normalized.ascendantHealthFloorEnabled && !hasAllSkillsMastered(normalized)
    ? { ...normalized, ascendantHealthFloorEnabled: false }
    : normalized;
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

export function hasAllSkillsMastered(state: SkillState) {
  return SKILL_IDS.every((skillId) => state.skills[skillId].level >= MAX_SKILL_LEVEL);
}

export function setAscendantHealthFloorEnabled(state: SkillState, enabled: boolean) {
  if (enabled && !hasAllSkillsMastered(state)) return { state, changed: false, reason: "mastery-required" as const };
  if (state.ascendantHealthFloorEnabled === enabled) return { state, changed: false, reason: "unchanged" as const };
  return { state: { ...state, ascendantHealthFloorEnabled: enabled }, changed: true, reason: enabled ? "enabled" as const : "disabled" as const };
}

/** Apply after damage resolution; it does not heal above the ten-percent safeguard. */
export function applyAscendantHealthFloor(state: SkillState, incomingHealth: number, maxHealth: number) {
  const safeMax = Math.max(0, finite(maxHealth));
  const candidate = clamp(finite(incomingHealth), 0, safeMax);
  return state.ascendantHealthFloorEnabled && hasAllSkillsMastered(state)
    ? Math.max(candidate, safeMax * 0.1)
    : candidate;
}
