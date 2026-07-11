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
} from "../app/game/HearthroadsPanels.tsx";
import { createGoldWallet, createMerchant } from "../app/game/economy.ts";
import { createSettlementState, type SettlementCandidate } from "../app/game/settlements.ts";
import { isNpcFactionId, sentientProfession } from "../app/game/VoxelGame.tsx";

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
});
