import { caveHash } from "./caves";

/** Stable, save-independent identities for The World Below's ecological centers. */
export enum UndergroundBiomeId {
  OrdinaryTunnel = 0,
  RootweaveGrotto = 1,
  StarbloomHollows = 2,
  GlasswaterDeeps = 3,
  PillarstoneReaches = 4,
  CrystaldeepGallery = 5,
  EmberdeepFumaroles = 6,
}

export const UNDERGROUND_BIOME_NAMES: Readonly<Record<UndergroundBiomeId, string>> = Object.freeze({
  [UndergroundBiomeId.OrdinaryTunnel]: "Ordinary Tunnel",
  [UndergroundBiomeId.RootweaveGrotto]: "Rootweave Grotto",
  [UndergroundBiomeId.StarbloomHollows]: "Starbloom Hollows",
  [UndergroundBiomeId.GlasswaterDeeps]: "Glasswater Deeps",
  [UndergroundBiomeId.PillarstoneReaches]: "Pillarstone Reaches",
  [UndergroundBiomeId.CrystaldeepGallery]: "Crystaldeep Gallery",
  [UndergroundBiomeId.EmberdeepFumaroles]: "Emberdeep Fumaroles",
});

export type UndergroundPoiKind =
  | "delver-camp"
  | "fossil-bed"
  | "fungal-sanctum"
  | "drowned-ruin"
  | "rope-bridge"
  | "crystal-shrine"
  | "challenge-vault"
  | "vent-forge"
  | "waystone";

export type CaveGraphNode = Readonly<{
  id: string;
  cellX: number;
  cellZ: number;
  layer: number;
  x: number;
  y: number;
  z: number;
  radiusX: number;
  radiusY: number;
  radiusZ: number;
  ecologyRadius: number;
  biome: UndergroundBiomeId;
  scale: "room" | "chamber" | "great" | "cathedral";
  grand: boolean;
  poi: UndergroundPoiKind | null;
}>;

export type CaveGraphEdge = Readonly<{
  id: string;
  from: CaveGraphNode;
  to: CaveGraphNode;
  radius: number;
  stoneRoad: boolean;
  vertical: boolean;
  flow: "dry" | "stream" | "waterfall";
}>;

export const CAVE_GRAPH_CELL_SIZE = 64;
export const CAVE_GRAPH_LAYER_Y = Object.freeze([-42, -18, 4]);
/** Largest authored horizontal radius; chunk queries include this seam halo. */
export const CAVE_GRAPH_MAX_RADIUS = 175;

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function nodeBiome(seed: number, cellX: number, cellZ: number, layer: number): UndergroundBiomeId {
  const roll = caveHash(seed ^ 0x6a09e667, cellX, layer, cellZ);
  if (layer === 0) {
    if (roll < 0.34) return UndergroundBiomeId.CrystaldeepGallery;
    if (roll < 0.66) return UndergroundBiomeId.EmberdeepFumaroles;
    if (roll < 0.84) return UndergroundBiomeId.PillarstoneReaches;
    return UndergroundBiomeId.GlasswaterDeeps;
  }
  if (layer === 1) {
    if (roll < 0.2) return UndergroundBiomeId.RootweaveGrotto;
    if (roll < 0.42) return UndergroundBiomeId.StarbloomHollows;
    if (roll < 0.64) return UndergroundBiomeId.GlasswaterDeeps;
    if (roll < 0.84) return UndergroundBiomeId.PillarstoneReaches;
    return UndergroundBiomeId.CrystaldeepGallery;
  }
  if (roll < 0.38) return UndergroundBiomeId.RootweaveGrotto;
  if (roll < 0.64) return UndergroundBiomeId.StarbloomHollows;
  if (roll < 0.8) return UndergroundBiomeId.GlasswaterDeeps;
  return UndergroundBiomeId.PillarstoneReaches;
}

function nodePoi(seed: number, cellX: number, cellZ: number, layer: number, biome: UndergroundBiomeId): UndergroundPoiKind | null {
  const roll = caveHash(seed ^ 0xbb67ae85, cellX, layer, cellZ);
  if (roll < 0.28) return null;
  const choices: readonly UndergroundPoiKind[] = biome === UndergroundBiomeId.RootweaveGrotto
    ? ["delver-camp", "fungal-sanctum", "waystone", "fossil-bed"]
    : biome === UndergroundBiomeId.StarbloomHollows
      ? ["fungal-sanctum", "delver-camp", "challenge-vault", "waystone"]
      : biome === UndergroundBiomeId.GlasswaterDeeps
        ? ["drowned-ruin", "rope-bridge", "challenge-vault", "waystone"]
        : biome === UndergroundBiomeId.PillarstoneReaches
          ? ["fossil-bed", "rope-bridge", "delver-camp", "challenge-vault"]
          : biome === UndergroundBiomeId.CrystaldeepGallery
            ? ["crystal-shrine", "challenge-vault", "waystone", "delver-camp"]
            : ["vent-forge", "challenge-vault", "fossil-bed", "waystone"];
  return choices[Math.min(choices.length - 1, Math.floor(caveHash(seed ^ 0x3c6ef372, cellX, layer, cellZ) * choices.length))];
}

export function caveGraphNode(seed: number, cellX: number, cellZ: number, layer: number): CaveGraphNode {
  const baseY = CAVE_GRAPH_LAYER_Y[clamp(Math.trunc(layer), 0, CAVE_GRAPH_LAYER_Y.length - 1)];
  const x = cellX * CAVE_GRAPH_CELL_SIZE + CAVE_GRAPH_CELL_SIZE / 2
    + Math.round((caveHash(seed ^ 0xa54ff53a, cellX, layer, cellZ) - 0.5) * 22);
  const z = cellZ * CAVE_GRAPH_CELL_SIZE + CAVE_GRAPH_CELL_SIZE / 2
    + Math.round((caveHash(seed ^ 0x510e527f, cellX, layer, cellZ) - 0.5) * 22);
  const y = baseY + Math.round((caveHash(seed ^ 0x9b05688c, cellX, layer, cellZ) - 0.5) * 8);
  const scaleRoll = caveHash(seed ^ 0x1f83d9ab, cellX, layer, cellZ);
  const scale = scaleRoll > 0.997 ? "cathedral" : scaleRoll > 0.955 ? "great" : scaleRoll > 0.72 ? "chamber" : "room";
  const grand = scale === "great" || scale === "cathedral";
  const radiusNoiseX = caveHash(seed ^ 0x5be0cd19, cellX, layer, cellZ);
  const radiusNoiseY = caveHash(seed ^ 0xcbbb9d5d, cellX, layer, cellZ);
  const radiusNoiseZ = caveHash(seed ^ 0x629a292a, cellX, layer, cellZ);
  const radiusX = scale === "cathedral" ? 120 + radiusNoiseX * 55
    : scale === "great" ? 45 + radiusNoiseX * 65
      : scale === "chamber" ? 18 + radiusNoiseX * 27 : 6 + radiusNoiseX * 11;
  const radiusY = scale === "cathedral" ? 30 + radiusNoiseY * 15
    : scale === "great" ? 15 + radiusNoiseY * 30
      : scale === "chamber" ? 7 + radiusNoiseY * 13 : 4 + radiusNoiseY * 7;
  const radiusZ = scale === "cathedral" ? 120 + radiusNoiseZ * 55
    : scale === "great" ? 45 + radiusNoiseZ * 65
      : scale === "chamber" ? 18 + radiusNoiseZ * 27 : 6 + radiusNoiseZ * 11;
  const biome = nodeBiome(seed, cellX, cellZ, layer);
  return {
    id: `cave-node:${cellX}:${layer}:${cellZ}`,
    cellX,
    cellZ,
    layer,
    x,
    y,
    z,
    radiusX,
    radiusY,
    radiusZ,
    ecologyRadius: Math.min(radiusX, radiusZ) * 0.84,
    biome,
    scale,
    grand,
    poi: nodePoi(seed, cellX, cellZ, layer, biome),
  };
}

export function caveGraphNodesInBounds(seed: number, minimumX: number, maximumX: number, minimumZ: number, maximumZ: number) {
  const nodes: CaveGraphNode[] = [];
  const minimumCellX = Math.floor(minimumX / CAVE_GRAPH_CELL_SIZE) - 1;
  const maximumCellX = Math.floor(maximumX / CAVE_GRAPH_CELL_SIZE) + 1;
  const minimumCellZ = Math.floor(minimumZ / CAVE_GRAPH_CELL_SIZE) - 1;
  const maximumCellZ = Math.floor(maximumZ / CAVE_GRAPH_CELL_SIZE) + 1;
  for (let cellX = minimumCellX; cellX <= maximumCellX; cellX += 1) {
    for (let cellZ = minimumCellZ; cellZ <= maximumCellZ; cellZ += 1) {
      for (let layer = 0; layer < CAVE_GRAPH_LAYER_Y.length; layer += 1) nodes.push(caveGraphNode(seed, cellX, cellZ, layer));
    }
  }
  return nodes;
}

export function caveGraphEdgesInBounds(seed: number, minimumX: number, maximumX: number, minimumZ: number, maximumZ: number) {
  const edges: CaveGraphEdge[] = [];
  const nodes = caveGraphNodesInBounds(seed, minimumX, maximumX, minimumZ, maximumZ);
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const get = (cellX: number, cellZ: number, layer: number) => nodeById.get(`cave-node:${cellX}:${layer}:${cellZ}`) ?? caveGraphNode(seed, cellX, cellZ, layer);
  for (const node of nodes) {
    for (const [axis, to] of [["x", get(node.cellX + 1, node.cellZ, node.layer)], ["z", get(node.cellX, node.cellZ + 1, node.layer)]] as const) {
      const edgeRoll = caveHash(seed ^ 0x923f82a4, node.cellX, node.layer * 5 + (axis === "x" ? 1 : 2), node.cellZ);
      const waterRoll = caveHash(seed ^ 0x4a7484aa, node.cellX, node.layer * 7 + (axis === "x" ? 1 : 2), node.cellZ);
      const waterLinked = node.biome === UndergroundBiomeId.GlasswaterDeeps || to.biome === UndergroundBiomeId.GlasswaterDeeps;
      edges.push({
        id: `cave-edge:${node.cellX}:${node.layer}:${node.cellZ}:${axis}`,
        from: node,
        to,
        radius: 1.9 + edgeRoll * 1.25,
        stoneRoad: edgeRoll > 0.89 && node.layer > 0,
        vertical: false,
        flow: waterLinked && waterRoll > 0.48 ? "stream" : "dry",
      });
    }
    if (node.layer < CAVE_GRAPH_LAYER_Y.length - 1 && caveHash(seed ^ 0xab1c5ed5, node.cellX, node.layer, node.cellZ) > 0.2) {
      const to = get(node.cellX, node.cellZ, node.layer + 1);
      const waterLinked = node.biome === UndergroundBiomeId.GlasswaterDeeps || to.biome === UndergroundBiomeId.GlasswaterDeeps;
      edges.push({
        id: `cave-edge:${node.cellX}:${node.layer}:${node.cellZ}:vertical`,
        from: node,
        to,
        radius: 2.25,
        stoneRoad: false,
        vertical: true,
        flow: waterLinked && caveHash(seed ^ 0x71374491, node.cellX, node.layer, node.cellZ) > 0.42 ? "waterfall" : "dry",
      });
    }
  }
  const unique = new Map(edges.map((edge) => [edge.id, edge]));
  return [...unique.values()];
}

/** Nearest graph hub, used to connect a generated surface mouth to the network. */
export function nearestUpperCaveNode(seed: number, x: number, z: number) {
  const centerCellX = Math.floor(x / CAVE_GRAPH_CELL_SIZE);
  const centerCellZ = Math.floor(z / CAVE_GRAPH_CELL_SIZE);
  let nearest = caveGraphNode(seed, centerCellX, centerCellZ, CAVE_GRAPH_LAYER_Y.length - 1);
  let nearestDistance = Number.POSITIVE_INFINITY;
  for (let cellX = centerCellX - 1; cellX <= centerCellX + 1; cellX += 1) {
    for (let cellZ = centerCellZ - 1; cellZ <= centerCellZ + 1; cellZ += 1) {
      const node = caveGraphNode(seed, cellX, cellZ, CAVE_GRAPH_LAYER_Y.length - 1);
      const distance = (node.x - x) ** 2 + (node.z - z) ** 2;
      if (distance < nearestDistance) {
        nearest = node;
        nearestDistance = distance;
      }
    }
  }
  return nearest;
}

export function undergroundBiomeAt(seed: number, x: number, y: number, z: number): UndergroundBiomeId {
  const cellX = Math.floor(x / CAVE_GRAPH_CELL_SIZE);
  const cellZ = Math.floor(z / CAVE_GRAPH_CELL_SIZE);
  let nearest: CaveGraphNode | null = null;
  let distance = Number.POSITIVE_INFINITY;
  for (let layer = 0; layer < CAVE_GRAPH_LAYER_Y.length; layer += 1) {
    for (let dx = -1; dx <= 1; dx += 1) for (let dz = -1; dz <= 1; dz += 1) {
      const node = caveGraphNode(seed, cellX + dx, cellZ + dz, layer);
      const normalized = ((x - node.x) / node.radiusX) ** 2 + ((y - node.y) / node.radiusY) ** 2 + ((z - node.z) / node.radiusZ) ** 2;
      if (normalized < distance) { nearest = node; distance = normalized; }
    }
  }
  return nearest && distance <= 1.18 ? nearest.biome : UndergroundBiomeId.OrdinaryTunnel;
}
