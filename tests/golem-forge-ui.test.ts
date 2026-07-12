import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { GolemForgePanel, golemForgePanelView } from "../app/game/GolemForgePanel";
import {
  GOLEM_RECIPES,
  advanceGolemForge,
  chargeGolemForge,
  createGolemForgeState,
  startGolemForge,
  unlockGolemBlueprint,
} from "../app/game/v1-cultures";

const noop = () => undefined;

function renderPanel(state = createGolemForgeState(), inventory: Readonly<Record<string, number>> = {}, availablePlayerMana = 0) {
  return renderToString(createElement(GolemForgePanel, {
    state,
    inventory,
    selectedType: "stone-bulwark",
    availablePlayerMana,
    onSelectType: noop,
    onChargeMana: noop,
    onStart: noop,
    onClaim: noop,
    onClose: noop,
  }));
}

test("Golem Forge renders all plans and clearly explains a locked construction", () => {
  const html = renderPanel();
  assert.match(html, /Golem Forge/u);
  assert.match(html, /Copper Scout/u);
  assert.match(html, /Stone Bulwark/u);
  assert.match(html, /Aetherforged Sentinel/u);
  assert.match(html, /Deepgear Courser/u);
  assert.match(html, /Blueprint not learned/u);
  assert.match(html, /Begin construction/u);
  assert.match(html, /Begin construction<\/button>/u);
  assert.match(html, /disabled=""/u);
  assert.match(html, /data-golem-forge/u);
});

test("panel view reports exact live inventory and mana readiness", () => {
  const recipe = GOLEM_RECIPES["stone-bulwark"];
  let state = unlockGolemBlueprint(createGolemForgeState(), recipe.blueprintId);
  let view = golemForgePanelView(state, recipe.type, { ...recipe.resources, "stone-brick": 2 });
  assert.equal(view.blueprintUnlocked, true);
  assert.deepEqual(view.missingResources, [{ id: "stone-brick", required: 24, available: 2 }]);
  assert.equal(view.missingMana, recipe.manaCost);
  assert.equal(view.canStart, false);

  state = chargeGolemForge(state, recipe.manaCost);
  view = golemForgePanelView(state, recipe.type, recipe.resources);
  assert.equal(view.missingResources.length, 0);
  assert.equal(view.missingMana, 0);
  assert.equal(view.canStart, true);
  const html = renderPanel(state, recipe.resources, 50);
  assert.doesNotMatch(html.match(/<button class="golem-forge-start"[^>]*>/u)?.[0] ?? "", /disabled/u);
  assert.match(html, /Plan learned/u);
  assert.match(html.replaceAll("<!-- -->", ""), /80 \/ 80 mana/u);
});

test("working and finished states expose progress and a claimable bound orb", () => {
  const recipe = GOLEM_RECIPES["stone-bulwark"];
  let state = chargeGolemForge(unlockGolemBlueprint(createGolemForgeState(), recipe.blueprintId), recipe.manaCost);
  const started = startGolemForge(state, recipe.type, recipe.resources, 100);
  assert.ok(started.ok);
  state = advanceGolemForge(started.state, recipe.seconds / 2);
  let html = renderPanel(state, recipe.resources);
  assert.match(html, /50 percent complete/u);
  assert.match(html, /45 sec remaining/u);
  assert.match(html, /Forge working/u);
  assert.match(html.replaceAll("<!-- -->", ""), /Mana committed.*80 \/ 80 mana/u);

  state = advanceGolemForge(state, recipe.seconds);
  html = renderPanel(state, recipe.resources);
  assert.match(html, /Automaton ready/u);
  assert.match(html, /Core stable - ready to claim/u);
  assert.match(html, /Claim into a bound capture orb/u);
});

test("dedicated forge stylesheet is responsive and motion-safe", () => {
  const css = readFileSync(new URL("../app/game/golem-forge.css", import.meta.url), "utf8");
  assert.match(css, /\.golem-forge-panel/u);
  assert.match(css, /@media \(max-width: 680px\)/u);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/u);
  assert.match(css, /golem-forge-pulse/u);
});
