import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DragonPanel } from "../app/game/DragonPanel.tsx";
import { createDragonState, type DragonState } from "../app/game/dragons.ts";

const outputDirectory = resolve("output/dragon-panel-audit");
mkdirSync(outputDirectory, { recursive: true });

const base = createDragonState("steel", {
  dragonId: "anvilwing-audit",
  ageDays: 112,
  sex: "female",
  tamed: true,
  ownerId: "local",
  customName: "Anvilwing",
});
const dragon: DragonState = {
  ...base,
  scaleReserve: 7,
  health: base.maxHealth * 0.82,
  command: "follow",
  equipment: {
    saddle: true,
    chests: [true, true],
    armor: {
      head: "steel-dragon-head-armor",
      neck: "steel-dragon-neck-armor",
      body: "steel-dragon-body-armor",
      tail: null,
    },
  },
};

const panel = renderToStaticMarkup(createElement(DragonPanel, {
  dragon,
  displayName: "Anvilwing",
  portrait: createElement("img", { src: "/public/creatures/steel-dragon.svg", alt: "Steel Dragon" }),
  onClose: () => undefined,
  onCommand: () => undefined,
  onToggleShoulder: () => undefined,
  onHarvestScales: () => undefined,
  onOpenCargo: () => undefined,
}));

writeFileSync(resolve(outputDirectory, "dragon-care.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dragon Care Audit</title><style>html,body{margin:0;min-height:100%;background:#080b0c}</style></head><body>${panel}</body></html>`);
console.log(outputDirectory);
