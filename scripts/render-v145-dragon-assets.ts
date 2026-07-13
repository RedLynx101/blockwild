import path from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { Item, ITEMS, type ItemCode } from "../app/game/data.ts";
import { createAvatarHeldItemModel } from "../app/game/held-items.ts";
import { objectToInspectionSpec, renderModelInspection, type InspectionModelSpec } from "./render-models.ts";

function material(color: number) {
  return new THREE.MeshLambertMaterial({ color });
}

function box(parent: THREE.Group, name: string, size: [number, number, number], position: [number, number, number], color: number) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material(color));
  mesh.name = name;
  mesh.position.set(...position);
  parent.add(mesh);
  return mesh;
}

function legacyGoldPile() {
  const root = new THREE.Group();
  root.name = "legacy-gold-pile";
  box(root, "legacy-ore-slab-low", [0.86, 0.17, 0.76], [0, -0.2, 0], 0xcda934);
  box(root, "legacy-ore-slab-mid", [0.6, 0.16, 0.6], [-0.01, -0.035, 0.01], 0xcda934);
  box(root, "legacy-ore-slab-high", [0.39, 0.15, 0.34], [0.015, 0.12, 0.01], 0xcda934);
  return root;
}

function legacyItemBrick(id: string, color: number) {
  const root = new THREE.Group();
  root.name = id;
  box(root, `${id}-brick`, [0.28, 0.38, 0.2], [0, 0.1, 0], color).rotation.set(0.12, 0.15, -0.06);
  return root;
}

function legacyBarding() {
  const root = new THREE.Group();
  root.name = "legacy-generic-barding";
  box(root, "legacy-breastplate", [0.45, 0.34, 0.18], [0, 0.08, 0], 0xd65c32);
  box(root, "legacy-crest", [0.16, 0.12, 0.2], [0, 0.31, -0.01], 0xef9879).rotation.z = Math.PI / 4;
  box(root, "legacy-left-flank", [0.18, 0.3, 0.25], [-0.27, 0.04, 0.04], 0x662b20);
  box(root, "legacy-right-flank", [0.18, 0.3, 0.25], [0.27, 0.04, 0.04], 0x662b20);
  return root;
}

function dispose(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    for (const entry of Array.isArray(object.material) ? object.material : [object.material]) entry.dispose();
  });
}

function specFromRoot(root: THREE.Group, id: string, label: string): InspectionModelSpec {
  root.updateMatrixWorld(true);
  const spec = objectToInspectionSpec(root, {
    id,
    label,
    category: "utility",
    front: "-z",
    inspection: { source: "model-specs" },
  });
  dispose(root);
  return spec;
}

function productionSpec(item: ItemCode, id: string, label = ITEMS[item].name) {
  const root = createAvatarHeldItemModel(item);
  if (!root) throw new Error(`No production held model for ${label}.`);
  return specFromRoot(root, id, label);
}

/** Honest old/new asset sheet: the legacy side is reconstructed from the
 * exact generic silhouettes replaced by this pass, while the right side is
 * converted from the live shared held/drop production models. */
export function createV145DragonAssetAuditSpecs(): InspectionModelSpec[] {
  return [
    specFromRoot(legacyGoldPile(), "v145-before-gold-pile", "BEFORE · Three Ore Slabs"),
    productionSpec(Item.GoldPileItem, "v145-after-gold-pile", "AFTER · Coin, Ingot & Gem Hoard"),
    specFromRoot(legacyItemBrick("legacy-pannier", 0x966438), "v145-before-pannier", "BEFORE · Generic Pannier Brick"),
    productionSpec(Item.DragonChestModule, "v145-after-pannier", "AFTER · Dragon Pannier"),
    specFromRoot(legacyItemBrick("legacy-saddle", 0x8b4f38), "v145-before-saddle", "BEFORE · Generic Saddle Bundle"),
    productionSpec(Item.DragonSaddle, "v145-after-saddle", "AFTER · Dragonflight Saddle"),
    specFromRoot(legacyBarding(), "v145-before-barding", "BEFORE · Shared Barding Shape"),
    productionSpec(Item.FireDragonArmorModule, "v145-after-fire-barding", "AFTER · Ember Flame-Lamellar"),
    productionSpec(Item.IceDragonArmorModule, "v145-after-ice-barding", "Rime · Glacier Harness"),
    productionSpec(Item.SteelDragonArmorModule, "v145-after-steel-barding", "Steel · Riveted Pressure Plate"),
    productionSpec(Item.TideglassDragonArmorModule, "v145-after-sea-barding", "Sea · Tideglass Carapace"),
    productionSpec(Item.GoldDragonArmorModule, "v145-after-gold-barding", "Gold · Solar Regalia"),
    productionSpec(Item.SilverDragonArmorModule, "v145-after-silver-barding", "Silver · Moonmirror Weave"),
    productionSpec(Item.GoldBlockItem, "v145-after-gold-block", "Gold · Sealed Hoard Block"),
  ];
}

async function main() {
  const out = path.resolve(process.argv[2] ?? "output/v1-4-5-dragon-assets");
  const specs = createV145DragonAssetAuditSpecs();
  const rendered = await renderModelInspection({ out, columns: 4, views: ["iso", "front"], specs });
  process.stdout.write(`${JSON.stringify({ status: "rendered", manifest: rendered.manifestPath, files: rendered.files }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
