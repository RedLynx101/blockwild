import type { MobDefinition, MobKind } from "./mobs";

export const NATURAL_POPULATION_POOLS = [
  "surface-animal",
  "ambient",
  "water-animal",
  "water-ambient",
  "underground",
  "monster",
] as const;

export type NaturalPopulationPool = typeof NATURAL_POPULATION_POOLS[number];

export type NaturalPoolBudget = Readonly<{ target: number; ceiling: number }>;

const DESKTOP_POOL_BUDGETS: Readonly<Record<NaturalPopulationPool, NaturalPoolBudget>> = Object.freeze({
  "surface-animal": { target: 12, ceiling: 17 },
  ambient: { target: 10, ceiling: 14 },
  "water-animal": { target: 5, ceiling: 7 },
  "water-ambient": { target: 10, ceiling: 16 },
  underground: { target: 8, ceiling: 12 },
  monster: { target: 7, ceiling: 11 },
});

const roundQuarter = (value: number) => Math.round(value * 4) / 4;

/** Local weighted population targets. Touch devices retain the same ecology shape at a lower active cost. */
export function naturalPoolBudgets(touch: boolean, density: number) {
  const scale = Math.max(0, Number.isFinite(density) ? density : 1) * (touch ? 0.65 : 1);
  return Object.fromEntries(NATURAL_POPULATION_POOLS.map((pool) => [pool, {
    target: scale <= 0 ? 0 : Math.max(0.25, roundQuarter(DESKTOP_POOL_BUDGETS[pool].target * scale)),
    ceiling: scale <= 0 ? 0 : Math.max(0.25, roundQuarter(DESKTOP_POOL_BUDGETS[pool].ceiling * scale)),
  }])) as Record<NaturalPopulationPool, NaturalPoolBudget>;
}

/** Global safety ceiling remains sublinear for separated players while local targets guarantee fairness. */
export function globalNaturalCostCeiling(touch: boolean, density: number, playerCount: number) {
  const players = Math.max(1, Math.min(4, Math.floor(playerCount)));
  const base = touch ? 40 : 64;
  return roundQuarter(base * Math.max(0, Number.isFinite(density) ? density : 1) * Math.sqrt(players));
}

export function isRareNaturalDefinition(definition: MobDefinition) {
  return definition.family === "dragon" || definition.family === "leviathan" || Boolean(definition.sentient);
}

/**
 * Natural ecology is classified by how an instance occupies the world, not by
 * whether its species can eventually become persistent or player-owned.
 */
export function naturalPopulationPoolForDefinition(definition: MobDefinition, underground = false): NaturalPopulationPool | null {
  if (isRareNaturalDefinition(definition)) return null;
  if (definition.hostile) return "monster";
  if (underground || definition.family === "underground") return "underground";
  const aquatic = definition.aquatic || definition.movement === "aquatic";
  if (aquatic || definition.family === "fish" || definition.family === "sea-slug") {
    return definition.radius >= 0.42 && definition.family !== "sea-slug" ? "water-animal" : "water-ambient";
  }
  if (definition.flying || definition.movement === "flying"
    || definition.family === "bird" || definition.family === "pollinator"
    || definition.family === "butterfly" || definition.family === "rabbit"
    || definition.radius <= 0.28) return "ambient";
  return "surface-animal";
}

/** Tiny creatures and shoal members are deliberately cheaper than full AI-heavy large animals. */
export function naturalPopulationCost(definition: MobDefinition) {
  if (definition.radius <= 0.22) return 0.25;
  if (definition.radius <= 0.38) return 0.5;
  if (definition.radius > 0.72 || definition.height > 1.9) return 2;
  return 1;
}

export type NaturalPopulationRecord = Readonly<{
  pool: NaturalPopulationPool | null;
  cost: number;
  x: number;
  z: number;
  eligible: boolean;
}>;

export type NaturalPopulationSnapshot = Readonly<{
  totalCost: number;
  totalCount: number;
  byPool: Readonly<Record<NaturalPopulationPool, Readonly<{ cost: number; count: number }>>>;
}>;

export function naturalPopulationSnapshot(
  records: readonly NaturalPopulationRecord[],
  focus?: Readonly<{ x: number; z: number }>,
  radius = 64,
): NaturalPopulationSnapshot {
  const byPool = Object.fromEntries(NATURAL_POPULATION_POOLS.map((pool) => [pool, { cost: 0, count: 0 }])) as Record<NaturalPopulationPool, { cost: number; count: number }>;
  const radiusSquared = Math.max(0, radius) ** 2;
  let totalCost = 0;
  let totalCount = 0;
  for (const record of records) {
    if (!record.eligible || !record.pool || !Number.isFinite(record.cost) || record.cost <= 0) continue;
    if (focus && (record.x - focus.x) ** 2 + (record.z - focus.z) ** 2 > radiusSquared) continue;
    byPool[record.pool].cost += record.cost;
    byPool[record.pool].count += 1;
    totalCost += record.cost;
    totalCount += 1;
  }
  for (const pool of NATURAL_POPULATION_POOLS) byPool[pool].cost = roundQuarter(byPool[pool].cost);
  return { totalCost: roundQuarter(totalCost), totalCount, byPool };
}

/** Selects the pool furthest below its target; ceilings absorb a final herd without driving future spawns. */
export function selectDeficientNaturalPool(
  allowed: readonly NaturalPopulationPool[],
  snapshot: NaturalPopulationSnapshot,
  budgets: Readonly<Record<NaturalPopulationPool, NaturalPoolBudget>>,
  cursor = 0,
) {
  let selected: NaturalPopulationPool | null = null;
  let selectedScore = 0;
  const ordered = allowed.map((_, index) => allowed[(index + Math.abs(Math.trunc(cursor))) % allowed.length]);
  for (const pool of ordered) {
    const budget = budgets[pool];
    const current = snapshot.byPool[pool].cost;
    if (budget.target <= 0 || current >= budget.target || current >= budget.ceiling) continue;
    const score = (budget.target - current) / budget.target;
    if (selected && score <= selectedScore + 1e-9) continue;
    selected = pool;
    selectedScore = score;
  }
  return selected;
}

export function naturalSpawnCountCapacity(costBudget: number, creatureCost: number) {
  if (costBudget <= 0 || creatureCost <= 0) return 0;
  return Math.max(0, Math.floor((costBudget + 1e-9) / creatureCost));
}

/** Only the crafted-fence flood fill can set enclosed, so wild origin is irrelevant once a real pen contains the creature. */
export function enclosureProtectsCreature(_naturalSpawned: boolean, enclosed: boolean) {
  return enclosed;
}

export type CreatureRangeAction = Readonly<{
  action: "active" | "linger" | "sleep" | "despawn";
  outOfRangeSeconds: number;
}>;

/**
 * Range lifecycle is based on relevance, never absolute creature age. Natural
 * wildlife gets a short grace window while protected creatures become records
 * only after they are comfortably outside the active simulation boundary.
 */
export function creatureRangeAction(input: Readonly<{
  protected: boolean;
  distance: number;
  simulationRadius: number;
  outOfRangeSeconds: number;
  elapsedSeconds: number;
  following: boolean;
}>): CreatureRangeAction {
  if (input.following || input.distance <= input.simulationRadius) return { action: "active", outOfRangeSeconds: 0 };
  if (input.protected) return input.distance > input.simulationRadius + 24
    ? { action: "sleep", outOfRangeSeconds: 0 }
    : { action: "linger", outOfRangeSeconds: 0 };
  const outOfRangeSeconds = Math.max(0, input.outOfRangeSeconds) + Math.max(0, input.elapsedSeconds);
  return { action: outOfRangeSeconds >= 45 ? "despawn" : "linger", outOfRangeSeconds };
}

export const ECOLOGY_SECTOR_SIZE = 64;

export type EcologySectorSave = Readonly<{
  schema: 1;
  lastUpdatedTick: number;
  recentKills: Readonly<Record<string, number>>;
}>;

export function ecologySectorKey(x: number, z: number) {
  return `${Math.floor(x / ECOLOGY_SECTOR_SIZE)},${Math.floor(z / ECOLOGY_SECTOR_SIZE)}`;
}

/** Recent species pressure fades by one weighted kill per in-game day. */
export function normalizeEcologySector(input: Partial<EcologySectorSave> | null | undefined, currentTick: number): EcologySectorSave {
  const lastUpdatedTick = Math.max(0, Number(input?.lastUpdatedTick) || currentTick);
  const elapsedDays = Math.max(0, currentTick - lastUpdatedTick) / 24_000;
  const recentKills: Record<string, number> = {};
  if (input?.recentKills && typeof input.recentKills === "object") {
    for (const [kind, raw] of Object.entries(input.recentKills)) {
      const pressure = Math.max(0, (Number(raw) || 0) - elapsedDays);
      if (pressure >= 0.05) recentKills[kind] = roundQuarter(pressure);
    }
  }
  return { schema: 1, lastUpdatedTick: Math.max(lastUpdatedTick, currentTick), recentKills };
}

export function recordEcologyKill(
  input: Partial<EcologySectorSave> | null | undefined,
  kind: MobKind,
  creatureCost: number,
  currentTick: number,
) {
  const normalized = normalizeEcologySector(input, currentTick);
  return {
    ...normalized,
    lastUpdatedTick: currentTick,
    recentKills: {
      ...normalized.recentKills,
      [kind]: roundQuarter((normalized.recentKills[kind] ?? 0) + Math.max(0.25, creatureCost * 0.5)),
    },
  } satisfies EcologySectorSave;
}

/** Same-species recovery slows after hunting; other eligible species can still fill the local ecology target. */
export function ecologySpeciesSpawnChance(
  input: Partial<EcologySectorSave> | null | undefined,
  kind: MobKind,
  currentTick: number,
) {
  const pressure = normalizeEcologySector(input, currentTick).recentKills[kind] ?? 0;
  return Math.max(0.12, 1 / (1 + pressure * 1.5));
}
