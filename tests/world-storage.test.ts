import assert from "node:assert/strict";
import test from "node:test";
import type { WorldSave } from "../app/game/engine.ts";
import { GENERATOR_VERSION } from "../app/game/world.ts";
import { NPC_FACTION_IDS } from "../app/game/factions.ts";
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
  failAllWrites = false;

  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) {
    if (this.failAllWrites || this.failingKeys.has(key)) throw new DOMException("Storage quota reached", "QuotaExceededError");
    this.values.set(key, String(value));
  }
}

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
    enabledFactions: NPC_FACTION_IDS,
  });
  assert.deepEqual(generationOptionsFromWorldOptions({ caveFrequency: 2, biomeScale: 3, resourceAbundance: 4, structures: false }), {
    profile: "world-below-v15",
    caveFrequency: 2,
    biomeScale: 3,
    resourceAbundance: 4,
    structures: false,
    enabledFactions: NPC_FACTION_IDS,
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
  assert.deepEqual(loaded.value.options, DEFAULT_WORLD_OPTIONS);
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
    save: save("PORTABLE"),
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
