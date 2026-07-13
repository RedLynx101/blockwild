import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  SAILBOAT_CAPACITY,
  boardSailboat,
  canBoardSailboat,
  createSailboatVisual,
  disposeSailboatVisual,
  integrateSailboat,
  normalizeSailboatSave,
  sailboatInventoryIsEmpty,
  sailboatRayPickDistance,
  sailboatSeatOffset,
} from "../app/game/boats.ts";

test("sailboats preserve two passengers and legal chest metadata", () => {
  const normalized = normalizeSailboatSave({
    id: "windward",
    x: 4,
    y: 12,
    z: -8,
    yaw: 20,
    velocity: 999,
    passengers: ["a", "a", "b", "c"],
    inventory: [{ item: 100, count: 2 }],
  });
  assert.equal(normalized.passengers.length, SAILBOAT_CAPACITY);
  assert.deepEqual(normalized.passengers, ["a", "b"]);
  assert.deepEqual(normalized.inventory[0], { item: 100, count: 2 });
  assert.equal(normalized.inventory.length, 18);
  assert.equal(canBoardSailboat(normalized.passengers, "c"), false);
  assert.equal(normalized.ownerId, null);
  assert.deepEqual(boardSailboat(["a"], "b"), ["a", "b"]);
});

test("empty boats can be packed and forgiving hull targeting makes boarding reliable", () => {
  assert.equal(sailboatInventoryIsEmpty([null, null]), true);
  assert.equal(sailboatInventoryIsEmpty([{ item: 1, count: 1 }, null]), false);
  const origin = new THREE.Vector3(0, 1.4, 4);
  const direction = new THREE.Vector3(0.18, -0.05, -1).normalize();
  assert.notEqual(sailboatRayPickDistance(origin, direction, { x: 0, y: 0.6, z: 0 }, 6), null);
  assert.equal(sailboatRayPickDistance(origin, new THREE.Vector3(1, 0, 0), { x: 0, y: 0.6, z: 0 }, 6), null);
});

test("sailboat movement remains on supported water and exposes two distinct seats", () => {
  const initial = { x: 0, y: 4, z: 0, yaw: 0, velocity: 0 };
  const moved = integrateSailboat(initial, { forward: 1, turn: 0.4 }, 0.1, () => true);
  assert.ok(moved.z < 0);
  assert.ok(moved.velocity > 0);
  assert.ok(moved.yaw < 0, "positive horizontal input turns the Wayfarer toward screen-right after control reversal");
  const port = integrateSailboat(initial, { forward: 1, turn: -0.4 }, 0.1, () => true);
  assert.ok(port.yaw > 0);
  const blocked = integrateSailboat(moved, { forward: 1, turn: 0 }, 0.1, (x, z) => Math.abs(x) < 0.5 && Math.abs(z) < 0.5);
  assert.ok(blocked.velocity <= 0, "the hull must not motor onto dry land");
  assert.notDeepEqual(sailboatSeatOffset(0, moved.yaw), sailboatSeatOffset(1, moved.yaw));
});

test("sailboat visual is a substantial hull with a mast, sail, chest and two seats", () => {
  const visual = createSailboatVisual("gallery");
  const names = new Set<string>();
  visual.traverse((object) => names.add(object.name));
  for (const name of ["boat-hull", "boat-mast", "boat-sail", "boat-storage-chest", "boat-seat-one", "boat-seat-two"]) {
    assert.equal(names.has(name), true, `missing ${name}`);
  }
  const bounds = new THREE.Box3().setFromObject(visual).getSize(new THREE.Vector3());
  assert.ok(bounds.x > 1.5 && bounds.z > 3 && bounds.y > 3, "the sailboat should read as a real two-seat vessel");
  disposeSailboatVisual(visual);
});
