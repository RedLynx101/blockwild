import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BLOCKS, ITEMS, type BlockId } from "../app/game/data.ts";
import type { ModelBox, ModelSpec } from "../app/game/model-specs.ts";
import { PLANTS, type PlantDefinition } from "../app/game/plants.ts";
import { renderModelPortrait, type InspectionModelSpec } from "./render-models.ts";

const BARK = "#68472f";
const STEM = "#4f7c43";
const SOIL = "#5a412b";
const WATER_STONE = "#61736f";

function box(
  id: string,
  part: string,
  size: readonly [number, number, number],
  position: readonly [number, number, number],
  color: string,
  rotation: readonly [number, number, number] = [0, 0, 0],
  emissive = false,
): ModelBox {
  return { id, part, size, position, color, rotation, ...(emissive ? { emissive: true } : {}) };
}

function colorForBlock(block: BlockId | undefined, fallback: string) {
  return block === undefined ? fallback : BLOCKS[block]?.color ?? fallback;
}

function colorForPlant(plant: PlantDefinition, fallback = STEM) {
  const mature = plant.blocks.at(-1);
  return colorForBlock(mature, ITEMS[plant.drops[0]?.item]?.color ?? fallback);
}

function blockMatching(plant: PlantDefinition, pattern: RegExp) {
  return plant.blocks.find((block) => pattern.test(BLOCKS[block]?.name ?? ""));
}

function hashUnit(value: string, salt = 0) {
  let hash = 2166136261 ^ salt;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function treeBoxes(plant: PlantDefinition): ModelBox[] {
  const trunk = colorForBlock(blockMatching(plant, /log|wood/i), BARK);
  const leaves = colorForBlock(blockMatching(plant, /leaves/i), colorForPlant(plant, "#58824d"));
  const height = 3.65 + hashUnit(plant.id, 17) * 0.85;
  const width = plant.id === "rainveil-tree" ? 0.76 : plant.id === "candywood-tree" ? 0.66 : 0.56;
  const result: ModelBox[] = [box("trunk", "trunk", [width, height, width], [0, height / 2, 0], trunk)];

  if (plant.id === "frostpine") {
    const tiers = [
      [2.45, 1.15, height - 1.45],
      [2.05, 1.05, height - 0.72],
      [1.55, 0.95, height - 0.06],
      [0.9, 0.78, height + 0.5],
    ] as const;
    tiers.forEach(([span, tierHeight, y], index) => result.push(box(`crown-${index + 1}`, "leaves", [span, tierHeight, span], [0, y, 0], leaves)));
    return result;
  }

  const crownY = height - 0.02;
  const broad = plant.id === "rainveil-tree" ? 3.4 : plant.id === "wild-apple" ? 2.85 : 2.65;
  result.push(
    box("crown-core", "leaves", [broad, 1.65, broad], [0, crownY, 0], leaves),
    box("crown-left", "leaves", [1.55, 1.35, 1.85], [-broad * 0.48, crownY - 0.15, 0.05], leaves),
    box("crown-right", "leaves", [1.55, 1.35, 1.85], [broad * 0.48, crownY - 0.08, -0.02], leaves),
    box("crown-front", "leaves", [1.85, 1.28, 1.4], [0.1, crownY - 0.1, -broad * 0.48], leaves),
    box("crown-back", "leaves", [1.75, 1.22, 1.35], [-0.08, crownY - 0.03, broad * 0.48], leaves),
    box("crown-top", "leaves", [1.8, 1.2, 1.8], [0, crownY + 0.78, 0], leaves),
  );
  if (["bloomwood", "sakurabloom-tree", "wild-apple"].includes(plant.id)) {
    const fruit = plant.id === "wild-apple" ? "#c84a3f" : plant.id === "sakurabloom-tree" ? "#ffd0dd" : "#ef9eb8";
    [[-0.74, crownY - 0.52, -0.82], [0.82, crownY - 0.35, -0.62], [0.18, crownY + 0.1, -1.25]].forEach(([x, y, z], index) => {
      result.push(box(`fruit-${index + 1}`, "fruit", [0.26, 0.3, 0.26], [x, y, z], fruit));
    });
  }
  return result;
}

function farmBoxes(plant: PlantDefinition): ModelBox[] {
  const crop = colorForPlant(plant, "#b9a04a");
  const result: ModelBox[] = [box("soil", "soil", [2.5, 0.24, 1.9], [0, 0.12, 0], SOIL)];
  const positions = [[-0.72, -0.45], [0, -0.5], [0.72, -0.42], [-0.4, 0.38], [0.42, 0.4]] as const;
  positions.forEach(([x, z], index) => {
    const height = 1.05 + hashUnit(plant.id, index + 3) * 0.48;
    result.push(
      box(`stem-${index + 1}`, "stem", [0.12, height, 0.12], [x, 0.24 + height / 2, z], STEM, [0, 0, (x / 14)]),
      box(`crop-${index + 1}`, "crop", [0.34, 0.42, 0.3], [x, 0.24 + height, z], crop),
    );
  });
  if (plant.id === "field-cotton") {
    positions.slice(0, 4).forEach(([x, z], index) => result.push(box(`boll-${index + 1}`, "boll", [0.4, 0.36, 0.4], [x, 1.47 + index * 0.03, z], "#f4efe1")));
  } else if (plant.id === "suncrest-carrot") {
    positions.forEach(([x, z], index) => result.push(box(`root-${index + 1}`, "root", [0.22, 0.5, 0.22], [x, 0.29, z], "#ef8638")));
  } else if (plant.id === "bluepod-bean") {
    positions.slice(0, 4).forEach(([x, z], index) => result.push(box(`pod-${index + 1}`, "pod", [0.16, 0.46, 0.17], [x + 0.14, 0.9 + index * 0.07, z], "#668ac4", [0, 0, 0.18])));
  } else if (plant.id === "peppermint-cane") {
    positions.slice(0, 4).forEach(([x, z], index) => result.push(box(`stripe-${index + 1}`, "cane-stripe", [0.23, 0.2, 0.23], [x, 0.78 + index * 0.11, z], index % 2 ? "#fff4e4" : "#cf4b55")));
  }
  return result;
}

function bushBoxes(plant: PlantDefinition): ModelBox[] {
  const leaves = colorForPlant(plant, "#64884b");
  const berry = ITEMS[plant.drops[0]?.item]?.color ?? "#b25b8f";
  const result = [
    box("root", "stem", [0.24, 0.65, 0.24], [0, 0.325, 0], BARK),
    box("bush-core", "leaves", [1.85, 1.25, 1.65], [0, 0.94, 0], leaves),
    box("bush-left", "leaves", [1.1, 1.05, 1.2], [-0.75, 0.78, 0.04], leaves),
    box("bush-right", "leaves", [1.1, 1.05, 1.2], [0.75, 0.82, -0.03], leaves),
    box("bush-top", "leaves", [1.15, 0.8, 1.05], [0, 1.52, 0], leaves),
  ];
  [[-0.66, 0.88, -0.62], [0.18, 1.35, -0.7], [0.72, 0.82, -0.45], [-0.05, 0.62, -0.86]].forEach(([x, y, z], index) => result.push(box(`berry-${index + 1}`, "fruit", [0.22, 0.25, 0.22], [x, y, z], berry)));
  return result;
}

function flowerBoxes(plant: PlantDefinition): ModelBox[] {
  const bloom = colorForPlant(plant, ITEMS[plant.drops[0]?.item]?.color ?? "#e68ba8");
  const luminous = /moon|dream|lantern|cloud/i.test(plant.id);
  const result: ModelBox[] = [
    box("stem", "stem", [0.13, 1.5, 0.13], [0, 0.75, 0], STEM),
    box("leaf-left", "leaf", [0.58, 0.12, 0.28], [-0.27, 0.66, 0], STEM, [0, 0, -0.24]),
    box("leaf-right", "leaf", [0.58, 0.12, 0.28], [0.27, 0.92, 0], STEM, [0, 0, 0.24]),
    box("center", "flower", [0.38, 0.35, 0.32], [0, 1.62, -0.04], "#f1c95b", [0, 0, 0], luminous),
  ];
  const petals = [[-0.38, 1.63, 0], [0.38, 1.63, 0], [0, 1.94, 0.02], [0, 1.32, -0.02], [-0.25, 1.84, 0.02], [0.25, 1.84, 0.02]] as const;
  petals.forEach(([x, y, z], index) => result.push(box(`petal-${index + 1}`, "petal", [0.46, 0.34, 0.22], [x, y, z], bloom, [0, 0, (index % 2 ? 1 : -1) * 0.22], luminous)));
  return result;
}

function aquaticBoxes(plant: PlantDefinition): ModelBox[] {
  const frond = colorForPlant(plant, "#4ca38d");
  const luminous = /glow|lumen|star|abyss/i.test(plant.id);
  const result: ModelBox[] = [
    box("bed", "waterbed", [2.35, 0.26, 1.75], [0, 0.13, 0], WATER_STONE),
    box("pebble-left", "pebble", [0.5, 0.32, 0.42], [-0.68, 0.33, 0.25], "#84908b", [0, 0.16, 0.08]),
    box("pebble-right", "pebble", [0.62, 0.38, 0.48], [0.66, 0.35, 0.16], "#75827e", [0, -0.2, -0.06]),
  ];
  [-0.72, -0.34, 0, 0.37, 0.72].forEach((x, index) => {
    const height = 1.15 + hashUnit(plant.id, 50 + index) * 1.25;
    result.push(box(`frond-${index + 1}`, "frond", [0.18, height, 0.22], [x, 0.26 + height / 2, -0.18 + (index % 2) * 0.38], frond, [0, 0, (index - 2) * 0.12], luminous));
  });
  return result;
}

function wildBoxes(plant: PlantDefinition): ModelBox[] {
  const color = colorForPlant(plant, "#718b48");
  if (plant.id === "cactus") return [
    box("cactus-trunk", "stem", [0.56, 2.8, 0.56], [0, 1.4, 0], color),
    box("cactus-arm-left", "stem", [0.44, 1.15, 0.44], [-0.62, 1.35, 0], color),
    box("cactus-bridge-left", "stem", [0.7, 0.4, 0.44], [-0.36, 0.98, 0], color),
    box("cactus-arm-right", "stem", [0.4, 0.86, 0.4], [0.62, 1.72, 0], color),
    box("cactus-bridge-right", "stem", [0.7, 0.38, 0.4], [0.36, 1.46, 0], color),
  ];
  const result: ModelBox[] = [];
  [-0.68, -0.32, 0.05, 0.42, 0.72].forEach((x, index) => {
    const height = 0.65 + hashUnit(plant.id, 90 + index) * 1.15;
    result.push(box(`sprig-${index + 1}`, "sprig", [0.17, height, 0.17], [x, height / 2, (index % 2 ? -1 : 1) * 0.22], color, [0, 0, (index - 2) * 0.13]));
  });
  return result;
}

/** Production-style flora catalog used by the Plant Compendium and asset tests. */
export function createPlantInspectionSpecs(): InspectionModelSpec[] {
  return PLANTS.map((plant) => {
    const boxes = plant.category === "tree" ? treeBoxes(plant)
      : plant.category === "farm" ? farmBoxes(plant)
        : plant.category === "bush" ? bushBoxes(plant)
          : plant.category === "flower" ? flowerBoxes(plant)
            : plant.category === "aquatic" ? aquaticBoxes(plant)
              : wildBoxes(plant);
    return {
      id: plant.id,
      label: plant.name,
      category: "block",
      front: "-z",
      groundY: 0,
      groundContactBoxIds: boxes.filter((entry) => Math.abs(entry.position[1] - entry.size[1] / 2) < 0.001).map((entry) => entry.id),
      boxes,
      inspection: { source: "model-specs" },
    } satisfies InspectionModelSpec;
  });
}

function escapeXml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function renderPlantSheet(specs: readonly InspectionModelSpec[], portraits: ReadonlyMap<string, string>, columns: number) {
  const count = Math.max(1, Math.min(columns, specs.length));
  const tileWidth = 340;
  const tileHeight = 292;
  const headerHeight = 100;
  const rows = Math.ceil(specs.length / count);
  const width = count * tileWidth;
  const height = headerHeight + rows * tileHeight;
  const plantById = new Map(PLANTS.map((plant) => [plant.id, plant]));
  const tiles = specs.map((spec, index) => {
    const x = (index % count) * tileWidth;
    const y = headerHeight + Math.floor(index / count) * tileHeight;
    const data = Buffer.from(portraits.get(spec.id) ?? "", "utf8").toString("base64");
    const plant = plantById.get(spec.id);
    return `<g transform="translate(${x} ${y})">
      <rect x="8" y="8" width="${tileWidth - 16}" height="${tileHeight - 16}" rx="18" fill="#171d1a" stroke="#39473e" stroke-width="2"/>
      <image href="data:image/svg+xml;base64,${data}" x="18" y="15" width="${tileWidth - 36}" height="${tileHeight - 80}" preserveAspectRatio="xMidYMid meet"/>
      <text x="24" y="${tileHeight - 40}" fill="#f2ebd7" font-family="ui-sans-serif, system-ui, sans-serif" font-size="19" font-weight="800">${escapeXml(spec.label)}</text>
      <text x="24" y="${tileHeight - 20}" fill="#95a99b" font-family="ui-sans-serif, system-ui, sans-serif" font-size="10" font-weight="700" letter-spacing="1.4">${escapeXml((plant?.category ?? "plant").toUpperCase())}</text>
    </g>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#0c100e"/>
  <text x="28" y="43" fill="#e5bd68" font-family="ui-sans-serif, system-ui, sans-serif" font-size="26" font-weight="900" letter-spacing="1.8">BLOCKWILD PLANT COMPENDIUM - V1.2</text>
  <text x="28" y="70" fill="#99a79e" font-family="ui-sans-serif, system-ui, sans-serif" font-size="13">Generated field specimens - full tree examples - ${specs.length} plants</text>
  ${tiles}
</svg>`;
}

export async function renderPlantPortraits(out: string, columns = 5) {
  const specs = createPlantInspectionSpecs();
  const portraits = new Map<string, string>();
  await mkdir(out, { recursive: true });
  for (const spec of specs) {
    const portrait = renderModelPortrait(spec as ModelSpec);
    portraits.set(spec.id, portrait);
    await writeFile(path.join(out, `${spec.id}.svg`), portrait, "utf8");
  }
  const sheetPath = path.join(out, "blockwild-plants.svg");
  await writeFile(sheetPath, renderPlantSheet(specs, portraits, columns), "utf8");
  return { specs, sheetPath };
}

async function main() {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf("--out");
  const columnsIndex = args.indexOf("--columns");
  const out = path.resolve(outIndex >= 0 && args[outIndex + 1] ? args[outIndex + 1] : "public/plants");
  const columns = Math.max(1, Math.min(8, Number(columnsIndex >= 0 ? args[columnsIndex + 1] : 5) || 5));
  const rendered = await renderPlantPortraits(out, columns);
  process.stdout.write(`${JSON.stringify({ status: "rendered", specimens: rendered.specs.length, sheet: rendered.sheetPath }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
