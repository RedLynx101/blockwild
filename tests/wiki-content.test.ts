import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";
import { ITEMS } from "../app/game/data.ts";
import { MOB_ORDER } from "../app/game/mobs.ts";
import { PLANTS } from "../app/game/plants.ts";
import { BIOME_NAMES } from "../app/game/world.ts";
import { WIKI_CATEGORY_ORDER, WIKI_ENTRIES, WIKI_ENTRY_BY_KEY, buildWikiEntries, wikiIndex } from "../app/game/wiki-content.ts";

test("the shared wiki deterministically covers live world registries", () => {
  assert.deepEqual(buildWikiEntries(), WIKI_ENTRIES);
  assert.equal(new Set(WIKI_ENTRIES.map((entry) => entry.key)).size, WIKI_ENTRIES.length);
  assert.equal(WIKI_ENTRIES.filter((entry) => entry.category === "item").length, Object.keys(ITEMS).length);
  assert.equal(WIKI_ENTRIES.filter((entry) => entry.category === "creature").length, MOB_ORDER.length);
  assert.equal(WIKI_ENTRIES.filter((entry) => entry.category === "plant").length, PLANTS.length);
  assert.equal(WIKI_ENTRIES.filter((entry) => entry.category === "biome").length, Object.keys(BIOME_NAMES).length);
  assert.ok(WIKI_ENTRIES.filter((entry) => entry.category === "system").length >= 8);
  for (const entry of WIKI_ENTRIES) {
    assert.ok(entry.summary.length > 20, entry.key);
    assert.ok(entry.sections.length > 0, entry.key);
    assert.equal(WIKI_ENTRY_BY_KEY[entry.key], entry);
    for (const relatedKey of entry.relatedKeys) assert.ok(WIKI_ENTRY_BY_KEY[relatedKey], `${entry.key} relates to missing ${relatedKey}`);
  }
});

test("the generated public archive matches the shared source", () => {
  const indexPath = new URL("../public/knowledge/index.json", import.meta.url);
  assert.ok(existsSync(indexPath));
  const payload = JSON.parse(readFileSync(indexPath, "utf8"));
  assert.deepEqual(payload.entries, wikiIndex());
  for (const category of WIKI_CATEGORY_ORDER) {
    const shard = JSON.parse(readFileSync(new URL(`../public/knowledge/${category}.json`, import.meta.url), "utf8"));
    assert.equal(shard.category, category);
    assert.deepEqual(shard.entries, WIKI_ENTRIES.filter((entry) => entry.category === category));
  }
});

test("public and in-game wiki surfaces preserve deep links and personal discovery boundaries", () => {
  const publicPage = readFileSync(new URL("../app/wiki/WikiClient.tsx", import.meta.url), "utf8");
  const game = readFileSync(new URL("../app/game/VoxelGame.tsx", import.meta.url), "utf8");
  assert.match(publicPage, /\/wiki\?entry=/u);
  assert.match(publicPage, /Bestiary stays personal/u);
  assert.match(publicPage, /\/knowledge\/\$\{targetCategory\}\.json/u);
  assert.match(game, /SHARED FIELD REFERENCE/u);
  assert.match(game, /Open personal/u);
  assert.match(game, /href="\/wiki"/u);
});

test("the dedicated wiki owns bounded mouse, keyboard, and touch scroll surfaces", () => {
  const client = readFileSync(new URL("../app/wiki/WikiClient.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../app/wiki/wiki.module.css", import.meta.url), "utf8");
  assert.match(styles, /grid-template-rows:\s*auto minmax\(0, 1fr\) auto/u);
  assert.match(styles, /\.resultList\s*\{[^}]*overflow-y:\s*auto/u);
  assert.match(styles, /\.reader\s*\{[^}]*overflow-y:\s*auto/u);
  assert.match(styles, /@media \(max-width: 780px\)[\s\S]*\.workspace\s*\{[^}]*overflow-y:\s*auto/u);
  assert.match(styles, /@media \(max-width: 780px\)[\s\S]*\.workspace\s*\{[^}]*max-width:\s*100vw/u);
  assert.match(styles, /@media \(max-width: 780px\)[\s\S]*\.readerHeader\s*\{[^}]*minmax\(0, 1fr\)/u);
  assert.match(styles, /-webkit-overflow-scrolling:\s*touch/u);
  assert.match(client, /reader\.current\?\.scrollTo/u);
  assert.match(client, /tabIndex=\{-1\}/u);
});
