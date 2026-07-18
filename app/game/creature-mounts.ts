import type { BondTier } from "./creature-progression";

export type MountCapability = "land" | "swim" | "fly" | "glide" | "climb";
export type MountMode = MountCapability | "transition";

export type MountProfile = Readonly<{
  capabilities: readonly MountCapability[];
  minimumBondTier: BondTier;
  minimumLifeStage: string | null;
  saddleKind: string | null;
  seats: 1 | 2;
  landSpeed: number;
  waterSpeed: number;
  airSpeed: number;
  acceleration: number;
  turnRate: number;
  jumpStrength: number;
  ascentRate: number;
  descentRate: number;
  cargoSlots: number;
  mountedMoveSlots: number;
  passengerRangedWeapons: boolean;
  riderBreathing: "none" | "water" | "air-and-water";
  exertionCapacity: number;
}>;

const profile = (value: MountProfile): MountProfile => Object.freeze({ ...value, capabilities: Object.freeze([...value.capabilities]) });
const land = (speed: number, overrides: Partial<MountProfile> = {}) => profile({
  capabilities: ["land"], minimumBondTier: "trusted", minimumLifeStage: "adult", saddleKind: "trail",
  seats: 1, landSpeed: speed, waterSpeed: 0.75, airSpeed: 0, acceleration: 6.8, turnRate: 2.25,
  jumpStrength: 7, ascentRate: 0, descentRate: 0, cargoSlots: 0, mountedMoveSlots: 2,
  passengerRangedWeapons: false, riderBreathing: "none", exertionCapacity: 100, ...overrides,
});

/** Data covers current mounts and authored future mount sheets; species code never decides media ad hoc. */
export const MOUNT_PROFILES: Readonly<Record<string, MountProfile>> = Object.freeze({
  "wild-horse": land(7.1, { acceleration: 7.6, turnRate: 2.35, mountedMoveSlots: 2 }),
  "rimehoof-courser": land(6.8, { capabilities: ["land", "climb"], turnRate: 2.15, jumpStrength: 7.8 }),
  "sunscar-courser": land(7.7, { acceleration: 8.4, waterSpeed: 0.5, exertionCapacity: 92 }),
  "mirestride-courser": land(6.1, { capabilities: ["land", "swim"], waterSpeed: 4.1, riderBreathing: "water" }),
  "starbough-courser": land(7.2, { capabilities: ["land", "glide"], airSpeed: 3.8, descentRate: 1.8 }),
  "deepgear-courser-golem": land(7.0, { minimumBondTier: "familiar", minimumLifeStage: null, saddleKind: "deepgear-tack", waterSpeed: 0.45, exertionCapacity: 120 }),
  warg: land(6.8, { acceleration: 8.1, turnRate: 2.65, cargoSlots: 0, mountedMoveSlots: 3 }),
  reedstrider: land(5.1, { capabilities: ["land", "swim"], waterSpeed: 6.7, turnRate: 2.7, jumpStrength: 8.2, riderBreathing: "water" }),
  shadecrawler: land(5.8, { minimumBondTier: "partnered", saddleKind: "nocturne", capabilities: ["land", "climb"], turnRate: 2.8, jumpStrength: 8.5 }),
  taffalo: land(4.9, { acceleration: 4.8, turnRate: 1.8, cargoSlots: 3, mountedMoveSlots: 1 }),
  "reefglide-terrapin": land(2.1, { capabilities: ["land", "swim"], minimumBondTier: "partnered", saddleKind: "broad-shell", waterSpeed: 3.1, cargoSlots: 2, turnRate: 1.35 }),
  "worldshell-leviathan": profile({ capabilities: ["land", "swim"], minimumBondTier: "partnered", minimumLifeStage: "adult", saddleKind: "leviathan", seats: 2, landSpeed: .22, waterSpeed: 4.2, airSpeed: 0, acceleration: 2.2, turnRate: 1.05, jumpStrength: 0, ascentRate: 2, descentRate: 2.4, cargoSlots: 162, mountedMoveSlots: 2, passengerRangedWeapons: true, riderBreathing: "water", exertionCapacity: 140 }),
  "aetherbell-leviathan": profile({ capabilities: ["swim", "fly"], minimumBondTier: "partnered", minimumLifeStage: "adult", saddleKind: "leviathan", seats: 2, landSpeed: 0, waterSpeed: 4.8, airSpeed: 6.3, acceleration: 3.3, turnRate: 1.25, jumpStrength: 0, ascentRate: 3.5, descentRate: 3.8, cargoSlots: 27, mountedMoveSlots: 3, passengerRangedWeapons: true, riderBreathing: "air-and-water", exertionCapacity: 145 }),
  "fire-dragon": profile({ capabilities: ["land", "fly"], minimumBondTier: "partnered", minimumLifeStage: "stage-3", saddleKind: "dragon", seats: 1, landSpeed: 5.4, waterSpeed: .5, airSpeed: 9.7, acceleration: 5, turnRate: 1.9, jumpStrength: 8, ascentRate: 5.4, descentRate: 6.2, cargoSlots: 54, mountedMoveSlots: 3, passengerRangedWeapons: false, riderBreathing: "none", exertionCapacity: 170 }),
  "ice-dragon": profile({ capabilities: ["land", "fly", "climb"], minimumBondTier: "partnered", minimumLifeStage: "stage-3", saddleKind: "dragon", seats: 1, landSpeed: 5, waterSpeed: 1.1, airSpeed: 9.1, acceleration: 4.5, turnRate: 1.8, jumpStrength: 8, ascentRate: 5, descentRate: 5.8, cargoSlots: 54, mountedMoveSlots: 3, passengerRangedWeapons: false, riderBreathing: "none", exertionCapacity: 180 }),
  "steel-dragon": profile({ capabilities: ["land", "fly"], minimumBondTier: "partnered", minimumLifeStage: "stage-3", saddleKind: "dragon", seats: 2, landSpeed: 4.8, waterSpeed: .45, airSpeed: 8.2, acceleration: 3.8, turnRate: 1.55, jumpStrength: 7, ascentRate: 4.2, descentRate: 5.1, cargoSlots: 81, mountedMoveSlots: 3, passengerRangedWeapons: true, riderBreathing: "none", exertionCapacity: 210 }),
  "sea-dragon": profile({ capabilities: ["land", "swim", "fly"], minimumBondTier: "partnered", minimumLifeStage: "stage-3", saddleKind: "dragon", seats: 2, landSpeed: 4.6, waterSpeed: 8.5, airSpeed: 8.6, acceleration: 4.7, turnRate: 2.05, jumpStrength: 7, ascentRate: 4.8, descentRate: 5.4, cargoSlots: 54, mountedMoveSlots: 3, passengerRangedWeapons: true, riderBreathing: "water", exertionCapacity: 185 }),
  "gold-dragon": profile({ capabilities: ["land", "fly"], minimumBondTier: "partnered", minimumLifeStage: "stage-3", saddleKind: "dragon", seats: 2, landSpeed: 5.2, waterSpeed: .8, airSpeed: 9.4, acceleration: 4.8, turnRate: 1.9, jumpStrength: 8, ascentRate: 5.2, descentRate: 5.8, cargoSlots: 81, mountedMoveSlots: 3, passengerRangedWeapons: true, riderBreathing: "none", exertionCapacity: 195 }),
  "silver-dragon": profile({ capabilities: ["land", "fly", "glide"], minimumBondTier: "partnered", minimumLifeStage: "stage-3", saddleKind: "dragon", seats: 2, landSpeed: 5, waterSpeed: .9, airSpeed: 9.6, acceleration: 5.1, turnRate: 2.05, jumpStrength: 8, ascentRate: 5.3, descentRate: 5.7, cargoSlots: 81, mountedMoveSlots: 3, passengerRangedWeapons: true, riderBreathing: "none", exertionCapacity: 190 }),
  "stormcrest-ibex": land(6.2, { capabilities: ["land", "climb"], minimumBondTier: "partnered", turnRate: 2.7, jumpStrength: 9 }),
  "stormglass-roclet": land(4.2, { capabilities: ["land", "fly"], minimumBondTier: "partnered", minimumLifeStage: "level-30", saddleKind: "roc-harness", airSpeed: 8.4, ascentRate: 4.7, descentRate: 5.5, mountedMoveSlots: 3 }),
  "wreckwhistle-porpoise": profile({ capabilities: ["swim"], minimumBondTier: "partnered", minimumLifeStage: "adult", saddleKind: "tide-harness", seats: 1, landSpeed: 0, waterSpeed: 8.1, airSpeed: 0, acceleration: 7, turnRate: 2.8, jumpStrength: 0, ascentRate: 3.7, descentRate: 4.2, cargoSlots: 0, mountedMoveSlots: 2, passengerRangedWeapons: false, riderBreathing: "water", exertionCapacity: 110 }),
  "voidmantle-ray": profile({ capabilities: ["glide"], minimumBondTier: "partnered", minimumLifeStage: "adult", saddleKind: "mantle-harness", seats: 1, landSpeed: 0, waterSpeed: 1.2, airSpeed: 6.2, acceleration: 3.1, turnRate: 1.65, jumpStrength: 0, ascentRate: .35, descentRate: 1.7, cargoSlots: 0, mountedMoveSlots: 2, passengerRangedWeapons: false, riderBreathing: "none", exertionCapacity: 115 }),
  thalassene: profile({ capabilities: ["swim"], minimumBondTier: "partnered", minimumLifeStage: "adult", saddleKind: "living-reef", seats: 2, landSpeed: 0, waterSpeed: 5.1, airSpeed: 0, acceleration: 1.9, turnRate: .8, jumpStrength: 0, ascentRate: 2.2, descentRate: 2.6, cargoSlots: 108, mountedMoveSlots: 2, passengerRangedWeapons: true, riderBreathing: "water", exertionCapacity: 220 }),
  "ilyr-virebloom": profile({ capabilities: ["land", "swim"], minimumBondTier: "partnered", minimumLifeStage: "adult", saddleKind: "sanctuary-harness", seats: 2, landSpeed: 6.1, waterSpeed: 4.8, airSpeed: 0, acceleration: 3.8, turnRate: 1.45, jumpStrength: 6.5, ascentRate: 2.1, descentRate: 2.4, cargoSlots: 27, mountedMoveSlots: 2, passengerRangedWeapons: true, riderBreathing: "water", exertionCapacity: 205 }),
  "varkesh-stormmane": land(5.4, { capabilities: ["land", "fly"], minimumBondTier: "partnered", saddleKind: "storm-pact", seats: 2, airSpeed: 10.2, ascentRate: 6, descentRate: 6.8, mountedMoveSlots: 3, passengerRangedWeapons: true, exertionCapacity: 190 }),
  kharza: land(7.4, { minimumBondTier: "partnered", saddleKind: "freed-banner-harness", turnRate: 2.5, mountedMoveSlots: 3, exertionCapacity: 180 }),
  "glasswake-stag": land(6.5, { capabilities: ["land", "swim", "fly"], minimumBondTier: "trusted", saddleKind: null, waterSpeed: 6.5, airSpeed: 7.2, ascentRate: 3.8, descentRate: 4.4, mountedMoveSlots: 2 }),
});

export type MountEnvironment = Readonly<{
  inWater: boolean;
  grounded: boolean;
  steepSurface: boolean;
  openAirVolume: boolean;
  requestedAscent: boolean;
}>;

const BOND_RANK: Readonly<Record<BondTier, number>> = Object.freeze({ wary: 0, familiar: 1, trusted: 2, partnered: 3, kindred: 4 });

export type MountEligibilityInput = Readonly<{
  bondTier: BondTier;
  level: number;
  lifeStage: string | null;
  baby: boolean;
  tamed: boolean;
  owned: boolean;
  saddleFitted: boolean;
}>;

export type MountEligibility = Readonly<{ allowed: boolean; reason: "ready" | "not-owned" | "not-bonded" | "too-young" | "needs-saddle" }>;

export function evaluateMountEligibility(profile: MountProfile, input: MountEligibilityInput): MountEligibility {
  if (!input.tamed || !input.owned) return Object.freeze({ allowed: false, reason: "not-owned" });
  if (BOND_RANK[input.bondTier] < BOND_RANK[profile.minimumBondTier]) return Object.freeze({ allowed: false, reason: "not-bonded" });
  if (input.baby) return Object.freeze({ allowed: false, reason: "too-young" });
  const stage = profile.minimumLifeStage;
  const oldEnough = stage === null ? true : stage === "adult" ? true
    : stage === "level-30" ? input.level >= 30
      : stage.startsWith("stage-") ? Number(input.lifeStage?.replace("stage-", "")) >= Number(stage.replace("stage-", ""))
        : input.lifeStage === stage;
  if (!oldEnough) return Object.freeze({ allowed: false, reason: "too-young" });
  if (profile.saddleKind !== null && !input.saddleFitted) return Object.freeze({ allowed: false, reason: "needs-saddle" });
  return Object.freeze({ allowed: true, reason: "ready" });
}

export function selectMountMode(profile: MountProfile, environment: MountEnvironment): MountMode | null {
  const supports = (capability: MountCapability) => profile.capabilities.includes(capability);
  if (environment.inWater && supports("swim")) return "swim";
  if (environment.steepSurface && supports("climb")) return "climb";
  if (!environment.grounded && environment.openAirVolume) {
    if (supports("fly") && environment.requestedAscent) return "fly";
    if (supports("glide")) return "glide";
    if (supports("fly")) return "fly";
  }
  if (environment.grounded && supports("land")) return "land";
  if (environment.openAirVolume && environment.requestedAscent && supports("fly")) return "fly";
  return null;
}

export type MountExertionState = Readonly<{ current: number; capacity: number; recoveryDelay: number }>;

export function createMountExertion(profile: MountProfile): MountExertionState {
  return Object.freeze({ current: profile.exertionCapacity, capacity: profile.exertionCapacity, recoveryDelay: 0 });
}

export function stepMountExertion(state: MountExertionState, input: Readonly<{ dt: number; sprinting: boolean; ascending: boolean; charge: boolean; recoveryBonus?: number }>) {
  const dt = Math.max(0, Math.min(.25, input.dt));
  const drainPerSecond = (input.sprinting ? 8 : 0) + (input.ascending ? 7 : 0) + (input.charge ? 18 : 0);
  const draining = drainPerSecond > 0;
  const recoveryDelay = draining ? 1.25 : Math.max(0, state.recoveryDelay - dt);
  const recovery = recoveryDelay <= 0 ? (5.5 + Math.max(0, input.recoveryBonus ?? 0)) * dt : 0;
  const current = Math.max(0, Math.min(state.capacity, state.current - drainPerSecond * dt + recovery));
  return Object.freeze({ current, capacity: state.capacity, recoveryDelay });
}

export function exertionSpeedScale(state: MountExertionState, sprinting: boolean) {
  if (!sprinting) return 1;
  const ratio = state.capacity <= 0 ? 0 : state.current / state.capacity;
  return ratio <= .08 ? 1 : 1.18 + Math.min(.17, ratio * .17);
}

export type SweptMountProbe = Readonly<{ x: number; y: number; z: number; radius: number; height: number }>;

/** Samples a bounded swept volume for takeoff, shore, ceiling, landing, and dismount validation. */
export function validateMountTransition(from: SweptMountProbe, to: SweptMountProbe, isClear: (x: number, y: number, z: number, radius: number, height: number) => boolean) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y, to.z - from.z);
  const steps = Math.max(1, Math.min(12, Math.ceil(distance / Math.max(.35, Math.min(from.radius, to.radius)))));
  for (let step = 1; step <= steps; step += 1) {
    const t = step / steps;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    const z = from.z + (to.z - from.z) * t;
    const radius = from.radius + (to.radius - from.radius) * t;
    const height = from.height + (to.height - from.height) * t;
    if (!isClear(x, y, z, radius, height)) return Object.freeze({ clear: false, blockedAt: Object.freeze({ x, y, z }) });
  }
  return Object.freeze({ clear: true, blockedAt: null });
}
