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
  type EquipmentSlot,
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
import { MOB_DEFS, MOB_ORDER, type MobDefinition, type MobKind } from "./mobs";

export { BLOCKS, CREATIVE_BLOCKS, ITEMS, Item, RECIPES, BlockId, BIOME_NAMES, MOB_DEFS, MOB_ORDER, type GameMode, type InventorySlot, type ItemCode, type Recipe, type EquipmentSlot, type MobKind };

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
export type BestiaryProgress = Record<MobKind, { seen: boolean; kills: number }>;

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
  activeChestTitle: string;
  equipment: Record<EquipmentSlot, InventorySlot | null>;
  armor: number;
  bestiary: BestiaryProgress;
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
  cursor?: InventorySlot | null;
  craftGrid?: Array<InventorySlot | null>;
  equipment?: Partial<Record<EquipmentSlot, InventorySlot | null>>;
  bestiary?: Partial<BestiaryProgress>;
  saplings?: Record<string, number>;
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
  drops?: Array<{ item: ItemCode; count: number; durability?: number; x: number; y: number; z: number; age: number }>;
  savedAt: number;
};

export type OverlayKind = "inventory" | "crafting" | "furnace" | "chest" | "bestiary";

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

type MobEntity = {
  id: number;
  kind: MobKind;
  name: string;
  hostile: boolean;
  definition: MobDefinition;
  group: THREE.Group;
  visual: THREE.Group;
  parts: Record<string, THREE.Object3D[]>;
  health: number;
  maxHealth: number;
  damage: number;
  angle: number;
  desiredAngle: number;
  wanderTimer: number;
  attackCooldown: number;
  hurtTimer: number;
  age: number;
  bob: number;
  gait: number;
  fleeTimer: number;
  state: "wander" | "flee" | "chase" | "windup" | "recover";
  stateTimer: number;
  baseY: number;
};

type FallingTree = {
  group: THREE.Group;
  root: THREE.Vector3;
  fallAxis: THREE.Vector3;
  progress: number;
  logType: BlockId;
  logCount: number;
  leafCount: number;
  harvest: boolean;
};

type DropEntity = {
  id: number;
  item: ItemCode;
  count: number;
  durability?: number;
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

function blankEquipment(): Record<EquipmentSlot, InventorySlot | null> {
  return { head: null, chest: null, legs: null, feet: null };
}

function blankBestiary(): BestiaryProgress {
  return Object.fromEntries(MOB_ORDER.map((kind) => [kind, { seen: false, kills: 0 }])) as BestiaryProgress;
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
  placedLightPool: THREE.PointLight[] = [];
  lightRefreshTimer = 0;
  skyVisibility = 1;
  skyVisibilityTarget = 1;
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
  equipment = blankEquipment();
  bestiary = blankBestiary();
  saplings = new Map<string, number>();
  saplingCheckTimer = 0;
  cursor: InventorySlot | null = null;
  craftGrid: Array<InventorySlot | null> = Array.from({ length: 9 }, () => null);
  craftingSize: 2 | 3 = 2;
  activeFurnaceKey: string | null = null;
  activeChestKey: string | null = null;
  activeChestTitle = "Chest";
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
  fallingTrees: FallingTree[] = [];
  mobs: MobEntity[] = [];
  drops: DropEntity[] = [];
  nextMobId = 1;
  nextDropId = 1;
  mobSpawnTimer = 2;
  mobRaycaster = new THREE.Raycaster();
  activeRecipe: Recipe | null = null;
  sharedDropGeometry = new THREE.BoxGeometry(0.23, 0.23, 0.23);
  dropMaterials = new Map<number, THREE.MeshLambertMaterial>();
  heldRoot = new THREE.Group();
  heldItemCode: ItemCode = -1;
  heldSwing = 0;
  heldUse = 0;
  activeChestModel: THREE.Group | null = null;
  chestLidPivot: THREE.Group | null = null;
  chestOpenAmount = 0;

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
    this.scene.add(this.camera, this.world.group, this.ambienceGroup, this.creatureGroup, this.dropGroup);
    this.scene.background = new THREE.Color("#78baf2");
    this.scene.fog = new THREE.Fog("#78baf2", 30, 62);

    this.hemisphere = new THREE.HemisphereLight(0xb9ddff, 0x4b3a2d, 1.05);
    this.directional = new THREE.DirectionalLight(0xfff1c7, 1.15);
    this.directional.position.set(18, 30, 12);
    this.scene.add(this.directional.target);
    this.caveLight = new THREE.PointLight(0xffb45e, 0, 24, 1.55);
    const placedLightCount = this.touchMode ? 4 : 8;
    for (let index = 0; index < placedLightCount; index += 1) {
      const light = new THREE.PointLight(0xffb45e, 0, 13, 1.65);
      this.placedLightPool.push(light);
      this.scene.add(light);
    }
    this.scene.add(this.hemisphere, this.directional, this.caveLight);

    this.heldRoot.position.set(0.48, -0.43, -0.78);
    this.heldRoot.rotation.set(-0.18, -0.32, -0.08);
    this.camera.add(this.heldRoot);

    const outlineGeometry = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.008, 1.008, 1.008));
    this.selection = new THREE.LineSegments(outlineGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false }));
    this.selection.renderOrder = 10;
    this.selection.visible = false;
    this.scene.add(this.selection);

    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(6.2, 6.2), new THREE.MeshBasicMaterial({ map: this.createCelestialTexture("sun"), transparent: true, alphaTest: 0.02, fog: false, depthWrite: false }));
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 4.8), new THREE.MeshBasicMaterial({ map: this.createCelestialTexture("moon"), transparent: true, alphaTest: 0.02, fog: false, depthWrite: false }));
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
      this.mineHeld = true;
      if (this.targetMob) this.attackTargetMob();
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
    if (event.code === "KeyQ" && !event.repeat) this.dropSelectedItem();
    if (event.code === "KeyH" && !event.repeat) this.events.onToast("WASD move · Space jump/swim · Shift sprint · Left harvest/attack · Right use/build · E inventory · Q drop");
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
    const friendly = new Set([BiomeId.Meadow, BiomeId.Wildwood, BiomeId.Birchlight, BiomeId.Savanna]);
    let bestFriendly = { x: 0, z: 0, radius: Infinity, score: -Infinity };
    let bestLand = { x: 0, z: 0, score: -Infinity };
    for (let radius = 0; radius <= 1024; radius += 8) {
      const steps = radius === 0 ? 1 : Math.max(8, Math.ceil((Math.PI * 2 * radius) / 12));
      for (let step = 0; step < steps; step += 1) {
        const angle = (step / steps) * Math.PI * 2;
        const x = Math.round(Math.cos(angle) * radius);
        const z = Math.round(Math.sin(angle) * radius);
        const sample = this.world.sampleColumn(x, z);
        if (sample.height <= sample.waterline + 2) continue;
        const neighbors = [this.world.sampleColumn(x + 2, z), this.world.sampleColumn(x - 2, z), this.world.sampleColumn(x, z + 2), this.world.sampleColumn(x, z - 2)];
        if (neighbors.some((neighbor) => neighbor.height <= neighbor.waterline + 1)) continue;
        const slope = Math.max(...neighbors.map((neighbor) => Math.abs(sample.height - neighbor.height)));
        if (slope > 3) continue;
        const dangerPenalty = sample.biome === BiomeId.Volcanic ? 45 : sample.biome === BiomeId.Highlands ? 18 : sample.biome === BiomeId.Badlands ? 10 : 0;
        const score = -radius * 0.08 - slope * 16 - Math.abs(sample.height - (SEA_LEVEL + 10)) * 0.18 - dangerPenalty;
        if (score > bestLand.score) bestLand = { x, z, score };
        if (friendly.has(sample.biome) && score + 55 > bestFriendly.score) bestFriendly = { x, z, radius, score: score + 55 };
      }
      if (bestFriendly.score > -Infinity && radius > bestFriendly.radius + 96) break;
    }
    return bestFriendly.score > -Infinity ? bestFriendly : bestLand;
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
    this.equipment = blankEquipment();
    this.bestiary = blankBestiary();
    this.saplings.clear();
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
      for (let clearY = Math.floor(y + 0.5); clearY <= Math.floor(y + 2.5); clearY += 1) this.world.setBlock(spawn.x + dx, clearY, spawn.z + dz, BlockId.Air);
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
    this.equipment = blankEquipment();
    for (const slot of ["head", "chest", "legs", "feet"] as EquipmentSlot[]) this.equipment[slot] = cloneSlot(save.equipment?.[slot] ?? null);
    this.bestiary = blankBestiary();
    for (const kind of MOB_ORDER) this.bestiary[kind] = { ...this.bestiary[kind], ...(save.bestiary?.[kind] ?? {}) };
    this.saplings = new Map(Object.entries(save.saplings ?? {}).map(([key, value]) => [key, Number(value) || 0]));
    this.cursor = null;
    this.craftGrid = Array.from({ length: 9 }, () => null);
    const transientItems = [save.cursor, ...(save.craftGrid ?? [])].filter((slot): slot is InventorySlot => Boolean(slot));
    for (const slot of transientItems) {
      const leftover = this.addItem(slot.item, slot.count, slot.durability);
      if (leftover > 0) this.spawnDrop(slot.item, leftover, this.position.clone().add(new THREE.Vector3(0, 1, 0)), slot.durability);
    }
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
    for (const savedDrop of save.drops ?? []) {
      if (!ITEMS[savedDrop.item] || savedDrop.count <= 0) continue;
      const drop = this.spawnDrop(savedDrop.item, Math.min(savedDrop.count, maxStack(savedDrop.item)), new THREE.Vector3(savedDrop.x, savedDrop.y, savedDrop.z), savedDrop.durability);
      if (!drop) continue;
      drop.mesh.position.set(savedDrop.x, savedDrop.y, savedDrop.z);
      drop.velocity.set(0, 0, 0);
      drop.age = clamp(Number(savedDrop.age) || 0, 0, 115);
      drop.pickupDelay = 0.25;
    }
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
      if (!document.fullscreenElement) {
        try { await shell?.requestFullscreen({ navigationUI: "hide" }); }
        catch { await shell?.requestFullscreen(); }
      }
      else await document.exitFullscreen();
    } catch {
      this.events.onToast("Fullscreen is unavailable in this browser.");
    }
  }

  chestStorageKey(block: string) {
    if (this.chests.has(block)) return block;
    for (const key of this.chests.keys()) if (key.includes("|") && key.split("|").includes(block)) return key;
    return block;
  }

  resolveChest(block: string) {
    const existing = this.chestStorageKey(block);
    if (existing.includes("|")) return existing;
    const [x, y, z] = block.split(",").map(Number);
    const neighbor = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .map(([dx, dz]) => blockKey(x + dx, y, z + dz))
      .find((candidate) => this.world.getBlock(...candidate.split(",").map(Number) as [number, number, number]) === BlockId.Chest && !this.chestStorageKey(candidate).includes("|"));
    if (!neighbor) {
      if (!this.chests.has(block)) this.chests.set(block, this.generateChestLoot(block));
      return block;
    }
    const blocks = [block, neighbor].sort();
    const key = blocks.join("|");
    const slots = blocks.flatMap((candidate) => this.chests.get(candidate) ?? this.generateChestLoot(candidate));
    this.chests.delete(block);
    this.chests.delete(neighbor);
    this.chests.set(key, slots);
    return key;
  }

  showChestModel(block: string, large: boolean) {
    this.hideChestModel(true);
    const blocks = (this.activeChestKey ?? block).split("|");
    const positions = blocks.map((key) => key.split(",").map(Number));
    const x = positions.reduce((sum, value) => sum + value[0], 0) / positions.length;
    const y = positions[0][1];
    const z = positions.reduce((sum, value) => sum + value[2], 0) / positions.length;
    const alongX = large && positions[0][2] === positions.at(-1)?.[2];
    const width = large && alongX ? 1.86 : 0.88;
    const depth = large && !alongX ? 1.86 : 0.88;
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.5, depth / 2 - 0.08);
    const lidMaterial = new THREE.MeshLambertMaterial({ color: 0xa56c32 });
    const lid = new THREE.Mesh(new THREE.BoxGeometry(width, 0.18, depth), lidMaterial);
    lid.position.set(0, 0, -depth / 2 + 0.08);
    pivot.add(lid);
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.22, 0.08), new THREE.MeshLambertMaterial({ color: 0xe0b54e }));
    latch.position.set(0, -0.03, -depth + 0.025);
    pivot.add(latch);
    group.add(pivot);
    this.scene.add(group);
    this.activeChestModel = group;
    this.chestLidPivot = pivot;
    this.chestOpenAmount = 0;
    this.audio.play("place", BlockId.Chest);
  }

  hideChestModel(immediate = false) {
    if (!this.activeChestModel) return;
    if (!immediate) {
      this.audio.play("place", BlockId.Chest);
      return;
    }
    this.disposeObject(this.activeChestModel);
    this.scene.remove(this.activeChestModel);
    this.activeChestModel = null;
    this.chestLidPivot = null;
    this.chestOpenAmount = 0;
  }

  updateChestModel(dt: number) {
    if (!this.activeChestModel || !this.chestLidPivot) return;
    const target = this.activeChestKey ? 1 : 0;
    this.chestOpenAmount += (target - this.chestOpenAmount) * (1 - Math.exp(-dt * 10));
    this.chestLidPivot.rotation.x = -this.chestOpenAmount * 1.08;
    if (!target && this.chestOpenAmount < 0.015) this.hideChestModel(true);
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
      this.activeChestKey = this.resolveChest(key);
      this.activeChestTitle = this.activeChestKey.includes("|") ? "Large Wildwood Chest" : "Wildwood Chest";
      this.activeFurnaceKey = null;
      this.showChestModel(key, this.activeChestKey.includes("|"));
    } else if (kind === "bestiary") {
      this.activeFurnaceKey = null;
      this.activeChestKey = null;
    }
    this.pause();
    this.events.onOverlayRequest(kind, key);
    this.emitHud(true);
  }

  closeContainer() {
    if (this.cursor) {
      const leftover = this.addItem(this.cursor.item, this.cursor.count, this.cursor.durability);
      if (leftover > 0) this.spawnDrop(this.cursor.item, leftover, this.position.clone().add(new THREE.Vector3(0, 1, 0)), this.cursor.durability);
      this.cursor = null;
    }
    for (let index = 0; index < this.craftGrid.length; index += 1) {
      const slot = this.craftGrid[index];
      if (!slot) continue;
      const leftover = this.addItem(slot.item, slot.count, slot.durability);
      if (leftover > 0) this.spawnDrop(slot.item, leftover, this.position.clone().add(new THREE.Vector3(0, 1, 0)), slot.durability);
      this.craftGrid[index] = null;
    }
    this.activeFurnaceKey = null;
    this.activeChestKey = null;
    this.craftingSize = 2;
    this.hideChestModel();
    this.saveSoon();
    this.emitHud(true);
  }

  selectSlot(slot: number) {
    this.selected = (slot + 9) % 9;
    this.audio.play("ui");
    this.emitHud(true);
  }

  setCreativeItem(item: ItemCode) {
    if (this.mode !== "builder" || !ITEMS[item]) return;
    this.inventory[this.selected] = { item, count: maxStack(item), ...(ITEMS[item].maxDurability ? { durability: ITEMS[item].maxDurability } : {}) };
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

  sameStack(a: InventorySlot | null, b: InventorySlot | null) {
    return Boolean(a && b && a.item === b.item && a.durability === b.durability);
  }

  transferInto(source: InventorySlot, destination: Array<InventorySlot | null>, indices = destination.map((_, index) => index)) {
    for (const index of indices) {
      const target = destination[index];
      if (!this.sameStack(source, target) || !target || target.count >= maxStack(target.item)) continue;
      const moved = Math.min(source.count, maxStack(target.item) - target.count);
      target.count += moved;
      source.count -= moved;
      if (source.count <= 0) return true;
    }
    for (const index of indices) {
      if (destination[index]) continue;
      destination[index] = { ...source };
      source.count = 0;
      return true;
    }
    return source.count <= 0;
  }

  equipmentClick(slot: EquipmentSlot, button: "left" | "right", shift = false) {
    const equipped = this.equipment[slot];
    if (shift && equipped) {
      const leftover = this.addItem(equipped.item, equipped.count, equipped.durability);
      if (leftover === 0) this.equipment[slot] = null;
    } else if (!this.cursor && equipped) {
      this.cursor = equipped;
      this.equipment[slot] = null;
    } else if (this.cursor && ITEMS[this.cursor.item]?.equipmentSlot === slot) {
      if (!equipped) {
        this.equipment[slot] = { ...this.cursor, count: 1 };
        this.cursor.count -= 1;
        if (this.cursor.count <= 0) this.cursor = null;
      } else if (button === "left") {
        this.equipment[slot] = { ...this.cursor, count: 1 };
        this.cursor = equipped;
      }
    }
    this.audio.play("ui");
    this.saveSoon();
    this.emitHud(true);
  }

  collectMatching(preferredItem?: ItemCode) {
    const item = this.cursor?.item ?? preferredItem;
    if (item === undefined || !ITEMS[item]) return;
    if (!this.cursor) this.cursor = { item, count: 0, ...(ITEMS[item].maxDurability ? { durability: ITEMS[item].maxDurability } : {}) };
    const durability = this.cursor.durability;
    const sources: Array<Array<InventorySlot | null>> = [this.inventory, this.craftGrid];
    if (this.activeChestKey) {
      const chest = this.chests.get(this.activeChestKey);
      if (chest) sources.push(chest);
    }
    if (this.activeFurnaceKey) {
      const furnace = this.furnaces.get(this.activeFurnaceKey);
      if (furnace) sources.push([furnace.input, furnace.fuel, furnace.output]);
    }
    for (const source of sources) for (let index = 0; index < source.length; index += 1) {
      const slot = source[index];
      if (!slot || slot.item !== item || slot.durability !== durability || this.cursor.count >= maxStack(item)) continue;
      const moved = Math.min(slot.count, maxStack(item) - this.cursor.count);
      this.cursor.count += moved;
      slot.count -= moved;
      if (slot.count <= 0) source[index] = null;
    }
    if (this.activeFurnaceKey) {
      const furnace = this.furnaces.get(this.activeFurnaceKey);
      const source = sources.at(-1);
      if (furnace && source?.length === 3) [furnace.input, furnace.fuel, furnace.output] = source as [InventorySlot | null, InventorySlot | null, InventorySlot | null];
    }
    this.audio.play("pickup");
    this.saveSoon();
    this.emitHud(true);
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
    const equipmentSlot = ITEMS[slot.item]?.equipmentSlot;
    if (equipmentSlot && !this.equipment[equipmentSlot]) {
      this.equipment[equipmentSlot] = slot;
      this.inventory[index] = null;
      this.saveSoon();
      return;
    }
    if (this.activeChestKey) {
      const chest = this.chests.get(this.activeChestKey);
      if (chest && this.transferInto(slot, chest)) this.inventory[index] = null;
      this.saveSoon();
      return;
    }
    if (this.activeFurnaceKey) {
      const furnace = this.furnaces.get(this.activeFurnaceKey);
      if (!furnace) return;
      const target = SMELTING[slot.item] ? "input" : this.fuelValue(slot.item) > 0 ? "fuel" : null;
      if (!target) return;
      const destination = [furnace[target]];
      if (this.transferInto(slot, destination)) this.inventory[index] = null;
      furnace[target] = destination[0];
      this.saveSoon();
      return;
    }
    const targets = index < 9 ? [...Array.from({ length: 27 }, (_, i) => i + 9)] : [...Array.from({ length: 9 }, (_, i) => i)];
    for (const target of targets) {
      const other = this.inventory[target];
      if (this.sameStack(other, slot) && other && other.count < maxStack(slot.item)) {
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

  craftSlotClick(index: number, button: "left" | "right", shift = false) {
    if (index < 0 || index >= 9) return;
    if (this.craftingSize === 2 && !CRAFT_POSITIONS_2.includes(index)) return;
    const slot = this.craftGrid[index];
    if (shift && slot) {
      const leftover = this.addItem(slot.item, slot.count, slot.durability);
      slot.count = leftover;
      if (slot.count <= 0) this.craftGrid[index] = null;
      this.updateCraftResult();
      this.audio.play("pickup");
      this.saveSoon();
      this.emitHud(true);
      return;
    }
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
    this.saveSoon();
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

  inventoryCapacity(item: ItemCode, durability?: number) {
    return this.inventory.reduce((capacity, slot) => {
      if (!slot) return capacity + maxStack(item);
      if (slot.item === item && slot.durability === durability) return capacity + Math.max(0, maxStack(item) - slot.count);
      return capacity;
    }, 0);
  }

  consumeCraftMatch(match: NonNullable<ReturnType<VoxelEngine["findRecipe"]>>) {
    for (let y = 0; y < match.recipe.height; y += 1) for (let x = 0; x < match.recipe.width; x += 1) {
      if (match.recipe.pattern[y * match.recipe.width + x] === 0) continue;
      const index = (match.minY + y) * 3 + match.minX + x;
      const slot = this.craftGrid[index];
      if (slot) { slot.count -= 1; if (slot.count <= 0) this.craftGrid[index] = null; }
    }
  }

  craftOutputClick(shift = false) {
    const match = this.findRecipe();
    if (!match) return;
    const output = cloneSlot(match.recipe.output)!;
    output.durability ??= ITEMS[output.item]?.maxDurability;
    if (shift) {
      let crafted = 0;
      let current: ReturnType<VoxelEngine["findRecipe"]> = match;
      while (current && crafted < 64) {
        const currentOutput = cloneSlot(current.recipe.output)!;
        currentOutput.durability ??= ITEMS[currentOutput.item]?.maxDurability;
        if (this.inventoryCapacity(currentOutput.item, currentOutput.durability) < currentOutput.count) break;
        this.consumeCraftMatch(current);
        this.addItem(currentOutput.item, currentOutput.count, currentOutput.durability);
        crafted += currentOutput.count;
        current = this.findRecipe();
      }
      if (crafted > 0) {
        this.audio.play("craft");
        this.events.onToast(`Crafted ${itemName(output.item)} ×${crafted}`);
      }
      this.updateCraftResult();
      this.saveSoon();
      this.emitHud(true);
      return;
    }
    if (this.cursor && (this.cursor.item !== output.item || this.cursor.count + output.count > maxStack(output.item))) return;
    if (!this.cursor) this.cursor = cloneSlot(output);
    else this.cursor.count += output.count;
    this.consumeCraftMatch(match);
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

  machineClick(machine: "furnace" | "chest", index: number, button: "left" | "right", shift = false) {
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
    if (shift && slot) {
      const original = slot.count;
      const leftover = this.addItem(slot.item, slot.count, slot.durability);
      slot.count = leftover;
      if (leftover <= 0) slots[index] = null;
      if (machine === "furnace") {
        const furnace = this.furnaces.get(this.activeFurnaceKey ?? "");
        if (furnace) [furnace.input, furnace.fuel, furnace.output] = slots as [InventorySlot | null, InventorySlot | null, InventorySlot | null];
      }
      if (leftover < original) this.audio.play("pickup");
      this.saveSoon();
      this.emitHud(true);
      return;
    }
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
    if (machine === "furnace" && this.cursor) {
      if (index === 0 && !SMELTING[this.cursor.item]) {
        this.events.onToast("That item cannot be smelted.");
        return;
      }
      if (index === 1 && this.fuelValue(this.cursor.item) <= 0) {
        this.events.onToast("That item is not furnace fuel.");
        return;
      }
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

  updateSaplings(dt: number) {
    this.saplingCheckTimer -= dt;
    if (this.saplingCheckTimer > 0 || !this.saplings.size) return;
    this.saplingCheckTimer = 1;
    const now = Date.now();
    let processed = 0;
    for (const [key, due] of this.saplings.entries()) {
      if (due > now || processed >= 6) continue;
      processed += 1;
      const [x, y, z] = key.split(",").map(Number);
      if (this.world.getBlock(x, y, z) !== BlockId.WildwoodSapling) { this.saplings.delete(key); continue; }
      const biome = this.world.biomeAt(x, z);
      const log = biome === BiomeId.Frostpine || biome === BiomeId.Snowfield ? BlockId.PineLog : biome === BiomeId.Birchlight ? BlockId.BirchLog : biome === BiomeId.Bloomwood ? BlockId.BloomLog : BlockId.WildwoodLog;
      const leaves = log === BlockId.PineLog ? BlockId.PineLeaves : log === BlockId.BirchLog ? BlockId.BirchLeaves : log === BlockId.BloomLog ? BlockId.BloomLeaves : BlockId.WildwoodLeaves;
      const height = 5 + Math.floor(Math.random() * 3);
      let clear = true;
      for (let dy = 1; dy <= height + 2 && clear; dy += 1) for (let dx = -2; dx <= 2 && clear; dx += 1) for (let dz = -2; dz <= 2; dz += 1) {
        if (dy < height - 2 && (dx !== 0 || dz !== 0)) continue;
        const type = this.world.getBlock(x + dx, y + dy, z + dz);
        if (type === undefined || (type !== BlockId.Air && !BLOCKS[type]?.replaceable)) { clear = false; break; }
      }
      if (!clear) { this.saplings.set(key, now + 30_000 + Math.random() * 30_000); continue; }
      const changes: Array<{ x: number; y: number; z: number; type: BlockId }> = [];
      for (let dy = 0; dy < height; dy += 1) changes.push({ x, y: y + dy, z, type: log });
      for (let dx = -2; dx <= 2; dx += 1) for (let dz = -2; dz <= 2; dz += 1) for (let dy = -1; dy <= 2; dy += 1) {
        if (Math.abs(dx) + Math.abs(dz) + Math.max(0, dy) > 4 || (dx === 0 && dz === 0 && dy <= 0)) continue;
        changes.push({ x: x + dx, y: y + height - 1 + dy, z: z + dz, type: leaves });
      }
      this.world.setBlocksBatch(changes, true, true);
      this.saplings.delete(key);
      if (this.position.distanceToSquared(new THREE.Vector3(x, y, z)) < 400) {
        this.audio.play("place", log);
        this.events.onToast("A sapling unfurled into a living tree.");
      }
    }
    if (processed) this.saveSoon();
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

  isDoor(type: BlockId) {
    return type === BlockId.DoorClosedLower || type === BlockId.DoorClosedUpper || type === BlockId.DoorOpenLower || type === BlockId.DoorOpenUpper;
  }

  doorLowerY(type: BlockId, y: number) {
    return type === BlockId.DoorClosedUpper || type === BlockId.DoorOpenUpper ? y - 1 : y;
  }

  toggleDoor(x: number, y: number, z: number, type: BlockId) {
    const lowerY = this.doorLowerY(type, y);
    const open = type === BlockId.DoorOpenLower || type === BlockId.DoorOpenUpper;
    this.world.setBlocksBatch([
      { x, y: lowerY, z, type: open ? BlockId.DoorClosedLower : BlockId.DoorOpenLower },
      { x, y: lowerY + 1, z, type: open ? BlockId.DoorClosedUpper : BlockId.DoorOpenUpper },
    ], true, true);
    this.audio.play("place", BlockId.Planks);
    this.placeCooldown = 0.18;
    this.saveSoon();
  }

  useSelected() {
    if (this.placeCooldown > 0) return;
    if (this.target) {
      const key = blockKey(this.target.x, this.target.y, this.target.z);
      if (this.isDoor(this.target.type)) { this.toggleDoor(this.target.x, this.target.y, this.target.z, this.target.type); return; }
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
      this.heldUse = 1;
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
    if (type === BlockId.WildwoodSapling) {
      const soil = this.world.getBlock(x, y - 1, z);
      if (![BlockId.Grass, BlockId.Dirt, BlockId.SnowyGrass, BlockId.SavannaGrass, BlockId.SwampGrass, BlockId.Farmland].includes(soil ?? BlockId.Air)) {
        this.events.onToast("Saplings need living soil.");
        return;
      }
    }
    if (type === BlockId.DoorClosedLower) {
      const upper = this.world.getBlock(x, y + 1, z);
      const support = this.world.getBlock(x, y - 1, z);
      if (y + 1 > MAX_Y || upper === undefined || (!BLOCKS[upper]?.replaceable && upper !== BlockId.Air) || !BLOCKS[support ?? BlockId.Air]?.solid) {
        this.events.onToast("A door needs two clear blocks and solid ground.");
        return;
      }
      this.world.setBlocksBatch([{ x, y, z, type: BlockId.DoorClosedLower }, { x, y: y + 1, z, type: BlockId.DoorClosedUpper }], true, true);
    } else this.world.setBlock(x, y, z, type, true, true);
    if (BLOCKS[type].solid && this.collidesAt(this.position)) {
      if (type === BlockId.DoorClosedLower) this.world.setBlocksBatch([{ x, y, z, type: current ?? BlockId.Air }, { x, y: y + 1, z, type: BlockId.Air }], true, true);
      else this.world.setBlock(x, y, z, current ?? BlockId.Air, true, true);
      this.events.onToast("You cannot place a block inside yourself.");
      return;
    }
    if (type === BlockId.Chest) this.chests.set(blockKey(x, y, z), Array.from({ length: 27 }, () => null));
    if (type === BlockId.Furnace) this.furnaces.set(blockKey(x, y, z), blankFurnace());
    if (type === BlockId.WildwoodSapling) this.saplings.set(blockKey(x, y, z), Date.now() + 75_000 + Math.random() * 75_000);
    if (this.mode === "survival") {
      slot.count -= 1;
      if (slot.count <= 0) this.inventory[this.selected] = null;
    }
    this.placeCooldown = 0.16;
    this.heldUse = 1;
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

  tryFellTree(x: number, y: number, z: number, type: BlockId) {
    const leavesByLog: Partial<Record<BlockId, BlockId>> = {
      [BlockId.WildwoodLog]: BlockId.WildwoodLeaves,
      [BlockId.PineLog]: BlockId.PineLeaves,
      [BlockId.BirchLog]: BlockId.BirchLeaves,
      [BlockId.BloomLog]: BlockId.BloomLeaves,
    };
    const leafType = leavesByLog[type];
    if (leafType === undefined) return false;
    const queue: Array<[number, number, number]> = [[x, y, z]];
    const logs = new Map<string, [number, number, number]>();
    while (queue.length && logs.size < 96) {
      const current = queue.shift()!;
      const key = blockKey(...current);
      if (logs.has(key) || Math.abs(current[0] - x) > 8 || Math.abs(current[1] - y) > 16 || Math.abs(current[2] - z) > 8) continue;
      if (this.world.getBlock(...current) !== type) continue;
      logs.set(key, current);
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) queue.push([current[0] + dx, current[1] + dy, current[2] + dz]);
    }
    if (logs.size < 3) return false;
    const leaves = new Map<string, [number, number, number]>();
    for (const log of logs.values()) {
      for (let dx = -3; dx <= 3 && leaves.size < 320; dx += 1) for (let dy = -3; dy <= 3 && leaves.size < 320; dy += 1) for (let dz = -3; dz <= 3 && leaves.size < 320; dz += 1) {
        if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 6) continue;
        const candidate: [number, number, number] = [log[0] + dx, log[1] + dy, log[2] + dz];
        if (this.world.getBlock(...candidate) === leafType) leaves.set(blockKey(...candidate), candidate);
      }
    }
    if (leaves.size < 4) return false;
    const root = [...logs.values()].sort((a, b) => a[1] - b[1])[0];
    const changes = [...logs.values(), ...leaves.values()].map(([bx, by, bz]) => ({ x: bx, y: by, z: bz, type: BlockId.Air }));
    this.world.setBlocksBatch(changes, true, true);
    const group = new THREE.Group();
    group.position.set(root[0], root[1], root[2]);
    const matrix = new THREE.Matrix4();
    const logGeometry = new THREE.BoxGeometry(0.94, 0.94, 0.94);
    const logMaterial = new THREE.MeshLambertMaterial({ color: BLOCKS[type].color });
    const logMesh = new THREE.InstancedMesh(logGeometry, logMaterial, logs.size);
    [...logs.values()].forEach(([bx, by, bz], index) => { matrix.makeTranslation(bx - root[0], by - root[1], bz - root[2]); logMesh.setMatrixAt(index, matrix); });
    group.add(logMesh);
    if (leaves.size) {
      const leafGeometry = new THREE.BoxGeometry(0.9, 0.9, 0.9);
      const leafMaterial = new THREE.MeshLambertMaterial({ color: BLOCKS[leafType].color, transparent: true, opacity: 0.88 });
      const leafMesh = new THREE.InstancedMesh(leafGeometry, leafMaterial, leaves.size);
      [...leaves.values()].forEach(([bx, by, bz], index) => { matrix.makeTranslation(bx - root[0], by - root[1], bz - root[2]); leafMesh.setMatrixAt(index, matrix); });
      group.add(leafMesh);
    }
    this.scene.add(group);
    const away = new THREE.Vector3(root[0] - this.position.x, 0, root[2] - this.position.z).normalize();
    if (away.lengthSq() < 0.1) away.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    this.fallingTrees.push({ group, root: new THREE.Vector3(...root), fallAxis: new THREE.Vector3(away.z, 0, -away.x).normalize(), progress: 0, logType: type, logCount: logs.size, leafCount: leaves.size, harvest: this.mode === "survival" });
    if (this.mode === "survival") this.damageSelectedTool(Math.max(1, Math.ceil(logs.size / 4)));
    this.audio.play("break", type);
    this.events.onToast(`${BLOCKS[type].name.replace(" Log", "")} timber!`);
    return true;
  }

  settleFallingTree(tree: FallingTree) {
    const height = Math.max(3, tree.logCount);
    const direction = new THREE.Vector3(-tree.fallAxis.z, 0, tree.fallAxis.x);
    const landing = tree.root.clone().add(direction.multiplyScalar(Math.min(7, height * 0.7))).add(new THREE.Vector3(0, 0.4, 0));
    if (tree.harvest) {
      this.spawnDrop(tree.logType, tree.logCount, landing);
      const sticks = Math.floor(tree.leafCount * 0.09);
      if (sticks > 0) this.spawnDrop(Item.Stick, sticks, landing.clone().add(new THREE.Vector3(0.5, 0, 0.5)));
      const saplings = Math.max(1, Math.floor(tree.leafCount * 0.035));
      this.spawnDrop(BlockId.WildwoodSapling, saplings, landing.clone().add(new THREE.Vector3(-0.5, 0, -0.4)));
      if (tree.logType === BlockId.WildwoodLog && Math.random() < 0.55) this.spawnDrop(Item.Apple, 1, landing.clone().add(new THREE.Vector3(0.2, 0, -0.5)));
    }
    this.spawnParticles(landing.x, landing.y, landing.z, tree.logType, 18);
    this.audio.play("land", tree.logType);
    this.disposeObject(tree.group);
    this.scene.remove(tree.group);
  }

  updateFallingTrees(dt: number) {
    for (let index = this.fallingTrees.length - 1; index >= 0; index -= 1) {
      const tree = this.fallingTrees[index];
      tree.progress = Math.min(1, tree.progress + dt / 0.92);
      const eased = 1 - Math.pow(1 - tree.progress, 3);
      tree.group.quaternion.setFromAxisAngle(tree.fallAxis, eased * Math.PI * 0.48);
      if (tree.progress >= 1) {
        this.settleFallingTree(tree);
        this.fallingTrees.splice(index, 1);
      }
    }
  }

  settleAllFallingTrees() {
    for (const tree of this.fallingTrees) this.settleFallingTree(tree);
    this.fallingTrees = [];
  }

  breakTarget() {
    if (!this.target || this.target.type === BlockId.Bedrock || this.target.type === BlockId.Water || this.target.type === BlockId.Lava) return;
    const { x, y, z, type } = this.target;
    if (this.tryFellTree(x, y, z, type)) {
      this.miningProgress = 0;
      this.target = null;
      this.saveSoon();
      this.emitHud(true);
      return;
    }
    const harvested = this.toolCanHarvest(type, this.selectedSlot());
    if (this.isDoor(type)) {
      const lowerY = this.doorLowerY(type, y);
      this.world.setBlocksBatch([{ x, y: lowerY, z, type: BlockId.Air }, { x, y: lowerY + 1, z, type: BlockId.Air }], true, true);
    } else this.world.setBlock(x, y, z, BlockId.Air, true, true);
    if (this.mode === "survival") {
      if (harvested) this.dropBlockLoot(this.isDoor(type) ? BlockId.Air : type, x, y, z);
      else this.events.onToast(`${BLOCKS[type].name} crumbled without the right tool.`);
      this.damageSelectedTool();
    }
    const key = blockKey(x, y, z);
    if (type === BlockId.WildwoodSapling) this.saplings.delete(key);
    if (this.isDoor(type) && this.mode === "survival") this.spawnDrop(Item.WildwoodDoor, 1, new THREE.Vector3(x, y + 0.3, z));
    if (type === BlockId.Furnace) {
      const furnace = this.furnaces.get(key);
      if (furnace) for (const slot of [furnace.input, furnace.fuel, furnace.output]) if (slot) this.spawnDrop(slot.item, slot.count, new THREE.Vector3(x, y + 0.5, z), slot.durability);
      this.furnaces.delete(key);
    }
    if (type === BlockId.Chest) {
      const storageKey = this.chestStorageKey(key);
      const chest = this.chests.get(storageKey) ?? this.generateChestLoot(key);
      if (storageKey.includes("|")) {
        const blocks = storageKey.split("|");
        const half = Math.max(0, blocks.indexOf(key));
        const removed = chest.slice(half * 27, half * 27 + 27);
        const remaining = chest.slice(half === 0 ? 27 : 0, half === 0 ? 54 : 27);
        for (const slot of removed) if (slot) this.spawnDrop(slot.item, slot.count, new THREE.Vector3(x, y + 0.5, z), slot.durability);
        this.chests.delete(storageKey);
        const other = blocks[half === 0 ? 1 : 0];
        this.chests.set(other, remaining);
      } else {
        for (const slot of chest) if (slot) this.spawnDrop(slot.item, slot.count, new THREE.Vector3(x, y + 0.5, z), slot.durability);
        this.chests.delete(storageKey);
      }
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
      drops = [...this.randomDrop(Item.Stick, 1, 2, 0.22), ...this.randomDrop(BlockId.WildwoodSapling, 1, 1, 0.055), ...this.randomDrop(Item.Apple, 1, 1, 0.06)];
    } else if (type === BlockId.TallGrass) {
      drops = this.randomDrop(Item.Fiber, 1, 1, 0.35);
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
    if (this.targetMob && !this.bestiary[this.targetMob.kind].seen) { this.bestiary[this.targetMob.kind].seen = true; this.saveSoon(); }
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
      this.fallVelocity = 0;
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
      if (this.mode === "survival" && this.fallVelocity < -11.2) this.damagePlayer(Math.min(6, Math.max(1, Math.floor((-this.fallVelocity - 9) / 2))), "the fall", true);
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
      if (this.hunger <= 0 && this.regenTimer > 4) { this.damagePlayer(1, "hunger", true); this.regenTimer = 0; }
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

  armorPoints() {
    return (Object.keys(this.equipment) as EquipmentSlot[]).reduce((total, slot) => total + (this.equipment[slot] ? (ITEMS[this.equipment[slot]!.item]?.armor ?? 0) : 0), 0);
  }

  damageArmor() {
    for (const slot of Object.keys(this.equipment) as EquipmentSlot[]) {
      const equipped = this.equipment[slot];
      const maximum = equipped ? ITEMS[equipped.item]?.maxDurability : undefined;
      if (!equipped || !maximum) continue;
      equipped.durability = (equipped.durability ?? maximum) - 1;
      if (equipped.durability <= 0) {
        this.events.onToast(`${ITEMS[equipped.item].name} broke.`);
        this.equipment[slot] = null;
      }
    }
  }

  damagePlayer(amount: number, source: string, bypassArmor = false) {
    if (this.mode !== "survival" || this.playerInvulnerability > 0 || this.spawnProtection > 0) return;
    const armor = bypassArmor ? 0 : this.armorPoints();
    const reduction = Math.min(0.62, armor * 0.045);
    const finalAmount = Math.max(0.5, Math.round(amount * (1 - reduction) * 2) / 2);
    this.health -= finalAmount;
    if (armor > 0 && !bypassArmor) this.damageArmor();
    this.playerInvulnerability = 0.7;
    this.audio.play("hurt");
    this.events.onToast(`${source[0].toUpperCase()}${source.slice(1)} cost ${finalAmount} ${finalAmount === 1 ? "heart" : "hearts"}.`);
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
    const visual = new THREE.Group();
    group.add(visual);
    const parts: Record<string, THREE.Object3D[]> = { legs: [], wings: [], arms: [], head: [], body: [] };
    const [bodyColor, accentColor, eyeColor] = MOB_DEFS[kind].colors;
    const bodyMaterial = new THREE.MeshLambertMaterial({ color: bodyColor });
    const accentMaterial = new THREE.MeshLambertMaterial({ color: accentColor });
    const eyeMaterial = new THREE.MeshBasicMaterial({ color: eyeColor });
    const darkMaterial = new THREE.MeshLambertMaterial({ color: new THREE.Color(bodyColor).multiplyScalar(0.62) });
    const add = (parent: THREE.Object3D, size: [number, number, number], material: THREE.Material, position: [number, number, number], part?: string) => {
      const geometry = new THREE.BoxGeometry(...size);
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...position);
      mesh.userData.mobId = id;
      parent.add(mesh);
      if (part) parts[part].push(mesh);
      return mesh;
    };
    const pivotBox = (size: [number, number, number], material: THREE.Material, pivotPosition: [number, number, number], meshOffset: [number, number, number], part: string) => {
      const pivot = new THREE.Group();
      pivot.position.set(...pivotPosition);
      visual.add(pivot);
      add(pivot, size, material, meshOffset);
      parts[part].push(pivot);
      return pivot;
    };
    if (kind === "mossling") {
      add(visual, [0.64, 0.44, 0.56], bodyMaterial, [0, 0.1, 0], "body");
      add(visual, [0.42, 0.34, 0.36], accentMaterial, [0, 0.28, -0.34], "head");
      add(visual, [0.08, 0.08, 0.04], eyeMaterial, [-0.12, 0.32, -0.53]); add(visual, [0.08, 0.08, 0.04], eyeMaterial, [0.12, 0.32, -0.53]);
      for (const [px, pz, phase] of [[-0.2, -0.05, 0], [0.2, -0.05, Math.PI]] as Array<[number, number, number]>) { const leg = pivotBox([0.16, 0.3, 0.16], darkMaterial, [px, -0.1, pz], [0, -0.15, 0], "legs"); leg.userData.phase = phase; }
      for (const [px, py, pz, scale] of [[-0.18, 0.5, -0.03, 0.24], [0.12, 0.55, 0.02, 0.28], [0, 0.48, -0.18, 0.2]] as Array<[number, number, number, number]>) add(visual, [scale, 0.08, scale * 1.35], accentMaterial, [px, py, pz]);
    } else if (kind === "ridgeback") {
      add(visual, [0.88, 0.62, 1.32], bodyMaterial, [0, 0.08, 0.05], "body");
      add(visual, [0.64, 0.5, 0.62], accentMaterial, [0, 0.1, -0.8], "head");
      add(visual, [0.48, 0.3, 0.38], darkMaterial, [0, -0.03, -1.18]);
      add(visual, [0.07, 0.08, 0.04], eyeMaterial, [-0.19, 0.2, -1.13]); add(visual, [0.07, 0.08, 0.04], eyeMaterial, [0.19, 0.2, -1.13]);
      add(visual, [0.08, 0.1, 0.3], new THREE.MeshLambertMaterial({ color: 0xe8d8af }), [-0.27, -0.03, -1.35]); add(visual, [0.08, 0.1, 0.3], new THREE.MeshLambertMaterial({ color: 0xe8d8af }), [0.27, -0.03, -1.35]);
      for (let plate = 0; plate < 5; plate += 1) add(visual, [0.36 - plate * 0.025, 0.2, 0.16], darkMaterial, [0, 0.52, -0.4 + plate * 0.26]);
      for (const [px, pz, phase] of [[-0.31, -0.38, 0], [0.31, -0.38, Math.PI], [-0.31, 0.42, Math.PI], [0.31, 0.42, 0]] as Array<[number, number, number]>) { const leg = pivotBox([0.18, 0.48, 0.2], bodyMaterial, [px, -0.18, pz], [0, -0.24, 0], "legs"); leg.userData.phase = phase; }
      const tail = pivotBox([0.12, 0.12, 0.48], darkMaterial, [0, 0.24, 0.72], [0, 0, 0.24], "body"); tail.rotation.x = 0.55;
    } else if (kind === "woolhorn") {
      add(visual, [1.02, 0.84, 1.05], bodyMaterial, [0, 0.12, 0.08], "body");
      add(visual, [0.58, 0.54, 0.5], accentMaterial, [0, 0.2, -0.67], "head");
      add(visual, [0.08, 0.08, 0.04], eyeMaterial, [-0.18, 0.28, -0.93]); add(visual, [0.08, 0.08, 0.04], eyeMaterial, [0.18, 0.28, -0.93]);
      for (const side of [-1, 1]) {
        add(visual, [0.18, 0.18, 0.48], darkMaterial, [side * 0.4, 0.42, -0.64]);
        add(visual, [0.22, 0.36, 0.18], darkMaterial, [side * 0.5, 0.28, -0.78]);
      }
      for (const [px, pz, phase] of [[-0.34, -0.3, 0], [0.34, -0.3, Math.PI], [-0.34, 0.34, Math.PI], [0.34, 0.34, 0]] as Array<[number, number, number]>) { const leg = pivotBox([0.16, 0.48, 0.16], accentMaterial, [px, -0.2, pz], [0, -0.24, 0], "legs"); leg.userData.phase = phase; }
    } else if (kind === "glowmoth") {
      add(visual, [0.24, 0.22, 0.42], bodyMaterial, [0, 0, -0.02], "body");
      add(visual, [0.2, 0.2, 0.22], darkMaterial, [0, 0.02, -0.31], "head");
      add(visual, [0.16, 0.16, 0.2], new THREE.MeshBasicMaterial({ color: 0xffdb59 }), [0, 0, 0.28]);
      for (const side of [-1, 1]) for (const front of [-1, 1]) {
        const wing = pivotBox([0.56, 0.045, front < 0 ? 0.42 : 0.32], new THREE.MeshLambertMaterial({ color: accentColor, transparent: true, opacity: 0.78 }), [side * 0.12, 0.05, front * 0.12], [side * 0.28, 0, front * 0.05], "wings");
        wing.userData.side = side;
        wing.userData.phase = front < 0 ? 0 : Math.PI;
      }
      for (const side of [-1, 1]) { const antenna = add(visual, [0.035, 0.035, 0.34], accentMaterial, [side * 0.08, 0.15, -0.43]); antenna.rotation.x = -0.55; antenna.rotation.z = side * 0.18; }
    } else if (kind === "shadecrawler") {
      add(visual, [0.86, 0.34, 0.9], bodyMaterial, [0, 0, 0.24], "body");
      add(visual, [0.72, 0.3, 0.62], accentMaterial, [0, 0.03, -0.48], "head");
      for (const ex of [-0.2, 0, 0.2]) add(visual, [0.075, 0.075, 0.04], eyeMaterial, [ex, 0.12, -0.81]);
      for (const side of [-1, 1]) for (let legIndex = 0; legIndex < 4; legIndex += 1) {
        const z = -0.46 + legIndex * 0.3;
        const leg = pivotBox([0.56, 0.08, 0.1], darkMaterial, [side * 0.34, -0.05, z], [side * 0.28, -0.08, 0], "legs");
        leg.rotation.z = side * -0.42;
        leg.userData.phase = (legIndex % 2) * Math.PI;
        leg.userData.side = side;
      }
    } else if (kind === "caveblob") {
      add(visual, [0.82, 0.58, 0.82], bodyMaterial, [0, -0.02, 0], "body");
      add(visual, [0.58, 0.4, 0.58], accentMaterial, [0, 0.34, -0.03], "body");
      add(visual, [0.22, 0.2, 0.22], new THREE.MeshBasicMaterial({ color: 0xb9ffd9 }), [0, 0.22, 0.03]);
      add(visual, [0.12, 0.12, 0.04], eyeMaterial, [-0.18, 0.37, -0.34]); add(visual, [0.12, 0.12, 0.04], eyeMaterial, [0.18, 0.37, -0.34]);
    } else {
      add(visual, [0.42, 0.32, 0.32], darkMaterial, [0, 0.35, 0], "body");
      for (let rib = 0; rib < 3; rib += 1) add(visual, [0.72 - rib * 0.08, 0.08, 0.16], bodyMaterial, [0, 0.62 + rib * 0.16, 0]);
      add(visual, [0.54, 0.5, 0.48], bodyMaterial, [0, 1.16, -0.04], "head");
      add(visual, [0.12, 0.12, 0.05], eyeMaterial, [-0.16, 1.25, -0.3]); add(visual, [0.12, 0.12, 0.05], eyeMaterial, [0.16, 1.25, -0.3]);
      for (const [px, phase] of [[-0.18, 0], [0.18, Math.PI]] as Array<[number, number]>) { const leg = pivotBox([0.16, 0.78, 0.18], bodyMaterial, [px, 0.32, 0], [0, -0.39, 0], "legs"); leg.userData.phase = phase; }
      for (const side of [-1, 1]) { const arm = pivotBox([0.14, 0.72, 0.14], bodyMaterial, [side * 0.42, 0.9, 0], [0, -0.36, 0], "arms"); arm.userData.side = side; arm.userData.phase = side < 0 ? 0 : Math.PI; }
      const club = add(parts.arms[1], [0.2, 0.86, 0.2], accentMaterial, [0, -0.76, -0.06]); club.rotation.z = -0.18;
    }
    group.userData.mobId = id;
    return { group, visual, parts };
  }

  spawnMob(kind: MobKind, position: THREE.Vector3) {
    const definition = MOB_DEFS[kind];
    const id = this.nextMobId++;
    const { group, visual, parts } = this.createMobVisual(kind, id);
    group.position.copy(position);
    this.creatureGroup.add(group);
    const angle = Math.random() * Math.PI * 2;
    const mob: MobEntity = { id, kind, name: definition.name, hostile: definition.hostile, definition, group, visual, parts, health: definition.health, maxHealth: definition.health, damage: definition.damage, angle, desiredAngle: angle, wanderTimer: 1 + Math.random() * 4, attackCooldown: 0, hurtTimer: 0, age: 0, bob: Math.random() * Math.PI * 2, gait: 0, fleeTimer: 0, state: "wander", stateTimer: 0, baseY: position.y };
    this.mobs.push(mob);
    return mob;
  }

  trySpawnMob() {
    const cap = this.touchMode ? 13 : 22;
    if (this.mobs.length >= cap) return;
    const passiveCap = Math.ceil(cap * 0.55);
    const passiveCount = this.mobs.reduce((count, mob) => count + (mob.hostile ? 0 : 1), 0);
    const angle = Math.random() * Math.PI * 2;
    const radius = 14 + Math.random() * 20;
    const x = Math.round(this.position.x + Math.cos(angle) * radius);
    const z = Math.round(this.position.z + Math.sin(angle) * radius);
    const underground = this.skyVisibility < 0.18;
    let y: number;
    let kind: MobKind;
    if (underground) {
      y = this.world.findWalkableY(x, z, this.position.y);
      const feet = this.world.getBlock(x, y + 1, z);
      const head = this.world.getBlock(x, y + 2, z);
      if (Math.abs(y - this.position.y) > 14 || !this.world.isWalkThrough(feet) || !this.world.isWalkThrough(head)) return;
      kind = Math.random() < 0.58 ? "caveblob" : "shadecrawler";
    } else {
      y = this.world.surfaceAt(x, z);
      if (this.world.getBlock(x, y, z) === undefined || y <= SEA_LEVEL) return;
      const daylight = this.daylightAmount();
      const hostile = daylight < 0.2 && this.spawnProtection <= 0;
      if (hostile) kind = Math.random() < 0.55 ? "shadecrawler" : "rattlekin";
      else {
        if (passiveCount >= passiveCap) return;
        const biome = this.world.biomeAt(x, z);
        kind = biome === BiomeId.Snowfield || biome === BiomeId.Frostpine ? "woolhorn"
          : biome === BiomeId.Siltfen || biome === BiomeId.Bloomwood ? "mossling"
            : biome === BiomeId.MushroomFen ? "glowmoth" : "ridgeback";
      }
    }
    this.spawnMob(kind, new THREE.Vector3(x, y + MOB_DEFS[kind].footOffset, z));
  }

  mobMoveTarget(mob: MobEntity, nx: number, nz: number) {
    const definition = mob.definition;
    const samples: Array<[number, number]> = [[0, 0], [definition.radius, definition.radius], [-definition.radius, definition.radius], [definition.radius, -definition.radius], [-definition.radius, -definition.radius]];
    let groundY = -Infinity;
    for (const [ox, oz] of samples) {
      const ground = this.world.findWalkableY(Math.round(nx + ox), Math.round(nz + oz), mob.group.position.y - definition.footOffset);
      if (Math.abs(ground + definition.footOffset - mob.group.position.y) > (mob.kind === "caveblob" ? 1.7 : 1.2)) return null;
      const feet = this.world.getBlock(Math.round(nx + ox), ground + 1, Math.round(nz + oz));
      const head = this.world.getBlock(Math.round(nx + ox), ground + Math.max(1, Math.ceil(definition.height)), Math.round(nz + oz));
      if (!this.world.isWalkThrough(feet) || !this.world.isWalkThrough(head)) return null;
      groundY = Math.max(groundY, ground);
    }
    return groundY + definition.footOffset;
  }

  animateMob(mob: MobEntity, moved: number) {
    mob.gait += moved * 9;
    mob.bob += moved * 4;
    for (const leg of mob.parts.legs) leg.rotation.x = Math.sin(mob.gait + (Number(leg.userData.phase) || 0)) * (mob.kind === "shadecrawler" ? 0.35 : 0.58);
    for (const arm of mob.parts.arms) arm.rotation.x = Math.sin(mob.gait + (Number(arm.userData.phase) || 0)) * 0.5 + (mob.state === "windup" ? -1.1 : 0);
    for (const wing of mob.parts.wings) wing.rotation.z = (Number(wing.userData.side) || 1) * (0.35 + Math.sin(performance.now() * 0.018 + (Number(wing.userData.phase) || 0)) * 0.72);
    const hurtPulse = mob.hurtTimer > 0 ? 1 + Math.sin(mob.hurtTimer * 45) * 0.06 : 1;
    if (mob.kind === "caveblob") {
      const squash = 1 + Math.sin(mob.bob * 1.8) * 0.12;
      mob.visual.scale.set(hurtPulse / Math.sqrt(squash), hurtPulse * squash, hurtPulse / Math.sqrt(squash));
    } else mob.visual.scale.setScalar(hurtPulse);
  }

  updateMobs(dt: number) {
    this.mobSpawnTimer -= dt;
    if (this.mobSpawnTimer <= 0) { this.mobSpawnTimer = 2.2 + Math.random() * 1.8; this.trySpawnMob(); }
    for (let index = this.mobs.length - 1; index >= 0; index -= 1) {
      const mob = this.mobs[index];
      mob.age += dt;
      mob.attackCooldown = Math.max(0, mob.attackCooldown - dt);
      mob.hurtTimer = Math.max(0, mob.hurtTimer - dt);
      mob.fleeTimer = Math.max(0, mob.fleeTimer - dt);
      mob.wanderTimer -= dt;
      mob.stateTimer -= dt;
      const dx = this.position.x - mob.group.position.x;
      const dz = this.position.z - mob.group.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 10 && !this.bestiary[mob.kind].seen) { this.bestiary[mob.kind].seen = true; this.saveSoon(); }
      if (distance > 68 || mob.age > 300 || (mob.hostile && this.daylightAmount() > 0.65 && mob.group.position.y > SEA_LEVEL && distance > 25)) {
        this.removeMob(index);
        continue;
      }
      const aggressive = mob.hostile || (mob.kind === "ridgeback" && mob.fleeTimer > 0);
      if (mob.state === "windup") {
        if (mob.stateTimer <= 0) {
          if (distance < mob.definition.attackRange + 0.7 && Math.abs(this.position.y - mob.group.position.y) < 2) {
            this.damagePlayer(mob.damage, mob.name);
            this.velocity.add(new THREE.Vector3(dx, 0.1, dz).normalize().multiplyScalar(mob.kind === "ridgeback" ? 4.4 : 3.2));
            this.audio.play("mob");
          }
          mob.state = "recover"; mob.stateTimer = 0.55; mob.attackCooldown = 1.15;
        }
      } else if (mob.state === "recover" && mob.stateTimer <= 0) mob.state = "wander";
      else if (aggressive && distance < 20) {
        mob.state = "chase";
        mob.desiredAngle = Math.atan2(dz, dx);
        if (distance < mob.definition.attackRange && mob.attackCooldown <= 0) { mob.state = "windup"; mob.stateTimer = mob.kind === "rattlekin" ? 0.52 : 0.34; }
      } else if (mob.fleeTimer > 0) {
        mob.state = "flee";
        mob.desiredAngle = Math.atan2(-dz, -dx);
      } else if (mob.wanderTimer <= 0) {
        mob.state = "wander";
        mob.desiredAngle += (Math.random() - 0.5) * 2.4;
        mob.wanderTimer = 2 + Math.random() * 5;
      }
      const turnDelta = Math.atan2(Math.sin(mob.desiredAngle - mob.angle), Math.cos(mob.desiredAngle - mob.angle));
      mob.angle += turnDelta * (1 - Math.exp(-mob.definition.turnRate * dt));
      let speed = mob.state === "chase" ? mob.definition.chaseSpeed : mob.state === "flee" ? mob.definition.chaseSpeed * 0.86 : mob.definition.speed;
      if (mob.state === "windup" || mob.state === "recover") speed *= 0.08;
      const beforeX = mob.group.position.x;
      const beforeZ = mob.group.position.z;
      if (mob.kind === "glowmoth") {
        mob.group.position.x += Math.cos(mob.angle) * speed * dt;
        mob.group.position.z += Math.sin(mob.angle) * speed * dt;
        mob.group.position.y = mob.baseY + Math.sin(performance.now() * 0.003 + mob.id) * 0.22;
      } else {
        const nx = mob.group.position.x + Math.cos(mob.angle) * speed * dt;
        const nz = mob.group.position.z + Math.sin(mob.angle) * speed * dt;
        const targetY = this.mobMoveTarget(mob, nx, nz);
        if (targetY !== null) {
          mob.group.position.x = nx;
          mob.group.position.z = nz;
          mob.group.position.y += (targetY - mob.group.position.y) * Math.min(1, dt * 9);
          if (mob.kind === "caveblob") mob.group.position.y += Math.max(0, Math.sin(performance.now() * 0.006 + mob.id)) * 0.1;
        } else { mob.desiredAngle += Math.PI * (0.45 + Math.random() * 0.5); mob.wanderTimer = 0.5; }
      }
      const moved = Math.hypot(mob.group.position.x - beforeX, mob.group.position.z - beforeZ);
      mob.group.rotation.y = -mob.angle - Math.PI / 2;
      this.animateMob(mob, moved);
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
    mob.fleeTimer = mob.hostile ? 0.45 : 3.2;
    mob.state = mob.hostile ? "chase" : "flee";
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
    for (const drop of mob.definition.drops) if (Math.random() <= drop.chance) this.spawnDrop(drop.item, drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1)), position);
    this.addXp(mob.definition.xp);
    this.bestiary[mob.kind].seen = true;
    this.bestiary[mob.kind].kills += 1;
    this.events.onToast(`${mob.name} defeated · Bestiary kill ${this.bestiary[mob.kind].kills}`);
    const index = this.mobs.indexOf(mob);
    if (index >= 0) this.removeMob(index);
    this.audio.play("pickup");
  }

  removeMob(index: number) {
    const mob = this.mobs[index];
    this.creatureGroup.remove(mob.group);
    this.disposeObject(mob.group);
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

  spawnDrop(item: ItemCode, count: number, position: THREE.Vector3, durability?: number): DropEntity | undefined {
    if (!ITEMS[item] || count <= 0) return;
    const resolvedDurability = durability ?? ITEMS[item]?.maxDurability;
    const nearby = this.drops.find((drop) => drop.item === item && drop.durability === resolvedDurability && drop.mesh.position.distanceToSquared(position) < 2.25 && drop.count < maxStack(item));
    if (nearby) {
      const add = Math.min(count, maxStack(item) - nearby.count);
      nearby.count += add;
      count -= add;
      if (count <= 0) return nearby;
    }
    if (this.drops.length >= 120) this.removeDrop(0);
    let material = this.dropMaterials.get(item);
    if (!material) { material = new THREE.MeshLambertMaterial({ color: ITEMS[item].color }); this.dropMaterials.set(item, material); }
    const mesh = new THREE.Mesh(this.sharedDropGeometry, material);
    mesh.position.copy(position).add(new THREE.Vector3((Math.random() - 0.5) * 0.45, 0.25, (Math.random() - 0.5) * 0.45));
    this.dropGroup.add(mesh);
    const drop: DropEntity = { id: this.nextDropId++, item, count, ...(resolvedDurability !== undefined ? { durability: resolvedDurability } : {}), mesh, velocity: new THREE.Vector3((Math.random() - 0.5) * 1.4, 2 + Math.random(), (Math.random() - 0.5) * 1.4), age: 0, pickupDelay: 0.35 };
    this.drops.push(drop);
    return drop;
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
        const leftover = this.addItem(drop.item, drop.count, drop.durability);
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

  disposeObject(root: THREE.Object3D) {
    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) material.dispose();
    });
  }

  dropSelectedItem() {
    if (this.mode === "builder") return;
    const slot = this.selectedSlot();
    if (!slot) return;
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    const drop = this.spawnDrop(slot.item, 1, this.camera.position.clone().add(direction.clone().multiplyScalar(0.8)), slot.durability);
    if (drop) drop.velocity.add(direction.multiplyScalar(3));
    slot.count -= 1;
    if (slot.count <= 0) this.inventory[this.selected] = null;
    this.saveSoon();
    this.emitHud(true);
  }

  clearEntities() {
    while (this.mobs.length) this.removeMob(this.mobs.length - 1);
    while (this.drops.length) this.removeDrop(this.drops.length - 1);
    for (const tree of this.fallingTrees) { this.disposeObject(tree.group); this.scene.remove(tree.group); }
    this.fallingTrees = [];
    for (const particle of this.particles) {
      this.scene.remove(particle.mesh);
      particle.mesh.geometry.dispose();
      (particle.mesh.material as THREE.Material).dispose();
    }
    this.particles = [];
  }

  updateLocalLights(dt: number) {
    this.lightRefreshTimer -= dt;
    if (this.lightRefreshTimer <= 0) {
      this.lightRefreshTimer = 0.2;
      this.skyVisibilityTarget = this.world.skyVisibilityAt(this.camera.position.x, this.camera.position.y, this.camera.position.z);
      const sources = this.world.lightSourcesNear(this.camera.position.x, this.camera.position.y, this.camera.position.z, 20);
      for (let index = 0; index < this.placedLightPool.length; index += 1) {
        const light = this.placedLightPool[index];
        const source = sources[index];
        if (!source) { light.intensity = 0; light.userData.baseIntensity = 0; continue; }
        const crystal = source.type === BlockId.CrystalBlock;
        light.color.set(crystal ? 0x69e8ef : source.type === BlockId.Glowstone ? 0xffd66b : 0xffb45e);
        light.position.set(source.x, source.y + (source.type === BlockId.Torch ? 0.35 : 0), source.z);
        light.distance = source.type === BlockId.Torch ? 13 : 15;
        light.userData.baseIntensity = source.type === BlockId.Torch ? 1.75 : crystal ? 1.05 : 1.45;
        light.userData.phase = source.x * 0.73 + source.y * 0.37 + source.z * 0.19;
      }
    }
    this.skyVisibility += (this.skyVisibilityTarget - this.skyVisibility) * (1 - Math.exp(-dt * 5));
    const now = performance.now() * 0.004;
    for (const light of this.placedLightPool) {
      const base = Number(light.userData.baseIntensity) || 0;
      light.intensity = base * (1 + Math.sin(now + (Number(light.userData.phase) || 0)) * 0.045);
    }
    const selected = this.selectedSlot();
    const heldTorch = selected?.item === BlockId.Torch;
    const heldGlow = selected?.item === BlockId.Glowstone || selected?.item === BlockId.CrystalBlock;
    const offset = new THREE.Vector3(0.34, -0.24, -0.62).applyQuaternion(this.camera.quaternion);
    this.caveLight.position.copy(this.camera.position).add(offset);
    this.caveLight.color.set(selected?.item === BlockId.CrystalBlock ? 0x69e8ef : 0xffb45e);
    this.caveLight.intensity = heldTorch ? 3.35 : heldGlow ? 2.55 : 0;
    this.caveLight.distance = heldTorch ? 24 : 20;
  }

  daylightAmount() {
    const angle = this.worldTime * Math.PI * 2 - Math.PI / 2;
    return clamp((Math.sin(angle) + 0.15) / 0.42, 0, 1);
  }

  updateDayNight(dt: number) {
    if (this.running && !this.titleMode && !this.paused) {
      this.worldTime += dt / 420;
      if (this.worldTime >= 1) { this.worldTime -= 1; this.day += 1; }
    }
    const angle = this.worldTime * Math.PI * 2 - Math.PI / 2;
    const sunHeight = Math.sin(angle);
    const daylight = this.daylightAmount();
    const moonlight = (1 - daylight) * clamp((-sunHeight + 0.05) / 0.7, 0, 1);
    const twilight = Math.pow(1 - Math.min(1, Math.abs(sunHeight)), 5) * (sunHeight > -0.38 ? 1 : 0);
    const night = new THREE.Color("#020611");
    const day = new THREE.Color("#78b9ed");
    const dawn = new THREE.Color(sunHeight >= 0 ? "#f1a46f" : "#c36b68");
    const sky = night.clone().lerp(day, daylight).lerp(dawn, twilight * 0.52);
    const headBlock = this.world.getBlock(Math.floor(this.camera.position.x + 0.5), Math.floor(this.camera.position.y + 0.5), Math.floor(this.camera.position.z + 0.5));
    const underwater = headBlock === BlockId.Water;
    const underground = this.skyVisibility < 0.18 && !underwater;
    if (underwater) sky.set("#1d5d82");
    this.scene.background = sky;
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(sky);
      const view = this.settings.renderDistance * 16;
      this.scene.fog.near = underwater ? 3 : underground ? 10 : view * 0.54;
      this.scene.fog.far = underwater ? 24 : underground ? Math.max(30, view * 0.7) : view * 1.05;
    }
    const skyLight = underwater ? 0.04 : this.skyVisibility;
    this.hemisphere.intensity = 0.012 + skyLight * (0.03 + daylight * 0.72 + moonlight * 0.05);
    this.directional.intensity = skyLight * (daylight * 1.08 + moonlight * 0.055);
    this.directional.color.set(twilight > 0.22 ? 0xffae7a : daylight > 0.2 ? 0xfff1ce : 0x8da5cf);
    const celestialDistance = 82;
    const celestialDirection = new THREE.Vector3(Math.cos(angle), Math.sin(angle), -0.24).normalize();
    this.sun.position.copy(this.camera.position).addScaledVector(celestialDirection, celestialDistance);
    this.moon.position.copy(this.camera.position).addScaledVector(celestialDirection, -celestialDistance);
    this.sun.lookAt(this.camera.position);
    this.moon.lookAt(this.camera.position);
    this.sun.visible = !underground && sunHeight > -0.18;
    this.moon.visible = !underground && sunHeight < 0.22;
    (this.stars.material as THREE.PointsMaterial).opacity = underground ? 0 : clamp((1 - daylight) * 1.05, 0, 0.95);
    this.stars.position.copy(this.camera.position);
    this.directional.target.position.copy(this.camera.position);
    this.directional.position.copy(this.camera.position).addScaledVector(celestialDirection, 55);
    this.audio.setDepth(this.position.y, this.weather === "rain");
    const biome = this.world.biomeAt(Math.round(this.position.x), Math.round(this.position.z));
    const atSea = underwater || biome === BiomeId.Ocean || biome === BiomeId.DeepOcean || biome === BiomeId.Beach;
    this.audio.setMusicScene(atSea ? "sea" : daylight < 0.24 ? "night" : "day");
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

  updateHeldItem(dt: number) {
    const slot = this.selectedSlot();
    const item = slot?.item ?? -1;
    if (item !== this.heldItemCode) {
      for (const child of [...this.heldRoot.children]) {
        this.disposeObject(child);
        this.heldRoot.remove(child);
      }
      this.heldItemCode = item;
      const definition = ITEMS[item];
      if (definition) {
        const material = (color: string | number, emissive = false) => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: emissive ? 1 : 0.96, depthTest: false, depthWrite: false });
        const addBox = (size: [number, number, number], position: [number, number, number], color: string | number, rotation: [number, number, number] = [0, 0, 0], emissive = false) => {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color, emissive));
          mesh.position.set(...position);
          mesh.rotation.set(...rotation);
          mesh.renderOrder = 20;
          this.heldRoot.add(mesh);
        };
        if (item === BlockId.Torch) {
          addBox([0.08, 0.48, 0.08], [0, 0, 0], 0x8d542b, [0, 0, -0.12]);
          addBox([0.14, 0.14, 0.14], [-0.03, 0.27, 0], 0xffbe45, [0, 0, 0], true);
          addBox([0.07, 0.08, 0.07], [-0.04, 0.37, 0], 0xffef93, [0, 0, 0], true);
        } else if (definition.toolKind) {
          addBox([0.08, 0.62, 0.08], [0, -0.02, 0], 0x8d5e34, [0, 0, -0.55]);
          if (definition.toolKind === "sword") {
            addBox([0.12, 0.58, 0.05], [-0.17, 0.34, 0], definition.color, [0, 0, -0.55]);
            addBox([0.32, 0.06, 0.08], [-0.08, 0.08, 0], 0x6b4c2e, [0, 0, -0.55]);
          } else if (definition.toolKind === "pickaxe") addBox([0.58, 0.1, 0.12], [-0.08, 0.22, 0], definition.color, [0, 0, -0.22]);
          else if (definition.toolKind === "axe") addBox([0.34, 0.3, 0.1], [-0.18, 0.24, 0], definition.color, [0, 0, -0.22]);
          else addBox([0.22, 0.3, 0.08], [-0.16, 0.25, 0], definition.color, [0, 0, -0.55]);
        } else if (definition.placeBlock !== undefined) {
          addBox([0.34, 0.34, 0.34], [0, 0.02, 0], definition.color, [0.18, 0.24, 0]);
        } else addBox([0.26, 0.34, 0.18], [0, 0.02, 0], definition.color, [0.12, 0.2, -0.08]);
      }
    }
    this.heldUse = Math.max(0, this.heldUse - dt * 4.5);
    const activeSwing = this.mineHeld || this.attackCooldown > 0 ? 1 : 0;
    this.heldSwing += (activeSwing - this.heldSwing) * (1 - Math.exp(-dt * 14));
    const walk = this.grounded ? this.footstepDistance * 3.6 : 0;
    this.heldRoot.position.set(0.48 + Math.sin(walk) * 0.018, -0.43 + Math.abs(Math.cos(walk)) * 0.018 - this.heldUse * 0.1, -0.78 + this.heldUse * 0.08);
    this.heldRoot.rotation.set(-0.18 - this.heldSwing * 0.62, -0.32, -0.08 - this.heldSwing * 0.48);
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

    this.updateLocalLights(dt);
    this.updateDayNight(dt);
    this.updateChestModel(dt);
    this.updateHeldItem(dt);
    if (this.running && !this.titleMode && !this.paused) {
      this.updateMobs(dt);
      this.updateDrops(dt);
      this.updateFurnaces(dt);
      this.updateSaplings(dt);
      this.updateFallingTrees(dt);
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
    if (this.position.y > 0) return "Stoneways";
    if (this.position.y > -28) return "Deepstone Caves";
    if (this.position.y > -52) return "Crystal Deeps";
    return "Worldheart";
  }

  emitHud(force = false, now = performance.now()) {
    if (!force && now - this.lastHudTime < 140) return;
    this.lastHudTime = now;
    this.updateCraftResult();
    const totalMinutes = Math.floor((this.worldTime % 1) * 24 * 60);
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
      equipment: Object.fromEntries((Object.keys(this.equipment) as EquipmentSlot[]).map((slot) => [slot, cloneSlot(this.equipment[slot])])) as Record<EquipmentSlot, InventorySlot | null>,
      bestiary: Object.fromEntries(MOB_ORDER.map((kind) => [kind, { ...this.bestiary[kind] }])) as BestiaryProgress,
      armor: this.armorPoints(),
      cursor: cloneSlot(this.cursor),
      craftGrid: this.craftGrid.map(cloneSlot),
      craftOutput: this.activeRecipe ? cloneSlot(this.activeRecipe.output) : null,
      craftingSize: this.craftingSize,
      activeFurnace: this.activeFurnaceKey ? { ...(this.furnaces.get(this.activeFurnaceKey) ?? blankFurnace()), input: cloneSlot(this.furnaces.get(this.activeFurnaceKey)?.input ?? null), fuel: cloneSlot(this.furnaces.get(this.activeFurnaceKey)?.fuel ?? null), output: cloneSlot(this.furnaces.get(this.activeFurnaceKey)?.output ?? null) } : null,
      activeChest: this.activeChestKey ? (this.chests.get(this.activeChestKey) ?? []).map(cloneSlot) : null,
      activeChestTitle: this.activeChestTitle,
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

  createCelestialTexture(kind: "sun" | "moon") {
    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const context = canvas.getContext("2d")!;
    context.imageSmoothingEnabled = false;
    if (kind === "sun") {
      context.fillStyle = "rgba(255,205,91,.18)";
      context.fillRect(5, 5, 22, 22);
      context.fillStyle = "#f7c957";
      context.fillRect(8, 8, 16, 16);
      context.fillStyle = "#fff0a1";
      context.fillRect(10, 10, 12, 12);
      context.fillStyle = "#fff8ca";
      context.fillRect(12, 11, 7, 6);
    } else {
      context.fillStyle = "rgba(164,194,231,.12)";
      context.fillRect(5, 5, 22, 22);
      context.fillStyle = "#d9e5ef";
      context.fillRect(8, 7, 16, 18);
      context.clearRect(8, 7, 2, 2); context.clearRect(22, 7, 2, 2); context.clearRect(8, 23, 2, 2); context.clearRect(22, 23, 2, 2);
      context.fillStyle = "#aabbd0";
      context.fillRect(11, 11, 4, 3); context.fillRect(18, 9, 3, 4); context.fillRect(17, 18, 5, 3); context.fillRect(10, 20, 3, 2);
      context.fillStyle = "#edf4f6";
      context.fillRect(15, 10, 2, 2); context.fillRect(12, 16, 3, 3);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.magFilter = THREE.NearestFilter;
    texture.minFilter = THREE.NearestFilter;
    texture.generateMipmaps = false;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
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
      equipment: Object.fromEntries((Object.keys(this.equipment) as EquipmentSlot[]).map((slot) => [slot, cloneSlot(this.equipment[slot])])),
      bestiary: Object.fromEntries(MOB_ORDER.map((kind) => [kind, { ...this.bestiary[kind] }])),
      saplings: Object.fromEntries(this.saplings.entries()),
      cursor: cloneSlot(this.cursor),
      craftGrid: this.craftGrid.map(cloneSlot),
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
      drops: this.drops.map((drop) => ({ item: drop.item, count: drop.count, ...(drop.durability !== undefined ? { durability: drop.durability } : {}), x: drop.mesh.position.x, y: drop.mesh.position.y, z: drop.mesh.position.z, age: drop.age })),
      savedAt: Date.now(),
    };
  }

  saveNow(notify = true) {
    if (!this.persistent) return;
    window.clearTimeout(this.saveTimer);
    if (this.fallingTrees.length) this.settleAllFallingTrees();
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
