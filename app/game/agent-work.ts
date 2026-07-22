import { ITEMS, cloneSlot, itemForBlock, type InventorySlot, type ItemCode } from "./data";
import type { AgentBlockPlacement, AgentMaterialRequirement } from "./agent-platform";

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
