import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { GolemForgePanel } from "../app/game/GolemForgePanel";
import {
  GOLEM_RECIPES,
  advanceGolemForge,
  chargeGolemForge,
  createGolemForgeState,
  startGolemForge,
  unlockGolemBlueprint,
} from "../app/game/v1-cultures";

const recipe = GOLEM_RECIPES["stone-bulwark"];
let forge = chargeGolemForge(unlockGolemBlueprint(createGolemForgeState(), recipe.blueprintId), recipe.manaCost);
const started = startGolemForge(forge, recipe.type, recipe.resources, 2_000);
if (!started.ok) throw new Error(`Could not prepare audit state: ${started.reason}`);
forge = advanceGolemForge(started.state, recipe.seconds * 0.54);

const markup = renderToStaticMarkup(createElement(GolemForgePanel, {
  state: forge,
  inventory: recipe.resources,
  selectedType: recipe.type,
  availablePlayerMana: 142,
  onSelectType: () => undefined,
  onChargeMana: () => undefined,
  onStart: () => undefined,
  onClaim: () => undefined,
  onClose: () => undefined,
}));

const styles = readFileSync(resolve("app/game/golem-forge.css"), "utf8");
const outputDirectory = resolve("output/playwright/golem-forge-audit");
mkdirSync(outputDirectory, { recursive: true });
writeFileSync(resolve(outputDirectory, "index.html"), `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Golem Forge Visual Audit</title><style>
* { box-sizing: border-box; }
html, body { min-height: 100%; margin: 0; }
body { min-height: 100vh; display: grid; place-items: center; padding: 16px; background: radial-gradient(circle at 50% 20%, #293632, #121411 58%, #080908); font-family: ui-monospace, Consolas, monospace; }
button { font: inherit; }
${styles}
</style></head><body>${markup}</body></html>`, "utf8");

process.stdout.write(`${resolve(outputDirectory, "index.html")}\n`);
