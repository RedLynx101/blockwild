import assert from "node:assert/strict";
import test from "node:test";
import {
  AQUATIC_FLORA,
  BLOCKS,
  CULTIVATED_FLOWERS,
  CREATIVE_BLOCKS,
  ITEMS,
  ORDINARY_FLOWERS,
  POLLINATOR_FLOWERS,
  RECIPES,
  BlockId,
  Item,
  blockContainsWater,
  itemForBlock,
  worldTextureBlockForItem,
} from "../app/game/data.ts";
import { AQUATIC_FLORA_HABITAT_WEIGHTS, planFullTree, planSubmergedFlora, treeLogsAreFaceConnected } from "../app/game/ecology.ts";
import {
  AQUATIC_GROWTH_LIMITS,
  discoverRootedTree,
  harvestPlant,
  isTreeLogBlock,
  plantingResult,
  planAquaticColumnRemoval,
  planAquaticGrowth,
} from "../app/game/farming.ts";
import { plantForBlock } from "../app/game/plants.ts";
import { createWeatherState, planCloudField, weatherVisuals } from "../app/game/weather.ts";
import { BiomeId, ChunkWorld, GENERATOR_VERSION, planPoiAmenities } from "../app/game/world.ts";

test("shoreline, biome, crop and aquatic ids remain byte-safe and registered", () => {
  assert.equal(GENERATOR_VERSION, 17);
  for (const block of [BlockId.Saltbrush, BlockId.CoastAster, BlockId.JungleGrass, BlockId.SakuraGrass, BlockId.LumenKelp, BlockId.AbyssBloom, BlockId.SunrootCrop]) {
    assert.ok(block > 99 && block <= 255);
    assert.ok(BLOCKS[block]);
  }
  assert.equal(ITEMS[Item.WorldshellEgg].maxStack, 8);
  assert.equal(ITEMS[Item.AetherbellEgg].maxStack, 8);
  assert.equal(ITEMS[Item.WaterBreathingPotion].potionId, "water-breathing");
  assert.equal(itemForBlock(BlockId.JungleLog), Item.RainveilLog);
  assert.equal(ITEMS[itemForBlock(BlockId.JungleLog)].name, "Rainveil Log");
  assert.notEqual(itemForBlock(BlockId.JungleLog), BlockId.JungleLog, "overlapping block and item ids require an inventory alias");
  assert.equal(RECIPES.find((recipe) => recipe.id === "wildwood_table")?.output.item, Item.WildwoodTableItem);
  assert.equal(new Set(CREATIVE_BLOCKS).size, CREATIVE_BLOCKS.length, "builder inventory should not duplicate aliased blocks");
  assert.equal(worldTextureBlockForItem(Item.LumenKelpFrond), BlockId.LumenKelp);
  assert.equal(plantForBlock(BlockId.LumenKelp)?.category, "aquatic");
  assert.equal(plantForBlock(BlockId.MoonriceCrop)?.category, "farm");
});

test("all aquatic flora is waterlogged, breakable, replantable and bounded upward", () => {
  assert.ok(AQUATIC_FLORA.length >= 12);
  assert.ok(AQUATIC_FLORA.includes(BlockId.Lumenreed));
  for (const block of [BlockId.Brinegrass, BlockId.Sailkelp, BlockId.Featherwrack, BlockId.Pearlfan]) assert.ok(AQUATIC_FLORA.includes(block));
  for (const block of AQUATIC_FLORA) {
    assert.equal(BLOCKS[block].waterlogged, true, BLOCKS[block].name);
    assert.equal(BLOCKS[block].hardness > 0, true);
    assert.equal(blockContainsWater(block), true);
    const item = itemForBlock(block);
    assert.equal(ITEMS[item].useKind, "plant");
    assert.equal(ITEMS[item].plantBlock, block);
  }
  const planted = plantingResult(Item.LumenKelpFrond, BlockId.MoonSlate, BlockId.Water);
  assert.equal(planted?.block, BlockId.LumenKelp);
  assert.equal(harvestPlant(BlockId.LumenKelp, false, 0)?.replacement, BlockId.Water);

  const column = new Map<string, BlockId>([["0,0,0", BlockId.LumenKelp], ["0,1,0", BlockId.Water]]);
  const read = (x: number, y: number, z: number) => column.get(`${x},${y},${z}`) ?? BlockId.Stone;
  assert.deepEqual(planAquaticGrowth(BlockId.LumenKelp, { x: 0, y: 0, z: 0 }, read), { x: 0, y: 1, z: 0, type: BlockId.LumenKelp, maximumHeight: 7 });
  assert.equal(AQUATIC_GROWTH_LIMITS[BlockId.StarCoral], 3);
  assert.equal(AQUATIC_GROWTH_LIMITS[BlockId.Lumenreed], 4);
  assert.equal(AQUATIC_GROWTH_LIMITS[BlockId.Brinegrass], 2);
  assert.equal(AQUATIC_GROWTH_LIMITS[BlockId.Sailkelp], 6);
  assert.equal(AQUATIC_GROWTH_LIMITS[BlockId.Featherwrack], 3);
  assert.equal(AQUATIC_GROWTH_LIMITS[BlockId.Pearlfan], 1);
  const coral = new Map<string, BlockId>([["0,0,0", BlockId.StarCoral], ["0,1,0", BlockId.Water]]);
  assert.deepEqual(
    planAquaticGrowth(BlockId.StarCoral, { x: 0, y: 0, z: 0 }, (x, y, z) => coral.get(`${x},${y},${z}`) ?? BlockId.Stone),
    { x: 0, y: 1, z: 0, type: BlockId.StarCoral, maximumHeight: 3 },
  );
});

test("ordinary oceans are matte staple beds while trench glow remains concentrated", () => {
  const luminous = new Set([BlockId.GlowKelp, BlockId.LumenKelp, BlockId.StarCoral, BlockId.AbyssBloom]);
  const staples = new Set([BlockId.Brinegrass, BlockId.Sailkelp]);
  for (const habitat of ["coast", "ocean", "deep-ocean", "lumen-trench"] as const) {
    const weights = AQUATIC_FLORA_HABITAT_WEIGHTS[habitat];
    assert.ok(Math.abs(weights.reduce((sum, entry) => sum + entry.weight, 0) - 1) < 1e-9, `${habitat} weights must total one`);
  }
  const oceanWeights = AQUATIC_FLORA_HABITAT_WEIGHTS.ocean;
  assert.ok(oceanWeights.filter((entry) => staples.has(entry.block)).reduce((sum, entry) => sum + entry.weight, 0) >= .85);
  assert.ok(oceanWeights.filter((entry) => luminous.has(entry.block)).reduce((sum, entry) => sum + entry.weight, 0) <= .02);
  assert.ok(AQUATIC_FLORA_HABITAT_WEIGHTS["lumen-trench"].filter((entry) => luminous.has(entry.block)).reduce((sum, entry) => sum + entry.weight, 0) >= .65);

  const generated: BlockId[] = [];
  for (let x = -96; x <= 96; x += 1) for (let z = -96; z <= 96; z += 1) {
    const plan = planSubmergedFlora("OCEAN-FLORA-REDESIGN", x, -20, z, 18, "ocean");
    if (plan[0]) generated.push(plan[0].block);
    assert.ok(plan.every((entry) => entry.block === plan[0]?.block), "one vertical plant must never change species between cells");
  }
  assert.ok(generated.length > 5_000, "ordinary ocean fixture should produce broad visible beds");
  assert.ok(generated.filter((block) => staples.has(block)).length / generated.length >= .80);
  assert.ok(generated.filter((block) => luminous.has(block)).length / generated.length <= .03);
});

test("river and sea flora form compact two-dimensional beds without changing habitat ratios", () => {
  const habitats = [
    ["river", 6, .18],
    ["coast", 8, .18],
    ["ocean", 18, .24],
    ["deep-ocean", 24, .26],
    ["lumen-trench", 24, .33],
  ] as const;
  for (const [habitat, depth, expectedDensity] of habitats) {
    const occupied = new Set<string>();
    const generated: BlockId[] = [];
    for (let x = -80; x < 80; x += 1) for (let z = -80; z < 80; z += 1) {
      const plan = planSubmergedFlora("AQUATIC-PATCH-REGRESSION", x, -24, z, depth, habitat);
      if (!plan[0]) continue;
      occupied.add(`${x},${z}`);
      generated.push(plan[0].block);
    }
    const density = occupied.size / (160 * 160);
    assert.ok(Math.abs(density - expectedDensity) <= .055, `${habitat} density ${density.toFixed(3)} should retain its old average`);

    let neighborEdges = 0;
    let orthogonallySupported = 0;
    for (const key of occupied) {
      const [x, z] = key.split(",").map(Number);
      const east = occupied.has(`${x + 1},${z}`);
      const west = occupied.has(`${x - 1},${z}`);
      const south = occupied.has(`${x},${z + 1}`);
      const north = occupied.has(`${x},${z - 1}`);
      neighborEdges += Number(east) + Number(west) + Number(south) + Number(north);
      if ((east || west) && (south || north)) orthogonallySupported += 1;
    }
    const neighborRate = neighborEdges / Math.max(1, occupied.size * 4);
    const twoDimensionalRate = orthogonallySupported / Math.max(1, occupied.size);
    assert.ok(neighborRate >= expectedDensity * 1.16, `${habitat} should visibly cluster rather than scatter into rows`);
    assert.ok(twoDimensionalRate >= .16, `${habitat} beds need width as well as length`);

    const counts = new Map<BlockId, number>();
    for (const block of generated) counts.set(block, (counts.get(block) ?? 0) + 1);
    const weights = AQUATIC_FLORA_HABITAT_WEIGHTS[habitat];
    const dominant = weights.filter((entry) => entry.weight >= .1);
    for (const entry of dominant) {
      const observed = (counts.get(entry.block) ?? 0) / generated.length;
      assert.ok(Math.abs(observed - entry.weight) <= .08, `${habitat} keeps the ${BLOCKS[entry.block].name} ratio`);
    }
  }
});

test("trimming an aquatic column clears unsupported upper segments and leaves a renewable base", () => {
  const column = new Map<string, BlockId>([
    ["0,0,0", BlockId.LumenKelp],
    ["0,1,0", BlockId.LumenKelp],
    ["0,2,0", BlockId.LumenKelp],
    ["0,3,0", BlockId.Water],
  ]);
  const read = (x: number, y: number, z: number) => column.get(`${x},${y},${z}`) ?? BlockId.Stone;
  const removals = planAquaticColumnRemoval(BlockId.LumenKelp, { x: 0, y: 1, z: 0 }, read);
  assert.deepEqual(removals, [
    { x: 0, y: 1, z: 0, type: BlockId.Water },
    { x: 0, y: 2, z: 0, type: BlockId.Water },
  ]);
  for (const edit of removals) column.set(`${edit.x},${edit.y},${edit.z}`, edit.type);
  assert.deepEqual(
    planAquaticGrowth(BlockId.LumenKelp, { x: 0, y: 0, z: 0 }, read),
    { x: 0, y: 1, z: 0, type: BlockId.LumenKelp, maximumHeight: 7 },
  );
});

test("generated aquatic flora is a targetable voxel and breaking restores its water", () => {
  const world = new ChunkWorld();
  world.reset("OCEAN-V07", undefined, { structures: false });
  const chunk = world.generateChunk(0, 0);
  let found: { x: number; y: number; z: number } | null = null;
  for (let z = 0; z < 16 && !found; z += 1) for (let x = 0; x < 16 && !found; x += 1) {
    const column = world.sampleColumn(x, z);
    for (let y = column.height + 1; y <= column.waterline; y += 1) {
      if (AQUATIC_FLORA.includes(world.getBlock(x, y, z) ?? BlockId.Air)) { found = { x, y, z }; break; }
    }
  }
  assert.ok(found, "fixture should generate real aquatic flora blocks");
  world.setBlock(found!.x, found!.y, found!.z, BlockId.Air, false);
  assert.equal(world.getBlock(found!.x, found!.y, found!.z), BlockId.Water);
  assert.ok(chunk.sectionBlockCounts.some((count) => count > 0));
  world.dispose();
});

test("deep habitats choose deterministic bioluminescent waterlogged flora", () => {
  const luminous = new Set([BlockId.LumenKelp, BlockId.GlowKelp, BlockId.StarCoral, BlockId.AbyssBloom]);
  let usedSeed = "trench";
  let plan = planSubmergedFlora(usedSeed, 8, -24, 9, 28, "lumen-trench");
  for (let salt = 0; (!plan[0] || !luminous.has(plan[0].block)) && salt < 200; salt += 1) {
    usedSeed = `trench-${salt}`;
    plan = planSubmergedFlora(usedSeed, 8, -24, 9, 28, "lumen-trench");
  }
  assert.ok(plan.length > 0);
  assert.deepEqual(plan, planSubmergedFlora(usedSeed, 8, -24, 9, 28, "lumen-trench"));
  assert.ok(plan.every((placement) => placement.waterlogged && placement.replacesWater === false));
  assert.ok(plan.every((placement) => luminous.has(placement.block)));
  assert.ok(plan.length <= 7);
});

test("cultivated flowers remain pollinator-compatible and yield several blooms", () => {
  assert.equal(ORDINARY_FLOWERS.length, CULTIVATED_FLOWERS.length);
  assert.ok(ORDINARY_FLOWERS.includes(BlockId.Moonpetal));
  for (let index = 0; index < ORDINARY_FLOWERS.length; index += 1) {
    const flower = ORDINARY_FLOWERS[index];
    const mature = CULTIVATED_FLOWERS[index];
    assert.equal(POLLINATOR_FLOWERS.includes(flower), true);
    assert.equal(POLLINATOR_FLOWERS.includes(mature), true);
    assert.equal(plantingResult(itemForBlock(flower), BlockId.HydratedFarmland, BlockId.Air)?.block, flower);
    const harvest = harvestPlant(mature, false, 0.5);
    assert.equal(harvest?.replacement, flower);
    assert.ok((harvest?.drops[0].count ?? 0) >= 4);
  }
});

test("Moonrice and Sunroot use explicit crop stages and renewable harvests", () => {
  assert.equal(plantingResult(Item.MoonriceSeeds, BlockId.HydratedFarmland, BlockId.Air)?.block, BlockId.MoonriceSprout);
  assert.equal(plantingResult(Item.SunrootStarts, BlockId.Farmland, BlockId.Air)?.block, BlockId.SunrootSprout);
  assert.equal(harvestPlant(BlockId.MoonriceCrop, true, 0.8)?.replacement, BlockId.MoonriceSprout);
  assert.equal(harvestPlant(BlockId.SunrootCrop, true, 0.8)?.replacement, BlockId.SunrootSprout);
});

test("every authored tree form is face-connected and old diagonal crowns fell completely", () => {
  for (const form of ["rounded", "layered", "windswept", "ancient"] as const) {
    const plan = planFullTree(`tree-${form}`, { x: 0, y: 1, z: 0 }, form, BlockId.SakuraLog, BlockId.SakuraLeaves);
    assert.equal(treeLogsAreFaceConnected(plan, BlockId.SakuraLog), true, form);
  }

  const cells = new Map<string, BlockId>();
  const put = (x: number, y: number, z: number, type: BlockId) => cells.set(`${x},${y},${z}`, type);
  put(0, 0, 0, BlockId.SakuraGrass);
  for (let y = 1; y <= 6; y += 1) put(0, y, 0, BlockId.SakuraLog);
  put(1, 5, 0, BlockId.SakuraLog);
  put(2, 6, 0, BlockId.SakuraLog); // historical diagonal gap that caused a partial fall
  put(3, 6, 0, BlockId.SakuraLog);
  for (let x = -2; x <= 4; x += 1) for (let z = -2; z <= 2; z += 1) put(x, 7, z, BlockId.SakuraLeaves);
  // Neighbor tree shares leaves but retains its own root and trunk.
  put(7, 0, 0, BlockId.Grass);
  for (let y = 1; y <= 6; y += 1) put(7, y, 0, BlockId.WildwoodLog);
  put(6, 7, 0, BlockId.WildwoodLeaves);
  const tree = discoverRootedTree({ x: 0, y: 1, z: 0 }, (x, y, z) => cells.get(`${x},${y},${z}`) ?? BlockId.Air);
  assert.ok(tree);
  assert.equal(tree!.logs.some((log) => log.x === 3 && log.y === 6), true, "upper branch joins the fall");
  assert.equal(tree!.logs.some((log) => log.x === 7), false, "neighbor trunk remains independent");
});

test("composed Rainveil crowns preserve rooted wood in generated chunks", () => {
  const world = new ChunkWorld();
  world.reset("HEARTHROADS", undefined, { structures: false, profile: "legacy-v14" });
  const chunkX = Math.floor(-2_080 / 16);
  const chunkZ = Math.floor(-3_026 / 16);
  // The audited 3x3 window can contain the outer branch of a tree rooted in
  // the immediately adjacent chunk (the historical -2049 fixture is one).
  // Load that deterministic one-chunk root halo before proving connectivity.
  for (let cx = chunkX - 2; cx <= chunkX + 2; cx += 1) {
    for (let cz = chunkZ - 2; cz <= chunkZ + 2; cz += 1) world.generateChunk(cx, cz);
  }
  let checkedLogs = 0;
  const verifiedLogs = new Set<string>();
  // Coarse jittered tree cells can move the historical fixture across the
  // neighboring chunk seam. Audit the same bounded 3x3 generated window so
  // the contract remains rooted connectivity, not one incidental coordinate.
  for (let x = (chunkX - 1) * 16; x < (chunkX + 2) * 16; x += 1) for (let z = (chunkZ - 1) * 16; z < (chunkZ + 2) * 16; z += 1) {
    const surface = world.sampleColumn(x, z).height;
    for (let y = surface - 4; y <= surface + 20; y += 1) {
      if (!isTreeLogBlock(world.getBlock(x, y, z))) continue;
      checkedLogs += 1;
      const key = `${x},${y},${z}`;
      if (verifiedLogs.has(key)) continue;
      const tree = discoverRootedTree({ x, y, z }, (bx, by, bz) => world.getBlock(bx, by, bz));
      assert.ok(tree, `orphan generated log at ${x},${y},${z}`);
      for (const log of tree.logs) verifiedLogs.add(`${log.x},${log.y},${log.z}`);
    }
  }
  assert.ok(checkedLogs >= 24, `expected a meaningful bounded forest scan, got ${checkedLogs} logs`);
  assert.ok(verifiedLogs.has("-2049,39,-3038"), "the historical composed-crown branch reaches its adjacent rooted trunk");
  world.dispose();
});

test("storm sky has no discrete clouds while fair weather keeps layered puffs", () => {
  const storm = { ...createWeatherState({ seed: "storm", biome: "ocean" }, 0), kind: "thunder" as const, elapsedSeconds: 30, durationSeconds: 180 };
  assert.equal(weatherVisuals(storm).fullOvercast, true);
  assert.deepEqual(planCloudField("storm", 0, 0, 4, storm), []);
  const clear = { ...storm, kind: "clear" as const, intensity: 0.02 };
  const clouds = planCloudField("fair", 0, 0, 4, clear);
  assert.ok(clouds.length > 0);
  assert.ok(clouds.flatMap((cloud) => cloud.lobes).every((lobe) => lobe.brightness >= 0.92 && lobe.brightness <= 1));
});

test("POI amenity overlays add doors, lights and varied furniture", () => {
  const desert = planPoiAmenities("desert-temple", { x: 0, y: 40, z: 0 });
  assert.ok(desert.some((entry) => entry.block === BlockId.DoorClosedLower));
  assert.ok(desert.some((entry) => entry.block === BlockId.TorchWallSouth));
  for (const kind of [BlockId.WildwoodTable, BlockId.WildwoodStool, BlockId.WildwoodShelf, BlockId.SealedBarrel]) {
    const count = ["desert-temple", "forest-temple", "sunbun-grove", "abandoned-apiary"].flatMap((structure) => planPoiAmenities(structure as Parameters<typeof planPoiAmenities>[0], { x: 0, y: 40, z: 0 })).filter((entry) => entry.block === kind).length;
    assert.ok(count > 0, `${BlockId[kind]} should furnish at least one POI`);
  }
});

test("the Healing Grotto wall torch has an authored stone support", () => {
  const origin = { x: 20, y: 40, z: -8 };
  const amenities = planPoiAmenities("waykeeper-healing-grotto", origin);
  const torch = amenities.find((entry) => entry.block === BlockId.TorchWallNorth)!;
  assert.ok(torch);
  assert.ok(amenities.some((entry) => entry.x === torch.x && entry.y === torch.y && entry.z === torch.z + 1 && entry.block === BlockId.MoonSlate));
});

test("world sampling exposes the new land and trench biomes with variable ocean depth", () => {
  const world = new ChunkWorld();
  world.reset("HEARTHROADS", undefined, { structures: false });
  const found = new Set<BiomeId>();
  const depths = new Set<number>();
  for (let z = -3000; z <= 3000; z += 31) for (let x = -3000; x <= 3000; x += 31) {
    const column = world.sampleColumn(x, z);
    if ([BiomeId.RainveilJungle, BiomeId.SakurabloomGrove, BiomeId.LumenTrench].includes(column.biome)) found.add(column.biome);
    if ([BiomeId.Ocean, BiomeId.DeepOcean, BiomeId.LumenTrench].includes(column.biome)) depths.add(column.waterline - column.height);
  }
  assert.deepEqual(found, new Set([BiomeId.RainveilJungle, BiomeId.SakurabloomGrove, BiomeId.LumenTrench]));
  assert.ok(Math.max(...depths) >= 28);
  assert.ok(depths.size >= 16);
  world.dispose();
});

test("Sunwash Coast emits both new plants sparsely above the tide line", () => {
  const world = new ChunkWorld();
  world.reset("COAST-V07", undefined, { structures: false, profile: "legacy-v14" });
  const chunk = world.generateChunk(-20, -20);
  const plants = [...chunk.blocks].filter((block) => block === BlockId.Saltbrush || block === BlockId.CoastAster);
  assert.ok(plants.includes(BlockId.Saltbrush));
  assert.ok(plants.includes(BlockId.CoastAster));
  assert.ok(plants.length < 24, `coastal plants should remain sparse, got ${plants.length}`);
  world.dispose();
});

test("world generation materializes an open lit Atlantian settlement below sea level", () => {
  const world = new ChunkWorld();
  world.reset("ATLANTIS-WORLD", undefined, { structures: true, profile: "legacy-v14" });
  const x = -12_950;
  const z = -14_995;
  const column = world.sampleColumn(x, z);
  assert.equal(column.biome, BiomeId.DeepOcean);
  world.generateChunk(Math.floor(x / 16), Math.floor(z / 16));
  const plan = [...world.settlementPlans.values()].find((entry) => entry.candidate.factionId === "atlantians");
  assert.ok(plan);
  assert.equal(plan!.candidate.environment, "underwater");
  assert.equal(plan!.layout.wall.length, 0);
  assert.ok(plan!.layout.lights.length > 0);
  const markers = world.structureMarkersNear(x, plan!.candidate.center.y ?? column.height + 2, z, 64).map(([, marker]) => marker);
  assert.ok(markers.some((marker) => marker.type === "landmark" && marker.tag?.includes("atlantians")));
  assert.ok(markers.some((marker) => marker.type === "spawn" && marker.mobKind?.startsWith("atlantian-")));
  world.dispose();
});

test("Atlantian towns re-anchor to the actual seabed and fit below local water", () => {
  const world = new ChunkWorld();
  world.reset("A", undefined, { structures: true, profile: "legacy-v14" });
  const regionX = 14;
  const regionZ = -29;
  const center = { x: 7_329, z: -14_684 };
  const probe = world.sampleColumn(regionX * 512 + 256, regionZ * 512 + 256);
  const centerColumn = world.sampleColumn(center.x, center.z);
  assert.equal(probe.height, 22, "fixture retains the formerly used shallow region probe");
  assert.equal(centerColumn.height, 14, "fixture settlement center is materially deeper");
  world.generateChunk(Math.floor(center.x / 16), Math.floor(center.z / 16));
  const plan = [...world.settlementPlans.values()].find((entry) => entry.candidate.id === "tidehold-e--t-9h28go");
  assert.ok(plan);
  assert.equal(plan!.candidate.floorY, centerColumn.height);
  assert.equal(plan!.candidate.center.y, centerColumn.height + 2);

  const assertSubmerged = (point: Readonly<{ x: number; y?: number; z: number }>, label: string) => {
    const column = world.sampleColumn(point.x, point.z);
    assert.equal(typeof point.y, "number", `${label} needs an aquatic height`);
    assert.ok(point.y! >= column.height + 1, `${label} must remain above the seabed`);
    assert.ok(point.y! <= column.waterline - 1, `${label} must remain below the surface`);
  };
  assertSubmerged(plan!.layout.center, "center");
  plan!.layout.paths.forEach((point, index) => assertSubmerged(point, `path ${index}`));
  plan!.layout.approaches.forEach((approach) => assertSubmerged(approach.position, approach.id));
  plan!.layout.lights.forEach((light, index) => assertSubmerged(light.position, `light ${index}`));
  plan!.layout.buildings.forEach((building) => {
    assertSubmerged(building.position, building.id);
    building.furniture.forEach((furniture, index) => assertSubmerged(furniture.position, `${building.id} furniture ${index}`));
    const halfWidth = Math.floor(building.width / 2);
    const halfDepth = Math.floor(building.depth / 2);
    let highestBed = Number.NEGATIVE_INFINITY;
    let lowestSurface = Number.POSITIVE_INFINITY;
    for (let x = building.position.x - halfWidth; x <= building.position.x + halfWidth; x += 1) {
      for (let z = building.position.z - halfDepth; z <= building.position.z + halfDepth; z += 1) {
        const column = world.sampleColumn(x, z);
        highestBed = Math.max(highestBed, column.height);
        lowestSurface = Math.min(lowestSurface, column.waterline);
      }
    }
    const baseY = Math.max(highestBed + 1, building.position.y! - 1);
    const roofY = baseY + Math.min(5, building.floors * 3 + 1);
    assert.ok(roofY <= lowestSurface - 1, `${building.id} roof must stay submerged across its footprint`);
  });
  world.dispose();
});
