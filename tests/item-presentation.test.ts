import assert from "node:assert/strict";
import test from "node:test";
import { BlockId, ITEMS, Item } from "../app/game/data.ts";
import { createAvatarHeldItemModel } from "../app/game/held-items.ts";
import { fallbackInventoryIconKind, itemPresentationFamily } from "../app/game/item-presentation.ts";
import { itemIconKind } from "../app/game/VoxelGame.tsx";

test("all catalog items resolve authored inventory, held, and dropped presentations", () => {
  assert.equal(Object.keys(ITEMS).length, 537, "the audit must expand with the canonical catalog");
  for (const definition of Object.values(ITEMS)) {
    const icon = itemIconKind(definition.id);
    const family = itemPresentationFamily(definition.id);
    assert.ok(!["item", "block", "crafted-component"].includes(icon), `${definition.name} still has a generic inventory icon`);
    assert.notEqual(family, "crafted-component", `${definition.name} still has an unresolved model family`);
    const model = createAvatarHeldItemModel(definition.id);
    assert.ok(model, `${definition.name} needs a held/drop model`);
    let meshCount = 0;
    model.traverse((object) => { if (object.type === "Mesh") meshCount += 1; });
    assert.ok(meshCount > 0, `${definition.name} needs visible geometry`);
    assert.equal(model.userData.itemPresentationFamily, family);
  }
});
test("former generic inventory entries use legible semantic silhouettes", () => {
  assert.equal(fallbackInventoryIconKind(BlockId.Stone), "voxel-block");
  assert.equal(itemIconKind(Item.String), "thread");
  assert.equal(itemIconKind(Item.RawCopper), "ore-chunk");
  assert.equal(itemIconKind(Item.CopperIngot), "ingot");
  assert.equal(itemIconKind(Item.Rope), "rope");
  assert.equal(itemIconKind(Item.IronFilings), "filings");
});

test("solid block items use atlas-ready voxel geometry instead of colored fallback bricks", () => {
  for (const item of [BlockId.Stone, BlockId.Grass, Item.GildedDragonstoneItem, Item.NacreTideworkItem]) {
    const model = createAvatarHeldItemModel(item)!;
    assert.ok(model.getObjectByName(`presentation-voxel-block-${ITEMS[item].placeBlock ?? ITEMS[item].worldTextureBlock}`));
  }
});
