import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BLOCKS, BlockId, type BlockId as BlockIdType } from "../app/game/data";
import { auditVisualTheme, type BlockPlacementEvidence, type VisualThemeAudit } from "../app/three-compat/visual-theme-audit";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return entry.isFile() && /\.(?:ts|tsx)$/u.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

function countToken(source: string, token: string) {
  let count = 0;
  let cursor = 0;
  while ((cursor = source.indexOf(token, cursor)) >= 0) {
    count += 1;
    cursor += token.length;
  }
  return count;
}

export async function collectBlockPlacementEvidence(root = process.cwd()) {
  const gameRoot = path.join(root, "app", "game");
  const files = await sourceFiles(gameRoot);
  const generatorSources: string[] = [];
  const structureSources: string[] = [];
  for (const file of files) {
    const relative = path.relative(gameRoot, file).replaceAll("\\", "/");
    const source = await readFile(file, "utf8");
    if (/(?:world|biome|ocean|underground|candy|dragon-world|ecology|farming)/u.test(relative) && relative !== "data.ts") generatorSources.push(source);
    if (/(?:structure|settlement|poi|dungeon|adventure|faction|guild|culture|hearthroads)/u.test(relative)) structureSources.push(source);
  }
  const dataSource = await readFile(path.join(gameRoot, "data.ts"), "utf8");
  const recipeSource = dataSource.slice(dataSource.indexOf("export const RECIPES"));
  const evidence: Partial<Record<BlockIdType, BlockPlacementEvidence>> = {};
  for (const raw of Object.keys(BLOCKS)) {
    const id = Number(raw) as BlockIdType;
    const name = String(BlockId[id]);
    const token = `BlockId.${name}`;
    evidence[id] = {
      natural: generatorSources.reduce((sum, source) => sum + countToken(source, token), 0),
      structure: structureSources.reduce((sum, source) => sum + countToken(source, token), 0),
      recipe: countToken(recipeSource, token),
    };
  }
  return evidence;
}

function markdown(report: VisualThemeAudit) {
  const familyRows = [...new Set(report.blocks.map((row) => row.family))].sort().map((family) => {
    const blocks = report.blocks.filter((row) => row.family === family);
    return `| ${family} | ${blocks.length} | ${blocks.filter((row) => row.hasDirectionalFaces).length} | ${blocks.reduce((sum, row) => sum + row.warnings.length, 0)} | ${blocks.reduce((sum, row) => sum + row.violations.length, 0)} |`;
  });
  const creatureWarnings = report.creatures.filter((row) => row.warnings.length || row.violations.length).map((row) => `| ${row.name} | ${row.style} | ${row.bodyPlan} | ${row.meshes} | ${row.triangles} | ${row.faceParts} | ${row.terrainDelta ?? "n/a"} | ${[...row.violations, ...row.warnings].map((issue) => issue.code).join(", ")} |`);
  const blockWarnings = report.blocks.filter((row) => row.warnings.length || row.violations.length).map((row) => `| ${row.id} | ${row.name} | ${row.family} | ${row.top}/${row.side}/${row.bottom} | ${row.layer} | ${row.placements.natural}/${row.placements.structure}/${row.placements.recipe} | ${[...row.violations, ...row.warnings].map((issue) => issue.code).join(", ")} |`);
  return `# Blockwild Visual Theme Audit\n\n` +
    `Generated: ${report.generatedAt}\n\n` +
    `Theme: **${report.theme.thesis}** · creatures: **${report.theme.creatureLanguage}** · world: **${report.theme.worldLanguage}**\n\n` +
    `## Release totals\n\n` +
    `- Creatures: ${report.totals.creatures}; warnings: ${report.totals.creatureWarnings}; violations: ${report.totals.creatureViolations}.\n` +
    `- Blocks: ${report.totals.blocks}; families: ${report.totals.blockFamilies}; warnings: ${report.totals.blockWarnings}; violations: ${report.totals.blockViolations}.\n\n` +
    `Warnings identify deliberate future polish opportunities. Violations fail the release gate.\n\n` +
    `## Block families\n\n| Family | Blocks | Directional faces | Warnings | Violations |\n|---|---:|---:|---:|---:|\n${familyRows.join("\n")}\n\n` +
    `## Creature review queue\n\n| Creature | Style | Body plan | Meshes | Triangles | Face parts | Terrain delta | Findings |\n|---|---|---|---:|---:|---:|---:|---|\n${creatureWarnings.join("\n") || "| — | — | — | 0 | 0 | 0 | — | None |"}\n\n` +
    `## Block review queue\n\n| ID | Block | Family | Top/side/bottom | Layer | Natural/structure/recipe refs | Findings |\n|---:|---|---|---|---|---|---|\n${blockWarnings.join("\n") || "| — | — | — | — | — | — | None |"}\n`;
}

export async function writeVisualThemeAudit(options: Readonly<{
  root?: string;
  outDir?: string;
  strict?: boolean;
}> = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const outDir = path.resolve(root, options.outDir ?? "output/audits/visual-theme");
  const placements = await collectBlockPlacementEvidence(root);
  const report = auditVisualTheme({ placements });
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "visual-theme-audit.json");
  const markdownPath = path.join(outDir, "visual-theme-audit.md");
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, markdown(report), "utf8");
  if (options.strict && (report.totals.creatureViolations || report.totals.blockViolations)) {
    throw new Error(`Visual-theme gate failed: ${report.totals.creatureViolations} creature and ${report.totals.blockViolations} block violations.`);
  }
  return { report, jsonPath, markdownPath };
}

function valueAfter(argv: readonly string[], flag: string) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : undefined;
}

async function main() {
  const argv = process.argv.slice(2);
  const result = await writeVisualThemeAudit({
    outDir: valueAfter(argv, "--out"),
    strict: argv.includes("--strict"),
  });
  process.stdout.write(`${JSON.stringify({
    json: result.jsonPath,
    markdown: result.markdownPath,
    totals: result.report.totals,
  }, null, 2)}\n`);
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) await main();
