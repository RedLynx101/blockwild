import * as THREE from "three";

export const SAVE_KEY = "blockwild-world-v1";
export const SETTINGS_KEY = "blockwild-settings-v1";

export enum BlockId {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Sand = 4,
  Log = 5,
  Leaves = 6,
  Water = 7,
  Coal = 8,
  Iron = 9,
  Planks = 10,
  Brick = 11,
  Glass = 12,
  Glow = 13,
  Bedrock = 14,
}

type RenderLayer = "opaque" | "cutout" | "transparent" | "none";

export type BlockDefinition = {
  id: BlockId;
  name: string;
  top: number;
  side: number;
  bottom: number;
  hardness: number;
  solid: boolean;
  layer: RenderLayer;
  color: string;
};

export const BLOCKS: Record<BlockId, BlockDefinition> = {
  [BlockId.Air]: { id: BlockId.Air, name: "Air", top: 0, side: 0, bottom: 0, hardness: 0, solid: false, layer: "none", color: "#ffffff" },
  [BlockId.Grass]: { id: BlockId.Grass, name: "Grass Block", top: 0, side: 1, bottom: 2, hardness: 0.65, solid: true, layer: "opaque", color: "#6b9f3a" },
  [BlockId.Dirt]: { id: BlockId.Dirt, name: "Dirt", top: 2, side: 2, bottom: 2, hardness: 0.55, solid: true, layer: "opaque", color: "#7b5636" },
  [BlockId.Stone]: { id: BlockId.Stone, name: "Stone", top: 3, side: 3, bottom: 3, hardness: 1.45, solid: true, layer: "opaque", color: "#747b7d" },
  [BlockId.Sand]: { id: BlockId.Sand, name: "Sand", top: 4, side: 4, bottom: 4, hardness: 0.5, solid: true, layer: "opaque", color: "#d8c27b" },
  [BlockId.Log]: { id: BlockId.Log, name: "Wildwood Log", top: 6, side: 5, bottom: 6, hardness: 1.1, solid: true, layer: "opaque", color: "#705033" },
  [BlockId.Leaves]: { id: BlockId.Leaves, name: "Wildwood Leaves", top: 7, side: 7, bottom: 7, hardness: 0.35, solid: true, layer: "cutout", color: "#3f7d36" },
  [BlockId.Water]: { id: BlockId.Water, name: "Water", top: 8, side: 8, bottom: 8, hardness: 0, solid: false, layer: "transparent", color: "#3e83c6" },
  [BlockId.Coal]: { id: BlockId.Coal, name: "Coal Ore", top: 9, side: 9, bottom: 9, hardness: 1.8, solid: true, layer: "opaque", color: "#45494a" },
  [BlockId.Iron]: { id: BlockId.Iron, name: "Sunmetal Ore", top: 10, side: 10, bottom: 10, hardness: 2.05, solid: true, layer: "opaque", color: "#a68168" },
  [BlockId.Planks]: { id: BlockId.Planks, name: "Wildwood Planks", top: 11, side: 11, bottom: 11, hardness: 0.9, solid: true, layer: "opaque", color: "#b6844d" },
  [BlockId.Brick]: { id: BlockId.Brick, name: "Stone Brick", top: 12, side: 12, bottom: 12, hardness: 1.65, solid: true, layer: "opaque", color: "#8b7770" },
  [BlockId.Glass]: { id: BlockId.Glass, name: "Glass", top: 13, side: 13, bottom: 13, hardness: 0.4, solid: true, layer: "transparent", color: "#b9e5e3" },
  [BlockId.Glow]: { id: BlockId.Glow, name: "Glowstone", top: 14, side: 14, bottom: 14, hardness: 0.75, solid: true, layer: "opaque", color: "#e3c35c" },
  [BlockId.Bedrock]: { id: BlockId.Bedrock, name: "Bedrock", top: 15, side: 15, bottom: 15, hardness: 999, solid: true, layer: "opaque", color: "#303334" },
};

export const PLACEABLE_BLOCKS: BlockId[] = [
  BlockId.Grass,
  BlockId.Dirt,
  BlockId.Stone,
  BlockId.Sand,
  BlockId.Log,
  BlockId.Planks,
  BlockId.Glass,
  BlockId.Brick,
  BlockId.Glow,
];

export type GameMode = "builder" | "survival";
export type Weather = "clear" | "rain";

export type HudState = {
  health: number;
  hunger: number;
  hotbar: BlockId[];
  selected: number;
  counts: Record<number, number>;
  targetName: string | null;
  breakProgress: number;
  day: number;
  clock: string;
  biome: string;
  coordinates: [number, number, number];
  debug: boolean;
  mode: GameMode;
  weather: Weather;
};

export type GameSettings = {
  volume: number;
  muted: boolean;
  sensitivity: number;
  fov: number;
  weather: Weather;
};

export type WorldSave = {
  version: 1;
  seed: string;
  mode: GameMode;
  edits: Record<string, number>;
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
  inventory: Record<string, number>;
  hotbar: BlockId[];
  selected: number;
  health: number;
  hunger: number;
  time: number;
  day: number;
  weather: Weather;
  savedAt: number;
};

export type EngineEvents = {
  onHud: (hud: HudState) => void;
  onToast: (message: string) => void;
  onLockChange: (locked: boolean) => void;
  onInventoryRequest: () => void;
  onDeath: () => void;
  onSave: () => void;
};

type VoxelHit = {
  x: number;
  y: number;
  z: number;
  placeX: number;
  placeY: number;
  placeZ: number;
  type: BlockId;
};

type Face = {
  direction: [number, number, number];
  shade: number;
  corners: [number, number, number][];
};

const WORLD_SIZE = 56;
const WORLD_HALF = WORLD_SIZE / 2;
const WATER_LEVEL = 6;
const MAX_WORLD_Y = 28;
const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.3;
const PHYSICS_STEP = 1 / 60;

const FACES: Face[] = [
  { direction: [1, 0, 0], shade: 0.82, corners: [[0.5, -0.5, -0.5], [0.5, 0.5, -0.5], [0.5, 0.5, 0.5], [0.5, -0.5, 0.5]] },
  { direction: [-1, 0, 0], shade: 0.7, corners: [[-0.5, -0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, 0.5, -0.5], [-0.5, -0.5, -0.5]] },
  { direction: [0, 1, 0], shade: 1, corners: [[-0.5, 0.5, -0.5], [-0.5, 0.5, 0.5], [0.5, 0.5, 0.5], [0.5, 0.5, -0.5]] },
  { direction: [0, -1, 0], shade: 0.54, corners: [[-0.5, -0.5, 0.5], [-0.5, -0.5, -0.5], [0.5, -0.5, -0.5], [0.5, -0.5, 0.5]] },
  { direction: [0, 0, 1], shade: 0.88, corners: [[0.5, -0.5, 0.5], [0.5, 0.5, 0.5], [-0.5, 0.5, 0.5], [-0.5, -0.5, 0.5]] },
  { direction: [0, 0, -1], shade: 0.76, corners: [[-0.5, -0.5, -0.5], [-0.5, 0.5, -0.5], [0.5, 0.5, -0.5], [0.5, -0.5, -0.5]] },
];

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

function seedToInt(seed: string) {
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
  return hash2(x + y * 1013, z - y * 1619, seed ^ Math.imul(y, 2246822519));
}

function valueNoise2(x: number, z: number, seed: number) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smooth(x - x0);
  const tz = smooth(z - z0);
  const a = lerp(hash2(x0, z0, seed), hash2(x0 + 1, z0, seed), tx);
  const b = lerp(hash2(x0, z0 + 1, seed), hash2(x0 + 1, z0 + 1, seed), tx);
  return lerp(a, b, tz);
}

function fbm(x: number, z: number, seed: number) {
  let value = 0;
  let amplitude = 0.55;
  let frequency = 0.055;
  let total = 0;
  for (let octave = 0; octave < 4; octave += 1) {
    value += valueNoise2(x * frequency, z * frequency, seed + octave * 997) * amplitude;
    total += amplitude;
    amplitude *= 0.5;
    frequency *= 2;
  }
  return value / total;
}

function keyOf(x: number, y: number, z: number) {
  return `${x},${y},${z}`;
}

function parseKey(key: string): [number, number, number] {
  const [x, y, z] = key.split(",").map(Number);
  return [x, y, z];
}

export function readSavedWorld(): WorldSave | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorldSave;
    if (parsed.version !== 1 || typeof parsed.seed !== "string" || !parsed.player) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSavedWorld() {
  if (typeof window !== "undefined") window.localStorage.removeItem(SAVE_KEY);
}

export function readSettings(): GameSettings {
  const fallback: GameSettings = { volume: 0.55, muted: false, sensitivity: 0.0022, fov: 72, weather: "clear" };
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<GameSettings> | null;
    if (!parsed) return fallback;
    return {
      volume: clamp(Number(parsed.volume ?? fallback.volume), 0, 1),
      muted: Boolean(parsed.muted ?? fallback.muted),
      sensitivity: clamp(Number(parsed.sensitivity ?? fallback.sensitivity), 0.0008, 0.005),
      fov: clamp(Number(parsed.fov ?? fallback.fov), 55, 100),
      weather: parsed.weather === "rain" ? "rain" : "clear",
    };
  } catch {
    return fallback;
  }
}

function writeSettings(settings: GameSettings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable in hardened browsers; gameplay still works.
  }
}

class VoxelWorld {
  blocks = new Map<string, BlockId>();
  edits = new Map<string, BlockId>();
  seedText = "WILDERNESS";
  seed = seedToInt(this.seedText);

  get(x: number, y: number, z: number): BlockId {
    if (y < 0 || y > MAX_WORLD_Y) return BlockId.Air;
    return this.blocks.get(keyOf(x, y, z)) ?? BlockId.Air;
  }

  set(x: number, y: number, z: number, type: BlockId, record = true) {
    const key = keyOf(x, y, z);
    if (type === BlockId.Air) this.blocks.delete(key);
    else this.blocks.set(key, type);
    if (record) this.edits.set(key, type);
  }

  surfaceY(x: number, z: number) {
    for (let y = MAX_WORLD_Y; y >= 0; y -= 1) {
      const type = this.get(x, y, z);
      if (BLOCKS[type].solid) return y;
    }
    return 0;
  }

  generate(seedText: string, edits?: Record<string, number>) {
    this.blocks.clear();
    this.edits.clear();
    this.seedText = seedText || "WILDERNESS";
    this.seed = seedToInt(this.seedText);
    const heights = new Map<string, number>();

    for (let x = -WORLD_HALF; x < WORLD_HALF; x += 1) {
      for (let z = -WORLD_HALF; z < WORLD_HALF; z += 1) {
        const continental = valueNoise2(x * 0.018, z * 0.018, this.seed ^ 0x9e3779b9);
        const ridges = Math.abs(fbm(x + 120, z - 80, this.seed ^ 0x85ebca6b) - 0.5) * 2;
        let height = Math.floor(3.5 + fbm(x, z, this.seed) * 8 + continental * 3 + ridges * 2);
        const edge = Math.max(Math.abs(x), Math.abs(z)) / WORLD_HALF;
        if (edge > 0.82) height -= Math.floor((edge - 0.82) * 18);
        height = clamp(height, 3, 17);
        heights.set(`${x},${z}`, height);

        this.set(x, 0, z, BlockId.Bedrock, false);
        for (let y = 1; y <= height; y += 1) {
          let type = BlockId.Stone;
          if (y === height) type = height <= WATER_LEVEL + 1 ? BlockId.Sand : BlockId.Grass;
          else if (y >= height - 3) type = height <= WATER_LEVEL + 1 ? BlockId.Sand : BlockId.Dirt;
          else {
            const oreRoll = hash3(x, y, z, this.seed);
            if (y < height - 2 && oreRoll > 0.968) type = BlockId.Coal;
            if (y < 8 && oreRoll < 0.022) type = BlockId.Iron;
            const cave = hash3(Math.floor(x / 2), y, Math.floor(z / 2), this.seed ^ 0xc2b2ae35);
            if (y > 2 && y < height - 3 && cave > 0.987) type = BlockId.Air;
          }
          if (type !== BlockId.Air) this.set(x, y, z, type, false);
        }
        for (let y = height + 1; y <= WATER_LEVEL; y += 1) this.set(x, y, z, BlockId.Water, false);
      }
    }

    for (let x = -WORLD_HALF + 3; x < WORLD_HALF - 3; x += 1) {
      for (let z = -WORLD_HALF + 3; z < WORLD_HALF - 3; z += 1) {
        const height = heights.get(`${x},${z}`) ?? 0;
        const treeRoll = hash2(x, z, this.seed ^ 0x27d4eb2d);
        if (treeRoll < 0.975 || height <= WATER_LEVEL + 1 || x * x + z * z < 36) continue;
        const trunkHeight = 3 + Math.floor(hash2(x, z, this.seed ^ 0x165667b1) * 3);
        for (let y = 1; y <= trunkHeight; y += 1) this.set(x, height + y, z, BlockId.Log, false);
        for (let dx = -2; dx <= 2; dx += 1) {
          for (let dz = -2; dz <= 2; dz += 1) {
            for (let dy = -1; dy <= 2; dy += 1) {
              const distance = Math.abs(dx) + Math.abs(dz) + Math.max(0, dy);
              if (distance > 4 || (dx === 0 && dz === 0 && dy <= 0)) continue;
              if (hash3(x + dx, height + trunkHeight + dy, z + dz, this.seed) > 0.12) {
                this.set(x + dx, height + trunkHeight + dy, z + dz, BlockId.Leaves, false);
              }
            }
          }
        }
      }
    }

    // A small, original landmark gives the finite island a destination.
    const markerX = 16;
    const markerZ = -14;
    const markerY = this.surfaceY(markerX, markerZ) + 1;
    for (let y = 0; y < 4; y += 1) this.set(markerX, markerY + y, markerZ, y === 3 ? BlockId.Glow : BlockId.Brick, false);
    this.set(markerX + 1, markerY, markerZ, BlockId.Brick, false);
    this.set(markerX - 1, markerY, markerZ, BlockId.Brick, false);
    this.set(markerX, markerY, markerZ + 1, BlockId.Brick, false);
    this.set(markerX, markerY, markerZ - 1, BlockId.Brick, false);

    if (edits) {
      for (const [key, rawType] of Object.entries(edits)) {
        const type = Number(rawType) as BlockId;
        const [x, y, z] = parseKey(key);
        this.set(x, y, z, type, false);
        this.edits.set(key, type);
      }
    }
  }
}

class SynthAudio {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  ambienceGain: GainNode | null = null;
  ambience: AudioBufferSourceNode | null = null;
  noise: AudioBuffer | null = null;
  settings: GameSettings;

  constructor(settings: GameSettings) {
    this.settings = settings;
  }

  async unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = -12;
        compressor.ratio.value = 8;
        this.master.connect(compressor).connect(this.context.destination);
        this.noise = this.createNoiseBuffer(1.5);
        this.startAmbience();
        this.applyVolume();
      }
      if (this.context.state !== "running") await this.context.resume();
    } catch {
      // Audio is an enhancement. Some embedded browsers block it entirely.
    }
  }

  createNoiseBuffer(seconds: number) {
    if (!this.context) return null;
    const length = Math.floor(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let i = 0; i < length; i += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.78 + white * 0.22;
      data[i] = previous;
    }
    return buffer;
  }

  startAmbience() {
    if (!this.context || !this.master || !this.noise || this.ambience) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noise;
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = 420;
    gain.gain.value = 0.022;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    this.ambience = source;
    this.ambienceGain = gain;
  }

  applyVolume() {
    if (!this.master || !this.context) return;
    const value = this.settings.muted ? 0 : this.settings.volume;
    this.master.gain.setTargetAtTime(value, this.context.currentTime, 0.02);
  }

  setSettings(settings: GameSettings) {
    this.settings = settings;
    this.applyVolume();
  }

  noiseBurst(duration: number, frequency: number, gainValue: number, highpass = false, when = 0) {
    if (!this.context || !this.master || !this.noise || this.settings.muted) return;
    const now = this.context.currentTime + when;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noise;
    source.playbackRate.value = 0.88 + Math.random() * 0.24;
    filter.type = highpass ? "highpass" : "bandpass";
    filter.frequency.value = frequency * (0.9 + Math.random() * 0.2);
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now, Math.random() * 0.4, duration);
    source.stop(now + duration + 0.02);
  }

  tone(frequency: number, duration: number, gainValue: number, type: OscillatorType = "triangle", when = 0, endFrequency?: number) {
    if (!this.context || !this.master || this.settings.muted) return;
    const now = this.context.currentTime + when;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  play(kind: "step" | "mine" | "break" | "place" | "pickup" | "jump" | "land" | "hurt" | "ui", material: BlockId = BlockId.Grass) {
    const stoneLike = [BlockId.Stone, BlockId.Coal, BlockId.Iron, BlockId.Brick, BlockId.Bedrock].includes(material);
    const woodLike = [BlockId.Log, BlockId.Planks].includes(material);
    const base = stoneLike ? 1250 : woodLike ? 690 : 410;
    if (kind === "step") {
      this.noiseBurst(stoneLike ? 0.038 : 0.065, base * 0.65, 0.055, stoneLike);
    } else if (kind === "mine") {
      this.noiseBurst(0.075, base, 0.085, stoneLike);
      this.tone(stoneLike ? 105 : 82, 0.045, 0.025, "sine");
    } else if (kind === "break") {
      for (let i = 0; i < 4; i += 1) this.noiseBurst(0.07, base * (0.8 + i * 0.12), 0.1, stoneLike, i * 0.026);
      this.tone(95, 0.11, 0.045, "sine", 0, 55);
    } else if (kind === "place") {
      this.noiseBurst(0.07, 510, 0.07);
      this.tone(115, 0.09, 0.06, "sine", 0, 64);
    } else if (kind === "pickup") {
      this.tone(660, 0.055, 0.045, "triangle");
      this.tone(990, 0.07, 0.04, "triangle", 0.052);
    } else if (kind === "jump") {
      this.noiseBurst(0.075, 280, 0.045);
    } else if (kind === "land") {
      this.noiseBurst(0.11, 210, 0.09);
      this.tone(74, 0.08, 0.03, "sine");
    } else if (kind === "hurt") {
      this.tone(150, 0.18, 0.09, "sawtooth", 0, 72);
    } else if (kind === "ui") {
      this.tone(430, 0.035, 0.025, "square");
    }
  }

  dispose() {
    try {
      this.ambience?.stop();
      void this.context?.close();
    } catch {
      // Already stopped.
    }
  }
}

function makeAtlas() {
  const tile = 16;
  const grid = 4;
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
    const ox = (index % grid) * tile;
    const oy = Math.floor(index / grid) * tile;
    context.globalAlpha = alpha;
    context.fillStyle = color;
    context.fillRect(ox + x, oy + y, 1, 1);
    context.globalAlpha = 1;
  };
  const fillNoise = (index: number, palette: string[], weights?: number[]) => {
    for (let y = 0; y < tile; y += 1) {
      for (let x = 0; x < tile; x += 1) {
        let choice = Math.floor(random() * palette.length);
        if (weights) {
          const roll = random();
          let sum = 0;
          choice = 0;
          for (let i = 0; i < weights.length; i += 1) {
            sum += weights[i];
            if (roll <= sum) { choice = i; break; }
          }
        }
        pixel(index, x, y, palette[choice]);
      }
    }
  };

  fillNoise(0, ["#629b38", "#6fa943", "#548831", "#7bb34a"], [0.5, 0.23, 0.18, 0.09]);
  fillNoise(1, ["#765035", "#80583a", "#67452f", "#8b6040"]);
  for (let y = 0; y < 5; y += 1) for (let x = 0; x < tile; x += 1) pixel(1, x, y, random() > 0.28 ? "#619a38" : "#477d2c");
  for (let x = 0; x < tile; x += 1) if (random() > 0.45) pixel(1, x, 5 + Math.floor(random() * 3), "#4f8730");
  fillNoise(2, ["#795337", "#6a472f", "#875e3d", "#5f402d"], [0.46, 0.22, 0.24, 0.08]);
  fillNoise(3, ["#777d7e", "#858b8b", "#676d6f", "#919696"], [0.46, 0.22, 0.2, 0.12]);
  fillNoise(4, ["#d5c17b", "#e0cd88", "#c6b16c", "#ead893"], [0.48, 0.25, 0.18, 0.09]);
  fillNoise(5, ["#735033", "#65442d", "#805b39", "#4e3526"]);
  for (let x = 2; x < tile; x += 4) for (let y = 0; y < tile; y += 1) pixel(5, x, y, "#4b3324", 0.65);
  fillNoise(6, ["#9a7244", "#805c37", "#ac8050"]);
  context.strokeStyle = "#5f412a";
  context.lineWidth = 1;
  context.strokeRect((6 % grid) * tile + 3.5, Math.floor(6 / grid) * tile + 3.5, 9, 9);
  context.strokeRect((6 % grid) * tile + 6.5, Math.floor(6 / grid) * tile + 6.5, 3, 3);
  fillNoise(7, ["#3f7c36", "#4d8b3e", "#2f692e", "#599847"]);
  for (let y = 0; y < tile; y += 1) for (let x = 0; x < tile; x += 1) if (random() < 0.16) context.clearRect((7 % grid) * tile + x, Math.floor(7 / grid) * tile + y, 1, 1);
  fillNoise(8, ["#377fc1", "#438dcc", "#2f72b4", "#559bd3"]);
  for (let y = 2; y < tile; y += 5) for (let x = 0; x < tile; x += 1) if ((x + y) % 3) pixel(8, x, y, "#73b2de", 0.42);
  fillNoise(9, ["#767c7d", "#858b8b", "#686d6e"]);
  for (let i = 0; i < 20; i += 1) pixel(9, Math.floor(random() * tile), Math.floor(random() * tile), random() > 0.3 ? "#272b2d" : "#3c4142");
  fillNoise(10, ["#777d7e", "#858b8b", "#686d6e"]);
  for (let i = 0; i < 18; i += 1) pixel(10, Math.floor(random() * tile), Math.floor(random() * tile), random() > 0.4 ? "#b07c5f" : "#d0a37d");
  fillNoise(11, ["#b9864c", "#aa7541", "#c49155", "#976638"]);
  for (let y = 0; y < tile; y += 4) for (let x = 0; x < tile; x += 1) pixel(11, x, y, "#76502f");
  for (let y = 1; y < tile; y += 4) pixel(11, (y * 3) % tile, y, "#724d2e");
  fillNoise(12, ["#92766b", "#a18376", "#82695f"]);
  for (let y = 0; y < tile; y += 5) for (let x = 0; x < tile; x += 1) pixel(12, x, y, "#554f4b");
  for (let x = 0; x < tile; x += 8) for (let y = 0; y < tile; y += 1) pixel(12, x + (Math.floor(y / 5) % 2) * 4, y, "#554f4b");
  context.clearRect((13 % grid) * tile, Math.floor(13 / grid) * tile, tile, tile);
  for (let y = 0; y < tile; y += 1) for (let x = 0; x < tile; x += 1) {
    const edge = x < 2 || y < 2 || x > 13 || y > 13;
    if (edge || (x + y) % 13 === 0) pixel(13, x, y, edge ? "#b7dfdf" : "#d7f1ed", edge ? 0.76 : 0.38);
  }
  fillNoise(14, ["#d6ae43", "#efcd66", "#b9882f", "#f5dc7c"]);
  for (let i = 0; i < 24; i += 1) pixel(14, Math.floor(random() * tile), Math.floor(random() * tile), "#fff2ac");
  fillNoise(15, ["#2f3233", "#454849", "#252829", "#585b5b"]);

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

type GeometryBucket = {
  positions: number[];
  normals: number[];
  colors: number[];
  uvs: number[];
  indices: number[];
};

function emptyBucket(): GeometryBucket {
  return { positions: [], normals: [], colors: [], uvs: [], indices: [] };
}

export class VoxelEngine {
  canvas: HTMLCanvasElement;
  events: EngineEvents;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world = new VoxelWorld();
  atlas: THREE.CanvasTexture;
  terrainGroup = new THREE.Group();
  ambienceGroup = new THREE.Group();
  creatureGroup = new THREE.Group();
  selection: THREE.LineSegments;
  sun: THREE.Mesh;
  moon: THREE.Mesh;
  stars: THREE.Points;
  rain: THREE.LineSegments;
  directional: THREE.DirectionalLight;
  hemisphere: THREE.HemisphereLight;
  audio: SynthAudio;
  settings: GameSettings;

  position = new THREE.Vector3(0, 12, 0);
  velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  grounded = false;
  locked = false;
  running = false;
  titleMode = true;
  persistent = false;
  disposed = false;
  keys = new Set<string>();
  accumulator = 0;
  previousTime = performance.now();
  animationFrame = 0;
  worldTime = 0.32;
  day = 1;
  mode: GameMode = "builder";
  weather: Weather = "clear";
  health = 10;
  hunger = 10;
  selected = 0;
  hotbar: BlockId[] = [...PLACEABLE_BLOCKS];
  inventory: Record<number, number> = {};
  debug = false;
  target: VoxelHit | null = null;
  targetKey = "";
  mineHeld = false;
  miningProgress = 0;
  miningSoundTimer = 0;
  placeCooldown = 0;
  footstepDistance = 0;
  lastPosition = new THREE.Vector3();
  fallVelocity = 0;
  lastHudTime = 0;
  saveTimer = 0;
  toastStage = 0;
  particles: { mesh: THREE.Mesh; velocity: THREE.Vector3; life: number }[] = [];
  creatures: { group: THREE.Group; angle: number; timer: number; bob: number }[] = [];

  constructor(canvas: HTMLCanvasElement, events: EngineEvents, settings = readSettings()) {
    this.canvas = canvas;
    this.events = events;
    this.settings = settings;
    this.weather = settings.weather;
    this.audio = new SynthAudio(settings);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 90);
    this.camera.rotation.order = "YXZ";
    this.atlas = makeAtlas();
    this.scene.add(this.terrainGroup, this.ambienceGroup, this.creatureGroup);
    this.scene.background = new THREE.Color("#78baf2");
    this.scene.fog = new THREE.Fog("#78baf2", 21, 49);

    this.hemisphere = new THREE.HemisphereLight(0xb9ddff, 0x4b3a2d, 1.05);
    this.directional = new THREE.DirectionalLight(0xfff1c7, 1.15);
    this.directional.position.set(18, 30, 12);
    this.scene.add(this.hemisphere, this.directional);

    const outlineGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.008, 1.008, 1.008));
    this.selection = new THREE.LineSegments(outlineGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }));
    this.selection.renderOrder = 10;
    this.selection.visible = false;
    this.scene.add(this.selection);

    const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xfff3bd, fog: false });
    const moonMaterial = new THREE.MeshBasicMaterial({ color: 0xd8e6f4, fog: false });
    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), sunMaterial);
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), moonMaterial);
    this.scene.add(this.sun, this.moon);
    this.stars = this.createStars();
    this.scene.add(this.stars);
    this.rain = this.createRain();
    this.scene.add(this.rain);

    this.createClouds();
    this.previewWorld("WILDERNESS");
    this.bindEvents();
    this.resize();
    this.animationFrame = requestAnimationFrame(this.animate);
  }

  bindEvents() {
    window.addEventListener("resize", this.resize);
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.clearInput);
    window.addEventListener("pagehide", this.onPageHide);
    document.addEventListener("visibilitychange", this.onVisibilityChange);
    document.addEventListener("pointerlockchange", this.onPointerLockChange);
    document.addEventListener("mousemove", this.onMouseMove);
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    window.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("contextmenu", this.preventContextMenu);
  }

  unbindEvents() {
    window.removeEventListener("resize", this.resize);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.clearInput);
    window.removeEventListener("pagehide", this.onPageHide);
    document.removeEventListener("visibilitychange", this.onVisibilityChange);
    document.removeEventListener("pointerlockchange", this.onPointerLockChange);
    document.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    window.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("contextmenu", this.preventContextMenu);
  }

  resize = () => {
    const width = Math.max(1, this.canvas.clientWidth);
    const height = Math.max(1, this.canvas.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  };

  preventContextMenu = (event: Event) => event.preventDefault();

  onPointerLockChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked) {
      this.clearInput();
      this.mineHeld = false;
    } else {
      this.titleMode = false;
      void this.audio.unlock();
    }
    this.events.onLockChange(this.locked);
  };

  onMouseMove = (event: MouseEvent) => {
    if (!this.locked || !this.running) return;
    this.look(event.movementX, event.movementY);
  };

  onMouseDown = (event: MouseEvent) => {
    if (!this.running) return;
    void this.audio.unlock();
    if (!this.locked) {
      void this.canvas.requestPointerLock();
      return;
    }
    if (event.button === 0) this.mineHeld = true;
    else if (event.button === 2) this.placeBlock();
    else if (event.button === 1) this.pickTarget();
  };

  onMouseUp = (event: MouseEvent) => {
    if (event.button === 0) {
      this.mineHeld = false;
      this.miningProgress = 0;
      this.emitHud(true);
    }
  };

  onWheel = (event: WheelEvent) => {
    if (!this.running) return;
    event.preventDefault();
    this.selectSlot(this.selected + (event.deltaY > 0 ? 1 : -1));
  };

  onKeyDown = (event: KeyboardEvent) => {
    if (!this.running) return;
    if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight", "ControlLeft"].includes(event.code)) event.preventDefault();
    if (event.code === "KeyE" && !event.repeat) {
      this.events.onInventoryRequest();
      if (document.pointerLockElement) document.exitPointerLock();
      return;
    }
    if (event.code === "KeyH" && !event.repeat) {
      this.events.onToast("WASD move · Mouse look · Space jump · Hold left harvest · Right click build · E inventory");
    }
    if (event.code === "F3" && !event.repeat) {
      event.preventDefault();
      this.debug = !this.debug;
      this.emitHud(true);
    }
    if (event.code.startsWith("Digit")) {
      const slot = Number(event.code.slice(5)) - 1;
      if (slot >= 0 && slot < 9) this.selectSlot(slot);
    }
    this.keys.add(event.code);
  };

  onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
  };

  clearInput = () => {
    this.keys.clear();
  };

  onPageHide = () => this.saveNow();

  onVisibilityChange = () => {
    if (document.hidden) {
      this.clearInput();
      this.saveNow();
    } else if (this.running) {
      void this.audio.unlock();
    }
  };

  look(dx: number, dy: number) {
    this.yaw -= dx * this.settings.sensitivity;
    this.pitch -= dy * this.settings.sensitivity;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.04, Math.PI / 2 - 0.04);
  }

  setVirtualKey(code: string, down: boolean) {
    if (down) this.keys.add(code);
    else this.keys.delete(code);
  }

  setMining(down: boolean) {
    this.mineHeld = down;
    if (!down) this.miningProgress = 0;
  }

  jump() {
    this.keys.add("Space");
    window.setTimeout(() => this.keys.delete("Space"), 120);
  }

  previewWorld(seed: string) {
    this.persistent = false;
    this.running = false;
    this.titleMode = true;
    this.mode = "builder";
    this.world.generate(seed);
    this.rebuildTerrain();
    this.spawnCreatures();
    this.position.set(0, this.world.surfaceY(0, 0) + 0.51, 0);
    this.camera.position.set(16, 13, 18);
    this.camera.lookAt(0, 6, 0);
    this.emitHud(true);
  }

  createWorld(seed: string, mode: GameMode) {
    clearSavedWorld();
    this.persistent = true;
    this.running = true;
    this.titleMode = false;
    this.mode = mode;
    this.worldTime = 0.32;
    this.day = 1;
    this.health = 10;
    this.hunger = 10;
    this.selected = 0;
    this.hotbar = [...PLACEABLE_BLOCKS];
    this.inventory = {};
    if (mode === "survival") {
      this.inventory[BlockId.Log] = 2;
      this.inventory[BlockId.Glow] = 4;
    }
    this.world.generate(seed.trim() || this.randomSeed());
    this.rebuildTerrain();
    this.spawnCreatures();
    this.respawn(false);
    this.saveSoon();
    this.emitHud(true);
  }

  loadWorld(save: WorldSave) {
    this.persistent = true;
    this.running = true;
    this.titleMode = false;
    this.mode = save.mode === "survival" ? "survival" : "builder";
    this.world.generate(save.seed, save.edits);
    this.rebuildTerrain();
    this.spawnCreatures();
    this.position.set(save.player.x, save.player.y, save.player.z);
    this.yaw = Number(save.player.yaw) || 0;
    this.pitch = clamp(Number(save.player.pitch) || 0, -1.4, 1.4);
    this.inventory = {};
    for (const [key, value] of Object.entries(save.inventory ?? {})) this.inventory[Number(key)] = Number(value) || 0;
    this.hotbar = Array.isArray(save.hotbar) && save.hotbar.length === 9 ? save.hotbar : [...PLACEABLE_BLOCKS];
    this.selected = clamp(Number(save.selected) || 0, 0, 8);
    this.health = clamp(Number(save.health) || 10, 1, 10);
    this.hunger = clamp(Number(save.hunger) || 10, 0, 10);
    this.worldTime = ((Number(save.time) || 0.32) % 1 + 1) % 1;
    this.day = Math.max(1, Number(save.day) || 1);
    this.weather = save.weather === "rain" ? "rain" : this.settings.weather;
    if (this.collidesAt(this.position) || this.position.y < 0) this.respawn(false);
    this.emitHud(true);
  }

  activate() {
    this.running = true;
    this.titleMode = false;
    void this.audio.unlock();
    try {
      void this.canvas.requestPointerLock();
    } catch {
      // Touch devices do not support pointer lock and use the overlay controls.
    }
  }

  pause() {
    this.clearInput();
    this.mineHeld = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  quitToTitle() {
    this.saveNow();
    this.running = false;
    this.titleMode = true;
    this.persistent = false;
    this.clearInput();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  randomSeed() {
    const first = ["MOSS", "EMBER", "CLOUD", "RIVER", "MOON", "PINE", "ECHO", "STAR"];
    const second = ["HOLLOW", "WILD", "VALE", "REACH", "ISLE", "FIELD", "RIDGE", "GROVE"];
    return `${first[Math.floor(Math.random() * first.length)]}-${second[Math.floor(Math.random() * second.length)]}-${Math.floor(100 + Math.random() * 900)}`;
  }

  selectSlot(slot: number) {
    this.selected = (slot + 9) % 9;
    this.audio.play("ui");
    this.emitHud(true);
  }

  assignSelected(block: BlockId) {
    if (!PLACEABLE_BLOCKS.includes(block)) return;
    this.hotbar[this.selected] = block;
    this.audio.play("ui");
    this.saveSoon();
    this.emitHud(true);
  }

  craft(recipeId: "planks" | "brick" | "glass" | "glow") {
    const recipes = {
      planks: { cost: [[BlockId.Log, 1]] as [BlockId, number][], output: [BlockId.Planks, 4] as [BlockId, number] },
      brick: { cost: [[BlockId.Stone, 2]] as [BlockId, number][], output: [BlockId.Brick, 4] as [BlockId, number] },
      glass: { cost: [[BlockId.Sand, 2]] as [BlockId, number][], output: [BlockId.Glass, 4] as [BlockId, number] },
      glow: { cost: [[BlockId.Coal, 1], [BlockId.Glass, 1]] as [BlockId, number][], output: [BlockId.Glow, 2] as [BlockId, number] },
    };
    const recipe = recipes[recipeId];
    if (this.mode === "survival" && recipe.cost.some(([id, amount]) => (this.inventory[id] ?? 0) < amount)) {
      this.events.onToast("Not enough materials yet.");
      this.audio.play("ui");
      return false;
    }
    if (this.mode === "survival") for (const [id, amount] of recipe.cost) this.inventory[id] = (this.inventory[id] ?? 0) - amount;
    const [output, amount] = recipe.output;
    this.inventory[output] = (this.inventory[output] ?? 0) + amount;
    this.audio.play("pickup");
    this.events.onToast(`Crafted ${BLOCKS[output].name} ×${amount}`);
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  pickTarget() {
    if (!this.target) return;
    const slot = this.hotbar.indexOf(this.target.type);
    if (slot >= 0) this.selectSlot(slot);
    else this.assignSelected(this.target.type);
  }

  placeBlock() {
    if (!this.target || this.placeCooldown > 0) return;
    const type = this.hotbar[this.selected];
    if (!PLACEABLE_BLOCKS.includes(type)) return;
    if (this.mode === "survival" && (this.inventory[type] ?? 0) <= 0) {
      this.events.onToast(`Harvest or craft ${BLOCKS[type].name} first.`);
      this.audio.play("ui");
      return;
    }
    const { placeX: x, placeY: y, placeZ: z } = this.target;
    if (y < 1 || y > MAX_WORLD_Y || Math.abs(x) >= WORLD_HALF || Math.abs(z) >= WORLD_HALF) return;
    if (this.world.get(x, y, z) !== BlockId.Air && this.world.get(x, y, z) !== BlockId.Water) return;
    const previous = this.world.get(x, y, z);
    this.world.set(x, y, z, type);
    if (this.collidesAt(this.position)) {
      this.world.set(x, y, z, previous, false);
      this.world.edits.set(keyOf(x, y, z), previous);
      this.events.onToast("You cannot place a block inside yourself.");
      return;
    }
    if (this.mode === "survival") this.inventory[type] = Math.max(0, (this.inventory[type] ?? 0) - 1);
    this.placeCooldown = 0.18;
    this.audio.play("place", type);
    this.spawnParticles(x, y, z, type, 5);
    this.rebuildTerrain();
    this.saveSoon();
    this.emitHud(true);
  }

  breakTarget() {
    if (!this.target || this.target.type === BlockId.Bedrock || this.target.type === BlockId.Water) return;
    const { x, y, z, type } = this.target;
    this.world.set(x, y, z, BlockId.Air);
    this.inventory[type] = (this.inventory[type] ?? 0) + 1;
    this.audio.play("break", type);
    window.setTimeout(() => this.audio.play("pickup", type), 55);
    this.spawnParticles(x, y, z, type, 13);
    this.miningProgress = 0;
    this.target = null;
    this.rebuildTerrain();
    this.saveSoon();
    this.emitHud(true);
  }

  updateMining(dt: number) {
    if (!this.mineHeld || !this.target || !this.locked) {
      if (this.miningProgress > 0) {
        this.miningProgress = Math.max(0, this.miningProgress - dt * 3);
      }
      return;
    }
    if (this.target.type === BlockId.Bedrock) {
      this.miningProgress = 0;
      return;
    }
    const hardness = BLOCKS[this.target.type].hardness;
    const speed = this.mode === "builder" ? 3.6 : 1;
    this.miningProgress += (dt * speed) / Math.max(0.15, hardness);
    this.miningSoundTimer -= dt;
    if (this.miningSoundTimer <= 0) {
      this.audio.play("mine", this.target.type);
      this.miningSoundTimer = 0.16;
    }
    if (this.miningProgress >= 1) this.breakTarget();
  }

  updateTarget() {
    if (!this.running || this.titleMode) {
      this.target = null;
      this.selection.visible = false;
      return;
    }
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    const hit = this.castVoxel(this.camera.position, direction, 6);
    const nextKey = hit ? keyOf(hit.x, hit.y, hit.z) : "";
    if (nextKey !== this.targetKey) {
      this.targetKey = nextKey;
      this.miningProgress = 0;
    }
    this.target = hit;
    this.selection.visible = Boolean(hit);
    if (hit) {
      this.selection.position.set(hit.x, hit.y, hit.z);
      const material = this.selection.material as THREE.LineBasicMaterial;
      material.color.setHSL(0.12, 0.25, 0.9 - this.miningProgress * 0.35);
    }
  }

  castVoxel(origin: THREE.Vector3, direction: THREE.Vector3, reach: number): VoxelHit | null {
    const ox = origin.x + 0.5;
    const oy = origin.y + 0.5;
    const oz = origin.z + 0.5;
    let x = Math.floor(ox);
    let y = Math.floor(oy);
    let z = Math.floor(oz);
    const stepX = direction.x >= 0 ? 1 : -1;
    const stepY = direction.y >= 0 ? 1 : -1;
    const stepZ = direction.z >= 0 ? 1 : -1;
    const deltaX = direction.x === 0 ? Infinity : Math.abs(1 / direction.x);
    const deltaY = direction.y === 0 ? Infinity : Math.abs(1 / direction.y);
    const deltaZ = direction.z === 0 ? Infinity : Math.abs(1 / direction.z);
    let maxX = direction.x === 0 ? Infinity : ((x + (stepX > 0 ? 1 : 0)) - ox) / direction.x;
    let maxY = direction.y === 0 ? Infinity : ((y + (stepY > 0 ? 1 : 0)) - oy) / direction.y;
    let maxZ = direction.z === 0 ? Infinity : ((z + (stepZ > 0 ? 1 : 0)) - oz) / direction.z;
    let distance = 0;
    let previousX = x;
    let previousY = y;
    let previousZ = z;

    while (distance <= reach) {
      const type = this.world.get(x, y, z);
      if (type !== BlockId.Air && type !== BlockId.Water) {
        return { x, y, z, placeX: previousX, placeY: previousY, placeZ: previousZ, type };
      }
      previousX = x;
      previousY = y;
      previousZ = z;
      if (maxX < maxY && maxX < maxZ) {
        x += stepX;
        distance = maxX;
        maxX += deltaX;
      } else if (maxY < maxZ) {
        y += stepY;
        distance = maxY;
        maxY += deltaY;
      } else {
        z += stepZ;
        distance = maxZ;
        maxZ += deltaZ;
      }
    }
    return null;
  }

  updatePlayer(dt: number) {
    const forwardAmount = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
    const rightAmount = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
    const moving = forwardAmount !== 0 || rightAmount !== 0;
    const sprinting = moving && (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) && this.hunger > 0.5;
    const crouching = this.keys.has("ControlLeft");
    const speed = crouching ? 2.15 : sprinting ? 6.35 : 4.35;
    const length = Math.hypot(forwardAmount, rightAmount) || 1;
    const f = forwardAmount / length;
    const r = rightAmount / length;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const desiredX = (-sin * f + cos * r) * speed;
    const desiredZ = (-cos * f - sin * r) * speed;
    const acceleration = this.grounded ? 18 : 7;
    this.velocity.x += (desiredX - this.velocity.x) * Math.min(1, acceleration * dt);
    this.velocity.z += (desiredZ - this.velocity.z) * Math.min(1, acceleration * dt);
    if (!moving) {
      const drag = this.grounded ? 13 : 1.2;
      this.velocity.x *= Math.max(0, 1 - drag * dt);
      this.velocity.z *= Math.max(0, 1 - drag * dt);
    }

    if (this.grounded && this.keys.has("Space")) {
      this.velocity.y = 8.15;
      this.grounded = false;
      this.audio.play("jump");
    }
    this.velocity.y -= 24 * dt;
    this.fallVelocity = Math.min(this.fallVelocity, this.velocity.y);

    this.moveWithCollisions(this.velocity.x * dt, 0, 0);
    this.moveWithCollisions(0, this.velocity.y * dt, 0);
    this.moveWithCollisions(0, 0, this.velocity.z * dt);
    const wasGrounded = this.grounded;
    this.grounded = this.collidesAt(new THREE.Vector3(this.position.x, this.position.y - 0.055, this.position.z));
    if (!wasGrounded && this.grounded) {
      this.audio.play("land", this.blockUnderfoot());
      if (this.mode === "survival" && this.fallVelocity < -11.2) {
        const damage = Math.min(6, Math.max(1, Math.floor((-this.fallVelocity - 9) / 2)));
        this.health -= damage;
        this.audio.play("hurt");
        this.events.onToast(`Oof. You lost ${damage} ${damage === 1 ? "heart" : "hearts"}.`);
        if (this.health <= 0) this.respawn(true);
      }
      this.fallVelocity = 0;
    }

    this.position.x = clamp(this.position.x, -WORLD_HALF + 0.8, WORLD_HALF - 0.8);
    this.position.z = clamp(this.position.z, -WORLD_HALF + 0.8, WORLD_HALF - 0.8);
    if (this.position.y < -4) this.respawn(true);

    const horizontalTravel = Math.hypot(this.position.x - this.lastPosition.x, this.position.z - this.lastPosition.z);
    if (this.grounded && moving) {
      this.footstepDistance += horizontalTravel;
      if (this.footstepDistance > (sprinting ? 1.45 : 1.85)) {
        this.footstepDistance = 0;
        this.audio.play("step", this.blockUnderfoot());
      }
    }
    this.lastPosition.copy(this.position);

    if (this.mode === "survival") {
      this.hunger = Math.max(0, this.hunger - dt * (sprinting ? 0.009 : 0.0025));
      if (this.hunger <= 0 && Math.floor(performance.now() / 2500) !== Math.floor((performance.now() - dt * 1000) / 2500)) {
        this.health -= 1;
        if (this.health <= 0) this.respawn(true);
      }
    }
  }

  moveWithCollisions(dx: number, dy: number, dz: number) {
    const distance = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    const steps = Math.max(1, Math.ceil(distance / 0.14));
    const sx = dx / steps;
    const sy = dy / steps;
    const sz = dz / steps;
    for (let i = 0; i < steps; i += 1) {
      const candidate = new THREE.Vector3(this.position.x + sx, this.position.y + sy, this.position.z + sz);
      if (!this.collidesAt(candidate)) {
        this.position.copy(candidate);
      } else {
        if (dx) this.velocity.x = 0;
        if (dy) this.velocity.y = 0;
        if (dz) this.velocity.z = 0;
        break;
      }
    }
  }

  collidesAt(position: THREE.Vector3) {
    const minX = Math.floor(position.x - PLAYER_RADIUS + 0.5);
    const maxX = Math.floor(position.x + PLAYER_RADIUS - 0.001 + 0.5);
    const minY = Math.floor(position.y + 0.5);
    const maxY = Math.floor(position.y + PLAYER_HEIGHT - 0.001 + 0.5);
    const minZ = Math.floor(position.z - PLAYER_RADIUS + 0.5);
    const maxZ = Math.floor(position.z + PLAYER_RADIUS - 0.001 + 0.5);
    for (let x = minX; x <= maxX; x += 1) {
      for (let y = minY; y <= maxY; y += 1) {
        for (let z = minZ; z <= maxZ; z += 1) {
          if (BLOCKS[this.world.get(x, y, z)].solid) return true;
        }
      }
    }
    return false;
  }

  blockUnderfoot() {
    return this.world.get(Math.floor(this.position.x + 0.5), Math.floor(this.position.y - 0.08 + 0.5), Math.floor(this.position.z + 0.5));
  }

  respawn(announce: boolean) {
    this.position.set(0, this.world.surfaceY(0, 0) + 0.51, 0);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.health = 10;
    this.hunger = Math.max(this.hunger, 6);
    this.fallVelocity = 0;
    if (announce) {
      this.audio.play("hurt");
      this.events.onDeath();
      this.events.onToast("The wild carried you home.");
    }
    this.saveSoon();
    this.emitHud(true);
  }

  updateDayNight(dt: number) {
    if (this.running && !this.titleMode) {
      this.worldTime += dt / 300;
      if (this.worldTime >= 1) {
        this.worldTime -= 1;
        this.day += 1;
      }
    }
    const angle = this.worldTime * Math.PI * 2 - Math.PI / 2;
    const sunHeight = Math.sin(angle);
    const daylight = clamp((sunHeight + 0.18) / 0.45, 0.06, 1);
    const dawn = Math.pow(1 - Math.abs(sunHeight), 5) * (sunHeight > -0.35 ? 1 : 0);
    const night = new THREE.Color("#071329");
    const day = new THREE.Color("#79baf1");
    const dusk = new THREE.Color("#e88b62");
    const sky = night.clone().lerp(day, daylight).lerp(dusk, dawn * 0.32);
    this.scene.background = sky;
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.color.copy(sky);
    this.hemisphere.intensity = 0.18 + daylight * 0.92;
    this.hemisphere.color.set(daylight > 0.3 ? 0xb9ddff : 0x5875a3);
    this.directional.intensity = 0.12 + daylight * 1.05;
    this.directional.color.set(dawn > 0.25 ? 0xffb483 : 0xfff1c7);

    const celestialDistance = 43;
    this.sun.position.set(
      this.camera.position.x + Math.cos(angle) * celestialDistance,
      this.camera.position.y + Math.sin(angle) * celestialDistance,
      this.camera.position.z - 18,
    );
    this.moon.position.set(
      this.camera.position.x - Math.cos(angle) * celestialDistance,
      this.camera.position.y - Math.sin(angle) * celestialDistance,
      this.camera.position.z + 18,
    );
    this.sun.lookAt(this.camera.position);
    this.moon.lookAt(this.camera.position);
    this.sun.visible = sunHeight > -0.18;
    this.moon.visible = sunHeight < 0.22;
    (this.stars.material as THREE.PointsMaterial).opacity = clamp(1 - daylight * 1.45, 0, 0.9);
    this.stars.position.copy(this.camera.position);
    this.directional.position.set(Math.cos(angle) * 25, Math.sin(angle) * 35, -14);
  }

  updateCreatures(dt: number) {
    for (const creature of this.creatures) {
      creature.timer -= dt;
      creature.bob += dt * 4;
      if (creature.timer <= 0) {
        creature.angle += (Math.random() - 0.5) * 2.2;
        creature.timer = 2 + Math.random() * 4;
      }
      const speed = 0.28;
      const nx = creature.group.position.x + Math.cos(creature.angle) * speed * dt;
      const nz = creature.group.position.z + Math.sin(creature.angle) * speed * dt;
      if (Math.abs(nx) < WORLD_HALF - 2 && Math.abs(nz) < WORLD_HALF - 2) {
        const surface = this.world.surfaceY(Math.round(nx), Math.round(nz));
        if (surface > WATER_LEVEL) {
          creature.group.position.x = nx;
          creature.group.position.z = nz;
          creature.group.position.y = surface + 0.63 + Math.sin(creature.bob) * 0.025;
        } else creature.angle += Math.PI * 0.7;
      }
      creature.group.rotation.y = -creature.angle + Math.PI / 2;
    }
  }

  updateRain(dt: number) {
    this.rain.visible = this.weather === "rain";
    if (!this.rain.visible) return;
    const attribute = this.rain.geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let i = 0; i < array.length; i += 6) {
      array[i + 1] -= dt * 22;
      array[i + 4] -= dt * 22;
      if (array[i + 1] < -2) {
        const reset = 14 + Math.random() * 10;
        array[i + 1] = reset;
        array[i + 4] = reset - 0.75;
        const x = (Math.random() - 0.5) * 30;
        const z = (Math.random() - 0.5) * 30;
        array[i] = array[i + 3] = x;
        array[i + 2] = array[i + 5] = z;
      }
    }
    attribute.needsUpdate = true;
    this.rain.position.set(this.camera.position.x, this.camera.position.y - 2, this.camera.position.z);
  }

  updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const particle = this.particles[i];
      particle.life -= dt;
      particle.velocity.y -= 12 * dt;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      particle.mesh.rotation.x += dt * 5;
      particle.mesh.rotation.y += dt * 4;
      const scale = clamp(particle.life * 2.4, 0, 1);
      particle.mesh.scale.setScalar(scale);
      if (particle.life <= 0) {
        this.scene.remove(particle.mesh);
        particle.mesh.geometry.dispose();
        (particle.mesh.material as THREE.Material).dispose();
        this.particles.splice(i, 1);
      }
    }
  }

  animate = (now: number) => {
    if (this.disposed) return;
    const rawDt = (now - this.previousTime) / 1000;
    const dt = Math.min(0.08, Math.max(0, rawDt));
    this.previousTime = now;
    this.placeCooldown = Math.max(0, this.placeCooldown - dt);

    if (this.titleMode) {
      const t = now * 0.000055;
      this.camera.position.set(Math.sin(t) * 20, 13 + Math.sin(t * 1.8) * 1.2, Math.cos(t) * 20);
      this.camera.lookAt(0, 6, 0);
    } else {
      if (this.running && this.locked) {
        this.accumulator = Math.min(this.accumulator + dt, PHYSICS_STEP * 4);
        while (this.accumulator >= PHYSICS_STEP) {
          this.updatePlayer(PHYSICS_STEP);
          this.updateMining(PHYSICS_STEP);
          this.accumulator -= PHYSICS_STEP;
        }
      }
      this.camera.position.set(this.position.x, this.position.y + 1.62, this.position.z);
      this.camera.rotation.set(this.pitch, this.yaw, 0);
      this.updateTarget();
    }

    this.updateDayNight(dt);
    this.updateCreatures(dt);
    this.updateRain(dt);
    this.updateParticles(dt);
    this.ambienceGroup.children.forEach((cloud, index) => {
      if (cloud.userData.cloud) {
        cloud.position.x += dt * (0.18 + index * 0.015);
        if (cloud.position.x > WORLD_HALF + 14) cloud.position.x = -WORLD_HALF - 14;
      }
    });
    this.renderer.render(this.scene, this.camera);
    this.emitHud(false, now);
    this.animationFrame = requestAnimationFrame(this.animate);
  };

  emitHud(force = false, now = performance.now()) {
    if (!force && now - this.lastHudTime < 125) return;
    this.lastHudTime = now;
    const totalMinutes = Math.floor(((this.worldTime + 0.25) % 1) * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const suffix = hours >= 12 ? "PM" : "AM";
    const displayHour = hours % 12 || 12;
    const surface = this.world.surfaceY(Math.round(this.position.x), Math.round(this.position.z));
    const biome = surface <= WATER_LEVEL ? "Shallows" : surface >= 13 ? "Highlands" : "Wildwood Meadow";
    this.events.onHud({
      health: clamp(this.health, 0, 10),
      hunger: clamp(this.hunger, 0, 10),
      hotbar: [...this.hotbar],
      selected: this.selected,
      counts: { ...this.inventory },
      targetName: this.target ? BLOCKS[this.target.type].name : null,
      breakProgress: clamp(this.miningProgress, 0, 1),
      day: this.day,
      clock: `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`,
      biome,
      coordinates: [Math.round(this.position.x), Math.round(this.position.y), Math.round(this.position.z)],
      debug: this.debug,
      mode: this.mode,
      weather: this.weather,
    });
  }

  faceVisible(type: BlockId, neighbor: BlockId) {
    if (neighbor === BlockId.Air) return true;
    const currentLayer = BLOCKS[type].layer;
    const neighborLayer = BLOCKS[neighbor].layer;
    if (currentLayer === "transparent") return neighbor !== type && neighborLayer !== "opaque";
    if (currentLayer === "cutout") return neighbor !== type && neighborLayer !== "opaque";
    return neighborLayer === "transparent" || neighborLayer === "cutout";
  }

  rebuildTerrain() {
    while (this.terrainGroup.children.length) {
      const child = this.terrainGroup.children.pop();
      if (child instanceof THREE.Mesh) child.geometry.dispose();
    }
    const buckets: Record<Exclude<RenderLayer, "none">, GeometryBucket> = {
      opaque: emptyBucket(),
      cutout: emptyBucket(),
      transparent: emptyBucket(),
    };
    const grid = 4;
    const pad = 0.0015;

    for (const [key, type] of this.world.blocks.entries()) {
      const definition = BLOCKS[type];
      if (definition.layer === "none") continue;
      const [x, y, z] = parseKey(key);
      const bucket = buckets[definition.layer];
      for (let faceIndex = 0; faceIndex < FACES.length; faceIndex += 1) {
        const face = FACES[faceIndex];
        const [dx, dy, dz] = face.direction;
        const neighbor = this.world.get(x + dx, y + dy, z + dz);
        if (!this.faceVisible(type, neighbor)) continue;
        const tileIndex = dy > 0 ? definition.top : dy < 0 ? definition.bottom : definition.side;
        const column = tileIndex % grid;
        const row = Math.floor(tileIndex / grid);
        const u0 = column / grid + pad;
        const u1 = (column + 1) / grid - pad;
        const v0 = 1 - (row + 1) / grid + pad;
        const v1 = 1 - row / grid - pad;
        const base = bucket.positions.length / 3;
        const waterDrop = type === BlockId.Water ? -0.045 : 0;
        for (const [cx, cy, cz] of face.corners) {
          const adjustedY = type === BlockId.Water && cy > 0 ? cy - 0.09 : cy;
          bucket.positions.push(x + cx, y + adjustedY + waterDrop, z + cz);
          bucket.normals.push(dx, dy, dz);
          bucket.colors.push(face.shade, face.shade, face.shade);
        }
        bucket.uvs.push(u0, v0, u0, v1, u1, v1, u1, v0);
        bucket.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
      }
    }

    const materials: Record<Exclude<RenderLayer, "none">, THREE.Material> = {
      opaque: new THREE.MeshLambertMaterial({ map: this.atlas, vertexColors: true }),
      cutout: new THREE.MeshLambertMaterial({ map: this.atlas, vertexColors: true, alphaTest: 0.35, side: THREE.DoubleSide }),
      transparent: new THREE.MeshLambertMaterial({ map: this.atlas, vertexColors: true, transparent: true, opacity: 0.72, depthWrite: false, side: THREE.DoubleSide }),
    };
    for (const layer of ["opaque", "cutout", "transparent"] as const) {
      const bucket = buckets[layer];
      if (!bucket.positions.length) continue;
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(bucket.positions, 3));
      geometry.setAttribute("normal", new THREE.Float32BufferAttribute(bucket.normals, 3));
      geometry.setAttribute("color", new THREE.Float32BufferAttribute(bucket.colors, 3));
      geometry.setAttribute("uv", new THREE.Float32BufferAttribute(bucket.uvs, 2));
      geometry.setIndex(bucket.indices);
      geometry.computeBoundingSphere();
      const mesh = new THREE.Mesh(geometry, materials[layer]);
      mesh.renderOrder = layer === "transparent" ? 2 : layer === "cutout" ? 1 : 0;
      this.terrainGroup.add(mesh);
    }
  }

  createStars() {
    const positions: number[] = [];
    for (let i = 0; i < 240; i += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.15 + Math.random() * 0.85);
      const radius = 54;
      positions.push(Math.sin(phi) * Math.cos(theta) * radius, Math.cos(phi) * radius, Math.sin(phi) * Math.sin(theta) * radius);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffffff, size: 0.38, sizeAttenuation: true, transparent: true, opacity: 0 }));
  }

  createRain() {
    const positions: number[] = [];
    for (let i = 0; i < 420; i += 1) {
      const x = (Math.random() - 0.5) * 30;
      const y = Math.random() * 22;
      const z = (Math.random() - 0.5) * 30;
      positions.push(x, y, z, x, y - 0.75, z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({ color: 0xa8d8ff, transparent: true, opacity: 0.45, depthWrite: false });
    const rain = new THREE.LineSegments(geometry, material);
    rain.visible = false;
    rain.renderOrder = 4;
    return rain;
  }

  createClouds() {
    const material = new THREE.MeshLambertMaterial({ color: 0xf2f4ef, transparent: true, opacity: 0.82, depthWrite: false });
    for (let i = 0; i < 10; i += 1) {
      const cloud = new THREE.Group();
      cloud.userData.cloud = true;
      const pieces = 2 + (i % 3);
      for (let p = 0; p < pieces; p += 1) {
        const cube = new THREE.Mesh(new THREE.BoxGeometry(4 + p * 1.5, 0.8, 2.2), material);
        cube.position.set(p * 2.3, (p % 2) * 0.35, (p % 3) - 1);
        cloud.add(cube);
      }
      cloud.position.set(-WORLD_HALF + ((i * 13) % (WORLD_SIZE + 20)), 20 + (i % 3) * 1.8, -24 + ((i * 11) % 48));
      this.ambienceGroup.add(cloud);
    }
  }

  spawnCreatures() {
    while (this.creatureGroup.children.length) this.creatureGroup.remove(this.creatureGroup.children[0]);
    this.creatures = [];
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: 0x5c8f46 });
    const bellyMaterial = new THREE.MeshLambertMaterial({ color: 0xa7c47f });
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x182016 });
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * Math.PI * 2 + 0.7;
      const radius = 8 + (i % 3) * 5;
      const x = Math.round(Math.cos(angle) * radius);
      const z = Math.round(Math.sin(angle) * radius);
      const y = this.world.surfaceY(x, z) + 0.63;
      if (y <= WATER_LEVEL + 0.6) continue;
      const group = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.62, 0.55), bodyMaterial);
      const belly = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.34, 0.57), bellyMaterial);
      belly.position.set(0, -0.08, 0.08);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.48, 0.48), bodyMaterial);
      head.position.set(0, 0.28, -0.42);
      const eyeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.03), eyeMaterial);
      eyeLeft.position.set(-0.13, 0.35, -0.675);
      const eyeRight = eyeLeft.clone();
      eyeRight.position.x = 0.13;
      const legGeometry = new THREE.BoxGeometry(0.16, 0.32, 0.16);
      for (const lx of [-0.26, 0.26]) for (const lz of [-0.16, 0.18]) {
        const leg = new THREE.Mesh(legGeometry, bodyMaterial);
        leg.position.set(lx, -0.38, lz);
        group.add(leg);
      }
      group.add(body, belly, head, eyeLeft, eyeRight);
      group.position.set(x, y, z);
      this.creatureGroup.add(group);
      this.creatures.push({ group, angle: Math.random() * Math.PI * 2, timer: 1 + Math.random() * 3, bob: Math.random() * 5 });
    }
  }

  spawnParticles(x: number, y: number, z: number, type: BlockId, count: number) {
    const color = BLOCKS[type].color;
    for (let i = 0; i < count; i += 1) {
      const size = 0.07 + Math.random() * 0.09;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial({ color }));
      mesh.position.set(x + (Math.random() - 0.5) * 0.7, y + (Math.random() - 0.5) * 0.7, z + (Math.random() - 0.5) * 0.7);
      this.scene.add(mesh);
      this.particles.push({
        mesh,
        velocity: new THREE.Vector3((Math.random() - 0.5) * 2.5, 1.4 + Math.random() * 2.1, (Math.random() - 0.5) * 2.5),
        life: 0.45 + Math.random() * 0.35,
      });
    }
  }

  setSettings(next: Partial<GameSettings>) {
    this.settings = {
      ...this.settings,
      ...next,
      volume: clamp(next.volume ?? this.settings.volume, 0, 1),
      sensitivity: clamp(next.sensitivity ?? this.settings.sensitivity, 0.0008, 0.005),
      fov: clamp(next.fov ?? this.settings.fov, 55, 100),
    };
    this.weather = this.settings.weather;
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    this.audio.setSettings(this.settings);
    writeSettings(this.settings);
    this.emitHud(true);
  }

  setWeather(weather: Weather) {
    this.weather = weather;
    this.setSettings({ weather });
    this.events.onToast(weather === "rain" ? "A rainstorm rolls across the wild." : "The clouds begin to clear.");
  }

  saveSoon() {
    if (!this.persistent) return;
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.saveNow(), 650);
  }

  serialize(): WorldSave {
    return {
      version: 1,
      seed: this.world.seedText,
      mode: this.mode,
      edits: Object.fromEntries(this.world.edits.entries()),
      player: { x: this.position.x, y: this.position.y, z: this.position.z, yaw: this.yaw, pitch: this.pitch },
      inventory: Object.fromEntries(Object.entries(this.inventory).map(([key, value]) => [String(key), value])),
      hotbar: [...this.hotbar],
      selected: this.selected,
      health: this.health,
      hunger: this.hunger,
      time: this.worldTime,
      day: this.day,
      weather: this.weather,
      savedAt: Date.now(),
    };
  }

  saveNow() {
    if (!this.persistent) return;
    window.clearTimeout(this.saveTimer);
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize()));
      this.events.onSave();
    } catch {
      this.events.onToast("This browser could not save the world.");
    }
  }

  dispose() {
    this.disposed = true;
    this.saveNow();
    cancelAnimationFrame(this.animationFrame);
    window.clearTimeout(this.saveTimer);
    this.unbindEvents();
    this.audio.dispose();
    this.atlas.dispose();
    this.renderer.dispose();
    for (const particle of this.particles) {
      particle.mesh.geometry.dispose();
      (particle.mesh.material as THREE.Material).dispose();
    }
  }
}
