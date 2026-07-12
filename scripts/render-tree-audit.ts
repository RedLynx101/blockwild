import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { BlockId } from "../app/game/data.ts";
import { planFullTree, treeLogsAreFaceConnected, type TreeForm, type TreePlanBlock } from "../app/game/ecology.ts";
import { treePlanIsFaceConnected } from "../app/game/dragon-world.ts";

const FORMS: readonly TreeForm[] = ["rounded", "layered", "windswept", "ancient"];
const TILE_WIDTH = 430;
const TILE_HEIGHT = 460;
const CUBE_X = 13.2;
const CUBE_Y = 6.6;
const CUBE_HEIGHT = 13.4;

const xml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const shade = (color: string, amount: number) => {
  const channels = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
  return `#${channels.map((channel) => Math.max(0, Math.min(255, Math.round(channel + amount))).toString(16).padStart(2, "0")).join("")}`;
};

function cube(block: TreePlanBlock, originX: number, originY: number, style: Readonly<{ base?: string; opacity?: number; stroke?: string }> = {}) {
  const x = block.x;
  const y = block.y;
  const z = block.z;
  const px = originX + (x - z) * CUBE_X;
  const py = originY + (x + z) * CUBE_Y - y * CUBE_HEIGHT;
  const leafy = block.block === BlockId.WildwoodLeaves;
  const base = style.base ?? (leafy ? "#4f8f48" : "#765033");
  const opacity = style.opacity ?? (leafy ? 0.84 : 1);
  const top = `${px},${py - CUBE_HEIGHT} ${px + CUBE_X},${py - CUBE_HEIGHT + CUBE_Y} ${px},${py - CUBE_HEIGHT + CUBE_Y * 2} ${px - CUBE_X},${py - CUBE_HEIGHT + CUBE_Y}`;
  const left = `${px - CUBE_X},${py - CUBE_HEIGHT + CUBE_Y} ${px},${py - CUBE_HEIGHT + CUBE_Y * 2} ${px},${py + CUBE_Y * 2} ${px - CUBE_X},${py + CUBE_Y}`;
  const right = `${px},${py - CUBE_HEIGHT + CUBE_Y * 2} ${px + CUBE_X},${py - CUBE_HEIGHT + CUBE_Y} ${px + CUBE_X},${py + CUBE_Y} ${px},${py + CUBE_Y * 2}`;
  return `<g opacity="${opacity}" stroke="${style.stroke ?? (leafy ? "#2d6536" : "#49301f")}" stroke-width=".55" stroke-linejoin="round">
    <polygon points="${left}" fill="${shade(base, -18)}"/>
    <polygon points="${right}" fill="${shade(base, -33)}"/>
    <polygon points="${top}" fill="${shade(base, 16)}"/>
  </g>`;
}

function renderTree(form: TreeForm, tileIndex: number) {
  const tileX = tileIndex * TILE_WIDTH;
  const plan = planFullTree(`V1-TREE-AUDIT-${form}`, { x: 0, y: 0, z: 0 }, form, BlockId.WildwoodLog, BlockId.WildwoodLeaves, { groundYAt: () => -1, crownFullness: 0.94 });
  const sorted = [...plan].sort((left, right) => (left.x + left.z) - (right.x + right.z) || left.y - right.y || left.x - right.x);
  const logs = plan.filter((block) => block.block === BlockId.WildwoodLog).length;
  const leaves = plan.length - logs;
  const originX = tileX + TILE_WIDTH / 2;
  const originY = TILE_HEIGHT - 94;
  return `<g>
    <rect x="${tileX + 8}" y="8" width="${TILE_WIDTH - 16}" height="${TILE_HEIGHT - 16}" rx="18" fill="#edf0dd" stroke="#7b6643" stroke-width="3"/>
    <path d="M${tileX + 24} 70 H${tileX + TILE_WIDTH - 24}" stroke="#c8b889" stroke-width="2"/>
    ${sorted.map((block) => cube(block, originX, originY)).join("\n")}
    <text x="${originX}" y="42" text-anchor="middle" fill="#2b2418" font-family="Georgia,serif" font-size="25" font-weight="700">${xml(form[0].toUpperCase() + form.slice(1))}</text>
    <text x="${originX}" y="${TILE_HEIGHT - 46}" text-anchor="middle" fill="#4c4434" font-family="ui-monospace,monospace" font-size="13">${logs} connected logs · ${leaves} attached leaves</text>
    <text x="${originX}" y="${TILE_HEIGHT - 26}" text-anchor="middle" fill="#2d6a3e" font-family="ui-monospace,monospace" font-size="12">${treeLogsAreFaceConnected(plan, BlockId.WildwoodLog) && treePlanIsFaceConnected(plan, { x: 0, y: 0, z: 0 }) ? "ROOTED / FACE-CONNECTED" : "TOPOLOGY ERROR"}</text>
  </g>`;
}

const width = TILE_WIDTH * FORMS.length;
const height = TILE_HEIGHT;
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title description">
  <title id="title">Blockwild v1 generated tree audit</title>
  <desc id="description">Rounded, layered, windswept, and ancient generated tree forms rendered from their production voxel plans.</desc>
  <rect width="100%" height="100%" fill="#20251e"/>
  ${FORMS.map(renderTree).join("\n")}
</svg>`;

const edgeCanRootAt = (x: number, z: number) => x >= 0 && z >= 0;
const edgeOrigin = { x: 0, y: 0, z: 0 };
const edgeSeed = "HEARTHROADS:-2066,-3037";
const legacyEdgePlan = planFullTree(edgeSeed, edgeOrigin, "ancient", BlockId.WildwoodLog, BlockId.WildwoodLeaves, {
  groundYAt: () => -1,
  crownFullness: 0.94,
});
const fixedEdgePlan = planFullTree(edgeSeed, edgeOrigin, "ancient", BlockId.WildwoodLog, BlockId.WildwoodLeaves, {
  groundYAt: () => -1,
  canRootAt: edgeCanRootAt,
  crownFullness: 0.94,
});

function renderEdgePanel(plan: readonly TreePlanBlock[], index: number, title: string, note: string) {
  const tileX = index * TILE_WIDTH;
  const originX = tileX + TILE_WIDTH / 2;
  const originY = TILE_HEIGHT - 112;
  const ground = Array.from({ length: 25 }, (_, groundIndex) => {
    const x = groundIndex % 5 - 2;
    const z = Math.floor(groundIndex / 5) - 2;
    return { x, y: -1, z, block: edgeCanRootAt(x, z) ? BlockId.Grass : BlockId.Sand } satisfies TreePlanBlock;
  }).sort((left, right) => (left.x + left.z) - (right.x + right.z));
  const logs = plan.filter((block) => block.block === BlockId.WildwoodLog)
    .sort((left, right) => (left.x + left.z) - (right.x + right.z) || left.y - right.y || left.x - right.x);
  const invalidLowRoots = logs.filter((block) => block.y <= 2 && !edgeCanRootAt(block.x, block.z)).length;
  return `<g>
    <rect x="${tileX + 8}" y="8" width="${TILE_WIDTH - 16}" height="${TILE_HEIGHT - 16}" rx="18" fill="#edf0dd" stroke="#7b6643" stroke-width="3"/>
    <path d="M${tileX + 24} 70 H${tileX + TILE_WIDTH - 24}" stroke="#c8b889" stroke-width="2"/>
    ${ground.map((block) => cube(block, originX, originY, { base: block.block === BlockId.Sand ? "#d1b16e" : "#6b944b", stroke: block.block === BlockId.Sand ? "#9e7d43" : "#436a34" })).join("\n")}
    ${logs.map((block) => cube(block, originX, originY)).join("\n")}
    <text x="${originX}" y="42" text-anchor="middle" fill="#2b2418" font-family="Georgia,serif" font-size="24" font-weight="700">${xml(title)}</text>
    <text x="${originX}" y="${TILE_HEIGHT - 50}" text-anchor="middle" fill="${invalidLowRoots ? "#a74d32" : "#2d6a3e"}" font-family="ui-monospace,monospace" font-size="13">${invalidLowRoots} low roots on invalid sand</text>
    <text x="${originX}" y="${TILE_HEIGHT - 29}" text-anchor="middle" fill="#4c4434" font-family="ui-monospace,monospace" font-size="12">${xml(note)}</text>
  </g>`;
}

const edgeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE_WIDTH * 2}" height="${TILE_HEIGHT}" viewBox="0 0 ${TILE_WIDTH * 2} ${TILE_HEIGHT}" role="img" aria-labelledby="edge-title edge-description">
  <title id="edge-title">Blockwild ancient-tree biome-edge regression</title>
  <desc id="edge-description">Before and after wood-skeleton comparison showing sand-side buttress roots removed from fresh generation.</desc>
  <rect width="100%" height="100%" fill="#20251e"/>
  ${renderEdgePanel(legacyEdgePlan, 0, "Legacy biome edge", "old collar remains recoverable by felling")}
  ${renderEdgePanel(fixedEdgePlan, 1, "v1 rooted edge", "fresh roots remain on living soil")}
</svg>`;

const outputDirectory = path.resolve("output/v1-tree-audit");
await mkdir(outputDirectory, { recursive: true });
const svgPath = path.join(outputDirectory, "tree-forms.svg");
const pngPath = path.join(outputDirectory, "tree-forms.png");
const edgeSvgPath = path.join(outputDirectory, "biome-edge-roots.svg");
const edgePngPath = path.join(outputDirectory, "biome-edge-roots.png");
await writeFile(svgPath, svg, "utf8");
await writeFile(edgeSvgPath, edgeSvg, "utf8");
try {
  const sharp = (await import("sharp")).default;
  await sharp(Buffer.from(svg)).png().toFile(pngPath);
  await sharp(Buffer.from(edgeSvg)).png().toFile(edgePngPath);
  console.log(`${pngPath}\n${edgePngPath}`);
} catch {
  console.log(`${svgPath}\n${edgeSvgPath}`);
}
