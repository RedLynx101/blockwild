import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  ATLANTIAN_ROLE_PRESENTATION,
  SUGARCOURT_ROLE_PRESENTATION,
  sentientPortraitPath,
} from "../app/game/HearthroadsPanels.tsx";
import {
  ATLANTIAN_ORDER,
  BUTTERFLY_ORDER,
  CORE_MOB_ORDER,
  MOB_DEFS,
  SUGARCOURT_ORDER,
  type CoreMobKind,
} from "../app/game/mobs.ts";
import {
  createButterflyInspectionSpec,
  createMobInspectionSpecs,
  renderModelPortrait,
} from "../scripts/render-models.ts";

const PUBLIC_ROOT = path.resolve("public");
const NEWCOMER_KINDS = [
  "sakurakit",
  "sunwash-crab",
  "tidewing-gull",
  "glassfin",
  "lanternjaw",
  "abyss-skater",
  "dreadcoil",
  "tidepup",
  "worldshell-leviathan",
  "aetherbell-larva",
  "aetherbell-leviathan",
  ...ATLANTIAN_ORDER,
] as const satisfies readonly CoreMobKind[];

const CANDY_CREATURE_KINDS = [
  "taffy-hound",
  "praline-cat",
  "sprinklebug",
  "taffalo",
  "syrupfin",
  ...SUGARCOURT_ORDER,
] as const satisfies readonly CoreMobKind[];

function localAssetPath(url: string) {
  assert.match(url, /^\/creatures\/[a-z0-9-]+\.svg$/u);
  const resolved = path.resolve(PUBLIC_ROOT, url.slice(1));
  assert.equal(resolved.startsWith(`${PUBLIC_ROOT}${path.sep}`), true);
  return resolved;
}

async function readNonemptySvg(url: string) {
  const assetPath = localAssetPath(url);
  const metadata = await stat(assetPath);
  assert.ok(metadata.size > 1_000, `${url} should be a substantive generated model portrait`);
  const svg = await readFile(assetPath, "utf8");
  assert.match(svg, /^<\?xml version="1\.0" encoding="UTF-8"\?>/u);
  assert.match(svg, /front three-quarter model portrait/u);
  assert.match(svg, /<polygon/u);
  return svg;
}

test("every v0.7 newcomer bestiary URL resolves to its current production render", async () => {
  const voxelGameSource = await readFile(path.resolve("app/game/VoxelGame.tsx"), "utf8");
  const portraitRoute = voxelGameSource.split(/\r?\n/u).find((line) => line.includes("const creaturePortraitPath"));
  assert.ok(portraitRoute?.includes("`/creatures/${"), "the Bestiary should keep using local generated creature assets");
  assert.ok(portraitRoute?.includes("kind}.svg`"), "non-butterfly Bestiary URLs should be keyed by MobKind");

  const productionSpecs = new Map(createMobInspectionSpecs().map((spec) => [spec.id, spec]));
  for (const kind of NEWCOMER_KINDS) {
    const url = `/creatures/${kind}.svg`;
    const deployedSvg = await readNonemptySvg(url);
    const spec = productionSpecs.get(kind);
    assert.ok(spec, `${kind} should remain in the production model catalog`);
    assert.equal(
      deployedSvg,
      renderModelPortrait(spec),
      `${url} is stale; regenerate public portraits with npm run models:render`,
    );
  }
});

test("all six Atlantian portrait routes resolve to nonempty role-correct assets", async () => {
  const roles = Object.keys(ATLANTIAN_ROLE_PRESENTATION).sort();
  assert.deepEqual(roles, [...ATLANTIAN_ORDER].sort());

  for (const profession of ATLANTIAN_ORDER) {
    const configuredUrl = ATLANTIAN_ROLE_PRESENTATION[profession].portraitUrl;
    assert.equal(sentientPortraitPath("atlantians", profession), configuredUrl);
    assert.equal(configuredUrl, `/creatures/${profession}.svg`);
    const svg = await readNonemptySvg(configuredUrl);
    assert.match(svg, new RegExp(`<title[^>]*>${MOB_DEFS[profession].name} front three-quarter model portrait</title>`, "u"));
  }
});

test("every Sugarplum fauna and Sugarcourt role portrait is the current production render", async () => {
  const productionSpecs = new Map(createMobInspectionSpecs().map((spec) => [spec.id, spec]));
  for (const kind of CANDY_CREATURE_KINDS) {
    const url = `/creatures/${kind}.svg`;
    const deployedSvg = await readNonemptySvg(url);
    const spec = productionSpecs.get(kind);
    assert.ok(spec, `${kind} should remain in the production model catalog`);
    assert.equal(deployedSvg, renderModelPortrait(spec), `${url} is stale; regenerate the public candy portraits`);
  }
});

test("all seven Sugarcourt dialogue routes resolve to role-correct portraits", async () => {
  const roles = Object.keys(SUGARCOURT_ROLE_PRESENTATION).sort();
  assert.deepEqual(roles, [...SUGARCOURT_ORDER].sort());

  for (const profession of SUGARCOURT_ORDER) {
    const configuredUrl = SUGARCOURT_ROLE_PRESENTATION[profession].portraitUrl;
    assert.equal(sentientPortraitPath("sugarcourt", profession), configuredUrl);
    assert.equal(configuredUrl, `/creatures/${profession}.svg`);
    const svg = await readNonemptySvg(configuredUrl);
    assert.match(svg, new RegExp(`<title[^>]*>${MOB_DEFS[profession].name} front three-quarter model portrait</title>`, "u"));
  }
});

test("Bonbonwing uses its four-panel production model in the public Bestiary portrait", async () => {
  const url = "/creatures/butterfly-bonbonwing.svg";
  const deployedSvg = await readNonemptySvg(url);
  const spec = createButterflyInspectionSpec("bonbonwing");
  assert.equal(deployedSvg, renderModelPortrait(spec), `${url} is stale; regenerate the public candy portraits`);
  assert.equal(spec.boxes.filter((box) => box.id.includes("wing-panel")).length, 4);
});

test("the public creature sheet indexes the complete production catalog", async () => {
  const sheet = await readFile(path.resolve(PUBLIC_ROOT, "creatures", "blockwild-creatures.svg"), "utf8");
  assert.match(sheet, /BLOCKWILD FIELD GUIDE/u);
  assert.match(sheet, new RegExp(`${CORE_MOB_ORDER.length + BUTTERFLY_ORDER.length} specimens`, "u"));
  for (const kind of [...NEWCOMER_KINDS, ...CANDY_CREATURE_KINDS, "bonbonwing"] as const) {
    assert.ok(sheet.includes(MOB_DEFS[kind].name), `${kind} is missing from the public field guide`);
  }
});
