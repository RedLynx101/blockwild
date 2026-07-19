import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { BLOCKS, BlockId, type BlockDefinition } from "../app/game/data";
import { BLOCK_VISUAL_FAMILIES, blockVisualFamily } from "../app/game/visual-theme";
import { PixelCanvas, installPixelCanvasDocument } from "./lib/pixel-canvas";

const TILE_SIZE = 16;
const ATLAS_SIZE = 256;

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function wrapRule(value: string, maximumLength = 94) {
  const words = value.split(/\s+/u);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maximumLength || !line) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 2);
}

async function tileDataUrl(canvas: PixelCanvas, tile: number) {
  const left = (tile % 16) * TILE_SIZE;
  const top = Math.floor(tile / 16) * TILE_SIZE;
  const png = await sharp(Buffer.from(canvas.pixels), { raw: { width: canvas.width, height: canvas.height, channels: 4 } })
    .extract({ left, top, width: TILE_SIZE, height: TILE_SIZE })
    .resize(64, 64, { kernel: "nearest" })
    .png()
    .toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

function representativeScore(definition: BlockDefinition) {
  let score = definition.shape && definition.shape !== "cube" ? -2 : 2;
  if (definition.top !== definition.side || definition.side !== definition.bottom) score += 5;
  if (definition.solid) score += 2;
  if (definition.layer === "emissive" || definition.layer === "transparent") score += 1;
  if (/open|upper|lower|young|sprout/u.test(definition.name.toLowerCase())) score -= 4;
  return score;
}

export async function renderBlockStyleReview(options: Readonly<{ outDir: string }>) {
  const shim = installPixelCanvasDocument();
  try {
    const { createBlockAtlas } = await import("../app/game/world");
    const texture = createBlockAtlas();
    const canvas = texture.image;
    if (!(canvas instanceof PixelCanvas) || canvas.width !== ATLAS_SIZE || canvas.height !== ATLAS_SIZE) throw new Error("The production atlas did not render through the deterministic pixel canvas.");
    await mkdir(options.outDir, { recursive: true });
    const raw = Buffer.from(canvas.pixels);
    const atlasPath = path.join(options.outDir, "production-block-atlas.png");
    await sharp(raw, { raw: { width: canvas.width, height: canvas.height, channels: 4 } })
      .resize(1024, 1024, { kernel: "nearest" })
      .png({ compressionLevel: 9 })
      .toFile(atlasPath);

    const families = [] as Array<{
      family: (typeof BLOCK_VISUAL_FAMILIES)[number];
      blocks: Array<{ id: BlockId; definition: BlockDefinition }>;
    }>;
    for (const family of BLOCK_VISUAL_FAMILIES) {
      const blocks = Object.entries(BLOCKS)
        .map(([id, definition]) => ({ id: Number(id) as BlockId, definition }))
        .filter((entry) => blockVisualFamily(entry.id, entry.definition).id === family.id)
        .sort((a, b) => representativeScore(b.definition) - representativeScore(a.definition) || a.id - b.id);
      families.push({ family, blocks });
    }

    const cardWidth = 660;
    const cardHeight = 330;
    const columns = 2;
    const rows = Math.ceil(families.length / columns);
    const width = columns * cardWidth + 36;
    const height = 126 + rows * cardHeight + 24;
    const cards: string[] = [];
    for (const [index, entry] of families.entries()) {
      const x = 18 + (index % columns) * cardWidth;
      const y = 108 + Math.floor(index / columns) * cardHeight;
      const representatives = entry.blocks.slice(0, 2);
      const tiles = new Map<number, string>();
      for (const representative of representatives) for (const tile of [representative.definition.top, representative.definition.side, representative.definition.bottom]) {
        if (!tiles.has(tile)) tiles.set(tile, await tileDataUrl(canvas, tile));
      }
      const samples = representatives.map((representative, sampleIndex) => {
        const sampleX = x + 18 + sampleIndex * 204;
        const definition = representative.definition;
        const face = (tile: number, faceX: number, label: string) => `<image href="${tiles.get(tile)}" x="${faceX}" y="${y + 118}" width="52" height="52" style="image-rendering:pixelated"/><text x="${faceX + 26}" y="${y + 184}" text-anchor="middle" class="micro">${label} ${tile}</text>`;
        return `<g>${face(definition.top, sampleX, "TOP")}${face(definition.side, sampleX + 60, "SIDE")}${face(definition.bottom, sampleX + 120, "BASE")}<text x="${sampleX}" y="${y + 210}" class="name">${escapeXml(definition.name)}</text><text x="${sampleX}" y="${y + 230}" class="micro">${escapeXml(definition.shape ?? "cube")} / ${escapeXml(definition.layer)}</text></g>`;
      }).join("");
      const repeat = representatives[0] ? tiles.get(representatives[0].definition.side) : undefined;
      const repeatGrid = repeat ? Array.from({ length: 9 }, (_, cell) => `<image href="${repeat}" x="${x + 474 + (cell % 3) * 44}" y="${y + 112 + Math.floor(cell / 3) * 44}" width="44" height="44" style="image-rendering:pixelated"/>`).join("") : "";
      const ruleLines = wrapRule(`${entry.family.materialRule} ${entry.family.accentRule}`);
      cards.push(`<g><rect x="${x}" y="${y}" width="624" height="306" rx="18" class="card"/><text x="${x + 18}" y="${y + 31}" class="family">${escapeXml(entry.family.label)}</text><text x="${x + 18}" y="${y + 54}" class="count">${entry.blocks.length} registered blocks / ${entry.family.id}</text>${ruleLines.map((line, ruleIndex) => `<text x="${x + 18}" y="${y + 78 + ruleIndex * 18}" class="rule">${escapeXml(line)}</text>`).join("")}${samples}${repeatGrid}<text x="${x + 540}" y="${y + 260}" text-anchor="middle" class="micro">3 x 3 SIDE REPEAT</text></g>`);
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>text{font-family:Arial,sans-serif}.title{fill:#f4d271;font-size:27px;font-weight:800;letter-spacing:2px}.subtitle{fill:#9db4aa;font-size:13px}.card{fill:#14231f;stroke:#365247;stroke-width:2}.family{fill:#f4efe1;font-size:19px;font-weight:800}.count{fill:#7fc99f;font-size:11px;font-weight:700}.rule{fill:#aebbb4;font-size:10px}.name{fill:#f3ede0;font-size:11px;font-weight:700}.micro{fill:#94a89e;font-size:9px;font-weight:700}</style><rect width="100%" height="100%" fill="#071310"/><text x="24" y="38" class="title">BLOCKWILD MATERIAL FAMILY REVIEW</text><text x="24" y="64" class="subtitle">Exact production atlas / 16 x 16 nearest-filtered tiles / top, side, and bottom logic / repeated-surface check</text><text x="24" y="84" class="subtitle">Grounded storybook materialism / generated from createBlockAtlas(), not a painted proxy</text>${cards.join("")}</svg>`;
    const sheetSvg = path.join(options.outDir, "material-family-review.svg");
    const sheetPng = path.join(options.outDir, "material-family-review.png");
    await writeFile(sheetSvg, svg, "utf8");
    await sharp(Buffer.from(svg)).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(sheetPng);
    const manifest = {
      schema: 1,
      generatedBy: "scripts/render-block-style-review.ts",
      atlas: { width: canvas.width, height: canvas.height, tileSize: TILE_SIZE, tiles: 256, output: atlasPath },
      families: families.map((entry) => ({ id: entry.family.id, blocks: entry.blocks.map((block) => ({ id: block.id, name: block.definition.name, top: block.definition.top, side: block.definition.side, bottom: block.definition.bottom })) })),
      reviewSheet: sheetPng,
    };
    const manifestPath = path.join(options.outDir, "manifest.json");
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    texture.dispose();
    return { atlasPath, sheetSvg, sheetPng, manifestPath, families: families.length, blocks: Object.keys(BLOCKS).length };
  } finally {
    shim.restore();
  }
}

function valueAfter(argv: readonly string[], flag: string) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const outDir = path.resolve(valueAfter(argv, "--out") ?? "output/block-style-review");
  process.stdout.write(`${JSON.stringify(await renderBlockStyleReview({ outDir }), null, 2)}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) await main();
