import { CREATURE_MOVES, type CreatureMoveDefinition } from "./creature-moves";
import type { CreatureTactic } from "./creature-progression";
import { resolveTypeEffectiveness, type CreatureTypeId } from "./creature-types";
import type { CombatActorRef, ThreatEntry } from "./combat-resolver";

export type MoveTargetToken = Readonly<{ kind: CombatActorRef["kind"]; id: CombatActorRef["id"] }>;

export type CreatureMoveMovementPolicy = "stationary" | "track" | "authored";

export type CombatContactEnvelope = Readonly<{
  acquireDistance: number;
  commitDistance: number;
  activeDistance: number;
  verticalTolerance: number;
  facingCosine: number;
  targetGrace: number;
}>;

export type CombatContactResult = "hit" | "dodged" | "obstructed" | "invalid";

export type CombatContactCheck = Readonly<{
  attacker: Readonly<{ x: number; y: number; z: number }>;
  attackerFacing: number;
  target: Readonly<{ x: number; y: number; z: number }>;
  previousTarget?: Readonly<{ x: number; y: number; z: number }> | null;
  envelope: CombatContactEnvelope;
  lineOfSight: boolean;
}>;

export type ActiveCreatureMove = Readonly<{
  moveId: string;
  phase: "windup" | "active" | "recovery";
  remaining: number;
  target: MoveTargetToken;
  applied: boolean;
}>;

export type MovePhaseEvent = "none" | "became-active" | "became-recovery" | "finished";

export type MovePhaseStep = Readonly<{
  state: ActiveCreatureMove | null;
  event: MovePhaseEvent;
}>;

export type CreatureMoveChoiceContext = Readonly<{
  moveIds: readonly string[];
  cooldowns: Readonly<Record<string, number>>;
  tactic: CreatureTactic;
  distance: number;
  verticalDistance: number;
  hasLineOfSight: boolean;
  attackerTypes: readonly CreatureTypeId[];
  targetTypes: readonly CreatureTypeId[];
  healthRatio: number;
  ownerHealthRatio: number;
  targetHealthRatio: number;
  friendlyFireRisk: number;
  terrainFit: number;
  canReachTarget?: (move: CreatureMoveDefinition) => boolean;
}>;

export type ScoredCreatureMove = Readonly<{
  move: CreatureMoveDefinition;
  score: number;
  reasons: readonly string[];
}>;

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

/**
 * One body-aware reach contract shared by acquisition, commitment, and the hit
 * frame. The authored range remains the dominant term; body radii only keep
 * differently sized creatures from having to overlap their visual bodies.
 */
export function combatContactEnvelope(
  move: CreatureMoveDefinition,
  attackerRadius = 0.45,
  targetRadius = 0.34,
): CombatContactEnvelope {
  const bodyAllowance = Math.max(
    Math.max(0.3, move.radius),
    Math.max(0, attackerRadius) * 0.34 + Math.max(0, targetRadius) * 0.46,
  );
  const activeDistance = Math.max(0, move.range) + bodyAllowance;
  const contact = move.shape === "contact";
  return Object.freeze({
    acquireDistance: activeDistance + (contact ? 0.38 : 0.18),
    commitDistance: Math.max(0, activeDistance - (contact ? 0.08 : 0)),
    activeDistance,
    verticalTolerance: Math.max(0.2, move.verticalTolerance),
    facingCosine: contact ? Math.cos(Math.PI * 0.42) : -1,
    targetGrace: contact ? 0.26 : 0.12,
  });
}

/** Contact strikes plant their feet; ranged moves track; explicit mobility
 * shapes retain authored translation. */
export function creatureMoveMovementPolicy(move: CreatureMoveDefinition): CreatureMoveMovementPolicy {
  if (move.shape === "contact") return "stationary";
  if (move.shape === "dash" || move.aiTags.includes("mobility")) return "authored";
  return "track";
}

/** Deterministic active-frame contact check with a tightly bounded target sweep. */
export function evaluateCombatContact(check: CombatContactCheck): CombatContactResult {
  const values = [
    check.attacker.x, check.attacker.y, check.attacker.z, check.attackerFacing,
    check.target.x, check.target.y, check.target.z,
  ];
  if (values.some((value) => !Number.isFinite(value))) return "invalid";
  if (!check.lineOfSight) return "obstructed";
  if (Math.abs(check.target.y - check.attacker.y) > check.envelope.verticalTolerance) return "dodged";

  const currentX = check.target.x;
  const currentZ = check.target.z;
  let previousX = check.previousTarget?.x ?? currentX;
  let previousZ = check.previousTarget?.z ?? currentZ;
  const sweepX = previousX - currentX;
  const sweepZ = previousZ - currentZ;
  const sweepLength = Math.hypot(sweepX, sweepZ);
  if (sweepLength > check.envelope.targetGrace && sweepLength > 0.00001) {
    const scale = check.envelope.targetGrace / sweepLength;
    previousX = currentX + sweepX * scale;
    previousZ = currentZ + sweepZ * scale;
  }
  const segmentX = currentX - previousX;
  const segmentZ = currentZ - previousZ;
  const segmentLengthSquared = segmentX * segmentX + segmentZ * segmentZ;
  const along = segmentLengthSquared <= 0.000001 ? 1 : Math.max(0, Math.min(1,
    ((check.attacker.x - previousX) * segmentX + (check.attacker.z - previousZ) * segmentZ) / segmentLengthSquared,
  ));
  const closestX = previousX + segmentX * along;
  const closestZ = previousZ + segmentZ * along;
  if (Math.hypot(closestX - check.attacker.x, closestZ - check.attacker.z) > check.envelope.activeDistance) return "dodged";

  const targetDx = currentX - check.attacker.x;
  const targetDz = currentZ - check.attacker.z;
  const targetDistance = Math.hypot(targetDx, targetDz);
  if (targetDistance > 0.00001) {
    const facingDot = (Math.cos(check.attackerFacing) * targetDx + Math.sin(check.attackerFacing) * targetDz) / targetDistance;
    if (facingDot < check.envelope.facingCosine) return "dodged";
  }
  return "hit";
}

function tacticWeight(move: CreatureMoveDefinition, tactic: CreatureTactic) {
  if (tactic === "guard") return move.aiTags.includes("defense") ? 2.8 : move.aiTags.includes("control") ? 1.8 : 0;
  if (tactic === "support") return move.aiTags.includes("support") ? 3.5 : move.channel === "healing" ? 4 : -0.25;
  if (tactic === "pursue") return move.aiTags.includes("mobility") ? 2.5 : move.aiTags.includes("finisher") ? 2.1 : 0.5;
  if (tactic === "cautious") return move.aiTags.includes("defense") ? 3.2 : move.range >= 4 ? 1.8 : -0.8;
  return move.aiTags.includes("defense") || move.target === "self" ? 2.2 : move.range <= 2 ? 0.3 : -2;
}

function expectedEffectiveness(move: CreatureMoveDefinition, targetTypes: readonly CreatureTypeId[]) {
  if (!targetTypes.length) return 0;
  return move.packets.reduce((total, packet) => total + resolveTypeEffectiveness(packet.type, targetTypes).steps * packet.share, 0);
}

/**
 * Pure, deterministic move scoring. Hidden state and random rolls are deliberately
 * absent so host and tests can explain why an action was chosen.
 */
export function scoreCreatureMoves(context: CreatureMoveChoiceContext): readonly ScoredCreatureMove[] {
  const candidates: ScoredCreatureMove[] = [];
  for (const moveId of [...new Set(context.moveIds)]) {
    const move = CREATURE_MOVES[moveId];
    if (!move || (context.cooldowns[moveId] ?? 0) > 0) continue;
    if (context.canReachTarget && !context.canReachTarget(move)) continue;
    if (move.requiresLineOfSight && !context.hasLineOfSight) continue;
    const targetsSelf = move.target === "self" || move.target === "ally";
    if (context.tactic === "hold" && !targetsSelf && !move.aiTags.includes("defense")) continue;
    if (!targetsSelf && !context.canReachTarget
      && (context.distance > move.range + Math.max(0.3, move.radius) || context.verticalDistance > move.verticalTolerance)) continue;

    let score = 1;
    const reasons: string[] = [];
    const tactic = tacticWeight(move, context.tactic);
    score += tactic;
    if (Math.abs(tactic) > 0.1) reasons.push(`${context.tactic} ${tactic > 0 ? "fit" : "penalty"}`);

    const effectiveness = targetsSelf ? 0 : expectedEffectiveness(move, context.targetTypes);
    score += effectiveness * 1.35;
    if (Math.abs(effectiveness) > 0.05) reasons.push(effectiveness > 0 ? "type advantage" : "type resistance");

    if (move.aiTags.includes("finisher")) score += (1 - clamp01(context.targetHealthRatio)) * 1.6;
    if (move.aiTags.includes("opener")) score += clamp01(context.targetHealthRatio) * 0.7;
    if (move.aiTags.includes("defense")) score += (1 - clamp01(context.healthRatio)) * 3.2;
    if (move.channel === "healing" || move.target === "ally") score += (1 - clamp01(Math.min(context.healthRatio, context.ownerHealthRatio))) * 3.8;

    const idealDistance = targetsSelf ? 0 : Math.max(0.6, move.range * (move.shape === "contact" ? 0.45 : 0.72));
    score += Math.max(-1.25, 1 - Math.abs(context.distance - idealDistance) / Math.max(1, move.range));
    score += Math.max(-1, Math.min(1, context.terrainFit));

    if (move.friendlyFire) score -= clamp01(context.friendlyFireRisk) * 5;
    else score -= clamp01(context.friendlyFireRisk) * Math.max(0.3, move.radius) * 1.2;
    if (context.tactic === "hold" && move.aiTags.includes("mobility")) score -= 5;
    if (context.tactic === "cautious" && context.healthRatio < 0.3 && move.range <= 2) score -= 3;
    candidates.push(Object.freeze({ move, score, reasons: Object.freeze(reasons) }));
  }
  return Object.freeze(candidates.sort((left, right) => right.score - left.score || left.move.id.localeCompare(right.move.id)));
}

export function chooseCreatureMove(context: CreatureMoveChoiceContext) {
  return scoreCreatureMoves(context)[0] ?? null;
}

export function beginCreatureMove(move: CreatureMoveDefinition, target: MoveTargetToken): ActiveCreatureMove {
  return Object.freeze({
    moveId: move.id,
    phase: "windup",
    remaining: Math.max(0.01, move.windupSeconds),
    target: Object.freeze({ ...target }),
    applied: false,
  });
}

/** Advances at most one semantic phase per call while retaining elapsed overflow. */
export function stepCreatureMove(state: ActiveCreatureMove | null, dt: number): MovePhaseStep {
  if (!state) return Object.freeze({ state: null, event: "none" });
  const move = CREATURE_MOVES[state.moveId];
  if (!move) return Object.freeze({ state: null, event: "finished" });
  const remaining = state.remaining - Math.max(0, dt);
  if (remaining > 0) return Object.freeze({ state: Object.freeze({ ...state, remaining }), event: "none" });
  const overflow = Math.max(0, -remaining);
  if (state.phase === "windup") return Object.freeze({
    state: Object.freeze({ ...state, phase: "active", remaining: Math.max(0.01, move.activeSeconds - overflow), applied: false }),
    event: "became-active",
  });
  if (state.phase === "active") return Object.freeze({
    state: Object.freeze({ ...state, phase: "recovery", remaining: Math.max(0.01, move.recoverySeconds - overflow), applied: true }),
    event: "became-recovery",
  });
  return Object.freeze({ state: null, event: "finished" });
}

export function markCreatureMoveApplied(state: ActiveCreatureMove): ActiveCreatureMove {
  return state.applied ? state : Object.freeze({ ...state, applied: true });
}

export function stepMoveCooldowns(current: Readonly<Record<string, number>>, dt: number) {
  const next: Record<string, number> = {};
  for (const [id, remaining] of Object.entries(current)) {
    const value = Math.max(0, remaining - Math.max(0, dt));
    if (value > 0) next[id] = value;
  }
  return next;
}

export function chooseThreatTarget(
  entries: readonly ThreatEntry[],
  nowSeconds: number,
  legalAndPerceived: (target: CombatActorRef) => boolean,
) {
  const ranked = entries
    .filter((entry) => nowSeconds - entry.lastSeenAt <= 45 && legalAndPerceived(entry.source))
    .map((entry) => ({ entry, score: entry.score * Math.pow(0.5, Math.max(0, nowSeconds - entry.lastHostileAt) / 18) }))
    .filter(({ score }) => score >= 0.08)
    .sort((left, right) => right.score - left.score || String(left.entry.source.id).localeCompare(String(right.entry.source.id)));
  return ranked[0]?.entry.source ?? null;
}
