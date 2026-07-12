import * as THREE from "three";
import { MOB_DEFS, type AdventureMobKind } from "./mobs";

type AdventureVisualParts = Record<"legs" | "wings" | "arms" | "head" | "body", THREE.Object3D[]>;

export type AdventureMobVisual = Readonly<{
  group: THREE.Group;
  visual: THREE.Group;
  parts: AdventureVisualParts;
}>;

/**
 * Authored box-model rigs for v1.3 adventure encounters. Keeping them outside
 * the already-large legacy model factory makes dungeon art reviewable without
 * coupling it to rabbit, bird or dragon geometry.
 */
export function createAdventureMobVisual(kind: AdventureMobKind, id: number): AdventureMobVisual {
  const definition = MOB_DEFS[kind];
  const group = new THREE.Group();
  const visual = new THREE.Group();
  const parts: AdventureVisualParts = { legs: [], wings: [], arms: [], head: [], body: [] };
  group.name = `${kind}-root`;
  visual.name = `${kind}-visual`;
  group.add(visual);

  const material = (color: THREE.ColorRepresentation, emissive = false, opacity = 1) => emissive
    ? new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity })
    : new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity });
  const [bodyColor, accentColor, eyeColor] = definition.colors;
  const body = material(bodyColor);
  const accent = material(accentColor);
  const eye = material(eyeColor, true);
  const dark = material(new THREE.Color(bodyColor).multiplyScalar(0.52));
  const pale = material(new THREE.Color(accentColor).lerp(new THREE.Color(0xffffff), 0.45));
  const glass = material(eyeColor, false, 0.58);

  const add = (parent: THREE.Object3D, size: readonly [number, number, number], position: readonly [number, number, number], meshMaterial: THREE.Material, name: string, part?: keyof AdventureVisualParts) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), meshMaterial);
    mesh.name = name;
    mesh.position.set(...position);
    mesh.userData.mobId = id;
    if (part) {
      mesh.userData.bodyPart = part;
      parts[part].push(mesh);
    }
    parent.add(mesh);
    return mesh;
  };
  const pivotBox = (size: readonly [number, number, number], pivotPosition: readonly [number, number, number], offset: readonly [number, number, number], meshMaterial: THREE.Material, name: string, part: keyof AdventureVisualParts) => {
    const pivot = new THREE.Group();
    pivot.name = `${name}-pivot`;
    pivot.position.set(...pivotPosition);
    visual.add(pivot);
    const mesh = add(pivot, size, offset, meshMaterial, name);
    mesh.userData.bodyPart = part;
    parts[part].push(pivot);
    return pivot;
  };
  const joint = (parent: THREE.Object3D, name: string, position: readonly [number, number, number]) => {
    const node = new THREE.Group();
    node.name = name;
    node.position.set(...position);
    node.userData.mobId = id;
    parent.add(node);
    return node;
  };
  const eyes = (x: number, y: number, z: number, size = 0.075) => {
    add(visual, [size, size, 0.04], [-x, y, z], eye, `${kind}-left-eye`);
    add(visual, [size, size, 0.04], [x, y, z], eye, `${kind}-right-eye`);
  };

  if (kind === "auric-scarab") {
    add(visual, [0.76, 0.32, 0.84], [0, 0.34, 0.12], body, "auric-scarab-abdomen", "body");
    add(visual, [0.58, 0.38, 0.48], [0, 0.34, -0.45], dark, "auric-scarab-thorax", "body");
    add(visual, [0.44, 0.3, 0.32], [0, 0.28, -0.82], accent, "auric-scarab-head", "head");
    eyes(0.13, 0.34, -1.0, 0.085);
    for (const side of [-1, 1]) {
      const sideName = side < 0 ? "left" : "right";
      const wingCase = add(visual, [0.34, 0.12, 0.76], [side * 0.2, 0.53, 0.14], material(side < 0 ? 0xc69940 : 0xe0ba5f), `auric-scarab-${sideName}-wing-case`, "wings");
      wingCase.rotation.z = side * -0.08;
      add(visual, [0.08, 0.07, 0.34], [side * 0.12, 0.42, 0.08], glass, `auric-scarab-${sideName}-crystal-seam`);
      for (const [index, z] of [-0.48, -0.05, 0.38].entries()) {
        const hipAngle = 0.34 + index * 0.08;
        const upperLength = 0.28;
        const lowerLength = 0.2;
        const leg = pivotBox(
          [upperLength, 0.1, 0.1],
          [side * (index === 0 ? 0.28 : 0.35), 0.28 + index * 0.02, z],
          [side * upperLength / 2, 0, 0],
          dark,
          `auric-scarab-${sideName}-leg-${index + 1}-upper`,
          "legs",
        );
        // BoxGeometry's long axis is local X here. Positive Z rotation lifts a
        // right-side (+X) leg, so the outward/downward insect hip uses the
        // opposite sign. The old sign made all six legs point upward.
        leg.rotation.z = -side * hipAngle;
        leg.rotation.y = (index - 1) * 0.24;
        leg.userData.side = side;
        leg.userData.phase = side < 0 ? index * 0.45 : Math.PI + index * 0.45;
        leg.userData.restRotationZ = leg.rotation.z;

        const knee = joint(leg, `auric-scarab-${sideName}-leg-${index + 1}-knee`, [side * upperLength, 0, 0]);
        knee.rotation.z = -side * (0.48 - index * 0.02);
        add(knee, [0.11, 0.11, 0.12], [0, 0, 0], accent, `auric-scarab-${sideName}-leg-${index + 1}-knee-cap`);
        add(knee, [lowerLength, 0.08, 0.09], [side * lowerLength / 2, 0, 0], dark, `auric-scarab-${sideName}-leg-${index + 1}-lower`);
      }
      const antenna = pivotBox([0.05, 0.05, 0.5], [side * 0.12, 0.38, -0.96], [side * 0.08, 0.08, -0.23], accent, `auric-scarab-${sideName}-antenna`, "head");
      antenna.rotation.y = side * -0.28;
      const mandible = add(visual, [0.2, 0.08, 0.28], [side * 0.17, 0.2, -1.08], pale, `auric-scarab-${sideName}-mandible`);
      mandible.rotation.y = side * 0.34;
    }
  } else if (kind === "rootwrithe") {
    add(visual, [0.82, 1.05, 0.68], [0, 0.68, 0.04], body, "rootwrithe-bole", "body");
    add(visual, [0.62, 0.42, 0.56], [0, 1.25, -0.12], accent, "rootwrithe-face-crown", "head");
    eyes(0.17, 1.3, -0.43, 0.09);
    for (const [index, x] of [-0.3, -0.1, 0.1, 0.3].entries()) {
      const crown = add(visual, [0.18, 0.54 + (index % 2) * 0.18, 0.18], [x, 1.66 + (index % 2) * 0.08, 0.02], index % 2 ? accent : body, `rootwrithe-crown-shoot-${index + 1}`);
      crown.rotation.z = (index - 1.5) * 0.18;
    }
    for (const [index, [x, z]] of [[-0.35,-0.2],[0.35,-0.2],[-0.38,0.25],[0.38,0.25]].entries()) {
      const side = Math.sign(x);
      const root = pivotBox([0.22, 0.62, 0.3], [x, 0.52, z], [0, -0.3, z > 0 ? 0.12 : -0.08], dark, `rootwrithe-root-${index + 1}`, "legs");
      // A downward local-Y limb splays outward when rotation.z has the same
      // sign as its side. The previous sign crossed every root under the bole.
      root.rotation.z = side * 0.22;
      root.userData.side = side;
      root.userData.phase = index % 2 ? Math.PI : 0;
      root.userData.restRotationZ = root.rotation.z;
      add(root, [0.2, 0.15, 0.5], [0, -0.59, -0.12], dark, `rootwrithe-root-${index + 1}-hook`);
    }
    for (const side of [-1, 1] as const) {
      const sideName = side < 0 ? "left" : "right";
      const upperLength = 0.52;
      const arm = pivotBox([0.18, upperLength, 0.18], [side * 0.41, 1.02, 0], [0, -upperLength / 2, -0.04], accent, `rootwrithe-${sideName}-vine-arm-upper`, "arms");
      arm.rotation.z = side * 0.38;
      arm.userData.side = side;
      arm.userData.phase = side < 0 ? 0 : Math.PI;
      arm.userData.restRotationZ = arm.rotation.z;

      const elbow = joint(arm, `rootwrithe-${sideName}-vine-elbow`, [0, -upperLength, -0.04]);
      elbow.rotation.z = -side * 0.16;
      add(elbow, [0.16, 0.36, 0.16], [0, -0.18, 0], dark, `rootwrithe-${sideName}-vine-forearm`);
      add(elbow, [0.22, 0.14, 0.34], [side * 0.03, -0.4, -0.1], pale, `rootwrithe-${sideName}-vine-claw`);
    }
    for (const [index, y] of [0.48, 0.76, 1.04].entries()) add(visual, [0.09, 0.09, 0.035], [0, y, -0.37], eye, `rootwrithe-rune-${index + 1}`);
  } else if (kind === "bellroot-matron") {
    add(visual, [1.25, 1.48, 1.05], [0, 1.1, 0.08], body, "bellroot-matron-trunk", "body");
    add(visual, [1.46, 0.32, 1.24], [0, 1.82, -0.02], dark, "bellroot-matron-shoulder-burl", "body");
    add(visual, [1.05, 0.72, 0.84], [0, 2.12, -0.12], accent, "bellroot-matron-bell", "head");
    add(visual, [0.76, 0.26, 0.62], [0, 2.54, -0.08], pale, "bellroot-matron-bell-crown");
    add(visual, [0.22, 0.44, 0.22], [0, 1.78, -0.58], eye, "bellroot-matron-lantern-clapper", "head");
    eyes(0.22, 2.22, -0.56, 0.11);
    for (const [index, [x, z]] of [[-0.46,-0.2],[0.46,-0.2],[-0.52,0.34],[0.52,0.34]].entries()) {
      const side = Math.sign(x);
      const root = pivotBox([0.34, 1.02, 0.42], [x, 0.86, z], [0, -0.5, 0], dark, `bellroot-matron-root-leg-${index + 1}`, "legs");
      root.rotation.z = side * 0.12;
      root.userData.side = side;
      root.userData.phase = index % 2 ? Math.PI : 0;
      root.userData.restRotationZ = root.rotation.z;
      add(root, [0.5, 0.2, 0.7], [0, -0.94, -0.12], body, `bellroot-matron-root-foot-${index + 1}`);
    }
    for (const side of [-1, 1] as const) {
      const sideName = side < 0 ? "left" : "right";
      const upperLength = 0.76;
      const arm = pivotBox([0.28, upperLength, 0.3], [side * 0.68, 1.7, 0], [0, -upperLength / 2, -0.04], accent, `bellroot-matron-${sideName}-vine-arm-upper`, "arms");
      arm.rotation.z = side * 0.42;
      arm.userData.side = side;
      arm.userData.phase = side < 0 ? 0 : Math.PI;
      arm.userData.restRotationZ = arm.rotation.z;

      const elbow = joint(arm, `bellroot-matron-${sideName}-vine-elbow`, [0, -upperLength, -0.04]);
      elbow.rotation.z = -side * 0.18;
      add(elbow, [0.25, 0.48, 0.26], [0, -0.24, 0], dark, `bellroot-matron-${sideName}-vine-forearm`);
      add(elbow, [0.5, 0.2, 0.5], [side * 0.04, -0.54, -0.12], pale, `bellroot-matron-${sideName}-vine-palm`);
    }
    // The Matron canonically has three arms. Its third used to be a normal
    // vertical limb centered through the torso, so it looked like a misplaced
    // fifth leg. This L-shaped rear shoulder keeps the silhouette intentional
    // and remains compatible with the generic X-axis attack sweep.
    const rearArm = pivotBox([0.28, 0.3, 0.74], [0, 1.7, 0.48], [0, 0, 0.35], accent, "bellroot-matron-rear-vine-arm-upper", "arms");
    rearArm.userData.side = 0;
    rearArm.userData.phase = Math.PI / 2;
    rearArm.userData.restRotationZ = 0;
    add(rearArm, [0.26, 0.62, 0.28], [0, -0.3, 0.72], dark, "bellroot-matron-rear-vine-forearm");
    add(rearArm, [0.48, 0.2, 0.48], [0, -0.66, 0.72], pale, "bellroot-matron-rear-vine-palm");
    for (const [index, x] of [-0.4, -0.15, 0.15, 0.4].entries()) {
      const leaf = add(visual, [0.32, 0.09, 0.72], [x, 2.74 + Math.abs(x) * 0.1, 0.06], accent, `bellroot-matron-crown-leaf-${index + 1}`);
      leaf.rotation.z = x * 0.6;
    }
  } else if (kind === "vaultwing") {
    add(visual, [0.5, 0.44, 0.86], [0, 0.12, 0.08], body, "vaultwing-body", "body");
    add(visual, [0.48, 0.42, 0.4], [0, 0.18, -0.54], accent, "vaultwing-head", "head");
    add(visual, [0.26, 0.18, 0.24], [0, 0.05, -0.82], dark, "vaultwing-muzzle");
    eyes(0.14, 0.25, -0.75, 0.09);
    for (const side of [-1, 1]) {
      const sideName = side < 0 ? "left" : "right";
      const ear = add(visual, [0.18, 0.56, 0.12], [side * 0.17, 0.55, -0.48], accent, `vaultwing-${sideName}-sonar-ear`, "head");
      ear.rotation.z = side * -0.26;
      const wing = new THREE.Group();
      wing.name = `vaultwing-${sideName}-wing-pivot`;
      wing.position.set(side * 0.24, 0.2, -0.05);
      wing.userData.side = side;
      wing.userData.phase = side < 0 ? 0 : Math.PI;
      visual.add(wing);
      parts.wings.push(wing);
      const upper = add(wing, [1.08, 0.1, 0.16], [side * 0.5, 0, 0], dark, `vaultwing-${sideName}-wing-arm`);
      upper.rotation.z = side * -0.16;
      const frontSail = add(wing, [0.92, 0.045, 0.82], [side * 0.52, -0.06, -0.3], glass, `vaultwing-${sideName}-front-sail`);
      frontSail.rotation.y = side * -0.14;
      frontSail.rotation.z = side * -0.1;
      const rearSail = add(wing, [0.74, 0.045, 0.72], [side * 0.42, -0.08, 0.38], glass, `vaultwing-${sideName}-rear-sail`);
      rearSail.rotation.y = side * 0.18;
      rearSail.rotation.z = side * -0.08;
      for (const z of [-0.42, 0.42]) {
        const claw = add(wing, [0.12, 0.12, 0.36], [side * 1.02, -0.1, z], pale, `vaultwing-${sideName}-wing-claw-${z < 0 ? "front" : "rear"}`);
        claw.rotation.y = side * 0.28;
      }
      const foot = pivotBox([0.11, 0.35, 0.12], [side * 0.15, -0.05, 0.2], [0, -0.17, 0], dark, `vaultwing-${sideName}-foot`, "legs");
      foot.rotation.z = side * 0.12;
    }
    for (let segment = 0; segment < 3; segment += 1) add(visual, [0.15 - segment * 0.02, 0.14, 0.32], [0, 0.08, 0.52 + segment * 0.26], segment % 2 ? accent : body, `vaultwing-tail-segment-${segment + 1}`);
  } else if (kind === "cinder-maw") {
    add(visual, [1.08, 0.68, 1.5], [0, 0.72, 0.2], body, "cinder-maw-body", "body");
    add(visual, [0.9, 0.72, 0.82], [0, 0.82, -0.84], accent, "cinder-maw-head", "head");
    add(visual, [0.62, 0.34, 0.58], [0, 0.62, -1.43], dark, "cinder-maw-muzzle");
    eyes(0.25, 0.91, -1.28, 0.11);
    for (const side of [-1, 1]) {
      const sideName = side < 0 ? "left" : "right";
      const ear = add(visual, [0.24, 0.58, 0.22], [side * 0.31, 1.32, -0.9], dark, `cinder-maw-${sideName}-ear`, "head");
      ear.rotation.z = side * -0.24;
      for (const [front, z, phase] of [[true,-0.42,side < 0 ? 0 : Math.PI],[false,0.7,side < 0 ? Math.PI : 0]] as const) {
        const leg = pivotBox([0.3, 0.78, 0.34], [side * 0.38, 0.64, z], [0, -0.38, 0], dark, `cinder-maw-${front ? "front" : "rear"}-${sideName}-leg`, "legs");
        leg.userData.phase = phase;
        add(leg, [0.38, 0.18, 0.54], [0, -0.73, -0.12], body, `cinder-maw-${front ? "front" : "rear"}-${sideName}-paw`);
      }
      for (const z of [-0.15, 0.34, 0.76]) add(visual, [0.34, 0.28, 0.42], [side * 0.53, 1.12, z], dark, `cinder-maw-${sideName}-basalt-plate-${z}`);
    }
    for (const [index, x] of [-0.2, 0, 0.2].entries()) add(visual, [0.11, 0.13, 0.2], [x, 0.52, -1.72], pale, `cinder-maw-tooth-${index + 1}`);
    const tail = pivotBox([0.28, 0.28, 1.1], [0, 0.85, 0.9], [0, 0, 0.52], body, "cinder-maw-tail", "body");
    tail.rotation.x = -0.18;
    add(tail, [0.24, 0.24, 0.34], [0, 0.03, 1.05], eye, "cinder-maw-tail-ember");
    for (const [index, z] of [0.1, 0.48, 0.86].entries()) add(visual, [0.16, 0.38, 0.18], [0, 1.22, z], eye, `cinder-maw-ember-vent-${index + 1}`);
  } else {
    add(visual, [0.88, 1.1, 0.58], [0, 1.24, 0], pale, "ossuary-keeper-rib-vault", "body");
    add(visual, [0.7, 0.48, 0.52], [0, 2.02, -0.04], body, "ossuary-keeper-helm", "head");
    add(visual, [0.5, 0.2, 0.4], [0, 1.78, -0.18], dark, "ossuary-keeper-jaw");
    eyes(0.18, 2.09, -0.32, 0.09);
    add(visual, [0.24, 0.5, 0.12], [0, 1.25, -0.36], eye, "ossuary-keeper-keyhole-core", "body");
    for (const side of [-1, 1]) {
      const sideName = side < 0 ? "left" : "right";
      const leg = pivotBox([0.3, 0.98, 0.34], [side * 0.27, 0.98, 0], [0, -0.48, 0], accent, `ossuary-keeper-${sideName}-leg`, "legs");
      leg.userData.phase = side < 0 ? 0 : Math.PI;
      add(leg, [0.48, 0.22, 0.64], [0, -0.89, -0.14], dark, `ossuary-keeper-${sideName}-foot`);
      const arm = pivotBox([0.26, 0.98, 0.28], [side * 0.58, 1.67, 0], [0, -0.48, 0], body, `ossuary-keeper-${sideName}-arm`, "arms");
      arm.userData.side = side;
      arm.userData.phase = side < 0 ? 0 : Math.PI;
      if (side < 0) {
        add(arm, [0.7, 0.98, 0.18], [-0.12, -0.52, -0.24], accent, "ossuary-keeper-tomb-shield");
        for (const y of [-0.76, -0.5, -0.24]) add(arm, [0.54, 0.06, 0.05], [-0.12, y, -0.35], pale, `ossuary-keeper-shield-rib-${y}`);
      } else {
        add(arm, [0.13, 0.13, 1.52], [0.08, -0.85, -0.62], dark, "ossuary-keeper-keyblade-shaft");
        add(arm, [0.42, 0.18, 0.56], [0.08, -0.84, -1.52], eye, "ossuary-keeper-keyblade-bit");
        add(arm, [0.54, 0.1, 0.12], [0.08, -0.58, -0.22], pale, "ossuary-keeper-keyblade-guard");
      }
    }
    for (const [index, x] of [-0.28, 0, 0.28].entries()) add(visual, [0.13, 0.48 + (index === 1 ? 0.18 : 0), 0.18], [x, 2.4 + (index === 1 ? 0.08 : 0), 0], body, `ossuary-keeper-helm-prong-${index + 1}`);
  }

  group.userData.mobId = id;
  group.userData.adventureMob = true;
  return { group, visual, parts };
}
