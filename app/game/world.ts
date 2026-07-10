import * as THREE from "three";
import { BLOCKS, BlockId, type RenderLayer } from "./data";

export const CHUNK_SIZE = 16;
export const MIN_Y = -64;
export const MAX_Y = 127;
export const WORLD_HEIGHT = MAX_Y - MIN_Y + 1;
export const SEA_LEVEL = 32;
export const SECTION_HEIGHT = 16;
export const SECTION_COUNT = WORLD_HEIGHT / SECTION_HEIGHT;
export const GENERATOR_VERSION = 3;

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
};

type ChunkMeshes = {
  opaque?: THREE.Mesh;
  cutout?: THREE.Mesh;
  transparent?: THREE.Mesh;
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
  lightIndices: Set<number>;
  lastTouched: number;
};

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
  [BiomeId.Meadow]: [0.93, 1.08, 0.88],
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
};

const TILE_COLORS = [
  "#65a441", "#775338", "#795338", "#7b8181", "#d7c27b", "#735033", "#9d7446", "#3f7d36",
  "#3d85c8", "#4a4e50", "#a17d67", "#b9864c", "#91786e", "#bde4e2", "#e5c35a", "#303334",
  "#e5ecea", "#8d927f", "#604634", "#8b6846", "#2f6042", "#d0c8ab", "#b8ab8b", "#73a54c",
  "#bd7046", "#8998a0", "#4f913e", "#4f4034", "#5b7339", "#4a5136", "#aaa04f", "#8b793d",
  "#7b4f58", "#a36e78", "#d887ad", "#6b716f", "#a36b3c", "#8d592f", "#686e70", "#f2b94b",
  "#b56f50", "#d4af3f", "#60d8e1", "#3d4448", "#ed642f", "#a74e62", "#4b8245", "#85817c",
  "#8fd0e2", "#3b3538", "#29213d", "#61dce5", "#9f6b35", "#65a842", "#d54f48", "#548ed8",
  "#caa64c", "#6d452b", "#69422a", "#5e9d43", "#9b6839", "#666666", "#555555", "#444444",
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
const smoothstep = (edge0: number, edge1: number, value: number) => {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
};
const LIGHT_BLOCKS = new Set<BlockId>([BlockId.Torch, BlockId.Glowstone, BlockId.CrystalBlock]);

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
  const grid = 8;
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
  const leafTiles = new Set([7, 20, 23, 34]);
  const logSideTiles = new Set([5, 18, 21, 32]);
  const logTopTiles = new Set([6, 19, 22, 33]);
  const crossTiles = new Set([39, 53, 54, 55, 56, 59]);
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
      } else {
        const stem = index === 56 ? "#9a7a32" : "#54843b";
        for (let y = 7; y < 16; y += 1) pixel(index, 7 + (y % 4 === 0 ? 1 : 0), y, stem);
        if (index === 56) {
          for (let y = 3; y < 10; y += 2) {
            pixel(index, 6, y, "#d7b84e"); pixel(index, 8, y + 1, "#edce62"); pixel(index, 9, y, "#bd9637");
          }
        } else {
          const bloom = index === 54 ? "#e54f49" : "#5796e5";
          for (const [dx, dy] of [[0, -2], [-2, 0], [2, 0], [0, 2], [-1, -1], [1, -1]]) pixel(index, 8 + dx, 5 + dy, bloom);
          pixel(index, 8, 5, index === 54 ? "#ffd75e" : "#e7f3ff");
        }
      }
      continue;
    }
    for (let y = 0; y < tile; y += 1) for (let x = 0; x < tile; x += 1) {
      const variation = random() < 0.14 ? -18 : random() > 0.88 ? 15 : 0;
      pixel(index, x, y, shadeColor(base, variation));
    }
    if (index === 1 || index === 17 || index === 29 || index === 31) {
      const topColor = index === 17 ? "#e9efed" : index === 29 ? "#586f37" : index === 31 ? "#aaa04f" : "#66a441";
      for (let y = 0; y < 5; y += 1) for (let x = 0; x < tile; x += 1) pixel(index, x, y, random() > 0.24 ? topColor : shadeColor(topColor, -20));
    }
    if (logSideTiles.has(index)) for (let x = 2; x < tile; x += 4) for (let y = 0; y < tile; y += 1) pixel(index, x, y, shadeColor(base, -35));
    if (logTopTiles.has(index)) {
      context.strokeStyle = shadeColor(base, -42);
      context.strokeRect(ox + 3.5, oy + 3.5, 9, 9);
      context.strokeRect(ox + 6.5, oy + 6.5, 3, 3);
    }
    if (leafTiles.has(index)) for (let y = 0; y < tile; y += 1) for (let x = 0; x < tile; x += 1) if (random() < 0.14) context.clearRect(ox + x, oy + y, 1, 1);
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
      context.fillRect(ox + 3, oy + 3, 10, 4); context.fillRect(ox + 3, oy + 9, 10, 4);
      context.fillStyle = "#6b4428";
      context.fillRect(ox + 3, oy + 7, 10, 2);
      context.fillStyle = "#e9c366";
      context.fillRect(ox + 11, oy + 8, 1, 1);
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
  generationQueue: Array<{ cx: number; cz: number; distance: number }> = [];
  generationQueued = new Set<string>();
  meshQueue: Array<{ key: string; section: number }> = [];
  meshQueued = new Set<string>();
  urgentMeshQueue: Array<{ key: string; section: number }> = [];
  urgentMeshQueued = new Set<string>();
  seedText = "WILDERNESS";
  seed = seedToInt(this.seedText);
  renderDistance = 3;
  playerChunkX = Number.NaN;
  playerChunkZ = Number.NaN;
  frame = 0;
  atlas: THREE.Texture;
  materials: Record<Exclude<RenderLayer, "none">, THREE.Material>;

  constructor() {
    this.atlas = typeof document === "undefined"
      ? new THREE.DataTexture(new Uint8Array([127, 127, 127, 255]), 1, 1, THREE.RGBAFormat)
      : createBlockAtlas();
    this.atlas.needsUpdate = true;
    this.materials = {
      opaque: new THREE.MeshLambertMaterial({ map: this.atlas, vertexColors: true }),
      cutout: new THREE.MeshLambertMaterial({ map: this.atlas, vertexColors: true, alphaTest: 0.32, side: THREE.DoubleSide }),
      transparent: new THREE.MeshLambertMaterial({ map: this.atlas, vertexColors: true, transparent: true, opacity: 0.76, depthWrite: false, side: THREE.DoubleSide }),
      emissive: new THREE.MeshLambertMaterial({ map: this.atlas, vertexColors: true, alphaTest: 0.2, side: THREE.DoubleSide, emissive: new THREE.Color(0xffd77b), emissiveMap: this.atlas, emissiveIntensity: 0.72 }),
    };
  }

  setRenderDistance(distance: number) {
    this.renderDistance = clamp(Math.round(distance), 2, 5);
    this.playerChunkX = Number.NaN;
  }

  reset(seedText: string, savedEdits?: ChunkEditSave) {
    this.disposeChunks();
    this.generationQueue = [];
    this.generationQueued.clear();
    this.meshQueue = [];
    this.meshQueued.clear();
    this.urgentMeshQueue = [];
    this.urgentMeshQueued.clear();
    this.edits.clear();
    this.seedText = seedText || "WILDERNESS";
    this.seed = seedToInt(this.seedText);
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
    if (this.frame % 2 === 0) this.processGeneration();
    this.processMesh();
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
    this.meshQueue = this.meshQueue.filter((entry) => {
      const chunk = this.chunks.get(entry.key);
      if (!chunk) return false;
      return Math.max(Math.abs(chunk.cx - cx), Math.abs(chunk.cz - cz)) <= this.renderDistance;
    });
    this.meshQueued = new Set(this.meshQueue.map((entry) => `${entry.key}:${entry.section}`));
    this.urgentMeshQueue = this.urgentMeshQueue.filter((entry) => {
      const chunk = this.chunks.get(entry.key);
      if (!chunk) return false;
      return Math.max(Math.abs(chunk.cx - cx), Math.abs(chunk.cz - cz)) <= this.renderDistance;
    });
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
          for (let section = 0; section < SECTION_COUNT; section += 1) if (!chunk.sections.has(section)) this.queueMesh(key, section);
        }
      }
    }
    this.generationQueue.sort((a, b) => a.distance - b.distance);

    const retainRadius = this.renderDistance + 2;
    for (const [key, chunk] of this.chunks.entries()) {
      const distance = Math.max(Math.abs(chunk.cx - cx), Math.abs(chunk.cz - cz));
      if (distance > retainRadius) this.unloadChunk(key);
      else chunk.group.visible = distance <= this.renderDistance;
    }
  }

  processGeneration() {
    const next = this.generationQueue.shift();
    if (!next) return;
    const key = chunkKey(next.cx, next.cz);
    this.generationQueued.delete(key);
    if (this.chunks.has(key)) return;
    const chunk = this.generateChunk(next.cx, next.cz);
    const distance = Math.max(Math.abs(next.cx - this.playerChunkX), Math.abs(next.cz - this.playerChunkZ));
    if (distance <= this.renderDistance) for (let section = 0; section < SECTION_COUNT; section += 1) this.queueMesh(key, section);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const neighbor = this.chunks.get(chunkKey(next.cx + dx, next.cz + dz));
      if (!neighbor) continue;
      for (let section = 0; section < SECTION_COUNT; section += 1) {
        this.queueMesh(key, section);
        this.queueMesh(neighbor.key, section);
      }
    }
    return chunk;
  }

  processMesh() {
    const urgent = this.urgentMeshQueue.shift();
    if (urgent) this.urgentMeshQueued.delete(`${urgent.key}:${urgent.section}`);
    const next = urgent ?? this.meshQueue.shift();
    if (!next) return;
    if (!urgent) this.meshQueued.delete(`${next.key}:${next.section}`);
    const chunk = this.chunks.get(next.key);
    if (!chunk || !chunk.group.visible) return;
    this.rebuildSection(chunk, next.section);
  }

  queueMesh(key: string, section: number, urgent = false) {
    if (section < 0 || section >= SECTION_COUNT) return;
    const queueKey = `${key}:${section}`;
    if (urgent) {
      if (this.urgentMeshQueued.has(queueKey)) return;
      if (this.meshQueued.delete(queueKey)) this.meshQueue = this.meshQueue.filter((entry) => `${entry.key}:${entry.section}` !== queueKey);
      this.urgentMeshQueued.add(queueKey);
      this.urgentMeshQueue.push({ key, section });
      return;
    }
    if (this.meshQueued.has(queueKey) || this.urgentMeshQueued.has(queueKey)) return;
    this.meshQueued.add(queueKey);
    this.meshQueue.push({ key, section });
  }

  sampleColumn(x: number, z: number): ColumnSample {
    const warpX = x + 34 * fbm2(x, z, this.seed ^ 0x1f123bb5, 1 / 420, 3);
    const warpZ = z + 34 * fbm2(x, z, this.seed ^ 0x72e8a1d3, 1 / 420, 3);
    const continental = 0.72 * fbm2(warpX, warpZ, this.seed ^ 0x9e3779b9, 1 / 720, 5) + 0.28 * fbm2(warpX, warpZ, this.seed ^ 0x85ebca6b, 1 / 240, 3);
    const temperature = clamp(0.5 + 0.5 * (0.78 * fbm2(x, z, this.seed ^ 0xc2b2ae35, 1 / 560, 4) + 0.22 * fbm2(x, z, this.seed ^ 0x27d4eb2d, 1 / 140, 2)), 0, 1);
    const moisture = clamp(0.5 + 0.5 * (0.8 * fbm2(x, z, this.seed ^ 0x165667b1, 1 / 510, 4) + 0.2 * fbm2(x, z, this.seed ^ 0xd3a2646c, 1 / 125, 2)), 0, 1);
    const erosion = clamp(0.5 + 0.5 * fbm2(warpX, warpZ, this.seed ^ 0xfd7046c5, 1 / 390, 4), 0, 1);
    const region = clamp(0.5 + 0.5 * fbm2(warpX, warpZ, this.seed ^ 0xb55a4f09, 1 / 440, 3), 0, 1);
    const variant = clamp(0.5 + 0.5 * fbm2(warpX - 900, warpZ + 600, this.seed ^ 0x94d049bb, 1 / 270, 3), 0, 1);
    const ridge = Math.pow(Math.max(0, 1 - Math.abs(fbm2(warpX, warpZ, this.seed ^ 0x369dea0f, 1 / 165, 4))), 3);
    const mountain = smoothstep(0.25, 0.58, continental) * smoothstep(0.56, 0.8, region) * (1 - 0.65 * erosion);
    const detail = (5.5 - 3.7 * erosion) * fbm2(warpX, warpZ, this.seed ^ 0x7f4a7c15, 1 / 92, 4) + 1.2 * fbm2(warpX, warpZ, this.seed ^ 0x632be59b, 1 / 24, 2);
    let height = SEA_LEVEL + continentOffset(continental) + detail + mountain * (6 + 30 * ridge);
    const riverField = Math.abs(fbm2(warpX + 211, warpZ - 173, this.seed ^ 0x85157af5, 1 / 320, 3));
    const river = (1 - smoothstep(0.018, 0.066, riverField)) * smoothstep(-0.16, 0.06, continental) * (1 - 0.75 * mountain);
    const waterline = SEA_LEVEL + Math.floor(2 * smoothstep(-0.05, 0.55, continental));
    height = lerp(height, waterline - 2, river * 0.9);
    const swampWeight = smoothstep(0.7, 0.86, moisture) * smoothstep(0.38, 0.57, temperature) * (1 - smoothstep(SEA_LEVEL + 10, SEA_LEVEL + 18, height));
    height = lerp(height, SEA_LEVEL + 2 + 1.4 * fbm2(warpX, warpZ, this.seed ^ 0xe17a1465, 1 / 42, 2), swampWeight * 0.76);
    const dryWeight = smoothstep(0.6, 0.77, temperature) * (1 - smoothstep(0.23, 0.36, moisture));
    height += 3.6 * dryWeight * Math.pow(1 - Math.abs(fbm2(warpX, warpZ, this.seed ^ 0xa24baed4, 1 / 50, 3)), 2);
    height = clamp(Math.round(height), MIN_Y + 7, MAX_Y - 8);

    let biome = BiomeId.Meadow;
    if (height <= SEA_LEVEL - 10) biome = BiomeId.DeepOcean;
    else if (height <= SEA_LEVEL - 2) biome = temperature < 0.15 ? BiomeId.Snowfield : BiomeId.Ocean;
    else if (river > 0.52) biome = BiomeId.River;
    else if (height <= SEA_LEVEL + 2) biome = BiomeId.Beach;
    else if (variant > 0.86 && mountain > 0.18 && temperature > 0.42) biome = BiomeId.Volcanic;
    else if (mountain > 0.36 || height >= 68) biome = temperature < 0.35 || height > 78 ? BiomeId.Snowfield : BiomeId.Highlands;
    else if (temperature < 0.2) biome = BiomeId.Snowfield;
    else if (temperature < 0.36 && moisture >= 0.42) biome = BiomeId.Frostpine;
    else if (temperature > 0.62 && moisture < 0.2 && variant > 0.52) biome = BiomeId.Badlands;
    else if (temperature > 0.64 && moisture < 0.3) biome = BiomeId.Desert;
    else if (temperature > 0.58 && moisture < 0.54) biome = BiomeId.Savanna;
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
      lightIndices: new Set(),
      lastTouched: this.frame,
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

    for (let lx = 0; lx < CHUNK_SIZE; lx += 1) {
      for (let lz = 0; lz < CHUNK_SIZE; lz += 1) {
        const gx = cx * CHUNK_SIZE + lx;
        const gz = cz * CHUNK_SIZE + lz;
        const column = sample(gx, gz);
        chunk.heightmap[lx + lz * CHUNK_SIZE] = column.height;
        chunk.biomes[lx + lz * CHUNK_SIZE] = column.biome;
        const [top, filler] = this.surfaceBlocks(column.biome, column.height, column.temperature);
        const extraBedrock = 1 + Math.floor(hash2(gx, gz, this.seed ^ 0x4cf5ad43) * 4);
        for (let y = MIN_Y; y <= Math.max(column.height, column.waterline); y += 1) {
          let type = BlockId.Air;
          if (y <= MIN_Y + extraBedrock) type = BlockId.Bedrock;
          else if (y <= column.height) {
            if (y === column.height) type = top;
            else if (y >= column.height - (column.biome === BiomeId.Desert || column.biome === BiomeId.Beach ? 5 : 3)) type = filler;
            else type = y < MIN_Y + 18 ? BlockId.Basalt : y < -10 ? BlockId.Deepstone : column.biome === BiomeId.Volcanic ? BlockId.Basalt : BlockId.Stone;

            if (y < column.height - 4 && y > MIN_Y + 4) {
              const depth = column.height - y;
              const cheeseThreshold = lerp(0.5, 0.34, smoothstep(12, 52, depth));
              const cheeseField = valueNoise3(gx / 42, y / 50, gz / 42, this.seed ^ 0x6d2b79f5) * 0.72
                + valueNoise3(gx / 18, y / 22, gz / 18, this.seed ^ 0x27d4eb2f) * 0.28;
              const cheese = cheeseField > cheeseThreshold;
              const tunnelWarp = valueNoise2(gx / 76, gz / 76, this.seed ^ 0x91e10da5) * 4;
              const spaghetti = Math.abs(Math.sin(gx * 0.115 + y * 0.083 + gz * 0.041 + tunnelWarp)) < 0.052
                && Math.abs(Math.sin(gz * 0.129 - y * 0.071 + gx * 0.033 - tunnelWarp)) < 0.16;
              const deepCavern = y < -24 && valueNoise3(gx / 68, y / 58, gz / 68, this.seed ^ 0x5bd1e995) > 0.47
                && Math.sin(gx * 0.09 + gz * 0.07 + y * 0.11) > -0.05;
              const ravineLine = Math.abs(fbm2(gx, gz, this.seed ^ 0x165667c5, 1 / 230, 2));
              const ravineSegment = fbm2(gx, gz, this.seed ^ 0x9e3779f9, 1 / 520, 2);
              const ravineTop = column.height - 5;
              const ravineBottom = Math.max(MIN_Y + 5, column.height - 38);
              const ravineP = (y - ravineBottom) / Math.max(1, ravineTop - ravineBottom);
              const ravine = ravineSegment > 0.1 && y > ravineBottom && y < ravineTop && ravineLine < 0.02 * (0.35 + 0.65 * Math.sin(Math.PI * ravineP));
              if (cheese || spaghetti || deepCavern || ravine) {
                const waterTable = -4 + Math.floor(7 * fbm2(gx, gz, this.seed ^ 0x7ed55d16, 1 / 170, 2));
                if (y <= MIN_Y + 7) type = BlockId.Lava;
                else if (y <= waterTable && valueNoise3(gx / 64, y / 58, gz / 64, this.seed ^ 0x94d049bd) > 0.28) type = BlockId.Water;
                else type = BlockId.Air;
              }
            }

            if (type === BlockId.Stone || type === BlockId.Deepstone || type === BlockId.Basalt) {
              const cellHash = hash3(Math.floor(gx / 2), Math.floor(y / 2), Math.floor(gz / 2), this.seed ^ 0x1234567);
              const detailHash = hash3(gx, y, gz, this.seed ^ 0x89abcdef);
              if (y < 66 && cellHash > 0.992 && detailHash > 0.25) type = BlockId.CoalOre;
              if (y < 48 && cellHash < 0.008 && detailHash > 0.3) type = BlockId.IronOre;
              if (y < 54 && cellHash > 0.983 && cellHash < 0.987 && detailHash > 0.35) type = BlockId.CopperOre;
              if (y < 8 && cellHash > 0.976 && cellHash < 0.9785 && detailHash > 0.4) type = BlockId.GoldOre;
              if (y < -24 && cellHash > 0.97 && cellHash < 0.9715 && detailHash > 0.5) type = BlockId.CrystalOre;
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
    for (let index = 0; index < chunk.blocks.length; index += 1) if (LIGHT_BLOCKS.has(chunk.blocks[index] as BlockId)) chunk.lightIndices.add(index);
    this.chunks.set(key, chunk);
    return chunk;
  }

  surfaceBlocks(biome: BiomeId, height: number, temperature: number): [BlockId, BlockId] {
    if (biome === BiomeId.DeepOcean || biome === BiomeId.Ocean || biome === BiomeId.River) return [BlockId.Gravel, hash2(height, biome, this.seed) > 0.5 ? BlockId.Clay : BlockId.Sand];
    if (biome === BiomeId.Beach || biome === BiomeId.Desert) return [BlockId.Sand, BlockId.Sand];
    if (biome === BiomeId.Badlands) return [BlockId.RedSand, BlockId.RedSand];
    if (biome === BiomeId.Siltfen || biome === BiomeId.MushroomFen) return [BlockId.SwampGrass, BlockId.Mud];
    if (biome === BiomeId.Savanna) return [BlockId.SavannaGrass, BlockId.Dirt];
    if (biome === BiomeId.Snowfield || (height > 72 && temperature < 0.48)) return [BlockId.SnowyGrass, BlockId.Dirt];
    if (biome === BiomeId.Volcanic) return [BlockId.Basalt, BlockId.Basalt];
    if (biome === BiomeId.Highlands) return [height > 76 ? BlockId.Snow : BlockId.Stone, BlockId.Stone];
    return [BlockId.Grass, BlockId.Dirt];
  }

  generateFeatures(chunk: Chunk, sample: (x: number, z: number) => ColumnSample) {
    const minX = chunk.cx * CHUNK_SIZE;
    const minZ = chunk.cz * CHUNK_SIZE;
    const inside = (x: number, z: number) => x >= minX && x < minX + CHUNK_SIZE && z >= minZ && z < minZ + CHUNK_SIZE;
    const set = (x: number, y: number, z: number, type: BlockId, onlyAir = true) => {
      if (!inside(x, z) || y < MIN_Y || y > MAX_Y) return;
      const lx = x - minX;
      const lz = z - minZ;
      const index = blockIndex(lx, y, lz);
      if (!onlyAir || chunk.blocks[index] === BlockId.Air || BLOCKS[chunk.blocks[index]]?.replaceable) chunk.blocks[index] = type;
    };

    const cellSize = 4;
    for (let cellX = Math.floor((minX - 4) / cellSize); cellX <= Math.floor((minX + CHUNK_SIZE + 4) / cellSize); cellX += 1) {
      for (let cellZ = Math.floor((minZ - 4) / cellSize); cellZ <= Math.floor((minZ + CHUNK_SIZE + 4) / cellSize); cellZ += 1) {
        const x = cellX * cellSize + Math.floor(hash2(cellX, cellZ, this.seed ^ 0x11111111) * cellSize);
        const z = cellZ * cellSize + Math.floor(hash2(cellX, cellZ, this.seed ^ 0x22222222) * cellSize);
        if (x * x + z * z < 28) continue;
        const column = sample(x, z);
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
        };
        if (roll < (density[column.biome] ?? 0) && column.height > column.waterline + 1) {
          const trunk = column.biome === BiomeId.Frostpine || column.biome === BiomeId.Snowfield ? BlockId.PineLog
            : column.biome === BiomeId.Birchlight ? BlockId.BirchLog
              : column.biome === BiomeId.Bloomwood ? BlockId.BloomLog : BlockId.WildwoodLog;
          const leaves = trunk === BlockId.PineLog ? BlockId.PineLeaves : trunk === BlockId.BirchLog ? BlockId.BirchLeaves : trunk === BlockId.BloomLog ? BlockId.BloomLeaves : BlockId.WildwoodLeaves;
          const height = trunk === BlockId.PineLog ? 6 + Math.floor(hash2(x, z, this.seed) * 3) : 4 + Math.floor(hash2(x, z, this.seed) * 3);
          for (let y = 1; y <= height; y += 1) set(x, column.height + y, z, trunk, false);
          if (trunk === BlockId.PineLog) {
            for (let dy = -3; dy <= 1; dy += 1) {
              const radius = dy % 2 === 0 ? 2 : 1;
              for (let dx = -radius; dx <= radius; dx += 1) for (let dz = -radius; dz <= radius; dz += 1) if (Math.abs(dx) + Math.abs(dz) <= radius + 1) set(x + dx, column.height + height + dy, z + dz, leaves);
            }
          } else {
            for (let dx = -2; dx <= 2; dx += 1) for (let dz = -2; dz <= 2; dz += 1) for (let dy = -1; dy <= 2; dy += 1) {
              if (Math.abs(dx) + Math.abs(dz) + Math.max(0, dy) <= 4 && !(dx === 0 && dz === 0 && dy <= 0)) set(x + dx, column.height + height + dy, z + dz, leaves);
            }
          }
        }
      }
    }

    for (let lx = 0; lx < CHUNK_SIZE; lx += 1) for (let lz = 0; lz < CHUNK_SIZE; lz += 1) {
      const x = minX + lx;
      const z = minZ + lz;
      const column = sample(x, z);
      if (column.height <= column.waterline) continue;
      const aboveIndex = blockIndex(lx, column.height + 1, lz);
      if (chunk.blocks[aboveIndex] !== BlockId.Air) continue;
      const roll = hash2(x, z, this.seed ^ 0x44444444);
      if (column.biome === BiomeId.Desert && roll > 0.985) {
        const cactusHeight = 2 + Math.floor(hash2(x, z, this.seed ^ 0x55555555) * 3);
        for (let y = 1; y <= cactusHeight; y += 1) set(x, column.height + y, z, BlockId.Cactus);
      } else if ([BiomeId.Meadow, BiomeId.Wildwood, BiomeId.Birchlight, BiomeId.Bloomwood, BiomeId.Savanna, BiomeId.Siltfen].includes(column.biome)) {
        const patch = 0.72 * valueNoise2(x / 19, z / 19, this.seed ^ 0x35f1a93b) + 0.28 * valueNoise2(x / 6, z / 6, this.seed ^ 0x6c8e9cf5);
        const density = column.biome === BiomeId.Meadow ? 0.72 : column.biome === BiomeId.Bloomwood ? 0.79 : column.biome === BiomeId.Savanna ? 0.9 : 0.84;
        if (roll + patch * 0.11 <= density) continue;
        const flowerBias = column.biome === BiomeId.Meadow || column.biome === BiomeId.Bloomwood;
        const plant = flowerBias && roll > 0.965 ? BlockId.BlueFlower : flowerBias && roll > 0.925 ? BlockId.RedFlower : roll > 0.895 ? BlockId.WheatCrop : BlockId.TallGrass;
        set(x, column.height + 1, z, plant);
      } else if (column.biome === BiomeId.MushroomFen && roll > 0.9) {
        set(x, column.height + 1, z, BlockId.MushroomCap);
      }
    }

    const regionSize = 96;
    for (let rx = Math.floor((minX - 10) / regionSize); rx <= Math.floor((minX + CHUNK_SIZE + 10) / regionSize); rx += 1) {
      for (let rz = Math.floor((minZ - 10) / regionSize); rz <= Math.floor((minZ + CHUNK_SIZE + 10) / regionSize); rz += 1) {
        if (hash2(rx, rz, this.seed ^ 0x66666666) < 0.62) continue;
        const x = rx * regionSize + 18 + Math.floor(hash2(rx, rz, this.seed ^ 0x77777777) * (regionSize - 36));
        const z = rz * regionSize + 18 + Math.floor(hash2(rx, rz, this.seed ^ 0x88888888) * (regionSize - 36));
        const column = sample(x, z);
        if (column.height <= column.waterline + 2 || [BiomeId.Ocean, BiomeId.DeepOcean, BiomeId.River].includes(column.biome)) continue;
        const cabin = hash2(rx, rz, this.seed ^ 0x99999999) > 0.63 && [BiomeId.Wildwood, BiomeId.Birchlight, BiomeId.Frostpine].includes(column.biome);
        if (cabin) {
          for (let dx = -3; dx <= 3; dx += 1) for (let dz = -3; dz <= 3; dz += 1) set(x + dx, column.height, z + dz, BlockId.Planks, false);
          for (let dy = 1; dy <= 3; dy += 1) for (let dx = -3; dx <= 3; dx += 1) for (let dz = -3; dz <= 3; dz += 1) {
            const wall = Math.abs(dx) === 3 || Math.abs(dz) === 3;
            if (wall && !(dz === -3 && dx === 0 && dy < 3)) set(x + dx, column.height + dy, z + dz, (Math.abs(dx) === 3 && Math.abs(dz) === 3) ? BlockId.WildwoodLog : BlockId.Planks, false);
          }
          for (let dx = -4; dx <= 4; dx += 1) for (let dz = -4; dz <= 4; dz += 1) set(x + dx, column.height + 4 + (Math.abs(dx) <= 2 && Math.abs(dz) <= 2 ? 1 : 0), z + dz, BlockId.Planks);
          set(x - 2, column.height + 1, z + 1, BlockId.CraftingTable, false);
          set(x + 2, column.height + 1, z + 1, BlockId.Chest, false);
          set(x, column.height + 2, z + 2, BlockId.Torch, false);
        } else {
          for (let dx = -2; dx <= 2; dx += 1) for (let dz = -2; dz <= 2; dz += 1) if (Math.abs(dx) === 2 || Math.abs(dz) === 2 || (dx === 0 && dz === 0)) set(x + dx, column.height, z + dz, hash2(x + dx, z + dz, this.seed) > 0.25 ? BlockId.StoneBrick : BlockId.Moss, false);
          for (let dy = 1; dy <= 4; dy += 1) set(x, column.height + dy, z, dy === 4 ? BlockId.Glowstone : BlockId.StoneBrick, false);
          set(x + 2, column.height + 1, z + 2, BlockId.Chest, false);
        }
      }
    }
  }

  getBlock(x: number, y: number, z: number): BlockId | undefined {
    if (y > MAX_Y) return BlockId.Air;
    if (y < MIN_Y) return BlockId.Bedrock;
    const sx = splitCoordinate(x);
    const sz = splitCoordinate(z);
    const chunk = this.chunks.get(chunkKey(sx.chunk, sz.chunk));
    if (!chunk) return undefined;
    chunk.lastTouched = this.frame;
    return chunk.blocks[blockIndex(sx.local, y, sz.local)] as BlockId;
  }

  getBlockForMesh(x: number, y: number, z: number) {
    return this.getBlock(x, y, z) ?? BlockId.Air;
  }

  setBlock(x: number, y: number, z: number, type: BlockId, record = true, immediate = false) {
    if (y < MIN_Y || y > MAX_Y) return false;
    const sx = splitCoordinate(x);
    const sz = splitCoordinate(z);
    const key = chunkKey(sx.chunk, sz.chunk);
    const chunk = this.chunks.get(key) ?? this.generateChunk(sx.chunk, sz.chunk);
    const index = blockIndex(sx.local, y, sz.local);
    chunk.blocks[index] = type;
    if (LIGHT_BLOCKS.has(type)) chunk.lightIndices.add(index);
    else chunk.lightIndices.delete(index);
    if (record) {
      let edits = this.edits.get(key);
      if (!edits) { edits = new Map(); this.edits.set(key, edits); }
      edits.set(index, type);
    }
    this.refreshEditedBlock(sx.chunk, sz.chunk, sx.local, y, sz.local, immediate);
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
      chunk.blocks[index] = change.type;
      if (LIGHT_BLOCKS.has(change.type)) chunk.lightIndices.add(index);
      else chunk.lightIndices.delete(index);
      if (record) {
        let edits = this.edits.get(key);
        if (!edits) { edits = new Map(); this.edits.set(key, edits); }
        edits.set(index, change.type);
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
      if (immediate && chunk?.group.visible) this.rebuildSection(chunk, section);
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
      if (immediate && targetChunk?.group.visible) this.rebuildSection(targetChunk, targetSection);
      else this.queueMesh(key, targetSection, true);
    }
  }

  isWalkThrough(type: BlockId | undefined) {
    if (type === undefined) return false;
    return type === BlockId.Air || type === BlockId.DoorOpenLower || type === BlockId.DoorOpenUpper || BLOCKS[type]?.shape === "cross";
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
    for (const chunk of this.chunks.values()) {
      const chunkCenterX = chunk.cx * CHUNK_SIZE + CHUNK_SIZE / 2;
      const chunkCenterZ = chunk.cz * CHUNK_SIZE + CHUNK_SIZE / 2;
      if (Math.abs(chunkCenterX - x) > radius + CHUNK_SIZE || Math.abs(chunkCenterZ - z) > radius + CHUNK_SIZE) continue;
      for (const index of chunk.lightIndices) {
        const layer = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE));
        const horizontal = index % (CHUNK_SIZE * CHUNK_SIZE);
        const localZ = Math.floor(horizontal / CHUNK_SIZE);
        const localX = horizontal % CHUNK_SIZE;
        const worldX = chunk.cx * CHUNK_SIZE + localX;
        const worldY = MIN_Y + layer;
        const worldZ = chunk.cz * CHUNK_SIZE + localZ;
        const distanceSquared = (worldX - x) ** 2 + (worldY - y) ** 2 + (worldZ - z) ** 2;
        if (distanceSquared <= radiusSquared) sources.push({ x: worldX, y: worldY, z: worldZ, type: chunk.blocks[index] as BlockId, distanceSquared });
      }
    }
    return sources.sort((a, b) => a.distanceSquared - b.distanceSquared);
  }

  skyVisibilityAt(x: number, y: number, z: number) {
    const samples: Array<[number, number]> = [[0, 0], [2, 0], [-2, 0], [0, 2], [0, -2]];
    let visible = 0;
    for (const [dx, dz] of samples) {
      let transmission = 1;
      for (let scanY = Math.floor(y); scanY <= MAX_Y; scanY += 1) {
        const type = this.getBlock(Math.floor(x + dx), scanY, Math.floor(z + dz));
        if (type === undefined) continue;
        const definition = BLOCKS[type];
        if (!definition?.solid) continue;
        if (definition.layer === "cutout") transmission *= 0.55;
        else { transmission = 0; break; }
        if (transmission < 0.12) break;
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
    const current = BLOCKS[type];
    const next = BLOCKS[neighbor];
    if (!current || !next) return true;
    if (next.shape === "cross" || next.shape === "door") return true;
    const nextOccludes = next.solid && next.layer !== "transparent" && next.layer !== "cutout";
    if (current.layer === "transparent") return neighbor !== type && !nextOccludes;
    if (current.layer === "cutout" || (current.layer === "emissive" && !current.solid)) return neighbor !== type && !nextOccludes;
    return !nextOccludes;
  }

  rebuildSection(chunk: Chunk, section: number) {
    const old = chunk.sections.get(section);
    if (old) {
      for (const mesh of Object.values(old)) if (mesh) { chunk.group.remove(mesh); mesh.geometry.dispose(); }
    }
    const buckets: Record<Exclude<RenderLayer, "none">, GeometryBucket> = { opaque: emptyBucket(), cutout: emptyBucket(), transparent: emptyBucket(), emissive: emptyBucket() };
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
    const grid = 8;
    const pad = 0.0008;
    const uvFor = (tile: number) => {
      const column = tile % grid;
      const row = Math.floor(tile / grid);
      return [column / grid + pad, 1 - (row + 1) / grid + pad, (column + 1) / grid - pad, 1 - row / grid - pad] as const;
    };
    const addQuad = (bucket: GeometryBucket, corners: Array<[number, number, number]>, normal: [number, number, number], tile: number, shade: number, tint: [number, number, number]) => {
      const base = bucket.positions.length / 3;
      for (const corner of corners) {
        bucket.positions.push(...corner);
        bucket.normals.push(...normal);
        bucket.colors.push(shade * tint[0], shade * tint[1], shade * tint[2]);
      }
      const [u0, v0, u1, v1] = uvFor(tile);
      bucket.uvs.push(u0, v0, u0, v1, u1, v1, u1, v0);
      bucket.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    };

    for (let lx = 0; lx < CHUNK_SIZE; lx += 1) for (let lz = 0; lz < CHUNK_SIZE; lz += 1) {
      const tint = BIOME_TINT[chunk.biomes[lx + lz * CHUNK_SIZE]] ?? [1, 1, 1];
      for (let y = startY; y <= endY; y += 1) {
        const type = chunk.blocks[blockIndex(lx, y, lz)] as BlockId;
        if (type === BlockId.Air) continue;
        const definition = BLOCKS[type];
        if (!definition || definition.layer === "none") continue;
        const bucket = buckets[definition.layer];
        if (definition.shape === "cross") {
          const tile = definition.side;
          addQuad(bucket, [[lx - 0.36, y - 0.5, lz - 0.36], [lx - 0.36, y + 0.5, lz - 0.36], [lx + 0.36, y + 0.5, lz + 0.36], [lx + 0.36, y - 0.5, lz + 0.36]], [0.7, 0, -0.7], tile, 1, tint);
          addQuad(bucket, [[lx + 0.36, y - 0.5, lz - 0.36], [lx + 0.36, y + 0.5, lz - 0.36], [lx - 0.36, y + 0.5, lz + 0.36], [lx - 0.36, y - 0.5, lz + 0.36]], [-0.7, 0, -0.7], tile, 0.92, tint);
          continue;
        }
        if (definition.shape === "door") {
          const tile = definition.side;
          const open = type === BlockId.DoorOpenLower || type === BlockId.DoorOpenUpper;
          if (open) {
            addQuad(bucket, [[lx - 0.08, y - 0.5, lz - 0.48], [lx - 0.08, y + 0.5, lz - 0.48], [lx - 0.08, y + 0.5, lz + 0.48], [lx - 0.08, y - 0.5, lz + 0.48]], [-1, 0, 0], tile, 0.88, tint);
            addQuad(bucket, [[lx + 0.08, y - 0.5, lz + 0.48], [lx + 0.08, y + 0.5, lz + 0.48], [lx + 0.08, y + 0.5, lz - 0.48], [lx + 0.08, y - 0.5, lz - 0.48]], [1, 0, 0], tile, 0.78, tint);
          } else {
            addQuad(bucket, [[lx + 0.48, y - 0.5, lz - 0.08], [lx + 0.48, y + 0.5, lz - 0.08], [lx - 0.48, y + 0.5, lz - 0.08], [lx - 0.48, y - 0.5, lz - 0.08]], [0, 0, -1], tile, 0.9, tint);
            addQuad(bucket, [[lx - 0.48, y - 0.5, lz + 0.08], [lx - 0.48, y + 0.5, lz + 0.08], [lx + 0.48, y + 0.5, lz + 0.08], [lx + 0.48, y - 0.5, lz + 0.08]], [0, 0, 1], tile, 0.8, tint);
          }
          continue;
        }
        for (const face of FACES) {
          const [dx, dy, dz] = face.direction;
          const neighbor = neighborAt(lx + dx, y + dy, lz + dz);
          if (!this.faceVisible(type, neighbor)) continue;
          const tile = dy > 0 ? definition.top : dy < 0 ? definition.bottom : definition.side;
          const waterDrop = type === BlockId.Water || type === BlockId.Lava ? -0.045 : 0;
          const corners = face.corners.map(([x, cy, z]) => [lx + x, y + (cy > 0 && waterDrop ? cy - 0.09 : cy) + waterDrop, lz + z] as [number, number, number]);
          addQuad(bucket, corners, face.direction, tile, face.shade, tint);
        }
      }
    }

    const nextMeshes: ChunkMeshes = {};
    for (const layer of ["opaque", "cutout", "transparent", "emissive"] as const) {
      const bucket = buckets[layer];
      if (!bucket.positions.length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(bucket.positions, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(bucket.normals, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(bucket.colors, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(bucket.uvs, 2));
      geometry.setIndex(bucket.indices);
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, this.materials[layer]);
      mesh.renderOrder = layer === "transparent" ? 3 : layer === "emissive" ? 2 : layer === "cutout" ? 1 : 0;
      chunk.group.add(mesh);
      nextMeshes[layer] = mesh;
    }
    chunk.sections.set(section, nextMeshes);
  }

  unloadChunk(key: string) {
    const chunk = this.chunks.get(key);
    if (!chunk) return;
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
    return this.generationQueue.length + this.meshQueue.length + this.urgentMeshQueue.length;
  }

  dispose() {
    this.disposeChunks();
    this.atlas.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
  }
}
