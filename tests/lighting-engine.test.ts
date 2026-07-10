import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BlockId } from "../app/game/data.ts";
import { VoxelEngine, environmentLightPriority, nextAdaptivePixelRatio, type EnvironmentLightSource, type GameSettings } from "../app/game/engine.ts";
import type { ChunkWorld } from "../app/game/world.ts";

const camera = { x: 0, y: 8, z: 0 };
const forward = { x: 0, y: 0, z: -1 };

test("environment light selection favors illuminated terrain in the view over player proximity", () => {
  const litTerrainAhead = environmentLightPriority({ x: 0, y: 8, z: -42, type: BlockId.Torch }, camera, forward);
  const nearerButIrrelevantSideLight = environmentLightPriority({ x: 24, y: 8, z: -4, type: BlockId.Torch }, camera, forward);
  const lightWhollyBehindTheView = environmentLightPriority({ x: 0, y: 8, z: 20, type: BlockId.Torch }, camera, forward);
  assert.ok(litTerrainAhead < nearerButIrrelevantSideLight);
  assert.ok(litTerrainAhead < lightWhollyBehindTheView);
});

test("environment light selection gives an existing world-space assignment hysteresis", () => {
  const source = { x: 7, y: -12, z: -18, type: BlockId.Glowstone };
  const initial = environmentLightPriority(source, camera, forward);
  const retained = environmentLightPriority(source, camera, forward, true);
  assert.equal(initial - retained, 9);
});

test("dynamic resolution lowers GPU load without reducing world distance", () => {
  assert.equal(nextAdaptivePixelRatio(1.5, 1.5, 28, false), 1.4);
  assert.equal(nextAdaptivePixelRatio(0.82, 1.5, 28, false), 0.82, "desktop resolution must keep a readable floor");
  assert.equal(nextAdaptivePixelRatio(1.1, 1.5, 12, false), 1.15);
});

test("the fixed light pool binds to an influence volume ahead instead of the nearest source", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 120);
  engine.camera.position.set(0, 8, 0);
  engine.camera.lookAt(0, 8, -1);
  engine.camera.updateProjectionMatrix();
  const sources: EnvironmentLightSource[] = [
    { x: 24, y: 8, z: -4, type: BlockId.Torch, distanceSquared: 592 },
    { x: 0, y: 8, z: -42, type: BlockId.Torch, distanceSquared: 1764 },
  ];
  engine.world = { lightSourcesNear: () => sources } as unknown as ChunkWorld;
  engine.settings = { volume: 0, muted: true, sensitivity: 0.002, fov: 72, weather: "clear", renderDistance: 5 } satisfies GameSettings;
  engine.placedLightPool = [new THREE.PointLight()];
  engine.environmentLightCandidates = [];
  engine.environmentLightCandidateCache = [];
  engine.environmentLightSelection = [];
  engine.lightFrustum = new THREE.Frustum();
  engine.lightViewProjection = new THREE.Matrix4();
  engine.lightInfluenceSphere = new THREE.Sphere();
  engine.lightForward = new THREE.Vector3();
  engine.lightSourcePosition = new THREE.Vector3();

  engine.refreshEnvironmentLights();

  assert.equal(engine.placedLightPool[0].position.z, -42);
  assert.equal(engine.placedLightPool[0].userData.sourceZ, -42);
});
