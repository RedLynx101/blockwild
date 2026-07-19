import { Item, type InventorySlot } from "./data";
import {
  canCaptureCreature,
  cloneCreatureMetadata,
  decodeCapturedCreature,
  encodeCapturedCreature,
  normalizeCreatureMetadata,
  type CreatureMetadata,
} from "./creature-cage";
import type { CaptureLensId } from "./creature-capture";

export const CAPTURE_ORB_RACK_SIZE = 4;
export const CREATURE_HEALER_SIZE = 4;
export const ORB_RACK_CONTAINER_KIND = "orb-rack" as const;
export const HEALING_STATION_CONTAINER_KIND = "healing-station" as const;
export const CREATURE_HEAL_INTERVAL_SECONDS = 10;
export const CREATURE_PASSIVE_HEAL_INTERVAL_SECONDS = CREATURE_HEAL_INTERVAL_SECONDS * 2;
export const CREATURE_HEALER_GEL_CAP = 64;

export type CaptureOrbAttunement = Readonly<{
  ownerId: string;
  attunedAt: number;
  activeEntityId: string | null;
  recalledAt: number;
  recallCount: number;
  fainted: boolean;
}>;

export type CaptureOrb = Readonly<{
  schema: 1;
  orbId: string;
  capturedAt: number;
  creature: CreatureMetadata | null;
  /** Fitted lenses alter valid ecological approaches, never hidden odds. */
  lens?: CaptureLensId | null;
  /** An attuned orb remains linked while its creature is deployed. */
  attunement?: CaptureOrbAttunement | null;
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
  lens: null,
  attunement: null,
});

export function fitCaptureOrbLens(orb: CaptureOrb, lens: CaptureLensId | null): CaptureOrb | null {
  if (orb.creature || orb.attunement?.activeEntityId) return null;
  return { ...orb, lens };
}

export function captureIntoOrb(orb: CaptureOrb, creature: CreatureMetadata, capturedAt = Date.now()): CaptureOrb | null {
  if (orb.creature || !canCaptureCreature(creature)) return null;
  return { ...orb, capturedAt, creature: cloneCreatureMetadata(creature), attunement: null };
}

export function releaseCaptureOrb(orb: CaptureOrb): { orb: CaptureOrb; creature: CreatureMetadata } | null {
  if (!orb.creature) return null;
  return {
    orb: { ...orb, capturedAt: 0, creature: null, attunement: null },
    creature: cloneCreatureMetadata(orb.creature),
  };
}

const cleanOwnerId = (ownerId: string) => ownerId.trim().slice(0, 160);

export function attuneCaptureOrb(orb: CaptureOrb, ownerId: string, attunedAt = Date.now()): CaptureOrb | null {
  const owner = cleanOwnerId(ownerId);
  if (!orb.creature || !owner || orb.attunement?.activeEntityId || orb.creature.health <= 0) return null;
  if (orb.attunement && orb.attunement.ownerId !== owner) return null;
  return {
    ...orb,
    attunement: {
      ownerId: owner,
      attunedAt: Math.max(0, Number.isFinite(attunedAt) ? attunedAt : 0),
      activeEntityId: null,
      recalledAt: orb.attunement?.recalledAt ?? 0,
      recallCount: orb.attunement?.recallCount ?? 0,
      fainted: false,
    },
  };
}

export function unattuneCaptureOrb(orb: CaptureOrb, ownerId: string): CaptureOrb | null {
  const attunement = orb.attunement;
  if (!attunement || attunement.ownerId !== cleanOwnerId(ownerId) || attunement.activeEntityId || attunement.fainted
    || !orb.creature || orb.creature.health <= 0) return null;
  return { ...orb, attunement: null };
}

export type AttunedOrbDeployment = Readonly<{ orb: CaptureOrb; creature: CreatureMetadata }>;

/** Deploys an attuned creature without emptying its linked orb. */
export function deployAttunedCaptureOrb(orb: CaptureOrb, ownerId: string): AttunedOrbDeployment | null {
  const attunement = orb.attunement;
  if (!orb.creature || !attunement || attunement.ownerId !== cleanOwnerId(ownerId) || attunement.activeEntityId
    || attunement.fainted || orb.creature.health <= 0) return null;
  const creature = cloneCreatureMetadata(orb.creature);
  creature.ownerId = ownerId;
  creature.custom = { ...creature.custom, attunedOrbId: orb.orbId };
  return {
    creature,
    orb: { ...orb, attunement: { ...attunement, activeEntityId: creature.entityId } },
  };
}

export type AttunedRecallReason = "manual" | "fainted";
export type AttunedRecallEffect = Readonly<{
  tint: "white";
  sparkleColor: "#f6fbff";
  particleCount: number;
  durationSeconds: number;
}>;

/** Returns the current exact creature state to its orb and describes the shared recall visual. */
export function recallAttunedCreature(
  orb: CaptureOrb,
  creature: CreatureMetadata,
  ownerId: string,
  reason: AttunedRecallReason = "manual",
  recalledAt = Date.now(),
): Readonly<{ orb: CaptureOrb; effect: AttunedRecallEffect }> | null {
  const attunement = orb.attunement;
  if (!attunement || attunement.ownerId !== cleanOwnerId(ownerId) || !attunement.activeEntityId
    || attunement.activeEntityId !== creature.entityId) return null;
  const stored = cloneCreatureMetadata(creature);
  stored.custom = { ...stored.custom, attunedOrbId: orb.orbId };
  if (reason === "fainted") stored.health = 0;
  const fainted = reason === "fainted" || stored.health <= 0;
  return {
    orb: {
      ...orb,
      creature: stored,
      capturedAt: Math.max(0, Number.isFinite(recalledAt) ? recalledAt : 0),
      attunement: {
        ...attunement,
        activeEntityId: null,
        recalledAt: Math.max(0, Number.isFinite(recalledAt) ? recalledAt : 0),
        recallCount: attunement.recallCount + 1,
        fainted,
      },
    },
    effect: { tint: "white", sparkleColor: "#f6fbff", particleCount: 28, durationSeconds: 0.72 },
  };
}

export function refreshAttunedOrbHealth(orb: CaptureOrb): CaptureOrb {
  if (!orb.creature || !orb.attunement) return orb;
  const fainted = orb.creature.health <= 0;
  return fainted === orb.attunement.fainted ? orb : { ...orb, attunement: { ...orb.attunement, fainted } };
}

export function encodeCaptureOrb(orb: CaptureOrb) {
  return JSON.stringify(orb);
}

export function decodeCaptureOrb(value: string): CaptureOrb | null {
  try {
    const parsed = JSON.parse(value) as Partial<CaptureOrb>;
    if (parsed.schema !== 1 || typeof parsed.orbId !== "string" || parsed.orbId.length === 0 || parsed.orbId.length > 80
      || typeof parsed.capturedAt !== "number" || !Number.isFinite(parsed.capturedAt) || parsed.capturedAt < 0) return null;
    if (parsed.creature === null) {
      const lens = (parsed as Partial<CaptureOrb>).lens;
      if (lens !== undefined && lens !== null && !["gentle", "gloam", "tide", "resonance"].includes(lens)) return null;
      return { ...createEmptyCaptureOrb(parsed.orbId), lens: lens ?? null };
    }
    const creature = normalizeCreatureMetadata(parsed.creature);
    if (!creature) return null;
    const rawAttunement = (parsed as Partial<CaptureOrb>).attunement;
    let attunement: CaptureOrbAttunement | null = null;
    if (rawAttunement !== undefined && rawAttunement !== null) {
      if (typeof rawAttunement !== "object" || typeof rawAttunement.ownerId !== "string" || rawAttunement.ownerId.length === 0
        || rawAttunement.ownerId.length > 160 || typeof rawAttunement.attunedAt !== "number" || !Number.isFinite(rawAttunement.attunedAt)
        || typeof rawAttunement.recalledAt !== "number" || !Number.isFinite(rawAttunement.recalledAt)
        || typeof rawAttunement.recallCount !== "number" || !Number.isFinite(rawAttunement.recallCount)
        || (rawAttunement.activeEntityId !== null && (typeof rawAttunement.activeEntityId !== "string" || rawAttunement.activeEntityId.length > 160))
        || typeof rawAttunement.fainted !== "boolean") return null;
      attunement = {
        ownerId: rawAttunement.ownerId,
        attunedAt: Math.max(0, rawAttunement.attunedAt),
        activeEntityId: rawAttunement.activeEntityId,
        recalledAt: Math.max(0, rawAttunement.recalledAt),
        recallCount: Math.max(0, Math.floor(rawAttunement.recallCount)),
        fainted: rawAttunement.fainted || creature.health <= 0,
      };
    }
    const lens = (parsed as Partial<CaptureOrb>).lens;
    if (lens !== undefined && lens !== null && !["gentle", "gloam", "tide", "resonance"].includes(lens)) return null;
    return { schema: 1, orbId: parsed.orbId, capturedAt: parsed.capturedAt, creature, lens: lens ?? null, attunement };
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
        attuned: Boolean(orb.attunement),
        attunedOwnerId: orb.attunement?.ownerId,
        deployed: Boolean(orb.attunement?.activeEntityId),
        fainted: Boolean(orb.attunement?.fainted || creature.health <= 0),
        captureLens: orb.lens ?? null,
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
      slots[index] = refreshAttunedOrbHealth({ ...orb, creature });
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
