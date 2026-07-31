import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

const projectRoot = process.cwd();
const expectedSizes = [16, 32, 64, 180, 192, 512];

test("Worldheart icons are transparent production PNGs at every declared size", async () => {
  for (const size of expectedSizes) {
    const iconPath = path.join(projectRoot, "public", "brand", `blockwild-icon-${size}.png`);
    const image = sharp(iconPath).ensureAlpha();
    const metadata = await image.metadata();
    const alpha = (await image.stats()).channels[3];

    assert.equal(metadata.width, size, `${size}px icon width`);
    assert.equal(metadata.height, size, `${size}px icon height`);
    assert.equal(metadata.format, "png", `${size}px icon format`);
    assert.equal(metadata.hasAlpha, true, `${size}px icon alpha channel`);
    assert.equal(alpha.min, 0, `${size}px icon retains transparent canvas`);
    assert.equal(alpha.max, 255, `${size}px icon retains opaque artwork`);
  }
});

test("site metadata consistently declares the Worldheart identity", async () => {
  const layoutSource = await readFile(path.join(projectRoot, "app", "layout.tsx"), "utf8");
  const appManifest = JSON.parse(
    await readFile(path.join(projectRoot, "public", "manifest.webmanifest"), "utf8"),
  ) as {
    name: string;
    theme_color: string;
    icons: Array<{ sizes: string }>;
  };

  assert.match(layoutSource, /blockwild-icon-16\.png/);
  assert.match(layoutSource, /blockwild-icon-180\.png/);
  assert.match(layoutSource, /manifest\.webmanifest/);
  assert.doesNotMatch(layoutSource, /favicon\.svg/);
  assert.equal(appManifest.name, "Blockwild");
  assert.equal(appManifest.theme_color, "#d99f45");
  assert.deepEqual(
    appManifest.icons.map((icon) => icon.sizes),
    ["192x192", "512x512"],
  );
});
