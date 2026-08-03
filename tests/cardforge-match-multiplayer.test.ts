import assert from "node:assert/strict";
import test from "node:test";
import { validatePayload } from "../app/game/multiplayer.ts";
import { TCG_CATALOG, TCG_KEYWORDS, starterDeckPrintingIds } from "../app/game/tcg/catalog.ts";
import { createTcgPlayerState, validateTcgDeck } from "../app/game/tcg/collection.ts";
import {
  TCG_RECONNECT_GRACE_MS,
  applyTcgMatchAction,
  chooseNpcTcgAction,
  createTcgMatch,
  expireTcgMatch,
  legalTcgActions,
  publicTcgMatch,
  replayTcgMatch,
  setTcgParticipantConnected,
  townTcgOpponents,
} from "../app/game/tcg/match.ts";
import { TCG_NETWORK_PROTOCOL_VERSION, validateTcgNetworkAction, validateTcgNetworkIntent } from "../app/game/tcg/network.ts";
import type { TcgHudState, TcgMatchState } from "../app/game/tcg/types.ts";

function twoPlayerMatch(): TcgMatchState {
  const deck = starterDeckPrintingIds();
  return createTcgMatch({
    id: "match:authority:test",
    seed: "fixed-match-seed",
    playerA: { id: "alice", name: "Alice", printingIds: deck },
    playerB: { id: "bob", name: "Bob", printingIds: deck },
    firstPlayerIndex: 0,
    now: 10,
  });
}

test("match reducer enforces revisions, idempotency, mulligans, and terminal state", () => {
  const initial = twoPlayerMatch();
  assert.equal(initial.phase, "mulligan");
  assert.equal(initial.players[0].hand.length, 5);
  assert.equal(initial.players[1].hand.length, 6);
  assert.equal(initial.players[1].hand.filter((card) => card.generated).length, 1, "second player receives one generated Trail Spark");

  const alice = applyTcgMatchAction(initial, "alice", { kind: "mulligan", handIndexes: [0, 2] }, "action:alice:mulligan", 0, 11);
  assert.equal(alice.applied, true);
  assert.equal(alice.match.revision, 1);
  assert.equal(applyTcgMatchAction(alice.match, "alice", { kind: "mulligan", handIndexes: [] }, "action:alice:mulligan", 1).reason, "duplicate");
  assert.equal(applyTcgMatchAction(alice.match, "bob", { kind: "mulligan", handIndexes: [] }, "action:stale", 0).reason, "stale");

  const bob = applyTcgMatchAction(alice.match, "bob", { kind: "mulligan", handIndexes: [] }, "action:bob:mulligan", 1, 12);
  assert.equal(bob.applied, true);
  assert.equal(bob.match.phase, "playing");
  assert.equal(bob.match.players[bob.match.activePlayerIndex].energy, 1);
  const conceded = applyTcgMatchAction(bob.match, "alice", { kind: "concede" }, "action:concede", bob.match.revision, 13);
  assert.equal(conceded.applied, true);
  assert.equal(conceded.match.phase, "complete");
  assert.equal(conceded.match.winnerId, "bob");
  assert.equal(applyTcgMatchAction(conceded.match, "alice", { kind: "end-turn" }, "after", conceded.match.revision).reason, "match-complete");
});

test("player projections reveal only the viewer hand", () => {
  const match = twoPlayerMatch();
  const alice = publicTcgMatch(match, "alice")!;
  const bob = publicTcgMatch(match, "bob")!;
  assert.equal(alice.players[0].hand?.length, 5);
  assert.equal(alice.players[1].hand, undefined);
  assert.equal(bob.players[0].hand, undefined);
  assert.equal(bob.players[1].hand?.length, 6);
  assert.equal(publicTcgMatch(match, "spectator"), null);
});

test("action logs replay deterministically and network clocks enforce timeout and reconnect grace", () => {
  let match = twoPlayerMatch();
  match = applyTcgMatchAction(match, "alice", { kind: "mulligan", handIndexes: [] }, "replay:a", match.revision, 20).match;
  match = applyTcgMatchAction(match, "bob", { kind: "mulligan", handIndexes: [0] }, "replay:b", match.revision, 21).match;
  match = applyTcgMatchAction(match, "alice", { kind: "concede" }, "replay:c", match.revision, 22).match;
  const replayed = replayTcgMatch(match);
  assert.equal(replayed.valid, true);
  assert.deepEqual(replayed.match, match);

  let clocked = twoPlayerMatch();
  clocked = applyTcgMatchAction(clocked, "alice", { kind: "mulligan", handIndexes: [] }, "clock:a", 0, 100).match;
  clocked = applyTcgMatchAction(clocked, "bob", { kind: "mulligan", handIndexes: [] }, "clock:b", 1, 110).match;
  assert.ok(clocked.turnDeadlineAt);
  const timedOut = expireTcgMatch(clocked, clocked.turnDeadlineAt!);
  assert.equal(timedOut.phase, "complete");
  assert.equal(timedOut.reason, "timeout");
  assert.equal(timedOut.winnerId, "bob");

  const graceMatch = Object.freeze({ ...clocked, turnDeadlineAt: null });
  const disconnected = setTcgParticipantConnected(graceMatch, "bob", false, 1_000);
  assert.equal(expireTcgMatch(disconnected, 1_000 + TCG_RECONNECT_GRACE_MS - 1).phase, "playing");
  const reconnected = setTcgParticipantConnected(disconnected, "bob", true, 1_100);
  assert.equal(reconnected.disconnectedAt[1], null);
  const forfeited = expireTcgMatch(disconnected, 1_000 + TCG_RECONNECT_GRACE_MS);
  assert.equal(forfeited.winnerId, "alice");
});

test("settlement challengers are deterministic and every keyword is represented by structured rules", () => {
  const residents = Array.from({ length: 8 }, (_, index) => ({
    id: `resident:${index}`,
    profession: index % 2 ? "merchant" : "guard",
    adult: true,
    alive: true,
    health: 20,
  }));
  const left = townTcgOpponents({ settlementId: "town:one", factionId: "hobbits", worldSeed: "world", residents });
  const right = townTcgOpponents({ settlementId: "town:one", factionId: "hobbits", worldSeed: "world", residents });
  assert.deepEqual(left, right);
  assert.ok(left.opponents.length >= 2 && left.opponents.length <= 4);
  assert.equal(townTcgOpponents({ settlementId: "town:empty", factionId: "hobbits", worldSeed: "world", residents: [] }).opponents.length, 0);

  for (const keyword of TCG_KEYWORDS) {
    const definition = Object.values(TCG_CATALOG.definitions).find((entry) => entry.keywords.includes(keyword));
    assert.ok(definition, `${keyword} must have a released rules source`);
  }
  const prime = Object.values(TCG_CATALOG.definitions).find((entry) => entry.keywords.includes("prime"))!;
  const primePrinting = TCG_CATALOG.printingsByDefinition[prime.id][0];
  const padded = [...starterDeckPrintingIds()];
  padded.splice(0, 2, primePrinting, primePrinting);
  assert.ok(validateTcgDeck(padded).errors.some((error) => error.includes("1-copy")));
});

test("legal action enumeration is bounded and NPC decisions are always legal", () => {
  let match = createTcgMatch({
    id: "match:npc:legal",
    seed: "npc-legal",
    playerA: { id: "alice", name: "Alice", printingIds: starterDeckPrintingIds() },
    playerB: { id: "npc:waytable-novice", name: "Mira", printingIds: starterDeckPrintingIds(), npc: true },
    firstPlayerIndex: 1,
    now: 10,
  });
  const aliceMulligan = applyTcgMatchAction(match, "alice", { kind: "mulligan", handIndexes: [] }, "legal:mulligan", 0, 11);
  assert.equal(aliceMulligan.applied, true);
  match = aliceMulligan.match;
  const npcAction = chooseNpcTcgAction(match, "npc:waytable-novice");
  assert.ok(legalTcgActions(match, "npc:waytable-novice").some((action) => JSON.stringify(action) === JSON.stringify(npcAction)));
  assert.ok(legalTcgActions(match, "npc:waytable-novice").length < 256);
  assert.deepEqual(legalTcgActions(match, "spectator"), []);
});

test("dedicated TCG network messages reject client state smuggling and malformed bounds", () => {
  const request = {
    protocolVersion: TCG_NETWORK_PROTOCOL_VERSION,
    requestId: "tcg_request_001",
    actorId: "alice",
    tick: 12,
    status: "request" as const,
    intent: { kind: "redeem-booster" as const },
  };
  assert.equal(validateTcgNetworkAction(request), true);
  assert.equal(validateTcgNetworkAction({ ...request, protocolVersion: 2 }), true, "future versions reach the host for an explicit unsupported response");
  assert.equal(validateTcgNetworkAction({
    requestId: request.requestId,
    actorId: request.actorId,
    tick: request.tick,
    status: request.status,
    intent: request.intent,
  }), false);
  assert.equal(validatePayload("tcg-action", request), true);
  assert.equal(validateTcgNetworkAction({ ...request, projection: {} }), false);
  assert.equal(validateTcgNetworkIntent({ kind: "move-cards", printingId: "x", count: 0, from: "physical", to: "archived" }), false);
  assert.equal(validateTcgNetworkIntent({ kind: "save-deck", name: "x", printingIds: Array.from({ length: 31 }, () => "x") }), false);

  const projection: TcgHudState = {
    catalogRevision: TCG_CATALOG.revision,
    player: createTcgPlayerState("alice"),
    packBatches: [],
    lastPackReveal: null,
    merchant: null,
    activeMatch: null,
    opponents: [],
    challenges: [],
    trades: [],
    peers: [],
    settlementName: null,
    challengerStatus: "Visit a generated settlement.",
    recoveryIssues: [],
  };
  const accepted = {
    protocolVersion: TCG_NETWORK_PROTOCOL_VERSION,
    requestId: request.requestId,
    actorId: "alice",
    tick: 13,
    status: "accepted" as const,
    projection,
  };
  assert.equal(validateTcgNetworkAction(accepted), true);
  const sixCardProjection = {
    ...projection,
    lastPackReveal: {
      batchId: "batch:wildlight",
      printingIds: ["a", "b", "c", "d", "e", "f"],
      newPrintingIds: ["b", "f"],
      openedAt: 42,
    },
  };
  assert.equal(validateTcgNetworkAction({ ...accepted, projection: sixCardProjection }), true, "Wildlight bonus packs and exact NEW metadata cross the host boundary");
  assert.equal(validateTcgNetworkAction({
    ...accepted,
    projection: { ...sixCardProjection, lastPackReveal: { ...sixCardProjection.lastPackReveal, newPrintingIds: undefined } },
  }), false, "clients cannot infer or omit authoritative NEW metadata");
  assert.equal(validateTcgNetworkAction({ ...accepted, intent: request.intent }), false);
});
