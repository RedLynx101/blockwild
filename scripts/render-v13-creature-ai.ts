import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { chooseBirdFlightRoute, createBirdFlightRouteState } from "../app/game/creature-pathing.ts";
import { createMobVisual } from "../app/game/mob-models.ts";
import { MOB_DEFS, RABBIT_ORDER } from "../app/game/mobs.ts";
import { objectToInspectionSpec, renderModelInspection, renderModelPortrait, renderModelPortraits, type InspectionModelSpec } from "./render-models.ts";

function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

function rabbitSpec(kind: (typeof RABBIT_ORDER)[number], audit: Array<Record<string, unknown>>): InspectionModelSpec {
  const model = createMobVisual(kind, -1300 - RABBIT_ORDER.indexOf(kind));
  model.group.position.y = MOB_DEFS[kind].footOffset - 0.5;
  model.group.updateMatrixWorld(true);
  const head = model.visual.getObjectByName(`${kind}-head`)!;
  const headBounds = new THREE.Box3().setFromObject(head);
  const ears = (["left", "right"] as const).map((side) => {
    const pivot = model.visual.getObjectByName(`${kind}-${side}-ear-pivot`)!;
    const root = model.visual.getObjectByName(`${kind}-${side}-ear-root`)!;
    const shaft = model.visual.getObjectByName(`${kind}-${side}-ear`)!;
    const rootBounds = new THREE.Box3().setFromObject(root);
    const shaftBounds = new THREE.Box3().setFromObject(shaft);
    return {
      side,
      crownAttached: headBounds.intersectsBox(rootBounds),
      shaftAttached: rootBounds.intersectsBox(shaftBounds),
      articulatedTip: kind !== "frost-hare" || model.visual.getObjectByName(`${kind}-${side}-ear-tip`)?.parent === pivot,
    };
  });
  const runtime = new THREE.Group();
  runtime.name = `${kind}-v13-ear-ground-audit`;
  runtime.add(model.group);
  const spec = objectToInspectionSpec(runtime, {
    id: `v13-${kind}`,
    label: `${MOB_DEFS[kind].name} - attached ears`,
    category: "mob",
    front: "-z",
    groundY: 0,
    inspection: { source: "MobVisual", mob: kind },
  });
  audit.push({ kind, ears });
  disposeObject(runtime);
  return spec;
}

function simulateBirdAvoidance() {
  let x = 0;
  let z = 0;
  let state = createBirdFlightRouteState(0);
  const obstacle = { x: 3.35, z: 0, radius: 1.08 };
  const points = [{ x, z }];
  let probes = 0;
  let maximumFrameProbes = 0;
  for (let frame = 0; frame < 105; frame += 1) {
    const desired = Math.atan2(-z, 8.5 - x);
    const decision = chooseBirdFlightRoute({
      state,
      dt: 1 / 30,
      desiredHeading: desired,
      mobId: 37,
      flying: true,
      probe: (heading) => {
        const clear = [0.38, 0.7, 1].every((progress) => {
          const sampleX = x + Math.cos(heading) * 1.25 * progress;
          const sampleZ = z + Math.sin(heading) * 1.25 * progress;
          return Math.hypot(sampleX - obstacle.x, sampleZ - obstacle.z) > obstacle.radius;
        });
        return { clear, clearance: clear ? 1 : 0 };
      },
    });
    state = decision.state;
    probes += decision.probes;
    maximumFrameProbes = Math.max(maximumFrameProbes, decision.probes);
    if (!decision.blocked) {
      x += Math.cos(decision.heading) * 0.105;
      z += Math.sin(decision.heading) * 0.105;
    }
    points.push({ x, z });
  }
  const signs = new Set(points.slice(12, 58).map((point) => Math.sign(point.z)).filter(Boolean));
  return { obstacle, points, probes, maximumFrameProbes, stableSide: signs.size === 1, finalDistance: Math.hypot(8.5 - x, z) };
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function main() {
  const out = path.resolve(process.argv[2] ?? "output/v1-3-creature-ai");
  await mkdir(out, { recursive: true });
  const attachmentAudit: Array<Record<string, unknown>> = [];
  const specs = RABBIT_ORDER.map((kind) => rabbitSpec(kind, attachmentAudit));
  const inspection = await renderModelInspection({ out, columns: 4, views: ["iso", "front", "side"], specs });
  const portraits = await renderModelPortraits({ out: path.join(out, "portraits"), columns: 4, specs, png: true });
  const deployedPortraits: string[] = [];
  if (process.argv.includes("--deploy-portraits")) {
    const publicPortraitRoot = path.resolve("public/creatures");
    await mkdir(publicPortraitRoot, { recursive: true });
    for (const [index, kind] of RABBIT_ORDER.entries()) {
      const destination = path.join(publicPortraitRoot, `${kind}.svg`);
      await writeFile(destination, renderModelPortrait({ ...specs[index], id: kind, label: MOB_DEFS[kind].name }), "utf8");
      deployedPortraits.push(destination);
    }
  }
  const route = simulateBirdAvoidance();
  const modelSheet = await readFile(path.join(out, "blockwild-models-iso.svg"), "utf8");
  const embeddedModels = Buffer.from(modelSheet, "utf8").toString("base64");
  const plotOriginY = 720;
  const plotVerticalScale = 82;
  const plot = route.points.map((point) => `${145 + point.x * 98},${plotOriginY + point.z * plotVerticalScale}`).join(" ");
  const end = route.points.at(-1)!;
  const report = {
    version: 1,
    rabbits: attachmentAudit,
    birdAvoidance: {
      fixedCandidateBudget: 15,
      maximumFrameProbes: route.maximumFrameProbes,
      totalProbesOver105Frames: route.probes,
      stableSide: route.stableSide,
      finalDistance: Number(route.finalDistance.toFixed(4)),
    },
  };
  await writeFile(path.join(out, "v13-creature-ai-audit.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const auditSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="930" viewBox="0 0 1200 930">
  <rect width="1200" height="930" fill="#0d1412"/>
  <text x="42" y="48" fill="#f1c86e" font-family="ui-sans-serif,system-ui" font-size="29" font-weight="900">BLOCKWILD V1.3 - CREATURE AI &amp; ATTACHMENT AUDIT</text>
  <text x="42" y="76" fill="#a8b7ae" font-family="ui-sans-serif,system-ui" font-size="14">Production rabbit rigs above; deterministic bounded bird avoidance below</text>
  <rect x="32" y="98" width="1136" height="446" rx="22" fill="#151e1a" stroke="#40534a" stroke-width="2"/>
  <image href="data:image/svg+xml;base64,${embeddedModels}" x="44" y="110" width="1112" height="422" preserveAspectRatio="xMidYMid meet"/>
  <rect x="32" y="566" width="1136" height="326" rx="22" fill="#151e1a" stroke="#40534a" stroke-width="2"/>
  <text x="56" y="606" fill="#f4eddc" font-family="ui-sans-serif,system-ui" font-size="22" font-weight="800">Emberjay bounded look-ahead - top-down trace</text>
  <line x1="145" y1="${plotOriginY}" x2="978" y2="${plotOriginY}" stroke="#bd7067" stroke-width="3" stroke-dasharray="9 9" opacity="0.6"/>
  <ellipse cx="${145 + route.obstacle.x * 98}" cy="${plotOriginY + route.obstacle.z * plotVerticalScale}" rx="${route.obstacle.radius * 98}" ry="${route.obstacle.radius * plotVerticalScale}" fill="#39533d" stroke="#82a66d" stroke-width="5"/>
  <circle cx="${145 + route.obstacle.x * 98}" cy="${plotOriginY + route.obstacle.z * plotVerticalScale}" r="42" fill="#6a452d"/>
  <polyline points="${plot}" fill="none" stroke="#f4c65e" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="145" cy="${plotOriginY}" r="10" fill="#74d6bc"/>
  <polygon points="${145 + end.x * 98 + 18},${plotOriginY + end.z * plotVerticalScale} ${145 + end.x * 98 - 12},${plotOriginY + end.z * plotVerticalScale - 12} ${145 + end.x * 98 - 12},${plotOriginY + end.z * plotVerticalScale + 12}" fill="#74d6bc"/>
  <text x="56" y="866" fill="#a8b7ae" font-family="ui-monospace,monospace" font-size="15">${escapeXml(`stable side: ${route.stableSide}   max probes/frame: ${route.maximumFrameProbes}/15   total probes: ${route.probes}/105 frames`)}</text>
</svg>`;
  const auditSvgPath = path.join(out, "v13-creature-ai-audit.svg");
  await writeFile(auditSvgPath, auditSvg, "utf8");
  let auditPngPath: string | null = null;
  try {
    const sharp = (await import("sharp")).default;
    auditPngPath = path.join(out, "v13-creature-ai-audit.png");
    await sharp(Buffer.from(auditSvg)).png().toFile(auditPngPath);
  } catch {
    // SVG and JSON remain the canonical deterministic artifacts.
  }
  process.stdout.write(`${JSON.stringify({
    status: "rendered",
    manifest: inspection.manifestPath,
    modelSheets: inspection.files,
    portraits: portraits.files,
    deployedPortraits,
    audit: auditSvgPath,
    auditPng: auditPngPath,
  }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
