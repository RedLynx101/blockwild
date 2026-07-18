import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { CHARACTER_RACES } from "../app/game/character-profiles.ts";
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
  const torso = player.group.getObjectByName("torso-block") as THREE.Mesh;
  assert.ok(torso.scale.x < 0.7, `torso width ${torso.scale.x} must not impersonate a second pair of arms`);
  assert.equal(player.group.getObjectByName("left-sleeve")?.parent, player.parts.leftArm);
  assert.equal(player.group.getObjectByName("right-sleeve")?.parent, player.parts.rightArm);

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

test("race features, custom clothing and seated/swimming poses share one articulated rig", () => {
  const player = new BlockPlayerModel({ race: "wood-elf", variant: "female" });
  player.setAppearance({
    sex: "female",
    race: "wood-elf",
    colors: { skin: "#dca27f", hair: "#d7c39a", shirt: "#527d60", trousers: "#3e4934", accent: "#8cc9c1" },
  });
  assert.equal(player.race, "wood-elf");
  assert.equal(player.group.getObjectByName("wood-elf-features")?.visible, true);
  assert.equal(player.group.getObjectByName("goblin-features")?.visible, false);
  assert.equal(player.materials.accent.color.getHexString(), "8cc9c1");
  assert.equal(player.materials.hair.color.getHexString(), "d7c39a");

  player.setPose({ seated: 1, crouch: 1 });
  assert.ok(player.parts.leftLeg.rotation.x > 1, "seated legs project forward instead of hanging through the chair");
  assert.ok(player.parts.rightLeg.rotation.x > 1);

  player.setPose({ seated: 0, crouch: 0, swimming: 1, locomotion: "run", phase: 0.25 });
  assert.ok(player.parts.torso.rotation.x < -1.2, "sprint swimming turns the body horizontal");
  assert.notEqual(player.parts.leftArm.rotation.x, player.parts.rightArm.rotation.x, "swimming arms alternate their stroke");
  player.dispose();
});

test("every playable race owns one visible and distinct modeled nose", () => {
  const player = new BlockPlayerModel();
  const silhouettes = new Set<string>();

  for (const race of CHARACTER_RACES) {
    player.setRace(race);
    const root = player.group.getObjectByName(`${race}-features`);
    assert.ok(root, `${race} needs a dedicated facial feature group`);
    for (const candidate of CHARACTER_RACES) {
      assert.equal(player.group.getObjectByName(`${candidate}-features`)?.visible, candidate === race, `${race} must not display ${candidate} features`);
    }
    const noseParts: THREE.Object3D[] = [];
    root.traverse((object) => {
      if (object.name.includes("nose") || object.name.includes("nostril")) noseParts.push(object);
    });
    assert.ok(noseParts.length >= 2, `${race} needs a multi-part nose silhouette`);
    silhouettes.add(noseParts.map((part) => [
      part.name.replace(`${race}-features-`, ""),
      part.position.toArray().map((value) => value.toFixed(3)),
      part.scale.toArray().map((value) => value.toFixed(3)),
      part.rotation.x.toFixed(3),
    ]).join("|"));
  }

  assert.equal(silhouettes.size, CHARACTER_RACES.length, "race noses must differ in shape rather than color alone");
  assert.ok(player.group.getObjectByName("dwarf-features-left-nostril"));
  assert.ok(player.group.getObjectByName("dwarf-features-right-nostril"));
  player.dispose();
});

test("offhand shields strap to the left forearm and raise the left arm independently", () => {
  const player = new BlockPlayerModel();
  const shield = new THREE.Group();
  player.setOffhandItem(shield, true).setOffhandRaised(false).setPose({ locomotion: "idle" });
  assert.equal(player.leftForearmSocket.children[0], shield);
  assert.equal(player.leftHandSocket.children.length, 0, "a strapped shield must not hover from the hand socket");
  const resting = player.parts.leftArm.rotation.x;
  player.setOffhandRaised(true).setPose({ locomotion: "idle", phase: 0.1 });
  assert.ok(player.parts.leftArm.rotation.x > resting + 0.8, "raised shield should move the left arm in front of the torso");
  assert.equal(player.rightHandSocket.children.length, 0, "offhand presentation never duplicates the main hand");
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
