import assert from "node:assert/strict";
import test from "node:test";
import {
  MAGIC_ATTUNEMENT_QUEST_ID,
  MAX_FAVORITE_SPELLS,
  SPELLS,
  SPELL_WHEEL_HOLD_MS,
  TOMES,
  type SpellAcquisitionSource,
  advanceSpellKey,
  attuneMagicFromQuest,
  castSelectedSpell,
  createMagicState,
  createSpellKeyState,
  discoverSpell,
  increaseManaCapacity,
  learnSpellFromTome,
  normalizeMagicState,
  pressSpellKey,
  regenerateMana,
  releaseSpellKey,
  selectSpell,
  setFavoriteSpells,
  shouldShowManaBar,
  spellWheelSlots,
} from "../app/game/magic.ts";

function learn(state = createMagicState(), ...tomeIds: string[]) {
  return tomeIds.reduce((current, tomeId, index) => learnSpellFromTome(current, tomeId, 10 + index).state, state);
}

test("the initial spell codex covers every school, every faction, lairs, loot, and quests", () => {
  assert.deepEqual(new Set(SPELLS.map((spell) => spell.school)), new Set(["destruction", "restoration", "alteration", "conjuration", "utility"]));
  const sources = SPELLS.flatMap<SpellAcquisitionSource>((spell) => spell.sources);
  assert.deepEqual(new Set(sources.filter((source) => source.kind === "faction").map((source) => source.factionId)), new Set(["hobbits", "goblins", "atlantians", "sugarcourt"]));
  assert.ok(sources.some((source) => source.kind === "loot"));
  assert.ok(sources.some((source) => source.kind === "quest" && source.branch === "main"));
  assert.ok(sources.some((source) => source.kind === "quest" && source.branch === "side"));
  assert.deepEqual(new Set(sources.filter((source) => source.kind === "dragon-lair").map((source) => source.dragonType)), new Set(["fire", "ice", "steel"]));
  assert.equal(TOMES.length, SPELLS.length);
  for (const spell of SPELLS) {
    assert.ok(spell.animation.particleCue.length > 4);
    assert.ok(spell.sound.release.startsWith("spell."));
    assert.ok(spell.sound.impact.startsWith("spell."));
    assert.ok(spell.effects.length > 0);
  }
});

test("reusable tomes teach before attunement but the hard quest alone unlocks casting", () => {
  const blank = createMagicState();
  const learned = learnSpellFromTome(blank, "tome-flame-jet", 20);
  assert.equal(learned.outcome, "learned");
  assert.equal(learned.consumeTome, false);
  assert.equal(learned.state.attuned, false);
  assert.equal(learned.state.journal["flame-jet"]?.learnedAt, 20);
  assert.equal(castSelectedSpell(learned.state, 21, 0).reason, "not-attuned");

  const duplicate = learnSpellFromTome(learned.state, "tome-flame-jet", 22);
  assert.equal(duplicate.outcome, "already-known");
  assert.equal(duplicate.consumeTome, false);
  assert.strictEqual(attuneMagicFromQuest(duplicate.state, ["main-anything-else"], 30).state, duplicate.state);

  const attuned = attuneMagicFromQuest(duplicate.state, [MAGIC_ATTUNEMENT_QUEST_ID], 30);
  assert.equal(attuned.reason, "attuned");
  assert.equal(attuned.state.attuned, true);
  const cast = castSelectedSpell(attuned.state, 31, 75);
  assert.equal(cast.ok, true);
  if (!cast.ok) return;
  assert.equal(cast.plan.spellId, "flame-jet");
  assert.equal(cast.plan.manaSpent, 16);
  assert.equal(cast.plan.powerMultiplier, 1.75);
  assert.equal(cast.plan.projectile.trail, "embers");
  assert.equal(cast.plan.animation.particleCue, "spiral-embers-to-cone");
  assert.equal(cast.plan.sound.release, "spell.fire.jet");
  assert.equal(cast.state.journal["flame-jet"]?.castCount, 1);
  assert.equal(castSelectedSpell(cast.state, 31.2, 75).reason, "cooldown");
});

test("mana capacity upgrades bank before attunement, regeneration is bounded, and Magic 1000 is infinite", () => {
  let state = increaseManaCapacity(createMagicState(100), 5);
  assert.deepEqual([state.mana, state.maxMana], [105, 105]);
  state = learn(state, "tome-frost-lance");
  state = attuneMagicFromQuest(state, [MAGIC_ATTUNEMENT_QUEST_ID], 40).state;
  const first = castSelectedSpell(state, 41, 0);
  assert.equal(first.ok, true);
  if (!first.ok) return;
  assert.equal(first.state.mana, 83);
  assert.equal(regenerateMana(first.state, 10, 0).mana, 98);
  assert.equal(regenerateMana(first.state, 10_000, 0).mana, 105, "one update cannot regenerate above capacity");
  assert.equal(shouldShowManaBar(first.state, 999), true);

  const mastered = castSelectedSpell({ ...state, mana: 0 }, 50, 1_000);
  assert.equal(mastered.ok, true);
  if (mastered.ok) assert.deepEqual([mastered.plan.manaSpent, mastered.state.mana, mastered.plan.powerMultiplier], [0, 0, 11]);
  assert.equal(shouldShowManaBar(state, 1_000), false);
});

test("favorites are configurable and the Q contract distinguishes taps from holds", () => {
  let magic = learn(createMagicState(), ...TOMES.map((tome) => tome.itemId));
  magic = setFavoriteSpells(magic, ["arcane-ward", "arcane-ward", "blinkstep", "not-a-spell", "flame-jet"]);
  assert.deepEqual(magic.favoriteSpellIds, ["arcane-ward", "blinkstep", "flame-jet"]);
  magic = selectSpell(magic, "blinkstep");
  assert.equal(spellWheelSlots(magic).find((slot) => slot.selected)?.spellId, "blinkstep");
  assert.ok(spellWheelSlots(magic).length <= MAX_FAVORITE_SPELLS);

  let key = pressSpellKey(createSpellKeyState(), 1_000).state;
  const tap = releaseSpellKey(key, 1_000 + SPELL_WHEEL_HOLD_MS - 1);
  assert.equal(tap.action, "cast-selected");
  key = pressSpellKey(createSpellKeyState(), 2_000).state;
  const held = advanceSpellKey(key, 2_000 + SPELL_WHEEL_HOLD_MS);
  assert.equal(held.action, "open-wheel");
  assert.equal(held.state.wheelOpen, true);
  assert.equal(releaseSpellKey(held.state, 2_500).action, "close-wheel");
  key = pressSpellKey(createSpellKeyState(), 3_000).state;
  assert.equal(releaseSpellKey(key, 3_000 + SPELL_WHEEL_HOLD_MS + 1).action, "close-wheel", "a long release never accidentally casts if a render frame skipped the wheel transition");
});

test("magic save normalization rejects invented spells and clamps malformed resources", () => {
  const normalized = normalizeMagicState({
    schema: 99,
    attuned: "yes",
    mana: 9_999,
    maxMana: 80,
    learnedSpellIds: ["blinkstep", "invented", "blinkstep", "flame-jet"],
    favoriteSpellIds: ["invented", "blinkstep", "flame-jet", "blinkstep"],
    selectedSpellId: "invented",
    journal: {
      blinkstep: { discoveredAt: -5, learnedAt: 9, castCount: Number.POSITIVE_INFINITY, lastCastAt: -1 },
      invented: { discoveredAt: 1 },
    },
    cooldownReadyAt: { blinkstep: -4, invented: 100 },
  });
  assert.equal(normalized.attuned, false);
  assert.equal(normalized.mana, 80);
  assert.deepEqual(normalized.learnedSpellIds, ["flame-jet", "blinkstep"]);
  assert.deepEqual(normalized.favoriteSpellIds, ["blinkstep", "flame-jet"], "the configured wheel order survives save normalization");
  assert.equal(normalized.selectedSpellId, "blinkstep");
  assert.equal(normalized.journal.blinkstep?.discoveredAt, 0);
  assert.equal("invented" in normalized.journal, false);
  assert.deepEqual(normalized.cooldownReadyAt, {});

  const discovered = discoverSpell(createMagicState(), "arcane-ward", 77);
  assert.equal(discovered.journal["arcane-ward"]?.learnedAt, null);
  assert.deepEqual(discoverSpell(discovered, "not-real", 90), discovered);
});
