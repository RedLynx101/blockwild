import assert from "node:assert/strict";
import test from "node:test";
import {
  ADVENTURE_DUNGEON_ARCHETYPES,
  ADVENTURE_POI_ARCHETYPES,
  adventureDungeonCandidateForChunk,
  adventureMarkersForChunk,
  adventurePlacementsForChunk,
  adventurePoiCandidateForChunk,
  planAdventureStructure,
  type AdventureDungeonKind,
  type AdventureStructureKind,
} from "../app/game/adventure-content.ts";
import { BLOCKS, BlockId, Item, ITEMS } from "../app/game/data.ts";
import { mapLocationNameFromTag, planHostileAirbornePursuit, resolveStructureLootItem, structureMobSpawnY } from "../app/game/engine.ts";
import { createBirdBehavior } from "../app/game/fauna.ts";
import { createAvatarHeldItemModel } from "../app/game/held-items.ts";
import {
  LEGENDARY_ITEMS,
  isInfiniteDurabilityItem,
  legendaryCombatMultiplier,
  legendaryMiningMultiplier,
} from "../app/game/legendary-items.ts";
import { createMobVisual } from "../app/game/mob-models.ts";
import { ADVENTURE_MOB_ORDER, MOB_DEFS } from "../app/game/mobs.ts";
import { structureLootTable } from "../app/game/structures.ts";
import { BiomeId, ChunkWorld } from "../app/game/world.ts";
import { createMobInspectionSpecs, inspectGrounding } from "../scripts/render-models.ts";

const ORIGIN = { x: 8, y: 48, z: 8 } as const;

test("v1.3 exposes exactly twenty varied POIs and five dungeons", () => {
  assert.equal(ADVENTURE_POI_ARCHETYPES.length, 20);
  assert.equal(new Set(ADVENTURE_POI_ARCHETYPES.map((entry) => entry.kind)).size, 20);
  assert.deepEqual(
    Object.fromEntries(["tiny", "medium", "large"].map((scale) => [scale, ADVENTURE_POI_ARCHETYPES.filter((entry) => entry.scale === scale).length])),
    { tiny: 8, medium: 8, large: 4 },
  );
  assert.equal(ADVENTURE_DUNGEON_ARCHETYPES.length, 5);
  assert.equal(new Set(ADVENTURE_DUNGEON_ARCHETYPES.map((entry) => entry.kind)).size, 5);
  assert.equal(ADVENTURE_DUNGEON_ARCHETYPES.filter((entry) => entry.underground).length, 3);
  assert.equal(ADVENTURE_DUNGEON_ARCHETYPES.filter((entry) => !entry.underground).length, 2);
  assert.equal(new Set(ADVENTURE_DUNGEON_ARCHETYPES.map((entry) => entry.materialIdentity)).size, 5);
  assert.equal(new Set(ADVENTURE_DUNGEON_ARCHETYPES.map((entry) => entry.lightingIdentity)).size, 5);
});

test("all twenty landmark plans are deterministic, bounded and map-discoverable", () => {
  for (const archetype of ADVENTURE_POI_ARCHETYPES) {
    const first = planAdventureStructure(archetype.kind, ORIGIN, "trailbound-adventure");
    const second = planAdventureStructure(archetype.kind, ORIGIN, "trailbound-adventure");
    assert.deepEqual(first, second, `${archetype.kind} must be deterministic`);
    assert.ok(first.placements.length >= 8, `${archetype.kind} needs authored geometry`);
    assert.ok(first.placements.length < 9_000, `${archetype.kind} must remain bounded`);
    assert.equal(first.rooms.length, 0);
    assert.ok(first.markers.some((marker) => marker.type === "landmark" && marker.tag === `adventure-poi:${archetype.kind}`));
    assert.ok(first.bounds.min.x <= first.origin.x && first.bounds.max.x >= first.origin.x);
  }
});

test("every dungeon has three-stage progression, multiple encounters, loot and a map heart", () => {
  for (const archetype of ADVENTURE_DUNGEON_ARCHETYPES) {
    const plan = planAdventureStructure(archetype.kind, ORIGIN, "dungeon-audit");
    const spawns = plan.markers.filter((marker) => marker.type === "spawn");
    const chests = plan.markers.filter((marker) => marker.type === "chest");
    assert.ok(plan.placements.length >= 220, `${archetype.kind} needs substantial multi-room geometry`);
    assert.ok(plan.placements.length < 18_000, `${archetype.kind} must remain bounded`);
    assert.equal(plan.rooms.length, 3);
    assert.deepEqual(plan.rooms.map((room) => room.stage), [1, 2, 3]);
    assert.equal(new Set(plan.rooms.map((room) => room.id)).size, 3);
    assert.ok(plan.rooms.every((room) => room.objective.length >= 35));
    assert.ok(spawns.length >= 4, `${archetype.kind} should contain multiple encounter markers`);
    assert.ok(spawns.some((marker) => marker.tags?.includes("boss")));
    assert.ok(chests.length >= 2, `${archetype.kind} should contain progression and vault loot`);
    assert.ok(chests.every((marker) => marker.loot.length > 0));
    assert.ok(plan.markers.some((marker) => marker.type === "landmark" && marker.tag === `dungeon:${archetype.kind}`));
  }
});

test("all three underground dungeons provide a reversible one-block spiral stair", () => {
  for (const archetype of ADVENTURE_DUNGEON_ARCHETYPES.filter((entry) => entry.underground)) {
    const plan = planAdventureStructure(archetype.kind, ORIGIN, "stair-audit");
    const steps = plan.placements
      .filter((placement) => placement.variant?.includes("stair-step-"))
      .sort((left, right) => Number(left.variant?.split("stair-step-")[1]) - Number(right.variant?.split("stair-step-")[1]));
    assert.equal(steps.length, 18, `${archetype.kind} should author every tread from surface to threshold`);
    assert.equal(steps[0].y, ORIGIN.y);
    assert.equal(steps.at(-1)?.y, ORIGIN.y - 17);
    for (let index = 1; index < steps.length; index += 1) {
      assert.equal(Math.abs(steps[index].x - steps[index - 1].x) + Math.abs(steps[index].z - steps[index - 1].z), 1, "successive treads must share a horizontal edge");
      assert.equal(steps[index].y, steps[index - 1].y - 1, "successive treads may change height by exactly one block");
    }
    const bottom = steps.at(-1)!;
    const threshold = plan.rooms.find((room) => room.stage === 1)!;
    assert.equal(bottom.y, threshold.bounds.min.y, "bottom tread and threshold floor should align");
    assert.ok(plan.placements.some((placement) => placement.block === BlockId.Air
      && placement.variant?.includes("stair-threshold-door")
      && Math.abs(placement.x - bottom.x) + Math.abs(placement.z - bottom.z) === 1), "bottom tread needs an adjacent exit into the first room");

    // Treat every authored solid with two explicit air cells above it as a
    // walkable voxel. A reversible BFS under one-block step rules must reach
    // the center floor of every stage from the surface tread.
    const blockMap = new Map(plan.placements.map((placement) => [`${placement.x},${placement.y},${placement.z}`, placement.block]));
    const walkable = plan.placements.filter((placement) => BLOCKS[placement.block]?.solid
      && blockMap.get(`${placement.x},${placement.y + 1},${placement.z}`) === BlockId.Air
      && blockMap.get(`${placement.x},${placement.y + 2},${placement.z}`) === BlockId.Air);
    const byColumn = new Map<string, typeof walkable>();
    for (const cell of walkable) {
      const key = `${cell.x},${cell.z}`;
      const column = byColumn.get(key) ?? [];
      column.push(cell);
      byColumn.set(key, column);
    }
    const start = steps[0];
    const queue = [start];
    const visited = new Set([`${start.x},${start.y},${start.z}`]);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      for (const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]] as const) {
        for (const neighbor of byColumn.get(`${current.x + dx},${current.z + dz}`) ?? []) {
          if (Math.abs(neighbor.y - current.y) > 1) continue;
          const key = `${neighbor.x},${neighbor.y},${neighbor.z}`;
          if (!visited.has(key)) { visited.add(key); queue.push(neighbor); }
        }
      }
    }
    for (const room of plan.rooms) {
      const centerX = Math.round((room.bounds.min.x + room.bounds.max.x) / 2);
      const centerZ = Math.round((room.bounds.min.z + room.bounds.max.z) / 2);
      const target = `${centerX},${room.bounds.min.y},${centerZ}`;
      assert.ok(visited.has(target), `${archetype.kind} stage ${room.stage} is not reversibly reachable from the surface`);
    }
  }
});

test("dungeon loot includes usable spell opportunities and resolvable legendary provenance", () => {
  const dungeonTables = ["rootbound-vault", "starless-vault", "brassdeep-vault", "stormglass-vault", "bloomrot-vault"] as const;
  const allKeys = dungeonTables.flatMap((table) => {
    const definition = structureLootTable(table);
    return [...definition.entries, ...definition.bonuses].map((entry) => entry.itemKey);
  });
  assert.ok(allKeys.some((key) => key.startsWith("tome-")), "the dungeon set should contain spell-tome opportunities");
  for (const key of allKeys) assert.notEqual(resolveStructureLootItem(key), null, `${key} should resolve to a concrete inventory item`);
  for (const legendary of Object.values(LEGENDARY_ITEMS)) {
    assert.equal(ITEMS[legendary.item].rarity, "legendary");
    assert.ok(legendary.provenance.length >= 1);
    assert.ok(legendary.provenance.every((source) => allKeys.includes(legendary.id) && dungeonTables.includes(source.lootTable)));
  }
});

test("adventure plans partition exactly across negative and positive chunk seams", () => {
  const kinds = [...ADVENTURE_POI_ARCHETYPES.map((entry) => entry.kind), ...ADVENTURE_DUNGEON_ARCHETYPES.map((entry) => entry.kind)] as AdventureStructureKind[];
  for (const [index, kind] of kinds.entries()) {
    const origin = { x: index % 2 ? -8 : 8, y: 44, z: index % 3 ? 8 : -8 };
    const plan = planAdventureStructure(kind, origin, "seam-audit");
    const placements = new Set<string>();
    const markers = new Set<string>();
    for (let cx = Math.floor(plan.bounds.min.x / 16); cx <= Math.floor(plan.bounds.max.x / 16); cx += 1) {
      for (let cz = Math.floor(plan.bounds.min.z / 16); cz <= Math.floor(plan.bounds.max.z / 16); cz += 1) {
        for (const block of adventurePlacementsForChunk(plan, cx, cz)) placements.add(`${block.x},${block.y},${block.z}`);
        for (const marker of adventureMarkersForChunk(plan, cx, cz)) markers.add(`${marker.type}:${marker.id}:${marker.position.x},${marker.position.y},${marker.position.z}`);
      }
    }
    assert.equal(placements.size, plan.placements.length, `${kind} lost or duplicated a block across seams`);
    assert.equal(markers.size, plan.markers.length, `${kind} lost or duplicated a marker across seams`);
  }
});

test("regional candidates are repeatable at positive and negative coordinates", () => {
  const poiResults = [];
  for (let cx = -12; cx < 0; cx += 1) for (let cz = 12; cz < 24; cz += 1) {
    const input = { seed: "candidate-stability", chunkX: cx, chunkZ: cz, biome: "forest" as const };
    const first = adventurePoiCandidateForChunk(input);
    assert.equal(first, adventurePoiCandidateForChunk(input));
    if (first) poiResults.push(first);
  }
  assert.equal(poiResults.length, 1, "one POI candidate belongs to a 12x12 region");

  const dungeonResults: AdventureDungeonKind[] = [];
  for (let cx = -36; cx < 0; cx += 1) for (let cz = 0; cz < 36; cz += 1) {
    const input = { seed: "candidate-stability", chunkX: cx, chunkZ: cz, biome: "highlands" as const };
    const result = adventureDungeonCandidateForChunk(input);
    if (result) dungeonResults.push(result);
  }
  assert.equal(dungeonResults.length, 1, "one dungeon candidate belongs to a 36x36 region");
});

test("coastal adventure candidates stamp real geometry, landmarks and encounter loot", () => {
  const world = new ChunkWorld();
  world.reset("coast-audit");
  const found = new Map<string, { chunkX: number; chunkZ: number }>();
  for (let chunkX = -160; chunkX <= 160 && found.size < 2; chunkX += 1) {
    for (let chunkZ = -160; chunkZ <= 160 && found.size < 2; chunkZ += 1) {
      const originX = chunkX * 16 + 8;
      const originZ = chunkZ * 16 + 8;
      const column = world.sampleColumn(originX, originZ);
      if (column.biome !== BiomeId.Beach || column.height < column.waterline) continue;
      const kind = adventurePoiCandidateForChunk({ seed: world.seedText, chunkX, chunkZ, biome: "coast" });
      if (kind === "sunwash-tidepool" || kind === "saltwind-lighthouse") found.set(kind, { chunkX, chunkZ });
    }
  }
  assert.deepEqual([...found.keys()].sort(), ["saltwind-lighthouse", "sunwash-tidepool"]);
  for (const [kind, candidate] of found) {
    const originX = candidate.chunkX * 16 + 8;
    const originZ = candidate.chunkZ * 16 + 8;
    const surfaceY = world.sampleColumn(originX, originZ).height;
    const plan = planAdventureStructure(kind as AdventureStructureKind, { x: originX, y: surfaceY, z: originZ }, world.seedText);
    world.generateChunk(candidate.chunkX, candidate.chunkZ);
    const stamped = adventurePlacementsForChunk(plan, candidate.chunkX, candidate.chunkZ).find((placement) => placement.block !== BlockId.Air);
    assert.ok(stamped && world.getBlock(stamped.x, stamped.y, stamped.z) === stamped.block, `${kind} geometry should reach the live chunk`);
    const liveMarkers = [...world.structureMarkers.entries()].filter(([key]) => key.startsWith(plan.id));
    assert.ok(liveMarkers.some(([, marker]) => marker.type === "landmark" && marker.tag === `adventure-poi:${kind}`));
    if (kind === "saltwind-lighthouse") {
      assert.ok(liveMarkers.some(([, marker]) => marker.type === "chest" && marker.loot.length > 0));
      assert.ok(liveMarkers.some(([, marker]) => marker.type === "spawn" && marker.mobKind === "vaultwing"));
    }
  }
  world.dispose();
});

test("dungeon spawn grounding stays inside authored rooms and flying markers retain height", () => {
  let surfaceQueries = 0;
  const markerY = -16;
  const world = {
    getBlock: (_x: number, y: number) => y === markerY - 1 || y === markerY + 5 ? BlockId.Stone : BlockId.Air,
    findWalkableY: () => { surfaceQueries += 1; return markerY + 5; },
  };
  assert.equal(
    structureMobSpawnY(world as never, "rootwrithe", 0, 0, markerY, ["dungeon", "stage-1"]),
    markerY - 1 + MOB_DEFS.rootwrithe.footOffset,
  );
  assert.equal(structureMobSpawnY(world as never, "vaultwing", 0, 0, markerY, ["dungeon", "stage-2"]), markerY);
  assert.equal(surfaceQueries, 0, "authored dungeon spawns must never scan upward onto a roof");
  assert.equal(structureMobSpawnY(world as never, "fire-dragon", 0, 0, markerY, ["dragon-lair:fire"]), markerY + 5 + MOB_DEFS["fire-dragon"].footOffset);
  assert.equal(surfaceQueries, 1, "legacy dragon guardians should retain their established ground scan");
});

test("Vaultwings initialize in airborne route mode and map tags retain specific names", () => {
  assert.equal(MOB_DEFS.vaultwing.movement, "flying");
  assert.equal(createBirdBehavior("vaultwing").mode, "flight");
  assert.equal(mapLocationNameFromTag("adventure-poi:saltwind-lighthouse"), "Saltwind Lighthouse");
  assert.equal(mapLocationNameFromTag("dungeon:rootbound-labyrinth"), "Rootbound Labyrinth");
  assert.notEqual(mapLocationNameFromTag("dungeon:rootbound-labyrinth"), "Dungeon");

  const closing = planHostileAirbornePursuit({ hostile: MOB_DEFS.vaultwing.hostile, aware: true, distance: 8, chaseSpeed: MOB_DEFS.vaultwing.chaseSpeed, reach: MOB_DEFS.vaultwing.attackRange, cooldownSeconds: 0, dt: 0.1 });
  assert.ok(closing.advance > 0 && closing.nextDistance < 8 && !closing.attacks, "an aware Vaultwing should close a distant three-dimensional gap");
  const striking = planHostileAirbornePursuit({ hostile: MOB_DEFS.vaultwing.hostile, aware: true, distance: MOB_DEFS.vaultwing.attackRange, chaseSpeed: MOB_DEFS.vaultwing.chaseSpeed, reach: MOB_DEFS.vaultwing.attackRange, cooldownSeconds: 0, dt: 0.1 });
  assert.equal(striking.attacks, true, "a Vaultwing inside reach should damage after its cooldown");
  const emberjay = planHostileAirbornePursuit({ hostile: MOB_DEFS.emberjay.hostile, aware: true, distance: 2, chaseSpeed: MOB_DEFS.emberjay.chaseSpeed, reach: MOB_DEFS.emberjay.attackRange, cooldownSeconds: 0, dt: 0.1 });
  assert.deepEqual(emberjay, { advance: 0, nextDistance: 2, attacks: false }, "ordinary Emberjays must retain nonhostile bird behavior");
});

test("six new authored encounter creatures have rich metadata and production rigs", () => {
  assert.equal(ADVENTURE_MOB_ORDER.length, 6);
  assert.equal(new Set(ADVENTURE_MOB_ORDER).size, 6);
  const inspection = new Map(createMobInspectionSpecs().map((spec) => [spec.id, spec]));
  for (const kind of ADVENTURE_MOB_ORDER) {
    const definition = MOB_DEFS[kind];
    assert.ok(definition.behavior.length > 90, `${kind} needs meaningful AI notes`);
    assert.ok(definition.lore.length > 80, `${kind} needs authored lore`);
    assert.ok(definition.discoveryHint && definition.utility);
    assert.ok(definition.drops.length >= 2);
    const model = createMobVisual(kind, 731);
    let meshes = 0;
    model.group.traverse((object) => { if (object instanceof Object && object.type === "Mesh") meshes += 1; });
    assert.ok(meshes >= 14, `${kind} should be a detailed production model`);
    const spec = inspection.get(kind);
    assert.ok(spec && spec.boxes.length >= 14);
    if (!definition.flying && !definition.aquatic) {
      const grounding = inspectGrounding(spec);
      assert.ok(Math.abs(grounding.groundDelta) < 0.001, `${kind} ground delta ${grounding.groundDelta} is visible at runtime`);
    }
  }
});

test("adventure creature limb pivots attach outward and preserve animation axes", () => {
  const scarab = createMobVisual("auric-scarab", 732);
  assert.equal(scarab.parts.legs.length, 6, "the scarab needs three articulated legs per side");
  for (const leg of scarab.parts.legs) {
    const side = Number(leg.userData.side);
    assert.ok(side === -1 || side === 1);
    assert.ok(leg.rotation.z * side < 0, "a local-X scarab leg must angle down as it extends outward");
    const restZ = leg.rotation.z;
    leg.rotation.x = Math.sin(1.1 + Number(leg.userData.phase ?? 0)) * 0.34;
    assert.equal(leg.rotation.z, restZ, "the runtime gait axis must not erase the authored hip angle");
    assert.ok(leg.children.some((child) => child.name.endsWith("-knee")), "each upper leg should own its lower joint");
  }

  for (const [kind, expectedArms] of [["rootwrithe", 2], ["bellroot-matron", 3]] as const) {
    const model = createMobVisual(kind, 733);
    const legSwingAmplitude = kind === "rootwrithe" ? 0.18 : 0.12;
    assert.equal(model.parts.legs.length, 4, `${kind} should retain four attached roots`);
    assert.equal(model.parts.arms.length, expectedArms, `${kind} arm count should match its authored silhouette`);
    for (const root of model.parts.legs) {
      const side = Number(root.userData.side);
      assert.ok(root.rotation.z * side > 0, `${kind} roots should splay outward instead of crossing inward`);
      const restZ = root.rotation.z;
      root.rotation.x = Math.sin(1.1 + Number(root.userData.phase ?? 0)) * legSwingAmplitude;
      assert.equal(root.rotation.z, restZ);
    }
    for (const arm of model.parts.arms.filter((part) => Number(part.userData.side) !== 0)) {
      const side = Number(arm.userData.side);
      assert.ok(arm.rotation.z * side > 0, `${kind} side arms should descend outward from their shoulders`);
      const restZ = arm.rotation.z;
      arm.rotation.x = Math.sin(1.1 + Number(arm.userData.phase ?? 0)) * 0.5 - 1.1;
      assert.equal(arm.rotation.z, restZ, "the attack sweep must retain the shoulder attachment angle");
      assert.ok(arm.children.some((child) => child.name.endsWith("-elbow")), "hands and forearms should be parented through an elbow");
    }
  }
});

test("legendary heirlooms have stable ids, real models and concrete mechanics", () => {
  assert.deepEqual([Item.DawnthreadSaber, Item.DeepdelversPromise, Item.BriarheartCrook], [434, 435, 436]);
  assert.equal(isInfiniteDurabilityItem(Item.DawnthreadSaber), true);
  assert.equal(isInfiniteDurabilityItem(Item.DeepdelversPromise), true);
  assert.equal(isInfiniteDurabilityItem(Item.BriarheartCrook), false);
  assert.equal(legendaryCombatMultiplier(Item.DawnthreadSaber, { hostile: true, family: "undead" }), 1.35);
  assert.equal(legendaryCombatMultiplier(Item.BriarheartCrook, { hostile: true, family: "surface" }), 1.2);
  assert.equal(legendaryMiningMultiplier(Item.DeepdelversPromise, BlockId.Deepstone), 1.5);
  assert.equal(legendaryMiningMultiplier(Item.DeepdelversPromise, BlockId.Dirt), 1);
  for (const item of [Item.DawnthreadSaber, Item.DeepdelversPromise, Item.BriarheartCrook]) {
    const model = createAvatarHeldItemModel(item);
    assert.ok(model, `${ITEMS[item].name} needs a held model`);
    let meshes = 0;
    model.traverse((object) => { if (object.type === "Mesh") meshes += 1; });
    assert.ok(meshes >= 5, `${ITEMS[item].name} needs a crafted silhouette rather than one block`);
  }
});
