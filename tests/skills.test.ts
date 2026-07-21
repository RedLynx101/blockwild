import assert from "node:assert/strict";
import test from "node:test";
import {
  MAX_SKILL_LEVEL,
  PERKS,
  SKILL_IDS,
  addCharacterXp,
  addSkillXp,
  applyAscendantHealthFloor,
  ascendantTraitEnabled,
  createSkillState,
  explorationMinimumMapZoom,
  hasAllSkillsMastered,
  normalizeSkillState,
  setAscendantTraitEnabled,
  setAscendantHealthFloorEnabled,
  skillMultiplier,
  skillXpForNextRank,
  unlockPerk,
} from "../app/game/skills.ts";

test("exploration map scale expands tenfold at every progression tier", () => {
  const ordinary = createSkillState();
  assert.equal(explorationMinimumMapZoom(ordinary), 0.05);

  const perkState = {
    ...ordinary,
    skills: { ...ordinary.skills, exploration: { level: 25, xp: 0 } },
    unlockedPerkIds: ["exploration-trail-memory"],
  };
  assert.equal(explorationMinimumMapZoom(perkState), 0.025);

  const mastered = {
    ...ordinary,
    skills: { ...ordinary.skills, exploration: { level: MAX_SKILL_LEVEL, xp: 0 } },
  };
  const ascendant = setAscendantTraitEnabled(mastered, "exploration", true);
  assert.equal(ascendant.reason, "enabled");
  assert.equal(explorationMinimumMapZoom(ascendant.state), 0.01);
});

test("all ten extensible skills use the exact one-percent-per-point rule", () => {
  assert.deepEqual(SKILL_IDS, ["melee", "ranged", "mining", "crafting", "survival", "husbandry", "exploration", "magic", "bartering", "luck"]);
  assert.equal(skillMultiplier(0), 1);
  assert.equal(skillMultiplier(1), 1.01);
  assert.equal(skillMultiplier(100), 2);
  assert.equal(skillMultiplier(1_000), 11);
  assert.equal(skillMultiplier(50_000), 11);
  assert.equal(PERKS.length, 20);
});

test("skill rank costs grow linearly and practical progress awards milestone perk points", () => {
  assert.equal(skillXpForNextRank(1) - skillXpForNextRank(0), 18);
  assert.equal(skillXpForNextRank(900) - skillXpForNextRank(899), 18);
  let state = createSkillState();
  const toTwentyFive = Array.from({ length: 25 }, (_, level) => skillXpForNextRank(level)).reduce((sum, value) => sum + value, 0);
  const result = addSkillXp(state, "melee", toTwentyFive);
  state = result.state;
  assert.equal(state.skills.melee.level, 25);
  assert.equal(result.gainedLevels, 25);
  assert.equal(result.perkPointsGained, 1);
  assert.equal(state.perkPoints, 1);
  assert.ok(state.characterLevel > 1, "practiced skill XP also feeds uncapped character progression");
});

test("perk branches enforce rank, prerequisites, and currency without changing the base multiplier", () => {
  let state = createSkillState();
  assert.equal(unlockPerk(state, "melee-cleaving-line").reason, "skill-too-low");
  state = {
    ...state,
    skills: { ...state.skills, melee: { level: 150, xp: 0 } },
    perkPoints: 4,
  };
  assert.equal(unlockPerk(state, "melee-cleaving-line").reason, "missing-prerequisite");
  const root = unlockPerk(state, "melee-measured-strikes");
  assert.equal(root.reason, "unlocked");
  const branch = unlockPerk(root.state, "melee-cleaving-line");
  assert.equal(branch.reason, "unlocked");
  assert.deepEqual(branch.state.unlockedPerkIds, ["melee-measured-strikes", "melee-cleaving-line"]);
  assert.equal(skillMultiplier(branch.state.skills.melee.level), 2.5, "perks are explicit modifiers, not hidden changes to the 1%-per-rank rule");
});

test("character levels are uncapped and huge XP grants use a bounded calculation", () => {
  const result = addCharacterXp(createSkillState(), 1_000_000_000);
  assert.ok(result.state.characterLevel > 4_000);
  assert.ok(result.gainedLevels > 4_000);
  assert.ok(result.state.characterXp >= 0);
});

test("each mastered skill unlocks its own Ascendant trait independently", () => {
  const blank = createSkillState();
  assert.equal(hasAllSkillsMastered(blank), false);
  assert.equal(setAscendantHealthFloorEnabled(blank, true).reason, "mastery-required");
  const survivalMastered = {
    ...blank,
    skills: { ...blank.skills, survival: { level: MAX_SKILL_LEVEL, xp: 0 } },
  };
  assert.equal(hasAllSkillsMastered(survivalMastered), false);
  const enabled = setAscendantHealthFloorEnabled(survivalMastered, true);
  assert.equal(enabled.reason, "enabled");
  assert.equal(ascendantTraitEnabled(enabled.state, "survival"), true);
  assert.equal(applyAscendantHealthFloor(enabled.state, -20, 80), 8);
  assert.equal(applyAscendantHealthFloor(enabled.state, 36, 80), 36);
  assert.equal(applyAscendantHealthFloor(survivalMastered, -20, 80), 0);

  const magicMastered = {
    ...blank,
    skills: { ...blank.skills, magic: { level: MAX_SKILL_LEVEL, xp: 0 } },
  };
  const magicEnabled = setAscendantTraitEnabled(magicMastered, "magic", true);
  assert.equal(magicEnabled.reason, "enabled");
  assert.equal(ascendantTraitEnabled(magicEnabled.state, "magic"), true);
  assert.equal(ascendantTraitEnabled(magicEnabled.state, "survival"), false);
});

test("skill save normalization clamps levels and drops impossible perk or Ascendant state", () => {
  const normalized = normalizeSkillState({
    schema: 99,
    skills: {
      melee: { level: 24, xp: 999_999 },
      magic: { level: 7_000, xp: 99 },
      invented: { level: 1_000 },
    },
    characterLevel: -10,
    characterXp: Number.POSITIVE_INFINITY,
    perkPoints: -4,
    unlockedPerkIds: ["melee-measured-strikes", "melee-cleaving-line", "not-real"],
    ascendantHealthFloorEnabled: true,
  });
  assert.equal(normalized.skills.melee.level, 24);
  assert.ok(normalized.skills.melee.xp < skillXpForNextRank(24));
  assert.deepEqual(normalized.skills.magic, { level: 1_000, xp: 0 });
  assert.equal(normalized.characterLevel, 1);
  assert.equal(normalized.perkPoints, 0);
  assert.deepEqual(normalized.unlockedPerkIds, []);
  assert.equal(normalized.ascendantHealthFloorEnabled, false);
  assert.equal(normalized.ascendantTraits.magic, false, "unrequested mastered traits remain opt-in");
});

test("legacy health-floor saves migrate to the Survival capstone without all-skill mastery", () => {
  const normalized = normalizeSkillState({
    skills: { survival: { level: MAX_SKILL_LEVEL, xp: 0 } },
    ascendantHealthFloorEnabled: true,
  });
  assert.equal(normalized.ascendantTraits.survival, true);
  assert.equal(normalized.ascendantHealthFloorEnabled, true);
  assert.equal(applyAscendantHealthFloor(normalized, 0, 50), 5);
});
