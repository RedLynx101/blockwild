import assert from "node:assert/strict";
import test from "node:test";
import {
  ALCHEMY_RECIPES,
  DISTILLERY_RECIPES,
  alchemyRecipe,
  applyPotionEffect,
  collectAlchemyOutput,
  collectDistilleryOutput,
  createAlchemyStand,
  createDistillery,
  normalizeAlchemyStand,
  normalizeDistillery,
  selectAlchemyRecipe,
  selectDistilleryRecipe,
  startAlchemyBatch,
  startDistilleryBatch,
  stepAlchemyStand,
  stepDistillery,
} from "../app/game/alchemy.ts";
import {
  BLUEPRINTS,
  blueprintCraftingLock,
  blueprintForRecipe,
  blueprintResaleValue,
  canCraftBlueprintRecipe,
  createBlueprintState,
  normalizeBlueprintState,
  useBlueprintItem,
} from "../app/game/blueprints.ts";
import {
  FAST_TRAVEL_CHANNEL_SECONDS,
  advanceFastTravelChannel,
  bankFastTravelCharges,
  beginFastTravel,
  chunkAtWorldPosition,
  clearBedSpawn,
  commitFastTravel,
  createCartographySession,
  createMapKnowledge,
  discoverNaturalPoi,
  fastTravelDestination,
  joinCartographySession,
  markChunkRendered,
  markChunksRendered,
  markWorldPositionRendered,
  normalizeMapKnowledge,
  placeManualMapMarker,
  placeWayshrine,
  renameWayshrine,
  setBedSpawn,
  shareMapsAtCartographyTable,
} from "../app/game/map-system.ts";
import {
  HEARTHROADS_MAIN_QUESTS,
  abandonQuest,
  acceptQuest,
  applyQuestEvent,
  createDeliverySideQuest,
  createQuestBook,
  normalizeQuestBook,
  pinQuest,
  questAvailability,
  questlineBranches,
  turnInQuest,
  type QuestDefinition,
} from "../app/game/quests.ts";

const point = (x: number, y = 30, z = 0) => ({ x, y, z });
const markerInput = (id: string, name: string, x: number, playerId: string, discoveredAt = 10) => ({
  id,
  name,
  position: point(x),
  playerId,
  discoveredAt,
});

test("blueprint items teach once, keep duplicate resale value, and gate every linked recipe", () => {
  const blank = createBlueprintState();
  assert.equal(blueprintForRecipe("hearthguard-crossbow"), "hobbit-crossbow");
  assert.equal(blueprintForRecipe("crossbow-bolts"), "hobbit-crossbow");
  assert.equal(canCraftBlueprintRecipe(blank, "hearthguard-crossbow"), false);
  assert.match(blueprintCraftingLock(blank, "crossbow-bolts")!.message, /Hearthguard Crossbow Blueprint/u);

  const learned = useBlueprintItem(blank, "hobbit-crossbow", 150);
  assert.equal(learned.outcome, "learned");
  assert.equal(learned.consumeItem, true);
  assert.equal(canCraftBlueprintRecipe(learned.state, "hearthguard-crossbow"), true);
  assert.equal(canCraftBlueprintRecipe(learned.state, "crossbow-bolts"), true);
  assert.deepEqual(blank.unlocked, [], "the caller's save object remains untouched");

  const duplicate = useBlueprintItem(learned.state, "hobbit-crossbow", 999);
  assert.equal(duplicate.outcome, "already-known");
  assert.equal(duplicate.consumeItem, false);
  assert.equal(duplicate.resaleGold, blueprintResaleValue("hobbit-crossbow"));
  assert.ok(duplicate.resaleGold >= 50, "duplicate finds remain worthwhile loot");
});

test("blueprint migration normalizes malformed and duplicate knowledge deterministically", () => {
  const normalized = normalizeBlueprintState({
    schema: 99,
    unlocked: ["mead-distilling", "mead-distilling", "goblin-spear", 7],
    unlockedAt: { "mead-distilling": -4, "goblin-spear": 80 },
  });
  assert.deepEqual(normalized.unlocked, ["goblin-spear", "mead-distilling"]);
  assert.deepEqual(normalized.unlockedAt, { "goblin-spear": 80, "mead-distilling": 0 });
  assert.equal(BLUEPRINTS.some((definition) => definition.id === "hobbit-hearthward-tonic"), true);
  assert.equal(BLUEPRINTS.some((definition) => definition.id === "goblin-gloamstep-elixir"), true);
});

test("a chunk becomes explored on its first render, including negative world coordinates", () => {
  const blank = createMapKnowledge("hearthroads", "noah");
  assert.deepEqual(chunkAtWorldPosition({ x: -0.1, z: -16.1 }), { x: -1, z: -2 });
  const explored = markWorldPositionRendered(blank, { x: -0.1, z: -16.1 });
  assert.deepEqual(explored.exploredChunks, ["-1,-2"]);
  assert.equal(explored.revision, 1);
  const repeated = markChunkRendered(explored, { x: -1, z: -2 });
  assert.deepEqual(repeated, explored, "rendering an already-known chunk is idempotent");
  assert.deepEqual(blank.exploredChunks, []);
});

test("render-distance map discovery batches many chunks into one revision", () => {
  const initial = createMapKnowledge("world-a", "player-a");
  const chunks = Array.from({ length: 441 }, (_, index) => ({ x: index % 21 - 10, z: Math.floor(index / 21) - 10 }));
  const explored = markChunksRendered(initial, chunks);
  assert.equal(explored.revision, initial.revision + 1);
  assert.equal(explored.exploredChunks.length, 441);
  assert.strictEqual(markChunksRendered(explored, chunks), explored);
});

test("map markers distinguish POIs, personal bed spawns, manual notes, and renamable wayshrines", () => {
  let map = createMapKnowledge("hearthroads", "noah");
  map = discoverNaturalPoi(map, markerInput("poi-apiary", "Old Apiary", 32, "noah"));
  map = placeManualMapMarker(map, markerInput("manual-camp", "Good camp", 4, "noah"));
  map = setBedSpawn(map, markerInput("bed-noah", "Home Bed", 0, "noah"));
  map = placeWayshrine(map, markerInput("shrine-oak", "Old Oak", 80, "noah"));
  map = renameWayshrine(map, "shrine-oak", "Oakway Hearth", 25);

  assert.equal(fastTravelDestination(map, "poi-apiary")?.kind, "natural-poi");
  assert.equal(fastTravelDestination(map, "bed-noah")?.kind, "bed-spawn");
  assert.equal(fastTravelDestination(map, "manual-camp"), null, "manual notes never become travel points");
  assert.equal(map.markers.find((marker) => marker.id === "shrine-oak")?.name, "Oakway Hearth");
  const withoutBed = clearBedSpawn(map);
  assert.equal(withoutBed.activeBedId, null);
  assert.equal(fastTravelDestination(withoutBed, "bed-noah"), null);
});

test("a two-seat cartography table shares exploration and public markers without sharing private state", () => {
  let left = markChunkRendered(createMapKnowledge("shared-world", "left"), { x: 0, z: 0 });
  left = setBedSpawn(left, markerInput("left-bed", "Left Bed", 1, "left"));
  left = placeManualMapMarker(left, markerInput("berry-patch", "Berry patch", 12, "left"));
  left = bankFastTravelCharges(left, 2);

  let right = markChunkRendered(createMapKnowledge("shared-world", "right"), { x: 4, z: -3 });
  right = setBedSpawn(right, markerInput("right-bed", "Right Bed", 90, "right"));
  right = discoverNaturalPoi(right, markerInput("forest-temple", "Forest Temple", 70, "right"));
  right = placeWayshrine(right, markerInput("east-shrine", "East Shrine", 100, "right"));
  right = bankFastTravelCharges(right, 7);

  let session = createCartographySession("table-1", "left");
  const joined = joinCartographySession(session, "right");
  assert.equal(joined.joined, true);
  session = joined.session;
  assert.equal(joinCartographySession(session, "third").reason, "table-full");

  const shared = shareMapsAtCartographyTable(session, "left", left, "right", right);
  assert.equal(shared.ok, true);
  assert.deepEqual(shared.left.exploredChunks, ["0,0", "4,-3"]);
  assert.deepEqual(shared.right.exploredChunks, ["0,0", "4,-3"]);
  assert.equal(shared.left.markers.some((marker) => marker.id === "forest-temple"), true);
  assert.equal(shared.right.markers.some((marker) => marker.id === "berry-patch"), true);
  assert.equal(shared.left.markers.some((marker) => marker.id === "right-bed"), false);
  assert.equal(shared.right.markers.some((marker) => marker.id === "left-bed"), false);
  assert.equal(shared.left.fastTravelCharges, 2);
  assert.equal(shared.right.fastTravelCharges, 7);
  assert.equal(shared.left.activeBedId, "left-bed");
  assert.equal(shared.right.activeBedId, "right-bed");
});

test("charged fast travel requires five still, damage-free seconds and spends only on commit", () => {
  let map = discoverNaturalPoi(createMapKnowledge("world", "traveler"), markerInput("poi", "Temple", 48, "traveler"));
  map = bankFastTravelCharges(map, 1);
  const begun = beginFastTravel(map, { id: "travel-1", mode: "map-charge", destinationId: "poi" }, point(0), 100, 4);
  assert.equal(begun.ok, true);
  if (!begun.ok) return;
  assert.equal(advanceFastTravelChannel(begun.channel, point(0), 100 + FAST_TRAVEL_CHANNEL_SECONDS - 0.01, 4).status, "channeling");
  const completed = advanceFastTravelChannel(begun.channel, point(0), 105, 4);
  assert.equal(completed.status, "completed");
  assert.equal(map.fastTravelCharges, 1, "channeling never spends a potion early");
  const committed = commitFastTravel(map, completed);
  assert.equal(committed.ok, true);
  if (committed.ok) {
    assert.equal(committed.state.fastTravelCharges, 0);
    assert.deepEqual(committed.position, point(48));
  }

  const moved = advanceFastTravelChannel(begun.channel, point(0.2), 102, 4);
  assert.deepEqual([moved.status, moved.cancelledReason], ["cancelled", "moved"]);
  const damaged = advanceFastTravelChannel(begun.channel, point(0), 102, 5);
  assert.deepEqual([damaged.status, damaged.cancelledReason], ["cancelled", "damaged"]);
  assert.equal(commitFastTravel(map, moved).ok, false);
});

test("wayshrines form a free network only when used at a known shrine", () => {
  let map = createMapKnowledge("world", "traveler");
  map = placeWayshrine(map, markerInput("west", "West Shrine", 0, "traveler"));
  map = placeWayshrine(map, markerInput("east", "East Shrine", 100, "traveler"));
  const far = beginFastTravel(map, { id: "far", mode: "wayshrine-network", originWayshrineId: "west", destinationId: "east" }, point(9), 0, 0);
  assert.equal(far.ok, false);
  const begun = beginFastTravel(map, { id: "free", mode: "wayshrine-network", originWayshrineId: "west", destinationId: "east" }, point(1), 0, 0);
  assert.equal(begun.ok, true);
  if (!begun.ok) return;
  const committed = commitFastTravel(map, advanceFastTravelChannel(begun.channel, point(1), 5, 0));
  assert.equal(committed.ok, true);
  if (committed.ok) {
    assert.equal(committed.chargeSpent, 0);
    assert.equal(committed.state.fastTravelCharges, 0);
  }
});

test("map migration removes malformed entries and clamps player resources", () => {
  const map = normalizeMapKnowledge({
    schema: 400,
    worldId: "world",
    playerId: "player",
    revision: -5,
    exploredChunks: ["0,0", "0,0", "bad"],
    markers: [{ id: "manual", kind: "manual", name: "  Note  ", position: { x: Number.NaN, y: 2, z: 4 }, discoveredAt: -2 }],
    activeBedId: "missing",
    fastTravelCharges: 9_999,
  });
  assert.deepEqual(map.exploredChunks, ["0,0"]);
  assert.equal(map.markers[0]?.position.x, 0);
  assert.equal(map.activeBedId, null);
  assert.equal(map.fastTravelCharges, 999);
});

test("the opening main quest branches after day one and keeps rewards claim-based", () => {
  let book = createQuestBook();
  const first = HEARTHROADS_MAIN_QUESTS.find((quest) => quest.id === "main-first-dawn")!;
  const five = HEARTHROADS_MAIN_QUESTS.find((quest) => quest.id === "main-five-campfires")!;
  const town = HEARTHROADS_MAIN_QUESTS.find((quest) => quest.id === "main-lanterns-on-the-road")!;
  assert.equal(questAvailability(book, first), "available");
  assert.equal(questAvailability(book, five), "locked");
  assert.equal(questAvailability(book, town), "locked");

  const accepted = acceptQuest(book, HEARTHROADS_MAIN_QUESTS, first.id, 0);
  assert.equal(accepted.ok, true);
  book = accepted.book;
  book = pinQuest(book, first.id);
  book = applyQuestEvent(book, HEARTHROADS_MAIN_QUESTS, { type: "day-reached", day: 1, at: 100 });
  assert.equal(questAvailability(book, first), "ready");
  assert.equal(book.pinnedQuestId, first.id);
  const completed = turnInQuest(book, HEARTHROADS_MAIN_QUESTS, first.id, {}, 101);
  assert.equal(completed.ok, true);
  if (!completed.ok) return;
  book = completed.book;
  assert.equal(completed.rewardDelivery, "quest-menu");
  assert.equal(book.pinnedQuestId, null);
  assert.equal(questAvailability(book, five), "available");
  assert.equal(questAvailability(book, town), "available");
  const branches = questlineBranches(HEARTHROADS_MAIN_QUESTS, "hearthroads-main").find((entry) => entry.questId === first.id)!;
  assert.deepEqual(new Set(branches.unlocks), new Set([five.id, town.id]));
});

test("multiple quest criteria advance independently and giver hand-in atomically consumes deliveries", () => {
  const delivery: QuestDefinition = {
    id: "side-pantry-and-pests",
    questlineId: "side-hobbit-hearth",
    kind: "side",
    name: "Pantry and Pests",
    summary: "Bring apples and deal with the shadecrawlers by the root cellar.",
    objectives: [
      { id: "apples", label: "Deliver 3 apples", kind: "deliver-item", itemId: "apple", count: 3 },
      { id: "pests", label: "Defeat 2 Shadecrawlers", kind: "kill", mobKind: "shadecrawler", count: 2 },
    ],
    giver: { role: "farmer", factionId: "hobbits", failOnDeath: true },
    rewards: { gold: 14, items: [{ itemId: "moonberry", count: 2 }], blueprints: [], factionAlignment: { hobbits: 4 } },
    abandonable: true,
  };
  let book = acceptQuest(createQuestBook(), [delivery], delivery.id, 5, "farmer-pip").book;
  book = applyQuestEvent(book, [delivery], { type: "mob-killed", mobKind: "shadecrawler", count: 2, at: 8 });
  assert.equal(book.active[0]?.status, "ready");
  assert.equal(turnInQuest(book, [delivery], delivery.id, { apple: 3 }, 10, "wrong-farmer").reason, "wrong-giver");
  assert.equal(turnInQuest(book, [delivery], delivery.id, { apple: 2 }, 10, "farmer-pip").reason, "delivery-items-missing");
  const turnedIn = turnInQuest(book, [delivery], delivery.id, { apple: 5, stick: 1 }, 10, "farmer-pip");
  assert.equal(turnedIn.ok, true);
  if (!turnedIn.ok) return;
  assert.deepEqual(turnedIn.inventory, { apple: 2, stick: 1 });
  assert.deepEqual(turnedIn.consumed, { apple: 3 });
  assert.equal(turnedIn.book.factionAlignment.hobbits, 4);
  assert.equal(turnedIn.rewardDelivery, "giver-drop");
});

test("giver death and deadlines can fail quests, while only side quests can be abandoned", () => {
  const side = createDeliverySideQuest({
    id: "side-mead-run",
    name: "A Cask Before Sundown",
    summary: "Bring a sealed bottle to the innkeeper.",
    giverRole: "innkeeper",
    giverFactionId: "hobbits",
    itemId: "honeymead",
    count: 1,
    gold: 9,
    alignment: 2,
  });
  let book = acceptQuest(createQuestBook(), [side], side.id, 0, "innkeeper-ivy").book;
  book = pinQuest(book, side.id);
  const failed = applyQuestEvent(book, [side], { type: "entity-died", entityId: "innkeeper-ivy", role: "innkeeper", at: 4 });
  assert.equal(questAvailability(failed, side), "failed");
  assert.equal(failed.pinnedQuestId, null);

  book = acceptQuest(createQuestBook(), [side], side.id, 0, "innkeeper-ivy").book;
  const abandoned = abandonQuest(book, [side], side.id);
  assert.equal(abandoned.ok, true);
  assert.equal(questAvailability(abandoned.book, side), "abandoned");

  const main = HEARTHROADS_MAIN_QUESTS[0];
  const mainBook = acceptQuest(createQuestBook(), [main], main.id, 0).book;
  assert.equal(abandonQuest(mainBook, [main], main.id).reason, "cannot-abandon");
});

test("quest migration sanitizes duplicate histories, invalid pins, progress, and faction bounds", () => {
  const normalized = normalizeQuestBook({
    schema: 200,
    active: [{ questId: "q", status: "nonsense", acceptedAt: -5, objectiveProgress: { step: -3 } }],
    completed: ["done", "done"],
    failed: [{ questId: "lost", failedAt: -1, reason: "oops" }],
    abandoned: ["old", "old"],
    pinnedQuestId: "not-active",
    factionAlignment: { hobbits: 99_999, goblins: -99_999 },
  });
  assert.equal(normalized.active[0]?.status, "active");
  assert.equal(normalized.active[0]?.objectiveProgress.step, 0);
  assert.deepEqual(normalized.completed, ["done"]);
  assert.equal(normalized.pinnedQuestId, null);
  assert.deepEqual(normalized.factionAlignment, { hobbits: 10_000, goblins: -10_000 });
});

test("alchemy registers water, healing, travel, faction, and Tidebreath formulas", () => {
  assert.equal(ALCHEMY_RECIPES.some((recipe) => recipe.id === "fill-water-bottle"), true);
  assert.equal(alchemyRecipe("appleheart-potion")?.inputs.some((input) => input.item === "apple"), true);
  assert.equal(alchemyRecipe("wayfarer-draught")?.effect?.kind, "bank-fast-travel");
  assert.equal(alchemyRecipe("hearthward-tonic")?.blueprintId, "hobbit-hearthward-tonic");
  assert.equal(alchemyRecipe("gloamstep-elixir")?.blueprintId, "goblin-gloamstep-elixir");
  assert.deepEqual(alchemyRecipe("tidebreath-philter")?.inputs.map((input) => input.item), ["water-bottle", "lumen-kelp-frond", "abyss-bloom-nectar"]);
  assert.deepEqual(alchemyRecipe("tidebreath-philter")?.effect, { kind: "timed-buff", buff: "tidebreath", durationSeconds: 300 });
  assert.deepEqual(alchemyRecipe("manaheart-draught")?.inputs, [
    { item: "water-bottle", count: 1 },
    { item: "raw-gold", count: 4 },
    { item: "dragon-heart", count: 1, alternatives: ["fire-dragon-heart", "ice-dragon-heart", "steel-dragon-heart"] },
  ]);
  assert.deepEqual(alchemyRecipe("manaheart-draught")?.output, { item: "manaheart-draught", count: 1 });
  assert.deepEqual(DISTILLERY_RECIPES.map((recipe) => recipe.id), ["honeymead-batch"]);
});

test("Manaheart Draught accepts and consumes exactly one heart of any dragon type", () => {
  for (const heart of ["fire-dragon-heart", "ice-dragon-heart", "steel-dragon-heart"]) {
    const inventory = { "water-bottle": 1, "raw-gold": 4, [heart]: 1 };
    const started = startAlchemyBatch(createAlchemyStand(), "manaheart-draught", inventory, createBlueprintState());
    assert.equal(started.ok, true, heart);
    if (!started.ok) continue;
    assert.deepEqual(started.inventory, {}, `${heart} should be reserved with the bottle and raw gold`);
    const finished = stepAlchemyStand(started.state, 90);
    assert.deepEqual(finished.output, { item: "manaheart-draught", count: 1 });
  }

  const missingHeart = startAlchemyBatch(
    createAlchemyStand(),
    "manaheart-draught",
    { "water-bottle": 1, "raw-gold": 4 },
    createBlueprintState(),
  );
  assert.equal(missingHeart.reason, "missing-inputs");
});

test("water filling reserves a bottle but treats the adjacent source as a catalyst", () => {
  const blankBlueprints = createBlueprintState();
  const started = startAlchemyBatch(createAlchemyStand(), "fill-water-bottle", { "glass-bottle": 2, "water-source": 1 }, blankBlueprints);
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.deepEqual(started.inventory, { "glass-bottle": 1, "water-source": 1 });
  const finished = stepAlchemyStand(started.state, 1);
  assert.deepEqual(finished.output, { item: "water-bottle", count: 1 });
  const collected = collectAlchemyOutput(finished);
  assert.deepEqual(collected.collected, { item: "water-bottle", count: 1 });
  assert.equal(collected.state.output, null);
});

test("potion use heals, banks one map journey, and records timed buffs without shortening them", () => {
  const base = { health: 3, maxHealth: 10, fastTravelCharges: 0, buffs: { hearthward: 500 } };
  assert.equal(applyPotionEffect(base, "appleheart-potion", 100).health, 10);
  assert.equal(applyPotionEffect(base, "wayfarer-draught", 100).fastTravelCharges, 1);
  const buffed = applyPotionEffect(base, "hearthward-tonic", 100);
  assert.equal(buffed.buffs.hearthward, 500, "drinking another tonic cannot shorten an existing ward");
  assert.equal(applyPotionEffect(base, "gloamstep-elixir", 100).buffs.gloamstep, 340);
  assert.equal(applyPotionEffect(base, "tidebreath-philter", 100).buffs.tidebreath, 400);
});

test("faction potions stay locked until their physical blueprint is learned", () => {
  const ingredients = { "water-bottle": 1, apple: 1, "honey-jar": 1, cloudbell: 1 };
  const locked = startAlchemyBatch(createAlchemyStand(), "hearthward-tonic", ingredients, createBlueprintState());
  assert.equal(locked.reason, "blueprint-locked");
  const learned = useBlueprintItem(createBlueprintState(), "hobbit-hearthward-tonic", 20).state;
  const started = startAlchemyBatch(createAlchemyStand(), "hearthward-tonic", ingredients, learned);
  assert.equal(started.ok, true);
  if (!started.ok) return;
  const halfway = stepAlchemyStand(started.state, 18);
  assert.equal(halfway.activeBatch?.progressSeconds, 18);
  assert.equal(halfway.output, null);
  assert.deepEqual(stepAlchemyStand(halfway, 18).output, { item: "hearthward-tonic", count: 1 });
});

test("a selected distillery recipe ferments a blueprint-gated four-bottle mead batch", () => {
  const selected = selectAlchemyRecipe(createAlchemyStand(), "wayfarer-draught");
  assert.equal(selected.selectedRecipeId, "wayfarer-draught");
  const barrel = selectDistilleryRecipe(createDistillery(), "honeymead-batch");
  assert.equal(barrel.selectedRecipeId, "honeymead-batch");
  const ingredients = { "water-bottle": 2, "honey-jar": 3, "wild-wheat": 2 };
  assert.equal(startDistilleryBatch(barrel, "honeymead-batch", ingredients, createBlueprintState()).reason, "blueprint-locked");
  const learned = useBlueprintItem(createBlueprintState(), "mead-distilling", 1).state;
  const started = startDistilleryBatch(barrel, "honeymead-batch", ingredients, learned);
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.deepEqual(started.inventory, {});
  const done = stepDistillery(started.state, 240);
  assert.deepEqual(done.output, { item: "honeymead", count: 4 });
  const partial = collectDistilleryOutput(done, 2);
  assert.deepEqual(partial.collected, { item: "honeymead", count: 2 });
  assert.deepEqual(partial.state.output, { item: "honeymead", count: 2 });
});

test("station migration rejects unknown work and clamps corrupt progress/output", () => {
  const stand = normalizeAlchemyStand({
    schema: 200,
    selectedRecipeId: "missing",
    activeBatch: { recipeId: "appleheart-potion", progressSeconds: 999_999, durationSeconds: Number.NaN },
    output: { item: "appleheart-potion", count: 999 },
  });
  assert.equal(stand.selectedRecipeId, null);
  assert.equal(stand.activeBatch?.progressSeconds, alchemyRecipe("appleheart-potion")?.brewSeconds);
  assert.equal(stand.output?.count, 64);
  const barrel = normalizeDistillery({ activeBatch: { recipeId: "unknown", progressSeconds: 2 }, output: { item: "", count: 4 } });
  assert.equal(barrel.activeBatch, null);
  assert.equal(barrel.output, null);
});
