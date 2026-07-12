import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  ATLANTIAN_ORDER,
  CORE_MOB_ORDER,
  MOB_DEFS,
  TIDEGLASS_AQUATIC_ORDER,
  type CoreMobKind,
} from "../app/game/mobs.ts";
import {
  attachLeviathanChest,
  bondLeviathan,
  canRideCreature,
  collectLeviathanEgg,
  CREATURE_MOUNT_PROFILES,
  createAetherbellMorphState,
  createLeviathanEgg,
  fishKindForHabitat,
  fishSpawnTableForHabitat,
  LEVIATHAN_LIFECYCLE_CONTRACT,
  leviathanEggItemCode,
  leviathanSpeciesForEggItem,
  LUMEN_TRENCH_MOB_KINDS,
  layLeviathanEggFromParents,
  naturalGroupSizeForMob,
  passiveMobKindForBiome,
  placeLeviathanEgg,
  saddleLeviathan,
  stepAetherbellMorph,
  stepLeviathanEgg,
  stepLeviathanGrowth,
} from "../app/game/fauna.ts";
import { applyOceanCreaturePose, createMobVisual } from "../app/game/mob-models.ts";
import { FISH_FIN_ATTACHMENT_OVERLAP, LEVIATHAN_VISUAL_CONTRACTS } from "../app/game/model-specs.ts";
import { BiomeId } from "../app/game/world.ts";

const SEA_UPDATE_KINDS = [
  "sunwash-crab", "tideglass-crab", "reefglide-terrapin", "tidewing-gull", "glassfin", "lanternjaw", "abyss-skater", "dreadcoil", "tidepup",
  "sakurakit", "worldshell-leviathan", "aetherbell-larva", "aetherbell-leviathan",
] as const;

test("the ocean update exposes a distinct production roster and six Atlantian roles", () => {
  for (const kind of SEA_UPDATE_KINDS) {
    assert.equal(CORE_MOB_ORDER.includes(kind), true, `${kind} must be part of the world roster`);
    assert.ok(MOB_DEFS[kind].habitat.length > 12);
    assert.ok(MOB_DEFS[kind].behavior.length > 24);
    assert.ok(MOB_DEFS[kind].discoveryHint);
  }
  assert.deepEqual(TIDEGLASS_AQUATIC_ORDER, [
    "tideglass-crab", "reefglide-terrapin", "glassfin", "lanternjaw", "abyss-skater", "dreadcoil", "tidepup", "worldshell-leviathan", "aetherbell-larva", "aetherbell-leviathan",
  ]);
  assert.equal(ATLANTIAN_ORDER.length, 6);
  for (const kind of ATLANTIAN_ORDER) {
    assert.equal(MOB_DEFS[kind].sentient, true);
    assert.equal(MOB_DEFS[kind].faction, "atlantians");
    assert.equal(MOB_DEFS[kind].culture, "atlantians");
    assert.equal(MOB_DEFS[kind].aquatic, true);
    assert.ok(MOB_DEFS[kind].role);
    assert.ok(MOB_DEFS[kind].profession);
  }
});

test("coastal and trench ecology keeps common schools common and leviathans genuinely rare", () => {
  const ocean = fishSpawnTableForHabitat("ocean");
  const deep = fishSpawnTableForHabitat("deep-ocean");
  const trench = fishSpawnTableForHabitat("lumen-trench");
  assert.equal(ocean.some(([kind]) => kind === "tidepup"), true);
  assert.equal(ocean.some(([kind]) => kind === "tideglass-crab"), true);
  for (const kind of LUMEN_TRENCH_MOB_KINDS) assert.equal(trench.some(([candidate]) => candidate === kind), true);
  const deepWeight = (kind: CoreMobKind) => deep.find(([candidate]) => candidate === kind)?.[1] ?? 0;
  assert.ok(deepWeight("glassfin") > deepWeight("dreadcoil") * 20);
  assert.ok(deepWeight("blue-mackerel") > deepWeight("worldshell-leviathan") * 40);
  assert.ok(deepWeight("aetherbell-leviathan") <= 0.002);
  assert.equal(fishKindForHabitat("deep-ocean", 0.01), "blue-mackerel");
  assert.equal(fishKindForHabitat("deep-ocean", 0.999999), "aetherbell-leviathan");
  assert.equal(naturalGroupSizeForMob("glassfin", 0), 5);
  assert.equal(naturalGroupSizeForMob("glassfin", 0.9999), 10);
  assert.equal(naturalGroupSizeForMob("worldshell-leviathan", 0.8), 1);
  assert.equal(passiveMobKindForBiome(BiomeId.Beach, 0.01), "sunwash-crab");
  assert.equal(passiveMobKindForBiome(BiomeId.SakurabloomGrove, 0.01), "sakurakit");
});

test("leviathan eggs incubate only while intact underwater and preserve exact pickup metadata", () => {
  const egg = createLeviathanEgg("aetherbell-leviathan", {
    eggId: "bell-egg-7",
    geneticSeed: 0xdeadbeef,
    laidAtTick: 120,
    incubationTicks: 60,
    parentIds: ["bell-a", "bell-b"],
    customName: "  Little   Light  ",
  });
  assert.equal(stepLeviathanEgg(egg, { elapsedTicks: 90, underwater: false }).egg?.submergedTicks, 0);
  assert.equal(stepLeviathanEgg(egg, { elapsedTicks: 90, underwater: true, intact: false }).egg?.submergedTicks, 0);
  const half = stepLeviathanEgg(egg, { elapsedTicks: 30, underwater: true });
  assert.equal(half.egg?.submergedTicks, 30);
  const item = collectLeviathanEgg(half.egg!, 999);
  const replaced = placeLeviathanEgg(JSON.parse(JSON.stringify(item)));
  assert.deepEqual(replaced, half.egg, "breaking and replacing an egg must preserve progress, genetics, parents and name");
  const hatched = stepLeviathanEgg(replaced, { elapsedTicks: 30, underwater: true });
  assert.equal(hatched.egg, null);
  assert.equal(hatched.hatchling?.kind, "aetherbell-larva");
  assert.equal(hatched.hatchling?.aquaticOnly, true);
  assert.equal(hatched.hatchling?.growthScale, 0.08);
  assert.equal(hatched.hatchling?.customName, "Little Light");
  const itemCodes = { worldshell: 204, aetherbell: 205 };
  assert.equal(leviathanEggItemCode("worldshell-leviathan", itemCodes), 204);
  assert.equal(leviathanSpeciesForEggItem(205, itemCodes), "aetherbell-leviathan");
  assert.equal(leviathanSpeciesForEggItem(999, itemCodes), null);
});

test("sub-tick simulation frames accumulate for eggs and growing leviathans", () => {
  let egg = createLeviathanEgg("worldshell-leviathan", { incubationTicks: 40 });
  for (let frame = 0; frame < 60; frame += 1) egg = stepLeviathanEgg(egg, { elapsedTicks: 1 / 3, underwater: true }).egg!;
  assert.ok(Math.abs(egg.submergedTicks - 20) < 1e-9, "60 FPS-style fractional ticks must not be rounded away");

  let baby = stepLeviathanEgg(createLeviathanEgg("worldshell-leviathan", { incubationTicks: 1 }), {
    elapsedTicks: 1,
    underwater: true,
  }).hatchling!;
  for (let frame = 0; frame < 60; frame += 1) baby = stepLeviathanGrowth(baby, { elapsedTicks: 1 / 3, underwater: true });
  assert.ok(Math.abs(baby.ageTicks - 20) < 1e-9, "natural growth must retain fractional world ticks");
});

test("aquatic babies grow from tiny larvae into morph-capable adults", () => {
  const egg = createLeviathanEgg("aetherbell-leviathan", { incubationTicks: 1 });
  let hatchling = stepLeviathanEgg(egg, { elapsedTicks: 1, underwater: true }).hatchling!;
  const stranded = stepLeviathanGrowth(hatchling, { elapsedTicks: LEVIATHAN_LIFECYCLE_CONTRACT.ticksPerDay, underwater: false });
  assert.equal(stranded.ageTicks, 0, "aquatic-only babies do not mature out of water");
  hatchling = stepLeviathanGrowth(hatchling, {
    elapsedTicks: LEVIATHAN_LIFECYCLE_CONTRACT.adultAtTicks,
    underwater: true,
  });
  assert.equal(hatchling.stage, "adult");
  assert.equal(hatchling.kind, "aetherbell-leviathan");
  assert.equal(hatchling.aquaticOnly, false);
  assert.equal(hatchling.growthScale, 1);

  let morph = createAetherbellMorphState("sea");
  morph = stepAetherbellMorph(morph, { elapsedSeconds: 1.6, underwater: false, adult: true });
  assert.equal(morph.phase, "morphing");
  assert.equal(morph.airProgress, 0.5);
  morph = stepAetherbellMorph(morph, { elapsedSeconds: 1.6, underwater: false, adult: true });
  assert.equal(morph.phase, "air");
  assert.equal(morph.medium, "air");
  morph = stepAetherbellMorph(morph, { elapsedSeconds: 99, underwater: false, adult: false });
  assert.equal(morph.phase, "sea", "larvae are always forced back to sea form");
});

test("horses, Wargs, Reedstriders and adult leviathans require tame ownership and saddles", () => {
  const kinds = ["wild-horse", "warg", "reedstrider", "worldshell-leviathan", "aetherbell-leviathan"] as const;
  for (const kind of kinds) {
    assert.equal(MOB_DEFS[kind].rideable, true);
    assert.equal(CREATURE_MOUNT_PROFILES[kind].controllable, true);
    const base = { kind, tamed: true, ownerId: "keeper", riderId: "keeper", saddled: true, baby: false, aligned: false } as const;
    assert.equal(canRideCreature(base), true, `${kind} should be rideable after taming and saddling`);
    assert.equal(canRideCreature({ ...base, saddled: false }), false);
    assert.equal(canRideCreature({ ...base, tamed: false }), false);
    assert.equal(canRideCreature({ ...base, riderId: "stranger" }), false);
    assert.equal(canRideCreature({ ...base, baby: true }), false);
  }
  assert.equal(canRideCreature({ kind: "warg", tamed: true, ownerId: "keeper", riderId: "keeper", saddled: true, aligned: true }), false);
  assert.equal(CREATURE_MOUNT_PROFILES["worldshell-leviathan"].cargoChestLimit, 6);
  assert.equal(CREATURE_MOUNT_PROFILES["worldshell-leviathan"].landSpeed, 0.12);
  assert.equal(CREATURE_MOUNT_PROFILES["aetherbell-leviathan"].cargoChestLimit, 1);
});

test("adult leviathan metadata enforces saddle ownership and exact chest limits", () => {
  const egg = createLeviathanEgg("worldshell-leviathan", { incubationTicks: 1 });
  let turtle = stepLeviathanEgg(egg, { elapsedTicks: 1, underwater: true }).hatchling!;
  turtle = stepLeviathanGrowth(turtle, { elapsedTicks: LEVIATHAN_LIFECYCLE_CONTRACT.adultAtTicks, underwater: true });
  assert.equal(saddleLeviathan(turtle, "keeper").equipped, false);
  turtle = bondLeviathan(turtle, "keeper");
  const saddle = saddleLeviathan(turtle, "keeper");
  assert.equal(saddle.equipped, true);
  turtle = saddle.state;
  for (let index = 0; index < 6; index += 1) {
    const cargo = attachLeviathanChest(turtle, "keeper");
    assert.equal(cargo.attached, true);
    turtle = cargo.state;
  }
  assert.equal(turtle.chestModules, 6);
  assert.equal(attachLeviathanChest(turtle, "keeper").attached, false);
  const partnerEgg = createLeviathanEgg("worldshell-leviathan", { eggId: "partner-egg", geneticSeed: 99, incubationTicks: 1 });
  let partner = stepLeviathanEgg(partnerEgg, { elapsedTicks: 1, underwater: true }).hatchling!;
  partner = stepLeviathanGrowth(partner, { elapsedTicks: LEVIATHAN_LIFECYCLE_CONTRACT.adultAtTicks, underwater: true });
  const laid = layLeviathanEggFromParents(turtle, partner, 77_000)!;
  assert.equal(laid.species, "worldshell-leviathan");
  assert.deepEqual(laid.parentIds, [partner.creatureId, turtle.creatureId].sort());
  assert.equal(layLeviathanEggFromParents(turtle, { ...partner, stage: "juvenile" }, 77_000), null);
});

test("new production models are readable and expose stable saddle, cargo and morph hooks", () => {
  for (const [index, kind] of [...SEA_UPDATE_KINDS, ...ATLANTIAN_ORDER].entries()) {
    const model = createMobVisual(kind, 7_000 + index);
    let visibleMeshes = 0;
    model.group.traverse((object) => { if (object instanceof THREE.Mesh && object.visible) visibleMeshes += 1; });
    assert.ok(visibleMeshes >= 8, `${kind} should have at least eight visible model components`);
  }
  const horse = createMobVisual("wild-horse", 1).visual;
  const reedstrider = createMobVisual("reedstrider", 2).visual;
  const warg = createMobVisual("warg", 3).visual;
  assert.equal(horse.getObjectByName("wild-horse-saddle")?.visible, false);
  assert.equal(reedstrider.getObjectByName("reedstrider-saddle")?.visible, false);
  assert.equal(warg.getObjectByName("warg-saddle")?.visible, false);
  for (const kind of ["rimehoof-courser", "sunscar-courser", "mirestride-courser", "starbough-courser", "deepgear-courser-golem"] as const) {
    const courser = createMobVisual(kind, 20).visual;
    assert.equal(courser.getObjectByName(`${kind}-saddle`)?.visible, false);
    assert.ok(CREATURE_MOUNT_PROFILES[kind], `${kind} has a live mount profile`);
    assert.equal(MOB_DEFS[kind].rideable, true);
  }

  const worldshell = createMobVisual("worldshell-leviathan", 4).visual;
  assert.equal(worldshell.getObjectByName("worldshell-leviathan-saddle")?.visible, false);
  assert.equal(worldshell.userData.cargoChestLimit, 6);
  assert.equal((worldshell.userData.cargoAnchors as unknown[]).length, 6);
  assert.deepEqual(worldshell.userData.saddleAnchor, [...LEVIATHAN_VISUAL_CONTRACTS.worldshell.saddleAnchor]);
  for (let index = 1; index <= 6; index += 1) assert.equal(worldshell.getObjectByName(`worldshell-leviathan-cargo-${index}`)?.visible, false);

  const bell = createMobVisual("aetherbell-leviathan", 5).visual;
  assert.equal(bell.userData.airSeaMorph, true);
  assert.equal(bell.getObjectByName("aetherbell-leviathan-saddle")?.visible, false);
  assert.ok(bell.getObjectByName("aetherbell-leviathan-bell-root"));
  assert.ok(bell.getObjectByName("aetherbell-leviathan-fluid-tail-8-pivot"));
  const bellRoot = bell.getObjectByName("aetherbell-leviathan-bell-root")!;
  const initialScale = bellRoot.scale.clone();
  applyOceanCreaturePose(bell, "aetherbell-leviathan", 2.5, 0.6, 1);
  assert.notDeepEqual(bellRoot.scale.toArray(), initialScale.toArray(), "air form visibly widens and flattens its bell");
});

test("all shared fish side, dorsal and rear fins overlap their bodies instead of floating", () => {
  assert.ok(FISH_FIN_ATTACHMENT_OVERLAP > 0);
  for (const kind of [
    "shoalfin", "coralback", "brookdart", "gloomfin", "silverthread", "reedneedle", "emberribbon", "cavefilament",
    "redfin-salmon", "blue-mackerel", "glassfin", "lanternjaw",
  ] as const) {
    const visual = createMobVisual(kind, 90).visual;
    visual.updateMatrixWorld(true);
    const body = new THREE.Box3().setFromObject(visual.getObjectByName(`${kind}-body`)!);
    for (const name of [`${kind}-left-fin`, `${kind}-right-fin`, `${kind}-dorsal-fin`, `${kind}-tail-left`, `${kind}-tail-right`]) {
      const detail = new THREE.Box3().setFromObject(visual.getObjectByName(name)!);
      assert.equal(body.intersectsBox(detail), true, `${name} must physically overlap ${kind}'s body`);
    }
  }
});

test("Wildwood Courser eyes have strong luminance contrast against both coat colors", () => {
  const [coat, muzzle, eyes] = MOB_DEFS["wild-horse"].colors.map((value) => new THREE.Color(value));
  const luminance = (color: THREE.Color) => color.r * 0.2126 + color.g * 0.7152 + color.b * 0.0722;
  assert.ok(Math.abs(luminance(eyes) - luminance(coat)) > 0.45);
  assert.ok(Math.abs(luminance(eyes) - luminance(muzzle)) > 0.3);
});
