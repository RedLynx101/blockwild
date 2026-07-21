import {
  FACTIONS,
  NPC_FACTION_IDS,
  checkAuthority,
  factionCanOccupyEnvironment,
  raceBreathesWater,
  normalizeEnabledFactions,
  stampAuthority,
  type AuthorityCommand,
  type AuthorityStampedState,
  type FactionId,
  type FactionRace,
  type NpcFactionId,
  type TownCaptureReceipt,
} from "./factions.ts";
import type { GoldAmount, MerchantProfession } from "./economy.ts";
import type { GuildHallState, GuildId } from "./guilds.ts";
import { planConnectedSettlementTiles, planV1Settlement, settlementTileCount, type V1TileRole } from "./v1-cultures.ts";

export type SettlementSize = "hamlet" | "village" | "town";
export type SettlementPoint = Readonly<{ x: number; z: number; y?: number }>;
export type SettlementEnvironment = "surface" | "underwater" | "underground";
export type SettlementTopology = "walled-surface" | "open-underwater" | "subterranean-hold";
export type SettlementBiome =
  | "forest"
  | "wildwood"
  | "meadow"
  | "flower-meadow"
  | "river-valley"
  | "highlands"
  | "badlands"
  | "cloudreed-glen"
  | "rocky-forest"
  | "deep-ocean"
  | "lumen-trench"
  | "sugarplum-vale"
  | "glimmerwood"
  | "snowcap-range";

export const SETTLEMENT_SIZE_RULES: Readonly<Record<SettlementSize, Readonly<{
  radiusBlocks: number;
  buildingCount: number;
  populationTarget: number;
  populationHardLimit: number;
  minimumSpacingChunks: number;
  gateCount: number;
}>>> = {
  hamlet: { radiusBlocks: 14, buildingCount: 13, populationTarget: 7, populationHardLimit: 14, minimumSpacingChunks: 24, gateCount: 2 },
  village: { radiusBlocks: 22, buildingCount: 21, populationTarget: 15, populationHardLimit: 30, minimumSpacingChunks: 32, gateCount: 3 },
  town: { radiusBlocks: 31, buildingCount: 31, populationTarget: 26, populationHardLimit: 48, minimumSpacingChunks: 42, gateCount: 4 },
};

export type SettlementCandidate = Readonly<{
  schema: 1;
  id: string;
  worldSeed: string;
  regionX: number;
  regionZ: number;
  center: SettlementPoint;
  size: SettlementSize;
  factionId: Exclude<FactionId, "player">;
  biome: SettlementBiome;
  environment?: SettlementEnvironment;
  floorY?: number;
}>;

export type ExistingSettlementLocation = Readonly<{
  center: SettlementPoint;
  size: SettlementSize;
}>;

function hash32(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function hashUnit(seed: string, salt: string | number) {
  return hash32(`${seed}|${salt}`) / 4294967296;
}

function hashPick<T>(values: readonly T[], seed: string, salt: string | number) {
  return values[Math.min(values.length - 1, Math.floor(hashUnit(seed, salt) * values.length))];
}

export function settlementId(worldSeed: string, regionX: number, regionZ: number, factionId: Exclude<FactionId, "player">) {
  const prefix = factionId === "hobbits" ? "freehold"
    : factionId === "goblins" ? "clanhold"
      : factionId === "atlantians" ? "tidehold"
        : factionId === "sugarcourt" ? "bonbon-borough"
          : factionId === "wood-elves" ? "moonbough-enclave" : "deepgear-hold";
  return `${prefix}-${regionX.toString(36)}-${regionZ.toString(36)}-${hash32(`${worldSeed}|${regionX}|${regionZ}|${factionId}`).toString(36)}`;
}

export function settlementBiomeEligible(factionId: Exclude<FactionId, "player">, biome: string) {
  return FACTIONS[factionId].homeBiomes.includes(biome);
}

function chooseFactionForBiome(
  worldSeed: string,
  regionX: number,
  regionZ: number,
  biome: SettlementBiome,
  enabledFactions: readonly NpcFactionId[] = NPC_FACTION_IDS,
): NpcFactionId | null {
  const enabled = new Set(enabledFactions);
  const eligible = NPC_FACTION_IDS.filter((factionId) => enabled.has(factionId) && settlementBiomeEligible(factionId, biome));
  if (eligible.length === 0) return null;
  return eligible[Math.min(eligible.length - 1, Math.floor(hashUnit(worldSeed, `${regionX}|${regionZ}|faction`) * eligible.length))];
}

export function hasSettlementSpacing(candidate: Pick<SettlementCandidate, "center" | "size">, existing: readonly ExistingSettlementLocation[]) {
  const required = SETTLEMENT_SIZE_RULES[candidate.size].minimumSpacingChunks * 16;
  return existing.every((other) => Math.hypot(other.center.x - candidate.center.x, other.center.z - candidate.center.z) >= Math.max(required, SETTLEMENT_SIZE_RULES[other.size].minimumSpacingChunks * 16));
}

/**
 * Candidate generation happens independently per region, so spacing conflicts
 * need a deterministic winner that does not depend on which chunk loaded first.
 */
export function settlementWinsSpacingTieBreak(candidate: SettlementCandidate, contenders: readonly SettlementCandidate[]) {
  const candidateRank = hash32(`${candidate.worldSeed}|settlement-spacing|${candidate.id}`);
  for (const other of contenders) {
    if (other.id === candidate.id || hasSettlementSpacing(candidate, [other])) continue;
    const otherRank = hash32(`${other.worldSeed}|settlement-spacing|${other.id}`);
    if (otherRank < candidateRank || (otherRank === candidateRank && other.id < candidate.id)) return false;
  }
  return true;
}

/**
 * One bounded candidate per 32x32-chunk region. World generation relocates
 * this regional identity onto the best viable site before spacing is applied.
 */
export function planSettlementCandidate(input: Readonly<{
  worldSeed: string;
  regionX: number;
  regionZ: number;
  biome: SettlementBiome;
  existing: readonly ExistingSettlementLocation[];
  floorY?: number;
  enabledFactions?: readonly NpcFactionId[];
  /** World terrain site search already applies its own regional rarity gate. */
  siteSearch?: boolean;
}>): SettlementCandidate | null {
  const enabledFactions = input.enabledFactions === undefined ? NPC_FACTION_IDS : normalizeEnabledFactions(input.enabledFactions);
  const factionId = chooseFactionForBiome(input.worldSeed, input.regionX, input.regionZ, input.biome, enabledFactions);
  const density = factionId === "atlantians" ? 0.28 : factionId === "sugarcourt" ? 0.4 : factionId === "wood-elves" ? 0.34 : factionId === "dwarves" ? 0.32 : 0.48;
  if (!factionId || (!input.siteSearch && hashUnit(input.worldSeed, `${input.regionX}|${input.regionZ}|density`) >= density)) return null;
  const sizeRoll = hashUnit(input.worldSeed, `${input.regionX}|${input.regionZ}|size`);
  const size: SettlementSize = sizeRoll < 0.58 ? "hamlet" : sizeRoll < 0.9 ? "village" : "town";
  const regionSizeBlocks = 32 * 16;
  const environment: SettlementEnvironment = factionId === "atlantians" ? "underwater" : factionId === "dwarves" ? "underground" : "surface";
  const floorY = environment === "underwater"
    ? Math.max(-52, Math.min(22, Math.floor(input.floorY ?? (input.biome === "lumen-trench" ? -28 : 10))))
    : environment === "underground" ? Math.max(-48, Math.min(58, Math.floor(input.floorY ?? 48) - 18))
    : undefined;
  const center: SettlementPoint = {
    x: input.regionX * regionSizeBlocks + 96 + Math.floor(hashUnit(input.worldSeed, `${input.regionX}|${input.regionZ}|x`) * 320),
    z: input.regionZ * regionSizeBlocks + 96 + Math.floor(hashUnit(input.worldSeed, `${input.regionX}|${input.regionZ}|z`) * 320),
    ...(floorY === undefined ? {} : { y: floorY + 2 }),
  };
  const candidate: SettlementCandidate = {
    schema: 1,
    id: settlementId(input.worldSeed, input.regionX, input.regionZ, factionId),
    worldSeed: input.worldSeed,
    regionX: input.regionX,
    regionZ: input.regionZ,
    center,
    size,
    factionId,
    biome: input.biome,
    environment,
    ...(floorY === undefined ? {} : { floorY }),
  };
  return hasSettlementSpacing(candidate, input.existing) ? candidate : null;
}

export type SettlementBuildingRole =
  | "mayor-hall"
  | "home"
  | "guardhouse"
  | "market"
  | "farm"
  | "wheat-mill"
  | "mine-store"
  | "blacksmith"
  | "bank"
  | "brewery"
  | "alchemist"
  | "warg-kennel"
  | "warehouse"
  | "tide-hall"
  | "kelp-garden"
  | "coral-workshop"
  | "pearl-market"
  | "glow-clinic"
  | "guard-grotto"
  | "current-store"
  | "sugar-palace"
  | "bonbon-home"
  | "gumdrop-garden"
  | "sugarworks"
  | "candysmith"
  | "sweet-market"
  | "taffy-kennel"
  | "brittle-barracks"
  | "moonbough-hall"
  | "leafwarden-lodge"
  | "glimmer-library"
  | "moonwell"
  | "living-home"
  | "glow-garden"
  | "enclave-market"
  | "deepgear-hall"
  | "entrance-barracks"
  | "golem-forge"
  | "powderworks"
  | "delver-gallery"
  | "gear-market"
  | "stone-home";

export type SettlementFurniture = Readonly<{
  kind:
    | "bed"
    | "door"
    | "chair"
    | "table"
    | "barrel"
    | "wheat-mill"
    | "distillery"
    | "merchant-counter"
    | "bank-counter"
    | "forge"
    | "nest"
    | "rest-alcove"
    | "kelp-trough"
    | "coral-loom"
    | "pearl-counter"
    | "glow-basin"
    | "sugarworks-kettle"
    | "syrup-vat"
    | "confection-counter"
    | "pet-bed"
    | "moonwell-basin"
    | "tome-lectern"
    | "living-chair"
    | "golem-cradle"
    | "mana-conduit"
    | "powder-bench"
    | "gear-table"
    | "bright-lantern";
  position: SettlementPoint;
  facing: 0 | 1 | 2 | 3;
  functional: boolean;
}>;

export type SettlementBuildingPlan = Readonly<{
  id: string;
  role: SettlementBuildingRole;
  position: SettlementPoint;
  facing: 0 | 1 | 2 | 3;
  width: number;
  depth: number;
  floors: 1 | 2;
  materialPalette: readonly string[];
  furniture: readonly SettlementFurniture[];
  guildHall?: Readonly<{
    placementId: string;
    guildId: GuildId;
    state: GuildHallState;
    variantId: string;
  }>;
}>;

export type SettlementWallNode = Readonly<{
  position: SettlementPoint;
  kind: "wall" | "tower";
}>;

export type SettlementGatePlan = Readonly<{
  id: string;
  position: SettlementPoint;
  facing: 0 | 1 | 2 | 3;
  patrolRadius: number;
}>;

export type SettlementApproachPlan = Readonly<{
  id: string;
  position: SettlementPoint;
  facing: 0 | 1 | 2 | 3;
  patrolRadius: number;
  kind: "open-current" | "trench-arch" | "mountain-entry";
}>;

export type SettlementLightPlan = Readonly<{
  position: SettlementPoint;
  kind:
    | "lantern-post"
    | "window-lantern"
    | "gate-brazier"
    | "glowstone-cluster"
    | "bioluminescent-orb"
    | "lumen-spire"
    | "glimmer-orb"
    | "deepgear-lantern";
  monsterSafeRadius: number;
}>;

export type SettlementVerticalLayer = Readonly<{
  y: number;
  purpose: "reef-floor" | "dwelling-ring" | "current-lane" | "light-canopy" | "surface-entry" | "civic-cavern" | "forge-depth";
}>;

export type SettlementLayoutPlan = Readonly<{
  schema: 1;
  settlementId: string;
  center: SettlementPoint;
  environment: SettlementEnvironment;
  topology: SettlementTopology;
  radiusBlocks: number;
  buildings: readonly SettlementBuildingPlan[];
  paths: readonly SettlementPoint[];
  wall: readonly SettlementWallNode[];
  gates: readonly SettlementGatePlan[];
  approaches: readonly SettlementApproachPlan[];
  lights: readonly SettlementLightPlan[];
  verticalLayers: readonly SettlementVerticalLayer[];
  beds: number;
  doors: number;
  nests: number;
  restAlcoves: number;
  populationSoftCap: number;
}>;

function expandBuildingRoles(
  authored: readonly SettlementBuildingRole[],
  fillers: readonly SettlementBuildingRole[],
  target: number,
  seed: string,
) {
  const roles = authored.slice(0, target);
  while (roles.length < target) roles.push(hashPick(fillers, seed, `role-${roles.length}`));
  return roles;
}

function buildingRoles(factionId: Exclude<FactionId, "player">, size: SettlementSize, seed: string = factionId, target = settlementTileCount(size, seed)) {
  if (factionId === "wood-elves") {
    const roles: SettlementBuildingRole[] = [
      "moonbough-hall", "leafwarden-lodge", "glimmer-library", "enclave-market", "living-home", "glow-garden",
      "moonwell", "living-home", "glow-garden", "living-home", "leafwarden-lodge", "enclave-market",
      "living-home", "glimmer-library", "glow-garden", "living-home", "moonwell", "living-home",
    ];
    return expandBuildingRoles(roles, ["living-home", "glow-garden", "living-home", "moonwell", "leafwarden-lodge"], target, seed);
  }
  if (factionId === "dwarves") {
    const roles: SettlementBuildingRole[] = [
      "deepgear-hall", "entrance-barracks", "golem-forge", "gear-market", "stone-home", "delver-gallery",
      "powderworks", "stone-home", "blacksmith", "stone-home", "entrance-barracks", "warehouse",
      "stone-home", "golem-forge", "delver-gallery", "gear-market", "stone-home", "powderworks",
    ];
    return expandBuildingRoles(roles, ["stone-home", "delver-gallery", "stone-home", "warehouse", "gear-market"], target, seed);
  }
  if (factionId === "atlantians") {
    const aquatic: SettlementBuildingRole[] = [
      "tide-hall", "guard-grotto", "pearl-market", "home", "kelp-garden", "coral-workshop",
      "glow-clinic", "home", "current-store", "kelp-garden", "guard-grotto", "home",
      "coral-workshop", "pearl-market", "home", "glow-clinic", "current-store", "kelp-garden",
    ];
    return expandBuildingRoles(aquatic, ["home", "kelp-garden", "home", "coral-workshop", "current-store", "guard-grotto"], target, seed);
  }
  if (factionId === "sugarcourt") {
    const sugarcourt: SettlementBuildingRole[] = [
      "sugar-palace", "brittle-barracks", "sweet-market", "bonbon-home", "bonbon-home", "gumdrop-garden",
      "sugarworks", "candysmith", "taffy-kennel", "bonbon-home", "gumdrop-garden", "sweet-market",
      "bonbon-home", "brittle-barracks", "sugarworks", "bonbon-home", "gumdrop-garden", "candysmith",
    ];
    return expandBuildingRoles(sugarcourt, ["bonbon-home", "gumdrop-garden", "bonbon-home", "sweet-market", "taffy-kennel"], target, seed);
  }
  const agrarianRole: SettlementBuildingRole = factionId === "hobbits" ? "wheat-mill" : "farm";
  const common: SettlementBuildingRole[] = ["mayor-hall", "guardhouse", "market", "home", "home", agrarianRole];
  const themed: SettlementBuildingRole[] = factionId === "hobbits"
    ? ["brewery", "bank", "wheat-mill", "home", "alchemist", "warehouse"]
    : ["mine-store", "blacksmith", "warg-kennel", "home", "alchemist", "warehouse"];
  const expanded: SettlementBuildingRole[] = [...common, ...themed, "home", "guardhouse", "market", "home", agrarianRole, "warehouse"];
  return expandBuildingRoles(
    expanded,
    factionId === "hobbits"
      ? ["home", "wheat-mill", "home", "brewery", "warehouse", "guardhouse"]
      : ["home", "mine-store", "home", "warg-kennel", "warehouse", "guardhouse"],
    target,
    seed,
  );
}

function paletteFor(factionId: Exclude<FactionId, "player">, role: SettlementBuildingRole) {
  if (factionId === "wood-elves") {
    if (role === "glimmer-library" || role === "moonwell") return ["moonbough-wood", "moon-glass", "dreamblossom-light"];
    if (role === "leafwarden-lodge") return ["living-bark", "glimmerstone", "woven-leaf"];
    return ["moonbough-wood", "living-bark", "woven-leaf"];
  }
  if (factionId === "dwarves") {
    if (role === "golem-forge") return ["deepgear-brick", "riveted-brass", "aether-conduit"];
    if (role === "powderworks") return ["deepgear-brick", "copper", "sealed-stone"];
    return ["deepgear-brick", "riveted-brass", "snowcap-stone"];
  }
  if (factionId === "atlantians") {
    if (role === "tide-hall") return ["reef-stone", "reefglass", "lumen-coral"];
    if (role === "glow-clinic") return ["pale-coral", "reefglass", "glowstone"];
    return ["living-coral", "reef-stone", "reefglass"];
  }
  if (factionId === "hobbits") {
    if (role === "bank") return ["river-stone", "dark-oak", "copper"];
    if (role === "wheat-mill") return ["river-stone", "wildwood", "mossy-thatch", "wheat-mill"];
    return ["wildwood", "plaster", "mossy-thatch"];
  }
  if (factionId === "sugarcourt") {
    if (role === "sugar-palace") return ["boiled-sugarbrick", "candywood", "sugar-glass"];
    if (role === "candysmith" || role === "sugarworks") return ["boiled-sugarbrick", "candywood", "copper-kettle"];
    return ["candywood", "wafer-plaster", "boiled-sugarbrick"];
  }
  return role === "blacksmith" ? ["basalt", "iron", "ember-brick"] : ["stone", "brasswood", "patched-slate"];
}

/** Rotates an interior offset authored with the front door at local -Z. */
function settlementLocalPoint(position: SettlementPoint, facing: 0 | 1 | 2 | 3, x: number, z: number, y = 0): SettlementPoint {
  const rotated = facing === 1 ? { x: -z, z: x }
    : facing === 2 ? { x: -x, z: -z }
      : facing === 3 ? { x: z, z: -x }
        : { x, z };
  return {
    x: position.x + rotated.x,
    z: position.z + rotated.z,
    ...(position.y === undefined ? {} : { y: position.y + y }),
  };
}

function furnitureFor(factionId: Exclude<FactionId, "player">, buildingId: string, role: SettlementBuildingRole, position: SettlementPoint, facing: 0 | 1 | 2 | 3) {
  const entries: SettlementFurniture[] = [];
  const add = (
    kind: SettlementFurniture["kind"],
    x: number,
    z: number,
    y = 0,
    functional = true,
    itemFacing: 0 | 1 | 2 | 3 = facing,
  ) => entries.push({ kind, position: settlementLocalPoint(position, facing, x, z, y), facing: itemFacing, functional });
  const addDoor = () => add("door", 0, -2);
  const addBed = (x: number, z: number) => add("bed", x, z, 0, true, ((facing + 2) & 3) as 0 | 1 | 2 | 3);

  if (factionId === "wood-elves") {
    addDoor();
    // Keep the entrance aisle (local x=0, z<0) open. Beds point toward the
    // rear wall and the chair sits beyond the central table instead of in the
    // doorway when the entire house rotates east, south, or west.
    if (["living-home", "moonbough-hall", "leafwarden-lodge"].includes(role)) { addBed(-1, 0); add("living-chair", 1, 1, 0, true, ((facing + 2) & 3) as 0 | 1 | 2 | 3); }
    if (role === "glimmer-library") { add("tome-lectern", -1, 1); add("tome-lectern", 1, 1); }
    if (role === "moonwell") add("moonwell-basin", 0, 0);
    if (role === "enclave-market") add("merchant-counter", 0, 1);
    add("table", 0, 0);
    void buildingId;
    return entries;
  }
  if (factionId === "dwarves") {
    addDoor();
    if (["stone-home", "deepgear-hall", "entrance-barracks"].includes(role)) addBed(-1, 0);
    if (role === "golem-forge") { add("golem-cradle", 0, 1); add("mana-conduit", 1, 1); }
    if (role === "powderworks") add("powder-bench", 0, 1);
    if (role === "gear-market") add("merchant-counter", 0, 1);
    if (role === "blacksmith") add("forge", 0, 1);
    add("gear-table", 0, 0);
    add("bright-lantern", 1, -1, 2);
    void buildingId;
    return entries;
  }
  if (factionId === "atlantians") {
    if (["home", "tide-hall", "guard-grotto"].includes(role)) add("rest-alcove", -1, 1);
    if (role === "home" || role === "tide-hall") add("nest", 1, 1, 1);
    if (role === "kelp-garden") add("kelp-trough", 0, 0);
    if (role === "coral-workshop") add("coral-loom", 0, 0);
    if (role === "pearl-market") add("pearl-counter", 0, 0);
    if (role === "glow-clinic") add("glow-basin", 0, 0);
    if (role === "current-store") { add("pearl-counter", -1, 0); add("kelp-trough", 1, 0); }
    void buildingId;
    return entries;
  }
  if (factionId === "sugarcourt") {
    addDoor();
    if (["bonbon-home", "sugar-palace", "brittle-barracks"].includes(role)) addBed(-1, 0);
    if (role === "bonbon-home" || role === "sugar-palace") addBed(1, 0);
    add("chair", 0, 1, 0, true, ((facing + 2) & 3) as 0 | 1 | 2 | 3);
    add("table", 0, 0);
    if (role === "sugarworks") { add("sugarworks-kettle", 1, 1); add("syrup-vat", -1, 1); }
    if (role === "gumdrop-garden") add("syrup-vat", 1, 1);
    if (role === "sweet-market") add("confection-counter", 1, 0);
    if (role === "candysmith") add("forge", 1, 1);
    if (role === "taffy-kennel") { add("pet-bed", -1, 1); add("pet-bed", 1, 1); }
    void buildingId;
    return entries;
  }
  addDoor();
  if (role === "home" || role === "mayor-hall" || role === "guardhouse") addBed(-1, 0);
  if (role === "home" || role === "mayor-hall") addBed(1, 0);
  if (role === "wheat-mill") {
    // Keep the doorway and resident anchor clear while giving the farmer a
    // functional, visually distinct workplace rather than another bed-house.
    add("wheat-mill", 0, 1);
    add("barrel", -1, 1);
    add("table", 1, 0);
  } else {
    add("chair", 0, 1, 0, true, ((facing + 2) & 3) as 0 | 1 | 2 | 3);
    add("table", 0, 0);
  }
  if (role === "brewery") { add("barrel", -1, 1); add("distillery", 1, 1); }
  if (role === "bank") add("bank-counter", 1, 0);
  if (role === "market") add("merchant-counter", 1, 0);
  if (role === "blacksmith") add("forge", 1, 1);
  void buildingId;
  return entries;
}

function addLine(points: SettlementPoint[], from: SettlementPoint, to: SettlementPoint, spacing = 2) {
  const vertical = (to.y ?? from.y ?? 0) - (from.y ?? to.y ?? 0);
  const distance = Math.hypot(to.x - from.x, to.z - from.z, vertical);
  const steps = Math.max(1, Math.ceil(distance / spacing));
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    points.push({
      x: Math.round(from.x + (to.x - from.x) * t),
      z: Math.round(from.z + (to.z - from.z) * t),
      ...(from.y === undefined && to.y === undefined ? {} : { y: Math.round((from.y ?? to.y ?? 0) + vertical * t) }),
    });
  }
}

export function calculatePopulationSoftCap(beds: number, doors: number, size: SettlementSize) {
  const rule = SETTLEMENT_SIZE_RULES[size];
  return Math.max(2, Math.min(rule.populationHardLimit, Math.max(0, Math.floor(beds)) + Math.floor(Math.max(0, doors) / 2)));
}

export function calculateAquaticPopulationSoftCap(nests: number, restAlcoves: number, size: SettlementSize) {
  const rule = SETTLEMENT_SIZE_RULES[size];
  const restingCapacity = Math.max(0, Math.floor(nests)) + Math.max(0, Math.floor(restAlcoves));
  return Math.max(2, Math.min(rule.populationHardLimit, restingCapacity));
}

function v1RoleToBuilding(role: V1TileRole, factionId: "wood-elves" | "dwarves"): SettlementBuildingRole {
  if (factionId === "wood-elves") {
    if (role === "civic-hall") return "moonbough-hall";
    if (role === "guard-post") return "leafwarden-lodge";
    if (role === "library") return "glimmer-library";
    if (role === "market") return "enclave-market";
    if (role === "garden") return "glow-garden";
    if (role === "alchemy") return "moonwell";
    return "living-home";
  }
  if (role === "civic-hall") return "deepgear-hall";
  if (role === "guard-post") return "entrance-barracks";
  if (role === "golem-forge") return "golem-forge";
  if (role === "powderworks") return "powderworks";
  if (role === "mine") return "delver-gallery";
  if (role === "market") return "gear-market";
  if (role === "forge") return "blacksmith";
  if (role === "storage") return "warehouse";
  return "stone-home";
}

/** Maps the reusable connected-tile planner into the settlement/world contract. */
function planV1CultureLayout(candidate: SettlementCandidate): SettlementLayoutPlan | null {
  if (candidate.factionId !== "wood-elves" && candidate.factionId !== "dwarves") return null;
  const planned = planV1Settlement({
    seed: candidate.worldSeed,
    regionX: candidate.regionX,
    regionZ: candidate.regionZ,
    factionId: candidate.factionId,
    size: candidate.size,
  });
  const underground = candidate.factionId === "dwarves";
  const tileSize = planned.tileSize;
  const surfaceY = underground ? (candidate.floorY ?? ((candidate.center.y ?? 50) - 18)) + 18 : candidate.center.y;
  const civicY = underground ? candidate.floorY ?? ((surfaceY ?? 50) - 18) : surfaceY;
  const center: SettlementPoint = {
    x: candidate.center.x,
    z: candidate.center.z,
    ...(civicY === undefined ? {} : { y: civicY }),
  };
  const tilePosition = (gridX: number, gridZ: number, yOffset: number): SettlementPoint => ({
    x: center.x + gridX * tileSize,
    z: center.z + gridZ * tileSize,
    ...(underground ? { y: (civicY ?? 0) + Math.min(0, yOffset + 12) } : civicY === undefined ? {} : { y: civicY }),
  });
  const buildings = planned.tiles.map((tile): SettlementBuildingPlan => {
    const position = tilePosition(tile.gridX, tile.gridZ, tile.yOffset);
    const role = v1RoleToBuilding(tile.role, candidate.factionId as "wood-elves" | "dwarves");
    const moonboughHome = candidate.factionId === "wood-elves" && role === "living-home";
    return {
      id: tile.id,
      role,
      position,
      facing: tile.rotation,
      width: moonboughHome ? Math.max(7, tile.width | 1) : tile.width,
      depth: moonboughHome ? Math.max(7, tile.depth | 1) : tile.depth,
      floors: tile.floors,
      materialPalette: paletteFor(candidate.factionId, role),
      furniture: furnitureFor(candidate.factionId, tile.id, role, position, tile.rotation),
    };
  });
  const byGrid = new Map(planned.tiles.map((tile) => [`${tile.gridX},${tile.gridZ}`, tile]));
  const paths: SettlementPoint[] = [];
  for (const tile of planned.tiles) {
    const from = tilePosition(tile.gridX, tile.gridZ, tile.yOffset);
    for (const [direction, dx, dz] of [["east", 1, 0], ["south", 0, 1]] as const) {
      if (!tile.pathConnections.includes(direction)) continue;
      const neighbor = byGrid.get(`${tile.gridX + dx},${tile.gridZ + dz}`);
      if (neighbor) addLine(paths, from, tilePosition(neighbor.gridX, neighbor.gridZ, neighbor.yOffset), underground ? 1 : 2);
    }
  }
  const entrance: SettlementPoint = {
    x: center.x + planned.surfaceEntrance.gridX * tileSize,
    z: center.z + planned.surfaceEntrance.gridZ * tileSize,
    ...(surfaceY === undefined ? {} : { y: surfaceY }),
  };
  const nearestGuard = buildings.find((building) => building.role === (underground ? "entrance-barracks" : "leafwarden-lodge"))?.position ?? center;
  addLine(paths, entrance, nearestGuard, 1);
  const gateFacing = planned.surfaceEntrance.gridZ < 0 ? 0
    : planned.surfaceEntrance.gridX > 0 ? 1
      : planned.surfaceEntrance.gridZ > 0 ? 2 : 3;
  const gate: SettlementGatePlan = { id: `${candidate.id}-main-gate`, position: entrance, facing: gateFacing, patrolRadius: underground ? 9 : 7 };
  const wall: SettlementWallNode[] = [];
  if (!underground) {
    // Planner wall coordinates are expressed in settlement tiles, while the
    // world stamper consumes individual blocks. Expanding each edge here
    // prevents an 11-block gap between what would otherwise only be posts.
    const wallRadius = (planned.gridRadius + 1) * tileSize;
    const gateX = entrance.x;
    const gateZ = entrance.z;
    const pushWall = (x: number, z: number) => {
      if (x === gateX && z === gateZ) return;
      const alongEdge = Math.abs(x - center.x) + Math.abs(z - center.z);
      const corner = Math.abs(x - center.x) === wallRadius && Math.abs(z - center.z) === wallRadius;
      wall.push({
        position: { x, z, ...(center.y === undefined ? {} : { y: center.y }) },
        kind: corner || alongEdge % (tileSize * 2) === 0 ? "tower" : "wall",
      });
    };
    for (let offset = -wallRadius; offset <= wallRadius; offset += 1) {
      pushWall(center.x + offset, center.z - wallRadius);
      pushWall(center.x + offset, center.z + wallRadius);
    }
    for (let offset = -wallRadius + 1; offset < wallRadius; offset += 1) {
      pushWall(center.x - wallRadius, center.z + offset);
      pushWall(center.x + wallRadius, center.z + offset);
    }
  }
  const uniquePaths = [...new Map(paths.map((point) => [`${point.x},${point.y ?? "s"},${point.z}`, point])).values()].slice(0, 1_024);
  const lights: SettlementLightPlan[] = planned.lanternTiles.map((entry) => ({
    position: tilePosition(entry.gridX, entry.gridZ, entry.yOffset),
    kind: candidate.factionId === "wood-elves" ? "glimmer-orb" : "deepgear-lantern",
    monsterSafeRadius: candidate.factionId === "wood-elves" ? 11 : 14,
  }));
  if (underground) lights.push({ position: entrance, kind: "deepgear-lantern", monsterSafeRadius: 18 });
  const furniture = buildings.flatMap((building) => building.furniture);
  const beds = furniture.filter((entry) => entry.kind === "bed").length;
  const doors = furniture.filter((entry) => entry.kind === "door").length;
  return {
    schema: 1,
    settlementId: candidate.id,
    center,
    environment: underground ? "underground" : "surface",
    topology: underground ? "subterranean-hold" : "walled-surface",
    radiusBlocks: (planned.gridRadius + 2) * tileSize,
    buildings,
    paths: uniquePaths,
    wall,
    gates: [gate],
    approaches: underground ? [{ id: `${candidate.id}-mountain-entry`, position: entrance, facing: 0, patrolRadius: 10, kind: "mountain-entry" }] : [],
    lights,
    verticalLayers: underground ? [
      { y: surfaceY ?? (civicY ?? 0) + 18, purpose: "surface-entry" },
      { y: civicY ?? 0, purpose: "civic-cavern" },
      { y: (civicY ?? 0) - 8, purpose: "forge-depth" },
    ] : [],
    beds,
    doors,
    nests: 0,
    restAlcoves: 0,
    populationSoftCap: Math.max(planned.populationTarget, calculatePopulationSoftCap(beds, doors, candidate.size)),
  };
}

/** Emits semantic placements; the world layer remains responsible for blocks. */
export function planSettlementLayout(candidate: SettlementCandidate): SettlementLayoutPlan {
  const v1Layout = planV1CultureLayout(candidate);
  if (v1Layout) return v1Layout;
  const rule = SETTLEMENT_SIZE_RULES[candidate.size];
  const environment: SettlementEnvironment = candidate.environment ?? (candidate.factionId === "atlantians" ? "underwater" : "surface");
  const aquatic = environment === "underwater";
  const center: SettlementPoint = aquatic
    ? { ...candidate.center, y: candidate.center.y ?? (candidate.floorY ?? (candidate.biome === "lumen-trench" ? -28 : 10)) + 2 }
    : candidate.center;
  const targetTiles = settlementTileCount(candidate.size, `${candidate.id}|${candidate.worldSeed}`);
  const roles = buildingRoles(candidate.factionId, candidate.size, candidate.id, targetTiles);
  const gridRadius = candidate.size === "hamlet" ? 2 : candidate.size === "village" ? 3 : 4;
  const tileSize = candidate.factionId === "hobbits" ? 9 : candidate.factionId === "atlantians" ? 11 : 10;
  const tiles = planConnectedSettlementTiles({ seed: `${candidate.id}|${candidate.worldSeed}`, targetTiles: roles.length, gridRadius });
  const tilePoints = new Map<string, SettlementPoint>();
  tiles.forEach((tile, index) => {
    const verticalOffset = aquatic && index > 0
      ? 2 + ((Math.abs(tile.gridX) + Math.abs(tile.gridZ) + index) % 4) * 2
      : 0;
    tilePoints.set(`${tile.gridX},${tile.gridZ}`, {
      x: center.x + tile.gridX * tileSize,
      z: center.z + tile.gridZ * tileSize,
      ...(center.y === undefined ? {} : { y: center.y + verticalOffset }),
    });
  });
  const buildings = tiles.map((tile, index): SettlementBuildingPlan => {
    const role = roles[index];
    const position = tilePoints.get(`${tile.gridX},${tile.gridZ}`) ?? center;
    const facing = Math.floor(hashUnit(candidate.id, `facing-${index}`) * 4) as 0 | 1 | 2 | 3;
    const civicHall = role === "mayor-hall" || role === "tide-hall" || role === "sugar-palace";
    const broadWorkshop = role === "warehouse" || role === "current-store" || role === "sugarworks" || role === "brittle-barracks";
    const width = civicHall ? 9 : broadWorkshop ? 8 : 5 + Math.floor(hashUnit(candidate.id, `width-${index}`) * 3);
    const depth = civicHall ? 9 : broadWorkshop ? 7 : 5 + Math.floor(hashUnit(candidate.id, `depth-${index}`) * 3);
    const id = `${candidate.id}-tile-${index}`;
    return {
      id,
      role,
      position,
      facing,
      width,
      depth,
      floors: civicHall || (candidate.size === "town" && index > 0 && index % 7 === 0) ? 2 : 1,
      materialPalette: paletteFor(candidate.factionId, role),
      furniture: furnitureFor(candidate.factionId, id, role, position, facing),
    };
  });

  const paths: SettlementPoint[] = [];
  for (const tile of tiles) {
    const from = tilePoints.get(`${tile.gridX},${tile.gridZ}`) ?? center;
    for (const [direction, dx, dz] of [["east", 1, 0], ["south", 0, 1]] as const) {
      if (!tile.pathConnections.includes(direction)) continue;
      const neighbor = tilePoints.get(`${tile.gridX + dx},${tile.gridZ + dz}`);
      if (neighbor) addLine(paths, from, neighbor, aquatic ? 1 : 2);
    }
  }

  const perimeterRadius = (gridRadius + 1) * tileSize;
  const startGateSide = Math.floor(hashUnit(candidate.id, "gate-side") * 4);
  const gates: SettlementGatePlan[] = aquatic ? [] : Array.from({ length: rule.gateCount }, (_, index) => {
    const side = (startGateSide + index) % 4;
    const slide = Math.round((hashUnit(candidate.id, `gate-slide-${index}`) * 2 - 1) * Math.min(tileSize, perimeterRadius / 3));
    const position: SettlementPoint = side === 0
      ? { x: center.x + slide, z: center.z - perimeterRadius }
      : side === 1
        ? { x: center.x + perimeterRadius, z: center.z + slide }
        : side === 2
          ? { x: center.x + slide, z: center.z + perimeterRadius }
          : { x: center.x - perimeterRadius, z: center.z + slide };
    return {
      id: `${candidate.id}-gate-${index}`,
      position,
      facing: side as 0 | 1 | 2 | 3,
      patrolRadius: 7 + (candidate.size === "town" ? 2 : 0),
    };
  });
  const closestBuildingTo = (point: SettlementPoint) => buildings.reduce((closest, building) => (
    Math.hypot(building.position.x - point.x, building.position.z - point.z)
      < Math.hypot(closest.position.x - point.x, closest.position.z - point.z) ? building : closest
  ), buildings[0]);
  for (const gate of gates) addLine(paths, closestBuildingTo(gate.position).position, gate.position, 1);

  const approachCount = aquatic ? Math.max(3, Math.min(5, rule.gateCount + 1)) : 0;
  const approaches: SettlementApproachPlan[] = Array.from({ length: approachCount }, (_, index) => {
    const angle = index * Math.PI * 2 / approachCount + hashUnit(candidate.id, "approach-rotation") * 0.45;
    const yOffset = index % 2 === 0 ? 5 : 9;
    return {
      id: `${candidate.id}-current-${index}`,
      position: {
        x: Math.round(center.x + Math.cos(angle) * (perimeterRadius - 2)),
        z: Math.round(center.z + Math.sin(angle) * (perimeterRadius - 2)),
        y: (center.y ?? 0) + yOffset,
      },
      facing: (Math.round(angle / (Math.PI / 2)) & 3) as 0 | 1 | 2 | 3,
      patrolRadius: 8,
      kind: candidate.biome === "lumen-trench" ? "trench-arch" as const : "open-current" as const,
    };
  });
  for (const approach of approaches) addLine(paths, closestBuildingTo(approach.position).position, approach.position, 1);

  const wall: SettlementWallNode[] = [];
  const pushWall = (x: number, z: number) => {
    // A gate occupies one authored perimeter cell. Removing its neighbors made
    // a three-wide breach around a one-wide gate and broke fence continuity.
    if (gates.some((gate) => gate.position.x === x && gate.position.z === z)) return;
    const offset = Math.abs(x - center.x) + Math.abs(z - center.z);
    const corner = Math.abs(x - center.x) === perimeterRadius && Math.abs(z - center.z) === perimeterRadius;
    wall.push({
      position: { x, z, ...(center.y === undefined ? {} : { y: center.y }) },
      kind: corner || offset % (tileSize * 2) === 0 ? "tower" : "wall",
    });
  };
  if (!aquatic) {
    for (let offset = -perimeterRadius; offset <= perimeterRadius; offset += 1) {
      pushWall(center.x + offset, center.z - perimeterRadius);
      pushWall(center.x + offset, center.z + perimeterRadius);
    }
    for (let offset = -perimeterRadius + 1; offset < perimeterRadius; offset += 1) {
      pushWall(center.x - perimeterRadius, center.z + offset);
      pushWall(center.x + perimeterRadius, center.z + offset);
    }
  }

  const uniquePaths = [...new Map(paths.map((point) => [`${point.x},${point.y ?? "s"},${point.z}`, point])).values()].slice(0, 1_024);
  const lights: SettlementLightPlan[] = aquatic
    ? [
      { position: { ...center, y: (center.y ?? 0) + 14 }, kind: "lumen-spire" as const, monsterSafeRadius: 16 },
      ...buildings.map((building, index) => ({
        position: { ...building.position, y: (building.position.y ?? center.y ?? 0) + 3 },
        kind: index % 3 === 0 ? "glowstone-cluster" as const : "bioluminescent-orb" as const,
        monsterSafeRadius: index % 3 === 0 ? 11 : 9,
      })),
      ...approaches.map((approach) => ({ position: approach.position, kind: "glowstone-cluster" as const, monsterSafeRadius: 12 })),
    ].slice(0, 32)
    : [
      ...gates.flatMap((gate) => [
        { position: { x: gate.position.x + (gate.facing % 2 === 0 ? 2 : 0), z: gate.position.z + (gate.facing % 2 === 1 ? 2 : 0) }, kind: "gate-brazier" as const, monsterSafeRadius: 10 },
        { position: { x: gate.position.x - (gate.facing % 2 === 0 ? 2 : 0), z: gate.position.z - (gate.facing % 2 === 1 ? 2 : 0) }, kind: "gate-brazier" as const, monsterSafeRadius: 10 },
      ]),
      ...buildings.filter((_, index) => index === 0 || index % 2 === 0).map((building, index) => ({
        position: {
          x: building.position.x,
          z: building.position.z - Math.floor(building.depth / 2) - 1,
          ...(building.position.y === undefined ? {} : { y: building.position.y + 1 }),
        },
        kind: index % 3 === 0 ? "window-lantern" as const : "lantern-post" as const,
        monsterSafeRadius: 9,
      })),
      ...uniquePaths.filter((_, index) => index % 18 === 0).map((position) => ({ position, kind: "lantern-post" as const, monsterSafeRadius: 8 })),
    ].slice(0, 32);
  const furniture = buildings.flatMap((building) => building.furniture);
  const beds = furniture.filter((entry) => entry.kind === "bed").length;
  const doors = furniture.filter((entry) => entry.kind === "door").length;
  const nests = furniture.filter((entry) => entry.kind === "nest").length;
  const restAlcoves = furniture.filter((entry) => entry.kind === "rest-alcove").length;
  const baseY = center.y ?? 0;
  const verticalLayers: SettlementVerticalLayer[] = aquatic ? [
    { y: candidate.floorY ?? baseY - 2, purpose: "reef-floor" },
    { y: baseY + 2, purpose: "dwelling-ring" },
    { y: baseY + 8, purpose: "current-lane" },
    { y: baseY + 14, purpose: "light-canopy" },
  ] : [];
  return {
    schema: 1,
    settlementId: candidate.id,
    center,
    environment,
    topology: aquatic ? "open-underwater" : "walled-surface",
    radiusBlocks: perimeterRadius,
    buildings,
    paths: uniquePaths,
    wall,
    gates,
    approaches,
    lights,
    verticalLayers,
    beds,
    doors,
    nests,
    restAlcoves,
    populationSoftCap: aquatic
      ? calculateAquaticPopulationSoftCap(nests, restAlcoves, candidate.size)
      : calculatePopulationSoftCap(beds, doors, candidate.size),
  };
}

export const RESIDENT_PROFESSIONS = [
  "mayor",
  "warrior",
  "farmer",
  "miner",
  "brewer",
  "alchemist",
  "blacksmith",
  "banker",
  "general",
  "atlantian-tidewarden",
  "atlantian-kelpkeeper",
  "atlantian-coralwright",
  "atlantian-pearlbroker",
  "atlantian-glowmender",
  "atlantian-trident-guard",
  "sugarcourt-crown-confectioner",
  "sugarcourt-gumdrop-gardener",
  "sugarcourt-sugarboiler",
  "sugarcourt-candysmith",
  "sugarcourt-sweetbroker",
  "sugarcourt-kennelkeeper",
  "sugarcourt-brittle-guard",
  "wood-elf-elderweaver",
  "wood-elf-leafwarden",
  "wood-elf-bow-warden",
  "wood-elf-grovekeeper",
  "wood-elf-tomekeeper",
  "wood-elf-potioner",
  "wood-elf-moonbroker",
  "dwarf-thane",
  "dwarf-gatewarden",
  "dwarf-delver",
  "dwarf-gearwright",
  "dwarf-golemsmith",
  "dwarf-powderwright",
  "dwarf-provisioner",
] as const;
export type ResidentProfession = (typeof RESIDENT_PROFESSIONS)[number];
export type ResidentCombatStance = "passive" | "defensive" | "offensive";
export type FollowDistanceSetting = "dynamic" | number;

export type ResidentEquipment = Readonly<{
  weapon: string | null;
  tool: string | null;
}>;

export type HirelingOrders = Readonly<{
  stance: ResidentCombatStance;
  follow: boolean;
  followDistance: FollowDistanceSetting;
  holdPosition: SettlementPoint | null;
}>;

export type SettlementResident = Readonly<{
  id: string;
  factionId: FactionId;
  race: FactionRace;
  waterBreathing: boolean;
  name: string;
  profession: ResidentProfession;
  adult: boolean;
  alive: boolean;
  health: number;
  maxHealth: number;
  homeBuildingId: string | null;
  position: SettlementPoint;
  equipment: ResidentEquipment;
  hiredByPlayerId: string | null;
  orders: HirelingOrders;
}>;

export type AlignedSettlementCreature = Readonly<{
  id: string;
  kind: "warg" | "taffy-hound" | "praline-cat" | "glimmerhart" | "runeowl" | "copper-mole" | "copper-scout-golem" | "clockwork-hound-golem" | "webspinner-golem";
  factionId: "goblins" | "sugarcourt" | "wood-elves" | "dwarves";
  position: SettlementPoint;
  patrolGateId: string;
  tameable: false;
}>;

/** Wide gallery constructs need a precise clear-cell marker; smaller patrols can fan out naturally. */
export function alignedCreatureSpawnRadius(kind: AlignedSettlementCreature["kind"]) {
  return kind === "webspinner-golem" ? 0.35 : 2.5;
}

export type SettlementOwnershipRecord = Readonly<{
  day: number;
  from: FactionId;
  to: FactionId;
  captureReceiptId: string;
}>;

export type SettlementState = AuthorityStampedState & Readonly<{
  schema: 1;
  id: string;
  worldSeed: string;
  size: SettlementSize;
  biome: SettlementBiome;
  environment: SettlementEnvironment;
  ownerFactionId: FactionId;
  cultureRace: FactionRace;
  layout: SettlementLayoutPlan;
  residents: readonly SettlementResident[];
  alignedCreatures: readonly AlignedSettlementCreature[];
  foodReserve: number;
  lastMayorElectionDay: number;
  lastPopulationDay: number;
  ownershipHistory: readonly SettlementOwnershipRecord[];
}>;

export function settlementEnvironmentOf(settlement: Readonly<{
  environment?: SettlementEnvironment;
  biome?: SettlementBiome;
  cultureRace?: FactionRace;
  layout?: Readonly<{ environment?: SettlementEnvironment }>;
}>): SettlementEnvironment {
  if (settlement.environment === "underground" || settlement.layout?.environment === "underground") return "underground";
  if (settlement.environment === "underwater" || settlement.layout?.environment === "underwater") return "underwater";
  if (settlement.cultureRace === "dwarf" || settlement.biome === "snowcap-range") return "underground";
  if (settlement.cultureRace === "atlantian" || settlement.biome === "deep-ocean" || settlement.biome === "lumen-trench") return "underwater";
  return "surface";
}

/** Adds v0.7 aquatic fields to older surface settlement saves without changing their authored layout. */
export function normalizeSettlementState(state: SettlementState): SettlementState {
  const environment = settlementEnvironmentOf(state);
  const layout = state.layout as SettlementLayoutPlan & Partial<Pick<SettlementLayoutPlan,
    "environment" | "topology" | "approaches" | "verticalLayers" | "nests" | "restAlcoves"
  >>;
  const furniture = layout.buildings.flatMap((building) => building.furniture);
  const nests = Number.isFinite(layout.nests) ? Math.max(0, Math.floor(layout.nests ?? 0)) : furniture.filter((entry) => entry.kind === "nest").length;
  const restAlcoves = Number.isFinite(layout.restAlcoves) ? Math.max(0, Math.floor(layout.restAlcoves ?? 0)) : furniture.filter((entry) => entry.kind === "rest-alcove").length;
  return {
    ...state,
    environment,
    layout: {
      ...layout,
      environment,
      topology: layout.topology ?? (environment === "underwater" ? "open-underwater" : environment === "underground" ? "subterranean-hold" : "walled-surface"),
      approaches: Array.isArray(layout.approaches) ? layout.approaches : [],
      verticalLayers: Array.isArray(layout.verticalLayers) ? layout.verticalLayers : [],
      nests,
      restAlcoves,
    },
    residents: state.residents.map((resident) => resident.waterBreathing === raceBreathesWater(resident.race)
      ? resident
      : { ...resident, waterBreathing: raceBreathesWater(resident.race) }),
  };
}

const HEARTHKIN_GIVEN = ["Ada", "Bram", "Clover", "Dodie", "Elsin", "Fenn", "Marnie", "Nim", "Pip", "Rosie", "Tobbin", "Willa"] as const;
const HEARTHKIN_FAMILY = ["Barleywick", "Bramblebank", "Caskbottom", "Hearthdown", "Mossfoot", "Thimbleburrow", "Willowmere"] as const;
const GOBLIN_GIVEN = ["Bikka", "Dreg", "Fizzik", "Grunna", "Kett", "Mogri", "Nix", "Rakka", "Skrim", "Tazza", "Vekk", "Zib"] as const;
const GOBLIN_CLAN = ["Brassroot", "Cinderknuckle", "Flintcap", "Rattlepot", "Rustwhistle", "Slatebite", "Spindlegear"] as const;
const WAYFARER_GIVEN = ["Ash", "Ember", "Fern", "Juniper", "Mica", "River", "Rowan", "Vale"] as const;
const ATLANTIAN_GIVEN = ["Aelune", "Caelis", "Ilyra", "Marev", "Neris", "Oruun", "Selyth", "Thal", "Vaela", "Ysara"] as const;
const ATLANTIAN_TIDES = ["Bluecurrent", "Coralwake", "Glassfin", "Lumenveil", "Pearldeep", "Reefsinger", "Softtide"] as const;
const CONFECTKIN_GIVEN = ["Bonnie", "Cinna", "Dulce", "Mallow", "Mint", "Nougat", "Poppy", "Praline", "Toffee", "Truffle", "Waffle", "Zest"] as const;
const CONFECTKIN_FAMILY = ["Brittlebrook", "Candleglass", "Honeyspun", "Peppermere", "Sugarwick", "Taffyfold", "Waferby"] as const;
const WOOD_ELF_GIVEN = ["Aelith", "Caerwyn", "Elaris", "Faelwen", "Irielle", "Lethan", "Naevra", "Oryn", "Sylra", "Thalen"] as const;
const WOOD_ELF_HOUSES = ["Brightfern", "Dewbranch", "Glowbough", "Moonpetal", "Silverleaf", "Starglen", "Whisperroot"] as const;
const DWARF_GIVEN = ["Bori", "Dagna", "Eitri", "Frida", "Garrik", "Hildi", "Kelda", "Orik", "Runa", "Torven"] as const;
const DWARF_HOUSES = ["Brassvein", "Deepgear", "Emberpin", "Ironclock", "Lanternmantle", "Stonewhistle", "Tunnelforge"] as const;

export function generateResidentName(race: FactionRace, seed: string) {
  if (race === "hearthkin") return `${hashPick(HEARTHKIN_GIVEN, seed, "given")} ${hashPick(HEARTHKIN_FAMILY, seed, "family")}`;
  if (race === "goblin") return `${hashPick(GOBLIN_GIVEN, seed, "given")} ${hashPick(GOBLIN_CLAN, seed, "clan")}`;
  if (race === "atlantian") return `${hashPick(ATLANTIAN_GIVEN, seed, "given")} ${hashPick(ATLANTIAN_TIDES, seed, "tide")}`;
  if (race === "confectkin") return `${hashPick(CONFECTKIN_GIVEN, seed, "given")} ${hashPick(CONFECTKIN_FAMILY, seed, "family")}`;
  if (race === "wood-elf") return `${hashPick(WOOD_ELF_GIVEN, seed, "given")} ${hashPick(WOOD_ELF_HOUSES, seed, "house")}`;
  if (race === "dwarf") return `${hashPick(DWARF_GIVEN, seed, "given")} ${hashPick(DWARF_HOUSES, seed, "house")}`;
  return hashPick(WAYFARER_GIVEN, seed, "given");
}

export function isMayorProfession(profession: ResidentProfession) {
  return profession === "mayor" || profession === "atlantian-tidewarden" || profession === "sugarcourt-crown-confectioner"
    || profession === "wood-elf-elderweaver" || profession === "dwarf-thane";
}

export function isWarriorProfession(profession: ResidentProfession) {
  return profession === "warrior" || profession === "atlantian-trident-guard" || profession === "sugarcourt-brittle-guard"
    || profession === "wood-elf-leafwarden" || profession === "wood-elf-bow-warden" || profession === "dwarf-gatewarden";
}

export function isAquaticProfession(profession: ResidentProfession) {
  return profession.startsWith("atlantian-");
}

export function isSugarcourtProfession(profession: ResidentProfession) {
  return profession.startsWith("sugarcourt-");
}

export function isWoodElfProfession(profession: ResidentProfession) {
  return profession.startsWith("wood-elf-");
}

export function isDwarfProfession(profession: ResidentProfession) {
  return profession.startsWith("dwarf-");
}

function professionPlan(candidate: SettlementCandidate, count: number) {
  if (candidate.factionId === "wood-elves") {
    const professions: ResidentProfession[] = [
      "wood-elf-elderweaver", "wood-elf-leafwarden", "wood-elf-bow-warden", "wood-elf-grovekeeper",
      "wood-elf-tomekeeper", "wood-elf-potioner", "wood-elf-moonbroker", "wood-elf-leafwarden",
      "wood-elf-grovekeeper", "wood-elf-bow-warden", "wood-elf-moonbroker", "wood-elf-grovekeeper",
    ];
    return Array.from({ length: count }, (_, index) => professions[index % professions.length]);
  }
  if (candidate.factionId === "dwarves") {
    const professions: ResidentProfession[] = [
      "dwarf-thane", "dwarf-gatewarden", "dwarf-delver", "dwarf-gearwright", "dwarf-golemsmith",
      "dwarf-powderwright", "dwarf-provisioner", "dwarf-gatewarden", "dwarf-delver", "dwarf-golemsmith",
      "dwarf-provisioner", "dwarf-delver",
    ];
    return Array.from({ length: count }, (_, index) => professions[index % professions.length]);
  }
  if (candidate.factionId === "atlantians") {
    const aquatic: ResidentProfession[] = [
      "atlantian-tidewarden",
      "atlantian-trident-guard",
      "atlantian-kelpkeeper",
      "atlantian-coralwright",
      "atlantian-pearlbroker",
      "atlantian-glowmender",
      "atlantian-trident-guard",
      "atlantian-kelpkeeper",
      "atlantian-coralwright",
      "atlantian-pearlbroker",
    ];
    return Array.from({ length: count }, (_, index) => aquatic[index % aquatic.length]);
  }
  if (candidate.factionId === "sugarcourt") {
    const sugarcourt: ResidentProfession[] = [
      "sugarcourt-crown-confectioner",
      "sugarcourt-brittle-guard",
      "sugarcourt-gumdrop-gardener",
      "sugarcourt-sweetbroker",
      "sugarcourt-kennelkeeper",
      "sugarcourt-sugarboiler",
      "sugarcourt-candysmith",
      "sugarcourt-brittle-guard",
      "sugarcourt-gumdrop-gardener",
      "sugarcourt-sweetbroker",
    ];
    return Array.from({ length: count }, (_, index) => sugarcourt[index % sugarcourt.length]);
  }
  const common: ResidentProfession[] = ["mayor", "warrior", "farmer", "general", "warrior", "general"];
  const faction: ResidentProfession[] = candidate.factionId === "hobbits"
    ? ["brewer", "banker", "farmer", "alchemist", "blacksmith", "general"]
    : ["miner", "blacksmith", "alchemist", "warrior", "general", "miner"];
  return Array.from({ length: count }, (_, index) => index < common.length ? common[index] : faction[(index - common.length) % faction.length]);
}

function preferredBuildings(layout: SettlementLayoutPlan, profession: ResidentProfession) {
  const role: SettlementBuildingRole = profession === "wood-elf-elderweaver" ? "moonbough-hall"
    : profession === "wood-elf-leafwarden" || profession === "wood-elf-bow-warden" ? "leafwarden-lodge"
      : profession === "wood-elf-grovekeeper" ? "glow-garden"
        : profession === "wood-elf-tomekeeper" ? "glimmer-library"
          : profession === "wood-elf-potioner" ? "moonwell"
            : profession === "wood-elf-moonbroker" ? "enclave-market"
              : profession === "dwarf-thane" ? "deepgear-hall"
                : profession === "dwarf-gatewarden" ? "entrance-barracks"
                  : profession === "dwarf-delver" ? "delver-gallery"
                    : profession === "dwarf-gearwright" ? "blacksmith"
                      : profession === "dwarf-golemsmith" ? "golem-forge"
                        : profession === "dwarf-powderwright" ? "powderworks"
                          : profession === "dwarf-provisioner" ? "gear-market"
                            : profession === "atlantian-tidewarden" ? "tide-hall"
    : profession === "atlantian-trident-guard" ? "guard-grotto"
      : profession === "atlantian-kelpkeeper" ? "kelp-garden"
        : profession === "atlantian-coralwright" ? "coral-workshop"
          : profession === "atlantian-pearlbroker" ? "pearl-market"
            : profession === "atlantian-glowmender" ? "glow-clinic"
              : profession === "sugarcourt-crown-confectioner" ? "sugar-palace"
                : profession === "sugarcourt-brittle-guard" ? "brittle-barracks"
                  : profession === "sugarcourt-gumdrop-gardener" ? "gumdrop-garden"
                    : profession === "sugarcourt-sugarboiler" ? "sugarworks"
                      : profession === "sugarcourt-candysmith" ? "candysmith"
                        : profession === "sugarcourt-sweetbroker" ? "sweet-market"
                          : profession === "sugarcourt-kennelkeeper" ? "taffy-kennel"
              : profession === "mayor" ? "mayor-hall"
    : profession === "warrior" ? "guardhouse"
      : profession === "farmer" ? (layout.buildings.some((building) => building.role === "wheat-mill") ? "wheat-mill" : "farm")
        : profession === "miner" ? "mine-store"
          : profession === "brewer" ? "brewery"
            : profession === "banker" ? "bank"
              : profession === "alchemist" ? "alchemist"
                : profession === "blacksmith" ? "blacksmith"
                  : "home";
  const preferred = layout.buildings.filter((building) => building.role === role);
  const homes = layout.buildings.filter((building) => ["home", "living-home", "stone-home", "bonbon-home"].includes(building.role));
  return preferred.length ? preferred : homes.length ? homes : layout.buildings;
}

/** Chooses a clear floor tile inside the resident's assigned building. */
function residentInteriorPosition(building: SettlementBuildingPlan | undefined, residentIndex: number, fallback: SettlementPoint) {
  if (!building) return fallback;
  const occupied = new Set<string>();
  for (const furniture of building.furniture) {
    occupied.add(`${furniture.position.x},${furniture.position.z}`);
    if (furniture.kind === "bed") {
      const head = settlementLocalPoint(furniture.position, furniture.facing, 0, -1);
      occupied.add(`${head.x},${head.z}`);
    }
  }
  const anchors = [[0, -1], [1, -1], [-1, -1], [0, 1], [1, 1], [-1, 1]] as const;
  for (let offset = 0; offset < anchors.length; offset += 1) {
    const [x, z] = anchors[(residentIndex + offset) % anchors.length];
    const position = settlementLocalPoint(building.position, building.facing, x, z);
    if (!occupied.has(`${position.x},${position.z}`)) return position;
  }
  return settlementLocalPoint(building.position, building.facing, 0, -1);
}

function defaultEquipment(factionId: Exclude<FactionId, "player">, profession: ResidentProfession, index: number): ResidentEquipment {
  if (factionId === "wood-elves") {
    if (profession === "wood-elf-leafwarden") return { weapon: "moonbough-staff", tool: null };
    if (profession === "wood-elf-bow-warden") return { weapon: "glimmerbow", tool: null };
    if (profession === "wood-elf-grovekeeper") return { weapon: null, tool: "moon-sickle" };
    if (profession === "wood-elf-tomekeeper") return { weapon: "moonbough-staff", tool: "tome" };
    if (profession === "wood-elf-potioner") return { weapon: null, tool: "glimmer-vial" };
    return { weapon: null, tool: null };
  }
  if (factionId === "dwarves") {
    if (profession === "dwarf-gatewarden") return { weapon: index % 3 === 0 ? "flintlock-pistol" : "deepgear-hammer", tool: null };
    if (profession === "dwarf-delver") return { weapon: null, tool: "deepgear-pick" };
    if (profession === "dwarf-gearwright" || profession === "dwarf-golemsmith") return { weapon: null, tool: "gear-hammer" };
    if (profession === "dwarf-powderwright") return { weapon: "flintlock-pistol", tool: "powder-flask" };
    return { weapon: null, tool: null };
  }
  if (factionId === "atlantians") {
    if (profession === "atlantian-trident-guard") return { weapon: "tideglass-trident", tool: null };
    if (profession === "atlantian-coralwright") return { weapon: null, tool: "coral-chisel" };
    if (profession === "atlantian-kelpkeeper") return { weapon: null, tool: "kelp-sickle" };
    if (profession === "atlantian-glowmender") return { weapon: null, tool: "lumen-vial" };
    return { weapon: null, tool: null };
  }
  if (factionId === "sugarcourt") {
    if (profession === "sugarcourt-brittle-guard") return { weapon: "peppermint-pike", tool: null };
    if (profession === "sugarcourt-candysmith") return { weapon: null, tool: "candy-hammer" };
    if (profession === "sugarcourt-gumdrop-gardener") return { weapon: null, tool: "hoe" };
    if (profession === "sugarcourt-sugarboiler") return { weapon: null, tool: "sugar-ladle" };
    return { weapon: null, tool: null };
  }
  if (profession === "warrior") {
    if (factionId === "hobbits") return { weapon: index % 4 === 1 ? "crossbow" : "hearth-hammer", tool: null };
    return { weapon: "goblin-spear", tool: null };
  }
  if (profession === "farmer") return { weapon: null, tool: "hoe" };
  if (profession === "miner") return { weapon: null, tool: "pickaxe" };
  if (profession === "blacksmith") return { weapon: null, tool: "hammer" };
  return { weapon: null, tool: null };
}

function alignedCreaturesForFaction(
  settlementIdValue: string,
  factionId: FactionId,
  layout: SettlementLayoutPlan,
  generation = "founding",
): readonly AlignedSettlementCreature[] {
  if (factionId === "wood-elves") {
    const guards = layout.gates.slice(0, 2).map((gate, index) => ({
      id: `${settlementIdValue}-glimmerhart-${generation}-${index}`, kind: "glimmerhart" as const, factionId: "wood-elves" as const,
      position: gate.position, patrolGateId: gate.id, tameable: false as const,
    }));
    const libraries = layout.buildings.filter((building) => building.role === "glimmer-library").slice(0, 2).map((building, index) => ({
      id: `${settlementIdValue}-runeowl-${generation}-${index}`, kind: "runeowl" as const, factionId: "wood-elves" as const,
      position: building.position, patrolGateId: building.id, tameable: false as const,
    }));
    return [...guards, ...libraries];
  }
  if (factionId === "dwarves") {
    const gate = layout.gates[0] ?? { id: `${settlementIdValue}-entry`, position: layout.center };
    const golems = Array.from({ length: 2 }, (_, index) => ({
      id: `${settlementIdValue}-copper-scout-${generation}-${index}`, kind: "copper-scout-golem" as const, factionId: "dwarves" as const,
      position: { ...gate.position, x: gate.position.x + (index === 0 ? -2 : 2) }, patrolGateId: gate.id, tameable: false as const,
    }));
    const kennels = layout.buildings.filter((building) => building.role === "stone-home").slice(0, 2).map((building, index) => ({
      id: `${settlementIdValue}-copper-mole-${generation}-${index}`, kind: "copper-mole" as const, factionId: "dwarves" as const,
      position: building.position, patrolGateId: building.id, tameable: false as const,
    }));
    const houndGate = layout.gates.at(-1) ?? gate;
    const hound = {
      id: `${settlementIdValue}-clockwork-hound-${generation}`, kind: "clockwork-hound-golem" as const, factionId: "dwarves" as const,
      position: { ...houndGate.position, z: houndGate.position.z + 2 }, patrolGateId: houndGate.id, tameable: false as const,
    };
    const forge = layout.buildings.find((building) => building.role === "golem-forge");
    const webspinner = forge ? [{
      id: `${settlementIdValue}-webspinner-${generation}`, kind: "webspinner-golem" as const, factionId: "dwarves" as const,
      // Keep its broad chassis in the clear west service bay rather than on the
      // center gear table, north cradle, or conduit. The marker uses a tight
      // spawn radius so runtime grounding cannot promote that furniture to floor.
      position: settlementLocalPoint(forge.position, forge.facing, -2, 1), patrolGateId: forge.id, tameable: false as const,
    }] : [];
    return [...golems, hound, ...webspinner, ...kennels];
  }
  if (factionId === "goblins") return layout.gates.slice(0, Math.min(3, layout.gates.length)).map((gate, index) => ({
    id: `${settlementIdValue}-warg-${generation}-${index}`,
    kind: "warg" as const,
    factionId: "goblins" as const,
    position: gate.position,
    patrolGateId: gate.id,
    tameable: false as const,
  }));
  if (factionId !== "sugarcourt") return [];
  const hounds = layout.gates.slice(0, Math.min(3, layout.gates.length)).map((gate, index) => ({
    id: `${settlementIdValue}-taffy-hound-${generation}-${index}`,
    kind: "taffy-hound" as const,
    factionId: "sugarcourt" as const,
    position: gate.position,
    patrolGateId: gate.id,
    tameable: false as const,
  }));
  const catHomes = layout.buildings.filter((building) => building.role === "bonbon-home" || building.role === "sweet-market").slice(0, 3);
  const cats = catHomes.map((building, index) => ({
    id: `${settlementIdValue}-praline-cat-${generation}-${index}`,
    kind: "praline-cat" as const,
    factionId: "sugarcourt" as const,
    position: building.position,
    patrolGateId: building.id,
    tameable: false as const,
  }));
  return [...hounds, ...cats];
}

export function createSettlementState(authorityId: string, candidate: SettlementCandidate, layout = planSettlementLayout(candidate)): SettlementState {
  const count = Math.min(SETTLEMENT_SIZE_RULES[candidate.size].populationTarget, layout.populationSoftCap);
  const professions = professionPlan(candidate, count);
  const buildingAssignments = new Map<string, number>();
  const residents = professions.map((profession, index): SettlementResident => {
    const candidates = preferredBuildings(layout, profession);
    const assignmentKey = candidates.map((building) => building.id).join("|");
    const assignmentIndex = buildingAssignments.get(assignmentKey) ?? 0;
    buildingAssignments.set(assignmentKey, assignmentIndex + 1);
    const building = candidates.length ? candidates[assignmentIndex % candidates.length] : undefined;
    const id = `${candidate.id}-resident-${index}`;
    return {
      id,
      factionId: candidate.factionId,
      race: FACTIONS[candidate.factionId].race,
      waterBreathing: raceBreathesWater(FACTIONS[candidate.factionId].race),
      name: generateResidentName(FACTIONS[candidate.factionId].race, `${candidate.worldSeed}|${id}`),
      profession,
      adult: true,
      alive: true,
      health: isWarriorProfession(profession) ? (candidate.factionId === "atlantians" ? 20 : 18) : candidate.factionId === "atlantians" ? 13 : 12,
      maxHealth: isWarriorProfession(profession) ? (candidate.factionId === "atlantians" ? 20 : 18) : candidate.factionId === "atlantians" ? 13 : 12,
      homeBuildingId: building?.id ?? null,
      position: residentInteriorPosition(building, assignmentIndex, candidate.center),
      equipment: defaultEquipment(candidate.factionId, profession, index),
      hiredByPlayerId: null,
      orders: { stance: "defensive", follow: false, followDistance: "dynamic", holdPosition: null },
    };
  });
  const alignedCreatures = alignedCreaturesForFaction(candidate.id, candidate.factionId, layout);
  return {
    schema: 1,
    authorityId,
    revision: 0,
    recentEventIds: [],
    id: candidate.id,
    worldSeed: candidate.worldSeed,
    size: candidate.size,
    biome: candidate.biome,
    environment: layout.environment,
    ownerFactionId: candidate.factionId,
    cultureRace: FACTIONS[candidate.factionId].race,
    layout,
    residents,
    alignedCreatures,
    foodReserve: count * 4,
    lastMayorElectionDay: 0,
    lastPopulationDay: 0,
    ownershipHistory: [],
  };
}

export type ScheduleAction =
  | "idle"
  | "sleep"
  | "work"
  | "trade"
  | "patrol-gate"
  | "flee"
  | "fight"
  | "sit"
  | "socialize"
  | "follow"
  | "hold-position"
  | "rest"
  | "patrol-current"
  | "tend-kelp"
  | "shape-coral"
  | "trade-pearls"
  | "mend-glow"
  | "gather-current"
  | "tend-sweets"
  | "boil-sugar"
  | "shape-candy"
  | "tend-menagerie"
  | "weave-leaf-magic"
  | "tend-glow-garden"
  | "keep-archive"
  | "tend-moonwell"
  | "work-golem-forge"
  | "maintain-gears"
  | "prepare-powder"
  | "delve";

export type ResidentSchedulePlan = Readonly<{
  action: ScheduleAction;
  target: SettlementPoint | null;
  reason: string;
}>;

export function planResidentSchedule(
  resident: SettlementResident,
  settlement: Pick<SettlementState, "id" | "layout">,
  input: Readonly<{ worldDay: number; hour: number; monsterVisible: boolean }>,
): ResidentSchedulePlan {
  if (!resident.alive) return { action: "idle", target: null, reason: "dead" };
  if (resident.hiredByPlayerId && resident.orders.follow) return { action: "follow", target: null, reason: resident.orders.stance };
  if (resident.hiredByPlayerId && resident.orders.holdPosition) return { action: "hold-position", target: resident.orders.holdPosition, reason: resident.orders.stance };
  const gate = hashPick(settlement.layout.gates, `${settlement.id}|${resident.id}`, input.worldDay) ?? null;
  const approach = hashPick(settlement.layout.approaches ?? [], `${settlement.id}|${resident.id}`, input.worldDay) ?? null;
  const guardPost = settlement.layout.environment === "underwater" ? approach?.position : gate?.position;
  if (input.monsterVisible) {
    if (isWarriorProfession(resident.profession) || resident.health / Math.max(1, resident.maxHealth) < 0.6) {
      return { action: "fight", target: guardPost ?? null, reason: isWarriorProfession(resident.profession) ? "defend-town" : "cornered-below-60-percent" };
    }
    return { action: "flee", target: resident.homeBuildingId ? resident.position : settlement.layout.center, reason: "civilian-safety" };
  }
  const hour = ((input.hour % 24) + 24) % 24;
  if (settlement.layout.environment === "underwater" || resident.race === "atlantian") {
    if (resident.profession === "atlantian-trident-guard") return { action: "patrol-current", target: approach?.position ?? settlement.layout.center, reason: "open-current-watch" };
    if (hour >= 1 && hour < 5) return { action: "rest", target: resident.position, reason: "quiet-tide" };
    if (resident.profession === "atlantian-kelpkeeper") return { action: "tend-kelp", target: resident.position, reason: "kelp-cycle" };
    if (resident.profession === "atlantian-coralwright") return { action: "shape-coral", target: resident.position, reason: "reef-maintenance" };
    if (resident.profession === "atlantian-pearlbroker") return { action: "trade-pearls", target: resident.position, reason: "market-current" };
    if (resident.profession === "atlantian-glowmender") return { action: "mend-glow", target: resident.position, reason: "light-tending" };
    if (resident.profession === "atlantian-tidewarden") return { action: hour >= 17 ? "socialize" : "gather-current", target: approach?.position ?? settlement.layout.center, reason: "tide-moot" };
    return { action: "gather-current", target: approach?.position ?? settlement.layout.center, reason: "aquatic-daily-life" };
  }
  if (resident.profession === "wood-elf-leafwarden" || resident.profession === "wood-elf-bow-warden") {
    return { action: "weave-leaf-magic", target: gate?.position ?? settlement.layout.center, reason: "enclave-watch" };
  }
  if (resident.profession === "dwarf-gatewarden") return { action: "patrol-gate", target: gate?.position ?? settlement.layout.center, reason: "mountain-entry-watch" };
  if (isWarriorProfession(resident.profession)) return { action: "patrol-gate", target: gate?.position ?? settlement.layout.center, reason: "gate-watch" };
  if (hour >= 21 || hour < 6) return { action: "sleep", target: resident.position, reason: "night" };
  const socialRoll = hashUnit(`${settlement.id}|${resident.id}|${input.worldDay}`, Math.floor(hour));
  if ((hour >= 18 || (hour >= 12 && hour < 14)) && socialRoll < 0.42) {
    const chairs = settlement.layout.buildings.flatMap((building) => building.furniture).filter((entry) => entry.kind === "chair");
    return { action: socialRoll < 0.2 ? "sit" : "socialize", target: hashPick(chairs, resident.id, input.worldDay)?.position ?? settlement.layout.center, reason: "daily-life" };
  }
  if (resident.profession === "sugarcourt-gumdrop-gardener") return { action: "tend-sweets", target: resident.position, reason: "gumdrop-cycle" };
  if (resident.profession === "sugarcourt-sugarboiler") return { action: "boil-sugar", target: resident.position, reason: "sugarworks-batch" };
  if (resident.profession === "sugarcourt-candysmith") return { action: "shape-candy", target: resident.position, reason: "candy-tempering" };
  if (resident.profession === "sugarcourt-kennelkeeper") return { action: "tend-menagerie", target: resident.position, reason: "village-companions" };
  if (resident.profession === "sugarcourt-sweetbroker" || resident.profession === "sugarcourt-crown-confectioner") return { action: "trade", target: resident.position, reason: resident.profession };
  if (resident.profession === "wood-elf-grovekeeper") return { action: "tend-glow-garden", target: resident.position, reason: "living-grove" };
  if (resident.profession === "wood-elf-tomekeeper") return { action: "keep-archive", target: resident.position, reason: "tome-keeping" };
  if (resident.profession === "wood-elf-potioner") return { action: "tend-moonwell", target: resident.position, reason: "moonwell-brewing" };
  if (resident.profession === "wood-elf-moonbroker" || resident.profession === "wood-elf-elderweaver") return { action: "trade", target: resident.position, reason: resident.profession };
  if (resident.profession === "dwarf-golemsmith") return { action: "work-golem-forge", target: resident.position, reason: "golem-assembly" };
  if (resident.profession === "dwarf-gearwright") return { action: "maintain-gears", target: resident.position, reason: "hold-maintenance" };
  if (resident.profession === "dwarf-powderwright") return { action: "prepare-powder", target: resident.position, reason: "sealed-powderworks" };
  if (resident.profession === "dwarf-delver") return { action: "delve", target: resident.position, reason: "ore-gallery" };
  if (resident.profession === "dwarf-provisioner" || resident.profession === "dwarf-thane") return { action: "trade", target: resident.position, reason: resident.profession };
  if (["banker", "brewer", "alchemist", "blacksmith", "farmer", "miner"].includes(resident.profession)) return { action: "work", target: resident.position, reason: resident.profession };
  if (resident.profession === "general" || resident.profession === "mayor") return { action: "trade", target: resident.position, reason: resident.profession };
  return { action: "idle", target: settlement.layout.center, reason: "unassigned" };
}

export function findRoleWaypoint(settlement: SettlementState, profession: ResidentProfession) {
  const resident = settlement.residents.filter((entry) => entry.alive && entry.profession === profession).sort((a, b) => a.id.localeCompare(b.id))[0];
  return resident ? { residentId: resident.id, name: resident.name, profession, position: resident.position } : null;
}

export type SettlementMutation = Readonly<{
  state: SettlementState;
  applied: boolean;
  reason: "ok" | "duplicate" | "forbidden" | "stale" | "invalid-event" | "not-needed" | "too-early" | "no-candidate" | "invalid-capture" | "alignment-too-low" | "mayor-approval-required" | "not-hireable";
}>;

export function electMayorAtEight(
  settlement: SettlementState,
  worldDay: number,
  hour: number,
  command: AuthorityCommand,
): SettlementMutation {
  const authority = checkAuthority(settlement, command);
  if (authority !== "ok") return { state: settlement, applied: false, reason: authority };
  const day = Math.max(0, Math.floor(worldDay));
  if (hour < 8) return { state: settlement, applied: false, reason: "too-early" };
  if (settlement.residents.some((resident) => resident.alive && isMayorProfession(resident.profession))) return { state: settlement, applied: false, reason: "not-needed" };
  const candidates = settlement.residents.filter((resident) => resident.alive && resident.adult && resident.factionId === settlement.ownerFactionId);
  if (candidates.length === 0) return { state: settlement, applied: false, reason: "no-candidate" };
  const elected = [...candidates].sort((a, b) => hash32(`${settlement.id}|${day}|${a.id}`) - hash32(`${settlement.id}|${day}|${b.id}`))[0];
  const mayorProfession: ResidentProfession = settlementEnvironmentOf(settlement) === "underwater" || settlement.cultureRace === "atlantian"
    ? "atlantian-tidewarden"
    : settlement.cultureRace === "confectkin" ? "sugarcourt-crown-confectioner"
      : settlement.cultureRace === "wood-elf" ? "wood-elf-elderweaver"
        : settlement.cultureRace === "dwarf" ? "dwarf-thane" : "mayor";
  const residents = settlement.residents.map((resident) => resident.id === elected.id ? { ...resident, profession: mayorProfession } : resident);
  return {
    state: stampAuthority({ ...settlement, residents, lastMayorElectionDay: day }, command),
    applied: true,
    reason: "ok",
  };
}

export function growSettlementPopulation(
  settlement: SettlementState,
  worldDay: number,
  command: AuthorityCommand,
): SettlementMutation {
  const authority = checkAuthority(settlement, command);
  if (authority !== "ok") return { state: settlement, applied: false, reason: authority };
  const day = Math.max(0, Math.floor(worldDay));
  const living = settlement.residents.filter((resident) => resident.alive);
  const adults = living.filter((resident) => resident.adult && resident.factionId === settlement.ownerFactionId);
  if (day <= settlement.lastPopulationDay || living.length >= settlement.layout.populationSoftCap || adults.length < 2 || settlement.foodReserve < 4) {
    return { state: settlement, applied: false, reason: "not-needed" };
  }
  const index = settlement.residents.length;
  const race = settlement.ownerFactionId === "player" ? settlement.cultureRace : FACTIONS[settlement.ownerFactionId].race;
  const id = `${settlement.id}-born-${day}-${index}`;
  const home = settlement.layout.buildings.find((building) => building.role === "home") ?? settlement.layout.buildings[0];
  const profession: ResidentProfession = race === "atlantian" ? "atlantian-kelpkeeper"
    : race === "confectkin" ? "sugarcourt-gumdrop-gardener"
      : race === "wood-elf" ? "wood-elf-grovekeeper"
        : race === "dwarf" ? "dwarf-delver" : "general";
  const child: SettlementResident = {
    id,
    factionId: settlement.ownerFactionId,
    race,
    waterBreathing: raceBreathesWater(race),
    name: generateResidentName(race, `${settlement.worldSeed}|${id}`),
    profession,
    adult: false,
    alive: true,
    health: 8,
    maxHealth: 8,
    homeBuildingId: home?.id ?? null,
    position: residentInteriorPosition(home, index, settlement.layout.center),
    equipment: { weapon: null, tool: null },
    hiredByPlayerId: null,
    orders: { stance: "passive", follow: false, followDistance: "dynamic", holdPosition: null },
  };
  return {
    state: stampAuthority({ ...settlement, residents: [...settlement.residents, child], foodReserve: settlement.foodReserve - 4, lastPopulationDay: day }, command),
    applied: true,
    reason: "ok",
  };
}

export function applySettlementCapture(
  settlement: SettlementState,
  receipt: TownCaptureReceipt,
  worldDay: number,
  command: AuthorityCommand,
): SettlementMutation {
  const authority = checkAuthority(settlement, command);
  if (authority !== "ok") return { state: settlement, applied: false, reason: authority };
  if (receipt.id !== command.eventId || receipt.townId !== settlement.id || receipt.from !== settlement.ownerFactionId) {
    return { state: settlement, applied: false, reason: "invalid-capture" };
  }
  const environment = settlementEnvironmentOf(settlement);
  if (!factionCanOccupyEnvironment(receipt.to, environment)) {
    return { state: settlement, applied: false, reason: "invalid-capture" };
  }
  const residents = receipt.transferNonWarriors
    ? settlement.residents.map((resident) => resident.alive && !isWarriorProfession(resident.profession)
      ? { ...resident, factionId: receipt.to, hiredByPlayerId: receipt.to === "player" ? "settlement" : resident.hiredByPlayerId }
      : resident)
    : settlement.residents;
  const cultureRace = receipt.to === "player" ? settlement.cultureRace : FACTIONS[receipt.to].race;
  const history: SettlementOwnershipRecord = { day: Math.max(0, Math.floor(worldDay)), from: settlement.ownerFactionId, to: receipt.to, captureReceiptId: receipt.id };
  const alignedCreatures = alignedCreaturesForFaction(settlement.id, receipt.to, settlement.layout, String(history.day));
  return {
    state: stampAuthority({
      ...settlement,
      ownerFactionId: receipt.to,
      cultureRace,
      residents,
      alignedCreatures,
      ownershipHistory: [...settlement.ownershipHistory, history].slice(-12),
    }, command),
    applied: true,
    reason: "ok",
  };
}

export type HireResidentResult = SettlementMutation & Readonly<{ cost: GoldAmount }>;

export function hireResident(
  settlement: SettlementState,
  residentId: string,
  playerId: string,
  factionAlignment: number,
  mayorApproved: boolean,
  command: AuthorityCommand,
): HireResidentResult {
  const authority = checkAuthority(settlement, command);
  if (authority !== "ok") return { state: settlement, applied: false, reason: authority, cost: "0" };
  if (factionAlignment < 65) return { state: settlement, applied: false, reason: "alignment-too-low", cost: "0" };
  if (!mayorApproved) return { state: settlement, applied: false, reason: "mayor-approval-required", cost: "0" };
  const resident = settlement.residents.find((entry) => entry.id === residentId);
  if (!resident || !resident.alive || !resident.adult || isMayorProfession(resident.profession) || resident.hiredByPlayerId) {
    return { state: settlement, applied: false, reason: "not-hireable", cost: "0" };
  }
  const cost = isWarriorProfession(resident.profession) ? "180" : "110";
  const residents = settlement.residents.map((entry) => entry.id === residentId ? {
    ...entry,
    factionId: "player" as const,
    hiredByPlayerId: playerId,
    orders: { ...entry.orders, stance: "defensive" as const, follow: true, followDistance: "dynamic" as const },
  } : entry);
  return { state: stampAuthority({ ...settlement, residents }, command), applied: true, reason: "ok", cost };
}

export function updateHirelingOrders(
  settlement: SettlementState,
  residentId: string,
  orders: Partial<HirelingOrders>,
  equipment: Partial<ResidentEquipment>,
  command: AuthorityCommand,
): SettlementMutation {
  const authority = checkAuthority(settlement, command);
  if (authority !== "ok") return { state: settlement, applied: false, reason: authority };
  const resident = settlement.residents.find((entry) => entry.id === residentId);
  if (!resident?.hiredByPlayerId) return { state: settlement, applied: false, reason: "not-hireable" };
  const followDistance = normalizeFollowDistance(orders.followDistance ?? resident.orders.followDistance);
  const residents = settlement.residents.map((entry) => entry.id === residentId ? {
    ...entry,
    orders: { ...entry.orders, ...orders, followDistance },
    equipment: { ...entry.equipment, ...equipment },
  } : entry);
  return { state: stampAuthority({ ...settlement, residents }, command), applied: true, reason: "ok" };
}

export function normalizeFollowDistance(setting: FollowDistanceSetting): FollowDistanceSetting {
  if (setting === "dynamic") return setting;
  if (!Number.isFinite(setting)) return "dynamic";
  return Math.max(1.5, Math.min(10, Math.round(setting * 2) / 2));
}

/** Shared by hirelings and tameable creatures; followers fan out like a caravan. */
export function followerFormationSlot(index: number, followerCount: number, setting: FollowDistanceSetting) {
  const safeIndex = Math.max(0, Math.floor(index));
  const count = Math.max(1, Math.floor(followerCount));
  const ring = Math.floor(Math.sqrt(safeIndex));
  const dynamicMinimum = 2 + Math.min(4, Math.max(0, count - 1) * 0.18);
  const distance = setting === "dynamic" ? dynamicMinimum + ring * 1.35 : normalizeFollowDistance(setting) as number;
  const angle = safeIndex * 2.399963229728653;
  return { distance, angle, x: Math.cos(angle) * distance, z: Math.sin(angle) * distance };
}

export type SideQuestCriterion = Readonly<{
  kind: "deliver" | "collect" | "defeat" | "visit" | "protect";
  target: string;
  count: number;
}>;

export type SideQuestReward = Readonly<{
  gold: number;
  alignment: number;
  items: readonly Readonly<{ itemKey: string; count: number }>[];
  delivery: "giver-drops";
}>;

export type SideQuestTemplate = Readonly<{
  id: string;
  factionId: Exclude<FactionId, "player">;
  title: string;
  summary: string;
  giverProfessions: readonly ResidentProfession[];
  criteria: readonly SideQuestCriterion[];
  failureConditions: readonly ("giver-dies" | "protected-target-dies" | "deadline")[];
  rewards: SideQuestReward;
  abandonable: true;
}>;

export const HOBBIT_SIDE_QUESTS: readonly SideQuestTemplate[] = [
  {
    id: "hobbit-cellar-sweetening", factionId: "hobbits", title: "Sweeten the Cellar",
    summary: "Bring honey and apples to a Freehold brewer before the next batch is sealed.",
    giverProfessions: ["brewer"],
    criteria: [{ kind: "deliver", target: "honey-jar", count: 3 }, { kind: "deliver", target: "apple", count: 8 }],
    failureConditions: ["giver-dies"], rewards: { gold: 54, alignment: 6, items: [{ itemKey: "mead", count: 2 }], delivery: "giver-drops" }, abandonable: true,
  },
  {
    id: "hobbit-safe-lantern-road", factionId: "hobbits", title: "Lanterns on the Long Road",
    summary: "Thin the night creatures prowling the lantern road and bring torches to relight its dark stretches.", giverProfessions: ["warrior", "mayor"],
    criteria: [{ kind: "defeat", target: "overworld-monster", count: 5 }, { kind: "deliver", target: "torch", count: 8 }],
    failureConditions: ["giver-dies"], rewards: { gold: 72, alignment: 8, items: [{ itemKey: "bolt", count: 12 }], delivery: "giver-drops" }, abandonable: true,
  },
  {
    id: "hobbit-rare-orchard", factionId: "hobbits", title: "Seeds for a Stranger Orchard",
    summary: "Gather uncommon fruit and berries for a patient grower.", giverProfessions: ["farmer"],
    criteria: [{ kind: "collect", target: "moonberry", count: 6 }, { kind: "deliver", target: "apple", count: 6 }],
    failureConditions: ["giver-dies"], rewards: { gold: 42, alignment: 5, items: [{ itemKey: "rare-seed-pouch", count: 1 }], delivery: "giver-drops" }, abandonable: true,
  },
];

export const GOBLIN_SIDE_QUESTS: readonly SideQuestTemplate[] = [
  {
    id: "goblin-bright-metal", factionId: "goblins", title: "Bright Metal, Fair Weight",
    summary: "Supply a Brassroot miner without asking where the last shipment went.", giverProfessions: ["miner", "blacksmith"],
    criteria: [{ kind: "deliver", target: "raw-iron", count: 12 }, { kind: "deliver", target: "raw-gold", count: 2 }],
    failureConditions: ["giver-dies"], rewards: { gold: 86, alignment: 7, items: [{ itemKey: "goblin-spear", count: 1 }], delivery: "giver-drops" }, abandonable: true,
  },
  {
    id: "goblin-warg-watch", factionId: "goblins", title: "The Kennel Bell",
    summary: "Clear prowlers from the kennel road and bring bright metal for its damaged gate fittings.", giverProfessions: ["warrior", "mayor"],
    criteria: [{ kind: "deliver", target: "raw-iron", count: 6 }, { kind: "defeat", target: "overworld-monster", count: 4 }],
    failureConditions: ["giver-dies", "deadline"], rewards: { gold: 95, alignment: 9, items: [{ itemKey: "warg-feed", count: 4 }], delivery: "giver-drops" }, abandonable: true,
  },
  {
    id: "goblin-tonic-roots", factionId: "goblins", title: "Roots That Kick Back",
    summary: "Collect cave roots for a clan alchemist's temperamental tonic.", giverProfessions: ["alchemist"],
    criteria: [{ kind: "collect", target: "glow-root", count: 8 }, { kind: "deliver", target: "moonberry", count: 3 }],
    failureConditions: ["giver-dies"], rewards: { gold: 58, alignment: 6, items: [{ itemKey: "goblin-tonic", count: 2 }], delivery: "giver-drops" }, abandonable: true,
  },
];

export const ATLANTIAN_SIDE_QUESTS: readonly SideQuestTemplate[] = [
  {
    id: "atlantian-nursery-light", factionId: "atlantians", title: "Light for the Nursery",
    summary: "Bring living coral and fresh glow kelp to a dim nursery alcove before its young reef fades.",
    giverProfessions: ["atlantian-kelpkeeper", "atlantian-glowmender"],
    criteria: [{ kind: "deliver", target: "glow-kelp", count: 10 }, { kind: "deliver", target: "living-coral", count: 4 }],
    failureConditions: ["giver-dies", "deadline"], rewards: { gold: 68, alignment: 7, items: [{ itemKey: "glowmender-salve", count: 2 }], delivery: "giver-drops" }, abandonable: true,
  },
  {
    id: "atlantian-black-current", factionId: "atlantians", title: "The Black Current",
    summary: "Drive prowling deepwater sharks away from a nursery current and bring Tidevine Fiber to repair its guide ropes.",
    giverProfessions: ["atlantian-trident-guard", "atlantian-tidewarden"],
    criteria: [{ kind: "defeat", target: "deepwater-shark", count: 2 }, { kind: "deliver", target: "tidevine-fiber", count: 6 }],
    failureConditions: ["giver-dies"], rewards: { gold: 94, alignment: 9, items: [{ itemKey: "lumen-pearl", count: 2 }], delivery: "giver-drops" }, abandonable: true,
  },
  {
    id: "atlantian-reef-memory", factionId: "atlantians", title: "What the Reef Remembers",
    summary: "Gather clear reefglass and lumen pearls for a coralcrafter restoring an old tide record.",
    giverProfessions: ["atlantian-coralwright", "atlantian-pearlbroker"],
    criteria: [{ kind: "collect", target: "lumen-pearl", count: 4 }, { kind: "deliver", target: "reefglass", count: 6 }],
    failureConditions: ["giver-dies"], rewards: { gold: 82, alignment: 8, items: [{ itemKey: "prismatic-pearl", count: 1 }], delivery: "giver-drops" }, abandonable: true,
  },
];

export const SUGARCOURT_SIDE_QUESTS: readonly SideQuestTemplate[] = [
  {
    id: "sugarcourt-kettle-moving", factionId: "sugarcourt", title: "Keep the Kettle Moving",
    summary: "Bring honey and ripe gumdrops to a Sugarboiler before the cooling slab goes quiet.",
    giverProfessions: ["sugarcourt-sugarboiler", "sugarcourt-sweetbroker"],
    criteria: [{ kind: "deliver", target: "honey-jar", count: 3 }, { kind: "deliver", target: "gumdrop", count: 8 }],
    failureConditions: ["giver-dies"], rewards: { gold: 68, alignment: 6, items: [{ itemKey: "peppermint-rush", count: 2 }], delivery: "giver-drops" }, abandonable: true,
  },
  {
    id: "sugarcourt-cracks-in-wall", factionId: "sugarcourt", title: "Cracks in the Candywall",
    summary: "Supply fresh sugarbricks and crystal for a Candysmith repairing the borough wall.",
    giverProfessions: ["sugarcourt-candysmith", "sugarcourt-crown-confectioner"],
    criteria: [{ kind: "deliver", target: "boiled-sugarbrick", count: 12 }, { kind: "deliver", target: "crystal-shard", count: 4 }],
    failureConditions: ["giver-dies"], rewards: { gold: 92, alignment: 8, items: [{ itemKey: "candied-alloy", count: 2 }], delivery: "giver-drops" }, abandonable: true,
  },
  {
    id: "sugarcourt-collars-without-crests", factionId: "sugarcourt", title: "Collars Without Crests",
    summary: "Clear prowlers from the kennel road and bring soft treats for the frightened village companions.",
    giverProfessions: ["sugarcourt-kennelkeeper", "sugarcourt-brittle-guard"],
    criteria: [{ kind: "defeat", target: "overworld-monster", count: 4 }, { kind: "deliver", target: "marshmallow-tuft", count: 6 }],
    failureConditions: ["giver-dies", "deadline"], rewards: { gold: 96, alignment: 9, items: [{ itemKey: "syrup-bucket", count: 1 }], delivery: "giver-drops" }, abandonable: true,
  },
];

export const WOOD_ELF_SIDE_QUESTS: readonly SideQuestTemplate[] = [
  {
    id: "wood-elf-dimmed-garden", factionId: "wood-elves", title: "The Dimmed Garden",
    summary: "Restore a moon-garden with Dreamcaps and Moonpetals before its night pollinators abandon the grove.",
    giverProfessions: ["wood-elf-grovekeeper", "wood-elf-potioner"],
    criteria: [{ kind: "deliver", target: "dreamcap", count: 5 }, { kind: "deliver", target: "moonpetal", count: 8 }],
    failureConditions: ["giver-dies", "deadline"], rewards: { gold: 78, alignment: 8, items: [{ itemKey: "moonstep-elixir", count: 2 }], delivery: "giver-drops" }, abandonable: true,
  },
  {
    id: "wood-elf-leaves-at-the-gate", factionId: "wood-elves", title: "Leaves at the Gate",
    summary: "Drive night creatures from the enclave's living wall and return with proof the paths are clear.",
    giverProfessions: ["wood-elf-leafwarden", "wood-elf-bow-warden", "wood-elf-elderweaver"],
    criteria: [{ kind: "defeat", target: "overworld-monster", count: 6 }, { kind: "collect", target: "rotten-flesh", count: 3 }],
    failureConditions: ["giver-dies"], rewards: { gold: 104, alignment: 10, items: [{ itemKey: "glimmer-arrow", count: 18 }], delivery: "giver-drops" }, abandonable: true,
  },
  {
    id: "wood-elf-ink-of-stars", factionId: "wood-elves", title: "Ink of Stars",
    summary: "Gather glowing pond and forest reagents for a tomekeeper copying a spell that must not be forgotten.",
    giverProfessions: ["wood-elf-tomekeeper"],
    criteria: [{ kind: "deliver", target: "lumenreed-frond", count: 4 }, { kind: "deliver", target: "starfern", count: 6 }],
    failureConditions: ["giver-dies"], rewards: { gold: 92, alignment: 9, items: [{ itemKey: "tome-verdant-volley", count: 1 }], delivery: "giver-drops" }, abandonable: true,
  },
];

export const DWARF_SIDE_QUESTS: readonly SideQuestTemplate[] = [
  {
    id: "dwarf-gears-for-the-watch", factionId: "dwarves", title: "Gears for the Watch",
    summary: "Supply precision gears and copper so the hold's gate automatons can finish their maintenance cycle.",
    giverProfessions: ["dwarf-golemsmith", "dwarf-gearwright", "dwarf-gatewarden"],
    criteria: [{ kind: "deliver", target: "gear-cluster", count: 4 }, { kind: "deliver", target: "copper-ore", count: 8 }],
    failureConditions: ["giver-dies"], rewards: { gold: 118, alignment: 9, items: [{ itemKey: "lead-ball", count: 18 }], delivery: "giver-drops" }, abandonable: true,
  },
  {
    id: "dwarf-breathing-gallery", factionId: "dwarves", title: "A Breathing Gallery",
    summary: "Clear the lower gallery and bring lantern parts before the delvers reopen its ore seam.",
    giverProfessions: ["dwarf-delver", "dwarf-thane"],
    criteria: [{ kind: "defeat", target: "overworld-monster", count: 5 }, { kind: "deliver", target: "deepgear-alloy", count: 4 }],
    failureConditions: ["giver-dies", "deadline"], rewards: { gold: 136, alignment: 11, items: [{ itemKey: "deepgear-lantern", count: 2 }], delivery: "giver-drops" }, abandonable: true,
  },
  {
    id: "dwarf-first-automaton", factionId: "dwarves", title: "A Mind Made of Metal",
    summary: "Commit mana and materials at a Golem Forge, then report after claiming your first finished automaton.",
    giverProfessions: ["dwarf-golemsmith", "dwarf-thane"],
    criteria: [{ kind: "collect", target: "copper-scout-golem-orb", count: 1 }],
    failureConditions: ["giver-dies"], rewards: { gold: 165, alignment: 12, items: [{ itemKey: "blueprint-stone-bulwark", count: 1 }], delivery: "giver-drops" }, abandonable: true,
  },
];

const SIDE_QUESTS_BY_FACTION: Readonly<Record<NpcFactionId, readonly SideQuestTemplate[]>> = {
  hobbits: HOBBIT_SIDE_QUESTS,
  goblins: GOBLIN_SIDE_QUESTS,
  atlantians: ATLANTIAN_SIDE_QUESTS,
  sugarcourt: SUGARCOURT_SIDE_QUESTS,
  "wood-elves": WOOD_ELF_SIDE_QUESTS,
  dwarves: DWARF_SIDE_QUESTS,
};

export function sideQuestOffersFor(
  factionId: Exclude<FactionId, "player">,
  profession: ResidentProfession,
  settlementIdValue: string,
  worldDay: number,
  limit = 2,
) {
  const table = SIDE_QUESTS_BY_FACTION[factionId];
  return table
    .filter((quest) => quest.giverProfessions.includes(profession))
    .sort((a, b) => hash32(`${settlementIdValue}|${worldDay}|${a.id}`) - hash32(`${settlementIdValue}|${worldDay}|${b.id}`))
    .slice(0, Math.max(0, Math.min(4, Math.floor(limit))));
}

/** Useful integration bridge for merchant construction without importing UI. */
export function merchantProfessionForResident(profession: ResidentProfession): MerchantProfession {
  return profession;
}
