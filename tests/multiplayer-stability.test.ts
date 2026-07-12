import assert from "node:assert/strict";
import test from "node:test";
import { BlockId, Item } from "../app/game/data.ts";
import { createGoldWallet, createMerchant } from "../app/game/economy.ts";
import { commerceItemCode } from "../app/game/hearthroads-adapter.ts";
import {
  VoxelEngine,
  blockEditIntersectsPlayer,
  markRendererContextLost,
  normalizeMultiplayerPlayerState,
  restoreRendererContext,
} from "../app/game/engine.ts";
import { createSkillState } from "../app/game/skills.ts";
import { validatePayload, validatePeerIdentity, type PlayerSessionSnapshot } from "../app/game/multiplayer.ts";

function sessionState(): PlayerSessionSnapshot {
  const inventory = Array.from({ length: 36 }, () => null) as PlayerSessionSnapshot["inventory"];
  inventory[0] = { item: Item.Apple, count: 1, metadata: { provenance: { orchard: "host-world", pickedDay: 4 } } };
  return {
    playerId: "player_stable_guest_001",
    revision: 7,
    variant: "female",
    inventory,
    equipment: { head: null, chest: null, legs: null, feet: null },
    selected: 0,
    health: 8,
    hunger: 9,
    xp: 12,
    level: 2,
    skills: createSkillState(),
  };
}

test("host-owned player snapshots preserve variant, metadata inventory, and skills", () => {
  const state = sessionState();
  assert.equal(validatePeerIdentity({ id: state.playerId, name: "Guest", color: "#8855cc", variant: "female" }), true);
  assert.equal(validatePayload("player-state", {
    requestId: "state_request_001",
    actorId: state.playerId,
    state,
    status: "request",
  }), true);
  const normalized = normalizeMultiplayerPlayerState(state, state.playerId);
  assert.equal(normalized.variant, "female");
  assert.deepEqual(normalized.inventory[0]?.metadata, state.inventory[0]?.metadata);
  assert.deepEqual(normalized.skills, state.skills);
});

test("placement collision rejects blocks occupying local or remote player bodies", () => {
  const player = { x: 4, y: 12, z: -3 };
  assert.equal(blockEditIntersectsPlayer({ x: 4, y: 12, z: -3, type: BlockId.Stone }, player), true);
  assert.equal(blockEditIntersectsPlayer({ x: 6, y: 12, z: -3, type: BlockId.Stone }, player), false);
  assert.equal(blockEditIntersectsPlayer({ x: 4, y: 12, z: -3, type: BlockId.Air }, player), false);
});

test("a lost WebGL context pauses rendering state and restores without deleting the world", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const rendererStates: boolean[] = [];
  const toasts: string[] = [];
  let prevented = false;
  let resets = 0;
  let resizes = 0;
  Object.assign(engine, {
    disposed: false,
    webglContextLost: false,
    lightRefreshTimer: 5,
    renderer: { resetState: () => { resets += 1; } },
    resize: () => { resizes += 1; },
    events: {
      onRendererState: (lost: boolean) => rendererStates.push(lost),
      onToast: (message: string) => toasts.push(message),
    },
  });
  prevented = markRendererContextLost(engine as never);
  assert.equal(prevented, true);
  assert.equal(engine.webglContextLost, true);
  restoreRendererContext(engine as never);
  assert.equal(engine.webglContextLost, false);
  assert.deepEqual(rendererStates, [true, false]);
  assert.equal(resets, 1);
  assert.equal(resizes, 1);
  assert.equal(engine.lightRefreshTimer, 0);
  assert.match(toasts.join(" "), /restor/iu);
});

function tradingEngine() {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const merchant = createMerchant("trade-world", "merchant_test", "hobbits", "farmer", 2_000);
  Object.assign(engine, {
    activeMerchantId: merchant.id,
    merchants: new Map([[merchant.id, merchant]]),
    goldWallet: createGoldWallet("trade-world", "player_test", 10_000),
    inventory: Array.from({ length: 36 }, () => null),
    bestiary: {},
    events: { onToast: () => undefined },
    audio: { play: () => undefined },
    dispatchQuestEvent: () => undefined,
    saveSoon: () => undefined,
    emitHud: () => undefined,
  });
  const stock = merchant.inventory.find((entry) => commerceItemCode(entry.itemKey) !== null);
  assert.ok(stock, "test merchant needs at least one deliverable stock item");
  return { engine, merchant, stock };
}

test("player-buys uses the buy branch and commits item plus gold atomically", () => {
  const { engine, stock } = tradingEngine();
  const item = commerceItemCode(stock.itemKey)!;
  const goldBefore = BigInt(engine.goldWallet.balance);
  assert.equal(engine.tradeWithActiveMerchant("player-buys", stock.itemKey, 2), true);
  assert.equal(engine.countItem(item), 2);
  assert.ok(BigInt(engine.goldWallet.balance) < goldBefore, "buying must spend, never grant, gold");
});

test("a full pack leaves wallet, merchant stock, and inventory unchanged", () => {
  const { engine, merchant, stock } = tradingEngine();
  engine.inventory = Array.from({ length: 36 }, () => ({ item: BlockId.Stone, count: 64 }));
  const walletBefore = structuredClone(engine.goldWallet);
  const inventoryBefore = structuredClone(engine.inventory);
  assert.equal(engine.tradeWithActiveMerchant("player-buys", stock.itemKey, 1), false);
  assert.deepEqual(engine.goldWallet, walletBefore);
  assert.deepEqual(engine.merchants.get(merchant.id), merchant);
  assert.deepEqual(engine.inventory, inventoryBefore);
});

test("player-sells removes the exact quantity before committing payment", () => {
  const { engine } = tradingEngine();
  engine.inventory[0] = { item: Item.Apple, count: 5 };
  const goldBefore = BigInt(engine.goldWallet.balance);
  assert.equal(engine.tradeWithActiveMerchant("player-sells", "apple", 3), true);
  assert.equal(engine.countItem(Item.Apple), 2);
  assert.ok(BigInt(engine.goldWallet.balance) > goldBefore);
});
