import test from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { BlockId, Item, VoxelEngine, isDoubleForwardTap, restoreChestStorage, type InventorySlot } from "../app/game/engine";
import { MOB_DEFS } from "../app/game/mobs";
import { MultiplayerOperationCancelledError, validatePayload, type WorldSnapshot } from "../app/game/multiplayer";
import { captureCreature, encodeCapturedCreature, type CreatureMetadata } from "../app/game/creature-cage";

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

test("conservatories accept eligible caged residents and preserve their exact metadata", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const metadata: CreatureMetadata = {
    schema: 1, entityId: "emberjay-rare-4", kind: "emberjay", health: 2.25, maxHealth: 3, ageTicks: 55_321,
    baby: false, temperament: "Skittish", hostile: false, tamed: true, ownerId: "keeper-7", name: "Cinder",
    geneticSeed: 0xdeadbeef, command: "perch", custom: { plumage: ["gold", 3], nested: { bond: true } },
  };
  const captured = captureCreature("cage-exact-4", metadata, 123_456)!;
  const slot: InventorySlot = { item: Item.CreatureCage, count: 1, metadata: { capturedCreature: encodeCapturedCreature(captured) } };
  assert.equal(engine.isExhibitResidentSlot(slot), true);
  const resident = engine.exhibitSpecimen(slot, "exhibit:0,8,0", 0);
  assert.equal(resident?.source, "cage");
  if (resident?.source !== "cage") assert.fail("expected a caged resident");
  assert.deepEqual(resident.metadata, metadata);

  const large = { ...metadata, entityId: "large", kind: "ridgeback" as const };
  const largeSlot: InventorySlot = { item: Item.CreatureCage, count: 1, metadata: { capturedCreature: encodeCapturedCreature(captureCreature("large", large)!) } };
  assert.equal(engine.isExhibitResidentSlot(largeSlot), false);
});

test("net and butterfly production models are distinct in third and first person", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const net = engine.createAvatarHeldItem(Item.ButterflyNet)!;
  assert.ok(net.getObjectByName("butterfly-net-thread-v-3"));
  assert.equal(net.userData.workingAngle, Math.PI / 2);
  assert.equal(net.getObjectByName("held-butterfly-meadowwing"), undefined);
  const butterfly = engine.createAvatarHeldItem(Item.MeadowwingJar)!;
  assert.ok(butterfly.getObjectByName("held-butterfly-meadowwing"));
  const axe = engine.createAvatarHeldItem(Item.WoodAxe)!;
  assert.equal(axe.userData.workingAngle, Math.PI / 2);
  const chest = engine.createAvatarHeldItem(BlockId.Chest)!;
  assert.ok(chest.children.length >= 3, "held and dropped chests use a recognizable body, lid, and latch");

  engine.inventory = Array.from({ length: 36 }, (_, index) => index === 0 ? { item: Item.ButterflyNet, count: 1 } : null);
  engine.selected = 0;
  engine.heldRoot = new THREE.Group();
  engine.heldItemCode = -1;
  engine.heldUse = 0;
  engine.mineHeld = false;
  engine.attackCooldown = 0;
  engine.heldSwing = 0;
  engine.grounded = true;
  engine.footstepDistance = 0;
  engine.position = new THREE.Vector3();
  engine.updateHeldItem(0);
  assert.ok(engine.heldRoot.getObjectByName("butterfly-net-thread-h-3"), "first person reuses the textured production net");

  engine.inventory[0] = { item: Item.MeadowwingJar, count: 1 };
  engine.updateHeldItem(0);
  assert.ok(engine.heldRoot.getObjectByName("held-butterfly-meadowwing"), "first person shows the actual butterfly model");
  engine.disposeObject(net);
  engine.disposeObject(butterfly);
  engine.disposeObject(axe);
  engine.disposeObject(chest);
  engine.disposeObject(engine.heldRoot);
});

test("engine collision gates medium ground creatures while babies and flying creatures remain non-solid", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.position = new THREE.Vector3(0, 20.5, 0);
  engine.crouching = false;
  engine.mountedCreatureId = null;
  const creature = (id: number, kind: "peelop" | "ridgeback" | "emberjay", x: number, baby = false) => {
    const group = new THREE.Group();
    group.position.set(x, 20 + MOB_DEFS[kind].footOffset, 0);
    group.visible = true;
    return {
      id,
      definition: MOB_DEFS[kind],
      group,
      shadeState: null,
      careState: null,
      petState: kind === "peelop" ? { baby } : null,
    };
  };

  engine.mobs = [creature(1, "peelop", 0.55, false)] as never;
  assert.equal(engine.playerIntersectsSolidMob(new THREE.Vector3(0, 20.5, 0)), true);
  engine.mobs = [creature(2, "peelop", 0.2, true)] as never;
  assert.equal(engine.playerIntersectsSolidMob(new THREE.Vector3(0, 20.5, 0)), false);
  engine.mobs = [creature(3, "emberjay", 0.1)] as never;
  assert.equal(engine.playerIntersectsSolidMob(new THREE.Vector3(0, 20.5, 0)), false);

  const mover = creature(4, "ridgeback", 0);
  const obstacle = creature(5, "ridgeback", 0.7);
  engine.mobs = [mover, obstacle] as never;
  assert.equal(engine.mobDynamicObstaclesAt(mover as never, 0.05, mover.group.position.y, 0).blocked, true);
  assert.equal(engine.mobDynamicObstaclesAt(mover as never, -0.05, mover.group.position.y, 0, true).blocked, false, "an overlapped mob can move out instead of freezing");
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
    mobScope: { centerPlayerId: "player-one", radius: 64, epoch: 1 },
    drops: [],
    dropScope: { centerPlayerId: "player-one", radius: 64, epoch: 1 },
    boats: [{ id: "wayfarer-one", x: 0, y: 19, z: 0, yaw: 0, velocity: 2, passengers: ["player-one", "player-two"] }],
    time: { tick: 8, worldTime: 0.4, day: 2, weather: "clear" },
  };
  assert.equal(validatePayload("snapshot", snapshot), true);
});

test("normal rendezvous cancellation closes quietly instead of becoming a fatal multiplayer error", async () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.hostRendezvous = {
    code: "QUIET-CLOSE",
    close: async () => { throw new MultiplayerOperationCancelledError("session closed during normal cleanup"); },
  } as never;
  await (engine as unknown as { closeHostRendezvous(): Promise<void> }).closeHostRendezvous();
  assert.equal(engine.hostRendezvous, null);
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
  engine.drops = [];
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
