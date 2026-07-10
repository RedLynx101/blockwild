import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { BlockId, Item, VoxelEngine, isDoubleForwardTap, restoreChestStorage, type InventorySlot } from "../app/game/engine";
import { validatePayload, type WorldSnapshot } from "../app/game/multiplayer";

test("special storage restores conservatory capacity and Wayfarer cargo size", () => {
  const restored = restoreChestStorage({
    "exhibit:1,2,3": Array.from({ length: 7 }, (_, index) => index === 0 ? { item: Item.MeadowwingJar, count: 1 } : null),
    "boat:wayfarer-one": [{ item: Item.Berry, count: 3 }],
  });
  assert.equal(restored.get("exhibit:1,2,3")?.length, 7);
  assert.equal(restored.get("boat:wayfarer-one")?.length, 18);
});

test("conservatory container interaction assigns one butterfly per habitat block", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const key = "exhibit:0,20,0";
  engine.activeChestKey = key;
  engine.chests = new Map([[key, [null, null]]]);
  engine.cursor = { item: Item.MeadowwingJar, count: 2 };
  engine.audio = { play: () => undefined } as never;
  engine.events = { onToast: () => undefined } as never;
  engine.saveSoon = () => undefined;
  engine.emitHud = () => undefined;
  engine.syncExhibitVisuals = () => undefined;

  engine.machineClick("chest", 0, "left");
  assert.equal(engine.chests.get(key)?.[0]?.count, 1);
  assert.equal(engine.cursor?.count, 1);
  engine.machineClick("chest", 1, "left");
  assert.equal(engine.chests.get(key)?.[1]?.count, 1);
  assert.equal(engine.cursor, null);
});

test("metadata-bearing creature cages never stack with a different captured creature", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const left: InventorySlot = { item: Item.CreatureCage, count: 1, metadata: { kind: "peelop", name: "Mallow" } };
  const same: InventorySlot = { item: Item.CreatureCage, count: 1, metadata: { kind: "peelop", name: "Mallow" } };
  const different: InventorySlot = { item: Item.CreatureCage, count: 1, metadata: { kind: "peelop", name: "Pip" } };
  assert.equal(engine.sameStack(left, same), true);
  assert.equal(engine.sameStack(left, different), false);
});

test("multiplayer snapshots accept a two-seat Wayfarer and mounted player pose", () => {
  const snapshot: WorldSnapshot = {
    tick: 8,
    seed: "MENAGERIE",
    generatorVersion: 3,
    players: [{
      playerId: "player-one", tick: 8, x: 0, y: 20, z: 0, yaw: 0, pitch: 0,
      vx: 0, vy: 0, vz: 0, grounded: true, boatId: "wayfarer-one", boatSeat: 0,
    }],
    blockEdits: [],
    mobs: [],
    drops: [],
    boats: [{ id: "wayfarer-one", x: 0, y: 19, z: 0, yaw: 0, velocity: 2, passengers: ["player-one", "player-two"] }],
    time: { tick: 8, worldTime: 0.4, day: 2, weather: "clear" },
  };
  assert.equal(validatePayload("snapshot", snapshot), true);
});

test("double-tap sprint timing and third-person targeting use the player sightline", () => {
  assert.equal(isDoubleForwardTap(1_000, 1_180), true);
  assert.equal(isDoubleForwardTap(1_000, 1_400), false);

  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.running = true;
  engine.titleMode = false;
  engine.cameraMode = "third-rear";
  engine.position = new THREE.Vector3(10, 20, 30);
  engine.cameraEyeHeight = 1.62;
  engine.cameraCollisionOrigin = new THREE.Vector3();
  engine.yaw = 0;
  engine.pitch = -0.45;
  engine.camera = {} as never;
  engine.target = null;
  engine.targetMob = null;
  engine.targetBoat = null;
  engine.targetKey = "";
  engine.miningProgress = 0;
  engine.selection = { visible: false, position: new THREE.Vector3(), material: new THREE.LineBasicMaterial() } as never;
  let castOrigin = new THREE.Vector3();
  engine.castVoxel = (origin) => {
    castOrigin = origin.clone();
    return { x: 10, y: 19, z: 25, placeX: 10, placeY: 20, placeZ: 25, type: BlockId.Grass, distance: 5 };
  };
  engine.castMob = () => null;
  engine.castBoat = () => null;
  engine.updateTarget();
  assert.deepEqual(castOrigin.toArray(), [10, 21.62, 30]);
  assert.equal((engine.target as { type: BlockId } | null)?.type, BlockId.Grass);
});
