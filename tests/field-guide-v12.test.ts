import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { bestiaryKindsForFilter } from "../app/game/VoxelGame.tsx";
import { AQUARIUM_MOB_ORDER, MOB_DEFS, MOB_ORDER, RABBIT_ORDER, SENTIENT_MOB_ORDER } from "../app/game/mobs.ts";
import { PLANTS } from "../app/game/plants.ts";
import { renderModelPortrait } from "../scripts/render-models.ts";
import { createPlantInspectionSpecs } from "../scripts/render-plants.ts";

const PUBLIC_ROOT = path.resolve("public");

test("v1.2 creature filters keep humanoids, rabbits, and sea slugs organized", () => {
  const humanoids = bestiaryKindsForFilter("humanoids");
  const surface = bestiaryKindsForFilter("surface");
  const rabbits = bestiaryKindsForFilter("rabbits");
  const slugs = bestiaryKindsForFilter("sea-slugs");
  const aquatic = bestiaryKindsForFilter("aquatic");

  assert.deepEqual(humanoids, SENTIENT_MOB_ORDER);
  assert.deepEqual(rabbits, RABBIT_ORDER);
  const expectedSlugs = AQUARIUM_MOB_ORDER.filter((kind) => MOB_DEFS[kind].family === "sea-slug");
  assert.equal(expectedSlugs.length, 14);
  assert.deepEqual(slugs, expectedSlugs);
  for (const kind of slugs) assert.ok(aquatic.includes(kind), `${kind} should remain visible under Aquatic`);
  assert.equal(surface.some((kind) => MOB_DEFS[kind].sentient || MOB_DEFS[kind].family === "sentient"), false);
  assert.equal(surface.some((kind) => MOB_DEFS[kind].family === "rabbit"), false);
  assert.equal(new Set(bestiaryKindsForFilter("all")).size, MOB_ORDER.length);
});

test("every Plant Compendium entry uses its current generated field specimen", async () => {
  const specs = createPlantInspectionSpecs();
  assert.equal(specs.length, PLANTS.length);
  assert.deepEqual(specs.map((spec) => spec.id), PLANTS.map((plant) => plant.id));

  for (const spec of specs) {
    const asset = path.join(PUBLIC_ROOT, "plants", `${spec.id}.svg`);
    assert.ok((await stat(asset)).size > 1_000, `${spec.id} should have a substantive portrait`);
    assert.equal(await readFile(asset, "utf8"), renderModelPortrait(spec), `${spec.id} portrait is stale`);
  }
});

test("tree entries are complete generated trees rather than single block swatches", () => {
  const byId = new Map(createPlantInspectionSpecs().map((spec) => [spec.id, spec]));
  for (const plant of PLANTS.filter((entry) => entry.category === "tree")) {
    const spec = byId.get(plant.id);
    assert.ok(spec, `${plant.id} should have a plant model`);
    assert.ok(spec.boxes.some((entry) => entry.part === "trunk"), `${plant.id} should include a trunk`);
    assert.ok(spec.boxes.filter((entry) => entry.part === "leaves").length >= 4, `${plant.id} should include a full crown`);
    assert.ok(Math.max(...spec.boxes.map((entry) => entry.position[1] + entry.size[1] / 2)) >= 3.5, `${plant.id} should render as a complete tree`);
  }
});

test("v1.2 field-guide contact sheets cover the complete stable rosters", async () => {
  const creatureSheet = await readFile(path.join(PUBLIC_ROOT, "creatures", "blockwild-creatures.svg"), "utf8");
  const plantSheet = await readFile(path.join(PUBLIC_ROOT, "plants", "blockwild-plants.svg"), "utf8");
  assert.match(creatureSheet, /BLOCKWILD FIELD GUIDE · V1\.3/u);
  assert.match(creatureSheet, new RegExp(`${MOB_ORDER.length} specimens`, "u"));
  for (const kind of ["meadow-cottontail", "chocolate-bunny", "sunset-sea-slug", "moonlace-sea-slug", "pocket-goldfish"] as const) {
    assert.ok(creatureSheet.includes(MOB_DEFS[kind].name), `${kind} should be on the creature sheet`);
  }
  assert.match(plantSheet, /BLOCKWILD PLANT COMPENDIUM - V1\.4/u);
  assert.match(plantSheet, new RegExp(`${PLANTS.length} plants`, "u"));
  for (const plant of PLANTS) assert.ok(plantSheet.includes(plant.name), `${plant.id} should be on the plant sheet`);
});

test("the field-guide UI routes plant entries to local generated portraits", async () => {
  const source = await readFile(path.resolve("app/game/VoxelGame.tsx"), "utf8");
  assert.match(source, /const plantPortraitPath = \(plantId: string\) => `\/plants\/\$\{plantId\}\.svg`;/u);
  assert.match(source, /FULL TREE EXAMPLE/u);
});
