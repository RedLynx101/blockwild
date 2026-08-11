import assert from "node:assert/strict";
import test from "node:test";
import {
  ChunkWorld,
  cloneRendererTerrainGeometryForTransferR11,
  RendererTerrainPageStoreR11,
  RendererTerrainRevisionClockR11,
} from "../app/game/world.ts";
import type { TerrainSectionGeometry } from "../app/game/terrain-buffer-pipeline.ts";

test("combined pages replace only their matching section layer", () => {
  const clock = new RendererTerrainRevisionClockR11();
  const store = new RendererTerrainPageStoreR11("0,0", 0, 0, clock);
  store.installSection(0, "opaque", triangle(1));
  store.installSection(0, "water", triangle(2));
  const sectionOpaque = store.sectionPage(0, "opaque");
  store.installCombined("opaque", triangle(3));
  assert.deepEqual(store.pages().map((page) => [page.source, page.layer]), [["combined", "opaque"], ["section", "water"]]);
  assert.deepEqual(store.sectionPages("opaque").map((page) => page.source), ["section"], "consolidation keeps renderer-neutral section ownership");
  store.removeCombined("opaque");
  assert.equal(store.pages().find((page) => page.layer === "opaque"), sectionOpaque);
});

test("edits refresh immutable page data and revisions survive unload cleanup", () => {
  const clock = new RendererTerrainRevisionClockR11();
  const store = new RendererTerrainPageStoreR11("4,-2", 4, -2, clock);
  const source = triangle(5);
  store.installSection(2, "cutout", source);
  const first = store.sectionPage(2, "cutout")!;
  source.positions[0] = 91;
  assert.equal(first.geometry.positions[0], 5, "the registry owns a copy of mesh-production buffers");
  store.installSection(2, "cutout", triangle(7));
  const edited = store.sectionPage(2, "cutout")!;
  assert.ok(edited.revision > first.revision);
  assert.equal(edited.geometry.positions[0], 7);
  assert.deepEqual(edited.translation, [4 * 16, 0, -2 * 16]);
  assert.equal(store.clear(), true);
  assert.equal(store.pages().length, 0);
  store.installSection(2, "cutout", triangle(9));
  assert.ok(store.sectionPage(2, "cutout")!.revision > edited.revision, "reload cannot reuse a stale page revision");
});

test("worker transfers detach only a clone, never the registry-owned page", () => {
  const clock = new RendererTerrainRevisionClockR11();
  const store = new RendererTerrainPageStoreR11("0,0", 0, 0, clock);
  store.installSection(0, "opaque", triangle(4));
  const owned = store.sectionPage(0, "opaque")!.geometry;
  const transfer = cloneRendererTerrainGeometryForTransferR11(owned);
  const buffers = Object.values(transfer).map((array) => array.buffer as ArrayBuffer);
  structuredClone(transfer, { transfer: buffers });
  assert.equal(transfer.positions.byteLength, 0, "the worker-bound clone was transferred");
  assert.equal(owned.positions.length, 9, "registry ownership remains intact");
  assert.equal(owned.positions[0], 4);
});

test("snapshot budgets pages and bytes without consulting Three or voxel state", () => {
  const clock = new RendererTerrainRevisionClockR11();
  const near = new RendererTerrainPageStoreR11("0,0", 0, 0, clock);
  const far = new RendererTerrainPageStoreR11("5,0", 5, 0, clock);
  near.installSection(0, "opaque", triangle(1));
  near.installSection(0, "water", triangle(2));
  far.installSection(0, "opaque", triangle(3));
  const fakeWorld = {
    rendererTerrainClock: clock,
    rendererTerrainAtlas: { revision: 1, width: 1, height: 1, rgba8: new Uint8Array([255, 255, 255, 255]) },
    chunks: new Map([
      ["5,0", { key: "5,0", cx: 5, cz: 0, presentationVisible: true, rendererTerrain: far }],
      ["0,0", { key: "0,0", cx: 0, cz: 0, presentationVisible: true, rendererTerrain: near }],
      ["1,0", { key: "1,0", cx: 1, cz: 0, presentationVisible: false, rendererTerrain: far }],
    ]),
  };
  const snapshot = ChunkWorld.prototype.rendererTerrainSnapshotR11.call(fakeWorld as never, 0, 0, {
    maxChunks: 1, maxPages: 1, maxBytes: 1_024,
  });
  assert.equal(snapshot.selectedChunks, 1);
  assert.equal(snapshot.availablePages, 2);
  assert.equal(snapshot.pages.length, 1);
  assert.match(snapshot.pages[0].key, /^0,0:/u);
  assert.equal(snapshot.truncated, true);
  const byteBounded = ChunkWorld.prototype.rendererTerrainSnapshotR11.call(fakeWorld as never, 0, 0, {
    maxChunks: 1, maxPages: 1, maxBytes: 1,
  });
  assert.equal(byteBounded.pages.length, 0);
  assert.equal(byteBounded.truncated, true);
});

function triangle(offset: number): TerrainSectionGeometry {
  return {
    positions: new Float32Array([offset, 0, 0, offset + 1, 0, 0, offset, 1, 0]),
    normals: new Int8Array([0, 0, 127, 0, 0, 127, 0, 0, 127]),
    colors: new Uint8Array(9).fill(255), lights: new Uint8Array(12).fill(255),
    emissions: new Uint8Array(3), occlusions: new Uint8Array(3),
    uvs: new Uint16Array(6), indices: new Uint16Array([0, 1, 2]),
  };
}
