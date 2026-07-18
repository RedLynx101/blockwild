import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { VoxelEngine } from "../app/game/engine";
import { validatePayload, type MobSnapshotEntry } from "../app/game/multiplayer";
import { migrateCreatureProgression, type CreatureProgressionV2 } from "../app/game/creature-progression";

const phenotype = Object.freeze({ sizeScale: 1.07, hueShift: -.08, markingMask: 11, markingIntensity: .74, accentVariant: 4 });

test("rare appearance envelopes validate strictly", () => {
  const entry: MobSnapshotEntry = {
    id: 31, kind: "petalfox", x: 12, y: 45, z: -9, yaw: .2, health: 8, state: "wander", level: 24,
    specimenId: "prime:petalfox:0:-1:specimen", primeAnchorId: "prime:petalfox:0:-1",
    appearanceRevision: "rare-test-v1",
    appearance: { progressionSeed: 12345, shiny: true, rarityForm: "prime", phenotype: { ...phenotype } },
  };
  assert.equal(validatePayload("mob-snapshot", { tick: 2, mobs: [entry] }), true);
  assert.equal(validatePayload("mob-snapshot", { tick: 2, mobs: [{ ...entry, primeAnchorId: "copied:prime" }] }), false);
  assert.equal(validatePayload("mob-snapshot", { tick: 2, mobs: [{ ...entry, appearance: { ...entry.appearance!, phenotype: { ...phenotype, markingMask: 99 } } }] }), false);
  assert.equal(validatePayload("mob-snapshot", { tick: 2, mobs: [{ ...entry, specimenId: "x".repeat(161) }] }), false);
});

test("a guest reconstructs the host-authored Prime and shiny identity on its first frame", () => {
  const entry: MobSnapshotEntry = {
    id: 31, kind: "petalfox", x: 12, y: 45, z: -9, yaw: .2, health: 8, state: "wander", level: 24,
    specimenId: "prime:petalfox:0:-1:specimen", primeAnchorId: "prime:petalfox:0:-1",
    appearanceRevision: "rare-test-v1",
    appearance: { progressionSeed: 12345, shiny: true, rarityForm: "prime", phenotype: { ...phenotype } },
  };
  let received: Record<string, unknown> | null = null;
  const mobs: Array<Record<string, any>> = [];
  const guest = Object.create(VoxelEngine.prototype) as VoxelEngine;
  Object.assign(guest, {
    mobs, nextMobId: 1, pendingNetworkMobDeaths: new Set(), leadAnchors: new Map(), leadLines: new Map(), worldTime: 0,
    spawnMob: (kind: string, position: THREE.Vector3, options: Record<string, unknown>) => {
      received = options;
      const progression = migrateCreatureProgression({
        kind: kind as "petalfox", entityId: String(options.specimenId), maximumLevel: 50, defaultMoveIds: [],
        legacy: options.progression as CreatureProgressionV2,
      });
      const mob: Record<string, any> = {
        id: Number(options.id), specimenId: options.specimenId, kind, group: new THREE.Group(), visual: new THREE.Group(),
        health: 1, state: "wander", progression, resolvedTypes: { types: [], sources: [], revisionKey: "" },
        combatStatuses: [], activeMove: null, name: "Petalfox", attunedOrbId: null, creatureOwnerId: null,
        creatureTamed: false, creatureEquipment: {}, dragonState: null, shadeState: null, reedstriderBond: null,
        courserBond: null, leviathanGrowth: null, aetherbellMorph: null, careState: null, petState: null, apiaryBee: null,
        factionId: null, aligned: false,
      };
      mob.group.position.copy(position);
      mobs.push(mob);
      return mob;
    },
    removeMob: () => undefined,
    applyMobScale: () => undefined,
    mobBaseScale: () => 1,
    removeLead: () => undefined,
    ensureLeadLine: () => undefined,
  });

  (guest as unknown as { applyNetworkMobSnapshot(entries: MobSnapshotEntry[]): void }).applyNetworkMobSnapshot([entry]);
  assert.ok(received);
  const capturedOptions = received as unknown as Record<string, unknown>;
  assert.equal(capturedOptions.id, entry.id);
  assert.equal(capturedOptions.specimenId, entry.specimenId);
  assert.equal(capturedOptions.primeAnchorId, entry.primeAnchorId);
  const progression = capturedOptions.progression as Partial<CreatureProgressionV2>;
  assert.equal(progression.shiny, true);
  assert.equal(progression.rarityForm, "prime");
  assert.deepEqual(progression.phenotype, phenotype);
  assert.equal(mobs[0].group.userData.networkAppearanceRevision, entry.appearanceRevision);
});
