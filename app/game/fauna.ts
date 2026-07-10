import * as THREE from "three";
import type { BirdKind, MobKind } from "./mobs";

const TAU = Math.PI * 2;

export function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export type StableSteeringState = {
  heading: number;
  targetHeading: number;
  avoidanceHold: number;
  blockedFrames: number;
  avoidanceSequence: number;
};

export type StableSteeringInput = {
  dt: number;
  turnRate: number;
  blocked: boolean;
  mobId: number;
  desiredHeading?: number;
};

export function createStableSteering(heading = 0): StableSteeringState {
  const normalized = normalizeAngle(heading);
  return { heading: normalized, targetHeading: normalized, avoidanceHold: 0, blockedFrames: 0, avoidanceSequence: 0 };
}

/**
 * Holds one avoidance choice long enough for a creature to translate around an
 * obstacle. Re-rolling a heading on every blocked frame is what caused large
 * Ridgebacks to rapidly twitch left and right without making progress.
 */
export function updateStableSteering(state: StableSteeringState, input: StableSteeringInput): StableSteeringState {
  const dt = Math.max(0, Math.min(input.dt, 0.1));
  let targetHeading = state.targetHeading;
  let avoidanceHold = Math.max(0, state.avoidanceHold - dt);
  const blockedFrames = input.blocked ? state.blockedFrames + 1 : 0;
  let avoidanceSequence = state.avoidanceSequence;

  if (!input.blocked && input.desiredHeading !== undefined && avoidanceHold <= 0) targetHeading = normalizeAngle(input.desiredHeading);
  if (input.blocked && avoidanceHold <= 0) {
    // A stable per-encounter side prevents tiny collision differences from
    // alternating the animal's turn direction across adjacent frames.
    const side = ((input.mobId * 31 + avoidanceSequence * 17) & 1) === 0 ? -1 : 1;
    const turn = 0.78 + ((input.mobId + avoidanceSequence) % 4) * 0.16;
    targetHeading = normalizeAngle(state.heading + side * turn);
    avoidanceHold = 0.46 + (input.mobId % 3) * 0.08;
    avoidanceSequence += 1;
  }

  const delta = normalizeAngle(targetHeading - state.heading);
  const deadZone = 0.012;
  const maxStep = Math.max(0, input.turnRate) * dt;
  const heading = Math.abs(delta) <= deadZone
    ? targetHeading
    : normalizeAngle(state.heading + THREE.MathUtils.clamp(delta, -maxStep, maxStep));
  if (!Number.isFinite(heading) || !Number.isFinite(targetHeading)) return createStableSteering(0);
  return { heading, targetHeading, avoidanceHold, blockedFrames, avoidanceSequence };
}

export type BirdMode = "forage" | "perch" | "takeoff" | "flight" | "flee";
export type BirdBehaviorState = {
  kind: BirdKind;
  mode: BirdMode;
  timer: number;
  perchId: string | null;
  altitude: number;
  wingPhase: number;
};

export type BirdStimulus = {
  dt: number;
  distanceToHuman: number;
  humanSpeed: number;
  attacked: boolean;
  perchId?: string | null;
  perchHeight?: number;
  onGround: boolean;
  random?: number;
};

export function createBirdBehavior(kind: BirdKind, phase = 0): BirdBehaviorState {
  return { kind, mode: "perch", timer: 1.5, perchId: null, altitude: 0.15, wingPhase: phase % TAU };
}

/** Pure state transition helper shared by both bird variants. */
export function updateBirdBehavior(state: BirdBehaviorState, stimulus: BirdStimulus): BirdBehaviorState {
  const dt = Math.max(0, Math.min(stimulus.dt, 0.1));
  const random = THREE.MathUtils.clamp(stimulus.random ?? 0.5, 0, 1);
  const rushed = stimulus.distanceToHuman < 7 && stimulus.humanSpeed > 2.1;
  const crowded = stimulus.distanceToHuman < 2.8;
  let mode = state.mode;
  let timer = Math.max(0, state.timer - dt);
  let perchId = state.perchId;
  let altitude = state.altitude;

  if (stimulus.attacked || rushed || crowded) {
    mode = state.mode === "perch" || state.mode === "forage" ? "takeoff" : "flee";
    timer = stimulus.attacked ? 6 : 3.2;
    perchId = null;
  } else if (mode === "takeoff" && timer < 2.85) {
    mode = "flee";
  } else if (mode === "flee" && timer <= 0) {
    mode = "flight";
    timer = 2 + random * 2;
  } else if (mode === "flight" && timer <= 0 && stimulus.perchId) {
    mode = "perch";
    timer = 2.5 + random * 5;
    perchId = stimulus.perchId;
  } else if (mode === "perch" && timer <= 0) {
    mode = random < 0.58 ? "forage" : "flight";
    timer = 1.5 + random * 3;
    if (mode === "flight") perchId = null;
  } else if (mode === "forage" && timer <= 0) {
    mode = stimulus.perchId ? "flight" : "forage";
    timer = 1.2 + random * 2.2;
  }

  const targetAltitude = mode === "perch" ? Math.max(0.12, stimulus.perchHeight ?? 0.12)
    : mode === "forage" && stimulus.onGround ? 0.08
      : mode === "takeoff" ? 2.6 : mode === "flee" ? 4.2 : 2.4;
  altitude += (targetAltitude - altitude) * (1 - Math.exp(-dt * (mode === "takeoff" ? 7 : 3.5)));
  const flapRate = mode === "perch" || mode === "forage" ? 2.5 : mode === "flee" ? 18 : 12;
  return { ...state, mode, timer, perchId, altitude, wingPhase: (state.wingPhase + dt * flapRate) % TAU };
}

export type FishHabitat = "ocean" | "river" | "underground";

export function fishKindsForHabitat(habitat: FishHabitat): MobKind[] {
  if (habitat === "ocean") return ["shoalfin", "coralback"];
  if (habitat === "river") return ["brookdart"];
  return ["gloomfin"];
}

export type PersistenceContext = {
  tamed?: boolean;
  named?: boolean;
  enclosed?: boolean;
  captured?: boolean;
  persistentPoiResident?: boolean;
};

/** Tamed, named, caged, POI-bound, or genuinely enclosed creatures never despawn. */
export function shouldKeepCreatureLoaded(context: PersistenceContext) {
  return Boolean(context.tamed || context.named || context.enclosed || context.captured || context.persistentPoiResident);
}
