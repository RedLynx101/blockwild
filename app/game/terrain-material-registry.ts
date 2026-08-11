import { BLOCKS, BlockId, type BlockDefinition } from "./data";
import { isDirectionallyPlacedBlock } from "./block-facing";
import { emittedLightForDefinition } from "./lighting";

export type TerrainMaterialRegistryEntryV1 =
  | Readonly<{ kind: "air" }>
  | Readonly<{
    kind: "opaque-full-cube";
    sideTile: number;
    topTile: number;
    bottomTile: number;
    emittedLight: number;
    emissiveStrength: number;
    lightDampening: number;
    ambientOcclusion: boolean;
  }>
  | Readonly<{ kind: "specialty" }>;

export type TerrainMaterialRegistryV1 = Readonly<{
  contentHash: string;
  blocks: readonly (TerrainMaterialRegistryEntryV1 | null)[];
  biomeTints: readonly (readonly [number, number, number] | null)[];
}>;

/** Numeric order is BiomeId 0..23. This is the renderer's canonical V1 tint table. */
export const TERRAIN_BIOME_TINTS_V1 = Object.freeze([
  [0.72, 0.83, 0.98], [0.8, 0.9, 1], [1.04, 1.01, 0.86], [0.84, 0.98, 0.82],
  [0.74, 0.93, 0.69], [0.74, 0.92, 0.88], [1.1, 0.96, 0.72], [1.03, 0.96, 0.69],
  [0.64, 0.78, 0.63], [0.92, 1.01, 1.08], [1.08, 0.78, 0.65], [0.95, 1.08, 0.83],
  [1.08, 0.91, 1.02], [0.88, 0.93, 0.95], [0.76, 0.7, 0.72], [0.96, 0.78, 0.94],
  [0.82, 0.94, 0.94], [0.76, 1.02, 0.91], [0.62, 1.01, 0.73], [1.05, 0.9, 1.01],
  [0.62, 0.78, 1.08], [1.08, 0.88, 1.04], [0.64, 1.01, 0.9], [0.88, 0.96, 1.03],
] as const satisfies readonly (readonly [number, number, number])[]);

const FNV_64_OFFSET = BigInt("14695981039346656037");
const FNV_64_PRIME = BigInt("1099511628211");
const HIGH_LANE_SALT = BigInt("11562461410679940143");
const HIGH_LANE_PRIME = FNV_64_PRIME ^ BigInt("315");
const BYTE_MASK = BigInt(255);

class RegistryHasherV1 {
  private low = FNV_64_OFFSET;
  private high = FNV_64_OFFSET ^ HIGH_LANE_SALT;

  constructor() { this.string("blockwild-terrain-material-registry-v1"); }

  private byte(value: number) {
    const byte = BigInt(value & 0xff);
    this.low = BigInt.asUintN(64, (this.low ^ byte) * FNV_64_PRIME);
    this.high = BigInt.asUintN(64, (this.high ^ ((byte << BigInt(1)) | BigInt(1))) * HIGH_LANE_PRIME);
  }
  u8(value: number) { this.byte(value); }
  u16(value: number) { this.byte(value); this.byte(value >>> 8); }
  u32(value: number) {
    this.byte(value);
    this.byte(value >>> 8);
    this.byte(value >>> 16);
    this.byte(value >>> 24);
  }
  f64(value: number) {
    const buffer = new ArrayBuffer(8);
    new DataView(buffer).setFloat64(0, value, true);
    for (const byte of new Uint8Array(buffer)) this.byte(byte);
  }
  string(value: string) {
    const bytes = new TextEncoder().encode(value);
    this.u32(bytes.byteLength);
    for (const byte of bytes) this.byte(byte);
  }
  finish() {
    const bytes = new Uint8Array(16);
    for (const [offset, lane] of [[0, this.low], [8, this.high]] as const) {
      let remaining = lane;
      for (let index = 0; index < 8; index += 1) {
        bytes[offset + index] = Number(remaining & BYTE_MASK);
        remaining >>= BigInt(8);
      }
    }
    return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  }
}

function materialForDefinition(definition: BlockDefinition): TerrainMaterialRegistryEntryV1 {
  if (definition.id === BlockId.Air) return Object.freeze({ kind: "air" });
  const fullCube = !definition.shape || definition.shape === "cube";
  // Furnace has an authored facing plate despite retaining the historic
  // default cube shape in data.ts, so it cannot enter the generic cube lane.
  if (definition.layer !== "opaque" || !fullCube || definition.id === BlockId.Furnace) {
    return Object.freeze({ kind: "specialty" });
  }
  return Object.freeze({
    kind: "opaque-full-cube",
    sideTile: definition.side,
    topTile: definition.top,
    bottomTile: definition.bottom,
    emittedLight: emittedLightForDefinition(definition),
    emissiveStrength: definition.emissiveStrength ?? 0,
    lightDampening: definition.lightDampening ?? 15,
    ambientOcclusion: true,
  });
}

function hashRegistry(
  blocks: readonly (TerrainMaterialRegistryEntryV1 | null)[],
  biomeTints: readonly (readonly [number, number, number] | null)[],
) {
  const hasher = new RegistryHasherV1();
  hasher.u32(blocks.length);
  for (const material of blocks) {
    if (material === null) hasher.u8(0);
    else if (material.kind === "air") hasher.u8(1);
    else if (material.kind === "opaque-full-cube") {
      hasher.u8(2);
      hasher.u16(material.sideTile);
      hasher.u16(material.topTile);
      hasher.u16(material.bottomTile);
      hasher.u16(material.emittedLight);
      hasher.f64(material.emissiveStrength);
      hasher.u8(material.lightDampening);
      hasher.u8(material.ambientOcclusion ? 1 : 0);
    } else hasher.u8(3);
  }
  hasher.u32(biomeTints.length);
  for (const tint of biomeTints) {
    hasher.u8(tint ? 1 : 0);
    if (tint) for (const channel of tint) hasher.f64(channel);
  }
  return hasher.finish();
}

export function createCanonicalTerrainMaterialRegistryV1(): TerrainMaterialRegistryV1 {
  const ids = Object.keys(BLOCKS).map(Number).filter(Number.isSafeInteger);
  const maximumId = Math.max(BlockId.Air, ...ids);
  const blocks: (TerrainMaterialRegistryEntryV1 | null)[] = Array.from({ length: maximumId + 1 }, () => null);
  for (const id of ids.sort((left, right) => left - right)) {
    const definition = BLOCKS[id];
    if (definition) blocks[id] = materialForDefinition(definition);
  }
  const biomeTints = TERRAIN_BIOME_TINTS_V1.map((tint) => Object.freeze([...tint] as [number, number, number]));
  return Object.freeze({
    contentHash: hashRegistry(blocks, biomeTints),
    blocks: Object.freeze(blocks),
    biomeTints: Object.freeze(biomeTints),
  });
}

let cachedRegistry: TerrainMaterialRegistryV1 | null = null;

export function canonicalTerrainMaterialRegistryV1() {
  cachedRegistry ??= createCanonicalTerrainMaterialRegistryV1();
  return cachedRegistry;
}

export type TerrainMaterialEntryV2 = Readonly<{
  kind: "material";
  layer: 0 | 1 | 2 | 3 | 4 | 5 | 6;
  shape: number;
  sideTile: number;
  topTile: number;
  bottomTile: number;
  solid: boolean;
  waterlogged: boolean;
  connectsFence: boolean;
  ambientOcclusion: boolean;
  selectiveInteriorFaces: boolean;
  directionallyPlaced: boolean;
  joinsSameHorizontal: boolean;
  joinsSameVertical: boolean;
  liquidKind: 0 | 1 | 2 | 3 | 4;
  lightDampening: number;
  emittedLight: number;
  emissiveStrength: number;
  verticalConnectGroup: number;
  aquaticProfile: number;
  shapeVariant: number;
  geometryRevision: 1;
  tintPolicy: 0 | 1;
}>;

export type TerrainMaterialRegistryEntryV2 = Readonly<{ kind: "air" }> | TerrainMaterialEntryV2;

export type TerrainMaterialRegistryV2 = Readonly<{
  schemaVersion: 2;
  contentHash: string;
  blocks: readonly (TerrainMaterialRegistryEntryV2 | null)[];
  biomeTints: readonly (readonly [number, number, number] | null)[];
}>;

const SHAPE_CODES_V2 = Object.freeze({
  alchemy: 0, apiary: 1, aquarium: 2, aquatic: 3, "archive-shelf": 4, barrel: 5, bed: 6,
  bush: 7, cartography: 8, chair: 9, chest: 10, cross: 11, cube: 12, distillery: 13,
  door: 14, "dragon-egg": 15, exhibit: 16, fence: 17, fireplace: 18, fruit: 19,
  gate: 20, "gold-pile": 21, incubator: 22, "lightning-bug-jar": 23, mooncap: 24,
  "morph-loom": 25, "orb-healer": 26, "orb-rack": 27, shelf: 28, stool: 29,
  sugarworks: 30, table: 31, "tall-flower": 32, "tome-display": 33, torch: 34,
  wayshrine: 35, "wild-hive": 36,
} as const);

const VERTICAL_GROUPS_V2 = Object.freeze([
  undefined, "lumen-kelp", "star-coral", "abyss-bloom", "tidevine", "cultivated-flower",
  "wild-peppermint", "lumenreed", "double-tall-grass", "river-ribbon", "glow-kelp",
  "reed-bloom", "cave-root", "cave-reed", "luminous-algae", "egg-reed", "rope-ladder",
  "brinegrass", "sailkelp", "featherwrack", "pearlfan",
] as const);

const AQUATIC_PROFILES_V2 = Object.freeze([
  undefined, "kelp", "coral", "bloom", "vine", "reed", "ribbon", "reed-bloom", "algae",
  "grass", "sail", "wrack", "fan",
] as const);

const SELECTIVE_INTERIOR_BLOCKS_V2 = new Set<BlockId>([
  BlockId.WildwoodLeaves, BlockId.PineLeaves, BlockId.BirchLeaves, BlockId.BloomLeaves,
  BlockId.AppleLeaves, BlockId.JungleLeaves, BlockId.SakuraLeaves, BlockId.CandywoodLeaves,
  BlockId.MoonboughLeaves, BlockId.FrostpearLeaves,
]);

function shapeVariantV2(id: BlockId) {
  if (id === BlockId.Furnace) return 1;
  if (id >= BlockId.TorchWallNorth && id <= BlockId.TorchWallWest) return id - BlockId.TorchWallNorth + 2;
  if (id >= BlockId.FenceGateNorthSouthClosed && id <= BlockId.FenceGateEastWestOpen) {
    return id - BlockId.FenceGateNorthSouthClosed + 10;
  }
  if (id >= BlockId.DoorClosedLower && id <= BlockId.DoorXOpenUpper) return id - BlockId.DoorClosedLower + 20;
  if (id >= BlockId.WroughtIronDoorClosedLower && id <= BlockId.WroughtIronDoorXOpenUpper) {
    return id - BlockId.WroughtIronDoorClosedLower + 28;
  }
  if (id >= BlockId.BedNorthFoot && id <= BlockId.BedWestHead) return id - BlockId.BedNorthFoot + 40;
  if (id === BlockId.ArchiveShelf) return 50;
  if (id >= BlockId.ArchiveShelfOne && id <= BlockId.ArchiveShelfSix) {
    return id - BlockId.ArchiveShelfOne + 51;
  }
  return 0;
}

function layerCodeV2(definition: BlockDefinition): TerrainMaterialEntryV2["layer"] {
  if (definition.id === BlockId.Water) return 4;
  if (definition.id === BlockId.Glass) return 6;
  if (definition.layer === "opaque") return 0;
  if (definition.layer === "cutout") return 1;
  if (definition.layer === "emissive") return 2;
  if (definition.layer === "translucentSolid") return 3;
  if (definition.layer === "transparent") return 5;
  throw new TypeError(`Non-air block ${definition.id} has unsupported render layer ${definition.layer}`);
}

function liquidCodeV2(definition: BlockDefinition): TerrainMaterialEntryV2["liquidKind"] {
  return definition.liquid === "water" ? 1 : definition.liquid === "lava" ? 2
    : definition.liquid === "honey" ? 3 : definition.liquid === "syrup" ? 4 : 0;
}

function materialForDefinitionV2(definition: BlockDefinition): TerrainMaterialRegistryEntryV2 {
  if (definition.id === BlockId.Air) return Object.freeze({ kind: "air" });
  const shapeName = definition.shape ?? "cube";
  const shape = SHAPE_CODES_V2[shapeName];
  if (shape === undefined) throw new TypeError(`Block ${definition.id} has unknown BWR2 shape ${shapeName}`);
  const ambientOcclusion = definition.solid && shapeName === "cube"
    && definition.layer !== "transparent" && definition.layer !== "cutout";
  return Object.freeze({
    kind: "material",
    layer: layerCodeV2(definition),
    shape,
    sideTile: definition.side,
    topTile: definition.top,
    bottomTile: definition.bottom,
    solid: definition.solid,
    waterlogged: Boolean(definition.waterlogged),
    connectsFence: definition.connectGroup === "fence",
    ambientOcclusion,
    selectiveInteriorFaces: SELECTIVE_INTERIOR_BLOCKS_V2.has(definition.id),
    directionallyPlaced: isDirectionallyPlacedBlock(definition.id) || definition.id === BlockId.Furnace,
    joinsSameHorizontal: ["chest", "exhibit", "aquarium", "orb-rack"].includes(shapeName),
    joinsSameVertical: false,
    liquidKind: liquidCodeV2(definition),
    lightDampening: definition.lightDampening ?? 15,
    emittedLight: emittedLightForDefinition(definition),
    emissiveStrength: definition.emissiveStrength ?? 0,
    verticalConnectGroup: VERTICAL_GROUPS_V2.indexOf(definition.verticalConnectGroup),
    aquaticProfile: AQUATIC_PROFILES_V2.indexOf(definition.aquaticProfile),
    shapeVariant: shapeVariantV2(definition.id),
    geometryRevision: 1,
    tintPolicy: 1,
  });
}

function hashRegistryV2(
  blocks: readonly (TerrainMaterialRegistryEntryV2 | null)[],
  biomeTints: readonly (readonly [number, number, number] | null)[],
) {
  const hasher = new RegistryHasherV1();
  hasher.string("blockwild-terrain-material-registry-v2");
  hasher.u32(blocks.length);
  for (const material of blocks) {
    if (material === null) hasher.u8(0);
    else if (material.kind === "air") hasher.u8(1);
    else {
      hasher.u8(2);
      hasher.u8(material.layer);
      hasher.u8(material.shape);
      hasher.u16(material.sideTile);
      hasher.u16(material.topTile);
      hasher.u16(material.bottomTile);
      const flags = Number(material.solid)
        | (Number(material.waterlogged) << 1)
        | (Number(material.connectsFence) << 2)
        | (Number(material.ambientOcclusion) << 3)
        | (Number(material.selectiveInteriorFaces) << 4)
        | (Number(material.directionallyPlaced) << 5)
        | (Number(material.joinsSameHorizontal) << 6)
        | (Number(material.joinsSameVertical) << 7);
      hasher.u16(flags);
      hasher.u8(material.liquidKind);
      hasher.u8(material.lightDampening);
      hasher.u16(material.emittedLight);
      hasher.f64(material.emissiveStrength);
      hasher.u16(material.verticalConnectGroup);
      hasher.u8(material.aquaticProfile);
      hasher.u16(material.shapeVariant);
      hasher.u16(material.geometryRevision);
      hasher.u8(material.tintPolicy);
    }
  }
  hasher.u32(biomeTints.length);
  for (const tint of biomeTints) {
    hasher.u8(tint ? 1 : 0);
    if (tint) for (const channel of tint) hasher.f64(channel);
  }
  return hasher.finish();
}

export function createCanonicalTerrainMaterialRegistryV2(): TerrainMaterialRegistryV2 {
  const ids = Object.keys(BLOCKS).map(Number).filter(Number.isSafeInteger).sort((left, right) => left - right);
  const maximumId = Math.max(BlockId.Air, ...ids);
  const blocks: (TerrainMaterialRegistryEntryV2 | null)[] = Array.from({ length: maximumId + 1 }, () => null);
  for (const id of ids) {
    const definition = BLOCKS[id];
    if (definition) blocks[id] = materialForDefinitionV2(definition);
  }
  const biomeTints = TERRAIN_BIOME_TINTS_V1.map((tint) => Object.freeze([...tint] as [number, number, number]));
  return Object.freeze({
    schemaVersion: 2,
    contentHash: hashRegistryV2(blocks, biomeTints),
    blocks: Object.freeze(blocks),
    biomeTints: Object.freeze(biomeTints),
  });
}

let cachedRegistryV2: TerrainMaterialRegistryV2 | null = null;

export function canonicalTerrainMaterialRegistryV2() {
  cachedRegistryV2 ??= createCanonicalTerrainMaterialRegistryV2();
  return cachedRegistryV2;
}
