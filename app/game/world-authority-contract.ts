import { TypeScriptCanonicalHasher } from "./rust-kernel-shadow";

/**
 * Coarse, revisioned world-authority boundary for the R4 migration.
 *
 * This module is intentionally data-only. It does not grant Rust authority or
 * start a worker; both the TypeScript oracle and a future Rust implementation
 * must satisfy the same versioned records before either can be promoted.
 */
export const WORLD_AUTHORITY_PROTOCOL_V1 = 1;
export const WORLD_AUTHORITY_SCHEMA_V1 = 1;
export const WORLD_CHUNK_SIZE_V1 = 16;
export const WORLD_SECTION_HEIGHT_V1 = 16;
export const WORLD_MIN_Y_V1 = -64;
export const WORLD_MAX_Y_V1 = 127;
export const WORLD_SECTION_COUNT_V1 = (WORLD_MAX_Y_V1 - WORLD_MIN_Y_V1 + 1) / WORLD_SECTION_HEIGHT_V1;
export const WORLD_AIR_BLOCK_ID_V1 = 0;
export const WORLD_BEDROCK_BLOCK_ID_V1 = 14;
export const WORLD_UNLOADED_BLOCK_ID_V1 = 0xffff;
export const WORLD_READ_WINDOW_MAX_CELLS_V1 = 128 * 1024;
export const WORLD_MUTATION_BATCH_MAX_COMMANDS_V1 = 4_096;

const HASH_PATTERN = /^[0-9a-f]{32}$/u;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder("utf-8", { fatal: true });

function compareCanonicalText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

export type WorldAddressV1 = Readonly<{
  /** Decimal u64 string so JavaScript never truncates a future Rust universe id. */
  universeId: string;
  /** Authored location/planet/orbit identifier; never inferred from coordinates. */
  locationId: string;
}>;

export type WorldChunkAddressV1 = WorldAddressV1 & Readonly<{ chunkX: number; chunkZ: number }>;
export type WorldSectionAddressV1 = WorldChunkAddressV1 & Readonly<{ sectionY: number }>;
export type WorldCellAddressV1 = WorldAddressV1 & Readonly<{ x: number; y: number; z: number }>;

export type WorldAuthorityRevisionV1 = Readonly<{
  /** Invalidates all outstanding work after world replacement or worker recovery. */
  epoch: number;
  /** Increments once for each non-no-op atomic mutation batch. */
  mutation: number;
  /** Increments once for each accepted residency transition. */
  residency: number;
}>;

export type WorldAuthorityIdentityV1 = Readonly<{
  address: WorldAddressV1;
  revision: WorldAuthorityRevisionV1;
  stateHash: string;
}>;

export type WorldSectionRevisionV1 = Readonly<{
  address: WorldSectionAddressV1;
  blocks: number;
  metadata: number;
  halo: number;
}>;

export const enum WorldBoundaryKindV1 {
  None = 0,
  AirAboveWorld = 1,
  BedrockBelowWorld = 2,
}

export const enum WorldLiquidKindV1 {
  None = 0,
  Water = 1,
  Lava = 2,
  Honey = 3,
  Syrup = 4,
}

export const enum WorldCellFlagV1 {
  ContainsWater = 1 << 0,
  LiquidSource = 1 << 1,
  LiquidFalling = 1 << 2,
  Waterlogged = 1 << 3,
}

export type WorldReadStreamsV1 = Readonly<{
  /** 1 means the cell is authoritative/readable; 0 means in-range but unloaded. */
  loadedMask: Uint8Array;
  /** Distinguishes synthetic vertical bounds from ordinary loaded cells. */
  boundary: Uint8Array;
  /** Unloaded cells contain WORLD_UNLOADED_BLOCK_ID_V1 and must not be treated as Air. */
  blocks: Uint16Array;
  facing: Uint8Array;
  liquidKind: Uint8Array;
  liquidLevel: Uint8Array;
  flags: Uint8Array;
}>;

export type WorldReadWindowV1 = Readonly<{
  schemaVersion: typeof WORLD_AUTHORITY_SCHEMA_V1;
  address: WorldAddressV1;
  origin: Readonly<{ x: number; y: number; z: number }>;
  size: Readonly<{ x: number; y: number; z: number }>;
  identity: WorldAuthorityIdentityV1;
  sectionRevisions: readonly WorldSectionRevisionV1[];
  streams: WorldReadStreamsV1;
  snapshotHash: string;
}>;

export type WorldCellReadV1 =
  | Readonly<{ kind: "unloaded"; address: WorldCellAddressV1 }>
  | Readonly<{ kind: "air"; address: WorldCellAddressV1; blockId: typeof WORLD_AIR_BLOCK_ID_V1; provenance: "loaded" | "vertical-boundary"; facing: number; liquid: WorldLiquidMetadataV1 }>
  | Readonly<{ kind: "bedrock"; address: WorldCellAddressV1; blockId: typeof WORLD_BEDROCK_BLOCK_ID_V1; provenance: "loaded" | "vertical-boundary"; facing: number; liquid: WorldLiquidMetadataV1 }>
  | Readonly<{ kind: "block"; address: WorldCellAddressV1; blockId: number; provenance: "loaded"; facing: number; liquid: WorldLiquidMetadataV1 }>;

export type WorldLiquidMetadataV1 = Readonly<{
  kind: WorldLiquidKindV1;
  level: number;
  source: boolean;
  falling: boolean;
  containsWater: boolean;
  waterlogged: boolean;
}>;

export type WorldSetBlockCommandV1 = Readonly<{
  kind: "set-block";
  x: number;
  y: number;
  z: number;
  blockId: number;
  /** Optional authored facing; ignored/cleared when the final block is not directional. */
  facing?: number;
}>;

export type WorldSetFacingCommandV1 = Readonly<{
  kind: "set-facing";
  x: number;
  y: number;
  z: number;
  facing: number;
}>;

export type WorldMutationCommandV1 = WorldSetBlockCommandV1 | WorldSetFacingCommandV1;

export type WorldMutationBatchV1 = Readonly<{
  schemaVersion: typeof WORLD_AUTHORITY_SCHEMA_V1;
  batchId: string;
  authorityId: string;
  address: WorldAddressV1;
  expectedRevision: WorldAuthorityRevisionV1;
  commands: readonly WorldMutationCommandV1[];
}>;

export type WorldCommittedCellV1 = Readonly<{
  x: number;
  y: number;
  z: number;
  previousBlockId: number;
  blockId: number;
  previousFacing: number;
  facing: number;
}>;

export type WorldDirtySetV1 = Readonly<{
  sections: readonly WorldSectionAddressV1[];
  columns: readonly Readonly<{ x: number; z: number }>[];
  subsystemSeeds: readonly Readonly<{
    subsystem: "lighting" | "liquids" | "meshing" | "navigation" | "maps" | "persistence";
    seed: string;
  }>[];
}>;

export type WorldMutationRejectionCodeV1 =
  | "address-mismatch"
  | "stale-revision"
  | "invalid-command"
  | "unloaded-cell"
  | "vertical-boundary"
  | "facing-not-supported"
  | "oracle-rejected";

export type WorldMutationReceiptV1 =
  | Readonly<{
    status: "rejected";
    batchId: string;
    code: WorldMutationRejectionCodeV1;
    message: string;
    identity: WorldAuthorityIdentityV1;
  }>
  | Readonly<{
    status: "accepted";
    batchId: string;
    mutated: boolean;
    before: WorldAuthorityIdentityV1;
    after: WorldAuthorityIdentityV1;
    changes: readonly WorldCommittedCellV1[];
    dirty: WorldDirtySetV1;
    delta: WorldNetworkDeltaV1 | null;
  }>;

export type WorldResidencyEventV1 = Readonly<{
  schemaVersion: typeof WORLD_AUTHORITY_SCHEMA_V1;
  sequence: number;
  expectedResidencyRevision: number;
  kind: "resident" | "evicted";
  address: WorldChunkAddressV1;
  chunkRevision: number;
  reason: "player-ring" | "lookahead" | "teleport" | "cache" | "retention" | "world-reset";
}>;

export type WorldResidencyReceiptV1 = Readonly<{
  status: "accepted" | "stale" | "duplicate";
  event: WorldResidencyEventV1;
  identity: WorldAuthorityIdentityV1;
}>;

export type WorldJobIdentityV1 = Readonly<{
  address: WorldSectionAddressV1;
  authority: WorldAuthorityIdentityV1;
  section: WorldSectionRevisionV1;
  sourceHash: string;
}>;

export type WorldChunkCacheEnvelopeV1 = Readonly<{
  schemaVersion: typeof WORLD_AUTHORITY_SCHEMA_V1;
  key: string;
  address: WorldChunkAddressV1;
  generatorVersion: number;
  generatorHash: string;
  contentHash: string;
  optionsHash: string;
  editHaloHash: string;
  revision: number;
  checksum: string;
  payload: Uint8Array;
}>;

export type WorldCompatibilitySaveV1 = Readonly<{
  schemaVersion: typeof WORLD_AUTHORITY_SCHEMA_V1;
  address: WorldAddressV1;
  revision: WorldAuthorityRevisionV1;
  edits: readonly Readonly<{ chunkX: number; chunkZ: number; entries: readonly (readonly [number, number])[] }>[];
  facings: readonly Readonly<{ x: number; y: number; z: number; facing: number }>[];
  checksum: string;
}>;

export type WorldNetworkDeltaV1 = Readonly<{
  schemaVersion: typeof WORLD_AUTHORITY_SCHEMA_V1;
  address: WorldAddressV1;
  batchId: string;
  fromRevision: WorldAuthorityRevisionV1;
  toRevision: WorldAuthorityRevisionV1;
  changes: readonly WorldCommittedCellV1[];
  checksum: string;
}>;

export class WorldAuthorityContractError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "WorldAuthorityContractError";
  }
}

function requireInteger(value: number, minimum: number, maximum: number, label: string) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new WorldAuthorityContractError("invalid-integer", `${label} must be an integer in ${minimum}..${maximum}`);
  }
  return Object.is(value, -0) ? 0 : value;
}

function requireLabel(value: string, label: string, maximumLength = 128) {
  if (typeof value !== "string" || value.length < 1 || value.length > maximumLength || /[\u0000-\u001f\u007f]/u.test(value)) {
    throw new WorldAuthorityContractError("invalid-label", `${label} must be 1..${maximumLength} visible characters`);
  }
  return value;
}

function requireHash(value: string, label: string) {
  if (!HASH_PATTERN.test(value)) throw new WorldAuthorityContractError("invalid-hash", `${label} must be a lowercase 128-bit hexadecimal hash`);
  return value;
}

function canonicalValue(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new WorldAuthorityContractError("non-canonical-number", "canonical data cannot contain NaN or infinity");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => compareCanonicalText(left, right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalValue(entry)}`).join(",")}}`;
  }
  throw new WorldAuthorityContractError("non-canonical-value", `canonical data cannot contain ${typeof value}`);
}

export function canonicalWorldJsonV1(value: unknown) {
  return canonicalValue(value);
}

export function hashCanonicalWorldValueV1(domain: string, value: unknown) {
  return new TypeScriptCanonicalHasher(domain).writeString(canonicalValue(value)).finishHex();
}

export function assertWorldAddressV1(address: WorldAddressV1): void {
  requireLabel(address.universeId, "universeId", 64);
  requireLabel(address.locationId, "locationId", 128);
}

export function assertWorldChunkAddressV1(address: WorldChunkAddressV1): void {
  assertWorldAddressV1(address);
  requireInteger(address.chunkX, -0x8000_0000, 0x7fff_ffff, "chunkX");
  requireInteger(address.chunkZ, -0x8000_0000, 0x7fff_ffff, "chunkZ");
}

export function assertWorldSectionAddressV1(address: WorldSectionAddressV1): void {
  assertWorldChunkAddressV1(address);
  requireInteger(address.sectionY, -0x8000, 0x7fff, "sectionY");
}

export function assertWorldRevisionV1(revision: WorldAuthorityRevisionV1): void {
  requireInteger(revision.epoch, 0, Number.MAX_SAFE_INTEGER, "revision.epoch");
  requireInteger(revision.mutation, 0, Number.MAX_SAFE_INTEGER, "revision.mutation");
  requireInteger(revision.residency, 0, Number.MAX_SAFE_INTEGER, "revision.residency");
}

export function worldAddressKeyV1(address: WorldAddressV1) {
  assertWorldAddressV1(address);
  return `${encodeURIComponent(address.universeId)}@${encodeURIComponent(address.locationId)}`;
}

export function worldChunkAddressKeyV1(address: WorldChunkAddressV1) {
  assertWorldChunkAddressV1(address);
  return `${worldAddressKeyV1(address)}:${address.chunkX},${address.chunkZ}`;
}

export function worldSectionAddressKeyV1(address: WorldSectionAddressV1) {
  assertWorldSectionAddressV1(address);
  return `${worldChunkAddressKeyV1(address)}:${address.sectionY}`;
}

export function worldRevisionKeyV1(revision: WorldAuthorityRevisionV1) {
  assertWorldRevisionV1(revision);
  return `${revision.epoch}:${revision.mutation}:${revision.residency}`;
}

export function sameWorldAddressV1(left: WorldAddressV1, right: WorldAddressV1) {
  return left.universeId === right.universeId && left.locationId === right.locationId;
}

export function sameWorldRevisionV1(left: WorldAuthorityRevisionV1, right: WorldAuthorityRevisionV1) {
  return left.epoch === right.epoch && left.mutation === right.mutation && left.residency === right.residency;
}

export function createWorldAuthorityIdentityV1(address: WorldAddressV1, revision: WorldAuthorityRevisionV1) {
  assertWorldAddressV1(address);
  assertWorldRevisionV1(revision);
  const normalizedAddress = Object.freeze({ ...address });
  const normalizedRevision = Object.freeze({ ...revision });
  return Object.freeze({
    address: normalizedAddress,
    revision: normalizedRevision,
    stateHash: hashCanonicalWorldValueV1("blockwild-world-authority-identity-v1", { address: normalizedAddress, revision: normalizedRevision }),
  }) satisfies WorldAuthorityIdentityV1;
}

function writeReadStreams(hasher: TypeScriptCanonicalHasher, streams: WorldReadStreamsV1) {
  for (const stream of [streams.loadedMask, streams.boundary, streams.facing, streams.liquidKind, streams.liquidLevel, streams.flags]) {
    hasher.writeBytes(stream);
  }
  hasher.writeU32(streams.blocks.length);
  for (const block of streams.blocks) hasher.writeU16(block);
}

export function hashWorldReadWindowV1(window: Omit<WorldReadWindowV1, "snapshotHash">) {
  const hasher = new TypeScriptCanonicalHasher("blockwild-world-read-window-v1");
  hasher.writeU16(window.schemaVersion);
  hasher.writeString(worldAddressKeyV1(window.address));
  hasher.writeI32(window.origin.x).writeI32(window.origin.y).writeI32(window.origin.z);
  hasher.writeU32(window.size.x).writeU32(window.size.y).writeU32(window.size.z);
  hasher.writeString(window.identity.stateHash);
  hasher.writeU32(window.sectionRevisions.length);
  for (const section of window.sectionRevisions) {
    hasher.writeString(worldSectionAddressKeyV1(section.address));
    hasher.writeU32(section.blocks).writeU32(section.metadata).writeU32(section.halo);
  }
  writeReadStreams(hasher, window.streams);
  return hasher.finishHex();
}

export function createWorldReadWindowV1(input: Omit<WorldReadWindowV1, "schemaVersion" | "snapshotHash" | "streams"> & Readonly<{ streams: WorldReadStreamsV1 }>) {
  assertWorldAddressV1(input.address);
  assertWorldRevisionV1(input.identity.revision);
  if (!sameWorldAddressV1(input.address, input.identity.address)) throw new WorldAuthorityContractError("identity-address-mismatch", "read identity belongs to another world address");
  requireHash(input.identity.stateHash, "identity.stateHash");
  const origin = Object.freeze({
    x: requireInteger(input.origin.x, -0x8000_0000, 0x7fff_ffff, "origin.x"),
    y: requireInteger(input.origin.y, -0x8000_0000, 0x7fff_ffff, "origin.y"),
    z: requireInteger(input.origin.z, -0x8000_0000, 0x7fff_ffff, "origin.z"),
  });
  const size = Object.freeze({
    x: requireInteger(input.size.x, 1, 256, "size.x"),
    y: requireInteger(input.size.y, 1, 256, "size.y"),
    z: requireInteger(input.size.z, 1, 256, "size.z"),
  });
  const cellCount = size.x * size.y * size.z;
  if (cellCount > WORLD_READ_WINDOW_MAX_CELLS_V1) throw new WorldAuthorityContractError("window-too-large", `read window exceeds ${WORLD_READ_WINDOW_MAX_CELLS_V1} cells`);
  const streams: WorldReadStreamsV1 = Object.freeze({
    loadedMask: Uint8Array.from(input.streams.loadedMask),
    boundary: Uint8Array.from(input.streams.boundary),
    blocks: Uint16Array.from(input.streams.blocks),
    facing: Uint8Array.from(input.streams.facing),
    liquidKind: Uint8Array.from(input.streams.liquidKind),
    liquidLevel: Uint8Array.from(input.streams.liquidLevel),
    flags: Uint8Array.from(input.streams.flags),
  });
  for (const [name, stream] of Object.entries(streams)) {
    if (stream.length !== cellCount) throw new WorldAuthorityContractError("stream-length", `${name} must contain exactly ${cellCount} cells`);
  }
  for (let index = 0; index < cellCount; index += 1) {
    if (streams.loadedMask[index] > 1) throw new WorldAuthorityContractError("loaded-mask", "loadedMask values must be zero or one");
    if (streams.boundary[index] > WorldBoundaryKindV1.BedrockBelowWorld) throw new WorldAuthorityContractError("boundary", "boundary contains an unknown value");
    if (streams.facing[index] > 3) throw new WorldAuthorityContractError("facing", "facing values must be in 0..3");
    if (streams.liquidKind[index] > WorldLiquidKindV1.Syrup) throw new WorldAuthorityContractError("liquid-kind", "liquidKind contains an unknown value");
    if (streams.liquidLevel[index] > 8) throw new WorldAuthorityContractError("liquid-level", "liquidLevel values must be in 0..8");
    if ((streams.flags[index] & ~0x0f) !== 0) throw new WorldAuthorityContractError("cell-flags", "flags contains unknown required bits");
    if (streams.loadedMask[index] === 0) {
      if (streams.boundary[index] !== WorldBoundaryKindV1.None || streams.blocks[index] !== WORLD_UNLOADED_BLOCK_ID_V1) {
        throw new WorldAuthorityContractError("unloaded-cell", "unloaded cells must use the unloaded block sentinel and no boundary");
      }
    } else if (streams.blocks[index] === WORLD_UNLOADED_BLOCK_ID_V1) {
      throw new WorldAuthorityContractError("loaded-cell", "loaded cells cannot use the unloaded block sentinel");
    }
  }
  const sectionKeys = new Set<string>();
  const sectionRevisions = [...input.sectionRevisions].map((section) => {
    assertWorldSectionAddressV1(section.address);
    if (!sameWorldAddressV1(input.address, section.address)) throw new WorldAuthorityContractError("section-address", "section revision belongs to another world");
    const sectionKey = worldSectionAddressKeyV1(section.address);
    if (sectionKeys.has(sectionKey)) throw new WorldAuthorityContractError("duplicate-section", `duplicate section revision ${sectionKey}`);
    sectionKeys.add(sectionKey);
    return Object.freeze({
      address: Object.freeze({ ...section.address }),
      blocks: requireInteger(section.blocks, 0, Number.MAX_SAFE_INTEGER, "section.blocks"),
      metadata: requireInteger(section.metadata, 0, Number.MAX_SAFE_INTEGER, "section.metadata"),
      halo: requireInteger(section.halo, 0, Number.MAX_SAFE_INTEGER, "section.halo"),
    });
  }).sort((left, right) => compareCanonicalText(worldSectionAddressKeyV1(left.address), worldSectionAddressKeyV1(right.address)));
  const withoutHash = {
    schemaVersion: WORLD_AUTHORITY_SCHEMA_V1,
    address: Object.freeze({ ...input.address }),
    origin,
    size,
    identity: Object.freeze({ address: Object.freeze({ ...input.identity.address }), revision: Object.freeze({ ...input.identity.revision }), stateHash: input.identity.stateHash }),
    sectionRevisions: Object.freeze(sectionRevisions),
    streams,
  } as const;
  return Object.freeze({ ...withoutHash, snapshotHash: hashWorldReadWindowV1(withoutHash) }) satisfies WorldReadWindowV1;
}

export function worldReadWindowIndexV1(window: Pick<WorldReadWindowV1, "origin" | "size">, x: number, y: number, z: number) {
  const localX = x - window.origin.x;
  const localY = y - window.origin.y;
  const localZ = z - window.origin.z;
  if (!Number.isInteger(localX) || !Number.isInteger(localY) || !Number.isInteger(localZ)
    || localX < 0 || localX >= window.size.x || localY < 0 || localY >= window.size.y || localZ < 0 || localZ >= window.size.z) {
    throw new RangeError(`cell ${x},${y},${z} is outside the read window`);
  }
  return localX + localZ * window.size.x + localY * window.size.x * window.size.z;
}

export function readWorldWindowCellV1(window: WorldReadWindowV1, x: number, y: number, z: number): WorldCellReadV1 {
  const index = worldReadWindowIndexV1(window, x, y, z);
  const address = Object.freeze({ ...window.address, x, y, z });
  if (window.streams.loadedMask[index] === 0) return Object.freeze({ kind: "unloaded", address });
  const blockId = window.streams.blocks[index];
  const boundary = window.streams.boundary[index];
  const flags = window.streams.flags[index];
  const liquid = Object.freeze({
    kind: window.streams.liquidKind[index] as WorldLiquidKindV1,
    level: window.streams.liquidLevel[index],
    source: Boolean(flags & WorldCellFlagV1.LiquidSource),
    falling: Boolean(flags & WorldCellFlagV1.LiquidFalling),
    containsWater: Boolean(flags & WorldCellFlagV1.ContainsWater),
    waterlogged: Boolean(flags & WorldCellFlagV1.Waterlogged),
  });
  const facing = window.streams.facing[index];
  if (blockId === WORLD_AIR_BLOCK_ID_V1) return Object.freeze({ kind: "air", address, blockId, provenance: boundary === WorldBoundaryKindV1.AirAboveWorld ? "vertical-boundary" : "loaded", facing, liquid });
  if (blockId === WORLD_BEDROCK_BLOCK_ID_V1) return Object.freeze({ kind: "bedrock", address, blockId, provenance: boundary === WorldBoundaryKindV1.BedrockBelowWorld ? "vertical-boundary" : "loaded", facing, liquid });
  return Object.freeze({ kind: "block", address, blockId, provenance: "loaded", facing, liquid });
}

export function normalizeWorldMutationBatchV1(batch: WorldMutationBatchV1) {
  if (batch.schemaVersion !== WORLD_AUTHORITY_SCHEMA_V1) throw new WorldAuthorityContractError("schema-mismatch", "world mutation batch schema is incompatible");
  assertWorldAddressV1(batch.address);
  assertWorldRevisionV1(batch.expectedRevision);
  requireLabel(batch.batchId, "batchId", 160);
  requireLabel(batch.authorityId, "authorityId", 128);
  if (!Array.isArray(batch.commands) || batch.commands.length > WORLD_MUTATION_BATCH_MAX_COMMANDS_V1) {
    throw new WorldAuthorityContractError("batch-size", `world mutation batches contain at most ${WORLD_MUTATION_BATCH_MAX_COMMANDS_V1} commands`);
  }
  const seen = new Set<string>();
  const commands = batch.commands.map((command): WorldMutationCommandV1 => {
    const x = requireInteger(command.x, -0x8000_0000, 0x7fff_ffff, "command.x");
    const y = requireInteger(command.y, -0x8000_0000, 0x7fff_ffff, "command.y");
    const z = requireInteger(command.z, -0x8000_0000, 0x7fff_ffff, "command.z");
    const duplicateKey = `${x},${y},${z}:${command.kind}`;
    if (seen.has(duplicateKey)) throw new WorldAuthorityContractError("duplicate-command", `duplicate ${command.kind} command at ${x},${y},${z}`);
    seen.add(duplicateKey);
    if (command.kind === "set-block") {
      const blockId = requireInteger(command.blockId, 0, WORLD_UNLOADED_BLOCK_ID_V1 - 1, "command.blockId");
      const facing = command.facing === undefined ? undefined : requireInteger(command.facing, 0, 3, "command.facing");
      return Object.freeze({ kind: command.kind, x, y, z, blockId, ...(facing === undefined ? {} : { facing }) });
    }
    if (command.kind === "set-facing") return Object.freeze({ kind: command.kind, x, y, z, facing: requireInteger(command.facing, 0, 3, "command.facing") });
    throw new WorldAuthorityContractError("unknown-command", "world mutation batch contains an unknown command");
  });
  commands.sort((left, right) => left.y - right.y || left.z - right.z || left.x - right.x || (left.kind === "set-block" ? -1 : 1));
  return Object.freeze({
    schemaVersion: WORLD_AUTHORITY_SCHEMA_V1,
    batchId: batch.batchId,
    authorityId: batch.authorityId,
    address: Object.freeze({ ...batch.address }),
    expectedRevision: Object.freeze({ ...batch.expectedRevision }),
    commands: Object.freeze(commands),
  }) satisfies WorldMutationBatchV1;
}

export function createWorldDirtySetV1(address: WorldAddressV1, changes: readonly WorldCommittedCellV1[], mutationSeed: string): WorldDirtySetV1 {
  assertWorldAddressV1(address);
  requireHash(mutationSeed, "mutationSeed");
  const sections = new Map<string, WorldSectionAddressV1>();
  const columns = new Map<string, Readonly<{ x: number; z: number }>>();
  const addSection = (chunkX: number, chunkZ: number, sectionY: number) => {
    if (sectionY < 0 || sectionY >= WORLD_SECTION_COUNT_V1) return;
    const section = Object.freeze({ ...address, chunkX, chunkZ, sectionY });
    sections.set(worldSectionAddressKeyV1(section), section);
  };
  for (const change of changes) {
    const chunkX = Math.floor(change.x / WORLD_CHUNK_SIZE_V1);
    const chunkZ = Math.floor(change.z / WORLD_CHUNK_SIZE_V1);
    const localX = change.x - chunkX * WORLD_CHUNK_SIZE_V1;
    const localZ = change.z - chunkZ * WORLD_CHUNK_SIZE_V1;
    const sectionY = Math.floor((change.y - WORLD_MIN_Y_V1) / WORLD_SECTION_HEIGHT_V1);
    const localY = change.y - (WORLD_MIN_Y_V1 + sectionY * WORLD_SECTION_HEIGHT_V1);
    addSection(chunkX, chunkZ, sectionY);
    if (localY === 0) addSection(chunkX, chunkZ, sectionY - 1);
    if (localY === WORLD_SECTION_HEIGHT_V1 - 1) addSection(chunkX, chunkZ, sectionY + 1);
    if (localX === 0) addSection(chunkX - 1, chunkZ, sectionY);
    if (localX === WORLD_CHUNK_SIZE_V1 - 1) addSection(chunkX + 1, chunkZ, sectionY);
    if (localZ === 0) addSection(chunkX, chunkZ - 1, sectionY);
    if (localZ === WORLD_CHUNK_SIZE_V1 - 1) addSection(chunkX, chunkZ + 1, sectionY);
    columns.set(`${change.x},${change.z}`, Object.freeze({ x: change.x, z: change.z }));
  }
  const orderedSections = [...sections.values()].sort((left, right) => compareCanonicalText(worldSectionAddressKeyV1(left), worldSectionAddressKeyV1(right)));
  const orderedColumns = [...columns.values()].sort((left, right) => left.x - right.x || left.z - right.z);
  const subsystems = ["lighting", "liquids", "meshing", "navigation", "maps", "persistence"] as const;
  const subsystemSeeds = subsystems.map((subsystem) => Object.freeze({
    subsystem,
    seed: hashCanonicalWorldValueV1(`blockwild-world-dirty-${subsystem}-v1`, {
      mutationSeed,
      sections: orderedSections.map(worldSectionAddressKeyV1),
      columns: orderedColumns,
    }),
  }));
  return Object.freeze({ sections: Object.freeze(orderedSections), columns: Object.freeze(orderedColumns), subsystemSeeds: Object.freeze(subsystemSeeds) });
}

export function isWorldJobCurrentV1(job: WorldJobIdentityV1, current: WorldAuthorityIdentityV1, section: WorldSectionRevisionV1 | null) {
  if (!sameWorldAddressV1(job.authority.address, current.address) || !sameWorldAddressV1(job.address, current.address)) return false;
  if (!sameWorldRevisionV1(job.authority.revision, current.revision) || job.authority.stateHash !== current.stateHash) return false;
  if (!section || worldSectionAddressKeyV1(job.section.address) !== worldSectionAddressKeyV1(section.address)) return false;
  if (job.section.blocks !== section.blocks || job.section.metadata !== section.metadata || job.section.halo !== section.halo) return false;
  return HASH_PATTERN.test(job.sourceHash);
}

export function worldChunkCacheKeyV1(input: Omit<WorldChunkCacheEnvelopeV1, "schemaVersion" | "key" | "checksum" | "payload" | "revision">) {
  assertWorldChunkAddressV1(input.address);
  requireInteger(input.generatorVersion, 0, 0xffff_ffff, "generatorVersion");
  for (const [label, value] of Object.entries({ generatorHash: input.generatorHash, contentHash: input.contentHash, optionsHash: input.optionsHash, editHaloHash: input.editHaloHash })) requireHash(value, label);
  const digest = hashCanonicalWorldValueV1("blockwild-world-cache-key-v1", input);
  return `world-cache-v1|${worldChunkAddressKeyV1(input.address)}|g${input.generatorVersion}|${digest}`;
}

export function createWorldChunkCacheEnvelopeV1(input: Omit<WorldChunkCacheEnvelopeV1, "schemaVersion" | "key" | "checksum" | "payload"> & Readonly<{ payload: Uint8Array }>) {
  const keyInput = {
    address: input.address,
    generatorVersion: input.generatorVersion,
    generatorHash: input.generatorHash,
    contentHash: input.contentHash,
    optionsHash: input.optionsHash,
    editHaloHash: input.editHaloHash,
  };
  const key = worldChunkCacheKeyV1(keyInput);
  const payload = Uint8Array.from(input.payload);
  const revision = requireInteger(input.revision, 0, Number.MAX_SAFE_INTEGER, "cache.revision");
  const checksum = new TypeScriptCanonicalHasher("blockwild-world-cache-envelope-v1")
    .writeString(key)
    .writeU64(revision)
    .writeBytes(payload)
    .finishHex();
  return Object.freeze({ schemaVersion: WORLD_AUTHORITY_SCHEMA_V1, key, ...keyInput, address: Object.freeze({ ...input.address }), revision, checksum, payload }) satisfies WorldChunkCacheEnvelopeV1;
}

export function assertWorldChunkCacheEnvelopeV1(envelope: WorldChunkCacheEnvelopeV1) {
  if (envelope.schemaVersion !== WORLD_AUTHORITY_SCHEMA_V1) throw new WorldAuthorityContractError("schema-mismatch", "world cache envelope schema is incompatible");
  const rebuilt = createWorldChunkCacheEnvelopeV1(envelope);
  if (envelope.key !== rebuilt.key) throw new WorldAuthorityContractError("cache-key", "world cache key does not match its address/version inputs");
  if (envelope.checksum !== rebuilt.checksum) throw new WorldAuthorityContractError("cache-checksum", "world cache payload checksum mismatch");
}

function saveWithoutChecksum(save: Omit<WorldCompatibilitySaveV1, "checksum">) {
  const edits = [...save.edits].map((chunk) => ({
    chunkX: requireInteger(chunk.chunkX, -0x8000_0000, 0x7fff_ffff, "save.chunkX"),
    chunkZ: requireInteger(chunk.chunkZ, -0x8000_0000, 0x7fff_ffff, "save.chunkZ"),
    entries: [...chunk.entries].map(([index, blockId]) => [
      requireInteger(index, 0, WORLD_CHUNK_SIZE_V1 * WORLD_CHUNK_SIZE_V1 * (WORLD_MAX_Y_V1 - WORLD_MIN_Y_V1 + 1) - 1, "save.edit.index"),
      requireInteger(blockId, 0, WORLD_UNLOADED_BLOCK_ID_V1 - 1, "save.edit.blockId"),
    ] as const).sort((left, right) => left[0] - right[0]),
  })).sort((left, right) => left.chunkX - right.chunkX || left.chunkZ - right.chunkZ);
  const facings = [...save.facings].map((facing) => ({
    x: requireInteger(facing.x, -0x8000_0000, 0x7fff_ffff, "save.facing.x"),
    y: requireInteger(facing.y, WORLD_MIN_Y_V1, WORLD_MAX_Y_V1, "save.facing.y"),
    z: requireInteger(facing.z, -0x8000_0000, 0x7fff_ffff, "save.facing.z"),
    facing: requireInteger(facing.facing, 0, 3, "save.facing"),
  })).sort((left, right) => left.y - right.y || left.z - right.z || left.x - right.x);
  return { schemaVersion: WORLD_AUTHORITY_SCHEMA_V1, address: { ...save.address }, revision: { ...save.revision }, edits, facings } as const;
}

export function createWorldCompatibilitySaveV1(input: Omit<WorldCompatibilitySaveV1, "schemaVersion" | "checksum">) {
  assertWorldAddressV1(input.address);
  assertWorldRevisionV1(input.revision);
  const normalized = saveWithoutChecksum({ schemaVersion: WORLD_AUTHORITY_SCHEMA_V1, ...input });
  const checksum = hashCanonicalWorldValueV1("blockwild-world-compatibility-save-v1", normalized);
  return Object.freeze({ ...normalized, checksum }) satisfies WorldCompatibilitySaveV1;
}

function networkDeltaWithoutChecksum(delta: Omit<WorldNetworkDeltaV1, "checksum">) {
  assertWorldAddressV1(delta.address);
  assertWorldRevisionV1(delta.fromRevision);
  assertWorldRevisionV1(delta.toRevision);
  requireLabel(delta.batchId, "delta.batchId", 160);
  const changes = [...delta.changes].map((change) => ({
    x: requireInteger(change.x, -0x8000_0000, 0x7fff_ffff, "delta.x"),
    y: requireInteger(change.y, WORLD_MIN_Y_V1, WORLD_MAX_Y_V1, "delta.y"),
    z: requireInteger(change.z, -0x8000_0000, 0x7fff_ffff, "delta.z"),
    previousBlockId: requireInteger(change.previousBlockId, 0, WORLD_UNLOADED_BLOCK_ID_V1 - 1, "delta.previousBlockId"),
    blockId: requireInteger(change.blockId, 0, WORLD_UNLOADED_BLOCK_ID_V1 - 1, "delta.blockId"),
    previousFacing: requireInteger(change.previousFacing, 0, 3, "delta.previousFacing"),
    facing: requireInteger(change.facing, 0, 3, "delta.facing"),
  })).sort((left, right) => left.y - right.y || left.z - right.z || left.x - right.x);
  return { schemaVersion: WORLD_AUTHORITY_SCHEMA_V1, address: { ...delta.address }, batchId: delta.batchId, fromRevision: { ...delta.fromRevision }, toRevision: { ...delta.toRevision }, changes } as const;
}

export function createWorldNetworkDeltaV1(input: Omit<WorldNetworkDeltaV1, "schemaVersion" | "checksum">) {
  const normalized = networkDeltaWithoutChecksum({ schemaVersion: WORLD_AUTHORITY_SCHEMA_V1, ...input });
  const checksum = hashCanonicalWorldValueV1("blockwild-world-network-delta-v1", normalized);
  return Object.freeze({ ...normalized, checksum }) satisfies WorldNetworkDeltaV1;
}

export function encodeWorldCompatibilitySaveV1(save: WorldCompatibilitySaveV1) {
  const rebuilt = createWorldCompatibilitySaveV1(save);
  if (rebuilt.checksum !== save.checksum) throw new WorldAuthorityContractError("save-checksum", "world compatibility save checksum mismatch");
  return textEncoder.encode(canonicalValue(rebuilt));
}

export function decodeWorldCompatibilitySaveV1(bytes: Uint8Array) {
  let decoded: unknown;
  try { decoded = JSON.parse(textDecoder.decode(bytes)); } catch (error) {
    throw new WorldAuthorityContractError("save-decode", error instanceof Error ? error.message : String(error));
  }
  const candidate = decoded as WorldCompatibilitySaveV1;
  if (candidate?.schemaVersion !== WORLD_AUTHORITY_SCHEMA_V1 || !Array.isArray(candidate.edits) || !Array.isArray(candidate.facings)) {
    throw new WorldAuthorityContractError("save-schema", "world compatibility save has an invalid shape");
  }
  const rebuilt = createWorldCompatibilitySaveV1(candidate);
  if (rebuilt.checksum !== candidate.checksum) throw new WorldAuthorityContractError("save-checksum", "world compatibility save checksum mismatch");
  return rebuilt;
}

export function encodeWorldNetworkDeltaV1(delta: WorldNetworkDeltaV1) {
  const rebuilt = createWorldNetworkDeltaV1(delta);
  if (rebuilt.checksum !== delta.checksum) throw new WorldAuthorityContractError("delta-checksum", "world network delta checksum mismatch");
  return textEncoder.encode(canonicalValue(rebuilt));
}

export function decodeWorldNetworkDeltaV1(bytes: Uint8Array) {
  let decoded: unknown;
  try { decoded = JSON.parse(textDecoder.decode(bytes)); } catch (error) {
    throw new WorldAuthorityContractError("delta-decode", error instanceof Error ? error.message : String(error));
  }
  const candidate = decoded as WorldNetworkDeltaV1;
  if (candidate?.schemaVersion !== WORLD_AUTHORITY_SCHEMA_V1 || !Array.isArray(candidate.changes)) {
    throw new WorldAuthorityContractError("delta-schema", "world network delta has an invalid shape");
  }
  const rebuilt = createWorldNetworkDeltaV1(candidate);
  if (rebuilt.checksum !== candidate.checksum) throw new WorldAuthorityContractError("delta-checksum", "world network delta checksum mismatch");
  return rebuilt;
}
