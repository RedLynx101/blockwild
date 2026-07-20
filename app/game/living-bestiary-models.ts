import * as THREE from "three";
import { MOB_DEFS, type LegendaryCreatureKind, type LivingRosterKind, type MobKind, type SummonedCreatureKind } from "./mobs";
import type { MobVisual, MobVisualParts } from "./mob-models";

export type LivingBestiaryVisualKind = LivingRosterKind | LegendaryCreatureKind | SummonedCreatureKind;

export const LIVING_BESTIARY_VISUAL_KINDS = Object.freeze([
  "thornhide-trufflehog", "orchard-glider", "petalmask-tanuki", "ironbeak-magpie", "hearthback-badger", "sunfoil-pangolin",
  "glassstep-jerboa", "stormcrest-ibex", "cindercoil-gecko", "cloudkite-pika", "briarclaw-lynx", "gravebell-jackal",
  "cragglass-basilisk", "stormglass-roclet", "brinewhisk-otter", "riverwright-beaver", "mirecrown-crane", "inkveil-cuttle",
  "prismclaw-mantis-shrimp", "reefmender-shrimp", "currentweaver-eel", "shellcarrier-hermit", "wreckwhistle-porpoise",
  "kilnscale-salamander", "sporeback-gardener", "voidmantle-ray", "fossilback-trilobite",
  "ilyr-virebloom", "thalassene", "orichalc", "varkesh-stormmane", "kharza", "sugarwake-sovereign",
  "bellstep-qilin", "aerolith-baleen", "mireglass-kelpie", "cinderwing-pyrausta", "nacre-gatewyrm",
  "frostcauldron-behemoth", "briarcrown-manticore", "ammonarch", "handtail-ahuizotl", "tideclock-cetus",
  "anemoi-gryphon", "sable-gorgon", "namarra-makara", "ashen-salamander-king", "mycelial-oneirophant",
  "asterjaw", "vellum-warden", "choir-of-one", "glasswake-stag",
] as const satisfies readonly LivingBestiaryVisualKind[]);

/**
 * These four silhouettes depend on continuous reef growth, real negative
 * space, paper layering, or a hanging sound-body. They intentionally keep the
 * faceted primitive language while the rest of the expansion uses cuboids.
 */
export const FACETED_STORYBOOK_EXCEPTION_KINDS = Object.freeze([
  "thalassene",
  "orichalc",
  "vellum-warden",
  "choir-of-one",
] as const satisfies readonly LivingBestiaryVisualKind[]);

const FACETED_STORYBOOK_EXCEPTION_KIND_SET = new Set<LivingBestiaryVisualKind>(FACETED_STORYBOOK_EXCEPTION_KINDS);

/**
 * Creatures whose production geometry deliberately follows Blockwild's
 * high-detail cubic field-guide language. Their complete authored hierarchy is
 * retained; only the visible primitive is resolved to a cuboid, so the world
 * model matches the portrait instead of merely receiving a blocky illustration.
 */
export const CUBIC_STORYBOOK_VISUAL_KINDS = Object.freeze(
  LIVING_BESTIARY_VISUAL_KINDS.filter((kind) => !FACETED_STORYBOOK_EXCEPTION_KIND_SET.has(kind)),
);

const CUBIC_STORYBOOK_VISUAL_KIND_SET = new Set<LivingBestiaryVisualKind>(CUBIC_STORYBOOK_VISUAL_KINDS);

type Builder = ReturnType<typeof createBuilder>;

type LivingShape = "organic" | "hard" | "gem" | "spike-up" | "spike-forward" | "ring" | "limb-y" | "limb-x" | "limb-z" | "joint";

function livingShapeFor(name: string): LivingShape {
  if (/ring|whorl|halo|orbit/u.test(name)) return "ring";
  if (/beak|tusk|incisor|claw-tip|fang/u.test(name)) return "spike-forward";
  if (/thorn|crown-shard|spiral-horn|shoulder-briar|ear-tuft|storm-vane|mire-crown|antler|coral-[0-9]|plume/u.test(name)) return "spike-up";
  if (/spark|mote|star|permitted-note|heart-core|freckle|charge-node|unresolved-heart|shard/u.test(name)) return "gem";
  if (/harness|seat|blanket|buckle|grip|frame|vellum|unwritten-page|redline|road-marker|broken-banner|foil-scale|fossil-segment|prism-panel|kiln-plate|caramel-plate|coercion|tail-notch|route-line/u.test(name)) return "hard";
  return "organic";
}

function livingGeometry(shape: LivingShape) {
  if (shape === "hard") return new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
  if (shape === "gem") return new THREE.OctahedronGeometry(.5, 1);
  if (shape === "ring") return new THREE.TorusGeometry(.34, .16, 6, 14);
  if (shape === "joint") return new THREE.SphereGeometry(.5, 8, 5);
  if (shape === "limb-y" || shape === "limb-x" || shape === "limb-z") {
    // Eight-sided tapered bones preserve Blockwild's readable faceting while
    // giving limbs a clear direction and load path instead of an oval blob.
    const geometry = new THREE.CylinderGeometry(.38, .5, 1, 8, 2, false);
    if (shape === "limb-x") geometry.rotateZ(Math.PI / 2);
    if (shape === "limb-z") geometry.rotateX(Math.PI / 2);
    return geometry;
  }
  if (shape === "spike-up") return new THREE.ConeGeometry(.5, 1, 8, 2);
  if (shape === "spike-forward") {
    const geometry = new THREE.ConeGeometry(.5, 1, 8, 2);
    geometry.rotateX(-Math.PI / 2);
    return geometry;
  }
  // A deliberately modest segment count keeps herd rendering affordable while
  // replacing the cuboid anatomy with a softly faceted, voxel-adjacent style.
  return new THREE.SphereGeometry(.5, 10, 6);
}

function createBuilder(kind: LivingBestiaryVisualKind, id: number) {
  const group = new THREE.Group();
  const visual = new THREE.Group();
  group.name = `${kind}-root`;
  visual.name = `${kind}-visual`;
  visual.userData.wildlifeRig = kind;
  const cubicStorybook = CUBIC_STORYBOOK_VISUAL_KIND_SET.has(kind);
  visual.userData.modelStyle = cubicStorybook ? "high-detail-cubic" : "faceted-storybook";
  group.add(visual);
  const parts: MobVisualParts = { legs: [], wings: [], arms: [], head: [], body: [] };
  const [bodyColor, accentColor, eyeColor] = MOB_DEFS[kind].colors;
  const lambert = (color: THREE.ColorRepresentation, opacity = 1) => new THREE.MeshLambertMaterial({
    color, transparent: opacity < 1, opacity, depthWrite: opacity >= .9,
  });
  const glow = (color: THREE.ColorRepresentation, opacity = 1) => new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: .78, roughness: .28,
    transparent: opacity < 1, opacity, depthWrite: opacity >= .9,
  });
  const glassColor = new THREE.Color(eyeColor).lerp(new THREE.Color(0xffffff), .35);
  const mats = {
    body: lambert(bodyColor), accent: lambert(accentColor), eye: glow(eyeColor),
    dark: lambert(new THREE.Color(bodyColor).multiplyScalar(.56)),
    pale: lambert(new THREE.Color(accentColor).lerp(new THREE.Color(0xffffff), .46)),
    glow: glow(eyeColor),
    glass: new THREE.MeshPhysicalMaterial({
      color: glassColor, emissive: glassColor, emissiveIntensity: .12, transparent: true,
      opacity: .82, transmission: .16, thickness: .2, roughness: .13, metalness: .08,
      side: THREE.DoubleSide, depthWrite: false,
    }),
    membrane: new THREE.MeshPhysicalMaterial({
      color: glassColor, emissive: glassColor, emissiveIntensity: .06, transparent: true,
      opacity: .38, transmission: .48, thickness: .035, roughness: .2, metalness: 0,
      side: THREE.DoubleSide, depthWrite: false,
    }),
    metal: new THREE.MeshStandardMaterial({ color: 0xaeb8b7, metalness: .76, roughness: .3 }),
    black: new THREE.MeshStandardMaterial({ color: 0x24252a, roughness: .82 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf1eee2, roughness: .52 }),
  };
  const add = (parent: THREE.Object3D, size: [number, number, number], material: THREE.Material, position: [number, number, number], name: string, part?: keyof MobVisualParts, shapeOverride?: LivingShape) => {
    const authoredShape = shapeOverride ?? livingShapeFor(name);
    const resolvedShape: LivingShape = cubicStorybook ? "hard" : authoredShape;
    const mesh = new THREE.Mesh(cubicStorybook ? new THREE.BoxGeometry(1, 1, 1) : livingGeometry(authoredShape), material);
    mesh.scale.set(...size);
    mesh.position.set(...position);
    mesh.name = `${kind}-${name}`;
    mesh.userData.mobId = id;
    mesh.userData.livingShape = resolvedShape;
    mesh.userData.authoredShape = authoredShape;
    mesh.castShadow = true;
    mesh.receiveShadow = /body|foot|leg|shell/u.test(name);
    parent.add(mesh);
    if (part) { mesh.userData.bodyPart = part; parts[part].push(mesh); }
    return mesh;
  };
  const pivot = (size: [number, number, number], material: THREE.Material, at: [number, number, number], offset: [number, number, number], name: string, part: keyof MobVisualParts, shape?: LivingShape) => {
    const node = new THREE.Group();
    node.position.set(...at);
    node.name = `${kind}-${name}-pivot`;
    const mesh = add(node, size, material, offset, name, undefined, shape);
    mesh.userData.bodyPart = part;
    parts[part].push(node);
    visual.add(node);
    return node;
  };
  const joint = (parent: THREE.Object3D, at: [number, number, number], name: string, part?: keyof MobVisualParts) => {
    const node = new THREE.Group();
    node.position.set(...at);
    node.name = `${kind}-${name}-pivot`;
    node.userData.mobId = id;
    parent.add(node);
    if (part) {
      node.userData.bodyPart = part;
      parts[part].push(node);
    }
    return node;
  };
  const eyes = (x: number, y: number, z: number, size = .07, count = 2) => {
    if (count === 1) {
      add(visual, [size, size, size * .58], mats.eye, [0, y, z], "center-eye");
      add(visual, [size * .28, size * .28, size * .16], mats.white, [-size * .16, y + size * .18, z - size * .34], "center-eye-highlight");
    } else for (const side of [-1, 1]) {
      add(visual, [size, size, size * .58], mats.eye, [side * x, y, z], `${side < 0 ? "left" : "right"}-eye`);
      add(visual, [size * .28, size * .28, size * .16], mats.white, [side * x - size * .16, y + size * .18, z - size * .34], `${side < 0 ? "left" : "right"}-eye-highlight`);
    }
  };
  const eyesOn = (parent: THREE.Object3D, x: number, y: number, z: number, size = .07, count = 2) => {
    if (count === 1) {
      add(parent, [size, size, size * .58], mats.eye, [0, y, z], "center-eye");
      add(parent, [size * .28, size * .28, size * .16], mats.white, [-size * .16, y + size * .18, z - size * .34], "center-eye-highlight");
    } else for (const side of [-1, 1]) {
      add(parent, [size, size, size * .58], mats.eye, [side * x, y, z], `${side < 0 ? "left" : "right"}-eye`);
      add(parent, [size * .28, size * .28, size * .16], mats.white, [side * x - size * .16, y + size * .18, z - size * .34], `${side < 0 ? "left" : "right"}-eye-highlight`);
    }
  };
  return { kind, group, visual, parts, mats, lambert, glow, add, pivot, joint, eyes, eyesOn };
}

type GroundFootStyle = "paw" | "claw" | "hoof" | "webbed" | "spring";

function groundFootStyle(kind: LivingBestiaryVisualKind): GroundFootStyle {
  if (["stormcrest-ibex", "ilyr-virebloom", "sugarwake-sovereign", "glasswake-stag", "bellstep-qilin", "mireglass-kelpie", "frostcauldron-behemoth", "sable-gorgon"].includes(kind)) return "hoof";
  if (["brinewhisk-otter", "riverwright-beaver", "kilnscale-salamander", "handtail-ahuizotl", "namarra-makara", "ashen-salamander-king"].includes(kind)) return "webbed";
  if (kind === "glassstep-jerboa") return "spring";
  if ([
    "hearthback-badger", "sunfoil-pangolin", "cindercoil-gecko", "briarclaw-lynx", "gravebell-jackal",
    "cragglass-basilisk", "kharza", "asterjaw", "briarcrown-manticore", "mycelial-oneirophant",
  ].includes(kind)) return "claw";
  return "paw";
}

function quadruped(builder: Builder, config: Readonly<{
  body: [number, number, number]; bodyY: number; head: [number, number, number]; headY: number; headZ: number;
  legLength: number; legX: number; frontZ: number; rearZ: number; tail?: "long" | "brush" | "flat" | "short";
  muzzle?: "snout" | "canine" | "beak" | "none"; ears?: "round" | "point" | "long" | "sail" | "none";
}>) {
  const { visual, mats, add, pivot, joint, eyesOn, kind } = builder;
  add(visual, [config.body[0] * .9, config.body[1] * .9, config.body[2] * .74], mats.body, [0, config.bodyY, 0], "body", "body");
  add(visual, [config.body[0] * .94, config.body[1] * .86, config.body[2] * .48], mats.body,
    [0, config.bodyY + config.body[1] * .015, -config.body[2] * .2], "shoulder-mass", "body");
  add(visual, [config.body[0], config.body[1] * .92, config.body[2] * .52], mats.body,
    [0, config.bodyY + config.body[1] * .01, config.body[2] * .2], "haunch-mass", "body");
  add(visual, [config.body[0] * .72, config.body[1] * .34, config.body[2] * .68], mats.accent, [0, config.bodyY + config.body[1] * .4, -.02], "mantle");
  add(visual, [config.body[0] * .62, config.body[1] * .38, config.body[2] * .58], mats.pale,
    [0, config.bodyY - config.body[1] * .35, -config.body[2] * .08], "soft-belly", "body");
  add(visual, [config.head[0] * .64, config.head[1] * .7, Math.max(.22, Math.abs(config.headZ) * .36)], mats.body,
    [0, config.headY - config.head[1] * .08, config.headZ + config.head[2] * .45], "neck-ruff", "body");
  const head = pivot(config.head, mats.body, [0, config.headY, config.headZ], [0, 0, 0], "head", "head");
  const muzzleDepth = config.muzzle === "canine" ? config.head[2] * .72 : config.muzzle === "snout" ? config.head[2] * .48 : config.head[2] * .35;
  if (config.muzzle !== "none") {
    add(head, [config.head[0] * .68, config.head[1] * .45, muzzleDepth], config.muzzle === "beak" ? mats.pale : mats.dark, [0, -config.head[1] * .15, -config.head[2] * .48], "muzzle");
    if (config.muzzle !== "beak") add(head, [config.head[0] * .22, config.head[1] * .18, .13], mats.black,
      [0, -config.head[1] * .12, -config.head[2] * .68], "nose");
  }
  // Eyes live on the articulated head, so attentive poses never leave the
  // expression floating behind the skull.
  eyesOn(head, config.head[0] * .28, config.head[1] * .12, -config.head[2] * .51, Math.max(.045, config.head[0] * .1));
  if (config.ears !== "none") for (const side of [-1, 1] as const) {
    const long = config.ears === "long" || config.ears === "sail";
    const ear = pivot([long ? .13 : .16, long ? .4 : .24, config.ears === "sail" ? .08 : .12], mats.accent,
      [side * config.head[0] * .36, config.headY + config.head[1] * .32, config.headZ], [0, (long ? .4 : .24) * .42, 0], `${side < 0 ? "left" : "right"}-ear`, "head",
      config.ears === "point" || config.ears === "sail" ? "spike-up" : "organic");
    ear.rotation.z = side * (config.ears === "point" ? -.16 : .08);
    ear.userData.side = side;
  }
  for (const [side, z, phase, label] of [
    [-1, config.frontZ, 0, "front-left"], [1, config.frontZ, Math.PI, "front-right"],
    [-1, config.rearZ, Math.PI, "rear-left"], [1, config.rearZ, 0, "rear-right"],
  ] as const) {
    const width = Math.max(.09, config.legX * .42);
    const depth = Math.max(.09, config.legX * .4);
    const upperLength = config.legLength * .48;
    const lowerLength = config.legLength * .52;
    const rear = label.startsWith("rear");
    const footStyle = groundFootStyle(kind);
    const legMaterial = kind === "glasswake-stag" ? mats.glass : kind === "asterjaw" ? mats.glow : mats.dark;
    const leg = joint(visual, [side * config.legX, config.bodyY - config.body[1] * .36, z], `${label}-leg`, "legs");
    leg.userData.phase = phase;
    leg.userData.side = side;
    leg.userData.limbRole = "upper";
    add(leg, [width * 1.34, width * 1.34, depth * 1.34], legMaterial, [0, -.015, 0], `${label}-hip-joint`, undefined, "joint");
    add(leg, [width * 1.16, upperLength, depth * 1.12], legMaterial, [0, -upperLength * .45, 0], `${label}-upper-leg`, undefined, "limb-y");

    const knee = joint(leg, [0, -upperLength * .9, rear ? .025 : -.018], `${label}-knee`);
    knee.userData.phase = phase;
    knee.userData.side = side;
    knee.userData.livingJointRole = "knee";
    knee.rotation.x = rear ? -.11 : .07;
    add(knee, [width * 1.22, width * 1.16, depth * 1.18], kind === "sugarwake-sovereign" ? mats.pale : legMaterial,
      [0, 0, 0], `${label}-knee-joint`, undefined, "joint");
    add(knee, [width * .92, lowerLength, depth * .9], legMaterial, [0, -lowerLength * .45, 0], `${label}-lower-leg`, undefined, "limb-y");

    const ankle = joint(knee, [0, -lowerLength * .9, rear ? -.02 : .025], `${label}-ankle`);
    ankle.userData.phase = phase;
    ankle.userData.side = side;
    ankle.userData.livingJointRole = "ankle";
    ankle.rotation.x = rear ? .08 : -.05;
    add(ankle, [width * 1.08, width * .96, depth], legMaterial, [0, 0, 0], `${label}-ankle-joint`, undefined, "joint");

    const foot = joint(ankle, [0, -.035, footStyle === "spring" ? .04 : -.035], `${label}-foot`);
    foot.userData.phase = phase;
    foot.userData.side = side;
    foot.userData.livingJointRole = "foot";
    const footWidth = footStyle === "spring" ? Math.max(.23, width * 2.15) : Math.max(.15, width * 1.65);
    const footDepth = footStyle === "spring" ? .46 : footStyle === "webbed" ? .32 : .25;
    const footMaterial = kind === "glasswake-stag" ? mats.glass : footStyle === "hoof" ? mats.dark : mats.accent;
    add(foot, [footWidth, footStyle === "hoof" ? .14 : .11, footDepth], footMaterial, [0, -.025, -.055], `${label}-foot`, undefined,
      footStyle === "hoof" ? "hard" : "organic");

    if (footStyle === "hoof") for (const toeSide of [-1, 1] as const) {
      const hoof = add(foot, [footWidth * .48, .12, footDepth * .62], kind === "sugarwake-sovereign" ? mats.pale : mats.dark,
        [toeSide * footWidth * .23, -.04, -footDepth * .32], `${label}-split-hoof-${toeSide}`, undefined, "hard");
      hoof.rotation.y = toeSide * .06;
    } else {
      const toeCount = footStyle === "webbed" ? 4 : 3;
      for (let toe = 0; toe < toeCount; toe += 1) {
        const spread = toe - (toeCount - 1) / 2;
        const toeLength = footStyle === "claw" ? .16 : footStyle === "spring" ? .2 : .12;
        const toeMaterial = footStyle === "claw" ? mats.pale : footMaterial;
        const toeMesh = add(foot, [Math.max(.035, footWidth * .18), .055, toeLength], toeMaterial,
          [spread * footWidth * .25, -.045, -footDepth * .47], `${label}-toe-${toe}`, undefined,
          footStyle === "claw" ? "spike-forward" : "organic");
        toeMesh.rotation.y = spread * -.08;
      }
      if (footStyle === "webbed") add(foot, [footWidth * .82, .025, footDepth * .72], mats.membrane,
        [0, -.055, -footDepth * .34], `${label}-toe-web`, undefined, "organic");
    }
  }
  const tailKind = config.tail ?? "long";
  if (tailKind !== "short") {
    const size: [number, number, number] = tailKind === "flat" ? [.42, .14, .72] : tailKind === "brush" ? [.34, .34, .74] : [.16, .16, .72];
    const tail = pivot(size, tailKind === "brush" ? mats.accent : mats.body, [0, config.bodyY + .03, config.body[2] * .45], [0, 0, size[2] * .44], "tail-root", "body");
    const tip = pivot([size[0] * .78, size[1] * .78, size[2] * .58], mats.pale, [0, 0, size[2] * .78], [0, 0, size[2] * .26], "tail-tip", "body");
    tail.add(tip);
  } else add(visual, [.22, .22, .2], mats.accent, [0, config.bodyY + .06, config.body[2] * .55], "short-tail");
  visual.userData.bodyPlan = "quadruped";
  visual.userData.kind = kind;
}

function bird(builder: Builder, config: Readonly<{ body: [number, number, number]; wingSpan: number; legLength: number; beak: number; tail: number; longNeck?: boolean }>) {
  const { visual, mats, add, pivot, joint, eyesOn, kind } = builder;
  const bodyY = config.longNeck ? .78 : .48;
  add(visual, config.body, mats.body, [0, bodyY, 0], "body", "body");
  add(visual, [config.body[0] * .84, config.body[1] * .82, config.body[2] * .58], mats.body,
    [0, bodyY + .02, -config.body[2] * .2], "shoulder-mass", "body");
  add(visual, [config.body[0] * .7, config.body[1] * .5, config.body[2] * .5], mats.pale, [0, bodyY - .08, -config.body[2] * .32], "breast");
  const neckY = config.longNeck ? 1.18 : bodyY + .28;
  if (config.longNeck) add(visual, [.2, .68, .2], mats.pale, [0, .94, -.24], "long-neck", "head");
  const head = pivot([.38, .34, .4], mats.body, [0, neckY, -.4], [0, 0, 0], "head", "head");
  add(head, [.18, .12, config.beak], mats.accent, [0, -.06, -.22], "beak", undefined, "spike-forward");
  eyesOn(head, .115, .06, -.205, .055);
  for (const side of [-1, 1] as const) {
    const wing = pivot([config.wingSpan * .54, .08, config.body[2] * .86], mats.accent, [side * config.body[0] * .35, bodyY + .08, .02], [side * config.wingSpan * .22, 0, .06], `${side < 0 ? "left" : "right"}-wing`, "wings");
    wing.userData.side = side;
    for (let feather = 0; feather < 3; feather += 1) {
      const primary = add(wing, [config.wingSpan * .22, .045, config.body[2] * (.72 - feather * .12)], feather % 2 ? mats.dark : mats.pale,
        [side * config.wingSpan * (.34 + feather * .2), 0, .05 + feather * .12], `wing-primary-${side}-${feather}`);
      primary.rotation.y = side * (-.08 - feather * .07);
    }
    add(wing, [config.wingSpan * .46, .07, config.body[2] * .46], mats.pale,
      [side * config.wingSpan * .2, .025, -config.body[2] * .05], `wing-covert-${side}`);
    const sideName = side < 0 ? "left" : "right";
    const upperLength = config.legLength * .44;
    const lowerLength = config.legLength * .56;
    const leg = joint(visual, [side * .14, bodyY - config.body[1] * .35, -.02], `${sideName}-leg`, "legs");
    leg.userData.side = side;
    leg.userData.phase = side < 0 ? 0 : Math.PI;
    add(leg, [.12, .12, .11], mats.dark, [0, 0, 0], `${sideName}-hip-joint`, undefined, "joint");
    add(leg, [.09, upperLength, .09], mats.dark, [0, -upperLength * .45, 0], `${sideName}-thigh`, undefined, "limb-y");
    const hock = joint(leg, [0, -upperLength * .9, .018], `${sideName}-hock`);
    hock.userData.side = side;
    hock.userData.phase = side < 0 ? 0 : Math.PI;
    hock.userData.livingJointRole = "hock";
    hock.rotation.x = -.09;
    add(hock, [.115, .1, .11], mats.accent, [0, 0, 0], `${sideName}-hock-joint`, undefined, "joint");
    add(hock, [.07, lowerLength, .07], mats.dark, [0, -lowerLength * .45, 0], `${sideName}-shank`, undefined, "limb-y");
    const foot = joint(hock, [0, -lowerLength * .9, -.015], `${sideName}-foot`);
    foot.userData.side = side;
    foot.userData.phase = side < 0 ? 0 : Math.PI;
    foot.userData.livingJointRole = "foot";
    add(foot, [.14, .075, .16], mats.accent, [0, -.02, -.04], `${sideName}-foot-pad`, undefined, "joint");
    for (let toe = -1; toe <= 1; toe += 1) {
      const talon = add(foot, [.042, .04, kind === "varkesh-stormmane" ? .32 : .21], kind === "varkesh-stormmane" ? mats.metal : mats.dark,
        [toe * .07, -.045, -.13], `${sideName}-talon-${toe + 2}`, undefined, "spike-forward");
      talon.rotation.y = toe * -.14;
    }
    const rearTalon = add(foot, [.04, .04, .16], mats.dark, [0, -.035, .08], `${sideName}-rear-talon`, undefined, "spike-forward");
    rearTalon.rotation.y = Math.PI;
  }
  for (let index = -2; index <= 2; index += 1) {
    const feather = add(visual, [.12, .06, config.tail * (1 - Math.abs(index) * .08)], index === 0 ? mats.pale : mats.body, [index * .09, bodyY, config.body[2] * .48], `tail-feather-${index + 2}`);
    feather.rotation.y = index * -.1;
  }
  visual.userData.bodyPlan = "bird";
}

function aquatic(builder: Builder, config: Readonly<{ body: [number, number, number]; tail: number; fins?: number; tentacles?: number; shell?: boolean }>) {
  const { visual, mats, add, pivot, eyes, kind } = builder;
  add(visual, config.body, mats.body, [0, .48, 0], "body", "body");
  add(visual, [config.body[0] * .88, config.body[1] * .8, config.body[2] * .55], mats.body,
    [0, .48, -config.body[2] * .22], "head-mass", "head");
  add(visual, [config.body[0] * .68, config.body[1] * .24, config.body[2] * .74], mats.accent, [0, .48 + config.body[1] * .38, 0], "dorsal-pattern");
  eyes(config.body[0] * .28, .56, -config.body[2] * .5, Math.max(.045, config.body[0] * .08));
  for (const side of [-1, 1]) add(visual, [.035, config.body[1] * .24, config.body[2] * .18], mats.pale,
    [side * config.body[0] * .34, .46, -config.body[2] * .39], `gill-${side}`);
  const fins = config.fins ?? 2;
  for (const side of [-1, 1] as const) for (let fin = 0; fin < fins; fin += 1) {
    const node = pivot([config.body[0] * .58, .055, config.body[2] * .46], mats.accent,
      [side * config.body[0] * .35, .48, -.12 + fin * .32], [side * config.body[0] * .24, 0, .04], `${side < 0 ? "left" : "right"}-fin-${fin}`, "wings");
    node.userData.side = side;
  }
  const tail = pivot([config.body[0] * .5, config.body[1] * .55, config.tail], mats.body,
    [0, .48, config.body[2] * .45], [0, 0, config.tail * .44], "tail-root", "body");
  for (const side of [-1, 1] as const) {
    const lobe = add(tail, [config.body[0] * .65, config.body[1] * .8, config.tail * .55], mats.accent, [side * config.body[0] * .22, 0, config.tail * .72], `tail-${side < 0 ? "left" : "right"}`);
    lobe.rotation.z = side * -.34;
  }
  if (config.tentacles) for (let index = 0; index < config.tentacles; index += 1) {
    const angle = index / config.tentacles * Math.PI * 2;
    const arm = pivot([.08, .08, .55], index % 2 ? mats.accent : mats.body,
      [Math.cos(angle) * config.body[0] * .3, .35 + Math.sin(angle) * .1, -config.body[2] * .42], [0, 0, -.25], `tentacle-${index}`, "arms");
    arm.rotation.y = angle * .2;
  }
  if (config.shell) add(visual, [config.body[0] * .95, config.body[1] * .72, config.body[2] * .6], mats.pale, [0, .68, .12], "shell", "body");
  visual.userData.bodyPlan = "aquatic";
  visual.userData.aquaticRig = kind;
}

function arthropod(builder: Builder, config: Readonly<{ body: [number, number, number]; legs: number; claws?: boolean; shell?: boolean }>) {
  const { visual, mats, add, joint, eyes } = builder;
  add(visual, config.body, mats.body, [0, .34, 0], "body", "body");
  for (let segment = 0; segment < 3; segment += 1) add(visual,
    [config.body[0] * (1 - segment * .08), config.body[1] * .86, config.body[2] * .34],
    segment % 2 ? mats.dark : mats.body, [0, .34, -.2 + segment * config.body[2] * .28], `abdomen-segment-${segment}`, "body");
  if (config.shell) add(visual, [config.body[0] * .92, config.body[1] * .5, config.body[2] * .88], mats.accent, [0, .52, .03], "carapace", "body");
  eyes(config.body[0] * .3, .5, -config.body[2] * .5, .055);
  for (const side of [-1, 1] as const) for (let index = 0; index < config.legs; index += 1) {
    const sideName = side < 0 ? "left" : "right";
    const phase = index % 2 ? Math.PI : 0;
    const upperLength = config.body[0] * (.3 + index % 2 * .035);
    const lowerLength = config.body[0] * .27;
    const legMaterial = index % 2 ? mats.dark : mats.accent;
    const leg = joint(visual, [side * config.body[0] * .34, .34, -.26 + index * (config.body[2] * .5 / Math.max(1, config.legs - 1))],
      `${sideName}-leg-${index + 1}`, "legs");
    leg.userData.side = side;
    leg.userData.phase = phase;
    // Each mirrored femur must descend away from the carapace. Using the
    // same sign as the side lifts both legs above the body instead.
    leg.rotation.z = side * -.16;
    add(leg, [.12, .12, .12], legMaterial, [0, 0, 0], `${sideName}-leg-${index + 1}-coxa`, undefined, "joint");
    add(leg, [upperLength, .075, .11], legMaterial, [side * upperLength * .45, -.025, 0], `${sideName}-leg-${index + 1}-femur`, undefined, "limb-x");
    const knee = joint(leg, [side * upperLength * .9, -.055, 0], `${sideName}-leg-${index + 1}-knee`);
    knee.userData.side = side;
    knee.userData.phase = phase;
    knee.userData.livingJointRole = "arthropod-knee";
    knee.rotation.z = side * -.38;
    add(knee, [.105, .1, .105], mats.pale, [0, 0, 0], `${sideName}-leg-${index + 1}-knee-joint`, undefined, "joint");
    add(knee, [lowerLength, .065, .08], legMaterial, [side * lowerLength * .45, -.055, 0], `${sideName}-leg-${index + 1}-tibia`, undefined, "limb-x");
    const foot = joint(knee, [side * lowerLength * .88, -.11, 0], `${sideName}-leg-${index + 1}-foot`);
    foot.userData.side = side;
    foot.userData.phase = phase;
    foot.userData.livingJointRole = "arthropod-foot";
    add(foot, [.16, .045, .16], mats.dark, [side * .05, -.025, -.025], `${sideName}-leg-${index + 1}-foot-pad`, undefined, "organic");
    const hook = add(foot, [.045, .045, .16], mats.pale, [side * .08, -.035, -.1], `${sideName}-leg-${index + 1}-toe-hook`, undefined, "spike-forward");
    hook.rotation.y = side * -.18;
  }
  if (config.claws) for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? "left" : "right";
    const claw = joint(visual, [side * config.body[0] * .3, .4, -config.body[2] * .4], `${sideName}-claw`, "arms");
    claw.userData.side = side;
    add(claw, [.12, .11, .34], mats.accent, [side * .04, 0, -.15], `${sideName}-claw-forearm`, undefined, "limb-z");
    const wrist = joint(claw, [side * .07, 0, -.3], `${sideName}-claw-wrist`);
    wrist.userData.side = side;
    wrist.userData.livingJointRole = "claw-wrist";
    add(wrist, [.26, .16, .24], mats.accent, [side * .04, 0, -.08], `${sideName}-claw-palm`, undefined, "joint");
    for (const prong of [-1, 1] as const) {
      const tip = add(wrist, [.095, .095, .31], prong < 0 ? mats.pale : mats.accent,
        [side * .04 + prong * .085, prong * .055, -.25], `${sideName}-claw-tip-${prong}`, undefined, "spike-forward");
      tip.rotation.y = prong * .11;
      tip.rotation.x = prong * -.08;
    }
  }
  visual.userData.bodyPlan = "arthropod";
}

function decorateRegular(builder: Builder) {
  const { kind, visual, mats, lambert, glow, add, pivot, joint, eyesOn } = builder;
  switch (kind) {
    case "thornhide-trufflehog":
      quadruped(builder, { body: [1.08, .66, 1.34], bodyY: .64, head: [.72, .58, .72], headY: .64, headZ: -.86, legLength: .42, legX: .38, frontZ: -.4, rearZ: .44, tail: "short", muzzle: "snout", ears: "round" });
      for (let row = 0; row < 3; row += 1) for (let side = -2; side <= 2; side += 1) { const thorn = add(visual, [.1, .34 + row * .04, .1], row % 2 ? mats.pale : mats.accent, [side * .19, 1.05 + row * .05, -.35 + row * .34], `thorn-${row}-${side}`); thorn.rotation.z = side * .08; }
      for (const side of [-1, 1]) add(visual, [.1, .12, .46], mats.pale, [side * .25, .48, -1.32], `root-tusk-${side}`).rotation.y = side * -.18;
      break;
    case "orchard-glider":
      quadruped(builder, { body: [.58, .34, .76], bodyY: .62, head: [.42, .38, .4], headY: .68, headZ: -.5, legLength: .26, legX: .22, frontZ: -.22, rearZ: .26, tail: "long", muzzle: "snout", ears: "round" });
      for (const side of [-1, 1] as const) { const membrane = pivot([.72, .035, .9], mats.membrane, [side * .2, .66, .04], [side * .32, 0, .04], `${side < 0 ? "left" : "right"}-wing`, "wings"); membrane.userData.side = side; for (let vein = 0; vein < 3; vein += 1) add(membrane, [.035, .045, .66], mats.accent, [side * (.14 + vein * .16), .01, vein * .08], `wing-vein-${side}-${vein}`); }
      break;
    case "petalmask-tanuki":
      quadruped(builder, { body: [1.04, .72, 1.25], bodyY: .78, head: [.72, .66, .68], headY: .92, headZ: -.82, legLength: .52, legX: .36, frontZ: -.38, rearZ: .4, tail: "brush", muzzle: "canine", ears: "point" });
      add(visual, [.64, .08, .42], mats.pale, [0, 1.02, -1.2], "petal-mask");
      for (let petal = 0; petal < 6; petal += 1) { const angle = petal / 6 * Math.PI * 2; add(visual, [.18, .08, .28], petal % 2 ? mats.accent : mats.pale, [Math.cos(angle) * .28, 1.02 + Math.sin(angle) * .16, -1.23], `mask-petal-${petal}`).rotation.z = angle; }
      break;
    case "ironbeak-magpie":
      bird(builder, { body: [.52, .5, .82], wingSpan: .9, legLength: .28, beak: .34, tail: .9 });
      add(visual, [.18, .14, .38], mats.metal, [0, .71, -.82], "iron-beak");
      for (let band = 0; band < 4; band += 1) add(visual, [.08, .06, .82 - band * .1], band % 2 ? mats.pale : mats.accent, [(band - 1.5) * .09, .46, .48], `tail-metal-band-${band}`);
      break;
    case "hearthback-badger":
      quadruped(builder, { body: [1.12, .64, 1.38], bodyY: .58, head: [.78, .6, .76], headY: .62, headZ: -.86, legLength: .36, legX: .4, frontZ: -.4, rearZ: .42, tail: "short", muzzle: "snout", ears: "round" });
      add(visual, [.28, .12, 1.12], mats.accent, [0, .94, .05], "hearth-stripe");
      for (const side of [-1, 1] as const) {
        const sideName = side < 0 ? "left" : "right";
        const paw = visual.getObjectByName(`hearthback-badger-front-${sideName}-foot-pivot`)!;
        add(paw, [.32, .14, .28], mats.dark, [0, .015, -.08], `${sideName}-digging-knuckle`, undefined, "joint");
        for (let claw = 0; claw < 3; claw += 1) {
          const digClaw = add(paw, [.055, .06, .3 + (claw === 1 ? .05 : 0)], mats.pale,
            [(claw - 1) * .085, -.045, -.25], `${sideName}-dig-claw-${claw}`, undefined, "spike-forward");
          digClaw.rotation.y = (claw - 1) * -.09;
        }
      }
      break;
    case "sunfoil-pangolin":
      quadruped(builder, { body: [1.05, .68, 1.38], bodyY: .64, head: [.56, .42, .66], headY: .59, headZ: -.86, legLength: .36, legX: .36, frontZ: -.42, rearZ: .42, tail: "long", muzzle: "snout", ears: "none" });
      for (let row = 0; row < 5; row += 1) for (let side = -2; side <= 2; side += 1) { const scale = add(visual, [.24, .09, .32], row % 2 ? mats.pale : mats.accent, [side * .19, .88 - Math.abs(side) * .035, -.5 + row * .26], `foil-scale-${row}-${side}`); scale.rotation.x = -.16; }
      break;
    case "glassstep-jerboa":
      quadruped(builder, { body: [.46, .46, .62], bodyY: .52, head: [.42, .4, .4], headY: .72, headZ: -.4, legLength: .68, legX: .18, frontZ: -.16, rearZ: .24, tail: "long", muzzle: "snout", ears: "long" });
      // Jerboas carry their locomotion in two spring-loaded hind limbs; the
      // generic front pair is replaced by tiny grasping forepaws.
      visual.getObjectByName("glassstep-jerboa-front-left-leg-pivot")!.visible = false;
      visual.getObjectByName("glassstep-jerboa-front-right-leg-pivot")!.visible = false;
      for (const side of [-1, 1] as const) {
        const sideName = side < 0 ? "left" : "right";
        const forepaw = joint(visual, [side * .16, .58, -.26], `${sideName}-forepaw`, "arms");
        forepaw.rotation.x = -.42;
        add(forepaw, [.075, .16, .075], mats.dark, [0, -.07, 0], `${sideName}-forearm`, undefined, "limb-y");
        const wrist = joint(forepaw, [0, -.145, -.018], `${sideName}-forepaw-wrist`);
        wrist.userData.livingJointRole = "foot";
        wrist.userData.phase = side < 0 ? 0 : Math.PI;
        add(wrist, [.13, .07, .16], mats.pale, [0, -.02, -.065], `${sideName}-forepaw-pad`, undefined, "joint");
      }
      for (const side of [-1, 1] as const) {
        const sideName = side < 0 ? "left" : "right";
        const hindFoot = visual.getObjectByName(`glassstep-jerboa-rear-${sideName}-foot-pivot`)!;
        const glassSole = add(hindFoot, [.3, .045, .48], mats.glass, [0, -.055, -.08], `${sideName}-glass-hind-sole`, undefined, "organic");
        glassSole.rotation.y = side * -.08;
      }
      add(visual, [.22, .2, .26], mats.pale, [0, .48, 1.02], "tail-brush");
      break;
    case "stormcrest-ibex":
      quadruped(builder, { body: [1.2, .82, 1.5], bodyY: .9, head: [.72, .66, .72], headY: 1.18, headZ: -.94, legLength: .78, legX: .42, frontZ: -.44, rearZ: .48, tail: "short", muzzle: "snout", ears: "point" });
      for (const side of [-1, 1] as const) for (let segment = 0; segment < 5; segment += 1) { const horn = add(visual, [.13, .3, .15], segment % 2 ? mats.accent : mats.dark, [side * (.22 + segment * .05), 1.55 + segment * .17, -.88 + segment * .08], `spiral-horn-${side}-${segment}`); horn.rotation.z = side * (.18 + segment * .09); }
      for (let spark = 0; spark < 4; spark += 1) add(visual, [.055, .055, .055], mats.glow, [(spark - 1.5) * .13, 1.82 + (spark % 2) * .09, -.68], `static-spark-${spark}`);
      break;
    case "cindercoil-gecko":
      quadruped(builder, { body: [.62, .25, .9], bodyY: .26, head: [.5, .3, .46], headY: .31, headZ: -.58, legLength: .2, legX: .26, frontZ: -.28, rearZ: .3, tail: "long", muzzle: "none", ears: "none" });
      for (const position of ["front", "rear"] as const) for (const side of [-1, 1] as const) {
        const sideName = side < 0 ? "left" : "right";
        const foot = visual.getObjectByName(`cindercoil-gecko-${position}-${sideName}-foot-pivot`)!;
        for (let toe = 0; toe < 4; toe += 1) {
          const fan = add(foot, [.085, .03, .2], mats.pale, [(toe - 1.5) * .055, -.05, -.16], `${position}-${sideName}-toe-fan-${toe}`, undefined, "organic");
          fan.rotation.y = (toe - 1.5) * -.12;
        }
      }
      for (let ember = 0; ember < 7; ember += 1) add(visual, [.06, .04, .08], mats.glow, [((ember % 3) - 1) * .17, .4, -.28 + Math.floor(ember / 3) * .28], `ember-freckle-${ember}`);
      break;
    case "cloudkite-pika":
      quadruped(builder, { body: [.52, .48, .62], bodyY: .48, head: [.5, .44, .44], headY: .66, headZ: -.4, legLength: .26, legX: .2, frontZ: -.18, rearZ: .2, tail: "short", muzzle: "snout", ears: "sail" });
      for (const side of [-1, 1]) add(visual, [.18, .36, .035], mats.membrane, [side * .18, .98, -.36], `ear-sail-${side}`).rotation.z = side * -.12;
      break;
    case "briarclaw-lynx":
      quadruped(builder, { body: [1.06, .72, 1.35], bodyY: .78, head: [.72, .62, .72], headY: .94, headZ: -.84, legLength: .58, legX: .36, frontZ: -.4, rearZ: .42, tail: "short", muzzle: "canine", ears: "point" });
      for (let tuft = -2; tuft <= 2; tuft += 1) { const briar = add(visual, [.11, .36, .11], tuft % 2 ? mats.dark : mats.accent, [tuft * .16, 1.18, -.1 + Math.abs(tuft) * .08], `shoulder-briar-${tuft}`); briar.rotation.z = tuft * .08; }
      for (const side of [-1, 1]) add(visual, [.1, .34, .08], mats.dark, [side * .22, 1.38, -.78], `ear-tuft-${side}`).rotation.z = side * -.16;
      break;
    case "gravebell-jackal":
      quadruped(builder, { body: [1.02, .66, 1.3], bodyY: .72, head: [.64, .6, .72], headY: .9, headZ: -.84, legLength: .55, legX: .34, frontZ: -.38, rearZ: .4, tail: "brush", muzzle: "canine", ears: "long" });
      add(visual, [.24, .28, .2], mats.glass, [0, .58, -.78], "grave-bell");
      add(visual, [.08, .22, .08], mats.pale, [0, .39, -.78], "bell-clapper");
      break;
    case "cragglass-basilisk": { // A low, six-beat mineral ambush predator rather than a decorated generic lizard.
      const basalt = lambert(0x28312e);
      const scaleShadow = lambert(0x39433d);
      const fractureGold = glow(0xe0a943);
      const mouth = lambert(0x351f23);
      quadruped(builder, {
        body: [1.38, .58, 1.72], bodyY: .53,
        head: [.94, .6, .9], headY: .64, headZ: -1.07,
        legLength: .36, legX: .52, frontZ: -.56, rearZ: .56,
        tail: "long", muzzle: "none", ears: "none",
      });

      // Broaden the tail into a counterweight and end it in a cragglass breaker.
      const tailRoot = visual.getObjectByName("cragglass-basilisk-tail-root-pivot")!;
      const tailRootMesh = visual.getObjectByName("cragglass-basilisk-tail-root") as THREE.Mesh;
      const tailTip = visual.getObjectByName("cragglass-basilisk-tail-tip-pivot")!;
      const tailTipMesh = visual.getObjectByName("cragglass-basilisk-tail-tip") as THREE.Mesh;
      tailRootMesh.scale.set(.34, .26, .82);
      tailTipMesh.scale.set(.28, .21, .6);
      add(tailRoot, [.16, .24, .42], scaleShadow, [0, .15, .42], "tail-keel-root", undefined, "hard");
      add(tailTip, [.18, .28, .46], mats.glass, [0, .16, .32], "tail-keel-tip", undefined, "hard");
      add(tailTip, [.44, .32, .42], mats.dark, [0, 0, .61], "tail-breaker-frame", undefined, "hard");
      add(tailTip, [.3, .24, .34], mats.glass, [0, 0, .7], "tail-breaker-cragglass", undefined, "hard");
      for (const side of [-1, 1] as const) {
        const spur = add(tailTip, [.28, .1, .18], mats.pale, [side * .25, 0, .62], `tail-breaker-spur-${side}`, undefined, "hard");
        spur.rotation.z = side * -.28;
      }

      // A layered shoulder shield and staggered flank mirrors sell both weight
      // and the reflective defense described by the field guide.
      add(visual, [1.44, .2, .64], basalt, [0, .79, -.47], "shoulder-bastion", "body", "hard");
      add(visual, [1.22, .14, .5], mats.accent, [0, .89, -.46], "shoulder-glass-cap", undefined, "hard");
      add(visual, [1.32, .18, .56], scaleShadow, [0, .75, .48], "haunch-bastion", "body", "hard");
      for (const side of [-1, 1] as const) {
        const sideName = side < 0 ? "left" : "right";
        for (let plate = 0; plate < 3; plate += 1) {
          const mirror = add(visual, [.12, .3 - plate * .025, .48], plate === 1 ? mats.glass : mats.accent,
            [side * (.64 + plate * .015), .61 + (plate % 2) * .05, -.43 + plate * .45], `${sideName}-reflective-flank-plate-${plate + 1}`, undefined, "hard");
          mirror.rotation.z = side * (.13 + plate * .025);
          mirror.rotation.y = side * (.08 - plate * .035);
        }
      }
      for (let scute = 0; scute < 7; scute += 1) {
        const height = .25 + (3 - Math.abs(3 - scute)) * .055;
        const dorsal = add(visual, [.19, height, .25], scute % 2 ? mats.glass : basalt,
          [0, .86 + height * .36, -.56 + scute * .2], `dorsal-cragglass-scute-${scute + 1}`, undefined, "hard");
        dorsal.rotation.x = -.12 + scute * .025;
      }

      // Complete the middle pair to the same socket-to-claw standard as the
      // front and rear legs. All six now participate in the gait cache.
      for (const side of [-1, 1] as const) {
        const sideName = side < 0 ? "left" : "right";
        const phase = side < 0 ? Math.PI : 0;
        const middle = joint(visual, [side * .53, .32, 0], `middle-${sideName}-leg`, "legs");
        middle.userData.side = side;
        middle.userData.phase = phase;
        middle.userData.limbRole = "upper";
        add(middle, [.27, .21, .25], basalt, [0, -.01, 0], `middle-${sideName}-hip-socket`, undefined, "joint");
        add(middle, [.21, .18, .21], mats.dark, [0, -.1, -.01], `middle-${sideName}-upper-leg`, undefined, "limb-y");
        const knee = joint(middle, [0, -.18, -.025], `middle-${sideName}-knee`);
        knee.userData.side = side;
        knee.userData.phase = phase;
        knee.userData.livingJointRole = "knee";
        knee.rotation.x = -.09;
        add(knee, [.22, .19, .21], mats.glass, [0, 0, 0], `middle-${sideName}-knee-guard`, undefined, "joint");
        add(knee, [.16, .18, .16], mats.dark, [0, -.09, .005], `middle-${sideName}-lower-leg`, undefined, "limb-y");
        const ankle = joint(knee, [0, -.18, .02], `middle-${sideName}-ankle`);
        ankle.userData.side = side;
        ankle.userData.phase = phase;
        ankle.userData.livingJointRole = "ankle";
        add(ankle, [.17, .13, .18], basalt, [0, 0, 0], `middle-${sideName}-ankle-joint`, undefined, "joint");
        const foot = joint(ankle, [0, -.055, -.035], `middle-${sideName}-foot`);
        foot.userData.side = side;
        foot.userData.phase = phase;
        foot.userData.livingJointRole = "foot";
        add(foot, [.3, .1, .34], mats.accent, [0, -.035, -.07], `middle-${sideName}-foot-pad`, undefined, "hard");
        for (let toe = 0; toe < 3; toe += 1) {
          const spread = toe - 1;
          const claw = add(foot, [.055, .06, .2 + (toe === 1 ? .04 : 0)], mats.pale,
            [spread * .085, -.055, -.24], `middle-${sideName}-claw-${toe + 1}`, undefined, "spike-forward");
          claw.rotation.y = spread * -.1;
        }
      }

      // Armor the existing limb sockets without covering their articulation.
      for (const position of ["front", "rear"] as const) for (const sideName of ["left", "right"] as const) {
        const leg = visual.getObjectByName(`cragglass-basilisk-${position}-${sideName}-leg-pivot`)!;
        add(leg, [.28, .12, .3], mats.glass, [0, .05, 0], `${position}-${sideName}-socket-mirror`, undefined, "hard");
      }

      // The whole expression follows the real head pivot: wedge snout, buried
      // gaze, cheek armor, an opening jaw, and teeth rooted in the mouth.
      const head = visual.getObjectByName("cragglass-basilisk-head-pivot")!;
      add(head, [.78, .24, .54], basalt, [0, -.14, -.49], "wedge-snout", undefined, "hard");
      add(head, [.46, .14, .23], scaleShadow, [0, -.08, -.77], "snout-cap", undefined, "hard");
      for (const side of [-1, 1] as const) {
        const sideName = side < 0 ? "left" : "right";
        const socket = add(head, [.34, .25, .12], mats.black, [side * .26, .08, -.49], `${sideName}-gaze-socket`, undefined, "hard");
        socket.rotation.z = side * -.08;
        const brow = add(head, [.43, .15, .24], basalt, [side * .24, .22, -.43], `${sideName}-predatory-brow`, undefined, "hard");
        brow.rotation.z = side * -.16;
        const cheek = add(head, [.25, .34, .4], mats.accent, [side * .4, -.08, -.28], `${sideName}-cheek-plate`, undefined, "hard");
        cheek.rotation.z = side * .09;
        add(head, [.075, .055, .055], mats.black, [side * .15, -.08, -.89], `${sideName}-nostril`, undefined, "hard");
      }
      for (const sideName of ["left", "right"] as const) {
        const eye = head.getObjectByName(`cragglass-basilisk-${sideName}-eye`) as THREE.Mesh;
        const highlight = head.getObjectByName(`cragglass-basilisk-${sideName}-eye-highlight`) as THREE.Mesh;
        const side = sideName === "left" ? -1 : 1;
        eye.position.set(side * .27, .08, -.56);
        eye.scale.set(.12, .085, .06);
        highlight.position.set(side * .245, .105, -.598);
      }

      const jaw = joint(head, [0, -.2, -.14], "lower-jaw-attack");
      jaw.userData.livingJointRole = "basilisk-jaw";
      add(jaw, [.72, .16, .58], scaleShadow, [0, -.08, -.32], "lower-jaw", undefined, "hard");
      add(jaw, [.58, .035, .42], mouth, [0, .012, -.35], "mouth-interior", undefined, "hard");
      add(jaw, [.46, .08, .22], mats.accent, [0, -.15, -.48], "chin-armor", undefined, "hard");
      for (const side of [-1, 1] as const) for (let fang = 0; fang < 2; fang += 1) {
        const tooth = add(head, [.07, .19 - fang * .025, .075], mats.white,
          [side * (.18 + fang * .13), -.25, -.63 + fang * .03], `upper-fang-${side}-${fang + 1}`, undefined, "hard");
        tooth.rotation.x = .08;
      }
      for (const side of [-1, 1] as const) {
        const lowerTooth = add(jaw, [.06, .13, .065], mats.white, [side * .22, .01, -.52], `lower-fang-${side}`, undefined, "hard");
        lowerTooth.rotation.x = -.06;
      }

      // A framed crown focuses the slowing gaze. Its crystal fan is physically
      // attached to the skull and continues down the spine as a readable motif.
      const crown = joint(head, [0, .25, -.02], "gaze-crown", "head");
      crown.userData.livingJointRole = "basilisk-crown";
      add(crown, [.68, .12, .32], basalt, [0, .03, .02], "crown-cragglass-frame", undefined, "hard");
      for (let shard = -3; shard <= 3; shard += 1) {
        const height = .62 - Math.abs(shard) * .075;
        const crystal = add(crown, [.13, height, .15], shard === 0 ? fractureGold : mats.glass,
          [shard * .115, .24 + height * .28, .015 + Math.abs(shard) * .025], `crown-shard-${shard + 4}`, undefined, "hard");
        crystal.rotation.z = shard * -.075;
      }
      add(head, [.34, .22, .1], mats.glass, [0, .22, -.5], "gaze-lens-frame", undefined, "hard");
      add(head, [.18, .12, .065], fractureGold, [0, .22, -.565], "gaze-focus", undefined, "hard");
      for (const side of [-1, 1] as const) {
        const fracture = add(head, [.035, .24, .045], fractureGold, [side * .17, .21, -.58], `gaze-fracture-${side}`, undefined, "hard");
        fracture.rotation.z = side * .43;
      }
      break;
    }
    case "stormglass-roclet":
      bird(builder, { body: [1.05, .82, 1.42], wingSpan: 1.8, legLength: .62, beak: .58, tail: 1.05 });
      for (let vane = -3; vane <= 3; vane += 1) { const shard = add(visual, [.13, .48 - Math.abs(vane) * .035, .12], vane % 2 ? mats.glass : mats.glow, [vane * .15, 1.38, -.08 + Math.abs(vane) * .04], `storm-vane-${vane}`); shard.rotation.z = vane * -.06; }
      break;
    case "brinewhisk-otter":
      quadruped(builder, { body: [.86, .5, 1.22], bodyY: .48, head: [.58, .52, .56], headY: .62, headZ: -.76, legLength: .3, legX: .3, frontZ: -.34, rearZ: .36, tail: "flat", muzzle: "snout", ears: "round" });
      const otterTail = visual.getObjectByName("brinewhisk-otter-tail-root-pivot")!;
      (visual.getObjectByName("brinewhisk-otter-tail-root") as THREE.Mesh).scale.set(.2, .16, .88);
      (visual.getObjectByName("brinewhisk-otter-tail-tip") as THREE.Mesh).scale.set(.15, .12, .62);
      add(otterTail, [.34, .045, .74], mats.glass, [0, 0, .76], "ribbon-tail-fringe", "body");
      for (const side of [-1, 1]) for (let whisker = 0; whisker < 3; whisker += 1) { const w = add(visual, [.025, .025, .52], mats.pale, [side * (.25 + whisker * .025), .58 - whisker * .05, -1.03], `brine-whisker-${side}-${whisker}`); w.rotation.y = side * (.28 + whisker * .09); }
      add(visual, [.24, .18, .12], mats.accent, [.22, .48, -.28], "shell-pocket");
      break;
    case "riverwright-beaver":
      quadruped(builder, { body: [1.02, .62, 1.28], bodyY: .56, head: [.66, .58, .62], headY: .67, headZ: -.78, legLength: .34, legX: .36, frontZ: -.36, rearZ: .38, tail: "flat", muzzle: "snout", ears: "round" });
      for (const side of [-1, 1]) add(visual, [.15, .25, .12], mats.pale, [side * .1, .54, -1.12], `incisor-${side}`);
      for (let notch = 0; notch < 4; notch += 1) add(visual, [.34, .025, .055], mats.dark, [0, .57, .74 + notch * .12], `tail-notch-${notch}`);
      break;
    case "mirecrown-crane":
      bird(builder, { body: [.62, .68, .9], wingSpan: 1.2, legLength: .92, beak: .62, tail: .62, longNeck: true });
      for (let plume = -2; plume <= 2; plume += 1) { const crown = add(visual, [.09, .42 - Math.abs(plume) * .05, .08], plume === 0 ? mats.glow : mats.accent, [plume * .1, 1.58, -.38], `mire-crown-${plume}`); crown.rotation.z = plume * -.12; }
      break;
    case "inkveil-cuttle":
      aquatic(builder, { body: [.86, .58, .98], tail: .34, tentacles: 8 });
      visual.getObjectByName("inkveil-cuttle-tail-root-pivot")!.visible = false;
      for (const child of [...visual.children]) if (/-fin-\d+-pivot$/u.test(child.name)) child.visible = false;
      add(visual, [.78, .58, .92], mats.body, [0, .62, .12], "domed-mantle", "body");
      for (const side of [-1, 1] as const) {
        const skirt = pivot([.52, .055, 1.0], mats.membrane, [side * .38, .56, .08], [side * .18, 0, 0], `${side < 0 ? "left" : "right"}-fin-skirt`, "wings");
        skirt.userData.side = side;
      }
      for (const side of [-1, 1]) {
        add(visual, [.095, .035, .035], mats.black, [side * .24, .61, -.51], `w-pupil-outer-${side}`);
        add(visual, [.035, .08, .035], mats.black, [side * .24, .61, -.52], `w-pupil-inner-${side}`);
      }
      for (let band = 0; band < 4; band += 1) for (let side = -1; side <= 1; side += 2) add(visual, [.1, .06, .22], band % 2 ? mats.glow : mats.pale, [side * .34, .72, -.25 + band * .22], `color-wave-${side}-${band}`);
      break;
    case "prismclaw-mantis-shrimp":
      arthropod(builder, { body: [.76, .34, 1.12], legs: 4, claws: true, shell: true });
      visual.getObjectByName("prismclaw-mantis-shrimp-left-eye")!.visible = false;
      visual.getObjectByName("prismclaw-mantis-shrimp-right-eye")!.visible = false;
      for (const side of [-1, 1] as const) {
        const stalk = pivot([.08, .34, .08], mats.pale, [side * .24, .5, -.47], [0, .15, -.05], `${side < 0 ? "left" : "right"}-eye-stalk`, "head");
        stalk.userData.side = side;
        add(stalk, [.2, .16, .18], mats.eye, [0, .34, -.04], `${side < 0 ? "left" : "right"}-compound-eye`);
        add(stalk, [.055, .055, .04], mats.black, [side * .035, .36, -.13], `${side < 0 ? "left" : "right"}-eye-pupil`);
      }
      for (let panel = 0; panel < 5; panel += 1) add(visual, [.62 - panel * .05, .08, .2], panel % 2 ? mats.glass : mats.glow, [0, .56, -.34 + panel * .2], `prism-panel-${panel}`);
      break;
    case "reefmender-shrimp":
      arthropod(builder, { body: [.38, .2, .66], legs: 4, claws: true, shell: true });
      for (const object of visual.children) if (/body|abdomen-segment|carapace/u.test(object.name) && object instanceof THREE.Mesh) {
        const material = (Array.isArray(object.material) ? object.material[0] : object.material).clone();
        material.transparent = true; material.opacity = .58; material.depthWrite = false;
        object.material = material;
      }
      for (let band = 0; band < 4; band += 1) add(visual, [.4 - band * .025, .05, .1], band % 2 ? mats.white : mats.accent,
        [0, .45, -.2 + band * .17], `cleaner-band-${band}`, "body", "organic");
      for (const side of [-1, 1]) for (let feeler = 0; feeler < 2; feeler += 1) { const antenna = add(visual, [.025, .025, .78], mats.white, [side * (.1 + feeler * .06), .46, -.42], `cleaner-feeler-${side}-${feeler}`); antenna.rotation.y = side * (.16 + feeler * .1); }
      break;
    case "currentweaver-eel":
      visual.userData.bodyPlan = "aquatic";
      visual.userData.aquaticRig = kind;
      for (let segment = 0; segment < 9; segment += 1) {
        const taper = 1 - segment * .065;
        const z = -.62 + segment * .22;
        const x = Math.sin(segment * .62) * .055;
        const section = add(visual, [.48 * taper, .4 * taper, .42], segment % 2 ? mats.dark : mats.body,
          [x, .48, z], `eel-section-${segment}`, "body");
        section.rotation.y = Math.cos(segment * .62) * .08;
        add(visual, [.16 * taper, .045, .36], segment % 2 ? mats.glow : mats.accent,
          [x, .69 - segment * .004, z], `charge-node-${segment}`);
      }
      add(visual, [.52, .42, .5], mats.body, [0, .49, -.84], "eel-head", "head");
      builder.eyes(.15, .56, -1.09, .055);
      add(visual, [.055, .17, 2.02], mats.membrane, [0, .69, .14], "continuous-dorsal-ribbon", "wings");
      add(visual, [.05, .12, 1.6], mats.membrane, [0, .3, .24], "continuous-anal-ribbon", "wings");
      break;
    case "shellcarrier-hermit":
      arthropod(builder, { body: [.62, .32, .72], legs: 3, claws: true, shell: true });
      for (const side of [-1, 1] as const) {
        const stalk = pivot([.065, .28, .065], mats.body, [side * .18, .45, -.4], [0, .13, -.04], `${side < 0 ? "left" : "right"}-eye-stalk`, "head");
        stalk.rotation.z = side * -.12;
        add(stalk, [.13, .11, .1], mats.eye, [0, .27, -.04], `${side < 0 ? "left" : "right"}-stalk-eye`);
      }
      add(visual, [.76, .44, .64], mats.accent, [-.04, .68, .18], "equippable-shell-base", "body");
      add(visual, [.58, .5, .5], mats.pale, [.06, .9, .2], "equippable-shell-crown", "body");
      add(visual, [.36, .38, .34], mats.body, [.16, 1.1, .2], "equippable-shell-whorl", "body");
      for (let ridge = 0; ridge < 5; ridge += 1) {
        const angle = ridge * .82;
        const spiral = add(visual, [.12 + ridge * .018, .09, .2], ridge % 2 ? mats.glass : mats.dark,
          [.16 + Math.cos(angle) * (.05 + ridge * .035), 1.1 + Math.sin(angle) * (.05 + ridge * .035), -.005], `shell-spiral-${ridge}`);
        spiral.rotation.z = angle;
      }
      add(visual, [.18, .12, .1], mats.dark, [-.31, .61, -.09], "shell-lip-shadow");
      break;
    case "wreckwhistle-porpoise":
      aquatic(builder, { body: [1.12, .72, 1.82], tail: .7, fins: 1 });
      for (const name of ["left-eye", "right-eye", "left-eye-highlight", "right-eye-highlight"]) {
        const inheritedEye = visual.getObjectByName(`wreckwhistle-porpoise-${name}`);
        if (inheritedEye) inheritedEye.visible = false;
      }
      const face = joint(visual, [0, .58, -.9], "face", "head");
      add(face, [.82, .58, .68], mats.body, [0, 0, 0], "melon-forehead", undefined, "organic");
      add(face, [.46, .25, .58], mats.pale, [0, -.15, -.43], "short-rostrum", undefined, "limb-z");
      add(face, [.43, .14, .5], mats.dark, [0, -.24, -.42], "lower-jaw", undefined, "limb-z");
      add(face, [.34, .025, .06], mats.black, [0, -.18, -.72], "smile-line", undefined, "hard");
      for (const side of [-1, 1] as const) {
        add(face, [.18, .1, .12], mats.pale, [side * .31, -.09, -.31], `${side < 0 ? "left" : "right"}-cheek`, undefined, "organic");
      }
      eyesOn(face, .32, .045, -.35, .082);
      add(face, [.12, .035, .12], mats.black, [0, .3, .24], "blowhole");
      add(visual, [.2, .52, .42], mats.accent, [0, .95, .12], "dorsal-fin", "wings");
      for (let scar = 0; scar < 4; scar += 1) add(visual, [.04, .04, .48], mats.pale, [(-.18 + scar * .12), .76, -.18 + scar * .18], `wake-scar-${scar}`).rotation.y = -.38;
      break;
    case "kilnscale-salamander":
      quadruped(builder, { body: [.86, .32, 1.18], bodyY: .32, head: [.58, .36, .58], headY: .38, headZ: -.72, legLength: .24, legX: .34, frontZ: -.34, rearZ: .36, tail: "long", muzzle: "none", ears: "none" });
      for (let plate = 0; plate < 6; plate += 1) { const vent = add(visual, [.42, .09, .18], plate % 2 ? mats.dark : mats.accent, [0, .56, -.48 + plate * .2], `kiln-plate-${plate}`); vent.rotation.x = -.1; add(visual, [.18, .035, .08], mats.glow, [0, .62, -.48 + plate * .2], `vent-glow-${plate}`); }
      break;
    case "sporeback-gardener":
      quadruped(builder, { body: [1.0, .62, 1.18], bodyY: .58, head: [.54, .48, .56], headY: .6, headZ: -.74, legLength: .42, legX: .36, frontZ: -.34, rearZ: .36, tail: "short", muzzle: "snout", ears: "none" });
      for (let cap = 0; cap < 7; cap += 1) { const x = ((cap * 37) % 5 - 2) * .16; const z = -.42 + (cap % 4) * .28; add(visual, [.28 + cap % 2 * .1, .12, .28 + cap % 2 * .1], cap % 3 ? mats.accent : mats.glow, [x, 1.02 + (cap % 2) * .15, z], `garden-cap-${cap}`); add(visual, [.08, .28, .08], mats.pale, [x, .85, z], `garden-stem-${cap}`); }
      break;
    case "voidmantle-ray":
      aquatic(builder, { body: [1.65, .28, 1.26], tail: 1.18, fins: 1 });
      for (const side of [-1, 1]) {
        const mantle = add(visual, [1.28, .08, 1.55], mats.membrane, [side * .92, .48, .05], `mantle-${side}`, "wings");
        mantle.rotation.z = side * -.12;
        mantle.userData.side = side;
        mantle.userData.phase = 0;
      }
      for (let mote = 0; mote < 8; mote += 1) add(visual, [.055, .04, .08], mats.glow, [((mote % 4) - 1.5) * .42, .54, -.38 + Math.floor(mote / 4) * .56], `lumen-mote-${mote}`);
      break;
    case "fossilback-trilobite":
      arthropod(builder, { body: [.72, .22, .9], legs: 6, shell: true });
      for (let segment = 0; segment < 7; segment += 1) add(visual, [.62 - Math.abs(segment - 3) * .04, .1, .15], segment % 2 ? mats.accent : mats.pale, [0, .48, -.36 + segment * .12], `fossil-segment-${segment}`, undefined, "organic");
      for (const side of [-1, 1]) add(visual, [.16, .08, .72], mats.dark, [side * .3, .5, .03], `lobe-${side}`);
      break;
  }
}

function decorateMythic(builder: Builder) {
  const { kind, visual, mats, add, pivot } = builder;
  if (kind === "ilyr-virebloom") {
    quadruped(builder, { body: [2.45, 1.28, 3.05], bodyY: 1.35, head: [1.22, 1.06, 1.28], headY: 1.72, headZ: -1.92, legLength: 1.16, legX: .86, frontZ: -.92, rearZ: .92, tail: "short", muzzle: "snout", ears: "sail" });
    for (const side of [-1, 1] as const) {
      const antler = pivot([.18, 1.6, .18], mats.pale, [side * .42, 2.12, -1.82], [side * .25, .72, .1], `${side < 0 ? "left" : "right"}-antler`, "head"); antler.rotation.z = side * -.24;
      for (let branch = 0; branch < 4; branch += 1) { const b = add(antler, [.12, .72, .12], branch % 2 ? mats.glass : mats.pale, [side * (.22 + branch * .12), .3 + branch * .25, .05], `antler-branch-${side}-${branch}`); b.rotation.z = side * (-.4 - branch * .08); add(antler, [.28, .1, .28], branch % 2 ? mats.glow : mats.accent, [side * (.3 + branch * .12), .65 + branch * .25, .04], `antler-flower-${side}-${branch}`); }
    }
    const head = visual.getObjectByName("ilyr-virebloom-head-pivot")!;
    const trunk = pivot([.42, .44, .92], mats.body, [0, -.16, -.58], [0, -.08, -.38], "spring-trunk", "head");
    head.add(trunk);
    add(trunk, [.3, .3, .64], mats.pale, [0, -.08, -.72], "spring-trunk-tip", "head");
    for (let reed = 0; reed < 7; reed += 1) {
      const x = ((reed * 5) % 7 - 3) * .26;
      const z = -.7 + (reed % 4) * .44;
      const stem = add(visual, [.07, .52 + (reed % 3) * .16, .07], mats.accent, [x, 2.15, z], `watershed-reed-${reed}`);
      stem.rotation.z = (reed - 3) * .025;
    }
    for (const side of [-1, 1]) {
      add(visual, [.24, .12, .32], mats.dark, [side * .55, 2.28, .38], `resting-watershed-bird-${side}`);
      add(visual, [.08, .07, .16], mats.pale, [side * .55, 2.29, .13], `resting-bird-beak-${side}`, undefined, "spike-forward");
    }
    for (let stream = -2; stream <= 2; stream += 1) add(visual, [.14, .08, 2.35], stream % 2 ? mats.membrane : mats.glow, [stream * .32, 2.08, .08], `back-spring-${stream}`);
    for (const position of ["front", "rear"] as const) for (const side of [-1, 1] as const) {
      const sideName = side < 0 ? "left" : "right";
      const ankle = visual.getObjectByName(`ilyr-virebloom-${position}-${sideName}-ankle-pivot`)!;
      const foot = visual.getObjectByName(`ilyr-virebloom-${position}-${sideName}-foot-pivot`)!;
      add(ankle, [.17, .58, .17], mats.membrane, [0, -.24, .02], `${position}-${sideName}-falling-spring`, undefined, "limb-y");
      add(foot, [.5, .035, .48], mats.glass, [0, -.08, -.02], `${position}-${sideName}-spring-pool`, undefined, "organic");
      for (let ripple = 0; ripple < 2; ripple += 1) {
        const ring = add(foot, [.42 + ripple * .16, .3 + ripple * .1, .055], ripple ? mats.membrane : mats.glow,
          [0, -.045 + ripple * .012, -.02], `${position}-${sideName}-spring-ripple-${ripple}`, undefined, "ring");
        ring.rotation.x = Math.PI / 2;
      }
    }
  } else if (kind === "thalassene") {
    aquatic(builder, { body: [3.6, 1.28, 4.3], tail: 2.2, fins: 2 });
    for (let arch = -3; arch <= 3; arch += 1) { add(visual, [.62, 1.05 + (3 - Math.abs(arch)) * .2, .2], arch % 2 ? mats.accent : mats.pale, [arch * .46, 1.48, -.55 + Math.abs(arch) * .18], `reef-arch-${arch}`, undefined, "ring"); add(visual, [.58, .22, .58], arch % 3 ? mats.glow : mats.accent, [arch * .46, 2.04 + (3 - Math.abs(arch)) * .2, -.55 + Math.abs(arch) * .18], `reef-crown-${arch}`); }
    for (let coral = 0; coral < 14; coral += 1) add(visual, [.14, .46 + coral % 3 * .14, .14], coral % 2 ? mats.glow : mats.pale, [((coral * 17) % 7 - 3) * .44, 1.65, -.9 + (coral % 5) * .42], `living-coral-${coral}`);
    for (let fish = 0; fish < 5; fish += 1) {
      const angle = fish / 5 * Math.PI * 2;
      const swimmer = add(visual, [.24, .1, .34], fish % 2 ? mats.pale : mats.accent,
        [Math.cos(angle) * 1.6, 1.72 + (fish % 2) * .3, Math.sin(angle) * 1.12], `reef-fish-orbit-${fish}`);
      swimmer.rotation.y = -angle;
    }
  } else if (kind === "orichalc") {
    // The oath stone is an actual negative-space creature: three counter-rotating
    // ore hoops frame an unresolved absence instead of faking a void with a dark cube.
    const equator = add(visual, [2.45, 2.05, .42], mats.dark, [0, 1.45, 0], "empty-center-orbit", "body", "ring");
    equator.rotation.x = Math.PI / 2;
    const meridian = add(visual, [2.12, 2.55, .36], mats.metal, [0, 1.45, 0], "oath-meridian-ring", "body", "ring");
    meridian.rotation.y = Math.PI / 2;
    const canted = add(visual, [2.28, 2.28, .3], mats.accent, [0, 1.45, 0], "veinmetal-canted-ring", "body", "ring");
    canted.rotation.set(.62, .34, .18);
    for (let ring = 0; ring < 5; ring += 1) for (let segment = 0; segment < 8; segment += 1) { const angle = segment / 8 * Math.PI * 2 + ring * .16; const piece = add(visual, [.42, .34, .68], segment % 2 ? mats.metal : mats.accent, [Math.cos(angle) * (1.2 + ring * .08), .55 + ring * .48, Math.sin(angle) * (1.0 + ring * .06)], `ore-segment-${ring}-${segment}`, ring < 2 ? "legs" : "body"); piece.rotation.y = -angle; }
    for (let spark = 0; spark < 7; spark += 1) add(visual, [.12, .12, .12], mats.glow, [Math.sin(spark) * .72, 1.2 + spark * .18, Math.cos(spark) * .56], `unresolved-heart-${spark}`);
  } else if (kind === "varkesh-stormmane") {
    bird(builder, { body: [2.05, 1.42, 2.65], wingSpan: 3.4, legLength: 1.02, beak: .84, tail: 1.8 });
    for (let plume = -5; plume <= 5; plume += 1) { const p = add(visual, [.18, .76 - Math.abs(plume) * .035, .16], plume % 2 ? mats.glass : mats.glow, [plume * .18, 1.88 + (5 - Math.abs(plume)) * .08, -.45 + Math.abs(plume) * .06], `stormmane-${plume}`); p.rotation.z = plume * -.05; }
    for (let marker = 0; marker < 5; marker += 1) add(visual, [.18, .62, .12], marker % 2 ? mats.pale : mats.accent, [(marker - 2) * .32, 1.15, .72], `road-marker-${marker}`).rotation.z = (marker - 2) * .11;
    for (const side of [-1, 1] as const) {
      const sideName = side < 0 ? "left" : "right";
      const foot = visual.getObjectByName(`varkesh-stormmane-${sideName}-foot-pivot`)!;
      add(foot, [.34, .13, .3], mats.metal, [0, 0, -.05], `${sideName}-storm-talon-brace`, undefined, "joint");
      add(foot, [.08, .08, .3], mats.glow, [0, -.02, -.2], `${sideName}-lightning-talon`, undefined, "spike-forward");
    }
  } else if (kind === "kharza") {
    quadruped(builder, { body: [1.8, 1.08, 2.35], bodyY: 1.12, head: [1.05, .92, 1.12], headY: 1.45, headZ: -1.45, legLength: .92, legX: .62, frontZ: -.68, rearZ: .72, tail: "brush", muzzle: "canine", ears: "point" });
    add(visual, [1.62, .16, 1.32], mats.metal, [0, 1.58, -.06], "coercion-harness", "body");
    for (const side of [-1, 1]) for (let anchor = 0; anchor < 3; anchor += 1) add(visual, [.18, .22, .28], anchor === 1 ? mats.glow : mats.accent, [side * .72, 1.55, -.46 + anchor * .5], `harness-anchor-${side}-${anchor}`);
    for (let banner = -2; banner <= 2; banner += 1) { const strip = add(visual, [.24, .62 + Math.abs(banner) * .12, .08], mats.accent, [banner * .32, 2.1 - Math.abs(banner) * .08, .36], `broken-banner-${banner}`); strip.rotation.z = banner * .08; }
    for (let scar = 0; scar < 4; scar += 1) {
      const line = add(visual, [.04, .04, .5 - scar * .05], mats.pale, [-.34 + scar * .2, 1.58 - scar * .06, -1.82], `old-scar-${scar}`, undefined, "hard");
      line.rotation.z = -.25 + scar * .12;
    }
    add(visual, [.18, 1.18, .18], mats.metal, [0, 2.1, .48], "banner-spine", "body", "limb-y");
    add(visual, [1.15, .1, .1], mats.metal, [0, 2.55, .48], "banner-crossbar", "body", "limb-x");
    const kharzaHead = visual.getObjectByName("kharza-head-pivot")!;
    add(kharzaHead, [.92, .2, .4], mats.dark, [0, .24, -.38], "war-brow", undefined, "hard");
    add(kharzaHead, [.78, .18, .42], mats.pale, [0, -.34, -.52], "lower-jaw", undefined, "organic");
    for (const side of [-1, 1]) for (let fang = 0; fang < 2; fang += 1) {
      const tooth = add(kharzaHead, [.09, .2 - fang * .03, .09], mats.white,
        [side * (.2 + fang * .12), -.3, -.76], `war-fang-${side}-${fang}`, undefined, "spike-up");
      tooth.rotation.x = Math.PI;
    }
  } else if (kind === "sugarwake-sovereign") {
    quadruped(builder, { body: [2.05, 1.25, 2.45], bodyY: 1.28, head: [1.12, 1.0, 1.14], headY: 1.66, headZ: -1.45, legLength: 1.0, legX: .72, frontZ: -.72, rearZ: .76, tail: "long", muzzle: "snout", ears: "sail" });
    add(visual, [.88, .88, .66], mats.glass, [0, 1.45, -.08], "kiln-heart", "body");
    add(visual, [.5, .5, .34], mats.glow, [0, 1.45, -.44], "kiln-heart-core");
    for (const side of [-1, 1]) for (let curl = 0; curl < 5; curl += 1) { const antler = add(visual, [.14, .62, .14], curl % 2 ? mats.pale : mats.glass, [side * (.35 + curl * .14), 2.05 + curl * .18, -1.35 + curl * .08], `sugar-antler-${side}-${curl}`); antler.rotation.z = side * (-.2 - curl * .07); }
    for (let plate = -3; plate <= 3; plate += 1) add(visual, [.28, .1, .72], plate % 2 ? mats.glass : mats.accent, [plate * .25, 1.98 - Math.abs(plate) * .06, -.06], `caramel-plate-${plate}`);
    const crown = add(visual, [.8, .8, .18], mats.metal, [0, 2.46, -1.35], "sovereign-crown-ring", "head", "ring");
    crown.rotation.x = Math.PI / 2;
    for (let point = -2; point <= 2; point += 1) add(visual, [.13, .42 - Math.abs(point) * .04, .13], point === 0 ? mats.glow : mats.glass,
      [point * .16, 2.68 - Math.abs(point) * .035, -1.35], `crown-point-${point}`);
    for (let curl = -2; curl <= 2; curl += 1) add(visual, [.22, .42 + Math.abs(curl) * .1, .6], curl % 2 ? mats.accent : mats.pale,
      [curl * .29, 1.72, .86], `taffy-mane-curl-${curl}`, "body");
    const frosting = builder.lambert(0xfff2d7);
    const berry = builder.glow(0xcf315d);
    add(visual, [1.82, .18, 1.7], frosting, [0, 1.94, .06], "royal-icing-blanket", "body", "organic");
    for (let drip = -4; drip <= 4; drip += 1) add(visual, [.12, .28 + Math.abs(drip % 3) * .05, .14], frosting,
      [drip * .2, 1.78 - Math.abs(drip) * .015, -.6 + Math.abs(drip % 2) * 1.12], `icing-drip-${drip}`, "body", "limb-y");
    for (let wafer = 0; wafer < 8; wafer += 1) {
      const angle = wafer / 8 * Math.PI * 2;
      const biscuit = add(visual, [.34, .08, .26], wafer % 2 ? mats.pale : mats.accent,
        [Math.cos(angle) * .82, 1.82 + Math.sin(angle) * .08, -.02 + Math.sin(angle) * .76], `wafer-scale-${wafer}`, "body", "hard");
      biscuit.rotation.y = -angle;
    }
    const sugarHead = visual.getObjectByName("sugarwake-sovereign-head-pivot")!;
    add(sugarHead, [.88, .16, .62], frosting, [0, .24, -.12], "fondant-brow", undefined, "organic");
    add(sugarHead, [.64, .12, .18], berry, [0, -.28, -.62], "berry-jam-smile", undefined, "organic");
    for (const side of [-1, 1] as const) add(sugarHead, [.18, .18, .18], berry,
      [side * .38, .25, -.18], `${side < 0 ? "left" : "right"}-candied-cherry`, undefined, "gem");
    for (const position of ["front", "rear"] as const) for (const side of [-1, 1] as const) {
      const sideName = side < 0 ? "left" : "right";
      const knee = visual.getObjectByName(`sugarwake-sovereign-${position}-${sideName}-knee-pivot`)!;
      const foot = visual.getObjectByName(`sugarwake-sovereign-${position}-${sideName}-foot-pivot`)!;
      add(knee, [.34, .34, .34], berry, [0, 0, 0], `${position}-${sideName}-gumdrop-knee`, undefined, "gem");
      add(foot, [.62, .09, .42], frosting, [0, -.07, -.04], `${position}-${sideName}-iced-hoof`, undefined, "organic");
    }
  }
}

function addFrontierWingPair(builder: Builder, y: number, z: number, span: number, depth: number, prefix: string) {
  const { visual, mats, add, joint } = builder;
  for (const side of [-1, 1] as const) {
    const sideName = side < 0 ? "left" : "right";
    const wing = joint(visual, [side * .56, y, z], `${prefix}-${sideName}-wing`, "wings");
    wing.userData.side = side;
    add(wing, [span * .3, .16, depth * .52], mats.accent, [side * span * .14, 0, 0], `${prefix}-${sideName}-wing-shoulder`);
    for (let feather = 0; feather < 6; feather += 1) {
      const length = span * (.46 - feather * .035);
      const primary = add(wing, [length, .08, depth * (.82 - feather * .065)], feather % 2 ? mats.pale : mats.glass,
        [side * (span * .3 + feather * .065), -.03 - feather * .025, .05 + feather * .11], `${prefix}-${sideName}-primary-${feather}`);
      primary.rotation.y = side * (.04 + feather * .035);
      primary.rotation.z = side * (-.06 - feather * .025);
    }
  }
}

function decorateFrontierMythic(builder: Builder) {
  const { kind, visual, mats, add, joint } = builder;
  if (kind === "bellstep-qilin") {
    quadruped(builder, { body: [1.55, .92, 2.05], bodyY: 1.02, head: [.86, .76, .84], headY: 1.32, headZ: -1.24, legLength: .86, legX: .52, frontZ: -.62, rearZ: .64, tail: "long", muzzle: "snout", ears: "point" });
    for (let row = 0; row < 4; row += 1) for (let column = -3; column <= 3; column += 1) {
      const plate = add(visual, [.2, .1, .34], (row + column) % 2 ? mats.glass : mats.accent,
        [column * .18, 1.48 - Math.abs(column) * .025, -.72 + row * .44], `road-scale-${row}-${column}`);
      plate.rotation.x = -.12;
    }
    const head = visual.getObjectByName("bellstep-qilin-head-pivot")!;
    for (const side of [-1, 1] as const) for (let branch = 0; branch < 5; branch += 1) {
      const antler = add(head, [.11, .42 - branch * .025, .11], branch % 2 ? mats.pale : mats.glow,
        [side * (.2 + branch * .09), .38 + branch * .17, -.05 + branch * .08], `bell-antler-${side}-${branch}`);
      antler.rotation.z = side * (-.14 - branch * .08);
    }
    for (let bell = -3; bell <= 3; bell += 1) {
      add(visual, [.16, .2, .16], bell === 0 ? mats.glow : mats.metal, [bell * .2, 1.62 - Math.abs(bell) * .045, -.05], `quiet-bell-${bell}`);
      add(visual, [.055, .09, .055], mats.pale, [bell * .2, 1.49 - Math.abs(bell) * .045, -.05], `bell-clapper-${bell}`);
    }
    for (let tuft = 0; tuft < 8; tuft += 1) add(visual, [.16, .38, .28], tuft % 2 ? mats.pale : mats.accent,
      [((tuft % 2) * 2 - 1) * .16, 1.45 - tuft * .035, -.78 + tuft * .2], `processional-mane-${tuft}`);
  } else if (kind === "aerolith-baleen") {
    aquatic(builder, { body: [3.3, 1.45, 4.4], tail: 2.2, fins: 3 });
    for (let row = 0; row < 6; row += 1) for (let column = -3; column <= 3; column += 1) {
      const plate = add(visual, [.38, .12, .48], (row + column) % 2 ? mats.pale : mats.glass,
        [column * .39, 1.1 - Math.abs(column) * .035, -1.42 + row * .58], `aerolith-back-plate-${row}-${column}`);
      plate.rotation.x = -.08 + row * .015;
    }
    for (let rib = -8; rib <= 8; rib += 1) add(visual, [.11, .68 - Math.abs(rib) * .018, .12], rib % 3 ? mats.pale : mats.glow,
      [rib * .13, .32, -2.18], `baleen-filter-${rib}`);
    for (let stone = 0; stone < 12; stone += 1) {
      const angle = stone / 12 * Math.PI * 2;
      const rock = add(visual, [.22 + stone % 3 * .05, .18 + stone % 2 * .06, .28], stone % 2 ? mats.glow : mats.pale,
        [Math.cos(angle) * 1.75, 1.05 + (stone % 3) * .16, Math.sin(angle) * 1.7], `floating-aerolith-${stone}`);
      rock.rotation.y = angle;
    }
    for (const side of [-1, 1]) for (let ray = 0; ray < 4; ray += 1) add(visual, [.08, .05, 1.35 - ray * .16], mats.glow,
      [side * (1.38 + ray * .16), .46, -.4 + ray * .38], `wind-fin-ray-${side}-${ray}`).rotation.y = side * -.18;
  } else if (kind === "mireglass-kelpie") {
    quadruped(builder, { body: [1.45, .88, 2.15], bodyY: 1.0, head: [.82, .74, .9], headY: 1.3, headZ: -1.3, legLength: .85, legX: .5, frontZ: -.64, rearZ: .67, tail: "long", muzzle: "snout", ears: "point" });
    for (let reed = 0; reed < 12; reed += 1) {
      const stem = add(visual, [.08, .42 + (reed % 4) * .08, .09], reed % 3 ? mats.accent : mats.glow,
        [((reed % 3) - 1) * .14, 1.5 + (reed % 2) * .06, -.94 + Math.floor(reed / 3) * .42], `fen-reed-mane-${reed}`);
      stem.rotation.z = ((reed % 3) - 1) * .06;
    }
    for (let row = 0; row < 4; row += 1) for (let side = -3; side <= 3; side += 1) add(visual, [.22, .08, .3], mats.glass,
      [side * .18, 1.34 - Math.abs(side) * .025, -.58 + row * .42], `mirror-hide-${row}-${side}`);
    for (const position of ["front", "rear"] as const) for (const side of ["left", "right"] as const) {
      const foot = visual.getObjectByName(`mireglass-kelpie-${position}-${side}-foot-pivot`)!;
      const ring = add(foot, [.48, .34, .045], mats.glow, [0, -.06, -.02], `${position}-${side}-false-wake`, undefined, "ring");
      ring.rotation.x = Math.PI / 2;
    }
  } else if (kind === "cinderwing-pyrausta") {
    bird(builder, { body: [1.3, .96, 1.65], wingSpan: 2.8, legLength: .56, beak: .3, tail: .9 });
    for (const side of [-1, 1] as const) for (let row = 0; row < 4; row += 1) for (let panel = 0; panel < 4; panel += 1) {
      const tile = add(visual, [.5 - row * .045, .045, .58 - panel * .055], (row + panel) % 2 ? mats.glass : mats.glow,
        [side * (.72 + row * .42), .76 - row * .055, -.4 + panel * .37], `emberglass-wing-panel-${side}-${row}-${panel}`);
      tile.rotation.y = side * (.08 + row * .025);
    }
    for (let segment = 0; segment < 12; segment += 1) add(visual, [.46 - segment * .015, .28, .24], segment % 2 ? mats.dark : mats.accent,
      [0, .58, .55 + segment * .18], `kiln-abdomen-${segment}`);
    const head = visual.getObjectByName("cinderwing-pyrausta-head-pivot")!;
    for (const side of [-1, 1]) for (let segment = 0; segment < 5; segment += 1) {
      const feeler = add(head, [.055, .3, .055], segment % 2 ? mats.pale : mats.glow,
        [side * (.1 + segment * .07), .22 + segment * .22, -.05 + segment * .03], `heat-antenna-${side}-${segment}`);
      feeler.rotation.z = side * (-.1 - segment * .08);
    }
    for (let mote = 0; mote < 10; mote += 1) add(visual, [.07, .07, .07], mats.glow,
      [((mote * 5) % 7 - 3) * .3, 1.2 + (mote % 4) * .16, -.6 + (mote % 5) * .46], `cinder-dust-mote-${mote}`);
  } else if (kind === "nacre-gatewyrm") {
    aquatic(builder, { body: [2.45, 1.15, 4.2], tail: 2.6, fins: 3 });
    for (let row = 0; row < 7; row += 1) for (let column = -2; column <= 2; column += 1) add(visual, [.4, .12, .43], (row + column) % 2 ? mats.pale : mats.glass,
      [column * .42, 1.02 - Math.abs(column) * .04, -1.45 + row * .52], `nacre-scale-${row}-${column}`);
    for (let arch = -8; arch <= 8; arch += 1) {
      const rib = add(visual, [.1, .72 - Math.abs(arch) * .02, .12], arch % 2 ? mats.metal : mats.glow,
        [arch * .13, .62, -.72 + Math.abs(arch) * .04], `moon-gate-rib-${arch}`);
      rib.rotation.z = arch * -.025;
    }
    for (const side of [-1, 1]) for (let whisker = 0; whisker < 4; whisker += 1) {
      const node = add(visual, [.07, .07, .82 - whisker * .08], whisker % 2 ? mats.pale : mats.glow,
        [side * (.55 + whisker * .16), .66 + whisker * .08, -2.12], `threshold-whisker-${side}-${whisker}`);
      node.rotation.y = side * (-.22 - whisker * .08);
    }
    for (let moon = 0; moon < 8; moon += 1) add(visual, [.12, .12, .12], mats.glow,
      [((moon % 4) - 1.5) * .34, .92 + (moon % 2) * .18, -.96 + Math.floor(moon / 4) * 1.52], `moonwell-node-${moon}`);
  } else if (kind === "frostcauldron-behemoth") {
    quadruped(builder, { body: [2.35, 1.55, 3.0], bodyY: 1.48, head: [1.35, 1.15, 1.25], headY: 1.82, headZ: -1.82, legLength: 1.12, legX: .82, frontZ: -.9, rearZ: .94, tail: "short", muzzle: "snout", ears: "round" });
    for (let row = 0; row < 5; row += 1) for (let tuft = -3; tuft <= 3; tuft += 1) add(visual, [.4, .32, .46], (row + tuft) % 3 ? mats.pale : mats.glass,
      [tuft * .34, 2.03 - Math.abs(tuft) * .04, -1.02 + row * .53], `snow-mantle-${row}-${tuft}`);
    const head = visual.getObjectByName("frostcauldron-behemoth-head-pivot")!;
    for (const side of [-1, 1]) for (let segment = 0; segment < 5; segment += 1) {
      const horn = add(head, [.16, .42, .18], segment % 2 ? mats.pale : mats.glass,
        [side * (.38 + segment * .13), .35 + segment * .12, -.03 + segment * .11], `kettle-horn-${side}-${segment}`);
      horn.rotation.z = side * (-.42 - segment * .08);
    }
    for (let plate = -3; plate <= 3; plate += 1) add(visual, [.42, .16, .62], plate % 2 ? mats.metal : mats.dark,
      [plate * .38, 2.42 - Math.abs(plate) * .06, .16], `cauldron-back-plate-${plate}`);
    for (let vent = -2; vent <= 2; vent += 1) add(visual, [.12, .4, .12], mats.glow,
      [vent * .42, 2.62 - Math.abs(vent) * .04, .18], `warm-steam-vent-${vent}`);
  } else if (kind === "briarcrown-manticore") {
    quadruped(builder, { body: [1.75, 1.0, 2.35], bodyY: 1.12, head: [1.0, .86, .98], headY: 1.42, headZ: -1.42, legLength: .94, legX: .61, frontZ: -.7, rearZ: .74, tail: "long", muzzle: "canine", ears: "point" });
    addFrontierWingPair(builder, 1.48, .05, 2.35, 1.35, "briar");
    for (let arc = 0; arc < 4; arc += 1) for (let thorn = -3; thorn <= 3; thorn += 1) {
      const spike = add(visual, [.11, .38 + arc * .06, .11], (arc + thorn) % 2 ? mats.accent : mats.pale,
        [thorn * .2, 1.62 + (3 - Math.abs(thorn)) * .07, -.96 + arc * .34], `briar-mane-${arc}-${thorn}`);
      spike.rotation.z = thorn * -.06;
    }
    const head = visual.getObjectByName("briarcrown-manticore-head-pivot")!;
    for (let point = -3; point <= 3; point += 1) add(head, [.13, .42 - Math.abs(point) * .045, .13], point === 0 ? mats.glow : mats.pale,
      [point * .15, .48 - Math.abs(point) * .025, -.08], `root-crown-point-${point}`);
    const tail = visual.getObjectByName("briarcrown-manticore-tail-tip-pivot")!;
    for (let segment = 0; segment < 6; segment += 1) add(tail, [.18, .15, .28], segment % 2 ? mats.dark : mats.accent,
      [0, .04 + segment * .035, .42 + segment * .21], `venom-tail-segment-${segment}`);
    add(tail, [.28, .28, .58], mats.glow, [0, .28, 1.7], "measured-venom-sting", undefined, "spike-forward");
  } else if (kind === "ammonarch") {
    arthropod(builder, { body: [2.15, .72, 2.3], legs: 4, shell: true });
    for (let ring = 0; ring < 5; ring += 1) for (let segment = 0; segment < 8; segment += 1) {
      const angle = segment / 8 * Math.PI * 2 + ring * .12;
      const fossil = add(visual, [.28 + ring * .025, .12, .36], (ring + segment) % 2 ? mats.pale : mats.glass,
        [Math.cos(angle) * (.25 + ring * .22), .82 + Math.sin(angle) * (.2 + ring * .16), .18], `spiral-fossil-${ring}-${segment}`);
      fossil.rotation.z = -angle;
    }
    for (let lobe = -5; lobe <= 5; lobe += 1) add(visual, [.16, .22, .5 - Math.abs(lobe) * .025], lobe % 2 ? mats.accent : mats.glow,
      [lobe * .17, .52, -1.25], `mantle-lobe-${lobe}`);
    for (let note = 0; note < 8; note += 1) add(visual, [.08, .08, .08], mats.glow,
      [((note % 4) - 1.5) * .42, 1.12 + Math.floor(note / 4) * .22, -.2], `stone-song-note-${note}`);
  } else if (kind === "handtail-ahuizotl") {
    quadruped(builder, { body: [1.45, .8, 2.05], bodyY: .82, head: [.82, .68, .82], headY: 1.0, headZ: -1.25, legLength: .7, legX: .5, frontZ: -.62, rearZ: .64, tail: "long", muzzle: "canine", ears: "round" });
    for (let root = 0; root < 5; root += 1) for (let knot = -2; knot <= 2; knot += 1) add(visual, [.16, .26 + root * .035, .24], (root + knot) % 2 ? mats.glass : mats.accent,
      [knot * .24, 1.2 - Math.abs(knot) * .035, -.72 + root * .38], `lanternroot-knot-${root}-${knot}`);
    const tail = visual.getObjectByName("handtail-ahuizotl-tail-tip-pivot")!;
    add(tail, [.52, .18, .46], mats.pale, [0, 0, .62], "tail-hand-palm");
    for (let finger = -2; finger <= 2; finger += 1) {
      const digit = add(tail, [.09, .08, .42 - Math.abs(finger) * .045], finger === 0 ? mats.glow : mats.pale,
        [finger * .12, 0, .98], `tail-hand-finger-${finger + 3}`);
      digit.rotation.y = finger * -.09;
    }
    for (let lamp = 0; lamp < 8; lamp += 1) add(visual, [.11, .11, .11], mats.glow,
      [((lamp % 4) - 1.5) * .28, 1.42 + (lamp % 2) * .15, -.5 + Math.floor(lamp / 4) * .78], `cistern-lantern-${lamp}`);
  } else if (kind === "tideclock-cetus") {
    aquatic(builder, { body: [3.5, 1.35, 4.8], tail: 2.5, fins: 2 });
    for (let row = 0; row < 6; row += 1) for (let rib = -3; rib <= 3; rib += 1) add(visual, [.26, .12, .44], (row + rib) % 3 ? mats.metal : mats.glow,
      [rib * .39, 1.02 - Math.abs(rib) * .035, -1.48 + row * .6], `tideclock-rib-${row}-${rib}`);
    for (let gear = 0; gear < 16; gear += 1) {
      const angle = gear / 8 * Math.PI * 2;
      const wheel = add(visual, [.2 + gear % 3 * .04, .2 + gear % 3 * .04, .07], gear % 2 ? mats.glow : mats.pale,
        [Math.cos(angle) * 1.35, .75 + Math.floor(gear / 8) * .34, -.55 + Math.sin(angle) * 1.2], `current-gear-ring-${gear}`, undefined, "ring");
      wheel.rotation.x = Math.PI / 2;
    }
    for (let tooth = -7; tooth <= 7; tooth += 1) add(visual, [.09, .48 - Math.abs(tooth) * .012, .1], mats.pale,
      [tooth * .14, .36, -2.42], `sounding-baleen-${tooth}`);
  } else if (kind === "anemoi-gryphon") {
    quadruped(builder, { body: [1.75, 1.0, 2.3], bodyY: 1.1, head: [.88, .78, .92], headY: 1.5, headZ: -1.38, legLength: .92, legX: .6, frontZ: -.68, rearZ: .72, tail: "long", muzzle: "beak", ears: "point" });
    addFrontierWingPair(builder, 1.48, .08, 2.75, 1.5, "anemoi");
    for (let row = 0; row < 4; row += 1) for (let feather = -3; feather <= 3; feather += 1) add(visual, [.2, .12, .42], (row + feather) % 2 ? mats.pale : mats.glass,
      [feather * .22, 1.5 - Math.abs(feather) * .025, -.62 + row * .43], `wind-mantle-${row}-${feather}`);
    const head = visual.getObjectByName("anemoi-gryphon-head-pivot")!;
    for (let plume = -4; plume <= 4; plume += 1) {
      const crown = add(head, [.11, .46 - Math.abs(plume) * .035, .11], plume === 0 ? mats.glow : mats.pale,
        [plume * .13, .42 - Math.abs(plume) * .025, .03], `nine-wind-plume-${plume}`);
      crown.rotation.z = plume * -.055;
    }
    for (let draft = 0; draft < 9; draft += 1) add(visual, [.09, .09, .09], mats.glow,
      [((draft % 3) - 1) * .34, 1.82 + Math.floor(draft / 3) * .18, -.28 + (draft % 3) * .3], `ninefold-draft-${draft}`);
  } else if (kind === "sable-gorgon") {
    quadruped(builder, { body: [2.05, 1.3, 2.55], bodyY: 1.25, head: [1.3, 1.0, 1.16], headY: 1.58, headZ: -1.55, legLength: 1.0, legX: .72, frontZ: -.76, rearZ: .8, tail: "short", muzzle: "snout", ears: "none" });
    const head = visual.getObjectByName("sable-gorgon-head-pivot")!;
    for (const side of [-1, 1]) for (let segment = 0; segment < 6; segment += 1) {
      const horn = add(head, [.17, .42, .17], segment % 2 ? mats.glass : mats.pale,
        [side * (.38 + segment * .14), .38 + segment * .12, -.02 + segment * .1], `quarry-horn-${side}-${segment}`);
      horn.rotation.z = side * (-.36 - segment * .07);
    }
    for (let snake = 0; snake < 8; snake += 1) for (let segment = 0; segment < 4; segment += 1) {
      const angle = snake / 8 * Math.PI * 2;
      const coil = add(head, [.12, .16, .24], segment === 3 ? mats.glow : segment % 2 ? mats.accent : mats.dark,
        [Math.cos(angle) * (.44 + segment * .1), .2 + segment * .18, Math.sin(angle) * .25], `living-snake-${snake}-${segment}`);
      coil.rotation.z = -angle;
    }
    for (let row = 0; row < 3; row += 1) for (let plate = -4; plate <= 4; plate += 1) add(visual, [.24, .14, .38], (row + plate) % 2 ? mats.dark : mats.glass,
      [plate * .22, 1.72 - Math.abs(plate) * .025, -.62 + row * .62], `sable-quarry-plate-${row}-${plate}`);
  } else if (kind === "namarra-makara") {
    quadruped(builder, { body: [2.0, 1.18, 2.8], bodyY: 1.05, head: [1.15, .92, 1.2], headY: 1.38, headZ: -1.68, legLength: .82, legX: .7, frontZ: -.82, rearZ: .86, tail: "long", muzzle: "snout", ears: "sail" });
    const head = visual.getObjectByName("namarra-makara-head-pivot")!;
    let trunkParent = head;
    for (let segment = 0; segment < 7; segment += 1) {
      const trunk = joint(trunkParent, [0, segment ? -.22 : -.24, segment ? -.2 : -.58], `court-trunk-joint-${segment}`);
      add(trunk, [.3 - segment * .02, .24, .38], segment % 2 ? mats.pale : mats.body, [0, -.08, -.16], `court-trunk-${segment}`);
      trunk.rotation.x = .08 + segment * .035;
      trunkParent = trunk;
    }
    for (let row = 0; row < 4; row += 1) for (let jewel = -3; jewel <= 3; jewel += 1) add(visual, [.22, .12, .32], (row + jewel) % 3 ? mats.glass : mats.glow,
      [jewel * .24, 1.52 - Math.abs(jewel) * .025, -.72 + row * .5], `pearl-regalia-${row}-${jewel}`);
    for (const side of [-1, 1]) for (let fin = 0; fin < 6; fin += 1) {
      const veil = add(visual, [.08, .42 - fin * .025, .55], fin % 2 ? mats.membrane : mats.pale,
        [side * (1.0 + fin * .05), 1.0 + fin * .09, -.75 + fin * .48], `court-fin-${side}-${fin}`);
      veil.rotation.z = side * -.18;
    }
    for (let pearl = 0; pearl < 8; pearl += 1) add(visual, [.12, .12, .12], mats.glow,
      [((pearl % 4) - 1.5) * .34, 1.78, -.64 + Math.floor(pearl / 4) * 1.3], `audience-pearl-${pearl}`);
  } else if (kind === "ashen-salamander-king") {
    quadruped(builder, { body: [1.85, .68, 2.7], bodyY: .64, head: [1.05, .68, 1.05], headY: .72, headZ: -1.6, legLength: .48, legX: .68, frontZ: -.8, rearZ: .84, tail: "long", muzzle: "none", ears: "none" });
    for (let row = 0; row < 4; row += 1) for (let plate = -4; plate <= 4; plate += 1) add(visual, [.25, .12, .4], (row + plate) % 3 ? mats.dark : mats.glow,
      [plate * .2, .96 - Math.abs(plate) * .02, -.88 + row * .58], `emberglass-kiln-plate-${row}-${plate}`);
    const head = visual.getObjectByName("ashen-salamander-king-head-pivot")!;
    for (let point = -4; point <= 4; point += 1) add(head, [.13, .48 - Math.abs(point) * .04, .13], point === 0 ? mats.glow : mats.metal,
      [point * .14, .4 - Math.abs(point) * .02, -.05], `salamander-crown-${point}`);
    for (let tablet = 0; tablet < 10; tablet += 1) add(visual, [.24, .06, .34], tablet % 2 ? mats.pale : mats.glass,
      [((tablet % 5) - 2) * .31, 1.18 + Math.floor(tablet / 5) * .18, -.38], `heat-reveal-tablet-${tablet}`);
    for (let vent = -3; vent <= 3; vent += 1) add(visual, [.1, .32, .1], mats.glow,
      [vent * .24, 1.18 - Math.abs(vent) * .02, .68], `royal-heat-vent-${vent}`);
  } else if (kind === "mycelial-oneirophant") {
    quadruped(builder, { body: [2.5, 1.58, 3.0], bodyY: 1.45, head: [1.5, 1.28, 1.25], headY: 1.72, headZ: -1.8, legLength: 1.15, legX: .88, frontZ: -.9, rearZ: .94, tail: "short", muzzle: "none", ears: "sail" });
    const head = visual.getObjectByName("mycelial-oneirophant-head-pivot")!;
    let trunkParent = head;
    for (let segment = 0; segment < 8; segment += 1) {
      const trunk = joint(trunkParent, [0, segment ? -.24 : -.28, segment ? -.12 : -.58], `dream-trunk-joint-${segment}`);
      add(trunk, [.34 - segment * .022, .26, .32], segment % 2 ? mats.pale : mats.body, [0, -.1, -.12], `dream-trunk-${segment}`);
      trunk.rotation.x = .06 + segment * .025;
      trunkParent = trunk;
    }
    for (const side of [-1, 1]) for (let tusk = 0; tusk < 3; tusk += 1) {
      const tooth = add(head, [.13 - tusk * .015, .16, .48], tusk % 2 ? mats.glass : mats.pale,
        [side * (.34 + tusk * .08), -.28 - tusk * .08, -.62 - tusk * .28], `memory-tusk-${side}-${tusk}`, undefined, "spike-forward");
      tooth.rotation.y = side * -.13;
    }
    for (let row = 0; row < 4; row += 1) for (let fan = -3; fan <= 3; fan += 1) {
      const cap = add(visual, [.32 + row * .035, .12, .42], (row + fan) % 2 ? mats.glass : mats.glow,
        [fan * .34, 2.18 + row * .17 - Math.abs(fan) * .035, -.82 + row * .62], `active-memory-fan-${row}-${fan}`);
      cap.rotation.x = -.18;
    }
    for (let pond = 0; pond < 10; pond += 1) {
      const angle = pond / 10 * Math.PI * 2;
      const tile = add(visual, [.24, .06, .32], pond % 2 ? mats.membrane : mats.glow,
        [Math.cos(angle) * .92, 2.03, .28 + Math.sin(angle) * .72], `moonfelt-pond-rim-${pond}`);
      tile.rotation.y = -angle;
    }
  }
}

function decorateSummon(builder: Builder) {
  const { kind, visual, mats, add, joint } = builder;
  if (kind === "asterjaw") {
    quadruped(builder, { body: [1.05, .72, 1.68], bodyY: .92, head: [.7, .62, .76], headY: 1.16, headZ: -1.05, legLength: .92, legX: .35, frontZ: -.5, rearZ: .54, tail: "long", muzzle: "canine", ears: "long" });
    visual.getObjectByName("asterjaw-body")!.visible = false;
    visual.getObjectByName("asterjaw-shoulder-mass")!.visible = false;
    visual.getObjectByName("asterjaw-haunch-mass")!.visible = false;
    visual.getObjectByName("asterjaw-soft-belly")!.visible = false;
    visual.getObjectByName("asterjaw-mantle")!.visible = false;
    add(visual, [1.02, .56, 1.5], mats.membrane, [0, .98, .04], "constellation-envelope", "body", "organic");
    add(visual, [.16, .18, 1.4], mats.metal, [0, 1.22, .12], "astral-spine", "body");
    add(visual, [.92, .13, .18], mats.pale, [0, 1.08, -.48], "astral-scapula", "body", "limb-x");
    add(visual, [.82, .16, .22], mats.pale, [0, 1.06, .54], "astral-pelvis", "body", "limb-x");
    for (let rib = -2; rib <= 2; rib += 1) {
      const hoop = add(visual, [.72 - Math.abs(rib) * .06, .52, .13], rib === 0 ? mats.glow : mats.pale,
        [0, .96, -.28 + (rib + 2) * .15], `astral-rib-ring-${rib + 2}`, "body", "ring");
      hoop.rotation.x = Math.PI / 2;
    }
    for (let rib = 0; rib < 6; rib += 1) for (const side of [-1, 1]) { const star = add(visual, [.1, .1, .1], mats.glow, [side * .34, .86 + (rib % 2) * .14, -.38 + rib * .16], `compass-star-${side}-${rib}`); star.rotation.z = rib * .4; }
    for (let route = 0; route < 5; route += 1) add(visual, [.055, .055, .38], mats.glow, [((route % 3) - 1) * .18, .98 + (route % 2) * .16, -.34 + route * .16], `route-line-${route}`).rotation.y = route * .37;
    for (const position of ["front", "rear"] as const) for (const side of [-1, 1] as const) {
      const sideName = side < 0 ? "left" : "right";
      const leg = visual.getObjectByName(`asterjaw-${position}-${sideName}-leg-pivot`)!;
      add(leg, [.2, .2, .2], mats.glow, [0, 0, 0], `${position}-${sideName}-anchor-star`, undefined, "gem");
      add(leg, [.07, .07, .52], mats.membrane, [0, .06, position === "front" ? .22 : -.22], `${position}-${sideName}-astral-tendon`, undefined, "limb-z");
    }
    const asterHead = visual.getObjectByName("asterjaw-head-pivot")!;
    add(asterHead, [.62, .18, .52], mats.metal, [0, .2, -.28], "star-map-brow", undefined, "hard");
    add(asterHead, [.58, .14, .5], mats.pale, [0, -.27, -.42], "astral-lower-jaw", undefined, "organic");
    for (const side of [-1, 1]) add(asterHead, [.1, .25, .1], mats.glow,
      [side * .23, -.29, -.7], `aster-fang-${side}`, undefined, "spike-up").rotation.x = Math.PI;
  } else if (kind === "vellum-warden") {
    add(visual, [.9, 1.48, .62], mats.pale, [0, 1.02, 0], "folded-torso", "body");
    for (let plate = 0; plate < 7; plate += 1) { const p = add(visual, [1.12 - plate * .07, .08, .72], plate % 2 ? mats.body : mats.pale, [0, .48 + plate * .22, -.02 + plate % 2 * .08], `vellum-plate-${plate}`, "body"); p.rotation.z = (plate % 2 ? 1 : -1) * .06; }
    for (const side of [-1, 1] as const) {
      const sideName = side < 0 ? "left" : "right";
      const arm = joint(visual, [side * .5, 1.48, 0], `${sideName}-ink-arm`, "arms");
      arm.userData.side = side;
      add(arm, [.26, .22, .28], mats.body, [0, 0, 0], `${sideName}-paper-shoulder`, undefined, "joint");
      add(arm, [.18, .52, .22], mats.body, [0, -.23, 0], `${sideName}-upper-ink-arm`, undefined, "limb-y");
      const elbow = joint(arm, [0, -.47, .015], `${sideName}-ink-elbow`);
      elbow.userData.side = side;
      elbow.userData.phase = side < 0 ? 0 : Math.PI;
      elbow.userData.livingJointRole = "knee";
      elbow.rotation.x = side * .06;
      add(elbow, [.22, .2, .24], mats.dark, [0, 0, 0], `${sideName}-ink-elbow-joint`, undefined, "joint");
      add(elbow, [.15, .56, .2], mats.body, [0, -.25, -.015], `${sideName}-lower-ink-arm`, undefined, "limb-y");
      const hand = joint(elbow, [0, -.5, -.04], `${sideName}-page-hand`);
      hand.userData.side = side;
      hand.userData.livingJointRole = "foot";
      add(hand, [.3, .08, .38], mats.pale, [side * .04, -.02, -.09], `${sideName}-folio-hand`, undefined, "hard");
      for (let finger = -1; finger <= 1; finger += 1) add(hand, [.06, .035, .28], mats.pale,
        [finger * .08, -.05, -.24], `${sideName}-page-finger-${finger + 2}`, undefined, "hard");
    }
    add(visual, [.54, .62, .54], mats.glass, [0, 2.08, -.05], "lantern-head", "head");
    add(visual, [.34, .4, .04], mats.glow, [0, 2.08, -.34], "unwritten-page");
    for (let mark = 0; mark < 5; mark += 1) add(visual, [.34, .025, .04], mats.dark, [0, 1.32 + mark * .17, -.42], `living-redline-${mark}`);
    for (const side of [-1, 1]) {
      add(visual, [.42, .18, .62], mats.body, [side * .27, .18, .08], `folio-foot-${side}`, "legs", "hard");
      add(visual, [.34, .06, .48], mats.pale, [side * .27, .3, -.02], `folio-page-edge-${side}`, "legs", "hard");
    }
    for (let page = 0; page < 6; page += 1) {
      const side = page % 2 ? -1 : 1;
      const leaf = add(visual, [.34 + page % 3 * .05, .035, .5], page % 2 ? mats.pale : mats.body,
        [side * (.58 + (page % 3) * .13), .72 + page * .2, -.04 + (page % 2) * .18], `floating-page-${page}`, "body", "organic");
      leaf.rotation.set((page - 2.5) * .045, side * (.18 + page * .04), side * .12);
    }
  } else if (kind === "choir-of-one") {
    const choirCloth = builder.lambert(0x2b2d45, .68);
    add(visual, [.62, .22, .62], mats.metal, [0, 1.58, -.36], "silver-throat-ring", "head");
    add(visual, [.38, .14, .38], mats.glow, [0, 1.58, -.48], "permitted-note");
    for (let fold = -4; fold <= 4; fold += 1) { const f = add(visual, [.24, .94 + Math.abs(fold) * .1, .26], fold % 2 ? choirCloth : mats.dark, [fold * .18, .8, .16 + Math.abs(fold) * .04], `mantle-fold-${fold}`, "body"); f.rotation.z = fold * .045; }
    const bellShoulder = add(visual, [1.45, 1.12, .22], mats.metal, [0, 1.62, .02], "choir-bell-halo", "body", "ring");
    bellShoulder.rotation.x = Math.PI / 2;
    for (let face = 0; face < 4; face += 1) add(visual, [.22, .28, .035], mats.membrane, [(-.36 + face * .24), 1.3 + (face % 2) * .22, -.48], `implied-face-${face}`);
  } else if (kind === "glasswake-stag") {
    quadruped(builder, { body: [1.35, .82, 1.72], bodyY: .95, head: [.7, .64, .72], headY: 1.26, headZ: -1.06, legLength: .82, legX: .44, frontZ: -.5, rearZ: .54, tail: "short", muzzle: "snout", ears: "point" });
    add(visual, [1.05, .52, 1.2], mats.membrane, [0, 1.02, 0], "sideways-ocean", "body");
    for (const name of ["body", "shoulder-mass", "haunch-mass", "soft-belly", "neck-ruff", "head"] as const) {
      const mesh = visual.getObjectByName(`glasswake-stag-${name}`) as THREE.Mesh | undefined;
      if (mesh) mesh.material = mats.membrane;
    }
    for (let wave = 0; wave < 5; wave += 1) add(visual, [.8 - wave * .08, .04, .12], wave % 2 ? mats.glow : mats.pale, [0, .88 + wave * .11, -.32 + wave * .17], `inner-shoreline-${wave}`);
    for (const side of [-1, 1]) for (let branch = 0; branch < 5; branch += 1) { const antler = add(visual, [.1, .52, .1], branch % 2 ? mats.glass : mats.pale, [side * (.25 + branch * .11), 1.62 + branch * .2, -1.0 + branch * .08], `mirror-antler-${side}-${branch}`); antler.rotation.z = side * (-.18 - branch * .08); }
    for (const position of ["front", "rear"] as const) for (const side of [-1, 1] as const) {
      const sideName = side < 0 ? "left" : "right";
      const lower = visual.getObjectByName(`glasswake-stag-${position}-${sideName}-lower-leg`) as THREE.Mesh;
      lower.material = mats.membrane;
      add(lower.parent!, [.045, .42, .045], mats.glow, [0, -.18, 0], `${position}-${sideName}-leg-tide`, undefined, "limb-y");
      const foot = visual.getObjectByName(`glasswake-stag-${position}-${sideName}-foot-pivot`)!;
      const wakeRing = add(foot, [.42, .32, .045], mats.glow, [0, -.055, -.02], `${position}-${sideName}-wake-ring`, undefined, "ring");
      wakeRing.rotation.x = Math.PI / 2;
    }
    const glassHead = visual.getObjectByName("glasswake-stag-head-pivot")!;
    add(glassHead, [.54, .12, .38], mats.glass, [0, .18, -.34], "mirror-brow", undefined, "hard");
    add(glassHead, [.46, .045, .08], mats.glow, [0, -.2, -.62], "shoreline-mouth", undefined, "hard");
  }
}

const LIVING_MOUNT_TACK: Readonly<Partial<Record<LivingBestiaryVisualKind, Readonly<{
  y: number; z: number; width: number; depth: number; seats: 1 | 2; color: number;
}>>>> = Object.freeze({
  "stormcrest-ibex": { y: 1.29, z: .05, width: .84, depth: .72, seats: 1, color: 0x536a71 },
  "stormglass-roclet": { y: 1.2, z: .02, width: .86, depth: .72, seats: 1, color: 0x5d6f88 },
  "wreckwhistle-porpoise": { y: .83, z: .03, width: .82, depth: .9, seats: 1, color: 0x426f76 },
  "voidmantle-ray": { y: .68, z: .08, width: 1.0, depth: .82, seats: 1, color: 0x53506f },
  "ilyr-virebloom": { y: 2.03, z: .05, width: 1.44, depth: 1.52, seats: 2, color: 0x66764f },
  thalassene: { y: 1.4, z: .12, width: 1.65, depth: 1.7, seats: 2, color: 0x3f7772 },
  "varkesh-stormmane": { y: 1.62, z: .12, width: 1.22, depth: 1.35, seats: 2, color: 0x465c78 },
  kharza: { y: 1.74, z: .08, width: 1.22, depth: 1.24, seats: 1, color: 0x7a3c35 },
  "bellstep-qilin": { y: 1.55, z: .08, width: 1.08, depth: 1.14, seats: 1, color: 0x71634c },
  "aerolith-baleen": { y: 1.25, z: .12, width: 1.72, depth: 1.65, seats: 2, color: 0x657a83 },
  "mireglass-kelpie": { y: 1.5, z: .05, width: 1.04, depth: 1.1, seats: 1, color: 0x4d7065 },
  "cinderwing-pyrausta": { y: 1.08, z: .04, width: .72, depth: .72, seats: 1, color: 0x7c4b35 },
  "nacre-gatewyrm": { y: 1.05, z: .06, width: 1.34, depth: 1.5, seats: 2, color: 0x66818b },
  "frostcauldron-behemoth": { y: 2.22, z: .08, width: 1.65, depth: 1.7, seats: 2, color: 0x59656b },
  "briarcrown-manticore": { y: 1.68, z: .08, width: 1.18, depth: 1.2, seats: 1, color: 0x5f5144 },
  "tideclock-cetus": { y: 1.2, z: .1, width: 1.75, depth: 1.72, seats: 2, color: 0x4f6770 },
  "anemoi-gryphon": { y: 1.72, z: .08, width: 1.2, depth: 1.3, seats: 2, color: 0x596b78 },
  "namarra-makara": { y: 1.68, z: .08, width: 1.36, depth: 1.42, seats: 2, color: 0x5d6678 },
  "mycelial-oneirophant": { y: 2.32, z: .12, width: 1.72, depth: 1.8, seats: 2, color: 0x66596f },
});

function addLivingMountTack(builder: Builder) {
  const config = LIVING_MOUNT_TACK[builder.kind];
  if (!config) return;
  const tack = new THREE.Group();
  tack.name = `${builder.kind}-travel-harness`;
  tack.userData.creatureSaddle = true;
  tack.visible = false;
  builder.visual.add(tack);
  const leather = builder.lambert(config.color);
  const edge = builder.lambert(new THREE.Color(config.color).multiplyScalar(.55));
  const metal = builder.lambert(builder.kind === "varkesh-stormmane" ? 0xa9d6e7 : builder.kind === "thalassene" ? 0x8dd4c4 : 0xc7b778);
  builder.add(tack, [config.width, .11, config.depth], leather, [0, config.y, config.z], "harness-blanket");
  for (const side of [-1, 1]) {
    const rail = builder.add(tack, [.08, .34, config.depth * .76], edge, [side * config.width * .46, config.y - .08, config.z], `harness-side-${side}`);
    rail.rotation.x = side * .03;
    builder.add(tack, [.11, .12, .13], metal, [side * config.width * .46, config.y + .1, config.z - config.depth * .26], `harness-buckle-${side}`);
  }
  const seatDepth = config.seats === 2 ? config.depth * .38 : config.depth * .52;
  for (let seat = 0; seat < config.seats; seat += 1) {
    const z = config.z + (seat - (config.seats - 1) / 2) * config.depth * .37;
    builder.add(tack, [config.width * .62, .22, seatDepth], edge, [0, config.y + .14, z], `harness-seat-${seat + 1}`);
    builder.add(tack, [config.width * .68, .08, .1], metal, [0, config.y + .34, z - seatDepth * .34], `harness-grip-${seat + 1}`);
  }
  if (builder.kind === "thalassene" || builder.kind === "wreckwhistle-porpoise") for (const side of [-1, 1]) {
    builder.add(tack, [.12, .44, .12], metal, [side * config.width * .38, config.y + .25, config.z + config.depth * .35], `tide-handle-${side}`).rotation.z = side * .18;
  }
}

const HIGH_MAGIC_KINDS = new Set<LivingBestiaryVisualKind>([
  "stormcrest-ibex", "cragglass-basilisk", "stormglass-roclet", "inkveil-cuttle", "currentweaver-eel",
  "kilnscale-salamander", "voidmantle-ray", "ilyr-virebloom", "thalassene", "orichalc", "varkesh-stormmane",
  "sugarwake-sovereign", "asterjaw", "vellum-warden", "choir-of-one", "glasswake-stag",
  "bellstep-qilin", "aerolith-baleen", "mireglass-kelpie", "cinderwing-pyrausta", "nacre-gatewyrm",
  "frostcauldron-behemoth", "briarcrown-manticore", "ammonarch", "handtail-ahuizotl", "tideclock-cetus",
  "anemoi-gryphon", "sable-gorgon", "namarra-makara", "ashen-salamander-king", "mycelial-oneirophant",
]);

/** Tags only authored magical details; ordinary anatomy stays physically quiet. */
function applyLivingArtPolish(builder: Builder) {
  const { kind, visual } = builder;
  visual.userData.livingBestiaryArtPass = 3;
  let specialIndex = 0;
  visual.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.name.startsWith(`${kind}-`)) return;
    const name = object.name.slice(kind.length + 1);
    const magical = /glow|glass|spark|mote|star|note|heart|shoreline|color-wave|unresolved|prism|mirror|static|charge-node|unwritten-page|implied-face|orbit|ring/u.test(name);
    const authoredMotion = /floating-page|floating-mantle|mantle-fold|vellum-plate|grave-bell|bell-clapper|broken-banner|mask-petal|ribbon-tail-fringe|back-spring|ore-segment|route-line|inner-shoreline/u.test(name);
    if (!magical && !authoredMotion) return;
    const index = specialIndex++;
    if (/spark|mote|star|note|unresolved-heart|unwritten-page|implied-face|color-wave|floating-mantle|floating-page|mantle-fold|vellum-plate|inner-shoreline/u.test(name)) {
      object.userData.livingFloatAmplitude = .018 + (index % 4) * .009;
      object.userData.livingFloatRate = .72 + (index % 3) * .17;
      object.userData.livingFloatPhase = index * .83;
    }
    if (/orbit|ring|unresolved-heart|ore-segment|prism-panel|charge-node|compass-star|route-line|inner-shoreline/u.test(name)) {
      object.userData.livingSpinRate = (index % 2 ? -1 : 1) * (.08 + (index % 4) * .035);
    }
    if (/grave-bell|bell-clapper|broken-banner|mask-petal|ribbon-tail-fringe|back-spring/u.test(name)) {
      object.userData.livingSwingAmplitude = /grave-bell|bell-clapper/u.test(name) ? .14 : .045;
      object.userData.livingSwingRate = /broken-banner|back-spring/u.test(name) ? .72 : 1.18;
      object.userData.livingSwingPhase = index * .51;
    }
    if (HIGH_MAGIC_KINDS.has(kind) && /glass|glow|spark|mote|star|note|heart|prism|mirror|shoreline|color-wave|unresolved|ring/u.test(name)) {
      const material = Array.isArray(object.material) ? object.material[0] : object.material;
      const polished = material.clone();
      polished.transparent = true;
      polished.opacity = Math.min(.9, material.opacity || 1);
      polished.depthWrite = polished.opacity >= .9;
      object.material = polished;
      object.userData.livingShimmerAmplitude = polished.opacity < .7 ? .08 : .045;
      object.userData.livingRestOpacity = polished.opacity;
    }
  });
}

const HEAD_FOLLOW_PATTERNS: Readonly<Partial<Record<LivingBestiaryVisualKind, RegExp>>> = Object.freeze({
  "thornhide-trufflehog": /root-tusk/u,
  "petalmask-tanuki": /petal-mask|mask-petal/u,
  "ironbeak-magpie": /iron-beak/u,
  "stormcrest-ibex": /spiral-horn|static-spark/u,
  "cloudkite-pika": /ear-sail/u,
  "briarclaw-lynx": /ear-tuft/u,
  "cragglass-basilisk": /crown-shard/u,
  "brinewhisk-otter": /brine-whisker/u,
  "riverwright-beaver": /incisor/u,
  "mirecrown-crane": /mire-crown/u,
  "ilyr-virebloom": /(?:left|right)-antler-pivot/u,
  kharza: /old-scar/u,
  "sugarwake-sovereign": /sugar-antler|sovereign-crown-ring|crown-point/u,
  "glasswake-stag": /mirror-antler/u,
  "bellstep-qilin": /bell-antler|quiet-bell|bell-clapper/u,
  "frostcauldron-behemoth": /kettle-horn/u,
  "briarcrown-manticore": /root-crown-point/u,
  "cinderwing-pyrausta": /heat-antenna/u,
  "sable-gorgon": /quarry-horn|living-snake/u,
  "namarra-makara": /court-trunk/u,
  "ashen-salamander-king": /salamander-crown/u,
  "mycelial-oneirophant": /dream-trunk|memory-tusk/u,
});

/** Reparents authored facial details without changing their world-space pose. */
function attachAuthoredHeadDetails(builder: Builder) {
  const pattern = HEAD_FOLLOW_PATTERNS[builder.kind];
  const head = builder.visual.getObjectByName(`${builder.kind}-head-pivot`);
  if (!pattern || !head) return;
  builder.visual.updateMatrixWorld(true);
  for (const child of [...builder.visual.children]) {
    if (child === head || !pattern.test(child.name.slice(builder.kind.length + 1))) continue;
    head.attach(child);
  }
}

// Authored once from the exact post-polish BufferGeometry bounds. Keeping the
// values data-driven avoids a Box3 hierarchy walk every time a herd member is
// instantiated while preserving the runtime footOffset contract.
const LIVING_ART_FOOT_CORRECTIONS: Readonly<Partial<Record<LivingBestiaryVisualKind, number>>> = Object.freeze({
  "thornhide-trufflehog": .0304048631,
  "petalmask-tanuki": .0201220084,
  "hearthback-badger": .0365745758,
  "sunfoil-pangolin": .0365745758,
  "glassstep-jerboa": .0045693061,
  "stormcrest-ibex": .0128241489,
  "cindercoil-gecko": .0530271432,
  "cloudkite-pika": .0468574304,
  "briarclaw-lynx": .0139522957,
  "gravebell-jackal": .0170371521,
  "cragglass-basilisk": .1552093305,
  "kilnscale-salamander": .0499638439,
  "sporeback-gardener": .0304048631,
  "ilyr-virebloom": .0072129217,
  kharza: -.0137514966,
  "sugarwake-sovereign": .0078482425,
  asterjaw: -.02100941,
  "glasswake-stag": .0039169901,
  "bellstep-qilin": .0258277803,
  "aerolith-baleen": .4244626123,
  "mireglass-kelpie": .2224500828,
  "cinderwing-pyrausta": .4462353108,
  "nacre-gatewyrm": .2192062433,
  "frostcauldron-behemoth": .2751844715,
  "briarcrown-manticore": .0721168486,
  ammonarch: .1803795068,
  "handtail-ahuizotl": .2206627126,
  "tideclock-cetus": .4084290867,
  "anemoi-gryphon": .2120983357,
  "sable-gorgon": .4467730584,
  "namarra-makara": .257932029,
  "ashen-salamander-king": .1787435669,
  "mycelial-oneirophant": .4353501184,
});

export function createLivingBestiaryMobVisual(kind: LivingBestiaryVisualKind, id: number): MobVisual {
  const builder = createBuilder(kind, id);
  if ((["ilyr-virebloom", "thalassene", "orichalc", "varkesh-stormmane", "kharza", "sugarwake-sovereign"] as readonly MobKind[]).includes(kind)) decorateMythic(builder);
  else if ((["bellstep-qilin", "aerolith-baleen", "mireglass-kelpie", "cinderwing-pyrausta", "nacre-gatewyrm", "frostcauldron-behemoth", "briarcrown-manticore", "ammonarch", "handtail-ahuizotl", "tideclock-cetus", "anemoi-gryphon", "sable-gorgon", "namarra-makara", "ashen-salamander-king", "mycelial-oneirophant"] as readonly MobKind[]).includes(kind)) decorateFrontierMythic(builder);
  else if ((["asterjaw", "vellum-warden", "choir-of-one", "glasswake-stag"] as readonly MobKind[]).includes(kind)) decorateSummon(builder);
  else decorateRegular(builder);
  attachAuthoredHeadDetails(builder);
  applyLivingArtPolish(builder);
  addLivingMountTack(builder);
  // Curved and cubic authored feet/pages have different exact bounds; retain
  // the production spawn contact plane instead of allowing either to clip.
  if (kind === "orichalc") builder.visual.position.y += .18759377827660684;
  if (kind === "vellum-warden") builder.visual.position.y += .19;
  builder.visual.position.y += LIVING_ART_FOOT_CORRECTIONS[kind] ?? 0;
  return { group: builder.group, visual: builder.visual, parts: builder.parts };
}

type LivingPoseNode = THREE.Object3D & { userData: Record<string, unknown> };
type LivingPoseCache = Readonly<{
  tail: LivingPoseNode | null;
  jaw: LivingPoseNode | null;
  crown: LivingPoseNode | null;
  fins: readonly LivingPoseNode[];
  wings: readonly LivingPoseNode[];
  wingPairPhases: ReadonlyMap<LivingPoseNode, number>;
  tentacles: readonly LivingPoseNode[];
  groundLegs: readonly LivingPoseNode[];
  limbJoints: readonly LivingPoseNode[];
  arthropodLegs: readonly LivingPoseNode[];
  pulses: readonly LivingPoseNode[];
  specials: readonly LivingPoseNode[];
  floaters: readonly LivingPoseNode[];
  spinners: readonly LivingPoseNode[];
  shimmers: readonly LivingPoseNode[];
  swings: readonly LivingPoseNode[];
}>;

function livingPoseCache(visual: THREE.Object3D, kind: LivingBestiaryVisualKind): LivingPoseCache {
  const prior = visual.userData.livingBestiaryPoseCache as LivingPoseCache | undefined;
  if (prior) return prior;
  const fins: LivingPoseNode[] = [];
  const wings: LivingPoseNode[] = [];
  const tentacles: LivingPoseNode[] = [];
  const groundLegs: LivingPoseNode[] = [];
  const limbJoints: LivingPoseNode[] = [];
  const arthropodLegs: LivingPoseNode[] = [];
  const pulses: LivingPoseNode[] = [];
  const specials: LivingPoseNode[] = [];
  const floaters: LivingPoseNode[] = [];
  const spinners: LivingPoseNode[] = [];
  const shimmers: LivingPoseNode[] = [];
  const swings: LivingPoseNode[] = [];
  let tail: LivingPoseNode | null = null;
  let jaw: LivingPoseNode | null = null;
  let crown: LivingPoseNode | null = null;
  visual.traverse((raw) => {
    const node = raw as LivingPoseNode;
    const name = node.name;
    if (!name.startsWith(`${kind}-`)) return;
    node.userData.livingRestX ??= node.rotation.x;
    node.userData.livingRestY ??= node.rotation.y;
    node.userData.livingRestZ ??= node.rotation.z;
    node.userData.livingRestPositionY ??= node.position.y;
    node.userData.livingRestScaleX ??= node.scale.x;
    node.userData.livingRestScaleY ??= node.scale.y;
    node.userData.livingRestScaleZ ??= node.scale.z;
    if (node instanceof THREE.Mesh) node.userData.livingRestOpacity ??= (Array.isArray(node.material) ? node.material[0] : node.material).opacity;
    if (name === `${kind}-tail-root-pivot`) tail = node;
    if (name === `${kind}-lower-jaw-attack-pivot`) jaw = node;
    if (name === `${kind}-gaze-crown-pivot`) crown = node;
    if (/-fin-\d+-pivot$/u.test(name) || /-mantle-[^/]+$/u.test(name)) fins.push(node);
    if (/-wing-pivot$/u.test(name)) wings.push(node);
    if (/-tentacle-\d+-pivot$/u.test(name)) tentacles.push(node);
    if (visual.userData.bodyPlan === "arthropod" && /-leg-\d+-pivot$/u.test(name)) arthropodLegs.push(node);
    if (visual.userData.bodyPlan !== "arthropod" && /-(?:front|middle|rear)-(?:left|right)-leg-pivot$|-(?:left|right)-leg-pivot$/u.test(name)) groundLegs.push(node);
    if (typeof node.userData.livingJointRole === "string") limbJoints.push(node);
    if (/glow|heart|spark|mote|star|note|shoreline|unwritten-page|color-wave/u.test(name)) pulses.push(node);
    if (/ore-segment|vellum-plate|mantle-fold|implied-face|living-coral|antler-flower/u.test(name)) specials.push(node);
    if (Number(node.userData.livingFloatAmplitude) > 0) floaters.push(node);
    if (Number(node.userData.livingSpinRate)) spinners.push(node);
    if (node instanceof THREE.Mesh && Number(node.userData.livingShimmerAmplitude) > 0) shimmers.push(node);
    if (Number(node.userData.livingSwingAmplitude) > 0) swings.push(node);
  });
  const pairPhaseByName = new Map<string, number>();
  const wingPairPhases = new Map<LivingPoseNode, number>();
  for (const wing of wings) {
    const pairName = wing.name.replace(/(^|-)(?:left|right)(?=-|$)/u, "$1paired");
    if (!pairPhaseByName.has(pairName)) pairPhaseByName.set(pairName, pairPhaseByName.size * .35);
    wingPairPhases.set(wing, pairPhaseByName.get(pairName) ?? 0);
  }
  const cache = Object.freeze({ tail, jaw, crown, fins, wings, wingPairPhases, tentacles, groundLegs, limbJoints, arthropodLegs, pulses, specials, floaters, spinners, shimmers, swings });
  visual.userData.livingBestiaryPoseCache = cache;
  return cache;
}

/**
 * Cached secondary motion for the Living Bestiary expansion. The first call
 * indexes named joints once; subsequent frames are O(animated joints) and do
 * not traverse an entire model. All offsets are calculated from stored rest
 * transforms, so preview scrubbing and multiplayer correction cannot drift.
 */
export function applyLivingBestiaryPose(
  visual: THREE.Object3D,
  kind: MobKind,
  timeSeconds: number,
  travelAmount = 0,
  alertAmount = 0,
) {
  if (!(LIVING_BESTIARY_VISUAL_KINDS as readonly MobKind[]).includes(kind)) return false;
  const livingKind = kind as LivingBestiaryVisualKind;
  const time = Number.isFinite(timeSeconds) ? timeSeconds : 0;
  const travel = THREE.MathUtils.clamp(Number.isFinite(travelAmount) ? travelAmount : 0, 0, 1);
  const alert = THREE.MathUtils.clamp(Number.isFinite(alertAmount) ? alertAmount : 0, 0, 1);
  const cache = livingPoseCache(visual, livingKind);
  const rest = (node: LivingPoseNode, axis: "X" | "Y" | "Z") => Number(node.userData[`livingRest${axis}`]) || 0;
  const sideOf = (node: LivingPoseNode) => Number(node.userData.side) || (node.name.includes("-left-") ? -1 : 1);

  if (cache.tail) {
    const aquatic = visual.userData.bodyPlan === "aquatic" || ["thalassene", "voidmantle-ray", "wreckwhistle-porpoise"].includes(livingKind);
    const basilisk = livingKind === "cragglass-basilisk";
    const cadence = aquatic ? 2.8 + travel * 4.2 : basilisk ? .72 + travel * 1.45 : 1.05 + travel * 2.2;
    cache.tail.rotation.y = rest(cache.tail, "Y") + Math.sin(time * cadence) * (aquatic ? .13 + travel * .22 : basilisk ? .035 + travel * .075 : .055 + travel * .12);
  }
  if (livingKind === "cragglass-basilisk") {
    if (cache.jaw) cache.jaw.rotation.x = rest(cache.jaw, "X") - .025 - alert * (.16 + Math.max(0, Math.sin(time * 7.5)) * .08);
    if (cache.crown) cache.crown.rotation.x = rest(cache.crown, "X") - alert * .035 + Math.sin(time * .82) * .008;
  }
  for (const [index, fin] of cache.fins.entries()) {
    const side = sideOf(fin);
    fin.rotation.z = rest(fin, "Z") + side * (-.08 + Math.sin(time * (2.15 + travel * 2.1) + index * .42) * (.07 + travel * .11));
  }
  for (const wing of cache.wings) {
    const side = sideOf(wing);
    const soaring = livingKind === "stormglass-roclet" || livingKind === "mirecrown-crane";
    const rate = soaring ? 3.2 + travel * 5 : 8 + travel * 5;
    wing.rotation.z = rest(wing, "Z") + side * (-.12 + Math.sin(time * rate + (cache.wingPairPhases.get(wing) ?? 0)) * (.12 + travel * .3 + alert * .08));
  }
  for (const [index, arm] of cache.tentacles.entries()) {
    arm.rotation.x = rest(arm, "X") + Math.sin(time * (1.7 + travel * 1.8) + index * .72) * (.08 + travel * .08);
    arm.rotation.y = rest(arm, "Y") + Math.cos(time * 1.15 + index * .55) * .07;
  }
  const groundCadence = time * (livingKind === "cragglass-basilisk" ? 1.55 + travel * 4.15 : 2.15 + travel * 5.6);
  for (const leg of cache.groundLegs) {
    const phase = Number(leg.userData.phase) || 0;
    leg.rotation.x = rest(leg, "X") + Math.sin(groundCadence + phase) * travel * .2;
  }
  for (const joint of cache.limbJoints) {
    const phase = Number(joint.userData.phase) || 0;
    const role = String(joint.userData.livingJointRole || "");
    const stride = Math.sin(groundCadence + phase) * travel;
    const planted = Math.max(0, Math.sin(groundCadence + phase)) * travel;
    if (role === "basilisk-jaw" || role === "basilisk-crown") continue;
    if (role === "knee" || role === "hock") joint.rotation.x = rest(joint, "X") - stride * .11 + planted * .08;
    else if (role === "ankle" || role === "foot") joint.rotation.x = rest(joint, "X") + stride * .08 - planted * .045;
    else if (role === "arthropod-knee") joint.rotation.z = rest(joint, "Z") - sideOf(joint) * stride * .08;
    else if (role === "arthropod-foot") joint.rotation.x = rest(joint, "X") + stride * .07;
    else if (role === "claw-wrist") joint.rotation.y = rest(joint, "Y") + sideOf(joint) * alert * .11;
  }
  for (const [index, leg] of cache.arthropodLegs.entries()) {
    const side = sideOf(leg);
    const phase = index % 2 ? Math.PI : 0;
    leg.rotation.x = rest(leg, "X") + Math.sin(time * (2.6 + travel * 5.2) + phase) * (.04 + travel * .17);
    leg.rotation.z = rest(leg, "Z") + side * (.1 + Math.cos(time * 2.1 + phase) * (.02 + travel * .055));
  }
  for (const [index, node] of cache.pulses.entries()) {
    const factor = 1 + Math.sin(time * (1.45 + (index % 3) * .18) + index * .62) * (.055 + alert * .025);
    node.scale.set(
      (Number(node.userData.livingRestScaleX) || 1) * factor,
      (Number(node.userData.livingRestScaleY) || 1) * factor,
      (Number(node.userData.livingRestScaleZ) || 1) * factor,
    );
  }
  for (const [index, node] of cache.specials.entries()) {
    const baseY = Number(node.userData.livingRestPositionY) || 0;
    const wave = Math.sin(time * .78 + index * .47);
    node.position.y = baseY + wave * (livingKind === "orichalc" ? .035 : .018);
    node.rotation.y = rest(node, "Y") + wave * (livingKind === "orichalc" ? .055 : .018);
  }
  for (const node of cache.floaters) {
    const baseY = Number(node.userData.livingRestPositionY) || 0;
    const amplitude = Number(node.userData.livingFloatAmplitude) || 0;
    const rate = Number(node.userData.livingFloatRate) || 1;
    const phase = Number(node.userData.livingFloatPhase) || 0;
    node.position.y = baseY + Math.sin(time * rate + phase) * amplitude;
  }
  for (const node of cache.spinners) {
    node.rotation.y = rest(node, "Y") + time * (Number(node.userData.livingSpinRate) || 0);
  }
  for (const raw of cache.shimmers) {
    if (!(raw instanceof THREE.Mesh)) continue;
    const material = Array.isArray(raw.material) ? raw.material[0] : raw.material;
    const base = Number(raw.userData.livingRestOpacity) || material.opacity;
    const amplitude = Number(raw.userData.livingShimmerAmplitude) || 0;
    material.opacity = THREE.MathUtils.clamp(base + Math.sin(time * 1.2 + Number(raw.userData.livingFloatPhase || 0)) * amplitude, .18, 1);
  }
  for (const node of cache.swings) {
    node.rotation.z = rest(node, "Z") + Math.sin(
      time * (Number(node.userData.livingSwingRate) || 1) + (Number(node.userData.livingSwingPhase) || 0),
    ) * (Number(node.userData.livingSwingAmplitude) || 0);
  }
  return true;
}
