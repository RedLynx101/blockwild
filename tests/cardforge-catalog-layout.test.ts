import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CardforgePanel } from "../app/game/CardforgePanel.tsx";
import { Item } from "../app/game/data.ts";
import { GUILDS, createGuildBook, inviteToGuild } from "../app/game/guilds.ts";
import { MOB_ORDER } from "../app/game/mobs.ts";
import { LOOT_FAMILIES } from "../app/game/contextual-loot.ts";
import { TCG_CATALOG, tcgCatalogAudit } from "../app/game/tcg/catalog.ts";
import { createTcgPlayerState } from "../app/game/tcg/collection.ts";
import { auditTcgLayouts, renderTcgCardSvg } from "../app/game/tcg/layout.ts";

test("Cardforge catalog covers every live mob and guild with complete pack pools", () => {
  const audit = tcgCatalogAudit();
  assert.equal(audit.valid, true, audit.errors.join("\n"));
  assert.equal(audit.mobCoverage, MOB_ORDER.length);
  assert.ok(audit.definitions >= MOB_ORDER.length);
  assert.ok(audit.printings > audit.definitions);

  for (const kind of MOB_ORDER) {
    const definition = TCG_CATALOG.definitions[`card:mob:${kind}`];
    assert.ok(definition, `${kind} needs a card definition`);
    const printingIds = TCG_CATALOG.printingsByDefinition[definition.id];
    assert.ok(printingIds.length > 0);
    const portrait = TCG_CATALOG.printings[printingIds[0]].illustrationKey;
    assert.ok(portrait.startsWith("/creatures/"));
    assert.ok(existsSync(join(process.cwd(), "public", portrait.slice(1))), `${kind} needs its deterministic portrait`);
  }

  for (const guildId of Object.keys(GUILDS)) {
    assert.ok(TCG_CATALOG.definitionOrder.some((id) => TCG_CATALOG.definitions[id].guilds.includes(guildId)), `${guildId} needs representation`);
  }
});

test("all card layouts fit deterministic bounded regions", () => {
  const audit = auditTcgLayouts();
  assert.equal(audit.valid, true, JSON.stringify(audit.failures.slice(0, 10)));
  assert.equal(audit.checked, TCG_CATALOG.printingOrder.length);
  const printing = TCG_CATALOG.printings[TCG_CATALOG.printingOrder[0]];
  const definition = TCG_CATALOG.definitions[printing.cardDefinitionId];
  const left = renderTcgCardSvg(definition, printing);
  const right = renderTcgCardSvg(definition, printing);
  assert.equal(left, right);
  assert.match(left, /^<svg/u);
  assert.match(left, new RegExp(definition.name.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"), "u"));
});

test("dungeon families contain physical boosters that redeem into the Cardforge ledger", () => {
  assert.ok(LOOT_FAMILIES["dungeon-specialist"].optional.some((entry) => entry.item === Item.CardforgeBooster));
  assert.ok(LOOT_FAMILIES["dungeon-vault"].purpose.reward.some((entry) => entry.item === Item.CardforgeBooster));
  assert.ok(LOOT_FAMILIES["dungeon-vault"].signatureItems.includes(Item.CardforgeBooster));
});

test("Cardforge UI exposes the complete collection, play, exchange, and live guild surfaces", () => {
  let guildBook = createGuildBook();
  guildBook = inviteToGuild(guildBook, "cardwright", "lysa-proofmark");
  guildBook = inviteToGuild(guildBook, "waytable", "orra-last-turn");
  const markup = renderToStaticMarkup(createElement(CardforgePanel, {
    state: {
      catalogRevision: TCG_CATALOG.revision,
      player: createTcgPlayerState("ui-player"),
      packBatches: [],
      lastPackReveal: null,
      merchant: null,
      activeMatch: null,
      opponents: [],
      challenges: [],
      trades: [],
      peers: [],
      settlementName: null,
      challengerStatus: "Visit a generated settlement.",
      recoveryIssues: [],
    },
    guildBook,
    initialTab: "guilds",
    walletBalance: "25",
    onClose: () => undefined,
    onStartTutorial: () => undefined,
    onClaimStarter: () => undefined,
    onOpenPack: () => undefined,
    onMoveCards: () => undefined,
    onArchiveDuplicates: () => undefined,
    onUpgradeArchive: () => undefined,
    onWithdrawLoose: () => undefined,
    onSaveDeck: () => undefined,
    onSetActiveDeck: () => undefined,
    onStartNpcMatch: () => undefined,
    onMatchAction: () => undefined,
    onBuy: () => undefined,
    onSell: () => undefined,
    onTrade: () => undefined,
    onTradeResponse: () => undefined,
    onChallenge: () => undefined,
    onChallengeResponse: () => undefined,
    onJoinGuild: () => undefined,
    onStartGuildQuest: () => undefined,
    onResolveGuildQuest: () => undefined,
    onPromoteGuild: () => undefined,
  }));
  for (const label of ["Binder", "Dex", "Decks", "Packs", "Market", "Battle", "Exchange", "Guilds", "Rules"]) assert.match(markup, new RegExp(`>${label}<`, "u"));
  assert.match(markup, /Cardwrights/u);
  assert.match(markup, /Waytable Circuit/u);
  assert.match(markup, /Start Teaching Match/u);
});
