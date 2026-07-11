import { MOB_DEFS, type MobKind, type MobTemperament } from "./mobs";
import { FACTION_IDS, type FactionId } from "./factions";

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };

export type CreatureMetadata = {
  schema: 1;
  entityId: string;
  kind: MobKind;
  health: number;
  maxHealth: number;
  ageTicks: number;
  baby: boolean;
  temperament: MobTemperament;
  hostile: boolean;
  tamed: boolean;
  ownerId: string | null;
  name: string | null;
  geneticSeed: number;
  command: string | null;
  /** Faction provenance must survive capture; aligned village animals never become neutral by being moved. */
  factionId?: FactionId | null;
  settlementId?: string | null;
  aligned?: boolean;
  custom: Record<string, JsonValue>;
};

export type CapturedCreature = {
  schema: 1;
  cageId: string;
  capturedAt: number;
  creature: CreatureMetadata;
};

function cloneJson<T extends JsonValue>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const TEMPERAMENTS = new Set<MobTemperament>(["Gentle", "Skittish", "Defensive", "Hostile"]);
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const validOptionalString = (value: unknown, maximum: number) => value === undefined || value === null
  || (typeof value === "string" && value.length <= maximum);

/** Strict at import boundaries, while supplying defaults for fields absent from old valid saves. */
export function normalizeCreatureMetadata(value: unknown): CreatureMetadata | null {
  if (!isRecord(value) || value.schema !== 1 || typeof value.entityId !== "string"
    || value.entityId.length === 0 || value.entityId.length > 160 || typeof value.kind !== "string"
    || !(value.kind in MOB_DEFS)) return null;
  const kind = value.kind as MobKind;
  const definition = MOB_DEFS[kind];
  const health = value.health;
  const maxHealth = value.maxHealth;
  if (typeof health !== "number" || !Number.isFinite(health) || typeof maxHealth !== "number"
    || !Number.isFinite(maxHealth) || maxHealth <= 0 || maxHealth > 100_000 || health < 0 || health > maxHealth) return null;
  if (value.ageTicks !== undefined && (typeof value.ageTicks !== "number" || !Number.isFinite(value.ageTicks) || value.ageTicks < 0)) return null;
  if (value.geneticSeed !== undefined && (typeof value.geneticSeed !== "number" || !Number.isFinite(value.geneticSeed))) return null;
  if (value.baby !== undefined && typeof value.baby !== "boolean") return null;
  if (value.hostile !== undefined && typeof value.hostile !== "boolean") return null;
  if (value.tamed !== undefined && typeof value.tamed !== "boolean") return null;
  if (value.aligned !== undefined && typeof value.aligned !== "boolean") return null;
  if (!validOptionalString(value.ownerId, 160) || !validOptionalString(value.name, 80)
    || !validOptionalString(value.command, 80) || !validOptionalString(value.settlementId, 160)) return null;
  const factionId = value.factionId;
  if (factionId !== undefined && factionId !== null
    && (typeof factionId !== "string" || !(FACTION_IDS as readonly string[]).includes(factionId))) return null;
  const custom = value.custom === undefined ? {} : value.custom;
  if (!isRecord(custom)) return null;
  try { if (JSON.stringify(custom).length > 16_384) return null; }
  catch { return null; }
  const temperament = typeof value.temperament === "string" && TEMPERAMENTS.has(value.temperament as MobTemperament)
    ? value.temperament as MobTemperament : definition.temperament;
  return {
    schema: 1,
    entityId: value.entityId,
    kind,
    health,
    maxHealth,
    ageTicks: Math.min(1_000_000_000, Math.floor(typeof value.ageTicks === "number" ? value.ageTicks : 24_000)),
    baby: value.baby === true,
    temperament,
    hostile: typeof value.hostile === "boolean" ? value.hostile : definition.hostile,
    tamed: value.tamed === true,
    ownerId: typeof value.ownerId === "string" ? value.ownerId : null,
    name: typeof value.name === "string" ? value.name : null,
    geneticSeed: (typeof value.geneticSeed === "number" ? Math.trunc(value.geneticSeed) : 0) >>> 0,
    command: typeof value.command === "string" ? value.command : null,
    ...(factionId !== undefined ? { factionId: typeof factionId === "string" ? factionId as FactionId : null } : {}),
    ...(value.settlementId !== undefined ? { settlementId: typeof value.settlementId === "string" ? value.settlementId : null } : {}),
    ...(value.aligned !== undefined ? { aligned: value.aligned === true } : {}),
    custom: cloneJson(custom as JsonValue) as Record<string, JsonValue>,
  };
}

export function cloneCreatureMetadata(metadata: CreatureMetadata): CreatureMetadata {
  return cloneJson(metadata as unknown as JsonValue) as unknown as CreatureMetadata;
}

/**
 * Friendly and neutral creatures are always cageable. Hostiles must be at one
 * heart or below half health; the one-heart rule deliberately covers a tiny
 * hostile whose maximum health itself is only one.
 */
export function canCaptureCreature(metadata: Pick<CreatureMetadata, "hostile" | "health" | "maxHealth">) {
  if (!metadata.hostile) return true;
  return metadata.health <= 1 || metadata.health < metadata.maxHealth * 0.5;
}

export function captureCreature(cageId: string, metadata: CreatureMetadata, capturedAt = Date.now()): CapturedCreature | null {
  if (!canCaptureCreature(metadata)) return null;
  return { schema: 1, cageId, capturedAt, creature: cloneCreatureMetadata(metadata) };
}

/** Returns an independent exact copy so placing a cage cannot mutate its saved payload. */
export function releaseCreature(captured: CapturedCreature) {
  return cloneCreatureMetadata(captured.creature);
}

export function encodeCapturedCreature(captured: CapturedCreature) {
  return JSON.stringify(captured);
}

export function decodeCapturedCreature(value: string): CapturedCreature | null {
  try {
    const parsed = JSON.parse(value) as Partial<CapturedCreature>;
    if (parsed.schema !== 1 || typeof parsed.cageId !== "string" || parsed.cageId.length === 0 || parsed.cageId.length > 80
      || typeof parsed.capturedAt !== "number" || !Number.isFinite(parsed.capturedAt) || parsed.capturedAt < 0) return null;
    const creature = normalizeCreatureMetadata(parsed.creature);
    return creature ? { schema: 1, cageId: parsed.cageId, capturedAt: parsed.capturedAt, creature } : null;
  } catch {
    return null;
  }
}
