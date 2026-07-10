import type { MobKind, MobTemperament } from "./mobs";

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
    const creature = parsed.creature as Partial<CreatureMetadata> | undefined;
    if (parsed.schema !== 1 || typeof parsed.cageId !== "string" || typeof parsed.capturedAt !== "number" || !creature) return null;
    if (creature.schema !== 1 || typeof creature.entityId !== "string" || typeof creature.kind !== "string") return null;
    if (typeof creature.health !== "number" || typeof creature.maxHealth !== "number" || !Number.isFinite(creature.health) || !Number.isFinite(creature.maxHealth)) return null;
    return cloneJson(parsed as JsonValue) as unknown as CapturedCreature;
  } catch {
    return null;
  }
}
