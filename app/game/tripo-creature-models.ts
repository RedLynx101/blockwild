import * as THREE from "three";

type Parts = Record<"legs" | "wings" | "arms" | "head" | "body", THREE.Object3D[]>;

export type TripoCreatureVisual = {
  group: THREE.Group;
  visual: THREE.Group;
  parts: Parts;
};

const EMBER = 0xff7a1c;
const HOT_EMBER = 0xffc052;

function box(
  parent: THREE.Object3D,
  size: readonly [number, number, number],
  material: THREE.Material,
  position: readonly [number, number, number],
  name: string,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  mesh.name = name;
  parent.add(mesh);
  return mesh;
}

function rememberRest(pivot: THREE.Object3D) {
  pivot.userData.restX = pivot.rotation.x;
  pivot.userData.restY = pivot.rotation.y;
  pivot.userData.restZ = pivot.rotation.z;
  return pivot;
}

/**
 * Rebuilds the reviewed segmented Tripo beetle as lightweight production
 * cuboids. The source silhouette remains recognizable, while every grounded
 * limb receives a hip/knee/tarsus chain that can animate without detaching.
 */
export function createEmbercarapaceBeetleVisual(id: number): TripoCreatureVisual {
  const group = new THREE.Group();
  const visual = new THREE.Group();
  const parts: Parts = { legs: [], wings: [], arms: [], head: [], body: [] };
  group.name = "embercarapace-beetle-root";
  visual.name = "embercarapace-beetle-visual";
  visual.userData.wildlifeRig = "embercarapace-beetle";
  // The widest planted stance lowers the rotated outer toe corners by 0.153275
  // blocks. Author the whole rig above that measured contact plane so world,
  // portrait, and inspection renderers agree on exact grounding.
  visual.position.y = 0.15327533693721964;
  group.add(visual);

  const shell = new THREE.MeshLambertMaterial({ color: 0x232e31 });
  const shellMid = new THREE.MeshLambertMaterial({ color: 0x405158 });
  const shellEdge = new THREE.MeshLambertMaterial({ color: 0x6f8187 });
  const dark = new THREE.MeshLambertMaterial({ color: 0x11191b });
  const warning = new THREE.MeshLambertMaterial({ color: 0x9d3122 });
  const eye = new THREE.MeshBasicMaterial({ color: 0xff4a26 });
  const ember = new THREE.MeshBasicMaterial({ color: EMBER });
  const hotEmber = new THREE.MeshBasicMaterial({ color: HOT_EMBER });

  const abdomen = new THREE.Group();
  abdomen.name = "embercarapace-beetle-abdomen-pivot";
  abdomen.position.set(0, 0.39, 0.28);
  visual.add(abdomen);
  box(abdomen, [0.54, 0.25, 0.52], dark, [0, 0, 0.05], "embercarapace-beetle-abdomen-core");
  for (let band = 0; band < 4; band += 1) {
    const z = -0.13 + band * 0.105;
    const width = 0.39 - band * 0.018;
    box(abdomen, [width, 0.105, 0.072], band === 3 ? hotEmber : ember, [0, -0.085, z], `embercarapace-beetle-heat-band-${band + 1}`);
    for (const sideName of ["left", "right"] as const) {
      const side = sideName === "left" ? -1 : 1;
      box(abdomen, [0.06, 0.095, 0.075], band === 3 ? hotEmber : ember, [side * 0.275, -0.025, z], `embercarapace-beetle-${sideName}-heat-vent-${band + 1}`);
    }
  }
  box(abdomen, [0.12, 0.13, 0.34], hotEmber, [0, -0.09, 0.06], "embercarapace-beetle-heat-heart");
  parts.body.push(abdomen);

  const thorax = new THREE.Group();
  thorax.name = "embercarapace-beetle-thorax-pivot";
  thorax.position.set(0, 0.47, -0.07);
  visual.add(thorax);
  box(thorax, [0.60, 0.31, 0.56], shell, [0, 0, 0], "embercarapace-beetle-thorax");
  box(thorax, [0.46, 0.11, 0.48], shellMid, [0, 0.19, -0.015], "embercarapace-beetle-thorax-crown");
  box(thorax, [0.08, 0.12, 0.48], shellEdge, [0, 0.235, -0.005], "embercarapace-beetle-dorsal-keel");
  box(thorax, [0.66, 0.10, 0.13], warning, [0, 0.045, 0.20], "embercarapace-beetle-warning-collar");
  parts.body.push(thorax);

  for (const sideName of ["left", "right"] as const) {
    const side = sideName === "left" ? -1 : 1;
    const wing = new THREE.Group();
    wing.name = `embercarapace-beetle-${sideName}-wing-case-pivot`;
    wing.position.set(side * 0.155, 0.59, 0.27);
    wing.userData.side = side;
    visual.add(wing);
    box(wing, [0.31, 0.20, 0.63], shell, [side * 0.01, 0, 0.03], `embercarapace-beetle-${sideName}-wing-case`);
    box(wing, [0.24, 0.095, 0.49], shellMid, [side * 0.005, 0.14, -0.015], `embercarapace-beetle-${sideName}-wing-case-facet`);
    box(wing, [0.055, 0.08, 0.58], shellEdge, [-side * 0.13, 0.085, 0.035], `embercarapace-beetle-${sideName}-wing-case-seam`);
    box(wing, [0.11, 0.065, 0.18], warning, [side * 0.105, 0.075, 0.16], `embercarapace-beetle-${sideName}-warning-ridge`);
    rememberRest(wing);
    parts.wings.push(wing);
  }

  const head = new THREE.Group();
  head.name = "embercarapace-beetle-head-pivot";
  head.position.set(0, 0.37, -0.53);
  visual.add(head);
  box(head, [0.47, 0.30, 0.36], shell, [0, 0, 0], "embercarapace-beetle-head");
  box(head, [0.35, 0.10, 0.27], shellMid, [0, 0.19, -0.015], "embercarapace-beetle-head-brow");
  box(head, [0.22, 0.12, 0.14], shellEdge, [0, -0.08, -0.235], "embercarapace-beetle-muzzle");
  for (const sideName of ["left", "right"] as const) {
    const side = sideName === "left" ? -1 : 1;
    box(head, [0.075, 0.075, 0.04], eye, [side * 0.14, 0.045, -0.205], `embercarapace-beetle-${sideName}-eye`);
    box(head, [0.10, 0.055, 0.05], warning, [side * 0.14, 0.125, -0.19], `embercarapace-beetle-${sideName}-brow-mark`);

    const mandible = new THREE.Group();
    mandible.name = `embercarapace-beetle-${sideName}-mandible-pivot`;
    mandible.position.set(side * 0.10, -0.09, -0.21);
    mandible.userData.side = side;
    head.add(mandible);
    box(mandible, [0.09, 0.085, 0.22], dark, [side * 0.035, -0.015, -0.095], `embercarapace-beetle-${sideName}-mandible-root`);
    box(mandible, [0.075, 0.065, 0.16], shellMid, [side * 0.07, -0.045, -0.235], `embercarapace-beetle-${sideName}-mandible-tip`);
    rememberRest(mandible);

    const antenna = new THREE.Group();
    antenna.name = `embercarapace-beetle-${sideName}-antenna-pivot`;
    antenna.position.set(side * 0.14, 0.13, -0.10);
    antenna.userData.side = side;
    head.add(antenna);
    for (let segment = 0; segment < 4; segment += 1) {
      box(
        antenna,
        [0.075, 0.10, 0.075],
        segment === 3 ? shellEdge : shellMid,
        [side * (0.025 + segment * 0.035), 0.09 + segment * 0.08, -0.055 - segment * 0.065],
        `embercarapace-beetle-${sideName}-antenna-segment-${segment + 1}`,
      );
    }
    rememberRest(antenna);
  }
  parts.head.push(head);

  const rows = [
    { row: "front", z: -0.33 },
    { row: "middle", z: -0.02 },
    { row: "back", z: 0.29 },
  ] as const;
  for (const sideName of ["left", "right"] as const) {
    const side = sideName === "left" ? -1 : 1;
    for (const { row, z } of rows) {
      const hip = new THREE.Group();
      hip.name = `embercarapace-beetle-leg-${sideName}-${row}-hip-pivot`;
      hip.position.set(side * 0.28, 0.39, z);
      hip.userData.side = side;
      hip.userData.phase = (sideName === "left" && row !== "middle") || (sideName === "right" && row === "middle") ? 0 : Math.PI;
      visual.add(hip);
      box(hip, [0.25, 0.12, 0.13], shellMid, [side * 0.12, -0.055, 0], `embercarapace-beetle-leg-${sideName}-${row}-coxa`);
      box(hip, [0.10, 0.10, 0.11], warning, [side * 0.225, -0.105, 0], `embercarapace-beetle-leg-${sideName}-${row}-joint-cap`);

      const knee = new THREE.Group();
      knee.name = `embercarapace-beetle-leg-${sideName}-${row}-knee-pivot`;
      knee.position.set(side * 0.24, -0.11, 0);
      hip.add(knee);
      box(knee, [0.12, 0.25, 0.115], shellMid, [side * 0.035, -0.12, 0], `embercarapace-beetle-leg-${sideName}-${row}-tibia`);

      const foot = new THREE.Group();
      foot.name = `embercarapace-beetle-leg-${sideName}-${row}-foot-pivot`;
      foot.position.set(side * 0.07, -0.245, 0);
      knee.add(foot);
      box(foot, [0.17, 0.07, 0.21], shellEdge, [side * 0.045, -0.025, -0.025], `embercarapace-beetle-leg-${sideName}-${row}-foot`);
      box(foot, [0.06, 0.045, 0.08], warning, [side * 0.105, -0.02, -0.105], `embercarapace-beetle-leg-${sideName}-${row}-toe-mark`);

      hip.rotation.z = side * -0.16;
      knee.rotation.z = side * 0.10;
      rememberRest(hip);
      rememberRest(knee);
      rememberRest(foot);
      parts.legs.push(hip);
    }
  }

  visual.traverse((object) => { object.userData.mobId = id; });
  return { group, visual, parts };
}

function rest(pivot: THREE.Object3D, axis: "X" | "Y" | "Z") {
  return Number(pivot.userData[`rest${axis}`]) || 0;
}

/** Applies a grounded alternating-tripod gait and restrained thermal behavior. */
export function applyEmbercarapaceBeetlePose(
  visual: THREE.Object3D,
  timeSeconds: number,
  travelAmount: number,
  alertAmount: number,
) {
  if (visual.userData.wildlifeRig !== "embercarapace-beetle") return false;
  const time = Number.isFinite(timeSeconds) ? timeSeconds : 0;
  const travel = THREE.MathUtils.clamp(Number.isFinite(travelAmount) ? travelAmount : 0, 0, 1);
  const alert = THREE.MathUtils.clamp(Number.isFinite(alertAmount) ? alertAmount : 0, 0, 1);
  const gait = time * (4.4 + travel * 5.2);
  const idleBreath = Math.sin(time * 1.45);

  const thorax = visual.getObjectByName("embercarapace-beetle-thorax-pivot");
  if (thorax) {
    thorax.position.y = 0.47 + idleBreath * 0.006 + Math.abs(Math.sin(gait)) * travel * 0.012 - alert * 0.018;
    thorax.scale.set(1 + idleBreath * 0.005, 1 + idleBreath * 0.012 - alert * 0.025, 1 + alert * 0.018);
    thorax.rotation.x = -alert * 0.06;
  }
  const abdomen = visual.getObjectByName("embercarapace-beetle-abdomen-pivot");
  if (abdomen) {
    const pulse = 1 + Math.sin(time * 2.2) * 0.018 + alert * 0.035;
    abdomen.scale.set(1, pulse, 1 + (pulse - 1) * 0.55);
    abdomen.position.y = 0.39 - alert * 0.012;
  }

  const head = visual.getObjectByName("embercarapace-beetle-head-pivot");
  if (head) {
    head.rotation.x = Math.sin(time * 1.1) * 0.018 - alert * 0.14;
    head.rotation.y = Math.sin(time * 0.85) * 0.025 * (1 - travel);
    head.position.y = 0.37 - alert * 0.015;
  }

  for (const sideName of ["left", "right"] as const) {
    const side = sideName === "left" ? -1 : 1;
    const antenna = visual.getObjectByName(`embercarapace-beetle-${sideName}-antenna-pivot`);
    if (antenna) {
      antenna.rotation.x = rest(antenna, "X") - alert * 0.24 + Math.sin(time * 1.7 + side) * (0.035 + travel * 0.035);
      antenna.rotation.y = rest(antenna, "Y") + side * Math.sin(time * 1.2 + side * 0.7) * (0.075 + alert * 0.08);
      antenna.rotation.z = rest(antenna, "Z") + side * (0.08 + alert * 0.18) + Math.sin(time * 2.1 + side) * 0.025;
    }
    const mandible = visual.getObjectByName(`embercarapace-beetle-${sideName}-mandible-pivot`);
    if (mandible) mandible.rotation.y = rest(mandible, "Y") + side * (alert * 0.30 + Math.sin(time * 2.8 + side) * 0.012);
    const wing = visual.getObjectByName(`embercarapace-beetle-${sideName}-wing-case-pivot`);
    if (wing) {
      wing.rotation.z = rest(wing, "Z") - side * alert * 0.065;
      wing.rotation.x = rest(wing, "X") - alert * 0.075 + idleBreath * 0.006;
    }
  }

  for (const sideName of ["left", "right"] as const) {
    const side = sideName === "left" ? -1 : 1;
    for (const row of ["front", "middle", "back"] as const) {
      const hip = visual.getObjectByName(`embercarapace-beetle-leg-${sideName}-${row}-hip-pivot`);
      const knee = visual.getObjectByName(`embercarapace-beetle-leg-${sideName}-${row}-knee-pivot`);
      const foot = visual.getObjectByName(`embercarapace-beetle-leg-${sideName}-${row}-foot-pivot`);
      if (!hip || !knee || !foot) continue;
      const phase = Number(hip.userData.phase) || 0;
      const cycle = ((gait + phase) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
      const stepping = cycle < Math.PI;
      const stepProgress = cycle / Math.PI;
      // Only the advancing tripod leaves its authored rest pose. The opposing
      // tripod remains planted on the exact foot plane while the world root
      // moves over it, avoiding both a six-foot hover and expensive per-frame
      // scene-bounds IK.
      const swing = stepping ? (1 - stepProgress * 2) * travel : 0;
      const lift = stepping ? Math.sin(stepProgress * Math.PI) * travel : 0;
      hip.position.y = 0.39 - alert * 0.032795 + Math.abs(swing) * 0.006 + lift * 0.05;
      hip.rotation.x = rest(hip, "X") + swing * 0.30;
      hip.rotation.z = rest(hip, "Z") + side * (alert * 0.09 + lift * 0.055);
      knee.rotation.x = rest(knee, "X") - swing * 0.16;
      knee.rotation.z = rest(knee, "Z") - side * lift * 0.07;
      foot.rotation.x = rest(foot, "X") - swing * 0.14 - lift * 0.12;
      foot.rotation.z = rest(foot, "Z") + side * lift * 0.02;
    }
  }
  return true;
}
