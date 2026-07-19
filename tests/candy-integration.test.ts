import assert from "node:assert/strict";
import test from "node:test";
import {
  BLOCKS,
  BLOCK_ITEM_ALIASES,
  BlockId,
  Item,
  ITEMS,
  RECIPES,
  itemForBlock,
  type InventorySlot,
  type ItemCode,
} from "../app/game/data.ts";
import { VoxelEngine } from "../app/game/engine.ts";
import { createGoldWallet, createMerchant } from "../app/game/economy.ts";
import { NPC_FACTION_IDS } from "../app/game/factions.ts";
import {
  DEFAULT_WORLD_OPTIONS,
  generationOptionsFromWorldOptions,
  normalizeWorldOptions,
  type WorldOptions,
} from "../app/game/world-storage.ts";
import { GENERATOR_VERSION, normalizeWorldGenerationOptions } from "../app/game/world.ts";
import { validatePayload } from "../app/game/multiplayer.ts";
import {
  SUGARWORKS_OUTPUT_CAP,
  SUGARWORKS_RECIPES,
  collectSugarworksOutput,
  createSugarworks,
  normalizeSugarworks,
  startSugarworksBatch,
  stepSugarworks,
  sugarworksRecipe,
} from "../app/game/candyworks.ts";
import { createBlueprintState, useBlueprintItem } from "../app/game/blueprints.ts";
import { resourceItemCode } from "../app/game/hearthroads-adapter.ts";

test("world faction options migrate legacy saves, preserve explicit wilderness, and project canonically", () => {
  const legacyOptions: Partial<WorldOptions> = { ...DEFAULT_WORLD_OPTIONS };
  delete legacyOptions.enabledFactions;

  assert.deepEqual(DEFAULT_WORLD_OPTIONS.enabledFactions, NPC_FACTION_IDS);
  assert.deepEqual(normalizeWorldOptions(legacyOptions).enabledFactions, NPC_FACTION_IDS);
  assert.deepEqual(normalizeWorldOptions({ enabledFactions: [] }).enabledFactions, []);

  const untrusted = (["sugarcourt", "hobbits", "sugarcourt", "unknown", 4, null] as unknown) as WorldOptions["enabledFactions"];
  assert.deepEqual(
    normalizeWorldOptions({ enabledFactions: untrusted }).enabledFactions,
    ["hobbits", "sugarcourt"],
    "valid faction ids should be filtered, deduplicated, and restored to canonical order",
  );

  const projected = generationOptionsFromWorldOptions({
    caveFrequency: 2.25,
    biomeScale: 1.5,
    resourceAbundance: 0.75,
    structures: false,
    enabledFactions: ["sugarcourt", "goblins"],
  });
  assert.deepEqual(projected, {
    profile: "world-below-v15",
    caveFrequency: 2.25,
    biomeScale: 1.5,
    resourceAbundance: 0.75,
    structures: false,
    enabledFactions: ["goblins", "sugarcourt"],
  });
  assert.deepEqual(normalizeWorldGenerationOptions(projected), projected);
  assert.deepEqual(generationOptionsFromWorldOptions({ enabledFactions: [] }).enabledFactions, []);
});

const OMIT_FACTIONS = Symbol("omit-factions");

function multiplayerSnapshot(enabledFactions: unknown | typeof OMIT_FACTIONS) {
  const worldOptions: Record<string, unknown> = {
    difficulty: "normal",
    dayLengthMinutes: 20,
    mobDensity: 1,
    butterflyDensity: 1,
    caveFrequency: 1,
    biomeScale: 1,
    resourceAbundance: 1,
    structures: true,
    weather: true,
    keepInventory: false,
    friendlyFire: false,
    sleepRule: "percentage",
    sleepPercentage: 50,
  };
  if (enabledFactions !== OMIT_FACTIONS) worldOptions.enabledFactions = enabledFactions;
  return {
    tick: 8,
    seed: "SUGARCOURT-NETWORK",
    generatorVersion: GENERATOR_VERSION,
    players: [],
    blockEdits: [],
    mobs: [],
    mobScope: { centerPlayerId: "player-sugarcourt-test", radius: 64, epoch: 1 },
    drops: [],
    dropScope: { centerPlayerId: "player-sugarcourt-test", radius: 64, epoch: 1 },
    time: { tick: 8, worldTime: 0.4, day: 2, weather: "clear" },
    worldOptions,
  };
}

test("multiplayer snapshots accept Sugarcourt faction choices and reject ambiguous faction arrays", () => {
  assert.equal(validatePayload("snapshot", multiplayerSnapshot(OMIT_FACTIONS)), true, "legacy peers may omit the field");
  assert.equal(validatePayload("snapshot", multiplayerSnapshot(NPC_FACTION_IDS)), true);
  assert.equal(validatePayload("snapshot", multiplayerSnapshot([])), true, "an explicit wilderness world is valid");
  assert.equal(validatePayload("snapshot", multiplayerSnapshot(["sugarcourt", "hobbits"])), true);

  assert.equal(validatePayload("snapshot", multiplayerSnapshot(["sugarcourt", "sugarcourt"])), false);
  assert.equal(validatePayload("snapshot", multiplayerSnapshot(["sugarcourt", "unknown"])), false);
  assert.equal(validatePayload("snapshot", multiplayerSnapshot(["hobbits", "goblins", "atlantians", "sugarcourt", "hobbits"])), false);
  assert.equal(validatePayload("snapshot", multiplayerSnapshot("sugarcourt")), false);

  const alignedPet = {
    ...multiplayerSnapshot(["sugarcourt"]),
    mobs: [{
      id: 41, kind: "taffy-hound", x: 1, y: 72, z: 3, yaw: 0, health: 12, state: "wander",
      factionId: "sugarcourt", aligned: true,
    }],
  };
  assert.equal(validatePayload("snapshot", alignedPet), true, "aligned Sugarcourt pets keep their culture over the network");
  assert.equal(validatePayload("snapshot", {
    ...alignedPet,
    mobs: [{ ...alignedPet.mobs[0], factionId: "unknown" }],
  }), false);
  assert.equal(validatePayload("snapshot", {
    ...alignedPet,
    mobs: [{ ...alignedPet.mobs[0], aligned: "yes" }],
  }), false);
});

test("neutral companion-orb trades require a truly empty metadata slot before charging the player", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const inventory = Array.from({ length: 36 }, () => ({ item: BlockId.Stone, count: 64 } as InventorySlot));
  inventory[0] = { item: Item.CaptureOrb, count: 15 };
  const merchant = createMerchant("host", "sugarcourt-kennel", "sugarcourt", "sugarcourt-kennelkeeper", 500);
  let toast = "";
  Object.assign(engine, {
    inventory,
    activeMerchantId: merchant.id,
    merchants: new Map([[merchant.id, merchant]]),
    goldWallet: createGoldWallet("host", "player", 10_000),
    events: { onToast: (message: string) => { toast = message; } },
  });
  const balanceBefore = engine.goldWallet.balance;
  const merchantRevisionBefore = engine.merchants.get(merchant.id)?.revision;

  assert.equal(engine.tradeWithActiveMerchant("buy", "unaligned-taffy-hound-orb", 1), false);
  assert.match(toast, /make room/i);
  assert.equal(engine.goldWallet.balance, balanceBefore, "a rejected purchase must not spend gold");
  assert.equal(engine.merchants.get(merchant.id)?.revision, merchantRevisionBefore, "a rejected purchase must not consume stock");
});

test("Sugarworks batches enforce blueprints, consume inputs atomically, and normalize saved output", () => {
  const recipeId = "sugarcourt-rockcandy-saber";
  const inputs = { "candied-alloy": 4, "crystal-shard": 2, "lollipop-petal": 1 };
  const locked = startSugarworksBatch(createSugarworks(), recipeId, inputs, createBlueprintState());
  assert.equal(locked.ok, false);
  assert.equal(locked.reason, "blueprint-locked");
  assert.deepEqual(locked.inventory, inputs, "a rejected batch must not consume ingredients");

  const learned = useBlueprintItem(createBlueprintState(), "sugarcourt-arms", 10).state;
  const started = startSugarworksBatch(createSugarworks(), recipeId, inputs, learned);
  assert.equal(started.ok, true);
  if (!started.ok) return;
  assert.deepEqual(started.inventory, {});
  assert.deepEqual(started.state.activeBatch, {
    recipeId,
    progressSeconds: 0,
    durationSeconds: sugarworksRecipe(recipeId)?.batchSeconds,
  });

  const finished = stepSugarworks(started.state, Number.POSITIVE_INFINITY);
  assert.deepEqual(finished.output, null, "non-finite elapsed time must not finish a batch");
  const trulyFinished = stepSugarworks(started.state, 86_400);
  assert.deepEqual(trulyFinished.output, { item: "rockcandy-saber", count: 1 });

  const normalized = normalizeSugarworks({
    schema: 999,
    selectedRecipeId: recipeId,
    activeBatch: { recipeId, progressSeconds: 999, durationSeconds: -5 },
    output: { item: "  rockcandy-saber  ", count: 999.8 },
  });
  assert.equal(normalized.schema, 1);
  assert.equal(normalized.activeBatch?.progressSeconds, sugarworksRecipe(recipeId)?.batchSeconds);
  assert.equal(normalized.activeBatch?.durationSeconds, sugarworksRecipe(recipeId)?.batchSeconds);
  assert.deepEqual(normalized.output, { item: "rockcandy-saber", count: SUGARWORKS_OUTPUT_CAP });

  const collected = collectSugarworksOutput(normalized, 3);
  assert.deepEqual(collected.collected, { item: "rockcandy-saber", count: 3 });
  assert.deepEqual(collected.state.output, { item: "rockcandy-saber", count: SUGARWORKS_OUTPUT_CAP - 3 });

  const blocked = startSugarworksBatch(
    normalizeSugarworks({ output: { item: "gumdrop", count: 1 } }),
    "sugarcourt-candied-alloy",
    { gumdrop: 4, "lollipop-petal": 2, "honey-jar": 1 },
    createBlueprintState(),
  );
  assert.equal(blocked.reason, "output-blocked");
});

test("candy blocks, liquids, items, recipes, and Sugarworks outputs have concrete registry entries", () => {
  const candyBlocks: readonly BlockId[] = [
    BlockId.SugarplumGrass,
    BlockId.SugarSoil,
    BlockId.CandywoodLog,
    BlockId.CandywoodLeaves,
    BlockId.BoiledSugarbrick,
    BlockId.Syrup,
    BlockId.Honey,
    BlockId.GumdropBush,
    BlockId.PeppermintTuft,
    BlockId.LollipopOrchid,
    BlockId.MarshmallowShrub,
    BlockId.PeppermintSprout,
    BlockId.PeppermintYoung,
    BlockId.PeppermintCrop,
    BlockId.CocoaSprout,
    BlockId.CocoaYoung,
    BlockId.CocoaCrop,
    BlockId.Sugarworks,
    BlockId.CandywoodSapling,
    BlockId.GiantLollipopOrchid,
  ];
  for (const id of candyBlocks) assert.equal(BLOCKS[id]?.id, id, `missing candy block ${id}`);

  const candyItems: readonly ItemCode[] = [
    Item.HoneyBucket,
    Item.SyrupBucket,
    Item.PeppermintCane,
    Item.PeppermintSeeds,
    Item.CocoaNib,
    Item.CocoaSeeds,
    Item.Gumdrop,
    Item.LollipopPetal,
    Item.MarshmallowTuft,
    Item.BonbonwingTreat,
    Item.SyrupfinFillet,
    Item.CandiedAlloy,
    Item.RockcandySaber,
    Item.PeppermintLance,
    Item.FondantCrown,
    Item.FondantCuirass,
    Item.FondantGreaves,
    Item.FondantBoots,
    Item.PeppermintRush,
    Item.MarshmallowWard,
    Item.SugarcourtArmsBlueprint,
    Item.FondantArmorBlueprint,
    Item.PeppermintRushBlueprint,
    Item.MarshmallowWardBlueprint,
    Item.SugarworksItem,
    Item.CandywoodLogItem,
    Item.CandywoodLeavesItem,
    Item.SugarplumGrassBlock,
    Item.BoiledSugarbrickItem,
    Item.CandywoodSaplingItem,
    Item.SugarSoilBlock,
  ];
  for (const id of candyItems) assert.equal(ITEMS[id]?.id, id, `missing candy item ${id}`);

  assert.equal(BLOCKS[BlockId.Honey].liquid, "honey");
  assert.equal(BLOCKS[BlockId.Syrup].liquid, "syrup");
  assert.equal(BLOCKS[BlockId.Honey].solid, false);
  assert.equal(BLOCKS[BlockId.Syrup].solid, false);
  assert.equal(ITEMS[Item.HoneyBucket].bucketLiquid, "honey");
  assert.equal(ITEMS[Item.SyrupBucket].bucketLiquid, "syrup");
  assert.equal(ITEMS[Item.HoneyBucket].maxStack, 1);
  assert.equal(ITEMS[Item.SyrupBucket].maxStack, 1);

  assert.deepEqual(RECIPES.find((recipe) => recipe.id === "sugarworks")?.output, { item: Item.SugarworksItem, count: 1 });
  assert.deepEqual(RECIPES.find((recipe) => recipe.id === "honey_bucket")?.output, { item: Item.HoneyBucket, count: 1 });
  assert.equal(ITEMS[Item.PeppermintRush].potionId, "peppermint-rush");
  assert.equal(ITEMS[Item.MarshmallowWard].potionId, "marshmallow-ward");
  assert.equal(ITEMS[Item.SugarcourtArmsBlueprint].blueprintId, "sugarcourt-arms");
  assert.equal(ITEMS[Item.FondantArmorBlueprint].blueprintId, "sugarcourt-armor");

  for (const recipe of SUGARWORKS_RECIPES) {
    const item = resourceItemCode(recipe.output.item);
    assert.notEqual(item, null, `Sugarworks output ${recipe.output.item} must resolve to an inventory item`);
    if (item !== null) assert.equal(ITEMS[item]?.id, item);
  }
});

test("new breakable candy blocks use explicit aliases instead of colliding with legacy item ids", () => {
  const aliases = new Map<BlockId, ItemCode>([
    [BlockId.SugarplumGrass, Item.SugarplumGrassBlock],
    [BlockId.SugarSoil, Item.SugarSoilBlock],
    [BlockId.CandywoodLog, Item.CandywoodLogItem],
    [BlockId.CandywoodLeaves, Item.CandywoodLeavesItem],
    [BlockId.BoiledSugarbrick, Item.BoiledSugarbrickItem],
    [BlockId.GumdropBush, Item.Gumdrop],
    [BlockId.PeppermintTuft, Item.PeppermintCane],
    [BlockId.LollipopOrchid, Item.LollipopPetal],
    [BlockId.MarshmallowShrub, Item.MarshmallowTuft],
    [BlockId.PeppermintSprout, Item.PeppermintSeeds],
    [BlockId.PeppermintYoung, Item.PeppermintSeeds],
    [BlockId.PeppermintCrop, Item.PeppermintCane],
    [BlockId.CocoaSprout, Item.CocoaSeeds],
    [BlockId.CocoaYoung, Item.CocoaSeeds],
    [BlockId.CocoaCrop, Item.CocoaNib],
    [BlockId.Sugarworks, Item.SugarworksItem],
    [BlockId.CandywoodSapling, Item.CandywoodSaplingItem],
    [BlockId.GiantLollipopOrchid, Item.LollipopPetal],
  ]);

  for (const [block, item] of aliases) {
    assert.equal(BLOCK_ITEM_ALIASES[block], item, `block ${block} needs an explicit inventory alias`);
    assert.equal(itemForBlock(block), item);
    assert.notEqual(item, block, `block ${block} must not leak into the overlapping legacy item namespace`);
    assert.equal(ITEMS[item]?.id, item);
  }

  assert.equal(BLOCK_ITEM_ALIASES[BlockId.Honey], undefined, "liquids are transferred by bucket, not as block drops");
  assert.equal(BLOCK_ITEM_ALIASES[BlockId.Syrup], undefined, "liquids are transferred by bucket, not as block drops");
});
