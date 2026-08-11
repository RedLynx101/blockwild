import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BLOCK_ATLAS_TEXTURE_ID_V2,
  createRenderResourceBatchV2,
  createRenderFrameV2,
  decodeRenderFrameV2,
  decodeRenderResourceBatchV2,
  encodeRenderFrameV2,
  encodeRenderResourceBatchV2,
} from "../app/game/rust-render-extraction-v2.ts";

async function fixture(name: string) {
  return new Uint8Array(await readFile(new URL(`fixtures/rust-engine/r11-renderer/${name}`, import.meta.url)));
}

test("TypeScript decodes and re-encodes the exact Rust renderer resource fixture", async () => {
  const source = await fixture("canonical-resources.bwrd");
  const decoded = decodeRenderResourceBatchV2(source);
  assert.equal(decoded.schema, 2);
  assert.equal(decoded.operations.length, 5);
  assert.deepEqual(encodeRenderResourceBatchV2(decoded), source);
});

test("TypeScript decodes and re-encodes the exact Rust renderer frame fixture", async () => {
  const source = await fixture("canonical-frame.bwrf");
  const decoded = decodeRenderFrameV2(source);
  assert.equal(decoded.schema, 2);
  assert.equal(decoded.instances.length, 4);
  assert.deepEqual(encodeRenderFrameV2(decoded), source);
});

test("frame hash is stable across presentation storage order", async () => {
  const source = decodeRenderFrameV2(await fixture("canonical-frame.bwrf"));
  const reversed = createRenderFrameV2({
    ...source,
    frameSequence: source.frameSequence + BigInt(1),
    instances: [...source.instances].reverse(),
    particles: [...source.particles].reverse(),
  });
  const canonical = createRenderFrameV2({
    ...source,
    frameSequence: source.frameSequence + BigInt(1),
    instances: source.instances,
    particles: source.particles,
  });
  assert.deepEqual(reversed.frameHash, canonical.frameHash);
});

test("texture resources round-trip exact RGBA bytes and reject inconsistent dimensions", () => {
  const texture = {
    id: BLOCK_ATLAS_TEXTURE_ID_V2, revision: 1, width: 2, height: 1,
    colorSpace: 1 as const, filter: 0 as const, rgba8: new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]),
  };
  const batch = createRenderResourceBatchV2({
    epoch: BigInt(5),
    revision: BigInt(1),
    operations: [{
      kind: "upsert-texture",
      texture,
    }],
  });
  assert.deepEqual(decodeRenderResourceBatchV2(encodeRenderResourceBatchV2(batch)), batch);
  assert.throws(() => createRenderResourceBatchV2({
    epoch: BigInt(5), revision: BigInt(2), operations: [{
      kind: "upsert-texture",
      texture: { ...texture, width: 3 },
    }],
  }), /RGBA stream/u);
});

test("optional lighting extension round-trips exact local lights without changing legacy frames", async () => {
  const legacy = decodeRenderFrameV2(await fixture("canonical-frame.bwrf"));
  assert.equal(legacy.environment.lighting, undefined);
  const expected = createRenderFrameV2({
    ...legacy,
    frameSequence: legacy.frameSequence + BigInt(1),
    environment: {
      ...legacy.environment,
      lighting: {
        blockIntensity: 1.35,
        minimumAmbient: 0.026,
        waterPhase: 0.375,
        held: { position: [1, 2, 3], colorRgb8: [255, 116, 40], intensity: 0.72, radius: 9 },
        machine: { position: [-4, 5, 6], colorRgb8: [255, 133, 49], intensity: 0.42, radius: 7.5 },
      },
    },
  });
  const bytes = encodeRenderFrameV2(expected);
  assert.equal(new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint16(6, true), 1);
  const decoded = decodeRenderFrameV2(bytes);
  assert.deepEqual(encodeRenderFrameV2(decoded), bytes);
  assert.deepEqual(decoded.environment.lighting?.held.position, [1, 2, 3]);
  assert.deepEqual(decoded.environment.lighting?.machine.colorRgb8, [255, 133, 49]);
  assert.ok(Math.abs((decoded.environment.lighting?.minimumAmbient ?? 0) - 0.026) < 1e-6);
});

test("wire decoders reject corruption, truncation, trailing bytes and malicious counts", async () => {
  const source = await fixture("canonical-frame.bwrf");
  assert.throws(() => decodeRenderFrameV2(source.subarray(0, source.length - 1)), /truncated/);
  const trailing = new Uint8Array(source.length + 1); trailing.set(source);
  assert.throws(() => decodeRenderFrameV2(trailing), /trailing/);
  const corrupted = source.slice(); corrupted[40] ^= 0x40;
  assert.throws(() => decodeRenderFrameV2(corrupted), /hash mismatch/);
  const resources = await fixture("canonical-resources.bwrd");
  const oversized = resources.slice(); new DataView(oversized.buffer).setUint32(24, 0xffff_ffff, true);
  assert.throws(() => decodeRenderResourceBatchV2(oversized), /too many resource operations/);
});
