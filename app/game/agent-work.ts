import { ITEMS, cloneSlot, itemForBlock, type InventorySlot, type ItemCode } from "./data";
import type { AgentBlockPlacement, AgentMaterialRequirement } from "./agent-platform";
import { inventorySlotStackLimit, inventorySlotsCanStack } from "./inventory-convenience";

export function transferAgentStacksExact(
  sourceSlots: readonly (InventorySlot | null)[],
  destinationSlots: readonly (InventorySlot | null)[],
  input: Readonly<{ sourceSlot: number; destinationSlot?: number | null; count: number }>,
) {
  const source = sourceSlots.map(cloneSlot);
  const destination = destinationSlots.map(cloneSlot);
  const sourceSlot = Math.trunc(input.sourceSlot);
  const sourceStack = source[sourceSlot];
  if (!sourceStack) return { ok: false as const, reason: "source_empty", source, destination, moved: 0 };
  const requestedCount = Math.max(1, Math.trunc(input.count) || 1);
  const explicitDestination = input.destinationSlot === undefined || input.destinationSlot === null ? null : Math.trunc(input.destinationSlot);
  const candidates = explicitDestination === null
    ? [...destination.map((_, index) => index).filter((index) => destination[index] && inventorySlotsCanStack(sourceStack, destination[index])), ...destination.map((_, index) => index).filter((index) => !destination[index])]
    : [explicitDestination];
  let remaining = Math.min(sourceStack.count, requestedCount);
  let moved = 0;
  let lastDestinationSlot: number | null = null;
  for (const destinationSlot of candidates) {
    if (destinationSlot < 0 || destinationSlot >= destination.length || remaining <= 0) continue;
    const target = destination[destinationSlot];
    if (target && !inventorySlotsCanStack(sourceStack, target)) continue;
    const room = inventorySlotStackLimit(sourceStack) - (target?.count ?? 0);
    const amount = Math.min(remaining, room);
    if (amount <= 0) continue;
    if (target) target.count += amount;
    else destination[destinationSlot] = cloneSlot({ ...sourceStack, count: amount });
    lastDestinationSlot = destinationSlot;
    remaining -= amount;
    moved += amount;
  }
  if (!moved) return { ok: false as const, reason: "destination_full", source, destination, moved: 0 };
  sourceStack.count -= moved;
  if (sourceStack.count <= 0) source[sourceSlot] = null;
  return { ok: true as const, source, destination, moved, destinationSlot: explicitDestination ?? lastDestinationSlot };
}

export function buildMaterialRequirements(placements: readonly AgentBlockPlacement[], inventory: readonly (InventorySlot | null)[]): AgentMaterialRequirement[] {
  const needs = new Map<ItemCode, number>();
  for (const placement of placements) {
    const item = itemForBlock(placement.block);
    needs.set(item, (needs.get(item) ?? 0) + 1);
  }
  return [...needs].map(([item, need]) => {
    const have = inventory.reduce((sum, slot) => sum + (slot?.item === item ? slot.count : 0), 0);
    return { block: item, name: ITEMS[item]?.name, have, need, missing: Math.max(0, need - have) };
  });
}

export function reserveBuildMaterials(inventory: readonly (InventorySlot | null)[], requirements: readonly AgentMaterialRequirement[]) {
  const slots = inventory.map(cloneSlot);
  const missing = requirements.filter((requirement) => slots.reduce((sum, slot) => sum + (slot?.item === requirement.block ? slot.count : 0), 0) < requirement.need);
  if (missing.length) return { ok: false as const, inventory: inventory.map(cloneSlot), missing };
  const reserved: Array<readonly [ItemCode, number]> = [];
  for (const requirement of requirements) {
    let remaining = requirement.need;
    for (let index = 0; index < slots.length && remaining > 0; index += 1) {
      const slot = slots[index];
      if (!slot || slot.item !== requirement.block) continue;
      const taken = Math.min(remaining, slot.count);
      slot.count -= taken;
      remaining -= taken;
      if (slot.count <= 0) slots[index] = null;
    }
    reserved.push([requirement.block as ItemCode, requirement.need]);
  }
  return { ok: true as const, inventory: slots, reserved };
}
