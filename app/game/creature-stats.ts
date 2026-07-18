import type { MobDefinition, MobKind } from "./mobs";

export type CreatureStats = Readonly<{
  vitality: number;
  power: number;
  focus: number;
  guard: number;
  ward: number;
  agility: number;
}>;

export type CreatureGrowthProfileId = "swift" | "sturdy" | "mystic" | "balanced" | "guardian" | "leviathan";

export type CreatureStatProfile = Readonly<{
  kind: MobKind;
  base: CreatureStats;
  growth: CreatureGrowthProfileId;
  maximumLevel: 50 | 55 | 60;
}>;

export const CREATURE_GROWTH_PROFILES = Object.freeze({
  swift: { healthPerLevel: 0.022, outputPerLevel: 0.019, guardBreakpoints: [18, 38], wardBreakpoints: [20, 40], agilityRange: 0.2 },
  sturdy: { healthPerLevel: 0.029, outputPerLevel: 0.017, guardBreakpoints: [10, 24, 40], wardBreakpoints: [18, 36], agilityRange: 0.12 },
  mystic: { healthPerLevel: 0.024, outputPerLevel: 0.019, guardBreakpoints: [24, 44], wardBreakpoints: [8, 22, 38], agilityRange: 0.16 },
  balanced: { healthPerLevel: 0.026, outputPerLevel: 0.018, guardBreakpoints: [16, 34], wardBreakpoints: [16, 34], agilityRange: 0.16 },
  guardian: { healthPerLevel: 0.03, outputPerLevel: 0.017, guardBreakpoints: [8, 20, 34, 48], wardBreakpoints: [12, 28, 44], agilityRange: 0.1 },
  leviathan: { healthPerLevel: 0.032, outputPerLevel: 0.018, guardBreakpoints: [8, 18, 30, 42, 54], wardBreakpoints: [10, 22, 36, 50], agilityRange: 0.08 },
} as const satisfies Readonly<Record<CreatureGrowthProfileId, Readonly<{
  healthPerLevel: number;
  outputPerLevel: number;
  guardBreakpoints: readonly number[];
  wardBreakpoints: readonly number[];
  agilityRange: number;
}>>>);

const clampStat = (value: number) => Math.max(1, Math.min(100, Math.round(value)));

/**
 * Converts the existing authored anatomy/combat definition into one fixed,
 * readable six-stat line. This is deterministic species data, not an
 * individual roll: two specimens of the same kind begin with the same line.
 */
export function baseCreatureStats(definition: MobDefinition): CreatureStats {
  const familyGuard = definition.family === "construct" ? 18
    : definition.family === "dragon" || definition.family === "leviathan" || definition.family === "legendary" ? 14
      : definition.family === "undead" ? 9
        : definition.family === "sea-slug" || definition.family === "butterfly" ? 1 : 5;
  const familyWard = definition.family === "dragon" ? 16
    : definition.family === "construct" ? 11
      : definition.family === "undead" ? 13
        : definition.ranged ? 9 : 4;
  const magicalIdentity = /magic|rune|spell|luminous|starlight|dream|moon|aether|arcane|ward|spirit|glow/iu.test(`${definition.behavior} ${definition.lore} ${definition.name}`);
  return Object.freeze({
    vitality: clampStat(8 + definition.health * 1.25),
    power: clampStat(5 + definition.damage * 4.2 + (definition.hostile ? 4 : 0)),
    focus: clampStat(4 + (definition.ranged ? definition.damage * 4 : definition.damage * 1.4) + (magicalIdentity ? 18 : 0)),
    guard: clampStat(familyGuard + definition.radius * 16 + definition.health * 0.22),
    ward: clampStat(familyWard + (magicalIdentity ? 14 : 0) + definition.health * 0.12),
    agility: clampStat(8 + definition.speed * 13 + definition.chaseSpeed * 4 + definition.turnRate * 1.5),
  });
}

export function growthProfileForDefinition(definition: MobDefinition): CreatureGrowthProfileId {
  if (definition.family === "leviathan" || definition.family === "dragon" || definition.family === "legendary") return "leviathan";
  if (definition.family === "construct" || definition.radius >= 0.85 || definition.health >= 70) return "guardian";
  if (definition.movement === "flying" || definition.family === "rabbit" || definition.family === "butterfly") return "swift";
  if (definition.ranged || /magic|rune|dream|moon|spirit|glow|aether/iu.test(`${definition.name} ${definition.behavior}`)) return "mystic";
  if (definition.health >= 28 || definition.radius >= 0.68) return "sturdy";
  return "balanced";
}

export function creatureStatProfile(kind: MobKind, definition: MobDefinition): CreatureStatProfile {
  const growth = growthProfileForDefinition(definition);
  const maximumLevel: 50 | 55 | 60 = definition.family === "dragon" || definition.family === "leviathan" || definition.family === "legendary" || definition.family === "summon" ? 60
    : definition.persistent && definition.hostile ? 55 : 50;
  return Object.freeze({ kind, base: baseCreatureStats(definition), growth, maximumLevel });
}

function breakpointPoints(level: number, breakpoints: readonly number[]) {
  return breakpoints.reduce((sum, breakpoint) => sum + (level >= breakpoint ? 2 : 0), 0);
}

export function statsAtLevel(profile: CreatureStatProfile, requestedLevel: number): CreatureStats {
  const level = Math.max(1, Math.min(profile.maximumLevel, Math.floor(requestedLevel)));
  const growth = CREATURE_GROWTH_PROFILES[profile.growth];
  const offset = level - 1;
  return Object.freeze({
    vitality: clampStat(profile.base.vitality * (1 + growth.healthPerLevel * offset)),
    power: clampStat(profile.base.power * (1 + growth.outputPerLevel * offset)),
    focus: clampStat(profile.base.focus * (1 + growth.outputPerLevel * offset)),
    guard: clampStat(profile.base.guard + breakpointPoints(level, growth.guardBreakpoints)),
    ward: clampStat(profile.base.ward + breakpointPoints(level, growth.wardBreakpoints)),
    agility: clampStat(profile.base.agility * (1 + growth.agilityRange * offset / Math.max(1, profile.maximumLevel - 1))),
  });
}

export function statBand(value: number): "Very low" | "Low" | "Moderate" | "High" | "Exceptional" {
  if (value < 18) return "Very low";
  if (value < 34) return "Low";
  if (value < 55) return "Moderate";
  if (value < 76) return "High";
  return "Exceptional";
}

export function creatureMaximumHealth(definition: MobDefinition, profile: CreatureStatProfile, level: number) {
  const growth = CREATURE_GROWTH_PROFILES[profile.growth];
  const safeLevel = Math.max(1, Math.min(profile.maximumLevel, Math.floor(level)));
  return Math.max(1, definition.health * (1 + growth.healthPerLevel * (safeLevel - 1)));
}

export function creatureOutputMultiplier(profile: CreatureStatProfile, level: number) {
  const safeLevel = Math.max(1, Math.min(profile.maximumLevel, Math.floor(level)));
  return 1 + CREATURE_GROWTH_PROFILES[profile.growth].outputPerLevel * (safeLevel - 1);
}
