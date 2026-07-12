import { creatureHasCustomSound } from "../app/game/creature-sounds";
import { pathToFileURL } from "node:url";
import {
  fishSpawnTableForHabitat,
  passiveMobSpawnTableForBiome,
  type FishHabitat,
  type WeightedMob,
} from "../app/game/fauna";
import { CORE_MOB_ORDER, MOB_DEFS, MOB_ORDER, type CoreMobKind, type MobKind } from "../app/game/mobs";
import { nativeBiomesForPlant, PLANTS } from "../app/game/plants";
import { NPC_FACTION_IDS, FACTIONS } from "../app/game/factions";
import { structureKindsForBiomeId } from "../app/game/structures";
import { BIOME_NAMES, BiomeId, settlementBiomeFromId } from "../app/game/world";

type SpawnSource = Readonly<{ label: string; entries: readonly WeightedMob[] }>;
type SpeciesAudit = Readonly<{
  kind: MobKind;
  weight: number;
  sources: readonly string[];
  conditional: boolean;
  customSound: boolean;
}>;

type BiomeAudit = Readonly<{
  id: BiomeId;
  name: string;
  flora: number;
  fauna: number;
  common: number;
  conditional: number;
  rare: number;
  customSound: number;
  poiCount: number;
  poiKinds: readonly string[];
  sources: readonly string[];
  floorChecks: Readonly<{ common: boolean; conditional: boolean; rare: boolean }>;
  species: readonly SpeciesAudit[];
}>;

const BIOMES = (Object.values(BiomeId).filter((value): value is BiomeId => typeof value === "number"))
  .sort((left, right) => left - right);

const AQUATIC_HABITATS: Readonly<Partial<Record<BiomeId, FishHabitat>>> = Object.freeze({
  [BiomeId.DeepOcean]: "deep-ocean",
  [BiomeId.Ocean]: "ocean",
  [BiomeId.LumenTrench]: "lumen-trench",
  [BiomeId.River]: "river",
});

function spawnSourcesForBiome(biome: BiomeId): SpawnSource[] {
  const aquatic = AQUATIC_HABITATS[biome];
  if (biome === BiomeId.DeepOcean || biome === BiomeId.Ocean || biome === BiomeId.LumenTrench) {
    return aquatic ? [{ label: aquatic, entries: fishSpawnTableForHabitat(aquatic) }] : [];
  }
  const sources: SpawnSource[] = [{ label: "surface", entries: passiveMobSpawnTableForBiome(biome) }];
  if (aquatic) sources.push({ label: aquatic, entries: fishSpawnTableForHabitat(aquatic) });
  if (biome === BiomeId.SugarplumVale) sources.push({ label: "syrup-pond", entries: fishSpawnTableForHabitat("syrup-pond") });
  return sources;
}

function speciesForSources(sources: readonly SpawnSource[]): SpeciesAudit[] {
  const records = new Map<MobKind, { weight: number; sources: string[] }>();
  for (const source of sources) for (const [kind, weight] of source.entries) {
    const current = records.get(kind) ?? { weight: 0, sources: [] };
    current.weight = Math.max(current.weight, weight);
    if (!current.sources.includes(source.label)) current.sources.push(source.label);
    records.set(kind, current);
  }
  return [...records.entries()]
    .map(([kind, record]) => ({
      kind,
      weight: record.weight,
      sources: record.sources,
      conditional: !/^all hours(?:\b|$)/iu.test(MOB_DEFS[kind].active.trim()),
      customSound: CORE_MOB_ORDER.includes(kind as CoreMobKind) && creatureHasCustomSound(kind as CoreMobKind),
    }))
    .sort((left, right) => right.weight - left.weight || left.kind.localeCompare(right.kind));
}

export function buildBiomeEcologyAudit(): BiomeAudit[] {
  return BIOMES.map((id) => {
    const sources = spawnSourcesForBiome(id);
    const species = speciesForSources(sources);
    const common = species.filter((entry) => entry.weight >= 0.1).length;
    const conditional = species.filter((entry) => entry.conditional).length;
    const rare = species.filter((entry) => entry.weight <= 0.05).length;
    const settlementBiome = settlementBiomeFromId(id);
    const poiKinds = [
      ...structureKindsForBiomeId(id),
      ...(settlementBiome ? NPC_FACTION_IDS.filter((faction) => FACTIONS[faction].homeBiomes.includes(settlementBiome)).map((faction) => `${faction}-settlement`) : []),
      "subterranean-dragon-lair",
      ...([BiomeId.DeepOcean, BiomeId.LumenTrench].includes(id) ? ["sea-dragon-nest"] : []),
    ];
    return {
      id,
      name: BIOME_NAMES[id],
      flora: PLANTS.filter((plant) => nativeBiomesForPlant(plant.id).includes(id)).length,
      fauna: species.length,
      common,
      conditional,
      rare,
      customSound: species.filter((entry) => entry.customSound).length,
      poiCount: new Set(poiKinds).size,
      poiKinds: [...new Set(poiKinds)],
      sources: sources.map((source) => source.label),
      floorChecks: { common: common >= 2, conditional: conditional >= 2, rare: rare >= 1 },
      species,
    };
  });
}

function sharedSurfacePools() {
  const pools = new Map<string, string[]>();
  for (const biome of BIOMES.filter((id) => ![BiomeId.DeepOcean, BiomeId.Ocean, BiomeId.LumenTrench].includes(id))) {
    const signature = passiveMobSpawnTableForBiome(biome).map(([kind, weight]) => `${kind}:${weight}`).join("|");
    const names = pools.get(signature) ?? [];
    names.push(BIOME_NAMES[biome]);
    pools.set(signature, names);
  }
  return [...pools.values()].filter((names) => names.length > 1);
}

export function formatBiomeEcologyAudit(audit: readonly BiomeAudit[]) {
  const naturalKinds = [...new Set(audit.flatMap((biome) => biome.species.map((entry) => entry.kind)))];
  const silentNaturalKinds = naturalKinds.filter((kind) => !CORE_MOB_ORDER.includes(kind as CoreMobKind)
    || !creatureHasCustomSound(kind as CoreMobKind));
  const missingHints = MOB_ORDER.filter((kind) => !MOB_DEFS[kind].discoveryHint);
  const unassignedPlants = PLANTS.filter((plant) => nativeBiomesForPlant(plant.id).length === 0);
  const rows = audit.map((biome) => {
    const floors = [biome.floorChecks.common ? "C" : "c", biome.floorChecks.conditional ? "T" : "t", biome.floorChecks.rare ? "R" : "r"].join("");
    return [
      biome.name.padEnd(24),
      String(biome.flora).padStart(5),
      String(biome.poiCount).padStart(4),
      String(biome.fauna).padStart(5),
      String(biome.common).padStart(6),
      String(biome.conditional).padStart(11),
      String(biome.rare).padStart(4),
      `${biome.customSound}/${biome.fauna}`.padStart(8),
      floors.padStart(6),
      biome.sources.join(" + "),
    ].join(" | ");
  });
  return [
    "BLOCKWILD BIOME ECOLOGY AUDIT",
    "Fauna: active natural spawn pools. Flora: bestiary native-range metadata.",
    "Heuristics: common weight >= 0.10; rare weight <= 0.05; conditional = ACTIVE is not 'All hours'.",
    "Floors are minimum checks, not biodiversity caps. C/T/R uppercase means the floor is met.",
    "",
    "Biome                    | Flora | POIs | Fauna | Common | Conditional | Rare |  Sound | Floors | Active sources",
    "-------------------------|-------|------|-------|--------|-------------|------|--------|--------|----------------",
    ...rows,
    "",
    `Catalog: ${PLANTS.length} flora entries; ${MOB_ORDER.length} creature entries; ${naturalKinds.length} naturally spawned species.`,
    `Bestiary discovery hints: ${MOB_ORDER.length - missingHints.length}/${MOB_ORDER.length}.`,
    `Native flora assignments: ${PLANTS.length - unassignedPlants.length}/${PLANTS.length}.`,
    `Natural fauna with at least one resolved custom sound: ${naturalKinds.length - silentNaturalKinds.length}/${naturalKinds.length}.`,
    `Natural fauna without a resolved custom sound (${silentNaturalKinds.length}): ${silentNaturalKinds.map((kind) => MOB_DEFS[kind].name).join(", ") || "none"}.`,
    `Missing discovery hints (${missingHints.length}): ${missingHints.map((kind) => MOB_DEFS[kind].name).join(", ") || "none"}.`,
    `Unassigned flora (${unassignedPlants.length}): ${unassignedPlants.map((plant) => plant.name).join(", ") || "none"}.`,
    "",
    "Shared surface fauna pools:",
    ...sharedSurfacePools().map((names) => `- ${names.join(" = ")}`),
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const audit = buildBiomeEcologyAudit();
  if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
  else process.stdout.write(`${formatBiomeEcologyAudit(audit)}\n`);
}
