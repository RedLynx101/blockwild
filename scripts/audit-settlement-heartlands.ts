import { mkdir, writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import { FACTIONS, NPC_FACTION_IDS } from "../app/game/factions.ts";
import {
  SettlementIndex,
  normalizeSettlementPlacementOptions,
  type SettlementPlacementOptions,
  type SettlementTerrainSampler,
} from "../app/game/settlement-index.ts";
import { ChunkWorld, settlementBiomeFromId } from "../app/game/world.ts";
import type { SettlementCandidate } from "../app/game/settlements.ts";

const seed = process.argv[2] || "HEARTHLANDS-RELEASE-AUDIT";
const radius = 16;
const world = new ChunkWorld();
world.reset(seed);
const sample: SettlementTerrainSampler = (x, z) => {
  const column = world.sampleColumn(x, z);
  return { height: column.height, waterline: column.waterline, biome: settlementBiomeFromId(column.biome) };
};
const common = {
  structures: true,
  enabledFactions: NPC_FACTION_IDS,
  settlementDensity: 1,
  settlementClustering: "regional",
  roadCoverage: "regional",
  largeTownFrequency: "balanced",
} as const;
const profiles: readonly [string, SettlementPlacementOptions][] = [
  ["Legacy scattered", normalizeSettlementPlacementOptions({ ...common, settlementPattern: "legacy-scattered-v1" })],
  ["Hearthlands & Frontiers", normalizeSettlementPlacementOptions({ ...common, settlementPattern: "heartlands-v2" })],
];

function collect(index: SettlementIndex, options: SettlementPlacementOptions) {
  const settlements: SettlementCandidate[] = [];
  const start = performance.now();
  for (let regionZ = -radius; regionZ <= radius; regionZ += 1) for (let regionX = -radius; regionX <= radius; regionX += 1) {
    const candidate = index.candidateForRegion(seed, options, regionX, regionZ, sample);
    if (candidate) settlements.push(candidate);
  }
  const scanMs = performance.now() - start;
  const roads = options.settlementPattern === "heartlands-v2"
    ? Array.from({ length: 25 }, (_, value) => index.roadConnectionsForProvince(seed, options, value % 5 - 2, Math.floor(value / 5) - 2, sample)).flat()
    : [];
  const distances = settlements.map((candidate) => Math.min(...settlements
    .filter((other) => other.id !== candidate.id)
    .map((other) => Math.hypot(candidate.center.x - other.center.x, candidate.center.z - other.center.z))));
  const finite = distances.filter(Number.isFinite).sort((a, b) => a - b);
  const percentile = (p: number) => finite.length ? finite[Math.min(finite.length - 1, Math.floor((finite.length - 1) * p))] : 0;
  return {
    settlements,
    roads: [...new Map(roads.map((road) => [road.id, road])).values()],
    stats: {
      scanMs: Number(scanMs.toFixed(2)),
      settlementCount: settlements.length,
      settlementsPerMillionBlocks: Number((settlements.length / (((radius * 2 + 1) * 512) ** 2 / 1_000_000)).toFixed(3)),
      sizes: Object.fromEntries(["hamlet", "village", "town"].map((size) => [size, settlements.filter((entry) => entry.size === size).length])),
      cultures: Object.fromEntries(NPC_FACTION_IDS.map((factionId) => [factionId, settlements.filter((entry) => entry.factionId === factionId).length])),
      nearestNeighborBlocks: { p25: Math.round(percentile(0.25)), median: Math.round(percentile(0.5)), p75: Math.round(percentile(0.75)) },
      roadTiers: Object.fromEntries(["local", "regional", "trunk"].map((tier) => [tier, roads.filter((road) => road.tier === tier).length])),
      cacheEntries: index.cacheSize,
    },
  };
}

const reports = profiles.map(([label, options]) => {
  const index = new SettlementIndex();
  return { label, options, ...collect(index, options) };
});

const colors: Record<string, string> = {
  hobbits: "#e5bd65", goblins: "#9dbb62", atlantians: "#59bad0", sugarcourt: "#e98fbd", "wood-elves": "#71c998", dwarves: "#c99661",
};
const width = 1600;
const height = 900;
const mapSize = 650;
const min = -radius * 512;
const span = radius * 2 * 512;
const point = (value: number, offset: number) => offset + ((value - min) / span) * mapSize;
const lines = reports.map((report, panelIndex) => {
  const ox = 70 + panelIndex * 790;
  const oy = 145;
  const roads = report.roads.map((road) => `<path d="M ${point(road.from.center.x, ox).toFixed(1)} ${point(road.from.center.z, oy).toFixed(1)} L ${point(road.to.center.x, ox).toFixed(1)} ${point(road.to.center.z, oy).toFixed(1)}" class="road ${road.tier}"/>`).join("");
  const dots = report.settlements.map((settlement) => `<circle cx="${point(settlement.center.x, ox).toFixed(1)}" cy="${point(settlement.center.z, oy).toFixed(1)}" r="${settlement.size === "town" ? 7 : settlement.size === "village" ? 5 : 3.6}" fill="${colors[settlement.factionId]}" stroke="#111813" stroke-width="1.3"><title>${FACTIONS[settlement.factionId].name} ${settlement.size}</title></circle>`).join("");
  const stats = report.stats;
  const label = report.label.replaceAll("&", "&amp;");
  return `<g><text x="${ox}" y="62" class="title">${label}</text><text x="${ox}" y="92" class="subtitle">${stats.settlementCount} communities · ${stats.nearestNeighborBlocks.median} block median spacing · ${stats.scanMs} ms scan</text><rect x="${ox}" y="${oy}" width="${mapSize}" height="${mapSize}" rx="18" class="map"/><g clip-path="url(#clip${panelIndex})">${roads}${dots}</g><text x="${ox}" y="835" class="stat">Hamlets ${stats.sizes.hamlet}  ·  Villages ${stats.sizes.village}  ·  Towns ${stats.sizes.town}</text><text x="${ox}" y="864" class="stat">Roads: ${stats.roadTiers.local} local  ·  ${stats.roadTiers.regional} regional  ·  ${stats.roadTiers.trunk} trunk</text></g>`;
}).join("");
const legend = NPC_FACTION_IDS.map((factionId, index) => `<circle cx="${450 + index * 120}" cy="116" r="5" fill="${colors[factionId]}"/><text x="${462 + index * 120}" y="121" class="legend">${FACTIONS[factionId].name.replace(/ (Freeholds|Clans|Concord|Court|Enclave|Union)$/u, "")}</text>`).join("");
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><defs><clipPath id="clip0"><rect x="70" y="145" width="650" height="650" rx="18"/></clipPath><clipPath id="clip1"><rect x="860" y="145" width="650" height="650" rx="18"/></clipPath></defs><style>.map{fill:#142019;stroke:#557260;stroke-width:2}.title{font:700 32px Georgia,serif;fill:#f4e6bd}.subtitle,.stat{font:16px ui-monospace,monospace;fill:#b8cdbd}.legend{font:13px ui-monospace,monospace;fill:#aebfac}.road{fill:none;stroke-linecap:round;opacity:.7}.local{stroke:#8b7a55;stroke-width:1.3}.regional{stroke:#c6a568;stroke-width:2}.trunk{stroke:#f0cf82;stroke-width:3.2}</style><rect width="100%" height="100%" fill="#0c130f"/>${legend}${lines}</svg>`;

const outDir = resolve("work", "settlement-heartlands-audit");
await mkdir(outDir, { recursive: true });
await writeFile(resolve(outDir, "settlement-distribution-comparison.svg"), svg, "utf8");
await writeFile(resolve(outDir, "report.json"), `${JSON.stringify({ seed, radius, generatedAt: new Date().toISOString(), reports: reports.map(({ label, options, stats }) => ({ label, options, stats })) }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outDir, seed, reports: reports.map(({ label, stats }) => ({ label, ...stats })) }, null, 2));
