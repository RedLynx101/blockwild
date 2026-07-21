import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GuildPanel } from "../app/game/GuildPanel.tsx";
import { QuestPanel } from "../app/game/HearthroadsPanels.tsx";
import { VoxelEngine } from "../app/game/engine.ts";
import { createQuestBook } from "../app/game/quests.ts";
import {
  GUILDS,
  GUILD_NPCS,
  GUILD_QUESTS,
  applyGuildSemanticEvent,
  completeGuildQuest,
  createGuildBook,
  discoverGuildHall,
  guildJoinEligibility,
  inviteToGuild,
  joinGuild,
  questProgress,
  startGuildQuest,
  type GuildBookState,
  type GuildQuestDefinition,
  type GuildQuestObjective,
  type GuildSemanticEvent,
} from "../app/game/guilds.ts";

function eventFor(
  quest: GuildQuestDefinition,
  objective: GuildQuestObjective,
  demonstrationId: string,
  overrides: Partial<GuildSemanticEvent> = {},
): GuildSemanticEvent {
  return {
    kind: objective.kind,
    guildId: quest.guildId,
    questId: quest.id,
    objectiveId: objective.id,
    targetId: objective.predicate.targetIds[0],
    demonstrationId,
    context: {
      creatureKind: objective.predicate.creatureKinds[0],
      locationId: objective.predicate.locationIds[0],
      itemId: objective.predicate.itemIds[0],
      encounterId: objective.predicate.encounterIds[0],
      actorId: objective.predicate.actorIds[0],
    },
    ...overrides,
  };
}

function enterGuild(book: GuildBookState, guildId: keyof typeof GUILDS, inviterId: string) {
  return joinGuild(inviteToGuild(book, guildId, inviterId), guildId);
}

test("all seven campaigns carry authored runtime predicates, recovery, solutions, and people", () => {
  assert.equal(Object.keys(GUILDS).length, 7);
  assert.equal(GUILD_QUESTS.length, 56);
  assert.equal(GUILD_NPCS.length, 21);
  assert.equal(GUILD_NPCS.filter((npc) => npc.recruitable).length, 7);
  assert.ok(Object.values(GUILDS).every((guild) => guild.ranks.length === 6 && guild.questIds.length === 8 && guild.principalNpcIds.length === 3));
  assert.equal(new Set(GUILD_QUESTS.map((quest) => quest.failure)).size, 56, "every chapter needs its own failure state");
  assert.equal(new Set(GUILD_QUESTS.map((quest) => quest.recovery)).size, 56, "every chapter needs its own recovery path");

  const targets = new Set<string>();
  for (const quest of GUILD_QUESTS) {
    assert.ok(quest.giverId && quest.recoveryGiverId);
    assert.ok(quest.locationIds.length > 0 && quest.creatureKinds.length > 0 && quest.itemIds.length > 0 && quest.encounterIds.length > 0);
    assert.ok(quest.solutionFamilies.length >= 2, `${quest.id} needs multiple supported solution families`);
    assert.ok(quest.failure.length > 30 && quest.recovery.length > 30, `${quest.id} needs explicit failure and recovery`);
    for (const objective of quest.objectives) {
      assert.match(objective.blockedText, /No matching proof yet/u);
      assert.equal(objective.failureText, quest.failure);
      assert.equal(objective.recoveryText, quest.recovery);
      assert.ok(objective.predicate.requiredContext.length > 0);
      assert.equal(objective.predicate.targetIds.length, 1);
      assert.equal(targets.has(objective.predicate.targetIds[0]), false, `${quest.id}/${objective.id} target must be unique`);
      targets.add(objective.predicate.targetIds[0]);
    }
  }

  assert.equal(new Set(GUILD_NPCS.map((npc) => npc.homeSchedule.join("|"))).size, 21, "principals should have authored schedules rather than one template");
  for (const npc of GUILD_NPCS) {
    assert.equal(npc.homeSchedule.length, 4);
    assert.equal(npc.contextLines.length, 6);
    assert.ok(npc.personalConcern.length > 20);
    assert.ok(npc.recoveryProtocol.length > 20);
    assert.equal(Boolean(npc.recruitCondition), npc.recruitable);
  }
});

test("accepted guild chapters appear in the quest journal without moving acceptance there", () => {
  const quest = GUILD_QUESTS.find((entry) => entry.guildId === "waykeeper" && entry.number === 1)!;
  let guildBook = enterGuild(createGuildBook(), "waykeeper", GUILDS.waykeeper.principalNpcIds[0]);
  const withoutAcceptedQuest = renderToStaticMarkup(createElement(QuestPanel, {
    book: createQuestBook(),
    definitions: [],
    guildBook,
    onAccept: () => undefined,
    onPin: () => undefined,
    onAbandon: () => undefined,
    onTurnIn: () => undefined,
  }));
  assert.doesNotMatch(withoutAcceptedQuest, /Guild quests/u);

  guildBook = startGuildQuest(guildBook, quest.id);
  const accepted = renderToStaticMarkup(createElement(QuestPanel, {
    book: createQuestBook(),
    definitions: [],
    guildBook,
    activeTab: "guild",
    selectedQuestId: quest.id,
    onAccept: () => undefined,
    onPin: () => undefined,
    onAbandon: () => undefined,
    onTurnIn: () => undefined,
  }));
  assert.match(accepted, /Guild quests/u);
  assert.match(accepted, new RegExp(quest.name, "u"));
  assert.match(accepted, /New guild chapters remain optional and are accepted from the Guilds ledger/u);
  assert.doesNotMatch(accepted, /Accept quest/u);
});

test("joining requires a principal invitation or discovered hall", () => {
  const blank = createGuildBook();
  assert.equal(joinGuild(blank, "waykeeper"), blank, "unknown remote guilds cannot be joined from the ledger");
  assert.deepEqual(guildJoinEligibility(blank, "waykeeper"), { eligible: false, reason: "Discover Waykeeper blind or earn a principal's invitation." });
  assert.equal(inviteToGuild(blank, "waykeeper", "neris-nine-lights"), blank, "another guild's NPC cannot invite");

  const invited = inviteToGuild(blank, "waykeeper", "odelia-fen");
  assert.equal(invited.guilds.waykeeper.membership, "invited");
  assert.equal(guildJoinEligibility(invited, "waykeeper").eligible, true);
  const member = joinGuild(invited, "waykeeper");
  assert.equal(member.guilds.waykeeper.membership, "member");
  assert.equal(member.guilds.waykeeper.rankId, GUILDS.waykeeper.ranks[0].id);

  const discovered = discoverGuildHall(blank, "tideglass", "guild-hall:reef-7:tideglass");
  assert.equal(discovered.guilds.tideglass.membership, "unknown", "discovery and personal invitation remain distinct records");
  assert.deepEqual(discovered.guilds.tideglass.hallDiscoveryIds, ["guild-hall:reef-7:tideglass"]);
  assert.equal(guildJoinEligibility(discovered, "tideglass").eligible, true);
  assert.equal(joinGuild(discovered, "tideglass").guilds.tideglass.membership, "member");
});

test("simultaneous active guilds never cross-credit kind-only or mismatched proof", () => {
  let book = createGuildBook();
  book = enterGuild(book, "waykeeper", "odelia-fen");
  book = enterGuild(book, "tideglass", "neris-nine-lights");
  const waykeeper = GUILD_QUESTS.find((quest) => quest.guildId === "waykeeper" && quest.number === 1)!;
  const tideglass = GUILD_QUESTS.find((quest) => quest.guildId === "tideglass" && quest.number === 1)!;
  book = startGuildQuest(startGuildQuest(book, waykeeper.id), tideglass.id);

  const wayCapture = waykeeper.objectives.find((objective) => objective.kind === "captureCreature")!;
  const tideCapture = tideglass.objectives.find((objective) => objective.kind === "captureCreature")!;
  const beforeLegacy = book;
  book = applyGuildSemanticEvent(book, { kind: "captureCreature", demonstrationId: "legacy-kind-broadcast" });
  assert.equal(book, beforeLegacy, "unrouted legacy broadcasts cannot award guild proof");

  const beforeMismatch = book;
  book = applyGuildSemanticEvent(book, eventFor(waykeeper, wayCapture, "wrong-target", { targetId: tideCapture.predicate.targetIds[0] }));
  assert.equal(book, beforeMismatch, "another quest's target predicate cannot match");

  const tideIdentity = book.guilds.tideglass;
  book = applyGuildSemanticEvent(book, eventFor(waykeeper, wayCapture, "healthy-field-capture"));
  assert.equal(questProgress(book, waykeeper.id)?.objectives.find((objective) => objective.id === wayCapture.id)?.current, 1);
  assert.equal(questProgress(book, tideglass.id)?.objectives.find((objective) => objective.id === tideCapture.id)?.current, 0);
  assert.equal(book.guilds.tideglass, tideIdentity, "unrelated guild state retains identity");

  const beforeDuplicate = book;
  book = applyGuildSemanticEvent(book, eventFor(waykeeper, wayCapture, "healthy-field-capture"));
  assert.equal(book, beforeDuplicate, "the same scoped proof cannot be replayed");
  assert.ok(book.guilds.waykeeper.completedDemonstrationIds.every((id) => id.startsWith(`waykeeper:${waykeeper.id}:`)));
});

test("objective predicates require their authored creature, site, item, actor, or encounter context", () => {
  let book = enterGuild(createGuildBook(), "sugarcourt-makers", "dame-caramel-voss");
  const quest = GUILD_QUESTS.find((entry) => entry.guildId === "sugarcourt-makers" && entry.number === 1)!;
  const craft = quest.objectives[0];
  book = startGuildQuest(book, quest.id);
  const before = book;
  book = applyGuildSemanticEvent(book, eventFor(quest, craft, "wrong-worksite", { context: { itemId: craft.predicate.itemIds[0], locationId: "ordinary-player-crafting-grid" } }));
  assert.equal(book, before);

  for (let index = 0; index < craft.target; index += 1) book = applyGuildSemanticEvent(book, eventFor(quest, craft, `constraint-${index}`));
  assert.equal(questProgress(book, quest.id)?.complete, true);
  const invalid = completeGuildQuest(book, quest.id, "not-an-authored-solution");
  assert.equal(invalid, book);
  const completed = completeGuildQuest(book, quest.id, quest.solutionFamilies[0]);
  assert.ok(completed.guilds[quest.guildId].completedQuestIds.includes(quest.id));
});

test("all 56 chapters are reachable in sequence through exact scoped proof", () => {
  for (const guildId of Object.keys(GUILDS) as Array<keyof typeof GUILDS>) {
    const inviter = GUILD_NPCS.find((npc) => npc.guildId === guildId)!;
    let book = enterGuild(createGuildBook(), guildId, inviter.id);
    for (const quest of GUILD_QUESTS.filter((entry) => entry.guildId === guildId)) {
      book = startGuildQuest(book, quest.id);
      assert.ok(book.guilds[guildId].activeQuestIds.includes(quest.id), `${quest.id} must start after its predecessor`);
      for (const objective of quest.objectives) for (let proof = 0; proof < objective.target; proof += 1) {
        book = applyGuildSemanticEvent(book, eventFor(quest, objective, `${quest.id}:${objective.id}:${proof}`));
      }
      assert.equal(questProgress(book, quest.id)?.complete, true, `${quest.id} must have a complete semantic route`);
      book = completeGuildQuest(book, quest.id, quest.solutionFamilies[0]);
      assert.ok(book.guilds[guildId].completedQuestIds.includes(quest.id), `${quest.id} must resolve and unlock the next chapter`);
    }
    assert.equal(book.guilds[guildId].completedQuestIds.length, 8);
    assert.equal(book.guilds[guildId].membership, "honored");
  }
});

test("the final charter choice is visible and the engine records it as the last objective", () => {
  const guildId = "waykeeper" as const;
  let book = enterGuild(createGuildBook(), guildId, "odelia-fen");
  const quests = GUILD_QUESTS.filter((entry) => entry.guildId === guildId);
  for (const quest of quests.slice(0, 7)) {
    book = startGuildQuest(book, quest.id);
    for (const objective of quest.objectives) for (let proof = 0; proof < objective.target; proof += 1) book = applyGuildSemanticEvent(book, eventFor(quest, objective, `${quest.id}:${objective.id}:${proof}`));
    book = completeGuildQuest(book, quest.id, quest.solutionFamilies[0]);
  }
  const charter = quests[7];
  book = startGuildQuest(book, charter.id);
  for (const objective of charter.objectives.filter((entry) => entry.kind !== "choiceOutcome")) for (let proof = 0; proof < objective.target; proof += 1) {
    book = applyGuildSemanticEvent(book, eventFor(charter, objective, `${charter.id}:${objective.id}:${proof}`));
  }
  assert.equal(questProgress(book, charter.id)?.complete, false, "the explicit doctrine choice remains outstanding");
  const markup = renderToStaticMarkup(createElement(GuildPanel, {
    state: book,
    onClose: () => undefined,
    onJoin: () => undefined,
    onStartQuest: () => undefined,
    onResolveQuest: () => undefined,
    onPromote: () => undefined,
  }));
  assert.match(markup, /RECORD A CONSEQUENCE/u);
  assert.match(markup, new RegExp(GUILDS[guildId].doctrines[0], "u"));

  const engine = Object.assign(Object.create(VoxelEngine.prototype), {
    multiplayer: null,
    guildBook: book,
    world: { structureMarkers: new Map() },
    audio: { play: () => undefined },
    events: { onToast: () => undefined },
    saveSoon: () => undefined,
    emitHud: () => undefined,
    addItem: () => 0,
    spawnDrop: () => undefined,
  }) as VoxelEngine;
  const doctrine = GUILDS[guildId].doctrines[0];
  assert.equal(engine.completeGuildQuest(charter.id, doctrine), true);
  assert.equal((engine as unknown as { guildBook: GuildBookState }).guildBook.guilds[guildId].doctrineChoiceId, doctrine);
  assert.ok((engine as unknown as { guildBook: GuildBookState }).guildBook.guilds[guildId].completedQuestIds.includes(charter.id));
});

test("guild panel leaves unmet ledgers read-only and offers an oath only after contact", () => {
  const props = {
    onClose: () => undefined,
    onJoin: () => undefined,
    onStartQuest: () => undefined,
    onResolveQuest: () => undefined,
    onPromote: () => undefined,
  };
  const unmet = renderToStaticMarkup(createElement(GuildPanel, { ...props, state: createGuildBook() }));
  assert.match(unmet, /Unmet guild — ledger preview only/u);
  assert.doesNotMatch(unmet, /Take the oath/u);

  const discovered = discoverGuildHall(createGuildBook(), "waykeeper", "guild-hall:green:waykeeper");
  const contacted = renderToStaticMarkup(createElement(GuildPanel, { ...props, state: discovered }));
  assert.match(contacted, /Take the oath/u);
  assert.match(contacted, /Membership<\/dt><dd>discovered/u);
});
