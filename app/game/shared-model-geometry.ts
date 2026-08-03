import * as THREE from "three";

const cache = new Map<string, THREE.BufferGeometry>();
const rounded = (value: number) => Number(value.toFixed(5));

function shared<T extends THREE.BufferGeometry>(key: string, create: () => T): T {
  const existing = cache.get(key);
  if (existing) return existing as T;
  const geometry = create();
  geometry.userData.blockwildSharedGeometry = key;
  cache.set(key, geometry);
  return geometry;
}

export function sharedBoxGeometry(width = 1, height = 1, depth = 1, segments = 1) {
  const key = `box:${rounded(width)}:${rounded(height)}:${rounded(depth)}:${segments}`;
  return shared(key, () => new THREE.BoxGeometry(width, height, depth, segments, segments, segments));
}

export function sharedLivingGeometry(shape: "organic" | "hard" | "gem" | "spike-up" | "spike-forward" | "ring" | "limb-y" | "limb-x" | "limb-z" | "joint") {
  return shared(`living:${shape}`, () => {
    if (shape === "hard") return new THREE.BoxGeometry(1, 1, 1, 2, 2, 2);
    if (shape === "gem") return new THREE.OctahedronGeometry(0.5, 1);
    if (shape === "ring") return new THREE.TorusGeometry(0.34, 0.16, 6, 14);
    if (shape === "joint") return new THREE.SphereGeometry(0.5, 8, 5);
    if (shape === "limb-y" || shape === "limb-x" || shape === "limb-z") {
      const geometry = new THREE.CylinderGeometry(0.38, 0.5, 1, 8, 2, false);
      if (shape === "limb-x") geometry.rotateZ(Math.PI / 2);
      if (shape === "limb-z") geometry.rotateX(Math.PI / 2);
      return geometry;
    }
    if (shape === "spike-up" || shape === "spike-forward") {
      const geometry = new THREE.ConeGeometry(0.5, 1, 8, 2);
      if (shape === "spike-forward") geometry.rotateX(-Math.PI / 2);
      return geometry;
    }
    return new THREE.SphereGeometry(0.5, 10, 6);
  });
}

export function isSharedModelGeometry(geometry: THREE.BufferGeometry | undefined) {
  return Boolean(geometry?.userData.blockwildSharedGeometry);
}

export function sharedModelGeometryDiagnostics() {
  return { geometries: cache.size, keys: [...cache.keys()] } as const;
}
