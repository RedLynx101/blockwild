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

type Batch = {
  mesh: THREE.InstancedMesh;
  material: THREE.MeshLambertMaterial;
  capacity: number;
};

/** One draw per distant species replaces every articulated body-part draw. */
export class CreatureLodBatcher {
  readonly group = new THREE.Group();
  private batches = new Map<MobKind, Batch>();
  private matrix = new THREE.Matrix4();
  private quaternion = new THREE.Quaternion();
  private scale = new THREE.Vector3();
  private rotation = new THREE.Euler();
  private center = new THREE.Vector3();
  activeInstances = 0;

  constructor() {
    this.group.name = "creature-lod-batches";
  }

  private ensureBatch(kind: MobKind, color: THREE.ColorRepresentation, required: number) {
    let batch = this.batches.get(kind);
    if (batch && batch.capacity >= required) return batch;
    const capacity = Math.max(4, 2 ** Math.ceil(Math.log2(Math.max(1, required))));
    if (batch) {
      this.group.remove(batch.mesh);
      batch.mesh.dispose();
      batch.material.dispose();
    }
    const material = new THREE.MeshLambertMaterial({ color });
    const mesh = new THREE.InstancedMesh(sharedBoxGeometry(), material, capacity);
    mesh.name = `creature-lod-${kind}`;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.count = 0;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.raycast = () => {};
    this.group.add(mesh);
    batch = { mesh, material, capacity };
    this.batches.set(kind, batch);
    return batch;
  }

  update(instances: readonly CreatureLodInstance[]) {
    const grouped = new Map<MobKind, CreatureLodInstance[]>();
    for (const instance of instances) {
      const entries = grouped.get(instance.kind);
      if (entries) entries.push(instance);
      else grouped.set(instance.kind, [instance]);
    }
    this.activeInstances = instances.length;
    for (const [kind, batch] of this.batches) if (!grouped.has(kind)) batch.mesh.count = 0;
    for (const [kind, entries] of grouped) {
      const batch = this.ensureBatch(kind, entries[0].color, entries.length);
      entries.forEach((entry, index) => {
        this.center.set(entry.position.x, entry.position.y + entry.height * 0.5, entry.position.z);
        this.rotation.set(0, entry.yaw, 0);
        this.quaternion.setFromEuler(this.rotation);
        this.scale.set(entry.width, entry.height, entry.depth);
        this.matrix.compose(this.center, this.quaternion, this.scale);
        batch.mesh.setMatrixAt(index, this.matrix);
      });
      batch.mesh.count = entries.length;
      batch.mesh.instanceMatrix.needsUpdate = true;
      batch.mesh.computeBoundingSphere();
    }
  }

  diagnostics() {
    return {
      activeInstances: this.activeInstances,
      activeBatches: [...this.batches.values()].filter((batch) => batch.mesh.count > 0).length,
      allocatedCapacity: [...this.batches.values()].reduce((total, batch) => total + batch.capacity, 0),
    } as const;
  }

  dispose() {
    for (const batch of this.batches.values()) {
      batch.mesh.dispose();
      batch.material.dispose();
    }
    this.batches.clear();
    this.group.clear();
  }
}
