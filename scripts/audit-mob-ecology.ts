import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { CREATURE_SAMPLE_BY_ASSET, CREATURE_SOUND_EVENTS } from "../app/game/creature-sounds";
import { butterflyKindForBiome } from "../app/game/butterflies";
import { ITEMS } from "../app/game/data";
import {
  explicitPassiveMobSpawnTableForBiome,
  fishSpawnTableForHabitat,
  undergroundMobSpawnTableForBiome,
} from "../app/game/fauna";
import { BUTTERFLY_ORDER, CORE_MOB_ORDER, MOB_DEFS, MOB_ORDER, type CoreMobKind, type MobKind } from "../app/game/mobs";
import { UNDERGROUND_BIOME_NAMES, UndergroundBiomeId } from "../app/game/underground";
import { BIOME_NAMES, BiomeId } from "../app/game/world";

export type MobEcologyAuditRow = Readonly<{
  kind: MobKind;
  name: string;
  family: string;
  soundEventCount: number;
  customSoundAssetCount: number;
  soundAssets: readonly string[];
  dropEntryCount: number;
  distinctDropCount: number;
  maximumDropUnits: number;
  expectedDropUnits: number;
  drops: readonly Readonly<{ item: string; minimum: number; maximum: number; chance: number }>[];
  surfaceBiomeCount: number;
  aquaticBiomeCount: number;
  undergroundBiomeCount: number;
  spawnSources: readonly NaturalSpawnSourceKind[];
  biomeCount: number;
  biomes: readonly string[];
}>;

export type NaturalSpawnSourceKind = "surface" | "ambient" | "hostile" | "aquatic" | "underground";
type NaturalSpawnContext = Readonly<{ label: string; source: NaturalSpawnSourceKind }>;

const SURFACE_BIOMES = Object.values(BiomeId).filter((value): value is BiomeId => typeof value === "number");
const UNDERGROUND_BIOMES = Object.values(UndergroundBiomeId).filter((value): value is UndergroundBiomeId => typeof value === "number");

function addSpawnTable(
  destinations: Map<MobKind, Map<string, NaturalSpawnContext>>,
  label: string,
  source: NaturalSpawnSourceKind,
  table: readonly (readonly [MobKind, number])[],
) {
  for (const [kind] of table) {
    const contexts = destinations.get(kind) ?? new Map<string, NaturalSpawnContext>();
    contexts.set(`${source}:${label}`, { label, source });
    destinations.set(kind, contexts);
  }
}

export function naturalSpawnContexts() {
  const destinations = new Map<MobKind, Map<string, NaturalSpawnContext>>();
  const oceanBiomes = new Set([BiomeId.DeepOcean, BiomeId.Ocean, BiomeId.LumenTrench]);
  for (const biome of SURFACE_BIOMES) {
    const passiveTable = explicitPassiveMobSpawnTableForBiome(biome);
    if (passiveTable) addSpawnTable(destinations, BIOME_NAMES[biome], "surface", passiveTable);
    if (!oceanBiomes.has(biome)) {
      addSpawnTable(destinations, BIOME_NAMES[biome], "hostile", [["zombie", 0.38], ["shadecrawler", 0.25], ["rattlekin", 0.19], ["skeleton", 0.18]]);
      const possibleButterflies = new Set([0, 0.5, 0.7, 0.75, 0.85, 0.91, 0.99]
        .map((roll) => butterflyKindForBiome(biome, roll)).filter((kind): kind is typeof BUTTERFLY_ORDER[number] => kind !== null));
      addSpawnTable(destinations, BIOME_NAMES[biome], "ambient", [...possibleButterflies].map((kind) => [kind, 1] as const));
    }
  }
  addSpawnTable(destinations, BIOME_NAMES[BiomeId.Ocean], "aquatic", fishSpawnTableForHabitat("ocean"));
  addSpawnTable(destinations, BIOME_NAMES[BiomeId.DeepOcean], "aquatic", fishSpawnTableForHabitat("deep-ocean"));
  addSpawnTable(destinations, BIOME_NAMES[BiomeId.LumenTrench], "aquatic", fishSpawnTableForHabitat("lumen-trench"));
  addSpawnTable(destinations, BIOME_NAMES[BiomeId.River], "aquatic", fishSpawnTableForHabitat("river"));
  addSpawnTable(destinations, `${BIOME_NAMES[BiomeId.SugarplumVale]} syrup ponds`, "aquatic", fishSpawnTableForHabitat("syrup-pond"));
  for (const biome of UNDERGROUND_BIOMES) {
    const label = `Below: ${UNDERGROUND_BIOME_NAMES[biome]}`;
    addSpawnTable(destinations, label, "underground", undergroundMobSpawnTableForBiome(biome));
    addSpawnTable(destinations, label, "underground", fishSpawnTableForHabitat("underground"));
  }
  return destinations;
}

export function naturalBiomeAssignments() {
  return new Map([...naturalSpawnContexts()].map(([kind, contexts]) => [
    kind,
    new Set([...contexts.values()].map((context) => context.label)),
  ]));
}

export function buildMobEcologyAudit(): MobEcologyAuditRow[] {
  const assignments = naturalSpawnContexts();
  return MOB_ORDER.map((kind) => {
    const definition = MOB_DEFS[kind];
    const cues = CORE_MOB_ORDER.includes(kind as CoreMobKind) ? CREATURE_SOUND_EVENTS[kind as CoreMobKind] ?? {} : {};
    const soundAssets = [...new Set(Object.values(cues).flatMap((cue) => [cue.asset, ...(cue.variants ?? [])]))];
    const customSoundAssets = soundAssets.filter((asset) => asset in CREATURE_SAMPLE_BY_ASSET);
    const drops = definition.drops.map((drop) => ({
      item: ITEMS[drop.item]?.name ?? String(drop.item),
      minimum: drop.min,
      maximum: drop.max,
      chance: drop.chance,
    }));
    const contexts = [...(assignments.get(kind)?.values() ?? [])];
    const biomes = [...new Set(contexts.map((context) => context.label))].sort((left, right) => left.localeCompare(right));
    const spawnSources = [...new Set(contexts.map((context) => context.source))].sort();
    return {
      kind,
      name: definition.name,
      family: definition.family ?? "surface",
      soundEventCount: Object.keys(cues).length,
      customSoundAssetCount: customSoundAssets.length,
      soundAssets: customSoundAssets,
      dropEntryCount: drops.length,
      distinctDropCount: new Set(drops.map((drop) => drop.item)).size,
      maximumDropUnits: drops.reduce((sum, drop) => sum + drop.maximum, 0),
      expectedDropUnits: Math.round(drops.reduce((sum, drop) => sum + (drop.minimum + drop.maximum) / 2 * drop.chance, 0) * 100) / 100,
      drops,
      surfaceBiomeCount: new Set(contexts.filter((context) => context.source === "surface" || context.source === "ambient" || context.source === "hostile").map((context) => context.label)).size,
      aquaticBiomeCount: new Set(contexts.filter((context) => context.source === "aquatic").map((context) => context.label)).size,
      undergroundBiomeCount: new Set(contexts.filter((context) => context.source === "underground").map((context) => context.label)).size,
      spawnSources,
      biomeCount: biomes.length,
      biomes,
    };
  });
}

const cell = (value: unknown) => String(value).replaceAll("|", "\\|");

export function formatMobEcologyAudit(rows: readonly MobEcologyAuditRow[]) {
  const naturallyAssigned = rows.filter((row) => row.biomeCount > 0);
  const withCustomSound = naturallyAssigned.filter((row) => row.customSoundAssetCount > 0);
  const withDrops = naturallyAssigned.filter((row) => row.dropEntryCount > 0);
  return [
    "# Blockwild mob ecology audit",
    "",
    `Catalog: ${rows.length} creatures. Naturally assigned: ${naturallyAssigned.length}. With custom sound: ${withCustomSound.length}/${naturallyAssigned.length}. With drops: ${withDrops.length}/${naturallyAssigned.length}.`,
    "",
    "| Mob | ID | Family | Sound events | Custom assets | Drop entries | Max units | Expected units | Surface | Water | Below | Sources |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|",
    ...rows.map((row) => `| ${cell(row.name)} | ${cell(row.kind)} | ${cell(row.family)} | ${row.soundEventCount} | ${row.customSoundAssetCount} | ${row.dropEntryCount} | ${row.maximumDropUnits} | ${row.expectedDropUnits.toFixed(2)} | ${row.surfaceBiomeCount} | ${row.aquaticBiomeCount} | ${row.undergroundBiomeCount} | ${cell(row.spawnSources.join(", ") || "authored/non-natural")} |`),
    "",
    "## Detail",
    "",
    ...rows.flatMap((row) => [
      `### ${row.name} (${row.kind})`,
      "",
      `Sounds (${row.customSoundAssetCount} assets across ${row.soundEventCount} authored events): ${row.soundAssets.join(", ") || "none"}.`,
      `Drops (${row.dropEntryCount} entries): ${row.drops.map((drop) => `${drop.item} ${drop.minimum}-${drop.maximum} at ${Math.round(drop.chance * 100)}%`).join("; ") || "none"}.`,
      `Natural contexts (${row.biomeCount}; surface ${row.surfaceBiomeCount}, water ${row.aquaticBiomeCount}, below ${row.undergroundBiomeCount}): ${row.biomes.join(", ") || "none; authored, summoned, traded, or otherwise non-natural"}.`,
      `Spawn sources: ${row.spawnSources.join(", ") || "authored/non-natural"}.`,
      "",
    ]),
  ].join("\n");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const rows = buildMobEcologyAudit();
  const markdown = formatMobEcologyAudit(rows);
  if (process.argv.includes("--json")) process.stdout.write(`${JSON.stringify(rows, null, 2)}\n`);
  else process.stdout.write(`${markdown.split("\n").slice(0, 22).join("\n")}\n\nFull detail: output/mob-ecology-audit.md\n`);
  if (process.argv.includes("--write")) {
    const output = resolve("output");
    mkdirSync(output, { recursive: true });
    writeFileSync(resolve(output, "mob-ecology-audit.md"), `${markdown}\n`);
    writeFileSync(resolve(output, "mob-ecology-audit.json"), `${JSON.stringify(rows, null, 2)}\n`);
  }
}
