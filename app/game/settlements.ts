import {
  FACTIONS,
  checkAuthority,
  stampAuthority,
  type AuthorityCommand,
  type AuthorityStampedState,
  type FactionId,
  type FactionRace,
  type TownCaptureReceipt,
} from "./factions.ts";
import type { GoldAmount, MerchantProfession } from "./economy.ts";

export type SettlementSize = "hamlet" | "village" | "town";
export type SettlementPoint = Readonly<{ x: number; z: number }>;
export type SettlementBiome =
  | "forest"
  | "wildwood"
  | "meadow"
  | "flower-meadow"
  | "river-valley"
  | "highlands"
  | "badlands"
  | "cloudreed-glen"
  | "rocky-forest";

export const SETTLEMENT_SIZE_RULES: Readonly<Record<SettlementSize, Readonly<{
  radiusBlocks: number;
  buildingCount: number;
  populationTarget: number;
  populationHardLimit: number;
  minimumSpacingChunks: number;
  gateCount: number;
}>>> = {
  hamlet: { radiusBlocks: 14, buildingCount: 6, populationTarget: 7, populationHardLimit: 14, minimumSpacingChunks: 24, gateCount: 2 },
  village: { radiusBlocks: 22, buildingCount: 11, populationTarget: 15, populationHardLimit: 30, minimumSpacingChunks: 32, gateCount: 3 },
  town: { radiusBlocks: 31, buildingCount: 18, populationTarget: 26, populationHardLimit: 48, minimumSpacingChunks: 42, gateCount: 4 },
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
  return `${factionId === "hobbits" ? "freehold" : "clanhold"}-${regionX.toString(36)}-${regionZ.toString(36)}-${hash32(`${worldSeed}|${regionX}|${regionZ}|${factionId}`).toString(36)}`;
}

export function settlementBiomeEligible(factionId: Exclude<FactionId, "player">, biome: string) {
  return FACTIONS[factionId].homeBiomes.includes(biome);
}

function chooseFactionForBiome(worldSeed: string, regionX: number, regionZ: number, biome: SettlementBiome): Exclude<FactionId, "player"> | null {
  const hobbit = settlementBiomeEligible("hobbits", biome);
  const goblin = settlementBiomeEligible("goblins", biome);
  if (!hobbit && !goblin) return null;
  if (hobbit && goblin) return hashUnit(worldSeed, `${regionX}|${regionZ}|faction`) < 0.5 ? "hobbits" : "goblins";
  return hobbit ? "hobbits" : "goblins";
}

export function hasSettlementSpacing(candidate: Pick<SettlementCandidate, "center" | "size">, existing: readonly ExistingSettlementLocation[]) {
  const required = SETTLEMENT_SIZE_RULES[candidate.size].minimumSpacingChunks * 16;
  return existing.every((other) => Math.hypot(other.center.x - candidate.center.x, other.center.z - candidate.center.z) >= Math.max(required, SETTLEMENT_SIZE_RULES[other.size].minimumSpacingChunks * 16));
}

/**
 * One bounded candidate per 32x32-chunk region. The density gate keeps towns
 * meaningful, while explicit spacing protects neighboring layout footprints.
 */
export function planSettlementCandidate(input: Readonly<{
  worldSeed: string;
  regionX: number;
  regionZ: number;
  biome: SettlementBiome;
  existing: readonly ExistingSettlementLocation[];
}>): SettlementCandidate | null {
  const factionId = chooseFactionForBiome(input.worldSeed, input.regionX, input.regionZ, input.biome);
  if (!factionId || hashUnit(input.worldSeed, `${input.regionX}|${input.regionZ}|density`) >= 0.34) return null;
  const sizeRoll = hashUnit(input.worldSeed, `${input.regionX}|${input.regionZ}|size`);
  const size: SettlementSize = sizeRoll < 0.58 ? "hamlet" : sizeRoll < 0.9 ? "village" : "town";
  const regionSizeBlocks = 32 * 16;
  const center = {
    x: input.regionX * regionSizeBlocks + 96 + Math.floor(hashUnit(input.worldSeed, `${input.regionX}|${input.regionZ}|x`) * 320),
    z: input.regionZ * regionSizeBlocks + 96 + Math.floor(hashUnit(input.worldSeed, `${input.regionX}|${input.regionZ}|z`) * 320),
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
  };
  return hasSettlementSpacing(candidate, input.existing) ? candidate : null;
}

export type SettlementBuildingRole =
  | "mayor-hall"
  | "home"
  | "guardhouse"
  | "market"
  | "farm"
  | "mine-store"
  | "blacksmith"
  | "bank"
  | "brewery"
  | "alchemist"
  | "warg-kennel"
  | "warehouse";

export type SettlementFurniture = Readonly<{
  kind: "bed" | "door" | "chair" | "table" | "barrel" | "distillery" | "merchant-counter" | "bank-counter" | "forge";
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

export type SettlementLightPlan = Readonly<{
  position: SettlementPoint;
  kind: "lantern-post" | "window-lantern" | "gate-brazier";
  monsterSafeRadius: number;
}>;

export type SettlementLayoutPlan = Readonly<{
  schema: 1;
  settlementId: string;
  center: SettlementPoint;
  radiusBlocks: number;
  buildings: readonly SettlementBuildingPlan[];
  paths: readonly SettlementPoint[];
  wall: readonly SettlementWallNode[];
  gates: readonly SettlementGatePlan[];
  lights: readonly SettlementLightPlan[];
  beds: number;
  doors: number;
  populationSoftCap: number;
}>;

function buildingRoles(factionId: Exclude<FactionId, "player">, size: SettlementSize) {
  const common: SettlementBuildingRole[] = ["mayor-hall", "guardhouse", "market", "home", "home", "farm"];
  const themed: SettlementBuildingRole[] = factionId === "hobbits"
    ? ["brewery", "bank", "farm", "home", "alchemist", "warehouse"]
    : ["mine-store", "blacksmith", "warg-kennel", "home", "alchemist", "warehouse"];
  const expanded: SettlementBuildingRole[] = [...common, ...themed, "home", "guardhouse", "market", "home", "farm", "warehouse"];
  return expanded.slice(0, SETTLEMENT_SIZE_RULES[size].buildingCount);
}

function paletteFor(factionId: Exclude<FactionId, "player">, role: SettlementBuildingRole) {
  if (factionId === "hobbits") {
    return role === "bank" ? ["river-stone", "dark-oak", "copper"] : ["wildwood", "plaster", "mossy-thatch"];
  }
  return role === "blacksmith" ? ["basalt", "iron", "ember-brick"] : ["stone", "brasswood", "patched-slate"];
}

function furnitureFor(buildingId: string, role: SettlementBuildingRole, position: SettlementPoint, facing: 0 | 1 | 2 | 3) {
  const entries: SettlementFurniture[] = [{ kind: "door", position: { x: position.x, z: position.z - 2 }, facing, functional: true }];
  const add = (kind: SettlementFurniture["kind"], dx: number, dz: number, functional = true) => entries.push({ kind, position: { x: position.x + dx, z: position.z + dz }, facing, functional });
  if (role === "home" || role === "mayor-hall" || role === "guardhouse") add("bed", -1, 1);
  if (role === "home" || role === "mayor-hall") add("bed", 1, 1);
  add("chair", -1, 0);
  add("table", 0, 0);
  if (role === "brewery") { add("barrel", -1, 1); add("distillery", 1, 1); }
  if (role === "bank") add("bank-counter", 1, 0);
  if (role === "market") add("merchant-counter", 1, 0);
  if (role === "blacksmith") add("forge", 1, 1);
  void buildingId;
  return entries;
}

function addLine(points: SettlementPoint[], from: SettlementPoint, to: SettlementPoint, spacing = 2) {
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  const steps = Math.max(1, Math.ceil(distance / spacing));
  for (let index = 0; index <= steps; index += 1) {
    const t = index / steps;
    points.push({ x: Math.round(from.x + (to.x - from.x) * t), z: Math.round(from.z + (to.z - from.z) * t) });
  }
}

export function calculatePopulationSoftCap(beds: number, doors: number, size: SettlementSize) {
  const rule = SETTLEMENT_SIZE_RULES[size];
  return Math.max(2, Math.min(rule.populationHardLimit, Math.max(0, Math.floor(beds)) + Math.floor(Math.max(0, doors) / 2)));
}

/** Emits semantic placements; the world layer remains responsible for blocks. */
export function planSettlementLayout(candidate: SettlementCandidate): SettlementLayoutPlan {
  const rule = SETTLEMENT_SIZE_RULES[candidate.size];
  const roles = buildingRoles(candidate.factionId, candidate.size);
  const buildings: SettlementBuildingPlan[] = [];
  const paths: SettlementPoint[] = [];
  roles.forEach((role, index) => {
    const ring = index === 0 ? 0 : 7 + Math.floor(index / 6) * 8;
    const angle = index === 0 ? 0 : (index * 2.399963 + hashUnit(candidate.id, `angle-${index}`) * 0.35);
    const position = index === 0 ? candidate.center : {
      x: Math.round(candidate.center.x + Math.cos(angle) * ring),
      z: Math.round(candidate.center.z + Math.sin(angle) * ring),
    };
    const facing = (Math.floor((angle + Math.PI / 4) / (Math.PI / 2)) & 3) as 0 | 1 | 2 | 3;
    const width = role === "mayor-hall" ? 9 : role === "warehouse" ? 8 : 5 + Math.floor(hashUnit(candidate.id, `width-${index}`) * 3);
    const depth = role === "mayor-hall" ? 8 : 5 + Math.floor(hashUnit(candidate.id, `depth-${index}`) * 3);
    const id = `${candidate.id}-building-${index}`;
    buildings.push({
      id,
      role,
      position,
      facing,
      width,
      depth,
      floors: role === "mayor-hall" || (candidate.size === "town" && index % 5 === 0) ? 2 : 1,
      materialPalette: paletteFor(candidate.factionId, role),
      furniture: furnitureFor(id, role, position, facing),
    });
    addLine(paths, candidate.center, position, 2);
  });

  const gateAngles = Array.from({ length: rule.gateCount }, (_, index) => index * Math.PI * 2 / rule.gateCount);
  const gates: SettlementGatePlan[] = gateAngles.map((angle, index) => ({
    id: `${candidate.id}-gate-${index}`,
    position: {
      x: Math.round(candidate.center.x + Math.cos(angle) * rule.radiusBlocks),
      z: Math.round(candidate.center.z + Math.sin(angle) * rule.radiusBlocks),
    },
    facing: (Math.round(angle / (Math.PI / 2)) & 3) as 0 | 1 | 2 | 3,
    patrolRadius: 6,
  }));
  for (const gate of gates) addLine(paths, candidate.center, gate.position, 2);

  const wall: SettlementWallNode[] = [];
  const circumferenceSteps = Math.min(144, Math.max(40, Math.round(Math.PI * 2 * rule.radiusBlocks / 2)));
  for (let index = 0; index < circumferenceSteps; index += 1) {
    const angle = index * Math.PI * 2 / circumferenceSteps;
    const position = {
      x: Math.round(candidate.center.x + Math.cos(angle) * rule.radiusBlocks),
      z: Math.round(candidate.center.z + Math.sin(angle) * rule.radiusBlocks),
    };
    if (gates.some((gate) => Math.hypot(gate.position.x - position.x, gate.position.z - position.z) < 2.5)) continue;
    wall.push({ position, kind: index % Math.max(10, Math.floor(circumferenceSteps / 8)) === 0 ? "tower" : "wall" });
  }

  const uniquePaths = [...new Map(paths.map((point) => [`${point.x},${point.z}`, point])).values()].slice(0, 512);
  const lights: SettlementLightPlan[] = [
    ...gates.flatMap((gate) => [
      { position: { x: gate.position.x + 2, z: gate.position.z }, kind: "gate-brazier" as const, monsterSafeRadius: 10 },
      { position: { x: gate.position.x - 2, z: gate.position.z }, kind: "gate-brazier" as const, monsterSafeRadius: 10 },
    ]),
    ...uniquePaths.filter((_, index) => index % 14 === 0).slice(0, 24).map((position) => ({ position, kind: "lantern-post" as const, monsterSafeRadius: 8 })),
  ];
  const furniture = buildings.flatMap((building) => building.furniture);
  const beds = furniture.filter((entry) => entry.kind === "bed").length;
  const doors = furniture.filter((entry) => entry.kind === "door").length;
  return {
    schema: 1,
    settlementId: candidate.id,
    center: candidate.center,
    radiusBlocks: rule.radiusBlocks,
    buildings,
    paths: uniquePaths,
    wall,
    gates,
    lights,
    beds,
    doors,
    populationSoftCap: calculatePopulationSoftCap(beds, doors, candidate.size),
  };
}

export const RESIDENT_PROFESSIONS = ["mayor", "warrior", "farmer", "miner", "brewer", "alchemist", "blacksmith", "banker", "general"] as const;
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
  kind: "warg";
  factionId: "goblins";
  position: SettlementPoint;
  patrolGateId: string;
  tameable: false;
}>;

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

const HEARTHKIN_GIVEN = ["Ada", "Bram", "Clover", "Dodie", "Elsin", "Fenn", "Marnie", "Nim", "Pip", "Rosie", "Tobbin", "Willa"] as const;
const HEARTHKIN_FAMILY = ["Barleywick", "Bramblebank", "Caskbottom", "Hearthdown", "Mossfoot", "Thimbleburrow", "Willowmere"] as const;
const GOBLIN_GIVEN = ["Bikka", "Dreg", "Fizzik", "Grunna", "Kett", "Mogri", "Nix", "Rakka", "Skrim", "Tazza", "Vekk", "Zib"] as const;
const GOBLIN_CLAN = ["Brassroot", "Cinderknuckle", "Flintcap", "Rattlepot", "Rustwhistle", "Slatebite", "Spindlegear"] as const;
const WAYFARER_GIVEN = ["Ash", "Ember", "Fern", "Juniper", "Mica", "River", "Rowan", "Vale"] as const;

export function generateResidentName(race: FactionRace, seed: string) {
  if (race === "hearthkin") return `${hashPick(HEARTHKIN_GIVEN, seed, "given")} ${hashPick(HEARTHKIN_FAMILY, seed, "family")}`;
  if (race === "goblin") return `${hashPick(GOBLIN_GIVEN, seed, "given")} ${hashPick(GOBLIN_CLAN, seed, "clan")}`;
  return hashPick(WAYFARER_GIVEN, seed, "given");
}

function professionPlan(candidate: SettlementCandidate, count: number) {
  const common: ResidentProfession[] = ["mayor", "warrior", "farmer", "general", "warrior", "general"];
  const faction: ResidentProfession[] = candidate.factionId === "hobbits"
    ? ["brewer", "banker", "farmer", "alchemist", "blacksmith", "general"]
    : ["miner", "blacksmith", "alchemist", "warrior", "general", "miner"];
  return Array.from({ length: count }, (_, index) => index < common.length ? common[index] : faction[(index - common.length) % faction.length]);
}

function preferredBuilding(layout: SettlementLayoutPlan, profession: ResidentProfession) {
  const role: SettlementBuildingRole = profession === "mayor" ? "mayor-hall"
    : profession === "warrior" ? "guardhouse"
      : profession === "farmer" ? "farm"
        : profession === "miner" ? "mine-store"
          : profession === "brewer" ? "brewery"
            : profession === "banker" ? "bank"
              : profession === "alchemist" ? "alchemist"
                : profession === "blacksmith" ? "blacksmith"
                  : "home";
  return layout.buildings.find((building) => building.role === role) ?? layout.buildings.find((building) => building.role === "home") ?? layout.buildings[0];
}

function defaultEquipment(factionId: Exclude<FactionId, "player">, profession: ResidentProfession, index: number): ResidentEquipment {
  if (profession === "warrior") {
    if (factionId === "hobbits") return { weapon: index % 4 === 1 ? "crossbow" : "hearth-hammer", tool: null };
    return { weapon: "goblin-spear", tool: null };
  }
  if (profession === "farmer") return { weapon: null, tool: "hoe" };
  if (profession === "miner") return { weapon: null, tool: "pickaxe" };
  if (profession === "blacksmith") return { weapon: null, tool: "hammer" };
  return { weapon: null, tool: null };
}

export function createSettlementState(authorityId: string, candidate: SettlementCandidate, layout = planSettlementLayout(candidate)): SettlementState {
  const count = Math.min(SETTLEMENT_SIZE_RULES[candidate.size].populationTarget, layout.populationSoftCap);
  const professions = professionPlan(candidate, count);
  const residents = professions.map((profession, index): SettlementResident => {
    const building = preferredBuilding(layout, profession);
    const id = `${candidate.id}-resident-${index}`;
    return {
      id,
      factionId: candidate.factionId,
      race: FACTIONS[candidate.factionId].race,
      name: generateResidentName(FACTIONS[candidate.factionId].race, `${candidate.worldSeed}|${id}`),
      profession,
      adult: true,
      alive: true,
      health: profession === "warrior" ? 18 : 12,
      maxHealth: profession === "warrior" ? 18 : 12,
      homeBuildingId: building?.id ?? null,
      position: building?.position ?? candidate.center,
      equipment: defaultEquipment(candidate.factionId, profession, index),
      hiredByPlayerId: null,
      orders: { stance: "defensive", follow: false, followDistance: "dynamic", holdPosition: null },
    };
  });
  const alignedCreatures: AlignedSettlementCreature[] = candidate.factionId === "goblins"
    ? layout.gates.slice(0, Math.min(3, layout.gates.length)).map((gate, index) => ({
      id: `${candidate.id}-warg-${index}`,
      kind: "warg",
      factionId: "goblins",
      position: gate.position,
      patrolGateId: gate.id,
      tameable: false,
    }))
    : [];
  return {
    schema: 1,
    authorityId,
    revision: 0,
    recentEventIds: [],
    id: candidate.id,
    worldSeed: candidate.worldSeed,
    size: candidate.size,
    biome: candidate.biome,
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
  | "hold-position";

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
  if (input.monsterVisible) {
    if (resident.profession === "warrior" || resident.health / Math.max(1, resident.maxHealth) < 0.6) {
      return { action: "fight", target: gate?.position ?? null, reason: resident.profession === "warrior" ? "defend-town" : "cornered-below-60-percent" };
    }
    return { action: "flee", target: resident.homeBuildingId ? resident.position : settlement.layout.center, reason: "civilian-safety" };
  }
  const hour = ((input.hour % 24) + 24) % 24;
  if (resident.profession === "warrior") return { action: "patrol-gate", target: gate?.position ?? settlement.layout.center, reason: "gate-watch" };
  if (hour >= 21 || hour < 6) return { action: "sleep", target: resident.position, reason: "night" };
  const socialRoll = hashUnit(`${settlement.id}|${resident.id}|${input.worldDay}`, Math.floor(hour));
  if ((hour >= 18 || (hour >= 12 && hour < 14)) && socialRoll < 0.42) {
    const chairs = settlement.layout.buildings.flatMap((building) => building.furniture).filter((entry) => entry.kind === "chair");
    return { action: socialRoll < 0.2 ? "sit" : "socialize", target: hashPick(chairs, resident.id, input.worldDay)?.position ?? settlement.layout.center, reason: "daily-life" };
  }
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
  if (settlement.residents.some((resident) => resident.alive && resident.profession === "mayor")) return { state: settlement, applied: false, reason: "not-needed" };
  const candidates = settlement.residents.filter((resident) => resident.alive && resident.adult && resident.factionId === settlement.ownerFactionId);
  if (candidates.length === 0) return { state: settlement, applied: false, reason: "no-candidate" };
  const elected = [...candidates].sort((a, b) => hash32(`${settlement.id}|${day}|${a.id}`) - hash32(`${settlement.id}|${day}|${b.id}`))[0];
  const residents = settlement.residents.map((resident) => resident.id === elected.id ? { ...resident, profession: "mayor" as const } : resident);
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
  const race = settlement.ownerFactionId === "player" ? "wayfarer" : FACTIONS[settlement.ownerFactionId].race;
  const id = `${settlement.id}-born-${day}-${index}`;
  const home = settlement.layout.buildings.find((building) => building.role === "home") ?? settlement.layout.buildings[0];
  const child: SettlementResident = {
    id,
    factionId: settlement.ownerFactionId,
    race,
    name: generateResidentName(race, `${settlement.worldSeed}|${id}`),
    profession: "general",
    adult: false,
    alive: true,
    health: 8,
    maxHealth: 8,
    homeBuildingId: home?.id ?? null,
    position: home?.position ?? settlement.layout.center,
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
  const residents = receipt.transferNonWarriors
    ? settlement.residents.map((resident) => resident.alive && resident.profession !== "warrior"
      ? { ...resident, factionId: receipt.to, hiredByPlayerId: receipt.to === "player" ? "settlement" : resident.hiredByPlayerId }
      : resident)
    : settlement.residents;
  const cultureRace = receipt.to === "player" ? settlement.cultureRace : FACTIONS[receipt.to].race;
  const history: SettlementOwnershipRecord = { day: Math.max(0, Math.floor(worldDay)), from: settlement.ownerFactionId, to: receipt.to, captureReceiptId: receipt.id };
  const alignedCreatures: readonly AlignedSettlementCreature[] = receipt.to === "goblins"
    ? settlement.layout.gates.slice(0, Math.min(3, settlement.layout.gates.length)).map((gate, index) => ({
      id: `${settlement.id}-warg-${history.day}-${index}`,
      kind: "warg" as const,
      factionId: "goblins" as const,
      position: gate.position,
      patrolGateId: gate.id,
      tameable: false as const,
    }))
    : [];
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
  if (!resident || !resident.alive || !resident.adult || resident.profession === "mayor" || resident.hiredByPlayerId) {
    return { state: settlement, applied: false, reason: "not-hireable", cost: "0" };
  }
  const cost = resident.profession === "warrior" ? "180" : "110";
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
    summary: "Thin the night creatures prowling the lantern road.", giverProfessions: ["warrior", "mayor"],
    criteria: [{ kind: "defeat", target: "overworld-monster", count: 5 }, { kind: "visit", target: "town-gate", count: 1 }],
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
    summary: "Keep a young patrol Warg safe while its handler repairs the gate.", giverProfessions: ["warrior", "mayor"],
    criteria: [{ kind: "protect", target: "quest-warg", count: 1 }, { kind: "defeat", target: "overworld-monster", count: 4 }],
    failureConditions: ["giver-dies", "protected-target-dies", "deadline"], rewards: { gold: 95, alignment: 9, items: [{ itemKey: "warg-feed", count: 4 }], delivery: "giver-drops" }, abandonable: true,
  },
  {
    id: "goblin-tonic-roots", factionId: "goblins", title: "Roots That Kick Back",
    summary: "Collect cave roots for a clan alchemist's temperamental tonic.", giverProfessions: ["alchemist"],
    criteria: [{ kind: "collect", target: "glow-root", count: 8 }, { kind: "deliver", target: "moonberry", count: 3 }],
    failureConditions: ["giver-dies"], rewards: { gold: 58, alignment: 6, items: [{ itemKey: "goblin-tonic", count: 2 }], delivery: "giver-drops" }, abandonable: true,
  },
];

export function sideQuestOffersFor(
  factionId: Exclude<FactionId, "player">,
  profession: ResidentProfession,
  settlementIdValue: string,
  worldDay: number,
  limit = 2,
) {
  const table = factionId === "hobbits" ? HOBBIT_SIDE_QUESTS : GOBLIN_SIDE_QUESTS;
  return table
    .filter((quest) => quest.giverProfessions.includes(profession))
    .sort((a, b) => hash32(`${settlementIdValue}|${worldDay}|${a.id}`) - hash32(`${settlementIdValue}|${worldDay}|${b.id}`))
    .slice(0, Math.max(0, Math.min(4, Math.floor(limit))));
}

/** Useful integration bridge for merchant construction without importing UI. */
export function merchantProfessionForResident(profession: ResidentProfession): MerchantProfession {
  return profession;
}
