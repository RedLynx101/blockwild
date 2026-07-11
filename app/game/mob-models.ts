import * as THREE from "three";
import { createZombieSpec, FACTION_WEAPON_CONTRACTS, RATTLEKIN_CLUB_CONTRACT, RIDGEBACK_GROUND_LIFT } from "./model-specs";
import { CORE_MOB_ORDER, MOB_DEFS, type CoreMobKind, type MobKind } from "./mobs";
import { createArrowVisual } from "./projectiles";

export type MobVisualParts = Record<"legs" | "wings" | "arms" | "head" | "body", THREE.Object3D[]>;

export type MobVisual = {
  group: THREE.Group;
  visual: THREE.Group;
  parts: MobVisualParts;
};

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

  const sentientNpc = kind.startsWith("hobbit-") || kind.startsWith("goblin-");
  const buildSentientNpc = () => {
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

  if (sentientNpc) {
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
  } else if (kind === "emberjay" || kind === "canopy-lark") {
    const prefix = kind;
    add(visual, [0.44, 0.4, 0.7], bodyMaterial, [0, 0.04, 0.05], "body", `${prefix}-body`);
    add(visual, [0.34, 0.34, 0.38], accentMaterial, [0, 0.19, -0.43], "head", `${prefix}-head`);
    const beakColor = kind === "emberjay" ? 0xe7be58 : 0x765b36;
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
    else add(visual, [0.3, 0.08, 0.3], material(0xf0e59f), [0, 0.05, -0.37], undefined, "canopy-lark-breast-mark");
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
  } else if (kind === "shoalfin" || kind === "coralback" || kind === "brookdart" || kind === "gloomfin"
    || kind === "silverthread" || kind === "reedneedle" || kind === "emberribbon" || kind === "cavefilament"
    || kind === "redfin-salmon" || kind === "blue-mackerel") {
    const prefix = kind;
    const thin = kind === "silverthread" || kind === "reedneedle" || kind === "emberribbon" || kind === "cavefilament"
      || kind === "redfin-salmon" || kind === "blue-mackerel";
    const large = kind === "coralback" ? 1.28 : kind === "brookdart" ? 0.72 : kind === "gloomfin" ? 0.92
      : kind === "redfin-salmon" ? 1.16 : kind === "blue-mackerel" ? 1.02 : thin ? 0.88 : 0.82;
    add(visual, [0.5 * large * (thin ? 0.5 : 1), 0.42 * large * (thin ? 0.48 : 1), 0.92 * large * (thin ? 1.35 : 1)], bodyMaterial, [0, 0, 0], "body", `${prefix}-body`);
    add(visual, [0.43 * large * (thin ? 0.52 : 1), 0.38 * large * (thin ? 0.55 : 1), 0.42 * large], accentMaterial, [0, 0, -0.67 * large * (thin ? 1.2 : 0.82)], "head", `${prefix}-head`);
    eyePair(0.15 * large, 0.08 * large, -0.78 * large, 0.055 * large, prefix);
    for (const side of [-1, 1]) {
      const fin = add(visual, [0.36 * large, 0.055, 0.34 * large], accentMaterial, [side * 0.34 * large, -0.03, 0.02], "wings", `${prefix}-${side < 0 ? "left" : "right"}-fin`);
      fin.rotation.z = side * -0.25;
      fin.rotation.y = side * -0.18;
    }
    const tailMaterial = kind === "gloomfin" ? material(accentColor, true, 0.84) : accentMaterial;
    for (const side of [-1, 1]) {
      const tail = add(visual, [0.13 * large, 0.44 * large, 0.46 * large], tailMaterial, [side * 0.08 * large, 0, 0.64 * large], undefined, `${prefix}-tail-${side < 0 ? "left" : "right"}`);
      tail.rotation.z = side * 0.22;
    }
    add(visual, [0.08 * large, 0.34 * large, 0.42 * large], darkMaterial, [0, 0.32 * large, 0.02], undefined, `${prefix}-dorsal-fin`).rotation.x = 0.12;
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

/** Visible arrow mesh used by Skeleton Archer projectiles. Local forward is -Z. */
export function createSkeletonArrowVisual() {
  const group = createArrowVisual();
  group.name = "skeleton-arrow-projectile";
  const names = ["arrow-shaft", "arrow-tip", "arrow-flat-fletching", "arrow-upright-fletching"];
  group.children.forEach((child, index) => { child.name = names[index] ?? `arrow-detail-${index + 1}`; });
  return group;
}
