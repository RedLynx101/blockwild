import assert from "node:assert/strict";
import test from "node:test";
import { MOUNT_PROFILES, createMountExertion, evaluateMountEligibility, exertionSpeedScale, selectMountMode, stepMountExertion, validateMountTransition } from "../app/game/creature-mounts";

test("unified mount profiles cover land, swim, fly, glide, climb, seats, and moves", () => {
  const capabilities = new Set(Object.values(MOUNT_PROFILES).flatMap((profile) => profile.capabilities));
  assert.deepEqual([...capabilities].sort(), ["climb", "fly", "glide", "land", "swim"]);
  assert.equal(MOUNT_PROFILES["sea-dragon"].seats, 2);
  assert.deepEqual(MOUNT_PROFILES["sea-dragon"].capabilities, ["land", "swim", "fly"]);
  assert.equal(MOUNT_PROFILES["wreckwhistle-porpoise"].mountedMoveSlots, 2);
});

test("medium selection is deterministic and anatomically constrained", () => {
  const reed = MOUNT_PROFILES.reedstrider;
  assert.equal(selectMountMode(reed, { inWater: true, grounded: false, steepSurface: false, openAirVolume: false, requestedAscent: false }), "swim");
  assert.equal(selectMountMode(reed, { inWater: false, grounded: true, steepSurface: false, openAirVolume: true, requestedAscent: true }), "land");
  const ray = MOUNT_PROFILES["voidmantle-ray"];
  assert.equal(selectMountMode(ray, { inWater: false, grounded: false, steepSurface: false, openAirVolume: true, requestedAscent: true }), "glide");
});

test("exertion removes burst speed without reducing ordinary travel", () => {
  const profile = MOUNT_PROFILES["wild-horse"];
  let state = createMountExertion(profile);
  for (let index = 0; index < 80; index += 1) state = stepMountExertion(state, { dt: .2, sprinting: true, ascending: false, charge: false });
  assert.equal(exertionSpeedScale(state, false), 1);
  assert.equal(exertionSpeedScale(state, true), 1);
  for (let index = 0; index < 100; index += 1) state = stepMountExertion(state, { dt: .2, sprinting: false, ascending: false, charge: false });
  assert.ok(state.current > 0);
});

test("swept transition checks stop at the first blocked body volume", () => {
  const clear = validateMountTransition({ x: 0, y: 1, z: 0, radius: .7, height: 2 }, { x: 4, y: 3, z: 0, radius: .7, height: 2 }, () => true);
  assert.equal(clear.clear, true);
  const blocked = validateMountTransition({ x: 0, y: 1, z: 0, radius: .7, height: 2 }, { x: 4, y: 3, z: 0, radius: .7, height: 2 }, (x) => x < 2);
  assert.equal(blocked.clear, false);
  assert.ok((blocked.blockedAt?.x ?? 0) >= 2);
});

test("unified mount eligibility protects ownership, maturity, bond, and fitted tack", () => {
  const roclet = MOUNT_PROFILES["stormglass-roclet"];
  const ready = { bondTier: "partnered" as const, level: 32, lifeStage: "adult", baby: false, tamed: true, owned: true, saddleFitted: true };
  assert.deepEqual(evaluateMountEligibility(roclet, ready), { allowed: true, reason: "ready" });
  assert.equal(evaluateMountEligibility(roclet, { ...ready, owned: false }).reason, "not-owned");
  assert.equal(evaluateMountEligibility(roclet, { ...ready, bondTier: "wary" }).reason, "not-bonded");
  assert.equal(evaluateMountEligibility(roclet, { ...ready, baby: true }).reason, "too-young");
  assert.equal(evaluateMountEligibility(roclet, { ...ready, saddleFitted: false }).reason, "needs-saddle");
});
