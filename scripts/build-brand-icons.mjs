import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(projectRoot, "public", "brand", "blockwild-worldheart-source.png");
const outputDirectory = path.join(projectRoot, "public", "brand");
const iconSizes = [16, 32, 64, 180, 192, 512];

await mkdir(outputDirectory, { recursive: true });

const trimmedSource = await sharp(sourcePath)
  .ensureAlpha()
  .trim({ background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

for (const size of iconSizes) {
  const contentSize = Math.max(1, Math.round(size * 0.88));
  const inset = Math.floor((size - contentSize) / 2);
  const foreground = await sharp(trimmedSource)
    .resize(contentSize, contentSize, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      kernel: size <= 32 ? sharp.kernel.lanczos3 : sharp.kernel.lanczos2,
    })
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  })
    .composite([{ input: foreground, left: inset, top: inset }])
    .png({ compressionLevel: 9, adaptiveFiltering: true })
    .toFile(path.join(outputDirectory, `blockwild-icon-${size}.png`));
}

console.log(`Built ${iconSizes.length} Worldheart icons from ${path.relative(projectRoot, sourcePath)}.`);
