import {
  CALMING_OFFERING_SECONDS,
  CAPTURE_CALM_WINDOW_SECONDS,
  OUTMANEUVER_HOLD_SECONDS,
  OUTMANEUVER_REQUIRED_EVASIONS,
} from "./creature-capture";
import type { ItemCode } from "./data";

export const PACIFICATION_SCHEMA = 1 as const;
export const OUTMANEUVER_EVADE_MEMORY_SECONDS = 12;
export const PACIFICATION_RETRY_COOLDOWN_SECONDS = 2;

export type PacificationRoute = "outmaneuver" | "offering";

export type CreaturePacificationState = Readonly<{
  schemaVersion: typeof PACIFICATION_SCHEMA;
  participantId: string | null;
  cleanEvades: number;
  lastActionToken: string | null;
  evadeMemoryUntil: number;
  outmaneuverHoldStartedAt: number | null;
  offeringItem: ItemCode | null;
  offeringProgressSeconds: number;
  retryAfter: number;
  settledUntil: number;
  settledRoute: PacificationRoute | null;
}>;

export type PacificationProgressView = Readonly<{
  participantId: string | null;
  route: PacificationRoute | null;
  cleanEvades: number;
  holdSeconds: number;
  offeringItem: ItemCode | null;
  offeringSeconds: number;
  retrySeconds: number;
  settledSeconds: number;
  settledRoute: PacificationRoute | null;
}>;

export const createCreaturePacificationState = (): CreaturePacificationState => Object.freeze({
  schemaVersion: PACIFICATION_SCHEMA,
  participantId: null,
  cleanEvades: 0,
  lastActionToken: null,
  evadeMemoryUntil: 0,
  outmaneuverHoldStartedAt: null,
  offeringItem: null,
  offeringProgressSeconds: 0,
  retryAfter: 0,
  settledUntil: 0,
  settledRoute: null,
});

function clearExpired(state: CreaturePacificationState, now: number): CreaturePacificationState {
  let next = state;
  if (state.settledUntil > 0 && state.settledUntil <= now) {
    next = { ...next, settledUntil: 0, settledRoute: null };
  }
  if (next.evadeMemoryUntil > 0 && next.evadeMemoryUntil <= now && next.settledUntil <= now) {
    next = {
      ...next,
      participantId: next.offeringItem === null ? null : next.participantId,
      cleanEvades: 0,
      lastActionToken: null,
      evadeMemoryUntil: 0,
      outmaneuverHoldStartedAt: null,
    };
  }
  return next;
}
export function recordCleanCommittedEvade(
  state: CreaturePacificationState | null | undefined,
  participantId: string,
  actionToken: string,
  now: number,
): Readonly<{ state: CreaturePacificationState; accepted: boolean }> {
  const current = clearExpired(state ?? createCreaturePacificationState(), now);
  if (!participantId || !actionToken || current.lastActionToken === actionToken || current.offeringItem !== null) {
    return Object.freeze({ state: Object.freeze(current), accepted: false });
  }
  const sameAttempt = current.participantId === participantId && current.evadeMemoryUntil > now;
  const cleanEvades = Math.min(OUTMANEUVER_REQUIRED_EVASIONS, (sameAttempt ? current.cleanEvades : 0) + 1);
  return Object.freeze({
    accepted: true,
    state: Object.freeze({
      ...current,
      participantId,
      cleanEvades,
      lastActionToken: actionToken,
      evadeMemoryUntil: now + OUTMANEUVER_EVADE_MEMORY_SECONDS,
      outmaneuverHoldStartedAt: null,
      settledUntil: 0,
      settledRoute: null,
    }),
  });
}

export function advanceOutmaneuverAttempt(
  state: CreaturePacificationState | null | undefined,
  input: Readonly<{ participantId: string; now: number; outsideAttackEnvelope: boolean }>,
): CreaturePacificationState {
  const current = clearExpired(state ?? createCreaturePacificationState(), input.now);
  if (current.settledUntil > input.now || current.offeringItem !== null
    || current.participantId !== input.participantId || current.cleanEvades < OUTMANEUVER_REQUIRED_EVASIONS) {
    return Object.freeze(current);
  }
  if (!input.outsideAttackEnvelope) return Object.freeze({ ...current, outmaneuverHoldStartedAt: null });
  const startedAt = current.outmaneuverHoldStartedAt ?? input.now;
  if (input.now - startedAt < OUTMANEUVER_HOLD_SECONDS) {
    return Object.freeze({ ...current, outmaneuverHoldStartedAt: startedAt });
  }
  return Object.freeze({
    ...current,
    outmaneuverHoldStartedAt: startedAt,
    settledUntil: input.now + CAPTURE_CALM_WINDOW_SECONDS,
    settledRoute: "outmaneuver",
  });
}

export function beginCalmingOffering(
  state: CreaturePacificationState | null | undefined,
  input: Readonly<{ participantId: string; item: ItemCode; now: number }>,
): Readonly<{ state: CreaturePacificationState; accepted: boolean; reason: string | null }> {
  const current = clearExpired(state ?? createCreaturePacificationState(), input.now);
  if (current.settledUntil > input.now) {
    return Object.freeze({ state: Object.freeze(current), accepted: false, reason: "This creature is already calm and capture-ready." });
  }
  if (current.retryAfter > input.now) {
    return Object.freeze({ state: Object.freeze(current), accepted: false, reason: "Give the creature a moment before trying another offering." });
  }
  if (current.offeringItem !== null) {
    return Object.freeze({ state: Object.freeze(current), accepted: false, reason: "A calming offering is already active." });
  }
  return Object.freeze({
    accepted: true,
    reason: null,
    state: Object.freeze({
      ...current,
      participantId: input.participantId,
      cleanEvades: 0,
      lastActionToken: null,
      evadeMemoryUntil: 0,
      outmaneuverHoldStartedAt: null,
      offeringItem: input.item,
      offeringProgressSeconds: 0,
      settledUntil: 0,
      settledRoute: null,
    }),
  });
}

export function advanceCalmingOffering(
  state: CreaturePacificationState | null | undefined,
  input: Readonly<{
    participantId: string;
    now: number;
    deltaSeconds: number;
    safeAnchor: boolean;
    outsideWarningRing: boolean;
    creatureInterrupted: boolean;
    offeringAvailable: boolean;
  }>,
): Readonly<{ state: CreaturePacificationState; completed: boolean; consumeItem: ItemCode | null; interrupted: boolean }> {
  const current = clearExpired(state ?? createCreaturePacificationState(), input.now);
  if (current.offeringItem === null || current.participantId !== input.participantId) {
    return Object.freeze({ state: Object.freeze(current), completed: false, consumeItem: null, interrupted: false });
  }
  if (!input.safeAnchor || input.creatureInterrupted || !input.offeringAvailable) {
    return Object.freeze({
      state: Object.freeze({
        ...current,
        participantId: null,
        offeringItem: null,
        offeringProgressSeconds: 0,
        retryAfter: input.now + PACIFICATION_RETRY_COOLDOWN_SECONDS,
      }),
      completed: false,
      consumeItem: null,
      interrupted: true,
    });
  }
  const progress = input.outsideWarningRing
    ? Math.min(CALMING_OFFERING_SECONDS, current.offeringProgressSeconds + Math.max(0, input.deltaSeconds))
    : current.offeringProgressSeconds;
  if (progress < CALMING_OFFERING_SECONDS) {
    return Object.freeze({
      state: Object.freeze({ ...current, offeringProgressSeconds: progress }),
      completed: false,
      consumeItem: null,
      interrupted: false,
    });
  }
  return Object.freeze({
    state: Object.freeze({
      ...current,
      offeringItem: null,
      offeringProgressSeconds: CALMING_OFFERING_SECONDS,
      settledUntil: input.now + CAPTURE_CALM_WINDOW_SECONDS,
      settledRoute: "offering",
    }),
    completed: true,
    consumeItem: current.offeringItem,
    interrupted: false,
  });
}

/** Damage from either participant makes every non-damage route restart visibly. */
export function interruptPacificationWithDamage(
  state: CreaturePacificationState | null | undefined,
  now: number,
): CreaturePacificationState {
  const current = state ?? createCreaturePacificationState();
  return Object.freeze({
    ...current,
    participantId: null,
    cleanEvades: 0,
    lastActionToken: null,
    evadeMemoryUntil: 0,
    outmaneuverHoldStartedAt: null,
    offeringItem: null,
    offeringProgressSeconds: 0,
    retryAfter: now + PACIFICATION_RETRY_COOLDOWN_SECONDS,
    settledUntil: 0,
    settledRoute: null,
  });
}

export function pacificationProgressView(
  state: CreaturePacificationState | null | undefined,
  now: number,
): PacificationProgressView {
  const current = clearExpired(state ?? createCreaturePacificationState(), now);
  return Object.freeze({
    participantId: current.participantId,
    route: current.offeringItem !== null ? "offering" : current.cleanEvades > 0 ? "outmaneuver" : null,
    cleanEvades: current.cleanEvades,
    holdSeconds: current.outmaneuverHoldStartedAt === null ? 0 : Math.min(OUTMANEUVER_HOLD_SECONDS, Math.max(0, now - current.outmaneuverHoldStartedAt)),
    offeringItem: current.offeringItem,
    offeringSeconds: current.offeringProgressSeconds,
    retrySeconds: Math.max(0, current.retryAfter - now),
    settledSeconds: Math.max(0, current.settledUntil - now),
    settledRoute: current.settledUntil > now ? current.settledRoute : null,
  });
}
