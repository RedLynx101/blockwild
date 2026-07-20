import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { BLOCKS, BlockId, ITEMS } from "../app/game/data.ts";
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
  const trunk = plant.id === "frostpear-tree"
    ? colorForBlock(BlockId.PineLog, BARK)
    : colorForBlock(blockMatching(plant, /log|wood/i), BARK);
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
  if (["bloomwood", "sakurabloom-tree", "wild-apple", "frostpear-tree"].includes(plant.id)) {
    const fruit = plant.id === "wild-apple" ? "#c84a3f"
      : plant.id === "frostpear-tree" ? colorForBlock(BlockId.FrostpearFruit, "#a8d6d8")
        : plant.id === "sakurabloom-tree" ? "#ffd0dd" : "#ef9eb8";
    [[-0.74, crownY - 0.96, -0.82], [0.82, crownY - 0.89, -0.62], [0.18, crownY - 0.84, -1.25]].forEach(([x, y, z], index) => {
      result.push(box(`fruit-${index + 1}`, "fruit", [0.3, 0.34, 0.3], [x, y, z], fruit));
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
  const bed = () => [
    box("bed", "waterbed", [2.5, 0.24, 1.9], [0, 0.12, 0], WATER_STONE),
    box("holdfast", "roots", [1.15, .16, .84], [0, .28, 0], "#46584f"),
  ];
  if (plant.id === "brinegrass") {
    const result: ModelBox[] = bed();
    const blades = [
      [-.9, -.35, 1.45, -.22], [-.66, .25, 1.9, .18], [-.38, -.12, 1.6, -.1],
      [-.08, .3, 2.15, .12], [.24, -.28, 1.72, -.16], [.55, .2, 1.98, .19], [.86, -.1, 1.4, .25],
    ] as const;
    blades.forEach(([x, z, height, lean], index) => result.push(
      box(`blade-${index + 1}`, "blade", [.12, height, .2], [x + lean * .22, .28 + height / 2, z], index % 3 === 0 ? "#6fae86" : index % 2 ? "#397c65" : "#4f9475", [0, 0, lean]),
    ));
    return result;
  }
  if (plant.id === "sailkelp") {
    const result: ModelBox[] = bed();
    result.push(
      box("stipe-lower", "stipe", [.22, 2.35, .22], [0, 1.45, 0], "#46462b", [0, 0, -.035]),
      box("stipe-upper", "stipe", [.2, 2.3, .2], [-.11, 3.62, 0], "#69683a", [0, 0, .08]),
    );
    const sails = [
      [-.52, 1.15, 1.12, -.43, "#777541"], [.6, 1.78, 1.36, .5, "#969653"],
      [-.58, 2.48, 1.45, -.48, "#676837"], [.54, 3.15, 1.34, .45, "#a8ad61"],
      [-.46, 3.84, 1.16, -.39, "#7c8046"], [.38, 4.42, .96, .33, "#b5ba69"],
    ] as const;
    sails.forEach(([x, y, height, roll, color], index) => result.push(
      box(`sail-${index + 1}`, "sail", [.72, height, .1], [x, y, index % 2 ? .06 : -.06], color, [0, index % 2 ? .1 : -.1, roll]),
      box(`rib-${index + 1}`, "sail-rib", [.1, height * .9, .14], [x - Math.sign(x) * .22, y, index % 2 ? .05 : -.05], "#4d4e2d", [0, index % 2 ? .1 : -.1, roll]),
    ));
    return result;
  }
  if (plant.id === "featherwrack") {
    const result: ModelBox[] = bed();
    result.push(box("wrack-stem", "stem", [.18, 2.8, .18], [0, 1.68, 0], "#743b3a", [0, 0, -.04]));
    const branches = [[.7, .88, .18], [-.78, 1.28, -.2], [.86, 1.72, .2], [-.72, 2.12, -.18], [.58, 2.5, .16]] as const;
    branches.forEach(([x, y, roll], index) => {
      result.push(box(`branch-${index + 1}`, "branch", [Math.abs(x) * 1.18, .12, .14], [x * .48, y, 0], index % 2 ? "#8c4642" : "#a55a4d", [0, 0, roll]));
      for (let leaflet = 0; leaflet < 4; leaflet += 1) {
        const fraction = (leaflet + 1) / 5;
        result.push(box(`leaflet-${index + 1}-${leaflet + 1}`, "leaflet", [.11, .42 - leaflet * .035, .16], [x * fraction, y + (leaflet % 2 ? .14 : -.12), 0], leaflet === 3 ? "#d28a69" : "#b56654", [0, 0, x > 0 ? -.34 : .34]));
      }
    });
    return result;
  }
  if (plant.id === "pearlfan") {
    const result: ModelBox[] = bed();
    result.push(box("fan-stem", "stem", [.18, .8, .18], [0, .7, 0], "#69625d"));
    const spokes = [-1.02, -.76, -.5, -.24, 0, .24, .5, .76, 1.02] as const;
    spokes.forEach((angle, index) => {
      const length = 1.35 + (1 - Math.abs(angle) / 1.1) * .48;
      const x = Math.sin(angle) * length * .46;
      const y = .92 + Math.cos(angle) * length * .46;
      result.push(
        box(`fan-spoke-${index + 1}`, "fan-spoke", [.13, length, .12], [x, y, 0], index % 2 ? "#b8aeb2" : "#d6c9bd", [0, 0, -angle]),
        box(`pearl-tip-${index + 1}`, "fan-tip", [.2, .2, .16], [x * 1.85, .88 + Math.cos(angle) * length * .88, 0], index % 2 ? "#f1e4cf" : "#fff3db"),
      );
    });
    result.push(
      box("fan-bar-lower", "fan-web", [1.55, .11, .08], [0, 1.35, .02], "#8d8588"),
      box("fan-bar-upper", "fan-web", [2.15, .1, .08], [0, 1.92, .02], "#c5b9b3"),
    );
    return result;
  }
  if (plant.id === "shellfruit") {
    const result: ModelBox[] = [
      box("bed", "waterbed", [2.5, 0.24, 1.9], [0, 0.12, 0], WATER_STONE),
      box("root-mat", "roots", [1.9, 0.14, 1.25], [0, 0.28, 0], "#3d7464"),
    ];
    const colonies = [[-0.68, -0.22, -0.16], [0, 0.18, 0.12], [0.7, -0.18, -0.1]] as const;
    colonies.forEach(([x, z, yaw], index) => {
      result.push(
        box(`shell-lower-${index + 1}`, "shell", [0.7, 0.18, 0.62], [x, 0.43, z], index === 1 ? "#e1a06f" : "#bd795d", [0, yaw, 0]),
        box(`shell-back-${index + 1}`, "shell", [0.68, 0.12, 0.58], [x, 0.68, z + 0.15], "#f1d2aa", [-0.58, yaw, 0]),
        box(`pearl-${index + 1}`, "fruit", [0.24, 0.24, 0.24], [x, 0.61, z - 0.12], index === 1 ? "#fff2ba" : "#e9bd75"),
      );
    });
    for (const [x, z, lean] of [[-0.95, 0.38, -0.2], [-0.35, 0.62, 0.16], [0.42, 0.58, -0.12], [1, 0.34, 0.2]] as const) {
      result.push(box(`frond-${result.length}`, "frond", [0.15, 1.1, 0.22], [x, 0.78, z], "#6eae8d", [0, 0, lean]));
    }
    return result;
  }
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
  if (plant.id === "mooncap-mushroom") {
    const cap = colorForBlock(BlockId.MushroomCap, "#9b5878");
    const gill = "#e7c8d8";
    return [
      box("stem-tall", "stem", [0.3, 1.28, 0.3], [-0.42, 0.64, 0.04], "#d8c9b9"),
      box("cap-tall", "cap", [1.05, 0.3, 0.9], [-0.42, 1.34, 0.04], cap, [0, 0.08, -0.05], true),
      box("gill-tall", "gill", [0.72, 0.08, 0.62], [-0.42, 1.17, 0.04], gill, [0, 0.08, -0.05], true),
      box("stem-mid", "stem", [0.25, 0.86, 0.25], [0.46, 0.43, -0.08], "#d8c9b9"),
      box("cap-mid", "cap", [0.78, 0.26, 0.68], [0.46, 0.93, -0.08], "#b76c9a", [0, -0.14, 0.06], true),
      box("stem-small", "stem", [0.2, 0.5, 0.2], [0.08, 0.25, 0.52], "#d8c9b9"),
      box("cap-small", "cap", [0.58, 0.22, 0.52], [0.08, 0.58, 0.52], "#7d486e", [0.04, 0.12, 0], true),
      box("moon-spot-left", "cap-mark", [0.16, 0.05, 0.18], [-0.68, 1.51, -0.13], "#f1deef", [0, 0.08, -0.05], true),
      box("moon-spot-right", "cap-mark", [0.13, 0.05, 0.15], [-0.16, 1.5, 0.18], "#f1deef", [0, 0.08, -0.05], true),
    ];
  }
  if (plant.id === "starfern") {
    const glow = colorForBlock(BlockId.Starfern, "#5fc2a1");
    const result: ModelBox[] = [box("fern-heart", "heart", [0.34, 0.3, 0.34], [0, 0.18, 0], "#b9f1c9", [0, 0, 0], true)];
    const fronds = [
      [-0.72, 0.37, -0.03, -0.78], [0.72, 0.37, 0.03, 0.78],
      [-0.52, 0.46, -0.52, -0.56], [0.52, 0.46, 0.52, 0.56],
      [0, 0.55, -0.72, 0], [0, 0.52, 0.66, 0],
    ] as const;
    fronds.forEach(([x, y, z, roll], index) => {
      result.push(box(`frond-${index + 1}`, "frond", [0.26, 1.12, 0.18], [x, y, z], glow, [z * 0.42, 0, roll], true));
      result.push(box(`star-tip-${index + 1}`, "star-tip", [0.22, 0.22, 0.2], [x * 1.48, y + 0.18, z * 1.48], "#d9fff0", [0, index * 0.3, roll], true));
    });
    return result;
  }
  if (plant.id === "dreamcap") {
    const cap = colorForBlock(BlockId.Dreamcap, "#8268d8");
    return [
      box("dream-stem", "stem", [0.34, 1.05, 0.34], [0, 0.525, 0], "#c9bbdb"),
      box("dream-cap-core", "cap", [1.3, 0.34, 1.05], [0, 1.12, 0], cap, [0, 0.08, 0.02], true),
      box("dream-cap-crown", "cap", [0.88, 0.32, 0.76], [-0.08, 1.37, 0.02], "#9f88ef", [0, 0.08, -0.04], true),
      box("dream-gills", "gill", [0.88, 0.08, 0.72], [0, 0.93, 0], "#e1d3f2", [0, 0.08, 0.02], true),
      box("satellite-stem", "stem", [0.2, 0.54, 0.2], [0.62, 0.27, 0.35], "#c9bbdb"),
      box("satellite-cap", "cap", [0.58, 0.22, 0.5], [0.62, 0.61, 0.35], "#6d56c2", [0.06, -0.12, 0], true),
      box("dream-spot-a", "cap-mark", [0.15, 0.06, 0.15], [-0.32, 1.56, -0.2], "#f0eaff", [0, 0.08, -0.04], true),
      box("dream-spot-b", "cap-mark", [0.12, 0.06, 0.12], [0.28, 1.54, 0.14], "#f0eaff", [0, 0.08, -0.04], true),
    ];
  }
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
  <text x="28" y="43" fill="#e5bd68" font-family="ui-sans-serif, system-ui, sans-serif" font-size="26" font-weight="900" letter-spacing="1.8">BLOCKWILD PLANT COMPENDIUM - V1.4</text>
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
