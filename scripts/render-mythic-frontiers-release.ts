import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import sharp from "sharp";
import { buildLivingBestiarySheet } from "./render-living-bestiary-showcase";
import { createDragonVariantInspectionSpecs, renderModelInspection, renderModelPortraits } from "./render-models";
import { renderStructureAtlas } from "./render-adventure-audit";
import { MYTHIC_FRONTIER_CREATURE_KINDS } from "../app/game/mythic-creatures";
import { MYTHIC_FRONTIER_SITE_ORDER, MYTHIC_FRONTIER_SITES } from "../app/game/mythic-frontiers";
import { planAdventureStructure, type AdventureStructurePlan } from "../app/game/adventure-content";

async function writeSvgAndPng(svg: string, basePath: string) {
  const svgPath = `${basePath}.svg`; const pngPath = `${basePath}.png`;
  await writeFile(svgPath, svg, "utf8");
  await sharp(Buffer.from(svg)).png().toFile(pngPath);
  return { svg: svgPath, png: pngPath } as const;
}

function cropPlan(plan: AdventureStructurePlan, center: Readonly<{ x: number; y: number; z: number }>, radius: number, suffix: string): AdventureStructurePlan {
  const placements = plan.placements.filter((placement) => Math.abs(placement.x - center.x) <= radius && Math.abs(placement.z - center.z) <= radius);
  const markers = plan.markers.filter((marker) => Math.abs(marker.position.x - center.x) <= radius && Math.abs(marker.position.z - center.z) <= radius);
  const rooms = plan.rooms
    .filter((room) => room.bounds.min.x <= center.x + radius && room.bounds.max.x >= center.x - radius && room.bounds.min.z <= center.z + radius && room.bounds.max.z >= center.z - radius)
    .map((room) => Object.freeze({
      ...room,
      bounds: Object.freeze({
        min: Object.freeze({ ...room.bounds.min, x: Math.max(room.bounds.min.x, center.x - radius), z: Math.max(room.bounds.min.z, center.z - radius) }),
        max: Object.freeze({ ...room.bounds.max, x: Math.min(room.bounds.max.x, center.x + radius), z: Math.min(room.bounds.max.z, center.z + radius) }),
      }),
    }));
  const points = [...placements.map(({ x, y, z }) => ({ x, y, z })), ...markers.map((marker) => marker.position), center];
  return Object.freeze({
    ...plan, id: `${plan.id}:${suffix}`,
    placements: Object.freeze(placements), markers: Object.freeze(markers), rooms: Object.freeze(rooms),
    bounds: Object.freeze({
      min: Object.freeze({ x: Math.min(...points.map((point) => point.x)), y: Math.min(...points.map((point) => point.y)), z: Math.min(...points.map((point) => point.z)) }),
      max: Object.freeze({ x: Math.max(...points.map((point) => point.x)), y: Math.max(...points.map((point) => point.y)), z: Math.max(...points.map((point) => point.z)) }),
    }),
  });
}

export async function renderMythicFrontiersRelease(output = path.resolve("output/mythic-frontiers-release")) {
  const creatureDir = path.join(output, "creatures"); const dragonDir = path.join(output, "dragons"); const siteDir = path.join(output, "sites");
  await Promise.all([mkdir(creatureDir, { recursive: true }), mkdir(dragonDir, { recursive: true }), mkdir(siteDir, { recursive: true })]);
  const creatureViews = [
    { id: "iso", position: new THREE.Vector3(5.4, 3.7, -7.2), target: new THREE.Vector3(0, 1, 0), title: "Mythic Frontiers · Three-Quarter Runtime Models" },
    { id: "front", position: new THREE.Vector3(0, 2.4, -8), target: new THREE.Vector3(0, 1, 0), title: "Mythic Frontiers · Front Runtime Models" },
    { id: "side", position: new THREE.Vector3(8, 2.4, 0), target: new THREE.Vector3(0, 1, 0), title: "Mythic Frontiers · Side Runtime Models" },
  ] as const;
  const creatureOutputs = [];
  for (const view of creatureViews) {
    const sheet = buildLivingBestiarySheet({
      kinds: MYTHIC_FRONTIER_CREATURE_KINDS,
      phase: "after", background: "dark", columns: 5, tileWidth: 380, tileHeight: 350,
      camera: { position: view.position, target: view.target }, title: view.title,
      subtitle: "Fifteen actual gameplay rigs · deterministic pose · authored geometry, materials, and localized magic",
    });
    creatureOutputs.push({ view: view.id, ...(await writeSvgAndPng(sheet.svg, path.join(creatureDir, `mythic-creatures-${view.id}`))), totals: sheet.totals });
  }

  const dragonSpecs = createDragonVariantInspectionSpecs();
  const dragons = await renderModelInspection({ out: dragonDir, columns: 4, views: ["iso", "front", "side"], specs: dragonSpecs });
  const dragonPortraits = [];
  for (const view of ["iso", "front", "side"] as const) {
    dragonPortraits.push({ view, ...(await renderModelPortraits({
      out: path.join(dragonDir, `portraits-${view}`), columns: 4, specs: dragonSpecs, png: true, view,
    })) });
  }

  const plans = MYTHIC_FRONTIER_SITE_ORDER.map((siteId, index) => {
    const definition = MYTHIC_FRONTIER_SITES[siteId];
    return planAdventureStructure(definition.structureKind as never, { x: 0, y: 72 + index % 2, z: 0 }, `mythic-release:${siteId}`);
  });
  const siteOutputs = [];
  siteOutputs.push({ view: "overhead", ...(await writeSvgAndPng(renderStructureAtlas(plans, {
    title: "BLOCKWILD · MYTHIC FRONTIERS · COMPLETE SITE ATLAS",
    subtitle: "10 landmark POIs · 5 multi-stage dungeons · rooms, entrances, encounter anchors, and site-specific silhouettes",
  }), path.join(siteDir, "mythic-sites-overhead"))) });
  const crops = [
    { id: "approach", radius: 16, marker: (plan: AdventureStructurePlan) => plan.markers.find((entry) => entry.type === "landmark" && entry.tag.startsWith("mythic-silhouette:"))?.position ?? plan.origin },
    { id: "entrance", radius: 11, marker: (plan: AdventureStructurePlan) => plan.markers.find((entry) => entry.type === "landmark" && /entrance|threshold/u.test(entry.tag))?.position ?? plan.origin },
    { id: "core", radius: 9, marker: (plan: AdventureStructurePlan) => plan.markers.find((entry) => entry.type === "spawn" && entry.tags?.includes("persistent-lair"))?.position ?? plan.origin },
  ] as const;
  for (const crop of crops) {
    const cropped = plans.map((plan) => cropPlan(plan, crop.marker(plan), crop.radius, crop.id));
    siteOutputs.push({ view: crop.id, ...(await writeSvgAndPng(renderStructureAtlas(cropped, {
      title: `BLOCKWILD · MYTHIC FRONTIERS · ${crop.id.toUpperCase()} AUDIT`,
      subtitle: `${crop.id} crops for every deterministic site · gold rooms · red resident · cyan landmark and return-route anchors`,
    }), path.join(siteDir, `mythic-sites-${crop.id}`))) });
  }

  const manifest = Object.freeze({
    version: 1, generatedFrom: "actual runtime Three.js creature and dragon rigs plus deterministic structure plans",
    creatures: creatureOutputs, dragons: { count: dragonSpecs.length, manifest: dragons.manifestPath, outputs: dragons.files, portraits: dragonPortraits },
    sites: { count: plans.length, outputs: siteOutputs, structures: plans.map((plan) => ({ kind: plan.kind, blocks: plan.placements.length, rooms: plan.rooms.length, markers: plan.markers.length })) },
  });
  const manifestPath = path.join(output, "release-showcase-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { output, manifestPath, creatureOutputs, dragons, dragonPortraits, siteOutputs } as const;
}

async function main() {
  process.stdout.write(`${JSON.stringify(await renderMythicFrontiersRelease(path.resolve(process.argv[2] ?? "output/mythic-frontiers-release")), null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
