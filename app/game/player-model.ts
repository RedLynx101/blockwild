import * as THREE from "three";
import type { FactionRace } from "./factions";
import { characterRaceTraits, type CharacterAppearance } from "./character-profiles";

export type PlayerModelMode = "local" | "remote";
export type PlayerVariant = "male" | "female";
export type PlayerAnimation = "idle" | "walk" | "run" | "crouch" | "jump" | "mine" | "use";
export type PlayerLocomotion = "idle" | "walk" | "run";
export type PlayerAction = "none" | "mine" | "use";
export type Vector3Tuple = [number, number, number];

/**
 * JSON-safe animation state. Phases are normalized cycles in [0, 1), while
 * crouch and jump are blend weights in [0, 1]. This lets locomotion and a hand
 * action be sent together instead of forcing mining to stop a walk animation.
 */
export type PlayerPoseSnapshot = {
  locomotion: PlayerLocomotion;
  action: PlayerAction;
  phase: number;
  actionPhase: number;
  crouch: number;
  jump: number;
  headYaw: number;
  headPitch: number;
  /** Horizontal full-body swim blend, transported independently from locomotion. */
  swimming?: number;
  /** Chair/stool leg pose blend; absent legacy snapshots mean standing. */
  seated?: number;
};

/** A transport-friendly player state containing only primitives and tuples. */
export type PlayerSnapshot = {
  playerId: string;
  sequence: number;
  serverTimeMs: number;
  position: Vector3Tuple;
  yaw: number;
  pose: PlayerPoseSnapshot;
  heldItemId: string | null;
};

export type PlayerColors = {
  skin: THREE.ColorRepresentation;
  shirt: THREE.ColorRepresentation;
  trousers: THREE.ColorRepresentation;
  hair: THREE.ColorRepresentation;
  accent: THREE.ColorRepresentation;
};

export type PlayerEquipmentAppearance = Partial<Record<"head" | "chest" | "legs" | "feet", THREE.ColorRepresentation | null>>;

export type PlayerModelOptions = {
  playerId?: string;
  playerName?: string;
  mode?: PlayerModelMode;
  variant?: PlayerVariant;
  race?: FactionRace;
  colors?: Partial<PlayerColors>;
  equipment?: PlayerEquipmentAppearance;
  castShadow?: boolean;
  receiveShadow?: boolean;
};

export type PlayerModelParts = {
  head: THREE.Group;
  torso: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
};

export type PlayerModelMaterials = {
  skin: THREE.MeshStandardMaterial;
  shirt: THREE.MeshStandardMaterial;
  trousers: THREE.MeshStandardMaterial;
  details: THREE.MeshStandardMaterial;
  hair: THREE.MeshStandardMaterial;
  armorHead: THREE.MeshStandardMaterial;
  armorChest: THREE.MeshStandardMaterial;
  armorLegs: THREE.MeshStandardMaterial;
  armorFeet: THREE.MeshStandardMaterial;
  accent: THREE.MeshStandardMaterial;
};

export const DEFAULT_PLAYER_COLORS: Readonly<PlayerColors> = Object.freeze({
  skin: "#c98f6b",
  shirt: "#3f7fba",
  trousers: "#293554",
  hair: "#5a3826",
  accent: "#f0c85b",
});

export const PLAYER_VARIANT_HEIGHT_SCALE: Readonly<Record<PlayerVariant, number>> = Object.freeze({
  male: 1,
  female: 0.8,
});
export const FEMALE_HAIR_COLOR = 0x111318;

export function playerVariantHeightScale(variant: PlayerVariant) {
  return PLAYER_VARIANT_HEIGHT_SCALE[variant === "female" ? "female" : "male"];
}

export function playerModelHeightScale(variant: PlayerVariant, race: FactionRace = "wayfarer") {
  return playerVariantHeightScale(variant) * characterRaceTraits(race).heightScale;
}

export function playerEyeHeightForVariant(variant: PlayerVariant, crouching = false, race: FactionRace = "wayfarer") {
  return (crouching ? 1.3 : 1.62) * playerModelHeightScale(variant, race);
}

export const DEFAULT_PLAYER_POSE: Readonly<PlayerPoseSnapshot> = Object.freeze({
  locomotion: "idle",
  action: "none",
  phase: 0,
  actionPhase: 0,
  crouch: 0,
  jump: 0,
  headYaw: 0,
  headPitch: 0,
  swimming: 0,
  seated: 0,
});

const UP = new THREE.Vector3(0, 1, 0);
const TWO_PI = Math.PI * 2;
const MAX_HEAD_PITCH = Math.PI * 0.42;

const HEAD_SIZE = 0.5;
const TORSO_WIDTH = 0.56;
const TORSO_HEIGHT = 0.72;
const TORSO_DEPTH = 0.3;
const ARM_WIDTH = 0.22;
const ARM_LENGTH = 0.7;
const LEG_WIDTH = 0.24;
const LEG_LENGTH = 0.72;
const LEG_DEPTH = 0.24;
const SHOULDER_Y = TORSO_HEIGHT - 0.06;

const LOCOMOTIONS: readonly PlayerLocomotion[] = ["idle", "walk", "run"];
const ACTIONS: readonly PlayerAction[] = ["none", "mine", "use"];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function wrapUnit(value: number): number {
  return ((value % 1) + 1) % 1;
}

function wrapAngle(value: number): number {
  return Math.atan2(Math.sin(value), Math.cos(value));
}

function isLocomotion(value: unknown): value is PlayerLocomotion {
  return LOCOMOTIONS.includes(value as PlayerLocomotion);
}

function isAction(value: unknown): value is PlayerAction {
  return ACTIONS.includes(value as PlayerAction);
}

export function normalizePlayerPose(
  pose: Partial<PlayerPoseSnapshot>,
  base: Readonly<PlayerPoseSnapshot> = DEFAULT_PLAYER_POSE,
): PlayerPoseSnapshot {
  return {
    locomotion: isLocomotion(pose.locomotion) ? pose.locomotion : base.locomotion,
    action: isAction(pose.action) ? pose.action : base.action,
    phase: wrapUnit(finiteOr(pose.phase, base.phase)),
    actionPhase: wrapUnit(finiteOr(pose.actionPhase, base.actionPhase)),
    crouch: clamp01(finiteOr(pose.crouch, base.crouch)),
    jump: clamp01(finiteOr(pose.jump, base.jump)),
    headYaw: wrapAngle(finiteOr(pose.headYaw, base.headYaw)),
    headPitch: clamp(finiteOr(pose.headPitch, base.headPitch), -MAX_HEAD_PITCH, MAX_HEAD_PITCH),
    swimming: clamp01(finiteOr(pose.swimming, base.swimming ?? 0)),
    seated: clamp01(finiteOr(pose.seated, base.seated ?? 0)),
  };
}

export function poseForAnimation(
  animation: PlayerAnimation,
  phase = 0,
  look: Pick<Partial<PlayerPoseSnapshot>, "headYaw" | "headPitch"> = {},
): PlayerPoseSnapshot {
  const pose = normalizePlayerPose({
    phase,
    actionPhase: phase,
    headYaw: look.headYaw,
    headPitch: look.headPitch,
  });

  switch (animation) {
    case "walk":
    case "run":
      pose.locomotion = animation;
      break;
    case "crouch":
      pose.crouch = 1;
      break;
    case "jump":
      pose.jump = 1;
      break;
    case "mine":
    case "use":
      pose.action = animation;
      break;
    case "idle":
      break;
  }

  return pose;
}

/** Shortest-path angle interpolation, safe across the -PI/PI seam. */
export function interpolateAngle(from: number, to: number, alpha: number): number {
  const t = clamp01(alpha);
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from));
  return wrapAngle(from + delta * t);
}

/** Shortest-path interpolation for normalized repeating animation phases. */
export function interpolateCycle(from: number, to: number, alpha: number): number {
  const t = clamp01(alpha);
  const start = wrapUnit(from);
  let delta = wrapUnit(to) - start;
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  return wrapUnit(start + delta * t);
}

export function interpolatePlayerPose(
  from: Readonly<PlayerPoseSnapshot>,
  to: Readonly<PlayerPoseSnapshot>,
  alpha: number,
): PlayerPoseSnapshot {
  const t = clamp01(alpha);
  const useTargetState = t > 0;
  return {
    locomotion: useTargetState ? to.locomotion : from.locomotion,
    action: useTargetState ? to.action : from.action,
    phase: interpolateCycle(from.phase, to.phase, t),
    actionPhase: interpolateCycle(from.actionPhase, to.actionPhase, t),
    crouch: THREE.MathUtils.lerp(from.crouch, to.crouch, t),
    jump: THREE.MathUtils.lerp(from.jump, to.jump, t),
    headYaw: interpolateAngle(from.headYaw, to.headYaw, t),
    headPitch: THREE.MathUtils.lerp(from.headPitch, to.headPitch, t),
    swimming: THREE.MathUtils.lerp(from.swimming ?? 0, to.swimming ?? 0, t),
    seated: THREE.MathUtils.lerp(from.seated ?? 0, to.seated ?? 0, t),
  };
}

export function interpolatePlayerSnapshot(
  from: Readonly<PlayerSnapshot>,
  to: Readonly<PlayerSnapshot>,
  alpha: number,
): PlayerSnapshot {
  if (from.playerId !== to.playerId) throw new Error("Cannot interpolate snapshots from different players");
  const t = clamp01(alpha);
  const useTargetState = t > 0;
  return {
    playerId: from.playerId,
    sequence: useTargetState ? to.sequence : from.sequence,
    serverTimeMs: THREE.MathUtils.lerp(from.serverTimeMs, to.serverTimeMs, t),
    position: [
      THREE.MathUtils.lerp(from.position[0], to.position[0], t),
      THREE.MathUtils.lerp(from.position[1], to.position[1], t),
      THREE.MathUtils.lerp(from.position[2], to.position[2], t),
    ],
    yaw: interpolateAngle(from.yaw, to.yaw, t),
    pose: interpolatePlayerPose(from.pose, to.pose, t),
    heldItemId: useTargetState ? to.heldItemId : from.heldItemId,
  };
}

/** Frame-rate-independent smoothing alpha for positions, poses, or cameras. */
export function smoothingAlpha(sharpness: number, deltaSeconds: number): number {
  if (!Number.isFinite(sharpness)) return sharpness > 0 ? 1 : 0;
  if (sharpness <= 0 || deltaSeconds <= 0) return 0;
  return 1 - Math.exp(-sharpness * deltaSeconds);
}

export function dampPlayerSnapshot(
  current: Readonly<PlayerSnapshot>,
  target: Readonly<PlayerSnapshot>,
  sharpness: number,
  deltaSeconds: number,
): PlayerSnapshot {
  return interpolatePlayerSnapshot(current, target, smoothingAlpha(sharpness, deltaSeconds));
}

/**
 * A lightweight block player rig. `group.position.y` is always the character's
 * foot-plane height; the animated body keeps its lowest local point at Y=0.
 */
export class BlockPlayerModel {
  readonly group = new THREE.Group();
  readonly rig = new THREE.Group();
  readonly parts: PlayerModelParts;
  readonly materials: PlayerModelMaterials;
  readonly rightHandSocket = new THREE.Object3D();
  readonly leftHandSocket = new THREE.Object3D();
  readonly nameAnchor = new THREE.Object3D();
  readonly mode: PlayerModelMode;
  readonly playerId?: string;

  private readonly blockGeometry = new THREE.BoxGeometry(1, 1, 1);
  private readonly ownedMeshes: THREE.Mesh[] = [];
  private readonly boundsBox = new THREE.Box3();
  private readonly boundsMatrix = new THREE.Matrix4();
  private readonly inverseRootMatrix = new THREE.Matrix4();
  private pose: PlayerPoseSnapshot = { ...DEFAULT_PLAYER_POSE };
  private heldItem: THREE.Object3D | null = null;
  private offhandItem: THREE.Object3D | null = null;
  private offhandShield = false;
  private offhandRaised = false;
  private readonly torsoBlock: THREE.Mesh;
  private readonly maleHair = new THREE.Group();
  private readonly femaleHair = new THREE.Group();
  private readonly woodElfFeatures = new THREE.Group();
  private readonly goblinFeatures = new THREE.Group();
  private readonly baseHairColor = new THREE.Color(DEFAULT_PLAYER_COLORS.hair);
  private readonly equipmentMeshes: Record<"head" | "chest" | "legs" | "feet", THREE.Mesh[]> = { head: [], chest: [], legs: [], feet: [] };
  private _variant: PlayerVariant;
  private _race: FactionRace;
  private disposed = false;
  private _playerName = "Player";

  constructor(options: PlayerModelOptions = {}) {
    this.mode = options.mode ?? "remote";
    this.playerId = options.playerId;
    const colors = { ...DEFAULT_PLAYER_COLORS, ...options.colors };
    this.baseHairColor.set(colors.hair);
    this._variant = options.variant ?? "male";
    this._race = options.race ?? "wayfarer";
    const materialOptions = { roughness: 0.92, metalness: 0, flatShading: true };
    this.materials = {
      skin: new THREE.MeshStandardMaterial({ ...materialOptions, color: colors.skin }),
      shirt: new THREE.MeshStandardMaterial({ ...materialOptions, color: colors.shirt }),
      trousers: new THREE.MeshStandardMaterial({ ...materialOptions, color: colors.trousers }),
      details: new THREE.MeshStandardMaterial({ ...materialOptions, color: 0x17191d }),
      hair: new THREE.MeshStandardMaterial({ ...materialOptions, color: colors.hair }),
      armorHead: new THREE.MeshStandardMaterial({ ...materialOptions, color: 0xffffff }),
      armorChest: new THREE.MeshStandardMaterial({ ...materialOptions, color: 0xffffff }),
      armorLegs: new THREE.MeshStandardMaterial({ ...materialOptions, color: 0xffffff }),
      armorFeet: new THREE.MeshStandardMaterial({ ...materialOptions, color: 0xffffff }),
      accent: new THREE.MeshStandardMaterial({ ...materialOptions, color: colors.accent }),
    };

    this.group.name = "block-player";
    this.group.userData.playerModel = true;
    this.group.userData.playerMode = this.mode;
    if (this.playerId !== undefined) this.group.userData.playerId = this.playerId;
    this.rig.name = "player-rig";
    this.group.add(this.rig);

    const head = this.createPart("head");
    const torso = this.createPart("torso");
    const leftArm = this.createPart("left-arm");
    const rightArm = this.createPart("right-arm");
    const leftLeg = this.createPart("left-leg");
    const rightLeg = this.createPart("right-leg");
    this.parts = { head, torso, leftArm, rightArm, leftLeg, rightLeg };

    this.rig.add(torso, leftLeg, rightLeg, this.nameAnchor);
    torso.add(head, leftArm, rightArm);

    this.torsoBlock = this.createBlock("torso-block", [TORSO_WIDTH, TORSO_HEIGHT, TORSO_DEPTH], [0, TORSO_HEIGHT / 2, 0], this.materials.shirt, options);
    torso.add(this.torsoBlock);
    torso.add(this.createBlock("clothing-accent", [TORSO_WIDTH + 0.014, 0.085, TORSO_DEPTH + 0.016], [0, TORSO_HEIGHT * 0.44, 0], this.materials.accent, options));

    head.position.set(0, TORSO_HEIGHT, 0);
    head.rotation.order = "YXZ";
    head.add(this.createBlock("head-block", [HEAD_SIZE, HEAD_SIZE, HEAD_SIZE], [0, HEAD_SIZE / 2, 0], this.materials.skin, options));
    head.add(this.createBlock("left-eye", [0.075, 0.07, 0.026], [-0.12, 0.3, -HEAD_SIZE / 2 - 0.013], this.materials.details, options));
    head.add(this.createBlock("right-eye", [0.075, 0.07, 0.026], [0.12, 0.3, -HEAD_SIZE / 2 - 0.013], this.materials.details, options));
    this.buildHair(head, options);
    this.buildRaceFeatures(head, options);

    const shoulderX = TORSO_WIDTH / 2 + ARM_WIDTH / 2;
    leftArm.position.set(-shoulderX, SHOULDER_Y, 0);
    rightArm.position.set(shoulderX, SHOULDER_Y, 0);
    this.buildArm(leftArm, "left", options);
    this.buildArm(rightArm, "right", options);

    const legX = LEG_WIDTH * 0.56;
    leftLeg.position.set(-legX, LEG_LENGTH, 0);
    rightLeg.position.set(legX, LEG_LENGTH, 0);
    leftLeg.add(this.createBlock("left-leg-block", [LEG_WIDTH, LEG_LENGTH, LEG_DEPTH], [0, -LEG_LENGTH / 2, 0], this.materials.trousers, options));
    rightLeg.add(this.createBlock("right-leg-block", [LEG_WIDTH, LEG_LENGTH, LEG_DEPTH], [0, -LEG_LENGTH / 2, 0], this.materials.trousers, options));
    this.buildEquipment(options);

    this.rightHandSocket.name = "right-hand-socket";
    this.rightHandSocket.userData.socket = "right-hand";
    // Player-local forward is -Z. Keep held geometry beyond the hand so tools,
    // nets, jars, and blocks remain readable instead of clipping into the arm.
    this.rightHandSocket.position.set(0, -ARM_LENGTH + 0.08, -0.22);
    rightArm.add(this.rightHandSocket);
    this.leftHandSocket.name = "left-hand-socket";
    this.leftHandSocket.userData.socket = "left-hand";
    this.leftHandSocket.position.set(0, -ARM_LENGTH + 0.08, -0.2);
    leftArm.add(this.leftHandSocket);

    this.nameAnchor.name = "player-name-anchor";
    this.setPlayerName(options.playerName ?? "Player");
    this.blockGeometry.computeBoundingBox();
    this.setVariant(this._variant);
    this.setRace(this._race);
    this.setEquipmentAppearance(options.equipment ?? {});
    this.applyPose(this.pose);
  }

  get playerName(): string {
    return this._playerName;
  }

  get variant(): PlayerVariant {
    return this._variant;
  }

  get race(): FactionRace {
    return this._race;
  }

  get isDisposed(): boolean {
    return this.disposed;
  }

  getPose(): PlayerPoseSnapshot {
    return { ...this.pose };
  }

  setPlayerName(name: string): this {
    this.assertUsable();
    this._playerName = name.trim() || "Player";
    this.group.userData.playerName = this._playerName;
    this.nameAnchor.userData.playerName = this._playerName;
    return this;
  }

  setColors(colors: Partial<PlayerColors>): this {
    this.assertUsable();
    if (colors.skin !== undefined) this.materials.skin.color.set(colors.skin);
    if (colors.shirt !== undefined) this.materials.shirt.color.set(colors.shirt);
    if (colors.trousers !== undefined) this.materials.trousers.color.set(colors.trousers);
    if (colors.hair !== undefined) {
      this.baseHairColor.set(colors.hair);
      // Explicit appearance customization overrides the legacy female-black
      // default; loading only a variant still preserves that old silhouette.
      this.materials.hair.color.copy(this.baseHairColor);
    }
    if (colors.accent !== undefined) this.materials.accent.color.set(colors.accent);
    return this;
  }

  getColors(): { skin: number; shirt: number; trousers: number; hair: number; accent: number } {
    return {
      skin: this.materials.skin.color.getHex(),
      shirt: this.materials.shirt.color.getHex(),
      trousers: this.materials.trousers.color.getHex(),
      hair: this.materials.hair.color.getHex(),
      accent: this.materials.accent.color.getHex(),
    };
  }

  setVariant(variant: PlayerVariant): this {
    this.assertUsable();
    this._variant = variant === "female" ? "female" : "male";
    this.group.userData.playerVariant = this._variant;
    this.applyBodyProportions();
    return this;
  }

  setRace(race: FactionRace): this {
    this.assertUsable();
    this._race = characterRaceTraits(race).id;
    this.group.userData.playerRace = this._race;
    this.woodElfFeatures.visible = this._race === "wood-elf";
    this.goblinFeatures.visible = this._race === "goblin";
    this.applyBodyProportions();
    return this;
  }

  setAppearance(appearance: CharacterAppearance): this {
    return this.setVariant(appearance.sex).setRace(appearance.race).setColors(appearance.colors);
  }

  private applyBodyProportions() {
    const heightScale = playerModelHeightScale(this._variant, this._race);
    this.group.userData.playerHeightScale = heightScale;
    this.rig.scale.y = heightScale;
    this.maleHair.visible = this._variant === "male";
    this.femaleHair.visible = this._variant === "female";
    this.materials.hair.color.set(this._variant === "female" ? FEMALE_HAIR_COLOR : this.baseHairColor);
    const raceWidth = this._race === "dwarf" ? 1.12 : this._race === "hearthkin" || this._race === "confectkin" ? 1.04 : this._race === "goblin" ? 0.95 : this._race === "wood-elf" ? 0.92 : 1;
    const torsoWidth = (this._variant === "female" ? 0.92 : 1) * raceWidth;
    this.torsoBlock.scale.x = TORSO_WIDTH * torsoWidth;
    const accent = this.rig.getObjectByName("clothing-accent");
    if (accent) accent.scale.x = (TORSO_WIDTH + 0.014) * torsoWidth;
    const shoulderX = TORSO_WIDTH * torsoWidth / 2 + ARM_WIDTH / 2;
    this.parts.leftArm.position.x = -shoulderX;
    this.parts.rightArm.position.x = shoulderX;
  }

  setEquipmentAppearance(equipment: PlayerEquipmentAppearance): this {
    this.assertUsable();
    const materials = {
      head: this.materials.armorHead,
      chest: this.materials.armorChest,
      legs: this.materials.armorLegs,
      feet: this.materials.armorFeet,
    };
    for (const slot of Object.keys(this.equipmentMeshes) as Array<keyof PlayerEquipmentAppearance>) {
      const color = equipment[slot];
      const visible = color !== null && color !== undefined;
      for (const mesh of this.equipmentMeshes[slot]) mesh.visible = visible;
      if (visible) materials[slot].color.set(color);
    }
    return this;
  }

  /** The item remains caller-owned and is detached, not disposed, with the rig. */
  setHeldItem(item: THREE.Object3D | null): this {
    this.assertUsable();
    if (item === this.heldItem) return this;
    if (this.heldItem) this.rightHandSocket.remove(this.heldItem);
    this.heldItem = item;
    if (item) this.rightHandSocket.add(item);
    return this;
  }

  /** Offhand geometry is caller-owned, mirroring `setHeldItem`. */
  setOffhandItem(item: THREE.Object3D | null, shield = false): this {
    this.assertUsable();
    if (item === this.offhandItem && shield === this.offhandShield) return this;
    if (this.offhandItem) this.leftHandSocket.remove(this.offhandItem);
    this.offhandItem = item;
    this.offhandShield = Boolean(item && shield);
    if (item) this.leftHandSocket.add(item);
    return this;
  }

  setOffhandRaised(raised: boolean): this {
    this.assertUsable();
    this.offhandRaised = this.offhandShield && raised;
    return this;
  }

  setPose(pose: Partial<PlayerPoseSnapshot>): this {
    this.assertUsable();
    this.applyPose(normalizePlayerPose(pose, this.pose));
    return this;
  }

  setAnimation(animation: PlayerAnimation, phase = 0): this {
    this.assertUsable();
    this.applyPose(poseForAnimation(animation, phase, {
      headYaw: this.pose.headYaw,
      headPitch: this.pose.headPitch,
    }));
    return this;
  }

  /** Advances local animation phases; pass a patch for input-driven state. */
  update(deltaSeconds: number, patch: Partial<PlayerPoseSnapshot> = {}): this {
    this.assertUsable();
    const delta = Math.max(0, finiteOr(deltaSeconds, 0));
    const next = normalizePlayerPose(patch, this.pose);
    if (patch.phase === undefined) {
      const cyclesPerSecond = next.locomotion === "run" ? 2.35 : next.locomotion === "walk" ? 1.55 : 0.32;
      next.phase = wrapUnit(this.pose.phase + cyclesPerSecond * delta);
    }
    if (patch.actionPhase === undefined && next.action !== "none") {
      const actionsPerSecond = next.action === "mine" ? 1.85 : 1.15;
      next.actionPhase = wrapUnit(this.pose.actionPhase + actionsPerSecond * delta);
    }
    this.applyPose(next);
    return this;
  }

  applySnapshot(snapshot: Readonly<PlayerSnapshot>): this {
    this.assertUsable();
    this.group.position.set(snapshot.position[0], snapshot.position[1], snapshot.position[2]);
    this.group.rotation.set(0, snapshot.yaw, 0);
    this.applyPose(normalizePlayerPose(snapshot.pose));
    return this;
  }

  applyInterpolatedSnapshot(
    from: Readonly<PlayerSnapshot>,
    to: Readonly<PlayerSnapshot>,
    alpha: number,
  ): PlayerSnapshot {
    const snapshot = interpolatePlayerSnapshot(from, to, alpha);
    this.applySnapshot(snapshot);
    return snapshot;
  }

  createSnapshot(
    playerId: string,
    sequence: number,
    serverTimeMs: number,
    heldItemId: string | null = null,
  ): PlayerSnapshot {
    this.assertUsable();
    return {
      playerId,
      sequence,
      serverTimeMs,
      position: [this.group.position.x, this.group.position.y, this.group.position.z],
      yaw: wrapAngle(this.group.rotation.y),
      pose: this.getPose(),
      heldItemId,
    };
  }

  /** Body-only bounds in model space, excluding caller-owned held items. */
  getLocalBounds(target = new THREE.Box3()): THREE.Box3 {
    this.assertUsable();
    this.group.updateWorldMatrix(true, true);
    this.inverseRootMatrix.copy(this.group.matrixWorld).invert();
    target.makeEmpty();
    for (const mesh of this.ownedMeshes) {
      if (!this.isMeshDisplayed(mesh)) continue;
      const geometryBounds = mesh.geometry.boundingBox;
      if (!geometryBounds) continue;
      this.boundsMatrix.multiplyMatrices(this.inverseRootMatrix, mesh.matrixWorld);
      this.boundsBox.copy(geometryBounds).applyMatrix4(this.boundsMatrix);
      target.union(this.boundsBox);
    }
    return target;
  }

  /** Body-only bounds in world space, excluding caller-owned held items. */
  getWorldBounds(target = new THREE.Box3()): THREE.Box3 {
    this.assertUsable();
    this.group.updateWorldMatrix(true, true);
    target.makeEmpty();
    for (const mesh of this.ownedMeshes) {
      if (!this.isMeshDisplayed(mesh)) continue;
      const geometryBounds = mesh.geometry.boundingBox;
      if (!geometryBounds) continue;
      this.boundsBox.copy(geometryBounds).applyMatrix4(mesh.matrixWorld);
      target.union(this.boundsBox);
    }
    return target;
  }

  dispose(): void {
    if (this.disposed) return;
    if (this.heldItem) this.rightHandSocket.remove(this.heldItem);
    this.heldItem = null;
    if (this.offhandItem) this.leftHandSocket.remove(this.offhandItem);
    this.offhandItem = null;
    this.group.removeFromParent();
    this.group.clear();
    this.blockGeometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.ownedMeshes.length = 0;
    this.disposed = true;
  }

  private createPart(name: string): THREE.Group {
    const part = new THREE.Group();
    part.name = name;
    part.userData.playerPart = name;
    return part;
  }

  private isMeshDisplayed(mesh: THREE.Mesh): boolean {
    let object: THREE.Object3D | null = mesh;
    while (object && object !== this.group) {
      if (!object.visible) return false;
      object = object.parent;
    }
    return this.group.visible;
  }

  private createBlock(
    name: string,
    size: Vector3Tuple,
    position: Vector3Tuple,
    material: THREE.Material,
    options: PlayerModelOptions,
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(this.blockGeometry, material);
    mesh.name = name;
    mesh.position.set(position[0], position[1], position[2]);
    mesh.scale.set(size[0], size[1], size[2]);
    mesh.castShadow = options.castShadow ?? true;
    mesh.receiveShadow = options.receiveShadow ?? true;
    mesh.userData.blockPlayerOwned = true;
    this.ownedMeshes.push(mesh);
    return mesh;
  }

  private buildArm(arm: THREE.Group, side: "left" | "right", options: PlayerModelOptions): void {
    const sleeveLength = 0.48;
    const handLength = ARM_LENGTH - sleeveLength;
    arm.add(this.createBlock(`${side}-sleeve`, [ARM_WIDTH, sleeveLength, ARM_WIDTH], [0, -sleeveLength / 2, 0], this.materials.shirt, options));
    arm.add(this.createBlock(`${side}-hand`, [ARM_WIDTH * 0.92, handLength, ARM_WIDTH * 0.92], [0, -sleeveLength - handLength / 2, 0], this.materials.skin, options));
  }

  private buildHair(head: THREE.Group, options: PlayerModelOptions): void {
    this.maleHair.name = "male-hair";
    this.femaleHair.name = "female-hair";
    this.maleHair.add(
      this.createBlock("male-hair-cap", [0.52, 0.1, 0.52], [0, 0.48, 0], this.materials.hair, options),
      this.createBlock("male-hair-fringe", [0.5, 0.13, 0.055], [0, 0.4, -0.255], this.materials.hair, options),
    );
    this.femaleHair.add(
      this.createBlock("female-hair-cap", [0.52, 0.11, 0.52], [0, 0.48, 0], this.materials.hair, options),
      this.createBlock("female-hair-left", [0.09, 0.9, 0.5], [-0.29, 0.05, 0.01], this.materials.hair, options),
      this.createBlock("female-hair-right", [0.09, 0.9, 0.5], [0.29, 0.05, 0.01], this.materials.hair, options),
      this.createBlock("female-hair-back", [0.5, 0.92, 0.075], [0, 0.04, 0.285], this.materials.hair, options),
      this.createBlock("female-hair-braid", [0.14, 0.74, 0.14], [0.34, -0.23, 0.24], this.materials.hair, options),
    );
    head.add(this.maleHair, this.femaleHair);
  }

  private buildRaceFeatures(head: THREE.Group, options: PlayerModelOptions): void {
    this.woodElfFeatures.name = "wood-elf-features";
    this.goblinFeatures.name = "goblin-features";
    const addPointedFeatures = (root: THREE.Group, earReach: number, noseReach: number) => {
      // Two narrowing, overlapping cuboids read as a deliberate point from
      // both front and three-quarter cameras. A single long cuboid looked like
      // a duplicated arm/sideburn at multiplayer distance.
      for (const side of [-1, 1] as const) {
        const sideName = side < 0 ? "left" : "right";
        const base = this.createBlock(
          `${root.name}-${sideName}-ear-base`,
          [earReach * 0.7, 0.13, 0.105],
          [side * (HEAD_SIZE / 2 + earReach * 0.24), 0.3, 0],
          this.materials.skin,
          options,
        );
        const tip = this.createBlock(
          `${root.name}-${sideName}-ear-tip`,
          [earReach * 0.55, 0.08, 0.075],
          [side * (HEAD_SIZE / 2 + earReach * 0.73), 0.33, 0],
          this.materials.skin,
          options,
        );
        base.rotation.z = side * -0.24;
        tip.rotation.z = side * -0.56;
        root.add(base, tip);
      }
      const noseBridge = this.createBlock(`${root.name}-nose-bridge`, [0.1, 0.12, noseReach * 0.7], [0, 0.22, -HEAD_SIZE / 2 - noseReach * 0.22], this.materials.skin, options);
      const noseTip = this.createBlock(`${root.name}-pointed-nose`, [0.075, 0.075, noseReach * 0.56], [0, 0.19, -HEAD_SIZE / 2 - noseReach * 0.78], this.materials.skin, options);
      noseBridge.rotation.x = -0.12;
      noseTip.rotation.x = -0.34;
      root.add(noseBridge, noseTip);
    };
    addPointedFeatures(this.woodElfFeatures, 0.24, 0.16);
    addPointedFeatures(this.goblinFeatures, 0.2, 0.12);
    head.add(this.woodElfFeatures, this.goblinFeatures);
  }

  private buildEquipment(options: PlayerModelOptions): void {
    const add = (
      slot: keyof PlayerEquipmentAppearance,
      parent: THREE.Object3D,
      name: string,
      size: Vector3Tuple,
      position: Vector3Tuple,
      material: THREE.Material,
    ) => {
      const mesh = this.createBlock(name, size, position, material, options);
      mesh.visible = false;
      this.equipmentMeshes[slot].push(mesh);
      parent.add(mesh);
    };

    add("head", this.parts.head, "armor-head-cap", [0.59, 0.13, 0.59], [0, 0.5, 0], this.materials.armorHead);
    add("head", this.parts.head, "armor-head-left", [0.07, 0.3, 0.57], [-0.29, 0.34, 0], this.materials.armorHead);
    add("head", this.parts.head, "armor-head-right", [0.07, 0.3, 0.57], [0.29, 0.34, 0], this.materials.armorHead);
    add("head", this.parts.head, "armor-head-back", [0.53, 0.35, 0.07], [0, 0.31, 0.29], this.materials.armorHead);
    add("chest", this.parts.torso, "armor-chest", [TORSO_WIDTH + 0.075, TORSO_HEIGHT + 0.045, TORSO_DEPTH + 0.075], [0, TORSO_HEIGHT / 2, 0], this.materials.armorChest);
    add("chest", this.parts.leftArm, "armor-left-shoulder", [ARM_WIDTH + 0.055, 0.33, ARM_WIDTH + 0.055], [0, -0.16, 0], this.materials.armorChest);
    add("chest", this.parts.rightArm, "armor-right-shoulder", [ARM_WIDTH + 0.055, 0.33, ARM_WIDTH + 0.055], [0, -0.16, 0], this.materials.armorChest);
    add("legs", this.parts.leftLeg, "armor-left-leg", [LEG_WIDTH + 0.045, LEG_LENGTH * 0.7, LEG_DEPTH + 0.045], [0, -LEG_LENGTH * 0.35, 0], this.materials.armorLegs);
    add("legs", this.parts.rightLeg, "armor-right-leg", [LEG_WIDTH + 0.045, LEG_LENGTH * 0.7, LEG_DEPTH + 0.045], [0, -LEG_LENGTH * 0.35, 0], this.materials.armorLegs);
    add("feet", this.parts.leftLeg, "armor-left-boot", [LEG_WIDTH + 0.06, LEG_LENGTH * 0.34, LEG_DEPTH + 0.11], [0, -LEG_LENGTH * 0.83, -0.025], this.materials.armorFeet);
    add("feet", this.parts.rightLeg, "armor-right-boot", [LEG_WIDTH + 0.06, LEG_LENGTH * 0.34, LEG_DEPTH + 0.11], [0, -LEG_LENGTH * 0.83, -0.025], this.materials.armorFeet);
  }

  private applyPose(nextPose: PlayerPoseSnapshot): void {
    this.pose = nextPose;
    const cycle = nextPose.phase * TWO_PI;
    const crouch = nextPose.crouch;
    const swimming = nextPose.swimming ?? 0;
    const seated = nextPose.seated ?? 0;
    const jumpCurve = nextPose.jump * (0.68 + 0.32 * Math.sin(nextPose.phase * Math.PI));
    const legScale = 1 - 0.36 * crouch;
    const hipY = LEG_LENGTH * legScale;

    let legSwing = 0;
    let bob = 0;
    let torsoLean = -0.24 * crouch;
    if (nextPose.locomotion === "walk") {
      legSwing = Math.sin(cycle) * 0.62;
      bob = Math.abs(Math.sin(cycle)) * 0.025;
    } else if (nextPose.locomotion === "run") {
      legSwing = Math.sin(cycle) * 0.96;
      bob = Math.abs(Math.sin(cycle)) * 0.052;
      torsoLean -= 0.11;
    }

    const idleSwing = nextPose.locomotion === "idle" ? Math.sin(cycle) * 0.025 : 0;
    let leftLegAngle = legSwing + crouch * 0.22 + jumpCurve * 0.3;
    let rightLegAngle = -legSwing + crouch * 0.22 - jumpCurve * 0.2;
    let leftArmAngle = -legSwing * 0.76 + idleSwing + crouch * 0.12 + jumpCurve * 0.72;
    let rightArmAngle = legSwing * 0.76 - idleSwing + crouch * 0.12 + jumpCurve * 0.72;
    let leftArmRoll = 0;
    let rightArmRoll = 0;

    if (seated > 0) {
      leftLegAngle = THREE.MathUtils.lerp(leftLegAngle, 1.22, seated);
      rightLegAngle = THREE.MathUtils.lerp(rightLegAngle, 1.22, seated);
      leftArmAngle *= 1 - seated * 0.55;
      rightArmAngle *= 1 - seated * 0.55;
      bob *= 1 - seated;
    }

    if (swimming > 0) {
      const stroke = Math.sin(cycle);
      torsoLean = THREE.MathUtils.lerp(torsoLean, -1.43, swimming);
      leftLegAngle = THREE.MathUtils.lerp(leftLegAngle, -1.16 + stroke * 0.18, swimming);
      rightLegAngle = THREE.MathUtils.lerp(rightLegAngle, -1.16 - stroke * 0.18, swimming);
      leftArmAngle = THREE.MathUtils.lerp(leftArmAngle, 2.2 + stroke * 0.72, swimming);
      rightArmAngle = THREE.MathUtils.lerp(rightArmAngle, 2.2 - stroke * 0.72, swimming);
      bob = 0;
    }

    if (this.heldItem && nextPose.action === "none") {
      // A carried tool belongs in the hand, not inside the torso. This neutral
      // ready pose also gives remote sentient/player rigs a readable aim line.
      rightArmAngle = 1.28 + Math.sin(cycle) * (nextPose.locomotion === "idle" ? 0.025 : 0.07);
      rightArmRoll = 0.12;
    } else if (nextPose.action === "mine") {
      const stroke = 0.5 - 0.5 * Math.cos(nextPose.actionPhase * TWO_PI);
      rightArmAngle = 2.48 - stroke * 2.1;
      rightArmRoll = -0.12;
      torsoLean -= stroke * 0.045;
    } else if (nextPose.action === "use") {
      rightArmAngle = 1.35 + Math.sin(nextPose.actionPhase * TWO_PI) * 0.1;
      rightArmRoll = 0.24;
    }

    if (this.offhandItem && swimming < 0.5) {
      if (this.offhandShield) {
        const raise = this.offhandRaised ? 1 : 0;
        leftArmAngle = THREE.MathUtils.lerp(0.26, 1.5, raise);
        leftArmRoll = THREE.MathUtils.lerp(-0.16, -0.46, raise);
      } else {
        // Torches and lanterns sit slightly forward of the hip so their model
        // and light source remain visible to other players.
        leftArmAngle = 1.02 + Math.sin(cycle) * 0.035;
        leftArmRoll = -0.12;
      }
    }

    leftLegAngle = clamp(leftLegAngle, -1.25, 1.25);
    rightLegAngle = clamp(rightLegAngle, -1.25, 1.25);
    leftArmAngle = clamp(leftArmAngle, -Math.PI, Math.PI);
    rightArmAngle = clamp(rightArmAngle, -Math.PI, Math.PI);

    this.parts.leftLeg.position.y = hipY;
    this.parts.rightLeg.position.y = hipY;
    this.parts.leftLeg.scale.set(1, legScale, 1);
    this.parts.rightLeg.scale.set(1, legScale, 1);
    this.parts.leftLeg.rotation.set(leftLegAngle, 0, 0);
    this.parts.rightLeg.rotation.set(rightLegAngle, 0, 0);

    this.parts.torso.position.set(0, hipY + bob, 0);
    this.parts.torso.rotation.set(torsoLean, 0, 0);
    this.parts.leftArm.rotation.set(leftArmAngle, 0, leftArmRoll);
    this.parts.rightArm.rotation.set(rightArmAngle, 0, rightArmRoll);
    this.parts.head.rotation.x = nextPose.headPitch;
    this.parts.head.rotation.y = nextPose.headYaw;
    this.parts.head.rotation.z = 0;

    // Rotation can make a cuboid's foot corner dip or lift. Compensating by the
    // exact rotated lower extent keeps the animated body grounded at local Y=0.
    const leftFootY = hipY - LEG_LENGTH * legScale * Math.cos(leftLegAngle) - LEG_DEPTH * 0.5 * Math.abs(Math.sin(leftLegAngle));
    const rightFootY = hipY - LEG_LENGTH * legScale * Math.cos(rightLegAngle) - LEG_DEPTH * 0.5 * Math.abs(Math.sin(rightLegAngle));
    // The rig owns race/sex height as a non-uniform Y scale. Its translation
    // is not scaled by Three.js, so the foot correction must be scaled here or
    // short characters penetrate chairs/terrain while tall characters hover.
    const heightScale = playerModelHeightScale(this._variant, this._race);
    this.rig.position.y = swimming > 0.01 ? 0.82 * swimming : -Math.min(leftFootY, rightFootY) * heightScale;
    this.nameAnchor.position.set(0, hipY + TORSO_HEIGHT + HEAD_SIZE + 0.24, 0);
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error("BlockPlayerModel has been disposed");
  }
}

export type ThirdPersonView = "rear" | "front";

export type ThirdPersonCameraOptions = {
  view?: ThirdPersonView;
  distance?: number;
  targetHeight?: number;
  pitch?: number;
  shoulderOffset?: number;
  collisionRadius?: number;
  collisionPadding?: number;
  minDistance?: number;
};

export type ThirdPersonCameraCollisionQuery = {
  origin: THREE.Vector3;
  desiredPosition: THREE.Vector3;
  direction: THREE.Vector3;
  maxDistance: number;
  radius: number;
  view: ThirdPersonView;
};

/** Return the ray distance of the first obstacle, or null when unobstructed. */
export type ThirdPersonCameraCollision = (query: ThirdPersonCameraCollisionQuery) => number | null | undefined;

export type ThirdPersonCameraPlacement = {
  position: THREE.Vector3;
  desiredPosition: THREE.Vector3;
  target: THREE.Vector3;
  distance: number;
  collided: boolean;
  view: ThirdPersonView;
};

export function computeThirdPersonCamera(
  subjectPosition: { x: number; y: number; z: number },
  subjectYaw: number,
  options: ThirdPersonCameraOptions = {},
  collision?: ThirdPersonCameraCollision,
): ThirdPersonCameraPlacement {
  const view = options.view ?? "rear";
  const minDistance = Math.max(0.05, finiteOr(options.minDistance, 0.35));
  const distance = Math.max(minDistance, finiteOr(options.distance, 4));
  const pitch = clamp(finiteOr(options.pitch, 0.2), -1.25, 1.25);
  const targetHeight = finiteOr(options.targetHeight, 1.36);
  const shoulderOffset = finiteOr(options.shoulderOffset, 0);
  const radius = Math.max(0, finiteOr(options.collisionRadius, 0.18));
  const padding = Math.max(0, finiteOr(options.collisionPadding, 0.14));

  const target = new THREE.Vector3(subjectPosition.x, subjectPosition.y + targetHeight, subjectPosition.z);
  const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(UP, subjectYaw);
  const outward = view === "rear" ? forward.multiplyScalar(-1) : forward;
  const right = new THREE.Vector3(1, 0, 0).applyAxisAngle(UP, subjectYaw);
  const offset = outward.multiplyScalar(Math.cos(pitch) * distance);
  offset.y = Math.sin(pitch) * distance;
  offset.addScaledVector(right, shoulderOffset);

  const desiredPosition = target.clone().add(offset);
  const maxDistance = offset.length();
  const direction = maxDistance > 0 ? offset.clone().multiplyScalar(1 / maxDistance) : new THREE.Vector3(0, 0, 1);
  let resolvedDistance = maxDistance;
  let collided = false;

  if (collision && maxDistance > 0) {
    const hitDistance = collision({
      origin: target.clone(),
      desiredPosition: desiredPosition.clone(),
      direction: direction.clone(),
      maxDistance,
      radius,
      view,
    });
    if (typeof hitDistance === "number" && Number.isFinite(hitDistance) && hitDistance >= 0 && hitDistance < maxDistance) {
      resolvedDistance = Math.max(0, hitDistance - padding);
      collided = true;
    }
  }

  return {
    position: target.clone().addScaledVector(direction, resolvedDistance),
    desiredPosition,
    target,
    distance: resolvedDistance,
    collided,
    view,
  };
}

export type ThirdPersonCameraUpdateOptions = ThirdPersonCameraOptions & {
  deltaSeconds?: number;
  positionSharpness?: number;
};

/** Positions a Three.js camera and optionally damps it toward the resolved spot. */
export function updateThirdPersonCamera(
  camera: THREE.Camera,
  subjectPosition: { x: number; y: number; z: number },
  subjectYaw: number,
  options: ThirdPersonCameraUpdateOptions = {},
  collision?: ThirdPersonCameraCollision,
): ThirdPersonCameraPlacement {
  const placement = computeThirdPersonCamera(subjectPosition, subjectYaw, options, collision);
  const shouldSmooth = options.positionSharpness !== undefined && options.deltaSeconds !== undefined;
  if (shouldSmooth) {
    camera.position.lerp(placement.position, smoothingAlpha(options.positionSharpness!, options.deltaSeconds!));
  } else {
    camera.position.copy(placement.position);
  }
  camera.lookAt(placement.target);
  return placement;
}
