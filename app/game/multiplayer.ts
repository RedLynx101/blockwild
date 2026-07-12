import type { DragonState } from "./dragons";
import type { SkillState } from "./skills";

/**
 * Browser-only, host-authoritative WebRTC multiplayer transport for Blockwild.
 *
 * The host owns one RTCPeerConnection per guest (a star topology). Signaling is
 * deliberately manual: players copy an offer code to a guest, then copy the
 * answer code back to the host. Once connected, authoritative gameplay uses a
 * reliable ordered channel while short-lived pose updates use an unordered,
 * no-retransmit channel.
 *
 * This module contains transport, validation, and peer lifecycle only. It does
 * not mutate the voxel world; the game simulation consumes typed `message`
 * events, validates actions as host, and publishes authoritative snapshots.
 */

export const MULTIPLAYER_PROTOCOL_VERSION = 1 as const;
export const MULTIPLAYER_PROTOCOL_NAME = "blockwild-webrtc" as const;
export const RELIABLE_CHANNEL_LABEL = "blockwild.gameplay.v1" as const;
export const MOVEMENT_CHANNEL_LABEL = "blockwild.movement.v1" as const;

export const MAX_RELIABLE_MESSAGE_BYTES = 256 * 1024;
export const MAX_MOVEMENT_MESSAGE_BYTES = 4 * 1024;
export const MAX_INVITE_CODE_CHARS = 160 * 1024;
const MAX_SDP_CHARS = 112 * 1024;
const MAX_RELIABLE_BUFFERED_BYTES = 2 * 1024 * 1024;
const MAX_MOVEMENT_BUFFERED_BYTES = 64 * 1024;
const MAX_PROTOCOL_STRIKES = 3;
const COORDINATE_LIMIT = 30_000_000;

export type MultiplayerRole = "host" | "guest";
export type MultiplayerSessionState = "idle" | "hosting" | "joining" | "connected" | "disconnected" | "closed" | "error";
export type MultiplayerPeerState = "invited" | "connecting" | "connected" | "stale" | "disconnected" | "failed" | "closed";
export type MultiplayerChannelKind = "reliable" | "movement";

export type PeerIdentity = {
  id: string;
  name: string;
  color: string;
  /** Optional protocol-v1 appearance preference, carried before the first pose. */
  variant?: "male" | "female";
};

export type PlayerPose = {
  playerId: string;
  tick: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  vx: number;
  vy: number;
  vz: number;
  grounded: boolean;
  heldItem?: number;
  /** Optional protocol-v1 appearance hint for metadata-backed Capture Orbs. */
  heldItemFilled?: boolean;
  crouching?: boolean;
  sprinting?: boolean;
  action?: "none" | "mine" | "use";
  /** Optional for protocol-v1 peers; absent peers render with the legacy male model and no armor. */
  variant?: "male" | "female";
  equipment?: Partial<Record<"head" | "chest" | "legs" | "feet", number>>;
  boatId?: string;
  boatSeat?: number;
};

export type BlockEdit = { x: number; y: number; z: number; type: number };
export type ActionStatus = "request" | "accepted" | "rejected";

export type BlockAction = {
  requestId: string;
  actorId: string;
  tick: number;
  kind: "break" | "place" | "batch";
  edits: BlockEdit[];
  status?: ActionStatus;
  reason?: string;
};

export type MobSnapshotEntry = {
  id: number;
  kind: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  health: number;
  state: string;
  /** Optional appearance/bond hints; old clients safely ignore them. */
  scale?: number;
  tamed?: boolean;
  saddled?: boolean;
  baby?: boolean;
  cargoChests?: number;
  lifeStage?: "tiny" | "juvenile" | "adult";
  aquaticOnly?: boolean;
  airProgress?: number;
  /** Complete authoritative lifecycle state for protocol-v1 dragon peers. */
  dragonState?: DragonState;
  /** Optional culture provenance keeps aligned settlement creatures authoritative for guests. */
  factionId?: "player" | "hobbits" | "goblins" | "atlantians" | "sugarcourt" | "wood-elves" | "dwarves" | null;
  aligned?: boolean;
};

export type MobSnapshot = { tick: number; mobs: MobSnapshotEntry[] };

export type DropSnapshotEntry = {
  id: number;
  item: number;
  count: number;
  x: number;
  y: number;
  z: number;
  age: number;
  durability?: number;
  /** Bounded JSON state for placed eggs and other exact-state world drops. */
  metadata?: Record<string, unknown>;
};

export type DropSnapshot = { tick: number; drops: DropSnapshotEntry[] };
export type SailboatSnapshotEntry = {
  id: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
  velocity: number;
  passengers: string[];
};
export type TimeWeatherSnapshot = { tick: number; worldTime: number; day: number; weather: "clear" | "rain"; boats?: SailboatSnapshotEntry[] };
export type SleepTarget = "morning" | "night";
export type SleepVote = { actorId: string; tick: number; target: SleepTarget; active: boolean };

export type SessionWorldOptions = {
  difficulty: "peaceful" | "easy" | "normal" | "hard";
  dayLengthMinutes: number;
  mobDensity: number;
  butterflyDensity: number;
  caveFrequency: number;
  biomeScale: number;
  resourceAbundance: number;
  structures: boolean;
  weather: boolean;
  keepInventory: boolean;
  friendlyFire: boolean;
  sleepRule?: "any-player" | "percentage" | "all-players";
  sleepPercentage?: number;
  enabledFactions?: readonly ("hobbits" | "goblins" | "atlantians" | "sugarcourt" | "wood-elves" | "dwarves")[];
};

export type InventoryEndpoint = {
  scope: "inventory" | "hotbar" | "equipment" | "craft" | "cursor" | "container";
  slot: number;
  containerId?: string;
};

export type InventoryAction = {
  requestId: string;
  actorId: string;
  kind: "move" | "split" | "swap" | "collect" | "equip" | "drop" | "craft";
  from?: InventoryEndpoint;
  to?: InventoryEndpoint;
  count?: number;
  expectedRevision?: number;
  /** World-drop collection is resolved by the host rather than the guest. */
  dropId?: number;
  status?: ActionStatus;
  reason?: string;
};

export type ContainerAction = {
  requestId: string;
  actorId: string;
  containerId: string;
  kind: "open" | "close" | "take" | "place" | "quick-move" | "craft" | "smelt";
  slot?: number;
  targetSlot?: number;
  count?: number;
  expectedRevision?: number;
  /** A bounded authoritative slot image used for shared chest transactions. */
  slots?: ItemStackSnapshot[];
  status?: ActionStatus;
  reason?: string;
};

export type ItemStackSnapshot = { item: number; count: number; durability?: number; metadata?: Record<string, unknown> } | null;
export type InventorySnapshot = { revision: number; slots: ItemStackSnapshot[]; selected: number };
export type ContainerSnapshot = { id: string; kind: "chest" | "double-chest" | "furnace" | "crafting"; revision: number; slots: ItemStackSnapshot[] };
export type PlayerSessionSnapshot = {
  playerId: string;
  revision: number;
  variant: "male" | "female";
  inventory: ItemStackSnapshot[];
  equipment: Record<"head" | "chest" | "legs" | "feet", ItemStackSnapshot>;
  selected: number;
  health: number;
  hunger: number;
  xp: number;
  level: number;
  skills: SkillState;
};

export type PlayerStateAction = {
  requestId: string;
  actorId: string;
  state: PlayerSessionSnapshot;
  status?: ActionStatus;
  reason?: string;
};

export type CombatAction = {
  requestId: string;
  actorId: string;
  tick: number;
  targetKind: "mob" | "player";
  targetId: string;
  attack: "melee" | "ranged";
  status?: ActionStatus;
  reason?: string;
  resultingHealth?: number;
  killed?: boolean;
};
export type CartographyMapShare = {
  tableKey: string;
  reply: boolean;
  map: {
    schema: number;
    worldId: string;
    playerId: string;
    revision: number;
    exploredChunks: string[];
    markers: Array<Record<string, unknown>>;
    activeBedId: string | null;
    fastTravelCharges: number;
  };
};

export type WorldSnapshot = {
  tick: number;
  seed: string;
  generatorVersion: number;
  players: PlayerPose[];
  blockEdits: BlockEdit[];
  mobs: MobSnapshotEntry[];
  drops: DropSnapshotEntry[];
  boats?: SailboatSnapshotEntry[];
  time: TimeWeatherSnapshot;
  worldOptions?: SessionWorldOptions;
  inventory?: InventorySnapshot;
  containers?: ContainerSnapshot[];
  /** Targeted host-owned state for the peer receiving this snapshot. */
  playerState?: PlayerSessionSnapshot;
};

export type MultiplayerPayloadMap = {
  hello: { identity: PeerIdentity; role: MultiplayerRole };
  heartbeat: { nonce: string; reply: boolean };
  goodbye: { reason: string };
  snapshot: WorldSnapshot;
  "player-pose": PlayerPose;
  "block-action": BlockAction;
  "mob-snapshot": MobSnapshot;
  "drop-snapshot": DropSnapshot;
  "time-weather": TimeWeatherSnapshot;
  "sleep-vote": SleepVote;
  "inventory-action": InventoryAction;
  "container-action": ContainerAction;
  "player-state": PlayerStateAction;
  "combat-action": CombatAction;
  "map-share": CartographyMapShare;
};

export type MultiplayerMessageType = keyof MultiplayerPayloadMap;

export type MultiplayerEnvelope<K extends MultiplayerMessageType = MultiplayerMessageType> = {
  version: typeof MULTIPLAYER_PROTOCOL_VERSION;
  sessionId: string;
  type: K;
  sequence: number;
  sentAt: number;
  from: string;
  payload: MultiplayerPayloadMap[K];
};

export type PeerInfo = {
  token: string;
  identity: PeerIdentity | null;
  state: MultiplayerPeerState;
  connectedAt: number | null;
  lastSeenAt: number;
  latencyMs: number | null;
  reliableOpen: boolean;
  movementOpen: boolean;
};

export type MultiplayerEvent =
  | { type: "state"; previous: MultiplayerSessionState; state: MultiplayerSessionState }
  | { type: "peer"; peer: PeerInfo; reason?: string }
  | { type: "message"; peer: PeerInfo; channel: MultiplayerChannelKind; envelope: MultiplayerEnvelope }
  | { type: "error"; error: Error; peer?: PeerInfo };

export type MultiplayerListener = (event: MultiplayerEvent) => void;

export type MultiplayerSupport = {
  supported: boolean;
  secureContext: boolean;
  webRTC: boolean;
  dataChannels: boolean;
  textCodec: boolean;
  cryptographicRandom: boolean;
  reasons: string[];
};

export interface DataChannelLike {
  readonly label: string;
  readonly ordered: boolean;
  readonly maxRetransmits: number | null;
  readonly readyState: RTCDataChannelState;
  readonly bufferedAmount: number;
  binaryType: BinaryType;
  onopen: ((event: Event) => void) | null;
  onclose: ((event: Event) => void) | null;
  onerror: ((event: Event) => void) | null;
  onmessage: ((event: MessageEvent) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface PeerConnectionLike {
  readonly localDescription: RTCSessionDescriptionInit | null;
  readonly remoteDescription: RTCSessionDescriptionInit | null;
  readonly iceGatheringState: RTCIceGatheringState;
  readonly connectionState: RTCPeerConnectionState;
  onicegatheringstatechange: ((event: Event) => void) | null;
  onconnectionstatechange: ((event: Event) => void) | null;
  ondatachannel: ((event: RTCDataChannelEvent) => void) | null;
  createDataChannel(label: string, options?: RTCDataChannelInit): DataChannelLike;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  createAnswer(): Promise<RTCSessionDescriptionInit>;
  setLocalDescription(description: RTCSessionDescriptionInit): Promise<void>;
  setRemoteDescription(description: RTCSessionDescriptionInit): Promise<void>;
  close(): void;
}

export type PeerConnectionFactory = (configuration: RTCConfiguration) => PeerConnectionLike;

export type MultiplayerOptions = {
  identity: PeerIdentity;
  rtcConfiguration?: RTCConfiguration;
  peerConnectionFactory?: PeerConnectionFactory;
  now?: () => number;
  randomId?: (prefix: string) => string;
  heartbeatIntervalMs?: number;
  peerTimeoutMs?: number;
  connectionTimeoutMs?: number;
  iceGatheringTimeoutMs?: number;
  autoMaintenance?: boolean;
  onEvent?: MultiplayerListener;
};

type OfferSignal = {
  version: typeof MULTIPLAYER_PROTOCOL_VERSION;
  protocol: typeof MULTIPLAYER_PROTOCOL_NAME;
  kind: "offer";
  sessionId: string;
  token: string;
  identity: PeerIdentity;
  description: RTCSessionDescriptionInit;
};

type AnswerSignal = {
  version: typeof MULTIPLAYER_PROTOCOL_VERSION;
  protocol: typeof MULTIPLAYER_PROTOCOL_NAME;
  kind: "answer";
  sessionId: string;
  token: string;
  identity: PeerIdentity;
  description: RTCSessionDescriptionInit;
};

export type ManualSignal = OfferSignal | AnswerSignal;

type PeerRecord = {
  token: string;
  identity: PeerIdentity | null;
  connection: PeerConnectionLike;
  reliable: DataChannelLike | null;
  movement: DataChannelLike | null;
  state: MultiplayerPeerState;
  createdAt: number;
  connectedAt: number | null;
  lastSeenAt: number;
  latencyMs: number | null;
  lastReliableSequence: number;
  lastMovementSequence: number;
  protocolStrikes: number;
  pendingHeartbeatNonce: string | null;
  pendingHeartbeatAt: number;
  closed: boolean;
};

const MESSAGE_TYPES = new Set<MultiplayerMessageType>([
  "hello", "heartbeat", "goodbye", "snapshot", "player-pose", "block-action", "mob-snapshot", "drop-snapshot", "time-weather", "sleep-vote", "inventory-action", "container-action", "player-state", "combat-action", "map-share",
]);
const CONTROL_TYPES = new Set<MultiplayerMessageType>(["hello", "heartbeat", "goodbye"]);
const GUEST_OUTBOUND_TYPES = new Set<MultiplayerMessageType>(["hello", "heartbeat", "goodbye", "player-pose", "block-action", "sleep-vote", "inventory-action", "container-action", "player-state", "combat-action", "map-share"]);

export class MultiplayerProtocolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MultiplayerProtocolError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isFiniteNumber(value: unknown, min: number, max: number) {
  return typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
}

function isInteger(value: unknown, min: number, max: number) {
  return Number.isSafeInteger(value) && (value as number) >= min && (value as number) <= max;
}

function isShortString(value: unknown, max: number, allowEmpty = false) {
  return typeof value === "string" && (allowEmpty || value.length > 0) && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
}

function isId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{8,64}$/u.test(value);
}

export function validatePeerIdentity(value: unknown): value is PeerIdentity {
  return isRecord(value)
    && isId(value.id)
    && typeof value.name === "string"
    && value.name === value.name.trim()
    && value.name.length >= 1
    && value.name.length <= 24
    && !/[\u0000-\u001f\u007f]/u.test(value.name)
    && typeof value.color === "string"
    && /^#[0-9a-fA-F]{6}$/u.test(value.color)
    && (value.variant === undefined || value.variant === "male" || value.variant === "female");
}

function validateDescription(value: unknown, type: "offer" | "answer"): value is RTCSessionDescriptionInit {
  // `RTCPeerConnection.localDescription` is a browser-native
  // RTCSessionDescription instance, not a plain JSON record. The wire decoder
  // still supplies plain objects, but rejecting the native prototype here made
  // every real invite fail after ICE gathering with "Missing local offer
  // description" even though the SDP was present and valid.
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const description = value as { type?: unknown; sdp?: unknown };
  return description.type === type
    && typeof description.sdp === "string"
    && description.sdp.length > 0
    && description.sdp.length <= MAX_SDP_CHARS;
}

function validateBlockEdit(value: unknown): value is BlockEdit {
  return isRecord(value)
    && isInteger(value.x, -COORDINATE_LIMIT, COORDINATE_LIMIT)
    && isInteger(value.y, -4096, 4096)
    && isInteger(value.z, -COORDINATE_LIMIT, COORDINATE_LIMIT)
    && isInteger(value.type, 0, 65_535);
}

function validatePose(value: unknown): value is PlayerPose {
  const validEquipment = value && isRecord(value) && value.equipment !== undefined
    ? isRecord(value.equipment)
      && Object.keys(value.equipment).every((slot) => ["head", "chest", "legs", "feet"].includes(slot))
      && Object.values(value.equipment).every((item) => isInteger(item, 0, 65_535))
    : true;
  return isRecord(value)
    && isId(value.playerId)
    && isInteger(value.tick, 0, Number.MAX_SAFE_INTEGER)
    && isFiniteNumber(value.x, -COORDINATE_LIMIT, COORDINATE_LIMIT)
    && isFiniteNumber(value.y, -4096, 4096)
    && isFiniteNumber(value.z, -COORDINATE_LIMIT, COORDINATE_LIMIT)
    && isFiniteNumber(value.yaw, -100_000, 100_000)
    && isFiniteNumber(value.pitch, -Math.PI, Math.PI)
    && isFiniteNumber(value.vx, -256, 256)
    && isFiniteNumber(value.vy, -256, 256)
    && isFiniteNumber(value.vz, -256, 256)
    && typeof value.grounded === "boolean"
    && (value.heldItem === undefined || isInteger(value.heldItem, 0, 65_535))
    && (value.heldItemFilled === undefined || typeof value.heldItemFilled === "boolean")
    && (value.crouching === undefined || typeof value.crouching === "boolean")
    && (value.sprinting === undefined || typeof value.sprinting === "boolean")
    && (value.action === undefined || value.action === "none" || value.action === "mine" || value.action === "use")
    && (value.variant === undefined || value.variant === "male" || value.variant === "female")
    && (value.boatId === undefined || isId(value.boatId))
    && (value.boatSeat === undefined || isInteger(value.boatSeat, 0, 1))
    && validEquipment;
}

export class MultiplayerOperationCancelledError extends Error {
  constructor(message = "Multiplayer setup was cancelled because the session changed") {
    super(message);
    this.name = "MultiplayerOperationCancelledError";
  }
}

export function isMultiplayerOperationCancellation(error: unknown) {
  if (error instanceof MultiplayerOperationCancelledError) return true;
  const message = error instanceof Error ? error.message : String(error);
  return /user[- ]initiated.*(?:abort|close)|(?:abort|close).*called|session (?:changed|closed)|setup was cancelled/iu.test(message);
}

function validateSailboat(value: unknown): value is SailboatSnapshotEntry {
  return isRecord(value)
    && isId(value.id)
    && isFiniteNumber(value.x, -COORDINATE_LIMIT, COORDINATE_LIMIT)
    && isFiniteNumber(value.y, -4096, 4096)
    && isFiniteNumber(value.z, -COORDINATE_LIMIT, COORDINATE_LIMIT)
    && isFiniteNumber(value.yaw, -100_000, 100_000)
    && isFiniteNumber(value.velocity, -32, 32)
    && Array.isArray(value.passengers)
    && value.passengers.length <= 2
    && value.passengers.every(isId);
}

function validateDragonState(value: unknown): value is DragonState {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (value.type !== "fire" && value.type !== "ice" && value.type !== "steel" && value.type !== "sea") return false;
  if (value.sex !== "female" && value.sex !== "male") return false;
  if (value.command !== "follow" && value.command !== "stay" && value.command !== "guard-lair" && value.command !== "wander") return false;
  const equipment = value.equipment;
  if (!isRecord(equipment)
    || typeof equipment.saddle !== "boolean"
    || !Array.isArray(equipment.chests)
    || equipment.chests.length !== 2
    || !equipment.chests.every((attached) => typeof attached === "boolean")
    || !isRecord(equipment.armor)) return false;
  const armor = equipment.armor;
  const armorSlots = ["head", "neck", "body", "tail"] as const;
  if (!armorSlots.every((slot) => armor[slot] === null || isShortString(armor[slot], 96))) return false;
  const validHome = value.home === null || (isRecord(value.home)
    && isShortString(value.home.lairId, 96)
    && isShortString(value.home.dimension, 96)
    && isRecord(value.home.position)
    && isFiniteNumber(value.home.position.x, -COORDINATE_LIMIT, COORDINATE_LIMIT)
    && isFiniteNumber(value.home.position.y, -4096, 4096)
    && isFiniteNumber(value.home.position.z, -COORDINATE_LIMIT, COORDINATE_LIMIT)
    && isFiniteNumber(value.home.guardRadius, 0, 512));
  return validHome
    && isShortString(value.dragonId, 96)
    && isInteger(value.geneticSeed, 0, 0xffff_ffff)
    && isInteger(value.ageTicks, 0, Number.MAX_SAFE_INTEGER)
    && isInteger(value.stage, 1, 5)
    && isFiniteNumber(value.growthScale, 0.01, 8)
    && isFiniteNumber(value.health, 0, 100_000)
    && isFiniteNumber(value.maxHealth, 1, 100_000)
    && typeof value.alive === "boolean"
    && typeof value.tamed === "boolean"
    && (value.ownerId === null || isShortString(value.ownerId, 96))
    && isInteger(value.trust, 0, 3)
    && typeof value.onShoulder === "boolean"
    && isInteger(value.scaleReserve, 0, 1_000_000)
    && isInteger(value.scaleShedTicks, 0, Number.MAX_SAFE_INTEGER)
    && isInteger(value.breedCooldownTicks, 0, Number.MAX_SAFE_INTEGER)
    && (value.customName === null || isShortString(value.customName, 48))
    && value.persistent === true;
}

function validateMob(value: unknown): value is MobSnapshotEntry {
  return isRecord(value)
    && isInteger(value.id, 0, Number.MAX_SAFE_INTEGER)
    && isShortString(value.kind, 32)
    && isFiniteNumber(value.x, -COORDINATE_LIMIT, COORDINATE_LIMIT)
    && isFiniteNumber(value.y, -4096, 4096)
    && isFiniteNumber(value.z, -COORDINATE_LIMIT, COORDINATE_LIMIT)
    && isFiniteNumber(value.yaw, -100_000, 100_000)
    && isFiniteNumber(value.health, 0, 100_000)
    && isShortString(value.state, 32)
    && (value.scale === undefined || isFiniteNumber(value.scale, 0.01, 8))
    && (value.tamed === undefined || typeof value.tamed === "boolean")
    && (value.saddled === undefined || typeof value.saddled === "boolean")
    && (value.baby === undefined || typeof value.baby === "boolean")
    && (value.cargoChests === undefined || isInteger(value.cargoChests, 0, 6))
    && (value.lifeStage === undefined || value.lifeStage === "tiny" || value.lifeStage === "juvenile" || value.lifeStage === "adult")
    && (value.aquaticOnly === undefined || typeof value.aquaticOnly === "boolean")
    && (value.airProgress === undefined || isFiniteNumber(value.airProgress, 0, 1))
    && (value.dragonState === undefined || (validateDragonState(value.dragonState) && value.kind === `${value.dragonState.type}-dragon`))
    && (value.factionId === undefined || value.factionId === null
      || ["player", "hobbits", "goblins", "atlantians", "sugarcourt", "wood-elves", "dwarves"].includes(value.factionId as string))
    && (value.aligned === undefined || typeof value.aligned === "boolean");
}

function validateDropMetadata(value: unknown) {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  try { return JSON.stringify(value).length <= 8_192; }
  catch { return false; }
}

function validateDrop(value: unknown): value is DropSnapshotEntry {
  return isRecord(value)
    && isInteger(value.id, 0, Number.MAX_SAFE_INTEGER)
    && isInteger(value.item, 0, 65_535)
    && isInteger(value.count, 1, 65_535)
    && isFiniteNumber(value.x, -COORDINATE_LIMIT, COORDINATE_LIMIT)
    && isFiniteNumber(value.y, -4096, 4096)
    && isFiniteNumber(value.z, -COORDINATE_LIMIT, COORDINATE_LIMIT)
    && isFiniteNumber(value.age, 0, 1_000_000)
    && (value.durability === undefined || isInteger(value.durability, 0, 1_000_000))
    && validateDropMetadata(value.metadata);
}

function validateTimeWeather(value: unknown): value is TimeWeatherSnapshot {
  return isRecord(value)
    && isInteger(value.tick, 0, Number.MAX_SAFE_INTEGER)
    && isFiniteNumber(value.worldTime, 0, 1)
    && isInteger(value.day, 1, 1_000_000)
    && (value.weather === "clear" || value.weather === "rain")
    && (value.boats === undefined || (Array.isArray(value.boats) && value.boats.length <= 128 && value.boats.every(validateSailboat)));
}

function validateEndpoint(value: unknown): value is InventoryEndpoint {
  return isRecord(value)
    && ["inventory", "hotbar", "equipment", "craft", "cursor", "container"].includes(value.scope as string)
    && isInteger(value.slot, 0, 1023)
    && (value.containerId === undefined || isShortString(value.containerId, 96));
}

function validateStatusFields(value: Record<string, unknown>) {
  return (value.status === undefined || value.status === "request" || value.status === "accepted" || value.status === "rejected")
    && (value.reason === undefined || isShortString(value.reason, 160, true));
}

function validateBoundedMetadata(value: unknown) {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  try { return JSON.stringify(value).length <= 8_192; }
  catch { return false; }
}

function validateItemStack(value: unknown): value is ItemStackSnapshot {
  return value === null || (isRecord(value)
    && isInteger(value.item, 0, 65_535)
    && isInteger(value.count, 1, 65_535)
    && (value.durability === undefined || isInteger(value.durability, 0, 1_000_000))
    && validateBoundedMetadata(value.metadata));
}

function validateInventorySnapshot(value: unknown): value is InventorySnapshot {
  return isRecord(value)
    && isInteger(value.revision, 0, Number.MAX_SAFE_INTEGER)
    && Array.isArray(value.slots)
    && value.slots.length <= 128
    && value.slots.every(validateItemStack)
    && isInteger(value.selected, 0, 127);
}

function validateContainerSnapshot(value: unknown): value is ContainerSnapshot {
  return isRecord(value)
    && isShortString(value.id, 96)
    && ["chest", "double-chest", "furnace", "crafting"].includes(value.kind as string)
    && isInteger(value.revision, 0, Number.MAX_SAFE_INTEGER)
    && Array.isArray(value.slots)
    && value.slots.length <= 128
    && value.slots.every(validateItemStack);
}

function validateSkillState(value: unknown): value is SkillState {
  if (!isRecord(value) || (value.schema !== 1 && value.schema !== 2) || !isRecord(value.skills)) return false;
  const skills = value.skills;
  const skillIds = ["melee", "ranged", "mining", "crafting", "survival", "husbandry", "exploration", "magic"];
  if (!skillIds.every((id) => {
    const progress = skills[id];
    return isRecord(progress)
      && isInteger(progress.level, 0, 1_000)
      && isFiniteNumber(progress.xp, 0, Number.MAX_SAFE_INTEGER);
  })) return false;
  return isInteger(value.characterLevel, 1, Number.MAX_SAFE_INTEGER)
    && isFiniteNumber(value.characterXp, 0, Number.MAX_SAFE_INTEGER)
    && isInteger(value.perkPoints, 0, Number.MAX_SAFE_INTEGER)
    && Array.isArray(value.unlockedPerkIds)
    && value.unlockedPerkIds.length <= 256
    && value.unlockedPerkIds.every((id) => isShortString(id, 96))
    && (value.ascendantTraits === undefined || (isRecord(value.ascendantTraits)
      && Object.values(value.ascendantTraits).every((enabled) => typeof enabled === "boolean")))
    && typeof value.ascendantHealthFloorEnabled === "boolean";
}

function validatePlayerSessionSnapshot(value: unknown): value is PlayerSessionSnapshot {
  if (!isRecord(value) || !isRecord(value.equipment)) return false;
  const equipment = value.equipment;
  const equipmentSlots = ["head", "chest", "legs", "feet"];
  return isId(value.playerId)
    && isInteger(value.revision, 0, Number.MAX_SAFE_INTEGER)
    && (value.variant === "male" || value.variant === "female")
    && Array.isArray(value.inventory)
    && value.inventory.length === 36
    && value.inventory.every(validateItemStack)
    && equipmentSlots.every((slot) => validateItemStack(equipment[slot]))
    && isInteger(value.selected, 0, 8)
    && isFiniteNumber(value.health, 0, 10)
    && isFiniteNumber(value.hunger, 0, 10)
    && isFiniteNumber(value.xp, 0, Number.MAX_SAFE_INTEGER)
    && isInteger(value.level, 0, Number.MAX_SAFE_INTEGER)
    && validateSkillState(value.skills);
}

function validateSessionWorldOptions(value: unknown): value is SessionWorldOptions {
  return isRecord(value)
    && ["peaceful", "easy", "normal", "hard"].includes(value.difficulty as string)
    && isFiniteNumber(value.dayLengthMinutes, 5, 120)
    && isFiniteNumber(value.mobDensity, 0, 3)
    && isFiniteNumber(value.butterflyDensity, 0, 4)
    && isFiniteNumber(value.caveFrequency, 0, 3)
    && isFiniteNumber(value.biomeScale, 0.25, 4)
    && isFiniteNumber(value.resourceAbundance, 0.25, 4)
    && typeof value.structures === "boolean"
    && typeof value.weather === "boolean"
    && typeof value.keepInventory === "boolean"
    && typeof value.friendlyFire === "boolean"
    && (value.sleepRule === undefined || ["any-player", "percentage", "all-players"].includes(value.sleepRule as string))
    && (value.sleepPercentage === undefined || isFiniteNumber(value.sleepPercentage, 1, 100))
    && (value.enabledFactions === undefined || (Array.isArray(value.enabledFactions)
      && value.enabledFactions.length <= 6
      && new Set(value.enabledFactions).size === value.enabledFactions.length
      && value.enabledFactions.every((entry) => ["hobbits", "goblins", "atlantians", "sugarcourt", "wood-elves", "dwarves"].includes(entry as string))));
}

export function validatePayload<K extends MultiplayerMessageType>(type: K, value: unknown): value is MultiplayerPayloadMap[K] {
  if (!isRecord(value)) return false;
  switch (type) {
    case "hello":
      return validatePeerIdentity(value.identity) && (value.role === "host" || value.role === "guest");
    case "heartbeat":
      return isId(value.nonce) && typeof value.reply === "boolean";
    case "goodbye":
      return isShortString(value.reason, 160, true);
    case "player-pose":
      return validatePose(value);
    case "block-action":
      return isId(value.requestId)
        && isId(value.actorId)
        && isInteger(value.tick, 0, Number.MAX_SAFE_INTEGER)
        && (value.kind === "break" || value.kind === "place" || value.kind === "batch")
        && Array.isArray(value.edits)
        && value.edits.length >= 1
        && value.edits.length <= 256
        && value.edits.every(validateBlockEdit)
        && validateStatusFields(value);
    case "mob-snapshot":
      return isInteger(value.tick, 0, Number.MAX_SAFE_INTEGER)
        && Array.isArray(value.mobs)
        && value.mobs.length <= 512
        && value.mobs.every(validateMob);
    case "drop-snapshot":
      return isInteger(value.tick, 0, Number.MAX_SAFE_INTEGER)
        && Array.isArray(value.drops)
        && value.drops.length <= 1024
        && value.drops.every(validateDrop);
    case "time-weather":
      return validateTimeWeather(value);
    case "sleep-vote":
      return isId(value.actorId)
        && isInteger(value.tick, 0, Number.MAX_SAFE_INTEGER)
        && (value.target === "morning" || value.target === "night")
        && typeof value.active === "boolean";
    case "inventory-action":
      return isId(value.requestId)
        && isId(value.actorId)
        && ["move", "split", "swap", "collect", "equip", "drop", "craft"].includes(value.kind as string)
        && (value.from === undefined || validateEndpoint(value.from))
        && (value.to === undefined || validateEndpoint(value.to))
        && (value.count === undefined || isInteger(value.count, 1, 65_535))
        && (value.expectedRevision === undefined || isInteger(value.expectedRevision, 0, Number.MAX_SAFE_INTEGER))
        && (value.dropId === undefined || isInteger(value.dropId, 0, Number.MAX_SAFE_INTEGER))
        && validateStatusFields(value);
    case "container-action":
      return isId(value.requestId)
        && isId(value.actorId)
        && isShortString(value.containerId, 96)
        && ["open", "close", "take", "place", "quick-move", "craft", "smelt"].includes(value.kind as string)
        && (value.slot === undefined || isInteger(value.slot, 0, 1023))
        && (value.targetSlot === undefined || isInteger(value.targetSlot, 0, 1023))
        && (value.count === undefined || isInteger(value.count, 1, 65_535))
        && (value.expectedRevision === undefined || isInteger(value.expectedRevision, 0, Number.MAX_SAFE_INTEGER))
        && (value.slots === undefined || (Array.isArray(value.slots) && value.slots.length <= 128 && value.slots.every(validateItemStack)))
        && validateStatusFields(value);
    case "player-state":
      return isId(value.requestId)
        && isId(value.actorId)
        && validatePlayerSessionSnapshot(value.state)
        && value.state.playerId === value.actorId
        && validateStatusFields(value);
    case "combat-action":
      return isId(value.requestId)
        && isId(value.actorId)
        && isInteger(value.tick, 0, Number.MAX_SAFE_INTEGER)
        && (value.targetKind === "mob" || value.targetKind === "player")
        && isShortString(value.targetId, 96)
        && (value.attack === "melee" || value.attack === "ranged")
        && (value.resultingHealth === undefined || isFiniteNumber(value.resultingHealth, 0, 100_000))
        && (value.killed === undefined || typeof value.killed === "boolean")
        && validateStatusFields(value);
    case "map-share": {
      if (!isShortString(value.tableKey, 96) || typeof value.reply !== "boolean" || !isRecord(value.map)) return false;
      const map = value.map;
      return isInteger(map.schema, 1, 10)
        && isShortString(map.worldId, 128)
        && isShortString(map.playerId, 128)
        && isInteger(map.revision, 0, Number.MAX_SAFE_INTEGER)
        && Array.isArray(map.exploredChunks)
        && map.exploredChunks.length <= 4096
        && map.exploredChunks.every((entry) => isShortString(entry, 48))
        && Array.isArray(map.markers)
        && map.markers.length <= 512
        && map.markers.every((entry) => isRecord(entry)
          && isShortString(entry.id, 128)
          && isShortString(entry.name, 160)
          && ["natural-poi", "manual", "wayshrine", "bed-spawn"].includes(entry.kind as string)
          && isRecord(entry.position)
          && isFiniteNumber(entry.position.x, -COORDINATE_LIMIT, COORDINATE_LIMIT)
          && isFiniteNumber(entry.position.y, -COORDINATE_LIMIT, COORDINATE_LIMIT)
          && isFiniteNumber(entry.position.z, -COORDINATE_LIMIT, COORDINATE_LIMIT))
        && (map.activeBedId === null || isShortString(map.activeBedId, 128))
        && isInteger(map.fastTravelCharges, 0, 999);
    }
    case "snapshot":
      return isInteger(value.tick, 0, Number.MAX_SAFE_INTEGER)
        && isShortString(value.seed, 128)
        && isInteger(value.generatorVersion, 1, 1_000_000)
        && Array.isArray(value.players)
        && value.players.length <= 64
        && value.players.every(validatePose)
        && Array.isArray(value.blockEdits)
        && value.blockEdits.length <= 16_384
        && value.blockEdits.every(validateBlockEdit)
        && Array.isArray(value.mobs)
        && value.mobs.length <= 512
        && value.mobs.every(validateMob)
        && Array.isArray(value.drops)
        && value.drops.length <= 1024
        && value.drops.every(validateDrop)
        && (value.boats === undefined || (Array.isArray(value.boats) && value.boats.length <= 128 && value.boats.every(validateSailboat)))
        && validateTimeWeather(value.time)
        && (value.worldOptions === undefined || validateSessionWorldOptions(value.worldOptions))
        && (value.inventory === undefined || validateInventorySnapshot(value.inventory))
        && (value.containers === undefined || (Array.isArray(value.containers) && value.containers.length <= 32 && value.containers.every(validateContainerSnapshot)))
        && (value.playerState === undefined || validatePlayerSessionSnapshot(value.playerState));
    default:
      return false;
  }
}

export function validateEnvelope(value: unknown): value is MultiplayerEnvelope {
  if (!isRecord(value)
    || value.version !== MULTIPLAYER_PROTOCOL_VERSION
    || !isId(value.sessionId)
    || !MESSAGE_TYPES.has(value.type as MultiplayerMessageType)
    || !isInteger(value.sequence, 0, Number.MAX_SAFE_INTEGER)
    || !isFiniteNumber(value.sentAt, 0, Number.MAX_SAFE_INTEGER)
    || !isId(value.from)) return false;
  const type = value.type as MultiplayerMessageType;
  return validatePayload(type, value.payload);
}

function utf8ByteLength(text: string) {
  return new TextEncoder().encode(text).byteLength;
}

export function encodeEnvelope(envelope: MultiplayerEnvelope, maxBytes = MAX_RELIABLE_MESSAGE_BYTES) {
  if (!validateEnvelope(envelope)) throw new MultiplayerProtocolError("Invalid multiplayer envelope");
  const encoded = JSON.stringify(envelope);
  if (utf8ByteLength(encoded) > maxBytes) throw new MultiplayerProtocolError(`Multiplayer message exceeds ${maxBytes} bytes`);
  return encoded;
}

function decodeText(data: unknown, maxBytes: number) {
  if (typeof data === "string") {
    if (utf8ByteLength(data) > maxBytes) throw new MultiplayerProtocolError(`Multiplayer message exceeds ${maxBytes} bytes`);
    return data;
  }
  if (data instanceof ArrayBuffer) {
    if (data.byteLength > maxBytes) throw new MultiplayerProtocolError(`Multiplayer message exceeds ${maxBytes} bytes`);
    return new TextDecoder("utf-8", { fatal: true }).decode(data);
  }
  if (ArrayBuffer.isView(data)) {
    if (data.byteLength > maxBytes) throw new MultiplayerProtocolError(`Multiplayer message exceeds ${maxBytes} bytes`);
    return new TextDecoder("utf-8", { fatal: true }).decode(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
  }
  throw new MultiplayerProtocolError("Unsupported multiplayer message encoding");
}

export function decodeEnvelope(data: unknown, maxBytes = MAX_RELIABLE_MESSAGE_BYTES): MultiplayerEnvelope {
  const text = decodeText(data, maxBytes);
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new MultiplayerProtocolError("Malformed multiplayer JSON"); }
  if (!validateEnvelope(parsed)) throw new MultiplayerProtocolError("Invalid multiplayer envelope");
  return parsed;
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
}

function base64UrlToBytes(value: string) {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) throw new MultiplayerProtocolError("Invite code contains invalid characters");
  const padded = value.replace(/-/gu, "+").replace(/_/gu, "/") + "=".repeat((4 - value.length % 4) % 4);
  let binary: string;
  try { binary = atob(padded); } catch { throw new MultiplayerProtocolError("Invite code is not valid base64url"); }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

export function validateManualSignal(value: unknown): value is ManualSignal {
  if (!isRecord(value)
    || value.version !== MULTIPLAYER_PROTOCOL_VERSION
    || value.protocol !== MULTIPLAYER_PROTOCOL_NAME
    || (value.kind !== "offer" && value.kind !== "answer")
    || !isId(value.sessionId)
    || !isId(value.token)
    || !validatePeerIdentity(value.identity)) return false;
  return validateDescription(value.description, value.kind);
}

export function encodeInviteCode(signal: ManualSignal) {
  if (!validateManualSignal(signal)) throw new MultiplayerProtocolError("Invalid manual WebRTC signal");
  const encoded = `BW1.${bytesToBase64Url(new TextEncoder().encode(JSON.stringify(signal)))}`;
  if (encoded.length > MAX_INVITE_CODE_CHARS) throw new MultiplayerProtocolError("Invite code is too large");
  return encoded;
}

export function decodeInviteCode(code: string): ManualSignal {
  if (typeof code !== "string") throw new MultiplayerProtocolError("Invite code must be text");
  const compact = code.trim().replace(/\s+/gu, "");
  if (compact.length > MAX_INVITE_CODE_CHARS) throw new MultiplayerProtocolError("Invite code is too large");
  if (!compact.startsWith("BW1.")) throw new MultiplayerProtocolError("Invite code has an unsupported version");
  const bytes = base64UrlToBytes(compact.slice(4));
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); } catch { throw new MultiplayerProtocolError("Invite code payload is malformed"); }
  if (!validateManualSignal(parsed)) throw new MultiplayerProtocolError("Invite code payload is invalid");
  return parsed;
}

export function detectMultiplayerSupport(scope: typeof globalThis = globalThis): MultiplayerSupport {
  const secureContext = (scope as typeof globalThis & { isSecureContext?: boolean }).isSecureContext !== false;
  const rtcConstructor = (scope as typeof globalThis & { RTCPeerConnection?: typeof RTCPeerConnection }).RTCPeerConnection;
  const webRTC = typeof rtcConstructor === "function";
  const dataChannels = webRTC && typeof rtcConstructor.prototype?.createDataChannel === "function";
  const textCodec = typeof scope.TextEncoder === "function" && typeof scope.TextDecoder === "function" && typeof scope.btoa === "function" && typeof scope.atob === "function";
  const cryptographicRandom = typeof scope.crypto?.getRandomValues === "function";
  const reasons: string[] = [];
  if (!secureContext) reasons.push("WebRTC multiplayer requires a secure context (HTTPS or localhost).");
  if (!webRTC) reasons.push("RTCPeerConnection is unavailable in this browser.");
  else if (!dataChannels) reasons.push("WebRTC data channels are unavailable in this browser.");
  if (!textCodec) reasons.push("Required text/base64 codecs are unavailable in this browser.");
  if (!cryptographicRandom) reasons.push("Cryptographic random IDs are unavailable in this browser.");
  return { supported: secureContext && webRTC && dataChannels && textCodec && cryptographicRandom, secureContext, webRTC, dataChannels, textCodec, cryptographicRandom, reasons };
}

function defaultRandomId(prefix: string) {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `${prefix}_${bytesToBase64Url(bytes)}`;
}

export function createPeerIdentity(name: string, color: string, idFactory = defaultRandomId, variant?: "male" | "female"): PeerIdentity {
  const identity = { id: idFactory("player"), name, color, ...(variant ? { variant } : {}) };
  if (!validatePeerIdentity(identity)) throw new MultiplayerProtocolError("Invalid peer identity");
  return identity;
}

function copyIdentity(identity: PeerIdentity): PeerIdentity {
  return { id: identity.id, name: identity.name, color: identity.color, ...(identity.variant ? { variant: identity.variant } : {}) };
}

function defaultPeerConnectionFactory(configuration: RTCConfiguration): PeerConnectionLike {
  if (typeof RTCPeerConnection !== "function") throw new MultiplayerProtocolError("WebRTC is unavailable in this browser");
  return new RTCPeerConnection(configuration) as unknown as PeerConnectionLike;
}

function plainDescription(description: RTCSessionDescriptionInit | null, expectedType: "offer" | "answer") {
  if (!description || !validateDescription(description, expectedType)) throw new MultiplayerProtocolError(`Missing local ${expectedType} description`);
  return { type: expectedType, sdp: description.sdp } satisfies RTCSessionDescriptionInit;
}

export class MultiplayerSession {
  readonly identity: PeerIdentity;
  readonly rtcConfiguration: RTCConfiguration;
  role: MultiplayerRole | null = null;
  sessionId: string | null = null;
  state: MultiplayerSessionState = "idle";

  private readonly peerConnectionFactory: PeerConnectionFactory;
  private readonly now: () => number;
  private readonly randomId: (prefix: string) => string;
  private readonly heartbeatIntervalMs: number;
  private readonly peerTimeoutMs: number;
  private readonly connectionTimeoutMs: number;
  private readonly iceGatheringTimeoutMs: number;
  private readonly peers = new Map<string, PeerRecord>();
  private readonly listeners = new Set<MultiplayerListener>();
  private maintenanceTimer: ReturnType<typeof setInterval> | null = null;
  private reliableSequence = 0;
  private movementSequence = 0;
  private disposed = false;

  constructor(options: MultiplayerOptions) {
    if (!validatePeerIdentity(options.identity)) throw new MultiplayerProtocolError("A valid local peer identity is required");
    if (!options.peerConnectionFactory) {
      const support = detectMultiplayerSupport();
      if (!support.supported) throw new MultiplayerProtocolError(support.reasons.join(" "));
    }
    this.identity = copyIdentity(options.identity);
    this.peerConnectionFactory = options.peerConnectionFactory ?? defaultPeerConnectionFactory;
    this.rtcConfiguration = options.rtcConfiguration ?? {
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
      bundlePolicy: "max-bundle",
    };
    this.now = options.now ?? (() => Date.now());
    this.randomId = options.randomId ?? defaultRandomId;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 2_000;
    this.peerTimeoutMs = options.peerTimeoutMs ?? 12_000;
    this.connectionTimeoutMs = options.connectionTimeoutMs ?? 90_000;
    this.iceGatheringTimeoutMs = options.iceGatheringTimeoutMs ?? 12_000;
    if (!isFiniteNumber(this.heartbeatIntervalMs, 250, 60_000)
      || !isFiniteNumber(this.peerTimeoutMs, this.heartbeatIntervalMs * 2, 300_000)
      || !isFiniteNumber(this.connectionTimeoutMs, 5_000, 600_000)
      || !isFiniteNumber(this.iceGatheringTimeoutMs, 500, 60_000)) {
      throw new MultiplayerProtocolError("Invalid multiplayer timeout configuration");
    }
    if (options.onEvent) this.listeners.add(options.onEvent);
    if (options.autoMaintenance !== false) this.startMaintenance();
  }

  subscribe(listener: MultiplayerListener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getPeers() {
    return [...this.peers.values()].map((peer) => this.peerInfo(peer));
  }

  getPeer(peerIdOrToken: string) {
    const peer = this.resolvePeer(peerIdOrToken);
    return peer ? this.peerInfo(peer) : null;
  }

  private emit(event: MultiplayerEvent) {
    for (const listener of this.listeners) {
      try { listener(event); } catch { /* Consumers cannot break transport bookkeeping. */ }
    }
  }

  private emitError(error: unknown, peer?: PeerRecord) {
    const normalized = error instanceof Error ? error : new Error(String(error));
    this.emit({ type: "error", error: normalized, ...(peer ? { peer: this.peerInfo(peer) } : {}) });
  }

  private setState(state: MultiplayerSessionState) {
    if (this.state === state) return;
    const previous = this.state;
    this.state = state;
    this.emit({ type: "state", previous, state });
  }

  private peerInfo(peer: PeerRecord): PeerInfo {
    return {
      token: peer.token,
      identity: peer.identity ? copyIdentity(peer.identity) : null,
      state: peer.state,
      connectedAt: peer.connectedAt,
      lastSeenAt: peer.lastSeenAt,
      latencyMs: peer.latencyMs,
      reliableOpen: peer.reliable?.readyState === "open",
      movementOpen: peer.movement?.readyState === "open",
    };
  }

  private emitPeer(peer: PeerRecord, reason?: string) {
    this.emit({ type: "peer", peer: this.peerInfo(peer), ...(reason ? { reason } : {}) });
  }

  private ensureOpen() {
    if (this.disposed || this.state === "closed") throw new MultiplayerProtocolError("Multiplayer session is closed");
  }

  private checkedId(prefix: string) {
    const value = this.randomId(prefix);
    if (!isId(value)) throw new MultiplayerProtocolError(`Generated ${prefix} ID is invalid`);
    return value;
  }

  private resolvePeer(peerIdOrToken: string) {
    const byToken = this.peers.get(peerIdOrToken);
    if (byToken) return byToken;
    for (const peer of this.peers.values()) if (peer.identity?.id === peerIdOrToken) return peer;
    return undefined;
  }

  private createPeer(token: string, identity: PeerIdentity | null, state: MultiplayerPeerState) {
    const connection = this.peerConnectionFactory(this.rtcConfiguration);
    const now = this.now();
    const peer: PeerRecord = {
      token,
      identity: identity ? copyIdentity(identity) : null,
      connection,
      reliable: null,
      movement: null,
      state,
      createdAt: now,
      connectedAt: null,
      lastSeenAt: now,
      latencyMs: null,
      lastReliableSequence: -1,
      lastMovementSequence: -1,
      protocolStrikes: 0,
      pendingHeartbeatNonce: null,
      pendingHeartbeatAt: 0,
      closed: false,
    };
    this.peers.set(token, peer);
    connection.onconnectionstatechange = () => this.handleConnectionState(peer);
    return peer;
  }

  private handleConnectionState(peer: PeerRecord) {
    if (peer.closed) return;
    const state = peer.connection.connectionState;
    if (state === "failed") { this.closePeer(peer, "connection-failed", "failed"); return; }
    if (state === "closed") { this.closePeer(peer, "connection-closed", "closed"); return; }
    if (state === "disconnected") {
      peer.state = "stale";
      this.emitPeer(peer, "connection-interrupted");
      return;
    }
    if (state === "connected") this.maybeMarkConnected(peer);
  }

  private bindChannel(peer: PeerRecord, channel: DataChannelLike, kind: MultiplayerChannelKind) {
    const expectedLabel = kind === "reliable" ? RELIABLE_CHANNEL_LABEL : MOVEMENT_CHANNEL_LABEL;
    const validOptions = kind === "reliable" ? channel.ordered : !channel.ordered && channel.maxRetransmits === 0;
    if (channel.label !== expectedLabel || !validOptions || (kind === "reliable" ? peer.reliable : peer.movement)) {
      channel.close();
      this.protocolStrike(peer, `Rejected invalid or duplicate ${kind} channel`);
      return;
    }
    channel.binaryType = "arraybuffer";
    if (kind === "reliable") peer.reliable = channel;
    else peer.movement = channel;
    channel.onopen = () => this.maybeMarkConnected(peer);
    channel.onmessage = (event) => this.handleChannelMessage(peer, kind, event.data);
    channel.onerror = () => this.emitError(new Error(`${kind} data channel error`), peer);
    channel.onclose = () => {
      if (!peer.closed) this.closePeer(peer, `${kind}-channel-closed`, "disconnected");
    };
    if (channel.readyState === "open") this.maybeMarkConnected(peer);
  }

  private maybeMarkConnected(peer: PeerRecord) {
    if (peer.closed || !peer.identity || peer.reliable?.readyState !== "open" || peer.movement?.readyState !== "open") return;
    const firstConnection = peer.connectedAt === null;
    peer.state = "connected";
    peer.connectedAt ??= this.now();
    peer.lastSeenAt = this.now();
    if (firstConnection) {
      this.emitPeer(peer, "connected");
      this.sendControl(peer, "hello", { identity: this.identity, role: this.role! });
    }
    this.recalculateSessionState();
  }

  private recalculateSessionState() {
    if (this.disposed) return;
    const connected = [...this.peers.values()].some((peer) => !peer.closed && peer.state === "connected");
    if (connected) this.setState("connected");
    else if (this.role === "host") this.setState("hosting");
    else if (this.role === "guest" && this.peers.size) this.setState("joining");
    else if (this.role === "guest") this.setState("disconnected");
  }

  private async waitForIceGathering(connection: PeerConnectionLike, isCancelled: () => boolean) {
    if (isCancelled()) throw new MultiplayerOperationCancelledError();
    if (connection.iceGatheringState === "complete") return;
    await new Promise<void>((resolve, reject) => {
      let finished = false;
      const finish = (error?: Error) => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        clearInterval(poll);
        connection.onicegatheringstatechange = null;
        if (error) reject(error);
        else resolve();
      };
      const timeout = setTimeout(finish, this.iceGatheringTimeoutMs);
      const check = () => {
        if (isCancelled()) finish(new MultiplayerOperationCancelledError());
        else if (connection.iceGatheringState === "complete") finish();
      };
      const poll = setInterval(check, 25);
      connection.onicegatheringstatechange = check;
      check();
    });
  }

  async createHostInvite() {
    this.ensureOpen();
    if (this.role === "guest") throw new MultiplayerProtocolError("A guest session cannot create host invites");
    if (!this.role) {
      this.role = "host";
      this.sessionId = this.checkedId("session");
      this.setState("hosting");
    }
    const token = this.checkedId("invite");
    if (this.peers.has(token)) throw new MultiplayerProtocolError("Duplicate invite token");
    const peer = this.createPeer(token, null, "invited");
    try {
      this.bindChannel(peer, peer.connection.createDataChannel(RELIABLE_CHANNEL_LABEL, { ordered: true }), "reliable");
      this.bindChannel(peer, peer.connection.createDataChannel(MOVEMENT_CHANNEL_LABEL, { ordered: false, maxRetransmits: 0 }), "movement");
      const offer = await peer.connection.createOffer();
      if (!validateDescription(offer, "offer")) throw new MultiplayerProtocolError("Browser created an invalid WebRTC offer");
      await peer.connection.setLocalDescription(offer);
      await this.waitForIceGathering(peer.connection, () => this.disposed || peer.closed);
      if (this.disposed || peer.closed) throw new MultiplayerOperationCancelledError("Host invite setup was cancelled because the session changed");
      const signal: OfferSignal = {
        version: MULTIPLAYER_PROTOCOL_VERSION,
        protocol: MULTIPLAYER_PROTOCOL_NAME,
        kind: "offer",
        sessionId: this.sessionId!,
        token,
        identity: copyIdentity(this.identity),
        description: plainDescription(peer.connection.localDescription, "offer"),
      };
      this.emitPeer(peer, "invite-created");
      return { token, inviteCode: encodeInviteCode(signal) };
    } catch (error) {
      const normalized = this.disposed || peer.closed || isMultiplayerOperationCancellation(error)
        ? new MultiplayerOperationCancelledError("Host invite setup was cancelled because the session changed")
        : error;
      this.closePeer(peer, "invite-failed", "failed");
      if (!isMultiplayerOperationCancellation(normalized)) this.emitError(normalized, peer);
      throw normalized;
    }
  }

  async createGuestAnswer(inviteCode: string) {
    this.ensureOpen();
    if (this.role || this.peers.size) throw new MultiplayerProtocolError("This session is already hosting or joining");
    const signal = decodeInviteCode(inviteCode);
    if (signal.kind !== "offer") throw new MultiplayerProtocolError("Expected a host offer code");
    if (signal.identity.id === this.identity.id) throw new MultiplayerProtocolError("Cannot join your own multiplayer invite");
    this.role = "guest";
    this.sessionId = signal.sessionId;
    this.setState("joining");
    const peer = this.createPeer(signal.token, signal.identity, "connecting");
    peer.connection.ondatachannel = (event) => {
      const channel = event.channel as unknown as DataChannelLike;
      if (channel.label === RELIABLE_CHANNEL_LABEL) this.bindChannel(peer, channel, "reliable");
      else if (channel.label === MOVEMENT_CHANNEL_LABEL) this.bindChannel(peer, channel, "movement");
      else channel.close();
    };
    try {
      await peer.connection.setRemoteDescription(signal.description);
      const answer = await peer.connection.createAnswer();
      if (!validateDescription(answer, "answer")) throw new MultiplayerProtocolError("Browser created an invalid WebRTC answer");
      await peer.connection.setLocalDescription(answer);
      await this.waitForIceGathering(peer.connection, () => this.disposed || peer.closed);
      if (this.disposed || peer.closed) throw new MultiplayerOperationCancelledError("Guest answer setup was cancelled because the session changed");
      const response: AnswerSignal = {
        version: MULTIPLAYER_PROTOCOL_VERSION,
        protocol: MULTIPLAYER_PROTOCOL_NAME,
        kind: "answer",
        sessionId: signal.sessionId,
        token: signal.token,
        identity: copyIdentity(this.identity),
        description: plainDescription(peer.connection.localDescription, "answer"),
      };
      return { host: copyIdentity(signal.identity), answerCode: encodeInviteCode(response) };
    } catch (error) {
      const normalized = this.disposed || peer.closed || isMultiplayerOperationCancellation(error)
        ? new MultiplayerOperationCancelledError("Guest answer setup was cancelled because the session changed")
        : error;
      this.closePeer(peer, "join-failed", "failed");
      if (!isMultiplayerOperationCancellation(normalized)) {
        this.setState("error");
        this.emitError(normalized, peer);
      }
      throw normalized;
    }
  }

  async acceptGuestAnswer(answerCode: string) {
    this.ensureOpen();
    if (this.role !== "host" || !this.sessionId) throw new MultiplayerProtocolError("Only an active host can accept guest answers");
    const signal = decodeInviteCode(answerCode);
    if (signal.kind !== "answer") throw new MultiplayerProtocolError("Expected a guest answer code");
    if (signal.sessionId !== this.sessionId) throw new MultiplayerProtocolError("Answer belongs to a different session");
    const peer = this.peers.get(signal.token);
    if (!peer || peer.closed || peer.identity) throw new MultiplayerProtocolError("Answer token is unknown or already used");
    if (signal.identity.id === this.identity.id) throw new MultiplayerProtocolError("Host and guest identities must be different");
    for (const existing of this.peers.values()) {
      if (!existing.closed && existing !== peer && existing.identity?.id === signal.identity.id) throw new MultiplayerProtocolError("That guest identity is already connected");
    }
    peer.identity = copyIdentity(signal.identity);
    peer.state = "connecting";
    try {
      await peer.connection.setRemoteDescription(signal.description);
      this.emitPeer(peer, "answer-accepted");
      this.maybeMarkConnected(peer);
      return this.peerInfo(peer);
    } catch (error) {
      this.closePeer(peer, "answer-failed", "failed");
      this.emitError(error, peer);
      throw error;
    }
  }

  cancelInvite(token: string) {
    this.ensureOpen();
    if (this.role !== "host") return false;
    const peer = this.peers.get(token);
    if (!peer || peer.identity || peer.closed) return false;
    this.closePeer(peer, "invite-cancelled", "closed");
    return true;
  }

  private nextSequence(kind: MultiplayerChannelKind) {
    if (kind === "reliable") {
      if (this.reliableSequence >= Number.MAX_SAFE_INTEGER) throw new MultiplayerProtocolError("Reliable sequence space exhausted");
      return this.reliableSequence++;
    }
    if (this.movementSequence >= Number.MAX_SAFE_INTEGER) throw new MultiplayerProtocolError("Movement sequence space exhausted");
    return this.movementSequence++;
  }

  private makeEnvelope<K extends MultiplayerMessageType>(type: K, payload: MultiplayerPayloadMap[K], kind: MultiplayerChannelKind): MultiplayerEnvelope<K> {
    if (!this.sessionId) throw new MultiplayerProtocolError("Multiplayer session has no session ID");
    const envelope: MultiplayerEnvelope<K> = {
      version: MULTIPLAYER_PROTOCOL_VERSION,
      sessionId: this.sessionId,
      type,
      sequence: this.nextSequence(kind),
      sentAt: this.now(),
      from: this.identity.id,
      payload,
    };
    if (!validateEnvelope(envelope)) throw new MultiplayerProtocolError(`Invalid ${type} payload`);
    return envelope;
  }

  private sendEncoded(peer: PeerRecord, kind: MultiplayerChannelKind, encoded: string) {
    if (peer.closed || peer.state !== "connected") return false;
    const channel = kind === "reliable" ? peer.reliable : peer.movement;
    if (!channel || channel.readyState !== "open") return false;
    const bufferedLimit = kind === "reliable" ? MAX_RELIABLE_BUFFERED_BYTES : MAX_MOVEMENT_BUFFERED_BYTES;
    if (channel.bufferedAmount > bufferedLimit) {
      if (kind === "reliable") this.emitError(new Error("Reliable multiplayer channel is backpressured"), peer);
      return false;
    }
    try {
      channel.send(encoded);
      return true;
    } catch (error) {
      this.emitError(error, peer);
      return false;
    }
  }

  private sendControl<K extends "hello" | "heartbeat" | "goodbye">(peer: PeerRecord, type: K, payload: MultiplayerPayloadMap[K]) {
    if (!this.sessionId || !peer.reliable || peer.reliable.readyState !== "open") return false;
    const envelope = this.makeEnvelope(type, payload, "reliable") as MultiplayerEnvelope;
    const encoded = encodeEnvelope(envelope, MAX_RELIABLE_MESSAGE_BYTES);
    return this.sendEncoded(peer, "reliable", encoded);
  }

  send<K extends Exclude<MultiplayerMessageType, "hello" | "heartbeat" | "goodbye">>(type: K, payload: MultiplayerPayloadMap[K], peerId?: string) {
    this.ensureOpen();
    if (!this.role || !this.sessionId) throw new MultiplayerProtocolError("Multiplayer session is not active");
    if (!validatePayload(type, payload)) throw new MultiplayerProtocolError(`Invalid ${type} payload`);
    if (this.role === "guest" && !GUEST_OUTBOUND_TYPES.has(type)) throw new MultiplayerProtocolError(`Guests cannot authoritatively send ${type}`);
    if (this.role === "guest") {
      const actorId = "actorId" in payload ? payload.actorId : "playerId" in payload ? payload.playerId : undefined;
      if (actorId && actorId !== this.identity.id) throw new MultiplayerProtocolError("Guest actions must use the local peer identity");
      if ("status" in payload && payload.status !== undefined && payload.status !== "request") throw new MultiplayerProtocolError("Guests can only send action requests");
    }
    const kind: MultiplayerChannelKind = type === "player-pose" ? "movement" : "reliable";
    const recipients: PeerRecord[] = [];
    if (this.role === "host") {
      if (peerId) {
        const peer = this.resolvePeer(peerId);
        if (!peer) throw new MultiplayerProtocolError("Unknown multiplayer peer");
        recipients.push(peer);
      } else {
        for (const peer of this.peers.values()) if (peer.state === "connected") recipients.push(peer);
      }
    } else {
      const peer = [...this.peers.values()][0];
      if (!peer) throw new MultiplayerProtocolError("Host peer is unavailable");
      if (peerId && peer.identity?.id !== peerId && peer.token !== peerId) throw new MultiplayerProtocolError("A guest can only send to its host");
      recipients.push(peer);
    }
    if (!recipients.length) return 0;
    const envelope = this.makeEnvelope(type, payload, kind) as MultiplayerEnvelope;
    const encoded = encodeEnvelope(envelope, kind === "movement" ? MAX_MOVEMENT_MESSAGE_BYTES : MAX_RELIABLE_MESSAGE_BYTES);
    let sent = 0;
    for (const peer of recipients) if (this.sendEncoded(peer, kind, encoded)) sent += 1;
    return sent;
  }

  sendSnapshot(payload: WorldSnapshot, peerId?: string) { return this.send("snapshot", payload, peerId); }
  sendPlayerPose(payload: PlayerPose, peerId?: string) { return this.send("player-pose", payload, peerId); }
  sendBlockAction(payload: BlockAction, peerId?: string) { return this.send("block-action", payload, peerId); }
  sendMobSnapshot(payload: MobSnapshot, peerId?: string) { return this.send("mob-snapshot", payload, peerId); }
  sendDropSnapshot(payload: DropSnapshot, peerId?: string) { return this.send("drop-snapshot", payload, peerId); }
  sendTimeWeather(payload: TimeWeatherSnapshot, peerId?: string) { return this.send("time-weather", payload, peerId); }
  sendSleepVote(payload: SleepVote, peerId?: string) { return this.send("sleep-vote", payload, peerId); }
  sendInventoryAction(payload: InventoryAction, peerId?: string) { return this.send("inventory-action", payload, peerId); }
  sendContainerAction(payload: ContainerAction, peerId?: string) { return this.send("container-action", payload, peerId); }
  sendPlayerState(payload: PlayerStateAction, peerId?: string) { return this.send("player-state", payload, peerId); }
  sendCombatAction(payload: CombatAction, peerId?: string) { return this.send("combat-action", payload, peerId); }
  sendMapShare(payload: CartographyMapShare, peerId?: string) { return this.send("map-share", payload, peerId); }

  private protocolStrike(peer: PeerRecord, message: string) {
    if (peer.closed) return;
    peer.protocolStrikes += 1;
    this.emitError(new MultiplayerProtocolError(message), peer);
    if (peer.protocolStrikes >= MAX_PROTOCOL_STRIKES) this.closePeer(peer, "protocol-violation", "failed");
  }

  private incomingTypeAllowed(type: MultiplayerMessageType) {
    if (CONTROL_TYPES.has(type)) return true;
    return this.role === "host" ? GUEST_OUTBOUND_TYPES.has(type) : true;
  }

  private validateActorOwnership(peer: PeerRecord, envelope: MultiplayerEnvelope) {
    if (this.role !== "host" || !peer.identity) return true;
    const payload = envelope.payload as unknown;
    if (!isRecord(payload)) return false;
    if (envelope.type === "player-pose") return payload.playerId === peer.identity.id;
    if (envelope.type === "block-action" || envelope.type === "inventory-action" || envelope.type === "container-action" || envelope.type === "player-state" || envelope.type === "combat-action") {
      return payload.actorId === peer.identity.id && (payload.status === undefined || payload.status === "request");
    }
    if (envelope.type === "sleep-vote") return payload.actorId === peer.identity.id;
    return true;
  }

  private handleChannelMessage(peer: PeerRecord, kind: MultiplayerChannelKind, data: unknown) {
    if (peer.closed) return;
    let envelope: MultiplayerEnvelope;
    try {
      envelope = decodeEnvelope(data, kind === "movement" ? MAX_MOVEMENT_MESSAGE_BYTES : MAX_RELIABLE_MESSAGE_BYTES);
    } catch (error) {
      this.protocolStrike(peer, error instanceof Error ? error.message : "Invalid multiplayer message");
      return;
    }
    const expectedKind: MultiplayerChannelKind = envelope.type === "player-pose" ? "movement" : "reliable";
    if (expectedKind !== kind) { this.protocolStrike(peer, `${envelope.type} arrived on the wrong channel`); return; }
    if (envelope.sessionId !== this.sessionId || envelope.from !== peer.identity?.id) {
      this.protocolStrike(peer, "Message identity or session mismatch");
      return;
    }
    if (!this.incomingTypeAllowed(envelope.type)) {
      this.protocolStrike(peer, `Remote role is not allowed to send ${envelope.type}`);
      return;
    }
    if (!this.validateActorOwnership(peer, envelope)) {
      this.protocolStrike(peer, "Guest action attempted to impersonate another player");
      return;
    }
    const lastSequence = kind === "reliable" ? peer.lastReliableSequence : peer.lastMovementSequence;
    if (envelope.sequence <= lastSequence) return;
    if (kind === "reliable") peer.lastReliableSequence = envelope.sequence;
    else peer.lastMovementSequence = envelope.sequence;
    peer.lastSeenAt = this.now();
    peer.protocolStrikes = Math.max(0, peer.protocolStrikes - 1);

    if (envelope.type === "hello") {
      const hello = envelope.payload as MultiplayerPayloadMap["hello"];
      const expectedRole: MultiplayerRole = this.role === "host" ? "guest" : "host";
      if (hello.role !== expectedRole || hello.identity.id !== peer.identity.id || hello.identity.name !== peer.identity.name || hello.identity.color.toLowerCase() !== peer.identity.color.toLowerCase() || hello.identity.variant !== peer.identity.variant) {
        this.protocolStrike(peer, "Peer hello does not match the manual invite identity");
        return;
      }
      this.emitPeer(peer, "hello-verified");
      return;
    }
    if (envelope.type === "heartbeat") {
      const heartbeat = envelope.payload as MultiplayerPayloadMap["heartbeat"];
      if (heartbeat.reply) {
        if (peer.pendingHeartbeatNonce === heartbeat.nonce) {
          peer.latencyMs = Math.max(0, this.now() - peer.pendingHeartbeatAt);
          peer.pendingHeartbeatNonce = null;
          this.emitPeer(peer, "heartbeat");
        }
      } else {
        this.sendControl(peer, "heartbeat", { nonce: heartbeat.nonce, reply: true });
      }
      return;
    }
    if (envelope.type === "goodbye") {
      this.closePeer(peer, (envelope.payload as MultiplayerPayloadMap["goodbye"]).reason || "remote-disconnect", "disconnected");
      return;
    }
    this.emit({ type: "message", peer: this.peerInfo(peer), channel: kind, envelope });
  }

  startMaintenance() {
    this.ensureOpen();
    if (this.maintenanceTimer !== null) return;
    const interval = Math.max(250, Math.min(this.heartbeatIntervalMs, Math.floor(this.peerTimeoutMs / 3)));
    this.maintenanceTimer = setInterval(() => this.maintenanceTick(), interval);
  }

  stopMaintenance() {
    if (this.maintenanceTimer === null) return;
    clearInterval(this.maintenanceTimer);
    this.maintenanceTimer = null;
  }

  maintenanceTick(at = this.now()) {
    if (this.disposed) return;
    for (const peer of [...this.peers.values()]) {
      if (peer.closed) continue;
      if (peer.state !== "connected") {
        if (at - peer.createdAt > this.connectionTimeoutMs) this.closePeer(peer, "connection-timeout", "failed");
        continue;
      }
      if (at - peer.lastSeenAt > this.peerTimeoutMs) {
        this.closePeer(peer, "heartbeat-timeout", "failed");
        continue;
      }
      if (!peer.pendingHeartbeatNonce && at - peer.lastSeenAt >= this.heartbeatIntervalMs) {
        const nonce = this.checkedId("ping");
        peer.pendingHeartbeatNonce = nonce;
        peer.pendingHeartbeatAt = at;
        if (!this.sendControl(peer, "heartbeat", { nonce, reply: false })) peer.pendingHeartbeatNonce = null;
      }
    }
  }

  disconnectPeer(peerIdOrToken: string, reason = "host-disconnect") {
    this.ensureOpen();
    const peer = this.resolvePeer(peerIdOrToken);
    if (!peer) return false;
    this.sendControl(peer, "goodbye", { reason: isShortString(reason, 160, true) ? reason : "disconnect" });
    this.closePeer(peer, reason, "disconnected");
    return true;
  }

  disconnect(reason = "local-disconnect") {
    if (this.disposed) return;
    for (const peer of [...this.peers.values()]) {
      this.sendControl(peer, "goodbye", { reason: isShortString(reason, 160, true) ? reason : "disconnect" });
      this.closePeer(peer, reason, "disconnected");
    }
    if (this.role === "guest") this.setState("disconnected");
    else if (this.role === "host") this.setState("hosting");
  }

  private closePeer(peer: PeerRecord, reason: string, state: MultiplayerPeerState) {
    if (peer.closed) return;
    peer.closed = true;
    peer.state = state;
    if (peer.reliable) peer.reliable.onopen = peer.reliable.onclose = peer.reliable.onerror = peer.reliable.onmessage = null;
    if (peer.movement) peer.movement.onopen = peer.movement.onclose = peer.movement.onerror = peer.movement.onmessage = null;
    peer.connection.onconnectionstatechange = null;
    peer.connection.ondatachannel = null;
    peer.connection.onicegatheringstatechange = null;
    try { peer.reliable?.close(); } catch { /* Already closed. */ }
    try { peer.movement?.close(); } catch { /* Already closed. */ }
    try { peer.connection.close(); } catch { /* Already closed. */ }
    this.peers.delete(peer.token);
    this.emitPeer(peer, reason);
    this.recalculateSessionState();
  }

  dispose(reason = "session-disposed") {
    if (this.disposed) return;
    this.stopMaintenance();
    this.disposed = true;
    for (const peer of [...this.peers.values()]) {
      this.sendControl(peer, "goodbye", { reason: isShortString(reason, 160, true) ? reason : "session-disposed" });
      this.closePeer(peer, reason, "closed");
    }
    this.setState("closed");
    this.listeners.clear();
  }
}
