import path from "node:path";
import { mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const TILE_WIDTH = 390;
const TILE_HEIGHT = 355;
const SHEET_HEADER = 128;
const COLUMNS = 5;
const GAP = 18;
const MARGIN = 24;
const HEADER = 112;

const SPOTLIGHTS = Object.freeze([
  { sheet: "mythics-and-summons", index: 0, label: "Ilyr Virebloom, the Walking Spring" },
  { sheet: "mythics-and-summons", index: 5, label: "The Sugarwake Sovereign" },
  { sheet: "mythics-and-summons", index: 6, label: "Asterjaw" },
  { sheet: "mythics-and-summons", index: 4, label: "Kharza, the Red Banner Warg" },
  { sheet: "mythics-and-summons", index: 9, label: "Glasswake Stag" },
  { sheet: "field-roster", index: 4, label: "Hearthback Badger" },
  { sheet: "field-roster", index: 22, label: "Wreckwhistle Porpoise" },
] as const);

function option(flag: string, fallback: string) {
  const index = process.argv.indexOf(flag);
  return path.resolve(index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback);
}

function xml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

async function cropTile(root: string, sheet: string, index: number) {
  return sharp(path.join(root, `${sheet}.png`)).extract({
    left: index % COLUMNS * TILE_WIDTH,
    top: SHEET_HEADER + Math.floor(index / COLUMNS) * TILE_HEIGHT,
    width: TILE_WIDTH,
    height: TILE_HEIGHT,
  }).png({ compressionLevel: 9 }).toBuffer();
}

export async function composeAnatomySpotlight(options: Readonly<{ before: string; after: string; out: string }>) {
  await mkdir(path.dirname(options.out), { recursive: true });
  const width = MARGIN * 2 + TILE_WIDTH * 2 + GAP;
  const rowHeight = TILE_HEIGHT + 42;
  const height = MARGIN * 2 + HEADER + SPOTLIGHTS.length * rowHeight;
  const header = Buffer.from([
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">`,
    `<rect width="${width}" height="${height}" fill="#071216"/>`,
    `<text x="${MARGIN}" y="38" fill="#f3f8f6" font-family="ui-sans-serif,system-ui,sans-serif" font-size="25" font-weight="760">Living Bestiary — articulated anatomy pass</text>`,
    `<text x="${MARGIN}" y="72" fill="#d9a865" font-family="ui-sans-serif,system-ui,sans-serif" font-size="15" font-weight="760" letter-spacing="1.6">BEFORE · SINGLE-OVAL LIMBS</text>`,
    `<text x="${MARGIN + TILE_WIDTH + GAP}" y="72" fill="#83d8a4" font-family="ui-sans-serif,system-ui,sans-serif" font-size="15" font-weight="760" letter-spacing="1.6">AFTER · CONNECTED SEGMENTED RIG</text>`,
    ...SPOTLIGHTS.map((spotlight, row) => `<text x="${MARGIN}" y="${MARGIN + HEADER + row * rowHeight + TILE_HEIGHT + 29}" fill="#cfddda" font-family="ui-sans-serif,system-ui,sans-serif" font-size="15" font-weight="650">${xml(spotlight.label)}</text>`),
    `</svg>`,
  ].join(""));
  const composites: sharp.OverlayOptions[] = [{ input: header, left: 0, top: 0 }];
  for (const [row, spotlight] of SPOTLIGHTS.entries()) {
    const y = MARGIN + HEADER + row * rowHeight;
    const [before, after] = await Promise.all([
      cropTile(options.before, spotlight.sheet, spotlight.index),
      cropTile(options.after, spotlight.sheet, spotlight.index),
    ]);
    composites.push({ input: before, left: MARGIN, top: y });
    composites.push({ input: after, left: MARGIN + TILE_WIDTH + GAP, top: y });
  }
  await sharp({ create: { width, height, channels: 4, background: "#071216" } })
    .composite(composites)
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(options.out);
  return options.out;
}

async function main() {
  const out = await composeAnatomySpotlight({
    before: option("--before", "output/living-bestiary-anatomy-pass/before"),
    after: option("--after", "output/living-bestiary-anatomy-pass/after"),
    out: option("--out", "output/living-bestiary-anatomy-pass/comparison/anatomy-spotlight-before-after.png"),
  });
  process.stdout.write(`${JSON.stringify({ status: "rendered", out }, null, 2)}\n`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
