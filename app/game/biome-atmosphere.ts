export type BiomeSurfaceMotif = "forest" | "snow" | "fen" | "savanna" | "meadow" | "jungle" | "sakura" | "sugarplum" | "glimmer";

export type BiomeSurfacePalette = Readonly<{
  top: string;
  dark: string;
  light: string;
  accent: string;
  soil: string;
  soilDark: string;
  edge: string;
}>;

export type BiomeSurfaceTextureRecipe = Readonly<{
  id: string;
  label: string;
  topTile: number;
  sideTile: number;
  motif: BiomeSurfaceMotif;
  legacy: BiomeSurfacePalette;
  current: BiomeSurfacePalette;
}>;

/**
 * Main-biome surface art. The old palettes are kept only for the release
 * comparison renderer; the current palettes are the production atlas source.
 */
export const BIOME_SURFACE_TEXTURES: readonly BiomeSurfaceTextureRecipe[] = Object.freeze([
  {
    id: "wildwood", label: "Wildwood", topTile: 0, sideTile: 1, motif: "forest",
    legacy: { top: "#65a441", dark: "#538c39", light: "#74ae50", accent: "#95bc65", soil: "#775338", soilDark: "#62452f", edge: "#66a441" },
    current: { top: "#3f793c", dark: "#295b32", light: "#63a653", accent: "#b1b95f", soil: "#63462f", soilDark: "#453324", edge: "#4d8b45" },
  },
  {
    id: "snowfield", label: "Snowfield", topTile: 16, sideTile: 17, motif: "snow",
    legacy: { top: "#e5ecea", dark: "#d0dcdd", light: "#f4f7f6", accent: "#c4d8df", soil: "#8d927f", soilDark: "#737a6c", edge: "#e9efed" },
    current: { top: "#e9f2f1", dark: "#b9ced7", light: "#ffffff", accent: "#8fb8cf", soil: "#68756e", soilDark: "#4a5854", edge: "#dbeaed" },
  },
  {
    id: "siltfen", label: "Siltfen", topTile: 28, sideTile: 29, motif: "fen",
    legacy: { top: "#5b7339", dark: "#4c6330", light: "#6f8748", accent: "#8a9654", soil: "#4a5136", soilDark: "#373d2a", edge: "#586f37" },
    current: { top: "#405d3d", dark: "#273f35", light: "#668257", accent: "#9aaa64", soil: "#3e4635", soilDark: "#293128", edge: "#506d48" },
  },
  {
    id: "sunstep", label: "Sunstep Savanna", topTile: 30, sideTile: 31, motif: "savanna",
    legacy: { top: "#aaa04f", dark: "#8f873f", light: "#b8ae5d", accent: "#c7b65f", soil: "#8b793d", soilDark: "#705f31", edge: "#aaa04f" },
    current: { top: "#9a8a3e", dark: "#665f2d", light: "#c0ae55", accent: "#e0c66b", soil: "#735332", soilDark: "#4f3d28", edge: "#ad9847" },
  },
  {
    id: "meadow", label: "Flower Meadow", topTile: 64, sideTile: 65, motif: "meadow",
    legacy: { top: "#568e43", dark: "#3d7136", light: "#79ac58", accent: "#e2c45e", soil: "#6f4f34", soilDark: "#543c2b", edge: "#5c9447" },
    current: { top: "#3e793f", dark: "#285d33", light: "#6da757", accent: "#e8ca69", soil: "#65472f", soilDark: "#483326", edge: "#4e8c49" },
  },
  {
    id: "rainveil", label: "Rainveil Jungle", topTile: 102, sideTile: 103, motif: "jungle",
    legacy: { top: "#368d51", dark: "#2d7644", light: "#4da366", accent: "#77b87a", soil: "#6a4b34", soilDark: "#503a2a", edge: "#368d51" },
    current: { top: "#257047", dark: "#164837", light: "#41965d", accent: "#77c982", soil: "#50412e", soilDark: "#332d24", edge: "#2f8050" },
  },
  {
    id: "sakurabloom", label: "Sakurabloom", topTile: 107, sideTile: 108, motif: "sakura",
    legacy: { top: "#5d994d", dark: "#4d8441", light: "#72aa60", accent: "#ec9fc5", soil: "#765747", soilDark: "#5b4338", edge: "#5d994d" },
    current: { top: "#477d4b", dark: "#2e5a3c", light: "#72a861", accent: "#f0a8c8", soil: "#665048", soilDark: "#463b38", edge: "#568c54" },
  },
  {
    id: "sugarplum", label: "Sugarplum Vale", topTile: 129, sideTile: 130, motif: "sugarplum",
    legacy: { top: "#8964bc", dark: "#7650a5", light: "#b58ad8", accent: "#f0b1d5", soil: "#76506f", soilDark: "#5b3d57", edge: "#8f6ac2" },
    current: { top: "#7757a7", dark: "#513d80", light: "#a783cf", accent: "#f3a9cf", soil: "#68475f", soilDark: "#493344", edge: "#8865b6" },
  },
  {
    id: "glimmerwood", label: "Glimmerwood", topTile: 149, sideTile: 150, motif: "glimmer",
    legacy: { top: "#315f4d", dark: "#284f42", light: "#477563", accent: "#73bfa5", soil: "#4c4658", soilDark: "#373441", edge: "#356652" },
    current: { top: "#244f46", dark: "#163b37", light: "#407b68", accent: "#8be8d0", soil: "#394054", soilDark: "#252b3b", edge: "#315f52" },
  },
]);

const BY_TILE = new Map<number, { recipe: BiomeSurfaceTextureRecipe; side: boolean }>();
for (const recipe of BIOME_SURFACE_TEXTURES) {
  BY_TILE.set(recipe.topTile, { recipe, side: false });
  BY_TILE.set(recipe.sideTile, { recipe, side: true });
}

function texelHash(seed: number, x: number, y: number) {
  let value = Math.imul(seed + x * 374761393 + y * 668265263, 1274126177);
  value ^= value >>> 13;
  value = Math.imul(value, 2246822519);
  return (value ^ (value >>> 16)) >>> 0;
}

export function biomeSurfaceRecipeForTile(tileIndex: number) {
  return BY_TILE.get(tileIndex) ?? null;
}

export function biomeSurfaceTexel(tileIndex: number, x: number, y: number, legacy = false): string | null {
  const entry = BY_TILE.get(tileIndex);
  if (!entry) return null;
  const { recipe, side } = entry;
  const palette = legacy ? recipe.legacy : recipe.current;
  const px = ((Math.floor(x) % 16) + 16) % 16;
  const py = ((Math.floor(y) % 16) + 16) % 16;
  const hash = texelHash(recipe.topTile * 97 + (side ? 43 : 11), px, py);

  if (legacy) {
    if (side) {
      if (py < 5 + (px % 3 === 0 ? 1 : 0)) return hash % 5 === 0 ? palette.light : palette.edge;
      return hash % 8 === 0 ? palette.soilDark : palette.soil;
    }
    if (hash % 11 === 0) return palette.dark;
    if (hash % 17 === 0) return palette.light;
    if (hash % 61 === 0) return palette.accent;
    return palette.top;
  }

  if (side) {
    const fringe = recipe.motif === "snow" ? 5 + (px % 5 === 0 ? 2 : px % 3 === 0 ? 1 : 0) : 4 + ((px * 5 + recipe.topTile) % 4 === 0 ? 2 : 0);
    if (py < fringe) {
      if (recipe.motif === "snow" && py === fringe - 1 && px % 5 === 0) return palette.accent;
      return hash % 7 === 0 ? palette.light : hash % 5 === 0 ? palette.dark : palette.edge;
    }
    if ((py * 3 + px * 5 + recipe.topTile) % 19 === 0) return palette.soilDark;
    if ((py + px * 7) % 29 === 0) return palette.light;
    return palette.soil;
  }

  if (hash % 13 === 0) return palette.dark;
  if (hash % 19 === 0) return palette.light;

  if (recipe.motif === "snow") {
    if ((px + py * 3) % 37 === 0 || (px * 3 + py) % 43 === 0) return palette.accent;
    if ((px === py || px + py === 15) && hash % 9 === 0) return palette.light;
  } else if (recipe.motif === "fen") {
    if ((px * 7 + py * 3) % 41 === 0) return palette.accent;
    if (py > 9 && (px + recipe.topTile) % 5 === 0) return palette.dark;
  } else if (recipe.motif === "savanna") {
    if ((px + py * 2) % 31 === 0) return palette.accent;
    if (py > 7 && (px * 2 + py) % 23 === 0) return palette.soil;
  } else if (recipe.motif === "meadow") {
    if ((px * 11 + py * 5) % 47 === 0) return palette.accent;
    if ((px * 7 + py * 13) % 59 === 0) return "#d8a7d5";
    if ((px + py * 3) % 37 === 0) return "#9dc36e";
  } else if (recipe.motif === "jungle") {
    if ((px - py + 32) % 9 === 0 && hash % 4 === 0) return palette.accent;
    if ((px + py) % 7 === 0 && hash % 5 === 0) return palette.dark;
  } else if (recipe.motif === "sakura") {
    if ((px * 5 + py * 11) % 53 === 0 || (px * 13 + py * 7) % 67 === 0) return palette.accent;
  } else if (recipe.motif === "sugarplum") {
    if ((px * 7 + py * 5) % 43 === 0) return palette.accent;
    if ((px * 11 + py * 3) % 47 === 0) return "#72bda0";
    if ((px * 13 + py * 17) % 71 === 0) return "#f2d36f";
  } else if (recipe.motif === "glimmer") {
    if ((px * 5 + py * 11) % 47 === 0 || (px * 13 + py * 3) % 61 === 0) return palette.accent;
    if ((px - py + 32) % 8 === 0 && hash % 5 === 0) return palette.light;
    if ((px + py * 2) % 29 === 0) return palette.dark;
  } else if ((px * 5 + py * 7) % 43 === 0) {
    return palette.accent;
  }
  return palette.top;
}

type AtlasPaintContext = Pick<CanvasRenderingContext2D, "fillRect" | "fillStyle">;

/** Paints one production atlas tile and returns false for unrelated tiles. */
export function paintBiomeSurfaceAtlasTile(context: AtlasPaintContext, tileIndex: number, originX: number, originY: number, tileSize = 16) {
  if (!BY_TILE.has(tileIndex)) return false;
  for (let y = 0; y < tileSize; y += 1) for (let x = 0; x < tileSize; x += 1) {
    const color = biomeSurfaceTexel(tileIndex, Math.floor((x / tileSize) * 16), Math.floor((y / tileSize) * 16));
    if (!color) continue;
    context.fillStyle = color;
    context.fillRect(originX + x, originY + y, 1, 1);
  }
  return true;
}
