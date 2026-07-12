import type { MobDefinition, MobMovement } from "./mobs";

const TAU = Math.PI * 2;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeAngle(angle: number) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

export type CreatureSizeClass = "small" | "medium" | "large";

export type CreatureCollisionProfile = {
  solid: boolean;
  size: CreatureSizeClass;
  radius: number;
  height: number;
  visualScale: number;
};

/**
 * Runtime collision is based on the scaled body rather than the catalog name.
 * This keeps babies and ordinary small wildlife non-blocking while making an
 * adult Woolhorn, a Zombie, or a fully grown Shadecrawler physically present.
 * Flying and aquatic creatures deliberately retain their current semantics.
 */
export function creatureCollisionProfile(
  definition: Pick<MobDefinition, "radius" | "height" | "movement" | "flying" | "aquatic">,
  visualScale = 1,
  young = false,
): CreatureCollisionProfile {
  const requestedScale = clamp(Number.isFinite(visualScale) ? visualScale : 1, 0.25, 3.2);
  const scale = young ? Math.min(requestedScale, 0.62) : requestedScale;
  const radius = Math.max(0.04, definition.radius * scale);
  const height = Math.max(0.08, definition.height * scale);
  const movement: MobMovement = definition.movement ?? (definition.aquatic ? "aquatic" : definition.flying ? "flying" : "ground");
  const size: CreatureSizeClass = radius >= 0.62 || height >= 1.45
    ? "large"
    : radius >= 0.4 || height >= 0.76
      ? "medium"
      : "small";
  const solid = movement === "ground" && size !== "small";
  return {
    solid,
    size,
    radius: solid ? clamp(radius * 0.88, 0.32, 1.8) : 0,
    height: solid ? height : 0,
    visualScale: scale,
  };
}

export type CircleBody = {
  x: number;
  z: number;
  radius: number;
};

export type CircleSeparation = {
  dx: number;
  dz: number;
  overlap: number;
};

/** Returns the smallest horizontal correction that moves `mover` out of `obstacle`. */
export function separateCreatureCircles(
  mover: CircleBody,
  obstacle: CircleBody,
  padding = 0.06,
  stableSeed = 0,
): CircleSeparation | null {
  const dx = mover.x - obstacle.x;
  const dz = mover.z - obstacle.z;
  const distance = Math.hypot(dx, dz);
  const minimumDistance = Math.max(0, mover.radius) + Math.max(0, obstacle.radius) + Math.max(0, padding);
  const overlap = minimumDistance - distance;
  if (overlap <= 0) return null;
  if (distance > 0.00001) return { dx: dx / distance * overlap, dz: dz / distance * overlap, overlap };
  const angle = ((stableSeed * 0.61803398875) % 1) * TAU;
  return { dx: Math.cos(angle) * overlap, dz: Math.sin(angle) * overlap, overlap };
}

export type FollowerFormationMember = {
  id: number;
  radius: number;
};

export type FollowerFormationTarget = {
  id: number;
  index: number;
  x: number;
  z: number;
  trailingDistance: number;
  lateralOffset: number;
  arrivalRadius: number;
};

export type FollowerLeaderPose = {
  x: number;
  z: number;
  /** World-space travel heading, where zero points along +X. */
  heading: number;
};

/**
 * Produces a stable fan behind the player. IDs own slots, so iteration order or
 * frame timing cannot make followers swap sides. Additional followers widen
 * and deepen the fan instead of collapsing into one expensive collision pile.
 */
export function planFollowerFormation(
  leader: FollowerLeaderPose,
  members: readonly FollowerFormationMember[],
): FollowerFormationTarget[] {
  const ordered = [...members].sort((left, right) => left.id - right.id);
  const largestRadius = ordered.reduce((largest, member) => Math.max(largest, Math.max(0.1, member.radius)), 0.4);
  const groupSpread = Math.min(0.34, Math.max(0, ordered.length - 1) * 0.045);
  const firstTrailingDistance = 2.8 + groupSpread + Math.max(0, largestRadius - 0.4) * 0.35;
  const lateralSpacing = Math.max(1.25, largestRadius * 2 + 0.46) + groupSpread * 0.5;
  const forwardX = Math.cos(leader.heading);
  const forwardZ = Math.sin(leader.heading);
  const sideX = -forwardZ;
  const sideZ = forwardX;

  return ordered.map((member, index) => {
    // Followers travel in paired lanes instead of putting the first creature
    // directly behind the player's head. That preserves the rear-camera sight
    // line while each additional pair fans wider and a little deeper.
    const row = Math.floor(index / 2);
    const side = index % 2 === 0 ? -1 : 1;
    const lateralOffset = side * (0.75 + row * 0.58) * lateralSpacing;
    const trailingDistance = firstTrailingDistance + row * (0.72 + largestRadius * 0.18);
    return {
      id: member.id,
      index,
      x: leader.x - forwardX * trailingDistance + sideX * lateralOffset,
      z: leader.z - forwardZ * trailingDistance + sideZ * lateralOffset,
      trailingDistance,
      lateralOffset,
      arrivalRadius: clamp(0.34 + Math.max(0.1, member.radius) * 0.28, 0.42, 0.78),
    };
  });
}

export type FollowerSpeedInput = {
  walkSpeed: number;
  chaseSpeed: number;
  leaderSpeed: number;
  distanceToSlot: number;
  arrivalRadius?: number;
};

/** Matches a sprinting leader, then adds only the catch-up headroom needed to regain formation. */
export function followerTravelSpeed(input: FollowerSpeedInput) {
  const distance = Math.max(0, input.distanceToSlot);
  const arrivalRadius = clamp(input.arrivalRadius ?? 0.5, 0.2, 1.2);
  if (distance <= arrivalRadius) return 0;
  const approach = clamp((distance - arrivalRadius) / 1.35, 0, 1);
  const leaderSpeed = Math.max(0, input.leaderSpeed);
  const matchingPace = Math.max(Math.max(0, input.chaseSpeed), leaderSpeed > 0.05 ? leaderSpeed * 1.06 + 0.12 : 0);
  const catchUp = clamp((distance - arrivalRadius - 2.2) / 5, 0, 1.7);
  const floor = Math.max(0, input.walkSpeed) * 0.55;
  return Math.max(floor, matchingPace * approach + catchUp);
}

export const FOLLOWER_HARD_TELEPORT_DISTANCE = 20;
export const FOLLOWER_STUCK_TELEPORT_DISTANCE = 12;

export type FollowerRecoveryInput = {
  distanceToLeader: number;
  verticalSeparation: number;
  blockedSeconds: number;
};

/** Long gaps recover immediately; shorter gaps recover only after a real pathing stall. */
export function shouldTeleportFollower(input: FollowerRecoveryInput) {
  const distance = Math.max(0, input.distanceToLeader);
  return distance >= FOLLOWER_HARD_TELEPORT_DISTANCE
    || Math.abs(input.verticalSeparation) >= 9
    || (distance >= FOLLOWER_STUCK_TELEPORT_DISTANCE && input.blockedSeconds >= 2.75);
}

export type FollowerTeleportTarget = {
  x: number;
  y: number;
  z: number;
};

/**
 * Finds a deterministic safe landing near the assigned formation slot. The
 * callback owns world knowledge: it should reject water, hazards, blocked
 * clearance, steep ledges, POI interiors, and overlaps with solid creatures.
 */
export function findFollowerTeleportTarget(
  target: Pick<FollowerFormationTarget, "x" | "z">,
  followerId: number,
  safeGroundAt: (x: number, z: number) => number | null,
): FollowerTeleportTarget | null {
  const candidates: Array<[number, number]> = [[0, 0]];
  const start = ((followerId * 5) % 8 + 8) % 8;
  for (const radius of [0.9, 1.65, 2.4]) {
    for (let step = 0; step < 8; step += 1) {
      const angle = ((start + step) / 8) * TAU;
      candidates.push([Math.cos(angle) * radius, Math.sin(angle) * radius]);
    }
  }
  for (const [offsetX, offsetZ] of candidates) {
    const x = target.x + offsetX;
    const z = target.z + offsetZ;
    const y = safeGroundAt(x, z);
    if (y !== null && Number.isFinite(y)) return { x, y, z };
  }
  return null;
}

export type CreatureRouteProbe = {
  walkable: boolean;
  /** Destination ground relative to the current foot plane. */
  elevationDelta?: number;
  water?: boolean;
  hazard?: boolean;
  /** Zero is clear; one means another creature fully occupies the route. */
  crowding?: number;
  /** Zero is body-tight; one is generously clear. */
  clearance?: number;
  openDoor?: boolean;
};

export type CreatureRouteState = {
  heading: number;
  holdSeconds: number;
  blockedSeconds: number;
  /** A very short cache window for a route already proven clear by look-ahead. */
  probeCooldown: number;
};

export type CreatureRouteInput = {
  state: CreatureRouteState;
  dt: number;
  desiredHeading: number;
  mobId: number;
  movement?: MobMovement;
  maxStepUp?: number;
  maxDrop?: number;
  allowWater?: boolean;
  probe: (heading: number) => CreatureRouteProbe;
};

export type CreatureRouteDecision = {
  heading: number;
  blocked: boolean;
  probe: CreatureRouteProbe | null;
  state: CreatureRouteState;
};

export function createCreatureRouteState(heading = 0): CreatureRouteState {
  return { heading: normalizeAngle(heading), holdSeconds: 0, blockedSeconds: 0, probeCooldown: 0 };
}

function routeIsValid(sample: CreatureRouteProbe, input: CreatureRouteInput) {
  const rise = sample.elevationDelta ?? 0;
  return sample.walkable
    && !sample.hazard
    && (input.allowWater || !sample.water)
    && rise <= (input.maxStepUp ?? 1) + 0.0001
    && rise >= -(input.maxDrop ?? 1) - 0.0001;
}

/**
 * Bounded local route selection with hysteresis. It prefers a direct open
 * door, rejects hazards/water/unsafe ledges, spreads around other bodies, and
 * holds a viable side route long enough to clear a trunk without twitching.
 */
export function chooseCreatureRoute(input: CreatureRouteInput): CreatureRouteDecision {
  const dt = clamp(Number.isFinite(input.dt) ? input.dt : 0, 0, 0.1);
  const desiredHeading = normalizeAngle(input.desiredHeading);
  if ((input.movement ?? "ground") !== "ground") {
    return {
      heading: desiredHeading,
      blocked: false,
      probe: null,
      state: { heading: desiredHeading, holdSeconds: 0, blockedSeconds: 0, probeCooldown: 0 },
    };
  }

  const heldHeading = normalizeAngle(input.state.heading);
  const remainingHold = Math.max(0, input.state.holdSeconds - dt);
  const remainingProbeCooldown = Math.max(0, (input.state.probeCooldown ?? 0) - dt);
  if (remainingHold > 0 && Math.abs(normalizeAngle(desiredHeading - heldHeading)) < Math.PI * 0.72) {
    // The engine's look-ahead is always farther than a mob can travel during
    // this cache window. Skipping a couple of identical probes substantially
    // lowers herd cost without allowing a creature to step through a trunk.
    if (remainingProbeCooldown > 0) {
      return {
        heading: heldHeading,
        blocked: false,
        probe: null,
        state: { heading: heldHeading, holdSeconds: remainingHold, blockedSeconds: 0, probeCooldown: remainingProbeCooldown },
      };
    }
    const heldProbe = input.probe(heldHeading);
    if (routeIsValid(heldProbe, input) && (heldProbe.crowding ?? 0) < 0.92) {
      return {
        heading: heldHeading,
        blocked: false,
        probe: heldProbe,
        state: { heading: heldHeading, holdSeconds: remainingHold, blockedSeconds: 0, probeCooldown: 0.055 },
      };
    }
  }

  const directSample = input.probe(desiredHeading);
  if (routeIsValid(directSample, input)
    && (directSample.crowding ?? 0) < 0.25
    && (directSample.clearance ?? 1) >= 0.72) {
    return {
      heading: desiredHeading,
      blocked: false,
      probe: directSample,
      state: { heading: desiredHeading, holdSeconds: 0.22, blockedSeconds: 0, probeCooldown: 0.055 },
    };
  }

  const preferredSide = ((input.mobId * 31) & 1) === 0 ? -1 : 1;
  const offsets = [0, preferredSide * Math.PI / 8, -preferredSide * Math.PI / 8,
    preferredSide * Math.PI / 4, -preferredSide * Math.PI / 4,
    preferredSide * Math.PI * 3 / 8, -preferredSide * Math.PI * 3 / 8,
    preferredSide * Math.PI / 2, -preferredSide * Math.PI / 2];
  let best: { heading: number; offset: number; sample: CreatureRouteProbe; score: number } | null = null;
  for (const offset of offsets) {
    const heading = normalizeAngle(desiredHeading + offset);
    const sample = Math.abs(offset) < 0.00001 ? directSample : input.probe(heading);
    if (!routeIsValid(sample, input)) continue;
    const crowding = clamp(sample.crowding ?? 0, 0, 1.5);
    const clearance = clamp(sample.clearance ?? 1, 0, 1);
    const score = Math.abs(offset) * 1.35
      + Math.abs(sample.elevationDelta ?? 0) * 0.38
      + crowding * 3.2
      + (1 - clearance) * 1.15
      + (sample.water ? 1.8 : 0)
      - (sample.openDoor && offset === 0 ? 0.2 : 0);
    if (!best || score < best.score - 0.00001) best = { heading, offset, sample, score };
  }

  if (!best) {
    const blockedSeconds = input.state.blockedSeconds + dt;
    return {
      heading: heldHeading,
      blocked: true,
      probe: null,
      state: { heading: heldHeading, holdSeconds: 0, blockedSeconds, probeCooldown: 0 },
    };
  }

  const holdSeconds = Math.abs(best.offset) < 0.001 ? 0.12 : 0.64 + (Math.abs(input.mobId) % 3) * 0.08;
  return {
    heading: best.heading,
    blocked: false,
    probe: best.sample,
    state: { heading: best.heading, holdSeconds, blockedSeconds: 0, probeCooldown: 0.055 },
  };
}

export type BirdFlightProbe = {
  clear: boolean;
  /** Zero is body-tight; one is open air with comfortable wing clearance. */
  clearance: number;
  /** True when the route ends on a valid exposed perch. */
  landing?: boolean;
};

export type BirdFlightRouteState = {
  heading: number;
  altitudeOffset: number;
  holdSeconds: number;
  recheckSeconds: number;
  blockedSeconds: number;
};

export type BirdFlightRouteInput = {
  state: BirdFlightRouteState;
  dt: number;
  desiredHeading: number;
  mobId: number;
  /** True while airborne; grounded birds use the same bounded lateral probes. */
  flying: boolean;
  landing?: boolean;
  probe: (heading: number, altitudeOffset: number) => BirdFlightProbe;
};

export type BirdFlightRouteDecision = {
  heading: number;
  altitudeOffset: number;
  blocked: boolean;
  probes: number;
  state: BirdFlightRouteState;
};

export function createBirdFlightRouteState(heading = 0): BirdFlightRouteState {
  return { heading: normalizeAngle(heading), altitudeOffset: 0, holdSeconds: 0, recheckSeconds: 0, blockedSeconds: 0 };
}

export type BirdPerchCandidate = {
  id: string;
  x: number;
  /** World-space group height that places the bird's feet on the perch. */
  y: number;
  z: number;
  /** Height above the terrain floor at the search origin. */
  altitude: number;
  clearance: number;
  approachClear: boolean;
};

/** Selects a reachable, exposed perch without relying on scan order. */
export function chooseBirdPerch(
  candidates: readonly BirdPerchCandidate[],
  origin: { x: number; z: number; heading: number },
  previousId: string | null = null,
) {
  let best: { candidate: BirdPerchCandidate; score: number } | null = null;
  for (const candidate of candidates) {
    if (!candidate.approachClear || candidate.clearance < 0.5 || candidate.altitude < 0.08) continue;
    const dx = candidate.x - origin.x;
    const dz = candidate.z - origin.z;
    const distance = Math.hypot(dx, dz);
    if (distance > 8.5) continue;
    const turn = distance <= 0.001 ? 0 : Math.abs(normalizeAngle(Math.atan2(dz, dx) - origin.heading));
    const score = distance * 0.34
      + turn * 0.28
      + Math.max(0, candidate.altitude - 6.5) * 0.15
      + (1 - clamp(candidate.clearance, 0, 1)) * 1.4
      - (candidate.id === previousId ? 0.58 : 0);
    if (!best || score < best.score - 0.00001 || (Math.abs(score - best.score) < 0.00001 && candidate.id < best.candidate.id)) {
      best = { candidate, score };
    }
  }
  return best?.candidate ?? null;
}

/**
 * Fixed-budget 3D route selection for birds. It tests at most fifteen
 * heading/altitude pairs, holds one viable detour long enough to clear a tree,
 * and periodically rechecks instead of probing the voxel world every frame.
 */
export function chooseBirdFlightRoute(input: BirdFlightRouteInput): BirdFlightRouteDecision {
  const dt = clamp(Number.isFinite(input.dt) ? input.dt : 0, 0, 0.1);
  const desiredHeading = normalizeAngle(input.desiredHeading);
  const heldHeading = normalizeAngle(input.state.heading);
  const remainingHold = Math.max(0, input.state.holdSeconds - dt);
  const remainingRecheck = Math.max(0, input.state.recheckSeconds - dt);
  let probes = 0;
  const sample = (heading: number, altitudeOffset: number) => {
    probes += 1;
    return input.probe(heading, altitudeOffset);
  };
  const stillAimingNearby = Math.abs(normalizeAngle(desiredHeading - heldHeading)) < Math.PI * 0.7;

  if (remainingHold > 0 && stillAimingNearby) {
    if (remainingRecheck > 0) {
      return {
        heading: heldHeading,
        altitudeOffset: input.state.altitudeOffset,
        blocked: false,
        probes,
        state: { ...input.state, holdSeconds: remainingHold, recheckSeconds: remainingRecheck, blockedSeconds: 0 },
      };
    }
    const heldProbe = sample(heldHeading, input.state.altitudeOffset);
    if (heldProbe.clear && heldProbe.clearance >= 0.18) {
      return {
        heading: heldHeading,
        altitudeOffset: input.state.altitudeOffset,
        blocked: false,
        probes,
        state: {
          heading: heldHeading,
          altitudeOffset: input.state.altitudeOffset,
          holdSeconds: remainingHold,
          recheckSeconds: input.flying ? 0.11 : 0.07,
          blockedSeconds: 0,
        },
      };
    }
  }

  const directProbe = sample(desiredHeading, 0);
  if (directProbe.clear && directProbe.clearance >= 0.78) {
    return {
      heading: desiredHeading,
      altitudeOffset: 0,
      blocked: false,
      probes,
      state: {
        heading: desiredHeading,
        altitudeOffset: 0,
        holdSeconds: 0.34,
        recheckSeconds: input.flying ? 0.12 : 0.08,
        blockedSeconds: 0,
      },
    };
  }

  const preferredSide = ((Math.abs(input.mobId) * 37) & 1) === 0 ? -1 : 1;
  const headingOffsets = [0, preferredSide * Math.PI / 5, -preferredSide * Math.PI / 5,
    preferredSide * Math.PI * 2 / 5, -preferredSide * Math.PI * 2 / 5];
  // Airborne birds can climb over a canopy or dip back into open air. A bird
  // committed to landing stays level so it does not orbit above its perch.
  const altitudeOffsets = input.flying && !input.landing ? [0, 1.25, -0.7] : [0];
  let best: { heading: number; altitudeOffset: number; score: number } | null = null;
  candidateSearch: for (const altitudeOffset of altitudeOffsets) for (const headingOffset of headingOffsets) {
    if (probes >= 15) break candidateSearch;
    const heading = normalizeAngle(desiredHeading + headingOffset);
    const route = Math.abs(headingOffset) < 0.00001 && Math.abs(altitudeOffset) < 0.00001
      ? directProbe
      : sample(heading, altitudeOffset);
    if (!route.clear || route.clearance < 0.12) continue;
    const turnCost = Math.abs(headingOffset) * 1.45;
    const altitudeCost = altitudeOffset > 0 ? altitudeOffset * 0.32 : Math.abs(altitudeOffset) * 0.5;
    const clearanceCost = (1 - clamp(route.clearance, 0, 1)) * 2.4;
    const landingBonus = input.landing && route.landing ? -0.65 : 0;
    // A tiny deterministic side preference breaks exact ties without any
    // frame-to-frame randomness.
    const sideTieBreak = Math.sign(headingOffset) === preferredSide ? -0.0001 : 0;
    const score = turnCost + altitudeCost + clearanceCost + landingBonus + sideTieBreak;
    if (!best || score < best.score - 0.00001) best = { heading, altitudeOffset, score };
  }

  if (!best) {
    const blockedSeconds = input.state.blockedSeconds + dt;
    return {
      heading: heldHeading,
      altitudeOffset: Math.max(0, input.state.altitudeOffset),
      blocked: true,
      probes,
      state: { heading: heldHeading, altitudeOffset: Math.max(0, input.state.altitudeOffset), holdSeconds: 0, recheckSeconds: 0, blockedSeconds },
    };
  }
  const detouring = Math.abs(normalizeAngle(best.heading - desiredHeading)) > 0.02 || Math.abs(best.altitudeOffset) > 0.02;
  const holdSeconds = detouring ? 0.72 + (Math.abs(input.mobId) % 4) * 0.07 : 0.2;
  return {
    heading: best.heading,
    altitudeOffset: best.altitudeOffset,
    blocked: false,
    probes,
    state: {
      heading: best.heading,
      altitudeOffset: best.altitudeOffset,
      holdSeconds,
      recheckSeconds: input.flying ? 0.11 : 0.07,
      blockedSeconds: 0,
    },
  };
}

/** Body-aware melee reach keeps attackers separated instead of requiring overlap. */
export function creatureMeleeReach(
  definition: Pick<MobDefinition, "attackRange" | "radius">,
  visualScale = 1,
) {
  const scale = clamp(Number.isFinite(visualScale) ? visualScale : 1, 0.25, 3.2);
  const bodyAllowance = clamp(definition.radius * scale * 0.72, 0.18, 1.35);
  return Math.max(0, definition.attackRange) + bodyAllowance;
}
