import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  SUGARCOURT_ROLE_PRESENTATION,
  SentientDialoguePanel,
  SettlementPanel,
  StationPanel,
  TradePanel,
  sentientPortraitPath,
} from "../app/game/HearthroadsPanels.tsx";
import { createBlueprintState } from "../app/game/blueprints.ts";
import { SUGARWORKS_RECIPES, createSugarworks } from "../app/game/candyworks.ts";
import { createGoldWallet, createMerchant } from "../app/game/economy.ts";
import { createSettlementState, type SettlementCandidate } from "../app/game/settlements.ts";

const SUGARCOURT_ROLES = Object.keys(SUGARCOURT_ROLE_PRESENTATION) as Array<keyof typeof SUGARCOURT_ROLE_PRESENTATION>;

const candidate: SettlementCandidate = {
  schema: 1,
  id: "bonbon-borough-ui",
  worldSeed: "SUGARCOURT-UI",
  regionX: 0,
  regionZ: 0,
  center: { x: 0, z: 0 },
  size: "town",
  factionId: "sugarcourt",
  biome: "sugarplum-vale",
  environment: "surface",
};

test("all seven Sugarcourt roles have stable labels, descriptions, and production portrait routes", () => {
  assert.equal(SUGARCOURT_ROLES.length, 7);
  for (const profession of SUGARCOURT_ROLES) {
    const role = SUGARCOURT_ROLE_PRESENTATION[profession];
    assert.equal(sentientPortraitPath("sugarcourt", profession), role.portraitUrl);
    const html = renderToString(createElement(SentientDialoguePanel, {
      character: {
        id: `resident-${profession}`,
        name: "Mint Honeyspun",
        factionId: "sugarcourt",
        profession,
        portraitUrl: role.portraitUrl,
        alignment: 18,
      },
      greeting: "Measure twice, traveler, and every welcome stays sweet.",
      body: "The Bonbon Borough keeps warm kettles behind hard-candy walls.",
      choices: [],
      onChoose: () => undefined,
    }));
    assert.match(html, /Sugarcourt Concord/u);
    assert.match(html, /Bonbon Borough resident/u);
    assert.ok(html.includes(role.label));
    assert.ok(html.includes(role.portraitUrl));
    assert.ok(html.replaceAll("&#x27;", "'").includes(role.description));
  }
});

test("the Bonbon Borough directory presents Sugarworks craft, hard-candy walls, and village companions", () => {
  const settlement = createSettlementState("host", candidate);
  const html = renderToString(createElement(SettlementPanel, {
    settlement,
    settlementName: "Bonbon Borough",
    alignment: 12,
    onSetRoleWaypoint: () => undefined,
  }));
  assert.match(html, /Bonbon Borough/u);
  assert.match(html, /hard-candy walls/u);
  assert.match(html, /Crown Confectioner/u);
  assert.match(html, /Taffy Hounds watch the gates/u);
  assert.match(html, /Praline Cats/u);
  for (const profession of new Set(settlement.residents.map((resident) => resident.profession))) {
    if (profession in SUGARCOURT_ROLE_PRESENTATION) assert.ok(html.includes(SUGARCOURT_ROLE_PRESENTATION[profession as keyof typeof SUGARCOURT_ROLE_PRESENTATION].label));
  }
});

test("Sugarcourt trade shows crops, finished equipment, blueprints, potions, and neutral companion orbs", () => {
  const merchant = createMerchant("host", "kennelkeeper", "sugarcourt", "sugarcourt-kennelkeeper", 700);
  const wallet = createGoldWallet("host", "player", 1_200);
  const html = renderToString(createElement(TradePanel, {
    merchant,
    playerGold: wallet.balance,
    playerInventory: [],
    merchantName: "Poppy Taffyfold",
    onTrade: () => undefined,
  }));
  assert.match(html, /Sugarcourt Concord market/u);
  assert.match(html, /Trade across the cooling counter/u);
  assert.match(html, /Taffy Hound Care Transfer/u);
  assert.match(html, /Praline Cat Care Transfer/u);
});

test("the Sugarworks station has themed batch copy, real ingredients, progress, and blueprint locks", () => {
  const html = renderToString(createElement(StationPanel, {
    kind: "sugarworks",
    state: createSugarworks(),
    recipes: SUGARWORKS_RECIPES,
    inventory: { gumdrop: 4, "lollipop-petal": 2, "honey-jar": 1 },
    blueprints: createBlueprintState(),
    onSelectRecipe: () => undefined,
    onStartBatch: () => undefined,
    onCollectOutput: () => undefined,
  }));
  assert.match(html, /Sugarcourt craft/u);
  assert.match(html, /Sugarworks/u);
  assert.match(html, /Measure a candywork pattern/u);
  assert.match(html, /Tempered Candy Alloy/u);
  assert.match(html, /Blueprint needed/u);
  assert.match(html, /Heat Sugarworks batch/u);
});
