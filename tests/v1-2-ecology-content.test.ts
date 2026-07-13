import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  BLOCKS,
  BLOCK_ITEM_ALIASES,
  CREATIVE_BLOCKS,
  BlockId,
  Item,
  ITEMS,
  RECIPES,
} from "../app/game/data.ts";
import {
  canGrowPlant,
  harvestPlant,
  nextPlantStage,
  plantingResult,
} from "../app/game/farming.ts";
import {
  aquaticSpawnBandForMob,
  fishKindsForHabitat,
  foodLureResponseForMob,
  naturalGroupSizeForMob,
  passiveMobSpawnTableForBiome,
  usesGenericCreatureBond,
} from "../app/game/fauna.ts";
import { MOB_DEFS, RABBIT_ORDER } from "../app/game/mobs.ts";
import { applyOceanCreaturePose, createMobVisual } from "../app/game/mob-models.ts";
import { PLANTS } from "../app/game/plants.ts";
import {
  AQUARIUM_MAX_BLOCKS,
  buildAquariumTopologyFromWorld,
  isAquariumCreature,
} from "../app/game/aquarium.ts";
import { BiomeId, GENERATOR_VERSION, canGenerateSurfaceFlora } from "../app/game/world.ts";

const CROP_CASES = [
  { seed: Item.CottonSeeds, sprout: BlockId.CottonSprout, young: BlockId.CottonYoung, ripe: BlockId.CottonCrop, produce: Item.CottonBoll },
  { seed: Item.SunCarrotSeeds, sprout: BlockId.SunCarrotSprout, young: BlockId.SunCarrotYoung, ripe: BlockId.SunCarrotCrop, produce: Item.SunCarrot },
  { seed: Item.BluepodSeeds, sprout: BlockId.BluepodSprout, young: BlockId.BluepodYoung, ripe: BlockId.BluepodCrop, produce: Item.BluepodBeans },
] as const;

test("v1.2 homestead crops have stable IDs, complete growth loops and scythe replanting", () => {
  assert.equal(GENERATOR_VERSION, 15);
  for (const crop of CROP_CASES) {
    assert.equal(plantingResult(crop.seed, BlockId.HydratedFarmland, BlockId.Air)?.block, crop.sprout);
    assert.equal(plantingResult(crop.seed, BlockId.Grass, BlockId.Air), null);
    assert.equal(nextPlantStage(crop.sprout), crop.young);
    assert.equal(nextPlantStage(crop.young), crop.ripe);
    assert.equal(nextPlantStage(crop.ripe), null);
    assert.equal(canGrowPlant(crop.sprout, BlockId.HydratedFarmland, 1), true);
    const harvest = harvestPlant(crop.ripe, true, 0.9);
    assert.equal(harvest?.replacement, crop.sprout);
    assert.equal(harvest?.replanted, true);
    assert.ok((harvest?.drops.find((drop) => drop.item === crop.produce)?.count ?? 0) >= 3);
    assert.equal(BLOCK_ITEM_ALIASES[crop.sprout], crop.seed);
    assert.equal(BLOCK_ITEM_ALIASES[crop.ripe], crop.produce);
  }
  assert.equal(RECIPES.find((recipe) => recipe.id === "cotton-string")?.output.item, Item.String);
  assert.equal(RECIPES.find((recipe) => recipe.id === "woven-cloudwool")?.output.item, Item.Wool);
  for (const id of ["field-cotton", "suncrest-carrot", "bluepod-bean"]) assert.ok(PLANTS.some((plant) => plant.id === id));
});

test("all surface flora and crops reject liquid support, occupied liquid cells and cave-mouth air", () => {
  const surfaceFlora = [
    BlockId.TallGrass, BlockId.RedFlower, BlockId.BlueFlower, BlockId.WheatCrop, BlockId.Sunpetal, BlockId.MoonOrchid,
    BlockId.DesertShrub, BlockId.Saltbrush, BlockId.CoastAster, BlockId.RainveilFern, BlockId.LanternLotus,
    BlockId.SakuraBloom, BlockId.Dreamblossom, BlockId.GumdropBush, BlockId.PeppermintTuft, BlockId.LollipopOrchid,
    BlockId.MarshmallowShrub, BlockId.Moonpetal, BlockId.Starfern, BlockId.Dreamcap,
    BlockId.MoonriceCrop, BlockId.SunrootCrop, BlockId.PeppermintCrop, BlockId.CocoaCrop,
    BlockId.CottonCrop, BlockId.SunCarrotCrop, BlockId.BluepodCrop,
  ];
  for (const plant of surfaceFlora) {
    assert.equal(BLOCKS[plant].solid, false, BLOCKS[plant].name);
    for (const liquid of [BlockId.Water, BlockId.Syrup, BlockId.Honey, BlockId.Lava]) {
      assert.equal(canGenerateSurfaceFlora(liquid, BlockId.Air), false, `${BLOCKS[plant].name} on ${BLOCKS[liquid].name}`);
      assert.equal(canGenerateSurfaceFlora(BlockId.Grass, liquid), false, `${BLOCKS[plant].name} occupying ${BLOCKS[liquid].name}`);
    }
    assert.equal(canGenerateSurfaceFlora(BlockId.Air, BlockId.Air, true), false, `${BLOCKS[plant].name} over cave-mouth air`);
  }
  assert.equal(canGenerateSurfaceFlora(BlockId.MeadowGrass, BlockId.Air), true);
  assert.equal(BLOCKS[BlockId.PeppermintTuft].verticalConnectGroup, "wild-peppermint");
  assert.equal(BLOCKS[BlockId.PeppermintTuft].shape, "cross");
  for (const seed of CROP_CASES.map((crop) => crop.seed)) {
    for (const liquid of [BlockId.Water, BlockId.Syrup, BlockId.Honey, BlockId.Lava]) {
      assert.equal(plantingResult(seed, liquid, BlockId.Air), null);
      assert.equal(plantingResult(seed, BlockId.HydratedFarmland, liquid), null);
    }
  }
});

test("rabbit variants are passive food-lured companion species with readable grounded models", () => {
  assert.deepEqual(RABBIT_ORDER, ["meadow-cottontail", "russet-rabbit", "frost-hare", "chocolate-bunny"]);
  for (const kind of RABBIT_ORDER) {
    const definition = MOB_DEFS[kind];
    assert.equal(definition.family, "rabbit");
    assert.equal(definition.hostile, false);
    assert.equal(definition.tameable, true);
    assert.equal(definition.breedable, true);
    assert.equal(definition.damage, 0);
    assert.equal(definition.foodLure, true);
    assert.equal(usesGenericCreatureBond(kind), true);
    assert.equal(foodLureResponseForMob(kind, { heldItem: definition.diet![0], distance: 7, playerSpeed: 0 }), "approach");
    assert.equal(foodLureResponseForMob(kind, { distance: 3, playerSpeed: 3 }), "flee");
    assert.ok(naturalGroupSizeForMob(kind, 0.99) >= 3);
    const model = createMobVisual(kind, 12);
    const bounds = new THREE.Box3().setFromObject(model.visual);
    assert.ok(Math.abs(definition.footOffset - (0.5 - bounds.min.y)) < 1e-7, `${kind} ground delta was ${definition.footOffset - (0.5 - bounds.min.y)}`);
    assert.ok(model.visual.getObjectByName(`${kind}-left-ear-pivot`));
    const baseY = model.visual.position.y;
    applyOceanCreaturePose(model.visual, kind, Math.PI / 14.8, 1);
    assert.ok(model.visual.position.y > baseY + 0.1, `${kind} should visibly hop while traveling`);
    assert.ok(Math.abs(model.visual.getObjectByName(`${kind}-left-ear-pivot`)?.rotation.x ?? 0) > 0.1);
  }
  assert.deepEqual(MOB_DEFS["chocolate-bunny"].drops, [{ item: Item.ChocolateBunny, min: 1, max: 1, chance: 1 }]);
  assert.ok(passiveMobSpawnTableForBiome(BiomeId.Meadow).some(([kind]) => kind === "meadow-cottontail"));
  assert.ok(passiveMobSpawnTableForBiome(BiomeId.Snowfield).some(([kind]) => kind === "frost-hare"));
  assert.ok(passiveMobSpawnTableForBiome(BiomeId.SugarplumVale).some(([kind]) => kind === "chocolate-bunny"));
});

test("familiar herd animals follow visible foods they like", () => {
  const lures = [
    ["sunstep-grazer", Item.Wheat],
    ["woolhorn", Item.Wheat],
    ["reedstrider", Item.RawFish],
    ["wild-horse", Item.Apple],
    ["meadow-cow", Item.Wheat],
    ["mistmane", Item.Wheat],
  ] as const;

  for (const [kind, food] of lures) {
    assert.equal(MOB_DEFS[kind].foodLure, true);
    assert.equal(foodLureResponseForMob(kind, { heldItem: food, distance: 7, playerSpeed: 0 }), "approach");
  }
});

test("sea slugs and Pocket Goldfish are production aquarium creatures with distinct motion rigs", () => {
  for (const kind of ["sunset-sea-slug", "moonlace-sea-slug"] as const) {
    assert.equal(MOB_DEFS[kind].family, "sea-slug");
    assert.equal(MOB_DEFS[kind].aquatic, true);
    assert.equal(MOB_DEFS[kind].bottomDweller, true);
    assert.equal(aquaticSpawnBandForMob(kind), "floor");
    assert.equal(isAquariumCreature(kind), true);
    const model = createMobVisual(kind, 8);
    assert.ok(model.visual.getObjectByName(`${kind}-left-mantle-frill-1-pivot`));
  }
  assert.equal(MOB_DEFS["pocket-goldfish"].family, "fish");
  assert.equal(isAquariumCreature("pocket-goldfish"), true);
  assert.ok(fishKindsForHabitat("river").includes("pocket-goldfish"));
  assert.ok(fishKindsForHabitat("lumen-trench").includes("moonlace-sea-slug"));
  assert.ok(createMobVisual("pocket-goldfish", 9).visual.getObjectByName("pocket-goldfish-golden-belly"));
});

test("connected aquarium, hearth fireplace and both shields expose complete craftable content contracts", () => {
  const cells = new Map<string, BlockId>();
  for (let x = 0; x < AQUARIUM_MAX_BLOCKS + 3; x += 1) cells.set(`${x},4,0`, BlockId.GlassAquarium);
  cells.set("50,4,0", BlockId.GlassAquarium);
  const topology = buildAquariumTopologyFromWorld({ x: 0, y: 4, z: 0 }, (x, y, z) => cells.get(`${x},${y},${z}`) ?? BlockId.Air);
  assert.equal(topology.capacity, AQUARIUM_MAX_BLOCKS);
  assert.equal(topology.blocks.some((block) => block.x === 50), false);
  assert.equal(BLOCKS[BlockId.GlassAquarium].shape, "aquarium");
  assert.equal(BLOCKS[BlockId.GlassAquarium].solid, true, "tank glass must contain its residents and block traversal");
  assert.equal(BLOCK_ITEM_ALIASES[BlockId.GlassAquarium], Item.GlassAquariumItem);
  assert.equal(BLOCKS[BlockId.HearthFireplace].shape, "fireplace");
  assert.equal(BLOCKS[BlockId.HearthFireplace].layer, "emissive");
  for (const item of [Item.WoodenShield, Item.IronShield]) {
    assert.equal(ITEMS[item].useKind, "shield");
    assert.ok((ITEMS[item].maxDurability ?? 0) > 100);
    assert.ok(CREATIVE_BLOCKS.includes(item));
  }
  assert.ok((ITEMS[Item.IronShield].maxDurability ?? 0) > (ITEMS[Item.WoodenShield].maxDurability ?? 0));
  for (const id of ["wildwood-shield", "iron-shield", "connected-aquarium", "hearth-fireplace"]) assert.ok(RECIPES.some((recipe) => recipe.id === id), id);
});
