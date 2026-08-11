/**
 * Browser-neutral R5-R7 command boundary for the integrated Rust runtime.
 *
 * This contract intentionally carries opaque, versioned domain payloads. The
 * runtime worker decodes each payload with the matching Rust domain codec; the
 * browser shell never translates native authority objects or performs hidden
 * gameplay calculations.
 */

export const RUST_INTEGRATED_RUNTIME_WIRE_V1 = 1 as const;
export const RUST_INTEGRATED_RUNTIME_SCHEMA_V2 = 2 as const;
export const RUST_INTEGRATED_RUNTIME_FIXED_STEP_US = 50_000;
export const RUST_INTEGRATED_RUNTIME_MAX_REQUEST_BYTES = 8 * 1024 * 1024;
export const RUST_INTEGRATED_RUNTIME_MAX_DOMAIN_PAYLOAD_BYTES = 1024 * 1024;
export const RUST_INTEGRATED_RUNTIME_MAX_EXTRACTION_BYTES = 6 * 1024 * 1024;
export const RUST_INTEGRATED_RUNTIME_MAX_OPERATIONS = 256;
export const RUST_INTEGRATED_RUNTIME_MAX_INPUT_FRAMES = 128;
export const RUST_INTEGRATED_RUNTIME_MAX_PENDING_REQUESTS = 128;
export const RUST_INTEGRATED_RUNTIME_MAX_IDEMPOTENCY_RECEIPTS = 4_096;

/** Frozen RuntimeInputFrameV1 button ABI. Toggle actions are rising-edge detected in Rust. */
export const RUST_RUNTIME_INPUT_BUTTON_V1 = Object.freeze({
  jump: 1 << 0,
  crouch: 1 << 1,
  sprint: 1 << 2,
  ascend: 1 << 3,
  descend: 1 << 4,
  primaryAttack: 1 << 5,
  secondaryUse: 1 << 6,
  interact: 1 << 7,
  mountToggle: 1 << 8,
  creativeFlightToggle: 1 << 9,
  drop: 1 << 10,
} as const);

export const RUST_RUNTIME_INPUT_BUTTON_MASK_V1 = (1 << 11) - 1;

/** Frozen RuntimeInputFrameV1 state flags; authority still validates eligibility. */
export const RUST_RUNTIME_INPUT_FLAG_V1 = Object.freeze({
  creative: 1 << 0,
  flying: 1 << 1,
  mounted: 1 << 2,
} as const);

export const RUST_RUNTIME_INPUT_FLAG_MASK_V1 = (1 << 3) - 1;

export type RustIntegratedRuntimeDomainV1 =
  | "world"
  | "simulation"
  | "entities"
  | "gameplay"
  | "persistence"
  | "network";

export type RustIntegratedRuntimeRevisionV1 = Readonly<{
  epoch: number;
  world: number;
  entities: number;
  gameplay: number;
  persistence: number;
  network: number;
  simulation: number;
}>;

export type RustIntegratedRuntimeIdentityV1 = Readonly<{
  universeId: string;
  locationId: string;
  revision: RustIntegratedRuntimeRevisionV1;
  tick: number;
  stateHash: string;
}>;

export type RustIntegratedRuntimeConfigV1 = Readonly<{
  worldSeed: string;
  universeId: string;
  locationId: string;
  sessionId: string;
  contentHash: string;
  generatorHash: string;
  waterBlockId: number;
  directionalBlockIds: readonly number[];
  waterloggedBlockIds: readonly number[];
}>;

/**
 * A deterministic, fixed-width input sample. moveX/moveZ are signed-normalized
 * axes. lookYaw is an absolute wrapped heading where the i16 range maps to
 * -PI..PI; lookPitch uses the same normalized range. Unknown button/flag bits
 * fail closed so replays cannot silently change meaning.
 */
export type RustIntegratedRuntimeInputFrameV1 = Readonly<{
  sequence: number;
  targetTick: number;
  moveX: number;
  moveZ: number;
  lookYaw: number;
  lookPitch: number;
  buttons: number;
  selectedSlot: number;
  flags: number;
}>;

/**
 * A domain payload has exactly one Rust decoder selected by typeId + schema.
 * payloadHash covers the exact bytes, not an independently maintained DTO.
 */
export type RustIntegratedRuntimeDomainOperationV1 = Readonly<{
  domain: RustIntegratedRuntimeDomainV1;
  typeId: string;
  schema: number;
  payload: Uint8Array;
  payloadHash: string;
}>;

export type RustIntegratedRuntimeCommandBatchV1 = Readonly<{
  commandId: string;
  idempotencyKey: string;
  actorId: string;
  expected: RustIntegratedRuntimeIdentityV1;
  operations: readonly RustIntegratedRuntimeDomainOperationV1[];
  commandHash: string;
}>;

export type RustIntegratedRuntimeRequestV1 =
  | Readonly<{
    type: "runtime-create-v1";
    requestId: number;
    clientEpoch: number;
    config: RustIntegratedRuntimeConfigV1;
  }>
  | Readonly<{
    type: "runtime-command-v1";
    requestId: number;
    clientEpoch: number;
    batch: RustIntegratedRuntimeCommandBatchV1;
  }>
  | Readonly<{
    type: "runtime-step-v1";
    requestId: number;
    clientEpoch: number;
    expected: RustIntegratedRuntimeIdentityV1;
    monotonicTimeUs: number;
    budgetUs: number;
    inputs: readonly RustIntegratedRuntimeInputFrameV1[];
  }>
  | Readonly<{
    type: "runtime-extract-v1";
    requestId: number;
    clientEpoch: number;
    expected: RustIntegratedRuntimeIdentityV1;
    afterRevision: number;
    maxBytes: number;
  }>
  | Readonly<{
    type: "runtime-restore-v1";
    requestId: number;
    clientEpoch: number;
    expectedCheckpointHash: string;
    checkpoint: Uint8Array;
  }>
  | Readonly<{
    type: "runtime-checkpoint-v1";
    requestId: number;
    clientEpoch: number;
    expected: RustIntegratedRuntimeIdentityV1;
  }>
  | Readonly<{
    type: "runtime-shutdown-v1";
    requestId: number;
    clientEpoch: number;
    expected: RustIntegratedRuntimeIdentityV1 | null;
  }>;

export type RustIntegratedRuntimeAcceptedReceiptV1 = Readonly<{
  status: "accepted";
  commandId: string;
  idempotencyKey: string;
  commandHash: string;
  before: RustIntegratedRuntimeIdentityV1;
  after: RustIntegratedRuntimeIdentityV1;
  domainReceipts: readonly RustIntegratedRuntimeDomainOperationV1[];
  receiptHash: string;
}>;

export type RustIntegratedRuntimeRejectedReceiptV1 = Readonly<{
  status: "rejected";
  commandId: string;
  idempotencyKey: string;
  commandHash: string;
  code: string;
  message: string;
  current: RustIntegratedRuntimeIdentityV1;
  receiptHash: string;
}>;

export type RustIntegratedRuntimeCommandReceiptV1 =
  | RustIntegratedRuntimeAcceptedReceiptV1
  | RustIntegratedRuntimeRejectedReceiptV1;

export type RustIntegratedRuntimeExtractionV1 = Readonly<{
  identity: RustIntegratedRuntimeIdentityV1;
  extractionRevision: number;
  render: Uint8Array;
  hud: Uint8Array;
  audio: Uint8Array;
  platformRequests: Uint8Array;
  diagnostics: Uint8Array;
  extractionHash: string;
}>;

export type RustIntegratedRuntimeResponseV1 =
  | Readonly<{
    type: "runtime-ready-v1";
    requestId: number;
    clientEpoch: number;
    workerEpoch: number;
    /** Opaque generational handle. Only the dedicated Worker uses it for Wasm calls. */
    runtimeHandle: number;
    identity: RustIntegratedRuntimeIdentityV1;
    artifactHash: string;
    instanceId: string;
    capabilities: readonly string[];
  }>
  | Readonly<{
    type: "runtime-command-receipt-v1";
    requestId: number;
    clientEpoch: number;
    workerEpoch: number;
    receipt: RustIntegratedRuntimeCommandReceiptV1;
  }>
  | Readonly<{
    type: "runtime-step-result-v1";
    requestId: number;
    clientEpoch: number;
    workerEpoch: number;
    identity: RustIntegratedRuntimeIdentityV1;
    fixedSteps: number;
    inputsApplied: number;
    commandsProcessed: number;
    commandsAccepted: number;
    replayHash: string;
  }>
  | Readonly<{
    type: "runtime-extraction-v1";
    requestId: number;
    clientEpoch: number;
    workerEpoch: number;
    extraction: RustIntegratedRuntimeExtractionV1;
  }>
  | Readonly<{
    type: "runtime-restored-v1";
    requestId: number;
    clientEpoch: number;
    workerEpoch: number;
    identity: RustIntegratedRuntimeIdentityV1;
    runtimeHandle: number;
    checkpointHash: string;
    /** Re-attestation is mandatory after every worker generation restart. */
    artifactHash: string;
    instanceId: string;
    capabilities: readonly string[];
  }>
  | Readonly<{
    type: "runtime-checkpoint-v1";
    requestId: number;
    clientEpoch: number;
    workerEpoch: number;
    identity: RustIntegratedRuntimeIdentityV1;
    checkpoint: Uint8Array;
    checkpointHash: string;
  }>
  | Readonly<{
    type: "runtime-shutdown-v1";
    requestId: number;
    clientEpoch: number;
    workerEpoch: number;
  }>
  | Readonly<{
    type: "runtime-error-v1";
    requestId: number;
    clientEpoch: number;
    workerEpoch: number;
    code: string;
    message: string;
    current: RustIntegratedRuntimeIdentityV1 | null;
  }>;

export type RustIntegratedRuntimeTransferV1 = Readonly<{
  bytes: Uint8Array;
  transfer: readonly ArrayBuffer[];
}>;

export interface RustIntegratedRuntimeTransportV1 {
  request(request: RustIntegratedRuntimeRequestV1): Promise<RustIntegratedRuntimeResponseV1>;
  dispose(): void;
}

export function rustIntegratedRuntimeIdentityEqualsV1(
  left: RustIntegratedRuntimeIdentityV1,
  right: RustIntegratedRuntimeIdentityV1,
) {
  return left.universeId === right.universeId
    && left.locationId === right.locationId
    && left.tick === right.tick
    && left.stateHash === right.stateHash
    && Object.keys(left.revision).every((key) => (
      left.revision[key as keyof RustIntegratedRuntimeRevisionV1]
      === right.revision[key as keyof RustIntegratedRuntimeRevisionV1]
    ));
}
