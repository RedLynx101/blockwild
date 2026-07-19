import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  BESTIARY_FACET_KEYS,
  bestiaryFacetOptionCounts,
  bestiaryFacetRecordForKind,
  createEmptyBestiaryFacetSelections,
  filterBestiaryFacetRecords,
  sortBestiaryFacetRecords,
  toggleBestiaryFacetValue,
  type BestiaryFacetKey,
  type BestiaryFacetRecord,
} from "../app/game/VoxelGame.tsx";
import { normalizeLivingBestiaryEntry } from "../app/game/living-bestiary.ts";

const makeRecord = (
  id: string,
  facets: Partial<Record<BestiaryFacetKey, readonly string[]>>,
  creatureLevel = 0,
  lastObservedAt: number | null = null,
): BestiaryFacetRecord => ({
  id,
  name: id,
  catalogIndex: 0,
  lastObservedAt,
  researchCompletion: 0,
  creatureLevel,
  rarityRank: 1,
  facets: Object.fromEntries(BESTIARY_FACET_KEYS.map((facet) => [facet, facets[facet] ?? []])) as Record<BestiaryFacetKey, readonly string[]>,
});

const RECORDS = [
  makeRecord("meadow", { habitat: ["surface"], type: ["wild"], movement: ["ground"] }, 7, 100),
  makeRecord("shore", { habitat: ["surface", "aquatic"], type: ["tide"], movement: ["amphibious"] }, 18, 300),
  makeRecord("trench", { habitat: ["aquatic"], type: ["tide"], movement: ["aquatic"] }, 4, 200),
  makeRecord("cave", { habitat: ["underground"], type: ["wild"], movement: ["climb"] }, 31, null),
] as const;

test("facet filtering is OR within a facet and AND between independent facets", () => {
  let selections = createEmptyBestiaryFacetSelections();
  selections = toggleBestiaryFacetValue(selections, "habitat", "surface");
  selections = toggleBestiaryFacetValue(selections, "habitat", "aquatic");
  selections = toggleBestiaryFacetValue(selections, "type", "tide");

  assert.deepEqual(filterBestiaryFacetRecords(RECORDS, selections).map((entry) => entry.id), ["shore", "trench"]);

  selections = toggleBestiaryFacetValue(selections, "habitat", "surface");
  assert.deepEqual(selections.habitat, ["aquatic"], "removing one habitat must preserve the other facet and type selection");
  assert.deepEqual(selections.type, ["tide"]);
  assert.deepEqual(filterBestiaryFacetRecords(RECORDS, selections).map((entry) => entry.id), ["shore", "trench"]);
});

test("facet counts ignore their own selections but honor every other active facet", () => {
  let selections = createEmptyBestiaryFacetSelections();
  selections = toggleBestiaryFacetValue(selections, "habitat", "surface");
  selections = toggleBestiaryFacetValue(selections, "type", "tide");
  const counts = bestiaryFacetOptionCounts(RECORDS, selections, "habitat", ["surface", "aquatic", "underground"]);

  assert.deepEqual(counts, { surface: 1, aquatic: 2, underground: 0 });
  assert.equal(filterBestiaryFacetRecords(RECORDS, selections).map((entry) => entry.id).join(","), "shore");
});

test("creature-level and observed sorting use runtime values without mutating catalog order", () => {
  assert.deepEqual(sortBestiaryFacetRecords(RECORDS, "level").map((entry) => entry.id), ["cave", "shore", "meadow", "trench"]);
  assert.deepEqual(sortBestiaryFacetRecords(RECORDS, "observed").map((entry) => entry.id), ["shore", "trench", "meadow", "cave"]);
  assert.deepEqual(RECORDS.map((entry) => entry.id), ["meadow", "shore", "trench", "cave"]);
});

test("live species records expose captured, form, type, movement, and guild facets", () => {
  const progress = normalizeLivingBestiaryEntry({
    seen: true,
    captures: 1,
    specimenIds: ["petalfox:specimen-17"],
    forms: { "shiny:2:1": { id: "shiny:2:1", category: "shiny", firstRecordedAt: 500, sightings: 1 } },
    guildLinks: ["waykeeper:field-release"],
  });
  const record = bestiaryFacetRecordForKind("petalfox", progress);

  assert.ok(record.facets.type.includes("verdant"));
  assert.ok(record.facets.relationship.includes("captured"));
  assert.ok(record.facets.relationship.includes("capturable"));
  assert.ok(record.facets.rarity.includes("shiny"));
  assert.ok(record.facets.movement.includes("ground"));
  assert.ok(record.facets.guild.includes("waykeeper"));
});

test("Bestiary UI keeps facets, authored field depth, zoom safeguards, and explicit summon state", async () => {
  const [source, css] = await Promise.all([
    readFile("app/game/VoxelGame.tsx", "utf8"),
    readFile("app/globals.css", "utf8"),
  ]);
  for (const marker of [
    "data-bestiary-filter-option",
    "aria-modal=\"true\"",
    "Creature level",
    "SPECIMEN LEDGER",
    "VARIANTS & PROVENANCE",
    "Summon origins",
    "Guild links",
    "Append-only field sections",
    "FIELD-VERIFIED CARE CLUES",
    "CAPTURE RESEARCH",
    "Prime field route",
    "bestiary-caught-marker",
    "has not been caught",
    "activePrimeCompletedRouteVerbs",
    "WORLDPIN WINDOW CLOSED",
    "ECHO FORM",
  ]) assert.ok(source.includes(marker), marker);
  for (const marker of [
    ".bestiary-toolbar.bestiary-facet-toolbar",
    "@media (max-width: 360px)",
    "height: 100dvh",
    ":focus-visible",
    "overflow: hidden",
    ".bestiary-prime-route",
    ".bestiary-caught-marker.caught",
    "@media (prefers-reduced-motion: reduce)",
  ]) assert.ok(css.includes(marker), marker);
});
