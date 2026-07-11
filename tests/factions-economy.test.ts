import assert from "node:assert/strict";
import test from "node:test";
import {
  FACTIONS,
  applyFactionMemberKill,
  applyQuestAlignmentReward,
  applyTownCaptureConsequences,
  canTameAlignedCreature,
  createFactionRelations,
  diplomacyBetween,
  evaluateTownCapture,
  factionStanding,
  factionsAreHostile,
  setDiplomacy,
  type AuthorityCommand,
} from "../app/game/factions.ts";
import {
  COMMERCE_CATALOG,
  bankBalanceWholeGold,
  buyFromMerchant,
  buyStock,
  compareGold,
  compoundBankInterest,
  createBankAccount,
  createGoldWallet,
  createMerchant,
  createStockMarket,
  depositAtBank,
  merchantOffersFor,
  normalizeGold,
  quoteMerchantTrade,
  restockMerchant,
  sellStock,
  sellToMerchant,
  stockPortfolioValueGold,
  stepStockMarket,
  withdrawFromBank,
  type AtomicEconomyCommand,
  type CommerceItem,
} from "../app/game/economy.ts";
import {
  GOBLIN_SIDE_QUESTS,
  HOBBIT_SIDE_QUESTS,
  SETTLEMENT_SIZE_RULES,
  applySettlementCapture,
  calculatePopulationSoftCap,
  createSettlementState,
  electMayorAtEight,
  findRoleWaypoint,
  followerFormationSlot,
  generateResidentName,
  growSettlementPopulation,
  hasSettlementSpacing,
  hireResident,
  merchantProfessionForResident,
  planResidentSchedule,
  planSettlementCandidate,
  planSettlementLayout,
  settlementBiomeEligible,
  sideQuestOffersFor,
  updateHirelingOrders,
  type SettlementCandidate,
} from "../app/game/settlements.ts";

function authority(eventId: string, expectedRevision: number): AuthorityCommand {
  return { authorityId: "host-a", eventId, expectedRevision };
}

function atomic(eventId: string, expectedWalletRevision: number, expectedCounterpartyRevision: number): AtomicEconomyCommand {
  return { authorityId: "host-a", eventId, expectedWalletRevision, expectedCounterpartyRevision };
}

const hobbitCandidate: SettlementCandidate = {
  schema: 1,
  id: "freehold-test",
  worldSeed: "hearthroads",
  regionX: 2,
  regionZ: -1,
  center: { x: 100, z: -40 },
  size: "village",
  factionId: "hobbits",
  biome: "flower-meadow",
};

const goblinCandidate: SettlementCandidate = {
  ...hobbitCandidate,
  id: "clanhold-test",
  center: { x: 900, z: 700 },
  factionId: "goblins",
  biome: "highlands",
};

test("factions expose sentient races, bounded standings, and host-idempotent alignment", () => {
  assert.equal(FACTIONS.hobbits.sentient, true);
  assert.equal(FACTIONS.goblins.race, "goblin");
  assert.equal(factionStanding(-50), "hostile");
  let relations = createFactionRelations("host-a");
  const killed = applyFactionMemberKill(relations, "hobbits", "mayor", authority("kill-mayor", 0));
  assert.equal(killed.applied, true);
  assert.equal(killed.state.alignments.hobbits, -35);
  assert.equal(applyFactionMemberKill(killed.state, "hobbits", "mayor", authority("kill-mayor", 0)).reason, "duplicate");
  assert.equal(applyFactionMemberKill(killed.state, "hobbits", "mayor", { ...authority("bad-host", 1), authorityId: "guest" }).reason, "forbidden");
  relations = applyQuestAlignmentReward(killed.state, "hobbits", 9, authority("orchard-quest", 1)).state;
  assert.equal(relations.alignments.hobbits, -26);
  assert.equal(relations.recentEventIds.length, 2);
  for (let index = 0; index < 80; index += 1) {
    relations = applyQuestAlignmentReward(relations, "hobbits", 1, authority(`bounded-${index}`, relations.revision)).state;
  }
  assert.equal(relations.recentEventIds.length, 64, "retry protection stays bounded in long-running saves");
});

test("war and capture require explicit contracts, cleared defenders, and a living surrendered mayor", () => {
  let relations = createFactionRelations("host-a");
  relations = setDiplomacy(relations, "hobbits", "goblins", "war", authority("war-1", 0)).state;
  assert.equal(diplomacyBetween(relations, "hobbits", "goblins"), "war");
  assert.equal(factionsAreHostile(relations, "hobbits", "goblins"), true);
  const blocked = evaluateTownCapture(relations, {
    townId: "freehold-test", currentOwner: "hobbits", claimant: "player", livingWarriors: 1,
    livingMayor: true, mayorThreatened: true, claimantPresent: true,
  });
  assert.equal(blocked.reason, "warriors-remain");
  const ready = evaluateTownCapture(relations, {
    townId: "freehold-test", currentOwner: "hobbits", claimant: "player", livingWarriors: 0,
    livingMayor: true, mayorThreatened: true, claimantPresent: true,
  });
  assert.equal(ready.allowed, true);
  assert.equal(ready.receipt?.transferNonWarriors, true);
  const applied = applyTownCaptureConsequences(relations, ready.receipt!, authority(ready.receipt!.id, 1));
  assert.equal(applied.state.alignments.hobbits, -70);
  assert.equal(factionsAreHostile(applied.state, "player", "hobbits"), true);
  assert.equal(canTameAlignedCreature("goblins"), false);
  assert.equal(canTameAlignedCreature(null), true);
});

test("the gold wallet is exact, unbounded by item stacks, and JSON-saveable", () => {
  const enormous = "999999999999999999999999999999999999999999";
  const wallet = createGoldWallet("host-a", "player-a", enormous);
  assert.equal(wallet.balance, enormous);
  assert.equal(compareGold(wallet.balance, "64"), 1);
  assert.equal(normalizeGold("not-gold"), "0");
  assert.doesNotThrow(() => JSON.stringify(wallet));
});

test("merchants use arbitrary buy/sell inventory, finite purses, and profession demand", () => {
  let wallet = createGoldWallet("host-a", "player-a", 2_000);
  let merchant = createMerchant("host-a", "tapper-marnie", "hobbits", "brewer", 250);
  assert.equal(merchantOffersFor("hobbits", "brewer").some((offer) => offer.itemKey === "mead"), true);
  const mead = COMMERCE_CATALOG.mead;
  const plainDrink: CommerceItem = { key: "spring-water", name: "Spring Water", category: "drink", baseValue: mead.baseValue, stackLimit: 16 };
  assert.ok(quoteMerchantTrade(merchant, mead, 1, "player-sells").unitPrice > quoteMerchantTrade(merchant, plainDrink, 1, "player-sells").unitPrice);

  const bought = buyFromMerchant(wallet, merchant, "mead", 2, atomic("buy-mead", 0, 0));
  assert.equal(bought.applied, true);
  assert.equal(bought.item?.count, 2);
  wallet = bought.wallet;
  merchant = bought.merchant;

  const carvedStool: CommerceItem = { key: "carved-stool", name: "Carved Stool", category: "misc", baseValue: 20, stackLimit: 16 };
  const sold = sellToMerchant(wallet, merchant, carvedStool, 1, atomic("sell-stool", 1, 1));
  assert.equal(sold.applied, true);
  assert.equal(sold.merchant.inventory.some((stack) => stack.itemKey === "carved-stool"), true);
  assert.equal(sold.merchant.customCatalog["carved-stool"], carvedStool);
  const boughtBack = buyFromMerchant(sold.wallet, sold.merchant, "carved-stool", 1, atomic("buy-stool-back", 2, 2));
  assert.equal(boughtBack.applied, true, "arbitrary goods stay available for Skyrim-style buyback");

  const poorMerchant = createMerchant("host-a", "poor", "goblins", "general", 1);
  const rejected = sellToMerchant(createGoldWallet("host-a", "p", 0), poorMerchant, COMMERCE_CATALOG["cloudglass-relic"], 1, atomic("too-rich", 0, 0));
  assert.equal(rejected.reason, "merchant-cannot-pay");
});

test("merchant restocks are deterministic, bounded, and faction-specific", () => {
  const merchant = createMerchant("host-a", "goblin-smith", "goblins", "blacksmith", 5);
  const first = restockMerchant(merchant, 2, authority("restock", 0));
  const second = restockMerchant(merchant, 2, authority("restock", 0));
  assert.deepEqual(first, second);
  assert.equal(first.state.inventory.some((stack) => stack.itemKey === "goblin-spear"), true);
  assert.ok(first.state.inventory.length <= 48);
  assert.equal(restockMerchant(first.state, 3, authority("too-soon", 1)).applied, false);
});

test("Hearthkin banking compounds five percent daily with no balance cap or fee", () => {
  let wallet = createGoldWallet("host-a", "player-a", 1_000);
  let account = createBankAccount("host-a", "player-a", 0);
  const deposited = depositAtBank(wallet, account, 100, atomic("deposit", 0, 0));
  assert.equal(deposited.applied, true);
  wallet = deposited.wallet;
  account = deposited.account;
  const interest = compoundBankInterest(account, 2, authority("interest-day-2", 1));
  account = interest.state;
  assert.equal(account.balanceMicroGold, "110250000");
  assert.equal(bankBalanceWholeGold(account), "110");
  const withdrawn = withdrawFromBank(wallet, account, 10, atomic("withdraw", 1, 2));
  assert.equal(withdrawn.applied, true);
  assert.equal(withdrawn.wallet.balance, "910");
  assert.equal(withdrawn.account.balanceMicroGold, "100250000");
  assert.doesNotThrow(() => JSON.stringify(withdrawn));
});

test("fictional stocks are deterministic, volatile, upward-drifting, split, and trade without fees", () => {
  const buy = buyStock(createGoldWallet("host-a", "player-a", 100_000), createStockMarket("host-a", "player-a", "market-seed"), "BURR", 20, atomic("buy-burr", 0, 0));
  assert.equal(buy.applied, true);
  const initialValue = BigInt(stockPortfolioValueGold(buy.market));
  const advanced = stepStockMarket(buy.market, 2_000, authority("market-day-2000", 1));
  const replay = stepStockMarket(buy.market, 2_000, authority("market-day-2000", 1));
  assert.deepEqual(advanced, replay);
  assert.ok(BigInt(stockPortfolioValueGold(advanced.state)) > initialValue);
  assert.ok(advanced.state.quotes.BURR.splitCount > 0);
  const sold = sellStock(buy.wallet, advanced.state, "BURR", 1, atomic("sell-burr", 1, 2));
  assert.equal(sold.applied, true);
  assert.equal(BigInt(sold.wallet.balance) - BigInt(buy.wallet.balance), BigInt(sold.market.quotes.BURR.priceGold));
});

test("settlement candidates honor biome eligibility, sparse deterministic regions, and spacing", () => {
  assert.equal(settlementBiomeEligible("hobbits", "flower-meadow"), true);
  assert.equal(settlementBiomeEligible("goblins", "flower-meadow"), false);
  let candidate = null;
  for (let regionX = -8; regionX <= 8 && !candidate; regionX += 1) {
    candidate = planSettlementCandidate({ worldSeed: "candidate-seed", regionX, regionZ: 3, biome: "flower-meadow", existing: [] });
  }
  assert.ok(candidate);
  assert.deepEqual(planSettlementCandidate({ worldSeed: "candidate-seed", regionX: candidate!.regionX, regionZ: 3, biome: "flower-meadow", existing: [] }), candidate);
  assert.equal(hasSettlementSpacing(candidate!, [{ center: { x: candidate!.center.x + 10, z: candidate!.center.z }, size: "hamlet" }]), false);
});

test("layout plans make thematic, lit, walled towns with gates, paths, furniture, and soft population caps", () => {
  const hobbitLayout = planSettlementLayout(hobbitCandidate);
  const goblinLayout = planSettlementLayout(goblinCandidate);
  assert.deepEqual(planSettlementLayout(hobbitCandidate), hobbitLayout);
  assert.equal(hobbitLayout.buildings.some((building) => building.role === "bank"), true);
  assert.equal(hobbitLayout.buildings.some((building) => building.role === "brewery" && building.furniture.some((item) => item.kind === "distillery")), true);
  assert.equal(goblinLayout.buildings.some((building) => building.role === "warg-kennel"), true);
  assert.equal(goblinLayout.buildings.some((building) => building.role === "blacksmith"), true);
  assert.equal(hobbitLayout.gates.length, SETTLEMENT_SIZE_RULES.village.gateCount);
  assert.ok(hobbitLayout.wall.length > 40);
  assert.ok(hobbitLayout.paths.length > 20);
  assert.equal(hobbitLayout.lights.every((light) => light.monsterSafeRadius >= 8), true);
  assert.equal(hobbitLayout.populationSoftCap, calculatePopulationSoftCap(hobbitLayout.beds, hobbitLayout.doors, "village"));
  assert.ok(hobbitLayout.paths.length <= 512 && hobbitLayout.wall.length <= 144 && hobbitLayout.lights.length <= 32);
});

test("resident names, roles, equipment, waypoints, and Warg alignment are deterministic", () => {
  assert.equal(generateResidentName("hearthkin", "same"), generateResidentName("hearthkin", "same"));
  assert.notEqual(generateResidentName("hearthkin", "same"), generateResidentName("goblin", "same"));
  const hobbits = createSettlementState("host-a", hobbitCandidate);
  const goblins = createSettlementState("host-a", goblinCandidate);
  assert.ok(findRoleWaypoint(hobbits, "mayor"));
  assert.equal(hobbits.residents.filter((resident) => resident.profession === "warrior").some((resident) => resident.equipment.weapon === "crossbow"), true);
  assert.equal(goblins.residents.filter((resident) => resident.profession === "warrior").every((resident) => resident.equipment.weapon === "goblin-spear"), true);
  assert.equal(goblins.alignedCreatures.every((creature) => creature.kind === "warg" && !creature.tameable), true);
  assert.doesNotThrow(() => JSON.stringify(goblins));
});

test("daily schedules sleep, work, socialize, patrol, flee, and fight by role and danger", () => {
  const settlement = createSettlementState("host-a", hobbitCandidate);
  const civilian = settlement.residents.find((resident) => resident.profession === "farmer")!;
  const warrior = settlement.residents.find((resident) => resident.profession === "warrior")!;
  assert.equal(planResidentSchedule(civilian, settlement, { worldDay: 1, hour: 23, monsterVisible: false }).action, "sleep");
  assert.equal(planResidentSchedule(civilian, settlement, { worldDay: 1, hour: 10, monsterVisible: true }).action, "flee");
  assert.equal(planResidentSchedule({ ...civilian, health: 5 }, settlement, { worldDay: 1, hour: 10, monsterVisible: true }).action, "fight");
  assert.equal(planResidentSchedule(warrior, settlement, { worldDay: 1, hour: 2, monsterVisible: false }).action, "patrol-gate");
  assert.equal(planResidentSchedule(warrior, settlement, { worldDay: 1, hour: 10, monsterVisible: true }).action, "fight");
  const lived = Array.from({ length: 20 }, (_, day) => planResidentSchedule(civilian, settlement, { worldDay: day, hour: 19, monsterVisible: false }).action);
  assert.equal(lived.some((action) => action === "sit" || action === "socialize"), true);
});

test("a missing mayor is elected at 08:00 and population grows only with food and capacity", () => {
  const initial = createSettlementState("host-a", hobbitCandidate);
  const withoutMayor = { ...initial, residents: initial.residents.map((resident) => resident.profession === "mayor" ? { ...resident, alive: false } : resident) };
  assert.equal(electMayorAtEight(withoutMayor, 3, 7.99, authority("early-election", 0)).reason, "too-early");
  const election = electMayorAtEight(withoutMayor, 3, 8, authority("election", 0));
  assert.equal(election.applied, true);
  assert.equal(election.state.residents.filter((resident) => resident.alive && resident.profession === "mayor").length, 1);
  const grown = growSettlementPopulation(election.state, 3, authority("population", 1));
  assert.equal(grown.applied, true);
  assert.equal(grown.state.residents.length, election.state.residents.length + 1);
  assert.equal(grown.state.residents.at(-1)?.adult, false);
  assert.equal(growSettlementPopulation(grown.state, 3, authority("same-day", 2)).applied, false);
});

test("capture, hiring, command/equipment slots, and dynamic caravan spacing are save-friendly", () => {
  const relations = createFactionRelations("host-a");
  const receipt = evaluateTownCapture(relations, {
    townId: hobbitCandidate.id, currentOwner: "hobbits", claimant: "player", livingWarriors: 0,
    livingMayor: true, mayorThreatened: true, claimantPresent: true,
  }).receipt!;
  const settlement = createSettlementState("host-a", hobbitCandidate);
  const captured = applySettlementCapture(settlement, receipt, 9, authority(receipt.id, 0));
  assert.equal(captured.state.ownerFactionId, "player");
  assert.equal(captured.state.residents.filter((resident) => resident.profession !== "warrior").every((resident) => resident.factionId === "player"), true);

  const atWar = setDiplomacy(createFactionRelations("host-a"), "hobbits", "goblins", "war", authority("town-war", 0)).state;
  const goblinReceipt = evaluateTownCapture(atWar, {
    townId: hobbitCandidate.id, currentOwner: "hobbits", claimant: "goblins", livingWarriors: 0,
    livingMayor: true, mayorThreatened: true, claimantPresent: true,
  }).receipt!;
  const clanTaken = applySettlementCapture(settlement, goblinReceipt, 10, authority(goblinReceipt.id, 0));
  assert.equal(clanTaken.state.cultureRace, "goblin");
  assert.ok(clanTaken.state.alignedCreatures.length > 0, "new Goblin ownership seeds aligned gate Wargs");

  const hireTarget = settlement.residents.find((resident) => resident.profession === "farmer")!;
  assert.equal(hireResident(settlement, hireTarget.id, "player-a", 64, true, authority("low-alignment", 0)).reason, "alignment-too-low");
  const hired = hireResident(settlement, hireTarget.id, "player-a", 80, true, authority("hire", 0));
  assert.equal(hired.applied, true);
  const ordered = updateHirelingOrders(hired.state, hireTarget.id, { stance: "offensive", followDistance: 4.5 }, { weapon: "hearth-hammer" }, authority("orders", 1));
  const follower = ordered.state.residents.find((resident) => resident.id === hireTarget.id)!;
  assert.deepEqual(follower.orders, { stance: "offensive", follow: true, followDistance: 4.5, holdPosition: null });
  assert.equal(follower.equipment.weapon, "hearth-hammer");
  assert.ok(followerFormationSlot(5, 8, "dynamic").distance > followerFormationSlot(0, 1, "dynamic").distance);
  assert.equal(followerFormationSlot(0, 3, 0.25).distance, 1.5);
});

test("side-quest tables support achievable multi-criteria work, deadlines, abandonment, and physical giver rewards", () => {
  assert.ok(HOBBIT_SIDE_QUESTS.some((quest) => quest.criteria.length > 1 && quest.rewards.delivery === "giver-drops"));
  assert.ok(GOBLIN_SIDE_QUESTS.some((quest) => quest.failureConditions.includes("deadline")
    && quest.criteria.some((criterion) => criterion.kind === "deliver" && criterion.target === "raw-iron")));
  assert.equal([...HOBBIT_SIDE_QUESTS, ...GOBLIN_SIDE_QUESTS].every((quest) => quest.criteria.every((criterion) => criterion.kind !== "visit" && criterion.kind !== "protect")), true);
  assert.equal([...HOBBIT_SIDE_QUESTS, ...GOBLIN_SIDE_QUESTS].every((quest) => quest.abandonable), true);
  assert.deepEqual(sideQuestOffersFor("hobbits", "brewer", "freehold-test", 4), sideQuestOffersFor("hobbits", "brewer", "freehold-test", 4));
  assert.equal(merchantProfessionForResident("banker"), "banker");
});
