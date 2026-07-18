import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Living Bestiary uses search, three quick chips, a filter dialog, sort, and record tabs", async () => {
  const source = await readFile("app/game/VoxelGame.tsx", "utf8");
  for (const marker of [
    "Search creatures, habitats, types, moves",
    "aria-label=\"Bestiary view\"",
    "aria-haspopup=\"dialog\"",
    "Creature filters",
    "Recently observed",
    "Overview",
    "Ecology",
    "Combat",
    "Care",
    "Research",
    "Specimens",
  ]) assert.ok(source.includes(marker), marker);
  assert.match(source, /\[\['all', 'All'\], \['discovered', 'Discovered'\], \['captured', 'Captured'\]\]/u);
});

test("Bestiary filter sheet and records have narrow, zoom, and reduced-motion safeguards", async () => {
  const css = await readFile("app/globals.css", "utf8");
  assert.match(css, /@media \(max-width: 360px\)[\s\S]*?\.bestiary-filter-panel fieldset > div \{ grid-template-columns: 1fr;/u);
  assert.match(css, /\.bestiary-filter-scrim \{ position: fixed;/u);
  assert.match(css, /\.bestiary-page-tabs \{[\s\S]*?overflow-x: auto;/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.bestiary-filter-scrim/u);
  assert.equal(css.includes(".bestiary-facet-toolbar {\n  overflow-x: auto"), false);
});
