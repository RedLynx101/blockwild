export const MAP_SCHEMA = 1 as const;
export const CARTOGRAPHY_SCHEMA = 1 as const;
export const MAP_CHUNK_SIZE = 16;
export const MAX_EXPLORED_CHUNKS = 262_144;
export const MAX_MAP_MARKERS = 4_096;
export const MAX_FAST_TRAVEL_CHARGES = 999;
export const FAST_TRAVEL_CHANNEL_SECONDS = 5;
export const FAST_TRAVEL_STILL_RADIUS = 0.12;
export const WAYSHRINE_USE_RADIUS = 3.5;

export type WorldPoint = Readonly<{ x: number; y: number; z: number }>;
export type ChunkCoordinate = Readonly<{ x: number; z: number }>;
export type MapMarkerKind = "natural-poi" | "manual" | "bed-spawn" | "wayshrine";

export type MapMarker = Readonly<{
  id: string;
  kind: MapMarkerKind;
  name: string;
  position: WorldPoint;
  discoveredAt: number;
  updatedAt: number;
  discoveredBy: string;
  ownerId: string | null;
  icon: string | null;
}>;

export type MapKnowledge = Readonly<{
  schema: typeof MAP_SCHEMA;
  worldId: string;
  playerId: string;
  revision: number;
  exploredChunks: readonly string[];
  markers: readonly MapMarker[];
  activeBedId: string | null;
  fastTravelCharges: number;
}>;

export type MarkerInput = Readonly<{
  id: string;
  name: string;
  position: WorldPoint;
  playerId: string;
  discoveredAt: number;
  icon?: string | null;
}>;

export type CartographySession = Readonly<{
  schema: typeof CARTOGRAPHY_SCHEMA;
  tableId: string;
  participants: readonly string[];
  revision: number;
}>;

export type FastTravelMode = "map-charge" | "wayshrine-network";
export type FastTravelChannelStatus = "channeling" | "completed" | "cancelled";

export type FastTravelChannel = Readonly<{
  id: string;
  mode: FastTravelMode;
  destinationId: string;
  destination: WorldPoint;
  originWayshrineId: string | null;
  origin: WorldPoint;
  startedAt: number;
  durationSeconds: typeof FAST_TRAVEL_CHANNEL_SECONDS;
  damageRevision: number;
  status: FastTravelChannelStatus;
  cancelledReason: "moved" | "damaged" | null;
}>;

const finite = (value: unknown, fallback = 0) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const integer = (value: unknown, fallback = 0) => Math.trunc(finite(value, fallback));
const clamp = (value: number, minimum: number, maximum: number) => Math.max(minimum, Math.min(maximum, value));
const cleanId = (value: unknown, fallback: string) => {
  const cleaned = typeof value === "string" ? value.trim().replace(/[^a-zA-Z0-9:_-]+/gu, "-").slice(0, 96) : "";
  return cleaned || fallback;
};
const cleanName = (value: unknown, fallback: string) => {
  const cleaned = typeof value === "string" ? value.trim().replace(/\s+/gu, " ").slice(0, 48) : "";
  return cleaned || fallback;
};
const cleanPoint = (value: Partial<WorldPoint> | null | undefined): WorldPoint => ({
  x: finite(value?.x),
  y: finite(value?.y),
  z: finite(value?.z),
});
const distanceSquared = (left: WorldPoint, right: WorldPoint) => (
  (left.x - right.x) ** 2 + (left.y - right.y) ** 2 + (left.z - right.z) ** 2
);

export function chunkKey(chunk: ChunkCoordinate) {
  return `${integer(chunk.x)},${integer(chunk.z)}`;
}

export function parseChunkKey(key: string): ChunkCoordinate | null {
  const match = /^(-?\d+),(-?\d+)$/u.exec(key);
  if (!match) return null;
  return { x: Number(match[1]), z: Number(match[2]) };
}

export function chunkAtWorldPosition(position: Pick<WorldPoint, "x" | "z">, chunkSize = MAP_CHUNK_SIZE): ChunkCoordinate {
  const size = Math.max(1, integer(chunkSize, MAP_CHUNK_SIZE));
  return { x: Math.floor(finite(position.x) / size), z: Math.floor(finite(position.z) / size) };
}

export function createMapKnowledge(worldId: string, playerId: string): MapKnowledge {
  return {
    schema: MAP_SCHEMA,
    worldId: cleanId(worldId, "world"),
    playerId: cleanId(playerId, "player"),
    revision: 0,
    exploredChunks: [],
    markers: [],
    activeBedId: null,
    fastTravelCharges: 0,
  };
}

function normalizeMarker(value: unknown): MapMarker | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Partial<MapMarker>;
  if (!(input.kind === "natural-poi" || input.kind === "manual" || input.kind === "bed-spawn" || input.kind === "wayshrine")) return null;
  const id = cleanId(input.id, "");
  if (!id) return null;
  return {
    id,
    kind: input.kind,
    name: cleanName(input.name, input.kind === "bed-spawn" ? "Bed Spawn" : "Map Marker"),
    position: cleanPoint(input.position),
    discoveredAt: Math.max(0, integer(input.discoveredAt)),
    updatedAt: Math.max(0, integer(input.updatedAt, integer(input.discoveredAt))),
    discoveredBy: cleanId(input.discoveredBy, "unknown"),
    ownerId: input.ownerId === null ? null : cleanId(input.ownerId, "unknown"),
    icon: typeof input.icon === "string" ? input.icon.slice(0, 48) : null,
  };
}

export function normalizeMapKnowledge(value: unknown, fallbackWorldId = "world", fallbackPlayerId = "player"): MapKnowledge {
  if (!value || typeof value !== "object") return createMapKnowledge(fallbackWorldId, fallbackPlayerId);
  const input = value as Partial<MapKnowledge>;
  const exploredChunks = [...new Set((Array.isArray(input.exploredChunks) ? input.exploredChunks : [])
    .filter((entry): entry is string => typeof entry === "string" && parseChunkKey(entry) !== null))]
    .sort()
    .slice(0, MAX_EXPLORED_CHUNKS);
  const markerById = new Map<string, MapMarker>();
  for (const raw of Array.isArray(input.markers) ? input.markers : []) {
    const marker = normalizeMarker(raw);
    if (!marker) continue;
    const previous = markerById.get(marker.id);
    if (!previous || compareMarkerFreshness(marker, previous) > 0) markerById.set(marker.id, marker);
    if (markerById.size >= MAX_MAP_MARKERS) break;
  }
  const markers = [...markerById.values()].sort((left, right) => left.id.localeCompare(right.id));
  const activeBedId = typeof input.activeBedId === "string"
    && markers.some((marker) => marker.id === input.activeBedId && marker.kind === "bed-spawn")
    ? input.activeBedId
    : null;
  return {
    schema: MAP_SCHEMA,
    worldId: cleanId(input.worldId, cleanId(fallbackWorldId, "world")),
    playerId: cleanId(input.playerId, cleanId(fallbackPlayerId, "player")),
    revision: Math.max(0, integer(input.revision)),
    exploredChunks,
    markers,
    activeBedId,
    fastTravelCharges: clamp(integer(input.fastTravelCharges), 0, MAX_FAST_TRAVEL_CHARGES),
  };
}

/** Call once when a chunk becomes renderable; repeated renders are idempotent. */
export function markChunkRendered(state: MapKnowledge, chunk: ChunkCoordinate): MapKnowledge {
  return markChunksRendered(state, [chunk]);
}

/** Batches a render-distance ring into one normalization and one stable sort. */
export function markChunksRendered(state: MapKnowledge, chunks: readonly ChunkCoordinate[]): MapKnowledge {
  if (!chunks.length || state.exploredChunks.length >= MAX_EXPLORED_CHUNKS) return state;
  const explored = new Set(state.exploredChunks);
  const before = explored.size;
  for (const chunk of chunks) {
    if (explored.size >= MAX_EXPLORED_CHUNKS) break;
    explored.add(chunkKey(chunk));
  }
  return explored.size === before ? state : { ...state, revision: state.revision + 1, exploredChunks: [...explored].sort() };
}

export function markWorldPositionRendered(state: MapKnowledge, position: Pick<WorldPoint, "x" | "z">, chunkSize = MAP_CHUNK_SIZE) {
  return markChunkRendered(state, chunkAtWorldPosition(position, chunkSize));
}

function compareMarkerFreshness(left: MapMarker, right: MapMarker) {
  if (left.updatedAt !== right.updatedAt) return left.updatedAt - right.updatedAt;
  const leftStable = `${left.kind}|${left.name}|${left.position.x},${left.position.y},${left.position.z}|${left.discoveredBy}`;
  const rightStable = `${right.kind}|${right.name}|${right.position.x},${right.position.y},${right.position.z}|${right.discoveredBy}`;
  return leftStable.localeCompare(rightStable);
}

function upsertMarker(state: MapKnowledge, marker: MapMarker): MapKnowledge {
  const normalized = normalizeMapKnowledge(state, state.worldId, state.playerId);
  const existing = normalized.markers.find((entry) => entry.id === marker.id);
  if (existing && compareMarkerFreshness(marker, existing) <= 0) return normalized;
  if (!existing && normalized.markers.length >= MAX_MAP_MARKERS) return normalized;
  const markers = [...normalized.markers.filter((entry) => entry.id !== marker.id), marker]
    .sort((left, right) => left.id.localeCompare(right.id));
  return { ...normalized, revision: normalized.revision + 1, markers };
}

function markerFromInput(kind: MapMarkerKind, input: MarkerInput, ownerId: string | null): MapMarker {
  const discoveredAt = Math.max(0, integer(input.discoveredAt));
  return {
    id: cleanId(input.id, `${kind}-marker`),
    kind,
    name: cleanName(input.name, kind === "bed-spawn" ? "Bed Spawn" : kind === "wayshrine" ? "Wayshrine" : "Map Marker"),
    position: cleanPoint(input.position),
    discoveredAt,
    updatedAt: discoveredAt,
    discoveredBy: cleanId(input.playerId, "player"),
    ownerId,
    icon: typeof input.icon === "string" ? input.icon.slice(0, 48) : null,
  };
}

export function discoverNaturalPoi(state: MapKnowledge, input: MarkerInput) {
  return upsertMarker(state, markerFromInput("natural-poi", input, null));
}

export function placeManualMapMarker(state: MapKnowledge, input: MarkerInput) {
  return upsertMarker(state, markerFromInput("manual", input, cleanId(input.playerId, state.playerId)));
}

export function placeWayshrine(state: MapKnowledge, input: MarkerInput) {
  return upsertMarker(state, markerFromInput("wayshrine", input, cleanId(input.playerId, state.playerId)));
}

export function setBedSpawn(state: MapKnowledge, input: MarkerInput): MapKnowledge {
  const normalized = normalizeMapKnowledge(state, state.worldId, state.playerId);
  const marker = markerFromInput("bed-spawn", input, normalized.playerId);
  const withoutOldBed = normalized.markers.filter((entry) => entry.id !== normalized.activeBedId && entry.id !== marker.id);
  const markers = [...withoutOldBed, marker].sort((left, right) => left.id.localeCompare(right.id));
  return { ...normalized, revision: normalized.revision + 1, markers, activeBedId: marker.id };
}

export function clearBedSpawn(state: MapKnowledge) {
  const normalized = normalizeMapKnowledge(state, state.worldId, state.playerId);
  if (!normalized.activeBedId) return normalized;
  return {
    ...normalized,
    revision: normalized.revision + 1,
    markers: normalized.markers.filter((marker) => marker.id !== normalized.activeBedId),
    activeBedId: null,
  };
}

export function renameWayshrine(state: MapKnowledge, markerId: string, name: string, updatedAt: number) {
  const normalized = normalizeMapKnowledge(state, state.worldId, state.playerId);
  const marker = normalized.markers.find((entry) => entry.id === markerId);
  if (!marker || marker.kind !== "wayshrine") return normalized;
  return upsertMarker(normalized, { ...marker, name: cleanName(name, marker.name), updatedAt: Math.max(marker.updatedAt + 1, integer(updatedAt)) });
}

export function removeManualMapMarker(state: MapKnowledge, markerId: string) {
  const normalized = normalizeMapKnowledge(state, state.worldId, state.playerId);
  const marker = normalized.markers.find((entry) => entry.id === markerId);
  if (!marker || marker.kind !== "manual") return normalized;
  return { ...normalized, revision: normalized.revision + 1, markers: normalized.markers.filter((entry) => entry.id !== markerId) };
}

export function bankFastTravelCharges(state: MapKnowledge, amount = 1) {
  const normalized = normalizeMapKnowledge(state, state.worldId, state.playerId);
  const fastTravelCharges = clamp(normalized.fastTravelCharges + integer(amount), 0, MAX_FAST_TRAVEL_CHARGES);
  return fastTravelCharges === normalized.fastTravelCharges ? normalized : { ...normalized, revision: normalized.revision + 1, fastTravelCharges };
}

export function createCartographySession(tableId: string, firstPlayerId: string): CartographySession {
  return {
    schema: CARTOGRAPHY_SCHEMA,
    tableId: cleanId(tableId, "cartography-table"),
    participants: [cleanId(firstPlayerId, "player")],
    revision: 0,
  };
}

export function joinCartographySession(session: CartographySession, playerId: string) {
  const id = cleanId(playerId, "player");
  if (session.participants.includes(id)) return { session, joined: true, reason: null } as const;
  if (session.participants.length >= 2) return { session, joined: false, reason: "table-full" } as const;
  return { session: { ...session, participants: [...session.participants, id], revision: session.revision + 1 }, joined: true, reason: null } as const;
}

export function leaveCartographySession(session: CartographySession, playerId: string): CartographySession {
  const participants = session.participants.filter((entry) => entry !== playerId);
  return participants.length === session.participants.length ? session : { ...session, participants, revision: session.revision + 1 };
}

function mergeTransferredKnowledge(local: MapKnowledge, remote: MapKnowledge): MapKnowledge {
  if (local.worldId !== remote.worldId) return local;
  const exploredChunks = [...new Set([...local.exploredChunks, ...remote.exploredChunks])].sort().slice(0, MAX_EXPLORED_CHUNKS);
  const markerById = new Map(local.markers.map((marker) => [marker.id, marker]));
  for (const remoteMarker of remote.markers) {
    if (remoteMarker.kind === "bed-spawn") continue;
    const existing = markerById.get(remoteMarker.id);
    if (!existing || compareMarkerFreshness(remoteMarker, existing) > 0) markerById.set(remoteMarker.id, remoteMarker);
  }
  const markers = [...markerById.values()].sort((left, right) => left.id.localeCompare(right.id)).slice(0, MAX_MAP_MARKERS);
  const changed = exploredChunks.length !== local.exploredChunks.length
    || markers.length !== local.markers.length
    || exploredChunks.some((entry, index) => entry !== local.exploredChunks[index])
    || markers.some((entry, index) => entry !== local.markers[index]);
  return changed ? { ...local, revision: local.revision + 1, exploredChunks, markers } : local;
}

/**
 * A table has exactly two seats. Both maps receive the same transferable
 * exploration/marker union in one atomic operation; personal beds and potion
 * charges never leak to the other player.
 */
export function shareMapsAtCartographyTable(
  session: CartographySession,
  leftPlayerId: string,
  left: MapKnowledge,
  rightPlayerId: string,
  right: MapKnowledge,
) {
  const seated = session.participants.length === 2
    && session.participants.includes(leftPlayerId)
    && session.participants.includes(rightPlayerId)
    && leftPlayerId !== rightPlayerId;
  if (!seated) return { ok: false, reason: "both-players-must-be-seated", left, right } as const;
  if (left.worldId !== right.worldId) return { ok: false, reason: "different-worlds", left, right } as const;
  const nextLeft = mergeTransferredKnowledge(left, right);
  const nextRight = mergeTransferredKnowledge(right, left);
  return { ok: true, reason: null, left: nextLeft, right: nextRight } as const;
}

export function fastTravelDestination(state: MapKnowledge, markerId: string) {
  const marker = state.markers.find((entry) => entry.id === markerId);
  if (!marker) return null;
  if (marker.kind === "manual") return null;
  if (marker.kind === "bed-spawn" && marker.id !== state.activeBedId) return null;
  return marker;
}

export function beginFastTravel(
  state: MapKnowledge,
  request: Readonly<{ id: string; mode: FastTravelMode; destinationId: string; originWayshrineId?: string | null }>,
  currentPosition: WorldPoint,
  startedAt: number,
  damageRevision: number,
) {
  const normalized = normalizeMapKnowledge(state, state.worldId, state.playerId);
  const destination = fastTravelDestination(normalized, request.destinationId);
  if (!destination) return { ok: false, reason: "illegal-destination" } as const;
  const origin = cleanPoint(currentPosition);
  let originWayshrineId: string | null = null;
  if (request.mode === "map-charge") {
    if (normalized.fastTravelCharges < 1) return { ok: false, reason: "no-banked-travel" } as const;
  } else {
    const originShrine = normalized.markers.find((marker) => marker.id === request.originWayshrineId && marker.kind === "wayshrine");
    if (!originShrine || destination.kind !== "wayshrine" || distanceSquared(origin, originShrine.position) > WAYSHRINE_USE_RADIUS ** 2) {
      return { ok: false, reason: "wayshrine-network-unavailable" } as const;
    }
    originWayshrineId = originShrine.id;
  }
  const channel: FastTravelChannel = {
    id: cleanId(request.id, `travel-${request.destinationId}`),
    mode: request.mode,
    destinationId: destination.id,
    destination: destination.position,
    originWayshrineId,
    origin,
    startedAt: Math.max(0, finite(startedAt)),
    durationSeconds: FAST_TRAVEL_CHANNEL_SECONDS,
    damageRevision: Math.max(0, integer(damageRevision)),
    status: "channeling",
    cancelledReason: null,
  };
  return { ok: true, channel } as const;
}

export function advanceFastTravelChannel(
  channel: FastTravelChannel,
  currentPosition: WorldPoint,
  now: number,
  damageRevision: number,
): FastTravelChannel {
  if (channel.status !== "channeling") return channel;
  if (integer(damageRevision) !== channel.damageRevision) return { ...channel, status: "cancelled", cancelledReason: "damaged" };
  if (distanceSquared(cleanPoint(currentPosition), channel.origin) > FAST_TRAVEL_STILL_RADIUS ** 2) {
    return { ...channel, status: "cancelled", cancelledReason: "moved" };
  }
  if (finite(now) - channel.startedAt >= channel.durationSeconds) return { ...channel, status: "completed" };
  return channel;
}

export function commitFastTravel(state: MapKnowledge, channel: FastTravelChannel) {
  const normalized = normalizeMapKnowledge(state, state.worldId, state.playerId);
  if (channel.status !== "completed") return { ok: false, reason: "channel-incomplete", state: normalized } as const;
  const destination = fastTravelDestination(normalized, channel.destinationId);
  if (!destination) return { ok: false, reason: "destination-lost", state: normalized } as const;
  if (channel.mode === "wayshrine-network") {
    const origin = normalized.markers.find((marker) => marker.id === channel.originWayshrineId && marker.kind === "wayshrine");
    if (!origin || destination.kind !== "wayshrine") return { ok: false, reason: "wayshrine-network-lost", state: normalized } as const;
    return { ok: true, state: normalized, position: destination.position, chargeSpent: 0 } as const;
  }
  if (normalized.fastTravelCharges < 1) return { ok: false, reason: "no-banked-travel", state: normalized } as const;
  return {
    ok: true,
    state: { ...normalized, revision: normalized.revision + 1, fastTravelCharges: normalized.fastTravelCharges - 1 },
    position: destination.position,
    chargeSpent: 1,
  } as const;
}
