import assert from "node:assert/strict";
import test from "node:test";
import { CAPTURE_PROFILES, captureKnowledgeForResearch, evaluateCaptureReadiness } from "../app/game/creature-capture";
import { applyCreatureCareAction, createCreatureCareState, reviewCreatureHabitat } from "../app/game/creature-care";
import { creatureAppearance } from "../app/game/creature-appearance";
import { captureIntoOrb, captureOrbInventorySlot, createEmptyCaptureOrb, decodeCaptureOrb, encodeCaptureOrb, fitCaptureOrbLens, releaseCaptureOrb } from "../app/game/capture-orbs";
import { migrateCreatureProgression } from "../app/game/creature-progression";
import type { CreatureMetadata } from "../app/game/creature-cage";
import { Item } from "../app/game/data";
import { inventorySlotsCanStack } from "../app/game/inventory-convenience";

const progression = migrateCreatureProgression({
  kind: "petalfox", entityId: "specimen-fern", geneticSeed: 8192, maximumLevel: 50,
  defaultMoveIds: ["wild-basic", "verdant-basic"],
});

const metadata: CreatureMetadata = {
  schema: 1, entityId: "specimen-fern", kind: "petalfox", health: 6, maxHealth: 8, ageTicks: 2000,
  baby: false, temperament: "Skittish", hostile: false, tamed: false, ownerId: null, name: "Fern",
  geneticSeed: 8192, command: null, custom: { progression: progression as never },
};

test("all nine capture profiles are deterministic authored checklists", () => {
  assert.deepEqual(Object.keys(CAPTURE_PROFILES), ["open", "gentle", "pursuit", "armored", "territorial", "aquatic", "resonant", "rescue", "legendary"]);
  const gentle = evaluateCaptureReadiness({ profileId: "gentle", states: { fed: true }, learnedConditions: ["calm", "fed", "unaware"] });
  assert.equal(gentle.ready, true);
  assert.equal(gentle.conditions[0]?.id, "fed");
  const unknown = evaluateCaptureReadiness({ profileId: "gentle", states: {}, learnedConditions: [] });
  assert.equal(unknown.ready, false);
  assert.equal(unknown.conditions[0]?.label, "Unknown condition");
});
test("aquatic capture requires both shared medium and a fitted Tide Lens", () => {
  const withoutLens = evaluateCaptureReadiness({ profileId: "aquatic", fittedLens: null, states: { submerged: true }, learnedConditions: ["submerged", "tide-lens"] });
  assert.equal(withoutLens.ready, false);
  assert.deepEqual(withoutLens.missingKnown, ["tide-lens"]);
  const ready = evaluateCaptureReadiness({ profileId: "aquatic", fittedLens: "tide", states: { submerged: true }, learnedConditions: ["submerged", "tide-lens"] });
  assert.equal(ready.ready, true);
});

test("research reveals authored capture conditions without changing rules", () => {
  assert.equal(captureKnowledgeForResearch("petalfox", "gentle", 0).learnedConditions.length, 0);
  assert.equal(captureKnowledgeForResearch("petalfox", "gentle", 1).learnedConditions.length, 1);
  assert.equal(captureKnowledgeForResearch("petalfox", "gentle", 3).mastered, true);
});

test("Capture Orb lenses and exact specimen progression survive encode, capture, and release", () => {
  const fitted = fitCaptureOrbLens(createEmptyCaptureOrb("orb-fern"), "gentle")!;
  assert.equal(decodeCaptureOrb(encodeCaptureOrb(fitted))?.lens, "gentle");
  const occupied = captureIntoOrb(fitted, metadata, 42)!;
  assert.equal(occupied.lens, "gentle");
  assert.equal(fitCaptureOrbLens(occupied, "tide"), null);
  const released = releaseCaptureOrb(decodeCaptureOrb(encodeCaptureOrb(occupied))!)!;
  assert.deepEqual(released.creature.custom.progression, progression);
  assert.equal(released.orb.lens, "gentle");
});

test("a released ordinary Capture Orb collapses to the metadata-free stackable shell", () => {
  const occupied = captureIntoOrb(createEmptyCaptureOrb("orb-stack-return"), metadata, 42)!;
  const released = releaseCaptureOrb(occupied)!;
  const slot = captureOrbInventorySlot(released.orb);
  assert.deepEqual(slot, { item: Item.CaptureOrb, count: 1 });
  assert.equal(inventorySlotsCanStack(slot, { item: Item.CaptureOrb, count: 12 }), true);
});

test("Creature Camp care is bounded, purposeful, and preserves Healing Station value", () => {
  const first = applyCreatureCareAction({ metadata, progression, state: createCreatureCareState(), action: "train", worldDay: 7 });
  assert.equal(first.accepted, true);
  assert.ok(first.progression.experience > progression.experience);
  const second = applyCreatureCareAction({ metadata, progression: first.progression, state: first.state, action: "train", worldDay: 7 });
  const third = applyCreatureCareAction({ metadata, progression: second.progression, state: second.state, action: "train", worldDay: 7 });
  const blocked = applyCreatureCareAction({ metadata, progression: third.progression, state: third.state, action: "train", worldDay: 7 });
  assert.equal(blocked.accepted, false);
  const fainted = applyCreatureCareAction({ metadata: { ...metadata, health: 0 }, progression, action: "rest", worldDay: 8 });
  assert.equal(fainted.health, 1);
  assert.match(fainted.message, /Healing Station/u);
});

test("habitat review and compact appearance expose visible specimen identity", () => {
  const state = { ...createCreatureCareState(), habitatSatisfaction: { shelter: true, substrate: true } };
  const review = reviewCreatureHabitat(["shelter", "water", "substrate"], state);
  assert.equal(review.percent, 67);
  assert.deepEqual(review.missing, ["water"]);
  const appearance = creatureAppearance("petalfox", progression);
  assert.equal(appearance.kind, "petalfox");
  assert.equal(appearance.aptitudeIds.length, 2);
  assert.ok(appearance.sizeScale >= 0.88 && appearance.sizeScale <= 1.12);
});
