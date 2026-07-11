import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  BlockPlayerModel,
  computeThirdPersonCamera,
  interpolatePlayerPose,
  interpolatePlayerSnapshot,
  poseForAnimation,
  type PlayerSnapshot,
  type ThirdPersonCameraCollisionQuery,
} from "../app/game/player-model.ts";

const near = (actual: number, expected: number, epsilon = 1e-8) => {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} to be within ${epsilon} of ${expected}`);
};

test("the block player exposes articulated parts and rests on local Y=0", () => {
  const player = new BlockPlayerModel({
    playerId: "remote-7",
    playerName: "Aria",
    mode: "remote",
    colors: { skin: "#a56f50", shirt: "#24a07d", trousers: "#3c315d" },
  });

  assert.deepEqual(Object.keys(player.parts).sort(), ["head", "leftArm", "leftLeg", "rightArm", "rightLeg", "torso"]);
  assert.equal(player.parts.head.parent, player.parts.torso);
  assert.equal(player.parts.leftLeg.parent, player.rig);
  assert.equal(player.rightHandSocket.parent, player.parts.rightArm);
  assert.ok(player.rightHandSocket.position.z <= -0.2, "held items sit in front of the arm in local and remote rigs");
  assert.equal(player.playerName, "Aria");
  assert.equal(player.nameAnchor.userData.playerName, "Aria");
  assert.equal(player.group.userData.playerMode, "remote");

  const bounds = player.getLocalBounds();
  near(bounds.min.y, 0);
  assert.ok(bounds.max.y > 1.8);

  const heldItem = new THREE.Object3D();
  player.setHeldItem(heldItem);
  assert.equal(heldItem.parent, player.rightHandSocket);
  player.setHeldItem(null);
  assert.equal(heldItem.parent, null);

  player.dispose();
  assert.equal(player.isDisposed, true);
});

test("pose and snapshot interpolation cross cyclic and angular seams smoothly", () => {
  const fromPose = poseForAnimation("walk", 0.95, { headYaw: THREE.MathUtils.degToRad(170), headPitch: -0.2 });
  const toPose = poseForAnimation("run", 0.05, { headYaw: THREE.MathUtils.degToRad(-170), headPitch: 0.4 });
  toPose.crouch = 1;
  const pose = interpolatePlayerPose(fromPose, toPose, 0.5);

  near(Math.min(pose.phase, 1 - pose.phase), 0);
  near(Math.abs(pose.headYaw), Math.PI);
  near(pose.headPitch, 0.1);
  near(pose.crouch, 0.5);
  assert.equal(pose.locomotion, "run");

  const from: PlayerSnapshot = {
    playerId: "p1",
    sequence: 10,
    serverTimeMs: 1_000,
    position: [0, 2, -4],
    yaw: THREE.MathUtils.degToRad(175),
    pose: fromPose,
    heldItemId: null,
  };
  const to: PlayerSnapshot = {
    playerId: "p1",
    sequence: 11,
    serverTimeMs: 1_100,
    position: [10, 4, 6],
    yaw: THREE.MathUtils.degToRad(-175),
    pose: toPose,
    heldItemId: "iron-pickaxe",
  };
  const snapshot = interpolatePlayerSnapshot(from, to, 0.5);
  assert.deepEqual(snapshot.position, [5, 3, 1]);
  near(Math.abs(snapshot.yaw), Math.PI);
  assert.equal(snapshot.heldItemId, "iron-pickaxe");
  assert.deepEqual(from.position, [0, 2, -4], "interpolation must not mutate wire snapshots");
});

test("crouching lowers the body while every animated pose remains grounded", () => {
  const player = new BlockPlayerModel();
  const standing = player.getLocalBounds().getSize(new THREE.Vector3()).y;

  player.setAnimation("crouch", 0.25);
  const crouchedBounds = player.getLocalBounds();
  const crouched = crouchedBounds.getSize(new THREE.Vector3()).y;
  near(crouchedBounds.min.y, 0);
  assert.ok(crouched < standing - 0.15, `expected crouch height ${crouched} below standing height ${standing}`);

  for (const animation of ["walk", "run", "jump", "mine", "use"] as const) {
    player.setAnimation(animation, 0.23);
    const bounds = player.getLocalBounds();
    near(bounds.min.y, 0, 1e-7);
  }

  player.setAnimation("walk", 0.25);
  assert.ok(player.parts.leftLeg.rotation.x * player.parts.rightLeg.rotation.x < 0, "walking legs must counter-swing");
  const walkingArm = player.parts.rightArm.rotation.x;
  player.setAnimation("mine", 0.5);
  assert.notEqual(player.parts.rightArm.rotation.x, walkingArm);
  player.dispose();
});

test("third-person rear/front placement shortens against camera collisions", () => {
  let query: ThirdPersonCameraCollisionQuery | undefined;
  const rear = computeThirdPersonCamera(
    new THREE.Vector3(2, 3, 4),
    0,
    { view: "rear", distance: 4, pitch: 0, targetHeight: 1.5, collisionPadding: 0.2 },
    (candidate) => {
      query = candidate;
      return 1.5;
    },
  );

  assert.ok(query);
  near(query.maxDistance, 4);
  assert.equal(query.view, "rear");
  assert.equal(rear.collided, true);
  near(rear.distance, 1.3);
  near(rear.position.x, 2);
  near(rear.position.y, 4.5);
  near(rear.position.z, 5.3);

  const front = computeThirdPersonCamera(
    new THREE.Vector3(2, 3, 4),
    0,
    { view: "front", distance: 4, pitch: 0, targetHeight: 1.5 },
  );
  assert.equal(front.collided, false);
  assert.ok(front.position.z < front.target.z, "front view must sit ahead of the player's -Z facing direction");
});
