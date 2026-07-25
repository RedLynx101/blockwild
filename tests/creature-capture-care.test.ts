import assert from "node:assert/strict";
import test from "node:test";
import { CAPTURE_PROFILES, captureKnowledgeForResearch, evaluateCaptureReadiness } from "../app/game/creature-capture";
import { applyCreatureCareAction, createCreatureCareState, reviewCreatureHabitat } from "../app/game/creature-care";
import { creatureAppearance } from "../app/game/creature-appearance";
import {
  LEGACY_LENS_ORB_ITEMS,
  LEGACY_SPECIES_ORB_ITEMS,
  captureIntoOrb,
  captureOrbFromInventorySlot,
  captureOrbInventorySlot,
  createEmptyCaptureOrb,
  decodeCaptureOrb,
  encodeCaptureOrb,
  fitCaptureOrbLens,
  migrateCaptureOrbInventorySlot,
  releaseCaptureOrb,
} from "../app/game/capture-orbs";
import { migrateCreatureProgression } from "../app/game/creature-progression";
import type { CreatureMetadata } from "../app/game/creature-cage";
import { CREATIVE_BLOCKS, Item } from "../app/game/data";
import { inventorySlotsCanStack } from "../app/game/inventory-convenience";
import {
  advanceCalmingOffering,
  advanceOutmaneuverAttempt,
  beginCalmingOffering,
  createCreaturePacificationState,
  interruptPacificationWithDamage,
  recordCleanCommittedEvade,
} from "../app/game/creature-pacification";
import {
  connectWithCreature,
  canAttuneCreature,
  formCreatureBond,
  nourishCreatureRelationship,
  normalizeCreatureRelationship,
  transferCreatureBond,
  validateCreatureRelationshipPolicies,
} from "../app/game/creature-relationships";

const progression = migrateCreatureProgression({
  kind: "petalfox", entityId: "specimen-fern", geneticSeed: 8192, maximumLevel: 50,
  defaultMoveIds: ["wild-basic", "verdant-basic"],
});

const metadata: CreatureMetadata = {
  schema: 1, entityId: "specimen-fern", kind: "petalfox", health: 6, maxHealth: 8, ageTicks: 2000,
  baby: false, temperament: "Skittish", hostile: false, tamed: false, ownerId: null, name: "Fern",
  geneticSeed: 8192, command: null, custom: { progression: progression as never },
};

test("all profiles converge on one deterministic visible readiness contract", () => {
  assert.deepEqual(Object.keys(CAPTURE_PROFILES), ["open", "gentle", "pursuit", "armored", "territorial", "aquatic", "resonant", "rescue", "legendary"]);
  assert.ok(Object.values(CAPTURE_PROFILES).every((profile) => profile.suggestedLens === null));
  const subdued = evaluateCaptureReadiness({ profileId: "territorial", hostile: true, health: 4, maxHealth: 10, states: {} });
  assert.equal(subdued.ready, true);
  assert.equal(subdued.route, "health");
  const strong = evaluateCaptureReadiness({ profileId: "territorial", hostile: true, health: 4.1, maxHealth: 10, states: {} });
  assert.equal(strong.ready, false);
  assert.equal(strong.conditions[0]?.label, "Health 4.1 / 10.0 · ready at 4.0");
  assert.equal(strong.conditions.some((condition) => condition.label === "Unknown condition"), false);
  const oneHeart = evaluateCaptureReadiness({ profileId: "territorial", hostile: true, health: 1, maxHealth: 100, states: {} });
  assert.equal(oneHeart.ready, true);
});

test("aquatic capture uses the same orb and only requires the shared medium", () => {
  const dry = evaluateCaptureReadiness({ profileId: "aquatic", aquatic: true, states: { calm: true, submerged: false } });
  assert.equal(dry.ready, false);
  const ready = evaluateCaptureReadiness({ profileId: "aquatic", aquatic: true, states: { calm: true, submerged: true } });
  assert.equal(ready.ready, true);
  assert.equal(ready.conditions.some((condition) => condition.id === "tide-lens"), false);
});

test("capture rules are public while research reveals care and mastery depth", () => {
  assert.deepEqual(captureKnowledgeForResearch("petalfox", "gentle", 0).learnedConditions, ["health-threshold", "outmaneuver", "calming-offering"]);
  assert.equal(captureKnowledgeForResearch("petalfox", "gentle", 0).microHook !== null, true);
  assert.equal(captureKnowledgeForResearch("petalfox", "gentle", 1).careClues.length, 0);
  assert.equal(captureKnowledgeForResearch("petalfox", "gentle", 2).careClues.length, 2);
  assert.equal(captureKnowledgeForResearch("petalfox", "gentle", 3).mastered, true);
});

test("legacy lens state decodes into the one normal orb while exact specimen data survives", () => {
  assert.equal(fitCaptureOrbLens(createEmptyCaptureOrb("orb-fern"), "gentle"), null);
  const legacy = decodeCaptureOrb(JSON.stringify({ ...createEmptyCaptureOrb("orb-legacy"), lens: "gentle" }))!;
  assert.equal(legacy.lens, null);
  const occupied = captureIntoOrb(legacy, metadata, 42, "keeper-a")!;
  assert.equal(occupied.lens, null);
  assert.equal(fitCaptureOrbLens(occupied, "tide"), null);
  const released = releaseCaptureOrb(decodeCaptureOrb(encodeCaptureOrb(occupied))!)!;
  assert.deepEqual(released.creature.custom.progression, progression);
  assert.equal(released.orb.lens, null);
  assert.equal(normalizeCreatureRelationship(released.creature).status, "acclimating");
});

test("retired lens and species item ids migrate once into canonical Capture Orbs", () => {
  const compensated = migrateCaptureOrbInventorySlot({ item: Item.GentleLensOrb, count: 2 });
  assert.deepEqual(compensated, { item: Item.CaptureOrb, count: 4 });
  assert.deepEqual(migrateCaptureOrbInventorySlot(compensated), compensated, "migration compensation is idempotent");

  const natural = migrateCaptureOrbInventorySlot({ item: Item.GlimmerhartOrb, count: 1 });
  const naturalOrb = captureOrbFromInventorySlot(natural)!;
  assert.equal(natural.item, Item.CaptureOrb);
  assert.equal(naturalOrb.creature?.kind, "glimmerhart");
  assert.equal(canAttuneCreature(naturalOrb.creature!), false, "a care transfer still requires an explicit bond");

  const construct = migrateCaptureOrbInventorySlot({ item: Item.ClockworkHoundOrb, count: 1 });
  const constructOrb = captureOrbFromInventorySlot(construct)!;
  assert.equal(constructOrb.creature?.kind, "clockwork-hound-golem");
  assert.equal(canAttuneCreature(constructOrb.creature!), true, "a legacy commissioned construct remains usable");

  for (const retired of [...LEGACY_LENS_ORB_ITEMS, ...LEGACY_SPECIES_ORB_ITEMS]) {
    assert.equal(CREATIVE_BLOCKS.includes(retired), false, `retired item ${retired} is not player-facing`);
  }
});

test("Break Its Tempo is distinct, anti-spam safe, and opens one ten-second window", () => {
  const first = recordCleanCommittedEvade(createCreaturePacificationState(), "keeper-a", "attack-1", 10);
  assert.equal(first.accepted, true);
  const duplicate = recordCleanCommittedEvade(first.state, "keeper-a", "attack-1", 10.2);
  assert.equal(duplicate.accepted, false);
  const second = recordCleanCommittedEvade(duplicate.state, "keeper-a", "attack-2", 11);
  assert.equal(second.state.cleanEvades, 2);
  const holding = advanceOutmaneuverAttempt(second.state, { participantId: "keeper-a", now: 11, outsideAttackEnvelope: true });
  const settled = advanceOutmaneuverAttempt(holding, { participantId: "keeper-a", now: 14, outsideAttackEnvelope: true });
  assert.equal(settled.settledRoute, "outmaneuver");
  assert.equal(settled.settledUntil, 24);
  assert.equal(interruptPacificationWithDamage(settled, 15).settledUntil, 0);
});

test("a calming offering pauses inside the ring, consumes once on acceptance, and shares readiness", () => {
  const begun = beginCalmingOffering(createCreaturePacificationState(), { participantId: "keeper-a", item: Item.Apple, now: 20 });
  assert.equal(begun.accepted, true);
  const paused = advanceCalmingOffering(begun.state, {
    participantId: "keeper-a", now: 22, deltaSeconds: 2, safeAnchor: true,
    outsideWarningRing: false, creatureInterrupted: false, offeringAvailable: true,
  });
  assert.equal(paused.state.offeringProgressSeconds, 0);
  const completed = advanceCalmingOffering(paused.state, {
    participantId: "keeper-a", now: 26, deltaSeconds: 4, safeAnchor: true,
    outsideWarningRing: true, creatureInterrupted: false, offeringAvailable: true,
  });
  assert.equal(completed.completed, true);
  assert.equal(completed.consumeItem, Item.Apple);
  const ready = evaluateCaptureReadiness({
    profileId: "territorial", hostile: true, health: 9, maxHealth: 10, states: {},
    now: 26, calmUntil: completed.state.settledUntil, calmRoute: completed.state.settledRoute,
  });
  assert.equal(ready.route, "offering");
});

test("captured ordinary creatures require Stabilize, Nourish, Connect, then explicit Form Bond", () => {
  const captured = captureIntoOrb(createEmptyCaptureOrb("orb-bond"), metadata, 42, "keeper-a")!;
  const relationship = normalizeCreatureRelationship(captured.creature!);
  assert.equal(relationship.status, "acclimating");
  assert.equal(relationship.stabilized, true);
  const nourished = nourishCreatureRelationship(captured.creature!);
  const firstConnection = connectWithCreature(nourished, 7);
  assert.equal(firstConnection.accepted, true);
  const connected = connectWithCreature(firstConnection.metadata, 8);
  assert.equal(connected.accepted, true);
  assert.equal(normalizeCreatureRelationship(connected.metadata).status, "bond-ready");
  const bonded = formCreatureBond(connected.metadata, "keeper-a", 99);
  assert.equal(bonded.accepted, true);
  assert.equal(bonded.metadata.tamed, true);
  assert.equal(bonded.metadata.hostile, false);
  assert.equal(bonded.metadata.ownerId, "keeper-a");
  assert.deepEqual(validateCreatureRelationshipPolicies(), []);
});

test("keeper transfer requires a completed bond and rewrites every ownership adapter", () => {
  const captured = captureIntoOrb(createEmptyCaptureOrb("orb-transfer"), metadata, 42, "keeper-a")!;
  const nourished = nourishCreatureRelationship(captured.creature!);
  const first = connectWithCreature(nourished, 7);
  const second = connectWithCreature(first.metadata, 8);
  const bonded = formCreatureBond({
    ...second.metadata,
    custom: {
      ...second.metadata.custom,
      petState: { tamed: true, ownerId: "keeper-a", command: "stay" },
      courserBond: { tamed: true, ownerId: "keeper-a" },
    },
  }, "keeper-a", 99);
  const unauthorized = transferCreatureBond(bonded.metadata, "stranger", "keeper-b");
  assert.equal(unauthorized.accepted, false);
  const transferred = transferCreatureBond(bonded.metadata, "keeper-a", "keeper-b");
  assert.equal(transferred.accepted, true);
  assert.equal(transferred.metadata.ownerId, "keeper-b");
  assert.equal(normalizeCreatureRelationship(transferred.metadata).keeperId, "keeper-b");
  assert.equal((transferred.metadata.custom.petState as { ownerId: string }).ownerId, "keeper-b");
  assert.equal((transferred.metadata.custom.courserBond as { ownerId: string }).ownerId, "keeper-b");
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
