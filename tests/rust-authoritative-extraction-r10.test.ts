import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  decodeRustAudioExtractionR10,
  decodeRustDomainBundleR10,
  decodeRustRuntimeDiagnosticsR10,
} from "../app/game/rust-authoritative-extraction-r10.ts";
import { TypeScriptCanonicalHasher } from "../app/game/rust-kernel-shadow.ts";
import {
  RustRenderSceneComposerR10,
  type RenderSceneExtractionSinkR10,
} from "../app/game/rust-render-scene-composer-r10.ts";
import type { RustIntegratedRuntimeExtractionV1 } from "../app/game/rust-integrated-runtime-contract.ts";

const encoder = new TextEncoder();
const GOLDEN = readFileSync(new URL("./fixtures/rust-engine/r10-authoritative-extraction/domain-row-v1.hex", import.meta.url), "utf8").trim();

class Writer {
  readonly bytes: number[] = [];
  raw(value: Uint8Array | readonly number[]) { this.bytes.push(...value); return this; }
  u8(value: number) { this.bytes.push(value); return this; }
  u16(value: number) { this.bytes.push(value & 0xff, value >>> 8 & 0xff); return this; }
  u32(value: number) { this.bytes.push(value & 0xff, value >>> 8 & 0xff, value >>> 16 & 0xff, value >>> 24 & 0xff); return this; }
  u64(value: bigint | number) { let checked = BigInt(value); for (let index = 0; index < 8; index += 1) { this.bytes.push(Number(checked & BigInt(0xff))); checked >>= BigInt(8); } return this; }
  f64(value: number) { const bytes = new Uint8Array(8); new DataView(bytes.buffer).setFloat64(0, value, true); return this.raw(bytes); }
  string(value: string) { const bytes = encoder.encode(value); return this.u32(bytes.byteLength).raw(bytes); }
  finish() { return Uint8Array.from(this.bytes); }
}

function domainPayload() {
  const writer = new Writer();
  writer.u16(7).string("golden").u64(9).u16(7)
    .string("bool").u8(0).u8(1)
    .string("bytes").u8(6).u32(3).raw([0, 1, 0x80])
    .string("f64").u8(3).f64(1.5)
    .string("hash").u8(5).raw(Uint8Array.from({ length: 16 }, (_, index) => index))
    .string("i64").u8(2).u64(BigInt.asUintN(64, BigInt(-2)))
    .string("string").u8(4).string("é")
    .string("u64").u8(1).u64(BigInt("0x0102030405060708"));
  return writer.finish();
}

function domainBundle(payload = domainPayload()) {
  const writer = new Writer();
  writer.raw(encoder.encode("BWX0")).u16(1).u64(17).u64(11)
    .raw(Uint8Array.from({ length: 16 }, () => 0x11))
    .raw(Uint8Array.from({ length: 16 }, () => 0x22)).u8(1).u16(8);
  for (let domain = 1; domain <= 8; domain += 1) {
    const blockers = domain === 8 ? ["celestial-sky-state-not-authoritative"] : [];
    const body = domain === 1 ? payload : new Uint8Array();
    const total = domain === 1 ? 1 : 0;
    const status = domain === 8 ? 2 : 0;
    const hash = new TypeScriptCanonicalHasher("blockwild.r10.domain-view-payload.v1").writeBytes(body).finish();
    writer.u8(domain).u16(1).u8(status).u64(domain).u32(total).u32(total).u32(0).u32(total).u16(blockers.length);
    for (const blocker of blockers) writer.string(blocker);
    writer.u32(body.byteLength).raw(hash).raw(body);
  }
  return writer.finish();
}

test("R10 domain row has exact native/TypeScript byte parity", () => {
  assert.equal(Buffer.from(domainPayload()).toString("hex"), GOLDEN);
  const decoded = decodeRustDomainBundleR10(domainBundle());
  assert.equal(decoded.extractionRevision, BigInt(17));
  assert.equal(decoded.views[0].rows[0].key, "golden");
  assert.deepEqual(decoded.views[0].rows[0].fields.map(([key]) => key), ["bool", "bytes", "f64", "hash", "i64", "string", "u64"]);
  assert.equal(decoded.views[0].rows[0].fields.at(-1)?.[1], BigInt("0x0102030405060708"));
  assert.equal(decoded.views[7].status, "absent");
  assert.deepEqual(decoded.promotion.blockers, ["domain-8:celestial-sky-state-not-authoritative"]);
  assert.equal(decoded.promotion.ready, false);
});

test("R10 domain decoder rejects corruption, order, counts, and forged hashes", () => {
  const good = domainBundle();
  for (const mutate of [
    (value: Uint8Array) => { value[0] ^= 1; },
    (value: Uint8Array) => { value[value.length - 1] ^= 1; },
    (value: Uint8Array) => { value[59] = 2; },
    (value: Uint8Array) => { new DataView(value.buffer).setUint32(72, 2, true); },
  ]) {
    const corrupted = Uint8Array.from(good); mutate(corrupted);
    assert.throws(() => decodeRustDomainBundleR10(corrupted));
  }
  assert.throws(() => decodeRustDomainBundleR10(new Uint8Array(8 * 1_048_576 + 1)), /8 MiB/);
});

test("R10 audio and diagnostics preserve bounded canonical authority", () => {
  const audio = new Writer().raw(encoder.encode("BWAU")).u16(2).u64(11).u32(2).u32(2).u32(0)
    .u64(1).u64(10).string("player").u8(0).f64(1)
    .u64(2).u64(11).string("player").u8(1).f64(2).finish();
  assert.deepEqual(decodeRustAudioExtractionR10(audio).cues.map((cue) => cue.kind), ["jump", "land"]);
  const reversed = Uint8Array.from(audio);
  // second sequence begins after the first event's fixed and string fields.
  const secondSequence = audio.length - (8 + 8 + 4 + 6 + 1 + 8);
  new DataView(reversed.buffer).setBigUint64(secondSequence, BigInt(1), true);
  assert.throws(() => decodeRustAudioExtractionR10(reversed), /strictly increasing/);

  const diagnostics = new Writer().raw(encoder.encode("BWRX")).u16(2).u64(11);
  for (let index = 0; index < 7; index += 1) diagnostics.u64(index);
  diagnostics.raw(Uint8Array.from({ length: 16 }, () => 0x11));
  for (let index = 0; index < 29; index += 1) diagnostics.u64(index);
  diagnostics.raw([0, 1, 0, 1, 0]).raw(new Uint8Array(32));
  const decoded = decodeRustRuntimeDiagnosticsR10(diagnostics.finish());
  assert.equal(decoded.counters.length, 29);
  assert.deepEqual(decoded.flags, [false, true, false, true, false]);
});

test("R10 scene composer installs domain metadata atomically and rejects divergent replay", () => {
  const diagnosticsWriter = new Writer().raw(encoder.encode("BWRX")).u16(2).u64(11);
  for (let index = 0; index < 7; index += 1) diagnosticsWriter.u64(index);
  diagnosticsWriter.raw(Uint8Array.from({ length: 16 }, () => 0x11));
  for (let index = 0; index < 29; index += 1) diagnosticsWriter.u64(index);
  diagnosticsWriter.raw([0, 0, 0, 1, 0]).raw(new Uint8Array(32));
  const audio = new Writer().raw(encoder.encode("BWAU")).u16(2).u64(11).u32(0).u32(0).u32(0).finish();
  const extraction = (hud: Uint8Array): RustIntegratedRuntimeExtractionV1 => Object.freeze({
    identity: Object.freeze({
      universeId: "1",
      locationId: "surface",
      revision: Object.freeze({ epoch: 1, world: 1, entities: 1, gameplay: 1, persistence: 1, network: 1, simulation: 1 }),
      tick: 11,
      stateHash: "11".repeat(16),
    }),
    extractionRevision: 17,
    render: new Uint8Array(),
    hud,
    audio,
    platformRequests: new Uint8Array(),
    diagnostics: diagnosticsWriter.finish(),
    extractionHash: "00".repeat(16),
  });
  const sink: RenderSceneExtractionSinkR10 = Object.freeze({
    resources: () => true,
    frame: () => true,
    resize: () => undefined,
    requestRecovery: () => true,
    diagnostics: () => Object.freeze({ state: "ready" }),
  });
  const composer = new RustRenderSceneComposerR10({
    sink,
    epoch: BigInt(1),
    trustedContentManifestHash: Uint8Array.from({ length: 16 }, () => 0x22),
    trustedModelCatalogHash: "aa".repeat(16),
    trustedModelCatalogRevision: BigInt(1),
  });
  const context = Object.freeze({
    epoch: BigInt(1),
    frameSequence: BigInt(1),
    simulationTick: BigInt(11),
    animationTimeMicros: BigInt(0),
    camera: Object.freeze({ position: [0, 0, 0] as const, orientation: [0, 0, 0, 1] as const, verticalFovRadians: 1, near: 0.1, far: 128, viewport: [800, 600] as const }),
    environment: Object.freeze({ clearRgba8: [0, 0, 0, 255] as const, ambientRgb8: [0, 0, 0] as const, ambientIntensity: 0, sunDirection: [0, 1, 0] as const, sunRgb8: [0, 0, 0] as const, sunIntensity: 0, fogRgb8: [0, 0, 0] as const, fogNear: 0, fogFar: 128, underwater: 0, caveOcclusion: 0 }),
  });
  const first = extraction(domainBundle());
  assert.equal(composer.submitRuntimeExtraction(first, context), true);
  assert.equal(composer.authoritativeMetadata().views.length, 8);
  assert.equal(composer.diagnostics().domainBlockers, 1);
  const revision = composer.authoritativeMetadata().revision;
  assert.equal(composer.submitRuntimeExtraction(first, context), true);
  assert.equal(composer.authoritativeMetadata().revision, revision, "exact replay is idempotent");
  const changedPayload = domainPayload();
  changedPayload[changedPayload.length - 1] ^= 1;
  assert.throws(() => composer.submitRuntimeExtraction(extraction(domainBundle(changedPayload)), context), /stale authoritative/);
  assert.equal(composer.authoritativeMetadata().revision, revision, "divergent replay cannot partially install metadata");
});
