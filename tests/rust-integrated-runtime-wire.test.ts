import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { TypeScriptCanonicalHasher } from "../app/game/rust-kernel-shadow.ts";
import {
  createRustIntegratedRuntimeCommandBatchV1,
  createRustIntegratedRuntimeDomainOperationV1,
  decodeRustIntegratedRuntimeRequestV1,
  decodeRustIntegratedRuntimeResponseV1,
  encodeRustIntegratedRuntimeRequestV1,
  encodeRustIntegratedRuntimeResponseV1,
  RustIntegratedRuntimeCodecError,
  rustIntegratedRuntimeExtractionChecksumV1,
  rustIntegratedRuntimeWireChecksumV1,
} from "../app/game/rust-integrated-runtime-codec.ts";
import type {
  RustIntegratedRuntimeCommandBatchV1,
  RustIntegratedRuntimeIdentityV1,
  RustIntegratedRuntimeRequestV1,
  RustIntegratedRuntimeResponseV1,
} from "../app/game/rust-integrated-runtime-contract.ts";
import {
  RustIntegratedRuntimeServiceError,
  RustIntegratedRuntimeServiceV1,
} from "../app/game/rust-integrated-runtime-service.ts";

const ZERO_HASH = "00000000000000000000000000000000";
const ARTIFACT_HASH = "a".repeat(64);
const CAPABILITIES = Object.freeze([
  "awaited-receipts-v1",
  "bounded-extraction-v1",
  "fixed-step-input-v1",
  "integrated-runtime-v1",
]);
const FIXTURE = JSON.parse(readFileSync(new URL("./fixtures/rust-engine/integrated-runtime-v1/wire-fixtures.json", import.meta.url), "utf8")) as {
  checksumVectors: readonly { name: string; inputHex: string; checksumHex: string }[];
  legacyParityRegression: Readonly<{
    domain: string;
    inputHex: string;
    typescriptCanonicalHex: string;
    rustCanonicalHex: string;
    buggyU8RotateHex: string;
  }>;
  envelopes: readonly { name: string; direction: "request" | "response"; hex: string }[];
};

function fixtureIdentity(): RustIntegratedRuntimeIdentityV1 {
  return Object.freeze({
    universeId: "univ\u00e9rse-\u{1f33f}",
    locationId: "surface",
    revision: Object.freeze({ epoch: 1, world: 2, entities: 3, gameplay: 4, persistence: 5, network: 6, simulation: 7 }),
    tick: 8,
    stateHash: "1".repeat(32),
  });
}

function fixtureHex(name: string) {
  const fixture = FIXTURE.envelopes.find((entry) => entry.name === name);
  assert.ok(fixture, `missing integrated runtime fixture ${name}`);
  return fixture.hex;
}

function extraction(
  current: RustIntegratedRuntimeIdentityV1,
  extractionRevision: number,
  channels: Readonly<{
    render?: Uint8Array;
    hud?: Uint8Array;
    audio?: Uint8Array;
    platformRequests?: Uint8Array;
    diagnostics?: Uint8Array;
  }> = {},
) {
  const value = {
    identity: current,
    extractionRevision,
    render: channels.render ?? new Uint8Array(),
    hud: channels.hud ?? new Uint8Array(),
    audio: channels.audio ?? new Uint8Array(),
    platformRequests: channels.platformRequests ?? new Uint8Array(),
    diagnostics: channels.diagnostics ?? new Uint8Array(),
  };
  return Object.freeze({ ...value, extractionHash: rustIntegratedRuntimeExtractionChecksumV1(value) });
}

function toHex(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("hex");
}

function fromHex(value: string) {
  return Uint8Array.from(Buffer.from(value, "hex"));
}

function identity(tick = 0, stateHash = "1".repeat(32)): RustIntegratedRuntimeIdentityV1 {
  return Object.freeze({
    universeId: "1",
    locationId: "Blockwild 🌿",
    revision: Object.freeze({ epoch: 4, world: 7, entities: 3, gameplay: 9, persistence: 2, network: 1, simulation: 5 }),
    tick,
    stateHash,
  });
}

function command(expected = identity()): RustIntegratedRuntimeCommandBatchV1 {
  return createRustIntegratedRuntimeCommandBatchV1({
    commandId: "command:block-edit:1",
    idempotencyKey: "player-one:block-edit:1",
    actorId: "player-one",
    expected,
    operations: [createRustIntegratedRuntimeDomainOperationV1({
      domain: "world",
      typeId: "blockwild.world.mutation.r4.v1",
      schema: 1,
      payload: Uint8Array.from([0x00, 0x7f, 0x80, 0xff, 0xf0, 0x9f, 0x8c, 0xbf]),
    })],
  });
}

function createRequest(): Extract<RustIntegratedRuntimeRequestV1, { type: "runtime-create-v1" }> {
  return Object.freeze({
    type: "runtime-create-v1",
    requestId: 1,
    clientEpoch: 2,
    config: Object.freeze({
      worldSeed: "A🌿B",
      universeId: "1",
      locationId: "Blockwild 🌿",
      sessionId: "local-host",
      contentHash: "2".repeat(32),
      generatorHash: "3".repeat(32),
      waterBlockId: 7,
      directionalBlockIds: Object.freeze([91, 12, 91]),
      waterloggedBlockIds: Object.freeze([300, 18]),
    }),
  });
}

test("integrated wire round-trips canonical UTF-8 and high binary bytes", () => {
  const create = createRequest();
  assert.deepEqual(decodeRustIntegratedRuntimeRequestV1(encodeRustIntegratedRuntimeRequestV1(create)), {
    ...create,
    config: { ...create.config, directionalBlockIds: [12, 91], waterloggedBlockIds: [18, 300] },
  });
  const request: RustIntegratedRuntimeRequestV1 = Object.freeze({
    type: "runtime-command-v1",
    requestId: 2,
    clientEpoch: 2,
    batch: command(),
  });
  const encoded = encodeRustIntegratedRuntimeRequestV1(request);
  assert.deepEqual(decodeRustIntegratedRuntimeRequestV1(encoded), request);
  assert.equal(rustIntegratedRuntimeWireChecksumV1(request.batch.operations[0].payload), "18007f90bc156d363883ac4694dd592e");
  const damaged = Uint8Array.from(encoded);
  damaged[damaged.length - 1] ^= 0xff;
  assert.throws(() => decodeRustIntegratedRuntimeRequestV1(damaged), (error: unknown) => error instanceof RustIntegratedRuntimeCodecError && error.code === "checksum");
});

test("integrated wire rejects lone surrogates instead of silently changing identifiers", () => {
  const request = createRequest();
  assert.throws(
    () => encodeRustIntegratedRuntimeRequestV1({ ...request, config: { ...request.config, worldSeed: `bad${String.fromCharCode(0xd800)}` } }),
    (error: unknown) => error instanceof RustIntegratedRuntimeCodecError && error.code === "invalid-unicode",
  );
});

test("legacy canonical hash parity uses Rust's widened u64 rotation for high bytes", () => {
  const fixture = FIXTURE.legacyParityRegression;
  const payload = fromHex(fixture.inputHex);
  const typescript = new TypeScriptCanonicalHasher(fixture.domain).writeBytes(payload).finishHex();
  assert.equal(typescript, fixture.typescriptCanonicalHex);
  assert.equal(typescript, fixture.rustCanonicalHex, "actual Rust and TypeScript legacy hash implementations agree");
  assert.equal(buggyLegacyU8RotateHash(fixture.domain, payload), fixture.buggyU8RotateHex);
  assert.notEqual(typescript, fixture.buggyU8RotateHex, "regression guard: rotating as u8 manufactures a false mismatch");
  assert.equal(rustIntegratedRuntimeWireChecksumV1(payload), "ef264763ac90023338b59f1e51918657");
});

test("TypeScript encoder exactly matches the native cross-language fixture bytes", () => {
  for (const vector of FIXTURE.checksumVectors) {
    assert.equal(rustIntegratedRuntimeWireChecksumV1(fromHex(vector.inputHex)), vector.checksumHex, vector.name);
  }
  const fixtureId = fixtureIdentity();
  const create: RustIntegratedRuntimeRequestV1 = {
    type: "runtime-create-v1",
    requestId: 1,
    clientEpoch: 2,
    config: {
      worldSeed: "A\u{1f33f}B",
      universeId: fixtureId.universeId,
      locationId: fixtureId.locationId,
      sessionId: "local-host",
      contentHash: "2".repeat(32),
      generatorHash: "3".repeat(32),
      waterBlockId: 7,
      directionalBlockIds: [91, 12, 91],
      waterloggedBlockIds: [300, 18],
    },
  };
  assert.equal(toHex(encodeRustIntegratedRuntimeRequestV1(create)), fixtureHex("create-unicode-sorted-block-sets"));
  const fixtureCommand = createRustIntegratedRuntimeCommandBatchV1({
    commandId: "command:block-edit:1",
    idempotencyKey: "player-one:block-edit:1",
    actorId: "player-one",
    expected: fixtureId,
    operations: [createRustIntegratedRuntimeDomainOperationV1({
      domain: "world",
      typeId: "blockwild.world.mutation.r4.v1",
      schema: 1,
      payload: fromHex("007f80fff09f8cbf"),
    })],
  });
  assert.equal(toHex(encodeRustIntegratedRuntimeRequestV1({ type: "runtime-command-v1", requestId: 2, clientEpoch: 2, batch: fixtureCommand })), fixtureHex("command-high-binary-payload"));
  const ready: RustIntegratedRuntimeResponseV1 = {
    type: "runtime-ready-v1",
    requestId: 1,
    clientEpoch: 2,
    workerEpoch: 3,
    runtimeHandle: 17,
    identity: fixtureId,
    artifactHash: ARTIFACT_HASH,
    instanceId: "runtime:17",
    capabilities: [...CAPABILITIES].reverse(),
  };
  assert.equal(toHex(encodeRustIntegratedRuntimeResponseV1(ready)), fixtureHex("ready-unicode-identity"));
  const nativeReceipt = decodeRustIntegratedRuntimeResponseV1(fromHex(fixtureHex("native-accepted-receipt-high-binary")));
  assert.equal(nativeReceipt.type, "runtime-command-receipt-v1");
  assert.equal(nativeReceipt.type === "runtime-command-receipt-v1" && nativeReceipt.receipt.status === "accepted"
    ? toHex(nativeReceipt.receipt.domainReceipts[0].payload)
    : null, "80ff", "TypeScript must decode the exact native high-byte receipt payload");
  const restored: RustIntegratedRuntimeResponseV1 = {
    type: "runtime-restored-v1",
    requestId: 6,
    clientEpoch: 4,
    workerEpoch: 5,
    runtimeHandle: 18,
    identity: fixtureId,
    checkpointHash: ZERO_HASH,
    artifactHash: ARTIFACT_HASH,
    instanceId: "runtime:18",
    capabilities: CAPABILITIES,
  };
  assert.equal(toHex(encodeRustIntegratedRuntimeResponseV1(restored)), fixtureHex("restored-re-attestation"));
});

test("all integrated response families are bounded and exact", () => {
  const current = identity();
  const next = identity(1, "4".repeat(32));
  const responses: RustIntegratedRuntimeResponseV1[] = [
    { type: "runtime-ready-v1", requestId: 1, clientEpoch: 2, workerEpoch: 3, runtimeHandle: 17, identity: current, artifactHash: ARTIFACT_HASH, instanceId: "runtime:17", capabilities: CAPABILITIES },
    { type: "runtime-command-receipt-v1", requestId: 2, clientEpoch: 2, workerEpoch: 3, receipt: { status: "accepted", commandId: command().commandId, idempotencyKey: command().idempotencyKey, commandHash: command().commandHash, before: current, after: next, domainReceipts: [createRustIntegratedRuntimeDomainOperationV1({ domain: "world", typeId: "blockwild.world.receipt.r4.v1", schema: 1, payload: Uint8Array.from([0x80, 0xff]) })], receiptHash: ZERO_HASH } },
    { type: "runtime-step-result-v1", requestId: 3, clientEpoch: 2, workerEpoch: 3, identity: next, fixedSteps: 1, inputsApplied: 2, commandsProcessed: 1, commandsAccepted: 1, replayHash: ZERO_HASH },
    { type: "runtime-extraction-v1", requestId: 4, clientEpoch: 2, workerEpoch: 3, extraction: extraction(next, 8, { render: Uint8Array.from([1]), hud: Uint8Array.from([2]), audio: Uint8Array.from([3]), diagnostics: Uint8Array.from([0x80]) }) },
    { type: "runtime-checkpoint-v1", requestId: 5, clientEpoch: 2, workerEpoch: 3, identity: next, checkpoint: Uint8Array.from([0x80, 0xff]), checkpointHash: ZERO_HASH },
    { type: "runtime-restored-v1", requestId: 6, clientEpoch: 4, workerEpoch: 5, runtimeHandle: 18, identity: next, checkpointHash: ZERO_HASH, artifactHash: ARTIFACT_HASH, instanceId: "runtime:18", capabilities: CAPABILITIES },
    { type: "runtime-shutdown-v1", requestId: 7, clientEpoch: 4, workerEpoch: 5 },
    { type: "runtime-error-v1", requestId: 8, clientEpoch: 4, workerEpoch: 5, code: "stale-runtime", message: "restore required", current },
  ];
  for (const response of responses) assert.deepEqual(decodeRustIntegratedRuntimeResponseV1(encodeRustIntegratedRuntimeResponseV1(response)), response);
  const validExtraction = extraction(next, 9, { render: Uint8Array.from([0x80, 0xff]) });
  assert.throws(
    () => encodeRustIntegratedRuntimeResponseV1({
      type: "runtime-extraction-v1",
      requestId: 9,
      clientEpoch: 2,
      workerEpoch: 3,
      extraction: { ...validExtraction, extractionHash: ZERO_HASH },
    }),
    (error: unknown) => error instanceof RustIntegratedRuntimeCodecError && error.code === "extraction-hash",
  );
});

test("protocol-test service awaits and caches one deterministic receipt without claiming Wasm authority", async () => {
  let calls = 0;
  let current = identity();
  const service = new RustIntegratedRuntimeServiceV1({
    mode: "protocol-test",
    transportFactory: () => ({
      async request(request) {
        calls += 1;
        if (request.type === "runtime-create-v1") return { type: "runtime-ready-v1", requestId: request.requestId, clientEpoch: request.clientEpoch, workerEpoch: 9, runtimeHandle: 1, identity: current, artifactHash: "fixture-not-wasm", instanceId: "fixture", capabilities: CAPABILITIES };
        if (request.type === "runtime-command-v1") {
          const before = current;
          current = identity(1, "5".repeat(32));
          return { type: "runtime-command-receipt-v1", requestId: request.requestId, clientEpoch: request.clientEpoch, workerEpoch: 9, receipt: { status: "accepted", commandId: request.batch.commandId, idempotencyKey: request.batch.idempotencyKey, commandHash: request.batch.commandHash, before, after: current, domainReceipts: [], receiptHash: ZERO_HASH } };
        }
        if (request.type === "runtime-shutdown-v1") return { type: "runtime-shutdown-v1", requestId: request.requestId, clientEpoch: request.clientEpoch, workerEpoch: 9 };
        throw new Error(`unexpected ${request.type}`);
      },
      dispose() {},
    }),
  });
  await service.start(createRequest().config);
  assert.equal(service.isAuthoritative(), false);
  const batch = command();
  const first = await service.command(batch);
  const second = await service.command(batch);
  assert.deepEqual(second, first);
  assert.equal(calls, 2, "create plus one command; retry is served from the idempotency receipt cache");
  assert.equal(service.diagnostics().verification, "protocol-test");
  assert.equal(service.diagnostics().cachedReceipts, 1);
  await service.shutdown();
});

test("concurrent batches authored from one snapshot reject stale locally without failing authority", async () => {
  let commandCalls = 0;
  let current = identity();
  const service = new RustIntegratedRuntimeServiceV1({
    mode: "protocol-test",
    transportFactory: () => ({
      async request(request): Promise<RustIntegratedRuntimeResponseV1> {
        if (request.type === "runtime-create-v1") {
          return { type: "runtime-ready-v1", requestId: request.requestId, clientEpoch: request.clientEpoch, workerEpoch: 4, runtimeHandle: 1, identity: current, artifactHash: "fixture", instanceId: "concurrent", capabilities: CAPABILITIES };
        }
        if (request.type === "runtime-command-v1") {
          commandCalls += 1;
          const before = current;
          current = identity(before.tick + 1, "6".repeat(32));
          return {
            type: "runtime-command-receipt-v1",
            requestId: request.requestId,
            clientEpoch: request.clientEpoch,
            workerEpoch: 4,
            receipt: { status: "accepted", commandId: request.batch.commandId, idempotencyKey: request.batch.idempotencyKey, commandHash: request.batch.commandHash, before, after: current, domainReceipts: [], receiptHash: ZERO_HASH },
          };
        }
        throw new Error(`unexpected ${request.type}`);
      },
      dispose() {},
    }),
  });
  await service.start(createRequest().config);
  const sharedExpected = service.identity();
  const first = command(sharedExpected);
  const second = createRustIntegratedRuntimeCommandBatchV1({
    commandId: "command:block-edit:2",
    idempotencyKey: "player-one:block-edit:2",
    actorId: "player-one",
    expected: sharedExpected,
    operations: [createRustIntegratedRuntimeDomainOperationV1({ domain: "world", typeId: "fixture.world.v1", schema: 1, payload: Uint8Array.of(2) })],
  });
  const firstResult = service.command(first);
  const staleResult = service.command(second);
  assert.equal((await firstResult).status, "accepted");
  await assert.rejects(staleResult, (error: unknown) => error instanceof RustIntegratedRuntimeServiceError && error.code === "stale-command");
  assert.equal(commandCalls, 1, "stale queued command must never cross the worker boundary");
  assert.equal(service.diagnostics().state, "ready");
  assert.equal(service.diagnostics().indeterminateCommands, 0);
});

test("production service fails closed on artifact drift", async () => {
  const service = new RustIntegratedRuntimeServiceV1({
    mode: "production",
    expectedArtifactHash: ARTIFACT_HASH,
    transportFactory: () => ({
      async request(request) {
        return { type: "runtime-ready-v1", requestId: request.requestId, clientEpoch: request.clientEpoch, workerEpoch: 1, runtimeHandle: 1, identity: identity(), artifactHash: "b".repeat(64), instanceId: "wrong", capabilities: CAPABILITIES };
      },
      dispose() {},
    }),
  });
  await assert.rejects(service.start(createRequest().config), (error: unknown) => error instanceof RustIntegratedRuntimeServiceError && error.code === "artifact-mismatch");
  assert.equal(service.diagnostics().state, "failed");
  assert.equal(service.diagnostics().authoritative, false);
});

test("service fails closed when an awaited receipt regresses authority", async () => {
  const startIdentity = identity(4, "8".repeat(32));
  const regressedIdentity = Object.freeze({
    ...startIdentity,
    tick: 3,
    revision: Object.freeze({ ...startIdentity.revision, gameplay: startIdentity.revision.gameplay - 1 }),
    stateHash: "9".repeat(32),
  });
  const service = new RustIntegratedRuntimeServiceV1({
    mode: "protocol-test",
    transportFactory: () => ({
      async request(request) {
        if (request.type === "runtime-create-v1") return { type: "runtime-ready-v1", requestId: request.requestId, clientEpoch: request.clientEpoch, workerEpoch: 3, runtimeHandle: 1, identity: startIdentity, artifactHash: "fixture", instanceId: "fixture", capabilities: CAPABILITIES };
        if (request.type === "runtime-command-v1") return {
          type: "runtime-command-receipt-v1",
          requestId: request.requestId,
          clientEpoch: request.clientEpoch,
          workerEpoch: 3,
          receipt: { status: "accepted", commandId: request.batch.commandId, idempotencyKey: request.batch.idempotencyKey, commandHash: request.batch.commandHash, before: startIdentity, after: regressedIdentity, domainReceipts: [], receiptHash: ZERO_HASH },
        };
        throw new Error(`unexpected ${request.type}`);
      },
      dispose() {},
    }),
  });
  await service.start({ ...createRequest().config, universeId: startIdentity.universeId, locationId: startIdentity.locationId });
  await assert.rejects(service.command(command(startIdentity)), (error: unknown) => error instanceof RustIntegratedRuntimeServiceError && error.code === "invalid-response");
  assert.equal(service.diagnostics().state, "failed");
});

test("crashed commands stay indeterminate and every restored generation re-attests", async () => {
  let generation = 0;
  const restoredIdentity = identity(12, "9".repeat(32));
  const service = new RustIntegratedRuntimeServiceV1({
    mode: "production",
    expectedArtifactHash: ARTIFACT_HASH,
    transportFactory: () => {
      generation += 1;
      const thisGeneration = generation;
      return {
        async request(request): Promise<RustIntegratedRuntimeResponseV1> {
          if (request.type === "runtime-create-v1") {
            return { type: "runtime-ready-v1", requestId: request.requestId, clientEpoch: request.clientEpoch, workerEpoch: thisGeneration, runtimeHandle: thisGeneration, identity: identity(), artifactHash: ARTIFACT_HASH, instanceId: `runtime:${thisGeneration}`, capabilities: CAPABILITIES };
          }
          if (request.type === "runtime-command-v1") throw new Error("worker vanished after dispatch");
          if (request.type === "runtime-restore-v1") {
            return {
              type: "runtime-restored-v1",
              requestId: request.requestId,
              clientEpoch: request.clientEpoch,
              workerEpoch: thisGeneration,
              runtimeHandle: thisGeneration,
              identity: restoredIdentity,
              checkpointHash: request.expectedCheckpointHash,
              artifactHash: thisGeneration === 2 ? "b".repeat(64) : ARTIFACT_HASH,
              instanceId: `runtime:${thisGeneration}`,
              capabilities: CAPABILITIES,
            };
          }
          throw new Error(`unexpected ${request.type}`);
        },
        dispose() {},
      };
    },
  });
  await service.start(createRequest().config);
  const batch = command();
  await assert.rejects(service.command(batch), (error: unknown) => error instanceof RustIntegratedRuntimeServiceError && error.code === "worker-failed");
  assert.equal(service.diagnostics().indeterminateCommands, 1);
  await assert.rejects(service.restore(ZERO_HASH, Uint8Array.from([1, 2, 3])), (error: unknown) => error instanceof RustIntegratedRuntimeServiceError && error.code === "artifact-mismatch");
  assert.equal(service.isAuthoritative(), false);
  await service.restore(ZERO_HASH, Uint8Array.from([1, 2, 3]));
  assert.equal(service.isAuthoritative(), true);
  await assert.rejects(service.command(batch), (error: unknown) => error instanceof RustIntegratedRuntimeServiceError && error.code === "indeterminate-command");
});

test("coarse command, fixed-step, and extraction paths stay within declared p95 budgets", async () => {
  let clock = 0;
  let current = identity();
  const service = new RustIntegratedRuntimeServiceV1({
    mode: "protocol-test",
    now: () => clock,
    transportFactory: () => ({
      async request(request): Promise<RustIntegratedRuntimeResponseV1> {
        if (request.type === "runtime-create-v1") return { type: "runtime-ready-v1", requestId: request.requestId, clientEpoch: request.clientEpoch, workerEpoch: 1, runtimeHandle: 1, identity: current, artifactHash: "fixture", instanceId: "budget", capabilities: CAPABILITIES };
        if (request.type === "runtime-command-v1") {
          clock += 10;
          const before = current;
          current = identity(before.tick + 1, (before.tick % 10).toString().repeat(32));
          return { type: "runtime-command-receipt-v1", requestId: request.requestId, clientEpoch: request.clientEpoch, workerEpoch: 1, receipt: { status: "accepted", commandId: request.batch.commandId, idempotencyKey: request.batch.idempotencyKey, commandHash: request.batch.commandHash, before, after: current, domainReceipts: [], receiptHash: ZERO_HASH } };
        }
        if (request.type === "runtime-step-v1") {
          clock += 2;
          return { type: "runtime-step-result-v1", requestId: request.requestId, clientEpoch: request.clientEpoch, workerEpoch: 1, identity: current, fixedSteps: 1, inputsApplied: request.inputs.length, commandsProcessed: 0, commandsAccepted: 0, replayHash: ZERO_HASH };
        }
        if (request.type === "runtime-extract-v1") {
          clock += 2;
          return { type: "runtime-extraction-v1", requestId: request.requestId, clientEpoch: request.clientEpoch, workerEpoch: 1, extraction: extraction(current, request.afterRevision + 1, { render: Uint8Array.from([1]) }) };
        }
        throw new Error(`unexpected ${request.type}`);
      },
      dispose() {},
    }),
  });
  await service.start(createRequest().config);
  for (let index = 0; index < 20; index += 1) {
    const operation = createRustIntegratedRuntimeDomainOperationV1({ domain: "world", typeId: "fixture.world.v1", schema: 1, payload: Uint8Array.from([index]) });
    const batch = createRustIntegratedRuntimeCommandBatchV1({ commandId: `budget:${index}`, idempotencyKey: `budget:${index}`, actorId: "fixture", expected: service.identity(), operations: [operation] });
    await service.command(batch);
    await service.step((index + 1) * 50_000, 2_000, [{ sequence: index, targetTick: index + 1, moveX: 0, moveZ: 0, lookYaw: 0, lookPitch: 0, buttons: 0, selectedSlot: 0, flags: 0 }]);
    await service.extract(index);
  }
  const diagnostics = service.diagnostics();
  assert.equal(diagnostics.commandP95Ms, 10);
  assert.equal(diagnostics.stepP95Ms, 2);
  assert.equal(diagnostics.extractP95Ms, 2);
  assert.equal(diagnostics.commandBudgetMet, true);
  assert.equal(diagnostics.stepBudgetMet, true);
  assert.equal(diagnostics.extractBudgetMet, true);
});

function buggyLegacyU8RotateHash(domain: string, payload: Uint8Array) {
  const mask = BigInt("0xffffffffffffffff");
  const prime = BigInt("1099511628211");
  const highPrime = prime ^ BigInt(0x13b);
  let low = BigInt("14695981039346656037");
  let high = low ^ BigInt("0xa0761d6478bd642f");
  const raw = (byte: number) => {
    low = (low ^ BigInt(byte)) * prime & mask;
    high = (high ^ (BigInt(byte) << BigInt(1) | BigInt(1))) * highPrime & mask;
  };
  const sized = (bytes: Uint8Array) => {
    let length = BigInt(bytes.byteLength);
    for (let index = 0; index < 8; index += 1) { raw(Number(length & BigInt(0xff))); length >>= BigInt(8); }
    for (const byte of bytes) {
      low = (low ^ BigInt(byte)) * prime & mask;
      // Deliberately reproduce the historical bad test oracle. Rust widens
      // the byte to u64 before rotate_left(1); this incorrectly rotates u8.
      const highByte = (byte << 1 & 0xff) | (byte >>> 7);
      high = (high ^ BigInt(highByte)) * highPrime & mask;
    }
  };
  sized(new TextEncoder().encode(domain));
  sized(payload);
  const bytes = new Uint8Array(16);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(0, low, true); view.setBigUint64(8, high, true);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
