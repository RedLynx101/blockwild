import { BLOCKS, BlockId, blockContainsWater, isWaterloggedFloraBlock } from "./data";
import { BLOCK_FACING_NORTH, isDirectionallyPlacedBlock, normalizeBlockFacing } from "./block-facing";
import {
  WORLD_AIR_BLOCK_ID_V1,
  WORLD_AUTHORITY_SCHEMA_V1,
  WORLD_BEDROCK_BLOCK_ID_V1,
  WORLD_CHUNK_SIZE_V1,
  WORLD_MAX_Y_V1,
  WORLD_MIN_Y_V1,
  WORLD_READ_WINDOW_MAX_CELLS_V1,
  WORLD_SECTION_HEIGHT_V1,
  WORLD_UNLOADED_BLOCK_ID_V1,
  WorldBoundaryKindV1,
  WorldCellFlagV1,
  WorldLiquidKindV1,
  assertWorldChunkAddressV1,
  createWorldAuthorityIdentityV1,
  createWorldCompatibilitySaveV1,
  createWorldDirtySetV1,
  createWorldNetworkDeltaV1,
  createWorldReadWindowV1,
  hashCanonicalWorldValueV1,
  normalizeWorldMutationBatchV1,
  sameWorldAddressV1,
  sameWorldRevisionV1,
  worldChunkAddressKeyV1,
  worldSectionAddressKeyV1,
  type WorldAddressV1,
  type WorldAuthorityIdentityV1,
  type WorldAuthorityRevisionV1,
  type WorldCommittedCellV1,
  type WorldCompatibilitySaveV1,
  type WorldDirtySetV1,
  type WorldLiquidMetadataV1,
  type WorldMutationBatchV1,
  type WorldMutationReceiptV1,
  type WorldResidencyEventV1,
  type WorldResidencyReceiptV1,
  type WorldSectionAddressV1,
  type WorldSectionRevisionV1,
} from "./world-authority-contract";

export type TypeScriptWorldOracleCellV1 = Readonly<{
  blockId: number;
  facing: number;
  liquid: WorldLiquidMetadataV1;
}>;

export type TypeScriptWorldOracleCommitV1 = Readonly<{
  x: number;
  y: number;
  z: number;
  blockId: number;
  facing: number;
}>;

/**
 * The injected reference implementation behind the coarse authority facade.
 * `commitAtomic` must either apply every supplied final cell or apply none.
 */
export interface TypeScriptWorldOracleV1 {
  readonly initialMutationRevision?: number;
  isChunkLoaded(chunkX: number, chunkZ: number): boolean;
  readCell(x: number, y: number, z: number): TypeScriptWorldOracleCellV1 | undefined;
  isDirectionalBlock(blockId: number): boolean;
  isWaterloggedBlock(blockId: number): boolean;
  commitAtomic(changes: readonly TypeScriptWorldOracleCommitV1[]): void;
  exportEdits?(): readonly Readonly<{ chunkX: number; chunkZ: number; entries: readonly (readonly [number, number])[] }>[];
  exportFacings?(): readonly Readonly<{ x: number; y: number; z: number; facing: number }>[];
}

export type TypeScriptWorldAuthorityEventV1 =
  | Readonly<{ kind: "world-edit-committed-v1"; receipt: Extract<WorldMutationReceiptV1, { status: "accepted" }> }>
  | Readonly<{ kind: "world-residency-changed-v1"; receipt: WorldResidencyReceiptV1 }>;

export type WorldReadBoundsV1 = Readonly<{
  origin: Readonly<{ x: number; y: number; z: number }>;
  size: Readonly<{ x: number; y: number; z: number }>;
}>;

type DesiredCell = {
  x: number;
  y: number;
  z: number;
  previousBlockId: number;
  previousFacing: number;
  blockId: number;
  facing: number;
};

const EMPTY_DIRTY: WorldDirtySetV1 = Object.freeze({ sections: Object.freeze([]), columns: Object.freeze([]), subsystemSeeds: Object.freeze([]) });

function liquidKindForDefinition(blockId: number): WorldLiquidKindV1 {
  const liquid = BLOCKS[blockId as BlockId]?.liquid;
  return liquid === "water" ? WorldLiquidKindV1.Water
    : liquid === "lava" ? WorldLiquidKindV1.Lava
      : liquid === "honey" ? WorldLiquidKindV1.Honey
        : liquid === "syrup" ? WorldLiquidKindV1.Syrup
          : WorldLiquidKindV1.None;
}

function staticLiquidMetadata(blockId: number): WorldLiquidMetadataV1 {
  const definition = BLOCKS[blockId as BlockId];
  const kind = liquidKindForDefinition(blockId);
  const waterlogged = Boolean(definition?.waterlogged);
  return Object.freeze({
    kind,
    level: kind === WorldLiquidKindV1.None ? 0 : 8,
    source: kind !== WorldLiquidKindV1.None,
    falling: false,
    containsWater: blockContainsWater(blockId as BlockId),
    waterlogged,
  });
}

function chunkCoordinate(value: number) {
  return Math.floor(value / WORLD_CHUNK_SIZE_V1);
}

function sectionCoordinate(y: number) {
  return Math.floor((y - WORLD_MIN_Y_V1) / WORLD_SECTION_HEIGHT_V1);
}

function cellKey(x: number, y: number, z: number) {
  return `${x},${y},${z}`;
}

/**
 * TypeScript remains authoritative. This facade freezes the semantics Rust
 * must match while keeping all world mutations behind one optimistic batch.
 */
export class TypeScriptWorldAuthorityV1 {
  private revision: WorldAuthorityRevisionV1;
  private identity: WorldAuthorityIdentityV1;
  private readonly sectionRevisions = new Map<string, WorldSectionRevisionV1>();
  private readonly residentChunks = new Map<string, number>();
  private lastResidencySequence = 0;
  private lastResidencyEventHash: string | null = null;

  constructor(
    readonly address: WorldAddressV1,
    private readonly oracle: TypeScriptWorldOracleV1,
    private readonly emit?: (event: TypeScriptWorldAuthorityEventV1) => void,
    epoch = 1,
  ) {
    this.revision = Object.freeze({ epoch, mutation: Math.max(0, Math.trunc(oracle.initialMutationRevision ?? 0)), residency: 0 });
    this.identity = createWorldAuthorityIdentityV1(address, this.revision);
  }

  currentIdentity() {
    return this.identity;
  }

  currentRevision() {
    return this.revision;
  }

  currentSectionRevision(address: WorldSectionAddressV1) {
    if (!sameWorldAddressV1(address, this.address)) return null;
    return this.sectionRevisions.get(worldSectionAddressKeyV1(address)) ?? this.defaultSectionRevision(address);
  }

  private defaultSectionRevision(address: WorldSectionAddressV1): WorldSectionRevisionV1 {
    const residentRevision = this.residentChunks.get(worldChunkAddressKeyV1(address)) ?? 0;
    return Object.freeze({ address: Object.freeze({ ...address }), blocks: residentRevision, metadata: residentRevision, halo: residentRevision });
  }

  readNearField(bounds: WorldReadBoundsV1) {
    for (const [label, value] of Object.entries(bounds.origin)) {
      if (!Number.isInteger(value) || value < -0x8000_0000 || value > 0x7fff_ffff) throw new RangeError(`read origin ${label} must be a signed 32-bit integer`);
    }
    for (const [label, value] of Object.entries(bounds.size)) {
      if (!Number.isInteger(value) || value < 1 || value > 256) throw new RangeError(`read size ${label} must be an integer in 1..256`);
    }
    const cellCount = bounds.size.x * bounds.size.y * bounds.size.z;
    if (cellCount > WORLD_READ_WINDOW_MAX_CELLS_V1) throw new RangeError(`read window exceeds ${WORLD_READ_WINDOW_MAX_CELLS_V1} cells`);
    const blocks = new Uint16Array(cellCount).fill(WORLD_UNLOADED_BLOCK_ID_V1);
    const loadedMask = new Uint8Array(cellCount);
    const boundary = new Uint8Array(cellCount);
    const facing = new Uint8Array(cellCount);
    const liquidKind = new Uint8Array(cellCount);
    const liquidLevel = new Uint8Array(cellCount);
    const flags = new Uint8Array(cellCount);
    const sectionRevisions = new Map<string, WorldSectionRevisionV1>();
    let index = 0;
    for (let localY = 0; localY < bounds.size.y; localY += 1) {
      const y = bounds.origin.y + localY;
      for (let localZ = 0; localZ < bounds.size.z; localZ += 1) {
        const z = bounds.origin.z + localZ;
        for (let localX = 0; localX < bounds.size.x; localX += 1, index += 1) {
          const x = bounds.origin.x + localX;
          if (y > WORLD_MAX_Y_V1) {
            loadedMask[index] = 1;
            boundary[index] = WorldBoundaryKindV1.AirAboveWorld;
            blocks[index] = WORLD_AIR_BLOCK_ID_V1;
            continue;
          }
          if (y < WORLD_MIN_Y_V1) {
            loadedMask[index] = 1;
            boundary[index] = WorldBoundaryKindV1.BedrockBelowWorld;
            blocks[index] = WORLD_BEDROCK_BLOCK_ID_V1;
            continue;
          }
          const chunkX = chunkCoordinate(x);
          const chunkZ = chunkCoordinate(z);
          if (!this.oracle.isChunkLoaded(chunkX, chunkZ)) continue;
          const cell = this.oracle.readCell(x, y, z);
          if (!cell) continue;
          loadedMask[index] = 1;
          blocks[index] = cell.blockId;
          facing[index] = cell.facing;
          liquidKind[index] = cell.liquid.kind;
          liquidLevel[index] = cell.liquid.level;
          flags[index] = (cell.liquid.containsWater ? WorldCellFlagV1.ContainsWater : 0)
            | (cell.liquid.source ? WorldCellFlagV1.LiquidSource : 0)
            | (cell.liquid.falling ? WorldCellFlagV1.LiquidFalling : 0)
            | (cell.liquid.waterlogged ? WorldCellFlagV1.Waterlogged : 0);
          const sectionAddress = Object.freeze({ ...this.address, chunkX, chunkZ, sectionY: sectionCoordinate(y) });
          sectionRevisions.set(worldSectionAddressKeyV1(sectionAddress), this.currentSectionRevision(sectionAddress)!);
        }
      }
    }
    return createWorldReadWindowV1({
      address: this.address,
      origin: bounds.origin,
      size: bounds.size,
      identity: this.identity,
      sectionRevisions: [...sectionRevisions.values()],
      streams: { loadedMask, boundary, blocks, facing, liquidKind, liquidLevel, flags },
    });
  }

  applyMutationBatch(batchInput: WorldMutationBatchV1): WorldMutationReceiptV1 {
    let batch: WorldMutationBatchV1;
    try { batch = normalizeWorldMutationBatchV1(batchInput); } catch (error) {
      return this.reject(batchInput.batchId ?? "invalid", "invalid-command", error instanceof Error ? error.message : String(error));
    }
    if (!sameWorldAddressV1(batch.address, this.address)) return this.reject(batch.batchId, "address-mismatch", "mutation batch belongs to another world location");
    if (!sameWorldRevisionV1(batch.expectedRevision, this.revision)) return this.reject(batch.batchId, "stale-revision", "mutation batch expected an obsolete world revision");

    const desired = new Map<string, DesiredCell>();
    for (const command of batch.commands) {
      if (command.y < WORLD_MIN_Y_V1 || command.y > WORLD_MAX_Y_V1) return this.reject(batch.batchId, "vertical-boundary", `cannot edit outside ${WORLD_MIN_Y_V1}..${WORLD_MAX_Y_V1}`);
      if (!this.oracle.isChunkLoaded(chunkCoordinate(command.x), chunkCoordinate(command.z))) return this.reject(batch.batchId, "unloaded-cell", `cannot edit unloaded cell ${command.x},${command.y},${command.z}`);
      const key = cellKey(command.x, command.y, command.z);
      let target = desired.get(key);
      if (!target) {
        const current = this.oracle.readCell(command.x, command.y, command.z);
        if (!current) return this.reject(batch.batchId, "unloaded-cell", `oracle did not provide loaded cell ${command.x},${command.y},${command.z}`);
        target = {
          x: command.x,
          y: command.y,
          z: command.z,
          previousBlockId: current.blockId,
          previousFacing: current.facing,
          blockId: current.blockId,
          facing: current.facing,
        };
        desired.set(key, target);
      }
      if (command.kind === "set-block") {
        target.blockId = command.blockId === WORLD_AIR_BLOCK_ID_V1 && this.oracle.isWaterloggedBlock(target.blockId)
          ? BlockId.Water
          : command.blockId;
        if (!this.oracle.isDirectionalBlock(target.blockId)) target.facing = BLOCK_FACING_NORTH;
        else if (command.facing !== undefined) target.facing = normalizeBlockFacing(command.facing);
      } else {
        if (!this.oracle.isDirectionalBlock(target.blockId)) return this.reject(batch.batchId, "facing-not-supported", `block ${target.blockId} at ${key} is not directional`);
        target.facing = normalizeBlockFacing(command.facing);
      }
    }

    const changed = [...desired.values()]
      .filter((cell) => cell.previousBlockId !== cell.blockId || cell.previousFacing !== cell.facing)
      .sort((left, right) => left.y - right.y || left.z - right.z || left.x - right.x);
    const before = this.identity;
    if (changed.length === 0) {
      return Object.freeze({ status: "accepted", batchId: batch.batchId, mutated: false, before, after: before, changes: Object.freeze([]), dirty: EMPTY_DIRTY, delta: null });
    }

    try {
      this.oracle.commitAtomic(changed.map((cell) => Object.freeze({ x: cell.x, y: cell.y, z: cell.z, blockId: cell.blockId, facing: cell.facing })));
    } catch (error) {
      return this.reject(batch.batchId, "oracle-rejected", error instanceof Error ? error.message : String(error));
    }
    const changes = Object.freeze(changed.map((cell) => Object.freeze({ ...cell }) satisfies WorldCommittedCellV1));
    this.revision = Object.freeze({ ...this.revision, mutation: this.revision.mutation + 1 });
    this.identity = createWorldAuthorityIdentityV1(this.address, this.revision);
    const mutationSeed = hashCanonicalWorldValueV1("blockwild-world-mutation-v1", { batchId: batch.batchId, authorityId: batch.authorityId, before: before.stateHash, changes });
    const dirty = createWorldDirtySetV1(this.address, changes, mutationSeed);
    this.bumpSectionRevisions(dirty, changes);
    const delta = createWorldNetworkDeltaV1({ address: this.address, batchId: batch.batchId, fromRevision: before.revision, toRevision: this.revision, changes });
    const receipt = Object.freeze({ status: "accepted", batchId: batch.batchId, mutated: true, before, after: this.identity, changes, dirty, delta }) satisfies Extract<WorldMutationReceiptV1, { status: "accepted" }>;
    this.emit?.(Object.freeze({ kind: "world-edit-committed-v1", receipt }));
    return receipt;
  }

  private bumpSectionRevisions(dirty: WorldDirtySetV1, changes: readonly WorldCommittedCellV1[]) {
    const directlyChanged = new Set(changes.map((change) => worldSectionAddressKeyV1({
      ...this.address,
      chunkX: chunkCoordinate(change.x),
      chunkZ: chunkCoordinate(change.z),
      sectionY: sectionCoordinate(change.y),
    })));
    const metadataChanged = new Set(changes.filter((change) => change.previousFacing !== change.facing).map((change) => worldSectionAddressKeyV1({
      ...this.address,
      chunkX: chunkCoordinate(change.x),
      chunkZ: chunkCoordinate(change.z),
      sectionY: sectionCoordinate(change.y),
    })));
    for (const address of dirty.sections) {
      const key = worldSectionAddressKeyV1(address);
      const current = this.sectionRevisions.get(key) ?? this.defaultSectionRevision(address);
      this.sectionRevisions.set(key, Object.freeze({
        address: Object.freeze({ ...address }),
        blocks: directlyChanged.has(key) ? this.revision.mutation : current.blocks,
        metadata: metadataChanged.has(key) ? this.revision.mutation : current.metadata,
        halo: this.revision.mutation,
      }));
    }
  }

  applyResidencyEvent(event: WorldResidencyEventV1): WorldResidencyReceiptV1 {
    try { assertWorldChunkAddressV1(event.address); } catch { return Object.freeze({ status: "stale", event, identity: this.identity }); }
    const validNumbers = Number.isSafeInteger(event.sequence) && event.sequence > 0
      && Number.isSafeInteger(event.expectedResidencyRevision) && event.expectedResidencyRevision >= 0
      && Number.isSafeInteger(event.chunkRevision) && event.chunkRevision >= 0;
    const validKind = event.kind === "resident" || event.kind === "evicted";
    const validReason = ["player-ring", "lookahead", "teleport", "cache", "retention", "world-reset"].includes(event.reason);
    if (event.schemaVersion !== WORLD_AUTHORITY_SCHEMA_V1 || !validNumbers || !validKind || !validReason || !sameWorldAddressV1(event.address, this.address)) {
      return Object.freeze({ status: "stale", event, identity: this.identity });
    }
    const eventHash = hashCanonicalWorldValueV1("blockwild-world-residency-event-v1", event);
    if (event.sequence === this.lastResidencySequence) return Object.freeze({ status: eventHash === this.lastResidencyEventHash ? "duplicate" : "stale", event, identity: this.identity });
    if (event.sequence !== this.lastResidencySequence + 1 || event.expectedResidencyRevision !== this.revision.residency) {
      return Object.freeze({ status: "stale", event, identity: this.identity });
    }
    const key = worldChunkAddressKeyV1(event.address);
    if (event.kind === "resident") this.residentChunks.set(key, Math.max(0, Math.trunc(event.chunkRevision)));
    else {
      this.residentChunks.delete(key);
      for (const sectionKey of [...this.sectionRevisions.keys()]) if (sectionKey.startsWith(`${key}:`)) this.sectionRevisions.delete(sectionKey);
    }
    this.lastResidencySequence = event.sequence;
    this.lastResidencyEventHash = eventHash;
    this.revision = Object.freeze({ ...this.revision, residency: this.revision.residency + 1 });
    this.identity = createWorldAuthorityIdentityV1(this.address, this.revision);
    const receipt = Object.freeze({ status: "accepted", event, identity: this.identity }) satisfies WorldResidencyReceiptV1;
    this.emit?.(Object.freeze({ kind: "world-residency-changed-v1", receipt }));
    return receipt;
  }

  exportCompatibilitySave(): WorldCompatibilitySaveV1 {
    return createWorldCompatibilitySaveV1({
      address: this.address,
      revision: this.revision,
      edits: this.oracle.exportEdits?.() ?? [],
      facings: this.oracle.exportFacings?.() ?? [],
    });
  }

  private reject(batchId: string, code: Extract<WorldMutationReceiptV1, { status: "rejected" }>["code"], message: string): WorldMutationReceiptV1 {
    return Object.freeze({ status: "rejected", batchId, code, message, identity: this.identity });
  }
}

/** Narrow public shape used to adapt the existing ChunkWorld without coupling the contract to Three.js. */
export interface ChunkWorldOracleSourceV1 {
  readonly mutationRevision: number;
  readonly chunks: ReadonlyMap<string, unknown>;
  getBlock(x: number, y: number, z: number): BlockId | undefined;
  blockFacingAt(x: number, y: number, z: number): number;
  /** Optional live fluid metadata hook; the current coarse fallback derives source-level metadata from block data. */
  worldAuthorityLiquidAt?(x: number, y: number, z: number, blockId: BlockId): WorldLiquidMetadataV1;
  setBlocksBatch(changes: Array<{ x: number; y: number; z: number; type: BlockId }>, record?: boolean, immediate?: boolean, deferLighting?: boolean): void;
  setBlockFacing(x: number, y: number, z: number, facing: 0 | 1 | 2 | 3, immediate?: boolean): boolean;
  serializeEdits(): Record<string, Array<[number, number]>>;
  serializeBlockFacings(): Record<string, number>;
}

/**
 * Read/write oracle for today's ChunkWorld. It is opt-in and dormant; creating
 * this wrapper does not change the ledger or route production mutations.
 */
export function createChunkWorldOracleV1(world: ChunkWorldOracleSourceV1): TypeScriptWorldOracleV1 {
  return {
    initialMutationRevision: world.mutationRevision,
    isChunkLoaded(chunkX, chunkZ) { return world.chunks.has(`${chunkX},${chunkZ}`); },
    readCell(x, y, z) {
      const blockId = world.getBlock(x, y, z);
      if (blockId === undefined) return undefined;
      return Object.freeze({
        blockId,
        facing: world.blockFacingAt(x, y, z),
        liquid: world.worldAuthorityLiquidAt?.(x, y, z, blockId) ?? staticLiquidMetadata(blockId),
      });
    },
    isDirectionalBlock(blockId) { return isDirectionallyPlacedBlock(blockId as BlockId); },
    isWaterloggedBlock(blockId) { return isWaterloggedFloraBlock(blockId as BlockId); },
    commitAtomic(changes) {
      // Every condition is preflighted by TypeScriptWorldAuthorityV1 before
      // entering ChunkWorld. The existing batch performs all voxel writes in a
      // single dirty/light pass; sparse facings are finalized immediately after.
      world.setBlocksBatch(changes.map((change) => ({ x: change.x, y: change.y, z: change.z, type: change.blockId as BlockId })), true, true);
      for (const change of changes) if (isDirectionallyPlacedBlock(change.blockId as BlockId)) {
        world.setBlockFacing(change.x, change.y, change.z, normalizeBlockFacing(change.facing), true);
      }
    },
    exportEdits() {
      return Object.entries(world.serializeEdits()).flatMap(([key, entries]) => {
        const [chunkX, chunkZ] = key.split(",").map(Number);
        return Number.isInteger(chunkX) && Number.isInteger(chunkZ) ? [{ chunkX, chunkZ, entries }] : [];
      });
    },
    exportFacings() {
      return Object.entries(world.serializeBlockFacings()).flatMap(([key, facing]) => {
        const [x, y, z] = key.split(",").map(Number);
        return [x, y, z].every(Number.isInteger) ? [{ x, y, z, facing: normalizeBlockFacing(facing) }] : [];
      });
    },
  };
}
