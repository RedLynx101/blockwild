import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { Item } from "../app/game/data.ts";
import { butterflyKindForBiome, butterflyWingPanelProfile, createButterflyVisual } from "../app/game/butterflies.ts";
import {
  canRideCreature,
  CREATURE_MOUNT_PROFILES,
  fishSpawnTableForHabitat,
  naturalGroupSizeForMob,
  passiveMobSpawnTableForBiome,
  SUGARPLUM_MOB_KINDS,
  usesGenericCreatureBond,
} from "../app/game/fauna.ts";
import { createMobVisual, createSentientLodVisual, SENTIENT_LOD_MAX_MESHES } from "../app/game/mob-models.ts";
import {
  BUTTERFLY_ORDER,
  CORE_MOB_ORDER,
  MOB_DEFS,
  SUGARCOURT_ORDER,
  SUGARPLUM_AQUATIC_ORDER,
  type CoreMobKind,
} from "../app/game/mobs.ts";
import { BiomeId } from "../app/game/world.ts";
import { createMobInspectionSpecs, inspectGrounding } from "../scripts/render-models.ts";

const CANDY_WORLD_MOBS = ["taffy-hound", "praline-cat", "sprinklebug", "taffalo", "syrupfin"] as const;
const SUGARCOURT_ROLE_HOOKS = {
  "sugarcourt-crown-confectioner": "sugarcourt-crown-confectioner-crown-spire-2",
  "sugarcourt-brittle-guard": "sugarcourt-brittle-guard-peppermint-pike-head",
  "sugarcourt-gumdrop-gardener": "sugarcourt-gumdrop-gardener-gumdrop-basket",
  "sugarcourt-sweetbroker": "sugarcourt-sweetbroker-scale-beam",
  "sugarcourt-kennelkeeper": "sugarcourt-kennelkeeper-paw-badge",
  "sugarcourt-sugarboiler": "sugarcourt-sugarboiler-copper-kettle-pack",
  "sugarcourt-candysmith": "sugarcourt-candysmith-candy-hammer-head",
} as const;

test("Sugarplum creatures expose complete care, habitat and faction contracts", () => {
  assert.deepEqual(SUGARPLUM_MOB_KINDS, [...CANDY_WORLD_MOBS, "bonbonwing"]);
  for (const kind of CANDY_WORLD_MOBS) {
    assert.equal(CORE_MOB_ORDER.includes(kind), true, `${kind} must use the production world-mob path`);
    assert.ok(MOB_DEFS[kind].habitat.includes("Sugar") || MOB_DEFS[kind].habitat.includes("Sugarcourt"));
    assert.ok((MOB_DEFS[kind].discoveryHint?.length ?? 0) > 20);
  }

  for (const kind of ["taffy-hound", "praline-cat"] as const) {
    const definition = MOB_DEFS[kind];
    assert.equal(definition.family, "pet");
    assert.equal(definition.persistent, true);
    assert.equal(definition.factionAffinity, "sugarcourt");
    assert.equal(definition.tameRequiresUnaligned, true);
    assert.equal(definition.tameable, true);
    assert.equal(definition.breedable, true);
    assert.equal(definition.captureItem, Item.CaptureOrb);
    assert.equal(usesGenericCreatureBond(kind), true);
  }
  assert.equal(MOB_DEFS.syrupfin.liquidHabitat, "syrup");
  assert.deepEqual(SUGARPLUM_AQUATIC_ORDER, ["syrupfin"]);
  assert.equal(MOB_DEFS.bonbonwing.captureItem, Item.CaptureOrb);
  assert.equal(BUTTERFLY_ORDER.includes("bonbonwing"), true);
});

test("all seven Sugarcourt professions are sentient, role-distinct settlement mobs", () => {
  assert.deepEqual(SUGARCOURT_ORDER, [
    "sugarcourt-crown-confectioner", "sugarcourt-gumdrop-gardener", "sugarcourt-sugarboiler", "sugarcourt-candysmith",
    "sugarcourt-sweetbroker", "sugarcourt-kennelkeeper", "sugarcourt-brittle-guard",
  ]);
  for (const kind of SUGARCOURT_ORDER) {
    const definition = MOB_DEFS[kind];
    assert.equal(CORE_MOB_ORDER.includes(kind), true);
    assert.equal(definition.sentient, true);
    assert.equal(definition.faction, "sugarcourt");
    assert.equal(definition.culture, "sugarcourt");
    assert.equal(definition.family, "sentient");
    assert.equal(definition.persistent, true);
    assert.ok(definition.role);
    assert.ok((definition.profession?.length ?? 0) > 5);
    assert.ok((definition.tradeSpecialty?.length ?? 0) > 12);
    assert.ok(definition.habitat.includes("Sugar") || definition.habitat.includes("Bonbon"));
  }
});

test("Sugarplum ambient tables exclude village pets and keep syrup fauna isolated", () => {
  const surface = passiveMobSpawnTableForBiome(BiomeId.SugarplumVale);
  assert.equal(surface.some(([kind]) => kind === "sprinklebug"), true);
  assert.equal(surface.some(([kind]) => kind === "taffalo"), true);
  assert.equal(surface.some(([kind]) => kind === "taffy-hound" || kind === "praline-cat"), false, "aligned pets are settlement-only");
  assert.deepEqual(fishSpawnTableForHabitat("syrup-pond"), [["syrupfin", 1]]);
  assert.equal(fishSpawnTableForHabitat("ocean").some(([kind]) => kind === "syrupfin"), false);
  assert.equal(fishSpawnTableForHabitat("river").some(([kind]) => kind === "syrupfin"), false);
  assert.equal(naturalGroupSizeForMob("sprinklebug", 0), 3);
  assert.equal(naturalGroupSizeForMob("sprinklebug", 0.9999), 7);
  assert.equal(naturalGroupSizeForMob("taffalo", 0), 2);
  assert.equal(naturalGroupSizeForMob("taffalo", 0.9999), 5);
  assert.equal(naturalGroupSizeForMob("syrupfin", 0), 4);
  assert.equal(naturalGroupSizeForMob("syrupfin", 0.9999), 8);
});

test("Taffalo uses the reusable adult, ownership and saddle mount contract", () => {
  const profile = CREATURE_MOUNT_PROFILES.taffalo;
  assert.equal(MOB_DEFS.taffalo.rideable, true);
  assert.equal(profile.kind, "taffalo");
  assert.equal(profile.landSpeed, 4.1);
  assert.equal(profile.waterSpeed, 0.75);
  assert.equal(profile.cargoChestLimit, 0);
  assert.equal(usesGenericCreatureBond("taffalo"), true);
  const ready = { kind: "taffalo" as const, tamed: true, ownerId: "keeper", riderId: "keeper", saddled: true, baby: false, aligned: false };
  assert.equal(canRideCreature(ready), true);
  assert.equal(canRideCreature({ ...ready, tamed: false }), false);
  assert.equal(canRideCreature({ ...ready, saddled: false }), false);
  assert.equal(canRideCreature({ ...ready, riderId: "stranger" }), false);
  assert.equal(canRideCreature({ ...ready, baby: true }), false);
});

test("Sugarplum production models are detailed, grounded and expose progression hooks", () => {
  const specs = new Map(createMobInspectionSpecs().map((spec) => [spec.id, spec]));
  for (const kind of ["taffy-hound", "praline-cat", "sprinklebug", "taffalo"] as const) {
    const spec = specs.get(kind)!;
    assert.ok(spec.boxes.length >= 12, `${kind} should have a readable production silhouette`);
    assert.equal(inspectGrounding(spec).contact, "exact", `${kind} must touch the runtime ground plane exactly`);
  }
  assert.equal(inspectGrounding(specs.get("syrupfin")!).contact, "reference");

  const hound = createMobVisual("taffy-hound", 11).visual;
  const cat = createMobVisual("praline-cat", 12).visual;
  const taffalo = createMobVisual("taffalo", 13).visual;
  assert.equal(hound.getObjectByName("taffy-hound-faction-collar")?.visible, false);
  assert.equal(cat.getObjectByName("praline-cat-faction-bell")?.visible, false);
  assert.equal(taffalo.getObjectByName("taffalo-saddle")?.visible, false);
  assert.equal(taffalo.getObjectByName("taffalo-left-marshmallow-ankle")?.parent, taffalo.getObjectByName("taffalo-rear-left-leg-pivot"));
  assert.equal(taffalo.getObjectByName("taffalo-right-marshmallow-ankle")?.parent, taffalo.getObjectByName("taffalo-rear-right-leg-pivot"));
  assert.deepEqual(taffalo.userData.saddleAnchor, [0, 0.83, 0.08]);
});

test("Sugarcourt production and LOD models retain readable profession silhouettes", () => {
  const specs = new Map(createMobInspectionSpecs().map((spec) => [spec.id, spec]));
  for (const kind of SUGARCOURT_ORDER) {
    const spec = specs.get(kind)!;
    assert.ok(spec.boxes.length >= 24, `${kind} should remain detailed at portrait distance`);
    assert.equal(inspectGrounding(spec).contact, "exact");
    const production = createMobVisual(kind, 100).visual;
    assert.ok(production.getObjectByName(SUGARCOURT_ROLE_HOOKS[kind]), `${kind} is missing its role-readable model hook`);
    production.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(production);
    const lod = createSentientLodVisual(kind, 100, bounds);
    let meshes = 0;
    lod.traverse((object) => { if (object instanceof THREE.Mesh) meshes += 1; });
    assert.ok(meshes <= SENTIENT_LOD_MAX_MESHES);
    assert.equal(lod.userData.lodRole, MOB_DEFS[kind].role);
  }
});

test("Syrupfin side, dorsal and tail fins attach to its body", () => {
  const visual = createMobVisual("syrupfin", 22).visual;
  visual.updateMatrixWorld(true);
  const body = new THREE.Box3().setFromObject(visual.getObjectByName("syrupfin-body")!);
  for (const name of ["syrupfin-left-fin", "syrupfin-right-fin", "syrupfin-dorsal-fin", "syrupfin-tail-left", "syrupfin-tail-right"]) {
    const fin = new THREE.Box3().setFromObject(visual.getObjectByName(name)!);
    assert.equal(body.intersectsBox(fin), true, `${name} must overlap the body instead of floating`);
  }
});

test("Bonbonwing is a distinct four-panel Sugarplum butterfly", () => {
  assert.equal(butterflyKindForBiome(BiomeId.SugarplumVale, 0), "bonbonwing");
  assert.equal(butterflyKindForBiome(BiomeId.SugarplumVale, 0.999), "bonbonwing");
  assert.equal(butterflyWingPanelProfile("bonbonwing").length, 2);
  assert.equal(butterflyWingPanelProfile("meadowwing").length, 1);
  const butterfly = createButterflyVisual("bonbonwing", "sugar-audit");
  assert.equal(butterfly.leftWing.children.length, 2);
  assert.equal(butterfly.rightWing.children.length, 2);
  assert.ok(butterfly.group.getObjectByName("bonbonwing-left-wing-panel-2"));
  assert.ok(butterfly.group.getObjectByName("bonbonwing-right-wing-panel-2"));
});

test("all Sugarplum ground models remain valid CoreMobKind values", () => {
  for (const kind of CANDY_WORLD_MOBS) {
    const typed: CoreMobKind = kind;
    assert.equal(typed, kind);
  }
});
