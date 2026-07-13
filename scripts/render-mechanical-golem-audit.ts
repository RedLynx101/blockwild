import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as THREE from "three";
import { applyWildlifePose, createMobVisual, type MobVisual } from "../app/game/mob-models.ts";
import { MOB_DEFS, type CoreMobKind } from "../app/game/mobs.ts";
import { objectToInspectionSpec, renderModelInspection, renderModelPortraits } from "./render-models.ts";

type MechanicalKind = "clockwork-hound-golem" | "webspinner-golem";
type AuditPose = "idle" | "walk" | "attack";

const out = path.resolve(process.argv[2] ?? "output/mechanical-golem-model-progress");
const kinds = ["clockwork-hound-golem", "webspinner-golem"] as const satisfies readonly MechanicalKind[];
const poses = ["idle", "walk", "attack"] as const satisfies readonly AuditPose[];
const poseInput: Readonly<Record<AuditPose, { time: number; travel: number; alert: number; gait: number }>> = {
  idle: { time: 0.42, travel: 0, alert: 0, gait: 0 },
  walk: { time: 1.08, travel: 1, alert: 0, gait: 1.12 },
  attack: { time: 1.36, travel: 0.28, alert: 1, gait: 0.36 },
};

function applyRuntimeScale(model: MobVisual, kind: MechanicalKind) {
  model.group.updateMatrixWorld(true);
  const unscaled = new THREE.Box3().setFromObject(model.visual);
  const authoredScale = Math.max(0.1, Math.min(2, Number(model.visual.userData.authoredScale) || 1));
  const baseY = model.visual.position.y;
  model.visual.scale.setScalar(authoredScale);
  model.visual.position.y = baseY + (1 - authoredScale) * (unscaled.min.y - baseY);
  model.group.position.y = MOB_DEFS[kind].footOffset - 0.5;
}

function applyProductionPose(model: MobVisual, kind: MechanicalKind, pose: AuditPose) {
  const input = poseInput[pose];
  for (const leg of model.parts.legs) leg.rotation.x = Math.sin(input.gait + (Number(leg.userData.phase) || 0)) * 0.58;
  for (const arm of model.parts.arms) arm.rotation.x = Math.sin(input.gait + (Number(arm.userData.phase) || 0)) * 0.5 + (pose === "attack" ? -1.1 : 0);
  applyWildlifePose(model.visual, kind as CoreMobKind, input.time, input.travel, input.alert);
}

function makeSpec(kind: MechanicalKind, pose: AuditPose, index: number) {
  const model = createMobVisual(kind, -24_000 - index);
  applyRuntimeScale(model, kind);
  applyProductionPose(model, kind, pose);
  // Keep the runtime placement outside the inspected root. objectToInspectionSpec
  // intentionally removes its root transform, so passing model.group directly
  // would erase the actual foot-offset translation and report false penetration.
  const runtime = new THREE.Group();
  runtime.name = `${kind}-${pose}-runtime-ground-audit`;
  runtime.add(model.group);
  runtime.updateMatrixWorld(true);
  return objectToInspectionSpec(runtime, {
    id: `${kind}-${pose}`,
    label: `${MOB_DEFS[kind].name} · ${pose.toUpperCase()}`,
    category: "mob",
    front: "-z",
    groundY: 0,
    inspection: { source: "MobVisual", mob: kind },
  });
}

const specs = kinds.flatMap((kind, kindIndex) => poses.map((pose, poseIndex) => makeSpec(kind, pose, kindIndex * poses.length + poseIndex)));
const [frontThreeQuarter, trueSide, groundAudit] = await Promise.all([
  renderModelPortraits({ out: path.join(out, "front-three-quarter"), columns: 3, specs, png: true }),
  renderModelPortraits({ out: path.join(out, "true-side"), columns: 3, specs, png: true, view: "side" }),
  renderModelInspection({ out: path.join(out, "ground-contact"), columns: 3, views: ["side"], specs }),
]);

const combinedFiles: string[] = [];
try {
  const sharp = (await import("sharp")).default;
  const [front, side] = await Promise.all([
    readFile(path.join(out, "front-three-quarter", "blockwild-creatures.png")),
    readFile(path.join(out, "true-side", "blockwild-creatures.png")),
  ]);
  const [frontMeta, sideMeta] = await Promise.all([sharp(front).metadata(), sharp(side).metadata()]);
  const frontWidth = frontMeta.width ?? 1_080;
  const sideWidth = sideMeta.width ?? 1_080;
  const contentHeight = Math.max(frontMeta.height ?? 720, sideMeta.height ?? 720);
  const headerHeight = 112;
  const width = frontWidth + sideWidth;
  const title = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${headerHeight}">
    <rect width="100%" height="100%" fill="#0b100e"/>
    <text x="30" y="44" fill="#e3bd6b" font-family="system-ui,sans-serif" font-size="29" font-weight="900">DWARVEN COMPANION AUTOMATA · PRODUCTION POSE AUDIT</text>
    <text x="30" y="77" fill="#9eafa4" font-family="system-ui,sans-serif" font-size="15">Clockwork Hound + Webspinner · idle / walk / attack · front-three-quarter at left · true side at right</text>
    <line x1="${frontWidth}" y1="12" x2="${frontWidth}" y2="100" stroke="#46594d" stroke-width="2"/>
  </svg>`);
  const destination = path.join(out, "dwarven-companion-golems-pose-audit.png");
  await sharp({ create: { width, height: headerHeight + contentHeight, channels: 4, background: "#0c100e" } })
    .composite([
      { input: title, left: 0, top: 0 },
      { input: front, left: 0, top: headerHeight },
      { input: side, left: frontWidth, top: headerHeight },
    ])
    .png()
    .toFile(destination);
  combinedFiles.push(destination);
} catch (error) {
  process.stderr.write(`Combined audit unavailable (${error instanceof Error ? error.message : String(error)}). Individual deterministic sheets remain available.\n`);
}

const manifestPath = path.join(out, "mechanical-golem-model-audit.json");
await writeFile(manifestPath, `${JSON.stringify({
  version: 1,
  source: "createMobVisual + applyWildlifePose",
  species: kinds,
  poses,
  views: ["front-three-quarter", "true-side"],
  specs: specs.map((spec) => ({ id: spec.id, boxes: spec.boxes.length })),
  files: [...frontThreeQuarter.files, ...trueSide.files, ...groundAudit.files, ...combinedFiles],
}, null, 2)}\n`, "utf8");

process.stdout.write(`${JSON.stringify({ status: "rendered", out, combinedFiles, manifestPath }, null, 2)}\n`);
