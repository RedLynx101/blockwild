import * as THREE from "three";
import { BlockId, Item, ITEMS, type ItemCode } from "./data";
import { createButterflyVisual } from "./butterflies";
import { BUTTERFLY_ORDER, type ButterflyKind } from "./mobs";
import { createHeldToolSpec } from "./model-specs";

/** Shared first/third-person, remote-player, dropped-item, and paper-doll model. */
export function createAvatarHeldItemModel(item: ItemCode, options: { filledCaptureOrb?: boolean } = {}) {
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
  const addSphere = (radius: number, position: [number, number, number], color: string | number, emissive = false, parent: THREE.Object3D = group) => {
    const material = emissive ? new THREE.MeshBasicMaterial({ color }) : new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 12, 8), material);
    mesh.position.set(...position);
    parent.add(mesh);
    return mesh;
  };

  if (definition.iconKind === "shield") {
    const sunmetal = /sunmetal/iu.test(definition.name);
    const face = sunmetal ? 0xc9ad58 : 0x9a6a3b;
    const rim = sunmetal ? 0xf0d471 : 0x5d4028;
    addBox([0.58, 0.68, 0.09], [0, 0.06, -0.04], face);
    addBox([0.64, 0.075, 0.13], [0, 0.37, -0.03], rim);
    addBox([0.64, 0.075, 0.13], [0, -0.25, -0.03], rim);
    addBox([0.075, 0.58, 0.13], [-0.285, 0.06, -0.03], rim);
    addBox([0.075, 0.58, 0.13], [0.285, 0.06, -0.03], rim);
    addBox([0.12, 0.12, 0.14], [0, 0.06, -0.105], sunmetal ? 0xffe69a : 0xd2a05e, [0, 0, Math.PI / 4], sunmetal);
    addBox([0.12, 0.42, 0.08], [0, 0.06, 0.06], 0x5a3b27);
    group.scale.setScalar(0.78);
    group.rotation.set(0.04, Math.PI / 2, 0.04);
    group.position.set(0, 0.1, -0.28);
    group.userData.offhandShield = true;
  } else if (definition.iconKind === "armor") {
    const primary = new THREE.Color(definition.color);
    const dark = primary.clone().multiplyScalar(0.48).getHex();
    const light = primary.clone().lerp(new THREE.Color(0xffffff), 0.36).getHex();
    const glow = definition.dragonType === "fire" ? 0xffbd61
      : definition.dragonType === "ice" ? 0xd9fbff
        : definition.dragonType === "sea" ? 0x8affec
          : 0xd8e4e7;
    if (definition.dragonModule === "armor") {
      // A compact dragon-barding bundle, not a generic colored inventory
      // brick. The four palettes now remain distinct at icon and hand scale.
      const breast = addBox([0.45, 0.34, 0.18], [0, 0.08, 0], primary.getHex(), [0.05, 0, 0]);
      breast.name = "dragon-armor-breastplate";
      const crest = addBox([0.16, 0.12, 0.2], [0, 0.31, -0.01], light, [0.12, 0, Math.PI / 4]);
      crest.name = "dragon-armor-crest";
      for (const side of [-1, 1]) {
        const flank = addBox([0.18, 0.3, 0.25], [side * 0.27, 0.04, 0.04], dark, [0, 0, side * -0.16]);
        flank.name = `dragon-armor-${side < 0 ? "left" : "right"}-flank`;
      }
      for (const [index, x] of [-0.14, 0, 0.14].entries()) {
        const scale = addBox([0.11, 0.075, 0.205], [x, 0.12 - Math.abs(x) * 0.2, -0.125], index === 1 ? glow : light, [0.08, 0, Math.PI / 4], index === 1);
        scale.name = `dragon-armor-scale-${index + 1}`;
      }
      addBox([0.39, 0.075, 0.11], [0, -0.16, 0.09], glow, [0, 0, 0], definition.dragonType !== "steel").name = "dragon-armor-rune";
      group.scale.setScalar(0.88);
      group.rotation.set(0.08, 0.24, -0.09);
    } else if (definition.equipmentSlot === "head") {
      addBox([0.46, 0.3, 0.42], [0, 0.04, 0], primary.getHex()).name = "held-armor-helm-crown";
      addBox([0.52, 0.08, 0.46], [0, -0.13, -0.01], dark).name = "held-armor-helm-rim";
      addBox([0.09, 0.22, 0.45], [-0.23, -0.02, 0], light, [0, 0, -0.08]).name = "held-armor-helm-left-cheek";
      addBox([0.09, 0.22, 0.45], [0.23, -0.02, 0], light, [0, 0, 0.08]).name = "held-armor-helm-right-cheek";
      group.scale.setScalar(0.82);
      group.rotation.set(0.1, 0.25, -0.08);
    } else if (definition.equipmentSlot === "chest") {
      addBox([0.5, 0.42, 0.18], [0, 0.04, 0], primary.getHex()).name = "held-armor-cuirass";
      addBox([0.64, 0.14, 0.22], [0, 0.2, 0.02], light).name = "held-armor-shoulders";
      addBox([0.42, 0.08, 0.22], [0, -0.19, 0.03], dark).name = "held-armor-waist";
      group.scale.setScalar(0.82);
      group.rotation.set(0.08, 0.25, -0.08);
    } else if (definition.equipmentSlot === "legs") {
      for (const side of [-1, 1]) addBox([0.2, 0.48, 0.2], [side * 0.14, 0.02, 0], side < 0 ? primary.getHex() : light, [0, 0, side * -0.05]).name = `held-armor-${side < 0 ? "left" : "right"}-greave`;
      addBox([0.5, 0.1, 0.22], [0, 0.29, 0], dark).name = "held-armor-greave-belt";
      group.scale.setScalar(0.78);
      group.rotation.set(0.08, 0.24, -0.08);
    } else {
      for (const side of [-1, 1]) addBox([0.26, 0.22, 0.42], [side * 0.16, 0, 0], side < 0 ? primary.getHex() : light, [0, 0, side * -0.05]).name = `held-armor-${side < 0 ? "left" : "right"}-boot`;
      group.scale.setScalar(0.82);
      group.rotation.set(0.08, 0.24, -0.08);
    }
  } else if (item === BlockId.CraftingTable) {
    // A miniature of the authored world block: gridded worktop, dark joined
    // frame and the same warm wildwood side panels instead of a generic cube.
    addBox([0.5, 0.42, 0.5], [0, 0.04, 0], 0x86532f).name = "crafting-table-side-panel";
    addBox([0.53, 0.08, 0.53], [0, 0.29, 0], 0xc99a58).name = "crafting-table-worktop";
    for (const offset of [-0.17, 0, 0.17]) {
      addBox([0.025, 0.018, 0.5], [offset, 0.34, 0], 0x5d3821).name = `crafting-table-grid-x-${offset}`;
      addBox([0.5, 0.018, 0.025], [0, 0.34, offset], 0x5d3821).name = `crafting-table-grid-z-${offset}`;
    }
    for (const x of [-0.21, 0.21]) for (const z of [-0.21, 0.21]) addBox([0.06, 0.4, 0.06], [x, 0.02, z], 0x56341f).name = `crafting-table-leg-${x}-${z}`;
    group.scale.setScalar(0.76);
    group.rotation.set(0.13, 0.27, -0.08);
  } else if (item === Item.DeepgearLanternItem) {
    addBox([0.32, 0.07, 0.32], [0, -0.12, 0], 0x69533b);
    for (const x of [-0.14, 0.14]) for (const z of [-0.14, 0.14]) addBox([0.035, 0.42, 0.035], [x, 0.08, z], 0x9f865b);
    addBox([0.3, 0.34, 0.3], [0, 0.08, 0], 0xffd77a, [0, 0, 0], true);
    addBox([0.34, 0.07, 0.34], [0, 0.29, 0], 0x806947);
    addBox([0.2, 0.05, 0.05], [0, 0.42, 0], 0xbdab7d);
    group.scale.setScalar(0.82);
    group.rotation.set(0.08, 0.24, -0.06);
    group.userData.offhandLight = true;
  } else if (definition.heldModel === "wildwood-chest") {
    addBox([0.52, 0.34, 0.42], [0, -0.03, 0], 0x9f6833);
    addBox([0.55, 0.14, 0.45], [0, 0.22, 0], 0xb9874e);
    addBox([0.12, 0.18, 0.045], [0, 0.08, -0.235], 0xe0b54e, [0, 0, 0], true);
    group.scale.setScalar(0.82);
    group.rotation.set(0.12, 0.24, -0.08);
  } else if (definition.heldModel === "apiary") {
    addBox([0.5, 0.36, 0.42], [0, -0.02, 0], 0xb97630);
    addBox([0.56, 0.14, 0.48], [0, 0.23, 0], 0xefc451);
    addBox([0.2, 0.12, 0.04], [0, 0.01, -0.23], 0x4b301f);
    for (const x of [-0.14, 0, 0.14]) addBox([0.05, 0.05, 0.04], [x, 0.13, -0.235], 0xf4d455, [0, 0, x * 0.8], true);
    group.scale.setScalar(0.78);
    group.rotation.set(0.1, 0.26, -0.08);
  } else if (definition.heldModel === "capture-orb") {
    addSphere(0.22, [0, 0.08, 0], options.filledCaptureOrb ? 0x3c605e : 0x697579);
    addBox([0.43, 0.08, 0.08], [0, 0.08, -0.17], options.filledCaptureOrb ? 0x78f0c5 : 0x73d8d2, [0, 0, 0], true);
    addSphere(0.065, [0, 0.08, -0.205], options.filledCaptureOrb ? 0xf0fff7 : 0xc5ffff, true);
    addBox([0.2, 0.03, 0.08], [-0.04, 0.22, -0.08], 0xeaf1ef, [0.28, 0, -0.35]);
    group.scale.setScalar(1.02);
    group.rotation.set(0.08, 0.22, -0.1);
    group.userData.filledCaptureOrb = Boolean(options.filledCaptureOrb);
  } else if (definition.heldModel === "dragon-egg") {
    const shell = new THREE.Color(definition.color);
    const shellHighlight = shell.clone().lerp(new THREE.Color(0xffffff), 0.34).getHex();
    const shellShadow = shell.clone().multiplyScalar(0.52).getHex();
    const shellDeep = shell.clone().multiplyScalar(0.72).getHex();
    const rune = definition.dragonType === "fire" ? 0xffa050
      : definition.dragonType === "ice" ? 0x9ff2ff
        : definition.dragonType === "sea" ? 0x8ff2df : 0xdfe9ef;
    // Alternate tiers rotate 45° so the stack reads as a rounded ovoid rather
    // than a wedding cake; the fifth shell crowns it with a soft point.
    const shellPieces = [
      addBox([0.2, 0.08, 0.2], [0, -0.16, 0], shellShadow, [0, Math.PI / 4, 0]),
      addBox([0.29, 0.13, 0.27], [0, -0.06, 0], shellDeep),
      addBox([0.33, 0.17, 0.31], [0, 0.085, 0], definition.color, [0, Math.PI / 4, 0]),
      addBox([0.27, 0.15, 0.25], [0, 0.24, 0], definition.color),
      addBox([0.16, 0.13, 0.15], [0, 0.365, 0], shellHighlight, [0, Math.PI / 4, 0]),
    ];
    shellPieces.forEach((piece, index) => { piece.name = `dragon-egg-shell-${index + 1}`; });
    for (const [sx, sy, sz, dark] of [
      [-0.11, 0.13, -0.135, false], [0.13, 0.02, -0.125, true], [-0.09, -0.05, -0.13, false], [0.05, 0.3, -0.11, true],
    ] as Array<[number, number, number, boolean]>) {
      addBox([0.045, 0.045, 0.02], [sx, sy, sz], dark ? shellShadow : shellHighlight).name = "dragon-egg-speckle";
    }
    const crackStem = addBox([0.028, 0.15, 0.025], [0.02, 0.14, -0.168], rune, [0, 0, 0.42], true);
    const crackLeft = addBox([0.026, 0.1, 0.024], [-0.04, 0.225, -0.165], rune, [0, 0, -0.55], true);
    const crackRight = addBox([0.026, 0.09, 0.024], [0.085, 0.06, -0.16], rune, [0, 0, 0.78], true);
    crackStem.name = "dragon-egg-rune-stem";
    crackLeft.name = "dragon-egg-rune-left";
    crackRight.name = "dragon-egg-rune-right";
    const glint = addBox([0.05, 0.05, 0.05], [0.02, 0.45, 0], rune, [0.3, Math.PI / 4, 0.3], true);
    glint.name = "dragon-egg-crown-glint";
    group.scale.setScalar(0.78);
    group.rotation.set(0.06, 0.28, -0.08);
    group.position.set(0, -0.03, -0.06);
    group.userData.dragonEggType = definition.dragonType;
  } else if (definition.heldModel === "orb-rack") {
    addBox([0.54, 0.1, 0.34], [0, -0.13, 0], 0x765139);
    for (const x of [-0.23, 0.23]) addBox([0.07, 0.48, 0.08], [x, 0.08, 0], 0x4e3526);
    for (const y of [-0.01, 0.19]) addBox([0.43, 0.055, 0.07], [0, y, 0], 0x8a6042);
    for (const x of [-0.15, -0.05, 0.05, 0.15]) addSphere(0.045, [x, 0.25, -0.035], 0x7de0d9, true);
    group.scale.setScalar(0.82);
    group.rotation.set(0.12, 0.28, -0.08);
  } else if (definition.heldModel === "orb-healer") {
    addBox([0.5, 0.1, 0.45], [0, -0.16, 0], 0x46575a);
    addBox([0.44, 0.44, 0.4], [0, 0.08, 0], 0x2f5558);
    addSphere(0.16, [0, 0.09, -0.19], 0x8df2e8, true);
    addBox([0.52, 0.08, 0.47], [0, 0.34, 0], 0x637376);
    group.scale.setScalar(0.74);
    group.rotation.set(0.1, 0.25, -0.08);
  } else if (definition.heldModel === "cartography") {
    addBox([0.58, 0.12, 0.48], [0, 0.08, 0], 0x76543a);
    addBox([0.52, 0.035, 0.42], [0, 0.16, 0], 0xd8c999);
    addBox([0.15, 0.025, 0.12], [0.1, 0.185, -0.05], 0x6e9f63);
    addBox([0.28, 0.02, 0.025], [-0.07, 0.19, 0.06], 0x5597b2, [0, 0.3, 0]);
    group.scale.setScalar(0.76);
    group.rotation.set(0.12, 0.28, -0.08);
  } else if (definition.heldModel === "alchemy") {
    addBox([0.48, 0.08, 0.4], [0, -0.16, 0], 0x51465f);
    addBox([0.07, 0.56, 0.07], [0, 0.08, 0], 0x8c76a6);
    addBox([0.48, 0.06, 0.07], [0, 0.18, 0], 0x8c76a6);
    for (const x of [-0.18, 0, 0.18]) {
      addBox([0.12, 0.2, 0.12], [x, 0.02, -0.02], x === 0 ? 0x68d5cd : 0xa98ccc, [0, 0, 0], true);
      addBox([0.05, 0.09, 0.05], [x, 0.17, -0.02], 0xc7e7e3);
    }
    group.scale.setScalar(0.72);
    group.rotation.set(0.1, 0.25, -0.08);
  } else if (definition.heldModel === "sugarworks") {
    addBox([0.5, 0.12, 0.42], [0, -0.18, 0], 0x8f456d);
    addBox([0.43, 0.38, 0.36], [0, 0.02, 0], 0xf39abe);
    addBox([0.35, 0.08, 0.3], [0, 0.24, 0], 0xffd6e8);
    addBox([0.12, 0.27, 0.1], [-0.12, 0.08, -0.22], 0xef5364, [0, 0, -0.16]);
    addBox([0.12, 0.27, 0.1], [0.12, 0.08, -0.22], 0xf6f0e9, [0, 0, 0.16]);
    const vat = addSphere(0.13, [0, 0.1, -0.23], 0xd8893f, true);
    vat.scale.set(1.2, 0.55, 0.5);
    addBox([0.07, 0.27, 0.07], [0.18, 0.39, 0], 0xf8edf2);
    addSphere(0.075, [0.18, 0.54, 0], 0xe98cba, true);
    group.scale.setScalar(0.7);
    group.rotation.set(0.1, 0.28, -0.08);
  } else if (definition.heldModel === "wayshrine") {
    addBox([0.5, 0.12, 0.42], [0, -0.2, 0], 0x596c67);
    addBox([0.28, 0.6, 0.22], [0, 0.1, 0], 0x4f7f7c);
    addBox([0.13, 0.26, 0.025], [0, 0.12, -0.125], 0x79d8cd, [0, 0, 0], true);
    addBox([0.4, 0.09, 0.3], [0, 0.43, 0], 0x806d4b);
    group.scale.setScalar(0.66);
    group.rotation.set(0.08, 0.25, -0.08);
  } else if (definition.heldModel === "distillery") {
    addBox([0.48, 0.54, 0.42], [0, 0.04, 0], 0x98643a);
    for (const y of [-0.12, 0.18]) addBox([0.53, 0.06, 0.46], [0, y, 0], 0xb28c4c);
    addBox([0.08, 0.15, 0.12], [0, 0.02, -0.25], 0xc7a548);
    group.scale.setScalar(0.72);
    group.rotation.set(0.1, 0.27, -0.08);
  } else if (definition.heldModel === "chair") {
    addBox([0.42, 0.1, 0.38], [0, -0.02, 0], 0x9f7144);
    for (const [x, z] of [[-0.17, -0.15], [0.17, -0.15], [-0.17, 0.15], [0.17, 0.15]] as Array<[number, number]>) addBox([0.06, 0.4, 0.06], [x, -0.22, z], 0x70482b);
    addBox([0.42, 0.44, 0.08], [0, 0.23, 0.15], 0x9f7144);
    group.scale.setScalar(0.72);
    group.rotation.set(0.12, 0.25, -0.08);
  } else if (definition.heldModel === "bottle" || definition.heldModel === "potion" || definition.heldModel === "mead") {
    const liquid = definition.heldModel === "bottle" && item === Item.GlassBottle ? null : definition.color;
    addBox([0.2, 0.3, 0.16], [0, 0, 0], 0xc7e7e3);
    if (liquid) addBox([0.16, 0.2, 0.13], [0, -0.035, -0.01], liquid, [0, 0, 0], definition.heldModel === "potion");
    addBox([0.09, 0.14, 0.09], [0, 0.21, 0], 0xc7e7e3);
    addBox([0.12, 0.06, 0.12], [0, 0.3, 0], definition.heldModel === "mead" ? 0x7a4b28 : 0x8d7654);
    group.scale.setScalar(0.92);
    group.rotation.set(0.08, 0.2, -0.08);
  } else if (definition.heldModel === "blueprint") {
    addBox([0.48, 0.04, 0.62], [0, 0.08, 0], 0xe2c98b, [0.08, 0.16, -0.05]);
    for (const y of [-0.1, 0.04, 0.18]) addBox([0.28, 0.018, 0.02], [0, 0.13, y], 0x6f735d, [0.08, 0.16, -0.05]);
    addBox([0.1, 0.02, 0.1], [0.12, 0.14, -0.2], definition.color, [0.08, 0.16, -0.05], true);
    group.scale.setScalar(0.82);
  } else if (definition.heldModel === "crossbow") {
    addBox([0.11, 0.12, 0.9], [0, 0.02, -0.12], 0x765038);
    addBox([0.08, 0.09, 0.72], [0, 0.04, -0.46], definition.color);
    addBox([0.86, 0.09, 0.1], [0, 0.04, -0.64], 0x9a7847, [0, 0, 0.14]);
    addBox([0.86, 0.035, 0.035], [0, 0.08, -0.58], 0xd6d2c5, [0, 0, -0.14]);
    addBox([0.08, 0.08, 0.94], [0, 0.12, -0.18], 0xbdc6c2);
    group.scale.setScalar(0.64);
    group.rotation.set(0.02, 0.04, -0.08);
    group.position.set(0, 0.03, -0.3);
    group.userData.workingAngle = Math.PI / 2;
  } else if (definition.heldModel === "spear") {
    addBox([0.08, 0.08, 1.45], [0, 0, -0.26], 0x7b542f);
    const point = addBox([0.18, 0.12, 0.34], [0, 0, -1.12], definition.color, [0, Math.PI / 4, 0]);
    point.name = "spear-point";
    group.scale.setScalar(0.72);
    group.rotation.set(0.02, 0.04, -0.08);
    group.position.set(0, 0.02, -0.25);
    group.userData.workingAngle = Math.PI / 2;
  } else if (item === BlockId.Torch) {
    addBox([0.1, 0.62, 0.1], [0, 0.22, 0], 0x8d542b);
    const outer = addBox([0.16, 0.14, 0.16], [0, 0.58, 0], 0xffb33e, [0, 0, 0], true);
    const inner = addBox([0.08, 0.11, 0.08], [0, 0.7, 0], 0xfff0a0, [0, 0, 0], true);
    outer.name = "torch-flame-outer";
    inner.name = "torch-flame-inner";
    outer.userData.torchBase = outer.position.toArray();
    inner.userData.torchBase = inner.position.toArray();
  } else if (item === Item.Berry) {
    // Keep remote/third-person Moonberries identical to the first-person
    // cluster instead of collapsing them into the generic item brick.
    addBox([0.11, 0.11, 0.11], [-0.07, 0.02, 0], 0x754399, [0.2, 0.1, 0]);
    addBox([0.11, 0.11, 0.11], [0.06, 0.01, 0.02], 0x955bbb, [-0.1, 0.2, 0]);
    addBox([0.1, 0.1, 0.1], [0, 0.12, -0.01], 0x854fa8, [0.1, -0.2, 0]);
    addBox([0.2, 0.035, 0.1], [0, 0.2, 0], 0x568044, [0, 0, 0.28]);
    group.scale.setScalar(1.05);
  } else if (item === Item.Apple) {
    addBox([0.23, 0.22, 0.2], [0, 0.02, 0], 0xc8493e, [0.08, 0.18, 0]);
    addBox([0.045, 0.15, 0.045], [0, 0.18, 0], 0x6b4226, [0, 0, -0.08]);
    addBox([0.14, 0.035, 0.08], [0.07, 0.21, 0], 0x5f8d47, [0, 0, 0.32]);
  } else if (item === Item.Stick) {
    addBox([0.075, 0.54, 0.075], [0, 0.02, 0], 0x8b5a30, [0.2, 0.1, -0.36]);
  } else if (item === Item.RottenFlesh) {
    addBox([0.26, 0.34, 0.14], [0, 0.03, 0], 0x76553f, [0.18, 0.2, -0.08]);
    addBox([0.19, 0.08, 0.15], [0.04, 0.17, -0.01], 0x98705a, [-0.08, 0.1, 0.22]);
  } else if ([BlockId.RedFlower, BlockId.BlueFlower, BlockId.Sunpetal, BlockId.MoonOrchid].includes(item as BlockId)) {
    addBox([0.05, 0.42, 0.05], [0, -0.05, 0], 0x4d863f, [0.12, 0, -0.16]);
    addBox([0.26, 0.075, 0.26], [-0.03, 0.19, 0], definition.color, [0.08, 0.15, 0.18]);
    addBox([0.07, 0.09, 0.07], [-0.03, 0.22, -0.01], 0xf2c34d, [0, 0, 0], true);
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
    group.rotation.set(-Math.PI / 2, 0.02, -0.12);
    group.position.set(0, -0.08, -0.2);
    group.userData.workingAngle = Math.PI / 2;
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
    group.rotation.set(-Math.PI / 2, 0.1, -0.1);
    group.position.set(0, -0.05, -0.22);
    group.userData.workingAngle = Math.PI / 2;
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
