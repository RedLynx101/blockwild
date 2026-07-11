import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { Item } from "../app/game/data.ts";
import { BUTTERFLY_FLIGHT_TUNING, butterflyCaptureAlongRay, butterflyKindForBiome } from "../app/game/butterflies.ts";
import { MOB_DEFS } from "../app/game/mobs.ts";
import { BiomeId } from "../app/game/world.ts";

test("flower biomes select distinct butterfly variants with capturable bestiary records", () => {
  assert.equal(butterflyKindForBiome(BiomeId.Bloomwood, 0.1), "bloom-monarch");
  assert.equal(butterflyKindForBiome(BiomeId.Frostpine, 0.1), "frostveil");
  assert.equal(butterflyKindForBiome(BiomeId.Siltfen, 0.1), "fen-lantern");
  assert.equal(butterflyKindForBiome(BiomeId.Badlands, 0.1), "embertip");
  assert.equal(MOB_DEFS.meadowwing.captureItem, Item.MeadowwingJar);
});

test("the net captures the nearest butterfly inside its view cone", () => {
  const origin = new THREE.Vector3(0, 2, 0);
  const direction = new THREE.Vector3(0, 0, -1);
  const id = butterflyCaptureAlongRay([
    { id: 1, kind: "meadowwing", x: 1.5, y: 2, z: -2 },
    { id: 2, kind: "azure-skippers", x: 0.08, y: 2.04, z: -3 },
    { id: 3, kind: "embertip", x: 0, y: 2, z: -5 },
  ], origin, direction, 4.2);
  assert.equal(id, 2);
});

test("wild butterflies spend substantially more time flying than perched", () => {
  assert.ok(BUTTERFLY_FLIGHT_TUNING.seekFlowerChance < 0.4);
  const averageFlight = BUTTERFLY_FLIGHT_TUNING.flightSecondsMin + BUTTERFLY_FLIGHT_TUNING.flightSecondsRange / 2;
  const averageLanding = BUTTERFLY_FLIGHT_TUNING.landedSecondsMin + BUTTERFLY_FLIGHT_TUNING.landedSecondsRange / 2;
  assert.ok(averageFlight > averageLanding * 1.75);
});
