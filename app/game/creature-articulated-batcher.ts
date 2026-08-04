import * as THREE from "three";
import type { MobKind, MobMovement } from "./mobs";
import { sharedBoxGeometry } from "./shared-model-geometry";

export type ArticulatedCreatureInstance = Readonly<{
  id: number;
  kind: MobKind;
  color: THREE.ColorRepresentation;
  accentColor: THREE.ColorRepresentation;
  movement: MobMovement;
  position: Readonly<{ x: number; y: number; z: number }>;
  yaw: number;
  width: number;
  height: number;
  depth: number;
  gait: number;
  age: number;
}>;

type Part = Readonly<{
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  pitch?: number;
  roll?: number;
  accent?: boolean;
}>;

/**
 * One colored box batch preserves a readable articulated silhouette for every
 * admitted middle-distance creature. The authored Object3D rig remains the
 * hero path; this tier removes its per-part draw calls without changing AI.
 */
export class CreatureArticulatedBatcher {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh | null = null;
  private readonly material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private capacity = 0;
  private readonly matrix = new THREE.Matrix4();
  private readonly center = new THREE.Vector3();
  private readonly offset = new THREE.Vector3();
  private readonly scale = new THREE.Vector3();
  private readonly yawQuaternion = new THREE.Quaternion();
  private readonly localQuaternion = new THREE.Quaternion();
  private readonly quaternion = new THREE.Quaternion();
  private readonly localEuler = new THREE.Euler();
  private readonly up = new THREE.Vector3(0, 1, 0);
  private readonly primary = new THREE.Color();
  private readonly accent = new THREE.Color();
  private matrixUpdates = 0;
  activeCreatures = 0;
  activeParts = 0;

  constructor() {
    this.group.name = "creature-articulated-batch";
  }

  private ensureCapacity(required: number) {
    if (this.mesh && this.capacity >= required) return this.mesh;
    const capacity = Math.max(64, 2 ** Math.ceil(Math.log2(Math.max(1, required))));
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.dispose();
    }
    const mesh = new THREE.InstancedMesh(sharedBoxGeometry(), this.material, capacity);
    mesh.name = "creature-articulated-parts";
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    mesh.raycast = () => {};
    this.group.add(mesh);
    this.mesh = mesh;
    this.capacity = capacity;
    return mesh;
  }

  private groundParts(instance: ArticulatedCreatureInstance): Part[] {
    const { width: w, height: h, depth: d } = instance;
    const stride = Math.sin(instance.gait) * Math.min(d * 0.1, 0.16);
    return [
      { x: 0, y: h * 0.61, z: 0, width: w, height: h * 0.48, depth: d * 0.72 },
      { x: 0, y: h * 0.75, z: d * 0.48, width: w * 0.62, height: h * 0.42, depth: d * 0.42, accent: true },
      { x: -w * 0.31, y: h * 0.23, z: d * 0.24 + stride, width: w * 0.2, height: h * 0.46, depth: d * 0.18 },
      { x: w * 0.31, y: h * 0.23, z: d * 0.24 - stride, width: w * 0.2, height: h * 0.46, depth: d * 0.18 },
      { x: -w * 0.31, y: h * 0.23, z: -d * 0.24 - stride, width: w * 0.2, height: h * 0.46, depth: d * 0.18 },
      { x: w * 0.31, y: h * 0.23, z: -d * 0.24 + stride, width: w * 0.2, height: h * 0.46, depth: d * 0.18 },
      { x: 0, y: h * 0.65, z: -d * 0.52, width: w * 0.2, height: h * 0.17, depth: d * 0.48, pitch: -0.16, accent: true },
      { x: -w * 0.2, y: h * 0.98, z: d * 0.52, width: w * 0.16, height: h * 0.28, depth: d * 0.12, pitch: -0.18, accent: true },
      { x: w * 0.2, y: h * 0.98, z: d * 0.52, width: w * 0.16, height: h * 0.28, depth: d * 0.12, pitch: -0.18, accent: true },
    ];
  }

  private flyingParts(instance: ArticulatedCreatureInstance): Part[] {
    const { width: w, height: h, depth: d } = instance;
    const flap = 0.18 + Math.sin(instance.age * 8 + instance.id * 0.37) * 0.34;
    return [
      { x: 0, y: h * 0.54, z: 0, width: w * 0.72, height: h * 0.55, depth: d * 0.62 },
      { x: 0, y: h * 0.64, z: d * 0.45, width: w * 0.48, height: h * 0.42, depth: d * 0.35, accent: true },
      { x: -w * 0.62, y: h * 0.62, z: 0, width: w * 0.9, height: h * 0.08, depth: d * 0.62, roll: flap },
      { x: w * 0.62, y: h * 0.62, z: 0, width: w * 0.9, height: h * 0.08, depth: d * 0.62, roll: -flap },
      { x: 0, y: h * 0.57, z: -d * 0.48, width: w * 0.22, height: h * 0.18, depth: d * 0.52, accent: true },
    ];
  }

  private aquaticParts(instance: ArticulatedCreatureInstance): Part[] {
    const { width: w, height: h, depth: d } = instance;
    const swim = Math.sin(instance.age * 4.5 + instance.id * 0.29) * 0.32;
    return [
      { x: 0, y: h * 0.5, z: 0, width: w, height: h * 0.62, depth: d * 0.62 },
      { x: 0, y: h * 0.52, z: d * 0.48, width: w * 0.62, height: h * 0.48, depth: d * 0.36, accent: true },
      { x: 0, y: h * 0.5, z: -d * 0.46, width: w * 0.48, height: h * 0.42, depth: d * 0.34, roll: swim * 0.25 },
      { x: 0, y: h * 0.5, z: -d * 0.76, width: w * 0.18, height: h * 0.64, depth: d * 0.3, roll: swim, accent: true },
      { x: -w * 0.56, y: h * 0.44, z: d * 0.08, width: w * 0.52, height: h * 0.08, depth: d * 0.32, roll: 0.24 },
      { x: w * 0.56, y: h * 0.44, z: d * 0.08, width: w * 0.52, height: h * 0.08, depth: d * 0.32, roll: -0.24 },
      { x: 0, y: h * 0.88, z: -d * 0.04, width: w * 0.08, height: h * 0.42, depth: d * 0.3, accent: true },
    ];
  }

  private partsFor(instance: ArticulatedCreatureInstance) {
    if (instance.movement === "flying") return this.flyingParts(instance);
    if (instance.movement === "aquatic") return this.aquaticParts(instance);
    return this.groundParts(instance);
  }

  update(instances: readonly ArticulatedCreatureInstance[]) {
    const required = instances.reduce((total, instance) => total + this.partsFor(instance).length, 0);
    const mesh = this.ensureCapacity(required);
    let index = 0;
    for (const instance of instances) {
      this.primary.set(instance.color);
      this.accent.set(instance.accentColor);
      this.yawQuaternion.setFromAxisAngle(this.up, instance.yaw);
      for (const part of this.partsFor(instance)) {
        this.offset.set(part.x, part.y, part.z).applyQuaternion(this.yawQuaternion);
        this.center.set(instance.position.x, instance.position.y, instance.position.z).add(this.offset);
        this.localEuler.set(part.pitch ?? 0, 0, part.roll ?? 0);
        this.localQuaternion.setFromEuler(this.localEuler);
        this.quaternion.copy(this.yawQuaternion).multiply(this.localQuaternion);
        this.scale.set(Math.max(0.02, part.width), Math.max(0.02, part.height), Math.max(0.02, part.depth));
        this.matrix.compose(this.center, this.quaternion, this.scale);
        mesh.setMatrixAt(index, this.matrix);
        mesh.setColorAt(index, part.accent ? this.accent : this.primary);
        index += 1;
      }
    }
    mesh.count = index;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor.needsUpdate = true;
    }
    this.activeCreatures = instances.length;
    this.activeParts = index;
    this.matrixUpdates += index;
  }

  diagnostics() {
    return {
      activeCreatures: this.activeCreatures,
      activeParts: this.activeParts,
      activeBatches: this.mesh && this.mesh.count > 0 ? 1 : 0,
      allocatedCapacity: this.capacity,
      matrixUpdates: this.matrixUpdates,
    } as const;
  }

  dispose() {
    if (this.mesh) this.mesh.dispose();
    this.material.dispose();
    this.mesh = null;
    this.capacity = 0;
    this.group.clear();
  }
}
