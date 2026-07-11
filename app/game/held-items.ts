import * as THREE from "three";
import { BlockId, ITEMS, type ItemCode } from "./data";
import { createButterflyVisual } from "./butterflies";
import { BUTTERFLY_ORDER, type ButterflyKind } from "./mobs";
import { createHeldToolSpec } from "./model-specs";

/** Shared third-person, remote-player, and paper-doll held-item production model. */
export function createAvatarHeldItemModel(item: ItemCode) {
  const definition = ITEMS[item];
  if (!definition) return null;
  const group = new THREE.Group();
  group.name = `avatar-held-${definition.name.toLowerCase().replace(/\s+/g, "-")}`;
  const addBox = (
    size: [number, number, number],
    position: [number, number, number],
    color: string | number,
    rotation: [number, number, number] = [0, 0, 0],
    emissive = false,
    parent: THREE.Object3D = group,
  ) => {
    const material = emissive ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    parent.add(mesh);
    return mesh;
  };

  if (item === BlockId.Torch) {
    addBox([0.1, 0.62, 0.1], [0, 0.22, 0], 0x8d542b);
    const outer = addBox([0.16, 0.14, 0.16], [0, 0.58, 0], 0xffb33e, [0, 0, 0], true);
    const inner = addBox([0.08, 0.11, 0.08], [0, 0.7, 0], 0xfff0a0, [0, 0, 0], true);
    outer.name = "torch-flame-outer";
    inner.name = "torch-flame-inner";
    outer.userData.torchBase = outer.position.toArray();
    inner.userData.torchBase = inner.position.toArray();
  } else if (definition.toolKind) {
    const spec = createHeldToolSpec(definition.toolKind, definition.color, definition.name);
    for (const box of spec.boxes) addBox(
      [...box.size] as [number, number, number],
      [...box.position] as [number, number, number],
      box.color,
      [...(box.rotation ?? [0, 0, 0])] as [number, number, number],
      Boolean(box.emissive),
    );
    group.scale.setScalar(0.5);
    group.rotation.set(-0.1, 0, -0.34);
    group.position.set(0, -0.16, -0.02);
  } else if (definition.useKind === "net") {
    addBox([0.08, 0.9, 0.08], [0, 0.14, 0], 0x7b542f);
    for (let segment = 0; segment < 12; segment += 1) {
      const angle = segment / 12 * Math.PI * 2;
      const rail = addBox([0.045, 0.185, 0.045], [Math.cos(angle) * 0.29, 0.66 + Math.sin(angle) * 0.29, 0], 0xd8c892, [0, 0, angle]);
      rail.name = `butterfly-net-rim-${segment}`;
    }
    const netColor = 0xc5ddd4;
    for (let line = -3; line <= 3; line += 1) {
      const offset = line * 0.064;
      const half = Math.sqrt(Math.max(0, 0.245 ** 2 - offset ** 2));
      const vertical = addBox([0.012, half * 2, 0.012], [offset, 0.66, 0], netColor);
      const horizontal = addBox([half * 2, 0.012, 0.012], [0, 0.66 + offset, 0], netColor);
      vertical.name = `butterfly-net-thread-v-${line + 3}`;
      horizontal.name = `butterfly-net-thread-h-${line + 3}`;
    }
    group.scale.setScalar(0.62);
    group.rotation.set(-0.08, 0.15, -0.3);
  } else if (definition.useKind === "release-creature" && definition.creatureKind
    && BUTTERFLY_ORDER.includes(definition.creatureKind as ButterflyKind)) {
    const butterfly = createButterflyVisual(definition.creatureKind as ButterflyKind, `held-${definition.creatureKind}`);
    butterfly.group.name = `held-butterfly-${definition.creatureKind}`;
    butterfly.leftWing.rotation.z = 0.52;
    butterfly.rightWing.rotation.z = -0.52;
    // Wild butterflies fly on a mostly horizontal plane. A held specimen is
    // perched upright and slightly canted so both production wings remain
    // readable from third-person/front multiplayer views instead of becoming
    // one edge-on colored bar hidden by the wrist.
    butterfly.group.scale.setScalar(1.4);
    butterfly.group.position.set(0, 0.15, -0.32);
    butterfly.group.rotation.set(-1.02, 0.24, 0.08);
    group.add(butterfly.group);
  } else if (definition.iconKind === "bucket") {
    const metal = 0x9aa5a6;
    addBox([0.3, 0.07, 0.25], [0, -0.1, 0], metal);
    addBox([0.055, 0.3, 0.25], [-0.145, 0.03, 0], metal, [0, 0, -0.08]);
    addBox([0.055, 0.3, 0.25], [0.145, 0.03, 0], metal, [0, 0, 0.08]);
    addBox([0.28, 0.28, 0.045], [0, 0.03, -0.115], metal);
    addBox([0.28, 0.28, 0.045], [0, 0.03, 0.115], metal);
    addBox([0.36, 0.035, 0.035], [0, 0.26, 0], 0xc6cece);
    if (definition.bucketLiquid) addBox([0.23, 0.035, 0.18], [0, 0.17, 0], definition.color, [0, 0, 0], definition.bucketLiquid === "lava");
    group.scale.setScalar(0.72);
    group.rotation.set(0.08, 0.25, -0.12);
  } else if (definition.placeBlock !== undefined) {
    addBox([0.42, 0.42, 0.42], [0, 0.1, 0], definition.color, [0.16, 0.2, 0]);
  } else {
    addBox([0.28, 0.38, 0.2], [0, 0.1, 0], definition.color, [0.12, 0.15, -0.06]);
  }
  return group;
}
