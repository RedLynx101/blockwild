import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { verifyTextureMaterialFixtureR11 } from "../scripts/verify-rust-render-material-codec-r11.ts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Rust additive texture/material BWRD has byte-exact TypeScript codec and hash parity", async () => {
  const bytes = new Uint8Array(await readFile(path.join(ROOT, "tests/fixtures/rust-engine/r11-renderer/texture-material-v2.bwrd")));
  verifyTextureMaterialFixtureR11(bytes);
});
