import { Item, type InventorySlot } from "./data";
import {
  canCaptureCreature,
  cloneCreatureMetadata,
  decodeCapturedCreature,
  encodeCapturedCreature,
  type CreatureMetadata,
} from "./creature-cage";

export const CAPTURE_ORB_RACK_SIZE = 4;
export const CREATURE_HEALER_SIZE = 4;
export const ORB_RACK_CONTAINER_KIND = "orb-rack" as const;
export const HEALING_STATION_CONTAINER_KIND = "healing-station" as const;
export const CREATURE_HEAL_INTERVAL_SECONDS = 10;
export const CREATURE_PASSIVE_HEAL_INTERVAL_SECONDS = CREATURE_HEAL_INTERVAL_SECONDS * 2;
export const CREATURE_HEALER_GEL_CAP = 64;

export type CaptureOrb = Readonly<{
  schema: 1;
  orbId: string;
  capturedAt: number;
  creature: CreatureMetadata | null;
}>;

export type OrbRackState = Readonly<{
  schema: 1;
  slots: readonly (CaptureOrb | null)[];
}>;

export type CreatureHealerState = Readonly<{
  schema: 1;
  slots: readonly (CaptureOrb | null)[];
  gelUnits: number;
  healClock: number;
  healCycles: number;
}>;

export const createEmptyCaptureOrb = (orbId: string): CaptureOrb => ({
  schema: 1,
  orbId: orbId.trim().slice(0, 80) || "orb",
  capturedAt: 0,
  creature: null,
});

export function captureIntoOrb(orb: CaptureOrb, creature: CreatureMetadata, capturedAt = Date.now()): CaptureOrb | null {
  if (orb.creature || !canCaptureCreature(creature)) return null;
  return { ...orb, capturedAt, creature: cloneCreatureMetadata(creature) };
}

export function releaseCaptureOrb(orb: CaptureOrb): { orb: CaptureOrb; creature: CreatureMetadata } | null {
  if (!orb.creature) return null;
  return {
    orb: { ...orb, capturedAt: 0, creature: null },
    creature: cloneCreatureMetadata(orb.creature),
  };
}

export function encodeCaptureOrb(orb: CaptureOrb) {
  return JSON.stringify(orb);
}

export function decodeCaptureOrb(value: string): CaptureOrb | null {
  try {
    const parsed = JSON.parse(value) as Partial<CaptureOrb>;
    if (parsed.schema !== 1 || typeof parsed.orbId !== "string" || typeof parsed.capturedAt !== "number") return null;
    if (parsed.creature === null) return createEmptyCaptureOrb(parsed.orbId);
    const creature = parsed.creature as Partial<CreatureMetadata> | undefined;
    if (!creature || creature.schema !== 1 || typeof creature.entityId !== "string" || typeof creature.kind !== "string") return null;
    if (typeof creature.health !== "number" || typeof creature.maxHealth !== "number") return null;
    return { schema: 1, orbId: parsed.orbId, capturedAt: parsed.capturedAt, creature: cloneCreatureMetadata(creature as CreatureMetadata) };
  } catch {
    return null;
  }
}

export function captureOrbInventorySlot(orb: CaptureOrb): InventorySlot {
  const creature = orb.creature;
  return {
    item: Item.CaptureOrb,
    count: 1,
    metadata: {
      captureOrb: encodeCaptureOrb(orb),
      // The engine's former cage payload is retained during the save migration.
      ...(creature ? { capturedCreature: encodeCapturedCreature({ schema: 1, cageId: orb.orbId, capturedAt: orb.capturedAt, creature: cloneCreatureMetadata(creature) }) } : {}),
      ...(creature ? {
        name: creature.name,
        species: creature.kind,
        tamed: creature.tamed,
        baby: creature.baby,
        health: creature.health,
        maxHealth: creature.maxHealth,
      } : {}),
    },
  };
}

export function captureOrbFromInventorySlot(slot: InventorySlot | null | undefined) {
  if (!slot || (slot.item !== Item.CaptureOrb && slot.item !== Item.LegacyCaptureOrb) || slot.count !== 1) return null;
  if (typeof slot.metadata?.captureOrb === "string") return decodeCaptureOrb(slot.metadata.captureOrb);
  if (typeof slot.metadata?.capturedCreature === "string") {
    const legacy = decodeCapturedCreature(slot.metadata.capturedCreature);
    if (legacy) return {
      schema: 1 as const,
      orbId: legacy.cageId,
      capturedAt: legacy.capturedAt,
      creature: cloneCreatureMetadata(legacy.creature),
    };
  }
  return createEmptyCaptureOrb(`orb-${slot.item}`);
}

/** Normalizes both old cage saves and the short-lived id 178 into item id 156. */
export function migrateCaptureOrbInventorySlot(slot: InventorySlot): InventorySlot {
  const orb = captureOrbFromInventorySlot(slot);
  return orb ? captureOrbInventorySlot(orb) : slot;
}

export function createOrbRack(slots: readonly (CaptureOrb | null)[] = []): OrbRackState {
  return {
    schema: 1,
    slots: Array.from({ length: CAPTURE_ORB_RACK_SIZE }, (_, index) => slots[index] ?? null),
  };
}

export function orbRackContainerStatus(state: OrbRackState) {
  return { kind: ORB_RACK_CONTAINER_KIND, capacity: CAPTURE_ORB_RACK_SIZE, occupied: state.slots.filter(Boolean).length, slots: state.slots } as const;
}

export function setRackOrb(state: OrbRackState, index: number, orb: CaptureOrb | null): OrbRackState {
  if (!Number.isInteger(index) || index < 0 || index >= CAPTURE_ORB_RACK_SIZE) return state;
  const slots = [...state.slots];
  slots[index] = orb;
  return { ...state, slots };
}

export function createCreatureHealer(slots: readonly (CaptureOrb | null)[] = [], gelUnits = 0): CreatureHealerState {
  return {
    schema: 1,
    slots: Array.from({ length: CREATURE_HEALER_SIZE }, (_, index) => slots[index] ?? null),
    gelUnits: Math.max(0, Math.min(CREATURE_HEALER_GEL_CAP, Math.floor(gelUnits))),
    healClock: 0,
    healCycles: 0,
  };
}

export function setHealerOrb(state: CreatureHealerState, index: number, orb: CaptureOrb | null): CreatureHealerState {
  if (!Number.isInteger(index) || index < 0 || index >= CREATURE_HEALER_SIZE) return state;
  const slots = [...state.slots];
  slots[index] = orb;
  return { ...state, slots };
}

/**
 * Every deposited creature heals passively once per twenty seconds. Cave Gel
 * optionally adds an accelerated heal on the intervening ten-second cycles.
 */
export function stepCreatureHealer(state: CreatureHealerState, deltaSeconds: number): { state: CreatureHealerState; healed: number; gelUsed: number } {
  const dt = Math.max(0, Math.min(3600, deltaSeconds));
  let healClock = state.healClock + dt;
  let gelUnits = state.gelUnits;
  const slots = [...state.slots];
  let healed = 0;
  let gelUsed = 0;
  let healCycles = state.healCycles;
  const cycles = Math.min(360, Math.floor(healClock / CREATURE_HEAL_INTERVAL_SECONDS));
  healClock -= cycles * CREATURE_HEAL_INTERVAL_SECONDS;
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    healCycles += 1;
    const passiveCycle = healCycles % (CREATURE_PASSIVE_HEAL_INTERVAL_SECONDS / CREATURE_HEAL_INTERVAL_SECONDS) === 0;
    for (let index = 0; index < slots.length; index += 1) {
      const orb = slots[index];
      if (!orb?.creature || orb.creature.health >= orb.creature.maxHealth) continue;
      const accelerated = !passiveCycle && gelUnits > 0;
      if (!passiveCycle && !accelerated) continue;
      const creature = cloneCreatureMetadata(orb.creature);
      creature.health = Math.min(creature.maxHealth, creature.health + 1);
      slots[index] = { ...orb, creature };
      if (accelerated) {
        gelUnits -= 1;
        gelUsed += 1;
      }
      healed += 1;
    }
  }
  return { state: { ...state, slots, gelUnits, healClock, healCycles }, healed, gelUsed };
}

export function healingStationContainerStatus(state: CreatureHealerState) {
  return {
    kind: HEALING_STATION_CONTAINER_KIND,
    capacity: CREATURE_HEALER_SIZE,
    gelUnits: state.gelUnits,
    progress: state.healClock / CREATURE_HEAL_INTERVAL_SECONDS,
    slots: state.slots.map((orb) => orb?.creature ? {
      orbId: orb.orbId,
      kind: orb.creature.kind,
      name: orb.creature.name,
      health: orb.creature.health,
      maxHealth: orb.creature.maxHealth,
      healing: orb.creature.health < orb.creature.maxHealth,
    } : null),
  } as const;
}
