import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
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
