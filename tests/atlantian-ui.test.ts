import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  ATLANTIAN_ROLE_PRESENTATION,
  SentientDialoguePanel,
  SettlementPanel,
  TradePanel,
  sentientPortraitPath,
  tradeQuantityLimit,
} from "../app/game/HearthroadsPanels.tsx";
import { createGoldWallet, createMerchant } from "../app/game/economy.ts";
import { isNpcFactionId } from "../app/game/factions.ts";
import { createSettlementState, type SettlementCandidate } from "../app/game/settlements.ts";
import { sentientProfession } from "../app/game/VoxelGame.tsx";

const ATLANTIAN_ROLES = Object.keys(ATLANTIAN_ROLE_PRESENTATION) as Array<keyof typeof ATLANTIAN_ROLE_PRESENTATION>;

test("all six Atlantian roles have stable labels and rendered portrait paths", () => {
  assert.equal(ATLANTIAN_ROLES.length, 6);
  for (const profession of ATLANTIAN_ROLES) {
    const role = ATLANTIAN_ROLE_PRESENTATION[profession];
    const html = renderToString(createElement(SentientDialoguePanel, {
      character: {
        id: `resident-${profession}`,
        name: "Neri of the Lantern Tide",
        factionId: "atlantians",
        profession,
        portraitUrl: role.portraitUrl,
        alignment: 18,
      },
      greeting: "The open current remembers a careful traveler.",
      body: "This tidemoot is underwater and lit by living reeflight.",
      choices: [],
      onChoose: () => undefined,
    }));
    const readableHtml = html.replaceAll("&#x27;", "'");
    assert.match(html, /Lumen Tidemoots/u);
    assert.ok(html.includes(role.label), `${profession} label should render`);
    assert.ok(html.includes(role.portraitUrl), `${profession} portrait should render`);
    assert.ok(readableHtml.includes(role.description), `${profession} description should render`);
  }
});

test("the Atlantian settlement directory presents open-current civic context", () => {
  const candidate: SettlementCandidate = {
    schema: 1,
    id: "tidehold-ui-audit",
    worldSeed: "tide-ui",
    regionX: 0,
    regionZ: 0,
    center: { x: 0, y: -26, z: 0 },
    size: "hamlet",
    factionId: "atlantians",
    biome: "lumen-trench",
    environment: "underwater",
    floorY: -28,
  };
  const settlement = createSettlementState("host", candidate);
  const html = renderToString(createElement(SettlementPanel, {
    settlement,
    settlementName: "Lumen Tidemoot",
    alignment: 12,
    onSetRoleWaypoint: () => undefined,
  }));
  assert.match(html, /underwater · open currents/u);
  assert.match(html, /unwalled Lumen Tidemoot/u);
  assert.match(html, /Tidewarden/u);
  assert.match(html, /Kelp reserve/u);
  assert.match(html, /Open current/u);
  const livingProfessions = new Set(settlement.residents.filter((resident) => resident.alive).map((resident) => resident.profession));
  for (const profession of livingProfessions) {
    if (profession in ATLANTIAN_ROLE_PRESENTATION) assert.ok(html.includes(ATLANTIAN_ROLE_PRESENTATION[profession as keyof typeof ATLANTIAN_ROLE_PRESENTATION].label));
  }
});

test("Atlantian trade uses the aquatic market and profession-safe faction routing", () => {
  const merchant = createMerchant("host", "pearl-broker", "atlantians", "atlantian-pearlbroker", 420);
  const wallet = createGoldWallet("host", "player", 800);
  const html = renderToString(createElement(TradePanel, {
    merchant,
    playerGold: wallet.balance,
    playerInventory: [],
    merchantName: "Neri of the Lantern Tide",
    onTrade: () => undefined,
  }));
  assert.match(html, /Lumen Tidemoots market/u);
  assert.match(html, /Trade through the open current/u);
  assert.match(html, /Lumen Pearl/u);
  assert.equal(isNpcFactionId("atlantians"), true);
  assert.equal(sentientProfession(null, "atlantians"), "atlantian-tidewarden");
  assert.equal(sentientProfession("atlantian-glowmender", "atlantians"), "atlantian-glowmender");
  assert.equal(sentientPortraitPath("hobbits", "atlantian-glowmender"), "/creatures/hobbit-merchant.svg");
  assert.equal(sentientPortraitPath("goblins", "atlantian-glowmender"), "/creatures/goblin-worker.svg");
  assert.equal(sentientPortraitPath("wood-elves", "wood-elf-leafwarden"), "/creatures/wood-elf-leafwarden.svg");
  assert.equal(sentientPortraitPath("wood-elves", "general"), "/creatures/wood-elf-moonbroker.svg");
  assert.equal(sentientPortraitPath("dwarves", "dwarf-golemsmith"), "/creatures/dwarf-golemsmith.svg");
  assert.equal(sentientPortraitPath("dwarves", "general"), "/creatures/dwarf-provisioner.svg");
});

test("trade quantity shortcuts respect stock, funds, pack space, and merchant purse", () => {
  assert.deepEqual(tradeQuantityLimit({
    direction: "player-buys",
    available: 80,
    playerGold: "1000",
    merchantGold: "1000",
    unitPrice: 4,
    purchaseCapacity: 7,
  }), { maximum: 7, limitedBy: "pack-space" });
  assert.deepEqual(tradeQuantityLimit({
    direction: "player-buys",
    available: 80,
    playerGold: "38",
    merchantGold: "1000",
    unitPrice: 4,
    purchaseCapacity: 80,
  }), { maximum: 9, limitedBy: "player-gold" });
  assert.deepEqual(tradeQuantityLimit({
    direction: "player-sells",
    available: 130,
    playerGold: "0",
    merchantGold: "45",
    unitPrice: 2,
  }), { maximum: 22, limitedBy: "merchant-gold" });
  assert.deepEqual(tradeQuantityLimit({
    direction: "player-sells",
    available: 130,
    playerGold: "0",
    merchantGold: "10000",
    unitPrice: 2,
  }), { maximum: 130, limitedBy: "player-inventory" });
});

test("trade panel makes buy-all a review step with a separate confirmation", () => {
  const merchant = createMerchant("host", "pearl-broker", "atlantians", "atlantian-pearlbroker", 420);
  const wallet = createGoldWallet("host", "player", 800);
  const html = renderToString(createElement(TradePanel, {
    merchant,
    playerGold: wallet.balance,
    playerInventory: [],
    purchaseCapacity: Object.fromEntries(merchant.inventory.map((stack) => [stack.itemKey, 64])),
    merchantName: "Neri of the Lantern Tide",
    onTrade: () => undefined,
  }));
  assert.match(html, /Buy all/u);
  assert.match(html.replaceAll(/<!--.*?-->/gu, ""), /Set quantity to \d+ for review/u);
  assert.match(html, /No trade happens until you confirm/u);
  assert.match(html, /Confirm purchase ×1/u);
});
