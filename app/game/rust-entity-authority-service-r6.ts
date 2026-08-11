import {
  RUST_ENTITY_AUTHORITY_PROTOCOL_R6_V1,
  RUST_ENTITY_MAX_COMMANDS_PER_BATCH_R6,
  type RustEntityAuthorityResponseR6,
  type RustEntityCommandBatchR6,
  type RustEntityEventBatchR6,
} from "./rust-entity-authority-contract-r6";
import {
  createEmptyRustEntityAuthoritySnapshotR6V2,
  decodeRustEntityAuthoritySnapshotR6V2,
  decodeRustEntityCompatibilityRecordR6V1,
  encodeRustEntityAuthoritySnapshotR6V2,
} from "./rust-entity-authority-codec-r6";
import {
  RustEntityAuthorityWorkerTransportR6,
  assertRustEntityCommandBatchR6,
  rustEntityAuthorityRequestTransferListR6,
  type RustEntityAuthorityWorkerPortR6,
} from "./rust-entity-authority-worker-r6";

const DEFAULT_MAX_JOURNAL_BATCHES = 128;
const DEFAULT_MAX_JOURNAL_COMMANDS = 4_096;

export type RustEntityAuthorityServiceStateR6 = "idle" | "ready" | "recovering" | "failed" | "disposed";

export type RustEntityAuthorityServiceDiagnosticsR6 = Readonly<{
  state: RustEntityAuthorityServiceStateR6;
  revision: bigint;
  lastSequence: bigint | null;
  runtimeEpoch: number;
  restarts: number;
  failures: number;
  staleResults: number;
  journalBatches: number;
  journalCommands: number;
  baselineBytes: number;
  livePromotionAuthorized: false;
}>;

function errorResponse(response: RustEntityAuthorityResponseR6): never {
  if (response.type === "entity-error-r6-v1") throw new Error(`R6 entity authority ${response.code}: ${response.message}`);
  throw new TypeError(`R6 entity authority returned unexpected response ${response.type}`);
}

function ownedBuffer(value: Uint8Array | ArrayBuffer) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  return bytes.slice().buffer;
}

export class RustEntityAuthorityBrowserServiceR6 {
  private state: RustEntityAuthorityServiceStateR6 = "idle";
  private transport: RustEntityAuthorityWorkerTransportR6 | null = null;
  private runtimeEpoch = 0;
  private requestId = 1;
  private revision = BigInt(0);
  private lastSequence: bigint | null = null;
  private baseline = encodeRustEntityAuthoritySnapshotR6V2(createEmptyRustEntityAuthoritySnapshotR6V2()).buffer;
  private journal: RustEntityCommandBatchR6[] = [];
  private journalCommands = 0;
  private failedTransport = false;
  private restarts = 0;
  private failures = 0;
  private staleResults = 0;
  private tail = Promise.resolve();

  constructor(private readonly options: Readonly<{
    workerFactory: (runtimeEpoch: number) => RustEntityAuthorityWorkerPortR6;
    timeoutMs?: number;
    maxRestarts?: number;
    maxJournalBatches?: number;
    maxJournalCommands?: number;
  }>) {}

  diagnostics(): RustEntityAuthorityServiceDiagnosticsR6 {
    return Object.freeze({
      state: this.state,
      revision: this.revision,
      lastSequence: this.lastSequence,
      runtimeEpoch: this.runtimeEpoch,
      restarts: this.restarts,
      failures: this.failures,
      staleResults: this.staleResults,
      journalBatches: this.journal.length,
      journalCommands: this.journalCommands,
      baselineBytes: this.baseline.byteLength,
      livePromotionAuthorized: false,
    });
  }

  private serialize<T>(operation: () => Promise<T>) {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  private nextRequestId() {
    const value = this.requestId;
    this.requestId = this.requestId === 0xffff_ffff ? 1 : this.requestId + 1;
    return value;
  }

  private requestBase() {
    return {
      protocolVersion: RUST_ENTITY_AUTHORITY_PROTOCOL_R6_V1,
      schemaVersion: 1 as const,
      requestId: this.nextRequestId(),
      runtimeEpoch: this.runtimeEpoch,
    };
  }

  private markFatal = () => {
    if (this.state === "disposed") return;
    this.failures += 1;
    this.failedTransport = true;
    this.state = "failed";
  };

  private createTransport() {
    this.runtimeEpoch += 1;
    const transport = new RustEntityAuthorityWorkerTransportR6(this.options.workerFactory(this.runtimeEpoch), {
      timeoutMs: this.options.timeoutMs,
      onFatal: this.markFatal,
      onStaleResult: () => { this.staleResults += 1; },
    });
    this.transport = transport;
    this.failedTransport = false;
    return transport;
  }

  private async initializeTransport(transport: RustEntityAuthorityWorkerTransportR6) {
    const bytes = this.baseline.slice(0);
    const request = { ...this.requestBase(), type: "entity-initialize-r6-v1" as const, source: "snapshot" as const, bytes };
    const response = await transport.request(request, rustEntityAuthorityRequestTransferListR6(request));
    if (response.type !== "entity-ready-r6-v1") errorResponse(response);
    const baseline = decodeRustEntityAuthoritySnapshotR6V2(this.baseline);
    if (response.revision !== baseline.revision || response.lastSequence !== baseline.lastSequence) throw new TypeError("R6 entity worker initialized with a divergent snapshot identity");
    let replayRevision = baseline.revision;
    let replaySequence = baseline.lastSequence;
    for (const batch of this.journal) {
      if (batch.expectedRevision !== replayRevision) throw new TypeError("R6 recovery journal has a discontinuous revision");
      const replay = { ...this.requestBase(), type: "entity-apply-r6-v1" as const, batch };
      const result = await transport.request(replay);
      if (result.type !== "entity-events-r6-v1") errorResponse(result);
      replayRevision = result.result.revision;
      replaySequence = result.result.sequence;
    }
    if (replayRevision !== this.revision || replaySequence !== this.lastSequence) throw new TypeError("R6 recovery replay did not reproduce the current authority identity");
  }

  private async ensureTransport() {
    if (this.state === "disposed") throw new Error("R6 entity authority service is disposed");
    if (this.transport && !this.failedTransport) return this.transport;
    if (this.transport) { this.transport.dispose(); this.transport = null; }
    if (this.runtimeEpoch > 0) {
      const maximum = this.options.maxRestarts ?? 2;
      if (this.restarts >= maximum) throw new Error(`R6 entity authority exceeded ${maximum} bounded restarts`);
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

  initializeFromSnapshot(value: Uint8Array | ArrayBuffer = encodeRustEntityAuthoritySnapshotR6V2(createEmptyRustEntityAuthoritySnapshotR6V2())) {
    const candidate = ownedBuffer(value);
    return this.serialize(async () => {
      if (this.state !== "idle") throw new Error("R6 entity authority can only initialize once");
      const decoded = decodeRustEntityAuthoritySnapshotR6V2(candidate);
      this.baseline = candidate;
      this.revision = decoded.revision;
      this.lastSequence = decoded.lastSequence;
      this.journal = [];
      this.journalCommands = 0;
      await this.ensureTransport();
      return this.diagnostics();
    });
  }

  initializeFromCompatibility(value: Uint8Array | ArrayBuffer) {
    const candidate = ownedBuffer(value);
    return this.serialize(async () => {
      if (this.state !== "idle") throw new Error("R6 entity authority can only initialize once");
      decodeRustEntityCompatibilityRecordR6V1(candidate);
      this.runtimeEpoch += 1;
      const transport = new RustEntityAuthorityWorkerTransportR6(this.options.workerFactory(this.runtimeEpoch), {
        timeoutMs: this.options.timeoutMs,
        onFatal: this.markFatal,
        onStaleResult: () => { this.staleResults += 1; },
      });
      this.transport = transport;
      try {
        const bytes = candidate.slice(0);
        const request = { ...this.requestBase(), type: "entity-initialize-r6-v1" as const, source: "compatibility" as const, bytes };
        const response = await transport.request(request, rustEntityAuthorityRequestTransferListR6(request));
        if (response.type !== "entity-ready-r6-v1") errorResponse(response);
        this.revision = response.revision;
        this.lastSequence = response.lastSequence;
        this.state = "ready";
        await this.compactBaseline(transport);
        return this.diagnostics();
      } catch (error) {
        transport.dispose();
        if (this.transport === transport) this.transport = null;
        this.failedTransport = true;
        this.state = "failed";
        throw error;
      }
    });
  }

  apply(batch: RustEntityCommandBatchR6) {
    const ownedBatch = structuredClone(batch) as RustEntityCommandBatchR6;
    return this.serialize(async () => {
      assertRustEntityCommandBatchR6(ownedBatch);
      if (ownedBatch.expectedRevision !== this.revision) throw new Error(`R6 entity batch expected revision ${ownedBatch.expectedRevision} but service owns ${this.revision}`);
      const transport = await this.ensureTransport();
      const request = { ...this.requestBase(), type: "entity-apply-r6-v1" as const, batch: ownedBatch };
      const response = await transport.request(request);
      if (response.type !== "entity-events-r6-v1") errorResponse(response);
      const result = response.result;
      if (result.previousRevision !== this.revision || result.sequence !== ownedBatch.sequence) throw new TypeError("R6 entity event receipt is stale");
      this.revision = result.revision;
      this.lastSequence = result.sequence;
      this.journal.push(ownedBatch);
      this.journalCommands += ownedBatch.commands.length;
      if (this.journal.length >= (this.options.maxJournalBatches ?? DEFAULT_MAX_JOURNAL_BATCHES)
        || this.journalCommands >= (this.options.maxJournalCommands ?? DEFAULT_MAX_JOURNAL_COMMANDS)) {
        await this.compactBaseline(transport);
      }
      return result;
    });
  }

  private async compactBaseline(transport: RustEntityAuthorityWorkerTransportR6) {
    const request = { ...this.requestBase(), type: "entity-export-snapshot-r6-v1" as const, expectedRevision: this.revision };
    const response = await transport.request(request);
    if (response.type !== "entity-snapshot-r6-v1") errorResponse(response);
    const decoded = decodeRustEntityAuthoritySnapshotR6V2(response.bytes);
    if (decoded.revision !== this.revision || decoded.lastSequence !== this.lastSequence) throw new TypeError("R6 exported recovery snapshot is stale");
    this.baseline = response.bytes.slice(0);
    this.journal = [];
    this.journalCommands = 0;
  }

  exportSnapshot() {
    return this.serialize(async () => {
      const transport = await this.ensureTransport();
      await this.compactBaseline(transport);
      return this.baseline.slice(0);
    });
  }

  replaceSnapshot(value: Uint8Array | ArrayBuffer) {
    const candidate = ownedBuffer(value);
    return this.serialize(async () => {
      const decoded = decodeRustEntityAuthoritySnapshotR6V2(candidate);
      const previousRevision = this.revision;
      const transport = await this.ensureTransport();
      const request = { ...this.requestBase(), type: "entity-replace-snapshot-r6-v1" as const, expectedRevision: previousRevision, bytes: candidate.slice(0) };
      const response = await transport.request(request, rustEntityAuthorityRequestTransferListR6(request));
      if (response.type !== "entity-snapshot-replaced-r6-v1") errorResponse(response);
      if (response.previousRevision !== previousRevision || response.revision !== decoded.revision || response.lastSequence !== decoded.lastSequence) {
        this.failedTransport = true;
        this.state = "failed";
        throw new TypeError("R6 snapshot replacement acknowledgement diverges from the validated candidate");
      }
      this.baseline = candidate;
      this.revision = decoded.revision;
      this.lastSequence = decoded.lastSequence;
      this.journal = [];
      this.journalCommands = 0;
      return this.diagnostics();
    });
  }

  dispose() {
    return this.serialize(async () => {
      if (this.state === "disposed") return;
      const transport = this.transport;
      this.transport = null;
      if (transport && !this.failedTransport) {
        const request = { ...this.requestBase(), type: "entity-dispose-r6-v1" as const };
        try { await transport.request(request); } catch { /* terminal cleanup is best effort */ }
      }
      transport?.dispose();
      this.state = "disposed";
    });
  }
}

export function assertRustEntityEventBatchR6(result: RustEntityEventBatchR6, expected: RustEntityCommandBatchR6) {
  const nextRevision = (result.previousRevision + BigInt(1)) % (BigInt(1) << BigInt(64));
  if (result.schema !== 1 || result.sequence !== expected.sequence || result.previousRevision !== expected.expectedRevision || result.revision !== nextRevision) {
    throw new TypeError("R6 entity event batch has incompatible revision fields");
  }
  if (result.events.length > RUST_ENTITY_MAX_COMMANDS_PER_BATCH_R6) throw new RangeError("R6 entity event batch exceeds its bound");
  return result;
}
