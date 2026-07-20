import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";
import {
  BLOCKS,
  BRINEGRASS_TILE,
  FEATHERWRACK_TILE,
  PEARLFAN_TILE,
  SAILKELP_TILE,
  BlockId,
} from "../app/game/data";
import { PixelCanvas, installPixelCanvasDocument } from "./lib/pixel-canvas";

const TILE_SIZE = 16;
const CARD_WIDTH = 330;
const CARD_HEIGHT = 530;
const HEADER_HEIGHT = 124;

const SPECIES = [
  { id: "brinegrass", block: BlockId.Brinegrass, tile: BRINEGRASS_TILE, role: "DOMINANT SHALLOW BED", detail: "short blade meadow", height: "maximum height 2" },
  { id: "sailkelp", block: BlockId.Sailkelp, tile: SAILKELP_TILE, role: "DOMINANT OCEAN CANOPY", detail: "broad olive sails", height: "maximum height 6" },
  { id: "featherwrack", block: BlockId.Featherwrack, tile: FEATHERWRACK_TILE, role: "SCATTERED COLOR ACCENT", detail: "rust feather branches", height: "maximum height 3" },
  { id: "pearlfan", block: BlockId.Pearlfan, tile: PEARLFAN_TILE, role: "RARE SHELF ACCENT", detail: "perforated pale fan", height: "maximum height 1" },
] as const;

function textSvg(width: number, height: number, body: string) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><style>.title{font:900 30px Arial,sans-serif;letter-spacing:2px;fill:#f1ce78}.subtitle{font:13px ui-monospace,monospace;fill:#9db5aa}.name{font:800 23px Arial,sans-serif;fill:#f3eee1}.role{font:800 11px ui-monospace,monospace;letter-spacing:1.4px;fill:#75bd96}.detail{font:11px ui-monospace,monospace;fill:#a7b5ae}.micro{font:10px ui-monospace,monospace;fill:#d2c590}</style>${body}</svg>`);
}

async function atlasTile(canvas: PixelCanvas, tile: number) {
  const left = (tile % 16) * TILE_SIZE;
  const top = Math.floor(tile / 16) * TILE_SIZE;
  return sharp(Buffer.from(canvas.pixels), { raw: { width: canvas.width, height: canvas.height, channels: 4 } })
    .extract({ left, top, width: TILE_SIZE, height: TILE_SIZE })
    .resize(112, 112, { kernel: "nearest" })
    .png()
    .toBuffer();
}

export async function renderOceanFloraReview(out: string) {
  const shim = installPixelCanvasDocument();
  try {
    const { createBlockAtlas } = await import("../app/game/world");
    const texture = createBlockAtlas();
    const canvas = texture.image as unknown as PixelCanvas;
    if (!(canvas instanceof PixelCanvas)) throw new Error("Production atlas did not use the deterministic pixel canvas.");
    await mkdir(out, { recursive: true });

    const width = CARD_WIDTH * SPECIES.length + 40;
    const height = HEADER_HEIGHT + CARD_HEIGHT + 28;
    const overlays: sharp.OverlayOptions[] = [{
      input: textSvg(width, height, `<text x="26" y="42" class="title">BLOCKWILD OCEAN FLORA</text><text x="26" y="70" class="subtitle">Handcrafted voxel naturalism / matte ecological staples / exact Plant Compendium models and production 16 x 16 atlas art</text><text x="26" y="94" class="subtitle">Ocean: 94% Brinegrass + Sailkelp / 1% luminous &#160; Deep Ocean: 89% staples / 0.5% luminous &#160; Lumen Trench retains concentrated glow</text>`),
      left: 0,
      top: 0,
    }];

    for (const [index, species] of SPECIES.entries()) {
      const left = 20 + index * CARD_WIDTH;
      const top = HEADER_HEIGHT;
      const definition = BLOCKS[species.block];
      const portraitSource = await readFile(path.resolve("public", "plants", `${species.id}.svg`));
      const portrait = await sharp(portraitSource).resize(292, 292, { fit: "contain", background: "#101917" }).png().toBuffer();
      const tile = await atlasTile(canvas, species.tile);
      overlays.push(
        { input: textSvg(310, 510, `<rect x="1" y="1" width="308" height="508" rx="20" fill="#111b18" stroke="#3d574c" stroke-width="2"/><rect x="18" y="18" width="274" height="292" rx="14" fill="#101917"/><rect x="18" y="326" width="112" height="112" rx="9" fill="#0b1210" stroke="#43584f"/><text x="150" y="348" class="name">${definition.name}</text><text x="150" y="371" class="role">${species.role}</text><text x="150" y="397" class="detail">${species.detail}</text><text x="150" y="415" class="micro">${species.height}</text><text x="150" y="437" class="micro">tile ${species.tile} / CUTOUT</text><text x="22" y="472" class="detail">waterlogged / matte / species-connected</text>`), left, top },
        { input: portrait, left: left + 10, top: top + 17 },
        { input: tile, left: left + 18, top: top + 326 },
      );
    }

    const destination = path.join(out, "ocean-flora-review.png");
    await sharp({ create: { width, height, channels: 4, background: "#08110f" } })
      .composite(overlays)
      .png({ compressionLevel: 9, adaptiveFiltering: true })
      .toFile(destination);
    texture.dispose();
    return destination;
  } finally {
    shim.restore();
  }
}

async function main() {
  const outIndex = process.argv.indexOf("--out");
  const out = path.resolve(outIndex >= 0 && process.argv[outIndex + 1] ? process.argv[outIndex + 1] : "output/ocean-flora-redesign");
  process.stdout.write(`${await renderOceanFloraReview(out)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
