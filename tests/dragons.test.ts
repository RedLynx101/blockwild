import assert from "node:assert/strict";
import test from "node:test";
import { Item } from "../app/game/data.ts";
import {
  attachDragonChest,
  bondDragonHatchling,
  breedDragons,
  canBreedDragons,
  canMountDragon,
  chooseDragonAiIntent,
  chooseDragonAttack,
  createDragonEgg,
  createDragonDeathEggClutch,
  createDragonState,
  createLairEggClutch,
  dragonAttackPlan,
  dragonCargoSlots,
  dragonEggCondition,
  dragonEggDropIsProtected,
  dragonEggFromDropMetadata,
  dragonEggMinimumDropLifetimeSeconds,
  dragonDisposition,
  dragonKindForType,
  dragonTypeForKind,
  dragonPersistenceDecision,
  DRAGON_DAYS_PER_STAGE,
  DRAGON_EGG_DROP_POLICY,
  DRAGON_FULL_GROWTH_DAYS,
  DRAGON_RIDER_CONTROLS,
  DRAGON_SOUND_PROFILES,
  DRAGON_TICKS_PER_DAY,
  equipDragonArmor,
  equipDragonSaddle,
  harvestDragonScales,
  normalizeDragonState,
  placeDragonSpawnEgg,
  riderDragonAttack,
  rollDragonLoot,
  serializeDragonState,
  setDragonShoulder,
  shouldPermanentlyDeleteDragon,
  stepDragonEgg,
  stepDragonState,
} from "../app/game/dragons.ts";
import { DRAGON_MOB_KINDS as FAUNA_DRAGONS, isDragonMobKind, shouldKeepCreatureLoaded } from "../app/game/fauna.ts";
import { DRAGON_ORDER, MOB_DEFS } from "../app/game/mobs.ts";

test("the canonical roster exposes six persistent, fully described dragon species", () => {
  assert.deepEqual(DRAGON_ORDER, ["fire-dragon", "ice-dragon", "steel-dragon", "sea-dragon", "gold-dragon", "silver-dragon"]);
  assert.deepEqual(FAUNA_DRAGONS, DRAGON_ORDER);
  assert.equal(dragonKindForType("steel"), "steel-dragon");
  assert.equal(dragonKindForType("sea"), "sea-dragon");
  assert.equal(dragonKindForType("gold"), "gold-dragon");
  assert.equal(dragonTypeForKind("silver-dragon"), "silver");
  assert.equal(dragonTypeForKind("ice-dragon"), "ice");
  assert.equal(dragonTypeForKind("sea-dragon"), "sea");
  assert.equal(dragonTypeForKind("ridgeback"), null);
  for (const kind of DRAGON_ORDER) {
    const definition = MOB_DEFS[kind];
    assert.equal(definition.family, "dragon");
    assert.equal(definition.persistent, true);
    assert.equal(definition.flying, true);
    assert.equal(definition.ranged, true);
    assert.equal(definition.rideable, true);
    assert.equal(definition.cargoChestLimit, 2);
    assert.equal(definition.laysEggs, true);
    assert.equal(isDragonMobKind(kind), true);
    assert.ok(definition.drops.some((drop) => drop.item === Item.DragonBone));
  }
  assert.equal(shouldKeepCreatureLoaded({ dragon: true }), true);
});

test("five 25-day stages grow smoothly and Dragon Meal advances exactly one day", () => {
  let dragon = createDragonState("fire", { dragonId: "ember", ageDays: 24.5, geneticSeed: 4 });
  assert.equal(dragon.stage, 1);
  const oldScale = dragon.growthScale;
  dragon = stepDragonState(dragon, { elapsedTicks: DRAGON_TICKS_PER_DAY / 2, dragonMeals: 1 });
  assert.equal(dragon.stage, 2);
  assert.equal(dragon.ageTicks, 26 * DRAGON_TICKS_PER_DAY);
  assert.ok(dragon.growthScale > oldScale);

  const stages = [0, 25, 50, 75, 100, DRAGON_FULL_GROWTH_DAYS].map((ageDays) => createDragonState("ice", { ageDays }).stage);
  assert.deepEqual(stages, [1, 2, 3, 4, 5, 5]);
  assert.equal(DRAGON_DAYS_PER_STAGE, 25);
});

test("save normalization is finite, migration-safe, and preserves a partial hatchling bond", () => {
  const malformed = normalizeDragonState({
    schemaVersion: 99,
    dragonId: "  Frost Friend  ",
    type: "ice",
    sex: "female",
    geneticSeed: 23,
    ageTicks: Number.NaN,
    health: Number.POSITIVE_INFINITY,
    trust: 2,
    ownerId: " player one ",
    equipment: { saddle: true, chests: [true, "wrong"], armor: { head: "ice helm", body: 4 } },
  });
  assert.equal(malformed.schemaVersion, 2);
  assert.equal(malformed.dragonId, "Frost-Friend");
  assert.equal(malformed.stage, 1);
  assert.equal(malformed.health, malformed.maxHealth);
  assert.equal(malformed.ownerId, "player-one");
  assert.deepEqual(malformed.equipment.chests, [true, false]);
  assert.equal(malformed.equipment.armor.head, "ice-helm");
  assert.equal(malformed.equipment.armor.body, null);
  assert.deepEqual(serializeDragonState(malformed), malformed);
});

test("baby taming, shoulder carrying, saddle, armor, cargo, and renewable scale inventory form one lifecycle", () => {
  let dragon = createDragonState("steel", { dragonId: "riveter", sex: "female" });
  assert.equal(dragonDisposition(dragon), "passive");
  assert.equal(dragonDisposition(dragon, true), "defensive");
  assert.equal(chooseDragonAiIntent(dragon, { distanceFromHome: 1, distanceToTarget: 2, lineOfSight: true, healthRatio: 1 }), "idle");
  assert.equal(chooseDragonAttack(dragon, { distance: 8, altitudeDelta: 0, lineOfSight: true }), null, "stage-one dragons defend only at claw range");
  for (let feed = 0; feed < 3; feed += 1) {
    const result = bondDragonHatchling(dragon, "keeper");
    assert.equal(result.accepted, true);
    dragon = result.state;
  }
  assert.equal(dragon.tamed, true);
  assert.equal(dragon.ownerId, "keeper");
  const shoulder = setDragonShoulder(dragon, "keeper", true, 2);
  assert.equal(shoulder.changed, true);
  assert.equal(shoulder.state.onShoulder, true);
  assert.equal(setDragonShoulder(dragon, "keeper", true, 3).state.onShoulder, false, "three shoulder dragons is the cap");

  dragon = stepDragonState(dragon, { elapsedTicks: DRAGON_TICKS_PER_DAY * 50 });
  assert.equal(dragon.stage, 3);
  assert.equal(dragon.onShoulder, false);
  dragon = equipDragonSaddle(dragon, "keeper").state;
  assert.equal(canMountDragon(dragon, "keeper"), true);
  dragon = attachDragonChest(dragon, "keeper").state;
  dragon = attachDragonChest(dragon, "keeper").state;
  assert.equal(attachDragonChest(dragon, "keeper").attached, false);
  assert.equal(dragonCargoSlots(dragon), 36);
  dragon = equipDragonArmor(dragon, "keeper", "head", "SteelDragonArmorModule").state;
  assert.equal(dragon.equipment.armor.head, "SteelDragonArmorModule");

  dragon = harvestDragonScales(dragon).state;
  dragon = stepDragonState(dragon, { elapsedTicks: DRAGON_TICKS_PER_DAY * 9 });
  assert.equal(dragon.scaleReserve, 3);
  const harvested = harvestDragonScales(dragon, 2);
  assert.equal(harvested.taken, 2);
  assert.equal(harvested.state.scaleReserve, 1);
});

test("breeding requires same type, opposite sex, stage three, and the matching catalyst", () => {
  const home = { lairId: "frost-vault", dimension: "overworld", position: { x: 10, y: -20, z: 12 }, guardRadius: 54 } as const;
  const female = createDragonState("ice", { dragonId: "snow", sex: "female", ageDays: 75, home });
  const male = createDragonState("ice", { dragonId: "rime", sex: "male", ageDays: 52, home });
  assert.equal(canBreedDragons(female, male), true);
  assert.equal(canBreedDragons(female, createDragonState("fire", { sex: "male", ageDays: 75 })), false);
  assert.equal(breedDragons(female, male, 800, "fire").egg, null);
  const bred = breedDragons(female, male, 800, "ice");
  assert.equal(bred.egg?.type, "ice");
  assert.equal(bred.egg?.lairId, "frost-vault");
  assert.deepEqual(new Set(bred.egg?.parentIds), new Set(["rime", "snow"]));
  assert.ok(bred.parents.every((parent) => parent.breedCooldownTicks > 0));
});

test("every breed-capable defeated dragon leaves one bounded exact-lineage egg clutch", () => {
  for (const type of ["fire", "ice", "steel", "sea", "gold", "silver"] as const) {
    const immature = createDragonState(type, { dragonId: `${type}-young`, ageDays: 49, sex: "male" });
    assert.deepEqual(createDragonDeathEggClutch(immature, 24_000, 91), []);
    assert.equal(rollDragonLoot(immature, 91).some((entry) => entry.item.endsWith("DragonEgg")), false);

    const mature = createDragonState(type, {
      dragonId: `${type}-lineage`,
      ageDays: 50,
      sex: "male",
      home: { lairId: `${type}-vault`, dimension: "overworld", position: { x: 4, y: -30, z: 9 }, guardRadius: 56 },
    });
    const eggs = createDragonDeathEggClutch(mature, 48_321, 91);
    assert.equal(eggs.length, 1, `${type} stage-three lineage guarantee`);
    assert.equal(eggs[0].type, type);
    assert.equal(eggs[0].laidAtTick, 48_321);
    assert.equal(eggs[0].lairId, `${type}-vault`);
    assert.deepEqual(eggs[0].parentIds, [`${type}-lineage`, null]);
    assert.equal(new Set(eggs.map((egg) => egg.eggId)).size, eggs.length);
    const lootEgg = rollDragonLoot(mature, 91).find((entry) => entry.item === `${type[0].toUpperCase()}${type.slice(1)}DragonEgg`);
    assert.equal(lootEgg?.count, 1);
    assert.equal(lootEgg?.metadata?.parentId, `${type}-lineage`);
  }

  const elder = createDragonState("gold", { dragonId: "auric-matriarch", ageDays: 125, sex: "female" });
  const elderEggs = createDragonDeathEggClutch(elder, 90_000, 0xffff);
  assert.ok(elderEggs.length >= 1 && elderEggs.length <= DRAGON_EGG_DROP_POLICY.maximumDeathClutch);
  assert.equal(new Set(elderEggs.map((egg) => egg.eggId)).size, elderEggs.length, "a death clutch never duplicates payload identity");
});

test("portable dragon eggs are fire/lava immune and protected for one configured world day", () => {
  const egg = createDragonEgg("silver", { eggId: "moon-lineage", geneticSeed: 71, laidAtTick: 44 });
  const metadata = { kind: "dragon-egg", egg } as const;
  assert.equal(DRAGON_EGG_DROP_POLICY.fireImmune, true);
  assert.equal(DRAGON_EGG_DROP_POLICY.lavaImmune, true);
  assert.equal(dragonEggMinimumDropLifetimeSeconds(20), 1_200);
  assert.equal(dragonEggDropIsProtected(metadata, 1_199.99, 20), true);
  assert.equal(dragonEggDropIsProtected(metadata, 1_200, 20), false);
  assert.equal(dragonEggDropIsProtected({ kind: "ordinary-drop" }, 0, 20), false);
  assert.equal(dragonEggFromDropMetadata(metadata)?.type, "silver");
  assert.equal(dragonEggFromDropMetadata({ kind: "dragon-egg", egg: { ...egg, type: "unknown" } }), null);
});

test("natural and incubator hatching honor each element's world condition", () => {
  assert.deepEqual(dragonEggCondition("fire", { openFlame: true }).met, true);
  assert.deepEqual(dragonEggCondition("ice", { submerged: true, freezing: true }).met, true);
  assert.deepEqual(dragonEggCondition("steel", { heatedMetal: true, steam: true }).met, true);
  assert.deepEqual(dragonEggCondition("gold", { directSunlight: true, preciousMetal: true }).met, true);
  assert.deepEqual(dragonEggCondition("silver", { moonlight: true, preciousMetal: true }).met, true);
  assert.equal(dragonEggCondition("gold", { directSunlight: true }).met, false);
  assert.equal(dragonEggCondition("silver", { preciousMetal: true }).met, false);
  assert.equal(dragonEggCondition("steel", { heatedMetal: true }).met, false);

  const fire = createDragonEgg("fire", { geneticSeed: 12, eggId: "fire-clutch" });
  const paused = stepDragonEgg(fire, 10_000, { submerged: true });
  assert.equal(paused.progressed, false);
  assert.equal(paused.egg?.incubationTicks, 0);
  const hatched = stepDragonEgg(fire, 10_000, { openFlame: true });
  assert.equal(hatched.egg, null);
  assert.equal(hatched.hatchling?.type, "fire");
  assert.equal(hatched.hatchling?.tamed, false);

  const steel = createDragonEgg("steel", { geneticSeed: 17, eggId: "steel-clutch" });
  const prepared = stepDragonEgg(steel, 10_000, { incubator: true }, 9_001);
  assert.equal(prepared.hatchling, null);
  assert.equal(prepared.spawnEgg?.kind, "ready-dragon-spawn-egg");
  assert.equal(placeDragonSpawnEgg(prepared.spawnEgg!).dragonId, "steel-clutch:hatchling");
});

test("AI and rider plans keep item use free while exposing three animated dragon attacks", () => {
  let steel = createDragonState("steel", { dragonId: "forgewing", ageDays: 75, tamed: true, ownerId: "rider" });
  steel = equipDragonSaddle(steel, "rider").state;
  assert.deepEqual(DRAGON_RIDER_CONTROLS, { melee: "KeyZ", breath: "KeyX", projectile: "KeyC" });
  assert.equal(riderDragonAttack(steel, "rider", "KeyC")?.shape, "metal-spear");
  assert.equal(riderDragonAttack(steel, "rider", "KeyX")?.status, "scalded");
  assert.equal(riderDragonAttack(steel, "rider", "KeyZ")?.shape, "bite-claw");
  assert.equal(riderDragonAttack(steel, "rider", "KeyQ"), null);

  const spear = dragonAttackPlan("steel", 5, "projectile");
  const steam = dragonAttackPlan("steel", 5, "breath");
  assert.equal(spear.shape, "metal-spear");
  assert.ok(spear.range > 50 && spear.velocity > 40);
  assert.equal(steam.shape, "cone-stream");
  assert.equal(steam.status, "scalded");
  assert.ok(steam.particles.length >= 3);
  assert.equal(chooseDragonAttack(steel, { distance: 26, altitudeDelta: 2, lineOfSight: true })?.kind, "projectile");
  assert.equal(chooseDragonAttack(steel, { distance: 3, altitudeDelta: 0, lineOfSight: true })?.kind, "melee");
  assert.equal(chooseDragonAttack(steel, { distance: 8, altitudeDelta: 0, lineOfSight: false }), null);
});

test("lair defense, never-delete persistence, sound hooks, and tier loot retain dragon identity", () => {
  const dragon = createDragonState("fire", {
    dragonId: "cinder-matriarch",
    sex: "female",
    geneticSeed: 42,
    ageDays: 124,
    home: { lairId: "ember-deep", dimension: "overworld", position: { x: 0, y: -32, z: 0 }, guardRadius: 48 },
  });
  assert.equal(chooseDragonAiIntent(dragon, { distanceFromHome: 80, distanceToTarget: 8, lineOfSight: true, healthRatio: 1, defendingEggs: true }), "return-home");
  assert.equal(chooseDragonAiIntent(dragon, { distanceFromHome: 4, distanceToTarget: 3, lineOfSight: true, healthRatio: 1, defendingEggs: true }), "attack");
  assert.deepEqual(dragonPersistenceDecision(dragon, 1_000), { loaded: false, persistInSave: true, deleteFromWorld: false, reason: "unloaded-distance" });
  assert.equal(shouldPermanentlyDeleteDragon(dragon), false);

  const loot = rollDragonLoot(dragon, 42);
  assert.ok((loot.find((entry) => entry.item === "RawDragonMeat")?.count ?? 0) >= 20);
  assert.ok((loot.find((entry) => entry.item === "FireDragonScale")?.count ?? 0) >= 35);
  assert.ok((loot.find((entry) => entry.item === "DragonBone")?.count ?? 0) >= 30);
  assert.deepEqual(loot.find((entry) => entry.item === "FireDragonSkull")?.metadata, { type: "fire", stage: 5, sex: "female" });
  assert.ok(createLairEggClutch(dragon, 42).length >= 1);
  assert.equal(DRAGON_SOUND_PROFILES.fire.breath, "fire-dragon-breath");
  assert.equal(DRAGON_SOUND_PROFILES.ice["egg-crack"], "ice-dragon-egg-crack");
});
