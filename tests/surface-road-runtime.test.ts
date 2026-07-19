import assert from "node:assert/strict";
import test from "node:test";
import { normalizeRoadEventState, planRoadEvent, planTerrainFollowingRoad } from "../app/game/surface-roads";

test("road anchors plan one deterministic bounded event state", () => {
  const first = planRoadEvent("road-seed", "surface-road:a<->b:64", 12, 5);
  const second = planRoadEvent("road-seed", "surface-road:a<->b:64", 99, 5);
  assert.equal(first.kind, second.kind, "calendar time must not reroll an authored anchor");
  assert.equal(first.status, first.kind === "quiet" ? "quiet" : "triggered");
  assert.equal(first.schema, 1);
});

test("road event migration rejects malformed records and preserves resolution", () => {
  assert.equal(normalizeRoadEventState({ kind: "invalid" }, "anchor"), null);
  const state = normalizeRoadEventState({ kind: "repair", status: "resolved", triggeredDay: 8, revision: 3 }, "anchor");
  assert.deepEqual(state, { schema: 1, anchorId: "anchor", kind: "repair", status: "resolved", triggeredDay: 8, revision: 3 });
});

test("an unreachable road fails closed instead of cutting through protected parcels", () => {
  const road = planTerrainFollowingRoad(
    { id: "west", x: -12, z: 0 },
    { id: "east", x: 12, z: 0 },
    (x, z) => ({ height: 40, waterline: 32, water: false, forbidden: x >= -2 && x <= 2 && Math.abs(z) <= 256 }),
  );
  assert.deepEqual(road, []);
});
