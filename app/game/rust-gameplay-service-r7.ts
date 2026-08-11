import {
  assertRustGameplayCommandBatchR7,
  createRustGameplayViewQueryR7,
  rustGameplayIdentityEqualsR7,
  rustGameplayRequestTransferListR7,
  type RustGameplayAuthorityIdentityR7,
  type RustGameplayAuthorityRequestR7,
  type RustGameplayAuthorityResponseR7,
  type RustGameplayCommandBatchR7,
  type RustGameplayCommandReceiptR7,
  type RustGameplayViewQueryR7,
} from "./rust-gameplay-contract-r7";
import { inspectRustGameplaySnapshotEnvelopeR7V1 } from "./rust-gameplay-snapshot-r7";
import { RustGameplayWorkerTransportR7, type RustGameplayWorkerPortR7 } from "./rust-gameplay-worker-r7";

const DEFAULT_MAX_RESTARTS = 2;
const DEFAULT_MAX_JOURNAL_BATCHES = 128;
const DEFAULT_MAX_JOURNAL_BYTES = 32 * 1_048_576;
const IDEMPOTENCY_WINDOW = 4_096;

type ServiceState = "idle" | "ready" | "recovering" | "failed" | "disposed";

export type RustGameplayServiceDiagnosticsR7 = Readonly<{
  state: ServiceState;
  runtimeEpoch: number;
  restarts: number;
  staleResults: number;
  journalBatches: number;
  journalBytes: number;
  identity: RustGameplayAuthorityIdentityR7 | null;
}>;

type Options = Readonly<{
  workerFactory: (runtimeEpoch: number) => RustGameplayWorkerPortR7;
  timeoutMs?: number;
  maxRestarts?: number;
  maxJournalBatches?: number;
  maxJournalBytes?: number;
}>;

function ownedBuffer(value: Uint8Array | ArrayBuffer) {
  return value instanceof Uint8Array
    ? value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer
    : value.slice(0);
}

function cloneBatch(batch: RustGameplayCommandBatchR7): RustGameplayCommandBatchR7 {
  return Object.freeze({
    ...batch,
    commands: Object.freeze(batch.commands.map((command) => Object.freeze({ ...command, payload: Uint8Array.from(command.payload) }))),
  });
}

function responseError(response: RustGameplayAuthorityResponseR7): never {
  if (response.type === "gameplay-error-r7-v1") throw new Error(`R7 gameplay authority ${response.code}: ${response.message}`);
  throw new TypeError(`unexpected R7 gameplay response ${response.type}`);
}

/**
 * Browser owner for one Rust gameplay authority worker.
 *
 * The recovery journal contains only acknowledged batches. If a worker dies
 * after applying but before acknowledging, the batch is intentionally absent
 * from recovery and the caller can retry its stable idempotency key exactly
 * once against the restored authority.
 */
export class RustGameplayAuthorityServiceR7 {
  private state: ServiceState = "idle";
  private runtimeEpoch = 0;
  private nextRequestId = 1;
  private restarts = 0;
  private staleResults = 0;
  private transport: RustGameplayWorkerTransportR7 | null = null;
  private failedTransport = false;
  private baseline: ArrayBuffer | null = null;
  private identity: RustGameplayAuthorityIdentityR7 | null = null;
  private journal: RustGameplayCommandBatchR7[] = [];
  private journalBytes = 0;
  private readonly recentReceipts = new Map<string, RustGameplayCommandReceiptR7>();
  private readonly recentReceiptOrder: string[] = [];
  private tail: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: Options) {}

  private readonly markFatal = () => { this.failedTransport = true; };

  private rejectAuthority(message: string): never {
    this.failedTransport = true;
    throw new TypeError(message);
  }

  private serialize<T>(operation: () => Promise<T>) {
    const next = this.tail.then(operation, operation);
    this.tail = next.catch(() => undefined);
    return next;
  }

  private requestBase() {
    const requestId = this.nextRequestId;
    this.nextRequestId = this.nextRequestId === 0xffff_ffff ? 1 : this.nextRequestId + 1;
    return { protocolVersion: 1 as const, schemaVersion: 1 as const, requestId, runtimeEpoch: this.runtimeEpoch };
  }

  private createTransport() {
    this.runtimeEpoch += 1;
    this.failedTransport = false;
    const transport = new RustGameplayWorkerTransportR7(this.options.workerFactory(this.runtimeEpoch), {
      timeoutMs: this.options.timeoutMs,
      onFatal: this.markFatal,
      onStaleResult: () => { this.staleResults += 1; },
    });
    this.transport = transport;
    return transport;
  }

  private async call(transport: RustGameplayWorkerTransportR7, request: RustGameplayAuthorityRequestR7) {
    try { return await transport.request(request, rustGameplayRequestTransferListR7(request)); }
    catch (error) { this.failedTransport = true; throw error; }
  }

  private async initializeTransport(transport: RustGameplayWorkerTransportR7) {
    if (!this.baseline || !this.identity) throw new Error("R7 gameplay recovery has no validated baseline");
    const target = this.identity;
    const bytes = this.baseline.slice(0);
    const initialize = { ...this.requestBase(), type: "gameplay-initialize-r7-v1" as const, bytes };
    const ready = await this.call(transport, initialize);
    if (ready.type !== "gameplay-ready-r7-v1") responseError(ready);
    let replayIdentity = ready.identity;
    for (const stored of this.journal) {
      if (!rustGameplayIdentityEqualsR7(stored.expected, replayIdentity)) throw new TypeError("R7 gameplay recovery journal is not a contiguous authority chain");
      const batch = cloneBatch(stored);
      const request = { ...this.requestBase(), type: "gameplay-apply-r7-v1" as const, batch };
      const response = await this.call(transport, request);
      if (response.type !== "gameplay-receipt-r7-v1" || response.receipt.status !== "accepted") responseError(response);
      if (!rustGameplayIdentityEqualsR7(response.receipt.before, replayIdentity) || !rustGameplayIdentityEqualsR7(response.receipt.after, response.authority)) {
        throw new TypeError("R7 gameplay recovery received a stale or non-contiguous receipt");
      }
      replayIdentity = response.authority;
    }
    if (!rustGameplayIdentityEqualsR7(replayIdentity, target)) throw new TypeError("R7 gameplay recovery did not reproduce the acknowledged authority identity");
  }

  private async ensureTransport() {
    if (this.state === "disposed") throw new Error("R7 gameplay authority service is disposed");
    if (this.transport && !this.failedTransport) return this.transport;
    this.transport?.dispose();
    this.transport = null;
    if (this.runtimeEpoch > 0) {
      const maximum = this.options.maxRestarts ?? DEFAULT_MAX_RESTARTS;
      if (this.restarts >= maximum) { this.state = "failed"; throw new Error(`R7 gameplay authority exceeded ${maximum} bounded restarts`); }
      this.restarts += 1;
      this.state = "recovering";
    }
    const transport = this.createTransport();
    try {
      await this.initializeTransport(transport);
      this.state = "ready";
      return transport;
    } catch (error) {
      transport.dispose();
      if (this.transport === transport) this.transport = null;
      this.failedTransport = true;
      this.state = "failed";
      throw error;
    }
  }

  diagnostics(): RustGameplayServiceDiagnosticsR7 {
    return Object.freeze({
      state: this.state,
      runtimeEpoch: this.runtimeEpoch,
      restarts: this.restarts,
      staleResults: this.staleResults,
      journalBatches: this.journal.length,
      journalBytes: this.journalBytes,
      identity: this.identity,
    });
  }

  initialize(value: Uint8Array | ArrayBuffer) {
    return this.serialize(async () => {
      if (this.state !== "idle") throw new Error("R7 gameplay authority can only initialize once");
      const envelope = inspectRustGameplaySnapshotEnvelopeR7V1(value);
      this.baseline = ownedBuffer(envelope.bytes);
      const transport = this.createTransport();
      try {
        const bytes = this.baseline.slice(0);
        const request = { ...this.requestBase(), type: "gameplay-initialize-r7-v1" as const, bytes };
        const response = await this.call(transport, request);
        if (response.type !== "gameplay-ready-r7-v1") responseError(response);
        this.identity = response.identity;
        this.state = "ready";
        return this.diagnostics();
      } catch (error) {
        transport.dispose();
        if (this.transport === transport) this.transport = null;
        this.state = "failed";
        throw error;
      }
    });
  }

  apply(batch: RustGameplayCommandBatchR7) {
    return this.serialize(async () => {
      assertRustGameplayCommandBatchR7(batch);
      if (!this.identity) throw new Error("R7 gameplay authority is not initialized");
      const retryKey = `${batch.actor.actorId}\u0000${batch.idempotencyKey}`;
      const cached = this.recentReceipts.get(retryKey);
      if (cached) {
        if (cached.commandHash !== batch.commandHash) throw new Error("R7 gameplay idempotency key was reused with a different command hash");
        return cached;
      }
      const before = this.identity;
      const transport = await this.ensureTransport();
      const owned = cloneBatch(batch);
      const request = { ...this.requestBase(), type: "gameplay-apply-r7-v1" as const, batch: owned };
      const response = await this.call(transport, request);
      if (response.type !== "gameplay-receipt-r7-v1") responseError(response);
      const { receipt, authority } = response;
      if (receipt.status === "rejected") {
        if (!rustGameplayIdentityEqualsR7(authority, before)) this.rejectAuthority("R7 rejected command advanced authority state");
        return receipt;
      }
      const isNew = rustGameplayIdentityEqualsR7(receipt.before, before);
      const isAuthorityCurrentRetry = rustGameplayIdentityEqualsR7(authority, before);
      if (isNew) {
        if (!rustGameplayIdentityEqualsR7(receipt.after, authority)) this.rejectAuthority("R7 accepted receipt does not identify current authority");
        this.identity = authority;
        this.journal.push(cloneBatch(batch));
        this.journalBytes += batch.commands.reduce((sum, command) => sum + command.payload.byteLength, 0);
      } else if (!isAuthorityCurrentRetry) {
        this.rejectAuthority("R7 gameplay authority returned a stale accepted receipt");
      }
      this.recentReceipts.set(retryKey, receipt);
      this.recentReceiptOrder.push(retryKey);
      while (this.recentReceiptOrder.length > IDEMPOTENCY_WINDOW) {
        const expired = this.recentReceiptOrder.shift();
        if (expired) this.recentReceipts.delete(expired);
      }
      if (this.journal.length >= (this.options.maxJournalBatches ?? DEFAULT_MAX_JOURNAL_BATCHES)
        || this.journalBytes >= (this.options.maxJournalBytes ?? DEFAULT_MAX_JOURNAL_BYTES)) await this.compactBaseline(transport);
      return receipt;
    });
  }

  view(source: RustGameplayViewQueryR7) {
    return this.serialize(async () => {
      if (!this.identity) throw new Error("R7 gameplay authority is not initialized");
      const identity = this.identity;
      const query = createRustGameplayViewQueryR7(source);
      const transport = await this.ensureTransport();
      const request = { ...this.requestBase(), type: "gameplay-view-r7-v1" as const, query };
      const response = await this.call(transport, request);
      if (response.type !== "gameplay-view-page-r7-v1") responseError(response);
      if (!rustGameplayIdentityEqualsR7(response.page.identity, identity)) this.rejectAuthority("R7 gameplay view was produced from a stale authority revision");
      return response.page;
    });
  }

  private async compactBaseline(transport: RustGameplayWorkerTransportR7) {
    if (!this.identity) throw new Error("R7 gameplay authority is not initialized");
    const expected = this.identity;
    const request = { ...this.requestBase(), type: "gameplay-export-snapshot-r7-v1" as const, expected };
    const response = await this.call(transport, request);
    if (response.type !== "gameplay-snapshot-r7-v1") responseError(response);
    if (!rustGameplayIdentityEqualsR7(response.identity, expected)) this.rejectAuthority("R7 gameplay export is stale");
    const envelope = inspectRustGameplaySnapshotEnvelopeR7V1(response.bytes);
    if (envelope.stateHash !== expected.stateHash || envelope.replayHash !== expected.replayHash) this.rejectAuthority("R7 gameplay export envelope is stale");
    this.baseline = response.bytes.slice(0);
    this.journal = [];
    this.journalBytes = 0;
  }

  exportSnapshot() {
    return this.serialize(async () => {
      const transport = await this.ensureTransport();
      await this.compactBaseline(transport);
      if (!this.baseline) throw new Error("R7 gameplay export produced no baseline");
      return this.baseline.slice(0);
    });
  }

  replaceSnapshot(value: Uint8Array | ArrayBuffer) {
    return this.serialize(async () => {
      if (!this.identity) throw new Error("R7 gameplay authority is not initialized");
      const candidate = ownedBuffer(inspectRustGameplaySnapshotEnvelopeR7V1(value).bytes);
      const expected = this.identity;
      const transport = await this.ensureTransport();
      const bytes = candidate.slice(0);
      const request = { ...this.requestBase(), type: "gameplay-replace-snapshot-r7-v1" as const, expected, bytes };
      const response = await this.call(transport, request);
      if (response.type !== "gameplay-snapshot-replaced-r7-v1") responseError(response);
      this.baseline = candidate;
      this.identity = response.identity;
      this.journal = [];
      this.journalBytes = 0;
      this.recentReceipts.clear();
      this.recentReceiptOrder.length = 0;
      return this.diagnostics();
    });
  }

  dispose() {
    return this.serialize(async () => {
      if (this.state === "disposed") return;
      const transport = this.transport;
      this.transport = null;
      if (transport && !this.failedTransport) {
        const request = { ...this.requestBase(), type: "gameplay-dispose-r7-v1" as const };
        try { await transport.request(request); } catch { /* Terminal cleanup is best effort. */ }
      }
      transport?.dispose();
      this.state = "disposed";
    });
  }
}
