import * as THREE from "three";
import { BLOCKS, BlockId, type ItemCode, type Weather } from "./data";
import { BUTTERFLY_ORDER, MOB_DEFS, type ButterflyKind } from "./mobs";
import { BiomeId, type ChunkWorld } from "./world";

export type ButterflySnapshot = {
  id: number;
  kind: ButterflyKind;
  x: number;
  y: number;
  z: number;
  yaw: number;
  landed: boolean;
  wing: number;
};

export type ButterflyCapture = {
  id: number;
  kind: ButterflyKind;
  item: ItemCode;
};

export type ButterflyEnvironment = {
  player: THREE.Vector3;
  daylight: number;
  weather: Weather;
  density: number;
  cap: number;
  smallEntities?: readonly THREE.Vector3[];
};

type ButterflyEntity = {
  id: number;
  kind: ButterflyKind;
  group: THREE.Group;
  leftWing: THREE.Group;
  rightWing: THREE.Group;
  velocity: THREE.Vector3;
  target: THREE.Vector3;
  flower: THREE.Vector3;
  landed: boolean;
  stateTimer: number;
  age: number;
  phase: number;
};

const FLOWERS = new Set<BlockId>([BlockId.RedFlower, BlockId.BlueFlower]);
const BUTTERFLY_BIOMES = new Set<BiomeId>([
  BiomeId.Meadow, BiomeId.Wildwood, BiomeId.Birchlight, BiomeId.Bloomwood,
  BiomeId.Savanna, BiomeId.Badlands, BiomeId.Frostpine, BiomeId.Snowfield,
  BiomeId.Siltfen, BiomeId.MushroomFen,
]);

export const BUTTERFLY_FLIGHT_TUNING = Object.freeze({
  seekFlowerChance: 0.32,
  flightSecondsMin: 1.8,
  flightSecondsRange: 4.2,
  landedSecondsMin: 0.65,
  landedSecondsRange: 1.9,
});

export function butterflyKindForBiome(biome: BiomeId, roll = Math.random()): ButterflyKind | null {
  if (biome === BiomeId.Bloomwood) return roll < 0.74 ? "bloom-monarch" : "azure-skippers";
  if (biome === BiomeId.Siltfen || biome === BiomeId.MushroomFen) return roll < 0.82 ? "fen-lantern" : "meadowwing";
  if (biome === BiomeId.Frostpine || biome === BiomeId.Snowfield) return "frostveil";
  if (biome === BiomeId.Savanna || biome === BiomeId.Badlands) return roll < 0.8 ? "embertip" : "meadowwing";
  if (biome === BiomeId.Birchlight || biome === BiomeId.Wildwood) return roll < 0.66 ? "azure-skippers" : "meadowwing";
  if (biome === BiomeId.Meadow) return roll < 0.72 ? "meadowwing" : roll < 0.9 ? "azure-skippers" : "bloom-monarch";
  return null;
}

export function butterflyCaptureAlongRay(
  snapshots: readonly Pick<ButterflySnapshot, "id" | "kind" | "x" | "y" | "z">[],
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  reach = 4.2,
) {
  let best: { id: number; forward: number } | null = null;
  for (const snapshot of snapshots) {
    const dx = snapshot.x - origin.x;
    const dy = snapshot.y - origin.y;
    const dz = snapshot.z - origin.z;
    const forward = dx * direction.x + dy * direction.y + dz * direction.z;
    if (forward < 0.15 || forward > reach) continue;
    const distanceSquared = dx * dx + dy * dy + dz * dz;
    const radialSquared = distanceSquared - forward * forward;
    const captureRadius = 0.28 + forward * 0.025;
    if (radialSquared > captureRadius * captureRadius) continue;
    if (!best || forward < best.forward) best = { id: snapshot.id, forward };
  }
  return best?.id ?? null;
}

export class ButterflySystem {
  readonly group = new THREE.Group();
  readonly entities: ButterflyEntity[] = [];
  private readonly bodyGeometry = new THREE.BoxGeometry(0.055, 0.055, 0.17);
  private readonly wingGeometry = new THREE.BoxGeometry(0.2, 0.018, 0.14);
  private readonly antennaGeometry = new THREE.BoxGeometry(0.012, 0.012, 0.12);
  private readonly materials = new Map<ButterflyKind, { body: THREE.MeshLambertMaterial; wing: THREE.MeshLambertMaterial; accent: THREE.MeshBasicMaterial }>();
  private readonly scratch = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private nextId = 1;
  private spawnTimer = 1.5;

  constructor(private readonly world: ChunkWorld, private readonly onObserved?: (kind: ButterflyKind, captured: boolean) => void) {
    this.group.name = "butterflies";
  }

  private materialFor(kind: ButterflyKind) {
    let material = this.materials.get(kind);
    if (material) return material;
    const [wing, body, accent] = MOB_DEFS[kind].colors;
    material = {
      body: new THREE.MeshLambertMaterial({ color: body }),
      wing: new THREE.MeshLambertMaterial({ color: wing, transparent: true, opacity: 0.92, side: THREE.DoubleSide }),
      accent: new THREE.MeshBasicMaterial({ color: accent }),
    };
    this.materials.set(kind, material);
    return material;
  }

  private createEntity(kind: ButterflyKind, flower: THREE.Vector3, position = flower.clone().add(new THREE.Vector3(0, 0.62, 0))) {
    const material = this.materialFor(kind);
    const group = new THREE.Group();
    group.position.copy(position);
    group.userData.butterflyId = this.nextId;
    const body = new THREE.Mesh(this.bodyGeometry, material.body);
    body.userData.butterflyId = this.nextId;
    group.add(body);

    const leftWing = new THREE.Group();
    const rightWing = new THREE.Group();
    leftWing.position.x = -0.035;
    rightWing.position.x = 0.035;
    const left = new THREE.Mesh(this.wingGeometry, material.wing);
    const right = new THREE.Mesh(this.wingGeometry, material.wing);
    left.position.x = -0.1;
    right.position.x = 0.1;
    left.userData.butterflyId = right.userData.butterflyId = this.nextId;
    leftWing.add(left);
    rightWing.add(right);
    group.add(leftWing, rightWing);

    for (const side of [-1, 1]) {
      const antenna = new THREE.Mesh(this.antennaGeometry, material.accent);
      antenna.position.set(side * 0.02, 0.025, -0.125);
      antenna.rotation.x = -0.38;
      antenna.rotation.z = side * 0.18;
      group.add(antenna);
    }
    const entity: ButterflyEntity = {
      id: this.nextId++, kind, group, leftWing, rightWing,
      velocity: new THREE.Vector3((Math.random() - 0.5) * 0.5, 0.15, (Math.random() - 0.5) * 0.5),
      target: position.clone(), flower: flower.clone(), landed: false,
      stateTimer: 0.6 + Math.random() * 2.4, age: 0, phase: Math.random() * Math.PI * 2,
    };
    this.entities.push(entity);
    this.group.add(group);
    return entity;
  }

  private flowerAt(x: number, z: number) {
    const ground = this.world.surfaceAt(x, z);
    const y = ground + 1;
    const type = this.world.getBlock(x, y, z);
    return type !== undefined && FLOWERS.has(type) ? new THREE.Vector3(x, y, z) : null;
  }

  private findFlowerNear(x: number, z: number, radius: number) {
    for (let attempt = 0; attempt < 28; attempt += 1) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * radius;
      const flower = this.flowerAt(Math.round(x + Math.cos(angle) * distance), Math.round(z + Math.sin(angle) * distance));
      if (flower) return flower;
    }
    return this.flowerAt(Math.round(x), Math.round(z));
  }

  private canOccupy(position: THREE.Vector3) {
    const type = this.world.getBlock(Math.floor(position.x + 0.5), Math.floor(position.y + 0.5), Math.floor(position.z + 0.5));
    return type !== undefined && (!BLOCKS[type]?.solid || FLOWERS.has(type));
  }

  private trySpawn(environment: ButterflyEnvironment) {
    if (environment.daylight < 0.5 || environment.weather === "rain" || this.entities.length >= environment.cap) return;
    const angle = Math.random() * Math.PI * 2;
    const distance = 7 + Math.random() * 25;
    const x = Math.round(environment.player.x + Math.cos(angle) * distance);
    const z = Math.round(environment.player.z + Math.sin(angle) * distance);
    const biome = this.world.biomeAt(x, z);
    if (!BUTTERFLY_BIOMES.has(biome)) return;
    const flower = this.findFlowerNear(x, z, 7);
    if (!flower || this.world.skyVisibilityAt(flower.x, flower.y + 0.7, flower.z) < 0.72) return;
    const kind = butterflyKindForBiome(biome);
    if (!kind) return;
    this.createEntity(kind, flower);
  }

  update(dt: number, environment: ButterflyEnvironment) {
    this.spawnTimer -= dt * Math.max(0.15, environment.density);
    if (this.spawnTimer <= 0) {
      this.spawnTimer = 1.8 + Math.random() * 3.2;
      this.trySpawn(environment);
    }

    for (let index = this.entities.length - 1; index >= 0; index -= 1) {
      const butterfly = this.entities[index];
      butterfly.age += dt;
      butterfly.stateTimer -= dt;
      const distanceToPlayer = butterfly.group.position.distanceTo(environment.player);
      if (distanceToPlayer < 7) this.onObserved?.(butterfly.kind, false);
      if (distanceToPlayer > 58 || butterfly.age > 360) {
        this.removeAt(index);
        continue;
      }
      const flowerStillThere = FLOWERS.has(this.world.getBlock(Math.round(butterfly.flower.x), Math.round(butterfly.flower.y), Math.round(butterfly.flower.z)) ?? BlockId.Air);
      if (butterfly.landed) {
        butterfly.group.position.set(butterfly.flower.x, butterfly.flower.y + 0.52, butterfly.flower.z);
        butterfly.velocity.set(0, 0, 0);
        if (!flowerStillThere || butterfly.stateTimer <= 0 || environment.weather === "rain" || environment.daylight < 0.35) {
          butterfly.landed = false;
          butterfly.stateTimer = 0.5 + Math.random() * 1.5;
          butterfly.velocity.set((Math.random() - 0.5) * 0.7, 0.45, (Math.random() - 0.5) * 0.7);
        }
      } else {
        if (butterfly.stateTimer <= 0) {
          const flower = environment.daylight > 0.38 && environment.weather !== "rain" && Math.random() < BUTTERFLY_FLIGHT_TUNING.seekFlowerChance
            ? this.findFlowerNear(butterfly.group.position.x, butterfly.group.position.z, 7)
            : null;
          if (flower) {
            butterfly.flower.copy(flower);
            butterfly.target.set(flower.x, flower.y + 0.54, flower.z);
          } else {
            butterfly.target.set(
              butterfly.flower.x + (Math.random() - 0.5) * 7,
              butterfly.flower.y + 0.8 + Math.random() * 2.6,
              butterfly.flower.z + (Math.random() - 0.5) * 7,
            );
          }
          butterfly.stateTimer = BUTTERFLY_FLIGHT_TUNING.flightSecondsMin + Math.random() * BUTTERFLY_FLIGHT_TUNING.flightSecondsRange;
        }
        this.desired.copy(butterfly.target).sub(butterfly.group.position);
        const targetDistance = this.desired.length();
        if (targetDistance > 0.001) this.desired.multiplyScalar(1 / targetDistance);
        const speed = MOB_DEFS[butterfly.kind].speed * (environment.weather === "rain" ? 0.55 : 1);
        this.desired.multiplyScalar(speed);
        this.desired.y += Math.sin(butterfly.age * 4.2 + butterfly.phase) * 0.18;
        butterfly.velocity.lerp(this.desired, 1 - Math.exp(-dt * 3.8));
        this.scratch.copy(butterfly.group.position).addScaledVector(butterfly.velocity, dt);
        if (this.canOccupy(this.scratch)) butterfly.group.position.copy(this.scratch);
        else {
          butterfly.velocity.multiplyScalar(-0.45);
          butterfly.target.copy(butterfly.group.position).add(new THREE.Vector3((Math.random() - 0.5) * 3, 0.8 + Math.random(), (Math.random() - 0.5) * 3));
          butterfly.stateTimer = 0.35;
        }
        if (flowerStillThere && butterfly.group.position.distanceTo(butterfly.target) < 0.16 && environment.daylight > 0.35) {
          butterfly.landed = true;
          butterfly.stateTimer = BUTTERFLY_FLIGHT_TUNING.landedSecondsMin + Math.random() * BUTTERFLY_FLIGHT_TUNING.landedSecondsRange;
        }
      }

      for (const other of this.entities) {
        if (other === butterfly) continue;
        const separation = this.scratch.copy(butterfly.group.position).sub(other.group.position);
        const distanceSquared = separation.lengthSq();
        if (distanceSquared > 0.0001 && distanceSquared < 0.075) butterfly.velocity.addScaledVector(separation.normalize(), dt * 1.8);
      }
      for (const small of environment.smallEntities ?? []) {
        const separation = this.scratch.copy(butterfly.group.position).sub(small);
        const distanceSquared = separation.lengthSq();
        if (distanceSquared > 0.0001 && distanceSquared < 0.12) butterfly.velocity.addScaledVector(separation.normalize(), dt * 1.2);
      }

      const flap = butterfly.landed ? 0.16 : Math.sin(butterfly.age * 21 + butterfly.phase) * 0.92;
      butterfly.leftWing.rotation.z = flap;
      butterfly.rightWing.rotation.z = -flap;
      if (butterfly.velocity.lengthSq() > 0.01) butterfly.group.rotation.y = Math.atan2(butterfly.velocity.x, butterfly.velocity.z);
    }
  }

  capture(origin: THREE.Vector3, direction: THREE.Vector3, reach = 4.2): ButterflyCapture | null {
    const id = butterflyCaptureAlongRay(this.snapshots(), origin, direction, reach);
    if (id === null) return null;
    const index = this.entities.findIndex((candidate) => candidate.id === id);
    if (index < 0) return null;
    const butterfly = this.entities[index];
    const definition = MOB_DEFS[butterfly.kind];
    this.removeAt(index);
    this.onObserved?.(butterfly.kind, true);
    return { id, kind: butterfly.kind, item: definition.captureItem! };
  }

  release(kind: ButterflyKind, position: THREE.Vector3) {
    if (!BUTTERFLY_ORDER.includes(kind) || !this.canOccupy(position)) return false;
    const flower = this.findFlowerNear(position.x, position.z, 7) ?? position.clone().add(new THREE.Vector3(0, -0.5, 0));
    this.createEntity(kind, flower, position);
    this.onObserved?.(kind, false);
    return true;
  }

  snapshots(): ButterflySnapshot[] {
    return this.entities.map((butterfly) => ({
      id: butterfly.id, kind: butterfly.kind,
      x: butterfly.group.position.x, y: butterfly.group.position.y, z: butterfly.group.position.z,
      yaw: butterfly.group.rotation.y, landed: butterfly.landed,
      wing: butterfly.leftWing.rotation.z,
    }));
  }

  private removeAt(index: number) {
    const [butterfly] = this.entities.splice(index, 1);
    if (butterfly) this.group.remove(butterfly.group);
  }

  clear() {
    while (this.entities.length) this.removeAt(this.entities.length - 1);
  }

  dispose() {
    this.clear();
    this.bodyGeometry.dispose();
    this.wingGeometry.dispose();
    this.antennaGeometry.dispose();
    for (const material of this.materials.values()) {
      material.body.dispose();
      material.wing.dispose();
      material.accent.dispose();
    }
    this.materials.clear();
  }
}
