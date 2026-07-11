import { BlockId, Item, type InventorySlot, type ItemCode } from "./data";

/** Bridges the pure string-based simulation modules to stable numeric save ids. */
export const HEARTHROADS_RESOURCE_ITEMS: Readonly<Record<string, ItemCode>> = Object.freeze({
  "glass-bottle": Item.GlassBottle,
  "water-bottle": Item.WaterBottle,
  "apple": Item.Apple,
  "moonberry": Item.Berry,
  "sunberry": Item.Sunberry,
  "glow-scale": Item.GlowScale,
  "honey-jar": Item.HoneyJar,
  "cloudbell": BlockId.Cloudbell,
  "cave-gel": Item.CaveGel,
  "wild-wheat": Item.Wheat,
  "appleheart-potion": Item.HealthPotion,
  "wayfarer-draught": Item.WayfarerPotion,
  "hearthward-tonic": Item.HearthwardTonic,
  "gloamstep-elixir": Item.GloamstepElixir,
  "honeymead": Item.Honeymead,
  "crossbow-bolt": Item.CrossbowBolt,
});

const RESOURCE_BY_ITEM = new Map(Object.entries(HEARTHROADS_RESOURCE_ITEMS).map(([resource, item]) => [item, resource] as const));

export function resourceItemCode(resourceId: string) {
  return HEARTHROADS_RESOURCE_ITEMS[resourceId] ?? null;
}

export function resourceIdForItem(item: ItemCode) {
  return RESOURCE_BY_ITEM.get(item) ?? null;
}

export function inventoryResourceCounts(inventory: readonly (InventorySlot | null)[], extras: Readonly<Record<string, number>> = {}) {
  const counts: Record<string, number> = { ...extras };
  for (const slot of inventory) {
    if (!slot) continue;
    const resource = resourceIdForItem(slot.item);
    if (resource) counts[resource] = (counts[resource] ?? 0) + slot.count;
  }
  return counts;
}

/** Returns only decreases; callers consume these counts from real inventory slots. */
export function consumedResourceDelta(before: Readonly<Record<string, number>>, after: Readonly<Record<string, number>>) {
  const consumed: Record<string, number> = {};
  for (const [resource, count] of Object.entries(before)) {
    const delta = Math.max(0, Math.trunc(count) - Math.max(0, Math.trunc(after[resource] ?? 0)));
    if (delta > 0 && resourceItemCode(resource) !== null) consumed[resource] = delta;
  }
  return consumed;
}

export const POTION_RECIPE_BY_ITEM: Readonly<Partial<Record<ItemCode, string>>> = Object.freeze({
  [Item.HealthPotion]: "appleheart-potion",
  [Item.WayfarerPotion]: "wayfarer-draught",
  [Item.HearthwardTonic]: "hearthward-tonic",
  [Item.GloamstepElixir]: "gloamstep-elixir",
});

export const COMMERCE_ITEM_CODES: Readonly<Record<string, ItemCode>> = Object.freeze({
  apple: Item.Apple,
  moonberry: Item.Berry,
  "honey-jar": Item.HoneyJar,
  "royal-jelly": Item.RoyalJelly,
  mead: Item.Honeymead,
  "raw-iron": Item.RawSunmetal,
  "raw-gold": Item.RawGold,
  "plant-fiber": Item.Fiber,
  crossbow: Item.HearthguardCrossbow,
  "fine-crossbow": Item.WayfarerCrossbow,
  bolt: Item.CrossbowBolt,
  "goblin-spear": Item.GoblinsmithSpear,
  "health-potion": Item.HealthPotion,
  "goblin-tonic": Item.GloamstepElixir,
  "hobbit-potion": Item.HearthwardTonic,
  "blueprint-crossbow": Item.HobbitCrossbowBlueprint,
  "blueprint-fine-crossbow": Item.FineCrossbowBlueprint,
  "blueprint-spear": Item.GoblinSpearBlueprint,
  "blueprint-goblin-tonic": Item.GloamstepBlueprint,
  "blueprint-hobbit-potion": Item.HearthwardBlueprint,
  "blueprint-mead": Item.MeadBlueprint,
  "cloudglass-relic": Item.CloudglassRelic,
  "unaligned-warg-orb": Item.CaptureOrb,
});

const COMMERCE_BY_ITEM = new Map(Object.entries(COMMERCE_ITEM_CODES).map(([key, item]) => [item, key] as const));

export function commerceItemCode(itemKey: string) {
  return COMMERCE_ITEM_CODES[itemKey] ?? null;
}

export function commerceKeyForItem(item: ItemCode) {
  return COMMERCE_BY_ITEM.get(item) ?? null;
}
