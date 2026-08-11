import {
  WORLD_AUTHORITY_PROTOCOL_V1,
  WORLD_AUTHORITY_SCHEMA_V1,
  type WorldAddressV1,
  type WorldAuthorityIdentityV1,
  type WorldMutationCommandV1,
  type WorldReadWindowV1,
  type WorldSectionAddressV1,
} from "./world-authority-contract";

export const RUST_WORLD_AUTHORITY_BRIDGE_PROTOCOL_R4_V1 = 1 as const;
export const RUST_WORLD_AUTHORITY_MAX_SECTIONS_PER_MESSAGE_R4_V1 = 256;
export const RUST_WORLD_AUTHORITY_MAX_BYTES_R4_V1 = 32 * 1024 * 1024;

export type RustLiquidMetadataR4V1 = Readonly<{
  kind: number;
  level: number;
  flags: number;
}>;

export type RustWorldMutationCommandR4V1 = WorldMutationCommandV1 | Readonly<{
  kind: "set-liquid";
  x: number;
  y: number;
  z: number;
  liquid: RustLiquidMetadataR4V1;
}>;

export type RustSectionInstallR4V1 = Readonly<{
  address: WorldSectionAddressV1;
  sourceRevision: number;
  sourceHash: string;
  blocks: Uint16Array;
  facing: Uint8Array;
  liquidKind: Uint8Array;
  liquidLevel: Uint8Array;
  flags: Uint8Array;
}>;

export type RustWorldBlockCatalogR4V1 = Readonly<{
  waterBlockId: number;
  directionalBlocks: readonly number[];
  waterloggedBlocks: readonly number[];
}>;

/** Renderer-independent generated streams retained with a resident chunk. */
export type RustChunkAuxiliaryInstallR4V1 = Readonly<{
  address: Readonly<WorldAddressV1 & { chunkX: number; chunkZ: number }>;
  sourceRevision: number;
  sourceHash: string;
  heightmap: Int16Array;
  biomes: Uint8Array;
  sectionBlockCounts: Uint16Array;
  skyTops: Int16Array;
  light: Uint16Array;
  lightIndices: Uint32Array;
  leafIndices: Uint32Array;
  markers: readonly Readonly<{ key: string; canonicalJson: string }>[];
}>;

export type RustChunkAuxiliaryPatchR4V1 = Readonly<{
  address: Readonly<WorldAddressV1 & { chunkX: number; chunkZ: number }>;
  expectedSourceRevision: number;
  expectedSourceHash: string;
  sourceRevision: number;
  sourceHash: string;
  lightSections: readonly Readonly<{ sectionY: number; light: Uint16Array }>[];
  sectionBlockCounts: readonly Readonly<{ index: number; value: number }>[];
  skyTops: readonly Readonly<{ index: number; value: number }>[];
  lightIndices?: Uint32Array;
  leafIndices?: Uint32Array;
  markers?: readonly Readonly<{ key: string; canonicalJson: string }>[];
}>;

export type RustResidencyIntentR4V1 = Readonly<{
  requestId: number;
  address: WorldSectionAddressV1;
  class: "occupied-support" | "player-edited" | "immediate-opaque" | "immediate-translucent" | "movement-forward" | "visible-mid" | "background";
  purpose: "generate" | "cache-read" | "light" | "mesh" | "retain";
  distanceSquared: number;
  directionPenalty: number;
  sequence: number;
}>;

export type RustCompatibilitySaveImportR4V1 = Readonly<{
  address: WorldAddressV1;
  revision: Readonly<{ epoch: number; mutation: number; residency: number }>;
  edits: readonly Readonly<{ chunkX: number; chunkZ: number; entries: readonly (readonly [number, number])[] }>[];
  facings: readonly Readonly<{ x: number; y: number; z: number; facing: number }>[];
  checksum: string;
  rustExtension?: Uint8Array;
}>;

type RequestBase = Readonly<{
  protocolVersion: typeof RUST_WORLD_AUTHORITY_BRIDGE_PROTOCOL_R4_V1;
  worldProtocolVersion: typeof WORLD_AUTHORITY_PROTOCOL_V1;
  schemaVersion: typeof WORLD_AUTHORITY_SCHEMA_V1;
  requestId: number;
}>;

export type RustWorldAuthorityRequestR4V1 =
  | (RequestBase & Readonly<{ type: "authority-init-r4-v1"; address: WorldAddressV1; catalog?: RustWorldBlockCatalogR4V1 }>)
  | (RequestBase & Readonly<{ type: "authority-install-sections-r4-v1"; identity: WorldAuthorityIdentityV1; sections: readonly RustSectionInstallR4V1[]; auxiliary?: readonly RustChunkAuxiliaryInstallR4V1[] }>)
  | (RequestBase & Readonly<{ type: "authority-import-save-r4-v1"; identity: WorldAuthorityIdentityV1; save: RustCompatibilitySaveImportR4V1 }>)
  | (RequestBase & Readonly<{ type: "authority-residency-intents-r4-v1"; identity: WorldAuthorityIdentityV1; intents: readonly RustResidencyIntentR4V1[]; cancelledRequestIds: readonly number[] }>)
  | (RequestBase & Readonly<{ type: "authority-mutate-r4-v1"; batchId: string; authorityId: string; address: WorldAddressV1; expectedIdentity: WorldAuthorityIdentityV1; commands: readonly RustWorldMutationCommandR4V1[] }>)
  | (RequestBase & Readonly<{ type: "authority-read-page-r4-v1"; identity: WorldAuthorityIdentityV1; origin: Readonly<{ x: number; y: number; z: number }>; size: Readonly<{ x: number; y: number; z: number }> }>)
  | (RequestBase & Readonly<{ type: "authority-evict-sections-r4-v1"; identity: WorldAuthorityIdentityV1; sections: readonly WorldSectionAddressV1[] }>)
  | (RequestBase & Readonly<{ type: "authority-switch-location-r4-v1"; identity: WorldAuthorityIdentityV1; address: WorldAddressV1 }>)
  | (RequestBase & Readonly<{ type: "authority-export-save-r4-v1"; identity: WorldAuthorityIdentityV1 }>)
  | (RequestBase & Readonly<{ type: "authority-dispose-r4-v1"; identity: WorldAuthorityIdentityV1 | null }>)
  | (RequestBase & Readonly<{ type: "authority-patch-auxiliary-r4-v1"; identity: WorldAuthorityIdentityV1; patches: readonly RustChunkAuxiliaryPatchR4V1[] }>);

export type RustImmediateEditEventR4V1 = Readonly<{
  sequence: number;
  address: WorldAddressV1;
  batchId: string;
  identity: WorldAuthorityIdentityV1;
  changes: readonly Readonly<{
    x: number;
    y: number;
    z: number;
    previousBlockId: number;
    blockId: number;
    previousFacing: number;
    facing: number;
    previousLiquid: RustLiquidMetadataR4V1;
    liquid: RustLiquidMetadataR4V1;
  }>[];
  dirtySectionKeys: readonly string[];
}>;

type ResponseBase = Readonly<{
  protocolVersion: typeof RUST_WORLD_AUTHORITY_BRIDGE_PROTOCOL_R4_V1;
  worldProtocolVersion: typeof WORLD_AUTHORITY_PROTOCOL_V1;
  schemaVersion: typeof WORLD_AUTHORITY_SCHEMA_V1;
  requestId: number;
}>;

export type RustWorldAuthorityResponseR4V1 =
  | (ResponseBase & Readonly<{ type: "authority-ready-r4-v1"; identity: WorldAuthorityIdentityV1; artifactHash?: string }>)
  | (ResponseBase & Readonly<{ type: "authority-sections-installed-r4-v1"; identity: WorldAuthorityIdentityV1; accepted: number; stale: number; auxiliaryAccepted?: number; markerRows?: number }>)
  | (ResponseBase & Readonly<{ type: "authority-save-imported-r4-v1"; identity: WorldAuthorityIdentityV1; edits: number }>)
  | (ResponseBase & Readonly<{ type: "authority-residency-accepted-r4-v1"; identity: WorldAuthorityIdentityV1; queued: number; cancelled: number }>)
  | (ResponseBase & Readonly<{ type: "authority-mutation-result-r4-v1"; identity: WorldAuthorityIdentityV1; status: "accepted" | "rejected"; mutated: boolean; rejectionCode?: string; message?: string; immediateEvent?: RustImmediateEditEventR4V1 }>)
  | (ResponseBase & Readonly<{ type: "authority-read-page-result-r4-v1"; identity: WorldAuthorityIdentityV1; page: WorldReadWindowV1 }>)
  | (ResponseBase & Readonly<{ type: "authority-sections-evicted-r4-v1"; identity: WorldAuthorityIdentityV1; evicted: number }>)
  | (ResponseBase & Readonly<{ type: "authority-location-switched-r4-v1"; identity: WorldAuthorityIdentityV1 }>)
  | (ResponseBase & Readonly<{ type: "authority-save-result-r4-v1"; identity: WorldAuthorityIdentityV1; compatibilityJson: Uint8Array; rustExtension: Uint8Array }>)
  | (ResponseBase & Readonly<{ type: "authority-disposed-r4-v1" }>)
  | (ResponseBase & Readonly<{ type: "authority-auxiliary-patched-r4-v1"; identity: WorldAuthorityIdentityV1; accepted: number; lightSections: number; lightCells: number }>)
  | (ResponseBase & Readonly<{ type: "authority-error-r4-v1"; code: string; message: string; identity?: WorldAuthorityIdentityV1 }>);

export interface RustWorldAuthorityTransportR4V1 {
  request(message: RustWorldAuthorityRequestR4V1, transfer?: readonly ArrayBuffer[]): Promise<RustWorldAuthorityResponseR4V1>;
  dispose?(): void | Promise<void>;
}

export function rustAuxiliaryPatchTransferListR4V1(patches: readonly RustChunkAuxiliaryPatchR4V1[]) {
  const transfer = patches.flatMap((patch) => [
    ...patch.lightSections.map((section) => section.light.buffer as ArrayBuffer),
    ...(patch.lightIndices ? [patch.lightIndices.buffer as ArrayBuffer] : []),
    ...(patch.leafIndices ? [patch.leafIndices.buffer as ArrayBuffer] : []),
  ]);
  const bytes = transfer.reduce((total, buffer) => total + buffer.byteLength, 0);
  if (bytes > RUST_WORLD_AUTHORITY_MAX_BYTES_R4_V1) throw new RangeError("auxiliary patch message exceeds authority byte bound");
  return transfer;
}

export function createRustWorldAuthorityRequestBaseR4V1(requestId: number): RequestBase {
  if (!Number.isSafeInteger(requestId) || requestId < 1) throw new RangeError("authority requestId must be a positive safe integer");
  return Object.freeze({
    protocolVersion: RUST_WORLD_AUTHORITY_BRIDGE_PROTOCOL_R4_V1,
    worldProtocolVersion: WORLD_AUTHORITY_PROTOCOL_V1,
    schemaVersion: WORLD_AUTHORITY_SCHEMA_V1,
    requestId,
  });
}

export function assertRustWorldAuthorityResponseR4V1(response: RustWorldAuthorityResponseR4V1, requestId: number) {
  if (!response || response.protocolVersion !== RUST_WORLD_AUTHORITY_BRIDGE_PROTOCOL_R4_V1
    || response.worldProtocolVersion !== WORLD_AUTHORITY_PROTOCOL_V1
    || response.schemaVersion !== WORLD_AUTHORITY_SCHEMA_V1
    || response.requestId !== requestId) {
    throw new Error("Rust world authority returned an incompatible or mismatched response");
  }
}

export function rustSectionInstallTransferListR4V1(
  sections: readonly RustSectionInstallR4V1[],
  auxiliary: readonly RustChunkAuxiliaryInstallR4V1[] = [],
) {
  if (sections.length > RUST_WORLD_AUTHORITY_MAX_SECTIONS_PER_MESSAGE_R4_V1) throw new RangeError("too many section installs in one authority message");
  const transfer = sections.flatMap((section) => [
    section.blocks.buffer as ArrayBuffer,
    section.facing.buffer as ArrayBuffer,
    section.liquidKind.buffer as ArrayBuffer,
    section.liquidLevel.buffer as ArrayBuffer,
    section.flags.buffer as ArrayBuffer,
  ]).concat(auxiliary.flatMap((chunk) => [
    chunk.heightmap.buffer as ArrayBuffer,
    chunk.biomes.buffer as ArrayBuffer,
    chunk.sectionBlockCounts.buffer as ArrayBuffer,
    chunk.skyTops.buffer as ArrayBuffer,
    chunk.light.buffer as ArrayBuffer,
    chunk.lightIndices.buffer as ArrayBuffer,
    chunk.leafIndices.buffer as ArrayBuffer,
  ]));
  const bytes = transfer.reduce((total, buffer) => total + buffer.byteLength, 0);
  if (bytes > RUST_WORLD_AUTHORITY_MAX_BYTES_R4_V1) throw new RangeError("section install message exceeds authority byte bound");
  return transfer;
}

export function rustWorldAuthorityResponseTransferListR4V1(response: RustWorldAuthorityResponseR4V1): readonly ArrayBuffer[] {
  if (response.type === "authority-read-page-result-r4-v1") return [
    response.page.streams.loadedMask.buffer as ArrayBuffer,
    response.page.streams.boundary.buffer as ArrayBuffer,
    response.page.streams.blocks.buffer as ArrayBuffer,
    response.page.streams.facing.buffer as ArrayBuffer,
    response.page.streams.liquidKind.buffer as ArrayBuffer,
    response.page.streams.liquidLevel.buffer as ArrayBuffer,
    response.page.streams.flags.buffer as ArrayBuffer,
  ];
  if (response.type === "authority-save-result-r4-v1") return [
    response.compatibilityJson.buffer as ArrayBuffer,
    response.rustExtension.buffer as ArrayBuffer,
  ];
  return [];
}
