import {
  TCG_CATALOG,
  TCG_RARITY_VALUE,
  tcgDefinitionForPrinting,
} from "./catalog";
import { availableUnlockedTcgHolding, ensureTcgPlayer, grantTcgPrintings } from "./collection";
import { collateTcgPack, issueTcgPackBatch } from "./packs";
import { tcgIndex, tcgPick, tcgUnit } from "./rng";
import {
  type TcgCatalog,
  type TcgHolding,
  type TcgLocation,
  type TcgMerchantEntry,
  type TcgMerchantStock,
  type TcgPlayerState,
  type TcgPrinting,
  type TcgWorldState,
} from "./types";

const EVENT_HISTORY_LIMIT = 512;
const MAX_MERCHANT_ENTRIES = 24;

const recent = (values: readonly string[], value: string) => Object.freeze([...values.filter((entry) => entry !== value), value].slice(-EVENT_HISTORY_LIMIT));
const gold = (value: string | number | bigint) => {
  if (typeof value === "bigint") return value < BigInt(0) ? BigInt(0) : value;
  if (typeof value === "number") return Number.isSafeInteger(value) && value > 0 ? BigInt(value) : BigInt(0);
  return /^\d+$/u.test(value) ? BigInt(value) : BigInt(0);
};

export function tcgPrintingReferenceValue(printing: TcgPrinting, catalog = TCG_CATALOG) {
  const definition = catalog.definitions[printing.cardDefinitionId];
  return Math.max(1, Math.round((TCG_RARITY_VALUE[definition?.rarity ?? "common"] * printing.valueModifierPermille) / 1_000));
}

export function simulateTcgPackEconomy(productId: string, samples = 4_096, catalog = TCG_CATALOG) {
  const product = catalog.packs[productId];
  if (!product) return Object.freeze({ productId, samples: 0, averageReferenceValue: 0, averageLiquidationValue: 0, liquidationRatio: 0 });
  const count = Math.max(1, Math.min(100_000, Math.floor(samples)));
  let reference = 0;
  let liquidation = 0;
  for (let index = 0; index < count; index += 1) {
    for (const printingId of collateTcgPack(productId, `economy:${catalog.revision}:${productId}:${index}`, catalog)) {
      const printing = catalog.printings[printingId];
      const value = tcgPrintingReferenceValue(printing, catalog);
      reference += value;
      liquidation += Math.max(1, Math.floor(value * 0.30));
    }
  }
  return Object.freeze({
    productId,
    samples: count,
    averageReferenceValue: reference / count,
    averageLiquidationValue: liquidation / count,
    liquidationRatio: liquidation / count / product.retailPrice,
  });
}

function thematicTags(factionId: string, profession: string) {
  return Object.freeze([
    factionId,
    profession,
    ...(factionId === "atlantians" ? ["tide", "aquatic", "reef"] : []),
    ...(factionId === "sugarcourt" ? ["confection", "food", "sugarcourt"] : []),
    ...(factionId === "wood-elves" ? ["verdant", "arcane", "moonbough"] : []),
    ...(factionId === "dwarves" ? ["stone", "metal", "underground"] : []),
    ...(factionId === "goblins" ? ["metal", "road", "brassroot"] : []),
    ...(factionId === "hobbits" ? ["hearthkin", "food", "road"] : []),
  ].map((entry) => entry.toLowerCase()));
}

function printingThemeScore(printing: TcgPrinting, tags: readonly string[], catalog: TcgCatalog) {
  const definition = catalog.definitions[printing.cardDefinitionId];
  const values = new Set([
    printing.setId,
    ...printing.acquisitionTags,
    ...(definition?.traits ?? []),
    ...(definition?.factions ?? []),
    ...(definition?.guilds ?? []),
    definition?.primaryType,
  ].filter((entry): entry is string => Boolean(entry)).map((entry) => entry.toLowerCase()));
  return tags.reduce((score, tag) => score + (values.has(tag) ? 1 : 0), 0);
}

function chooseMerchantPrinting(
  pool: readonly TcgPrinting[],
  tags: readonly string[],
  seed: string,
  catalog: TcgCatalog,
) {
  if (pool.length === 0) return undefined;
  if (tcgUnit(`${seed}|theme-roll`) < 0.60) {
    const themed = pool.filter((printing) => printingThemeScore(printing, tags, catalog) > 0);
    if (themed.length > 0) return tcgPick(themed, `${seed}|themed`);
  }
  return tcgPick(pool, `${seed}|wide`);
}

export function restockTcgMerchant(
  world: TcgWorldState,
  input: Readonly<{ merchantId: string; factionId: string; profession: string; worldDay: number; seed: string }>,
  force = false,
  catalog = TCG_CATALOG,
) {
  const existing = world.merchantStock[input.merchantId];
  const day = Math.max(0, Math.floor(input.worldDay));
  if (!force && existing && day - existing.restockDay < 2) return Object.freeze({ applied: false, reason: "not-due", state: world, merchant: existing });
  const tags = thematicTags(input.factionId, input.profession);
  const seed = `${input.seed}|${input.merchantId}|${day}|${catalog.revision}`;
  const entries: TcgMerchantEntry[] = [];
  const packIds = Object.keys(catalog.packs);
  const dedicated = /card|scribe|tome|broker|general|mayor|elder|thane|confectioner/iu.test(input.profession);
  const packLines = dedicated ? 3 + tcgIndex(`${seed}|pack-lines`, 3) : tcgIndex(`${seed}|pack-lines`, 3);
  for (let index = 0; index < packLines; index += 1) {
    const productId = tcgPick(packIds, `${seed}|pack|${index}`);
    const product = productId ? catalog.packs[productId] : null;
    if (!product) continue;
    entries.push(Object.freeze({
      id: `pack:${product.id}`,
      kind: "pack",
      productId: product.id,
      quantity: 1 + tcgIndex(`${seed}|pack-count|${index}`, 4),
      unitPrice: product.retailPrice,
      tags: product.themeTags,
    }));
  }
  const printingPool = catalog.printingOrder
    .map((id) => catalog.printings[id])
    .filter((printing) => printing.released && printing.variant === "standard" && printing.finish === "standard");
  const singleLines = (dedicated ? 8 : 3) + tcgIndex(`${seed}|single-lines`, dedicated ? 5 : 3);
  const selected = new Set<string>();
  for (let index = 0; index < singleLines; index += 1) {
    const choice = chooseMerchantPrinting(printingPool.filter((printing) => !selected.has(printing.id)), tags, `${seed}|single|${index}`, catalog);
    if (!choice) continue;
    selected.add(choice.id);
    const base = tcgPrintingReferenceValue(choice, catalog);
    const demand = 0.94 + tcgUnit(`${seed}|price|${index}`) * 0.22;
    entries.push(Object.freeze({
      id: `card:${choice.id}`,
      kind: "card",
      printingId: choice.id,
      quantity: 1 + tcgIndex(`${seed}|card-count|${index}`, 5),
      unitPrice: Math.max(1, Math.ceil(base * 1.22 * demand)),
      tags: Object.freeze([choice.setId, ...(catalog.definitions[choice.cardDefinitionId]?.traits ?? []).slice(0, 3)]),
    }));
  }
  const merchant: TcgMerchantStock = Object.freeze({
    schema: 1,
    merchantId: input.merchantId,
    revision: (existing?.revision ?? -1) + 1,
    restockDay: day,
    restockSeed: seed,
    gold: String(220 + tcgIndex(`${seed}|gold`, 281)),
    entries: Object.freeze(entries.slice(0, MAX_MERCHANT_ENTRIES)),
    recentEventIds: Object.freeze([]),
  });
  return Object.freeze({
    applied: true,
    reason: "ok",
    state: Object.freeze({
      ...world,
      revision: world.revision + 1,
      merchantStock: Object.freeze({ ...world.merchantStock, [input.merchantId]: merchant }),
    }),
    merchant,
  });
}

function decrementEntry(merchant: TcgMerchantStock, entryId: string, quantity: number, goldDelta: bigint, eventId: string) {
  const entries = merchant.entries.map((entry) => entry.id === entryId ? Object.freeze({ ...entry, quantity: entry.quantity - quantity }) : entry)
    .filter((entry) => entry.quantity > 0);
  return Object.freeze({
    ...merchant,
    revision: merchant.revision + 1,
    gold: String(gold(merchant.gold) + goldDelta),
    entries: Object.freeze(entries),
    recentEventIds: recent(merchant.recentEventIds, eventId),
  });
}

function replaceMerchant(world: TcgWorldState, merchant: TcgMerchantStock, eventId: string) {
  return Object.freeze({
    ...world,
    revision: world.revision + 1,
    merchantStock: Object.freeze({ ...world.merchantStock, [merchant.merchantId]: merchant }),
    recentEventIds: recent(world.recentEventIds, eventId),
  });
}

export function buyFromTcgMerchant(
  worldInput: TcgWorldState,
  ownerId: string,
  merchantId: string,
  entryId: string,
  quantityInput: number,
  playerGold: string,
  eventId: string,
  expectedPlayerRevision?: number,
) {
  const ensured = ensureTcgPlayer(worldInput, ownerId);
  const world = ensured.state;
  const player = ensured.player;
  const merchant = world.merchantStock[merchantId];
  const entry = merchant?.entries.find((candidate) => candidate.id === entryId);
  const quantity = Math.max(1, Math.min(4_096, Math.floor(quantityInput)));
  if (!merchant || !entry || entry.quantity < quantity) return Object.freeze({ applied: false, reason: "stock-unavailable", state: world, player, merchant: merchant ?? null, balance: playerGold });
  if (expectedPlayerRevision !== undefined && player.revision !== expectedPlayerRevision) return Object.freeze({ applied: false, reason: "stale", state: world, player, merchant, balance: playerGold });
  if (merchant.recentEventIds.includes(eventId) || world.recentEventIds.includes(eventId)) return Object.freeze({ applied: false, reason: "duplicate", state: world, player, merchant, balance: playerGold });
  const total = BigInt(entry.unitPrice) * BigInt(quantity);
  const balance = gold(playerGold);
  if (balance < total) return Object.freeze({ applied: false, reason: "insufficient-gold", state: world, player, merchant, balance: playerGold });
  let nextWorld = world;
  let nextPlayer = player;
  if (entry.kind === "pack") {
    const issued = issueTcgPackBatch(nextWorld, ownerId, entry.productId, quantity, `merchant:${merchantId}`, `${eventId}:pack`);
    if (!issued.applied) return Object.freeze({ applied: false, reason: issued.reason, state: world, player, merchant, balance: playerGold });
    nextWorld = issued.state;
    nextPlayer = issued.player;
  } else {
    const grant = grantTcgPrintings(nextWorld, ownerId, Array.from({ length: quantity }, () => entry.printingId), `${eventId}:card`, { location: "physical" });
    if (!grant.applied) return Object.freeze({ applied: false, reason: grant.reason, state: world, player, merchant, balance: playerGold });
    nextWorld = grant.state;
    nextPlayer = grant.player;
  }
  const currentMerchant = nextWorld.merchantStock[merchantId] ?? merchant;
  const nextMerchant = decrementEntry(currentMerchant, entryId, quantity, total, eventId);
  nextWorld = replaceMerchant(nextWorld, nextMerchant, eventId);
  return Object.freeze({
    applied: true,
    reason: "ok",
    state: nextWorld,
    player: nextPlayer,
    merchant: nextMerchant,
    balance: String(balance - total),
    total: String(total),
  });
}

function removePlayerCards(player: TcgPlayerState, printingId: string, quantity: number, location: TcgLocation, eventId: string) {
  const holding = player.holdings[printingId] ?? { physical: 0, archived: 0 };
  const nextHolding: TcgHolding = Object.freeze({ ...holding, [location]: holding[location] - quantity });
  return Object.freeze({
    ...player,
    revision: player.revision + 1,
    holdings: Object.freeze({ ...player.holdings, [printingId]: nextHolding }),
    recentEventIds: recent(player.recentEventIds, eventId),
  });
}

export function sellToTcgMerchant(
  worldInput: TcgWorldState,
  ownerId: string,
  merchantId: string,
  printingId: string,
  quantityInput: number,
  location: TcgLocation,
  playerGold: string,
  eventId: string,
) {
  const ensured = ensureTcgPlayer(worldInput, ownerId);
  const world = ensured.state;
  const player = ensured.player;
  const merchant = world.merchantStock[merchantId];
  const printing = TCG_CATALOG.printings[printingId];
  const quantity = Math.max(1, Math.min(4_096, Math.floor(quantityInput)));
  if (!merchant || !printing || availableUnlockedTcgHolding(world, ownerId, printingId, location) < quantity) {
    return Object.freeze({ applied: false, reason: "insufficient-cards", state: world, player, merchant: merchant ?? null, balance: playerGold });
  }
  if (merchant.recentEventIds.includes(eventId) || player.recentEventIds.includes(eventId)) return Object.freeze({ applied: false, reason: "duplicate", state: world, player, merchant, balance: playerGold });
  const unitPrice = Math.max(1, Math.floor(tcgPrintingReferenceValue(printing) * 0.30));
  const total = BigInt(unitPrice) * BigInt(quantity);
  if (gold(merchant.gold) < total) return Object.freeze({ applied: false, reason: "merchant-cannot-pay", state: world, player, merchant, balance: playerGold });
  const nextPlayer = removePlayerCards(player, printingId, quantity, location, eventId);
  const existing = merchant.entries.find((entry) => entry.kind === "card" && entry.printingId === printingId);
  const entries = existing
    ? merchant.entries.map((entry) => entry.id === existing.id ? Object.freeze({ ...entry, quantity: entry.quantity + quantity }) : entry)
    : [...merchant.entries, Object.freeze({
      id: `card:${printingId}`,
      kind: "card" as const,
      printingId,
      quantity,
      unitPrice: Math.max(unitPrice + 1, Math.ceil(tcgPrintingReferenceValue(printing) * 1.22)),
      tags: Object.freeze([printing.setId, tcgDefinitionForPrinting(printingId)?.rarity ?? "common"]),
    })].slice(0, MAX_MERCHANT_ENTRIES);
  const nextMerchant = Object.freeze({
    ...merchant,
    revision: merchant.revision + 1,
    gold: String(gold(merchant.gold) - total),
    entries: Object.freeze(entries),
    recentEventIds: recent(merchant.recentEventIds, eventId),
  });
  const state = Object.freeze({
    ...world,
    revision: world.revision + 1,
    players: Object.freeze({ ...world.players, [ownerId]: nextPlayer }),
    merchantStock: Object.freeze({ ...world.merchantStock, [merchantId]: nextMerchant }),
    recentEventIds: recent(world.recentEventIds, eventId),
  });
  return Object.freeze({
    applied: true,
    reason: "ok",
    state,
    player: nextPlayer,
    merchant: nextMerchant,
    balance: String(gold(playerGold) + total),
    total: String(total),
  });
}
