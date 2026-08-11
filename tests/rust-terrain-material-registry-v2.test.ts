import assert from "node:assert/strict";
import test from "node:test";
import { BLOCKS, BlockId } from "../app/game/data.ts";
import { encodeTerrainMaterialRegistryWireV2 } from "../app/game/rust-terrain-mesh-codec.ts";
import {
  canonicalTerrainMaterialRegistryV1,
  createCanonicalTerrainMaterialRegistryV2,
} from "../app/game/terrain-material-registry.ts";

test("BWR2 generates a self-describing entry for every current block definition", () => {
  const registry = createCanonicalTerrainMaterialRegistryV2();
  const currentIds = Object.keys(BLOCKS).map(Number).sort((left, right) => left - right);
  assert.equal(currentIds.length, 313);
  assert.equal(registry.blocks.filter(Boolean).length, currentIds.length);
  assert.equal(registry.blocks[BlockId.Air]?.kind, "air");
  for (const id of currentIds) assert.ok(registry.blocks[id], `block ${id} is missing from BWR2`);
  assert.notEqual(registry.contentHash, canonicalTerrainMaterialRegistryV1().contentHash);

  const water = registry.blocks[BlockId.Water];
  assert.ok(water?.kind === "material");
  if (water?.kind === "material") assert.deepEqual([water.layer, water.liquidKind], [4, 1]);
  const glass = registry.blocks[BlockId.Glass];
  assert.ok(glass?.kind === "material");
  if (glass?.kind === "material") assert.equal(glass.layer, 6);
  const leaf = registry.blocks[BlockId.WildwoodLeaves];
  assert.ok(leaf?.kind === "material" && leaf.selectiveInteriorFaces);
  const furnace = registry.blocks[BlockId.Furnace];
  assert.ok(furnace?.kind === "material" && furnace.shapeVariant === 1);
  const wroughtDoor = registry.blocks[BlockId.WroughtIronDoorXOpenUpper];
  assert.ok(wroughtDoor?.kind === "material" && wroughtDoor.shapeVariant === 35);
  const archive = registry.blocks[BlockId.ArchiveShelfSix];
  assert.ok(archive?.kind === "material" && archive.shapeVariant === 56);
});

test("BWR2 wire encoding is deterministic, bounded, and rejects future geometry revisions", () => {
  const registry = createCanonicalTerrainMaterialRegistryV2();
  const first = encodeTerrainMaterialRegistryWireV2(registry);
  const second = encodeTerrainMaterialRegistryWireV2(createCanonicalTerrainMaterialRegistryV2());
  assert.equal(new TextDecoder().decode(first.subarray(0, 4)), "BWR2");
  assert.deepEqual(first, second);
  assert.ok(first.byteLength < 64 * 1024 * 1024);

  const blocks = [...registry.blocks];
  const material = blocks[BlockId.Grass];
  assert.ok(material?.kind === "material");
  if (material?.kind !== "material") return;
  blocks[BlockId.Grass] = { ...material, geometryRevision: 2 as 1 };
  assert.throws(() => encodeTerrainMaterialRegistryWireV2({ ...registry, blocks }), /geometry metadata/);
});
