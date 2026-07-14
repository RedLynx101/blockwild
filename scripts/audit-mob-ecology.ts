import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { CREATURE_SAMPLE_BY_ASSET, CREATURE_SOUND_EVENTS } from "../app/game/creature-sounds";
import { butterflyKindForBiome } from "../app/game/butterflies";
import { ITEMS } from "../app/game/data";
import {
  fishSpawnTableForHabitat,
  passiveMobSpawnTableForBiome,
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
  biomeCount: number;
  biomes: readonly string[];
}>;

const SURFACE_BIOMES = Object.values(BiomeId).filter((value): value is BiomeId => typeof value === "number");
const UNDERGROUND_BIOMES = Object.values(UndergroundBiomeId).filter((value): value is UndergroundBiomeId => typeof value === "number");

function addSpawnTable(
  destinations: Map<MobKind, Set<string>>,
  label: string,
  table: readonly (readonly [MobKind, number])[],
) {
  for (const [kind] of table) {
    const labels = destinations.get(kind) ?? new Set<string>();
    labels.add(label);
    destinations.set(kind, labels);
  }
}

export function naturalBiomeAssignments() {
  const destinations = new Map<MobKind, Set<string>>();
  const waterBiomes = new Set([BiomeId.DeepOcean, BiomeId.Ocean, BiomeId.River, BiomeId.LumenTrench]);
  for (const biome of SURFACE_BIOMES) {
    addSpawnTable(destinations, BIOME_NAMES[biome], passiveMobSpawnTableForBiome(biome));
    if (!waterBiomes.has(biome)) {
      addSpawnTable(destinations, BIOME_NAMES[biome], [["zombie", 0.38], ["shadecrawler", 0.25], ["rattlekin", 0.19], ["skeleton", 0.18]]);
      const possibleButterflies = new Set([0, 0.5, 0.7, 0.75, 0.85, 0.91, 0.99]
        .map((roll) => butterflyKindForBiome(biome, roll)).filter((kind): kind is typeof BUTTERFLY_ORDER[number] => kind !== null));
      addSpawnTable(destinations, BIOME_NAMES[biome], [...possibleButterflies].map((kind) => [kind, 1] as const));
    }
  }
  addSpawnTable(destinations, BIOME_NAMES[BiomeId.Ocean], fishSpawnTableForHabitat("ocean"));
  addSpawnTable(destinations, BIOME_NAMES[BiomeId.DeepOcean], fishSpawnTableForHabitat("deep-ocean"));
  addSpawnTable(destinations, BIOME_NAMES[BiomeId.LumenTrench], fishSpawnTableForHabitat("lumen-trench"));
  addSpawnTable(destinations, BIOME_NAMES[BiomeId.River], fishSpawnTableForHabitat("river"));
  addSpawnTable(destinations, `${BIOME_NAMES[BiomeId.SugarplumVale]} syrup ponds`, fishSpawnTableForHabitat("syrup-pond"));
  for (const biome of UNDERGROUND_BIOMES) {
    const label = `Below: ${UNDERGROUND_BIOME_NAMES[biome]}`;
    addSpawnTable(destinations, label, undergroundMobSpawnTableForBiome(biome));
    addSpawnTable(destinations, label, fishSpawnTableForHabitat("underground"));
  }
  return destinations;
}

export function buildMobEcologyAudit(): MobEcologyAuditRow[] {
  const assignments = naturalBiomeAssignments();
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
    const biomes = [...(assignments.get(kind) ?? [])].sort((left, right) => left.localeCompare(right));
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
    "| Mob | ID | Family | Sound events | Custom assets | Drop entries | Max units | Expected units | Biomes |",
    "|---|---|---:|---:|---:|---:|---:|---:|---:|",
    ...rows.map((row) => `| ${cell(row.name)} | ${cell(row.kind)} | ${cell(row.family)} | ${row.soundEventCount} | ${row.customSoundAssetCount} | ${row.dropEntryCount} | ${row.maximumDropUnits} | ${row.expectedDropUnits.toFixed(2)} | ${row.biomeCount} |`),
    "",
    "## Detail",
    "",
    ...rows.flatMap((row) => [
      `### ${row.name} (${row.kind})`,
      "",
      `Sounds (${row.customSoundAssetCount} assets across ${row.soundEventCount} authored events): ${row.soundAssets.join(", ") || "none"}.`,
      `Drops (${row.dropEntryCount} entries): ${row.drops.map((drop) => `${drop.item} ${drop.minimum}-${drop.maximum} at ${Math.round(drop.chance * 100)}%`).join("; ") || "none"}.`,
      `Natural biome contexts (${row.biomeCount}): ${row.biomes.join(", ") || "none; authored, summoned, traded, or otherwise non-natural"}.`,
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
