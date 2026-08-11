import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  compileRenderEntityModelResourcesR10,
  decodeRenderEntityModelCatalogR10,
  findRenderEntityCompiledModelR10,
  renderEntityStableIdR10,
  type RenderEntityModelCatalogManifestR10,
} from "../app/game/rust-render-entity-catalog-r10.ts";
import {
  createRenderResourceBatchV2,
  encodeRenderResourceBatchV2,
} from "../app/game/rust-render-extraction-v2.ts";

const ROOT = path.resolve(import.meta.dirname, "..");

async function productionCatalog() {
  const source = JSON.parse(await readFile(path.join(ROOT, "public", "renderer", "manifest.json"), "utf8")) as Record<string, unknown>;
  const current = String(source.current);
  const bytes = new Uint8Array(await readFile(path.join(ROOT, "public", "renderer", current, "models.bwm2")));
  const manifest: RenderEntityModelCatalogManifestR10 = {
    schema: 2,
    format: "blockwild-compiled-model-catalog-v2",
    revision: BigInt(1),
    current,
    sha256: String(source.sha256),
    catalogHash: String(source.catalogHash),
    byteLength: Number(source.byteLength),
    modelCount: Number(source.modelCount),
    nodeCount: Number(source.nodeCount),
  };
  return { bytes, manifest };
}

test("R10 verifies the production compiled model catalog without Three", async () => {
  const { bytes, manifest } = await productionCatalog();
  const catalog = await decodeRenderEntityModelCatalogR10(bytes, manifest);
  assert.equal(catalog.models.length, 252);
  assert.equal(catalog.nodeCount, 13_121);
  assert.equal(catalog.catalogHashHex, "52fd4aebb0c457f3c83af79af6b83c93");
  assert.equal(catalog.contentSha256, "12c522f880e94c1ae527de701ae3e710fee13701d66fbb0a4ad24895557011b4");
  assert.ok(findRenderEntityCompiledModelR10(catalog, "asterjaw"));
  assert.ok(findRenderEntityCompiledModelR10(catalog, "sea-dragon"));
  assert.equal(findRenderEntityCompiledModelR10(catalog, "missing-model"), null);
});

test("R10 compiles deterministic bounded model resources", async () => {
  const { bytes, manifest } = await productionCatalog();
  const catalog = await decodeRenderEntityModelCatalogR10(bytes, manifest);
  const model = findRenderEntityCompiledModelR10(catalog, "asterjaw");
  assert.ok(model);
  const first = compileRenderEntityModelResourcesR10(catalog, model);
  const second = compileRenderEntityModelResourcesR10(catalog, model);
  assert.deepEqual(first, second);
  assert.equal(first.operations[0].kind, "upsert-geometry");
  assert.ok(first.operations.length > 2);
  assert.equal(first.materialByPaletteKey.size, first.operations.length - 1);
  const batch = createRenderResourceBatchV2({ epoch: BigInt(9), revision: catalog.revision, operations: first.operations });
  const encoded = encodeRenderResourceBatchV2(batch);
  assert.equal(Buffer.from(batch.batchHash).toString("hex"), "182472d29d789f5c48cb06a1c5d1f9ef");
  assert.equal(encoded.byteLength, 1_343);
});

test("R10 rejects stale, missing, and corrupt catalog attestations", async () => {
  const { bytes, manifest } = await productionCatalog();
  await assert.rejects(() => decodeRenderEntityModelCatalogR10(bytes, { ...manifest, revision: BigInt(0) }), /revision/u);
  await assert.rejects(() => decodeRenderEntityModelCatalogR10(bytes, { ...manifest, current: "0".repeat(64) }), /current and SHA-256/u);
  await assert.rejects(() => decodeRenderEntityModelCatalogR10(bytes, { ...manifest, catalogHash: "0".repeat(32) }), /canonical hash/u);
  const corrupt = Uint8Array.from(bytes);
  corrupt[Math.floor(corrupt.byteLength / 2)] ^= 0x80;
  await assert.rejects(() => decodeRenderEntityModelCatalogR10(corrupt, manifest), /SHA-256/u);
  await assert.rejects(() => decodeRenderEntityModelCatalogR10(bytes.subarray(0, bytes.byteLength - 1), {
    ...manifest,
    byteLength: bytes.byteLength - 1,
  }), /SHA-256/u);
});

test("R10 instance ids preserve entity/node identity deterministically", () => {
  const first = renderEntityStableIdR10(BigInt("0x000000070000002a"), 1);
  assert.equal(first, BigInt("1568450030277415918"));
  assert.equal(renderEntityStableIdR10(BigInt("0x000000070000002a"), 1), first);
  assert.notEqual(renderEntityStableIdR10(BigInt("0x000000070000002a"), 2), first);
  assert.notEqual(renderEntityStableIdR10(BigInt("0x000000080000002a"), 1), first);
  assert.throws(() => renderEntityStableIdR10(BigInt(0), 1), /entity id/u);
});
