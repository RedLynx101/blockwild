export type CaveEntranceSample = Readonly<{
  centerX: number;
  centerZ: number;
  radius: number;
  distance: number;
  floorY: number;
}>;

export type CaveEntranceCenter = Readonly<{
  cellX: number;
  cellZ: number;
  centerX: number;
  centerZ: number;
  radius: number;
}>;

export const CAVE_ENTRANCE_CELL_SIZE = 48;

function mix32(value: number) {
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  return (value ^ (value >>> 16)) >>> 0;
}

export function caveHash(seed: number, x: number, y: number, z: number) {
  return mix32(seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1103515245)) / 4294967295;
}

/** Shared center contract used by both surface sampling and graph connectors. */
export function caveEntranceForCell(seed: number, cellX: number, cellZ: number): CaveEntranceCenter | null {
  if (caveHash(seed ^ 0x64f31a2d, cellX, 0, cellZ) < 0.28) return null;
  const centerX = cellX * CAVE_ENTRANCE_CELL_SIZE + 8 + Math.floor(caveHash(seed ^ 0x2f6e2b1, cellX, 1, cellZ) * (CAVE_ENTRANCE_CELL_SIZE - 16));
  const centerZ = cellZ * CAVE_ENTRANCE_CELL_SIZE + 8 + Math.floor(caveHash(seed ^ 0x735a2d97, cellX, 2, cellZ) * (CAVE_ENTRANCE_CELL_SIZE - 16));
  const radius = 3 + caveHash(seed ^ 0x1a7c9e31, cellX, 3, cellZ) * 1.8;
  return { cellX, cellZ, centerX, centerZ, radius };
}

/**
 * Sparse surface funnels punch through the four-block roof cap used by the
 * noise caves. They are derived from large grid cells, so seams are stable and
 * sampling stays constant-time per terrain column.
 */
export function caveEntranceAt(seed: number, x: number, z: number, surfaceY: number, waterline: number): CaveEntranceSample | null {
  if (surfaceY <= waterline + 3) return null;
  const cellX = Math.floor(x / CAVE_ENTRANCE_CELL_SIZE);
  const cellZ = Math.floor(z / CAVE_ENTRANCE_CELL_SIZE);
  const center = caveEntranceForCell(seed, cellX, cellZ);
  if (!center) return null;
  const { centerX, centerZ, radius } = center;
  const dx = x - centerX;
  const dz = z - centerZ;
  const distance = Math.hypot(dx, dz);
  if (distance > radius) return null;
  const centerWeight = 1 - distance / radius;
  const floorY = surfaceY - 2 - Math.floor(centerWeight * (12 + radius));
  return { centerX, centerZ, radius, distance, floorY };
}

export type CaveFeatureSample = Readonly<{
  chamber: boolean;
  chimney: boolean;
  shelf: boolean;
}>;

/** Adds distinct rooms, occasional vertical chimneys, and ledged shelves. */
export function caveFeatureAt(seed: number, x: number, y: number, z: number, surfaceY: number, frequency = 1): CaveFeatureSample {
  if (frequency <= 0 || y >= surfaceY - 6) return { chamber: false, chimney: false, shelf: false };

  const chamberCellX = Math.floor(x / 34);
  const chamberCellY = Math.floor((y + 64) / 24);
  const chamberCellZ = Math.floor(z / 34);
  const chamberEnabled = caveHash(seed ^ 0x5f356495, chamberCellX, chamberCellY, chamberCellZ) > 0.7 - Math.min(0.16, frequency * 0.05);
  let chamber = false;
  if (chamberEnabled) {
    const centerX = chamberCellX * 34 + 7 + caveHash(seed ^ 0x375a49c1, chamberCellX, chamberCellY, chamberCellZ) * 20;
    const centerY = chamberCellY * 24 - 64 + 6 + caveHash(seed ^ 0x7a63d921, chamberCellX, chamberCellY, chamberCellZ) * 12;
    const centerZ = chamberCellZ * 34 + 7 + caveHash(seed ^ 0x19b74e8d, chamberCellX, chamberCellY, chamberCellZ) * 20;
    const radiusX = 5 + caveHash(seed ^ 0x6c8e9cf5, chamberCellX, chamberCellY, chamberCellZ) * 5;
    const radiusY = 3.5 + caveHash(seed ^ 0x35f1a93b, chamberCellX, chamberCellY, chamberCellZ) * 3.5;
    const radiusZ = 5 + caveHash(seed ^ 0x27d4eb2f, chamberCellX, chamberCellY, chamberCellZ) * 5;
    chamber = ((x - centerX) / radiusX) ** 2 + ((y - centerY) / radiusY) ** 2 + ((z - centerZ) / radiusZ) ** 2 < 1;
  }

  const chimneyCellX = Math.floor(x / 48);
  const chimneyCellZ = Math.floor(z / 48);
  const chimneyEnabled = caveHash(seed ^ 0x94d049bd, chimneyCellX, 0, chimneyCellZ) > 0.76 - Math.min(0.08, frequency * 0.025);
  let chimney = false;
  if (chimneyEnabled) {
    const centerX = chimneyCellX * 48 + 10 + caveHash(seed ^ 0x165667c5, chimneyCellX, 1, chimneyCellZ) * 28;
    const centerZ = chimneyCellZ * 48 + 10 + caveHash(seed ^ 0x9e3779f9, chimneyCellX, 2, chimneyCellZ) * 28;
    const radius = 1.8 + caveHash(seed ^ 0x7ed55d16, chimneyCellX, 3, chimneyCellZ) * 1.1;
    chimney = (x - centerX) ** 2 + (z - centerZ) ** 2 < radius ** 2 && y < surfaceY - 8;
  }

  // Shelves interrupt a small portion of large chambers, creating readable
  // terraces without a second expensive noise lookup.
  const shelf = chamber && Math.abs((y + Math.floor(caveHash(seed, x >> 3, 7, z >> 3) * 4)) % 9) < 1 && caveHash(seed ^ 0x51f2e8b7, x, y, z) > 0.58;
  return { chamber: chamber && !shelf, chimney, shelf };
}
