import assert from "node:assert/strict";
import test from "node:test";
import {
  RustEngineService,
  RustEngineServiceError,
  type RustEngineWorkerLike,
} from "../app/game/rust-engine-service.ts";
import {
  decodeRustEngineEnvelope,
  encodeRustEngineEnvelope,
  encodeRustEngineJson,
  RustEngineMessageFlag,
  RustEngineMessageKind,
  type RustEngineWireMessage,
} from "../app/game/rust-engine-protocol.ts";

type Behavior = (worker: FakeWorker, message: RustEngineWireMessage) => void;

class FakeWorker implements RustEngineWorkerLike {
  onmessage: ((event: MessageEvent<RustEngineWireMessage | ArrayBuffer>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  terminated = false;
  sent: RustEngineWireMessage[] = [];

  constructor(private readonly behavior: Behavior) {}

  postMessage(message: RustEngineWireMessage, transfer: Transferable[] = []) {
    const cloned = structuredClone(message, { transfer }) as RustEngineWireMessage;
    this.sent.push(cloned);
    this.behavior(this, cloned);
  }

  terminate() { this.terminated = true; }

  respond(requestWire: RustEngineWireMessage, kind: RustEngineMessageKind, payload: unknown, options: Readonly<{ schema?: number; ownershipToken?: bigint }> = {}) {
    const request = decodeRustEngineEnvelope(requestWire.envelope);
    const ownershipToken = options.ownershipToken ?? BigInt(0);
    const envelope = encodeRustEngineEnvelope({
      kind,
      flags: RustEngineMessageFlag.Response | (ownershipToken === BigInt(0) ? 0 : RustEngineMessageFlag.TransfersOwnership),
      requestId: request.header.requestId,
      epoch: request.header.epoch,
      schemaVersion: options.schema,
      ownershipToken,
      payload: encodeRustEngineJson(payload),
    });
    queueMicrotask(() => this.onmessage?.({ data: { envelope } } as MessageEvent<RustEngineWireMessage>));
  }
}

const capabilities = {
  protocolVersion: 1,
  schemaVersion: 1,
  buildKind: "compatibility",
  buildHash: "test",
  engineHandle: 1,
  transferableBuffers: true,
  sharedMemory: false,
  renderer: "three-transition",
} as const;

const normalBehavior: Behavior = (worker, wire) => {
  const request = decodeRustEngineEnvelope(wire.envelope);
  if (request.header.kind === RustEngineMessageKind.CapabilityHello) worker.respond(wire, RustEngineMessageKind.CapabilityAck, capabilities);
  else if (request.header.kind === RustEngineMessageKind.Shutdown) worker.respond(wire, RustEngineMessageKind.Shutdown, { stopped: true });
  else if (request.header.kind === RustEngineMessageKind.Heartbeat) worker.respond(wire, RustEngineMessageKind.Heartbeat, { alive: true });
};

test("Rust service is lazy and negotiates capabilities only when started", async () => {
  const workers: FakeWorker[] = [];
  const service = new RustEngineService({
    workerFactory: () => { const worker = new FakeWorker(normalBehavior); workers.push(worker); return worker; },
    heartbeatIntervalMs: 0,
  });
  assert.equal(workers.length, 0);
  assert.equal(service.lifecycleState, "idle");
  assert.deepEqual(await service.start(), capabilities);
  assert.equal(workers.length, 1);
  assert.equal(service.ready, true);
  await service.shutdown();
  assert.equal(workers[0].terminated, true);
  assert.equal(service.lifecycleState, "stopped");
});

test("schema mismatch fails closed and terminates the incompatible worker", async () => {
  const worker = new FakeWorker((instance, wire) => {
    const request = decodeRustEngineEnvelope(wire.envelope);
    const envelope = encodeRustEngineEnvelope({
      kind: RustEngineMessageKind.CapabilityAck,
      flags: RustEngineMessageFlag.Response,
      requestId: request.header.requestId,
      schemaVersion: 2,
      payload: encodeRustEngineJson(capabilities),
    });
    queueMicrotask(() => instance.onmessage?.({ data: { envelope } } as MessageEvent<RustEngineWireMessage>));
  });
  const service = new RustEngineService({ workerFactory: () => worker, heartbeatIntervalMs: 0, maximumRestarts: 0 });
  await assert.rejects(service.start(), (error: unknown) => error instanceof RustEngineServiceError && error.code === "protocol-error");
  assert.equal(worker.terminated, true);
  assert.equal(service.lifecycleState, "failed");
});

test("startup timeout performs one bounded restart and then succeeds", async () => {
  const workers: FakeWorker[] = [];
  const service = new RustEngineService({
    workerFactory: () => {
      const worker = new FakeWorker(workers.length === 0 ? () => {} : normalBehavior);
      workers.push(worker);
      return worker;
    },
    startupTimeoutMs: 10,
    heartbeatIntervalMs: 0,
    maximumRestarts: 1,
  });
  await service.start();
  assert.equal(workers.length, 2);
  assert.equal(workers[0].terminated, true);
  assert.equal(service.diagnostics().restarts, 1);
  await service.shutdown();
});

test("explicit restart replaces the worker and shutdown acknowledges cleanly", async () => {
  const workers: FakeWorker[] = [];
  const service = new RustEngineService({
    workerFactory: () => { const worker = new FakeWorker(normalBehavior); workers.push(worker); return worker; },
    heartbeatIntervalMs: 0,
  });
  await service.start();
  await service.restart("test-restart");
  assert.equal(workers.length, 2);
  assert.equal(workers[0].terminated, true);
  await service.shutdown();
  assert.equal(workers[1].terminated, true);
});

test("tokened worker buffers stay tracked until explicitly returned", async () => {
  const worker = new FakeWorker((instance, wire) => {
    const request = decodeRustEngineEnvelope(wire.envelope);
    if (request.header.kind === RustEngineMessageKind.CapabilityHello) instance.respond(wire, RustEngineMessageKind.CapabilityAck, capabilities);
    else if (request.header.kind === RustEngineMessageKind.Heartbeat) instance.respond(wire, RustEngineMessageKind.Heartbeat, { alive: true }, { ownershipToken: BigInt(77) });
    else if (request.header.kind === RustEngineMessageKind.Shutdown) instance.respond(wire, RustEngineMessageKind.Shutdown, { stopped: true });
  });
  const service = new RustEngineService({ workerFactory: () => worker, heartbeatIntervalMs: 0 });
  await service.start();
  const response = await service.request(RustEngineMessageKind.Heartbeat, undefined, RustEngineMessageKind.Heartbeat);
  assert.equal(service.diagnostics().outstandingOwnedBuffers, 1);
  assert.deepEqual(JSON.parse(new TextDecoder().decode(response.payload)), { alive: true });
  assert.equal(response.release(), true);
  assert.equal(response.release(), false, "release is idempotent");
  assert.equal(service.diagnostics().outstandingOwnedBuffers, 0);
  const releaseWire = worker.sent.find((wire) => decodeRustEngineEnvelope(wire.envelope).header.kind === RustEngineMessageKind.BufferRelease);
  assert.ok(releaseWire?.returnedBuffer);
  assert.equal(decodeRustEngineEnvelope(releaseWire.envelope).header.ownershipToken, BigInt(77));
  await service.shutdown();
});
