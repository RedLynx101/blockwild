import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceStatusEffects,
  applyStatusEffect,
  createStatusEffectState,
  statusEffectViewsFromBuffs,
} from "../app/game/status-effects.ts";

test("fire and venom have distinct harmful HUD presentations", () => {
  const views = statusEffectViewsFromBuffs({ "dragon-burning": 20, "venom-poison": 18 }, 10);
  assert.deepEqual(views.map((view) => view.kind).sort(), ["burning", "poison"]);
  assert.ok(views.every((view) => view.harmful));
  assert.equal(views.find((view) => view.kind === "poison")?.name, "Venom");
});

test("periodic poison advances in bounded health ticks", () => {
  const state = applyStatusEffect(createStatusEffectState(), {
    id: "test-poison",
    kind: "poison",
    name: "Test Venom",
    description: "A focused test effect.",
    source: { kind: "environment", id: "test" },
    magnitude: 0.5,
    harmful: true,
    startedAt: 0,
    expiresAt: 10,
    tickEverySeconds: 1.5,
    nextTickAt: 1.5,
    stackRule: "replace",
  });
  const advanced = advanceStatusEffects(state, 4.6);
  assert.equal(advanced.damage, 1.5);
  assert.equal(advanced.healing, 0);
});
