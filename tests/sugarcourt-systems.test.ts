import assert from "node:assert/strict";
import test from "node:test";
import { Item } from "../app/game/data.ts";
import {
  FACTION_IDS,
  FACTIONS,
  NPC_FACTION_IDS,
  applyFactionMemberKill,
  createFactionRelations,
  diplomacyBetween,
  factionAllowsRace,
  normalizeEnabledFactions,
  type AuthorityCommand,
} from "../app/game/factions.ts";
import {
  COMMERCE_CATALOG,
  SUGARCOURT_MERCHANT_OFFERS,
  createMerchant,
  merchantOffersFor,
  quoteMerchantTrade,
} from "../app/game/economy.ts";
import {
  SUGARCOURT_SIDE_QUESTS,
  createSettlementState,
  findRoleWaypoint,
  generateResidentName,
  isMayorProfession,
  isSugarcourtProfession,
  isWarriorProfession,
  planResidentSchedule,
  planSettlementCandidate,
  planSettlementLayout,
  settlementBiomeEligible,
  sideQuestOffersFor,
  type ResidentProfession,
  type SettlementCandidate,
} from "../app/game/settlements.ts";
import {
  blueprintForRecipe,
  createBlueprintState,
  useBlueprintItem,
} from "../app/game/blueprints.ts";
import {
  ALCHEMY_RECIPES,
  applyPotionEffect,
  createAlchemyStand,
  startAlchemyBatch,
  stepAlchemyStand,
} from "../app/game/alchemy.ts";
import {
  SUGARWORKS_RECIPES,
  collectSugarworksOutput,
  createSugarworks,
  normalizeSugarworks,
  startSugarworksBatch,
  stepSugarworks,
  sugarworksRecipe,
} from "../app/game/candyworks.ts";
import {
  COMMERCE_ITEM_CODES,
  POTION_RECIPE_BY_ITEM,
  commerceItemCode,
  commerceKeyForItem,
  resourceIdForItem,
  resourceItemCode,
} from "../app/game/hearthroads-adapter.ts";
import {
  DEFAULT_QUEST_DEFINITIONS,
  DEFAULT_QUESTLINES,
  SUGARCOURT_FACTION_QUESTS,
  SUGARCOURT_QUESTLINE,
  acceptQuest,
  applyQuestEvent,
  createQuestBook,
  questAvailability,
  turnInQuest,
} from "../app/game/quests.ts";

function authority(eventId: string, expectedRevision: number): AuthorityCommand {
  return { authorityId: "host-sugar", eventId, expectedRevision };
}

const sugarcourtCandidate: SettlementCandidate = {
  schema: 1,
  id: "bonbon-borough-test",
  worldSeed: "SUGARCOURT-TEST",
  regionX: 2,
  regionZ: -3,
  center: { x: 120, z: -90 },
  size: "town",
  factionId: "sugarcourt",
  biome: "sugarplum-vale",
  environment: "surface",
};

test("Sugarcourt is a complete surface faction with canonical world toggles and legacy-safe relations", () => {
  assert.deepEqual(FACTION_IDS, ["player", "hobbits", "goblins", "atlantians", "sugarcourt", "wood-elves", "dwarves"]);
  assert.deepEqual(NPC_FACTION_IDS, ["hobbits", "goblins", "atlantians", "sugarcourt", "wood-elves", "dwarves"]);
  assert.deepEqual(normalizeEnabledFactions(undefined), NPC_FACTION_IDS);
  assert.deepEqual(normalizeEnabledFactions([]), []);
  assert.deepEqual(normalizeEnabledFactions(["sugarcourt", "hobbits", "sugarcourt", "unknown"]), ["hobbits", "sugarcourt"]);
  assert.equal(FACTIONS.sugarcourt.name, "Sugarcourt Concord");
  assert.equal(FACTIONS.sugarcourt.race, "confectkin");
  assert.deepEqual(FACTIONS.sugarcourt.homeBiomes, ["sugarplum-vale"]);
  assert.equal(factionAllowsRace("player", "confectkin"), true);
  assert.equal(factionAllowsRace("sugarcourt", "wayfarer"), false);

  let relations = createFactionRelations("host-sugar");
  assert.equal(relations.alignments.sugarcourt, 0);
  assert.equal(diplomacyBetween(relations, "sugarcourt", "atlantians"), "neutral");
  relations = applyFactionMemberKill(relations, "sugarcourt", "sugarcourt-crown-confectioner", authority("crown-fell", 0)).state;
  assert.equal(relations.alignments.sugarcourt, -35);
});

test("Bonbon Borough candidates respect biome eligibility and explicit faction selection", () => {
  assert.equal(settlementBiomeEligible("sugarcourt", "sugarplum-vale"), true);
  assert.equal(settlementBiomeEligible("hobbits", "sugarplum-vale"), false);
  assert.equal(planSettlementCandidate({ worldSeed: "bonbon", regionX: 0, regionZ: 0, biome: "sugarplum-vale", existing: [], enabledFactions: [] }), null);
  let candidate: SettlementCandidate | null = null;
  for (let regionX = -24; regionX <= 24 && !candidate; regionX += 1) {
    candidate = planSettlementCandidate({ worldSeed: "bonbon", regionX, regionZ: 4, biome: "sugarplum-vale", existing: [], enabledFactions: ["sugarcourt"] });
  }
  assert.ok(candidate);
  assert.equal(candidate.factionId, "sugarcourt");
  assert.match(candidate.id, /^bonbon-borough-/u);
});

test("Bonbon Borough layouts are walled, inhabited, lit, and equipped for candy craft and companion care", () => {
  const layout = planSettlementLayout(sugarcourtCandidate);
  assert.deepEqual(planSettlementLayout(sugarcourtCandidate), layout);
  assert.equal(layout.topology, "walled-surface");
  assert.ok(layout.wall.length > 40);
  assert.ok(layout.gates.length > 0);
  assert.equal(layout.buildings.some((building) => building.role === "sugar-palace"), true);
  assert.equal(layout.buildings.some((building) => building.role === "sugarworks" && building.furniture.some((entry) => entry.kind === "sugarworks-kettle")), true);
  assert.equal(layout.buildings.some((building) => building.role === "taffy-kennel" && building.furniture.filter((entry) => entry.kind === "pet-bed").length === 2), true);
  assert.equal(layout.buildings.every((building) => building.materialPalette.some((material) => ["boiled-sugarbrick", "candywood", "sugar-glass", "wafer-plaster", "copper-kettle"].includes(material))), true);
  assert.ok(layout.beds > 0 && layout.doors > 0);
  assert.equal(layout.lights.every((light) => light.monsterSafeRadius >= 8), true);

  const settlement = createSettlementState("host-sugar", sugarcourtCandidate, layout);
  const expected: ResidentProfession[] = [
    "sugarcourt-crown-confectioner",
    "sugarcourt-gumdrop-gardener",
    "sugarcourt-sugarboiler",
    "sugarcourt-candysmith",
    "sugarcourt-sweetbroker",
    "sugarcourt-kennelkeeper",
    "sugarcourt-brittle-guard",
  ];
  assert.equal(settlement.residents.every((resident) => resident.race === "confectkin" && isSugarcourtProfession(resident.profession)), true);
  for (const profession of expected) assert.ok(findRoleWaypoint(settlement, profession));
  assert.equal(settlement.alignedCreatures.some((creature) => creature.kind === "taffy-hound" && !creature.tameable), true);
  assert.equal(settlement.alignedCreatures.some((creature) => creature.kind === "praline-cat" && !creature.tameable), true);
  assert.equal(settlement.alignedCreatures.every((creature) => creature.factionId === "sugarcourt"), true);
  assert.equal(isMayorProfession("sugarcourt-crown-confectioner"), true);
  assert.equal(isWarriorProfession("sugarcourt-brittle-guard"), true);
  assert.equal(generateResidentName("confectkin", "same"), generateResidentName("confectkin", "same"));
});

test("Sugarcourt residents work by role, sleep, patrol, and react to danger", () => {
  const settlement = createSettlementState("host-sugar", sugarcourtCandidate);
  const resident = (profession: ResidentProfession) => settlement.residents.find((entry) => entry.profession === profession)!;
  assert.equal(planResidentSchedule(resident("sugarcourt-brittle-guard"), settlement, { worldDay: 2, hour: 2, monsterVisible: false }).action, "patrol-gate");
  assert.equal(planResidentSchedule(resident("sugarcourt-sugarboiler"), settlement, { worldDay: 2, hour: 10, monsterVisible: false }).action, "boil-sugar");
  assert.equal(planResidentSchedule(resident("sugarcourt-candysmith"), settlement, { worldDay: 2, hour: 10, monsterVisible: false }).action, "shape-candy");
  assert.equal(planResidentSchedule(resident("sugarcourt-kennelkeeper"), settlement, { worldDay: 2, hour: 10, monsterVisible: false }).action, "tend-menagerie");
  assert.equal(planResidentSchedule(resident("sugarcourt-gumdrop-gardener"), settlement, { worldDay: 2, hour: 23, monsterVisible: false }).action, "sleep");
  assert.equal(planResidentSchedule(resident("sugarcourt-sweetbroker"), settlement, { worldDay: 2, hour: 10, monsterVisible: true }).action, "flee");
});

test("Sugarcourt merchants sell crops, finished equipment, blueprints, potions, and neutral companion orbs", () => {
  assert.ok(SUGARCOURT_MERCHANT_OFFERS.length >= 20);
  assert.equal(merchantOffersFor("sugarcourt", "sugarcourt-gumdrop-gardener").some((offer) => offer.itemKey === "peppermint-starts"), true);
  assert.equal(merchantOffersFor("sugarcourt", "sugarcourt-candysmith").some((offer) => offer.itemKey === "blueprint-sugarcourt-armor"), true);
  const kennel = merchantOffersFor("sugarcourt", "sugarcourt-kennelkeeper");
  assert.equal(kennel.some((offer) => offer.itemKey === "unaligned-taffy-hound-orb"), true);
  assert.equal(kennel.some((offer) => offer.itemKey === "unaligned-praline-cat-orb"), true);
  const smith = createMerchant("host-sugar", "smith", "sugarcourt", "sugarcourt-candysmith", 900);
  assert.ok(quoteMerchantTrade(smith, COMMERCE_CATALOG["candied-alloy"], 1, "player-sells").unitPrice > 0);
  assert.equal(COMMERCE_CATALOG["fondant-cuirass"].category, "armor");
});

test("Sugarcourt blueprints gate both potion formulas and every Sugarworks equipment pattern", () => {
  assert.equal(blueprintForRecipe("sugarcourt-rockcandy-saber"), "sugarcourt-arms");
  assert.equal(blueprintForRecipe("sugarcourt-fondant-cuirass"), "sugarcourt-armor");
  assert.equal(blueprintForRecipe("peppermint-rush"), "sugarcourt-peppermint-rush");
  assert.equal(blueprintForRecipe("marshmallow-ward"), "sugarcourt-marshmallow-ward");
  assert.equal(SUGARWORKS_RECIPES.length, 8);

  const locked = startSugarworksBatch(createSugarworks(), "sugarcourt-rockcandy-saber", {
    "candied-alloy": 4, "crystal-shard": 2, "lollipop-petal": 1,
  }, createBlueprintState());
  assert.equal(locked.reason, "blueprint-locked");
  const learnedArms = useBlueprintItem(createBlueprintState(), "sugarcourt-arms", 10).state;
  const started = startSugarworksBatch(createSugarworks(), "sugarcourt-rockcandy-saber", {
    "candied-alloy": 4, "crystal-shard": 2, "lollipop-petal": 1,
  }, learnedArms);
  assert.equal(started.ok, true);
  if (!started.ok) return;
  const finished = stepSugarworks(started.state, 999);
  assert.deepEqual(finished.output, { item: "rockcandy-saber", count: 1 });
  assert.deepEqual(collectSugarworksOutput(finished).collected, { item: "rockcandy-saber", count: 1 });

  const alloy = startSugarworksBatch(createSugarworks(), "sugarcourt-candied-alloy", {
    gumdrop: 4, "lollipop-petal": 2, "honey-jar": 1,
  }, createBlueprintState());
  assert.equal(alloy.ok, true);
  assert.deepEqual(sugarworksRecipe("sugarcourt-candied-alloy")?.output, { item: "candied-alloy", count: 2 });
  assert.deepEqual(normalizeSugarworks({ activeBatch: { recipeId: "missing", progressSeconds: 999 }, output: { item: "x", count: 999 } }).output, { item: "x", count: 64 });
});

test("Sugarcourt potions use physical blueprints and record their distinct timed wards", () => {
  const peppermint = ALCHEMY_RECIPES.find((recipe) => recipe.id === "peppermint-rush")!;
  const marshmallow = ALCHEMY_RECIPES.find((recipe) => recipe.id === "marshmallow-ward")!;
  assert.equal(peppermint.blueprintId, "sugarcourt-peppermint-rush");
  assert.equal(marshmallow.blueprintId, "sugarcourt-marshmallow-ward");
  assert.equal(startAlchemyBatch(createAlchemyStand(), peppermint.id, { "water-bottle": 1, "peppermint-cane": 2, gumdrop: 1 }, createBlueprintState()).reason, "blueprint-locked");
  const learned = useBlueprintItem(createBlueprintState(), "sugarcourt-peppermint-rush", 20).state;
  const started = startAlchemyBatch(createAlchemyStand(), peppermint.id, { "water-bottle": 1, "peppermint-cane": 2, gumdrop: 1 }, learned);
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.deepEqual(stepAlchemyStand(started.state, 999).output, { item: "peppermint-rush", count: 1 });
  const consumer = { health: 8, maxHealth: 10, fastTravelCharges: 0, buffs: {} };
  assert.equal(applyPotionEffect(consumer, "peppermint-rush", 100).buffs["peppermint-rush"], 280);
  assert.equal(applyPotionEffect(consumer, "marshmallow-ward", 100).buffs["marshmallow-ward"], 310);
});

test("Sugarcourt resources and commerce keys resolve to concrete inventory codes", () => {
  assert.equal(resourceItemCode("peppermint-cane"), Item.PeppermintCane);
  assert.equal(resourceIdForItem(Item.RockcandySaber), "rockcandy-saber");
  assert.equal(POTION_RECIPE_BY_ITEM[Item.PeppermintRush], "peppermint-rush");
  assert.equal(POTION_RECIPE_BY_ITEM[Item.MarshmallowWard], "marshmallow-ward");
  assert.equal(commerceItemCode("blueprint-sugarcourt-arms"), Item.SugarcourtArmsBlueprint);
  assert.equal(commerceItemCode("unaligned-taffy-hound-orb"), Item.CaptureOrb);
  assert.equal(COMMERCE_ITEM_CODES["unaligned-praline-cat-orb"], Item.CaptureOrb);
  assert.equal(commerceKeyForItem(Item.CaptureOrb), null, "filled-orb templates must not erase creature metadata during reverse commerce lookup");
});

test("Sugarcourt first contact, trade, and deterministic side quests join the default quest catalog", () => {
  assert.deepEqual(SUGARCOURT_QUESTLINE.questIds, SUGARCOURT_FACTION_QUESTS.map((quest) => quest.id));
  assert.equal(DEFAULT_QUEST_DEFINITIONS.some((quest) => quest.id === "sugarcourt-beyond-sugarwind"), true);
  assert.equal(DEFAULT_QUESTLINES.some((questline) => questline.id === SUGARCOURT_QUESTLINE.id), true);
  const first = SUGARCOURT_FACTION_QUESTS[0];
  const trade = SUGARCOURT_FACTION_QUESTS[1];
  let book = createQuestBook();
  assert.equal(questAvailability(book, first), "available");
  assert.equal(questAvailability(book, trade), "locked");
  book = acceptQuest(book, SUGARCOURT_FACTION_QUESTS, first.id, 0).book;
  book = applyQuestEvent(book, SUGARCOURT_FACTION_QUESTS, { type: "town-discovered", townId: "bonbon", factionId: "sugarcourt", at: 4 });
  const completed = turnInQuest(book, SUGARCOURT_FACTION_QUESTS, first.id, {}, 5);
  assert.equal(completed.ok, true);
  if (!completed.ok) return;
  assert.equal(completed.book.factionAlignment.sugarcourt, 5);
  assert.equal(questAvailability(completed.book, trade), "available");
  assert.equal(SUGARCOURT_SIDE_QUESTS.every((quest) => quest.factionId === "sugarcourt" && quest.criteria.length > 1), true);
  assert.deepEqual(
    sideQuestOffersFor("sugarcourt", "sugarcourt-sugarboiler", "bonbon", 7),
    sideQuestOffersFor("sugarcourt", "sugarcourt-sugarboiler", "bonbon", 7),
  );
});
