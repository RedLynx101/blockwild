import type { GameMode } from "./data";
import type { WorldSave } from "./engine";
import { GENERATOR_VERSION, MIN_Y, WORLD_HEIGHT, type WorldGenerationOptions } from "./world";

export const WORLD_CATALOG_VERSION = 1;
export const WORLD_EXPORT_VERSION = 1;
export const WORLD_CATALOG_KEY = "blockwild-world-catalog-v1";
export const WORLD_DATA_PREFIX = "blockwild-world-data-v1:";
export const LEGACY_WORLD_KEY = "blockwild-world-v2";
export const WORLD_OWNERSHIP = "host-device" as const;
export const WORLD_OWNERSHIP_NOTICE = "Worlds are stored only in this browser on this host device. Export a world to move or back it up.";

const LEGACY_GENERATOR_MIN_Y = -32;
const MAX_NAME_LENGTH = 64;
const MAX_SEED_LENGTH = 160;

export type WorldDifficulty = "peaceful" | "easy" | "normal" | "hard";

export type WorldOptions = {
  difficulty: WorldDifficulty;
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
};

export const DEFAULT_WORLD_OPTIONS: Readonly<WorldOptions> = Object.freeze({
  difficulty: "normal",
  dayLengthMinutes: 20,
  mobDensity: 1,
  butterflyDensity: 1,
  caveFrequency: 1,
  biomeScale: 1,
  resourceAbundance: 1,
  structures: true,
  weather: true,
  keepInventory: false,
  friendlyFire: false,
});

export type WorldMetadata = {
  id: string;
  ownership: typeof WORLD_OWNERSHIP;
  name: string;
  seed: string;
  mode: GameMode;
  createdAt: number;
  updatedAt: number;
  lastPlayedAt: number | null;
  playTimeMs: number;
};

export type StoredWorld = {
  version: typeof WORLD_CATALOG_VERSION;
  metadata: WorldMetadata;
  options: WorldOptions;
  save: WorldSave;
};

export type WorldCatalog = {
  version: typeof WORLD_CATALOG_VERSION;
  ownership: typeof WORLD_OWNERSHIP;
  activeWorldId: string | null;
  legacyMigrated: boolean;
  worlds: WorldMetadata[];
};

export type WorldSortField = "name" | "seed" | "mode" | "createdAt" | "updatedAt" | "lastPlayedAt" | "playTimeMs";
export type WorldSortDirection = "asc" | "desc";
export type WorldListOptions = { sortBy?: WorldSortField; direction?: WorldSortDirection };

export type WorldStorageErrorCode = "unavailable" | "quota" | "corrupt" | "not-found" | "invalid" | "unsupported-version";
export type WorldStorageIssue = {
  code: WorldStorageErrorCode;
  message: string;
  key?: string;
};

export type WorldStorageResult<T> =
  | { ok: true; value: T; warnings?: WorldStorageIssue[] }
  | { ok: false; error: WorldStorageIssue };

export type CreateWorldInput = {
  name?: string;
  save: WorldSave;
  options?: Partial<WorldOptions>;
};

export type SaveWorldInput = {
  save: WorldSave;
  playTimeDeltaMs?: number;
  markPlayed?: boolean;
  options?: Partial<WorldOptions>;
};

export type WorldExport = {
  format: "blockwild-world";
  version: typeof WORLD_EXPORT_VERSION;
  exportedAt: number;
  ownershipNotice: string;
  world: StoredWorld;
};

export type WorldStorageDependencies = {
  now?: () => number;
  idFactory?: () => string;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown, fallback: number) => typeof value === "number" && Number.isFinite(value) ? value : fallback;
const finiteTimestamp = (value: unknown, fallback: number) => clamp(Math.trunc(finite(value, fallback)), 0, Number.MAX_SAFE_INTEGER);
const ok = <T>(value: T, warnings?: WorldStorageIssue[]): WorldStorageResult<T> => warnings?.length ? { ok: true, value, warnings } : { ok: true, value };
const fail = <T>(code: WorldStorageErrorCode, message: string, key?: string): WorldStorageResult<T> => ({ ok: false, error: { code, message, ...(key ? { key } : {}) } });

function normalizeBoolean(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeNumber(value: unknown, fallback: number, min: number, max: number, precision = 2) {
  const resolved = clamp(finite(value, fallback), min, max);
  const factor = 10 ** precision;
  return Math.round(resolved * factor) / factor;
}

export function normalizeWorldOptions(value?: Partial<WorldOptions> | null): WorldOptions {
  const input = isRecord(value) ? value : {};
  const difficulty = ["peaceful", "easy", "normal", "hard"].includes(String(input.difficulty))
    ? input.difficulty as WorldDifficulty
    : DEFAULT_WORLD_OPTIONS.difficulty;
  return {
    difficulty,
    dayLengthMinutes: normalizeNumber(input.dayLengthMinutes, DEFAULT_WORLD_OPTIONS.dayLengthMinutes, 5, 120, 1),
    mobDensity: normalizeNumber(input.mobDensity, DEFAULT_WORLD_OPTIONS.mobDensity, 0, 3),
    butterflyDensity: normalizeNumber(input.butterflyDensity, DEFAULT_WORLD_OPTIONS.butterflyDensity, 0, 4),
    caveFrequency: normalizeNumber(input.caveFrequency, DEFAULT_WORLD_OPTIONS.caveFrequency, 0, 3),
    biomeScale: normalizeNumber(input.biomeScale, DEFAULT_WORLD_OPTIONS.biomeScale, 0.25, 4),
    resourceAbundance: normalizeNumber(input.resourceAbundance, DEFAULT_WORLD_OPTIONS.resourceAbundance, 0.25, 4),
    structures: normalizeBoolean(input.structures, DEFAULT_WORLD_OPTIONS.structures),
    weather: normalizeBoolean(input.weather, DEFAULT_WORLD_OPTIONS.weather),
    keepInventory: normalizeBoolean(input.keepInventory, DEFAULT_WORLD_OPTIONS.keepInventory),
    friendlyFire: normalizeBoolean(input.friendlyFire, DEFAULT_WORLD_OPTIONS.friendlyFire),
  };
}

export function generationOptionsFromWorldOptions(value?: Partial<WorldOptions> | null): WorldGenerationOptions {
  const options = normalizeWorldOptions(value);
  return {
    caveFrequency: options.caveFrequency,
    biomeScale: options.biomeScale,
    resourceAbundance: options.resourceAbundance,
    structures: options.structures,
  };
}

function normalizeName(value: unknown, fallback = "New World") {
  const name = typeof value === "string" ? value.replace(/[\u0000-\u001f\u007f]/g, " ").trim().replace(/\s+/g, " ") : "";
  return (name || fallback).slice(0, MAX_NAME_LENGTH);
}

function normalizeSeed(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, MAX_SEED_LENGTH) : "";
}

function normalizeMode(value: unknown): GameMode | null {
  return value === "survival" || value === "builder" ? value : null;
}

function normalizeId(value: unknown) {
  if (typeof value !== "string") return "world";
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "world";
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function sanitizeEdits(value: unknown, offset = 0) {
  const edits: Record<string, Array<[number, number]>> = Object.create(null) as Record<string, Array<[number, number]>>;
  if (!isRecord(value)) return edits;
  for (const [key, entries] of Object.entries(value)) {
    if (!/^-?\d+,-?\d+$/.test(key) || !Array.isArray(entries)) continue;
    const safeEntries: Array<[number, number]> = [];
    for (const entry of entries) {
      if (!Array.isArray(entry) || !Number.isFinite(entry[0]) || !Number.isFinite(entry[1])) continue;
      const index = Math.trunc(entry[0] as number) + offset;
      const type = Math.trunc(entry[1] as number);
      if (index < 0 || index >= 16 * 16 * WORLD_HEIGHT || type < 0 || type > 255) continue;
      safeEntries.push([index, type]);
    }
    edits[key] = safeEntries;
  }
  return edits;
}

export function migrateLegacyWorldSave(value: unknown): WorldSave | null {
  if (!isRecord(value) || value.version !== 2) return null;
  const seed = normalizeSeed(value.seed);
  const mode = normalizeMode(value.mode);
  if (!seed || !mode || !isRecord(value.player)) return null;
  const generatorVersion = Math.trunc(finite(value.generatorVersion, -1));
  if (generatorVersion !== GENERATOR_VERSION && generatorVersion !== 2) return null;
  const offset = generatorVersion === 2 ? (LEGACY_GENERATOR_MIN_Y - MIN_Y) * 16 * 16 : 0;
  const player = value.player;
  if (![player.x, player.y, player.z].every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate))) return null;
  const spawn = isRecord(value.spawn) ? value.spawn : player;
  const weather = value.weather === "rain" ? "rain" : "clear";
  const normalized = {
    ...value,
    version: 2,
    generatorVersion: GENERATOR_VERSION,
    seed,
    mode,
    edits: sanitizeEdits(value.edits, offset),
    player: {
      x: finite(player.x, 0),
      y: finite(player.y, 64),
      z: finite(player.z, 0),
      yaw: finite(player.yaw, 0),
      pitch: clamp(finite(player.pitch, 0), -1.4, 1.4),
    },
    spawn: {
      x: finite(spawn.x, finite(player.x, 0)),
      y: finite(spawn.y, finite(player.y, 64)),
      z: finite(spawn.z, finite(player.z, 0)),
    },
    inventory: Array.isArray(value.inventory) ? value.inventory : [],
    selected: Math.trunc(clamp(finite(value.selected, 0), 0, 8)),
    health: clamp(finite(value.health, 10), 1, 10),
    hunger: clamp(finite(value.hunger, 10), 0, 10),
    xp: Math.max(0, finite(value.xp, 0)),
    level: Math.max(0, Math.trunc(finite(value.level, 0))),
    time: finite(value.time, 0.32),
    day: Math.max(1, Math.trunc(finite(value.day, 1))),
    weather,
    furnaces: isRecord(value.furnaces) ? value.furnaces : {},
    chests: isRecord(value.chests) ? value.chests : {},
    savedAt: finiteTimestamp(value.savedAt, Date.now()),
  } as unknown as WorldSave;
  try {
    return cloneJson(normalized);
  } catch {
    return null;
  }
}

function normalizeMetadata(value: unknown, fallback: { id: string; save: WorldSave; now: number }): WorldMetadata | null {
  const input = isRecord(value) ? value : {};
  const mode = normalizeMode(input.mode) ?? fallback.save.mode;
  const seed = normalizeSeed(input.seed) || fallback.save.seed;
  if (!mode || !seed) return null;
  const createdAt = finiteTimestamp(input.createdAt, fallback.now);
  return {
    id: normalizeId(input.id ?? fallback.id),
    ownership: WORLD_OWNERSHIP,
    name: normalizeName(input.name, seed),
    seed,
    mode,
    createdAt,
    updatedAt: Math.max(createdAt, finiteTimestamp(input.updatedAt, createdAt)),
    lastPlayedAt: input.lastPlayedAt === null || input.lastPlayedAt === undefined ? null : finiteTimestamp(input.lastPlayedAt, createdAt),
    playTimeMs: clamp(Math.trunc(finite(input.playTimeMs, 0)), 0, Number.MAX_SAFE_INTEGER),
  };
}

function classifyStorageError(error: unknown, key?: string): WorldStorageIssue {
  const candidate = error as { name?: string; code?: number; message?: string } | null;
  const quota = candidate?.name === "QuotaExceededError" || candidate?.name === "NS_ERROR_DOM_QUOTA_REACHED" || candidate?.code === 22 || candidate?.code === 1014;
  return {
    code: quota ? "quota" : "unavailable",
    message: quota
      ? "This device has no remaining browser storage for that world. Export or delete another world and try again."
      : "World storage is unavailable in this browser session.",
    ...(key ? { key } : {}),
  };
}

function defaultId() {
  const cryptoApi = typeof globalThis.crypto !== "undefined" ? globalThis.crypto : undefined;
  if (typeof cryptoApi?.randomUUID === "function") return cryptoApi.randomUUID();
  return `world-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyCatalog(): WorldCatalog {
  return { version: WORLD_CATALOG_VERSION, ownership: WORLD_OWNERSHIP, activeWorldId: null, legacyMigrated: false, worlds: [] };
}

function metadataFromCatalog(value: unknown, now: number): WorldMetadata | null {
  if (!isRecord(value)) return null;
  const seed = normalizeSeed(value.seed);
  const mode = normalizeMode(value.mode);
  const id = normalizeId(value.id);
  if (!seed || !mode || id !== value.id) return null;
  const createdAt = finiteTimestamp(value.createdAt, now);
  return {
    id,
    ownership: WORLD_OWNERSHIP,
    name: normalizeName(value.name, seed),
    seed,
    mode,
    createdAt,
    updatedAt: Math.max(createdAt, finiteTimestamp(value.updatedAt, createdAt)),
    lastPlayedAt: value.lastPlayedAt === null || value.lastPlayedAt === undefined ? null : finiteTimestamp(value.lastPlayedAt, createdAt),
    playTimeMs: clamp(Math.trunc(finite(value.playTimeMs, 0)), 0, Number.MAX_SAFE_INTEGER),
  };
}

export class WorldStorage {
  readonly diagnostics: WorldStorageIssue[] = [];
  private readonly storage: Storage | null;
  private readonly now: () => number;
  private readonly idFactory: () => string;
  private catalog: WorldCatalog = emptyCatalog();
  private catalogStored = false;

  constructor(storage?: Storage | null, dependencies: WorldStorageDependencies = {}) {
    this.storage = storage === undefined
      ? (typeof window !== "undefined" ? window.localStorage : null)
      : storage;
    this.now = dependencies.now ?? Date.now;
    this.idFactory = dependencies.idFactory ?? defaultId;
    this.readCatalog();
    this.migrateLegacySave();
  }

  get ownershipNotice() {
    return WORLD_OWNERSHIP_NOTICE;
  }

  get issues() {
    return this.diagnostics.map((issue) => ({ ...issue }));
  }

  get activeWorldId() {
    return this.catalog.activeWorldId;
  }

  listWorlds(options: WorldListOptions = {}) {
    const sortBy = options.sortBy ?? "lastPlayedAt";
    const direction = options.direction ?? "desc";
    const factor = direction === "asc" ? 1 : -1;
    const worlds = this.catalog.worlds.map((metadata) => ({ ...metadata }));
    worlds.sort((left, right) => {
      const a = left[sortBy];
      const b = right[sortBy];
      if (typeof a === "string" && typeof b === "string") return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }) * factor;
      const numberA = a === null ? -1 : Number(a);
      const numberB = b === null ? -1 : Number(b);
      const order = numberA === numberB ? left.name.localeCompare(right.name) : numberA - numberB;
      return order * factor;
    });
    return worlds;
  }

  createWorld(input: CreateWorldInput): WorldStorageResult<WorldMetadata> {
    const save = migrateLegacyWorldSave(input.save);
    if (!save) return fail("invalid", "The new world save is incomplete or invalid.");
    const id = this.uniqueId();
    const now = this.now();
    const metadata: WorldMetadata = {
      id,
      ownership: WORLD_OWNERSHIP,
      name: normalizeName(input.name, save.seed),
      seed: save.seed,
      mode: save.mode,
      createdAt: now,
      updatedAt: now,
      lastPlayedAt: null,
      playTimeMs: 0,
    };
    const document: StoredWorld = { version: WORLD_CATALOG_VERSION, metadata, options: normalizeWorldOptions(input.options), save };
    const nextCatalog = this.copyCatalog({ activeWorldId: id, worlds: [...this.catalog.worlds, metadata] });
    const committed = this.commitDocument(document, nextCatalog);
    return committed.ok ? ok({ ...metadata }) : committed;
  }

  loadWorld(id: string, touch = true): WorldStorageResult<StoredWorld> {
    const loaded = this.readDocument(id);
    if (!loaded.ok || !touch) return loaded;
    const now = this.now();
    const metadata = { ...loaded.value.metadata, lastPlayedAt: now };
    const document = { ...loaded.value, metadata };
    const nextCatalog = this.copyCatalog({
      activeWorldId: id,
      worlds: this.catalog.worlds.map((entry) => entry.id === id ? metadata : entry),
    });
    const committed = this.commitDocument(document, nextCatalog);
    if (!committed.ok) return ok(loaded.value, [committed.error]);
    return ok(cloneJson(document));
  }

  saveWorld(id: string, input: SaveWorldInput): WorldStorageResult<WorldMetadata> {
    const loaded = this.readDocument(id);
    if (!loaded.ok) return loaded;
    const save = migrateLegacyWorldSave(input.save);
    if (!save) return fail("invalid", "The world save is incomplete or invalid.", this.dataKey(id));
    const now = this.now();
    const metadata: WorldMetadata = {
      ...loaded.value.metadata,
      seed: save.seed,
      mode: save.mode,
      updatedAt: now,
      lastPlayedAt: input.markPlayed === false ? loaded.value.metadata.lastPlayedAt : now,
      playTimeMs: clamp(Math.trunc(loaded.value.metadata.playTimeMs + normalizeNumber(input.playTimeDeltaMs, 0, 0, Number.MAX_SAFE_INTEGER, 0)), 0, Number.MAX_SAFE_INTEGER),
    };
    const document: StoredWorld = {
      ...loaded.value,
      metadata,
      options: input.options ? normalizeWorldOptions({ ...loaded.value.options, ...input.options }) : loaded.value.options,
      save,
    };
    const nextCatalog = this.copyCatalog({ worlds: this.catalog.worlds.map((entry) => entry.id === id ? metadata : entry) });
    const committed = this.commitDocument(document, nextCatalog);
    return committed.ok ? ok({ ...metadata }) : committed;
  }

  addPlayTime(id: string, milliseconds: number): WorldStorageResult<WorldMetadata> {
    const loaded = this.readDocument(id);
    if (!loaded.ok) return loaded;
    const now = this.now();
    const metadata: WorldMetadata = {
      ...loaded.value.metadata,
      updatedAt: now,
      lastPlayedAt: now,
      playTimeMs: clamp(Math.trunc(loaded.value.metadata.playTimeMs + normalizeNumber(milliseconds, 0, 0, Number.MAX_SAFE_INTEGER, 0)), 0, Number.MAX_SAFE_INTEGER),
    };
    const document = { ...loaded.value, metadata };
    const nextCatalog = this.copyCatalog({ worlds: this.catalog.worlds.map((entry) => entry.id === id ? metadata : entry) });
    const committed = this.commitDocument(document, nextCatalog);
    return committed.ok ? ok({ ...metadata }) : committed;
  }

  renameWorld(id: string, name: string): WorldStorageResult<WorldMetadata> {
    const loaded = this.readDocument(id);
    if (!loaded.ok) return loaded;
    const metadata = { ...loaded.value.metadata, name: normalizeName(name), updatedAt: this.now() };
    const document = { ...loaded.value, metadata };
    const nextCatalog = this.copyCatalog({ worlds: this.catalog.worlds.map((entry) => entry.id === id ? metadata : entry) });
    const committed = this.commitDocument(document, nextCatalog);
    return committed.ok ? ok({ ...metadata }) : committed;
  }

  updateWorldOptions(id: string, patch: Partial<WorldOptions>): WorldStorageResult<WorldOptions> {
    const loaded = this.readDocument(id);
    if (!loaded.ok) return loaded;
    const metadata = { ...loaded.value.metadata, updatedAt: this.now() };
    const options = normalizeWorldOptions({ ...loaded.value.options, ...patch });
    const document: StoredWorld = { ...loaded.value, metadata, options };
    const nextCatalog = this.copyCatalog({ worlds: this.catalog.worlds.map((entry) => entry.id === id ? metadata : entry) });
    const committed = this.commitDocument(document, nextCatalog);
    return committed.ok ? ok({ ...options }) : committed;
  }

  duplicateWorld(id: string, name?: string): WorldStorageResult<WorldMetadata> {
    const loaded = this.readDocument(id);
    if (!loaded.ok) return loaded;
    return this.createWorld({
      name: name ?? `${loaded.value.metadata.name} Copy`,
      options: loaded.value.options,
      save: loaded.value.save,
    });
  }

  deleteWorld(id: string): WorldStorageResult<WorldMetadata> {
    const metadata = this.catalog.worlds.find((entry) => entry.id === id);
    if (!metadata) return fail("not-found", "That world does not exist on this device.", this.dataKey(id));
    const remaining = this.catalog.worlds.filter((entry) => entry.id !== id);
    const fallbackActive = [...remaining].sort((a, b) => (b.lastPlayedAt ?? b.updatedAt) - (a.lastPlayedAt ?? a.updatedAt))[0]?.id ?? null;
    const nextCatalog = this.copyCatalog({
      activeWorldId: this.catalog.activeWorldId === id ? fallbackActive : this.catalog.activeWorldId,
      worlds: remaining,
    });
    const committed = this.commitCatalog(nextCatalog);
    if (!committed.ok) return committed;
    try {
      this.storage?.removeItem(this.dataKey(id));
      return ok({ ...metadata });
    } catch (error) {
      return ok({ ...metadata }, [classifyStorageError(error, this.dataKey(id))]);
    }
  }

  setActiveWorld(id: string | null): WorldStorageResult<string | null> {
    if (id !== null && !this.catalog.worlds.some((entry) => entry.id === id)) {
      return fail("not-found", "That world does not exist on this device.", this.dataKey(id));
    }
    const committed = this.commitCatalog(this.copyCatalog({ activeWorldId: id }));
    return committed.ok ? ok(id) : committed;
  }

  exportWorld(id: string): WorldStorageResult<string> {
    const loaded = this.readDocument(id);
    if (!loaded.ok) return loaded;
    const exported: WorldExport = {
      format: "blockwild-world",
      version: WORLD_EXPORT_VERSION,
      exportedAt: this.now(),
      ownershipNotice: WORLD_OWNERSHIP_NOTICE,
      world: loaded.value,
    };
    try {
      return ok(JSON.stringify(exported, null, 2));
    } catch {
      return fail("invalid", "This world could not be converted to an export file.", this.dataKey(id));
    }
  }

  importWorld(json: string): WorldStorageResult<WorldMetadata> {
    let value: unknown;
    try {
      value = JSON.parse(json);
    } catch {
      return fail("invalid", "That file is not valid JSON.");
    }
    if (!isRecord(value) || value.format !== "blockwild-world") return fail("invalid", "That file is not a Blockwild world export.");
    if (value.version !== WORLD_EXPORT_VERSION) return fail("unsupported-version", "That Blockwild world export uses an unsupported version.");
    if (!isRecord(value.world) || value.world.version !== WORLD_CATALOG_VERSION) return fail("invalid", "The exported world record is incomplete.");
    if (!isRecord(value.world.metadata) || !isRecord(value.world.options)) return fail("invalid", "The exported world metadata or options are incomplete.");
    const save = migrateLegacyWorldSave(value.world.save);
    if (!save) return fail("invalid", "The exported world save is corrupt or incomplete.");
    const now = this.now();
    const sourceMetadata = normalizeMetadata(value.world.metadata, { id: "world", save, now });
    if (!sourceMetadata) return fail("invalid", "The exported world metadata is corrupt or incomplete.");
    const id = this.uniqueId(sourceMetadata.id);
    const metadata: WorldMetadata = {
      ...sourceMetadata,
      id,
      ownership: WORLD_OWNERSHIP,
      seed: save.seed,
      mode: save.mode,
      updatedAt: Math.max(sourceMetadata.updatedAt, now),
    };
    const document: StoredWorld = { version: WORLD_CATALOG_VERSION, metadata, options: normalizeWorldOptions(value.world.options as Partial<WorldOptions>), save };
    const nextCatalog = this.copyCatalog({
      activeWorldId: this.catalog.activeWorldId ?? id,
      worlds: [...this.catalog.worlds, metadata],
    });
    const committed = this.commitDocument(document, nextCatalog);
    return committed.ok ? ok({ ...metadata }) : committed;
  }

  private readCatalog() {
    if (!this.storage) {
      this.diagnostics.push({ code: "unavailable", message: "World storage is unavailable outside a browser on this host device.", key: WORLD_CATALOG_KEY });
      return;
    }
    let raw: string | null;
    try {
      raw = this.storage.getItem(WORLD_CATALOG_KEY);
    } catch (error) {
      this.diagnostics.push(classifyStorageError(error, WORLD_CATALOG_KEY));
      return;
    }
    if (!raw) return;
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      this.diagnostics.push({ code: "corrupt", message: "The local world catalog is corrupt. Its world data was left untouched.", key: WORLD_CATALOG_KEY });
      return;
    }
    if (!isRecord(value) || value.version !== WORLD_CATALOG_VERSION) {
      this.diagnostics.push({ code: "unsupported-version", message: "The local world catalog uses an unsupported version.", key: WORLD_CATALOG_KEY });
      return;
    }
    const now = this.now();
    const worlds: WorldMetadata[] = [];
    const seen = new Set<string>();
    for (const entry of Array.isArray(value.worlds) ? value.worlds : []) {
      const metadata = metadataFromCatalog(entry, now);
      if (!metadata || seen.has(metadata.id)) {
        this.diagnostics.push({ code: "corrupt", message: "An invalid world catalog entry was ignored.", key: WORLD_CATALOG_KEY });
        continue;
      }
      seen.add(metadata.id);
      worlds.push(metadata);
    }
    const activeWorldId = typeof value.activeWorldId === "string" && seen.has(value.activeWorldId) ? value.activeWorldId : null;
    this.catalog = {
      version: WORLD_CATALOG_VERSION,
      ownership: WORLD_OWNERSHIP,
      activeWorldId,
      legacyMigrated: value.legacyMigrated === true,
      worlds,
    };
    this.catalogStored = true;
  }

  private migrateLegacySave() {
    if (!this.storage || this.catalog.legacyMigrated) return;
    let raw: string | null;
    try {
      raw = this.storage.getItem(LEGACY_WORLD_KEY);
    } catch (error) {
      this.diagnostics.push(classifyStorageError(error, LEGACY_WORLD_KEY));
      return;
    }
    if (!raw) {
      this.catalog.legacyMigrated = true;
      if (this.catalogStored) {
        const committed = this.commitCatalog(this.copyCatalog({ legacyMigrated: true }));
        if (!committed.ok) this.diagnostics.push(committed.error);
      }
      return;
    }
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      this.catalog.legacyMigrated = true;
      this.diagnostics.push({ code: "corrupt", message: "The legacy world save is corrupt and was left untouched.", key: LEGACY_WORLD_KEY });
      return;
    }
    const save = migrateLegacyWorldSave(value);
    if (!save) {
      this.catalog.legacyMigrated = true;
      this.diagnostics.push({ code: "corrupt", message: "The legacy world save is incomplete and was left untouched.", key: LEGACY_WORLD_KEY });
      return;
    }
    const now = this.now();
    const id = this.uniqueId("legacy-world");
    const metadata: WorldMetadata = {
      id,
      ownership: WORLD_OWNERSHIP,
      name: normalizeName(`Legacy ${save.seed}`, "Legacy World"),
      seed: save.seed,
      mode: save.mode,
      createdAt: finiteTimestamp(save.savedAt, now),
      updatedAt: finiteTimestamp(save.savedAt, now),
      lastPlayedAt: finiteTimestamp(save.savedAt, now),
      playTimeMs: 0,
    };
    const document: StoredWorld = { version: WORLD_CATALOG_VERSION, metadata, options: normalizeWorldOptions(), save };
    const nextCatalog = this.copyCatalog({ activeWorldId: id, legacyMigrated: true, worlds: [...this.catalog.worlds, metadata] });
    const committed = this.commitDocument(document, nextCatalog);
    if (!committed.ok) {
      this.diagnostics.push(committed.error);
      return;
    }
    try {
      this.storage.removeItem(LEGACY_WORLD_KEY);
    } catch (error) {
      this.diagnostics.push(classifyStorageError(error, LEGACY_WORLD_KEY));
    }
  }

  private readDocument(id: string): WorldStorageResult<StoredWorld> {
    const catalogMetadata = this.catalog.worlds.find((entry) => entry.id === id);
    if (!catalogMetadata) return fail("not-found", "That world does not exist on this device.", this.dataKey(id));
    if (!this.storage) return fail("unavailable", "World storage is unavailable in this browser session.", this.dataKey(id));
    let raw: string | null;
    try {
      raw = this.storage.getItem(this.dataKey(id));
    } catch (error) {
      const issue = classifyStorageError(error, this.dataKey(id));
      return { ok: false, error: issue };
    }
    if (!raw) return fail("corrupt", "This world's local data is missing. Other worlds were left untouched.", this.dataKey(id));
    let value: unknown;
    try {
      value = JSON.parse(raw);
    } catch {
      return fail("corrupt", "This world's local data is corrupt. Other worlds were left untouched.", this.dataKey(id));
    }
    if (!isRecord(value) || value.version !== WORLD_CATALOG_VERSION) return fail("unsupported-version", "This world uses an unsupported storage version.", this.dataKey(id));
    const save = migrateLegacyWorldSave(value.save);
    if (!save) return fail("corrupt", "This world's save payload is corrupt or incomplete.", this.dataKey(id));
    return ok({
      version: WORLD_CATALOG_VERSION,
      metadata: { ...catalogMetadata, seed: save.seed, mode: save.mode },
      options: normalizeWorldOptions(value.options as Partial<WorldOptions>),
      save,
    });
  }

  private uniqueId(preferred?: string) {
    const base = normalizeId(preferred ?? this.idFactory());
    let candidate = base;
    for (let suffix = 2; suffix < 10_000; suffix += 1) {
      const catalogCollision = this.catalog.worlds.some((entry) => entry.id === candidate);
      let dataCollision = false;
      try { dataCollision = this.storage?.getItem(this.dataKey(candidate)) !== null; } catch { dataCollision = false; }
      if (!catalogCollision && !dataCollision) return candidate;
      candidate = `${base.slice(0, 43)}-${suffix}`;
    }
    return `${base.slice(0, 35)}-${this.now().toString(36)}`;
  }

  private dataKey(id: string) {
    return `${WORLD_DATA_PREFIX}${id}`;
  }

  private copyCatalog(patch: Partial<WorldCatalog>): WorldCatalog {
    return {
      ...this.catalog,
      ...patch,
      version: WORLD_CATALOG_VERSION,
      ownership: WORLD_OWNERSHIP,
      worlds: (patch.worlds ?? this.catalog.worlds).map((metadata) => ({ ...metadata, ownership: WORLD_OWNERSHIP })),
    };
  }

  private commitCatalog(nextCatalog: WorldCatalog): WorldStorageResult<true> {
    if (!this.storage) return fail("unavailable", "World storage is unavailable in this browser session.", WORLD_CATALOG_KEY);
    try {
      this.storage.setItem(WORLD_CATALOG_KEY, JSON.stringify(nextCatalog));
      this.catalog = nextCatalog;
      this.catalogStored = true;
      return ok(true);
    } catch (error) {
      return { ok: false, error: classifyStorageError(error, WORLD_CATALOG_KEY) };
    }
  }

  private commitDocument(document: StoredWorld, nextCatalog: WorldCatalog): WorldStorageResult<true> {
    if (!this.storage) return fail("unavailable", "World storage is unavailable in this browser session.", this.dataKey(document.metadata.id));
    const key = this.dataKey(document.metadata.id);
    let previousDocument: string | null = null;
    let previousCatalog: string | null = null;
    try {
      previousDocument = this.storage.getItem(key);
      previousCatalog = this.storage.getItem(WORLD_CATALOG_KEY);
      const serializedDocument = JSON.stringify(document);
      const serializedCatalog = JSON.stringify(nextCatalog);
      this.storage.setItem(key, serializedDocument);
      this.storage.setItem(WORLD_CATALOG_KEY, serializedCatalog);
      this.catalog = nextCatalog;
      this.catalogStored = true;
      return ok(true);
    } catch (error) {
      try {
        if (previousDocument === null) this.storage.removeItem(key);
        else this.storage.setItem(key, previousDocument);
        if (previousCatalog === null) this.storage.removeItem(WORLD_CATALOG_KEY);
        else this.storage.setItem(WORLD_CATALOG_KEY, previousCatalog);
      } catch {
        // The original payload remains authoritative in memory even if a broken
        // storage implementation also rejects the best-effort rollback.
      }
      return { ok: false, error: classifyStorageError(error, key) };
    }
  }
}
