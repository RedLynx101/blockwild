import assert from "node:assert/strict";
import test from "node:test";
import type { Object3D } from "three";
import {
  DRAGON_SCHEMA_VERSION,
  DRAGON_TYPES,
  DRAGON_VARIANTS,
  createDragonEgg,
  createDragonState,
  dragonVariantForSeed,
  normalizeDragonState,
  serializeDragonState,
} from "../app/game/dragons.ts";
import {
  DRAGON_VARIANT_SILHOUETTES,
  applyDragonLifeStage,
  applyDragonVariant,
  createMobVisual,
} from "../app/game/mob-models.ts";

test("all six dragon species expose four reviewed, non-palette adult variants", () => {
  assert.equal(DRAGON_TYPES.length, 6);
  assert.equal(Object.keys(DRAGON_VARIANT_SILHOUETTES).length, 24);
  for (const type of DRAGON_TYPES) {
    assert.equal(DRAGON_VARIANTS[type].length, 4);
    assert.equal(new Set(DRAGON_VARIANTS[type]).size, 4);
    const seeded = new Set(Array.from({ length: 512 }, (_, seed) => dragonVariantForSeed(type, seed)));
    assert.deepEqual(seeded, new Set(DRAGON_VARIANTS[type]), `${type} variants must all occur through stable genetics`);
    const silhouettes = DRAGON_VARIANTS[type].map((variant) => JSON.stringify(DRAGON_VARIANT_SILHOUETTES[variant]));
    assert.equal(new Set(silhouettes).size, 4, `${type} alternatives must alter body plan, not only color`);
  }
});

test("dragon variants persist through state, eggs, serialization, and legacy migration", () => {
  for (const type of DRAGON_TYPES) for (const variant of DRAGON_VARIANTS[type]) {
    const state = createDragonState(type, { dragonId: `${type}:${variant}`, geneticSeed: 77, variant, ageDays: 125 });
    assert.equal(state.variant, variant);
    assert.equal(serializeDragonState(state).variant, variant);
    assert.equal(normalizeDragonState(JSON.parse(JSON.stringify(state))).variant, variant);
    const egg = createDragonEgg(type, { eggId: `${type}:${variant}:egg`, geneticSeed: 91, variant });
    assert.equal(egg.schemaVersion, DRAGON_SCHEMA_VERSION);
    assert.equal(egg.variant, variant);
  }
  const migrated = normalizeDragonState({ schemaVersion: 1, type: "sea", geneticSeed: 93, dragonId: "legacy-sea", ageTicks: 0, health: 34 });
  assert.ok(DRAGON_VARIANTS.sea.includes(migrated.variant));
  assert.equal(migrated.schemaVersion, DRAGON_SCHEMA_VERSION);
});

test("runtime dragon rigs switch exactly one detailed adult form while young stages stay shared", () => {
  for (const type of DRAGON_TYPES) {
    const kind = `${type}-dragon` as const;
    const model = createMobVisual(kind, 418);
    const adult = model.group.getObjectByName(`${kind}-adult-form`);
    assert.ok(adult, `${type} adult form root missing`);
    assert.equal(adult.children.length, 4);
    assert.equal(new Set(adult.children.map((form) => form.userData.variantMotif)).size >= 3, true);
    for (const variant of DRAGON_VARIANTS[type]) {
      assert.equal(applyDragonLifeStage(model.group, 5), true);
      assert.equal(applyDragonVariant(model.group, variant), true);
      const visible: Object3D[] = adult.children.filter((form: Object3D) => form.visible);
      assert.equal(visible.length, 1);
      assert.equal(visible[0].userData.dragonVariant, variant);
      let signatureParts = 0;
      visible[0].traverse((object: Object3D) => { if (object.name.includes(`${variant}-signature-`)) signatureParts += 1; });
      assert.ok(signatureParts >= 5, `${variant} needs authored silhouette geometry`);
    }
    assert.equal(applyDragonLifeStage(model.group, 1), true);
    assert.equal(adult.visible, false);
    assert.equal(model.group.getObjectByName(`${kind}-stage-1-form`)?.visible, true);
    assert.equal(applyDragonLifeStage(model.group, 2), true);
    assert.equal(model.group.getObjectByName(`${kind}-stage-2-form`)?.visible, true);
  }
});
