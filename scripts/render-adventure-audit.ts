import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import {
  ADVENTURE_DUNGEON_ARCHETYPES,
  ADVENTURE_POI_ARCHETYPES,
  planAdventureStructure,
  type AdventureStructurePlan,
} from "../app/game/adventure-content.ts";
import { BLOCKS, Item, ITEMS, type ItemCode } from "../app/game/data.ts";
import { createAvatarHeldItemModel } from "../app/game/held-items.ts";
import { createMobVisual } from "../app/game/mob-models.ts";
import { ADVENTURE_MOB_ORDER, MOB_DEFS } from "../app/game/mobs.ts";
import {
  objectToInspectionSpec,
  renderModelInspection,
  renderModelPortraits,
  type InspectionModelSpec,
} from "./render-models.ts";

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function dispose(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) material.dispose();
  });
}

function mobSpec(kind: (typeof ADVENTURE_MOB_ORDER)[number]): InspectionModelSpec {
  const model = createMobVisual(kind, -1300);
  const runtime = new THREE.Group();
  runtime.add(model.group);
  if (!MOB_DEFS[kind].flying && !MOB_DEFS[kind].aquatic) model.group.position.y = MOB_DEFS[kind].footOffset - 0.5;
  const spec = objectToInspectionSpec(runtime, {
    id: `v13-${kind}`,
    label: MOB_DEFS[kind].name,
    category: "mob",
    front: "-z",
    ...(!MOB_DEFS[kind].flying && !MOB_DEFS[kind].aquatic ? { groundY: 0 } : {}),
    inspection: { source: "MobVisual", mob: kind },
  });
  dispose(runtime);
  return spec;
}

function legendarySpec(item: ItemCode): InspectionModelSpec {
  const held = createAvatarHeldItemModel(item);
  if (!held) throw new Error(`Missing held model for ${ITEMS[item].name}.`);
  const spec = objectToInspectionSpec(held, {
    id: `v13-legendary-${item}`,
    label: ITEMS[item].name,
    category: "utility",
    front: "-z",
    inspection: { source: "model-specs" },
  });
  dispose(held);
  return spec;
}

function structurePlanSvg(plan: AdventureStructurePlan, tileX: number, tileY: number, width: number, height: number) {
  const underground = ADVENTURE_DUNGEON_ARCHETYPES.some((entry) => entry.kind === plan.kind && entry.underground);
  const eligible = underground ? plan.placements.filter((placement) => placement.y <= plan.origin.y - 10) : plan.placements;
  const top = new Map<string, (typeof eligible)[number]>();
  for (const placement of eligible) {
    const key = `${placement.x},${placement.z}`;
    const current = top.get(key);
    if (!current || placement.y > current.y) top.set(key, placement);
  }
  const points = [...top.values()];
  const minX = Math.min(...points.map((point) => point.x), plan.bounds.min.x);
  const maxX = Math.max(...points.map((point) => point.x), plan.bounds.max.x);
  const minZ = Math.min(...points.map((point) => point.z), plan.bounds.min.z);
  const maxZ = Math.max(...points.map((point) => point.z), plan.bounds.max.z);
  const drawX = 18;
  const drawY = 74;
  const drawWidth = width - 36;
  const drawHeight = height - 102;
  const scale = Math.min(drawWidth / Math.max(1, maxX - minX + 1), drawHeight / Math.max(1, maxZ - minZ + 1));
  const cellX = (x: number) => drawX + (x - minX) * scale;
  const cellY = (z: number) => drawY + (z - minZ) * scale;
  const blocks = points
    .sort((a, b) => a.z - b.z || a.x - b.x)
    .map((placement) => `<rect x="${cellX(placement.x).toFixed(2)}" y="${cellY(placement.z).toFixed(2)}" width="${Math.max(1.2, scale + 0.25).toFixed(2)}" height="${Math.max(1.2, scale + 0.25).toFixed(2)}" fill="${BLOCKS[placement.block]?.color ?? "#777"}" opacity="${placement.block === 0 ? 0.08 : 0.9}"/>`)
    .join("");
  const rooms = plan.rooms.map((room) => {
    const x = cellX(room.bounds.min.x);
    const y = cellY(room.bounds.min.z);
    const roomWidth = Math.max(2, (room.bounds.max.x - room.bounds.min.x + 1) * scale);
    const roomHeight = Math.max(2, (room.bounds.max.z - room.bounds.min.z + 1) * scale);
    return `<rect x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${roomWidth.toFixed(2)}" height="${roomHeight.toFixed(2)}" fill="none" stroke="#ffdd82" stroke-width="2" stroke-dasharray="5 4"/><text x="${(x + 5).toFixed(2)}" y="${(y + 13).toFixed(2)}" fill="#fff0bd" font-size="10" font-weight="800">${room.stage}</text>`;
  }).join("");
  const markers = plan.markers.map((marker) => {
    const color = marker.type === "spawn" ? "#ef6d64" : marker.type === "chest" ? "#f1c75a" : "#74e3d1";
    const radius = marker.type === "landmark" ? 5 : 3.5;
    return `<circle cx="${(cellX(marker.position.x) + scale / 2).toFixed(2)}" cy="${(cellY(marker.position.z) + scale / 2).toFixed(2)}" r="${radius}" fill="${color}" stroke="#101713" stroke-width="1.4"/>`;
  }).join("");
  const archetype = [...ADVENTURE_POI_ARCHETYPES, ...ADVENTURE_DUNGEON_ARCHETYPES].find((entry) => entry.kind === plan.kind)!;
  return `<g transform="translate(${tileX} ${tileY})">
    <rect x="5" y="5" width="${width - 10}" height="${height - 10}" rx="14" fill="#141a17" stroke="#405047" stroke-width="2"/>
    <text x="18" y="31" fill="#f2d27a" font-size="17" font-weight="900">${escapeXml(archetype.name)}</text>
    <text x="18" y="51" fill="#96aa9d" font-size="10" font-weight="800" letter-spacing="1.1">${archetype.scale.toUpperCase()} · ${plan.placements.length} BLOCKS · ${plan.markers.filter((marker) => marker.type === "spawn").length} ENCOUNTERS</text>
    ${blocks}${rooms}${markers}
  </g>`;
}

function renderStructureAtlas(plans: readonly AdventureStructurePlan[]) {
  const columns = 5;
  const tileWidth = 380;
  const tileHeight = 340;
  const rows = Math.ceil(plans.length / columns);
  const header = 100;
  const width = columns * tileWidth;
  const height = header + rows * tileHeight;
  const tiles = plans.map((plan, index) => structurePlanSvg(plan, (index % columns) * tileWidth, header + Math.floor(index / columns) * tileHeight, tileWidth, tileHeight)).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#0b100e"/>
  <text x="28" y="43" fill="#f3ca6a" font-family="ui-sans-serif, system-ui" font-size="28" font-weight="900">BLOCKWILD V1.3 · ADVENTURE BLUEPRINT ATLAS</text>
  <text x="28" y="71" fill="#9bad9f" font-family="ui-monospace, monospace" font-size="13">20 deterministic landmarks · 5 multi-stage dungeons · red encounter · gold chest · cyan map heart</text>
  ${tiles}
</svg>`;
}

async function writePng(svg: string, destination: string) {
  try {
    const sharp = (await import("sharp")).default;
    await sharp(Buffer.from(svg)).png().toFile(destination);
    return true;
  } catch {
    return false;
  }
}

export async function renderAdventureAudit(out = path.resolve("output/v1-3-adventure")) {
  await mkdir(out, { recursive: true });
  const specs = [
    ...ADVENTURE_MOB_ORDER.map(mobSpec),
    legendarySpec(Item.DawnthreadSaber),
    legendarySpec(Item.DeepdelversPromise),
    legendarySpec(Item.BriarheartCrook),
  ];
  const modelAudit = await renderModelInspection({ out: path.join(out, "models-and-heirlooms"), columns: 3, views: ["iso", "front", "side"], specs });
  const portraits = await renderModelPortraits({ out: path.join(out, "portraits"), columns: 3, specs: specs.slice(0, ADVENTURE_MOB_ORDER.length), png: true });
  const archetypes = [...ADVENTURE_POI_ARCHETYPES, ...ADVENTURE_DUNGEON_ARCHETYPES];
  const plans = archetypes.map((entry, index) => planAdventureStructure(entry.kind, { x: 0, y: 52 + index % 3, z: 0 }, `v13-visual-${entry.kind}`));
  const atlas = renderStructureAtlas(plans);
  const atlasSvg = path.join(out, "adventure-blueprint-atlas.svg");
  const atlasPng = path.join(out, "adventure-blueprint-atlas.png");
  await writeFile(atlasSvg, atlas, "utf8");
  await writePng(atlas, atlasPng);
  const manifest = {
    version: 1,
    poiCount: ADVENTURE_POI_ARCHETYPES.length,
    dungeonCount: ADVENTURE_DUNGEON_ARCHETYPES.length,
    undergroundDungeons: ADVENTURE_DUNGEON_ARCHETYPES.filter((entry) => entry.underground).length,
    abovegroundDungeons: ADVENTURE_DUNGEON_ARCHETYPES.filter((entry) => !entry.underground).length,
    mobCount: ADVENTURE_MOB_ORDER.length,
    legendaryCount: 3,
    structures: plans.map((plan) => ({ kind: plan.kind, blocks: plan.placements.length, rooms: plan.rooms.length, markers: plan.markers.length })),
    modelManifest: modelAudit.manifestPath,
    portraitSheet: portraits.sheetPath,
    structureAtlas: atlasSvg,
  };
  const manifestPath = path.join(out, "adventure-audit-manifest.json");
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return { manifestPath, atlasSvg, atlasPng, modelAudit, portraits };
}

async function main() {
  const output = await renderAdventureAudit(path.resolve(process.argv[2] ?? "output/v1-3-adventure"));
  process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
