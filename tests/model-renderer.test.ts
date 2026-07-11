import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import * as THREE from "three";
import { BUTTERFLY_ANTENNA_CONTRACT, FACTION_WEAPON_CONTRACTS, RATTLEKIN_CLUB_CONTRACT, ZOMBIE_EYE_COLOR } from "../app/game/model-specs.ts";
import { ATLANTIAN_ORDER, BUTTERFLY_ORDER, CORE_MOB_ORDER, GOBLIN_ORDER, HOBBIT_ORDER, MOB_DEFS, SENTIENT_MOB_ORDER } from "../app/game/mobs.ts";
import { createMobVisual, createSentientLodVisual, SENTIENT_LOD_MAX_MESHES } from "../app/game/mob-models.ts";
import {
  buildInspectionSpecs,
  createButterflyInspectionSpec,
  createMobInspectionSpecs,
  createPlayerInspectionSpecs,
  createSkeletonArrowInspectionSpec,
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
    assert.ok(spec.boxes.length >= 10, "player cosmetics and held equipment may add production boxes");
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
    assert.equal(spec.boxes.length, kind === "bonbonwing" ? 9 : 7);
    assert.equal(spec.boxes.find((box) => box.id === `${kind}-body`)?.color, MOB_DEFS[kind].colors[1]);
    assert.equal(spec.boxes.find((box) => box.id === `${kind}-left-wing-panel`)?.color, MOB_DEFS[kind].colors[0]);
    const body = spec.boxes.find((box) => box.id === `${kind}-body`)!;
    const bodyFront = body.position[2] - body.size[2] / 2;
    const bodyTop = body.position[1] + body.size[1] / 2;
    for (const side of ["left", "right"] as const) {
      const antenna = spec.boxes.find((box) => box.id === `${kind}-${side}-antenna`)!;
      const tipBox = spec.boxes.find((box) => box.id === `${kind}-${side}-antenna-tip`)!;
      const rotation = new THREE.Euler(...(antenna.rotation ?? [0, 0, 0]), "XYZ");
      const halfAxis = new THREE.Vector3(0, 0, antenna.size[2] / 2).applyEuler(rotation);
      const center = new THREE.Vector3(...antenna.position);
      const root = center.clone().add(halfAxis);
      const tip = center.clone().sub(halfAxis);
      assert.ok(root.z >= bodyFront - 0.01 && root.z <= bodyFront + 0.02, `${kind} ${side} antenna root must overlap the head/body face`);
      assert.ok(root.y <= bodyTop + 0.01 && root.y >= body.position[1], `${kind} ${side} antenna root must attach near the body top`);
      assert.ok(tip.y > bodyTop + 0.04, `${kind} ${side} antenna tip must rise above the body`);
      assert.ok(tip.z < bodyFront - 0.1, `${kind} ${side} antenna tip must extend forward`);
      assert.ok(tip.distanceTo(new THREE.Vector3(...tipBox.position)) < 0.002, `${kind} ${side} antenna tip cap must stay connected`);
    }
    assert.equal(inspectGrounding(spec).contact, "reference", "airborne variants should show the ground without claiming foot contact");
  }
  assert.ok(BUTTERFLY_ANTENNA_CONTRACT.forwardTiltRadians > 0);
});

test("the inspector captures every canonical production mob visual", () => {
  const specs = createMobInspectionSpecs();
  assert.deepEqual(specs.map((spec) => spec.id), CORE_MOB_ORDER);
  for (const spec of specs) {
    assert.equal(spec.inspection?.source, "MobVisual");
    assert.equal(spec.inspection?.mob, spec.id);
    assert.ok(spec.boxes.length >= 8, `${spec.id} should retain its production detail geometry`);
    const definition = MOB_DEFS[spec.id as keyof typeof MOB_DEFS];
    assert.equal(inspectGrounding(spec).contact, spec.id === "glowmoth" || definition.flying || definition.aquatic ? "reference" : "exact");
  }
  const ridgeback = specs.find((spec) => spec.id === "ridgeback")!;
  const body = ridgeback.boxes.find((box) => box.id === "ridgeback-body")!;
  const plates = ridgeback.boxes.filter((box) => box.id.startsWith("ridgeback-plate-"));
  const bodyTop = body.position[1] + body.size[1] / 2;
  assert.equal(plates.length, 6);
  for (const plate of plates) assert.ok(Math.abs(plate.position[1] - plate.size[1] / 2 - bodyTop) < 1e-7, `${plate.id} floats above the back`);
  const rattlekin = specs.find((spec) => spec.id === "rattlekin")!;
  const clubHandle = rattlekin.boxes.find((box) => box.id === "rattlekin-club-handle")!;
  const clubHead = rattlekin.boxes.find((box) => box.id === "rattlekin-club-head")!;
  assert.equal(RATTLEKIN_CLUB_CONTRACT.forwardAxis, "-z");
  assert.ok(clubHandle.size[2] > clubHandle.size[1] * 4, "Rattlekin club handle must lie forward, not hang vertically");
  assert.ok(clubHead.position[2] < clubHandle.position[2] - 0.35, "Rattlekin club head must project ahead of the grip");
  const zombie = specs.find((spec) => spec.id === "zombie")!;
  for (const eyeId of ["zombie-left-eye", "zombie-right-eye"]) {
    const eye = zombie.boxes.find((box) => box.id === eyeId)!;
    assert.equal(eye.color, Number.parseInt(ZOMBIE_EYE_COLOR.slice(1), 16), `${eyeId} must be pure white`);
    assert.equal(eye.emissive, true);
  }
  const skeleton = specs.find((spec) => spec.id === "skeleton")!;
  const nockedArrow = skeleton.boxes.find((box) => box.id === "skeleton-nocked-arrow")!;
  const bowGrip = skeleton.boxes.find((box) => box.id === "skeleton-bow-grip")!;
  assert.ok(nockedArrow.size[2] > nockedArrow.size[1] * 10, "Skeleton arrow must remain aligned along forward Z");
  assert.ok(nockedArrow.position[2] < bowGrip.position[2], "Skeleton arrowhead direction must remain in front of the bow");
  const hammerguard = specs.find((spec) => spec.id === "hobbit-hammer-guard")!;
  const hammerHandle = hammerguard.boxes.find((box) => box.id === "hobbit-hammer-guard-hammer-handle")!;
  const hammerHead = hammerguard.boxes.find((box) => box.id === "hobbit-hammer-guard-hammer-head")!;
  assert.equal(FACTION_WEAPON_CONTRACTS.hammer.forwardAxis, "-z");
  assert.ok(hammerHandle.size[2] > hammerHandle.size[1] * 8);
  assert.ok(hammerHead.position[2] < hammerHandle.position[2] - 0.4, "guard hammer must project naturally ahead of the hands");
  const boltwatch = specs.find((spec) => spec.id === "hobbit-crossbow-guard")!;
  const crossbowStock = boltwatch.boxes.find((box) => box.id === "hobbit-crossbow-guard-crossbow-stock")!;
  const loadedBolt = boltwatch.boxes.find((box) => box.id === "hobbit-crossbow-guard-loaded-bolt")!;
  assert.ok(crossbowStock.size[2] > crossbowStock.size[0] * 7);
  assert.ok(loadedBolt.size[2] > loadedBolt.size[0] * 20);
  const spearwarden = specs.find((spec) => spec.id === "goblin-spear-guard")!;
  const spearShaft = spearwarden.boxes.find((box) => box.id === "goblin-spear-guard-spear-shaft")!;
  const spearHead = spearwarden.boxes.find((box) => box.id === "goblin-spear-guard-spear-head")!;
  assert.ok(spearShaft.size[2] > spearShaft.size[0] * 18);
  assert.ok(spearHead.position[2] < spearShaft.position[2] - 0.9);
  for (const kind of [...HOBBIT_ORDER, ...GOBLIN_ORDER]) {
    const npc = specs.find((spec) => spec.id === kind)!;
    assert.equal(MOB_DEFS[kind].sentient, true);
    assert.ok(npc.boxes.some((box) => box.id.startsWith(`${kind}-left-eye`)));
    assert.ok(npc.boxes.length >= 16, `${kind} should retain role-readable production detail`);
  }
  const shark = specs.find((spec) => spec.id === "deepwater-shark")!;
  assert.ok(shark.boxes.some((box) => box.id === "deepwater-shark-dorsal-fin"));
  assert.ok(shark.boxes.filter((box) => box.id.includes("tooth")).length >= 6);
  const portrait = renderModelPortrait(ridgeback);
  assert.match(portrait, /front three-quarter model portrait/);
  assert.match(portrait, /<polygon/);
});

test("sentient middle-distance proxies preserve roles while cutting town draw calls", () => {
  let atlantianFullMeshes = 0;
  let atlantianLodMeshes = 0;
  for (const [index, kind] of SENTIENT_MOB_ORDER.entries()) {
    const full = createMobVisual(kind, 10_000 + index);
    full.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(full.visual);
    const lod = createSentientLodVisual(kind, 10_000 + index, bounds);
    let fullMeshes = 0;
    let lodMeshes = 0;
    full.visual.traverse((object) => { if (object instanceof THREE.Mesh) fullMeshes += 1; });
    lod.traverse((object) => { if (object instanceof THREE.Mesh) lodMeshes += 1; });
    assert.ok(lodMeshes >= 4 && lodMeshes <= SENTIENT_LOD_MAX_MESHES, `${kind} LOD must stay within its draw-call contract`);
    assert.equal(lod.userData.lodRole, MOB_DEFS[kind].role, `${kind} proxy must retain a role-readable marker`);
    assert.ok(fullMeshes > lodMeshes * 3, `${kind} proxy should materially reduce model work`);
    if (ATLANTIAN_ORDER.includes(kind as (typeof ATLANTIAN_ORDER)[number])) {
      atlantianFullMeshes += fullMeshes;
      atlantianLodMeshes += lodMeshes;
    }
  }
  assert.ok(atlantianLodMeshes / atlantianFullMeshes <= 0.16,
    `Atlantian role proxies should cut aggregate resident draw calls by at least 84% (${atlantianFullMeshes} to ${atlantianLodMeshes})`);
  assert.equal(26 * SENTIENT_LOD_MAX_MESHES, 130, "a maximum-size 26-resident town has a bounded 130-draw-call proxy estimate");
});

test("the inspector captures the visible Skeleton Archer projectile", () => {
  const arrow = createSkeletonArrowInspectionSpec();
  assert.equal(arrow.id, "skeleton-arrow");
  assert.equal(arrow.boxes.length, 4);
  assert.equal(arrow.boxes.some((box) => box.id === "arrow-tip"), true);
});

test("the default inspection catalog appends players and butterflies without losing legacy specs", () => {
  const specs = buildInspectionSpecs();
  const ids = new Set(specs.map((spec) => spec.id));
  assert.equal(ids.has("held-pickaxe"), true);
  assert.equal(ids.has("held-crossbow"), true);
  assert.equal(ids.has("held-spear"), true);
  assert.equal(ids.has("ridgeback"), true);
  assert.equal(ids.has("player-crouching"), true);
  assert.equal(ids.has("butterfly-fen-lantern"), true);
  assert.equal(ids.size, specs.length, "inspection IDs must remain unique for --ids filtering and manifests");
  const crossbow = specs.find((spec) => spec.id === "held-crossbow")!;
  const spear = specs.find((spec) => spec.id === "held-spear")!;
  assert.ok(crossbow.boxes.find((box) => box.id === "loaded-bolt")!.size[2] > 1, "held crossbow stays aimed along local forward -Z");
  assert.ok(spear.boxes.find((box) => box.id === "spear-shaft")!.size[2] >= 1.9, "held spear retains its long readable shaft");
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
