import test from "node:test";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ALCHEMY_RECIPES, applyPotionEffect } from "../app/game/alchemy";
import { AQUATIC_FLORA, BLOCKS, CULTIVATED_FLOWERS, ORDINARY_FLOWERS, RECIPES, BlockId, Item, ITEMS, V1_CULTURE_ITEMS, blockContainsWater } from "../app/game/data";
import { useDragonLairSurveyCharter } from "../app/game/dragon-world";
import { createDragonEgg, createDragonState, dragonEggCondition, rollDragonLoot, stepDragonEgg } from "../app/game/dragons";
import { timedMovementMultiplier } from "../app/game/engine";
import { DWARF_MERCHANT_OFFERS, WOOD_ELF_MERCHANT_OFFERS, merchantOffersFor } from "../app/game/economy";
import { FACTIONS, NPC_FACTION_IDS, factionCanOccupyEnvironment, normalizeEnabledFactions } from "../app/game/factions";
import { POTION_RECIPE_BY_ITEM, commerceItemCode, resourceItemCode } from "../app/game/hearthroads-adapter";
import { SPELLS } from "../app/game/magic";
import { applyDragonPose, createMobVisual } from "../app/game/mob-models";
import { DWARF_ORDER, MOB_DEFS, V1_FACTION_CREATURE_ORDER, WOOD_ELF_ORDER } from "../app/game/mobs";
import {
  ATLANTIAN_FACTION_QUESTS,
  DEFAULT_QUEST_DEFINITIONS,
  DWARF_FACTION_QUESTS,
  MAX_PINNED_QUESTS,
  SEA_DRAGON_QUESTS,
  WOOD_ELF_FACTION_QUESTS,
  acceptQuest,
  createQuestBook,
  normalizeQuestBook,
  pinQuest,
  togglePinnedQuest,
} from "../app/game/quests";
import {
  createSettlementState,
  DWARF_SIDE_QUESTS,
  planSettlementLayout,
  settlementWinsSpacingTieBreak,
  WOOD_ELF_SIDE_QUESTS,
  type SettlementCandidate,
} from "../app/game/settlements";
import {
  GOLEM_RECIPES,
  SETTLEMENT_TILE_COUNT_BANDS,
  V1_CULTURES,
  V1_FUTURE_ONLY,
  advanceGolemForge,
  alignedGolemDefenseAction,
  chargeGolemForge,
  claimForgedGolem,
  createGolemForgeState,
  planSeaDragonNest,
  planV1Settlement,
  seaDragonAttributes,
  startGolemForge,
  unlockGolemBlueprint,
} from "../app/game/v1-cultures";
import { BiomeId, CHUNK_SIZE, ChunkWorld, selectSettlementSite, settlementBedBlocksForFacing, settlementGateBlockForFacing } from "../app/game/world";
import { QuestPanel } from "../app/game/HearthroadsPanels.tsx";

function assertConnectedTilePlan(plan: ReturnType<typeof planV1Settlement>) {
  const occupied = new Set(plan.tiles.map((tile) => `${tile.gridX},${tile.gridZ}`));
  const visited = new Set<string>();
  const queue = ["0,0"];
  while (queue.length) {
    const key = queue.shift()!;
    if (visited.has(key) || !occupied.has(key)) continue;
    visited.add(key);
    const [x, z] = key.split(",").map(Number);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) queue.push(`${x + dx},${z + dz}`);
  }
  assert.equal(visited.size, occupied.size, "every settlement tile must connect to the civic tile");
  for (const tile of plan.tiles) for (const direction of tile.pathConnections) {
    const [dx, dz] = direction === "north" ? [0, -1] : direction === "east" ? [1, 0] : direction === "south" ? [0, 1] : [-1, 0];
    assert.ok(occupied.has(`${tile.gridX + dx},${tile.gridZ + dz}`), `${tile.id} has a path to an authored neighbor`);
  }
}

test("v1 cultures are selectable, habitat-bound, and planned as connected tiled settlements", () => {
  assert.ok(NPC_FACTION_IDS.includes("wood-elves"));
  assert.ok(NPC_FACTION_IDS.includes("dwarves"));
  assert.deepEqual(normalizeEnabledFactions(undefined), NPC_FACTION_IDS);
  assert.equal(FACTIONS["wood-elves"].race, "wood-elf");
  assert.equal(FACTIONS.dwarves.race, "dwarf");
  assert.equal(factionCanOccupyEnvironment("wood-elves", "surface"), true);
  assert.equal(factionCanOccupyEnvironment("dwarves", "surface"), false);
  assert.equal(factionCanOccupyEnvironment("dwarves", "underground"), true);
  assert.deepEqual(V1_CULTURES.woodElves.alignedCreatures, ["glimmerhart", "runeowl"]);
  assert.ok(V1_FUTURE_ONLY.includes("human settlements"));
  assert.ok(V1_FUTURE_ONLY.includes("Mekanism-style drills and machinery"));

  for (const factionId of ["wood-elves", "dwarves"] as const) for (const size of ["hamlet", "village", "town"] as const) {
    const plan = planV1Settlement({ seed: "V1-TILE-CONTRACT", regionX: 7, regionZ: -4, factionId, size });
    const band = SETTLEMENT_TILE_COUNT_BANDS[size];
    assert.ok(plan.tiles.length >= band.min && plan.tiles.length <= band.max);
    assertConnectedTilePlan(plan);
    assert.equal(plan.wallTiles.filter((tile) => tile.gate).length, 1);
    assert.ok(plan.lanternTiles.length >= 4);
    if (factionId === "dwarves") {
      assert.equal(plan.style, "subterranean-hold");
      assert.ok(plan.tiles.some((tile) => tile.role === "golem-forge" && tile.yOffset < 0));
    } else {
      assert.equal(plan.style, "tiled-grove");
      assert.ok(plan.tiles.some((tile) => tile.role === "library"));
    }
  }

  const spacingBase = {
    schema: 1 as const,
    worldSeed: "V1-SPACING",
    regionX: 0,
    regionZ: 0,
    size: "town" as const,
    factionId: "wood-elves" as const,
    biome: "glimmerwood" as const,
    environment: "surface" as const,
  };
  const first: SettlementCandidate = { ...spacingBase, id: "spacing-a", center: { x: 0, z: 0 } };
  const second: SettlementCandidate = { ...spacingBase, id: "spacing-b", regionX: 1, center: { x: 220, z: 0 } };
  const far: SettlementCandidate = { ...spacingBase, id: "spacing-far", regionX: 3, center: { x: 1_800, z: 0 } };
  const firstWins = settlementWinsSpacingTieBreak(first, [second, far]);
  const secondWins = settlementWinsSpacingTieBreak(second, [first, far]);
  assert.notEqual(firstWins, secondWins, "one stable winner resolves a cross-region spacing conflict");
  assert.equal(settlementWinsSpacingTieBreak(far, [first, second]), true, "distant settlements remain eligible");
});

test("settlement adapter preserves surface terrain sampling and authors a real underground hold", () => {
  const common = { schema: 1 as const, worldSeed: "V1-LAYOUT", regionX: 2, regionZ: 3, size: "village" as const };
  const elfCandidate: SettlementCandidate = {
    ...common, id: "elf-layout", center: { x: 1_100, z: 1_620 }, factionId: "wood-elves", biome: "glimmerwood", environment: "surface",
  };
  const elfLayout = planSettlementLayout(elfCandidate);
  assert.equal(elfLayout.topology, "walled-surface");
  assert.ok(elfLayout.radiusBlocks >= 50);
  assert.ok(elfLayout.buildings.every((building) => building.position.y === undefined), "surface structures defer Y to local terrain");
  const wallRadius = elfLayout.radiusBlocks - 11;
  assert.equal(elfLayout.wall.length, wallRadius * 8 - 1, "the perimeter expands to one node per block with one gate opening");
  assert.ok(elfLayout.wall.every((node) => Math.abs(node.position.x - elfCandidate.center.x) === wallRadius
    || Math.abs(node.position.z - elfCandidate.center.z) === wallRadius));
  assert.ok(!elfLayout.wall.some((node) => node.position.x === elfLayout.gates[0].position.x && node.position.z === elfLayout.gates[0].position.z));
  assert.ok(elfLayout.lights.some((light) => light.kind === "glimmer-orb"));
  const homes = elfLayout.buildings.filter((building) => building.role === "living-home");
  assert.ok(homes.length >= 2, "a tiled enclave needs multiple resident homes");
  const localOffset = (building: (typeof homes)[number], x: number, z: number) => {
    const dx = x - building.position.x;
    const dz = z - building.position.z;
    const result = building.facing === 1 ? { x: dz, z: -dx }
      : building.facing === 2 ? { x: -dx, z: -dz }
        : building.facing === 3 ? { x: -dz, z: dx }
          : { x: dx, z: dz };
    return { x: result.x || 0, z: result.z || 0 };
  };
  for (const home of homes) {
    assert.ok(home.width >= 7 && home.depth >= 7, "small Moonbough homes retain a usable interior");
    const occupied = home.furniture.filter((entry) => entry.kind !== "door").map((entry) => localOffset(home, entry.position.x, entry.position.z));
    assert.ok(!occupied.some((entry) => entry.x === 0 && entry.z === -1), "the tile behind the front door stays clear");
    const bed = home.furniture.find((entry) => entry.kind === "bed")!;
    assert.deepEqual(localOffset(home, bed.position.x, bed.position.z), { x: -1, z: 0 });
    assert.equal(bed.facing, ((home.facing + 2) & 3), "the bed head points toward the rear wall");
    const placement = settlementBedBlocksForFacing(bed.facing);
    const head = localOffset(home, bed.position.x + placement.dx, bed.position.z + placement.dz);
    assert.deepEqual(head, { x: -1, z: 1 });
  }
  const gate = elfLayout.gates[0];
  const gateDx = gate.position.x - elfLayout.center.x;
  const gateDz = gate.position.z - elfLayout.center.z;
  const expectedGateFacing = Math.abs(gateDx) > Math.abs(gateDz) ? (gateDx > 0 ? 1 : 3) : (gateDz > 0 ? 2 : 0);
  assert.equal(gate.facing, expectedGateFacing, "the opening faces outward on its perimeter side");
  assert.equal(settlementGateBlockForFacing(gate.facing), gate.facing % 2 === 0 ? BlockId.FenceGateNorthSouthClosed : BlockId.FenceGateEastWestClosed);
  const elfState = createSettlementState("host", elfCandidate, elfLayout);
  assert.ok(new Set(elfState.residents.map((resident) => resident.homeBuildingId)).size >= 4, "residents distribute across role-appropriate buildings");
  for (const resident of elfState.residents) {
    const home = elfLayout.buildings.find((building) => building.id === resident.homeBuildingId);
    if (!home) continue;
    assert.notDeepEqual(resident.position, home.position, "residents begin on an interior floor tile, not a roof-seeking furnished center");
    assert.ok(!home.furniture.some((entry) => entry.position.x === resident.position.x && entry.position.z === resident.position.z));
  }

  const dwarfCandidate: SettlementCandidate = {
    ...common, id: "dwarf-layout", center: { x: 1_100, y: 72, z: 1_620 }, floorY: 54,
    factionId: "dwarves", biome: "snowcap-range", environment: "underground",
  };
  const dwarfLayout = planSettlementLayout(dwarfCandidate);
  assert.equal(dwarfLayout.topology, "subterranean-hold");
  assert.equal(dwarfLayout.verticalLayers.find((layer) => layer.purpose === "surface-entry")?.y, 72);
  assert.ok(dwarfLayout.buildings.every((building) => (building.position.y ?? 999) <= 54));
  assert.ok(dwarfLayout.buildings.some((building) => building.role === "golem-forge"));
  assert.ok(dwarfLayout.buildings.some((building) => building.role === "powderworks"));
  assert.ok(dwarfLayout.lights.some((light) => light.kind === "deepgear-lantern"));
  const state = createSettlementState("host", dwarfCandidate, dwarfLayout);
  assert.equal(state.cultureRace, "dwarf");
  assert.ok(state.residents.some((resident) => resident.profession === "dwarf-thane"));
  assert.ok(state.residents.some((resident) => resident.profession === "dwarf-gatewarden"));
  assert.ok(state.alignedCreatures.some((creature) => creature.kind === "copper-scout-golem"));
});

test("Golem Forge requires a learned plan, complete resources, and committed mana", () => {
  const recipe = GOLEM_RECIPES["stone-bulwark"];
  let forge = createGolemForgeState();
  assert.equal(startGolemForge(forge, "stone-bulwark", recipe.resources, 50).reason, "blueprint-locked");
  forge = unlockGolemBlueprint(forge, recipe.blueprintId);
  assert.equal(startGolemForge(forge, "stone-bulwark", recipe.resources, 50).reason, "insufficient-mana");
  forge = chargeGolemForge(forge, recipe.manaCost);
  assert.equal(startGolemForge(forge, "stone-bulwark", { "stone-brick": 1 }, 50).reason, "missing-resources");
  const started = startGolemForge(forge, "stone-bulwark", recipe.resources, 50);
  assert.ok(started.ok);
  assert.deepEqual(started.consumed, recipe.resources);
  assert.equal(started.state.storedMana, 0);
  forge = advanceGolemForge(started.state, recipe.seconds - 1);
  assert.ok(forge.job);
  forge = advanceGolemForge(forge, 1);
  assert.equal(forge.job, null);
  assert.deepEqual(forge.completed, ["stone-bulwark"]);
  const claimed = claimForgedGolem(forge);
  assert.ok(claimed.ok);
  assert.equal(claimed.golemType, "stone-bulwark");
  assert.deepEqual(claimed.state.completed, []);

  assert.equal(alignedGolemDefenseAction({
    aligned: true, settlementId: "deepgear-hold", targetHostile: true, lineOfSight: true,
    distance: 7, attackRange: 1.3, ranged: true, cooldownSeconds: 0,
  }), "ranged");
  assert.equal(alignedGolemDefenseAction({
    aligned: true, settlementId: "deepgear-hold", targetHostile: true, lineOfSight: true,
    distance: 1.2, attackRange: 1.3, ranged: false, cooldownSeconds: 0,
  }), "melee");
  assert.equal(alignedGolemDefenseAction({
    aligned: false, settlementId: "deepgear-hold", targetHostile: true, lineOfSight: true,
    distance: 1, attackRange: 1.3, ranged: false, cooldownSeconds: 0,
  }), "idle", "unaligned constructs never inherit settlement targets");
});

test("new cultures have complete commerce, item, spell, quest, and model rosters", () => {
  assert.ok(WOOD_ELF_MERCHANT_OFFERS.some((offer) => offer.itemKey === "unaligned-glimmerhart-orb"));
  assert.ok(DWARF_MERCHANT_OFFERS.some((offer) => offer.itemKey === "flintlock-pistol"));
  assert.ok(DWARF_MERCHANT_OFFERS.some((offer) => offer.itemKey === "blueprint-aetherforged-sentinel"));
  assert.ok(DWARF_MERCHANT_OFFERS.some((offer) => offer.itemKey === "blueprint-deepgear-courser"));
  assert.ok(DWARF_MERCHANT_OFFERS.some((offer) => offer.itemKey === "deepgear-courser-golem-orb"));
  assert.ok(merchantOffersFor("wood-elves", "wood-elf-bow-warden").some((offer) => offer.itemKey === "glimmerbow"));
  assert.ok(merchantOffersFor("dwarves", "dwarf-powderwright").some((offer) => offer.itemKey === "flintlock-pistol"));
  assert.ok(V1_CULTURE_ITEMS.includes(Item.GolemForgeItem));
  assert.ok(V1_CULTURE_ITEMS.includes(Item.LumenreedFrond));
  assert.equal(ITEMS[Item.LumenreedFrond].plantBlock, BlockId.Lumenreed);
  assert.ok(AQUATIC_FLORA.includes(BlockId.Lumenreed));
  assert.equal(CULTIVATED_FLOWERS[ORDINARY_FLOWERS.indexOf(BlockId.Moonpetal)], BlockId.GiantMoonpetal);
  assert.equal(ITEMS[Item.SeaDragonEgg].placeBlock, BlockId.SeaDragonEggBlock);
  assert.equal(Item.TideglassDragonArmorModule, 419);
  assert.equal(Item.DeepgearCourserBlueprint, 432);
  assert.equal(Item.DeepgearCourserOrb, 433);
  assert.equal(ITEMS[Item.DeepgearCourserBlueprint].blueprintId, "golem-deepgear-courser");
  assert.equal(ITEMS[Item.DeepgearCourserOrb].creatureKind, "deepgear-courser-golem");
  assert.equal(GOLEM_RECIPES["deepgear-courser"].role, "mount");
  assert.equal(ITEMS[Item.TideglassDragonArmorModule].dragonType, "sea");
  assert.equal(ITEMS[Item.TideglassDragonArmorModule].dragonModule, "armor");
  const tideglassArmor = RECIPES.find((recipe) => recipe.id === "tideglass-dragon-armor");
  assert.equal(tideglassArmor?.output.item, Item.TideglassDragonArmorModule);
  assert.equal(tideglassArmor?.blueprint, "dragon-husbandry");
  assert.ok(tideglassArmor?.pattern.includes(Item.SeaDragonScale));
  assert.ok(tideglassArmor?.pattern.includes(Item.LivingCoral));
  const dragonSaddle = RECIPES.find((recipe) => recipe.id === "dragonflight-saddle");
  assert.ok(dragonSaddle?.pattern.some((entry) => Array.isArray(entry) && entry.includes(Item.SeaDragonScale)), "Sea scales work in shared dragon tack");
  assert.equal(ITEMS[Item.FlintlockPistol].toolKind, "firearm");
  assert.ok(SPELLS.some((spell) => spell.id === "verdant-volley" && spell.projectile.trail === "verdant-leaves"));
  assert.ok(SPELLS.some((spell) => spell.id === "starlight-snare" && spell.projectile.trail === "starlight-threads"));
  assert.equal(WOOD_ELF_FACTION_QUESTS.length, 3);
  assert.equal(DWARF_FACTION_QUESTS.length, 3);
  assert.equal(SEA_DRAGON_QUESTS.length, 2);
  assert.equal(POTION_RECIPE_BY_ITEM[Item.MoonstepElixir], "moonstep-elixir");
  assert.equal(POTION_RECIPE_BY_ITEM[Item.VerdantRenewal], "verdant-renewal");
  assert.equal(resourceItemCode("water-breathing-potion"), Item.WaterBreathingPotion);
  assert.ok(ALCHEMY_RECIPES.some((recipe) => recipe.id === "moonstep-elixir" && recipe.blueprintId === "moonstep"));
  assert.ok(ALCHEMY_RECIPES.some((recipe) => recipe.id === "verdant-renewal" && recipe.blueprintId === "verdant-renewal"));
  const renewed = applyPotionEffect({ health: 2, maxHealth: 10, fastTravelCharges: 0, buffs: {} }, "verdant-renewal", 100);
  assert.equal(renewed.health, 8);
  const moonstep = applyPotionEffect({ health: 10, maxHealth: 10, fastTravelCharges: 0, buffs: {} }, "moonstep-elixir", 100);
  assert.equal(moonstep.buffs.moonstep, 310);
  assert.equal(timedMovementMultiplier(moonstep.buffs, 200), 1.16, "Moonstep increases travel speed while active");
  assert.equal(timedMovementMultiplier(moonstep.buffs, 311), 1, "Moonstep stops affecting travel after expiry");
  for (const offer of [...WOOD_ELF_MERCHANT_OFFERS, ...DWARF_MERCHANT_OFFERS]) {
    assert.notEqual(commerceItemCode(offer.itemKey), null, `${offer.itemKey} has a live inventory bridge`);
  }
  for (const recipe of Object.values(GOLEM_RECIPES)) for (const resource of Object.keys(recipe.resources)) {
    assert.notEqual(resourceItemCode(resource), null, `${recipe.type} can consume ${resource} from inventory`);
  }
  for (const quest of [...WOOD_ELF_SIDE_QUESTS, ...DWARF_SIDE_QUESTS]) {
    for (const criterion of quest.criteria) {
      if (criterion.kind === "collect" || criterion.kind === "deliver") {
        assert.notEqual(resourceItemCode(criterion.target), null, `${quest.id} can observe ${criterion.target}`);
      } else if (criterion.kind === "defeat") {
        assert.equal(criterion.target === "overworld-monster" || criterion.target in MOB_DEFS, true, `${quest.id} can observe ${criterion.target} defeats`);
      }
    }
    for (const reward of quest.rewards.items) {
      assert.notEqual(resourceItemCode(reward.itemKey) ?? commerceItemCode(reward.itemKey), null, `${quest.id} can deliver ${reward.itemKey}`);
    }
  }

  const roster = [...WOOD_ELF_ORDER, ...DWARF_ORDER, ...V1_FACTION_CREATURE_ORDER, "sea-dragon" as const];
  for (const [index, kind] of roster.entries()) {
    assert.ok(MOB_DEFS[kind], `${kind} has a bestiary definition`);
    const visual = createMobVisual(kind, -10_000 - index);
    visual.group.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(visual.group);
    assert.equal(bounds.isEmpty(), false, `${kind} renders visible geometry`);
    assert.ok(Number.isFinite(bounds.min.y) && Number.isFinite(bounds.max.y));
    if (kind === "sea-dragon") {
      assert.equal(applyDragonPose(visual.group, { timeSeconds: 1.2, mode: "fly", movement: 1, attackProgress: 0.5 }), true);
      assert.ok(visual.group.getObjectByName("sea-dragon-left-wing-root-pivot"));
      assert.ok(visual.group.getObjectByName("sea-dragon-tail-7-pivot"));
    }
    const materials = new Set<THREE.Material>();
    visual.group.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry.dispose();
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    for (const material of materials) material.dispose();
  }
});

test("quest log migrates legacy pins, fixes The Light Below, and caps pins at three", () => {
  const lightBelow = ATLANTIAN_FACTION_QUESTS.find((quest) => quest.id === "atlantian-light-below")!;
  assert.equal(lightBelow.giver, null);
  let book = createQuestBook();
  const questIds = [
    "atlantian-light-below",
    "sugarcourt-beyond-sugarwind",
    "wood-elf-under-living-light",
    "dwarf-lantern-in-snow",
  ];
  for (const questId of questIds) {
    const result = acceptQuest(book, DEFAULT_QUEST_DEFINITIONS, questId, 100);
    assert.ok(result.ok, questId);
    book = result.book;
  }
  for (const questId of questIds) book = pinQuest(book, questId);
  assert.equal(book.pinnedQuestIds.length, MAX_PINNED_QUESTS);
  assert.deepEqual(book.pinnedQuestIds, questIds.slice(0, 3));
  book = togglePinnedQuest(book, questIds[1]);
  book = pinQuest(book, questIds[3]);
  assert.deepEqual(book.pinnedQuestIds, [questIds[0], questIds[2], questIds[3]]);
  const legacy = normalizeQuestBook({ ...book, pinnedQuestIds: undefined, pinnedQuestId: questIds[2] });
  assert.deepEqual(legacy.pinnedQuestIds, [questIds[2]]);
});

test("quest journal exposes each active pin without clearing its neighbors", () => {
  const questIds = [
    "atlantian-light-below",
    "sugarcourt-beyond-sugarwind",
    "wood-elf-under-living-light",
  ];
  let book = createQuestBook();
  for (const questId of questIds) {
    const accepted = acceptQuest(book, DEFAULT_QUEST_DEFINITIONS, questId, 100);
    assert.ok(accepted.ok);
    book = pinQuest(accepted.book, questId);
  }
  const html = renderToString(createElement(QuestPanel, {
    book,
    definitions: DEFAULT_QUEST_DEFINITIONS,
    activeTab: "side",
    selectedQuestId: "atlantian-light-below",
    onAccept: () => undefined,
    onPin: () => undefined,
    onAbandon: () => undefined,
    onTurnIn: () => undefined,
  }));
  assert.match(html, /The Light Below/u);
  assert.match(html, /Unpin quest/u);
  assert.match(html, /aria-pressed="true"/u);
  assert.doesNotMatch(html, /The Long-Table Watch/u, "locked side roads stay out of the journal until their prerequisite opens");
});

test("Sea Dragon attributes, nest charts, and live world markers share one deterministic contract", () => {
  const juvenile = seaDragonAttributes(2, 1);
  const elder = seaDragonAttributes(5, 1_000);
  assert.ok(juvenile.swimSpeed > juvenile.flightSpeed && juvenile.flightSpeed > juvenile.walkSpeed);
  assert.ok(elder.swimSpeed > juvenile.swimSpeed);
  assert.ok(elder.maxHealth > juvenile.maxHealth * 4);
  assert.equal(dragonEggCondition("sea", { submerged: true, livingCoral: false }).met, false);
  assert.equal(dragonEggCondition("sea", { submerged: true, livingCoral: true }).met, true);
  const seaEgg = createDragonEgg("sea", { geneticSeed: 0x51ea, eggId: "sea-incubation-audit" });
  const hatched = stepDragonEgg(seaEgg, seaEgg.requiredTicks, { submerged: true, livingCoral: true });
  assert.equal(hatched.hatchling?.type, "sea");
  const elderLoot = rollDragonLoot(createDragonState("sea", { dragonId: "elder-current", ageDays: 124, sex: "female" }), 0x51ea);
  assert.ok(elderLoot.some((entry) => entry.item === "SeaDragonScale" && entry.count >= 35));
  assert.ok(elderLoot.some((entry) => entry.item === "SeaDragonHeart"));
  assert.ok(elderLoot.some((entry) => entry.item === "SeaDragonSkull" && entry.metadata?.type === "sea"));
  const sameA = planSeaDragonNest({ seed: "DEEP-CURRENT", regionX: 10, regionZ: -5, oceanFloorY: -42, biome: "lumen-trench" });
  const sameB = planSeaDragonNest({ seed: "DEEP-CURRENT", regionX: 10, regionZ: -5, oceanFloorY: -42, biome: "lumen-trench" });
  assert.deepEqual(sameA, sameB);
  assert.ok(!sameA || sameA.radius >= 34, "Sea Dragon nests receive the same large-home pass as underground lairs");

  const world = new ChunkWorld();
  world.reset("V1-SEA-DRAGON-LIVE", undefined, { structures: true, enabledFactions: NPC_FACTION_IDS });
  let nest: NonNullable<ReturnType<typeof planSeaDragonNest>> | null = null;
  for (let regionX = -24; regionX <= 24 && !nest; regionX += 1) for (let regionZ = -24; regionZ <= 24 && !nest; regionZ += 1) {
    const probe = planSeaDragonNest({ seed: world.seedText, regionX, regionZ, oceanFloorY: -48, biome: "lumen-trench" });
    if (!probe || probe.guardianStage < 4 || probe.guardianSex !== "female") continue;
    const column = world.sampleColumn(probe.center.x, probe.center.z);
    if (![BiomeId.DeepOcean, BiomeId.LumenTrench].includes(column.biome) || column.height > column.waterline - 8) continue;
    nest = planSeaDragonNest({
      seed: world.seedText, regionX, regionZ, oceanFloorY: column.height,
      biome: column.biome === BiomeId.LumenTrench ? "lumen-trench" : "deep-ocean",
    });
  }
  assert.ok(nest, "bounded regions contain a valid abyssal nest");
  assert.ok(nest.radius >= 34 && nest.radius <= 40, "Sea Dragon nests use the enlarged bounded abyssal footprint");
  const chart = useDragonLairSurveyCharter({
    seed: world.seedText,
    origin: { x: nest.center.x + 500, z: nest.center.z + 500 },
    dragonType: "sea",
    minimumStage: 3,
    maxRegionRadius: 32,
    surfaceYAt: (x, z) => world.sampleColumn(x, z).height,
    isSeaDragonNestBiome: (x, z) => [BiomeId.DeepOcean, BiomeId.LumenTrench].includes(world.sampleColumn(x, z).biome),
  });
  assert.equal(chart.outcome, "revealed");
  assert.equal(chart.survey?.dragonType, "sea");
  const impossibleChart = useDragonLairSurveyCharter({
    seed: world.seedText,
    origin: { x: 0, z: 0 },
    dragonType: "sea",
    minimumStage: 3,
    maxRegionRadius: 4,
    surfaceYAt: () => -48,
    isSeaDragonNestBiome: () => false,
  });
  assert.equal(impossibleChart.outcome, "none-found", "charts never reveal a theoretical nest outside a valid sea biome");
  const generated = [];
  for (let cx = Math.floor((nest.center.x - nest.radius) / 16); cx <= Math.floor((nest.center.x + nest.radius) / 16); cx += 1) {
    for (let cz = Math.floor((nest.center.z - nest.radius) / 16); cz <= Math.floor((nest.center.z + nest.radius) / 16); cz += 1) generated.push(world.generateChunk(cx, cz));
  }
  assert.ok(generated.some((chunk) => [...chunk.blocks].includes(BlockId.MoonSlate)));
  assert.ok(generated.some((chunk) => [...chunk.blocks].includes(BlockId.SeaDragonEggBlock)), "female nest authors a physical Sea Dragon egg");
  assert.ok([...world.structureMarkers.values()].some((marker) => marker.type === "spawn" && marker.mobKind === "sea-dragon" && marker.tags?.includes("permanent:true")));
  assert.ok([...world.structureMarkers.values()].some((marker) => marker.type === "landmark" && marker.id === nest!.id));
  const hoard = [...world.structureMarkers.values()].find((marker) => marker.type === "chest" && marker.id === `${nest!.id}:hoard`);
  assert.ok(hoard && hoard.type === "chest");
  assert.ok(hoard.loot?.some((entry) => entry.itemKey === "sea-dragon-scale"));
  assert.ok(hoard.loot?.some((entry) => entry.itemKey === "water-breathing-potion"));
  world.dispose();
});

test("Deepgear and Glimmerwood luminous blocks enter the real world light index", () => {
  const world = new ChunkWorld();
  world.reset("V1-LIGHT-INDEX");
  const chunk = world.generateChunk(0, 0);
  chunk.blocks.fill(BlockId.Air);
  chunk.lightIndices.clear();
  const lightTypes = [
    BlockId.DeepgearLantern,
    BlockId.Moonpetal,
    BlockId.Starfern,
    BlockId.Dreamcap,
    BlockId.Lumenreed,
    BlockId.AetherConduit,
    BlockId.Moonwell,
  ];
  lightTypes.forEach((type, index) => world.setBlock(index, 0, 0, type, true, true));
  const indexed = new Set(world.lightSourcesNear(3, 0, 0, 12).map((source) => source.type));
  for (const type of lightTypes) assert.ok(indexed.has(type), `${BLOCKS[type].name} is indexed as a world light`);
  world.dispose();
});

test("Wood Elf Moonwells author a living Glowfin pond instead of a sealed house", () => {
  const world = new ChunkWorld();
  world.reset("WILDERNESS", undefined, { profile: "world-below-v15", settlementPattern: "legacy-scattered-v1" });
  const candidates: SettlementCandidate[] = [];
  for (let regionX = -4; regionX <= 4; regionX += 1) for (let regionZ = -4; regionZ <= 4; regionZ += 1) {
    const candidate = selectSettlementSite({
      worldSeed: world.seedText,
      seed: world.seed,
      regionX,
      regionZ,
      enabledFactions: world.generationOptions.enabledFactions,
      sample: (x, z) => world.sampleColumn(x, z),
    });
    if (candidate) candidates.push(candidate);
  }
  const accepted = candidates.filter((candidate) => settlementWinsSpacingTieBreak(candidate, candidates));
  const woodElf = accepted.find((candidate) => candidate.factionId === "wood-elves");
  assert.ok(woodElf, "generator 15 should allocate a viable Wood Elf settlement in the audit region");
  world.generateChunk(Math.floor(woodElf.center.x / CHUNK_SIZE), Math.floor(woodElf.center.z / CHUNK_SIZE));
  const settlement = world.settlementPlans.get(woodElf.id);
  assert.ok(settlement);
  const moonwell = settlement.layout.buildings.find((building) => building.role === "moonwell");
  assert.ok(moonwell);
  world.generateChunk(Math.floor(moonwell.position.x / 16), Math.floor(moonwell.position.z / 16));
  const surfaceY = world.sampleColumn(moonwell.position.x, moonwell.position.z).height;
  assert.equal(blockContainsWater(world.getBlock(moonwell.position.x, surfaceY, moonwell.position.z)), true);
  assert.ok([
    world.getBlock(moonwell.position.x - 1, surfaceY, moonwell.position.z),
    world.getBlock(moonwell.position.x + 1, surfaceY, moonwell.position.z),
    world.getBlock(moonwell.position.x, surfaceY, moonwell.position.z - 1),
    world.getBlock(moonwell.position.x, surfaceY, moonwell.position.z + 1),
  ].includes(BlockId.Lumenreed));
  assert.ok([...world.structureMarkers.values()].some((marker) => marker.type === "spawn" && marker.mobKind === "glowfin" && marker.tags?.includes("habitat:glimmer-pond")));
  const home = settlement.layout.buildings.find((building) => building.role === "living-home")!;
  world.generateChunk(Math.floor(home.position.x / CHUNK_SIZE), Math.floor(home.position.z / CHUNK_SIZE));
  const homeY = world.sampleColumn(home.position.x, home.position.z).height + 1;
  const chair = home.furniture.find((entry) => entry.kind === "living-chair")!;
  world.generateChunk(Math.floor(chair.position.x / CHUNK_SIZE), Math.floor(chair.position.z / CHUNK_SIZE));
  assert.equal(world.getBlock(chair.position.x, homeY, chair.position.z), BlockId.MoonboughChair);
  assert.equal(world.blockFacingAt(chair.position.x, homeY, chair.position.z), chair.facing, "generated chairs inherit the rotated room facing");
  const bed = home.furniture.find((entry) => entry.kind === "bed")!;
  const bedPlacement = settlementBedBlocksForFacing(bed.facing);
  world.generateChunk(Math.floor((bed.position.x + bedPlacement.dx) / CHUNK_SIZE), Math.floor((bed.position.z + bedPlacement.dz) / CHUNK_SIZE));
  assert.equal(world.getBlock(bed.position.x, homeY, bed.position.z), bedPlacement.foot);
  assert.equal(world.getBlock(bed.position.x + bedPlacement.dx, homeY, bed.position.z + bedPlacement.dz), bedPlacement.head);
  const resident = createSettlementState("world", woodElf, settlement.layout).residents[0];
  const residentBuilding = settlement.layout.buildings.find((building) => building.id === resident.homeBuildingId)!;
  world.generateChunk(Math.floor(resident.position.x / CHUNK_SIZE), Math.floor(resident.position.z / CHUNK_SIZE));
  const residentY = world.sampleColumn(residentBuilding.position.x, residentBuilding.position.z).height + 1;
  const residentMarker = [...world.structureMarkers.values()].find((marker) => marker.type === "spawn" && marker.id === resident.id);
  assert.ok(residentMarker && residentMarker.type === "spawn");
  assert.equal(residentMarker.position.y, residentY);
  assert.equal(residentMarker.radius, 0.25);
  assert.ok(residentMarker.tags?.includes("authored-interior-spawn"));
  world.dispose();
});
