import * as THREE from "three";
import { createZombieSpec, RIDGEBACK_GROUND_LIFT } from "./model-specs";
import { CORE_MOB_ORDER, MOB_DEFS, type CoreMobKind, type MobKind } from "./mobs";

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

  if (kind === "mossling") {
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
    const club = add(parts.arms[1], [0.2, 0.86, 0.2], accentMaterial, [0, -0.76, -0.06], undefined, "rattlekin-club-handle");
    club.rotation.z = -0.18;
    add(parts.arms[1], [0.36, 0.34, 0.34], darkMaterial, [-0.11, -1.17, -0.06], undefined, "rattlekin-club-head").rotation.z = -0.18;
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
