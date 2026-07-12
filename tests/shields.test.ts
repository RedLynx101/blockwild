import assert from "node:assert/strict";
import test from "node:test";
import { SHIELD_PROFILES, resolveShieldHit, shouldRaiseOffhandShield } from "../app/game/shields.ts";

test("raised shields reduce only frontal damage and spend durability", () => {
  const front = resolveShieldHit({ kind: "wildwood-shield", raised: true, durability: 50, incomingDamage: 10, attackerDirection: { x: 0, z: -1 }, defenderYaw: 0 });
  assert.equal(front.blocked, true);
  assert.ok(Math.abs(front.damage - 3.2) < 0.0001);
  assert.ok(front.durability < 50);
  const rear = resolveShieldHit({ kind: "wildwood-shield", raised: true, durability: 50, incomingDamage: 10, attackerDirection: { x: 0, z: 1 }, defenderYaw: 0 });
  assert.equal(rear.blocked, false);
  assert.equal(rear.damage, 10);
});

test("sunmetal blocks more and lasts longer while interaction remains right-click priority", () => {
  assert.ok(SHIELD_PROFILES["sunmetal-shield"].blockFraction > SHIELD_PROFILES["wildwood-shield"].blockFraction);
  assert.ok(SHIELD_PROFILES["sunmetal-shield"].maxDurability > SHIELD_PROFILES["wildwood-shield"].maxDurability);
  assert.equal(shouldRaiseOffhandShield({ hasShield: true, primaryInteractionHandled: true, rightHeld: true }), false);
  assert.equal(shouldRaiseOffhandShield({ hasShield: true, primaryInteractionHandled: false, rightHeld: true }), true);
});
