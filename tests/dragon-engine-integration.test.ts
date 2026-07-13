import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BlockId, Item } from "../app/game/data.ts";
import { disposeDragonAttackEffect } from "../app/game/dragon-effects.ts";
import { createDragonState, normalizeDragonState, serializeDragonState, type DragonState } from "../app/game/dragons.ts";
import { VoxelEngine, placedDragonEggMetadata } from "../app/game/engine.ts";
import {
  MAGIC_ATTUNEMENT_QUEST_ID,
  attuneMagicFromQuest,
  createSpellKeyState,
  createMagicState,
  learnSpellFromTome,
  pressSpellKey,
  selectSpell,
} from "../app/game/magic.ts";
import { createSkillState } from "../app/game/skills.ts";
import { validatePayload, type MobSnapshotEntry } from "../app/game/multiplayer.ts";
import { MOB_ORDER } from "../app/game/mobs.ts";
import { createQuestBook } from "../app/game/quests.ts";
import { createGoldWallet, createMerchant } from "../app/game/economy.ts";

function castingEngine(tomeItemId: string, spellId: Parameters<typeof selectSpell>[1]) {
  let magic = learnSpellFromTome(createMagicState(), tomeItemId, 1).state;
  magic = attuneMagicFromQuest(magic, [MAGIC_ATTUNEMENT_QUEST_ID], 2).state;
  magic = selectSpell(magic, spellId);
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  Object.assign(engine, {
    magicState: magic,
    skillState: createSkillState(),
    camera: new THREE.PerspectiveCamera(),
    position: new THREE.Vector3(0, 12, 0),
    velocity: new THREE.Vector3(),
    scene: new THREE.Scene(),
    dragonEffects: [],
    nextDragonEffectId: 1,
    mobs: [],
    potionBuffs: {},
    health: 4,
    heldUse: 0,
    world: { getBlock: () => BlockId.Air },
    audio: { playSpell: () => undefined },
    events: { onToast: () => undefined },
    saveSoon: () => undefined,
    emitHud: () => undefined,
    collidesAt: () => false,
    worldSimulationSeconds: () => 100,
  });
  engine.camera.position.set(0, 13.6, 0);
  engine.camera.lookAt(0, 13.6, -1);
  return engine;
}

test("live engine casting spends mana, awards Magic XP, and creates a player-owned visible effect", () => {
  const engine = castingEngine("tome-flame-jet", "flame-jet");
  const beforeMana = engine.magicState.mana;
  assert.equal(engine.castSelectedMagicSpell(), true);
  assert.ok(engine.magicState.mana < beforeMana);
  assert.ok(engine.skillState.skills.magic.xp > 0);
  assert.equal(engine.dragonEffects.length, 1);
  assert.equal(engine.dragonEffects[0].ownerMobId, -1, "spell projectiles must use the player collision branch");
  assert.match(engine.dragonEffects[0].visual.name, /fire-dragon-breath/u);
  assert.ok((engine.magicState.cooldownReadyAt["flame-jet"] ?? 0) > 100, "persisted cooldown uses the stable world clock");
  for (const effect of engine.dragonEffects) disposeDragonAttackEffect(effect);
});

test("placed and portable egg metadata accepts every canonical dragon lineage", () => {
  for (const type of ["fire", "ice", "steel", "sea", "gold", "silver"] as const) {
    const egg = {
      schemaVersion: 1 as const,
      eggId: `${type}:engine-metadata`,
      type,
      sex: "female" as const,
      geneticSeed: 9,
      parentIds: [null, null] as const,
      laidAtTick: 4,
      incubationTicks: 0,
      requiredTicks: 7_200,
      wild: true,
      lairId: null,
    };
    assert.equal(placedDragonEggMetadata({ kind: "placed-dragon-egg", egg })?.type, type);
    assert.equal(placedDragonEggMetadata({ kind: "dragon-egg", egg }, false)?.type, type);
  }
});

test("opening the held-Q wheel preserves its key state through the overlay pause", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const keyState = pressSpellKey(createSpellKeyState(), 1_000).state;
  const originalDocument = globalThis.document;
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { pointerLockElement: null, exitPointerLock: () => undefined },
  });
  try {
    Object.assign(engine, {
      multiplayer: null,
      paused: false,
      gameplayOverlayOpen: false,
      spellKeyState: keyState,
      spellWheelOpen: true,
      keys: new Set<string>(["KeyQ"]),
      sprintLatched: false,
      mineHeld: false,
      clearInput: () => {
        engine.keys.clear();
        engine.sprintLatched = false;
        engine.spellKeyState = createSpellKeyState();
        engine.spellWheelOpen = false;
      },
    });
    engine.pause(true);
    assert.deepEqual(engine.spellKeyState, keyState);
    assert.equal(engine.spellWheelOpen, true);
    assert.equal(engine.gameplayOverlayOpen, true);
  } finally {
    if (originalDocument === undefined) Reflect.deleteProperty(globalThis, "document");
    else Object.defineProperty(globalThis, "document", { configurable: true, value: originalDocument });
  }
});

test("dragon armor, collision, and provocation remain mechanically active", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const state = normalizeDragonState({
    ...createDragonState("steel", { dragonId: "steel:armor:test", ageDays: 90 }),
    equipment: {
      saddle: true,
      chests: [false, false],
      armor: { head: "plate", neck: "plate", body: "plate", tail: "plate" },
    },
  });
  const mob = {
    dragonState: state,
    dragonScaldSeconds: 0,
    definition: { radius: 1.2, height: 2.4, movement: "flying" },
    petState: null,
    careState: null,
    leviathanGrowth: null,
  };
  assert.equal(engine.dragonDamageAfterArmor(mob as never, 100), 68);
  const collision = engine.mobCollisionProfile(mob as never);
  assert.equal(collision.solid, true);
  assert.ok(collision.radius >= 0.48);
});

test("curated Dragonwake studies accept globally and advance through real capture and scale-delivery events", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const bestiary = Object.fromEntries(MOB_ORDER.map((kind) => [kind, {
    seen: false, kills: 0, captures: kind === "mistmane" ? 1 : 0, tames: 0, breeds: 0, secretUnlocked: false,
  }]));
  Object.assign(engine, {
    questBook: createQuestBook(),
    sideQuestDefinitions: [],
    bestiary,
    activeSentient: {
      residentId: "scholar",
      profession: "alchemist",
      factionId: "goblins",
      health: 10,
      group: new THREE.Group(),
    },
    position: new THREE.Vector3(),
    inventory: Array.from({ length: 36 }, (_, index) => index === 0 ? { item: Item.FireDragonScale, count: 1 } : null),
    selected: 0,
    goldWallet: createGoldWallet("quest-test", "player", 0),
    merchants: new Map([["scholar", createMerchant("quest-test", "scholar", "goblins", "alchemist", 500)]]),
    activeMerchantId: "scholar",
    events: { onToast: () => undefined },
    audio: { play: () => undefined },
    saveSoon: () => undefined,
    emitHud: () => undefined,
  });
  assert.equal(engine.acceptQuestById("dragonwake-living-archive", null), true);
  assert.equal(engine.questBook.active.find((quest) => quest.questId === "dragonwake-living-archive")?.objectiveProgress["capture-rare-creatures"], 1);
  assert.equal(engine.acceptQuestById("dragonwake-scale-scholar", null), true);
  assert.equal(engine.tradeWithActiveMerchant("sell", Item.FireDragonScale, 1), true);
  const scholar = engine.questBook.active.find((quest) => quest.questId === "dragonwake-scale-scholar");
  assert.equal(scholar?.objectiveProgress["deliver-dragon-scale"], 1);
  assert.equal(scholar?.status, "ready");
});

test("restoration casting applies its authoritative effect without creating a damaging projectile", () => {
  const engine = castingEngine("tome-healing-light", "healing-light");
  assert.equal(engine.castSelectedMagicSpell(), true);
  assert.equal(engine.health, 10);
  assert.equal(engine.dragonEffects.length, 0);
});

test("multiplayer snapshots carry exact dragon lifecycle state through protocol validation", () => {
  const dragonState = normalizeDragonState({
    ...createDragonState("ice", { dragonId: "ice:test:hatchling", ageDays: 3, health: 31, sex: "female", tamed: true, ownerId: "local" }),
    command: "stay",
    onShoulder: true,
    scaleReserve: 2,
  });
  const group = new THREE.Group();
  group.position.set(12, 34, -9);
  group.rotation.y = 0.75;
  const host = Object.create(VoxelEngine.prototype) as VoxelEngine;
  Object.assign(host, {
    mobs: [{ id: 42, kind: "ice-dragon", group, health: dragonState.health, state: "wander", dragonState, factionId: null, aligned: false }],
    mobBaseScale: () => dragonState.growthScale,
  });
  const snapshot = (host as unknown as { networkMobSnapshot(): MobSnapshotEntry[] }).networkMobSnapshot();

  assert.equal(snapshot.length, 1);
  assert.deepEqual(snapshot[0].dragonState, serializeDragonState(dragonState));
  assert.equal(snapshot[0].baby, true);
  assert.equal(snapshot[0].tamed, true);
  assert.equal(validatePayload("mob-snapshot", { tick: 1, mobs: snapshot }), true);
  assert.equal(validatePayload("mob-snapshot", {
    tick: 1,
    mobs: [{ ...snapshot[0], kind: "fire-dragon" }],
  }), false, "a dragon payload cannot claim a kind that disagrees with its full state");
});

test("guest dragon reconstruction uses host state instead of creating a random adult", () => {
  type FakeNetworkMob = {
    id: number;
    kind: string;
    group: THREE.Group;
    health: number;
    state: string;
    dragonState: DragonState;
    factionId: null;
    aligned: boolean;
    shadeState: null;
    reedstriderBond: null;
    courserBond: null;
    leviathanGrowth: null;
    aetherbellMorph: null;
    careState: null;
  };
  const hatchling = normalizeDragonState({
    ...createDragonState("ice", { dragonId: "ice:network:hatchling", ageDays: 2, health: 30, sex: "male", tamed: true, ownerId: "local" }),
    command: "follow",
    onShoulder: true,
    scaleReserve: 1,
  });
  const entry: MobSnapshotEntry = {
    id: 73,
    kind: "ice-dragon",
    x: 5,
    y: 18,
    z: -7,
    yaw: 0.4,
    health: hatchling.health,
    state: "wander",
    scale: hatchling.growthScale,
    tamed: true,
    saddled: false,
    baby: true,
    dragonState: serializeDragonState(hatchling),
    factionId: null,
    aligned: false,
  };
  const spawned: FakeNetworkMob[] = [];
  const guest = Object.create(VoxelEngine.prototype) as VoxelEngine;
  Object.assign(guest, {
    mobs: spawned,
    nextMobId: 1,
    spawnMob: (kind: string, position: THREE.Vector3, options: { dragonState?: DragonState | null }) => {
      const mob: FakeNetworkMob = {
        id: 1,
        kind,
        group: new THREE.Group(),
        health: 1,
        state: "wander",
        dragonState: normalizeDragonState(options.dragonState ?? createDragonState("ice", { ageDays: 100 })),
        factionId: null,
        aligned: false,
        shadeState: null,
        reedstriderBond: null,
        courserBond: null,
        leviathanGrowth: null,
        aetherbellMorph: null,
        careState: null,
      };
      mob.group.position.copy(position);
      spawned.push(mob);
      return mob;
    },
    removeMob: () => undefined,
    applyDragonState: (mob: FakeNetworkMob, state: DragonState) => {
      const normalized = normalizeDragonState(state);
      mob.dragonState = normalized;
      mob.health = normalized.health;
      return normalized;
    },
    applyMobScale: () => undefined,
    mobBaseScale: (mob: FakeNetworkMob) => mob.dragonState.growthScale,
  });

  (guest as unknown as { applyNetworkMobSnapshot(entries: MobSnapshotEntry[]): void }).applyNetworkMobSnapshot([entry]);
  assert.equal(spawned.length, 1);
  assert.deepEqual(spawned[0].dragonState, hatchling);
  assert.equal(spawned[0].dragonState.stage, 1, "the guest must not synthesize the previous random adult fallback");
  assert.equal(spawned[0].dragonState.onShoulder, true);

  const armoredAdult = normalizeDragonState({
    ...createDragonState("ice", { dragonId: hatchling.dragonId, ageDays: 88, health: 300, sex: "male", tamed: true, ownerId: "local" }),
    equipment: {
      saddle: true,
      chests: [true, true],
      armor: { head: "rime-head", neck: "rime-neck", body: "rime-body", tail: "rime-tail" },
    },
    scaleReserve: 11,
  });
  (guest as unknown as { applyNetworkMobSnapshot(entries: MobSnapshotEntry[]): void }).applyNetworkMobSnapshot([{
    ...entry,
    health: armoredAdult.health,
    scale: armoredAdult.growthScale,
    baby: false,
    saddled: true,
    dragonState: serializeDragonState(armoredAdult),
  }]);
  assert.deepEqual(spawned[0].dragonState, armoredAdult);
  assert.deepEqual(spawned[0].dragonState.equipment.chests, [true, true]);
  assert.equal(spawned[0].dragonState.scaleReserve, 11);
});
