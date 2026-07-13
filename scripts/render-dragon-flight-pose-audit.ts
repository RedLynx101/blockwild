import path from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import type * as THREE from "three";
import { applyDragonPose, createMobVisual } from "../app/game/mob-models.ts";
import { DRAGON_ORDER, MOB_DEFS, type MobKind } from "../app/game/mobs.ts";
import { objectToInspectionSpec, renderModelInspection, renderModelPortraits } from "./render-models.ts";

type FlightStage = 2 | 5;
type AuditVariant = "before" | "after";

const out = path.resolve(process.argv[2] ?? "output/dragon-flight-pose-progress");
const auditTime = 1.37;

function named(root: THREE.Object3D, name: string) {
  const object = root.getObjectByName(name);
  if (!object) throw new Error(`Missing production dragon joint: ${name}`);
  return object;
}

/** Recreates the v1.4.5 flight joint targets on today's articulated rig. */
function applyLegacyFlightLegs(root: THREE.Object3D, kind: MobKind, stage: FlightStage) {
  if (stage === 2) {
    for (const position of ["front-left", "front-right", "rear-left", "rear-right"] as const) {
      const front = position.startsWith("front");
      const leg = named(root, `${kind}-fledgling-${position}-leg-pivot`);
      const knee = named(root, `${kind}-fledgling-${position}-knee-pivot`);
      const claw = named(root, `${kind}-fledgling-${position}-claw-pivot`);
      leg.rotation.set(front ? 0.7 : -0.42, 0, 0);
      // These joints are new in the revised Stage II rig. Zeroing them gives
      // the straight single-piece silhouette used by the previous model.
      knee.rotation.set(0, 0, 0);
      claw.rotation.set(0, 0, 0);
    }
    return;
  }
  for (const position of ["front-left", "front-right", "rear-left", "rear-right"] as const) {
    const front = position.startsWith("front");
    named(root, `${kind}-${position}-hip-pivot`).rotation.set(front ? 0.72 : -0.42, 0, 0);
    named(root, `${kind}-${position}-knee-pivot`).rotation.set(0.84, 0, 0);
    named(root, `${kind}-${position}-claw-pivot`).rotation.set(-0.52, 0, 0);
  }
}

function makeSpec(kind: (typeof DRAGON_ORDER)[number], stage: FlightStage, variant: AuditVariant, index: number) {
  const model = createMobVisual(kind, -18_000 - stage * 100 - index * 2 - (variant === "after" ? 1 : 0));
  applyDragonPose(model.group, { timeSeconds: auditTime, stage, mode: "fly", movement: 0.82 });
  if (variant === "before") applyLegacyFlightLegs(model.group, kind, stage);
  return objectToInspectionSpec(model.group, {
    id: `${kind}-stage-${stage}-${variant}`,
    label: `${MOB_DEFS[kind].name} · ${variant.toUpperCase()}`,
    category: "mob",
    front: "-z",
    inspection: { source: "MobVisual", mob: kind },
  });
}

const stageTwoSpecs = DRAGON_ORDER.flatMap((kind, index) => [
  makeSpec(kind, 2, "before", index),
  makeSpec(kind, 2, "after", index),
]);
const adultSpecs = DRAGON_ORDER.flatMap((kind, index) => [
  makeSpec(kind, 5, "before", index),
  makeSpec(kind, 5, "after", index),
]);
const [stageTwo, adults, stageTwoPortraits, adultPortraits, stageTwoSidePortraits, adultSidePortraits] = await Promise.all([
  renderModelInspection({ out: path.join(out, "stage-2"), columns: 2, views: ["iso", "side"], specs: stageTwoSpecs }),
  renderModelInspection({ out: path.join(out, "adults"), columns: 2, views: ["iso", "side"], specs: adultSpecs }),
  renderModelPortraits({ out: path.join(out, "stage-2-portraits"), columns: 2, specs: stageTwoSpecs, png: true }),
  renderModelPortraits({ out: path.join(out, "adult-portraits"), columns: 2, specs: adultSpecs, png: true }),
  renderModelPortraits({ out: path.join(out, "stage-2-side-portraits"), columns: 2, specs: stageTwoSpecs, png: true, view: "side" }),
  renderModelPortraits({ out: path.join(out, "adult-side-portraits"), columns: 2, specs: adultSpecs, png: true, view: "side" }),
]);

const combinedFiles: string[] = [];
try {
  const sharp = (await import("sharp")).default;
  for (const view of ["iso", "side"] as const) {
    const [young, mature] = await Promise.all([
      readFile(path.join(out, "stage-2", `blockwild-models-${view}.png`)),
      readFile(path.join(out, "adults", `blockwild-models-${view}.png`)),
    ]);
    const width = 1_760;
    const header = 104;
    const height = 2_684 + header;
    const title = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${header}">
      <rect width="100%" height="100%" fill="#0b100e"/>
      <text x="28" y="45" fill="#f0c96f" font-family="system-ui,sans-serif" font-size="30" font-weight="900">DRAGON FLIGHT ARTICULATION · BEFORE / AFTER</text>
      <text x="28" y="76" fill="#91a398" font-family="system-ui,sans-serif" font-size="15">Stage II fledglings at left · mature dragons at right · paired legacy and trailing-limb poses · ${view.toUpperCase()} VIEW</text>
      <line x1="880" y1="12" x2="880" y2="96" stroke="#405648" stroke-width="2"/>
    </svg>`);
    const destination = path.join(out, `dragon-flight-before-after-${view}.png`);
    await sharp({ create: { width, height, channels: 4, background: "#0c0f12" } })
      .composite([
        { input: title, left: 0, top: 0 },
        { input: young, left: 0, top: header },
        { input: mature, left: 880, top: header },
      ])
      .png()
      .toFile(destination);
    combinedFiles.push(destination);
  }
  const [youngPortraits, maturePortraits] = await Promise.all([
    readFile(path.join(out, "stage-2-portraits", "blockwild-creatures.png")),
    readFile(path.join(out, "adult-portraits", "blockwild-creatures.png")),
  ]);
  const portraitWidth = 1_440;
  const portraitHeader = 104;
  const portraitHeight = 1_960 + portraitHeader;
  const portraitTitle = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${portraitWidth}" height="${portraitHeader}">
    <rect width="100%" height="100%" fill="#0b100e"/>
    <text x="28" y="45" fill="#f0c96f" font-family="system-ui,sans-serif" font-size="30" font-weight="900">DRAGON FLIGHT ARTICULATION · BEFORE / AFTER</text>
    <text x="28" y="76" fill="#91a398" font-family="system-ui,sans-serif" font-size="15">Stage II fledglings at left · mature dragons at right · clean production three-quarter portraits</text>
    <line x1="720" y1="12" x2="720" y2="96" stroke="#405648" stroke-width="2"/>
  </svg>`);
  const portraitDestination = path.join(out, "dragon-flight-before-after-portraits.png");
  await sharp({ create: { width: portraitWidth, height: portraitHeight, channels: 4, background: "#0c0f12" } })
    .composite([
      { input: portraitTitle, left: 0, top: 0 },
      { input: youngPortraits, left: 0, top: portraitHeader },
      { input: maturePortraits, left: 720, top: portraitHeader },
    ])
    .png()
    .toFile(portraitDestination);
  combinedFiles.push(portraitDestination);
} catch (error) {
  process.stderr.write(`Combined PNG rendering unavailable (${error instanceof Error ? error.message : String(error)}). Individual PNG/SVG audits remain available.\n`);
}

const manifestPath = path.join(out, "dragon-flight-pose-audit.json");
await writeFile(manifestPath, `${JSON.stringify({
  version: 1,
  auditTime,
  stages: [2, 5],
  species: DRAGON_ORDER,
  legacy: { frontHip: 0.72, rearHip: -0.42, knee: 0.84, claw: -0.52 },
  files: [
    ...stageTwo.files,
    ...adults.files,
    ...stageTwoPortraits.files,
    ...adultPortraits.files,
    ...stageTwoSidePortraits.files,
    ...adultSidePortraits.files,
    ...combinedFiles,
  ],
}, null, 2)}\n`, "utf8");

process.stdout.write(`${JSON.stringify({ status: "rendered", out, combinedFiles, manifestPath }, null, 2)}\n`);
