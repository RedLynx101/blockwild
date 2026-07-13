import path from "node:path";
import { access, readFile } from "node:fs/promises";
import { applyDragonPose, createMobVisual, type DragonAnimationMode } from "../app/game/mob-models.ts";
import { DRAGON_ORDER, MOB_DEFS } from "../app/game/mobs.ts";
import {
  createDragonLifeStageInspectionSpecs,
  objectToInspectionSpec,
  renderModelInspection,
  renderModelPortraits,
} from "./render-models.ts";

const out = path.resolve(process.argv[2] ?? "output/v1-4-5-dragon-rebuild");
const stageOne = createDragonLifeStageInspectionSpecs(1);
const stageTwo = createDragonLifeStageInspectionSpecs(2);
const adults = createDragonLifeStageInspectionSpecs(5);
const poseSpecs = DRAGON_ORDER.flatMap((kind, dragonIndex) => ([
  { mode: "idle" as const, timeSeconds: 0.7, attackProgress: 0 },
  { mode: "fly" as const, timeSeconds: 1.2, attackProgress: 0 },
  { mode: dragonIndex % 2 ? "melee" as const : "breath" as const, timeSeconds: 1.65, attackProgress: 0.55 },
]).map(({ mode, timeSeconds, attackProgress }, poseIndex) => {
  const model = createMobVisual(kind, -15_100 - dragonIndex * 10 - poseIndex);
  applyDragonPose(model.visual, { timeSeconds, stage: 5, mode, movement: mode === "idle" ? 0 : 0.7, attackProgress });
  return objectToInspectionSpec(model.group, {
    id: `${kind}-${mode}-pose`,
    label: `${MOB_DEFS[kind].name} · ${mode.toUpperCase()}`,
    category: "mob",
    front: "-z",
    inspection: { source: "MobVisual", mob: kind },
  });
}));
const equipmentSpecs = DRAGON_ORDER.map((kind, index) => {
  const model = createMobVisual(kind, -15_900 - index);
  applyDragonPose(model.visual, {
    timeSeconds: 1.4,
    stage: 5,
    mode: "idle" satisfies DragonAnimationMode,
    equipment: { saddle: true, leftChest: true, rightChest: true, armor: { head: true, neck: true, body: true, tail: true } },
  });
  return objectToInspectionSpec(model.group, {
    id: `${kind}-equipped`,
    label: `${MOB_DEFS[kind].name} · Tack + Armor`,
    category: "mob",
    front: "-z",
    inspection: { source: "MobVisual", mob: kind },
  });
});

const results = {
  stageOne: await renderModelInspection({ out: path.join(out, "stage-1"), columns: 3, views: ["iso", "front", "side"], specs: stageOne }),
  stageTwo: await renderModelInspection({ out: path.join(out, "stage-2"), columns: 3, views: ["iso", "front", "side"], specs: stageTwo }),
  adults: await renderModelInspection({ out: path.join(out, "adults"), columns: 3, views: ["iso", "front", "side"], specs: adults }),
  poses: await renderModelInspection({ out: path.join(out, "poses"), columns: 3, views: ["iso", "side"], specs: poseSpecs }),
  equipment: await renderModelInspection({ out: path.join(out, "equipment"), columns: 3, views: ["iso", "side"], specs: equipmentSpecs }),
  equipmentPortraits: await renderModelPortraits({ out: path.join(out, "equipment-portraits"), columns: 3, specs: equipmentSpecs, png: true }),
  portraits: await renderModelPortraits({ out: path.join(out, "portraits"), columns: 3, specs: [...stageOne, ...stageTwo, ...adults], png: true }),
};

let comparisonPath: string | null = null;
try {
  const sharp = (await import("sharp")).default;
  const width = 2100;
  const height = 1110;
  const cellWidth = 700;
  const cellHeight = 500;
  const top = 100;
  const composites: Array<{ input: Buffer; left: number; top: number }> = [];
  const labels: string[] = [
    `<rect width="${width}" height="${height}" fill="#0d1210"/>`,
    `<text x="36" y="54" fill="#f0c96f" font-family="system-ui,sans-serif" font-size="34" font-weight="900">DRAGON REBUILD · BEFORE / AFTER</text>`,
    `<text x="36" y="82" fill="#91a398" font-family="system-ui,sans-serif" font-size="16">Deployed v1.4.4 portrait at left · authored v1.4.5 mature rig at right · Ice retained as the visual control</text>`,
  ];
  for (const [index, kind] of DRAGON_ORDER.entries()) {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = column * cellWidth;
    const y = top + row * cellHeight;
    const beforePath = path.join(out, "before", `${kind}-before.svg`);
    const afterPath = path.join(out, "portraits", `${kind}-stage-5.png`);
    await access(beforePath);
    const [before, after] = await Promise.all([readFile(beforePath), readFile(afterPath)]);
    composites.push({ input: await sharp(before).resize(315, 330, { fit: "contain", background: "#151c18" }).flatten({ background: "#151c18" }).png().toBuffer(), left: x + 15, top: y + 76 });
    composites.push({ input: await sharp(after).resize(315, 330, { fit: "contain", background: "#151c18" }).flatten({ background: "#151c18" }).png().toBuffer(), left: x + 368, top: y + 76 });
    labels.push(
      `<rect x="${x + 10}" y="${y + 8}" width="${cellWidth - 20}" height="${cellHeight - 18}" rx="20" fill="#151c18" stroke="#405648" stroke-width="3"/>`,
      `<text x="${x + 30}" y="${y + 48}" fill="#f4ead0" font-family="system-ui,sans-serif" font-size="25" font-weight="850">${MOB_DEFS[kind].name}</text>`,
      `<text x="${x + 72}" y="${y + 438}" fill="#98a79e" font-family="ui-monospace,monospace" font-size="16" font-weight="700">BEFORE</text>`,
      `<text x="${x + 470}" y="${y + 438}" fill="#f0c96f" font-family="ui-monospace,monospace" font-size="16" font-weight="800">AFTER</text>`,
    );
  }
  composites.unshift({ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${labels.join("")}</svg>`), left: 0, top: 0 });
  comparisonPath = path.join(out, "dragon-before-after.png");
  await sharp({ create: { width, height, channels: 4, background: "#0d1210" } }).composite(composites).png().toFile(comparisonPath);
} catch {
  // The production audit remains useful when the optional retained v1.4.4
  // portraits are absent (for example in a fresh source archive).
}

process.stdout.write(`${JSON.stringify({
  status: "rendered",
  out,
  boxes: {
    stageOne: stageOne.map((spec) => ({ id: spec.id, boxes: spec.boxes.length })),
    stageTwo: stageTwo.map((spec) => ({ id: spec.id, boxes: spec.boxes.length })),
    adults: adults.map((spec) => ({ id: spec.id, boxes: spec.boxes.length })),
  },
  files: Object.values(results).flatMap((result) => result.files),
  comparisonPath,
}, null, 2)}\n`);
