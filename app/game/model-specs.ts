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
  category: "tool" | "mob" | "block" | "utility";
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
    box("left-eye", "head", [0.1, 0.075, 0.035], [-0.14, 1.73, -0.295], "#171912", ZERO_ROTATION, { emissive: true }),
    box("right-eye", "head", [0.1, 0.075, 0.035], [0.14, 1.73, -0.295], "#171912", ZERO_ROTATION, { emissive: true }),
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
  for (let plate = 0; plate < 5; plate += 1) {
    boxes.push(box(`ridge-plate-${plate + 1}`, "body", [0.36 - plate * 0.025, 0.2, 0.16], [0, y(0.52), -0.4 + plate * 0.26], dark, ZERO_ROTATION, plate === 0 ? { label: "Back plates" } : {}));
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
  createRidgebackSpec(),
  createZombieSpec(),
  createChestSpec(),
  createTorchSpec(),
  createStoneBlockSpec(),
];
