import path from "node:path";
import { pathToFileURL } from "node:url";
import * as THREE from "three";
import { BlockId, Item, ITEMS, type ItemCode } from "../app/game/data.ts";
import { createAvatarHeldItemModel } from "../app/game/held-items.ts";
import { createMobVisual } from "../app/game/mob-models.ts";
import { MOB_DEFS, type CoreMobKind } from "../app/game/mobs.ts";
import { BlockPlayerModel } from "../app/game/player-model.ts";
import {
  objectToInspectionSpec,
  renderModelInspection,
  renderModelPortraits,
  type InspectionModelSpec,
} from "./render-models.ts";

function disposeObject(root: THREE.Object3D) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

function capturePlayer(
  id: string,
  label: string,
  configure: (player: BlockPlayerModel) => void,
  groundAudit = true,
): InspectionModelSpec {
  const player = new BlockPlayerModel({ castShadow: false, receiveShadow: false });
  configure(player);
  const spec = objectToInspectionSpec(player.group, {
    id,
    label,
    category: "player",
    front: "-z",
    ...(groundAudit ? { groundY: 0 } : {}),
    inspection: { source: "BlockPlayerModel" },
  });
  player.dispose();
  return spec;
}

function captureHeld(item: ItemCode, id: string, label = ITEMS[item].name): InspectionModelSpec {
  const held = createAvatarHeldItemModel(item);
  if (!held) throw new Error(`No held model exists for '${label}'.`);
  const spec = objectToInspectionSpec(held, {
    id,
    label,
    category: "utility",
    front: "-z",
    inspection: { source: "model-specs" },
  });
  disposeObject(held);
  return spec;
}

function captureMob(kind: CoreMobKind, id = `polish-${kind}`, label = MOB_DEFS[kind].name, pose?: (root: THREE.Group) => void, groundAudit = true): InspectionModelSpec {
  const model = createMobVisual(kind, -901);
  pose?.(model.visual);
  const runtime = new THREE.Group();
  runtime.add(model.group);
  if (!MOB_DEFS[kind].flying && !MOB_DEFS[kind].aquatic) model.group.position.y = MOB_DEFS[kind].footOffset - 0.5;
  const spec = objectToInspectionSpec(runtime, {
    id,
    label,
    category: "mob",
    front: "-z",
    ...(groundAudit && !MOB_DEFS[kind].flying && !MOB_DEFS[kind].aquatic ? { groundY: 0 } : {}),
    inspection: { source: "MobVisual", mob: kind },
  });
  disposeObject(runtime);
  return spec;
}

export function createV12ModelPolishSpecs(): InspectionModelSpec[] {
  return [
    capturePlayer("v12-wayfarer-tool-ready", "Wayfarer - Tool Ready", (player) => {
      player.setAppearance({
        sex: "male",
        race: "wayfarer",
        colors: { skin: "#c98f6b", hair: "#4d3424", shirt: "#3f7fba", trousers: "#293554", accent: "#f0c85b" },
      });
      player.setHeldItem(createAvatarHeldItemModel(Item.IronPickaxe)).setPose({ locomotion: "idle" });
    }),
    capturePlayer("v12-wood-elf-shield", "Wood Elf - Shield Raised", (player) => {
      player.setAppearance({
        sex: "female",
        race: "wood-elf",
        colors: { skin: "#dca27f", hair: "#d7c39a", shirt: "#527d60", trousers: "#3e4934", accent: "#8cc9c1" },
      });
      player.setEquipmentAppearance({ head: "#8bd7ec", chest: "#7cc7e5", legs: "#6bb6da", feet: "#61a9ce" });
      player.setHeldItem(createAvatarHeldItemModel(Item.IronSword));
      player.setOffhandItem(createAvatarHeldItemModel(Item.SunmetalShield), true).setOffhandRaised(true).setPose({ locomotion: "idle" });
    }),
    capturePlayer("v12-dwarf-seated", "Dwarf - Seated", (player) => {
      player.setAppearance({
        sex: "female",
        race: "dwarf",
        colors: { skin: "#b87958", hair: "#17191d", shirt: "#7069a8", trousers: "#303237", accent: "#c79355" },
      });
      player.setPose({ seated: 1, locomotion: "idle" });
    }, false),
    captureMob("wood-elf-leafwarden", "v12-wood-elf-leafwarden", "Wood Elf Leafwarden"),
    captureMob("wood-elf-bow-warden", "v12-wood-elf-bow-warden", "Wood Elf Bow-Warden"),
    captureMob("taffalo", "v12-taffalo-stride", "Taffalo - Articulated Rear Feet", (visual) => {
      const rearLeft = visual.getObjectByName("taffalo-rear-left-leg-pivot");
      const rearRight = visual.getObjectByName("taffalo-rear-right-leg-pivot");
      const frontLeft = visual.getObjectByName("taffalo-front-left-leg-pivot");
      const frontRight = visual.getObjectByName("taffalo-front-right-leg-pivot");
      if (rearLeft) rearLeft.rotation.x = 0.48;
      if (rearRight) rearRight.rotation.x = -0.34;
      if (frontLeft) frontLeft.rotation.x = -0.34;
      if (frontRight) frontRight.rotation.x = 0.48;
    }, false),
    captureMob("reed-dragonfly", "v12-reed-dragonfly-flap", "Reed Dragonfly - Mirrored Flap", (visual) => {
      for (const pair of ["front", "rear"] as const) {
        const angle = pair === "front" ? 0.68 : 0.42;
        const left = visual.getObjectByName(`reed-dragonfly-left-${pair}-wing`);
        const right = visual.getObjectByName(`reed-dragonfly-right-${pair}-wing`);
        if (left) left.rotation.z = -angle;
        if (right) right.rotation.z = angle;
      }
    }),
    captureHeld(BlockId.CraftingTable, "v12-held-crafting-table", "Crafting Table - Held Miniature"),
    captureHeld(Item.FireDragonArmorModule, "v12-ember-dragon-armor"),
    captureHeld(Item.IceDragonArmorModule, "v12-rime-dragon-armor"),
    captureHeld(Item.SteelDragonArmorModule, "v12-riveted-dragon-armor"),
    captureHeld(Item.TideglassDragonArmorModule, "v12-tideglass-dragon-armor"),
  ];
}

async function main() {
  const out = path.resolve(process.argv[2] ?? "output/v1-2-model-polish-final");
  const specs = createV12ModelPolishSpecs();
  const inspection = await renderModelInspection({ out, columns: 4, views: ["iso", "front", "side"], specs });
  const portraits = await renderModelPortraits({ out: path.join(out, "portraits"), columns: 4, specs, png: true });
  process.stdout.write(`${JSON.stringify({ status: "rendered", manifest: inspection.manifestPath, sheets: inspection.files, portraits: portraits.files }, null, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) await main();
