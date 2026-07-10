import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { BUTTERFLY_ORDER, CORE_MOB_ORDER, MOB_DEFS } from "../app/game/mobs.ts";
import {
  buildInspectionSpecs,
  createButterflyInspectionSpec,
  createMobInspectionSpecs,
  createPlayerInspectionSpecs,
  inspectGrounding,
  renderModelPortrait,
  renderModelPortraits,
  renderModelInspection,
} from "../scripts/render-models.ts";

test("the inspector captures all four production player poses on the ground plane", () => {
  const specs = createPlayerInspectionSpecs();
  assert.deepEqual(specs.map((spec) => spec.id), ["player-standing", "player-crouching", "player-running", "player-mining"]);
  for (const spec of specs) {
    assert.equal(spec.category, "player");
    assert.equal(spec.inspection?.source, "BlockPlayerModel");
    assert.equal(spec.boxes.length, 10);
    assert.ok((spec.groundContactBoxIds?.length ?? 0) >= 1);
    const grounding = inspectGrounding(spec);
    assert.equal(grounding.contact, "exact");
    assert.ok(Math.abs(grounding.groundDelta) < 1e-7);
  }
  const running = specs.find((spec) => spec.id === "player-running")!;
  const leftLeg = running.boxes.find((box) => box.id === "left-leg-block")!;
  const rightLeg = running.boxes.find((box) => box.id === "right-leg-block")!;
  assert.ok((leftLeg.rotation?.[0] ?? 0) * (rightLeg.rotation?.[0] ?? 0) < 0, "running legs should visibly counter-swing");
  const mining = specs.find((spec) => spec.id === "player-mining")!;
  const standing = specs.find((spec) => spec.id === "player-standing")!;
  assert.notEqual(
    mining.boxes.find((box) => box.id === "right-sleeve")?.rotation?.[0],
    standing.boxes.find((box) => box.id === "right-sleeve")?.rotation?.[0],
    "the mining sheet must preserve the production arm stroke",
  );
});

test("the inspector includes every butterfly species with runtime dimensions and colors", () => {
  for (const kind of BUTTERFLY_ORDER) {
    const spec = createButterflyInspectionSpec(kind);
    assert.equal(spec.id, `butterfly-${kind}`);
    assert.equal(spec.inspection?.source, "ButterflySystem");
    assert.equal(spec.inspection?.variant, kind);
    assert.equal(spec.boxes.length, 5);
    assert.equal(spec.boxes.find((box) => box.id === "body")?.color, MOB_DEFS[kind].colors[1]);
    assert.equal(spec.boxes.find((box) => box.id === "left-wing")?.color, MOB_DEFS[kind].colors[0]);
    assert.equal(inspectGrounding(spec).contact, "reference", "airborne variants should show the ground without claiming foot contact");
  }
});

test("the inspector captures all eight canonical production mob visuals", () => {
  const specs = createMobInspectionSpecs();
  assert.deepEqual(specs.map((spec) => spec.id), CORE_MOB_ORDER);
  for (const spec of specs) {
    assert.equal(spec.inspection?.source, "MobVisual");
    assert.equal(spec.inspection?.mob, spec.id);
    assert.ok(spec.boxes.length >= 8, `${spec.id} should retain its production detail geometry`);
    assert.equal(inspectGrounding(spec).contact, spec.id === "glowmoth" ? "reference" : "exact");
  }
  const ridgeback = specs.find((spec) => spec.id === "ridgeback")!;
  const body = ridgeback.boxes.find((box) => box.id === "ridgeback-body")!;
  const plates = ridgeback.boxes.filter((box) => box.id.startsWith("ridgeback-plate-"));
  const bodyTop = body.position[1] + body.size[1] / 2;
  assert.equal(plates.length, 6);
  for (const plate of plates) assert.ok(Math.abs(plate.position[1] - plate.size[1] / 2 - bodyTop) < 1e-7, `${plate.id} floats above the back`);
  const portrait = renderModelPortrait(ridgeback);
  assert.match(portrait, /front three-quarter model portrait/);
  assert.match(portrait, /<polygon/);
});

test("the default inspection catalog appends players and butterflies without losing legacy specs", () => {
  const specs = buildInspectionSpecs();
  const ids = new Set(specs.map((spec) => spec.id));
  assert.equal(ids.has("held-pickaxe"), true);
  assert.equal(ids.has("ridgeback"), true);
  assert.equal(ids.has("player-crouching"), true);
  assert.equal(ids.has("butterfly-fen-lantern"), true);
  assert.equal(ids.size, specs.length, "inspection IDs must remain unique for --ids filtering and manifests");
});

test("render output includes screenshots plus a machine-readable grounding manifest", async () => {
  const out = await mkdtemp(path.join(tmpdir(), "blockwild-model-renderer-"));
  try {
    const specs = [createPlayerInspectionSpecs()[2], createButterflyInspectionSpec("meadowwing")];
    const result = await renderModelInspection({ out, columns: 2, views: ["iso"], specs });
    const manifest = JSON.parse(await readFile(result.manifestPath, "utf8")) as typeof result.manifest;
    assert.equal(manifest.renderer, "blockwild-model-inspector");
    assert.deepEqual(manifest.specs.map((spec) => spec.id), ["player-running", "butterfly-meadowwing"]);
    assert.equal(manifest.specs[0].contact, "exact");
    assert.equal(manifest.specs[1].contact, "reference");
    assert.equal(manifest.outputs.some((output) => output.format === "svg" && output.view === "iso"), true);
    assert.equal(result.files.some((file) => file.endsWith("blockwild-models-iso.svg")), true);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});

test("portrait export writes individual creature renders and a clean contact sheet", async () => {
  const out = await mkdtemp(path.join(tmpdir(), "blockwild-creature-portraits-"));
  try {
    const specs = createMobInspectionSpecs().slice(0, 2);
    const result = await renderModelPortraits({ out, columns: 2, specs });
    assert.deepEqual(result.specs, ["mossling", "ridgeback"]);
    assert.equal(result.files.some((file) => file.endsWith("mossling.svg")), true);
    const sheet = await readFile(result.sheetPath, "utf8");
    assert.match(sheet, /BLOCKWILD FIELD GUIDE/);
    assert.match(sheet, /2 specimens/);
  } finally {
    await rm(out, { recursive: true, force: true });
  }
});
