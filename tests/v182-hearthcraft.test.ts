import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Item } from "../app/game/data";
import { captureIntoOrb, captureOrbInventorySlot, createEmptyCaptureOrb } from "../app/game/capture-orbs";
import type { CreatureMetadata } from "../app/game/creature-cage";
import {
  APIARY_WORKER_GROWTH_SECONDS,
  createApiary,
  extractApiaryBee,
  setApiaryQueenOrb,
  stepApiary,
} from "../app/game/apiary";
import {
  addOrbMorphResource,
  cancelOrbMorph,
  createOrbMorphLoom,
  setOrbMorphInput,
  startOrbMorph,
  stepOrbMorph,
} from "../app/game/orb-morphing";
import { isSpellTomeItem, normalizeTomeDisplay, tomeDisplayPalette, tomeDisplayPaletteForSchool } from "../app/game/dragon-world";

const workerMetadata = (): CreatureMetadata => ({
  schema: 1,
  entityId: "worker-marigold",
  kind: "honeybee",
  health: 2,
  maxHealth: 2,
  ageTicks: 24_000,
  baby: false,
  temperament: "Gentle",
  hostile: false,
  tamed: true,
  ownerId: "keeper-a",
  name: "Marigold",
  geneticSeed: 818,
  command: "follow",
  custom: {
    apiaryBee: {
      id: "worker-marigold", role: "worker", alive: true, home: false, outbound: false,
      carryingNectar: 0, lastReturnDay: 4, disconnectedDay: null, geneticSeed: 818,
      angry: false, tamed: true, ownerId: "keeper-a",
    },
  },
});

test("the Chrysalis Loom cancels safely and crowns a queen without changing orb identity", () => {
  const orb = captureIntoOrb(createEmptyCaptureOrb("orb-marigold"), workerMetadata(), 100)!;
  let state = setOrbMorphInput(createOrbMorphLoom(), captureOrbInventorySlot(orb))!;
  state = addOrbMorphResource(state, Item.RoyalJelly, 1).state;
  state = addOrbMorphResource(state, Item.CrystalShard, 1).state;

  let started = startOrbMorph(state, 120);
  assert.equal(started.started, true);
  const partial = stepOrbMorph(started.state, 20).state;
  const cancelled = cancelOrbMorph(partial);
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelled.state.inputOrb?.orbId, "orb-marigold");
  assert.equal(cancelled.state.royalJelly, 1);
  assert.equal(cancelled.state.starCrystals, 1);

  started = startOrbMorph(cancelled.state, 200);
  const completed = stepOrbMorph(started.state, 42);
  assert.equal(completed.completed, true);
  assert.equal(completed.state.inputOrb, null);
  assert.equal(completed.state.outputOrb?.orbId, "orb-marigold");
  assert.equal(completed.state.outputOrb?.creature?.kind, "hive-queen");
  assert.equal(completed.state.outputOrb?.creature?.name, "Marigold");
  assert.equal(completed.state.outputOrb?.creature?.ownerId, "keeper-a");
  assert.equal(completed.state.outputOrb?.creature?.tamed, true);
  assert.equal(completed.state.royalJelly, 0);
  assert.equal(completed.state.starCrystals, 0);
});

test("a queen bootstraps workers over time and removing her preserves the dormant colony", () => {
  const queenOrb = captureOrbInventorySlot(captureIntoOrb(createEmptyCaptureOrb("orb-queen"), {
    ...workerMetadata(), entityId: "queen-marigold", kind: "hive-queen", name: "Queen Marigold",
  }, 500)!);
  let state = setApiaryQueenOrb(createApiary("queen-marigold", [], 7, 3), queenOrb);
  const grown = stepApiary(state, {
    phase: "day",
    nearbyFlowers: 6,
    attached: true,
    deltaSeconds: APIARY_WORKER_GROWTH_SECONDS + 1,
    worldDay: 3,
  });
  assert.equal(grown.events.includes("worker-created"), true);
  assert.equal(grown.state.workers.filter((worker) => worker.alive).length, 1);
  state = grown.state;
  const extracted = extractApiaryBee(state, state.queen.id, "keeper-a");
  assert.equal(extracted.reason, "ok");
  assert.equal(extracted.state.queen, null);
  assert.equal(extracted.state.workers.length, 1);
  assert.equal(extracted.state.nectar, state.nectar);
});

test("tome displays accept only spell tomes and expose school-specific, future-safe palettes", () => {
  assert.equal(isSpellTomeItem(Item.TomeFlameJet), true);
  assert.equal(normalizeTomeDisplay({ schema: 1, tome: Item.BoundBook }).tome, null);
  assert.equal(tomeDisplayPalette(Item.TomeFlameJet).school, "destruction");
  assert.equal(tomeDisplayPalette(Item.TomeHealingLight).school, "restoration");
  assert.notEqual(tomeDisplayPalette(Item.TomeFlameJet).cover, tomeDisplayPalette(Item.TomeHealingLight).cover);
  assert.equal(tomeDisplayPalette(Item.BoundBook).school, "unknown");
  assert.match(tomeDisplayPalette(Item.BoundBook).cover, /^#[0-9a-f]{6}$/iu);
  assert.deepEqual(tomeDisplayPaletteForSchool("a-school-added-later"), tomeDisplayPaletteForSchool("unknown"));
});

test("fireplaces use dynamic torch-derived flames and active furnaces feed both lighting paths", () => {
  const engine = readFileSync(new URL("../app/game/engine.ts", import.meta.url), "utf8");
  const world = readFileSync(new URL("../app/game/world.ts", import.meta.url), "utf8");
  assert.match(engine, /createFireplaceFlameVisual/u);
  assert.match(engine, /torchAnimationSample\(time, position, true\)/u);
  assert.match(engine, /furnace\.burn <= 0/u);
  assert.match(engine, /setMachineLight/u);
  assert.match(world, /voxelMachineLightPosition/u);
  assert.match(world, /shape === "fireplace"[\s\S]*firebox/u);
});
