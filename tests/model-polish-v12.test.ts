import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import * as THREE from "three";
import { CHARACTER_RACES } from "../app/game/character-profiles.ts";
import { BlockId, Item, ITEMS } from "../app/game/data.ts";
import { createAvatarHeldItemModel } from "../app/game/held-items.ts";
import { createMobVisual } from "../app/game/mob-models.ts";
import { BlockPlayerModel, type PlayerVariant } from "../app/game/player-model.ts";
import { objectToInspectionSpec, renderModelInspection } from "../scripts/render-models.ts";

function namedCount(root: THREE.Object3D, name: string) {
  let count = 0;
  root.traverse((object) => { if (object.name === name) count += 1; });
  return count;
}

test("every race and sex uses one articulated limb rig with clothing on the torso", () => {
  for (const race of CHARACTER_RACES) for (const variant of ["male", "female"] as const satisfies readonly PlayerVariant[]) {
    const player = new BlockPlayerModel({ race, variant });
    for (const name of ["left-sleeve", "left-hand", "right-sleeve", "right-hand", "torso-block"]) {
      assert.equal(namedCount(player.group, name), 1, `${race}/${variant} duplicated ${name}`);
    }
    const torso = player.group.getObjectByName("torso-block") as THREE.Mesh;
    assert.equal(torso.material, player.materials.shirt, `${race}/${variant} torso must not render as a second pink arm mass`);
    assert.ok(torso.scale.x >= 0.47 && torso.scale.x <= 0.63, `${race}/${variant} torso width ${torso.scale.x} is outside the authored silhouette`);
    assert.equal(player.parts.leftArm.parent, player.parts.torso);
    assert.equal(player.parts.rightArm.parent, player.parts.torso);
    player.setPose({ seated: 1 });
    assert.ok(Math.abs(player.getLocalBounds().min.y) < 1e-7, `${race}/${variant} seated rig must stay on its authored foot plane`);
    player.dispose();
  }
});

test("player tools, shields and seated legs use one shared forward-facing articulated pose", () => {
  const player = new BlockPlayerModel({ race: "wood-elf", variant: "female" });
  const pickaxe = createAvatarHeldItemModel(Item.IronPickaxe)!;
  const shield = createAvatarHeldItemModel(Item.IronShield)!;
  player.setHeldItem(pickaxe).setOffhandItem(shield, true).setPose({ locomotion: "idle", seated: 0 });
  assert.equal(pickaxe.parent, player.rightHandSocket);
  assert.equal(shield.parent, player.leftHandSocket);
  assert.ok(player.parts.rightArm.rotation.x > 1.15 && player.parts.rightArm.rotation.x < 1.42, "tool hand aims approximately ninety degrees forward");
  assert.ok(Math.abs(pickaxe.rotation.x + Math.PI / 2) < 0.08, "tool geometry lies forward from the hand rather than down the forearm");
  player.setOffhandRaised(true).setPose({ locomotion: "idle" });
  assert.ok(player.parts.leftArm.rotation.x >= 1.45, "raised shield brings the left forearm in front of the torso");
  player.setPose({ seated: 1 });
  assert.ok(player.parts.leftLeg.rotation.x > 1.1 && player.parts.rightLeg.rotation.x > 1.1, "seated legs lift onto the chair plane");
  player.dispose();
});

test("wood elf player and resident models have visibly staged pointed features", () => {
  const player = new BlockPlayerModel({ race: "wood-elf" });
  for (const side of ["left", "right"] as const) {
    assert.ok(player.group.getObjectByName(`wood-elf-features-${side}-ear-base`));
    assert.ok(player.group.getObjectByName(`wood-elf-features-${side}-ear-tip`));
  }
  assert.ok(player.group.getObjectByName("wood-elf-features-pointed-nose"));
  player.dispose();

  const resident = createMobVisual("wood-elf-leafwarden", -301).visual;
  for (const side of ["left", "right"] as const) {
    const base = resident.getObjectByName(`wood-elf-leafwarden-${side}-pointed-ear-base`)!;
    const tip = resident.getObjectByName(`wood-elf-leafwarden-${side}-pointed-ear-tip`)!;
    assert.equal(tip.parent, base.parent);
    assert.ok(Math.abs(tip.rotation.z) > Math.abs(base.rotation.z), "ear tip must sharpen away from its base");
  }
  assert.ok(resident.getObjectByName("wood-elf-leafwarden-pointed-nose"));
  const staff = resident.getObjectByName("wood-elf-leafwarden-moonbough-staff") as THREE.Mesh;
  assert.ok((staff.geometry as THREE.BoxGeometry).parameters.depth > 1.5, "warden staff reads as a forward weapon");
});

test("dragonfly wings resolve to mirrored final rotations for both wing pairs", () => {
  const visual = createMobVisual("reed-dragonfly", -302);
  const clockMs = 1_337;
  for (const wing of visual.parts.wings) {
    wing.rotation.z = Number(wing.userData.side) * (0.35 + Math.sin(clockMs * 0.018 + Number(wing.userData.phase)) * 0.72);
  }
  for (const pair of ["front", "rear"] as const) {
    const left = visual.visual.getObjectByName(`reed-dragonfly-left-${pair}-wing`)!;
    const right = visual.visual.getObjectByName(`reed-dragonfly-right-${pair}-wing`)!;
    assert.ok(Math.abs(left.rotation.z + right.rotation.z) < 1e-10, `${pair} wings must oppose one another`);
    assert.notEqual(left.rotation.z, right.rotation.z);
  }
});

test("Taffalo rear ankle fluff is articulated by its actual rear legs", () => {
  const taffalo = createMobVisual("taffalo", -303).visual;
  const leg = taffalo.getObjectByName("taffalo-rear-left-leg-pivot")!;
  const ankle = taffalo.getObjectByName("taffalo-left-marshmallow-ankle")!;
  assert.equal(ankle.parent, leg);
  taffalo.updateMatrixWorld(true);
  const before = ankle.getWorldPosition(new THREE.Vector3());
  leg.rotation.x = 0.66;
  taffalo.updateMatrixWorld(true);
  const after = ankle.getWorldPosition(new THREE.Vector3());
  assert.ok(before.distanceTo(after) > 0.25, "rear fluff must travel with the stepping leg instead of floating behind it");
});

test("crafting table and all six dragon barding modules have semantic hand-scale models", () => {
  const table = createAvatarHeldItemModel(BlockId.CraftingTable)!;
  assert.ok(table.getObjectByName("crafting-table-side-panel"));
  assert.ok(table.getObjectByName("crafting-table-worktop"));
  assert.equal(table.children.filter((child) => child.name.startsWith("crafting-table-leg-")).length, 4);
  table.updateMatrixWorld(true);
  const tableSize = new THREE.Box3().setFromObject(table).getSize(new THREE.Vector3());
  assert.ok(Math.max(tableSize.x, tableSize.y, tableSize.z) < 0.55, "held worktable stays hand-scale");

  const modules = [
    [Item.FireDragonArmorModule, "fire-barding-living-flame-crest"],
    [Item.IceDragonArmorModule, "ice-barding-faceted-breastplate"],
    [Item.SteelDragonArmorModule, "steel-barding-pressure-dial"],
    [Item.TideglassDragonArmorModule, "sea-barding-lumen-pearl"],
    [Item.GoldDragonArmorModule, "gold-barding-sun-disc"],
    [Item.SilverDragonArmorModule, "silver-barding-crescent-1"],
  ] as const;
  const palette = new Set<number>();
  for (const [item, signature] of modules) {
    const model = createAvatarHeldItemModel(item)!;
    assert.ok(model.getObjectByName(signature));
    assert.ok(model.getObjectByName(`${ITEMS[item].dragonType}-barding-harness`));
    assert.ok(model.children.length >= 8, `${item} requires a readable layered barding silhouette`);
    const breast = model.getObjectByName(`${ITEMS[item].dragonType}-barding-harness`) as THREE.Mesh<THREE.BoxGeometry, THREE.MeshLambertMaterial>;
    palette.add(breast.material.color.getHex());
  }
  assert.equal(palette.size, 6, "every dragon barding family keeps a distinct production palette");
});

test("model audit sheets clip 3D drawing to the tile body without clipping titles", async () => {
  const held = createAvatarHeldItemModel(BlockId.CraftingTable)!;
  const spec = objectToInspectionSpec(held, {
    id: "clip-audit-crafting-table",
    label: "Crafting Table - Held Miniature",
    category: "utility",
    front: "-z",
    inspection: { source: "model-specs" },
  });
  const directory = await mkdtemp(path.join(tmpdir(), "blockwild-model-polish-"));
  try {
    await renderModelInspection({ out: directory, columns: 1, views: ["side"], specs: [spec] });
    const svg = await readFile(path.join(directory, "blockwild-models-side.svg"), "utf8");
    assert.match(svg, /<clipPath id="model-clip-clip-audit-crafting-table-side-0-104">/u);
    assert.match(svg, /clip-path="url\(#model-clip-clip-audit-crafting-table-side-0-104\)"/u);
    assert.match(svg, /<text x="25" y="140"[^>]*>Crafting Table - Held Miniature<\/text>/u);
    assert.match(svg, /<text x="28" y="(?:36|42)"[^>]*>BLOCKWILD MODEL (?:INSPECTOR|ORIENTATION)<\/text>/u);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
