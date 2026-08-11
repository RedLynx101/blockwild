import assert from "node:assert/strict";
import test from "node:test";
import {
  WORLD_AUTHORITY_PROTOCOL_V1,
  WORLD_AUTHORITY_SCHEMA_V1,
  createWorldAuthorityIdentityV1,
  createWorldCompatibilitySaveV1,
  createWorldReadWindowV1,
  encodeWorldCompatibilitySaveV1,
  type WorldAddressV1,
  type WorldAuthorityIdentityV1,
} from "../app/game/world-authority-contract.ts";
import {
  RUST_WORLD_AUTHORITY_BRIDGE_PROTOCOL_R4_V1,
  rustAuxiliaryPatchTransferListR4V1,
  rustSectionInstallTransferListR4V1,
  type RustWorldAuthorityRequestR4V1,
  type RustWorldAuthorityResponseR4V1,
  type RustWorldAuthorityTransportR4V1,
} from "../app/game/rust-world-authority-bridge-r4.ts";
import { RustWorldAuthorityServiceR4V1 } from "../app/game/rust-world-authority-service-r4.ts";
import {
  RustWorldAuthorityWorkerTransportR4V1,
  installRustWorldAuthorityWorkerHandlerR4V1,
  type RustWorldAuthorityWorkerPortR4V1,
} from "../app/game/rust-world-authority-worker-r4.ts";
import { RustWorldAuthorityRuntimeR4V1 } from "../app/game/rust-world-authority-runtime-r4.ts";

const ADDRESS = Object.freeze({ universeId: "1", locationId: "overworld" }) satisfies WorldAddressV1;

function base(request: RustWorldAuthorityRequestR4V1) {
  return {
    protocolVersion: RUST_WORLD_AUTHORITY_BRIDGE_PROTOCOL_R4_V1,
    worldProtocolVersion: WORLD_AUTHORITY_PROTOCOL_V1,
    schemaVersion: WORLD_AUTHORITY_SCHEMA_V1,
    requestId: request.requestId,
  } as const;
}

class FakeAuthorityTransport implements RustWorldAuthorityTransportR4V1 {
  identity: WorldAuthorityIdentityV1 = createWorldAuthorityIdentityV1(ADDRESS, { epoch: 1, mutation: 0, residency: 0 });
  readonly requests: RustWorldAuthorityRequestR4V1[] = [];
  disposed = false;
  staleNextPage = false;
  pageRequests = 0;

  async request(request: RustWorldAuthorityRequestR4V1): Promise<RustWorldAuthorityResponseR4V1> {
    this.requests.push(request);
    if (request.type === "authority-init-r4-v1") {
      this.identity = createWorldAuthorityIdentityV1(request.address, { epoch: 1, mutation: 0, residency: 0 });
      return { ...base(request), type: "authority-ready-r4-v1", identity: this.identity };
    }
    if (request.type === "authority-mutate-r4-v1") {
      assert.deepEqual(request.expectedIdentity, this.identity, "serialized operations use the latest accepted revision");
      const before = this.identity;
      this.identity = createWorldAuthorityIdentityV1(before.address, { ...before.revision, mutation: before.revision.mutation + 1 });
      const command = request.commands[0];
      if (!command) throw new Error("fixture requires one command");
      return {
        ...base(request),
        type: "authority-mutation-result-r4-v1",
        identity: this.identity,
        status: "accepted",
        mutated: true,
        immediateEvent: {
          sequence: this.identity.revision.mutation,
          address: this.identity.address,
          batchId: request.batchId,
          identity: this.identity,
          changes: [{
            x: command.x,
            y: command.y,
            z: command.z,
            previousBlockId: 0,
            blockId: command.kind === "set-block" ? command.blockId : 0,
            previousFacing: 0,
            facing: command.kind === "set-facing" ? command.facing : 0,
            previousLiquid: { kind: 0, level: 0, flags: 0 },
            liquid: { kind: 0, level: 0, flags: 0 },
          }],
          dirtySectionKeys: ["1@overworld:0,0:4"],
        },
      };
    }
    if (request.type === "authority-read-page-r4-v1") {
      this.pageRequests += 1;
      const identity = this.staleNextPage
        ? createWorldAuthorityIdentityV1(this.identity.address, { ...this.identity.revision, epoch: this.identity.revision.epoch + 1 })
        : this.identity;
      this.staleNextPage = false;
      const cellCount = request.size.x * request.size.y * request.size.z;
      const page = createWorldReadWindowV1({
        address: identity.address,
        origin: request.origin,
        size: request.size,
        identity,
        sectionRevisions: [],
        streams: {
          loadedMask: new Uint8Array(cellCount),
          boundary: new Uint8Array(cellCount),
          blocks: new Uint16Array(cellCount).fill(0xffff),
          facing: new Uint8Array(cellCount),
          liquidKind: new Uint8Array(cellCount),
          liquidLevel: new Uint8Array(cellCount),
          flags: new Uint8Array(cellCount),
        },
      });
      return { ...base(request), type: "authority-read-page-result-r4-v1", identity, page };
    }
    if (request.type === "authority-import-save-r4-v1") {
      this.identity = createWorldAuthorityIdentityV1(this.identity.address, {
        epoch: this.identity.revision.epoch + 1,
        mutation: request.save.revision.mutation,
        residency: 0,
      });
      return {
        ...base(request),
        type: "authority-save-imported-r4-v1",
        identity: this.identity,
        edits: request.save.edits.reduce((total, chunk) => total + chunk.entries.length, 0),
      };
    }
    if (request.type === "authority-switch-location-r4-v1") {
      this.identity = createWorldAuthorityIdentityV1(request.address, { epoch: this.identity.revision.epoch + 1, mutation: 0, residency: 0 });
      return { ...base(request), type: "authority-location-switched-r4-v1", identity: this.identity };
    }
    if (request.type === "authority-dispose-r4-v1") return { ...base(request), type: "authority-disposed-r4-v1" };
    if (request.type === "authority-export-save-r4-v1") return {
      ...base(request),
      type: "authority-save-result-r4-v1",
      identity: this.identity,
      compatibilityJson: Uint8Array.from([1, 2]),
      rustExtension: Uint8Array.from([3, 4]),
    };
    if (request.type === "authority-evict-sections-r4-v1") return {
      ...base(request),
      type: "authority-sections-evicted-r4-v1",
      identity: this.identity,
      evicted: request.sections.length,
    };
    if (request.type === "authority-install-sections-r4-v1") return {
      ...base(request),
      type: "authority-sections-installed-r4-v1",
      identity: this.identity,
      accepted: request.sections.length,
      stale: 0,
    };
    if (request.type === "authority-patch-auxiliary-r4-v1") {
      this.identity = createWorldAuthorityIdentityV1(this.identity.address, {
        ...this.identity.revision,
        residency: this.identity.revision.residency + request.patches.length,
      });
      return {
        ...base(request),
        type: "authority-auxiliary-patched-r4-v1",
        identity: this.identity,
        accepted: request.patches.length,
        lightSections: request.patches.reduce((total, patch) => total + patch.lightSections.length, 0),
        lightCells: request.patches.reduce((total, patch) => total + patch.lightSections.length * 4_096, 0),
      };
    }
    return {
      ...base(request),
      type: "authority-residency-accepted-r4-v1",
      identity: this.identity,
      queued: request.intents.length,
      cancelled: request.cancelledRequestIds.length,
    };
  }

  dispose() { this.disposed = true; }
}

test("authority service serializes edits, emits immediate feedback, and invalidates immutable pages", async () => {
  const transport = new FakeAuthorityTransport();
  const service = new RustWorldAuthorityServiceR4V1(transport);
  await service.initialize(ADDRESS);
  const page = await service.readPage({ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 });
  assert.equal(transport.pageRequests, 1);
  assert.equal(await service.readPage({ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 }), page, "same revision reuses immutable page object");
  assert.equal(transport.pageRequests, 1);

  const events: string[] = [];
  service.subscribeImmediateEdits((event) => events.push(event.batchId));
  const first = service.mutate("first", "host", [{ kind: "set-block", x: 0, y: 0, z: 0, blockId: 2 }]);
  const second = service.mutate("second", "host", [{ kind: "set-block", x: 1, y: 0, z: 0, blockId: 2 }]);
  await Promise.all([first, second]);
  assert.deepEqual(events, ["first", "second"]);
  assert.equal(service.identity().revision.mutation, 2);
  assert.equal(service.diagnostics().cachedPages, 0);
  assert.equal(service.diagnostics().immediateEvents, 2);
  await service.readPage({ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 });
  assert.equal(transport.pageRequests, 2);
});

test("current compatibility saves import through the validated structured boundary", async () => {
  const transport = new FakeAuthorityTransport();
  const service = new RustWorldAuthorityServiceR4V1(transport);
  await service.initialize(ADDRESS);
  const save = createWorldCompatibilitySaveV1({
    address: ADDRESS,
    revision: { epoch: 1, mutation: 9, residency: 3 },
    edits: [{ chunkX: 0, chunkZ: 0, entries: [[16_384, 2]] }],
    facings: [],
  });
  const response = await service.importCompatibilitySave(encodeWorldCompatibilitySaveV1(save));
  assert.equal(response.edits, 1);
  assert.equal(service.identity().revision.epoch, 2);
  assert.equal(service.identity().revision.mutation, 9);
  const request = transport.requests.find((entry) => entry.type === "authority-import-save-r4-v1");
  assert.equal(request?.type, "authority-import-save-r4-v1");
  if (request?.type === "authority-import-save-r4-v1") assert.equal(request.save.checksum, save.checksum);
});

test("stale pages retry on the current immutable identity while location switches and disposal fail closed", async () => {
  const transport = new FakeAuthorityTransport();
  const service = new RustWorldAuthorityServiceR4V1(transport);
  await service.initialize(ADDRESS);
  transport.staleNextPage = true;
  const page = await service.readPage({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 });
  assert.equal(page.identity.stateHash, service.identity().stateHash);
  assert.equal(transport.pageRequests, 2);
  assert.equal(service.diagnostics().staleResponses, 1);
  const hope = Object.freeze({ universeId: "1", locationId: "Hope" });
  await service.switchLocation(hope);
  assert.deepEqual(service.identity().address, hope);
  assert.equal(service.diagnostics().cachedPages, 0);
  await service.dispose();
  assert.equal(transport.disposed, true);
  assert.equal(service.diagnostics().disposed, true);
  await assert.rejects(service.readPage({ x: 0, y: 0, z: 0 }, { x: 1, y: 1, z: 1 }));
});

test("section install transfer ownership is coarse and bounded", () => {
  const cellCount = 16 * 16 * 16;
  const transfer = rustSectionInstallTransferListR4V1([{
    address: { ...ADDRESS, chunkX: 0, chunkZ: 0, sectionY: 4 },
    sourceRevision: 1,
    sourceHash: "11111111111111111111111111111111",
    blocks: new Uint16Array(cellCount),
    facing: new Uint8Array(cellCount),
    liquidKind: new Uint8Array(cellCount),
    liquidLevel: new Uint8Array(cellCount),
    flags: new Uint8Array(cellCount),
  }]);
  assert.equal(transfer.length, 5);
  assert.equal(transfer.reduce((total, buffer) => total + buffer.byteLength, 0), cellCount * 6);
  const patchTransfer = rustAuxiliaryPatchTransferListR4V1([{
    address: { ...ADDRESS, chunkX: 0, chunkZ: 0 },
    expectedSourceRevision: 1,
    expectedSourceHash: "1".repeat(32),
    sourceRevision: 2,
    sourceHash: "2".repeat(32),
    lightSections: [{ sectionY: 4, light: new Uint16Array(cellCount) }],
    sectionBlockCounts: [{ index: 4, value: 1 }],
    skyTops: [{ index: 0, value: 0 }],
  }]);
  assert.equal(patchTransfer.length, 1);
  assert.equal(patchTransfer[0].byteLength, cellCount * 2, "one dirty light section transfers 8 KiB, not the 96 KiB chunk light stream");
});

test("worker transport runs the live serial handler and disposal rejects outstanding work", async () => {
  let requestListener: ((event: Readonly<{ data: RustWorldAuthorityRequestR4V1 }>) => void) | undefined;
  const responseListeners = new Set<(event: Readonly<{ data: RustWorldAuthorityResponseR4V1 }>) => void>();
  let terminated = false;
  const worker: RustWorldAuthorityWorkerPortR4V1 = {
    postMessage(message) { queueMicrotask(() => requestListener?.({ data: message })); },
    addEventListener(_type, listener) { responseListeners.add(listener); },
    removeEventListener(_type, listener) { responseListeners.delete(listener); },
    terminate() { terminated = true; },
  };
  let active = 0;
  let maximumActive = 0;
  installRustWorldAuthorityWorkerHandlerR4V1({
    addEventListener(_type, listener) { requestListener = listener; },
    postMessage(message) {
      queueMicrotask(() => {
        for (const listener of responseListeners) listener({ data: message });
      });
    },
  }, {
    async handle(request) {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      if (request.type === "authority-init-r4-v1") {
        return {
          ...base(request),
          type: "authority-ready-r4-v1",
          identity: createWorldAuthorityIdentityV1(request.address, { epoch: 1, mutation: 0, residency: 0 }),
        };
      }
      return { ...base(request), type: "authority-disposed-r4-v1" };
    },
  });
  const transport = new RustWorldAuthorityWorkerTransportR4V1(worker);
  const first = transport.request({
    ...base({ requestId: 81 } as RustWorldAuthorityRequestR4V1),
    type: "authority-init-r4-v1",
    requestId: 81,
    address: ADDRESS,
  });
  const second = transport.request({
    ...base({ requestId: 82 } as RustWorldAuthorityRequestR4V1),
    type: "authority-dispose-r4-v1",
    requestId: 82,
    identity: null,
  });
  assert.equal((await first).type, "authority-ready-r4-v1");
  assert.equal((await second).type, "authority-disposed-r4-v1");
  assert.equal(maximumActive, 1, "authority worker never overlaps mutations or lifecycle operations");
  transport.dispose();
  assert.equal(terminated, true);
  await assert.rejects(transport.request({
    ...base({ requestId: 83 } as RustWorldAuthorityRequestR4V1),
    type: "authority-dispose-r4-v1",
    requestId: 83,
    identity: null,
  }), /disposed/);
});

test("overlapping world starts dispose the obsolete worker without poisoning the current runtime", async () => {
  const workerFactory = () => {
    let requestListener: ((event: Readonly<{ data: RustWorldAuthorityRequestR4V1 }>) => void) | undefined;
    const responseListeners = new Set<(event: Readonly<{ data: RustWorldAuthorityResponseR4V1 }>) => void>();
    const worker: RustWorldAuthorityWorkerPortR4V1 = {
      postMessage(message) { queueMicrotask(() => requestListener?.({ data: message })); },
      addEventListener(_type, listener) { responseListeners.add(listener); },
      removeEventListener(_type, listener) { responseListeners.delete(listener); },
      terminate() {},
    };
    installRustWorldAuthorityWorkerHandlerR4V1({
      addEventListener(_type, listener) { requestListener = listener; },
      postMessage(message) { queueMicrotask(() => responseListeners.forEach((listener) => listener({ data: message }))); },
    }, {
      async handle(request) {
        await Promise.resolve();
        if (request.type === "authority-init-r4-v1") return {
          ...base(request),
          type: "authority-ready-r4-v1",
          identity: createWorldAuthorityIdentityV1(request.address, { epoch: 1, mutation: 0, residency: 0 }),
          artifactHash: "1".repeat(64),
        };
        return { ...base(request), type: "authority-disposed-r4-v1" };
      },
    });
    return worker;
  };
  const runtime = new RustWorldAuthorityRuntimeR4V1({ mode: "shadow", workerFactory });
  const first = runtime.start(ADDRESS);
  const secondAddress = { universeId: "1", locationId: "replacement" } as const;
  const second = runtime.start(secondAddress);
  assert.equal(await first, null);
  assert.equal((await second)?.address.locationId, "replacement");
  assert.equal(runtime.diagnostics().state, "ready");
  assert.equal(runtime.diagnostics().failures, 0);
  await runtime.dispose();
});
