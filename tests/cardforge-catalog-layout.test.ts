import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CardforgePanel } from "../app/game/CardforgePanel.tsx";
import { Item } from "../app/game/data.ts";
import { GUILDS, createGuildBook, inviteToGuild } from "../app/game/guilds.ts";
import { MOB_ORDER } from "../app/game/mobs.ts";
import { LOOT_FAMILIES } from "../app/game/contextual-loot.ts";
import { TCG_CATALOG, TCG_FULL_ART_ILLUSTRATIONS, tcgCatalogAudit } from "../app/game/tcg/catalog.ts";
import { CARDFORGE_FEATURED_FULL_ART_MOBS } from "../app/game/tcg/creature-art.ts";
import { createTcgPlayerState } from "../app/game/tcg/collection.ts";
import { auditTcgLayouts, layoutTcgCard, renderTcgCardSvg } from "../app/game/tcg/card-layout.ts";

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

test("every Full Art printing uses reviewed canonical-model or authored scene art", () => {
  const fullArts = TCG_CATALOG.printingOrder
    .map((printingId) => TCG_CATALOG.printings[printingId])
    .filter((printing) => printing.variant === "full-art");
  assert.equal(fullArts.length, CARDFORGE_FEATURED_FULL_ART_MOBS.length + 3);
  assert.equal(Object.keys(TCG_FULL_ART_ILLUSTRATIONS).length, fullArts.length);
  assert.deepEqual(new Set(fullArts.map((printing) => printing.setId)), new Set(["wildroads-core", "halls-and-hearths", "vaults-below"]));

  for (const printing of fullArts) {
    assert.equal(printing.finish, "etched");
    assert.equal(printing.valueModifierPermille, 5_000);
    assert.ok(printing.acquisitionTags.includes("wildlight"));
    assert.equal(printing.illustrationKey, TCG_FULL_ART_ILLUSTRATIONS[printing.cardDefinitionId]);
    assert.match(printing.illustrationKey, /^\/cardforge\/full-art(?:-canonical)?\/[a-z0-9-]+\.(?:svg|webp)$/u);
    const assetPath = join(process.cwd(), "public", printing.illustrationKey.slice(1));
    assert.ok(existsSync(assetPath), `${printing.id} needs its reviewed background`);
    if (printing.illustrationKey.endsWith(".svg")) {
      assert.ok(printing.acquisitionTags.includes("canonical-model-art"));
      assert.ok(statSync(assetPath).size > 15_000, `${printing.id} should retain canonical model detail`);
      const markup = readFileSync(assetPath, "utf8");
      assert.match(markup, /^<\?xml[^]*<svg/u);
      assert.match(markup, /canonical Cardforge Full Art/u);
      assert.match(markup, /data:image\/svg\+xml;base64/u);
    } else {
      assert.ok(printing.acquisitionTags.includes("authored-scene"));
      assert.ok(statSync(assetPath).size > 100_000, `${printing.id} should retain production illustration detail`);
      const header = readFileSync(assetPath).subarray(0, 12);
      assert.equal(header.subarray(0, 4).toString("ascii"), "RIFF");
      assert.equal(header.subarray(8, 12).toString("ascii"), "WEBP");
    }
  }

  const printing = fullArts.find((entry) => entry.cardDefinitionId === "card:mob:petalfox")!;
  const definition = TCG_CATALOG.definitions[printing.cardDefinitionId];
  const layout = layoutTcgCard(definition, printing);
  assert.deepEqual(layout.illustration, {
    key: printing.illustrationKey,
    x: 0,
    y: 0,
    width: 744,
    height: 1_040,
  });
  const svg = renderTcgCardSvg(definition, printing);
  assert.match(svg, /data-treatment="full-art"/u);
  assert.match(svg, /preserveAspectRatio="xMidYMid slice"/u);
  assert.match(svg, /\/cardforge\/full-art-canonical\/petalfox\.svg/u);
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

test("Cardforge UI renders Full Art as an edge-to-edge generated scene", () => {
  const printing = TCG_CATALOG.printingOrder
    .map((printingId) => TCG_CATALOG.printings[printingId])
    .find((entry) => entry.variant === "full-art" && entry.cardDefinitionId === "card:mob:petalfox")!;
  const player = createTcgPlayerState("full-art-ui");
  const markup = renderToStaticMarkup(createElement(CardforgePanel, {
    state: {
      catalogRevision: TCG_CATALOG.revision,
      player: {
        ...player,
        holdings: { [printing.id]: { physical: 1, archived: 0 } },
      },
      packBatches: [],
      lastPackReveal: null,
      merchant: null,
      activeMatch: null,
      opponents: [],
      challenges: [],
      trades: [],
      peers: [],
      settlementName: "Hearthmere",
      challengerStatus: "Ready",
      recoveryIssues: [],
    },
    guildBook: createGuildBook(),
    initialTab: "binder",
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
  assert.match(markup, /variant-full-art/u);
  assert.match(markup, /cardforge-full-art-bg/u);
  assert.match(markup, /\/cardforge\/full-art-canonical\/petalfox\.svg/u);
  assert.match(markup, />Full Art</u);
});
