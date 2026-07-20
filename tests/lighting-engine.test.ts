import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import { BlockId } from "../app/game/data.ts";
import { ENVIRONMENT_LIGHT_POOL_SIZE, ENVIRONMENT_LIGHT_QUERY_RADIUS, VoxelEngine, environmentLightPriority, nextAdaptivePixelRatio, type EnvironmentLightSource, type GameSettings } from "../app/game/engine.ts";
import type { ChunkWorld } from "../app/game/world.ts";

const camera = { x: 0, y: 8, z: 0 };
const forward = { x: 0, y: 0, z: -1 };

test("environment light selection is nearest-first and independent of facing", () => {
  const litTerrainAhead = environmentLightPriority({ x: 0, y: 8, z: -42, type: BlockId.Torch }, camera, forward);
  const nearerButIrrelevantSideLight = environmentLightPriority({ x: 24, y: 8, z: -4, type: BlockId.Torch }, camera, forward);
  const nearbyBehind = environmentLightPriority({ x: 0, y: 8, z: 8, type: BlockId.Torch }, camera, forward);
  const nearbyBehindWhileFacingIt = environmentLightPriority({ x: 0, y: 8, z: 8, type: BlockId.Torch }, camera, { x: 0, y: 0, z: 1 });
  assert.ok(nearbyBehind < nearerButIrrelevantSideLight);
  assert.ok(nearerButIrrelevantSideLight < litTerrainAhead);
  assert.equal(nearbyBehind, nearbyBehindWhileFacingIt);
  assert.deepEqual(ENVIRONMENT_LIGHT_POOL_SIZE, { desktop: 16, touch: 8 });
});

test("environment light selection gives an existing world-space assignment hysteresis", () => {
  const source = { x: 7, y: -12, z: -18, type: BlockId.Glowstone };
  const initial = environmentLightPriority(source, camera, forward);
  const retained = environmentLightPriority(source, camera, forward, true);
  assert.equal(initial - retained, 25);
});

test("dynamic resolution lowers GPU load without reducing world distance", () => {
  assert.equal(nextAdaptivePixelRatio(1.5, 1.5, 28, false), 1.4);
  assert.equal(nextAdaptivePixelRatio(0.82, 1.5, 28, false), 0.82, "desktop resolution must keep a readable floor");
  assert.equal(nextAdaptivePixelRatio(1.1, 1.5, 12, false), 1.15);
});

test("the fixed light pool binds to the nearest source even when it is beside the view", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 120);
  engine.camera.position.set(0, 8, 0);
  engine.camera.lookAt(0, 8, -1);
  engine.camera.updateProjectionMatrix();
  const sources: EnvironmentLightSource[] = [
    { x: 24, y: 8, z: -4, type: BlockId.Torch, distanceSquared: 592 },
    { x: 0, y: 8, z: -42, type: BlockId.Torch, distanceSquared: 1764 },
  ];
  let requestedRadius = 0;
  engine.world = { lightSourcesNear: (_x: number, _y: number, _z: number, radius: number) => {
    requestedRadius = radius;
    return sources;
  } } as unknown as ChunkWorld;
  engine.settings = { volume: 0, musicVolume: 0.72, muted: true, sensitivity: 0.002, fov: 72, weather: "clear", renderDistance: 5, simulationDistance: 5, showFps: false, showMinimap: false, showBreakingTexture: true, showBreakProgress: false, showToolEffectiveness: true, debugTelemetry: false, debugTelemetryMaxMinutes: 60, resourceMode: "auto" } satisfies GameSettings;
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

  assert.equal(requestedRadius, ENVIRONMENT_LIGHT_QUERY_RADIUS, "dynamic light selection must scan influence range, not every rendered chunk");
  assert.equal(engine.placedLightPool[0].position.x, 24);
  assert.equal(engine.placedLightPool[0].userData.sourceX, 24);
});

test("bounded light query includes the full influence margin and excludes sources beyond it", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 120);
  engine.camera.position.set(0, 8, 0);
  engine.camera.lookAt(0, 8, -1);
  engine.camera.updateProjectionMatrix();
  const inside = { x: ENVIRONMENT_LIGHT_QUERY_RADIUS - 0.01, y: 8, z: 0, type: BlockId.Torch };
  const outside = { x: ENVIRONMENT_LIGHT_QUERY_RADIUS + 0.01, y: 8, z: 0, type: BlockId.Torch };
  const allSources = [inside, outside].map((source) => ({ ...source, distanceSquared: source.x ** 2 }));
  let requestedRadius = 0;
  engine.world = { lightSourcesNear: (_x: number, _y: number, _z: number, radius: number) => {
    requestedRadius = radius;
    return allSources.filter((source) => source.distanceSquared <= radius * radius);
  } } as unknown as ChunkWorld;
  engine.placedLightPool = [new THREE.PointLight(), new THREE.PointLight()];
  engine.environmentLightCandidates = [];
  engine.environmentLightCandidateCache = [];
  engine.environmentLightSelection = [];
  engine.lightFrustum = new THREE.Frustum();
  engine.lightViewProjection = new THREE.Matrix4();
  engine.lightInfluenceSphere = new THREE.Sphere();
  engine.lightForward = new THREE.Vector3();
  engine.lightSourcePosition = new THREE.Vector3();

  engine.refreshEnvironmentLights();

  assert.equal(requestedRadius, 30);
  assert.ok(engine.placedLightPool.some((light) => light.userData.sourceX === inside.x));
  assert.ok(engine.placedLightPool.every((light) => light.userData.sourceX !== outside.x));
});

test("pooled particle and leaf resources initialize lazily and dispose idempotently", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  engine.scene = new THREE.Scene();
  engine.particles = [];

  engine.spawnParticles(0, 1, 0, BlockId.Dirt, 2);

  assert.equal(engine.particles.length, 2);
  assert.ok(engine.sharedParticleGeometry);
  assert.equal(engine.particleMaterials?.size, 1);
  assert.equal(engine.particles[0]?.mesh.geometry, engine.particles[1]?.mesh.geometry);
  const leafResources = (engine as unknown as {
    ensureLeafParticleResources: () => { geometry: THREE.PlaneGeometry; materials: Map<string, THREE.MeshBasicMaterial> };
  }).ensureLeafParticleResources();
  assert.equal(leafResources.geometry, engine.sharedLeafGeometry);
  assert.equal(leafResources.materials, engine.leafMaterials);
  engine.disposePooledParticleResources();
  engine.disposePooledParticleResources();
  assert.equal(engine.sharedParticleGeometry, null);
  assert.equal(engine.particleMaterials, null);
  assert.equal(engine.sharedLeafGeometry, null);
  assert.equal(engine.leafMaterials, null);
});

test("lava receives a useful bounded warm dynamic light", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const light = new THREE.PointLight();
  engine.configureEnvironmentLight(light, { x: 3, y: -20, z: 7, type: BlockId.Lava, distanceSquared: 1, priority: 1, selected: true, assigned: false } as never);
  assert.equal(light.color.getHex(), 0xff692f);
  assert.equal(light.distance, 18);
  assert.equal(light.userData.targetIntensity, 2.05);
});

test("Wild Rune Stone uses only a restrained green mineral glow", () => {
  const engine = Object.create(VoxelEngine.prototype) as VoxelEngine;
  const light = new THREE.PointLight();
  engine.configureEnvironmentLight(light, { x: 2, y: 4, z: 6, type: BlockId.RuneStone, distanceSquared: 1, priority: 1, selected: true, assigned: false } as never);
  assert.equal(light.color.getHex(), 0x73aa7b);
  assert.equal(light.distance, 8);
  assert.equal(light.userData.targetIntensity, 0.48);
});
