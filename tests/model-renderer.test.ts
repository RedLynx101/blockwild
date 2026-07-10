import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { BUTTERFLY_ORDER, MOB_DEFS } from "../app/game/mobs.ts";
import {
  buildInspectionSpecs,
  createButterflyInspectionSpec,
  createPlayerInspectionSpecs,
  inspectGrounding,
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
