import * as THREE from "three";
import { BLOCKS, LEAF_BLOCKS, TORCH_BLOCKS, BlockId, blockContainsWater, isWaterloggedFloraBlock, type RenderLayer } from "./data";
import { caveEntranceAt, caveFeatureAt } from "./caves";
import { DENSE_CUTOUT_LEAF_POLICY, planFullTree, planSubmergedFlora, type TreeForm, type TreePlanBlock } from "./ecology";
import {
  planBiomeVegetation,
  planStructure,
  structureBiomeFromId,
  structureCandidateForChunk,
  structureClearanceBounds,
  structureMarkersForChunk,
  structurePlacementsForChunk,
  type PlannedBlock,
  type StructureKind,
  type StructureMarker,
} from "./structures";
import {
  SETTLEMENT_SIZE_RULES,
  createSettlementState,
  planSettlementCandidate,
  planSettlementLayout,
  type SettlementBiome,
  type SettlementCandidate,
  type SettlementLayoutPlan,
  type SettlementResident,
} from "./settlements";

export const CHUNK_SIZE = 16;
export const MIN_Y = -64;
export const MAX_Y = 127;
export const WORLD_HEIGHT = MAX_Y - MIN_Y + 1;
export const SEA_LEVEL = 32;
export const SECTION_HEIGHT = 16;
export const SECTION_COUNT = WORLD_HEIGHT / SECTION_HEIGHT;
export const GENERATOR_VERSION = 8;

export type SettlementWorldPlan = Readonly<{
  candidate: SettlementCandidate;
  layout: SettlementLayoutPlan;
}>;

export type WorldGenerationOptions = {
  caveFrequency: number;
  biomeScale: number;
  resourceAbundance: number;
  structures: boolean;
};

export const DEFAULT_WORLD_GENERATION_OPTIONS: Readonly<WorldGenerationOptions> = Object.freeze({
  caveFrequency: 1,
  biomeScale: 1,
  resourceAbundance: 1,
  structures: true,
});

export enum BiomeId {
  DeepOcean = 0,
  Ocean = 1,
  Beach = 2,
  Meadow = 3,
  Wildwood = 4,
  Frostpine = 5,
  Desert = 6,
  Savanna = 7,
  Siltfen = 8,
  Snowfield = 9,
  Badlands = 10,
  Birchlight = 11,
  Bloomwood = 12,
  Highlands = 13,
  Volcanic = 14,
  MushroomFen = 15,
  River = 16,
  CloudreedGlen = 17,
  RainveilJungle = 18,
  SakurabloomGrove = 19,
  LumenTrench = 20,
}

export const BIOME_NAMES: Record<number, string> = {
  [BiomeId.DeepOcean]: "Abyssal Ocean",
  [BiomeId.Ocean]: "Brightwater Ocean",
  [BiomeId.Beach]: "Sunwash Coast",
  [BiomeId.Meadow]: "Flower Meadow",
  [BiomeId.Wildwood]: "Wildwood Forest",
  [BiomeId.Frostpine]: "Frostpine Taiga",
  [BiomeId.Desert]: "Sunglass Desert",
  [BiomeId.Savanna]: "Sunstep Savanna",
  [BiomeId.Siltfen]: "Siltfen Swamp",
  [BiomeId.Snowfield]: "Whispering Snowfield",
  [BiomeId.Badlands]: "Painted Badlands",
  [BiomeId.Birchlight]: "Birchlight Grove",
  [BiomeId.Bloomwood]: "Bloomwood Vale",
  [BiomeId.Highlands]: "Cloudbreak Highlands",
  [BiomeId.Volcanic]: "Ember Wastes",
  [BiomeId.MushroomFen]: "Mooncap Fen",
  [BiomeId.River]: "Wandering River",
  [BiomeId.CloudreedGlen]: "Cloudreed Glen",
  [BiomeId.RainveilJungle]: "Rainveil Jungle",
  [BiomeId.SakurabloomGrove]: "Sakurabloom Grove",
  [BiomeId.LumenTrench]: "Lumen Trench",
};

/** Small deterministic amenity pass layered onto the older landmark shells. */
export function planPoiAmenities(kind: StructureKind, origin: Readonly<{ x: number; y: number; z: number }>): readonly PlannedBlock[] {
  const at = (dx: number, dy: number, dz: number, block: BlockId, variant = "poi-amenity"): PlannedBlock => ({
    x: origin.x + dx,
    y: origin.y + dy,
    z: origin.z + dz,
    block,
    variant,
  });
  if (kind === "desert-temple") return [
    at(0, 1, 6, BlockId.DoorClosedLower, "temple-door"), at(0, 2, 6, BlockId.DoorClosedUpper, "temple-door"),
    at(-2, 2, -2, BlockId.TorchWallSouth, "temple-sconce"), at(2, 2, -2, BlockId.TorchWallSouth, "temple-sconce"),
    at(-2, 1, 1, BlockId.WildwoodTable), at(-3, 1, 1, BlockId.WildwoodStool), at(3, 1, -1, BlockId.SealedBarrel),
  ];
  if (kind === "forest-temple") return [
    at(-3, 2, -4, BlockId.TorchWallSouth, "temple-sconce"), at(3, 2, -4, BlockId.TorchWallSouth, "temple-sconce"),
    at(-2, 1, 2, BlockId.WildwoodTable), at(-3, 1, 2, BlockId.WildwoodStool), at(2, 1, 3, BlockId.WildwoodShelf),
  ];
  if (kind === "sunbun-grove") return [
    at(-2, 1, -3, BlockId.WildwoodTable), at(-3, 1, -3, BlockId.WildwoodStool), at(-1, 1, -3, BlockId.WildwoodStool),
    at(4, 1, 3, BlockId.SealedBarrel), at(-4, 2, 0, BlockId.TorchWallEast), at(4, 2, 0, BlockId.TorchWallWest),
  ];
  if (kind === "meadow-butterfly-sanctuary") return [
    at(-3, 1, 0, BlockId.WildwoodStool), at(3, 1, 0, BlockId.WildwoodStool), at(0, 1, -3, BlockId.WildwoodTable),
  ];
  if (kind === "abandoned-apiary") return [
    at(0, 2, 2, BlockId.WildwoodTable), at(-1, 2, 2, BlockId.WildwoodStool), at(3, 2, -2, BlockId.SealedBarrel),
    at(-3, 2, -2, BlockId.WildwoodShelf), at(0, 2, -2, BlockId.Torch),
  ];
  return [
    at(-3, 1, 0, BlockId.WildwoodStool), at(3, 1, 0, BlockId.WildwoodStool),
    at(0, 1, -3, BlockId.WildwoodTable), at(0, 2, 4, BlockId.TorchWallNorth),
  ];
}

function settlementBiomeFromId(biome: BiomeId): SettlementBiome | null {
  if (biome === BiomeId.Meadow) return "flower-meadow";
  if (biome === BiomeId.Wildwood) return "wildwood";
  if (biome === BiomeId.Birchlight || biome === BiomeId.Bloomwood) return "forest";
  if (biome === BiomeId.Highlands) return "highlands";
  if (biome === BiomeId.Badlands) return "badlands";
  if (biome === BiomeId.CloudreedGlen) return "cloudreed-glen";
  if (biome === BiomeId.RainveilJungle || biome === BiomeId.SakurabloomGrove) return "forest";
  if (biome === BiomeId.DeepOcean) return "deep-ocean";
  if (biome === BiomeId.LumenTrench) return "lumen-trench";
  return null;
}

function settlementResidentMobKind(resident: SettlementResident, faction: "hobbits" | "goblins" | "atlantians") {
  if (faction === "atlantians") {
    if (resident.profession === "atlantian-tidewarden") return "atlantian-tidewarden";
    if (resident.profession === "atlantian-trident-guard") return "atlantian-trident-guard";
    if (resident.profession === "atlantian-kelpkeeper") return "atlantian-kelpkeeper";
    if (resident.profession === "atlantian-coralwright") return "atlantian-coralwright";
    if (resident.profession === "atlantian-pearlbroker") return "atlantian-pearlbroker";
    return "atlantian-glowmender";
  }
  if (faction === "hobbits") {
    if (resident.profession === "mayor") return "hobbit-mayor";
    if (resident.profession === "warrior") return resident.equipment.weapon === "crossbow" ? "hobbit-crossbow-guard" : "hobbit-hammer-guard";
    if (resident.profession === "farmer") return "hobbit-farmer";
    if (resident.profession === "miner" || resident.profession === "blacksmith") return "hobbit-miner";
    if (resident.profession === "banker") return "hobbit-banker";
    return "hobbit-merchant";
  }
  if (resident.profession === "mayor") return "goblin-chieftain";
  if (resident.profession === "warrior") return "goblin-spear-guard";
  if (resident.profession === "miner" || resident.profession === "blacksmith") return "goblin-miner";
  if (resident.profession === "alchemist") return "goblin-alchemist";
  return "goblin-worker";
}

type WorldRenderLayer = Exclude<RenderLayer, "none"> | "glass";
type ChunkMeshes = {
  opaque?: THREE.Mesh;
  cutout?: THREE.Mesh;
  transparent?: THREE.Mesh;
  glass?: THREE.Mesh;
  emissive?: THREE.Mesh;
};

export type Chunk = {
  key: string;
  cx: number;
  cz: number;
  blocks: Uint8Array;
  heightmap: Int16Array;
  biomes: Uint8Array;
  group: THREE.Group;
  sections: Map<number, ChunkMeshes>;
  dirty: Set<number>;
  sectionBlockCounts: Uint16Array;
  /** Highest full opaque cube in each column, maintained independently from terrain height. */
  skyTops: Int16Array;
  lightIndices: Set<number>;
  /** Sparse foliage index used by the constant-cost ambient leaf emitter. */
  leafIndices: Set<number>;
};

const LEAF_BLOCK_SET = new Set<BlockId>(LEAF_BLOCKS);
const GENERATED_GROWTH_BLOCK_SET = new Set<BlockId>([
  BlockId.WildwoodLog,
  BlockId.PineLog,
  BlockId.BirchLog,
  BlockId.BloomLog,
  ...LEAF_BLOCKS,
  BlockId.Cactus,
  BlockId.MushroomCap,
  BlockId.TallGrass,
  BlockId.RedFlower,
  BlockId.BlueFlower,
  BlockId.WheatCrop,
  BlockId.WildwoodSapling,
  BlockId.Sunpetal,
  BlockId.MoonOrchid,
  BlockId.Cloudbell,
  BlockId.ReedBloom,
  BlockId.RiverRibbon,
  BlockId.DesertShrub,
  BlockId.BananaPlant,
  BlockId.JungleLog,
  BlockId.JungleLeaves,
  BlockId.SakuraLog,
  BlockId.SakuraLeaves,
  BlockId.Saltbrush,
  BlockId.CoastAster,
  BlockId.SakuraBloom,
  BlockId.Dreamblossom,
  BlockId.RainveilFern,
  BlockId.LanternLotus,
  BlockId.JungleSapling,
  BlockId.SakuraSapling,
  BlockId.MoonriceSprout,
  BlockId.MoonriceYoung,
  BlockId.MoonriceCrop,
  BlockId.SunrootSprout,
  BlockId.SunrootYoung,
  BlockId.SunrootCrop,
  BlockId.LumenKelp,
  BlockId.StarCoral,
  BlockId.AbyssBloom,
  BlockId.Tidevine,
]);

type ColumnSample = {
  height: number;
  waterline: number;
  biome: BiomeId;
  temperature: number;
  moisture: number;
  continental: number;
  river: number;
  mountain: number;
};

type Face = {
  direction: [number, number, number];
  shade: number;
  corners: [number, number, number][];
};

type GeometryBucket = {
  positions: number[];
  normals: number[];
  colors: number[];
  uvs: number[];
  indices: number[];
};

export type ChunkEditSave = Record<string, Array<[number, number]>>;

const FACES: Face[] = [
  { direction: [1, 0, 0], shade: 0.82, corners: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]] },
  { direction: [-1, 0, 0], shade: 0.7, corners: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]] },
  { direction: [0, 1, 0], shade: 1, corners: [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]] },
  { direction: [0, -1, 0], shade: 0.54, corners: [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5]] },
  { direction: [0, 0, 1], shade: 0.88, corners: [[0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, -0.5, 0.5]] },
  { direction: [0, 0, -1], shade: 0.76, corners: [[-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, -0.5, -0.5]] },
];

const BIOME_TINT: Record<number, [number, number, number]> = {
  [BiomeId.DeepOcean]: [0.72, 0.83, 0.98],
  [BiomeId.Ocean]: [0.8, 0.9, 1],
  [BiomeId.Beach]: [1.04, 1.01, 0.86],
  [BiomeId.Meadow]: [0.9, 1, 0.86],
  [BiomeId.Wildwood]: [0.82, 1, 0.78],
  [BiomeId.Frostpine]: [0.74, 0.92, 0.88],
  [BiomeId.Desert]: [1.1, 0.96, 0.72],
  [BiomeId.Savanna]: [1.04, 1, 0.73],
  [BiomeId.Siltfen]: [0.7, 0.82, 0.67],
  [BiomeId.Snowfield]: [0.94, 1.02, 1.05],
  [BiomeId.Badlands]: [1.08, 0.78, 0.65],
  [BiomeId.Birchlight]: [0.95, 1.08, 0.83],
  [BiomeId.Bloomwood]: [1.08, 0.91, 1.02],
  [BiomeId.Highlands]: [0.88, 0.93, 0.95],
  [BiomeId.Volcanic]: [0.76, 0.7, 0.72],
  [BiomeId.MushroomFen]: [0.96, 0.78, 0.94],
  [BiomeId.River]: [0.82, 0.94, 0.94],
  [BiomeId.CloudreedGlen]: [0.76, 1.02, 0.91],
  [BiomeId.RainveilJungle]: [0.68, 1.04, 0.78],
  [BiomeId.SakurabloomGrove]: [1.08, 0.94, 1.02],
  [BiomeId.LumenTrench]: [0.62, 0.78, 1.08],
};

/**
 * Fits an aquatic settlement to the water volume at every authored point.
 * The candidate's center is already re-anchored to its real seabed; this
 * second pass handles relief across wide towns and keeps roofs, paths, lights,
 * furniture and patrol approaches at least one cell below the local surface.
 * A candidate is rejected only when a building footprint has no physically
 * valid submerged vertical range.
 */
function fitUnderwaterSettlementLayout(
  layout: SettlementLayoutPlan,
  sample: (x: number, z: number) => ColumnSample,
): SettlementLayoutPlan | null {
  if (layout.environment !== "underwater") return layout;
  let invalid = false;
  const clampWaterPoint = <T extends Readonly<{ x: number; z: number; y?: number }>>(point: T): T => {
    const column = sample(point.x, point.z);
    const minimum = column.height + 1;
    const maximum = column.waterline - 1;
    if (minimum > maximum) invalid = true;
    const requested = point.y ?? minimum;
    return { ...point, y: Math.max(minimum, Math.min(maximum, requested)) };
  };
  const buildings = layout.buildings.map((building) => {
    const halfWidth = Math.floor(building.width / 2);
    const halfDepth = Math.floor(building.depth / 2);
    let highestBed = MIN_Y;
    let lowestSurface = MAX_Y;
    for (let x = building.position.x - halfWidth; x <= building.position.x + halfWidth; x += 1) {
      for (let z = building.position.z - halfDepth; z <= building.position.z + halfDepth; z += 1) {
        const column = sample(x, z);
        highestBed = Math.max(highestBed, column.height);
        lowestSurface = Math.min(lowestSurface, column.waterline);
      }
    }
    // Underwater world placement raises the roof by four cells for one floor
    // and five cells for two floors from the chosen base plane.
    const roofRise = Math.min(5, building.floors * 3 + 1);
    const minimumY = highestBed + 2;
    const maximumY = lowestSurface - roofRise;
    if (minimumY > maximumY) invalid = true;
    const previousY = building.position.y ?? minimumY;
    const positionY = Math.max(minimumY, Math.min(maximumY, previousY));
    const deltaY = positionY - previousY;
    return {
      ...building,
      position: { ...building.position, y: positionY },
      furniture: building.furniture.map((furniture) => ({
        ...furniture,
        position: clampWaterPoint({
          ...furniture.position,
          y: (furniture.position.y ?? previousY) + deltaY,
        }),
      })),
    };
  });
  if (invalid) return null;
  const center = clampWaterPoint(layout.center);
  const paths = layout.paths.map(clampWaterPoint);
  const approaches = layout.approaches.map((approach) => ({ ...approach, position: clampWaterPoint(approach.position) }));
  const lights = layout.lights.map((light) => ({ ...light, position: clampWaterPoint(light.position) }));
  const centerColumn = sample(center.x, center.z);
  const minimumLayer = centerColumn.height + 1;
  const maximumLayer = centerColumn.waterline - 1;
  const verticalLayers = layout.verticalLayers.map((layer) => ({
    ...layer,
    y: Math.max(minimumLayer, Math.min(maximumLayer, layer.y)),
  }));
  if (invalid || minimumLayer > maximumLayer) return null;
  return { ...layout, center, buildings, paths, approaches, lights, verticalLayers };
}

const TILE_COLORS = [
  "#65a441", "#775338", "#795338", "#7b8181", "#d7c27b", "#735033", "#9d7446", "#3f7d36",
  "#3d85c8", "#4a4e50", "#a17d67", "#b9864c", "#91786e", "#bde4e2", "#e5c35a", "#303334",
  "#e5ecea", "#8d927f", "#604634", "#8b6846", "#2f6042", "#d0c8ab", "#b8ab8b", "#73a54c",
  "#bd7046", "#8998a0", "#4f913e", "#4f4034", "#5b7339", "#4a5136", "#aaa04f", "#8b793d",
  "#7b4f58", "#a36e78", "#d887ad", "#6b716f", "#a36b3c", "#8d592f", "#686e70", "#f2b94b",
  "#b56f50", "#d4af3f", "#60d8e1", "#3d4448", "#ed642f", "#a74e62", "#4b8245", "#85817c",
  "#8fd0e2", "#3b3538", "#29213d", "#61dce5", "#9f6b35", "#65a842", "#d54f48", "#548ed8",
  "#caa64c", "#6d452b", "#69422a", "#5e9d43", "#9b6839", "#666666", "#555555", "#444444",
  "#568e43", "#6f4f34", "#f4ca4f", "#b59be8", "#a88a48", "#72a94a", "#b8ded9", "#d7b667",
  "#53735d",
  "#5f7f47", "#4f7c42", "#704b8e", "#718943", "#63833d", "#d89542", "#659b48", "#4f8a40",
  "#c84b40", "#79a54f", "#aab14d", "#523824", "#9a693c", "#d8cca4", "#4e5765", "#b96845",
  "#9f6b35", "#b9874e", "#bd7b32", "#efc451", "#d7a33d", "#6f5745", "#62d8d4",
  "#d8c999", "#775c3d", "#75628e", "#5ca4a0",
  // 100-128: Shoreline flora, new biome surfaces/wood, crops and furniture.
  "#8da77a", "#d9b8ed", "#368d51", "#6a4b34", "#684527", "#9a6f43", "#257a49",
  "#5d994d", "#765747", "#76514e", "#a67a75", "#ec9fc5", "#f3a7cd", "#ae8de8",
  "#63f0c8", "#ef798f", "#8f8cff", "#4db8a1", "#77a879", "#8ebd93", "#c9d8b1",
  "#77a64f", "#94b958", "#e3b64b", "#43a864", "#f3a765", "#9c6c3e", "#8a5b36", "#936136",
];

export const MEADOW_GRASS_PALETTE = Object.freeze({
  top: "#568e43",
  topDark: "#3d7136",
  topLight: "#79ac58",
  clover: "#a8ca70",
  flower: "#e2c45e",
  sideDirt: "#6f4f34",
  sideGrass: "#5c9447",
});

/** Restores the airy leaf pixels; fuller crowns come from geometry, not opacity. */
export const LEAF_TEXTURE_CUTOUT_CHANCE = 1 - DENSE_CUTOUT_LEAF_POLICY.exteriorPixelCoverage;

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};

export function normalizeWorldGenerationOptions(value?: Partial<WorldGenerationOptions> | null): WorldGenerationOptions {
  const finiteOption = (candidate: unknown, fallback: number, min: number, max: number) => {
    const resolved = typeof candidate === "number" && Number.isFinite(candidate) ? candidate : fallback;
    return Math.round(clamp(resolved, min, max) * 100) / 100;
  };
  return {
    caveFrequency: finiteOption(value?.caveFrequency, DEFAULT_WORLD_GENERATION_OPTIONS.caveFrequency, 0, 3),
    biomeScale: finiteOption(value?.biomeScale, DEFAULT_WORLD_GENERATION_OPTIONS.biomeScale, 0.25, 4),
    resourceAbundance: finiteOption(value?.resourceAbundance, DEFAULT_WORLD_GENERATION_OPTIONS.resourceAbundance, 0.25, 4),
    structures: typeof value?.structures === "boolean" ? value.structures : DEFAULT_WORLD_GENERATION_OPTIONS.structures,
  };
}
const LIGHT_BLOCKS = new Set<BlockId>([
  ...TORCH_BLOCKS,
  BlockId.Glowstone,
  BlockId.CrystalBlock,
  BlockId.RuneStone,
  BlockId.CreatureHealer,
  BlockId.Dreamblossom,
  BlockId.LumenKelp,
  BlockId.StarCoral,
  BlockId.AbyssBloom,
  BlockId.LanternLotus,
]);
const ATLAS_GRID = 12;
const ATLAS_PAD = 0.0008;
const TILE_UVS = Array.from({ length: ATLAS_GRID * ATLAS_GRID }, (_, tile) => {
  const column = tile % ATLAS_GRID;
  const row = Math.floor(tile / ATLAS_GRID);
  return [column / ATLAS_GRID + ATLAS_PAD, 1 - (row + 1) / ATLAS_GRID + ATLAS_PAD, (column + 1) / ATLAS_GRID - ATLAS_PAD, 1 - row / ATLAS_GRID - ATLAS_PAD] as const;
});
export const GLASS_OPACITY = 0.42;

/** A cube with every face remapped to the same atlas contract used by chunk meshes. */
export function createAtlasBlockGeometry(type: BlockId, size = 1) {
  const definition = BLOCKS[type];
  const geometry = new THREE.BoxGeometry(size, size, size);
  const uv = geometry.getAttribute("uv") as THREE.BufferAttribute;
  // Three BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z.
  const tiles = [definition.side, definition.side, definition.top, definition.bottom, definition.side, definition.side];
  for (let face = 0; face < 6; face += 1) {
    const [u0, v0, u1, v1] = TILE_UVS[tiles[face]];
    for (let vertex = 0; vertex < 4; vertex += 1) {
      const index = face * 4 + vertex;
      const sourceU = uv.getX(index);
      const sourceV = uv.getY(index);
      uv.setXY(index, lerp(u0, u1, sourceU), lerp(v0, v1, sourceV));
    }
  }
  uv.needsUpdate = true;
  return geometry;
}

function blocksSky(type: BlockId) {
  const definition = BLOCKS[type];
  const fullCube = !definition?.shape || definition.shape === "cube";
  return Boolean(definition?.solid && fullCube && definition.layer !== "transparent" && definition.layer !== "cutout");
}

/**
 * A cheap baked skylight approximation used by chunk vertex colors. Sunlit
 * surfaces stay bright even when the player is under a roof, while deep cave
 * faces retain enough albedo for a nearby point light to reveal them.
 */
export function environmentSkyShade(cellY: number, skyTopY: number) {
  const depth = skyTopY - cellY;
  if (depth < 0) return 1;
  if (depth <= 1) return 0.78;
  if (depth <= 4) return 0.58;
  return 0.38;
}

export function seedToInt(seed: string) {
  let value = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    value ^= seed.charCodeAt(i);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

function hash2(x: number, z: number, seed: number) {
  let n = Math.imul(x, 374761393) + Math.imul(z, 668265263) + Math.imul(seed, 1442695041);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
}

function hash3(x: number, y: number, z: number, seed: number) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 1103515245) + Math.imul(z, 668265263) + Math.imul(seed, 1597334677);
  n = Math.imul(n ^ (n >>> 15), 2246822519);
  return ((n ^ (n >>> 13)) >>> 0) / 4294967295;
}

function valueNoise2(x: number, z: number, seed: number) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = fade(x - x0);
  const tz = fade(z - z0);
  const a = lerp(hash2(x0, z0, seed), hash2(x0 + 1, z0, seed), tx);
  const b = lerp(hash2(x0, z0 + 1, seed), hash2(x0 + 1, z0 + 1, seed), tx);
  return lerp(a, b, tz) * 2 - 1;
}

function valueNoise3(x: number, y: number, z: number, seed: number) {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const z0 = Math.floor(z);
  const tx = fade(x - x0);
  const ty = fade(y - y0);
  const tz = fade(z - z0);
  const at = (dx: number, dy: number, dz: number) => hash3(x0 + dx, y0 + dy, z0 + dz, seed) * 2 - 1;
  const x00 = lerp(at(0, 0, 0), at(1, 0, 0), tx);
  const x10 = lerp(at(0, 1, 0), at(1, 1, 0), tx);
  const x01 = lerp(at(0, 0, 1), at(1, 0, 1), tx);
  const x11 = lerp(at(0, 1, 1), at(1, 1, 1), tx);
  return lerp(lerp(x00, x10, ty), lerp(x01, x11, ty), tz);
}

function fbm2(x: number, z: number, seed: number, frequency: number, octaves: number) {
  let value = 0;
  let amplitude = 0.55;
  let total = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    value += valueNoise2(x * frequency, z * frequency, seed + octave * 977) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / total;
}

function continentOffset(value: number) {
  const points: Array<[number, number]> = [[-1, -24], [-0.62, -17], [-0.42, -11], [-0.25, -6], [-0.12, -2], [-0.03, 1], [0.2, 7], [0.45, 15], [0.7, 25], [1, 34]];
  for (let index = 0; index < points.length - 1; index += 1) {
    const [a, ay] = points[index];
    const [b, by] = points[index + 1];
    if (value <= b) return lerp(ay, by, smoothstep(a, b, value));
  }
  return points[points.length - 1][1];
}

export function chunkKey(cx: number, cz: number) {
  return `${cx},${cz}`;
}

export function splitCoordinate(value: number) {
  const chunk = Math.floor(value / CHUNK_SIZE);
  return { chunk, local: value - chunk * CHUNK_SIZE };
}

export function blockIndex(localX: number, y: number, localZ: number) {
  return localX + localZ * CHUNK_SIZE + (y - MIN_Y) * CHUNK_SIZE * CHUNK_SIZE;
}

function sectionForY(y: number) {
  return Math.floor((y - MIN_Y) / SECTION_HEIGHT);
}

function emptyBucket(): GeometryBucket {
  return { positions: [], normals: [], colors: [], uvs: [], indices: [] };
}

function hexToRgb(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex(r: number, g: number, b: number) {
  return `#${[r, g, b].map((value) => clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0")).join("")}`;
}

function shadeColor(hex: string, amount: number) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r + amount, g + amount, b + amount);
}

export function createBlockAtlas() {
  const tile = 16;
  const grid = ATLAS_GRID;
  const canvas = document.createElement("canvas");
  canvas.width = tile * grid;
  canvas.height = tile * grid;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) throw new Error("Canvas textures are unavailable.");
  context.imageSmoothingEnabled = false;
  let randomState = 0x72a4f11d;
  const random = () => {
    randomState = Math.imul(randomState ^ (randomState >>> 15), 2246822519);
    randomState = Math.imul(randomState ^ (randomState >>> 13), 3266489917);
    return ((randomState ^ (randomState >>> 16)) >>> 0) / 4294967295;
  };
  const pixel = (index: number, x: number, y: number, color: string, alpha = 1) => {
    context.globalAlpha = alpha;
    context.fillStyle = color;
    context.fillRect((index % grid) * tile + x, Math.floor(index / grid) * tile + y, 1, 1);
    context.globalAlpha = 1;
  };

  const oreTiles = new Set([9, 10, 40, 41, 42]);
  const leafTiles = new Set([7, 20, 23, 34, 80, 106, 111]);
  const logSideTiles = new Set([5, 18, 21, 32, 104, 109]);
  const logTopTiles = new Set([6, 19, 22, 33, 105, 110]);
  const crossTiles = new Set([39, 53, 54, 55, 56, 59, 66, 67, 68, 69, 73, 74, 75, 76, 77, 78, 79, 81, 82, 83,
    100, 101, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125]);
  for (let index = 0; index < grid * grid; index += 1) {
    const base = TILE_COLORS[index] ?? "#777777";
    const ox = (index % grid) * tile;
    const oy = Math.floor(index / grid) * tile;
    if (index === 13) {
      context.clearRect(ox, oy, tile, tile);
      for (let y = 0; y < tile; y += 1) for (let x = 0; x < tile; x += 1) {
        const edge = x < 2 || y < 2 || x > 13 || y > 13;
        if (edge || (x + y) % 13 === 0) pixel(index, x, y, edge ? "#b7dfdf" : "#d7f1ed", edge ? 0.78 : 0.34);
      }
      continue;
    }
    if (crossTiles.has(index)) {
      context.clearRect(ox, oy, tile, tile);
      if (index === 39) {
        for (let y = 7; y < 16; y += 1) {
          pixel(index, 7, y, y % 3 === 0 ? "#6b3d20" : "#9b6030");
          pixel(index, 8, y, "#c07a38");
        }
        for (const [x, y, color] of [[7, 6, "#ffd85a"], [8, 6, "#fff0a0"], [6, 5, "#f09132"], [7, 4, "#ffb43f"], [8, 3, "#ffe56d"], [9, 5, "#db5a27"]] as Array<[number, number, string]>) pixel(index, x, y, color);
      } else if (index >= 73 && index <= 78) {
        const young = index === 73 || index === 76;
        const ripe = index === 75 || index === 78;
        const leafA = index <= 75 ? "#4f7f43" : "#698c42";
        const leafB = index <= 75 ? "#72a554" : "#91ad50";
        const berry = index <= 75 ? "#955cbb" : "#eda748";
        const height = young ? 8 : 13;
        for (const [x, lean] of [[4, -1], [7, 0], [10, 1], [12, -1]] as Array<[number, number]>) {
          for (let step = 0; step < height; step += 1) {
            const px = x + Math.round(lean * step / Math.max(1, height));
            const py = 15 - step;
            pixel(index, px, py, step % 3 ? "#55783d" : "#7b9150");
            if (step > 2 && step % 3 === 0) {
              pixel(index, Math.max(0, px - 1), py, leafA);
              pixel(index, Math.min(15, px + 1), py - 1, leafB);
            }
          }
        }
        if (ripe) for (const [x, y] of [[4, 7], [7, 4], [9, 9], [12, 6], [6, 11]] as Array<[number, number]>) {
          pixel(index, x, y, berry);
          if (x < 15) pixel(index, x + 1, y, index <= 75 ? "#c38bdd" : "#ffd36b");
        }
      } else if (index === 79) {
        for (let y = 7; y < 16; y += 1) pixel(index, 7, y, "#744525");
        for (const [x, y] of [[5, 9], [4, 8], [6, 6], [9, 9], [10, 7], [8, 5], [7, 3]] as Array<[number, number]>) {
          pixel(index, x, y, "#4f8a40");
          if (x + 1 < 16) pixel(index, x + 1, y, "#79b55a");
        }
      } else if (index === 81) {
        for (let y = 1; y < 7; y += 1) pixel(index, 8, y, "#6b4226");
        for (let y = 6; y < 14; y += 1) for (let x = 4; x < 13; x += 1) {
          const dx = x - 8; const dy = y - 9;
          if (dx * dx + dy * dy <= 17) pixel(index, x, y, dx < -1 ? "#a83834" : dx > 2 ? "#e0644c" : "#c8493e");
        }
        pixel(index, 6, 6, "#62954a"); pixel(index, 7, 5, "#78aa55");
      } else if (index === 82 || index === 83) {
        const height = index === 82 ? 6 : 10;
        for (const [x, lean] of [[5, -1], [8, 0], [11, 1]] as Array<[number, number]>) {
          for (let step = 0; step < height; step += 1) pixel(index, x + Math.round(lean * step / height), 15 - step, step % 2 ? "#7ea04c" : "#a5ad4d");
          if (index === 83) { pixel(index, x - 1, 5, "#c0a848"); pixel(index, x + 1, 6, "#d0ba54"); }
        }
      } else if (index === 53) {
        for (const [x, lean, height] of [[4, -1, 8], [7, 0, 12], [10, 1, 10], [12, 0, 6]] as Array<[number, number, number]>) {
          for (let step = 0; step < height; step += 1) pixel(index, x + Math.round((lean * step) / height), 15 - step, step % 3 ? "#65a844" : "#86bd58");
        }
      } else if (index === 59) {
        for (let y = 8; y < 16; y += 1) pixel(index, 7, y, "#704325");
        for (const [x, y] of [[5, 8], [4, 7], [6, 6], [9, 8], [10, 7], [8, 5], [7, 4]]) {
          pixel(index, x, y, "#4b8d3c");
          if (x + 1 < 16) pixel(index, x + 1, y, "#75b653");
        }
      } else if (index === 66 || index === 67) {
        for (let y = 7; y < 16; y += 1) pixel(index, 7 + (y % 5 === 0 ? 1 : 0), y, "#578641");
        const bloom = index === 66 ? "#f4c84e" : "#a68de1";
        const highlight = index === 66 ? "#fff1a2" : "#e5ddff";
        for (const [dx, dy] of [[0, -3], [-2, -1], [2, -1], [-2, 1], [2, 1], [0, 2]] as Array<[number, number]>) pixel(index, 8 + dx, 5 + dy, bloom);
        pixel(index, 8, 5, highlight);
      } else if (index === 68) {
        for (const [x, lean, height] of [[4, -1, 7], [7, 1, 10], [10, -1, 8], [12, 0, 5]] as Array<[number, number, number]>) {
          for (let step = 0; step < height; step += 1) pixel(index, x + Math.round((lean * step) / height), 15 - step, step % 2 ? "#9d843f" : "#c2a65a");
        }
      } else if (index === 69) {
        for (let y = 8; y < 16; y += 1) pixel(index, 7, y, "#698a39");
        for (const side of [-1, 1]) for (let step = 0; step < 5; step += 1) pixel(index, 7 + side * (step + 1), 9 - Math.floor(step / 2), step % 2 ? "#83b34f" : "#5c963d");
        for (const [x, y] of [[6, 7], [8, 6], [9, 8], [7, 9]] as Array<[number, number]>) pixel(index, x, y, "#f0d34f");
      } else {
        const stem = index === 56 ? "#9a7a32" : "#54843b";
        for (let y = 7; y < 16; y += 1) pixel(index, 7 + (y % 4 === 0 ? 1 : 0), y, stem);
        if (index === 56) {
          for (let y = 3; y < 10; y += 2) {
            pixel(index, 6, y, "#d7b84e"); pixel(index, 8, y + 1, "#edce62"); pixel(index, 9, y, "#bd9637");
          }
        } else {
          const bloom = index === 54 ? "#e54f49" : index === 55 ? "#5796e5" : base;
          for (const [dx, dy] of [[0, -2], [-2, 0], [2, 0], [0, 2], [-1, -1], [1, -1]]) pixel(index, 8 + dx, 5 + dy, bloom);
          pixel(index, 8, 5, index === 54 ? "#ffd75e" : shadeColor(bloom, 52));
        }
      }
      continue;
    }
    for (let y = 0; y < tile; y += 1) for (let x = 0; x < tile; x += 1) {
      const variation = random() < 0.14 ? -18 : random() > 0.88 ? 15 : 0;
      pixel(index, x, y, shadeColor(base, variation));
    }
    if (index === 1 || index === 17 || index === 29 || index === 31 || index === 103 || index === 108) {
      const topColor = index === 17 ? "#e9efed" : index === 29 ? "#586f37" : index === 31 ? "#aaa04f"
        : index === 103 ? "#368d51" : index === 108 ? "#5d994d" : "#66a441";
      for (let y = 0; y < 5; y += 1) for (let x = 0; x < tile; x += 1) pixel(index, x, y, random() > 0.24 ? topColor : shadeColor(topColor, -20));
    }
    if (logSideTiles.has(index)) for (let x = 2; x < tile; x += 4) for (let y = 0; y < tile; y += 1) pixel(index, x, y, shadeColor(base, -35));
    if (logTopTiles.has(index)) {
      context.strokeStyle = shadeColor(base, -42);
      context.strokeRect(ox + 3.5, oy + 3.5, 9, 9);
      context.strokeRect(ox + 6.5, oy + 6.5, 3, 3);
    }
    if (index === 91) {
      for (let y = 2; y < tile; y += 4) for (let x = 0; x < tile; x += 1) pixel(index, x, y, "#754522");
      for (const [x, y] of [[3, 5], [11, 9], [7, 13]] as Array<[number, number]>) {
        pixel(index, x, y, "#f4d455"); pixel(index, x + 1, y, "#2d251e"); pixel(index, x + 2, y, "#f4d455");
      }
    } else if (index === 92) {
      for (let y = 2; y < 15; y += 4) for (let x = (y / 4) % 2 ? 1 : 3; x < 15; x += 6) {
        for (const [dx, dy] of [[1, 0], [2, 0], [0, 1], [3, 1], [1, 2], [2, 2]] as Array<[number, number]>) pixel(index, x + dx, y + dy, "#8d5b22");
      }
    } else if (index === 93) {
      for (let y = 1; y < 16; y += 3) for (let x = 0; x < 16; x += 1) pixel(index, x, y, y % 2 ? "#9a6227" : "#f0bd48");
      for (let y = 9; y < 14; y += 1) for (let x = 6; x < 10; x += 1) pixel(index, x, y, "#33251b");
    } else if (index === 94) {
      for (let y = 1; y < 16; y += 5) for (let x = 0; x < 16; x += 1) pixel(index, x, y, "#b8b29d");
      for (let x = 2; x < 16; x += 6) for (let y = 0; y < 16; y += 1) pixel(index, x, y, "#3b3534");
    } else if (index === 95) {
      for (let y = 1; y < 15; y += 4) for (let x = 1; x < 15; x += 4) {
        pixel(index, x, y, "#d9ffff"); pixel(index, x + 1, y, "#8ff5ee"); pixel(index, x, y + 1, "#67d8d4");
      }
    } else if (index === 96) {
      context.fillStyle = "#d8c999"; context.fillRect(ox, oy, tile, tile);
      context.fillStyle = "#8a7551";
      context.fillRect(ox, oy, tile, 1); context.fillRect(ox, oy + 15, tile, 1);
      context.fillRect(ox, oy, 1, tile); context.fillRect(ox + 15, oy, 1, tile);
      context.fillStyle = "#6e9f63";
      context.fillRect(ox + 3, oy + 4, 5, 3); context.fillRect(ox + 9, oy + 9, 4, 3);
      context.fillStyle = "#5597b2";
      context.fillRect(ox + 2, oy + 10, 6, 1); context.fillRect(ox + 7, oy + 7, 1, 4); context.fillRect(ox + 11, oy + 3, 1, 5);
      context.fillStyle = "#c05d4d"; context.fillRect(ox + 11, oy + 5, 2, 2);
    } else if (index === 97) {
      context.fillStyle = "#65503a"; context.fillRect(ox, oy, tile, tile);
      context.fillStyle = "#987744";
      for (let y = 1; y < tile; y += 5) context.fillRect(ox, oy + y, tile, 2);
      context.fillStyle = "#c7a548";
      for (const [x, y] of [[2, 2], [12, 2], [2, 12], [12, 12], [7, 7]] as Array<[number, number]>) context.fillRect(ox + x, oy + y, 2, 2);
    } else if (index === 98) {
      context.clearRect(ox, oy, tile, tile);
      context.fillStyle = "rgba(90,72,112,.88)"; context.fillRect(ox + 2, oy + 2, 12, 12);
      context.fillStyle = "#b69ed5";
      context.fillRect(ox + 7, oy + 2, 2, 12); context.fillRect(ox + 3, oy + 7, 10, 2);
      context.fillStyle = "#6be0cf"; context.fillRect(ox + 7, oy + 7, 2, 2);
    } else if (index === 99) {
      context.fillStyle = "#3d6665"; context.fillRect(ox, oy, tile, tile);
      context.fillStyle = "#79d8cd";
      context.fillRect(ox + 7, oy + 2, 2, 12); context.fillRect(ox + 4, oy + 5, 8, 2); context.fillRect(ox + 5, oy + 10, 6, 2);
      context.fillStyle = "#d8fff5"; context.fillRect(ox + 7, oy + 6, 2, 2);
    }
    if (leafTiles.has(index) && LEAF_TEXTURE_CUTOUT_CHANCE > 0) {
      for (let y = 0; y < tile; y += 1) for (let x = 0; x < tile; x += 1) {
        if (random() < LEAF_TEXTURE_CUTOUT_CHANCE) context.clearRect(ox + x, oy + y, 1, 1);
      }
    }
    if (oreTiles.has(index)) {
      const oreColor = index === 9 ? "#25282a" : index === 10 ? "#c08e70" : index === 40 ? "#d27854" : index === 41 ? "#f0c94f" : "#67edf2";
      for (let i = 0; i < 20; i += 1) pixel(index, Math.floor(random() * tile), Math.floor(random() * tile), oreColor);
    }
    if (index === 8 || index === 44) {
      for (let y = 2; y < tile; y += 5) for (let x = 0; x < tile; x += 1) if ((x + y) % 3) pixel(index, x, y, index === 8 ? "#75b8e5" : "#ffb33d", 0.55);
    }
    if (index === 11) for (let y = 0; y < tile; y += 4) for (let x = 0; x < tile; x += 1) pixel(index, x, y, "#76502f");
    if (index === 12) {
      for (let y = 0; y < tile; y += 5) for (let x = 0; x < tile; x += 1) pixel(index, x, y, "#56504c");
      for (let x = 0; x < tile; x += 8) for (let y = 0; y < tile; y += 1) pixel(index, x + (Math.floor(y / 5) % 2) * 4, y, "#56504c");
    }
    if (index === 38) {
      context.fillStyle = "#242727";
      context.fillRect(ox + 2, oy + 3, 12, 10);
      context.fillStyle = "#131515";
      context.fillRect(ox + 4, oy + 6, 8, 5);
      context.fillStyle = "#d2843c";
      context.fillRect(ox + 5, oy + 8, 6, 2);
      context.fillStyle = "#f5b348";
      context.fillRect(ox + 7, oy + 7, 2, 2);
    }
    if (index === 36) {
      context.fillStyle = "#5a351f";
      context.fillRect(ox, oy, 16, 2); context.fillRect(ox, oy + 14, 16, 2); context.fillRect(ox, oy, 2, 16); context.fillRect(ox + 14, oy, 2, 16);
      context.fillStyle = "#d0a25e";
      for (let p = 4; p <= 12; p += 4) { context.fillRect(ox + p, oy + 2, 1, 12); context.fillRect(ox + 2, oy + p, 12, 1); }
      context.fillStyle = "#3f4341";
      context.fillRect(ox + 5, oy + 5, 6, 2); context.fillRect(ox + 7, oy + 3, 2, 6);
    }
    if (index === 37) {
      context.fillStyle = "#5a351f";
      context.fillRect(ox, oy, 16, 2); context.fillRect(ox, oy + 14, 16, 2);
      context.fillStyle = "#d7ad67";
      context.fillRect(ox + 3, oy + 4, 10, 1); context.fillRect(ox + 3, oy + 10, 10, 1);
      context.fillStyle = "#59605d";
      context.fillRect(ox + 5, oy + 6, 7, 2); context.fillRect(ox + 4, oy + 8, 2, 3);
    }
    if (index === 52) {
      context.fillStyle = "#633d20";
      context.fillRect(ox, oy + 2, 16, 2); context.fillRect(ox, oy + 12, 16, 2); context.fillRect(ox + 1, oy, 2, 16); context.fillRect(ox + 13, oy, 2, 16);
      context.fillStyle = "#d5a04c";
      context.fillRect(ox + 6, oy + 6, 4, 5);
      context.fillStyle = "#5a4531";
      context.fillRect(ox + 7, oy + 7, 2, 2);
    }
    if (index === 60) {
      context.fillStyle = "#5d371f";
      context.fillRect(ox, oy, 2, 16); context.fillRect(ox + 14, oy, 2, 16); context.fillRect(ox, oy, 16, 2); context.fillRect(ox, oy + 14, 16, 2);
      context.fillStyle = "#c18a4b";
      context.fillRect(ox + 3, oy + 3, 10, 9);
      context.fillStyle = "#6b4428";
      context.fillRect(ox + 3, oy + 7, 10, 2); context.fillRect(ox + 7, oy + 2, 2, 12);
      context.fillStyle = "#e9c366";
      context.fillRect(ox + 11, oy + 3, 2, 2);
    }
    if (index === 61) {
      context.fillStyle = "#5d371f";
      context.fillRect(ox, oy, 2, 16); context.fillRect(ox + 14, oy, 2, 16); context.fillRect(ox, oy, 16, 2); context.fillRect(ox, oy + 14, 16, 2);
      context.fillStyle = "#b77d42";
      context.fillRect(ox + 3, oy + 3, 10, 10);
      // The upper door pane is actual transparency in the cutout atlas, not
      // blue-painted wood. A few opaque glints keep the glass readable while
      // the world behind it remains visible.
      context.clearRect(ox + 4, oy + 4, 8, 6);
      context.fillStyle = "#d9eee7";
      context.fillRect(ox + 5, oy + 5, 2, 1); context.fillRect(ox + 9, oy + 5, 2, 1);
      context.fillStyle = "#5d371f";
      context.fillRect(ox + 7, oy + 3, 2, 8); context.fillRect(ox + 3, oy + 9, 10, 2);
    }
    if (index === 62) {
      context.fillStyle = "#6a3d22";
      context.fillRect(ox, oy, 16, 16);
      context.fillStyle = "#9a6235";
      for (let x = 2; x < 16; x += 4) context.fillRect(ox + x, oy, 2, 16);
      context.fillStyle = "#c18448";
      for (let y = 1; y < 16; y += 5) context.fillRect(ox, oy + y, 16, 1);
      context.fillStyle = "#4c2c1b";
      context.fillRect(ox, oy, 1, 16); context.fillRect(ox + 15, oy, 1, 16);
    }
    if (index === 63) {
      context.fillStyle = "#7f292c";
      context.fillRect(ox, oy, 16, 16);
      context.fillStyle = "#ad4141";
      context.fillRect(ox + 1, oy + 1, 14, 14);
      context.fillStyle = "#c55c4f";
      for (let y = 3; y < 16; y += 5) context.fillRect(ox + 1, oy + y, 14, 1);
      context.fillStyle = "#e9a26e";
      for (let x = 3; x < 16; x += 6) for (let y = 2; y < 16; y += 6) context.fillRect(ox + x, oy + y, 2, 2);
    }
    if (index === 64) {
      context.fillStyle = MEADOW_GRASS_PALETTE.top;
      context.fillRect(ox, oy, tile, tile);
      for (let y = 0; y < tile; y += 1) for (let x = 0; x < tile; x += 1) {
        if ((x * 5 + y * 3) % 19 === 0) pixel(index, x, y, MEADOW_GRASS_PALETTE.topDark);
        else if ((x * 7 + y * 11) % 23 === 0) pixel(index, x, y, MEADOW_GRASS_PALETTE.topLight);
        else if ((x * 11 + y * 5) % 41 === 0) pixel(index, x, y, MEADOW_GRASS_PALETTE.clover);
        else if ((x * 13 + y * 17) % 67 === 0) pixel(index, x, y, MEADOW_GRASS_PALETTE.flower);
      }
    }
    if (index === 65) {
      context.fillStyle = MEADOW_GRASS_PALETTE.sideDirt;
      context.fillRect(ox, oy, tile, tile);
      context.fillStyle = MEADOW_GRASS_PALETTE.sideGrass;
      context.fillRect(ox, oy, tile, 5);
      for (let x = 0; x < tile; x += 2) context.fillRect(ox + x, oy + 4, 1, 2 + (x % 3));
    }
    if (index === 70) {
      context.clearRect(ox, oy, tile, tile);
      context.fillStyle = "rgba(185,229,224,.22)";
      context.fillRect(ox + 2, oy + 2, 12, 12);
      context.fillStyle = "#8f6237";
      context.fillRect(ox, oy, 2, tile); context.fillRect(ox + 14, oy, 2, tile);
      context.fillRect(ox, oy, tile, 2); context.fillRect(ox, oy + 14, tile, 2);
      context.fillStyle = "rgba(232,255,249,.72)";
      context.fillRect(ox + 3, oy + 3, 1, 6); context.fillRect(ox + 4, oy + 3, 5, 1);
    }
    if (index === 71) {
      context.fillStyle = "#d7b768";
      context.fillRect(ox, oy, tile, tile);
      context.fillStyle = "#a9803f";
      for (let y = 0; y < tile; y += 5) context.fillRect(ox, oy + y, tile, 1);
      context.fillRect(ox + 7, oy + 3, 2, 10); context.fillRect(ox + 4, oy + 7, 8, 2);
      context.fillStyle = "#f4d98b";
      context.fillRect(ox + 7, oy + 7, 2, 2);
    }
    if (index === 72) {
      context.fillStyle = "#405447";
      context.fillRect(ox, oy, tile, tile);
      context.fillStyle = "#79c692";
      context.fillRect(ox + 3, oy + 3, 2, 10); context.fillRect(ox + 11, oy + 3, 2, 10);
      context.fillRect(ox + 5, oy + 7, 6, 2); context.fillRect(ox + 7, oy + 5, 2, 6);
      context.fillStyle = "#b8f4c9";
      context.fillRect(ox + 7, oy + 7, 2, 2);
    }
    if (index === 84) {
      context.fillStyle = "#523824";
      context.fillRect(ox, oy, tile, tile);
      for (let x = 1; x < tile; x += 4) {
        context.fillStyle = x % 8 === 1 ? "#735139" : "#67452f";
        context.fillRect(ox + x, oy, 2, tile);
      }
      context.fillStyle = "rgba(76,139,171,.52)";
      for (let y = 3; y < tile; y += 6) context.fillRect(ox, oy + y, tile, 1);
    }
    if (index === 85) {
      context.fillStyle = "#895b35";
      context.fillRect(ox, oy, tile, tile);
      context.fillStyle = "#b17b47";
      for (let x = 2; x < tile; x += 5) context.fillRect(ox + x, oy, 2, tile);
      context.fillStyle = "#624127";
      context.fillRect(ox, oy + 4, tile, 1); context.fillRect(ox, oy + 11, tile, 1);
    }
    if (index === 86) {
      context.fillStyle = "#d8cca4"; context.fillRect(ox, oy, tile, tile);
      context.fillStyle = "#b9aa83";
      for (let y = 3; y < tile; y += 5) context.fillRect(ox, oy + y, tile, 1);
      for (let y = 0; y < tile; y += 5) context.fillRect(ox + ((y / 5) % 2 ? 4 : 10), oy + y, 1, 4);
    }
    if (index === 87) {
      context.fillStyle = "#4e5765"; context.fillRect(ox, oy, tile, tile);
      context.fillStyle = "#76808d";
      for (let y = 2; y < tile; y += 4) context.fillRect(ox, oy + y, tile, 1);
      context.fillStyle = "#353d49";
      context.fillRect(ox + 4, oy, 1, tile); context.fillRect(ox + 11, oy, 1, tile);
    }
    if (index === 88) {
      context.fillStyle = "#b96845"; context.fillRect(ox, oy, tile, tile);
      for (let y = 2; y < tile; y += 4) {
        context.fillStyle = y % 8 === 2 ? "#d38458" : "#934d3a";
        context.fillRect(ox, oy + y, tile, 2);
      }
    }
    if (index === 89) {
      context.fillStyle = "#9f6b35"; context.fillRect(ox, oy, tile, tile);
      context.fillStyle = "#633d20";
      context.fillRect(ox, oy + 2, tile, 2); context.fillRect(ox, oy + 12, tile, 2);
      context.fillRect(ox + 1, oy, 2, tile); context.fillRect(ox + 13, oy, 2, tile);
      context.fillStyle = "#d5a04c"; context.fillRect(ox + 6, oy + 6, 4, 5);
      context.fillStyle = "#51402f"; context.fillRect(ox + 7, oy + 7, 2, 2);
    }
    if (index === 90) {
      context.fillStyle = "#b9874e"; context.fillRect(ox, oy, tile, tile);
      context.fillStyle = "#704724";
      context.fillRect(ox, oy, tile, 2); context.fillRect(ox, oy + 14, tile, 2);
      context.fillRect(ox, oy, 2, tile); context.fillRect(ox + 14, oy, 2, tile);
      context.fillStyle = "#d2a463"; context.fillRect(ox + 3, oy + 3, 10, 10);
      context.fillStyle = "#8b5b31"; context.fillRect(ox + 7, oy + 3, 2, 10);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export class ChunkWorld {
  group = new THREE.Group();
  chunks = new Map<string, Chunk>();
  edits = new Map<string, Map<number, BlockId>>();
  structureMarkers = new Map<string, StructureMarker>();
  settlementPlans = new Map<string, SettlementWorldPlan>();
  generationQueue: Array<{ cx: number; cz: number; distance: number }> = [];
  generationQueued = new Set<string>();
  meshQueue: Array<{ key: string; section: number }> = [];
  meshQueueHead = 0;
  meshQueued = new Set<string>();
  urgentMeshQueue: Array<{ key: string; section: number }> = [];
  urgentMeshQueueHead = 0;
  urgentMeshQueued = new Set<string>();
  seedText = "WILDERNESS";
  seed = seedToInt(this.seedText);
  renderDistance = 10;
  retentionPadding = 2;
  generationWorkPerFrame = 1;
  meshWorkPerFrame = 2;
  generationOptions = normalizeWorldGenerationOptions();
  playerChunkX = Number.NaN;
  playerChunkZ = Number.NaN;
  frame = 0;
  atlas: THREE.Texture;
  materials: Record<WorldRenderLayer, THREE.Material>;
  /**
   * Open chests are drawn by the engine as articulated models. Keeping their
   * static chunk geometry out of the same frame avoids the dark z-fighting
   * seams that appeared through the animated lid and body.
   */
  hiddenChestVisuals = new Set<string>();
  private waterAnimationFrame = -1;

  constructor() {
    this.atlas = typeof document === "undefined"
      ? new THREE.DataTexture(new Uint8Array([127, 127, 127, 255]), 1, 1, THREE.RGBAFormat)
      : createBlockAtlas();
    this.atlas.needsUpdate = true;
    this.materials = {
      opaque: new THREE.MeshLambertMaterial({ map: this.atlas, vertexColors: true }),
      cutout: new THREE.MeshLambertMaterial({ map: this.atlas, vertexColors: true, alphaTest: 0.32, side: THREE.DoubleSide }),
      transparent: new THREE.MeshLambertMaterial({ map: this.atlas, vertexColors: true, transparent: true, opacity: 0.76, depthWrite: false, side: THREE.DoubleSide }),
      glass: new THREE.MeshLambertMaterial({ map: this.atlas, vertexColors: true, transparent: true, opacity: GLASS_OPACITY, depthWrite: false, side: THREE.DoubleSide }),
      emissive: new THREE.MeshLambertMaterial({ map: this.atlas, vertexColors: true, alphaTest: 0.2, side: THREE.DoubleSide, emissive: new THREE.Color(0xffffff), emissiveMap: this.atlas, emissiveIntensity: 0.72 }),
    };
  }

  /** Redraws only the 16px water tile; the shared atlas then animates every water face in one upload. */
  updateWaterAnimation(timeMilliseconds: number) {
    const frame = Math.floor(timeMilliseconds / 120);
    if (frame === this.waterAnimationFrame) return;
    const canvas = this.atlas.image;
    if (typeof HTMLCanvasElement === "undefined" || !(canvas instanceof HTMLCanvasElement)) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    this.waterAnimationFrame = frame;
    const tile = 16;
    const index = 8;
    const ox = (index % ATLAS_GRID) * tile;
    const oy = Math.floor(index / ATLAS_GRID) * tile;
    const phase = frame % tile;
    context.globalAlpha = 1;
    context.fillStyle = "#3d85c8";
    context.fillRect(ox, oy, tile, tile);
    for (let y = 0; y < tile; y += 1) for (let x = 0; x < tile; x += 1) {
      const wave = (x + Math.floor(y * 0.55) + phase) % 8;
      context.fillStyle = wave < 2 ? "rgba(128,198,235,.68)" : wave === 4 ? "rgba(42,111,180,.42)" : "rgba(78,157,213,.28)";
      context.fillRect(ox + x, oy + y, 1, 1);
    }
    this.atlas.needsUpdate = true;
  }

  setRenderDistance(distance: number) {
    this.renderDistance = clamp(Math.round(distance), 2, 16);
    this.playerChunkX = Number.NaN;
  }

  setRetentionPadding(padding: number) {
    this.retentionPadding = clamp(Math.round(padding), 2, 6);
  }

  setStreamingBudgets(chunkGenerations: number, chunkMeshSections: number) {
    this.generationWorkPerFrame = clamp(Math.round(chunkGenerations), 1, 3);
    this.meshWorkPerFrame = clamp(Math.round(chunkMeshSections), 1, 8);
  }

  reset(seedText: string, savedEdits?: ChunkEditSave, generationOptions?: Partial<WorldGenerationOptions>) {
    this.disposeChunks();
    this.generationQueue = [];
    this.generationQueued.clear();
    this.meshQueue = [];
    this.meshQueueHead = 0;
    this.meshQueued.clear();
    this.urgentMeshQueue = [];
    this.urgentMeshQueueHead = 0;
    this.urgentMeshQueued.clear();
    this.edits.clear();
    this.structureMarkers.clear();
    this.settlementPlans.clear();
    this.hiddenChestVisuals.clear();
    this.seedText = seedText || "WILDERNESS";
    this.seed = seedToInt(this.seedText);
    this.generationOptions = normalizeWorldGenerationOptions(generationOptions);
    this.playerChunkX = Number.NaN;
    this.playerChunkZ = Number.NaN;
    if (savedEdits) {
      for (const [key, pairs] of Object.entries(savedEdits)) {
        const map = new Map<number, BlockId>();
        for (const [index, type] of pairs) map.set(index, type as BlockId);
        this.edits.set(key, map);
      }
    }
  }

  initializeAround(x: number, z: number) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    for (let radius = 0; radius <= 1; radius += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) for (let dz = -radius; dz <= radius; dz += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
        this.generateChunk(cx + dx, cz + dz);
      }
    }
    for (const chunk of this.chunks.values()) for (let section = 0; section < SECTION_COUNT; section += 1) this.rebuildSection(chunk, section);
    this.scheduleAround(x, z, true);
  }

  update(x: number, z: number) {
    this.frame += 1;
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    if (cx !== this.playerChunkX || cz !== this.playerChunkZ || this.frame % 180 === 0) this.scheduleAround(x, z);
    for (let index = 0; index < this.generationWorkPerFrame; index += 1) this.processGeneration();
    for (let index = 0; index < this.meshWorkPerFrame; index += 1) this.processMesh();
  }

  scheduleAround(x: number, z: number, force = false) {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);
    if (!force && cx === this.playerChunkX && cz === this.playerChunkZ) return;
    this.playerChunkX = cx;
    this.playerChunkZ = cz;
    const generationRadius = this.renderDistance + 1;
    this.generationQueue = this.generationQueue
      .filter((entry) => !this.chunks.has(chunkKey(entry.cx, entry.cz)) && Math.max(Math.abs(entry.cx - cx), Math.abs(entry.cz - cz)) <= generationRadius)
      .map((entry) => ({ ...entry, distance: Math.max(Math.abs(entry.cx - cx), Math.abs(entry.cz - cz)) }));
    this.generationQueued = new Set(this.generationQueue.map((entry) => chunkKey(entry.cx, entry.cz)));
    const activeMeshQueued = this.meshQueued;
    const seenMeshEntries = new Set<string>();
    this.meshQueue = this.meshQueue.slice(this.meshQueueHead).filter((entry) => {
      const queueKey = `${entry.key}:${entry.section}`;
      if (!activeMeshQueued.has(queueKey) || seenMeshEntries.has(queueKey)) return false;
      const chunk = this.chunks.get(entry.key);
      if (!chunk) return false;
      if (Math.max(Math.abs(chunk.cx - cx), Math.abs(chunk.cz - cz)) > this.renderDistance) return false;
      seenMeshEntries.add(queueKey);
      return true;
    });
    this.meshQueueHead = 0;
    this.meshQueue.sort((a, b) => {
      const chunkA = this.chunks.get(a.key);
      const chunkB = this.chunks.get(b.key);
      const distanceA = chunkA ? Math.max(Math.abs(chunkA.cx - cx), Math.abs(chunkA.cz - cz)) : Infinity;
      const distanceB = chunkB ? Math.max(Math.abs(chunkB.cx - cx), Math.abs(chunkB.cz - cz)) : Infinity;
      return distanceA - distanceB;
    });
    this.meshQueued = new Set(this.meshQueue.map((entry) => `${entry.key}:${entry.section}`));
    const activeUrgentMeshQueued = this.urgentMeshQueued;
    const seenUrgentMeshEntries = new Set<string>();
    this.urgentMeshQueue = this.urgentMeshQueue.slice(this.urgentMeshQueueHead).filter((entry) => {
      const queueKey = `${entry.key}:${entry.section}`;
      if (!activeUrgentMeshQueued.has(queueKey) || seenUrgentMeshEntries.has(queueKey)) return false;
      const chunk = this.chunks.get(entry.key);
      if (!chunk) return false;
      if (Math.max(Math.abs(chunk.cx - cx), Math.abs(chunk.cz - cz)) > this.renderDistance) return false;
      seenUrgentMeshEntries.add(queueKey);
      return true;
    });
    this.urgentMeshQueueHead = 0;
    this.urgentMeshQueued = new Set(this.urgentMeshQueue.map((entry) => `${entry.key}:${entry.section}`));
    for (let dx = -generationRadius; dx <= generationRadius; dx += 1) {
      for (let dz = -generationRadius; dz <= generationRadius; dz += 1) {
        const key = chunkKey(cx + dx, cz + dz);
        const distance = Math.max(Math.abs(dx), Math.abs(dz));
        const chunk = this.chunks.get(key);
        if (!chunk && !this.generationQueued.has(key)) {
          this.generationQueue.push({ cx: cx + dx, cz: cz + dz, distance });
          this.generationQueued.add(key);
        } else if (chunk && distance <= this.renderDistance) {
          chunk.group.visible = true;
          for (let section = 0; section < SECTION_COUNT; section += 1) {
            if (chunk.dirty.has(section) || (!chunk.sections.has(section) && chunk.sectionBlockCounts[section] > 0)) this.queueMesh(key, section);
          }
        }
      }
    }
    this.generationQueue.sort((a, b) => b.distance - a.distance);

    const retainRadius = this.renderDistance + this.retentionPadding;
    for (const [key, chunk] of this.chunks.entries()) {
      const distance = Math.max(Math.abs(chunk.cx - cx), Math.abs(chunk.cz - cz));
      if (distance > retainRadius) this.unloadChunk(key);
      else chunk.group.visible = distance <= this.renderDistance;
    }
  }

  processGeneration() {
    const next = this.generationQueue.pop();
    if (!next) return;
    const key = chunkKey(next.cx, next.cz);
    this.generationQueued.delete(key);
    if (this.chunks.has(key)) return;
    const chunk = this.generateChunk(next.cx, next.cz);
    const distance = Math.max(Math.abs(next.cx - this.playerChunkX), Math.abs(next.cz - this.playerChunkZ));
    chunk.group.visible = distance <= this.renderDistance;
    if (distance <= this.renderDistance) {
      for (let section = 0; section < SECTION_COUNT; section += 1) {
        if (chunk.sectionBlockCounts[section] > 0) this.queueMesh(key, section);
      }
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const neighbor = this.chunks.get(chunkKey(next.cx + dx, next.cz + dz));
      if (!neighbor || !neighbor.group.visible) continue;
      for (let section = 0; section < SECTION_COUNT; section += 1) {
        if (neighbor.sectionBlockCounts[section] > 0) this.queueMesh(neighbor.key, section);
      }
    }
    return chunk;
  }

  processMesh() {
    while (true) {
      const next = this.takeQueuedMesh(true) ?? this.takeQueuedMesh(false);
      if (!next) return;
      const chunk = this.chunks.get(next.key);
      if (!chunk || !chunk.group.visible) continue;
      this.rebuildSection(chunk, next.section);
      return;
    }
  }

  takeQueuedMesh(urgent: boolean) {
    let queue = urgent ? this.urgentMeshQueue : this.meshQueue;
    let head = urgent ? this.urgentMeshQueueHead : this.meshQueueHead;
    const queued = urgent ? this.urgentMeshQueued : this.meshQueued;
    while (head < queue.length) {
      const next = queue[head];
      head += 1;
      const queueKey = `${next.key}:${next.section}`;
      if (!queued.delete(queueKey)) continue;
      if (head >= 256 && head * 2 >= queue.length) {
        queue = queue.slice(head);
        head = 0;
      }
      if (urgent) {
        this.urgentMeshQueue = queue;
        this.urgentMeshQueueHead = head;
      } else {
        this.meshQueue = queue;
        this.meshQueueHead = head;
      }
      return next;
    }
    queue = [];
    if (urgent) {
      this.urgentMeshQueue = queue;
      this.urgentMeshQueueHead = 0;
    } else {
      this.meshQueue = queue;
      this.meshQueueHead = 0;
    }
    return undefined;
  }

  queueMesh(key: string, section: number, urgent = false) {
    if (section < 0 || section >= SECTION_COUNT) return;
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    const existing = chunk.sections.get(section);
    const hasGeometry = existing ? Object.values(existing).some(Boolean) : false;
    if (chunk.sectionBlockCounts[section] === 0 && !hasGeometry) {
      chunk.dirty.delete(section);
      return;
    }
    chunk.dirty.add(section);
    const queueKey = `${key}:${section}`;
    if (urgent) {
      if (this.urgentMeshQueued.has(queueKey)) return;
      this.meshQueued.delete(queueKey);
      this.urgentMeshQueued.add(queueKey);
      this.urgentMeshQueue.push({ key, section });
      return;
    }
    if (this.meshQueued.has(queueKey) || this.urgentMeshQueued.has(queueKey)) return;
    this.meshQueued.add(queueKey);
    this.meshQueue.push({ key, section });
  }

  cancelQueuedMesh(key: string, section: number) {
    const queueKey = `${key}:${section}`;
    this.meshQueued.delete(queueKey);
    this.urgentMeshQueued.delete(queueKey);
  }

  sampleColumn(x: number, z: number): ColumnSample {
    const biomeScale = this.generationOptions.biomeScale;
    const sampleX = x / biomeScale;
    const sampleZ = z / biomeScale;
    const warpX = sampleX + 34 * fbm2(sampleX, sampleZ, this.seed ^ 0x1f123bb5, 1 / 420, 3);
    const warpZ = sampleZ + 34 * fbm2(sampleX, sampleZ, this.seed ^ 0x72e8a1d3, 1 / 420, 3);
    const continental = 0.72 * fbm2(warpX, warpZ, this.seed ^ 0x9e3779b9, 1 / 720, 5) + 0.28 * fbm2(warpX, warpZ, this.seed ^ 0x85ebca6b, 1 / 240, 3);
    const temperature = clamp(0.5 + 0.5 * (0.78 * fbm2(sampleX, sampleZ, this.seed ^ 0xc2b2ae35, 1 / 560, 4) + 0.22 * fbm2(sampleX, sampleZ, this.seed ^ 0x27d4eb2d, 1 / 140, 2)), 0, 1);
    const moisture = clamp(0.5 + 0.5 * (0.8 * fbm2(sampleX, sampleZ, this.seed ^ 0x165667b1, 1 / 510, 4) + 0.2 * fbm2(sampleX, sampleZ, this.seed ^ 0xd3a2646c, 1 / 125, 2)), 0, 1);
    const erosion = clamp(0.5 + 0.5 * fbm2(warpX, warpZ, this.seed ^ 0xfd7046c5, 1 / 390, 4), 0, 1);
    const region = clamp(0.5 + 0.5 * fbm2(warpX, warpZ, this.seed ^ 0xb55a4f09, 1 / 440, 3), 0, 1);
    const variant = clamp(0.5 + 0.5 * fbm2(warpX - 900, warpZ + 600, this.seed ^ 0x94d049bb, 1 / 270, 3), 0, 1);
    const ridge = Math.pow(Math.max(0, 1 - Math.abs(fbm2(warpX, warpZ, this.seed ^ 0x369dea0f, 1 / 165, 4))), 3);
    const mountain = smoothstep(0.25, 0.58, continental) * smoothstep(0.56, 0.8, region) * (1 - 0.65 * erosion);
    const detail = (5.5 - 3.7 * erosion) * fbm2(warpX, warpZ, this.seed ^ 0x7f4a7c15, 1 / 92, 4) + 1.2 * fbm2(warpX, warpZ, this.seed ^ 0x632be59b, 1 / 24, 2);
    let height = SEA_LEVEL + continentOffset(continental) + detail + mountain * (6 + 30 * ridge);
    // Continental shelves now step down into broad basins and narrow trenches
    // instead of settling on one nearly level ocean floor. The bounded terms
    // preserve deterministic sampling while producing navigable depth bands.
    const oceanWeight = 1 - smoothstep(-0.26, -0.03, continental);
    const oceanBasin = 0.5 + 0.5 * fbm2(warpX + 731, warpZ - 419, this.seed ^ 0x41c64e6d, 1 / 210, 4);
    const trenchField = Math.pow(Math.max(0, 1 - Math.abs(fbm2(warpX - 503, warpZ + 887, this.seed ^ 0x9f4a7c31, 1 / 185, 4))), 5);
    height -= oceanWeight * (2.5 + oceanBasin * 7 + trenchField * 17);
    const riverField = Math.abs(fbm2(warpX + 211, warpZ - 173, this.seed ^ 0x85157af5, 1 / 320, 3));
    const river = (1 - smoothstep(0.018, 0.066, riverField)) * smoothstep(-0.16, 0.06, continental) * (1 - 0.75 * mountain);
    const waterline = SEA_LEVEL + Math.floor(2 * smoothstep(-0.05, 0.55, continental));
    const riverBedNoise = 0.5 + 0.5 * fbm2(warpX - 377, warpZ + 229, this.seed ^ 0xa511e9b3, 1 / 74, 3);
    const broadChannel = smoothstep(0.12, 0.78, river);
    height = lerp(height, waterline - (2.5 + riverBedNoise * 2), broadChannel * 0.92);
    const swampWeight = smoothstep(0.7, 0.86, moisture) * smoothstep(0.38, 0.57, temperature) * (1 - smoothstep(SEA_LEVEL + 10, SEA_LEVEL + 18, height));
    height = lerp(height, SEA_LEVEL + 2 + 1.4 * fbm2(warpX, warpZ, this.seed ^ 0xe17a1465, 1 / 42, 2), swampWeight * 0.76);
    const dryWeight = smoothstep(0.6, 0.77, temperature) * (1 - smoothstep(0.23, 0.36, moisture));
    height += 3.6 * dryWeight * Math.pow(1 - Math.abs(fbm2(warpX, warpZ, this.seed ^ 0xa24baed4, 1 / 50, 3)), 2);
    // Fine relief is climate-weighted: dry shelves, wet hummocks, and cold
    // ridges now read differently without adding another biome lookup.
    const localRelief = fbm2(warpX + 53, warpZ - 91, this.seed ^ 0x4cf5ad43, 1 / 46, 3);
    const reliefAmplitude = 1.15 + dryWeight * 2.15 + moisture * 0.65 + mountain * 1.5;
    // Fine land relief fades toward the channel so it cannot accidentally
    // refill a river after the broad valley has been carved.
    height += localRelief * reliefAmplitude * (1 - smoothstep(0.2, 0.7, river) * 0.9);
    if (river > 0.52) {
      const channelDepth = 3 + Math.floor(smoothstep(0.52, 0.9, river) * 3 + riverBedNoise * 2);
      height = Math.min(height, waterline - channelDepth);
    }
    height = clamp(Math.round(height), MIN_Y + 7, MAX_Y - 8);

    let biome = BiomeId.Meadow;
    // River identity follows the channel field, not its freshly deepened bed;
    // checking ocean depth first would relabel every useful river as ocean.
    if (river > 0.52) biome = BiomeId.River;
    else if (height <= SEA_LEVEL - 23 && trenchField > 0.34) biome = BiomeId.LumenTrench;
    else if (height <= SEA_LEVEL - 10) biome = BiomeId.DeepOcean;
    else if (height <= SEA_LEVEL - 2) biome = temperature < 0.15 ? BiomeId.Snowfield : BiomeId.Ocean;
    else if (height <= SEA_LEVEL + 2) biome = BiomeId.Beach;
    else if (variant > 0.86 && mountain > 0.18 && temperature > 0.42) biome = BiomeId.Volcanic;
    else if (mountain > 0.36 || height >= 68) biome = temperature < 0.35 || height > 78 ? BiomeId.Snowfield : BiomeId.Highlands;
    else if (temperature < 0.2) biome = BiomeId.Snowfield;
    else if (temperature < 0.36 && moisture >= 0.42) biome = BiomeId.Frostpine;
    else if (temperature > 0.62 && moisture < 0.2 && variant > 0.52) biome = BiomeId.Badlands;
    else if (temperature > 0.64 && moisture < 0.3) biome = BiomeId.Desert;
    else if (temperature > 0.58 && moisture < 0.54) biome = BiomeId.Savanna;
    else if (height >= 42 && height <= 66 && temperature >= 0.3 && temperature <= 0.55 && moisture >= 0.68 && moisture <= 0.92 && variant < 0.58) biome = BiomeId.CloudreedGlen;
    else if (temperature > 0.57 && moisture > 0.72 && variant < 0.78) biome = BiomeId.RainveilJungle;
    else if (temperature >= 0.34 && temperature <= 0.62 && moisture > 0.55 && variant > 0.42 && variant < 0.68) biome = BiomeId.SakurabloomGrove;
    else if (moisture > 0.78 && height < SEA_LEVEL + 12) biome = variant > 0.82 ? BiomeId.MushroomFen : BiomeId.Siltfen;
    else if (moisture > 0.63 && variant > 0.72) biome = BiomeId.Bloomwood;
    else if (moisture > 0.54 && variant > 0.55) biome = BiomeId.Birchlight;
    else if (moisture > 0.56) biome = BiomeId.Wildwood;
    return { height, waterline, biome, temperature, moisture, continental, river, mountain };
  }

  generateChunk(cx: number, cz: number) {
    const key = chunkKey(cx, cz);
    const existing = this.chunks.get(key);
    if (existing) return existing;
    const chunk: Chunk = {
      key,
      cx,
      cz,
      blocks: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT),
      heightmap: new Int16Array(CHUNK_SIZE * CHUNK_SIZE),
      biomes: new Uint8Array(CHUNK_SIZE * CHUNK_SIZE),
      group: new THREE.Group(),
      sections: new Map(),
      dirty: new Set(),
      sectionBlockCounts: new Uint16Array(SECTION_COUNT),
      skyTops: new Int16Array(CHUNK_SIZE * CHUNK_SIZE).fill(MIN_Y - 1),
      lightIndices: new Set(),
      leafIndices: new Set(),
    };
    chunk.group.position.set(cx * CHUNK_SIZE, 0, cz * CHUNK_SIZE);
    this.group.add(chunk.group);
    const samples = new Map<string, ColumnSample>();
    const sample = (x: number, z: number) => {
      const sampleKey = `${x},${z}`;
      let value = samples.get(sampleKey);
      if (!value) { value = this.sampleColumn(x, z); samples.set(sampleKey, value); }
      return value;
    };
    const caveFrequency = this.generationOptions.caveFrequency;
    const resourceAbundance = this.generationOptions.resourceAbundance;

    for (let lx = 0; lx < CHUNK_SIZE; lx += 1) {
      for (let lz = 0; lz < CHUNK_SIZE; lz += 1) {
        const gx = cx * CHUNK_SIZE + lx;
        const gz = cz * CHUNK_SIZE + lz;
        const column = sample(gx, gz);
        chunk.heightmap[lx + lz * CHUNK_SIZE] = column.height;
        chunk.biomes[lx + lz * CHUNK_SIZE] = column.biome;
        const [top, filler] = this.surfaceBlocks(column.biome, column.height, column.temperature);
        const extraBedrock = 1 + Math.floor(hash2(gx, gz, this.seed ^ 0x4cf5ad43) * 4);
        const tunnelWarp = valueNoise2(gx / 76, gz / 76, this.seed ^ 0x91e10da5) * 4;
        const ravineLine = Math.abs(fbm2(gx, gz, this.seed ^ 0x165667c5, 1 / 230, 2));
        const ravineSegment = fbm2(gx, gz, this.seed ^ 0x9e3779f9, 1 / 520, 2);
        const ravineTop = column.height - 5;
        const ravineBottom = Math.max(MIN_Y + 5, column.height - 38);
        const waterTable = -4 + Math.floor(7 * fbm2(gx, gz, this.seed ^ 0x7ed55d16, 1 / 170, 2));
        const caveEntrance = caveFrequency > 0 ? caveEntranceAt(this.seed, gx, gz, column.height, column.waterline) : null;
        for (let y = MIN_Y; y <= Math.max(column.height, column.waterline); y += 1) {
          let type = BlockId.Air;
          if (y <= MIN_Y + extraBedrock) type = BlockId.Bedrock;
          else if (y <= column.height) {
            if (y === column.height) type = top;
            else if (y >= column.height - (column.biome === BiomeId.Desert || column.biome === BiomeId.Beach ? 5 : 3)) type = filler;
            else type = y < MIN_Y + 18 ? BlockId.Basalt : y < -10 ? BlockId.Deepstone : column.biome === BiomeId.Volcanic ? BlockId.Basalt : BlockId.Stone;

            const surfaceMouth = caveEntrance !== null && y >= caveEntrance.floorY && y <= column.height;
            if (caveFrequency > 0 && (y < column.height - 4 || surfaceMouth) && y > MIN_Y + 4) {
              const depth = column.height - y;
              const baseCheeseThreshold = lerp(0.5, 0.34, smoothstep(12, 52, depth));
              const cheeseThreshold = caveFrequency === 1 ? baseCheeseThreshold : baseCheeseThreshold + (1 - caveFrequency) * 0.1;
              const cheeseField = valueNoise3(gx / 42, y / 50, gz / 42, this.seed ^ 0x6d2b79f5) * 0.72
                + valueNoise3(gx / 18, y / 22, gz / 18, this.seed ^ 0x27d4eb2f) * 0.28;
              const cheese = cheeseField > cheeseThreshold;
              const spaghettiWidth = caveFrequency === 1 ? 0.052 : 0.052 * caveFrequency;
              const spaghettiDepth = caveFrequency === 1 ? 0.16 : 0.16 * Math.sqrt(caveFrequency);
              const spaghetti = Math.abs(Math.sin(gx * 0.115 + y * 0.083 + gz * 0.041 + tunnelWarp)) < spaghettiWidth
                && Math.abs(Math.sin(gz * 0.129 - y * 0.071 + gx * 0.033 - tunnelWarp)) < spaghettiDepth;
              const cavernThreshold = caveFrequency === 1 ? 0.47 : 0.47 + (1 - caveFrequency) * 0.08;
              const deepCavern = y < -24 && valueNoise3(gx / 68, y / 58, gz / 68, this.seed ^ 0x5bd1e995) > cavernThreshold
                && Math.sin(gx * 0.09 + gz * 0.07 + y * 0.11) > -0.05;
              const ravineP = (y - ravineBottom) / Math.max(1, ravineTop - ravineBottom);
              const ravineWidth = caveFrequency === 1 ? 0.02 : 0.02 * caveFrequency;
              const ravine = ravineSegment > 0.1 && y > ravineBottom && y < ravineTop && ravineLine < ravineWidth * (0.35 + 0.65 * Math.sin(Math.PI * ravineP));
              const feature = caveFeatureAt(this.seed, gx, y, gz, column.height, caveFrequency);
              if (cheese || spaghetti || deepCavern || ravine || feature.chamber || feature.chimney || surfaceMouth) {
                if (y <= MIN_Y + 7) type = BlockId.Lava;
                else if (y <= waterTable && valueNoise3(gx / 64, y / 58, gz / 64, this.seed ^ 0x94d049bd) > 0.28) type = BlockId.Water;
                else type = BlockId.Air;
              }
            }

            if (type === BlockId.Stone || type === BlockId.Deepstone || type === BlockId.Basalt) {
              const cellHash = hash3(Math.floor(gx / 2), Math.floor(y / 2), Math.floor(gz / 2), this.seed ^ 0x1234567);
              const detailHash = hash3(gx, y, gz, this.seed ^ 0x89abcdef);
              if (resourceAbundance === 1) {
                if (y < 66 && cellHash > 0.992 && detailHash > 0.25) type = BlockId.CoalOre;
                if (y < 48 && cellHash < 0.008 && detailHash > 0.3) type = BlockId.IronOre;
                if (y < 54 && cellHash > 0.983 && cellHash < 0.987 && detailHash > 0.35) type = BlockId.CopperOre;
                if (y < 8 && cellHash > 0.976 && cellHash < 0.9785 && detailHash > 0.4) type = BlockId.GoldOre;
                if (y < -24 && cellHash > 0.97 && cellHash < 0.9715 && detailHash > 0.5) type = BlockId.CrystalOre;
              } else {
                if (y < 66 && cellHash > 1 - 0.008 * resourceAbundance && detailHash > 0.25) type = BlockId.CoalOre;
                if (y < 48 && cellHash < 0.008 * resourceAbundance && detailHash > 0.3) type = BlockId.IronOre;
                if (y < 54 && Math.abs(cellHash - 0.985) < 0.002 * resourceAbundance && detailHash > 0.35) type = BlockId.CopperOre;
                if (y < 8 && Math.abs(cellHash - 0.97725) < 0.00125 * resourceAbundance && detailHash > 0.4) type = BlockId.GoldOre;
                if (y < -24 && Math.abs(cellHash - 0.97075) < 0.00075 * resourceAbundance && detailHash > 0.5) type = BlockId.CrystalOre;
              }
            }
            if (type === BlockId.Stone || type === BlockId.Deepstone || type === BlockId.Basalt) {
              const accent = hash3(Math.floor(gx / 3), Math.floor(y / 3), Math.floor(gz / 3), this.seed ^ 0x73a2d49b);
              const limestoneBiome = [BiomeId.Desert, BiomeId.Beach, BiomeId.Highlands, BiomeId.Savanna].includes(column.biome);
              const slateBiome = [BiomeId.Frostpine, BiomeId.Snowfield, BiomeId.Bloomwood, BiomeId.MushroomFen].includes(column.biome);
              if (limestoneBiome && y > column.height - 24 && accent > 0.58) type = BlockId.Limestone;
              else if (slateBiome && y < column.height - 12 && accent < 0.34) type = BlockId.MoonSlate;
            }
          } else if (y <= column.waterline) {
            type = column.temperature < 0.14 && y === column.waterline ? BlockId.Ice : BlockId.Water;
          }
          if (type !== BlockId.Air) chunk.blocks[blockIndex(lx, y, lz)] = type;
        }
      }
    }

    this.generateFeatures(chunk, sample);
    const saved = this.edits.get(key);
    if (saved) for (const [index, type] of saved.entries()) chunk.blocks[index] = type;
    const sectionVolume = CHUNK_SIZE * CHUNK_SIZE * SECTION_HEIGHT;
    for (let section = 0; section < SECTION_COUNT; section += 1) {
      const end = (section + 1) * sectionVolume;
      let occupied = 0;
      for (let index = section * sectionVolume; index < end; index += 1) {
        const type = chunk.blocks[index] as BlockId;
        if (type === BlockId.Air) continue;
        occupied += 1;
        if (LIGHT_BLOCKS.has(type)) chunk.lightIndices.add(index);
        if (LEAF_BLOCK_SET.has(type)) chunk.leafIndices.add(index);
        if (blocksSky(type)) chunk.skyTops[index % (CHUNK_SIZE * CHUNK_SIZE)] = MIN_Y + Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE));
      }
      chunk.sectionBlockCounts[section] = occupied;
    }
    this.chunks.set(key, chunk);
    return chunk;
  }

  surfaceBlocks(biome: BiomeId, height: number, temperature: number): [BlockId, BlockId] {
    if (biome === BiomeId.LumenTrench) return [BlockId.MoonSlate, hash2(height, biome, this.seed) > 0.45 ? BlockId.Deepstone : BlockId.Clay];
    if (biome === BiomeId.DeepOcean || biome === BiomeId.Ocean || biome === BiomeId.River) return [BlockId.Gravel, hash2(height, biome, this.seed) > 0.5 ? BlockId.Clay : BlockId.Sand];
    if (biome === BiomeId.Beach || biome === BiomeId.Desert) return [BlockId.Sand, BlockId.Sand];
    if (biome === BiomeId.Badlands) return [BlockId.RedSand, BlockId.SunbakedClay];
    if (biome === BiomeId.Siltfen || biome === BiomeId.MushroomFen) return [BlockId.SwampGrass, BlockId.Mud];
    if (biome === BiomeId.Savanna) return [BlockId.SavannaGrass, BlockId.Dirt];
    if (biome === BiomeId.Snowfield || (height > 72 && temperature < 0.48)) return [BlockId.SnowyGrass, BlockId.Dirt];
    if (biome === BiomeId.Volcanic) return [BlockId.Basalt, BlockId.Basalt];
    if (biome === BiomeId.Highlands) return [height > 76 ? BlockId.Snow : BlockId.Stone, BlockId.Stone];
    if (biome === BiomeId.Meadow) return [BlockId.MeadowGrass, BlockId.Dirt];
    if (biome === BiomeId.CloudreedGlen) return [BlockId.CloudreedGrass, BlockId.Dirt];
    if (biome === BiomeId.RainveilJungle) return [BlockId.JungleGrass, BlockId.Dirt];
    if (biome === BiomeId.SakurabloomGrove) return [BlockId.SakuraGrass, BlockId.Dirt];
    return [BlockId.Grass, BlockId.Dirt];
  }

  generateFeatures(chunk: Chunk, sample: (x: number, z: number) => ColumnSample) {
    const minX = chunk.cx * CHUNK_SIZE;
    const minZ = chunk.cz * CHUNK_SIZE;
    const inside = (x: number, z: number) => x >= minX && x < minX + CHUNK_SIZE && z >= minZ && z < minZ + CHUNK_SIZE;
    const legacyClearings: Array<Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>> = [];
    const set = (x: number, y: number, z: number, type: BlockId, onlyAir = true) => {
      if (!inside(x, z) || y < MIN_Y || y > MAX_Y) return;
      const lx = x - minX;
      const lz = z - minZ;
      const index = blockIndex(lx, y, lz);
      const current = chunk.blocks[index] as BlockId;
      // Generated flora may replace another plant, but never water/lava. This
      // keeps planned meadow flowers from plugging river surfaces.
      if (onlyAir && (current === BlockId.Water || current === BlockId.Lava)) return;
      if (!onlyAir || current === BlockId.Air || BLOCKS[current]?.replaceable) chunk.blocks[index] = type;
    };
    const clearGeneratedGrowth = (bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>) => {
      const startX = Math.max(minX, Math.floor(bounds.minX));
      const endX = Math.min(minX + CHUNK_SIZE - 1, Math.ceil(bounds.maxX));
      const startZ = Math.max(minZ, Math.floor(bounds.minZ));
      const endZ = Math.min(minZ + CHUNK_SIZE - 1, Math.ceil(bounds.maxZ));
      if (startX > endX || startZ > endZ) return;
      for (let x = startX; x <= endX; x += 1) for (let z = startZ; z <= endZ; z += 1) {
        const lx = x - minX;
        const lz = z - minZ;
        for (let y = MIN_Y; y <= MAX_Y; y += 1) {
          const index = blockIndex(lx, y, lz);
          const growth = chunk.blocks[index] as BlockId;
          if (GENERATED_GROWTH_BLOCK_SET.has(growth)) chunk.blocks[index] = isWaterloggedFloraBlock(growth) ? BlockId.Water : BlockId.Air;
        }
      }
    };

    const cellSize = 4;
    const plannedTreeLogs: TreePlanBlock[] = [];
    const plannedTreeLeaves: TreePlanBlock[] = [];
    const queueTreeBlock = (placement: TreePlanBlock) => {
      (LEAF_BLOCK_SET.has(placement.block) ? plannedTreeLeaves : plannedTreeLogs).push(placement);
    };
    for (let cellX = Math.floor((minX - 8) / cellSize); cellX <= Math.floor((minX + CHUNK_SIZE + 8) / cellSize); cellX += 1) {
      for (let cellZ = Math.floor((minZ - 8) / cellSize); cellZ <= Math.floor((minZ + CHUNK_SIZE + 8) / cellSize); cellZ += 1) {
        const x = cellX * cellSize + Math.floor(hash2(cellX, cellZ, this.seed ^ 0x11111111) * cellSize);
        const z = cellZ * cellSize + Math.floor(hash2(cellX, cellZ, this.seed ^ 0x22222222) * cellSize);
        if (x * x + z * z < 28) continue;
        const column = sample(x, z);
        if (caveEntranceAt(this.seed, x, z, column.height, column.waterline)) continue;
        const roll = hash2(cellX, cellZ, this.seed ^ 0x33333333);
        const density: Partial<Record<BiomeId, number>> = {
          [BiomeId.Meadow]: 0.06,
          [BiomeId.Wildwood]: 0.42,
          [BiomeId.Frostpine]: 0.33,
          [BiomeId.Savanna]: 0.11,
          [BiomeId.Siltfen]: 0.2,
          [BiomeId.Birchlight]: 0.34,
          [BiomeId.Bloomwood]: 0.38,
          [BiomeId.Snowfield]: 0.07,
          [BiomeId.MushroomFen]: 0.23,
          [BiomeId.CloudreedGlen]: 0.16,
          [BiomeId.RainveilJungle]: 0.5,
          [BiomeId.SakurabloomGrove]: 0.36,
        };
        if (roll < (density[column.biome] ?? 0) && column.height > column.waterline + 1) {
          const trunk = column.biome === BiomeId.Frostpine || column.biome === BiomeId.Snowfield ? BlockId.PineLog
            : column.biome === BiomeId.Birchlight ? BlockId.BirchLog
              : column.biome === BiomeId.Bloomwood ? BlockId.BloomLog
                : column.biome === BiomeId.RainveilJungle ? BlockId.JungleLog
                  : column.biome === BiomeId.SakurabloomGrove ? BlockId.SakuraLog
                    : column.biome === BiomeId.CloudreedGlen ? BlockId.BirchLog : BlockId.WildwoodLog;
          const leaves = trunk === BlockId.PineLog ? BlockId.PineLeaves
            : trunk === BlockId.BirchLog ? BlockId.BirchLeaves
              : trunk === BlockId.BloomLog ? BlockId.BloomLeaves
                : trunk === BlockId.JungleLog ? BlockId.JungleLeaves
                  : trunk === BlockId.SakuraLog ? BlockId.SakuraLeaves : BlockId.WildwoodLeaves;
          const height = trunk === BlockId.PineLog ? 6 + Math.floor(hash2(x, z, this.seed) * 3) : 4 + Math.floor(hash2(x, z, this.seed) * 3);
          if (trunk === BlockId.PineLog) {
            for (let y = 1; y <= height; y += 1) queueTreeBlock({ x, y: column.height + y, z, block: trunk });
            for (let dy = -3; dy <= 1; dy += 1) {
              const radius = dy % 2 === 0 ? 2 : 1;
              for (let dx = -radius; dx <= radius; dx += 1) for (let dz = -radius; dz <= radius; dz += 1) if (Math.abs(dx) + Math.abs(dz) <= radius + 1) {
                queueTreeBlock({ x: x + dx, y: column.height + height + dy, z: z + dz, block: leaves });
              }
            }
          } else {
            const formRoll = hash2(x, z, this.seed ^ 0x51a6c72d);
            const form: TreeForm = column.biome === BiomeId.RainveilJungle && formRoll > 0.42 ? "ancient"
              : formRoll > 0.975 ? "ancient"
              : column.biome === BiomeId.CloudreedGlen || formRoll > 0.77 ? "windswept"
                : formRoll > 0.45 ? "layered" : "rounded";
            for (const planned of planFullTree(`${this.seedText}:${x},${z}`, { x, y: column.height + 1, z }, form, trunk, leaves)) {
              queueTreeBlock(planned);
            }
          }
        }
      }
    }

    // Compose every overlapping tree with explicit wood priority. Applying all
    // logs first and leaves through the replaceable-only path prevents a later
    // crown from cutting a leaf-shaped hole through an earlier trunk.
    for (const planned of plannedTreeLogs) set(planned.x, planned.y, planned.z, planned.block, false);
    for (const planned of plannedTreeLeaves) set(planned.x, planned.y, planned.z, planned.block, true);

    for (let lx = 0; lx < CHUNK_SIZE; lx += 1) for (let lz = 0; lz < CHUNK_SIZE; lz += 1) {
      const x = minX + lx;
      const z = minZ + lz;
      const column = sample(x, z);
      if (column.height <= column.waterline) continue;
      if (caveEntranceAt(this.seed, x, z, column.height, column.waterline)) continue;
      const aboveIndex = blockIndex(lx, column.height + 1, lz);
      if (chunk.blocks[aboveIndex] !== BlockId.Air) continue;
      const roll = hash2(x, z, this.seed ^ 0x44444444);
      if (column.biome === BiomeId.Desert && roll > 0.985) {
        const cactusHeight = 2 + Math.floor(hash2(x, z, this.seed ^ 0x55555555) * 3);
        for (let y = 1; y <= cactusHeight; y += 1) set(x, column.height + y, z, BlockId.Cactus);
      } else if (column.biome === BiomeId.Beach) {
        if (roll > 0.986) set(x, column.height + 1, z, BlockId.CoastAster);
        else if (roll > 0.965) set(x, column.height + 1, z, BlockId.Saltbrush);
      } else if ([BiomeId.Meadow, BiomeId.Wildwood, BiomeId.Birchlight, BiomeId.Bloomwood, BiomeId.Savanna, BiomeId.Siltfen, BiomeId.CloudreedGlen, BiomeId.RainveilJungle, BiomeId.SakurabloomGrove].includes(column.biome)) {
        const patch = 0.72 * valueNoise2(x / 19, z / 19, this.seed ^ 0x35f1a93b) + 0.28 * valueNoise2(x / 6, z / 6, this.seed ^ 0x6c8e9cf5);
        const density = column.biome === BiomeId.Meadow ? 0.72 : column.biome === BiomeId.Bloomwood ? 0.79 : column.biome === BiomeId.Savanna ? 0.9 : 0.84;
        if (roll + patch * 0.11 <= density) continue;
        const flowerBias = column.biome === BiomeId.Meadow || column.biome === BiomeId.Bloomwood || column.biome === BiomeId.CloudreedGlen || column.biome === BiomeId.SakurabloomGrove;
        const wheatPatch = hash2(x, z, this.seed ^ 0x7a9d35f1) > 0.986;
        const plant = column.biome === BiomeId.RainveilJungle && roll > 0.972 ? BlockId.LanternLotus
          : column.biome === BiomeId.RainveilJungle && roll > 0.88 ? BlockId.RainveilFern
            : column.biome === BiomeId.SakurabloomGrove && roll > 0.974 ? BlockId.Dreamblossom
              : column.biome === BiomeId.SakurabloomGrove && roll > 0.89 ? BlockId.SakuraBloom
                : column.biome === BiomeId.Siltfen && roll > 0.988 ? BlockId.MoonriceCrop
                  : column.biome === BiomeId.Savanna && roll > 0.992 ? BlockId.SunrootCrop
                    : column.biome === BiomeId.CloudreedGlen && roll > 0.955 ? BlockId.Cloudbell
          : column.biome === BiomeId.CloudreedGlen && roll > 0.905 ? BlockId.TallGrass
            : flowerBias && roll > 0.965 ? BlockId.BlueFlower
              : flowerBias && roll > 0.925 ? BlockId.RedFlower
                : wheatPatch ? BlockId.WheatCrop : BlockId.TallGrass;
        set(x, column.height + 1, z, plant);
      } else if (column.biome === BiomeId.MushroomFen && roll > 0.9) {
        set(x, column.height + 1, z, BlockId.MushroomCap);
      }
    }

    if (this.generationOptions.structures) {
      const regionSize = 96;
      for (let rx = Math.floor((minX - 10) / regionSize); rx <= Math.floor((minX + CHUNK_SIZE + 10) / regionSize); rx += 1) {
        for (let rz = Math.floor((minZ - 10) / regionSize); rz <= Math.floor((minZ + CHUNK_SIZE + 10) / regionSize); rz += 1) {
          if (hash2(rx, rz, this.seed ^ 0x66666666) < 0.62) continue;
          const x = rx * regionSize + 18 + Math.floor(hash2(rx, rz, this.seed ^ 0x77777777) * (regionSize - 36));
          const z = rz * regionSize + 18 + Math.floor(hash2(rx, rz, this.seed ^ 0x88888888) * (regionSize - 36));
          const column = sample(x, z);
          if (column.height <= column.waterline + 2 || [BiomeId.Ocean, BiomeId.DeepOcean, BiomeId.River].includes(column.biome)) continue;
          const cabin = hash2(rx, rz, this.seed ^ 0x99999999) > 0.63 && [BiomeId.Wildwood, BiomeId.Birchlight, BiomeId.Frostpine].includes(column.biome);
          const legacyClearing = { minX: x - 6, maxX: x + 6, minZ: z - 6, maxZ: z + 6 } as const;
          legacyClearings.push(legacyClearing);
          clearGeneratedGrowth(legacyClearing);
          if (cabin) {
            for (let dx = -3; dx <= 3; dx += 1) for (let dz = -3; dz <= 3; dz += 1) set(x + dx, column.height, z + dz, BlockId.Planks, false);
            for (let dy = 1; dy <= 3; dy += 1) for (let dx = -3; dx <= 3; dx += 1) for (let dz = -3; dz <= 3; dz += 1) {
              const wall = Math.abs(dx) === 3 || Math.abs(dz) === 3;
              if (wall && !(dz === -3 && dx === 0 && dy < 3)) set(x + dx, column.height + dy, z + dz, (Math.abs(dx) === 3 && Math.abs(dz) === 3) ? BlockId.WildwoodLog : BlockId.Planks, false);
            }
            for (let dx = -4; dx <= 4; dx += 1) for (let dz = -4; dz <= 4; dz += 1) set(x + dx, column.height + 4 + (Math.abs(dx) <= 2 && Math.abs(dz) <= 2 ? 1 : 0), z + dz, BlockId.Planks);
            set(x - 2, column.height + 1, z + 1, BlockId.CraftingTable, false);
            set(x + 2, column.height + 1, z + 1, BlockId.Chest, false);
            set(x, column.height + 1, z - 3, BlockId.DoorClosedLower, false);
            set(x, column.height + 2, z - 3, BlockId.DoorClosedUpper, false);
            set(x, column.height + 2, z + 2, BlockId.TorchWallNorth, false);
            set(x - 1, column.height + 1, z, BlockId.WildwoodTable, false);
            set(x - 2, column.height + 1, z, BlockId.WildwoodStool, false);
            set(x + 2, column.height + 1, z - 1, BlockId.WildwoodShelf, false);
            set(x + 2, column.height + 1, z + 2, BlockId.SealedBarrel, false);
          } else {
            for (let dx = -2; dx <= 2; dx += 1) for (let dz = -2; dz <= 2; dz += 1) if (Math.abs(dx) === 2 || Math.abs(dz) === 2 || (dx === 0 && dz === 0)) set(x + dx, column.height, z + dz, hash2(x + dx, z + dz, this.seed) > 0.25 ? BlockId.StoneBrick : BlockId.Moss, false);
            for (let dy = 1; dy <= 4; dy += 1) set(x, column.height + dy, z, dy === 4 ? BlockId.Glowstone : BlockId.StoneBrick, false);
            set(x + 2, column.height + 1, z + 2, BlockId.Chest, false);
          }
        }
      }
    }

    const mapVegetationBlock = (placement: PlannedBlock) => {
      if (placement.variant === "dry-shrub") return BlockId.DesertShrub;
      if (placement.variant === "buttercup" || placement.variant === "butterfly-host") return BlockId.Sunpetal;
      if (placement.variant === "violet-star") return BlockId.MoonOrchid;
      return placement.block;
    };
    const centerBiome = sample(minX + CHUNK_SIZE / 2, minZ + CHUNK_SIZE / 2).biome;
    if (centerBiome === BiomeId.Desert || centerBiome === BiomeId.Badlands || centerBiome === BiomeId.Meadow) {
      const vegetation = planBiomeVegetation({
        seed: this.seedText,
        biome: centerBiome === BiomeId.Meadow ? "meadow" : "desert",
        chunkX: chunk.cx,
        chunkZ: chunk.cz,
        surfaceYAt: (x, z) => sample(x, z).height,
      });
      for (const placement of vegetation.placements) {
        const column = sample(placement.x, placement.z);
        const inWaterway = column.height <= column.waterline
          || [BiomeId.DeepOcean, BiomeId.Ocean, BiomeId.River].includes(column.biome);
        const inLegacyClearing = legacyClearings.some((bounds) => placement.x >= bounds.minX && placement.x <= bounds.maxX
          && placement.z >= bounds.minZ && placement.z <= bounds.maxZ);
        if (inWaterway || inLegacyClearing) continue;
        set(placement.x, placement.y, placement.z, mapVegetationBlock(placement));
      }
    }

    // Aquatic flora is stored as a real waterlogged block rather than a
    // renderer-only decoration. It can therefore be targeted, harvested,
    // replanted and grown without removing the source-water contract.
    for (let lx = 0; lx < CHUNK_SIZE; lx += 1) for (let lz = 0; lz < CHUNK_SIZE; lz += 1) {
      const x = minX + lx;
      const z = minZ + lz;
      const column = sample(x, z);
      const waterDepth = column.waterline - column.height;
      if (waterDepth < 2) continue;
      const habitat = column.biome === BiomeId.LumenTrench ? "lumen-trench"
        : column.biome === BiomeId.DeepOcean ? "deep-ocean"
          : column.biome === BiomeId.Ocean ? "ocean"
            : column.biome === BiomeId.Beach ? "coast"
              : column.biome === BiomeId.River ? "river" : null;
      if (!habitat) continue;
      for (const placement of planSubmergedFlora(this.seedText, x, column.height, z, waterDepth, habitat)) {
        const current = chunk.blocks[blockIndex(lx, placement.y, lz)] as BlockId;
        if (current === BlockId.Water) set(placement.x, placement.y, placement.z, placement.block, false);
      }
    }

    if (this.generationOptions.structures) {
      // Named plans can span one chunk seam, so every chunk also inspects the
      // eight neighboring candidate chunks and applies only its own slice.
      for (let originCx = chunk.cx - 1; originCx <= chunk.cx + 1; originCx += 1) {
        for (let originCz = chunk.cz - 1; originCz <= chunk.cz + 1; originCz += 1) {
          const originX = originCx * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
          const originZ = originCz * CHUNK_SIZE + Math.floor(CHUNK_SIZE / 2);
          const originColumn = sample(originX, originZ);
          const structureBiome = structureBiomeFromId(originColumn.biome);
          if (!structureBiome || originColumn.height <= originColumn.waterline + 2) continue;
          const kind = structureCandidateForChunk({ seed: this.seedText, chunkX: originCx, chunkZ: originCz, biome: structureBiome });
          if (!kind) continue;
          const plan = planStructure(kind, { x: originX, y: originColumn.height, z: originZ }, this.seedText);
          clearGeneratedGrowth(structureClearanceBounds(plan));
          const amenities = planPoiAmenities(kind, plan.origin).filter((placement) =>
            splitCoordinate(placement.x).chunk === chunk.cx && splitCoordinate(placement.z).chunk === chunk.cz);
          for (const placement of [...structurePlacementsForChunk(plan, chunk.cx, chunk.cz, CHUNK_SIZE), ...amenities]) {
            let type = placement.block;
            if (kind === "desert-temple" && (type === BlockId.StoneBrick || type === BlockId.Sand)) type = BlockId.TempleSandstone;
            else if (kind === "forest-temple" && placement.variant === "root-altar") type = BlockId.RuneStone;
            else if ((kind === "sunbun-grove" || kind === "meadow-butterfly-sanctuary") && type === BlockId.Grass) type = BlockId.MeadowGrass;
            else if (kind === "sunbun-grove" && placement.variant === "golden-clover") type = BlockId.BananaPlant;
            else if (kind === "meadow-butterfly-sanctuary" && placement.variant === "buttercup") type = BlockId.Sunpetal;
            else if (kind === "meadow-butterfly-sanctuary" && placement.variant === "violet-star") type = BlockId.MoonOrchid;
            set(placement.x, placement.y, placement.z, type, false);
          }
          for (const marker of structureMarkersForChunk(plan, chunk.cx, chunk.cz, CHUNK_SIZE)) this.structureMarkers.set(`${plan.id}:${marker.type}:${marker.id}`, marker);
        }
      }
    }
    if (this.generationOptions.structures) this.generateSettlementsForChunk(chunk, sample, set, clearGeneratedGrowth);
  }

  private generateSettlementsForChunk(
    chunk: Chunk,
    sample: (x: number, z: number) => ColumnSample,
    set: (x: number, y: number, z: number, type: BlockId, onlyAir?: boolean) => void,
    clearGeneratedGrowth: (bounds: Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>) => void,
  ) {
    const minX = chunk.cx * CHUNK_SIZE;
    const minZ = chunk.cz * CHUNK_SIZE;
    const regionSize = 32 * CHUNK_SIZE;
    const reach = SETTLEMENT_SIZE_RULES.town.radiusBlocks + 3;
    const startRegionX = Math.floor((minX - reach) / regionSize);
    const endRegionX = Math.floor((minX + CHUNK_SIZE + reach) / regionSize);
    const startRegionZ = Math.floor((minZ - reach) / regionSize);
    const endRegionZ = Math.floor((minZ + CHUNK_SIZE + reach) / regionSize);
    const insideChunk = (x: number, z: number) => x >= minX && x < minX + CHUNK_SIZE && z >= minZ && z < minZ + CHUNK_SIZE;

    for (let regionX = startRegionX; regionX <= endRegionX; regionX += 1) for (let regionZ = startRegionZ; regionZ <= endRegionZ; regionZ += 1) {
      const probe = sample(regionX * regionSize + regionSize / 2, regionZ * regionSize + regionSize / 2);
      const probeBiome = settlementBiomeFromId(probe.biome);
      if (!probeBiome) continue;
      const plannedCandidate = planSettlementCandidate({ worldSeed: this.seedText, regionX, regionZ, biome: probeBiome, existing: [], floorY: probe.height });
      if (!plannedCandidate) continue;
      const centerColumn = sample(plannedCandidate.center.x, plannedCandidate.center.z);
      const actualBiome = settlementBiomeFromId(centerColumn.biome);
      const underwater = plannedCandidate.environment === "underwater";
      if (!actualBiome || actualBiome !== plannedCandidate.biome) continue;
      if (underwater ? centerColumn.height >= centerColumn.waterline - 5 : centerColumn.height <= centerColumn.waterline + 3) continue;
      const nearbyHeights = [[4, 0], [-4, 0], [0, 4], [0, -4]].map(([dx, dz]) => sample(plannedCandidate.center.x + dx, plannedCandidate.center.z + dz).height);
      if (nearbyHeights.some((height) => Math.abs(height - centerColumn.height) > (underwater ? 7 : 4))) continue;

      // Region-center terrain only selects a deterministic candidate. Aquatic
      // geometry must be authored from the actual settlement-center seabed or
      // a shallower probe can lift an entire town through the ocean surface.
      const candidate: SettlementCandidate = underwater ? {
        ...plannedCandidate,
        floorY: centerColumn.height,
        center: { ...plannedCandidate.center, y: centerColumn.height + 2 },
      } : plannedCandidate;
      const plannedLayout = planSettlementLayout(candidate);
      const layout = underwater ? fitUnderwaterSettlementLayout(plannedLayout, sample) : plannedLayout;
      if (!layout) continue;
      this.settlementPlans.set(candidate.id, { candidate, layout });
      const bounds = {
        minX: candidate.center.x - layout.radiusBlocks - 2,
        maxX: candidate.center.x + layout.radiusBlocks + 2,
        minZ: candidate.center.z - layout.radiusBlocks - 2,
        maxZ: candidate.center.z + layout.radiusBlocks + 2,
      };
      if (bounds.maxX < minX || bounds.minX >= minX + CHUNK_SIZE || bounds.maxZ < minZ || bounds.minZ >= minZ + CHUNK_SIZE) continue;
      clearGeneratedGrowth(bounds);

      const pathBlock = candidate.factionId === "hobbits" ? BlockId.Gravel : candidate.factionId === "atlantians" ? BlockId.StarCoral : BlockId.GoblinBrasswork;
      for (const point of layout.paths) if (insideChunk(point.x, point.z)) {
        const column = sample(point.x, point.z);
        if (underwater) set(point.x, point.y ?? column.height + 1, point.z, pathBlock, false);
        else if (column.height > column.waterline) set(point.x, column.height, point.z, pathBlock, false);
      }

      const wallBlock = candidate.factionId === "hobbits" ? BlockId.WildwoodFence : BlockId.GoblinBrasswork;
      for (const node of layout.wall) if (insideChunk(node.position.x, node.position.z)) {
        const ground = sample(node.position.x, node.position.z).height;
        set(node.position.x, ground + 1, node.position.z, wallBlock, false);
        if (node.kind === "tower") {
          set(node.position.x, ground + 2, node.position.z, candidate.factionId === "hobbits" ? BlockId.WildwoodLog : BlockId.GoblinBrasswork, false);
          set(node.position.x, ground + 3, node.position.z, BlockId.Torch, false);
        }
      }
      for (const gate of layout.gates) if (insideChunk(gate.position.x, gate.position.z)) {
        const ground = sample(gate.position.x, gate.position.z).height;
        const gateBlock = gate.facing % 2 === 0 ? BlockId.FenceGateNorthSouthClosed : BlockId.FenceGateEastWestClosed;
        set(gate.position.x, ground + 1, gate.position.z, gateBlock, false);
      }
      for (const light of layout.lights) if (insideChunk(light.position.x, light.position.z)) {
        const ground = sample(light.position.x, light.position.z).height;
        if (underwater) set(light.position.x, light.position.y ?? ground + 2, light.position.z, BlockId.Glowstone, false);
        else {
          set(light.position.x, ground + 1, light.position.z, candidate.factionId === "hobbits" ? BlockId.WildwoodFence : BlockId.GoblinBrasswork, false);
          set(light.position.x, ground + 2, light.position.z, BlockId.Torch, false);
        }
      }

      const wallMaterial = candidate.factionId === "hobbits" ? BlockId.Planks : candidate.factionId === "atlantians" ? BlockId.Glass : BlockId.GoblinBrasswork;
      const cornerMaterial = candidate.factionId === "hobbits" ? BlockId.WildwoodLog : candidate.factionId === "atlantians" ? BlockId.MoonSlate : BlockId.StoneBrick;
      const roofMaterial = candidate.factionId === "hobbits" ? BlockId.HobbitThatch : candidate.factionId === "atlantians" ? BlockId.StarCoral : BlockId.GoblinBrasswork;
      for (const building of layout.buildings) {
        const halfWidth = Math.floor(building.width / 2);
        const halfDepth = Math.floor(building.depth / 2);
        const buildingBounds = {
          minX: building.position.x - halfWidth,
          maxX: building.position.x + halfWidth,
          minZ: building.position.z - halfDepth,
          maxZ: building.position.z + halfDepth,
        };
        if (buildingBounds.maxX < minX || buildingBounds.minX >= minX + CHUNK_SIZE || buildingBounds.maxZ < minZ || buildingBounds.minZ >= minZ + CHUNK_SIZE) continue;
        const baseY = underwater
          ? Math.max(sample(building.position.x, building.position.z).height + 1, (building.position.y ?? candidate.floorY ?? centerColumn.height) - 1)
          : sample(building.position.x, building.position.z).height;
        const wallHeight = building.floors * 3 + 1;
        for (let x = buildingBounds.minX; x <= buildingBounds.maxX; x += 1) for (let z = buildingBounds.minZ; z <= buildingBounds.maxZ; z += 1) {
          if (!insideChunk(x, z)) continue;
          if (underwater) {
            const edgeX = x === buildingBounds.minX || x === buildingBounds.maxX;
            const edgeZ = z === buildingBounds.minZ || z === buildingBounds.maxZ;
            const corner = edgeX && edgeZ;
            const arch = edgeX || edgeZ;
            if (arch) set(x, baseY, z, BlockId.MoonSlate, false);
            if (corner) for (let y = 1; y <= Math.min(4, wallHeight); y += 1) set(x, baseY + y, z, cornerMaterial, false);
            else if (arch && ((x + z) & 3) === 0) set(x, baseY + 2, z, wallMaterial, false);
            if (arch && ((Math.abs(x - building.position.x) + Math.abs(z - building.position.z)) & 1) === 0) {
              set(x, baseY + Math.min(5, wallHeight), z, roofMaterial, false);
            }
            continue;
          }
          const localHeight = sample(x, z).height;
          for (let y = Math.min(localHeight + 1, baseY); y <= baseY; y += 1) set(x, y, z, cornerMaterial, false);
          for (let y = baseY + 1; y <= Math.max(baseY + wallHeight + 2, localHeight + 2); y += 1) set(x, y, z, BlockId.Air, false);
          set(x, baseY, z, building.role === "mayor-hall" ? BlockId.StoneBrick : BlockId.Planks, false);
          const edgeX = x === buildingBounds.minX || x === buildingBounds.maxX;
          const edgeZ = z === buildingBounds.minZ || z === buildingBounds.maxZ;
          if (edgeX || edgeZ) for (let y = 1; y <= wallHeight; y += 1) {
            const corner = edgeX && edgeZ;
            const window = !corner && y % 3 === 2 && ((x + z) & 3) === 0;
            set(x, baseY + y, z, window ? BlockId.Glass : corner ? cornerMaterial : wallMaterial, false);
          }
          set(x, baseY + wallHeight + 1 + ((Math.abs(x - building.position.x) + Math.abs(z - building.position.z)) % 3 === 0 ? 1 : 0), z, roofMaterial, false);
        }
        const doorX = building.position.x;
        const doorZ = buildingBounds.minZ;
        if (!underwater && insideChunk(doorX, doorZ)) {
          set(doorX, baseY + 1, doorZ, BlockId.DoorClosedLower, false);
          set(doorX, baseY + 2, doorZ, BlockId.DoorClosedUpper, false);
        }
        for (const furniture of building.furniture) if (insideChunk(furniture.position.x, furniture.position.z)) {
          const fy = underwater ? furniture.position.y ?? baseY + 1 : baseY + 1;
          const furnitureBlock = furniture.kind === "rest-alcove" || furniture.kind === "nest" ? BlockId.HearthChair
            : furniture.kind === "kelp-trough" ? BlockId.LumenKelp
              : furniture.kind === "coral-loom" ? BlockId.CartographyTable
                : furniture.kind === "pearl-counter" ? BlockId.Chest
                  : furniture.kind === "glow-basin" ? BlockId.AlchemyStand
                    : furniture.kind === "bed" ? BlockId.BedNorthFoot
            : furniture.kind === "chair" ? BlockId.HearthChair
              : furniture.kind === "distillery" || furniture.kind === "barrel" ? BlockId.Distillery
                : furniture.kind === "forge" ? BlockId.Furnace
                  : furniture.kind === "bank-counter" || furniture.kind === "merchant-counter" ? BlockId.Chest
                    : furniture.kind === "table" ? BlockId.CartographyTable
                      : BlockId.CraftingTable;
          set(furniture.position.x, fy, furniture.position.z, furnitureBlock, false);
          if (furniture.kind === "bed") set(furniture.position.x, fy, furniture.position.z + 1, BlockId.BedNorthHead, false);
        }
      }

      if (insideChunk(candidate.center.x, candidate.center.z)) {
        const marker: StructureMarker = {
          type: "landmark",
          id: candidate.id,
          position: { x: candidate.center.x, y: candidate.center.y ?? centerColumn.height + 2, z: candidate.center.z },
          tag: `settlement:${candidate.factionId}:${candidate.size}`,
        };
        this.structureMarkers.set(`${candidate.id}:landmark:${candidate.id}`, marker);
      }
      const state = createSettlementState("world", candidate, layout);
      for (const resident of state.residents) if (insideChunk(resident.position.x, resident.position.z)) {
        const mobKind = settlementResidentMobKind(resident, candidate.factionId);
        const marker: StructureMarker = {
          type: "spawn",
          id: resident.id,
          position: { x: resident.position.x, y: resident.position.y ?? sample(resident.position.x, resident.position.z).height + 1, z: resident.position.z },
          mobKind,
          count: 1,
          radius: 1.5,
          persistent: true,
          tags: [`settlement:${candidate.id}`, `resident:${resident.id}`, `name:${resident.name}`, `profession:${resident.profession}`, `faction:${candidate.factionId}`],
        };
        this.structureMarkers.set(`${candidate.id}:spawn:${resident.id}`, marker);
      }
      for (const creature of state.alignedCreatures) if (insideChunk(creature.position.x, creature.position.z)) {
        const marker: StructureMarker = {
          type: "spawn",
          id: creature.id,
          position: { x: creature.position.x, y: sample(creature.position.x, creature.position.z).height + 1, z: creature.position.z },
          mobKind: "warg",
          count: 1,
          radius: 2.5,
          persistent: true,
          tags: [`settlement:${candidate.id}`, `faction:goblins`, "aligned:true"],
        };
        this.structureMarkers.set(`${candidate.id}:spawn:${creature.id}`, marker);
      }
    }
  }

  structureMarkersNear(x: number, y: number, z: number, radius = 48) {
    const radiusSquared = radius * radius;
    return [...this.structureMarkers.entries()].filter(([, marker]) => {
      const dx = marker.position.x - x;
      const dy = marker.position.y - y;
      const dz = marker.position.z - z;
      return dx * dx + dy * dy + dz * dz <= radiusSquared;
    });
  }

  structureMarkerAt(x: number, y: number, z: number, type?: StructureMarker["type"]) {
    return [...this.structureMarkers.entries()].find(([, marker]) => marker.position.x === x && marker.position.y === y && marker.position.z === z && (!type || marker.type === type));
  }

  getBlock(x: number, y: number, z: number): BlockId | undefined {
    if (y > MAX_Y) return BlockId.Air;
    if (y < MIN_Y) return BlockId.Bedrock;
    const sx = splitCoordinate(x);
    const sz = splitCoordinate(z);
    const chunk = this.chunks.get(chunkKey(sx.chunk, sz.chunk));
    if (!chunk) return undefined;
    return chunk.blocks[blockIndex(sx.local, y, sz.local)] as BlockId;
  }

  getBlockForMesh(x: number, y: number, z: number) {
    return this.getBlock(x, y, z) ?? BlockId.Air;
  }

  writeChunkBlock(chunk: Chunk, index: number, type: BlockId) {
    const previous = chunk.blocks[index] as BlockId;
    if (previous === type) return;
    chunk.blocks[index] = type;
    const columnArea = CHUNK_SIZE * CHUNK_SIZE;
    const section = Math.floor(index / (columnArea * SECTION_HEIGHT));
    const column = index % columnArea;
    const y = MIN_Y + Math.floor(index / columnArea);
    if (previous === BlockId.Air && type !== BlockId.Air) chunk.sectionBlockCounts[section] += 1;
    else if (previous !== BlockId.Air && type === BlockId.Air) chunk.sectionBlockCounts[section] -= 1;
    if (LIGHT_BLOCKS.has(type)) chunk.lightIndices.add(index);
    else chunk.lightIndices.delete(index);
    if (LEAF_BLOCK_SET.has(type)) chunk.leafIndices.add(index);
    else chunk.leafIndices.delete(index);
    const previousBlockedSky = blocksSky(previous);
    const nextBlocksSky = blocksSky(type);
    const previousSkyTop = chunk.skyTops[column];
    if (nextBlocksSky && y > previousSkyTop) chunk.skyTops[column] = y;
    else if (previousBlockedSky && !nextBlocksSky && chunk.skyTops[column] === y) {
      let nextTop = MIN_Y - 1;
      for (let scanY = y - 1, scanIndex = index - columnArea; scanY >= MIN_Y; scanY -= 1, scanIndex -= columnArea) {
        if (!blocksSky(chunk.blocks[scanIndex] as BlockId)) continue;
        nextTop = scanY;
        break;
      }
      chunk.skyTops[column] = nextTop;
    }
    if (chunk.skyTops[column] !== previousSkyTop) {
      // The edited block itself is still rebuilt synchronously by the caller.
      // Lower sections update through the normal bounded mesh queue so a roof
      // can darken an entire column without creating a one-frame hitch.
      for (let affectedSection = 0; affectedSection <= section; affectedSection += 1) this.queueMesh(chunk.key, affectedSection);
    }
  }

  skyTopAt(x: number, z: number) {
    const sx = splitCoordinate(x);
    const sz = splitCoordinate(z);
    const chunk = this.chunks.get(chunkKey(sx.chunk, sz.chunk));
    return chunk?.skyTops[sx.local + sz.local * CHUNK_SIZE];
  }

  setBlock(x: number, y: number, z: number, type: BlockId, record = true, immediate = false) {
    if (y < MIN_Y || y > MAX_Y) return false;
    const sx = splitCoordinate(x);
    const sz = splitCoordinate(z);
    const key = chunkKey(sx.chunk, sz.chunk);
    const chunk = this.chunks.get(key) ?? this.generateChunk(sx.chunk, sz.chunk);
    const index = blockIndex(sx.local, y, sz.local);
    const resolvedType = type === BlockId.Air && isWaterloggedFloraBlock(chunk.blocks[index] as BlockId) ? BlockId.Water : type;
    this.writeChunkBlock(chunk, index, resolvedType);
    if (record) {
      let edits = this.edits.get(key);
      if (!edits) { edits = new Map(); this.edits.set(key, edits); }
      edits.set(index, resolvedType);
    }
    this.refreshEditedBlock(sx.chunk, sz.chunk, sx.local, y, sz.local, immediate);
    return true;
  }

  setChestVisualHidden(x: number, y: number, z: number, hidden: boolean) {
    const visualKey = `${x},${y},${z}`;
    if (this.hiddenChestVisuals.has(visualKey) === hidden) return false;
    if (hidden) this.hiddenChestVisuals.add(visualKey);
    else this.hiddenChestVisuals.delete(visualKey);

    const sx = splitCoordinate(x);
    const sz = splitCoordinate(z);
    const key = chunkKey(sx.chunk, sz.chunk);
    const chunk = this.chunks.get(key);
    if (!chunk) return true;
    const section = sectionForY(y);
    if (chunk.group.visible) {
      this.cancelQueuedMesh(key, section);
      this.rebuildSection(chunk, section);
    } else this.queueMesh(key, section, true);
    return true;
  }

  setBlocksBatch(changes: Array<{ x: number; y: number; z: number; type: BlockId }>, record = true, immediate = false) {
    const affected = new Set<string>();
    for (const change of changes) {
      if (change.y < MIN_Y || change.y > MAX_Y) continue;
      const sx = splitCoordinate(change.x);
      const sz = splitCoordinate(change.z);
      const key = chunkKey(sx.chunk, sz.chunk);
      const chunk = this.chunks.get(key) ?? this.generateChunk(sx.chunk, sz.chunk);
      const index = blockIndex(sx.local, change.y, sz.local);
      const resolvedType = change.type === BlockId.Air && isWaterloggedFloraBlock(chunk.blocks[index] as BlockId) ? BlockId.Water : change.type;
      this.writeChunkBlock(chunk, index, resolvedType);
      if (record) {
        let edits = this.edits.get(key);
        if (!edits) { edits = new Map(); this.edits.set(key, edits); }
        edits.set(index, resolvedType);
      }
      const section = sectionForY(change.y);
      affected.add(`${key}:${section}`);
      if ((change.y - MIN_Y) % SECTION_HEIGHT === 0) affected.add(`${key}:${section - 1}`);
      if ((change.y - MIN_Y) % SECTION_HEIGHT === SECTION_HEIGHT - 1) affected.add(`${key}:${section + 1}`);
      if (sx.local === 0) affected.add(`${chunkKey(sx.chunk - 1, sz.chunk)}:${section}`);
      if (sx.local === CHUNK_SIZE - 1) affected.add(`${chunkKey(sx.chunk + 1, sz.chunk)}:${section}`);
      if (sz.local === 0) affected.add(`${chunkKey(sx.chunk, sz.chunk - 1)}:${section}`);
      if (sz.local === CHUNK_SIZE - 1) affected.add(`${chunkKey(sx.chunk, sz.chunk + 1)}:${section}`);
    }
    for (const entry of affected) {
      const separator = entry.lastIndexOf(":");
      const key = entry.slice(0, separator);
      const section = Number(entry.slice(separator + 1));
      if (section < 0 || section >= SECTION_COUNT) continue;
      const chunk = this.chunks.get(key);
      if (immediate && chunk?.group.visible) { this.cancelQueuedMesh(key, section); this.rebuildSection(chunk, section); }
      else this.queueMesh(key, section, true);
    }
  }

  refreshEditedBlock(cx: number, cz: number, localX: number, y: number, localZ: number, immediate: boolean) {
    const section = sectionForY(y);
    const targets: Array<[string, number]> = [[chunkKey(cx, cz), section]];
    if ((y - MIN_Y) % SECTION_HEIGHT === 0) targets.push([chunkKey(cx, cz), section - 1]);
    if ((y - MIN_Y) % SECTION_HEIGHT === SECTION_HEIGHT - 1) targets.push([chunkKey(cx, cz), section + 1]);
    if (localX === 0) targets.push([chunkKey(cx - 1, cz), section]);
    if (localX === CHUNK_SIZE - 1) targets.push([chunkKey(cx + 1, cz), section]);
    if (localZ === 0) targets.push([chunkKey(cx, cz - 1), section]);
    if (localZ === CHUNK_SIZE - 1) targets.push([chunkKey(cx, cz + 1), section]);
    for (const [key, targetSection] of targets) {
      if (targetSection < 0 || targetSection >= SECTION_COUNT) continue;
      const targetChunk = this.chunks.get(key);
      if (immediate && targetChunk?.group.visible) { this.cancelQueuedMesh(key, targetSection); this.rebuildSection(targetChunk, targetSection); }
      else this.queueMesh(key, targetSection, true);
    }
  }

  isWalkThrough(type: BlockId | undefined) {
    if (type === undefined) return false;
    return type === BlockId.Air
      || [BlockId.DoorOpenLower, BlockId.DoorOpenUpper, BlockId.DoorXOpenLower, BlockId.DoorXOpenUpper].includes(type)
      || [BlockId.FenceGateNorthSouthOpen, BlockId.FenceGateEastWestOpen].includes(type)
      || ["cross", "tall-flower", "aquatic", "torch", "bush", "fruit", "table", "stool", "shelf"].includes(BLOCKS[type]?.shape ?? "");
  }

  biomeAt(x: number, z: number) {
    const sx = splitCoordinate(x);
    const sz = splitCoordinate(z);
    const chunk = this.chunks.get(chunkKey(sx.chunk, sz.chunk));
    return chunk ? chunk.biomes[sx.local + sz.local * CHUNK_SIZE] as BiomeId : this.sampleColumn(x, z).biome;
  }

  surfaceAt(x: number, z: number) {
    const sx = splitCoordinate(x);
    const sz = splitCoordinate(z);
    const chunk = this.chunks.get(chunkKey(sx.chunk, sz.chunk));
    return chunk ? chunk.heightmap[sx.local + sz.local * CHUNK_SIZE] : this.sampleColumn(x, z).height;
  }

  lightSourcesNear(x: number, y: number, z: number, radius = 18) {
    const radiusSquared = radius * radius;
    const sources: Array<{ x: number; y: number; z: number; type: BlockId; distanceSquared: number }> = [];
    const minChunkX = Math.floor((x - radius) / CHUNK_SIZE);
    const maxChunkX = Math.floor((x + radius) / CHUNK_SIZE);
    const minChunkZ = Math.floor((z - radius) / CHUNK_SIZE);
    const maxChunkZ = Math.floor((z + radius) / CHUNK_SIZE);
    for (let cx = minChunkX; cx <= maxChunkX; cx += 1) {
      for (let cz = minChunkZ; cz <= maxChunkZ; cz += 1) {
        const chunk = this.chunks.get(chunkKey(cx, cz));
        if (!chunk || chunk.lightIndices.size === 0) continue;
        for (const index of chunk.lightIndices) {
          const layer = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE));
          const horizontal = index % (CHUNK_SIZE * CHUNK_SIZE);
          const localZ = Math.floor(horizontal / CHUNK_SIZE);
          const localX = horizontal % CHUNK_SIZE;
          const worldX = cx * CHUNK_SIZE + localX;
          const worldY = MIN_Y + layer;
          const worldZ = cz * CHUNK_SIZE + localZ;
          const distanceSquared = (worldX - x) ** 2 + (worldY - y) ** 2 + (worldZ - z) ** 2;
          if (distanceSquared <= radiusSquared) sources.push({ x: worldX, y: worldY, z: worldZ, type: chunk.blocks[index] as BlockId, distanceSquared });
        }
      }
    }
    return sources.sort((a, b) => a.distanceSquared - b.distanceSquared);
  }

  leafBlocksNear(x: number, y: number, z: number, radius = 32) {
    const boundedRadius = Math.max(4, Math.min(40, radius));
    const radiusSquared = boundedRadius * boundedRadius;
    const leaves: Array<{ x: number; y: number; z: number; type: BlockId }> = [];
    const minChunkX = Math.floor((x - boundedRadius) / CHUNK_SIZE);
    const maxChunkX = Math.floor((x + boundedRadius) / CHUNK_SIZE);
    const minChunkZ = Math.floor((z - boundedRadius) / CHUNK_SIZE);
    const maxChunkZ = Math.floor((z + boundedRadius) / CHUNK_SIZE);
    for (let cx = minChunkX; cx <= maxChunkX; cx += 1) for (let cz = minChunkZ; cz <= maxChunkZ; cz += 1) {
      const chunk = this.chunks.get(chunkKey(cx, cz));
      if (!chunk?.group.visible || chunk.leafIndices.size === 0) continue;
      for (const index of chunk.leafIndices) {
        const layer = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE));
        const horizontal = index % (CHUNK_SIZE * CHUNK_SIZE);
        const localZ = Math.floor(horizontal / CHUNK_SIZE);
        const localX = horizontal % CHUNK_SIZE;
        const worldX = cx * CHUNK_SIZE + localX;
        const worldY = MIN_Y + layer;
        const worldZ = cz * CHUNK_SIZE + localZ;
        if ((worldX - x) ** 2 + (worldY - y) ** 2 + (worldZ - z) ** 2 > radiusSquared) continue;
        leaves.push({ x: worldX, y: worldY, z: worldZ, type: chunk.blocks[index] as BlockId });
      }
    }
    return leaves;
  }

  skyVisibilityAt(x: number, y: number, z: number) {
    const samples: Array<[number, number]> = [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]];
    let visible = 0;
    for (const [dx, dz] of samples) {
      let transmission = 1;
      const startY = Math.floor(y);
      if (startY < MIN_Y) transmission = 0;
      else {
        const sx = splitCoordinate(Math.floor(x + dx));
        const sz = splitCoordinate(Math.floor(z + dz));
        const chunk = this.chunks.get(chunkKey(sx.chunk, sz.chunk));
        if (chunk) {
          let index = blockIndex(sx.local, startY, sz.local);
          for (let scanY = startY; scanY <= MAX_Y; scanY += 1, index += CHUNK_SIZE * CHUNK_SIZE) {
            const definition = BLOCKS[chunk.blocks[index] as BlockId];
            if (!definition?.solid) continue;
            if (definition.layer === "cutout") transmission *= 0.55;
            else { transmission = 0; break; }
            if (transmission < 0.12) break;
          }
        }
      }
      visible += transmission;
    }
    return visible / samples.length;
  }

  findWalkableY(x: number, z: number, aroundY = MAX_Y) {
    const top = clamp(Math.round(aroundY + 8), MIN_Y + 1, MAX_Y - 2);
    const bottom = clamp(Math.round(aroundY - 16), MIN_Y + 1, MAX_Y - 2);
    for (let y = top; y >= bottom; y -= 1) {
      const ground = this.getBlock(x, y, z);
      const feet = this.getBlock(x, y + 1, z);
      const head = this.getBlock(x, y + 2, z);
      if (ground !== undefined && BLOCKS[ground]?.solid && this.isWalkThrough(feet) && this.isWalkThrough(head)) return y;
    }
    return this.surfaceAt(x, z);
  }

  faceVisible(type: BlockId, neighbor: BlockId) {
    if (neighbor === BlockId.Air) return true;
    if (blockContainsWater(type) && blockContainsWater(neighbor)) return false;
    const current = BLOCKS[type];
    const next = BLOCKS[neighbor];
    if (!current || !next) return true;
    const nextIsFullCube = !next.shape || next.shape === "cube";
    const nextOccludes = nextIsFullCube && next.solid && next.layer !== "transparent" && next.layer !== "cutout";
    if (current.layer === "transparent") return neighbor !== type && !nextOccludes;
    if (current.layer === "cutout" || (current.layer === "emissive" && !current.solid)) return neighbor !== type && !nextOccludes;
    return !nextOccludes;
  }

  rebuildSection(chunk: Chunk, section: number) {
    const old = chunk.sections.get(section);
    if (old) {
      for (const mesh of Object.values(old)) if (mesh) { chunk.group.remove(mesh); mesh.geometry.dispose(); }
    }
    if (chunk.sectionBlockCounts[section] === 0) {
      chunk.sections.set(section, {});
      chunk.dirty.delete(section);
      return;
    }
    const buckets: Record<WorldRenderLayer, GeometryBucket> = { opaque: emptyBucket(), cutout: emptyBucket(), transparent: emptyBucket(), glass: emptyBucket(), emissive: emptyBucket() };
    const startY = MIN_Y + section * SECTION_HEIGHT;
    const endY = Math.min(MAX_Y, startY + SECTION_HEIGHT - 1);
    const west = this.chunks.get(chunkKey(chunk.cx - 1, chunk.cz));
    const east = this.chunks.get(chunkKey(chunk.cx + 1, chunk.cz));
    const north = this.chunks.get(chunkKey(chunk.cx, chunk.cz - 1));
    const south = this.chunks.get(chunkKey(chunk.cx, chunk.cz + 1));
    const neighborAt = (localX: number, y: number, localZ: number) => {
      if (y > MAX_Y) return BlockId.Air;
      if (y < MIN_Y) return BlockId.Bedrock;
      if (localX >= 0 && localX < CHUNK_SIZE && localZ >= 0 && localZ < CHUNK_SIZE) return chunk.blocks[blockIndex(localX, y, localZ)] as BlockId;
      if (localX < 0) return west ? west.blocks[blockIndex(CHUNK_SIZE - 1, y, localZ)] as BlockId : BlockId.Air;
      if (localX >= CHUNK_SIZE) return east ? east.blocks[blockIndex(0, y, localZ)] as BlockId : BlockId.Air;
      if (localZ < 0) return north ? north.blocks[blockIndex(localX, y, CHUNK_SIZE - 1)] as BlockId : BlockId.Air;
      return south ? south.blocks[blockIndex(localX, y, 0)] as BlockId : BlockId.Air;
    };
    const skyTopAtLocal = (localX: number, localZ: number) => {
      if (localX >= 0 && localX < CHUNK_SIZE && localZ >= 0 && localZ < CHUNK_SIZE) return chunk.skyTops[localX + localZ * CHUNK_SIZE];
      if (localX < 0) return west ? west.skyTops[CHUNK_SIZE - 1 + localZ * CHUNK_SIZE] : MIN_Y - 1;
      if (localX >= CHUNK_SIZE) return east ? east.skyTops[localZ * CHUNK_SIZE] : MIN_Y - 1;
      if (localZ < 0) return north ? north.skyTops[localX + (CHUNK_SIZE - 1) * CHUNK_SIZE] : MIN_Y - 1;
      return south ? south.skyTops[localX] : MIN_Y - 1;
    };
    const shadeAt = (localX: number, y: number, localZ: number) => environmentSkyShade(y, skyTopAtLocal(localX, localZ));
    const addQuad = (
      bucket: GeometryBucket,
      corners: ReadonlyArray<readonly [number, number, number]>,
      normal: [number, number, number],
      tile: number,
      shade: number,
      tint: [number, number, number],
      offsetX = 0,
      offsetY = 0,
      offsetZ = 0,
      topOffset = 0,
      environment = 1,
    ) => {
      const base = bucket.positions.length / 3;
      for (const corner of corners) {
        bucket.positions.push(corner[0] + offsetX, corner[1] + offsetY + (corner[1] > 0 ? topOffset : 0), corner[2] + offsetZ);
        bucket.normals.push(normal[0], normal[1], normal[2]);
        bucket.colors.push(shade * environment * tint[0], shade * environment * tint[1], shade * environment * tint[2]);
      }
      const [u0, v0, u1, v1] = TILE_UVS[tile];
      bucket.uvs.push(u0, v0, u0, v1, u1, v1, u1, v0);
      bucket.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    const addTexturedCuboid = (
      bucket: GeometryBucket,
      x0: number,
      y0: number,
      z0: number,
      x1: number,
      y1: number,
      z1: number,
      sideTile: number,
      topTile = sideTile,
      bottomTile = sideTile,
      tint: [number, number, number] = [1, 1, 1],
      environment = 1,
    ) => {
      addQuad(bucket, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], sideTile, 0.82, tint, 0, 0, 0, 0, environment);
      addQuad(bucket, [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]], [-1, 0, 0], sideTile, 0.72, tint, 0, 0, 0, 0, environment);
      addQuad(bucket, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0], topTile, 1, tint, 0, 0, 0, 0, environment);
      addQuad(bucket, [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]], [0, -1, 0], bottomTile, 0.55, tint, 0, 0, 0, 0, environment);
      addQuad(bucket, [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]], [0, 0, 1], sideTile, 0.9, tint, 0, 0, 0, 0, environment);
      addQuad(bucket, [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], [0, 0, -1], sideTile, 0.76, tint, 0, 0, 0, 0, environment);
    };

    const addImplicitWaterCell = (localX: number, y: number, localZ: number, tint: [number, number, number]) => {
      const waterDrop = -0.045;
      for (const face of FACES) {
        const [dx, dy, dz] = face.direction;
        if (blockContainsWater(neighborAt(localX + dx, y + dy, localZ + dz))) continue;
        addQuad(buckets.transparent, face.corners, face.direction, BLOCKS[BlockId.Water].side, face.shade, tint,
          localX, y + waterDrop, localZ, waterDrop ? -0.09 : 0, shadeAt(localX + dx, y + dy, localZ + dz));
      }
    };

    for (let lx = 0; lx < CHUNK_SIZE; lx += 1) for (let lz = 0; lz < CHUNK_SIZE; lz += 1) {
      const tint = BIOME_TINT[chunk.biomes[lx + lz * CHUNK_SIZE]] ?? [1, 1, 1];
      for (let y = startY; y <= endY; y += 1) {
        const type = chunk.blocks[blockIndex(lx, y, lz)] as BlockId;
        if (type === BlockId.Air) continue;
        if (type === BlockId.Chest && this.hiddenChestVisuals.has(`${chunk.cx * CHUNK_SIZE + lx},${y},${chunk.cz * CHUNK_SIZE + lz}`)) continue;
        const definition = BLOCKS[type];
        if (!definition || definition.layer === "none") continue;
        if (definition.waterlogged) addImplicitWaterCell(lx, y, lz, tint);
        const bucket = buckets[type === BlockId.Glass ? "glass" : definition.layer as Exclude<RenderLayer, "none">];
        if (definition.shape === "torch") {
          const tile = definition.side;
          const environment = Math.max(0.82, shadeAt(lx, y, lz));
          const outward = type === BlockId.TorchWallNorth ? [0, 0, -1]
            : type === BlockId.TorchWallSouth ? [0, 0, 1]
              : type === BlockId.TorchWallEast ? [1, 0, 0]
                : type === BlockId.TorchWallWest ? [-1, 0, 0]
                  : null;
          const base = outward
            ? [lx - outward[0] * 0.47, y - 0.18, lz - outward[2] * 0.47]
            : [lx, y - 0.49, lz];
          const tip = outward
            ? [base[0] + outward[0] * 0.34, y + 0.48, base[2] + outward[2] * 0.34]
            : [lx, y + 0.41, lz];
          const axis = new THREE.Vector3(tip[0] - base[0], tip[1] - base[1], tip[2] - base[2]).normalize();
          const widthA = outward
            ? new THREE.Vector3(-outward[2], 0, outward[0]).normalize()
            : new THREE.Vector3(1, 0, 0);
          const widthB = new THREE.Vector3().crossVectors(axis, widthA).normalize();
          const addTorchSprite = (width: THREE.Vector3, shade: number) => {
            const half = width.clone().multiplyScalar(0.22);
            const corners = [
              [base[0] - half.x, base[1] - half.y, base[2] - half.z],
              [tip[0] - half.x, tip[1] - half.y, tip[2] - half.z],
              [tip[0] + half.x, tip[1] + half.y, tip[2] + half.z],
              [base[0] + half.x, base[1] + half.y, base[2] + half.z],
            ] as [number, number, number][];
            const normal = new THREE.Vector3().crossVectors(width, axis).normalize();
            addQuad(bucket, corners, [normal.x, normal.y, normal.z], tile, shade, [1, 1, 1], 0, 0, 0, 0, environment);
          };
          addTorchSprite(widthA, 1);
          addTorchSprite(widthB, 0.91);
          continue;
        }
        if (definition.shape === "bush" || definition.shape === "fruit") {
          const tile = definition.side;
          const environment = shadeAt(lx, y, lz);
          const halfWidth = definition.shape === "fruit" ? 0.24 : 0.48;
          const y0 = definition.shape === "fruit" ? y - 0.17 : y - 0.5;
          const y1 = definition.shape === "fruit" ? y + 0.44 : y + 0.48;
          addQuad(bucket, [[lx - halfWidth, y0, lz - halfWidth], [lx - halfWidth, y1, lz - halfWidth], [lx + halfWidth, y1, lz + halfWidth], [lx + halfWidth, y0, lz + halfWidth]], [0.7, 0, -0.7], tile, 1, tint, 0, 0, 0, 0, environment);
          addQuad(bucket, [[lx + halfWidth, y0, lz - halfWidth], [lx + halfWidth, y1, lz - halfWidth], [lx - halfWidth, y1, lz + halfWidth], [lx - halfWidth, y0, lz + halfWidth]], [-0.7, 0, -0.7], tile, 0.92, tint, 0, 0, 0, 0, environment);
          if (definition.shape === "bush") {
            addQuad(bucket, [[lx, y0, lz - halfWidth], [lx, y1, lz - halfWidth], [lx, y1, lz + halfWidth], [lx, y0, lz + halfWidth]], [-1, 0, 0], tile, 0.96, tint, 0, 0, 0, 0, environment);
          }
          continue;
        }
        if (definition.shape === "cross" || definition.shape === "aquatic" || definition.shape === "tall-flower") {
          const tile = definition.side;
          const environment = definition.layer === "emissive" ? Math.max(0.82, shadeAt(lx, y, lz)) : shadeAt(lx, y, lz);
          const addFullCross = (half: number, y0: number, y1: number, shade = 1) => {
            addQuad(bucket, [[lx - half, y0, lz - half], [lx - half, y1, lz - half], [lx + half, y1, lz + half], [lx + half, y0, lz + half]], [0.7, 0, -0.7], tile, shade, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[lx + half, y0, lz - half], [lx + half, y1, lz - half], [lx - half, y1, lz + half], [lx - half, y0, lz + half]], [-0.7, 0, -0.7], tile, shade * 0.92, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[lx - half, y0, lz], [lx - half, y1, lz], [lx + half, y1, lz], [lx + half, y0, lz]], [0, 0, -1], tile, shade * 0.96, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[lx, y0, lz - half], [lx, y1, lz - half], [lx, y1, lz + half], [lx, y0, lz + half]], [-1, 0, 0], tile, shade * 0.9, tint, 0, 0, 0, 0, environment);
          };
          if (definition.shape === "aquatic") {
            const connectedBelow = BLOCKS[neighborAt(lx, y - 1, lz)]?.verticalConnectGroup === definition.verticalConnectGroup;
            const connectedAbove = BLOCKS[neighborAt(lx, y + 1, lz)]?.verticalConnectGroup === definition.verticalConnectGroup;
            addFullCross(0.47, y - (connectedBelow ? 0.57 : 0.5), y + (connectedAbove ? 0.57 : 0.5));
          } else if (definition.shape === "tall-flower") {
            addFullCross(0.41, y - 0.5, y + 0.12, 0.94);
            addFullCross(0.48, y - 0.08, y + 0.58);
          } else addFullCross(0.44, y - 0.5, y + 0.5);
          continue;
        }
        if (definition.shape === "apiary") {
          const environment = shadeAt(lx, y, lz);
          addTexturedCuboid(bucket, lx - 0.4, y - 0.46, lz - 0.36, lx + 0.4, y + 0.18, lz + 0.36, definition.side, definition.top, definition.bottom, tint, environment);
          addTexturedCuboid(bucket, lx - 0.46, y + 0.18, lz - 0.42, lx + 0.46, y + 0.36, lz + 0.42, definition.top, definition.top, definition.side, tint, environment);
          addTexturedCuboid(bucket, lx - 0.13, y - 0.06, lz - 0.405, lx + 0.13, y + 0.13, lz - 0.355, 92, 92, 92, [1, 1, 1], environment);
          continue;
        }
        if (definition.shape === "wild-hive") {
          const environment = shadeAt(lx, y, lz);
          addTexturedCuboid(bucket, lx - 0.35, y - 0.46, lz - 0.35, lx + 0.35, y - 0.17, lz + 0.35, definition.side, definition.top, definition.bottom, tint, environment);
          addTexturedCuboid(bucket, lx - 0.45, y - 0.17, lz - 0.42, lx + 0.45, y + 0.16, lz + 0.42, definition.side, definition.top, definition.bottom, tint, environment);
          addTexturedCuboid(bucket, lx - 0.33, y + 0.16, lz - 0.32, lx + 0.33, y + 0.42, lz + 0.32, definition.side, definition.top, definition.bottom, tint, environment);
          addTexturedCuboid(bucket, lx - 0.11, y - 0.03, lz - 0.455, lx + 0.11, y + 0.13, lz - 0.405, 94, 94, 94, [0.55, 0.48, 0.4], environment);
          continue;
        }
        if (definition.shape === "orb-rack") {
          const environment = shadeAt(lx, y, lz);
          addTexturedCuboid(bucket, lx - 0.47, y - 0.48, lz - 0.38, lx + 0.47, y - 0.34, lz + 0.38, definition.side, definition.top, definition.bottom, tint, environment);
          for (const x of [lx - 0.4, lx + 0.31]) addTexturedCuboid(bucket, x, y - 0.34, lz - 0.11, x + 0.09, y + 0.42, lz + 0.11, definition.side, definition.top, definition.bottom, tint, environment);
          for (const railY of [y - 0.08, y + 0.25]) addTexturedCuboid(bucket, lx - 0.35, railY - 0.045, lz - 0.09, lx + 0.35, railY + 0.045, lz + 0.09, definition.side, definition.top, definition.bottom, tint, environment);
          for (const socketX of [lx - 0.27, lx - 0.09, lx + 0.09, lx + 0.27]) addTexturedCuboid(bucket, socketX - 0.055, y + 0.29, lz - 0.13, socketX + 0.055, y + 0.4, lz + 0.13, 95, 95, 94, [0.68, 0.88, 0.86], Math.max(0.82, environment));
          continue;
        }
        if (definition.shape === "orb-healer") {
          const environment = shadeAt(lx, y, lz);
          addTexturedCuboid(bucket, lx - 0.48, y - 0.48, lz - 0.48, lx + 0.48, y - 0.3, lz + 0.48, definition.side, definition.top, definition.bottom, tint, environment);
          for (const [dx, dz] of [[-0.4, -0.4], [0.31, -0.4], [-0.4, 0.31], [0.31, 0.31]] as Array<[number, number]>) {
            addTexturedCuboid(bucket, lx + dx, y - 0.3, lz + dz, lx + dx + 0.09, y + 0.36, lz + dz + 0.09, definition.side, definition.top, definition.bottom, tint, environment);
          }
          addTexturedCuboid(buckets.emissive, lx - 0.28, y - 0.25, lz - 0.28, lx + 0.28, y + 0.28, lz + 0.28, 95, 95, 95, [1, 1, 1], 1);
          addTexturedCuboid(bucket, lx - 0.42, y + 0.3, lz - 0.42, lx + 0.42, y + 0.42, lz + 0.42, definition.side, definition.top, definition.bottom, tint, environment);
          continue;
        }
        if (definition.shape === "cartography") {
          const environment = shadeAt(lx, y, lz);
          addTexturedCuboid(bucket, lx - 0.5, y + 0.21, lz - 0.5, lx + 0.5, y + 0.45, lz + 0.5, definition.side, definition.top, definition.bottom, tint, environment);
          for (const [dx, dz] of [[-0.42, -0.42], [0.28, -0.42], [-0.42, 0.28], [0.28, 0.28]] as Array<[number, number]>) {
            addTexturedCuboid(bucket, lx + dx, y - 0.5, lz + dz, lx + dx + 0.14, y + 0.22, lz + dz + 0.14, definition.side, definition.top, definition.bottom, tint, environment);
          }
          continue;
        }
        if (definition.shape === "alchemy") {
          const environment = shadeAt(lx, y, lz);
          addTexturedCuboid(bucket, lx - 0.42, y - 0.5, lz - 0.42, lx + 0.42, y - 0.36, lz + 0.42, 98, 98, 3, tint, environment);
          addTexturedCuboid(bucket, lx - 0.09, y - 0.36, lz - 0.09, lx + 0.09, y + 0.33, lz + 0.09, 98, 98, 98, tint, environment);
          addTexturedCuboid(bucket, lx - 0.38, y + 0.18, lz - 0.08, lx + 0.38, y + 0.3, lz + 0.08, 98, 98, 98, tint, environment);
          for (const x of [lx - 0.29, lx, lx + 0.29]) {
            addTexturedCuboid(buckets.emissive, x - 0.09, y - 0.1, lz - 0.11, x + 0.09, y + 0.17, lz + 0.11, 98, 98, 98, [1, 1, 1], 1);
          }
          continue;
        }
        if (definition.shape === "wayshrine") {
          const environment = shadeAt(lx, y, lz);
          addTexturedCuboid(buckets.opaque, lx - 0.46, y - 0.5, lz - 0.46, lx + 0.46, y - 0.28, lz + 0.46, 97, 97, 3, [0.82, 0.9, 0.88], environment);
          addTexturedCuboid(buckets.opaque, lx - 0.27, y - 0.28, lz - 0.22, lx + 0.27, y + 0.34, lz + 0.22, 99, 99, 99, [0.72, 0.82, 0.8], environment);
          addTexturedCuboid(buckets.emissive, lx - 0.12, y - 0.04, lz - 0.235, lx + 0.12, y + 0.22, lz - 0.205, 99, 99, 99, [1, 1, 1], 1);
          addTexturedCuboid(buckets.opaque, lx - 0.36, y + 0.34, lz - 0.3, lx + 0.36, y + 0.48, lz + 0.3, 97, 99, 97, [0.86, 0.92, 0.9], environment);
          continue;
        }
        if (definition.shape === "distillery") {
          const environment = shadeAt(lx, y, lz);
          addTexturedCuboid(bucket, lx - 0.42, y - 0.48, lz - 0.4, lx + 0.42, y + 0.3, lz + 0.4, 91, 92, 11, tint, environment);
          for (const ringY of [y - 0.28, y + 0.12]) addTexturedCuboid(bucket, lx - 0.45, ringY, lz - 0.43, lx + 0.45, ringY + 0.08, lz + 0.43, 97, 97, 97, [0.86, 0.74, 0.5], environment);
          addTexturedCuboid(bucket, lx - 0.07, y - 0.03, lz - 0.5, lx + 0.07, y + 0.12, lz - 0.39, 97, 97, 97, [0.9, 0.75, 0.45], environment);
          addTexturedCuboid(bucket, lx - 0.13, y + 0.3, lz - 0.13, lx + 0.13, y + 0.49, lz + 0.13, 91, 92, 11, tint, environment);
          continue;
        }
        if (["table", "stool", "shelf", "barrel"].includes(definition.shape ?? "")) {
          const environment = shadeAt(lx, y, lz);
          if (definition.shape === "table") {
            addTexturedCuboid(bucket, lx - 0.48, y + 0.22, lz - 0.42, lx + 0.48, y + 0.42, lz + 0.42, definition.side, definition.top, definition.bottom, tint, environment);
            for (const [dx, dz] of [[-0.4, -0.34], [0.28, -0.34], [-0.4, 0.22], [0.28, 0.22]] as Array<[number, number]>) {
              addTexturedCuboid(bucket, lx + dx, y - 0.5, lz + dz, lx + dx + 0.12, y + 0.23, lz + dz + 0.12, definition.side, definition.top, definition.bottom, tint, environment);
            }
          } else if (definition.shape === "stool") {
            addTexturedCuboid(bucket, lx - 0.34, y - 0.03, lz - 0.34, lx + 0.34, y + 0.14, lz + 0.34, definition.side, definition.top, definition.bottom, tint, environment);
            for (const [dx, dz] of [[-0.27, -0.27], [0.17, -0.27], [-0.27, 0.17], [0.17, 0.17]] as Array<[number, number]>) {
              addTexturedCuboid(bucket, lx + dx, y - 0.5, lz + dz, lx + dx + 0.1, y - 0.02, lz + dz + 0.1, definition.side, definition.top, definition.bottom, tint, environment);
            }
          } else if (definition.shape === "shelf") {
            for (const x of [lx - 0.47, lx + 0.35]) addTexturedCuboid(bucket, x, y - 0.5, lz - 0.18, x + 0.12, y + 0.48, lz + 0.18, definition.side, definition.top, definition.bottom, tint, environment);
            for (const shelfY of [y - 0.42, y - 0.02, y + 0.38]) addTexturedCuboid(bucket, lx - 0.47, shelfY, lz - 0.2, lx + 0.47, shelfY + 0.1, lz + 0.2, definition.side, definition.top, definition.bottom, tint, environment);
          } else {
            addTexturedCuboid(bucket, lx - 0.4, y - 0.48, lz - 0.4, lx + 0.4, y + 0.46, lz + 0.4, definition.side, definition.top, definition.bottom, tint, environment);
            for (const ringY of [y - 0.32, y + 0.26]) addTexturedCuboid(bucket, lx - 0.44, ringY, lz - 0.44, lx + 0.44, ringY + 0.08, lz + 0.44, 97, 97, 97, [0.82, 0.75, 0.6], environment);
          }
          continue;
        }
        if (definition.shape === "chair") {
          const environment = shadeAt(lx, y, lz);
          addTexturedCuboid(bucket, lx - 0.37, y - 0.08, lz - 0.34, lx + 0.37, y + 0.08, lz + 0.34, 11, 11, 11, tint, environment);
          for (const [dx, dz] of [[-0.32, -0.29], [0.22, -0.29], [-0.32, 0.19], [0.22, 0.19]] as Array<[number, number]>) {
            addTexturedCuboid(bucket, lx + dx, y - 0.5, lz + dz, lx + dx + 0.1, y - 0.07, lz + dz + 0.1, 11, 11, 11, tint, environment);
          }
          addTexturedCuboid(bucket, lx - 0.37, y + 0.08, lz + 0.24, lx + 0.37, y + 0.48, lz + 0.36, 11, 11, 11, tint, environment);
          continue;
        }
        if (definition.shape === "fence" || definition.shape === "gate") {
          const tile = definition.side;
          const environment = shadeAt(lx, y, lz);
          const addWoodCuboid = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
            addQuad(bucket, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], tile, 0.82, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]], [-1, 0, 0], tile, 0.72, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0], tile, 1, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]], [0, -1, 0], tile, 0.55, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]], [0, 0, 1], tile, 0.9, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], [0, 0, -1], tile, 0.76, tint, 0, 0, 0, 0, environment);
          };
          if (definition.shape === "fence") {
            addWoodCuboid(lx - 0.14, y - 0.5, lz - 0.14, lx + 0.14, y + 0.75, lz + 0.14);
            const connectable = (dx: number, dz: number) => {
              const neighbor = neighborAt(lx + dx, y, lz + dz);
              const next = BLOCKS[neighbor];
              return next?.connectGroup === "fence" || Boolean(next?.solid && (!next.shape || next.shape === "cube"));
            };
            if (connectable(1, 0)) for (const railY of [-0.06, 0.38]) addWoodCuboid(lx + 0.08, y + railY - 0.1, lz - 0.09, lx + 0.5, y + railY + 0.1, lz + 0.09);
            if (connectable(-1, 0)) for (const railY of [-0.06, 0.38]) addWoodCuboid(lx - 0.5, y + railY - 0.1, lz - 0.09, lx - 0.08, y + railY + 0.1, lz + 0.09);
            if (connectable(0, 1)) for (const railY of [-0.06, 0.38]) addWoodCuboid(lx - 0.09, y + railY - 0.1, lz + 0.08, lx + 0.09, y + railY + 0.1, lz + 0.5);
            if (connectable(0, -1)) for (const railY of [-0.06, 0.38]) addWoodCuboid(lx - 0.09, y + railY - 0.1, lz - 0.5, lx + 0.09, y + railY + 0.1, lz - 0.08);
          } else {
            const northSouth = type === BlockId.FenceGateNorthSouthClosed || type === BlockId.FenceGateNorthSouthOpen;
            const open = type === BlockId.FenceGateNorthSouthOpen || type === BlockId.FenceGateEastWestOpen;
            if (northSouth) {
              addWoodCuboid(lx - 0.48, y - 0.5, lz - 0.12, lx - 0.34, y + 0.72, lz + 0.12);
              addWoodCuboid(lx + 0.34, y - 0.5, lz - 0.12, lx + 0.48, y + 0.72, lz + 0.12);
              if (open) {
                for (const railY of [-0.06, 0.36]) {
                  addWoodCuboid(lx - 0.46, y + railY - 0.09, lz - 0.12, lx - 0.34, y + railY + 0.09, lz + 0.34);
                  addWoodCuboid(lx + 0.34, y + railY - 0.09, lz - 0.12, lx + 0.46, y + railY + 0.09, lz + 0.34);
                }
              } else for (const railY of [-0.06, 0.36]) addWoodCuboid(lx - 0.36, y + railY - 0.09, lz - 0.08, lx + 0.36, y + railY + 0.09, lz + 0.08);
            } else {
              addWoodCuboid(lx - 0.12, y - 0.5, lz - 0.48, lx + 0.12, y + 0.72, lz - 0.34);
              addWoodCuboid(lx - 0.12, y - 0.5, lz + 0.34, lx + 0.12, y + 0.72, lz + 0.48);
              if (open) {
                for (const railY of [-0.06, 0.36]) {
                  addWoodCuboid(lx - 0.12, y + railY - 0.09, lz - 0.46, lx + 0.34, y + railY + 0.09, lz - 0.34);
                  addWoodCuboid(lx - 0.12, y + railY - 0.09, lz + 0.34, lx + 0.34, y + railY + 0.09, lz + 0.46);
                }
              } else for (const railY of [-0.06, 0.36]) addWoodCuboid(lx - 0.08, y + railY - 0.09, lz - 0.36, lx + 0.08, y + railY + 0.09, lz + 0.36);
            }
          }
          continue;
        }
        if (definition.shape === "exhibit") {
          // Conservatory blocks visually fuse into one habitat. Interior faces
          // disappear and exposed faces use unframed glass; the engine draws a
          // single component perimeter so coplanar blocks cannot z-fight or
          // retain the old one-frame-per-block grid.
          for (const face of FACES) {
            const [dx, dy, dz] = face.direction;
            if (neighborAt(lx + dx, y + dy, lz + dz) === BlockId.ButterflyExhibit) continue;
            const environment = shadeAt(lx + dx, y + dy, lz + dz);
            addQuad(bucket, face.corners, face.direction, definition.top, face.shade, [1, 1, 1], lx, y, lz, 0, environment);
          }
          continue;
        }
        if (definition.shape === "chest") {
          const environment = shadeAt(lx, y, lz);
          const addChestCuboid = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, frontTile = definition.side) => {
            addQuad(bucket, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], definition.side, 0.82, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]], [-1, 0, 0], definition.side, 0.72, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0], definition.top, 1, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]], [0, -1, 0], definition.bottom, 0.55, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]], [0, 0, 1], definition.side, 0.9, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], [0, 0, -1], frontTile, 0.82, tint, 0, 0, 0, 0, environment);
          };
          addChestCuboid(lx - 0.44, y - 0.5, lz - 0.44, lx + 0.44, y + 0.13, lz + 0.44, definition.top);
          addChestCuboid(lx - 0.46, y + 0.16, lz - 0.46, lx + 0.46, y + 0.37, lz + 0.46, definition.top);
          addChestCuboid(lx - 0.09, y + 0.03, lz - 0.49, lx + 0.09, y + 0.24, lz - 0.425, definition.top);
          continue;
        }
        if (definition.shape === "door") {
          const tile = definition.side;
          const environment = shadeAt(lx, y, lz);
          const open = [BlockId.DoorOpenLower, BlockId.DoorOpenUpper, BlockId.DoorXOpenLower, BlockId.DoorXOpenUpper].includes(type);
          const xAxis = [BlockId.DoorXClosedLower, BlockId.DoorXClosedUpper, BlockId.DoorXOpenLower, BlockId.DoorXOpenUpper].includes(type);
          const planeAlongZ = xAxis !== open;
          if (planeAlongZ) {
            const x0 = lx + (open ? -0.5 : -0.08);
            const x1 = lx + (open ? -0.34 : 0.08);
            addQuad(bucket, [[x0, y - 0.5, lz - 0.48], [x0, y + 0.5, lz - 0.48], [x0, y + 0.5, lz + 0.48], [x0, y - 0.5, lz + 0.48]], [-1, 0, 0], tile, 0.88, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[x1, y - 0.5, lz + 0.48], [x1, y + 0.5, lz + 0.48], [x1, y + 0.5, lz - 0.48], [x1, y - 0.5, lz - 0.48]], [1, 0, 0], tile, 0.78, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[x0, y + 0.5, lz - 0.48], [x0, y + 0.5, lz + 0.48], [x1, y + 0.5, lz + 0.48], [x1, y + 0.5, lz - 0.48]], [0, 1, 0], 62, 0.94, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[x0, y - 0.5, lz + 0.48], [x0, y - 0.5, lz - 0.48], [x1, y - 0.5, lz - 0.48], [x1, y - 0.5, lz + 0.48]], [0, -1, 0], 62, 0.58, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[x1, y - 0.5, lz + 0.48], [x1, y + 0.5, lz + 0.48], [x0, y + 0.5, lz + 0.48], [x0, y - 0.5, lz + 0.48]], [0, 0, 1], 62, 0.84, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[x0, y - 0.5, lz - 0.48], [x0, y + 0.5, lz - 0.48], [x1, y + 0.5, lz - 0.48], [x1, y - 0.5, lz - 0.48]], [0, 0, -1], 62, 0.72, tint, 0, 0, 0, 0, environment);
          } else {
            const z0 = lz + (open ? -0.5 : -0.08);
            const z1 = lz + (open ? -0.34 : 0.08);
            addQuad(bucket, [[lx + 0.48, y - 0.5, z0], [lx + 0.48, y + 0.5, z0], [lx - 0.48, y + 0.5, z0], [lx - 0.48, y - 0.5, z0]], [0, 0, -1], tile, 0.9, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[lx - 0.48, y - 0.5, z1], [lx - 0.48, y + 0.5, z1], [lx + 0.48, y + 0.5, z1], [lx + 0.48, y - 0.5, z1]], [0, 0, 1], tile, 0.8, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[lx - 0.48, y + 0.5, z0], [lx - 0.48, y + 0.5, z1], [lx + 0.48, y + 0.5, z1], [lx + 0.48, y + 0.5, z0]], [0, 1, 0], 62, 0.94, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[lx - 0.48, y - 0.5, z1], [lx - 0.48, y - 0.5, z0], [lx + 0.48, y - 0.5, z0], [lx + 0.48, y - 0.5, z1]], [0, -1, 0], 62, 0.58, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[lx + 0.48, y - 0.5, z0], [lx + 0.48, y + 0.5, z0], [lx + 0.48, y + 0.5, z1], [lx + 0.48, y - 0.5, z1]], [1, 0, 0], 62, 0.82, tint, 0, 0, 0, 0, environment);
            addQuad(bucket, [[lx - 0.48, y - 0.5, z1], [lx - 0.48, y + 0.5, z1], [lx - 0.48, y + 0.5, z0], [lx - 0.48, y - 0.5, z0]], [-1, 0, 0], 62, 0.7, tint, 0, 0, 0, 0, environment);
          }
          continue;
        }
        if (definition.shape === "bed") {
          const environment = shadeAt(lx, y, lz);
          const direction = [BlockId.BedNorthFoot, BlockId.BedNorthHead].includes(type) ? [0, -1]
            : [BlockId.BedSouthFoot, BlockId.BedSouthHead].includes(type) ? [0, 1]
              : [BlockId.BedEastFoot, BlockId.BedEastHead].includes(type) ? [1, 0]
                : [-1, 0];
          const head = [BlockId.BedNorthHead, BlockId.BedSouthHead, BlockId.BedEastHead, BlockId.BedWestHead].includes(type);
          const addCuboid = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, sideTile: number, topTile = sideTile, bottomTile = sideTile) => {
            addQuad(bucket, [[x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1]], [1, 0, 0], sideTile, 0.82, [1, 1, 1], 0, 0, 0, 0, environment);
            addQuad(bucket, [[x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [x0, y0, z0]], [-1, 0, 0], sideTile, 0.72, [1, 1, 1], 0, 0, 0, 0, environment);
            addQuad(bucket, [[x0, y1, z0], [x0, y1, z1], [x1, y1, z1], [x1, y1, z0]], [0, 1, 0], topTile, 1, [1, 1, 1], 0, 0, 0, 0, environment);
            addQuad(bucket, [[x0, y0, z1], [x0, y0, z0], [x1, y0, z0], [x1, y0, z1]], [0, -1, 0], bottomTile, 0.56, [1, 1, 1], 0, 0, 0, 0, environment);
            addQuad(bucket, [[x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [x0, y0, z1]], [0, 0, 1], sideTile, 0.88, [1, 1, 1], 0, 0, 0, 0, environment);
            addQuad(bucket, [[x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [x1, y0, z0]], [0, 0, -1], sideTile, 0.76, [1, 1, 1], 0, 0, 0, 0, environment);
          };
          addCuboid(lx - 0.45, y - 0.5, lz - 0.45, lx + 0.45, y - 0.31, lz + 0.45, 62, 11, 11);
          addCuboid(lx - 0.46, y - 0.3, lz - 0.46, lx + 0.46, y + 0.04, lz + 0.46, 63);
          if (head) {
            const [dx, dz] = direction;
            const pillowX0 = dx > 0 ? lx + 0.08 : dx < 0 ? lx - 0.39 : lx - 0.34;
            const pillowX1 = dx > 0 ? lx + 0.39 : dx < 0 ? lx - 0.08 : lx + 0.34;
            const pillowZ0 = dz > 0 ? lz + 0.08 : dz < 0 ? lz - 0.39 : lz - 0.34;
            const pillowZ1 = dz > 0 ? lz + 0.39 : dz < 0 ? lz - 0.08 : lz + 0.34;
            addQuad(bucket, [[pillowX0, y + 0.055, pillowZ0], [pillowX0, y + 0.055, pillowZ1], [pillowX1, y + 0.055, pillowZ1], [pillowX1, y + 0.055, pillowZ0]], [0, 1, 0], 16, 1, [1, 1, 1], 0, 0, 0, 0, environment);
            const boardX0 = dx > 0 ? lx + 0.39 : dx < 0 ? lx - 0.49 : lx - 0.46;
            const boardX1 = dx > 0 ? lx + 0.49 : dx < 0 ? lx - 0.39 : lx + 0.46;
            const boardZ0 = dz > 0 ? lz + 0.39 : dz < 0 ? lz - 0.49 : lz - 0.46;
            const boardZ1 = dz > 0 ? lz + 0.49 : dz < 0 ? lz - 0.39 : lz + 0.46;
            addCuboid(boardX0, y - 0.5, boardZ0, boardX1, y + 0.31, boardZ1, 62, 62, 11);
          }
          continue;
        }
        for (const face of FACES) {
          const [dx, dy, dz] = face.direction;
          const neighbor = neighborAt(lx + dx, y + dy, lz + dz);
          const internalLeafFace = LEAF_BLOCK_SET.has(type)
            && neighbor === type
            && dx + dy + dz > 0
            && hash3(chunk.cx * CHUNK_SIZE + lx + dx, y + dy, chunk.cz * CHUNK_SIZE + lz + dz, this.seed ^ 0x37b41cd9) < DENSE_CUTOUT_LEAF_POLICY.renderInternalFaceFraction;
          if (!this.faceVisible(type, neighbor) && !internalLeafFace) continue;
          const tile = dy > 0 ? definition.top : dy < 0 ? definition.bottom : definition.side;
          const waterDrop = type === BlockId.Water || type === BlockId.Lava ? -0.045 : 0;
          const environment = definition.layer === "emissive"
            ? Math.max(0.82, shadeAt(lx + dx, y + dy, lz + dz))
            : shadeAt(lx + dx, y + dy, lz + dz);
          addQuad(bucket, face.corners, face.direction, tile, face.shade, tint, lx, y + waterDrop, lz, waterDrop ? -0.09 : 0, environment);
        }
      }
    }

    const nextMeshes: ChunkMeshes = {};
    for (const layer of ["opaque", "cutout", "transparent", "glass", "emissive"] as const) {
      const bucket = buckets[layer];
      if (!bucket.positions.length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(bucket.positions, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(bucket.normals, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(bucket.colors, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(bucket.uvs, 2));
      geometry.setIndex(bucket.indices);
      const centerY = (startY + endY) / 2;
      geometry.boundingSphere = new THREE.Sphere(
        new THREE.Vector3((CHUNK_SIZE - 1) / 2, centerY, (CHUNK_SIZE - 1) / 2),
        Math.sqrt(2 * (CHUNK_SIZE / 2) ** 2 + ((endY - startY + 1) / 2) ** 2),
      );
      const mesh = new THREE.Mesh(geometry, this.materials[layer]);
      mesh.renderOrder = layer === "glass" ? 4 : layer === "transparent" ? 3 : layer === "emissive" ? 2 : layer === "cutout" ? 1 : 0;
      chunk.group.add(mesh);
      nextMeshes[layer] = mesh;
    }
    chunk.sections.set(section, nextMeshes);
    chunk.dirty.delete(section);
  }

  unloadChunk(key: string) {
    const chunk = this.chunks.get(key);
    if (!chunk) return;
    for (let section = 0; section < SECTION_COUNT; section += 1) {
      const queueKey = `${key}:${section}`;
      this.meshQueued.delete(queueKey);
      this.urgentMeshQueued.delete(queueKey);
    }
    for (const section of chunk.sections.values()) for (const mesh of Object.values(section)) if (mesh) mesh.geometry.dispose();
    this.group.remove(chunk.group);
    this.chunks.delete(key);
  }

  disposeChunks() {
    for (const key of [...this.chunks.keys()]) this.unloadChunk(key);
  }

  serializeEdits(): ChunkEditSave {
    const result: ChunkEditSave = {};
    for (const [key, edits] of this.edits.entries()) result[key] = [...edits.entries()].map(([index, type]) => [index, type]);
    return result;
  }

  get loadedCount() {
    return this.chunks.size;
  }

  get queuedCount() {
    return this.generationQueue.length + this.meshQueued.size + this.urgentMeshQueued.size;
  }

  dispose() {
    this.disposeChunks();
    this.atlas.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
  }
}
