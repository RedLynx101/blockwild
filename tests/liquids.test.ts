import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_SWIM_RULES,
  LIQUID_SIMULATION_STEP_SECONDS,
  LiquidSimulator,
  stepSwimming,
  waterAnimationPhase,
  waterSurfaceSample,
  type LiquidCell,
  type LiquidPosition,
  type LiquidWorldAdapter,
  type SwimmerState,
} from "../app/game/liquids.ts";
import { BlockId } from "../app/game/data.ts";
import { ChunkWorld, voxelInterfaceFaceOwner } from "../app/game/world.ts";

const key = (position: LiquidPosition) => `${position.x},${position.y},${position.z}`;

class TestLiquidWorld implements LiquidWorldAdapter {
  readonly liquids = new Map<string, LiquidCell>();
  readonly solids = new Set<string>();
  minY = 0;
  maxY = 12;

  getLiquid(position: LiquidPosition) {
    return this.liquids.get(key(position));
  }

  setLiquid(position: LiquidPosition, liquid: LiquidCell | undefined) {
    if (liquid) this.liquids.set(key(position), liquid);
    else this.liquids.delete(key(position));
  }

  isSolid(position: LiquidPosition) {
    return this.solids.has(key(position));
  }
}

function settle(simulator: LiquidSimulator, maxTicks = 200) {
  for (let tick = 0; tick < maxTicks && simulator.pendingCount > 0; tick += 1) simulator.process(256);
  assert.equal(simulator.pendingCount, 0, "liquid frontier should settle under the test bound");
}

test("liquid flow propagates down and sideways while respecting solid cells", () => {
  const world = new TestLiquidWorld();
  for (let z = -8; z <= 8; z += 1) for (let x = -8; x <= 8; x += 1) world.solids.add(`${x},0,${z}`);
  const simulator = new LiquidSimulator(world);
  assert.equal(simulator.addSource({ x: 0, y: 3, z: 0 }), true);
  simulator.process(1);
  assert.deepEqual(world.getLiquid({ x: 0, y: 2, z: 0 }), { kind: "water", level: 1, source: false, falling: true });
  settle(simulator);
  assert.equal(world.getLiquid({ x: 0, y: 1, z: 0 })?.falling, true);
  assert.equal(world.getLiquid({ x: 1, y: 3, z: 0 })?.level, 1);
  assert.equal(world.getLiquid({ x: 8, y: 3, z: 0 }), undefined, "horizontal spread is finite");
  assert.equal(world.getLiquid({ x: 0, y: 0, z: 0 }), undefined, "water never replaces support blocks");
});

test("each liquid tick advances only one horizontal frontier level", () => {
  const world = new TestLiquidWorld();
  for (let z = -8; z <= 8; z += 1) for (let x = -8; x <= 8; x += 1) world.solids.add(`${x},0,${z}`);
  const simulator = new LiquidSimulator(world);
  simulator.addSource({ x: 0, y: 1, z: 0 });

  simulator.process(256);
  assert.equal(world.getLiquid({ x: 1, y: 1, z: 0 })?.level, 1);
  assert.equal(world.getLiquid({ x: 2, y: 1, z: 0 }), undefined, "one update may not drain multiple frontier levels");

  simulator.process(256);
  assert.equal(world.getLiquid({ x: 2, y: 1, z: 0 })?.level, 2);
  assert.equal(LIQUID_SIMULATION_STEP_SECONDS, 0.2);
});

test("two supported water sources renew the cell between them", () => {
  const world = new TestLiquidWorld();
  for (let x = -2; x <= 2; x += 1) world.solids.add(`${x},0,0`);
  const simulator = new LiquidSimulator(world);
  simulator.addSource({ x: -1, y: 1, z: 0 });
  simulator.addSource({ x: 1, y: 1, z: 0 });
  settle(simulator);
  assert.deepEqual(world.getLiquid({ x: 0, y: 1, z: 0 }), { kind: "water", level: 0, source: true, falling: false });
});

test("the liquid queue is deduplicated and work is capped per call", () => {
  const world = new TestLiquidWorld();
  const simulator = new LiquidSimulator(world, { maxOperationsPerTick: 1 });
  simulator.addSource({ x: 0, y: 8, z: 0 });
  const pending = simulator.pendingCount;
  assert.equal(simulator.enqueue({ x: 0, y: 8, z: 0 }), false);
  assert.equal(simulator.pendingCount, pending);
  const changes = simulator.process();
  assert.ok(changes.length <= 5, "one processed cell can affect at most down plus four sides");
  assert.ok(simulator.pendingCount > 0);
});

test("water animation is periodic, spatially varied, and seam-safe", () => {
  const phase = waterAnimationPhase(1250, 4, -9);
  const repeated = waterAnimationPhase(1250 + 1000 / 0.11, 4, -9);
  assert.ok(Math.abs(phase - repeated) < 1e-9);
  assert.notEqual(phase, waterAnimationPhase(1250, 5, -9));
  const sample = waterSurfaceSample(5000, 12, 8);
  assert.ok(Math.abs(sample.heightOffset) < 0.04);
  assert.ok(Math.abs(sample.uvOffset.u) <= 0.018);
  assert.ok(Math.abs(sample.uvOffset.v) <= 0.014);
});

test("ice and water share one deterministic interface owner", () => {
  assert.equal(voxelInterfaceFaceOwner(BlockId.Ice, BlockId.Water), "current");
  assert.equal(voxelInterfaceFaceOwner(BlockId.Water, BlockId.Ice), "neighbor");
  assert.equal(voxelInterfaceFaceOwner(BlockId.Water, BlockId.Water), "none");
  assert.equal(voxelInterfaceFaceOwner(BlockId.Ice, BlockId.Ice), "none");
});

test("water animation advances without re-uploading the block atlas", () => {
  const world = new ChunkWorld();
  const atlasVersion = world.atlas.version;
  world.updateWaterAnimation(120);
  world.updateWaterAnimation(240);
  assert.equal(world.atlas.version, atlasVersion);
  world.dispose();
});

test("swimming drains oxygen, applies drowning ticks, and boosts a same-level shore exit", () => {
  const shore = stepSwimming(
    { velocityY: -0.4, oxygenSeconds: 8, drowningAccumulator: 0 },
    { jumpHeld: true, movingForward: true },
    { submersion: 0.75, headSubmerged: false, horizontalCollision: true, shoreLedgeHeight: 1, surfaceGap: 0.3 },
    1 / 60,
  );
  assert.equal(shore.shoreBoosted, true);
  assert.ok(shore.state.velocityY >= 7.4);
  assert.ok(shore.horizontalSpeedScale < 1);

  const drowning = stepSwimming(
    { velocityY: 0, oxygenSeconds: 0, drowningAccumulator: 1.4 },
    { jumpHeld: false, movingForward: false },
    { submersion: 1, headSubmerged: true, horizontalCollision: false },
    0.2,
  );
  assert.equal(drowning.damage, 1);
  assert.ok(drowning.state.drowningAccumulator < 0.2);
});

test("an idle swimmer settles downward while an intentional swim stroke rises", () => {
  let idle = { velocityY: 0, oxygenSeconds: 12, drowningAccumulator: 0 };
  let rising = { ...idle };
  for (let frame = 0; frame < 120; frame += 1) {
    idle = stepSwimming(
      idle,
      { jumpHeld: false, movingForward: false },
      { submersion: 1, headSubmerged: true, horizontalCollision: false },
      1 / 60,
    ).state;
    rising = stepSwimming(
      rising,
      { jumpHeld: true, movingForward: false },
      { submersion: 1, headSubmerged: true, horizontalCollision: false },
      1 / 60,
    ).state;
  }
  assert.ok(idle.velocityY < -0.75 && idle.velocityY >= -2.3, `idle sink velocity was ${idle.velocityY}`);
  assert.ok(rising.velocityY > 1.5, `jump-held swim velocity was ${rising.velocityY}`);
});

test("sprint-swimming adds exactly twenty percent to vertical stroke acceleration", () => {
  const state = { velocityY: 0, oxygenSeconds: 12, drowningAccumulator: 0 };
  const environment = { submersion: 1, headSubmerged: true, horizontalCollision: false };
  const isolatedStrokeRules = {
    ...DEFAULT_SWIM_RULES,
    buoyancyAcceleration: 0,
    passiveSinkAcceleration: 0,
    waterDrag: 0,
  };
  const ordinary = stepSwimming(state, { jumpHeld: true, movingForward: true }, environment, 0.1, isolatedStrokeRules);
  const sprinting = stepSwimming(state, { jumpHeld: true, movingForward: true, sprinting: true }, environment, 0.1, isolatedStrokeRules);
  assert.ok(Math.abs(sprinting.state.velocityY / ordinary.state.velocityY - 1.2) < 1e-9);
});

test("held swim input produces repeatable breathing bobs without walking on the surface", () => {
  let swimmer: SwimmerState = { velocityY: 0, oxygenSeconds: 12, drowningAccumulator: 0, entryMomentumSpeed: 0 };
  for (const fps of [30, 60, 120]) {
    // Begin roughly the same 0.68 blocks below eye-level breathing depth as
    // the production audit, rather than giving the first stroke a head start.
    let feetY = -2.18;
    swimmer = { velocityY: 0, oxygenSeconds: 12, drowningAccumulator: 0, entryMomentumSpeed: 0 };
    let firstBreathFrame = -1;
    let highestFeetY = feetY;
    let stableLowestFeetY = Number.POSITIVE_INFINITY;
    let stableHighestFeetY = Number.NEGATIVE_INFINITY;
    let stableSubmergedFrames = 0;
    let minimumStableOxygen = 12;
    let strokeStarts = 0;
    const strokeTimes: number[] = [];
    for (let frame = 0; frame < fps * 15; frame += 1) {
      const headSubmerged = feetY + 1.5 < 0;
      const priorCooldown = swimmer.surfaceStrokeCooldownSeconds ?? 0;
      const next = stepSwimming(
        swimmer,
        { jumpHeld: true, movingForward: true },
        { submersion: headSubmerged ? 1 : 0.68, headSubmerged, horizontalCollision: false, surfaceClearance: feetY + 1.5 },
        1 / fps,
      ).state;
      if (priorCooldown <= 0 && (next.surfaceStrokeCooldownSeconds ?? 0) > 0) {
        strokeStarts += 1;
        strokeTimes.push(frame / fps);
      }
      swimmer = next;
      feetY += swimmer.velocityY / fps;
      highestFeetY = Math.max(highestFeetY, feetY);
      if (feetY + 1.5 >= 0 && firstBreathFrame < 0) firstBreathFrame = frame;
      if (firstBreathFrame >= 0 && frame > firstBreathFrame + fps) {
        stableLowestFeetY = Math.min(stableLowestFeetY, feetY);
        stableHighestFeetY = Math.max(stableHighestFeetY, feetY);
        if (feetY + 1.5 < 0) stableSubmergedFrames += 1;
        minimumStableOxygen = Math.min(minimumStableOxygen, swimmer.oxygenSeconds);
      }
    }
    const stableIntervals = strokeTimes.slice(2).map((time, index) => time - strokeTimes[index + 1]);
    const averageInterval = stableIntervals.reduce((sum, interval) => sum + interval, 0) / stableIntervals.length;
    assert.ok(strokeStarts >= 10 && strokeStarts <= 14, `${fps} FPS held Space produced ${strokeStarts} strokes instead of the slower cadence`);
    assert.ok(averageInterval >= 1.05 && averageInterval <= 1.32, `${fps} FPS breathing cycle averaged ${averageInterval}s`);
    assert.ok(highestFeetY > -0.7, `${fps} FPS feet only rose to ${highestFeetY}, which cannot clear the water sample`);
    assert.ok(highestFeetY < -0.25, `${fps} FPS feet rose to ${highestFeetY}, which would become a water-walking launch`);
    assert.ok(stableLowestFeetY > -1.28, `${fps} FPS breathing bob fell too low: ${stableLowestFeetY}`);
    assert.ok(stableHighestFeetY < -0.75, `${fps} FPS breathing bob lifted the body too far: ${stableHighestFeetY}`);
    assert.equal(stableSubmergedFrames, 0, `${fps} FPS held swimming dipped the breathing point underwater`);
    assert.equal(minimumStableOxygen, 12, `${fps} FPS held swimming consumed oxygen after reaching the surface`);
  }

  const released = stepSwimming(
    swimmer,
    { jumpHeld: false, movingForward: false },
    { submersion: 1, headSubmerged: true, horizontalCollision: false },
    1 / 60,
  ).state;
  assert.equal(released.surfaceBreachReady, true, "releasing Space should arm the next intentional breach");
  assert.equal(released.surfaceStrokeCooldownSeconds, 0, "releasing Space should clear the held-stroke recovery timer");
});

test("a real fall carries moderated momentum through the water surface", () => {
  let entered = stepSwimming(
    { velocityY: -16, oxygenSeconds: 12, drowningAccumulator: 0 },
    { jumpHeld: false, movingForward: true },
    { submersion: 0.68, headSubmerged: false, horizontalCollision: false, enteredFromAir: true },
    1 / 60,
  );
  assert.ok(entered.state.velocityY < -3, `entry velocity ${entered.state.velocityY} should not stop at the surface`);
  assert.ok(entered.state.velocityY > -10, "water must still absorb most of a dangerous fall");
  let depth = -entered.state.velocityY / 60;
  for (let frame = 0; frame < 18; frame += 1) {
    entered = stepSwimming(
      entered.state,
      { jumpHeld: false, movingForward: true },
      { submersion: 1, headSubmerged: true, horizontalCollision: false },
      1 / 60,
    );
    depth += -entered.state.velocityY / 60;
    if (frame === 0) assert.ok(entered.state.velocityY < -3, "entry momentum must survive beyond the first submerged frame");
  }
  assert.ok(depth > 1.2, `a long fall should carry the player meaningfully underwater, reached ${depth}`);
});

test("crouching produces a deliberate faster dive without changing jump ascent", () => {
  let idle = { velocityY: 0, oxygenSeconds: 12, drowningAccumulator: 0 };
  let crouched = { ...idle };
  for (let frame = 0; frame < 60; frame += 1) {
    const environment = { submersion: 1, headSubmerged: true, horizontalCollision: false };
    idle = stepSwimming(idle, { jumpHeld: false, movingForward: false }, environment, 1 / 60).state;
    crouched = stepSwimming(crouched, { jumpHeld: false, movingForward: false, crouching: true }, environment, 1 / 60).state;
  }
  assert.ok(crouched.velocityY < idle.velocityY - 1, `${crouched.velocityY} should dive faster than ${idle.velocityY}`);
  assert.ok(crouched.velocityY >= -4.2);
});
