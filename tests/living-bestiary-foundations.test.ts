import assert from "node:assert/strict";
import test from "node:test";
import {
  CREATURE_TYPE_IDS, resolveCreatureTypes, resolveTypeEffectiveness, resolveTypedPackets, validateCreatureTypeRegistry,
  type CreatureTypeSource,
} from "../app/game/creature-types";
import { CREATURE_MOVES, defaultMoveSetForTypes, learnedMovesAtLevel, validateCreatureMoveRegistry } from "../app/game/creature-moves";
import { creatureProfile, validateCreatureProfiles } from "../app/game/creature-profiles";
import { migrateCreatureProgression, offspringProgressionLegacy, validateProgression } from "../app/game/creature-progression";
import { LEGENDARY_CREATURE_ORDER, LIVING_ROSTER_ORDER, MOB_ORDER, SUMMONED_CREATURE_ORDER } from "../app/game/mobs";
import { effectFromMove, resolveCombatEffect, updateThreatLedger, type CombatActor, type CombatActorKind } from "../app/game/combat-resolver";
import { appendBestiaryRecord, normalizeLivingBestiaryEntry, recordBestiaryAppearanceForms, recordSpeciesCapture } from "../app/game/living-bestiary";
import { explicitPassiveMobSpawnTableForBiome, fishSpawnTableForHabitat, undergroundMobSpawnTableForBiome, type FishHabitat } from "../app/game/fauna";
import { BiomeId } from "../app/game/world";
import { UndergroundBiomeId } from "../app/game/underground";
import { CREATURE_ECOLOGY_CONTRACTS, ecologicalTypeSources, summarizeAquariumEcology, summarizePollination, validateCreatureEcologyContracts } from "../app/game/creature-ecology";

test("universal type registry is complete and valid", () => {
  assert.equal(CREATURE_TYPE_IDS.length, 21);
  assert.deepEqual(validateCreatureTypeRegistry(), []);
});

test("unlimited type lists remain bounded and source removal is deterministic", () => {
  const sources: CreatureTypeSource[] = CREATURE_TYPE_IDS.slice(2).map((type, index) => ({ id: `source-${index}`, kind: "form", types: [type] }));
  sources.push({ id: "remove-flame", kind: "status", removeTypes: ["flame"], types: ["neutral"], label: "Quenched" });
  const resolved = resolveCreatureTypes(["wild", "flame"], sources);
  assert.equal(resolved.types.length, CREATURE_TYPE_IDS.length - 1);
  assert.equal(resolved.types.includes("flame"), false);
  assert.equal(resolved.sources.find((source) => source.type === "neutral")?.label, "Quenched");
  const overwhelming = resolveTypeEffectiveness("radiant", ["umbral", "spirit", "venom", "wild"], 5);
  const resisted = resolveTypeEffectiveness("neutral", ["stone", "metal", "spirit", "wild"], -5);
  assert.deepEqual([overwhelming.steps, overwhelming.multiplier], [3, 1.9]);
  assert.deepEqual([resisted.steps, resisted.multiplier], [-3, 0.4]);
});

test("typed packets resolve shares independently and grant visible affinity", () => {
  const result = resolveTypedPackets(100, [{ type: "tide", share: 0.6 }, { type: "flame", share: 0.4 }], ["tide"], ["stone"]);
  assert.equal(result.packets[0].affinity, 1.1);
  assert.equal(result.packets[1].affinity, 1);
  assert.ok(result.amount > 100);
});

test("move registry, level unlocks, and every current species profile are complete", () => {
  assert.deepEqual(validateCreatureMoveRegistry(), []);
  assert.deepEqual(validateCreatureProfiles(), []);
  assert.ok(Object.keys(CREATURE_MOVES).length >= CREATURE_TYPE_IDS.length * 4);
  for (const kind of MOB_ORDER) {
    const profile = creatureProfile(kind);
    assert.ok(profile.naturalTypes.length >= 1, `${kind} natural types`);
    assert.ok(profile.moves.unlocks.length >= 4, `${kind} move count`);
    assert.ok(CREATURE_MOVES[profile.moves.basicMoveId], `${kind} basic move`);
  }
  const moves = defaultMoveSetForTypes(["draconic", "tide"]);
  assert.equal(learnedMovesAtLevel(moves, 1).length, 1);
  assert.equal(learnedMovesAtLevel(moves, 40).length, 6);
});

test("regular living-roster species have authored ecology while story and summon creatures cannot leak into generic spawning", () => {
  const naturallyAssigned = new Set<string>();
  for (const biome of Object.values(BiomeId) as BiomeId[]) {
    for (const [kind] of explicitPassiveMobSpawnTableForBiome(biome) ?? []) naturallyAssigned.add(kind);
  }
  for (const biome of Object.values(UndergroundBiomeId) as UndergroundBiomeId[]) {
    for (const [kind] of undergroundMobSpawnTableForBiome(biome)) naturallyAssigned.add(kind);
  }
  for (const habitat of ["ocean", "deep-ocean", "lumen-trench", "river", "underground", "syrup-pond", "glimmer-pond"] as const satisfies readonly FishHabitat[]) {
    for (const [kind] of fishSpawnTableForHabitat(habitat)) naturallyAssigned.add(kind);
  }
  for (const kind of LIVING_ROSTER_ORDER) assert.ok(naturallyAssigned.has(kind), `${kind} has no authored natural habitat`);
  for (const kind of [...LEGENDARY_CREATURE_ORDER, ...SUMMONED_CREATURE_ORDER]) {
    assert.equal(naturallyAssigned.has(kind), false, `${kind} must use an authored encounter or summoning contract`);
  }
});

test("existing-roster ecology contracts are exhaustive, aggregated, and dynamically typed", () => {
  assert.deepEqual(validateCreatureEcologyContracts(), []);
  assert.equal(Object.keys(CREATURE_ECOLOGY_CONTRACTS).length, MOB_ORDER.length);
  const tiny = summarizeAquariumEcology(["stonewhisker-loach", "leafsheep-sea-slug", "moonlace-sea-slug"]);
  const crowded = summarizeAquariumEcology(Array.from({ length: 20 }, () => "stonewhisker-loach"));
  assert.ok(tiny.health > 55 && tiny.clarity > 50 && tiny.comfort > 40);
  assert.equal(crowded.activeRoleCounts.cleaner, 2, "aquarium role stacking is capped");
  const pollination = summarizePollination(["meadowwing", "glowmoth", "frostveil", "fen-lantern"]);
  assert.ok(pollination.breadth >= 4);
  assert.deepEqual(new Set(pollination.activeWindows), new Set(["day", "night", "cold", "wetland"]));
  assert.equal(ecologicalTypeSources("petalfox", { daylight: .95, night: false })[0]?.types?.includes("radiant"), true);
  assert.equal(ecologicalTypeSources("kilnscale-salamander", { daylight: 0, night: true, deeplyChilled: true })[0]?.removeTypes?.includes("flame"), true);
});

test("v2 migration is deterministic, bounded, and contains no individual stat rolls", () => {
  const profile = creatureProfile("petalfox");
  const input = { kind: "petalfox" as const, entityId: 42, geneticSeed: 1107, age: 3, maximumLevel: profile.stats.maximumLevel, defaultMoveIds: learnedMovesAtLevel(profile.moves, 8), legacy: { xp: 1400, caught: true } };
  const first = migrateCreatureProgression(input);
  const second = migrateCreatureProgression(input);
  assert.deepEqual(first, second);
  assert.equal(first.schemaVersion, 2);
  assert.equal(first.captureHistory.captureCount, 1);
  assert.ok(first.level >= 1 && first.level <= first.maximumLevel);
  assert.equal("individualStats" in first, false);
  assert.deepEqual(validateProgression(first), []);
});

test("shiny and Prime discoveries remain independent and idempotent before capture", () => {
  const now = 1_726_400_000_000;
  const first = recordBestiaryAppearanceForms(normalizeLivingBestiaryEntry(), {
    shiny: true, markingMask: 7, accentVariant: 4, primeMotif: "living-garden",
  }, now);
  assert.equal(first.added, true);
  assert.deepEqual(Object.keys(first.entry.forms).sort(), ["prime:living-garden", "shiny:7:4"]);
  assert.equal(first.entry.forms["prime:living-garden"].sightings, 1);
  const repeated = recordBestiaryAppearanceForms(first.entry, {
    shiny: true, markingMask: 7, accentVariant: 4, primeMotif: "living-garden",
  }, now + 10_000);
  assert.equal(repeated.added, false);
  assert.deepEqual(repeated.entry, first.entry);
  const captured = recordSpeciesCapture(repeated.entry, now + 20_000, "prime-petalfox-001");
  assert.equal(captured.captures, 1);
  assert.deepEqual(captured.specimenIds, ["prime-petalfox-001"]);
});

test("offspring inherit visible phenotype and rare shiny identity without inheriting Prime status or hidden stats", () => {
  const profile = creatureProfile("petalfox");
  const parent = (id: string, shiny: boolean, hueShift: number) => migrateCreatureProgression({
    kind: "petalfox", entityId: id, maximumLevel: profile.stats.maximumLevel, defaultMoveIds: [],
    legacy: { shiny, rarityForm: "prime", phenotype: { sizeScale: shiny ? 1.08 : .96, hueShift, markingMask: shiny ? 7 : 2, markingIntensity: shiny ? .8 : .42, accentVariant: shiny ? 4 : 1 } },
  });
  const shinyLeft = parent("left-shiny", true, .1);
  const shinyRight = parent("right-shiny", true, -.04);
  const ordinary = parent("right-ordinary", false, -.04);
  const first = offspringProgressionLegacy("petalfox", "child-stable", 771, shinyLeft, ordinary);
  assert.deepEqual(first, offspringProgressionLegacy("petalfox", "child-stable", 771, shinyLeft, ordinary));
  assert.equal(first.rarityForm, "ordinary", "Prime is an authored ecological form, never a breeding inheritance flag");
  assert.equal("individualStats" in first, false);
  assert.ok((first.phenotype?.hueShift ?? 1) > -.04 && (first.phenotype?.hueShift ?? -1) < .1);

  const counts = { two: 0, one: 0, none: 0 };
  for (let index = 0; index < 8_192; index += 1) {
    if (offspringProgressionLegacy("petalfox", `two-${index}`, index, shinyLeft, shinyRight).shiny) counts.two += 1;
    if (offspringProgressionLegacy("petalfox", `one-${index}`, index, shinyLeft, ordinary).shiny) counts.one += 1;
    if (offspringProgressionLegacy("petalfox", `none-${index}`, index, ordinary, ordinary).shiny) counts.none += 1;
  }
  assert.ok(counts.two > counts.one && counts.one > counts.none, `expected bounded parental influence, received ${JSON.stringify(counts)}`);
});

const baseActor = (kind: CombatActorKind, id: string, overrides: Partial<CombatActor["profile"]> = {}): CombatActor => ({
  ref: { kind, id },
  profile: {
    level: 12,
    stats: { vitality: 40, power: 38, focus: 30, guard: 24, ward: 20, agility: 42 },
    currentTypes: ["wild"], factionId: null, ownerId: null, partyId: null, temperament: "Defensive",
    statuses: [], currentHealth: 80, maximumHealth: 80, ...overrides,
  },
});

test("shared resolver accepts every actor class and rejects non-host mutation", () => {
  const kinds: CombatActorKind[] = ["player", "creature", "summon", "sentient", "construct", "boss", "projectile", "spell", "environment"];
  const effect = effectFromMove(CREATURE_MOVES["wild-basic"], 12);
  for (const attackerKind of kinds) for (const defenderKind of kinds) {
    const attacker = baseActor(attackerKind, `a-${attackerKind}`);
    const defender = baseActor(defenderKind, `d-${defenderKind}`);
    const event = resolveCombatEffect(attacker, defender, effect, { isHost: true, nowSeconds: 10, eventToken: `event-${attackerKind}-${defenderKind}`, friendlyFire: "on", pvpEnabled: true });
    assert.equal(event.legal, true, `${attackerKind} -> ${defenderKind}`);
    assert.ok(event.resolvedAmount > 0);
  }
  const denied = resolveCombatEffect(baseActor("player", "p"), baseActor("creature", "c"), effect, { isHost: false, nowSeconds: 10, eventToken: "client", friendlyFire: "off", pvpEnabled: false });
  assert.equal(denied.legal, false);
  assert.match(denied.deniedReason ?? "", /Host authority/);
});

test("Bestiary v2 migration preserves capture counts and appends complex records", () => {
  const migrated = normalizeLivingBestiaryEntry({ seen: true, kills: 3, captures: 7, milestones: { tracked: 2 } });
  assert.equal(migrated.schemaVersion, 2);
  assert.equal(migrated.captures, 7);
  recordSpeciesCapture(migrated, 1200, "specimen-petalfox-7");
  assert.equal(migrated.captures, 8);
  assert.deepEqual(migrated.specimenIds, ["specimen-petalfox-7"]);
  const expanded = appendBestiaryRecord(migrated, "Dragon Rituals", { id: "ritual-one", title: "First Bell", text: "Observed without ending the encounter.", recordedAt: 1300, sourceId: "moonbough" });
  const duplicate = appendBestiaryRecord(expanded, "Dragon Rituals", { id: "ritual-one", title: "First Bell", text: "Duplicate", recordedAt: 1400, sourceId: null });
  assert.equal(expanded.sections["dragon-rituals"].length, 1);
  assert.equal(duplicate, expanded);
});

test("relationships protect allies while hostile reactions and bounded threat work", () => {
  const attacker = baseActor("creature", "left", { ownerId: "noah", currentTypes: ["storm"] });
  const ally = baseActor("creature", "right", { ownerId: "noah", currentTypes: ["tide"] });
  const effect = effectFromMove(CREATURE_MOVES["storm-surge"], 20);
  const protectedEvent = resolveCombatEffect(attacker, ally, effect, { isHost: true, nowSeconds: 12, eventToken: "ally", friendlyFire: "off", pvpEnabled: false });
  assert.equal(protectedEvent.legal, false);
  const soakedTarget = baseActor("creature", "wild", { currentTypes: ["tide"], statuses: [{ id: "soaked", stacks: 2, expiresAtSeconds: 40, source: null }] });
  const reactionEvent = resolveCombatEffect(attacker, soakedTarget, effect, { isHost: true, nowSeconds: 12, eventToken: "conduct", friendlyFire: "off", pvpEnabled: false });
  assert.equal(reactionEvent.reaction, "conductive");
  let threat = [] as ReturnType<typeof updateThreatLedger>;
  for (let index = 0; index < 20; index += 1) threat = updateThreatLedger(threat, { kind: "creature", id: index }, index + 1, index, 8);
  assert.equal(threat.length, 8);
  assert.ok(threat[0].score >= threat[7].score);
});
