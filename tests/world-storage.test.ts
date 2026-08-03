import assert from "node:assert/strict";
import test from "node:test";
import type { WorldSave } from "../app/game/engine.ts";
import { DEFAULT_WORLD_GENERATION_OPTIONS, GENERATOR_VERSION } from "../app/game/world.ts";
import {
  DEFAULT_WORLD_OPTIONS,
  LEGACY_WORLD_KEY,
  WORLD_CATALOG_KEY,
  WORLD_DATA_PREFIX,
  WORLD_OWNERSHIP,
  WorldStorage,
  generationOptionsFromWorldOptions,
  migrateLegacyWorldSave,
  normalizeWorldOptions,
  requiredSleepers,
} from "../app/game/world-storage.ts";

class MemoryStorage implements Storage {
  readonly values = new Map<string, string>();
  readonly failingKeys = new Set<string>();
  readonly getItemCalls = new Map<string, number>();
  failAllWrites = false;

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) {
    this.getItemCalls.set(key, (this.getItemCalls.get(key) ?? 0) + 1);
    return this.values.get(key) ?? null;
  }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (this.failAllWrites || this.failingKeys.has(key)) throw new DOMException("Storage quota reached", "QuotaExceededError");
    this.values.set(key, String(value));
  }
}

class MemoryStorageEvents {
  private readonly listeners = new Set<(event: StorageEvent) => void>();

  addEventListener(_type: "storage", listener: (event: StorageEvent) => void) {
    this.listeners.add(listener);
  }

  removeEventListener(_type: "storage", listener: (event: StorageEvent) => void) {
    this.listeners.delete(listener);
  }

  dispatch(storage: Storage, key: string | null) {
    const event = { key, storageArea: storage } as StorageEvent;
    for (const listener of this.listeners) listener(event);
  }

  get listenerCount() {
    return this.listeners.size;
  }
}

test("runtime autosaves reuse trusted document metadata instead of reparsing the previous save", () => {
  const storage = new MemoryStorage();
  const worlds = new WorldStorage(storage, { now: () => 2_000, idFactory: () => "autosave-cache" });
  const created = worlds.createWorld({ name: "Autosave Cache", save: save("CACHE-A") });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const dataKey = `${WORLD_DATA_PREFIX}${created.value.id}`;
  storage.getItemCalls.clear();
  assert.equal(worlds.saveWorld(created.value.id, { save: save("CACHE-B"), playTimeDeltaMs: 50 }).ok, true);
  assert.equal(storage.getItemCalls.get(dataKey), 1, "the only data read should be the rollback snapshot in the atomic commit");

  const reopened = new WorldStorage(storage, { now: () => 3_000, idFactory: () => "unused" });
  storage.getItemCalls.clear();
  assert.equal(reopened.saveWorld(created.value.id, { save: save("CACHE-C") }).ok, true);
  assert.equal(storage.getItemCalls.get(dataKey), 2, "the first save in a new runtime validates storage before caching its shell");
  storage.getItemCalls.clear();
  assert.equal(reopened.saveWorld(created.value.id, { save: save("CACHE-D") }).ok, true);
  assert.equal(storage.getItemCalls.get(dataKey), 1, "subsequent saves should use the validated shell cache");
});

test("public agent tasks and test-world provenance round-trip with the owning world", () => {
  const storage = new MemoryStorage();
  const worlds = new WorldStorage(storage, { now: () => 2_500, idFactory: () => "agent-ledger" });
  const worldSave: WorldSave = {
    ...save("AGENT-LEDGER"),
    agentTestWorld: true,
    agentPlatform: {
      schema: 1,
      enabled: true,
      tasks: [{ id: "task_1", agentId: "agent_1", title: "Tend west field", status: "active", owner: "agent_1", note: "Mature only", createdAt: 1, updatedAt: 2, waypointIds: ["way_1"], previewIds: [] }],
      waypoints: [{ id: "way_1", agentId: "agent_1", name: "West field", position: { x: 4, y: 30, z: -2 }, createdAt: 1, source: "agent" }],
    },
  };
  const created = worlds.createWorld({ name: "Agent Ledger", save: worldSave });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const loaded = worlds.loadWorld(created.value.id, false);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.equal(loaded.value.save.agentTestWorld, true);
  assert.equal(loaded.value.save.agentPlatform?.tasks[0]?.title, "Tend west field");
  assert.deepEqual(loaded.value.save.agentPlatform?.waypoints[0]?.position, { x: 4, y: 30, z: -2 });
});

test("world rules can switch between Survival and Creative before loading without losing the save", () => {
  const storage = new MemoryStorage();
  const worlds = new WorldStorage(storage, { now: () => 2_750, idFactory: () => "mode-switch" });
  const original = { ...save("RULES-A"), health: 2, hunger: 3, inventory: [{ item: 1, count: 7 }] } as WorldSave;
  const created = worlds.createWorld({ name: "Rules Test", save: original, options: { weather: false } });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const creative = worlds.updateWorldMode(created.value.id, "builder");
  assert.equal(creative.ok, true);
  assert.equal(creative.ok && creative.value.mode, "builder");
  const creativeLoad = worlds.loadWorld(created.value.id, false);
  assert.equal(creativeLoad.ok, true);
  if (!creativeLoad.ok) return;
  assert.equal(creativeLoad.value.metadata.mode, "builder");
  assert.equal(creativeLoad.value.save.mode, "builder");
  assert.equal(creativeLoad.value.save.health, 10);
  assert.equal(creativeLoad.value.save.hunger, 10);
  assert.deepEqual(creativeLoad.value.save.inventory, original.inventory);
  assert.equal(creativeLoad.value.options.weather, false);

  const survival = worlds.updateWorldMode(created.value.id, "survival");
  assert.equal(survival.ok, true);
  const survivalLoad = worlds.loadWorld(created.value.id, false);
  assert.equal(survivalLoad.ok && survivalLoad.value.save.mode, "survival");
  assert.deepEqual(survivalLoad.ok && survivalLoad.value.save.inventory, original.inventory);
});

test("autosaves refresh stale shells changed by another WorldStorage instance", () => {
  const storage = new MemoryStorage();
  let firstNow = 1_000;
  let secondNow = 2_000;
  const first = new WorldStorage(storage, { now: () => firstNow, idFactory: () => "shared-cache" });
  const created = first.createWorld({ name: "Original Name", save: save("SHARED-A") });
  assert.equal(created.ok, true);
  if (!created.ok) return;

  const second = new WorldStorage(storage, { now: () => secondNow, idFactory: () => "other-world" });
  assert.equal(second.renameWorld(created.value.id, "Second Runtime Name").ok, true);
  secondNow += 1;
  assert.equal(second.updateWorldOptions(created.value.id, { difficulty: "hard", keepInventory: true }).ok, true);
  const otherWorld = second.createWorld({ name: "Second Runtime World", save: save("SHARED-EXTRA") });
  assert.equal(otherWorld.ok, true);

  firstNow = 3_000;
  assert.equal(first.saveWorld(created.value.id, { save: save("SHARED-B") }).ok, true);

  const reopened = new WorldStorage(storage, { now: () => 4_000, idFactory: () => "unused" });
  assert.equal(reopened.listWorlds().length, 2, "refreshing a stale catalog must preserve worlds created by another runtime");
  const loaded = reopened.loadWorld(created.value.id, false);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.equal(loaded.value.metadata.name, "Second Runtime Name", "an autosave must preserve another runtime's rename");
  assert.equal(loaded.value.options.difficulty, "hard", "an autosave must preserve another runtime's options");
  assert.equal(loaded.value.options.keepInventory, true);
  assert.equal(loaded.value.save.seed, "SHARED-B");
});

test("storage events invalidate cross-tab document shells and unregister on dispose", () => {
  const storage = new MemoryStorage();
  const events = new MemoryStorageEvents();
  const worlds = new WorldStorage(storage, {
    now: () => 5_000,
    idFactory: () => "cross-tab-cache",
    storageEventTarget: events,
  });
  const created = worlds.createWorld({ name: "Before Tab Edit", save: save("TAB-A") });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(events.listenerCount, 1);

  const dataKey = `${WORLD_DATA_PREFIX}${created.value.id}`;
  const document = JSON.parse(storage.values.get(dataKey)!);
  document.metadata.name = "Edited In Another Tab";
  document.options.difficulty = "hard";
  storage.values.set(dataKey, JSON.stringify(document));

  const catalog = JSON.parse(storage.values.get(WORLD_CATALOG_KEY)!);
  const catalogEntry = catalog.worlds.find((entry: { id: string }) => entry.id === created.value.id);
  catalogEntry.name = "Edited In Another Tab";
  storage.values.set(WORLD_CATALOG_KEY, JSON.stringify(catalog));

  events.dispatch(storage, dataKey);
  events.dispatch(storage, WORLD_CATALOG_KEY);
  assert.equal(worlds.saveWorld(created.value.id, { save: save("TAB-B") }).ok, true);

  const reopened = new WorldStorage(storage, { now: () => 6_000, idFactory: () => "unused" });
  const loaded = reopened.loadWorld(created.value.id, false);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.equal(loaded.value.metadata.name, "Edited In Another Tab");
  assert.equal(loaded.value.options.difficulty, "hard");
  assert.equal(loaded.value.save.seed, "TAB-B");

  worlds.dispose();
  assert.equal(events.listenerCount, 0);
});

function save(seed: string, mode: "survival" | "builder" = "survival", generatorVersion = GENERATOR_VERSION): WorldSave {
  return {
    version: 2,
    generatorVersion,
    seed,
    mode,
    edits: { "0,0": [[17, 3]] },
    player: { x: 1, y: 50, z: -2, yaw: 0.3, pitch: -0.1 },
    spawn: { x: 0, y: 48, z: 0 },
    inventory: [],
    selected: 0,
    health: 10,
    hunger: 10,
    xp: 0,
    level: 0,
    time: 0.32,
    day: 1,
    weather: "clear",
    furnaces: {},
    chests: {},
    savedAt: 900,
  };
}

test("advanced world options use safe defaults and bounded numeric controls", () => {
  assert.deepEqual(normalizeWorldOptions(), DEFAULT_WORLD_OPTIONS);
  assert.deepEqual(normalizeWorldOptions({
    difficulty: "hard",
    dayLengthMinutes: 999,
    mobDensity: -2,
    butterflyDensity: 99,
    caveFrequency: Number.NaN,
    biomeScale: 0.01,
    resourceAbundance: 20,
    structures: false,
    weather: false,
    keepInventory: true,
    friendlyFire: true,
    sleepRule: "percentage",
    sleepPercentage: 50,
  }), {
    ...DEFAULT_WORLD_OPTIONS,
    difficulty: "hard",
    dayLengthMinutes: 120,
    mobDensity: 0,
    butterflyDensity: 4,
    caveFrequency: 1,
    biomeScale: 0.25,
    resourceAbundance: 4,
    structures: false,
    weather: false,
    keepInventory: true,
    friendlyFire: true,
    sleepRule: "percentage",
    sleepPercentage: 50,
  });
  assert.deepEqual(generationOptionsFromWorldOptions({ caveFrequency: 2, biomeScale: 3, resourceAbundance: 4, structures: false }), {
    ...DEFAULT_WORLD_GENERATION_OPTIONS,
    caveFrequency: 2,
    biomeScale: 3,
    resourceAbundance: 4,
    structures: false,
  });
  assert.equal(requiredSleepers({ sleepRule: "any-player", sleepPercentage: 50 }, 8), 1);
  assert.equal(requiredSleepers({ sleepRule: "percentage", sleepPercentage: 50 }, 5), 3);
  assert.equal(requiredSleepers({ sleepRule: "all-players", sleepPercentage: 50 }, 4), 4);
});

test("device-local catalog supports synchronous CRUD, active selection, metadata, and sorting", () => {
  const storage = new MemoryStorage();
  let now = 1_000;
  const worlds = new WorldStorage(storage, { now: () => now, idFactory: () => "fixed-id" });

  const created = worlds.createWorld({ name: "  Alpha   Ridge  ", save: save("ALPHA") });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  assert.equal(created.value.id, "fixed-id");
  assert.equal(created.value.name, "Alpha Ridge");
  assert.equal(created.value.ownership, WORLD_OWNERSHIP);
  assert.equal(worlds.activeWorldId, created.value.id);

  now = 2_000;
  const loaded = worlds.loadWorld(created.value.id);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.equal(loaded.value.metadata.lastPlayedAt, 2_000);
  loaded.value.save.seed = "MUTATED-ONLY-IN-CALLER";
  const detached = worlds.loadWorld(created.value.id, false);
  assert.equal(detached.ok && detached.value.save.seed, "ALPHA", "loads must be detached JSON values");

  now = 3_000;
  const saved = worlds.saveWorld(created.value.id, { save: save("ALPHA-2", "builder"), playTimeDeltaMs: 4_500 });
  assert.equal(saved.ok, true);
  if (!saved.ok) return;
  assert.equal(saved.value.seed, "ALPHA-2");
  assert.equal(saved.value.mode, "builder");
  assert.equal(saved.value.playTimeMs, 4_500);

  now = 4_000;
  const duplicate = worlds.duplicateWorld(created.value.id);
  assert.equal(duplicate.ok, true);
  if (!duplicate.ok) return;
  assert.equal(duplicate.value.id, "fixed-id-2", "ID factories and imports must never overwrite an existing payload");
  assert.equal(duplicate.value.name, "Alpha Ridge Copy");
  assert.equal(duplicate.value.playTimeMs, 0);
  assert.equal(worlds.activeWorldId, duplicate.value.id);

  const renamed = worlds.renameWorld(duplicate.value.id, "Beta Vale");
  assert.equal(renamed.ok && renamed.value.name, "Beta Vale");
  const options = worlds.updateWorldOptions(duplicate.value.id, { difficulty: "peaceful", structures: false });
  assert.equal(options.ok && options.value.difficulty, "peaceful");
  assert.equal(options.ok && options.value.structures, false);
  assert.deepEqual(worlds.listWorlds({ sortBy: "name", direction: "asc" }).map((world) => world.name), ["Alpha Ridge", "Beta Vale"]);
  assert.deepEqual(worlds.listWorlds({ sortBy: "playTimeMs", direction: "desc" }).map((world) => world.id), [created.value.id, duplicate.value.id]);

  assert.equal(worlds.setActiveWorld(created.value.id).ok, true);
  const removed = worlds.deleteWorld(created.value.id);
  assert.equal(removed.ok, true);
  assert.equal(worlds.activeWorldId, duplicate.value.id, "deleting the active world should select the best remaining local world");
  assert.equal(storage.getItem(`${WORLD_DATA_PREFIX}${created.value.id}`), null);

  const reopened = new WorldStorage(storage, { now: () => now, idFactory: () => "unused" });
  assert.deepEqual(reopened.listWorlds().map((world) => world.id), [duplicate.value.id]);
  assert.equal(reopened.activeWorldId, duplicate.value.id);
});

test("a legacy single-world save migrates once into the versioned catalog without moving its blocks", () => {
  const storage = new MemoryStorage();
  const legacy = save("OLD-WILD", "survival", 2);
  legacy.edits = { "0,0": [[8_192, 13]] };
  storage.setItem(LEGACY_WORLD_KEY, JSON.stringify(legacy));

  const worlds = new WorldStorage(storage, { now: () => 2_000, idFactory: () => "legacy-world" });
  const listed = worlds.listWorlds();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, "legacy-world");
  assert.equal(worlds.activeWorldId, "legacy-world");
  const loaded = worlds.loadWorld("legacy-world", false);
  assert.equal(loaded.ok, true);
  if (!loaded.ok) return;
  assert.equal(loaded.value.save.generatorVersion, GENERATOR_VERSION);
  assert.deepEqual(loaded.value.save.edits["0,0"], [[16_384, 13]], "legacy y coordinates should retain their deeper-world position");
  assert.deepEqual(loaded.value.options, { ...DEFAULT_WORLD_OPTIONS, settlementPattern: "legacy-scattered-v1" });
  assert.equal(storage.getItem(LEGACY_WORLD_KEY), null, "legacy data is removed only after catalog and payload writes succeed");

  const reopened = new WorldStorage(storage, { now: () => 3_000, idFactory: () => "another" });
  assert.equal(reopened.listWorlds().length, 1, "migration must be idempotent");
});

test("generator v9 saves migrate to v10 without moving or dropping player edits", () => {
  const previous = save("DRAGONWAKE-PREVIEW", "survival", 9);
  previous.edits = {
    "0,0": [[17, 3], [16_384, 13]],
    "-2,7": [[41_219, 221]],
  };

  const migrated = migrateLegacyWorldSave(previous);
  assert.ok(migrated);
  assert.equal(migrated.generatorVersion, GENERATOR_VERSION);
  assert.deepEqual(migrated.edits, previous.edits, "v9 and v10 share the deep-world index, so authored edits must remain exact");
});

test("generator v11 saves migrate to the current generator without moving or dropping authored edits", () => {
  const previous = save("V11-HOMESTEAD-MIGRATION", "survival", 11);
  previous.edits = {
    "0,0": [[17, 3], [16_384, 13], [41_219, 190]],
    "-9,4": [[3_077, 142], [47_004, 175]],
  };
  const migrated = migrateLegacyWorldSave(previous);
  assert.ok(migrated);
  assert.equal(migrated.generatorVersion, GENERATOR_VERSION);
  assert.deepEqual(migrated.edits, previous.edits, "legacy saves share the same deep-world byte layout");
});

test("generator v12 saves migrate to the current generator without moving or dropping authored edits", () => {
  const previous = save("V12-ECHOES-AND-RUINS-MIGRATION", "survival", 12);
  previous.edits = {
    "0,0": [[17, 3], [16_384, 13], [41_219, 190]],
    "-9,4": [[3_077, 142], [47_004, 175]],
  };
  const migrated = migrateLegacyWorldSave(previous);
  assert.ok(migrated);
  assert.equal(migrated.generatorVersion, GENERATOR_VERSION);
  assert.deepEqual(migrated.edits, previous.edits, "v12 authored edits must survive later content upgrades exactly");
});

test("world exports validate on import and use collision-safe local IDs", () => {
  const storage = new MemoryStorage();
  const worlds = new WorldStorage(storage, { now: () => 5_000, idFactory: () => "same-id" });
  const created = worlds.createWorld({
    name: "Export Me",
    save: { ...save("PORTABLE"), agentWorldFingerprint: "worldfp_original_portable" },
    options: { difficulty: "hard", keepInventory: true, biomeScale: 2.5 },
  });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  const exported = worlds.exportWorld(created.value.id);
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const parsed = JSON.parse(exported.value);
  assert.equal(parsed.ownershipNotice.includes("host device"), true);

  const imported = worlds.importWorld(exported.value);
  assert.equal(imported.ok, true);
  if (!imported.ok) return;
  assert.equal(imported.value.id, "same-id-2");
  const copy = worlds.loadWorld(imported.value.id, false);
  assert.equal(copy.ok, true);
  if (!copy.ok) return;
  assert.equal(copy.value.save.seed, "PORTABLE");
  assert.match(copy.value.save.agentWorldFingerprint ?? "", /^worldfp_import_same-id-2_/u);
  assert.notEqual(copy.value.save.agentWorldFingerprint, "worldfp_original_portable");
  assert.equal(copy.value.options.difficulty, "hard");
  assert.equal(copy.value.options.keepInventory, true);
  assert.equal(copy.value.options.biomeScale, 2.5);

  assert.deepEqual(worlds.importWorld("not json"), { ok: false, error: { code: "invalid", message: "That file is not valid JSON." } });
  const unsupported = JSON.stringify({ ...parsed, version: 999 });
  assert.equal(worlds.importWorld(unsupported).ok, false);
});

test("corrupt data is isolated and quota failures roll back without losing the previous world", () => {
  const corruptCatalog = new MemoryStorage();
  corruptCatalog.setItem(WORLD_CATALOG_KEY, "{bad json");
  const recovered = new WorldStorage(corruptCatalog, { now: () => 1_000, idFactory: () => "recovered" });
  assert.deepEqual(recovered.listWorlds(), []);
  assert.equal(recovered.issues.some((issue) => issue.code === "corrupt"), true);
  assert.equal(recovered.createWorld({ save: save("RECOVERED") }).ok, true, "a damaged catalog should not crash future local saves");

  corruptCatalog.setItem(`${WORLD_DATA_PREFIX}recovered`, "{broken");
  const broken = recovered.loadWorld("recovered", false);
  assert.equal(broken.ok, false);
  if (!broken.ok) assert.equal(broken.error.code, "corrupt");

  const storage = new MemoryStorage();
  const worlds = new WorldStorage(storage, { now: () => 1_000, idFactory: () => "quota-world" });
  const created = worlds.createWorld({ save: save("BEFORE") });
  assert.equal(created.ok, true);
  if (!created.ok) return;
  storage.failingKeys.add(WORLD_CATALOG_KEY);
  const failed = worlds.saveWorld(created.value.id, { save: save("AFTER") });
  assert.equal(failed.ok, false);
  if (!failed.ok) assert.equal(failed.error.code, "quota");
  storage.failingKeys.clear();
  const reopened = new WorldStorage(storage, { now: () => 2_000, idFactory: () => "other" });
  const original = reopened.loadWorld(created.value.id, false);
  assert.equal(original.ok && original.value.save.seed, "BEFORE", "a failed two-key commit must restore the prior payload");

  const full = new MemoryStorage();
  full.failAllWrites = true;
  const quota = new WorldStorage(full, { idFactory: () => "never-written" });
  const rejected = quota.createWorld({ save: save("NO-SPACE") });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) assert.equal(rejected.error.code, "quota");
  assert.equal(full.getItem(`${WORLD_DATA_PREFIX}never-written`), null);

  const unavailable = new WorldStorage(null);
  const noStorage = unavailable.createWorld({ save: save("SERVER") });
  assert.equal(noStorage.ok, false);
  if (!noStorage.ok) assert.equal(noStorage.error.code, "unavailable");
});
