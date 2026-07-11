import type { ToolKind } from "./data";

export type ModelColor = string | number;
export type ModelVector3 = readonly [x: number, y: number, z: number];

/**
 * A renderer-independent cuboid. Positions and rotations are expressed in the
 * model's local coordinates; rotation uses XYZ Euler radians about the box's
 * center. Keeping this file free of Three.js makes the specs useful to both the
 * game renderer and lightweight inspection/export tools.
 */
export type ModelBox = {
  id: string;
  part: string;
  label?: string;
  size: ModelVector3;
  position: ModelVector3;
  rotation?: ModelVector3;
  color: ModelColor;
  emissive?: boolean;
};

export type ModelSpec = {
  id: string;
  label: string;
  category: "tool" | "mob" | "player" | "block" | "utility";
  /** All character and held-item specs face toward local negative Z. */
  front: "-z";
  /** Local Y coordinate of the intended terrain surface, when the model is grounded. */
  groundY?: number;
  /** Boxes whose lowest vertices are intended to touch groundY. */
  groundContactBoxIds?: readonly string[];
  boxes: readonly ModelBox[];
};

const ZERO_ROTATION: ModelVector3 = [0, 0, 0];
const HANDLE_COLOR = "#81542f";
const HANDLE_DARK = "#4d301d";
export const ZOMBIE_EYE_COLOR = "#ffffff";

function box(
  id: string,
  part: string,
  size: ModelVector3,
  position: ModelVector3,
  color: ModelColor,
  rotation: ModelVector3 = ZERO_ROTATION,
  extras: Pick<ModelBox, "label" | "emissive"> = {},
): ModelBox {
  return { id, part, size, position, rotation, color, ...extras };
}

/** Throws early when a production model contains invalid or duplicate boxes. */
export function assertModelSpec(spec: ModelSpec): ModelSpec {
  const ids = new Set<string>();
  if (!spec.id || !spec.label || !spec.boxes.length) throw new Error("A model spec requires an id, label, and at least one box.");
  if (spec.groundY !== undefined && !Number.isFinite(spec.groundY)) throw new Error(`Model '${spec.id}' has an invalid ground plane.`);
  for (const modelBox of spec.boxes) {
    if (ids.has(modelBox.id)) throw new Error(`Duplicate box id '${modelBox.id}' in model '${spec.id}'.`);
    ids.add(modelBox.id);
    if (!modelBox.part) throw new Error(`Box '${modelBox.id}' in model '${spec.id}' has no semantic part.`);
    if (modelBox.size.some((value) => !Number.isFinite(value) || value <= 0)) throw new Error(`Box '${modelBox.id}' in model '${spec.id}' has an invalid size.`);
    if (modelBox.position.some((value) => !Number.isFinite(value))) throw new Error(`Box '${modelBox.id}' in model '${spec.id}' has an invalid position.`);
    if (modelBox.rotation?.some((value) => !Number.isFinite(value))) throw new Error(`Box '${modelBox.id}' in model '${spec.id}' has an invalid rotation.`);
  }
  for (const contactId of spec.groundContactBoxIds ?? []) {
    if (!ids.has(contactId)) throw new Error(`Ground-contact box '${contactId}' does not exist in model '${spec.id}'.`);
  }
  return spec;
}

/**
 * Canonical held-tool geometry. Every head overlaps the handle/guard slightly,
 * so no component can appear to float when rotated in first person. The broad
 * readable face of each tool points toward local -Z.
 */
export function createHeldToolSpec(kind: ToolKind, color: ModelColor, label?: string): ModelSpec {
  const title = label ?? `${kind[0].toUpperCase()}${kind.slice(1)}`;
  const boxes: ModelBox[] = [];

  if (kind === "sword") {
    boxes.push(
      box("pommel", "handle", [0.18, 0.16, 0.14], [0, -0.55, 0], HANDLE_DARK),
      box("grip", "handle", [0.12, 0.52, 0.12], [0, -0.25, 0], HANDLE_COLOR),
      box("guard", "guard", [0.48, 0.11, 0.15], [0, 0.02, 0], HANDLE_DARK),
      box("blade", "head", [0.18, 0.78, 0.1], [0, 0.45, 0], color),
      box("blade-tip", "head", [0.18, 0.18, 0.1], [0, 0.89, 0], color, [0, 0, Math.PI / 4]),
    );
  } else if (kind === "pickaxe") {
    boxes.push(
      box("handle-cap", "handle", [0.16, 0.14, 0.15], [0, -0.64, 0], HANDLE_DARK),
      box("handle", "handle", [0.11, 0.9, 0.11], [0, -0.19, 0], HANDLE_COLOR),
      box("pick-head", "head", [0.62, 0.14, 0.14], [0, 0.29, 0], color),
      box("pick-left", "head", [0.27, 0.15, 0.14], [-0.39, 0.24, 0], color, [0, 0, -0.34]),
      box("pick-right", "head", [0.27, 0.15, 0.14], [0.39, 0.24, 0], color, [0, 0, 0.34]),
    );
  } else if (kind === "axe") {
    boxes.push(
      box("handle-cap", "handle", [0.16, 0.14, 0.15], [0, -0.64, 0], HANDLE_DARK),
      box("handle", "handle", [0.11, 0.9, 0.11], [0, -0.19, 0], HANDLE_COLOR),
      box("axe-hub", "head", [0.28, 0.22, 0.14], [-0.01, 0.27, 0], color),
      box("axe-blade-upper", "head", [0.31, 0.27, 0.12], [-0.24, 0.34, 0], color),
      box("axe-blade-lower", "head", [0.24, 0.22, 0.12], [-0.31, 0.16, 0], color),
      box("axe-poll", "head", [0.2, 0.14, 0.14], [0.22, 0.28, 0], color),
    );
  } else if (kind === "crossbow") {
    boxes.push(
      box("crossbow-stock", "handle", FACTION_WEAPON_CONTRACTS.crossbow.stockSize, [0, -0.02, 0.08], HANDLE_COLOR),
      box("crossbow-butt", "handle", [0.28, 0.22, 0.34], [0, -0.03, 0.72], HANDLE_DARK),
      box("crossbow-grip", "handle", [0.14, 0.34, 0.16], [0, -0.25, 0.23], HANDLE_DARK, [0.22, 0, 0]),
      box("crossbow-lath", "head", FACTION_WEAPON_CONTRACTS.crossbow.lathSize, [0, 0.02, -0.45], color),
      box("crossbow-left-string", "string", [0.035, 0.035, 0.56], [-0.27, 0.03, -0.44], "#e8dec6", [0, -0.78, 0]),
      box("crossbow-right-string", "string", [0.035, 0.035, 0.56], [0.27, 0.03, -0.44], "#e8dec6", [0, 0.78, 0]),
      box("loaded-bolt", "ammo", FACTION_WEAPON_CONTRACTS.crossbow.boltSize, [0, 0.1, -0.3], "#ad8751"),
      box("loaded-bolt-head", "ammo", [0.18, 0.12, 0.22], [0, 0.1, FACTION_WEAPON_CONTRACTS.crossbow.boltTipForward], color),
    );
  } else if (kind === "spear") {
    boxes.push(
      box("spear-butt", "handle", [0.17, 0.17, 0.2], [0, 0, 0.78], HANDLE_DARK),
      box("spear-shaft", "handle", FACTION_WEAPON_CONTRACTS.spear.shaftSize, [0, 0, -0.05], HANDLE_COLOR),
      box("spear-collar", "head", [0.17, 0.17, 0.18], [0, 0, -1.02], color),
      box("spear-head", "head", FACTION_WEAPON_CONTRACTS.spear.headSize, [0, 0, FACTION_WEAPON_CONTRACTS.spear.headForward], color),
      box("spear-left-bevel", "head", [0.17, 0.13, 0.34], [-0.1, 0, -1.64], color, [0, -0.28, 0]),
      box("spear-right-bevel", "head", [0.17, 0.13, 0.34], [0.1, 0, -1.64], color, [0, 0.28, 0]),
    );
  } else {
    boxes.push(
      box("handle-cap", "handle", [0.16, 0.14, 0.15], [0, -0.64, 0], HANDLE_DARK),
      box("handle", "handle", [0.11, 0.92, 0.11], [0, -0.19, 0], HANDLE_COLOR),
      box("shovel-neck", "head", [0.15, 0.18, 0.13], [0, 0.29, 0], color),
      box("shovel-blade", "head", [0.34, 0.34, 0.12], [0, 0.48, 0], color),
      box("shovel-tip", "head", [0.23, 0.23, 0.12], [0, 0.69, 0], color, [0, 0, Math.PI / 4]),
    );
  }

  return assertModelSpec({ id: `held-${kind}`, label: title, category: "tool", front: "-z", boxes });
}

export function createZombieSpec(): ModelSpec {
  const skin = "#69934f";
  const skinDark = "#4e713b";
  const shirt = "#3f9b91";
  const shirtDark = "#2e716c";
  const trousers = "#3d4c9a";
  const boxes: ModelBox[] = [
    box("left-leg", "leftLeg", [0.24, 0.74, 0.27], [-0.16, 0.37, 0], trousers, ZERO_ROTATION, { label: "Left leg" }),
    box("right-leg", "rightLeg", [0.24, 0.74, 0.27], [0.16, 0.37, 0], trousers, ZERO_ROTATION, { label: "Right leg" }),
    box("body", "body", [0.66, 0.72, 0.34], [0, 1.08, 0], shirt, ZERO_ROTATION, { label: "Chest" }),
    // Arms run from each shoulder toward negative Z, the declared model front.
    box("left-arm-sleeve", "leftArm", [0.23, 0.24, 0.34], [-0.445, 1.25, -0.08], shirtDark, ZERO_ROTATION, { label: "Left arm" }),
    box("left-arm", "leftArm", [0.22, 0.22, 0.5], [-0.445, 1.25, -0.49], skin, ZERO_ROTATION),
    box("right-arm-sleeve", "rightArm", [0.23, 0.24, 0.34], [0.445, 1.25, -0.08], shirtDark, ZERO_ROTATION, { label: "Right arm" }),
    box("right-arm", "rightArm", [0.22, 0.22, 0.5], [0.445, 1.25, -0.49], skin, ZERO_ROTATION),
    box("head", "head", [0.52, 0.52, 0.52], [0, 1.7, -0.02], skin, ZERO_ROTATION, { label: "Head" }),
    box("brow", "head", [0.38, 0.08, 0.035], [0, 1.82, -0.292], skinDark),
    box("left-eye", "head", [0.12, 0.09, 0.035], [-0.14, 1.73, -0.295], ZOMBIE_EYE_COLOR, ZERO_ROTATION, { emissive: true }),
    box("right-eye", "head", [0.12, 0.09, 0.035], [0.14, 1.73, -0.295], ZOMBIE_EYE_COLOR, ZERO_ROTATION, { emissive: true }),
    box("left-pupil", "head", [0.045, 0.055, 0.018], [-0.14, 1.725, -0.323], "#171912"),
    box("right-pupil", "head", [0.045, 0.055, 0.018], [0.14, 1.725, -0.323], "#171912"),
    box("mouth", "head", [0.24, 0.065, 0.035], [0, 1.57, -0.295], "#3d3228"),
  ];
  return assertModelSpec({
    id: "zombie",
    label: "Zombie",
    category: "mob",
    front: "-z",
    groundY: 0,
    groundContactBoxIds: ["left-leg", "right-leg"],
    boxes,
  });
}

/** Lift applied to legacy Ridgeback cuboids so their hoof plane becomes local Y=0. */
export const RIDGEBACK_GROUND_LIFT = 0.66;

/**
 * Canonical Ridgeback inspection geometry. It mirrors the production cuboids,
 * but is normalized so every hoof bottoms out exactly on local ground Y=0.
 */
export function createRidgebackSpec(): ModelSpec {
  const body = "#875437";
  const accent = "#c07d54";
  const dark = "#543423";
  const eye = "#291912";
  const bone = "#e8d8af";
  const y = (productionY: number) => productionY + RIDGEBACK_GROUND_LIFT;
  const boxes: ModelBox[] = [
    box("body", "body", [0.88, 0.62, 1.32], [0, y(0.08), 0.05], body, ZERO_ROTATION, { label: "Body" }),
    box("head", "head", [0.64, 0.5, 0.62], [0, y(0.1), -0.8], accent, ZERO_ROTATION, { label: "Head" }),
    box("muzzle", "head", [0.48, 0.3, 0.38], [0, y(-0.03), -1.18], dark),
    box("left-eye", "head", [0.07, 0.08, 0.04], [-0.19, y(0.2), -1.13], eye, ZERO_ROTATION, { emissive: true }),
    box("right-eye", "head", [0.07, 0.08, 0.04], [0.19, y(0.2), -1.13], eye, ZERO_ROTATION, { emissive: true }),
    box("left-tusk", "head", [0.08, 0.1, 0.3], [-0.27, y(-0.03), -1.35], bone),
    box("right-tusk", "head", [0.08, 0.1, 0.3], [0.27, y(-0.03), -1.35], bone),
    box("front-left-leg", "legs", [0.18, 0.48, 0.2], [-0.31, 0.24, -0.38], body, ZERO_ROTATION, { label: "Hooves" }),
    box("front-right-leg", "legs", [0.18, 0.48, 0.2], [0.31, 0.24, -0.38], body),
    box("rear-left-leg", "legs", [0.18, 0.48, 0.2], [-0.31, 0.24, 0.42], body),
    box("rear-right-leg", "legs", [0.18, 0.48, 0.2], [0.31, 0.24, 0.42], body),
    // The production tail rotates around a pivot at [0, .24, .72]. This is
    // the equivalent world-space box center after that pivot rotation.
    box("tail", "body", [0.12, 0.12, 0.48], [0, y(0.24 - Math.sin(0.55) * 0.24), 0.72 + Math.cos(0.55) * 0.24], dark, [0.55, 0, 0], { label: "Tail" }),
  ];
  for (let plate = 0; plate < 6; plate += 1) {
    const height = 0.18 + Math.sin(((plate + 1) / 7) * Math.PI) * 0.13;
    // The body top is local Y=.39; every ridge begins exactly on that plane.
    boxes.push(box(`ridge-plate-${plate + 1}`, "body", [0.38 - plate * 0.027, height, 0.15], [0, y(0.39 + height / 2), -0.48 + plate * 0.225], dark, [0, plate % 2 ? 0.035 : -0.035, 0], plate === 0 ? { label: "Back plates" } : {}));
  }
  return assertModelSpec({
    id: "ridgeback",
    label: "Ridgeback",
    category: "mob",
    front: "-z",
    groundY: 0,
    groundContactBoxIds: ["front-left-leg", "front-right-leg", "rear-left-leg", "rear-right-leg"],
    boxes,
  });
}

export function createChestSpec(): ModelSpec {
  return assertModelSpec({
    id: "wildwood-chest",
    label: "Wildwood Chest",
    category: "utility",
    front: "-z",
    boxes: [
      box("chest-base", "body", [0.9, 0.58, 0.72], [0, 0.34, 0], "#8e592d", ZERO_ROTATION, { label: "Base" }),
      box("chest-band", "body", [0.92, 0.1, 0.74], [0, 0.6, 0], "#59351f"),
      box("chest-lid", "lid", [0.92, 0.18, 0.74], [0, 0.71, 0], "#a36b35", ZERO_ROTATION, { label: "Lid" }),
      box("chest-latch", "latch", [0.18, 0.24, 0.08], [0, 0.59, -0.39], "#e0b94d", ZERO_ROTATION, { label: "Front latch" }),
    ],
  });
}

export const BUTTERFLY_ANTENNA_CONTRACT = Object.freeze({
  count: 2,
  rootCenter: [0, 0.02, -0.078] as const,
  rootLateral: 0.012,
  length: 0.16,
  thickness: 0.008,
  lateralSplayRadians: 0.22,
  /** Positive X pitch lifts a shaft whose local tip points toward negative Z. */
  forwardTiltRadians: 0.42,
  tipScale: 1.35,
});

export const RATTLEKIN_CLUB_CONTRACT = Object.freeze({
  forwardAxis: "-z" as const,
  handAnchor: [0, -0.72, -0.04] as const,
  handleSize: [0.18, 0.18, 0.86] as const,
  handleCenter: [0, -0.72, -0.47] as const,
  headSize: [0.48, 0.42, 0.4] as const,
  headCenter: [0, -0.72, -1.02] as const,
});

/** Shared readability contract for settlement weapons in production portraits and runtime rigs. */
export const FACTION_WEAPON_CONTRACTS = Object.freeze({
  hammer: Object.freeze({
    forwardAxis: "-z" as const,
    handleSize: [0.1, 0.1, 1.18] as const,
    headSize: [0.54, 0.3, 0.28] as const,
    headForward: -1.17,
  }),
  crossbow: Object.freeze({
    forwardAxis: "-z" as const,
    stockSize: [0.12, 0.15, 1.12] as const,
    lathSize: [0.9, 0.1, 0.12] as const,
    boltSize: [0.035, 0.035, 1.25] as const,
    boltTipForward: -1.4,
  }),
  spear: Object.freeze({
    forwardAxis: "-z" as const,
    shaftSize: [0.09, 0.09, 1.9] as const,
    headSize: [0.24, 0.18, 0.42] as const,
    headForward: -1.91,
  }),
});

export function createApiarySpec(): ModelSpec {
  return assertModelSpec({
    id: "wildwood-apiary",
    label: "Wildwood Apiary",
    category: "utility",
    front: "-z",
    boxes: [
      box("apiary-body", "body", [0.9, 0.66, 0.76], [0, 0.55, 0], "#b97932", ZERO_ROTATION, { label: "Hive body" }),
      box("apiary-roof", "roof", [1.02, 0.16, 0.88], [0, 0.96, 0], "#684224", ZERO_ROTATION, { label: "Weather roof" }),
      box("apiary-lip", "entrance", [0.72, 0.1, 0.22], [0, 0.35, -0.48], "#d39a45", ZERO_ROTATION, { label: "Landing board" }),
      box("apiary-slot", "entrance", [0.48, 0.1, 0.05], [0, 0.54, -0.405], "#332219"),
      box("apiary-band-upper", "body", [0.94, 0.08, 0.8], [0, 0.79, 0], "#78502d"),
      box("apiary-band-lower", "body", [0.94, 0.08, 0.8], [0, 0.36, 0], "#78502d"),
      box("apiary-left-foot", "base", [0.16, 0.28, 0.16], [-0.31, 0.14, 0.22], "#604021"),
      box("apiary-right-foot", "base", [0.16, 0.28, 0.16], [0.31, 0.14, 0.22], "#604021"),
      box("apiary-comb-window", "honey", [0.34, 0.28, 0.045], [0, 0.69, -0.405], "#e3aa32", ZERO_ROTATION, { emissive: true }),
    ],
  });
}

export function createCaptureOrbSpec(): ModelSpec {
  return assertModelSpec({
    id: "waykeeper-capture-orb",
    label: "Waykeeper Capture Orb",
    category: "utility",
    front: "-z",
    boxes: [
      box("orb-core", "core", [0.38, 0.38, 0.38], [0, 0.42, 0], "#75dfda", [0, Math.PI / 4, 0], { label: "Tideglass core", emissive: true }),
      box("orb-core-front", "core", [0.28, 0.28, 0.08], [0, 0.42, -0.235], "#c8fff5", [0, 0, Math.PI / 4], { emissive: true }),
      box("orb-band-x", "frame", [0.58, 0.08, 0.1], [0, 0.42, 0], "#57402f"),
      box("orb-band-y", "frame", [0.08, 0.58, 0.1], [0, 0.42, 0], "#57402f"),
      box("orb-band-z", "frame", [0.1, 0.08, 0.58], [0, 0.42, 0], "#8f6b3c"),
      box("orb-top-cap", "frame", [0.18, 0.12, 0.18], [0, 0.72, 0], "#d6b45b"),
      box("orb-bottom-cap", "frame", [0.18, 0.12, 0.18], [0, 0.12, 0], "#d6b45b"),
      box("orb-rune", "rune", [0.11, 0.11, 0.03], [0, 0.42, -0.29], "#fff1a2", [0, 0, Math.PI / 4], { emissive: true, label: "Capture rune" }),
    ],
  });
}

export function createOrbRackSpec(): ModelSpec {
  const boxes: ModelBox[] = [
    box("rack-base", "base", [1.18, 0.18, 0.48], [0, 0.12, 0], "#6f492b", ZERO_ROTATION, { label: "Four-orb rack" }),
    box("rack-back", "frame", [1.18, 0.48, 0.12], [0, 0.39, 0.18], "#8e5b32"),
  ];
  for (let slot = 0; slot < 4; slot += 1) {
    const x = -0.42 + slot * 0.28;
    boxes.push(
      box(`rack-socket-${slot + 1}`, "socket", [0.2, 0.08, 0.22], [x, 0.25, -0.08], "#3e3029"),
      box(`rack-orb-${slot + 1}`, "orb", [0.15, 0.15, 0.15], [x, 0.4, -0.08], slot % 2 ? "#71d6d2" : "#9eeae1", [0, Math.PI / 4, 0], { emissive: true }),
    );
  }
  return assertModelSpec({ id: "capture-orb-rack", label: "Four-Orb Rack", category: "utility", front: "-z", boxes });
}

export function createHealingStationSpec(): ModelSpec {
  const boxes: ModelBox[] = [
    box("healer-base", "base", [1.25, 0.2, 1.0], [0, 0.12, 0], "#4b5551", ZERO_ROTATION, { label: "Healing station" }),
    box("healer-core", "core", [0.3, 0.72, 0.3], [0, 0.56, 0.12], "#65cfc7", [0, Math.PI / 4, 0], { emissive: true }),
    box("healer-canopy", "frame", [1.12, 0.12, 0.88], [0, 1.0, 0], "#88aa9d"),
  ];
  for (const [slot, x, z] of [[1, -0.38, -0.25], [2, 0.38, -0.25], [3, -0.38, 0.32], [4, 0.38, 0.32]] as const) {
    boxes.push(
      box(`healer-pedestal-${slot}`, "pedestal", [0.24, 0.3, 0.24], [x, 0.31, z], "#65706c"),
      box(`healer-orb-glow-${slot}`, "orb", [0.17, 0.17, 0.17], [x, 0.55, z], "#9af0dc", [0, Math.PI / 4, 0], { emissive: true }),
    );
  }
  return assertModelSpec({ id: "creature-healing-station", label: "Four-Slot Creature Healer", category: "utility", front: "-z", boxes });
}

export type ItemModelKey = "wildwood-chest" | "apiary" | "capture-orb" | "orb-rack" | "orb-healer";

export function modelSpecForItemModel(key: ItemModelKey): ModelSpec {
  if (key === "wildwood-chest") return createChestSpec();
  if (key === "apiary") return createApiarySpec();
  if (key === "capture-orb") return createCaptureOrbSpec();
  if (key === "orb-rack") return createOrbRackSpec();
  return createHealingStationSpec();
}

export function createTorchSpec(): ModelSpec {
  return assertModelSpec({
    id: "torch",
    label: "Torch",
    category: "utility",
    front: "-z",
    boxes: [
      box("torch-stick", "handle", [0.1, 0.72, 0.1], [0, 0.36, 0], HANDLE_COLOR, ZERO_ROTATION, { label: "Stick" }),
      box("torch-collar", "head", [0.16, 0.12, 0.16], [0, 0.73, 0], "#b8662d"),
      box("torch-flame", "flame", [0.18, 0.22, 0.18], [0, 0.88, 0], "#f3a42d", [0, 0, Math.PI / 4], { label: "Flame", emissive: true }),
      box("torch-flame-core", "flame", [0.09, 0.18, 0.09], [0, 0.93, -0.015], "#fff09a", [0, 0, Math.PI / 4], { emissive: true }),
    ],
  });
}

export function createStoneBlockSpec(): ModelSpec {
  return assertModelSpec({
    id: "stone-block",
    label: "Stone Block",
    category: "block",
    front: "-z",
    boxes: [box("stone", "block", [1, 1, 1], [0, 0.5, 0], "#777d7e", ZERO_ROTATION, { label: "Block" })],
  });
}

export const INSPECTOR_MODEL_SPECS: readonly ModelSpec[] = [
  createHeldToolSpec("pickaxe", "#858b89", "Stone Pickaxe"),
  createHeldToolSpec("axe", "#858b89", "Stone Axe"),
  createHeldToolSpec("shovel", "#858b89", "Stone Shovel"),
  createHeldToolSpec("sword", "#d4b9a7", "Sunmetal Sword"),
  createHeldToolSpec("crossbow", "#9b6a3c", "Hearthguard Crossbow"),
  createHeldToolSpec("spear", "#aa8843", "Goblinsmith Spear"),
  createRidgebackSpec(),
  createZombieSpec(),
  createChestSpec(),
  createApiarySpec(),
  createCaptureOrbSpec(),
  createOrbRackSpec(),
  createHealingStationSpec(),
  createTorchSpec(),
  createStoneBlockSpec(),
];
