import {
  FACTIONS,
  checkAuthority,
  factionCanOccupyEnvironment,
  raceBreathesWater,
  stampAuthority,
  type AuthorityCommand,
  type AuthorityStampedState,
  type FactionId,
  type FactionRace,
  type TownCaptureReceipt,
} from "./factions.ts";
import type { GoldAmount, MerchantProfession } from "./economy.ts";

export type SettlementSize = "hamlet" | "village" | "town";
export type SettlementPoint = Readonly<{ x: number; z: number; y?: number }>;
export type SettlementEnvironment = "surface" | "underwater";
export type SettlementTopology = "walled-surface" | "open-underwater";
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
  | "lumen-trench";

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
  const prefix = factionId === "hobbits" ? "freehold" : factionId === "goblins" ? "clanhold" : "tidehold";
  return `${prefix}-${regionX.toString(36)}-${regionZ.toString(36)}-${hash32(`${worldSeed}|${regionX}|${regionZ}|${factionId}`).toString(36)}`;
}

export function settlementBiomeEligible(factionId: Exclude<FactionId, "player">, biome: string) {
  return FACTIONS[factionId].homeBiomes.includes(biome);
}

function chooseFactionForBiome(worldSeed: string, regionX: number, regionZ: number, biome: SettlementBiome): Exclude<FactionId, "player"> | null {
  const eligible = (["hobbits", "goblins", "atlantians"] as const).filter((factionId) => settlementBiomeEligible(factionId, biome));
  if (eligible.length === 0) return null;
  return eligible[Math.min(eligible.length - 1, Math.floor(hashUnit(worldSeed, `${regionX}|${regionZ}|faction`) * eligible.length))];
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
  floorY?: number;
}>): SettlementCandidate | null {
  const factionId = chooseFactionForBiome(input.worldSeed, input.regionX, input.regionZ, input.biome);
  const density = factionId === "atlantians" ? 0.18 : 0.34;
  if (!factionId || hashUnit(input.worldSeed, `${input.regionX}|${input.regionZ}|density`) >= density) return null;
  const sizeRoll = hashUnit(input.worldSeed, `${input.regionX}|${input.regionZ}|size`);
  const size: SettlementSize = sizeRoll < 0.58 ? "hamlet" : sizeRoll < 0.9 ? "village" : "town";
  const regionSizeBlocks = 32 * 16;
  const environment: SettlementEnvironment = factionId === "atlantians" ? "underwater" : "surface";
  const floorY = environment === "underwater"
    ? Math.max(-52, Math.min(22, Math.floor(input.floorY ?? (input.biome === "lumen-trench" ? -28 : 10))))
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
  | "current-store";

export type SettlementFurniture = Readonly<{
  kind:
    | "bed"
    | "door"
    | "chair"
    | "table"
    | "barrel"
    | "distillery"
    | "merchant-counter"
    | "bank-counter"
    | "forge"
    | "nest"
    | "rest-alcove"
    | "kelp-trough"
    | "coral-loom"
    | "pearl-counter"
    | "glow-basin";
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

export type SettlementApproachPlan = Readonly<{
  id: string;
  position: SettlementPoint;
  facing: 0 | 1 | 2 | 3;
  patrolRadius: number;
  kind: "open-current" | "trench-arch";
}>;

export type SettlementLightPlan = Readonly<{
  position: SettlementPoint;
  kind:
    | "lantern-post"
    | "window-lantern"
    | "gate-brazier"
    | "glowstone-cluster"
    | "bioluminescent-orb"
    | "lumen-spire";
  monsterSafeRadius: number;
}>;

export type SettlementVerticalLayer = Readonly<{
  y: number;
  purpose: "reef-floor" | "dwelling-ring" | "current-lane" | "light-canopy";
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

function buildingRoles(factionId: Exclude<FactionId, "player">, size: SettlementSize) {
  if (factionId === "atlantians") {
    const aquatic: SettlementBuildingRole[] = [
      "tide-hall", "guard-grotto", "pearl-market", "home", "kelp-garden", "coral-workshop",
      "glow-clinic", "home", "current-store", "kelp-garden", "guard-grotto", "home",
      "coral-workshop", "pearl-market", "home", "glow-clinic", "current-store", "kelp-garden",
    ];
    return aquatic.slice(0, SETTLEMENT_SIZE_RULES[size].buildingCount);
  }
  const common: SettlementBuildingRole[] = ["mayor-hall", "guardhouse", "market", "home", "home", "farm"];
  const themed: SettlementBuildingRole[] = factionId === "hobbits"
    ? ["brewery", "bank", "farm", "home", "alchemist", "warehouse"]
    : ["mine-store", "blacksmith", "warg-kennel", "home", "alchemist", "warehouse"];
  const expanded: SettlementBuildingRole[] = [...common, ...themed, "home", "guardhouse", "market", "home", "farm", "warehouse"];
  return expanded.slice(0, SETTLEMENT_SIZE_RULES[size].buildingCount);
}

function paletteFor(factionId: Exclude<FactionId, "player">, role: SettlementBuildingRole) {
  if (factionId === "atlantians") {
    if (role === "tide-hall") return ["reef-stone", "reefglass", "lumen-coral"];
    if (role === "glow-clinic") return ["pale-coral", "reefglass", "glowstone"];
    return ["living-coral", "reef-stone", "reefglass"];
  }
  if (factionId === "hobbits") {
    return role === "bank" ? ["river-stone", "dark-oak", "copper"] : ["wildwood", "plaster", "mossy-thatch"];
  }
  return role === "blacksmith" ? ["basalt", "iron", "ember-brick"] : ["stone", "brasswood", "patched-slate"];
}

function furnitureFor(factionId: Exclude<FactionId, "player">, buildingId: string, role: SettlementBuildingRole, position: SettlementPoint, facing: 0 | 1 | 2 | 3) {
  if (factionId === "atlantians") {
    const entries: SettlementFurniture[] = [];
    const add = (kind: SettlementFurniture["kind"], dx: number, dz: number, dy = 0, functional = true) => entries.push({
      kind,
      position: { x: position.x + dx, z: position.z + dz, ...(position.y === undefined ? {} : { y: position.y + dy }) },
      facing,
      functional,
    });
    if (["home", "tide-hall", "guard-grotto"].includes(role)) add("rest-alcove", -1, 1);
    if (role === "home" || role === "tide-hall") add("nest", 1, 1, 1);
    if (role === "kelp-garden") add("kelp-trough", 0, 0);
    if (role === "coral-workshop") add("coral-loom", 0, 0);
    if (role === "pearl-market") add("pearl-counter", 0, 0);
    if (role === "glow-clinic") add("glow-basin", 0, 0);
    void buildingId;
    return entries;
  }
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

/** Emits semantic placements; the world layer remains responsible for blocks. */
export function planSettlementLayout(candidate: SettlementCandidate): SettlementLayoutPlan {
  const rule = SETTLEMENT_SIZE_RULES[candidate.size];
  const environment: SettlementEnvironment = candidate.environment ?? (candidate.factionId === "atlantians" ? "underwater" : "surface");
  const aquatic = environment === "underwater";
  const center: SettlementPoint = aquatic
    ? { ...candidate.center, y: candidate.center.y ?? (candidate.floorY ?? (candidate.biome === "lumen-trench" ? -28 : 10)) + 2 }
    : candidate.center;
  const roles = buildingRoles(candidate.factionId, candidate.size);
  const buildings: SettlementBuildingPlan[] = [];
  const paths: SettlementPoint[] = [];
  roles.forEach((role, index) => {
    const ring = index === 0 ? 0 : 7 + Math.floor(index / 6) * 8;
    const angle = index === 0 ? 0 : (index * 2.399963 + hashUnit(candidate.id, `angle-${index}`) * 0.35);
    const verticalOffset = aquatic && index > 0 ? 2 + (index % 4) * 2 + Math.floor(index / 8) * 2 : 0;
    const position: SettlementPoint = index === 0 ? center : {
      x: Math.round(center.x + Math.cos(angle) * ring),
      z: Math.round(center.z + Math.sin(angle) * ring),
      ...(center.y === undefined ? {} : { y: center.y + verticalOffset }),
    };
    const facing = (Math.floor((angle + Math.PI / 4) / (Math.PI / 2)) & 3) as 0 | 1 | 2 | 3;
    const civicHall = role === "mayor-hall" || role === "tide-hall";
    const width = civicHall ? 9 : role === "warehouse" || role === "current-store" ? 8 : 5 + Math.floor(hashUnit(candidate.id, `width-${index}`) * 3);
    const depth = civicHall ? 8 : 5 + Math.floor(hashUnit(candidate.id, `depth-${index}`) * 3);
    const id = `${candidate.id}-building-${index}`;
    buildings.push({
      id,
      role,
      position,
      facing,
      width,
      depth,
      floors: civicHall || (candidate.size === "town" && index % 5 === 0) ? 2 : 1,
      materialPalette: paletteFor(candidate.factionId, role),
      furniture: furnitureFor(candidate.factionId, id, role, position, facing),
    });
    addLine(paths, center, position, 2);
  });

  const gateAngles = aquatic ? [] : Array.from({ length: rule.gateCount }, (_, index) => index * Math.PI * 2 / rule.gateCount);
  const gates: SettlementGatePlan[] = gateAngles.map((angle, index) => ({
    id: `${candidate.id}-gate-${index}`,
    position: {
      x: Math.round(center.x + Math.cos(angle) * rule.radiusBlocks),
      z: Math.round(center.z + Math.sin(angle) * rule.radiusBlocks),
    },
    facing: (Math.round(angle / (Math.PI / 2)) & 3) as 0 | 1 | 2 | 3,
    patrolRadius: 6,
  }));
  for (const gate of gates) addLine(paths, center, gate.position, 2);

  const approachCount = aquatic ? Math.max(3, Math.min(5, rule.gateCount + 1)) : 0;
  const approaches: SettlementApproachPlan[] = Array.from({ length: approachCount }, (_, index) => {
    const angle = index * Math.PI * 2 / approachCount + hashUnit(candidate.id, "approach-rotation") * 0.45;
    const yOffset = index % 2 === 0 ? 5 : 9;
    return {
      id: `${candidate.id}-current-${index}`,
      position: {
        x: Math.round(center.x + Math.cos(angle) * (rule.radiusBlocks - 2)),
        z: Math.round(center.z + Math.sin(angle) * (rule.radiusBlocks - 2)),
        y: (center.y ?? 0) + yOffset,
      },
      facing: (Math.round(angle / (Math.PI / 2)) & 3) as 0 | 1 | 2 | 3,
      patrolRadius: 8,
      kind: candidate.biome === "lumen-trench" ? "trench-arch" as const : "open-current" as const,
    };
  });
  for (const approach of approaches) addLine(paths, center, approach.position, 2);

  const wall: SettlementWallNode[] = [];
  const circumferenceSteps = Math.min(144, Math.max(40, Math.round(Math.PI * 2 * rule.radiusBlocks / 2)));
  for (let index = 0; !aquatic && index < circumferenceSteps; index += 1) {
    const angle = index * Math.PI * 2 / circumferenceSteps;
    const position = {
      x: Math.round(center.x + Math.cos(angle) * rule.radiusBlocks),
      z: Math.round(center.z + Math.sin(angle) * rule.radiusBlocks),
    };
    if (gates.some((gate) => Math.hypot(gate.position.x - position.x, gate.position.z - position.z) < 2.5)) continue;
    wall.push({ position, kind: index % Math.max(10, Math.floor(circumferenceSteps / 8)) === 0 ? "tower" : "wall" });
  }

  const uniquePaths = [...new Map(paths.map((point) => [`${point.x},${point.y ?? "s"},${point.z}`, point])).values()].slice(0, 512);
  const lights: SettlementLightPlan[] = aquatic
    ? [
      { position: { ...center, y: (center.y ?? 0) + 14 }, kind: "lumen-spire" as const, monsterSafeRadius: 16 },
      ...buildings.slice(0, 24).map((building, index) => ({
        position: { ...building.position, y: (building.position.y ?? center.y ?? 0) + 3 },
        kind: index % 3 === 0 ? "glowstone-cluster" as const : "bioluminescent-orb" as const,
        monsterSafeRadius: index % 3 === 0 ? 11 : 9,
      })),
      ...approaches.map((approach) => ({ position: approach.position, kind: "glowstone-cluster" as const, monsterSafeRadius: 12 })),
    ].slice(0, 32)
    : [
      ...gates.flatMap((gate) => [
        { position: { x: gate.position.x + 2, z: gate.position.z }, kind: "gate-brazier" as const, monsterSafeRadius: 10 },
        { position: { x: gate.position.x - 2, z: gate.position.z }, kind: "gate-brazier" as const, monsterSafeRadius: 10 },
      ]),
      ...uniquePaths.filter((_, index) => index % 14 === 0).slice(0, 24).map((position) => ({ position, kind: "lantern-post" as const, monsterSafeRadius: 8 })),
    ];
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
    radiusBlocks: rule.radiusBlocks,
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
  if (settlement.environment === "underwater" || settlement.layout?.environment === "underwater") return "underwater";
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
      topology: layout.topology ?? (environment === "underwater" ? "open-underwater" : "walled-surface"),
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

export function generateResidentName(race: FactionRace, seed: string) {
  if (race === "hearthkin") return `${hashPick(HEARTHKIN_GIVEN, seed, "given")} ${hashPick(HEARTHKIN_FAMILY, seed, "family")}`;
  if (race === "goblin") return `${hashPick(GOBLIN_GIVEN, seed, "given")} ${hashPick(GOBLIN_CLAN, seed, "clan")}`;
  if (race === "atlantian") return `${hashPick(ATLANTIAN_GIVEN, seed, "given")} ${hashPick(ATLANTIAN_TIDES, seed, "tide")}`;
  return hashPick(WAYFARER_GIVEN, seed, "given");
}

export function isMayorProfession(profession: ResidentProfession) {
  return profession === "mayor" || profession === "atlantian-tidewarden";
}

export function isWarriorProfession(profession: ResidentProfession) {
  return profession === "warrior" || profession === "atlantian-trident-guard";
}

export function isAquaticProfession(profession: ResidentProfession) {
  return profession.startsWith("atlantian-");
}

function professionPlan(candidate: SettlementCandidate, count: number) {
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
  const common: ResidentProfession[] = ["mayor", "warrior", "farmer", "general", "warrior", "general"];
  const faction: ResidentProfession[] = candidate.factionId === "hobbits"
    ? ["brewer", "banker", "farmer", "alchemist", "blacksmith", "general"]
    : ["miner", "blacksmith", "alchemist", "warrior", "general", "miner"];
  return Array.from({ length: count }, (_, index) => index < common.length ? common[index] : faction[(index - common.length) % faction.length]);
}

function preferredBuilding(layout: SettlementLayoutPlan, profession: ResidentProfession) {
  const role: SettlementBuildingRole = profession === "atlantian-tidewarden" ? "tide-hall"
    : profession === "atlantian-trident-guard" ? "guard-grotto"
      : profession === "atlantian-kelpkeeper" ? "kelp-garden"
        : profession === "atlantian-coralwright" ? "coral-workshop"
          : profession === "atlantian-pearlbroker" ? "pearl-market"
            : profession === "atlantian-glowmender" ? "glow-clinic"
              : profession === "mayor" ? "mayor-hall"
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
  if (factionId === "atlantians") {
    if (profession === "atlantian-trident-guard") return { weapon: "tideglass-trident", tool: null };
    if (profession === "atlantian-coralwright") return { weapon: null, tool: "coral-chisel" };
    if (profession === "atlantian-kelpkeeper") return { weapon: null, tool: "kelp-sickle" };
    if (profession === "atlantian-glowmender") return { weapon: null, tool: "lumen-vial" };
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
      waterBreathing: raceBreathesWater(FACTIONS[candidate.factionId].race),
      name: generateResidentName(FACTIONS[candidate.factionId].race, `${candidate.worldSeed}|${id}`),
      profession,
      adult: true,
      alive: true,
      health: isWarriorProfession(profession) ? (candidate.factionId === "atlantians" ? 20 : 18) : candidate.factionId === "atlantians" ? 13 : 12,
      maxHealth: isWarriorProfession(profession) ? (candidate.factionId === "atlantians" ? 20 : 18) : candidate.factionId === "atlantians" ? 13 : 12,
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
  | "gather-current";

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
  if (settlement.residents.some((resident) => resident.alive && isMayorProfession(resident.profession))) return { state: settlement, applied: false, reason: "not-needed" };
  const candidates = settlement.residents.filter((resident) => resident.alive && resident.adult && resident.factionId === settlement.ownerFactionId);
  if (candidates.length === 0) return { state: settlement, applied: false, reason: "no-candidate" };
  const elected = [...candidates].sort((a, b) => hash32(`${settlement.id}|${day}|${a.id}`) - hash32(`${settlement.id}|${day}|${b.id}`))[0];
  const mayorProfession: ResidentProfession = settlementEnvironmentOf(settlement) === "underwater" || settlement.cultureRace === "atlantian"
    ? "atlantian-tidewarden"
    : "mayor";
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
  const profession: ResidentProfession = race === "atlantian" ? "atlantian-kelpkeeper" : "general";
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

export function sideQuestOffersFor(
  factionId: Exclude<FactionId, "player">,
  profession: ResidentProfession,
  settlementIdValue: string,
  worldDay: number,
  limit = 2,
) {
  const table = factionId === "hobbits"
    ? HOBBIT_SIDE_QUESTS
    : factionId === "goblins"
      ? GOBLIN_SIDE_QUESTS
      : ATLANTIAN_SIDE_QUESTS;
  return table
    .filter((quest) => quest.giverProfessions.includes(profession))
    .sort((a, b) => hash32(`${settlementIdValue}|${worldDay}|${a.id}`) - hash32(`${settlementIdValue}|${worldDay}|${b.id}`))
    .slice(0, Math.max(0, Math.min(4, Math.floor(limit))));
}

/** Useful integration bridge for merchant construction without importing UI. */
export function merchantProfessionForResident(profession: ResidentProfession): MerchantProfession {
  return profession;
}
