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
  isBedBlock,
  isTorchBlock,
  itemName,
  maxStack,
  recipePatterns,
  type GameMode,
  type EquipmentSlot,
  type InventorySlot,
  type ItemCode,
  type Recipe,
  type Weather,
} from "./data";
import {
  BIOME_NAMES,
  CHUNK_SIZE,
  GENERATOR_VERSION,
  MAX_Y,
  MIN_Y,
  SEA_LEVEL,
  BiomeId,
  ChunkWorld,
  type ChunkEditSave,
} from "./world";
import { BUTTERFLY_ORDER, MOB_DEFS, MOB_ORDER, type ButterflyKind, type MobDefinition, type MobKind } from "./mobs";
import { createHeldToolSpec } from "./model-specs";
import { createMobVisual } from "./mob-models";
import { ButterflySystem } from "./butterflies";
import {
  createBirdBehavior,
  createStableSteering,
  fishKindsForHabitat,
  shouldKeepCreatureLoaded,
  updateBirdBehavior,
  updateStableSteering,
  type BirdBehaviorState,
  type StableSteeringState,
} from "./fauna";
import {
  breedPeelops,
  commandPeelop,
  createPeelopState,
  feedPeelop,
  renamePeelop,
  tickPeelop,
  tryTamePeelop,
  type PeelopCommand,
  type PeelopFood,
  type PeelopState,
} from "./peelop";
import {
  captureCreature,
  decodeCapturedCreature,
  encodeCapturedCreature,
  releaseCreature,
  type CreatureMetadata,
} from "./creature-cage";
import {
  buildExhibitTopology,
  sampleExhibitButterflyPose,
  type ExhibitButterfly,
  type ExhibitTopology,
} from "./butterfly-exhibit";
import {
  boardSailboat,
  createSailboatVisual,
  disposeSailboatVisual,
  integrateSailboat,
  leaveSailboat,
  normalizeSailboatSave,
  sailboatSeatOffset,
  type SailboatSave,
} from "./boats";
import {
  createArrowProjectile,
  disposeArrowVisual,
  stepArrowProjectile,
  type ArrowProjectile,
} from "./projectiles";
import { GAME_VERSION } from "./version";
import {
  LiquidSimulator,
  DEFAULT_SWIM_RULES,
  stepSwimming,
  type LiquidCell,
} from "./liquids";
import {
  DEFAULT_RENDER_DISTANCE,
  DEFAULT_SIMULATION_DISTANCE,
  normalizeViewDistances,
  PerformanceSampler,
  AdaptiveBudgetController,
} from "./performance";
import {
  createWeatherState,
  planCloudField,
  stepWeather,
  weatherBiomeFromId,
  weatherVisuals,
  type WeatherBiome,
  type WeatherState,
} from "./weather";
import { type ChestMarker, type SpawnMarker } from "./structures";
import {
  BlockPlayerModel,
  updateThirdPersonCamera,
  type PlayerAction,
  type PlayerLocomotion,
  type PlayerVariant,
  type PlayerEquipmentAppearance,
} from "./player-model";
import {
  MultiplayerSession,
  createPeerIdentity,
  detectMultiplayerSupport,
  type BlockAction,
  type MultiplayerEvent,
  type MultiplayerSessionState,
  type PeerInfo,
  type PlayerPose,
  type WorldSnapshot,
  type SleepTarget,
  type SleepVote,
} from "./multiplayer";
import {
  DEFAULT_WORLD_OPTIONS,
  WorldStorage,
  generationOptionsFromWorldOptions,
  normalizeWorldOptions,
  requiredSleepers,
  type WorldMetadata,
  type WorldOptions,
} from "./world-storage";

export { BLOCKS, CREATIVE_BLOCKS, ITEMS, Item, RECIPES, BlockId, BIOME_NAMES, MOB_DEFS, MOB_ORDER, WorldStorage, DEFAULT_WORLD_OPTIONS, type WorldOptions, type WorldMetadata, type GameMode, type InventorySlot, type ItemCode, type Recipe, type EquipmentSlot, type MobKind, type SleepTarget, type PlayerVariant };

export const SAVE_KEY = "blockwild-world-v2";
export const SETTINGS_KEY = "blockwild-settings-v2";
const LEGACY_GENERATOR_MIN_Y = -32;

export type GameSettings = {
  volume: number;
  muted: boolean;
  sensitivity: number;
  fov: number;
  weather: Weather;
  renderDistance: number;
  simulationDistance: number;
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
export type BestiaryProgress = Record<MobKind, { seen: boolean; kills: number; captures: number }>;
export type RecipePlanResult =
  | { ok: true; recipeId: string; message: string }
  | { ok: false; recipeId: string; reason: "unknown" | "needs-table" | "missing" | "inventory-full"; message: string; missing?: string[] };

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
  cameraMode: CameraMode;
  crouching: boolean;
  sprinting: boolean;
  onlinePlayers: number;
  playerVariant: PlayerVariant;
  oxygen: number;
  maxOxygen: number;
  submerged: boolean;
  averageFps: number;
  simulationDistance: number;
  weatherKind: string;
  activePet: { id: number; name: string; command: PeelopCommand; health: number; maxHealth: number; baby: boolean; tamed: boolean } | null;
  mountedBoat: boolean;
};

export type SavedCreature = {
  id: number;
  kind: MobKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  health: number;
  age: number;
  persistentPoiResident?: boolean;
  poiMarkerId?: string;
  enclosed?: boolean;
  petState?: PeelopState;
};

export type WorldSave = {
  version: 2;
  generatorVersion: number;
  lastSavedGameVersion?: string;
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
  drops?: Array<{ item: ItemCode; count: number; durability?: number; metadata?: Record<string, unknown>; x: number; y: number; z: number; age: number }>;
  options?: Partial<WorldOptions>;
  playerVariant?: PlayerVariant;
  liquidLevels?: Array<[string, LiquidCell]>;
  weatherState?: WeatherState;
  creatures?: SavedCreature[];
  activatedStructureMarkers?: string[];
  boats?: SailboatSave[];
  savedAt: number;
};

export type OverlayKind = "inventory" | "crafting" | "furnace" | "chest" | "bestiary" | "multiplayer" | "sleep" | "pet";
export type CameraMode = "first" | "third-rear" | "third-front";

export type MultiplayerUiState = {
  supported: boolean;
  reasons: string[];
  status: MultiplayerSessionState;
  role: "host" | "guest" | null;
  peers: PeerInfo[];
  inviteCode: string;
  answerCode: string;
  error: string;
};

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
  steering: StableSteeringState;
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
  voiceTimer: number;
  birdState: BirdBehaviorState | null;
  petState: PeelopState | null;
  persistentPoiResident: boolean;
  poiMarkerId: string | null;
  enclosed: boolean;
  enclosureTimer: number;
};

type SailboatEntity = {
  save: SailboatSave;
  group: THREE.Group;
};

type ExhibitVisual = {
  group: THREE.Group;
  topologySignature: string;
  specimenSignature: string;
};

type SpawnMobOptions = {
  id?: number;
  health?: number;
  age?: number;
  yaw?: number;
  persistentPoiResident?: boolean;
  poiMarkerId?: string | null;
  enclosed?: boolean;
  petState?: PeelopState | null;
};

type MobFragment = {
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshLambertMaterial>;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  baseScale: THREE.Vector3;
  baseColor: THREE.Color;
};

type MobRemains = {
  age: number;
  fragments: MobFragment[];
};

type RemotePlayer = {
  model: BlockPlayerModel;
  pose: PlayerPose;
  target: PlayerPose;
  lastUpdate: number;
};

type KeyboardLockApi = {
  lock: (keys?: string[]) => Promise<void>;
  unlock: () => void;
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
  metadata?: Record<string, unknown>;
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

export type EnvironmentLightSource = {
  x: number;
  y: number;
  z: number;
  type: BlockId;
  distanceSquared: number;
};

type EnvironmentLightCandidate = EnvironmentLightSource & {
  priority: number;
  selected: boolean;
  assigned: boolean;
};

const compareEnvironmentLightCandidates = (a: EnvironmentLightCandidate, b: EnvironmentLightCandidate) => a.priority - b.priority;

const PLAYER_HEIGHT = 1.8;
const CROUCH_HEIGHT = 1.48;
const PLAYER_RADIUS = 0.3;
const PHYSICS_STEP = 1 / 60;
const INVENTORY_SIZE = 36;
const CRAFT_POSITIONS_2 = [0, 1, 3, 4];
const MAIN_THEN_HOTBAR = [...Array.from({ length: 27 }, (_, index) => index + 9), ...Array.from({ length: 9 }, (_, index) => index)];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function environmentLightDistance(type: BlockId) {
  return isTorchBlock(type) ? 13 : 15;
}

function isEnvironmentLightBlock(type: BlockId) {
  return isTorchBlock(type) || type === BlockId.Glowstone || type === BlockId.CrystalBlock || type === BlockId.RuneStone;
}

function setEnvironmentLightPosition(target: THREE.Vector3, source: Pick<EnvironmentLightSource, "x" | "y" | "z" | "type">) {
  target.set(source.x, source.y, source.z);
  if (!isTorchBlock(source.type)) return target;
  target.y += 0.35;
  if (source.type === BlockId.TorchWallNorth) target.z -= 0.2;
  else if (source.type === BlockId.TorchWallSouth) target.z += 0.2;
  else if (source.type === BlockId.TorchWallEast) target.x += 0.2;
  else if (source.type === BlockId.TorchWallWest) target.x -= 0.2;
  return target;
}

export function torchBlockForPlacement(target: Pick<VoxelHit, "x" | "y" | "z" | "placeX" | "placeY" | "placeZ">, replacingTarget = false) {
  if (replacingTarget || target.placeY > target.y) return BlockId.Torch;
  if (target.placeY < target.y) return null;
  if (target.placeX > target.x) return BlockId.TorchWallEast;
  if (target.placeX < target.x) return BlockId.TorchWallWest;
  if (target.placeZ > target.z) return BlockId.TorchWallSouth;
  if (target.placeZ < target.z) return BlockId.TorchWallNorth;
  return BlockId.Torch;
}

export type BedPlacement = { foot: BlockId; head: BlockId; dx: number; dz: number };

export function bedPlacementForYaw(yaw: number): BedPlacement {
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  if (Math.abs(forwardX) > Math.abs(forwardZ)) {
    return forwardX >= 0
      ? { foot: BlockId.BedEastFoot, head: BlockId.BedEastHead, dx: 1, dz: 0 }
      : { foot: BlockId.BedWestFoot, head: BlockId.BedWestHead, dx: -1, dz: 0 };
  }
  return forwardZ >= 0
    ? { foot: BlockId.BedSouthFoot, head: BlockId.BedSouthHead, dx: 0, dz: 1 }
    : { foot: BlockId.BedNorthFoot, head: BlockId.BedNorthHead, dx: 0, dz: -1 };
}

export function bedCounterpart(type: BlockId, x: number, y: number, z: number) {
  switch (type) {
    case BlockId.BedNorthFoot: return { x, y, z: z - 1, type: BlockId.BedNorthHead };
    case BlockId.BedNorthHead: return { x, y, z: z + 1, type: BlockId.BedNorthFoot };
    case BlockId.BedSouthFoot: return { x, y, z: z + 1, type: BlockId.BedSouthHead };
    case BlockId.BedSouthHead: return { x, y, z: z - 1, type: BlockId.BedSouthFoot };
    case BlockId.BedEastFoot: return { x: x + 1, y, z, type: BlockId.BedEastHead };
    case BlockId.BedEastHead: return { x: x - 1, y, z, type: BlockId.BedEastFoot };
    case BlockId.BedWestFoot: return { x: x - 1, y, z, type: BlockId.BedWestHead };
    case BlockId.BedWestHead: return { x: x + 1, y, z, type: BlockId.BedWestFoot };
    default: return null;
  }
}

export function nextSleepTransition(worldTime: number, day: number, target: SleepTarget) {
  const targetTime = target === "morning" ? 0.27 : 0.77;
  const normalized = ((Number(worldTime) || 0) % 1 + 1) % 1;
  const nextDay = day + (normalized + 0.0001 >= targetTime ? 1 : 0);
  return { worldTime: targetTime, day: Math.max(1, Math.floor(nextDay)) };
}

/**
 * Scores the part of a world-space light volume that can illuminate the view.
 * This intentionally measures distance from the view ray rather than distance
 * from the player, so a farther lamp lighting terrain ahead outranks an
 * irrelevant lamp beside or behind the camera. The frustum intersection is
 * handled separately by the engine with the source's full influence sphere.
 */
export function environmentLightPriority(
  source: Pick<EnvironmentLightSource, "x" | "y" | "z" | "type">,
  cameraPosition: Pick<THREE.Vector3, "x" | "y" | "z">,
  cameraForward: Pick<THREE.Vector3, "x" | "y" | "z">,
  previouslyAssigned = false,
) {
  const dx = source.x - cameraPosition.x;
  const dy = source.y - cameraPosition.y;
  const dz = source.z - cameraPosition.z;
  const forwardDistance = dx * cameraForward.x + dy * cameraForward.y + dz * cameraForward.z;
  const distanceSquared = dx * dx + dy * dy + dz * dz;
  const radialDistance = Math.sqrt(Math.max(0, distanceSquared - forwardDistance * forwardDistance));
  const radius = environmentLightDistance(source.type);
  const radialGap = Math.max(0, radialDistance - radius * 0.72);
  const behindGap = Math.max(0, -forwardDistance - radius);
  const depthTieBreak = Math.max(0, forwardDistance - radius) * 0.018;
  const sourceBias = source.type === BlockId.CrystalBlock ? -1.25 : source.type === BlockId.Glowstone ? -0.7 : 0;
  return radialGap * radialGap * 1.35 + behindGap * behindGap * 4 + depthTieBreak + sourceBias - (previouslyAssigned ? 9 : 0);
}

/** Bounded dynamic-resolution governor; chunk distance and simulation stay intact. */
export function nextAdaptivePixelRatio(current: number, nativeMaximum: number, averageFrameMs: number, touchMode: boolean) {
  const minimum = Math.min(nativeMaximum, touchMode ? 0.72 : 0.82);
  const resolved = averageFrameMs > 22.5
    ? clamp(current - 0.1, minimum, nativeMaximum)
    : averageFrameMs < 15.2
      ? clamp(current + 0.05, minimum, nativeMaximum)
      : clamp(current, minimum, nativeMaximum);
  return Math.round(resolved * 100) / 100;
}

export function isDoubleForwardTap(previousTap: number, currentTap: number, windowMilliseconds = 310) {
  const elapsed = currentTap - previousTap;
  return Number.isFinite(elapsed) && elapsed >= 45 && elapsed <= windowMilliseconds;
}

function blockKey(x: number, y: number, z: number) {
  return `${x},${y},${z}`;
}

const STRUCTURE_LOOT_ITEMS: Readonly<Record<string, ItemCode>> = Object.freeze({
  "gold-ingot": Item.GoldIngot,
  "sunmetal-ingot": Item.SunmetalIngot,
  "crystal-shard": Item.CrystalShard,
  "bone-shard": Item.BoneShard,
  "glow-dust": Item.GlowDust,
  bread: Item.Bread,
  apple: Item.Apple,
  fiber: Item.Fiber,
  "wildwood-planks": BlockId.Planks,
  wheat: Item.Wheat,
  "red-flower": BlockId.RedFlower,
  "blue-flower": BlockId.BlueFlower,
  "butterfly-net": Item.ButterflyNet,
  "sunward-compass": Item.SunwardCompass,
});

export function readSavedWorld(): WorldSave | null {
  if (typeof window === "undefined") return null;
  try {
    const storage = new WorldStorage(window.localStorage);
    const id = storage.activeWorldId;
    if (id) {
      const loaded = storage.loadWorld(id, false);
      if (loaded.ok) return { ...loaded.value.save, options: loaded.value.options };
    }
    const raw = window.localStorage.getItem(SAVE_KEY);
    return raw ? migrateSavedWorld(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export function migrateSavedWorld(value: unknown): WorldSave | null {
  if (!value || typeof value !== "object") return null;
  const parsed = value as WorldSave;
  if (parsed.version !== 2 || typeof parsed.seed !== "string") return null;
  if (parsed.generatorVersion === GENERATOR_VERSION) return parsed;
  if (parsed.generatorVersion !== 2) return null;
  const indexOffset = (LEGACY_GENERATOR_MIN_Y - MIN_Y) * 16 * 16;
  const edits: ChunkEditSave = {};
  for (const [key, entries] of Object.entries(parsed.edits ?? {})) {
    if (!Array.isArray(entries)) continue;
    edits[key] = entries
      .filter((entry): entry is [number, number] => Array.isArray(entry) && Number.isFinite(entry[0]) && Number.isFinite(entry[1]))
      .map(([index, type]) => [Math.trunc(index) + indexOffset, Math.trunc(type)]);
  }
  return { ...parsed, generatorVersion: GENERATOR_VERSION, edits };
}

export function restoreChestStorage(saved: Record<string, ChestState> = {}) {
  return new Map(Object.entries(saved).map(([key, value]) => {
    const size = key.startsWith("exhibit:")
      ? clamp(value.length || 1, 1, 20)
      : key.startsWith("boat:")
        ? 18
        : key.includes("|") ? 54 : 27;
    return [key, Array.from({ length: size }, (_, index) => cloneSlot(value[index] ?? null))] as const;
  }));
}

export function clearSavedWorld() {
  if (typeof window === "undefined") return;
  try {
    const storage = new WorldStorage(window.localStorage);
    if (storage.activeWorldId) storage.deleteWorld(storage.activeWorldId);
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be unavailable in private browsing.
  }
}

export function readSettings(): GameSettings {
  const mobile = typeof window !== "undefined" && (window.matchMedia?.("(pointer: coarse)").matches ?? false);
  const fallbackDistances = normalizeViewDistances({
    renderDistance: mobile ? 6 : DEFAULT_RENDER_DISTANCE,
    simulationDistance: mobile ? 4 : DEFAULT_SIMULATION_DISTANCE,
  });
  const fallback: GameSettings = { volume: 0.55, muted: false, sensitivity: 0.0022, fov: 72, weather: "clear", ...fallbackDistances };
  if (typeof window === "undefined") return fallback;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(SETTINGS_KEY) ?? "null") as Partial<GameSettings> | null;
    if (!parsed) return fallback;
    const distances = normalizeViewDistances({
      renderDistance: Number(parsed.renderDistance ?? fallback.renderDistance),
      simulationDistance: Number(parsed.simulationDistance ?? fallback.simulationDistance),
    });
    return {
      volume: clamp(Number(parsed.volume ?? fallback.volume), 0, 1),
      muted: Boolean(parsed.muted ?? fallback.muted),
      sensitivity: clamp(Number(parsed.sensitivity ?? fallback.sensitivity), 0.0008, 0.005),
      fov: clamp(Number(parsed.fov ?? fallback.fov), 55, 100),
      weather: parsed.weather === "rain" ? "rain" : "clear",
      ...distances,
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
  return Object.fromEntries(MOB_ORDER.map((kind) => [kind, { seen: false, kills: 0, captures: 0 }])) as BestiaryProgress;
}

export class VoxelEngine {
  canvas: HTMLCanvasElement;
  events: EngineEvents;
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  world = new ChunkWorld();
  butterflies: ButterflySystem;
  ambienceGroup = new THREE.Group();
  creatureGroup = new THREE.Group();
  dropGroup = new THREE.Group();
  boatGroup = new THREE.Group();
  exhibitGroup = new THREE.Group();
  projectileGroup = new THREE.Group();
  selection: THREE.LineSegments;
  sun: THREE.Mesh;
  moon: THREE.Mesh;
  stars: THREE.Points;
  rain: THREE.LineSegments;
  directional: THREE.DirectionalLight;
  hemisphere: THREE.HemisphereLight;
  caveLight: THREE.PointLight;
  placedLightPool: THREE.PointLight[] = [];
  environmentLightCandidates: EnvironmentLightCandidate[] = [];
  environmentLightCandidateCache: EnvironmentLightCandidate[] = [];
  environmentLightSelection: EnvironmentLightCandidate[] = [];
  lightFrustum = new THREE.Frustum();
  lightViewProjection = new THREE.Matrix4();
  lightInfluenceSphere = new THREE.Sphere();
  lightForward = new THREE.Vector3(0, 0, -1);
  lightSourcePosition = new THREE.Vector3();
  heldLightOffset = new THREE.Vector3(0.34, -0.24, -0.62);
  heldLightWorldOffset = new THREE.Vector3();
  lightRefreshTimer = 0;
  skyVisibility = 1;
  skyVisibilityTarget = 1;
  skyColor = new THREE.Color();
  daylightSkyColor = new THREE.Color("#78b9ed");
  nightSkyColor = new THREE.Color("#020611");
  dawnSkyColor = new THREE.Color();
  weatherSkyColor = new THREE.Color();
  celestialDirection = new THREE.Vector3();
  audio: SynthAudio;
  settings: GameSettings;
  resizeObserver: ResizeObserver | null = null;
  keyboardEscapeLocked = false;
  nativePixelRatio = 1;
  renderPixelRatio = 1;
  averageFrameMs = 16.7;
  performanceSampleTime = 0;

  position = new THREE.Vector3(0, 48, 0);
  spawn = new THREE.Vector3(0, 48, 0);
  velocity = new THREE.Vector3();
  worldStorage = new WorldStorage();
  activeWorldId: string | null = null;
  worldOptions: WorldOptions = normalizeWorldOptions();
  worldSessionStartedAt = Date.now();
  liquidCells = new Map<string, LiquidCell>();
  liquidSimulator: LiquidSimulator;
  liquidTickAccumulator = 0;
  oxygenSeconds = DEFAULT_SWIM_RULES.maxOxygenSeconds;
  drowningAccumulator = 0;
  headSubmerged = false;
  lastForwardTap = -Infinity;
  sprintLatched = false;
  performanceSampler = new PerformanceSampler(240);
  budgetController = new AdaptiveBudgetController();
  performanceReportTimer = 0;
  averageFps = 60;
  yaw = 0;
  pitch = 0;
  grounded = false;
  crouching = false;
  sprinting = false;
  butterflyDensity = 1;
  cameraMode: CameraMode = "first";
  cameraEyeHeight = 1.62;
  localPlayerModel = new BlockPlayerModel({ playerId: "local", playerName: "Player", mode: "local" });
  playerVariant: PlayerVariant = "male";
  remotePlayers = new Map<string, RemotePlayer>();
  localAvatarHeld: THREE.Object3D | null = null;
  localAvatarHeldCode: ItemCode = -1;
  remoteAvatarHeldCodes = new Map<string, ItemCode>();
  localEquipmentSignature = "";
  cameraCollisionOrigin = new THREE.Vector3();
  cameraCollisionDirection = new THREE.Vector3();
  collisionCandidate = new THREE.Vector3();
  collisionSupport = new THREE.Vector3();
  groundProbe = new THREE.Vector3();
  worldUp = new THREE.Vector3(0, 1, 0);
  smallEntityPositions: THREE.Vector3[] = [];
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
  weatherState: WeatherState = createWeatherState({ seed: "WILDERNESS", biome: "meadow" });
  weatherBiome: WeatherBiome = "meadow";
  weatherBiomeCandidate: WeatherBiome = "meadow";
  weatherBiomeHold = 0;
  cloudMesh: THREE.InstancedMesh | null = null;
  cloudCellX = Number.NaN;
  cloudCellZ = Number.NaN;
  cloudWeatherCycle = -1;
  cloudMatrixObject = new THREE.Object3D();
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
  targetBoat: SailboatEntity | null = null;
  activePet: MobEntity | null = null;
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
  boats = new Map<string, SailboatEntity>();
  mountedBoatId: string | null = null;
  nextBoatId = 1;
  boatRaycaster = new THREE.Raycaster();
  exhibitVisuals = new Map<string, ExhibitVisual>();
  exhibitVisualTimer = 0;
  projectiles: ArrowProjectile[] = [];
  nextProjectileId = 1;
  activatedStructureMarkers = new Set<string>();
  structureActivationTimer = 0;
  mobRemains: MobRemains[] = [];
  drops: DropEntity[] = [];
  nextMobId = 1;
  nextDropId = 1;
  mobSpawnTimer = 2;
  zombieVoiceCooldown = 0;
  combatMusicTimer = 0;
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
  multiplayer: MultiplayerSession | null = null;
  multiplayerState: MultiplayerUiState = {
    ...detectMultiplayerSupport(),
    status: "idle",
    role: null,
    peers: [],
    inviteCode: "",
    answerCode: "",
    error: "",
  };
  multiplayerTick = 0;
  multiplayerPoseTimer = 0;
  multiplayerWorldTimer = 0;
  multiplayerSnapshotTimer = 0;
  multiplayerReceivedSnapshot = false;
  sleepVotes = new Map<string, SleepTarget>();

  constructor(canvas: HTMLCanvasElement, events: EngineEvents, settings = readSettings()) {
    this.canvas = canvas;
    this.events = events;
    this.settings = settings;
    this.weather = settings.weather;
    this.liquidSimulator = new LiquidSimulator({
      minY: MIN_Y,
      maxY: MAX_Y,
      isLoaded: ({ x, y, z }) => this.world.getBlock(x, y, z) !== undefined,
      isSolid: ({ x, y, z }) => BLOCKS[this.world.getBlock(x, y, z) ?? BlockId.Bedrock]?.solid ?? true,
      isReplaceable: ({ x, y, z }) => {
        const type = this.world.getBlock(x, y, z);
        return type !== undefined && (type === BlockId.Air || Boolean(BLOCKS[type]?.replaceable));
      },
      getLiquid: ({ x, y, z }) => {
        const key = blockKey(x, y, z);
        const tracked = this.liquidCells.get(key);
        if (tracked) return tracked;
        const type = this.world.getBlock(x, y, z);
        if (type === BlockId.Water) return { kind: "water", level: 0, source: true, falling: false };
        if (type === BlockId.Lava) return { kind: "lava", level: 0, source: true, falling: false };
        return undefined;
      },
      setLiquid: ({ x, y, z }, next) => {
        const key = blockKey(x, y, z);
        if (next) this.liquidCells.set(key, { ...next });
        else this.liquidCells.delete(key);
        const type = next ? (next.kind === "water" ? BlockId.Water : BlockId.Lava) : BlockId.Air;
        this.world.setBlock(x, y, z, type, true, false);
      },
    });
    this.touchMode = window.matchMedia?.("(pointer: coarse)").matches ?? false;
    this.audio = new SynthAudio(settings);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    this.nativePixelRatio = Math.min(window.devicePixelRatio || 1, this.touchMode ? 1.2 : 1.5);
    this.renderPixelRatio = this.nativePixelRatio;
    this.renderer.setPixelRatio(this.renderPixelRatio);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, 256);
    this.camera.rotation.order = "YXZ";
    this.world.setRenderDistance(settings.renderDistance);
    this.butterflies = new ButterflySystem(this.world, (kind, captured) => {
      const progress = this.bestiary[kind];
      if (!progress) return;
      progress.seen = true;
      if (captured) progress.captures += 1;
      this.saveSoon();
      this.emitHud(true);
    });
    this.scene.add(this.camera, this.world.group, this.ambienceGroup, this.creatureGroup, this.dropGroup, this.boatGroup, this.exhibitGroup, this.projectileGroup);
    this.scene.add(this.butterflies.group);
    this.localPlayerModel.group.visible = false;
    this.scene.add(this.localPlayerModel.group);
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

    this.sun = new THREE.Mesh(new THREE.PlaneGeometry(10.2, 10.2), new THREE.MeshBasicMaterial({ map: this.createCelestialTexture("sun"), transparent: true, alphaTest: 0.02, fog: false, depthWrite: false }));
    this.moon = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 8.2), new THREE.MeshBasicMaterial({ map: this.createCelestialTexture("moon"), transparent: true, alphaTest: 0.02, fog: false, depthWrite: false }));
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

  updateAdaptiveResolution(rawDt: number) {
    if (!Number.isFinite(rawDt) || rawDt <= 0 || rawDt > 0.2 || document.hidden) return;
    this.averageFrameMs += (rawDt * 1000 - this.averageFrameMs) * 0.045;
    this.performanceSampleTime += rawDt;
    if (this.performanceSampleTime < 1.2) return;
    this.performanceSampleTime = 0;
    if (!this.running || this.paused) return;
    const nextRatio = nextAdaptivePixelRatio(this.renderPixelRatio, this.nativePixelRatio, this.averageFrameMs, this.touchMode);
    if (Math.abs(nextRatio - this.renderPixelRatio) < 0.025) return;
    this.renderPixelRatio = nextRatio;
    this.renderer.setPixelRatio(nextRatio);
    this.resize();
  }

  preventContextMenu = (event: Event) => event.preventDefault();

  keyboardLockApi() {
    return (navigator as Navigator & { keyboard?: KeyboardLockApi }).keyboard;
  }

  async lockFullscreenEscape() {
    const keyboard = this.keyboardLockApi();
    if (!keyboard || !document.fullscreenElement) return;
    try {
      await keyboard.lock(["Escape"]);
      this.keyboardEscapeLocked = true;
    } catch {
      this.keyboardEscapeLocked = false;
    }
  }

  unlockFullscreenEscape() {
    if (!this.keyboardEscapeLocked) return;
    try { this.keyboardLockApi()?.unlock(); } catch { /* The browser may have released it already. */ }
    this.keyboardEscapeLocked = false;
  }

  onFullscreenChange = () => {
    this.fullscreen = Boolean(document.fullscreenElement);
    if (this.fullscreen) void this.lockFullscreenEscape();
    else this.unlockFullscreenEscape();
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

  requestPointerLockSafely() {
    try {
      void Promise.resolve(this.canvas.requestPointerLock()).catch(() => undefined);
    } catch {
      // Touch devices, embedded previews, and automation may reject pointer lock.
    }
  }

  onMouseDown = (event: MouseEvent) => {
    if (!this.running) return;
    void this.audio.unlock();
    if (!this.locked && !this.touchMode) {
      this.requestPointerLockSafely();
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
    if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight"].includes(event.code)) event.preventDefault();
    if (event.code === "KeyE" && !event.repeat) {
      this.openOverlay("inventory");
      return;
    }
    if (event.code === "KeyQ" && !event.repeat) this.dropSelectedItem();
    if (event.code === "KeyV" && !event.repeat) {
      this.cycleCameraMode();
      return;
    }
    if (event.code === "KeyH" && !event.repeat) this.events.onToast("WASD move · Space jump/swim · Shift crouch · Ctrl sprint · V camera · Left harvest/attack · Right use/build · E inventory · Q drop");
    if (event.code === "F3" && !event.repeat) {
      event.preventDefault();
      this.debug = !this.debug;
      this.emitHud(true);
    }
    if (event.code.startsWith("Digit")) {
      const slot = Number(event.code.slice(5)) - 1;
      if (slot >= 0 && slot < 9) this.selectSlot(slot);
    }
    if (event.code === "KeyW" && !event.repeat && !this.keys.has("KeyW")) {
      const now = performance.now();
      this.sprintLatched = isDoubleForwardTap(this.lastForwardTap, now);
      this.lastForwardTap = now;
    }
    if (event.code === "Space" && !event.repeat && this.mountedBoatId) {
      event.preventDefault();
      this.dismountBoat();
      return;
    }
    this.keys.add(event.code);
  };

  onKeyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.code);
    if (event.code === "KeyW") this.sprintLatched = false;
  };
  clearInput = () => {
    this.keys.clear();
    this.sprintLatched = false;
  };
  onPageHide = () => this.saveNow(false);

  onVisibilityChange = () => {
    if (document.hidden) {
      this.clearInput();
      this.saveNow(false);
      this.audio.suspendMusic();
    } else if (this.running) {
      this.audio.resumeMusic();
      void this.audio.unlock();
    }
  };

  look(dx: number, dy: number) {
    this.yaw -= dx * this.settings.sensitivity;
    this.pitch -= dy * this.settings.sensitivity;
    this.pitch = clamp(this.pitch, -Math.PI / 2 + 0.04, Math.PI / 2 - 0.04);
  }

  cycleCameraMode() {
    this.cameraMode = this.cameraMode === "first" ? "third-rear" : this.cameraMode === "third-rear" ? "third-front" : "first";
    this.localPlayerModel.group.visible = this.cameraMode !== "first" && !this.titleMode;
    this.heldRoot.visible = this.cameraMode === "first";
    const label = this.cameraMode === "first" ? "First person" : this.cameraMode === "third-rear" ? "Third person — rear" : "Third person — front";
    this.events.onToast(`${label}. Press V to cycle the camera.`);
    this.emitHud(true);
  }

  setPlayerVariant(variant: PlayerVariant) {
    this.playerVariant = variant === "female" ? "female" : "male";
    this.localPlayerModel.setVariant(this.playerVariant);
    if (this.running && this.persistent) this.saveSoon();
    this.emitHud(true);
  }

  setVirtualKey(code: string, down: boolean) {
    if (down) {
      if (code === "KeyW" && !this.keys.has(code)) {
        const now = performance.now();
        this.sprintLatched = isDoubleForwardTap(this.lastForwardTap, now);
        this.lastForwardTap = now;
      }
      this.keys.add(code);
    } else {
      this.keys.delete(code);
      if (code === "KeyW") this.sprintLatched = false;
    }
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
    this.activatedStructureMarkers.clear();
    this.liquidCells.clear();
    this.world.reset(seed, undefined, generationOptionsFromWorldOptions(DEFAULT_WORLD_OPTIONS));
    const spawn = this.findSpawn();
    this.world.initializeAround(spawn.x, spawn.z);
    const y = this.world.surfaceAt(spawn.x, spawn.z) + 0.51;
    this.spawn.set(spawn.x, y, spawn.z);
    this.position.copy(this.spawn);
    this.resetDynamicWeather();
    this.emitHud(true);
  }

  createWorld(seed: string, mode: GameMode, options: Partial<WorldOptions> = {}, name = "New World") {
    this.persistent = true;
    this.running = true;
    this.paused = false;
    this.titleMode = false;
    this.mode = mode;
    this.localPlayerModel.setVariant(this.playerVariant);
    this.worldOptions = normalizeWorldOptions(options);
    this.butterflyDensity = this.worldOptions.butterflyDensity;
    if (!this.worldOptions.weather) this.weather = "clear";
    this.activeWorldId = null;
    this.worldSessionStartedAt = Date.now();
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
    this.sleepVotes.clear();
    this.clearEntities();
    this.activatedStructureMarkers.clear();
    this.liquidCells.clear();
    this.oxygenSeconds = DEFAULT_SWIM_RULES.maxOxygenSeconds;
    this.drowningAccumulator = 0;
    this.world.reset(seed.trim() || this.randomSeed(), undefined, generationOptionsFromWorldOptions(this.worldOptions));
    const spawn = this.findSpawn();
    this.world.initializeAround(spawn.x, spawn.z);
    const y = this.world.surfaceAt(spawn.x, spawn.z) + 0.51;
    this.spawn.set(spawn.x, y, spawn.z);
    this.position.copy(this.spawn);
    this.resetDynamicWeather();
    for (let dx = -1; dx <= 1; dx += 1) for (let dz = -1; dz <= 1; dz += 1) {
      for (let clearY = Math.floor(y + 0.5); clearY <= Math.floor(y + 2.5); clearY += 1) this.world.setBlock(spawn.x + dx, clearY, spawn.z + dz, BlockId.Air);
    }
    if (mode === "survival") {
      this.inventory[0] = { item: Item.Berry, count: 3 };
    } else {
      for (let index = 0; index < Math.min(INVENTORY_SIZE, CREATIVE_BLOCKS.length); index += 1) this.inventory[index] = { item: CREATIVE_BLOCKS[index], count: 64 };
    }
    this.spawnProtection = 22;
    const created = this.worldStorage.createWorld({ name, save: this.serialize(), options: this.worldOptions });
    if (created.ok) {
      this.activeWorldId = created.value.id;
      this.worldStorage.setActiveWorld(created.value.id);
      this.events.onSave();
    } else {
      this.events.onToast(created.error.message);
      this.saveSoon();
    }
    this.emitHud(true);
    return created.ok ? created.value : null;
  }

  loadWorld(save: WorldSave, options: Partial<WorldOptions> = save.options ?? {}, worldId: string | null = this.worldStorage.activeWorldId) {
    this.persistent = true;
    this.running = true;
    this.paused = false;
    this.titleMode = false;
    this.mode = save.mode === "builder" ? "builder" : "survival";
    this.playerVariant = save.playerVariant === "female" ? "female" : "male";
    this.localPlayerModel.setVariant(this.playerVariant);
    this.worldOptions = normalizeWorldOptions(options);
    this.butterflyDensity = this.worldOptions.butterflyDensity;
    this.activeWorldId = worldId;
    this.worldSessionStartedAt = Date.now();
    this.sleepVotes.clear();
    this.clearEntities();
    this.activatedStructureMarkers = new Set(save.activatedStructureMarkers ?? []);
    this.liquidCells = new Map((save.liquidLevels ?? []).filter(([key, cell]) => typeof key === "string" && (cell?.kind === "water" || cell?.kind === "lava")).map(([key, cell]) => [key, { ...cell }]));
    this.oxygenSeconds = DEFAULT_SWIM_RULES.maxOxygenSeconds;
    this.drowningAccumulator = 0;
    this.world.reset(save.seed, save.edits, generationOptionsFromWorldOptions(this.worldOptions));
    this.world.initializeAround(save.player.x, save.player.z);
    this.position.set(save.player.x, save.player.y, save.player.z);
    this.spawn.set(save.spawn?.x ?? 0, save.spawn?.y ?? this.world.surfaceAt(0, 0) + 0.51, save.spawn?.z ?? 0);
    this.yaw = Number(save.player.yaw) || 0;
    this.pitch = clamp(Number(save.player.pitch) || 0, -1.4, 1.4);
    this.resetDynamicWeather(save.weatherState);
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
      const leftover = this.addItem(slot.item, slot.count, slot.durability, undefined, slot.metadata);
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
    if (!this.worldOptions.weather) this.weather = "clear";
    this.furnaces = new Map(Object.entries(save.furnaces ?? {}).map(([key, value]) => [key, { ...blankFurnace(), ...value }]));
    this.chests = restoreChestStorage(save.chests ?? {});
    for (const savedBoat of save.boats ?? []) this.restoreSailboat(savedBoat);
    for (const savedCreature of save.creatures ?? []) this.restoreCreature(savedCreature);
    if (this.collidesAt(this.position) || this.position.y < MIN_Y) this.respawn(false);
    for (const savedDrop of save.drops ?? []) {
      if (!ITEMS[savedDrop.item] || savedDrop.count <= 0) continue;
      const drop = this.spawnDrop(savedDrop.item, savedDrop.count, new THREE.Vector3(savedDrop.x, savedDrop.y, savedDrop.z), savedDrop.durability, savedDrop.metadata);
      if (!drop) continue;
      drop.mesh.position.set(savedDrop.x, savedDrop.y, savedDrop.z);
      drop.velocity.set(0, 0, 0);
      drop.age = clamp(Number(savedDrop.age) || 0, 0, 115);
      drop.pickupDelay = 0.25;
    }
    this.spawnProtection = 8;
    this.emitHud(true);
  }

  loadStoredWorld(id: string) {
    const loaded = this.worldStorage.loadWorld(id);
    if (!loaded.ok) {
      this.events.onToast(loaded.error.message);
      return false;
    }
    this.loadWorld(loaded.value.save, loaded.value.options, id);
    return true;
  }

  getMultiplayerState(): MultiplayerUiState {
    if (this.multiplayer) {
      this.multiplayerState.status = this.multiplayer.state;
      this.multiplayerState.role = this.multiplayer.role;
      this.multiplayerState.peers = this.multiplayer.getPeers();
    }
    return {
      ...this.multiplayerState,
      peers: this.multiplayerState.peers.map((peer) => ({ ...peer, identity: peer.identity ? { ...peer.identity } : null })),
      reasons: [...this.multiplayerState.reasons],
    };
  }

  private multiplayerIdentity(name: string) {
    const cleanName = name.trim().slice(0, 24) || "Wanderer";
    let hash = 2166136261;
    for (const character of cleanName) hash = Math.imul(hash ^ character.charCodeAt(0), 16777619);
    const palette = ["#4f91d8", "#d36c55", "#68a864", "#b66fc4", "#d0a447", "#3fa7a0", "#d17a9f", "#7b83d5"];
    return createPeerIdentity(cleanName, palette[Math.abs(hash) % palette.length]);
  }

  private beginMultiplayerSession(name: string) {
    this.multiplayer?.dispose("new-session");
    this.removeAllRemotePlayers();
    this.multiplayerState.inviteCode = "";
    this.multiplayerState.answerCode = "";
    this.multiplayerState.error = "";
    const support = detectMultiplayerSupport();
    this.multiplayerState.supported = support.supported;
    this.multiplayerState.reasons = support.reasons;
    if (!support.supported) throw new Error(support.reasons.join(" "));
    const identity = this.multiplayerIdentity(name);
    this.localPlayerModel.setPlayerName(identity.name).setColors({ shirt: identity.color });
    this.multiplayer = new MultiplayerSession({ identity, onEvent: (event) => this.handleMultiplayerEvent(event) });
    this.multiplayerState.status = "idle";
    this.multiplayerState.role = null;
    this.multiplayerState.peers = [];
    this.multiplayerPoseTimer = 0;
    this.multiplayerWorldTimer = 0;
    this.multiplayerSnapshotTimer = 0;
    this.multiplayerReceivedSnapshot = false;
    return this.multiplayer;
  }

  async hostMultiplayer(playerName: string) {
    if (!this.running || this.titleMode) throw new Error("Open a world before hosting a multiplayer session.");
    try {
      const session = this.multiplayer?.role === "host" && this.multiplayer.state !== "closed"
        ? this.multiplayer
        : this.beginMultiplayerSession(playerName);
      const invite = await session.createHostInvite();
      this.multiplayerState.inviteCode = invite.inviteCode;
      this.multiplayerState.answerCode = "";
      this.multiplayerState.status = session.state;
      this.multiplayerState.role = "host";
      this.events.onToast("Host invite created. Send it privately to one guest, then paste their answer.");
      return { inviteCode: invite.inviteCode };
    } catch (error) {
      this.multiplayerState.error = error instanceof Error ? error.message : String(error);
      this.multiplayerState.status = "error";
      throw error;
    }
  }

  async joinMultiplayer(inviteCode: string, playerName: string) {
    try {
      const session = this.beginMultiplayerSession(playerName);
      const answer = await session.createGuestAnswer(inviteCode.trim());
      this.multiplayerState.answerCode = answer.answerCode;
      this.multiplayerState.inviteCode = inviteCode.trim();
      this.multiplayerState.status = session.state;
      this.multiplayerState.role = "guest";
      this.events.onToast(`Answer created for ${answer.host.name}. Send it back to the host to finish connecting.`);
      return { answerCode: answer.answerCode };
    } catch (error) {
      this.multiplayerState.error = error instanceof Error ? error.message : String(error);
      this.multiplayerState.status = "error";
      throw error;
    }
  }

  async acceptMultiplayerAnswer(answerCode: string) {
    if (!this.multiplayer || this.multiplayer.role !== "host") throw new Error("Create a host invite first.");
    try {
      await this.multiplayer.acceptGuestAnswer(answerCode.trim());
      this.multiplayerState.answerCode = answerCode.trim();
      this.multiplayerState.status = this.multiplayer.state;
      this.multiplayerState.peers = this.multiplayer.getPeers();
      this.events.onToast("Guest answer accepted. The peer connection is opening now.");
    } catch (error) {
      this.multiplayerState.error = error instanceof Error ? error.message : String(error);
      throw error;
    }
  }

  disconnectMultiplayer() {
    const hadSession = Boolean(this.multiplayer);
    this.multiplayer?.dispose("local-disconnect");
    this.multiplayer = null;
    this.removeAllRemotePlayers();
    const support = detectMultiplayerSupport();
    this.multiplayerState = {
      supported: support.supported,
      reasons: support.reasons,
      status: "idle",
      role: null,
      peers: [],
      inviteCode: "",
      answerCode: "",
      error: "",
    };
    this.multiplayerReceivedSnapshot = false;
    this.sleepVotes.clear();
    if (hadSession && !this.titleMode && !this.disposed) this.events.onToast("Multiplayer session closed. The host-device world remains saved locally.");
    if (!this.disposed) this.emitHud(true);
  }

  private removeRemotePlayer(id: string) {
    const remote = this.remotePlayers.get(id);
    if (!remote) return;
    const held = remote.model.rightHandSocket.children[0];
    if (held) {
      remote.model.setHeldItem(null);
      this.disposeObject(held);
    }
    remote.model.dispose();
    this.remotePlayers.delete(id);
    this.remoteAvatarHeldCodes.delete(id);
  }

  private removeAllRemotePlayers() {
    for (const id of [...this.remotePlayers.keys()]) this.removeRemotePlayer(id);
  }

  private upsertRemotePlayer(pose: PlayerPose, peer?: PeerInfo) {
    if (pose.playerId === this.multiplayer?.identity.id) return;
    let remote = this.remotePlayers.get(pose.playerId);
    if (!remote) {
      const identity = peer?.identity ?? this.multiplayer?.getPeer(pose.playerId)?.identity;
      const model = new BlockPlayerModel({
        playerId: pose.playerId,
        playerName: identity?.name ?? "Wanderer",
        mode: "remote",
        variant: pose.variant ?? "male",
        colors: identity?.color ? { shirt: identity.color } : undefined,
      });
      model.setEquipmentAppearance(this.equipmentAppearanceFromCodes(pose.equipment));
      model.group.position.set(pose.x, pose.y, pose.z);
      this.scene.add(model.group);
      remote = { model, pose: { ...pose }, target: { ...pose }, lastUpdate: performance.now() };
      this.remotePlayers.set(pose.playerId, remote);
    }
    remote.target = { ...pose };
    remote.lastUpdate = performance.now();
    if (this.multiplayer?.role === "host") {
      for (const boat of this.boats.values()) {
        const shouldRide = pose.boatId === boat.save.id;
        const isRiding = boat.save.passengers.includes(pose.playerId);
        if (shouldRide && !isRiding && boat.save.passengers.length < 2) boat.save.passengers = boardSailboat(boat.save.passengers, pose.playerId);
        else if (!shouldRide && isRiding) boat.save.passengers = leaveSailboat(boat.save.passengers, pose.playerId);
      }
    }
  }

  private localNetworkPose(): PlayerPose | null {
    const identity = this.multiplayer?.identity;
    if (!identity) return null;
    const boat = this.mountedBoatId ? this.boats.get(this.mountedBoatId) : null;
    const boatSeat = boat ? boat.save.passengers.indexOf(identity.id) : -1;
    return {
      playerId: identity.id,
      tick: this.multiplayerTick,
      x: this.position.x,
      y: this.position.y,
      z: this.position.z,
      yaw: this.yaw,
      pitch: this.pitch,
      vx: this.velocity.x,
      vy: this.velocity.y,
      vz: this.velocity.z,
      grounded: this.grounded,
      heldItem: this.selectedSlot()?.item,
      crouching: this.crouching,
      sprinting: this.sprinting,
      action: this.mineHeld || this.attackCooldown > 0 ? "mine" : this.heldUse > 0 ? "use" : "none",
      variant: this.playerVariant,
      equipment: Object.fromEntries((Object.keys(this.equipment) as EquipmentSlot[])
        .flatMap((slot) => this.equipment[slot] ? [[slot, this.equipment[slot]!.item] as const] : [])),
      ...(boat && boatSeat >= 0 ? { boatId: boat.save.id, boatSeat } : {}),
    };
  }

  private networkBlockEdits(limit = 5200) {
    const edits: Array<{ x: number; y: number; z: number; type: number }> = [];
    for (const [key, entries] of Object.entries(this.world.serializeEdits())) {
      const [cx, cz] = key.split(",").map(Number);
      if (!Number.isFinite(cx) || !Number.isFinite(cz)) continue;
      for (const [index, type] of entries) {
        const layer = Math.floor(index / (CHUNK_SIZE * CHUNK_SIZE));
        const horizontal = index % (CHUNK_SIZE * CHUNK_SIZE);
        edits.push({
          x: cx * CHUNK_SIZE + horizontal % CHUNK_SIZE,
          y: MIN_Y + layer,
          z: cz * CHUNK_SIZE + Math.floor(horizontal / CHUNK_SIZE),
          type,
        });
      }
    }
    if (edits.length <= limit) return edits;
    const playerPositions = [this.position, ...[...this.remotePlayers.values()].map((remote) => remote.target)];
    const nearestPlayerDistance = (edit: { x: number; z: number }) => {
      let best = Infinity;
      for (const player of playerPositions) best = Math.min(best, (edit.x - player.x) ** 2 + (edit.z - player.z) ** 2);
      return best;
    };
    edits.sort((a, b) => nearestPlayerDistance(a) - nearestPlayerDistance(b));
    return edits.slice(0, limit);
  }

  private networkMobSnapshot() {
    return this.mobs.map((mob) => ({
      id: mob.id,
      kind: mob.kind,
      x: mob.group.position.x,
      y: mob.group.position.y,
      z: mob.group.position.z,
      yaw: mob.group.rotation.y,
      health: mob.health,
      state: mob.state,
    }));
  }

  private networkDropSnapshot() {
    return this.drops.map((drop) => ({
      id: drop.id,
      item: drop.item,
      count: drop.count,
      x: drop.mesh.position.x,
      y: drop.mesh.position.y,
      z: drop.mesh.position.z,
      age: drop.age,
      ...(drop.durability !== undefined ? { durability: drop.durability } : {}),
    }));
  }

  private hostWorldSnapshot(): WorldSnapshot {
    const local = this.localNetworkPose();
    return {
      tick: this.multiplayerTick,
      seed: this.world.seedText,
      generatorVersion: GENERATOR_VERSION,
      players: [local, ...[...this.remotePlayers.values()].map((remote) => remote.target)].filter((pose): pose is PlayerPose => Boolean(pose)),
      blockEdits: this.networkBlockEdits(),
      mobs: this.networkMobSnapshot(),
      drops: this.networkDropSnapshot(),
      boats: [...this.boats.values()].map(({ save }) => ({
        id: save.id, x: save.x, y: save.y, z: save.z, yaw: save.yaw, velocity: save.velocity, passengers: [...save.passengers],
      })),
      time: { tick: this.multiplayerTick, worldTime: this.worldTime, day: this.day, weather: this.weather },
      worldOptions: { ...this.worldOptions },
    };
  }

  private sendHostWorldSnapshot(peerId?: string) {
    if (!this.multiplayer || this.multiplayer.role !== "host") return;
    try { this.multiplayer.sendSnapshot(this.hostWorldSnapshot(), peerId); }
    catch (error) { this.multiplayerState.error = error instanceof Error ? error.message : String(error); }
  }

  private editsFromNetwork(blockEdits: WorldSnapshot["blockEdits"]): ChunkEditSave {
    const edits: ChunkEditSave = {};
    for (const edit of blockEdits) {
      const cx = Math.floor(edit.x / CHUNK_SIZE);
      const cz = Math.floor(edit.z / CHUNK_SIZE);
      const lx = edit.x - cx * CHUNK_SIZE;
      const lz = edit.z - cz * CHUNK_SIZE;
      const index = lx + lz * CHUNK_SIZE + (edit.y - MIN_Y) * CHUNK_SIZE * CHUNK_SIZE;
      const key = `${cx},${cz}`;
      (edits[key] ??= []).push([index, edit.type]);
    }
    return edits;
  }

  private applyInitialWorldSnapshot(snapshot: WorldSnapshot, hostPeer: PeerInfo) {
    if (snapshot.generatorVersion !== GENERATOR_VERSION) {
      this.multiplayerState.error = "Host and guest use different world-generator versions.";
      return;
    }
    const hostPose = snapshot.players.find((pose) => pose.playerId === hostPeer.identity?.id) ?? snapshot.players[0];
    this.worldOptions = normalizeWorldOptions(snapshot.worldOptions ?? this.worldOptions);
    this.butterflyDensity = this.worldOptions.butterflyDensity;
    this.clearEntities();
    this.liquidCells.clear();
    this.world.reset(snapshot.seed, this.editsFromNetwork(snapshot.blockEdits), generationOptionsFromWorldOptions(this.worldOptions));
    const centerX = hostPose?.x ?? 0;
    const centerZ = hostPose?.z ?? 0;
    this.world.initializeAround(centerX, centerZ);
    const candidates = [[1.4, 0], [-1.4, 0], [0, 1.4], [0, -1.4]];
    let joined = false;
    for (const [dx, dz] of candidates) {
      const candidate = new THREE.Vector3(centerX + dx, hostPose?.y ?? this.world.surfaceAt(centerX + dx, centerZ + dz) + 0.51, centerZ + dz);
      if (!this.collidesAt(candidate, PLAYER_HEIGHT)) { this.position.copy(candidate); joined = true; break; }
    }
    if (!joined) this.position.set(centerX, this.world.surfaceAt(centerX, centerZ) + 0.51, centerZ);
    this.spawn.copy(this.position);
    this.worldTime = snapshot.time.worldTime;
    this.day = snapshot.time.day;
    this.weather = snapshot.time.weather;
    this.running = true;
    this.paused = true;
    this.titleMode = false;
    this.persistent = false;
    this.activeWorldId = null;
    this.applyNetworkMobSnapshot(snapshot.mobs);
    this.applyNetworkDropSnapshot(snapshot.drops);
    this.applyNetworkBoatSnapshot(snapshot.boats ?? []);
    for (const pose of snapshot.players) this.upsertRemotePlayer(pose, pose.playerId === hostPeer.identity?.id ? hostPeer : undefined);
    this.multiplayerReceivedSnapshot = true;
    this.events.onToast(`Joined ${hostPeer.identity?.name ?? "the host"}'s world. The host device is authoritative for this session.`);
  }

  private applyIncrementalWorldSnapshot(snapshot: WorldSnapshot, hostPeer: PeerInfo) {
    if (snapshot.generatorVersion !== GENERATOR_VERSION || snapshot.seed !== this.world.seedText) return;
    this.worldOptions = normalizeWorldOptions(snapshot.worldOptions ?? this.worldOptions);
    this.butterflyDensity = this.worldOptions.butterflyDensity;
    if (snapshot.blockEdits.length) {
      this.world.setBlocksBatch(snapshot.blockEdits.map((edit) => ({ ...edit, type: edit.type as BlockId })), true, false);
      this.lightRefreshTimer = 0;
    }
    this.worldTime = snapshot.time.worldTime;
    this.day = snapshot.time.day;
    this.weather = snapshot.time.weather;
    this.applyNetworkMobSnapshot(snapshot.mobs);
    this.applyNetworkDropSnapshot(snapshot.drops);
    this.applyNetworkBoatSnapshot(snapshot.boats ?? []);
    for (const pose of snapshot.players) this.upsertRemotePlayer(pose, pose.playerId === hostPeer.identity?.id ? hostPeer : undefined);
  }

  private applyNetworkMobSnapshot(entries: WorldSnapshot["mobs"]) {
    const incoming = new Set(entries.map((entry) => entry.id));
    for (let index = this.mobs.length - 1; index >= 0; index -= 1) if (!incoming.has(this.mobs[index].id)) this.removeMob(index);
    for (const entry of entries) {
      if (!(entry.kind in MOB_DEFS) || BUTTERFLY_ORDER.includes(entry.kind as ButterflyKind)) continue;
      let mob = this.mobs.find((candidate) => candidate.id === entry.id);
      if (!mob || mob.kind !== entry.kind) {
        if (mob) this.removeMob(this.mobs.indexOf(mob));
        mob = this.spawnMob(entry.kind as MobKind, new THREE.Vector3(entry.x, entry.y, entry.z));
        mob.id = entry.id;
        mob.group.userData.mobId = entry.id;
        mob.group.traverse((object) => { if (object.userData.mobId !== undefined) object.userData.mobId = entry.id; });
        this.nextMobId = Math.max(this.nextMobId, entry.id + 1);
      }
      mob.group.position.lerp(new THREE.Vector3(entry.x, entry.y, entry.z), 0.72);
      mob.group.rotation.y = entry.yaw;
      mob.health = entry.health;
      if (["wander", "flee", "chase", "windup", "recover"].includes(entry.state)) mob.state = entry.state as MobEntity["state"];
    }
  }

  private applyNetworkDropSnapshot(entries: WorldSnapshot["drops"]) {
    const incoming = new Set(entries.map((entry) => entry.id));
    for (let index = this.drops.length - 1; index >= 0; index -= 1) if (!incoming.has(this.drops[index].id)) this.removeDrop(index);
    for (const entry of entries) {
      if (!ITEMS[entry.item] || entry.count <= 0) continue;
      let drop = this.drops.find((candidate) => candidate.id === entry.id);
      if (!drop || drop.item !== entry.item) {
        if (drop) this.removeDrop(this.drops.indexOf(drop));
        drop = this.spawnDrop(entry.item, entry.count, new THREE.Vector3(entry.x, entry.y, entry.z), entry.durability) ?? undefined;
        if (!drop) continue;
        drop.id = entry.id;
        drop.mesh.position.set(entry.x, entry.y, entry.z);
      } else {
        drop.count = entry.count;
        drop.durability = entry.durability;
        drop.mesh.position.lerp(new THREE.Vector3(entry.x, entry.y, entry.z), 0.78);
      }
      drop.velocity.set(0, 0, 0);
      drop.age = entry.age;
      drop.pickupDelay = 0.5;
      this.nextDropId = Math.max(this.nextDropId, entry.id + 1);
    }
  }

  private handleRemoteBlockAction(action: BlockAction, peer: PeerInfo) {
    if (!this.multiplayer) return;
    if (this.multiplayer.role === "host" && action.status !== "accepted") {
      const remote = peer.identity ? this.remotePlayers.get(peer.identity.id) : null;
      const valid = Boolean(remote) && action.edits.length > 0 && action.edits.length <= 512 && action.edits.every((edit) => {
        const definition = BLOCKS[edit.type as BlockId];
        const dx = edit.x - remote!.target.x;
        const dy = edit.y - (remote!.target.y + 1);
        const dz = edit.z - remote!.target.z;
        return Boolean(definition) && edit.y >= MIN_Y && edit.y <= MAX_Y && dx * dx + dy * dy + dz * dz <= 64;
      });
      const resolved: BlockAction = { ...action, status: valid ? "accepted" : "rejected", ...(valid ? {} : { reason: "The host rejected an out-of-range or invalid block edit." }) };
      if (valid) {
        this.world.setBlocksBatch(action.edits.map((edit) => ({ ...edit, type: edit.type as BlockId })), true, true);
        this.lightRefreshTimer = 0;
        this.saveSoon();
        this.multiplayer.sendBlockAction(resolved);
      } else if (peer.identity) this.multiplayer.sendBlockAction(resolved, peer.identity.id);
      return;
    }
    if (this.multiplayer.role === "guest" && action.status === "accepted") {
      this.world.setBlocksBatch(action.edits.map((edit) => ({ ...edit, type: edit.type as BlockId })), true, true);
      this.lightRefreshTimer = 0;
    }
  }

  private handleMultiplayerEvent(event: MultiplayerEvent) {
    if (event.type === "state") this.multiplayerState.status = event.state;
    else if (event.type === "error") {
      this.multiplayerState.error = event.error.message;
      this.events.onToast(`Multiplayer: ${event.error.message}`);
    } else if (event.type === "peer") {
      this.multiplayerState.peers = this.multiplayer?.getPeers() ?? [];
      if (event.peer.state === "connected" && this.multiplayer?.role === "host" && event.peer.identity) {
        this.sendHostWorldSnapshot(event.peer.identity.id);
        this.events.onToast(`${event.peer.identity.name} joined the session.`);
      }
      if (["disconnected", "failed", "closed", "stale"].includes(event.peer.state) && event.peer.identity) {
        this.removeRemotePlayer(event.peer.identity.id);
        this.sleepVotes.delete(event.peer.identity.id);
        if (this.multiplayer?.role === "host") {
          this.evaluateSleepVotes("morning");
          this.evaluateSleepVotes("night");
        }
      }
      this.emitHud(true);
    } else if (event.type === "message") {
      const { envelope } = event;
      if (envelope.type === "player-pose") {
        const pose = envelope.payload as PlayerPose;
        this.upsertRemotePlayer(pose, event.peer);
        if (this.multiplayer?.role === "host") this.multiplayer.sendPlayerPose(pose);
      } else if (envelope.type === "snapshot" && this.multiplayer?.role === "guest") {
        const snapshot = envelope.payload as WorldSnapshot;
        if (this.multiplayerReceivedSnapshot) this.applyIncrementalWorldSnapshot(snapshot, event.peer);
        else this.applyInitialWorldSnapshot(snapshot, event.peer);
      } else if (envelope.type === "block-action") this.handleRemoteBlockAction(envelope.payload as BlockAction, event.peer);
      else if (envelope.type === "sleep-vote") this.handleRemoteSleepVote(envelope.payload as SleepVote, event.peer);
      else if (envelope.type === "mob-snapshot" && this.multiplayer?.role === "guest") this.applyNetworkMobSnapshot((envelope.payload as { mobs: WorldSnapshot["mobs"] }).mobs);
      else if (envelope.type === "drop-snapshot" && this.multiplayer?.role === "guest") this.applyNetworkDropSnapshot((envelope.payload as { drops: WorldSnapshot["drops"] }).drops);
      else if (envelope.type === "time-weather" && this.multiplayer?.role === "guest") {
        const time = envelope.payload as WorldSnapshot["time"] & { boats?: NonNullable<WorldSnapshot["boats"]> };
        this.worldTime = time.worldTime;
        this.day = time.day;
        this.weather = time.weather;
        if (time.boats) this.applyNetworkBoatSnapshot(time.boats);
      }
    }
  }

  publishBlockEdits(edits: Array<{ x: number; y: number; z: number; type: BlockId }>, kind?: BlockAction["kind"]) {
    if (!this.multiplayer || !edits.length) return;
    const identity = this.multiplayer.identity;
    const action: BlockAction = {
      requestId: `action_${Date.now().toString(36)}_${(this.multiplayerTick % 46656).toString(36).padStart(3, "0")}`,
      actorId: identity.id,
      tick: this.multiplayerTick,
      kind: kind ?? (edits.length > 1 ? "batch" : edits[0].type === BlockId.Air ? "break" : "place"),
      edits,
      status: this.multiplayer.role === "host" ? "accepted" : "request",
    };
    try { this.multiplayer.sendBlockAction(action); }
    catch (error) { this.multiplayerState.error = error instanceof Error ? error.message : String(error); }
  }

  updateMultiplayer(dt: number) {
    const session = this.multiplayer;
    if (!session || !session.role || session.state === "closed" || session.state === "error") return;
    this.multiplayerTick += 1;
    this.multiplayerPoseTimer -= dt;
    this.multiplayerWorldTimer -= dt;
    this.multiplayerSnapshotTimer -= dt;
    if (this.multiplayerPoseTimer <= 0) {
      this.multiplayerPoseTimer = 0.05;
      const pose = this.localNetworkPose();
      if (pose) {
        try { session.sendPlayerPose(pose); } catch { /* Channels may still be opening. */ }
      }
    }
    if (session.role === "host" && this.multiplayerWorldTimer <= 0) {
      this.multiplayerWorldTimer = 0.65;
      try {
        session.sendMobSnapshot({ tick: this.multiplayerTick, mobs: this.networkMobSnapshot() });
        session.sendDropSnapshot({ tick: this.multiplayerTick, drops: this.networkDropSnapshot() });
        session.sendTimeWeather({
          tick: this.multiplayerTick, worldTime: this.worldTime, day: this.day, weather: this.weather,
          boats: [...this.boats.values()].map(({ save }) => ({ id: save.id, x: save.x, y: save.y, z: save.z, yaw: save.yaw, velocity: save.velocity, passengers: [...save.passengers] })),
        });
      } catch { /* No connected guest yet. */ }
    }
    if (session.role === "host" && this.multiplayerSnapshotTimer <= 0 && session.getPeers().some((peer) => peer.state === "connected")) {
      this.multiplayerSnapshotTimer = 10;
      this.sendHostWorldSnapshot();
    }
  }

  activate() {
    this.running = true;
    this.paused = false;
    this.titleMode = false;
    void this.audio.unlock();
    if (!this.touchMode) this.requestPointerLockSafely();
  }

  private applyNetworkBoatSnapshot(entries: NonNullable<WorldSnapshot["boats"]>) {
    const incoming = new Set(entries.map((entry) => entry.id));
    for (const [id, boat] of this.boats) {
      if (incoming.has(id)) continue;
      this.boatGroup.remove(boat.group);
      disposeSailboatVisual(boat.group);
      this.boats.delete(id);
      this.chests.delete(`boat:${id}`);
    }
    for (const entry of entries) {
      let boat = this.boats.get(entry.id);
      if (!boat) boat = this.restoreSailboat({ ...entry, inventory: [] });
      if (!boat) continue;
      boat.save.x += (entry.x - boat.save.x) * 0.72;
      boat.save.y += (entry.y - boat.save.y) * 0.72;
      boat.save.z += (entry.z - boat.save.z) * 0.72;
      boat.save.yaw += Math.atan2(Math.sin(entry.yaw - boat.save.yaw), Math.cos(entry.yaw - boat.save.yaw)) * 0.72;
      boat.save.velocity = entry.velocity;
      boat.save.passengers = [...entry.passengers].slice(0, 2);
      boat.group.position.set(boat.save.x, boat.save.y, boat.save.z);
      boat.group.rotation.y = boat.save.yaw;
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
    this.disconnectMultiplayer();
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
        await this.lockFullscreenEscape();
      }
      else {
        this.unlockFullscreenEscape();
        await document.exitFullscreen();
      }
    } catch {
      this.events.onToast("Fullscreen is unavailable in this browser.");
    }
  }

  exhibitTopologyAt(x: number, y: number, z: number) {
    if (this.world.getBlock(x, y, z) !== BlockId.ButterflyExhibit) return null;
    const queue = [{ x, y, z }];
    const blocks: Array<{ x: number; y: number; z: number }> = [];
    const visited = new Set<string>();
    const offsets = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;
    while (queue.length && blocks.length < 64) {
      const current = queue.shift()!;
      const key = blockKey(current.x, current.y, current.z);
      if (visited.has(key) || this.world.getBlock(current.x, current.y, current.z) !== BlockId.ButterflyExhibit) continue;
      visited.add(key);
      blocks.push(current);
      for (const [dx, dy, dz] of offsets) queue.push({ x: current.x + dx, y: current.y + dy, z: current.z + dz });
    }
    return buildExhibitTopology(blocks, { x, y, z });
  }

  exhibitStorageKey(topology: ExhibitTopology) {
    return `exhibit:${topology.blocks.map((block) => block.key).sort()[0]}`;
  }

  consolidateExhibit(topology: ExhibitTopology) {
    const blockKeys = new Set(topology.blocks.map((block) => block.key));
    const related = [...this.chests.keys()].filter((key) => key.startsWith("exhibit:") && blockKeys.has(key.slice("exhibit:".length)));
    const specimens: InventorySlot[] = [];
    for (const key of related) {
      for (const slot of this.chests.get(key) ?? []) {
        if (!slot || !this.isButterflyJar(slot.item)) continue;
        for (let count = 0; count < slot.count; count += 1) specimens.push(cloneSlot({ ...slot, count: 1 })!);
      }
      this.chests.delete(key);
      const visual = this.exhibitVisuals.get(key);
      if (visual) { this.exhibitGroup.remove(visual.group); this.disposeObject(visual.group); this.exhibitVisuals.delete(key); }
    }
    const key = this.exhibitStorageKey(topology);
    const slots = Array.from({ length: topology.capacity }, (_, index) => specimens[index] ?? null);
    this.chests.set(key, slots);
    for (const overflow of specimens.slice(topology.capacity)) {
      const leftover = this.addItem(overflow.item, 1, overflow.durability, undefined, overflow.metadata);
      if (leftover) this.spawnDrop(overflow.item, leftover, new THREE.Vector3(topology.origin.x, topology.origin.y + 0.5, topology.origin.z), overflow.durability, overflow.metadata);
    }
    return key;
  }

  openExhibit(x: number, y: number, z: number) {
    const topology = this.exhibitTopologyAt(x, y, z);
    if (!topology) return;
    const key = this.consolidateExhibit(topology);
    this.syncExhibitVisuals(true);
    this.openOverlay("chest", key);
  }

  rebuildExhibitAfterBreak(topology: ExhibitTopology, oldSlots: ChestState, broken: { x: number; y: number; z: number }) {
    const oldKey = this.exhibitStorageKey(topology);
    this.chests.delete(oldKey);
    const oldVisual = this.exhibitVisuals.get(oldKey);
    if (oldVisual) { this.exhibitGroup.remove(oldVisual.group); this.disposeObject(oldVisual.group); this.exhibitVisuals.delete(oldKey); }
    const remaining = topology.blocks.filter((block) => block.x !== broken.x || block.y !== broken.y || block.z !== broken.z);
    const assigned = new Set<string>();
    const specimens = oldSlots.flatMap((slot) => slot ? Array.from({ length: slot.count }, () => cloneSlot({ ...slot, count: 1 })!) : []);
    let specimenIndex = 0;
    for (const block of remaining) {
      if (assigned.has(block.key) || this.world.getBlock(block.x, block.y, block.z) !== BlockId.ButterflyExhibit) continue;
      const component = this.exhibitTopologyAt(block.x, block.y, block.z);
      if (!component) continue;
      for (const entry of component.blocks) assigned.add(entry.key);
      const key = this.exhibitStorageKey(component);
      this.chests.set(key, Array.from({ length: component.capacity }, () => specimens[specimenIndex++] ?? null));
    }
    while (specimenIndex < specimens.length) {
      const specimen = specimens[specimenIndex++];
      this.spawnDrop(specimen.item, 1, new THREE.Vector3(broken.x, broken.y + 0.5, broken.z), specimen.durability, specimen.metadata);
    }
    this.syncExhibitVisuals(true);
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
    const wood = new THREE.MeshLambertMaterial({ color: 0x9f6833 });
    const base = new THREE.Mesh(new THREE.BoxGeometry(width + 0.025, 0.72, depth + 0.025), wood);
    base.position.y = -0.14;
    group.add(base);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(width + 0.055, 0.09, depth + 0.055), new THREE.MeshLambertMaterial({ color: 0x603a20 }));
    rim.position.y = 0.2;
    group.add(rim);
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.22, 0.07), new THREE.MeshLambertMaterial({ color: 0xe0b54e }));
    latch.position.set(0, 0.03, -depth / 2 - 0.045);
    group.add(latch);
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.39, depth / 2 - 0.08);
    const lidMaterial = new THREE.MeshLambertMaterial({ color: 0xa56c32 });
    const lid = new THREE.Mesh(new THREE.BoxGeometry(width, 0.18, depth), lidMaterial);
    lid.position.set(0, 0, -depth / 2 + 0.08);
    pivot.add(lid);
    group.add(pivot);
    this.scene.add(group);
    this.activeChestModel = group;
    this.chestLidPivot = pivot;
    this.chestOpenAmount = 0;
    this.audio.playSample("chestOpen");
  }

  hideChestModel(immediate = false) {
    if (!this.activeChestModel) return;
    if (!immediate) {
      this.audio.playSample("chestClose");
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

  getSleepStatus() {
    const connected = this.multiplayer?.getPeers().filter((peer) => peer.state === "connected") ?? [];
    const onlinePlayers = 1 + connected.length;
    const required = requiredSleepers(this.worldOptions, onlinePlayers);
    const rule = this.worldOptions.sleepRule === "any-player" ? "Any player"
      : this.worldOptions.sleepRule === "all-players" ? "All players"
        : `${this.worldOptions.sleepPercentage}% of players`;
    return { onlinePlayers, required, rule };
  }

  private applySleepTransition(target: SleepTarget) {
    const transition = nextSleepTransition(this.worldTime, this.day, target);
    this.worldTime = transition.worldTime;
    this.day = transition.day;
    this.sleepVotes.clear();
    this.audio.play("ui");
    this.events.onToast(target === "morning" ? `You wake at dawn on day ${this.day}.` : `You rest until dusk on day ${this.day}.`);
    this.saveSoon();
    this.emitHud(true);
    if (this.multiplayer?.role === "host") {
      try { this.multiplayer.sendTimeWeather({ tick: this.multiplayerTick, worldTime: this.worldTime, day: this.day, weather: this.weather }); }
      catch { /* A peer may disconnect while the vote resolves. */ }
    }
  }

  private evaluateSleepVotes(target: SleepTarget) {
    if (!this.multiplayer || this.multiplayer.role !== "host") return false;
    const connectedIds = this.multiplayer.getPeers()
      .filter((peer) => peer.state === "connected" && peer.identity)
      .map((peer) => peer.identity!.id);
    const onlineIds = new Set([this.multiplayer.identity.id, ...connectedIds]);
    for (const id of [...this.sleepVotes.keys()]) if (!onlineIds.has(id)) this.sleepVotes.delete(id);
    const votes = [...this.sleepVotes.entries()].filter(([id, vote]) => onlineIds.has(id) && vote === target).length;
    const required = requiredSleepers(this.worldOptions, onlineIds.size);
    if (votes >= required) {
      this.applySleepTransition(target);
      return true;
    }
    this.events.onToast(`Rest vote: ${votes}/${required} players chose ${target === "morning" ? "dawn" : "dusk"}.`);
    return false;
  }

  sleepUntil(target: SleepTarget) {
    if (target !== "morning" && target !== "night") return false;
    const connected = this.multiplayer?.getPeers().some((peer) => peer.state === "connected") ?? false;
    if (!this.multiplayer || !connected) {
      this.applySleepTransition(target);
      return true;
    }
    const vote: SleepVote = { actorId: this.multiplayer.identity.id, tick: this.multiplayerTick, target, active: true };
    this.sleepVotes.set(vote.actorId, target);
    try { this.multiplayer.sendSleepVote(vote); }
    catch (error) {
      this.multiplayerState.error = error instanceof Error ? error.message : String(error);
      return false;
    }
    if (this.multiplayer.role === "host") {
      this.evaluateSleepVotes(target);
      return true;
    }
    const status = this.getSleepStatus();
    this.events.onToast(`Rest vote sent. ${status.required} of ${status.onlinePlayers} players must choose the same destination.`);
    return true;
  }

  private handleRemoteSleepVote(vote: SleepVote, peer: PeerInfo) {
    if (!this.multiplayer) return;
    if (this.multiplayer.role === "host") {
      if (!peer.identity || vote.actorId !== peer.identity.id) return;
      if (vote.active) this.sleepVotes.set(vote.actorId, vote.target);
      else this.sleepVotes.delete(vote.actorId);
      try { this.multiplayer.sendSleepVote(vote); } catch { /* A vote remains valid if another guest disconnects. */ }
      this.evaluateSleepVotes(vote.target);
      return;
    }
    if (vote.active) this.sleepVotes.set(vote.actorId, vote.target);
    else this.sleepVotes.delete(vote.actorId);
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
      const special = key.startsWith("boat:") || key.startsWith("exhibit:");
      this.activeChestKey = special ? key : this.resolveChest(key);
      this.activeChestTitle = key.startsWith("boat:") ? "Wayfarer Cargo Hold"
        : key.startsWith("exhibit:") ? "Living Butterfly Conservatory"
          : this.activeChestKey.includes("|") ? "Large Wildwood Chest" : "Wildwood Chest";
      this.activeFurnaceKey = null;
      if (!special) this.showChestModel(key, this.activeChestKey.includes("|"));
    } else if (kind === "bestiary" || kind === "sleep" || kind === "pet") {
      this.activeFurnaceKey = null;
      this.activeChestKey = null;
    }
    this.pause();
    this.events.onOverlayRequest(kind, key);
    this.emitHud(true);
  }

  closeContainer() {
    if (this.cursor) {
      const leftover = this.addItem(this.cursor.item, this.cursor.count, this.cursor.durability, undefined, this.cursor.metadata);
      if (leftover > 0) this.spawnDrop(this.cursor.item, leftover, this.position.clone().add(new THREE.Vector3(0, 1, 0)), this.cursor.durability);
      this.cursor = null;
    }
    for (let index = 0; index < this.craftGrid.length; index += 1) {
      const slot = this.craftGrid[index];
      if (!slot) continue;
      const leftover = this.addItem(slot.item, slot.count, slot.durability, undefined, slot.metadata);
      if (leftover > 0) this.spawnDrop(slot.item, leftover, this.position.clone().add(new THREE.Vector3(0, 1, 0)), slot.durability);
      this.craftGrid[index] = null;
    }
    this.activeFurnaceKey = null;
    this.activeChestKey = null;
    this.activePet = null;
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

  addItem(
    item: ItemCode,
    count: number,
    durability?: number,
    emptyOrder: number[] = Array.from({ length: this.inventory.length }, (_, index) => index),
    metadata?: Record<string, unknown>,
  ) {
    if (!ITEMS[item] || count <= 0) return count;
    let remaining = count;
    const stackLimit = maxStack(item);
    if (stackLimit > 1) {
      for (const slot of this.inventory) {
        if (!slot || slot.item !== item || slot.count >= stackLimit || slot.durability !== durability
          || JSON.stringify(slot.metadata ?? null) !== JSON.stringify(metadata ?? null)) continue;
        const add = Math.min(remaining, stackLimit - slot.count);
        slot.count += add;
        remaining -= add;
        if (remaining <= 0) return 0;
      }
    }
    for (const index of emptyOrder) {
      if (index < 0 || index >= this.inventory.length) continue;
      if (this.inventory[index]) continue;
      const add = Math.min(remaining, stackLimit);
      this.inventory[index] = cloneSlot({ item, count: add, ...(durability !== undefined ? { durability } : {}), ...(metadata ? { metadata } : {}) });
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
    return Boolean(a && b && a.item === b.item && a.durability === b.durability
      && JSON.stringify(a.metadata ?? null) === JSON.stringify(b.metadata ?? null));
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
      destination[index] = cloneSlot(source);
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
    if (this.activeChestKey) {
      const chest = this.chests.get(this.activeChestKey);
      if (this.activeChestKey.startsWith("exhibit:") && !this.isButterflyJar(slot.item)) {
        this.events.onToast("The conservatory accepts only jarred butterflies.");
        return;
      }
      if (chest && this.activeChestKey.startsWith("exhibit:")) {
        for (let target = 0; target < chest.length && slot.count > 0; target += 1) {
          if (chest[target]) continue;
          chest[target] = cloneSlot({ ...slot, count: 1 });
          slot.count -= 1;
        }
        if (slot.count <= 0) this.inventory[index] = null;
        this.syncExhibitVisuals(true);
      } else if (chest && this.transferInto(slot, chest)) this.inventory[index] = null;
      this.saveSoon();
      return;
    }
    const equipmentSlot = ITEMS[slot.item]?.equipmentSlot;
    if (equipmentSlot && !this.equipment[equipmentSlot]) {
      this.equipment[equipmentSlot] = slot;
      this.inventory[index] = null;
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
      const leftover = this.addItem(slot.item, slot.count, slot.durability, MAIN_THEN_HOTBAR, slot.metadata);
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
      for (const pattern of recipePatterns(recipe)) {
        let matches = true;
        for (let y = 0; y < size && matches; y += 1) for (let x = 0; x < size; x += 1) {
          const inside = x >= minX && x <= maxX && y >= minY && y <= maxY;
          const slot = this.craftGrid[y * 3 + x];
          if (!inside && slot) { matches = false; break; }
          if (!inside) continue;
          const ingredient = pattern[(y - minY) * width + (x - minX)];
          if (ingredient === 0 ? Boolean(slot) : !slot || !this.ingredientMatches(slot.item, ingredient)) { matches = false; break; }
        }
        if (matches) return { recipe, pattern, minX, minY };
      }
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
      if (match.pattern[y * match.recipe.width + x] === 0) continue;
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

  planRecipe(recipeId: string): RecipePlanResult {
    const recipe = RECIPES.find((candidate) => candidate.id === recipeId);
    if (!recipe) {
      const result: RecipePlanResult = { ok: false, recipeId, reason: "unknown", message: "That recipe is no longer available." };
      this.events.onToast(result.message);
      return result;
    }
    if (recipe.table && this.craftingSize < 3) {
      const result: RecipePlanResult = { ok: false, recipeId, reason: "needs-table", message: "Open a crafting table to arrange this 3×3 recipe." };
      this.events.onToast(result.message);
      return result;
    }

    const inventory = this.inventory.map(cloneSlot);
    const craftGrid = this.craftGrid.map(cloneSlot);
    const available = (item: ItemCode) => [...inventory, ...craftGrid].reduce((total, slot) => total + (slot?.item === item ? slot.count : 0), 0);
    const reserved = new Map<ItemCode, number>();
    const arranged: Array<ItemCode | 0> = [];
    const missing: string[] = [];
    for (const ingredient of recipe.pattern) {
      if (ingredient === 0) {
        arranged.push(0);
        continue;
      }
      if (Array.isArray(ingredient)) {
        const choice = ingredient.find((item) => available(item) > (reserved.get(item) ?? 0));
        if (choice === undefined) {
          arranged.push(0);
          missing.push(ingredient.slice(0, 3).map(itemName).join(" or "));
        } else {
          arranged.push(choice);
          reserved.set(choice, (reserved.get(choice) ?? 0) + 1);
        }
      } else {
        arranged.push(ingredient);
        const needed = (reserved.get(ingredient) ?? 0) + 1;
        reserved.set(ingredient, needed);
        if (available(ingredient) < needed) missing.push(itemName(ingredient));
      }
    }
    if (missing.length) {
      const uniqueMissing = [...new Set(missing)];
      const result: RecipePlanResult = {
        ok: false,
        recipeId,
        reason: "missing",
        missing: uniqueMissing,
        message: `Missing: ${uniqueMissing.join(", ")}.`,
      };
      this.events.onToast(result.message);
      return result;
    }

    const removeOne = (item: ItemCode) => {
      for (const slots of [craftGrid, inventory]) {
        for (let index = slots.length - 1; index >= 0; index -= 1) {
          const slot = slots[index];
          if (!slot || slot.item !== item) continue;
          slot.count -= 1;
          if (slot.count <= 0) slots[index] = null;
          return true;
        }
      }
      return false;
    };
    for (const item of arranged) if (item !== 0) removeOne(item);

    for (const existing of craftGrid) {
      if (!existing) continue;
      const returning = cloneSlot(existing)!;
      if (!this.transferInto(returning, inventory)) {
        const result: RecipePlanResult = { ok: false, recipeId, reason: "inventory-full", message: "Make room in your pack before replacing the crafting grid." };
        this.events.onToast(result.message);
        return result;
      }
    }

    const nextGrid = Array.from({ length: 9 }, () => null as InventorySlot | null);
    for (let y = 0; y < recipe.height; y += 1) for (let x = 0; x < recipe.width; x += 1) {
      const item = arranged[y * recipe.width + x];
      if (item !== 0) nextGrid[y * 3 + x] = { item, count: 1 };
    }
    this.inventory = inventory;
    this.craftGrid = nextGrid;
    this.updateCraftResult();
    this.audio.play("ui");
    const result: RecipePlanResult = { ok: true, recipeId, message: `${recipe.name} arranged. Take the output when you are ready.` };
    this.events.onToast(result.message);
    this.saveSoon();
    this.emitHud(true);
    return result;
  }

  /** Compatibility alias; recipe-book actions now stage ingredients instead of crafting instantly. */
  autoCraft(recipeId: string) {
    return this.planRecipe(recipeId).ok;
  }

  isButterflyJar(item: ItemCode) {
    const kind = ITEMS[item]?.creatureKind;
    return Boolean(kind && BUTTERFLY_ORDER.includes(kind as ButterflyKind));
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
    if (machine === "chest" && this.activeChestKey?.startsWith("exhibit:") && this.cursor && !this.isButterflyJar(this.cursor.item)) {
      this.events.onToast("The conservatory accepts only jarred butterflies.");
      return;
    }
    const slot = slots[index];
    if (machine === "chest" && this.activeChestKey?.startsWith("exhibit:")) {
      if (shift && slot) {
        const leftover = this.addItem(slot.item, slot.count, slot.durability, MAIN_THEN_HOTBAR, slot.metadata);
        slot.count = leftover;
        if (leftover <= 0) slots[index] = null;
      } else if (!this.cursor && slot) {
        this.cursor = cloneSlot(slot);
        slots[index] = null;
      } else if (this.cursor && !slot) {
        slots[index] = cloneSlot({ ...this.cursor, count: 1 });
        this.cursor.count -= 1;
        if (this.cursor.count <= 0) this.cursor = null;
      } else if (this.cursor && slot) {
        if (this.cursor.count > 1) {
          this.events.onToast("Each habitat block shelters one butterfly; split the stack first.");
          return;
        }
        const previous = cloneSlot(slot);
        slots[index] = cloneSlot(this.cursor);
        this.cursor = previous;
      }
      this.syncExhibitVisuals(true);
      this.audio.play("ui");
      this.saveSoon();
      this.emitHud(true);
      return;
    }
    if (shift && slot) {
      const original = slot.count;
      const leftover = this.addItem(slot.item, slot.count, slot.durability, MAIN_THEN_HOTBAR, slot.metadata);
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
    const structureMarker = this.world.structureMarkerAt(x, y, z, "chest")?.[1] as ChestMarker | undefined;
    if (structureMarker) {
      structureMarker.loot.forEach((loot, index) => {
        const item = STRUCTURE_LOOT_ITEMS[loot.itemKey];
        if (item === undefined || index >= slots.length) return;
        slots[(index * 7 + 3) % slots.length] = {
          item,
          count: Math.max(1, loot.count),
          ...(loot.durability !== undefined ? { durability: loot.durability } : ITEMS[item]?.maxDurability ? { durability: ITEMS[item].maxDurability } : {}),
        };
      });
      return slots;
    }
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

  notifyLiquidChanged(x: number, y: number, z: number) {
    // Several deterministic engine harnesses construct a deliberately partial
    // engine with Object.create. Keep block placement usable in those harnesses
    // while the production constructor still always owns a simulator.
    this.liquidSimulator?.notifyBlockChanged({ x, y, z });
  }

  updateLiquids(dt: number) {
    this.liquidTickAccumulator += dt;
    if (this.liquidTickAccumulator < 0.08) return;
    this.liquidTickAccumulator %= 0.08;
    const changes = this.liquidSimulator.process(this.budgetController.current.liquidOperations);
    if (!changes.length) return;
    const edits = changes.map(({ position, next }) => ({
      x: position.x,
      y: position.y,
      z: position.z,
      type: next ? (next.kind === "water" ? BlockId.Water : BlockId.Lava) : BlockId.Air,
    }));
    this.publishBlockEdits(edits, "batch");
    this.saveSoon();
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
      const [x, y, z] = key.split(",").map(Number);
      const current = this.world.getBlock(x, y, z);
      if (current === undefined) { this.saplings.set(key, now + 30_000); continue; }
      processed += 1;
      if (current !== BlockId.WildwoodSapling) { this.saplings.delete(key); continue; }
      const soil = this.world.getBlock(x, y - 1, z);
      if (![BlockId.Grass, BlockId.Dirt, BlockId.SnowyGrass, BlockId.SavannaGrass, BlockId.SwampGrass, BlockId.Farmland].includes(soil ?? BlockId.Air)) {
        this.world.setBlock(x, y, z, BlockId.Air, true, true);
        this.publishBlockEdits([{ x, y, z, type: BlockId.Air }], "break");
        this.saplings.delete(key);
        if (this.mode === "survival") this.spawnDrop(BlockId.WildwoodSapling, 1, new THREE.Vector3(x, y, z));
        continue;
      }
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
      this.publishBlockEdits(changes, "batch");
      this.saplings.delete(key);
      if (this.position.distanceToSquared(new THREE.Vector3(x, y, z)) < 400) this.audio.play("place", log);
    }
    if (processed) this.saveSoon();
  }

  selectedSlot() {
    return this.inventory[this.selected];
  }

  pickTarget() {
    if (!this.target) return;
    const blockItem = isTorchBlock(this.target.type) ? BlockId.Torch
      : this.isBed(this.target.type) ? Item.WildwoodBed
        : this.isDoor(this.target.type) ? Item.WildwoodDoor
          : this.target.type as ItemCode;
    const slotIndex = this.inventory.slice(0, 9).findIndex((slot) => slot?.item === blockItem);
    if (slotIndex >= 0) this.selectSlot(slotIndex);
    else if (this.mode === "builder" && ITEMS[blockItem]) this.setCreativeItem(blockItem);
  }

  isDoor(type: BlockId) {
    return [
      BlockId.DoorClosedLower, BlockId.DoorClosedUpper, BlockId.DoorOpenLower, BlockId.DoorOpenUpper,
      BlockId.DoorXClosedLower, BlockId.DoorXClosedUpper, BlockId.DoorXOpenLower, BlockId.DoorXOpenUpper,
    ].includes(type);
  }

  isBed(type: BlockId) {
    return isBedBlock(type);
  }

  doorIsOpen(type: BlockId) {
    return [BlockId.DoorOpenLower, BlockId.DoorOpenUpper, BlockId.DoorXOpenLower, BlockId.DoorXOpenUpper].includes(type);
  }

  doorUsesXAxis(type: BlockId) {
    return [BlockId.DoorXClosedLower, BlockId.DoorXClosedUpper, BlockId.DoorXOpenLower, BlockId.DoorXOpenUpper].includes(type);
  }

  doorLowerY(type: BlockId, y: number) {
    return [BlockId.DoorClosedUpper, BlockId.DoorOpenUpper, BlockId.DoorXClosedUpper, BlockId.DoorXOpenUpper].includes(type) ? y - 1 : y;
  }

  toggleDoor(x: number, y: number, z: number, type: BlockId) {
    const lowerY = this.doorLowerY(type, y);
    const open = this.doorIsOpen(type);
    const xAxis = this.doorUsesXAxis(type);
    const closedLower = xAxis ? BlockId.DoorXClosedLower : BlockId.DoorClosedLower;
    const closedUpper = xAxis ? BlockId.DoorXClosedUpper : BlockId.DoorClosedUpper;
    const openLower = xAxis ? BlockId.DoorXOpenLower : BlockId.DoorOpenLower;
    const openUpper = xAxis ? BlockId.DoorXOpenUpper : BlockId.DoorOpenUpper;
    if (open && (this.playerIntersectsDoorCell(this.position, x, lowerY, z, closedLower) || this.playerIntersectsDoorCell(this.position, x, lowerY + 1, z, closedUpper))) {
      this.events.onToast("Step clear of the doorway before closing it.");
      this.placeCooldown = 0.18;
      return;
    }
    const edits = [
      { x, y: lowerY, z, type: open ? closedLower : openLower },
      { x, y: lowerY + 1, z, type: open ? closedUpper : openUpper },
    ];
    this.world.setBlocksBatch(edits, true, true);
    this.publishBlockEdits(edits, "batch");
    this.audio.play("place", BlockId.Planks);
    this.placeCooldown = 0.18;
    this.saveSoon();
  }

  useSelected() {
    if (this.placeCooldown > 0) return;
    const heldSlot = this.selectedSlot();
    const heldDefinition = heldSlot ? ITEMS[heldSlot.item] : null;
    if (this.targetBoat) {
      const boat = this.targetBoat;
      if (this.crouching) {
        const key = `boat:${boat.save.id}`;
        this.chests.set(key, boat.save.inventory);
        this.openOverlay("chest", key);
        return;
      }
      const playerId = this.localPlayerId();
      const passengers = boardSailboat(boat.save.passengers, playerId);
      if (!passengers.includes(playerId)) {
        this.events.onToast("Both Wayfarer seats are occupied.");
        return;
      }
      boat.save.passengers = passengers;
      this.mountedBoatId = boat.save.id;
      this.placeCooldown = 0.3;
      this.events.onToast(passengers.indexOf(playerId) === 0 ? "You take the tiller. Space dismounts." : "You settle into the passenger seat. Space dismounts.");
      this.saveSoon();
      return;
    }
    if (heldSlot?.item === Item.Sailboat) {
      const water = this.waterPlacementPoint();
      if (!water) {
        this.events.onToast("The Wayfarer needs a clear patch of water.");
        return;
      }
      if ([...this.boats.values()].some((boat) => boat.group.position.distanceToSquared(water) < 12)) {
        this.events.onToast("Give the other boat a little room.");
        return;
      }
      this.spawnSailboat(water);
      if (this.mode === "survival") {
        heldSlot.count -= 1;
        if (heldSlot.count <= 0) this.inventory[this.selected] = null;
      }
      this.placeCooldown = 0.45;
      this.heldUse = 1;
      this.audio.play("place", BlockId.Planks);
      this.events.onToast("Wayfarer launched. Right-click to board; crouch-right-click opens its hold.");
      this.saveSoon();
      this.emitHud(true);
      return;
    }
    if (heldSlot?.item === Item.CreatureCage) {
      const encoded = typeof heldSlot.metadata?.capturedCreature === "string" ? heldSlot.metadata.capturedCreature : null;
      if (encoded) {
        const captured = decodeCapturedCreature(encoded);
        if (!captured) {
          delete heldSlot.metadata?.capturedCreature;
          this.events.onToast("The cage record was damaged and has been cleared.");
          return;
        }
        const direction = this.camera.getWorldDirection(new THREE.Vector3());
        const releasePosition = this.target
          ? new THREE.Vector3(this.target.placeX, this.target.placeY + MOB_DEFS[captured.creature.kind].footOffset, this.target.placeZ)
          : this.position.clone().add(direction.setY(0).normalize().multiplyScalar(1.8));
        const ground = this.world.findWalkableY(Math.round(releasePosition.x), Math.round(releasePosition.z), releasePosition.y);
        releasePosition.y = ground + MOB_DEFS[captured.creature.kind].footOffset;
        const metadata = releaseCreature(captured);
        const petState = metadata.kind === "peelop" && metadata.custom.petState
          ? metadata.custom.petState as unknown as PeelopState : null;
        const mob = this.spawnMob(metadata.kind, releasePosition, {
          health: metadata.health,
          age: metadata.ageTicks / 20,
          petState,
          persistentPoiResident: Boolean(metadata.custom.persistentPoiResident),
          enclosed: Boolean(metadata.custom.enclosed),
        });
        mob.name = metadata.name || mob.name;
        heldSlot.metadata = undefined;
        this.placeCooldown = 0.35;
        this.events.onToast(`${mob.name} steps out with its exact health, age, and bond intact.`);
        this.saveSoon();
        this.emitHud(true);
        return;
      }
      if (!this.targetMob) {
        this.events.onToast("Aim the empty cage at a creature. Hostiles must be below half health or at one heart.");
        return;
      }
      const mob = this.targetMob;
      const metadata: CreatureMetadata = {
        schema: 1,
        entityId: String(mob.id),
        kind: mob.kind,
        health: mob.health,
        maxHealth: mob.maxHealth,
        ageTicks: Math.floor(mob.age * 20),
        baby: Boolean(mob.petState?.baby),
        temperament: mob.definition.temperament,
        hostile: mob.hostile,
        tamed: Boolean(mob.petState?.tamed),
        ownerId: mob.petState?.ownerId ?? null,
        name: mob.petState?.name ?? (mob.name !== mob.definition.name ? mob.name : null),
        geneticSeed: mob.petState?.geneticSeed ?? ((mob.id * 2654435761) >>> 0),
        command: mob.petState?.command ?? null,
        custom: JSON.parse(JSON.stringify({
          ...(mob.petState ? { petState: mob.petState } : {}),
          persistentPoiResident: mob.persistentPoiResident,
          enclosed: mob.enclosed,
        })) as CreatureMetadata["custom"],
      };
      const captured = captureCreature(`waykeeper-${Date.now().toString(36)}`, metadata);
      if (!captured) {
        this.events.onToast(`${mob.name} is fighting too strongly to cage.`);
        return;
      }
      heldSlot.metadata = {
        capturedCreature: encodeCapturedCreature(captured),
        name: metadata.name ?? mob.definition.name,
        kind: metadata.kind,
        tamed: metadata.tamed,
        baby: metadata.baby,
      };
      this.bestiary[mob.kind].seen = true;
      this.bestiary[mob.kind].captures += 1;
      const mobIndex = this.mobs.indexOf(mob);
      if (mobIndex >= 0) this.removeMob(mobIndex);
      this.placeCooldown = 0.4;
      this.audio.play("craft");
      this.events.onToast(`${metadata.name ?? mob.definition.name} is safely recorded in the Waykeeper Cage.`);
      this.saveSoon();
      this.emitHud(true);
      return;
    }
    if (this.targetMob?.kind === "peelop") {
      const pet = this.targetMob;
      const state = pet.petState ?? createPeelopState((pet.id * 2654435761) >>> 0);
      pet.petState = state;
      const food: PeelopFood | null = heldSlot?.item === Item.Banana ? "banana"
        : heldSlot?.item === Item.Apple ? "apple"
          : heldSlot?.item === Item.Berry ? "berry"
            : heldSlot?.item === Item.Wheat ? "wheat" : null;
      if (food && heldSlot) {
        const ownerId = this.localPlayerId();
        if (!state.tamed) {
          const result = tryTamePeelop(state, ownerId, food, Math.random());
          pet.petState = result.state;
          this.events.onToast(result.tamed ? "The Peelop's leaf-ears perk up. It has chosen you." : "The Peelop nibbles politely, but is not ready to follow.");
        } else {
          pet.petState = feedPeelop(state, food);
          const partner = this.mobs.find((candidate) => candidate !== pet && candidate.kind === "peelop" && candidate.petState
            && candidate.group.position.distanceToSquared(pet.group.position) < 25);
          const family = partner?.petState ? breedPeelops(pet.petState, partner.petState, ownerId) : null;
          if (family && partner) {
            pet.petState = family.left;
            partner.petState = family.right;
            this.spawnMob("peelop", pet.group.position.clone().add(new THREE.Vector3(0.65, 0, 0.35)), { petState: family.child });
            this.events.onToast("A tiny Peelip tumbles into the grove.");
          } else this.events.onToast(`${pet.petState.name ?? "Peelop"} is fed and recovering.`);
        }
        pet.health = pet.petState.health;
        pet.name = pet.petState.name || pet.definition.name;
        if (this.mode === "survival") {
          heldSlot.count -= 1;
          if (heldSlot.count <= 0) this.inventory[this.selected] = null;
        }
        this.placeCooldown = 0.35;
        this.saveSoon();
        this.emitHud(true);
        return;
      }
      if (state.tamed && state.ownerId === this.localPlayerId()) {
        this.activePet = pet;
        if (this.crouching) this.openOverlay("pet", String(pet.id));
        else {
          pet.petState = commandPeelop(state, this.localPlayerId(), state.command === "sit" ? "follow" : "sit");
          this.events.onToast(`${pet.petState.name ?? "Peelop"} will ${pet.petState.command}.`);
          this.saveSoon();
          this.emitHud(true);
        }
        return;
      }
    }
    if (heldSlot?.item === Item.SunwardCompass) {
      const markers = this.world.structureMarkersNear(this.position.x, this.position.y, this.position.z, 36)
        .filter(([, marker]) => marker.type === "landmark" || (marker.type === "chest" && !this.chests.has(blockKey(marker.position.x, marker.position.y, marker.position.z))))
        .sort(([, left], [, right]) => {
          const leftDistance = (left.position.x - this.position.x) ** 2 + (left.position.z - this.position.z) ** 2;
          const rightDistance = (right.position.x - this.position.x) ** 2 + (right.position.z - this.position.z) ** 2;
          return leftDistance - rightDistance;
        });
      const marker = markers[0]?.[1];
      if (!marker) this.events.onToast("The Sunward Compass is cool. No unopened reliquary or recorded landmark answers nearby.");
      else {
        const dx = marker.position.x - this.position.x;
        const dz = marker.position.z - this.position.z;
        const direction = Math.abs(dx) > Math.abs(dz) * 1.6 ? (dx > 0 ? "east" : "west")
          : Math.abs(dz) > Math.abs(dx) * 1.6 ? (dz > 0 ? "south" : "north")
            : `${dz > 0 ? "south" : "north"}-${dx > 0 ? "east" : "west"}`;
        this.events.onToast(`The compass pulses ${direction} · ${Math.round(Math.hypot(dx, dz))} blocks.`);
      }
      this.damageSelectedTool(1);
      this.heldUse = 1;
      this.placeCooldown = 0.55;
      this.audio.play("craft");
      this.emitHud(true);
      return;
    }
    if (heldSlot?.item === Item.StarrootScepter) {
      if (this.health < 10) this.health = Math.min(10, this.health + 2);
      this.damageSelectedTool(5);
      this.heldUse = 1;
      this.placeCooldown = 1.2;
      this.events.onToast("Starroot light knits the worst of your wounds.");
      this.audio.play("craft");
      this.emitHud(true);
      return;
    }
    if (heldSlot && heldDefinition?.useKind === "net") {
      const direction = new THREE.Vector3();
      this.camera.getWorldDirection(direction);
      const captured = this.butterflies.capture(this.camera.position, direction);
      this.heldUse = 1;
      this.placeCooldown = 0.28;
      this.damageSelectedTool();
      if (!captured) {
        this.events.onToast("The net swept through empty air. Try leading the butterfly.");
        this.audio.play("step", BlockId.TallGrass);
        return;
      }
      const leftover = this.addItem(captured.item, 1);
      if (leftover > 0) {
        const releasePosition = this.camera.position.clone().add(direction.multiplyScalar(1.2));
        this.butterflies.release(captured.kind, releasePosition);
        this.events.onToast("Your pack is full; the butterfly slipped free.");
      } else {
        this.events.onToast(`Captured ${MOB_DEFS[captured.kind].name}. Release it from its jar whenever you like.`);
        this.audio.play("craft");
      }
      this.saveSoon();
      this.emitHud(true);
      return;
    }
    if (heldSlot && heldDefinition?.useKind === "release-creature" && heldDefinition.creatureKind
      && BUTTERFLY_ORDER.includes(heldDefinition.creatureKind as ButterflyKind)) {
      const direction = new THREE.Vector3();
      this.camera.getWorldDirection(direction);
      const releasePosition = this.target
        ? new THREE.Vector3(this.target.placeX, this.target.placeY + 0.55, this.target.placeZ)
        : this.camera.position.clone().add(direction.multiplyScalar(1.4));
      const kind = heldDefinition.creatureKind as ButterflyKind;
      if (!this.butterflies.release(kind, releasePosition)) {
        this.events.onToast("That butterfly needs a little clear air before leaving the jar.");
        return;
      }
      if (this.mode === "survival") {
        heldSlot.count -= 1;
        if (heldSlot.count <= 0) this.inventory[this.selected] = null;
      }
      this.heldUse = 1;
      this.placeCooldown = 0.25;
      this.audio.play("place", BlockId.RedFlower);
      this.events.onToast(`${MOB_DEFS[kind].name} returned to the wild.`);
      this.saveSoon();
      this.emitHud(true);
      return;
    }
    if (this.target) {
      const key = blockKey(this.target.x, this.target.y, this.target.z);
      if (this.isDoor(this.target.type)) { this.toggleDoor(this.target.x, this.target.y, this.target.z, this.target.type); return; }
      if (this.isBed(this.target.type)) { this.openOverlay("sleep", key); return; }
      if (this.target.type === BlockId.CraftingTable) { this.openOverlay("crafting", key); return; }
      if (this.target.type === BlockId.Furnace) { this.openOverlay("furnace", key); return; }
      if (this.target.type === BlockId.Chest) { this.openOverlay("chest", key); return; }
      if (this.target.type === BlockId.ButterflyExhibit) { this.openExhibit(this.target.x, this.target.y, this.target.z); return; }
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
    const requestedType = itemDefinition?.placeBlock;
    if (requestedType === undefined) return;
    const replacesTarget = BLOCKS[this.target.type]?.replaceable;
    const x = replacesTarget ? this.target.x : this.target.placeX;
    const y = replacesTarget ? this.target.y : this.target.placeY;
    const z = replacesTarget ? this.target.z : this.target.placeZ;
    if (y < MIN_Y || y > MAX_Y) return;
    const current = this.world.getBlock(x, y, z);
    let replacedUpper: BlockId | undefined;
    let replacedPartner: BlockId | undefined;
    let type = requestedType;
    let placedEdits: Array<{ x: number; y: number; z: number; type: BlockId }>;
    if (current === undefined || (!BLOCKS[current]?.replaceable && current !== BlockId.Air)) return;
    if (requestedType === BlockId.ButterflyExhibit) {
      const connectedBlocks = new Set<string>();
      for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
        const topology = this.exhibitTopologyAt(x + dx, y + dy, z + dz);
        for (const block of topology?.blocks ?? []) connectedBlocks.add(block.key);
      }
      if (connectedBlocks.size >= 20) {
        this.events.onToast("A conservatory reaches its natural limit at 20 connected habitat blocks.");
        return;
      }
    }
    if (requestedType === BlockId.Torch) {
      const orientedTorch = torchBlockForPlacement(this.target, replacesTarget);
      if (orientedTorch === null) {
        this.events.onToast("Torches attach to floors or walls, not ceilings.");
        return;
      }
      type = orientedTorch;
      const support = type === BlockId.Torch ? [x, y - 1, z]
        : type === BlockId.TorchWallNorth ? [x, y, z + 1]
          : type === BlockId.TorchWallSouth ? [x, y, z - 1]
            : type === BlockId.TorchWallEast ? [x - 1, y, z]
              : [x + 1, y, z];
      const supportType = this.world.getBlock(support[0], support[1], support[2]);
      if (!BLOCKS[supportType ?? BlockId.Air]?.solid) {
        this.events.onToast("A torch needs a solid floor or wall.");
        return;
      }
    }
    if (type === BlockId.WildwoodSapling) {
      const soil = this.world.getBlock(x, y - 1, z);
      if (![BlockId.Grass, BlockId.Dirt, BlockId.SnowyGrass, BlockId.SavannaGrass, BlockId.SwampGrass, BlockId.Farmland].includes(soil ?? BlockId.Air)) {
        this.events.onToast("Saplings need living soil.");
        return;
      }
    }
    if (requestedType === BlockId.BedNorthFoot) {
      const bed = bedPlacementForYaw(this.yaw);
      const headX = x + bed.dx;
      const headZ = z + bed.dz;
      const partner = this.world.getBlock(headX, y, headZ);
      replacedPartner = partner;
      const footSupport = this.world.getBlock(x, y - 1, z);
      const headSupport = this.world.getBlock(headX, y - 1, headZ);
      if (partner === undefined || (!BLOCKS[partner]?.replaceable && partner !== BlockId.Air)
        || !BLOCKS[footSupport ?? BlockId.Air]?.solid || !BLOCKS[headSupport ?? BlockId.Air]?.solid) {
        this.events.onToast("A bed needs two clear blocks on solid ground.");
        return;
      }
      type = bed.foot;
      placedEdits = [
        { x, y, z, type: bed.foot },
        { x: headX, y, z: headZ, type: bed.head },
      ];
      this.world.setBlocksBatch(placedEdits, true, true);
    } else if (type === BlockId.DoorClosedLower) {
      const upper = this.world.getBlock(x, y + 1, z);
      replacedUpper = upper;
      const support = this.world.getBlock(x, y - 1, z);
      if (y + 1 > MAX_Y || upper === undefined || (!BLOCKS[upper]?.replaceable && upper !== BlockId.Air) || !BLOCKS[support ?? BlockId.Air]?.solid) {
        this.events.onToast("A door needs two clear blocks and solid ground.");
        return;
      }
      const xAxis = Math.abs(Math.sin(this.yaw)) > Math.abs(Math.cos(this.yaw));
      placedEdits = [
        { x, y, z, type: xAxis ? BlockId.DoorXClosedLower : BlockId.DoorClosedLower },
        { x, y: y + 1, z, type: xAxis ? BlockId.DoorXClosedUpper : BlockId.DoorClosedUpper },
      ];
      this.world.setBlocksBatch(placedEdits, true, true);
    } else {
      placedEdits = [{ x, y, z, type }];
      this.world.setBlock(x, y, z, type, true, true);
    }
    if (BLOCKS[type].solid && this.collidesAt(this.position)) {
      if (requestedType === BlockId.BedNorthFoot) {
        const partner = placedEdits[1];
        this.world.setBlocksBatch([{ x, y, z, type: current ?? BlockId.Air }, { x: partner.x, y: partner.y, z: partner.z, type: replacedPartner ?? BlockId.Air }], true, true);
      } else if (type === BlockId.DoorClosedLower) this.world.setBlocksBatch([{ x, y, z, type: current ?? BlockId.Air }, { x, y: y + 1, z, type: replacedUpper ?? BlockId.Air }], true, true);
      else this.world.setBlock(x, y, z, current ?? BlockId.Air, true, true);
      this.events.onToast("You cannot place a block inside yourself.");
      return;
    }
    this.publishBlockEdits(placedEdits, placedEdits.length > 1 ? "batch" : "place");
    for (const edit of placedEdits) this.notifyLiquidChanged(edit.x, edit.y, edit.z);
    if (type === BlockId.Chest) this.chests.set(blockKey(x, y, z), Array.from({ length: 27 }, () => null));
    if (type === BlockId.Furnace) this.furnaces.set(blockKey(x, y, z), blankFurnace());
    if (type === BlockId.ButterflyExhibit) {
      const topology = this.exhibitTopologyAt(x, y, z);
      if (topology) this.consolidateExhibit(topology);
      this.syncExhibitVisuals(true);
    }
    if (type === BlockId.WildwoodSapling) this.saplings.set(blockKey(x, y, z), Date.now() + 75_000 + Math.random() * 75_000);
    if (isEnvironmentLightBlock(type)) this.lightRefreshTimer = 0;
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
    const logs = new Map<string, [number, number, number]>();
    let bottom = y;
    let top = y;
    while (bottom > y - 16 && this.world.getBlock(x, bottom - 1, z) === type) bottom -= 1;
    while (top < y + 16 && this.world.getBlock(x, top + 1, z) === type) top += 1;
    for (let trunkY = bottom; trunkY <= top; trunkY += 1) logs.set(blockKey(x, trunkY, z), [x, trunkY, z]);
    if (logs.size < 3) return false;
    const soil = this.world.getBlock(x, bottom - 1, z);
    if (![BlockId.Grass, BlockId.Dirt, BlockId.SnowyGrass, BlockId.SavannaGrass, BlockId.SwampGrass, BlockId.Farmland].includes(soil ?? BlockId.Air)) return false;
    const leaves = new Map<string, [number, number, number]>();
    for (let dx = -3; dx <= 3 && leaves.size < 180; dx += 1) for (let dy = -3; dy <= 3 && leaves.size < 180; dy += 1) for (let dz = -3; dz <= 3 && leaves.size < 180; dz += 1) {
      if (Math.abs(dx) + Math.abs(dy) + Math.abs(dz) > 6) continue;
      const candidate: [number, number, number] = [x + dx, top + dy, z + dz];
      if (this.world.getBlock(...candidate) !== leafType) continue;
      const ownDistance = dx * dx + dz * dz;
      let nearerTrunk = false;
      for (let ox = -3; ox <= 3 && !nearerTrunk; ox += 1) for (let oz = -3; oz <= 3 && !nearerTrunk; oz += 1) {
        if (ox === 0 && oz === 0 || (dx - ox) ** 2 + (dz - oz) ** 2 >= ownDistance) continue;
        for (let trunkY = bottom; trunkY <= top + 2; trunkY += 1) if (this.world.getBlock(x + ox, trunkY, z + oz) === type) { nearerTrunk = true; break; }
      }
      if (!nearerTrunk) leaves.set(blockKey(...candidate), candidate);
    }
    if (leaves.size < 8) return false;
    const root = [...logs.values()].sort((a, b) => a[1] - b[1])[0];
    const changes = [...logs.values(), ...leaves.values()].map(([bx, by, bz]) => ({ x: bx, y: by, z: bz, type: BlockId.Air }));
    this.world.setBlocksBatch(changes, true, true);
    this.publishBlockEdits(changes, "batch");
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
    if (this.persistent) window.clearTimeout(this.saveTimer);
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
        this.saveSoon();
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
    const exhibitTopology = type === BlockId.ButterflyExhibit ? this.exhibitTopologyAt(x, y, z) : null;
    const exhibitSlots = exhibitTopology
      ? (this.chests.get(this.consolidateExhibit(exhibitTopology)) ?? []).map(cloneSlot)
      : null;
    if (this.tryFellTree(x, y, z, type)) {
      this.miningProgress = 0;
      this.target = null;
      this.emitHud(true);
      return;
    }
    const harvested = this.toolCanHarvest(type, this.selectedSlot());
    let brokenEdits: Array<{ x: number; y: number; z: number; type: BlockId }>;
    if (this.isDoor(type)) {
      const lowerY = this.doorLowerY(type, y);
      brokenEdits = [{ x, y: lowerY, z, type: BlockId.Air }, { x, y: lowerY + 1, z, type: BlockId.Air }];
      this.world.setBlocksBatch(brokenEdits, true, true);
    } else if (this.isBed(type)) {
      const partner = bedCounterpart(type, x, y, z);
      brokenEdits = [{ x, y, z, type: BlockId.Air }];
      if (partner && this.world.getBlock(partner.x, partner.y, partner.z) === partner.type) brokenEdits.push({ x: partner.x, y: partner.y, z: partner.z, type: BlockId.Air });
      this.world.setBlocksBatch(brokenEdits, true, true);
    } else {
      brokenEdits = [{ x, y, z, type: BlockId.Air }];
      this.world.setBlock(x, y, z, BlockId.Air, true, true);
    }
    for (const edit of brokenEdits) this.breakUnsupportedAround(edit.x, edit.y, edit.z);
    for (const edit of brokenEdits) this.notifyLiquidChanged(edit.x, edit.y, edit.z);
    this.publishBlockEdits(brokenEdits, brokenEdits.length > 1 ? "batch" : "break");
    if (this.mode === "survival") {
      if (harvested) {
        if (!this.isDoor(type) && !this.isBed(type)) this.dropBlockLoot(isTorchBlock(type) ? BlockId.Torch : type, x, y, z);
      } else this.events.onToast(`${BLOCKS[type].name} crumbled without the right tool.`);
      this.damageSelectedTool();
    }
    const key = blockKey(x, y, z);
    if (isEnvironmentLightBlock(type)) this.lightRefreshTimer = 0;
    if (type === BlockId.WildwoodSapling) this.saplings.delete(key);
    if (this.isDoor(type) && this.mode === "survival") this.spawnDrop(Item.WildwoodDoor, 1, new THREE.Vector3(x, y + 0.3, z));
    if (this.isBed(type) && this.mode === "survival" && harvested) this.spawnDrop(Item.WildwoodBed, 1, new THREE.Vector3(x, y + 0.3, z));
    if (type === BlockId.Furnace) {
      const furnace = this.furnaces.get(key);
      if (furnace) for (const slot of [furnace.input, furnace.fuel, furnace.output]) if (slot) this.spawnDrop(slot.item, slot.count, new THREE.Vector3(x, y + 0.5, z), slot.durability, slot.metadata);
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
        for (const slot of removed) if (slot) this.spawnDrop(slot.item, slot.count, new THREE.Vector3(x, y + 0.5, z), slot.durability, slot.metadata);
        this.chests.delete(storageKey);
        const other = blocks[half === 0 ? 1 : 0];
        this.chests.set(other, remaining);
      } else {
        for (const slot of chest) if (slot) this.spawnDrop(slot.item, slot.count, new THREE.Vector3(x, y + 0.5, z), slot.durability, slot.metadata);
        this.chests.delete(storageKey);
      }
    }
    if (type === BlockId.ButterflyExhibit && exhibitTopology && exhibitSlots) {
      this.rebuildExhibitAfterBreak(exhibitTopology, exhibitSlots, { x, y, z });
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
      this.targetBoat = null;
      this.selection.visible = false;
      return;
    }
    const direction = this.cameraMode === "first"
      ? this.camera.getWorldDirection(new THREE.Vector3())
      : new THREE.Vector3(
        -Math.sin(this.yaw) * Math.cos(this.pitch),
        Math.sin(this.pitch),
        -Math.cos(this.yaw) * Math.cos(this.pitch),
      ).normalize();
    const interactionOrigin = this.cameraMode === "first"
      ? this.camera.position
      : this.cameraCollisionOrigin.set(this.position.x, this.position.y + this.cameraEyeHeight, this.position.z);
    const blockHit = this.castVoxel(interactionOrigin, direction, 6);
    const mobHit = this.castMob(interactionOrigin, direction, 5);
    const boatHit = this.castBoat(interactionOrigin, direction, 6);
    const nearestEntityDistance = Math.min(mobHit?.distance ?? Infinity, boatHit?.distance ?? Infinity);
    const entityVisible = !blockHit || nearestEntityDistance < blockHit.distance;
    this.targetBoat = entityVisible && boatHit && boatHit.distance <= (mobHit?.distance ?? Infinity) ? boatHit.boat : null;
    this.targetMob = entityVisible && !this.targetBoat && mobHit ? mobHit.mob : null;
    if (this.targetMob && !this.bestiary[this.targetMob.kind].seen) { this.bestiary[this.targetMob.kind].seen = true; this.saveSoon(); }
    this.target = this.targetMob || this.targetBoat ? null : blockHit;
    const nextKey = this.target ? blockKey(this.target.x, this.target.y, this.target.z)
      : this.targetMob ? `mob:${this.targetMob.id}`
        : this.targetBoat ? `boat:${this.targetBoat.save.id}` : "";
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
    if (this.mountedBoatId) {
      this.fallVelocity = 0;
      this.velocity.set(0, 0, 0);
      this.grounded = true;
      return;
    }
    const forwardAmount = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
    const rightAmount = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
    const moving = forwardAmount !== 0 || rightAmount !== 0;
    const feetBlock = this.world.getBlock(Math.floor(this.position.x + 0.5), Math.floor(this.position.y + 0.6), Math.floor(this.position.z + 0.5));
    const headBlock = this.world.getBlock(Math.floor(this.position.x + 0.5), Math.floor(this.position.y + this.cameraEyeHeight + 0.5), Math.floor(this.position.z + 0.5));
    const inWater = feetBlock === BlockId.Water;
    const inLava = feetBlock === BlockId.Lava;
    const inLiquid = inWater || inLava;
    this.headSubmerged = headBlock === BlockId.Water;
    if (inWater && !this.wasInWater) this.audio.play("splash");
    this.wasInWater = inWater;
    const wantsCrouch = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight");
    if (wantsCrouch) this.crouching = true;
    else if (!this.collidesAt(this.position, PLAYER_HEIGHT)) this.crouching = false;
    const wantsSprint = this.keys.has("ControlLeft") || this.keys.has("ControlRight") || (this.sprintLatched && forwardAmount > 0);
    this.sprinting = forwardAmount > 0 && moving && wantsSprint && !this.crouching && this.hunger > 0.5 && !inLiquid;
    const speed = (this.crouching ? 2.15 : this.sprinting ? 6.35 : 4.35) * (inLiquid ? 0.55 : 1);
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

    if (inWater) {
      this.fallVelocity = 0;
      const bankX = Math.round(this.position.x - Math.sin(this.yaw) * 0.62);
      const bankZ = Math.round(this.position.z - Math.cos(this.yaw) * 0.62);
      const bankY = Math.floor(this.position.y + 0.6);
      const bankType = this.world.getBlock(bankX, bankY, bankZ);
      const bankHead = this.world.getBlock(bankX, bankY + 1, bankZ);
      const horizontalCollision = Boolean(BLOCKS[bankType ?? BlockId.Air]?.solid) && !BLOCKS[bankHead ?? BlockId.Bedrock]?.solid;
      const hasBreatherCharm = this.countItem(Item.BreatherCharm) > 0;
      const swim = stepSwimming(
        { velocityY: this.velocity.y, oxygenSeconds: this.oxygenSeconds, drowningAccumulator: this.drowningAccumulator },
        { jumpHeld: this.keys.has("Space"), movingForward: forwardAmount > 0 },
        {
          submersion: this.headSubmerged ? 1 : 0.68,
          headSubmerged: this.headSubmerged,
          horizontalCollision,
          shoreLedgeHeight: horizontalCollision ? 1 : undefined,
          surfaceGap: this.headSubmerged ? 0.25 : 0.72,
        },
        dt,
        hasBreatherCharm ? { ...DEFAULT_SWIM_RULES, maxOxygenSeconds: 24 } : DEFAULT_SWIM_RULES,
      );
      this.velocity.y = swim.state.velocityY;
      this.oxygenSeconds = swim.state.oxygenSeconds;
      this.drowningAccumulator = swim.state.drowningAccumulator;
      if (swim.damage > 0 && this.mode === "survival") this.damagePlayer(swim.damage, "drowning", true);
    } else if (inLava) {
      this.fallVelocity = 0;
      this.velocity.y -= 5 * dt;
      this.velocity.y *= Math.max(0, 1 - 2.4 * dt);
      if (this.keys.has("Space")) this.velocity.y += 9.5 * dt;
    } else {
      const maxOxygen = this.countItem(Item.BreatherCharm) > 0 ? 24 : DEFAULT_SWIM_RULES.maxOxygenSeconds;
      this.oxygenSeconds = Math.min(maxOxygen, this.oxygenSeconds + DEFAULT_SWIM_RULES.oxygenRecoveryPerSecond * dt);
      this.drowningAccumulator = 0;
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
    this.groundProbe.set(this.position.x, this.position.y - 0.055, this.position.z);
    this.grounded = this.collidesAt(this.groundProbe);
    if (!wasGrounded && this.grounded && !inLiquid) {
      this.audio.play("land", this.blockUnderfoot());
      if (this.mode === "survival" && this.fallVelocity < -11.2) this.damagePlayer(Math.min(6, Math.max(1, Math.floor((-this.fallVelocity - 9) / 2))), "the fall", true);
      this.fallVelocity = 0;
    }
    if (this.position.y < MIN_Y - 8) this.respawn(true);

    const horizontalTravel = Math.hypot(this.position.x - this.lastPosition.x, this.position.z - this.lastPosition.z);
    if (this.grounded && moving && !inLiquid) {
      this.footstepDistance += horizontalTravel;
      if (this.footstepDistance > (this.sprinting ? 1.45 : this.crouching ? 2.25 : 1.85)) { this.footstepDistance = 0; this.audio.play("step", this.blockUnderfoot()); }
    }
    this.lastPosition.copy(this.position);

    if (this.mode === "survival") {
      const peaceful = this.worldOptions.difficulty === "peaceful";
      this.hunger = peaceful
        ? Math.min(10, this.hunger + dt * 0.08)
        : Math.max(0, this.hunger - dt * (this.sprinting ? 0.009 : 0.0024));
      this.regenTimer += dt;
      if (this.hunger >= 8 && this.health < 10 && this.regenTimer > (peaceful ? 2.5 : 5)) { this.health += 1; if (!peaceful) this.hunger = Math.max(0, this.hunger - 0.35); this.regenTimer = 0; }
      if (!peaceful && this.hunger <= 0 && this.regenTimer > 4) { this.damagePlayer(1, "hunger", true); this.regenTimer = 0; }
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
      const candidate = this.collisionCandidate.set(this.position.x + sx, this.position.y + sy, this.position.z + sz);
      const edgeBlocked = this.crouching && this.grounded && !dy
        && !this.collidesAt(this.collisionSupport.set(candidate.x, candidate.y - 0.12, candidate.z), this.currentPlayerHeight());
      if (!this.collidesAt(candidate) && !edgeBlocked) this.position.copy(candidate);
      else {
        if (dx) this.velocity.x = 0;
        if (dy) this.velocity.y = 0;
        if (dz) this.velocity.z = 0;
        break;
      }
    }
  }

  currentPlayerHeight() {
    return this.crouching ? CROUCH_HEIGHT : PLAYER_HEIGHT;
  }

  collidesAt(position: THREE.Vector3, height = this.currentPlayerHeight()) {
    const minX = Math.floor(position.x - PLAYER_RADIUS + 0.5);
    const maxX = Math.floor(position.x + PLAYER_RADIUS - 0.001 + 0.5);
    const minY = Math.floor(position.y + 0.5);
    const maxY = Math.floor(position.y + height - 0.001 + 0.5);
    const minZ = Math.floor(position.z - PLAYER_RADIUS + 0.5);
    const maxZ = Math.floor(position.z + PLAYER_RADIUS - 0.001 + 0.5);
    for (let x = minX; x <= maxX; x += 1) for (let y = minY; y <= maxY; y += 1) for (let z = minZ; z <= maxZ; z += 1) {
      const type = this.world.getBlock(x, y, z);
      if (type === undefined) return true;
      if (this.isDoor(type)) {
        if (this.playerIntersectsDoorCell(position, x, y, z, type, height)) return true;
        continue;
      }
      if (BLOCKS[type]?.solid) return true;
    }
    return false;
  }

  playerIntersectsDoorCell(position: THREE.Vector3, x: number, y: number, z: number, type: BlockId, height = this.currentPlayerHeight()) {
    const open = this.doorIsOpen(type);
    const planeAlongZ = this.doorUsesXAxis(type) !== open;
    const playerMinX = position.x - PLAYER_RADIUS;
    const playerMaxX = position.x + PLAYER_RADIUS;
    const playerMinY = position.y;
    const playerMaxY = position.y + height;
    const playerMinZ = position.z - PLAYER_RADIUS;
    const playerMaxZ = position.z + PLAYER_RADIUS;
    const slabMinX = planeAlongZ ? x + (open ? -0.5 : -0.08) : x - 0.48;
    const slabMaxX = planeAlongZ ? x + (open ? -0.34 : 0.08) : x + 0.48;
    const slabMinZ = planeAlongZ ? z - 0.48 : z + (open ? -0.5 : -0.08);
    const slabMaxZ = planeAlongZ ? z + 0.48 : z + (open ? -0.34 : 0.08);
    return playerMaxX > slabMinX && playerMinX < slabMaxX
      && playerMaxY > y - 0.5 && playerMinY < y + 0.5
      && playerMaxZ > slabMinZ && playerMinZ < slabMaxZ;
  }

  breakUnsupportedAbove(x: number, y: number, z: number) {
    const aboveY = y + 1;
    const above = this.world.getBlock(x, aboveY, z);
    if (above === undefined) return;
    if ([BlockId.DoorClosedLower, BlockId.DoorOpenLower, BlockId.DoorXClosedLower, BlockId.DoorXOpenLower].includes(above)) {
      const edits = [{ x, y: aboveY, z, type: BlockId.Air }, { x, y: aboveY + 1, z, type: BlockId.Air }];
      this.world.setBlocksBatch(edits, true, true);
      this.publishBlockEdits(edits, "batch");
      if (this.mode === "survival") this.spawnDrop(Item.WildwoodDoor, 1, new THREE.Vector3(x, aboveY, z));
      return;
    }
    if (this.isBed(above)) {
      const partner = bedCounterpart(above, x, aboveY, z);
      const edits = [{ x, y: aboveY, z, type: BlockId.Air }];
      if (partner && this.world.getBlock(partner.x, partner.y, partner.z) === partner.type) edits.push({ x: partner.x, y: partner.y, z: partner.z, type: BlockId.Air });
      this.world.setBlocksBatch(edits, true, true);
      this.publishBlockEdits(edits, "batch");
      if (this.mode === "survival") this.spawnDrop(Item.WildwoodBed, 1, new THREE.Vector3(x, aboveY, z));
      return;
    }
    if (BLOCKS[above]?.shape !== "cross" && above !== BlockId.Torch) return;
    this.world.setBlock(x, aboveY, z, BlockId.Air, true, true);
    this.publishBlockEdits([{ x, y: aboveY, z, type: BlockId.Air }], "break");
    if (above === BlockId.WildwoodSapling) this.saplings.delete(blockKey(x, aboveY, z));
    if (this.mode === "survival") this.dropBlockLoot(above, x, aboveY, z);
  }

  castBoat(origin: THREE.Vector3, direction: THREE.Vector3, reach: number) {
    this.boatRaycaster.set(origin, direction);
    this.boatRaycaster.far = reach;
    const intersection = this.boatRaycaster.intersectObjects(this.boatGroup.children, true)[0];
    if (!intersection) return null;
    let object: THREE.Object3D | null = intersection.object;
    while (object && typeof object.userData.boatId !== "string") object = object.parent;
    const boat = object ? this.boats.get(object.userData.boatId as string) : null;
    return boat ? { boat, distance: intersection.distance } : null;
  }

  breakUnsupportedAround(x: number, y: number, z: number) {
    this.breakUnsupportedAbove(x, y, z);
    const wallTorches: Array<{ x: number; y: number; z: number; type: BlockId }> = [
      { x: x + 1, y, z, type: BlockId.TorchWallEast },
      { x: x - 1, y, z, type: BlockId.TorchWallWest },
      { x, y, z: z + 1, type: BlockId.TorchWallSouth },
      { x, y, z: z - 1, type: BlockId.TorchWallNorth },
    ];
    for (const torch of wallTorches) {
      if (this.world.getBlock(torch.x, torch.y, torch.z) !== torch.type) continue;
      this.world.setBlock(torch.x, torch.y, torch.z, BlockId.Air, true, true);
      this.publishBlockEdits([{ x: torch.x, y: torch.y, z: torch.z, type: BlockId.Air }], "break");
      if (this.mode === "survival") this.spawnDrop(BlockId.Torch, 1, new THREE.Vector3(torch.x, torch.y + 0.25, torch.z));
      this.lightRefreshTimer = 0;
    }
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
    const difficulty = this.worldOptions?.difficulty ?? DEFAULT_WORLD_OPTIONS.difficulty;
    const difficultyScale = difficulty === "hard" ? 1.35 : difficulty === "easy" ? 0.75 : difficulty === "peaceful" ? 0.6 : 1;
    const finalAmount = Math.max(0.5, Math.round(amount * difficultyScale * (1 - reduction) * 2) / 2);
    this.health -= finalAmount;
    if (armor > 0 && !bypassArmor) this.damageArmor();
    this.playerInvulnerability = 0.7;
    this.audio.play("hurt");
    this.events.onToast(`${source[0].toUpperCase()}${source.slice(1)} cost ${finalAmount} ${finalAmount === 1 ? "heart" : "hearts"}.`);
    if (this.health <= 0) this.respawn(true);
  }

  respawn(announce: boolean) {
    const deathPosition = this.position.clone().add(new THREE.Vector3(0, 0.55, 0));
    const lostInventory = announce && this.mode === "survival" && !this.worldOptions.keepInventory;
    if (lostInventory) {
      for (const slot of this.inventory) if (slot) this.spawnDrop(slot.item, slot.count, deathPosition, slot.durability, slot.metadata);
      for (const slot of Object.values(this.equipment)) if (slot) this.spawnDrop(slot.item, slot.count, deathPosition, slot.durability, slot.metadata);
      this.inventory = blankInventory();
      this.equipment = blankEquipment();
    }
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
      this.events.onToast(lostInventory
        ? "The wild carried you home. Your dropped pack remains where you fell."
        : "The wild carried you home—with your inventory intact.");
    }
    this.saveSoon();
    this.emitHud(true);
  }

  renameActivePet(name: string) {
    const pet = this.activePet;
    if (!pet?.petState || pet.kind !== "peelop" || pet.petState.ownerId !== this.localPlayerId()) return false;
    pet.petState = renamePeelop(pet.petState, name);
    pet.name = pet.petState.name || pet.definition.name;
    this.events.onToast(`${pet.name} will answer to that name.`);
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  commandActivePet(command: PeelopCommand) {
    const pet = this.activePet;
    if (!pet?.petState || pet.kind !== "peelop") return false;
    const next = commandPeelop(pet.petState, this.localPlayerId(), command);
    if (next === pet.petState) return false;
    pet.petState = next;
    this.events.onToast(`${pet.petState.name ?? "Peelop"} will ${command}.`);
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  localPlayerId() {
    return this.multiplayer?.identity.id ?? "local";
  }

  restoreSailboat(value: Partial<SailboatSave>) {
    const save = normalizeSailboatSave(value, `wayfarer-${this.nextBoatId++}`);
    if (this.boats.has(save.id)) return this.boats.get(save.id)!;
    const group = createSailboatVisual(save.id);
    group.position.set(save.x, save.y, save.z);
    group.rotation.y = save.yaw;
    this.boatGroup.add(group);
    const entity = { save, group };
    this.boats.set(save.id, entity);
    this.chests.set(`boat:${save.id}`, save.inventory);
    return entity;
  }

  waterPlacementPoint(reach = 6) {
    const origin = this.cameraMode === "first"
      ? this.camera.position.clone()
      : new THREE.Vector3(this.position.x, this.position.y + this.cameraEyeHeight, this.position.z);
    const direction = this.cameraMode === "first"
      ? this.camera.getWorldDirection(new THREE.Vector3())
      : new THREE.Vector3(-Math.sin(this.yaw) * Math.cos(this.pitch), Math.sin(this.pitch), -Math.cos(this.yaw) * Math.cos(this.pitch)).normalize();
    for (let distance = 0.5; distance <= reach; distance += 0.2) {
      const point = origin.clone().addScaledVector(direction, distance);
      const x = Math.floor(point.x + 0.5);
      const y = Math.floor(point.y + 0.5);
      const z = Math.floor(point.z + 0.5);
      if (this.world.getBlock(x, y, z) !== BlockId.Water) continue;
      let surfaceY = y;
      while (surfaceY < MAX_Y && this.world.getBlock(x, surfaceY + 1, z) === BlockId.Water) surfaceY += 1;
      return new THREE.Vector3(x, surfaceY + 0.58, z);
    }
    return null;
  }

  spawnSailboat(position: THREE.Vector3) {
    const id = `wayfarer-${Date.now().toString(36)}-${this.nextBoatId++}`;
    return this.restoreSailboat({ id, x: position.x, y: position.y, z: position.z, yaw: this.yaw, velocity: 0, passengers: [], inventory: [] });
  }

  dismountBoat() {
    if (!this.mountedBoatId) return;
    const boat = this.boats.get(this.mountedBoatId);
    const playerId = this.localPlayerId();
    if (boat) {
      boat.save.passengers = leaveSailboat(boat.save.passengers, playerId);
      const side = new THREE.Vector3(Math.cos(boat.save.yaw) * 1.45, 0, -Math.sin(boat.save.yaw) * 1.45);
      this.position.set(boat.save.x + side.x, boat.save.y + 0.2, boat.save.z + side.z);
    }
    this.mountedBoatId = null;
    this.velocity.set(0, 0, 0);
    this.events.onToast("You step off the Wayfarer.");
    this.saveSoon();
  }

  updateBoats(dt: number) {
    const playerId = this.localPlayerId();
    for (const boat of this.boats.values()) {
      const localSeat = boat.save.passengers.indexOf(playerId);
      const canDrive = localSeat === 0 && this.multiplayer?.role !== "guest";
      if (canDrive) {
        const forward = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
        const turn = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
        const next = integrateSailboat(boat.save, { forward, turn }, dt, (x, z) => {
          const y = Math.floor(boat.save.y - 0.05);
          return this.world.getBlock(Math.floor(x + 0.5), y, Math.floor(z + 0.5)) === BlockId.Water;
        });
        Object.assign(boat.save, next);
      }
      boat.group.position.set(boat.save.x, boat.save.y + Math.sin(performance.now() * 0.0018 + boat.save.x) * 0.025, boat.save.z);
      boat.group.rotation.set(Math.sin(performance.now() * 0.0013 + boat.save.z) * 0.018, boat.save.yaw, Math.sin(performance.now() * 0.0016 + boat.save.x) * 0.025);
      if (localSeat >= 0) {
        this.mountedBoatId = boat.save.id;
        const seat = sailboatSeatOffset(localSeat, boat.save.yaw);
        this.position.set(boat.save.x + seat.x, boat.save.y + seat.y, boat.save.z + seat.z);
        this.yaw = boat.save.yaw;
        this.velocity.set(0, 0, 0);
        this.grounded = true;
      }
    }
    if (this.mountedBoatId) {
      const boat = this.boats.get(this.mountedBoatId);
      if (!boat || !boat.save.passengers.includes(playerId)) this.mountedBoatId = null;
    }
  }

  exhibitSpecimen(slot: InventorySlot, key: string, index: number): ExhibitButterfly | null {
    const kind = ITEMS[slot.item]?.creatureKind as ButterflyKind | undefined;
    if (!kind || !BUTTERFLY_ORDER.includes(kind)) return null;
    let seed = 2166136261;
    const text = `${key}:${index}:${kind}`;
    for (const character of text) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
    return {
      schema: 1,
      id: `${key}:${index}`,
      kind,
      capturedAt: Number(slot.metadata?.capturedAt) || 0,
      ageTicks: Number(slot.metadata?.ageTicks) || 0,
      name: typeof slot.metadata?.name === "string" ? slot.metadata.name : null,
      geneticSeed: seed >>> 0,
      custom: {},
    };
  }

  createExhibitVisual(key: string, topology: ExhibitTopology, specimens: ExhibitButterfly[]) {
    const group = new THREE.Group();
    group.name = key;
    group.userData.topology = topology;
    group.userData.specimens = specimens;
    const stemMaterial = new THREE.MeshLambertMaterial({ color: 0x3f7b42 });
    const petalColors = [0xf2c84f, 0x8ab9ec, 0xea7da5];
    topology.landingSites.forEach((site, index) => {
      if (site.tier === "flower-floor") {
        const stem = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.28, 0.055), stemMaterial.clone());
        stem.position.set(site.x + site.localOffset[0], site.y - 0.25 + site.localOffset[1], site.z + site.localOffset[2]);
        const petals = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.28), new THREE.MeshLambertMaterial({ color: petalColors[index % petalColors.length] }));
        petals.position.copy(stem.position).add(new THREE.Vector3(0, 0.15, 0));
        group.add(stem, petals);
      } else {
        const branch = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.065, 0.08), new THREE.MeshLambertMaterial({ color: site.tier === "canopy" ? 0x557a3d : 0x765034 }));
        branch.position.set(site.x, site.y - 0.18 + site.localOffset[1], site.z);
        branch.rotation.y = (index % 2) * Math.PI / 2;
        group.add(branch);
      }
    });
    specimens.forEach((specimen, index) => {
      const visual = new THREE.Group();
      visual.userData.specimenIndex = index;
      const colors = MOB_DEFS[specimen.kind].colors;
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.2), new THREE.MeshLambertMaterial({ color: colors[2] }));
      const wingMaterial = new THREE.MeshLambertMaterial({ color: colors[0], transparent: true, opacity: 0.9, side: THREE.DoubleSide });
      for (const side of [-1, 1]) {
        const wing = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.025, 0.16), wingMaterial.clone());
        wing.position.x = side * 0.12;
        wing.userData.wingSide = side;
        visual.add(wing);
      }
      visual.add(body);
      group.add(visual);
    });
    return group;
  }

  syncExhibitVisuals(force = false, dt = 0) {
    this.exhibitVisualTimer -= dt;
    if (!force && this.exhibitVisualTimer > 0) return;
    this.exhibitVisualTimer = 0.12;
    const live = new Set<string>();
    for (const [key, slots] of this.chests) {
      if (!key.startsWith("exhibit:")) continue;
      const [x, y, z] = key.slice("exhibit:".length).split(",").map(Number);
      const topology = this.exhibitTopologyAt(x, y, z);
      if (!topology) continue;
      live.add(key);
      const specimens = slots.flatMap((slot, index) => slot ? [this.exhibitSpecimen(slot, key, index)].filter((value): value is ExhibitButterfly => Boolean(value)) : []);
      const topologySignature = topology.blocks.map((block) => block.key).sort().join("|");
      const specimenSignature = specimens.map((specimen) => `${specimen.kind}:${specimen.id}`).join("|");
      let visual = this.exhibitVisuals.get(key);
      if (!visual || visual.topologySignature !== topologySignature || visual.specimenSignature !== specimenSignature) {
        if (visual) { this.exhibitGroup.remove(visual.group); this.disposeObject(visual.group); }
        const group = this.createExhibitVisual(key, topology, specimens);
        this.exhibitGroup.add(group);
        visual = { group, topologySignature, specimenSignature };
        this.exhibitVisuals.set(key, visual);
      }
      const elapsed = performance.now() / 1000;
      for (const child of visual.group.children) {
        const index = child.userData.specimenIndex as number | undefined;
        if (index === undefined) continue;
        const specimen = specimens[index];
        if (!specimen) continue;
        const pose = sampleExhibitButterflyPose(specimen, topology, elapsed);
        child.position.set(pose.x - (pose.landed ? 0 : 0.5), pose.y, pose.z - (pose.landed ? 0 : 0.5));
        child.rotation.y = pose.yaw;
        const flap = pose.landed ? 0.12 : 0.55 + Math.sin(elapsed * 14 + index) * 0.42;
        for (const wing of child.children) if (wing.userData.wingSide) wing.rotation.z = Number(wing.userData.wingSide) * flap;
      }
    }
    for (const [key, visual] of this.exhibitVisuals) {
      if (live.has(key)) continue;
      this.exhibitGroup.remove(visual.group);
      this.disposeObject(visual.group);
      this.exhibitVisuals.delete(key);
    }
  }

  createMobVisual(kind: MobKind, id: number) {
    return createMobVisual(kind, id);
  }

  spawnMob(kind: MobKind, position: THREE.Vector3, options: SpawnMobOptions = {}) {
    const definition = MOB_DEFS[kind];
    const id = options.id ?? this.nextMobId++;
    this.nextMobId = Math.max(this.nextMobId, id + 1);
    const { group, visual, parts } = this.createMobVisual(kind, id);
    group.position.copy(position);
    this.creatureGroup.add(group);
    const angle = options.yaw ?? Math.random() * Math.PI * 2;
    const petState = kind === "peelop" ? (options.petState ? { ...options.petState } : createPeelopState((id * 2654435761) >>> 0)) : null;
    const mob: MobEntity = {
      id, kind, name: petState?.name || definition.name, hostile: definition.hostile, definition, group, visual, parts,
      health: options.health ?? petState?.health ?? definition.health, maxHealth: petState?.maxHealth ?? definition.health,
      damage: definition.damage, angle, desiredAngle: angle, steering: createStableSteering(angle), wanderTimer: 1 + Math.random() * 4,
      attackCooldown: 0, hurtTimer: 0, age: options.age ?? 0, bob: Math.random() * Math.PI * 2, gait: 0,
      fleeTimer: 0, state: "wander", stateTimer: 0, baseY: position.y, voiceTimer: 2 + Math.random() * 8,
      birdState: definition.family === "bird" ? createBirdBehavior(kind as "emberjay" | "canopy-lark", id * 0.71) : null,
      petState,
      persistentPoiResident: options.persistentPoiResident ?? Boolean(definition.persistent),
      poiMarkerId: options.poiMarkerId ?? null,
      enclosed: options.enclosed ?? false,
      enclosureTimer: 0,
    };
    if (petState?.baby) mob.visual.scale.setScalar(0.62);
    this.mobs.push(mob);
    return mob;
  }

  restoreCreature(saved: SavedCreature) {
    if (!(saved.kind in MOB_DEFS) || BUTTERFLY_ORDER.includes(saved.kind as ButterflyKind)) return null;
    return this.spawnMob(saved.kind, new THREE.Vector3(saved.x, saved.y, saved.z), {
      id: saved.id,
      health: clamp(Number(saved.health) || MOB_DEFS[saved.kind].health, 0.1, MOB_DEFS[saved.kind].health),
      age: Math.max(0, Number(saved.age) || 0),
      yaw: Number(saved.yaw) || 0,
      persistentPoiResident: Boolean(saved.persistentPoiResident),
      poiMarkerId: saved.poiMarkerId ?? null,
      enclosed: Boolean(saved.enclosed),
      petState: saved.petState ?? null,
    });
  }

  isMobEnclosed(mob: MobEntity) {
    const x = Math.round(mob.group.position.x);
    const y = Math.floor(mob.group.position.y);
    const z = Math.round(mob.group.position.z);
    return ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).every(([dx, dz]) => {
      for (let distance = 1; distance <= 6; distance += 1) {
        const feet = this.world.getBlock(x + dx * distance, y, z + dz * distance);
        const head = this.world.getBlock(x + dx * distance, y + 1, z + dz * distance);
        if (BLOCKS[feet ?? BlockId.Air]?.solid || BLOCKS[head ?? BlockId.Air]?.solid) return true;
      }
      return false;
    });
  }

  updateStructureSpawns(dt: number) {
    this.structureActivationTimer -= dt;
    if (this.structureActivationTimer > 0) return;
    this.structureActivationTimer = 0.9;
    const aliases: Record<string, MobKind> = {
      "dune-warden": "reliquary-sentinel",
      "rootbound-sentinel": "reliquary-sentinel",
      bananabun: "peelop",
    };
    for (const [markerKey, raw] of this.world.structureMarkersNear(this.position.x, this.position.y, this.position.z, 48)) {
      if (raw.type !== "spawn" || this.activatedStructureMarkers.has(markerKey)) continue;
      const marker = raw as SpawnMarker;
      const butterfly = BUTTERFLY_ORDER.includes(marker.mobKind as ButterflyKind) ? marker.mobKind as ButterflyKind : null;
      const kind = aliases[marker.mobKind] ?? (marker.mobKind in MOB_DEFS ? marker.mobKind as MobKind : null);
      if (!butterfly && !kind) { this.activatedStructureMarkers.add(markerKey); continue; }
      for (let index = 0; index < marker.count; index += 1) {
        const angle = (index / Math.max(1, marker.count)) * Math.PI * 2 + marker.position.x * 0.17;
        const radius = marker.radius * (0.3 + ((index * 37) % 61) / 100);
        const x = marker.position.x + Math.cos(angle) * radius;
        const z = marker.position.z + Math.sin(angle) * radius;
        if (butterfly) this.butterflies.release(butterfly, new THREE.Vector3(x, marker.position.y + 0.8 + (index % 3) * 0.35, z));
        else if (kind) {
          const ground = this.world.findWalkableY(Math.round(x), Math.round(z), marker.position.y);
          this.spawnMob(kind, new THREE.Vector3(x, ground + MOB_DEFS[kind].footOffset, z), {
            persistentPoiResident: marker.persistent,
            poiMarkerId: markerKey,
            petState: kind === "peelop" ? createPeelopState(((marker.position.x * 73856093) ^ (marker.position.z * 19349663) ^ index) >>> 0, index % 5 === 0) : null,
          });
        }
      }
      this.activatedStructureMarkers.add(markerKey);
      this.saveSoon();
    }
  }

  trySpawnMob() {
    const cap = Math.floor((this.touchMode ? 13 : 22) * this.worldOptions.mobDensity);
    if (cap <= 0) return;
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
      const nearbyWaterY = [Math.round(this.position.y), Math.round(this.position.y) - 1, Math.round(this.position.y) + 1]
        .find((candidateY) => this.world.getBlock(x, candidateY, z) === BlockId.Water);
      if (nearbyWaterY !== undefined && passiveCount < passiveCap && Math.random() < 0.62) {
        kind = fishKindsForHabitat("underground")[0];
        this.spawnMob(kind, new THREE.Vector3(x, nearbyWaterY, z));
        return;
      }
      if (this.worldOptions.difficulty === "peaceful") return;
      const feet = this.world.getBlock(x, y + 1, z);
      const head = this.world.getBlock(x, y + 2, z);
      if (Math.abs(y - this.position.y) > 14 || !this.world.isWalkThrough(feet) || !this.world.isWalkThrough(head)) return;
      const roll = Math.random();
      kind = roll < 0.38 ? "zombie" : roll < 0.72 ? "caveblob" : "shadecrawler";
    } else {
      y = this.world.surfaceAt(x, z);
      const biome = this.world.biomeAt(x, z);
      if ([BiomeId.DeepOcean, BiomeId.Ocean, BiomeId.River].includes(biome) && passiveCount < passiveCap) {
        let waterY = SEA_LEVEL;
        while (waterY > y && this.world.getBlock(x, waterY, z) !== BlockId.Water) waterY -= 1;
        if (this.world.getBlock(x, waterY, z) === BlockId.Water) {
          const habitat = biome === BiomeId.River ? "river" : "ocean";
          const pool = fishKindsForHabitat(habitat);
          kind = pool[Math.floor(Math.random() * pool.length)];
          this.spawnMob(kind, new THREE.Vector3(x, waterY - Math.random() * Math.min(2, Math.max(0, waterY - y - 1)), z));
        }
        return;
      }
      if (this.world.getBlock(x, y, z) === undefined || y <= SEA_LEVEL) return;
      const daylight = this.daylightAmount();
      const hostile = this.worldOptions.difficulty !== "peaceful" && daylight < 0.2 && this.spawnProtection <= 0;
      const nocturnalGlowmoth = hostile && passiveCount < passiveCap && [BiomeId.MushroomFen, BiomeId.Bloomwood, BiomeId.Siltfen].includes(biome) && Math.random() < 0.3;
      if (nocturnalGlowmoth) kind = "glowmoth";
      else if (hostile) {
        const roll = Math.random();
        kind = roll < 0.38 ? "zombie" : roll < 0.63 ? "shadecrawler" : roll < 0.82 ? "rattlekin" : "skeleton";
      }
      else {
        if (passiveCount >= passiveCap) return;
        const roll = Math.random();
        kind = biome === BiomeId.Snowfield || biome === BiomeId.Frostpine ? (roll < 0.72 ? "woolhorn" : "canopy-lark")
          : biome === BiomeId.Desert || biome === BiomeId.Badlands ? (roll < 0.66 ? "duneclatter" : "emberjay")
            : biome === BiomeId.Savanna ? (roll < 0.62 ? "sunstep-grazer" : roll < 0.84 ? "emberjay" : "ridgeback")
              : biome === BiomeId.Siltfen ? (roll < 0.62 ? "mossling" : roll < 0.84 ? "pebbletortoise" : "canopy-lark")
                : biome === BiomeId.Bloomwood || biome === BiomeId.Wildwood ? (roll < 0.42 ? "brambleboar" : roll < 0.72 ? "mossling" : "canopy-lark")
                  : biome === BiomeId.MushroomFen ? (roll < 0.58 ? "glowmoth" : "petalfox")
                    : biome === BiomeId.Meadow ? (roll < 0.35 ? "petalfox" : roll < 0.58 ? "pebbletortoise" : roll < 0.78 ? "canopy-lark" : roll < 0.86 ? "peelop" : "ridgeback")
                      : roll < 0.25 ? "sunstep-grazer" : roll < 0.45 ? "pebbletortoise" : roll < 0.63 ? "petalfox" : "ridgeback";
      }
    }
    this.spawnMob(kind, new THREE.Vector3(x, y + MOB_DEFS[kind].footOffset, z));
  }

  mobMoveTarget(mob: MobEntity, nx: number, nz: number) {
    const definition = mob.definition;
    const centerX = Math.round(nx);
    const centerZ = Math.round(nz);
    const centerGround = this.world.findWalkableY(centerX, centerZ, mob.group.position.y - definition.footOffset);
    const centerFeet = this.world.getBlock(centerX, centerGround + 1, centerZ);
    const centerHead = this.world.getBlock(centerX, centerGround + Math.max(1, Math.ceil(definition.height)), centerZ);
    const insideOpenDoor = [centerFeet, centerHead].some((type) => type !== undefined && this.isDoor(type) && this.doorIsOpen(type));
    const samples: Array<[number, number]> = insideOpenDoor
      ? [[0, 0]]
      : [[0, 0], [definition.radius, definition.radius], [-definition.radius, definition.radius], [definition.radius, -definition.radius], [-definition.radius, -definition.radius]];
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
    for (const arm of mob.parts.arms) {
      arm.rotation.x = mob.kind === "zombie"
        ? Math.sin(mob.gait + (Number(arm.userData.phase) || 0)) * 0.055 + (mob.state === "windup" ? -0.38 : -0.06)
        : Math.sin(mob.gait + (Number(arm.userData.phase) || 0)) * 0.5 + (mob.state === "windup" ? -1.1 : 0);
    }
    for (const wing of mob.parts.wings) wing.rotation.z = (Number(wing.userData.side) || 1) * (0.35 + Math.sin(performance.now() * 0.018 + (Number(wing.userData.phase) || 0)) * 0.72);
    const hurtPulse = mob.hurtTimer > 0 ? 1 + Math.sin(mob.hurtTimer * 45) * 0.06 : 1;
    if (mob.kind === "caveblob") {
      const squash = 1 + Math.sin(mob.bob * 1.8) * 0.12;
      mob.visual.scale.set(hurtPulse / Math.sqrt(squash), hurtPulse * squash, hurtPulse / Math.sqrt(squash));
    } else mob.visual.scale.setScalar(hurtPulse);
  }

  updateAquaticMob(mob: MobEntity, dt: number, distance: number, dx: number, dz: number) {
    if (mob.wanderTimer <= 0) {
      mob.desiredAngle += (Math.random() - 0.5) * 2.2;
      mob.wanderTimer = 1.5 + Math.random() * 4;
    }
    if (mob.fleeTimer > 0 || distance < 2.2) mob.desiredAngle = Math.atan2(-dz, -dx);
    const speed = mob.fleeTimer > 0 ? mob.definition.chaseSpeed : mob.definition.speed;
    mob.steering = updateStableSteering(mob.steering, { dt, turnRate: mob.definition.turnRate, blocked: false, mobId: mob.id, desiredHeading: mob.desiredAngle });
    mob.angle = mob.steering.heading;
    const nx = mob.group.position.x + Math.cos(mob.angle) * speed * dt;
    const nz = mob.group.position.z + Math.sin(mob.angle) * speed * dt;
    const verticalWave = Math.sin(mob.age * 0.9 + mob.id) * 0.18;
    const ny = mob.baseY + verticalWave;
    const water = this.world.getBlock(Math.floor(nx + 0.5), Math.floor(ny + 0.5), Math.floor(nz + 0.5)) === BlockId.Water;
    if (water) {
      const before = mob.group.position.clone();
      mob.group.position.set(nx, ny, nz);
      mob.group.rotation.y = -mob.angle - Math.PI / 2;
      mob.visual.rotation.z = Math.sin(mob.age * 6 + mob.id) * 0.055;
      this.animateMob(mob, before.distanceTo(mob.group.position));
    } else {
      mob.desiredAngle += Math.PI * (0.7 + (mob.id % 7) * 0.04);
      mob.steering = createStableSteering(mob.angle);
      mob.wanderTimer = 0.7;
    }
  }

  birdPerchNear(mob: MobEntity) {
    const originX = Math.round(mob.group.position.x);
    const originZ = Math.round(mob.group.position.z);
    const treeBlocks = new Set([BlockId.WildwoodLog, BlockId.PineLog, BlockId.BirchLog, BlockId.BloomLog, BlockId.WildwoodLeaves, BlockId.PineLeaves, BlockId.BirchLeaves, BlockId.BloomLeaves]);
    for (let radius = 0; radius <= 4; radius += 1) for (let dx = -radius; dx <= radius; dx += 1) for (let dz = -radius; dz <= radius; dz += 1) {
      if (radius > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
      const x = originX + dx;
      const z = originZ + dz;
      const ground = this.world.surfaceAt(x, z);
      for (let y = ground + 9; y >= ground + 1; y -= 1) {
        const type = this.world.getBlock(x, y, z);
        if (!treeBlocks.has(type ?? BlockId.Air) || !this.world.isWalkThrough(this.world.getBlock(x, y + 1, z))) continue;
        return { id: `tree:${x},${y},${z}`, x, z, altitude: y + 0.56 - ground };
      }
    }
    const ground = this.world.surfaceAt(originX, originZ);
    return { id: `land:${originX},${ground},${originZ}`, x: originX, z: originZ, altitude: 0.12 };
  }

  updateBirdMob(mob: MobEntity, dt: number, distance: number, dx: number, dz: number) {
    const ground = this.world.surfaceAt(Math.round(mob.group.position.x), Math.round(mob.group.position.z));
    const perch = this.birdPerchNear(mob);
    const playerSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    mob.birdState = updateBirdBehavior(mob.birdState ?? createBirdBehavior(mob.kind as "emberjay" | "canopy-lark"), {
      dt,
      distanceToHuman: distance,
      humanSpeed: playerSpeed,
      attacked: mob.fleeTimer > 0,
      perchId: perch.id,
      perchHeight: perch.altitude,
      onGround: mob.group.position.y <= ground + 0.8,
      random: ((mob.id * 17 + Math.floor(mob.age)) % 97) / 96,
    });
    if (mob.birdState.mode === "flee" || mob.birdState.mode === "takeoff") mob.desiredAngle = Math.atan2(-dz, -dx);
    else if (mob.birdState.mode === "perch") mob.desiredAngle = Math.atan2(perch.z - mob.group.position.z, perch.x - mob.group.position.x);
    else if (mob.wanderTimer <= 0) {
      mob.desiredAngle += (Math.random() - 0.5) * 2.4;
      mob.wanderTimer = 1.8 + Math.random() * 3.2;
    }
    const flying = !["perch", "forage"].includes(mob.birdState.mode);
    const speed = flying ? (mob.birdState.mode === "flee" ? mob.definition.chaseSpeed : mob.definition.speed * 1.8) : mob.definition.speed * 0.22;
    mob.steering = updateStableSteering(mob.steering, { dt, turnRate: mob.definition.turnRate, blocked: false, mobId: mob.id, desiredHeading: mob.desiredAngle });
    mob.angle = mob.steering.heading;
    const nx = mob.group.position.x + Math.cos(mob.angle) * speed * dt;
    const nz = mob.group.position.z + Math.sin(mob.angle) * speed * dt;
    const nextGround = this.world.surfaceAt(Math.round(nx), Math.round(nz));
    const targetY = nextGround + mob.birdState.altitude + 0.52;
    const before = mob.group.position.clone();
    mob.group.position.x = nx;
    mob.group.position.z = nz;
    mob.group.position.y += (targetY - mob.group.position.y) * Math.min(1, dt * (flying ? 5 : 9));
    mob.group.rotation.y = -mob.angle - Math.PI / 2;
    for (const wing of mob.parts.wings) wing.rotation.z = (Number(wing.userData.side) || 1) * (flying ? 0.38 + Math.sin(mob.birdState.wingPhase) * 0.72 : 0.12);
    this.animateMob(mob, before.distanceTo(mob.group.position));
  }

  fireSkeletonArrow(mob: MobEntity) {
    const origin = mob.group.position.clone().add(new THREE.Vector3(0, mob.definition.height * 0.78, 0));
    const target = this.position.clone().add(new THREE.Vector3(0, 1.1, 0));
    const arrow = createArrowProjectile(this.nextProjectileId++, { kind: "mob", id: mob.id }, origin, target, mob.damage, 11.8);
    this.projectileGroup.add(arrow.visual);
    this.projectiles.push(arrow);
    mob.attackCooldown = 2.1 + (mob.id % 5) * 0.12;
    mob.state = "recover";
    mob.stateTimer = 0.35;
    this.audio.play("attack");
  }

  updateProjectiles(dt: number) {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      const result = stepArrowProjectile(projectile, dt, (position) => {
        const type = this.world.getBlock(Math.floor(position.x + 0.5), Math.floor(position.y + 0.5), Math.floor(position.z + 0.5));
        return Boolean(BLOCKS[type ?? BlockId.Air]?.solid);
      }, (position, radius) => position.distanceToSquared(this.position.clone().add(new THREE.Vector3(0, 0.9, 0))) <= (PLAYER_RADIUS + radius) ** 2 ? "local" : null);
      if (result.kind === "flying") continue;
      if (result.kind === "target") this.damagePlayer(projectile.damage, "skeleton arrow");
      this.projectileGroup.remove(projectile.visual);
      disposeArrowVisual(projectile.visual);
      this.projectiles.splice(index, 1);
    }
  }

  updateMobs(dt: number) {
    this.mobSpawnTimer -= dt;
    if (this.mobSpawnTimer <= 0) {
      const density = Math.max(0.08, this.worldOptions.mobDensity);
      this.mobSpawnTimer = (2.2 + Math.random() * 1.8) / density;
      this.trySpawnMob();
    }
    for (let index = this.mobs.length - 1; index >= 0; index -= 1) {
      const mob = this.mobs[index];
      if (mob.hostile && this.worldOptions.difficulty === "peaceful") { this.removeMob(index); continue; }
      mob.age += dt;
      mob.attackCooldown = Math.max(0, mob.attackCooldown - dt);
      mob.hurtTimer = Math.max(0, mob.hurtTimer - dt);
      mob.fleeTimer = Math.max(0, mob.fleeTimer - dt);
      mob.wanderTimer -= dt;
      mob.stateTimer -= dt;
      mob.voiceTimer -= dt;
      mob.enclosureTimer -= dt;
      if (mob.enclosureTimer <= 0) {
        mob.enclosureTimer = 3 + (mob.id % 5) * 0.25;
        mob.enclosed = this.isMobEnclosed(mob);
      }
      if (mob.petState) {
        mob.petState = tickPeelop(mob.petState, dt * 20);
        mob.petState.health = clamp(mob.health, 0, mob.petState.maxHealth);
        mob.name = mob.petState.name || mob.definition.name;
        mob.maxHealth = mob.petState.maxHealth;
        mob.visual.scale.setScalar(mob.petState.baby ? 0.62 : 1);
      }
      const dx = this.position.x - mob.group.position.x;
      const dz = this.position.z - mob.group.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance < 10 && !this.bestiary[mob.kind].seen) { this.bestiary[mob.kind].seen = true; this.saveSoon(); }
      if (mob.kind === "zombie") {
        if (distance < 24 && mob.voiceTimer <= 0 && this.zombieVoiceCooldown <= 0) {
          this.audio.playSample(Math.random() < 0.5 ? "zombieMoan1" : "zombieMoan2", { gain: 0.78 + Math.random() * 0.18, playbackRate: 0.94 + Math.random() * 0.1 });
          mob.voiceTimer = 7 + Math.random() * 9;
          this.zombieVoiceCooldown = 3.2;
        }
        const mx = Math.round(mob.group.position.x);
        const mz = Math.round(mob.group.position.z);
        const onSurface = mob.group.position.y >= this.world.surfaceAt(mx, mz) + mob.definition.footOffset - 0.3;
        if (onSurface && this.daylightAmount() > 0.72) {
          mob.health -= dt * 1.35;
          mob.hurtTimer = Math.max(mob.hurtTimer, 0.08);
          if (mob.health <= 0) { this.killMob(mob); continue; }
        }
      }
      const protectedCreature = shouldKeepCreatureLoaded({
        tamed: mob.petState?.tamed,
        named: Boolean(mob.petState?.name || mob.name !== mob.definition.name),
        enclosed: mob.enclosed,
        persistentPoiResident: mob.persistentPoiResident,
      });
      const simulationRadius = this.settings.simulationDistance * CHUNK_SIZE + 10;
      if (protectedCreature && distance > simulationRadius) {
        mob.group.visible = false;
        continue;
      }
      mob.group.visible = true;
      if (!protectedCreature && (distance > simulationRadius || mob.age > 300 || (mob.hostile && this.daylightAmount() > 0.65 && mob.group.position.y > SEA_LEVEL && distance > 25))) {
        this.removeMob(index);
        continue;
      }
      if (mob.definition.movement === "aquatic") {
        this.updateAquaticMob(mob, dt, distance, dx, dz);
        continue;
      }
      if (mob.definition.movement === "flying" && mob.definition.family === "bird") {
        this.updateBirdMob(mob, dt, distance, dx, dz);
        continue;
      }
      const aggressive = mob.hostile || ((mob.kind === "ridgeback" || mob.kind === "woolhorn") && mob.fleeTimer > 0);
      const petFollowing = Boolean(mob.petState?.tamed && mob.petState.command === "follow" && distance > 2.2);
      const petHolding = Boolean(mob.petState?.tamed && (mob.petState.command === "sit" || mob.petState.command === "stay"));
      if (mob.definition.ranged && aggressive && distance < 17) {
        mob.state = "chase";
        mob.desiredAngle = distance < 4 ? Math.atan2(-dz, -dx) : Math.atan2(dz, dx);
        if (distance >= 3.2 && mob.attackCooldown <= 0 && Math.abs(this.position.y - mob.group.position.y) < 5) this.fireSkeletonArrow(mob);
      } else if (mob.state === "windup") {
        if (mob.stateTimer <= 0) {
          if (distance < mob.definition.attackRange + 0.7 && Math.abs(this.position.y - mob.group.position.y) < 2) {
            this.damagePlayer(mob.damage, mob.name);
            this.velocity.add(new THREE.Vector3(dx, 0.1, dz).normalize().multiplyScalar(mob.kind === "ridgeback" ? 4.4 : 3.2));
            this.combatMusicTimer = Math.max(this.combatMusicTimer, 8);
            if (mob.kind === "zombie") this.audio.playSample(Math.random() < 0.5 ? "zombieMoan1" : "zombieMoan2", { gain: 0.9 });
            else this.audio.play("mob");
          }
          mob.state = "recover"; mob.stateTimer = 0.55; mob.attackCooldown = 1.15;
        }
      } else if (mob.state === "recover" && mob.stateTimer <= 0) mob.state = "wander";
      else if (petHolding) {
        mob.state = "wander";
        mob.desiredAngle = mob.angle;
      } else if (petFollowing) {
        mob.state = "chase";
        mob.desiredAngle = Math.atan2(dz, dx);
      }
      else if (aggressive && distance < (this.crouching ? 11 : 20)) {
        mob.state = "chase";
        mob.desiredAngle = Math.atan2(dz, dx);
        if (distance < mob.definition.attackRange && mob.attackCooldown <= 0) { mob.state = "windup"; mob.stateTimer = mob.kind === "rattlekin" ? 0.52 : mob.kind === "zombie" ? 0.44 : 0.34; }
      } else if (mob.fleeTimer > 0) {
        mob.state = "flee";
        mob.desiredAngle = Math.atan2(-dz, -dx);
      } else if (mob.wanderTimer <= 0) {
        mob.state = "wander";
        mob.desiredAngle += (Math.random() - 0.5) * 2.4;
        mob.wanderTimer = 2 + Math.random() * 5;
      }
      let speed = mob.state === "chase" ? mob.definition.chaseSpeed : mob.state === "flee" ? mob.definition.chaseSpeed * 0.86 : mob.definition.speed;
      if (mob.state === "windup" || mob.state === "recover") speed *= 0.08;
      if (petHolding || (mob.petState?.tamed && mob.petState.command === "follow" && distance <= 2.2)) speed = 0;
      const beforeX = mob.group.position.x;
      const beforeZ = mob.group.position.z;
      let blocked = false;
      if (mob.kind === "glowmoth") {
        const nx = mob.group.position.x + Math.cos(mob.angle) * speed * dt;
        const nz = mob.group.position.z + Math.sin(mob.angle) * speed * dt;
        const targetY = this.mobMoveTarget(mob, nx, nz);
        if (targetY !== null) {
          mob.group.position.x = nx;
          mob.group.position.z = nz;
          mob.baseY += (targetY - mob.baseY) * Math.min(1, dt * 4);
        } else { blocked = true; mob.wanderTimer = Math.max(mob.wanderTimer, 0.35); }
        mob.group.position.y = mob.baseY + Math.sin(performance.now() * 0.003 + mob.id) * 0.22;
      } else {
        const nx = mob.group.position.x + Math.cos(mob.angle) * speed * dt;
        const nz = mob.group.position.z + Math.sin(mob.angle) * speed * dt;
        const targetY = this.mobMoveTarget(mob, nx, nz);
        if (targetY !== null) {
          mob.group.position.x = nx;
          mob.group.position.z = nz;
          const hop = mob.kind === "caveblob" ? Math.max(0, Math.sin(performance.now() * 0.006 + mob.id)) * 0.1 : 0;
          mob.group.position.y += (targetY + hop - mob.group.position.y) * Math.min(1, dt * 9);
        } else { blocked = true; mob.wanderTimer = Math.max(mob.wanderTimer, 0.5); }
      }
      const moved = Math.hypot(mob.group.position.x - beforeX, mob.group.position.z - beforeZ);
      mob.steering = updateStableSteering(mob.steering, {
        dt, turnRate: mob.definition.turnRate, blocked, mobId: mob.id, desiredHeading: mob.desiredAngle,
      });
      mob.angle = mob.steering.heading;
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
    if (mob.petState) mob.petState.health = Math.max(0, mob.health);
    mob.hurtTimer = 0.32;
    mob.fleeTimer = mob.hostile ? 0.45 : 3.2;
    mob.state = mob.hostile ? "chase" : "flee";
    const away = mob.group.position.clone().sub(this.position).setY(0).normalize().multiplyScalar(0.65);
    mob.group.position.add(away);
    if (item?.toolKind === "sword") this.audio.playSample("swordSwing", { playbackRate: 0.96 + Math.random() * 0.08 });
    else this.audio.play("attack");
    if (mob.hostile) this.combatMusicTimer = Math.max(this.combatMusicTimer, 9);
    this.spawnParticles(mob.group.position.x, mob.group.position.y, mob.group.position.z, mob.hostile ? BlockId.Obsidian : BlockId.Dirt, 7);
    if (item?.toolKind) this.damageSelectedTool();
    if (mob.health <= 0) this.killMob(mob);
    this.emitHud(true);
  }

  spawnMobRemains(mob: MobEntity) {
    if (this.mobRemains.length >= 6) {
      const oldest = this.mobRemains.shift();
      for (const fragment of oldest?.fragments ?? []) {
        this.scene.remove(fragment.mesh);
        fragment.mesh.geometry.dispose();
        fragment.mesh.material.dispose();
      }
    }
    mob.group.updateWorldMatrix(true, true);
    const fragments: MobFragment[] = [];
    mob.visual.traverse((object) => {
      if (fragments.length >= 32 || !(object instanceof THREE.Mesh) || !(object.geometry instanceof THREE.BufferGeometry)) return;
      const sourceMaterial = Array.isArray(object.material) ? object.material[0] : object.material;
      const sourceColor = sourceMaterial && "color" in sourceMaterial
        ? (sourceMaterial as THREE.Material & { color: THREE.Color }).color
        : new THREE.Color(mob.definition.colors[0]);
      const material = new THREE.MeshLambertMaterial({ color: sourceColor, transparent: true, opacity: 1, emissive: 0x000000 });
      const mesh = new THREE.Mesh(object.geometry.clone(), material);
      const baseScale = new THREE.Vector3();
      object.matrixWorld.decompose(mesh.position, mesh.quaternion, baseScale);
      mesh.scale.copy(baseScale);
      mesh.userData.bodyPart = object.userData.bodyPart ?? "fragment";
      const outward = mesh.position.clone().sub(mob.group.position).setY(0);
      if (outward.lengthSq() < 0.01) outward.set(Math.random() - 0.5, 0, Math.random() - 0.5);
      outward.normalize();
      const velocity = outward.multiplyScalar(0.7 + Math.random() * 1.55);
      velocity.y = 2.2 + Math.random() * 2.4;
      this.scene.add(mesh);
      fragments.push({
        mesh,
        velocity,
        angularVelocity: new THREE.Vector3((Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7, (Math.random() - 0.5) * 7),
        baseScale,
        baseColor: sourceColor.clone(),
      });
    });
    if (fragments.length) this.mobRemains.push({ age: 0, fragments });
  }

  updateMobRemains(dt: number) {
    const ember = new THREE.Color(0xf06b2f);
    const ash = new THREE.Color(0x1c1714);
    for (let remainsIndex = this.mobRemains.length - 1; remainsIndex >= 0; remainsIndex -= 1) {
      const remains = this.mobRemains[remainsIndex];
      remains.age += dt;
      const burn = clamp((remains.age - 0.72) / 1.55, 0, 1);
      for (const fragment of remains.fragments) {
        fragment.velocity.y -= 11.5 * dt;
        const nextY = fragment.mesh.position.y + fragment.velocity.y * dt;
        const ground = this.world.getBlock(
          Math.floor(fragment.mesh.position.x + 0.5),
          Math.floor(nextY - 0.12 + 0.5),
          Math.floor(fragment.mesh.position.z + 0.5),
        );
        if (ground !== undefined && BLOCKS[ground]?.solid && fragment.velocity.y < 0) {
          fragment.velocity.y *= -0.24;
          fragment.velocity.x *= 0.66;
          fragment.velocity.z *= 0.66;
        } else fragment.mesh.position.y = nextY;
        fragment.mesh.position.x += fragment.velocity.x * dt;
        fragment.mesh.position.z += fragment.velocity.z * dt;
        fragment.mesh.rotation.x += fragment.angularVelocity.x * dt;
        fragment.mesh.rotation.y += fragment.angularVelocity.y * dt;
        fragment.mesh.rotation.z += fragment.angularVelocity.z * dt;
        fragment.angularVelocity.multiplyScalar(Math.exp(-dt * 1.2));
        if (burn > 0) {
          fragment.mesh.material.color.copy(fragment.baseColor).lerp(ember, Math.min(1, burn * 1.8)).lerp(ash, Math.max(0, burn - 0.48) * 1.92);
          fragment.mesh.material.emissive.set(0x8f260b).multiplyScalar(Math.sin(burn * Math.PI) * 0.58);
          fragment.mesh.material.opacity = 1 - burn;
          fragment.mesh.scale.copy(fragment.baseScale).multiplyScalar(1 - burn * 0.78);
        }
      }
      if (remains.age < 2.32) continue;
      for (const fragment of remains.fragments) {
        this.scene.remove(fragment.mesh);
        fragment.mesh.geometry.dispose();
        fragment.mesh.material.dispose();
      }
      this.mobRemains.splice(remainsIndex, 1);
    }
  }

  killMob(mob: MobEntity) {
    const position = mob.group.position.clone();
    for (const drop of mob.definition.drops) if (Math.random() <= drop.chance) this.spawnDrop(drop.item, drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1)), position);
    this.addXp(mob.definition.xp);
    this.bestiary[mob.kind].seen = true;
    this.bestiary[mob.kind].kills += 1;
    this.events.onToast(`${mob.name} defeated · Bestiary kill ${this.bestiary[mob.kind].kills}`);
    this.spawnMobRemains(mob);
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

  spawnDrop(item: ItemCode, count: number, position: THREE.Vector3, durability?: number, metadata?: Record<string, unknown>): DropEntity | undefined {
    if (!ITEMS[item] || count <= 0) return;
    const resolvedDurability = durability ?? ITEMS[item]?.maxDurability;
    const stackLimit = maxStack(item);
    let firstDrop: DropEntity | undefined;
    const nearby = this.drops.find((drop) => drop.item === item && drop.durability === resolvedDurability
      && JSON.stringify(drop.metadata ?? null) === JSON.stringify(metadata ?? null)
      && drop.mesh.position.distanceToSquared(position) < 2.25 && drop.count < maxStack(item));
    if (nearby) {
      const add = Math.min(count, stackLimit - nearby.count);
      nearby.count += add;
      count -= add;
      firstDrop = nearby;
    }
    let material = this.dropMaterials.get(item);
    if (!material) { material = new THREE.MeshLambertMaterial({ color: ITEMS[item].color }); this.dropMaterials.set(item, material); }
    while (count > 0) {
      if (this.drops.length >= 120) this.removeDrop(0);
      const amount = Math.min(count, stackLimit);
      const mesh = new THREE.Mesh(this.sharedDropGeometry, material);
      mesh.position.copy(position).add(new THREE.Vector3((Math.random() - 0.5) * 0.45, 0.25, (Math.random() - 0.5) * 0.45));
      this.dropGroup.add(mesh);
      const drop: DropEntity = {
        id: this.nextDropId++, item, count: amount,
        ...(resolvedDurability !== undefined ? { durability: resolvedDurability } : {}),
        ...(metadata ? { metadata: cloneSlot({ item, count: 1, metadata })?.metadata } : {}),
        mesh, velocity: new THREE.Vector3((Math.random() - 0.5) * 1.4, 2 + Math.random(), (Math.random() - 0.5) * 1.4), age: 0, pickupDelay: 0.35,
      };
      this.drops.push(drop);
      firstDrop ??= drop;
      count -= amount;
    }
    return firstDrop;
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
        const leftover = this.addItem(drop.item, drop.count, drop.durability, undefined, drop.metadata);
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
      const renderable = object as THREE.Object3D & { geometry?: THREE.BufferGeometry; material?: THREE.Material | THREE.Material[] };
      renderable.geometry?.dispose();
      if (!renderable.material) return;
      const materials = Array.isArray(renderable.material) ? renderable.material : [renderable.material];
      for (const material of materials) material.dispose();
    });
  }

  dropSelectedItem() {
    if (this.mode === "builder") return;
    const slot = this.selectedSlot();
    if (!slot) return;
    const direction = new THREE.Vector3();
    this.camera.getWorldDirection(direction);
    const drop = this.spawnDrop(slot.item, 1, this.camera.position.clone().add(direction.clone().multiplyScalar(0.8)), slot.durability, slot.metadata);
    if (drop) drop.velocity.add(direction.multiplyScalar(3));
    slot.count -= 1;
    if (slot.count <= 0) this.inventory[this.selected] = null;
    this.saveSoon();
    this.emitHud(true);
  }

  clearEntities() {
    this.butterflies.clear();
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
    for (const remains of this.mobRemains) for (const fragment of remains.fragments) {
      this.scene.remove(fragment.mesh);
      fragment.mesh.geometry.dispose();
      fragment.mesh.material.dispose();
    }
    this.mobRemains = [];
    for (const boat of this.boats.values()) {
      this.boatGroup.remove(boat.group);
      disposeSailboatVisual(boat.group);
    }
    this.boats.clear();
    this.mountedBoatId = null;
    this.targetBoat = null;
    for (const visual of this.exhibitVisuals.values()) {
      this.exhibitGroup.remove(visual.group);
      this.disposeObject(visual.group);
    }
    this.exhibitVisuals.clear();
    for (const projectile of this.projectiles) {
      this.projectileGroup.remove(projectile.visual);
      disposeArrowVisual(projectile.visual);
    }
    this.projectiles = [];
    this.activePet = null;
  }

  environmentLightWasAssigned(source: EnvironmentLightSource) {
    for (const light of this.placedLightPool) {
      if (light.userData.sourceX === source.x && light.userData.sourceY === source.y && light.userData.sourceZ === source.z) return true;
    }
    return false;
  }

  configureEnvironmentLight(light: THREE.PointLight, source: EnvironmentLightCandidate) {
    const crystal = source.type === BlockId.CrystalBlock;
    light.color.setHex(crystal ? 0x69e8ef : source.type === BlockId.Glowstone ? 0xffd66b : 0xffb45e);
    setEnvironmentLightPosition(light.position, source);
    light.distance = environmentLightDistance(source.type);
    light.userData.targetIntensity = isTorchBlock(source.type) ? 1.75 : crystal ? 1.05 : 1.45;
    light.userData.phase = source.x * 0.73 + source.y * 0.37 + source.z * 0.19;
    light.userData.sourceX = source.x;
    light.userData.sourceY = source.y;
    light.userData.sourceZ = source.z;
    light.userData.refreshAssigned = true;
    source.assigned = true;
  }

  refreshEnvironmentLights() {
    this.camera.updateMatrixWorld();
    this.camera.getWorldDirection(this.lightForward);
    this.lightViewProjection.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse);
    this.lightFrustum.setFromProjectionMatrix(this.lightViewProjection);

    // Query the entire rendered environment plus one light radius. Selection is
    // then based on whether each light's influence volume intersects the view,
    // not on how close its source block happens to be to the player.
    const queryRadius = Math.min(this.camera.far, this.settings.renderDistance * 16 + 18);
    const sources = this.world.lightSourcesNear(this.camera.position.x, this.camera.position.y, this.camera.position.z, queryRadius);
    this.environmentLightSelection.length = 0;
    while (this.environmentLightCandidates.length) this.environmentLightCandidateCache.push(this.environmentLightCandidates.pop()!);
    for (const source of sources) {
      const lightDistance = environmentLightDistance(source.type);
      setEnvironmentLightPosition(this.lightSourcePosition, source);
      this.lightInfluenceSphere.center.copy(this.lightSourcePosition);
      this.lightInfluenceSphere.radius = lightDistance;
      if (!this.lightFrustum.intersectsSphere(this.lightInfluenceSphere)) continue;
      let candidate = this.environmentLightCandidateCache.pop();
      if (!candidate) {
        candidate = { x: 0, y: 0, z: 0, type: BlockId.Torch, distanceSquared: 0, priority: 0, selected: false, assigned: false };
      }
      candidate.x = source.x;
      candidate.y = source.y;
      candidate.z = source.z;
      candidate.type = source.type;
      candidate.distanceSquared = source.distanceSquared;
      candidate.priority = environmentLightPriority(source, this.camera.position, this.lightForward, this.environmentLightWasAssigned(source));
      candidate.selected = false;
      candidate.assigned = false;
      this.environmentLightCandidates.push(candidate);
    }
    this.environmentLightCandidates.sort(compareEnvironmentLightCandidates);

    // First cover distinct illuminated regions, then fill spare slots from the
    // remaining ranked sources. This stops one dense torch cluster from
    // consuming the whole fixed shader-light budget.
    for (let pass = 0; pass < 2 && this.environmentLightSelection.length < this.placedLightPool.length; pass += 1) {
      for (const candidate of this.environmentLightCandidates) {
        if (candidate.selected) continue;
        if (pass === 0) {
          let clustered = false;
          for (const selected of this.environmentLightSelection) {
            const dx = candidate.x - selected.x;
            const dy = candidate.y - selected.y;
            const dz = candidate.z - selected.z;
            if (dx * dx + dy * dy + dz * dz < 49) { clustered = true; break; }
          }
          if (clustered) continue;
        }
        candidate.selected = true;
        this.environmentLightSelection.push(candidate);
        if (this.environmentLightSelection.length >= this.placedLightPool.length) break;
      }
    }

    // Keep a source in its existing point-light slot whenever possible. Stable
    // uniforms avoid visible popping and unnecessary renderer state churn.
    for (const light of this.placedLightPool) {
      light.userData.refreshAssigned = false;
      for (const source of this.environmentLightSelection) {
        if (source.assigned) continue;
        if (light.userData.sourceX === source.x && light.userData.sourceY === source.y && light.userData.sourceZ === source.z) {
          this.configureEnvironmentLight(light, source);
          break;
        }
      }
    }
    for (const light of this.placedLightPool) {
      if (light.userData.refreshAssigned) continue;
      let source: EnvironmentLightCandidate | undefined;
      for (const candidate of this.environmentLightSelection) {
        if (!candidate.assigned) { source = candidate; break; }
      }
      if (source) this.configureEnvironmentLight(light, source);
      else {
        light.userData.targetIntensity = 0;
        light.userData.sourceX = Number.NaN;
        light.userData.sourceY = Number.NaN;
        light.userData.sourceZ = Number.NaN;
      }
    }
  }

  updateLocalLights(dt: number) {
    this.lightRefreshTimer -= dt;
    if (this.lightRefreshTimer <= 0) {
      this.lightRefreshTimer = 0.18;
      this.skyVisibilityTarget = this.world.skyVisibilityAt(this.camera.position.x, this.camera.position.y, this.camera.position.z);
      this.refreshEnvironmentLights();
    }
    this.skyVisibility += (this.skyVisibilityTarget - this.skyVisibility) * (1 - Math.exp(-dt * 5));
    const now = performance.now() * 0.004;
    for (const light of this.placedLightPool) {
      const target = Number(light.userData.targetIntensity) || 0;
      const current = Number(light.userData.baseIntensity) || 0;
      const base = current + (target - current) * (1 - Math.exp(-dt * (target > current ? 12 : 7)));
      light.userData.baseIntensity = base;
      light.intensity = base * (1 + Math.sin(now + (Number(light.userData.phase) || 0)) * 0.045);
    }
    const selected = this.selectedSlot();
    const heldTorch = selected?.item === BlockId.Torch;
    const heldGlow = selected?.item === BlockId.Glowstone || selected?.item === BlockId.CrystalBlock;
    if (this.cameraMode === "first") {
      this.heldLightWorldOffset.copy(this.heldLightOffset).applyQuaternion(this.camera.quaternion);
      this.caveLight.position.copy(this.camera.position).add(this.heldLightWorldOffset);
    } else {
      this.heldLightWorldOffset.set(0.28, this.crouching ? 0.82 : 1.08, -0.25).applyAxisAngle(this.worldUp, this.yaw);
      this.caveLight.position.copy(this.position).add(this.heldLightWorldOffset);
    }
    this.caveLight.color.setHex(selected?.item === BlockId.CrystalBlock ? 0x69e8ef : 0xffb45e);
    this.caveLight.intensity = heldTorch ? 3.35 : heldGlow ? 2.55 : 0;
    this.caveLight.distance = heldTorch ? 24 : 20;
  }

  daylightAmount() {
    const angle = this.worldTime * Math.PI * 2 - Math.PI / 2;
    return clamp((Math.sin(angle) + 0.15) / 0.42, 0, 1);
  }

  resetDynamicWeather(saved?: WeatherState) {
    const biome = weatherBiomeFromId(this.world.biomeAt(Math.round(this.position.x), Math.round(this.position.z)));
    this.weatherBiome = biome;
    this.weatherBiomeCandidate = biome;
    this.weatherBiomeHold = 0;
    this.weatherState = saved && typeof saved.kind === "string" && Number.isFinite(saved.durationSeconds)
      ? { ...saved }
      : createWeatherState({ seed: this.world.seedText, biome });
    this.syncLegacyWeather();
    this.refreshCloudField(true);
  }

  syncLegacyWeather() {
    this.weather = ["drizzle", "rain", "thunder", "snow", "sandstorm", "ashfall"].includes(this.weatherState.kind) ? "rain" : "clear";
  }

  updateDynamicWeather(dt: number) {
    if (!this.worldOptions.weather) {
      if (this.weatherState.kind !== "clear") this.weatherState = {
        kind: "clear", cycle: this.weatherState.cycle, elapsedSeconds: 0, durationSeconds: 86_400,
        intensity: 0, windAngle: this.weatherState.windAngle, windSpeed: 0.25,
      };
      this.weather = "clear";
      return;
    }
    const currentBiome = weatherBiomeFromId(this.world.biomeAt(Math.round(this.position.x), Math.round(this.position.z)));
    if (currentBiome === this.weatherBiome) {
      this.weatherBiomeCandidate = currentBiome;
      this.weatherBiomeHold = 0;
    } else if (currentBiome !== this.weatherBiomeCandidate) {
      this.weatherBiomeCandidate = currentBiome;
      this.weatherBiomeHold = 0;
    } else {
      this.weatherBiomeHold += dt;
      if (this.weatherBiomeHold >= 8) {
        this.weatherBiome = currentBiome;
        this.weatherBiomeHold = 0;
        this.weatherState = createWeatherState({ seed: `${this.world.seedText}:${this.weatherState.cycle}`, biome: currentBiome }, this.weatherState.cycle);
      }
    }
    this.weatherState = stepWeather(this.weatherState, { seed: this.world.seedText, biome: this.weatherBiome }, dt);
    this.syncLegacyWeather();
  }

  updateDayNight(dt: number) {
    if (this.running && !this.titleMode && !this.paused) {
      this.worldTime += dt / Math.max(60, this.worldOptions.dayLengthMinutes * 60);
      if (this.worldTime >= 1) { this.worldTime -= 1; this.day += 1; }
    }
    const angle = this.worldTime * Math.PI * 2 - Math.PI / 2;
    const sunHeight = Math.sin(angle);
    const daylight = this.daylightAmount();
    const moonlight = (1 - daylight) * clamp((-sunHeight + 0.05) / 0.7, 0, 1);
    const twilight = Math.pow(1 - Math.min(1, Math.abs(sunHeight)), 5) * (sunHeight > -0.38 ? 1 : 0);
    const weatherFx = weatherVisuals(this.weatherState);
    this.dawnSkyColor.set(sunHeight >= 0 ? "#f1a46f" : "#c36b68");
    const sky = this.skyColor.copy(this.nightSkyColor).lerp(this.daylightSkyColor, daylight).lerp(this.dawnSkyColor, twilight * 0.52);
    const headBlock = this.world.getBlock(Math.floor(this.camera.position.x + 0.5), Math.floor(this.camera.position.y + 0.5), Math.floor(this.camera.position.z + 0.5));
    const underwater = headBlock === BlockId.Water;
    const underground = this.skyVisibility < 0.18 && !underwater;
    if (underwater) sky.set("#1d5d82");
    else if (this.weatherState.kind === "sandstorm") sky.lerp(this.weatherSkyColor.set("#b88a55"), weatherFx.fogDensity * 0.62);
    else if (this.weatherState.kind === "ashfall") sky.lerp(this.weatherSkyColor.set("#493f43"), weatherFx.skyDarkening * 0.8);
    else sky.lerp(this.nightSkyColor, weatherFx.skyDarkening * 0.42);
    this.scene.background = sky;
    if (this.scene.fog instanceof THREE.Fog) {
      this.scene.fog.color.copy(sky);
      const view = this.settings.renderDistance * 16;
      const weatherVisibility = 1 - weatherFx.fogDensity * 0.72;
      this.scene.fog.near = underwater ? 3 : underground ? 10 : view * 0.54 * weatherVisibility;
      this.scene.fog.far = underwater ? 24 : underground ? Math.max(30, view * 0.7) : Math.max(28, view * 1.05 * weatherVisibility);
    }
    // Sun and moon are properties of the world, not the player's current
    // square. Player sky visibility still drives cave fog/celestial visibility,
    // but it must never dim a torchlit room or a sunlit opening farther ahead.
    const weatherLight = 1 - weatherFx.skyDarkening * 0.62;
    this.hemisphere.intensity = underwater ? 0.05 : (0.025 + daylight * 0.36 + moonlight * 0.045) * weatherLight;
    this.directional.intensity = underwater ? 0.018 : (daylight * 0.78 + moonlight * 0.05) * weatherLight;
    if (this.weatherState.kind === "thunder" && Math.random() < weatherFx.lightningChancePerSecond * dt) this.directional.intensity += 2.4;
    this.directional.color.set(twilight > 0.22 ? 0xffae7a : daylight > 0.2 ? 0xfff1ce : 0x8da5cf);
    const celestialDistance = 82;
    const celestialDirection = this.celestialDirection.set(Math.cos(angle), Math.sin(angle), -0.24).normalize();
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
    const lively = [BiomeId.Meadow, BiomeId.Wildwood, BiomeId.Savanna, BiomeId.Birchlight, BiomeId.Bloomwood].includes(biome);
    const skyChallenge = this.combatMusicTimer > 0 || (biome === BiomeId.Highlands && this.position.y > 57 && daylight > 0.35);
    const alternateScore = (this.day + biome) % 2 === 0;
    const explorationScore = this.day % 3 === 0
      ? "hoppin"
      : alternateScore ? "wildwoodA" : "wildwoodB";
    const musicScene = skyChallenge ? "skyboss"
      : atSea ? "sea"
        : underground ? (alternateScore ? "emberdeepA" : "emberdeepB")
          : daylight < 0.24 ? "night"
            : lively ? explorationScore : "day";
    this.audio.setMusicScene(musicScene, dt);
  }

  updateRain(dt: number) {
    const visuals = weatherVisuals(this.weatherState);
    this.rain.visible = visuals.precipitation > 0.02 && this.position.y > 5;
    if (!this.rain.visible) return;
    const material = this.rain.material as THREE.LineBasicMaterial;
    material.opacity = clamp(0.18 + visuals.precipitation * 0.5, 0.15, 0.72);
    material.color.set(this.weatherState.kind === "snow" ? 0xf2f6ff : this.weatherState.kind === "sandstorm" ? 0xcda465 : this.weatherState.kind === "ashfall" ? 0x746b72 : 0xa8d8ff);
    const attribute = this.rain.geometry.getAttribute("position") as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    const fallSpeed = this.weatherState.kind === "snow" ? 4.2 : this.weatherState.kind === "ashfall" ? 6.5 : this.weatherState.kind === "sandstorm" ? 15 : 22;
    for (let index = 0; index < array.length; index += 6) {
      array[index + 1] -= dt * fallSpeed;
      array[index + 4] -= dt * fallSpeed;
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

  createAvatarHeldItem(item: ItemCode) {
    const definition = ITEMS[item];
    if (!definition) return null;
    const group = new THREE.Group();
    group.name = `avatar-held-${definition.name.toLowerCase().replace(/\s+/g, "-")}`;
    const addBox = (
      size: [number, number, number],
      position: [number, number, number],
      color: string | number,
      rotation: [number, number, number] = [0, 0, 0],
      emissive = false,
    ) => {
      const material = emissive
        ? new THREE.MeshBasicMaterial({ color })
        : new THREE.MeshLambertMaterial({ color });
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
      mesh.position.set(...position);
      mesh.rotation.set(...rotation);
      group.add(mesh);
    };
    if (item === BlockId.Torch) {
      addBox([0.1, 0.62, 0.1], [0, 0.22, 0], 0x8d542b);
      addBox([0.16, 0.14, 0.16], [0, 0.58, 0], 0xffb33e, [0, 0, 0], true);
      addBox([0.08, 0.11, 0.08], [0, 0.7, 0], 0xfff0a0, [0, 0, 0], true);
    } else if (definition.toolKind) {
      const spec = createHeldToolSpec(definition.toolKind, definition.color, definition.name);
      for (const box of spec.boxes) addBox(
        [...box.size] as [number, number, number],
        [...box.position] as [number, number, number],
        box.color,
        [...(box.rotation ?? [0, 0, 0])] as [number, number, number],
        Boolean(box.emissive),
      );
      group.scale.setScalar(0.5);
      group.rotation.set(-0.1, 0, -0.34);
      group.position.set(0, -0.16, -0.02);
    } else if (definition.useKind === "net") {
      addBox([0.08, 0.9, 0.08], [0, 0.14, 0], 0x7b542f);
      for (let segment = 0; segment < 8; segment += 1) {
        const angle = segment / 8 * Math.PI * 2;
        addBox([0.05, 0.24, 0.05], [Math.cos(angle) * 0.29, 0.66 + Math.sin(angle) * 0.29, 0], 0xd8c892, [0, 0, angle]);
      }
      addBox([0.48, 0.48, 0.025], [0, 0.66, 0], 0xb6d7ce);
      group.scale.setScalar(0.58);
      group.rotation.z = -0.28;
    } else if (definition.useKind === "release-creature") {
      addBox([0.3, 0.38, 0.24], [0, 0.12, 0], 0xbad9dc);
      addBox([0.26, 0.08, 0.22], [0, 0.34, 0], 0x7a5a38);
      addBox([0.13, 0.05, 0.03], [0, 0.14, -0.135], definition.color, [0, 0, 0], true);
      group.scale.setScalar(0.78);
    } else if (definition.placeBlock !== undefined) {
      addBox([0.42, 0.42, 0.42], [0, 0.1, 0], definition.color, [0.16, 0.2, 0]);
    } else {
      addBox([0.28, 0.38, 0.2], [0, 0.1, 0], definition.color, [0.12, 0.15, -0.06]);
    }
    return group;
  }

  equipmentAppearanceFromCodes(codes?: Partial<Record<EquipmentSlot, ItemCode>>): PlayerEquipmentAppearance {
    return Object.fromEntries(((["head", "chest", "legs", "feet"] as EquipmentSlot[]).map((slot) => {
      const item = codes?.[slot];
      return [slot, item === undefined ? null : (ITEMS[item]?.color ?? null)] as const;
    }))) as PlayerEquipmentAppearance;
  }

  syncAvatarHeldItem(model: BlockPlayerModel, item: ItemCode, remoteId?: string) {
    const previousCode = remoteId ? (this.remoteAvatarHeldCodes.get(remoteId) ?? -1) : this.localAvatarHeldCode;
    if (previousCode === item) return;
    const previous = model.rightHandSocket.children[0];
    if (previous) {
      model.setHeldItem(null);
      this.disposeObject(previous);
    }
    const held = item >= 0 ? this.createAvatarHeldItem(item) : null;
    model.setHeldItem(held);
    if (remoteId) this.remoteAvatarHeldCodes.set(remoteId, item);
    else {
      this.localAvatarHeld = held;
      this.localAvatarHeldCode = item;
    }
  }

  updatePlayerModels(dt: number) {
    const horizontalSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const locomotion: PlayerLocomotion = horizontalSpeed < 0.18 ? "idle" : this.sprinting ? "run" : "walk";
    const action: PlayerAction = this.mineHeld || this.attackCooldown > 0 ? "mine" : this.heldUse > 0 ? "use" : "none";
    this.localPlayerModel.group.position.copy(this.position);
    this.localPlayerModel.group.rotation.set(0, this.yaw, 0);
    this.localPlayerModel.group.visible = this.cameraMode !== "first" && !this.titleMode;
    this.localPlayerModel.update(dt, {
      locomotion,
      action,
      crouch: this.crouching ? 1 : 0,
      jump: this.grounded ? 0 : clamp(Math.abs(this.velocity.y) / 8, 0.25, 1),
      headYaw: 0,
      headPitch: this.pitch,
    });
    const localEquipmentCodes = Object.fromEntries((Object.keys(this.equipment) as EquipmentSlot[])
      .map((slot) => [slot, this.equipment[slot]?.item ?? -1] as const));
    const equipmentSignature = JSON.stringify(localEquipmentCodes);
    if (equipmentSignature !== this.localEquipmentSignature) {
      this.localEquipmentSignature = equipmentSignature;
      this.localPlayerModel.setEquipmentAppearance(this.equipmentAppearanceFromCodes(Object.fromEntries(
        Object.entries(localEquipmentCodes).filter(([, item]) => item >= 0),
      )));
    }
    this.syncAvatarHeldItem(this.localPlayerModel, this.selectedSlot()?.item ?? -1);

    const now = performance.now();
    for (const [id, remote] of this.remotePlayers) {
      const alpha = 1 - Math.exp(-dt * 11);
      remote.pose.x += (remote.target.x - remote.pose.x) * alpha;
      remote.pose.y += (remote.target.y - remote.pose.y) * alpha;
      remote.pose.z += (remote.target.z - remote.pose.z) * alpha;
      remote.pose.yaw += Math.atan2(Math.sin(remote.target.yaw - remote.pose.yaw), Math.cos(remote.target.yaw - remote.pose.yaw)) * alpha;
      remote.pose.pitch += (remote.target.pitch - remote.pose.pitch) * alpha;
      remote.model.group.position.set(remote.pose.x, remote.pose.y, remote.pose.z);
      remote.model.group.rotation.set(0, remote.pose.yaw, 0);
      // Position is interpolated, but discrete appearance/action state should
      // switch as soon as the newest packet arrives instead of lagging behind
      // forever in the interpolation snapshot.
      const latest = remote.target;
      const speed = Math.hypot(latest.vx, latest.vz);
      remote.model.update(dt, {
        locomotion: speed < 0.18 ? "idle" : latest.sprinting || speed > 5.2 ? "run" : "walk",
        action: latest.action ?? "none",
        crouch: latest.crouching ? 1 : 0,
        jump: latest.grounded ? 0 : clamp(Math.abs(latest.vy) / 8, 0.25, 1),
        headPitch: remote.pose.pitch,
        headYaw: 0,
      });
      remote.model.setVariant(latest.variant ?? "male");
      remote.model.setEquipmentAppearance(this.equipmentAppearanceFromCodes(latest.equipment));
      this.syncAvatarHeldItem(remote.model, latest.heldItem ?? -1, id);
      if (now - remote.lastUpdate > 20_000) this.removeRemotePlayer(id);
    }
  }

  updateGameplayCamera(dt: number) {
    const targetEye = this.crouching ? 1.3 : 1.62;
    this.cameraEyeHeight += (targetEye - this.cameraEyeHeight) * (1 - Math.exp(-dt * 16));
    if (this.cameraMode === "first") {
      this.camera.position.set(this.position.x, this.position.y + this.cameraEyeHeight, this.position.z);
      this.camera.rotation.set(this.pitch, this.yaw, 0);
      this.heldRoot.visible = true;
      return;
    }
    this.heldRoot.visible = false;
    updateThirdPersonCamera(this.camera, this.position, this.yaw, {
      view: this.cameraMode === "third-front" ? "front" : "rear",
      distance: 4.35,
      targetHeight: this.crouching ? 1.08 : 1.34,
      pitch: clamp(-this.pitch * 0.72, -0.78, 0.78),
      shoulderOffset: this.cameraMode === "third-front" ? 0 : 0.22,
      collisionRadius: 0.18,
      collisionPadding: 0.16,
      minDistance: 0.28,
      deltaSeconds: dt,
      positionSharpness: 18,
    }, (query) => {
      const hit = this.castVoxel(query.origin, query.direction, query.maxDistance + query.radius);
      return hit?.distance ?? null;
    });
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
        const addBox = (size: [number, number, number], position: [number, number, number], color: string | number, rotation: [number, number, number] = [0, 0, 0], emissive = false, parent: THREE.Object3D = this.heldRoot) => {
          const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color, emissive));
          mesh.position.set(...position);
          mesh.rotation.set(...rotation);
          mesh.renderOrder = 20;
          parent.add(mesh);
        };
        if (item === BlockId.Torch) {
          addBox([0.08, 0.48, 0.08], [0, 0, 0], 0x8d542b, [0, 0, -0.12]);
          addBox([0.14, 0.14, 0.14], [-0.03, 0.27, 0], 0xffbe45, [0, 0, 0], true);
          addBox([0.07, 0.08, 0.07], [-0.04, 0.37, 0], 0xffef93, [0, 0, 0], true);
        } else if (item === Item.WildwoodDoor) {
          addBox([0.08, 0.62, 0.38], [0, 0.04, 0], definition.color, [0.08, 0.3, -0.08]);
          addBox([0.09, 0.08, 0.09], [-0.07, 0.02, 0.16], 0xe9c366, [0.08, 0.3, -0.08], true);
        } else if (item === Item.WildwoodBed) {
          addBox([0.48, 0.1, 0.3], [0, -0.08, 0], 0x8b5632, [0.1, 0.28, -0.08]);
          addBox([0.45, 0.13, 0.28], [0, 0.03, 0], definition.color, [0.1, 0.28, -0.08]);
          addBox([0.13, 0.04, 0.24], [-0.13, 0.11, -0.02], 0xe8e1d2, [0.1, 0.28, -0.08]);
        } else if (item === Item.Berry) {
          addBox([0.11, 0.11, 0.11], [-0.07, 0.02, 0], 0x754399, [0.2, 0.1, 0]);
          addBox([0.11, 0.11, 0.11], [0.06, 0.01, 0.02], 0x955bbb, [-0.1, 0.2, 0]);
          addBox([0.1, 0.1, 0.1], [0, 0.12, -0.01], 0x854fa8, [0.1, -0.2, 0]);
          addBox([0.2, 0.035, 0.1], [0, 0.2, 0], 0x568044, [0, 0, 0.28]);
        } else if (item === Item.Apple) {
          addBox([0.23, 0.22, 0.2], [0, 0.02, 0], 0xc8493e, [0.08, 0.18, 0]);
          addBox([0.045, 0.15, 0.045], [0, 0.18, 0], 0x6b4226, [0, 0, -0.08]);
          addBox([0.14, 0.035, 0.08], [0.07, 0.21, 0], 0x5f8d47, [0, 0, 0.32]);
        } else if (item === Item.Stick) {
          addBox([0.075, 0.54, 0.075], [0, 0.02, 0], 0x8b5a30, [0.2, 0.1, -0.36]);
        } else if ([BlockId.RedFlower, BlockId.BlueFlower, BlockId.Sunpetal, BlockId.MoonOrchid].includes(item as BlockId)) {
          addBox([0.05, 0.42, 0.05], [0, -0.05, 0], 0x4d863f, [0.12, 0, -0.16]);
          addBox([0.26, 0.075, 0.26], [-0.03, 0.19, 0], definition.color, [0.08, 0.15, 0.18]);
          addBox([0.07, 0.09, 0.07], [-0.03, 0.22, -0.01], 0xf2c34d, [0, 0, 0], true);
        } else if (item === Item.Feather) {
          addBox([0.045, 0.5, 0.045], [0, 0, 0], 0x8d6846, [0.1, 0.1, -0.42]);
          addBox([0.16, 0.34, 0.035], [-0.06, 0.08, 0], 0xe9d6a7, [0.1, 0.1, -0.42]);
        } else if (item === Item.RawFish || item === Item.CookedFish) {
          addBox([0.32, 0.16, 0.12], [0, 0.02, 0], item === Item.RawFish ? 0x72aeb9 : 0xd98c58, [0.1, 0.25, 0]);
          addBox([0.16, 0.2, 0.06], [0.22, 0.02, 0], item === Item.RawFish ? 0x4c8292 : 0xaa6041, [0.1, 0.25, 0.55]);
        } else if (item === Item.Banana) {
          addBox([0.1, 0.34, 0.09], [-0.08, 0, 0], 0xf4d34f, [0, 0, -0.5]);
          addBox([0.1, 0.34, 0.09], [0.08, 0.04, 0], 0xf4d34f, [0, 0, 0.5]);
        } else if (definition.toolKind) {
          const toolGroup = new THREE.Group();
          const spec = createHeldToolSpec(definition.toolKind, definition.color, definition.name);
          for (const modelBox of spec.boxes) {
            addBox(
              [...modelBox.size] as [number, number, number],
              [...modelBox.position] as [number, number, number],
              modelBox.color,
              [...(modelBox.rotation ?? [0, 0, 0])] as [number, number, number],
              Boolean(modelBox.emissive),
              toolGroup,
            );
          }
          toolGroup.scale.setScalar(0.62);
          toolGroup.rotation.set(0.03, -0.08, -0.54);
          this.heldRoot.add(toolGroup);
        } else if (definition.placeBlock !== undefined) {
          addBox([0.34, 0.34, 0.34], [0, 0.02, 0], definition.color, [0.18, 0.24, 0]);
        } else addBox([0.26, 0.34, 0.18], [0, 0.02, 0], definition.color, [0.12, 0.2, -0.08]);
      }
    }
    this.heldUse = Math.max(0, this.heldUse - dt * 4.5);
    const miningSwing = this.mineHeld ? 0.42 + Math.abs(Math.sin(performance.now() * 0.012)) * 0.58 : 0;
    const activeSwing = Math.max(miningSwing, this.attackCooldown > 0 ? 1 : 0);
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
    this.updateAdaptiveResolution(rawDt);
    this.placeCooldown = Math.max(0, this.placeCooldown - dt);
    this.attackCooldown = Math.max(0, this.attackCooldown - dt);
    this.zombieVoiceCooldown = Math.max(0, this.zombieVoiceCooldown - dt);
    this.combatMusicTimer = Math.max(0, this.combatMusicTimer - dt);

    if (this.titleMode) {
      const t = now * 0.000045;
      this.camera.position.set(this.spawn.x + Math.sin(t) * 24, this.spawn.y + 13 + Math.sin(t * 1.8) * 1.2, this.spawn.z + Math.cos(t) * 24);
      this.camera.lookAt(this.spawn.x, this.spawn.y + 4, this.spawn.z);
      this.world.update(this.spawn.x, this.spawn.z);
    } else {
      this.world.update(this.position.x, this.position.z);
      if (this.running && !this.paused) this.updateBoats(dt);
      if (this.running && !this.paused && (this.locked || this.touchMode)) {
        this.accumulator = Math.min(this.accumulator + dt, PHYSICS_STEP * 4);
        while (this.accumulator >= PHYSICS_STEP) {
          this.updatePlayer(PHYSICS_STEP);
          this.updateMining(PHYSICS_STEP);
          this.accumulator -= PHYSICS_STEP;
        }
      }
      this.updatePlayerModels(dt);
      this.updateGameplayCamera(dt);
      this.updateTarget();
    }

    this.updateLocalLights(dt);
    if (this.running && !this.titleMode && !this.paused) this.updateDynamicWeather(dt);
    this.updateDayNight(dt);
    this.updateChestModel(dt);
    this.updateHeldItem(dt);
    const multiplayerGuest = this.multiplayer?.role === "guest" && this.multiplayerReceivedSnapshot;
    if (this.running && !this.titleMode && !multiplayerGuest) this.updateFurnaces(dt);
    if (this.running && !this.titleMode && !this.paused) {
      if (multiplayerGuest) {
        for (const mob of this.mobs) this.animateMob(mob, dt * mob.definition.speed * 0.35);
      } else this.updateMobs(dt);
      if (!multiplayerGuest) this.updateStructureSpawns(dt);
      this.smallEntityPositions.length = 0;
      for (const mob of this.mobs) if (mob.kind === "glowmoth") this.smallEntityPositions.push(mob.group.position);
      this.butterflies.update(dt, {
        player: this.position,
        daylight: this.daylightAmount(),
        weather: this.weather,
        density: this.butterflyDensity,
        cap: Math.max(0, Math.floor((this.touchMode ? 10 : 18) * this.butterflyDensity)),
        smallEntities: this.smallEntityPositions,
      });
      if (!multiplayerGuest) {
        this.updateDrops(dt);
        this.updateSaplings(dt);
        this.updateFallingTrees(dt);
        this.updateMobRemains(dt);
        this.updateLiquids(dt);
        this.updateProjectiles(dt);
      }
    }
    if (this.running && !this.titleMode) this.updateMultiplayer(dt);
    this.updateRain(dt);
    this.world.updateWaterAnimation(now);
    this.syncExhibitVisuals(false, dt);
    this.updateParticles(dt);
    this.refreshCloudField();
    if (this.cloudMesh) {
      const drift = now * 0.001;
      this.cloudMesh.position.set(
        ((Math.cos(this.weatherState.windAngle) * this.weatherState.windSpeed * drift) % 54 + 54) % 54 - 27,
        0,
        ((Math.sin(this.weatherState.windAngle) * this.weatherState.windSpeed * drift) % 54 + 54) % 54 - 27,
      );
    }
    this.renderer.render(this.scene, this.camera);
    this.performanceSampler.record({
      frameMilliseconds: rawDt * 1000,
      visibleChunks: this.world.loadedCount,
      simulatedEntities: this.mobs.length + this.butterflies.entities.length,
      triangles: this.renderer.info.render.triangles,
    });
    this.performanceReportTimer += dt;
    if (this.performanceReportTimer >= 1.5) {
      this.performanceReportTimer = 0;
      const report = this.performanceSampler.summary();
      this.averageFps = report.framesPerSecond || this.averageFps;
      const budget = this.budgetController.observe(report);
      this.world.setStreamingBudgets(budget.chunkGenerations, budget.chunkMeshSections);
    }
    if (this.running && this.persistent) {
      this.autoSaveAccumulator += dt;
      if (this.autoSaveAccumulator >= 15) {
        if (this.fallingTrees.length) this.autoSaveAccumulator = 14;
        else { this.autoSaveAccumulator = 0; this.saveNow(false); }
      }
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

  renderGameToText() {
    const nearbyMobs = this.mobs
      .map((mob) => ({
        id: mob.id,
        kind: mob.kind,
        name: mob.name,
        position: [Number(mob.group.position.x.toFixed(2)), Number(mob.group.position.y.toFixed(2)), Number(mob.group.position.z.toFixed(2))],
        health: Number(mob.health.toFixed(1)),
        state: mob.petState?.command ?? mob.birdState?.mode ?? mob.state,
      }))
      .sort((left, right) => {
        const ld = (left.position[0] - this.position.x) ** 2 + (left.position[2] - this.position.z) ** 2;
        const rd = (right.position[0] - this.position.x) ** 2 + (right.position[2] - this.position.z) ** 2;
        return ld - rd;
      })
      .slice(0, 16);
    return JSON.stringify({
      coordinateSystem: "World blocks use integer centers; +x east, +y up, +z south. Player y is feet height.",
      version: GAME_VERSION,
      state: this.titleMode ? "title" : this.paused ? "paused" : "playing",
      player: {
        position: [Number(this.position.x.toFixed(2)), Number(this.position.y.toFixed(2)), Number(this.position.z.toFixed(2))],
        yaw: Number(this.yaw.toFixed(3)), pitch: Number(this.pitch.toFixed(3)),
        health: this.health, hunger: this.hunger, oxygen: Number(this.oxygenSeconds.toFixed(2)),
        variant: this.playerVariant, camera: this.cameraMode, sprinting: this.sprinting, crouching: this.crouching, mountedBoatId: this.mountedBoatId,
      },
      world: { seed: this.world.seedText, day: this.day, time: Number(this.worldTime.toFixed(4)), biome: BIOME_NAMES[this.world.biomeAt(Math.round(this.position.x), Math.round(this.position.z))], weather: this.weatherState.kind },
      target: this.target ? { type: "block", name: BLOCKS[this.target.type].name, position: [this.target.x, this.target.y, this.target.z] }
        : this.targetMob ? { type: "mob", id: this.targetMob.id, name: this.targetMob.name }
          : this.targetBoat ? { type: "boat", id: this.targetBoat.save.id } : null,
      nearbyMobs,
      boats: [...this.boats.values()].map((boat) => ({ id: boat.save.id, position: [boat.save.x, boat.save.y, boat.save.z], passengers: boat.save.passengers.length, storageSlots: boat.save.inventory.filter(Boolean).length })),
      exhibits: [...this.chests.entries()].filter(([key]) => key.startsWith("exhibit:")).map(([key, slots]) => ({ key, capacity: slots.length, butterflies: slots.filter(Boolean).length })),
      performance: { averageFps: Number(this.averageFps.toFixed(1)), renderDistance: this.settings.renderDistance, simulationDistance: this.settings.simulationDistance, loadedChunks: this.world.loadedCount },
    });
  }

  advanceSimulation(milliseconds: number) {
    const duration = clamp(Number(milliseconds) || 0, 0, 10_000) / 1000;
    const steps = Math.ceil(duration / PHYSICS_STEP);
    for (let index = 0; index < steps; index += 1) {
      const dt = Math.min(PHYSICS_STEP, duration - index * PHYSICS_STEP);
      if (dt <= 0 || !this.running || this.paused || this.titleMode) break;
      this.updateBoats(dt);
      this.updatePlayer(dt);
      this.updateMobs(dt);
      this.updateProjectiles(dt);
      this.updateLiquids(dt);
      this.updateDynamicWeather(dt);
    }
    this.updateGameplayCamera(Math.min(duration, 0.1));
    this.updateTarget();
    this.renderer.render(this.scene, this.camera);
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
      targetName: this.target ? BLOCKS[this.target.type].name : this.targetBoat ? "Wayfarer Sailboat" : null,
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
      cameraMode: this.cameraMode,
      crouching: this.crouching,
      sprinting: this.sprinting,
      onlinePlayers: 1 + (this.multiplayer?.getPeers().filter((peer) => peer.state === "connected").length ?? 0),
      playerVariant: this.playerVariant,
      oxygen: this.oxygenSeconds,
      maxOxygen: this.countItem(Item.BreatherCharm) > 0 ? 24 : DEFAULT_SWIM_RULES.maxOxygenSeconds,
      submerged: this.headSubmerged,
      averageFps: this.averageFps,
      simulationDistance: this.settings.simulationDistance,
      weatherKind: this.weatherState.kind,
      activePet: this.activePet?.petState ? {
        id: this.activePet.id,
        name: this.activePet.petState.name ?? this.activePet.definition.name,
        command: this.activePet.petState.command,
        health: this.activePet.petState.health,
        maxHealth: this.activePet.petState.maxHealth,
        baby: this.activePet.petState.baby,
        tamed: this.activePet.petState.tamed,
      } : null,
      mountedBoat: Boolean(this.mountedBoatId),
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
    if (this.cloudMesh) {
      this.ambienceGroup.remove(this.cloudMesh);
      this.cloudMesh.geometry.dispose();
      (this.cloudMesh.material as THREE.Material).dispose();
    }
    const geometry = new THREE.SphereGeometry(1, 6, 4);
    const material = new THREE.MeshLambertMaterial({ color: 0xf2f4ef, transparent: true, opacity: 0.8, depthWrite: false });
    this.cloudMesh = new THREE.InstancedMesh(geometry, material, 800);
    this.cloudMesh.name = "poofy-cloud-field";
    this.cloudMesh.userData.cloudField = true;
    this.cloudMesh.frustumCulled = false;
    this.cloudMesh.renderOrder = -1;
    this.ambienceGroup.add(this.cloudMesh);
    this.refreshCloudField(true);
  }

  refreshCloudField(force = false) {
    if (!this.cloudMesh) return;
    const cellX = Math.floor(this.camera.position.x / 54);
    const cellZ = Math.floor(this.camera.position.z / 54);
    if (!force && cellX === this.cloudCellX && cellZ === this.cloudCellZ && this.cloudWeatherCycle === this.weatherState.cycle) return;
    this.cloudCellX = cellX;
    this.cloudCellZ = cellZ;
    this.cloudWeatherCycle = this.weatherState.cycle;
    const plans = planCloudField(this.world.seedText, cellX, cellZ, 3, this.weatherState);
    let instance = 0;
    for (const plan of plans) for (const lobe of plan.lobes) {
      if (instance >= this.cloudMesh.instanceMatrix.count) break;
      this.cloudMatrixObject.position.set(plan.x + lobe.x, plan.y + lobe.y, plan.z + lobe.z);
      this.cloudMatrixObject.scale.set(lobe.scaleX, lobe.scaleY, lobe.scaleZ);
      this.cloudMatrixObject.rotation.set(0, (instance % 7) * 0.19, 0);
      this.cloudMatrixObject.updateMatrix();
      this.cloudMesh.setMatrixAt(instance, this.cloudMatrixObject.matrix);
      instance += 1;
    }
    this.cloudMesh.count = instance;
    this.cloudMesh.instanceMatrix.needsUpdate = true;
    const material = this.cloudMesh.material as THREE.MeshLambertMaterial;
    material.color.set(this.weatherState.kind === "thunder" ? 0x707982 : this.weatherState.kind === "sandstorm" ? 0xc3a06a : this.weatherState.kind === "ashfall" ? 0x777177 : 0xf2f4ef);
    material.opacity = this.weatherState.kind === "clear" ? 0.72 : 0.86;
  }

  setSettings(next: Partial<GameSettings>) {
    const distances = normalizeViewDistances({
      renderDistance: next.renderDistance ?? this.settings.renderDistance,
      simulationDistance: next.simulationDistance ?? this.settings.simulationDistance,
    });
    this.settings = {
      ...this.settings,
      ...next,
      volume: clamp(next.volume ?? this.settings.volume, 0, 1),
      sensitivity: clamp(next.sensitivity ?? this.settings.sensitivity, 0.0008, 0.005),
      fov: clamp(next.fov ?? this.settings.fov, 55, 100),
      ...distances,
    };
    this.weather = this.worldOptions.weather ? this.settings.weather : "clear";
    this.camera.fov = this.settings.fov;
    this.camera.updateProjectionMatrix();
    this.world.setRenderDistance(this.settings.renderDistance);
    this.lightRefreshTimer = 0;
    this.audio.setSettings(this.settings);
    writeSettings(this.settings);
    this.emitHud(true);
  }

  setWeather(weather: Weather) {
    if (!this.worldOptions.weather && weather === "rain") {
      this.events.onToast("Weather was disabled when this world was created.");
      return;
    }
    this.weather = weather;
    this.weatherState = {
      ...this.weatherState,
      kind: weather,
      elapsedSeconds: 0,
      durationSeconds: weather === "rain" ? 240 : 420,
      intensity: weather === "rain" ? 0.78 : 0,
    };
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
      lastSavedGameVersion: GAME_VERSION,
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
      drops: this.drops.map((drop) => ({
        item: drop.item, count: drop.count,
        ...(drop.durability !== undefined ? { durability: drop.durability } : {}),
        ...(drop.metadata ? { metadata: cloneSlot({ item: drop.item, count: 1, metadata: drop.metadata })?.metadata } : {}),
        x: drop.mesh.position.x, y: drop.mesh.position.y, z: drop.mesh.position.z, age: drop.age,
      })),
      options: { ...this.worldOptions },
      playerVariant: this.playerVariant,
      liquidLevels: [...this.liquidCells.entries()].map(([key, cell]) => [key, { ...cell }]),
      weatherState: { ...this.weatherState },
      creatures: this.mobs.map((mob) => ({
        id: mob.id,
        kind: mob.kind,
        x: mob.group.position.x,
        y: mob.group.position.y,
        z: mob.group.position.z,
        yaw: mob.angle,
        health: mob.health,
        age: mob.age,
        ...(mob.persistentPoiResident ? { persistentPoiResident: true } : {}),
        ...(mob.poiMarkerId ? { poiMarkerId: mob.poiMarkerId } : {}),
        ...(mob.enclosed ? { enclosed: true } : {}),
        ...(mob.petState ? { petState: { ...mob.petState } } : {}),
      })),
      activatedStructureMarkers: [...this.activatedStructureMarkers],
      boats: [...this.boats.values()].map(({ save }) => ({
        ...save,
        passengers: [...save.passengers],
        inventory: save.inventory.map(cloneSlot),
      })),
      savedAt: Date.now(),
    };
  }

  saveNow(notify = true) {
    if (!this.persistent) return;
    window.clearTimeout(this.saveTimer);
    if (this.fallingTrees.length) this.settleAllFallingTrees();
    const save = this.serialize();
    try {
      const now = Date.now();
      const playTimeDeltaMs = Math.max(0, now - this.worldSessionStartedAt);
      const result = this.activeWorldId
        ? this.worldStorage.saveWorld(this.activeWorldId, { save, playTimeDeltaMs })
        : this.worldStorage.createWorld({ name: this.world.seedText || "New World", save, options: this.worldOptions });
      if (result.ok) {
        this.activeWorldId = result.value.id;
        this.worldSessionStartedAt = now;
        window.localStorage.removeItem(SAVE_KEY);
        if (notify) this.events.onSave();
        return;
      }
      // A legacy single-save fallback keeps the current session recoverable if
      // a browser cannot commit the catalog transaction.
      window.localStorage.setItem(SAVE_KEY, JSON.stringify(save));
      if (notify) this.events.onSave();
      this.events.onToast(result.error.message);
    } catch {
      this.events.onToast("This world grew beyond the browser's save allowance. The current session is safe, but storage is full.");
    }
  }

  dispose() {
    this.disposed = true;
    this.unlockFullscreenEscape();
    this.saveNow(false);
    cancelAnimationFrame(this.animationFrame);
    window.clearTimeout(this.saveTimer);
    this.unbindEvents();
    this.resizeObserver?.disconnect();
    this.audio.dispose();
    this.disconnectMultiplayer();
    this.clearEntities();
    this.hideChestModel(true);
    this.disposeObject(this.heldRoot);
    this.disposeObject(this.selection);
    for (const celestial of [this.sun, this.moon]) {
      const material = celestial.material as THREE.MeshBasicMaterial;
      material.map?.dispose();
      this.disposeObject(celestial);
    }
    this.disposeObject(this.stars);
    this.disposeObject(this.rain);
    this.disposeObject(this.ambienceGroup);
    this.butterflies.dispose();
    this.localPlayerModel.dispose();
    for (const remote of this.remotePlayers.values()) remote.model.dispose();
    this.remotePlayers.clear();
    this.world.dispose();
    this.sharedDropGeometry.dispose();
    for (const material of this.dropMaterials.values()) material.dispose();
    this.renderer.dispose();
  }
}
