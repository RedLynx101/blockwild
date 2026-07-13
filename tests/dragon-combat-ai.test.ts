import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import {
  commitDragonCombatAttack,
  constrainDragonCombatPosition,
  createDragonCombatManeuverState,
  createDragonState,
  dragonAttackFacingPose,
  dragonAttackPlan,
  dragonCombatProfile,
  planDragonCombatManeuver,
  type DragonCombatPhase,
  type DragonCombatManeuverState,
  type DragonPoint,
  type DragonType,
} from "../app/game/dragons.ts";
import { applyDragonPose, createMobVisual } from "../app/game/mob-models.ts";

const TARGET = Object.freeze({ x: 0, y: 0, z: 0 });

function moveToward(position: DragonPoint, destination: DragonPoint, distance: number): DragonPoint {
  const dx = destination.x - position.x;
  const dz = destination.z - position.z;
  const horizontal = Math.hypot(dx, dz);
  const step = Math.min(horizontal, distance);
  return {
    x: horizontal > 0.001 ? position.x + dx / horizontal * step : position.x,
    y: position.y + (destination.y - position.y) * 0.14,
    z: horizontal > 0.001 ? position.z + dz / horizontal * step : position.z,
  };
}

function simulateCombat(type: DragonType, seed = 42) {
  const dragonState = createDragonState(type, { dragonId: `${type}:planner:test`, ageDays: 100 });
  const swimming = type === "sea";
  const profile = dragonCombatProfile(type, dragonState.stage, swimming);
  let maneuver = createDragonCombatManeuverState(seed);
  let position: DragonPoint = {
    x: profile.entryRadius + 5,
    y: swimming ? 0 : profile.cruiseAltitude,
    z: profile.missDistance,
  };
  const phases = new Set<DragonCombatPhase>();
  const attacks: string[] = [];
  let minimumSeparation = Infinity;
  const samples: Array<{ phase: DragonCombatPhase; x: number; z: number }> = [];

  for (let frame = 0; frame < 360; frame += 1) {
    const lineOfSight = frame < 180 || frame >= 200;
    const plan = planDragonCombatManeuver({
      dragonState,
      maneuver,
      dt: 0.1,
      combatSeed: seed,
      targetToken: -1,
      dragonPosition: position,
      targetPosition: TARGET,
      lineOfSight,
      swimming,
    });
    maneuver = plan.maneuver;
    phases.add(maneuver.phase);
    assert.ok(Math.hypot(plan.destination.x, plan.destination.z) >= plan.minimumHorizontalSeparation * 0.99,
      `${type} destination must never be the target's x/z coordinate`);
    if (plan.attack) {
      attacks.push(plan.attack.kind);
      maneuver = commitDragonCombatAttack(maneuver, plan.attack.kind);
    }
    position = constrainDragonCombatPosition(
      moveToward(position, plan.destination, 0.9 * plan.speedScale),
      TARGET,
      plan.minimumHorizontalSeparation,
      maneuver.passBearing,
    );
    minimumSeparation = Math.min(minimumSeparation, Math.hypot(position.x, position.z));
    if (frame % 6 === 0) samples.push({ phase: maneuver.phase, x: position.x, z: position.z });
  }
  return { attacks, phases, minimumSeparation, profile, samples };
}

function angleError(first: number, second: number) {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
}

function simulateEngineMeleePass(type: "fire" | "sea", stage: 3 | 4 | 5) {
  const ageDays = (stage - 1) * 25;
  const dragonState = createDragonState(type, { dragonId: `${type}:engine-melee:${stage}`, ageDays });
  assert.equal(dragonState.stage, stage);
  const swimming = type === "sea";
  const profile = dragonCombatProfile(type, stage, swimming);
  const target = { x: 0, y: 1.4, z: 0 } as const;
  const surface = 0;
  let maneuver: DragonCombatManeuverState = {
    ...createDragonCombatManeuverState(stage * 19),
    phase: "attack-run" as const,
    phaseSeconds: 0,
    passIndex: type === "fire" ? 2 : 1,
    passBearing: 0,
    orbitDirection: 1 as const,
    targetToken: 22,
  };
  let position: DragonPoint = {
    x: target.x + profile.entryRadius,
    y: swimming ? target.y + 0.18 : target.y + profile.cruiseAltitude,
    z: target.z + profile.missDistance * 1.08,
  };
  let minimumSeparation = Infinity;
  let committedDistance = Infinity;
  let attackKind: string | null = null;

  for (let frame = 0; frame < 70; frame += 1) {
    const plan = planDragonCombatManeuver({
      dragonState,
      maneuver,
      dt: 0.1,
      combatSeed: stage * 19,
      targetToken: 22,
      dragonPosition: position,
      targetPosition: target,
      lineOfSight: true,
      swimming,
    });
    maneuver = plan.maneuver;
    if (type === "fire" && maneuver.phase === "attack-run") assert.equal(plan.terrainClearance, 1.45);
    if (plan.attack) {
      attackKind = plan.attack.kind;
      committedDistance = Math.hypot(position.x - target.x, position.y - target.y, position.z - target.z);
      break;
    }

    // Mirror updateDragonMob's actual horizontal step and altitude smoothing.
    // Stage-derived Sea speed follows the same contract used by the engine.
    const level = Math.floor(ageDays * 2) + stage * 3;
    const seaGrowth = 1 + (level - 1) * 0.004;
    const engineBaseSpeed = swimming ? (4.8 + stage * 1.25) * seaGrowth : 3.8 + stage * 1.25;
    const dx = plan.destination.x - position.x;
    const dz = plan.destination.z - position.z;
    const horizontal = Math.hypot(dx, dz);
    const step = Math.min(horizontal, engineBaseSpeed * plan.speedScale * 0.1);
    const nextX = horizontal > 0.001 ? position.x + dx / horizontal * step : position.x;
    const nextZ = horizontal > 0.001 ? position.z + dz / horizontal * step : position.z;
    const desiredY = swimming ? plan.destination.y : Math.max(plan.destination.y, surface + plan.terrainClearance);
    const altitudeRate = swimming ? 0.18 : 0.14;
    position = constrainDragonCombatPosition({
      x: nextX,
      y: position.y + (desiredY - position.y) * altitudeRate,
      z: nextZ,
    }, target, plan.minimumHorizontalSeparation, maneuver.passBearing);
    minimumSeparation = Math.min(minimumSeparation, Math.hypot(position.x - target.x, position.z - target.z));
  }

  return { attackKind, committedDistance, minimumSeparation, profile };
}

test("combat planner is deterministic and its target switch starts from the current radial lane", () => {
  const dragonState = createDragonState("fire", { dragonId: "deterministic", ageDays: 100 });
  const input = {
    dragonState,
    maneuver: createDragonCombatManeuverState(91),
    dt: 0.1,
    combatSeed: 91,
    targetToken: 7,
    dragonPosition: { x: -14, y: 8, z: 9 },
    targetPosition: TARGET,
    lineOfSight: true,
  } as const;
  const first = planDragonCombatManeuver(input);
  const second = planDragonCombatManeuver(input);
  assert.deepEqual(first, second);
  assert.equal(first.maneuver.targetToken, 7);
  assert.ok(Math.abs(first.maneuver.passBearing - Math.atan2(9, -14)) < 1e-9);
  assert.notEqual(first.destination.x, 0);
  assert.notEqual(first.destination.z, 0);
});

test("adult lineages complete offset attack passes, breakaways, orbits, and sightline repositioning", () => {
  const expectedAttack = {
    fire: "breath", ice: "projectile", steel: "projectile", sea: "breath", gold: "projectile", silver: "projectile",
  } as const;
  for (const type of ["fire", "ice", "steel", "sea", "gold", "silver"] as const) {
    const result = simulateCombat(type);
    for (const phase of ["approach", "attack-run", "breakaway", "orbit", "reposition"] as const) {
      assert.ok(result.phases.has(phase), `${type} should enter ${phase}`);
    }
    assert.ok(result.attacks.includes(expectedAttack[type]), `${type} should use its signature ${expectedAttack[type]} pass`);
    if (type === "fire") assert.ok(result.attacks.includes("melee"), "Fire should periodically finish a low dive with claws");
    if (type === "sea") assert.ok(result.attacks.includes("melee"), "Sea should occasionally close from its low aquatic arc");
    assert.ok(result.minimumSeparation >= result.profile.missDistance,
      `${type} should retain its lateral miss lane instead of converging overhead`);
  }
});

test("lineages use meaningfully different combat geometry and attack priorities", () => {
  const fire = dragonCombatProfile("fire", 5);
  const steel = dragonCombatProfile("steel", 5);
  const sea = dragonCombatProfile("sea", 5, true);
  const gold = dragonCombatProfile("gold", 5);
  assert.equal(fire.style, "cinder-dive");
  assert.ok(fire.attackAltitude < steel.attackAltitude, "Fire dives below Steel's long strafe");
  assert.ok(steel.entryRadius > fire.entryRadius * 1.5, "Steel establishes a long firing lane");
  assert.ok(sea.attackAltitude < 1, "a swimming Sea dragon stays in a low aquatic arc");
  assert.ok(gold.orbitRadius > steel.orbitRadius, "Gold owns the broadest celestial orbit");

  const attackRun = { ...createDragonCombatManeuverState(4), phase: "attack-run" as const, targetToken: 1 };
  const makePlan = (type: DragonType, position: DragonPoint) => planDragonCombatManeuver({
    dragonState: createDragonState(type, { dragonId: `${type}:attack-choice`, ageDays: 100 }),
    maneuver: attackRun,
    dt: 0.6,
    combatSeed: 4,
    targetToken: 1,
    dragonPosition: position,
    targetPosition: TARGET,
    lineOfSight: true,
    swimming: type === "sea",
  });
  assert.equal(makePlan("fire", { x: 8, y: 3, z: 3 }).attack?.kind, "breath");
  assert.equal(makePlan("steel", { x: 24, y: 7, z: 7 }).attack?.kind, "projectile");
  assert.equal(makePlan("gold", { x: 28, y: 9, z: 8 }).attack?.kind, "projectile");
});

test("protected miss lanes hold across deterministic orbit directions and pass bearings", () => {
  for (const type of ["fire", "ice", "steel", "sea", "gold", "silver"] as const) {
    for (let seed = 0; seed < 8; seed += 1) {
      const result = simulateCombat(type, seed);
      assert.ok(result.minimumSeparation >= result.profile.missDistance,
        `${type} seed ${seed} crossed its ${result.profile.missDistance.toFixed(3)}-block protected lane at ${result.minimumSeparation.toFixed(3)}`);
    }
  }
});

test("stage-one dragons remain ground-close melee defenders", () => {
  const dragonState = createDragonState("silver", { dragonId: "young-defender", ageDays: 2 });
  const profile = dragonCombatProfile("silver", 1);
  const maneuver = { ...createDragonCombatManeuverState(8), phase: "attack-run" as const, targetToken: 2 };
  const plan = planDragonCombatManeuver({
    dragonState,
    maneuver,
    dt: 0.1,
    combatSeed: 8,
    targetToken: 2,
    dragonPosition: { x: 1.2, y: 0, z: 0.2 },
    targetPosition: TARGET,
    lineOfSight: true,
  });
  assert.equal(profile.attackAltitude, 0);
  assert.equal(plan.attack?.kind, "melee");
});

test("Stage III-V Fire claws and Sea bites connect under engine-realistic altitude and speed rules", () => {
  for (const type of ["fire", "sea"] as const) {
    for (const stage of [3, 4, 5] as const) {
      const result = simulateEngineMeleePass(type, stage);
      const melee = dragonAttackPlan(type, stage, "melee");
      assert.equal(result.attackKind, "melee", `${type} Stage ${stage} should complete its signature close pass`);
      assert.ok(result.committedDistance <= melee.range,
        `${type} Stage ${stage} committed at ${result.committedDistance.toFixed(3)}, outside ${melee.range.toFixed(3)} reach`);
      assert.ok(result.minimumSeparation >= result.profile.missDistance,
        `${type} Stage ${stage} close pass crossed the protected horizontal lane`);
    }
  }
});

test("attack tracking uses the dragon rig's -Z convention and bends toward the target", () => {
  const currentHeading = 0;
  const targetHeading = 0.92;
  const facing = dragonAttackFacingPose(currentHeading, targetHeading, "breath", 0.5);
  assert.ok(facing.visualHeading > currentHeading, "the body should turn toward a positive world-heading delta");
  assert.ok(facing.lookYaw < 0, "local head yaw must oppose the residual because the rig faces local -Z");

  const model = createMobVisual("fire-dragon", 2_001);
  model.group.rotation.y = -facing.visualHeading - Math.PI / 2;
  applyDragonPose(model.group, {
    timeSeconds: 1,
    stage: 5,
    mode: "breath",
    attackProgress: 0.5,
    lookYaw: facing.lookYaw,
  });
  model.group.updateMatrixWorld(true);
  const head = model.group.getObjectByName("fire-dragon-head-pivot");
  assert.ok(head);
  const headForward = new THREE.Vector3(0, 0, -1).applyQuaternion(head.getWorldQuaternion(new THREE.Quaternion()));
  const headWorldHeading = Math.atan2(headForward.z, headForward.x);
  assert.ok(angleError(headWorldHeading, targetHeading) < angleError(facing.visualHeading, targetHeading),
    "the articulated neck must reduce, not amplify, the remaining world-facing error");

  const recovering = dragonAttackFacingPose(currentHeading, targetHeading, "breath", 0.9);
  const released = dragonAttackFacingPose(currentHeading, targetHeading, "breath", 1);
  assert.ok(Math.abs(recovering.visualHeading - currentHeading) < Math.abs(facing.visualHeading - currentHeading));
  assert.ok(Math.abs(recovering.lookYaw) < Math.abs(facing.lookYaw));
  assert.equal(released.visualHeading, currentHeading, "body tracking must settle before the animation object clears");
  assert.equal(released.lookYaw, 0, "neck tracking must settle before the animation object clears");
});

test("engine integrates maneuver destinations and publishes the live tactic phase", () => {
  const engine = readFileSync(new URL("../app/game/engine.ts", import.meta.url), "utf8");
  assert.match(engine, /planDragonCombatManeuver\(\{/u);
  assert.match(engine, /surface \+ \(combatPlan\?\.terrainClearance \?\? 4\.5\)/u);
  assert.match(engine, /constrainDragonCombatPosition\(/u);
  assert.match(engine, /commitDragonCombatAttack\(mob\.dragonCombatManeuver, combatPlan\.attack\.kind\)/u);
  assert.match(engine, /dragonAttackFacingPose\(mob\.angle, mob\.dragonAttackFacing/u);
  assert.match(engine, /dragonCombatManeuver\.phase.*passIndex/u);
  assert.match(engine, /wildPlayerInGuard && \(seesPlayerNow \|\| mob\.awarenessTimer > 0\)/u,
    "a previously detected player remains targetable long enough for sightline repositioning");
  assert.doesNotMatch(engine, /combatAltitude = targetPoint \? Math\.max\(targetPoint\.y \+ 2\.2/u,
    "the old exact-overhead altitude steering must not return");
});
