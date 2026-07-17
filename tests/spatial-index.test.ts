import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { VoxelEngine } from "../app/game/engine";
import { MOB_DEFS } from "../app/game/mobs";
import { XZSpatialIndex } from "../app/game/spatial-index";

test("XZ spatial queries remain exact across positive and negative cell boundaries", () => {
  const index = new XZSpatialIndex<string>(8);
  index.rebuild([
    { id: 1, value: "positive", x: 8.2, z: 0, radius: 0.25, order: 0 },
    { id: 2, value: "negative", x: -8.2, z: 0, radius: 0.25, order: 1 },
    { id: 3, value: "outside", x: 8.46, z: 0, radius: 0.25, order: 2 },
  ]);

  assert.deepEqual(index.queryOverlappingCircle(7.9, 0, 0.1).map((entry) => entry.value), ["positive"]);
  assert.deepEqual(index.queryOverlappingCircle(-7.9, 0, 0.1).map((entry) => entry.value), ["negative"]);
});

test("XZ spatial queries preserve source order through movement and exact-distance ties", () => {
  const index = new XZSpatialIndex<string>(4);
  index.rebuild([
    { id: "first", value: "first", x: -2, z: 0, order: 0 },
    { id: "second", value: "second", x: 2, z: 0, order: 1 },
  ]);
  index.upsert({ id: "first", value: "first", x: 2, z: 0 });

  assert.deepEqual(index.queryCircle(0, 0, 2).map((entry) => entry.value), ["first", "second"]);
  assert.deepEqual(index.queryCircle(0, 0, 1.999).map((entry) => entry.value), []);
});

test("new entries append after surviving ties when a removal compacts source order", () => {
  const index = new XZSpatialIndex<string>(4);
  index.rebuild([
    { id: "first", value: "first", x: -6, z: 0, order: 0 },
    { id: "removed", value: "removed", x: 0, z: 0, order: 1 },
    { id: "tail", value: "tail", x: 6, z: 0, order: 2 },
  ]);

  assert.equal(index.delete("removed"), true);
  // The appended item now occupies array index 2, but order 2 still belongs
  // to the surviving tail in a different spatial bucket.
  const appended = index.upsert({ id: "appended", value: "appended", x: -6, z: 0, order: 2 });

  assert.equal(appended.order, 3);
  assert.equal(index.get("tail")?.order, 2);
  assert.equal(new Set(index.queryCircle(0, 0, 6).map((entry) => entry.order)).size, 3);
  assert.deepEqual(index.queryCircle(0, 0, 6).map((entry) => entry.value), ["first", "tail", "appended"]);
});

test("mob collision broad phase keeps exact vertical overlap checks across buckets", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.position = new THREE.Vector3(100, 20, 100);
  engine.crouching = false;
  engine.mountedCreatureId = null;

  const creature = (id: number, x: number, y: number) => {
    const group = new THREE.Group();
    group.position.set(x, y, 0);
    group.visible = true;
    return {
      id,
      kind: "ridgeback",
      definition: MOB_DEFS.ridgeback,
      group,
      shadeState: null,
      careState: null,
      petState: null,
      dragonState: null,
      leviathanGrowth: null,
    };
  };

  const mover = creature(1, 7.9, 20 + MOB_DEFS.ridgeback.footOffset);
  const obstacle = creature(2, 8.35, mover.group.position.y);
  engine.mobs = [mover, obstacle] as never;
  assert.equal(engine.mobDynamicObstaclesAt(mover as never, 7.95, mover.group.position.y, 0).blocked, true);

  obstacle.group.position.y += 8;
  assert.equal(engine.mobDynamicObstaclesAt(mover as never, 7.95, mover.group.position.y, 0).blocked, false);
});

test("prototype-only engine harnesses lazily construct and rebuild the mob index", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.mobs = [];
  const first = engine.ensureMobSpatialIndex(false);
  assert.equal(first.size, 0);

  engine.mobs = [];
  const rebuilt = engine.ensureMobSpatialIndex(false);
  assert.notEqual(rebuilt, undefined);
  assert.equal(rebuilt.size, 0);
  assert.equal(engine.mobSpatialIndexSource, engine.mobs);
});
