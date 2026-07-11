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
  createAtlasBlockGeometry,
  type ChunkEditSave,
} from "./world";
import { BUTTERFLY_ORDER, MOB_DEFS, MOB_ORDER, type ButterflyKind, type CoreMobKind, type MobDefinition, type MobKind } from "./mobs";
import { createHeldToolSpec } from "./model-specs";
import { createMobVisual } from "./mob-models";
import { ButterflySystem, createButterflyVisual } from "./butterflies";
import {
  createBirdBehavior,
  createStableSteering,
  chooseLocalWalkableGround,
  fishKindsForHabitat,
  naturalGroupSizeForMob,
  passiveMobKindForBiome,
  shouldKeepCreatureLoaded,
  updateBirdBehavior,
  updateStableSteering,
  type BirdBehaviorState,
  type StableSteeringState,
} from "./fauna";
import {
  breedCreatureStates,
  canBreedCreatures,
  feedCreatureForHusbandry,
  normalizeCreatureHusbandryState,
  tickCreatureHusbandry,
  type CreatureHusbandryState,
} from "./creature-care";
import {
  chooseCreatureRoute,
  createCreatureRouteState,
  creatureCollisionProfile,
  findFollowerTeleportTarget,
  followerTravelSpeed,
  planFollowerFormation,
  separateCreatureCircles,
  shouldTeleportFollower,
  type CreatureRouteProbe,
  type CreatureRouteState,
  type FollowerFormationTarget,
} from "./creature-pathing";
import {
  canRideShadecrawler,
  createShadecrawlerState,
  equipShadecrawlerSaddle,
  feedShadecrawler,
  normalizeShadecrawlerState,
  shadecrawlerScale,
  type ShadecrawlerState,
} from "./shadecrawler";
import { CREATURE_SOUND_EVENTS, creatureSoundCue, type CreatureSoundEvent } from "./creature-sounds";
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
  EXHIBIT_BREEDING_CYCLE_SECONDS,
  exteriorExhibitFrameEdges,
  isSmallExhibitCreature,
  planExhibitBreeding,
  sampleExhibitResidentPose,
  type ExhibitCreature,
  type ExhibitResident,
  type ExhibitTopology,
} from "./butterfly-exhibit";
import { createAvatarHeldItemModel } from "./held-items";
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
  applyResourceMode,
  chunkRetentionPadding,
  type ResourceMode,
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
  playerEyeHeightForVariant,
  playerVariantHeightScale,
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
  isMultiplayerOperationCancellation,
  type BlockAction,
  type CartographyMapShare,
  type MultiplayerEvent,
  type MultiplayerSessionState,
  type PeerInfo,
  type PlayerPose,
  type WorldSnapshot,
  type SleepTarget,
  type SleepVote,
} from "./multiplayer";
import {
  createRoomCode,
  hostByRoomCode,
  joinByRoomCode,
  type HostRendezvous,
  type RendezvousStatus,
} from "./invite-rendezvous";
import {
  DEFAULT_WORLD_OPTIONS,
  WorldStorage,
  generationOptionsFromWorldOptions,
  normalizeWorldOptions,
  requiredSleepers,
  type WorldMetadata,
  type WorldOptions,
} from "./world-storage";
import {
  canGrowPlant,
  canHitchLead,
  canTill,
  constrainLead,
  discoverRootedTree,
  farmlandState,
  FENCE_BLOCKS,
  fenceGateForYaw,
  growthDelaySeconds,
  harvestPlant,
  nextPlantStage,
  ORCHARD_REGROWTH_BASE_MS,
  ORCHARD_REGROWTH_JITTER_MS,
  planAppleFruitRegrowth,
  planAppleTree,
  plantProfileForBlock,
  plantingResult,
  resolveBucketAction,
  restoreLeadAnchors,
  serializeLeadAnchors,
  toggleFenceGate,
  type LeadAnchor,
  type SavedLeadAnchor,
} from "./farming";
import {
  planLeafParticles,
  stepLeafParticle,
  torchAnimationSample,
  type LeafParticle,
} from "./world-effects";
import {
  APIARY_HONEY_CAP,
  APIARY_HONEY_CYCLE_SECONDS,
  APIARY_JELLY_CAP,
  APIARY_NECTAR_CAP,
  APIARY_WORKER_CAP,
  apiaryContainerStatus,
  beeStingProfile,
  breakApiary,
  canCatchHiveQueen,
  captureWorkerBeeItem,
  createApiary,
  createEmptyApiaryBlock,
  createWildApiary,
  insertQueenCellIntoApiary,
  livingApiaryWorkers,
  planWorkerForaging,
  stepApiary,
  tameHiveQueen,
  type ApiaryBee,
  type ApiaryPhase,
  type ApiaryState,
  type EmptyApiaryBlock,
} from "./apiary";
import {
  CAPTURE_ORB_RACK_SIZE,
  CREATURE_HEAL_INTERVAL_SECONDS,
  CREATURE_HEALER_GEL_CAP,
  captureIntoOrb,
  captureOrbFromInventorySlot,
  captureOrbInventorySlot,
  createCreatureHealer,
  createEmptyCaptureOrb,
  createOrbRack,
  decodeCaptureOrb,
  encodeCaptureOrb,
  healingStationContainerStatus,
  migrateCaptureOrbInventorySlot,
  orbRackContainerStatus,
  releaseCaptureOrb,
  setHealerOrb,
  setRackOrb,
  stepCreatureHealer,
  type CaptureOrb,
  type CreatureHealerState,
  type OrbRackState,
} from "./capture-orbs";
import {
  canRideReedstrider,
  createPeelopSheddingState,
  createReedstriderBond,
  feedReedstrider,
  peelopDefenseAction,
  planSocialGroupMotion,
  puddlehopperJumpPlan,
  reedstriderRideSpeed,
  saddleReedstrider,
  stepPeelopShedding,
  type PeelopSheddingState,
  type ReedstriderBond,
  type SocialGroupMode,
  type SocialGroupMotion,
} from "./ecology";
import {
  advanceFastTravelChannel,
  bankFastTravelCharges,
  beginFastTravel,
  commitFastTravel,
  createCartographySession,
  createMapKnowledge,
  discoverNaturalPoi,
  markChunksRendered,
  normalizeMapKnowledge,
  placeManualMapMarker,
  placeWayshrine,
  removeManualMapMarker,
  renameWayshrine,
  setBedSpawn,
  joinCartographySession,
  shareMapsAtCartographyTable,
  type FastTravelChannel,
  type MapKnowledge,
} from "./map-system";
import {
  HEARTHROADS_MAIN_QUESTS,
  acceptQuest,
  abandonQuest,
  applyQuestEvent,
  createQuestBook,
  normalizeQuestBook,
  pinQuest,
  turnInQuest,
  type QuestBook,
  type QuestDefinition,
  type QuestEvent,
} from "./quests";
import {
  collectAlchemyOutput,
  collectDistilleryOutput,
  createAlchemyStand,
  createDistillery,
  normalizeAlchemyStand,
  normalizeDistillery,
  startAlchemyBatch,
  startDistilleryBatch,
  stepAlchemyStand,
  stepDistillery,
  type AlchemyStandState,
  type DistilleryState,
} from "./alchemy";
import {
  blueprintCraftingLock,
  createBlueprintState,
  normalizeBlueprintState,
  useBlueprintItem as consumeBlueprintItem,
  type BlueprintState,
} from "./blueprints";
import {
  createPlantBestiaryState,
  discoverPlantBlock,
  normalizePlantBestiaryState,
  type PlantBestiaryState,
} from "./plants";
import {
  POTION_RECIPE_BY_ITEM,
  commerceItemCode,
  commerceKeyForItem,
  consumedResourceDelta,
  inventoryResourceCounts,
  resourceItemCode,
  resourceIdForItem,
} from "./hearthroads-adapter";
import {
  applyFactionMemberKill,
  applyQuestAlignmentReward,
  applyTownCaptureConsequences,
  createFactionRelations,
  evaluateTownCapture,
  factionStanding,
  type FactionRelationsState,
} from "./factions";
import {
  STOCK_SYMBOLS,
  buyFromMerchant,
  buyStock,
  debitGold,
  compoundBankInterest,
  createBankAccount,
  createGoldWallet,
  createMerchant,
  createStockMarket,
  creditGold,
  depositAtBank,
  restockMerchant,
  sellStock,
  sellToMerchant,
  stepStockMarket,
  withdrawFromBank,
  type BankAccountState,
  type CommerceItem,
  type GoldWalletState,
  type MerchantState,
  type StockMarketState,
  type StockSymbol,
} from "./economy";
import {
  createSettlementState,
  applySettlementCapture,
  electMayorAtEight,
  findRoleWaypoint,
  growSettlementPopulation,
  hireResident,
  merchantProfessionForResident,
  normalizeFollowDistance,
  planResidentSchedule,
  sideQuestOffersFor,
  updateHirelingOrders,
  type FollowDistanceSetting,
  type ResidentProfession,
  type SettlementState,
} from "./settlements";

export { BLOCKS, CREATIVE_BLOCKS, ITEMS, Item, RECIPES, BlockId, BIOME_NAMES, MOB_DEFS, MOB_ORDER, WorldStorage, DEFAULT_WORLD_OPTIONS, type WorldOptions, type WorldMetadata, type GameMode, type InventorySlot, type ItemCode, type Recipe, type EquipmentSlot, type MobKind, type SleepTarget, type PlayerVariant };

export const SAVE_KEY = "blockwild-world-v2";
export const SETTINGS_KEY = "blockwild-settings-v2";
export const CLOVERBACK_MILK_COOLDOWN_SECONDS = 90;
const LEGACY_GENERATOR_MIN_Y = -32;

export type GameSettings = {
  volume: number;
  muted: boolean;
  sensitivity: number;
  fov: number;
  weather: Weather;
  renderDistance: number;
  simulationDistance: number;
  showFps: boolean;
  resourceMode: ResourceMode;
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
export type ApiaryBlockState = ApiaryState | EmptyApiaryBlock;
export type ApiaryHudState = {
  queen: ApiaryBee | null;
  queenPresent: boolean;
  queenName: string;
  workers: readonly ApiaryBee[];
  workerCount: number;
  maxWorkers: number;
  nectar: number;
  nectarStatus: string;
  honey: number;
  honeyMax: number;
  royalJelly: number;
  royalJellyMax: number;
  productionProgress: number;
  honeyClock: number;
  honeyCycleSeconds: number;
  slots: Array<InventorySlot | null>;
};
export type OrbRackHudState = { slots: Array<InventorySlot | null> };
export type HealingStationHudState = OrbRackHudState & {
  gelUnits: number;
  healClock: number;
  healIntervalSeconds: number;
  healingProgress: number[];
};
export type BestiaryProgress = Record<MobKind, {
  seen: boolean;
  kills: number;
  captures: number;
  tames?: number;
  breeds?: number;
  secretUnlocked?: boolean;
}>;
export type RecipePlanResult =
  | { ok: true; recipeId: string; message: string }
  | { ok: false; recipeId: string; reason: "unknown" | "needs-table" | "blueprint-locked" | "missing" | "inventory-full"; message: string; missing?: string[] };

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
  activeApiary?: ApiaryHudState | null;
  activeOrbRack?: OrbRackHudState | null;
  activeHealingStation?: HealingStationHudState | null;
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
  mountedCreature?: boolean;
  mountedCreatureName?: string | null;
  mapKnowledge: MapKnowledge;
  questBook: QuestBook;
  questDefinitions: readonly QuestDefinition[];
  blueprints: BlueprintState;
  plantBestiary: PlantBestiaryState;
  activeAlchemy: AlchemyStandState | null;
  activeDistillery: DistilleryState | null;
  goldWallet: GoldWalletState;
  factionRelations: FactionRelationsState;
  settlements: readonly SettlementState[];
  activeSettlementId: string | null;
  activeMerchant: MerchantState | null;
  activeSentient?: { id: number; residentId: string | null; name: string; profession: string | null; factionId: "hobbits" | "goblins" | "player" | null; hired: boolean; followDistance: FollowDistanceSetting } | null;
  bankAccount: BankAccountState;
  stockMarket: StockMarketState;
  potionBuffs: Readonly<Record<string, number>>;
  fastTravelChannel: FastTravelChannel | null;
  rangedWeapon: { loaded: number; magazine: number; spare: number; reloading: boolean } | null;
};

export type SavedCreature = {
  id: number;
  kind: MobKind;
  name?: string;
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
  careState?: CreatureHusbandryState;
  shadeState?: ShadecrawlerState;
  reedstriderBond?: ReedstriderBond;
  courserBond?: ReedstriderBond;
  apiaryBee?: ApiaryBee;
  socialGroupId?: string;
  peelopShedding?: PeelopSheddingState;
  milkCooldown?: number;
  factionId?: "hobbits" | "goblins" | "player" | null;
  profession?: string | null;
  settlementId?: string | null;
  residentId?: string | null;
  aligned?: boolean;
  hiredByPlayerId?: string | null;
  followDistance?: FollowDistanceSetting;
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
  apiaries?: Record<string, ApiaryBlockState>;
  orbRacks?: Record<string, OrbRackState>;
  healingStations?: Record<string, CreatureHealerState>;
  alchemyStands?: Record<string, AlchemyStandState>;
  distilleries?: Record<string, DistilleryState>;
  mapKnowledge?: MapKnowledge;
  questBook?: QuestBook;
  sideQuestDefinitions?: QuestDefinition[];
  blueprints?: BlueprintState;
  plantBestiary?: PlantBestiaryState;
  goldWallet?: GoldWalletState;
  factionRelations?: FactionRelationsState;
  settlements?: SettlementState[];
  merchants?: Record<string, MerchantState>;
  bankAccount?: BankAccountState;
  stockMarket?: StockMarketState;
  potionBuffs?: Record<string, number>;
  rangedLoaded?: Record<string, number>;
  drops?: Array<{ item: ItemCode; count: number; durability?: number; metadata?: Record<string, unknown>; x: number; y: number; z: number; age: number }>;
  options?: Partial<WorldOptions>;
  playerVariant?: PlayerVariant;
  liquidLevels?: Array<[string, LiquidCell]>;
  weatherState?: WeatherState;
  creatures?: SavedCreature[];
  activatedStructureMarkers?: string[];
  boats?: SailboatSave[];
  leads?: SavedLeadAnchor[];
  savedAt: number;
};

export type OverlayKind = "inventory" | "crafting" | "furnace" | "chest" | "apiary" | "orb-rack" | "healing-station" | "bestiary" | "multiplayer" | "sleep" | "pet" | "map" | "quests" | "cartography" | "alchemy" | "distillery" | "sentient" | "trade" | "bank" | "settlement" | "follower";
export type CameraMode = "first" | "third-rear" | "third-front";

export type MultiplayerUiState = {
  supported: boolean;
  reasons: string[];
  status: MultiplayerSessionState;
  role: "host" | "guest" | null;
  peers: PeerInfo[];
  inviteCode: string;
  answerCode: string;
  roomCode: string;
  rendezvousStatus: RendezvousStatus;
  error: string;
};

export type EngineEvents = {
  onHud: (hud: HudState) => void;
  /** Immediate, lightweight selection signal for responsive React hotbar chrome. */
  onSelectedSlot?: (slot: number) => void;
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
  route: CreatureRouteState;
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
  careState: CreatureHusbandryState | null;
  shadeState: ShadecrawlerState | null;
  reedstriderBond: ReedstriderBond | null;
  courserBond: ReedstriderBond | null;
  apiaryBee: ApiaryBee | null;
  beeHiveKey: string | null;
  socialGroupId: string | null;
  peelopShedding: PeelopSheddingState | null;
  milkCooldown: number;
  shadeSaddle: THREE.Object3D | null;
  visualBaseY: number;
  visualMinY: number;
  persistentPoiResident: boolean;
  poiMarkerId: string | null;
  enclosed: boolean;
  enclosureTimer: number;
  sightCheckTimer: number;
  awarenessTimer: number;
  seesPlayer: boolean;
  factionId: "hobbits" | "goblins" | "player" | null;
  profession: string | null;
  settlementId: string | null;
  residentId: string | null;
  aligned: boolean;
  hiredByPlayerId: string | null;
  followDistance: FollowDistanceSetting;
};

type SailboatEntity = {
  save: SailboatSave;
  group: THREE.Group;
};

type ExhibitVisual = {
  group: THREE.Group;
  topologySignature: string;
  specimenSignature: string;
  lastBreedingCycle: number;
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
  careState?: CreatureHusbandryState | null;
  shadeState?: ShadecrawlerState | null;
  reedstriderBond?: ReedstriderBond | null;
  courserBond?: ReedstriderBond | null;
  apiaryBee?: ApiaryBee | null;
  beeHiveKey?: string | null;
  socialGroupId?: string | null;
  peelopShedding?: PeelopSheddingState | null;
  milkCooldown?: number;
  name?: string | null;
  factionId?: "hobbits" | "goblins" | "player" | null;
  profession?: string | null;
  settlementId?: string | null;
  residentId?: string | null;
  aligned?: boolean;
  hiredByPlayerId?: string | null;
  followDistance?: FollowDistanceSetting;
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
  primaryLogType: BlockId;
  logDrops: Array<[BlockId, number]>;
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
  mesh: THREE.Object3D;
  ownsVisual?: boolean;
  velocity: THREE.Vector3;
  age: number;
  pickupDelay: number;
};

type Particle = {
  mesh: THREE.Mesh;
  velocity: THREE.Vector3;
  life: number;
};

type LeafParticleVisual = {
  object: THREE.Group;
  state: LeafParticle;
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
const TREE_PERCH_BLOCKS = new Set<BlockId>([
  BlockId.WildwoodLog, BlockId.PineLog, BlockId.BirchLog, BlockId.BloomLog,
  BlockId.WildwoodLeaves, BlockId.PineLeaves, BlockId.BirchLeaves, BlockId.BloomLeaves,
]);
const CRAFT_POSITIONS_2 = [0, 1, 3, 4];
const MAIN_THEN_HOTBAR = [...Array.from({ length: 27 }, (_, index) => index + 9), ...Array.from({ length: 9 }, (_, index) => index)];
export const COMBAT_MUSIC_HOLD_SECONDS = 22.5;
export const DEFAULT_UNARMED_DAMAGE = 1;
// Hearthroads trims the already-reduced night pressure by another 40% while
// keeping encounters meaningful near genuine darkness.
export const HOSTILE_SPAWN_ATTEMPT_SCALE = 2.5;
export const HOSTILE_CAP_SCALE = 0.42;

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

export function bedRespawnCandidates(type: BlockId, x: number, y: number, z: number) {
  const partner = bedCounterpart(type, x, y, z);
  const bedCells = [{ x, y, z }, ...(partner ? [{ x: partner.x, y: partner.y, z: partner.z }] : [])];
  const seen = new Set<string>();
  const candidates: Array<{ x: number; y: number; z: number }> = [];
  for (const bed of bedCells) for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) {
    const candidate = { x: bed.x + dx, y: bed.y, z: bed.z + dz };
    const key = `${candidate.x},${candidate.y},${candidate.z}`;
    if (bedCells.some((cell) => cell.x === candidate.x && cell.z === candidate.z) || seen.has(key)) continue;
    seen.add(key);
    candidates.push(candidate);
  }
  return candidates;
}

export function isInstantBreakBlock(type: BlockId) {
  return ["cross", "bush", "fruit"].includes(BLOCKS[type]?.shape ?? "");
}

export function isOpenableBlock(type: BlockId) {
  return [
    BlockId.DoorClosedLower, BlockId.DoorClosedUpper, BlockId.DoorOpenLower, BlockId.DoorOpenUpper,
    BlockId.DoorXClosedLower, BlockId.DoorXClosedUpper, BlockId.DoorXOpenLower, BlockId.DoorXOpenUpper,
    BlockId.FenceGateNorthSouthClosed, BlockId.FenceGateNorthSouthOpen, BlockId.FenceGateEastWestClosed, BlockId.FenceGateEastWestOpen,
    BlockId.CraftingTable, BlockId.Furnace, BlockId.Chest, BlockId.ButterflyExhibit,
    BlockId.Apiary, BlockId.WildBeehive, BlockId.CaptureOrbRack, BlockId.CreatureHealer,
    BlockId.CartographyTable, BlockId.AlchemyStand, BlockId.Wayshrine, BlockId.Distillery, BlockId.HearthChair,
    BlockId.BedNorthFoot, BlockId.BedNorthHead, BlockId.BedSouthFoot, BlockId.BedSouthHead,
    BlockId.BedEastFoot, BlockId.BedEastHead, BlockId.BedWestFoot, BlockId.BedWestHead,
  ].includes(type);
}

export function shouldBypassOpenableUse(crouching: boolean, heldPlacesBlock: boolean, target: BlockId) {
  return crouching && heldPlacesBlock && isOpenableBlock(target);
}

export function mobPopulationCaps(totalCap: number) {
  const total = Math.max(0, Math.floor(totalCap));
  const passive = Math.ceil(total * 0.55);
  return { total, passive, hostile: total === 0 ? 0 : Math.max(1, Math.floor((total - passive) * HOSTILE_CAP_SCALE)) };
}

export function positionInPlayerViewCone(yaw: number, dx: number, dz: number, halfAngle = Math.PI * 0.34) {
  const distance = Math.hypot(dx, dz);
  if (distance < 0.0001) return true;
  const forwardX = -Math.sin(yaw);
  const forwardZ = -Math.cos(yaw);
  return (dx * forwardX + dz * forwardZ) / distance >= Math.cos(halfAngle);
}

export function nextPeelopBananaShedSeconds(id: number, cycle: number) {
  const mixed = Math.imul((id | 0) ^ Math.imul(cycle | 0, 0x45d9f3b), 0x27d4eb2d) >>> 0;
  return 135 + (mixed % 76);
}

export function combatSceneForEncounter(encounter: number): "combatA" | "combatB" {
  return Math.abs(Math.floor(encounter)) % 2 === 0 ? "combatA" : "combatB";
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
  "wild-honeycomb": Item.Honeycomb,
  beeswax: Item.Beeswax,
  "wildflower-honey": Item.HoneyJar,
  "royal-jelly": Item.RoyalJelly,
  "queen-cell": Item.QueenCell,
  "cloudglass-reliquary": Item.CloudglassRelic,
  "waykeeper-capture-orb": Item.CaptureOrb,
  "cave-gel": Item.CaveGel,
  moonberry: Item.Berry,
});

export function resolveStructureLootItem(itemKey: string): ItemCode | null {
  return STRUCTURE_LOOT_ITEMS[itemKey] ?? null;
}

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
  if (parsed.generatorVersion === 3 || parsed.generatorVersion === 4 || parsed.generatorVersion === 5 || parsed.generatorVersion === 6) return { ...parsed, generatorVersion: GENERATOR_VERSION };
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
    return [key, Array.from({ length: size }, (_, index) => normalizeCaptureOrbInventorySlot(value[index] ?? null))] as const;
  }));
}

export function normalizeCaptureOrbInventorySlot(slot: InventorySlot | null | undefined) {
  const copy = cloneSlot(slot ?? null);
  return copy ? migrateCaptureOrbInventorySlot(copy) : null;
}

let looseCaptureOrbSerial = 0;

export function captureOrbUnitFromInventorySlot(slot: InventorySlot | null | undefined) {
  if (!slot || (slot.item !== Item.CaptureOrb && slot.item !== Item.LegacyCaptureOrb) || slot.count <= 0) return null;
  if (slot.metadata?.captureOrb || slot.metadata?.capturedCreature) return slot.count === 1 ? captureOrbFromInventorySlot(slot) : null;
  // Plain crafted orbs do not carry identity metadata until first use. Mint it
  // at that boundary so two orbs split from the same stack never share an id.
  looseCaptureOrbSerial += 1;
  return createEmptyCaptureOrb(`orb-loose-${Date.now().toString(36)}-${looseCaptureOrbSerial.toString(36)}-${slot.item}-${slot.count}`);
}

export function apiaryPhaseForWorldTime(worldTime: number): ApiaryPhase {
  const time = ((Number(worldTime) || 0) % 1 + 1) % 1;
  if (time >= 0.235 && time < 0.69) return "day";
  if (time >= 0.69 && time < 0.805) return "dusk";
  return "night";
}

const HERD_MOB_KINDS = new Set<MobKind>(["ridgeback", "woolhorn", "sunstep-grazer", "wild-horse", "meadow-cow", "mistmane"]);

export function socialGroupModeForMob(kind: MobKind): SocialGroupMode | null {
  if (HERD_MOB_KINDS.has(kind)) return "herd";
  return MOB_DEFS[kind]?.family === "fish" ? "shoal" : null;
}

export function feedCourserBond(state: ReedstriderBond, ownerId: string, item: ItemCode): ReedstriderBond {
  if (item !== Item.Apple && item !== Item.Wheat) return state;
  const trust = Math.min(8, state.trust + (item === Item.Apple ? 2 : 1));
  return { ...state, trust, tamed: state.tamed || trust >= 6, ownerId: state.ownerId ?? (trust >= 6 ? ownerId : null) };
}

export function isStockedApiary(state: ApiaryBlockState): state is ApiaryState {
  return state.queen !== null;
}

function cloneApiaryBlockState(value: ApiaryBlockState): ApiaryBlockState {
  if (!value || value.schema !== 1 || value.queen === null) return createEmptyApiaryBlock();
  const clone = JSON.parse(JSON.stringify(value)) as ApiaryState;
  return {
    ...clone,
    workers: Array.isArray(clone.workers) ? clone.workers.slice(0, APIARY_WORKER_CAP) : [],
    nectar: clamp(Number(clone.nectar) || 0, 0, APIARY_NECTAR_CAP),
    honey: clamp(Number(clone.honey) || 0, 0, APIARY_HONEY_CAP),
    royalJelly: clamp(Number(clone.royalJelly) || 0, 0, APIARY_JELLY_CAP),
    honeyClock: Math.max(0, Number(clone.honeyClock) || 0),
    jellyClock: Math.max(0, Number(clone.jellyClock) || 0),
    workerGrowthClock: Math.max(0, Number(clone.workerGrowthClock) || 0),
    nextWorkerSerial: Math.max(0, Math.floor(Number(clone.nextWorkerSerial) || 0)),
  };
}

export function restoreApiaryStorage(saved: Record<string, ApiaryBlockState> = {}) {
  return new Map(Object.entries(saved).map(([key, state]) => [key, cloneApiaryBlockState(state)] as const));
}

function cloneCaptureOrb(orb: CaptureOrb | null | undefined) {
  return orb ? decodeCaptureOrb(encodeCaptureOrb(orb)) : null;
}

export function restoreOrbRackStorage(saved: Record<string, OrbRackState> = {}) {
  return new Map(Object.entries(saved).map(([key, state]) => [key, createOrbRack((state?.slots ?? []).map(cloneCaptureOrb))] as const));
}

export function restoreHealingStationStorage(saved: Record<string, CreatureHealerState> = {}) {
  return new Map(Object.entries(saved).map(([key, state]) => {
    const base = createCreatureHealer((state?.slots ?? []).map(cloneCaptureOrb), state?.gelUnits ?? 0);
    return [key, {
      ...base,
      healClock: clamp(Number(state?.healClock) || 0, 0, CREATURE_HEAL_INTERVAL_SECONDS),
      healCycles: Math.max(0, Math.floor(Number(state?.healCycles) || 0)),
    }] as const;
  }));
}

export function apiaryHudState(state: ApiaryBlockState): ApiaryHudState {
  if (!isStockedApiary(state)) return {
    queen: null,
    queenPresent: false,
    queenName: "No Queen",
    workers: [],
    workerCount: 0,
    maxWorkers: APIARY_WORKER_CAP,
    nectar: 0,
    nectarStatus: "Awaiting a queen",
    honey: 0,
    honeyMax: APIARY_HONEY_CAP,
    royalJelly: 0,
    royalJellyMax: APIARY_JELLY_CAP,
    productionProgress: 0,
    honeyClock: 0,
    honeyCycleSeconds: APIARY_HONEY_CYCLE_SECONDS,
    slots: [null, null, null],
  };
  const status = apiaryContainerStatus(state);
  const workers = livingApiaryWorkers(state);
  const away = workers.filter((worker) => !worker.home || worker.outbound).length;
  return {
    queen: state.queen.alive ? state.queen : null,
    queenPresent: state.queen.alive,
    queenName: state.queen.tamed ? "Bonded Hive Queen" : "Resident Hive Queen",
    workers,
    workerCount: workers.length,
    maxWorkers: status.workerCapacity,
    nectar: status.nectar,
    nectarStatus: away > 0 ? `${away} foraging · nectar return pending`
      : status.nectar > 0 ? "Workers home · nectar returned" : "Workers home · awaiting daylight",
    honey: status.honey,
    honeyMax: status.honeyCapacity,
    royalJelly: status.jelly,
    royalJellyMax: status.jellyCapacity,
    productionProgress: status.honeyProgress,
    honeyClock: state.honeyClock,
    honeyCycleSeconds: APIARY_HONEY_CYCLE_SECONDS,
    slots: [
      null,
      status.honey > 0 ? { item: Item.HoneyJar, count: status.honey } : null,
      status.jelly > 0 ? { item: Item.RoyalJelly, count: status.jelly } : null,
    ],
  };
}

export function orbRackHudState(state: OrbRackState): OrbRackHudState {
  const status = orbRackContainerStatus(state);
  return { slots: status.slots.map((orb) => orb ? captureOrbInventorySlot(orb) : null) };
}

export function healingStationHudState(state: CreatureHealerState): HealingStationHudState {
  const status = healingStationContainerStatus(state);
  return {
    slots: state.slots.map((orb) => orb ? captureOrbInventorySlot(orb) : null),
    gelUnits: status.gelUnits,
    healClock: state.healClock,
    healIntervalSeconds: CREATURE_HEAL_INTERVAL_SECONDS,
    healingProgress: state.slots.map((orb) => !orb?.creature || orb.creature.health >= orb.creature.maxHealth
      ? 1 : clamp(state.healClock / CREATURE_HEAL_INTERVAL_SECONDS, 0, 1)),
  };
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
  const fallback: GameSettings = { volume: 0.55, muted: false, sensitivity: 0.0022, fov: 72, weather: "clear", showFps: false, resourceMode: "auto", ...fallbackDistances };
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
      showFps: Boolean(parsed.showFps ?? fallback.showFps),
      resourceMode: parsed.resourceMode === "cpu" || parsed.resourceMode === "memory" ? parsed.resourceMode : "auto",
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
  return Object.fromEntries(MOB_ORDER.map((kind) => [kind, { seen: false, kills: 0, captures: 0, tames: 0, breeds: 0, secretUnlocked: false }])) as BestiaryProgress;
}

/** Keyboard gameplay shortcuts must never fire while a player is typing in UI. */
export function isEditableKeyboardTarget(target: EventTarget | null) {
  const element = target as { tagName?: string; isContentEditable?: boolean; getAttribute?: (name: string) => string | null } | null;
  const tag = element?.tagName?.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || Boolean(element?.isContentEditable) || element?.getAttribute?.("role") === "textbox";
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
  localAvatarHeldFilled = false;
  remoteAvatarHeldCodes = new Map<string, ItemCode>();
  remoteAvatarHeldFilled = new Map<string, boolean>();
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
  cloudWeatherSignature = "";
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
  activeApiaryKey: string | null = null;
  activeOrbRackKey: string | null = null;
  activeHealingStationKey: string | null = null;
  activeChestTitle = "Chest";
  furnaces = new Map<string, FurnaceState>();
  chests = new Map<string, ChestState>();
  apiaries = new Map<string, ApiaryBlockState>();
  orbRacks = new Map<string, OrbRackState>();
  healingStations = new Map<string, CreatureHealerState>();
  alchemyStands = new Map<string, AlchemyStandState>();
  distilleries = new Map<string, DistilleryState>();
  mapKnowledge: MapKnowledge = createMapKnowledge("world", "local");
  questBook: QuestBook = createQuestBook();
  sideQuestDefinitions: QuestDefinition[] = [];
  blueprints: BlueprintState = createBlueprintState();
  plantBestiary: PlantBestiaryState = createPlantBestiaryState();
  potionBuffs: Record<string, number> = {};
  factionRelations: FactionRelationsState = createFactionRelations("world");
  goldWallet: GoldWalletState = createGoldWallet("world", "local", 0);
  bankAccount: BankAccountState = createBankAccount("world", "local", 0);
  stockMarket: StockMarketState = createStockMarket("world", "local", "WILDERNESS", 0);
  settlements = new Map<string, SettlementState>();
  merchants = new Map<string, MerchantState>();
  activeAlchemyKey: string | null = null;
  activeDistilleryKey: string | null = null;
  activeCartographyKey: string | null = null;
  activeSettlementId: string | null = null;
  activeSentient: MobEntity | null = null;
  activeMerchantId: string | null = null;
  fastTravelChannel: FastTravelChannel | null = null;
  damageRevision = 0;
  mapDiscoveryTimer = 0;
  settlementTimer = 0;
  lastQuestDay = 0;
  rangedLoaded = new Map<ItemCode, number>();
  rangedReloadItem: ItemCode | null = null;
  rangedReloadTimer = 0;
  aimingRanged = false;
  persistentMachineTimer = 0;
  persistentMachineCursor = 0;
  persistentMachineLastStep = new Map<string, number>();
  apiaryFlowerCache = new Map<string, Array<{ x: number; y: number; z: number }>>();
  socialMotionTimer = 0;
  socialMotions = new Map<number, SocialGroupMotion>();
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
  followerHeading = -Math.PI / 2;
  fallVelocity = 0;
  fallCuePlayed = false;
  wasInWater = false;
  lastHudTime = 0;
  saveTimer = 0;
  autoSaveAccumulator = 0;
  particles: Particle[] = [];
  leafParticles: LeafParticleVisual[] = [];
  leafParticleTimer = 0;
  fallingTrees: FallingTree[] = [];
  mobs: MobEntity[] = [];
  leadAnchors = new Map<number, LeadAnchor>();
  leadLines = new Map<number, THREE.Line<THREE.BufferGeometry, THREE.LineBasicMaterial>>();
  boats = new Map<string, SailboatEntity>();
  mountedBoatId: string | null = null;
  mountedCreatureId: number | null = null;
  mobBounds = new THREE.Box3();
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
  combatEncounter = -1;
  combatMusicScene: "combatA" | "combatB" = "combatA";
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
  activeChestBlocks: Array<readonly [number, number, number]> = [];
  multiplayer: MultiplayerSession | null = null;
  hostRendezvous: HostRendezvous | null = null;
  multiplayerState: MultiplayerUiState = {
    ...detectMultiplayerSupport(),
    status: "idle",
    role: null,
    peers: [],
    inviteCode: "",
    answerCode: "",
    roomCode: "",
    rendezvousStatus: "closed",
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
    this.world.setRetentionPadding(chunkRetentionPadding(settings.resourceMode));
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
    this.selection = new THREE.LineSegments(outlineGeometry, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: true }));
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
      if (this.running && !this.touchMode) this.paused = !this.multiplayerSimulationActive();
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
      if (ITEMS[this.selectedSlot()?.item ?? -1]?.useKind === "ranged-weapon") {
        this.fireSelectedRangedWeapon();
        this.mineHeld = false;
      } else if (this.targetMob) this.attackTargetMob();
      else if (this.target && isInstantBreakBlock(this.target.type)) {
        this.breakTarget();
        this.mineHeld = false;
      }
    } else if (event.button === 2) {
      if (ITEMS[this.selectedSlot()?.item ?? -1]?.useKind === "ranged-weapon") {
        this.aimingRanged = true;
        this.emitHud(true);
      } else this.useSelected();
    }
    else if (event.button === 1) this.pickTarget();
  };

  onMouseUp = (event: MouseEvent) => {
    if (event.button === 0) {
      this.mineHeld = false;
      this.miningProgress = 0;
      this.emitHud(true);
    } else if (event.button === 2 && this.aimingRanged) {
      this.aimingRanged = false;
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
    if (isEditableKeyboardTarget(event.target)) return;
    if (["KeyW", "KeyA", "KeyS", "KeyD", "Space", "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight"].includes(event.code)) event.preventDefault();
    if (event.code === "KeyE" && !event.repeat) {
      this.openOverlay("inventory");
      return;
    }
    if (event.code === "KeyM" && !event.repeat) {
      this.openOverlay("map");
      return;
    }
    if (event.code === "KeyJ" && !event.repeat) {
      this.openOverlay("quests");
      return;
    }
    if (event.code === "KeyR" && !event.repeat) {
      this.startRangedReload();
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
    if (event.code === "Space" && !event.repeat && this.mountedCreatureId !== null) {
      event.preventDefault();
      this.dismountCreature();
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
    if (this.mountedCreatureId !== null) { this.dismountCreature(); return; }
    if (this.mountedBoatId) { this.dismountBoat(); return; }
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
    this.apiaries.clear();
    this.orbRacks.clear();
    this.healingStations.clear();
    this.alchemyStands.clear();
    this.distilleries.clear();
    this.settlements.clear();
    this.merchants.clear();
    this.persistentMachineLastStep.clear();
    this.apiaryFlowerCache.clear();
    this.activatedStructureMarkers.clear();
    this.liquidCells.clear();
    this.world.setRenderDistance(Math.min(this.settings.renderDistance, this.touchMode ? 4 : 6));
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
    this.world.setRenderDistance(this.titleMode ? Math.min(this.settings.renderDistance, this.touchMode ? 4 : 6) : this.settings.renderDistance);
    this.localPlayerModel.setVariant(this.playerVariant);
    this.worldOptions = normalizeWorldOptions(options);
    this.butterflyDensity = this.worldOptions.butterflyDensity;
    if (!this.worldOptions.weather) this.weather = "clear";
    this.activeWorldId = null;
    this.worldSessionStartedAt = Date.now();
    this.worldTime = 0.32;
    this.day = 1;
    this.lastQuestDay = this.day;
    this.health = 10;
    this.hunger = 10;
    this.xp = 0;
    this.level = 0;
    this.selected = 0;
    this.inventory = blankInventory();
    this.equipment = blankEquipment();
    this.bestiary = blankBestiary();
    this.plantBestiary = createPlantBestiaryState();
    this.questBook = createQuestBook();
    this.sideQuestDefinitions = [];
    this.blueprints = createBlueprintState();
    this.potionBuffs = {};
    this.fastTravelChannel = null;
    this.damageRevision = 0;
    this.rangedLoaded.clear();
    this.rangedReloadItem = null;
    this.rangedReloadTimer = 0;
    this.saplings.clear();
    this.cursor = null;
    this.craftGrid = Array.from({ length: 9 }, () => null);
    this.furnaces.clear();
    this.chests.clear();
    this.apiaries.clear();
    this.orbRacks.clear();
    this.healingStations.clear();
    this.alchemyStands.clear();
    this.distilleries.clear();
    this.settlements.clear();
    this.merchants.clear();
    this.persistentMachineLastStep.clear();
    this.apiaryFlowerCache.clear();
    this.sleepVotes.clear();
    this.clearEntities();
    this.activatedStructureMarkers.clear();
    this.liquidCells.clear();
    this.oxygenSeconds = DEFAULT_SWIM_RULES.maxOxygenSeconds;
    this.drowningAccumulator = 0;
    this.world.reset(seed.trim() || this.randomSeed(), undefined, generationOptionsFromWorldOptions(this.worldOptions));
    const authorityId = `world:${this.world.seedText}`;
    const playerId = this.localPlayerId();
    this.mapKnowledge = createMapKnowledge(authorityId, playerId);
    this.factionRelations = createFactionRelations(authorityId);
    this.goldWallet = createGoldWallet(authorityId, playerId, 0);
    this.bankAccount = createBankAccount(authorityId, playerId, this.day);
    this.stockMarket = createStockMarket(authorityId, playerId, this.world.seedText, this.day);
    const openingQuest = acceptQuest(this.questBook, HEARTHROADS_MAIN_QUESTS, "main-first-dawn", Date.now());
    if (openingQuest.ok) this.questBook = pinQuest(openingQuest.book, "main-first-dawn");
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
    this.world.setRenderDistance(this.settings.renderDistance);
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
    for (let index = 0; index < Math.min(INVENTORY_SIZE, save.inventory?.length ?? 0); index += 1) this.inventory[index] = normalizeCaptureOrbInventorySlot(save.inventory[index]);
    this.equipment = blankEquipment();
    for (const slot of ["head", "chest", "legs", "feet"] as EquipmentSlot[]) this.equipment[slot] = normalizeCaptureOrbInventorySlot(save.equipment?.[slot] ?? null);
    this.bestiary = blankBestiary();
    for (const kind of MOB_ORDER) this.bestiary[kind] = { ...this.bestiary[kind], ...(save.bestiary?.[kind] ?? {}) };
    const authorityId = `world:${save.seed}`;
    const playerId = this.localPlayerId();
    this.mapKnowledge = normalizeMapKnowledge(save.mapKnowledge, authorityId, playerId);
    this.questBook = normalizeQuestBook(save.questBook);
    this.sideQuestDefinitions = Array.isArray(save.sideQuestDefinitions) ? save.sideQuestDefinitions.slice(0, 128) : [];
    this.blueprints = normalizeBlueprintState(save.blueprints);
    this.plantBestiary = normalizePlantBestiaryState(save.plantBestiary);
    this.potionBuffs = Object.fromEntries(Object.entries(save.potionBuffs ?? {}).filter(([, value]) => typeof value === "number" && Number.isFinite(value)).map(([key, value]) => [key.slice(0, 64), Math.max(0, value)]));
    this.fastTravelChannel = null;
    this.damageRevision = 0;
    this.factionRelations = save.factionRelations?.schema === 1 ? save.factionRelations : createFactionRelations(authorityId);
    this.goldWallet = save.goldWallet?.schema === 1 ? save.goldWallet : createGoldWallet(authorityId, playerId, 0);
    this.bankAccount = save.bankAccount?.schema === 1 ? save.bankAccount : createBankAccount(authorityId, playerId, this.day);
    this.stockMarket = save.stockMarket?.schema === 1 ? save.stockMarket : createStockMarket(authorityId, playerId, save.seed, this.day);
    this.settlements = new Map((Array.isArray(save.settlements) ? save.settlements : []).filter((entry) => entry?.schema === 1 && typeof entry.id === "string").map((entry) => [entry.id, entry]));
    this.merchants = new Map(Object.entries(save.merchants ?? {}).filter(([, entry]) => entry?.schema === 1));
    this.rangedLoaded = new Map(Object.entries(save.rangedLoaded ?? {}).flatMap(([item, loaded]) => {
      const itemCode = Number(item);
      return Number.isFinite(itemCode) && Number.isFinite(loaded) ? [[itemCode, Math.max(0, Math.floor(loaded))] as const] : [];
    }));
    this.rangedReloadItem = null;
    this.rangedReloadTimer = 0;
    this.saplings = new Map(Object.entries(save.saplings ?? {}).map(([key, value]) => [key, Number(value) || 0]));
    this.cursor = null;
    this.craftGrid = Array.from({ length: 9 }, () => null);
    const transientItems = [save.cursor, ...(save.craftGrid ?? [])]
      .map((slot) => normalizeCaptureOrbInventorySlot(slot))
      .filter((slot): slot is InventorySlot => Boolean(slot));
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
    this.lastQuestDay = this.day;
    this.weather = save.weather === "rain" ? "rain" : "clear";
    if (!this.worldOptions.weather) this.weather = "clear";
    this.furnaces = new Map(Object.entries(save.furnaces ?? {}).map(([key, value]) => [key, {
      ...blankFurnace(),
      ...value,
      input: normalizeCaptureOrbInventorySlot(value.input),
      fuel: normalizeCaptureOrbInventorySlot(value.fuel),
      output: normalizeCaptureOrbInventorySlot(value.output),
    }]));
    this.chests = restoreChestStorage(save.chests ?? {});
    this.apiaries = restoreApiaryStorage(save.apiaries ?? {});
    this.orbRacks = restoreOrbRackStorage(save.orbRacks ?? {});
    this.healingStations = restoreHealingStationStorage(save.healingStations ?? {});
    this.alchemyStands = new Map(Object.entries(save.alchemyStands ?? {}).map(([key, value]) => [key, normalizeAlchemyStand(value)]));
    this.distilleries = new Map(Object.entries(save.distilleries ?? {}).map(([key, value]) => [key, normalizeDistillery(value)]));
    this.activeAlchemyKey = null;
    this.activeDistilleryKey = null;
    this.activeCartographyKey = null;
    this.activeSentient = null;
    this.activeSettlementId = null;
    this.activeMerchantId = null;
    this.persistentMachineLastStep.clear();
    const restoredAt = Number.isFinite(save.savedAt) ? Math.min(Date.now(), save.savedAt) : Date.now();
    for (const key of [...this.apiaries.keys(), ...this.healingStations.keys()]) this.persistentMachineLastStep.set(key, restoredAt);
    this.persistentMachineTimer = 0;
    for (const savedBoat of save.boats ?? []) this.restoreSailboat(savedBoat);
    for (const savedCreature of save.creatures ?? []) this.restoreCreature(savedCreature);
    this.leadAnchors = restoreLeadAnchors(save.leads, new Set(this.mobs.map((mob) => mob.id)));
    for (const mobId of this.leadAnchors.keys()) this.ensureLeadLine(mobId);
    if (this.collidesAt(this.position) || this.position.y < MIN_Y) this.respawn(false);
    for (const savedDrop of save.drops ?? []) {
      if (!ITEMS[savedDrop.item] || savedDrop.count <= 0) continue;
      const normalizedDrop = normalizeCaptureOrbInventorySlot({ item: savedDrop.item, count: savedDrop.count, ...(savedDrop.durability !== undefined ? { durability: savedDrop.durability } : {}), ...(savedDrop.metadata ? { metadata: savedDrop.metadata } : {}) });
      if (!normalizedDrop) continue;
      const drop = this.spawnDrop(normalizedDrop.item, normalizedDrop.count, new THREE.Vector3(savedDrop.x, savedDrop.y, savedDrop.z), normalizedDrop.durability, normalizedDrop.metadata);
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

  suggestMultiplayerRoomCode() {
    return createRoomCode();
  }

  private setRendezvousStatus(status: RendezvousStatus) {
    this.multiplayerState.rendezvousStatus = status;
    if (!this.disposed) this.emitHud(true);
  }

  private async closeHostRendezvous() {
    const handle = this.hostRendezvous;
    this.hostRendezvous = null;
    if (!handle) return;
    try { await handle.close(); }
    catch (error) {
      if (!isMultiplayerOperationCancellation(error)) throw error;
    }
  }

  async createMultiplayerRoom(roomCode: string, playerName: string) {
    if (!this.running || this.titleMode) throw new Error("Open a world before hosting a multiplayer session.");
    try {
      await this.closeHostRendezvous();
      const session = this.beginMultiplayerSession(playerName);
      const code = roomCode.trim() || createRoomCode();
      const handle = await hostByRoomCode({
        code,
        hostName: session.identity.name,
        createInvite: async () => {
          const invite = await session.createHostInvite();
          this.multiplayerState.status = session.state;
          this.multiplayerState.role = "host";
          this.multiplayerState.peers = session.getPeers();
          return { inviteCode: invite.inviteCode };
        },
        acceptAnswer: async (answerCode) => {
          await session.acceptGuestAnswer(answerCode.trim());
          this.multiplayerState.status = session.state;
          this.multiplayerState.peers = session.getPeers();
        },
        onStatus: (status) => this.setRendezvousStatus(status),
      });
      this.hostRendezvous = handle;
      this.multiplayerState.roomCode = handle.code;
      this.multiplayerState.status = session.state;
      this.multiplayerState.role = "host";
      this.multiplayerState.error = "";
      this.events.onToast(`Invite room ${handle.code} is open. Share that one code with your trailmates.`);
      this.emitHud(true);
      return { roomCode: handle.code };
    } catch (error) {
      if (isMultiplayerOperationCancellation(error)) {
        this.multiplayerState.error = "";
        this.multiplayerState.rendezvousStatus = this.hostRendezvous ? "waiting" : "closed";
        this.multiplayerState.status = this.multiplayer && this.multiplayer.state !== "closed" ? this.multiplayer.state : "idle";
        throw error;
      }
      this.multiplayerState.error = error instanceof Error ? error.message : String(error);
      this.multiplayerState.rendezvousStatus = "error";
      this.multiplayerState.status = "error";
      throw error;
    }
  }

  async joinMultiplayerRoom(roomCode: string, playerName: string) {
    const joiningFromTitle = this.titleMode;
    try {
      await this.closeHostRendezvous();
      const session = this.beginMultiplayerSession(playerName);
      const joined = await joinByRoomCode({
        code: roomCode,
        guestName: session.identity.name,
        createAnswer: async (inviteCode) => session.createGuestAnswer(inviteCode),
        onStatus: (status) => this.setRendezvousStatus(status),
      });
      this.multiplayerState.roomCode = joined.code;
      this.multiplayerState.inviteCode = "";
      this.multiplayerState.answerCode = "";
      this.multiplayerState.status = session.state;
      this.multiplayerState.role = "guest";
      this.multiplayerState.error = "";
      // Rendezvous completes before the authoritative snapshot arrives. Keep a
      // title guest on the safe preview scene until the host world is applied.
      const deadline = performance.now() + 18_000;
      while (!this.multiplayerReceivedSnapshot) {
        if (this.disposed || this.multiplayer !== session || session.state === "closed" || session.state === "error") throw new Error("The host connection closed before its world arrived.");
        if (performance.now() >= deadline) throw new Error("Connected to the host, but their world did not arrive in time. Try the invite code again.");
        await new Promise<void>((resolve) => window.setTimeout(resolve, 40));
      }
      this.events.onToast(`Connected to ${joined.hostName}'s world through room ${joined.code}.`);
      this.emitHud(true);
      return { hostName: joined.hostName, seed: this.world.seedText, worldReady: true as const };
    } catch (error) {
      if (isMultiplayerOperationCancellation(error)) {
        if (joiningFromTitle) this.disconnectMultiplayer();
        else {
          this.multiplayerState.error = "";
          this.multiplayerState.rendezvousStatus = "closed";
          this.multiplayerState.status = this.multiplayer && this.multiplayer.state !== "closed" ? this.multiplayer.state : "idle";
        }
        throw error;
      }
      this.multiplayerState.error = error instanceof Error ? error.message : String(error);
      this.multiplayerState.rendezvousStatus = "error";
      this.multiplayerState.status = "error";
      if (joiningFromTitle) this.disconnectMultiplayer();
      throw error;
    }
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
    if (this.hostRendezvous) void this.hostRendezvous.close().catch(() => undefined);
    this.hostRendezvous = null;
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
      roomCode: "",
      rendezvousStatus: "closed",
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
    this.remoteAvatarHeldFilled.delete(id);
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
      heldItemFilled: this.selectedSlot()?.item === Item.CaptureOrb
        && Boolean(captureOrbFromInventorySlot(this.selectedSlot())?.creature),
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
      scale: this.mobBaseScale(mob),
      tamed: Boolean(mob.petState?.tamed || mob.shadeState?.tamed || mob.reedstriderBond?.tamed || mob.courserBond?.tamed || mob.apiaryBee?.tamed),
      saddled: Boolean(mob.shadeState?.saddled || mob.reedstriderBond?.saddled || mob.courserBond?.saddled),
      baby: Boolean(mob.petState?.baby || mob.careState?.baby),
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
      if (!this.collidesAt(candidate, PLAYER_HEIGHT * playerVariantHeightScale(this.playerVariant))) { this.position.copy(candidate); joined = true; break; }
    }
    if (!joined) this.position.set(centerX, this.world.surfaceAt(centerX, centerZ) + 0.51, centerZ);
    this.spawn.copy(this.position);
    this.worldTime = snapshot.time.worldTime;
    this.day = snapshot.time.day;
    this.weather = snapshot.time.weather;
    this.running = true;
    this.paused = !this.multiplayerSimulationActive();
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
      if (mob.kind === "shadecrawler" && mob.shadeState) {
        mob.shadeState = normalizeShadecrawlerState({
          ...mob.shadeState,
          tamed: Boolean(entry.tamed),
          growth: clamp(((entry.scale ?? 1) - 1) / 2, 0, 1),
          growthFeeds: Math.round(clamp(((entry.scale ?? 1) - 1) / 2, 0, 1) * 12),
          saddled: Boolean(entry.saddled),
        });
        mob.hostile = mob.definition.hostile && !mob.shadeState.tamed;
      }
      if (mob.kind === "reedstrider" && mob.reedstriderBond) mob.reedstriderBond = {
        ...mob.reedstriderBond,
        tamed: Boolean(entry.tamed),
        saddled: Boolean(entry.saddled),
      };
      if ((mob.kind === "wild-horse" || mob.kind === "warg") && mob.courserBond) mob.courserBond = {
        ...mob.courserBond,
        tamed: Boolean(entry.tamed),
        saddled: Boolean(entry.saddled),
      };
      if (mob.careState && entry.baby !== undefined) {
        mob.careState = { ...mob.careState, baby: entry.baby, ageTicks: entry.baby ? Math.min(mob.careState.ageTicks, 23_999) : Math.max(24_000, mob.careState.ageTicks) };
      }
      this.applyMobScale(mob, entry.scale ?? this.mobBaseScale(mob));
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
    if (event.type === "state") {
      this.multiplayerState.status = event.state;
      if (event.state === "connected") this.paused = false;
      else if (!this.locked && !this.touchMode && this.running && !this.titleMode) this.paused = true;
    }
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
      else if (envelope.type === "map-share") this.handleRemoteMapShare(envelope.payload as CartographyMapShare, event.peer);
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

  private multiplayerSimulationActive() {
    return this.multiplayer?.state === "connected";
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
    this.paused = !this.multiplayerSimulationActive();
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
        if (!slot || !this.isExhibitResidentSlot(slot)) continue;
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
      this.spawnDrop(specimen.item, 1, new THREE.Vector3(broken.x, broken.y, broken.z), specimen.durability, specimen.metadata);
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
    const positions = blocks.map((key) => key.split(",").map(Number) as [number, number, number]);
    this.activeChestBlocks = positions;
    for (const [blockX, blockY, blockZ] of positions) this.world.setChestVisualHidden(blockX, blockY, blockZ, true);
    const x = positions.reduce((sum, value) => sum + value[0], 0) / positions.length;
    const y = positions[0][1];
    const z = positions.reduce((sum, value) => sum + value[2], 0) / positions.length;
    const alongX = large && positions[0][2] === positions.at(-1)?.[2];
    const bodyWidth = large && alongX ? 1.88 : 0.88;
    const bodyDepth = large && !alongX ? 1.88 : 0.88;
    const lidWidth = large && alongX ? 1.92 : 0.92;
    const lidDepth = large && !alongX ? 1.92 : 0.92;
    const group = new THREE.Group();
    group.position.set(x, y, z);
    const wood = new THREE.MeshLambertMaterial({ map: this.world.atlas, color: 0xffffff });
    const base = new THREE.Mesh(createAtlasBlockGeometry(BlockId.Chest), wood);
    base.scale.set(bodyWidth, 0.63, bodyDepth);
    base.position.y = -0.185;
    group.add(base);
    const latch = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.22, 0.07), new THREE.MeshLambertMaterial({ color: 0xe0b54e }));
    latch.position.set(0, 0.135, -bodyDepth / 2 - 0.045);
    group.add(latch);
    const pivot = new THREE.Group();
    pivot.position.set(0, 0.16, lidDepth / 2);
    const lidMaterial = new THREE.MeshLambertMaterial({ map: this.world.atlas, color: 0xffffff });
    const lid = new THREE.Mesh(createAtlasBlockGeometry(BlockId.Chest), lidMaterial);
    lid.scale.set(lidWidth, 0.21, lidDepth);
    lid.position.set(0, 0.105, -lidDepth / 2);
    pivot.add(lid);
    group.add(pivot);
    this.scene.add(group);
    this.activeChestModel = group;
    this.chestLidPivot = pivot;
    this.chestOpenAmount = 0;
    this.audio.playSample("chestOpen");
  }

  hideChestModel(immediate = false) {
    if (!this.activeChestModel && !(this.activeChestBlocks?.length)) return;
    if (!immediate) {
      this.audio.playSample("chestClose");
      return;
    }
    if (this.activeChestModel) {
      this.disposeObject(this.activeChestModel);
      this.scene.remove(this.activeChestModel);
    }
    this.activeChestModel = null;
    this.chestLidPivot = null;
    this.chestOpenAmount = 0;
    for (const [blockX, blockY, blockZ] of this.activeChestBlocks ?? []) this.world.setChestVisualHidden(blockX, blockY, blockZ, false);
    this.activeChestBlocks = [];
  }

  updateChestModel(dt: number) {
    if (!this.activeChestModel || !this.chestLidPivot) return;
    const target = this.activeChestKey ? 1 : 0;
    this.chestOpenAmount += (target - this.chestOpenAmount) * (1 - Math.exp(-dt * 10));
    // Positive X raises the front edge around the rear hinge. The previous
    // sign drove the lid downward through the chest body.
    this.chestLidPivot.rotation.x = this.chestOpenAmount * 1.08;
    if (!target && this.chestOpenAmount < 0.015) this.hideChestModel(true);
  }

  setRespawnFromBed(x: number, y: number, z: number, type: BlockId) {
    for (const candidate of bedRespawnCandidates(type, x, y, z)) {
      const support = this.world.getBlock(candidate.x, candidate.y - 1, candidate.z);
      const feet = this.world.getBlock(candidate.x, candidate.y, candidate.z);
      const head = this.world.getBlock(candidate.x, candidate.y + 1, candidate.z);
      if (!BLOCKS[support ?? BlockId.Air]?.solid || !this.world.isWalkThrough(feet) || !this.world.isWalkThrough(head)) continue;
      this.spawn.set(candidate.x, candidate.y - 0.49, candidate.z);
      this.mapKnowledge ??= createMapKnowledge(`world:${this.world.seedText ?? "world"}`, this.localPlayerId());
      this.mapKnowledge = setBedSpawn(this.mapKnowledge, {
        id: `bed:${x},${y},${z}`,
        name: "Home Bed",
        position: { x: this.spawn.x, y: this.spawn.y, z: this.spawn.z },
        playerId: this.localPlayerId(),
        discoveredAt: Date.now(),
        icon: "bed",
      });
      this.events.onToast("Respawn set beside this bed.");
      this.saveSoon();
      return true;
    }
    this.events.onToast("Clear some room beside the bed to set a safe respawn point.");
    return false;
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

  private cartographyPayload(tableKey: string, reply: boolean): CartographyMapShare {
    return {
      tableKey,
      reply,
      map: {
        ...this.mapKnowledge,
        exploredChunks: this.mapKnowledge.exploredChunks.slice(-4096),
        markers: this.mapKnowledge.markers.slice(-512).map((marker) => ({ ...marker, position: { ...marker.position } })),
      },
    };
  }

  private handleRemoteMapShare(payload: CartographyMapShare, peer: PeerInfo) {
    if (!this.multiplayer || !peer.identity || !this.activeCartographyKey || payload.tableKey !== this.activeCartographyKey) return;
    const [x, y, z] = payload.tableKey.split(",").map(Number);
    const remote = this.remotePlayers.get(peer.identity.id);
    if (![x, y, z].every(Number.isFinite)
      || this.position.distanceToSquared(new THREE.Vector3(x, y, z)) > 25
      || !remote || new THREE.Vector3(remote.target.x, remote.target.y, remote.target.z).distanceToSquared(new THREE.Vector3(x, y, z)) > 25) return;
    const remoteMap = normalizeMapKnowledge(payload.map, this.mapKnowledge.worldId, peer.identity.id);
    const joined = joinCartographySession(createCartographySession(payload.tableKey, this.localPlayerId()), peer.identity.id);
    if (!joined.joined) return;
    const shared = shareMapsAtCartographyTable(joined.session, this.localPlayerId(), this.mapKnowledge, peer.identity.id, remoteMap);
    if (!shared.ok) return;
    this.mapKnowledge = shared.left;
    if (!payload.reply) this.multiplayer.sendMapShare(this.cartographyPayload(payload.tableKey, true), peer.identity.id);
    this.events.onToast(`Maps shared with ${peer.identity.name}: explored chunks and transferable markers are now merged.`);
    this.saveSoon();
    this.emitHud(true);
  }

  private stationHasWaterSource(key: string) {
    const [x, y, z] = key.split(",").map(Number);
    return ([[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const)
      .some(([dx, dy, dz]) => this.world.getBlock(x + dx, y + dy, z + dz) === BlockId.Water);
  }

  private consumeResourceDelta(consumed: Readonly<Record<string, number>>) {
    for (const [resource, count] of Object.entries(consumed)) {
      const item = resourceItemCode(resource);
      if (item !== null) this.removeItem(item, count);
    }
  }

  startStationBatch(machine: "alchemy" | "distillery", recipeId: string) {
    const key = machine === "alchemy" ? this.activeAlchemyKey : this.activeDistilleryKey;
    if (!key) return false;
    const before = inventoryResourceCounts(this.inventory, machine === "alchemy" && this.stationHasWaterSource(key) ? { "water-source": 1 } : {});
    const result = machine === "alchemy"
      ? startAlchemyBatch(this.alchemyStands.get(key) ?? createAlchemyStand(), recipeId, before, this.blueprints)
      : startDistilleryBatch(this.distilleries.get(key) ?? createDistillery(), recipeId, before, this.blueprints);
    if (!result.ok) {
      const message = result.reason === "blueprint-locked" ? "That formula is still locked behind a blueprint."
        : result.reason === "missing-inputs" ? "The station is missing one or more ingredients."
          : result.reason === "station-busy" ? "This station is already tending a batch."
            : result.reason === "output-blocked" ? "Collect the finished output before starting another batch."
              : "That recipe cannot be started here.";
      this.events.onToast(message);
      return false;
    }
    this.consumeResourceDelta(consumedResourceDelta(before, result.inventory));
    if (machine === "alchemy") this.alchemyStands.set(key, result.state as AlchemyStandState);
    else this.distilleries.set(key, result.state as DistilleryState);
    this.persistentMachineLastStep.set(key, Date.now());
    this.audio.play("craft");
    this.events.onToast(machine === "alchemy" ? "The alchemy stand begins to glow." : "The distillery begins a patient fermentation.");
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  collectStationOutput(machine: "alchemy" | "distillery") {
    const key = machine === "alchemy" ? this.activeAlchemyKey : this.activeDistilleryKey;
    if (!key) return false;
    const state = machine === "alchemy" ? this.alchemyStands.get(key) : this.distilleries.get(key);
    if (!state?.output) return false;
    const item = resourceItemCode(state.output.item);
    if (item === null) return false;
    const count = Math.min(state.output.count, this.inventoryCapacity(item));
    if (count <= 0) {
      this.events.onToast("Make room in your pack before collecting this batch.");
      return false;
    }
    const collected = machine === "alchemy"
      ? collectAlchemyOutput(state as AlchemyStandState, count)
      : collectDistilleryOutput(state as DistilleryState, count);
    if (!collected.collected) return false;
    this.addItem(item, collected.collected.count);
    if (machine === "alchemy") this.alchemyStands.set(key, collected.state as AlchemyStandState);
    else this.distilleries.set(key, collected.state as DistilleryState);
    this.audio.play("pickup");
    this.events.onToast(`Collected ${ITEMS[item].name} ×${collected.collected.count}.`);
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  ensureApiaryState(key: string) {
    const existing = this.apiaries.get(key);
    if (existing) return existing;
    const [x, y, z] = key.split(",").map(Number);
    const type = this.world.getBlock(x, y, z);
    const state: ApiaryBlockState = type === BlockId.WildBeehive
      ? createWildApiary(`${this.world.seedText}:${key}`, this.day)
      : createEmptyApiaryBlock();
    this.apiaries.set(key, state);
    this.persistentMachineLastStep.set(key, Date.now());
    return state;
  }

  openOverlay(kind: OverlayKind, key?: string) {
    if (kind !== "apiary") this.activeApiaryKey = null;
    if (kind !== "orb-rack") this.activeOrbRackKey = null;
    if (kind !== "healing-station") this.activeHealingStationKey = null;
    if (kind !== "alchemy") this.activeAlchemyKey = null;
    if (kind !== "distillery") this.activeDistilleryKey = null;
    if (kind !== "cartography") this.activeCartographyKey = null;
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
        : key.startsWith("exhibit:") ? "Living Creature Conservatory"
          : this.activeChestKey.includes("|") ? "Large Wildwood Chest" : "Wildwood Chest";
      this.activeFurnaceKey = null;
      if (!special) this.showChestModel(key, this.activeChestKey.includes("|"));
    } else if (kind === "apiary" && key) {
      this.activeApiaryKey = key;
      this.activeFurnaceKey = null;
      this.activeChestKey = null;
      this.ensureApiaryState(key);
    } else if (kind === "orb-rack" && key) {
      this.activeOrbRackKey = key;
      this.activeFurnaceKey = null;
      this.activeChestKey = null;
      if (!this.orbRacks.has(key)) this.orbRacks.set(key, createOrbRack());
    } else if (kind === "healing-station" && key) {
      this.activeHealingStationKey = key;
      this.activeFurnaceKey = null;
      this.activeChestKey = null;
      if (!this.healingStations.has(key)) this.healingStations.set(key, createCreatureHealer());
    } else if (kind === "alchemy" && key) {
      this.activeAlchemyKey = key;
      this.activeFurnaceKey = null;
      this.activeChestKey = null;
      if (!this.alchemyStands.has(key)) this.alchemyStands.set(key, createAlchemyStand());
      this.persistentMachineLastStep.set(key, Date.now());
    } else if (kind === "distillery" && key) {
      this.activeDistilleryKey = key;
      this.activeFurnaceKey = null;
      this.activeChestKey = null;
      if (!this.distilleries.has(key)) this.distilleries.set(key, createDistillery());
      this.persistentMachineLastStep.set(key, Date.now());
    } else if (kind === "cartography" && key) {
      this.activeCartographyKey = key;
      this.activeFurnaceKey = null;
      this.activeChestKey = null;
    } else if (["bestiary", "sleep", "pet", "map", "quests", "sentient", "trade", "bank", "settlement", "follower"].includes(kind)) {
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
    this.activeApiaryKey = null;
    this.activeOrbRackKey = null;
    this.activeHealingStationKey = null;
    this.activeAlchemyKey = null;
    this.activeDistilleryKey = null;
    this.activeCartographyKey = null;
    this.activeSentient = null;
    this.activeMerchantId = null;
    this.activePet = null;
    this.craftingSize = 2;
    this.hideChestModel();
    this.saveSoon();
    this.emitHud(true);
  }

  selectSlot(slot: number) {
    this.selected = (slot + 9) % 9;
    this.events.onSelectedSlot?.(this.selected);
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
    if (this.activeApiaryKey) {
      if (this.insertQueenCell(this.activeApiaryKey, slot)) {
        if (slot.count <= 0) this.inventory[index] = null;
        this.audio.play("craft");
        this.saveSoon();
        this.emitHud(true);
      } else this.events.onToast("A vacant apiary accepts a Queen Cell or a Capture Orb holding a Hive Queen.");
      return;
    }
    if (this.activeOrbRackKey || this.activeHealingStationKey) {
      if (this.activeHealingStationKey && slot.item === Item.CaveGel) {
        const station = this.healingStations.get(this.activeHealingStationKey);
        if (!station) return;
        const moved = Math.min(slot.count, CREATURE_HEALER_GEL_CAP - station.gelUnits);
        if (moved <= 0) { this.events.onToast("The healing station's Cave Gel reserve is full."); return; }
        this.healingStations.set(this.activeHealingStationKey, { ...station, gelUnits: station.gelUnits + moved });
        slot.count -= moved;
        if (slot.count <= 0) this.inventory[index] = null;
        this.audio.play("craft");
        this.saveSoon();
        this.emitHud(true);
        return;
      }
      const orb = captureOrbUnitFromInventorySlot(slot);
      if (!orb) { this.events.onToast("This station accepts single Waykeeper Capture Orbs."); return; }
      if (this.activeOrbRackKey) {
        const rack = this.orbRacks.get(this.activeOrbRackKey);
        const target = rack?.slots.findIndex((entry) => !entry) ?? -1;
        if (!rack || target < 0) { this.events.onToast("The Capture Orb Rack is full."); return; }
        this.orbRacks.set(this.activeOrbRackKey, setRackOrb(rack, target, orb));
      } else {
        const station = this.healingStations.get(this.activeHealingStationKey!);
        const target = station?.slots.findIndex((entry) => !entry) ?? -1;
        if (!station || target < 0) { this.events.onToast("The Healing Station is full."); return; }
        this.healingStations.set(this.activeHealingStationKey!, setHealerOrb(station, target, orb));
      }
      slot.count -= 1;
      if (slot.count <= 0) this.inventory[index] = null;
      this.audio.play("ui");
      this.saveSoon();
      this.emitHud(true);
      return;
    }
    if (this.activeChestKey) {
      const chest = this.chests.get(this.activeChestKey);
      if (this.activeChestKey.startsWith("exhibit:") && !this.isExhibitResidentSlot(slot)) {
        this.events.onToast("The conservatory accepts butterfly specimens and eligible small creatures in Waykeeper Cages.");
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
    this.blueprints ??= createBlueprintState();
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
      if (blueprintCraftingLock(this.blueprints, recipe.id, recipe.blueprint)) continue;
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
    const blueprintLock = blueprintCraftingLock(this.blueprints, recipe.id, recipe.blueprint);
    if (blueprintLock) {
      const result: RecipePlanResult = { ok: false, recipeId, reason: "blueprint-locked", message: blueprintLock.message };
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

  exhibitCagedCreature(slot: InventorySlot) {
    if (slot.item !== Item.CreatureCage) return null;
    const encoded = typeof slot.metadata?.capturedCreature === "string" ? slot.metadata.capturedCreature : null;
    const captured = encoded ? decodeCapturedCreature(encoded) : null;
    return captured && isSmallExhibitCreature(captured.creature.kind) ? captured : null;
  }

  isExhibitResidentSlot(slot: InventorySlot) {
    return this.isButterflyJar(slot.item) || Boolean(this.exhibitCagedCreature(slot));
  }

  insertQueenCell(key: string, slot: InventorySlot) {
    if (slot.count <= 0) return false;
    const state = this.ensureApiaryState(key);
    if (isStockedApiary(state)) return false;
    const [x, y, z] = key.split(",").map(Number);
    const seed = (this.world.seed ^ Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1103515245)) >>> 0;
    const orb = slot.count === 1 ? captureOrbFromInventorySlot(slot) : null;
    if (orb?.creature?.kind === "hive-queen") {
      const released = releaseCaptureOrb(orb);
      if (!released) return false;
      const metadata = released.creature;
      const preserved = metadata.custom.apiaryBee as ApiaryBee | undefined;
      const base = createApiary(preserved?.id ?? metadata.entityId ?? `queen-${key}-${this.day}`, [], preserved?.geneticSeed ?? metadata.geneticSeed ?? seed, this.day);
      const queen: ApiaryBee = {
        ...base.queen,
        ...(preserved ?? {}),
        id: preserved?.id ?? metadata.entityId ?? base.queen.id,
        role: "queen",
        alive: true,
        home: true,
        outbound: false,
        carryingNectar: 0,
        lastReturnDay: this.day,
        disconnectedDay: null,
        geneticSeed: preserved?.geneticSeed ?? metadata.geneticSeed ?? seed,
        angry: false,
        tamed: preserved?.tamed ?? metadata.tamed,
        ownerId: preserved?.ownerId ?? metadata.ownerId ?? null,
      };
      this.apiaries.set(key, { ...base, queen });
      const empty = captureOrbInventorySlot(released.orb);
      slot.item = empty.item;
      slot.count = 1;
      slot.metadata = empty.metadata;
      delete slot.durability;
      this.persistentMachineLastStep.set(key, Date.now());
      this.events.onToast(`${metadata.name ?? "The Hive Queen"} settles into the apiary; the Capture Orb returns empty.`);
      return true;
    }
    if (slot.item !== Item.QueenCell) return false;
    const queenId = typeof slot.metadata?.beeId === "string" ? slot.metadata.beeId : `queen-${key}-${this.day}`;
    const queenSeed = Number.isFinite(slot.metadata?.geneticSeed) ? Number(slot.metadata?.geneticSeed) : seed;
    const next = insertQueenCellIntoApiary(state, Item.QueenCell, queenId, queenSeed, this.day);
    if (!next) return false;
    this.apiaries.set(key, next);
    this.persistentMachineLastStep.set(key, Date.now());
    slot.count -= 1;
    this.events.onToast("The Queen Cell wakes. A new colony begins to organize the apiary.");
    return true;
  }

  apiaryMachineClick(index: number, button: "left" | "right", shift: boolean) {
    const key = this.activeApiaryKey;
    if (!key || index < 0 || index > 2) return;
    const state = this.ensureApiaryState(key);
    if (index === 0) {
      if (!this.cursor) return;
      if (!this.insertQueenCell(key, this.cursor)) {
        this.events.onToast(isStockedApiary(state)
          ? "This apiary already has a resident Hive Queen."
          : "Place a Queen Cell or a Capture Orb holding a Hive Queen in this chamber.");
        return;
      }
      if (this.cursor.count <= 0) this.cursor = null;
      this.audio.play("craft");
      this.saveSoon();
      this.emitHud(true);
      return;
    }
    if (!isStockedApiary(state)) return;
    const item = index === 1 ? Item.HoneyJar : Item.RoyalJelly;
    const available = index === 1 ? state.honey : state.royalJelly;
    if (available <= 0) return;
    let moved = 0;
    if (shift) {
      moved = available - this.addItem(item, available, undefined, MAIN_THEN_HOTBAR);
    } else if (!this.cursor) {
      moved = button === "right" ? Math.ceil(available / 2) : Math.min(available, maxStack(item));
      this.cursor = { item, count: moved };
    } else if (this.cursor.item === item && this.cursor.count < maxStack(item)) {
      moved = button === "right" ? 1 : Math.min(available, maxStack(item) - this.cursor.count);
      this.cursor.count += moved;
    }
    if (moved <= 0) return;
    this.apiaries.set(key, index === 1 ? { ...state, honey: state.honey - moved } : { ...state, royalJelly: state.royalJelly - moved });
    this.audio.play("pickup");
    this.saveSoon();
    this.emitHud(true);
  }

  orbStationMachineClick(machine: "orb-rack" | "healing-station", index: number, button: "left" | "right", shift: boolean) {
    if (index < 0 || index >= CAPTURE_ORB_RACK_SIZE) return;
    const key = machine === "orb-rack" ? this.activeOrbRackKey : this.activeHealingStationKey;
    if (!key) return;
    const rack = machine === "orb-rack" ? this.orbRacks.get(key) : this.healingStations.get(key);
    if (!rack) return;
    if (machine === "healing-station" && this.cursor?.item === Item.CaveGel) {
      const healer = rack as CreatureHealerState;
      const moved = Math.min(button === "right" ? 1 : this.cursor.count, CREATURE_HEALER_GEL_CAP - healer.gelUnits);
      if (moved <= 0) return;
      this.healingStations.set(key, { ...healer, gelUnits: healer.gelUnits + moved });
      this.cursor.count -= moved;
      if (this.cursor.count <= 0) this.cursor = null;
      this.audio.play("craft");
      this.saveSoon();
      this.emitHud(true);
      return;
    }
    const existing = rack.slots[index] ?? null;
    if (shift && existing) {
      const slot = captureOrbInventorySlot(existing);
      if (this.addItem(slot.item, 1, slot.durability, MAIN_THEN_HOTBAR, slot.metadata) > 0) return;
      if (machine === "orb-rack") this.orbRacks.set(key, setRackOrb(rack as OrbRackState, index, null));
      else this.healingStations.set(key, setHealerOrb(rack as CreatureHealerState, index, null));
    } else if (!this.cursor && existing) {
      this.cursor = captureOrbInventorySlot(existing);
      if (machine === "orb-rack") this.orbRacks.set(key, setRackOrb(rack as OrbRackState, index, null));
      else this.healingStations.set(key, setHealerOrb(rack as CreatureHealerState, index, null));
    } else if (this.cursor) {
      const incoming = captureOrbUnitFromInventorySlot(this.cursor);
      if (!incoming) { this.events.onToast("This slot accepts one Waykeeper Capture Orb."); return; }
      if (existing && this.cursor.count !== 1) {
        this.events.onToast("Split the orb stack before swapping with an occupied station slot.");
        return;
      }
      if (existing) this.cursor = captureOrbInventorySlot(existing);
      else {
        this.cursor.count -= 1;
        if (this.cursor.count <= 0) this.cursor = null;
      }
      if (machine === "orb-rack") this.orbRacks.set(key, setRackOrb(rack as OrbRackState, index, incoming));
      else this.healingStations.set(key, setHealerOrb(rack as CreatureHealerState, index, incoming));
    } else return;
    this.audio.play("ui");
    this.saveSoon();
    this.emitHud(true);
  }

  machineClick(machine: "furnace" | "chest" | "apiary" | "orb-rack" | "healing-station", index: number, button: "left" | "right", shift = false) {
    if (machine === "apiary") { this.apiaryMachineClick(index, button, shift); return; }
    if (machine === "orb-rack" || machine === "healing-station") { this.orbStationMachineClick(machine, index, button, shift); return; }
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
    if (machine === "chest" && this.activeChestKey?.startsWith("exhibit:") && this.cursor && !this.isExhibitResidentSlot(this.cursor)) {
      this.events.onToast("The conservatory accepts butterfly specimens and eligible small creatures in Waykeeper Cages.");
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
          this.events.onToast("Each habitat block shelters one resident; split the stack first.");
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
        const item = resolveStructureLootItem(loot.itemKey);
        if (item === null || index >= slots.length) return;
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
    const changes = this.liquidSimulator.process(applyResourceMode(this.settings.resourceMode, this.budgetController.current).liquidOperations);
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
      if (current === BlockId.AppleSapling) {
        const soil = this.world.getBlock(x, y - 1, z);
        if (![BlockId.Grass, BlockId.Dirt, BlockId.MeadowGrass, BlockId.SnowyGrass, BlockId.SavannaGrass, BlockId.SwampGrass, BlockId.Farmland, BlockId.HydratedFarmland].includes(soil ?? BlockId.Air)) {
          this.world.setBlock(x, y, z, BlockId.Air, true, true);
          this.publishBlockEdits([{ x, y, z, type: BlockId.Air }], "break");
          this.saplings.delete(key);
          if (this.mode === "survival") this.spawnDrop(Item.Apple, 1, new THREE.Vector3(x, y, z));
          continue;
        }
        const plan = planAppleTree({ x, y, z }, this.world.seedText);
        const clear = plan.every((block) => {
          const occupied = this.world.getBlock(block.x, block.y, block.z);
          return occupied !== undefined && (block.x === x && block.y === y && block.z === z
            || occupied === BlockId.Air || Boolean(BLOCKS[occupied]?.replaceable));
        });
        if (!clear) { this.saplings.set(key, now + 40_000); continue; }
        const changes = [...plan];
        this.world.setBlocksBatch(changes, true, true);
        this.publishBlockEdits(changes, "batch");
        this.saplings.set(key, now + ORCHARD_REGROWTH_BASE_MS + Math.random() * ORCHARD_REGROWTH_JITTER_MS);
        if (this.position.distanceToSquared(new THREE.Vector3(x, y, z)) < 400) this.audio.play("place", BlockId.WildwoodLog);
        continue;
      }
      if (current === BlockId.WildwoodLog) {
        let appleCanopy = false;
        for (let dx = -3; dx <= 3 && !appleCanopy; dx += 1) for (let dy = 2; dy <= 8 && !appleCanopy; dy += 1) for (let dz = -3; dz <= 3; dz += 1) {
          if (this.world.getBlock(x + dx, y + dy, z + dz) === BlockId.AppleLeaves) { appleCanopy = true; break; }
        }
        if (!appleCanopy) { this.saplings.delete(key); continue; }
        const fruit = planAppleFruitRegrowth({ x, y, z }, this.world.seedText, Math.floor(now / 60_000), (bx, by, bz) => this.world.getBlock(bx, by, bz), 2);
        if (fruit.length) {
          const changes = [...fruit];
          this.world.setBlocksBatch(changes, true, true);
          this.publishBlockEdits(changes, "batch");
        }
        this.saplings.set(key, now + ORCHARD_REGROWTH_BASE_MS + Math.random() * ORCHARD_REGROWTH_JITTER_MS);
        continue;
      }
      const plant = plantProfileForBlock(current);
      if (plant) {
        const soil = this.world.getBlock(x, y - 1, z);
        const hydratedSoil = soil === BlockId.Farmland || soil === BlockId.HydratedFarmland
          ? farmlandState((bx, by, bz) => this.world.getBlock(bx, by, bz), { x, y: y - 1, z })
          : soil;
        if (hydratedSoil !== soil && hydratedSoil !== undefined) {
          this.world.setBlock(x, y - 1, z, hydratedSoil, true, true);
          this.publishBlockEdits([{ x, y: y - 1, z, type: hydratedSoil }], "place");
        }
        const next = nextPlantStage(current);
        if (next === null) { this.saplings.delete(key); continue; }
        if (!canGrowPlant(current, hydratedSoil, this.daylightAmount())) {
          this.saplings.set(key, now + 25_000);
          continue;
        }
        this.world.setBlock(x, y, z, next, true, true);
        this.publishBlockEdits([{ x, y, z, type: next }], "place");
        this.schedulePlantGrowth(x, y, z, next, plant.stage + 1);
        continue;
      }
      if (current !== BlockId.WildwoodSapling) { this.saplings.delete(key); continue; }
      const soil = this.world.getBlock(x, y - 1, z);
      if (![BlockId.Grass, BlockId.Dirt, BlockId.SnowyGrass, BlockId.SavannaGrass, BlockId.SwampGrass, BlockId.Farmland, BlockId.HydratedFarmland].includes(soil ?? BlockId.Air)) {
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
    return this.inventory?.[this.selected] ?? null;
  }

  apiaryFlowersNear(key: string, radius = 5) {
    const [x, y, z] = key.split(",").map(Number);
    const flowers: Array<{ x: number; y: number; z: number }> = [];
    for (let dx = -radius; dx <= radius; dx += 1) for (let dz = -radius; dz <= radius; dz += 1) {
      if (dx * dx + dz * dz > radius * radius) continue;
      for (let dy = -3; dy <= 3; dy += 1) {
        const type = this.world.getBlock(x + dx, y + dy, z + dz);
        if (type === undefined) continue;
        const name = BLOCKS[type]?.name ?? "";
        if (!/flower|orchid|sunpetal|cloudbell|berry|bloom/iu.test(name)) continue;
        flowers.push({ x: x + dx, y: y + dy, z: z + dz });
        break;
      }
    }
    return flowers;
  }

  syncApiaryWorkerMobs(key: string, state: ApiaryState, phase: ApiaryPhase) {
    const [x, y, z] = key.split(",").map(Number);
    const withinSimulation = (x - this.position.x) ** 2 + (z - this.position.z) ** 2
      <= (this.settings.simulationDistance * CHUNK_SIZE) ** 2;
    const livingIds = new Set(livingApiaryWorkers(state).map((worker) => worker.id));
    for (let index = this.mobs.length - 1; index >= 0; index -= 1) {
      const mob = this.mobs[index];
      if (mob.beeHiveKey !== key) continue;
      const belongs = mob.kind === "hive-queen"
        ? state.queen.alive && mob.apiaryBee?.id === state.queen.id
        : livingIds.has(mob.apiaryBee?.id ?? "");
      if (!belongs || !withinSimulation) this.removeMob(index);
    }
    if (withinSimulation && state.queen.alive
      && !this.mobs.some((mob) => mob.beeHiveKey === key && mob.kind === "hive-queen" && mob.apiaryBee?.id === state.queen.id)) {
      this.spawnMob("hive-queen", new THREE.Vector3(x, y + 0.86, z), {
        apiaryBee: { ...state.queen, home: true, outbound: false },
        beeHiveKey: key,
        persistentPoiResident: true,
      });
    }
    if (phase !== "day" || !withinSimulation) return;
    const visualWorkers = livingApiaryWorkers(state).slice(0, 3);
    for (let index = 0; index < visualWorkers.length; index += 1) {
      const worker = visualWorkers[index];
      if (this.mobs.some((mob) => mob.beeHiveKey === key && mob.apiaryBee?.id === worker.id)) continue;
      const angle = index / Math.max(1, visualWorkers.length) * Math.PI * 2;
      this.spawnMob("honeybee", new THREE.Vector3(x + Math.cos(angle) * 0.42, y + 0.8, z + Math.sin(angle) * 0.42), {
        apiaryBee: { ...worker, home: false, outbound: true },
        beeHiveKey: key,
        persistentPoiResident: true,
      });
    }
  }

  updatePersistentMachines(dt: number) {
    this.alchemyStands ??= new Map();
    this.distilleries ??= new Map();
    this.persistentMachineTimer -= dt;
    if (this.persistentMachineTimer > 0) return;
    this.persistentMachineTimer = 1;
    const entries = [
      ...[...this.apiaries.keys()].map((key) => ({ kind: "apiary" as const, key })),
      ...[...this.healingStations.keys()].map((key) => ({ kind: "healer" as const, key })),
      ...[...this.alchemyStands.keys()].map((key) => ({ kind: "alchemy" as const, key })),
      ...[...this.distilleries.keys()].map((key) => ({ kind: "distillery" as const, key })),
    ];
    if (!entries.length) return;
    const now = Date.now();
    const maximum = Math.min(8, entries.length);
    let meaningfulChange = false;
    for (let offset = 0; offset < maximum; offset += 1) {
      const entry = entries[(this.persistentMachineCursor + offset) % entries.length];
      const previous = this.persistentMachineLastStep.get(entry.key) ?? now;
      const elapsed = clamp((now - previous) / 1000, 0, 3600);
      this.persistentMachineLastStep.set(entry.key, now);
      if (entry.kind === "apiary") {
        const state = this.apiaries.get(entry.key);
        if (!state || !isStockedApiary(state)) continue;
        const [x, y, z] = entry.key.split(",").map(Number);
        const block = this.world.getBlock(x, y, z);
        const attached = block === undefined || block === BlockId.Apiary || block === BlockId.WildBeehive;
        const flowers = block === undefined ? (this.apiaryFlowerCache.get(entry.key) ?? []) : this.apiaryFlowersNear(entry.key);
        this.apiaryFlowerCache.set(entry.key, flowers);
        const phase = apiaryPhaseForWorldTime(this.worldTime);
        const result = stepApiary(state, {
          phase,
          nearbyFlowers: flowers.length,
          attached,
          deltaSeconds: elapsed,
          worldDay: this.day,
          workersCanReturn: attached,
        });
        this.apiaries.set(entry.key, result.state);
        this.syncApiaryWorkerMobs(entry.key, result.state, phase);
        if (result.events.some((event) => event === "honey-ready" || event === "royal-jelly-ready" || event === "worker-created")) {
          meaningfulChange = true;
          if (block !== undefined && (x - this.position.x) ** 2 + (z - this.position.z) ** 2 < 256) {
            this.spawnParticles(x, y + 0.45, z, BlockId.Glowstone, 3);
          }
        }
      } else if (entry.kind === "healer") {
        const station = this.healingStations.get(entry.key);
        if (!station) continue;
        const result = stepCreatureHealer(station, elapsed);
        this.healingStations.set(entry.key, result.state);
        if (result.healed > 0) {
          meaningfulChange = true;
          const [x, y, z] = entry.key.split(",").map(Number);
          if ((x - this.position.x) ** 2 + (z - this.position.z) ** 2 < 256) {
            this.spawnParticles(x, y + 0.5, z, BlockId.CrystalBlock, Math.min(8, 2 + result.healed));
            this.audio.play("craft");
          }
        }
      } else if (entry.kind === "alchemy") {
        const station = this.alchemyStands.get(entry.key);
        if (!station) continue;
        const next = stepAlchemyStand(station, elapsed);
        this.alchemyStands.set(entry.key, next);
        if (station.activeBatch && !next.activeBatch) meaningfulChange = true;
      } else {
        const station = this.distilleries.get(entry.key);
        if (!station) continue;
        const next = stepDistillery(station, elapsed);
        this.distilleries.set(entry.key, next);
        if (station.activeBatch && !next.activeBatch) meaningfulChange = true;
      }
    }
    this.persistentMachineCursor = (this.persistentMachineCursor + maximum) % entries.length;
    if (meaningfulChange) {
      this.saveSoon();
      this.emitHud(true);
    }
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
    this.audio.playSample?.(open ? "chestClose" : "chestOpen", { gain: 0.62, playbackRate: 1.22 });
    this.placeCooldown = 0.18;
    this.saveSoon();
  }

  playCreatureEvent(mob: MobEntity, event: CreatureSoundEvent) {
    const sound = creatureSoundCue(mob.kind as CoreMobKind, event);
    const sample = sound.asset === "ridgeback-warm-huff"
      ? "ridgebackWarmHuff"
      : sound.asset === "shadecrawler-stone-chitter"
        ? "shadecrawlerStoneChitter"
        : null;
    if (sample) {
      this.audio.playSample(sample, {
        gain: sound.gain,
        playbackRate: 1 + (Math.random() * 2 - 1) * sound.pitchJitter,
      });
      return;
    }
    this.audio.play(sound.fallback);
  }

  engageCombat(seconds = COMBAT_MUSIC_HOLD_SECONDS) {
    if (this.combatMusicTimer <= 0.001) {
      this.combatEncounter += 1;
      this.combatMusicScene = combatSceneForEncounter(this.combatEncounter);
    }
    this.combatMusicTimer = Math.max(this.combatMusicTimer, seconds);
  }

  consumeSelectedUnit() {
    const slot = this.selectedSlot();
    if (!slot || this.mode !== "survival") return;
    slot.count -= 1;
    if (slot.count <= 0) this.inventory[this.selected] = null;
  }

  replaceSelectedUnit(resultItem: ItemCode) {
    if (this.mode !== "survival") return;
    const slot = this.selectedSlot();
    if (!slot) return;
    if (slot.count <= 1) this.inventory[this.selected] = { item: resultItem, count: 1 };
    else {
      slot.count -= 1;
      const leftover = this.addItem(resultItem, 1);
      if (leftover) this.spawnDrop(resultItem, leftover, this.position.clone().add(new THREE.Vector3(0, 0.7, 0)));
    }
  }

  schedulePlantGrowth(x: number, y: number, z: number, type: BlockId, cycle = 0) {
    this.saplings ??= new Map<string, number>();
    const now = Date.now();
    if (type === BlockId.WildwoodSapling) {
      this.saplings.set(blockKey(x, y, z), now + 75_000 + Math.random() * 75_000);
      return;
    }
    if (type === BlockId.AppleSapling) {
      this.saplings.set(blockKey(x, y, z), now + 95_000 + Math.random() * 80_000);
      return;
    }
    const soil = this.world.getBlock(x, y - 1, z);
    const delay = growthDelaySeconds(type, soil === BlockId.HydratedFarmland, this.world.seedText, { x, y, z }, cycle);
    if (delay !== null && nextPlantStage(type) !== null) this.saplings.set(blockKey(x, y, z), now + delay * 1000);
    else this.saplings.delete(blockKey(x, y, z));
  }

  applyHarvest(x: number, y: number, z: number, type: BlockId, useScythe: boolean) {
    const result = harvestPlant(type, useScythe, Math.random());
    if (!result) return false;
    this.world.setBlock(x, y, z, result.replacement, true, true);
    this.publishBlockEdits([{ x, y, z, type: result.replacement }], "place");
    for (const drop of result.drops) {
      const leftover = this.mode === "survival" ? this.addItem(drop.item, drop.count) : 0;
      if (leftover) this.spawnDrop(drop.item, leftover, new THREE.Vector3(x, y, z));
    }
    if (useScythe) this.damageSelectedTool();
    this.schedulePlantGrowth(x, y, z, result.replacement, 1);
    this.placeCooldown = 0.2;
    this.heldUse = 1;
    this.audio.play("pickup", type);
    this.spawnParticles(x, y, z, type, 4);
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  creatureMetadataForMob(mob: MobEntity): CreatureMetadata {
    return {
      schema: 1,
      entityId: String(mob.id),
      kind: mob.kind,
      health: mob.health,
      maxHealth: mob.maxHealth,
      ageTicks: Math.floor(mob.age * 20),
      baby: Boolean(mob.petState?.baby || mob.careState?.baby),
      temperament: mob.definition.temperament,
      hostile: mob.hostile,
      tamed: Boolean(mob.petState?.tamed || mob.shadeState?.tamed || mob.reedstriderBond?.tamed || mob.courserBond?.tamed || mob.apiaryBee?.tamed),
      ownerId: mob.petState?.ownerId ?? mob.shadeState?.ownerId ?? mob.reedstriderBond?.ownerId ?? mob.courserBond?.ownerId ?? mob.apiaryBee?.ownerId ?? null,
      name: mob.petState?.name ?? (mob.name !== mob.definition.name ? mob.name : null),
      geneticSeed: mob.petState?.geneticSeed ?? mob.apiaryBee?.geneticSeed ?? ((mob.id * 2654435761) >>> 0),
      command: mob.petState?.command ?? null,
      custom: JSON.parse(JSON.stringify({
        ...(mob.petState ? { petState: mob.petState } : {}),
        ...(mob.careState ? { careState: mob.careState } : {}),
        ...(mob.shadeState ? { shadeState: mob.shadeState } : {}),
        ...(mob.reedstriderBond ? { reedstriderBond: mob.reedstriderBond } : {}),
        ...(mob.courserBond ? { courserBond: mob.courserBond } : {}),
        ...(mob.apiaryBee ? { apiaryBee: mob.apiaryBee } : {}),
        ...(mob.socialGroupId ? { socialGroupId: mob.socialGroupId } : {}),
        ...(mob.peelopShedding ? { peelopShedding: mob.peelopShedding } : {}),
        ...(mob.kind === "meadow-cow" && mob.milkCooldown > 0 ? { milkCooldown: mob.milkCooldown } : {}),
        persistentPoiResident: mob.persistentPoiResident,
        enclosed: mob.enclosed,
      })) as CreatureMetadata["custom"],
    };
  }

  spawnCreatureMetadata(metadata: CreatureMetadata, releasePosition: THREE.Vector3) {
    const definition = MOB_DEFS[metadata.kind];
    const ground = this.world.findWalkableY(Math.round(releasePosition.x), Math.round(releasePosition.z), releasePosition.y);
    releasePosition.y = ground + definition.footOffset;
    const mob = this.spawnMob(metadata.kind, releasePosition, {
      health: metadata.health,
      age: metadata.ageTicks / 20,
      petState: metadata.kind === "peelop" && metadata.custom.petState ? metadata.custom.petState as unknown as PeelopState : null,
      careState: metadata.custom.careState ? metadata.custom.careState as unknown as CreatureHusbandryState : null,
      shadeState: metadata.kind === "shadecrawler" && metadata.custom.shadeState ? metadata.custom.shadeState as unknown as ShadecrawlerState : null,
      reedstriderBond: metadata.kind === "reedstrider" && metadata.custom.reedstriderBond ? metadata.custom.reedstriderBond as unknown as ReedstriderBond : null,
      courserBond: (metadata.kind === "wild-horse" || metadata.kind === "warg") && metadata.custom.courserBond ? metadata.custom.courserBond as unknown as ReedstriderBond : null,
      apiaryBee: metadata.custom.apiaryBee ? metadata.custom.apiaryBee as unknown as ApiaryBee : null,
      socialGroupId: typeof metadata.custom.socialGroupId === "string" ? metadata.custom.socialGroupId : null,
      peelopShedding: metadata.custom.peelopShedding ? metadata.custom.peelopShedding as unknown as PeelopSheddingState : null,
      milkCooldown: metadata.kind === "meadow-cow" ? Math.max(0, Number(metadata.custom.milkCooldown) || 0) : 0,
      persistentPoiResident: Boolean(metadata.custom.persistentPoiResident),
      enclosed: Boolean(metadata.custom.enclosed),
    });
    mob.name = metadata.name || mob.name;
    return mob;
  }

  storeFilledCaptureOrb(heldSlot: InventorySlot, orb: CaptureOrb) {
    const filled = captureOrbInventorySlot(orb);
    if (heldSlot.count <= 1) {
      this.inventory[this.selected] = filled;
      return true;
    }
    const emptyIndex = this.inventory.findIndex((slot, index) => index !== this.selected && !slot);
    if (emptyIndex < 0) return false;
    heldSlot.count -= 1;
    this.inventory[emptyIndex] = filled;
    return true;
  }

  activateCloudglassReliquary() {
    const ownerId = this.localPlayerId();
    const rangeSquared = 20 * 20;
    const companions = this.mobs.filter((mob) => {
      const owned = (mob.petState?.tamed && mob.petState.ownerId === ownerId)
        || (mob.shadeState?.tamed && mob.shadeState.ownerId === ownerId)
        || (mob.reedstriderBond?.tamed && mob.reedstriderBond.ownerId === ownerId)
        || (mob.courserBond?.tamed && mob.courserBond.ownerId === ownerId)
        || (mob.apiaryBee?.tamed && mob.apiaryBee.ownerId === ownerId);
      return Boolean(owned && mob.group.position.distanceToSquared(this.position) <= rangeSquared);
    });
    let healed = 0;
    let recalled = 0;
    companions.forEach((mob, index) => {
      const before = mob.health;
      mob.health = Math.min(mob.maxHealth, mob.health + 2);
      if (mob.health > before) healed += 1;
      if (mob.petState) mob.petState.health = mob.health;
      const follows = (mob.petState?.command === "follow") || Boolean(mob.shadeState?.tamed);
      const distanceSquared = mob.group.position.distanceToSquared(this.position);
      if (!follows || distanceSquared <= 9 * 9) return;
      const angle = this.followerHeading + Math.PI + (index - (companions.length - 1) / 2) * 0.62;
      const x = this.position.x + Math.cos(angle) * 3.1;
      const z = this.position.z + Math.sin(angle) * 3.1;
      const targetY = mob.definition.movement === "ground" ? this.mobMoveTarget(mob, x, z) : this.position.y + 1.2;
      if (targetY === null) return;
      mob.group.position.set(x, targetY, z);
      mob.baseY = targetY;
      mob.route = createCreatureRouteState(mob.angle);
      mob.state = "wander";
      mob.stateTimer = 0;
      mob.wanderTimer = 0.4;
      recalled += 1;
    });

    let message: string;
    if (companions.length) {
      message = recalled || healed
        ? `Cloudglass pulse: ${healed} companion${healed === 1 ? "" : "s"} mended, ${recalled} follower${recalled === 1 ? "" : "s"} recalled.`
        : `Cloudglass finds ${companions.length} bonded companion${companions.length === 1 ? "" : "s"}; all are already near and whole.`;
    } else {
      const sightings: Array<{ name: string; x: number; z: number; distanceSquared: number }> = this.mobs.map((mob) => ({
        name: mob.name,
        x: mob.group.position.x,
        z: mob.group.position.z,
        distanceSquared: mob.group.position.distanceToSquared(this.position),
      }));
      for (const key of this.apiaries?.keys?.() ?? []) {
        const [x, , z] = key.split(",").map(Number);
        sightings.push({ name: "apiary habitat", x, z, distanceSquared: (x - this.position.x) ** 2 + (z - this.position.z) ** 2 });
      }
      for (const key of this.chests?.keys?.() ?? []) {
        if (!key.startsWith("exhibit:")) continue;
        const [x, , z] = key.slice("exhibit:".length).split(",").map(Number);
        sightings.push({ name: "living conservatory", x, z, distanceSquared: (x - this.position.x) ** 2 + (z - this.position.z) ** 2 });
      }
      const nearest = sightings.sort((left, right) => left.distanceSquared - right.distanceSquared)[0];
      if (!nearest) message = "Cloudglass sends a clear note into the wild, but no creature or tended habitat answers.";
      else {
        const dx = nearest.x - this.position.x;
        const dz = nearest.z - this.position.z;
        const direction = Math.abs(dx) > Math.abs(dz) * 1.6 ? (dx > 0 ? "east" : "west")
          : Math.abs(dz) > Math.abs(dx) * 1.6 ? (dz > 0 ? "south" : "north")
            : `${dz > 0 ? "south" : "north"}-${dx > 0 ? "east" : "west"}`;
        message = `Cloudglass answers faintly: ${nearest.name}, ${Math.round(Math.sqrt(nearest.distanceSquared))} blocks ${direction}.`;
      }
    }
    this.spawnParticles(this.position.x, this.position.y + 0.85, this.position.z, BlockId.CrystalBlock, 14);
    this.damageSelectedTool(1);
    this.heldUse = 1;
    this.placeCooldown = 0.8;
    this.audio.play("craft");
    this.events.onToast(message);
    this.saveSoon();
    this.emitHud(true);
    return { healed, recalled, companions: companions.length, message };
  }

  useSelected() {
    if (this.placeCooldown > 0) return;
    const heldSlot = this.selectedSlot();
    const heldDefinition = heldSlot ? ITEMS[heldSlot.item] : null;
    if (heldSlot && heldDefinition?.useKind === "blueprint" && heldDefinition.blueprintId) {
      const result = consumeBlueprintItem(this.blueprints, heldDefinition.blueprintId, Date.now());
      this.blueprints = result.state;
      if (result.consumeItem) {
        this.consumeSelectedUnit();
        this.events.onToast(`Blueprint learned: ${heldDefinition.name}. The linked recipes are now available.`);
        this.audio.play("craft");
        this.saveSoon();
        this.emitHud(true);
      } else if (result.outcome === "already-known") {
        this.events.onToast(`You already know this design. A merchant may buy the duplicate for about ${result.resaleGold} gold.`);
      } else this.events.onToast("This blueprint is too damaged to read.");
      this.placeCooldown = 0.25;
      return;
    }
    if (heldSlot && heldDefinition?.useKind === "potion") {
      const recipeId = POTION_RECIPE_BY_ITEM[heldSlot.item];
      if (!recipeId) return;
      if (heldSlot.item === Item.HealthPotion && this.health >= 10) {
        this.events.onToast("Your health is already full; the remedy stays corked.");
        return;
      }
      if (heldSlot.item === Item.HealthPotion) this.health = Math.min(10, this.health + 8);
      else if (heldSlot.item === Item.WayfarerPotion) this.mapKnowledge = bankFastTravelCharges(this.mapKnowledge, 1);
      else {
        const duration = heldSlot.item === Item.HearthwardTonic ? 180 : 240;
        const buff = heldSlot.item === Item.HearthwardTonic ? "hearthward" : "gloamstep";
        this.potionBuffs[buff] = Math.max(this.potionBuffs[buff] ?? 0, this.worldSimulationSeconds() + duration);
      }
      this.consumeSelectedUnit();
      this.heldUse = 1;
      this.placeCooldown = 0.42;
      this.audio.play("eat");
      this.events.onToast(heldSlot.item === Item.WayfarerPotion
        ? `One journey banked. ${this.mapKnowledge.fastTravelCharges} map travel${this.mapKnowledge.fastTravelCharges === 1 ? "" : "s"} ready.`
        : `${heldDefinition.name} takes effect.`);
      this.saveSoon();
      this.emitHud(true);
      return;
    }
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
    if (this.targetMob?.definition?.sentient && this.targetMob.factionId && this.targetMob.factionId !== "player") {
      const resident = this.targetMob;
      const residentFaction = resident.factionId as "hobbits" | "goblins";
      const standing = factionStanding(this.factionRelations.alignments[residentFaction] ?? 0);
      if (standing === "hostile") {
        resident.hostile = true;
        resident.awarenessTimer = Math.max(resident.awarenessTimer, 8);
        resident.state = "chase";
        this.events.onToast(`${resident.name} refuses parley; your standing with this faction is hostile.`);
        this.engageCombat();
        return;
      }
      this.activeSentient = resident;
      this.activeSettlementId = resident.settlementId;
      this.activeMerchantId = resident.residentId && this.merchants.has(resident.residentId) ? resident.residentId : null;
      this.ensureSideQuestOffers(resident);
      this.dispatchQuestEvent({ type: "entity-interacted", entityId: resident.residentId ?? String(resident.id), role: resident.profession, at: Date.now() });
      this.openOverlay("sentient", resident.residentId ?? String(resident.id));
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
    if (heldSlot && (heldSlot.item === Item.CaptureOrb || heldSlot.item === Item.LegacyCaptureOrb)) {
      const orb = captureOrbUnitFromInventorySlot(heldSlot);
      if (!orb) {
        this.inventory[this.selected] = captureOrbInventorySlot(createEmptyCaptureOrb(`orb-${Date.now().toString(36)}`));
        this.heldItemCode = -1;
        this.events.onToast("The damaged orb record dissolved; its shell is ready to use again.");
        return;
      }
      if (orb.creature) {
        const released = releaseCaptureOrb(orb);
        if (!released) return;
        const direction = this.camera.getWorldDirection(new THREE.Vector3());
        const releasePosition = this.target
          ? new THREE.Vector3(this.target.placeX, this.target.placeY + MOB_DEFS[released.creature.kind].footOffset, this.target.placeZ)
          : this.position.clone().add(direction.setY(0).normalize().multiplyScalar(1.8));
        const mob = this.spawnCreatureMetadata(released.creature, releasePosition);
        this.inventory[this.selected] = captureOrbInventorySlot(released.orb);
        this.heldItemCode = -1;
        this.spawnParticles(mob.group.position.x, mob.group.position.y + mob.definition.height * 0.45, mob.group.position.z, BlockId.CrystalBlock, 12);
        this.placeCooldown = 0.35;
        this.events.onToast(`${mob.name} steps out with its exact health, age, and bond intact.`);
        this.audio.play("craft");
        this.saveSoon();
        this.emitHud(true);
        return;
      }
      if (!this.targetMob) {
        this.events.onToast("Aim the empty Capture Orb at a creature. Hostiles must be below half health or at one heart.");
        return;
      }
      const mob = this.targetMob;
      if (mob.kind === "hive-queen" && !canCatchHiveQueen(mob.health, mob.maxHealth, "capture-orb")) {
        this.events.onToast("The Hive Queen is too strong for the orb. Weaken her below half health first.");
        return;
      }
      const metadata = this.creatureMetadataForMob(mob);
      const captured = captureIntoOrb(orb, metadata);
      if (!captured) {
        this.events.onToast(`${mob.name} is fighting too strongly to capture.`);
        return;
      }
      if (!this.storeFilledCaptureOrb(heldSlot, captured)) {
        this.events.onToast("Make one empty pack slot before splitting a filled orb from this stack.");
        return;
      }
      this.bestiary[mob.kind].seen = true;
      this.bestiary[mob.kind].captures += 1;
      this.spawnParticles(mob.group.position.x, mob.group.position.y + mob.definition.height * 0.45, mob.group.position.z, BlockId.CrystalBlock, 12);
      const mobIndex = this.mobs.indexOf(mob);
      if (mobIndex >= 0) this.removeMob(mobIndex);
      this.heldItemCode = -1;
      this.placeCooldown = 0.4;
      this.audio.play("craft");
      this.events.onToast(`${metadata.name ?? mob.definition.name} is safely preserved in the Waykeeper Capture Orb.`);
      this.saveSoon();
      this.emitHud(true);
      return;
    }
    if (heldSlot?.item === Item.Lead && this.targetMob) {
      const mob = this.targetMob;
      if (this.leadAnchors.has(mob.id)) {
        this.events.onToast(`${mob.name} is already on a lead.`);
        this.placeCooldown = 0.18;
        return;
      }
      this.leadAnchors.set(mob.id, { mobId: String(mob.id), maximumLength: 9 });
      this.consumeSelectedUnit();
      this.ensureLeadLine(mob.id);
      this.placeCooldown = 0.25;
      this.audio.play("craft");
      this.events.onToast(`${mob.name} is now on a braided lead. Crouch-use a fence to hitch it.`);
      this.saveSoon();
      this.emitHud(true);
      return;
    }
    if (this.targetMob?.kind === "meadow-cow" && heldSlot?.item === Item.Bucket) {
      const cloverback = this.targetMob;
      const remaining = Math.max(0, cloverback.milkCooldown ?? 0);
      if (remaining > 0) {
        this.events.onToast(`This Cloverback needs another ${Math.ceil(remaining)} seconds before it can be milked again.`);
        this.placeCooldown = 0.22;
        return;
      }
      cloverback.milkCooldown = CLOVERBACK_MILK_COOLDOWN_SECONDS;
      this.replaceSelectedUnit(Item.MilkBottle);
      this.heldItemCode = -1;
      this.heldUse = 1;
      this.placeCooldown = 0.38;
      this.audio.play("pickup");
      this.events.onToast("The Cloverback fills one bucket with cool Meadow Milk.");
      this.saveSoon();
      this.emitHud(true);
      return;
    }
    if (this.targetMob?.kind === "hive-queen" && heldSlot?.item === Item.RoyalJelly) {
      const queen = this.targetMob;
      if (queen.health > queen.maxHealth / 2) {
        this.events.onToast("The Hive Queen is too agitated to accept Royal Jelly. Weaken her below half health first.");
        this.placeCooldown = 0.25;
        return;
      }
      queen.apiaryBee ??= {
        id: `queen-mob-${queen.id}`,
        role: "queen",
        alive: true,
        home: false,
        outbound: false,
        carryingNectar: 0,
        lastReturnDay: this.day,
        disconnectedDay: null,
        geneticSeed: (queen.id * 2654435761) >>> 0,
        angry: true,
        tamed: false,
        ownerId: null,
      };
      const before = queen.apiaryBee;
      queen.apiaryBee = tameHiveQueen(before, heldSlot.item, this.localPlayerId());
      if (queen.apiaryBee === before) return;
      queen.hostile = false;
      queen.fleeTimer = 0;
      this.consumeSelectedUnit();
      this.bestiary["hive-queen"].tames = (this.bestiary["hive-queen"].tames ?? 0) + 1;
      this.events.onToast("The queen accepts the Royal Jelly and turns her colony's defense toward you.");
      this.audio.play("craft");
      this.placeCooldown = 0.35;
      this.saveSoon();
      this.emitHud(true);
      return;
    }
    if (this.targetMob?.kind === "wild-horse") {
      const courser = this.targetMob;
      const ownerId = this.localPlayerId();
      courser.courserBond ??= createReedstriderBond();
      if (heldSlot && (heldSlot.item === Item.Apple || heldSlot.item === Item.Wheat)) {
        const before = courser.courserBond;
        const next = feedCourserBond(before, ownerId, heldSlot.item);
        courser.courserBond = next;
        this.consumeSelectedUnit();
        if (!before.tamed && next.tamed) {
          this.bestiary["wild-horse"].tames = (this.bestiary["wild-horse"].tames ?? 0) + 1;
          this.events.onToast("The Wildwood Courser stops circling and chooses you as its rider.");
        } else this.events.onToast(`Courser trust ${next.trust}/8 · apples build trust fastest.`);
        this.audio.play("eat");
        this.placeCooldown = 0.3;
        this.saveSoon();
        this.emitHud(true);
        return;
      }
      if (heldSlot?.item === Item.Saddle) {
        const next = saddleReedstrider(courser.courserBond, ownerId);
        if (next !== courser.courserBond) {
          courser.courserBond = next;
          this.consumeSelectedUnit();
          this.events.onToast("The Trail Saddle settles onto the Courser.");
          this.saveSoon();
          this.emitHud(true);
        } else this.events.onToast(courser.courserBond.tamed ? "Only this Courser's keeper can saddle it." : "Feed it patiently before fitting a saddle.");
        this.placeCooldown = 0.3;
        return;
      }
      if (canRideReedstrider(courser.courserBond, ownerId)) {
        this.mountedCreatureId = courser.id;
        if (this.cameraMode === "first") this.cameraMode = "third-rear";
        this.keys.clear();
        this.events.onToast("Mounted Wildwood Courser · sprint on open land · Space dismounts · V changes view.");
        this.placeCooldown = 0.35;
        this.emitHud(true);
        return;
      }
    }
    if (this.targetMob?.kind === "warg") {
      const warg = this.targetMob;
      const ownerId = this.localPlayerId();
      warg.courserBond ??= createReedstriderBond();
      if (warg.aligned) {
        this.events.onToast("This Road Warg is sworn to its settlement. Only an unaligned Warg can choose a rider.");
        this.placeCooldown = 0.24;
        return;
      }
      if (heldSlot && (heldSlot.item === Item.RawMeat || heldSlot.item === Item.CookedMeat)) {
        const before = warg.courserBond;
        const gain = heldSlot.item === Item.CookedMeat ? 2 : 1;
        const trust = Math.min(8, before.trust + gain);
        warg.courserBond = { ...before, trust, tamed: before.tamed || trust >= 6, ownerId: before.ownerId ?? (trust >= 6 ? ownerId : null) };
        this.consumeSelectedUnit();
        if (!before.tamed && warg.courserBond.tamed) {
          this.bestiary.warg.tames = (this.bestiary.warg.tames ?? 0) + 1;
          this.events.onToast("The unaligned Warg accepts you as its roadmate and rider.");
        } else this.events.onToast(`Warg trust ${warg.courserBond.trust}/8.`);
        this.audio.play("eat");
        this.saveSoon();
        this.emitHud(true);
        this.placeCooldown = 0.3;
        return;
      }
      if (heldSlot?.item === Item.Saddle) {
        const next = saddleReedstrider(warg.courserBond, ownerId);
        if (next !== warg.courserBond) {
          warg.courserBond = next;
          this.consumeSelectedUnit();
          this.events.onToast("The Trail Saddle locks into the Warg's road harness.");
          this.saveSoon();
          this.emitHud(true);
        } else this.events.onToast(warg.courserBond.tamed ? "Only this Warg's keeper can saddle it." : "Build trust with meat before fitting a saddle.");
        this.placeCooldown = 0.3;
        return;
      }
      if (canRideReedstrider(warg.courserBond, ownerId)) {
        this.mountedCreatureId = warg.id;
        if (this.cameraMode === "first") this.cameraMode = "third-rear";
        this.keys.clear();
        this.events.onToast("Mounted Road Warg - attacks and crossbows remain usable from the saddle.");
        this.placeCooldown = 0.35;
        this.emitHud(true);
        return;
      }
    }
    if (this.targetMob?.kind === "reedstrider") {
      const reedstrider = this.targetMob;
      const ownerId = this.localPlayerId();
      reedstrider.reedstriderBond ??= createReedstriderBond();
      if (heldSlot && (heldSlot.item === Item.RawFish || heldSlot.item === Item.CookedFish || heldSlot.item === Item.GlowScale)) {
        const before = reedstrider.reedstriderBond;
        const next = feedReedstrider(before, ownerId, heldSlot.item);
        if (next !== before) {
          reedstrider.reedstriderBond = next;
          this.consumeSelectedUnit();
          if (!before.tamed && next.tamed) {
            this.bestiary.reedstrider.tames = (this.bestiary.reedstrider.tames ?? 0) + 1;
            this.events.onToast("The Reedstrider lowers its sail-like crest and accepts you as its keeper.");
          } else this.events.onToast(`Reedstrider trust ${next.trust}/8 · Glow Scales build trust fastest.`);
          this.audio.play("eat");
          this.saveSoon();
          this.emitHud(true);
        }
        this.placeCooldown = 0.3;
        return;
      }
      if (heldSlot?.item === Item.Saddle) {
        const next = saddleReedstrider(reedstrider.reedstriderBond, ownerId);
        if (next !== reedstrider.reedstriderBond) {
          reedstrider.reedstriderBond = next;
          this.consumeSelectedUnit();
          this.events.onToast("The saddle sits securely behind the Reedstrider's crest.");
          this.saveSoon();
          this.emitHud(true);
        } else this.events.onToast(reedstrider.reedstriderBond.tamed ? "Only this Reedstrider's keeper can saddle it." : "Build its trust before fitting a saddle.");
        this.placeCooldown = 0.3;
        return;
      }
      if (canRideReedstrider(reedstrider.reedstriderBond, ownerId)) {
        this.mountedCreatureId = reedstrider.id;
        if (this.cameraMode === "first") this.cameraMode = "third-rear";
        this.keys.clear();
        this.events.onToast("Mounted Reedstrider · faster through water · Space dismounts · V changes view.");
        this.placeCooldown = 0.35;
        this.emitHud(true);
        return;
      }
    }
    if (this.targetMob?.kind === "shadecrawler") {
      const shade = this.targetMob;
      const ownerId = this.localPlayerId();
      shade.shadeState = normalizeShadecrawlerState(shade.shadeState ?? createShadecrawlerState());
      if (heldSlot?.item === Item.Saddle) {
        const next = equipShadecrawlerSaddle(shade.shadeState, ownerId);
        if (next !== shade.shadeState) {
          shade.shadeState = next;
          this.consumeSelectedUnit();
          this.bestiary.shadecrawler.secretUnlocked = true;
          this.events.onToast("The saddle settles between the grown Shadecrawler's plates. It is ready to ride.");
          this.playCreatureEvent(shade, "mount");
          this.saveSoon();
          this.emitHud(true);
        } else if (!shade.shadeState.tamed) this.events.onToast("This Shadecrawler does not trust you yet.");
        else if (shade.shadeState.growth < 1) this.events.onToast("It must reach full size before it can carry a saddle.");
        else this.events.onToast("This Shadecrawler already wears a saddle.");
        this.placeCooldown = 0.3;
        return;
      }
      if (heldSlot && (heldSlot.item === Item.Berry || heldSlot.item === Item.RottenFlesh
        || heldSlot.item === Item.RawMeat || heldSlot.item === Item.NocturneHeart)) {
        const beforeGrowth = shade.shadeState.growth;
        const result = feedShadecrawler(shade.shadeState, ownerId, heldSlot.item);
        if (!result.accepted) {
          this.events.onToast(result.catalystNeeded
            ? "It is calm enough to accept a rare Nocturne Heart."
            : shade.shadeState.tamed ? "Only its keeper can deepen this bond." : "Moonberries first; patient feeding quiets its fear.");
          this.placeCooldown = 0.22;
          return;
        }
        shade.shadeState = result.state;
        shade.hostile = false;
        const nextMaxHealth = Math.round(shade.definition.health * shadecrawlerScale(shade.shadeState));
        shade.health = Math.min(nextMaxHealth, shade.health + (result.tamedNow ? 5 : shade.shadeState.growth > beforeGrowth ? 3 : 1));
        shade.maxHealth = nextMaxHealth;
        this.applyMobScale(shade, shadecrawlerScale(shade.shadeState));
        this.consumeSelectedUnit();
        this.bestiary.shadecrawler.seen = true;
        if (result.tamedNow) {
          this.bestiary.shadecrawler.tames = (this.bestiary.shadecrawler.tames ?? 0) + 1;
          this.bestiary.shadecrawler.secretUnlocked = true;
          this.events.onToast("The Nocturne Heart steadies. The Shadecrawler accepts you as its keeper.");
          this.playCreatureEvent(shade, "tame");
        } else if (!shade.shadeState.tamed) {
          this.events.onToast(result.catalystNeeded
            ? "It takes the Moonberry gently. A Nocturne Heart could now complete the bond."
            : `Trust ${shade.shadeState.trustFeeds}/6 · keep offering Moonberries.`);
          this.playCreatureEvent(shade, "feed");
        } else {
          const percent = Math.round(shade.shadeState.growth * 100);
          this.events.onToast(percent >= 100 ? "The Shadecrawler has reached its full, rideable size." : `Shadecrawler growth ${percent}% · continue feeding it.`);
          this.playCreatureEvent(shade, "feed");
        }
        this.placeCooldown = 0.32;
        this.saveSoon();
        this.emitHud(true);
        return;
      }
      if (canRideShadecrawler(shade.shadeState, ownerId)) {
        this.mountedCreatureId = shade.id;
        if (this.cameraMode === "first") this.cameraMode = "third-rear";
        this.keys.clear();
        this.events.onToast("Mounted Shadecrawler · WASD ride · Space dismount · V changes view.");
        this.playCreatureEvent(shade, "mount");
        this.placeCooldown = 0.35;
        this.emitHud(true);
        return;
      }
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
          if (result.tamed) this.bestiary.peelop.tames = (this.bestiary.peelop.tames ?? 0) + 1;
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
            this.bestiary.peelop.breeds = (this.bestiary.peelop.breeds ?? 0) + 1;
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
    if (this.targetMob?.careState && this.targetMob.kind !== "peelop" && heldSlot) {
      const mob = this.targetMob;
      const fed = feedCreatureForHusbandry(mob.definition, mob.careState!, heldSlot.item);
      if (fed.accepted) {
        mob.careState = fed.state;
        mob.health = Math.min(mob.maxHealth, mob.health + 1);
        this.consumeSelectedUnit();
        this.bestiary[mob.kind].seen = true;
        let bred = false;
        if (fed.breedingFood) {
          const partner = this.mobs.find((candidate) => candidate !== mob
            && candidate.kind === mob.kind
            && candidate.careState
            && candidate.group.position.distanceToSquared(mob.group.position) < 25
            && canBreedCreatures(mob.kind, fed.state, candidate.kind, candidate.careState));
          const partnerState = partner?.careState;
          const family = partner && partnerState
            ? breedCreatureStates(mob.kind, fed.state, partner.kind, partnerState)
            : null;
          if (family && partner) {
            mob.careState = family.left;
            partner.careState = family.right;
            const child = this.spawnMob(mob.kind, mob.group.position.clone().add(new THREE.Vector3(0.58, 0, 0.42)), { careState: family.child });
            const childGroundY = this.mobMoveTarget(child, child.group.position.x, child.group.position.z);
            if (childGroundY !== null) child.group.position.y = childGroundY;
            child.baseY = child.group.position.y;
            this.bestiary[mob.kind].breeds = (this.bestiary[mob.kind].breeds ?? 0) + 1;
            this.events.onToast(`A young ${mob.definition.name} joins the pair.`);
            this.playCreatureEvent(mob, "breed");
            bred = true;
          }
        }
        if (!bred) {
          this.events.onToast(fed.breedingFood ? `${mob.name} is ready to pair with another well-fed adult nearby.` : `${mob.name} accepts the food and recovers.`);
          this.playCreatureEvent(mob, "feed");
        }
        this.placeCooldown = 0.32;
        this.saveSoon();
        this.emitHud(true);
        return;
      }
    }
    if (heldSlot?.item === Item.CloudglassRelic) {
      this.activateCloudglassReliquary();
      return;
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
      if (this.targetMob?.kind === "honeybee") {
        const worker = this.targetMob;
        const workerBee = worker.apiaryBee ?? {
          id: `worker-mob-${worker.id}`,
          role: "worker" as const,
          alive: true,
          home: false,
          outbound: false,
          carryingNectar: 0,
          lastReturnDay: this.day,
          disconnectedDay: null,
          geneticSeed: (worker.id * 2654435761) >>> 0,
          angry: false,
          tamed: false,
          ownerId: null,
        };
        const workerItem = captureWorkerBeeItem(workerBee);
        if (workerItem && this.addItem(workerItem.item, 1, workerItem.durability, undefined, workerItem.metadata) === 0) {
          this.removeMob(this.mobs.indexOf(worker));
          this.damageSelectedTool();
          this.heldUse = 1;
          this.placeCooldown = 0.3;
          this.events.onToast("The worker settles into a breathable apiary capsule for Queen Cell crafting.");
          this.audio.play("craft");
          this.saveSoon();
          this.emitHud(true);
        } else this.events.onToast("Make room in your pack before netting this worker.");
        return;
      }
      if (this.targetMob?.kind === "hive-queen") {
        const queen = this.targetMob;
        if (!canCatchHiveQueen(queen.health, queen.maxHealth, "net")) {
          this.events.onToast("The Hive Queen tears free. A net only holds her below half health.");
          this.damageSelectedTool();
          this.placeCooldown = 0.3;
          return;
        }
        const metadata = queen.apiaryBee ? { beeId: queen.apiaryBee.id, geneticSeed: queen.apiaryBee.geneticSeed } : { beeId: `queen-${queen.id}`, geneticSeed: queen.id };
        if (this.addItem(Item.QueenCell, 1, undefined, undefined, metadata) > 0) {
          this.events.onToast("Make room in your pack before securing the queen.");
          return;
        }
        this.removeMob(this.mobs.indexOf(queen));
        this.damageSelectedTool();
        this.heldUse = 1;
        this.placeCooldown = 0.35;
        this.bestiary["hive-queen"].captures += 1;
        this.events.onToast("The weakened queen is secured as a living Queen Cell, ready for an empty apiary.");
        this.audio.play("craft");
        this.saveSoon();
        this.emitHud(true);
        return;
      }
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
      if (shouldBypassOpenableUse(this.crouching, heldDefinition?.placeBlock !== undefined, this.target.type)) {
        this.placeBlock();
        return;
      }
      const gate = toggleFenceGate(this.target.type);
      if (gate !== null) {
        this.world.setBlock(this.target.x, this.target.y, this.target.z, gate, true, true);
        this.publishBlockEdits([{ x: this.target.x, y: this.target.y, z: this.target.z, type: gate }], "place");
        this.placeCooldown = 0.18;
        this.audio.playSample?.(this.target.type === BlockId.FenceGateNorthSouthOpen || this.target.type === BlockId.FenceGateEastWestOpen
          ? "chestClose" : "chestOpen", { gain: 0.55, playbackRate: 1.28 });
        this.saveSoon();
        return;
      }
      if (canHitchLead(this.crouching, this.target.type, this.leadAnchors.values())) {
        const candidate = [...this.leadAnchors.entries()]
          .filter(([, anchor]) => !anchor.fence)
          .map(([mobId]) => this.mobs.find((mob) => mob.id === mobId))
          .filter((mob): mob is MobEntity => Boolean(mob))
          .sort((a, b) => a.group.position.distanceToSquared(this.position) - b.group.position.distanceToSquared(this.position))[0];
        if (!candidate) this.events.onToast("Put a creature on the lead first, then crouch-use the fence.");
        else {
          const anchor = this.leadAnchors.get(candidate.id)!;
          this.leadAnchors.set(candidate.id, {
            ...anchor,
            fence: { x: this.target.x, y: this.target.y, z: this.target.z },
          });
          this.events.onToast(`${candidate.name}'s lead is hitched to the fence.`);
          this.audio.play("place", BlockId.Planks);
          this.saveSoon();
        }
        this.placeCooldown = 0.22;
        return;
      }
      const useScythe = heldDefinition?.useKind === "scythe";
      if (this.applyHarvest(this.target.x, this.target.y, this.target.z, this.target.type, useScythe)) return;
      if (heldDefinition?.useKind === "hoe") {
        const above = this.world.getBlock(this.target.x, this.target.y + 1, this.target.z);
        if (canTill(this.target.type, above)) {
          const tilled = farmlandState((x, y, z) => this.world.getBlock(x, y, z), this.target);
          this.world.setBlock(this.target.x, this.target.y, this.target.z, tilled, true, true);
          this.publishBlockEdits([{ x: this.target.x, y: this.target.y, z: this.target.z, type: tilled }], "place");
          this.damageSelectedTool();
          this.placeCooldown = 0.24;
          this.heldUse = 1;
          this.audio.play("place", BlockId.Dirt);
          this.saveSoon();
          this.emitHud(true);
          return;
        }
      }
      if (heldSlot && heldDefinition?.useKind === "plant") {
        const plantY = this.target.y + 1;
        const above = this.world.getBlock(this.target.x, plantY, this.target.z);
        const planted = plantingResult(heldSlot.item, this.target.type, above);
        if (planted) {
          this.world.setBlock(this.target.x, plantY, this.target.z, planted.block, true, true);
          this.publishBlockEdits([{ x: this.target.x, y: plantY, z: this.target.z, type: planted.block }], "place");
          this.consumeSelectedUnit();
          this.schedulePlantGrowth(this.target.x, plantY, this.target.z, planted.block);
          this.placeCooldown = 0.22;
          this.heldUse = 1;
          this.audio.play("place", this.target.type);
          this.events.onToast(`${planted.description} planted.`);
          this.saveSoon();
          this.emitHud(true);
          return;
        }
      }
      if (heldSlot && heldDefinition?.useKind === "bucket") {
        const placement = this.world.getBlock(this.target.placeX, this.target.placeY, this.target.placeZ);
        const bucket = resolveBucketAction(heldSlot.item, this.target.type, placement);
        if (bucket) {
          const edit = bucket.kind === "fill"
            ? { x: this.target.x, y: this.target.y, z: this.target.z, type: BlockId.Air }
            : { x: this.target.placeX, y: this.target.placeY, z: this.target.placeZ, type: bucket.place! };
          this.world.setBlock(edit.x, edit.y, edit.z, edit.type, true, true);
          this.publishBlockEdits([edit], bucket.kind === "fill" ? "break" : "place");
          this.notifyLiquidChanged(edit.x, edit.y, edit.z);
          this.replaceSelectedUnit(bucket.resultItem);
          this.placeCooldown = 0.26;
          this.heldUse = 1;
          this.audio.play("splash");
          this.events.onToast(bucket.kind === "fill" ? `Filled ${ITEMS[bucket.resultItem].name}.` : `${BLOCKS[bucket.place!].name} poured.`);
          this.saveSoon();
          this.emitHud(true);
          return;
        }
      }
      if (this.isDoor(this.target.type)) { this.toggleDoor(this.target.x, this.target.y, this.target.z, this.target.type); return; }
      if (this.isBed(this.target.type)) {
        this.setRespawnFromBed(this.target.x, this.target.y, this.target.z, this.target.type);
        this.openOverlay("sleep", key);
        return;
      }
      if (this.target.type === BlockId.CraftingTable) { this.openOverlay("crafting", key); return; }
      if (this.target.type === BlockId.Furnace) { this.openOverlay("furnace", key); return; }
      if (this.target.type === BlockId.Chest) { this.openOverlay("chest", key); return; }
      if (this.target.type === BlockId.Apiary || this.target.type === BlockId.WildBeehive) { this.openOverlay("apiary", key); return; }
      if (this.target.type === BlockId.CaptureOrbRack) { this.openOverlay("orb-rack", key); return; }
      if (this.target.type === BlockId.CreatureHealer) { this.openOverlay("healing-station", key); return; }
      if (this.target.type === BlockId.ButterflyExhibit) { this.openExhibit(this.target.x, this.target.y, this.target.z); return; }
      if (this.target.type === BlockId.CartographyTable) { this.openOverlay("cartography", key); return; }
      if (this.target.type === BlockId.AlchemyStand) { this.openOverlay("alchemy", key); return; }
      if (this.target.type === BlockId.Distillery) { this.openOverlay("distillery", key); return; }
      if (this.target.type === BlockId.Wayshrine) {
        const markerId = `wayshrine:${key}`;
        if (!this.mapKnowledge.markers.some((marker) => marker.id === markerId)) {
          this.mapKnowledge = placeWayshrine(this.mapKnowledge, {
            id: markerId,
            name: "Wayfarer's Wayshrine",
            position: { x: this.target.x, y: this.target.y + 1, z: this.target.z },
            playerId: this.localPlayerId(),
            discoveredAt: Date.now(),
            icon: "wayshrine",
          });
        }
        this.openOverlay("map", key);
        return;
      }
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
    if (requestedType === BlockId.FenceGateNorthSouthClosed) type = fenceGateForYaw(this.yaw);
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
    const placedKey = blockKey(x, y, z);
    if (type === BlockId.Chest) this.chests.set(placedKey, Array.from({ length: 27 }, () => null));
    if (type === BlockId.Furnace) this.furnaces.set(placedKey, blankFurnace());
    if (type === BlockId.Apiary) this.apiaries.set(placedKey, createEmptyApiaryBlock());
    if (type === BlockId.CaptureOrbRack) this.orbRacks.set(placedKey, createOrbRack());
    if (type === BlockId.CreatureHealer) this.healingStations.set(placedKey, createCreatureHealer());
    if (type === BlockId.AlchemyStand) this.alchemyStands.set(placedKey, createAlchemyStand());
    if (type === BlockId.Distillery) this.distilleries.set(placedKey, createDistillery());
    if (type === BlockId.Wayshrine) this.mapKnowledge = placeWayshrine(this.mapKnowledge, {
      id: `wayshrine:${placedKey}`,
      name: "Wayfarer's Wayshrine",
      position: { x, y: y + 1, z },
      playerId: this.localPlayerId(),
      discoveredAt: Date.now(),
      icon: "wayshrine",
    });
    if (type === BlockId.ButterflyExhibit) {
      const topology = this.exhibitTopologyAt(x, y, z);
      if (topology) this.consolidateExhibit(topology);
      this.syncExhibitVisuals(true);
    }
    this.schedulePlantGrowth(x, y, z, type);
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

  tryFellTree(x: number, y: number, z: number, _legacyType?: BlockId) {
    // Keep the former block-type argument source-compatible for older callers;
    // discovery now reads every connected segment directly from the world.
    void _legacyType;
    const tree = discoverRootedTree({ x, y, z }, (bx, by, bz) => this.world.getBlock(bx, by, bz));
    if (!tree) return false;
    const root: [number, number, number] = [tree.root.x, tree.root.y, tree.root.z];
    const changes = [...tree.logs, ...tree.leaves].map((block) => ({ x: block.x, y: block.y, z: block.z, type: BlockId.Air }));
    this.world.setBlocksBatch(changes, true, true);
    this.publishBlockEdits(changes, "batch");
    const group = new THREE.Group();
    group.position.set(root[0], root[1], root[2]);
    const matrix = new THREE.Matrix4();
    const addTexturedSegments = (blocks: typeof tree.logs, leafy: boolean) => {
      const byType = new Map<BlockId, typeof tree.logs>();
      for (const block of blocks) byType.set(block.type, [...(byType.get(block.type) ?? []), block]);
      for (const [blockType, positions] of byType) {
        const geometry = createAtlasBlockGeometry(blockType, leafy ? 0.9 : 0.94);
        const material = new THREE.MeshLambertMaterial({
          map: this.world.atlas,
          color: 0xffffff,
          ...(leafy ? { transparent: true, alphaTest: 0.32, side: THREE.DoubleSide } : {}),
        });
        const mesh = new THREE.InstancedMesh(geometry, material, positions.length);
        positions.forEach((block, index) => {
          matrix.makeTranslation(block.x - root[0], block.y - root[1], block.z - root[2]);
          mesh.setMatrixAt(index, matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        group.add(mesh);
      }
    };
    addTexturedSegments(tree.logs, false);
    addTexturedSegments(tree.leaves, true);
    this.scene.add(group);
    const away = new THREE.Vector3(root[0] - this.position.x, 0, root[2] - this.position.z).normalize();
    if (away.lengthSq() < 0.1) away.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    const logCounts = new Map<BlockId, number>();
    for (const log of tree.logs) logCounts.set(log.type, (logCounts.get(log.type) ?? 0) + 1);
    this.fallingTrees.push({
      group,
      root: new THREE.Vector3(...root),
      fallAxis: new THREE.Vector3(away.z, 0, -away.x).normalize(),
      progress: 0,
      primaryLogType: tree.root.type,
      logDrops: [...logCounts],
      logCount: tree.logs.length,
      leafCount: tree.leaves.length,
      harvest: this.mode === "survival",
    });
    if (this.persistent) window.clearTimeout(this.saveTimer);
    if (this.mode === "survival") this.damageSelectedTool(Math.max(1, Math.ceil(tree.logs.length / 4)));
    this.audio.play("break", tree.root.type);
    this.events.onToast(`${BLOCKS[tree.root.type].name.replace(" Log", "")} timber!`);
    return true;
  }

  settleFallingTree(tree: FallingTree) {
    const height = Math.max(3, tree.logCount);
    const direction = new THREE.Vector3(-tree.fallAxis.z, 0, tree.fallAxis.x);
    const landing = tree.root.clone().add(direction.multiplyScalar(Math.min(7, height * 0.7))).add(new THREE.Vector3(0, 0.4, 0));
    if (tree.harvest) {
      for (const [type, count] of tree.logDrops) this.spawnDrop(type, count, landing);
      const sticks = Math.floor(tree.leafCount * 0.09);
      if (sticks > 0) this.spawnDrop(Item.Stick, sticks, landing.clone().add(new THREE.Vector3(0.5, 0, 0.5)));
      const saplings = Math.max(1, Math.floor(tree.leafCount * 0.035));
      this.spawnDrop(BlockId.WildwoodSapling, saplings, landing.clone().add(new THREE.Vector3(-0.5, 0, -0.4)));
      if (tree.primaryLogType === BlockId.WildwoodLog && Math.random() < 0.55) this.spawnDrop(Item.Apple, 1, landing.clone().add(new THREE.Vector3(0.2, 0, -0.5)));
    }
    this.spawnParticles(landing.x, landing.y, landing.z, tree.primaryLogType, 18);
    this.audio.play("land", tree.primaryLogType);
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

  releaseApiaryResidents(key: string, released: ReturnType<typeof breakApiary>["released"], position: THREE.Vector3) {
    for (let index = this.mobs.length - 1; index >= 0; index -= 1) {
      if (this.mobs[index].beeHiveKey === key) this.removeMob(index);
    }
    const residents = [
      ...(released.queen ? [{ kind: "hive-queen" as const, bee: released.queen }] : []),
      ...released.workers.map((bee) => ({ kind: "honeybee" as const, bee })),
    ];
    residents.forEach(({ kind, bee }, index) => {
      const angle = index / Math.max(1, residents.length) * Math.PI * 2;
      this.spawnMob(kind, position.clone().add(new THREE.Vector3(Math.cos(angle) * 0.45, 0.8 + (index % 3) * 0.16, Math.sin(angle) * 0.45)), {
        apiaryBee: { ...bee, home: false, outbound: false, angry: true },
        persistentPoiResident: true,
      });
    });
  }

  breakApiaryAt(key: string, type: BlockId, position: THREE.Vector3) {
    const state = this.apiaries.get(key) ?? (type === BlockId.WildBeehive ? createWildApiary(`${this.world.seedText}:${key}`, this.day) : createEmptyApiaryBlock());
    if (isStockedApiary(state)) {
      const broken = breakApiary(state);
      if (this.mode === "survival") {
        for (const slot of broken.drops) this.spawnDrop(slot.item, slot.count, position, slot.durability, slot.metadata);
        if (type === BlockId.WildBeehive) {
          const combs = Math.max(1, Math.min(4, Math.ceil((broken.released.workers.length + 1) / 3)));
          this.spawnDrop(Item.Honeycomb, combs, position);
          if (broken.released.workers.length >= 4) this.spawnDrop(Item.Beeswax, 1, position);
        }
      }
      this.releaseApiaryResidents(key, broken.released, position);
    }
    this.apiaries.delete(key);
    this.apiaryFlowerCache.delete(key);
    this.persistentMachineLastStep.delete(key);
  }

  breakTarget() {
    if (!this.target || this.target.type === BlockId.Bedrock || this.target.type === BlockId.Water || this.target.type === BlockId.Lava) return;
    const { x, y, z, type } = this.target;
    const exhibitTopology = type === BlockId.ButterflyExhibit ? this.exhibitTopologyAt(x, y, z) : null;
    const exhibitSlots = exhibitTopology
      ? (this.chests.get(this.consolidateExhibit(exhibitTopology)) ?? []).map(cloneSlot)
      : null;
    if (this.tryFellTree(x, y, z)) {
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
        if (!this.isDoor(type) && !this.isBed(type) && type !== BlockId.WildBeehive) this.dropBlockLoot(isTorchBlock(type) ? BlockId.Torch : type, x, y, z);
      } else this.events.onToast(`${BLOCKS[type].name} crumbled without the right tool.`);
      this.damageSelectedTool();
    }
    const key = blockKey(x, y, z);
    if (isEnvironmentLightBlock(type)) this.lightRefreshTimer = 0;
    this.saplings.delete(key);
    if (this.isDoor(type) && this.mode === "survival") this.spawnDrop(Item.WildwoodDoor, 1, new THREE.Vector3(x, y, z));
    if (this.isBed(type) && this.mode === "survival" && harvested) this.spawnDrop(Item.WildwoodBed, 1, new THREE.Vector3(x, y, z));
    if (type === BlockId.Furnace) {
      const furnace = this.furnaces.get(key);
      if (furnace) for (const slot of [furnace.input, furnace.fuel, furnace.output]) if (slot) this.spawnDrop(slot.item, slot.count, new THREE.Vector3(x, y, z), slot.durability, slot.metadata);
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
        for (const slot of removed) if (slot) this.spawnDrop(slot.item, slot.count, new THREE.Vector3(x, y, z), slot.durability, slot.metadata);
        this.chests.delete(storageKey);
        const other = blocks[half === 0 ? 1 : 0];
        this.chests.set(other, remaining);
      } else {
        for (const slot of chest) if (slot) this.spawnDrop(slot.item, slot.count, new THREE.Vector3(x, y, z), slot.durability, slot.metadata);
        this.chests.delete(storageKey);
      }
    }
    if (type === BlockId.Apiary || type === BlockId.WildBeehive) this.breakApiaryAt(key, type, new THREE.Vector3(x, y, z));
    if (type === BlockId.CaptureOrbRack) {
      const rack = this.orbRacks.get(key);
      if (this.mode === "survival" && rack) for (const orb of rack.slots) if (orb) {
        const slot = captureOrbInventorySlot(orb);
        this.spawnDrop(slot.item, 1, new THREE.Vector3(x, y, z), slot.durability, slot.metadata);
      }
      this.orbRacks.delete(key);
    }
    if (type === BlockId.CreatureHealer) {
      const station = this.healingStations.get(key);
      if (this.mode === "survival" && station) {
        for (const orb of station.slots) if (orb) {
          const slot = captureOrbInventorySlot(orb);
          this.spawnDrop(slot.item, 1, new THREE.Vector3(x, y, z), slot.durability, slot.metadata);
        }
        if (station.gelUnits > 0) this.spawnDrop(Item.CaveGel, station.gelUnits, new THREE.Vector3(x, y, z));
      }
      this.healingStations.delete(key);
      this.persistentMachineLastStep.delete(key);
    }
    if (type === BlockId.AlchemyStand) {
      const station = this.alchemyStands.get(key);
      const outputItem = station?.output ? resourceItemCode(station.output.item) : null;
      if (this.mode === "survival" && outputItem !== null && station?.output) this.spawnDrop(outputItem, station.output.count, new THREE.Vector3(x, y, z));
      this.alchemyStands.delete(key);
      this.persistentMachineLastStep.delete(key);
    }
    if (type === BlockId.Distillery) {
      const station = this.distilleries.get(key);
      const outputItem = station?.output ? resourceItemCode(station.output.item) : null;
      if (this.mode === "survival" && outputItem !== null && station?.output) this.spawnDrop(outputItem, station.output.count, new THREE.Vector3(x, y, z));
      this.distilleries.delete(key);
      this.persistentMachineLastStep.delete(key);
    }
    if (type === BlockId.Wayshrine) {
      const markerId = `wayshrine:${key}`;
      if (this.mapKnowledge.markers.some((marker) => marker.id === markerId)) this.mapKnowledge = {
        ...this.mapKnowledge,
        revision: this.mapKnowledge.revision + 1,
        markers: this.mapKnowledge.markers.filter((marker) => marker.id !== markerId),
      };
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
    else if (type === BlockId.WheatCrop) drops = [...this.randomDrop(Item.Wheat, 1, 2), ...this.randomDrop(Item.WheatSeeds, 1, 2)];
    else if (type === BlockId.WheatSprout || type === BlockId.WheatYoung) drops = [[Item.WheatSeeds, 1]];
    else if (type === BlockId.MoonberryShoot || type === BlockId.MoonberryBush || type === BlockId.MoonberryBushRipe) drops = [[Item.Berry, 1]];
    else if (type === BlockId.SunberryShoot || type === BlockId.SunberryBush || type === BlockId.SunberryBushRipe) drops = [[Item.Sunberry, 1]];
    else if (type === BlockId.AppleSapling || type === BlockId.AppleFruit) drops = [[Item.Apple, 1]];
    else if (type === BlockId.AppleLeaves) drops = [...this.randomDrop(Item.Stick, 1, 2, 0.2), ...this.randomDrop(Item.Apple, 1, 1, 0.08)];
    else if (ITEMS[type]) drops = [[type, 1]];
    for (const [item, count] of drops) this.spawnDrop(item, count, new THREE.Vector3(x, y, z));
  }

  updateMining(dt: number) {
    if (this.targetMob && this.mineHeld && this.attackCooldown <= 0) this.attackTargetMob();
    if (!this.mineHeld || !this.target || this.targetMob || (!this.locked && !this.touchMode)) {
      this.miningProgress = Math.max(0, this.miningProgress - dt * 3);
      return;
    }
    if (this.target.type === BlockId.Bedrock) { this.miningProgress = 0; return; }
    if (isInstantBreakBlock(this.target.type)) { this.breakTarget(); return; }
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
    // Normal interaction rays pass through liquid so underwater blocks remain
    // usable. An empty bucket deliberately stops on the first liquid cell.
    const blockHit = this.castVoxel(interactionOrigin, direction, 6, this.selectedSlot()?.item === Item.Bucket);
    const mobHit = this.castMob(interactionOrigin, direction, 5);
    const boatHit = this.castBoat(interactionOrigin, direction, 6);
    const nearestEntityDistance = Math.min(mobHit?.distance ?? Infinity, boatHit?.distance ?? Infinity);
    const entityVisible = !blockHit || nearestEntityDistance < blockHit.distance;
    this.targetBoat = entityVisible && boatHit && boatHit.distance <= (mobHit?.distance ?? Infinity) ? boatHit.boat : null;
    this.targetMob = entityVisible && !this.targetBoat && mobHit ? mobHit.mob : null;
    if (this.targetMob && !this.bestiary[this.targetMob.kind].seen) { this.bestiary[this.targetMob.kind].seen = true; this.saveSoon(); }
    this.target = this.targetMob || this.targetBoat ? null : blockHit;
    if (this.target) {
      const discoveredPlants = discoverPlantBlock(this.plantBestiary, this.target.type);
      if (discoveredPlants !== this.plantBestiary) {
        this.plantBestiary = discoveredPlants;
        this.saveSoon();
      }
    }
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

  castVoxel(origin: THREE.Vector3, direction: THREE.Vector3, reach: number, includeLiquids = false): VoxelHit | null {
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
      if (type !== BlockId.Air && (includeLiquids || (type !== BlockId.Water && type !== BlockId.Lava))) {
        return { x, y, z, placeX: previousX, placeY: previousY, placeZ: previousZ, type, distance };
      }
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
      this.fallCuePlayed = false;
      this.velocity.set(0, 0, 0);
      this.grounded = true;
      return;
    }
    if (this.mountedCreatureId !== null) {
      this.updateMountedCreature(dt);
      this.fallVelocity = 0;
      this.fallCuePlayed = false;
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
    else if (!this.collidesAt(this.position, PLAYER_HEIGHT * playerVariantHeightScale(this.playerVariant))) this.crouching = false;
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
      this.fallCuePlayed = false;
      const bankX = Math.round(this.position.x - Math.sin(this.yaw) * 0.62);
      const bankZ = Math.round(this.position.z - Math.cos(this.yaw) * 0.62);
      const bankY = Math.floor(this.position.y + 0.6);
      const bankType = this.world.getBlock(bankX, bankY, bankZ);
      const bankHead = this.world.getBlock(bankX, bankY + 1, bankZ);
      const horizontalCollision = Boolean(BLOCKS[bankType ?? BlockId.Air]?.solid) && !BLOCKS[bankHead ?? BlockId.Bedrock]?.solid;
      const hasBreatherCharm = this.countItem(Item.BreatherCharm) > 0;
      const swim = stepSwimming(
        { velocityY: this.velocity.y, oxygenSeconds: this.oxygenSeconds, drowningAccumulator: this.drowningAccumulator },
        { jumpHeld: this.keys.has("Space"), movingForward: forwardAmount > 0, crouching: this.crouching },
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
      this.fallCuePlayed = false;
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
      if (!this.fallCuePlayed && this.fallVelocity < -8.5) {
        this.audio.play("fall");
        this.fallCuePlayed = true;
      }
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
      this.fallCuePlayed = false;
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
      const creatureBlocked = !dy && this.playerIntersectsSolidMob(candidate, this.currentPlayerHeight(), true);
      if (!this.collidesAt(candidate) && !edgeBlocked && !creatureBlocked) this.position.copy(candidate);
      else {
        if (dx) this.velocity.x = 0;
        if (dy) this.velocity.y = 0;
        if (dz) this.velocity.z = 0;
        break;
      }
    }
  }

  currentPlayerHeight() {
    return (this.crouching ? CROUCH_HEIGHT : PLAYER_HEIGHT) * playerVariantHeightScale(this.playerVariant);
  }

  /** Medium and large ground creatures have horizontal presence without becoming unstable moving platforms. */
  playerIntersectsSolidMob(position: THREE.Vector3, height = this.currentPlayerHeight(), allowEscape = false) {
    const playerTop = position.y + height;
    for (const mob of this.mobs) {
      if (!mob.group.visible || mob.id === this.mountedCreatureId) continue;
      const profile = this.mobCollisionProfile(mob);
      if (!profile.solid) continue;
      const mobBottom = this.mobFootY(mob);
      if (playerTop <= mobBottom || position.y >= mobBottom + profile.height) continue;
      const overlap = separateCreatureCircles(
        { x: position.x, z: position.z, radius: PLAYER_RADIUS },
        { x: mob.group.position.x, z: mob.group.position.z, radius: profile.radius },
        0.04,
        mob.id,
      );
      if (!overlap) continue;
      if (allowEscape) {
        const currentDistance = Math.hypot(this.position.x - mob.group.position.x, this.position.z - mob.group.position.z);
        const candidateDistance = Math.hypot(position.x - mob.group.position.x, position.z - mob.group.position.z);
        if (candidateDistance > currentDistance + 0.0001) continue;
      }
      return true;
    }
    return false;
  }

  collidesAt(position: THREE.Vector3, height = this.currentPlayerHeight()) {
    const minX = Math.floor(position.x - PLAYER_RADIUS + 0.5);
    const maxX = Math.floor(position.x + PLAYER_RADIUS - 0.001 + 0.5);
    // Scan a quarter block below the feet so 1.25-block fences remain solid
    // during the top of an otherwise valid one-block jump.
    const minY = Math.floor(position.y + 0.25);
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
      const definition = BLOCKS[type];
      if (definition?.solid) {
        const bottom = y - 0.5;
        const top = bottom + (definition.collisionHeight ?? 1);
        if (position.y + height > bottom && position.y < top) return true;
      }
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
    if (!["cross", "bush", "fruit"].includes(BLOCKS[above]?.shape ?? "") && above !== BlockId.Torch) return;
    this.world.setBlock(x, aboveY, z, BlockId.Air, true, true);
    this.publishBlockEdits([{ x, y: aboveY, z, type: BlockId.Air }], "break");
    this.saplings.delete(blockKey(x, aboveY, z));
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
    // Orchard fruit hangs from the leaf directly above it. Removing that leaf
    // must use the ordinary block-drop path instead of leaving a floating apple.
    const fruitY = y - 1;
    if (this.world.getBlock(x, fruitY, z) === BlockId.AppleFruit) {
      this.world.setBlock(x, fruitY, z, BlockId.Air, true, true);
      this.publishBlockEdits([{ x, y: fruitY, z, type: BlockId.Air }], "break");
      if (this.mode === "survival") this.dropBlockLoot(BlockId.AppleFruit, x, fruitY, z);
    }
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
      if (this.mode === "survival") this.spawnDrop(BlockId.Torch, 1, new THREE.Vector3(torch.x, torch.y, torch.z));
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
    this.damageRevision += 1;
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

  worldSimulationSeconds() {
    return Date.now() / 1000;
  }

  private ensureSideQuestOffers(mob: MobEntity) {
    if (!mob.residentId || !mob.settlementId || !mob.profession || (mob.factionId !== "hobbits" && mob.factionId !== "goblins")) return;
    const templates = sideQuestOffersFor(mob.factionId, mob.profession as ResidentProfession, mob.settlementId, this.day, 2);
    for (const template of templates) {
      const id = `${template.id}:${mob.residentId}`;
      if (this.sideQuestDefinitions.some((quest) => quest.id === id)) continue;
      const objectives: QuestDefinition["objectives"] = template.criteria.map((criterion, index) => {
        const objectiveId = `${id}:objective:${index}`;
        if (criterion.kind === "deliver") return { id: objectiveId, label: `Deliver ${criterion.count} ${criterion.target}`, kind: "deliver-item" as const, itemId: criterion.target, count: criterion.count };
        if (criterion.kind === "collect") return { id: objectiveId, label: `Gather ${criterion.count} ${criterion.target}`, kind: "collect-item" as const, itemId: criterion.target, count: criterion.count };
        if (criterion.kind === "defeat") return { id: objectiveId, label: `Defeat ${criterion.count} ${criterion.target}`, kind: "kill" as const, mobKind: criterion.target, count: criterion.count };
        return { id: objectiveId, label: `${criterion.kind === "protect" ? "Protect" : "Visit"} ${criterion.target}`, kind: "custom" as const, eventId: `${criterion.kind}:${criterion.target}`, count: criterion.count };
      });
      const failureConditions: NonNullable<QuestDefinition["failureConditions"]> = template.failureConditions.map((condition) => condition === "giver-dies"
        ? { kind: "entity-dies" as const, entityId: mob.residentId, reason: `${mob.name}, who entrusted you with this task, has died.` }
        : condition === "protected-target-dies"
          ? { kind: "custom" as const, eventId: "protected-target-dies", reason: "The person or creature under your protection died." }
          : { kind: "deadline" as const, afterDay: this.day + 3, reason: "The opportunity passed before the work was finished." });
      this.sideQuestDefinitions.push({
        id,
        questlineId: `side:${mob.factionId}:${mob.settlementId}`,
        kind: "side",
        name: template.title,
        summary: template.summary,
        objectives,
        giver: { role: mob.profession, factionId: mob.factionId, failOnDeath: true },
        failureConditions,
        rewards: {
          gold: template.rewards.gold,
          items: template.rewards.items.map((item) => ({ itemId: item.itemKey, count: item.count })),
          blueprints: [],
          factionAlignment: { [mob.factionId]: template.rewards.alignment },
        },
        abandonable: true,
        reacceptAfterAbandon: true,
      });
    }
    if (this.sideQuestDefinitions.length > 128) this.sideQuestDefinitions.splice(0, this.sideQuestDefinitions.length - 128);
  }

  allQuestDefinitions() {
    return [...HEARTHROADS_MAIN_QUESTS, ...this.sideQuestDefinitions] as readonly QuestDefinition[];
  }

  private dispatchQuestEvent(event: QuestEvent) {
    const next = applyQuestEvent(this.questBook, this.allQuestDefinitions(), event);
    if (next !== this.questBook) {
      this.questBook = next;
      this.saveSoon();
    }
  }

  acceptQuestById(questId: string, giverEntityId: string | null = this.activeSentient?.residentId ?? null) {
    const definition = this.allQuestDefinitions().find((quest) => quest.id === questId);
    if (definition?.kind === "side" && (!giverEntityId || !questId.endsWith(`:${giverEntityId}`))) {
      this.events.onToast("Return to the resident offering this side quest to accept it.");
      return false;
    }
    const result = acceptQuest(this.questBook, this.allQuestDefinitions(), questId, Date.now(), giverEntityId);
    if (!result.ok) {
      this.events.onToast(result.reason === "prerequisites" ? "That path has not opened yet." : "That quest is not currently available.");
      return false;
    }
    this.questBook = pinQuest(result.book, result.book.pinnedQuestId ?? questId);
    this.events.onToast(`Quest accepted: ${this.allQuestDefinitions().find((quest) => quest.id === questId)?.name ?? questId}.`);
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  pinQuestById(questId: string | null) {
    this.questBook = pinQuest(this.questBook, questId);
    this.saveSoon();
    this.emitHud(true);
  }

  abandonQuestById(questId: string) {
    const result = abandonQuest(this.questBook, this.allQuestDefinitions(), questId);
    if (!result.ok) {
      this.events.onToast("Main-story quests stay with you; only side quests can be abandoned.");
      return false;
    }
    this.questBook = result.book;
    this.events.onToast("Side quest abandoned. You can accept it again if the giver still offers it.");
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  private creditPlayerGold(amount: number, reason: string) {
    if (amount <= 0) return;
    const result = creditGold(this.goldWallet, amount, {
      authorityId: this.goldWallet.authorityId,
      expectedRevision: this.goldWallet.revision,
      eventId: `${reason}:${Date.now()}:${this.goldWallet.revision}`,
    });
    if (result.applied) this.goldWallet = result.state;
  }

  tradeWithActiveMerchant(direction: "buy" | "sell", itemKeyOrCode: string | ItemCode, count = 1) {
    const merchantId = this.activeMerchantId;
    const merchant = merchantId ? this.merchants.get(merchantId) : null;
    const quantity = Math.max(1, Math.min(64, Math.floor(count)));
    if (!merchantId || !merchant) return false;
    const command = {
      authorityId: this.goldWallet.authorityId,
      expectedWalletRevision: this.goldWallet.revision,
      expectedCounterpartyRevision: merchant.revision,
      eventId: `trade:${direction}:${merchantId}:${Date.now()}:${this.goldWallet.revision}`,
    };
    if (direction === "buy") {
      const itemKey = typeof itemKeyOrCode === "string" ? itemKeyOrCode : commerceKeyForItem(itemKeyOrCode);
      const item = itemKey ? commerceItemCode(itemKey) : null;
      if (!itemKey || item === null) {
        this.events.onToast("That stock cannot safely fit in a Wayfarer's pack yet.");
        return false;
      }
      if (this.inventoryCapacity(item) < quantity) {
        this.events.onToast("Make room in your pack before completing that purchase.");
        return false;
      }
      const result = buyFromMerchant(this.goldWallet, merchant, itemKey, quantity, command);
      if (!result.applied || !result.item) {
        this.events.onToast(result.reason === "insufficient-gold" ? "Your gold wallet cannot cover that price."
          : result.reason === "merchant-out-of-stock" ? "That merchant has sold through the requested stock."
            : "The trade could not be completed.");
        return false;
      }
      this.goldWallet = result.wallet;
      this.merchants.set(merchantId, result.merchant);
      if (itemKey === "unaligned-warg-orb") {
        for (let index = 0; index < quantity; index += 1) {
          const entityId = `trade-warg-${Date.now().toString(36)}-${index}`;
          const metadata: CreatureMetadata = {
            schema: 1,
            entityId,
            kind: "warg",
            health: MOB_DEFS.warg.health,
            maxHealth: MOB_DEFS.warg.health,
            ageTicks: 24_000,
            baby: false,
            temperament: MOB_DEFS.warg.temperament,
            hostile: false,
            tamed: false,
            ownerId: null,
            name: null,
            geneticSeed: (Date.now() + index * 2654435761) >>> 0,
            command: null,
            custom: JSON.parse(JSON.stringify({ courserBond: createReedstriderBond(), aligned: false })),
          };
          const orb = captureIntoOrb(createEmptyCaptureOrb(`warg-orb-${entityId}`), metadata);
          const filled = orb ? captureOrbInventorySlot(orb) : null;
          if (filled) this.addItem(filled.item, 1, filled.durability, undefined, filled.metadata);
        }
      } else this.addItem(item, quantity, ITEMS[item]?.maxDurability);
      this.dispatchQuestEvent({ type: "trade-completed", factionId: merchant.factionId, count: quantity, at: Date.now() });
      this.events.onToast(`Bought ${ITEMS[item].name} ×${quantity} for ${result.total} gold.`);
    } else {
      const item = typeof itemKeyOrCode === "number" ? itemKeyOrCode
        : commerceItemCode(itemKeyOrCode) ?? (/^item-\d+$/u.test(itemKeyOrCode) ? Number(itemKeyOrCode.slice(5)) as ItemCode : null);
      if (item === null || item === undefined || this.countItem(item) < quantity) {
        this.events.onToast("You do not have that many to sell.");
        return false;
      }
      const definition = ITEMS[item];
      if (!definition) return false;
      const catalogItem: CommerceItem = {
        key: commerceKeyForItem(item) ?? `item-${item}`,
        name: definition.name,
        category: definition.useKind === "blueprint" ? "blueprint"
          : definition.useKind === "potion" ? "potion"
            : definition.food ? "food"
              : definition.toolKind ? "weapon"
                : "misc",
        baseValue: Math.max(1, Math.round(2 + (definition.damage ?? 0) * 5 + (definition.tier ?? 0) * 4 + (definition.food ?? 0) * 2)),
        stackLimit: Math.max(1, definition.maxStack),
        tags: item === Item.Honeymead ? ["mead"] : undefined,
      };
      const result = sellToMerchant(this.goldWallet, merchant, catalogItem, quantity, command);
      if (!result.applied) {
        this.events.onToast(result.reason === "merchant-cannot-pay" ? "That merchant's purse is too light for this lot." : "The trade could not be completed.");
        return false;
      }
      this.removeItem(item, quantity);
      this.goldWallet = result.wallet;
      this.merchants.set(merchantId, result.merchant);
      this.dispatchQuestEvent({ type: "trade-completed", factionId: merchant.factionId, count: quantity, at: Date.now() });
      this.events.onToast(`Sold ${definition.name} ×${quantity} for ${result.total} gold.`);
    }
    this.audio.play("pickup");
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  depositGold(amount: number | string) {
    const wholeGold = typeof amount === "string" && /^\d+$/u.test(amount) ? amount : String(Math.max(0, Math.floor(Number(amount) || 0)));
    if (BigInt(wholeGold) <= BigInt(0)) return false;
    const result = depositAtBank(this.goldWallet, this.bankAccount, wholeGold, {
      authorityId: this.goldWallet.authorityId,
      expectedWalletRevision: this.goldWallet.revision,
      expectedCounterpartyRevision: this.bankAccount.revision,
      eventId: `bank-deposit:${Date.now()}:${this.goldWallet.revision}`,
    });
    if (!result.applied) { this.events.onToast("That deposit could not be completed."); return false; }
    this.goldWallet = result.wallet;
    this.bankAccount = result.account;
    this.audio.play("pickup");
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  withdrawGold(amount: number | string) {
    const wholeGold = typeof amount === "string" && /^\d+$/u.test(amount) ? amount : String(Math.max(0, Math.floor(Number(amount) || 0)));
    if (BigInt(wholeGold) <= BigInt(0)) return false;
    const result = withdrawFromBank(this.goldWallet, this.bankAccount, wholeGold, {
      authorityId: this.goldWallet.authorityId,
      expectedWalletRevision: this.goldWallet.revision,
      expectedCounterpartyRevision: this.bankAccount.revision,
      eventId: `bank-withdraw:${Date.now()}:${this.goldWallet.revision}`,
    });
    if (!result.applied) { this.events.onToast("That withdrawal is larger than the available whole-gold balance."); return false; }
    this.goldWallet = result.wallet;
    this.bankAccount = result.account;
    this.audio.play("pickup");
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  buyStockShares(symbol: StockSymbol, shares: number | string) {
    if (!STOCK_SYMBOLS.includes(symbol)) return false;
    const shareCount = typeof shares === "string" && /^\d+$/u.test(shares) ? shares : String(Math.max(0, Math.floor(Number(shares) || 0)));
    if (BigInt(shareCount) <= BigInt(0)) return false;
    const result = buyStock(this.goldWallet, this.stockMarket, symbol, shareCount, {
      authorityId: this.goldWallet.authorityId,
      expectedWalletRevision: this.goldWallet.revision,
      expectedCounterpartyRevision: this.stockMarket.revision,
      eventId: `stock-buy:${symbol}:${Date.now()}:${this.goldWallet.revision}`,
    });
    if (!result.applied) { this.events.onToast("That purchase exceeds your available gold."); return false; }
    this.goldWallet = result.wallet;
    this.stockMarket = result.market;
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  sellStockShares(symbol: StockSymbol, shares: number | string) {
    if (!STOCK_SYMBOLS.includes(symbol)) return false;
    const shareCount = typeof shares === "string" && /^\d+$/u.test(shares) ? shares : String(Math.max(0, Math.floor(Number(shares) || 0)));
    if (BigInt(shareCount) <= BigInt(0)) return false;
    const result = sellStock(this.goldWallet, this.stockMarket, symbol, shareCount, {
      authorityId: this.goldWallet.authorityId,
      expectedWalletRevision: this.goldWallet.revision,
      expectedCounterpartyRevision: this.stockMarket.revision,
      eventId: `stock-sell:${symbol}:${Date.now()}:${this.goldWallet.revision}`,
    });
    if (!result.applied) { this.events.onToast("You do not hold that many shares."); return false; }
    this.goldWallet = result.wallet;
    this.stockMarket = result.market;
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  setSettlementRoleWaypoint(profession: ResidentProfession) {
    const settlement = this.activeSettlementId ? this.settlements.get(this.activeSettlementId) : null;
    const waypoint = settlement ? findRoleWaypoint(settlement, profession) : null;
    if (!settlement || !waypoint) { this.events.onToast("No living resident with that role is currently recorded here."); return false; }
    const id = `manual:role:${settlement.id}:${profession}`;
    this.mapKnowledge = placeManualMapMarker(this.mapKnowledge, {
      id,
      name: `${profession[0].toUpperCase()}${profession.slice(1)} - ${settlement.cultureRace} ${settlement.size}`,
      position: { x: waypoint.position.x, y: this.world.findWalkableY(Math.round(waypoint.position.x), Math.round(waypoint.position.z), this.position.y) + 1, z: waypoint.position.z },
      playerId: this.localPlayerId(),
      discoveredAt: Date.now(),
      icon: "person",
    });
    this.events.onToast(`Waypoint set for the settlement ${profession}.`);
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  shareCartographyMaps() {
    if (!this.activeCartographyKey) return false;
    if (!this.multiplayer || !this.multiplayer.getPeers().some((peer) => peer.state === "connected")) {
      this.events.onToast("A second connected Wayfarer must use this table at the same time.");
      return false;
    }
    try { this.multiplayer.sendMapShare(this.cartographyPayload(this.activeCartographyKey, false)); }
    catch (error) {
      this.events.onToast(error instanceof Error ? error.message : "The map exchange could not be sent.");
      return false;
    }
    this.events.onToast("Cartography exchange offered. Your partner must be using the same table.");
    this.emitHud(true);
    return true;
  }

  commandActiveFollower(command: FollowDistanceSetting | string) {
    const mob = this.activeSentient ?? this.activePet;
    if (!mob || (!mob.hiredByPlayerId && !mob.petState?.tamed && !mob.shadeState?.tamed && !mob.reedstriderBond?.tamed && !mob.courserBond?.tamed)) return false;
    let distance: FollowDistanceSetting | null = null;
    if (command === "dynamic") distance = "dynamic";
    else if (typeof command === "number") distance = command;
    else if (command.startsWith("distance:")) distance = command.slice(9) === "dynamic" ? "dynamic" : Number(command.slice(9));
    if (distance !== null) mob.followDistance = normalizeFollowDistance(distance);
    if (mob.settlementId && mob.residentId && mob.hiredByPlayerId) {
      const settlement = this.settlements.get(mob.settlementId);
      const resident = settlement?.residents.find((entry) => entry.id === mob.residentId);
      if (settlement && resident) {
        const stance = typeof command === "string" && command.startsWith("stance:")
          ? command.slice(7) as "passive" | "defensive" | "offensive" : undefined;
        const orders = command === "follow" ? { follow: true, holdPosition: null }
          : command === "hold" ? { follow: false, holdPosition: { x: mob.group.position.x, z: mob.group.position.z } }
            : stance && ["passive", "defensive", "offensive"].includes(stance) ? { stance }
              : distance !== null ? { followDistance: mob.followDistance } : {};
        const result = updateHirelingOrders(settlement, resident.id, orders, {}, {
          authorityId: settlement.authorityId,
          expectedRevision: settlement.revision,
          eventId: `hireling-order:${resident.id}:${Date.now()}`,
        });
        if (result.applied) this.settlements.set(settlement.id, result.state);
      }
    } else if (mob.petState?.tamed && typeof command === "string" && (command === "follow" || command === "hold")) {
      mob.petState = commandPeelop(mob.petState, this.localPlayerId(), command === "follow" ? "follow" : "stay");
    }
    this.events.onToast(distance !== null ? `${mob.name}'s follow distance is now ${mob.followDistance}.` : `${mob.name}'s orders were updated.`);
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  selectSettlementResident(residentId: string) {
    const mob = this.mobs.find((candidate) => candidate.residentId === residentId && candidate.health > 0);
    if (!mob) return false;
    this.activeSentient = mob;
    this.activeSettlementId = mob.settlementId;
    this.activeMerchantId = mob.residentId && this.merchants.has(mob.residentId) ? mob.residentId : null;
    this.ensureSideQuestOffers(mob);
    this.openOverlay("sentient", residentId);
    return true;
  }

  hireResidentFromMayor(residentId: string) {
    const mayor = this.activeSentient;
    const settlement = mayor?.settlementId ? this.settlements.get(mayor.settlementId) : null;
    if (!mayor || mayor.profession !== "mayor" || !settlement || !mayor.factionId || mayor.factionId === "player") {
      this.events.onToast("Hiring agreements must be made with that settlement's mayor.");
      return false;
    }
    const resident = settlement.residents.find((entry) => entry.id === residentId);
    const expectedCost = resident?.profession === "warrior" ? 180 : 110;
    if (!resident || BigInt(this.goldWallet.balance) < BigInt(expectedCost)) {
      this.events.onToast(`Hiring requires ${expectedCost} gold in your wallet.`);
      return false;
    }
    const hired = hireResident(settlement, residentId, this.localPlayerId(), this.factionRelations.alignments[mayor.factionId] ?? 0, true, {
      authorityId: settlement.authorityId,
      expectedRevision: settlement.revision,
      eventId: `hire:${residentId}:${Date.now()}`,
    });
    if (!hired.applied) {
      this.events.onToast(hired.reason === "alignment-too-low" ? "This mayor only entrusts workers at 65 or higher faction alignment."
        : "That resident is not currently available for hire.");
      return false;
    }
    const payment = debitGold(this.goldWallet, hired.cost, {
      authorityId: this.goldWallet.authorityId,
      expectedRevision: this.goldWallet.revision,
      eventId: `hire-payment:${residentId}:${Date.now()}`,
    });
    if (!payment.applied) return false;
    this.goldWallet = payment.state;
    this.settlements.set(settlement.id, hired.state);
    const mob = this.mobs.find((candidate) => candidate.residentId === residentId);
    if (mob) {
      mob.factionId = "player";
      mob.hiredByPlayerId = this.localPlayerId();
      mob.followDistance = "dynamic";
      mob.hostile = false;
    }
    this.events.onToast(`${resident.name} joins your Wayfarer faction. Commands and equipment are available from their follower panel.`);
    this.audio.play("craft");
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  renameActiveHireling(name: string) {
    const mob = this.activeSentient;
    if (!mob?.hiredByPlayerId || mob.hiredByPlayerId !== this.localPlayerId()) return false;
    const clean = name.trim().replace(/\s+/gu, " ").slice(0, 28);
    if (!clean) return false;
    mob.name = clean;
    if (mob.settlementId && mob.residentId) {
      const settlement = this.settlements.get(mob.settlementId);
      if (settlement) this.settlements.set(settlement.id, {
        ...settlement,
        residents: settlement.residents.map((resident) => resident.id === mob.residentId ? { ...resident, name: clean } : resident),
      });
    }
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  claimActiveSettlement() {
    const mayorMob = this.activeSentient;
    const settlement = mayorMob?.settlementId ? this.settlements.get(mayorMob.settlementId) : null;
    if (!mayorMob || mayorMob.profession !== "mayor" || !settlement || settlement.ownerFactionId === "player") return false;
    const livingWarriors = settlement.residents.filter((resident) => resident.alive && resident.profession === "warrior").length;
    const decision = evaluateTownCapture(this.factionRelations, {
      townId: settlement.id,
      currentOwner: settlement.ownerFactionId,
      claimant: "player",
      livingWarriors,
      livingMayor: mayorMob.health > 0,
      mayorThreatened: true,
      claimantPresent: mayorMob.group.position.distanceToSquared(this.position) <= 25,
    });
    if (!decision.allowed || !decision.receipt) {
      this.events.onToast(decision.reason === "warriors-remain" ? `${livingWarriors} settlement warrior${livingWarriors === 1 ? " remains" : "s remain"}; the mayor will not yield.`
        : "This settlement cannot be claimed under the current conditions.");
      return false;
    }
    const factionResult = applyTownCaptureConsequences(this.factionRelations, decision.receipt, {
      authorityId: this.factionRelations.authorityId,
      expectedRevision: this.factionRelations.revision,
      eventId: decision.receipt.id,
    });
    const settlementResult = applySettlementCapture(settlement, decision.receipt, this.day, {
      authorityId: settlement.authorityId,
      expectedRevision: settlement.revision,
      eventId: decision.receipt.id,
    });
    if (!factionResult.applied || !settlementResult.applied) return false;
    this.factionRelations = factionResult.state;
    this.settlements.set(settlement.id, settlementResult.state);
    for (const mob of this.mobs) {
      if (mob.settlementId !== settlement.id || mob.profession === "warrior" || mob.health <= 0) continue;
      mob.factionId = "player";
      mob.aligned = false;
      mob.hostile = false;
    }
    this.events.onToast("The mayor yields the settlement to your Wayfarer faction. Full town management and raiding commands are planned for a later update.");
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  turnInQuestById(questId: string, giverEntityId: string | null = this.activeSentient?.residentId ?? null) {
    const before = inventoryResourceCounts(this.inventory);
    const result = turnInQuest(this.questBook, this.allQuestDefinitions(), questId, before, Date.now(), giverEntityId);
    if (!result.ok) {
      const message = result.reason === "delivery-items-missing" ? "You do not have all of the requested items."
        : result.reason === "wrong-giver" ? "This quest must be reported to the person who gave it."
          : "One or more objectives are still unfinished.";
      this.events.onToast(message);
      return false;
    }
    this.consumeResourceDelta(consumedResourceDelta(before, result.inventory));
    this.questBook = result.book;
    this.creditPlayerGold(result.reward.gold, `quest:${questId}`);
    for (const [factionId, reward] of Object.entries(result.reward.factionAlignment)) {
      if ((factionId !== "hobbits" && factionId !== "goblins") || reward <= 0) continue;
      const alignment = applyQuestAlignmentReward(this.factionRelations, factionId, reward, {
        authorityId: this.factionRelations.authorityId,
        expectedRevision: this.factionRelations.revision,
        eventId: `quest-alignment:${questId}:${factionId}:${Date.now()}`,
      });
      if (alignment.applied) this.factionRelations = alignment.state;
    }
    for (const blueprintId of result.reward.blueprints) this.blueprints = consumeBlueprintItem(this.blueprints, blueprintId, Date.now()).state;
    const giver = result.rewardDelivery === "giver-drop" ? this.mobs.find((mob) => mob.residentId === giverEntityId) ?? null : null;
    for (const reward of result.reward.items) {
      const item = resourceItemCode(reward.itemId) ?? commerceItemCode(reward.itemId);
      if (item === null) continue;
      if (giver) this.spawnDrop(item, reward.count, giver.group.position.clone().add(new THREE.Vector3(0, 0.5, 0)));
      else this.addItem(item, reward.count);
    }
    this.audio.play("craft");
    this.events.onToast(`Quest complete · ${result.reward.gold} gold added to your wallet.`);
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  addManualMapMarker(name = "Trail Marker") {
    const id = `manual:${this.localPlayerId()}:${Date.now().toString(36)}`;
    this.mapKnowledge = placeManualMapMarker(this.mapKnowledge, {
      id,
      name,
      position: { x: this.position.x, y: this.position.y, z: this.position.z },
      playerId: this.localPlayerId(),
      discoveredAt: Date.now(),
      icon: "pin",
    });
    this.events.onToast(`${name} added at your current position.`);
    this.saveSoon();
    this.emitHud(true);
    return id;
  }

  removeMapMarker(markerId: string) {
    const next = removeManualMapMarker(this.mapKnowledge, markerId);
    if (next === this.mapKnowledge) return false;
    this.mapKnowledge = next;
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  renameWayshrineMarker(markerId: string, name: string) {
    const next = renameWayshrine(this.mapKnowledge, markerId, name, Date.now());
    if (next === this.mapKnowledge) return false;
    this.mapKnowledge = next;
    this.events.onToast(`Wayshrine renamed ${name.trim() || "Wayshrine"}.`);
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  requestFastTravel(markerId: string) {
    if (this.fastTravelChannel?.status === "channeling") return false;
    const destination = this.mapKnowledge.markers.find((marker) => marker.id === markerId);
    if (!destination || destination.kind === "manual") {
      this.events.onToast("Manual pins are waypoints only; travel needs a known POI, bed, or wayshrine.");
      return false;
    }
    const originShrine = this.mapKnowledge.markers.find((marker) => marker.kind === "wayshrine"
      && Math.hypot(marker.position.x - this.position.x, marker.position.y - this.position.y, marker.position.z - this.position.z) <= 3.5);
    const mode = originShrine && destination.kind === "wayshrine" ? "wayshrine-network" as const : "map-charge" as const;
    const begun = beginFastTravel(this.mapKnowledge, {
      id: `travel:${Date.now().toString(36)}`,
      mode,
      destinationId: markerId,
      originWayshrineId: originShrine?.id ?? null,
    }, this.position, this.worldSimulationSeconds(), this.damageRevision);
    if (!begun.ok) {
      this.events.onToast(begun.reason === "no-banked-travel"
        ? "Brew and drink a Wayskip Draught to bank a map journey. Wayshrine-to-wayshrine travel is free."
        : "That destination is not available from here.");
      return false;
    }
    this.fastTravelChannel = begun.channel;
    this.keys.clear();
    this.events.onToast(`Hold still for five seconds · channeling toward ${destination.name}.`);
    this.emitHud(true);
    return true;
  }

  private updateFastTravelChannel() {
    const channel = this.fastTravelChannel;
    if (!channel || channel.status !== "channeling") return;
    const next = advanceFastTravelChannel(channel, this.position, this.worldSimulationSeconds(), this.damageRevision);
    if (next === channel) return;
    if (next.status === "cancelled") {
      this.fastTravelChannel = null;
      this.events.onToast(next.cancelledReason === "damaged" ? "Travel interrupted by damage." : "Travel interrupted because you moved.");
      this.emitHud(true);
      return;
    }
    if (next.status !== "completed") {
      this.fastTravelChannel = next;
      return;
    }
    const committed = commitFastTravel(this.mapKnowledge, next);
    this.fastTravelChannel = null;
    if (!committed.ok) {
      this.events.onToast("The route faded before the journey completed.");
      return;
    }
    this.mapKnowledge = committed.state;
    const x = Math.round(committed.position.x);
    const z = Math.round(committed.position.z);
    const ground = this.world.findWalkableY(x, z, committed.position.y);
    this.position.set(x, ground + 0.51, z);
    this.velocity.set(0, 0, 0);
    this.world.scheduleAround(x, z, true);
    this.events.onToast(`Arrived · ${committed.chargeSpent ? "one banked journey spent" : "wayshrine network"}.`);
    this.spawnParticles(x, ground + 1, z, BlockId.CrystalBlock, 18);
    this.audio.play("craft");
    this.saveSoon();
    this.emitHud(true);
  }

  private syncSettlementPlans() {
    for (const { candidate, layout } of this.world.settlementPlans.values()) {
      let settlement = this.settlements.get(candidate.id);
      if (!settlement) {
        settlement = createSettlementState(this.factionRelations.authorityId, candidate, layout);
        this.settlements.set(candidate.id, settlement);
      }
      for (const resident of settlement.residents) {
        if (this.merchants.has(resident.id)) continue;
        const faction = resident.factionId === "goblins" ? "goblins" : "hobbits";
        this.merchants.set(resident.id, createMerchant(
          this.factionRelations.authorityId,
          resident.id,
          faction,
          merchantProfessionForResident(resident.profession),
          resident.profession === "banker" ? 500 : 240,
        ));
      }
    }
  }

  private updateHearthroadsSimulation(dt: number) {
    const nowSeconds = this.worldSimulationSeconds();
    for (const [buff, expiresAt] of Object.entries(this.potionBuffs)) if (expiresAt <= nowSeconds) delete this.potionBuffs[buff];
    this.settlementTimer -= dt;
    if (this.settlementTimer > 0) return;
    this.settlementTimer = 2;
    this.syncSettlementPlans();
    const authorityId = this.factionRelations.authorityId;
    if (this.bankAccount.lastInterestDay < this.day) {
      const result = compoundBankInterest(this.bankAccount, this.day, {
        authorityId,
        expectedRevision: this.bankAccount.revision,
        eventId: `bank-interest:${this.day}`,
      });
      if (result.applied) this.bankAccount = result.state;
    }
    if (this.stockMarket.day < this.day) {
      const result = stepStockMarket(this.stockMarket, this.day, {
        authorityId,
        expectedRevision: this.stockMarket.revision,
        eventId: `market-day:${this.day}`,
      });
      if (result.applied) this.stockMarket = result.state;
    }
    for (const [residentId, merchant] of this.merchants) {
      if (this.day - merchant.lastRestockDay < 2) continue;
      const result = restockMerchant(merchant, this.day, {
        authorityId,
        expectedRevision: merchant.revision,
        eventId: `merchant-restock:${residentId}:${this.day}`,
      });
      if (result.applied) this.merchants.set(residentId, result.state);
    }
    const hour = this.worldTime * 24;
    for (const [settlementId, currentSettlement] of [...this.settlements]) {
      let settlement = currentSettlement;
      const election = electMayorAtEight(settlement, this.day, hour, {
        authorityId,
        expectedRevision: settlement.revision,
        eventId: `mayor-election:${settlementId}:${this.day}`,
      });
      if (election.applied) settlement = election.state;
      const population = growSettlementPopulation(settlement, this.day, {
        authorityId,
        expectedRevision: settlement.revision,
        eventId: `population:${settlementId}:${this.day}`,
      });
      if (population.applied) {
        const priorIds = new Set(settlement.residents.map((resident) => resident.id));
        settlement = population.state;
        for (const resident of settlement.residents) {
          if (priorIds.has(resident.id)) continue;
          const kind: MobKind = settlement.ownerFactionId === "goblins" ? "goblin-worker" : "hobbit-merchant";
          const ground = this.world.findWalkableY(Math.round(resident.position.x), Math.round(resident.position.z), this.position.y);
          const child = this.spawnMob(kind, new THREE.Vector3(resident.position.x, ground + MOB_DEFS[kind].footOffset, resident.position.z), {
            name: resident.name,
            factionId: settlement.ownerFactionId === "player" ? "player" : settlement.ownerFactionId,
            profession: resident.profession,
            settlementId,
            residentId: resident.id,
            persistentPoiResident: true,
            aligned: true,
          });
          this.applyMobScale(child, 0.72);
        }
      }
      if (settlement !== currentSettlement) this.settlements.set(settlementId, settlement);
      if (election.applied) {
        const mayor = settlement.residents.find((resident) => resident.alive && resident.profession === "mayor");
        const mayorMob = mayor ? this.mobs.find((mob) => mob.residentId === mayor.id) : null;
        if (mayorMob) mayorMob.profession = "mayor";
      }
    }
  }

  private mapLocationName(tag: string) {
    if (tag.startsWith("settlement:hobbits")) return "Hearthkin Freehold";
    if (tag.startsWith("settlement:goblins")) return "Brassroot Clanhold";
    return tag.split(":")[0].split("-").map((part) => part ? part[0].toUpperCase() + part.slice(1) : part).join(" ");
  }

  private updateMapDiscovery(dt: number) {
    this.mapDiscoveryTimer -= dt;
    if (this.mapDiscoveryTimer > 0) return;
    this.mapDiscoveryTimer = 0.72;
    let changed = false;
    const renderedChunks = [...this.world.chunks.values()].filter((chunk) => chunk.group.visible).map((chunk) => ({ x: chunk.cx, z: chunk.cz }));
    const explored = markChunksRendered(this.mapKnowledge, renderedChunks);
    if (explored !== this.mapKnowledge) { this.mapKnowledge = explored; changed = true; }
    this.syncSettlementPlans();
    for (const [key, marker] of this.world.structureMarkers) {
      if (marker.type !== "landmark") continue;
      const markerChunk = this.world.chunks.get(`${Math.floor(marker.position.x / CHUNK_SIZE)},${Math.floor(marker.position.z / CHUNK_SIZE)}`);
      if (!markerChunk?.group.visible || this.mapKnowledge.markers.some((entry) => entry.id === key)) continue;
      this.mapKnowledge = discoverNaturalPoi(this.mapKnowledge, {
        id: key,
        name: this.mapLocationName(marker.tag),
        position: marker.position,
        playerId: this.localPlayerId(),
        discoveredAt: Date.now(),
        icon: marker.tag.startsWith("settlement:") ? "town" : "poi",
      });
      if (marker.tag.startsWith("settlement:")) {
        const factionId = marker.tag.split(":")[1] ?? "neutral";
        this.dispatchQuestEvent({ type: "town-discovered", townId: marker.id, factionId, at: Date.now() });
        this.events.onToast(`Map updated · ${this.mapLocationName(marker.tag)} discovered.`);
      }
      changed = true;
    }
    if (this.day !== this.lastQuestDay) {
      this.lastQuestDay = this.day;
      this.dispatchQuestEvent({ type: "day-reached", day: this.day, at: Date.now() });
      changed = true;
    }
    if (changed) {
      this.saveSoon();
      this.emitHud(true);
    }
  }

  restoreSailboat(value: Partial<SailboatSave>) {
    const save = normalizeSailboatSave(value, `wayfarer-${this.nextBoatId++}`);
    save.inventory = save.inventory.map(normalizeCaptureOrbInventorySlot);
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

  dismountCreature() {
    if (this.mountedCreatureId === null) return;
    const mob = this.mobs.find((candidate) => candidate.id === this.mountedCreatureId);
    if (mob) {
      const sideX = Math.cos(mob.angle + Math.PI / 2) * 1.7;
      const sideZ = Math.sin(mob.angle + Math.PI / 2) * 1.7;
      const x = Math.round(mob.group.position.x + sideX);
      const z = Math.round(mob.group.position.z + sideZ);
      const ground = this.world.findWalkableY(x, z, mob.group.position.y);
      this.position.set(x, ground + 0.51, z);
    }
    this.mountedCreatureId = null;
    this.velocity.set(0, 0, 0);
    this.events.onToast(mob?.kind === "reedstrider" ? "You step down from the Reedstrider."
      : mob?.kind === "wild-horse" ? "You swing down from the Wildwood Courser."
        : mob?.kind === "warg" ? "You swing down from the Road Warg." : "You slide down from the Shadecrawler.");
    this.saveSoon();
  }

  updateMountedCreature(dt: number) {
    const mob = this.mobs.find((candidate) => candidate.id === this.mountedCreatureId);
    const ownerId = this.localPlayerId();
    const ridingShadecrawler = Boolean(mob?.shadeState && canRideShadecrawler(mob.shadeState, ownerId));
    const ridingReedstrider = Boolean(mob?.reedstriderBond && canRideReedstrider(mob.reedstriderBond, ownerId));
    const ridingCourser = Boolean(mob?.courserBond && canRideReedstrider(mob.courserBond, ownerId));
    if (!mob || (!ridingShadecrawler && !ridingReedstrider && !ridingCourser)) {
      this.mountedCreatureId = null;
      return;
    }
    const forward = (this.keys.has("KeyW") ? 1 : 0) - (this.keys.has("KeyS") ? 1 : 0);
    const right = (this.keys.has("KeyD") ? 1 : 0) - (this.keys.has("KeyA") ? 1 : 0);
    const length = Math.hypot(forward, right) || 1;
    const desiredX = -Math.sin(this.yaw) * (forward / length) + Math.cos(this.yaw) * (right / length);
    const desiredZ = -Math.cos(this.yaw) * (forward / length) - Math.sin(this.yaw) * (right / length);
    const moving = forward !== 0 || right !== 0;
    if (moving) mob.desiredAngle = Math.atan2(desiredZ, desiredX);
    const mountedInWater = this.world.getBlock(Math.floor(mob.group.position.x + 0.5), Math.floor(mob.group.position.y + 0.5), Math.floor(mob.group.position.z + 0.5)) === BlockId.Water;
    const mountedSprint = this.keys.has("ControlLeft") || this.keys.has("ControlRight") || this.sprintLatched;
    const speed = moving ? (ridingReedstrider ? reedstriderRideSpeed(mountedInWater, mountedSprint)
      : ridingCourser ? (mountedInWater ? 3.2 : mountedSprint ? 8.6 : 7.15) : 5.75) : 0;
    const before = mob.group.position.clone();
    const nx = mob.group.position.x + Math.cos(mob.angle) * speed * dt;
    const nz = mob.group.position.z + Math.sin(mob.angle) * speed * dt;
    const targetY = ridingReedstrider && mountedInWater
      ? mob.group.position.y
      : moving ? this.mobMoveTarget(mob, nx, nz, ridingShadecrawler ? 1.7 : 1) : mob.group.position.y;
    const blocked = targetY === null;
    if (!blocked && targetY !== null) {
      mob.group.position.x = nx;
      mob.group.position.z = nz;
      mob.group.position.y += (targetY - mob.group.position.y) * Math.min(1, dt * 10);
      mob.baseY = mob.group.position.y;
    }
    mob.steering = updateStableSteering(mob.steering, {
      dt,
      turnRate: mob.definition.turnRate * 0.78,
      blocked,
      mobId: mob.id,
      desiredHeading: mob.desiredAngle,
    });
    mob.angle = mob.steering.heading;
    mob.group.rotation.y = -mob.angle - Math.PI / 2;
    this.animateMob(mob, before.distanceTo(mob.group.position));
    this.mobBounds.setFromObject(mob.visual);
    this.position.set(mob.group.position.x, this.mobBounds.max.y + 0.1, mob.group.position.z);
    this.lastPosition.copy(this.position);
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

  exhibitSpecimen(slot: InventorySlot, key: string, index: number): ExhibitResident | null {
    const kind = ITEMS[slot.item]?.creatureKind as ButterflyKind | undefined;
    let seed = 2166136261;
    const caged = this.exhibitCagedCreature(slot);
    const residentKind = caged?.creature.kind ?? kind;
    if (!residentKind || (!caged && !BUTTERFLY_ORDER.includes(residentKind as ButterflyKind))) return null;
    const text = `${key}:${index}:${residentKind}`;
    for (const character of text) seed = Math.imul(seed ^ character.charCodeAt(0), 16777619);
    if (caged) {
      if (!isSmallExhibitCreature(caged.creature.kind)) return null;
      return {
      schema: 1,
      id: caged.creature.entityId,
      kind: caged.creature.kind,
      capturedAt: caged.capturedAt,
      ageTicks: caged.creature.ageTicks,
      name: caged.creature.name,
      geneticSeed: caged.creature.geneticSeed >>> 0,
      custom: JSON.parse(JSON.stringify(caged.creature.custom)) as ExhibitCreature["custom"],
      source: "cage",
      metadata: releaseCreature(caged),
      };
    }
    return {
      schema: 1,
      id: `${key}:${index}`,
      kind: residentKind as ButterflyKind,
      capturedAt: Number(slot.metadata?.capturedAt) || 0,
      ageTicks: Number(slot.metadata?.ageTicks) || 0,
      name: typeof slot.metadata?.name === "string" ? slot.metadata.name : null,
      geneticSeed: seed >>> 0,
      custom: {},
      source: "butterfly",
    };
  }

  createExhibitVisual(key: string, topology: ExhibitTopology, specimens: ExhibitResident[]) {
    const group = new THREE.Group();
    group.name = key;
    group.userData.topology = topology;
    group.userData.specimens = specimens;
    const railColor = 0x6f5432;
    for (const [index, edge] of exteriorExhibitFrameEdges(topology).entries()) {
      const size: [number, number, number] = edge.axis === "x" ? [edge.length + 0.035, 0.055, 0.055]
        : edge.axis === "y" ? [0.055, edge.length + 0.035, 0.055]
          : [0.055, 0.055, edge.length + 0.035];
      const rail = new THREE.Mesh(new THREE.BoxGeometry(...size), new THREE.MeshLambertMaterial({ color: railColor }));
      rail.name = `conservatory-perimeter-${index}`;
      rail.position.set(...edge.center);
      group.add(rail);
    }
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
      visual.userData.residentSource = specimen.source ?? "butterfly";
      if ((specimen.source ?? "butterfly") === "butterfly") {
        const butterfly = createButterflyVisual(specimen.kind as ButterflyKind, specimen.id);
        visual.userData.wings = [butterfly.leftWing, butterfly.rightWing];
        visual.add(butterfly.group);
      } else {
        const mob = createMobVisual(specimen.kind, -(index + 1));
        mob.group.traverse((object) => { delete object.userData.mobId; });
        mob.group.updateMatrixWorld(true);
        const bounds = new THREE.Box3().setFromObject(mob.group);
        const size = bounds.getSize(new THREE.Vector3());
        const scale = Math.min(1, 0.62 / Math.max(0.001, size.x), 0.62 / Math.max(0.001, size.y), 0.62 / Math.max(0.001, size.z));
        const center = bounds.getCenter(new THREE.Vector3());
        mob.group.scale.setScalar(scale);
        mob.group.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
        visual.userData.poseYOffset = MOB_DEFS[specimen.kind].flying ? 0 : size.y * scale / 2;
        visual.userData.wings = mob.parts.wings;
        visual.add(mob.group);
      }
      group.add(visual);
    });
    return group;
  }

  syncExhibitVisuals(force = false, dt = 0) {
    this.exhibitVisualTimer -= dt;
    const rescan = force || this.exhibitVisualTimer <= 0;
    if (rescan) {
      this.exhibitVisualTimer = 0.65;
      const live = new Set<string>();
      const breedingCycle = Math.floor(performance.now() / 1000 / EXHIBIT_BREEDING_CYCLE_SECONDS);
      for (const [key, slots] of this.chests) {
        if (!key.startsWith("exhibit:")) continue;
        const [x, y, z] = key.slice("exhibit:".length).split(",").map(Number);
        const topology = this.exhibitTopologyAt(x, y, z);
        if (!topology) continue;
        live.add(key);
        let specimens = slots.flatMap((slot, index) => slot ? [this.exhibitSpecimen(slot, key, index)].filter((value): value is ExhibitResident => Boolean(value)) : []);
        let visual = this.exhibitVisuals.get(key);
        if (visual && breedingCycle > visual.lastBreedingCycle) {
          visual.lastBreedingCycle = breedingCycle;
          const breeding = planExhibitBreeding(specimens, topology.capacity, breedingCycle);
          const emptySlot = slots.findIndex((slot) => !slot);
          if (breeding && emptySlot >= 0) {
            const captured = captureCreature(`conservatory-${breeding.child.entityId}`, breeding.child);
            if (captured) {
              slots[emptySlot] = {
                item: Item.CreatureCage,
                count: 1,
                metadata: {
                  capturedCreature: encodeCapturedCreature(captured),
                  kind: breeding.kind,
                  baby: true,
                  bornInConservatory: true,
                },
              };
              this.bestiary[breeding.kind].breeds = (this.bestiary[breeding.kind].breeds ?? 0) + 1;
              specimens = slots.flatMap((slot, index) => slot ? [this.exhibitSpecimen(slot, key, index)].filter((value): value is ExhibitResident => Boolean(value)) : []);
              this.events.onToast(`A young ${MOB_DEFS[breeding.kind].name} was born in the conservatory.`);
              this.saveSoon();
            }
          }
        }
        const topologySignature = topology.blocks.map((block) => block.key).sort().join("|");
        const specimenSignature = specimens.map((specimen) => `${specimen.source ?? "butterfly"}:${specimen.kind}:${specimen.id}:${specimen.ageTicks}`).join("|");
        if (!visual || visual.topologySignature !== topologySignature || visual.specimenSignature !== specimenSignature) {
          const lastBreedingCycle = visual?.lastBreedingCycle ?? breedingCycle;
          if (visual) { this.exhibitGroup.remove(visual.group); this.disposeObject(visual.group); }
          const group = this.createExhibitVisual(key, topology, specimens);
          this.exhibitGroup.add(group);
          visual = { group, topologySignature, specimenSignature, lastBreedingCycle };
          this.exhibitVisuals.set(key, visual);
        } else {
          visual.group.userData.topology = topology;
          visual.group.userData.specimens = specimens;
        }
      }
      for (const [key, visual] of this.exhibitVisuals) {
        if (live.has(key)) continue;
        this.exhibitGroup.remove(visual.group);
        this.disposeObject(visual.group);
        this.exhibitVisuals.delete(key);
      }
    }

    // Motion is the only per-frame work: O(residents), with no block scans.
    const elapsed = performance.now() / 1000;
    for (const visual of this.exhibitVisuals.values()) {
      const topology = visual.group.userData.topology as ExhibitTopology;
      const specimens = visual.group.userData.specimens as ExhibitResident[];
      for (const child of visual.group.children) {
        const index = child.userData.specimenIndex as number | undefined;
        if (index === undefined) continue;
        const specimen = specimens[index];
        if (!specimen) continue;
        const pose = sampleExhibitResidentPose(specimen, topology, elapsed);
        child.position.set(pose.x, pose.y + Number(child.userData.poseYOffset ?? 0), pose.z);
        child.rotation.y = pose.yaw;
        const flap = pose.landed ? 0.12 : 0.55 + Math.sin(elapsed * 14 + index) * 0.42;
        for (const wing of child.userData.wings ?? []) wing.rotation.z = Number(wing.userData.wingSide ?? 1) * flap;
      }
    }
  }

  createMobVisual(kind: MobKind, id: number) {
    return createMobVisual(kind, id);
  }

  mobBaseScale(mob: MobEntity) {
    if (mob.shadeState) return shadecrawlerScale(mob.shadeState);
    if (mob.petState?.baby || mob.careState?.baby) return 0.62;
    return 1;
  }

  mobCollisionProfile(mob: MobEntity) {
    return creatureCollisionProfile(
      mob.definition,
      this.mobBaseScale(mob),
      Boolean(mob.petState?.baby || mob.careState?.baby),
    );
  }

  /** Mob group origins vary by model; this converts one back to its common foot plane. */
  mobFootY(mob: MobEntity, groupY = mob.group.position.y) {
    return groupY - mob.definition.footOffset + 0.5;
  }

  mobDynamicObstaclesAt(mob: MobEntity, x: number, groupY: number, z: number, allowEscape = false) {
    const profile = this.mobCollisionProfile(mob);
    const navigationRadius = profile.solid
      ? profile.radius
      : Math.max(0.14, mob.definition.radius * this.mobBaseScale(mob) * 0.72);
    const bottom = this.mobFootY(mob, groupY);
    const top = bottom + Math.max(0.16, mob.definition.height * this.mobBaseScale(mob));
    let blocked = false;
    let crowding = 0;

    const consider = (
      obstacleX: number,
      obstacleZ: number,
      obstacleRadius: number,
      obstacleBottom: number,
      obstacleTop: number,
      seed: number,
      canBlock: boolean,
      currentX: number,
      currentZ: number,
    ) => {
      if (top <= obstacleBottom || bottom >= obstacleTop) return;
      const distance = Math.hypot(x - obstacleX, z - obstacleZ);
      const gap = distance - navigationRadius - obstacleRadius;
      crowding = Math.max(crowding, clamp((1.05 - gap) / 1.05, 0, 1.25));
      if (!canBlock) return;
      const separation = separateCreatureCircles(
        { x, z, radius: navigationRadius },
        { x: obstacleX, z: obstacleZ, radius: obstacleRadius },
        0.055,
        seed,
      );
      if (!separation) return;
      if (allowEscape) {
        const currentDistance = Math.hypot(currentX - obstacleX, currentZ - obstacleZ);
        if (distance > currentDistance + 0.0001) return;
      }
      blocked = true;
    };

    consider(
      this.position.x,
      this.position.z,
      PLAYER_RADIUS,
      this.position.y,
      this.position.y + this.currentPlayerHeight(),
      mob.id,
      profile.solid,
      mob.group.position.x,
      mob.group.position.z,
    );
    for (const other of this.mobs) {
      if (other.id === mob.id || !other.group.visible) continue;
      const otherProfile = this.mobCollisionProfile(other);
      if (!otherProfile.solid) continue;
      const otherBottom = this.mobFootY(other);
      consider(
        other.group.position.x,
        other.group.position.z,
        otherProfile.radius,
        otherBottom,
        otherBottom + otherProfile.height,
        mob.id ^ other.id,
        profile.solid,
        mob.group.position.x,
        mob.group.position.z,
      );
    }
    return { blocked, crowding };
  }

  creatureRouteProbe(mob: MobEntity, heading: number, lookahead: number): CreatureRouteProbe {
    const x = mob.group.position.x + Math.cos(heading) * lookahead;
    const z = mob.group.position.z + Math.sin(heading) * lookahead;
    const targetY = this.mobMoveTarget(
      mob,
      x,
      z,
      this.mobBaseScale(mob),
      Math.round(mob.group.position.y - mob.definition.footOffset),
      false,
    );
    const groundY = targetY === null
      ? Math.round(mob.group.position.y - mob.definition.footOffset)
      : Math.round(targetY - mob.definition.footOffset);
    const centerX = Math.round(x);
    const centerZ = Math.round(z);
    const feetType = this.world.getBlock(centerX, groundY + 1, centerZ);
    const water = feetType === BlockId.Water;
    const hazard = feetType === BlockId.Lava;
    const dynamic = targetY === null
      ? { blocked: false, crowding: 0 }
      : this.mobDynamicObstaclesAt(mob, x, targetY, z, true);
    const clearanceCells = Math.max(1, Math.ceil(mob.definition.height * this.mobBaseScale(mob)));
    let openDoor = false;
    for (let offset = 1; offset <= clearanceCells; offset += 1) {
      const type = this.world.getBlock(centerX, groundY + offset, centerZ);
      if (type !== undefined && this.isDoor(type) && this.doorIsOpen(type)) { openDoor = true; break; }
    }
    return {
      walkable: targetY !== null && !dynamic.blocked,
      elevationDelta: targetY === null ? 0 : targetY - mob.group.position.y,
      water,
      hazard,
      crowding: dynamic.crowding,
      clearance: targetY === null ? 0 : clamp(1 - dynamic.crowding * 0.42, 0, 1),
      openDoor,
    };
  }

  safeFollowerTeleportTarget(mob: MobEntity, slot: FollowerFormationTarget) {
    const playerGround = Math.round(this.position.y - 0.5);
    return findFollowerTeleportTarget(slot, mob.id, (x, z) => {
      const targetY = this.mobMoveTarget(mob, x, z, this.mobBaseScale(mob), playerGround, false);
      if (targetY === null || Math.abs(this.mobFootY(mob, targetY) - this.position.y) > 2.2) return null;
      const groundY = Math.round(targetY - mob.definition.footOffset);
      const feetType = this.world.getBlock(Math.round(x), groundY + 1, Math.round(z));
      if (feetType === BlockId.Water || feetType === BlockId.Lava) return null;
      if (this.mobDynamicObstaclesAt(mob, x, targetY, z, false).blocked) return null;
      return targetY;
    });
  }

  /** Scale around the creature's original foot plane, never around its belly. */
  applyMobScale(mob: MobEntity, scale: number) {
    const safeScale = clamp(scale, 0.25, 3.2);
    if (Math.abs(mob.visual.scale.x - safeScale) > 0.0001 || Math.abs(mob.visual.scale.y - safeScale) > 0.0001 || Math.abs(mob.visual.scale.z - safeScale) > 0.0001) {
      mob.visual.scale.setScalar(safeScale);
    }
    const groundedY = mob.visualBaseY + (1 - safeScale) * (mob.visualMinY - mob.visualBaseY);
    if (Math.abs(mob.visual.position.y - groundedY) > 0.0001) mob.visual.position.y = groundedY;
    if (mob.shadeSaddle) {
      const saddled = Boolean(mob.shadeState?.saddled);
      if (mob.shadeSaddle.visible !== saddled) mob.shadeSaddle.visible = saddled;
    }
    const wargSaddle = mob.kind === "warg" ? mob.visual.getObjectByName("warg-saddle") : null;
    if (wargSaddle) wargSaddle.visible = Boolean(mob.courserBond?.saddled);
  }

  spawnMob(kind: MobKind, position: THREE.Vector3, options: SpawnMobOptions = {}) {
    const definition = MOB_DEFS[kind];
    const id = options.id ?? this.nextMobId++;
    this.nextMobId = Math.max(this.nextMobId, id + 1);
    const { group, visual, parts } = this.createMobVisual(kind, id);
    group.updateMatrixWorld(true);
    const visualBounds = new THREE.Box3().setFromObject(visual);
    const visualBaseY = visual.position.y;
    const visualMinY = visualBounds.min.y;
    group.position.copy(position);
    this.creatureGroup.add(group);
    const angle = options.yaw ?? Math.random() * Math.PI * 2;
    const petState = kind === "peelop" ? (options.petState ? { ...options.petState } : createPeelopState((id * 2654435761) >>> 0)) : null;
    const careState = kind !== "peelop" && definition.breedable
      ? normalizeCreatureHusbandryState(options.careState, (id * 2246822519) >>> 0)
      : null;
    const shadeState = kind === "shadecrawler" ? normalizeShadecrawlerState(options.shadeState ?? createShadecrawlerState()) : null;
    const reedstriderBond = kind === "reedstrider" ? { ...(options.reedstriderBond ?? createReedstriderBond()) } : null;
    const courserBond = kind === "wild-horse" || kind === "warg" ? { ...(options.courserBond ?? createReedstriderBond()) } : null;
    const apiaryBee = options.apiaryBee ? { ...options.apiaryBee } : null;
    const socialMode = socialGroupModeForMob(kind);
    const socialGroupId = options.socialGroupId ?? (socialMode
      ? `${socialMode}:${kind}:${Math.floor(position.x / 16)},${Math.floor(position.z / 16)}` : null);
    const peelopShedding = kind === "peelop"
      ? { ...(options.peelopShedding ?? createPeelopSheddingState(petState?.geneticSeed ?? id)) }
      : null;
    const shadeHealthScale = shadeState ? shadecrawlerScale(shadeState) : 1;
    const mob: MobEntity = {
      id, kind, name: options.name?.trim() || petState?.name || definition.name, hostile: definition.hostile && !shadeState?.tamed, definition, group, visual, parts,
      health: options.health ?? petState?.health ?? definition.health * shadeHealthScale,
      maxHealth: petState?.maxHealth ?? definition.health * shadeHealthScale,
      damage: definition.damage, angle, desiredAngle: angle, steering: createStableSteering(angle), route: createCreatureRouteState(angle), wanderTimer: 1 + Math.random() * 4,
      attackCooldown: 0, hurtTimer: 0, age: options.age ?? 0, bob: Math.random() * Math.PI * 2, gait: 0,
      fleeTimer: 0, state: "wander", stateTimer: 0, baseY: position.y, voiceTimer: 2 + Math.random() * 8,
      birdState: definition.family === "bird" ? createBirdBehavior(kind as "emberjay" | "canopy-lark", id * 0.71) : null,
      petState, careState, shadeState, reedstriderBond, courserBond, apiaryBee, beeHiveKey: options.beeHiveKey ?? null,
      socialGroupId, peelopShedding,
      milkCooldown: kind === "meadow-cow" ? clamp(Number(options.milkCooldown) || 0, 0, CLOVERBACK_MILK_COOLDOWN_SECONDS) : 0,
      shadeSaddle: visual.getObjectByName("shadecrawler-saddle") ?? null, visualBaseY, visualMinY,
      persistentPoiResident: options.persistentPoiResident ?? Boolean(definition.persistent),
      poiMarkerId: options.poiMarkerId ?? null,
      enclosed: options.enclosed ?? false,
      enclosureTimer: 0,
      sightCheckTimer: (id % 5) * 0.045,
      awarenessTimer: 0,
      seesPlayer: false,
      factionId: options.factionId ?? definition.faction ?? null,
      profession: options.profession ?? definition.profession ?? null,
      settlementId: options.settlementId ?? null,
      residentId: options.residentId ?? null,
      aligned: options.aligned ?? Boolean(options.factionId ?? definition.faction),
      hiredByPlayerId: options.hiredByPlayerId ?? null,
      followDistance: options.followDistance ?? "dynamic",
    };
    this.applyMobScale(mob, shadeState ? shadecrawlerScale(shadeState) : petState?.baby || careState?.baby ? 0.62 : 1);
    this.mobs.push(mob);
    return mob;
  }

  restoreCreature(saved: SavedCreature) {
    if (!(saved.kind in MOB_DEFS) || BUTTERFLY_ORDER.includes(saved.kind as ButterflyKind)) return null;
    const definition = MOB_DEFS[saved.kind];
    const position = new THREE.Vector3(saved.x, saved.y, saved.z);
    if (definition.movement !== "flying" && definition.movement !== "aquatic" && saved.kind !== "glowmoth") {
      const x = Math.round(saved.x);
      const z = Math.round(saved.z);
      const clearance = Math.max(1, Math.ceil(definition.height));
      const localGround = chooseLocalWalkableGround(Math.floor(saved.y), (candidateY) => {
        const type = this.world.getBlock(x, candidateY, z);
        if (type === undefined || !BLOCKS[type]?.solid) return false;
        for (let offset = 1; offset <= clearance; offset += 1) {
          if (!this.world.isWalkThrough(this.world.getBlock(x, candidateY + offset, z))) return false;
        }
        return true;
      }, 1, 2);
      const ground = localGround ?? this.world.findWalkableY(x, z, saved.y);
      position.y = ground + definition.footOffset;
    }
    return this.spawnMob(saved.kind, position, {
      id: saved.id,
      health: Math.max(0.1, Number(saved.health) || MOB_DEFS[saved.kind].health),
      age: Math.max(0, Number(saved.age) || 0),
      yaw: Number(saved.yaw) || 0,
      persistentPoiResident: Boolean(saved.persistentPoiResident),
      poiMarkerId: saved.poiMarkerId ?? null,
      enclosed: Boolean(saved.enclosed),
      petState: saved.petState ?? null,
      careState: saved.careState ?? null,
      shadeState: saved.shadeState ?? null,
      reedstriderBond: saved.reedstriderBond ?? null,
      courserBond: saved.courserBond ?? null,
      apiaryBee: saved.apiaryBee ?? null,
      socialGroupId: saved.socialGroupId ?? null,
      peelopShedding: saved.peelopShedding ?? null,
      milkCooldown: saved.milkCooldown ?? 0,
      name: saved.residentId ? saved.name ?? null : null,
      factionId: saved.factionId ?? null,
      profession: saved.profession ?? null,
      settlementId: saved.settlementId ?? null,
      residentId: saved.residentId ?? null,
      aligned: Boolean(saved.aligned),
      hiredByPlayerId: saved.hiredByPlayerId ?? null,
      followDistance: saved.followDistance ?? "dynamic",
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

  hostileSpawnSuppressedByTorch(x: number, y: number, z: number, radius = 7) {
    const verticalRadius = 4;
    for (let dx = -radius; dx <= radius; dx += 1) for (let dz = -radius; dz <= radius; dz += 1) {
      if (dx * dx + dz * dz > radius * radius) continue;
      for (let dy = -verticalRadius; dy <= verticalRadius; dy += 1) {
        if (isTorchBlock(this.world.getBlock(x + dx, y + dy, z + dz) ?? BlockId.Air)) return true;
      }
    }
    return false;
  }

  hostileSpawnSuppressedBySettlement(x: number, z: number) {
    return [...this.settlements.values()].some((settlement) => {
      const safeRadius = settlement.size === "hamlet" ? 34 : settlement.size === "village" ? 46 : 58;
      return (settlement.layout.center.x - x) ** 2 + (settlement.layout.center.z - z) ** 2 <= safeRadius * safeRadius;
    });
  }

  hasClearLineOfSight(origin: THREE.Vector3, target: THREE.Vector3) {
    const offset = target.clone().sub(origin);
    const distance = offset.length();
    if (distance <= 0.001) return true;
    const steps = Math.max(1, Math.ceil(distance / 0.24));
    offset.multiplyScalar(1 / steps);
    const sample = origin.clone();
    for (let step = 1; step < steps; step += 1) {
      sample.add(offset);
      const type = this.world.getBlock(Math.floor(sample.x + 0.5), Math.floor(sample.y + 0.5), Math.floor(sample.z + 0.5));
      if (type === undefined) return false;
      const definition = BLOCKS[type];
      if (!definition?.solid || definition.layer === "transparent" || this.world.isWalkThrough(type)) continue;
      const fullOccluder = !definition.shape || ["cube", "door", "chest", "apiary", "wild-hive", "orb-healer"].includes(definition.shape);
      if (fullOccluder) return false;
    }
    return true;
  }

  mobCanSeePlayer(mob: MobEntity) {
    const scale = this.mobBaseScale(mob);
    const origin = mob.group.position.clone().setY(this.mobFootY(mob) + mob.definition.height * scale * 0.72);
    const target = this.position.clone().add(new THREE.Vector3(0, this.cameraEyeHeight * 0.82, 0));
    return this.hasClearLineOfSight(origin, target);
  }

  hostileSpawnVisibleToPlayer(x: number, y: number, z: number) {
    const dx = x - this.position.x;
    const dz = z - this.position.z;
    if (!positionInPlayerViewCone(this.yaw, dx, dz)) return false;
    return this.hasClearLineOfSight(
      this.position.clone().add(new THREE.Vector3(0, this.cameraEyeHeight, 0)),
      new THREE.Vector3(x, y + 1, z),
    );
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
      const tagValue = (prefix: string) => marker.tags?.find((tag) => tag.startsWith(prefix))?.slice(prefix.length) ?? null;
      const settlementId = tagValue("settlement:");
      const residentId = tagValue("resident:");
      const residentName = tagValue("name:");
      const profession = tagValue("profession:");
      const factionTag = tagValue("faction:");
      const factionId = factionTag === "hobbits" || factionTag === "goblins" ? factionTag : null;
      const aligned = marker.tags?.includes("aligned:true") ?? Boolean(factionId);
      const butterfly = BUTTERFLY_ORDER.includes(marker.mobKind as ButterflyKind) ? marker.mobKind as ButterflyKind : null;
      const kind = aliases[marker.mobKind] ?? (marker.mobKind in MOB_DEFS ? marker.mobKind as MobKind : null);
      if (!butterfly && !kind) { this.activatedStructureMarkers.add(markerKey); continue; }
      let hiveKey: string | null = null;
      let boundApiary: ApiaryState | null = null;
      if (kind === "hive-queen" || kind === "honeybee") {
        const hiveX = Math.round(marker.position.x);
        const hiveY = Math.round(marker.position.y) - 1;
        const hiveZ = Math.round(marker.position.z);
        if (this.world.getBlock(hiveX, hiveY, hiveZ) === BlockId.WildBeehive) {
          hiveKey = blockKey(hiveX, hiveY, hiveZ);
          const current = this.ensureApiaryState(hiveKey);
          if (isStockedApiary(current)) {
            boundApiary = kind === "honeybee"
              ? createApiary(current.queen.id, Array.from({ length: Math.min(APIARY_WORKER_CAP, marker.count) }, (_, index) => `${current.queen.id}-poi-worker-${index}`), current.queen.geneticSeed, this.day)
              : current;
            this.apiaries.set(hiveKey, boundApiary);
          }
        }
      }
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
            apiaryBee: kind === "hive-queen" ? boundApiary?.queen ?? null
              : kind === "honeybee" ? boundApiary?.workers[index] ?? null : null,
            beeHiveKey: (kind === "hive-queen" || kind === "honeybee") ? hiveKey : null,
            name: residentName,
            factionId,
            profession,
            settlementId,
            residentId,
            aligned,
          });
        }
      }
      this.activatedStructureMarkers.add(markerKey);
      this.saveSoon();
    }
  }

  spawnNaturalGroup(kind: MobKind, center: THREE.Vector3, maximum: number, aquatic = false) {
    const count = Math.max(0, Math.min(maximum, naturalGroupSizeForMob(kind, Math.random())));
    if (count <= 0) return [] as MobEntity[];
    const mode = socialGroupModeForMob(kind);
    const groupId = `${mode ?? "solitary"}:${kind}:${this.nextMobId}:${Math.floor(center.x)},${Math.floor(center.z)}`;
    const radius = mode === "herd" ? 4.8 : mode === "shoal" ? 1.8 : 1.2;
    const spawned: MobEntity[] = [];
    for (let index = 0; index < count; index += 1) {
      const angle = index / Math.max(1, count) * Math.PI * 2 + (this.nextMobId % 17) * 0.19;
      const distance = index === 0 ? 0 : radius * (0.35 + (index % 3) * 0.22);
      const x = center.x + Math.cos(angle) * distance;
      const z = center.z + Math.sin(angle) * distance;
      let y = center.y;
      if (aquatic) {
        if (this.world.getBlock(Math.floor(x + 0.5), Math.floor(y + 0.5), Math.floor(z + 0.5)) !== BlockId.Water) continue;
      } else {
        const ground = this.world.surfaceAt(Math.round(x), Math.round(z));
        const feet = this.world.getBlock(Math.round(x), ground + 1, Math.round(z));
        if (!this.world.isWalkThrough(feet)) continue;
        y = ground + MOB_DEFS[kind].footOffset;
      }
      spawned.push(this.spawnMob(kind, new THREE.Vector3(x, y, z), { socialGroupId: groupId }));
    }
    return spawned;
  }

  trySpawnMob() {
    const cap = Math.floor((this.touchMode ? 13 : 22) * this.worldOptions.mobDensity);
    const caps = mobPopulationCaps(cap);
    if (caps.total <= 0 || this.mobs.length >= caps.total) return;
    const passiveCap = caps.passive;
    const passiveCount = this.mobs.reduce((count, mob) => count + (mob.hostile ? 0 : 1), 0);
    const hostileCount = this.mobs.length - passiveCount;
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
        this.spawnNaturalGroup(kind, new THREE.Vector3(x, nearbyWaterY, z), Math.min(passiveCap - passiveCount, caps.total - this.mobs.length), true);
        return;
      }
      if (this.worldOptions.difficulty === "peaceful") return;
      const feet = this.world.getBlock(x, y + 1, z);
      const head = this.world.getBlock(x, y + 2, z);
      if (Math.abs(y - this.position.y) > 14 || !this.world.isWalkThrough(feet) || !this.world.isWalkThrough(head)) return;
      if (hostileCount >= caps.hostile || this.hostileSpawnSuppressedByTorch(x, y + 1, z) || this.hostileSpawnSuppressedBySettlement(x, z) || this.hostileSpawnVisibleToPlayer(x, y, z)) return;
      const roll = Math.random();
      kind = roll < 0.38 ? "zombie" : roll < 0.72 ? "caveblob" : "shadecrawler";
    } else {
      y = this.world.surfaceAt(x, z);
      const biome = this.world.biomeAt(x, z);
      if ([BiomeId.DeepOcean, BiomeId.Ocean, BiomeId.River].includes(biome) && passiveCount < passiveCap) {
        let waterY = SEA_LEVEL;
        while (waterY > y && this.world.getBlock(x, waterY, z) !== BlockId.Water) waterY -= 1;
        if (this.world.getBlock(x, waterY, z) === BlockId.Water) {
          const habitat = biome === BiomeId.River ? "river" : biome === BiomeId.DeepOcean ? "deep-ocean" : "ocean";
          const pool = fishKindsForHabitat(habitat);
          kind = pool[Math.floor(Math.random() * pool.length)];
          this.spawnNaturalGroup(kind, new THREE.Vector3(x, waterY - Math.random() * Math.min(2, Math.max(0, waterY - y - 1)), z), Math.min(passiveCap - passiveCount, caps.total - this.mobs.length), true);
        }
        return;
      }
      if (this.world.getBlock(x, y, z) === undefined || y <= SEA_LEVEL) return;
      const daylight = this.daylightAmount();
      const hostile = this.worldOptions.difficulty !== "peaceful" && daylight < 0.2 && this.spawnProtection <= 0;
      const nocturnalGlowmoth = hostile && passiveCount < passiveCap && [BiomeId.MushroomFen, BiomeId.Bloomwood, BiomeId.Siltfen].includes(biome) && Math.random() < 0.3;
      if (nocturnalGlowmoth) kind = "glowmoth";
      else if (hostile) {
        if (hostileCount >= caps.hostile || this.hostileSpawnSuppressedByTorch(x, y + 1, z) || this.hostileSpawnSuppressedBySettlement(x, z) || this.hostileSpawnVisibleToPlayer(x, y, z)) return;
        const roll = Math.random();
        kind = roll < 0.38 ? "zombie" : roll < 0.63 ? "shadecrawler" : roll < 0.82 ? "rattlekin" : "skeleton";
      }
      else {
        if (passiveCount >= passiveCap) return;
        kind = passiveMobKindForBiome(biome, Math.random());
      }
    }
    const available = MOB_DEFS[kind].hostile ? 1 : Math.min(passiveCap - passiveCount, caps.total - this.mobs.length);
    this.spawnNaturalGroup(kind, new THREE.Vector3(x, y + MOB_DEFS[kind].footOffset, z), available);
  }

  mobMoveTarget(
    mob: MobEntity,
    nx: number,
    nz: number,
    collisionScale = this.mobBaseScale(mob),
    referenceGround = Math.round(mob.group.position.y - mob.definition.footOffset),
    checkCreatureCollision = true,
  ) {
    const definition = mob.definition;
    const centerX = Math.round(nx);
    const centerZ = Math.round(nz);
    const currentGround = referenceGround;
    const effectiveHeight = Math.max(0.52, definition.height * Math.min(3, Math.max(0.62, collisionScale)));
    const clearanceCells = Math.max(1, Math.ceil(effectiveHeight));
    const standableAt = (x: number, z: number, groundY: number) => {
      const ground = this.world.getBlock(x, groundY, z);
      if (ground === undefined || !BLOCKS[ground]?.solid) return false;
      for (let offset = 1; offset <= clearanceCells; offset += 1) {
        if (!this.world.isWalkThrough(this.world.getBlock(x, groundY + offset, z))) return false;
      }
      return true;
    };
    const centerGround = chooseLocalWalkableGround(
      currentGround,
      (groundY) => standableAt(centerX, centerZ, groundY),
      1,
      mob.kind === "caveblob" || mob.kind === "puddlehopper" ? 2 : 1,
    );
    if (centerGround === null) return null;
    let insideOpenDoor = false;
    for (let offset = 1; offset <= clearanceCells; offset += 1) {
      const type = this.world.getBlock(centerX, centerGround + offset, centerZ);
      if (type !== undefined && this.isDoor(type) && this.doorIsOpen(type)) { insideOpenDoor = true; break; }
    }
    const effectiveRadius = Math.min(1.18, definition.radius * Math.max(0.62, collisionScale));
    const samples: Array<[number, number]> = insideOpenDoor
      ? [[0, 0]]
      : [[0, 0], [effectiveRadius, effectiveRadius], [-effectiveRadius, effectiveRadius], [effectiveRadius, -effectiveRadius], [-effectiveRadius, -effectiveRadius]];
    let groundY = -Infinity;
    for (const [ox, oz] of samples) {
      const sampleX = Math.round(nx + ox);
      const sampleZ = Math.round(nz + oz);
      const ground = chooseLocalWalkableGround(
        currentGround,
        (candidateY) => standableAt(sampleX, sampleZ, candidateY),
        1,
        mob.kind === "caveblob" || mob.kind === "puddlehopper" ? 2 : 1,
      );
      if (ground === null) return null;
      groundY = Math.max(groundY, ground);
    }
    const targetY = groundY + definition.footOffset;
    if (checkCreatureCollision && this.mobCollisionProfile(mob).solid
      && this.mobDynamicObstaclesAt(mob, nx, targetY, nz, true).blocked) return null;
    return targetY;
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
    const baseScale = this.mobBaseScale(mob);
    if (mob.kind === "caveblob") {
      const squash = 1 + Math.sin(mob.bob * 1.8) * 0.12;
      const scaleY = baseScale * hurtPulse * squash;
      mob.visual.scale.set(baseScale * hurtPulse / Math.sqrt(squash), scaleY, baseScale * hurtPulse / Math.sqrt(squash));
      mob.visual.position.y = mob.visualBaseY + (1 - scaleY) * (mob.visualMinY - mob.visualBaseY);
    } else this.applyMobScale(mob, baseScale * hurtPulse);
  }

  updateBeeMob(mob: MobEntity, dt: number, distance: number, dx: number, dz: number) {
    const bee = mob.apiaryBee;
    if (bee?.tamed && bee.ownerId === this.localPlayerId() && this.playerInvulnerability > 0) {
      let target: MobEntity | null = null;
      let targetDistanceSquared = 64;
      for (const candidate of this.mobs) {
        if (candidate === mob || !candidate.hostile || candidate.health <= 0) continue;
        const candidateDistance = candidate.group.position.distanceToSquared(mob.group.position);
        if (candidateDistance >= targetDistanceSquared) continue;
        target = candidate;
        targetDistanceSquared = candidateDistance;
      }
      if (target) {
        const targetDx = target.group.position.x - mob.group.position.x;
        const targetDz = target.group.position.z - mob.group.position.z;
        const guardDistance = Math.hypot(targetDx, targetDz);
        mob.angle = Math.atan2(targetDz, targetDx);
        const speed = mob.definition.chaseSpeed;
        mob.group.position.x += Math.cos(mob.angle) * speed * dt;
        mob.group.position.z += Math.sin(mob.angle) * speed * dt;
        mob.group.position.y += (target.group.position.y + target.definition.height * 0.55 - mob.group.position.y) * Math.min(1, dt * 5);
        const sting = beeStingProfile(bee, true);
        if (sting.defendsOwner && guardDistance <= mob.definition.attackRange + 0.35 && mob.attackCooldown <= 0) {
          target.health -= sting.damage;
          target.hurtTimer = 0.3;
          mob.attackCooldown = sting.cooldownSeconds;
          this.engageCombat();
          if (target.health <= 0) this.killMob(target);
        }
        mob.group.rotation.y = -mob.angle - Math.PI / 2;
        this.animateMob(mob, speed * dt);
        return false;
      }
    }
    if (bee?.angry && distance < 9) {
      const heading = Math.atan2(dz, dx);
      mob.angle += Math.atan2(Math.sin(heading - mob.angle), Math.cos(heading - mob.angle)) * Math.min(1, dt * mob.definition.turnRate);
      const speed = mob.definition.chaseSpeed;
      mob.group.position.x += Math.cos(mob.angle) * speed * dt;
      mob.group.position.z += Math.sin(mob.angle) * speed * dt;
      mob.group.position.y += (this.position.y + this.cameraEyeHeight * 0.72 - mob.group.position.y) * Math.min(1, dt * 4.5);
      const sting = beeStingProfile(bee);
      if (distance <= mob.definition.attackRange + 0.45 && mob.attackCooldown <= 0) {
        this.damagePlayer(sting.damage, mob.name);
        mob.attackCooldown = sting.cooldownSeconds;
        this.engageCombat();
      }
      mob.group.rotation.y = -mob.angle - Math.PI / 2;
      this.animateMob(mob, speed * dt);
      return false;
    }

    if (!mob.beeHiveKey) {
      if (mob.wanderTimer <= 0) {
        mob.desiredAngle += (Math.random() - 0.5) * 2.5;
        mob.wanderTimer = 1.4 + Math.random() * 3.2;
      }
      mob.angle += Math.atan2(Math.sin(mob.desiredAngle - mob.angle), Math.cos(mob.desiredAngle - mob.angle)) * Math.min(1, dt * mob.definition.turnRate);
      const speed = mob.definition.speed;
      mob.group.position.x += Math.cos(mob.angle) * speed * dt;
      mob.group.position.z += Math.sin(mob.angle) * speed * dt;
      mob.group.position.y = mob.baseY + Math.sin(mob.age * 3.4 + mob.id) * 0.24;
      mob.group.rotation.y = -mob.angle - Math.PI / 2;
      this.animateMob(mob, speed * dt);
      return false;
    }

    const [hiveX, hiveY, hiveZ] = mob.beeHiveKey.split(",").map(Number);
    const phase = apiaryPhaseForWorldTime(this.worldTime);
    if (mob.kind === "hive-queen") {
      const angle = mob.age * 0.22 + mob.id;
      const targetX = hiveX + Math.cos(angle) * 0.42;
      const targetY = hiveY + 0.86 + Math.sin(angle * 1.7) * 0.12;
      const targetZ = hiveZ + Math.sin(angle) * 0.42;
      mob.group.position.x += (targetX - mob.group.position.x) * Math.min(1, dt * 2.4);
      mob.group.position.y += (targetY - mob.group.position.y) * Math.min(1, dt * 2.4);
      mob.group.position.z += (targetZ - mob.group.position.z) * Math.min(1, dt * 2.4);
      mob.angle = Math.atan2(targetZ - mob.group.position.z, targetX - mob.group.position.x);
      mob.group.rotation.y = -mob.angle - Math.PI / 2;
      this.animateMob(mob, mob.definition.speed * dt * 0.2);
      return false;
    }
    const flowers = this.apiaryFlowerCache.get(mob.beeHiveKey) ?? [];
    const plan = planWorkerForaging({
      phase,
      position: mob.group.position,
      hive: { x: hiveX, y: hiveY + 0.75, z: hiveZ },
      flowers,
      carryingNectar: bee?.carryingNectar ?? 0,
    });
    const targetDx = plan.target.x - mob.group.position.x;
    const targetDy = plan.target.y + (plan.mode === "return" ? 0 : 0.55) - mob.group.position.y;
    const targetDz = plan.target.z - mob.group.position.z;
    const targetDistance = Math.hypot(targetDx, targetDy, targetDz);
    if (plan.mode === "return" && targetDistance <= 0.3) {
      if (phase !== "day") return true;
      if (mob.apiaryBee) mob.apiaryBee = { ...mob.apiaryBee, carryingNectar: 0 };
      return false;
    }
    if (plan.collectNectar && mob.apiaryBee) mob.apiaryBee = {
      ...mob.apiaryBee,
      carryingNectar: Math.min(4, mob.apiaryBee.carryingNectar + dt * 0.8),
    };
    if (targetDistance > 0.001) {
      const speed = plan.mode === "land" ? 0.22 : mob.definition.speed;
      const step = Math.min(targetDistance, speed * dt);
      mob.group.position.x += targetDx / targetDistance * step;
      mob.group.position.y += targetDy / targetDistance * step;
      mob.group.position.z += targetDz / targetDistance * step;
      mob.angle = Math.atan2(targetDz, targetDx);
      mob.group.rotation.y = -mob.angle - Math.PI / 2;
      this.animateMob(mob, step);
    }
    return false;
  }

  updateAquaticMob(mob: MobEntity, dt: number, distance: number, dx: number, dz: number) {
    if (mob.wanderTimer <= 0) {
      mob.desiredAngle += (Math.random() - 0.5) * 2.2;
      mob.wanderTimer = 1.5 + Math.random() * 4;
    }
    const playerInWater = this.world.getBlock(Math.floor(this.position.x + 0.5), Math.floor(this.position.y + 0.6), Math.floor(this.position.z + 0.5)) === BlockId.Water;
    const sharkHunting = mob.kind === "deepwater-shark" && !this.mountedBoatId && playerInWater && distance < 13;
    if (sharkHunting) {
      mob.desiredAngle = Math.atan2(dz, dx);
      mob.awarenessTimer = Math.max(mob.awarenessTimer, 2.5);
      if (distance < mob.definition.attackRange && mob.attackCooldown <= 0) {
        this.damagePlayer(mob.damage, mob.name);
        mob.attackCooldown = 1.45;
        this.engageCombat();
        this.audio.play("mob");
      }
    } else if (mob.fleeTimer > 0 || distance < 2.2) mob.desiredAngle = Math.atan2(-dz, -dx);
    const social = this.socialMotions.get(mob.id);
    if (social && mob.fleeTimer <= 0 && distance >= 2.2) mob.desiredAngle = Math.atan2(social.z, social.x);
    const speed = (sharkHunting || mob.fleeTimer > 0 ? mob.definition.chaseSpeed : mob.definition.speed) * (social?.speedScale ?? 1);
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
    for (let radius = 0; radius <= 4; radius += 1) for (let dx = -radius; dx <= radius; dx += 1) for (let dz = -radius; dz <= radius; dz += 1) {
      if (radius > 0 && Math.max(Math.abs(dx), Math.abs(dz)) !== radius) continue;
      const x = originX + dx;
      const z = originZ + dz;
      const ground = this.world.surfaceAt(x, z);
      for (let y = ground + 9; y >= ground + 1; y -= 1) {
        const type = this.world.getBlock(x, y, z);
        if (!TREE_PERCH_BLOCKS.has(type ?? BlockId.Air) || !this.world.isWalkThrough(this.world.getBlock(x, y + 1, z))) continue;
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

  fireMobArrowAt(mob: MobEntity, targetMob: MobEntity) {
    const origin = mob.group.position.clone().add(new THREE.Vector3(0, mob.definition.height * 0.76, 0));
    const target = targetMob.group.position.clone().add(new THREE.Vector3(0, targetMob.definition.height * 0.55, 0));
    const arrow = createArrowProjectile(this.nextProjectileId++, { kind: "mob", id: mob.id }, origin, target, mob.damage, 14.5);
    this.projectileGroup.add(arrow.visual);
    this.projectiles.push(arrow);
    mob.attackCooldown = 1.7 + (mob.id % 4) * 0.12;
    mob.state = "recover";
    mob.stateTimer = 0.3;
    this.audio.play("attack");
  }

  startRangedReload() {
    const slot = this.selectedSlot();
    const definition = slot ? ITEMS[slot.item] : null;
    if (!slot || definition?.useKind !== "ranged-weapon" || !definition.ammoItem) return false;
    const magazine = Math.max(1, definition.magazineSize ?? 1);
    const loaded = this.rangedLoaded.get(slot.item) ?? 0;
    if (loaded >= magazine || this.rangedReloadItem !== null) return false;
    if (this.mode === "survival" && this.countItem(definition.ammoItem) <= 0) {
      this.events.onToast(`No ${ITEMS[definition.ammoItem]?.name ?? "ammunition"} to reload.`);
      return false;
    }
    this.rangedReloadItem = slot.item;
    this.rangedReloadTimer = definition.id === Item.WayfarerCrossbow ? 0.82 : 1.12;
    this.audio.play("ui");
    this.events.onToast(`Reloading ${definition.name}...`);
    this.emitHud(true);
    return true;
  }

  private updateRangedWeapon(dt: number) {
    if (this.rangedReloadItem === null) return;
    const item = this.rangedReloadItem;
    const definition = ITEMS[item];
    if (!definition?.ammoItem || this.selectedSlot()?.item !== item) {
      this.rangedReloadItem = null;
      this.rangedReloadTimer = 0;
      this.emitHud(true);
      return;
    }
    this.rangedReloadTimer = Math.max(0, this.rangedReloadTimer - dt);
    if (this.rangedReloadTimer > 0) return;
    const magazine = Math.max(1, definition.magazineSize ?? 1);
    const loaded = this.rangedLoaded.get(item) ?? 0;
    const needed = Math.max(0, magazine - loaded);
    const available = this.mode === "builder" ? needed : Math.min(needed, this.countItem(definition.ammoItem));
    if (available > 0) {
      if (this.mode === "survival") this.removeItem(definition.ammoItem, available);
      this.rangedLoaded.set(item, loaded + available);
      this.audio.play("place");
    }
    this.rangedReloadItem = null;
    this.rangedReloadTimer = 0;
    this.saveSoon();
    this.emitHud(true);
  }

  private fireSelectedRangedWeapon() {
    const slot = this.selectedSlot();
    const definition = slot ? ITEMS[slot.item] : null;
    if (!slot || definition?.useKind !== "ranged-weapon" || !definition.ammoItem || this.attackCooldown > 0) return false;
    if (this.rangedReloadItem !== null) return false;
    const loaded = this.rangedLoaded.get(slot.item) ?? 0;
    if (loaded <= 0) {
      this.audio.play("ui");
      this.events.onToast(`Empty - press R to load ${ITEMS[definition.ammoItem]?.name ?? "ammunition"}.`);
      this.emitHud(true);
      return false;
    }
    const direction = this.camera.getWorldDirection(new THREE.Vector3()).normalize();
    const origin = this.camera.position.clone().addScaledVector(direction, 0.48).add(new THREE.Vector3(0, -0.08, 0));
    const target = origin.clone().addScaledVector(direction, 58);
    const arrow = createArrowProjectile(this.nextProjectileId++, { kind: "player", id: this.localPlayerId() }, origin, target, definition.damage ?? 2, definition.id === Item.WayfarerCrossbow ? 23 : 19);
    this.projectileGroup.add(arrow.visual);
    this.projectiles.push(arrow);
    this.rangedLoaded.set(slot.item, loaded - 1);
    this.attackCooldown = definition.id === Item.WayfarerCrossbow ? 0.34 : 0.48;
    this.audio.play("attack");
    this.damageSelectedTool();
    this.saveSoon();
    this.emitHud(true);
    return true;
  }

  updateProjectiles(dt: number) {
    for (let index = this.projectiles.length - 1; index >= 0; index -= 1) {
      const projectile = this.projectiles[index];
      const result = stepArrowProjectile(projectile, dt, (position) => {
        const type = this.world.getBlock(Math.floor(position.x + 0.5), Math.floor(position.y + 0.5), Math.floor(position.z + 0.5));
        return Boolean(BLOCKS[type ?? BlockId.Air]?.solid);
      }, (position, radius) => {
        if (projectile.owner.kind === "mob") {
          const owner = this.mobs.find((mob) => mob.id === projectile.owner.id);
          if (!owner?.definition.sentient && !owner?.hiredByPlayerId) {
            return position.distanceToSquared(this.position.clone().add(new THREE.Vector3(0, 0.9, 0))) <= (PLAYER_RADIUS + radius) ** 2 ? "local" : null;
          }
          for (const target of this.mobs) {
            if (target.id === owner.id || target.health <= 0 || !target.hostile) continue;
            const center = target.group.position.clone().add(new THREE.Vector3(0, target.definition.height * 0.5, 0));
            const hitRadius = Math.max(0.28, target.definition.radius * 1.1) + radius;
            if (position.distanceToSquared(center) <= hitRadius * hitRadius) return target.id;
          }
          return null;
        }
        let closest: MobEntity | null = null;
        let closestDistance = Infinity;
        for (const mob of this.mobs) {
          if (mob.health <= 0 || !mob.group.visible) continue;
          const center = mob.group.position.clone().add(new THREE.Vector3(0, mob.definition.height * 0.5, 0));
          const hitRadius = Math.max(0.28, Math.min(1.2, mob.definition.radius * 1.1)) + radius;
          const distance = position.distanceToSquared(center);
          if (distance <= hitRadius * hitRadius && distance < closestDistance) { closest = mob; closestDistance = distance; }
        }
        return closest?.id ?? null;
      });
      if (result.kind === "flying") continue;
      if (result.kind === "target") {
        if (projectile.owner.kind === "mob" && result.targetId === "local") this.damagePlayer(projectile.damage, "skeleton arrow");
        else {
          const mob = this.mobs.find((candidate) => candidate.id === result.targetId);
          if (mob) {
            mob.health -= projectile.damage;
            if (mob.petState) mob.petState.health = Math.max(0, mob.health);
            mob.hurtTimer = 0.34;
            mob.fleeTimer = mob.hostile ? 0.45 : 3.2;
            mob.state = mob.hostile ? "chase" : "flee";
            if (mob.hostile) { mob.awarenessTimer = Math.max(mob.awarenessTimer, 5); this.engageCombat(); }
            this.playCreatureEvent(mob, "hurt");
            this.spawnParticles(mob.group.position.x, mob.group.position.y + mob.definition.height * 0.45, mob.group.position.z, mob.hostile ? BlockId.Obsidian : BlockId.Dirt, 8);
            if (mob.health <= 0) this.killMob(mob);
          }
        }
      }
      this.projectileGroup.remove(projectile.visual);
      disposeArrowVisual(projectile.visual);
      this.projectiles.splice(index, 1);
    }
  }

  refreshSocialMotions(dt: number) {
    this.socialMotionTimer -= dt;
    if (this.socialMotionTimer > 0) return;
    this.socialMotionTimer = 0.35;
    this.socialMotions.clear();
    const groups = new Map<string, { mode: SocialGroupMode; mobs: MobEntity[] }>();
    for (const mob of this.mobs) {
      const mode = socialGroupModeForMob(mob.kind);
      if (!mode || !mob.socialGroupId || mob.health <= 0 || !mob.group.visible) continue;
      const key = `${mode}:${mob.socialGroupId}`;
      const group = groups.get(key) ?? { mode, mobs: [] };
      group.mobs.push(mob);
      groups.set(key, group);
    }
    for (const group of groups.values()) {
      if (group.mobs.length < 2) continue;
      const motions = planSocialGroupMotion(group.mobs.map((mob) => ({
        id: String(mob.id),
        x: mob.group.position.x,
        z: mob.group.position.z,
        vx: Math.cos(mob.angle) * mob.definition.speed,
        vz: Math.sin(mob.angle) * mob.definition.speed,
      })), group.mode);
      for (const motion of motions) this.socialMotions.set(Number(motion.id), motion);
    }
  }

  updateMobs(dt: number) {
    this.mobSpawnTimer -= dt;
    if (this.mobSpawnTimer <= 0) {
      const density = Math.max(0.08, this.worldOptions.mobDensity);
      this.mobSpawnTimer = ((2.2 + Math.random() * 1.8) * HOSTILE_SPAWN_ATTEMPT_SCALE) / density;
      this.trySpawnMob();
    }
    const ownerId = this.localPlayerId();
    this.refreshSocialMotions(dt);
    const leaderSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    if (leaderSpeed > 0.12) this.followerHeading = Math.atan2(this.velocity.z, this.velocity.x);
    const leaderHeading = this.followerHeading;
    const followers = this.mobs.filter((mob) => {
      if (mob.id === this.mountedCreatureId || this.leadAnchors.has(mob.id)
        || mob.definition.movement === "flying" || mob.definition.movement === "aquatic") return false;
      return Boolean(
        (mob.petState?.tamed && mob.petState.ownerId === ownerId && mob.petState.command === "follow")
        || (mob.shadeState?.tamed && mob.shadeState.ownerId === ownerId)
        || (mob.reedstriderBond?.tamed && mob.reedstriderBond.ownerId === ownerId)
        || (mob.courserBond?.tamed && mob.courserBond.ownerId === ownerId)
        || (mob.hiredByPlayerId === ownerId && Boolean(mob.settlementId && mob.residentId
          && this.settlements.get(mob.settlementId)?.residents.find((resident) => resident.id === mob.residentId)?.orders.follow)),
      );
    });
    const plannedFollowerSlots = planFollowerFormation(
      { x: this.position.x, z: this.position.z, heading: leaderHeading },
      followers.map((mob) => ({
        id: mob.id,
        radius: Math.max(0.22, this.mobCollisionProfile(mob).radius || mob.definition.radius * this.mobBaseScale(mob) * 0.72),
      })),
    ).map((slot) => {
      const mob = followers.find((candidate) => candidate.id === slot.id);
      if (!mob || mob.followDistance === "dynamic") return slot;
      const dx = slot.x - this.position.x;
      const dz = slot.z - this.position.z;
      const currentDistance = Math.max(0.001, Math.hypot(dx, dz));
      const desiredDistance = Math.max(1.5, Math.min(10, mob.followDistance));
      return { ...slot, x: this.position.x + dx / currentDistance * desiredDistance, z: this.position.z + dz / currentDistance * desiredDistance, trailingDistance: desiredDistance };
    });
    const followerSlots = new Map(plannedFollowerSlots.map((slot) => [slot.id, slot] as const));
    const companionKills = new Set<MobEntity>();
    for (let index = this.mobs.length - 1; index >= 0; index -= 1) {
      const mob = this.mobs[index];
      if (mob.health <= 0) continue;
      if (mob.hostile && this.worldOptions.difficulty === "peaceful") { this.removeMob(index); continue; }
      mob.age += dt;
      mob.attackCooldown = Math.max(0, mob.attackCooldown - dt);
      mob.milkCooldown = Math.max(0, mob.milkCooldown - dt);
      mob.hurtTimer = Math.max(0, mob.hurtTimer - dt);
      mob.fleeTimer = Math.max(0, mob.fleeTimer - dt);
      mob.wanderTimer -= dt;
      mob.stateTimer -= dt;
      mob.voiceTimer -= dt;
      mob.enclosureTimer -= dt;
      mob.sightCheckTimer -= dt;
      mob.awarenessTimer = Math.max(0, mob.awarenessTimer - dt);
      if (mob.enclosureTimer <= 0) {
        mob.enclosureTimer = 3 + (mob.id % 5) * 0.25;
        mob.enclosed = this.isMobEnclosed(mob);
      }
      if (mob.petState) {
        mob.petState = tickPeelop(mob.petState, dt * 20);
        mob.petState.health = clamp(mob.health, 0, mob.petState.maxHealth);
        mob.name = mob.petState.name || mob.definition.name;
        mob.maxHealth = mob.petState.maxHealth;
        if (mob.petState.tamed && !mob.petState.baby && this.multiplayer?.role !== "guest") {
          const shedding = stepPeelopShedding(mob.peelopShedding ?? createPeelopSheddingState(mob.petState.geneticSeed), Math.floor(mob.age * 20));
          mob.peelopShedding = shedding.state;
          if (shedding.drop) {
            this.spawnDrop(shedding.drop.item, shedding.drop.count, mob.group.position.clone());
            if (mob.group.position.distanceToSquared(this.position) < 64) this.audio.play("pickup");
            this.saveSoon();
          }
        }
      }
      if (mob.careState) mob.careState = tickCreatureHusbandry(mob.careState, dt * 20);
      if (mob.shadeState) {
        mob.shadeState = normalizeShadecrawlerState(mob.shadeState);
        mob.hostile = mob.definition.hostile && !mob.shadeState.tamed;
        mob.maxHealth = Math.round(mob.definition.health * shadecrawlerScale(mob.shadeState));
      }
      this.applyMobScale(mob, this.mobBaseScale(mob));
      let dx = this.position.x - mob.group.position.x;
      let dz = this.position.z - mob.group.position.z;
      let distance = Math.hypot(dx, dz);
      const followerSlot = followerSlots.get(mob.id) ?? null;
      if (followerSlot && shouldTeleportFollower({
        distanceToLeader: distance,
        verticalSeparation: this.mobFootY(mob) - this.position.y,
        blockedSeconds: mob.route.blockedSeconds,
      })) {
        const recovery = this.safeFollowerTeleportTarget(mob, followerSlot);
        if (recovery) {
          mob.group.position.set(recovery.x, recovery.y, recovery.z);
          mob.baseY = recovery.y;
          mob.angle = Math.atan2(this.position.z - recovery.z, this.position.x - recovery.x);
          mob.desiredAngle = mob.angle;
          mob.steering = createStableSteering(mob.angle);
          mob.route = createCreatureRouteState(mob.angle);
          dx = this.position.x - mob.group.position.x;
          dz = this.position.z - mob.group.position.z;
          distance = Math.hypot(dx, dz);
        }
      }
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
      } else if (distance < 22 && mob.voiceTimer <= 0 && CREATURE_SOUND_EVENTS[mob.kind as CoreMobKind]?.ambient) {
        this.playCreatureEvent(mob, "ambient");
        mob.voiceTimer = 8 + (mob.id % 7) * 1.4 + Math.random() * 5;
      }
      const protectedCreature = shouldKeepCreatureLoaded({
        tamed: mob.petState?.tamed || mob.shadeState?.tamed || Boolean(mob.shadeState?.trustFeeds),
        named: Boolean(mob.petState?.name || mob.name !== mob.definition.name),
        enclosed: mob.enclosed,
        leashed: this.leadAnchors.has(mob.id),
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
      if (mob.id === this.mountedCreatureId) continue;
      if (mob.kind === "honeybee" || mob.kind === "hive-queen") {
        if (this.updateBeeMob(mob, dt, distance, dx, dz)) this.removeMob(index);
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
      if (mob.definition.temperament === "Skittish" && (distance < 3.4 || (this.sprinting && distance < 8))) {
        mob.fleeTimer = Math.max(mob.fleeTimer, 2.4);
      }
      if ((mob.factionId === "hobbits" || mob.factionId === "goblins")
        && factionStanding(this.factionRelations.alignments[mob.factionId] ?? 0) === "hostile") mob.hostile = true;
      const aggressive = mob.hostile || (mob.definition.temperament === "Defensive" && mob.fleeTimer > 0);
      if (aggressive && distance < 24 && mob.sightCheckTimer <= 0) {
        mob.seesPlayer = this.mobCanSeePlayer(mob);
        mob.sightCheckTimer = 0.18 + (mob.id % 5) * 0.035;
        if (mob.seesPlayer) mob.awarenessTimer = Math.max(mob.awarenessTimer, 3.2);
      } else if (!aggressive || distance >= 24) mob.seesPlayer = false;
      const petHolding = Boolean(mob.petState?.tamed && (mob.petState.command === "sit" || mob.petState.command === "stay"));
      const followerDistance = followerSlot
        ? Math.hypot(followerSlot.x - mob.group.position.x, followerSlot.z - mob.group.position.z)
        : 0;
      const followerSettled = Boolean(followerSlot && followerDistance <= followerSlot.arrivalRadius);
      let residentEnemy: MobEntity | null = null;
      let residentTarget: { x: number; z: number } | null = null;
      let residentHolding = false;
      if (mob.definition.sentient && !mob.hostile && mob.settlementId && mob.residentId) {
        const settlement = this.settlements.get(mob.settlementId);
        const resident = settlement?.residents.find((entry) => entry.id === mob.residentId && entry.alive);
        if (settlement && resident) {
          if (resident.health !== mob.health || resident.name !== mob.name || resident.hiredByPlayerId !== mob.hiredByPlayerId) {
            this.settlements.set(settlement.id, {
              ...settlement,
              residents: settlement.residents.map((entry) => entry.id === resident.id ? {
                ...entry,
                health: mob.health,
                name: mob.name,
                hiredByPlayerId: mob.hiredByPlayerId,
              } : entry),
            });
          }
          let nearestDistance = 18 * 18;
          for (const candidate of this.mobs) {
            if (candidate === mob || candidate.health <= 0 || !candidate.hostile || candidate.factionId === mob.factionId) continue;
            const candidateDistance = candidate.group.position.distanceToSquared(mob.group.position);
            if (candidateDistance >= nearestDistance) continue;
            if (!this.hasClearLineOfSight(
              mob.group.position.clone().add(new THREE.Vector3(0, mob.definition.height * 0.7, 0)),
              candidate.group.position.clone().add(new THREE.Vector3(0, candidate.definition.height * 0.5, 0)),
            )) continue;
            nearestDistance = candidateDistance;
            residentEnemy = candidate;
          }
          const plan = planResidentSchedule(resident, settlement, { worldDay: this.day, hour: this.worldTime * 24, monsterVisible: Boolean(residentEnemy) });
          if (plan.action === "fight" && residentEnemy) {
            const enemyDx = residentEnemy.group.position.x - mob.group.position.x;
            const enemyDz = residentEnemy.group.position.z - mob.group.position.z;
            const enemyDistance = Math.hypot(enemyDx, enemyDz);
            mob.state = "chase";
            mob.desiredAngle = Math.atan2(enemyDz, enemyDx);
            if (mob.definition.ranged && enemyDistance >= 3 && enemyDistance < 16 && mob.attackCooldown <= 0) this.fireMobArrowAt(mob, residentEnemy);
            else if (enemyDistance < mob.definition.attackRange + 0.35 && mob.attackCooldown <= 0) {
              residentEnemy.health -= mob.damage;
              residentEnemy.hurtTimer = 0.3;
              residentEnemy.awarenessTimer = Math.max(residentEnemy.awarenessTimer, 4);
              mob.attackCooldown = 0.9;
              this.audio.play("attack");
              if (residentEnemy.health <= 0) companionKills.add(residentEnemy);
            }
          } else if (plan.action !== "follow" && plan.target) {
            residentTarget = plan.target;
            const targetDistance = Math.hypot(plan.target.x - mob.group.position.x, plan.target.z - mob.group.position.z);
            if (targetDistance > 0.75) {
              mob.state = plan.action === "flee" ? "flee" : "chase";
              mob.desiredAngle = Math.atan2(plan.target.z - mob.group.position.z, plan.target.x - mob.group.position.x);
            } else {
              residentHolding = true;
              mob.state = "wander";
              mob.desiredAngle = mob.angle;
            }
          }
        }
      }
      let peelopTarget: MobEntity | null = null;
      if (mob.kind === "peelop" && mob.petState?.tamed && !mob.petState.baby
        && mob.petState.ownerId === ownerId && !petHolding
        && (mob.hurtTimer > 0 || this.playerInvulnerability > 0 || this.combatMusicTimer > 0)) {
        let nearestDistanceSquared = 64;
        const sightOrigin = mob.group.position.clone().add(new THREE.Vector3(0, mob.definition.height * 0.7, 0));
        for (const candidate of this.mobs) {
          if (!candidate.hostile || candidate.health <= 0) continue;
          const candidateDistanceSquared = candidate.group.position.distanceToSquared(mob.group.position);
          if (candidateDistanceSquared > nearestDistanceSquared) continue;
          const sightTarget = candidate.group.position.clone().add(new THREE.Vector3(0, candidate.definition.height * 0.55, 0));
          if (!this.hasClearLineOfSight(sightOrigin, sightTarget)) continue;
          nearestDistanceSquared = candidateDistanceSquared;
          peelopTarget = candidate;
        }
      }
      if (residentEnemy || residentTarget || residentHolding) {
        // The schedule above owns this frame's direction and combat action.
      } else if (peelopTarget) {
        const guardDx = peelopTarget.group.position.x - mob.group.position.x;
        const guardDz = peelopTarget.group.position.z - mob.group.position.z;
        const guardDistance = Math.hypot(guardDx, guardDz);
        const defense = peelopDefenseAction({
          tamed: true,
          selfAttacked: mob.hurtTimer > 0,
          ownerAttacked: this.playerInvulnerability > 0 || this.combatMusicTimer > 0,
          hostileDistance: guardDistance,
          cooldownSeconds: mob.attackCooldown,
        });
        mob.state = "chase";
        mob.desiredAngle = Math.atan2(guardDz, guardDx);
        if (defense.attacks) {
          peelopTarget.health -= defense.damage;
          peelopTarget.hurtTimer = 0.3;
          peelopTarget.awarenessTimer = Math.max(peelopTarget.awarenessTimer, 3.2);
          mob.attackCooldown = defense.nextCooldownSeconds;
          this.playCreatureEvent(mob, "hurt");
          this.spawnParticles(peelopTarget.group.position.x, peelopTarget.group.position.y, peelopTarget.group.position.z, BlockId.Dirt, 4);
          this.engageCombat();
          if (peelopTarget.health <= 0) companionKills.add(peelopTarget);
        }
      } else if (mob.definition.ranged && aggressive && mob.awarenessTimer > 0 && distance < 17) {
        mob.state = "chase";
        mob.desiredAngle = distance < 4 ? Math.atan2(-dz, -dx) : Math.atan2(dz, dx);
        if (mob.seesPlayer && distance >= 3.2 && mob.attackCooldown <= 0 && Math.abs(this.position.y - mob.group.position.y) < 5) this.fireSkeletonArrow(mob);
      } else if (mob.state === "windup") {
        if (mob.stateTimer <= 0) {
          if (distance < mob.definition.attackRange + 0.7 && Math.abs(this.position.y - mob.group.position.y) < 2) {
            this.damagePlayer(mob.damage, mob.name);
            this.velocity.add(new THREE.Vector3(dx, 0.1, dz).normalize().multiplyScalar(mob.kind === "ridgeback" ? 4.4 : 3.2));
            this.engageCombat();
            if (mob.kind === "zombie") this.audio.playSample(Math.random() < 0.5 ? "zombieMoan1" : "zombieMoan2", { gain: 0.9 });
            else this.audio.play("mob");
          }
          mob.state = "recover"; mob.stateTimer = 0.55; mob.attackCooldown = 1.15;
        }
      } else if (mob.state === "recover" && mob.stateTimer <= 0) mob.state = "wander";
      else if (petHolding || followerSettled) {
        mob.state = "wander";
        mob.desiredAngle = mob.angle;
      } else if (followerSlot) {
        mob.state = "chase";
        mob.desiredAngle = Math.atan2(followerSlot.z - mob.group.position.z, followerSlot.x - mob.group.position.x);
      }
      else if (aggressive && mob.awarenessTimer > 0 && distance < (this.crouching ? 11 : 20)) {
        mob.state = "chase";
        mob.desiredAngle = Math.atan2(dz, dx);
        if (distance < mob.definition.attackRange && mob.attackCooldown <= 0) { mob.state = "windup"; mob.stateTimer = mob.kind === "rattlekin" ? 0.52 : mob.kind === "zombie" ? 0.44 : 0.34; }
      } else if (aggressive && mob.awarenessTimer <= 0 && mob.state === "chase") {
        mob.state = "wander";
        mob.desiredAngle = mob.angle;
      } else if (mob.fleeTimer > 0) {
        mob.state = "flee";
        mob.desiredAngle = Math.atan2(-dz, -dx);
      } else if (mob.wanderTimer <= 0) {
        mob.state = "wander";
        mob.desiredAngle += (Math.random() - 0.5) * 2.4;
        mob.wanderTimer = 2 + Math.random() * 5;
      }
      const social = this.socialMotions.get(mob.id);
      if (social && mob.state === "wander" && mob.fleeTimer <= 0 && !followerSlot) mob.desiredAngle = Math.atan2(social.z, social.x);
      let speed = (mob.state === "chase" ? mob.definition.chaseSpeed : mob.state === "flee" ? mob.definition.chaseSpeed * 0.86 : mob.definition.speed)
        * (mob.state === "wander" ? social?.speedScale ?? 1 : 1);
      const puddleJump = mob.kind === "puddlehopper"
        ? puddlehopperJumpPlan(mob.id, mob.age, this.weather === "rain", mob.fleeTimer > 0)
        : null;
      if (puddleJump?.jumps) speed = Math.max(speed, puddleJump.forwardVelocity);
      if (mob.kind === "lanternshell" && this.weather === "rain") speed *= 1.55;
      if (mob.state === "windup" || mob.state === "recover") speed *= 0.08;
      if (followerSlot && !peelopTarget) speed = followerTravelSpeed({
        walkSpeed: mob.definition.speed,
        chaseSpeed: mob.definition.chaseSpeed,
        leaderSpeed,
        distanceToSlot: followerDistance,
        arrivalRadius: followerSlot.arrivalRadius,
      });
      if (residentHolding || petHolding || (followerSettled && !peelopTarget)) speed = 0;
      const beforeX = mob.group.position.x;
      const beforeZ = mob.group.position.z;
      const movement = mob.definition.movement ?? (mob.definition.aquatic ? "aquatic" : mob.definition.flying ? "flying" : "ground");
      let routeBlocked = false;
      let routeHeading = mob.desiredAngle;
      if (movement === "ground" && speed > 0.001) {
        const profile = this.mobCollisionProfile(mob);
        const baseLookahead = Math.max(0.72, (profile.radius || mob.definition.radius * this.mobBaseScale(mob)) + 0.36, speed * 0.42);
        const lookahead = followerSlot && !peelopTarget ? Math.max(0.3, Math.min(baseLookahead, followerDistance)) : baseLookahead;
        const route = chooseCreatureRoute({
          state: mob.route,
          dt,
          desiredHeading: mob.desiredAngle,
          mobId: mob.id,
          movement,
          maxStepUp: 1,
          maxDrop: mob.kind === "caveblob" || mob.kind === "puddlehopper" ? 2 : 1,
          allowWater: false,
          probe: (heading) => this.creatureRouteProbe(mob, heading, lookahead),
        });
        mob.route = route.state;
        routeBlocked = route.blocked;
        routeHeading = route.heading;
      } else if (speed <= 0.001) mob.route = createCreatureRouteState(mob.angle);
      mob.steering = updateStableSteering(mob.steering, {
        dt, turnRate: mob.definition.turnRate, blocked: routeBlocked, mobId: mob.id, desiredHeading: routeHeading,
      });
      mob.angle = mob.steering.heading;
      let blocked = routeBlocked;
      if (!routeBlocked && mob.kind === "glowmoth") {
        const nx = mob.group.position.x + Math.cos(mob.angle) * speed * dt;
        const nz = mob.group.position.z + Math.sin(mob.angle) * speed * dt;
        const targetY = this.mobMoveTarget(mob, nx, nz);
        if (targetY !== null) {
          mob.group.position.x = nx;
          mob.group.position.z = nz;
          mob.baseY += (targetY - mob.baseY) * Math.min(1, dt * 4);
        } else { blocked = true; mob.wanderTimer = Math.max(mob.wanderTimer, 0.35); }
        mob.group.position.y = mob.baseY + Math.sin(performance.now() * 0.003 + mob.id) * 0.22;
      } else if (!routeBlocked && speed > 0.001) {
        const nx = mob.group.position.x + Math.cos(mob.angle) * speed * dt;
        const nz = mob.group.position.z + Math.sin(mob.angle) * speed * dt;
        const targetY = this.mobMoveTarget(mob, nx, nz);
        if (targetY !== null) {
          mob.group.position.x = nx;
          mob.group.position.z = nz;
          const puddleInterval = this.weather === "rain" ? 1.45 : 2.8;
          const puddlePhase = mob.age % puddleInterval / puddleInterval;
          const hop = mob.kind === "caveblob" ? Math.max(0, Math.sin(performance.now() * 0.006 + mob.id)) * 0.1
            : puddleJump?.jumps && speed > 0 ? Math.max(0, Math.sin(puddlePhase * Math.PI)) * Math.min(0.75, puddleJump.verticalVelocity * 0.1) : 0;
          mob.group.position.y += (targetY + hop - mob.group.position.y) * Math.min(1, dt * 9);
        } else { blocked = true; mob.wanderTimer = Math.max(mob.wanderTimer, 0.5); }
      }
      const moved = Math.hypot(mob.group.position.x - beforeX, mob.group.position.z - beforeZ);
      if (blocked && !routeBlocked) mob.route = {
        heading: mob.route.heading,
        holdSeconds: 0,
        blockedSeconds: mob.route.blockedSeconds + Math.min(0.1, Math.max(0, dt)),
      };
      mob.group.rotation.y = -mob.angle - Math.PI / 2;
      this.animateMob(mob, moved);
    }
    for (const defeated of companionKills) if (this.mobs.includes(defeated) && defeated.health <= 0) this.killMob(defeated);
  }

  attackTargetMob() {
    const mob = this.targetMob;
    if (!mob || this.attackCooldown > 0) return;
    const slot = this.selectedSlot();
    const item = slot ? ITEMS[slot.item] : null;
    const damage = item?.damage ?? DEFAULT_UNARMED_DAMAGE;
    this.attackCooldown = item?.toolKind === "sword" ? 0.38 : 0.55;
    mob.health -= damage;
    if (mob.petState) mob.petState.health = Math.max(0, mob.health);
    mob.hurtTimer = 0.32;
    mob.fleeTimer = mob.hostile ? 0.45 : 3.2;
    mob.state = mob.hostile ? "chase" : "flee";
    if (mob.hostile) mob.awarenessTimer = Math.max(mob.awarenessTimer, 4.5);
    const away = mob.group.position.clone().sub(this.position).setY(0).normalize().multiplyScalar(0.65);
    mob.group.position.add(away);
    if (item?.toolKind === "sword") this.audio.playSample("swordSwing", { playbackRate: 0.96 + Math.random() * 0.08 });
    else this.audio.play("attack");
    // Every creature hit remains audible even before a custom generated cue is
    // installed; per-species assets can replace this stable fallback hook.
    this.playCreatureEvent(mob, "hurt");
    if (mob.hostile) this.engageCombat();
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
    this.dispatchQuestEvent({ type: "mob-killed", mobKind: mob.kind, at: Date.now() });
    if (mob.hostile) this.dispatchQuestEvent({ type: "mob-killed", mobKind: "overworld-monster", at: Date.now() });
    if (mob.residentId) this.dispatchQuestEvent({ type: "entity-died", entityId: mob.residentId, role: mob.profession, at: Date.now() });
    if (mob.settlementId && mob.residentId) {
      const settlement = this.settlements.get(mob.settlementId);
      if (settlement) this.settlements.set(mob.settlementId, {
        ...settlement,
        residents: settlement.residents.map((resident) => resident.id === mob.residentId ? { ...resident, alive: false, health: 0 } : resident),
      });
    }
    if (mob.factionId === "hobbits" || mob.factionId === "goblins") {
      const role = mob.definition.sentient
        ? mob.profession === "mayor" ? "mayor" as const
          : mob.profession === "banker" ? "banker" as const
            : mob.profession === "warrior" ? "warrior" as const
              : mob.profession === "farmer" ? "farmer" as const
                : mob.profession === "miner" ? "miner" as const
                  : mob.profession === "brewer" ? "brewer" as const
                    : ["merchant", "blacksmith", "alchemist", "general"].includes(mob.profession ?? "") ? "merchant" as const
                      : "civilian" as const
        : "aligned-beast" as const;
      const result = applyFactionMemberKill(this.factionRelations, mob.factionId, role, {
        authorityId: this.factionRelations.authorityId,
        expectedRevision: this.factionRelations.revision,
        eventId: `faction-kill:${mob.id}:${Date.now()}`,
      });
      if (result.applied) this.factionRelations = result.state;
    }
    this.events.onToast(`${mob.name} defeated · Bestiary kill ${this.bestiary[mob.kind].kills}`);
    this.spawnMobRemains(mob);
    const index = this.mobs.indexOf(mob);
    if (index >= 0) this.removeMob(index);
    this.audio.play("pickup");
  }

  ensureLeadLine(mobId: number) {
    this.leadLines ??= new Map();
    this.leadAnchors ??= new Map();
    const existing = this.leadLines.get(mobId);
    if (existing) return existing;
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
    const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0x8d6b43, transparent: true, opacity: 0.9 }));
    line.frustumCulled = false;
    this.scene.add(line);
    this.leadLines.set(mobId, line);
    return line;
  }

  removeLead(mobId: number, drop = false) {
    const mob = this.mobs.find((candidate) => candidate.id === mobId);
    if (drop && mob) this.spawnDrop(Item.Lead, 1, mob.group.position.clone());
    const line = this.leadLines?.get(mobId);
    if (line) {
      this.scene.remove(line);
      line.geometry.dispose();
      line.material.dispose();
      this.leadLines?.delete(mobId);
    }
    this.leadAnchors?.delete(mobId);
  }

  updateLeads() {
    for (const [mobId, lead] of [...this.leadAnchors]) {
      const mob = this.mobs.find((candidate) => candidate.id === mobId);
      if (!mob) { this.removeLead(mobId); continue; }
      const fenceBlock = lead.fence ? this.world.getBlock(lead.fence.x, lead.fence.y, lead.fence.z) : undefined;
      if (lead.fence && fenceBlock !== undefined && !FENCE_BLOCKS.has(fenceBlock)) {
        this.removeLead(mobId, true);
        this.saveSoon();
        continue;
      }
      const anchor = lead.fence
        ? { x: lead.fence.x, y: lead.fence.y + 0.35, z: lead.fence.z }
        : { x: this.position.x, y: this.position.y + 1.05, z: this.position.z };
      const constraint = constrainLead(mob.group.position, anchor, lead.maximumLength);
      if (constraint.breaks) {
        this.removeLead(mobId, true);
        this.events.onToast(`${mob.name}'s lead snapped loose.`);
        this.saveSoon();
        continue;
      }
      if (constraint.taut && mob.id !== this.mountedCreatureId) {
        mob.group.position.x += constraint.x;
        mob.group.position.z += constraint.z;
        const ground = this.mobMoveTarget(mob, mob.group.position.x, mob.group.position.z);
        if (ground !== null) mob.group.position.y = ground;
        mob.baseY = mob.group.position.y;
      }
      const line = this.ensureLeadLine(mobId);
      const positions = line.geometry.getAttribute("position") as THREE.BufferAttribute;
      positions.setXYZ(0, anchor.x, anchor.y, anchor.z);
      positions.setXYZ(1, mob.group.position.x, mob.group.position.y + mob.definition.height * this.mobBaseScale(mob) * 0.55, mob.group.position.z);
      positions.needsUpdate = true;
      line.visible = mob.group.visible;
    }
  }

  removeMob(index: number) {
    const mob = this.mobs[index];
    if (mob.id === this.mountedCreatureId) this.mountedCreatureId = null;
    this.removeLead(mob.id);
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
    while (count > 0) {
      if (this.drops.length >= 120) this.removeDrop(0);
      const amount = Math.min(count, stackLimit);
      let mesh: THREE.Object3D;
      let ownsVisual = false;
      if (ITEMS[item].dropModel) {
        const filledCaptureOrb = item === Item.CaptureOrb
          && Boolean(captureOrbFromInventorySlot({ item, count: 1, ...(metadata ? { metadata } : {}) })?.creature);
        mesh = createAvatarHeldItemModel(item, { filledCaptureOrb }) ?? new THREE.Object3D();
        mesh.name = `dropped-${ITEMS[item].dropModel}`;
        mesh.scale.multiplyScalar(0.52);
        ownsVisual = true;
      } else {
        let material = this.dropMaterials.get(item);
        if (!material) { material = new THREE.MeshLambertMaterial({ color: ITEMS[item].color }); this.dropMaterials.set(item, material); }
        mesh = new THREE.Mesh(this.sharedDropGeometry, material);
      }
      mesh.position.copy(position).add(new THREE.Vector3((Math.random() - 0.5) * 0.45, 0.25, (Math.random() - 0.5) * 0.45));
      this.dropGroup.add(mesh);
      const drop: DropEntity = {
        id: this.nextDropId++, item, count: amount,
        ...(resolvedDurability !== undefined ? { durability: resolvedDurability } : {}),
        ...(metadata ? { metadata: cloneSlot({ item, count: 1, metadata })?.metadata } : {}),
        mesh, ...(ownsVisual ? { ownsVisual: true } : {}), velocity: new THREE.Vector3((Math.random() - 0.5) * 1.4, 2 + Math.random(), (Math.random() - 0.5) * 1.4), age: 0, pickupDelay: 0.35,
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
        const beforeCount = drop.count;
        const leftover = this.addItem(drop.item, drop.count, drop.durability, undefined, drop.metadata);
        const acquired = beforeCount - leftover;
        if (acquired > 0) {
          this.audio.play("pickup");
          const itemId = resourceIdForItem(drop.item) ?? commerceKeyForItem(drop.item);
          if (itemId) this.dispatchQuestEvent({ type: "item-acquired", itemId, count: acquired, at: Date.now() });
        }
        drop.count = leftover;
        if (drop.count <= 0) { this.removeDrop(index); this.saveSoon(); this.emitHud(true); continue; }
      }
      if (drop.age > 120 || distance > 85) this.removeDrop(index);
    }
  }

  removeDrop(index: number) {
    const drop = this.drops[index];
    this.dropGroup.remove(drop.mesh);
    if (drop.ownsVisual) this.disposeObject(drop.mesh);
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
    for (const particle of this.leafParticles) {
      this.scene.remove(particle.object);
      this.disposeObject(particle.object);
    }
    this.leafParticles = [];
    this.leafParticleTimer = 0;
    for (const mobId of [...this.leadAnchors.keys()]) this.removeLead(mobId);
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
    this.mountedCreatureId = null;
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
    light.userData.sourceType = source.type;
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
        light.userData.sourceType = BlockId.Air;
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
    const timeSeconds = performance.now() / 1000;
    for (const light of this.placedLightPool) {
      const target = Number(light.userData.targetIntensity) || 0;
      const current = Number(light.userData.baseIntensity) || 0;
      const base = current + (target - current) * (1 - Math.exp(-dt * (target > current ? 12 : 7)));
      light.userData.baseIntensity = base;
      const sourceType = Number(light.userData.sourceType) as BlockId;
      if (isTorchBlock(sourceType)) {
        const flicker = torchAnimationSample(timeSeconds, {
          x: Number(light.userData.sourceX) || 0,
          y: Number(light.userData.sourceY) || 0,
          z: Number(light.userData.sourceZ) || 0,
        });
        light.intensity = base * flicker.lightIntensity;
        light.distance = flicker.lightRadius * 1.75;
      } else light.intensity = base * (1 + Math.sin(timeSeconds * 4 + (Number(light.userData.phase) || 0)) * 0.045);
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
    const heldFlicker = torchAnimationSample(timeSeconds, this.position, true);
    this.caveLight.intensity = heldTorch ? 3.15 * heldFlicker.lightIntensity : heldGlow ? 2.55 : 0;
    this.caveLight.distance = heldTorch ? heldFlicker.lightRadius * 3 : 20;
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
    else if (weatherFx.fullOvercast) {
      // Thunder owns the entire dome rather than leaving clear blue gaps
      // between clusters. Lightning still flashes through the low cloud deck.
      const stormSky = daylight > 0.18 ? "#596570" : "#252d38";
      sky.lerp(this.weatherSkyColor.set(stormSky), 0.94);
    }
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
    const weatherLight = weatherFx.fullOvercast ? 0.42 : 1 - weatherFx.skyDarkening * 0.62;
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
    this.sun.visible = !underground && weatherFx.sunVisibility > 0.01 && sunHeight > -0.18;
    this.moon.visible = !underground && weatherFx.celestialVisibility > 0.01 && sunHeight < 0.22;
    (this.stars.material as THREE.PointsMaterial).opacity = underground
      ? 0
      : clamp((1 - daylight) * 1.05 * weatherFx.celestialVisibility, 0, 0.95);
    this.stars.position.copy(this.camera.position);
    this.directional.target.position.copy(this.camera.position);
    this.directional.position.copy(this.camera.position).addScaledVector(celestialDirection, 55);
    this.audio.setDepth(this.position.y, this.weather === "rain" && this.skyVisibility > 0.56);
    const biome = this.world.biomeAt(Math.round(this.position.x), Math.round(this.position.z));
    const atSea = underwater || biome === BiomeId.Ocean || biome === BiomeId.DeepOcean || biome === BiomeId.Beach;
    const forestBiome = [BiomeId.Wildwood, BiomeId.Birchlight, BiomeId.Bloomwood].includes(biome);
    const skyChallenge = biome === BiomeId.Highlands && this.position.y > 57 && daylight > 0.35;
    const alternateScore = (this.day + biome) % 2 === 0;
    const explorationScore = this.day % 3 === 0
      ? "hoppin"
      : alternateScore ? "wildwoodA" : "wildwoodB";
    const nearbySettlement = !underground ? [...(this.settlements?.values?.() ?? [])]
      .map((settlement) => ({ settlement, distance: Math.hypot(settlement.layout.center.x - this.position.x, settlement.layout.center.z - this.position.z) }))
      .filter(({ distance }) => distance <= 58)
      .sort((left, right) => left.distance - right.distance)[0]?.settlement ?? null : null;
    const settlementScore = nearbySettlement?.ownerFactionId === "hobbits" ? "hobbitSettlement" as const
      : nearbySettlement?.ownerFactionId === "goblins" ? "goblinSettlement" as const : null;
    const musicScene = this.combatMusicTimer > 0 ? this.combatMusicScene
      : settlementScore ?? (skyChallenge ? "skyboss"
      : atSea ? "sea"
        : underground ? (alternateScore ? "emberdeepA" : "emberdeepB")
          : daylight < 0.24 ? "night"
            : biome === BiomeId.Meadow ? "meadowglass"
              : forestBiome && this.day % 4 === 0 ? "fernlight"
                : forestBiome ? explorationScore
                  : biome === BiomeId.Savanna && this.day % 3 === 0 ? "hoppin"
                    : "day");
    this.audio.setMusicScene(musicScene, dt);
  }

  updateRain(dt: number) {
    const visuals = weatherVisuals(this.weatherState);
    // Precipitation follows the visible sky. This suppresses rain and snow in
    // caves, under dense roofs, and inside settlements while leaving open
    // porches and wide skylights naturally exposed.
    const exposedToSky = Math.min(this.skyVisibility, this.skyVisibilityTarget);
    this.rain.visible = visuals.precipitation > 0.02 && this.position.y > 5 && exposedToSky > 0.56;
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
    this.leafParticleTimer -= dt;
    if (this.running && !this.titleMode && !this.paused && this.leafParticleTimer <= 0) {
      this.leafParticleTimer = 0.5;
      const capacity = Math.max(0, 18 - this.leafParticles.length);
      if (capacity) {
        const nearbyLeaves = this.world.leafBlocksNear(this.camera.position.x, this.camera.position.y, this.camera.position.z, 32);
        const planned = planLeafParticles(this.world.seedText, Date.now(), nearbyLeaves, this.camera.position, Math.min(3, capacity));
        for (const state of planned) {
          const object = new THREE.Group();
          const geometry = new THREE.PlaneGeometry(0.14, 0.09);
          const material = new THREE.MeshBasicMaterial({ color: state.color, side: THREE.DoubleSide, transparent: true, opacity: 0.82 });
          const first = new THREE.Mesh(geometry, material);
          const second = new THREE.Mesh(geometry, material);
          first.rotation.y = Math.PI / 4;
          second.rotation.y = -Math.PI / 4;
          object.add(first, second);
          object.position.set(state.position.x, state.position.y, state.position.z);
          object.rotation.z = state.rotation;
          this.scene.add(object);
          this.leafParticles.push({ object, state });
        }
      }
    }
    for (let index = this.leafParticles.length - 1; index >= 0; index -= 1) {
      const particle = this.leafParticles[index];
      const ground = this.world.surfaceAt(Math.round(particle.state.position.x), Math.round(particle.state.position.z)) + 0.5;
      const next = stepLeafParticle(particle.state, dt, ground);
      if (!next) {
        this.scene.remove(particle.object);
        this.disposeObject(particle.object);
        this.leafParticles.splice(index, 1);
        continue;
      }
      particle.state = next;
      particle.object.position.set(next.position.x, next.position.y, next.position.z);
      particle.object.rotation.set(next.rotation * 0.34, next.rotation, next.rotation * 0.7);
    }
  }

  createAvatarHeldItem(item: ItemCode, filledCaptureOrb = false) {
    return createAvatarHeldItemModel(item, { filledCaptureOrb });
  }

  equipmentAppearanceFromCodes(codes?: Partial<Record<EquipmentSlot, ItemCode>>): PlayerEquipmentAppearance {
    return Object.fromEntries(((["head", "chest", "legs", "feet"] as EquipmentSlot[]).map((slot) => {
      const item = codes?.[slot];
      return [slot, item === undefined ? null : (ITEMS[item]?.color ?? null)] as const;
    }))) as PlayerEquipmentAppearance;
  }

  syncAvatarHeldItem(model: BlockPlayerModel, item: ItemCode, remoteId?: string, filledCaptureOrb = false) {
    const previousCode = remoteId ? (this.remoteAvatarHeldCodes.get(remoteId) ?? -1) : this.localAvatarHeldCode;
    const previousFilled = remoteId ? (this.remoteAvatarHeldFilled.get(remoteId) ?? false) : this.localAvatarHeldFilled;
    if (previousCode === item && previousFilled === filledCaptureOrb) return;
    const previous = model.rightHandSocket.children[0];
    if (previous) {
      model.setHeldItem(null);
      this.disposeObject(previous);
    }
    const held = item >= 0 ? this.createAvatarHeldItem(item, filledCaptureOrb) : null;
    model.setHeldItem(held);
    if (remoteId) {
      this.remoteAvatarHeldCodes.set(remoteId, item);
      this.remoteAvatarHeldFilled.set(remoteId, filledCaptureOrb);
    } else {
      this.localAvatarHeld = held;
      this.localAvatarHeldCode = item;
      this.localAvatarHeldFilled = filledCaptureOrb;
    }
  }

  animateTorchVisual(root: THREE.Object3D | null, position: Pick<THREE.Vector3, "x" | "y" | "z">) {
    if (!root) return;
    const sample = torchAnimationSample(performance.now() / 1000, position, true);
    for (const name of ["torch-flame-outer", "torch-flame-inner"] as const) {
      const flame = root.getObjectByName(name);
      if (!flame) continue;
      const base = flame.userData.torchBase as [number, number, number] | undefined;
      if (base) flame.position.set(
        base[0] + sample.flameOffsetX,
        base[1] + sample.flameOffsetY,
        base[2] + sample.flameOffsetZ,
      );
      const innerScale = name === "torch-flame-inner" ? 0.86 : 1;
      flame.scale.setScalar(sample.flameScale * innerScale);
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
    const localSelected = this.selectedSlot();
    const localOrbFilled = localSelected?.item === Item.CaptureOrb && Boolean(captureOrbFromInventorySlot(localSelected)?.creature);
    this.syncAvatarHeldItem(this.localPlayerModel, localSelected?.item ?? -1, undefined, localOrbFilled);
    if (this.localAvatarHeldCode === BlockId.Torch) this.animateTorchVisual(this.localAvatarHeld, this.position);

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
      this.syncAvatarHeldItem(remote.model, latest.heldItem ?? -1, id, Boolean(latest.heldItemFilled));
      if (latest.heldItem === BlockId.Torch) this.animateTorchVisual(remote.model.rightHandSocket.children[0] ?? null, remote.model.group.position);
      if (now - remote.lastUpdate > 20_000) this.removeRemotePlayer(id);
    }
  }

  updateGameplayCamera(dt: number) {
    const targetFov = this.aimingRanged ? Math.max(42, this.settings.fov * 0.68) : this.settings.fov;
    const nextFov = this.camera.fov + (targetFov - this.camera.fov) * (1 - Math.exp(-dt * 14));
    if (Math.abs(nextFov - this.camera.fov) > 0.01) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }
    const targetEye = playerEyeHeightForVariant(this.playerVariant, this.crouching);
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
      targetHeight: (this.crouching ? 1.08 : 1.34) * playerVariantHeightScale(this.playerVariant),
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
          return mesh;
        };
        if (item === BlockId.Torch) {
          addBox([0.08, 0.48, 0.08], [0, 0, 0], 0x8d542b, [0, 0, -0.12]);
          const outer = addBox([0.14, 0.14, 0.14], [-0.03, 0.27, 0], 0xffbe45, [0, 0, 0], true);
          const inner = addBox([0.07, 0.08, 0.07], [-0.04, 0.37, 0], 0xffef93, [0, 0, 0], true);
          outer.name = "torch-flame-outer";
          inner.name = "torch-flame-inner";
          outer.userData.torchBase = outer.position.toArray();
          inner.userData.torchBase = inner.position.toArray();
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
        } else if (definition.heldModel || definition.useKind === "net" || (definition.useKind === "release-creature" && definition.creatureKind
          && BUTTERFLY_ORDER.includes(definition.creatureKind as ButterflyKind))) {
          const selectedSlot = this.selectedSlot();
          const filledCaptureOrb = item === Item.CaptureOrb && Boolean(captureOrbFromInventorySlot(selectedSlot)?.creature);
          const productionHeld = createAvatarHeldItemModel(item, { filledCaptureOrb });
          if (productionHeld) {
            productionHeld.name = `first-person-${productionHeld.name}`;
            const workingTool = definition.useKind === "net";
            productionHeld.position.set(-0.02, -0.08, workingTool ? -0.2 : -0.08);
            productionHeld.scale.multiplyScalar(workingTool ? 0.86 : definition.heldModel === "capture-orb" ? 1.05 : 0.95);
            productionHeld.traverse((object) => {
              const renderable = object as THREE.Object3D & { material?: THREE.Material | THREE.Material[] };
              const materials = renderable.material ? (Array.isArray(renderable.material) ? renderable.material : [renderable.material]) : [];
              for (const heldMaterial of materials) {
                heldMaterial.depthTest = false;
                heldMaterial.depthWrite = false;
                heldMaterial.transparent = true;
              }
              object.renderOrder = 20;
            });
            this.heldRoot.add(productionHeld);
          }
        } else if (definition.iconKind === "bucket") {
          const metal = 0x9aa5a6;
          addBox([0.3, 0.07, 0.25], [0, -0.1, 0], metal);
          addBox([0.055, 0.3, 0.25], [-0.145, 0.03, 0], metal, [0, 0, -0.08]);
          addBox([0.055, 0.3, 0.25], [0.145, 0.03, 0], metal, [0, 0, 0.08]);
          addBox([0.28, 0.28, 0.045], [0, 0.03, -0.115], metal);
          addBox([0.28, 0.28, 0.045], [0, 0.03, 0.115], metal);
          addBox([0.36, 0.035, 0.035], [0, 0.26, 0], 0xc6cece);
          if (definition.bucketLiquid) addBox([0.23, 0.035, 0.18], [0, 0.17, 0], definition.color, [0, 0, 0], definition.bucketLiquid === "lava");
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
          toolGroup.rotation.set(-Math.PI / 2, -0.04, -0.12);
          toolGroup.position.set(0, -0.04, -0.2);
          toolGroup.userData.workingAngle = Math.PI / 2;
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
    this.heldRoot.position.set(0.48 + Math.sin(walk) * 0.018, -0.43 + Math.abs(Math.cos(walk)) * 0.018 - this.heldUse * 0.12, -0.84 + this.heldUse * 0.06);
    this.heldRoot.rotation.set(-0.12 + this.heldSwing * 0.78, -0.3 - this.heldSwing * 0.12, -0.06 - this.heldSwing * 0.64);
    if (item === BlockId.Torch) this.animateTorchVisual(this.heldRoot, this.position);
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
    if (this.running && !this.titleMode && !multiplayerGuest) {
      this.updateFurnaces(dt);
      this.updatePersistentMachines(dt);
    }
    if (this.running && !this.titleMode && !this.paused) {
      this.updateRangedWeapon(dt);
      this.updateFastTravelChannel();
      this.updateMapDiscovery(dt);
      if (!multiplayerGuest) this.updateHearthroadsSimulation(dt);
      if (multiplayerGuest) {
        for (const mob of this.mobs) this.animateMob(mob, dt * mob.definition.speed * 0.35);
      } else this.updateMobs(dt);
      this.updateLeads();
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
      const budget = applyResourceMode(this.settings.resourceMode, this.budgetController.observe(report));
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
        state: mob.shadeState?.tamed ? `bonded-${Math.round(mob.shadeState.growth * 100)}%-${mob.shadeState.saddled ? "saddled" : "unsaddled"}`
          : mob.petState?.command ?? mob.birdState?.mode ?? mob.state,
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
        variant: this.playerVariant, camera: this.cameraMode, sprinting: this.sprinting, crouching: this.crouching,
        mountedBoatId: this.mountedBoatId, mountedCreatureId: this.mountedCreatureId,
      },
      world: { seed: this.world.seedText, day: this.day, time: Number(this.worldTime.toFixed(4)), biome: BIOME_NAMES[this.world.biomeAt(Math.round(this.position.x), Math.round(this.position.z))], weather: this.weatherState.kind },
      target: this.target ? { type: "block", name: BLOCKS[this.target.type].name, position: [this.target.x, this.target.y, this.target.z] }
        : this.targetMob ? { type: "mob", id: this.targetMob.id, name: this.targetMob.name }
          : this.targetBoat ? { type: "boat", id: this.targetBoat.save.id } : null,
      nearbyMobs,
      boats: [...this.boats.values()].map((boat) => ({ id: boat.save.id, position: [boat.save.x, boat.save.y, boat.save.z], passengers: boat.save.passengers.length, storageSlots: boat.save.inventory.filter(Boolean).length })),
      exhibits: [...this.chests.entries()].filter(([key]) => key.startsWith("exhibit:")).map(([key, slots]) => ({ key, capacity: slots.length, residents: slots.filter(Boolean).length })),
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
      this.updatePersistentMachines(dt);
      this.updateRangedWeapon(dt);
      this.updateFastTravelChannel();
      this.updateMapDiscovery(dt);
      this.updateHearthroadsSimulation(dt);
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
    const selectedSlot = this.selectedSlot();
    const selectedDefinition = selectedSlot ? ITEMS[selectedSlot.item] : null;
    const rangedWeapon = selectedSlot && selectedDefinition?.useKind === "ranged-weapon" && selectedDefinition.ammoItem
      ? {
        loaded: this.rangedLoaded.get(selectedSlot.item) ?? 0,
        magazine: Math.max(1, selectedDefinition.magazineSize ?? 1),
        spare: this.mode === "builder" ? 999 : this.countItem(selectedDefinition.ammoItem),
        reloading: this.rangedReloadItem === selectedSlot.item,
      }
      : null;
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
      activeApiary: this.activeApiaryKey ? apiaryHudState(this.apiaries.get(this.activeApiaryKey) ?? createEmptyApiaryBlock()) : null,
      activeOrbRack: this.activeOrbRackKey ? orbRackHudState(this.orbRacks.get(this.activeOrbRackKey) ?? createOrbRack()) : null,
      activeHealingStation: this.activeHealingStationKey ? healingStationHudState(this.healingStations.get(this.activeHealingStationKey) ?? createCreatureHealer()) : null,
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
      mountedCreature: this.mountedCreatureId !== null,
      mountedCreatureName: this.mountedCreatureId === null ? null : this.mobs.find((mob) => mob.id === this.mountedCreatureId)?.name ?? "Creature",
      mapKnowledge: this.mapKnowledge,
      questBook: this.questBook,
      questDefinitions: this.allQuestDefinitions(),
      blueprints: this.blueprints,
      plantBestiary: this.plantBestiary,
      activeAlchemy: this.activeAlchemyKey ? this.alchemyStands.get(this.activeAlchemyKey) ?? null : null,
      activeDistillery: this.activeDistilleryKey ? this.distilleries.get(this.activeDistilleryKey) ?? null : null,
      goldWallet: this.goldWallet,
      factionRelations: this.factionRelations,
      settlements: [...this.settlements.values()],
      activeSettlementId: this.activeSettlementId,
      activeMerchant: this.activeMerchantId ? this.merchants.get(this.activeMerchantId) ?? null : null,
      activeSentient: this.activeSentient ? {
        id: this.activeSentient.id,
        residentId: this.activeSentient.residentId,
        name: this.activeSentient.name,
        profession: this.activeSentient.profession,
        factionId: this.activeSentient.factionId,
        hired: Boolean(this.activeSentient.hiredByPlayerId),
        followDistance: this.activeSentient.followDistance,
      } : null,
      bankAccount: this.bankAccount,
      stockMarket: this.stockMarket,
      potionBuffs: { ...this.potionBuffs },
      fastTravelChannel: this.fastTravelChannel,
      rangedWeapon,
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
    const visuals = weatherVisuals(this.weatherState);
    const coverageBucket = Math.round(visuals.cloudCoverage * 8);
    const signature = `${this.weatherState.cycle}:${this.weatherState.kind}:${coverageBucket}:${visuals.fullOvercast ? 1 : 0}`;
    if (!force && cellX === this.cloudCellX && cellZ === this.cloudCellZ && this.cloudWeatherSignature === signature) return;
    this.cloudCellX = cellX;
    this.cloudCellZ = cellZ;
    this.cloudWeatherSignature = signature;
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
    material.opacity = visuals.fullOvercast ? 0.94 : this.weatherState.kind === "clear" ? 0.72 : 0.86;
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
    this.world.setRenderDistance(this.titleMode ? Math.min(this.settings.renderDistance, this.touchMode ? 4 : 6) : this.settings.renderDistance);
    this.world.setRetentionPadding(chunkRetentionPadding(this.settings.resourceMode));
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
      inventory: this.inventory.map(normalizeCaptureOrbInventorySlot),
      equipment: Object.fromEntries((Object.keys(this.equipment) as EquipmentSlot[]).map((slot) => [slot, normalizeCaptureOrbInventorySlot(this.equipment[slot])])),
      bestiary: Object.fromEntries(MOB_ORDER.map((kind) => [kind, { ...this.bestiary[kind] }])),
      saplings: Object.fromEntries(this.saplings.entries()),
      cursor: normalizeCaptureOrbInventorySlot(this.cursor),
      craftGrid: this.craftGrid.map(normalizeCaptureOrbInventorySlot),
      selected: this.selected,
      health: this.health,
      hunger: this.hunger,
      xp: this.xp,
      level: this.level,
      time: this.worldTime,
      day: this.day,
      weather: this.weather,
      furnaces: Object.fromEntries([...this.furnaces.entries()].map(([key, value]) => [key, {
        ...value,
        input: normalizeCaptureOrbInventorySlot(value.input),
        fuel: normalizeCaptureOrbInventorySlot(value.fuel),
        output: normalizeCaptureOrbInventorySlot(value.output),
      }])),
      chests: Object.fromEntries([...this.chests.entries()].map(([key, value]) => [key, value.map(normalizeCaptureOrbInventorySlot)])),
      apiaries: Object.fromEntries([...this.apiaries.entries()].map(([key, value]) => [key, cloneApiaryBlockState(value)])),
      orbRacks: Object.fromEntries([...this.orbRacks.entries()].map(([key, value]) => [key, createOrbRack(value.slots.map(cloneCaptureOrb))])),
      healingStations: Object.fromEntries([...this.healingStations.entries()].map(([key, value]) => [key, {
        ...value,
        slots: value.slots.map(cloneCaptureOrb),
      }])),
      alchemyStands: Object.fromEntries(this.alchemyStands.entries()),
      distilleries: Object.fromEntries(this.distilleries.entries()),
      mapKnowledge: this.mapKnowledge,
      questBook: this.questBook,
      sideQuestDefinitions: this.sideQuestDefinitions,
      blueprints: this.blueprints,
      plantBestiary: this.plantBestiary,
      goldWallet: this.goldWallet,
      factionRelations: this.factionRelations,
      settlements: [...this.settlements.values()],
      merchants: Object.fromEntries(this.merchants.entries()),
      bankAccount: this.bankAccount,
      stockMarket: this.stockMarket,
      potionBuffs: { ...this.potionBuffs },
      rangedLoaded: Object.fromEntries(this.rangedLoaded.entries()),
      drops: this.drops.map((drop) => {
        const slot = normalizeCaptureOrbInventorySlot({
          item: drop.item,
          count: drop.count,
          ...(drop.durability !== undefined ? { durability: drop.durability } : {}),
          ...(drop.metadata ? { metadata: drop.metadata } : {}),
        })!;
        return {
          item: slot.item,
          count: slot.count,
          ...(slot.durability !== undefined ? { durability: slot.durability } : {}),
          ...(slot.metadata ? { metadata: slot.metadata } : {}),
          x: drop.mesh.position.x, y: drop.mesh.position.y, z: drop.mesh.position.z, age: drop.age,
        };
      }),
      options: { ...this.worldOptions },
      playerVariant: this.playerVariant,
      liquidLevels: [...this.liquidCells.entries()].map(([key, cell]) => [key, { ...cell }]),
      weatherState: { ...this.weatherState },
      creatures: this.mobs.filter((mob) => !mob.beeHiveKey).map((mob) => ({
        id: mob.id,
        kind: mob.kind,
        ...(mob.name !== mob.definition.name ? { name: mob.name } : {}),
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
        ...(mob.careState ? { careState: { ...mob.careState } } : {}),
        ...(mob.shadeState ? { shadeState: { ...mob.shadeState } } : {}),
        ...(mob.reedstriderBond ? { reedstriderBond: { ...mob.reedstriderBond } } : {}),
        ...(mob.courserBond ? { courserBond: { ...mob.courserBond } } : {}),
        ...(mob.apiaryBee ? { apiaryBee: { ...mob.apiaryBee } } : {}),
        ...(mob.socialGroupId ? { socialGroupId: mob.socialGroupId } : {}),
        ...(mob.peelopShedding ? { peelopShedding: { ...mob.peelopShedding } } : {}),
        ...(mob.kind === "meadow-cow" && mob.milkCooldown > 0 ? { milkCooldown: mob.milkCooldown } : {}),
        ...(mob.factionId ? { factionId: mob.factionId } : {}),
        ...(mob.profession ? { profession: mob.profession } : {}),
        ...(mob.settlementId ? { settlementId: mob.settlementId } : {}),
        ...(mob.residentId ? { residentId: mob.residentId } : {}),
        ...(mob.aligned ? { aligned: true } : {}),
        ...(mob.hiredByPlayerId ? { hiredByPlayerId: mob.hiredByPlayerId } : {}),
        ...(mob.followDistance !== "dynamic" ? { followDistance: mob.followDistance } : {}),
      })),
      activatedStructureMarkers: [...this.activatedStructureMarkers],
      boats: [...this.boats.values()].map(({ save }) => ({
        ...save,
        passengers: [...save.passengers],
        inventory: save.inventory.map(normalizeCaptureOrbInventorySlot),
      })),
      leads: serializeLeadAnchors(this.leadAnchors, new Set(this.mobs.map((mob) => mob.id))),
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
