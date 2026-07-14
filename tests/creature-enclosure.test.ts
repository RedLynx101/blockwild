import assert from "node:assert/strict";
import test from "node:test";

import { craftedFenceEncloses, scanCraftedFenceEnclosure } from "../app/game/creature-enclosure.ts";

const key = (x: number, z: number) => `${x},${z}`;

function rectangularFence(radius: number) {
  const barriers = new Set<string>();
  for (let offset = -radius; offset <= radius; offset += 1) {
    barriers.add(key(offset, -radius));
    barriers.add(key(offset, radius));
    barriers.add(key(-radius, offset));
    barriers.add(key(radius, offset));
  }
  return barriers;
}

test("crafted fence flood fill protects natural animals with or without a closed gate", () => {
  const barriers = rectangularFence(4);
  assert.equal(craftedFenceEncloses({ x: 0, z: 0 }, (x, z) => barriers.has(key(x, z))), true);
  barriers.delete(key(0, -4));
  assert.equal(craftedFenceEncloses({ x: 0, z: 0 }, (x, z) => barriers.has(key(x, z))), false, "an open gate is a real escape");
  barriers.add(key(0, -4));
  assert.equal(craftedFenceEncloses({ x: 2, z: 1 }, (x, z) => barriers.has(key(x, z))), true, "a closed gate behaves as part of the fence loop");
});

test("ordinary terrain walls never become a crafted enclosure", () => {
  const terrainWalls = rectangularFence(3);
  const scan = scanCraftedFenceEnclosure({ x: 0, z: 0 }, () => false, { maxRadius: 8 });
  assert.equal(scan.enclosed, false);
  assert.ok(scan.interior.length > terrainWalls.size, "the detector ignores non-fence terrain supplied outside its barrier predicate");
});

test("enclosure scans stay bounded and expose their interior for shared caching", () => {
  const barriers = rectangularFence(7);
  const scan = scanCraftedFenceEnclosure({ x: 0, z: 0 }, (x, z) => barriers.has(key(x, z)), { maxVisited: 512 });
  assert.equal(scan.enclosed, true);
  assert.equal(new Set(scan.interior.map((cell) => key(cell.x, cell.z))).size, scan.interior.length);
  assert.ok(scan.interior.length < 512);
});
