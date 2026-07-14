import { captureOrbFromInventorySlot, decodeCaptureOrb } from "./capture-orbs";
import { ITEMS, Item, type InventorySlot } from "./data";

export type InventoryTransferResult = Readonly<{
  source: readonly (InventorySlot | null)[];
  target: readonly (InventorySlot | null)[];
  moved: number;
}>;

export type InventoryDragButton = "left" | "right";

export type InventoryDragDistribution = Readonly<{
  cursor: InventorySlot | null;
  slots: readonly (InventorySlot | null)[];
  moved: number;
}>;

export const GOLD_PER_INGOT = 10;

const cloneSlot = (slot: InventorySlot | null | undefined): InventorySlot | null => slot ? {
  ...slot,
  ...(slot.metadata ? { metadata: structuredClone(slot.metadata) } : {}),
} : null;

const metadataSignature = (metadata: InventorySlot["metadata"]) => {
  if (!metadata) return "";
  const normalize = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, entry]) => [key, normalize(entry)]));
    return value;
  };
  return JSON.stringify(normalize(metadata));
};

export function inventoryStackSignature(slot: InventorySlot) {
  return `${slot.item}:${slot.durability ?? ""}:${metadataSignature(slot.metadata)}`;
}

/**
 * Detects a creature payload even on an invalid legacy count-greater-than-one
 * slot. `captureOrbFromInventorySlot` deliberately rejects those malformed
 * stacks, so the direct payload check keeps inventory repair conservative.
 */
export function isFilledCaptureOrbSlot(slot: InventorySlot | null | undefined) {
  if (!slot || (slot.item !== Item.CaptureOrb && slot.item !== Item.LegacyCaptureOrb)) return false;
  if (captureOrbFromInventorySlot(slot)?.creature) return true;
  const encoded = slot.metadata?.captureOrb;
  if (typeof encoded === "string" && decodeCaptureOrb(encoded)?.creature) return true;
  return typeof slot.metadata?.capturedCreature === "string";
}

/** Filled Capture Orbs are exact creature records and always stay singletons. */
export function inventorySlotStackLimit(slot: InventorySlot) {
  return isFilledCaptureOrbSlot(slot) ? 1 : Math.max(1, ITEMS[slot.item]?.maxStack ?? 64);
}

export function inventorySlotsCanStack(left: InventorySlot | null | undefined, right: InventorySlot | null | undefined) {
  return Boolean(left && right
    && !isFilledCaptureOrbSlot(left)
    && !isFilledCaptureOrbSlot(right)
    && inventoryStackSignature(left) === inventoryStackSignature(right)
    && inventorySlotStackLimit(left) > 1);
}

/**
 * Minecraft-style carried-stack painting. A right drag leaves one item in each
 * compatible visited slot. A left drag places the floor-divided share into
 * each compatible visited slot and leaves the remainder carried, preserving
 * exact durability and metadata.
 */
export function distributeInventoryCursor(
  cursorSlot: InventorySlot | null | undefined,
  targetSlots: readonly (InventorySlot | null)[],
  button: InventoryDragButton,
): InventoryDragDistribution {
  const cursor = cloneSlot(cursorSlot);
  const slots = targetSlots.map(cloneSlot);
  if (!cursor || cursor.count <= 0 || slots.length === 0) return { cursor, slots, moved: 0 };

  const eligible = slots.flatMap((slot, index) => {
    if (!slot) return [index];
    if (!inventorySlotsCanStack(cursor, slot) || slot.count >= inventorySlotStackLimit(slot)) return [];
    return [index];
  });
  if (eligible.length === 0) return { cursor, slots, moved: 0 };

  const placeOne = (index: number) => {
    const target = slots[index];
    if (!target) slots[index] = { ...cloneSlot(cursor)!, count: 1 };
    else target.count += 1;
    cursor.count -= 1;
  };

  if (button === "right") {
    for (const index of eligible) {
      if (cursor.count <= 0) break;
      placeOne(index);
    }
  } else {
    // Minecraft's left-drag quota is calculated once from the number of valid
    // visited slots. Remainders and any quota blocked by stack capacity stay
    // on the cursor instead of being redistributed into roomier slots.
    const quota = Math.floor(cursor.count / eligible.length);
    if (quota > 0) for (const index of eligible) {
      const target = slots[index];
      const capacity = inventorySlotStackLimit(target ?? cursor) - (target?.count ?? 0);
      const moved = Math.min(quota, capacity, cursor.count);
      if (moved <= 0) continue;
      if (!target) slots[index] = { ...cloneSlot(cursor)!, count: moved };
      else target.count += moved;
      cursor.count -= moved;
    }
  }

  const moved = Math.max(0, (cursorSlot?.count ?? 0) - cursor.count);
  return { cursor: cursor.count > 0 ? cursor : null, slots, moved };
}

function addStack(target: (InventorySlot | null)[], incoming: InventorySlot) {
  let remaining = incoming.count;
  const limit = inventorySlotStackLimit(incoming);
  if (limit > 1) for (const slot of target) {
    if (!slot || !inventorySlotsCanStack(slot, incoming) || slot.count >= limit) continue;
    const moved = Math.min(remaining, limit - slot.count);
    slot.count += moved;
    remaining -= moved;
    if (remaining <= 0) break;
  }
  while (remaining > 0) {
    const index = target.findIndex((slot) => !slot);
    if (index < 0) break;
    const moved = Math.min(remaining, limit);
    target[index] = { ...cloneSlot(incoming)!, count: moved };
    remaining -= moved;
  }
  return remaining;
}

/** Sorts and compacts one bounded region; callers can leave hotbar slots untouched. */
export function sortInventoryRegion(slots: readonly (InventorySlot | null)[], start = 0, end = slots.length) {
  const result = slots.map(cloneSlot);
  const boundedStart = Math.max(0, Math.min(result.length, Math.floor(start)));
  const boundedEnd = Math.max(boundedStart, Math.min(result.length, Math.floor(end)));
  const compact: (InventorySlot | null)[] = Array.from({ length: boundedEnd - boundedStart }, () => null);
  for (let index = boundedStart; index < boundedEnd; index += 1) {
    const slot = result[index];
    if (slot) addStack(compact, slot);
  }
  const ordered = compact.filter((slot): slot is InventorySlot => Boolean(slot)).sort((left, right) => {
    const leftName = ITEMS[left.item]?.name ?? String(left.item);
    const rightName = ITEMS[right.item]?.name ?? String(right.item);
    return leftName.localeCompare(rightName) || left.item - right.item || inventoryStackSignature(left).localeCompare(inventoryStackSignature(right));
  });
  for (let index = boundedStart; index < boundedEnd; index += 1) result[index] = ordered[index - boundedStart] ?? null;
  return result;
}

export function transferInventoryStacks(
  sourceSlots: readonly (InventorySlot | null)[],
  targetSlots: readonly (InventorySlot | null)[],
  options: Readonly<{ onlyAlreadyPresent?: boolean; sourceStart?: number; sourceEnd?: number }> = {},
): InventoryTransferResult {
  const source = sourceSlots.map(cloneSlot);
  const target = targetSlots.map(cloneSlot);
  const sourceStart = Math.max(0, Math.min(source.length, options.sourceStart ?? 0));
  const sourceEnd = Math.max(sourceStart, Math.min(source.length, options.sourceEnd ?? source.length));
  // A metadata-backed creature orb, written book, or worn tool is not the same
  // stack merely because its numeric item id matches. Stack-to-container is
  // intentionally conservative and only moves exact compatible signatures.
  const acceptedStacks = new Set(target.filter((slot): slot is InventorySlot => Boolean(slot)).map(inventoryStackSignature));
  let moved = 0;
  for (let index = sourceStart; index < sourceEnd; index += 1) {
    const slot = source[index];
    if (!slot || (options.onlyAlreadyPresent && (inventorySlotStackLimit(slot) <= 1 || !acceptedStacks.has(inventoryStackSignature(slot))))) continue;
    const remainder = addStack(target, slot);
    moved += slot.count - remainder;
    source[index] = remainder > 0 ? { ...slot, count: remainder } : null;
  }
  return { source, target, moved };
}

export function goldForIngots(count: number) {
  return Math.max(0, Math.floor(count)) * GOLD_PER_INGOT;
}

export function ingotsAvailableFromWallet(balance: string, requested = Number.POSITIVE_INFINITY) {
  const safeBalance = /^\d+$/u.test(balance) ? BigInt(balance) : BigInt(0);
  const available = safeBalance / BigInt(GOLD_PER_INGOT);
  const boundedRequest = Number.isFinite(requested) ? BigInt(Math.max(0, Math.floor(requested))) : available;
  return Number(available < boundedRequest ? available : boundedRequest);
}
