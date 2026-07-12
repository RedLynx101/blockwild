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
  normalizeMultiplayerPlayerState,
  restoreRendererContext,
} from "../app/game/engine.ts";
import { createSkillState } from "../app/game/skills.ts";
import { MOB_DEFS } from "../app/game/mobs.ts";
import { createPeelopState } from "../app/game/peelop.ts";
import { createReedstriderBond } from "../app/game/ecology.ts";
import { createPeerIdentity, validatePayload, validatePeerIdentity, type CreatureAction, type PlayerSessionSnapshot } from "../app/game/multiplayer.ts";

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
