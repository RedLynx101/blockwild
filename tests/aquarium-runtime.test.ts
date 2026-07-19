import assert from "node:assert/strict";
import test from "node:test";
import { orbRackOccupancySignature } from "../app/game/engine.ts";
import { captureIntoOrb, createEmptyCaptureOrb, createOrbRack } from "../app/game/capture-orbs.ts";
import type { CreatureMetadata } from "../app/game/creature-cage.ts";

const goldfish: CreatureMetadata = {
  schema: 1,
  entityId: "rack-fish",
  kind: "pocket-goldfish",
  health: 2,
  maxHealth: 2,
  ageTicks: 24_000,
  baby: false,
  temperament: "Gentle",
  hostile: false,
  tamed: false,
  ownerId: null,
  name: "Pip",
  geneticSeed: 12,
  command: null,
  custom: {},
};

test("capture-orb rack visual signature tracks only actual slot occupancy and exact orb identity", () => {
  const empty = createEmptyCaptureOrb("empty-rack-orb");
  const filled = captureIntoOrb(createEmptyCaptureOrb("filled-rack-orb"), goldfish)!;
  const blankSignature = orbRackOccupancySignature(createOrbRack());
  const occupiedSignature = orbRackOccupancySignature(createOrbRack([empty, null, filled]));
  assert.equal(blankSignature, "empty|empty|empty|empty|empty|empty|empty|empty");
  assert.match(occupiedSignature, /^orb:empty-rack-orb\|empty\|filled:pocket-goldfish:filled-rack-orb(?:\|empty){5}$/);
  assert.notEqual(blankSignature, occupiedSignature);
});
