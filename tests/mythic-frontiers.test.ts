import assert from "node:assert/strict";
import test from "node:test";
import { planAdventureStructure } from "../app/game/adventure-content.ts";
import { BLOCKS, RECIPES, BlockId, ITEMS, Item, itemForBlock } from "../app/game/data.ts";
import { resolveStructureLootItem } from "../app/game/engine.ts";
import {
  MYTHIC_FRONTIER_SITES,
  MYTHIC_FRONTIER_SITE_ORDER,
  MYTHIC_MATERIAL_FAMILIES,
  MYTHIC_SIGNATURE_REWARDS,
  mythicRecoveryPolicyForSite,
  mythicEncounterTypes,
  rollMythicSiteLoot,
  validateMythicSitePlacement,
} from "../app/game/mythic-frontiers.ts";
import {
  advanceLegendarySiteRecovery,
  applyLegendaryEvent,
  createLegendaryEncounterState,
  legendaryStageProgress,
  normalizeLegendaryEncounterState,
  planLegendarySiteSimulation,
  recordLegendarySignatureReward,
  recordLegendarySiteVisit,
  resolveLegendaryEncounter,
  transitionLegendaryBehavior,
} from "../app/game/legendary-encounters.ts";
import {
  MYTHIC_CREATURE_PRODUCTION,
  MYTHIC_FRONTIER_CREATURE_KINDS,
  MYTHIC_REFERENCE_RECORDS,
  createMythicShedState,
  stepMythicShed,
} from "../app/game/mythic-creatures.ts";
import { EXPANSION_CREATURE_MOVE_SHEETS } from "../app/game/creature-moves.ts";
import { CREATURE_SOUND_EVENTS } from "../app/game/creature-sounds.ts";
import { MOB_DEFS } from "../app/game/mobs.ts";

const ORIGIN = Object.freeze({ x: 8, y: 64, z: 8 });

test("Mythic Frontiers ships ten POIs, five dungeons, six renewable material families, and fifteen rewards", () => {
  assert.equal(MYTHIC_FRONTIER_SITE_ORDER.length, 15);
  assert.equal(new Set(MYTHIC_FRONTIER_SITE_ORDER.map((id) => MYTHIC_FRONTIER_SITES[id].structureKind)).size, 15);
  assert.equal(MYTHIC_FRONTIER_SITE_ORDER.filter((id) => !MYTHIC_FRONTIER_SITES[id].structureKind.includes("palace")
    && !MYTHIC_FRONTIER_SITES[id].structureKind.includes("quarry")
    && !MYTHIC_FRONTIER_SITES[id].structureKind.includes("court-of")
    && !MYTHIC_FRONTIER_SITES[id].structureKind.includes("library-of")
    && MYTHIC_FRONTIER_SITES[id].structureKind !== "hollow-moon-menagerie").length, 10);
  assert.equal(Object.keys(MYTHIC_MATERIAL_FAMILIES).length, 6);
  assert.equal(Object.keys(MYTHIC_SIGNATURE_REWARDS).length, 15);
  assert.deepEqual(Object.values(MYTHIC_FRONTIER_SITES).reduce<Record<string, number>>((counts, entry) => ({ ...counts, [entry.role]: (counts[entry.role] ?? 0) + 1 }), {}), { regional: 6, sanctuary: 4, apex: 5 });
  const requiredVariantCounts = new Map([
    ["nacre-tidework", 6], ["windworn-alabaster", 7], ["fossilroot-calcite", 6],
    ["emberglass-archive", 6], ["mirrorpeat-reedglass", 6], ["moonfelt-mycelium", 5],
  ]);
  for (const [familyId, family] of Object.entries(MYTHIC_MATERIAL_FAMILIES)) {
    assert.equal(family.variants.length, requiredVariantCounts.get(familyId));
    assert.notEqual(family.block, family.supportBlock);
    assert.notEqual(family.block, family.accentBlock);
    assert.ok(ITEMS[itemForBlock(family.block)]?.placeBlock === family.block);
    assert.ok(RECIPES.some((recipe) => recipe.output.item === itemForBlock(family.block)));
  }
  for (const reward of Object.values(MYTHIC_SIGNATURE_REWARDS)) {
    const item = resolveStructureLootItem(reward.itemKey);
    assert.notEqual(item, null);
    assert.equal(ITEMS[item!].rarity, "legendary");
    assert.ok(ITEMS[item!].legendaryEffect?.length);
  }
  assert.equal(new Set(Object.values(MYTHIC_SIGNATURE_REWARDS).map((reward) => reward.itemKey)).size, 15);
  assert.equal(Item.RememberedPathSpore, 590, "merged append-only reward ids are release contracts");
});

function completeEncounter(encounterId: Parameters<typeof createLegendaryEncounterState>[0], siteId: string) {
  let state = createLegendaryEncounterState(encounterId, siteId);
  for (let stageIndex = 0; stageIndex < 3; stageIndex += 1) {
    const stage = legendaryStageProgress(state).stage;
    for (const objective of stage.objectives) state = applyLegendaryEvent(state, {
      kind: objective.event,
      siteId,
      sourceId: `${stage.id}:${objective.id}`,
      amount: objective.target,
    });
  }
  return state;
}

test("regional recovery, sanctuary identity, revisits, and one-time signatures persist without per-frame work", () => {
  const regionalSite = MYTHIC_FRONTIER_SITES["road-quiet-bells"];
  const regionalPolicy = mythicRecoveryPolicyForSite(regionalSite.id);
  let regional = resolveLegendaryEncounter(completeEncounter("quiet-bells", "site:quiet"), "release", null, 12, regionalPolicy);
  assert.equal(regional.nextResidentReturnDay, 30);
  regional = recordLegendarySiteVisit(regional, 15);
  regional = recordLegendarySiteVisit(regional, 15);
  assert.equal(regional.revisitCount, 0, "same-day proximity must not become an update loop");
  regional = recordLegendarySiteVisit(regional, 18);
  assert.equal(regional.revisitCount, 1);
  assert.equal(advanceLegendarySiteRecovery(regional, 29, regionalPolicy).status, "resolved");
  regional = advanceLegendarySiteRecovery(regional, 30, regionalPolicy);
  assert.equal(regional.status, "dormant");
  assert.equal(regional.outcome, null);
  assert.ok(regional.worldChanges.length >= 2, "recovery must preserve the site's history");

  const sanctuarySite = MYTHIC_FRONTIER_SITES["cloudwhale-graveyard"];
  const sanctuary = advanceLegendarySiteRecovery(
    resolveLegendaryEncounter(completeEncounter("cloudwhale-graveyard", "site:whale"), "release", null, 3, mythicRecoveryPolicyForSite(sanctuarySite.id)),
    10_000,
    mythicRecoveryPolicyForSite(sanctuarySite.id),
  );
  assert.equal(sanctuary.status, "resolved", "a persistent sanctuary individual must not be manufactured again");
  assert.equal(sanctuary.ecologyRecovery, 1);

  regional = recordLegendarySignatureReward(regional, "mythic-bellkeeper-tack");
  assert.equal(recordLegendarySignatureReward(regional, "mythic-bellkeeper-tack"), regional);
  assert.equal(rollMythicSiteLoot(regionalSite.id, "return", 12, true).signatureAwarded, false);
  assert.equal(normalizeLegendaryEncounterState(JSON.parse(JSON.stringify(regional)), "quiet-bells", "site:quiet").signatureRewardIds.length, 1);
});

test("long-session mythic proxy and revisit state stays bounded across thousands of transitions", () => {
  let states = MYTHIC_FRONTIER_SITE_ORDER.map((siteId) => createLegendaryEncounterState(MYTHIC_FRONTIER_SITES[siteId].encounterId as Parameters<typeof createLegendaryEncounterState>[0], `stress:${siteId}`));
  for (let tick = 0; tick < 5_000; tick += 1) states = states.map((state, index) => {
    let next = planLegendarySiteSimulation(state, tick % 9 === 0 ? 24 : 180, 99);
    if (tick % 30 === index) next = recordLegendarySiteVisit(next, Math.floor(tick / 30));
    return next;
  });
  assert.ok(states.every((state) => state.activeBrains <= 2));
  assert.ok(JSON.stringify(states).length < 32_000, "lazy proxy/revisit state must not grow with exploration time");
});

test("every site follows its declared material ratio, flooded-room contract, unique resident, and four-pool chest", () => {
  for (const siteId of MYTHIC_FRONTIER_SITE_ORDER) {
    const definition = MYTHIC_FRONTIER_SITES[siteId];
    const family = MYTHIC_MATERIAL_FAMILIES[definition.material];
    const plan = planAdventureStructure(definition.structureKind as never, ORIGIN, `material:${siteId}`);
    const solids = plan.placements.filter((placement) => BLOCKS[placement.block]?.solid && placement.block !== BlockId.Chest);
    const ratio = (block: BlockId) => solids.filter((placement) => placement.block === block).length / solids.length;
    assert.ok(ratio(family.block) >= .64 && ratio(family.block) <= .76, `${siteId} base ratio`);
    assert.ok(ratio(family.supportBlock) >= .18 && ratio(family.supportBlock) <= .28, `${siteId} support ratio`);
    assert.ok(ratio(family.accentBlock) >= .04 && ratio(family.accentBlock) <= .1, `${siteId} accent ratio`);
    const exceptionalCount = plan.placements.filter((placement) => placement.block === family.exceptionalBlock).length;
    assert.ok(exceptionalCount >= definition.minimumRooms, `${siteId} needs localized ecological light`);
    assert.ok(exceptionalCount / plan.placements.length < .05, `${siteId} exceptional material must remain rare`);
    const floodIds = new Set(plan.placements.filter((placement) => placement.variant?.includes("explicit-flooded-room-")).map((placement) => placement.variant));
    assert.equal(floodIds.size, definition.explicitFloodedRooms, `${siteId} flooded rooms`);
    if (definition.layer === "underground" && definition.explicitFloodedRooms === 0) assert.equal(plan.placements.some((placement) => placement.block === BlockId.Water), false);
    const residents = plan.markers.filter((marker) => marker.type === "spawn" && marker.mobKind === definition.creature);
    assert.equal(residents.length, 1, `${siteId} must not duplicate its large brain as a proxy actor`);
    assert.ok(residents[0].type === "spawn" && residents[0].tags?.includes("persistent-lair"));
    const signatureChest = plan.markers.find((marker) => marker.type === "chest" && /signature/u.test(marker.id));
    assert.ok(signatureChest?.type === "chest");
    assert.deepEqual(new Set(signatureChest.loot.map((loot) => resolveStructureLootItem(loot.itemKey) === null ? "unresolved" : loot.itemKey)).has("unresolved"), false);
    assert.ok(signatureChest.loot.some((loot) => loot.itemKey === MYTHIC_SIGNATURE_REWARDS[siteId].itemKey));
    assert.equal(plan.rooms.length, definition.minimumRooms);
  }
});

test("each structure passes a 200-seed deterministic entrance, return, water, and placement sweep", () => {
  for (const siteId of MYTHIC_FRONTIER_SITE_ORDER) {
    const definition = MYTHIC_FRONTIER_SITES[siteId];
    for (let seed = 0; seed < 200; seed += 1) {
      const plan = planAdventureStructure(definition.structureKind as never, ORIGIN, `mythic-sweep:${siteId}:${seed}`);
      const validation = validateMythicSitePlacement(plan, {
        siteId,
        roadDistance: 80,
        settlementDistance: 120,
        dwarfSettlementDistance: 120,
        connectedEntrance: true,
        waterShellCount: definition.sealedUnderwater ? 12 : 0,
        explicitFloodedRoomCount: definition.explicitFloodedRooms,
        returnPathConnected: true,
      });
      assert.deepEqual(validation, { ok: true, issues: [] }, `${siteId} seed ${seed}`);
      assert.ok(plan.markers.some((marker) => marker.type === "landmark" && /entrance|threshold/u.test(marker.tag)));
      assert.ok(plan.placements.length > 500 && plan.placements.length < 18_000);
      assert.equal(new Set(plan.rooms.map((room) => room.stage)).size, definition.minimumRooms);
      if (seed % 50 === 0) assert.deepEqual(plan, planAdventureStructure(definition.structureKind as never, ORIGIN, `mythic-sweep:${siteId}:${seed}`));
    }
  }
});

test("placement rejection is non-destructive and enforces roads, settlements, water shells, and Dwarven clearance", () => {
  const kettle = MYTHIC_FRONTIER_SITES["titans-kettle"];
  const plan = planAdventureStructure(kettle.structureKind as never, ORIGIN, "clearance");
  const context = { siteId: kettle.id, roadDistance: 80, settlementDistance: 120, dwarfSettlementDistance: 120, connectedEntrance: true, waterShellCount: 0, explicitFloodedRoomCount: 0, returnPathConnected: true } as const;
  assert.equal(validateMythicSitePlacement(plan, { ...context, roadDistance: 2 }).issues.includes("road-overlap"), true);
  assert.equal(validateMythicSitePlacement(plan, { ...context, settlementDistance: 8 }).issues.includes("settlement-overlap"), true);
  assert.equal(validateMythicSitePlacement(plan, { ...context, dwarfSettlementDistance: 40 }).issues.includes("dwarven-settlement-clearance"), true);
  assert.equal(validateMythicSitePlacement(plan, { ...context, connectedEntrance: false }).issues.includes("blocked-entrance"), true);
  const underwater = MYTHIC_FRONTIER_SITES["drowned-moon-gate"];
  const underwaterPlan = planAdventureStructure(underwater.structureKind as never, ORIGIN, "water-shell");
  assert.equal(validateMythicSitePlacement(underwaterPlan, { ...context, siteId: underwater.id, explicitFloodedRoomCount: underwater.explicitFloodedRooms }).issues.includes("unsealed-underwater-shell"), true);
});

test("encounter phases, proxy budget, temporary types, and signature pity remain bounded", () => {
  let encounter = createLegendaryEncounterState("quiet-bells", "mythic:quiet-bells:0,0");
  assert.equal(encounter.behaviorPhase, "wary");
  encounter = transitionLegendaryBehavior(encounter, "territorial");
  encounter = transitionLegendaryBehavior(encounter, "defending");
  encounter = transitionLegendaryBehavior(encounter, "frenzied");
  encounter = transitionLegendaryBehavior(encounter, "exhausted");
  encounter = transitionLegendaryBehavior(encounter, "trusting");
  assert.equal(encounter.behaviorPhase, "trusting");
  assert.equal(planLegendarySiteSimulation(encounter, 200, 9), encounter, "unchanged distant proxy state must preserve identity and revision");
  const awake = planLegendarySiteSimulation(encounter, 20, 99);
  assert.equal(awake.proxyMode, false);
  assert.equal(awake.activeBrains, 2);
  assert.deepEqual(mythicEncounterTypes("bellstep-qilin", "bellstep-qilin--roadward-chime", ["radiant", "echo", "wild"]), ["radiant", "echo"]);
  assert.deepEqual(mythicEncounterTypes("sable-gorgon", "sable-gorgon--sable-glance", ["stone", "venom"]), ["stone", "venom", "mirror"]);
  for (const siteId of MYTHIC_FRONTIER_SITE_ORDER) {
    let pity = 0;
    let awarded = false;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const result = rollMythicSiteLoot(siteId, `pity:${siteId}:${attempt}`, pity);
      pity = result.nextPity;
      if (result.signatureAwarded) { awarded = true; break; }
    }
    assert.equal(awarded, true, `${siteId} must award by the twelfth visit`);
  }
});

test("every mythic creature has a production brief, connected action contract, sound, lethal drop, and peaceful renewable shed", () => {
  assert.equal(MYTHIC_FRONTIER_CREATURE_KINDS.length, 15);
  for (const kind of MYTHIC_FRONTIER_CREATURE_KINDS) {
    const production = MYTHIC_CREATURE_PRODUCTION[kind];
    const reference = MYTHIC_REFERENCE_RECORDS[kind];
    assert.equal(MYTHIC_FRONTIER_SITES[production.siteId].creature, kind);
    assert.equal(production.visualBrief.silhouetteAnchors.length, 3);
    assert.ok(production.visualBrief.primaryMass.length >= 16);
    assert.ok(production.visualBrief.connectedLoadPath.length >= 24);
    assert.ok(production.visualBrief.localizedMagic.length >= 18);
    assert.ok(Object.values(production.actionProfile).every((value) => value.length >= 18));
    assert.ok(production.fieldUtility.length >= 24);
    assert.ok(production.customSoundCategory.length >= 12);
    assert.ok(production.nonlethalReward.length >= 24);
    assert.ok(reference.sourceTradition.length >= 18);
    assert.ok(reference.definingRelationship.length >= 24);
    assert.ok(reference.blockwildAdaptation.length >= 24);
    assert.ok(reference.writingGuardrail.length >= 24);
    const moveSheet = EXPANSION_CREATURE_MOVE_SHEETS[kind];
    assert.deepEqual(production.aiLoadout, moveSheet.moves.map((move) => move.id));
    assert.ok(Object.keys(CREATURE_SOUND_EVENTS[kind] ?? {}).length >= 1);
    assert.ok(MOB_DEFS[kind].drops.length >= 1, `${kind} needs a restrained lethal drop table as well as its better peaceful shed`);
    const initial = createMythicShedState(kind, `shed:${kind}`);
    assert.equal(stepMythicShed(kind, initial, initial.nextShedAgeTicks + 1, false, 1).drop, null);
    assert.equal(stepMythicShed(kind, initial, initial.nextShedAgeTicks + 1, true, .5).drop, null);
    const peaceful = stepMythicShed(kind, initial, initial.nextShedAgeTicks + 1, true, 1);
    assert.equal(peaceful.drop?.item, production.shed.item);
    assert.ok((peaceful.drop?.count ?? 0) >= production.shed.min && (peaceful.drop?.count ?? 0) <= production.shed.max);
    assert.equal(peaceful.state.shedCount, 1);
    assert.ok(peaceful.state.nextShedAgeTicks > initial.nextShedAgeTicks);
  }
});

test("each mythic site has an authored approach silhouette and every underwater air route owns a sealed pressure volume", () => {
  for (const siteId of MYTHIC_FRONTIER_SITE_ORDER) {
    const definition = MYTHIC_FRONTIER_SITES[siteId];
    const plan = planAdventureStructure(definition.structureKind as never, ORIGIN, `silhouette:${siteId}`);
    assert.equal(plan.markers.filter((marker) => marker.type === "landmark" && marker.tag.startsWith(`mythic-silhouette:${siteId}:`)).length, 1);
    if (definition.layer === "underground" && definition.minimumRooms <= 4) {
      assert.ok(plan.markers.some((marker) => marker.type === "landmark" && marker.tag === `mythic-surface-threshold:${siteId}`));
    }
    if (!definition.sealedUnderwater) continue;
    const airRoutes = new Set(plan.placements.filter((placement) => placement.variant?.includes(`${siteId}-air-route-`)).map((placement) => placement.variant?.match(/route-(\d+)$/u)?.[1]).filter(Boolean));
    for (const route of airRoutes) {
      assert.ok(plan.placements.some((placement) => placement.variant === `${siteId}-sealed-route-floor-${route}`));
      assert.ok(plan.placements.some((placement) => placement.variant === `${siteId}-sealed-route-ceiling-${route}`));
    }
    const pressureLockRoutes = new Set(plan.placements.filter((placement) => placement.variant?.startsWith(`${siteId}-pressure-lock-`)).map((placement) => placement.variant));
    const expectedTransitions = siteId === "drowned-moon-gate" ? 1 : siteId === "sunken-court-namarra" ? 2 : 0;
    assert.equal(pressureLockRoutes.size, expectedTransitions, `${siteId} wet/dry boundaries need explicit pressure locks`);
  }
});
