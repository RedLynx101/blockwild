import { resolveTypeEffectiveness } from "../creature-types";
import {
  TCG_CATALOG,
  defaultPrintingForDefinition,
  starterDeckPrintingIds,
} from "./catalog";
import { claimTcgStarter, deckAvailableForTcgMatch, deckForPlayer, ensureTcgPlayer, validateTcgDeck } from "./collection";
import { tcgPick, tcgShuffle, tcgStableId } from "./rng";
import {
  TCG_MAX_BOARD,
  TCG_MAX_ENERGY,
  TCG_MAX_HAND,
  type TcgAbilityEffect,
  type TcgCatalog,
  type TcgChallenge,
  type TcgMatchAction,
  type TcgMatchCard,
  type TcgMatchPlayerState,
  type TcgMatchState,
  type TcgNpcOpponent,
  type TcgPublicMatchPlayer,
  type TcgPublicMatchState,
  type TcgWorldState,
} from "./types";

const ACTION_HISTORY_LIMIT = 1_024;
const ACTION_LOG_LIMIT = 2_048;
const LOG_LIMIT = 160;
const CHALLENGE_LIMIT = 128;
export const TCG_TURN_CLOCK_MS = 90_000;
export const TCG_RECONNECT_GRACE_MS = 120_000;

const updateTuple = <T>(tuple: readonly [T, T], index: 0 | 1, value: T): readonly [T, T] => (
  index === 0 ? Object.freeze([value, tuple[1]]) : Object.freeze([tuple[0], value])
);

const otherIndex = (index: 0 | 1): 0 | 1 => index === 0 ? 1 : 0;

function cardDefinition(card: TcgMatchCard, catalog: TcgCatalog) {
  return catalog.definitions[card.definitionId];
}

function matchCard(printingId: string, matchId: string, ownerId: string, index: number, catalog: TcgCatalog, generated = false): TcgMatchCard {
  const printing = catalog.printings[printingId];
  if (!printing) throw new Error(`Unknown TCG printing ${printingId}`);
  return Object.freeze({
    instanceId: tcgStableId("match-card", matchId, ownerId, index, printingId),
    printingId,
    definitionId: printing.cardDefinitionId,
    generated,
    damage: 0,
    exhausted: true,
    enteredTurn: 0,
    temporaryPower: 0,
    temporaryGuard: 0,
  });
}

function drawCards(player: TcgMatchPlayerState, count: number) {
  const deck = [...player.deck];
  const hand = [...player.hand];
  let deckOut = false;
  for (let index = 0; index < count; index += 1) {
    const card = deck.shift();
    if (!card) { deckOut = true; break; }
    if (hand.length < TCG_MAX_HAND) hand.push(card);
    else player = Object.freeze({ ...player, discard: Object.freeze([...player.discard, card]) });
  }
  return Object.freeze({
    player: Object.freeze({ ...player, deck: Object.freeze(deck), hand: Object.freeze(hand), failedDraw: player.failedDraw || deckOut }),
    deckOut,
  });
}

function appendLog(match: TcgMatchState, actorId: string, text: string) {
  return Object.freeze([...match.log, Object.freeze({ revision: match.revision + 1, turn: match.turn, actorId, text })].slice(-LOG_LIMIT));
}

function markProcessed(match: TcgMatchState, actionId: string) {
  return Object.freeze([...match.processedActionIds.filter((id) => id !== actionId), actionId].slice(-ACTION_HISTORY_LIMIT));
}

function appendAction(
  match: TcgMatchState,
  actorId: string,
  action: TcgMatchAction,
  actionId: string,
  expectedRevision: number,
  appliedAt: number,
) {
  return Object.freeze([...match.actionLog, Object.freeze({
    actionId,
    actorId,
    expectedRevision,
    action: Object.freeze({ ...action }),
    appliedAt,
  })].slice(-ACTION_LOG_LIMIT));
}

function effectivePower(card: TcgMatchCard, catalog: TcgCatalog) {
  return Math.max(0, (cardDefinition(card, catalog)?.power ?? 0) + card.temporaryPower);
}

function effectiveGuard(card: TcgMatchCard, catalog: TcgCatalog) {
  return Math.max(1, (cardDefinition(card, catalog)?.guard ?? 1) + card.temporaryGuard);
}

function resolveEffect(
  playersInput: readonly [TcgMatchPlayerState, TcgMatchPlayerState],
  actorIndex: 0 | 1,
  effect: TcgAbilityEffect,
  input: Readonly<{ targetBoardSlot?: number; sourceCard?: TcgMatchCard; turn?: number }>,
  catalog: TcgCatalog,
) {
  let players = playersInput;
  const opponentIndex = otherIndex(actorIndex);
  let actor = players[actorIndex];
  let opponent = players[opponentIndex];
  if (effect.kind === "draw") {
    const drawn = drawCards(actor, effect.count);
    actor = drawn.player;
  } else if (effect.kind === "gain-energy") {
    actor = Object.freeze({ ...actor, energy: Math.min(TCG_MAX_ENERGY + 2, actor.energy + effect.amount) });
  } else if (effect.kind === "heal" && effect.target === "self-resolve") {
    actor = Object.freeze({ ...actor, resolve: Math.min(20, actor.resolve + effect.amount) });
  } else if (effect.kind === "heal" && effect.target === "friendly-being") {
    const slot = input.targetBoardSlot ?? actor.board.findIndex(Boolean);
    const target = actor.board[slot];
    if (target) {
      const next = Object.freeze({ ...target, damage: Math.max(0, target.damage - effect.amount) });
      actor = Object.freeze({ ...actor, board: Object.freeze(actor.board.map((card, index) => index === slot ? next : card)) });
    }
  } else if (effect.kind === "damage" && effect.target === "enemy-resolve") {
    opponent = Object.freeze({ ...opponent, resolve: Math.max(0, opponent.resolve - effect.amount) });
  } else if (effect.kind === "damage") {
    const slot = input.targetBoardSlot ?? opponent.board.findIndex(Boolean);
    const target = opponent.board[slot];
    const sourceDefinition = input.sourceCard ? cardDefinition(input.sourceCard, catalog) : null;
    if (target && !(target.submergedUntilTurn !== undefined
      && target.submergedUntilTurn >= (input.turn ?? 0)
      && sourceDefinition?.primaryType !== "tide")) {
      const next = Object.freeze({ ...target, damage: target.damage + effect.amount });
      opponent = Object.freeze({ ...opponent, board: Object.freeze(opponent.board.map((card, index) => index === slot ? next : card)) });
    }
  } else if (effect.kind === "buff") {
    const slot = input.targetBoardSlot ?? actor.board.findIndex(Boolean);
    const target = effect.target === "self" ? input.sourceCard : actor.board[slot];
    if (target) {
      const next = Object.freeze({
        ...target,
        temporaryPower: target.temporaryPower + effect.power,
        temporaryGuard: target.temporaryGuard + effect.guard,
      });
      actor = Object.freeze({ ...actor, board: Object.freeze(actor.board.map((card) => card?.instanceId === next.instanceId ? next : card)) });
    }
  } else if (effect.kind === "ready") {
    const slot = input.targetBoardSlot ?? actor.board.findIndex(Boolean);
    const target = actor.board[slot];
    if (target) actor = Object.freeze({ ...actor, board: Object.freeze(actor.board.map((card, index) => index === slot ? Object.freeze({ ...target, exhausted: false }) : card)) });
  }
  players = updateTuple(players, actorIndex, actor);
  players = updateTuple(players, opponentIndex, opponent);
  return players;
}

function resolvePlayAbilities(
  players: readonly [TcgMatchPlayerState, TcgMatchPlayerState],
  actorIndex: 0 | 1,
  card: TcgMatchCard,
  targetBoardSlot: number | undefined,
  turn: number,
  catalog: TcgCatalog,
) {
  let next = players;
  for (const ability of cardDefinition(card, catalog)?.abilities ?? []) if (ability.trigger === "play") {
    next = resolveEffect(next, actorIndex, ability.effect, { targetBoardSlot, sourceCard: card, turn }, catalog);
  }
  return next;
}

function cleanDefeated(matchInput: TcgMatchState, catalog: TcgCatalog) {
  let match = matchInput;
  let players = match.players;
  for (const playerIndex of [0, 1] as const) {
    let player = players[playerIndex];
    const defeated = player.board.filter((card): card is TcgMatchCard => Boolean(card && card.damage >= effectiveGuard(card, catalog)));
    if (defeated.length === 0) continue;
    player = Object.freeze({
      ...player,
      board: Object.freeze(player.board.map((card) => card && defeated.some((entry) => entry.instanceId === card.instanceId) ? null : card)),
      discard: Object.freeze([...player.discard, ...defeated]),
    });
    players = updateTuple(players, playerIndex, player);
    for (const card of defeated) {
      for (const ability of cardDefinition(card, catalog)?.abilities ?? []) if (ability.trigger === "faint") {
        players = resolveEffect(players, playerIndex, ability.effect, { sourceCard: card }, catalog);
      }
    }
  }
  match = Object.freeze({ ...match, players });
  return match;
}

function terminalMatch(match: TcgMatchState) {
  const [left, right] = match.players;
  if (left.failedDraw || right.failedDraw) {
    const winnerId = left.failedDraw && right.failedDraw ? match.players[otherIndex(match.activePlayerIndex)].playerId : left.failedDraw ? right.playerId : left.playerId;
    return Object.freeze({ ...match, phase: "complete" as const, winnerId, reason: "deck-out" as const, turnDeadlineAt: null });
  }
  if (left.resolve > 0 && right.resolve > 0) return match;
  const winnerId = left.resolve <= 0 ? right.playerId : left.playerId;
  return Object.freeze({ ...match, phase: "complete" as const, winnerId, reason: "resolve" as const, turnDeadlineAt: null });
}

function playerFromDeck(
  matchId: string,
  playerId: string,
  displayName: string,
  printingIds: readonly string[],
  seed: string,
  npc: boolean,
  catalog: TcgCatalog,
) {
  const cards = printingIds.map((printingId, index) => matchCard(printingId, matchId, playerId, index, catalog));
  const shuffled = tcgShuffle(cards, `${seed}|shuffle|${playerId}`);
  const base: TcgMatchPlayerState = Object.freeze({
    playerId,
    displayName: displayName.trim().slice(0, 48) || (npc ? "Town Challenger" : "Wayfarer"),
    npc,
    resolve: 20,
    maxEnergy: 0,
    energy: 0,
    deck: Object.freeze(shuffled),
    hand: Object.freeze([]),
    board: Object.freeze(Array.from({ length: TCG_MAX_BOARD }, () => null)),
    relics: Object.freeze([]),
    place: null,
    discard: Object.freeze([]),
    mulliganComplete: npc,
    failedDraw: false,
  });
  return drawCards(base, 5).player;
}

export function createTcgMatch(input: Readonly<{
  id: string;
  seed: string;
  playerA: Readonly<{ id: string; name: string; printingIds: readonly string[]; npc?: boolean }>;
  playerB: Readonly<{ id: string; name: string; printingIds: readonly string[]; npc?: boolean }>;
  firstPlayerIndex?: 0 | 1;
  now?: number;
}>, catalog = TCG_CATALOG): TcgMatchState {
  const id = input.id.trim().slice(0, 160);
  if (!id) throw new Error("TCG match id is required");
  if (!validateTcgDeck(input.playerA.printingIds, null, catalog).valid || !validateTcgDeck(input.playerB.printingIds, null, catalog).valid) {
    throw new Error("TCG match requires two legal decks");
  }
  const firstPlayerIndex = input.firstPlayerIndex ?? (tcgUnitIndex(`${input.seed}|first`, 2) as 0 | 1);
  let players = Object.freeze([
    playerFromDeck(id, input.playerA.id, input.playerA.name, input.playerA.printingIds, input.seed, input.playerA.npc === true, catalog),
    playerFromDeck(id, input.playerB.id, input.playerB.name, input.playerB.printingIds, input.seed, input.playerB.npc === true, catalog),
  ]) as readonly [TcgMatchPlayerState, TcgMatchPlayerState];
  const spark = defaultPrintingForDefinition("card:authored:trail-spark", catalog);
  if (spark) {
    const second = players[otherIndex(firstPlayerIndex)];
    players = updateTuple(players, otherIndex(firstPlayerIndex), Object.freeze({
      ...second,
      hand: Object.freeze([...second.hand, matchCard(spark.id, id, second.playerId, input.playerA.printingIds.length + input.playerB.printingIds.length, catalog, true)]),
    }));
  }
  const now = input.now ?? Date.now();
  const match: TcgMatchState = Object.freeze({
    schema: 1,
    id,
    revision: 0,
    seed: input.seed,
    catalogRevision: catalog.revision,
    format: "open",
    phase: players.every((player) => player.mulliganComplete) ? "playing" : "mulligan",
    players,
    activePlayerIndex: firstPlayerIndex,
    firstPlayerIndex,
    turn: 1,
    winnerId: null,
    reason: null,
    createdAt: now,
    updatedAt: now,
    turnDeadlineAt: players.every((player) => player.mulliganComplete) && players.every((player) => !player.npc) ? now + TCG_TURN_CLOCK_MS : null,
    disconnectedAt: Object.freeze([null, null]) as readonly [number | null, number | null],
    deckCommitments: Object.freeze([
      Object.freeze([...input.playerA.printingIds]),
      Object.freeze([...input.playerB.printingIds]),
    ]) as readonly [readonly string[], readonly string[]],
    log: Object.freeze([]),
    actionLog: Object.freeze([]),
    processedActionIds: Object.freeze([]),
  });
  return match.phase === "playing" ? beginFirstTurn(match) : match;
}

function tcgUnitIndex(seed: string, length: number) {
  const pick = tcgPick(Array.from({ length }, (_, index) => index), seed);
  return pick ?? 0;
}

function beginFirstTurn(match: TcgMatchState) {
  const active = match.players[match.activePlayerIndex];
  const next = Object.freeze({ ...active, maxEnergy: 1, energy: 1 });
  return Object.freeze({ ...match, players: updateTuple(match.players, match.activePlayerIndex, next) });
}

function applyMulligan(match: TcgMatchState, actorIndex: 0 | 1, indexes: readonly number[]) {
  const player = match.players[actorIndex];
  if (player.mulliganComplete) return Object.freeze({ match, applied: false, reason: "mulligan-complete" });
  const uniqueIndexes = [...new Set(indexes.map((value) => Math.floor(value))
    .filter((value) => value >= 0 && value < player.hand.length && !player.hand[value].generated))].slice(0, 5);
  const returned = uniqueIndexes.map((index) => player.hand[index]);
  const deck = [...player.deck];
  const hand = player.hand.filter((_, index) => !uniqueIndexes.includes(index));
  const replacements = deck.splice(0, returned.length);
  const shuffledDeck = tcgShuffle([...deck, ...returned], `${match.seed}|mulligan|${actorIndex}|${match.revision}`);
  const nextPlayer = Object.freeze({
    ...player,
    hand: Object.freeze([...hand, ...replacements]),
    deck: Object.freeze(shuffledDeck),
    mulliganComplete: true,
  });
  const players = updateTuple(match.players, actorIndex, nextPlayer);
  const allReady = players.every((entry) => entry.mulliganComplete);
  let next = Object.freeze({
    ...match,
    players,
    phase: allReady ? "playing" as const : match.phase,
    turnDeadlineAt: allReady && players.every((player) => !player.npc) ? match.updatedAt + TCG_TURN_CLOCK_MS : null,
  });
  if (allReady) next = beginFirstTurn(next);
  return Object.freeze({ match: next, applied: true, reason: "ok" });
}

function applyPlay(match: TcgMatchState, actorIndex: 0 | 1, action: Extract<TcgMatchAction, { kind: "play" }>, catalog: TcgCatalog) {
  let player = match.players[actorIndex];
  const card = player.hand[action.handIndex];
  const definition = card ? cardDefinition(card, catalog) : null;
  if (!card || !definition) return Object.freeze({ match, applied: false, reason: "card-unavailable" });
  if (definition.cost > player.energy) return Object.freeze({ match, applied: false, reason: "insufficient-energy" });
  const hand = player.hand.filter((_, index) => index !== action.handIndex);
  player = Object.freeze({ ...player, energy: player.energy - definition.cost, hand: Object.freeze(hand) });
  let players = updateTuple(match.players, actorIndex, player);
  if (definition.class === "creature" || definition.class === "character") {
    const slot = action.boardSlot ?? player.board.findIndex((entry) => entry === null);
    if (slot < 0 || slot >= TCG_MAX_BOARD || player.board[slot]) return Object.freeze({ match, applied: false, reason: "board-full" });
    let placed = Object.freeze({
      ...card,
      exhausted: !definition.keywords.includes("swift"),
      enteredTurn: match.turn,
      ...(definition.keywords.includes("dive") ? { submergedUntilTurn: match.turn + 1 } : {}),
    });
    const adjacent = [player.board[slot - 1], player.board[slot + 1]].filter((entry) => entry && (cardDefinition(entry, catalog)?.primaryType === definition.primaryType
      || cardDefinition(entry, catalog)?.traits.some((trait) => definition.traits.includes(trait))));
    if (definition.keywords.includes("bond") && adjacent.length > 0) placed = Object.freeze({ ...placed, temporaryPower: placed.temporaryPower + 1 });
    if (definition.keywords.includes("attune") && player.relics.length > 0) placed = Object.freeze({ ...placed, temporaryGuard: placed.temporaryGuard + 1 });
    const ambushDamage = match.players[otherIndex(actorIndex)].board.filter((entry) => entry && cardDefinition(entry, catalog)?.keywords.includes("ambush")).length;
    if (ambushDamage > 0) placed = Object.freeze({ ...placed, damage: placed.damage + ambushDamage });
    player = Object.freeze({ ...player, board: Object.freeze(player.board.map((entry, index) => index === slot ? placed : entry)) });
    players = updateTuple(players, actorIndex, player);
    const rallyCount = player.board.filter((entry) => entry?.instanceId !== placed.instanceId && cardDefinition(entry!, catalog)?.keywords.includes("rally")).length;
    if (rallyCount > 0) players = updateTuple(players, actorIndex, drawCards(players[actorIndex], rallyCount).player);
    players = resolvePlayAbilities(players, actorIndex, placed, action.targetBoardSlot, match.turn, catalog);
  } else if (definition.class === "relic") {
    if (player.relics.length >= 2) return Object.freeze({ match, applied: false, reason: "relic-row-full" });
    player = Object.freeze({ ...player, relics: Object.freeze([...player.relics, card]) });
    players = updateTuple(players, actorIndex, player);
    players = resolvePlayAbilities(players, actorIndex, card, action.targetBoardSlot, match.turn, catalog);
  } else if (definition.class === "place") {
    const discard = player.place ? [...player.discard, player.place] : player.discard;
    player = Object.freeze({ ...player, place: card, discard: Object.freeze(discard) });
    players = updateTuple(players, actorIndex, player);
    players = resolvePlayAbilities(players, actorIndex, card, action.targetBoardSlot, match.turn, catalog);
  } else {
    player = Object.freeze({ ...player, discard: Object.freeze([...player.discard, card]) });
    players = updateTuple(players, actorIndex, player);
    players = resolvePlayAbilities(players, actorIndex, card, action.targetBoardSlot, match.turn, catalog);
  }
  let next = Object.freeze({ ...match, players });
  next = cleanDefeated(next, catalog);
  next = terminalMatch(next);
  return Object.freeze({ match: next, applied: true, reason: "ok", text: `${player.displayName} played ${definition.name}.` });
}

function applyAttack(match: TcgMatchState, actorIndex: 0 | 1, action: Extract<TcgMatchAction, { kind: "attack" }>, catalog: TcgCatalog) {
  const opponentIndex = otherIndex(actorIndex);
  let actor = match.players[actorIndex];
  let opponent = match.players[opponentIndex];
  const attacker = actor.board[action.boardSlot];
  const attackerDefinition = attacker ? cardDefinition(attacker, catalog) : null;
  if (!attacker || !attackerDefinition || attacker.exhausted) return Object.freeze({ match, applied: false, reason: "attacker-unavailable" });
  const guards = opponent.board.map((card, index) => ({ card, index })).filter(({ card }) => card && cardDefinition(card, catalog)?.keywords.includes("guard"));
  if (action.target === "resolve") {
    if (guards.length > 0) return Object.freeze({ match, applied: false, reason: "guard-blocks" });
    opponent = Object.freeze({ ...opponent, resolve: Math.max(0, opponent.resolve - effectivePower(attacker, catalog)) });
  } else {
    const targetSlot = action.targetBoardSlot ?? -1;
    const target = opponent.board[targetSlot];
    if (!target) return Object.freeze({ match, applied: false, reason: "target-unavailable" });
    if (guards.length > 0 && !guards.some(({ index }) => index === targetSlot)) return Object.freeze({ match, applied: false, reason: "guard-blocks" });
    const targetDefinition = cardDefinition(target, catalog);
    const typeSteps = attackerDefinition.primaryType && targetDefinition?.primaryType
      ? Math.max(-1, Math.min(1, resolveTypeEffectiveness(attackerDefinition.primaryType, [targetDefinition.primaryType]).steps))
      : 0;
    const attackDamage = Math.max(0, effectivePower(attacker, catalog) + typeSteps);
    const counterDamage = effectivePower(target, catalog);
    const nextTarget = Object.freeze({ ...target, damage: target.damage + attackDamage });
    const nextAttacker = Object.freeze({ ...attacker, damage: attacker.damage + counterDamage, exhausted: true });
    actor = Object.freeze({ ...actor, board: Object.freeze(actor.board.map((card, index) => index === action.boardSlot ? nextAttacker : card)) });
    opponent = Object.freeze({ ...opponent, board: Object.freeze(opponent.board.map((card, index) => index === targetSlot ? nextTarget : card)) });
  }
  if (action.target === "resolve") actor = Object.freeze({ ...actor, board: Object.freeze(actor.board.map((card, index) => index === action.boardSlot ? Object.freeze({ ...attacker, exhausted: true }) : card)) });
  let players = updateTuple(match.players, actorIndex, actor);
  players = updateTuple(players, opponentIndex, opponent);
  let next = Object.freeze({ ...match, players });
  next = cleanDefeated(next, catalog);
  next = terminalMatch(next);
  return Object.freeze({ match: next, applied: true, reason: "ok", text: `${actor.displayName} attacked ${action.target === "resolve" ? "Resolve" : "a Being"}.` });
}

function applyEndTurn(match: TcgMatchState) {
  const currentIndex = match.activePlayerIndex;
  const nextIndex = otherIndex(currentIndex);
  const current = Object.freeze({
    ...match.players[currentIndex],
    board: Object.freeze(match.players[currentIndex].board.map((card) => card ? Object.freeze({ ...card, temporaryPower: 0, temporaryGuard: 0 }) : null)),
  });
  let nextPlayer = match.players[nextIndex];
  nextPlayer = Object.freeze({
    ...nextPlayer,
    maxEnergy: Math.min(TCG_MAX_ENERGY, nextPlayer.maxEnergy + 1),
    energy: Math.min(TCG_MAX_ENERGY, nextPlayer.maxEnergy + 1),
    board: Object.freeze(nextPlayer.board.map((card) => card ? Object.freeze({ ...card, exhausted: false, temporaryPower: 0, temporaryGuard: 0 }) : null)),
  });
  const drawn = drawCards(nextPlayer, 1);
  nextPlayer = drawn.player;
  let players = updateTuple(match.players, currentIndex, current);
  players = updateTuple(players, nextIndex, nextPlayer);
  if (drawn.deckOut) return Object.freeze({
    ...match,
    players,
    phase: "complete" as const,
    winnerId: current.playerId,
    reason: "deck-out" as const,
    turn: match.turn + 1,
    activePlayerIndex: nextIndex,
    turnDeadlineAt: null,
  });
  return Object.freeze({ ...match, players, turn: match.turn + 1, activePlayerIndex: nextIndex });
}

export function applyTcgMatchAction(
  match: TcgMatchState,
  actorId: string,
  action: TcgMatchAction,
  actionId: string,
  expectedRevision = match.revision,
  now = Date.now(),
  catalog = TCG_CATALOG,
) {
  if (match.phase === "complete" || match.phase === "cancelled") return Object.freeze({ applied: false, reason: "match-complete", match });
  if (match.processedActionIds.includes(actionId)) return Object.freeze({ applied: false, reason: "duplicate", match });
  if (match.revision !== expectedRevision) return Object.freeze({ applied: false, reason: "stale", match });
  const actorIndexValue = match.players.findIndex((player) => player.playerId === actorId);
  if (actorIndexValue !== 0 && actorIndexValue !== 1) return Object.freeze({ applied: false, reason: "forbidden", match });
  const actorIndex = actorIndexValue;
  let result: Readonly<{ match: TcgMatchState; applied: boolean; reason: string; text?: string }>;
  if (action.kind === "mulligan") {
    if (match.phase !== "mulligan") return Object.freeze({ applied: false, reason: "wrong-phase", match });
    result = applyMulligan(match, actorIndex, action.handIndexes);
  } else if (action.kind === "concede") {
    result = Object.freeze({
      applied: true,
      reason: "ok",
      match: Object.freeze({ ...match, phase: "complete" as const, winnerId: match.players[otherIndex(actorIndex)].playerId, reason: "concede" as const, turnDeadlineAt: null }),
      text: `${match.players[actorIndex].displayName} conceded.`,
    });
  } else {
    if (match.phase !== "playing") return Object.freeze({ applied: false, reason: "wrong-phase", match });
    if (match.activePlayerIndex !== actorIndex) return Object.freeze({ applied: false, reason: "not-your-turn", match });
    if (action.kind === "play") result = applyPlay(match, actorIndex, action, catalog);
    else if (action.kind === "attack") result = applyAttack(match, actorIndex, action, catalog);
    else result = Object.freeze({ match: applyEndTurn(match), applied: true, reason: "ok", text: `${match.players[actorIndex].displayName} ended the turn.` });
  }
  if (!result.applied) return result;
  const text = result.text ?? `${match.players[actorIndex].displayName} completed a mulligan.`;
  const next = Object.freeze({
    ...result.match,
    revision: match.revision + 1,
    updatedAt: now,
    turnDeadlineAt: result.match.phase === "playing" && result.match.players.every((player) => !player.npc) ? now + TCG_TURN_CLOCK_MS : null,
    log: appendLog(match, actorId, text),
    actionLog: appendAction(match, actorId, action, actionId, expectedRevision, now),
    processedActionIds: markProcessed(match, actionId),
  });
  return Object.freeze({ applied: true, reason: "ok", match: next });
}

function publicPlayer(player: TcgMatchPlayerState, revealHand: boolean): TcgPublicMatchPlayer {
  return Object.freeze({
    playerId: player.playerId,
    displayName: player.displayName,
    npc: player.npc,
    resolve: player.resolve,
    maxEnergy: player.maxEnergy,
    energy: player.energy,
    deckCount: player.deck.length,
    handCount: player.hand.length,
    ...(revealHand ? { hand: player.hand } : {}),
    board: player.board,
    relics: player.relics,
    place: player.place,
    discardCount: player.discard.length,
    mulliganComplete: player.mulliganComplete,
  });
}

export function publicTcgMatch(match: TcgMatchState, viewerId: string): TcgPublicMatchState | null {
  const viewerPlayerIndexValue = match.players.findIndex((player) => player.playerId === viewerId);
  if (viewerPlayerIndexValue !== 0 && viewerPlayerIndexValue !== 1) return null;
  const viewerPlayerIndex = viewerPlayerIndexValue;
  return Object.freeze({
    id: match.id,
    revision: match.revision,
    phase: match.phase,
    players: Object.freeze([
      publicPlayer(match.players[0], viewerPlayerIndex === 0),
      publicPlayer(match.players[1], viewerPlayerIndex === 1),
    ]) as readonly [TcgPublicMatchPlayer, TcgPublicMatchPlayer],
    viewerPlayerIndex,
    activePlayerIndex: match.activePlayerIndex,
    turn: match.turn,
    turnDeadlineAt: match.turnDeadlineAt,
    winnerId: match.winnerId,
    reason: match.reason,
    log: match.log,
  });
}

export const TCG_NPC_OPPONENTS: readonly TcgNpcOpponent[] = Object.freeze([
  Object.freeze({ id: "waytable-novice", name: "Mira Cardhand", title: "Waytable Novice", factionId: "hobbits", difficulty: 1, themeTags: Object.freeze(["wild", "road", "starter"]), rewardGold: 12 }),
  Object.freeze({ id: "brassroot-dealer", name: "Nix Three Receipts", title: "Brassroot Dealer", factionId: "goblins", difficulty: 2, themeTags: Object.freeze(["metal", "road", "hostile"]), rewardGold: 18 }),
  Object.freeze({ id: "tideglass-reader", name: "Sela Wakequiet", title: "Tideglass Reader", factionId: "atlantians", difficulty: 2, themeTags: Object.freeze(["tide", "aquatic", "reef"]), rewardGold: 20 }),
  Object.freeze({ id: "moonbough-curator", name: "Fenna Glassleaf", title: "Moonbough Curator", factionId: "wood-elves", difficulty: 3, themeTags: Object.freeze(["verdant", "arcane", "dream"]), rewardGold: 28 }),
  Object.freeze({ id: "deepgear-champion", name: "Edda Rivetbraid", title: "Deepgear Champion", factionId: "dwarves", difficulty: 3, themeTags: Object.freeze(["stone", "metal", "underground"]), rewardGold: 30 }),
  Object.freeze({ id: "grand-waytable-master", name: "Orra Last Turn", title: "Grand Waytable Master", factionId: "player", difficulty: 4, themeTags: Object.freeze(["legendary", "guild", "variety"]), rewardGold: 45 }),
]);

export function townTcgOpponents(input: Readonly<{
  settlementId: string;
  factionId: string;
  worldSeed: string;
  residents: readonly Readonly<{
    id: string;
    profession: string;
    adult: boolean;
    alive: boolean;
    health: number;
  }>[];
}>) {
  const residents = input.residents
    .filter((resident) => resident.alive && resident.adult && resident.health > 0)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (residents.length < 2) return Object.freeze({
    opponents: Object.freeze([] as TcgNpcOpponent[]),
    reason: residents.length === 0 ? "No living adult residents are available to host a Waytable match." : "A second eligible resident is needed before this settlement can host a Waytable.",
  });
  const desired = Math.min(4, Math.max(2, 2 + (residents.length >= 12 ? 2 : residents.length >= 6 ? 1 : 0)));
  const candidates = TCG_NPC_OPPONENTS.filter((opponent) => opponent.difficulty < 4 || residents.length >= 12);
  const seeded = tcgShuffle(candidates, [
    input.worldSeed,
    input.settlementId,
    input.factionId,
    ...residents.map((resident) => `${resident.id}:${resident.profession}`),
  ].join("|"));
  const ordered = [
    ...seeded.filter((opponent) => opponent.factionId === input.factionId),
    ...seeded.filter((opponent) => opponent.factionId !== input.factionId),
  ];
  return Object.freeze({
    opponents: Object.freeze(ordered.slice(0, desired)),
    reason: "",
  });
}

export function setTcgParticipantConnected(match: TcgMatchState, playerId: string, connected: boolean, now = Date.now()) {
  if (match.phase === "complete" || match.phase === "cancelled") return match;
  const playerIndex = match.players.findIndex((player) => player.playerId === playerId);
  if (playerIndex !== 0 && playerIndex !== 1) return match;
  const disconnectedAt = [...match.disconnectedAt] as [number | null, number | null];
  disconnectedAt[playerIndex] = connected ? null : Math.max(0, Math.floor(now));
  return Object.freeze({ ...match, disconnectedAt: Object.freeze(disconnectedAt) as readonly [number | null, number | null] });
}

export function expireTcgMatch(match: TcgMatchState, now = Date.now()) {
  if (match.phase === "complete" || match.phase === "cancelled") return match;
  const disconnectedIndex = match.disconnectedAt.findIndex((at) => at !== null && at + TCG_RECONNECT_GRACE_MS <= now);
  const loserIndex = disconnectedIndex === 0 || disconnectedIndex === 1
    ? disconnectedIndex
    : match.turnDeadlineAt !== null && match.turnDeadlineAt <= now
      ? match.activePlayerIndex
      : -1;
  if (loserIndex !== 0 && loserIndex !== 1) return match;
  const winnerId = match.players[otherIndex(loserIndex)].playerId;
  const actorId = match.players[loserIndex].playerId;
  const text = disconnectedIndex >= 0
    ? `${match.players[loserIndex].displayName} did not reconnect before the grace window ended.`
    : `${match.players[loserIndex].displayName}'s turn clock expired.`;
  return Object.freeze({
    ...match,
    revision: match.revision + 1,
    phase: "complete" as const,
    winnerId,
    reason: "timeout" as const,
    updatedAt: now,
    turnDeadlineAt: null,
    log: Object.freeze([...match.log, Object.freeze({ revision: match.revision + 1, turn: match.turn, actorId, text })].slice(-LOG_LIMIT)),
  });
}

export function replayTcgMatch(match: TcgMatchState, catalog = TCG_CATALOG) {
  let replay = createTcgMatch({
    id: match.id,
    seed: match.seed,
    playerA: {
      id: match.players[0].playerId,
      name: match.players[0].displayName,
      printingIds: match.deckCommitments[0],
      npc: match.players[0].npc,
    },
    playerB: {
      id: match.players[1].playerId,
      name: match.players[1].displayName,
      printingIds: match.deckCommitments[1],
      npc: match.players[1].npc,
    },
    firstPlayerIndex: match.firstPlayerIndex,
    now: match.createdAt,
  }, catalog);
  for (const record of match.actionLog) {
    const applied = applyTcgMatchAction(
      replay,
      record.actorId,
      record.action,
      record.actionId,
      record.expectedRevision,
      record.appliedAt,
      catalog,
    );
    if (!applied.applied) return Object.freeze({ valid: false, reason: applied.reason, match: replay });
    replay = applied.match;
  }
  return Object.freeze({ valid: true, reason: "ok", match: replay });
}

export function startTcgTutorialMatch(
  worldInput: TcgWorldState,
  ownerId: string,
  eventId: string,
  displayName = "Wayfarer",
  now = Date.now(),
) {
  const ensured = ensureTcgPlayer(worldInput, ownerId);
  if (ensured.player.tutorial.tutorialCompleted) return Object.freeze({ applied: false, reason: "tutorial-complete", state: ensured.state, match: null });
  const active = Object.values(ensured.state.activeMatches).find((match) => match.id.startsWith("tutorial_")
    && match.phase !== "complete" && match.phase !== "cancelled"
    && match.players.some((player) => player.playerId === ownerId));
  if (active) return Object.freeze({ applied: false, reason: "tutorial-active", state: ensured.state, match: active });
  const opponent = TCG_NPC_OPPONENTS[0];
  const matchId = tcgStableId("tutorial", ensured.state.authorityId, ownerId);
  let match = createTcgMatch({
    id: matchId,
    seed: `${ensured.state.authorityId}|${matchId}|lesson`,
    playerA: { id: ownerId, name: displayName, printingIds: starterDeckPrintingIds() },
    playerB: { id: `npc:${opponent.id}`, name: opponent.name, printingIds: npcTcgDeck(opponent), npc: true },
    firstPlayerIndex: 0,
    now,
  });
  match = advanceTcgNpc(match);
  return Object.freeze({
    applied: true,
    reason: "ok",
    state: Object.freeze({
      ...ensured.state,
      revision: ensured.state.revision + 1,
      activeMatches: Object.freeze({ ...ensured.state.activeMatches, [match.id]: match }),
      recentEventIds: Object.freeze([...ensured.state.recentEventIds.filter((id) => id !== eventId), eventId].slice(-512)),
    }),
    match,
  });
}

export function completeTcgTutorialMatch(
  world: TcgWorldState,
  ownerId: string,
  matchId: string,
  eventId: string,
  now = Date.now(),
) {
  const player = world.players[ownerId];
  const match = world.activeMatches[matchId];
  if (!player || !match || !match.id.startsWith("tutorial_") || !match.players.some((entry) => entry.playerId === ownerId)) {
    return Object.freeze({ applied: false, reason: "invalid-tutorial", state: world, player: player ?? null });
  }
  if (match.phase !== "complete" || match.reason === "concede") {
    return Object.freeze({ applied: false, reason: "tutorial-unfinished", state: world, player });
  }
  if (player.tutorial.starterClaimed) return Object.freeze({ applied: false, reason: "claimed", state: world, player });
  const taught = Object.freeze({
    ...player,
    revision: player.revision + 1,
    tutorial: Object.freeze({ ...player.tutorial, tutorialCompleted: true }),
    recentEventIds: Object.freeze([...player.recentEventIds.filter((id) => id !== eventId), eventId].slice(-512)),
  });
  const prepared = Object.freeze({
    ...world,
    revision: world.revision + 1,
    players: Object.freeze({ ...world.players, [ownerId]: taught }),
    recentEventIds: Object.freeze([...world.recentEventIds.filter((id) => id !== eventId), eventId].slice(-512)),
  });
  return claimTcgStarter(prepared, ownerId, `${eventId}:starter`, now);
}

export function recordTcgNpcResult(
  world: TcgWorldState,
  ownerId: string,
  opponentId: string,
  matchId: string,
  won: boolean,
  worldDay: number,
) {
  const player = world.players[ownerId];
  const match = world.activeMatches[matchId];
  const eventId = `npc-result:${matchId}:${ownerId}`;
  if (!player || !match || match.phase !== "complete" || !match.players.some((entry) => entry.playerId === ownerId)
    || !match.players.some((entry) => entry.playerId === `npc:${opponentId}`)) {
    return Object.freeze({ applied: false, reason: "invalid-result", state: world, player: player ?? null, rewardEligible: false, firstWin: false });
  }
  if (player.recentEventIds.includes(eventId)) {
    return Object.freeze({ applied: false, reason: "duplicate", state: world, player, rewardEligible: false, firstWin: false });
  }
  const previous = player.npcProgress[opponentId] ?? Object.freeze({
    opponentId,
    wins: 0,
    losses: 0,
    firstWinClaimed: false,
    lastRewardDay: -1,
  });
  const day = Math.max(0, Math.floor(worldDay));
  const firstWin = won && !previous.firstWinClaimed;
  const rewardEligible = firstWin || previous.lastRewardDay < day;
  const progress = Object.freeze({
    opponentId,
    wins: previous.wins + (won ? 1 : 0),
    losses: previous.losses + (won ? 0 : 1),
    firstWinClaimed: previous.firstWinClaimed || firstWin,
    lastRewardDay: rewardEligible ? day : previous.lastRewardDay,
  });
  const nextPlayer = Object.freeze({
    ...player,
    revision: player.revision + 1,
    npcProgress: Object.freeze({ ...player.npcProgress, [opponentId]: progress }),
    recentEventIds: Object.freeze([...player.recentEventIds.filter((id) => id !== eventId), eventId].slice(-512)),
  });
  return Object.freeze({
    applied: true,
    reason: "ok",
    state: Object.freeze({
      ...world,
      revision: world.revision + 1,
      players: Object.freeze({ ...world.players, [ownerId]: nextPlayer }),
      recentEventIds: Object.freeze([...world.recentEventIds.filter((id) => id !== eventId), eventId].slice(-512)),
    }),
    player: nextPlayer,
    rewardEligible,
    firstWin,
  });
}

function definitionThemeScore(definitionId: string, tags: readonly string[], catalog: TcgCatalog) {
  const definition = catalog.definitions[definitionId];
  const values = new Set([
    definition?.primaryType,
    ...(definition?.secondaryTypes ?? []),
    ...(definition?.factions ?? []),
    ...(definition?.traits ?? []),
  ].filter((entry): entry is string => Boolean(entry)));
  return tags.reduce((score, tag) => score + (values.has(tag) ? 1 : 0), 0);
}

export function npcTcgDeck(opponent: TcgNpcOpponent, catalog = TCG_CATALOG) {
  const definitions = catalog.definitionOrder
    .map((id) => catalog.definitions[id])
    .filter((definition) => definition.rarity !== "legendary" || opponent.difficulty >= 4)
    .sort((left, right) => definitionThemeScore(right.id, opponent.themeTags, catalog) - definitionThemeScore(left.id, opponent.themeTags, catalog)
      || left.cost - right.cost
      || left.name.localeCompare(right.name));
  const beings = definitions.filter((definition) => definition.class === "creature" || definition.class === "character").slice(0, 9 + opponent.difficulty);
  const support = definitions.filter((definition) => !["creature", "character", "place"].includes(definition.class)).slice(0, 6);
  const places = definitions.filter((definition) => definition.class === "place").slice(0, 2);
  const recipe: string[] = [
    ...beings.flatMap((definition) => [definition.id, definition.id]),
    ...support.flatMap((definition) => [definition.id, definition.id]),
    ...places.map((definition) => definition.id),
  ].slice(0, 30);
  while (recipe.length < 30) recipe.push(beings[recipe.length % beings.length].id);
  const counts: Record<string, number> = {};
  const normalized = recipe.map((definitionId) => {
    const definition = catalog.definitions[definitionId];
    const maximum = definition.rarity === "legendary" ? 1 : 3;
    if ((counts[definitionId] ?? 0) >= maximum) {
      const fallback = beings.find((entry) => (counts[entry.id] ?? 0) < (entry.rarity === "legendary" ? 1 : 3)) ?? support[0];
      definitionId = fallback.id;
    }
    counts[definitionId] = (counts[definitionId] ?? 0) + 1;
    return defaultPrintingForDefinition(definitionId, catalog)?.id;
  }).filter((id): id is string => Boolean(id));
  return Object.freeze(normalized.slice(0, 30));
}

export function legalTcgActions(match: TcgMatchState, actorId: string, catalog = TCG_CATALOG): readonly TcgMatchAction[] {
  if (match.phase === "complete" || match.phase === "cancelled") return Object.freeze([]);
  const indexValue = match.players.findIndex((player) => player.playerId === actorId);
  if (indexValue !== 0 && indexValue !== 1) return Object.freeze([]);
  const actorIndex = indexValue;
  const player = match.players[actorIndex];
  if (match.phase === "mulligan") {
    if (player.mulliganComplete) return Object.freeze([Object.freeze({ kind: "concede" as const })]);
    const indexes = player.hand.map((card, index) => ({ card, index })).filter(({ card }) => !card.generated).map(({ index }) => index);
    const actions: TcgMatchAction[] = [];
    for (let mask = 0; mask < 2 ** indexes.length; mask += 1) actions.push(Object.freeze({
      kind: "mulligan",
      handIndexes: Object.freeze(indexes.filter((_, bit) => (mask & (1 << bit)) !== 0)),
    }));
    actions.push(Object.freeze({ kind: "concede" }));
    return Object.freeze(actions);
  }
  if (match.activePlayerIndex !== actorIndex) return Object.freeze([Object.freeze({ kind: "concede" as const })]);
  const opponent = match.players[otherIndex(actorIndex)];
  const actions: TcgMatchAction[] = [];
  for (let handIndex = 0; handIndex < player.hand.length; handIndex += 1) {
    const card = player.hand[handIndex];
    const definition = cardDefinition(card, catalog);
    if (!definition || definition.cost > player.energy) continue;
    if (definition.class === "creature" || definition.class === "character") {
      for (let boardSlot = 0; boardSlot < TCG_MAX_BOARD; boardSlot += 1) {
        if (!player.board[boardSlot]) actions.push(Object.freeze({ kind: "play", handIndex, boardSlot }));
      }
      continue;
    }
    if (definition.class === "relic" && player.relics.length >= 2) continue;
    const effect = definition.abilities.find((ability) => ability.trigger === "play")?.effect;
    if (effect?.kind === "damage" && effect.target !== "enemy-resolve") {
      for (let targetBoardSlot = 0; targetBoardSlot < TCG_MAX_BOARD; targetBoardSlot += 1) {
        const target = opponent.board[targetBoardSlot];
        if (!target) continue;
        if (target.submergedUntilTurn !== undefined && target.submergedUntilTurn >= match.turn && definition.primaryType !== "tide") continue;
        actions.push(Object.freeze({ kind: "play", handIndex, targetBoardSlot }));
      }
      continue;
    }
    if ((effect?.kind === "buff" || effect?.kind === "ready" || effect?.kind === "heal" && effect.target === "friendly-being")) {
      for (let targetBoardSlot = 0; targetBoardSlot < TCG_MAX_BOARD; targetBoardSlot += 1) {
        if (player.board[targetBoardSlot]) actions.push(Object.freeze({ kind: "play", handIndex, targetBoardSlot }));
      }
      continue;
    }
    actions.push(Object.freeze({ kind: "play", handIndex }));
  }
  const guards = opponent.board.map((card, index) => ({ card, index }))
    .filter(({ card }) => card && cardDefinition(card, catalog)?.keywords.includes("guard"));
  for (let boardSlot = 0; boardSlot < TCG_MAX_BOARD; boardSlot += 1) {
    const attacker = player.board[boardSlot];
    if (!attacker || attacker.exhausted) continue;
    const targetSlots = guards.length > 0
      ? guards.map(({ index }) => index)
      : opponent.board.map((card, index) => card ? index : -1).filter((index) => index >= 0);
    for (const targetBoardSlot of targetSlots) actions.push(Object.freeze({ kind: "attack", boardSlot, target: "being", targetBoardSlot }));
    if (guards.length === 0) actions.push(Object.freeze({ kind: "attack", boardSlot, target: "resolve" }));
  }
  actions.push(Object.freeze({ kind: "end-turn" }), Object.freeze({ kind: "concede" }));
  return Object.freeze(actions);
}

export function chooseNpcTcgAction(match: TcgMatchState, npcId: string, catalog = TCG_CATALOG): TcgMatchAction {
  const indexValue = match.players.findIndex((player) => player.playerId === npcId);
  if (indexValue !== 0 && indexValue !== 1) return Object.freeze({ kind: "end-turn" });
  const index = indexValue;
  const player = match.players[index];
  if (match.phase === "mulligan") return Object.freeze({
    kind: "mulligan",
    handIndexes: Object.freeze(player.hand.map((card, handIndex) => ({ card, handIndex }))
      .filter(({ card }) => (cardDefinition(card, catalog)?.cost ?? 0) >= 5)
      .map(({ handIndex }) => handIndex)
      .slice(0, 3)),
  });
  const legal = legalTcgActions(match, npcId, catalog);
  const playable = legal.filter((action): action is Extract<TcgMatchAction, { kind: "play" }> => action.kind === "play")
    .sort((left, right) => (cardDefinition(player.hand[right.handIndex], catalog)?.cost ?? 0) - (cardDefinition(player.hand[left.handIndex], catalog)?.cost ?? 0));
  if (playable[0]) return playable[0];
  const attack = legal.find((action) => action.kind === "attack");
  return attack ?? legal.find((action) => action.kind === "end-turn") ?? Object.freeze({ kind: "concede" });
}

export function advanceTcgNpc(matchInput: TcgMatchState, maximumActions = 24, catalog = TCG_CATALOG) {
  let match = matchInput;
  for (let step = 0; step < maximumActions; step += 1) {
    if (match.phase === "complete" || match.phase === "cancelled") break;
    const candidates = match.phase === "mulligan"
      ? match.players.filter((player) => player.npc && !player.mulliganComplete)
      : [match.players[match.activePlayerIndex]].filter((player) => player.npc);
    const npc = candidates[0];
    if (!npc) break;
    const action = chooseNpcTcgAction(match, npc.playerId, catalog);
    const result = applyTcgMatchAction(match, npc.playerId, action, `npc:${match.id}:${match.revision}:${step}`, match.revision, match.updatedAt + step + 1, catalog);
    if (!result.applied) break;
    match = result.match;
    if (action.kind === "end-turn") break;
  }
  return match;
}

export function startWorldTcgMatch(
  worldInput: TcgWorldState,
  ownerId: string,
  opponent: TcgNpcOpponent,
  eventId: string,
  displayName = "Wayfarer",
  now = Date.now(),
) {
  const ensured = ensureTcgPlayer(worldInput, ownerId);
  const deck = deckForPlayer(ensured.player);
  if (Object.values(ensured.state.activeMatches).some((match) => (match.phase === "mulligan" || match.phase === "playing") && match.players.some((player) => player.playerId === ownerId))) {
    return Object.freeze({ applied: false, reason: "match-active", state: ensured.state, match: null });
  }
  if (!deck || !validateTcgDeck(deck.printingIds, ensured.player).valid || !deckAvailableForTcgMatch(ensured.state, ownerId, deck)) {
    return Object.freeze({ applied: false, reason: "invalid-deck", state: ensured.state, match: null });
  }
  const opponentDeck = npcTcgDeck(opponent);
  const matchId = tcgStableId("match", ensured.state.authorityId, ownerId, opponent.id, eventId);
  let match = createTcgMatch({
    id: matchId,
    seed: `${ensured.state.authorityId}|${matchId}`,
    playerA: { id: ownerId, name: displayName, printingIds: deck.printingIds },
    playerB: { id: `npc:${opponent.id}`, name: opponent.name, printingIds: opponentDeck, npc: true },
    now,
  });
  match = advanceTcgNpc(match);
  const state = Object.freeze({
    ...ensured.state,
    revision: ensured.state.revision + 1,
    activeMatches: Object.freeze({ ...ensured.state.activeMatches, [match.id]: match }),
    recentEventIds: Object.freeze([...ensured.state.recentEventIds, eventId].slice(-512)),
  });
  return Object.freeze({ applied: true, reason: "ok", state, match });
}

export function activeTcgMatchForPlayer(world: TcgWorldState, playerId: string) {
  return Object.values(world.activeMatches)
    .filter((match) => match.players.some((player) => player.playerId === playerId))
    .sort((left, right) => right.updatedAt - left.updatedAt)[0] ?? null;
}

export function applyWorldTcgMatchAction(
  world: TcgWorldState,
  playerId: string,
  matchId: string,
  action: TcgMatchAction,
  actionId: string,
  expectedRevision: number,
  now = Date.now(),
) {
  const match = world.activeMatches[matchId];
  if (!match) return Object.freeze({ applied: false, reason: "missing-match", state: world, match: null });
  const result = applyTcgMatchAction(match, playerId, action, actionId, expectedRevision, now);
  if (!result.applied) return Object.freeze({ ...result, state: world });
  const advanced = advanceTcgNpc(result.match);
  return Object.freeze({
    applied: true,
    reason: "ok",
    state: Object.freeze({
      ...world,
      revision: world.revision + 1,
      activeMatches: Object.freeze({ ...world.activeMatches, [matchId]: advanced }),
    }),
    match: advanced,
  });
}

export function createTcgChallenge(world: TcgWorldState, challengerId: string, recipientId: string, eventId: string, now = Date.now()) {
  if (challengerId === recipientId || !world.players[challengerId] || !world.players[recipientId]) return Object.freeze({ applied: false, reason: "invalid-player", state: world, challenge: null });
  const challenge: TcgChallenge = Object.freeze({
    id: tcgStableId("challenge", challengerId, recipientId, eventId),
    revision: 0,
    challengerId,
    recipientId,
    createdAt: now,
    expiresAt: now + 120_000,
    status: "pending",
    matchId: null,
  });
  const challenges = Object.fromEntries([...Object.entries(world.challenges), [challenge.id, challenge]].slice(-CHALLENGE_LIMIT));
  return Object.freeze({
    applied: true,
    reason: "ok",
    state: Object.freeze({ ...world, revision: world.revision + 1, challenges: Object.freeze(challenges) }),
    challenge,
  });
}

export function acceptTcgChallenge(world: TcgWorldState, challengeId: string, actorId: string, eventId: string, displayNames: Readonly<Record<string, string>>, now = Date.now()) {
  const challenge = world.challenges[challengeId];
  if (!challenge || challenge.status !== "pending" || challenge.recipientId !== actorId || challenge.expiresAt < now) return Object.freeze({ applied: false, reason: "unavailable", state: world, challenge: challenge ?? null, match: null });
  const left = world.players[challenge.challengerId];
  const right = world.players[challenge.recipientId];
  const leftDeck = left && deckForPlayer(left);
  const rightDeck = right && deckForPlayer(right);
  if (!left || !right || !leftDeck || !rightDeck || !validateTcgDeck(leftDeck.printingIds, left).valid || !validateTcgDeck(rightDeck.printingIds, right).valid
    || !deckAvailableForTcgMatch(world, left.ownerId, leftDeck) || !deckAvailableForTcgMatch(world, right.ownerId, rightDeck)) {
    return Object.freeze({ applied: false, reason: "invalid-deck", state: world, challenge, match: null });
  }
  const matchId = tcgStableId("match", world.authorityId, challenge.id, eventId);
  const match = createTcgMatch({
    id: matchId,
    seed: `${world.authorityId}|${matchId}`,
    playerA: { id: left.ownerId, name: displayNames[left.ownerId] ?? "Challenger", printingIds: leftDeck.printingIds },
    playerB: { id: right.ownerId, name: displayNames[right.ownerId] ?? "Challenger", printingIds: rightDeck.printingIds },
    now,
  });
  const accepted = Object.freeze({ ...challenge, revision: challenge.revision + 1, status: "accepted" as const, matchId });
  return Object.freeze({
    applied: true,
    reason: "ok",
    state: Object.freeze({
      ...world,
      revision: world.revision + 1,
      challenges: Object.freeze({ ...world.challenges, [challengeId]: accepted }),
      activeMatches: Object.freeze({ ...world.activeMatches, [matchId]: match }),
    }),
    challenge: accepted,
    match,
  });
}

export function declineTcgChallenge(world: TcgWorldState, challengeId: string, actorId: string) {
  const challenge = world.challenges[challengeId];
  if (!challenge || challenge.status !== "pending" || challenge.recipientId !== actorId) return Object.freeze({ applied: false, reason: "unavailable", state: world, challenge: challenge ?? null });
  const declined = Object.freeze({ ...challenge, revision: challenge.revision + 1, status: "declined" as const });
  return Object.freeze({
    applied: true,
    reason: "ok",
    state: Object.freeze({ ...world, revision: world.revision + 1, challenges: Object.freeze({ ...world.challenges, [challengeId]: declined }) }),
    challenge: declined,
  });
}
