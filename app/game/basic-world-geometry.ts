import { BiomeId, CHUNK_SIZE, type ColumnSample } from "./world";
import { UndergroundBiomeId, caveGraphNodesInBounds } from "./underground";

export type BasicWorldGeometry = Readonly<{
  surfacePositions: Float32Array;
  surfaceColors: Float32Array;
  surfaceIndices: Uint32Array;
  cavePositions: Float32Array;
  caveColors: Float32Array;
  caveIndices: Uint32Array;
  generationMilliseconds: number;
}>;

export type BasicWorldGeometryRequest = Readonly<{
  seed: number;
  centerChunkX: number;
  centerChunkZ: number;
  fullDistance: number;
  basicDistance: number;
  cameraY: number;
}>;

const SURFACE_COLORS: Readonly<Partial<Record<BiomeId, readonly [number, number, number]>>> = Object.freeze({
  [BiomeId.DeepOcean]: [0.075, 0.22, 0.34],
  [BiomeId.Ocean]: [0.08, 0.34, 0.52],
  [BiomeId.LumenTrench]: [0.06, 0.25, 0.38],
  [BiomeId.River]: [0.12, 0.4, 0.58],
  [BiomeId.Beach]: [0.68, 0.61, 0.4],
  [BiomeId.Desert]: [0.63, 0.48, 0.25],
  [BiomeId.Badlands]: [0.5, 0.25, 0.16],
  [BiomeId.Snowfield]: [0.72, 0.8, 0.82],
  [BiomeId.Frostpine]: [0.25, 0.4, 0.37],
  [BiomeId.Highlands]: [0.34, 0.38, 0.37],
  [BiomeId.SnowcapRange]: [0.55, 0.62, 0.62],
  [BiomeId.Volcanic]: [0.18, 0.14, 0.14],
  [BiomeId.Siltfen]: [0.25, 0.36, 0.24],
  [BiomeId.MushroomFen]: [0.35, 0.3, 0.38],
  [BiomeId.Glimmerwood]: [0.22, 0.42, 0.3],
  [BiomeId.SugarplumVale]: [0.5, 0.34, 0.45],
  [BiomeId.RainveilJungle]: [0.16, 0.38, 0.22],
});

const CAVE_COLORS: Readonly<Record<UndergroundBiomeId, readonly [number, number, number]>> = Object.freeze({
  [UndergroundBiomeId.OrdinaryTunnel]: [0.055, 0.065, 0.075],
  [UndergroundBiomeId.RootweaveGrotto]: [0.075, 0.11, 0.075],
  [UndergroundBiomeId.StarbloomHollows]: [0.09, 0.08, 0.13],
  [UndergroundBiomeId.GlasswaterDeeps]: [0.055, 0.11, 0.14],
  [UndergroundBiomeId.PillarstoneReaches]: [0.1, 0.095, 0.085],
  [UndergroundBiomeId.CrystaldeepGallery]: [0.085, 0.09, 0.135],
  [UndergroundBiomeId.EmberdeepFumaroles]: [0.13, 0.07, 0.055],
});

const surfaceColor = (column: ColumnSample): readonly [number, number, number] => {
  if (column.height < column.waterline) return [0.07, 0.31, 0.48];
  return SURFACE_COLORS[column.biome] ?? [0.24, 0.42, 0.24];
};

const proxyHeight = (column: ColumnSample) => (column.height < column.waterline ? column.waterline + 0.42 : column.height + 0.5) - 0.08;

function appendQuad(
  positions: number[],
  colors: number[],
  indices: number[],
  corners: readonly (readonly [number, number, number])[],
  color: readonly [number, number, number],
) {
  const base = positions.length / 3;
  for (const corner of corners) {
    positions.push(...corner);
    colors.push(...color);
  }
  indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
}

function addSurfaceRing(
  positions: number[],
  colors: number[],
  indices: number[],
  sample: (x: number, z: number) => ColumnSample,
  centerX: number,
  centerZ: number,
  innerBlocks: number,
  outerBlocks: number,
  step: number,
) {
  const startX = Math.floor((centerX - outerBlocks) / step) * step;
  const endX = Math.ceil((centerX + outerBlocks) / step) * step;
  const startZ = Math.floor((centerZ - outerBlocks) / step) * step;
  const endZ = Math.ceil((centerZ + outerBlocks) / step) * step;
  for (let z = startZ; z < endZ; z += step) for (let x = startX; x < endX; x += step) {
    const cellX = x + step * 0.5;
    const cellZ = z + step * 0.5;
    if (Math.max(Math.abs(cellX - centerX), Math.abs(cellZ - centerZ)) < innerBlocks) continue;
    const samples = [sample(x, z), sample(x + step, z), sample(x, z + step), sample(x + step, z + step)] as const;
    const heights = samples.map(proxyHeight);
    const color = surfaceColor(samples[0]);
    appendQuad(positions, colors, indices, [
      [x, heights[0], z],
      [x + step, heights[1], z],
      [x, heights[2], z + step],
      [x + step, heights[3], z + step],
    ], color);
  }
}

function addInnerSkirt(
  positions: number[],
  colors: number[],
  indices: number[],
  sample: (x: number, z: number) => ColumnSample,
  centerX: number,
  centerZ: number,
  innerBlocks: number,
  step: number,
) {
  const minimumX = Math.floor((centerX - innerBlocks) / step) * step;
  const maximumX = Math.ceil((centerX + innerBlocks) / step) * step;
  const minimumZ = Math.floor((centerZ - innerBlocks) / step) * step;
  const maximumZ = Math.ceil((centerZ + innerBlocks) / step) * step;
  const appendSegment = (x0: number, z0: number, x1: number, z1: number) => {
    const left = sample(x0, z0);
    const right = sample(x1, z1);
    const leftY = proxyHeight(left);
    const rightY = proxyHeight(right);
    appendQuad(positions, colors, indices, [[x0, leftY - 6, z0], [x1, rightY - 6, z1], [x0, leftY, z0], [x1, rightY, z1]], surfaceColor(left));
  };
  for (let x = minimumX; x < maximumX; x += step) {
    appendSegment(x, minimumZ, x + step, minimumZ);
    appendSegment(x + step, maximumZ, x, maximumZ);
  }
  for (let z = minimumZ; z < maximumZ; z += step) {
    appendSegment(minimumX, z + step, minimumX, z);
    appendSegment(maximumX, z, maximumX, z + step);
  }
}

function appendCaveBox(
  positions: number[],
  colors: number[],
  indices: number[],
  center: Readonly<{ x: number; y: number; z: number }>,
  radii: Readonly<{ x: number; y: number; z: number }>,
  color: readonly [number, number, number],
) {
  const base = positions.length / 3;
  for (const [sx, sy, sz] of [[-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1], [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1]] as const) {
    positions.push(center.x + sx * radii.x, center.y + sy * radii.y, center.z + sz * radii.z);
    colors.push(...color);
  }
  const faces = [[0, 1, 2, 3], [5, 4, 7, 6], [4, 0, 6, 2], [1, 5, 3, 7], [2, 3, 6, 7], [4, 5, 0, 1]] as const;
  for (const [a, b, c, d] of faces) indices.push(base + a, base + c, base + b, base + b, base + c, base + d);
}

export function buildBasicWorldGeometry(
  request: BasicWorldGeometryRequest,
  sample: (x: number, z: number) => ColumnSample,
): BasicWorldGeometry {
  const startedAt = typeof performance === "undefined" ? Date.now() : performance.now();
  const surfacePositions: number[] = [];
  const surfaceColors: number[] = [];
  const surfaceIndices: number[] = [];
  const cavePositions: number[] = [];
  const caveColors: number[] = [];
  const caveIndices: number[] = [];
  const fullDistance = Math.max(2, Math.floor(request.fullDistance));
  const basicDistance = Math.max(fullDistance, Math.floor(request.basicDistance));
  const centerX = request.centerChunkX * CHUNK_SIZE + CHUNK_SIZE * 0.5;
  const centerZ = request.centerChunkZ * CHUNK_SIZE + CHUNK_SIZE * 0.5;
  // Adjacent quads share most corners. Caching pure column summaries makes the
  // worker pay for each world coordinate once instead of up to four times.
  const sampleRows = new Map<number, Map<number, ColumnSample>>();
  const cachedSample = (x: number, z: number) => {
    let row = sampleRows.get(z);
    if (!row) {
      row = new Map();
      sampleRows.set(z, row);
    }
    let column = row.get(x);
    if (!column) {
      column = sample(x, z);
      row.set(x, column);
    }
    return column;
  };

  if (basicDistance > fullDistance) {
    const firstOuter = Math.min(basicDistance, fullDistance + 4) * CHUNK_SIZE;
    const innerBlocks = Math.max(0, fullDistance * CHUNK_SIZE - 8);
    addSurfaceRing(surfacePositions, surfaceColors, surfaceIndices, cachedSample, centerX, centerZ, innerBlocks, firstOuter, 2);
    addInnerSkirt(surfacePositions, surfaceColors, surfaceIndices, cachedSample, centerX, centerZ, innerBlocks, 2);
    if (basicDistance > fullDistance + 4) {
      const secondOuter = Math.min(basicDistance, fullDistance + 10) * CHUNK_SIZE;
      addSurfaceRing(surfacePositions, surfaceColors, surfaceIndices, cachedSample, centerX, centerZ, firstOuter - 2, secondOuter, 4);
      if (basicDistance > fullDistance + 10) addSurfaceRing(surfacePositions, surfaceColors, surfaceIndices, cachedSample, centerX, centerZ, secondOuter - 4, basicDistance * CHUNK_SIZE, 8);
    }

    const radius = basicDistance * CHUNK_SIZE;
    const fullRadius = Math.max(0, fullDistance * CHUNK_SIZE - 10);
    const nodes = caveGraphNodesInBounds(request.seed, centerX - radius, centerX + radius, centerZ - radius, centerZ + radius)
      .filter((node) => Math.max(Math.abs(node.x - centerX), Math.abs(node.z - centerZ)) >= fullRadius
        && Math.abs(node.y - request.cameraY) <= 34)
      .sort((left, right) => ((left.x - centerX) ** 2 + (left.z - centerZ) ** 2) - ((right.x - centerX) ** 2 + (right.z - centerZ) ** 2))
      .slice(0, 192);
    for (const node of nodes) appendCaveBox(
      cavePositions,
      caveColors,
      caveIndices,
      node,
      { x: Math.min(58, node.radiusX), y: Math.min(26, node.radiusY), z: Math.min(58, node.radiusZ) },
      CAVE_COLORS[node.biome],
    );
  }

  const finishedAt = typeof performance === "undefined" ? Date.now() : performance.now();
  return Object.freeze({
    surfacePositions: new Float32Array(surfacePositions),
    surfaceColors: new Float32Array(surfaceColors),
    surfaceIndices: new Uint32Array(surfaceIndices),
    cavePositions: new Float32Array(cavePositions),
    caveColors: new Float32Array(caveColors),
    caveIndices: new Uint32Array(caveIndices),
    generationMilliseconds: Math.max(0, finishedAt - startedAt),
  });
}
