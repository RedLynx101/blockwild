import { BlockId } from "./data";

/**
 * Deterministic, renderer-independent structure plans.
 *
 * Every plan contains explicit world-space block edits plus semantic markers.
 * Existing BlockIds are used throughout; no new tile definition is required to
 * apply these plans. Markers are consumed separately by the chest/mob systems.
 */

export type WorldPosition = Readonly<{ x: number; y: number; z: number }>;

export type StructureKind = "desert-temple" | "forest-temple" | "sunbun-grove" | "meadow-butterfly-sanctuary";
export type StructureBiome = "desert" | "forest" | "meadow";

export type PlannedBlock = Readonly<{
  x: number;
  y: number;
  z: number;
  block: BlockId;
  /** Semantic variant for future atlas art; `block` is always a working fallback. */
  variant?: string;
}>;

export type PlannedLoot = Readonly<{
  itemKey: string;
  count: number;
  durability?: number;
}>;

export type ChestMarker = Readonly<{
  type: "chest";
  id: string;
  position: WorldPosition;
  lootTable: StructureLootTableId;
  loot: readonly PlannedLoot[];
}>;

export type SpawnMarker = Readonly<{
  type: "spawn";
  id: string;
  position: WorldPosition;
  mobKind: string;
  count: number;
  radius: number;
  persistent: boolean;
  tags?: readonly string[];
}>;

export type LandmarkMarker = Readonly<{
  type: "landmark";
  id: string;
  position: WorldPosition;
  tag: string;
}>;

export type StructureMarker = ChestMarker | SpawnMarker | LandmarkMarker;

export type StructurePlan = Readonly<{
  kind: StructureKind;
  id: string;
  origin: WorldPosition;
  bounds: Readonly<{ min: WorldPosition; max: WorldPosition }>;
  placements: readonly PlannedBlock[];
  markers: readonly StructureMarker[];
}>;

export const SUNWARD_COMPASS = Object.freeze({
  itemKey: "sunward-compass",
  name: "Sunward Compass",
  maxDurability: 4096,
  description: "A warm, nearly indestructible temple compass that pulses toward unopened containers and recorded landmarks within 36 blocks.",
  useDurabilityCost: 1,
  pulseRadius: 36,
});

type WeightedLootEntry = Readonly<{
  itemKey: string;
  weight: number;
  min: number;
  max: number;
  durability?: number;
}>;

type BonusLootEntry = Readonly<{
  itemKey: string;
  chance: number;
  min: number;
  max: number;
  durability?: number;
}>;

export type StructureLootTableId = "desert-temple" | "forest-temple" | "sunbun-cache" | "butterfly-cache";

const LOOT_TABLES: Readonly<Record<StructureLootTableId, Readonly<{
  entries: readonly WeightedLootEntry[];
  bonuses: readonly BonusLootEntry[];
}>>> = Object.freeze({
  "desert-temple": {
    entries: [
      { itemKey: "gold-ingot", weight: 18, min: 1, max: 4 },
      { itemKey: "sunmetal-ingot", weight: 22, min: 2, max: 6 },
      { itemKey: "crystal-shard", weight: 11, min: 1, max: 3 },
      { itemKey: "bone-shard", weight: 20, min: 2, max: 8 },
      { itemKey: "glow-dust", weight: 16, min: 2, max: 5 },
      { itemKey: "bread", weight: 13, min: 1, max: 3 },
    ],
    bonuses: [{ itemKey: SUNWARD_COMPASS.itemKey, chance: 0.035, min: 1, max: 1, durability: SUNWARD_COMPASS.maxDurability }],
  },
  "forest-temple": {
    entries: [
      { itemKey: "apple", weight: 20, min: 2, max: 6 },
      { itemKey: "fiber", weight: 18, min: 3, max: 9 },
      { itemKey: "glow-dust", weight: 16, min: 1, max: 4 },
      { itemKey: "crystal-shard", weight: 10, min: 1, max: 3 },
      { itemKey: "gold-ingot", weight: 11, min: 1, max: 3 },
      { itemKey: "wildwood-planks", weight: 25, min: 4, max: 12 },
    ],
    bonuses: [{ itemKey: SUNWARD_COMPASS.itemKey, chance: 0.035, min: 1, max: 1, durability: SUNWARD_COMPASS.maxDurability }],
  },
  "sunbun-cache": {
    entries: [
      { itemKey: "apple", weight: 31, min: 2, max: 5 },
      { itemKey: "wheat", weight: 29, min: 2, max: 7 },
      { itemKey: "fiber", weight: 24, min: 2, max: 6 },
      { itemKey: "gold-ingot", weight: 4, min: 1, max: 1 },
      { itemKey: "red-flower", weight: 12, min: 1, max: 3 },
    ],
    bonuses: [],
  },
  "butterfly-cache": {
    entries: [
      { itemKey: "red-flower", weight: 28, min: 2, max: 5 },
      { itemKey: "blue-flower", weight: 28, min: 2, max: 5 },
      { itemKey: "fiber", weight: 22, min: 2, max: 7 },
      { itemKey: "glow-dust", weight: 12, min: 1, max: 3 },
      { itemKey: "butterfly-net", weight: 10, min: 1, max: 1 },
    ],
    bonuses: [],
  },
});

function hashUnit(seed: string | number, salt: string | number) {
  const text = `${seed}:${salt}`;
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return (hash >>> 0) / 4294967296;
}

const randomInteger = (seed: string | number, salt: string, min: number, max: number) =>
  min + Math.floor(hashUnit(seed, salt) * (max - min + 1));

export function structureLootTable(id: StructureLootTableId) {
  return LOOT_TABLES[id];
}

export function rollStructureLoot(id: StructureLootTableId, seed: string | number, rolls = 4): PlannedLoot[] {
  const table = LOOT_TABLES[id];
  const totalWeight = table.entries.reduce((sum, entry) => sum + entry.weight, 0);
  const consolidated = new Map<string, PlannedLoot>();
  const add = (entry: Omit<PlannedLoot, "count">, count: number) => {
    const key = `${entry.itemKey}:${entry.durability ?? ""}`;
    const current = consolidated.get(key);
    consolidated.set(key, { ...entry, count: (current?.count ?? 0) + count });
  };

  for (let roll = 0; roll < Math.max(0, Math.min(12, Math.floor(rolls))); roll += 1) {
    let cursor = hashUnit(seed, `${id}:roll:${roll}`) * totalWeight;
    let selected = table.entries[table.entries.length - 1];
    for (const entry of table.entries) {
      cursor -= entry.weight;
      if (cursor <= 0) {
        selected = entry;
        break;
      }
    }
    add(selected, randomInteger(seed, `${id}:count:${roll}`, selected.min, selected.max));
  }

  table.bonuses.forEach((entry, index) => {
    if (hashUnit(seed, `${id}:bonus:${index}`) < entry.chance) {
      add(entry, randomInteger(seed, `${id}:bonus-count:${index}`, entry.min, entry.max));
    }
  });
  return [...consolidated.values()];
}

class PlanBuilder {
  private blocks = new Map<string, PlannedBlock>();
  readonly markers: StructureMarker[] = [];

  constructor(readonly origin: WorldPosition) {}

  set(dx: number, dy: number, dz: number, block: BlockId, variant?: string) {
    const placement: PlannedBlock = {
      x: this.origin.x + dx,
      y: this.origin.y + dy,
      z: this.origin.z + dz,
      block,
      ...(variant ? { variant } : {}),
    };
    this.blocks.set(`${placement.x},${placement.y},${placement.z}`, placement);
  }

  fill(minX: number, minY: number, minZ: number, maxX: number, maxY: number, maxZ: number, block: BlockId, variant?: string) {
    for (let y = minY; y <= maxY; y += 1) {
      for (let z = minZ; z <= maxZ; z += 1) {
        for (let x = minX; x <= maxX; x += 1) this.set(x, y, z, block, variant);
      }
    }
  }

  chest(dx: number, dy: number, dz: number, table: StructureLootTableId, seed: string | number, id: string) {
    this.set(dx, dy, dz, BlockId.Chest);
    this.markers.push({
      type: "chest",
      id,
      position: { x: this.origin.x + dx, y: this.origin.y + dy, z: this.origin.z + dz },
      lootTable: table,
      loot: rollStructureLoot(table, `${seed}:${id}`),
    });
  }

  spawn(dx: number, dy: number, dz: number, mobKind: string, count: number, radius: number, id: string, persistent = true, tags?: readonly string[]) {
    this.markers.push({
      type: "spawn",
      id,
      position: { x: this.origin.x + dx, y: this.origin.y + dy, z: this.origin.z + dz },
      mobKind,
      count,
      radius,
      persistent,
      ...(tags ? { tags } : {}),
    });
  }

  landmark(dx: number, dy: number, dz: number, tag: string, id: string) {
    this.markers.push({
      type: "landmark",
      id,
      position: { x: this.origin.x + dx, y: this.origin.y + dy, z: this.origin.z + dz },
      tag,
    });
  }

  placements() {
    return [...this.blocks.values()].sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);
  }
}

const boundsAround = (origin: WorldPosition, xRadius: number, height: number, zRadius: number) => ({
  min: { x: origin.x - xRadius, y: origin.y, z: origin.z - zRadius },
  max: { x: origin.x + xRadius, y: origin.y + height, z: origin.z + zRadius },
});

function planDesertTemple(origin: WorldPosition, seed: string | number): StructurePlan {
  const builder = new PlanBuilder(origin);
  builder.fill(-7, 0, -7, 7, 0, 7, BlockId.StoneBrick, "sun-baked-foundation");
  for (let layer = 0; layer < 6; layer += 1) {
    const extent = 6 - layer;
    builder.fill(-extent, layer + 1, -extent, extent, layer + 1, extent, layer % 2 ? BlockId.Sand : BlockId.StoneBrick, "desert-temple-course");
  }
  builder.fill(-3, 1, -3, 3, 4, 3, BlockId.Air);
  builder.fill(-1, 1, 3, 1, 3, 7, BlockId.Air);
  for (const [x, z] of [[-3, -3], [3, -3], [-3, 3], [3, 3]] as const) builder.fill(x, 1, z, x, 4, z, BlockId.StoneBrick, "etched-pillar");
  builder.set(0, 1, -3, BlockId.Glowstone, "sun-disk");
  builder.chest(0, 1, -1, "desert-temple", seed, "burial-vault");
  builder.spawn(0, 1, 1, "dune-warden", 1, 3, "vault-warden", true, ["temple-guardian", "hostile"]);
  builder.landmark(0, 2, 0, "desert-temple", "temple-heart");
  return {
    kind: "desert-temple",
    id: `desert-temple:${origin.x},${origin.z}`,
    origin,
    bounds: boundsAround(origin, 7, 7, 7),
    placements: builder.placements(),
    markers: builder.markers,
  };
}

function planForestTemple(origin: WorldPosition, seed: string | number): StructurePlan {
  const builder = new PlanBuilder(origin);
  builder.fill(-6, 0, -6, 6, 0, 6, BlockId.Cobblestone, "mossy-court");
  builder.fill(-4, 1, -4, 4, 1, 4, BlockId.Air);
  for (const [x, z] of [[-5, -5], [5, -5], [-5, 5], [5, 5]] as const) {
    builder.fill(x, 1, z, x, 6, z, BlockId.WildwoodLog, "root-pillar");
    builder.fill(x - 1, 6, z - 1, x + 1, 7, z + 1, BlockId.WildwoodLeaves, "temple-canopy");
  }
  builder.fill(-5, 6, -5, 5, 6, 5, BlockId.Planks, "canopy-beam");
  builder.fill(-4, 6, -4, 4, 6, 4, BlockId.Air);
  builder.fill(-2, 1, -3, 2, 2, -2, BlockId.StoneBrick, "root-altar");
  builder.set(0, 3, -2, BlockId.Glowstone, "verdant-sigil");
  builder.chest(0, 3, -3, "forest-temple", seed, "canopy-reliquary");
  builder.spawn(0, 1, 1, "rootbound-sentinel", 1, 4, "court-sentinel", true, ["temple-guardian", "hostile"]);
  builder.landmark(0, 2, 0, "forest-temple", "temple-heart");
  return {
    kind: "forest-temple",
    id: `forest-temple:${origin.x},${origin.z}`,
    origin,
    bounds: boundsAround(origin, 6, 8, 6),
    placements: builder.placements(),
    markers: builder.markers,
  };
}

function planSunbunGrove(origin: WorldPosition, seed: string | number): StructurePlan {
  const builder = new PlanBuilder(origin);
  for (let z = -7; z <= 7; z += 1) {
    for (let x = -7; x <= 7; x += 1) {
      const distance = Math.hypot(x, z);
      if (distance <= 7.2) builder.set(x, 0, z, BlockId.Grass, "sunbun-grove-grass");
      if (distance > 5.6 && distance < 7.2 && (x + z) % 2 === 0) builder.set(x, 1, z, BlockId.RedFlower, "golden-clover");
    }
  }
  builder.fill(-4, 1, 0, -4, 4, 0, BlockId.BloomLog, "banana-arch");
  builder.fill(4, 1, 0, 4, 4, 0, BlockId.BloomLog, "banana-arch");
  for (let x = -3; x <= 3; x += 1) builder.set(x, 5 + Math.round(Math.abs(x) * 0.22), 0, BlockId.BloomLeaves, "banana-arch-canopy");
  builder.chest(0, 1, 5, "sunbun-cache", seed, "caretaker-basket");
  const count = 3 + Math.floor(hashUnit(seed, "sunbun-count") * 3);
  builder.spawn(0, 1, 0, "bananabun", count, 6, "grove-family", true, ["grove-resident", "neutral", "breedable"]);
  builder.landmark(0, 1, 0, "sunbun-grove", "grove-heart");
  return {
    kind: "sunbun-grove",
    id: `sunbun-grove:${origin.x},${origin.z}`,
    origin,
    bounds: boundsAround(origin, 7, 7, 7),
    placements: builder.placements(),
    markers: builder.markers,
  };
}

function planButterflySanctuary(origin: WorldPosition, seed: string | number): StructurePlan {
  const builder = new PlanBuilder(origin);
  for (let z = -9; z <= 9; z += 1) {
    for (let x = -9; x <= 9; x += 1) {
      const distance = Math.hypot(x, z);
      if (distance <= 9.2) builder.set(x, 0, z, BlockId.Grass, "meadow-sanctuary-grass");
      if (distance > 5.2 && distance < 8.7 && (Math.abs(x * 3 + z * 5) % 3 !== 0)) {
        const red = hashUnit(seed, `sanctuary-flower:${x},${z}`) > 0.48;
        builder.set(x, 1, z, red ? BlockId.RedFlower : BlockId.BlueFlower, red ? "buttercup" : "violet-star");
      }
    }
  }
  for (const [x, z] of [[-5, 0], [5, 0], [0, -5], [0, 5]] as const) {
    builder.fill(x, 1, z, x, 3, z, BlockId.BirchLog, "sanctuary-post");
    builder.set(x, 4, z, BlockId.Glowstone, "butterfly-lantern");
  }
  builder.chest(0, 1, 0, "butterfly-cache", seed, "naturalist-cache");
  builder.spawn(0, 2, 0, "meadowwing", 8, 8, "meadowwing-cloud", true, ["sanctuary-resident", "ambient"]);
  builder.spawn(2, 2, -1, "azure-skippers", 5, 7, "skipper-cloud", true, ["sanctuary-resident", "ambient"]);
  builder.landmark(0, 1, 0, "meadow-butterfly-sanctuary", "sanctuary-heart");
  return {
    kind: "meadow-butterfly-sanctuary",
    id: `meadow-butterfly-sanctuary:${origin.x},${origin.z}`,
    origin,
    bounds: boundsAround(origin, 9, 5, 9),
    placements: builder.placements(),
    markers: builder.markers,
  };
}

export function planStructure(kind: StructureKind, origin: WorldPosition, seed: string | number): StructurePlan {
  const normalizedOrigin = { x: Math.round(origin.x), y: Math.round(origin.y), z: Math.round(origin.z) };
  if (kind === "desert-temple") return planDesertTemple(normalizedOrigin, seed);
  if (kind === "forest-temple") return planForestTemple(normalizedOrigin, seed);
  if (kind === "sunbun-grove") return planSunbunGrove(normalizedOrigin, seed);
  return planButterflySanctuary(normalizedOrigin, seed);
}

export const worldCoordinateToChunk = (coordinate: number, chunkSize = 16) =>
  Math.floor(coordinate / Math.max(1, Math.floor(chunkSize)));

export const STRUCTURE_CLEARANCE_MARGIN = 4;

/**
 * Named POIs reserve a small natural clearing beyond their authored bounds.
 * World generation removes only generated flora, logs and leaves in this
 * footprint before applying the plan, so terrain and player edits are safe.
 */
export function structureClearanceBounds(plan: Pick<StructurePlan, "bounds">, margin = STRUCTURE_CLEARANCE_MARGIN) {
  const padding = Math.max(0, Math.min(12, Math.floor(margin)));
  return {
    minX: plan.bounds.min.x - padding,
    maxX: plan.bounds.max.x + padding,
    minZ: plan.bounds.min.z - padding,
    maxZ: plan.bounds.max.z + padding,
  } as const;
}

export function isInsideStructureClearance(
  plan: Pick<StructurePlan, "bounds">,
  x: number,
  z: number,
  margin = STRUCTURE_CLEARANCE_MARGIN,
) {
  const bounds = structureClearanceBounds(plan, margin);
  return x >= bounds.minX && x <= bounds.maxX && z >= bounds.minZ && z <= bounds.maxZ;
}

/** Filters an already-planned POI for safe cross-chunk application. */
export function structurePlacementsForChunk(plan: StructurePlan, chunkX: number, chunkZ: number, chunkSize = 16) {
  return plan.placements.filter((placement) =>
    worldCoordinateToChunk(placement.x, chunkSize) === chunkX
    && worldCoordinateToChunk(placement.z, chunkSize) === chunkZ);
}

export function structureMarkersForChunk(plan: StructurePlan, chunkX: number, chunkZ: number, chunkSize = 16) {
  return plan.markers.filter((marker) =>
    worldCoordinateToChunk(marker.position.x, chunkSize) === chunkX
    && worldCoordinateToChunk(marker.position.z, chunkSize) === chunkZ);
}

export function chunksTouchedByStructure(plan: StructurePlan, chunkSize = 16) {
  const chunks = new Set<string>();
  for (const placement of plan.placements) {
    chunks.add(`${worldCoordinateToChunk(placement.x, chunkSize)},${worldCoordinateToChunk(placement.z, chunkSize)}`);
  }
  for (const marker of plan.markers) {
    chunks.add(`${worldCoordinateToChunk(marker.position.x, chunkSize)},${worldCoordinateToChunk(marker.position.z, chunkSize)}`);
  }
  return [...chunks].map((key) => {
    const [chunkX, chunkZ] = key.split(",").map(Number);
    return { chunkX, chunkZ };
  }).sort((a, b) => a.chunkZ - b.chunkZ || a.chunkX - b.chunkX);
}

export function structureBiomeFromId(biomeId: number): StructureBiome | undefined {
  if (biomeId === 6 || biomeId === 10) return "desert";
  if (biomeId === 4 || biomeId === 5 || biomeId === 11 || biomeId === 12) return "forest";
  if (biomeId === 3) return "meadow";
  return undefined;
}

const floorDiv = (value: number, divisor: number) => Math.floor(value / divisor);

/** One deterministic candidate per 12x12-chunk region; average density 1/144 chunks. */
export function structureCandidateForChunk(input: Readonly<{
  seed: string | number;
  chunkX: number;
  chunkZ: number;
  biome: StructureBiome;
}>): StructureKind | undefined {
  const regionSize = 12;
  const regionX = floorDiv(input.chunkX, regionSize);
  const regionZ = floorDiv(input.chunkZ, regionSize);
  const localX = Math.floor(hashUnit(input.seed, `structure-region:${regionX},${regionZ}:x`) * regionSize);
  const localZ = Math.floor(hashUnit(input.seed, `structure-region:${regionX},${regionZ}:z`) * regionSize);
  const candidateX = regionX * regionSize + localX;
  const candidateZ = regionZ * regionSize + localZ;
  if (candidateX !== input.chunkX || candidateZ !== input.chunkZ) return undefined;
  if (input.biome === "desert") return "desert-temple";
  if (input.biome === "forest") return "forest-temple";
  return hashUnit(input.seed, `meadow-poi:${regionX},${regionZ}`) < 0.42 ? "sunbun-grove" : "meadow-butterfly-sanctuary";
}

export type VegetationVariant =
  | "saguaro"
  | "barrel-cactus"
  | "dry-shrub"
  | "sunspike-rock"
  | "meadow-grass"
  | "buttercup"
  | "violet-star"
  | "ember-bloom"
  | "butterfly-host";

export type VegetationFeature = Readonly<{
  variant: VegetationVariant;
  position: WorldPosition;
  placements: readonly PlannedBlock[];
}>;

export type VegetationPlan = Readonly<{
  biome: "desert" | "meadow";
  chunkX: number;
  chunkZ: number;
  placements: readonly PlannedBlock[];
  features: readonly VegetationFeature[];
}>;

/** O(16x16) per chunk with a hard cap of 64 emitted features. */
export function planBiomeVegetation(input: Readonly<{
  seed: string | number;
  biome: "desert" | "meadow";
  chunkX: number;
  chunkZ: number;
  surfaceYAt: (worldX: number, worldZ: number) => number;
}>): VegetationPlan {
  const features: VegetationFeature[] = [];
  const allPlacements: PlannedBlock[] = [];
  const startX = input.chunkX * 16;
  const startZ = input.chunkZ * 16;
  for (let localZ = 0; localZ < 16 && features.length < 64; localZ += 1) {
    for (let localX = 0; localX < 16 && features.length < 64; localX += 1) {
      const x = startX + localX;
      const z = startZ + localZ;
      const roll = hashUnit(input.seed, `vegetation:${input.biome}:${x},${z}`);
      const y = Math.round(input.surfaceYAt(x, z)) + 1;
      const placements: PlannedBlock[] = [];
      let variant: VegetationVariant | undefined;

      if (input.biome === "desert") {
        if (roll > 0.987) {
          variant = "saguaro";
          const height = 2 + Math.floor(hashUnit(input.seed, `saguaro-height:${x},${z}`) * 3);
          for (let dy = 0; dy < height; dy += 1) placements.push({ x, y: y + dy, z, block: BlockId.Cactus, variant });
          if (height >= 3 && localX > 0 && localX < 15) {
            const direction = hashUnit(input.seed, `saguaro-arm:${x},${z}`) < 0.5 ? -1 : 1;
            placements.push({ x: x + direction, y: y + height - 2, z, block: BlockId.Cactus, variant });
          }
        } else if (roll > 0.97) {
          variant = "barrel-cactus";
          placements.push({ x, y, z, block: BlockId.Cactus, variant });
        } else if (roll > 0.952) {
          variant = "dry-shrub";
          placements.push({ x, y, z, block: BlockId.TallGrass, variant });
        } else if (roll > 0.944) {
          variant = "sunspike-rock";
          placements.push({ x, y, z, block: BlockId.Stone, variant });
          if (hashUnit(input.seed, `sunspike:${x},${z}`) > 0.55) placements.push({ x, y: y + 1, z, block: BlockId.Stone, variant });
        }
      } else if (roll > 0.73) {
        if (roll > 0.96) variant = "butterfly-host";
        else if (roll > 0.91) variant = "buttercup";
        else if (roll > 0.86) variant = "violet-star";
        else if (roll > 0.82) variant = "ember-bloom";
        else variant = "meadow-grass";
        const block = variant === "meadow-grass" ? BlockId.TallGrass
          : variant === "violet-star" ? BlockId.BlueFlower : BlockId.RedFlower;
        placements.push({ x, y, z, block, variant });
      }

      if (!variant || placements.length === 0) continue;
      const feature = { variant, position: { x, y, z }, placements };
      features.push(feature);
      allPlacements.push(...placements);
    }
  }
  return {
    biome: input.biome,
    chunkX: input.chunkX,
    chunkZ: input.chunkZ,
    placements: allPlacements,
    features,
  };
}
