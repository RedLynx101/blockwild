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
  "asterjaw", "vellum-warden", "choir-of-one", "glasswake-stag",
] as const satisfies readonly LivingBestiaryVisualKind[]);

type Builder = ReturnType<typeof createBuilder>;

function createBuilder(kind: LivingBestiaryVisualKind, id: number) {
  const group = new THREE.Group();
  const visual = new THREE.Group();
  group.name = `${kind}-root`;
  visual.name = `${kind}-visual`;
  visual.userData.wildlifeRig = kind;
  group.add(visual);
  const parts: MobVisualParts = { legs: [], wings: [], arms: [], head: [], body: [] };
  const [bodyColor, accentColor, eyeColor] = MOB_DEFS[kind].colors;
  const lambert = (color: THREE.ColorRepresentation, opacity = 1) => new THREE.MeshLambertMaterial({ color, transparent: opacity < 1, opacity });
  const glow = (color: THREE.ColorRepresentation, opacity = 1) => new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });
  const mats = {
    body: lambert(bodyColor), accent: lambert(accentColor), eye: glow(eyeColor),
    dark: lambert(new THREE.Color(bodyColor).multiplyScalar(.56)),
    pale: lambert(new THREE.Color(accentColor).lerp(new THREE.Color(0xffffff), .46)),
    glow: glow(eyeColor), glass: lambert(new THREE.Color(eyeColor).lerp(new THREE.Color(0xffffff), .35), .72),
    metal: lambert(0x9ca5a4), black: lambert(0x24252a), white: lambert(0xf1eee2),
  };
  const add = (parent: THREE.Object3D, size: [number, number, number], material: THREE.Material, position: [number, number, number], name: string, part?: keyof MobVisualParts) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.name = `${kind}-${name}`;
    mesh.userData.mobId = id;
    parent.add(mesh);
    if (part) { mesh.userData.bodyPart = part; parts[part].push(mesh); }
    return mesh;
  };
  const pivot = (size: [number, number, number], material: THREE.Material, at: [number, number, number], offset: [number, number, number], name: string, part: keyof MobVisualParts) => {
    const node = new THREE.Group();
    node.position.set(...at);
    node.name = `${kind}-${name}-pivot`;
    const mesh = add(node, size, material, offset, name);
    mesh.userData.bodyPart = part;
    parts[part].push(node);
    visual.add(node);
    return node;
  };
  const eyes = (x: number, y: number, z: number, size = .07, count = 2) => {
    if (count === 1) add(visual, [size, size, .035], mats.eye, [0, y, z], "center-eye");
    else for (const side of [-1, 1]) add(visual, [size, size, .035], mats.eye, [side * x, y, z], `${side < 0 ? "left" : "right"}-eye`);
  };
  const eyesOn = (parent: THREE.Object3D, x: number, y: number, z: number, size = .07, count = 2) => {
    if (count === 1) add(parent, [size, size, .035], mats.eye, [0, y, z], "center-eye");
    else for (const side of [-1, 1]) add(parent, [size, size, .035], mats.eye, [side * x, y, z], `${side < 0 ? "left" : "right"}-eye`);
  };
  return { kind, group, visual, parts, mats, lambert, glow, add, pivot, eyes, eyesOn };
}

function quadruped(builder: Builder, config: Readonly<{
  body: [number, number, number]; bodyY: number; head: [number, number, number]; headY: number; headZ: number;
  legLength: number; legX: number; frontZ: number; rearZ: number; tail?: "long" | "brush" | "flat" | "short";
  muzzle?: "snout" | "canine" | "beak" | "none"; ears?: "round" | "point" | "long" | "sail" | "none";
}>) {
  const { visual, mats, add, pivot, eyesOn, kind } = builder;
  add(visual, config.body, mats.body, [0, config.bodyY, 0], "body", "body");
  add(visual, [config.body[0] * .78, config.body[1] * .38, config.body[2] * .72], mats.accent, [0, config.bodyY + config.body[1] * .42, -.02], "mantle");
  const head = pivot(config.head, mats.body, [0, config.headY, config.headZ], [0, 0, 0], "head", "head");
  const muzzleDepth = config.muzzle === "canine" ? config.head[2] * .72 : config.muzzle === "snout" ? config.head[2] * .48 : config.head[2] * .35;
  if (config.muzzle !== "none") add(head, [config.head[0] * .68, config.head[1] * .45, muzzleDepth], config.muzzle === "beak" ? mats.pale : mats.dark, [0, -config.head[1] * .15, -config.head[2] * .48], "muzzle");
  // Eyes live on the articulated head, so attentive poses never leave the
  // expression floating behind the skull.
  eyesOn(head, config.head[0] * .28, config.head[1] * .12, -config.head[2] * .51, Math.max(.045, config.head[0] * .1));
  if (config.ears !== "none") for (const side of [-1, 1] as const) {
    const long = config.ears === "long" || config.ears === "sail";
    const ear = pivot([long ? .13 : .16, long ? .4 : .24, config.ears === "sail" ? .08 : .12], mats.accent,
      [side * config.head[0] * .36, config.headY + config.head[1] * .32, config.headZ], [0, (long ? .4 : .24) * .42, 0], `${side < 0 ? "left" : "right"}-ear`, "head");
    ear.rotation.z = side * (config.ears === "point" ? -.16 : .08);
    ear.userData.side = side;
  }
  for (const [side, z, phase, label] of [
    [-1, config.frontZ, 0, "front-left"], [1, config.frontZ, Math.PI, "front-right"],
    [-1, config.rearZ, Math.PI, "rear-left"], [1, config.rearZ, 0, "rear-right"],
  ] as const) {
    const leg = pivot([Math.max(.09, config.legX * .42), config.legLength, Math.max(.09, config.legX * .4)], mats.dark,
      [side * config.legX, config.bodyY - config.body[1] * .36, z], [0, -config.legLength * .48, 0], `${label}-leg`, "legs");
    leg.userData.phase = phase;
    leg.userData.side = side;
    add(leg, [Math.max(.15, config.legX * .58), .1, .24], mats.accent, [0, -config.legLength, -.04], `${label}-foot`);
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
  const { visual, mats, add, pivot, eyesOn } = builder;
  const bodyY = config.longNeck ? .78 : .48;
  add(visual, config.body, mats.body, [0, bodyY, 0], "body", "body");
  add(visual, [config.body[0] * .7, config.body[1] * .5, config.body[2] * .5], mats.pale, [0, bodyY - .08, -config.body[2] * .32], "breast");
  const neckY = config.longNeck ? 1.18 : bodyY + .28;
  if (config.longNeck) add(visual, [.2, .68, .2], mats.pale, [0, .94, -.24], "long-neck", "head");
  const head = pivot([.38, .34, .4], mats.body, [0, neckY, -.4], [0, 0, 0], "head", "head");
  add(head, [.18, .12, config.beak], mats.accent, [0, -.06, -.22], "beak");
  eyesOn(head, .115, .06, -.205, .055);
  for (const side of [-1, 1] as const) {
    const wing = pivot([config.wingSpan * .54, .08, config.body[2] * .86], mats.accent, [side * config.body[0] * .35, bodyY + .08, .02], [side * config.wingSpan * .22, 0, .06], `${side < 0 ? "left" : "right"}-wing`, "wings");
    wing.userData.side = side;
    for (let feather = 0; feather < 3; feather += 1) {
      const primary = add(wing, [config.wingSpan * .22, .045, config.body[2] * (.72 - feather * .12)], feather % 2 ? mats.dark : mats.pale,
        [side * config.wingSpan * (.34 + feather * .2), 0, .05 + feather * .12], `wing-primary-${side}-${feather}`);
      primary.rotation.y = side * (-.08 - feather * .07);
    }
    const leg = pivot([.09, config.legLength, .09], mats.dark, [side * .14, bodyY - config.body[1] * .35, -.02], [0, -config.legLength * .48, 0], `${side < 0 ? "left" : "right"}-leg`, "legs");
    leg.userData.side = side;
    add(leg, [.22, .05, .24], mats.accent, [0, -config.legLength, -.08], `${side < 0 ? "left" : "right"}-foot`);
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
  add(visual, [config.body[0] * .68, config.body[1] * .24, config.body[2] * .74], mats.accent, [0, .48 + config.body[1] * .38, 0], "dorsal-pattern");
  eyes(config.body[0] * .28, .56, -config.body[2] * .5, Math.max(.045, config.body[0] * .08));
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
  const { visual, mats, add, pivot, eyes } = builder;
  add(visual, config.body, mats.body, [0, .34, 0], "body", "body");
  if (config.shell) add(visual, [config.body[0] * .92, config.body[1] * .5, config.body[2] * .88], mats.accent, [0, .52, .03], "carapace", "body");
  eyes(config.body[0] * .3, .5, -config.body[2] * .5, .055);
  for (const side of [-1, 1] as const) for (let index = 0; index < config.legs; index += 1) {
    const leg = pivot([config.body[0] * .46, .07, .11], index % 2 ? mats.dark : mats.accent,
      [side * config.body[0] * .34, .32, -.26 + index * (config.body[2] * .5 / Math.max(1, config.legs - 1))], [side * config.body[0] * .25, -.08, 0], `${side < 0 ? "left" : "right"}-leg-${index + 1}`, "legs");
    leg.userData.side = side;
    leg.userData.phase = index % 2 ? Math.PI : 0;
  }
  if (config.claws) for (const side of [-1, 1] as const) {
    const claw = pivot([.22, .16, .42], mats.accent, [side * config.body[0] * .36, .38, -config.body[2] * .48], [side * .08, 0, -.18], `${side < 0 ? "left" : "right"}-claw`, "arms");
    claw.userData.side = side;
    add(claw, [.12, .1, .26], mats.pale, [side * .1, .02, -.32], `claw-tip-${side}`);
  }
  visual.userData.bodyPlan = "arthropod";
}

function decorateRegular(builder: Builder) {
  const { kind, visual, mats, add, pivot, glow } = builder;
  switch (kind) {
    case "thornhide-trufflehog":
      quadruped(builder, { body: [1.08, .66, 1.34], bodyY: .64, head: [.72, .58, .72], headY: .64, headZ: -.86, legLength: .42, legX: .38, frontZ: -.4, rearZ: .44, tail: "short", muzzle: "snout", ears: "round" });
      for (let row = 0; row < 3; row += 1) for (let side = -2; side <= 2; side += 1) { const thorn = add(visual, [.1, .34 + row * .04, .1], row % 2 ? mats.pale : mats.accent, [side * .19, 1.05 + row * .05, -.35 + row * .34], `thorn-${row}-${side}`); thorn.rotation.z = side * .08; }
      for (const side of [-1, 1]) add(visual, [.1, .12, .46], mats.pale, [side * .25, .48, -1.32], `root-tusk-${side}`).rotation.y = side * -.18;
      break;
    case "orchard-glider":
      quadruped(builder, { body: [.58, .34, .76], bodyY: .62, head: [.42, .38, .4], headY: .68, headZ: -.5, legLength: .26, legX: .22, frontZ: -.22, rearZ: .26, tail: "long", muzzle: "snout", ears: "round" });
      for (const side of [-1, 1] as const) { const membrane = pivot([.72, .035, .9], mats.glass, [side * .2, .66, .04], [side * .32, 0, .04], `${side < 0 ? "left" : "right"}-wing`, "wings"); membrane.userData.side = side; for (let vein = 0; vein < 3; vein += 1) add(membrane, [.035, .045, .66], mats.accent, [side * (.14 + vein * .16), .01, vein * .08], `wing-vein-${side}-${vein}`); }
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
      for (const side of [-1, 1]) for (let claw = 0; claw < 3; claw += 1) add(visual, [.055, .06, .3], mats.pale, [side * (.26 + claw * .08), .17, -.64], `dig-claw-${side}-${claw}`);
      break;
    case "sunfoil-pangolin":
      quadruped(builder, { body: [1.05, .68, 1.38], bodyY: .64, head: [.56, .42, .66], headY: .59, headZ: -.86, legLength: .36, legX: .36, frontZ: -.42, rearZ: .42, tail: "long", muzzle: "snout", ears: "none" });
      for (let row = 0; row < 5; row += 1) for (let side = -2; side <= 2; side += 1) { const scale = add(visual, [.24, .09, .32], row % 2 ? mats.pale : mats.accent, [side * .19, .88 - Math.abs(side) * .035, -.5 + row * .26], `foil-scale-${row}-${side}`); scale.rotation.x = -.16; }
      break;
    case "glassstep-jerboa":
      quadruped(builder, { body: [.46, .46, .62], bodyY: .52, head: [.42, .4, .4], headY: .72, headZ: -.4, legLength: .68, legX: .18, frontZ: -.16, rearZ: .24, tail: "long", muzzle: "snout", ears: "long" });
      for (const side of [-1, 1]) add(visual, [.3, .055, .5], mats.glass, [side * .2, .1, .35], `glass-hind-foot-${side}`).rotation.y = side * -.08;
      break;
    case "stormcrest-ibex":
      quadruped(builder, { body: [1.2, .82, 1.5], bodyY: .9, head: [.72, .66, .72], headY: 1.18, headZ: -.94, legLength: .78, legX: .42, frontZ: -.44, rearZ: .48, tail: "short", muzzle: "snout", ears: "point" });
      for (const side of [-1, 1] as const) for (let segment = 0; segment < 5; segment += 1) { const horn = add(visual, [.13, .3, .15], segment % 2 ? mats.accent : mats.dark, [side * (.22 + segment * .05), 1.55 + segment * .17, -.88 + segment * .08], `spiral-horn-${side}-${segment}`); horn.rotation.z = side * (.18 + segment * .09); }
      for (let spark = 0; spark < 4; spark += 1) add(visual, [.055, .055, .055], mats.glow, [(spark - 1.5) * .13, 1.82 + (spark % 2) * .09, -.68], `static-spark-${spark}`);
      break;
    case "cindercoil-gecko":
      quadruped(builder, { body: [.62, .25, .9], bodyY: .26, head: [.5, .3, .46], headY: .31, headZ: -.58, legLength: .2, legX: .26, frontZ: -.28, rearZ: .3, tail: "long", muzzle: "none", ears: "none" });
      for (const side of [-1, 1]) for (let toe = 0; toe < 4; toe += 1) add(visual, [.08, .035, .24], mats.pale, [side * (.28 + toe * .025), .04, -.25 + toe * .16], `toe-fan-${side}-${toe}`).rotation.y = side * (toe - 1.5) * .12;
      for (let ember = 0; ember < 7; ember += 1) add(visual, [.06, .04, .08], mats.glow, [((ember % 3) - 1) * .17, .4, -.28 + Math.floor(ember / 3) * .28], `ember-freckle-${ember}`);
      break;
    case "cloudkite-pika":
      quadruped(builder, { body: [.52, .48, .62], bodyY: .48, head: [.5, .44, .44], headY: .66, headZ: -.4, legLength: .26, legX: .2, frontZ: -.18, rearZ: .2, tail: "short", muzzle: "snout", ears: "sail" });
      for (const side of [-1, 1]) add(visual, [.18, .36, .035], mats.glass, [side * .18, .98, -.36], `ear-sail-${side}`).rotation.z = side * -.12;
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
    case "cragglass-basilisk":
      quadruped(builder, { body: [1.22, .52, 1.5], bodyY: .5, head: [.74, .52, .74], headY: .6, headZ: -.94, legLength: .32, legX: .46, frontZ: -.5, rearZ: .5, tail: "long", muzzle: "snout", ears: "none" });
      for (let crown = -2; crown <= 2; crown += 1) { const shard = add(visual, [.14, .48 - Math.abs(crown) * .06, .16], crown === 0 ? mats.glow : mats.glass, [crown * .15, 1.02 - Math.abs(crown) * .04, -.86], `crown-shard-${crown}`); shard.rotation.z = crown * -.1; }
      for (let side = -1; side <= 1; side += 2) add(visual, [.1, .08, .56], mats.glass, [side * .42, .72, -.12], `reflective-plate-${side}`).rotation.z = side * .26;
      break;
    case "stormglass-roclet":
      bird(builder, { body: [1.05, .82, 1.42], wingSpan: 1.8, legLength: .62, beak: .58, tail: 1.05 });
      for (let vane = -3; vane <= 3; vane += 1) { const shard = add(visual, [.13, .48 - Math.abs(vane) * .035, .12], vane % 2 ? mats.glass : mats.glow, [vane * .15, 1.38, -.08 + Math.abs(vane) * .04], `storm-vane-${vane}`); shard.rotation.z = vane * -.06; }
      break;
    case "brinewhisk-otter":
      quadruped(builder, { body: [.86, .5, 1.22], bodyY: .48, head: [.58, .52, .56], headY: .62, headZ: -.76, legLength: .3, legX: .3, frontZ: -.34, rearZ: .36, tail: "flat", muzzle: "snout", ears: "round" });
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
      for (let band = 0; band < 4; band += 1) for (let side = -1; side <= 1; side += 2) add(visual, [.1, .06, .22], band % 2 ? mats.glow : mats.pale, [side * .34, .72, -.25 + band * .22], `color-wave-${side}-${band}`);
      break;
    case "prismclaw-mantis-shrimp":
      arthropod(builder, { body: [.76, .34, 1.12], legs: 4, claws: true, shell: true });
      for (let panel = 0; panel < 5; panel += 1) add(visual, [.62 - panel * .05, .08, .2], panel % 2 ? mats.glass : mats.glow, [0, .56, -.34 + panel * .2], `prism-panel-${panel}`);
      break;
    case "reefmender-shrimp":
      arthropod(builder, { body: [.38, .2, .66], legs: 4, claws: true, shell: true });
      for (const side of [-1, 1]) for (let feeler = 0; feeler < 2; feeler += 1) { const antenna = add(visual, [.025, .025, .78], mats.white, [side * (.1 + feeler * .06), .46, -.42], `cleaner-feeler-${side}-${feeler}`); antenna.rotation.y = side * (.16 + feeler * .1); }
      break;
    case "currentweaver-eel":
      aquatic(builder, { body: [.48, .4, 1.7], tail: .88, fins: 1 });
      for (let node = 0; node < 8; node += 1) add(visual, [.08, .06, .14], node % 2 ? mats.glow : mats.accent, [0, .68, -.62 + node * .2], `charge-node-${node}`);
      break;
    case "shellcarrier-hermit":
      arthropod(builder, { body: [.62, .32, .72], legs: 3, claws: true, shell: true });
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
      for (const side of [-1, 1]) { const mantle = add(visual, [1.28, .08, 1.55], mats.glass, [side * .92, .48, .05], `mantle-${side}`, "wings"); mantle.rotation.z = side * -.12; }
      for (let mote = 0; mote < 8; mote += 1) add(visual, [.055, .04, .08], mats.glow, [((mote % 4) - 1.5) * .42, .54, -.38 + Math.floor(mote / 4) * .56], `lumen-mote-${mote}`);
      break;
    case "fossilback-trilobite":
      arthropod(builder, { body: [.72, .22, .9], legs: 6, shell: true });
      for (let segment = 0; segment < 7; segment += 1) add(visual, [.62 - Math.abs(segment - 3) * .04, .1, .12], segment % 2 ? mats.accent : mats.pale, [0, .48, -.36 + segment * .12], `fossil-segment-${segment}`);
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
    for (let stream = -2; stream <= 2; stream += 1) add(visual, [.14, .08, 2.35], stream % 2 ? mats.glass : mats.glow, [stream * .32, 2.08, .08], `back-spring-${stream}`);
  } else if (kind === "thalassene") {
    aquatic(builder, { body: [3.6, 1.28, 4.3], tail: 2.2, fins: 2 });
    for (let arch = -3; arch <= 3; arch += 1) { add(visual, [.26, 1.05 + (3 - Math.abs(arch)) * .2, .34], arch % 2 ? mats.accent : mats.pale, [arch * .46, 1.48, -.55 + Math.abs(arch) * .18], `reef-arch-${arch}`); add(visual, [.58, .22, .58], arch % 3 ? mats.glow : mats.accent, [arch * .46, 2.04 + (3 - Math.abs(arch)) * .2, -.55 + Math.abs(arch) * .18], `reef-crown-${arch}`); }
    for (let coral = 0; coral < 14; coral += 1) add(visual, [.14, .46 + coral % 3 * .14, .14], coral % 2 ? mats.glow : mats.pale, [((coral * 17) % 7 - 3) * .44, 1.65, -.9 + (coral % 5) * .42], `living-coral-${coral}`);
  } else if (kind === "orichalc") {
    add(visual, [2.15, 1.5, 2.0], mats.dark, [0, 1.45, 0], "empty-center-frame", "body");
    for (let ring = 0; ring < 5; ring += 1) for (let segment = 0; segment < 8; segment += 1) { const angle = segment / 8 * Math.PI * 2 + ring * .16; const piece = add(visual, [.42, .34, .68], segment % 2 ? mats.metal : mats.accent, [Math.cos(angle) * (1.2 + ring * .08), .55 + ring * .48, Math.sin(angle) * (1.0 + ring * .06)], `ore-segment-${ring}-${segment}`, ring < 2 ? "legs" : "body"); piece.rotation.y = -angle; }
    for (let spark = 0; spark < 7; spark += 1) add(visual, [.12, .12, .12], mats.glow, [Math.sin(spark) * .72, 1.2 + spark * .18, Math.cos(spark) * .56], `unresolved-heart-${spark}`);
  } else if (kind === "varkesh-stormmane") {
    bird(builder, { body: [2.05, 1.42, 2.65], wingSpan: 3.4, legLength: 1.02, beak: .84, tail: 1.8 });
    for (let plume = -5; plume <= 5; plume += 1) { const p = add(visual, [.18, .76 - Math.abs(plume) * .035, .16], plume % 2 ? mats.glass : mats.glow, [plume * .18, 1.88 + (5 - Math.abs(plume)) * .08, -.45 + Math.abs(plume) * .06], `stormmane-${plume}`); p.rotation.z = plume * -.05; }
    for (let marker = 0; marker < 5; marker += 1) add(visual, [.18, .62, .12], marker % 2 ? mats.pale : mats.accent, [(marker - 2) * .32, 1.15, .72], `road-marker-${marker}`).rotation.z = (marker - 2) * .11;
  } else if (kind === "kharza") {
    quadruped(builder, { body: [1.8, 1.08, 2.35], bodyY: 1.12, head: [1.05, .92, 1.12], headY: 1.45, headZ: -1.45, legLength: .92, legX: .62, frontZ: -.68, rearZ: .72, tail: "brush", muzzle: "canine", ears: "point" });
    add(visual, [1.62, .16, 1.32], mats.metal, [0, 1.58, -.06], "coercion-harness", "body");
    for (const side of [-1, 1]) for (let anchor = 0; anchor < 3; anchor += 1) add(visual, [.18, .22, .28], anchor === 1 ? mats.glow : mats.accent, [side * .72, 1.55, -.46 + anchor * .5], `harness-anchor-${side}-${anchor}`);
    for (let banner = -2; banner <= 2; banner += 1) { const strip = add(visual, [.24, .62 + Math.abs(banner) * .12, .08], mats.accent, [banner * .32, 2.1 - Math.abs(banner) * .08, .36], `broken-banner-${banner}`); strip.rotation.z = banner * .08; }
  } else if (kind === "sugarwake-sovereign") {
    quadruped(builder, { body: [2.05, 1.25, 2.45], bodyY: 1.28, head: [1.12, 1.0, 1.14], headY: 1.66, headZ: -1.45, legLength: 1.0, legX: .72, frontZ: -.72, rearZ: .76, tail: "long", muzzle: "snout", ears: "sail" });
    add(visual, [.88, .88, .66], mats.glass, [0, 1.45, -.08], "kiln-heart", "body");
    add(visual, [.5, .5, .34], mats.glow, [0, 1.45, -.44], "kiln-heart-core");
    for (const side of [-1, 1]) for (let curl = 0; curl < 5; curl += 1) { const antler = add(visual, [.14, .62, .14], curl % 2 ? mats.pale : mats.glass, [side * (.35 + curl * .14), 2.05 + curl * .18, -1.35 + curl * .08], `sugar-antler-${side}-${curl}`); antler.rotation.z = side * (-.2 - curl * .07); }
    for (let plate = -3; plate <= 3; plate += 1) add(visual, [.28, .1, .72], plate % 2 ? mats.glass : mats.accent, [plate * .25, 1.98 - Math.abs(plate) * .06, -.06], `caramel-plate-${plate}`);
  }
}

function decorateSummon(builder: Builder) {
  const { kind, visual, mats, add, pivot } = builder;
  if (kind === "asterjaw") {
    quadruped(builder, { body: [1.05, .72, 1.68], bodyY: .92, head: [.7, .62, .76], headY: 1.16, headZ: -1.05, legLength: .92, legX: .35, frontZ: -.5, rearZ: .54, tail: "long", muzzle: "canine", ears: "long" });
    add(visual, [.72, .5, 1.05], mats.glass, [0, .96, .02], "open-ribcage", "body");
    for (let rib = 0; rib < 6; rib += 1) for (const side of [-1, 1]) { const star = add(visual, [.1, .1, .1], mats.glow, [side * .34, .86 + (rib % 2) * .14, -.38 + rib * .16], `compass-star-${side}-${rib}`); star.rotation.z = rib * .4; }
    for (let route = 0; route < 5; route += 1) add(visual, [.055, .055, .38], mats.glow, [((route % 3) - 1) * .18, .98 + (route % 2) * .16, -.34 + route * .16], `route-line-${route}`).rotation.y = route * .37;
  } else if (kind === "vellum-warden") {
    add(visual, [.9, 1.48, .62], mats.pale, [0, 1.02, 0], "folded-torso", "body");
    for (let plate = 0; plate < 7; plate += 1) { const p = add(visual, [1.12 - plate * .07, .08, .72], plate % 2 ? mats.body : mats.pale, [0, .48 + plate * .22, -.02 + plate % 2 * .08], `vellum-plate-${plate}`, "body"); p.rotation.z = (plate % 2 ? 1 : -1) * .06; }
    for (const side of [-1, 1] as const) { const arm = pivot([.2, 1.15, .24], mats.body, [side * .58, 1.45, 0], [0, -.5, 0], `${side < 0 ? "left" : "right"}-ink-arm`, "arms"); arm.userData.side = side; }
    add(visual, [.54, .62, .54], mats.glass, [0, 2.08, -.05], "lantern-head", "head");
    add(visual, [.34, .4, .04], mats.glow, [0, 2.08, -.34], "unwritten-page");
    for (let mark = 0; mark < 5; mark += 1) add(visual, [.34, .025, .04], mats.dark, [0, 1.32 + mark * .17, -.42], `living-redline-${mark}`);
  } else if (kind === "choir-of-one") {
    add(visual, [1.35, 1.18, .9], mats.dark, [0, 1.2, 0], "floating-mantle", "body");
    add(visual, [.62, .22, .62], mats.metal, [0, 1.58, -.36], "silver-throat-ring", "head");
    add(visual, [.38, .14, .38], mats.glow, [0, 1.58, -.48], "permitted-note");
    for (let fold = -4; fold <= 4; fold += 1) { const f = add(visual, [.2, .82 + Math.abs(fold) * .09, .18], fold % 2 ? mats.body : mats.black, [fold * .18, .64, .16 + Math.abs(fold) * .04], `mantle-fold-${fold}`, "body"); f.rotation.z = fold * .035; }
    for (let face = 0; face < 4; face += 1) add(visual, [.22, .28, .035], mats.glass, [(-.36 + face * .24), 1.3 + (face % 2) * .22, -.48], `implied-face-${face}`);
  } else if (kind === "glasswake-stag") {
    quadruped(builder, { body: [1.35, .82, 1.72], bodyY: .95, head: [.7, .64, .72], headY: 1.26, headZ: -1.06, legLength: .82, legX: .44, frontZ: -.5, rearZ: .54, tail: "short", muzzle: "snout", ears: "point" });
    add(visual, [1.05, .52, 1.2], mats.glass, [0, 1.02, 0], "sideways-ocean", "body");
    for (let wave = 0; wave < 5; wave += 1) add(visual, [.8 - wave * .08, .04, .12], wave % 2 ? mats.glow : mats.pale, [0, .88 + wave * .11, -.32 + wave * .17], `inner-shoreline-${wave}`);
    for (const side of [-1, 1]) for (let branch = 0; branch < 5; branch += 1) { const antler = add(visual, [.1, .52, .1], branch % 2 ? mats.glass : mats.pale, [side * (.25 + branch * .11), 1.62 + branch * .2, -1.0 + branch * .08], `mirror-antler-${side}-${branch}`); antler.rotation.z = side * (-.18 - branch * .08); }
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

export function createLivingBestiaryMobVisual(kind: LivingBestiaryVisualKind, id: number): MobVisual {
  const builder = createBuilder(kind, id);
  if ((["ilyr-virebloom", "thalassene", "orichalc", "varkesh-stormmane", "kharza", "sugarwake-sovereign"] as readonly MobKind[]).includes(kind)) decorateMythic(builder);
  else if ((["asterjaw", "vellum-warden", "choir-of-one", "glasswake-stag"] as readonly MobKind[]).includes(kind)) decorateSummon(builder);
  else decorateRegular(builder);
  addLivingMountTack(builder);
  return { group: builder.group, visual: builder.visual, parts: builder.parts };
}

type LivingPoseNode = THREE.Object3D & { userData: Record<string, unknown> };
type LivingPoseCache = Readonly<{
  tail: LivingPoseNode | null;
  fins: readonly LivingPoseNode[];
  wings: readonly LivingPoseNode[];
  tentacles: readonly LivingPoseNode[];
  arthropodLegs: readonly LivingPoseNode[];
  pulses: readonly LivingPoseNode[];
  specials: readonly LivingPoseNode[];
}>;

function livingPoseCache(visual: THREE.Object3D, kind: LivingBestiaryVisualKind): LivingPoseCache {
  const prior = visual.userData.livingBestiaryPoseCache as LivingPoseCache | undefined;
  if (prior) return prior;
  const fins: LivingPoseNode[] = [];
  const wings: LivingPoseNode[] = [];
  const tentacles: LivingPoseNode[] = [];
  const arthropodLegs: LivingPoseNode[] = [];
  const pulses: LivingPoseNode[] = [];
  const specials: LivingPoseNode[] = [];
  let tail: LivingPoseNode | null = null;
  visual.traverse((raw) => {
    const node = raw as LivingPoseNode;
    const name = node.name;
    if (!name.startsWith(`${kind}-`)) return;
    node.userData.livingRestX ??= node.rotation.x;
    node.userData.livingRestY ??= node.rotation.y;
    node.userData.livingRestZ ??= node.rotation.z;
    node.userData.livingRestPositionY ??= node.position.y;
    node.userData.livingRestScaleX ??= node.scale.x;
    if (name === `${kind}-tail-root-pivot`) tail = node;
    if (/-fin-\d+-pivot$/u.test(name) || /-mantle-[^/]+$/u.test(name)) fins.push(node);
    if (/-wing-pivot$/u.test(name)) wings.push(node);
    if (/-tentacle-\d+-pivot$/u.test(name)) tentacles.push(node);
    if (visual.userData.bodyPlan === "arthropod" && /-leg-\d+-pivot$/u.test(name)) arthropodLegs.push(node);
    if (/glow|heart|spark|mote|star|note|shoreline|unwritten-page|color-wave/u.test(name)) pulses.push(node);
    if (/ore-segment|vellum-plate|mantle-fold|implied-face|living-coral|antler-flower/u.test(name)) specials.push(node);
  });
  const cache = Object.freeze({ tail, fins, wings, tentacles, arthropodLegs, pulses, specials });
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
    const cadence = aquatic ? 2.8 + travel * 4.2 : 1.05 + travel * 2.2;
    cache.tail.rotation.y = rest(cache.tail, "Y") + Math.sin(time * cadence) * (aquatic ? .13 + travel * .22 : .055 + travel * .12);
  }
  for (const [index, fin] of cache.fins.entries()) {
    const side = sideOf(fin);
    fin.rotation.z = rest(fin, "Z") + side * (-.08 + Math.sin(time * (2.15 + travel * 2.1) + index * .42) * (.07 + travel * .11));
  }
  for (const [index, wing] of cache.wings.entries()) {
    const side = sideOf(wing);
    const soaring = livingKind === "stormglass-roclet" || livingKind === "mirecrown-crane";
    const rate = soaring ? 3.2 + travel * 5 : 8 + travel * 5;
    wing.rotation.z = rest(wing, "Z") + side * (-.12 + Math.sin(time * rate + index * .35) * (.12 + travel * .3 + alert * .08));
  }
  for (const [index, arm] of cache.tentacles.entries()) {
    arm.rotation.x = rest(arm, "X") + Math.sin(time * (1.7 + travel * 1.8) + index * .72) * (.08 + travel * .08);
    arm.rotation.y = rest(arm, "Y") + Math.cos(time * 1.15 + index * .55) * .07;
  }
  for (const [index, leg] of cache.arthropodLegs.entries()) {
    const side = sideOf(leg);
    const phase = index % 2 ? Math.PI : 0;
    leg.rotation.x = rest(leg, "X") + Math.sin(time * (2.6 + travel * 5.2) + phase) * (.04 + travel * .17);
    leg.rotation.z = rest(leg, "Z") + side * (.1 + Math.cos(time * 2.1 + phase) * (.02 + travel * .055));
  }
  for (const [index, node] of cache.pulses.entries()) {
    const base = Number(node.userData.livingRestScaleX) || 1;
    const pulse = base * (1 + Math.sin(time * (1.45 + (index % 3) * .18) + index * .62) * (.055 + alert * .025));
    node.scale.setScalar(pulse);
  }
  for (const [index, node] of cache.specials.entries()) {
    const baseY = Number(node.userData.livingRestPositionY) || 0;
    const wave = Math.sin(time * .78 + index * .47);
    node.position.y = baseY + wave * (livingKind === "orichalc" ? .035 : .018);
    node.rotation.y = rest(node, "Y") + wave * (livingKind === "orichalc" ? .055 : .018);
  }
  return true;
}
