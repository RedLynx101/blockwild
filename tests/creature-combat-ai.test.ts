import assert from "node:assert/strict";
import test from "node:test";
import {
  beginCreatureMove,
  combatContactEnvelope,
  chooseCreatureMove,
  chooseThreatTarget,
  creatureMoveMovementPolicy,
  evaluateCombatContact,
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

test("contact moves share a body-aware reach envelope and plant their feet", () => {
  const move = CREATURE_MOVES["flame-basic"];
  const small = combatContactEnvelope(move, 0.3, 0.34);
  const large = combatContactEnvelope(move, 1.8, 0.34);
  assert.ok(small.acquireDistance > small.activeDistance);
  assert.ok(small.activeDistance >= small.commitDistance);
  assert.ok(large.activeDistance > small.activeDistance);
  assert.ok(small.targetGrace > 0 && small.targetGrace < 0.4);
  assert.equal(creatureMoveMovementPolicy(move), "stationary");
  assert.equal(creatureMoveMovementPolicy(CREATURE_MOVES["flame-surge"]), "authored");
});

test("custom reach predicate replaces the planner's legacy center-distance filter", () => {
  const contactOnly = { ...base, moveIds: ["flame-basic"], distance: 2.35 };
  assert.equal(chooseCreatureMove(contactOnly), null);
  assert.equal(chooseCreatureMove({ ...contactOnly, canReachTarget: () => true })?.move.id, "flame-basic");
  assert.equal(chooseCreatureMove({ ...contactOnly, canReachTarget: () => false }), null);
});

test("contact evaluation requires range, facing, and sight while allowing only bounded target motion", () => {
  const envelope = combatContactEnvelope(CREATURE_MOVES["flame-basic"], 0.45, 0.34);
  const baseContact = {
    attacker: { x: 0, y: 0, z: 0 },
    attackerFacing: 0,
    target: { x: envelope.activeDistance - 0.02, y: 0, z: 0 },
    envelope,
    lineOfSight: true,
  };
  assert.equal(evaluateCombatContact(baseContact), "hit");
  assert.equal(evaluateCombatContact({ ...baseContact, attackerFacing: Math.PI }), "dodged");
  assert.equal(evaluateCombatContact({ ...baseContact, lineOfSight: false }), "obstructed");
  assert.equal(evaluateCombatContact({ ...baseContact, target: { x: envelope.activeDistance + 0.12, y: 0, z: 0 }, previousTarget: baseContact.target }), "hit");
  assert.equal(evaluateCombatContact({ ...baseContact, target: { x: envelope.activeDistance + 0.5, y: 0, z: 0 }, previousTarget: baseContact.target }), "dodged");
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
