import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { TypeScriptCanonicalHasher } from "../app/game/rust-kernel-shadow.ts";
import {
  RUST_GAMEPLAY_VIEW_DOMAINS_R7,
  createRustGameplayCommandBatchR7,
  rustGameplayIdentityEqualsR7,
  type RustGameplayAuthorityIdentityR7,
  type RustGameplayAuthorityRequestR7,
  type RustGameplayAuthorityResponseR7,
  type RustGameplayCommandBatchR7,
  type RustGameplayCommandReceiptR7,
  type RustGameplayViewDomainR7,
} from "../app/game/rust-gameplay-contract-r7.ts";
import { RustGameplayAuthorityServiceR7 } from "../app/game/rust-gameplay-service-r7.ts";
import { inspectRustGameplaySnapshotEnvelopeR7V1 } from "../app/game/rust-gameplay-snapshot-r7.ts";
import { RustGameplayWorkerTransportR7, type RustGameplayWorkerPortR7 } from "../app/game/rust-gameplay-worker-r7.ts";

async function fixtureBytes() {
  const base64 = await readFile(new URL("./fixtures/rust-engine/r7/gameplay/gameplay-snapshot-v1-unicode.b64", import.meta.url), "utf8");
  return Uint8Array.from(Buffer.from(base64.trim(), "base64"));
}

function hexBytes(value: string) { return Uint8Array.from(Buffer.from(value, "hex")); }

function envelopeWithHashes(source: Uint8Array | ArrayBuffer, stateHash: string, replayHash: string) {
  const bytes = source instanceof Uint8Array ? source.slice() : new Uint8Array(source.slice(0));
  bytes.set(hexBytes(stateHash), 20);
  bytes.set(hexBytes(replayHash), 36);
  return bytes;
}

function nextHash(domain: string, previous: string, commandHash: string) {
  return new TypeScriptCanonicalHasher(domain).writeString(previous).writeString(commandHash).finishHex();
}

function cloneIdentity(identity: RustGameplayAuthorityIdentityR7) {
  return Object.freeze({ ...identity, revision: Object.freeze({ ...identity.revision }) });
}

class TestGameplayKernel {
  identity: RustGameplayAuthorityIdentityR7 | null = null;
  snapshot: Uint8Array | null = null;
  applyCount = 0;
  rejectReplacement = false;
  readonly idempotency = new Map<string, RustGameplayCommandReceiptR7>();

  private base(request: RustGameplayAuthorityRequestR7) {
    return { protocolVersion: 1 as const, schemaVersion: 1 as const, requestId: request.requestId, runtimeEpoch: request.runtimeEpoch };
  }

  async handle(request: RustGameplayAuthorityRequestR7): Promise<RustGameplayAuthorityResponseR7> {
    if (request.type === "gameplay-initialize-r7-v1") {
      const envelope = inspectRustGameplaySnapshotEnvelopeR7V1(request.bytes);
      this.snapshot = envelope.bytes;
      this.identity = Object.freeze({
        universe: "univers-é-🌌",
        location: "Talon/希望",
        revision: Object.freeze({ epoch: 17, sequence: BigInt(0), inventory: BigInt(0), machines: BigInt(0), combat: BigInt(0), progression: BigInt(0), cardforge: BigInt(0) }),
        stateHash: envelope.stateHash,
        replayHash: envelope.replayHash,
      });
      return { ...this.base(request), type: "gameplay-ready-r7-v1", identity: this.identity };
    }
    if (!this.identity || !this.snapshot) throw new Error("test authority is not initialized");
    if (request.type === "gameplay-apply-r7-v1") {
      this.applyCount += 1;
      const retryKey = `${request.batch.actor.actorId}\u0000${request.batch.idempotencyKey}`;
      const cached = this.idempotency.get(retryKey);
      if (cached) return { ...this.base(request), type: "gameplay-receipt-r7-v1", authority: this.identity, receipt: cached };
      if (!rustGameplayIdentityEqualsR7(request.batch.expected, this.identity)) {
        return { ...this.base(request), type: "gameplay-receipt-r7-v1", authority: this.identity, receipt: { status: "rejected", batchId: request.batch.batchId, commandHash: request.batch.commandHash, identity: this.identity, code: "stale-revision", message: "stale test revision" } };
      }
      const before = this.identity;
      const touched = [...new Set(request.batch.commands.map((command) => command.authorityDomain))]
        .sort((left, right) => ["inventory", "machines", "combat", "progression", "cardforge"].indexOf(left) - ["inventory", "machines", "combat", "progression", "cardforge"].indexOf(right));
      const revision = { ...before.revision, sequence: before.revision.sequence + BigInt(1) };
      for (const domain of touched) revision[domain] += BigInt(1);
      const stateHash = nextHash("test.gameplay.state", before.stateHash, request.batch.commandHash);
      const replayHash = nextHash("test.gameplay.replay", before.replayHash, request.batch.commandHash);
      const after = Object.freeze({ ...before, revision: Object.freeze(revision), stateHash, replayHash });
      const receipt: RustGameplayCommandReceiptR7 = Object.freeze({
        status: "accepted",
        batchId: request.batch.batchId,
        commandHash: request.batch.commandHash,
        before,
        after,
        touchedDomains: Object.freeze(touched),
        events: Object.freeze([{ eventId: `${request.batch.batchId}:0`, domain: request.batch.commands[0].domain, recordId: "metadata-é", typeId: "blockwild.test.event.v1", schema: 1, payload: new TextEncoder().encode('{"plant":"🌿","high":255}') }]),
        receiptHash: nextHash("test.gameplay.receipt", before.stateHash, stateHash),
      });
      this.identity = after;
      this.snapshot = envelopeWithHashes(this.snapshot, stateHash, replayHash);
      this.idempotency.set(retryKey, receipt);
      return { ...this.base(request), type: "gameplay-receipt-r7-v1", authority: after, receipt };
    }
    if (request.type === "gameplay-view-r7-v1") {
      const records = RUST_GAMEPLAY_VIEW_DOMAINS_R7.filter((domain) => request.query.domains.includes(domain)).map((domain) => ({
        domain,
        recordId: `${domain}-record`,
        revision: this.identity!.revision.sequence,
        typeId: `blockwild.${domain}.view.v1`,
        schema: 1,
        payload: new TextEncoder().encode(`${domain}:é:🌿`),
      }));
      return { ...this.base(request), type: "gameplay-view-page-r7-v1", page: {
        schema: 1,
        queryId: request.query.queryId,
        mode: request.query.afterSequence === null ? "snapshot" : "delta",
        baseSequence: request.query.afterSequence ?? this.identity.revision.sequence,
        identity: this.identity,
        records,
        removed: [],
        nextCursor: null,
        truncated: false,
        byteLength: records.reduce((sum, record) => sum + record.payload.byteLength, 0),
      } };
    }
    if (request.type === "gameplay-export-snapshot-r7-v1") {
      return { ...this.base(request), type: "gameplay-snapshot-r7-v1", identity: this.identity, bytes: this.snapshot.buffer.slice(this.snapshot.byteOffset, this.snapshot.byteOffset + this.snapshot.byteLength) as ArrayBuffer };
    }
    if (request.type === "gameplay-replace-snapshot-r7-v1") {
      if (this.rejectReplacement) return { ...this.base(request), type: "gameplay-error-r7-v1", code: "corrupt-state", message: "full Rust payload validation failed", retriable: false };
      const previous = this.identity;
      const envelope = inspectRustGameplaySnapshotEnvelopeR7V1(request.bytes);
      this.snapshot = envelope.bytes;
      this.identity = Object.freeze({ ...previous, revision: Object.freeze({ ...previous.revision, sequence: previous.revision.sequence + BigInt(1) }), stateHash: envelope.stateHash, replayHash: envelope.replayHash });
      this.idempotency.clear();
      return { ...this.base(request), type: "gameplay-snapshot-replaced-r7-v1", previous, identity: this.identity };
    }
    return { ...this.base(request), type: "gameplay-disposed-r7-v1" };
  }
}

type ListenerMap = {
  message: Set<(event: Readonly<{ data: RustGameplayAuthorityResponseR7 }>) => void>;
  error: Set<(event: unknown) => void>;
  messageerror: Set<(event: unknown) => void>;
};

class TestWorker implements RustGameplayWorkerPortR7 {
  readonly listeners: ListenerMap = { message: new Set(), error: new Set(), messageerror: new Set() };
  applyRequests = 0;
  terminated = false;

  constructor(readonly kernel: TestGameplayKernel, readonly options: { crashOnApply?: number; emitStale?: boolean } = {}) {}

  postMessage(request: RustGameplayAuthorityRequestR7) {
    queueMicrotask(async () => {
      if (this.terminated) return;
      if (request.type === "gameplay-apply-r7-v1") {
        this.applyRequests += 1;
        if (this.applyRequests === this.options.crashOnApply) {
          for (const listener of this.listeners.error) listener({ message: "intentional gameplay worker crash" });
          return;
        }
      }
      const response = await this.kernel.handle(request);
      if (this.options.emitStale) {
        const stale = { ...response, requestId: response.requestId + 10_000 } as RustGameplayAuthorityResponseR7;
        for (const listener of this.listeners.message) listener({ data: stale });
      }
      for (const listener of this.listeners.message) listener({ data: response });
    });
  }

  addEventListener(type: "message" | "error" | "messageerror", listener: ((event: Readonly<{ data: RustGameplayAuthorityResponseR7 }>) => void) | ((event: unknown) => void)) {
    (this.listeners[type] as Set<typeof listener>).add(listener);
  }
  removeEventListener(type: "message" | "error" | "messageerror", listener: ((event: Readonly<{ data: RustGameplayAuthorityResponseR7 }>) => void) | ((event: unknown) => void)) {
    (this.listeners[type] as Set<typeof listener>).delete(listener);
  }
  terminate() { this.terminated = true; }
}

function batch(expected: RustGameplayAuthorityIdentityR7, suffix: string, domains: readonly RustGameplayViewDomainR7[] = ["inventory"]): RustGameplayCommandBatchR7 {
  return createRustGameplayCommandBatchR7({
    batchId: `batch-${suffix}`,
    idempotencyKey: `idem-${suffix}`,
    actor: { actorId: "actor-é", playerId: BigInt(1), entityId: BigInt(2), role: "host" },
    expected,
    commands: domains.map((domain, index) => ({ commandId: `${suffix}-${index}`, domain, typeId: `blockwild.${domain}.test.v1`, schema: 1, payload: Uint8Array.of(index, 0x80, 0xff) })),
  });
}

test("service retries idempotently, recovers acknowledged journal, rejects stale replies, and serves bounded views", async () => {
  const workers: TestWorker[] = [];
  const service = new RustGameplayAuthorityServiceR7({
    timeoutMs: 100,
    workerFactory: (epoch) => {
      const worker = new TestWorker(new TestGameplayKernel(), epoch === 1 ? { crashOnApply: 2 } : { emitStale: true });
      workers.push(worker);
      return worker;
    },
  });
  await service.initialize(await fixtureBytes());
  const initial = service.diagnostics().identity!;
  const firstBatch = batch(initial, "first", ["inventory", "capture", "quests", "cardforge"]);
  const first = await service.apply(firstBatch);
  assert.equal(first.status, "accepted");
  const firstApplyCount = workers[0].kernel.applyCount;
  assert.deepEqual(await service.apply(firstBatch), first, "a local retry returns the exact accepted receipt");
  assert.equal(workers[0].kernel.applyCount, firstApplyCount, "cached idempotency does not re-enter authority");

  const afterFirst = service.diagnostics().identity!;
  const secondBatch = batch(afterFirst, "second", ["economy"]);
  await assert.rejects(service.apply(secondBatch), /intentional gameplay worker crash/u);
  const second = await service.apply(secondBatch);
  assert.equal(second.status, "accepted");
  assert.equal(service.diagnostics().identity!.revision.sequence, BigInt(2));
  assert.equal(service.diagnostics().restarts, 1);
  assert.ok(service.diagnostics().staleResults > 0, "unsolicited prior-request responses are counted and ignored");
  assert.equal(workers.length, 2);

  const view = await service.view({ queryId: "all-ui", afterSequence: null, domains: [...RUST_GAMEPLAY_VIEW_DOMAINS_R7], owners: [], recordIds: [], cursor: null, maxRecords: 32, maxBytes: 8_192 });
  assert.equal(view.records.length, 8);
  assert.deepEqual(view.records.map((record) => record.domain), RUST_GAMEPLAY_VIEW_DOMAINS_R7);
  const exported = inspectRustGameplaySnapshotEnvelopeR7V1(await service.exportSnapshot());
  assert.equal(exported.stateHash, service.diagnostics().identity!.stateHash);
  assert.equal(service.diagnostics().journalBatches, 0);
  await service.dispose();
  assert.equal(service.diagnostics().state, "disposed");
});

test("snapshot replacement is validate-then-install and leaves authority unchanged on every failure", async () => {
  const kernel = new TestGameplayKernel();
  const service = new RustGameplayAuthorityServiceR7({ workerFactory: () => new TestWorker(kernel), timeoutMs: 100 });
  const fixture = await fixtureBytes();
  await service.initialize(fixture);
  const before = cloneIdentity(service.diagnostics().identity!);

  const corruptOuter = fixture.slice(); corruptOuter[corruptOuter.byteLength - 1] ^= 0xff;
  await assert.rejects(service.replaceSnapshot(corruptOuter), /checksum/u);
  assert.ok(rustGameplayIdentityEqualsR7(service.diagnostics().identity!, before));

  const candidateState = nextHash("test.replacement.state", before.stateHash, "candidate");
  const candidateReplay = nextHash("test.replacement.replay", before.replayHash, "candidate");
  const candidate = envelopeWithHashes(fixture, candidateState, candidateReplay);
  kernel.rejectReplacement = true;
  await assert.rejects(service.replaceSnapshot(candidate), /full Rust payload validation failed/u);
  assert.ok(rustGameplayIdentityEqualsR7(service.diagnostics().identity!, before), "kernel rejection cannot partially replace browser authority state");

  kernel.rejectReplacement = false;
  await service.replaceSnapshot(candidate);
  assert.equal(service.diagnostics().identity!.stateHash, candidateState);
  assert.equal(service.diagnostics().identity!.replayHash, candidateReplay);
  await service.dispose();
});

test("a structurally valid but stale accepted receipt fails closed before browser identity changes", async () => {
  class StaleReceiptKernel extends TestGameplayKernel {
    override async handle(request: RustGameplayAuthorityRequestR7): Promise<RustGameplayAuthorityResponseR7> {
      const response = await super.handle(request);
      if (response.type !== "gameplay-receipt-r7-v1" || response.receipt.status !== "accepted") return response;
      return { ...response, authority: response.receipt.before };
    }
  }
  const service = new RustGameplayAuthorityServiceR7({ workerFactory: () => new TestWorker(new StaleReceiptKernel()), timeoutMs: 100 });
  await service.initialize(await fixtureBytes());
  const before = service.diagnostics().identity!;
  await assert.rejects(service.apply(batch(before, "stale")), /accepted receipt/u);
  assert.ok(rustGameplayIdentityEqualsR7(service.diagnostics().identity!, before));
  await service.dispose();
});

test("worker transport times out fail-closed and never accepts a later stale reply", async () => {
  const worker = new TestWorker(new TestGameplayKernel());
  worker.postMessage = () => { /* deliberately never answer */ };
  let fatal = 0;
  const transport = new RustGameplayWorkerTransportR7(worker, { timeoutMs: 5, onFatal: () => { fatal += 1; } });
  const bytes = await fixtureBytes();
  await assert.rejects(transport.request({ protocolVersion: 1, schemaVersion: 1, requestId: 7, runtimeEpoch: 2, type: "gameplay-initialize-r7-v1", bytes: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer }), /timed out/u);
  assert.equal(fatal, 1);
  transport.dispose();
});
