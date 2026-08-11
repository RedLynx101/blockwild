import { RustNetworkRuntimeContractError } from "./rust-network-runtime-contract";
import type { RustNetworkRuntimePortV1 } from "./rust-network-runtime-service";
import {
  createRustIntegratedRuntimeCommandBatchV1,
  createRustIntegratedRuntimeDomainOperationV1,
  rustIntegratedRuntimeWireChecksumV1,
} from "./rust-integrated-runtime-codec";
import type { RustIntegratedRuntimeCommandReceiptV1 } from "./rust-integrated-runtime-contract";
import { RustIntegratedRuntimeServiceV1 } from "./rust-integrated-runtime-service";
import type { NetworkPeerGrantV1 } from "./network-authority-contract";
import {
  RUST_INTEGRATED_NETWORK_AGENT_GRANT_TYPE_V1,
  RUST_INTEGRATED_NETWORK_COMMAND_RELEASE_TYPE_V1,
  RUST_INTEGRATED_NETWORK_DELTA_BUILD_RESPONSE_TYPE_V1,
  RUST_INTEGRATED_NETWORK_DELTA_BUILD_TYPE_V1,
  RUST_INTEGRATED_NETWORK_PEER_GRANT_TYPE_V1,
  RUST_INTEGRATED_NETWORK_PEER_RELEASE_TYPE_V1,
  RUST_INTEGRATED_NETWORK_RECONNECT_RESPONSE_TYPE_V1,
  RUST_INTEGRATED_NETWORK_RECONNECT_TYPE_V1,
  RUST_INTEGRATED_NETWORK_REPLICATION_REMOVE_TYPE_V1,
  RUST_INTEGRATED_NETWORK_REPLICATION_UPSERT_TYPE_V1,
  decodeRustIntegratedNetworkDeltaBuildResponseV1,
  decodeRustIntegratedNetworkReconnectResponseV1,
  encodeRustIntegratedNetworkAgentGrantV1,
  encodeRustIntegratedNetworkCommandReleaseV1,
  encodeRustIntegratedNetworkDeltaBuildV1,
  encodeRustIntegratedNetworkPeerGrantV1,
  encodeRustIntegratedNetworkPeerReleaseV1,
  encodeRustIntegratedNetworkReconnectV1,
  encodeRustIntegratedNetworkReplicationRecordV1,
  type RustIntegratedNetworkAgentGrantV1,
  type RustIntegratedNetworkDeltaBuildRequestV1,
  type RustIntegratedScopedDeltaRecordV1,
} from "./rust-integrated-runtime-network-lifecycle";

export const RUST_INTEGRATED_NETWORK_REQUEST_TYPE_V1 = "blockwild.network.browser-request.r9.v1";
export const RUST_INTEGRATED_NETWORK_RESPONSE_TYPE_V1 = "blockwild.network.browser-response.r9.v1";
const NETWORK_GRANT_RECEIPT_TYPE_V1 = "blockwild.network.grant-install-receipt.v1";
const NETWORK_REPLICATION_RECEIPT_TYPE_V1 = "blockwild.network.replication-record-receipt.v1";
const NETWORK_PEER_RELEASE_RECEIPT_TYPE_V1 = "blockwild.network.peer.release-receipt.v1";
const NETWORK_COMMAND_RELEASE_RECEIPT_TYPE_V1 = "blockwild.network.command.release-receipt.v1";

const MAX_CACHED_NETWORK_RESPONSES = 4_096;

function sameBytes(left: Uint8Array, right: Uint8Array) {
  return left.byteLength === right.byteLength && left.every((value, index) => value === right[index]);
}

/**
 * Adapts the browser WebRTC shell to the sole integrated Rust authority.
 * Complete BWRN/BWNA packets remain opaque; this layer only adds the reliable
 * BWRQ receipt and never translates peer, agent, interest, or delta objects.
 */
export class RustIntegratedNetworkRuntimePortV1 implements RustNetworkRuntimePortV1 {
  readonly backend = "rust-wasm-worker" as const;
  private readonly settled = new Map<string, Readonly<{ request: Uint8Array; response: Uint8Array }>>();
  private readonly pending = new Map<string, Readonly<{ request: Uint8Array; promise: Promise<Uint8Array> }>>();
  private readonly order: string[] = [];
  private serial = Promise.resolve<unknown>(undefined);

  constructor(
    private readonly runtime: RustIntegratedRuntimeServiceV1,
    private readonly actorId = "platform:network",
  ) {}

  request(message: Uint8Array, transfer: readonly ArrayBuffer[]) {
    void transfer;
    if (!(message instanceof Uint8Array)) {
      return Promise.reject(new RustNetworkRuntimeContractError("packet", "integrated network request must be a Uint8Array"));
    }
    const payload = Uint8Array.from(message);
    const payloadHash = rustIntegratedRuntimeWireChecksumV1(payload);
    const cached = this.settled.get(payloadHash);
    if (cached) {
      if (!sameBytes(cached.request, payload)) return Promise.reject(new RustNetworkRuntimeContractError("checksum-collision", "different BWRN bytes share one integrated checksum"));
      return Promise.resolve(Uint8Array.from(cached.response));
    }
    const pending = this.pending.get(payloadHash);
    if (pending) {
      if (!sameBytes(pending.request, payload)) return Promise.reject(new RustNetworkRuntimeContractError("checksum-collision", "different pending BWRN bytes share one integrated checksum"));
      return pending.promise.then((bytes) => Uint8Array.from(bytes));
    }

    const request = this.enqueue(async () => {
      const operation = createRustIntegratedRuntimeDomainOperationV1({
        domain: "network",
        typeId: RUST_INTEGRATED_NETWORK_REQUEST_TYPE_V1,
        schema: 1,
        payload,
      });
      const batch = createRustIntegratedRuntimeCommandBatchV1({
        commandId: `network:${payloadHash}`,
        idempotencyKey: `network:${payloadHash}`,
        actorId: this.actorId,
        expected: this.runtime.identity(),
        operations: [operation],
      });
      const receipt = await this.runtime.command(batch);
      const bytes = this.responseBytes(receipt);
      this.settled.set(payloadHash, Object.freeze({ request: payload, response: bytes }));
      this.order.push(payloadHash);
      while (this.order.length > MAX_CACHED_NETWORK_RESPONSES) {
        const expired = this.order.shift();
        if (expired) this.settled.delete(expired);
      }
      return Uint8Array.from(bytes);
    }).finally(() => {
      this.pending.delete(payloadHash);
    });
    this.pending.set(payloadHash, Object.freeze({ request: payload, promise: request }));
    return request;
  }

  installPeerGrant(grant: NetworkPeerGrantV1) {
    return this.lifecycle(
      RUST_INTEGRATED_NETWORK_PEER_GRANT_TYPE_V1,
      NETWORK_GRANT_RECEIPT_TYPE_V1,
      encodeRustIntegratedNetworkPeerGrantV1(grant),
    ).then(() => undefined);
  }

  installAgentGrant(grant: RustIntegratedNetworkAgentGrantV1) {
    return this.lifecycle(
      RUST_INTEGRATED_NETWORK_AGENT_GRANT_TYPE_V1,
      NETWORK_GRANT_RECEIPT_TYPE_V1,
      encodeRustIntegratedNetworkAgentGrantV1(grant),
    ).then(() => undefined);
  }

  upsertReplicationRecord(value: RustIntegratedScopedDeltaRecordV1) {
    return this.lifecycle(
      RUST_INTEGRATED_NETWORK_REPLICATION_UPSERT_TYPE_V1,
      NETWORK_REPLICATION_RECEIPT_TYPE_V1,
      encodeRustIntegratedNetworkReplicationRecordV1(value),
    ).then(() => undefined);
  }

  removeReplicationRecord(value: RustIntegratedScopedDeltaRecordV1) {
    return this.lifecycle(
      RUST_INTEGRATED_NETWORK_REPLICATION_REMOVE_TYPE_V1,
      NETWORK_REPLICATION_RECEIPT_TYPE_V1,
      encodeRustIntegratedNetworkReplicationRecordV1(value),
    ).then(() => undefined);
  }

  buildDelta(value: RustIntegratedNetworkDeltaBuildRequestV1) {
    return this.lifecycle(
      RUST_INTEGRATED_NETWORK_DELTA_BUILD_TYPE_V1,
      RUST_INTEGRATED_NETWORK_DELTA_BUILD_RESPONSE_TYPE_V1,
      encodeRustIntegratedNetworkDeltaBuildV1(value),
    ).then(decodeRustIntegratedNetworkDeltaBuildResponseV1);
  }

  reconnectCheckpoint(sessionId: string, peerId: string, connectionGeneration: number) {
    return this.lifecycle(
      RUST_INTEGRATED_NETWORK_RECONNECT_TYPE_V1,
      RUST_INTEGRATED_NETWORK_RECONNECT_RESPONSE_TYPE_V1,
      encodeRustIntegratedNetworkReconnectV1(sessionId, peerId, connectionGeneration),
    ).then(decodeRustIntegratedNetworkReconnectResponseV1);
  }

  releasePeer(peerId: string) {
    return this.lifecycle(
      RUST_INTEGRATED_NETWORK_PEER_RELEASE_TYPE_V1,
      NETWORK_PEER_RELEASE_RECEIPT_TYPE_V1,
      encodeRustIntegratedNetworkPeerReleaseV1(peerId),
    ).then(() => undefined);
  }

  /** Releases the Rust authority lease only after the host commits or cancels the command. */
  releaseCommand(commandId: string) {
    return this.lifecycle(
      RUST_INTEGRATED_NETWORK_COMMAND_RELEASE_TYPE_V1,
      NETWORK_COMMAND_RELEASE_RECEIPT_TYPE_V1,
      encodeRustIntegratedNetworkCommandReleaseV1(commandId),
    ).then(() => undefined);
  }

  private lifecycle(typeId: string, responseTypeId: string, payload: Uint8Array) {
    const payloadHash = rustIntegratedRuntimeWireChecksumV1(payload);
    return this.enqueue(async () => {
      const operation = createRustIntegratedRuntimeDomainOperationV1({ domain: "network", typeId, schema: 1, payload });
      const batch = createRustIntegratedRuntimeCommandBatchV1({
        commandId: `${typeId}:${payloadHash}`,
        idempotencyKey: `${typeId}:${payloadHash}`,
        actorId: this.actorId,
        expected: this.runtime.identity(),
        operations: [operation],
      });
      const receipt = await this.runtime.command(batch);
      if (receipt.status === "rejected") throw new RustNetworkRuntimeContractError(receipt.code, receipt.message);
      const response = receipt.domainReceipts[0];
      if (receipt.domainReceipts.length !== 1 || response.domain !== "network" || response.typeId !== responseTypeId || response.schema !== 1) {
        throw new RustNetworkRuntimeContractError("response-kind", `integrated network lifecycle expected ${responseTypeId}`);
      }
      return Uint8Array.from(response.payload);
    });
  }

  private enqueue<T>(operation: () => Promise<T>) {
    const next = this.serial.then(operation, operation);
    this.serial = next.then(() => undefined, () => undefined);
    return next;
  }

  private responseBytes(receipt: RustIntegratedRuntimeCommandReceiptV1) {
    if (receipt.status === "rejected") {
      throw new RustNetworkRuntimeContractError(receipt.code, receipt.message);
    }
    const responses = receipt.domainReceipts.filter((operation) => (
      operation.domain === "network"
      && operation.typeId === RUST_INTEGRATED_NETWORK_RESPONSE_TYPE_V1
      && operation.schema === 1
    ));
    if (responses.length !== 1 || receipt.domainReceipts.length !== 1) {
      throw new RustNetworkRuntimeContractError("response-kind", "integrated network command must return exactly one opaque BWNA response");
    }
    return Uint8Array.from(responses[0].payload);
  }
}
