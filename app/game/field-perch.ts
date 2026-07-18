import type { CreatureMetadata } from "./creature-cage";
import { creatureEcologyContract } from "./creature-ecology";

export type FieldPerchAssignment = "sleep" | "scout";
export type FieldPerchSignalKind = "hostile" | "resource" | "weather" | "magic" | "coast" | "none";

export type FieldPerchSignal = Readonly<{
  kind: FieldPerchSignalKind;
  label: string;
  distance: number;
  observedDay: number;
}>;

export type FieldPerchState = Readonly<{
  schema: 1;
  resident: CreatureMetadata | null;
  assignment: FieldPerchAssignment;
  lastSignal: FieldPerchSignal | null;
  revision: number;
}>;

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

export function createFieldPerchState(): FieldPerchState {
  return Object.freeze({ schema: 1, resident: null, assignment: "sleep", lastSignal: null, revision: 0 });
}

export function normalizeFieldPerchState(value: unknown): FieldPerchState {
  const raw = value && typeof value === "object" ? value as Partial<FieldPerchState> : {};
  const resident = raw.resident && typeof raw.resident.kind === "string" && creatureEcologyContract(raw.resident.kind)?.perchEligible
    ? clone(raw.resident)
    : null;
  const signal = raw.lastSignal && typeof raw.lastSignal.label === "string" ? Object.freeze({
    kind: ["hostile", "resource", "weather", "magic", "coast", "none"].includes(raw.lastSignal.kind) ? raw.lastSignal.kind : "none",
    label: raw.lastSignal.label.slice(0, 96),
    distance: Math.max(0, Math.min(1024, Number(raw.lastSignal.distance) || 0)),
    observedDay: Math.max(0, Number(raw.lastSignal.observedDay) || 0),
  }) as FieldPerchSignal : null;
  return Object.freeze({
    schema: 1,
    resident,
    assignment: resident && raw.assignment === "scout" ? "scout" : "sleep",
    lastSignal: signal,
    revision: Math.max(0, Math.floor(Number(raw.revision) || 0)),
  });
}

export function canUseFieldPerch(metadata: Pick<CreatureMetadata, "kind">) {
  return creatureEcologyContract(metadata.kind)?.perchEligible === true;
}

export function placeBirdOnFieldPerch(state: FieldPerchState, metadata: CreatureMetadata): FieldPerchState | null {
  if (state.resident || !canUseFieldPerch(metadata)) return null;
  return Object.freeze({ ...state, resident: clone(metadata), assignment: "sleep", lastSignal: null, revision: state.revision + 1 });
}

export function takeBirdFromFieldPerch(state: FieldPerchState) {
  if (!state.resident) return null;
  return Object.freeze({
    metadata: clone(state.resident),
    state: Object.freeze({ ...state, resident: null, assignment: "sleep" as const, lastSignal: null, revision: state.revision + 1 }),
  });
}

export function setFieldPerchAssignment(state: FieldPerchState, assignment: FieldPerchAssignment): FieldPerchState {
  if (!state.resident) return state;
  return Object.freeze({ ...state, assignment, revision: state.revision + 1 });
}

/** Records one bounded, event-fed scouting result; no autonomous world scan lives in the perch record. */
export function recordFieldPerchSignal(state: FieldPerchState, signal: FieldPerchSignal): FieldPerchState {
  if (!state.resident || state.assignment !== "scout") return state;
  return Object.freeze({ ...state, lastSignal: Object.freeze({ ...signal, label: signal.label.slice(0, 96), distance: Math.max(0, Math.min(1024, signal.distance)) }), revision: state.revision + 1 });
}

export function normalizeFieldPerchStorage(value: unknown): Map<string, FieldPerchState> {
  if (!value || typeof value !== "object") return new Map();
  return new Map(Object.entries(value as Record<string, unknown>).map(([key, state]) => [key, normalizeFieldPerchState(state)]));
}
