import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  decodeRenderEntityModelCatalogR10,
  findRenderEntityCompiledModelR10,
  renderEntityAttachmentStableIdR10,
  renderEntityStableIdR10,
  type RenderEntityModelCatalogManifestR10,
} from "../app/game/rust-render-entity-catalog-r10.ts";
import {
  RENDER_ENTITY_ACTION_PHASE_SHIFT_R10,
  RustEntityRenderExtractionR10,
  type RenderEntityAuthoritativeExtractionR10,
  type RenderEntityAuthoritativeRecordR10,
  type RenderEntityFrameContextR10,
  type RenderEntityModelAttestationR10,
} from "../app/game/rust-render-entity-extraction-r10.ts";
import { encodeRustEntityExtractionR6V3 } from "../app/game/rust-entity-authority-codec-r6.ts";
import {
  decodeRenderFrameV2,
  encodeRenderFrameV2,
  encodeRenderResourceBatchV2,
} from "../app/game/rust-render-extraction-v2.ts";

const ROOT = path.resolve(import.meta.dirname, "..");
const FIXTURE_PATH = path.join(ROOT, "tests", "fixtures", "rust-engine", "r10", "entities", "entity-visual-scenarios-v1.json");

type CompactRecord = Readonly<{
  id: string;
  tier: RenderEntityAuthoritativeRecordR10["simulationTier"];
  residency: RenderEntityAuthoritativeRecordR10["residency"];
  model: string;
  class: RenderEntityAuthoritativeRecordR10["class"];
  name: string;
  mountSeat?: number;
  mountOccupant?: string;
  parentMount?: string;
  occupiedSeat?: number;
  equipment?: string;
}>;

type VisualFixture = Readonly<{
  schema: 1;
  contentManifestHash: string;
  modelRevision: number;
  modelHashes: Readonly<Record<string, string>>;
  scenarios: readonly Readonly<{
    name: string;
    records: readonly CompactRecord[];
    expected: Readonly<{
      resourceHash: string;
      frameHash: string;
      resourceBytes: number;
      frameBytes: number;
      instances: number;
    }>;
  }>[];
}>;

function hex(value: string) {
  assert.match(value, /^[0-9a-f]+$/u);
  assert.equal(value.length % 2, 0);
  return Uint8Array.from(value.match(/../gu)!.map((item) => Number.parseInt(item, 16)));
}

async function harness() {
  const fixture = JSON.parse(await readFile(FIXTURE_PATH, "utf8")) as VisualFixture;
  const manifestSource = JSON.parse(await readFile(path.join(ROOT, "public", "renderer", "manifest.json"), "utf8")) as Record<string, unknown>;
  const current = String(manifestSource.current);
  const catalogBytes = new Uint8Array(await readFile(path.join(ROOT, "public", "renderer", current, "models.bwm2")));
  const manifest: RenderEntityModelCatalogManifestR10 = {
    schema: 2,
    format: "blockwild-compiled-model-catalog-v2",
    revision: BigInt(1),
    current,
    sha256: String(manifestSource.sha256),
    catalogHash: String(manifestSource.catalogHash),
    byteLength: Number(manifestSource.byteLength),
    modelCount: Number(manifestSource.modelCount),
    nodeCount: Number(manifestSource.nodeCount),
  };
  const catalog = await decodeRenderEntityModelCatalogR10(catalogBytes, manifest);
  const runtime = manifestSource.runtime as { artifactHash: string; frameFixture: string };
  const baseFrame = decodeRenderFrameV2(new Uint8Array(await readFile(path.join(ROOT, "public", "renderer", runtime.artifactHash, "canonical-frame.bwrf"))));
  const attestations: RenderEntityModelAttestationR10[] = Object.entries(fixture.modelHashes).map(([modelKey, contentHash]) => ({
    modelKey,
    revision: fixture.modelRevision,
    contentHash: hex(contentHash),
  }));
  const createAdapter = (caps: { maxInstances?: number; maxResourceOperations?: number } = {}) => new RustEntityRenderExtractionR10({
    catalog,
    expectedContentManifestHash: hex(fixture.contentManifestHash),
    modelAttestations: attestations,
    equipmentModels: [{ itemKey: "iron_sword", modelKey: "held-sword" }],
    ...caps,
  });
  return { fixture, catalog, baseFrame, createAdapter };
}

function recordFromFixture(
  compact: CompactRecord,
  fixture: VisualFixture,
  ordinal: number,
): RenderEntityAuthoritativeRecordR10 {
  const id = BigInt(compact.id);
  const occupiedSeat = compact.occupiedSeat ?? null;
  const ownSeats: Array<RenderEntityAuthoritativeRecordR10["mount"]["seats"][number]> = [];
  if (compact.mountSeat !== undefined) ownSeats.push({
    index: compact.mountSeat,
    role: "rider",
    offset: { x: 0, y: 1.85, z: -0.2 },
    occupant: BigInt(compact.mountOccupant!),
    controlWeightMilli: 1_000,
  });
  return Object.freeze({
    entityId: id,
    residency: compact.residency,
    class: compact.class,
    simulationTier: compact.tier,
    protection: BigInt(ordinal + 3),
    entityRevision: BigInt(100 + ordinal),
    externalEntityId: `external-${compact.id}`,
    specimenId: `標本-${compact.id}`,
    kindKey: compact.model,
    variantKey: ordinal === 2 ? "aurora-β" : null,
    name: compact.name,
    modelKey: compact.model,
    modelRevision: fixture.modelRevision,
    modelHash: hex(fixture.modelHashes[compact.model]),
    position: Object.freeze({ x: ordinal * 3.25, y: 12 + ordinal * 0.5, z: -ordinal * 2.5 }),
    yaw: Math.fround(ordinal * 0.21),
    velocity: Object.freeze({ x: 0.125 * ordinal, y: 0, z: -0.0625 * ordinal }),
    health: 18,
    maximumHealth: 24,
    tamed: ordinal % 2 === 0,
    ageTicks: BigInt(40_000 + ordinal * 37),
    movementMode: compact.parentMount ? "mounted" : compact.class === "creature" ? "ground" : "ground",
    grounded: true,
    submerged: false,
    lastDamageTick: BigInt(600 + ordinal),
    action: Object.freeze({ key: ordinal % 2 === 0 ? "idle" : "stride", phase: ordinal + 1, startedTick: BigInt(690), endsTick: BigInt(760), target: null }),
    equipment: Object.freeze(compact.equipment ? [["main_hand", Object.freeze({
      itemKey: compact.equipment,
      count: 1,
      durability: 312,
      custom: Object.freeze([["inscription", Uint8Array.from([0, 0x80, 0xff])] as const]),
    })] as const] : []),
    mount: Object.freeze({
      parentMount: compact.parentMount ? BigInt(compact.parentMount) : null,
      occupiedSeat,
      acceptsRiders: compact.mountSeat !== undefined,
      saddleKey: compact.mountSeat !== undefined ? "deepgear-saddle" : null,
      seats: Object.freeze(ownSeats),
    }),
    research: Object.freeze([["ecology", 2], ["identity", ordinal + 1]] as const),
  });
}

function sourceForScenario(
  fixture: VisualFixture,
  scenario: VisualFixture["scenarios"][number],
  extractionRevision = BigInt(77),
): RenderEntityAuthoritativeExtractionR10 {
  const records = Object.freeze(scenario.records.map((record, index) => recordFromFixture(record, fixture, index)));
  return Object.freeze({
    schema: 3,
    extractionRevision,
    authorityTick: BigInt(700),
    contentManifestHash: hex(fixture.contentManifestHash),
    contentReady: true,
    total: records.length,
    selected: records.length,
    omitted: 0,
    records,
  });
}

function context(baseFrame: ReturnType<typeof decodeRenderFrameV2>): RenderEntityFrameContextR10 {
  return Object.freeze({
    epoch: BigInt(12),
    frameSequence: BigInt(31),
    simulationTick: BigInt(700),
    animationTimeMicros: BigInt(35_000_000),
    camera: baseFrame.camera,
    environment: baseFrame.environment,
  });
}

test("R10 converts hero, nearby, coarse, dormant, Unicode, and exact BWR6 v3 bytes", async () => {
  const { fixture, catalog, baseFrame, createAdapter } = await harness();
  const scenario = fixture.scenarios.find((item) => item.name === "tier-matrix")!;
  const source = sourceForScenario(fixture, scenario);
  const result = createAdapter().extract(source, context(baseFrame));
  assert.deepEqual(result.stats.tiers, { hero: 1, nearby: 1, coarse: 1, dormant: 1 });
  assert.equal(result.stats.hiddenDormant, 1);
  assert.equal(result.presentations[2].name, "Ægir 🐉");
  assert.equal(result.presentations[2].variantKey, "aurora-β");
  assert.equal(result.presentations[3].name, "眠る鹿");
  assert.equal(result.presentations[3].visible, false);
  assert.equal(result.presentations[3].instanceIds.length, 0);
  assert.equal(result.presentations[0].instanceIds.length, findRenderEntityCompiledModelR10(catalog, "asterjaw")!.nodes.length);
  assert.equal(result.presentations[1].instanceIds.length, findRenderEntityCompiledModelR10(catalog, "hearthback-badger")!.nodes.length);
  assert.ok(result.presentations[2].instanceIds.length < findRenderEntityCompiledModelR10(catalog, "sea-dragon")!.nodes.length);
  assert.deepEqual(result.presentations[0].research, [["ecology", 2], ["identity", 1]]);
  assert.equal(result.presentations[0].protection, BigInt(3));
  assert.deepEqual(result.contentManifestHash, hex(fixture.contentManifestHash));
  assert.deepEqual(result.presentations[0].modelHash, hex(fixture.modelHashes.asterjaw));
  const heroInstance = result.frame.instances.find((instance) => instance.stableId === result.presentations[0].instanceIds[0])!;
  assert.equal(heroInstance.animationFlags >>> RENDER_ENTITY_ACTION_PHASE_SHIFT_R10, source.records[0].action.phase);

  const fromBytes = createAdapter().extractBytes(encodeRustEntityExtractionR6V3(source), context(baseFrame));
  assert.ok(result.resources);
  assert.ok(fromBytes.resources);
  assert.deepEqual(fromBytes.resources.batchHash, result.resources.batchHash);
  assert.deepEqual(fromBytes.frame.frameHash, result.frame.frameHash);
  assert.deepEqual(fromBytes.presentations, result.presentations);

  const resourceBytes = encodeRenderResourceBatchV2(result.resources);
  const frameBytes = encodeRenderFrameV2(result.frame);
  assert.equal(Buffer.from(result.resources.batchHash).toString("hex"), scenario.expected.resourceHash);
  assert.equal(Buffer.from(result.frame.frameHash).toString("hex"), scenario.expected.frameHash);
  assert.equal(resourceBytes.byteLength, scenario.expected.resourceBytes);
  assert.equal(frameBytes.byteLength, scenario.expected.frameBytes);
  assert.equal(result.frame.instances.length, scenario.expected.instances);
});

test("R10 preserves mounted, equipped, and large articulated creature structure", async () => {
  const { fixture, baseFrame, createAdapter } = await harness();
  const scenario = fixture.scenarios.find((item) => item.name === "mounted-equipped-large")!;
  const source = sourceForScenario(fixture, scenario, BigInt(88));
  const result = createAdapter().extract(source, context(baseFrame));
  assert.ok(result.resources);
  const mountId = BigInt(scenario.records[0].id);
  const riderId = BigInt(scenario.records[1].id);
  const seatAnchor = renderEntityAttachmentStableIdR10(mountId, "seat:0", 0);
  const riderRoots = result.frame.instances.filter((instance) => result.presentations[1].instanceIds.includes(instance.stableId) && instance.parent === seatAnchor);
  assert.ok(riderRoots.length > 0, "rider roots should attach to the authoritative seat anchor");
  const anchor = result.frame.instances.find((instance) => instance.stableId === seatAnchor);
  assert.ok(anchor);
  assert.equal(anchor.visibilityMask, 0);
  assert.ok(result.presentations[0].instanceIds.length >= 200, "the large sea dragon should retain its authored detail");
  assert.equal(result.presentations[1].equipment.length, 1);
  assert.equal(result.presentations[1].equipment[0].itemKey, "iron_sword");
  assert.equal(result.presentations[1].equipment[0].instanceIds.length, 5);
  assert.deepEqual(result.presentations[1].equipment[0].custom[0][1], Uint8Array.from([0, 0x80, 0xff]));
  assert.ok(result.presentations[1].equipment[0].instanceIds.every((id) => result.frame.instances.some((instance) => instance.stableId === id)));
  assert.equal(result.frame.instances.some((instance) => instance.stableId === renderEntityStableIdR10(riderId, 1)), true);

  const resourceBytes = encodeRenderResourceBatchV2(result.resources);
  const frameBytes = encodeRenderFrameV2(result.frame);
  assert.equal(Buffer.from(result.resources.batchHash).toString("hex"), scenario.expected.resourceHash);
  assert.equal(Buffer.from(result.frame.frameHash).toString("hex"), scenario.expected.frameHash);
  assert.equal(resourceBytes.byteLength, scenario.expected.resourceBytes);
  assert.equal(frameBytes.byteLength, scenario.expected.frameBytes);
  assert.equal(result.frame.instances.length, scenario.expected.instances);
});

test("R10 emits deterministic resource deltas and replays them only at explicit epoch/reset boundaries", async () => {
  const { fixture, baseFrame, createAdapter } = await harness();
  const scenario = fixture.scenarios.find((item) => item.name === "tier-matrix")!;
  const firstSource = sourceForScenario(fixture, scenario, BigInt(120));
  const adapter = createAdapter();
  const first = adapter.extract(firstSource, context(baseFrame));
  assert.ok(first.resources);
  assert.equal(first.resources.revision, BigInt(1));
  assert.equal(first.frame.resourceRevision, BigInt(1));

  const secondSource = Object.freeze({
    ...firstSource,
    extractionRevision: BigInt(121),
    authorityTick: BigInt(701),
  });
  const secondContext = Object.freeze({
    ...context(baseFrame),
    frameSequence: BigInt(32),
    simulationTick: BigInt(701),
  });
  const second = adapter.extract(secondSource, secondContext);
  assert.equal(second.resources, null, "unchanged entity models must not be re-uploaded every frame");
  assert.equal(second.stats.resourceOperations, 0);
  assert.equal(second.frame.resourceRevision, BigInt(1));

  const thirdSource = Object.freeze({
    ...firstSource,
    extractionRevision: BigInt(122),
    authorityTick: BigInt(702),
  });
  const nextEpoch = Object.freeze({
    ...context(baseFrame),
    epoch: BigInt(13),
    frameSequence: BigInt(1),
    simulationTick: BigInt(702),
  });
  const third = adapter.extract(thirdSource, nextEpoch);
  assert.ok(third.resources, "a new device epoch must receive a complete resource replay");
  assert.equal(third.resources.revision, BigInt(1));
  assert.equal(third.frame.resourceRevision, BigInt(1));

  adapter.resetResourceReplay();
  const resetSource = Object.freeze({
    ...firstSource,
    extractionRevision: BigInt(123),
    authorityTick: BigInt(703),
  });
  const resetContext = Object.freeze({
    ...nextEpoch,
    frameSequence: BigInt(2),
    simulationTick: BigInt(703),
  });
  const replay = adapter.extract(resetSource, resetContext);
  assert.ok(replay.resources, "an explicit renderer-store reset must replay all model resources");
  assert.equal(replay.resources.revision, BigInt(1));
});

test("R10 fails closed on stale revisions, omissions, caps, and missing identity", async () => {
  const { fixture, baseFrame, createAdapter } = await harness();
  const scenario = fixture.scenarios.find((item) => item.name === "tier-matrix")!;
  const source = sourceForScenario(fixture, scenario, BigInt(10));
  const adapter = createAdapter();
  adapter.extract(source, context(baseFrame));
  assert.throws(() => adapter.extract({ ...source, extractionRevision: BigInt(9) }, context(baseFrame)), /stale/u);
  assert.throws(() => createAdapter().extract({ ...source, total: source.total + 1, omitted: 1 }, context(baseFrame)), /incomplete/u);
  assert.throws(() => createAdapter({ maxInstances: 16 }).extract(source, context(baseFrame)), /instance cap/u);
  assert.throws(() => createAdapter({ maxResourceOperations: 1 }).extract(source, context(baseFrame)), /resource cap/u);
  assert.throws(() => createAdapter().extract({ ...source, contentReady: false }, context(baseFrame)), /not promotable/u);
  assert.throws(() => createAdapter().extract({ ...source, contentManifestHash: Uint8Array.from({ length: 16 }, () => 0) }, context(baseFrame)), /not promotable/u);
  const missingModel = Object.freeze({ ...source.records[0], modelKey: "missing-model" });
  assert.throws(() => createAdapter().extract({ ...source, records: Object.freeze([missingModel, ...source.records.slice(1)]) }, context(baseFrame)), /missing compiled/u);
  const staleModel = Object.freeze({ ...source.records[0], modelRevision: 0 });
  assert.throws(() => createAdapter().extract({ ...source, records: Object.freeze([staleModel, ...source.records.slice(1)]) }, context(baseFrame)), /not promotable/u);
  const wrongHash = Object.freeze({ ...source.records[0], modelHash: Uint8Array.from({ length: 16 }, (_, index) => index + 1) });
  assert.throws(() => createAdapter().extract({ ...source, records: Object.freeze([wrongHash, ...source.records.slice(1)]) }, context(baseFrame)), /content hash mismatch/u);
  const oversized = Object.freeze({ ...source, total: 4_097, selected: 4_097, records: Object.freeze(Array.from({ length: 4_097 }, () => source.records[0])) });
  assert.throws(() => createAdapter().extract(oversized, context(baseFrame)), /record cap/u);
});

test("R10 phase, equipment, mount, and production dependency gates stay explicit", async () => {
  const { fixture, baseFrame, createAdapter } = await harness();
  const tierScenario = fixture.scenarios.find((item) => item.name === "tier-matrix")!;
  const source = sourceForScenario(fixture, tierScenario, BigInt(91));
  const base = createAdapter().extract(source, context(baseFrame));
  const changedRecord = Object.freeze({
    ...source.records[0],
    action: Object.freeze({ ...source.records[0].action, phase: source.records[0].action.phase + 1 }),
  });
  const changed = createAdapter().extract(Object.freeze({
    ...source,
    extractionRevision: BigInt(92),
    records: Object.freeze([changedRecord, ...source.records.slice(1)]),
  }), context(baseFrame));
  assert.notDeepEqual(changed.frame.frameHash, base.frame.frameHash, "authoritative action phase must affect the frame record");

  const mountScenario = fixture.scenarios.find((item) => item.name === "mounted-equipped-large")!;
  const mounted = sourceForScenario(fixture, mountScenario, BigInt(93));
  const unknownEquipment = Object.freeze({
    ...mounted.records[1],
    equipment: Object.freeze([["main_hand", Object.freeze({
      ...mounted.records[1].equipment[0][1],
      itemKey: "unmapped_relic",
    })] as const]),
  });
  assert.throws(() => createAdapter().extract(Object.freeze({
    ...mounted,
    records: Object.freeze([mounted.records[0], unknownEquipment]),
  }), context(baseFrame)), /missing equipment model mapping/u);

  const mountDisagreement = Object.freeze({
    ...mounted.records[1],
    mount: Object.freeze({ ...mounted.records[1].mount, parentMount: BigInt("12884901889") }),
  });
  assert.throws(() => createAdapter().extract(Object.freeze({
    ...mounted,
    records: Object.freeze([mounted.records[0], mountDisagreement]),
  }), context(baseFrame)), /mount and rider authority disagree/u);

  const productionSource = await readFile(path.join(ROOT, "app", "game", "rust-render-entity-extraction-r10.ts"), "utf8");
  assert.doesNotMatch(productionSource, /from\s+["']three["']/u);
  assert.match(productionSource, /decodeRustEntityExtractionR6V3/u);
  assert.match(productionSource, /rustEntityExtractionPromotionStateR6V3/u);
});
