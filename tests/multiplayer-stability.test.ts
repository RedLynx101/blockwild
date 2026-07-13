import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BlockId, Item } from "../app/game/data.ts";
import { createGoldWallet, createMerchant } from "../app/game/economy.ts";
import { commerceItemCode } from "../app/game/hearthroads-adapter.ts";
import {
  VoxelEngine,
  blockEditIntersectsPlayer,
  consumeMultiplayerPlacementItem,
  markRendererContextLost,
  multiplayerContainerTransactionConservesItems,
  multiplayerPlayerStateSignature,
  normalizeMultiplayerPlayerState,
  restoreRendererContext,
} from "../app/game/engine.ts";
import { createSkillState } from "../app/game/skills.ts";
import { MOB_DEFS } from "../app/game/mobs.ts";
import { createPeelopState } from "../app/game/peelop.ts";
import { createReedstriderBond } from "../app/game/ecology.ts";
import { createEmptyApiaryBlock } from "../app/game/apiary.ts";
import { createDragonState } from "../app/game/dragons.ts";
import { createPeerIdentity, validatePayload, validatePeerIdentity, type ContainerAction, type CreatureAction, type PlayerSessionSnapshot } from "../app/game/multiplayer.ts";

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

test("shared furnace/facility payloads are bounded and item transactions conserve exact metadata", () => {
  const before = sessionState();
  const after = structuredClone(before);
  after.inventory[0] = null;
  after.cursor = { ...before.inventory[0]! };
  after.revision += 1;
  assert.equal(multiplayerContainerTransactionConservesItems(before, [null, null, null], after, [null, null, null]), true);
  const duplicated = structuredClone(after);
  duplicated.inventory[1] = { ...before.inventory[0]! };
  assert.equal(multiplayerContainerTransactionConservesItems(before, [null, null, null], duplicated, [null, null, null]), false);
  assert.equal(validatePayload("container-action", {
    requestId: "furnace_sync_001", actorId: before.playerId, containerId: "furnace:1,2,3", kind: "open",
    expectedRevision: 2, slots: [null, null, null], machine: { progress: 3.5, burn: 4, burnMax: 8 }, status: "accepted",
  }), true);
  assert.equal(validatePayload("facility-action", {
    requestId: "facility_open_001", actorId: before.playerId, facilityId: "apiary:1,2,3", facilityKind: "apiary",
    kind: "open", expectedRevision: 0, status: "request",
  }), true);
  assert.equal(validatePayload("mob-snapshot", {
    tick: 1,
    mobs: [{ id: 3, kind: "peelop", x: 0, y: 1, z: 2, yaw: 0, health: 6, state: "wander", lead: { ownerId: before.playerId, maximumLength: 7 } }],
  }), true);
  assert.equal(validatePayload("creature-action", {
    requestId: "dragon_command_001", actorId: before.playerId, tick: 8, kind: "dragon-command", targetId: 31,
    command: "guard-lair", status: "request",
  }), true);
  assert.equal(validatePayload("creature-action", {
    requestId: "dragon_command_bad", actorId: before.playerId, tick: 8, kind: "dragon-command", targetId: 31,
    command: "become-invincible", status: "request",
  }), false);
});

test("guest dragon panel actions remain intents until the host responds", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const player = sessionState();
  const dragonState = { ...createDragonState("fire", { dragonId: "guest-panel-dragon", tamed: true, ownerId: player.playerId }), scaleReserve: 4 };
  const dragon = { id: 31, dragonState };
  const sent: Array<Partial<CreatureAction>> = [];
  Object.assign(engine, {
    multiplayer: { role: "guest", identity: { id: player.playerId } },
    activeDragon: dragon,
    requestNetworkCreatureAction: (action: Partial<CreatureAction>) => { sent.push(action); return true; },
  });
  const before = structuredClone(dragonState);
  assert.equal(engine.commandActiveDragon("wander"), true);
  assert.equal(engine.toggleActiveDragonShoulder(), true);
  assert.equal(engine.harvestActiveDragonScales(), 1);
  assert.deepEqual(sent, [
    { kind: "dragon-command", targetId: 31, command: "wander" },
    { kind: "dragon-shoulder", targetId: 31 },
    { kind: "dragon-harvest", targetId: 31 },
  ]);
  assert.deepEqual(dragon.dragonState, before);
});

test("host atomically resolves guest dragon panel actions and broadcasts player plus mob authority", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const player = sessionState();
  const dragonState = { ...createDragonState("fire", { dragonId: "host-panel-dragon", tamed: true, ownerId: player.playerId }), scaleReserve: 4 };
  const dragon = { id: 31, name: "Cinder", health: dragonState.health, dragonState, group: { position: new THREE.Vector3(2, 2, 3) } };
  const responses: CreatureAction[] = [];
  const mobFrames: unknown[] = [];
  const peer = { id: player.playerId, name: "Guest", color: "#fff" };
  Object.assign(engine, {
    multiplayer: {
      role: "host", identity: { id: "player_host_001" },
      sendCreatureAction: (action: CreatureAction) => { responses.push(action); return 1; },
      sendMobSnapshot: (snapshot: unknown) => { mobFrames.push(snapshot); return 1; },
      sendPlayerState: () => 1,
      getPeer: () => ({ identity: peer }),
    },
    remotePlayers: new Map([[player.playerId, { target: { x: 1, y: 2, z: 3 } }]]),
    multiplayerPlayerStates: new Map([[player.playerId, player]]),
    mobs: [dragon],
    multiplayerTick: 12,
    pendingReliableRequests: new Map(),
    queueCriticalReliableRequest: (_key: string, send: () => number) => { send(); return true; },
    applyDragonState: (mob: typeof dragon, state: typeof dragonState) => { mob.dragonState = state; },
    networkMobSnapshotForPeer: () => [{ id: dragon.id }],
    saveSoon: () => undefined,
    emitHud: () => undefined,
  });
  const api = engine as unknown as { handleRemoteCreatureAction(action: CreatureAction, peer: unknown): void };
  api.handleRemoteCreatureAction({
    requestId: "dragon_harvest_001", actorId: player.playerId, tick: 12, kind: "dragon-harvest", targetId: dragon.id, status: "request",
  }, { identity: peer });
  const committed = engine.multiplayerPlayerStates.get(player.playerId)!;
  assert.equal(committed.revision, player.revision + 1);
  assert.equal(committed.inventory.some((slot) => slot?.item === Item.FireDragonScale && slot.count === 4), true);
  assert.equal(dragon.dragonState.scaleReserve, 0);
  assert.equal(responses.some((response) => response.kind === "dragon-harvest" && response.status === "accepted" && response.playerState?.revision === committed.revision), true);
  assert.equal(mobFrames.length, 1);
  api.handleRemoteCreatureAction({
    requestId: "dragon_command_002", actorId: player.playerId, tick: 13, kind: "dragon-command", targetId: dragon.id, command: "wander", status: "request",
  }, { identity: peer });
  assert.equal(dragon.dragonState.command, "wander");
  api.handleRemoteCreatureAction({
    requestId: "dragon_shoulder_003", actorId: player.playerId, tick: 14, kind: "dragon-shoulder", targetId: dragon.id, status: "request",
  }, { identity: peer });
  assert.equal(dragon.dragonState.onShoulder, true);
  assert.equal(mobFrames.length, 3);

  dragon.dragonState = { ...dragon.dragonState, scaleReserve: 2 };
  engine.remotePlayers.get(player.playerId)!.target.x = 100;
  api.handleRemoteCreatureAction({
    requestId: "dragon_far_004", actorId: player.playerId, tick: 15, kind: "dragon-harvest", targetId: dragon.id, status: "request",
  }, { identity: peer });
  assert.equal(responses.at(-1)?.status, "rejected");
  assert.equal(dragon.dragonState.scaleReserve, 2);
  engine.remotePlayers.get(player.playerId)!.target.x = 1;
  dragon.dragonState = { ...dragon.dragonState, ownerId: "player_someone_else" };
  api.handleRemoteCreatureAction({
    requestId: "dragon_owner_005", actorId: player.playerId, tick: 16, kind: "dragon-harvest", targetId: dragon.id, status: "request",
  }, { identity: peer });
  assert.equal(responses.at(-1)?.status, "rejected");
  assert.equal(dragon.dragonState.scaleReserve, 2);
});

test("read-only guest facilities restore their authoritative pack baseline before generic sync resumes", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const player = sessionState();
  const sent: unknown[] = [];
  Object.assign(engine, {
    multiplayer: { role: "guest", identity: { id: player.playerId }, sendFacilityAction: (action: unknown) => { sent.push(action); return 1; } },
    multiplayerPlayerStateRevision: player.revision,
    multiplayerTick: 3,
    multiplayerFacilityPlayerBaseline: null,
    multiplayerFacilityRevisions: new Map(),
    multiplayerPendingFacilityMutations: new Set<string>(),
    inventory: player.inventory.map((slot) => slot ? structuredClone(slot) : null),
    cursor: null,
    equipment: { head: null, chest: null, legs: null, feet: null },
    offhand: null,
    selected: player.selected,
    health: player.health,
    hunger: player.hunger,
    xp: player.xp,
    level: player.level,
    skillState: player.skills,
    playerVariant: player.variant,
    activeNetworkFacilityId: "apiary:1,2,3",
    localPlayerModel: { setAppearance: () => undefined },
    emitHud: () => undefined,
    queueCriticalReliableRequest: (_key: string, send: () => number) => { send(); return true; },
  });
  const api = engine as unknown as {
    requestNetworkFacilitySnapshot(facility: { id: string; kind: "apiary" }): boolean;
    restoreGuestFacilityPlayerBaseline(): boolean;
  };
  assert.equal(api.requestNetworkFacilitySnapshot({ id: "apiary:1,2,3", kind: "apiary" }), true);
  engine.inventory[0] = { item: Item.FireDragonScale, count: 64 };
  assert.equal(api.restoreGuestFacilityPlayerBaseline(), true);
  assert.deepEqual(engine.inventory[0], player.inventory[0]);
  assert.equal(engine.multiplayerFacilityPlayerBaseline, null);
  assert.equal(sent.length, 1);
});

test("generic facility protocol rejects opaque guest-authored machine replacement", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const player = sessionState();
  const facilityId = "apiary:1,2,3";
  const responses: CreatureAction[] = [];
  Object.assign(engine, {
    multiplayer: { role: "host", sendFacilityAction: (action: CreatureAction) => { responses.push(action); return 1; } },
    remotePlayers: new Map([[player.playerId, { target: { x: 1, y: 2, z: 3 } }]]),
    world: { getBlock: () => BlockId.Apiary },
    apiaries: new Map([["1,2,3", createEmptyApiaryBlock()]]),
    multiplayerFacilityRevisions: new Map([[facilityId, 4]]),
    multiplayerPeerActiveFacilities: new Map<string, string>(),
    multiplayerPeerFacilitySignatures: new Map<string, string>(),
    multiplayerPlayerStates: new Map([[player.playerId, player]]),
    multiplayerPendingFacilityMutations: new Set<string>(),
    pendingReliableRequests: new Map(),
    queueCriticalReliableRequest: (_key: string, send: () => number) => { send(); return true; },
  });
  const facilityApi = engine as unknown as { handleRemoteFacilityAction(action: unknown, peer: unknown): void };
  const peer = { identity: { id: player.playerId, name: "Guest", color: "#fff" } };
  facilityApi.handleRemoteFacilityAction({
    requestId: "facility_open_001", actorId: player.playerId, facilityId, facilityKind: "apiary", kind: "open", status: "request",
  }, peer);
  assert.equal(responses.at(-1)?.status, "accepted");
  assert.equal(engine.multiplayerPeerActiveFacilities.get(player.playerId), facilityId);
  (engine as unknown as { handleRemoteFacilityAction(action: unknown, peer: unknown): void }).handleRemoteFacilityAction({
    requestId: "facility_forgery_001", actorId: player.playerId, facilityId, facilityKind: "apiary", kind: "update",
    expectedRevision: 4, expectedPlayerRevision: player.revision,
    state: { schema: 1, attached: true, queen: null, honey: 12 },
    playerState: { ...player, revision: player.revision + 1 }, status: "request",
  }, peer);
  assert.equal(responses.at(-1)?.status, "rejected");
  assert.equal(engine.apiaries.get("1,2,3")?.queen, null);
  facilityApi.handleRemoteFacilityAction({
    requestId: "facility_close_001", actorId: player.playerId, facilityId, facilityKind: "apiary", kind: "close", status: "request",
  }, peer);
  assert.equal(engine.multiplayerPeerActiveFacilities.has(player.playerId), false);
});

test("incremental host acknowledgements cannot snap a guest's locally predicted hotbar selection backward", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const state = sessionState();
  Object.assign(engine, {
    selected: 6,
    inventory: Array.from({ length: 36 }, () => null), cursor: null,
    equipment: { head: null, chest: null, legs: null, feet: null }, offhand: null,
    skillState: createSkillState(), playerVariant: "female", multiplayerPlayerStateRevision: 0,
    localPlayerModel: { setAppearance: () => undefined }, emitHud: () => undefined,
    multiplayer: { identity: { id: state.playerId, variant: "female" } },
  });
  (engine as unknown as { applyLocalPlayerSessionSnapshot(state: PlayerSessionSnapshot, preserve: boolean): void })
    .applyLocalPlayerSessionSnapshot({ ...state, selected: 1 }, true);
  assert.equal(engine.selected, 6);
});

test("selection-only scrolling stays off the reliable full-player-state lane", () => {
  const before = sessionState();
  const after = { ...before, selected: 7 };
  assert.equal(
    multiplayerPlayerStateSignature(after),
    multiplayerPlayerStateSignature(before),
    "the unordered pose lane owns hotbar intent, so wheel notches must not dirty a full reliable pack image",
  );
});

test("guest merchant buttons send a host-authoritative trade intent without mutating local stock", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const merchant = createMerchant("trade-world", "merchant-guest-test", "hobbits", "farmer", 0);
  const sent: CreatureAction[] = [];
  Object.assign(engine, {
    activeMerchantId: merchant.id,
    merchants: new Map([[merchant.id, merchant]]),
    multiplayer: { role: "guest" },
    requestNetworkCreatureAction: (action: CreatureAction) => { sent.push(action); return true; },
    skillState: createSkillState(),
  });
  assert.equal(engine.tradeWithActiveMerchant("player-buys", "apple", 2), true);
  assert.deepEqual(sent[0], { kind: "trade", merchantId: merchant.id, tradeDirection: "player-buys", itemKey: "apple", tradeCount: 2 });
  assert.deepEqual(engine.merchants.get(merchant.id), merchant);
});

test("host validates a guest keeper before hitching their lead to a real nearby fence", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const player = sessionState();
  const sent: CreatureAction[] = [];
  const mob = { id: 44, name: "Peelop", group: { position: new THREE.Vector3(2, 2, 3) } };
  Object.assign(engine, {
    multiplayer: {
      role: "host",
      sendCreatureAction: (action: CreatureAction) => { sent.push(action); return 1; },
      sendMobSnapshot: () => 1,
    },
    remotePlayers: new Map([[player.playerId, { target: { x: 1, y: 2, z: 3 } }]]),
    multiplayerPlayerStates: new Map([[player.playerId, player]]),
    mobs: [mob],
    leadAnchors: new Map([[mob.id, { mobId: String(mob.id), ownerId: player.playerId, maximumLength: 7 }]]),
    world: { getBlock: () => BlockId.WildwoodFence },
    queueCriticalReliableRequest: (_key: string, send: () => number) => { send(); return true; },
    networkMobSnapshotForPeer: () => [], saveSoon: () => undefined,
  });
  (engine as unknown as { handleRemoteCreatureAction(action: CreatureAction, peer: unknown): void }).handleRemoteCreatureAction({
    requestId: "lead_hitch_001", actorId: player.playerId, tick: 1, kind: "lead-hitch", targetId: mob.id, x: 3, y: 2, z: 3, status: "request",
  }, { identity: { id: player.playerId, name: "Guest", color: "#fff" } });
  assert.deepEqual(engine.leadAnchors.get(mob.id)?.fence, { x: 3, y: 2, z: 3 });
  assert.equal(sent.at(-1)?.status, "accepted");
});

test("host merchant trade commits guest wallet, inventory, and shared stock atomically and rechecks range", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const player = { ...sessionState(), inventory: Array.from({ length: 36 }, () => null) as PlayerSessionSnapshot["inventory"] };
  const merchant = createMerchant("trade-world", "merchant-host-test", "hobbits", "farmer", 2_000);
  const stock = merchant.inventory.find((entry) => commerceItemCode(entry.itemKey) !== null)!;
  const item = commerceItemCode(stock.itemKey)!;
  const responses: CreatureAction[] = [];
  const merchantMob = { residentId: merchant.id, health: 10, group: { position: new THREE.Vector3(2, 2, 3) } };
  const peer = { id: player.playerId, name: "Guest", color: "#fff" };
  Object.assign(engine, {
    multiplayer: {
      role: "host", identity: { id: "player_host_001" },
      sendCreatureAction: (action: CreatureAction) => { responses.push(action); return 1; },
      sendPlayerState: () => 1,
      getPeer: () => ({ identity: peer }),
    },
    multiplayerPeerActiveMerchants: new Map([[player.playerId, merchant.id]]),
    multiplayerPlayerStates: new Map([[player.playerId, player]]),
    multiplayerPlayerWallets: new Map([[player.playerId, createGoldWallet("trade-world", player.playerId, 10_000)]]),
    merchants: new Map([[merchant.id, merchant]]), mobs: [merchantMob],
    remotePlayers: new Map([[player.playerId, { target: { x: 1, y: 2, z: 3 } }]]),
    factionRelations: { alignments: { hobbits: 0 } },
    queueCriticalReliableRequest: (_key: string, send: () => number) => { send(); return true; },
    saveSoon: () => undefined,
  });
  const api = engine as unknown as { resolveHostMerchantTrade(action: CreatureAction, peer: unknown, state: PlayerSessionSnapshot): void };
  api.resolveHostMerchantTrade({ requestId: "trade_buy_001", actorId: player.playerId, tick: 1, kind: "trade", merchantId: merchant.id, tradeDirection: "player-buys", itemKey: stock.itemKey, tradeCount: 1, status: "request" }, peer, player);
  const bought = engine.multiplayerPlayerStates.get(player.playerId)!;
  assert.ok(bought.inventory.some((slot) => slot?.item === item));
  assert.equal(responses.at(-1)?.status, "accepted");
  api.resolveHostMerchantTrade({ requestId: "trade_sell_001", actorId: player.playerId, tick: 2, kind: "trade", merchantId: merchant.id, tradeDirection: "player-sells", itemKey: stock.itemKey, tradeCount: 1, status: "request" }, peer, bought);
  assert.equal(engine.multiplayerPlayerStates.get(player.playerId)!.inventory.some((slot) => slot?.item === item), false);
  engine.remotePlayers.get(player.playerId)!.target.x = 100;
  api.resolveHostMerchantTrade({ requestId: "trade_far_001", actorId: player.playerId, tick: 3, kind: "trade", merchantId: merchant.id, tradeDirection: "player-buys", itemKey: stock.itemKey, tradeCount: 1, status: "request" }, peer, engine.multiplayerPlayerStates.get(player.playerId)!);
  assert.equal(responses.at(-1)?.status, "rejected");
});

test("character profile identities remain stable and valid across both join paths", () => {
  const colors = { skin: "#c98f6b", hair: "#17191d", shirt: "#3f7fba", trousers: "#293554", accent: "#f0c85b" } as const;
  const id = "browser-01abcdef.character-02abcdef";
  const identity = createPeerIdentity("Tidekeeper", colors.shirt, () => id, "female", {
    profileId: "character-02abcdef",
    browserId: "browser-01abcdef",
    sex: "female",
    race: "atlantian",
    colors,
    startingSkills: { melee: 3, ranged: 1, mining: 4, crafting: 2, survival: 3, husbandry: 2, exploration: 2, magic: 1, bartering: 1, luck: 1 },
  });
  assert.equal(identity.id, id);
  assert.equal(validatePeerIdentity(identity), true);
  assert.equal(Object.values(identity.startingSkills ?? {}).reduce((total, value) => total + value, 0), 20);
  assert.equal(validatePeerIdentity({ ...identity, startingSkills: { ...identity.startingSkills!, luck: 2 } }), false);
  assert.equal(validatePayload("player-pose", {
    playerId: id,
    tick: 4,
    x: 1, y: 2, z: 3,
    yaw: 0, pitch: 0,
    vx: 0, vy: 0, vz: 0,
    grounded: false,
    variant: "female",
    sex: "female",
    profileId: identity.profileId,
    browserId: identity.browserId,
    race: identity.race,
    colors,
    swimming: 1,
    seated: 0,
    mountedCreatureId: 22,
  }), true);
});

test("a guest can open only a real nearby shared furnace and receives its slots and clocks", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const player = sessionState();
  const key = "1,2,3";
  const responses: ContainerAction[] = [];
  let blockAtTarget = BlockId.Furnace;
  Object.assign(engine, {
    multiplayer: {
      role: "host",
      sendContainerAction: (action: ContainerAction) => { responses.push(action); return 1; },
    },
    remotePlayers: new Map([[player.playerId, { target: { x: 1, y: 2, z: 4 } }]]),
    world: { getBlock: () => blockAtTarget },
    furnaces: new Map([[key, {
      input: { item: BlockId.Cobblestone, count: 2 },
      fuel: { item: Item.Coal, count: 3 },
      output: null,
      progress: 1.25,
      burn: 4.5,
      burnMax: 8,
    }]]),
    chests: new Map(), boats: new Map(), mobs: [],
    multiplayerContainerRevisions: new Map([[`furnace:${key}`, 6]]),
    multiplayerPlayerStates: new Map([[player.playerId, player]]),
    multiplayerPeerActiveContainers: new Map<string, string>(),
    multiplayerPeerContainerSignatures: new Map<string, string>(),
    queueCriticalReliableRequest: (_key: string, send: () => number) => { send(); return true; },
  });
  const api = engine as unknown as { handleRemoteContainerAction(action: ContainerAction, peer: unknown): void };
  const peer = { identity: { id: player.playerId, name: "Guest", color: "#fff" } };
  const request: ContainerAction = {
    requestId: "furnace_open_001", actorId: player.playerId, containerId: `furnace:${key}`, kind: "open", status: "request",
  };
  api.handleRemoteContainerAction(request, peer);
  assert.equal(responses.at(-1)?.status, "accepted");
  assert.equal(responses.at(-1)?.containerId, `furnace:${key}`);
  assert.deepEqual(responses.at(-1)?.slots, [{ item: BlockId.Cobblestone, count: 2 }, { item: Item.Coal, count: 3 }, null]);
  assert.deepEqual(responses.at(-1)?.machine, { progress: 1.25, burn: 4.5, burnMax: 8 });

  blockAtTarget = BlockId.Stone;
  api.handleRemoteContainerAction({ ...request, requestId: "furnace_open_spoofed_001" }, peer);
  assert.equal(responses.at(-1)?.status, "rejected", "a saved furnace record cannot be opened after its world block is gone");
});

test("host mob damage uses a peer actor id and never the invalid short synthetic mob id", () => {
  const base = {
    requestId: "mob_hit_12_400",
    tick: 400,
    targetKind: "player" as const,
    targetId: "player_stable_guest_001",
    attack: "melee" as const,
    status: "accepted" as const,
    resultingHealth: 4,
    killed: false,
  };
  assert.equal(validatePayload("combat-action", { ...base, actorId: "player_host_authority_001" }), true);
  assert.equal(validatePayload("combat-action", { ...base, actorId: "mob_12" }), false);
});

test("tree effects and companion transactions are bounded reliable actions", () => {
  const actorId = "player_stable_guest_001";
  assert.equal(validatePayload("block-action", {
    requestId: "tree_action_001",
    actorId,
    tick: 90,
    kind: "batch",
    edits: [{ x: 4, y: 8, z: -2, type: BlockId.Air }],
    effect: { kind: "tree-fell", rootX: 4, rootY: 8, rootZ: -2, directionX: 1, directionZ: 0 },
    status: "request",
  }), true);
  assert.equal(validatePayload("creature-action", {
    requestId: "creature_capture_001",
    actorId,
    tick: 91,
    kind: "capture",
    targetId: 22,
    status: "request",
  }), true);
  assert.equal(validatePayload("creature-action", {
    requestId: "creature_command_001",
    actorId,
    tick: 92,
    kind: "command",
    targetId: 22,
    command: "follow",
    distance: "dynamic",
    status: "request",
  }), true);
  assert.equal(validatePayload("mob-snapshot", {
    tick: 93,
    mobs: [{
      id: 22, kind: "peelop", x: 4, y: 8, z: -2, yaw: 0, health: 8, state: "wander",
      tamed: true, ownerId: actorId, command: "follow", name: "Nana", attunedOrbId: null,
    }],
  }), true);
  assert.equal(validatePayload("creature-action", {
    requestId: "aquarium_insert_001",
    actorId,
    tick: 94,
    kind: "aquarium-insert",
    containerKey: "4,8,-2",
    status: "request",
  }), true);
  assert.equal(validatePayload("creature-action", {
    requestId: "aquarium_state_001",
    actorId,
    tick: 95,
    kind: "aquarium-sync",
    containerKey: "4,8,-2",
    aquariumState: { schema: 1, blockKeys: ["4,8,-2"], residents: [], lastBreedingCycle: 10 },
    status: "accepted",
  }), true);
  assert.equal(validatePayload("creature-action", {
    requestId: "creature_interact_001",
    actorId,
    tick: 96,
    kind: "interact",
    targetId: 22,
    crouching: false,
    status: "request",
  }), true);
  assert.equal(validatePayload("creature-action", {
    requestId: "creature_mount_001",
    actorId,
    tick: 97,
    kind: "interact",
    targetId: 22,
    mounted: true,
    panel: "follower",
    message: "Mounted companion.",
    status: "accepted",
  }), true);
});

test("container requests bind chest and player revisions and demand-sync without slot uploads", () => {
  const actorId = "player_stable_guest_001";
  assert.equal(validatePayload("container-action", {
    requestId: "container_open_001",
    actorId,
    containerId: "4,8,-2",
    kind: "open",
    expectedRevision: 3,
    expectedPlayerRevision: 7,
    status: "request",
  }), true);
  assert.equal(validatePayload("container-action", {
    requestId: "container_place_001",
    actorId,
    containerId: "4,8,-2",
    kind: "place",
    expectedRevision: 3,
    expectedPlayerRevision: 7,
    slots: Array.from({ length: 27 }, () => null),
    playerState: { ...sessionState(), revision: 8 },
    status: "request",
  }), true);
});

test("demand container snapshots select the requested chest beyond the old 32-entry prefix", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const chests = new Map<string, Array<null>>();
  for (let index = 0; index < 48; index += 1) chests.set(`boat:container-${index}`, Array.from({ length: 27 }, () => null));
  Object.assign(engine, {
    chests,
    multiplayerContainerRevisions: new Map([["boat:container-47", 9]]),
    world: { getBlock: () => BlockId.Air },
  });
  const snapshots = (engine as unknown as { networkContainerSnapshots(ids: readonly string[]): Array<{ id: string; revision: number }> })
    .networkContainerSnapshots(["boat:container-47"]);
  assert.deepEqual(snapshots.map(({ id, revision }) => ({ id, revision })), [{ id: "boat:container-47", revision: 9 }]);
});

test("connected conservatory inventories use the same demand-synced shared container image", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const id = "exhibit:4,8,-2";
  const slots = [{ item: Item.CaptureOrb, count: 1, metadata: { specimen: "butterfly" } }];
  Object.assign(engine, { chests: new Map([[id, slots]]), furnaces: new Map(), multiplayerContainerRevisions: new Map([[id, 3]]) });
  const snapshots = (engine as unknown as { networkContainerSnapshots(ids: string[]): Array<{ id: string; revision: number; slots: unknown[] }> }).networkContainerSnapshots([id]);
  assert.equal(snapshots[0]?.id, id);
  assert.equal(snapshots[0]?.revision, 3);
  assert.equal(snapshots[0]?.slots.length, 1);
});

test("send-zero leaves player and container signatures dirty for retry", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const current = sessionState();
  const containerId = "4,8,-2";
  Object.assign(engine, {
    multiplayer: {
      role: "guest",
      identity: { id: current.playerId },
      sendPlayerState: () => 0,
      sendContainerAction: () => 0,
    },
    multiplayerReceivedSnapshot: true,
    multiplayerPlayerStateRevision: current.revision,
    multiplayerPlayerStateSignature: "stale-player-image",
    multiplayerContainerSignatures: new Map([[containerId, "stale-container-image"]]),
    multiplayerContainerRevisions: new Map([[containerId, 2]]),
    multiplayerContainerAwaiting: new Set<string>(),
    multiplayerPendingContainerMutations: new Set<string>(),
    activeChestKey: null,
    chests: new Map([[containerId, Array.from({ length: 27 }, () => null)]]),
    localPlayerSessionSnapshot: () => current,
  });
  (engine as unknown as { syncMultiplayerPlayerState(): void }).syncMultiplayerPlayerState();
  assert.equal(engine.multiplayerPlayerStateRevision, current.revision);
  assert.equal(engine.multiplayerPlayerStateSignature, "stale-player-image");
  engine.activeChestKey = containerId;
  (engine as unknown as { syncMultiplayerContainers(): void }).syncMultiplayerContainers();
  assert.equal(engine.multiplayerContainerSignatures.get(containerId), "stale-container-image");
  assert.equal(engine.multiplayerPendingContainerMutations.has(containerId), false);
});

test("host rejects a chest transaction when either player or container revision is stale", () => {
  const current = sessionState();
  const containerId = "4,8,-2";
  const replies: Array<{ status?: string; reason?: string }> = [];
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  Object.assign(engine, {
    multiplayer: {
      role: "host",
      identity: { id: "player_host_authority_001" },
      sendContainerAction: (action: { status?: string; reason?: string }) => { replies.push(action); return 1; },
      sendPlayerState: () => 1,
      getPeer: () => ({ identity: { id: current.playerId } }),
    },
    chests: new Map([[containerId, Array.from({ length: 27 }, () => null)]]),
    multiplayerContainerRevisions: new Map([[containerId, 2]]),
    multiplayerContainerSignatures: new Map(),
    multiplayerPeerActiveContainers: new Map([[current.playerId, containerId]]),
    multiplayerPeerContainerSignatures: new Map(),
    multiplayerPlayerStates: new Map([[current.playerId, current]]),
    pendingReliableRequests: new Map(),
    ensureHostPlayerSession: () => current,
    saveSoon: () => undefined,
    emitHud: () => undefined,
  });
  const movedPlayer = { ...current, revision: 8, inventory: current.inventory.map((slot, index) => index === 0 ? null : slot) };
  const chestSlots = Array.from({ length: 27 }, (_, index) => index === 0 ? current.inventory[0] : null);
  const base = {
    requestId: "container_atomic_001",
    actorId: current.playerId,
    containerId,
    kind: "place" as const,
    expectedRevision: 2,
    slots: chestSlots,
    playerState: movedPlayer,
    status: "request" as const,
  };
  (engine as unknown as { handleRemoteContainerAction(action: typeof base & { expectedPlayerRevision: number }, peer: { identity: { id: string } }): void })
    .handleRemoteContainerAction({ ...base, expectedPlayerRevision: 6 }, { identity: { id: current.playerId } });
  assert.equal(replies.at(-1)?.status, "rejected");
  assert.match(replies.at(-1)?.reason ?? "", /pack changed/iu);
  assert.equal(engine.chests.get(containerId)?.[0], null);
});

function creatureAuthorityEngine(current: PlayerSessionSnapshot) {
  const creatureActions: CreatureAction[] = [];
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  Object.assign(engine, {
    multiplayer: {
      role: "host",
      identity: { id: "player_host_authority_001" },
      sendCreatureAction: (action: CreatureAction) => { creatureActions.push(action); return 1; },
      sendMobSnapshot: () => 1,
      sendPlayerState: () => 1,
      getPeer: () => ({ identity: { id: current.playerId } }),
    },
    multiplayerState: { error: "" },
    multiplayerTick: 20,
    multiplayerPlayerStates: new Map([[current.playerId, current]]),
    pendingReliableRequests: new Map(),
    mode: "survival",
    day: 1,
    worldTime: 0.5,
    mobs: [],
    networkMobSnapshot: () => [],
    saveSoon: () => undefined,
  });
  return { engine, creatureActions };
}

test("guest companion feeding mutates the host inventory and creature state", () => {
  const current = sessionState();
  const { engine, creatureActions } = creatureAuthorityEngine(current);
  const petState = { ...createPeelopState(42), tamed: true, ownerId: current.playerId, health: 3, hunger: 8 };
  const group = new THREE.Group();
  group.position.set(1, 2, 3);
  const mob = {
    id: 22,
    kind: "peelop",
    name: "Nana",
    definition: MOB_DEFS.peelop,
    group,
    health: 3,
    maxHealth: 7,
    petState,
  };
  engine.mobs = [mob] as never;
  (engine as unknown as { resolveHostCreatureInteraction(action: CreatureAction, peer: { id: string }, pose: Record<string, number>, state: PlayerSessionSnapshot): void })
    .resolveHostCreatureInteraction({
      requestId: "creature_feed_host_001", actorId: current.playerId, tick: 20, kind: "interact", targetId: 22, status: "request",
    }, { id: current.playerId }, { x: 1, y: 2, z: 3 }, current);
  const committed = engine.multiplayerPlayerStates.get(current.playerId)!;
  assert.equal(committed.inventory[0], null, "the apple is consumed only in the host-owned pack");
  assert.ok((mob.petState?.health ?? 0) > 3);
  assert.equal(creatureActions.at(-1)?.status, "accepted");
});

test("guest mounting is approved by the host and returned as an authoritative result", () => {
  const current = { ...sessionState(), inventory: Array.from({ length: 36 }, () => null) as PlayerSessionSnapshot["inventory"] };
  const { engine, creatureActions } = creatureAuthorityEngine(current);
  const group = new THREE.Group();
  group.position.set(1, 2, 3);
  const mob = {
    id: 33,
    kind: "reedstrider",
    name: "Wakefin",
    definition: MOB_DEFS.reedstrider,
    group,
    health: 12,
    maxHealth: 12,
    reedstriderBond: { ...createReedstriderBond(), tamed: true, ownerId: current.playerId, saddled: true },
  };
  engine.mobs = [mob] as never;
  (engine as unknown as { resolveHostCreatureInteraction(action: CreatureAction, peer: { id: string }, pose: Record<string, number>, state: PlayerSessionSnapshot): void })
    .resolveHostCreatureInteraction({
      requestId: "creature_mount_host_001", actorId: current.playerId, tick: 20, kind: "interact", targetId: 33, status: "request",
    }, { id: current.playerId }, { x: 1, y: 2, z: 3 }, current);
  assert.equal(creatureActions.at(-1)?.mounted, true);
  assert.equal(creatureActions.at(-1)?.status, "accepted");
});

test("hosting rendezvous remains visible before the first WebRTC peer assigns a session role", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  Object.assign(engine, {
    multiplayer: { state: "idle", role: null, getPeers: () => [] },
    hostRendezvous: { code: "GROVE-7429" },
    multiplayerState: {
      supported: true,
      reasons: [],
      status: "hosting",
      role: "host",
      peers: [],
      inviteCode: "",
      answerCode: "",
      roomCode: "GROVE-7429",
      rendezvousStatus: "waiting-for-guest",
      error: "",
    },
  });
  const state = engine.getMultiplayerState();
  assert.equal(state.status, "hosting");
  assert.equal(state.role, "host");
});

test("multiplayer weather snapshots preserve the full storm state", () => {
  const weatherState = {
    kind: "thunder",
    cycle: 7,
    elapsedSeconds: 12,
    durationSeconds: 180,
    intensity: 0.82,
    windAngle: 1.2,
    windSpeed: 6.5,
  } as const;
  assert.equal(validatePayload("time-weather", { tick: 99, worldTime: 0.42, day: 8, weather: "rain", weatherState }), true);
  assert.equal(validatePayload("time-weather", { tick: 99, worldTime: 0.42, day: 8, weather: "rain", weatherState: { ...weatherState, intensity: 2 } }), false);
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

test("guest tree-fall and mob-death presentation timers advance without owning simulation", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const calls: Array<["tree" | "mob", number]> = [];
  Object.assign(engine, {
    multiplayer: { role: "guest" },
    multiplayerReceivedSnapshot: true,
    updateFallingTrees: (dt: number) => calls.push(["tree", dt]),
    updateMobRemains: (dt: number) => calls.push(["mob", dt]),
  });

  engine.updateTransientDestructionPresentation(0.05);

  assert.deepEqual(calls, [["tree", 0.05], ["mob", 0.05]]);
});

test("host-authoritative guest placement consumes exactly one matching held block", () => {
  const current = sessionState();
  current.inventory[0] = { item: BlockId.CraftingTable, count: 2 };
  const result = consumeMultiplayerPlacementItem(current, BlockId.CraftingTable, [
    { x: 4, y: 8, z: -2, type: BlockId.CraftingTable },
  ]);
  assert.equal(result.valid, true);
  assert.equal(result.consumed, true);
  assert.deepEqual(result.state.inventory[0], { item: BlockId.CraftingTable, count: 1 });
  assert.equal(result.state.revision, current.revision + 1);

  const spoofed = consumeMultiplayerPlacementItem(current, BlockId.CraftingTable, [
    { x: 4, y: 8, z: -2, type: BlockId.GoldBlock },
  ]);
  assert.equal(spoofed.valid, false, "a held crafting table cannot authorize a different placed block");
  assert.equal(spoofed.state.revision, current.revision);
});

test("a second guest chest edit queues while the first revision is in flight", () => {
  const containerId = "4,8,-2";
  const slots = Array.from({ length: 27 }, () => null) as Array<null | { item: number; count: number }>;
  const submittedSignature = JSON.stringify(slots);
  slots[0] = { item: Item.Apple, count: 1 };
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  Object.assign(engine, {
    multiplayer: { role: "guest", identity: { id: "player_stable_guest_001" } },
    activeChestKey: containerId,
    chests: new Map([[containerId, slots]]),
    multiplayerContainerAwaiting: new Set<string>(),
    multiplayerPendingContainerMutations: new Set([containerId]),
    multiplayerQueuedContainerMutations: new Set<string>(),
    multiplayerContainerSignatures: new Map([[containerId, submittedSignature]]),
  });
  (engine as unknown as { syncMultiplayerContainers(): void }).syncMultiplayerContainers();
  assert.equal(engine.multiplayerQueuedContainerMutations.has(containerId), true);
});

function tradingEngine() {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const merchant = createMerchant("trade-world", "merchant_test", "hobbits", "farmer", 2_000);
  Object.assign(engine, {
    activeMerchantId: merchant.id,
    merchants: new Map([[merchant.id, merchant]]),
    goldWallet: createGoldWallet("trade-world", "player_test", 10_000),
    inventory: Array.from({ length: 36 }, () => null),
    skillState: createSkillState(),
    factionRelations: { alignments: { hobbits: 0 } },
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
