import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  createEmptyRustEntityAuthoritySnapshotR6V2,
  decodeRustEntityAuthoritySnapshotR6V2,
  decodeRustEntityCompatibilityRecordR6V1,
  decodeRustEntityExtractionR6V3,
  encodeRustEntityAuthoritySnapshotR6V2,
  encodeRustEntityCompatibilityRecordR6V1,
  encodeRustEntityExtractionR6V3,
  rustEntityExtractionPromotionStateR6V3,
} from "../app/game/rust-entity-authority-codec-r6.ts";
import type {
  RustEntityAuthoritySnapshotR6V2,
  RustEntityAuthorityKernelR6,
  RustEntityAuthorityRequestR6,
  RustEntityAuthorityResponseR6,
  RustEntityCommandBatchR6,
  RustEntityCompatibilityRecordR6,
  RustEntityComponentsR6,
} from "../app/game/rust-entity-authority-contract-r6.ts";
import { RustEntityAuthorityBrowserServiceR6 } from "../app/game/rust-entity-authority-service-r6.ts";
import {
  RustEntityAuthorityWorkerTransportR6,
  assertRustEntityAuthorityRequestR6,
  installRustEntityAuthorityWorkerHandlerR6,
  type RustEntityAuthorityWorkerPortR6,
} from "../app/game/rust-entity-authority-worker-r6.ts";

const ID = (BigInt(1) << BigInt(32)) | BigInt(1);
const LOCATION = (BigInt(2) << BigInt(32)) | BigInt(7);
const WIRE_FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/rust-engine/r6/entity-wire-v1.json", import.meta.url), "utf8")) as {
  authority: { emptyHex: string; maximumBytes: number };
  extraction: { emptyHex: string; headerBytes: number; maximumBytes: number; maximumRecords: number };
};

function compatibility(externalEntityId = "wyrm-雪-🦋"): RustEntityCompatibilityRecordR6 {
  return {
    schema: 1,
    externalEntityId,
    legacyNumericId: BigInt("18446744073709551614"),
    specimenId: `${externalEntityId}-specimen`,
    kindKey: "ember-wyrm",
    class: "creature",
    variantKey: "aurora-β",
    name: "Mírë 雪",
    locationId: LOCATION,
    position: { x: 1.25, y: 64.5, z: -9.75 },
    yaw: 0.5,
    velocity: { x: 0.25, y: 0, z: -0.5 },
    health: 9,
    maximumHealth: 12,
    ageTicks: BigInt("9007199254740993"),
    naturalSpawned: true,
    everLed: true,
    ownerId: "keeper-🦊",
    tamed: true,
    bondPoints: 712,
    bondTier: "trusted",
    socialGroupId: "flight-α",
    factionId: "sky-covenant",
    settlementId: null,
    equipment: [["saddle", "woven-saddle"]],
    research: [["声", 3], ["ecology", 9]],
    custom: [["z-last", "\u0000ÿ"], ["é-first", "opaque-雪"]],
  };
}

function components(record: RustEntityCompatibilityRecordR6): RustEntityComponentsR6 {
  return {
    vitals: {
      health: record.health, maximumHealth: record.maximumHealth, hungerMilli: 9_000, saturationMilli: 8_000,
      oxygenMilli: 10_000, temperatureMilli: -12, wetnessMilli: 250, environmentFlags: 3,
      lastDamageTick: BigInt(12), lastBreathTick: BigInt(13),
    },
    locomotion: {
      shape: "flying", radius: 0.6, halfHeight: 0.8, mass: 2, stepHeight: 1,
      velocity: record.velocity, desiredVelocity: { x: 1, y: 0.25, z: 0 }, grounded: false, submerged: false,
      movementMode: "fly", action: { key: "bank", phase: 2, startedTick: BigInt(20), endsTick: BigInt(28), target: ID },
      cooldowns: [["breath", BigInt(42)]],
    },
    ai: {
      intent: "follow", intentKey: "follow-keeper", target: ID, home: record.position,
      blackboard: [
        ["binary", { type: "bytes", value: Uint8Array.of(0, 0x80, 0xff) }],
        ["entity", { type: "entity", value: ID }],
        ["fixed", { type: "fixed-milli", value: BigInt(-750) }],
        ["signed", { type: "signed", value: BigInt(-9) }],
        ["text", { type: "text", value: "雪/🦋/ÿ" }],
        ["truth", { type: "bool", value: true }],
        ["unsigned", { type: "unsigned", value: BigInt("18446744073709551613") }],
      ],
      routeEpoch: BigInt(4), routeCursor: 1, route: [{ x: 1, y: 2, z: 3 }], threats: [], decisionDueTick: BigInt(99),
    },
    social: { groupId: record.socialGroupId, leader: null, following: ID, herdRank: -2, dispositionMilli: 400, preferredSeparation: 1.5, lastSocialTick: BigInt(16) },
    mount: { parentMount: null, occupiedSeat: 0, seats: [{ index: 0, role: "rider", offset: { x: 0, y: 1, z: 0 }, occupant: ID, controlWeightMilli: 1_000 }], saddleKey: "woven-saddle", acceptsRiders: true },
    protection: { flags: BigInt(5), firstOwnedTick: BigInt(1), firstLedTick: BigInt(2), enclosureVerifiedTick: null, namedTick: BigInt(3), provenanceKey: "test" },
    network: { ownerPeerId: "peer-雪", lastCommandSequence: BigInt(7), lastCommandTick: BigInt(8), leaseEpoch: BigInt(9), leaseExpiresTick: BigInt(10) },
    care: { stabilized: true, nourishmentMilli: 8_000, trustMilli: 7_000, careStage: 3, lastCareTick: BigInt(11) },
    husbandry: { sex: 2, maturityMilli: 10_000, breedCooldownUntilTick: BigInt(100), gestationUntilTick: BigInt(0), parentSpecimenIds: ["parent-α", "parent-β"] },
    work: { taskKey: "carry", progressMilli: 500, targetEntity: ID, targetCell: [1, -2, 3], carryingItemKey: "ore-雪", dueTick: BigInt(120) },
    equipment: [["saddle", { itemKey: "woven-saddle", count: 1, durability: 88, custom: [["patina", Uint8Array.of(0, 0x80, 0xff)]] }]],
    dragon: { lineageKey: "sunscale", elementKey: "fire", lifeStage: 3, flightStaminaMilli: 9_000, breathChargeMilli: 6_000, eggOrHatchling: false },
    legendary: { encounterKey: "first-dawn", phase: 2, defeated: false, captureLockUntilTick: BigInt(500), worldFlags: [["oath", BigInt(1)]] },
    summon: { originRealmKey: "glass-tide", summonerId: "mage-雪", expiresTick: BigInt(600), grounded: true, groundingItemKey: "world-anchor" },
    sentient: { factionId: "sky-covenant", settlementId: null, occupationKey: "scout", dialogueState: [["met", 1]], reputationMilli: 250 },
    unknownExtensions: [["future-🦋", Uint8Array.of(0, 1, 0x7f, 0x80, 0xff)]],
  };
}

function fullSnapshot(revision = BigInt(7), sequence: bigint | null = BigInt(6)): RustEntityAuthoritySnapshotR6V2 {
  const record = compatibility();
  return {
    schema: 2,
    revision,
    lastSequence: sequence,
    slots: [{ generation: 0, residency: null }, { generation: 1, residency: "hot" }],
    free: [],
    hot: [{
      id: ID, record, components: components(record), entityRevision: BigInt(3), tier: "hero", protection: BigInt(5),
      outOfRangeSeconds: 0.75, lastSimulatedTick: BigInt(222),
    }],
    cold: [],
  };
}

test("BWEC v1 is byte-stable across high-byte UTF-8 and canonical maps", () => {
  const source = compatibility();
  const encoded = encodeRustEntityCompatibilityRecordR6V1(source);
  assert.deepEqual([...encoded.subarray(0, 6)], [0x42, 0x57, 0x45, 0x43, 1, 0]);
  assert(encoded.includes(0x80));
  assert(encoded.includes(0xff), "UTF-8 for ÿ preserves a high byte");
  const decoded = decodeRustEntityCompatibilityRecordR6V1(encoded);
  assert.equal(decoded.name, "Mírë 雪");
  assert.equal(decoded.legacyNumericId, BigInt("18446744073709551614"));
  assert.deepEqual(encodeRustEntityCompatibilityRecordR6V1(decoded), encoded);
});

test("checked-in R6 wire fixture freezes empty authority and extraction headers", () => {
  assert.equal(Buffer.from(encodeRustEntityAuthoritySnapshotR6V2(createEmptyRustEntityAuthoritySnapshotR6V2())).toString("hex"), WIRE_FIXTURE.authority.emptyHex);
  assert.equal(Buffer.from(encodeRustEntityExtractionR6V3({
    schema: 3,
    extractionRevision: BigInt(0),
    authorityTick: BigInt(0),
    contentManifestHash: new Uint8Array(16),
    contentReady: false,
    total: 0,
    selected: 0,
    omitted: 0,
    records: [],
  })).toString("hex"), WIRE_FIXTURE.extraction.emptyHex);
  assert.equal(WIRE_FIXTURE.authority.maximumBytes, 64 * 1_048_576);
  assert.equal(WIRE_FIXTURE.extraction.maximumBytes, 4 * 1_048_576);
  assert.equal(WIRE_FIXTURE.extraction.maximumRecords, 4_096);
  assert.equal(WIRE_FIXTURE.extraction.headerBytes, 51);
});

test("BWEA v2 round-trips full typed authority without losing unknown bytes or u64 revisions", () => {
  const encoded = encodeRustEntityAuthoritySnapshotR6V2(fullSnapshot());
  assert.deepEqual([...encoded.subarray(0, 6)], [0x42, 0x57, 0x45, 0x41, 2, 0]);
  const decoded = decodeRustEntityAuthoritySnapshotR6V2(encoded);
  assert.equal(decoded.revision, BigInt(7));
  assert.equal(decoded.hot[0].components.ai.blackboard.find(([key]) => key === "unsigned")?.[1].value, BigInt("18446744073709551613"));
  assert.deepEqual(decoded.hot[0].components.unknownExtensions[0][1], Uint8Array.of(0, 1, 0x7f, 0x80, 0xff));
  assert.deepEqual(encodeRustEntityAuthoritySnapshotR6V2(decoded), encoded);
});

test("snapshot decoder rejects corrupt magic, schema, truncation, trailing data, and slot inconsistency", () => {
  const encoded = encodeRustEntityAuthoritySnapshotR6V2(fullSnapshot());
  const magic = encoded.slice(); magic[0] ^= 0xff;
  assert.throws(() => decodeRustEntityAuthoritySnapshotR6V2(magic), /invalid magic/);
  const schema = encoded.slice(); schema[4] = 3;
  assert.throws(() => decodeRustEntityAuthoritySnapshotR6V2(schema), /unsupported authority schema/);
  assert.throws(() => decodeRustEntityAuthoritySnapshotR6V2(encoded.subarray(0, encoded.length - 1)), /truncated/);
  const trailing = new Uint8Array(encoded.length + 1); trailing.set(encoded);
  assert.throws(() => decodeRustEntityAuthoritySnapshotR6V2(trailing), /trailing bytes/);
  const inconsistent = fullSnapshot();
  assert.throws(() => encodeRustEntityAuthoritySnapshotR6V2({ ...inconsistent, free: [1] }), /free set/);
});

test("BWR6 v3 preserves authoritative renderer state and exact header offsets", () => {
  const record = compatibility();
  const typed = components(record);
  const contentManifestHash = Uint8Array.from({ length: 16 }, (_, index) => index + 1);
  const modelHash = Uint8Array.from({ length: 16 }, (_, index) => 0xf0 - index);
  const encoded = encodeRustEntityExtractionR6V3({
    schema: 3,
    extractionRevision: BigInt("9007199254740997"),
    authorityTick: BigInt("9007199254740999"),
    contentManifestHash,
    contentReady: true,
    total: 3,
    selected: 2,
    omitted: 1,
    records: [
      {
        entityId: ID, residency: "hot", class: record.class, simulationTier: "hero", protection: BigInt(5), entityRevision: BigInt(77), externalEntityId: record.externalEntityId,
        specimenId: record.specimenId, kindKey: record.kindKey, variantKey: record.variantKey, name: record.name, modelKey: "ember-wyrm-adult", modelRevision: 4, modelHash,
        position: record.position, yaw: record.yaw, velocity: record.velocity, health: record.health, maximumHealth: record.maximumHealth, tamed: record.tamed,
        ageTicks: record.ageTicks, movementMode: typed.locomotion.movementMode, grounded: typed.locomotion.grounded, submerged: typed.locomotion.submerged,
        lastDamageTick: typed.vitals.lastDamageTick, action: typed.locomotion.action, equipment: typed.equipment, mount: typed.mount, research: record.research,
      },
      {
        entityId: (BigInt(3) << BigInt(32)) | BigInt(2), residency: "cold", class: "creature", simulationTier: "dormant", protection: BigInt(0), entityRevision: BigInt(3),
        externalEntityId: "cold-雪", specimenId: "cold-specimen", kindKey: "mossling", variantKey: null, name: null, modelKey: "mossling", modelRevision: 1, modelHash,
        position: { x: -1, y: 12, z: 3 }, yaw: 0, velocity: { x: 0, y: 0, z: 0 }, health: 4, maximumHealth: 4, tamed: false,
        ageTicks: BigInt(200), movementMode: "ground", grounded: true, submerged: false, lastDamageTick: BigInt(0),
        action: { key: "idle", phase: 0, startedTick: BigInt(0), endsTick: BigInt(0), target: null }, equipment: [],
        mount: { parentMount: null, occupiedSeat: null, acceptsRiders: false, saddleKey: null, seats: [] }, research: [["ecology", 1]],
      },
    ],
  });
  const header = new DataView(encoded.buffer, encoded.byteOffset, encoded.byteLength);
  assert.deepEqual([...encoded.subarray(0, 6)], [0x42, 0x57, 0x52, 0x36, 3, 0]);
  assert.equal(header.getBigUint64(6, true), BigInt("9007199254740997"));
  assert.equal(header.getBigUint64(14, true), BigInt("9007199254740999"));
  assert.deepEqual(encoded.subarray(22, 38), contentManifestHash);
  assert.equal(header.getUint8(38), 1);
  assert.equal(header.getUint32(39, true), 3);
  assert.equal(header.getUint32(43, true), 2);
  assert.equal(header.getUint32(47, true), 1);
  const decoded = decodeRustEntityExtractionR6V3(encoded);
  assert.equal(decoded.extractionRevision, BigInt("9007199254740997"));
  assert.equal(decoded.authorityTick, BigInt("9007199254740999"));
  assert.equal(decoded.records[0].name, "Mírë 雪");
  assert.equal(decoded.records[0].entityRevision, BigInt(77));
  assert.deepEqual(decoded.records[0].equipment, typed.equipment);
  assert.deepEqual(decoded.records[0].mount, typed.mount);
  assert.deepEqual(decoded.records[0].research, [["ecology", 9], ["声", 3]]);
  assert.equal(decoded.omitted, 1);
  assert.deepEqual(rustEntityExtractionPromotionStateR6V3(decoded), { ready: true, blockers: [] });
  assert.deepEqual(encodeRustEntityExtractionR6V3(decoded), encoded);
  const corrupt = encoded.slice();
  new DataView(corrupt.buffer, corrupt.byteOffset).setUint32(47, 2, true);
  assert.throws(() => decodeRustEntityExtractionR6V3(corrupt), /counts are inconsistent/);
  const oldSchema = encoded.slice();
  new DataView(oldSchema.buffer, oldSchema.byteOffset).setUint16(4, 2, true);
  assert.throws(() => decodeRustEntityExtractionR6V3(oldSchema), /unsupported extraction schema 2/);
  const zeroHash = new Uint8Array(16);
  const blocked = {
    ...decoded,
    contentReady: false,
    contentManifestHash: zeroHash,
    records: decoded.records.map((item, index) => index === 0 ? { ...item, modelRevision: 0, modelHash: zeroHash } : item),
  };
  const blockedDecoded = decodeRustEntityExtractionR6V3(encodeRustEntityExtractionR6V3(blocked));
  assert.equal(blockedDecoded.contentReady, false);
  assert.equal(blockedDecoded.records[0].modelRevision, 0);
  assert.deepEqual(blockedDecoded.records[0].modelHash, zeroHash);
  assert.deepEqual(rustEntityExtractionPromotionStateR6V3(blockedDecoded), {
    ready: false,
    blockers: ["content-not-ready", "content-manifest-zero", "model-revision-zero", "model-hash-zero"],
  });
});

class SnapshotKernel implements RustEntityAuthorityKernelR6 {
  snapshot = encodeRustEntityAuthoritySnapshotR6V2(createEmptyRustEntityAuthoritySnapshotR6V2()).buffer;
  rejectReplacement = false;

  async handle(request: RustEntityAuthorityRequestR6): Promise<RustEntityAuthorityResponseR6> {
    const base = { protocolVersion: 1 as const, schemaVersion: 1 as const, requestId: request.requestId, runtimeEpoch: request.runtimeEpoch };
    if (request.type === "entity-initialize-r6-v1") {
      if (request.source === "snapshot" && request.bytes) this.snapshot = request.bytes.slice(0);
      const value = decodeRustEntityAuthoritySnapshotR6V2(this.snapshot);
      return { ...base, type: "entity-ready-r6-v1", revision: value.revision, lastSequence: value.lastSequence, entityCount: value.hot.length + value.cold.length };
    }
    if (request.type === "entity-apply-r6-v1") {
      const before = decodeRustEntityAuthoritySnapshotR6V2(this.snapshot);
      const revision = (before.revision + BigInt(1)) % (BigInt(1) << BigInt(64));
      this.snapshot = encodeRustEntityAuthoritySnapshotR6V2({ ...before, revision, lastSequence: request.batch.sequence }).buffer;
      return {
        ...base,
        type: "entity-events-r6-v1",
        result: { schema: 1, sequence: request.batch.sequence, previousRevision: before.revision, revision, events: [] },
      };
    }
    if (request.type === "entity-export-snapshot-r6-v1") {
      const value = decodeRustEntityAuthoritySnapshotR6V2(this.snapshot);
      return { ...base, type: "entity-snapshot-r6-v1", revision: value.revision, bytes: this.snapshot.slice(0) };
    }
    if (request.type === "entity-replace-snapshot-r6-v1") {
      if (this.rejectReplacement) return { ...base, type: "entity-error-r6-v1", code: "fixture-reject", message: "replacement rejected", retriable: false };
      const before = decodeRustEntityAuthoritySnapshotR6V2(this.snapshot);
      const candidate = decodeRustEntityAuthoritySnapshotR6V2(request.bytes);
      this.snapshot = request.bytes.slice(0);
      return { ...base, type: "entity-snapshot-replaced-r6-v1", previousRevision: before.revision, revision: candidate.revision, lastSequence: candidate.lastSequence, entityCount: candidate.hot.length + candidate.cold.length };
    }
    return { ...base, type: "entity-disposed-r6-v1" };
  }
}

class LoopbackWorker implements RustEntityAuthorityWorkerPortR6 {
  private requestListener?: (event: Readonly<{ data: RustEntityAuthorityRequestR6 }>) => void;
  private readonly messageListeners = new Set<(event: Readonly<{ data: RustEntityAuthorityResponseR6 }>) => void>();
  private readonly errorListeners = new Set<(event: unknown) => void>();
  terminated = false;

  constructor(kernel: RustEntityAuthorityKernelR6) {
    installRustEntityAuthorityWorkerHandlerR6({
      addEventListener: (_type, listener) => { this.requestListener = listener; },
      postMessage: (message) => queueMicrotask(() => this.messageListeners.forEach((listener) => listener({ data: message }))),
    }, kernel);
  }

  postMessage(message: RustEntityAuthorityRequestR6) { queueMicrotask(() => this.requestListener?.({ data: message })); }
  addEventListener(type: "message" | "error" | "messageerror", listener: ((event: Readonly<{ data: RustEntityAuthorityResponseR6 }>) => void) | ((event: unknown) => void)) {
    if (type === "message") this.messageListeners.add(listener as (event: Readonly<{ data: RustEntityAuthorityResponseR6 }>) => void);
    else this.errorListeners.add(listener as (event: unknown) => void);
  }
  removeEventListener(type: "message" | "error" | "messageerror", listener: ((event: Readonly<{ data: RustEntityAuthorityResponseR6 }>) => void) | ((event: unknown) => void)) {
    if (type === "message") this.messageListeners.delete(listener as (event: Readonly<{ data: RustEntityAuthorityResponseR6 }>) => void);
    else this.errorListeners.delete(listener as (event: unknown) => void);
  }
  crash(message = "fixture crash") { this.errorListeners.forEach((listener) => listener({ message })); }
  terminate() { this.terminated = true; }
}

test("snapshot replacement validates first and commits atomically only after worker acceptance", async () => {
  const kernel = new SnapshotKernel();
  const service = new RustEntityAuthorityBrowserServiceR6({ workerFactory: () => new LoopbackWorker(kernel) });
  await service.initializeFromSnapshot();
  const before = new Uint8Array(await service.exportSnapshot());
  const corrupt = before.slice(); corrupt[0] ^= 0xff;
  await assert.rejects(service.replaceSnapshot(corrupt), /invalid magic/);
  assert.deepEqual(new Uint8Array(await service.exportSnapshot()), before);
  kernel.rejectReplacement = true;
  await assert.rejects(service.replaceSnapshot(encodeRustEntityAuthoritySnapshotR6V2(fullSnapshot())), /fixture-reject/);
  assert.deepEqual(new Uint8Array(await service.exportSnapshot()), before);
  kernel.rejectReplacement = false;
  await service.replaceSnapshot(encodeRustEntityAuthoritySnapshotR6V2(fullSnapshot()));
  assert.equal(service.diagnostics().revision, BigInt(7));
  assert.deepEqual(new Uint8Array(await service.exportSnapshot()), encodeRustEntityAuthoritySnapshotR6V2(fullSnapshot()));
  await service.dispose();
});

test("service restarts from a bounded baseline and deterministically replays accepted commands", async () => {
  const kernels: SnapshotKernel[] = [];
  const workers: LoopbackWorker[] = [];
  const service = new RustEntityAuthorityBrowserServiceR6({
    maxRestarts: 1,
    workerFactory: () => {
      const kernel = new SnapshotKernel(); kernels.push(kernel);
      const worker = new LoopbackWorker(kernel); workers.push(worker); return worker;
    },
  });
  await service.initializeFromSnapshot();
  const first: RustEntityCommandBatchR6 = { schema: 1, sequence: BigInt(1), expectedRevision: BigInt(0), tick: BigInt(1), commands: [{ type: "hibernate", id: ID }] };
  assert.equal((await service.apply(first)).revision, BigInt(1));
  workers[0].crash();
  const second: RustEntityCommandBatchR6 = { schema: 1, sequence: BigInt(2), expectedRevision: BigInt(1), tick: BigInt(2), commands: [{ type: "hibernate", id: ID }] };
  const result = await service.apply(second);
  assert.equal(result.revision, BigInt(2));
  assert.equal(service.diagnostics().restarts, 1);
  assert.equal(service.diagnostics().journalBatches, 2);
  assert.equal(kernels.length, 2);
  assert.equal(decodeRustEntityAuthoritySnapshotR6V2(kernels[1].snapshot).revision, BigInt(2));
  await service.dispose();
});

test("worker transport ignores stale epochs, times out bounded requests, and rejects unknown variants", async () => {
  let listener: ((event: Readonly<{ data: RustEntityAuthorityResponseR6 }>) => void) | undefined;
  const stale: RustEntityAuthorityResponseR6[] = [];
  const worker: RustEntityAuthorityWorkerPortR6 = {
    postMessage(request) {
      const base = { protocolVersion: 1 as const, schemaVersion: 1 as const, requestId: request.requestId };
      queueMicrotask(() => listener?.({ data: { ...base, runtimeEpoch: request.runtimeEpoch + 1, type: "entity-disposed-r6-v1" } }));
      queueMicrotask(() => listener?.({ data: { ...base, runtimeEpoch: request.runtimeEpoch, type: "entity-disposed-r6-v1" } }));
    },
    addEventListener(type, value) { if (String(type) === "message") listener = value; },
    removeEventListener() {},
  };
  const transport = new RustEntityAuthorityWorkerTransportR6(worker, { onStaleResult: (response) => stale.push(response) });
  const request = { protocolVersion: 1 as const, schemaVersion: 1 as const, requestId: 9, runtimeEpoch: 4, type: "entity-dispose-r6-v1" as const };
  assert.equal((await transport.request(request)).type, "entity-disposed-r6-v1");
  assert.equal(stale.length, 1);
  transport.dispose();

  const silent: RustEntityAuthorityWorkerPortR6 = { postMessage() {}, addEventListener() {}, removeEventListener() {} };
  const timed = new RustEntityAuthorityWorkerTransportR6(silent, { timeoutMs: 5 });
  await assert.rejects(timed.request({ ...request, requestId: 10 }), /timed out/);
  timed.dispose();
  assert.throws(() => assertRustEntityAuthorityRequestR6({ ...request, type: "unknown" } as never), /unknown R6 entity request/);
});
