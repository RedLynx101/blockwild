import assert from "node:assert/strict";
import test from "node:test";
import { TCG_CATALOG, defaultPrintingForDefinition } from "../app/game/tcg/catalog.ts";
import {
  acceptTcgTrade,
  allocateTcgLooseCards,
  archiveTcgDuplicates,
  claimTcgStarter,
  createTcgTrade,
  createTcgWorldState,
  depositTcgLooseCards,
  grantTcgPrintings,
  moveTcgCards,
  normalizeTcgWorldState,
  totalTcgHolding,
  upgradeTcgArchive,
} from "../app/game/tcg/collection.ts";
import { buyFromTcgMerchant, restockTcgMerchant, simulateTcgPackEconomy } from "../app/game/tcg/market.ts";
import { completeTcgTutorialMatch, startTcgTutorialMatch } from "../app/game/tcg/match.ts";
import { TCG_FULL_ART_BONUS_RATE, collateTcgPack, issueTcgPackBatch, openTcgPack, tcgPackOdds } from "../app/game/tcg/packs.ts";

test("starter and booster grants are deterministic, duplicate-aware, and replay-safe", () => {
  const blank = createTcgWorldState("world:cardforge:test");
  assert.equal(claimTcgStarter(blank, "alice", "starter:early", 90).reason, "tutorial-incomplete");
  const lesson = startTcgTutorialMatch(blank, "alice", "tutorial:start", "Alice", 95);
  assert.equal(lesson.applied, true);
  const terminal = Object.freeze({ ...lesson.match!, phase: "complete" as const, winnerId: "alice", reason: "resolve" as const });
  const lessonWorld = Object.freeze({
    ...lesson.state,
    activeMatches: Object.freeze({ ...lesson.state.activeMatches, [terminal.id]: terminal }),
  });
  const starter = completeTcgTutorialMatch(lessonWorld, "alice", terminal.id, "tutorial:complete", 100);
  assert.equal(starter.applied, true);
  assert.equal(starter.player.tutorial.starterClaimed, true);
  assert.equal(starter.player.decks[0].printingIds.length, 30);
  assert.equal(claimTcgStarter(starter.state, "alice", "starter:again", 101).applied, false);

  const issued = issueTcgPackBatch(starter.state, "alice", "wildroads-booster", 2, "test", "packs:event");
  assert.equal(issued.applied, true);
  assert.equal(issueTcgPackBatch(issued.state, "alice", "wildroads-booster", 2, "test", "packs:event").reason, "duplicate");
  const expected = collateTcgPack("wildroads-booster", `${issued.state.authorityId}|${issued.batch!.id}|0`);
  assert.equal(expected.length, 5);
  const opened = openTcgPack(issued.state, "alice", issued.batch!.id, "open:event", issued.player.revision, 200);
  assert.equal(opened.applied, true);
  assert.deepEqual(opened.printingIds, expected);
  assert.equal(openTcgPack(opened.state, "alice", issued.batch!.id, "open:event", opened.player.revision, 201).reason, "duplicate");

  for (const printingId of opened.printingIds) assert.ok(totalTcgHolding(opened.player, printingId) >= 1);
  const printingId = opened.printingIds[0];
  const moved = moveTcgCards(opened.state, "alice", printingId, 1, "physical", "archived", "archive:event");
  assert.equal(moved.applied, true);
  assert.equal(totalTcgHolding(moved.player, printingId), totalTcgHolding(opened.player, printingId));
});

test("merchant stock and custody transactions are deterministic and atomic", () => {
  const input = { merchantId: "town:cardwright", factionId: "hobbits", profession: "cardwright", worldDay: 7, seed: "same-world" };
  const left = restockTcgMerchant(createTcgWorldState("market-world"), input);
  const right = restockTcgMerchant(createTcgWorldState("market-world"), input);
  assert.deepEqual(left.merchant, right.merchant);
  assert.ok(left.merchant.entries.length >= 8);
  const entry = left.merchant.entries[0];
  const purchased = buyFromTcgMerchant(left.state, "buyer", left.merchant.merchantId, entry.id, 1, "999999", "buy:event");
  assert.equal(purchased.applied, true);
  assert.ok(BigInt(purchased.balance) < BigInt(999999));
  assert.equal(buyFromTcgMerchant(purchased.state, "buyer", left.merchant.merchantId, entry.id, 1, "999999", "buy:event").reason, "duplicate");
});

test("trade escrow locks exact copies, commits once, and normalization cancels overdrawn locks", () => {
  let world = createTcgWorldState("trade-world");
  const printing = defaultPrintingForDefinition("card:authored:field-notes")!;
  world = grantTcgPrintings(world, "alice", [printing.id, printing.id], "alice:cards", { location: "physical" }).state;
  world = grantTcgPrintings(world, "bob", [printing.id], "bob:cards", { location: "physical" }).state;
  const offered = createTcgTrade(world, "alice", "bob", [{ printingId: printing.id, count: 1, location: "physical" }], "trade:offer", 100);
  assert.equal(offered.applied, true);
  const second = createTcgTrade(offered.state, "alice", "bob", [{ printingId: printing.id, count: 2, location: "physical" }], "trade:overlock", 101);
  assert.equal(second.applied, false);
  const committed = acceptTcgTrade(offered.state, offered.trade!.id, "bob", "trade:accept", 110);
  assert.equal(committed.applied, true);
  assert.equal(totalTcgHolding(committed.state.players.alice, printing.id), 1);
  assert.equal(totalTcgHolding(committed.state.players.bob, printing.id), 2);
  assert.equal(acceptTcgTrade(committed.state, offered.trade!.id, "bob", "trade:accept-again", 111).applied, false);

  const corrupt = {
    ...offered.state,
    merchantStock: {
      broken: { schema: 99, merchantId: "", entries: [{ kind: "card", printingId: "unknown", quantity: -4 }] },
    },
    activeTrades: {
      [offered.trade!.id]: {
        ...offered.trade,
        initiatorAssets: [{ printingId: printing.id, count: 4096, location: "physical" }],
      },
      invalid: { initiatorId: "missing", recipientId: "bob" },
    },
    activeMatches: { invalid: { players: [] } },
    challenges: { invalid: { challengerId: "missing", recipientId: "bob" } },
  };
  const normalized = normalizeTcgWorldState(corrupt, "trade-world", TCG_CATALOG);
  assert.equal(normalized.activeTrades[offered.trade!.id].status, "cancelled");
  assert.equal(normalized.activeTrades.invalid, undefined);
  assert.equal(normalized.activeMatches.invalid, undefined);
  assert.equal(normalized.challenges.invalid, undefined);
  assert.equal(normalized.merchantStock.broken, undefined);
  assert.ok(normalized.recoveryIssues.some((issue) => issue.includes("overdrawn-cancelled")));
  assert.ok(normalized.recoveryIssues.some((issue) => issue.includes("merchant:broken")));

  const requestedPrinting = defaultPrintingForDefinition("card:authored:hearthmeal")!;
  let reciprocalWorld = grantTcgPrintings(committed.state, "alice", [printing.id], "reciprocal:alice", { location: "physical" }).state;
  reciprocalWorld = grantTcgPrintings(reciprocalWorld, "bob", [requestedPrinting.id], "reciprocal:bob", { location: "physical" }).state;
  const reciprocal = createTcgTrade(
    reciprocalWorld,
    "alice",
    "bob",
    [{ printingId: printing.id, count: 1, location: "physical" }],
    "trade:reciprocal",
    200,
    [{ printingId: requestedPrinting.id, count: 1, location: "physical" }],
  );
  assert.equal(reciprocal.applied, true);
  const swapped = acceptTcgTrade(reciprocal.state, reciprocal.trade!.id, "bob", "trade:reciprocal:accept", 201);
  assert.equal(swapped.applied, true);
  assert.equal(totalTcgHolding(swapped.state.players.alice, requestedPrinting.id), 1);
  assert.equal(totalTcgHolding(swapped.state.players.bob, printing.id), 3);
});

test("physical loose-card custody and bulk archive preserve exact totals", () => {
  const printing = defaultPrintingForDefinition("card:authored:field-notes")!;
  let world = grantTcgPrintings(
    createTcgWorldState("custody-world"),
    "alice",
    Array.from({ length: 900 }, () => printing.id),
    "custody:grant",
    { location: "physical" },
  ).state;
  const before = totalTcgHolding(world.players.alice, printing.id);
  const allocated = allocateTcgLooseCards(world, "alice", printing.id, 2, "custody:loose", 20);
  assert.equal(allocated.applied, true);
  assert.equal(allocateTcgLooseCards(allocated.state, "alice", printing.id, 899, "custody:overdraw", 21).applied, false);
  const deposited = depositTcgLooseCards(allocated.state, "alice", allocated.batch!.id, "custody:deposit");
  assert.equal(deposited.applied, true);
  assert.equal(depositTcgLooseCards(deposited.state, "alice", allocated.batch!.id, "custody:copy").applied, false);
  world = deposited.state;
  const archived = archiveTcgDuplicates(world, "alice", "custody:bulk");
  assert.equal(archived.applied, true);
  assert.equal(archived.moved, 900);
  assert.equal(totalTcgHolding(archived.player, printing.id), before);
  assert.equal(archived.player.holdings[printing.id].physical, 0);
  assert.equal(archived.player.holdings[printing.id].archived, 900);
  const large = normalizeTcgWorldState({
    ...archived.state,
    players: {
      alice: {
        ...archived.player,
        archiveTier: 3,
        holdings: { [printing.id]: { physical: 0, archived: 100_000 } },
      },
    },
  }, "custody-world");
  assert.equal(large.players.alice.holdings[printing.id].archived, 100_000);
  assert.ok(JSON.stringify(large).length < 1_000_000, "counted holdings stay compact at 100k copies");
});

test("all released boosters remain below the liquidation-EV ceiling", () => {
  for (const product of Object.values(TCG_CATALOG.packs)) {
    const simulation = simulateTcgPackEconomy(product.id, 2_048);
    assert.equal(simulation.samples, 2_048);
    assert.ok(simulation.liquidationRatio < 0.55, `${product.id} liquidation ratio ${simulation.liquidationRatio}`);
  }
});

test("Wildlight pockets add deterministic last-revealed Full Art bonuses without replacing base slots", () => {
  const odds = tcgPackOdds();
  assert.equal(odds.fullArtBonus.rate, TCG_FULL_ART_BONUS_RATE);
  assert.equal(odds.fullArtBonus.replacesBaseCard, false);
  let bonuses = 0;
  const samples = 10_000;
  for (let index = 0; index < samples; index += 1) {
    const cards = collateTcgPack("cardforge-variety-booster", `wildlight:${index}`);
    assert.ok(cards.length === 5 || cards.length === 6);
    if (cards.length === 6) {
      bonuses += 1;
      assert.equal(TCG_CATALOG.printings[cards[5]].variant, "full-art");
      assert.ok(cards.slice(0, 5).every((printingId) => TCG_CATALOG.printings[printingId].variant !== "full-art"));
    }
  }
  const observedRate = bonuses / samples;
  assert.ok(observedRate >= 0.012 && observedRate <= 0.018, `observed Full Art bonus rate ${observedRate}`);
});

test("Waygrid archive tiers enforce atomic capacity before expanding", () => {
  const printing = defaultPrintingForDefinition("card:authored:field-notes")!;
  const player = {
    ...normalizeTcgWorldState({
      ...createTcgWorldState("archive-world"),
      players: {
        alice: {
          schema: 1,
          revision: 0,
          ownerId: "alice",
          holdings: { [printing.id]: { physical: 2, archived: 1_000 } },
          archiveTier: 1,
        },
      },
    }, "archive-world").players.alice,
  };
  let world = normalizeTcgWorldState({
    ...createTcgWorldState("archive-world"),
    players: { alice: player },
  }, "archive-world");
  const full = moveTcgCards(world, "alice", printing.id, 1, "physical", "archived", "archive:full");
  assert.equal(full.reason, "archive-full");
  assert.deepEqual(full.player.holdings[printing.id], player.holdings[printing.id]);
  const upgraded = upgradeTcgArchive(world, "alice", "archive:upgrade");
  assert.equal(upgraded.applied, true);
  assert.equal(upgraded.player.archiveTier, 2);
  world = upgraded.state;
  assert.equal(moveTcgCards(world, "alice", printing.id, 1, "physical", "archived", "archive:move").applied, true);
});
