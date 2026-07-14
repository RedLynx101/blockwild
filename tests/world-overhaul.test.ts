import assert from "node:assert/strict";
import test from "node:test";

import * as THREE from "three";

import { caveEntranceForCell } from "../app/game/caves.ts";
import { creatureHasCustomSound } from "../app/game/creature-sounds.ts";
import { BLOCKS, BlockId, ITEMS, Item, RECIPES, SMELTING, itemForBlock } from "../app/game/data.ts";
import { deepgearLiftDestinationY, resolveStructureLootItem } from "../app/game/engine.ts";
import { undergroundMobSpawnTableForBiome } from "../app/game/fauna.ts";
import { resourceItemCode } from "../app/game/hearthroads-adapter.ts";
import {
  MAP_WATER_SURFACE_COLOR,
  createMapKnowledge,
  mapSurfaceQuadrantColor,
  mapViewportProjection,
  markUndergroundChunk,
  normalizeMapKnowledge,
  undergroundSampleForBand,
} from "../app/game/map-system.ts";
import { applyOceanCreaturePose, applyWildlifePose, createMobVisual } from "../app/game/mob-models.ts";
import { MOB_DEFS, UNDERGROUND_MOB_ORDER } from "../app/game/mobs.ts";
import { validatePayload } from "../app/game/multiplayer.ts";
import {
  CAVE_GRAPH_LAYER_Y,
  UndergroundBiomeId,
  caveGraphEdgesInBounds,
  caveGraphNodesInBounds,
  nearestUpperCaveNode,
} from "../app/game/underground.ts";
import {
  BIOME_NAMES,
  BiomeId,
  CHUNK_SIZE,
  DEFAULT_WORLD_GENERATION_OPTIONS,
  GENERATOR_VERSION,
  MAX_Y,
  MIN_Y,
  SEA_LEVEL,
  surfaceRegionAt,
  WORLD_HEIGHT,
  ChunkWorld,
} from "../app/game/world.ts";
import { migrateLegacyWorldSave } from "../app/game/world-storage.ts";
import { buildUndergroundEcologyAudit } from "../scripts/audit-biome-ecology.ts";
import { caveAudit, dwarfHoldAudit, generatedContentAudit, surfaceAudit } from "../scripts/audit-world-overhaul.ts";

const OVERHAUL_PROFILE = { profile: "world-below-v15" as const };

test("The World Below profile keeps the locked dimensions and deterministically expands surface identity", () => {
  assert.deepEqual({ minimum: MIN_Y, sea: SEA_LEVEL, maximum: MAX_Y, height: WORLD_HEIGHT }, {
    minimum: -64,
    sea: 32,
    maximum: 127,
    height: 192,
  });
  assert.equal(DEFAULT_WORLD_GENERATION_OPTIONS.profile, "world-below-v15");
  assert.equal(DEFAULT_WORLD_GENERATION_OPTIONS.biomeScale, 1.35);

  const first = new ChunkWorld();
  const second = new ChunkWorld();
  const legacy = new ChunkWorld();
  first.reset("WILDERNESS", undefined, OVERHAUL_PROFILE);
  second.reset("WILDERNESS", undefined, OVERHAUL_PROFILE);
  legacy.reset("WILDERNESS", undefined, { profile: "legacy-v14" });
  const probes = [[0, 0], [384, -768], [1_536, 2_048], [-3_072, 1_024]] as const;
  assert.deepEqual(probes.map(([x, z]) => first.sampleColumn(x, z)), probes.map(([x, z]) => second.sampleColumn(x, z)));
  assert.ok(probes.some(([x, z]) => first.sampleColumn(x, z).height !== legacy.sampleColumn(x, z).height
    || first.sampleColumn(x, z).biome !== legacy.sampleColumn(x, z).biome));
  assert.ok(first.generateChunk(0, 0).blocks instanceof Uint16Array);
});

test("surface audit finds every biome while preserving flats and restoring mountain drama", () => {
  const world = new ChunkWorld();
  world.reset("WILDERNESS", undefined, OVERHAUL_PROFILE);
  const audit = surfaceAudit(world);
  const metric = (id: BiomeId) => audit.biomes.find((entry) => entry.biome === BIOME_NAMES[id])!;
  assert.equal(audit.biomeCoverage, 24);
  assert.ok(audit.waterCoverage + audit.coastlineShare < 60);
  assert.ok(audit.landTransitionRate < 30);
  assert.ok(metric(BiomeId.Meadow).meanRelief32 < 8);
  assert.ok(metric(BiomeId.Siltfen).meanRelief32 < 8);
  assert.ok(metric(BiomeId.Highlands).meanElevation >= 60);
  assert.ok(metric(BiomeId.Highlands).elevationRange[1] >= 80);
  assert.ok(metric(BiomeId.SnowcapRange).meanElevation >= 90);
  assert.ok(metric(BiomeId.SnowcapRange).elevationRange[1] >= 100 && metric(BiomeId.SnowcapRange).elevationRange[1] <= MAX_Y);
  assert.ok(metric(BiomeId.Volcanic).meanRelief32 >= 8);
});

test("regional terrain formulas fade out before neighboring biome cores meet", () => {
  const world = new ChunkWorld();
  world.reset("WILDERNESS", undefined, OVERHAUL_PROFILE);
  let boundarySamples = 0;
  let maximumStep = 0;
  for (let z = -720; z <= 720; z += 12) for (let x = -720; x <= 720; x += 4) {
    const column = world.sampleColumn(x, z);
    const region = surfaceRegionAt(world.seed, x / 1.35, z / 1.35, column.temperature, column.moisture);
    if (region.boundary < 0.88 || column.height <= SEA_LEVEL + 2) continue;
    boundarySamples += 1;
    maximumStep = Math.max(
      maximumStep,
      Math.abs(column.height - world.sampleColumn(x + 1, z).height),
      Math.abs(column.height - world.sampleColumn(x, z + 1).height),
    );
  }
  assert.ok(boundarySamples > 100, "the fixture should cross several regional boundary belts");
  assert.ok(maximumStep <= 6, `one-block biome-boundary terrain step reached ${maximumStep} blocks`);
});

test("cave graph is looped, aquifer-linked, and a real mouth flood-fills to its upper hub", () => {
  const world = new ChunkWorld();
  world.reset("WILDERNESS", undefined, OVERHAUL_PROFILE);
  const audit = caveAudit(world);
  assert.equal(audit.components, 1);
  assert.equal(audit.deadEnds, 0);
  assert.ok(audit.loops > 1_000);
  assert.ok(audit.connectedMouthPercent >= 95);
  assert.ok((audit.minimumReachableDepth ?? 0) >= 25);
  assert.ok(audit.greatCaverns > 0 && audit.cathedralCaverns > 0);
  assert.ok(audit.undergroundStreams > 0 && audit.waterfalls > 0);
  assert.deepEqual(CAVE_GRAPH_LAYER_Y, [-42, -18, 4]);

  let fixture: Readonly<{
    entrance: NonNullable<ReturnType<typeof caveEntranceForCell>>;
    target: ReturnType<typeof nearestUpperCaveNode>;
    surface: ReturnType<ChunkWorld["sampleColumn"]>;
    distance: number;
  }> | null = null;
  for (let cellX = -4; cellX <= 4; cellX += 1) for (let cellZ = -4; cellZ <= 4; cellZ += 1) {
    const entrance = caveEntranceForCell(world.seed, cellX, cellZ);
    if (!entrance) continue;
    const surface = world.sampleColumn(entrance.centerX, entrance.centerZ);
    if (surface.height <= surface.waterline + 3) continue;
    const target = nearestUpperCaveNode(world.seed, entrance.centerX, entrance.centerZ);
    const distance = Math.hypot(entrance.centerX - target.x, entrance.centerZ - target.z);
    if (!fixture || distance < fixture.distance) fixture = { entrance, target, surface, distance };
  }
  assert.ok(fixture);
  const { entrance, target, surface } = fixture;
  const minimumX = Math.min(entrance.centerX, target.x) - 8;
  const maximumX = Math.max(entrance.centerX, target.x) + 8;
  const minimumZ = Math.min(entrance.centerZ, target.z) - 8;
  const maximumZ = Math.max(entrance.centerZ, target.z) + 8;
  for (let cx = Math.floor(minimumX / CHUNK_SIZE); cx <= Math.floor(maximumX / CHUNK_SIZE); cx += 1) {
    for (let cz = Math.floor(minimumZ / CHUNK_SIZE); cz <= Math.floor(maximumZ / CHUNK_SIZE); cz += 1) world.generateChunk(cx, cz);
  }
  const start = { x: entrance.centerX, y: surface.height - 1, z: entrance.centerZ };
  const minimumY = target.y - 5;
  const maximumY = surface.height;
  const queue = [start];
  const visited = new Set([`${start.x},${start.y},${start.z}`]);
  let reached = false;
  for (let cursor = 0; cursor < queue.length && !reached; cursor += 1) {
    const point = queue[cursor];
    if (Math.abs(point.x - target.x) <= 2 && Math.abs(point.y - target.y) <= 2 && Math.abs(point.z - target.z) <= 2) {
      reached = true;
      break;
    }
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
      const next = { x: point.x + dx, y: point.y + dy, z: point.z + dz };
      if (next.x < minimumX || next.x > maximumX || next.z < minimumZ || next.z > maximumZ || next.y < minimumY || next.y > maximumY) continue;
      const key = `${next.x},${next.y},${next.z}`;
      if (visited.has(key) || BLOCKS[world.getBlock(next.x, next.y, next.z) ?? BlockId.Bedrock]?.solid) continue;
      visited.add(key);
      queue.push(next);
    }
  }
  assert.equal(reached, true, "the authored mouth should physically flood-fill into its graph hub");
});

test("dry graph tunnels seal legacy aquifer fluids behind a rock shell", () => {
  const world = new ChunkWorld();
  world.reset("WILDERNESS", undefined, OVERHAUL_PROFILE);
  const edge = caveGraphEdgesInBounds(world.seed, -384, 384, -384, 384).find((candidate) => {
    if (candidate.flow !== "dry") return false;
    const midpointX = (candidate.from.x + candidate.to.x) / 2;
    const midpointZ = (candidate.from.z + candidate.to.z) / 2;
    const localX = ((Math.round(midpointX) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    const localZ = ((Math.round(midpointZ) % CHUNK_SIZE) + CHUNK_SIZE) % CHUNK_SIZE;
    return localX >= 5 && localX <= 10 && localZ >= 5 && localZ <= 10;
  });
  assert.ok(edge, "the fixture should contain an interior dry graph edge");
  const phase = edge.from.x * 0.031 + edge.from.z * 0.023;
  const center = {
    x: Math.round((edge.from.x + edge.to.x) / 2 + Math.sin(Math.PI * 2 + phase) * 0.7),
    y: Math.round((edge.from.y + edge.to.y) / 2),
    z: Math.round((edge.from.z + edge.to.z) / 2 - Math.sin(Math.PI * 2 + phase) * 0.7 * 0.65),
  };
  const centerChunkX = Math.floor(center.x / CHUNK_SIZE);
  const centerChunkZ = Math.floor(center.z / CHUNK_SIZE);
  for (let cx = centerChunkX - 1; cx <= centerChunkX + 1; cx += 1) for (let cz = centerChunkZ - 1; cz <= centerChunkZ + 1; cz += 1) world.generateChunk(cx, cz);
  let checkedAir = 0;
  for (let x = center.x - 2; x <= center.x + 2; x += 1) for (let y = center.y - 2; y <= center.y + 2; y += 1) for (let z = center.z - 2; z <= center.z + 2; z += 1) {
    if (world.getBlock(x, y, z) !== BlockId.Air) continue;
    checkedAir += 1;
    for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const) {
      const neighbor = world.getBlock(x + dx, y + dy, z + dz);
      assert.notEqual(neighbor, BlockId.Water, "dry tunnel air must not directly expose legacy aquifer water");
      assert.notEqual(neighbor, BlockId.Lava, "dry tunnel air must not directly expose legacy lava pockets");
    }
  }
  assert.ok(checkedAir > 8, "the midpoint should remain a navigable dry tunnel");
});

test("six ecological centers exceed minimum biodiversity while ordinary tunnels retain light contrast", () => {
  const ecology = buildUndergroundEcologyAudit();
  assert.equal(ecology.length, 7);
  for (const row of ecology.filter((entry) => entry.id !== UndergroundBiomeId.OrdinaryTunnel)) {
    assert.ok(row.flora >= 3, `${row.name} flora floor`);
    assert.ok(row.fauna >= 6, `${row.name} fauna floor`);
    assert.ok(row.common >= 3, `${row.name} common-species floor`);
    assert.ok(row.conditional >= 2, `${row.name} conditional-species floor`);
    assert.ok(row.rare >= 1, `${row.name} rare-species floor`);
    assert.ok(row.poiCount >= 4, `${row.name} landmark floor`);
  }
  assert.equal(ecology[UndergroundBiomeId.OrdinaryTunnel].flora, 0);

  const world = new ChunkWorld();
  world.reset("WILDERNESS", undefined, OVERHAUL_PROFILE);
  const starbloom = caveGraphNodesInBounds(world.seed, -384, 384, -384, 384)
    .filter((node) => node.biome === UndergroundBiomeId.StarbloomHollows && Math.abs(node.x) <= 384 && Math.abs(node.z) <= 384)
    .sort((left, right) => right.ecologyRadius - left.ecologyRadius)[0];
  const centerChunkX = Math.floor(starbloom.x / CHUNK_SIZE);
  const centerChunkZ = Math.floor(starbloom.z / CHUNK_SIZE);
  for (let cx = centerChunkX - 1; cx <= centerChunkX + 1; cx += 1) for (let cz = centerChunkZ - 1; cz <= centerChunkZ + 1; cz += 1) world.generateChunk(cx, cz);
  const luminous = new Set<BlockId>([
    BlockId.LuminousRoot, BlockId.StarbloomCap, BlockId.LuminousGills, BlockId.LanternBloom,
    BlockId.GlowmossCarpet, BlockId.LuminousAlgae, BlockId.ResonantCrystal, BlockId.CrystalCluster,
    BlockId.FumaroleVent, BlockId.LivingVein, BlockId.VeinmetalHeart,
  ]);
  let ecologicalLights = 0;
  let ordinaryLights = 0;
  for (const chunk of world.chunks.values()) for (let localX = 0; localX < CHUNK_SIZE; localX += 1) {
    for (let localZ = 0; localZ < CHUNK_SIZE; localZ += 1) for (let y = MIN_Y; y <= MAX_Y; y += 1) {
      const x = chunk.cx * CHUNK_SIZE + localX;
      const z = chunk.cz * CHUNK_SIZE + localZ;
      if (!luminous.has(world.getBlock(x, y, z) ?? BlockId.Air)) continue;
      if (world.undergroundBiomeAt(x, y, z) === UndergroundBiomeId.OrdinaryTunnel) ordinaryLights += 1;
      else ecologicalLights += 1;
    }
  }
  assert.ok(ecologicalLights >= 100);
  assert.ok(ecologicalLights > ordinaryLights * 2, "ecological centers should concentrate the underground glow");
});

test("all nine signature creatures have authored models, animation contracts, field notes, sounds, and spawn roles", () => {
  assert.equal(UNDERGROUND_MOB_ORDER.length, 9);
  const secondPassDetails: Readonly<Record<string, readonly string[]>> = {
    "grotto-grazer": ["split-lip-muzzle", "left-antler-tine-1", "tail-moss-brush"],
    lanternray: ["left-lantern-organ", "left-cephalic-lobe", "left-tail-streamer"],
    "prismtail-swift": ["crystal-beak", "left-prismatic-primary-1", "prism-tail-feather-3"],
    "glassback-newt": ["glass-plate-edge-4", "front-left-webbed-foot", "left-gill-tip-1"],
    "sailfin-skimmer": ["copper-brow", "sail-panel-4", "left-current-feeler"],
    "ashnose-bat": ["heat-leaf-nose", "left-wing-finger-1", "left-roost-claw-2"],
    chimewing: ["crown-vane-2", "left-wing-chime", "tail-chime-2"],
    "cinder-kite": ["furnace-beak", "left-ember-vein-1", "back-vent-1"],
    veinling: ["unresolved-heart", "left-face-fracture", "front-left-repair-prong-2"],
  };
  for (const kind of UNDERGROUND_MOB_ORDER) {
    const definition = MOB_DEFS[kind];
    assert.equal(definition.family, "underground");
    assert.ok((definition.fieldNotes?.length ?? 0) >= 2, `${definition.name} field notes`);
    assert.ok(definition.discoveryHint, `${definition.name} discovery hint`);
    assert.equal(creatureHasCustomSound(kind), true, `${definition.name} custom sound`);
    assert.ok(Object.values(UndergroundBiomeId).filter((value): value is UndergroundBiomeId => typeof value === "number")
      .some((biome) => undergroundMobSpawnTableForBiome(biome).some(([spawnKind]) => spawnKind === kind)));
    const visual = createMobVisual(kind, 17);
    assert.equal(visual.visual.userData.wildlifeRig, kind);
    assert.ok(visual.parts.body.length + visual.parts.head.length + visual.parts.wings.length + visual.parts.legs.length > 0);
    let meshCount = 0;
    visual.visual.traverse((part) => { if (part instanceof THREE.Mesh) meshCount += 1; });
    assert.ok(meshCount >= 25, `${definition.name} retains its detailed second-pass silhouette`);
    for (const detail of secondPassDetails[kind]) assert.ok(visual.visual.getObjectByName(`${kind}-${detail}`), `${definition.name}: ${detail}`);
    assert.doesNotThrow(() => {
      applyWildlifePose(visual.visual, kind, 1.25, 0.7, 0.3);
      applyOceanCreaturePose(visual.visual, kind, 1.25, 0.7, 0.5);
    });
  }
  assert.equal(MOB_DEFS.lanternray.movement, "flying");
  assert.equal(MOB_DEFS["sailfin-skimmer"].flying, true);
  assert.equal(MOB_DEFS["sailfin-skimmer"].aquatic, true);
});

test("every second-pass creature silhouette keeps a visible articulated detail", () => {
  const animatedDetails = [
    ["grotto-grazer", "grotto-grazer-back-root-1", "rotation-z", "wildlife"],
    ["lanternray", "lanternray-left-lantern-organ", "scale-x", "ocean"],
    ["prismtail-swift", "prismtail-swift-prism-tail-feather-3", "rotation-x", "wildlife"],
    ["glassback-newt", "glassback-newt-left-gill-1", "rotation-x", "wildlife"],
    ["sailfin-skimmer", "sailfin-skimmer-dorsal-sail-pivot", "rotation-z", "ocean"],
    ["ashnose-bat", "ashnose-bat-heat-leaf-nose", "scale-x", "wildlife"],
    ["chimewing", "chimewing-left-wing-chime", "rotation-z", "wildlife"],
    ["cinder-kite", "cinder-kite-back-vent-1", "scale-x", "wildlife"],
    ["veinling", "veinling-unresolved-heart", "scale-x", "wildlife"],
  ] as const;
  const readChannel = (part: THREE.Object3D, channel: typeof animatedDetails[number][2]) => channel === "scale-x"
    ? part.scale.x
    : channel === "rotation-x" ? part.rotation.x : part.rotation.z;
  for (const [kind, partName, channel, pose] of animatedDetails) {
    const visual = createMobVisual(kind, 19);
    const part = visual.visual.getObjectByName(partName);
    assert.ok(part, `${kind}: ${partName}`);
    const before = readChannel(part, channel);
    if (pose === "ocean") applyOceanCreaturePose(visual.visual, kind, 1.25, 0.7, 0.5);
    else applyWildlifePose(visual.visual, kind, 1.25, 0.7, 0.3);
    assert.notEqual(readChannel(part, channel), before, `${kind}: ${partName} should animate`);
  }
});

test("underground block families, traversal recipes, ore chains, and lifts are complete", () => {
  for (let block = BlockId.RootweaveSoil; block <= BlockId.DeepgearLift; block += 1) {
    assert.ok(BLOCKS[block], `block ${block}`);
    const item = itemForBlock(block);
    assert.ok(ITEMS[item], `${BLOCKS[block].name} inventory item`);
  }
  assert.deepEqual(SMELTING[BlockId.IronOre], { item: Item.IronIngot, count: 1 });
  assert.deepEqual(SMELTING[Item.RawIron], { item: Item.IronIngot, count: 1 });
  assert.deepEqual(SMELTING[BlockId.CopperOre], { item: Item.CopperIngot, count: 1 });
  assert.deepEqual(SMELTING[Item.RawCopper], { item: Item.CopperIngot, count: 1 });
  assert.deepEqual(SMELTING[BlockId.GoldOre], { item: Item.GoldIngot, count: 1 });
  for (const id of ["delvers-rope", "rope-anchor", "rope-ladder", "iron-pitons", "wayfinder-markers", "cave-bridge-planks", "deepgear-lift-platforms"]) {
    assert.ok(RECIPES.some((recipe) => recipe.id === id), id);
  }
  const stops = new Map<number, BlockId>([[12, BlockId.DeepgearLift], [88, BlockId.DeepgearLift]]);
  assert.equal(deepgearLiftDestinationY(12, "up", (y) => stops.get(y) ?? BlockId.Air), 88);
  assert.equal(deepgearLiftDestinationY(88, "down", (y) => stops.get(y) ?? BlockId.Air), 12);
});

test("Iron migration preserves every save surface and word-sized blocks survive storage and networking", () => {
  const legacyFixture = {
    version: 2,
    generatorVersion: 14,
    seed: "IRON-MIGRATION",
    mode: "survival",
    edits: { "0,0": [[17, BlockId.DeepgearLift], [18, BlockId.LivingVein]] },
    player: { x: 1, y: 50, z: 2, yaw: 0, pitch: 0 },
    spawn: { x: 0, y: 48, z: 0 },
    inventory: [{ item: Item.RawIron, count: 12 }, { item: Item.IronPickaxe, count: 1, durability: 87 }],
    equipment: { head: { item: Item.IronHelm, count: 1, durability: 71 } },
    offhand: { item: Item.IronShield, count: 1, durability: 66 },
    selected: 1,
    health: 10,
    hunger: 9,
    xp: 12,
    level: 2,
    time: 0.4,
    day: 3,
    weather: "clear",
    furnaces: { "1,2,3": { input: { item: Item.RawIron, count: 4 }, fuel: null, output: { item: Item.IronIngot, count: 2 }, progress: 0.5, burn: 2, burnMax: 8 } },
    chests: { "4,5,6": [{ item: Item.IronIngot, count: 9 }] },
    questBook: { legacyObjective: "deliver-sunmetal", delivered: 7 },
    merchants: { smith: { stock: [{ item: Item.IronIngot, count: 6, durability: 44 }] } },
    digitalItemVault: { slots: [{ item: Item.IronAxe, count: 1, durability: 52 }] },
    multiplayerPlayers: { guest: { inventory: [{ item: Item.IronIngot, count: 3 }], equipment: { feet: Item.IronBoots } } },
    savedAt: 100,
  };
  const migrated = migrateLegacyWorldSave(legacyFixture);
  assert.ok(migrated);
  assert.equal(migrated.generatorVersion, GENERATOR_VERSION);
  assert.equal(migrated.generatorProfile, "legacy-v14");
  assert.deepEqual(migrated.edits, legacyFixture.edits);
  assert.deepEqual(migrated.inventory, legacyFixture.inventory);
  assert.deepEqual(migrated.equipment, legacyFixture.equipment);
  assert.deepEqual(migrated.offhand, legacyFixture.offhand);
  assert.deepEqual(migrated.furnaces, legacyFixture.furnaces);
  assert.deepEqual(migrated.chests, legacyFixture.chests);
  assert.deepEqual(migrated.questBook, legacyFixture.questBook);
  assert.deepEqual(migrated.merchants, legacyFixture.merchants);
  assert.deepEqual(migrated.digitalItemVault, legacyFixture.digitalItemVault);
  assert.deepEqual(migrated.multiplayerPlayers, legacyFixture.multiplayerPlayers);
  assert.equal(resolveStructureLootItem("sunmetal-ingot"), Item.IronIngot);
  assert.equal(resourceItemCode("raw-sunmetal"), Item.RawIron);
  assert.equal(resourceItemCode("sunmetal-ingot"), Item.IronIngot);
  assert.equal(Object.values(ITEMS).some((definition) => /sunmetal/iu.test(definition.name)), false);
  assert.equal(Object.values(BLOCKS).some((definition) => /sunmetal/iu.test(definition.name)), false);
  assert.equal(validatePayload("block-action", {
    requestId: "word-sized-place",
    actorId: "host-player-0001",
    tick: 1,
    kind: "place",
    edits: [{ x: 0, y: -8, z: 0, type: BlockId.DeepgearLift }],
    consumedItem: Item.DeepgearLiftItem,
  }), true);
});

test("depth-band cave maps reveal only entered layers and keep square map geometry with blue water", () => {
  let map = createMapKnowledge("below", "delver");
  map = markUndergroundChunk(map, { x: 2, z: -3, biome: "Rootweave Grotto", elevation: 4 });
  map = markUndergroundChunk(map, { x: 2, z: -3, biome: "Glasswater Deeps", elevation: -18 });
  map = markUndergroundChunk(map, { x: 2, z: -3, biome: "Crystaldeep Gallery", elevation: -44 });
  const sample = map.undergroundByChunk["2,-3"];
  assert.equal(undergroundSampleForBand(sample, "upper")?.biome, "Rootweave Grotto");
  assert.equal(undergroundSampleForBand(sample, "middle")?.biome, "Glasswater Deeps");
  assert.equal(undergroundSampleForBand(sample, "deep")?.biome, "Crystaldeep Gallery");
  assert.equal(map.undergroundByChunk["3,-3"], undefined, "unentered caves must remain unrevealed");
  const normalized = normalizeMapKnowledge(JSON.parse(JSON.stringify(map)), "below", "delver");
  assert.deepEqual(normalized.undergroundByChunk, map.undergroundByChunk);
  const projection = mapViewportProjection({ minX: -10, maxX: 10, minZ: -5, maxZ: 5 }, 900, 400);
  assert.equal(projection.contentWidth / 20, projection.contentHeight / 10);
  assert.equal(mapSurfaceQuadrantColor(["#777777", "#777777", "#777777", "#777777"], true), MAP_WATER_SURFACE_COLOR);
});

test("dwarven mountain holds retain complete civic and cave-linked infrastructure on every audit seed", () => {
  for (const seed of ["WILDERNESS", "GLASSWATER", "DEEP-ROADS"]) {
    const world = new ChunkWorld();
    world.reset(seed, undefined, OVERHAUL_PROFILE);
    const audit = dwarfHoldAudit(world);
    assert.ok(audit.accepted > 0, `${seed} Dwarf hold availability`);
    assert.equal(audit.mountainCompatible, audit.accepted, `${seed} mountain siting`);
    assert.ok(audit.verifiedHoldId, `${seed} generated hold`);
    assert.ok(audit.civicRoles.includes("deepgear-hall"));
    assert.ok(audit.civicRoles.includes("golem-forge"));
    assert.ok(audit.civicRoles.includes("powderworks"));
    assert.equal(audit.pairedLift, true, `${seed} paired lift`);
    assert.equal(audit.shaftClear, true, `${seed} shaft clearance`);
    assert.equal(audit.gatehouseComplete, true, `${seed} mountain gatehouse`);
    assert.equal(audit.mineRoadConnected, true, `${seed} graph road`);
    assert.equal(audit.discoveryMarker, true, `${seed} map marker`);
  }
});

test("bounded nine-chunk generation stays inside the release hitch budget", () => {
  const world = new ChunkWorld();
  world.reset("WILDERNESS", undefined, OVERHAUL_PROFILE);
  const audit = generatedContentAudit(world);
  assert.equal(audit.bytesPerGeneratedChunkVoxelField, CHUNK_SIZE * CHUNK_SIZE * WORLD_HEIGHT * 2);
  assert.ok(audit.initialNineChunkGenerationMs < 2_500, `${audit.initialNineChunkGenerationMs} ms`);
  assert.ok(audit.oreCounts.Iron > 0);
  assert.ok(audit.oreCounts.Copper > 0);
  assert.ok(audit.oreCounts.Gold > 0);
});
