import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { BIOME_SURFACE_TEXTURES, biomeSurfaceTexel } from "../app/game/biome-atmosphere.ts";

const outputDirectory = path.resolve(process.argv[2] ?? "output/v1.3-biome-atmosphere");
const width = 1600;
const height = 1300;
const tileScale = 5;
const tileSize = 16 * tileScale;

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function renderTile(tileIndex: number, x: number, y: number, legacy: boolean) {
  const pixels: string[] = [];
  for (let py = 0; py < 16; py += 1) for (let px = 0; px < 16; px += 1) {
    pixels.push(`<rect x="${x + px * tileScale}" y="${y + py * tileScale}" width="${tileScale}" height="${tileScale}" fill="${biomeSurfaceTexel(tileIndex, px, py, legacy) ?? "#000"}"/>`);
  }
  return `<g shape-rendering="crispEdges">${pixels.join("")}</g><rect x="${x - 1}" y="${y - 1}" width="${tileSize + 2}" height="${tileSize + 2}" fill="none" stroke="${legacy ? "#657068" : "#d9bd72"}" stroke-width="2"/>`;
}

const rows = BIOME_SURFACE_TEXTURES.map((recipe, index) => {
  const column = index % 2;
  const row = Math.floor(index / 2);
  const x = index === BIOME_SURFACE_TEXTURES.length - 1 && BIOME_SURFACE_TEXTURES.length % 2 === 1
    ? 444
    : 54 + column * 780;
  const y = 150 + row * 220;
  const beforeX = x + 250;
  const afterX = x + 520;
  const topY = y + 42;
  return `<g>
    <text x="${x}" y="${y + 6}" fill="#f5ead0" font-family="ui-sans-serif,system-ui,sans-serif" font-size="26" font-weight="850">${escapeXml(recipe.label)}</text>
    <text x="${beforeX}" y="${y + 6}" fill="#89968e" font-family="ui-monospace,monospace" font-size="12" font-weight="700" letter-spacing="2">BEFORE</text>
    <text x="${afterX}" y="${y + 6}" fill="#e7c36d" font-family="ui-monospace,monospace" font-size="12" font-weight="700" letter-spacing="2">V1.3</text>
    <text x="${x}" y="${y + 40}" fill="#829188" font-family="ui-sans-serif,system-ui,sans-serif" font-size="14">top / edge</text>
    ${renderTile(recipe.topTile, beforeX, topY, true)}
    ${renderTile(recipe.sideTile, beforeX + 96, topY, true)}
    <path d="M ${beforeX + 195} ${topY + 40} L ${afterX - 22} ${topY + 40}" stroke="#5b675f" stroke-width="2"/>
    <path d="M ${afterX - 30} ${topY + 34} L ${afterX - 22} ${topY + 40} L ${afterX - 30} ${topY + 46}" fill="none" stroke="#d0b061" stroke-width="2"/>
    ${renderTile(recipe.topTile, afterX, topY, false)}
    ${renderTile(recipe.sideTile, afterX + 96, topY, false)}
    <line x1="${x}" y1="${y + 198}" x2="${x + 710}" y2="${y + 198}" stroke="#26332d"/>
  </g>`;
}).join("");

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#0d1411"/>
  <path d="M0 0H1600V92C1260 126 1024 58 710 94C430 126 190 100 0 132Z" fill="#17231d"/>
  <text x="54" y="58" fill="#e6be63" font-family="ui-sans-serif,system-ui,sans-serif" font-size="30" font-weight="900" letter-spacing="2">BLOCKWILD · ATMOSPHERE PASS</text>
  <text x="54" y="92" fill="#9aaba1" font-family="ui-sans-serif,system-ui,sans-serif" font-size="15">Production atlas texels · nine biome surfaces · legacy noise compared with authored terrain motifs</text>
  ${rows}
</svg>`;

await mkdir(outputDirectory, { recursive: true });
const svgPath = path.join(outputDirectory, "blockwild-biome-textures-before-after.svg");
const pngPath = path.join(outputDirectory, "blockwild-biome-textures-before-after.png");
await writeFile(svgPath, svg, "utf8");
await sharp(Buffer.from(svg)).png().toFile(pngPath);
process.stdout.write(`${JSON.stringify({ svg: svgPath, png: pngPath, biomes: BIOME_SURFACE_TEXTURES.map((recipe) => recipe.id) }, null, 2)}\n`);
