export const MAP_SCHEMA = 1 as const;
export const CARTOGRAPHY_SCHEMA = 1 as const;
export const MAP_CHUNK_SIZE = 16;
export const MAX_EXPLORED_CHUNKS = 262_144;
export const MAX_MAP_MARKERS = 4_096;
export const MAX_FAST_TRAVEL_CHARGES = 999;
export const FAST_TRAVEL_CHANNEL_SECONDS = 5;
export const FAST_TRAVEL_STILL_RADIUS = 0.12;
export const WAYSHRINE_USE_RADIUS = 3.5;
export const MAP_VIEW_SCHEMA = 1 as const;
export const MIN_MAP_ZOOM = 1;
export const MAX_MAP_ZOOM = 12;
export const MAX_MAP_PAN_CHUNKS = 1_048_576;

export type WorldPoint = Readonly<{ x: number; y: number; z: number }>;
export type ChunkCoordinate = Readonly<{ x: number; z: number }>;
export type MapBiomeReference = number | string;
export type MapChunkDiscovery = ChunkCoordinate & Readonly<{ biome?: MapBiomeReference | null }>;
export type MapTerrainPalette = Readonly<{
  fill: string;
  stroke: string;
  label: string;
  water: boolean;
}>;
export type MapViewState = Readonly<{
  schema: typeof MAP_VIEW_SCHEMA;
  zoom: number;
  panX: number;
  panZ: number;
}>;
export type MapViewportBounds = Readonly<{ minX: number; maxX: number; minZ: number; maxZ: number }>;
export type MapPlayerMarker = Readonly<{
  id: string;
  name: string;
  position: WorldPoint;
  headingRadians?: number;
  color?: string;
}>;
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
  /**
   * Sparse biome samples captured when a chunk first reaches the render
   * horizon. Missing entries are valid legacy data and use the land palette.
   */
  terrainByChunk: Readonly<Record<string, MapBiomeReference>>;
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

const BIOME_TERRAIN_PALETTES: Readonly<Record<number, MapTerrainPalette>> = Object.freeze({
  0: { fill: "#315f82", stroke: "#244866", label: "Deep ocean", water: true },
  1: { fill: "#4f86a7", stroke: "#376a8b", label: "Ocean", water: true },
  2: { fill: "#c9aa68", stroke: "#9e7f45", label: "Coast", water: false },
  3: { fill: "#668d52", stroke: "#496a3c", label: "Meadow", water: false },
  4: { fill: "#3f7046", stroke: "#315a39", label: "Forest", water: false },
  5: { fill: "#789282", stroke: "#586f65", label: "Cold forest", water: false },
  6: { fill: "#c99c52", stroke: "#9f7137", label: "Desert", water: false },
  7: { fill: "#9b9b4d", stroke: "#737435", label: "Savanna", water: false },
  8: { fill: "#57795e", stroke: "#3c5b45", label: "Swamp", water: false },
  9: { fill: "#d4ded8", stroke: "#a5b6b1", label: "Snowfield", water: false },
  10: { fill: "#aa704d", stroke: "#7c4e38", label: "Badlands", water: false },
  11: { fill: "#88a76c", stroke: "#627f4c", label: "Birch grove", water: false },
  12: { fill: "#719959", stroke: "#50733f", label: "Bloomwood", water: false },
  13: { fill: "#7c876c", stroke: "#5d6752", label: "Highlands", water: false },
  14: { fill: "#705b57", stroke: "#4c3e3d", label: "Volcanic", water: false },
  15: { fill: "#665f70", stroke: "#484252", label: "Mushroom fen", water: false },
  16: { fill: "#5d94b0", stroke: "#3c718d", label: "River", water: true },
  17: { fill: "#789c76", stroke: "#577756", label: "Cloudreed glen", water: false },
  18: { fill: "#32744f", stroke: "#24593c", label: "Rainveil jungle", water: false },
  19: { fill: "#c1849b", stroke: "#996477", label: "Sakurabloom grove", water: false },
  20: { fill: "#274f79", stroke: "#1b385d", label: "Lumen trench", water: true },
  21: { fill: "#c46fa5", stroke: "#984f7d", label: "Sugarplum vale", water: false },
  22: { fill: "#4b8978", stroke: "#326a5c", label: "Glimmerwood", water: false },
  23: { fill: "#becbc6", stroke: "#899b97", label: "Snowcap range", water: false },
});

const DEFAULT_LAND_PALETTE: MapTerrainPalette = Object.freeze({
  fill: "#668252",
  stroke: "#4b623d",
  label: "Uncharted land",
  water: false,
});

const NAMED_TERRAIN_HINTS: ReadonlyArray<readonly [RegExp, number]> = Object.freeze([
  [/deep.?ocean|abyss|trench|lumen/iu, 20],
  [/ocean|sea|water/iu, 1],
  [/river/iu, 16],
  [/coast|beach|sunwash/iu, 2],
  [/sugar|sweet|candy|pink/iu, 21],
  [/sakura|cherry/iu, 19],
  [/glimmer|wood.?elf|biolum/iu, 22],
  [/snowcap|dwarf|mountain/iu, 23],
  [/snow|frost|ice/iu, 9],
  [/desert|sand/iu, 6],
  [/badland/iu, 10],
  [/volcan|ember|ash/iu, 14],
  [/swamp|fen|mushroom/iu, 8],
  [/jungle|rainveil/iu, 18],
  [/forest|wood|grove/iu, 4],
  [/meadow|field|land/iu, 3],
]);

function normalizeBiomeReference(value: unknown): MapBiomeReference | null {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 65_535) return value;
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/gu, " ").slice(0, 48);
  return cleaned || null;
}

/** Stable map ink for numeric biome ids and future content-pack biome names. */
export function mapTerrainPalette(biome: MapBiomeReference | null | undefined): MapTerrainPalette {
  if (typeof biome === "number") return BIOME_TERRAIN_PALETTES[biome] ?? DEFAULT_LAND_PALETTE;
  if (typeof biome === "string") {
    const numeric = Number(biome);
    if (Number.isInteger(numeric) && BIOME_TERRAIN_PALETTES[numeric]) return BIOME_TERRAIN_PALETTES[numeric];
    const match = NAMED_TERRAIN_HINTS.find(([pattern]) => pattern.test(biome));
    if (match) return BIOME_TERRAIN_PALETTES[match[1]];
  }
  return DEFAULT_LAND_PALETTE;
}

export function createMapViewState(): MapViewState {
  return { schema: MAP_VIEW_SCHEMA, zoom: 1, panX: 0, panZ: 0 };
}

/** Old, missing and malformed view state opens at the entire explored map. */
export function normalizeMapViewState(value: unknown): MapViewState {
  if (!value || typeof value !== "object") return createMapViewState();
  const input = value as Partial<MapViewState>;
  return {
    schema: MAP_VIEW_SCHEMA,
    zoom: clamp(finite(input.zoom, 1), MIN_MAP_ZOOM, MAX_MAP_ZOOM),
    panX: clamp(finite(input.panX), -MAX_MAP_PAN_CHUNKS, MAX_MAP_PAN_CHUNKS),
    panZ: clamp(finite(input.panZ), -MAX_MAP_PAN_CHUNKS, MAX_MAP_PAN_CHUNKS),
  };
}

export function setMapZoom(state: MapViewState, zoom: number): MapViewState {
  const normalized = normalizeMapViewState(state);
  const nextZoom = clamp(finite(zoom, normalized.zoom), MIN_MAP_ZOOM, MAX_MAP_ZOOM);
  return nextZoom === normalized.zoom ? normalized : { ...normalized, zoom: nextZoom };
}

export function stepMapZoom(state: MapViewState, direction: 1 | -1): MapViewState {
  const factor = direction > 0 ? 1.35 : 1 / 1.35;
  return setMapZoom(state, state.zoom * factor);
}

export function panMapView(state: MapViewState, deltaX: number, deltaZ: number): MapViewState {
  const normalized = normalizeMapViewState(state);
  return normalizeMapViewState({
    ...normalized,
    panX: normalized.panX + finite(deltaX),
    panZ: normalized.panZ + finite(deltaZ),
  });
}

/** Keeps x and z in chunk space; zoom changes only the visible span. */
export function mapViewportBounds(base: MapViewportBounds, state: MapViewState): MapViewportBounds {
  const view = normalizeMapViewState(state);
  const baseWidth = Math.max(1, finite(base.maxX) - finite(base.minX));
  const baseHeight = Math.max(1, finite(base.maxZ) - finite(base.minZ));
  const width = baseWidth / view.zoom;
  const height = baseHeight / view.zoom;
  const centerX = (finite(base.minX) + finite(base.maxX)) / 2 + view.panX;
  const centerZ = (finite(base.minZ) + finite(base.maxZ)) / 2 + view.panZ;
  return {
    minX: centerX - width / 2,
    maxX: centerX + width / 2,
    minZ: centerZ - height / 2,
    maxZ: centerZ + height / 2,
  };
}

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
    terrainByChunk: {},
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
  const exploredSet = new Set(exploredChunks);
  const rawTerrain = input.terrainByChunk && typeof input.terrainByChunk === "object" && !Array.isArray(input.terrainByChunk)
    ? input.terrainByChunk
    : ((input as Partial<MapKnowledge> & { chunkBiomes?: unknown }).chunkBiomes ?? {});
  const terrainEntries: Array<readonly [string, MapBiomeReference]> = [];
  if (rawTerrain && typeof rawTerrain === "object" && !Array.isArray(rawTerrain)) {
    for (const [key, rawBiome] of Object.entries(rawTerrain as Record<string, unknown>)) {
      if (terrainEntries.length >= MAX_EXPLORED_CHUNKS || !exploredSet.has(key) || !parseChunkKey(key)) continue;
      const biome = normalizeBiomeReference(rawBiome);
      if (biome !== null) terrainEntries.push([key, biome]);
    }
  }
  terrainEntries.sort(([left], [right]) => left.localeCompare(right));
  const terrainByChunk = Object.fromEntries(terrainEntries);
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
    terrainByChunk,
    markers,
    activeBedId,
    fastTravelCharges: clamp(integer(input.fastTravelCharges), 0, MAX_FAST_TRAVEL_CHARGES),
  };
}

/** Call once when a chunk becomes renderable; repeated renders are idempotent. */
export function markChunkRendered(state: MapKnowledge, chunk: MapChunkDiscovery): MapKnowledge {
  return markChunksRendered(state, [chunk]);
}

/** Batches a render-distance ring into one normalization and one stable sort. */
export function markChunksRendered(state: MapKnowledge, chunks: readonly MapChunkDiscovery[]): MapKnowledge {
  if (!chunks.length) return state;
  const explored = new Set(state.exploredChunks);
  const before = explored.size;
  const terrainByChunk: Record<string, MapBiomeReference> = { ...(state.terrainByChunk ?? {}) };
  let terrainChanged = false;
  for (const chunk of chunks) {
    const key = chunkKey(chunk);
    if (!explored.has(key) && explored.size >= MAX_EXPLORED_CHUNKS) continue;
    explored.add(key);
    const biome = normalizeBiomeReference(chunk.biome);
    if (biome !== null && terrainByChunk[key] !== biome) {
      terrainByChunk[key] = biome;
      terrainChanged = true;
    }
  }
  return explored.size === before && !terrainChanged ? state : {
    ...state,
    revision: state.revision + 1,
    exploredChunks: [...explored].sort(),
    terrainByChunk,
  };
}

export function markWorldPositionRendered(
  state: MapKnowledge,
  position: Pick<WorldPoint, "x" | "z">,
  chunkSize = MAP_CHUNK_SIZE,
  biome?: MapBiomeReference | null,
) {
  return markChunksRendered(state, [{ ...chunkAtWorldPosition(position, chunkSize), biome }]);
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
  const terrainByChunk: Record<string, MapBiomeReference> = {};
  for (const key of exploredChunks) {
    const localTerrain = local.terrainByChunk?.[key];
    const remoteTerrain = remote.terrainByChunk?.[key];
    const biome = normalizeBiomeReference(localTerrain ?? remoteTerrain);
    if (biome !== null) terrainByChunk[key] = biome;
  }
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
    || markers.some((entry, index) => entry !== local.markers[index])
    || Object.keys(terrainByChunk).length !== Object.keys(local.terrainByChunk ?? {}).length
    || Object.entries(terrainByChunk).some(([key, biome]) => local.terrainByChunk?.[key] !== biome);
  return changed ? { ...local, revision: local.revision + 1, exploredChunks, terrainByChunk, markers } : local;
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
