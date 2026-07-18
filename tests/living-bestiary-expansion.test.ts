import assert from "node:assert/strict";
import test from "node:test";
import { Item, ITEMS, WILD_BONDS_TOMES, type InventorySlot } from "../app/game/data";
import {
  combatLegality, resolveCombatEffect, type CombatActor, type CombatActorKind, type CombatEffect,
} from "../app/game/combat-resolver";
import { createCreatureHusbandryState, breedCreatureStates, recordCreatureProduction } from "../app/game/creature-care";
import { aggregateCreatureWorkers, assignCreatureWork, createCreatureWorkState, fitCreatureShellModule, resolveCreatureWorkCycle } from "../app/game/creature-ecology";
import { migrateCreatureProgression, recordCreatureCaptureHistory, recordCreatureReleaseHistory } from "../app/game/creature-progression";
import { createFieldPerchState, placeBirdOnFieldPerch, recordFieldPerchSignal, setFieldPerchAssignment, takeBirdFromFieldPerch } from "../app/game/field-perch";
import {
  GUILDS, GUILD_NPCS, GUILD_QUESTS, GUILD_QUEST_REWARD_ITEMS, applyGuildSemanticEvent, compatibleGuildIdsForSettlement, createGuildBook,
  discoverGuildHall, guildNpcScheduleAt, guildQuestRewardItems, joinGuild, planGuildHalls, questProgress, startGuildQuest,
} from "../app/game/guilds";
import { SPELLS, WILD_BONDS_SPELL_IDS, consumeIronwakeFragment, deepLanternGuideSignal, normalizeSpellWorldState, tidemendSiteKeyAt } from "../app/game/magic";
import { validatePayload, type PlayerPose } from "../app/game/multiplayer";
import {
  LEGENDARY_ENCOUNTER_ORDER, LEGENDARY_ENCOUNTERS, applyLegendaryEvent, auditLegendaryEncounterDefinitions,
  createLegendaryEncounterState, legendaryCanManifest, legendaryStageProgress, planLegendaryEncounterSite,
  resolveLegendaryEncounter, transferLegendaryCustody,
} from "../app/game/legendary-encounters";
import { auditLootFamilies, LOOT_FAMILIES, resolveContextualLoot } from "../app/game/contextual-loot";
import { auditRoadPlan, planRegionalRoadGraph, planTerrainFollowingRoad } from "../app/game/surface-roads";
import { createSummonContractState, groundSummon, manifestSummon, observeSummonRole, SUMMON_CONTRACTS } from "../app/game/summon-contracts";
import type { CreatureMetadata } from "../app/game/creature-cage";
import { BiomeId, guildLodgeGuildsForBiome, planGuildLodgeForRegion, selectDeepgearLiftSite } from "../app/game/world";

const bird: CreatureMetadata = {
  schema: 1, entityId: "bird-ember", kind: "emberjay", health: 7, maxHealth: 7, ageTicks: 4_000,
  baby: false, temperament: "Defensive", hostile: false, tamed: true, ownerId: "keeper", name: "Coalbutton",
  geneticSeed: 710, command: null, custom: {},
};

test("husbandry lineage and production records are explicit, immutable, and bounded", () => {
  const left = { ...createCreatureHusbandryState(11), loveTicks: 200 };
  const right = { ...createCreatureHusbandryState(29), loveTicks: 200 };
  const family = breedCreatureStates("woolhorn", left, "woolhorn", right, { leftId: 4, rightId: 9, bornDay: 22, temperament: "Gentle" });
  assert.ok(family);
  assert.deepEqual(family.child.lineage.parentIds, ["4", "9"]);
  assert.equal(family.child.lineage.bornDay, 22);
  assert.equal(family.child.lineage.aptitudes.length, 2);
  const produced = recordCreatureProduction(family.left, "fleece", 3, 23);
  assert.deepEqual(produced.productionHistory.fleece, { count: 3, lastDay: 23 });
  assert.equal(family.left.productionHistory.fleece, undefined);
});

test("Field Perches sleep birds as exact records and accept bounded scout signals", () => {
  const occupied = placeBirdOnFieldPerch(createFieldPerchState(), bird);
  assert.ok(occupied);
  assert.notEqual(occupied.resident, bird);
  const scouting = setFieldPerchAssignment(occupied, "scout");
  const reported = recordFieldPerchSignal(scouting, { kind: "hostile", label: "Rattlekin beyond the alder ridge", distance: 43, observedDay: 8 });
  assert.equal(reported.lastSignal?.kind, "hostile");
  const taken = takeBirdFromFieldPerch(reported);
  assert.equal(taken?.metadata.name, "Coalbutton");
  assert.equal(taken?.state.resident, null);
});

test("habitat work is persistent, bounded, authored per creature, and adapts Mosslings slowly", () => {
  const anchored = assignCreatureWork("burrowbell", createCreatureWorkState("burrowbell"), "sentinel", { x: 32, y: 51, z: -4 });
  assert.ok(anchored);
  const warning = resolveCreatureWorkCycle("burrowbell", anchored, { worldSeconds: 12, hostileCount: 1, unknownActorCount: 2, allyCount: 1, habitatTag: "meadow" });
  assert.equal(warning.signalId, "hostile");
  assert.equal(warning.mapSignal, "hostile");
  assert.equal(warning.state.completedCycles, 1);
  assert.equal(assignCreatureWork("burrowbell", warning.state, "mineral-sense", null), null, "unsupported work cannot be injected");

  let moss = assignCreatureWork("mossling", createCreatureWorkState("mossling"), "garden", { x: 32, y: 51, z: -4 });
  assert.ok(moss);
  for (let cycle = 1; cycle <= 120; cycle += 1) moss = resolveCreatureWorkCycle("mossling", moss, { worldSeconds: cycle * 10, habitatTag: "bog", maturePlantCount: 6 }).state;
  assert.equal(moss.adaptation, "bog-lantern");
  assert.ok(resolveCreatureWorkCycle("mossling", moss, { worldSeconds: 1300, habitatTag: "bog", maturePlantCount: 6 }).gardenPower > 0);

  const shell = fitCreatureShellModule("pebbletortoise", createCreatureWorkState("pebbletortoise"), "flower");
  assert.equal(shell?.shellModule, "flower");
  assert.equal(fitCreatureShellModule("mossling", moss, "flower"), null);
  const workers = Array.from({ length: 7 }, (_, index) => ({ entityId: String(index), kind: "mossling" as const, state: moss! }));
  const group = aggregateCreatureWorkers(workers)[0];
  assert.equal(group.workers.length, 4, "only four workers in a compatible group may run active scans");
  assert.equal(group.effectivePower, 2.4);
});

test("individual capture history survives repeated custody and release without mutating earlier records", () => {
  const initial = migrateCreatureProgression({ kind: "petalfox", entityId: "lineage-petal", geneticSeed: 71, age: 9_000, maximumLevel: 50, defaultMoveIds: ["petal-dart"] });
  const first = recordCreatureCaptureHistory(initial, { capturedAt: 100, captorId: "keeper-a", methodId: "capture-orb" });
  const released = recordCreatureReleaseHistory(first);
  const second = recordCreatureCaptureHistory(released, { capturedAt: 240, captorId: "keeper-b", methodId: "guild-lens" });
  assert.deepEqual(first.captureHistory, { captureCount: 1, firstCapturedAt: 100, lastCapturedAt: 100, firstCaptorId: "keeper-a", lastMethodId: "capture-orb", wasReleased: false });
  assert.equal(released.captureHistory.wasReleased, true);
  assert.deepEqual(second.captureHistory, { captureCount: 2, firstCapturedAt: 100, lastCapturedAt: 240, firstCaptorId: "keeper-a", lastMethodId: "guild-lens", wasReleased: false });
  assert.equal(initial.captureHistory.captureCount, 0);
});

const actorKinds: readonly CombatActorKind[] = ["player", "creature", "summon", "sentient", "construct", "boss", "projectile", "spell", "environment"];
const actor = (kind: CombatActorKind, id: string): CombatActor => ({
  ref: { kind, id }, profile: {
    level: 12, stats: { vitality: 35, power: 30, focus: 28, guard: 20, ward: 18, agility: 24 },
    currentTypes: ["wild"], factionId: null, ownerId: null, partyId: null, temperament: "Defensive",
    statuses: [], currentHealth: 40, maximumHealth: 40,
  },
});
const hit: CombatEffect = { id: "matrix-hit", name: "Matrix Hit", intent: "damage", baseAmount: 8, channel: "physical", packets: [{ type: "wild", share: 1 }] };

test("the unified combat resolver covers every actor pairing under host authority", () => {
  let legalPairs = 0;
  for (const leftKind of actorKinds) for (const rightKind of actorKinds) {
    const left = actor(leftKind, `left-${leftKind}`);
    const right = actor(rightKind, `right-${rightKind}`);
    const context = { isHost: true, nowSeconds: 5, eventToken: `${leftKind}->${rightKind}`, friendlyFire: "on" as const, pvpEnabled: true };
    assert.equal(combatLegality(left, right, hit, context).legal, true);
    const event = resolveCombatEffect(left, right, hit, context);
    assert.equal(event.legal, true);
    assert.ok(event.resolvedAmount > 0);
    legalPairs += 1;
  }
  assert.equal(legalPairs, 81);
  assert.equal(combatLegality(actor("player", "same"), actor("player", "same"), hit, { isHost: true, nowSeconds: 0, eventToken: "self", friendlyFire: "on", pvpEnabled: true }).legal, false);
  assert.equal(combatLegality(actor("player", "a"), actor("creature", "b"), hit, { isHost: false, nowSeconds: 0, eventToken: "guest", friendlyFire: "on", pvpEnabled: true }).legal, false);
});

test("guild framework ships seven complete campaigns, cast schedules, semantic progress, and deterministic hall quotas", () => {
  assert.equal(Object.keys(GUILDS).length, 7);
  assert.ok(Object.values(GUILDS).every((guild) => guild.ranks.length === 6 && guild.questIds.length === 8 && guild.principalNpcIds.length === 3));
  assert.equal(GUILD_QUESTS.length, 56);
  assert.equal(GUILD_NPCS.length, 21);
  assert.equal(GUILD_NPCS.filter((npc) => npc.recruitable).length, 7);
  assert.match(guildNpcScheduleAt(GUILD_NPCS[0], 7), /^dawn:/u);
  assert.match(guildNpcScheduleAt(GUILD_NPCS[0], 14), /^day:/u);

  let book = joinGuild(discoverGuildHall(createGuildBook(), "waykeeper", "guild-hall:test:waykeeper"), "waykeeper");
  const questId = GUILDS.waykeeper.questIds[0];
  book = startGuildQuest(book, questId);
  const tideglassBefore = book.guilds.tideglass;
  const quest = GUILD_QUESTS.find((entry) => entry.id === questId)!;
  const observation = quest.objectives.find((entry) => entry.kind === "observeCreature")!;
  book = applyGuildSemanticEvent(book, {
    kind: "observeCreature", guildId: "waykeeper", questId, objectiveId: observation.id,
    targetId: observation.predicate.targetIds[0], demonstrationId: "gentle-observation", amount: observation.target,
    context: { creatureKind: observation.predicate.creatureKinds[0], locationId: observation.predicate.locationIds[0] },
  });
  assert.equal(questProgress(book, questId)?.objectives[0].current, observation.target);
  assert.equal(book.guilds.tideglass, tideglassBefore, "unrelated guild state should retain identity");

  const candidates = [
    { settlementId: "green-village", factionId: "wood-elves" as const, size: "village" as const, regionId: "r0", civicParcelId: "p0", compatibleGuildIds: compatibleGuildIdsForSettlement("wood-elves", "surface") },
    { settlementId: "hearth-town", factionId: "hobbits" as const, size: "town" as const, regionId: "r0", civicParcelId: "p1", compatibleGuildIds: compatibleGuildIdsForSettlement("hobbits", "surface") },
    { settlementId: "reef-town", factionId: "atlantians" as const, size: "town" as const, regionId: "r0", civicParcelId: "p2", compatibleGuildIds: compatibleGuildIdsForSettlement("atlantians", "underwater") },
    { settlementId: "gear-town", factionId: "dwarves" as const, size: "town" as const, regionId: "r0", civicParcelId: "p3", compatibleGuildIds: compatibleGuildIdsForSettlement("dwarves", "underground") },
    { settlementId: "brass-town", factionId: "goblins" as const, size: "town" as const, regionId: "r0", civicParcelId: "p4", compatibleGuildIds: compatibleGuildIdsForSettlement("goblins", "surface") },
    { settlementId: "sugar-town", factionId: "sugarcourt" as const, size: "town" as const, regionId: "r0", civicParcelId: "p5", compatibleGuildIds: compatibleGuildIdsForSettlement("sugarcourt", "surface") },
  ];
  const first = planGuildHalls("hall-seed", candidates);
  const second = planGuildHalls("hall-seed", [...candidates].reverse());
  assert.deepEqual(first, second);
  assert.equal(new Set(first.map((hall) => hall.settlementId)).size, first.length);
  assert.ok(first.some((hall) => hall.guildId === "deepgear"));
});

test("all twelve Wild Bonds spells have physical reusable tomes and reachable authored acquisition", () => {
  assert.equal(WILD_BONDS_SPELL_IDS.length, 12);
  assert.equal(new Set(WILD_BONDS_SPELL_IDS).size, 12);
  const physical = new Map(WILD_BONDS_TOMES.map((item) => [ITEMS[item].spellId, item]));
  const guildQuestIds = new Set(GUILD_QUESTS.map((quest) => quest.id));
  const rewarded = new Set(Object.values(GUILD_QUEST_REWARD_ITEMS).flat());
  for (const spellId of WILD_BONDS_SPELL_IDS) {
    const spell = SPELLS.find((candidate) => candidate.id === spellId);
    assert.ok(spell, `${spellId} must exist`);
    const tome = physical.get(spellId);
    assert.ok(tome, `${spellId} must have a physical tome item`);
    assert.equal(ITEMS[tome].useKind, "spell-tome");
    assert.ok(rewarded.has(tome) || spell.sources.some((source) => source.kind === "loot" || source.kind === "faction"), `${spellId} must have a reachable source`);
    for (const source of spell.sources) if (source.kind === "quest" && source.questId.includes("guild-")) assert.ok(guildQuestIds.has(source.questId), `${spellId} refers to a missing guild quest`);
  }
  assert.deepEqual(guildQuestRewardItems(GUILDS.waykeeper.questIds[0]), [Item.TomeKinmark]);
});

test("spell world mechanics are bounded, save-normalized, captioned, and site-stable", () => {
  const state = normalizeSpellWorldState({ schema: 1, ironwakeWard: { fragments: 99, expiresAt: 50 }, tidemendSites: { "1,-2": 90, nope: 12 } });
  assert.deepEqual(state.ironwakeWard, { fragments: 6, expiresAt: 50 });
  assert.deepEqual(state.tidemendSites, { "1,-2": 90 });
  const intercepted = consumeIronwakeFragment(state.ironwakeWard, 20);
  assert.equal(intercepted.intercepted, true);
  assert.equal(intercepted.ward?.fragments, 5);
  assert.equal(consumeIronwakeFragment(intercepted.ward, 80).intercepted, false);
  assert.equal(tidemendSiteKeyAt(31.9, -0.1), "1,-1");
  assert.match(deepLanternGuideSignal({ resonant: false, openCells: 80, safeFloorDepth: 2 }).caption, /larger cavern/iu);
  assert.match(deepLanternGuideSignal({ resonant: true, openCells: 0, safeFloorDepth: 9 }).caption, /magical resonance/iu);
});

test("multiplayer protocol bounds host-assigned creature passenger seats", () => {
  const pose: PlayerPose = { playerId: "rider-001", tick: 1, x: 0, y: 50, z: 0, yaw: 0, pitch: 0, vx: 0, vy: 0, vz: 0, grounded: true, mountedCreatureId: 7, mountedCreatureSeat: 1 };
  assert.equal(validatePayload("player-pose", pose), true);
  assert.equal(validatePayload("player-pose", { ...pose, mountedCreatureSeat: 4 }), false);
  const response = { requestId: "mount-001", actorId: "rider-001", tick: 2, kind: "interact", targetId: 7, mounted: true, mountSeat: 1, status: "accepted" };
  assert.equal(validatePayload("creature-action", response), true);
  assert.equal(validatePayload("creature-action", { ...response, mountSeat: -1 }), false);
});

test("contextual loot passes family audit and 10,000 deterministic container simulations", () => {
  assert.deepEqual(auditLootFamilies(), []);
  const familyIds = Object.keys(LOOT_FAMILIES) as Array<keyof typeof LOOT_FAMILIES>;
  let empty = 0;
  let criticalMisses = 0;
  for (let index = 0; index < 10_000; index += 1) {
    const family = LOOT_FAMILIES[familyIds[index % familyIds.length]];
    const roomRole = Object.keys(family.purpose)[index % Object.keys(family.purpose).length];
    const critical = index % 113 === 0 ? [Item.Worldpin] : [];
    const context = { generatorVersion: 2, containerId: `audit-${index}`, archetype: "chest" as const, structureKind: family.id, roomRole, biomeId: index % 24, depthBand: ["surface", "shallow", "deep", "abyssal"][index % 4] as "surface" | "shallow" | "deep" | "abyssal", dangerTier: index % 10, lockTier: index % 5, progressionTags: [], seed: index * 7919, criticalItems: critical };
    const loot = resolveContextualLoot(context);
    const stacks = loot.slots.filter((slot): slot is InventorySlot => Boolean(slot));
    if (!stacks.length) empty += 1;
    if (critical.length && !stacks.some((slot) => slot.item === critical[0])) criticalMisses += 1;
    assert.deepEqual(resolveContextualLoot(context), loot);
  }
  assert.equal(empty, 0);
  assert.equal(criticalMisses, 0);
});

test("regional roads are connected, degree-bounded, deterministic, and never jump a block", () => {
  const nodes = Array.from({ length: 14 }, (_, index) => ({ id: `town-${index.toString().padStart(2, "0")}`, x: (index % 5) * 120 + (index * 17 % 31), z: Math.floor(index / 5) * 150 + (index * 23 % 37) }));
  const graph = planRegionalRoadGraph(nodes);
  const degrees = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of graph) { degrees.set(edge.from.id, (degrees.get(edge.from.id) ?? 0) + 1); degrees.set(edge.to.id, (degrees.get(edge.to.id) ?? 0) + 1); }
  assert.ok([...degrees.values()].every((degree) => degree <= 3));
  assert.ok(graph.length >= nodes.length - 1);
  assert.deepEqual(planRegionalRoadGraph([...nodes].reverse()), graph);
  const road = planTerrainFollowingRoad(nodes[0], nodes[13], (x, z) => {
    const water = x > 190 && x < 235;
    const height = Math.round(Math.sin(x / 55) * 4 + Math.cos(z / 70) * 3 + z / 95);
    return { height, waterline: 7, water, slopeRisk: Math.abs(Math.sin((x + z) / 33)) };
  });
  assert.deepEqual(auditRoadPlan(road), []);
  assert.ok(road.some((point) => point.kind === "bridge" || point.kind === "causeway" || point.kind === "ferry"));
});

test("rare guild lodges stay near ten percent and respect biome culture", () => {
  const biomes = [BiomeId.SugarplumVale, BiomeId.Beach, BiomeId.Highlands, BiomeId.Glimmerwood, BiomeId.Desert] as const;
  for (const biome of biomes) {
    const allowed = new Set(guildLodgeGuildsForBiome(biome));
    let lodges = 0;
    for (let index = 0; index < 10_000; index += 1) {
      const plan = planGuildLodgeForRegion(0x51a7c0de, index - 5_000, index * 7 - 11_000, biome);
      assert.deepEqual(planGuildLodgeForRegion(0x51a7c0de, index - 5_000, index * 7 - 11_000, biome), plan);
      if (!plan) continue;
      lodges += 1;
      assert.ok(allowed.has(plan.guildId));
    }
    assert.ok(lodges >= 850 && lodges <= 1_150, `${BiomeId[biome]} lodge rate ${lodges / 100}%`);
  }
  assert.equal(guildLodgeGuildsForBiome(BiomeId.Beach)[0], "tideglass");
  assert.equal(guildLodgeGuildsForBiome(BiomeId.Highlands)[0], "deepgear");
  assert.equal(guildLodgeGuildsForBiome(BiomeId.SugarplumVale)[0], "sugarcourt-makers");
  const lift = selectDeepgearLiftSite({ x: 0, z: 0 }, 24, 20, (x, z) => ({ height: x < 0 && z === 0 ? 44 : 21 }));
  assert.equal(lift.x < 0, true, "the lift chooses a viable mountain perimeter instead of a fixed east shelf");
  assert.ok(lift.liftTopY - lift.liftBottomY >= 5);
});

test("summon contracts preserve one stable lineage and prohibit echo duplication", () => {
  for (const kind of Object.keys(SUMMON_CONTRACTS) as Array<keyof typeof SUMMON_CONTRACTS>) {
    const firstManifestation = manifestSummon(createSummonContractState("keeper"), kind, 10);
    let state = firstManifestation.state;
    const manifestation = firstManifestation.manifestation;
    assert.equal(manifestation.echo, false);
    for (let count = 0; count < SUMMON_CONTRACTS[kind].concordanceRequired; count += 1) state = observeSummonRole(state, kind, SUMMON_CONTRACTS[kind].anchorEvent, 20 + count);
    const grounded = groundSummon(state, kind, manifestation.lineageId, `permanent-${kind}`, 24, false);
    assert.equal(grounded.ok, true);
    const echo = manifestSummon(grounded.state, kind, 40).manifestation;
    assert.equal(echo.lineageId, manifestation.lineageId);
    assert.equal(echo.echo, true);
    assert.equal(groundSummon(grounded.state, kind, echo.lineageId, `duplicate-${kind}`, 41, true).reason, "existing-grounded-individual");
  }
});

test("all six legendary encounters have staged ecology, four outcomes, anti-dup custody, and rare sites", () => {
  assert.deepEqual(auditLegendaryEncounterDefinitions(), { ok: true, issues: [], encounterCount: 6, kindCount: 6 });
  const scoped = createLegendaryEncounterState("walking-spring", "site-walking-spring");
  assert.equal(applyLegendaryEvent(scoped, { kind: "observe-sign", amount: 1, siteId: "another-site", sourceId: "clue-1" }), scoped, "another site cannot broadcast progress");
  const once = applyLegendaryEvent(scoped, { kind: "observe-sign", amount: 1, siteId: scoped.siteId, sourceId: "clue-1" });
  assert.equal(applyLegendaryEvent(once, { kind: "observe-sign", amount: 1, siteId: scoped.siteId, sourceId: "clue-1" }), once, "one object or route cannot replay proof");
  for (const encounterId of LEGENDARY_ENCOUNTER_ORDER) {
    let state = createLegendaryEncounterState(encounterId, `site-${encounterId}`);
    const definition = LEGENDARY_ENCOUNTERS[encounterId];
    for (let stageIndex = 0; stageIndex < definition.stages.length; stageIndex += 1) {
      const current = legendaryStageProgress(state);
      for (const entry of current.stage.objectives) state = applyLegendaryEvent(state, {
        kind: entry.event,
        amount: entry.target,
        siteId: state.siteId,
        sourceId: `${current.stage.id}:${entry.id}`,
      });
    }
    assert.equal(legendaryStageProgress(state).complete, true);
    const resolved = resolveLegendaryEncounter(state, "capture", `legendary-${encounterId}`);
    assert.equal(resolved.status, "resolved");
    assert.equal(legendaryCanManifest(resolved), false);
    assert.equal(transferLegendaryCustody(resolved, `legendary-${encounterId}`, `orb-${encounterId}`).custodyEntityId, `orb-${encounterId}`);
  }
  let site = null;
  for (let cellX = 0; cellX < 100 && !site; cellX += 1) site = planLegendaryEncounterSite({ seed: "legendary-audit", cellX, cellZ: 0, sample: () => ({ height: 50, waterline: 32, habitatKey: "sugarplum-vale" }) });
  assert.ok(site, "at least one Sovereign-compatible legendary cell should resolve");
});
