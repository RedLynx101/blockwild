import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import * as THREE from "three";
import { BLUEPRINTS } from "../app/game/blueprints";
import { attuneCaptureOrb, captureIntoOrb, createEmptyCaptureOrb, deployAttunedCaptureOrb, recallAttunedCreature } from "../app/game/capture-orbs";
import type { CreatureMetadata } from "../app/game/creature-cage";
import { Item, ITEMS, V1_CULTURE_ITEMS } from "../app/game/data";
import { COMMERCE_CATALOG, DWARF_MERCHANT_OFFERS, merchantOffersFor } from "../app/game/economy";
import { GENERIC_BOND_MOB_KINDS, usesGenericCreatureBond } from "../app/game/fauna";
import { commerceItemCode, resourceItemCode } from "../app/game/hearthroads-adapter";
import { MOB_DEFS, V1_FACTION_CREATURE_ORDER } from "../app/game/mobs";
import { createWebspinnerProjectile, disposeArrowVisual, stepArrowProjectile } from "../app/game/projectiles";
import { alignedCreatureSpawnRadius, createSettlementState, planSettlementLayout, type SettlementCandidate } from "../app/game/settlements";
import {
  GOLEM_RECIPES, V1_CULTURES, advanceGolemForge, chargeGolemForge, claimForgedGolem,
  companionGolemCombatAction, createGolemForgeState, normalizeGolemForgeState,
  startGolemForge, unlockGolemBlueprint,
} from "../app/game/v1-cultures";

const GOLEM_KINDS = ["clockwork-hound-golem", "webspinner-golem"] as const;

test("new Deepgear companions have permanent ids, blueprint contracts, and inventory bridges", () => {
  assert.equal(Item.ClockworkHoundBlueprint, 510);
  assert.equal(Item.WebspinnerBlueprint, 511);
  assert.equal(Item.ClockworkHoundOrb, 512);
  assert.equal(Item.WebspinnerOrb, 513);
  assert.equal(ITEMS[Item.ClockworkHoundBlueprint].blueprintId, "golem-clockwork-hound");
  assert.equal(ITEMS[Item.WebspinnerBlueprint].blueprintId, "golem-webspinner");
  assert.equal(ITEMS[Item.ClockworkHoundOrb].creatureKind, "clockwork-hound-golem");
  assert.equal(ITEMS[Item.WebspinnerOrb].creatureKind, "webspinner-golem");
  for (const item of [Item.ClockworkHoundBlueprint, Item.WebspinnerBlueprint]) assert.ok(V1_CULTURE_ITEMS.includes(item));
  for (const legacyItem of [Item.ClockworkHoundOrb, Item.WebspinnerOrb]) {
    assert.equal(V1_CULTURE_ITEMS.includes(legacyItem), false, "species orb ids remain decode-only and are absent from creative inventory");
  }
  const blueprintIds = new Set(BLUEPRINTS.map((blueprint) => blueprint.id));
  assert.ok(blueprintIds.has("golem-clockwork-hound"));
  assert.ok(blueprintIds.has("golem-webspinner"));
  assert.equal(commerceItemCode("blueprint-clockwork-hound"), Item.ClockworkHoundBlueprint);
  assert.equal(commerceItemCode("blueprint-webspinner"), Item.WebspinnerBlueprint);
  assert.equal(commerceItemCode("clockwork-hound-golem-orb"), Item.ClockworkHoundOrb);
  assert.equal(commerceItemCode("webspinner-golem-orb"), Item.WebspinnerOrb);
  assert.equal(COMMERCE_CATALOG["clockwork-hound-golem-orb"]?.tags?.includes("unaligned"), true);
  assert.equal(COMMERCE_CATALOG["webspinner-golem-orb"]?.tags?.includes("unaligned"), true);
  for (const key of ["blueprint-clockwork-hound", "blueprint-webspinner", "clockwork-hound-golem-orb", "webspinner-golem-orb"]) {
    assert.ok(DWARF_MERCHANT_OFFERS.some((offer) => offer.itemKey === key), `${key} is stocked by dwarves`);
    assert.ok(merchantOffersFor("dwarves", "dwarf-golemsmith").some((offer) => offer.itemKey === key), `${key} reaches golemsmith inventory`);
  }
  for (const key of ["blueprint-clockwork-hound", "blueprint-webspinner"]) {
    assert.equal(DWARF_MERCHANT_OFFERS.find((offer) => offer.itemKey === key)?.rareChance, undefined, `${key} is reliably buyable`);
  }
});

test("both companion golems remain genuinely blueprint-gated and save-normalize without a schema bump", () => {
  for (const type of ["clockwork-hound", "webspinner"] as const) {
    const recipe = GOLEM_RECIPES[type];
    assert.equal(recipe.role, type === "clockwork-hound" ? "interceptor" : "controller");
    for (const resource of Object.keys(recipe.resources)) assert.notEqual(resourceItemCode(resource), null);
    let forge = chargeGolemForge(createGolemForgeState(), recipe.manaCost);
    assert.equal(startGolemForge(forge, type, recipe.resources, 100).reason, "blueprint-locked");
    forge = unlockGolemBlueprint(forge, recipe.blueprintId);
    const started = startGolemForge(forge, type, recipe.resources, 100);
    assert.equal(started.ok, true);
    if (!started.ok) continue;
    const completed = advanceGolemForge(started.state, recipe.seconds);
    assert.deepEqual(completed.completed, [type]);
    const claimed = claimForgedGolem(completed);
    assert.equal(claimed.ok, true);
    assert.equal(claimed.golemType, type);
  }
  const restored = normalizeGolemForgeState({
    schema: 1, unlockedBlueprintIds: ["golem-clockwork-hound", "golem-webspinner"], storedMana: 55,
    completed: ["clockwork-hound", "legacy-invalid", "webspinner"],
    job: { golemType: "webspinner", startedAt: 20, progressSeconds: 4, manaCommitted: 128 },
  });
  assert.equal(restored.schema, 1);
  assert.deepEqual(restored.completed, ["clockwork-hound", "webspinner"]);
  assert.equal(restored.job?.golemType, "webspinner");
});

test("bestiary and bonding metadata describe distinct non-sentient companion roles", () => {
  assert.deepEqual(V1_CULTURES.dwarves.alignedCreatures.slice(-2), GOLEM_KINDS);
  for (const kind of GOLEM_KINDS) {
    const definition = MOB_DEFS[kind];
    assert.equal(definition.family, "construct");
    assert.equal(definition.sentient, false);
    assert.equal(definition.tameable, true);
    assert.equal(definition.tameRequiresUnaligned, true);
    assert.equal(definition.factionAffinity, "dwarves");
    assert.equal(definition.breedable, undefined);
    assert.ok(definition.tameItems && definition.tameItems.length >= 2);
    assert.match(definition.utility ?? "", /companion|bodyguard/u);
    assert.ok(V1_FACTION_CREATURE_ORDER.includes(kind));
    assert.ok(GENERIC_BOND_MOB_KINDS.includes(kind));
    assert.equal(usesGenericCreatureBond(kind), true);
  }
  assert.ok(MOB_DEFS["clockwork-hound-golem"].chaseSpeed > 5);
  assert.equal(MOB_DEFS["webspinner-golem"].ranged, true);
  assert.ok(MOB_DEFS["webspinner-golem"].attackRange >= 8);
});

test("Deepgear settlements field aligned hounds and webspinners that cannot be tamed in place", () => {
  const candidate: SettlementCandidate = {
    schema: 1, id: "golem-defense-hold", worldSeed: "GOLEM-DEFENSE", regionX: 2, regionZ: -3,
    center: { x: 800, y: 78, z: -1_200 }, floorY: 54, size: "village", factionId: "dwarves",
    biome: "snowcap-range", environment: "underground",
  };
  const state = createSettlementState("host", candidate, planSettlementLayout(candidate));
  for (const kind of GOLEM_KINDS) {
    const creature = state.alignedCreatures.find((entry) => entry.kind === kind);
    assert.ok(creature, `${kind} is assigned to a Deepgear defense point`);
    assert.equal(creature?.factionId, "dwarves");
    assert.equal(creature?.tameable, false);
  }
  assert.equal(alignedCreatureSpawnRadius("webspinner-golem"), 0.35);
  assert.equal(alignedCreatureSpawnRadius("clockwork-hound-golem"), 2.5);

  for (let index = 0; index < 200; index += 1) {
    const layoutCandidate: SettlementCandidate = {
      ...candidate,
      id: `webspinner-clearance-${index}`,
      worldSeed: `WEBSPINNER-CLEARANCE-${index}`,
      regionX: index % 20,
      regionZ: Math.floor(index / 20),
      center: { x: (index % 20) * 300, y: 78, z: Math.floor(index / 20) * 300 },
    };
    const layout = planSettlementLayout(layoutCandidate);
    const forge = layout.buildings.find((building) => building.role === "golem-forge");
    const spider = createSettlementState("host", layoutCandidate, layout).alignedCreatures.find((entry) => entry.kind === "webspinner-golem");
    assert.ok(forge && spider, `layout ${index} has its forge guardian`);
    if (!forge || !spider) continue;
    assert.ok(Math.abs(spider.position.x - forge.position.x) < forge.width / 2, `layout ${index} service bay stays inside the forge`);
    assert.ok(Math.abs(spider.position.z - forge.position.z) < forge.depth / 2, `layout ${index} service bay stays inside the forge`);
    for (const furniture of forge.furniture.filter((entry) => entry.position.y === undefined || entry.position.y === forge.position.y)) {
      assert.ok(Math.hypot(spider.position.x - furniture.position.x, spider.position.z - furniture.position.z) > 1.25, `layout ${index} clears ${furniture.kind}`);
    }
  }
});

test("combat planner separates fast hound pressure from spider standoff control", () => {
  const common = { defending: true, holding: false, targetHostile: true, lineOfSight: true, meleeReach: 1.4, cooldownSeconds: 0 } as const;
  assert.equal(companionGolemCombatAction({ ...common, kind: "clockwork-hound-golem", distance: 8 }), "intercept");
  assert.equal(companionGolemCombatAction({ ...common, kind: "clockwork-hound-golem", distance: 1.2 }), "bite");
  assert.equal(companionGolemCombatAction({ ...common, kind: "clockwork-hound-golem", distance: 1.9 }), "body-check");
  assert.equal(companionGolemCombatAction({ ...common, kind: "webspinner-golem", distance: 2.2 }), "disengage");
  assert.equal(companionGolemCombatAction({ ...common, kind: "webspinner-golem", distance: 7 }), "control");
  assert.equal(companionGolemCombatAction({ ...common, kind: "webspinner-golem", distance: 7, cooldownSeconds: 1 }), "hold-range");
  assert.equal(companionGolemCombatAction({ ...common, kind: "webspinner-golem", distance: 12 }), "intercept");
  assert.equal(companionGolemCombatAction({ ...common, kind: "webspinner-golem", distance: 7, holding: true }), "idle");
  assert.equal(companionGolemCombatAction({ ...common, kind: "clockwork-hound-golem", distance: 7, lineOfSight: false }), "idle");
});

test("Webspinner uses a bounded visible filament projectile rather than an arrow", () => {
  const projectile = createWebspinnerProjectile(7, { kind: "mob", id: 3 }, new THREE.Vector3(0, 2, 0), new THREE.Vector3(7, 2, 0));
  assert.equal(projectile.visual.name, "visible-webspinner-bind-projectile");
  assert.equal(projectile.effect?.kind, "webspinner-bind");
  assert.equal(projectile.visual.getObjectByName("visible-arrow-projectile"), undefined);
  assert.ok(projectile.visual.getObjectByName("webspinner-filament-1"));
  for (let index = 0; index < 80; index += 1) {
    if (stepArrowProjectile(projectile, 0.05, () => false, () => null).kind === "expired") break;
  }
  assert.ok(projectile.age <= projectile.maxAge + 0.051);
  disposeArrowVisual(projectile.visual);
});

test("neutral companion golems preserve exact metadata through capture, attunement, deployment, and recall", () => {
  for (const kind of GOLEM_KINDS) {
    const definition = MOB_DEFS[kind];
    const metadata: CreatureMetadata = {
      schema: 1, entityId: `${kind}-unit-7`, kind, health: definition.health, maxHealth: definition.health,
      ageTicks: 24_000, baby: false, temperament: definition.temperament, hostile: false, tamed: true,
      ownerId: "keeper-7", name: kind === "clockwork-hound-golem" ? "Ratchet" : "Loom", geneticSeed: 7701,
      command: "follow", factionId: "player", settlementId: null, aligned: false,
      custom: { courserBond: { trust: 8, tamed: true, ownerId: "keeper-7", saddled: false }, followCommand: "follow" },
    };
    const captured = captureIntoOrb(createEmptyCaptureOrb(`orb-${kind}`), metadata, 10);
    assert.ok(captured);
    const attuned = captured && attuneCaptureOrb(captured, "keeper-7", 20);
    assert.ok(attuned);
    const deployed = attuned && deployAttunedCaptureOrb(attuned, "keeper-7");
    assert.equal(deployed?.creature.kind, kind);
    assert.equal(deployed?.creature.custom.attunedOrbId, `orb-${kind}`);
    const recalled = deployed && recallAttunedCreature(deployed.orb, deployed.creature, "keeper-7", "manual", 30);
    assert.equal(recalled?.orb.creature?.kind, kind);
    assert.equal(recalled?.orb.creature?.name, metadata.name);
    assert.equal(recalled?.orb.attunement?.fainted, false);
  }
});

test("engine owns both settlement and player-bound defense without weakening capture alignment guards", () => {
  const source = readFileSync(new URL("../app/game/engine.ts", import.meta.url), "utf8");
  assert.match(source, /clockwork-hound-golem-orb[\s\S]*webspinner-golem-orb/u);
  assert.match(source, /usesGenericCreatureBond\(kind as CoreMobKind\)[\s\S]*courserBond/u);
  assert.match(source, /companionGolemTarget[\s\S]*bondedToOwner[\s\S]*companionGolemCombatAction/u);
  assert.match(source, /mob\.aligned && mob\.settlementId && mob\.definition\.family === "construct"/u);
  assert.match(source, /Faction-aligned creatures cannot be captured\./u);
  assert.match(source, /createWebspinnerProjectile/u);
  assert.match(source, /commitClockworkHoundAttack/u);
  assert.match(source, /playCreatureEvent\(mob, "attack"\)/u);
  assert.match(source, /companionGolemAttackRecovery[\s\S]*applyWildlifePose/u);
});
