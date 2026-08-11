import assert from "node:assert/strict";
import test from "node:test";
import { compareRenderRgba } from "../app/game/render-image-diff.ts";
import {
  createCanonicalRenderSceneFixture,
  renderSceneFixtureHash,
  renderSceneTransferList,
  validateRenderSceneFixture,
  type RenderSceneFixtureV1,
} from "../app/game/render-scene-fixture.ts";

test("canonical render fixture pins camera, environment, material, animation, and mesh data", () => {
  const fixture = createCanonicalRenderSceneFixture();
  assert.equal(validateRenderSceneFixture(fixture), fixture);
  assert.equal(fixture.animationTimeMs, 1_250);
  assert.equal(fixture.materials[0]?.layer, "opaque");
  assert.match(renderSceneFixtureHash(fixture), /^[a-f0-9]{32}$/);
  assert.equal(renderSceneFixtureHash(fixture), renderSceneFixtureHash({
    ...fixture,
    materials: [...fixture.materials].reverse(),
    meshes: [...fixture.meshes].reverse(),
  }));
});

test("render fixture rejects duplicate IDs, missing materials, malformed streams, and non-finite inputs", () => {
  const fixture = createCanonicalRenderSceneFixture();
  assert.throws(() => validateRenderSceneFixture({
    ...fixture,
    materials: [fixture.materials[0]!, fixture.materials[0]!],
  }), /duplicate id/);
  assert.throws(() => validateRenderSceneFixture({
    ...fixture,
    meshes: [{ ...fixture.meshes[0]!, materialId: "missing" }],
  }), /missing material/);
  assert.throws(() => validateRenderSceneFixture({
    ...fixture,
    meshes: [{ ...fixture.meshes[0]!, colors: new Uint8Array(3) }],
  }), /colors length/);
  assert.throws(() => validateRenderSceneFixture({
    ...fixture,
    camera: { ...fixture.camera, position: [Number.NaN, 0, 0] },
  } as RenderSceneFixtureV1), /must be finite/);
});

test("render fixture transfer list is exact and deduplicates shared buffers", () => {
  const fixture = createCanonicalRenderSceneFixture();
  const buffers = renderSceneTransferList(fixture);
  assert.equal(buffers.length, 6);
  assert.deepEqual(new Set(buffers), new Set([
    fixture.meshes[0]!.transform.buffer,
    fixture.meshes[0]!.positions.buffer,
    fixture.meshes[0]!.normals.buffer,
    fixture.meshes[0]!.colors.buffer,
    fixture.meshes[0]!.uvs.buffer,
    fixture.meshes[0]!.indices.buffer,
  ]));
});

test("strict image diff reports exact parity and visible mismatches without mutating inputs", () => {
  const expected = new Uint8Array([
    10, 20, 30, 255,
    40, 50, 60, 255,
  ]);
  const actual = Uint8Array.from(expected);
  assert.equal(compareRenderRgba(actual, expected, 2, 1).passed, true);
  actual[4] = 80;
  const compared = compareRenderRgba(actual, expected, 2, 1, {
    maximumChannelDelta: 2,
    maximumMeanChannelDelta: 8,
    maximumChangedPixelRatio: .5,
  });
  assert.equal(compared.passed, false, "the explicit maximum-channel veto must remain strict");
  assert.equal(compared.changedPixels, 1);
  assert.equal(compared.changedPixelRatio, .5);
  assert.deepEqual([...expected], [10, 20, 30, 255, 40, 50, 60, 255]);
  assert.deepEqual([...compared.diffRgba.slice(4, 8)], [255, 56, 56, 255]);
});

test("image diff mask excludes deliberately non-deterministic pixels", () => {
  const expected = new Uint8Array([0, 0, 0, 255, 0, 0, 0, 255]);
  const actual = new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255]);
  const compared = compareRenderRgba(actual, expected, 2, 1, undefined, new Uint8Array([0, 1]));
  assert.equal(compared.passed, true);
  assert.equal(compared.comparedPixels, 1);
  assert.equal(compared.ignoredPixels, 1);
});
