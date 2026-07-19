import assert from "node:assert/strict";
import test from "node:test";
import {
  NATURAL_POPULATION_POOLS,
  creatureRangeAction,
  ecologySectorKey,
  ecologySpeciesSpawnChance,
  enclosureProtectsCreature,
  globalNaturalCostCeiling,
  naturalPoolBudgets,
  naturalPopulationCost,
  naturalPopulationPoolForDefinition,
  naturalPopulationSnapshot,
  naturalSpawnCountCapacity,
  normalizeEcologySector,
  recordEcologyKill,
  selectDeficientNaturalPool,
  type NaturalPopulationRecord,
} from "../app/game/ecology-population.ts";
import { MOB_DEFS } from "../app/game/mobs.ts";

test("ecology exposes seven independent weighted population pools", () => {
  assert.deepEqual(NATURAL_POPULATION_POOLS, [
    "surface-animal", "ambient", "water-animal", "water-ambient", "cave-water", "underground", "monster",
  ]);
  const budgets = naturalPoolBudgets(false, 1);
  assert.deepEqual(budgets["surface-animal"], { target: 12, ceiling: 17 });
  assert.deepEqual(budgets.ambient, { target: 10, ceiling: 14 });
  assert.deepEqual(budgets["water-animal"], { target: 5, ceiling: 7 });
  assert.deepEqual(budgets["water-ambient"], { target: 10, ceiling: 16 });
  assert.deepEqual(budgets["cave-water"], { target: 4, ceiling: 6 });
  assert.deepEqual(budgets.underground, { target: 8, ceiling: 12 });
  assert.deepEqual(budgets.monster, { target: 7, ceiling: 11 });
  assert.ok(globalNaturalCostCeiling(false, 1, 2) > globalNaturalCostCeiling(false, 1, 1));
  assert.ok(globalNaturalCostCeiling(false, 1, 2) < globalNaturalCostCeiling(false, 1, 1) * 2);
});

test("species classification separates land, air, water, caves, monsters, and rare residents", () => {
  assert.equal(naturalPopulationPoolForDefinition(MOB_DEFS.thimbledeer), "surface-animal");
  assert.equal(naturalPopulationPoolForDefinition(MOB_DEFS.emberjay), "ambient");
  assert.equal(naturalPopulationPoolForDefinition(MOB_DEFS.shoalfin), "water-ambient");
  assert.equal(naturalPopulationPoolForDefinition(MOB_DEFS.gloomfin, true), "cave-water");
  assert.equal(naturalPopulationPoolForDefinition(MOB_DEFS.thimbledeer, true), "underground");
  assert.equal(naturalPopulationPoolForDefinition(MOB_DEFS.zombie), "monster");
  assert.equal(naturalPopulationPoolForDefinition(MOB_DEFS["worldshell-leviathan"]), null);
  assert.ok(naturalPopulationCost(MOB_DEFS.emberjay) <= naturalPopulationCost(MOB_DEFS.thimbledeer));
});

test("local population snapshots exclude protected records and preserve separated multiplayer fairness", () => {
  const records: NaturalPopulationRecord[] = [
    { pool: "surface-animal", cost: 1, x: 0, z: 0, eligible: true },
    { pool: "ambient", cost: 0.5, x: 2, z: 1, eligible: true },
    { pool: "surface-animal", cost: 2, x: 5, z: 5, eligible: false },
    { pool: "water-ambient", cost: 0.25, x: 220, z: 0, eligible: true },
  ];
  const firstPlayer = naturalPopulationSnapshot(records, { x: 0, z: 0 }, 64);
  const secondPlayer = naturalPopulationSnapshot(records, { x: 220, z: 0 }, 64);
  assert.deepEqual({ cost: firstPlayer.totalCost, count: firstPlayer.totalCount }, { cost: 1.5, count: 2 });
  assert.deepEqual({ cost: secondPlayer.totalCost, count: secondPlayer.totalCount }, { cost: 0.25, count: 1 });
  assert.equal(naturalPopulationSnapshot(records).totalCost, 1.75);
});

test("deficit selection fills biodiversity pools before using their herd ceiling", () => {
  const budgets = naturalPoolBudgets(false, 1);
  const records: NaturalPopulationRecord[] = Array.from({ length: 9 }, (_, index) => ({
    pool: "surface-animal" as const, cost: 1, x: index, z: 0, eligible: true,
  }));
  const snapshot = naturalPopulationSnapshot(records);
  assert.equal(selectDeficientNaturalPool(["surface-animal", "ambient"], snapshot, budgets), "ambient");
  assert.equal(naturalSpawnCountCapacity(3.75, 0.5), 7);
  assert.equal(naturalSpawnCountCapacity(0.2, 0.5), 0);
});

test("creature lifecycle has no age purge and protects old-base livestock as sleeping records", () => {
  assert.equal(enclosureProtectsCreature(false, true), true);
  assert.equal(enclosureProtectsCreature(true, true), true);
  assert.deepEqual(creatureRangeAction({ protected: false, distance: 80, simulationRadius: 58, outOfRangeSeconds: 0, elapsedSeconds: 30, following: false }), {
    action: "linger", outOfRangeSeconds: 30,
  });
  assert.equal(creatureRangeAction({ protected: false, distance: 80, simulationRadius: 58, outOfRangeSeconds: 30, elapsedSeconds: 15, following: false }).action, "despawn");
  assert.equal(creatureRangeAction({ protected: true, distance: 90, simulationRadius: 58, outOfRangeSeconds: 9_999, elapsedSeconds: 3_600, following: false }).action, "sleep");
  assert.equal(creatureRangeAction({ protected: true, distance: 90, simulationRadius: 58, outOfRangeSeconds: 9_999, elapsedSeconds: 3_600, following: true }).action, "active");
});

test("sector hunting pressure slows only the hunted species and decays over game days", () => {
  assert.equal(ecologySectorKey(-1, 64), "-1,1");
  const tick = 48_000;
  const hunted = recordEcologyKill(undefined, "thimbledeer", 2, tick);
  assert.ok(ecologySpeciesSpawnChance(hunted, "thimbledeer", tick) < ecologySpeciesSpawnChance(hunted, "emberjay", tick));
  const recovered = normalizeEcologySector(hunted, tick + 24_000);
  assert.equal(recovered.recentKills.thimbledeer, undefined);
});
