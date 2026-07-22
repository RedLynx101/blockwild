import assert from "node:assert/strict";
import { test } from "node:test";
import { advanceAgentAlongPath, findAgentVoxelPath } from "../app/game/agent-navigation";

const blocked = new Set<string>();
const door = new Set<string>();
const query = {
  isLoaded: () => true,
  isPassable: (x: number, y: number, z: number) => y > 0 && !blocked.has(`${x},${y},${z}`),
  hasSupport: (_x: number, y: number) => y === 1,
  isLiquid: () => false,
  isDoorOrGate: (x: number, y: number, z: number) => door.has(`${x},${y},${z}`),
};

test("bounded agent voxel path routes around walls and labels doors", () => {
  blocked.clear(); door.clear();
  blocked.add("1,1,0"); blocked.add("1,2,0");
  door.add("2,1,1");
  const path = findAgentVoxelPath(query, { x: 0.5, y: 1, z: 0.5 }, { x: 3, y: 1, z: 0 });
  assert.equal(path.ok, true);
  assert.ok(path.cells.some((cell) => cell.z !== 0));
});

test("navigation refuses unloaded and unbounded goals with typed failures", () => {
  assert.equal(findAgentVoxelPath({ ...query, isLoaded: () => false }, { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }).code, "path_unloaded");
  assert.equal(findAgentVoxelPath(query, { x: 0, y: 1, z: 0 }, { x: 200, y: 1, z: 0 }).code, "path_too_far");
});

test("frame-independent path steering reaches without overshoot", () => {
  const step = advanceAgentAlongPath({ x: 0.5, y: 1, z: 0.5 }, { x: 1, y: 1, z: 0, transition: "walk" }, 4, 1);
  assert.equal(step.reached, true);
  assert.deepEqual(step.position, { x: 1.5, y: 0.51, z: 0.5 });
});
