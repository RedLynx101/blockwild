import { mkdir } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const root = process.cwd();
const beforePath = path.resolve(root, process.argv[2] ?? "output/creature-upgrade/before/portraits/blockwild-creatures.png");
const afterPath = path.resolve(root, process.argv[3] ?? "output/creature-upgrade/after/portraits/blockwild-creatures.png");
const destination = path.resolve(root, process.argv[4] ?? "docs/artifacts/requested-mob-upgrade-comparison.png");
const panelWidth = 1440;
const panelHeight = 1340;
const gutter = 36;
const headerHeight = 144;
const canvasWidth = panelWidth * 2 + gutter * 3;
const canvasHeight = panelHeight + headerHeight + gutter;

const header = Buffer.from(`
  <svg width="${canvasWidth}" height="${headerHeight}" xmlns="http://www.w3.org/2000/svg">
    <rect width="100%" height="100%" fill="#0b100d"/>
    <text x="${gutter}" y="54" fill="#f2c96f" font-family="Arial, sans-serif" font-size="36" font-weight="800">REQUESTED MOB UPGRADE · BEFORE / AFTER</text>
    <text x="${gutter}" y="104" fill="#d8dfd8" font-family="Arial, sans-serif" font-size="24" font-weight="700">BEFORE · 14 existing creatures</text>
    <text x="${panelWidth + gutter * 2}" y="104" fill="#d8ff77" font-family="Arial, sans-serif" font-size="24" font-weight="700">AFTER · redesigned creatures + new Lightning Bug</text>
  </svg>
`);

await mkdir(path.dirname(destination), { recursive: true });
await sharp({
  create: { width: canvasWidth, height: canvasHeight, channels: 4, background: "#0b100d" },
})
  .composite([
    { input: header, left: 0, top: 0 },
    { input: await sharp(beforePath).resize(panelWidth, panelHeight).png().toBuffer(), left: gutter, top: headerHeight },
    { input: await sharp(afterPath).resize(panelWidth, panelHeight).png().toBuffer(), left: panelWidth + gutter * 2, top: headerHeight },
  ])
  .png({ compressionLevel: 9 })
  .toFile(destination);

process.stdout.write(`${destination}\n`);
