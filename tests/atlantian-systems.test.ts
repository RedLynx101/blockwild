import assert from "node:assert/strict";
import test from "node:test";
import {
  FACTION_IDS,
  FACTIONS,
  alignmentFor,
  applyFactionMemberKill,
  createFactionRelations,
  diplomacyBetween,
  evaluateTownCapture,
  factionAllowsRace,
  factionCanOccupyEnvironment,
  factionsAreHostile,
  raceBreathesWater,
  type AuthorityCommand,
  type FactionRelationsState,
} from "../app/game/factions.ts";
import {
  ATLANTIAN_MERCHANT_OFFERS,
  COMMERCE_CATALOG,
  createMerchant,
  merchantOffersFor,
  quoteMerchantTrade,
  restockMerchant,
} from "../app/game/economy.ts";
import {
  ATLANTIAN_SIDE_QUESTS,
  applySettlementCapture,
  calculateAquaticPopulationSoftCap,
  createSettlementState,
  electMayorAtEight,
  findRoleWaypoint,
  generateResidentName,
  growSettlementPopulation,
  hireResident,
  isAquaticProfession,
  isMayorProfession,
  isWarriorProfession,
  merchantProfessionForResident,
  normalizeSettlementState,
  planResidentSchedule,
  planSettlementCandidate,
  planSettlementLayout,
  settlementBiomeEligible,
  sideQuestOffersFor,
  type ResidentProfession,
  type SettlementCandidate,
} from "../app/game/settlements.ts";
import {
  ATLANTIAN_FACTION_QUESTS,
  ATLANTIAN_QUESTLINE,
  DEFAULT_QUEST_DEFINITIONS,
  acceptQuest,
  applyQuestEvent,
  createQuestBook,
  questAvailability,
  turnInQuest,
} from "../app/game/quests.ts";

function authority(eventId: string, expectedRevision: number): AuthorityCommand {
  return { authorityId: "host-atlantis", eventId, expectedRevision };
}

const atlantianCandidate: SettlementCandidate = {
  schema: 1,
  id: "tidehold-test",
  worldSeed: "lumen-seed",
  regionX: 2,
  regionZ: -3,
  center: { x: 320, y: -20, z: -480 },
  size: "town",
  factionId: "atlantians",
  biome: "lumen-trench",
  environment: "underwater",
  floorY: -22,
};

test("Atlantians are a water-breathing sentient culture while Wayfarers may lead mixed races", () => {
  assert.deepEqual(FACTION_IDS, ["player", "hobbits", "goblins", "atlantians"]);
  assert.equal(FACTIONS.atlantians.sentient, true);
  assert.equal(FACTIONS.atlantians.aquaticOnly, true);
  assert.equal(FACTIONS.atlantians.race, "atlantian");
  assert.equal(raceBreathesWater("atlantian"), true);
  assert.equal(raceBreathesWater("wayfarer"), false);
  assert.equal(factionAllowsRace("atlantians", "wayfarer"), false);
  assert.equal(factionAllowsRace("player", "atlantian"), true);
  assert.equal(factionAllowsRace("player", "wayfarer"), true);
  assert.equal(factionCanOccupyEnvironment("atlantians", "underwater"), true);
  assert.equal(factionCanOccupyEnvironment("atlantians", "surface"), false);
  assert.equal(factionCanOccupyEnvironment("player", "underwater"), true);
});

test("Atlantian alignment, diplomacy, hostility, and old relation saves are safe", () => {
  let relations = createFactionRelations("host-atlantis");
  assert.equal(relations.alignments.atlantians, 0);
  assert.equal(diplomacyBetween(relations, "atlantians", "goblins"), "neutral");
  relations = applyFactionMemberKill(relations, "atlantians", "atlantian-tidewarden", authority("tidewarden-fell", 0)).state;
  assert.equal(relations.alignments.atlantians, -35);
  relations = applyFactionMemberKill(relations, "atlantians", "atlantian-pearlbroker", authority("broker-fell", 1)).state;
  assert.equal(relations.alignments.atlantians, -57);
  assert.equal(factionsAreHostile(relations, "atlantians", "player"), true);

  const legacy = {
    ...createFactionRelations("host-atlantis"),
    alignments: { player: 100, hobbits: 2, goblins: -3 },
    diplomacy: { "goblins|hobbits": "neutral", "goblins|player": "neutral", "hobbits|player": "neutral" },
  } as unknown as FactionRelationsState;
  assert.equal(alignmentFor(legacy, "atlantians"), 0);
  assert.equal(diplomacyBetween(legacy, "atlantians", "player"), "neutral");
});

test("sparse underwater candidates are deterministic, vertically placed, and biome-exclusive", () => {
  assert.equal(settlementBiomeEligible("atlantians", "deep-ocean"), true);
  assert.equal(settlementBiomeEligible("atlantians", "lumen-trench"), true);
  assert.equal(settlementBiomeEligible("hobbits", "deep-ocean"), false);
  assert.equal(settlementBiomeEligible("goblins", "lumen-trench"), false);
  let candidate: SettlementCandidate | null = null;
  for (let regionX = -32; regionX <= 32 && !candidate; regionX += 1) {
    candidate = planSettlementCandidate({ worldSeed: "blue-depths", regionX, regionZ: 7, biome: "lumen-trench", floorY: -34, existing: [] });
  }
  assert.ok(candidate, "the sparse density still produces deterministic tideholds over bounded regions");
  assert.equal(candidate.factionId, "atlantians");
  assert.equal(candidate.environment, "underwater");
  assert.equal(candidate.floorY, -34);
  assert.equal(candidate.center.y, -32);
  assert.match(candidate.id, /^tidehold-/u);
  assert.deepEqual(planSettlementCandidate({ worldSeed: "blue-depths", regionX: candidate.regionX, regionZ: 7, biome: "lumen-trench", floorY: -34, existing: [] }), candidate);
});

test("Atlantian layouts are open, vertical, luminous reef settlements with rest capacity", () => {
  const layout = planSettlementLayout(atlantianCandidate);
  assert.deepEqual(planSettlementLayout(atlantianCandidate), layout);
  assert.equal(layout.environment, "underwater");
  assert.equal(layout.topology, "open-underwater");
  assert.deepEqual(layout.wall, []);
  assert.deepEqual(layout.gates, []);
  assert.ok(layout.approaches.length >= 3);
  assert.equal(layout.approaches.every((approach) => approach.kind === "trench-arch"), true);
  assert.equal(layout.verticalLayers.length, 4);
  assert.ok(new Set(layout.buildings.map((building) => building.position.y)).size >= 4);
  assert.equal(layout.buildings.some((building) => building.role === "tide-hall"), true);
  assert.equal(layout.buildings.some((building) => building.role === "kelp-garden"), true);
  assert.equal(layout.buildings.some((building) => building.role === "coral-workshop"), true);
  assert.equal(layout.buildings.every((building) => building.materialPalette.some((material) => ["living-coral", "reef-stone", "reefglass", "lumen-coral", "glowstone", "pale-coral"].includes(material))), true);
  assert.equal(layout.beds, 0);
  assert.equal(layout.doors, 0);
  assert.ok(layout.nests > 0 && layout.restAlcoves > 0);
  assert.equal(layout.populationSoftCap, calculateAquaticPopulationSoftCap(layout.nests, layout.restAlcoves, "town"));
  assert.equal(layout.lights.every((light) => ["glowstone-cluster", "bioluminescent-orb", "lumen-spire"].includes(light.kind) && light.monsterSafeRadius >= 9), true);
  assert.ok(layout.paths.some((point) => point.y !== layout.center.y), "current lanes move through several vertical layers");
});

test("legacy surface settlement saves gain compatibility fields without changing their culture", () => {
  const surfaceCandidate: SettlementCandidate = {
    schema: 1, id: "legacy-freehold", worldSeed: "legacy", regionX: 0, regionZ: 0,
    center: { x: 0, z: 0 }, size: "hamlet", factionId: "hobbits", biome: "forest",
  };
  const current = createSettlementState("host-atlantis", surfaceCandidate);
  const { environment: _environment, ...legacyState } = current;
  const {
    environment: _layoutEnvironment,
    topology: _topology,
    approaches: _approaches,
    verticalLayers: _verticalLayers,
    nests: _nests,
    restAlcoves: _restAlcoves,
    ...legacyLayout
  } = current.layout;
  void _environment;
  void _layoutEnvironment;
  void _topology;
  void _approaches;
  void _verticalLayers;
  void _nests;
  void _restAlcoves;
  const legacy = {
    ...legacyState,
    layout: legacyLayout,
    residents: current.residents.map((resident) => ({ ...resident, waterBreathing: undefined })),
  } as unknown as typeof current;
  const normalized = normalizeSettlementState(legacy);
  assert.equal(normalized.environment, "surface");
  assert.equal(normalized.layout.topology, "walled-surface");
  assert.deepEqual(normalized.layout.approaches, []);
  assert.deepEqual(normalized.layout.verticalLayers, []);
  assert.equal(normalized.residents.every((resident) => resident.race === "hearthkin" && resident.waterBreathing === false), true);
});

test("Atlantian residents use exact mob professions, water traits, names, tools, and waypoints", () => {
  const settlement = createSettlementState("host-atlantis", atlantianCandidate);
  const expected = [
    "atlantian-tidewarden",
    "atlantian-kelpkeeper",
    "atlantian-coralwright",
    "atlantian-pearlbroker",
    "atlantian-glowmender",
    "atlantian-trident-guard",
  ] as const;
  assert.equal(settlement.environment, "underwater");
  assert.equal(settlement.residents.every((resident) => resident.race === "atlantian" && resident.waterBreathing), true);
  assert.equal(settlement.residents.every((resident) => isAquaticProfession(resident.profession)), true);
  for (const profession of expected) assert.ok(findRoleWaypoint(settlement, profession));
  const guard = settlement.residents.find((resident) => resident.profession === "atlantian-trident-guard")!;
  assert.equal(guard.equipment.weapon, "tideglass-trident");
  assert.equal(isWarriorProfession(guard.profession), true);
  assert.equal(isMayorProfession("atlantian-tidewarden"), true);
  assert.equal(generateResidentName("atlantian", "same-tide"), generateResidentName("atlantian", "same-tide"));
  assert.notEqual(generateResidentName("atlantian", "same-tide"), generateResidentName("hearthkin", "same-tide"));
  assert.doesNotThrow(() => JSON.stringify(settlement));
});

test("aquatic schedules rest in alcoves, work by culture, guard currents, and respond to danger", () => {
  const settlement = createSettlementState("host-atlantis", atlantianCandidate);
  const byProfession = (profession: ResidentProfession) => settlement.residents.find((resident) => resident.profession === profession)!;
  assert.equal(planResidentSchedule(byProfession("atlantian-trident-guard"), settlement, { worldDay: 2, hour: 10, monsterVisible: false }).action, "patrol-current");
  assert.equal(planResidentSchedule(byProfession("atlantian-kelpkeeper"), settlement, { worldDay: 2, hour: 10, monsterVisible: false }).action, "tend-kelp");
  assert.equal(planResidentSchedule(byProfession("atlantian-coralwright"), settlement, { worldDay: 2, hour: 10, monsterVisible: false }).action, "shape-coral");
  assert.equal(planResidentSchedule(byProfession("atlantian-pearlbroker"), settlement, { worldDay: 2, hour: 10, monsterVisible: false }).action, "trade-pearls");
  assert.equal(planResidentSchedule(byProfession("atlantian-glowmender"), settlement, { worldDay: 2, hour: 10, monsterVisible: false }).action, "mend-glow");
  const keeper = byProfession("atlantian-kelpkeeper");
  assert.equal(planResidentSchedule(keeper, settlement, { worldDay: 2, hour: 2, monsterVisible: false }).action, "rest");
  assert.equal(planResidentSchedule(keeper, settlement, { worldDay: 2, hour: 10, monsterVisible: true }).action, "flee");
  assert.equal(planResidentSchedule({ ...keeper, health: 4 }, settlement, { worldDay: 2, hour: 10, monsterVisible: true }).action, "fight");
});

test("Atlantian succession, growth, hiring, and environment-safe claims remain host authoritative", () => {
  const initial = createSettlementState("host-atlantis", atlantianCandidate);
  const withoutMayor = { ...initial, residents: initial.residents.map((resident) => isMayorProfession(resident.profession) ? { ...resident, alive: false } : resident) };
  const election = electMayorAtEight(withoutMayor, 3, 8, authority("elect-tidewarden", 0));
  assert.equal(election.applied, true);
  assert.equal(election.state.residents.filter((resident) => resident.alive && resident.profession === "atlantian-tidewarden").length, 1);

  const withSpace = { ...election.state, residents: election.state.residents.map((resident, index) => index === 2 ? { ...resident, alive: false } : resident) };
  const grown = growSettlementPopulation(withSpace, 3, authority("new-swimmer", 1));
  assert.equal(grown.applied, true);
  assert.equal(grown.state.residents.at(-1)?.race, "atlantian");
  assert.equal(grown.state.residents.at(-1)?.waterBreathing, true);

  const guard = initial.residents.find((resident) => resident.profession === "atlantian-trident-guard")!;
  const hired = hireResident(initial, guard.id, "player", 80, true, authority("hire-guard", 0));
  assert.equal(hired.applied, true);
  assert.equal(hired.state.residents.find((resident) => resident.id === guard.id)?.factionId, "player");
  assert.equal(hired.state.residents.find((resident) => resident.id === guard.id)?.waterBreathing, true);

  const relations = createFactionRelations("host-atlantis");
  const blockedSurface = evaluateTownCapture(relations, {
    townId: "surface-town", currentOwner: "hobbits", claimant: "atlantians", environment: "surface",
    livingWarriors: 0, livingMayor: true, mayorThreatened: true, claimantPresent: true,
  });
  assert.equal(blockedSurface.reason, "environment-incompatible");
  const playerClaim = evaluateTownCapture(relations, {
    townId: initial.id, currentOwner: "atlantians", claimant: "player", environment: "underwater",
    livingWarriors: 0, livingMayor: true, mayorThreatened: true, claimantPresent: true,
  });
  assert.equal(playerClaim.allowed, true);
  const captured = applySettlementCapture(initial, playerClaim.receipt!, 4, authority(playerClaim.receipt!.id, 0));
  assert.equal(captured.applied, true);
  assert.equal(captured.state.ownerFactionId, "player");
  assert.equal(captured.state.cultureRace, "atlantian");
  assert.equal(captured.state.residents.filter((resident) => !isWarriorProfession(resident.profession)).every((resident) => resident.factionId === "player"), true);
});

test("Atlantian merchants carry profession goods, price aquatic demand, and restock deterministically", () => {
  assert.ok(ATLANTIAN_MERCHANT_OFFERS.length >= 8);
  assert.equal(merchantOffersFor("atlantians", "atlantian-kelpkeeper").some((offer) => offer.itemKey === "glow-kelp"), true);
  assert.equal(merchantOffersFor("atlantians", "atlantian-coralwright").some((offer) => offer.itemKey === "tideglass-trident"), true);
  assert.equal(merchantProfessionForResident("atlantian-pearlbroker"), "atlantian-pearlbroker");
  const broker = createMerchant("host-atlantis", "broker", "atlantians", "atlantian-pearlbroker", 500);
  const generic = createMerchant("host-atlantis", "warden", "atlantians", "atlantian-tidewarden", 500);
  assert.ok(quoteMerchantTrade(broker, COMMERCE_CATALOG["lumen-pearl"], 1, "player-sells").unitPrice > quoteMerchantTrade(generic, COMMERCE_CATALOG["lumen-pearl"], 1, "player-sells").unitPrice);
  const restocked = restockMerchant(broker, 2, authority("restock-reef", 0));
  assert.equal(restocked.applied, true);
  assert.deepEqual(restockMerchant(broker, 2, authority("restock-reef", 0)), restocked);
  assert.equal(restocked.state.inventory.some((stack) => stack.itemKey === "lumen-pearl"), true);
});

test("Atlantian discovery quests branch through first contact and settlement jobs stay deterministic", () => {
  assert.deepEqual(ATLANTIAN_QUESTLINE.questIds, ATLANTIAN_FACTION_QUESTS.map((quest) => quest.id));
  assert.equal(DEFAULT_QUEST_DEFINITIONS.some((quest) => quest.id === "atlantian-light-below"), true);
  const first = ATLANTIAN_FACTION_QUESTS[0];
  const trade = ATLANTIAN_FACTION_QUESTS[1];
  let book = createQuestBook();
  assert.equal(questAvailability(book, first), "available");
  assert.equal(questAvailability(book, trade), "locked");
  book = acceptQuest(book, ATLANTIAN_FACTION_QUESTS, first.id, 0).book;
  book = applyQuestEvent(book, ATLANTIAN_FACTION_QUESTS, { type: "town-discovered", townId: "tidehold-test", factionId: "atlantians", at: 4 });
  const completed = turnInQuest(book, ATLANTIAN_FACTION_QUESTS, first.id, {}, 5);
  assert.equal(completed.ok, true);
  if (!completed.ok) return;
  assert.equal(completed.book.factionAlignment.atlantians, 5);
  assert.equal(questAvailability(completed.book, trade), "available");
  assert.equal(ATLANTIAN_SIDE_QUESTS.every((quest) => quest.factionId === "atlantians" && quest.criteria.length > 1), true);
  assert.deepEqual(
    sideQuestOffersFor("atlantians", "atlantian-glowmender", "tidehold-test", 8),
    sideQuestOffersFor("atlantians", "atlantian-glowmender", "tidehold-test", 8),
  );
});
