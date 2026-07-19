import assert from "node:assert/strict";
import test from "node:test";
import { createMagicState, filterSpellJournalEntries, type SpellJournalFacets } from "../app/game/magic";

const all: SpellJournalFacets = {
  query: "", school: "all", type: "all", targeting: "all", source: "all", learned: "all", summon: "all",
};

test("spell journal facets compose across summon, type, targeting, and source", () => {
  const state = createMagicState();
  const summons = filterSpellJournalEntries(state, { ...all, summon: "summon" });
  assert.deepEqual(summons.map((spell) => spell.id), ["call-asterjaw", "fold-vellum-warden", "invoke-choir-of-one", "open-glasswake"]);
  assert.deepEqual(filterSpellJournalEntries(state, { ...all, summon: "summon", type: "mirror" }).map((spell) => spell.id), ["open-glasswake"]);
  assert.ok(filterSpellJournalEntries(state, { ...all, targeting: "ground", source: "quest" }).every((spell) => spell.targeting === "ground" && spell.sources.some((source) => source.kind === "quest")));
});

test("learned and recorded states do not leak into each other", () => {
  const state = {
    ...createMagicState(),
    learnedSpellIds: ["flame-jet" as const],
    journal: {
      "flame-jet": { spellId: "flame-jet" as const, discoveredAt: 1, learnedAt: 1, castCount: 0, lastCastAt: null },
      "frost-lance": { spellId: "frost-lance" as const, discoveredAt: 2, learnedAt: null, castCount: 0, lastCastAt: null },
    },
  };
  assert.deepEqual(filterSpellJournalEntries(state, { ...all, learned: "learned" }).map((spell) => spell.id), ["flame-jet"]);
  assert.deepEqual(filterSpellJournalEntries(state, { ...all, learned: "recorded" }).map((spell) => spell.id), ["frost-lance"]);
  assert.ok(!filterSpellJournalEntries(state, { ...all, learned: "unknown" }).some((spell) => ["flame-jet", "frost-lance"].includes(spell.id)));
});
