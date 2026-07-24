import {
  TCG_CATALOG,
  TCG_RARITY_ORDER,
  TCG_RARITY_RANK,
  tcgPrintingsForPack,
} from "./catalog";
import { ensureTcgPlayer, grantTcgPrintings } from "./collection";
import { tcgPick, tcgStableId, tcgUnit } from "./rng";
import {
  type TcgCatalog,
  type TcgPackBatch,
  type TcgPackOpenResult,
  type TcgRarity,
  type TcgWorldState,
} from "./types";

const EVENT_HISTORY_LIMIT = 512;

const recent = (values: readonly string[], value: string) => Object.freeze([...values.filter((entry) => entry !== value), value].slice(-EVENT_HISTORY_LIMIT));
const boundedQuantity = (value: number) => Math.max(1, Math.min(4_096, Math.floor(Number.isFinite(value) ? value : 1)));

export function issueTcgPackBatch(
  worldInput: TcgWorldState,
  ownerId: string,
  productId: string,
  quantity: number,
  source: string,
  eventId: string,
  catalog = TCG_CATALOG,
) {
  const ensured = ensureTcgPlayer(worldInput, ownerId);
  const world = ensured.state;
  if (!catalog.packs[productId]) return Object.freeze({ applied: false, reason: "unknown-product", state: world, player: ensured.player, batch: null });
  if (!eventId.trim()) return Object.freeze({ applied: false, reason: "invalid-event", state: world, player: ensured.player, batch: null });
  if (world.recentEventIds.includes(eventId)) return Object.freeze({ applied: false, reason: "duplicate", state: world, player: ensured.player, batch: null });
  const id = tcgStableId("pack", world.authorityId, ownerId, productId, eventId);
  if (world.packBatches[id]) return Object.freeze({ applied: false, reason: "duplicate", state: world, player: ensured.player, batch: world.packBatches[id] });
  const batch: TcgPackBatch = Object.freeze({
    schema: 1,
    id,
    ownerId,
    productId,
    source: source.trim().slice(0, 120) || "unknown",
    quantity: boundedQuantity(quantity),
    nextIndex: 0,
    createdRevision: world.revision,
  });
  const state = Object.freeze({
    ...world,
    revision: world.revision + 1,
    packBatches: Object.freeze({ ...world.packBatches, [id]: batch }),
    recentEventIds: recent(world.recentEventIds, eventId),
  });
  return Object.freeze({ applied: true, reason: "ok", state, player: ensured.player, batch });
}

function rarityForSlot(seed: string, slot: number): TcgRarity {
  const roll = tcgUnit(`${seed}|rarity|${slot}`);
  if (slot <= 2) return roll < 0.80 ? "common" : roll < 0.98 ? "uncommon" : "rare";
  if (slot === 3) return roll < 0.70 ? "uncommon" : roll < 0.95 ? "rare" : "epic";
  return roll < 0.80 ? "rare" : roll < 0.97 ? "epic" : "legendary";
}

function alternatePrinting(baseId: string, seed: string, catalog: TcgCatalog) {
  const base = catalog.printings[baseId];
  if (!base) return baseId;
  const definitionPrintings = catalog.printingsByDefinition[base.cardDefinitionId] ?? [];
  const finishRoll = tcgUnit(`${seed}|finish`);
  if (finishRoll < 0.01) {
    const showcase = definitionPrintings.map((id) => catalog.printings[id]).find((printing) => printing.variant === "showcase");
    if (showcase) return showcase.id;
  }
  if (finishRoll < 0.09) {
    const foil = definitionPrintings.map((id) => catalog.printings[id])
      .find((printing) => printing.variant === "standard" && printing.finish === "foil");
    if (foil) return foil.id;
  }
  return baseId;
}

export function collateTcgPack(productId: string, seed: string, catalog = TCG_CATALOG) {
  const selectedDefinitions = new Set<string>();
  const printingIds: string[] = [];
  for (let slot = 0; slot < 5; slot += 1) {
    const rarity = rarityForSlot(seed, slot);
    const pool = tcgPrintingsForPack(productId, rarity, catalog);
    if (pool.length === 0) continue;
    const eligible = pool.filter((printing) => !selectedDefinitions.has(printing.cardDefinitionId));
    const choice = tcgPick(eligible.length > 0 ? eligible : pool, `${seed}|card|${slot}`);
    if (!choice) continue;
    selectedDefinitions.add(choice.cardDefinitionId);
    printingIds.push(alternatePrinting(choice.id, `${seed}|${slot}`, catalog));
  }
  return Object.freeze(printingIds.sort((leftId, rightId) => {
    const left = catalog.definitions[catalog.printings[leftId]?.cardDefinitionId ?? ""];
    const right = catalog.definitions[catalog.printings[rightId]?.cardDefinitionId ?? ""];
    return (TCG_RARITY_RANK[left?.rarity ?? "common"] - TCG_RARITY_RANK[right?.rarity ?? "common"])
      || (catalog.printings[leftId]?.collectorNumber ?? "").localeCompare(catalog.printings[rightId]?.collectorNumber ?? "");
  }));
}

export function openTcgPack(
  worldInput: TcgWorldState,
  ownerId: string,
  batchId: string,
  eventId: string,
  expectedPlayerRevision?: number,
  acquiredAt = Date.now(),
  catalog = TCG_CATALOG,
): TcgPackOpenResult {
  const ensured = ensureTcgPlayer(worldInput, ownerId);
  const world = ensured.state;
  const player = ensured.player;
  const batch = world.packBatches[batchId];
  if (!batch || batch.ownerId !== ownerId || batch.nextIndex >= batch.quantity) {
    return Object.freeze({ applied: false, reason: "pack-unavailable", state: world, player, batch: batch ?? null, printingIds: Object.freeze([]) });
  }
  if (expectedPlayerRevision !== undefined && player.revision !== expectedPlayerRevision) {
    return Object.freeze({ applied: false, reason: "stale", state: world, player, batch, printingIds: Object.freeze([]) });
  }
  const redemptionId = `pack-open:${batch.id}:${batch.nextIndex}`;
  if (world.recentEventIds.includes(redemptionId) || world.recentEventIds.includes(eventId)) {
    return Object.freeze({ applied: false, reason: "duplicate", state: world, player, batch, printingIds: Object.freeze([]) });
  }
  const printingIds = collateTcgPack(batch.productId, `${world.authorityId}|${batch.id}|${batch.nextIndex}`, catalog);
  if (printingIds.length !== 5) {
    return Object.freeze({ applied: false, reason: "invalid-collation", state: world, player, batch, printingIds: Object.freeze([]) });
  }
  const grant = grantTcgPrintings(world, ownerId, printingIds, redemptionId, {
    location: "physical",
    acquiredAt,
  }, catalog);
  if (!grant.applied) return Object.freeze({ applied: false, reason: grant.reason, state: grant.state, player: grant.player, batch, printingIds: Object.freeze([]) });
  const nextIndex = batch.nextIndex + 1;
  const nextBatch = Object.freeze({ ...batch, nextIndex });
  const packBatches = { ...grant.state.packBatches };
  if (nextIndex >= batch.quantity) delete packBatches[batch.id];
  else packBatches[batch.id] = nextBatch;
  const state = Object.freeze({
    ...grant.state,
    revision: grant.state.revision + 1,
    packBatches: Object.freeze(packBatches),
    recentEventIds: recent(recent(grant.state.recentEventIds, redemptionId), eventId),
  });
  return Object.freeze({
    applied: true,
    reason: "ok",
    state,
    player: state.players[ownerId],
    batch: nextIndex >= batch.quantity ? null : nextBatch,
    printingIds,
  });
}

export function remainingTcgPacks(world: TcgWorldState, ownerId: string) {
  return Object.freeze(Object.values(world.packBatches)
    .filter((batch) => batch.ownerId === ownerId && batch.nextIndex < batch.quantity)
    .sort((left, right) => left.createdRevision - right.createdRevision || left.id.localeCompare(right.id)));
}

export function tcgPackOdds() {
  return Object.freeze({
    slots: Object.freeze([
      Object.freeze({ slots: "1-3", common: 0.80, uncommon: 0.18, rare: 0.02, epic: 0, legendary: 0 }),
      Object.freeze({ slots: "4", common: 0, uncommon: 0.70, rare: 0.25, epic: 0.05, legendary: 0 }),
      Object.freeze({ slots: "5", common: 0, uncommon: 0, rare: 0.80, epic: 0.17, legendary: 0.03 }),
    ]),
    revealOrder: TCG_RARITY_ORDER,
  });
}
