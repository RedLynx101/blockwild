import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { captureResonanceMatched, VoxelEngine } from "../app/game/engine";
import { validatePayload, type MobSnapshotEntry } from "../app/game/multiplayer";
import { migrateCreatureProgression, type CreatureProgressionV2 } from "../app/game/creature-progression";

const phenotype = Object.freeze({ sizeScale: 1.07, hueShift: -.08, markingMask: 11, markingIntensity: .74, accentVariant: 4 });

test("capture resonance uses the same epoch-second clock as replicated combat statuses", () => {
  const statuses = [{ id: "inspired" as const, stacks: 1, expiresAtSeconds: 112.5, source: null }];
  assert.equal(captureResonanceMatched(statuses, 100), true);
  assert.equal(captureResonanceMatched(statuses, 112.5), false);
  assert.equal(captureResonanceMatched(statuses, Date.now() / 1000), false, "an old session status must not look permanent beside fractional world-day time");
});

test("rare appearance envelopes validate strictly", () => {
  const entry: MobSnapshotEntry = {
    id: 31, kind: "petalfox", x: 12, y: 45, z: -9, yaw: .2, health: 8, state: "wander", level: 24,
    specimenId: "prime:petalfox:0:-1:specimen", primeAnchorId: "prime:petalfox:0:-1",
    appearanceRevision: "rare-test-v1",
    appearance: { progressionSeed: 12345, shiny: true, rarityForm: "prime", phenotype: { ...phenotype } },
    statuses: [{ id: "inspired", stacks: 1, remainingSeconds: 12.5 }],
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
    statuses: [{ id: "inspired", stacks: 1, remainingSeconds: 12.5 }],
  };
  let received: Record<string, unknown> | null = null;
  type NetworkHarnessMob = {
    group: THREE.Group;
    combatStatuses: Array<{ expiresAtSeconds: number }>;
    [key: string]: unknown;
  };
  const mobs: NetworkHarnessMob[] = [];
  const guest = Object.create(VoxelEngine.prototype) as VoxelEngine;
  Object.assign(guest, {
    mobs, nextMobId: 1, pendingNetworkMobDeaths: new Set(), leadAnchors: new Map(), leadLines: new Map(), worldTime: 0,
    spawnMob: (kind: string, position: THREE.Vector3, options: Record<string, unknown>) => {
      received = options;
      const progression = migrateCreatureProgression({
        kind: kind as "petalfox", entityId: String(options.specimenId), maximumLevel: 50, defaultMoveIds: [],
        legacy: options.progression as CreatureProgressionV2,
      });
      const mob: NetworkHarnessMob = {
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
    worldSimulationSeconds: () => 100,
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
  assert.equal(mobs[0].combatStatuses[0].expiresAtSeconds, 112.5, "guest expiry must stay in the host's epoch-second clock domain");
});
