import * as THREE from "three";
import type { MobKind } from "./mobs";
import { sharedBoxGeometry } from "./shared-model-geometry";

export type CreatureLodInstance = Readonly<{
  kind: MobKind;
  color: THREE.ColorRepresentation;
  position: Readonly<{ x: number; y: number; z: number }>;
  yaw: number;
  width: number;
  height: number;
  depth: number;
}>;

/** One colored draw replaces every distant articulated rig, across all species. */
export class CreatureLodBatcher {
  readonly group = new THREE.Group();
  private mesh: THREE.InstancedMesh | null = null;
  private readonly material = new THREE.MeshLambertMaterial({ color: 0xffffff });
  private capacity = 0;
  private matrix = new THREE.Matrix4();
  private quaternion = new THREE.Quaternion();
  private scale = new THREE.Vector3();
  private rotation = new THREE.Euler();
  private center = new THREE.Vector3();
  private color = new THREE.Color();
  activeInstances = 0;

  constructor() {
    this.group.name = "creature-lod-batches";
  }

  private ensureBatch(required: number) {
    if (this.mesh && this.capacity >= required) return this.mesh;
    const capacity = Math.max(4, 2 ** Math.ceil(Math.log2(Math.max(1, required))));
    if (this.mesh) {
      this.group.remove(this.mesh);
      this.mesh.dispose();
    }
    const mesh = new THREE.InstancedMesh(sharedBoxGeometry(), this.material, capacity);
    mesh.name = "creature-silhouette-batch";
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

  update(instances: readonly CreatureLodInstance[]) {
    const mesh = this.ensureBatch(instances.length);
    this.activeInstances = instances.length;
    instances.forEach((entry, index) => {
      this.center.set(entry.position.x, entry.position.y + entry.height * 0.5, entry.position.z);
      this.rotation.set(0, entry.yaw, 0);
      this.quaternion.setFromEuler(this.rotation);
      this.scale.set(entry.width, entry.height, entry.depth);
      this.matrix.compose(this.center, this.quaternion, this.scale);
      mesh.setMatrixAt(index, this.matrix);
      this.color.set(entry.color);
      mesh.setColorAt(index, this.color);
    });
    mesh.count = instances.length;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) {
      mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
      mesh.instanceColor.needsUpdate = true;
    }
  }

  diagnostics() {
    return {
      activeInstances: this.activeInstances,
      activeBatches: this.mesh && this.mesh.count > 0 ? 1 : 0,
      allocatedCapacity: this.capacity,
    } as const;
  }

  dispose() {
    this.mesh?.dispose();
    this.material.dispose();
    this.mesh = null;
    this.capacity = 0;
    this.group.clear();
  }
}
