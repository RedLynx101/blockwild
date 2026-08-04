/** Budgeted visual-detail admission for ordinary creatures. Gameplay state is never changed. */

export type CreatureRenderTier = "hero" | "articulated" | "silhouette" | "hidden";

export type CreatureRenderCandidate = Readonly<{
  id: number;
  distance: number;
  projectedSize: number;
  inFrustum: boolean;
  critical: boolean;
  important: boolean;
  engaged: boolean;
}>;

export type CreatureRenderPressure = Readonly<{
  averageFrameMilliseconds: number;
  drawCalls: number;
  lowResourceMode?: boolean;
}>;

type AdmissionState = {
  tier: CreatureRenderTier;
  changedAt: number;
  lastSeenAt: number;
};

const TIER_RANK: Readonly<Record<CreatureRenderTier, number>> = Object.freeze({
  hidden: 0,
  silhouette: 1,
  articulated: 2,
  hero: 3,
});

export const CREATURE_RENDER_ADMISSION_INTERVAL_MS = 200;
export const CREATURE_RENDER_TIER_HOLD_MS = 900;
export const CREATURE_ARTICULATED_DISTANCE = 88;
export const CREATURE_SILHOUETTE_DISTANCE = 160;

export function creatureHeroBudget(pressure: CreatureRenderPressure) {
  const frame = Math.max(0, Number(pressure.averageFrameMilliseconds) || 0);
  const draws = Math.max(0, Math.round(Number(pressure.drawCalls) || 0));
  const base = pressure.lowResourceMode ? 10 : 18;
  if (frame >= 38 || draws >= 700) return Math.max(4, Math.floor(base * 0.34));
  if (frame >= 30 || draws >= 500) return Math.max(6, Math.floor(base * 0.5));
  if (frame >= 24 || draws >= 350) return Math.max(8, Math.floor(base * 0.72));
  return base;
}

function candidateScore(candidate: CreatureRenderCandidate) {
  return (candidate.critical ? 100_000 : 0)
    + (candidate.engaged ? 12_000 : 0)
    + (candidate.important ? 2_000 : 0)
    + (candidate.inFrustum ? 1_000 : 0)
    + Math.min(600, Math.max(0, candidate.projectedSize) * 600)
    + Math.max(0, 320 - candidate.distance * 4);
}

function desiredTier(candidate: CreatureRenderCandidate, heroIds: ReadonlySet<number>): CreatureRenderTier {
  if (heroIds.has(candidate.id)) return "hero";
  if ((candidate.inFrustum || candidate.distance <= 18) && candidate.distance <= CREATURE_ARTICULATED_DISTANCE) {
    return "articulated";
  }
  if (candidate.inFrustum && candidate.distance <= CREATURE_SILHOUETTE_DISTANCE) return "silhouette";
  return "hidden";
}

export class CreatureRenderAdmissionController {
  private states = new Map<number, AdmissionState>();
  private latestDiagnostics = {
    candidates: 0,
    visibleCandidates: 0,
    heroBudget: 0,
    criticalHeroes: 0,
    transitions: 0,
    tiers: { hero: 0, articulated: 0, silhouette: 0, hidden: 0 } as Record<CreatureRenderTier, number>,
  };

  evaluate(candidates: readonly CreatureRenderCandidate[], pressure: CreatureRenderPressure, nowMilliseconds: number) {
    const now = Math.max(0, Number(nowMilliseconds) || 0);
    const heroBudget = creatureHeroBudget(pressure);
    const ranked = [...candidates]
      .filter((candidate) => candidate.critical || candidate.engaged || candidate.inFrustum || candidate.distance <= 18)
      .sort((left, right) => candidateScore(right) - candidateScore(left) || left.id - right.id);
    const heroIds = new Set<number>();
    for (const candidate of ranked) if (candidate.critical) heroIds.add(candidate.id);
    for (const candidate of ranked) {
      if (heroIds.size >= heroBudget && !candidate.critical) break;
      if (candidate.critical || candidate.engaged || candidate.distance <= 24 || candidate.inFrustum) heroIds.add(candidate.id);
    }

    const liveIds = new Set(candidates.map((candidate) => candidate.id));
    let transitions = 0;
    let limitedTransitions = 0;
    const tiers: Record<CreatureRenderTier, number> = { hero: 0, articulated: 0, silhouette: 0, hidden: 0 };
    for (const candidate of candidates) {
      const desired = desiredTier(candidate, heroIds);
      const previous = this.states.get(candidate.id);
      let tier = desired;
      if (previous && previous.tier !== desired && !candidate.critical) {
        const promotion = TIER_RANK[desired] > TIER_RANK[previous.tier];
        const heldLongEnough = now - previous.changedAt >= CREATURE_RENDER_TIER_HOLD_MS;
        if (!promotion && (!heldLongEnough || limitedTransitions >= 12)) tier = previous.tier;
      }
      if (!previous || previous.tier !== tier) {
        transitions += 1;
        if (!candidate.critical) limitedTransitions += 1;
      }
      this.states.set(candidate.id, {
        tier,
        changedAt: previous?.tier === tier ? previous.changedAt : now,
        lastSeenAt: now,
      });
      tiers[tier] += 1;
    }
    for (const [id, state] of this.states) {
      if (liveIds.has(id)) continue;
      if (now - state.lastSeenAt >= CREATURE_RENDER_TIER_HOLD_MS) this.states.delete(id);
    }
    this.latestDiagnostics = {
      candidates: candidates.length,
      visibleCandidates: candidates.filter((candidate) => candidate.inFrustum).length,
      heroBudget,
      criticalHeroes: candidates.filter((candidate) => candidate.critical).length,
      transitions,
      tiers,
    };
    return this.latestDiagnostics;
  }

  tierFor(id: number): CreatureRenderTier {
    return this.states.get(id)?.tier ?? "hero";
  }

  diagnostics() {
    return {
      ...this.latestDiagnostics,
      tiers: { ...this.latestDiagnostics.tiers },
    } as const;
  }

  reset() {
    this.states.clear();
    this.latestDiagnostics = {
      candidates: 0,
      visibleCandidates: 0,
      heroBudget: 0,
      criticalHeroes: 0,
      transitions: 0,
      tiers: { hero: 0, articulated: 0, silhouette: 0, hidden: 0 },
    };
  }
}
