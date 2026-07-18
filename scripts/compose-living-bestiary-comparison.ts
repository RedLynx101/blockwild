import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const SHEETS = ["field-roster", "mythics-and-summons"] as const;
const PANEL_WIDTH = 1_600;
const GUTTER = 28;
const HEADER_HEIGHT = 94;
const OUTER_MARGIN = 28;

function xml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function option(flag: string, fallback: string) {
  const index = process.argv.indexOf(flag);
  return path.resolve(index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback);
}

async function normalizedPanel(source: string) {
  const image = sharp(source);
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height) throw new Error(`Could not measure ${source}`);
  const height = Math.round(metadata.height * PANEL_WIDTH / metadata.width);
  return {
    height,
    buffer: await image.resize({ width: PANEL_WIDTH, height, fit: "fill" }).png({ compressionLevel: 9 }).toBuffer(),
  };
}

export async function composeLivingBestiaryComparisons(options: Readonly<{
  before: string;
  after: string;
  out: string;
}>) {
  await mkdir(options.out, { recursive: true });
  const outputs: string[] = [];
  for (const sheet of SHEETS) {
    const [before, after] = await Promise.all([
      normalizedPanel(path.join(options.before, `${sheet}.png`)),
      normalizedPanel(path.join(options.after, `${sheet}.png`)),
    ]);
    const panelHeight = Math.max(before.height, after.height);
    const width = OUTER_MARGIN * 2 + PANEL_WIDTH * 2 + GUTTER;
    const height = OUTER_MARGIN * 2 + HEADER_HEIGHT + panelHeight;
    const labels = Buffer.from([
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${HEADER_HEIGHT}">`,
      `<rect width="${width}" height="${HEADER_HEIGHT}" fill="#081318"/>`,
      `<text x="${OUTER_MARGIN}" y="32" fill="#f3f8f6" font-family="ui-sans-serif,system-ui,sans-serif" font-size="22" font-weight="760">${xml(sheet === "field-roster" ? "Field Roster" : "Legendary Creatures & Bound Summons")} — model redesign comparison</text>`,
      `<text x="${OUTER_MARGIN}" y="69" fill="#d9a865" font-family="ui-sans-serif,system-ui,sans-serif" font-size="18" font-weight="760" letter-spacing="2">BEFORE · BLOCKOUT</text>`,
      `<text x="${OUTER_MARGIN + PANEL_WIDTH + GUTTER}" y="69" fill="#83d8a4" font-family="ui-sans-serif,system-ui,sans-serif" font-size="18" font-weight="760" letter-spacing="2">AFTER · PRODUCTION ART</text>`,
      `</svg>`,
    ].join(""));
    const destination = path.join(options.out, `${sheet}-before-after.png`);
    await sharp({
      create: { width, height, channels: 4, background: "#081318" },
    }).composite([
      { input: labels, left: 0, top: OUTER_MARGIN },
      { input: before.buffer, left: OUTER_MARGIN, top: OUTER_MARGIN + HEADER_HEIGHT },
      { input: after.buffer, left: OUTER_MARGIN + PANEL_WIDTH + GUTTER, top: OUTER_MARGIN + HEADER_HEIGHT },
    ]).png({ compressionLevel: 9, adaptiveFiltering: true }).toFile(destination);
    outputs.push(destination);
  }
  return outputs;
}

async function main() {
  const outputs = await composeLivingBestiaryComparisons({
    before: option("--before", "output/living-bestiary-showcase/geometry-before"),
    after: option("--after", "output/living-bestiary-showcase/geometry-after"),
    out: option("--out", "output/living-bestiary-showcase/comparison"),
  });
  process.stdout.write(`${JSON.stringify({ status: "rendered", outputs }, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
