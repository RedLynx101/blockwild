import * as THREE from "three";
import { SynthAudio } from "./audio";
import {
  BLOCKS,
  CREATIVE_BLOCKS,
  ITEMS,
  Item,
  RECIPES,
  SMELTING,
  BlockId,
  cloneSlot,
  itemName,
  maxStack,
  type GameMode,
  type InventorySlot,
  type ItemCode,
  type Recipe,
  type Weather,
} from "./data";
import {
  BIOME_NAMES,
  GENERATOR_VERSION,
  MAX_Y,
  MIN_Y,
  SEA_LEVEL,
  BiomeId,
  ChunkWorld,
  type ChunkEditSave,
} from "./world";

export { BLOCKS, CREATIVE_BLOCKS, ITEMS, Item, RECIPES, BlockId, BIOME_NAMES, type GameMode, type InventorySlot, type ItemCode, type Recipe };

export const SAVE_KEY = "blockwild-world-v2";
export const SETTINGS_KEY = "blockwild-settings-v2";

export type GameSettings = {
  volume: number;
  muted: boolean;
  sensitivity: number;
  fov: number;
  weather: Weather;
  renderDistance: number;
};

export type FurnaceState = {
  input: InventorySlot | null;
  fuel: InventorySlot | null;
  output: InventorySlot | null;
  progress: number;
  burn: number;
  burnMax: number;
};

export type ChestState = Array<InventorySlot | null>;

export type HudState = {
  health: number;
  hunger: number;
  xp: number;
  level: number;
  inventory: Array<InventorySlot | null>;
  cursor: InventorySlot | null;
  craftGrid: Array<InventorySlot | null>;
  craftOutput: InventorySlot | null;
  craftingSize: 2 | 3;
  activeFurnace: FurnaceState | null;
  activeChest: ChestState | null;
  selected: number;
  targetName: string | null;
  targetMob: { name: string; health: number; maxHealth: number } | null;
  breakProgress: number;
  day: number;
  clock: string;
  biome: string;
  depth: string;
  coordinates: [number, number, number];
  debug: boolean;
  mode: GameMode;
  weather: Weather;
  loadedChunks: number;
  queuedChunks: number;
  fullscreen: boolean;
};

export type WorldSave = {
  version: 2;
  generatorVersion: number;
  seed: string;
  mode: GameMode;
  edits: ChunkEditSave;
  player: { x: number; y: number; z: number; yaw: number; pitch: number };
  spawn: { x: number; y: number; z: number };
  inventory: Array<InventorySlot | null>;
  selected: number;
  health: number;
  hunger: number;
  xp: number;
  level: number;
  time: number;
  day: number;
  weather: Weather;
  furnaces: Record<string, FurnaceState>;
  chests: Record<string, ChestState>;
  savedAt: number;
};

export type OverlayKind = "inventory" | "crafting" | "furnace" | "chest";

export type EngineEvents = {
  onHud: (hud: HudState) => void;
  onToast: (message: string) => void;
  onLockChange: (locked: boolean) => void;
  onOverlayRequest: (kind: OverlayKind, key?: string) => void;
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
  distance: number;
};

type MobKind = "mossling" | "ridgeback" | "woolhorn" | "glowmoth" | "shadecrawler" | "caveblob" | "rattlekin";

type MobEntity = {
  id: number;
  kind: MobKind;
  name: string;
  hostile: boolean;
  group: THREE.Group;
  health: number;
  maxHealth: number;
  damage: number;
  angle: number;
  wanderTimer: number;
  attackCooldown: number;
  hurtTimer: number;
  age: number;
  bob: number;
};

type DropEntity = {
  id: number;
  item: ItemCode;
  count: number;
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  age: number;
  pickupDelay: number;
};

type Particle = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
};

const PLAYER_HEIGHT = 1.8;
const PLAYER_RADIUS = 0.3;
const PHYSICS_STEP = 1 / 60;
const INVENTORY_SIZE = 36;
const CRAFT_POSITIONS_2 = [0, 1, 3, 4];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function blockKey(x: number, y: number, z: number) {
  return `${x},${y},${z}`;
}

export function readSavedWorld(): WorldSave | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as WorldSave;
    if (parsed.version !== 2 || parsed.generatorVersion !== GENERATOR_VERSION || typeof parsed.seed !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSavedWorld() {
  if (typeof window !== "undefined") window.localStorage.removeItem(SAVE_KEY);
}

export function readSettings(): GameSettings {
  const mobile = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false);
  const fallback: GameSettings = { volume: 0.55, muted: false, sensitivity: 0.0022, fov: 72, weather: "clear", renderDistance: mobile ? 2 : 3 };
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
      renderDistance: clamp(Math.round(Number(parsed.renderDistance ?? fallback.renderDistance)), 2, 5),
    };
  } catch {
    return fallback;
  }
}

function writeSettings(settings: GameSettings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Private browsing may disable storage.
  }
}

function blankInventory() {
  return Array.from({ length: INVENTORY_SIZE }, () => null as InventorySlot | null);
}

function blankFurnace(): FurnaceState {
  return { input: null, fuel: null, output: null, progress: 0, burn: 0, burnMax: 0 };
}

export class VoxelEngine {
  canvas: HTMLCanvasElement;
  events: EngineEvents;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world = new ChunkWorld();
  ambienceGroup = new THREE.Group();
  creatureGroup = new THREE.Group();
  dropGroup = new THREE.Group();
  selection: THREE.LineSegments;
  sun: THREE.Mesh;
  moon: THREE.Mesh;
  stars: THREE.Points;
  rain: THREE.LineSegments;
  directional: THREE.DirectionalLight;
  hemisphere: THREE.HemisphereLight;
  caveLight: THREE.PointLight;
  audio: SynthAudio;
  settings: GameSettings;
  resizeObserver: ResizeObserver | null = null;

  position = new THREE.Vector3(0, 48, 0);
  spawn = new THREE.Vector3(0, 48, 0);
  velocity = new THREE.Vector3();
  yaw = 0;
  pitch = 0;
  grounded = false;
  locked = false;
  touchMode = false;
  running = false;
  paused = true;
  titleMode = true;
  persistent = false;
  disposed = false;
  keys = new Set<string>();
  accumulator = 0;
  previousTime = performance.now();
  animationFrame = 0;
  worldTime = 0.32;
  day = 1;
  mode: GameMode = "survival";
  weather: Weather = "clear";
  health = 10;
  hunger = 10;
  xp = 0;
  level = 0;
  selected = 0;
  inventory = blankInventory();
  cursor: InventorySlot | null = null;
  craftGrid: Array<InventorySlot | null> = Array.from({ length: 9 }, () => null);
  craftingSize: 2 | 3 = 2;
  activeFurnaceKey: string | null = null;
  activeChestKey: string | null = null;
  furnaces = new Map<string, FurnaceState>();
  chests = new Map<string, ChestState>();
  debug = false;
  fullscreen = false;
  target: VoxelHit | null = null;
  targetKey = "";
  targetMob: MobEntity | null = null;
  mineHeld = false;
  miningProgress = 0;
  miningSoundTimer = 0;
  placeCooldown = 0;
  attackCooldown = 0;
  playerInvulnerability = 0;
  fluidDamageTimer = 0;
  regenTimer = 0;
  spawnProtection = 20;
  footstepDistance = 0;
  lastPosition = new THREE.Vector3();
  fallVelocity = 0;
  wasInWater = false;
  lastHudTime = 0;
  saveTimer = 0;
  autoSaveAccumulator = 0;
  particles: Particle[] = [];
  mobs: MobEntity[] = [];
  drops: DropEntity[] = [];
  nextMobId = 1;
  nextDropId = 1;
  mobSpawnTimer = 2;
  mobRaycaster = new THREE.Raycaster();
  activeRecipe: Recipe | null = null;
  sharedDropGeometry = new THREE.BoxGeometry(0.23, 0.23, 0.23);
  dropMaterials = new Map<number, THREE.MeshLambertMaterial>();

  constructor(canvas: HTMLCanvasElement, events: EngineEvents, settings = readSettings()) {
    this.canvas = canvas;
    this.events = events;
    this.settings = settings;
    this.weather = settings.weather;
    this.touchMode = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    this.audio = new SynthAudio(settings);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, this.touchMode ? 1.2 : 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 256);
    this.camera.rotation.order = "YXZ";
    this.world.setRenderDistance(settings.renderDistance);
    this.scene.add(this.world.group, this.ambienceGroup, this.creatureGroup, this.dropGroup);
    this.scene.background = new THREE.Color("#78baf2");
    this.scene.fog = new THREE.Fog("#78baf2", 30, 62);

    this.hemisphere = new THREE.HemisphereLight(0xb9ddff, 0x4b3a2d, 1.05);
    this.directional = new THREE.DirectionalLight(0xfff1c7, 1.15);
    this.directional.position.set(18, 30, 12);
    this.caveLight = new THREE.PointLight(0xffd694, 0, 13, 1.4);
    this.scene.add(this.hemisphere, this.directional, this.caveLight);

    const outlineGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.008, 1.008, 1.008));
    this.selection = new THREE.LineSegments(outlineGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }));
    this.selection.renderOrder = 10;
    this.selection.visible = false;
    this.scene.add(this.selection);

    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(5, 5), new THREE.MeshBasicMaterial({ color: 0xfff3bd, fog: false }));
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), new THREE.MeshBasicMaterial({ color: 0xd8e6f4, fog: false }));
    this.scene.add(this.sun, this.moon);
    this.stars = this.createStars();
    this.scene.add(this.stars);
    this.rain = this.createRain();
    this.scene.add(this.rain);
    this.createClouds();
    this.previewWorld("WILDERNESS");
    this.bindEvents();
    this.resize();
    this.resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(this.resize) : null;
    this.resizeObserver?.observe(this.canvas);
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
    document.addEventListener("fullscreenchange", this.onFullscreenChange);
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
    document.removeEventListener("fullscreenchange", this.onFullscreenChange);
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

  onFullscreenChange = () => {
    this.fullscreen = Boolean(document.fullscreenElement);
    this.resize();
    this.emitHud(true);
  };

  onPointerLockChange = () => {
    this.locked = document.pointerLockElement === this.canvas;
    if (!this.locked) {
      if (this.running && !this.touchMode) this.paused = true;
      this.clearInput();
      this.mineHeld = false;
    } else {
      this.paused = false;
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
    if (!this.locked && !this.touchMode) {
      void this.canvas.requestPointerLock();
      return;
    }
    if (event.button === 0) {
      if (this.targetMob) this.attackTargetMob();
      else this.mineHeld = true;
    } else if (event.button === 2) this.useSelected();
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
      this.openOverlay("inventory");
      return;
    }
    if (event.code === "KeyF" && !event.repeat) {
      event.preventDefault();
      void this.toggleFullscreen();
    }
    if (event.code === "KeyQ" && !event.repeat) this.dropSelectedItem();
    if (event.code === "KeyH" && !event.repeat) this.events.onToast("WASD move · Space jump/swim · Shift sprint · Left harvest/attack · Right use/build · E inventory · F fullscreen");
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

  onKeyUp = (event: KeyboardEvent) => this.keys.delete(event.code);
  clearInput = () => this.keys.clear();
  onPageHide = () => this.saveNow(false);

  onVisibilityChange = () => {
    if (document.hidden) {
      this.clearInput();
      this.saveNow(false);
    } else if (this.running) void this.audio.unlock();
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
    window.setTimeout(() => this.keys.delete("Space"), 130);
  }

  randomSeed() {
    const first = ["MOSS", "EMBER", "CLOUD", "RIVER", "MOON", "PINE", "ECHO", "STAR", "CRYSTAL", "THUNDER"];
    const second = ["HOLLOW", "WILD", "VALE", "REACH", "ISLE", "FIELD", "RIDGE", "GROVE", "DEEPS", "FRONTIER"];
    return `${first[Math.floor(Math.random() * first.length)]}-${second[Math.floor(Math.random() * second.length)]}-${Math.floor(100 + Math.random() * 900)}`;
  }

  findSpawn() {
    let best = { x: 0, z: 0, score: -Infinity };
    for (let radius = 0; radius <= 128; radius += 4) {
      const steps = Math.max(1, Math.ceil((Math.PI * 2 * radius) / 8));
      for (let step = 0; step < steps; step += 1) {
        const angle = (step / steps) * Math.PI * 2;
        const x = Math.round(Math.cos(angle) * radius);
        const z = Math.round(Math.sin(angle) * radius);
        const sample = this.world.sampleColumn(x, z);
        if (sample.height <= sample.waterline + 2) continue;
        if (![BiomeId.Meadow, BiomeId.Wildwood, BiomeId.Birchlight, BiomeId.Savanna].includes(sample.biome)) continue;
        const slope = Math.max(
          Math.abs(sample.height - this.world.sampleColumn(x + 2, z).height),
          Math.abs(sample.height - this.world.sampleColumn(x, z + 2).height),
        );
        const score = -radius - slope * 18 + (sample.biome === BiomeId.Meadow ? 15 : 0);
        if (slope <= 2 && score > best.score) best = { x, z, score };
      }
      if (best.score > -Infinity && radius > 28) break;
    }
    return best;
  }

  previewWorld(seed: string) {
    this.persistent = false;
    this.running = false;
    this.paused = true;
    this.titleMode = true;
    this.mode = "builder";
    this.clearEntities();
    this.world.reset(seed);
    const spawn = this.findSpawn();
    this.world.initializeAround(spawn.x, spawn.z);
    const y = this.world.surfaceAt(spawn.x, spawn.z) + 0.51;
    this.spawn.set(spawn.x, y, spawn.z);
    this.position.copy(this.spawn);
    this.emitHud(true);
  }

  createWorld(seed: string, mode: GameMode) {
    clearSavedWorld();
    this.persistent = true;
    this.running = true;
    this.paused = false;
    this.titleMode = false;
    this.mode = mode;
    this.worldTime = 0.32;
    this.day = 1;
    this.health = 10;
    this.hunger = 10;
    this.xp = 0;
    this.level = 0;
    this.selected = 0;
    this.inventory = blankInventory();
    this.cursor = null;
    this.craftGrid = Array.from({ length: 9 }, () => null);
    this.furnaces.clear();
    this.chests.clear();
    this.clearEntities();
    this.world.reset(seed.trim() || this.randomSeed());
    const spawn = this.findSpawn();
    this.world.initializeAround(spawn.x, spawn.z);
    const y = this.world.surfaceAt(spawn.x, spawn.z) + 0.51;
    this.spawn.set(spawn.x, y, spawn.z);
    this.position.copy(this.spawn);
    for (let dx = -1; dx <= 1; dx += 1) for (let dz = -1; dz <= 1; dz += 1) {
      for (let clearY = Math.floor(y + 0.5); clearY <= Math.floor(y + 2.5); clearY += 1) this.world.setBlock(spawn.x + dx, clearY, spawn.z + dz, BlockId.Air, false);
    }
    if (mode === "survival") {
      this.inventory[0] = { item: Item.Berry, count: 3 };
    } else {
      for (let index = 0; index < Math.min(INVENTORY_SIZE, CREATIVE_BLOCKS.length); index += 1) this.inventory[index] = { item: CREATIVE_BLOCKS[index], count: 64 };
    }
    this.spawnProtection = 22;
    this.saveSoon();
    this.emitHud(true);
  }

  loadWorld(save: WorldSave) {
    this.persistent = true;
    this.running = true;
    this.paused = false;
    this.titleMode = false;
    this.mode = save.mode === "builder" ? "builder" : "survival";
    this.clearEntities();
    this.world.reset(save.seed, save.edits);
    this.world.initializeAround(save.player.x, save.player.z);
    this.position.set(save.player.x, save.player.y, save.player.z);
    this.spawn.set(save.spawn?.x ?? 0, save.spawn?.y ?? this.world.surfaceAt(0, 0) + 0.51, save.spawn?.z ?? 0);
    this.yaw = Number(save.player.yaw) || 0;
    this.pitch = clamp(Number(save.player.pitch) || 0, -1.4, 1.4);
    this.inventory = blankInventory();
    for (let index = 0; index < Math.min(INVENTORY_SIZE, save.inventory?.length ?? 0); index += 1) this.inventory[index] = cloneSlot(save.inventory[index]);
    this.selected = clamp(Number(save.selected) || 0, 0, 8);
    this.health = clamp(Number(save.health) || 10, 1, 10);
    this.hunger = clamp(Number(save.hunger) || 10, 0, 10);
    this.xp = Math.max(0, Number(save.xp) || 0);
    this.level = Math.max(0, Number(save.level) || 0);
    this.worldTime = ((Number(save.time) || 0.32) % 1 + 1) % 1;
    this.day = Math.max(1, Number(save.day) || 1);
    this.weather = save.weather === "rain" ? "rain" : "clear";
    this.furnaces = new Map(Object.entries(save.furnaces ?? {}).map(([key, value]) => [key, { ...blankFurnace(), ...value }]));
    this.chests = new Map(Object.entries(save.chests ?? {}).map(([key, value]) => [key, Array.from({ length: 27 }, (_, index) => cloneSlot(value[index] ?? null))]));
    if (this.collidesAt(this.position) || this.position.y < MIN_Y) this.respawn(false);
    this.spawnProtection = 8;
    this.emitHud(true);
  }

  activate() {
    this.running = true;
    this.paused = false;
    this.titleMode = false;
    void this.audio.unlock();
    if (!this.touchMode) {
      try { void this.canvas.requestPointerLock(); } catch { /* Touch and embedded browsers may reject pointer lock. */ }
    }
  }

  pause() {
    this.paused = true;
    this.clearInput();
    this.mineHeld = false;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  quitToTitle() {
    this.closeContainer();
    this.saveNow();
    this.running = false;
    this.paused = true;
    this.titleMode = true;
    this.persistent = false;
    this.clearInput();
    if (document.pointerLockElement) document.exitPointerLock();
  }

  async toggleFullscreen() {
    try {
      const shell = this.canvas.parentElement;
      if (!document.fullscreenElement) await shell?.requestFullscreen({ navigationUI: "hide" });
      else await document.exitFullscreen();
    } catch {
      this.events.onToast("Fullscreen is unavailable in this browser.");
    }
  }

  openOverlay(kind: OverlayKind, key?: string) {
    if (kind === "inventory") {
      this.craftingSize = 2;
      this.activeFurnaceKey = null;
      this.activeChestKey = null;
    } else if (kind === "crafting") {
      this.craftingSize = 3;
      this.activeFurnaceKey = null;
      this.activeChestKey = null;
    } else if (kind === "furnace" && key) {
      this.activeFurnaceKey = key;
      this.activeChestKey = null;
      if (!this.furnaces.has(key)) this.furnaces.set(key, blankFurnace());
    } else if (kind === "chest" && key) {
      this.activeChestKey = key;
      this.activeFurnaceKey = null;
      if (!this.chests.has(key)) this.chests.set(key, this.generateChestLoot(key));
    }
    this.pause();
    this.events.onOverlayRequest(kind, key);
    this.emitHud(true);
  }

  closeContainer() {
    if (this.cursor) {
      const leftover = this.addItem(this.cursor.item, this.cursor.count, this.cursor.durability);
      if (leftover > 0) this.spawnDrop(this.cursor.item, leftover, this.position.clone().add(new THREE.Vector3(0, 1, 0)));
      this.cursor = null;
    }
    for (let index = 0; index < this.craftGrid.length; index += 1) {
      const slot = this.craftGrid[index];
      if (!slot) continue;
      const leftover = this.addItem(slot.item, slot.count, slot.durability);
      if (leftover > 0) this.spawnDrop(slot.item, leftover, this.position.clone().add(new THREE.Vector3(0, 1, 0)));
      this.craftGrid[index] = null;
    }
    this.activeFurnaceKey = null;
    this.activeChestKey = null;
    this.craftingSize = 2;
    this.emitHud(true);
  }

  selectSlot(slot: number) {
    this.selected = (slot + 9) % 9;
    this.audio.play("ui");
    this.emitHud(true);
  }

  setCreativeItem(item: ItemCode) {
    if (this.mode !== "builder" || !ITEMS[item]) return;
    this.inventory[this.selected] = { item, count: 64 };
    this.audio.play("ui");
    this.emitHud(true);
  }

  addItem(item: ItemCode, count: number, durability?: number) {
    if (!ITEMS[item] || count <= 0) return count;
    let remaining = count;
    const stackLimit = maxStack(item);
    if (stackLimit > 1) {
      for (const slot of this.inventory) {
        if (!slot || slot.item !== item || slot.count >= stackLimit || slot.durability !== durability) continue;
        const add = Math.min(remaining, stackLimit - slot.count);
        slot.count += add;
        remaining -= add;
        if (remaining <= 0) return 0;
      }
    }
    for (let index = 0; index < this.inventory.length; index += 1) {
      if (this.inventory[index]) continue;
      const add = Math.min(remaining, stackLimit);
      this.inventory[index] = { item, count: add, ...(durability !== undefined ? { durability } : {}) };
      remaining -= add;
      if (remaining <= 0) return 0;
    }
    return remaining;
  }

  countItem(item: ItemCode) {
    return this.inventory.reduce((sum, slot) => sum + (slot?.item === item ? slot.count : 0), 0);
  }

  removeItem(item: ItemCode, count: number) {
    let remaining = count;
    for (let index = this.inventory.length - 1; index >= 0; index -= 1) {
      const slot = this.inventory[index];
      if (!slot || slot.item !== item) continue;
      const remove = Math.min(remaining, slot.count);
      slot.count -= remove;
      remaining -= remove;
      if (slot.count <= 0) this.inventory[index] = null;
      if (remaining <= 0) return true;
    }
    return false;
  }

  inventoryClick(index: number, button: "left" | "right", shift = false) {
    if (index < 0 || index >= this.inventory.length) return;
    if (shift && this.inventory[index]) {
      this.shiftMove(index);
      this.audio.play("ui");
      this.emitHud(true);
      return;
    }
    const slot = this.inventory[index];
    if (button === "left") {
      if (!this.cursor && slot) {
        this.cursor = slot;
        this.inventory[index] = null;
      } else if (this.cursor && !slot) {
        this.inventory[index] = this.cursor;
        this.cursor = null;
      } else if (this.cursor && slot && this.cursor.item === slot.item && this.cursor.durability === slot.durability && slot.count < maxStack(slot.item)) {
        const add = Math.min(this.cursor.count, maxStack(slot.item) - slot.count);
        slot.count += add;
        this.cursor.count -= add;
        if (this.cursor.count <= 0) this.cursor = null;
      } else if (this.cursor && slot) {
        this.inventory[index] = this.cursor;
        this.cursor = slot;
      }
    } else {
      if (!this.cursor && slot) {
        const take = Math.ceil(slot.count / 2);
        this.cursor = { ...slot, count: take };
        slot.count -= take;
        if (slot.count <= 0) this.inventory[index] = null;
      } else if (this.cursor && !slot) {
        this.inventory[index] = { ...this.cursor, count: 1 };
        this.cursor.count -= 1;
        if (this.cursor.count <= 0) this.cursor = null;
      } else if (this.cursor && slot && this.cursor.item === slot.item && slot.count < maxStack(slot.item)) {
        slot.count += 1;
        this.cursor.count -= 1;
        if (this.cursor.count <= 0) this.cursor = null;
      }
    }
    this.audio.play("ui");
    this.saveSoon();
    this.emitHud(true);
  }

  shiftMove(index: number) {
    const slot = this.inventory[index];
    if (!slot) return;
    const targets = index < 9 ? [...Array.from({ length: 27 }, (_, i) => i + 9)] : [...Array.from({ length: 9 }, (_, i) => i)];
    for (const target of targets) {
      const other = this.inventory[target];
      if (other && other.item === slot.item && other.count < maxStack(slot.item)) {
        const add = Math.min(slot.count, maxStack(slot.item) - other.count);
        other.count += add;
        slot.count -= add;
        if (slot.count <= 0) { this.inventory[index] = null; return; }
      }
    }
    for (const target of targets) if (!this.inventory[target]) {
      this.inventory[target] = slot;
      this.inventory[index] = null;
      return;
    }
  }

  craftSlotClick(index: number, button: "left" | "right") {
    if (index < 0 || index >= 9) return;
    if (this.craftingSize === 2 && !CRAFT_POSITIONS_2.includes(index)) return;
    const slot = this.craftGrid[index];
    if (button === "left") {
      if (!this.cursor && slot) { this.cursor = slot; this.craftGrid[index] = null; }
      else if (this.cursor && !slot) { this.craftGrid[index] = this.cursor; this.cursor = null; }
      else if (this.cursor && slot && this.cursor.item === slot.item && slot.count < maxStack(slot.item)) {
        const add = Math.min(this.cursor.count, maxStack(slot.item) - slot.count);
        slot.count += add;
        this.cursor.count -= add;
        if (this.cursor.count <= 0) this.cursor = null;
      } else if (this.cursor && slot) { this.craftGrid[index] = this.cursor; this.cursor = slot; }
    } else {
      if (!this.cursor && slot) {
        const take = Math.ceil(slot.count / 2);
        this.cursor = { ...slot, count: take };
        slot.count -= take;
        if (slot.count <= 0) this.craftGrid[index] = null;
      } else if (this.cursor && !slot) {
        this.craftGrid[index] = { ...this.cursor, count: 1 };
        this.cursor.count -= 1;
        if (this.cursor.count <= 0) this.cursor = null;
      } else if (this.cursor && slot && this.cursor.item === slot.item && slot.count < maxStack(slot.item)) {
        slot.count += 1;
        this.cursor.count -= 1;
        if (this.cursor.count <= 0) this.cursor = null;
      }
    }
    this.updateCraftResult();
    this.audio.play("ui");
    this.emitHud(true);
  }

  ingredientMatches(value: ItemCode, ingredient: ItemCode | ItemCode[]) {
    return Array.isArray(ingredient) ? ingredient.includes(value) : value === ingredient;
  }

  findRecipe() {
    const size = this.craftingSize;
    let minX: number = size;
    let minY: number = size;
    let maxX: number = -1;
    let maxY: number = -1;
    for (let y = 0; y < size; y += 1) for (let x = 0; x < size; x += 1) {
      const slot = this.craftGrid[y * 3 + x];
      if (slot) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
    }
    if (maxX < 0) return null;
    const width = maxX - minX + 1;
    const height = maxY - minY + 1;
    for (const recipe of RECIPES) {
      if (recipe.table && size < 3) continue;
      if (recipe.width !== width || recipe.height !== height) continue;
      let matches = true;
      for (let y = 0; y < size && matches; y += 1) for (let x = 0; x < size; x += 1) {
        const inside = x >= minX && x <= maxX && y >= minY && y <= maxY;
        const slot = this.craftGrid[y * 3 + x];
        if (!inside && slot) { matches = false; break; }
        if (!inside) continue;
        const ingredient = recipe.pattern[(y - minY) * width + (x - minX)];
        if (ingredient === 0 ? Boolean(slot) : !slot || !this.ingredientMatches(slot.item, ingredient)) { matches = false; break; }
      }
      if (matches) return { recipe, minX, minY };
    }
    return null;
  }

  updateCraftResult() {
    this.activeRecipe = this.findRecipe()?.recipe ?? null;
  }

  craftOutputClick() {
    const match = this.findRecipe();
    if (!match) return;
    const output = match.recipe.output;
    if (this.cursor && (this.cursor.item !== output.item || this.cursor.count + output.count > maxStack(output.item))) return;
    if (!this.cursor) this.cursor = cloneSlot(output);
    else this.cursor.count += output.count;
    for (let y = 0; y < match.recipe.height; y += 1) for (let x = 0; x < match.recipe.width; x += 1) {
      if (match.recipe.pattern[y * match.recipe.width + x] === 0) continue;
      const index = (match.minY + y) * 3 + match.minX + x;
      const slot = this.craftGrid[index];
      if (slot) { slot.count -= 1; if (slot.count <= 0) this.craftGrid[index] = null; }
    }
    this.updateCraftResult();
    this.audio.play("craft");
    this.saveSoon();
    this.emitHud(true);
  }

  autoCraft(recipeId: string) {
    const recipe = RECIPES.find((candidate) => candidate.id === recipeId);
    if (!recipe || (recipe.table && this.craftingSize < 3)) {
      this.events.onToast(recipe?.table ? "This recipe needs a crafting table." : "Recipe unavailable.");
      return false;
    }
    const required: ItemCode[] = [];
    for (const ingredient of recipe.pattern) {
      if (ingredient === 0) continue;
      if (Array.isArray(ingredient)) {
        const choice = ingredient.find((item) => this.countItem(item) > required.filter((used) => used === item).length);
        if (choice === undefined) { this.events.onToast("You do not have the ingredients yet."); return false; }
        required.push(choice);
      } else required.push(ingredient);
    }
    const counts = new Map<number, number>();
    for (const item of required) counts.set(item, (counts.get(item) ?? 0) + 1);
    if ([...counts].some(([item, count]) => this.countItem(item) < count)) {
      this.events.onToast("You do not have the ingredients yet.");
      return false;
    }
    for (const [item, count] of counts) this.removeItem(item, count);
    const leftover = this.addItem(recipe.output.item, recipe.output.count, ITEMS[recipe.output.item]?.maxDurability);
    if (leftover > 0) this.spawnDrop(recipe.output.item, leftover, this.position.clone().add(new THREE.Vector3(0, 1, 0)));
    this.audio.play("craft");
    this.events.onToast(`Crafted ${itemName(recipe.output.item)} ×${recipe.output.count}`);
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  machineClick(machine: "furnace" | "chest", index: number, button: "left" | "right") {
    let slots: Array<InventorySlot | null>;
    if (machine === "furnace") {
      const furnace = this.activeFurnaceKey ? this.furnaces.get(this.activeFurnaceKey) : null;
      if (!furnace || index < 0 || index > 2) return;
      slots = [furnace.input, furnace.fuel, furnace.output];
    } else {
      const chest = this.activeChestKey ? this.chests.get(this.activeChestKey) : null;
      if (!chest || index < 0 || index >= chest.length) return;
      slots = chest;
    }
    const slot = slots[index];
    if (machine === "furnace" && index === 2) {
      if (!slot) return;
      if (!this.cursor) {
        if (button === "left") { this.cursor = slot; slots[index] = null; }
        else {
          const take = Math.ceil(slot.count / 2);
          this.cursor = { ...slot, count: take };
          slot.count -= take;
          if (slot.count <= 0) slots[index] = null;
        }
      } else if (this.cursor.item === slot.item && this.cursor.count < maxStack(slot.item)) {
        const take = button === "right" ? 1 : Math.min(slot.count, maxStack(slot.item) - this.cursor.count);
        this.cursor.count += take;
        slot.count -= take;
        if (slot.count <= 0) slots[index] = null;
      }
      const furnace = this.furnaces.get(this.activeFurnaceKey ?? "");
      if (furnace) furnace.output = slots[2];
      this.audio.play("pickup");
      this.saveSoon();
      this.emitHud(true);
      return;
    }
    if (button === "left") {
      if (!this.cursor && slot) { this.cursor = slot; slots[index] = null; }
      else if (this.cursor && !slot) { slots[index] = this.cursor; this.cursor = null; }
      else if (this.cursor && slot && this.cursor.item === slot.item && slot.count < maxStack(slot.item)) {
        const add = Math.min(this.cursor.count, maxStack(slot.item) - slot.count);
        slot.count += add;
        this.cursor.count -= add;
        if (this.cursor.count <= 0) this.cursor = null;
      } else if (this.cursor && slot) { slots[index] = this.cursor; this.cursor = slot; }
    } else {
      if (!this.cursor && slot) {
        const take = Math.ceil(slot.count / 2);
        this.cursor = { ...slot, count: take };
        slot.count -= take;
        if (slot.count <= 0) slots[index] = null;
      } else if (this.cursor && !slot) {
        slots[index] = { ...this.cursor, count: 1 };
        this.cursor.count -= 1;
        if (this.cursor.count <= 0) this.cursor = null;
      } else if (this.cursor && slot && this.cursor.item === slot.item && slot.count < maxStack(slot.item)) {
        slot.count += 1;
        this.cursor.count -= 1;
        if (this.cursor.count <= 0) this.cursor = null;
      }
    }
    if (machine === "furnace") {
      const furnace = this.furnaces.get(this.activeFurnaceKey ?? "");
      if (furnace) [furnace.input, furnace.fuel, furnace.output] = slots as [InventorySlot | null, InventorySlot | null, InventorySlot | null];
    }
    this.audio.play("ui");
    this.saveSoon();
    this.emitHud(true);
  }

  generateChestLoot(key: string): ChestState {
    const slots = Array.from({ length: 27 }, () => null as InventorySlot | null);
    const [x, y, z] = key.split(",").map(Number);
    let state = (this.world.seed ^ Math.imul(x || 0, 374761393) ^ Math.imul(y || 0, 1103515245) ^ Math.imul(z || 0, 668265263)) >>> 0;
    const random = () => {
      state += 0x6d2b79f5;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
    const put = (item: ItemCode, min: number, max: number, chance = 1) => {
      if (random() > chance) return;
      const empty = slots.map((slot, index) => slot ? -1 : index).filter((index) => index >= 0);
      if (!empty.length) return;
      slots[empty[Math.floor(random() * empty.length)]] = { item, count: min + Math.floor(random() * (max - min + 1)), ...(ITEMS[item]?.maxDurability ? { durability: ITEMS[item].maxDurability } : {}) };
    };
    put(Item.Coal, 2, 7);
    put(BlockId.Torch, 3, 9);
    put(Item.Bread, 1, 3, 0.82);
    put(Item.Berry, 2, 5, 0.7);
    put(Item.SunmetalIngot, 1, 3, 0.38);
    put(Item.GoldIngot, 1, 2, 0.2);
    put(Item.CrystalShard, 1, 2, 0.08);
    put(Item.StonePickaxe, 1, 1, 0.14);
    put(Item.IronSword, 1, 1, 0.045);
    put(Item.GlowDust, 1, 4, 0.28);
    put(Item.Wheat, 2, 6, 0.5);
    return slots;
  }

  fuelValue(item: ItemCode) {
    if (item === Item.Coal) return 80;
    if (item === Item.Charcoal) return 72;
    if ([BlockId.WildwoodLog, BlockId.PineLog, BlockId.BirchLog, BlockId.BloomLog, BlockId.Planks].includes(item as BlockId)) return 15;
    return ITEMS[item]?.fuel ?? 0;
  }

  updateFurnaces(dt: number) {
    for (const furnace of this.furnaces.values()) {
      const result = furnace.input ? SMELTING[furnace.input.item] : null;
      const outputFits = result && (!furnace.output || (furnace.output.item === result.item && furnace.output.count + result.count <= maxStack(result.item)));
      if (!result || !outputFits) { furnace.progress = Math.max(0, furnace.progress - dt * 0.3); furnace.burn = Math.max(0, furnace.burn - dt); continue; }
      if (furnace.burn <= 0 && furnace.fuel) {
        const fuel = this.fuelValue(furnace.fuel.item);
        if (fuel > 0) {
          furnace.fuel.count -= 1;
          if (furnace.fuel.count <= 0) furnace.fuel = null;
          furnace.burn = fuel;
          furnace.burnMax = fuel;
          this.audio.play("furnace");
        }
      }
      if (furnace.burn > 0) {
        furnace.burn = Math.max(0, furnace.burn - dt);
        furnace.progress += dt;
        if (furnace.progress >= 8) {
          furnace.progress = 0;
          if (furnace.input) { furnace.input.count -= 1; if (furnace.input.count <= 0) furnace.input = null; }
          if (!furnace.output) furnace.output = cloneSlot(result);
          else furnace.output.count += result.count;
          this.audio.play("craft");
          this.saveSoon();
        }
      }
    }
  }

  selectedSlot() {
    return this.inventory[this.selected];
  }

  pickTarget() {
    if (!this.target) return;
    const blockItem = this.target.type as ItemCode;
    const slotIndex = this.inventory.slice(0, 9).findIndex((slot) => slot?.item === blockItem);
    if (slotIndex >= 0) this.selectSlot(slotIndex);
    else if (this.mode === "builder" && ITEMS[blockItem]) this.setCreativeItem(blockItem);
  }

  useSelected() {
    if (this.placeCooldown > 0) return;
    if (this.target) {
      const key = blockKey(this.target.x, this.target.y, this.target.z);
      if (this.target.type === BlockId.CraftingTable) { this.openOverlay("crafting", key); return; }
      if (this.target.type === BlockId.Furnace) { this.openOverlay("furnace", key); return; }
      if (this.target.type === BlockId.Chest) { this.openOverlay("chest", key); return; }
    }
    const slot = this.selectedSlot();
    const definition = slot ? ITEMS[slot.item] : null;
    if (definition?.food && this.mode === "survival" && this.hunger < 10) {
      this.hunger = Math.min(10, this.hunger + definition.food);
      slot!.count -= 1;
      if (slot!.count <= 0) this.inventory[this.selected] = null;
      this.audio.play("eat");
      this.events.onToast(`Ate ${definition.name}.`);
      this.saveSoon();
      this.emitHud(true);
      return;
    }
    this.placeBlock();
  }

  placeBlock() {
    if (!this.target || this.placeCooldown > 0) return;
    const slot = this.selectedSlot();
    if (!slot) return;
    const itemDefinition = ITEMS[slot.item];
    const type = itemDefinition?.placeBlock;
    if (type === undefined) return;
    const replacesTarget = BLOCKS[this.target.type]?.replaceable;
    const x = replacesTarget ? this.target.x : this.target.placeX;
    const y = replacesTarget ? this.target.y : this.target.placeY;
    const z = replacesTarget ? this.target.z : this.target.placeZ;
    if (y < MIN_Y || y > MAX_Y) return;
    const current = this.world.getBlock(x, y, z);
    if (current === undefined || (!BLOCKS[current]?.replaceable && current !== BlockId.Air)) return;
    this.world.setBlock(x, y, z, type);
    if (BLOCKS[type].solid && this.collidesAt(this.position)) {
      this.world.setBlock(x, y, z, current ?? BlockId.Air, false);
      this.events.onToast("You cannot place a block inside yourself.");
      return;
    }
    if (this.mode === "survival") {
      slot.count -= 1;
      if (slot.count <= 0) this.inventory[this.selected] = null;
    }
    this.placeCooldown = 0.16;
    this.audio.play("place", type);
    this.spawnParticles(x, y, z, type, 5);
    this.saveSoon();
    this.emitHud(true);
  }

  toolCanHarvest(block: BlockId, slot: InventorySlot | null) {
    const definition = BLOCKS[block];
    if (!definition || definition.requiredTier <= 0) return true;
    const item = slot ? ITEMS[slot.item] : null;
    return item?.toolKind === definition.preferredTool && (item.tier ?? 0) >= definition.requiredTier;
  }

  miningMultiplier(block: BlockId) {
    if (this.mode === "builder") return 8;
    const definition = BLOCKS[block];
    const slot = this.selectedSlot();
    const item = slot ? ITEMS[slot.item] : null;
    if (item?.toolKind === definition.preferredTool) return item.miningSpeed ?? 1;
    if (definition.preferredTool === "hand") return 1.1;
    return 0.48;
  }

  damageSelectedTool(amount = 1) {
    if (this.mode === "builder") return;
    const slot = this.selectedSlot();
    if (!slot) return;
    const definition = ITEMS[slot.item];
    if (!definition?.maxDurability) return;
    slot.durability = (slot.durability ?? definition.maxDurability) - amount;
    if (slot.durability <= 0) {
      this.events.onToast(`${definition.name} broke.`);
      this.audio.play("break");
      this.inventory[this.selected] = null;
    }
  }

  breakTarget() {
    if (!this.target || this.target.type === BlockId.Bedrock || this.target.type === BlockId.Water || this.target.type === BlockId.Lava) return;
    const { x, y, z, type } = this.target;
    const harvested = this.toolCanHarvest(type, this.selectedSlot());
    this.world.setBlock(x, y, z, BlockId.Air);
    if (this.mode === "survival") {
      if (harvested) this.dropBlockLoot(type, x, y, z);
      else this.events.onToast(`${BLOCKS[type].name} crumbled without the right tool.`);
      this.damageSelectedTool();
    }
    const key = blockKey(x, y, z);
    if (type === BlockId.Furnace) {
      const furnace = this.furnaces.get(key);
      if (furnace) for (const slot of [furnace.input, furnace.fuel, furnace.output]) if (slot) this.spawnDrop(slot.item, slot.count, new THREE.Vector3(x, y + 0.5, z));
      this.furnaces.delete(key);
    }
    if (type === BlockId.Chest) {
      const chest = this.chests.get(key);
      if (chest) for (const slot of chest) if (slot) this.spawnDrop(slot.item, slot.count, new THREE.Vector3(x, y + 0.5, z));
      this.chests.delete(key);
    }
    this.audio.play("break", type);
    this.spawnParticles(x, y, z, type, 13);
    this.miningProgress = 0;
    this.target = null;
    this.saveSoon();
    this.emitHud(true);
  }

  randomDrop(item: ItemCode, min: number, max: number, chance = 1) {
    if (Math.random() > chance) return [] as Array<[ItemCode, number]>;
    return [[item, min + Math.floor(Math.random() * (max - min + 1))] as [ItemCode, number]];
  }

  dropBlockLoot(type: BlockId, x: number, y: number, z: number) {
    let drops: Array<[ItemCode, number]> = [];
    if (type === BlockId.Grass || type === BlockId.SnowyGrass || type === BlockId.SavannaGrass || type === BlockId.SwampGrass) drops = [[BlockId.Dirt, 1]];
    else if (type === BlockId.Stone || type === BlockId.Deepstone || type === BlockId.Basalt) drops = [[BlockId.Cobblestone, 1]];
    else if (type === BlockId.CoalOre) drops = this.randomDrop(Item.Coal, 1, 2);
    else if (type === BlockId.IronOre) drops = [[Item.RawSunmetal, 1]];
    else if (type === BlockId.CopperOre) drops = this.randomDrop(Item.RawSunmetal, 1, 2);
    else if (type === BlockId.GoldOre) drops = [[Item.RawGold, 1]];
    else if (type === BlockId.CrystalOre) drops = this.randomDrop(Item.CrystalShard, 1, 2);
    else if ([BlockId.WildwoodLeaves, BlockId.PineLeaves, BlockId.BirchLeaves, BlockId.BloomLeaves].includes(type)) {
      drops = [...this.randomDrop(Item.Stick, 1, 2, 0.22), ...this.randomDrop(Item.Apple, 1, 1, 0.06)];
    } else if (type === BlockId.Gravel) drops = Math.random() < 0.16 ? [[Item.Flint, 1]] : [[BlockId.Gravel, 1]];
    else if (type === BlockId.WheatCrop) drops = [...this.randomDrop(Item.Wheat, 1, 2), ...this.randomDrop(Item.Wheat, 1, 1, 0.35)];
    else if (ITEMS[type]) drops = [[type, 1]];
    for (const [item, count] of drops) this.spawnDrop(item, count, new THREE.Vector3(x, y + 0.3, z));
  }

  updateMining(dt: number) {
    if (this.targetMob && this.mineHeld && this.attackCooldown <= 0) this.attackTargetMob();
    if (!this.mineHeld || !this.target || this.targetMob || (!this.locked && !this.touchMode)) {
      this.miningProgress = Math.max(0, this.miningProgress - dt * 3);
      return;
    }
    if (this.target.type === BlockId.Bedrock) { this.miningProgress = 0; return; }
    const hardness = BLOCKS[this.target.type].hardness;
    this.miningProgress += (dt * this.miningMultiplier(this.target.type)) / Math.max(0.12, hardness);
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
      this.targetMob = null;
      this.selection.visible = false;
      return;
    }
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    const blockHit = this.castVoxel(this.camera.position, direction, 6);
    const mobHit = this.castMob(this.camera.position, direction, 5);
    this.targetMob = mobHit && (!blockHit || mobHit.distance < blockHit.distance) ? mobHit.mob : null;
    this.target = this.targetMob ? null : blockHit;
    const nextKey = this.target ? blockKey(this.target.x, this.target.y, this.target.z) : this.targetMob ? `mob:${this.targetMob.id}` : "";
    if (nextKey !== this.targetKey) { this.targetKey = nextKey; this.miningProgress = 0; }
    this.selection.visible = Boolean(this.target);
    if (this.target) {
      this.selection.position.set(this.target.x, this.target.y, this.target.z);
      (this.selection.material as THREE.LineBasicMaterial).color.setHSL(0.12, 0.25, 0.9 - this.miningProgress * 0.35);
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
      const type = this.world.getBlock(x, y, z);
      if (type === undefined) return null;
      if (type !== BlockId.Air && type !== BlockId.Water && type !== BlockId.Lava) return { x, y, z, placeX: previousX, placeY: previousY, placeZ: previousZ, type, distance };
      previousX = x; previousY = y; previousZ = z;
      if (maxX < maxY && maxX < maxZ) { x += stepX; distance = maxX; maxX += deltaX; }
      else if (maxY < maxZ) { y += stepY; distance = maxY; maxY += deltaY; }
      else { z += stepZ; distance = maxZ; maxZ += deltaZ; }
    }
    return null;
  }

  castMob(origin: THREE.Vector3, direction: THREE.Vector3, reach: number) {
    this.mobRaycaster.set(origin, direction);
    this.mobRaycaster.far = reach;
    const intersections = this.mobRaycaster.intersectObjects(this.creatureGroup.children, true);
    for (const intersection of intersections) {
      let object: THREE.Object3D | null = intersection.object;
      while (object && object.userData.mobId === undefined) object = object.parent;
      const id = object?.userData.mobId as number | undefined;
      const mob = id === undefined ? null : this.mobs.find((candidate) => candidate.id === id);
      if (mob) return { mob, distance: intersection.distance };
    }
    return null;
  }

  updatePlayer(dt: number) {
    const forwardAmount = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
    const rightAmount = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
    const moving = forwardAmount !== 0 || rightAmount !== 0;
    const feetBlock = this.world.getBlock(Math.floor(this.position.x + 0.5), Math.floor(this.position.y + 0.6), Math.floor(this.position.z + 0.5));
    const inWater = feetBlock === BlockId.Water;
    const inLava = feetBlock === BlockId.Lava;
    const inLiquid = inWater || inLava;
    if (inWater && !this.wasInWater) this.audio.play("splash");
    this.wasInWater = inWater;
    const sprinting = moving && (this.keys.has("ShiftLeft") || this.keys.has("ShiftRight")) && this.hunger > 0.5 && !inLiquid;
    const crouching = this.keys.has("ControlLeft");
    const speed = (crouching ? 2.15 : sprinting ? 6.35 : 4.35) * (inLiquid ? 0.55 : 1);
    const length = Math.hypot(forwardAmount, rightAmount) || 1;
    const f = forwardAmount / length;
    const r = rightAmount / length;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const desiredX = (-sin * f + cos * r) * speed;
    const desiredZ = (-cos * f - sin * r) * speed;
    const acceleration = this.grounded || inLiquid ? 18 : 7;
    this.velocity.x += (desiredX - this.velocity.x) * Math.min(1, acceleration * dt);
    this.velocity.z += (desiredZ - this.velocity.z) * Math.min(1, acceleration * dt);
    if (!moving) {
      const drag = this.grounded ? 13 : inLiquid ? 4 : 1.2;
      this.velocity.x *= Math.max(0, 1 - drag * dt);
      this.velocity.z *= Math.max(0, 1 - drag * dt);
    }

    if (inLiquid) {
      this.velocity.y -= 5 * dt;
      this.velocity.y *= Math.max(0, 1 - 2.4 * dt);
      if (this.keys.has("Space")) this.velocity.y += 9.5 * dt;
    } else {
      if (this.grounded && this.keys.has("Space")) {
        this.velocity.y = 8.15;
        this.grounded = false;
        this.audio.play("jump");
      }
      this.velocity.y -= 24 * dt;
      this.fallVelocity = Math.min(this.fallVelocity, this.velocity.y);
    }

    this.moveWithCollisions(this.velocity.x * dt, 0, 0);
    this.moveWithCollisions(0, this.velocity.y * dt, 0);
    this.moveWithCollisions(0, 0, this.velocity.z * dt);
    const wasGrounded = this.grounded;
    this.grounded = this.collidesAt(new THREE.Vector3(this.position.x, this.position.y - 0.055, this.position.z));
    if (!wasGrounded && this.grounded && !inLiquid) {
      this.audio.play("land", this.blockUnderfoot());
      if (this.mode === "survival" && this.fallVelocity < -11.2) this.damagePlayer(Math.min(6, Math.max(1, Math.floor((-this.fallVelocity - 9) / 2))), "the fall");
      this.fallVelocity = 0;
    }
    if (this.position.y < MIN_Y - 8) this.respawn(true);

    const horizontalTravel = Math.hypot(this.position.x - this.lastPosition.x, this.position.z - this.lastPosition.z);
    if (this.grounded && moving && !inLiquid) {
      this.footstepDistance += horizontalTravel;
      if (this.footstepDistance > (sprinting ? 1.45 : 1.85)) { this.footstepDistance = 0; this.audio.play("step", this.blockUnderfoot()); }
    }
    this.lastPosition.copy(this.position);

    if (this.mode === "survival") {
      this.hunger = Math.max(0, this.hunger - dt * (sprinting ? 0.009 : 0.0024));
      this.regenTimer += dt;
      if (this.hunger >= 8 && this.health < 10 && this.regenTimer > 5) { this.health += 1; this.hunger = Math.max(0, this.hunger - 0.35); this.regenTimer = 0; }
      if (this.hunger <= 0 && this.regenTimer > 4) { this.damagePlayer(1, "hunger"); this.regenTimer = 0; }
      if (inLava) {
        this.fluidDamageTimer -= dt;
        if (this.fluidDamageTimer <= 0) { this.damagePlayer(2, "lava"); this.fluidDamageTimer = 0.8; }
      } else this.fluidDamageTimer = 0;
    }
    this.spawnProtection = Math.max(0, this.spawnProtection - dt);
    this.playerInvulnerability = Math.max(0, this.playerInvulnerability - dt);
  }

  moveWithCollisions(dx: number, dy: number, dz: number) {
    const distance = Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz));
    const steps = Math.max(1, Math.ceil(distance / 0.14));
    const sx = dx / steps;
    const sy = dy / steps;
    const sz = dz / steps;
    for (let index = 0; index < steps; index += 1) {
      const candidate = new THREE.Vector3(this.position.x + sx, this.position.y + sy, this.position.z + sz);
      if (!this.collidesAt(candidate)) this.position.copy(candidate);
      else {
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
    for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) for (let z = minZ; z <= maxZ; z += 1) {
      const type = this.world.getBlock(x, y, z);
      if (type === undefined || BLOCKS[type]?.solid) return true;
    }
    return false;
  }

  blockUnderfoot() {
    return this.world.getBlock(Math.floor(this.position.x + 0.5), Math.floor(this.position.y - 0.08 + 0.5), Math.floor(this.position.z + 0.5)) ?? BlockId.Stone;
  }

  damagePlayer(amount: number, source: string) {
    if (this.mode !== "survival" || this.playerInvulnerability > 0 || this.spawnProtection > 0) return;
    this.health -= amount;
    this.playerInvulnerability = 0.7;
    this.audio.play("hurt");
    this.events.onToast(`${source[0].toUpperCase()}${source.slice(1)} cost ${amount} ${amount === 1 ? "heart" : "hearts"}.`);
    if (this.health <= 0) this.respawn(true);
  }

  respawn(announce: boolean) {
    this.position.copy(this.spawn);
    this.velocity.set(0, 0, 0);
    this.yaw = 0;
    this.pitch = 0;
    this.health = 10;
    this.hunger = Math.max(this.hunger, 6);
    this.fallVelocity = 0;
    this.spawnProtection = 8;
    if (announce) {
      this.events.onDeath();
      this.events.onToast("The wild carried you home—with your inventory, because cruelty is not a feature.");
    }
    this.saveSoon();
    this.emitHud(true);
  }

  createMobVisual(kind: MobKind, id: number) {
    const group = new THREE.Group();
    const palette: Record<MobKind, [number, number, number]> = {
      mossling: [0x5c8f46, 0xa7c47f, 0x182016],
      ridgeback: [0x8b5b3f, 0xbd8460, 0x211815],
      woolhorn: [0xe2dfd2, 0x736a5c, 0x20211e],
      glowmoth: [0xf0c65a, 0x8fc9b2, 0x40351a],
      shadecrawler: [0x3d334e, 0x79658f, 0xff6f76],
      caveblob: [0x56b58b, 0x94e0bd, 0x17382d],
      rattlekin: [0xd6ceb8, 0x817966, 0x2b2521],
    };
    const [bodyColor, accentColor, eyeColor] = palette[kind];
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: bodyColor });
    const accentMaterial = new THREE.MeshLambertMaterial({ color: accentColor });
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: eyeColor });
    const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number) => {
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(x, y, z);
      mesh.userData.mobId = id;
      group.add(mesh);
      return mesh;
    };
    if (kind === "glowmoth") {
      add(new THREE.BoxGeometry(0.3, 0.28, 0.42), bodyMaterial, 0, 0, 0);
      add(new THREE.BoxGeometry(0.62, 0.05, 0.38), accentMaterial, -0.42, 0, 0);
      add(new THREE.BoxGeometry(0.62, 0.05, 0.38), accentMaterial, 0.42, 0, 0);
    } else if (kind === "caveblob") {
      add(new THREE.BoxGeometry(0.82, 0.72, 0.82), bodyMaterial, 0, 0, 0);
      add(new THREE.BoxGeometry(0.13, 0.13, 0.04), eyeMaterial, -0.18, 0.1, -0.43);
      add(new THREE.BoxGeometry(0.13, 0.13, 0.04), eyeMaterial, 0.18, 0.1, -0.43);
    } else {
      const low = kind === "shadecrawler";
      add(new THREE.BoxGeometry(low ? 1.05 : 0.86, low ? 0.42 : 0.62, low ? 0.75 : 0.58), bodyMaterial, 0, 0, 0);
      add(new THREE.BoxGeometry(0.52, 0.48, 0.48), accentMaterial, 0, low ? 0.1 : 0.28, -0.45);
      add(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeMaterial, -0.14, low ? 0.16 : 0.34, -0.7);
      add(new THREE.BoxGeometry(0.08, 0.08, 0.04), eyeMaterial, 0.14, low ? 0.16 : 0.34, -0.7);
      const legGeometry = new THREE.BoxGeometry(0.17, low ? 0.22 : 0.34, 0.17);
      for (const lx of [-0.27, 0.27]) for (const lz of [-0.17, 0.18]) add(legGeometry, bodyMaterial, lx, low ? -0.28 : -0.39, lz);
      if (kind === "woolhorn") {
        add(new THREE.BoxGeometry(0.18, 0.18, 0.4), accentMaterial, -0.3, 0.52, -0.5);
        add(new THREE.BoxGeometry(0.18, 0.18, 0.4), accentMaterial, 0.3, 0.52, -0.5);
      }
    }
    group.userData.mobId = id;
    return group;
  }

  spawnMob(kind: MobKind, position: THREE.Vector3) {
    const definitions: Record<MobKind, { name: string; hostile: boolean; health: number; damage: number }> = {
      mossling: { name: "Mossling", hostile: false, health: 5, damage: 0 },
      ridgeback: { name: "Ridgeback", hostile: false, health: 8, damage: 0 },
      woolhorn: { name: "Woolhorn", hostile: false, health: 9, damage: 0 },
      glowmoth: { name: "Glowmoth", hostile: false, health: 3, damage: 0 },
      shadecrawler: { name: "Shadecrawler", hostile: true, health: 10, damage: 2 },
      caveblob: { name: "Cave Blob", hostile: true, health: 7, damage: 1 },
      rattlekin: { name: "Rattlekin", hostile: true, health: 12, damage: 2 },
    };
    const definition = definitions[kind];
    const id = this.nextMobId++;
    const group = this.createMobVisual(kind, id);
    group.position.copy(position);
    this.creatureGroup.add(group);
    const mob: MobEntity = { id, kind, name: definition.name, hostile: definition.hostile, group, health: definition.health, maxHealth: definition.health, damage: definition.damage, angle: Math.random() * Math.PI * 2, wanderTimer: 1 + Math.random() * 4, attackCooldown: 0, hurtTimer: 0, age: 0, bob: Math.random() * Math.PI * 2 };
    this.mobs.push(mob);
    return mob;
  }

  trySpawnMob() {
    const cap = this.touchMode ? 13 : 22;
    if (this.mobs.length >= cap) return;
    const angle = Math.random() * Math.PI * 2;
    const radius = 14 + Math.random() * 20;
    const x = Math.round(this.position.x + Math.cos(angle) * radius);
    const z = Math.round(this.position.z + Math.sin(angle) * radius);
    const underground = this.position.y < 16;
    let y: number;
    let kind: MobKind;
    if (underground) {
      y = this.world.findWalkableY(x, z, this.position.y);
      const feet = this.world.getBlock(x, y + 1, z);
      if (feet !== BlockId.Air) return;
      kind = Math.random() < 0.58 ? "caveblob" : "shadecrawler";
    } else {
      y = this.world.surfaceAt(x, z);
      if (this.world.getBlock(x, y, z) === undefined || y <= SEA_LEVEL) return;
      const daylight = this.daylightAmount();
      const hostile = daylight < 0.2 && this.spawnProtection <= 0;
      if (hostile) kind = Math.random() < 0.55 ? "shadecrawler" : "rattlekin";
      else {
        const biome = this.world.biomeAt(x, z);
        kind = biome === BiomeId.Snowfield || biome === BiomeId.Frostpine ? "woolhorn"
          : biome === BiomeId.Siltfen || biome === BiomeId.Bloomwood ? "mossling"
            : biome === BiomeId.MushroomFen ? "glowmoth" : "ridgeback";
      }
    }
    this.spawnMob(kind, new THREE.Vector3(x, y + (kind === "glowmoth" ? 2 : 0.65), z));
  }

  updateMobs(dt: number) {
    this.mobSpawnTimer -= dt;
    if (this.mobSpawnTimer <= 0) { this.mobSpawnTimer = 2.2 + Math.random() * 1.8; this.trySpawnMob(); }
    for (let index = this.mobs.length - 1; index >= 0; index -= 1) {
      const mob = this.mobs[index];
      mob.age += dt;
      mob.attackCooldown = Math.max(0, mob.attackCooldown - dt);
      mob.hurtTimer = Math.max(0, mob.hurtTimer - dt);
      mob.wanderTimer -= dt;
      mob.bob += dt * 4;
      const dx = this.position.x - mob.group.position.x;
      const dz = this.position.z - mob.group.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 68 || mob.age > 300 || (mob.hostile && this.daylightAmount() > 0.65 && mob.group.position.y > SEA_LEVEL && distance > 25)) {
        this.removeMob(index);
        continue;
      }
      let speed = mob.hostile ? 1.55 : 0.38;
      if (mob.hostile && distance < 20) mob.angle = Math.atan2(dz, dx);
      else if (mob.hurtTimer > 0) { mob.angle = Math.atan2(-dz, -dx); speed = 2.2; }
      else if (mob.wanderTimer <= 0) { mob.angle += (Math.random() - 0.5) * 2.2; mob.wanderTimer = 2 + Math.random() * 5; }
      if (mob.hostile && distance < 1.55 && Math.abs(this.position.y - mob.group.position.y) < 1.7 && mob.attackCooldown <= 0) {
        mob.attackCooldown = 1.1;
        this.damagePlayer(mob.damage, mob.name);
        const push = new THREE.Vector3(dx, 0.15, dz).normalize().multiplyScalar(3.2);
        this.velocity.add(push);
        this.audio.play("mob");
      }
      if (mob.kind === "glowmoth") {
        mob.group.position.x += Math.cos(mob.angle) * speed * dt;
        mob.group.position.z += Math.sin(mob.angle) * speed * dt;
        mob.group.position.y += Math.sin(mob.bob) * 0.008;
      } else {
        const nx = mob.group.position.x + Math.cos(mob.angle) * speed * dt;
        const nz = mob.group.position.z + Math.sin(mob.angle) * speed * dt;
        const ground = this.world.findWalkableY(Math.round(nx), Math.round(nz), mob.group.position.y);
        if (Math.abs(ground + 0.65 - mob.group.position.y) <= 1.25 && this.world.getBlock(Math.round(nx), ground + 1, Math.round(nz)) === BlockId.Air) {
          mob.group.position.x = nx;
          mob.group.position.z = nz;
          mob.group.position.y += (ground + 0.65 - mob.group.position.y) * Math.min(1, dt * 9);
        } else mob.angle += Math.PI * (0.45 + Math.random() * 0.5);
        mob.group.position.y += Math.sin(mob.bob) * 0.0015;
      }
      mob.group.rotation.y = -mob.angle + Math.PI / 2;
      const pulse = mob.hurtTimer > 0 ? 1 + Math.sin(mob.hurtTimer * 45) * 0.06 : 1;
      mob.group.scale.setScalar(pulse);
    }
  }

  attackTargetMob() {
    const mob = this.targetMob;
    if (!mob || this.attackCooldown > 0) return;
    const slot = this.selectedSlot();
    const item = slot ? ITEMS[slot.item] : null;
    const damage = item?.damage ?? 1;
    this.attackCooldown = item?.toolKind === "sword" ? 0.38 : 0.55;
    mob.health -= damage;
    mob.hurtTimer = 0.32;
    const away = mob.group.position.clone().sub(this.position).setY(0).normalize().multiplyScalar(0.65);
    mob.group.position.add(away);
    this.audio.play("attack");
    this.spawnParticles(mob.group.position.x, mob.group.position.y, mob.group.position.z, mob.hostile ? BlockId.Obsidian : BlockId.Dirt, 7);
    if (item?.toolKind) this.damageSelectedTool();
    if (mob.health <= 0) this.killMob(mob);
    this.emitHud(true);
  }

  killMob(mob: MobEntity) {
    const position = mob.group.position.clone();
    const dropsByKind: Record<MobKind, Array<[ItemCode, number, number]>> = {
      mossling: [[Item.Fiber, 1 + Math.floor(Math.random() * 2), 0.9], [Item.Berry, 1, 0.3]],
      ridgeback: [[Item.RawMeat, 1 + Math.floor(Math.random() * 3), 1], [Item.Hide, 1, 0.58]],
      woolhorn: [[Item.Wool, 1 + Math.floor(Math.random() * 2), 1], [Item.RawMeat, 1, 0.55]],
      glowmoth: [[Item.GlowDust, 1 + Math.floor(Math.random() * 2), 0.82]],
      shadecrawler: [[Item.ShadowShard, 1, 0.84], [Item.Coal, 1, 0.34]],
      caveblob: [[Item.CaveGel, 1 + Math.floor(Math.random() * 2), 1]],
      rattlekin: [[Item.BoneShard, 1 + Math.floor(Math.random() * 2), 1], [Item.Coal, 1, 0.18]],
    };
    const drops = dropsByKind[mob.kind];
    for (const [item, count, chance] of drops) if (Math.random() <= chance) this.spawnDrop(item, count, position);
    this.addXp(mob.hostile ? 5 : 2);
    const index = this.mobs.indexOf(mob);
    if (index >= 0) this.removeMob(index);
    this.audio.play("pickup");
  }

  removeMob(index: number) {
    const mob = this.mobs[index];
    this.creatureGroup.remove(mob.group);
    mob.group.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    this.mobs.splice(index, 1);
    if (this.targetMob === mob) this.targetMob = null;
  }

  addXp(amount: number) {
    this.xp += amount;
    const needed = 12 + this.level * 6;
    if (this.xp >= needed) {
      this.xp -= needed;
      this.level += 1;
      this.events.onToast(`Level ${this.level}! The wild knows your name now.`);
      this.audio.play("craft");
    }
  }

  spawnDrop(item: ItemCode, count: number, position: THREE.Vector3) {
    if (!ITEMS[item] || count <= 0) return;
    const nearby = this.drops.find((drop) => drop.item === item && drop.mesh.position.distanceToSquared(position) < 2.25 && drop.count < maxStack(item));
    if (nearby) {
      const add = Math.min(count, maxStack(item) - nearby.count);
      nearby.count += add;
      count -= add;
      if (count <= 0) return;
    }
    if (this.drops.length >= 120) this.removeDrop(0);
    let material = this.dropMaterials.get(item);
    if (!material) { material = new THREE.MeshLambertMaterial({ color: ITEMS[item].color }); this.dropMaterials.set(item, material); }
    const mesh = new THREE.Mesh(this.sharedDropGeometry, material);
    mesh.position.copy(position).add(new THREE.Vector3((Math.random() - 0.5) * 0.45, 0.25, (Math.random() - 0.5) * 0.45));
    this.dropGroup.add(mesh);
    this.drops.push({ id: this.nextDropId++, item, count, mesh, velocity: new THREE.Vector3((Math.random() - 0.5) * 1.4, 2 + Math.random(), (Math.random() - 0.5) * 1.4), age: 0, pickupDelay: 0.35 });
  }

  updateDrops(dt: number) {
    for (let index = this.drops.length - 1; index >= 0; index -= 1) {
      const drop = this.drops[index];
      drop.age += dt;
      drop.pickupDelay -= dt;
      drop.velocity.y -= 12 * dt;
      const nextY = drop.mesh.position.y + drop.velocity.y * dt;
      const groundBlock = this.world.getBlock(Math.floor(drop.mesh.position.x + 0.5), Math.floor(nextY - 0.15 + 0.5), Math.floor(drop.mesh.position.z + 0.5));
      if (groundBlock !== undefined && BLOCKS[groundBlock]?.solid && drop.velocity.y < 0) { drop.velocity.y *= -0.28; drop.velocity.x *= 0.72; drop.velocity.z *= 0.72; }
      else drop.mesh.position.y = nextY;
      drop.mesh.position.x += drop.velocity.x * dt;
      drop.mesh.position.z += drop.velocity.z * dt;
      drop.mesh.rotation.y += dt * 2.5;
      drop.mesh.position.y += Math.sin(drop.age * 4) * 0.001;
      const distance = drop.mesh.position.distanceTo(this.position.clone().add(new THREE.Vector3(0, 0.8, 0)));
      if (drop.pickupDelay <= 0 && distance < 1.45) {
        const leftover = this.addItem(drop.item, drop.count, ITEMS[drop.item].maxDurability);
        if (leftover < drop.count) this.audio.play("pickup");
        drop.count = leftover;
        if (drop.count <= 0) { this.removeDrop(index); this.saveSoon(); this.emitHud(true); continue; }
      }
      if (drop.age > 120 || distance > 85) this.removeDrop(index);
    }
  }

  removeDrop(index: number) {
    this.dropGroup.remove(this.drops[index].mesh);
    this.drops.splice(index, 1);
  }

  dropSelectedItem() {
    if (this.mode === "builder") return;
    const slot = this.selectedSlot();
    if (!slot) return;
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    this.spawnDrop(slot.item, 1, this.camera.position.clone().add(direction.multiplyScalar(0.8)));
    const drop = this.drops[this.drops.length - 1];
    if (drop) drop.velocity.add(direction.multiplyScalar(3));
    slot.count -= 1;
    if (slot.count <= 0) this.inventory[this.selected] = null;
    this.saveSoon();
    this.emitHud(true);
  }

  clearEntities() {
    while (this.mobs.length) this.removeMob(this.mobs.length - 1);
    while (this.drops.length) this.removeDrop(this.drops.length - 1);
    for (const particle of this.particles) {
      this.scene.remove(particle.mesh);
      particle.mesh.geometry.dispose();
      (particle.mesh.material as THREE.Material).dispose();
    }
    this.particles = [];
  }

  daylightAmount() {
    const angle = this.worldTime * Math.PI * 2 - Math.PI / 2;
    return clamp((Math.sin(angle) + 0.18) / 0.45, 0.06, 1);
  }

  updateDayNight(dt: number) {
    if (this.running && !this.titleMode) {
      this.worldTime += dt / 420;
      if (this.worldTime >= 1) { this.worldTime -= 1; this.day += 1; }
    }
    const angle = this.worldTime * Math.PI * 2 - Math.PI / 2;
    const sunHeight = Math.sin(angle);
    const daylight = this.daylightAmount();
    const dawn = Math.pow(1 - Math.abs(sunHeight), 5) * (sunHeight > -0.35 ? 1 : 0);
    const night = new THREE.Color("#071329");
    const day = new THREE.Color("#79baf1");
    const dusk = new THREE.Color("#e88b62");
    const sky = night.clone().lerp(day, daylight).lerp(dusk, dawn * 0.32);
    const headBlock = this.world.getBlock(Math.floor(this.camera.position.x + 0.5), Math.floor(this.camera.position.y + 0.5), Math.floor(this.camera.position.z + 0.5));
    const underwater = headBlock === BlockId.Water;
    const underground = this.position.y < 12 && !underwater;
    if (underwater) sky.set("#1d5d82");
    this.scene.background = sky;
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(sky);
      const view = this.settings.renderDistance * 16;
      this.scene.fog.near = underwater ? 3 : underground ? 10 : view * 0.54;
      this.scene.fog.far = underwater ? 24 : underground ? Math.max(30, view * 0.7) : view * 1.05;
    }
    this.camera.far = Math.max(128, this.settings.renderDistance * 16 * 1.8);
    this.camera.updateProjectionMatrix();
    this.hemisphere.intensity = underground ? 0.12 : 0.18 + daylight * 0.92;
    this.directional.intensity = underground ? 0.03 : 0.12 + daylight * 1.05;
    this.directional.color.set(dawn > 0.25 ? 0xffb483 : 0xfff1c7);
    const selected = this.selectedSlot();
    const carryingLight = selected?.item === BlockId.Torch || selected?.item === BlockId.Glowstone;
    this.caveLight.position.copy(this.camera.position);
    this.caveLight.intensity = underground ? (carryingLight ? 1.15 : 0.42) : carryingLight ? 0.25 : 0;
    const celestialDistance = 70;
    this.sun.position.set(this.camera.position.x + Math.cos(angle) * celestialDistance, this.camera.position.y + Math.sin(angle) * celestialDistance, this.camera.position.z - 24);
    this.moon.position.set(this.camera.position.x - Math.cos(angle) * celestialDistance, this.camera.position.y - Math.sin(angle) * celestialDistance, this.camera.position.z + 24);
    this.sun.lookAt(this.camera.position);
    this.moon.lookAt(this.camera.position);
    this.sun.visible = !underground && sunHeight > -0.18;
    this.moon.visible = !underground && sunHeight < 0.22;
    (this.stars.material as THREE.PointsMaterial).opacity = underground ? 0 : clamp(1 - daylight * 1.45, 0, 0.9);
    this.stars.position.copy(this.camera.position);
    this.directional.position.set(Math.cos(angle) * 25, Math.sin(angle) * 35, -14).add(this.camera.position);
    this.audio.setDepth(this.position.y, this.weather === "rain");
  }

  updateRain(dt: number) {
    this.rain.visible = this.weather === "rain" && this.position.y > 5;
    if (!this.rain.visible) return;
    const attribute = this.rain.geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    for (let index = 0; index < array.length; index += 6) {
      array[index + 1] -= dt * 22;
      array[index + 4] -= dt * 22;
      if (array[index + 1] < -2) {
        const reset = 14 + Math.random() * 10;
        array[index + 1] = reset;
        array[index + 4] = reset - 0.75;
        const x = (Math.random() - 0.5) * 30;
        const z = (Math.random() - 0.5) * 30;
        array[index] = array[index + 3] = x;
        array[index + 2] = array[index + 5] = z;
      }
    }
    attribute.needsUpdate = true;
    this.rain.position.set(this.camera.position.x, this.camera.position.y - 2, this.camera.position.z);
  }

  updateParticles(dt: number) {
    for (let index = this.particles.length - 1; index >= 0; index -= 1) {
      const particle = this.particles[index];
      particle.life -= dt;
      particle.velocity.y -= 12 * dt;
      particle.mesh.position.addScaledVector(particle.velocity, dt);
      particle.mesh.rotation.x += dt * 5;
      particle.mesh.rotation.y += dt * 4;
      particle.mesh.scale.setScalar(clamp(particle.life * 2.4, 0, 1));
      if (particle.life <= 0) {
        this.scene.remove(particle.mesh);
        particle.mesh.geometry.dispose();
        (particle.mesh.material as THREE.Material).dispose();
        this.particles.splice(index, 1);
      }
    }
  }

  spawnParticles(x: number, y: number, z: number, type: BlockId, count: number) {
    const color = BLOCKS[type]?.color ?? "#777777";
    for (let index = 0; index < count; index += 1) {
      const size = 0.07 + Math.random() * 0.09;
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(size, size, size), new THREE.MeshBasicMaterial({ color }));
      mesh.position.set(x + (Math.random() - 0.5) * 0.7, y + (Math.random() - 0.5) * 0.7, z + (Math.random() - 0.5) * 0.7);
      this.scene.add(mesh);
      this.particles.push({ mesh, velocity: new THREE.Vector3((Math.random() - 0.5) * 2.5, 1.4 + Math.random() * 2.1, (Math.random() - 0.5) * 2.5), life: 0.45 + Math.random() * 0.35 });
    }
  }

  animate = (now: number) => {
    if (this.disposed) return;
    const rawDt = (now - this.previousTime) / 1000;
    const dt = Math.min(0.08, Math.max(0, rawDt));
    this.previousTime = now;
    this.placeCooldown = Math.max(0, this.placeCooldown - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);

    if (this.titleMode) {
      const t = now * 0.000045;
      this.camera.position.set(this.spawn.x + Math.sin(t) * 24, this.spawn.y + 13 + Math.sin(t * 1.8) * 1.2, this.spawn.z + Math.cos(t) * 24);
      this.camera.lookAt(this.spawn.x, this.spawn.y + 4, this.spawn.z);
      this.world.update(this.spawn.x, this.spawn.z);
    } else {
      this.world.update(this.position.x, this.position.z);
      if (this.running && !this.paused && (this.locked || this.touchMode)) {
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
    if (this.running && !this.titleMode && !this.paused) {
      this.updateMobs(dt);
      this.updateDrops(dt);
      this.updateFurnaces(dt);
    }
    this.updateRain(dt);
    this.updateParticles(dt);
    for (const cloud of this.ambienceGroup.children) if (cloud.userData.cloud) {
      cloud.position.x += dt * 0.22;
      if (cloud.position.x - this.camera.position.x > 65) cloud.position.x -= 130;
      if (cloud.position.x - this.camera.position.x < -65) cloud.position.x += 130;
      if (cloud.position.z - this.camera.position.z > 65) cloud.position.z -= 130;
      if (cloud.position.z - this.camera.position.z < -65) cloud.position.z += 130;
    }
    this.renderer.render(this.scene, this.camera);
    if (this.running && this.persistent) {
      this.autoSaveAccumulator += dt;
      if (this.autoSaveAccumulator >= 15) { this.autoSaveAccumulator = 0; this.saveNow(false); }
    }
    this.emitHud(false, now);
    this.animationFrame = requestAnimationFrame(this.animate);
  };

  depthName() {
    if (this.position.y > 28) return "Surface";
    if (this.position.y > 4) return "Stoneways";
    if (this.position.y > -14) return "Deepstone Caves";
    if (this.position.y > MIN_Y + 8) return "Crystal Deeps";
    return "Worldheart";
  }

  emitHud(force = false, now = performance.now()) {
    if (!force && now - this.lastHudTime < 140) return;
    this.lastHudTime = now;
    this.updateCraftResult();
    const totalMinutes = Math.floor(((this.worldTime + 0.25) % 1) * 24 * 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const suffix = hours >= 12 ? "PM" : "AM";
    const displayHour = hours % 12 || 12;
    const biome = this.world.biomeAt(Math.round(this.position.x), Math.round(this.position.z));
    this.events.onHud({
      health: clamp(this.health, 0, 10),
      hunger: clamp(this.hunger, 0, 10),
      xp: this.xp,
      level: this.level,
      inventory: this.inventory.map(cloneSlot),
      cursor: cloneSlot(this.cursor),
      craftGrid: this.craftGrid.map(cloneSlot),
      craftOutput: this.activeRecipe ? cloneSlot(this.activeRecipe.output) : null,
      craftingSize: this.craftingSize,
      activeFurnace: this.activeFurnaceKey ? { ...(this.furnaces.get(this.activeFurnaceKey) ?? blankFurnace()), input: cloneSlot(this.furnaces.get(this.activeFurnaceKey)?.input ?? null), fuel: cloneSlot(this.furnaces.get(this.activeFurnaceKey)?.fuel ?? null), output: cloneSlot(this.furnaces.get(this.activeFurnaceKey)?.output ?? null) } : null,
      activeChest: this.activeChestKey ? (this.chests.get(this.activeChestKey) ?? []).map(cloneSlot) : null,
      selected: this.selected,
      targetName: this.target ? BLOCKS[this.target.type].name : null,
      targetMob: this.targetMob ? { name: this.targetMob.name, health: this.targetMob.health, maxHealth: this.targetMob.maxHealth } : null,
      breakProgress: clamp(this.miningProgress, 0, 1),
      day: this.day,
      clock: `${displayHour}:${String(minutes).padStart(2, "0")} ${suffix}`,
      biome: BIOME_NAMES[biome] ?? "The Unmapped Wild",
      depth: this.depthName(),
      coordinates: [Math.round(this.position.x), Math.round(this.position.y), Math.round(this.position.z)],
      debug: this.debug,
      mode: this.mode,
      weather: this.weather,
      loadedChunks: this.world.loadedCount,
      queuedChunks: this.world.queuedCount,
      fullscreen: this.fullscreen,
    });
  }

  createStars() {
    const positions: number[] = [];
    for (let index = 0; index < 260; index += 1) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(0.15 + Math.random() * 0.85);
      const radius = 80;
      positions.push(Math.sin(phi) * Math.cos(theta) * radius, Math.cos(phi) * radius, Math.sin(phi) * Math.sin(theta) * radius);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    return new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xffffff, size: 0.42, sizeAttenuation: true, transparent: true, opacity: 0 }));
  }

  createRain() {
    const positions: number[] = [];
    for (let index = 0; index < 420; index += 1) {
      const x = (Math.random() - 0.5) * 30;
      const y = Math.random() * 22;
      const z = (Math.random() - 0.5) * 30;
      positions.push(x, y, z, x, y - 0.75, z);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const rain = new THREE.LineSegments(geometry, new THREE.LineBasicMaterial({ color: 0xa8d8ff, transparent: true, opacity: 0.45, depthWrite: false }));
    rain.visible = false;
    rain.renderOrder = 4;
    return rain;
  }

  createClouds() {
    const material = new THREE.MeshLambertMaterial({ color: 0xf2f4ef, transparent: true, opacity: 0.82, depthWrite: false });
    for (let index = 0; index < 14; index += 1) {
      const cloud = new THREE.Group();
      cloud.userData.cloud = true;
      for (let piece = 0; piece < 2 + (index % 3); piece += 1) {
        const cube = new THREE.Mesh(new THREE.BoxGeometry(4 + piece * 1.5, 0.8, 2.2), material);
        cube.position.set(piece * 2.3, (piece % 2) * 0.35, (piece % 3) - 1);
        cloud.add(cube);
      }
      cloud.position.set(-55 + ((index * 13) % 110), 74 + (index % 3) * 2, -50 + ((index * 17) % 100));
      this.ambienceGroup.add(cloud);
    }
  }

  setSettings(next: Partial<GameSettings>) {
    this.settings = {
      ...this.settings,
      ...next,
      volume: clamp(next.volume ?? this.settings.volume, 0, 1),
      sensitivity: clamp(next.sensitivity ?? this.settings.sensitivity, 0.0008, 0.005),
      fov: clamp(next.fov ?? this.settings.fov, 55, 100),
      renderDistance: clamp(Math.round(next.renderDistance ?? this.settings.renderDistance), 2, 5),
    };
    this.weather = this.settings.weather;
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    this.world.setRenderDistance(this.settings.renderDistance);
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
    this.saveTimer = window.setTimeout(() => this.saveNow(), 700);
  }

  serialize(): WorldSave {
    return {
      version: 2,
      generatorVersion: GENERATOR_VERSION,
      seed: this.world.seedText,
      mode: this.mode,
      edits: this.world.serializeEdits(),
      player: { x: this.position.x, y: this.position.y, z: this.position.z, yaw: this.yaw, pitch: this.pitch },
      spawn: { x: this.spawn.x, y: this.spawn.y, z: this.spawn.z },
      inventory: this.inventory.map(cloneSlot),
      selected: this.selected,
      health: this.health,
      hunger: this.hunger,
      xp: this.xp,
      level: this.level,
      time: this.worldTime,
      day: this.day,
      weather: this.weather,
      furnaces: Object.fromEntries([...this.furnaces.entries()].map(([key, value]) => [key, { ...value, input: cloneSlot(value.input), fuel: cloneSlot(value.fuel), output: cloneSlot(value.output) }])),
      chests: Object.fromEntries([...this.chests.entries()].map(([key, value]) => [key, value.map(cloneSlot)])),
      savedAt: Date.now(),
    };
  }

  saveNow(notify = true) {
    if (!this.persistent) return;
    window.clearTimeout(this.saveTimer);
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(this.serialize()));
      if (notify) this.events.onSave();
    } catch {
      this.events.onToast("This world grew beyond the browser's save allowance. The current session is safe, but storage is full.");
    }
  }

  dispose() {
    this.disposed = true;
    this.saveNow(false);
    cancelAnimationFrame(this.animationFrame);
    window.clearTimeout(this.saveTimer);
    this.unbindEvents();
    this.resizeObserver?.disconnect();
    this.audio.dispose();
    this.clearEntities();
    this.world.dispose();
    this.sharedDropGeometry.dispose();
    for (const material of this.dropMaterials.values()) material.dispose();
    this.renderer.dispose();
  }
}
