import assert from "node:assert/strict";
import test from "node:test";

import { creatureHasCustomSound } from "../app/game/creature-sounds";
import { PLANTS, nativeBiomesForPlant } from "../app/game/plants";
import { BIOME_NAMES, BiomeId, ChunkWorld } from "../app/game/world";
import { buildBiomeEcologyAudit, formatBiomeEcologyAudit } from "../scripts/audit-biome-ecology";

test("ecology audit covers every biome and every plant range", () => {
  const audit = buildBiomeEcologyAudit();
  assert.equal(audit.length, 24);
  assert.equal(new Set(audit.map((entry) => entry.id)).size, 24);
  assert.deepEqual(PLANTS.filter((plant) => nativeBiomesForPlant(plant.id).length === 0), []);
  assert.ok(audit.find((entry) => entry.id === BiomeId.River)?.sources.includes("river"));
  assert.ok(audit.find((entry) => entry.id === BiomeId.SugarplumVale)?.sources.includes("syrup-pond"));
  assert.ok(audit.every((entry) => entry.poiCount >= 1));
  assert.ok((audit.find((entry) => entry.id === BiomeId.Meadow)?.poiCount ?? 0) > (audit.find((entry) => entry.id === BiomeId.Volcanic)?.poiCount ?? 0));
});

test("ecology audit distinguishes resolved custom audio from fallback cues", () => {
  assert.equal(creatureHasCustomSound("wild-horse"), true);
  assert.equal(creatureHasCustomSound("woolhorn"), true);
  assert.equal(creatureHasCustomSound("lightning-bug"), false);
  const report = formatBiomeEcologyAudit(buildBiomeEcologyAudit());
  assert.match(report, /Sound \| Floors/u);
  assert.match(report, /Natural fauna with at least one resolved custom sound/u);
});

test("default world generation exposes every registered biome", () => {
  const world = new ChunkWorld();
  world.reset("WILDERNESS");
  const found = new Set<BiomeId>();
  for (let z = -8192; z <= 8192; z += 64) for (let x = -8192; x <= 8192; x += 64) found.add(world.sampleColumn(x, z).biome);
  const missing = (Object.values(BiomeId).filter((value): value is BiomeId => typeof value === "number"))
    .filter((biome) => !found.has(biome));
  assert.deepEqual(missing.map((biome) => BIOME_NAMES[biome]), []);
});
