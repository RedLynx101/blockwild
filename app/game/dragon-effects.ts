import * as THREE from "three";

export type DragonElement = "fire" | "ice" | "steel" | "sea";
export type DragonAttackKind = "melee" | "breath" | "projectile";
export type DragonAttackStatus = "burning" | "slowed" | "scalded" | "knockback";

export type DragonAttackEffect = {
  id: number;
  element: DragonElement;
  attack: DragonAttackKind;
  ownerMobId: number | null;
  visual: THREE.Group;
  velocity: THREE.Vector3;
  age: number;
  lifetime: number;
  radius: number;
  damage: number;
  status: DragonAttackStatus;
  statusSeconds: number;
  hitPlayer: boolean;
  hitMobIds: Set<number>;
};

export type CreateDragonAttackEffectOptions = Readonly<{
  id: number;
  element: DragonElement;
  attack: DragonAttackKind;
  stage: number;
  origin: THREE.Vector3;
  direction: THREE.Vector3;
  ownerMobId?: number | null;
  damage: number;
  status?: DragonAttackStatus;
  statusSeconds?: number;
}>;

const PALETTES: Readonly<Record<DragonElement, readonly [number, number, number]>> = {
  fire: [0xff4b1f, 0xffa629, 0xffe08a],
  ice: [0x75d9ff, 0xc9f5ff, 0x6d88ff],
  steel: [0x8ea8b1, 0xe8f3ef, 0xd18a45],
  sea: [0x45bdc7, 0x9fffe8, 0x437de0],
};

function material(color: number, opacity = 0.92) {
  return new THREE.MeshLambertMaterial({
    color,
    emissive: new THREE.Color(color).multiplyScalar(0.28),
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
}

function cube(size: readonly [number, number, number], color: number, opacity = 0.92) {
  return new THREE.Mesh(new THREE.BoxGeometry(...size), material(color, opacity));
}

function pointVisualAlongDirection(root: THREE.Object3D, direction: THREE.Vector3) {
  const forward = direction.clone().normalize();
  root.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), forward);
}

function createBreathVisual(element: DragonElement, stage: number) {
  const group = new THREE.Group();
  group.name = `${element}-dragon-breath`;
  const palette = PALETTES[element];
  const count = 7 + Math.min(5, stage);
  for (let index = 0; index < count; index += 1) {
    const progress = index / Math.max(1, count - 1);
    const breadth = 0.12 + progress * (0.34 + stage * 0.045);
    const mote = cube(
      [breadth * (0.75 + (index % 3) * 0.15), breadth, breadth * 1.25],
      palette[index % palette.length],
      0.74,
    );
    const spiral = index * 2.399963;
    mote.position.set(Math.cos(spiral) * breadth * 0.72, Math.sin(spiral) * breadth * 0.72, -progress * (1.35 + stage * 0.18));
    mote.rotation.set(spiral * 0.31, spiral, spiral * 0.18);
    mote.userData.phase = index * 0.71;
    group.add(mote);
  }
  return group;
}

function createProjectileVisual(element: DragonElement, stage: number) {
  const group = new THREE.Group();
  group.name = `${element}-dragon-projectile`;
  const palette = PALETTES[element];
  if (element === "steel") {
    const shaft = cube([0.1 + stage * 0.012, 0.1 + stage * 0.012, 1.45 + stage * 0.16], 0x72848d);
    shaft.position.z = -0.12;
    const head = cube([0.24 + stage * 0.018, 0.24 + stage * 0.018, 0.42], 0xe6ece8);
    head.position.z = -0.98 - stage * 0.08;
    head.rotation.z = Math.PI / 4;
    const collar = cube([0.19, 0.19, 0.12], 0xc4833d);
    collar.position.z = -0.67 - stage * 0.05;
    group.add(shaft, head, collar);
  } else if (element === "ice") {
    for (let index = 0; index < 4; index += 1) {
      const shard = cube([0.11 + index * 0.025, 0.14 + index * 0.02, 0.72 + stage * 0.08], palette[index % palette.length], 0.9);
      shard.position.set((index - 1.5) * 0.09, ((index + 1) % 2 - 0.5) * 0.14, -index * 0.16);
      shard.rotation.z = (index - 1.5) * 0.18;
      group.add(shard);
    }
  } else if (element === "sea") {
    const length = 0.86 + stage * 0.1;
    for (let index = 0; index < 5; index += 1) {
      const current = cube([0.16 + index * 0.025, 0.16 + index * 0.025, length - index * 0.08], palette[index % palette.length], 0.72);
      current.position.set(Math.sin(index * 2.1) * 0.12, Math.cos(index * 2.1) * 0.12, -index * 0.15);
      current.rotation.z = index * 0.37;
      group.add(current);
    }
  } else {
    const scale = 0.24 + stage * 0.045;
    for (let index = 0; index < 6; index += 1) {
      const ember = cube([scale, scale, scale], palette[index % palette.length], 0.82);
      const angle = index / 6 * Math.PI * 2;
      ember.position.set(Math.cos(angle) * scale * 0.48, Math.sin(angle) * scale * 0.48, (index % 2) * 0.12);
      ember.rotation.set(angle, angle * 0.7, angle * 0.31);
      group.add(ember);
    }
  }
  return group;
}

function createMeleeVisual(element: DragonElement, stage: number) {
  const group = new THREE.Group();
  group.name = `${element}-dragon-melee-arc`;
  const palette = PALETTES[element];
  for (let index = 0; index < 5; index += 1) {
    const angle = -0.72 + index * 0.36;
    const slash = cube([0.08, 0.18 + stage * 0.035, 0.62 + stage * 0.12], palette[index % palette.length], 0.38);
    slash.position.set(Math.sin(angle) * (0.72 + stage * 0.08), 0, -Math.cos(angle) * (0.72 + stage * 0.08));
    slash.rotation.y = -angle;
    group.add(slash);
  }
  return group;
}

export function createDragonAttackEffect(options: CreateDragonAttackEffectOptions): DragonAttackEffect {
  const stage = Math.max(1, Math.min(5, Math.round(options.stage)));
  const direction = options.direction.clone().normalize();
  const visual = options.attack === "breath"
    ? createBreathVisual(options.element, stage)
    : options.attack === "projectile"
      ? createProjectileVisual(options.element, stage)
      : createMeleeVisual(options.element, stage);
  visual.position.copy(options.origin);
  pointVisualAlongDirection(visual, direction);
  const speed = options.attack === "projectile" ? 16 + stage * 2.1 : options.attack === "breath" ? 8.5 + stage * 1.15 : 0;
  const status = options.status ?? (options.attack === "melee" ? "knockback"
    : options.element === "fire" ? "burning" : options.element === "ice" || options.element === "sea" ? "slowed"
      : options.attack === "breath" ? "scalded" : "knockback");
  return {
    id: options.id,
    element: options.element,
    attack: options.attack,
    ownerMobId: options.ownerMobId ?? null,
    visual,
    velocity: direction.multiplyScalar(speed),
    age: 0,
    lifetime: options.attack === "projectile" ? 3.2 : options.attack === "breath" ? 0.82 : 0.23,
    radius: options.attack === "melee" ? 1.25 + stage * 0.42 : options.attack === "breath" ? 0.62 + stage * 0.18 : 0.28 + stage * 0.055,
    damage: Math.max(0, options.damage),
    status,
    statusSeconds: Math.max(0, Number.isFinite(options.statusSeconds) ? options.statusSeconds! : 1.5 + stage * 0.35),
    hitPlayer: false,
    hitMobIds: new Set<number>(),
  };
}

export function stepDragonAttackEffect(effect: DragonAttackEffect, dt: number) {
  const step = Math.max(0, Math.min(0.1, Number.isFinite(dt) ? dt : 0));
  effect.age += step;
  if (effect.attack !== "melee") effect.visual.position.addScaledVector(effect.velocity, step);
  const progress = Math.min(1, effect.age / effect.lifetime);
  if (effect.attack === "breath") {
    effect.visual.scale.setScalar(0.72 + Math.sin(progress * Math.PI) * 0.58);
    effect.visual.rotateZ(step * (effect.element === "steel" ? 2.2 : 4.4));
    effect.velocity.multiplyScalar(Math.exp(-step * 0.7));
  } else if (effect.attack === "projectile") {
    effect.visual.rotateZ(step * (effect.element === "steel" ? 7.5 : 4.2));
    if (effect.element !== "steel") effect.visual.scale.setScalar(0.9 + Math.sin(effect.age * 18) * 0.1);
  } else {
    effect.visual.rotateY(step * 9);
    effect.visual.scale.setScalar(0.8 + Math.sin(progress * Math.PI) * 0.36);
  }
  effect.visual.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const candidate of materials) {
      if (!(candidate instanceof THREE.MeshLambertMaterial) || !candidate.transparent) continue;
      candidate.opacity = Math.max(0, (effect.attack === "melee" ? 0.38 : 0.78) * (1 - progress ** 2));
    }
  });
  return effect.age >= effect.lifetime;
}

export function dragonEffectHits(effect: DragonAttackEffect, point: THREE.Vector3, extraRadius = 0) {
  const radius = effect.radius + Math.max(0, extraRadius);
  return effect.visual.position.distanceToSquared(point) <= radius * radius;
}

export function disposeDragonAttackEffect(effect: DragonAttackEffect) {
  effect.visual.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const candidate of materials) candidate.dispose();
  });
}
