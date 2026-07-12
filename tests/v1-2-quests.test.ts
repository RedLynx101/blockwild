import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_QUEST_DEFINITIONS,
  DEFAULT_QUESTLINES,
  GOBLIN_FACTION_QUESTS,
  HOBBIT_FACTION_QUESTS,
  acceptQuestFromSource,
  createQuestBook,
  questSourceCanOffer,
} from "../app/game/quests.ts";

test("every current NPC faction has a curated faction questline", () => {
  const questlineIds = new Set(DEFAULT_QUESTLINES.map((line) => line.id));
  for (const id of [
    "hobbit-hearth-and-hedge",
    "goblin-root-and-brass",
    "atlantian-lumen-tides",
    "sugarcourt-measured-welcome",
    "wood-elf-moonbough-oaths",
    "dwarf-deepgear-oaths",
  ]) assert.ok(questlineIds.has(id), id);
  assert.ok(HOBBIT_FACTION_QUESTS.some((quest) => quest.rewards.gold >= 150));
  assert.ok(GOBLIN_FACTION_QUESTS.some((quest) => quest.rewards.gold >= 150));
});

test("faction-wide commissions are issued and turned in through a matching mayor", () => {
  const definition = HOBBIT_FACTION_QUESTS.find((quest) => quest.id === "hobbit-long-table-watch")!;
  const wrongResident = { entityId: "hobbit-tiller-1", role: "hobbit-tiller", factionId: "hobbits", isMayor: false } as const;
  const mayor = { entityId: "hobbit-mayor-1", role: "hobbit-hearthwarden", factionId: "hobbits", isMayor: true } as const;
  assert.equal(questSourceCanOffer(definition, wrongResident), false);
  assert.equal(questSourceCanOffer(definition, mayor), true);

  const book = { ...createQuestBook(), completed: ["hobbit-smoke-on-the-hedgerow"] };
  const accepted = acceptQuestFromSource(book, DEFAULT_QUEST_DEFINITIONS, definition.id, 100, mayor);
  assert.equal(accepted.ok, true);
  if (accepted.ok) assert.deepEqual(accepted.book.active[0].turnInRoute, { kind: "faction-mayor", factionId: "hobbits" });
});
