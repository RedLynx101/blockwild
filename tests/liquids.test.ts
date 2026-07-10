import assert from "node:assert/strict";
import test from "node:test";
import {
  LiquidSimulator,
  stepSwimming,
  waterAnimationPhase,
  waterSurfaceSample,
  type LiquidCell,
  type LiquidPosition,
  type LiquidWorldAdapter,
} from "../app/game/liquids.ts";

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
