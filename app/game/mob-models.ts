import * as THREE from "three";
import {
  ATLANTIAN_TRIDENT_CONTRACT,
  createZombieSpec,
  FACTION_WEAPON_CONTRACTS,
  FISH_FIN_ATTACHMENT_OVERLAP,
  LEVIATHAN_VISUAL_CONTRACTS,
  RATTLEKIN_CLUB_CONTRACT,
  RIDGEBACK_GROUND_LIFT,
} from "./model-specs";
import { CORE_MOB_ORDER, MOB_DEFS, type CoreMobKind, type DragonKind, type MobKind } from "./mobs";
import { createArrowVisual } from "./projectiles";

const TAU = Math.PI * 2;

export type MobVisualParts = Record<"legs" | "wings" | "arms" | "head" | "body", THREE.Object3D[]>;

export type MobVisual = {
  group: THREE.Group;
  visual: THREE.Group;
  parts: MobVisualParts;
};

export type DragonAnimationMode = "idle" | "walk" | "fly" | "melee" | "breath" | "projectile" | "hurt" | "sleep";
export type DragonRenderEquipment = Readonly<{
  saddle?: boolean;
  leftChest?: boolean;
  rightChest?: boolean;
  armor?: Partial<Record<"head" | "neck" | "body" | "tail", boolean>>;
}>;
export type DragonPoseInput = Readonly<{
  timeSeconds: number;
  mode?: DragonAnimationMode;
  movement?: number;
  attackProgress?: number;
  bank?: number;
  pitch?: number;
  sex?: "female" | "male";
  equipment?: DragonRenderEquipment;
}>;

export const DRAGON_MODEL_CONTRACT = Object.freeze({
  neckSegments: 3,
  tailSegments: 7,
  wingPivotsPerSide: 2,
  legJointsPerLeg: 3,
  armorSlots: ["head", "neck", "body", "tail"] as const,
  cargoChests: 2,
  forwardAxis: "-z" as const,
});

/** Applies the same named dragon rig used by gameplay, portraits, and the inspector. */
export function applyDragonPose(root: THREE.Object3D, input: DragonPoseInput) {
  const type = root.userData.dragonType as "fire" | "ice" | "steel" | undefined;
  if (!type) return false;
  const prefix = `${type}-dragon`;
  const time = Number.isFinite(input.timeSeconds) ? input.timeSeconds : 0;
  const movement = THREE.MathUtils.clamp(input.movement ?? 0, 0, 1);
  const attack = THREE.MathUtils.clamp(input.attackProgress ?? 0, 0, 1);
  const mode = input.mode ?? "idle";
  const airborne = mode === "fly" || mode === "breath" || mode === "projectile";
  const object = (suffix: string) => root.getObjectByName(`${prefix}-${suffix}`);

  const chest = object("breathing-chest-pivot");
  if (chest) {
    const breath = 1 + Math.sin(time * (mode === "breath" ? 7.5 : 2.2)) * (mode === "breath" ? 0.075 : 0.025);
    chest.scale.set(1 / Math.sqrt(breath), breath, breath);
  }
  for (let index = 1; index <= DRAGON_MODEL_CONTRACT.neckSegments; index += 1) {
    const neck = object(`neck-${index}-pivot`);
    if (!neck) continue;
    neck.rotation.y = Math.sin(time * 1.3 - index * 0.58) * 0.035 + (input.bank ?? 0) * 0.08;
    neck.rotation.x = (input.pitch ?? 0) * (0.12 + index * 0.035) + (mode === "breath" ? -attack * 0.08 : 0);
  }
  const head = object("head-pivot");
  if (head) {
    head.rotation.x = (input.pitch ?? 0) * 0.34 + (mode === "melee" ? Math.sin(attack * Math.PI) * 0.42 : 0);
    head.rotation.y = Math.sin(time * 0.65) * (mode === "idle" ? 0.035 : 0);
  }
  const jaw = object("jaw-pivot");
  if (jaw) jaw.rotation.x = mode === "breath" || mode === "projectile" ? 0.52 * Math.sin(attack * Math.PI * 0.72) : mode === "melee" ? 0.72 * Math.sin(attack * Math.PI) : 0.025 + Math.sin(time * 1.1) * 0.01;

  for (let index = 1; index <= DRAGON_MODEL_CONTRACT.tailSegments; index += 1) {
    const tail = object(`tail-${index}-pivot`);
    if (!tail) continue;
    tail.rotation.y = Math.sin(time * (airborne ? 2.7 : 1.45) - index * 0.62) * (airborne ? 0.09 : 0.055) * index;
    tail.rotation.x = airborne ? Math.sin(time * 1.2 - index * 0.35) * 0.025 : Math.max(0, index - 4) * 0.025;
  }

  for (const side of ["left", "right"] as const) {
    const sign = side === "left" ? -1 : 1;
    const wing = object(`${side}-wing-root-pivot`);
    const forearm = object(`${side}-wing-forearm-pivot`);
    if (wing) {
      wing.rotation.z = sign * (airborne ? 0.22 + Math.sin(time * 4.2) * 0.48 : 0.34 + Math.sin(time * 0.9) * 0.025);
      wing.rotation.x = airborne ? -0.08 + (input.pitch ?? 0) * 0.16 : -0.38;
      wing.rotation.y = sign * (input.bank ?? 0) * 0.18;
    }
    if (forearm) forearm.rotation.z = sign * (airborne ? 0.14 + Math.sin(time * 4.2 + 0.4) * 0.18 : 0.28);
  }

  for (const position of ["front-left", "front-right", "rear-left", "rear-right"] as const) {
    const sidePhase = position.includes("left") ? 0 : Math.PI;
    const stride = Math.sin(time * 6.1 + sidePhase + (position.startsWith("rear") ? Math.PI : 0)) * movement;
    const hip = object(`${position}-hip-pivot`);
    const knee = object(`${position}-knee-pivot`);
    const claw = object(`${position}-claw-pivot`);
    if (hip) hip.rotation.x = airborne ? (position.startsWith("front") ? 0.72 : -0.42) : stride * 0.5;
    if (knee) knee.rotation.x = airborne ? 0.84 : Math.max(0, -stride) * 0.65;
    if (claw) claw.rotation.x = airborne ? -0.52 : -Math.max(0, stride) * 0.22;
  }

  const emitter = object("breath-emitter");
  const projectile = object("projectile-origin");
  if (emitter) emitter.visible = mode === "breath" && attack > 0.08 && attack < 0.94;
  if (projectile) projectile.visible = mode === "projectile" && attack > 0.42 && attack < 0.8;
  const maleWingMarkings = object("male-wing-markings");
  const maleHornRack = object("male-horn-rack");
  const femaleHornRack = object("female-horn-rack");
  const sex = input.sex ?? root.userData.dragonSex;
  if (maleWingMarkings) maleWingMarkings.visible = sex === "male";
  if (maleHornRack) maleHornRack.visible = sex === "male";
  if (femaleHornRack) femaleHornRack.visible = sex === "female";
  root.traverse((child) => {
    if (child.userData.sexMarker === "male") child.visible = sex === "male";
    else if (child.userData.sexMarker === "female") child.visible = sex === "female";
  });

  if (input.equipment) {
    const equipment = input.equipment;
    const visibility: Record<string, boolean> = {
      saddle: equipment.saddle === true,
      "left-cargo": equipment.leftChest === true,
      "right-cargo": equipment.rightChest === true,
      "head-armor": equipment.armor?.head === true,
      "neck-armor": equipment.armor?.neck === true,
      "body-armor": equipment.armor?.body === true,
      "tail-armor": equipment.armor?.tail === true,
    };
    for (const [suffix, visible] of Object.entries(visibility)) {
      const attachment = object(suffix);
      if (attachment) attachment.visible = visible;
    }
  }
  return true;
}

export const SENTIENT_LOD_MAX_MESHES = 5;

/**
 * A five-piece resident silhouette for the middle distance. The body palette
 * preserves faction identity, while the final marker changes silhouette and
 * color by profession so guards, leaders, growers, traders, and crafters remain
 * readable without drawing thirty-plus tiny boxes per character.
 */
export function createSentientLodVisual(kind: MobKind, id: number, bounds: THREE.Box3) {
  const definition = MOB_DEFS[kind];
  if (!definition?.sentient) throw new Error(`'${kind}' is not a sentient mob.`);
  const group = new THREE.Group();
  group.name = `${kind}-sentient-lod`;
  group.userData.mobId = id;
  group.userData.sentientLod = true;
  group.userData.lodRole = definition.role ?? "resident";
  group.visible = false;

  const extent = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const height = Math.max(0.9, extent.y);
  const width = Math.max(0.46, Math.min(0.82, extent.x * 0.72));
  const depth = Math.max(0.34, Math.min(0.58, extent.z * 0.58));
  const bottom = bounds.min.y;
  const atlantian = kind.startsWith("atlantian-");
  const hobbit = kind.startsWith("hobbit-");
  const sugarcourt = kind.startsWith("sugarcourt-");
  const skinColor = atlantian ? 0x4e9eaa : sugarcourt ? 0xf0b5c9 : hobbit ? 0xc9916c : 0x78924e;
  const [bodyColor, accentColor, eyeColor] = definition.colors;
  const role = definition.role ?? "resident";
  const roleColor = role === "mayor" || role === "chieftain" ? 0xf1cf73
    : role === "guard" ? (atlantian ? 0x73f0dc : sugarcourt ? 0x78d8b5 : 0xc98556)
      : role === "farmer" || role === "worker" ? 0x86b968
        : role === "miner" ? 0xa9b5ba
          : role === "merchant" || role === "banker" ? 0xb899d1
            : role === "alchemist" ? 0xd889e7 : accentColor;

  const add = (
    name: string,
    size: readonly [number, number, number],
    color: THREE.ColorRepresentation,
    position: readonly [number, number, number],
    basic = false,
  ) => {
    const material = basic ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.name = `${kind}-lod-${name}`;
    mesh.position.set(...position);
    mesh.userData.mobId = id;
    mesh.userData.sentientLod = true;
    group.add(mesh);
    return mesh;
  };

  const bodyHeight = height * 0.46;
  add("body", [width, bodyHeight, depth], bodyColor, [center.x, bottom + height * 0.42, center.z]);
  add("base", [width * 0.82, height * 0.2, depth * 0.76], accentColor, [center.x, bottom + height * 0.1, center.z + depth * 0.04]);
  const headWidth = width * 0.76;
  const headHeight = height * 0.27;
  add("head", [headWidth, headHeight, depth * 0.92], skinColor, [center.x, bottom + height * 0.79, center.z - depth * 0.03]);
  add("eyes", [headWidth * 0.58, Math.max(0.045, height * 0.035), depth * 0.08], eyeColor,
    [center.x, bottom + height * 0.82, center.z - depth * 0.51], true);

  if (role === "mayor" || role === "chieftain") {
    add("leader-crown", [width * 0.78, height * 0.08, depth * 0.74], roleColor,
      [center.x, bottom + height * 0.98, center.z], true);
  } else if (role === "guard") {
    add("guard-pole", [Math.max(0.07, width * 0.12), height * 0.78, Math.max(0.07, depth * 0.14)], roleColor,
      [center.x + width * 0.62, bottom + height * 0.48, center.z - depth * 0.12], atlantian);
  } else {
    const badge = add(`${role}-badge`, [width * 0.48, height * 0.18, depth * 0.1], roleColor,
      [center.x, bottom + height * 0.48, center.z - depth * 0.55], role === "alchemist");
    if (role === "miner") badge.rotation.z = -0.55;
  }

  return group;
}

/**
 * Builds the canonical production creature model used by the world, the model
 * inspector, and the bestiary portraits. Keep cosmetic geometry here so those
 * three surfaces can never silently drift apart.
 */
export function createMobVisual(kind: MobKind, id: number): MobVisual {
  if (!CORE_MOB_ORDER.includes(kind as CoreMobKind)) throw new Error(`'${kind}' is not a world mob visual.`);

  const group = new THREE.Group();
  const visual = new THREE.Group();
  group.name = `${kind}-root`;
  visual.name = `${kind}-visual`;
  group.add(visual);
  const parts: MobVisualParts = { legs: [], wings: [], arms: [], head: [], body: [] };
  const [bodyColor, accentColor, eyeColor] = MOB_DEFS[kind].colors;
  const bodyMaterial = new THREE.MeshLambertMaterial({ color: bodyColor });
  const accentMaterial = new THREE.MeshLambertMaterial({ color: accentColor });
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: eyeColor });
  const darkMaterial = new THREE.MeshLambertMaterial({ color: new THREE.Color(bodyColor).multiplyScalar(0.62) });
  const material = (color: THREE.ColorRepresentation, emissive = false, opacity = 1) => emissive
    ? new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity })
    : new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity });
  const add = (
    parent: THREE.Object3D,
    size: [number, number, number],
    meshMaterial: THREE.Material,
    position: [number, number, number],
    part?: keyof MobVisualParts,
    name?: string,
  ) => {
    const geometry = new THREE.BoxGeometry(...size);
    const mesh = new THREE.Mesh(geometry, meshMaterial);
    mesh.position.set(...position);
    mesh.name = name ?? `${kind}-${part ?? "detail"}`;
    mesh.userData.mobId = id;
    parent.add(mesh);
    if (part) {
      mesh.userData.bodyPart = part;
      parts[part].push(mesh);
    }
    return mesh;
  };
  const pivotBox = (
    size: [number, number, number],
    meshMaterial: THREE.Material,
    pivotPosition: [number, number, number],
    meshOffset: [number, number, number],
    part: keyof MobVisualParts,
    name: string,
  ) => {
    const pivot = new THREE.Group();
    pivot.name = `${name}-pivot`;
    pivot.position.set(...pivotPosition);
    visual.add(pivot);
    const mesh = add(pivot, size, meshMaterial, meshOffset, undefined, name);
    mesh.userData.bodyPart = part;
    parts[part].push(pivot);
    return pivot;
  };
  const eyePair = (x: number, y: number, z: number, size = 0.065, prefix = kind) => {
    add(visual, [size, size, 0.035], eyeMaterial, [-x, y, z], undefined, `${prefix}-left-eye`);
    add(visual, [size, size, 0.035], eyeMaterial, [x, y, z], undefined, `${prefix}-right-eye`);
  };
  const quadrupedLegs = (
    x: number,
    frontZ: number,
    rearZ: number,
    pivotY: number,
    length: number,
    width: number,
    legMaterial: THREE.Material,
    prefix = kind,
  ) => {
    for (const [px, pz, phase, name] of [
      [-x, frontZ, 0, "front-left"], [x, frontZ, Math.PI, "front-right"],
      [-x, rearZ, Math.PI, "rear-left"], [x, rearZ, 0, "rear-right"],
    ] as Array<[number, number, number, string]>) {
      const leg = pivotBox([width, length, width], legMaterial, [px, pivotY, pz], [0, -length / 2, 0], "legs", `${prefix}-${name}-leg`);
      leg.userData.phase = phase;
    }
  };

  const buildDragon = (dragonKind: DragonKind) => {
    const dragonType = dragonKind.replace("-dragon", "") as "fire" | "ice" | "steel";
    const prefix = dragonKind;
    const palette = dragonType === "fire"
      ? { belly: 0x5e211f, membrane: 0xc8462d, horn: 0x3b2925, glow: 0xffc657, metal: 0xb8793e, armor: 0x6f2525 }
      : dragonType === "ice"
        ? { belly: 0x416f8c, membrane: 0x92d5e8, horn: 0xe8f6f4, glow: 0xcaffff, metal: 0x9fc8d2, armor: 0x587f9a }
        : { belly: 0x343f46, membrane: 0x71838c, horn: 0x232a2f, glow: 0xe4fbff, metal: 0xb8c6ca, armor: 0x46545d };
    const bellyMaterial = material(palette.belly);
    const membraneMaterial = material(palette.membrane, false, 0.86);
    const hornMaterial = material(palette.horn);
    const glowMaterial = material(palette.glow, true, 0.94);
    const metalMaterial = material(palette.metal);
    const armorMaterial = material(palette.armor);
    const leatherMaterial = material(0x5a3829);
    const cargoMaterial = material(0x6f4930);
    const cargoBandMaterial = material(0xc18a4c);

    group.userData.dragonType = dragonType;
    visual.userData.dragonType = dragonType;
    group.userData.dragonSex = id % 2 === 0 ? "female" : "male";
    visual.userData.dragonSex = group.userData.dragonSex;
    group.userData.animatedRig = "dragon-v1";

    const pivot = (parent: THREE.Object3D, suffix: string, position: readonly [number, number, number]) => {
      const node = new THREE.Group();
      node.name = `${prefix}-${suffix}-pivot`;
      node.position.set(...position);
      node.userData.mobId = id;
      node.userData.dragonRigPart = suffix;
      parent.add(node);
      return node;
    };
    const rigBox = (
      parent: THREE.Object3D,
      suffix: string,
      size: [number, number, number],
      meshMaterial: THREE.Material,
      position: [number, number, number],
      rotation: [number, number, number] = [0, 0, 0],
    ) => {
      const mesh = add(parent, size, meshMaterial, position, undefined, `${prefix}-${suffix}`);
      mesh.rotation.set(...rotation);
      mesh.userData.dragonRigPart = suffix;
      return mesh;
    };
    const attachment = (suffix: string, parent: THREE.Object3D = visual) => {
      const node = new THREE.Group();
      node.name = `${prefix}-${suffix}`;
      node.userData.mobId = id;
      node.userData.dragonAttachment = suffix;
      node.visible = false;
      parent.add(node);
      return node;
    };

    const chest = pivot(visual, "breathing-chest", [0, 1.9, -0.05]);
    rigBox(chest, "chest", [1.9, 1.32, 3.05], bodyMaterial, [0, 0, 0]);
    rigBox(chest, "belly-keel", [1.18, 0.35, 2.7], bellyMaterial, [0, -0.58, -0.08]);
    rigBox(visual, "haunches", [1.72, 1.18, 1.75], bodyMaterial, [0, 1.82, 1.47]);
    rigBox(visual, "shoulder-mantle", [2.16, 0.56, 1.1], accentMaterial, [0, 2.42, -0.78]);
    parts.body.push(chest);

    for (let ridge = 0; ridge < 7; ridge += 1) {
      const height = 0.42 + Math.sin((ridge / 6) * Math.PI) * 0.42;
      const spine = rigBox(visual, `back-spine-${ridge + 1}`, [0.18, height, 0.28], accentMaterial, [0, 2.62 + height / 2, -1.18 + ridge * 0.47]);
      spine.rotation.x = -0.08 + ridge * 0.018;
    }
    if (dragonType === "steel") {
      for (let plate = 0; plate < 5; plate += 1) {
        const left = rigBox(visual, `left-riveted-plate-${plate + 1}`, [0.72, 0.16, 0.62], metalMaterial, [-0.66, 2.42, -0.85 + plate * 0.58], [0, 0, -0.12]);
        const right = rigBox(visual, `right-riveted-plate-${plate + 1}`, [0.72, 0.16, 0.62], metalMaterial, [0.66, 2.42, -0.85 + plate * 0.58], [0, 0, 0.12]);
        left.userData.pressurePlate = true;
        right.userData.pressurePlate = true;
      }
    }

    let neckParent: THREE.Object3D = visual;
    for (let segment = 1; segment <= DRAGON_MODEL_CONTRACT.neckSegments; segment += 1) {
      const neck = pivot(neckParent, `neck-${segment}`, segment === 1 ? [0, 2.02, -1.3] : [0, 0.1, -0.94]);
      const width = 1.38 - segment * 0.14;
      rigBox(neck, `neck-${segment}`, [width, 1.08 - segment * 0.08, 1.24], segment % 2 ? bodyMaterial : accentMaterial, [0, 0, -0.5]);
      rigBox(neck, `neck-${segment}-throat`, [width * 0.68, 0.25, 1.06], bellyMaterial, [0, -0.43, -0.52]);
      rigBox(neck, `neck-${segment}-spine`, [0.16, 0.46 - segment * 0.04, 0.28], accentMaterial, [0, 0.63 - segment * 0.05, -0.42]);
      neckParent = neck;
    }

    const head = pivot(neckParent, "head", [0, 0.06, -1.02]);
    const headWidth = dragonType === "ice" ? 1.76 : dragonType === "steel" ? 1.66 : 1.58;
    rigBox(head, "head", [headWidth, 1.12, 1.42], bodyMaterial, [0, 0, -0.46]);
    rigBox(head, "brow", [headWidth * 1.04, 0.28, 0.7], accentMaterial, [0, 0.34, -0.93]);
    rigBox(head, "snout", [headWidth * 0.7, 0.58, 1.15], bellyMaterial, [0, -0.18, -1.28]);
    parts.head.push(head);

    const jaw = pivot(head, "jaw", [0, -0.39, -1.1]);
    rigBox(jaw, "lower-jaw", [headWidth * 0.72, 0.28, 1.15], bellyMaterial, [0, -0.08, -0.48]);
    for (const side of [-1, 1]) {
      for (let tooth = 0; tooth < 4; tooth += 1) {
        rigBox(jaw, `${side < 0 ? "left" : "right"}-tooth-${tooth + 1}`, [0.09, 0.22, 0.1], hornMaterial, [side * (0.2 + tooth * 0.1), 0.1, -0.2 - tooth * 0.23], [0.12, 0, side * 0.05]);
      }
    }
    const emitter = new THREE.Group();
    emitter.name = `${prefix}-breath-emitter`;
    emitter.position.set(0, 0.03, -1.08);
    emitter.visible = false;
    jaw.add(emitter);
    for (let ember = 0; ember < 4; ember += 1) {
      const mote = rigBox(emitter, `breath-mote-${ember + 1}`, [0.12 + ember * 0.04, 0.12 + ember * 0.04, 0.18 + ember * 0.08], glowMaterial, [(ember % 2 ? 1 : -1) * ember * 0.08, (ember - 1.5) * 0.06, -ember * 0.24]);
      mote.rotation.z = ember * 0.38;
    }
    const projectileOrigin = new THREE.Group();
    projectileOrigin.name = `${prefix}-projectile-origin`;
    projectileOrigin.position.set(0, 0.14, -1.45);
    projectileOrigin.visible = false;
    head.add(projectileOrigin);
    if (dragonType === "steel") {
      rigBox(projectileOrigin, "loaded-metal-spear-shaft", [0.12, 0.12, 2.25], metalMaterial, [0, 0, -1.06]);
      rigBox(projectileOrigin, "loaded-metal-spear-head", [0.38, 0.38, 0.68], glowMaterial, [0, 0, -2.45], [0, Math.PI / 4, 0]);
      for (const side of [-1, 1]) rigBox(projectileOrigin, `${side < 0 ? "left" : "right"}-spear-fin`, [0.34, 0.08, 0.42], accentMaterial, [side * 0.18, 0, -0.22], [0, 0, side * 0.35]);
    } else {
      rigBox(projectileOrigin, `${dragonType}-projectile-core`, [0.48, 0.48, 0.48], glowMaterial, [0, 0, -0.25], [0, Math.PI / 4, Math.PI / 4]);
      for (let trail = 0; trail < 3; trail += 1) rigBox(projectileOrigin, `${dragonType}-projectile-trail-${trail + 1}`, [0.15, 0.15, 0.38 + trail * 0.14], trail % 2 ? accentMaterial : glowMaterial, [0, 0, 0.15 + trail * 0.28]);
    }

    for (const side of [-1, 1]) {
      const sideName = side < 0 ? "left" : "right";
      const eye = pivot(head, `${sideName}-eye`, [side * (headWidth * 0.3), 0.16, -1.13]);
      rigBox(eye, `${sideName}-eye`, [0.21, 0.18, 0.09], eyeMaterial, [0, 0, -0.02]);
      rigBox(eye, `${sideName}-eye-glint`, [0.055, 0.055, 0.035], glowMaterial, [side * -0.035, 0.035, -0.075]);
      const nostril = rigBox(head, `${sideName}-nostril`, [0.12, 0.08, 0.055], darkMaterial, [side * (headWidth * 0.19), -0.08, -1.88]);
      nostril.userData.breathSource = true;
    }

    const maleHorns = new THREE.Group();
    maleHorns.name = `${prefix}-male-horn-rack`;
    maleHorns.visible = group.userData.dragonSex === "male";
    head.add(maleHorns);
    const femaleHorns = new THREE.Group();
    femaleHorns.name = `${prefix}-female-horn-rack`;
    femaleHorns.visible = group.userData.dragonSex === "female";
    head.add(femaleHorns);
    for (const side of [-1, 1]) {
      const sideName = side < 0 ? "left" : "right";
      rigBox(maleHorns, `${sideName}-straight-horn`, [0.24, 0.24, 1.25], hornMaterial, [side * 0.55, 0.43, 0.18], [-0.55, side * 0.12, side * 0.06]);
      const outer = rigBox(femaleHorns, `${sideName}-curved-horn-outer`, [0.22, 0.22, 0.92], hornMaterial, [side * 0.58, 0.34, 0.08], [-0.5, side * 0.42, side * 0.18]);
      rigBox(femaleHorns, `${sideName}-curved-horn-tip`, [0.18, 0.18, 0.62], hornMaterial, [side * 0.86, 0.62, 0.37], [-0.82, side * -0.2, side * -0.18]);
      outer.userData.sexMarker = "female";
      if (dragonType === "ice") rigBox(head, `${sideName}-ice-crown-horn`, [0.18, 0.48, 0.18], hornMaterial, [side * 0.27, 0.77, -0.42], [0, 0, side * -0.18]);
    }

    for (const side of [-1, 1]) {
      const sideName = side < 0 ? "left" : "right";
      const wingRoot = pivot(visual, `${sideName}-wing-root`, [side * 0.82, 2.42, -0.55]);
      wingRoot.userData.side = side;
      wingRoot.userData.phase = side < 0 ? 0 : Math.PI;
      parts.wings.push(wingRoot);
      rigBox(wingRoot, `${sideName}-wing-upper-bone`, [2.55, 0.25, 0.32], hornMaterial, [side * 1.18, 0, 0], [0, 0, side * -0.08]);
      const wingForearm = pivot(wingRoot, `${sideName}-wing-forearm`, [side * 2.36, 0, 0]);
      rigBox(wingForearm, `${sideName}-wing-forearm-bone`, [2.75, 0.22, 0.3], hornMaterial, [side * 1.3, 0, 0.18], [0, -side * 0.08, side * -0.16]);
      rigBox(wingRoot, `${sideName}-inner-wing-membrane`, [2.38, 0.055, 2.85], membraneMaterial, [side * 1.05, -0.08, 1.02], [0.04, side * 0.1, side * -0.1]);
      rigBox(wingForearm, `${sideName}-outer-wing-membrane`, [2.7, 0.05, 2.25], membraneMaterial, [side * 1.18, -0.07, 0.92], [0.03, side * -0.13, side * -0.16]);
      for (let finger = 0; finger < 3; finger += 1) {
        rigBox(wingForearm, `${sideName}-wing-finger-${finger + 1}`, [2.45 - finger * 0.25, 0.1, 0.12], hornMaterial, [side * (1.06 - finger * 0.08), -0.04, 0.35 + finger * 0.74], [0, side * (0.18 + finger * 0.13), side * -0.15]);
      }
      for (let spot = 0; spot < 4; spot += 1) {
        const mark = rigBox(wingRoot, `${sideName}-wing-mark-${spot + 1}`, [0.34 + spot * 0.06, 0.07, 0.34 + spot * 0.06], glowMaterial, [side * (0.68 + spot * 0.45), -0.12, 0.35 + spot * 0.42], [0, 0, Math.PI / 4]);
        mark.userData.sexMarker = "male";
        mark.visible = group.userData.dragonSex === "male";
      }
    }
    const maleMarkings = new THREE.Group();
    maleMarkings.name = `${prefix}-male-wing-markings`;
    maleMarkings.visible = group.userData.dragonSex === "male";
    visual.add(maleMarkings);

    for (const [front, z] of [[true, -0.92], [false, 1.12]] as const) {
      for (const side of [-1, 1]) {
        const sideName = side < 0 ? "left" : "right";
        const positionName = `${front ? "front" : "rear"}-${sideName}`;
        const hip = pivot(visual, `${positionName}-hip`, [side * 0.68, 1.7, z]);
        hip.userData.phase = (side < 0) !== front ? 0 : Math.PI;
        parts.legs.push(hip);
        rigBox(hip, `${positionName}-upper-leg`, [0.52, 0.95, 0.62], bodyMaterial, [0, -0.43, front ? -0.08 : 0.08], [front ? -0.1 : 0.1, 0, side * 0.05]);
        const knee = pivot(hip, `${positionName}-knee`, [0, -0.82, front ? -0.12 : 0.14]);
        rigBox(knee, `${positionName}-lower-leg`, [0.4, 0.86, 0.45], accentMaterial, [0, -0.4, 0.02], [front ? 0.08 : -0.08, 0, 0]);
        const claw = pivot(knee, `${positionName}-claw`, [0, -0.77, -0.08]);
        rigBox(claw, `${positionName}-foot`, [0.65, 0.24, 0.8], bellyMaterial, [0, -0.04, -0.25]);
        for (let toe = -1; toe <= 1; toe += 1) rigBox(claw, `${positionName}-talon-${toe + 2}`, [0.12, 0.12, 0.58], hornMaterial, [toe * 0.19, -0.08, -0.76], [0.08, toe * -0.12, 0]);
      }
    }

    let tailParent: THREE.Object3D = visual;
    for (let segment = 1; segment <= DRAGON_MODEL_CONTRACT.tailSegments; segment += 1) {
      const tail = pivot(tailParent, `tail-${segment}`, segment === 1 ? [0, 1.9, 1.45] : [0, -0.015, 0.92]);
      const width = 1.42 - segment * 0.15;
      rigBox(tail, `tail-${segment}`, [Math.max(0.28, width), Math.max(0.3, width * 0.67), 1.18], segment % 2 ? bodyMaterial : accentMaterial, [0, 0, 0.47]);
      if (segment < 6) rigBox(tail, `tail-${segment}-spine`, [0.13, Math.max(0.18, 0.5 - segment * 0.055), 0.22], accentMaterial, [0, Math.max(0.23, width * 0.44), 0.4]);
      tailParent = tail;
    }
    if (dragonType === "ice") {
      rigBox(tailParent, "ice-tail-fin-left", [1.65, 0.08, 1.28], membraneMaterial, [-0.68, 0.05, 0.62], [0, 0.48, 0.16]);
      rigBox(tailParent, "ice-tail-fin-right", [1.65, 0.08, 1.28], membraneMaterial, [0.68, 0.05, 0.62], [0, -0.48, -0.16]);
    } else if (dragonType === "fire") {
      for (let flame = 0; flame < 3; flame += 1) rigBox(tailParent, `tail-flame-${flame + 1}`, [0.22 + flame * 0.12, 0.52 - flame * 0.08, 0.38], glowMaterial, [(flame - 1) * 0.18, 0.25 + flame * 0.05, 0.72 + flame * 0.22], [0, 0, (flame - 1) * 0.28]);
    } else {
      rigBox(tailParent, "steel-tail-hammer", [1.18, 0.72, 0.9], metalMaterial, [0, 0, 0.75], [0, Math.PI / 4, 0]);
    }

    const saddle = attachment("saddle");
    rigBox(saddle, "saddle-seat", [1.42, 0.34, 1.35], leatherMaterial, [0, 2.64, 0.2]);
    rigBox(saddle, "saddle-pommel", [1.15, 0.48, 0.18], cargoBandMaterial, [0, 2.9, -0.42]);
    for (const side of [-1, 1]) rigBox(saddle, `${side < 0 ? "left" : "right"}-saddle-strap`, [0.12, 1.15, 1.1], leatherMaterial, [side * 0.78, 2.05, 0.22], [0, 0, side * 0.1]);

    for (const side of [-1, 1]) {
      const sideName = side < 0 ? "left" : "right";
      const cargo = attachment(`${sideName}-cargo`);
      rigBox(cargo, `${sideName}-cargo-chest`, [0.85, 0.82, 1.15], cargoMaterial, [side * 1.19, 1.82, 0.72]);
      rigBox(cargo, `${sideName}-cargo-lid`, [0.9, 0.16, 1.19], cargoBandMaterial, [side * 1.19, 2.28, 0.72]);
      rigBox(cargo, `${sideName}-cargo-latch`, [0.13, 0.26, 0.09], metalMaterial, [side * 1.65, 2.02, 0.15]);
    }

    const headArmor = attachment("head-armor", head);
    rigBox(headArmor, "head-armor-crown", [1.78, 0.25, 1.05], armorMaterial, [0, 0.53, -0.42]);
    rigBox(headArmor, "head-armor-brow", [1.82, 0.35, 0.28], metalMaterial, [0, 0.23, -0.94]);
    const neckArmor = attachment("neck-armor", neckParent);
    for (let plate = 0; plate < 3; plate += 1) rigBox(neckArmor, `neck-armor-plate-${plate + 1}`, [1.08 - plate * 0.1, 0.2, 0.5], armorMaterial, [0, 0.48 + plate * 0.03, -0.22 - plate * 0.28], [-0.05, 0, 0]);
    const bodyArmor = attachment("body-armor");
    rigBox(bodyArmor, "body-armor-main", [2.05, 0.28, 2.72], armorMaterial, [0, 2.64, 0.18]);
    for (const side of [-1, 1]) rigBox(bodyArmor, `${side < 0 ? "left" : "right"}-body-armor-flank`, [0.25, 1.1, 2.38], metalMaterial, [side * 1.02, 1.92, 0.25], [0, 0, side * 0.08]);
    const tailArmor = attachment("tail-armor");
    for (let plate = 0; plate < 4; plate += 1) rigBox(tailArmor, `tail-armor-plate-${plate + 1}`, [1.26 - plate * 0.17, 0.22, 0.82], armorMaterial, [0, 2.48 - plate * 0.06, 1.85 + plate * 0.82], [0.03 * plate, 0, 0]);

    applyDragonPose(group, { timeSeconds: 0.42, mode: "idle", movement: 0, sex: group.userData.dragonSex });
  };

  const atlantianNpc = kind.startsWith("atlantian-");
  const sugarcourtNpc = kind.startsWith("sugarcourt-");
  const sentientNpc = kind.startsWith("hobbit-") || kind.startsWith("goblin-") || atlantianNpc || sugarcourtNpc;
  const buildAtlantianNpc = () => {
    const prefix = kind;
    const skin = material(0x4e9eaa);
    const skinShade = material(0x2c697c);
    const fin = material(0x76d9cc, false, 0.88);
    const pearl = material(0xe7fff5, true);
    const coral = material(0xe08a7e);
    const reefMetal = material(0x82b6bd);
    const darkReef = material(0x294555);
    const glow = material(0x63efda, true, 0.92);

    add(visual, [0.58, 0.76, 0.38], bodyMaterial, [0, 0.93, 0], "body", `${prefix}-current-tunic`);
    add(visual, [0.64, 0.18, 0.42], accentMaterial, [0, 0.6, 0], undefined, `${prefix}-waist-sash`);
    add(visual, [0.52, 0.54, 0.48], skin, [0, 1.54, -0.04], "head", `${prefix}-head`);
    add(visual, [0.28, 0.16, 0.23], skinShade, [0, 1.45, -0.35], undefined, `${prefix}-muzzle`);
    eyePair(0.155, 1.62, -0.295, 0.075, prefix);
    add(visual, [0.19, 0.045, 0.035], darkReef, [0, 1.37, -0.305], undefined, `${prefix}-mouth`);
    for (const side of [-1, 1]) {
      const sideName = side < 0 ? "left" : "right";
      for (let slit = 0; slit < 3; slit += 1) {
        const gill = add(visual, [0.13, 0.025, 0.12], coral, [side * 0.29, 1.44 + slit * 0.075, -0.05], undefined, `${prefix}-${sideName}-gill-${slit + 1}`);
        gill.rotation.z = side * -0.18;
      }
      const earFin = add(visual, [0.28, 0.32, 0.045], fin, [side * 0.37, 1.59, -0.02], undefined, `${prefix}-${sideName}-ear-fin`);
      earFin.rotation.z = side * -0.35;
      const arm = pivotBox([0.17, 0.68, 0.18], skin, [side * 0.39, 1.17, 0], [0, -0.34, 0], "arms", `${prefix}-${sideName}-arm`);
      arm.userData.side = side;
      arm.userData.phase = side < 0 ? 0 : Math.PI;
      add(arm, [0.21, 0.2, 0.21], skinShade, [0, -0.72, -0.02], undefined, `${prefix}-${sideName}-webbed-hand`);
      const leg = pivotBox([0.2, 0.76, 0.22], accentMaterial, [side * 0.17, 0.56, 0.03], [0, -0.38, 0], "legs", `${prefix}-${sideName}-leg`);
      leg.userData.phase = side < 0 ? 0 : Math.PI;
      const footFin = add(leg, [0.34, 0.1, 0.46], fin, [0, -0.8, -0.12], undefined, `${prefix}-${sideName}-foot-fin`);
      footFin.rotation.y = side * -0.08;
    }
    for (let ridge = 0; ridge < 4; ridge += 1) {
      const crest = add(visual, [0.1, 0.24 + ridge * 0.025, 0.12], fin, [0, 1.82 + ridge * 0.06, -0.01 + ridge * 0.12], undefined, `${prefix}-crown-fin-${ridge + 1}`);
      crest.rotation.x = -0.12 + ridge * 0.05;
    }
    add(visual, [0.18, 0.42, 0.3], fin, [0, 0.83, 0.31], undefined, `${prefix}-back-fin`).rotation.x = -0.18;

    if (kind === "atlantian-tidewarden") {
      add(visual, [0.62, 0.1, 0.5], reefMetal, [0, 1.86, -0.01], undefined, `${prefix}-shell-circlet`);
      for (const side of [-1, 0, 1]) add(visual, [0.12, 0.22 + (side === 0 ? 0.12 : 0), 0.1], pearl, [side * 0.2, 2.01, -0.03], undefined, `${prefix}-crown-pearl-${side + 2}`);
      add(visual, [0.14, 0.82, 0.06], coral, [-0.15, 1.02, -0.22], undefined, `${prefix}-tidewarden-sash`).rotation.z = -0.28;
    } else if (kind === "atlantian-kelpkeeper") {
      add(visual, [0.56, 0.46, 0.18], material(0x56724c), [0, 0.95, 0.28], undefined, `${prefix}-woven-kelp-basket`);
      for (let frond = 0; frond < 3; frond += 1) add(visual, [0.07, 0.44, 0.08], material(0x76b968), [-0.18 + frond * 0.18, 1.33, 0.32], undefined, `${prefix}-kelp-frond-${frond + 1}`).rotation.z = (frond - 1) * 0.16;
    } else if (kind === "atlantian-coralwright") {
      add(visual, [0.54, 0.16, 0.44], reefMetal, [0, 1.86, 0], undefined, `${prefix}-wright-browguard`);
      add(visual, [0.1, 0.1, 0.92], material(0x6f5038), [0.26, 1.0, -0.48], undefined, `${prefix}-coral-hammer-handle`);
      add(visual, [0.48, 0.26, 0.24], coral, [0.26, 1.0, -0.98], undefined, `${prefix}-coral-hammer-head`);
    } else if (kind === "atlantian-pearlbroker") {
      add(visual, [0.5, 0.46, 0.19], material(0x6a5d84), [0, 0.96, 0.29], undefined, `${prefix}-shell-ledger-pack`);
      for (let bead = 0; bead < 5; bead += 1) add(visual, [0.1, 0.1, 0.1], pearl, [-0.24 + bead * 0.12, 1.2 - Math.abs(2 - bead) * 0.06, -0.23], undefined, `${prefix}-pearl-chain-${bead + 1}`);
    } else if (kind === "atlantian-glowmender") {
      add(visual, [0.48, 0.5, 0.21], darkReef, [0, 0.98, 0.3], undefined, `${prefix}-remedy-pack`);
      for (const [index, x, color] of [[1, -0.15, 0x68f0d7], [2, 0, 0x94b6ff], [3, 0.15, 0xd77cff]] as Array<[number, number, number]>) {
        add(visual, [0.11, 0.26, 0.11], material(color, true, 0.88), [x, 1.05, 0.44], undefined, `${prefix}-glow-vial-${index}`);
      }
      add(visual, [0.11, 0.11, 1.4], reefMetal, [-0.27, 1.1, -0.72], undefined, `${prefix}-mending-staff`);
      add(visual, [0.3, 0.3, 0.3], glow, [-0.27, 1.1, -1.49], undefined, `${prefix}-mending-light`).rotation.y = Math.PI / 4;
    } else if (kind === "atlantian-trident-guard") {
      add(visual, [0.64, 0.16, 0.52], reefMetal, [0, 1.89, 0], undefined, `${prefix}-guard-helm`);
      add(visual, [...ATLANTIAN_TRIDENT_CONTRACT.shaftSize], material(0x78927d), [0.25, 1.05, -0.88], undefined, `${prefix}-trident-shaft`);
      for (const side of [-1, 0, 1]) {
        add(visual, [...ATLANTIAN_TRIDENT_CONTRACT.pointSize], reefMetal, [0.25 + side * 0.18, 1.05, ATLANTIAN_TRIDENT_CONTRACT.centerPointForward + (side === 0 ? -0.08 : 0)], undefined, `${prefix}-trident-point-${side + 2}`);
      }
      add(visual, [0.5, 0.24, 0.08], fin, [0.25, 1.2, -1.7], undefined, `${prefix}-trident-streamer`);
    }
  };
  const buildSugarcourtNpc = () => {
    const prefix = kind;
    const candySkin = material(0xf0b5c9, false, 0.94);
    const candyShade = material(0xc77f9a);
    const cream = material(0xffe8ca);
    const cocoa = material(0x4b3040);
    const mint = material(0x7ad4b1);
    const gold = material(0xf2c65d, true);
    const copper = material(0xa96845);
    const glass = material(0xffc5df, true, 0.82);

    add(visual, [0.58, 0.66, 0.42], bodyMaterial, [0, 0.52, 0], "body", `${prefix}-sugarcoat`);
    add(visual, [0.64, 0.18, 0.46], accentMaterial, [0, 0.25, 0.02], undefined, `${prefix}-fondant-coat-skirt`);
    add(visual, [0.63, 0.09, 0.47], cocoa, [0, 0.47, 0], undefined, `${prefix}-wafer-belt`);
    add(visual, [0.14, 0.15, 0.07], gold, [0, 0.47, -0.255], undefined, `${prefix}-sugarcourt-seal`);
    add(visual, [0.54, 0.5, 0.48], candySkin, [0, 1.08, -0.03], "head", `${prefix}-glazed-head`);
    add(visual, [0.28, 0.17, 0.22], candyShade, [0, 0.99, -0.34], undefined, `${prefix}-candy-nose`);
    eyePair(0.16, 1.16, -0.29, 0.068, prefix);
    add(visual, [0.2, 0.045, 0.035], cocoa, [0, 0.91, -0.295], undefined, `${prefix}-mouth`);
    add(visual, [0.52, 0.15, 0.43], cream, [0, 1.33, 0], undefined, `${prefix}-icing-cap`);
    for (const side of [-1, 1]) {
      const sideName = side < 0 ? "left" : "right";
      add(visual, [0.16, 0.2, 0.1], candySkin, [side * 0.31, 1.08, -0.01], undefined, `${prefix}-${sideName}-candy-ear`);
      add(visual, [0.11, 0.2, 0.11], glass, [side * 0.2, 1.42, -0.02], undefined, `${prefix}-${sideName}-sugar-curl`).rotation.z = side * -0.24;
      const leg = pivotBox([0.2, 0.48, 0.22], accentMaterial, [side * 0.17, 0.22, 0.02], [0, -0.24, 0], "legs", `${prefix}-${sideName}-leg`);
      leg.userData.phase = side < 0 ? 0 : Math.PI;
      add(leg, [0.31, 0.14, 0.4], cocoa, [0, -0.51, -0.08], undefined, `${prefix}-${sideName}-wafer-boot`);
      const arm = pivotBox([0.17, 0.56, 0.18], bodyMaterial, [side * 0.38, 0.82, 0], [0, -0.28, 0], "arms", `${prefix}-${sideName}-arm`);
      arm.userData.side = side;
      arm.userData.phase = side < 0 ? 0 : Math.PI;
      add(arm, [0.2, 0.2, 0.2], candySkin, [0, -0.61, 0], undefined, `${prefix}-${sideName}-hand`);
    }

    const rightArm = parts.arms.at(-1);
    const leftArm = parts.arms.at(-2);
    const readyHands = () => {
      if (rightArm) rightArm.rotation.x = 1.02;
      if (leftArm) leftArm.rotation.x = 0.88;
    };
    if (kind === "sugarcourt-crown-confectioner") {
      add(visual, [0.62, 0.1, 0.5], gold, [0, 1.43, 0], undefined, `${prefix}-spun-sugar-crown-band`);
      for (const side of [-1, 0, 1]) add(visual, [0.11, 0.28 + (side === 0 ? 0.12 : 0), 0.1], glass, [side * 0.2, 1.6, 0], undefined, `${prefix}-crown-spire-${side + 2}`);
      add(visual, [0.14, 0.72, 0.06], gold, [-0.13, 0.72, -0.24], undefined, `${prefix}-mayoral-ribbon`).rotation.z = -0.3;
      add(visual, [0.4, 0.33, 0.08], cocoa, [0.28, 0.48, -0.28], undefined, `${prefix}-borough-ledger`);
    } else if (kind === "sugarcourt-brittle-guard") {
      readyHands();
      add(visual, [0.64, 0.16, 0.5], cream, [0, 1.41, 0], undefined, `${prefix}-brittle-helm`);
      add(visual, [0.1, 0.1, 1.72], material(0xf4f0dd), [0.25, 0.72, -0.84], undefined, `${prefix}-peppermint-pike-shaft`);
      for (let stripe = 0; stripe < 4; stripe += 1) add(visual, [0.115, 0.115, 0.18], material(stripe % 2 ? 0xef5364 : 0xfff7e8), [0.25, 0.72, -0.22 - stripe * 0.38], undefined, `${prefix}-pike-stripe-${stripe + 1}`);
      add(visual, [0.18, 0.2, 0.42], mint, [0.25, 0.72, -1.82], undefined, `${prefix}-peppermint-pike-head`);
      add(visual, [0.5, 0.34, 0.08], cream, [0, 0.67, -0.25], undefined, `${prefix}-sugarplate-breast`);
    } else if (kind === "sugarcourt-gumdrop-gardener") {
      add(visual, [0.48, 0.52, 0.05], cream, [0, 0.53, -0.235], undefined, `${prefix}-garden-apron`);
      add(visual, [0.78, 0.09, 0.66], mint, [0, 1.39, 0], undefined, `${prefix}-leaf-hat-brim`);
      add(visual, [0.42, 0.22, 0.38], accentMaterial, [0, 1.51, 0.02], undefined, `${prefix}-gumdrop-hat-crown`);
      add(visual, [0.46, 0.38, 0.2], cocoa, [0, 0.58, 0.31], undefined, `${prefix}-gumdrop-basket`);
      for (let drop = 0; drop < 3; drop += 1) add(visual, [0.14, 0.16, 0.14], material([0xef6ea8, 0x72d2b2, 0xf0c55e][drop]), [-0.16 + drop * 0.16, 0.7, 0.42], undefined, `${prefix}-basket-gumdrop-${drop + 1}`);
    } else if (kind === "sugarcourt-sweetbroker") {
      add(visual, [0.5, 0.48, 0.06], cream, [0, 0.55, -0.235], undefined, `${prefix}-broker-waistcoat`);
      add(visual, [0.46, 0.35, 0.08], cocoa, [-0.27, 0.55, -0.28], undefined, `${prefix}-striped-ledger`);
      add(visual, [0.08, 0.7, 0.08], gold, [0.28, 0.65, -0.16], undefined, `${prefix}-scale-post`);
      add(visual, [0.54, 0.06, 0.12], gold, [0.28, 0.92, -0.16], undefined, `${prefix}-scale-beam`);
      for (const side of [-1, 1]) add(visual, [0.2, 0.07, 0.2], mint, [0.28 + side * 0.2, 0.72, -0.16], undefined, `${prefix}-${side < 0 ? "left" : "right"}-scale-pan`);
    } else if (kind === "sugarcourt-kennelkeeper") {
      add(visual, [0.5, 0.5, 0.05], mint, [0, 0.54, -0.235], undefined, `${prefix}-kennel-apron`);
      add(visual, [0.18, 0.18, 0.08], gold, [0, 0.67, -0.275], undefined, `${prefix}-paw-badge`);
      add(visual, [0.42, 0.26, 0.18], cocoa, [0.25, 0.45, 0.29], undefined, `${prefix}-treat-pouch`);
      for (const side of [-1, 1]) {
        const loop = add(visual, [0.055, 0.68, 0.055], material(side < 0 ? 0xd96f9f : 0x8c573e), [side * 0.23, 0.59, 0.31], undefined, `${prefix}-${side < 0 ? "hound" : "cat"}-lead-loop`);
        loop.rotation.z = side * 0.4;
      }
    } else if (kind === "sugarcourt-sugarboiler") {
      add(visual, [0.5, 0.52, 0.06], cream, [0, 0.54, -0.235], undefined, `${prefix}-boiler-apron`);
      add(visual, [0.5, 0.4, 0.25], copper, [0, 0.57, 0.34], undefined, `${prefix}-copper-kettle-pack`);
      add(visual, [0.34, 0.1, 0.28], material(0xb96835, true, 0.82), [0, 0.8, 0.36], undefined, `${prefix}-syrup-window`);
      add(visual, [0.08, 0.08, 0.96], copper, [0.28, 0.62, -0.36], undefined, `${prefix}-sugar-ladle-handle`);
      add(visual, [0.3, 0.12, 0.28], gold, [0.28, 0.62, -0.88], undefined, `${prefix}-sugar-ladle-bowl`);
    } else if (kind === "sugarcourt-candysmith") {
      readyHands();
      add(visual, [0.5, 0.54, 0.06], cocoa, [0, 0.55, -0.235], undefined, `${prefix}-smith-apron`);
      add(visual, [0.1, 0.1, 1.0], copper, [0.25, 0.69, -0.5], undefined, `${prefix}-candy-hammer-handle`);
      add(visual, [0.58, 0.3, 0.28], material(0xd76f9f), [0.25, 0.69, -1.05], undefined, `${prefix}-candy-hammer-head`);
      add(visual, [0.17, 0.17, 0.08], mint, [-0.15, 1.17, -0.29], undefined, `${prefix}-goggle-left`);
      add(visual, [0.17, 0.17, 0.08], mint, [0.15, 1.17, -0.29], undefined, `${prefix}-goggle-right`);
    }
  };
  const buildSentientNpc = () => {
    if (atlantianNpc) {
      buildAtlantianNpc();
      return;
    }
    if (sugarcourtNpc) {
      buildSugarcourtNpc();
      return;
    }
    const hobbit = kind.startsWith("hobbit-");
    const prefix = kind;
    const skin = material(hobbit ? 0xc9916c : 0x78924e);
    const skinShade = material(hobbit ? 0xa96e52 : 0x526b3b);
    const hair = material(hobbit ? 0x5b3827 : 0x342b26);
    const leather = material(0x5a3d2a);
    const spearWood = material(0x9b6a39);
    const metal = material(hobbit ? 0x8a8f86 : 0x727b72);
    const cloth = bodyMaterial;
    const trim = accentMaterial;
    const baseY = hobbit ? 0 : 0.05;
    const bodyWidth = hobbit ? 0.62 : 0.52;
    const bodyHeight = hobbit ? 0.62 : 0.72;
    const shoulderY = baseY + (hobbit ? 0.74 : 0.88);
    const headY = baseY + (hobbit ? 1.05 : 1.2);
    const legLength = hobbit ? 0.48 : 0.6;

    add(visual, [bodyWidth, bodyHeight, 0.42], cloth, [0, baseY + 0.56, 0], "body", `${prefix}-tunic`);
    add(visual, [bodyWidth + 0.05, 0.18, 0.46], trim, [0, baseY + 0.35, 0.01], undefined, `${prefix}-coat-skirt`);
    add(visual, [bodyWidth + 0.08, 0.09, 0.47], leather, [0, baseY + 0.51, 0], undefined, `${prefix}-belt`);
    add(visual, [0.12, 0.14, 0.06], metal, [0, baseY + 0.51, -0.255], undefined, `${prefix}-belt-buckle`);

    const headWidth = hobbit ? 0.56 : 0.5;
    add(visual, [headWidth, hobbit ? 0.48 : 0.52, hobbit ? 0.48 : 0.46], skin, [0, headY, -0.03], "head", `${prefix}-head`);
    add(visual, [hobbit ? 0.26 : 0.34, hobbit ? 0.17 : 0.23, 0.22], skinShade, [0, headY - 0.08, -0.34], undefined, `${prefix}-nose`);
    eyePair(hobbit ? 0.16 : 0.15, headY + 0.08, -0.285, hobbit ? 0.062 : 0.068, prefix);
    add(visual, [0.2, 0.045, 0.035], material(hobbit ? 0x6b3d35 : 0x3a2e28), [0, headY - 0.17, -0.292], undefined, `${prefix}-mouth`);

    if (hobbit) {
      add(visual, [0.54, 0.16, 0.45], hair, [0, headY + 0.24, 0.01], undefined, `${prefix}-curly-hair-cap`);
      for (const side of [-1, 1]) {
        add(visual, [0.15, 0.17, 0.15], hair, [side * 0.27, headY + 0.1, 0.03], undefined, `${prefix}-${side < 0 ? "left" : "right"}-curl`);
        add(visual, [0.16, 0.17, 0.08], skin, [side * 0.32, headY, -0.01], undefined, `${prefix}-${side < 0 ? "left" : "right"}-ear`);
      }
    } else {
      for (const side of [-1, 1]) {
        const ear = add(visual, [0.36, 0.13, 0.24], skin, [side * 0.37, headY + 0.03, -0.02], undefined, `${prefix}-${side < 0 ? "left" : "right"}-pointed-ear`);
        ear.rotation.z = side * -0.22;
        add(visual, [0.08, 0.13, 0.05], material(0xe9d2a4), [side * 0.12, headY - 0.13, -0.31], undefined, `${prefix}-${side < 0 ? "left" : "right"}-tusk`).rotation.z = side * 0.18;
      }
      add(visual, [0.45, 0.12, 0.38], hair, [0, headY + 0.29, 0.03], undefined, `${prefix}-scalp`);
    }

    for (const side of [-1, 1]) {
      const sideName = side < 0 ? "left" : "right";
      const leg = pivotBox([0.2, legLength, 0.22], trim, [side * (hobbit ? 0.18 : 0.15), baseY + 0.28, 0.01], [0, -legLength / 2, 0], "legs", `${prefix}-${sideName}-leg`);
      leg.userData.phase = side < 0 ? 0 : Math.PI;
      add(leg, [hobbit ? 0.34 : 0.26, 0.16, hobbit ? 0.48 : 0.36], hobbit ? skin : leather, [0, -legLength - 0.03, -0.1], undefined, `${prefix}-${sideName}-${hobbit ? "broad-foot" : "boot"}`);
      const arm = pivotBox([0.16, hobbit ? 0.54 : 0.62, 0.18], cloth, [side * (bodyWidth / 2 + 0.08), shoulderY, 0], [0, -(hobbit ? 0.27 : 0.31), 0], "arms", `${prefix}-${sideName}-arm`);
      arm.userData.side = side;
      arm.userData.phase = side < 0 ? 0 : Math.PI;
      add(arm, [0.2, 0.2, 0.2], skin, [0, -(hobbit ? 0.59 : 0.67), 0], undefined, `${prefix}-${sideName}-hand`);
    }

    const rightArm = parts.arms.at(-1);
    const leftArm = parts.arms.at(-2);
    const readyHands = () => {
      if (rightArm) rightArm.rotation.x = 1.02;
      if (leftArm) leftArm.rotation.x = 0.88;
    };
    const addForwardHammer = () => {
      readyHands();
      add(visual, [...FACTION_WEAPON_CONTRACTS.hammer.handleSize], leather, [0.27, baseY + 0.68, -0.56], undefined, `${prefix}-hammer-handle`);
      add(visual, [...FACTION_WEAPON_CONTRACTS.hammer.headSize], metal, [0.27, baseY + 0.68, FACTION_WEAPON_CONTRACTS.hammer.headForward], undefined, `${prefix}-hammer-head`);
      add(visual, [0.18, 0.38, 0.22], trim, [0.27, baseY + 0.68, -1.17], undefined, `${prefix}-hammer-center`);
    };
    const addForwardCrossbow = () => {
      readyHands();
      add(visual, [...FACTION_WEAPON_CONTRACTS.crossbow.stockSize], leather, [0, baseY + 0.69, -0.57], undefined, `${prefix}-crossbow-stock`);
      add(visual, [...FACTION_WEAPON_CONTRACTS.crossbow.lathSize], metal, [0, baseY + 0.7, -1.02], undefined, `${prefix}-crossbow-lath`);
      add(visual, [0.035, 0.64, 0.04], material(0xe7ddbf), [0, baseY + 0.7, -1.04], undefined, `${prefix}-crossbow-string`).rotation.z = Math.PI / 2;
      add(visual, [...FACTION_WEAPON_CONTRACTS.crossbow.boltSize], material(0xa98454), [0, baseY + 0.76, -0.76], undefined, `${prefix}-loaded-bolt`);
      add(visual, [0.2, 0.13, 0.22], metal, [0, baseY + 0.76, FACTION_WEAPON_CONTRACTS.crossbow.boltTipForward], undefined, `${prefix}-bolt-head`);
    };
    const addForwardSpear = () => {
      readyHands();
      add(visual, [...FACTION_WEAPON_CONTRACTS.spear.shaftSize], spearWood, [0.25, baseY + 0.77, -0.78], undefined, `${prefix}-spear-shaft`);
      add(visual, [...FACTION_WEAPON_CONTRACTS.spear.headSize], metal, [0.25, baseY + 0.77, FACTION_WEAPON_CONTRACTS.spear.headForward], undefined, `${prefix}-spear-head`);
      add(visual, [0.32, 0.2, 0.06], trim, [0.25, baseY + 0.91, -1.58], undefined, `${prefix}-spear-pennant`).rotation.z = -0.18;
    };
    const addForwardPick = () => {
      readyHands();
      add(visual, [0.09, 0.09, 1.05], leather, [0.24, baseY + 0.7, -0.5], undefined, `${prefix}-pick-handle`);
      add(visual, [0.68, 0.12, 0.18], metal, [0.24, baseY + 0.7, -1.05], undefined, `${prefix}-pick-head`);
    };

    if (kind === "hobbit-hammer-guard") {
      addForwardHammer();
      add(visual, [0.64, 0.12, 0.52], metal, [0, headY + 0.3, -0.01], undefined, `${prefix}-helmet-brim`);
      add(visual, [0.48, 0.28, 0.43], metal, [0, headY + 0.4, 0.01], undefined, `${prefix}-helmet-crown`);
    } else if (kind === "hobbit-crossbow-guard") {
      addForwardCrossbow();
      add(visual, [0.62, 0.38, 0.5], trim, [0, headY + 0.2, 0.05], undefined, `${prefix}-hood`);
    } else if (kind === "goblin-spear-guard") {
      addForwardSpear();
      add(visual, [0.55, 0.16, 0.48], metal, [0, headY + 0.28, 0], undefined, `${prefix}-helmet`);
      add(visual, [0.12, 0.42, 0.14], trim, [0, headY + 0.55, 0.04], undefined, `${prefix}-helmet-crest`).rotation.z = -0.25;
    } else if (kind === "hobbit-miner" || kind === "goblin-miner") {
      addForwardPick();
      add(visual, [0.58, 0.14, 0.5], metal, [0, headY + 0.28, 0], undefined, `${prefix}-miner-helmet`);
      add(visual, [0.16, 0.16, 0.1], material(0xffdb69, true), [0, headY + 0.3, -0.29], undefined, `${prefix}-helmet-lamp`);
    } else if (kind === "hobbit-farmer" || kind === "goblin-worker") {
      add(visual, [0.46, 0.5, 0.05], material(0xe5d3a4), [0, baseY + 0.52, -0.235], undefined, `${prefix}-work-apron`);
      if (hobbit) {
        add(visual, [0.84, 0.1, 0.7], material(0xd8b560), [0, headY + 0.3, 0], undefined, `${prefix}-straw-hat-brim`);
        add(visual, [0.46, 0.24, 0.42], material(0xc89c4c), [0, headY + 0.43, 0.03], undefined, `${prefix}-straw-hat-crown`);
      } else {
        add(visual, [0.5, 0.22, 0.18], leather, [0, baseY + 0.64, 0.29], undefined, `${prefix}-seed-pouch`);
      }
    } else if (kind === "hobbit-banker") {
      add(visual, [0.45, 0.5, 0.05], material(0xf1ead1), [0, baseY + 0.59, -0.235], undefined, `${prefix}-waistcoat-front`);
      add(visual, [0.4, 0.28, 0.08], material(0xd9b74e, true), [0.26, baseY + 0.47, -0.28], undefined, `${prefix}-gold-ledger`);
      add(visual, [0.15, 0.15, 0.08], metal, [-0.16, baseY + 0.78, -0.25], undefined, `${prefix}-spectacles-left`);
      add(visual, [0.15, 0.15, 0.08], metal, [0.16, baseY + 0.78, -0.25], undefined, `${prefix}-spectacles-right`);
    } else if (kind === "hobbit-merchant") {
      add(visual, [0.52, 0.5, 0.2], leather, [0, baseY + 0.57, 0.3], undefined, `${prefix}-merchant-pack`);
      add(visual, [0.34, 0.4, 0.05], material(0xe7d4aa), [-0.26, baseY + 0.63, -0.25], undefined, `${prefix}-price-ledger`);
    } else if (kind === "hobbit-mayor") {
      add(visual, [0.13, 0.75, 0.06], material(0xe2bf5b), [-0.14, baseY + 0.72, -0.24], undefined, `${prefix}-mayoral-sash`).rotation.z = -0.32;
      add(visual, [0.2, 0.2, 0.08], material(0xf0cf6a, true), [0.14, baseY + 0.64, -0.27], undefined, `${prefix}-town-seal`);
      add(visual, [0.44, 0.36, 0.08], leather, [0.27, baseY + 0.49, -0.28], undefined, `${prefix}-town-ledger`);
    } else if (kind === "goblin-chieftain") {
      addForwardSpear();
      add(visual, [0.64, 0.1, 0.54], metal, [0, headY + 0.29, 0], undefined, `${prefix}-key-crown`);
      for (const side of [-1, 0, 1]) add(visual, [0.08, 0.25 + (side === 0 ? 0.12 : 0), 0.08], metal, [side * 0.2, headY + 0.45, 0], undefined, `${prefix}-crown-key-${side + 2}`);
    } else if (kind === "goblin-alchemist") {
      add(visual, [0.46, 0.52, 0.22], leather, [0, baseY + 0.61, 0.31], undefined, `${prefix}-bottle-pack`);
      for (const [index, x, color] of [[1, -0.17, 0x7bdcc3], [2, 0, 0xe977b9], [3, 0.17, 0xf2c65b]] as Array<[number, number, number]>) {
        add(visual, [0.12, 0.25, 0.12], material(color, true, 0.86), [x, baseY + 0.7, 0.46], undefined, `${prefix}-bottle-${index}`);
      }
      add(visual, [0.18, 0.18, 0.08], metal, [-0.15, headY + 0.11, -0.28], undefined, `${prefix}-goggle-left`);
      add(visual, [0.18, 0.18, 0.08], metal, [0.15, headY + 0.11, -0.28], undefined, `${prefix}-goggle-right`);
    }
    if (hobbit) visual.scale.set(1.07, 0.84, 1.02);
  };

  if (kind === "fire-dragon" || kind === "ice-dragon" || kind === "steel-dragon") {
    buildDragon(kind);
  } else if (sentientNpc) {
    buildSentientNpc();
  } else if (kind === "mossling") {
    add(visual, [0.64, 0.44, 0.56], bodyMaterial, [0, 0.1, 0], "body", "mossling-body");
    add(visual, [0.42, 0.34, 0.36], accentMaterial, [0, 0.28, -0.34], "head", "mossling-head");
    add(visual, [0.08, 0.08, 0.04], eyeMaterial, [-0.12, 0.32, -0.53], undefined, "mossling-left-eye");
    add(visual, [0.08, 0.08, 0.04], eyeMaterial, [0.12, 0.32, -0.53], undefined, "mossling-right-eye");
    for (const [px, pz, phase, name] of [[-0.2, -0.05, 0, "left-root"], [0.2, -0.05, Math.PI, "right-root"]] as Array<[number, number, number, string]>) {
      const leg = pivotBox([0.16, 0.3, 0.16], darkMaterial, [px, -0.1, pz], [0, -0.15, 0], "legs", `mossling-${name}`);
      leg.userData.phase = phase;
    }
    for (const [px, py, pz, sx, sz, rotation, name] of [
      [-0.2, 0.49, -0.01, 0.28, 0.38, -0.18, "left-leaf"],
      [0.14, 0.54, 0.04, 0.3, 0.42, 0.2, "right-leaf"],
      [0.01, 0.5, -0.2, 0.21, 0.3, 0, "front-leaf"],
    ] as Array<[number, number, number, number, number, number, string]>) {
      const leaf = add(visual, [sx, 0.07, sz], accentMaterial, [px, py, pz], undefined, `mossling-${name}`);
      leaf.rotation.z = rotation;
    }
    const stem = add(visual, [0.05, 0.23, 0.05], darkMaterial, [-0.04, 0.64, 0.05], undefined, "mossling-sprout-stem");
    stem.rotation.z = -0.12;
    const bloomMaterial = material(0xf4c96a);
    add(visual, [0.15, 0.06, 0.15], bloomMaterial, [-0.06, 0.76, 0.05], undefined, "mossling-sprout-bloom").rotation.y = Math.PI / 4;
  } else if (kind === "ridgeback") {
    visual.position.y = RIDGEBACK_GROUND_LIFT;
    add(visual, [0.88, 0.62, 1.32], bodyMaterial, [0, 0.08, 0.05], "body", "ridgeback-body");
    add(visual, [0.64, 0.5, 0.62], accentMaterial, [0, 0.1, -0.8], "head", "ridgeback-head");
    add(visual, [0.48, 0.3, 0.38], darkMaterial, [0, -0.03, -1.18], undefined, "ridgeback-muzzle");
    add(visual, [0.07, 0.08, 0.04], eyeMaterial, [-0.19, 0.2, -1.13], undefined, "ridgeback-left-eye");
    add(visual, [0.07, 0.08, 0.04], eyeMaterial, [0.19, 0.2, -1.13], undefined, "ridgeback-right-eye");
    const boneMaterial = material(0xe8d8af);
    add(visual, [0.08, 0.1, 0.3], boneMaterial, [-0.27, -0.03, -1.35], undefined, "ridgeback-left-tusk");
    add(visual, [0.08, 0.1, 0.3], boneMaterial, [0.27, -0.03, -1.35], undefined, "ridgeback-right-tusk");
    // Body top is local Y=.39. Each plate starts exactly there, eliminating the
    // thin daylight gap the old fixed Y=.52 placement produced.
    for (let plate = 0; plate < 6; plate += 1) {
      const height = 0.18 + Math.sin(((plate + 1) / 7) * Math.PI) * 0.13;
      const ridge = add(
        visual,
        [0.38 - plate * 0.027, height, 0.15],
        darkMaterial,
        [0, 0.39 + height / 2, -0.48 + plate * 0.225],
        undefined,
        `ridgeback-plate-${plate + 1}`,
      );
      ridge.rotation.y = plate % 2 ? 0.035 : -0.035;
    }
    for (const [px, pz, phase, name] of [
      [-0.31, -0.38, 0, "front-left"], [0.31, -0.38, Math.PI, "front-right"],
      [-0.31, 0.42, Math.PI, "rear-left"], [0.31, 0.42, 0, "rear-right"],
    ] as Array<[number, number, number, string]>) {
      const leg = pivotBox([0.18, 0.48, 0.2], bodyMaterial, [px, -0.18, pz], [0, -0.24, 0], "legs", `ridgeback-${name}-leg`);
      leg.userData.phase = phase;
      add(leg, [0.21, 0.1, 0.23], darkMaterial, [0, -0.43, -0.015], undefined, `ridgeback-${name}-hoof`);
    }
    const tail = pivotBox([0.12, 0.12, 0.48], darkMaterial, [0, 0.24, 0.72], [0, 0, 0.24], "body", "ridgeback-tail");
    tail.rotation.x = 0.55;
  } else if (kind === "woolhorn") {
    add(visual, [1.02, 0.84, 1.05], bodyMaterial, [0, 0.12, 0.08], "body", "woolhorn-body");
    add(visual, [0.78, 0.18, 0.78], material(0xf3f0e6), [0, 0.54, 0.06], undefined, "woolhorn-back-fleece");
    add(visual, [0.58, 0.54, 0.5], accentMaterial, [0, 0.2, -0.67], "head", "woolhorn-head");
    add(visual, [0.38, 0.22, 0.2], darkMaterial, [0, 0.08, -0.96], undefined, "woolhorn-muzzle");
    add(visual, [0.08, 0.08, 0.04], eyeMaterial, [-0.18, 0.28, -0.93], undefined, "woolhorn-left-eye");
    add(visual, [0.08, 0.08, 0.04], eyeMaterial, [0.18, 0.28, -0.93], undefined, "woolhorn-right-eye");
    const hornMaterial = material(0x5b5247);
    for (const side of [-1, 1]) {
      const sideName = side < 0 ? "left" : "right";
      const hornSegments: Array<[number, number, number, number]> = [
        [0.36, 0.42, -0.67, 0.34], [0.5, 0.34, -0.74, 0.12], [0.51, 0.2, -0.82, -0.2], [0.43, 0.1, -0.89, -0.42],
      ];
      hornSegments.forEach(([x, y, z, rotation], index) => {
        const horn = add(visual, [0.17, 0.17, 0.3 - index * 0.035], hornMaterial, [side * x, y, z], undefined, `woolhorn-${sideName}-horn-${index + 1}`);
        horn.rotation.z = side * rotation;
      });
    }
    for (const [px, pz, phase, name] of [
      [-0.34, -0.3, 0, "front-left"], [0.34, -0.3, Math.PI, "front-right"],
      [-0.34, 0.34, Math.PI, "rear-left"], [0.34, 0.34, 0, "rear-right"],
    ] as Array<[number, number, number, string]>) {
      const leg = pivotBox([0.16, 0.48, 0.16], accentMaterial, [px, -0.2, pz], [0, -0.24, 0], "legs", `woolhorn-${name}-leg`);
      leg.userData.phase = phase;
      add(leg, [0.19, 0.1, 0.2], hornMaterial, [0, -0.5, -0.01], undefined, `woolhorn-${name}-hoof`);
    }
  } else if (kind === "glowmoth") {
    add(visual, [0.24, 0.22, 0.42], bodyMaterial, [0, 0, -0.02], "body", "glowmoth-body");
    add(visual, [0.2, 0.2, 0.22], darkMaterial, [0, 0.02, -0.31], "head", "glowmoth-head");
    add(visual, [0.16, 0.16, 0.2], material(0xffdb59, true), [0, 0, 0.28], undefined, "glowmoth-lantern");
    for (const side of [-1, 1]) for (const front of [-1, 1]) {
      const sideName = side < 0 ? "left" : "right";
      const sectionName = front < 0 ? "fore" : "hind";
      const wingMaterial = material(accentColor, false, 0.78);
      const wing = pivotBox(
        [0.56, 0.045, front < 0 ? 0.42 : 0.32],
        wingMaterial,
        [side * 0.12, 0.05, front * 0.12],
        [side * 0.28, 0, front * 0.05],
        "wings",
        `glowmoth-${sideName}-${sectionName}-wing`,
      );
      wing.userData.side = side;
      wing.userData.phase = front < 0 ? 0 : Math.PI;
      add(wing, [0.16, 0.052, 0.13], material(0xffe58a, true, 0.72), [side * 0.3, 0.012, front * 0.04], undefined, `glowmoth-${sideName}-${sectionName}-eyespot`);
    }
    for (const side of [-1, 1]) {
      const antenna = add(visual, [0.035, 0.035, 0.34], accentMaterial, [side * 0.08, 0.15, -0.43], undefined, `glowmoth-${side < 0 ? "left" : "right"}-antenna`);
      antenna.rotation.x = -0.55;
      antenna.rotation.z = side * 0.18;
      add(visual, [0.07, 0.07, 0.07], material(0xffef9c, true), [side * 0.1, 0.24, -0.57], undefined, `glowmoth-${side < 0 ? "left" : "right"}-antenna-tip`);
    }
  } else if (kind === "shadecrawler") {
    add(visual, [0.86, 0.34, 0.9], bodyMaterial, [0, 0, 0.24], "body", "shadecrawler-abdomen");
    add(visual, [0.5, 0.1, 0.62], darkMaterial, [0, 0.2, 0.3], undefined, "shadecrawler-back-mark");
    add(visual, [0.72, 0.3, 0.62], accentMaterial, [0, 0.03, -0.48], "head", "shadecrawler-head");
    for (const [index, ex] of [-0.2, 0, 0.2].entries()) add(visual, [0.075, 0.075, 0.04], eyeMaterial, [ex, 0.12, -0.81], undefined, `shadecrawler-eye-${index + 1}`);
    const fangMaterial = material(0xe1d5c5);
    for (const side of [-1, 1]) {
      const fang = add(visual, [0.07, 0.18, 0.07], fangMaterial, [side * 0.2, -0.08, -0.82], undefined, `shadecrawler-${side < 0 ? "left" : "right"}-fang`);
      fang.rotation.x = 0.35;
    }
    for (const side of [-1, 1]) for (let legIndex = 0; legIndex < 4; legIndex += 1) {
      const z = -0.46 + legIndex * 0.3;
      const leg = pivotBox([0.56, 0.08, 0.1], darkMaterial, [side * 0.34, -0.05, z], [side * 0.28, -0.08, 0], "legs", `shadecrawler-${side < 0 ? "left" : "right"}-leg-${legIndex + 1}`);
      leg.rotation.z = side * -0.42;
      leg.rotation.y = side * (0.17 - legIndex * 0.1);
      leg.userData.phase = (legIndex % 2) * Math.PI;
      leg.userData.side = side;
    }
    const saddle = new THREE.Group();
    saddle.name = "shadecrawler-saddle";
    saddle.visible = false;
    visual.add(saddle);
    add(saddle, [0.78, 0.12, 0.72], material(0x75492f), [0, 0.31, 0.08], undefined, "shadecrawler-saddle-pad");
    add(saddle, [0.52, 0.22, 0.46], material(0x9a6843), [0, 0.43, 0.08], undefined, "shadecrawler-saddle-seat");
    add(saddle, [0.1, 0.4, 0.12], material(0x493126), [-0.43, 0.12, 0.08], undefined, "shadecrawler-left-girth");
    add(saddle, [0.1, 0.4, 0.12], material(0x493126), [0.43, 0.12, 0.08], undefined, "shadecrawler-right-girth");
  } else if (kind === "caveblob") {
    add(visual, [0.82, 0.58, 0.82], material(bodyColor, false, 0.86), [0, -0.02, 0], "body", "caveblob-body");
    add(visual, [0.58, 0.4, 0.58], material(accentColor, false, 0.88), [0, 0.34, -0.03], "body", "caveblob-crown");
    add(visual, [0.22, 0.2, 0.22], material(0xb9ffd9, true), [0, 0.22, 0.03], undefined, "caveblob-core");
    add(visual, [0.12, 0.12, 0.04], eyeMaterial, [-0.18, 0.37, -0.34], undefined, "caveblob-left-eye");
    add(visual, [0.12, 0.12, 0.04], eyeMaterial, [0.18, 0.37, -0.34], undefined, "caveblob-right-eye");
    add(visual, [0.22, 0.055, 0.045], darkMaterial, [0, 0.22, -0.39], undefined, "caveblob-mouth");
    const crystalMaterial = material(0x92f0cb, true, 0.88);
    for (const [index, px, py, pz, scale, rotation] of [
      [1, -0.26, 0.65, 0.06, 0.18, -0.22], [2, 0.08, 0.68, 0.16, 0.23, 0.12], [3, 0.28, 0.59, -0.02, 0.15, 0.3],
    ] as Array<[number, number, number, number, number, number]>) {
      const crystal = add(visual, [scale, scale * 1.8, scale], crystalMaterial, [px, py, pz], undefined, `caveblob-crystal-${index}`);
      crystal.rotation.z = rotation;
    }
  } else if (kind === "rattlekin") {
    add(visual, [0.42, 0.32, 0.32], darkMaterial, [0, 0.35, 0], "body", "rattlekin-pelvis");
    add(visual, [0.14, 0.76, 0.14], accentMaterial, [0, 0.74, 0.08], undefined, "rattlekin-spine");
    for (let rib = 0; rib < 3; rib += 1) add(visual, [0.72 - rib * 0.08, 0.08, 0.16], bodyMaterial, [0, 0.62 + rib * 0.16, 0], undefined, `rattlekin-rib-${rib + 1}`);
    add(visual, [0.54, 0.5, 0.48], bodyMaterial, [0, 1.16, -0.04], "head", "rattlekin-skull");
    add(visual, [0.42, 0.14, 0.22], accentMaterial, [0, 0.98, -0.17], undefined, "rattlekin-jaw");
    add(visual, [0.12, 0.12, 0.05], eyeMaterial, [-0.16, 1.25, -0.3], undefined, "rattlekin-left-eye");
    add(visual, [0.12, 0.12, 0.05], eyeMaterial, [0.16, 1.25, -0.3], undefined, "rattlekin-right-eye");
    add(visual, [0.22, 0.09, 0.18], darkMaterial, [0, 1.08, -0.29], undefined, "rattlekin-nasal-cavity");
    for (const [px, phase, name] of [[-0.18, 0, "left"], [0.18, Math.PI, "right"]] as Array<[number, number, string]>) {
      const leg = pivotBox([0.16, 0.78, 0.18], bodyMaterial, [px, 0.32, 0], [0, -0.39, 0], "legs", `rattlekin-${name}-leg`);
      leg.userData.phase = phase;
      add(leg, [0.26, 0.12, 0.38], accentMaterial, [0, -0.8, -0.09], undefined, `rattlekin-${name}-foot`);
    }
    for (const side of [-1, 1]) {
      const sideName = side < 0 ? "left" : "right";
      add(visual, [0.28, 0.22, 0.25], darkMaterial, [side * 0.4, 0.91, 0], undefined, `rattlekin-${sideName}-shoulder`);
      const arm = pivotBox([0.14, 0.72, 0.14], bodyMaterial, [side * 0.42, 0.9, 0], [0, -0.36, 0], "arms", `rattlekin-${sideName}-arm`);
      arm.userData.side = side;
      arm.userData.phase = side < 0 ? 0 : Math.PI;
    }
    const clubRoot = parts.arms[1];
    add(
      clubRoot,
      [...RATTLEKIN_CLUB_CONTRACT.handleSize],
      accentMaterial,
      [...RATTLEKIN_CLUB_CONTRACT.handleCenter],
      undefined,
      "rattlekin-club-handle",
    );
    add(
      clubRoot,
      [...RATTLEKIN_CLUB_CONTRACT.headSize],
      darkMaterial,
      [...RATTLEKIN_CLUB_CONTRACT.headCenter],
      undefined,
      "rattlekin-club-head",
    );
    add(clubRoot, [0.52, 0.18, 0.22], bodyMaterial, [0, -0.72, -1.02], undefined, "rattlekin-club-stone-band");
    for (const side of [-1, 1]) {
      const spike = add(clubRoot, [0.12, 0.18, 0.14], accentMaterial, [side * 0.29, -0.72, -1.02], undefined, `rattlekin-club-spike-${side < 0 ? "left" : "right"}`);
      spike.rotation.z = side * 0.55;
    }
  } else if (kind === "sunstep-grazer") {
    add(visual, [0.72, 0.62, 1.12], bodyMaterial, [0, 0.16, 0.08], "body", "sunstep-grazer-body");
    add(visual, [0.28, 0.72, 0.3], accentMaterial, [0, 0.5, -0.54], "body", "sunstep-grazer-neck").rotation.x = -0.22;
    add(visual, [0.5, 0.42, 0.54], bodyMaterial, [0, 0.76, -0.78], "head", "sunstep-grazer-head");
    add(visual, [0.34, 0.2, 0.28], darkMaterial, [0, 0.66, -1.12], undefined, "sunstep-grazer-muzzle");
    eyePair(0.16, 0.83, -1.055, 0.065, "sunstep-grazer");
    for (const side of [-1, 1]) {
      const ear = add(visual, [0.34, 0.12, 0.44], accentMaterial, [side * 0.34, 0.94, -0.75], undefined, `sunstep-grazer-${side < 0 ? "left" : "right"}-fan-ear`);
      ear.rotation.z = side * -0.42;
      ear.rotation.y = side * 0.18;
    }
    quadrupedLegs(0.25, -0.32, 0.4, -0.05, 0.72, 0.13, darkMaterial, "sunstep-grazer");
    add(visual, [0.1, 0.1, 0.48], darkMaterial, [0, 0.27, 0.79], "body", "sunstep-grazer-tail").rotation.x = -0.28;
    visual.scale.setScalar(1.22);
  } else if (kind === "pebbletortoise") {
    add(visual, [1.08, 0.44, 1.18], bodyMaterial, [0, 0.02, 0.05], "body", "pebbletortoise-shell");
    add(visual, [0.82, 0.25, 0.9], accentMaterial, [0, 0.27, 0.06], undefined, "pebbletortoise-shell-crown");
    for (const [index, px, pz] of [[1, -0.25, -0.08], [2, 0.25, -0.08], [3, 0, 0.28]] as Array<[number, number, number]>) {
      add(visual, [0.3, 0.08, 0.34], darkMaterial, [px, 0.42, pz], undefined, `pebbletortoise-shell-stone-${index}`).rotation.y = index * 0.27;
    }
    add(visual, [0.42, 0.3, 0.42], accentMaterial, [0, 0, -0.75], "head", "pebbletortoise-head");
    eyePair(0.13, 0.07, -0.965, 0.055, "pebbletortoise");
    for (const [px, pz, phase, name] of [[-0.42, -0.3, 0, "front-left"], [0.42, -0.3, Math.PI, "front-right"], [-0.42, 0.38, Math.PI, "rear-left"], [0.42, 0.38, 0, "rear-right"]] as Array<[number, number, number, string]>) {
      const foot = pivotBox([0.28, 0.16, 0.34], darkMaterial, [px, -0.12, pz], [0, -0.08, -0.04], "legs", `pebbletortoise-${name}-foot`);
      foot.userData.phase = phase;
    }
    add(visual, [0.18, 0.14, 0.26], darkMaterial, [0, -0.06, 0.72], undefined, "pebbletortoise-tail");
  } else if (kind === "brambleboar") {
    add(visual, [0.96, 0.68, 1.35], bodyMaterial, [0, 0.02, 0.12], "body", "brambleboar-body");
    add(visual, [0.74, 0.58, 0.62], bodyMaterial, [0, 0.03, -0.83], "head", "brambleboar-head");
    add(visual, [0.52, 0.3, 0.35], darkMaterial, [0, -0.08, -1.25], undefined, "brambleboar-snout");
    eyePair(0.22, 0.13, -1.12, 0.07, "brambleboar");
    const tuskMaterial = material(0xf1dfb4);
    for (const side of [-1, 1]) {
      const tusk = add(visual, [0.075, 0.28, 0.075], tuskMaterial, [side * 0.25, -0.1, -1.43], undefined, `brambleboar-${side < 0 ? "left" : "right"}-tusk`);
      tusk.rotation.x = 0.46;
      tusk.rotation.z = side * 0.24;
    }
    quadrupedLegs(0.32, -0.36, 0.45, -0.16, 0.42, 0.2, darkMaterial, "brambleboar");
    const thornMaterial = material(0x5d7c42);
    for (let thorn = 0; thorn < 5; thorn += 1) {
      const spike = add(visual, [0.12, 0.34 + thorn % 2 * 0.08, 0.12], thornMaterial, [0, 0.5 + thorn % 2 * 0.05, -0.48 + thorn * 0.24], undefined, `brambleboar-mane-thorn-${thorn + 1}`);
      spike.rotation.z = (thorn % 2 ? 1 : -1) * 0.18;
    }
  } else if (kind === "petalfox") {
    add(visual, [0.68, 0.48, 0.92], bodyMaterial, [0, 0.02, 0.12], "body", "petalfox-body");
    add(visual, [0.58, 0.5, 0.54], accentMaterial, [0, 0.2, -0.55], "head", "petalfox-head");
    add(visual, [0.3, 0.22, 0.28], bodyMaterial, [0, 0.08, -0.91], undefined, "petalfox-muzzle");
    eyePair(0.17, 0.26, -0.82, 0.065, "petalfox");
    for (const side of [-1, 1]) {
      const ear = add(visual, [0.21, 0.4, 0.2], darkMaterial, [side * 0.2, 0.57, -0.52], undefined, `petalfox-${side < 0 ? "left" : "right"}-ear`);
      ear.rotation.z = side * -0.16;
    }
    quadrupedLegs(0.22, -0.24, 0.3, -0.11, 0.34, 0.14, darkMaterial, "petalfox");
    const tail = pivotBox([0.34, 0.34, 0.92], bodyMaterial, [0, 0.2, 0.53], [0, 0.12, 0.42], "body", "petalfox-tail");
    tail.rotation.x = 0.48;
    for (const [index, side] of [-1, 1, -1].entries()) {
      const petal = add(tail, [0.23, 0.06, 0.3], accentMaterial, [(side as number) * 0.16, 0.14 + index * 0.05, 0.35 + index * 0.2], undefined, `petalfox-tail-petal-${index + 1}`);
      petal.rotation.z = (side as number) * 0.36;
    }
  } else if (kind === "duneclatter") {
    add(visual, [0.88, 0.36, 1.02], bodyMaterial, [0, 0, 0.12], "body", "duneclatter-carapace");
    const shellLeft = add(visual, [0.4, 0.14, 0.86], accentMaterial, [-0.22, 0.2, 0.12], "wings", "duneclatter-left-wing-case");
    const shellRight = add(visual, [0.4, 0.14, 0.86], accentMaterial, [0.22, 0.2, 0.12], "wings", "duneclatter-right-wing-case");
    shellLeft.rotation.z = -0.04; shellRight.rotation.z = 0.04;
    add(visual, [0.52, 0.34, 0.44], darkMaterial, [0, 0, -0.58], "head", "duneclatter-head");
    eyePair(0.16, 0.07, -0.805, 0.055, "duneclatter");
    for (const side of [-1, 1]) for (let leg = 0; leg < 3; leg += 1) {
      const limb = pivotBox([0.48, 0.08, 0.1], darkMaterial, [side * 0.31, -0.08, -0.25 + leg * 0.28], [side * 0.23, -0.09, 0], "legs", `duneclatter-${side < 0 ? "left" : "right"}-leg-${leg + 1}`);
      limb.rotation.z = side * -0.38;
      limb.userData.phase = leg % 2 ? Math.PI : 0;
    }
    for (const side of [-1, 1]) {
      const antenna = add(visual, [0.055, 0.055, 0.52], darkMaterial, [side * 0.17, 0.1, -0.91], undefined, `duneclatter-${side < 0 ? "left" : "right"}-antenna`);
      antenna.rotation.y = side * 0.22;
      antenna.rotation.x = -0.2;
    }
  } else if (kind === "thimbledeer") {
    add(visual, [0.68, 0.58, 1.04], bodyMaterial, [0, 0.18, 0.1], "body", "thimbledeer-body");
    add(visual, [0.24, 0.58, 0.26], accentMaterial, [0, 0.5, -0.48], "body", "thimbledeer-neck").rotation.x = -0.2;
    add(visual, [0.46, 0.4, 0.5], bodyMaterial, [0, 0.72, -0.72], "head", "thimbledeer-head");
    add(visual, [0.28, 0.2, 0.3], darkMaterial, [0, 0.61, -1.03], undefined, "thimbledeer-muzzle");
    eyePair(0.145, 0.78, -0.96, 0.055, "thimbledeer");
    for (const side of [-1, 1]) {
      const ear = add(visual, [0.18, 0.32, 0.12], accentMaterial, [side * 0.24, 0.9, -0.69], undefined, `thimbledeer-${side < 0 ? "left" : "right"}-ear`);
      ear.rotation.z = side * -0.32;
      const antler = add(visual, [0.12, 0.28, 0.12], material(0xe5d6ad), [side * 0.14, 1.04, -0.69], undefined, `thimbledeer-${side < 0 ? "left" : "right"}-thimble-antler`);
      antler.rotation.z = side * -0.08;
      add(visual, [0.18, 0.09, 0.16], material(0xe5d6ad), [side * 0.14, 1.19, -0.69], undefined, `thimbledeer-${side < 0 ? "left" : "right"}-antler-cap`);
    }
    quadrupedLegs(0.23, -0.28, 0.34, -0.03, 0.6, 0.12, darkMaterial, "thimbledeer");
    const tail = add(visual, [0.16, 0.18, 0.34], accentMaterial, [0, 0.3, 0.71], "body", "thimbledeer-tail");
    tail.rotation.x = 0.55;
  } else if (kind === "lanternshell") {
    add(visual, [0.88, 0.18, 1.15], darkMaterial, [0, -0.18, 0.08], "body", "lanternshell-foot");
    add(visual, [0.58, 0.28, 0.58], bodyMaterial, [0, -0.04, -0.52], "head", "lanternshell-head");
    add(visual, [0.92, 0.82, 0.48], accentMaterial, [0, 0.26, 0.2], "body", "lanternshell-shell");
    const glowMaterial = material(eyeColor, true, 0.9);
    for (const [index, size, y, z] of [
      [1, 0.56, 0.28, -0.055], [2, 0.38, 0.29, -0.315], [3, 0.2, 0.3, -0.5],
    ] as Array<[number, number, number, number]>) {
      add(visual, [size, size, 0.055], glowMaterial, [0, y, z], undefined, `lanternshell-spiral-${index}`);
    }
    for (const side of [-1, 1]) {
      const stalk = add(visual, [0.045, 0.36, 0.045], bodyMaterial, [side * 0.17, 0.15, -0.78], undefined, `lanternshell-${side < 0 ? "left" : "right"}-stalk`);
      stalk.rotation.x = -0.42;
      stalk.rotation.z = side * -0.12;
      add(visual, [0.085, 0.085, 0.085], eyeMaterial, [side * 0.18, 0.29, -0.91], undefined, `lanternshell-${side < 0 ? "left" : "right"}-eye`);
    }
  } else if (kind === "puddlehopper") {
    add(visual, [0.72, 0.4, 0.68], bodyMaterial, [0, 0, 0.08], "body", "puddlehopper-body");
    add(visual, [0.64, 0.36, 0.48], accentMaterial, [0, 0.08, -0.4], "head", "puddlehopper-head");
    eyePair(0.19, 0.22, -0.61, 0.09, "puddlehopper");
    add(visual, [0.26, 0.065, 0.04], darkMaterial, [0, -0.04, -0.65], undefined, "puddlehopper-mouth");
    for (const side of [-1, 1]) {
      const thigh = pivotBox([0.34, 0.18, 0.52], darkMaterial, [side * 0.28, -0.08, 0.25], [side * 0.12, -0.07, 0.12], "legs", `puddlehopper-${side < 0 ? "left" : "right"}-rear-leg`);
      thigh.rotation.y = side * -0.34;
      thigh.userData.phase = side < 0 ? 0 : Math.PI;
      add(visual, [0.34, 0.1, 0.38], accentMaterial, [side * 0.43, -0.25, -0.18], "legs", `puddlehopper-${side < 0 ? "left" : "right"}-front-foot`);
      add(visual, [0.44, 0.1, 0.5], accentMaterial, [side * 0.45, -0.25, 0.48], undefined, `puddlehopper-${side < 0 ? "left" : "right"}-webbed-foot`);
    }
    add(visual, [0.42, 0.24, 0.08], material(0xe8d46f, false, 0.82), [0, -0.03, -0.66], undefined, "puddlehopper-throat-pouch");
  } else if (kind === "reedstrider") {
    add(visual, [0.56, 0.72, 0.82], bodyMaterial, [0, 0.58, 0.08], "body", "reedstrider-body");
    add(visual, [0.24, 0.74, 0.24], accentMaterial, [0, 0.98, -0.36], "body", "reedstrider-neck").rotation.x = -0.16;
    add(visual, [0.42, 0.38, 0.42], bodyMaterial, [0, 1.32, -0.62], "head", "reedstrider-head");
    add(visual, [0.16, 0.14, 0.66], material(0xd9b666), [0, 1.25, -1.14], undefined, "reedstrider-beak").rotation.x = -0.05;
    eyePair(0.13, 1.39, -0.83, 0.06, "reedstrider");
    const crest = add(visual, [0.12, 0.42, 0.18], darkMaterial, [0, 1.61, -0.56], undefined, "reedstrider-hollow-crest");
    crest.rotation.x = -0.28;
    for (const side of [-1, 1]) {
      const wing = pivotBox([0.46, 0.12, 0.76], darkMaterial, [side * 0.23, 0.69, 0.06], [side * 0.22, 0, 0], "wings", `reedstrider-${side < 0 ? "left" : "right"}-wing`);
      wing.rotation.z = side * -0.12;
      wing.userData.side = side;
      const leg = pivotBox([0.11, 0.9, 0.12], accentMaterial, [side * 0.16, 0.38, 0.08], [0, -0.45, 0], "legs", `reedstrider-${side < 0 ? "left" : "right"}-leg`);
      leg.userData.phase = side < 0 ? 0 : Math.PI;
      add(leg, [0.3, 0.08, 0.44], darkMaterial, [0, -0.94, -0.12], undefined, `reedstrider-${side < 0 ? "left" : "right"}-foot`);
    }
    add(visual, [0.34, 0.16, 0.58], accentMaterial, [0, 0.61, 0.65], undefined, "reedstrider-tail").rotation.x = 0.25;
    const reedSaddle = new THREE.Group();
    reedSaddle.name = "reedstrider-saddle";
    reedSaddle.visible = false;
    visual.add(reedSaddle);
    add(reedSaddle, [0.62, 0.1, 0.58], material(0x5b3e2c), [0, 0.95, 0.08], undefined, "reedstrider-saddle-blanket");
    add(reedSaddle, [0.42, 0.2, 0.42], material(0x8c633d), [0, 1.06, 0.06], undefined, "reedstrider-saddle-seat");
    add(reedSaddle, [0.08, 0.72, 0.08], material(0x3f2c23), [-0.31, 0.64, 0.06], undefined, "reedstrider-left-girth");
    add(reedSaddle, [0.08, 0.72, 0.08], material(0x3f2c23), [0.31, 0.64, 0.06], undefined, "reedstrider-right-girth");
    visual.userData.saddleAnchor = [0, 1.03, 0.1];
  } else if (kind === "wild-horse") {
    add(visual, [0.82, 0.78, 1.46], bodyMaterial, [0, 0.54, 0.15], "body", "wild-horse-body");
    add(visual, [0.34, 0.92, 0.42], accentMaterial, [0, 0.94, -0.52], "body", "wild-horse-neck").rotation.x = -0.25;
    add(visual, [0.52, 0.52, 0.66], bodyMaterial, [0, 1.27, -0.88], "head", "wild-horse-head");
    add(visual, [0.4, 0.3, 0.48], accentMaterial, [0, 1.13, -1.35], undefined, "wild-horse-muzzle");
    eyePair(0.17, 1.35, -1.23, 0.07, "wild-horse");
    for (const side of [-1, 1]) {
      const ear = add(visual, [0.14, 0.38, 0.16], darkMaterial, [side * 0.18, 1.68, -0.86], undefined, `wild-horse-${side < 0 ? "left" : "right"}-ear`);
      ear.rotation.z = side * -0.12;
    }
    quadrupedLegs(0.28, -0.34, 0.48, 0.35, 0.9, 0.16, darkMaterial, "wild-horse");
    for (let index = 0; index < 5; index += 1) add(visual, [0.11, 0.34, 0.24], darkMaterial, [0, 1.25 - index * 0.16, -0.42 + index * 0.13], undefined, `wild-horse-mane-${index + 1}`).rotation.x = -0.2;
    const tail = pivotBox([0.28, 0.32, 0.95], darkMaterial, [0, 0.75, 0.84], [0, -0.12, 0.42], "body", "wild-horse-tail");
    tail.rotation.x = 0.42;
    const horseSaddle = new THREE.Group();
    horseSaddle.name = "wild-horse-saddle";
    horseSaddle.visible = false;
    visual.add(horseSaddle);
    add(horseSaddle, [0.88, 0.1, 0.82], material(0x60412f), [0, 0.98, 0.13], undefined, "wild-horse-saddle-blanket");
    add(horseSaddle, [0.58, 0.26, 0.56], material(0x8b613e), [0, 1.12, 0.11], undefined, "wild-horse-saddle-seat");
    add(horseSaddle, [0.09, 0.86, 0.1], material(0x3c2b23), [-0.43, 0.6, 0.12], undefined, "wild-horse-left-girth");
    add(horseSaddle, [0.09, 0.86, 0.1], material(0x3c2b23), [0.43, 0.6, 0.12], undefined, "wild-horse-right-girth");
    visual.userData.saddleAnchor = [0, 1.02, 0.12];
  } else if (kind === "meadow-cow") {
    add(visual, [1.04, 0.82, 1.48], bodyMaterial, [0, 0.49, 0.14], "body", "meadow-cow-body");
    add(visual, [0.72, 0.66, 0.68], accentMaterial, [0, 0.67, -0.82], "head", "meadow-cow-head");
    add(visual, [0.52, 0.28, 0.36], material(0xe3b5a0), [0, 0.52, -1.28], undefined, "meadow-cow-muzzle");
    eyePair(0.22, 0.78, -1.16, 0.072, "meadow-cow");
    for (const side of [-1, 1]) {
      add(visual, [0.38, 0.14, 0.26], darkMaterial, [side * 0.48, 0.92, -0.76], undefined, `meadow-cow-${side < 0 ? "left" : "right"}-ear`).rotation.z = side * -0.25;
      add(visual, [0.12, 0.28, 0.12], material(0xe8d8af), [side * 0.22, 1.08, -0.77], undefined, `meadow-cow-${side < 0 ? "left" : "right"}-horn`).rotation.z = side * -0.35;
    }
    quadrupedLegs(0.36, -0.36, 0.48, 0.3, 0.76, 0.2, darkMaterial, "meadow-cow");
    add(visual, [0.56, 0.08, 0.68], material(0x6e9b51), [0, 0.92, 0.12], undefined, "meadow-cow-clover-patch").rotation.y = 0.25;
    add(visual, [0.38, 0.24, 0.32], material(0xe7b5a4), [0, -0.02, 0.3], undefined, "meadow-cow-udder");
    add(visual, [0.12, 0.12, 0.74], darkMaterial, [0, 0.52, 0.92], "body", "meadow-cow-tail").rotation.x = -0.36;
  } else if (kind === "mistmane") {
    add(visual, [0.82, 0.88, 1.18], bodyMaterial, [0, 0.46, 0.12], "body", "mistmane-body");
    add(visual, [0.38, 0.72, 0.4], accentMaterial, [0, 0.78, -0.53], "body", "mistmane-neck").rotation.x = -0.18;
    add(visual, [0.58, 0.52, 0.56], bodyMaterial, [0, 1.02, -0.78], "head", "mistmane-head");
    add(visual, [0.34, 0.22, 0.28], darkMaterial, [0, 0.91, -1.16], undefined, "mistmane-muzzle");
    eyePair(0.18, 1.09, -1.04, 0.065, "mistmane");
    for (const side of [-1, 1]) add(visual, [0.2, 0.38, 0.16], accentMaterial, [side * 0.24, 1.34, -0.73], undefined, `mistmane-${side < 0 ? "left" : "right"}-ear`).rotation.z = side * -0.28;
    quadrupedLegs(0.28, -0.3, 0.38, 0.28, 0.7, 0.16, darkMaterial, "mistmane");
    for (let lock = 0; lock < 6; lock += 1) add(visual, [0.18, 0.5, 0.18], material(lock % 2 ? 0xdff1ec : 0xb8d6cf, false, 0.92), [-0.26 + lock * 0.105, 0.82, -0.02 + (lock % 2) * 0.1], undefined, `mistmane-mane-lock-${lock + 1}`).rotation.z = (lock - 2.5) * 0.04;
    add(visual, [0.28, 0.42, 0.48], accentMaterial, [0, 0.42, 0.76], "body", "mistmane-tail").rotation.x = 0.35;
  } else if (kind === "sakurakit") {
    add(visual, [0.62, 0.48, 0.86], bodyMaterial, [0, 0.04, 0.12], "body", "sakurakit-body");
    add(visual, [0.54, 0.5, 0.5], accentMaterial, [0, 0.24, -0.5], "head", "sakurakit-head");
    add(visual, [0.28, 0.2, 0.25], material(0xffe8dc), [0, 0.12, -0.84], undefined, "sakurakit-muzzle");
    eyePair(0.16, 0.3, -0.76, 0.072, "sakurakit");
    add(visual, [0.07, 0.06, 0.045], material(0x4b2d43), [0, 0.16, -0.98], undefined, "sakurakit-nose");
    for (const side of [-1, 1]) {
      const ear = add(visual, [0.2, 0.46, 0.18], darkMaterial, [side * 0.2, 0.62, -0.47], undefined, `sakurakit-${side < 0 ? "left" : "right"}-ear`);
      ear.rotation.z = side * -0.2;
      add(visual, [0.11, 0.3, 0.08], material(0xffc9d8), [side * 0.2, 0.63, -0.57], undefined, `sakurakit-${side < 0 ? "left" : "right"}-inner-ear`).rotation.z = side * -0.2;
    }
    quadrupedLegs(0.21, -0.24, 0.31, -0.08, 0.36, 0.14, darkMaterial, "sakurakit");
    const tail = pivotBox([0.38, 0.38, 1.02], bodyMaterial, [0, 0.24, 0.5], [0, 0.16, 0.46], "body", "sakurakit-blossom-tail");
    tail.rotation.x = 0.5;
    for (const [index, side] of [-1, 1, -1, 1].entries()) {
      const petal = add(tail, [0.25, 0.055, 0.34], material(index % 2 ? 0xffd2df : 0xf08fb4), [(side as number) * 0.17, 0.2 + index * 0.035, 0.35 + index * 0.16], undefined, `sakurakit-tail-petal-${index + 1}`);
      petal.rotation.z = (side as number) * 0.35;
    }
  } else if (kind === "taffy-hound") {
    add(visual, [0.76, 0.5, 1.08], bodyMaterial, [0, 0.02, 0.12], "body", "taffy-hound-body");
    add(visual, [0.66, 0.58, 0.6], accentMaterial, [0, 0.28, -0.58], "head", "taffy-hound-head");
    add(visual, [0.42, 0.26, 0.36], material(0xf4d49a), [0, 0.14, -0.99], undefined, "taffy-hound-gumdrop-muzzle");
    eyePair(0.19, 0.36, -0.88, 0.075, "taffy-hound");
    add(visual, [0.09, 0.07, 0.055], darkMaterial, [0, 0.19, -1.19], undefined, "taffy-hound-licorice-nose");
    for (const side of [-1, 1]) {
      const sideName = side < 0 ? "left" : "right";
      const ear = add(visual, [0.25, 0.43, 0.2], bodyMaterial, [side * 0.25, 0.65, -0.55], undefined, `taffy-hound-${sideName}-hard-candy-ear`);
      ear.rotation.z = side * -0.3;
      add(visual, [0.12, 0.28, 0.08], material(0xffb7ce), [side * 0.25, 0.65, -0.65], undefined, `taffy-hound-${sideName}-inner-ear`).rotation.z = side * -0.3;
    }
    quadrupedLegs(0.25, -0.26, 0.34, -0.02, 0.39, 0.16, darkMaterial, "taffy-hound");
    const tail = pivotBox([0.18, 0.18, 0.62], darkMaterial, [0, 0.18, 0.58], [0, 0.1, 0.28], "body", "taffy-hound-licorice-tail");
    tail.rotation.x = 0.42;
    add(tail, [0.18, 0.48, 0.18], darkMaterial, [0, 0.33, 0.53], undefined, "taffy-hound-licorice-tail-curl").rotation.z = 0.52;
    const collar = new THREE.Group();
    collar.name = "taffy-hound-faction-collar";
    collar.visible = false;
    visual.add(collar);
    add(collar, [0.72, 0.13, 0.48], material(0xf5d667), [0, 0.27, -0.37], undefined, "taffy-hound-sugarcourt-collar-band");
    add(collar, [0.18, 0.22, 0.08], material(0x84ddbc, true), [0, 0.13, -0.65], undefined, "taffy-hound-sugarcourt-collar-tag");
  } else if (kind === "praline-cat") {
    add(visual, [0.58, 0.38, 0.94], bodyMaterial, [0, -0.04, 0.12], "body", "praline-cat-body");
    add(visual, [0.5, 0.48, 0.48], accentMaterial, [0, 0.22, -0.49], "head", "praline-cat-head");
    add(visual, [0.3, 0.16, 0.22], material(0xeab77c), [0, 0.11, -0.82], undefined, "praline-cat-muzzle");
    eyePair(0.15, 0.3, -0.75, 0.07, "praline-cat");
    add(visual, [0.065, 0.055, 0.04], darkMaterial, [0, 0.16, -0.95], undefined, "praline-cat-nose");
    for (const side of [-1, 1]) {
      const sideName = side < 0 ? "left" : "right";
      const ear = add(visual, [0.2, 0.42, 0.17], bodyMaterial, [side * 0.19, 0.58, -0.48], undefined, `praline-cat-${sideName}-ear`);
      ear.rotation.z = side * -0.22;
      for (let whisker = 0; whisker < 2; whisker += 1) {
        const strand = add(visual, [0.34, 0.025, 0.025], darkMaterial, [side * 0.28, 0.14 + whisker * 0.07, -0.86], undefined, `praline-cat-${sideName}-whisker-${whisker + 1}`);
        strand.rotation.z = side * (whisker ? 0.12 : -0.08);
      }
    }
    quadrupedLegs(0.19, -0.22, 0.29, -0.06, 0.32, 0.12, darkMaterial, "praline-cat");
    const tail = new THREE.Group();
    tail.name = "praline-cat-licorice-tail-pivot";
    tail.position.set(0, 0.08, 0.53);
    tail.userData.bodyPart = "body";
    parts.body.push(tail);
    visual.add(tail);
    add(tail, [0.14, 0.14, 0.52], darkMaterial, [0, 0.08, 0.23], undefined, "praline-cat-tail-base").rotation.x = 0.32;
    add(tail, [0.14, 0.5, 0.14], darkMaterial, [0, 0.38, 0.47], undefined, "praline-cat-tail-tip").rotation.z = -0.28;
    const bell = new THREE.Group();
    bell.name = "praline-cat-faction-bell";
    bell.visible = false;
    visual.add(bell);
    add(bell, [0.54, 0.1, 0.4], material(0xf1c85c), [0, 0.18, -0.3], undefined, "praline-cat-sugarcourt-collar");
    add(bell, [0.13, 0.16, 0.12], material(0x7ed9b7, true), [0, 0.07, -0.54], undefined, "praline-cat-sugarcourt-bell");
  } else if (kind === "sprinklebug") {
    add(visual, [0.38, 0.24, 0.5], bodyMaterial, [0, -0.08, 0.05], "body", "sprinklebug-body");
    add(visual, [0.34, 0.2, 0.34], accentMaterial, [0, -0.07, -0.32], "head", "sprinklebug-head");
    add(visual, [0.3, 0.1, 0.42], material(0xffbddc), [0, 0.08, 0.05], undefined, "sprinklebug-shell-crown");
    eyePair(0.1, -0.02, -0.5, 0.045, "sprinklebug");
    for (const side of [-1, 1]) {
      const sideName = side < 0 ? "left" : "right";
      for (let leg = 0; leg < 3; leg += 1) {
        const limb = add(visual, [0.28, 0.1, 0.075], darkMaterial, [side * 0.24, -0.23, -0.18 + leg * 0.2], "legs", `sprinklebug-${sideName}-leg-${leg + 1}`);
        limb.rotation.z = side * -0.32;
        limb.userData.phase = leg % 2 ? Math.PI : 0;
      }
      const antenna = add(visual, [0.035, 0.035, 0.3], darkMaterial, [side * 0.09, 0.05, -0.57], undefined, `sprinklebug-${sideName}-antenna`);
      antenna.rotation.y = side * 0.3;
    }
    for (const [index, x, z, color] of [
      [1, -0.12, -0.04, 0xffec78], [2, 0.11, 0.12, 0x72e1bf], [3, -0.08, 0.2, 0x8ac8ff], [4, 0.09, -0.16, 0xff8eac],
    ] as Array<[number, number, number, number]>) add(visual, [0.055, 0.04, 0.13], material(color, true), [x, 0.145, z], undefined, `sprinklebug-sprinkle-${index}`).rotation.y = index * 0.62;
  } else if (kind === "taffalo") {
    add(visual, [1.2, 0.86, 1.7], bodyMaterial, [0, 0.28, 0.15], "body", "taffalo-body");
    for (let fold = 0; fold < 5; fold += 1) add(visual, [1.28, 0.16, 0.3], material(fold % 2 ? 0xc77da3 : 0xa95d88), [0, 0.18 + fold * 0.13, -0.45 + fold * 0.25], undefined, `taffalo-taffy-fold-${fold + 1}`).rotation.y = (fold % 2 ? 1 : -1) * 0.06;
    add(visual, [0.82, 0.8, 0.7], accentMaterial, [0, 0.58, -0.78], "body", "taffalo-marshmallow-mane");
    add(visual, [0.78, 0.62, 0.72], bodyMaterial, [0, 0.61, -1.2], "head", "taffalo-head");
    add(visual, [0.56, 0.3, 0.42], material(0xf2bdcf), [0, 0.45, -1.68], undefined, "taffalo-gumdrop-muzzle");
    eyePair(0.23, 0.72, -1.56, 0.085, "taffalo");
    add(visual, [0.14, 0.09, 0.06], darkMaterial, [0, 0.5, -1.92], undefined, "taffalo-nose");
    for (const side of [-1, 1]) {
      const sideName = side < 0 ? "left" : "right";
      add(visual, [0.3, 0.16, 0.27], darkMaterial, [side * 0.46, 0.78, -1.14], undefined, `taffalo-${sideName}-ear`).rotation.z = side * -0.24;
      const horn = add(visual, [0.18, 0.5, 0.18], material(0xf0e0b7), [side * 0.34, 1.16, -1.18], undefined, `taffalo-${sideName}-wafer-horn`);
      horn.rotation.z = side * -0.5;
      add(visual, [0.2, 0.3, 0.2], material(0xe9576a), [side * 0.52, 1.34, -1.18], undefined, `taffalo-${sideName}-peppermint-horn-tip`).rotation.z = side * -0.5;
    }
    quadrupedLegs(0.39, -0.36, 0.48, 0.27, 0.89, 0.23, darkMaterial, "taffalo");
    for (const side of [-1, 1]) add(visual, [0.31, 0.12, 0.35], accentMaterial, [side * 0.39, -0.56, 0.48], undefined, `taffalo-${side < 0 ? "left" : "right"}-marshmallow-ankle`);
    const tail = pivotBox([0.16, 0.16, 0.7], darkMaterial, [0, 0.4, 0.91], [0, -0.08, 0.31], "body", "taffalo-tail");
    tail.rotation.x = -0.22;
    add(tail, [0.32, 0.32, 0.32], accentMaterial, [0, -0.2, 0.67], undefined, "taffalo-tail-tuft");
    const saddle = new THREE.Group();
    saddle.name = "taffalo-saddle";
    saddle.visible = false;
    visual.add(saddle);
    add(saddle, [0.92, 0.2, 0.86], material(0x70483d), [0, 0.83, 0.08], undefined, "taffalo-saddle-seat");
    add(saddle, [1.23, 0.12, 0.2], material(0xd3ad62), [0, 0.71, 0.06], undefined, "taffalo-saddle-girth");
    visual.userData.saddleAnchor = [0, 0.83, 0.08];
  } else if (kind === "sunwash-crab") {
    add(visual, [0.82, 0.28, 0.64], bodyMaterial, [0, -0.03, 0.02], "body", "sunwash-crab-shell");
    add(visual, [0.62, 0.12, 0.5], accentMaterial, [0, 0.15, 0.03], undefined, "sunwash-crab-sunburst-crown");
    eyePair(0.2, 0.2, -0.3, 0.075, "sunwash-crab");
    for (const side of [-1, 1]) {
      const sideName = side < 0 ? "left" : "right";
      const clawArm = pivotBox([0.48, 0.09, 0.11], darkMaterial, [side * 0.4, 0.02, -0.19], [side * 0.22, 0, -0.05], "arms", `sunwash-crab-${sideName}-claw-arm`);
      clawArm.rotation.z = side * -0.14;
      clawArm.userData.side = side;
      add(clawArm, [0.31, 0.22, 0.3], accentMaterial, [side * 0.48, 0.08, -0.09], undefined, `sunwash-crab-${sideName}-claw`);
      for (let leg = 0; leg < 3; leg += 1) {
        const limb = pivotBox([0.46, 0.07, 0.09], darkMaterial, [side * 0.31, -0.12, -0.05 + leg * 0.2], [side * 0.23, -0.08, 0.02], "legs", `sunwash-crab-${sideName}-leg-${leg + 1}`);
        limb.rotation.z = side * -0.38;
        limb.userData.phase = leg % 2 ? Math.PI : 0;
      }
    }
    add(visual, [0.36, 0.08, 0.32], material(0xffdf9e), [0, -0.16, -0.14], undefined, "sunwash-crab-pale-apron");
  } else if (kind === "emberjay" || kind === "canopy-lark" || kind === "tidewing-gull") {
    const prefix = kind;
    add(visual, [0.44, 0.4, 0.7], bodyMaterial, [0, 0.04, 0.05], "body", `${prefix}-body`);
    add(visual, [0.34, 0.34, 0.38], accentMaterial, [0, 0.19, -0.43], "head", `${prefix}-head`);
    const beakColor = kind === "emberjay" ? 0xe7be58 : kind === "tidewing-gull" ? 0xe5b74e : 0x765b36;
    add(visual, [0.15, 0.12, 0.28], material(beakColor), [0, 0.13, -0.76], undefined, `${prefix}-beak`).rotation.x = -0.08;
    eyePair(0.105, 0.25, -0.62, 0.052, prefix);
    for (const side of [-1, 1]) {
      const wing = pivotBox([0.5, 0.07, 0.58], darkMaterial, [side * 0.18, 0.11, 0.02], [side * 0.25, 0, 0.02], "wings", `${prefix}-${side < 0 ? "left" : "right"}-wing`);
      wing.rotation.z = side * -0.28;
      wing.userData.side = side;
      wing.userData.phase = side < 0 ? 0 : Math.PI;
    }
    for (const side of [-1, 0, 1]) {
      const feather = add(visual, [0.16, 0.08, 0.54], side === 0 ? accentMaterial : bodyMaterial, [side * 0.13, 0.03, 0.59], undefined, `${prefix}-tail-${side + 2}`);
      feather.rotation.y = side * -0.16;
    }
    for (const side of [-1, 1]) {
      add(visual, [0.045, 0.22, 0.045], darkMaterial, [side * 0.1, -0.27, -0.05], "legs", `${prefix}-${side < 0 ? "left" : "right"}-leg`);
      add(visual, [0.16, 0.035, 0.045], darkMaterial, [side * 0.1, -0.39, -0.1], undefined, `${prefix}-${side < 0 ? "left" : "right"}-foot`);
    }
    if (kind === "emberjay") add(visual, [0.14, 0.28, 0.12], accentMaterial, [0, 0.48, -0.35], undefined, "emberjay-crest").rotation.x = -0.24;
    else if (kind === "tidewing-gull") {
      add(visual, [0.36, 0.1, 0.38], material(0xf7faf5), [0, 0.06, -0.39], undefined, "tidewing-gull-white-breast");
      add(visual, [0.36, 0.08, 0.27], material(0x456e83), [0, 0.39, -0.42], undefined, "tidewing-gull-tide-cap");
      for (const side of [-1, 1]) add(visual, [0.2, 0.045, 0.38], material(0x294456), [side * 0.36, 0.12, 0.08], undefined, `tidewing-gull-${side < 0 ? "left" : "right"}-wingtip`);
    } else add(visual, [0.3, 0.08, 0.3], material(0xf0e59f), [0, 0.05, -0.37], undefined, "canopy-lark-breast-mark");
  } else if (kind === "warg") {
    add(visual, [1.02, 0.72, 1.58], bodyMaterial, [0, 0.35, 0.12], "body", "warg-body");
    add(visual, [0.62, 0.78, 0.6], accentMaterial, [0, 0.64, -0.58], "body", "warg-ruff");
    add(visual, [0.72, 0.62, 0.7], bodyMaterial, [0, 0.67, -1.02], "head", "warg-head");
    add(visual, [0.54, 0.34, 0.52], darkMaterial, [0, 0.52, -1.51], undefined, "warg-muzzle");
    eyePair(0.22, 0.78, -1.36, 0.085, "warg");
    add(visual, [0.1, 0.08, 0.06], material(0x1b1715), [0, 0.56, -1.8], undefined, "warg-nose");
    for (const side of [-1, 1]) {
      const ear = add(visual, [0.25, 0.52, 0.24], darkMaterial, [side * 0.25, 1.12, -0.96], undefined, `warg-${side < 0 ? "left" : "right"}-ear`);
      ear.rotation.z = side * -0.24;
      add(visual, [0.16, 0.28, 0.12], material(0xb98779), [side * 0.25, 1.13, -1.02], undefined, `warg-${side < 0 ? "left" : "right"}-inner-ear`).rotation.z = side * -0.24;
      for (const [index, x] of [-0.15, 0.15].entries()) {
        const tooth = add(visual, [0.08, 0.2, 0.08], material(0xe8dfc7), [side * 0.13 + x * 0.1, 0.36, -1.72 - index * 0.02], undefined, `warg-${side < 0 ? "left" : "right"}-fang-${index + 1}`);
        tooth.rotation.x = -0.2;
      }
    }
    quadrupedLegs(0.35, -0.38, 0.5, 0.25, 0.82, 0.22, darkMaterial, "warg");
    for (const name of ["front-left", "front-right", "rear-left", "rear-right"]) {
      const leg = visual.getObjectByName(`warg-${name}-leg-pivot`);
      if (leg) add(leg, [0.28, 0.16, 0.38], bodyMaterial, [0, -0.87, -0.08], undefined, `warg-${name}-paw`);
    }
    const tail = pivotBox([0.34, 0.36, 1.08], accentMaterial, [0, 0.64, 0.86], [0, 0.08, 0.5], "body", "warg-tail");
    tail.rotation.x = 0.45;
    tail.rotation.z = -0.18;
    const saddle = new THREE.Group();
    saddle.name = "warg-saddle";
    saddle.visible = false;
    visual.add(saddle);
    add(saddle, [0.9, 0.12, 0.78], material(0x5f3a28), [0, 0.76, 0.08], undefined, "warg-saddle-blanket");
    add(saddle, [0.58, 0.28, 0.54], material(0x8b5f3c), [0, 0.91, 0.07], undefined, "warg-saddle-seat");
    add(saddle, [0.1, 0.74, 0.12], material(0x3d2b23), [-0.48, 0.47, 0.07], undefined, "warg-left-girth");
    add(saddle, [0.1, 0.74, 0.12], material(0x3d2b23), [0.48, 0.47, 0.07], undefined, "warg-right-girth");
    visual.userData.saddleAnchor = [0, 0.92, 0.08];
  } else if (kind === "burrowbell") {
    add(visual, [0.7, 0.68, 0.84], bodyMaterial, [0, 0.02, 0.08], "body", "burrowbell-body");
    add(visual, [0.5, 0.38, 0.48], material(0xe2c493), [0, 0.03, -0.36], undefined, "burrowbell-belly");
    add(visual, [0.58, 0.54, 0.52], accentMaterial, [0, 0.25, -0.5], "head", "burrowbell-head");
    add(visual, [0.32, 0.22, 0.28], material(0xd5a676), [0, 0.13, -0.86], undefined, "burrowbell-muzzle");
    eyePair(0.16, 0.35, -0.78, 0.065, "burrowbell");
    add(visual, [0.08, 0.07, 0.05], material(0x3a251e), [0, 0.17, -1.02], undefined, "burrowbell-nose");
    for (const side of [-1, 1]) {
      add(visual, [0.18, 0.2, 0.14], darkMaterial, [side * 0.2, 0.58, -0.48], undefined, `burrowbell-${side < 0 ? "left" : "right"}-ear`);
      const forepaw = pivotBox([0.15, 0.38, 0.16], accentMaterial, [side * 0.18, 0.14, -0.38], [0, -0.19, -0.05], "arms", `burrowbell-${side < 0 ? "left" : "right"}-forepaw`);
      forepaw.rotation.x = 0.24;
      const hindpaw = pivotBox([0.22, 0.28, 0.34], darkMaterial, [side * 0.25, -0.18, 0.32], [0, -0.14, -0.04], "legs", `burrowbell-${side < 0 ? "left" : "right"}-hindpaw`);
      hindpaw.userData.phase = side < 0 ? 0 : Math.PI;
    }
    add(visual, [0.34, 0.34, 0.4], darkMaterial, [0, 0.08, 0.62], "body", "burrowbell-bell-tail");
    add(visual, [0.22, 0.22, 0.28], accentMaterial, [0, 0.1, 0.83], undefined, "burrowbell-tail-tip");
    for (const side of [-1, 1]) for (let whisker = 0; whisker < 2; whisker += 1) {
      const line = add(visual, [0.34, 0.018, 0.018], material(0xe9dcc6), [side * 0.29, 0.15 + whisker * 0.07, -0.93], undefined, `burrowbell-${side < 0 ? "left" : "right"}-whisker-${whisker + 1}`);
      line.rotation.y = side * 0.18;
      line.rotation.z = side * (whisker ? -0.12 : 0.08);
    }
  } else if (kind === "dewback-tapir") {
    add(visual, [1.1, 0.82, 1.5], bodyMaterial, [0, 0.34, 0.14], "body", "dewback-tapir-body");
    add(visual, [0.94, 0.32, 0.9], accentMaterial, [0, 0.73, 0.08], undefined, "dewback-tapir-dew-saddle");
    add(visual, [0.72, 0.66, 0.72], bodyMaterial, [0, 0.43, -0.88], "head", "dewback-tapir-head");
    const snout = add(visual, [0.38, 0.38, 0.76], accentMaterial, [0, 0.25, -1.48], undefined, "dewback-tapir-snout");
    snout.rotation.x = -0.12;
    eyePair(0.23, 0.58, -1.24, 0.07, "dewback-tapir");
    add(visual, [0.22, 0.12, 0.1], material(0x342823), [0, 0.18, -1.88], undefined, "dewback-tapir-nose");
    for (const side of [-1, 1]) {
      const ear = add(visual, [0.24, 0.38, 0.2], darkMaterial, [side * 0.27, 0.87, -0.79], undefined, `dewback-tapir-${side < 0 ? "left" : "right"}-ear`);
      ear.rotation.z = side * -0.25;
    }
    quadrupedLegs(0.38, -0.36, 0.48, 0.2, 0.66, 0.25, darkMaterial, "dewback-tapir");
    for (const name of ["front-left", "front-right", "rear-left", "rear-right"]) {
      const leg = visual.getObjectByName(`dewback-tapir-${name}-leg-pivot`);
      if (leg) add(leg, [0.34, 0.17, 0.4], accentMaterial, [0, -0.71, -0.06], undefined, `dewback-tapir-${name}-three-toed-foot`);
    }
    add(visual, [0.16, 0.18, 0.38], darkMaterial, [0, 0.42, 0.96], "body", "dewback-tapir-tail").rotation.x = -0.26;
    for (const [index, x, z] of [[1, -0.28, -0.05], [2, 0.05, 0.12], [3, 0.31, -0.13]] as Array<[number, number, number]>) {
      add(visual, [0.1, 0.08, 0.1], material(0x9ed8d4, true, 0.72), [x, 0.94, z], undefined, `dewback-tapir-dewdrop-${index}`);
    }
  } else if (kind === "deepwater-shark") {
    add(visual, [0.88, 0.7, 2.4], bodyMaterial, [0, 0, 0], "body", "deepwater-shark-body");
    add(visual, [0.78, 0.48, 0.92], accentMaterial, [0, -0.14, -1.38], "head", "deepwater-shark-snout");
    eyePair(0.3, 0.12, -1.82, 0.085, "deepwater-shark");
    add(visual, [0.52, 0.13, 0.12], material(0x3a2222), [0, -0.31, -1.85], undefined, "deepwater-shark-mouth");
    for (const side of [-1, 1]) for (let tooth = 0; tooth < 3; tooth += 1) {
      add(visual, [0.07, 0.12, 0.07], material(0xf2eee2), [side * (0.09 + tooth * 0.09), -0.31, -1.93], undefined, `deepwater-shark-${side < 0 ? "left" : "right"}-tooth-${tooth + 1}`);
    }
    for (const side of [-1, 1]) {
      const pectoral = add(visual, [0.9, 0.1, 0.66], darkMaterial, [side * 0.62, -0.16, -0.15], "wings", `deepwater-shark-${side < 0 ? "left" : "right"}-pectoral-fin`);
      pectoral.rotation.z = side * -0.28;
      pectoral.rotation.y = side * -0.2;
      const tail = add(visual, [0.22, 0.96, 0.7], darkMaterial, [side * 0.08, 0, 1.63], undefined, `deepwater-shark-tail-${side < 0 ? "left" : "right"}`);
      tail.rotation.z = side * 0.18;
    }
    const dorsal = add(visual, [0.16, 0.94, 0.72], darkMaterial, [0, 0.68, 0.2], undefined, "deepwater-shark-dorsal-fin");
    dorsal.rotation.x = 0.14;
    add(visual, [0.52, 0.18, 1.7], material(0xd7dfdc, false, 0.9), [0, -0.37, -0.06], undefined, "deepwater-shark-pale-belly");
  } else if (kind === "dreadcoil") {
    const segmentCount = 9;
    for (let segment = 0; segment < segmentCount; segment += 1) {
      const taper = 1 - segment * 0.065;
      const x = Math.sin(segment * 0.72) * 0.28;
      const y = Math.cos(segment * 0.58) * 0.1;
      const z = -1.5 + segment * 0.52;
      const pivot = new THREE.Group();
      pivot.name = `dreadcoil-segment-${segment + 1}-pivot`;
      pivot.position.set(x, y, z);
      pivot.userData.phase = segment * 0.58;
      visual.add(pivot);
      add(pivot, [0.92 * taper, 0.72 * taper, 0.66], segment % 2 ? darkMaterial : bodyMaterial, [0, 0, 0], "body", `dreadcoil-segment-${segment + 1}`);
      if (segment < 6) {
        const glowBand = add(pivot, [0.96 * taper, 0.12, 0.12], material(0xe5548a, true, 0.82), [0, 0.25 * taper, 0.1], undefined, `dreadcoil-glow-band-${segment + 1}`);
        glowBand.rotation.y = segment % 2 ? 0.18 : -0.18;
      }
    }
    add(visual, [1.12, 0.86, 1.1], bodyMaterial, [0, 0, -2.03], "head", "dreadcoil-head");
    add(visual, [0.82, 0.38, 0.74], accentMaterial, [0, -0.14, -2.82], undefined, "dreadcoil-jaw");
    eyePair(0.35, 0.18, -2.6, 0.13, "dreadcoil");
    add(visual, [0.58, 0.1, 0.08], material(0x2a1422), [0, -0.26, -3.21], undefined, "dreadcoil-mouth");
    for (const side of [-1, 1]) {
      const crest = add(visual, [0.18, 0.72, 0.64], material(0xb24777, true, 0.88), [side * 0.45, 0.44, -2.03], "wings", `dreadcoil-${side < 0 ? "left" : "right"}-head-fin`);
      crest.rotation.z = side * -0.28;
      crest.userData.side = side;
      add(visual, [0.28, 0.82, 0.7], darkMaterial, [side * 0.12, 0, 3.36], undefined, `dreadcoil-tail-${side < 0 ? "left" : "right"}`).rotation.z = side * 0.24;
    }
    visual.userData.fluidSegmentPrefix = "dreadcoil-segment-";
  } else if (kind === "abyss-skater") {
    add(visual, [1.72, 0.25, 1.28], bodyMaterial, [0, 0.04, 0], "body", "abyss-skater-mantle");
    add(visual, [1.3, 0.12, 0.92], accentMaterial, [0, 0.22, -0.02], undefined, "abyss-skater-glow-mantle");
    add(visual, [0.7, 0.28, 0.58], darkMaterial, [0, 0.02, -0.78], "head", "abyss-skater-head");
    eyePair(0.24, 0.11, -1.08, 0.085, "abyss-skater");
    for (const side of [-1, 1]) for (let leg = 0; leg < 3; leg += 1) {
      const sideName = side < 0 ? "left" : "right";
      const rootZ = -0.42 + leg * 0.42;
      const limb = pivotBox([0.68, 0.07, 0.1], darkMaterial, [side * 0.66, -0.02, rootZ], [side * 0.33, -0.04, 0], "legs", `abyss-skater-${sideName}-stilt-${leg + 1}`);
      limb.rotation.z = side * -0.42;
      limb.userData.phase = leg * Math.PI / 2 + (side < 0 ? 0 : Math.PI);
      add(limb, [0.09, 0.66, 0.09], material(0x62ead7, true, 0.86), [side * 0.63, -0.34, 0], undefined, `abyss-skater-${sideName}-glow-stilt-tip-${leg + 1}`).rotation.z = side * 0.18;
    }
    for (let lamp = 0; lamp < 4; lamp += 1) {
      add(visual, [0.15, 0.15, 0.15], material(lamp % 2 ? 0x65ead6 : 0xc8fff2, true), [-0.48 + lamp * 0.32, 0.34, 0.2], undefined, `abyss-skater-lantern-${lamp + 1}`).rotation.y = Math.PI / 4;
    }
  } else if (kind === "tidepup") {
    add(visual, [0.84, 0.56, 1.2], bodyMaterial, [0, 0, 0.12], "body", "tidepup-body");
    add(visual, [0.7, 0.58, 0.68], accentMaterial, [0, 0.13, -0.72], "head", "tidepup-head");
    add(visual, [0.42, 0.25, 0.36], material(0xcaf0d8), [0, 0, -1.16], undefined, "tidepup-muzzle");
    eyePair(0.22, 0.22, -1.03, 0.085, "tidepup");
    add(visual, [0.08, 0.07, 0.05], material(0x15323f), [0, 0.05, -1.37], undefined, "tidepup-nose");
    for (const side of [-1, 1]) {
      const earFin = add(visual, [0.3, 0.46, 0.08], darkMaterial, [side * 0.37, 0.3, -0.65], "wings", `tidepup-${side < 0 ? "left" : "right"}-ear-fin`);
      earFin.rotation.z = side * -0.35;
      earFin.userData.side = side;
      const flipper = pivotBox([0.48, 0.09, 0.54], accentMaterial, [side * 0.34, -0.12, 0], [side * 0.23, 0, -0.05], "wings", `tidepup-${side < 0 ? "left" : "right"}-flipper`);
      flipper.rotation.z = side * -0.22;
      flipper.userData.side = side;
    }
    const tail = pivotBox([0.42, 0.18, 1.0], darkMaterial, [0, 0.02, 0.62], [0, 0, 0.48], "body", "tidepup-tail");
    tail.rotation.x = 0.22;
    add(tail, [0.68, 0.12, 0.5], accentMaterial, [0, 0, 1.0], undefined, "tidepup-tail-fan");
    for (const side of [-1, 1]) for (let bubble = 0; bubble < 2; bubble += 1) add(visual, [0.08, 0.08, 0.08], material(0xbaf8f0, true, 0.6), [side * (0.24 + bubble * 0.12), 0.38 + bubble * 0.13, -0.52 + bubble * 0.16], undefined, `tidepup-${side < 0 ? "left" : "right"}-bubble-mark-${bubble + 1}`).rotation.y = Math.PI / 4;
  } else if (kind === "worldshell-leviathan") {
    add(visual, [6.4, 1.8, 7.2], bodyMaterial, [0, 0.55, 0.2], "body", "worldshell-leviathan-body");
    add(visual, [7.6, 2.05, 7.8], accentMaterial, [0, 1.75, 0.35], "body", "worldshell-leviathan-shell");
    add(visual, [6.6, 0.72, 6.8], darkMaterial, [0, 2.88, 0.35], undefined, "worldshell-leviathan-shell-crown");
    add(visual, [2.1, 1.4, 2.5], bodyMaterial, [0, 0.48, -4.65], "head", "worldshell-leviathan-head");
    add(visual, [1.42, 0.62, 1.1], accentMaterial, [0, 0.32, -6.32], undefined, "worldshell-leviathan-beak");
    eyePair(0.7, 0.72, -5.93, 0.22, "worldshell-leviathan");
    for (const [side, z, phase, name] of [[-1, -1.9, 0, "front-left"], [1, -1.9, Math.PI, "front-right"], [-1, 2.25, Math.PI, "rear-left"], [1, 2.25, 0, "rear-right"]] as Array<[number, number, number, string]>) {
      const flipper = pivotBox([2.45, 0.44, 3.2], bodyMaterial, [side * 3.0, 0.25, z], [side * 1.15, 0, 0], "wings", `worldshell-leviathan-${name}-flipper`);
      flipper.rotation.z = side * -0.16;
      flipper.rotation.y = side * (z < 0 ? -0.18 : 0.18);
      flipper.userData.side = side;
      flipper.userData.phase = phase;
    }
    add(visual, [1.1, 0.65, 2.3], darkMaterial, [0, 0.35, 4.45], "body", "worldshell-leviathan-tail").rotation.x = 0.08;
    for (const [index, x, z, height, color] of [
      [1, -2.1, -0.8, 1.1, 0x5a8c51], [2, 1.7, -1.1, 1.45, 0x6ba35a], [3, -1.2, 1.4, 0.85, 0xe3a5bd], [4, 2.0, 1.25, 1.0, 0x7fbd69],
    ] as Array<[number, number, number, number, number]>) {
      add(visual, [0.34, height, 0.34], material(color), [x, 3.18 + height / 2, z], undefined, `worldshell-leviathan-shell-garden-${index}`);
      add(visual, [0.76, 0.18, 0.7], material(color), [x, 3.22, z], undefined, `worldshell-leviathan-shell-garden-crown-${index}`).rotation.y = index * 0.37;
    }
    const saddle = new THREE.Group();
    saddle.name = "worldshell-leviathan-saddle";
    saddle.visible = false;
    visual.add(saddle);
    add(saddle, [1.55, 0.28, 1.65], material(0x694730), [...LEVIATHAN_VISUAL_CONTRACTS.worldshell.saddleAnchor], undefined, "worldshell-leviathan-saddle-seat");
    LEVIATHAN_VISUAL_CONTRACTS.worldshell.cargoAnchors.forEach((anchor, index) => {
      const cargo = new THREE.Group();
      cargo.name = `worldshell-leviathan-cargo-${index + 1}`;
      cargo.visible = false;
      visual.add(cargo);
      add(cargo, [1.18, 0.9, 1.0], material(0x80522f), [...anchor], undefined, `worldshell-leviathan-chest-${index + 1}`);
      add(cargo, [1.22, 0.12, 1.04], material(0xd0aa53), [anchor[0], anchor[1] + 0.42, anchor[2]], undefined, `worldshell-leviathan-chest-band-${index + 1}`);
    });
    visual.userData.saddleAnchor = [...LEVIATHAN_VISUAL_CONTRACTS.worldshell.saddleAnchor];
    visual.userData.cargoAnchors = LEVIATHAN_VISUAL_CONTRACTS.worldshell.cargoAnchors.map((anchor) => [...anchor]);
    visual.userData.cargoChestLimit = LEVIATHAN_VISUAL_CONTRACTS.worldshell.cargoChestLimit;
    visual.userData.landSpeed = LEVIATHAN_VISUAL_CONTRACTS.worldshell.landSpeed;
  } else if (kind === "aetherbell-larva" || kind === "aetherbell-leviathan") {
    const adult = kind === "aetherbell-leviathan";
    const scale = adult ? 1 : 0.19;
    const bellRoot = new THREE.Group();
    bellRoot.name = `${kind}-bell-root`;
    visual.add(bellRoot);
    add(bellRoot, [5.4 * scale, 1.65 * scale, 5.4 * scale], bodyMaterial, [0, 0.55 * scale, 0], "body", `${kind}-bell`);
    add(bellRoot, [4.55 * scale, 0.78 * scale, 4.55 * scale], accentMaterial, [0, 1.56 * scale, 0], undefined, `${kind}-bell-crown`);
    add(bellRoot, [3.75 * scale, 0.18 * scale, 3.75 * scale], material(0x75f3de, true, 0.88), [0, 1.98 * scale, 0], undefined, `${kind}-crown-glow`);
    for (let ring = 0; ring < 3; ring += 1) add(bellRoot, [5.5 * scale, 0.1 * scale, (4.8 - ring * 0.48) * scale], material(ring % 2 ? 0xb68cff : 0x5be4d3, true, 0.76), [0, (0.15 + ring * 0.42) * scale, 0], undefined, `${kind}-glow-ring-${ring + 1}`);
    for (const side of [-1, 1]) {
      add(bellRoot, [0.24 * scale, 0.24 * scale, 0.12 * scale], eyeMaterial, [side * 1.3 * scale, 0.62 * scale, -2.73 * scale], undefined, `${kind}-${side < 0 ? "left" : "right"}-eye`);
      add(bellRoot, [0.09 * scale, 0.09 * scale, 0.08 * scale], material(0x1f2551), [side * 1.3 * scale, 0.62 * scale, -2.81 * scale], undefined, `${kind}-${side < 0 ? "left" : "right"}-pupil`);
    }
    const tailCount = adult ? 8 : 5;
    for (let tailIndex = 0; tailIndex < tailCount; tailIndex += 1) {
      const angle = tailIndex / tailCount * TAU;
      const radius = (adult ? 1.95 : 1.2) * scale;
      const tail = pivotBox(
        [(adult ? 0.42 : 0.54) * scale, (adult ? 4.8 : 3.4) * scale, (adult ? 0.42 : 0.5) * scale],
        tailIndex % 2 ? accentMaterial : material(0x5fe2d1, true, 0.82),
        [Math.cos(angle) * radius, -0.08 * scale, Math.sin(angle) * radius],
        [0, -(adult ? 2.35 : 1.65) * scale, 0],
        "wings",
        `${kind}-fluid-tail-${tailIndex + 1}`,
      );
      tail.userData.side = tailIndex % 2 ? -1 : 1;
      tail.userData.phase = tailIndex / tailCount * TAU;
      tail.rotation.z = Math.cos(angle) * 0.13;
      tail.rotation.x = Math.sin(angle) * 0.13;
      add(tail, [(adult ? 0.72 : 0.66) * scale, (adult ? 0.55 : 0.42) * scale, (adult ? 0.72 : 0.66) * scale], material(0xd9b5ff, true, 0.68), [0, -(adult ? 4.78 : 3.38) * scale, 0], undefined, `${kind}-tail-light-${tailIndex + 1}`);
    }
    if (adult) {
      const saddle = new THREE.Group();
      saddle.name = "aetherbell-leviathan-saddle";
      saddle.visible = false;
      visual.add(saddle);
      add(saddle, [1.25, 0.3, 1.35], material(0x69436f), [...LEVIATHAN_VISUAL_CONTRACTS.aetherbell.saddleAnchor], undefined, "aetherbell-leviathan-saddle-seat");
      const cargo = new THREE.Group();
      cargo.name = "aetherbell-leviathan-cargo-1";
      cargo.visible = false;
      visual.add(cargo);
      add(cargo, [1.05, 0.82, 0.92], material(0x65465e), [...LEVIATHAN_VISUAL_CONTRACTS.aetherbell.cargoAnchor], undefined, "aetherbell-leviathan-chest");
      add(cargo, [1.09, 0.12, 0.96], material(0x78e4d5, true), [LEVIATHAN_VISUAL_CONTRACTS.aetherbell.cargoAnchor[0], LEVIATHAN_VISUAL_CONTRACTS.aetherbell.cargoAnchor[1] + 0.38, LEVIATHAN_VISUAL_CONTRACTS.aetherbell.cargoAnchor[2]], undefined, "aetherbell-leviathan-chest-band");
      visual.userData.saddleAnchor = [...LEVIATHAN_VISUAL_CONTRACTS.aetherbell.saddleAnchor];
      visual.userData.cargoAnchors = [[...LEVIATHAN_VISUAL_CONTRACTS.aetherbell.cargoAnchor]];
      visual.userData.cargoChestLimit = LEVIATHAN_VISUAL_CONTRACTS.aetherbell.cargoChestLimit;
      visual.userData.airSeaMorph = true;
    }
    visual.userData.bellRootName = `${kind}-bell-root`;
    visual.userData.fluidTailPrefix = `${kind}-fluid-tail-`;
  } else if (kind === "shoalfin" || kind === "coralback" || kind === "brookdart" || kind === "gloomfin"
    || kind === "silverthread" || kind === "reedneedle" || kind === "emberribbon" || kind === "cavefilament"
    || kind === "redfin-salmon" || kind === "blue-mackerel" || kind === "glassfin" || kind === "lanternjaw" || kind === "syrupfin") {
    const prefix = kind;
    const thin = kind === "silverthread" || kind === "reedneedle" || kind === "emberribbon" || kind === "cavefilament"
      || kind === "redfin-salmon" || kind === "blue-mackerel" || kind === "glassfin";
    const large = kind === "coralback" ? 1.28 : kind === "brookdart" ? 0.72 : kind === "gloomfin" ? 0.92
      : kind === "redfin-salmon" ? 1.16 : kind === "blue-mackerel" ? 1.02 : kind === "glassfin" ? 0.98
      : kind === "lanternjaw" ? 1.18 : kind === "syrupfin" ? 0.9 : thin ? 0.88 : 0.82;
    const bodyWidth = 0.5 * large * (thin ? 0.5 : 1);
    const bodyHeight = 0.42 * large * (thin ? 0.48 : 1);
    const bodyLength = 0.92 * large * (thin ? 1.35 : 1);
    const headWidth = 0.43 * large * (thin ? 0.52 : 1);
    const headHeight = 0.38 * large * (thin ? 0.55 : 1);
    const headLength = 0.42 * large;
    const headZ = -0.67 * large * (thin ? 1.2 : 0.82);
    add(visual, [bodyWidth, bodyHeight, bodyLength], bodyMaterial, [0, 0, 0], "body", `${prefix}-body`);
    add(visual, [headWidth, headHeight, headLength], accentMaterial, [0, 0, headZ], "head", `${prefix}-head`);
    eyePair(Math.min(headWidth * 0.34, 0.15 * large), headHeight * 0.21, headZ - headLength / 2 - 0.018, 0.055 * large, prefix);
    const sideFinWidth = 0.36 * large;
    const sideFinCenterX = bodyWidth / 2 + sideFinWidth / 2 - FISH_FIN_ATTACHMENT_OVERLAP * large;
    for (const side of [-1, 1]) {
      const fin = add(visual, [sideFinWidth, 0.055, 0.34 * large], accentMaterial, [side * sideFinCenterX, -0.03, 0.02], "wings", `${prefix}-${side < 0 ? "left" : "right"}-fin`);
      fin.rotation.z = side * -0.25;
      fin.rotation.y = side * -0.18;
      fin.userData.side = side;
    }
    const tailMaterial = kind === "gloomfin" || kind === "glassfin" || kind === "lanternjaw" ? material(accentColor, true, 0.84) : accentMaterial;
    const tailLength = 0.46 * large;
    const tailCenterZ = bodyLength / 2 + tailLength / 2 - FISH_FIN_ATTACHMENT_OVERLAP * large;
    for (const side of [-1, 1]) {
      const tail = add(visual, [0.13 * large, 0.44 * large, tailLength], tailMaterial, [side * 0.08 * large, 0, tailCenterZ], undefined, `${prefix}-tail-${side < 0 ? "left" : "right"}`);
      tail.rotation.z = side * 0.22;
    }
    const dorsalHeight = 0.34 * large;
    const dorsalCenterY = bodyHeight / 2 + dorsalHeight / 2 - FISH_FIN_ATTACHMENT_OVERLAP * large;
    add(visual, [0.08 * large, dorsalHeight, 0.42 * large], darkMaterial, [0, dorsalCenterY, 0.02], undefined, `${prefix}-dorsal-fin`).rotation.x = 0.12;
    if (kind === "coralback") {
      const coralMaterial = material(0xf18e7c);
      for (const [index, x, z, height] of [[1, -0.17, 0.14, 0.34], [2, 0.12, 0.03, 0.44], [3, 0.2, 0.25, 0.28]] as Array<[number, number, number, number]>) {
        add(visual, [0.12, height, 0.12], coralMaterial, [x, 0.36 + height / 2, z], undefined, `coralback-coral-${index}`);
      }
    } else if (kind === "gloomfin") {
      add(visual, [0.22, 0.16, 0.12], material(0x89fff1, true), [0, -0.02, -0.82], undefined, "gloomfin-lure");
      add(visual, [0.035, 0.42, 0.035], darkMaterial, [0, 0.36, -0.45], undefined, "gloomfin-lure-stem").rotation.x = -0.46;
    } else if (kind === "redfin-salmon") {
      add(visual, [0.38 * large, 0.07, 0.62 * large], material(0xc84f45), [0, -0.17 * large, 0.06], undefined, "redfin-salmon-ventral-fin");
      add(visual, [0.32 * large, 0.06, 0.42 * large], material(0xc84f45), [0, 0.22 * large, 0.11], undefined, "redfin-salmon-red-dorsal");
      for (const side of [-1, 1]) add(visual, [0.32 * large, 0.04, 0.28 * large], material(0xc84f45), [side * 0.2 * large, -0.03, 0.03], undefined, `redfin-salmon-${side < 0 ? "left" : "right"}-red-fin`);
    } else if (kind === "blue-mackerel") {
      for (let stripe = 0; stripe < 5; stripe += 1) {
        const mark = add(visual, [0.32 * large, 0.04, 0.12 * large], darkMaterial, [0, 0.15 * large, -0.3 * large + stripe * 0.24 * large], undefined, `blue-mackerel-stripe-${stripe + 1}`);
        mark.rotation.y = (stripe % 2 ? 1 : -1) * 0.12;
      }
    } else if (kind === "glassfin") {
      const glass = material(0xc9fff5, true, 0.52);
      add(visual, [bodyWidth * 0.76, bodyHeight * 0.58, bodyLength * 0.72], glass, [0, 0.03, 0.04], undefined, "glassfin-prism-core").rotation.y = Math.PI / 4;
      for (const side of [-1, 1]) add(visual, [0.22 * large, 0.035, 0.54 * large], glass, [side * bodyWidth * 0.48, 0.04, 0.14], undefined, `glassfin-${side < 0 ? "left" : "right"}-glass-sail`).rotation.y = side * -0.16;
      add(visual, [0.06 * large, 0.48 * large, 0.52 * large], glass, [0, dorsalCenterY + 0.08 * large, 0.18], undefined, "glassfin-prismatic-dorsal").rotation.x = 0.1;
    } else if (kind === "lanternjaw") {
      add(visual, [0.58 * large, 0.18 * large, 0.36 * large], darkMaterial, [0, -0.18 * large, headZ - 0.13 * large], undefined, "lanternjaw-lower-jaw");
      for (let lamp = 0; lamp < 5; lamp += 1) add(visual, [0.1 * large, 0.1 * large, 0.06 * large], material(lamp % 2 ? 0x59e4cd : 0xc0fff4, true), [-0.22 * large + lamp * 0.11 * large, -0.09 * large, headZ - 0.35 * large], undefined, `lanternjaw-jaw-light-${lamp + 1}`);
      for (const side of [-1, 1]) add(visual, [0.24 * large, 0.4 * large, 0.08 * large], material(0x5ce5d0, true, 0.74), [side * 0.27 * large, 0.13 * large, -0.08], undefined, `lanternjaw-${side < 0 ? "left" : "right"}-signal-panel`).rotation.z = side * -0.2;
    } else if (kind === "syrupfin") {
      const candyGlass = material(0xffe0a1, false, 0.68);
      add(visual, [bodyWidth * 0.82, bodyHeight * 0.32, bodyLength * 0.74], material(0x794124), [0, 0.04, 0.03], undefined, "syrupfin-molasses-stripe");
      for (const side of [-1, 1]) add(visual, [0.28 * large, 0.04, 0.4 * large], candyGlass, [side * bodyWidth * 0.58, -0.01, 0.08], undefined, `syrupfin-${side < 0 ? "left" : "right"}-glass-fin-overlay`).rotation.y = side * -0.18;
      add(visual, [0.07 * large, 0.42 * large, 0.36 * large], candyGlass, [0, dorsalCenterY + 0.03, 0.04], undefined, "syrupfin-glass-dorsal-overlay");
    } else {
      add(visual, [0.3 * large, 0.055, 0.5 * large], material(eyeColor), [0, 0.18 * large, 0.02], undefined, `${prefix}-back-stripe`);
    }
  } else if (kind === "honeybee" || kind === "hive-queen") {
    const queen = kind === "hive-queen";
    const beeChildStart = visual.children.length;
    const scale = queen ? 1.45 : 1;
    add(visual, [0.24 * scale, 0.22 * scale, 0.34 * scale], bodyMaterial, [0, 0, 0.12], "body", `${kind}-abdomen-back`);
    add(visual, [0.25 * scale, 0.23 * scale, 0.22 * scale], darkMaterial, [0, 0, -0.08], "body", `${kind}-abdomen-band`);
    add(visual, [0.24 * scale, 0.21 * scale, 0.28 * scale], bodyMaterial, [0, 0, -0.29], "body", `${kind}-thorax`);
    add(visual, [0.23 * scale, 0.22 * scale, 0.22 * scale], accentMaterial, [0, 0.02, -0.52 * scale], "head", `${kind}-head`);
    eyePair(0.075 * scale, 0.06 * scale, -0.64 * scale, 0.055 * scale, kind);
    const wingMaterial = material(0xd9f5f0, false, 0.62);
    for (const side of [-1, 1]) {
      const wing = add(visual, [0.34 * scale, 0.035, 0.42 * scale], wingMaterial, [side * 0.21 * scale, 0.12 * scale, -0.08], "wings", `${kind}-${side < 0 ? "left" : "right"}-wing`);
      wing.rotation.z = side * -0.22;
      wing.rotation.y = side * -0.18;
      const antenna = add(visual, [0.035, 0.035, 0.28 * scale], darkMaterial, [side * 0.075 * scale, 0.13 * scale, -0.73 * scale], undefined, `${kind}-${side < 0 ? "left" : "right"}-antenna`);
      antenna.rotation.y = side * 0.18;
      antenna.rotation.x = -0.18;
    }
    add(visual, [0.04, 0.04, 0.23 * scale], darkMaterial, [0, -0.02, 0.38 * scale], undefined, `${kind}-stinger`);
    if (queen) for (const [index, x] of [-0.1, 0, 0.1].entries()) add(visual, [0.06, index === 1 ? 0.2 : 0.15, 0.06], material(0xf5d96a, true), [x, 0.27 + (index === 1 ? 0.025 : 0), -0.5], undefined, `hive-queen-crown-${index + 1}`);
    // Workers should read as genuinely tiny pollinators beside butterflies;
    // the queen remains an intentionally oversized, readable encounter.
    const speciesScale = queen ? 0.62 : 0.22;
    for (const child of visual.children.slice(beeChildStart)) {
      child.position.multiplyScalar(speciesScale);
      child.scale.multiplyScalar(speciesScale);
    }
  } else if (kind === "reed-dragonfly") {
    add(visual, [0.16, 0.14, 0.62], bodyMaterial, [0, 0, 0.15], "body", "reed-dragonfly-abdomen");
    add(visual, [0.2, 0.18, 0.22], darkMaterial, [0, 0, -0.28], "body", "reed-dragonfly-thorax");
    add(visual, [0.24, 0.2, 0.22], accentMaterial, [0, 0.02, -0.49], "head", "reed-dragonfly-head");
    eyePair(0.09, 0.07, -0.61, 0.09, "reed-dragonfly");
    const wingMaterial = material(0xcff8ed, false, 0.55);
    for (const side of [-1, 1]) for (const [pair, z] of [["front", -0.22], ["rear", 0.02]] as const) {
      const wing = add(visual, [0.54, 0.028, 0.2], wingMaterial, [side * 0.31, 0.11, z], "wings", `reed-dragonfly-${side < 0 ? "left" : "right"}-${pair}-wing`);
      wing.rotation.y = side * (pair === "front" ? -0.14 : 0.12);
      wing.rotation.z = side * -0.08;
    }
    for (let segment = 0; segment < 3; segment += 1) add(visual, [0.18 - segment * 0.02, 0.04, 0.1], accentMaterial, [0, 0.02, 0.11 + segment * 0.18], undefined, `reed-dragonfly-abdomen-band-${segment + 1}`);
  } else if (kind === "peelop") {
    add(visual, [0.7, 0.58, 0.86], bodyMaterial, [0, 0, 0.13], "body", "peelop-body");
    add(visual, [0.6, 0.56, 0.54], accentMaterial, [0, 0.18, -0.51], "head", "peelop-head");
    add(visual, [0.32, 0.22, 0.24], material(0xffeac0), [0, 0.05, -0.86], undefined, "peelop-muzzle");
    eyePair(0.17, 0.24, -0.78, 0.075, "peelop");
    add(visual, [0.08, 0.07, 0.045], material(0x75401f), [0, 0.08, -0.99], undefined, "peelop-nose");
    for (const side of [-1, 1]) {
      const ear = pivotBox([0.24, 0.72, 0.24], bodyMaterial, [side * 0.19, 0.42, -0.43], [side * 0.04, 0.35, 0], "head", `peelop-${side < 0 ? "left" : "right"}-banana-ear`);
      ear.rotation.z = side * -0.18;
      const tip = add(ear, [0.25, 0.16, 0.25], material(0x73532b), [side * 0.05, 0.74, 0], undefined, `peelop-${side < 0 ? "left" : "right"}-ear-tip`);
      tip.rotation.z = side * 0.12;
    }
    for (const [px, pz, phase, name] of [[-0.22, -0.15, 0, "front-left"], [0.22, -0.15, Math.PI, "front-right"], [-0.25, 0.35, Math.PI, "rear-left"], [0.25, 0.35, 0, "rear-right"]] as Array<[number, number, number, string]>) {
      const foot = pivotBox([0.2, 0.28, name.startsWith("rear") ? 0.34 : 0.24], accentMaterial, [px, -0.17, pz], [0, -0.14, -0.04], "legs", `peelop-${name}-foot`);
      foot.userData.phase = phase;
    }
    add(visual, [0.32, 0.32, 0.32], material(0xffefbb), [0, 0.08, 0.64], undefined, "peelop-tail");
  } else if (kind === "reliquary-sentinel") {
    add(visual, [0.86, 0.82, 0.62], bodyMaterial, [0, 0.62, 0], "body", "reliquary-sentinel-torso");
    add(visual, [0.34, 0.42, 0.14], material(0xffd36c, true), [0, 0.66, -0.37], undefined, "reliquary-sentinel-core");
    add(visual, [0.62, 0.52, 0.56], accentMaterial, [0, 1.25, -0.02], "head", "reliquary-sentinel-head");
    eyePair(0.17, 1.31, -0.31, 0.09, "reliquary-sentinel");
    for (const side of [-1, 1]) {
      add(visual, [0.32, 0.28, 0.7], darkMaterial, [side * 0.57, 0.91, 0.02], undefined, `reliquary-sentinel-${side < 0 ? "left" : "right"}-shoulder`);
      const arm = pivotBox([0.25, 0.78, 0.28], bodyMaterial, [side * 0.55, 0.82, 0], [0, -0.38, 0], "arms", `reliquary-sentinel-${side < 0 ? "left" : "right"}-arm`);
      arm.userData.side = side;
      arm.userData.phase = side < 0 ? 0 : Math.PI;
      add(arm, [0.38, 0.28, 0.42], darkMaterial, [0, -0.82, -0.04], undefined, `reliquary-sentinel-${side < 0 ? "left" : "right"}-fist`);
      const leg = pivotBox([0.34, 0.74, 0.38], accentMaterial, [side * 0.25, 0.34, 0.04], [0, -0.37, 0], "legs", `reliquary-sentinel-${side < 0 ? "left" : "right"}-leg`);
      leg.userData.phase = side < 0 ? 0 : Math.PI;
      add(leg, [0.48, 0.22, 0.62], darkMaterial, [0, -0.78, -0.11], undefined, `reliquary-sentinel-${side < 0 ? "left" : "right"}-foot`);
    }
    for (const [index, x] of [-0.22, 0, 0.22].entries()) add(visual, [0.13, 0.34 + (index === 1 ? 0.15 : 0), 0.18], bodyMaterial, [x, 1.66 + (index === 1 ? 0.07 : 0), 0], undefined, `reliquary-sentinel-crown-${index + 1}`);
  } else if (kind === "skeleton") {
    const bone = bodyMaterial;
    add(visual, [0.42, 0.32, 0.3], darkMaterial, [0, 0.35, 0], "body", "skeleton-pelvis");
    add(visual, [0.12, 0.72, 0.12], bone, [0, 0.72, 0.05], undefined, "skeleton-spine");
    for (let rib = 0; rib < 4; rib += 1) add(visual, [0.68 - rib * 0.05, 0.075, 0.14], bone, [0, 0.6 + rib * 0.14, 0], undefined, `skeleton-rib-${rib + 1}`);
    add(visual, [0.52, 0.5, 0.46], bone, [0, 1.28, -0.03], "head", "skeleton-skull");
    add(visual, [0.38, 0.14, 0.2], accentMaterial, [0, 1.08, -0.17], undefined, "skeleton-jaw");
    eyePair(0.15, 1.36, -0.275, 0.11, "skeleton");
    for (const side of [-1, 1]) {
      const leg = pivotBox([0.14, 0.78, 0.16], bone, [side * 0.18, 0.32, 0], [0, -0.39, 0], "legs", `skeleton-${side < 0 ? "left" : "right"}-leg`);
      leg.userData.phase = side < 0 ? 0 : Math.PI;
      add(leg, [0.24, 0.1, 0.38], accentMaterial, [0, -0.8, -0.1], undefined, `skeleton-${side < 0 ? "left" : "right"}-foot`);
      const arm = pivotBox([0.13, 0.7, 0.13], bone, [side * 0.41, 1.02, 0], [0, -0.35, 0], "arms", `skeleton-${side < 0 ? "left" : "right"}-arm`);
      arm.userData.side = side;
      arm.userData.phase = side < 0 ? 0 : Math.PI;
    }
    const bowMaterial = material(0x7b4d27);
    const bowRoot = parts.arms[0];
    add(bowRoot, [0.09, 0.34, 0.08], bowMaterial, [-0.04, -0.66, -0.23], undefined, "skeleton-bow-grip").rotation.z = -0.18;
    add(bowRoot, [0.08, 0.5, 0.08], bowMaterial, [-0.14, -0.25, -0.23], undefined, "skeleton-bow-upper-limb").rotation.z = 0.2;
    add(bowRoot, [0.08, 0.5, 0.08], bowMaterial, [-0.14, -1.07, -0.23], undefined, "skeleton-bow-lower-limb").rotation.z = -0.56;
    add(bowRoot, [0.025, 0.91, 0.025], material(0xe5d7b6), [0.02, -0.66, -0.25], undefined, "skeleton-bow-string");
    add(bowRoot, [0.035, 0.035, 0.74], material(0x8a6339), [0.02, -0.65, -0.62], undefined, "skeleton-nocked-arrow");
  } else if (kind === "zombie") {
    const zombie = createZombieSpec();
    const limbPivotPositions: Record<string, [number, number, number]> = {
      leftLeg: [-0.16, 0.74, 0], rightLeg: [0.16, 0.74, 0],
      leftArm: [-0.445, 1.25, 0.09], rightArm: [0.445, 1.25, 0.09],
    };
    const limbPivots = new Map<string, THREE.Group>();
    for (const modelBox of zombie.boxes) {
      const meshMaterial = modelBox.emissive
        ? new THREE.MeshBasicMaterial({ color: modelBox.color })
        : new THREE.MeshLambertMaterial({ color: modelBox.color });
      const semantic: keyof MobVisualParts = modelBox.part.includes("Leg") ? "legs"
        : modelBox.part.includes("Arm") ? "arms"
          : modelBox.part === "head" ? "head" : "body";
      const pivotPosition = limbPivotPositions[modelBox.part];
      let parent: THREE.Object3D = visual;
      let position = [...modelBox.position] as [number, number, number];
      if (pivotPosition) {
        let pivot = limbPivots.get(modelBox.part);
        if (!pivot) {
          pivot = new THREE.Group();
          pivot.name = `zombie-${modelBox.part}-pivot`;
          pivot.position.set(...pivotPosition);
          pivot.userData.phase = modelBox.part === "leftLeg" || modelBox.part === "leftArm" ? 0 : Math.PI;
          visual.add(pivot);
          parts[semantic].push(pivot);
          limbPivots.set(modelBox.part, pivot);
        }
        parent = pivot;
        position = [modelBox.position[0] - pivotPosition[0], modelBox.position[1] - pivotPosition[1], modelBox.position[2] - pivotPosition[2]];
      }
      const mesh = add(parent, [...modelBox.size] as [number, number, number], meshMaterial, position, pivotPosition ? undefined : semantic, `zombie-${modelBox.id}`);
      mesh.rotation.set(...(modelBox.rotation ?? [0, 0, 0]));
      mesh.userData.bodyPart = modelBox.part;
    }
    bodyMaterial.dispose();
    accentMaterial.dispose();
    eyeMaterial.dispose();
    darkMaterial.dispose();
  }

  group.userData.mobId = id;
  return { group, visual, parts };
}

/**
 * Fluid secondary motion shared by runtime mobs, bestiary previews and the
 * inspection tool. `airProgress` is 0 in sea form and 1 in sky-sail form.
 */
export function applyOceanCreaturePose(
  visual: THREE.Object3D,
  kind: CoreMobKind,
  timeSeconds: number,
  travelAmount = 0,
  airProgress = 0,
) {
  const time = Number.isFinite(timeSeconds) ? timeSeconds : 0;
  const travel = THREE.MathUtils.clamp(Number.isFinite(travelAmount) ? travelAmount : 0, 0, 1);
  const morph = THREE.MathUtils.clamp(Number.isFinite(airProgress) ? airProgress : 0, 0, 1);
  if (["shoalfin", "coralback", "brookdart", "gloomfin", "silverthread", "reedneedle", "emberribbon", "cavefilament", "redfin-salmon", "blue-mackerel", "glassfin", "lanternjaw", "syrupfin"].includes(kind)) {
    for (const side of ["left", "right"] as const) {
      const tail = visual.getObjectByName(`${kind}-tail-${side}`);
      if (tail) tail.rotation.y = Math.sin(time * (4.2 + travel * 3) + (side === "left" ? 0 : 0.55)) * (0.15 + travel * 0.16);
    }
    const dorsal = visual.getObjectByName(`${kind}-dorsal-fin`);
    if (dorsal) dorsal.rotation.z = Math.sin(time * 2.4) * 0.055;
  } else if (kind === "dreadcoil") {
    for (let index = 0; index < 9; index += 1) {
      const segment = visual.getObjectByName(`dreadcoil-segment-${index + 1}-pivot`);
      if (!segment) continue;
      segment.rotation.y = Math.sin(time * (1.8 + travel) - index * 0.62) * (0.18 + index * 0.018);
      segment.rotation.x = Math.cos(time * 1.35 - index * 0.48) * 0.045;
    }
  } else if (kind === "worldshell-leviathan") {
    for (const [index, name] of ["front-left", "front-right", "rear-left", "rear-right"].entries()) {
      const flipper = visual.getObjectByName(`worldshell-leviathan-${name}-flipper-pivot`);
      if (flipper) flipper.rotation.x = Math.sin(time * 0.55 + index * Math.PI / 2) * (0.08 + travel * 0.08);
    }
  }
  if (kind !== "aetherbell-larva" && kind !== "aetherbell-leviathan") return;

  const bell = visual.getObjectByName(`${kind}-bell-root`);
  if (bell) {
    const sea = LEVIATHAN_VISUAL_CONTRACTS.aetherbell.seaBellScale;
    const air = LEVIATHAN_VISUAL_CONTRACTS.aetherbell.airBellScale;
    const pulse = 1 + Math.sin(time * (kind === "aetherbell-larva" ? 2.2 : 1.15)) * 0.035;
    bell.scale.set(
      THREE.MathUtils.lerp(sea[0], air[0], morph) * pulse,
      THREE.MathUtils.lerp(sea[1], air[1], morph) / Math.sqrt(pulse),
      THREE.MathUtils.lerp(sea[2], air[2], morph) * pulse,
    );
  }
  const tailCount = kind === "aetherbell-leviathan" ? 8 : 5;
  for (let index = 0; index < tailCount; index += 1) {
    const tail = visual.getObjectByName(`${kind}-fluid-tail-${index + 1}-pivot`);
    if (!tail) continue;
    const phase = index / tailCount * TAU;
    const seaSweep = Math.sin(time * 1.35 + phase) * 0.18;
    const airSweep = Math.sin(time * 0.62 + phase) * 0.3;
    tail.rotation.x = Math.sin(phase) * 0.13 + THREE.MathUtils.lerp(seaSweep * 0.35, airSweep, morph);
    tail.rotation.z = Math.cos(phase) * 0.13 + THREE.MathUtils.lerp(seaSweep, airSweep * 0.45, morph);
    tail.scale.y = THREE.MathUtils.lerp(1, 0.78, morph);
  }
}

/** Visible arrow mesh used by Skeleton Archer projectiles. Local forward is -Z. */
export function createSkeletonArrowVisual() {
  const group = createArrowVisual();
  group.name = "skeleton-arrow-projectile";
  const names = ["arrow-shaft", "arrow-tip", "arrow-flat-fletching", "arrow-upright-fletching"];
  group.children.forEach((child, index) => { child.name = names[index] ?? `arrow-detail-${index + 1}`; });
  return group;
}
