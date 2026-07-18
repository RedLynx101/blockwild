import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  PRIME_FORM_PROFILES,
  advancePrimeEncounterClue,
  createPrimeEncounterState,
  normalizePrimeEncounterStates,
  planPrimeEncounter,
  primeEncounterRouteComplete,
  transferPrimeEncounterCustody,
  transitionPrimeEncounter,
  type PrimeEncounterContext,
  type PrimeEncounterPlan,
  type PrimeEncounterState,
} from "../app/game/creature-rarity";
import { applyCreatureRarityVisual, updateCreatureRarityVisual } from "../app/game/creature-rarity-visuals";
import { creatureAppearance } from "../app/game/creature-appearance";
import { migrateCreatureProgression } from "../app/game/creature-progression";
import type { MobKind } from "../app/game/mobs";

const PRIME_KINDS = [
  "petalfox",
  "mossling",
  "puddlehopper",
  "pebbletortoise",
  "thornhide-trufflehog",
  "petalmask-tanuki",
  "hearthback-badger",
  "glassstep-jerboa",
  "stormcrest-ibex",
  "cloudkite-pika",
  "briarclaw-lynx",
  "cragglass-basilisk",
  "mirecrown-crane",
  "inkveil-cuttle",
  "fossilback-trilobite",
] as const satisfies readonly MobKind[];

const baseContext = (overrides: Partial<PrimeEncounterContext> = {}): PrimeEncounterContext => ({
  worldSeed: "prime-test-world",
  x: 24,
  y: 48,
  z: 24,
  surfaceY: 56,
  biomeName: "Meadow",
  weather: "clear",
  daylight: .75,
  ...overrides,
});

const requirePlan = (kind: MobKind, context: PrimeEncounterContext): PrimeEncounterPlan => {
  const plan = planPrimeEncounter(kind, context);
  assert.ok(plan, `${kind} should have an authored Prime encounter plan`);
  return plan;
};

test("Prime profiles form one complete, distinct authored roster", () => {
  assert.equal(Object.isFrozen(PRIME_FORM_PROFILES), true);
  assert.deepEqual(Object.keys(PRIME_FORM_PROFILES).sort(), [...PRIME_KINDS].sort());

  const profiles = PRIME_KINDS.map((kind) => {
    const profile = PRIME_FORM_PROFILES[kind];
    assert.ok(profile, `${kind} must have a Prime form profile`);
    assert.match(profile.name, /\S/u, `${kind} must have a display name`);
    assert.match(profile.clue, /\S.*\S/u, `${kind} must have a readable ecological clue`);
    assert.ok(Number.isInteger(profile.accent) && profile.accent >= 0 && profile.accent <= 0xffffff, `${kind} must have a valid RGB accent`);
    assert.ok(profile.sizeScale > 1 && profile.sizeScale <= 1.25, `${kind} should read as special without becoming oversized`);
    return profile;
  });

  const unique = <T>(values: readonly T[]) => new Set(values).size;
  assert.equal(unique(profiles.map((profile) => profile.name)), profiles.length, "Prime names must be unique");
  assert.equal(unique(profiles.map((profile) => profile.motif)), profiles.length, "every Prime needs its own visual motif");
  assert.equal(unique(profiles.map((profile) => profile.condition)), profiles.length, "every Prime needs its own ecological condition");
  assert.equal(unique(profiles.map((profile) => profile.clue)), profiles.length, "Prime clues must not be duplicated");
});

test("each Prime ecological condition accepts its intended habitat and rejects a near miss", () => {
  const scenarios: ReadonlyArray<Readonly<{
    kind: (typeof PRIME_KINDS)[number];
    eligible: Partial<PrimeEncounterContext>;
    ineligible: Partial<PrimeEncounterContext>;
  }>> = [
    { kind: "petalfox", eligible: { biomeName: "Glimmerwood Grove", daylight: .8 }, ineligible: { biomeName: "Glimmerwood Grove", daylight: .2 } },
    { kind: "mossling", eligible: { biomeName: "Bog Forest" }, ineligible: { biomeName: "Open Plains" } },
    { kind: "puddlehopper", eligible: { biomeName: "Reed Marsh", weather: "rain" }, ineligible: { biomeName: "Reed Marsh", weather: "clear" } },
    { kind: "pebbletortoise", eligible: { biomeName: "Coral Reef Shore" }, ineligible: { biomeName: "Meadow" } },
    { kind: "thornhide-trufflehog", eligible: { biomeName: "Mushroom Cave", daylight: .1 }, ineligible: { biomeName: "Mushroom Cave", daylight: .6 } },
    { kind: "petalmask-tanuki", eligible: { biomeName: "Moonwood Forest", daylight: .1 }, ineligible: { biomeName: "Moonwood Forest", daylight: .6 } },
    { kind: "hearthback-badger", eligible: { biomeName: "Highland Meadow" }, ineligible: { biomeName: "Desert Dunes" } },
    { kind: "glassstep-jerboa", eligible: { biomeName: "Desert Dunes", daylight: .1 }, ineligible: { biomeName: "Desert Dunes", daylight: .6 } },
    { kind: "stormcrest-ibex", eligible: { biomeName: "Highland Mountain", weather: "thunder" }, ineligible: { biomeName: "Highland Mountain", weather: "rain" } },
    { kind: "cloudkite-pika", eligible: { biomeName: "Cloud Mountain Range" }, ineligible: { biomeName: "Forest Grove" } },
    { kind: "briarclaw-lynx", eligible: { biomeName: "Frost Snowfield" }, ineligible: { biomeName: "Meadow" } },
    { kind: "cragglass-basilisk", eligible: { biomeName: "Glass Desert", daylight: .8 }, ineligible: { biomeName: "Glass Desert", daylight: .6 } },
    { kind: "mirecrown-crane", eligible: { biomeName: "Reed Marsh", daylight: .24 }, ineligible: { biomeName: "Reed Marsh", daylight: .8 } },
    { kind: "inkveil-cuttle", eligible: { biomeName: "Abyssal Trench", y: 30, surfaceY: 56, daylight: .1 }, ineligible: { biomeName: "Abyssal Trench", y: 30, surfaceY: 56, daylight: .6 } },
    { kind: "fossilback-trilobite", eligible: { biomeName: "Ancient River Shore", y: 30, surfaceY: 56 }, ineligible: { biomeName: "Ancient River Shore", y: 52, surfaceY: 56 } },
  ];

  assert.equal(scenarios.length, PRIME_KINDS.length);
  for (const scenario of scenarios) {
    const eligible = requirePlan(scenario.kind, baseContext(scenario.eligible));
    const ineligible = requirePlan(scenario.kind, baseContext(scenario.ineligible));
    assert.equal(eligible.environmentEligible, true, `${scenario.kind} should accept its authored ecology`);
    assert.equal(ineligible.environmentEligible, false, `${scenario.kind} should reject the near-miss ecology`);
    assert.equal(eligible.eligible, eligible.anchorEligible, "overall eligibility should still respect the rare regional roll");
    assert.equal(ineligible.eligible, false);
  }
});

test("Prime regional anchors are stable, seed-aware, and correct across negative coordinates", () => {
  const first = requirePlan("petalfox", baseContext({ x: 1, z: -1, biomeName: "Glimmerwood", daylight: .8 }));
  const sameRegion = requirePlan("petalfox", baseContext({ x: 95.999, z: -95.999, biomeName: "Glimmerwood", daylight: .8 }));
  const nextRegion = requirePlan("petalfox", baseContext({ x: 96, z: -96, biomeName: "Glimmerwood", daylight: .8 }));

  assert.deepEqual({ x: first.regionX, z: first.regionZ }, { x: 0, z: -1 });
  assert.equal(first.anchorId, "prime:petalfox:0:-1");
  assert.equal(sameRegion.anchorId, first.anchorId);
  assert.equal(sameRegion.anchorEligible, first.anchorEligible);
  assert.equal(nextRegion.anchorId, "prime:petalfox:1:-1");
  assert.notEqual(nextRegion.anchorId, first.anchorId);
  assert.deepEqual(requirePlan("petalfox", baseContext({ x: 1, z: -1, biomeName: "Glimmerwood", daylight: .8 })), first, "replanning is deterministic");

  const eligibilityBySeed = new Set<boolean>();
  for (let index = 0; index < 256; index += 1) {
    const seeded = requirePlan("petalfox", baseContext({ worldSeed: `prime-seed-${index}`, x: 1, z: -1, biomeName: "Glimmerwood", daylight: .8 }));
    assert.equal(seeded.anchorId, first.anchorId, "the regional identity is independent from the world seed");
    eligibilityBySeed.add(seeded.anchorEligible);
  }
  assert.deepEqual(eligibilityBySeed, new Set([false, true]), "world seed should affect the rare anchor roll");
  assert.equal(planPrimeEncounter("cow" as MobKind, baseContext()), null, "ordinary creatures must not accidentally receive Prime plans");
});

test("Prime encounter saves normalize defensively and preserve only bounded authored state", () => {
  const raw = {
    "prime:petalfox:0:0": {
      schema: 1,
      anchorId: "untrusted-inner-id",
      kind: "petalfox",
      status: "observed",
      entityId: 42.9,
      firstActivatedAt: -30,
      lastUpdatedAt: 80,
    },
    "prime:mossling:1:1": {
      schema: 1,
      kind: "mossling",
      status: "captured",
      entityId: -4,
      firstActivatedAt: 20,
      lastUpdatedAt: Number.NaN,
    },
    "prime:petalfox:bad-schema": { schema: 2, kind: "petalfox", status: "active" },
    "prime:petalfox:bad-status": { schema: 1, kind: "petalfox", status: "respawning" },
    "prime:ordinary:0:0": { schema: 1, kind: "cow", status: "active" },
    "not-prime": { schema: 1, kind: "petalfox", status: "active" },
  };
  const states = normalizePrimeEncounterStates(raw);

  assert.equal(states.size, 2);
  assert.deepEqual(states.get("prime:petalfox:0:0"), {
    schema: 1,
    anchorId: "prime:petalfox:0:0",
    kind: "petalfox",
    status: "observed",
    entityId: 42,
    firstActivatedAt: 0,
    lastUpdatedAt: 80,
  });
  assert.deepEqual(states.get("prime:mossling:1:1"), {
    schema: 1,
    anchorId: "prime:mossling:1:1",
    kind: "mossling",
    status: "captured",
    entityId: 1,
    firstActivatedAt: 20,
    lastUpdatedAt: 0,
  });
  assert.equal(Object.isFrozen(states.get("prime:petalfox:0:0")), true);
  assert.equal(normalizePrimeEncounterStates(null).size, 0);
  assert.equal(normalizePrimeEncounterStates("corrupt").size, 0);

  const oversized: Record<string, unknown> = {};
  for (let index = 0; index < 600; index += 1) oversized[`prime:petalfox:${index}:0`] = { schema: 1, kind: "petalfox", status: "active" };
  assert.equal(normalizePrimeEncounterStates(oversized).size, 512, "save parsing must remain bounded");
});

test("Prime encounter transitions preserve identity, chronology, and terminal protections", () => {
  const plan = requirePlan("petalfox", baseContext({ biomeName: "Glimmerwood", daylight: .8 }));
  const active = createPrimeEncounterState(plan, "petalfox", 17, 100);
  assert.deepEqual(active, {
    schema: 1,
    anchorId: plan.anchorId,
    kind: "petalfox",
    status: "active",
    entityId: 17,
    firstActivatedAt: 100,
    lastUpdatedAt: 100,
  });
  assert.equal(Object.isFrozen(active), true);

  const observed = transitionPrimeEncounter(active, "observed", 17, 120);
  const captured = transitionPrimeEncounter(observed, "captured", null, 150);
  const released = transitionPrimeEncounter(captured, "released", 91, 180);
  assert.deepEqual([observed.status, captured.status, released.status], ["observed", "captured", "released"]);
  assert.equal(released.firstActivatedAt, active.firstActivatedAt);
  assert.equal(released.anchorId, active.anchorId);
  assert.equal(released.kind, active.kind);
  assert.equal(released.entityId, 91);
  assert.equal(active.status, "active", "transitions must not mutate earlier snapshots");

  const staleClock = transitionPrimeEncounter(observed, "captured", null, 110);
  assert.equal(staleClock.lastUpdatedAt, 120, "out-of-order clocks must not move encounter time backwards");

  const terminalStates: PrimeEncounterState[] = [captured, released, transitionPrimeEncounter(observed, "defeated", null, 160)];
  for (const terminal of terminalStates) {
    assert.equal(transitionPrimeEncounter(terminal, "active", 999, 999), terminal, `${terminal.status} encounters cannot reactivate`);
  }
});

test("Prime field routes require distinct verbs and custody rejects a duplicated orb", () => {
  const plan = requirePlan("petalfox", baseContext({ biomeName: "Glimmerwood", daylight: .8 }));
  const active = createPrimeEncounterState(plan, "petalfox", 17, 100);
  const sighted = advancePrimeEncounterClue(active, "field-sighting", 110);
  assert.equal(advancePrimeEncounterClue(sighted, "field-sighting", 120), sighted, "repeating one verb must not advance the route");
  const heard = advancePrimeEncounterClue(sighted, "distinctive-call", 130);
  const studied = advancePrimeEncounterClue(heard, "kinmark-study", 140);
  assert.equal(primeEncounterRouteComplete(heard), false);
  assert.equal(primeEncounterRouteComplete(studied), true);
  assert.deepEqual(studied.completedClues, ["field-sighting", "distinctive-call", "kinmark-study"]);

  const captured = transferPrimeEncounterCustody(studied, "captured", "specimen:garden-tail", "orb:keeper-a", null, 150);
  assert.equal(captured.status, "captured");
  assert.equal(captured.custodyId, "orb:keeper-a");
  assert.equal(transferPrimeEncounterCustody(captured, "released", "specimen:garden-tail", "orb:copied-payload", 44, 160), captured,
    "a copied orb payload cannot materialize the same Prime");
  const released = transferPrimeEncounterCustody(captured, "released", "specimen:garden-tail", "orb:keeper-a", 44, 160);
  assert.equal(released.status, "released");
  assert.equal(released.entityId, 44);
  assert.equal(released.custodyId, null);
});

test("rare visuals stay local far from origin, preserve authored proportions, and update from a cached part list", () => {
  const progression = migrateCreatureProgression({
    kind: "puddlehopper", entityId: "prime:puddlehopper:test", maximumLevel: 50, defaultMoveIds: [],
    legacy: { rarityForm: "prime", shiny: true, phenotype: { sizeScale: 1, hueShift: .04, markingMask: 7, markingIntensity: .8, accentVariant: 2 } },
  });
  const root = new THREE.Group();
  root.add(new THREE.Mesh(new THREE.SphereGeometry(.4, 10, 8), new THREE.MeshStandardMaterial({ color: 0x5f8168 })));
  const parent = new THREE.Group();
  parent.position.set(12_000, 80, -9_000);
  parent.add(root);
  applyCreatureRarityVisual(root, creatureAppearance("puddlehopper", progression), PRIME_FORM_PROFILES.puddlehopper!);

  const motif = root.getObjectByName("prime-motif:storm-belly");
  assert.ok(motif);
  assert.ok(Math.abs(motif!.position.x) < 4 && Math.abs(motif!.position.z) < 4, "world position must not leak into local motif coordinates");
  assert.ok(root.getObjectByName("shiny-inspection-glints"), "Prime and shiny identities remain independent and can coexist");
  const cloud = root.getObjectByName("prime-storm-cloud")!;
  const initial = cloud.scale.clone();
  const originalTraverse = root.traverse;
  root.traverse = (() => { throw new Error("rare updates must use the cached animated-part list"); }) as typeof root.traverse;
  updateCreatureRarityVisual(root, 2.25);
  root.traverse = originalTraverse;
  assert.ok(Math.abs(cloud.scale.x / cloud.scale.y - initial.x / initial.y) < 1e-6, "pulsing must preserve a nonuniform authored silhouette");
  assert.ok(Math.abs(cloud.scale.z / cloud.scale.y - initial.z / initial.y) < 1e-6);
});
