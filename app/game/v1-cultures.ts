/**
 * Pure v1.0 culture, settlement, golem-forge, and sea-dragon contracts.
 *
 * The world/engine adapters deliberately consume semantic plans from here.
 * Keeping the deterministic planners free of Three.js and inventory mutation
 * makes them cheap to test, safe to save, and usable by a host authority.
 */

export const V1_CULTURE_SCHEMA = 1 as const;

export const V1_CULTURES = Object.freeze({
  woodElves: Object.freeze({
    factionId: "wood-elves" as const,
    race: "wood-elf" as const,
    name: "Lethari Moonboughs",
    biome: "glimmerwood" as const,
    settlementName: "Moonbough Enclave",
    values: ["living magic", "patient stewardship", "quiet hospitality"] as const,
    roles: ["elderweaver", "leafwarden", "bow-warden", "grovekeeper", "tomekeeper", "potioner", "moonbroker"] as const,
    alignedCreatures: ["glimmerhart", "runeowl"] as const,
    neutralOrbStock: ["unaligned-glimmerhart-orb", "unaligned-runeowl-orb"] as const,
  }),
  dwarves: Object.freeze({
    factionId: "dwarves" as const,
    race: "dwarf" as const,
    name: "Deepgear Holds",
    biome: "snowcap-range" as const,
    settlementName: "Deepgear Hold",
    values: ["tested craft", "kept oaths", "useful mechanisms"] as const,
    roles: ["thane", "gatewarden", "delver", "gearwright", "golemsmith", "powderwright", "provisioner"] as const,
    alignedCreatures: ["copper-mole", "copper-scout-golem"] as const,
    neutralOrbStock: ["unaligned-copper-mole-orb"] as const,
  }),
});

export type V1CultureId = "wood-elves" | "dwarves";
export type V1SettlementStyle = "tiled-grove" | "subterranean-hold";
export type V1TileRole =
  | "civic-hall"
  | "home"
  | "guard-post"
  | "market"
  | "garden"
  | "library"
  | "alchemy"
  | "forge"
  | "golem-forge"
  | "powderworks"
  | "mine"
  | "kennel"
  | "storage";

export type V1SettlementTile = Readonly<{
  id: string;
  gridX: number;
  gridZ: number;
  yOffset: number;
  role: V1TileRole;
  width: number;
  depth: number;
  floors: 1 | 2;
  rotation: 0 | 1 | 2 | 3;
  pathConnections: readonly ("north" | "east" | "south" | "west")[];
}>;

export type V1SettlementPlan = Readonly<{
  schema: typeof V1_CULTURE_SCHEMA;
  id: string;
  factionId: V1CultureId;
  style: V1SettlementStyle;
  tileSize: number;
  gridRadius: number;
  surfaceEntrance: Readonly<{ gridX: number; gridZ: number; yOffset: number }>;
  tiles: readonly V1SettlementTile[];
  wallTiles: readonly Readonly<{ gridX: number; gridZ: number; gate: boolean }>[];
  lanternTiles: readonly Readonly<{ gridX: number; gridZ: number; yOffset: number; brightness: number }>[];
  populationTarget: number;
}>;

function hash32(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function unit(seed: string, salt: string | number) {
  return hash32(`${seed}|${salt}`) / 4294967296;
}

function pick<T>(values: readonly T[], seed: string, salt: string | number) {
  return values[Math.min(values.length - 1, Math.floor(unit(seed, salt) * values.length))];
}

export const SETTLEMENT_CARDINALS = ["north", "east", "south", "west"] as const;
export type SettlementCardinal = (typeof SETTLEMENT_CARDINALS)[number];
export type ConnectedSettlementTile = Readonly<{
  gridX: number;
  gridZ: number;
  pathConnections: readonly SettlementCardinal[];
}>;

export const SETTLEMENT_TILE_COUNT_BANDS = Object.freeze({
  hamlet: Object.freeze({ min: 10, max: 16 }),
  village: Object.freeze({ min: 17, max: 25 }),
  town: Object.freeze({ min: 26, max: 36 }),
});

/** Category gives the scale; the seed gives each settlement its own footprint. */
export function settlementTileCount(size: keyof typeof SETTLEMENT_TILE_COUNT_BANDS, seed: string) {
  const band = SETTLEMENT_TILE_COUNT_BANDS[size];
  return band.min + (hash32(`${seed}|settlement-tile-count`) % (band.max - band.min + 1));
}

/**
 * Shared deterministic town graph used by every culture adapter. New cells are
 * only admitted from the frontier of the existing graph, which guarantees a
 * walkable route back to the civic tile while still producing seed-shaped
 * branches, loops, and courtyards rather than a fixed radial template.
 */
export function planConnectedSettlementTiles(input: Readonly<{
  seed: string;
  targetTiles: number;
  gridRadius: number;
}>): readonly ConnectedSettlementTile[] {
  const gridRadius = Math.max(1, Math.min(12, Math.floor(input.gridRadius)));
  const capacity = (gridRadius * 2 + 1) ** 2;
  const targetTiles = Math.max(1, Math.min(capacity, Math.floor(input.targetTiles)));
  const occupied = new Set<string>(["0,0"]);
  const frontier: Array<readonly [number, number]> = [];
  const queued = new Set<string>();
  const enqueue = (gridX: number, gridZ: number) => {
    const key = `${gridX},${gridZ}`;
    if (Math.abs(gridX) > gridRadius || Math.abs(gridZ) > gridRadius || occupied.has(key) || queued.has(key)) return;
    queued.add(key);
    frontier.push([gridX, gridZ]);
  };
  enqueue(1, 0);
  enqueue(-1, 0);
  enqueue(0, 1);
  enqueue(0, -1);
  let cursor = 0;
  while (occupied.size < targetTiles && frontier.length > 0 && cursor < capacity * 8) {
    const index = Math.min(frontier.length - 1, Math.floor(unit(input.seed, `connected-frontier-${cursor}`) * frontier.length));
    const [gridX, gridZ] = frontier.splice(index, 1)[0];
    queued.delete(`${gridX},${gridZ}`);
    cursor += 1;
    if (occupied.has(`${gridX},${gridZ}`)) continue;
    occupied.add(`${gridX},${gridZ}`);
    enqueue(gridX + 1, gridZ);
    enqueue(gridX - 1, gridZ);
    enqueue(gridX, gridZ + 1);
    enqueue(gridX, gridZ - 1);
  }

  const offsets = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;
  return [...occupied]
    .map((key) => key.split(",").map(Number) as [number, number])
    .sort(([ax, az], [bx, bz]) => (Math.abs(ax) + Math.abs(az)) - (Math.abs(bx) + Math.abs(bz)) || Math.atan2(az, ax) - Math.atan2(bz, bx))
    .map(([gridX, gridZ]) => ({
      gridX,
      gridZ,
      pathConnections: SETTLEMENT_CARDINALS.filter((_, index) => occupied.has(`${gridX + offsets[index][0]},${gridZ + offsets[index][1]}`)),
    }));
}

/**
 * Wood-elf enclaves use an irregular but fully connected surface tile grid.
 * Dwarven holds use the same safe graph below ground, with a single ramped
 * surface gate and deeper industrial tiles so no room floats independently.
 */
export function planV1Settlement(input: Readonly<{
  seed: string;
  regionX: number;
  regionZ: number;
  factionId: V1CultureId;
  size: "hamlet" | "village" | "town";
}>): V1SettlementPlan {
  const style: V1SettlementStyle = input.factionId === "wood-elves" ? "tiled-grove" : "subterranean-hold";
  const gridRadius = input.size === "hamlet" ? 2 : input.size === "village" ? 3 : 4;
  const id = `${input.factionId}-${input.regionX.toString(36)}-${input.regionZ.toString(36)}-${hash32(`${input.seed}|${input.factionId}|${input.regionX}|${input.regionZ}`).toString(36)}`;
  const targetTiles = settlementTileCount(input.size, id);
  const tileGrid = planConnectedSettlementTiles({ seed: id, targetTiles, gridRadius });

  const woodElfRoles: readonly V1TileRole[] = [
    "civic-hall", "guard-post", "library", "market", "garden", "home", "home", "alchemy", "kennel", "garden", "home", "storage",
  ];
  const dwarfRoles: readonly V1TileRole[] = [
    "civic-hall", "guard-post", "golem-forge", "forge", "market", "home", "mine", "powderworks", "home", "kennel", "storage", "home",
  ];
  const roles = input.factionId === "wood-elves" ? woodElfRoles : dwarfRoles;
  const tiles = tileGrid.map(({ gridX, gridZ, pathConnections }, index): V1SettlementTile => {
    const role = index < roles.length ? roles[index] : pick(
      input.factionId === "wood-elves" ? ["home", "garden", "home", "storage"] as const : ["home", "mine", "storage", "forge"] as const,
      id,
      `role-${index}`,
    );
    const civic = role === "civic-hall" || role === "library" || role === "golem-forge";
    const yOffset = style === "subterranean-hold" ? -12 - Math.min(10, Math.max(0, Math.abs(gridX) + Math.abs(gridZ) - 1) * 2) : 0;
    return {
      id: `${id}-tile-${index}`,
      gridX,
      gridZ,
      yOffset,
      role,
      width: civic ? 9 : 5 + Math.floor(unit(id, `width-${index}`) * 3),
      depth: civic ? 9 : 5 + Math.floor(unit(id, `depth-${index}`) * 3),
      floors: civic || (input.size === "town" && index % 7 === 0) ? 2 : 1,
      rotation: Math.floor(unit(id, `rotation-${index}`) * 4) as 0 | 1 | 2 | 3,
      pathConnections,
    };
  });

  const gateSide = Math.floor(unit(id, "gate-side") * 4);
  const gateCoordinate = gateSide % 2 === 0
    ? { gridX: Math.round((unit(id, "gate-slide") * 2 - 1) * gridRadius), gridZ: gateSide === 0 ? -gridRadius - 1 : gridRadius + 1 }
    : { gridX: gateSide === 1 ? gridRadius + 1 : -gridRadius - 1, gridZ: Math.round((unit(id, "gate-slide") * 2 - 1) * gridRadius) };
  const wallTiles: Array<{ gridX: number; gridZ: number; gate: boolean }> = [];
  for (let x = -gridRadius - 1; x <= gridRadius + 1; x += 1) {
    wallTiles.push({ gridX: x, gridZ: -gridRadius - 1, gate: x === gateCoordinate.gridX && gateCoordinate.gridZ < 0 });
    wallTiles.push({ gridX: x, gridZ: gridRadius + 1, gate: x === gateCoordinate.gridX && gateCoordinate.gridZ > 0 });
  }
  for (let z = -gridRadius; z <= gridRadius; z += 1) {
    wallTiles.push({ gridX: -gridRadius - 1, gridZ: z, gate: z === gateCoordinate.gridZ && gateCoordinate.gridX < 0 });
    wallTiles.push({ gridX: gridRadius + 1, gridZ: z, gate: z === gateCoordinate.gridZ && gateCoordinate.gridX > 0 });
  }

  const lanternTiles = tiles
    .filter((tile, index) => index === 0 || tile.role === "guard-post" || tile.role === "golem-forge" || index % 3 === 0)
    .map((tile) => ({ gridX: tile.gridX, gridZ: tile.gridZ, yOffset: tile.yOffset + 2, brightness: input.factionId === "dwarves" ? 15 : 12 }));

  return {
    schema: V1_CULTURE_SCHEMA,
    id,
    factionId: input.factionId,
    style,
    tileSize: input.factionId === "wood-elves" ? 11 : 10,
    gridRadius,
    surfaceEntrance: { ...gateCoordinate, yOffset: style === "subterranean-hold" ? 0 : 0 },
    tiles,
    wallTiles,
    lanternTiles,
    populationTarget: input.size === "hamlet" ? 11 : input.size === "village" ? 20 : 32,
  };
}

export type GolemType = "copper-scout" | "stone-bulwark" | "aetherforged-sentinel" | "deepgear-courser";
export type GolemRecipe = Readonly<{
  type: GolemType;
  name: string;
  blueprintId: string;
  manaCost: number;
  seconds: number;
  resources: Readonly<Record<string, number>>;
  health: number;
  damage: number;
  role: "utility" | "defender" | "guardian" | "mount";
}>;

export const GOLEM_RECIPES: Readonly<Record<GolemType, GolemRecipe>> = Object.freeze({
  "copper-scout": Object.freeze({
    type: "copper-scout", name: "Copper Scout", blueprintId: "golem-copper-scout", manaCost: 35, seconds: 45,
    resources: { "copper-ore": 12, "crystal-shard": 1, "gear-cluster": 2 }, health: 34, damage: 4, role: "utility",
  }),
  "stone-bulwark": Object.freeze({
    type: "stone-bulwark", name: "Stone Bulwark", blueprintId: "golem-stone-bulwark", manaCost: 80, seconds: 90,
    resources: { "stone-brick": 24, "sunmetal-ingot": 6, "crystal-shard": 2, "gear-cluster": 4 }, health: 92, damage: 9, role: "defender",
  }),
  "aetherforged-sentinel": Object.freeze({
    type: "aetherforged-sentinel", name: "Aetherforged Sentinel", blueprintId: "golem-aetherforged-sentinel", manaCost: 180, seconds: 180,
    resources: { "deepgear-alloy": 18, "gold-ingot": 8, "crystal-shard": 5, "gear-cluster": 8 }, health: 168, damage: 16, role: "guardian",
  }),
  "deepgear-courser": Object.freeze({
    type: "deepgear-courser", name: "Deepgear Courser", blueprintId: "golem-deepgear-courser", manaCost: 110, seconds: 120,
    resources: { "deepgear-alloy": 14, "copper-ore": 20, "crystal-shard": 3, "gear-cluster": 6 }, health: 58, damage: 6, role: "mount",
  }),
});

export type GolemForgeJob = Readonly<{
  golemType: GolemType;
  startedAt: number;
  progressSeconds: number;
  manaCommitted: number;
}>;

export type GolemForgeState = Readonly<{
  schema: 1;
  unlockedBlueprintIds: readonly string[];
  storedMana: number;
  job: GolemForgeJob | null;
  completed: readonly GolemType[];
}>;

export function createGolemForgeState(): GolemForgeState {
  return { schema: 1, unlockedBlueprintIds: [], storedMana: 0, job: null, completed: [] };
}

export function normalizeGolemForgeState(value: unknown): GolemForgeState {
  if (!value || typeof value !== "object") return createGolemForgeState();
  const raw = value as Partial<GolemForgeState>;
  const validTypes = new Set(Object.keys(GOLEM_RECIPES));
  const completed = Array.isArray(raw.completed) ? raw.completed.filter((entry): entry is GolemType => typeof entry === "string" && validTypes.has(entry)).slice(0, 8) : [];
  const unlockedBlueprintIds = Array.isArray(raw.unlockedBlueprintIds)
    ? [...new Set(raw.unlockedBlueprintIds.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim().slice(0, 80)).filter(Boolean))].slice(0, 64)
    : [];
  let job: GolemForgeJob | null = null;
  if (raw.job && typeof raw.job === "object") {
    const candidate = raw.job as Partial<GolemForgeJob>;
    if (typeof candidate.golemType === "string" && validTypes.has(candidate.golemType)) {
      job = {
        golemType: candidate.golemType as GolemType,
        startedAt: Math.max(0, Number.isFinite(candidate.startedAt) ? Math.floor(candidate.startedAt as number) : 0),
        progressSeconds: Math.max(0, Number.isFinite(candidate.progressSeconds) ? candidate.progressSeconds as number : 0),
        manaCommitted: Math.max(0, Number.isFinite(candidate.manaCommitted) ? Math.floor(candidate.manaCommitted as number) : 0),
      };
    }
  }
  return {
    schema: 1,
    unlockedBlueprintIds,
    storedMana: Math.max(0, Number.isFinite(raw.storedMana) ? Math.floor(raw.storedMana as number) : 0),
    job,
    completed,
  };
}

export function chargeGolemForge(state: GolemForgeState, mana: number) {
  const safe = normalizeGolemForgeState(state);
  const amount = Math.max(0, Math.floor(Number.isFinite(mana) ? mana : 0));
  return { ...safe, storedMana: Math.min(Number.MAX_SAFE_INTEGER, safe.storedMana + amount) };
}

export function unlockGolemBlueprint(state: GolemForgeState, blueprintId: string) {
  const safe = normalizeGolemForgeState(state);
  const clean = blueprintId.trim().slice(0, 80);
  if (!clean || safe.unlockedBlueprintIds.includes(clean)) return safe;
  return { ...safe, unlockedBlueprintIds: [...safe.unlockedBlueprintIds, clean] };
}

export function startGolemForge(
  state: GolemForgeState,
  golemType: GolemType,
  availableResources: Readonly<Record<string, number>>,
  startedAt: number,
) {
  const safe = normalizeGolemForgeState(state);
  const recipe = GOLEM_RECIPES[golemType];
  if (safe.job || safe.completed.length >= 4) return { ok: false, reason: safe.job ? "busy" : "output-full", state: safe, consumed: {} } as const;
  if (!safe.unlockedBlueprintIds.includes(recipe.blueprintId)) return { ok: false, reason: "blueprint-locked", state: safe, consumed: {} } as const;
  if (safe.storedMana < recipe.manaCost) return { ok: false, reason: "insufficient-mana", state: safe, consumed: {} } as const;
  for (const [itemKey, amount] of Object.entries(recipe.resources)) {
    if (Math.max(0, Math.floor(availableResources[itemKey] ?? 0)) < amount) return { ok: false, reason: "missing-resources", state: safe, consumed: {} } as const;
  }
  return {
    ok: true,
    reason: "ok",
    consumed: recipe.resources,
    state: {
      ...safe,
      storedMana: safe.storedMana - recipe.manaCost,
      job: { golemType, startedAt: Math.max(0, Math.floor(startedAt)), progressSeconds: 0, manaCommitted: recipe.manaCost },
    },
  } as const;
}

export function advanceGolemForge(state: GolemForgeState, deltaSeconds: number) {
  const safe = normalizeGolemForgeState(state);
  if (!safe.job) return safe;
  const recipe = GOLEM_RECIPES[safe.job.golemType];
  const progressSeconds = Math.min(recipe.seconds, safe.job.progressSeconds + Math.max(0, Number.isFinite(deltaSeconds) ? deltaSeconds : 0));
  if (progressSeconds < recipe.seconds) return { ...safe, job: { ...safe.job, progressSeconds } };
  return { ...safe, job: null, completed: [...safe.completed, safe.job.golemType].slice(0, 4) };
}

export function claimForgedGolem(state: GolemForgeState, index = 0) {
  const safe = normalizeGolemForgeState(state);
  const target = Math.max(0, Math.min(safe.completed.length - 1, Math.floor(index)));
  if (safe.completed.length === 0) return { ok: false, state: safe, golemType: null } as const;
  const completed = [...safe.completed];
  const [golemType] = completed.splice(target, 1);
  return { ok: true, state: { ...safe, completed }, golemType } as const;
}

export type SeaDragonTravelMode = "swim" | "walk" | "fly";
export type SeaDragonAttributes = Readonly<{
  level: number;
  swimSpeed: number;
  walkSpeed: number;
  flightSpeed: number;
  turnRate: number;
  breathDamage: number;
  biteDamage: number;
  maxHealth: number;
}>;

/** Sea dragons dominate water, remain capable on shore, and fly deliberately. */
export function seaDragonAttributes(stage: 1 | 2 | 3 | 4 | 5, level: number): SeaDragonAttributes {
  const safeLevel = Math.max(1, Math.min(1_000, Math.floor(Number.isFinite(level) ? level : 1)));
  const growth = 1 + (safeLevel - 1) * 0.004;
  return {
    level: safeLevel,
    swimSpeed: (4.8 + stage * 1.25) * growth,
    walkSpeed: (2.1 + stage * 0.46) * growth,
    flightSpeed: (2.7 + stage * 0.68) * growth,
    turnRate: Math.max(1.4, 4.8 - stage * 0.48),
    breathDamage: Math.round((5 + stage * 5.2) * growth),
    biteDamage: Math.round((7 + stage * 5.8) * growth),
    maxHealth: Math.round((55 + stage * stage * 44) * growth),
  };
}

export function seaDragonSpeedForMode(attributes: SeaDragonAttributes, mode: SeaDragonTravelMode) {
  return mode === "swim" ? attributes.swimSpeed : mode === "fly" ? attributes.flightSpeed : attributes.walkSpeed;
}

export type SeaDragonNestPlan = Readonly<{
  schema: 1;
  id: string;
  center: Readonly<{ x: number; y: number; z: number }>;
  radius: number;
  guardianStage: 3 | 4 | 5;
  guardianSex: "female" | "male";
  eggs: number;
  palette: readonly ["moon-slate", "reefglass", "abyss-bloom"];
  mapStockFaction: "atlantians";
  questEventId: "sea-dragon-nest-discovered";
}>;

/** One rare abyssal nest candidate per 48x48-chunk region. */
export function planSeaDragonNest(input: Readonly<{
  seed: string;
  regionX: number;
  regionZ: number;
  oceanFloorY: number;
  biome: "deep-ocean" | "lumen-trench" | string;
}>): SeaDragonNestPlan | null {
  if (input.biome !== "deep-ocean" && input.biome !== "lumen-trench") return null;
  const salt = `${input.seed}|sea-dragon-nest|${input.regionX}|${input.regionZ}`;
  if (unit(salt, "rarity") >= 0.115) return null;
  const regionSize = 48 * 16;
  const stageRoll = unit(salt, "stage");
  const guardianStage: 3 | 4 | 5 = stageRoll < 0.54 ? 3 : stageRoll < 0.9 ? 4 : 5;
  const guardianSex = unit(salt, "sex") < 0.56 ? "female" : "male";
  return {
    schema: 1,
    id: `sea-nest-${input.regionX.toString(36)}-${input.regionZ.toString(36)}-${hash32(salt).toString(36)}`,
    center: {
      x: input.regionX * regionSize + 128 + Math.floor(unit(salt, "x") * (regionSize - 256)),
      y: Math.max(-58, Math.min(10, Math.floor(input.oceanFloorY) + 2)),
      z: input.regionZ * regionSize + 128 + Math.floor(unit(salt, "z") * (regionSize - 256)),
    },
    radius: 11 + guardianStage * 2,
    guardianStage,
    guardianSex,
    eggs: guardianSex === "female" ? 1 + (unit(salt, "eggs") > 0.72 ? 1 : 0) : 0,
    palette: ["moon-slate", "reefglass", "abyss-bloom"],
    mapStockFaction: "atlantians",
    questEventId: "sea-dragon-nest-discovered",
  };
}

export const WOOD_ELF_LEAF_ATTACK = Object.freeze({
  id: "verdant-volley",
  spellId: "verdant-volley",
  manaCost: 7,
  cooldownSeconds: 1.35,
  range: 22,
  speed: 29,
  damage: 6,
  projectileCount: 3,
  spreadRadians: 0.085,
  status: "rooted" as const,
  statusSeconds: 0.8,
  visual: "three luminous leaves spiral around a pale-green staff before flying edge-first",
  sound: "spell.verdant.volley",
});

export type GolemDefenseAction = "idle" | "pursue" | "melee" | "ranged";

/** Shared decision rule for faction-aligned constructs guarding a settlement. */
export function alignedGolemDefenseAction(input: Readonly<{
  aligned: boolean;
  settlementId: string | null;
  targetHostile: boolean;
  lineOfSight: boolean;
  distance: number;
  attackRange: number;
  ranged: boolean;
  cooldownSeconds: number;
}>): GolemDefenseAction {
  if (!input.aligned || !input.settlementId || !input.targetHostile || !input.lineOfSight || input.distance > 18) return "idle";
  if (input.cooldownSeconds > 0) return "pursue";
  if (input.ranged && input.distance >= 3 && input.distance <= 12) return "ranged";
  if (input.distance <= input.attackRange + 0.35) return "melee";
  return "pursue";
}

export const V1_FUTURE_ONLY = Object.freeze([
  "human settlements",
  "human muskets",
  "Mekanism-style drills and machinery",
  "chunk loaders",
  "creature evolutions and cross-species hybrids",
] as const);
