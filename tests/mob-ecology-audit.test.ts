import assert from "node:assert/strict";
import test from "node:test";

import { Item } from "../app/game/data.ts";
import { wildlifeTailCadence } from "../app/game/mob-models.ts";
import { MOB_DEFS, MOB_ORDER } from "../app/game/mobs.ts";
import { buildMobEcologyAudit } from "../scripts/audit-mob-ecology.ts";

test("mob audit reports sound, drop, and natural biome counts for the entire catalog", () => {
  const rows = buildMobEcologyAudit();
  assert.equal(rows.length, MOB_ORDER.length);
  const cloverback = rows.find((row) => row.kind === "meadow-cow")!;
  assert.ok(cloverback.soundEventCount > 0);
  assert.ok(cloverback.dropEntryCount >= 2);
  assert.ok(cloverback.biomeCount > 0);
  const authoredMerchant = rows.find((row) => row.kind === "dwarf-provisioner")!;
  assert.equal(authoredMerchant.biomeCount, 0);
});

test("overworld food animals have sensible improved meat and hide yields", () => {
  const hide = (kind: keyof typeof MOB_DEFS) => MOB_DEFS[kind].drops.find((drop) => drop.item === Item.Hide)!;
  const meat = (kind: keyof typeof MOB_DEFS) => MOB_DEFS[kind].drops.find((drop) => drop.item === Item.RawMeat)!;
  assert.deepEqual({ minimum: hide("meadow-cow").min, maximum: hide("meadow-cow").max, chance: hide("meadow-cow").chance }, { minimum: 2, maximum: 4, chance: 0.9 });
  assert.ok(hide("sunbloom-longhorn").chance >= 0.9 && hide("sunbloom-longhorn").max >= 4);
  for (const kind of ["thimbledeer", "frostlace-hart", "reedcrown-deer", "sunstep-grazer", "dewback-tapir"] as const) {
    assert.ok(hide(kind).chance >= 0.64, `${kind} hide chance`);
    assert.ok(meat(kind).chance >= 0.7, `${kind} meat chance`);
  }
});

test("fox and other heavy terrestrial tail rigs use restrained running cadence", () => {
  assert.ok(wildlifeTailCadence("fox", 1) <= 1.8);
  assert.ok(wildlifeTailCadence("warg", 1) <= 2.6);
  assert.ok(wildlifeTailCadence("fox", 1) < wildlifeTailCadence("rabbit", 1));
});
