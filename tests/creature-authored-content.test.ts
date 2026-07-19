import assert from "node:assert/strict";
import test from "node:test";
import { AUTHORED_CREATURE_CAPTURE_SHEETS } from "../app/game/creature-capture";
import { CREATURE_ECOLOGY_CONTRACTS, EXPANSION_CREATURE_ECOLOGY_SEEDS } from "../app/game/creature-ecology";
import { CREATURE_MOVES, EXPANSION_CREATURE_MOVE_SHEETS } from "../app/game/creature-moves";
import {
  CREATURE_CONTENT_SHEETS, EXPANSION_CREATURE_NATURAL_TYPES, EXPANSION_CREATURE_ORDER,
  creatureProfile, validateCreatureProfiles,
} from "../app/game/creature-profiles";
import {
  EXPANSION_CREATURE_RARITY_POLICIES, PRIME_FORM_PROFILES, PRIME_ROUTE_PROFILES,
  advancePrimeEncounterClue, createPrimeEncounterState, planPrimeEncounter,
} from "../app/game/creature-rarity";
import { EXPANSION_CREATURE_STAT_SEEDS } from "../app/game/creature-stats";
import { LEGENDARY_CREATURE_ORDER, LIVING_ROSTER_ORDER, SUMMONED_CREATURE_ORDER } from "../app/game/mobs";

const EXPECTED_ORDER = [...LIVING_ROSTER_ORDER, ...LEGENDARY_CREATURE_ORDER, ...SUMMONED_CREATURE_ORDER];
const sorted = (values: readonly string[]) => [...values].sort();

test("the creature expansion is exhaustive across every authored content layer", () => {
  assert.equal(EXPECTED_ORDER.length, 52);
  assert.deepEqual(EXPANSION_CREATURE_ORDER, EXPECTED_ORDER);
  for (const registry of [
    CREATURE_CONTENT_SHEETS,
    EXPANSION_CREATURE_NATURAL_TYPES,
    EXPANSION_CREATURE_STAT_SEEDS,
    EXPANSION_CREATURE_MOVE_SHEETS,
    AUTHORED_CREATURE_CAPTURE_SHEETS,
    EXPANSION_CREATURE_ECOLOGY_SEEDS,
    EXPANSION_CREATURE_RARITY_POLICIES,
  ]) assert.deepEqual(sorted(Object.keys(registry)), sorted(EXPECTED_ORDER));
  assert.deepEqual(validateCreatureProfiles(), []);
});

test("expansion stats and types are fixed authored lines, never per-specimen formulas", () => {
  const statLines = new Set<string>();
  for (const kind of EXPANSION_CREATURE_ORDER) {
    const sheet = CREATURE_CONTENT_SHEETS[kind];
    const profile = creatureProfile(kind);
    assert.equal(sheet.stableId, kind);
    assert.equal(profile.authorship, "explicit");
    assert.deepEqual(profile.stats.base, EXPANSION_CREATURE_STAT_SEEDS[kind].base);
    assert.deepEqual(profile.naturalTypes, EXPANSION_CREATURE_NATURAL_TYPES[kind]);
    assert.ok(Object.values(profile.stats.base).every((value) => Number.isInteger(value) && value >= 1 && value <= 100));
    statLines.add(JSON.stringify(profile.stats.base));
  }
  assert.ok(statLines.size >= 35, `expected species-shaped stat lines, received ${statLines.size}`);
  assert.deepEqual(creatureProfile("currentweaver-eel").naturalTypes, ["tide"], "Storm is a visible charged form, not a natural index-derived type");
  assert.deepEqual(creatureProfile("sugarwake-sovereign").naturalTypes, ["confection", "arcane", "flame"], "Dream and Draconic remain encounter phases");
});

test("every expansion move kit has explicit anatomy, timing, status, and progression metadata", () => {
  const descriptions = new Set<string>();
  const timingSignatures = new Set<string>();
  for (const kind of EXPANSION_CREATURE_ORDER) {
    const sheet = EXPANSION_CREATURE_MOVE_SHEETS[kind];
    assert.ok(sheet.moves.length >= 4, `${kind} move count`);
    assert.ok(sheet.unlocks.filter((unlock) => unlock.moveId !== sheet.basicMoveId).length >= 3, `${kind} progression count`);
    assert.equal(sheet.moves.some((move) => move.id === sheet.basicMoveId && move.aiTags.includes("basic")), true, `${kind} basic action`);
    assert.equal(sheet.moves.some((move) => move.id === sheet.fieldUtilityMoveId), true, `${kind} field action`);
    for (const move of sheet.moves) {
      assert.equal(CREATURE_MOVES[move.id], move, `${move.id} registry identity`);
      assert.match(move.id, new RegExp(`^${kind}--`));
      assert.doesNotMatch(move.description, /^An authored\b|aligned basic action|belonging to/iu);
      assert.ok(move.description.length >= 45, `${move.id} description`);
      assert.ok(move.telegraph.length >= 35, `${move.id} telegraph`);
      assert.ok(move.windupSeconds >= .14 && move.activeSeconds > 0 && move.recoverySeconds > 0 && move.cooldownSeconds > 0);
      descriptions.add(move.description);
      timingSignatures.add([move.windupSeconds, move.activeSeconds, move.recoverySeconds, move.cooldownSeconds].join(":"));
    }
  }
  assert.equal(descriptions.size, [...Object.values(EXPANSION_CREATURE_MOVE_SHEETS)].flatMap((sheet) => sheet.moves).length);
  assert.ok(timingSignatures.size >= 70, `expected intentional timing variety, received ${timingSignatures.size}`);
  assert.equal(CREATURE_MOVES["sunfoil-pangolin--scale-curl"].appliesStatus, "guarded");
  assert.equal(CREATURE_MOVES["currentweaver-eel--arc-snap"].appliesStatus, "shocked");
  assert.equal(CREATURE_MOVES["briarclaw-lynx--briar-pounce"].appliesStatus, "rooted");
});

test("capture, care, work, release, and rarity hooks are species-authored and non-generic", () => {
  const hooks = new Set<string>();
  const workBehaviors = new Set<string>();
  const releaseOutcomes = new Set<string>();
  for (const kind of EXPANSION_CREATURE_ORDER) {
    const capture = AUTHORED_CREATURE_CAPTURE_SHEETS[kind];
    const ecology = CREATURE_ECOLOGY_CONTRACTS[kind];
    const rarity = EXPANSION_CREATURE_RARITY_POLICIES[kind];
    assert.equal(capture.kind, kind);
    assert.ok(capture.microHook.length >= 55 && capture.careClues.every((clue) => clue.length >= 30), `${kind} capture/care detail`);
    assert.equal(ecology.authorship, "explicit");
    assert.ok(ecology.ecologicalVerb.length >= 4 && ecology.workBehavior.length >= 55 && ecology.releaseOutcome.length >= 40, `${kind} ecology detail`);
    assert.ok(rarity.stableIdentityPolicy.length >= 35 && rarity.shinyTreatment.length >= 35, `${kind} rarity detail`);
    hooks.add(capture.microHook);
    workBehaviors.add(ecology.workBehavior);
    releaseOutcomes.add(ecology.releaseOutcome);
  }
  assert.equal(hooks.size, EXPECTED_ORDER.length);
  assert.equal(workBehaviors.size, EXPECTED_ORDER.length);
  assert.equal(releaseOutcomes.size, EXPECTED_ORDER.length);
  for (const kind of LIVING_ROSTER_ORDER) assert.notEqual(AUTHORED_CREATURE_CAPTURE_SHEETS[kind].profileId, "legendary");
  for (const kind of LEGENDARY_CREATURE_ORDER) assert.equal(AUTHORED_CREATURE_CAPTURE_SHEETS[kind].profileId, "legendary");
  for (const kind of SUMMONED_CREATURE_ORDER) assert.equal(AUTHORED_CREATURE_CAPTURE_SHEETS[kind].profileId, "uncapturable");
});

test("Prime progress stores profile-specific ecological verbs while accepting legacy engine interactions", () => {
  assert.deepEqual(sorted(Object.keys(PRIME_ROUTE_PROFILES)), sorted(Object.keys(PRIME_FORM_PROFILES)));
  for (const [kind, route] of Object.entries(PRIME_ROUTE_PROFILES)) {
    assert.equal(route.length, 3);
    assert.equal(new Set(route.map((step) => step.id)).size, 3, `${kind} route IDs`);
    assert.equal(new Set(route.map((step) => step.ecologicalVerb)).size, 3, `${kind} ecological verbs`);
    assert.ok(route.every((step) => step.clue.length >= 35));
  }
  const plan = planPrimeEncounter("petalfox", {
    worldSeed: "authored-route", x: 0, y: 64, z: 0, surfaceY: 64,
    biomeName: "Glimmerwood", weather: "clear", daylight: .8,
  });
  assert.ok(plan);
  let state = createPrimeEncounterState(plan, "petalfox", 42, 100);
  state = advancePrimeEncounterClue(state, "field-sighting", 110);
  state = advancePrimeEncounterClue(state, "distinctive-call", 120);
  state = advancePrimeEncounterClue(state, "kinmark-study", 130);
  assert.deepEqual(state.completedClues, ["field-sighting", "distinctive-call", "kinmark-study"], "old saves and callers retain their compatibility IDs");
  assert.deepEqual(state.completedRouteVerbs, PRIME_ROUTE_PROFILES.petalfox.map((step) => step.id), "new progress records species-specific ecological actions");
});
