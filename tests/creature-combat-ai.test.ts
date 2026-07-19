import assert from "node:assert/strict";
import test from "node:test";
import {
  beginCreatureMove,
  chooseCreatureMove,
  chooseThreatTarget,
  markCreatureMoveApplied,
  scoreCreatureMoves,
  stepCreatureMove,
  stepMoveCooldowns,
} from "../app/game/creature-combat-ai";
import { CREATURE_MOVES } from "../app/game/creature-moves";

const base = {
  moveIds: ["flame-basic", "flame-surge", "flame-guard"],
  cooldowns: {},
  tactic: "pursue" as const,
  distance: 1.2,
  verticalDistance: 0,
  hasLineOfSight: true,
  attackerTypes: ["flame"] as const,
  targetTypes: ["verdant"] as const,
  healthRatio: 1,
  ownerHealthRatio: 1,
  targetHealthRatio: 0.5,
  friendlyFireRisk: 0,
  terrainFit: 0,
};

test("move planner is deterministic and respects legal range, cooldown, and tactic", () => {
  const first = chooseCreatureMove(base);
  const second = chooseCreatureMove(base);
  assert.equal(first?.move.id, second?.move.id);
  assert.ok(first);
  assert.ok(scoreCreatureMoves({ ...base, cooldowns: { [first.move.id]: 5 } }).every((entry) => entry.move.id !== first.move.id));
  assert.equal(chooseCreatureMove({ ...base, distance: 40 })?.move.id, "flame-guard");
  const hold = chooseCreatureMove({ ...base, tactic: "hold", distance: 1 });
  assert.equal(hold?.move.id, "flame-guard");
});

test("damage-capable moves cannot become active before their windup elapses", () => {
  const move = CREATURE_MOVES["flame-surge"];
  let active = beginCreatureMove(move, { kind: "creature", id: 22 });
  const early = stepCreatureMove(active, move.windupSeconds - 0.001);
  assert.equal(early.event, "none");
  assert.equal(early.state?.phase, "windup");
  const frame = stepCreatureMove(early.state, 0.002);
  assert.equal(frame.event, "became-active");
  assert.equal(frame.state?.phase, "active");
  assert.equal(frame.state?.applied, false);
  active = markCreatureMoveApplied(frame.state!);
  assert.equal(active.applied, true);
  const recovery = stepCreatureMove(active, move.activeSeconds + 0.01);
  assert.equal(recovery.event, "became-recovery");
  assert.equal(recovery.state?.phase, "recovery");
  assert.equal(stepCreatureMove(recovery.state, move.recoverySeconds + 0.01).event, "finished");
});

test("cooldowns and threat selection stay bounded and decay predictably", () => {
  assert.deepEqual(stepMoveCooldowns({ a: 2, b: 0.1 }, 0.5), { a: 1.5 });
  const entries = [
    { source: { kind: "player" as const, id: "near" }, score: 10, lastHostileAt: 0, lastSeenAt: 0 },
    { source: { kind: "creature" as const, id: 8 }, score: 8, lastHostileAt: 10, lastSeenAt: 10 },
  ];
  assert.deepEqual(chooseThreatTarget(entries, 10, () => true), { kind: "creature", id: 8 });
  assert.equal(chooseThreatTarget(entries, 60, () => true), null);
  assert.deepEqual(chooseThreatTarget(entries, 10, (ref) => ref.kind === "player"), { kind: "player", id: "near" });
  assert.equal(chooseThreatTarget(entries, 10, () => false), null);
});
