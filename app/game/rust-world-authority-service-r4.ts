import {
  createWorldReadWindowV1,
  decodeWorldCompatibilitySaveV1,
  sameWorldAddressV1,
  sameWorldRevisionV1,
  worldAddressKeyV1,
  type WorldAddressV1,
  type WorldAuthorityIdentityV1,
  type WorldReadWindowV1,
  type WorldSectionAddressV1,
} from "./world-authority-contract";
import {
  assertRustWorldAuthorityResponseR4V1,
  createRustWorldAuthorityRequestBaseR4V1,
  rustAuxiliaryPatchTransferListR4V1,
  rustSectionInstallTransferListR4V1,
  type RustImmediateEditEventR4V1,
  type RustChunkAuxiliaryInstallR4V1,
  type RustChunkAuxiliaryPatchR4V1,
  type RustResidencyIntentR4V1,
  type RustSectionInstallR4V1,
  type RustWorldAuthorityRequestR4V1,
  type RustWorldAuthorityResponseR4V1,
  type RustWorldAuthorityTransportR4V1,
  type RustWorldBlockCatalogR4V1,
  type RustWorldMutationCommandR4V1,
} from "./rust-world-authority-bridge-r4";

export class RustWorldAuthorityServiceErrorR4V1 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "RustWorldAuthorityServiceErrorR4V1";
  }
}

export type RustWorldAuthorityServiceDiagnosticsR4V1 = Readonly<{
  initialized: boolean;
  disposed: boolean;
  requests: number;
  staleResponses: number;
  cachedPages: number;
  immediateEvents: number;
  lastError: string | null;
  artifactHash: string | null;
}>;

function identityMatches(left: WorldAuthorityIdentityV1, right: WorldAuthorityIdentityV1) {
  return sameWorldAddressV1(left.address, right.address)
    && sameWorldRevisionV1(left.revision, right.revision)
    && left.stateHash === right.stateHash;
}

function immutablePage(page: WorldReadWindowV1) {
  return createWorldReadWindowV1({
    address: page.address,
    origin: page.origin,
    size: page.size,
    identity: page.identity,
    sectionRevisions: page.sectionRevisions,
    streams: page.streams,
  });
}

/**
 * Long-lived coarse authority service. Mutating operations are serialized;
 * read pages are immutable revision-bound values suitable for physics batches.
 */
export class RustWorldAuthorityServiceR4V1 {
  private nextRequestId = 1;
  private current: WorldAuthorityIdentityV1 | null = null;
  private disposed = false;
  private requests = 0;
  private staleResponses = 0;
  private immediateEvents = 0;
  private lastError: string | null = null;
  private artifactHash: string | null = null;
  private operationTail: Promise<void> = Promise.resolve();
  private readonly pages = new Map<string, WorldReadWindowV1>();
  private readonly listeners = new Set<(event: RustImmediateEditEventR4V1) => void>();

  constructor(private readonly transport: RustWorldAuthorityTransportR4V1) {}

  async initialize(address: WorldAddressV1, catalog?: RustWorldBlockCatalogR4V1) {
    this.assertUsable();
    const response = await this.send({
      ...createRustWorldAuthorityRequestBaseR4V1(this.nextRequestId++),
      type: "authority-init-r4-v1",
      address,
      ...(catalog ? { catalog } : {}),
    });
    if (response.type !== "authority-ready-r4-v1") return this.failResponse(response);
    this.current = response.identity;
    this.artifactHash = response.artifactHash ?? null;
    this.pages.clear();
    return response.identity;
  }

  identity() {
    if (!this.current) throw new RustWorldAuthorityServiceErrorR4V1("not-initialized", "world authority is not initialized");
    return this.current;
  }

  subscribeImmediateEdits(listener: (event: RustImmediateEditEventR4V1) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  installSections(
    sections: readonly RustSectionInstallR4V1[],
    auxiliary: readonly RustChunkAuxiliaryInstallR4V1[] = [],
  ) {
    return this.serialize(async () => {
      const identity = this.identity();
      const request = {
        ...createRustWorldAuthorityRequestBaseR4V1(this.nextRequestId++),
        type: "authority-install-sections-r4-v1",
        identity,
        sections,
        auxiliary,
      } satisfies RustWorldAuthorityRequestR4V1;
      const response = await this.send(request, rustSectionInstallTransferListR4V1(sections, auxiliary));
      if (response.type !== "authority-sections-installed-r4-v1") return this.failResponse(response);
      this.acceptIdentity(response.identity, identity);
      this.pages.clear();
      return response;
    });
  }

  patchAuxiliary(patches: readonly RustChunkAuxiliaryPatchR4V1[]) {
    return this.serialize(async () => {
      const identity = this.identity();
      const request = {
        ...createRustWorldAuthorityRequestBaseR4V1(this.nextRequestId++),
        type: "authority-patch-auxiliary-r4-v1",
        identity,
        patches,
      } satisfies RustWorldAuthorityRequestR4V1;
      const response = await this.send(request, rustAuxiliaryPatchTransferListR4V1(patches));
      if (response.type !== "authority-auxiliary-patched-r4-v1") return this.failResponse(response);
      this.acceptIdentity(response.identity, identity);
      this.pages.clear();
      return response;
    });
  }

  importCompatibilitySave(compatibilityJson: Uint8Array, rustExtension?: Uint8Array) {
    return this.serialize(async () => {
      const identity = this.identity();
      const decoded = decodeWorldCompatibilitySaveV1(compatibilityJson);
      if (!sameWorldAddressV1(decoded.address, identity.address)) {
        throw new RustWorldAuthorityServiceErrorR4V1("save-address", "compatibility save belongs to another location");
      }
      const response = await this.send({
        ...createRustWorldAuthorityRequestBaseR4V1(this.nextRequestId++),
        type: "authority-import-save-r4-v1",
        identity,
        save: {
          address: decoded.address,
          revision: decoded.revision,
          edits: decoded.edits,
          facings: decoded.facings,
          checksum: decoded.checksum,
          ...(rustExtension ? { rustExtension: Uint8Array.from(rustExtension) } : {}),
        },
      }, rustExtension ? [rustExtension.buffer as ArrayBuffer] : []);
      if (response.type !== "authority-save-imported-r4-v1") return this.failResponse(response);
      this.acceptReplacementIdentity(response.identity, identity, decoded.revision.mutation);
      this.pages.clear();
      return response;
    });
  }

  updateResidency(intents: readonly RustResidencyIntentR4V1[], cancelledRequestIds: readonly number[]) {
    return this.serialize(async () => {
      const identity = this.identity();
      const response = await this.send({
        ...createRustWorldAuthorityRequestBaseR4V1(this.nextRequestId++),
        type: "authority-residency-intents-r4-v1",
        identity,
        intents,
        cancelledRequestIds,
      });
      if (response.type !== "authority-residency-accepted-r4-v1") return this.failResponse(response);
      this.acceptIdentity(response.identity, identity);
      return response;
    });
  }

  mutate(batchId: string, authorityId: string, commands: readonly RustWorldMutationCommandR4V1[]) {
    return this.serialize(async () => {
      const identity = this.identity();
      const response = await this.send({
        ...createRustWorldAuthorityRequestBaseR4V1(this.nextRequestId++),
        type: "authority-mutate-r4-v1",
        batchId,
        authorityId,
        address: identity.address,
        expectedIdentity: identity,
        commands,
      });
      if (response.type !== "authority-mutation-result-r4-v1") return this.failResponse(response);
      if (response.status === "rejected") {
        if (response.rejectionCode === "stale-revision") this.staleResponses += 1;
        throw new RustWorldAuthorityServiceErrorR4V1(response.rejectionCode ?? "mutation-rejected", response.message ?? "world mutation rejected");
      }
      this.acceptIdentity(response.identity, identity);
      if (response.mutated) this.pages.clear();
      if (response.immediateEvent) {
        if (!identityMatches(response.immediateEvent.identity, response.identity)) {
          throw new RustWorldAuthorityServiceErrorR4V1("event-identity", "immediate edit event identity does not match committed authority");
        }
        this.immediateEvents += 1;
        for (const listener of this.listeners) listener(response.immediateEvent);
      }
      return response;
    });
  }

  /** Browser-audit hook: proves stale identity rejection through the real worker without mutating service state. */
  exerciseStaleMutationForDiagnostics(
    batchId: string,
    commands: readonly RustWorldMutationCommandR4V1[],
  ) {
    return this.serialize(async () => {
      const current = this.identity();
      const staleIdentity = Object.freeze({
        ...current,
        revision: Object.freeze({ ...current.revision, mutation: Math.max(0, current.revision.mutation - 1), residency: Math.max(0, current.revision.residency - 1) }),
        stateHash: "00000000000000000000000000000000",
      });
      const response = await this.send({
        ...createRustWorldAuthorityRequestBaseR4V1(this.nextRequestId++),
        type: "authority-mutate-r4-v1",
        batchId,
        authorityId: "browser-r4-audit",
        address: current.address,
        expectedIdentity: staleIdentity,
        commands,
      });
      if (response.type !== "authority-mutation-result-r4-v1" || response.status !== "rejected"
        || response.rejectionCode !== "stale-revision" || !identityMatches(response.identity, current)) {
        throw new RustWorldAuthorityServiceErrorR4V1("stale-audit", "Rust authority did not reject the deliberately stale mutation");
      }
      this.staleResponses += 1;
      return response;
    });
  }

  /** Browser-audit hook for atomic rollback: expected domain rejection is not a worker failure. */
  exerciseRejectedBatchForDiagnostics(
    batchId: string,
    commands: readonly RustWorldMutationCommandR4V1[],
  ) {
    return this.serialize(async () => {
      const identity = this.identity();
      const response = await this.send({
        ...createRustWorldAuthorityRequestBaseR4V1(this.nextRequestId++),
        type: "authority-mutate-r4-v1",
        batchId,
        authorityId: "browser-r4-audit",
        address: identity.address,
        expectedIdentity: identity,
        commands,
      });
      if (response.type !== "authority-mutation-result-r4-v1" || response.status !== "rejected"
        || !identityMatches(response.identity, identity)) {
        throw new RustWorldAuthorityServiceErrorR4V1("rollback-audit", "Rust authority did not atomically reject the diagnostic batch");
      }
      return response;
    });
  }

  async readPage(origin: Readonly<{ x: number; y: number; z: number }>, size: Readonly<{ x: number; y: number; z: number }>) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const identity = this.identity();
      const key = `${worldAddressKeyV1(identity.address)}|${identity.stateHash}|${origin.x},${origin.y},${origin.z}|${size.x},${size.y},${size.z}`;
      const cached = this.pages.get(key);
      if (cached) return cached;
      const response = await this.send({
        ...createRustWorldAuthorityRequestBaseR4V1(this.nextRequestId++),
        type: "authority-read-page-r4-v1",
        identity,
        origin,
        size,
      });
      if (response.type === "authority-error-r4-v1" && response.code === "stale-revision" && attempt < 2) {
        await this.operationTail;
        continue;
      }
      if (response.type !== "authority-read-page-result-r4-v1") return this.failResponse(response);
      if (identityMatches(response.identity, identity) && identityMatches(response.page.identity, identity)) {
        const page = immutablePage(response.page);
        this.pages.set(key, page);
        return page;
      }
      this.staleResponses += 1;
      if (attempt < 2) {
        await this.operationTail;
        continue;
      }
    }
    throw new RustWorldAuthorityServiceErrorR4V1("stale-read-page", "Rust read page could not stabilize on the current authority revision");
  }

  evictSections(sections: readonly WorldSectionAddressV1[]) {
    return this.serialize(async () => {
      const identity = this.identity();
      const response = await this.send({
        ...createRustWorldAuthorityRequestBaseR4V1(this.nextRequestId++),
        type: "authority-evict-sections-r4-v1",
        identity,
        sections,
      });
      if (response.type !== "authority-sections-evicted-r4-v1") return this.failResponse(response);
      this.acceptIdentity(response.identity, identity);
      this.pages.clear();
      return response;
    });
  }

  switchLocation(address: WorldAddressV1) {
    return this.serialize(async () => {
      const identity = this.identity();
      const response = await this.send({
        ...createRustWorldAuthorityRequestBaseR4V1(this.nextRequestId++),
        type: "authority-switch-location-r4-v1",
        identity,
        address,
      });
      if (response.type !== "authority-location-switched-r4-v1") return this.failResponse(response);
      if (!sameWorldAddressV1(response.identity.address, address)) throw new RustWorldAuthorityServiceErrorR4V1("switch-address", "authority switched to the wrong location");
      this.current = response.identity;
      this.pages.clear();
      return response.identity;
    });
  }

  exportSave() {
    return this.serialize(async () => {
      const identity = this.identity();
      const response = await this.send({
        ...createRustWorldAuthorityRequestBaseR4V1(this.nextRequestId++),
        type: "authority-export-save-r4-v1",
        identity,
      });
      if (response.type !== "authority-save-result-r4-v1") return this.failResponse(response);
      if (!identityMatches(response.identity, identity)) throw new RustWorldAuthorityServiceErrorR4V1("stale-save", "save export belongs to an obsolete authority revision");
      return Object.freeze({
        compatibilityJson: Uint8Array.from(response.compatibilityJson),
        rustExtension: Uint8Array.from(response.rustExtension),
      });
    });
  }

  diagnostics(): RustWorldAuthorityServiceDiagnosticsR4V1 {
    return Object.freeze({
      initialized: Boolean(this.current),
      disposed: this.disposed,
      requests: this.requests,
      staleResponses: this.staleResponses,
      cachedPages: this.pages.size,
      immediateEvents: this.immediateEvents,
      lastError: this.lastError,
      artifactHash: this.artifactHash,
    });
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pages.clear();
    this.listeners.clear();
    const identity = this.current;
    this.current = null;
    try {
      const response = await this.send({
        ...createRustWorldAuthorityRequestBaseR4V1(this.nextRequestId++),
        type: "authority-dispose-r4-v1",
        identity,
      });
      if (response.type !== "authority-disposed-r4-v1") this.failResponse(response);
    } finally {
      await this.transport.dispose?.();
    }
  }

  private async send(request: RustWorldAuthorityRequestR4V1, transfer?: readonly ArrayBuffer[]) {
    this.requests += 1;
    let response: RustWorldAuthorityResponseR4V1;
    try {
      response = await this.transport.request(request, transfer);
      assertRustWorldAuthorityResponseR4V1(response, request.requestId);
    } catch (error) {
      this.lastError = error instanceof Error ? error.message : String(error);
      throw error;
    }
    this.lastError = null;
    return response;
  }

  private acceptIdentity(next: WorldAuthorityIdentityV1, previous: WorldAuthorityIdentityV1) {
    if (!sameWorldAddressV1(next.address, previous.address)
      || next.revision.epoch !== previous.revision.epoch
      || next.revision.mutation < previous.revision.mutation
      || next.revision.residency < previous.revision.residency) {
      this.staleResponses += 1;
      throw new RustWorldAuthorityServiceErrorR4V1("authority-regression", "Rust authority identity regressed or changed location unexpectedly");
    }
    this.current = next;
  }

  private acceptReplacementIdentity(
    next: WorldAuthorityIdentityV1,
    previous: WorldAuthorityIdentityV1,
    importedMutationRevision: number,
  ) {
    if (!sameWorldAddressV1(next.address, previous.address)
      || next.revision.epoch <= previous.revision.epoch
      || next.revision.mutation !== importedMutationRevision
      || next.revision.residency !== 0) {
      this.staleResponses += 1;
      throw new RustWorldAuthorityServiceErrorR4V1(
        "authority-replacement-regression",
        "Rust authority import did not establish a fresh monotonic replacement epoch",
      );
    }
    this.current = next;
  }

  private failResponse(response: RustWorldAuthorityResponseR4V1): never {
    if (response.type === "authority-error-r4-v1") {
      this.lastError = response.message;
      throw new RustWorldAuthorityServiceErrorR4V1(response.code, response.message);
    }
    throw new RustWorldAuthorityServiceErrorR4V1("unexpected-response", `unexpected Rust authority response ${response.type}`);
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    this.assertUsable();
    const result = this.operationTail.then(operation, operation);
    this.operationTail = result.then(() => undefined, () => undefined);
    return result;
  }

  private assertUsable() {
    if (this.disposed) throw new RustWorldAuthorityServiceErrorR4V1("disposed", "world authority service has been disposed");
  }
}
