import * as THREE from "three";
import { applyAppearanceHue, type CreatureAppearance } from "./creature-appearance";
import type { PrimeFormProfile, PrimeVisualMotif } from "./creature-rarity";

type AnimatedPart = THREE.Object3D & { userData: {
  rarityBaseY?: number;
  rarityBaseX?: number;
  rarityBaseZ?: number;
  rarityPhase?: number;
  rarityFloat?: number;
  raritySpin?: number;
  rarityPulse?: number;
  rarityBaseScaleX?: number;
  rarityBaseScaleY?: number;
  rarityBaseScaleZ?: number;
  rarityBaseRotationY?: number;
} };

function material(color: number, options: Readonly<{ transparent?: boolean; opacity?: number; emissive?: number; metalness?: number; roughness?: number }> = {}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissive ? .42 : 0,
    metalness: options.metalness ?? .06,
    roughness: options.roughness ?? .62,
    transparent: options.transparent ?? false,
    opacity: options.opacity ?? 1,
    depthWrite: !(options.transparent ?? false),
    side: THREE.DoubleSide,
  });
}

function mesh(geometry: THREE.BufferGeometry, surface: THREE.Material, name: string) {
  const result = new THREE.Mesh(geometry, surface);
  result.name = name;
  result.castShadow = !surface.transparent;
  result.receiveShadow = !surface.transparent;
  return result;
}

function animate(part: THREE.Object3D, phase: number, options: Readonly<{ float?: number; spin?: number; pulse?: number }> = {}) {
  const animated = part as AnimatedPart;
  animated.userData.rarityBaseX = part.position.x;
  animated.userData.rarityBaseY = part.position.y;
  animated.userData.rarityBaseZ = part.position.z;
  animated.userData.rarityPhase = phase;
  animated.userData.rarityFloat = options.float ?? 0;
  animated.userData.raritySpin = options.spin ?? 0;
  animated.userData.rarityPulse = options.pulse ?? 0;
  animated.userData.rarityBaseScaleX = part.scale.x;
  animated.userData.rarityBaseScaleY = part.scale.y;
  animated.userData.rarityBaseScaleZ = part.scale.z;
  animated.userData.rarityBaseRotationY = part.rotation.y;
  return part;
}

function localBounds(root: THREE.Object3D) {
  root.updateWorldMatrix(true, true);
  const world = new THREE.Box3().setFromObject(root);
  const inverse = root.matrixWorld.clone().invert();
  const local = new THREE.Box3();
  for (const x of [world.min.x, world.max.x]) for (const y of [world.min.y, world.max.y]) for (const z of [world.min.z, world.max.z]) {
    local.expandByPoint(new THREE.Vector3(x, y, z).applyMatrix4(inverse));
  }
  return local;
}

function addPetalFlower(group: THREE.Group, x: number, y: number, z: number, scale: number, surface: THREE.Material, phase: number) {
  const flower = new THREE.Group();
  flower.name = "prime-flower";
  flower.position.set(x, y, z);
  for (let index = 0; index < 5; index += 1) {
    const petal = mesh(new THREE.SphereGeometry(.08 * scale, 8, 6), surface, "prime-petal");
    const angle = index / 5 * Math.PI * 2;
    petal.scale.set(1.45, .48, .72);
    petal.position.set(Math.cos(angle) * .1 * scale, Math.sin(angle) * .1 * scale, 0);
    petal.rotation.z = angle;
    flower.add(petal);
  }
  group.add(animate(flower, phase, { float: .025, spin: .08 }));
}

function addCrystalCrown(group: THREE.Group, y: number, radius: number, accent: number, mirrored = false) {
  const crystalSurface = material(accent, { transparent: true, opacity: .72, emissive: accent, metalness: mirrored ? .68 : .12, roughness: mirrored ? .16 : .28 });
  for (let index = 0; index < 7; index += 1) {
    const angle = index / 7 * Math.PI * 2;
    const crystal = mesh(new THREE.ConeGeometry(.055 + (index % 2) * .018, .24 + (index % 3) * .08, 6), crystalSurface, "prime-crown-crystal");
    crystal.position.set(Math.cos(angle) * radius, y + (index % 2) * .035, Math.sin(angle) * radius);
    crystal.rotation.z = Math.cos(angle) * .22;
    crystal.rotation.x = Math.sin(angle) * .22;
    group.add(animate(crystal, index * .71, { pulse: .055 }));
  }
}

function addPrimeMotif(root: THREE.Object3D, profile: PrimeFormProfile, bounds: THREE.Box3) {
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const width = Math.max(.42, Math.min(1.5, Math.max(size.x, size.z)));
  const height = Math.max(.48, size.y);
  const top = bounds.max.y;
  const bottom = bounds.min.y;
  const group = new THREE.Group();
  group.name = `prime-motif:${profile.motif}`;
  group.userData.primeMotif = profile.motif;
  const accent = material(profile.accent, { emissive: profile.accent, roughness: .42 });
  const pale = material(0xf4f0df, { emissive: profile.accent, roughness: .35 });
  const veil = material(profile.accent, { transparent: true, opacity: .28, emissive: profile.accent, roughness: .18 });
  const dark = material(0x2b2930, { roughness: .76 });
  const stem = material(0x4d7449, { roughness: .82 });
  const upperY = center.y + height * .26;
  const motif: PrimeVisualMotif = profile.motif;

  if (motif === "living-garden") {
    for (let index = 0; index < 4; index += 1) {
      const x = (index - 1.5) * width * .16;
      const stalk = mesh(new THREE.CylinderGeometry(.018, .025, .26 + index % 2 * .08, 7), stem, "prime-garden-stem");
      stalk.position.set(x, top + .08 + index % 2 * .025, center.z - width * .05);
      stalk.rotation.z = (index - 1.5) * .08;
      group.add(stalk);
      addPetalFlower(group, x, top + .23 + index % 2 * .08, center.z - width * .05, .72 + index % 2 * .14, index % 2 ? pale : accent, index * 1.17);
    }
  } else if (motif === "triform-colony") {
    for (let index = 0; index < 3; index += 1) {
      const dome = mesh(new THREE.SphereGeometry(width * (.2 + index * .025), 16, 10, 0, Math.PI * 2, 0, Math.PI * .56), index === 1 ? accent : veil, "prime-colony-dome");
      dome.scale.set(1.05, .72, .92);
      dome.position.set((index - 1) * width * .24, top - height * .08 + index * .035, center.z);
      group.add(animate(dome, index * 2.1, { float: .018, pulse: .035 }));
    }
  } else if (motif === "storm-belly") {
    const cloud = mesh(new THREE.SphereGeometry(width * .28, 18, 12), veil, "prime-storm-cloud");
    cloud.scale.set(1.4, .62, 1);
    cloud.position.set(center.x, bottom + height * .22, center.z);
    group.add(animate(cloud, .4, { float: .045, pulse: .06 }));
    for (let index = 0; index < 2; index += 1) {
      const ring = mesh(new THREE.TorusGeometry(width * (.26 + index * .09), .018, 7, 28), index ? pale : accent, "prime-thunder-ring");
      ring.position.set(center.x, bottom + height * (.18 + index * .1), center.z);
      ring.rotation.x = Math.PI / 2;
      group.add(animate(ring, index * 1.8, { spin: index ? -.22 : .31, pulse: .03 }));
    }
  } else if (motif === "walking-islet") {
    const islet = mesh(new THREE.SphereGeometry(width * .37, 20, 12, 0, Math.PI * 2, 0, Math.PI * .52), stem, "prime-islet-shell");
    islet.scale.set(1.25, .48, .92);
    islet.position.set(center.x, top - height * .08, center.z);
    group.add(islet);
    for (let index = 0; index < 3; index += 1) {
      const trunk = mesh(new THREE.CylinderGeometry(.014, .023, .18, 7), dark, "prime-islet-trunk");
      trunk.position.set(center.x + (index - 1) * width * .18, top + .09, center.z - .02);
      group.add(trunk);
      const canopy = mesh(new THREE.IcosahedronGeometry(.09 + index % 2 * .025, 1), index === 1 ? accent : stem, "prime-islet-canopy");
      canopy.position.copy(trunk.position).add(new THREE.Vector3(0, .12, 0));
      group.add(animate(canopy, index * 1.5, { float: .012 }));
    }
  } else if (motif === "fungal-crown") {
    for (let index = 0; index < 5; index += 1) {
      const angle = index / 5 * Math.PI * 2;
      const stalk = mesh(new THREE.CylinderGeometry(.018, .026, .12 + index % 2 * .05, 7), pale, "prime-fungal-stalk");
      stalk.position.set(center.x + Math.cos(angle) * width * .2, top + .05, center.z + Math.sin(angle) * width * .16);
      group.add(stalk);
      const cap = mesh(new THREE.SphereGeometry(.09 + index % 2 * .025, 12, 7, 0, Math.PI * 2, 0, Math.PI * .55), index === 0 ? dark : accent, "prime-fungal-cap");
      cap.scale.y = .45;
      cap.position.copy(stalk.position).add(new THREE.Vector3(0, .09 + index % 2 * .04, 0));
      group.add(animate(cap, index * .9, { float: .012, pulse: .025 }));
    }
  } else if (motif === "moon-mask") {
    const moon = mesh(new THREE.TorusGeometry(width * .22, width * .055, 8, 34, Math.PI * 1.52), pale, "prime-moon-mask");
    moon.position.set(center.x, upperY, bounds.min.z - .055);
    moon.rotation.z = -.24;
    group.add(animate(moon, .5, { float: .018, spin: .035 }));
    for (let index = 0; index < 3; index += 1) {
      const trail = mesh(new THREE.SphereGeometry(.032, 8, 6), index === 1 ? veil : accent, "prime-false-trail");
      trail.position.set(center.x + (index - 1) * width * .24, bottom + .04, center.z + width * (.28 + index * .11));
      group.add(animate(trail, index * 1.8, { float: .025, pulse: .12 }));
    }
  } else if (motif === "burrow-banner") {
    const pole = mesh(new THREE.CylinderGeometry(.018, .026, height * .62, 8), dark, "prime-burrow-pole");
    pole.position.set(bounds.max.x + width * .08, center.y + height * .18, center.z);
    group.add(pole);
    const banner = mesh(new THREE.PlaneGeometry(width * .34, height * .25, 4, 3), veil, "prime-burrow-banner");
    banner.position.set(pole.position.x, top + .02, center.z + width * .16);
    banner.rotation.y = Math.PI / 2;
    group.add(animate(banner, .8, { float: .018 }));
  } else if (motif === "glass-script") {
    for (let index = 0; index < 4; index += 1) {
      const rune = mesh(new THREE.TorusGeometry(width * (.08 + index * .012), .012, 6, 22, Math.PI * (1.15 + index * .1)), veil, "prime-glass-rune");
      rune.position.set(center.x + (index - 1.5) * width * .17, top + .1 + Math.sin(index) * .05, center.z);
      rune.rotation.set(index * .4, index * .7, index * .52);
      group.add(animate(rune, index * .83, { float: .04, spin: index % 2 ? -.18 : .18 }));
    }
  } else if (motif === "storm-cairn") {
    for (let index = 0; index < 3; index += 1) {
      const stone = mesh(new THREE.DodecahedronGeometry(width * (.1 - index * .015), 0), index === 1 ? pale : dark, "prime-storm-cairn-stone");
      stone.scale.set(1.35, .55, 1);
      stone.position.set(center.x, top + .02 + index * width * .1, center.z);
      stone.rotation.y = index * .72;
      group.add(stone);
    }
    const arc = mesh(new THREE.TorusGeometry(width * .22, .018, 7, 28, Math.PI * 1.45), accent, "prime-storm-arc");
    arc.position.set(center.x, top + width * .35, center.z);
    arc.rotation.z = .3;
    group.add(animate(arc, .1, { float: .025, spin: .08, pulse: .08 }));
  } else if (motif === "safe-descent") {
    for (let index = 0; index < 5; index += 1) {
      const angle = index / 5 * Math.PI * 2;
      const chime = mesh(new THREE.ConeGeometry(.035, .18, 8, 1, true), index % 2 ? pale : accent, "prime-descent-chime");
      chime.position.set(center.x + Math.cos(angle) * width * .3, top + .1 + index % 2 * .06, center.z + Math.sin(angle) * width * .3);
      chime.rotation.z = Math.cos(angle) * .12;
      group.add(animate(chime, index * 1.2, { float: .05, spin: index % 2 ? -.1 : .1 }));
    }
  } else if (motif === "winter-mantle") {
    const mantle = mesh(new THREE.SphereGeometry(width * .46, 24, 14, Math.PI * .08, Math.PI * 1.84, 0, Math.PI * .62), veil, "prime-winter-mantle");
    mantle.scale.set(1.05, .82, .72);
    mantle.position.set(center.x, upperY, center.z + width * .08);
    mantle.rotation.x = -.18;
    group.add(animate(mantle, .4, { float: .012, pulse: .025 }));
    for (let index = 0; index < 4; index += 1) {
      const tuft = mesh(new THREE.SphereGeometry(.055, 9, 7), pale, "prime-winter-tuft");
      tuft.position.set(center.x + (index - 1.5) * width * .15, top - .02, center.z - width * .08);
      tuft.scale.set(1.3, .72, .82);
      group.add(tuft);
    }
  } else if (motif === "mirror-crown") {
    addCrystalCrown(group, top + .1, width * .24, profile.accent, true);
    const halo = mesh(new THREE.TorusGeometry(width * .34, .014, 7, 40), veil, "prime-reflection-halo");
    halo.position.set(center.x, top + .16, center.z);
    halo.rotation.x = Math.PI / 2;
    group.add(animate(halo, .2, { float: .025, spin: .16 }));
  } else if (motif === "reed-court") {
    for (let index = 0; index < 7; index += 1) {
      const angle = index / 7 * Math.PI * 2;
      const reed = mesh(new THREE.CylinderGeometry(.012, .018, height * (.34 + index % 3 * .07), 6), stem, "prime-court-reed");
      reed.position.set(center.x + Math.cos(angle) * width * .27, upperY, center.z + Math.sin(angle) * width * .22);
      reed.rotation.z = Math.cos(angle) * .1;
      group.add(animate(reed, index * .7, { float: .012 }));
      const seed = mesh(new THREE.SphereGeometry(.028, 7, 5), index % 2 ? accent : pale, "prime-court-seed");
      seed.scale.set(.7, 2.1, .7);
      seed.position.copy(reed.position).add(new THREE.Vector3(0, height * (.2 + index % 3 * .035), 0));
      group.add(animate(seed, index * .7, { float: .02 }));
    }
  } else if (motif === "observatory-veil") {
    const dome = mesh(new THREE.SphereGeometry(width * .42, 24, 16), veil, "prime-observatory-veil");
    dome.scale.set(1.12, .74, 1.05);
    dome.position.set(center.x, upperY, center.z);
    group.add(animate(dome, .2, { float: .035, pulse: .045 }));
    for (let index = 0; index < 3; index += 1) {
      const orbit = mesh(new THREE.TorusGeometry(width * (.31 + index * .07), .012, 6, 40), index === 1 ? pale : accent, "prime-observatory-orbit");
      orbit.position.set(center.x, upperY + index * .035, center.z);
      orbit.rotation.set(index * .67, Math.PI / 2 + index * .31, index * .4);
      group.add(animate(orbit, index * 1.4, { float: .025, spin: index % 2 ? -.24 : .2 }));
    }
  } else if (motif === "first-stratum") {
    for (let index = 0; index < 5; index += 1) {
      const plate = mesh(new THREE.CylinderGeometry(width * (.24 - index * .012), width * (.28 - index * .012), .045, 12), index % 2 ? accent : pale, "prime-stratum-plate");
      plate.scale.set(1.4, 1, .75);
      plate.position.set(center.x, upperY - height * .12 + index * .055, center.z + (index - 2) * .012);
      plate.rotation.y = index * .15;
      group.add(plate);
    }
    const fossilRing = mesh(new THREE.TorusGeometry(width * .22, .018, 7, 32), dark, "prime-fossil-ring");
    fossilRing.position.set(center.x, top + .04, center.z);
    fossilRing.rotation.x = Math.PI / 2;
    group.add(animate(fossilRing, .3, { spin: .07 }));
  }
  root.add(group);
  return group;
}

/** Applies stable phenotype, restrained shiny treatment, and any authored Prime silhouette once per visual. */
export function applyCreatureRarityVisual(root: THREE.Object3D, appearance: CreatureAppearance, prime: PrimeFormProfile | null) {
  if (root.userData.creatureRarityApplied) return;
  root.userData.creatureRarityApplied = true;
  root.userData.creatureRarityForm = appearance.rarityForm;
  root.userData.creatureShiny = appearance.shiny;
  const materialClones = new Map<THREE.Material, THREE.Material>();
  let colorIndex = 0;
  root.traverse((object) => {
    const target = object as THREE.Mesh;
    if (!target.isMesh || !target.material) return;
    const sources = Array.isArray(target.material) ? target.material : [target.material];
    const resolved = sources.map((source) => {
      let clone = materialClones.get(source);
      if (!clone) {
        clone = source.clone();
        const colored = clone as THREE.MeshStandardMaterial;
        if (colored.color?.isColor) {
          const role = colorIndex++;
          colored.color.setHex(applyAppearanceHue(colored.color.getHex(), appearance, role % 3 === appearance.accentVariant % 3));
          if ((appearance.markingMask & (1 << role % 4)) !== 0) {
            colored.color.lerp(new THREE.Color(appearance.shiny ? 0xffe8a3 : appearance.hueShift >= 0 ? 0xd4edc8 : 0xd3c7e8), appearance.markingIntensity * .2);
          }
        }
        if (appearance.shiny && colored.emissive?.isColor) {
          colored.emissive.setHex(colorIndex % 3 === 0 ? 0x746731 : 0x355b64);
          colored.emissiveIntensity = Math.max(colored.emissiveIntensity ?? 0, .16);
          colored.metalness = Math.max(colored.metalness ?? 0, .18);
          colored.roughness = Math.min(colored.roughness ?? 1, .62);
        }
        materialClones.set(source, clone);
      }
      return clone;
    });
    target.material = Array.isArray(target.material) ? resolved : resolved[0];
  });

  const bounds = localBounds(root);
  if (appearance.shiny) {
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    const glints = new THREE.Group();
    glints.name = "shiny-inspection-glints";
    const glintSurface = material(0xffedaf, { transparent: true, opacity: .66, emissive: 0xffdc76, metalness: .18, roughness: .18 });
    for (let index = 0; index < 3; index += 1) {
      const glint = mesh(new THREE.OctahedronGeometry(Math.max(.025, Math.min(size.x, size.y, size.z) * .035), 0), glintSurface, "shiny-glint");
      glint.position.set(center.x + (index - 1) * Math.max(.16, size.x * .34), bounds.max.y + .05 + index % 2 * .1, center.z + (index % 2 ? size.z * .2 : -size.z * .15));
      glints.add(animate(glint, index * 2.1, { float: .05, spin: .34, pulse: .18 }));
    }
    root.add(glints);
    root.userData.rarityGlints = glints;
  }
  if (prime) addPrimeMotif(root, prime, bounds);
  const animated: AnimatedPart[] = [];
  root.traverse((object) => { if (Number.isFinite(object.userData.rarityPhase)) animated.push(object as AnimatedPart); });
  root.userData.rarityAnimatedParts = animated;
  root.userData.rarityShimmerUntil = 3.5;
}

/** Rare-only secondary motion; ordinary creatures incur one name lookup and return. */
export function updateCreatureRarityVisual(root: THREE.Object3D, elapsedSeconds: number, reducedMotion = false) {
  if (!root.userData.creatureShiny && root.userData.creatureRarityForm !== "prime") return;
  const motionScale = reducedMotion ? 0 : 1;
  const glints = root.userData.rarityGlints as THREE.Object3D | undefined;
  if (glints) glints.visible = !reducedMotion && elapsedSeconds <= (Number(root.userData.rarityShimmerUntil) || 0);
  const animated = Array.isArray(root.userData.rarityAnimatedParts) ? root.userData.rarityAnimatedParts as AnimatedPart[] : [];
  for (const part of animated) {
    const phase = Number(part.userData.rarityPhase);
    if (!Number.isFinite(phase)) continue;
    const float = Number(part.userData.rarityFloat) || 0;
    const spin = Number(part.userData.raritySpin) || 0;
    const pulse = Number(part.userData.rarityPulse) || 0;
    part.position.x = Number(part.userData.rarityBaseX) || 0;
    part.position.y = (Number(part.userData.rarityBaseY) || 0) + Math.sin(elapsedSeconds * 1.6 + phase) * float * motionScale;
    part.position.z = Number(part.userData.rarityBaseZ) || 0;
    part.rotation.y = (Number(part.userData.rarityBaseRotationY) || 0) + elapsedSeconds * spin * motionScale;
    if (pulse) {
      const factor = 1 + Math.sin(elapsedSeconds * 2.1 + phase) * pulse * motionScale;
      part.scale.set(
        (Number(part.userData.rarityBaseScaleX) || 1) * factor,
        (Number(part.userData.rarityBaseScaleY) || 1) * factor,
        (Number(part.userData.rarityBaseScaleZ) || 1) * factor,
      );
    }
  }
}

export function triggerCreatureInspectionShimmer(root: THREE.Object3D, elapsedSeconds: number) {
  if (!root.userData.creatureShiny) return;
  root.userData.rarityShimmerUntil = elapsedSeconds + 3.5;
}
