export type ShieldKind = "wildwood-shield" | "sunmetal-shield";
export type ShieldProfile = Readonly<{
  kind: ShieldKind;
  blockFraction: number;
  frontalArcDegrees: number;
  durabilityPerDamage: number;
  movementMultiplier: number;
  maxDurability: number;
}>;

export const SHIELD_PROFILES: Readonly<Record<ShieldKind, ShieldProfile>> = Object.freeze({
  "wildwood-shield": { kind: "wildwood-shield", blockFraction: 0.68, frontalArcDegrees: 110, durabilityPerDamage: 1.15, movementMultiplier: 0.72, maxDurability: 168 },
  "sunmetal-shield": { kind: "sunmetal-shield", blockFraction: 0.84, frontalArcDegrees: 125, durabilityPerDamage: 0.82, movementMultiplier: 0.76, maxDurability: 472 },
});

export type ShieldHitInput = Readonly<{
  kind: ShieldKind;
  raised: boolean;
  durability: number;
  incomingDamage: number;
  /** Normalized world-space direction from defender toward the attacker. */
  attackerDirection: Readonly<{ x: number; z: number }>;
  /** Engine yaw in radians; zero faces north (-Z). */
  defenderYaw: number;
}>;

export type ShieldHitResult = Readonly<{
  blocked: boolean;
  damage: number;
  absorbed: number;
  durability: number;
  broken: boolean;
}>;

export function shieldFacesAttacker(input: Pick<ShieldHitInput, "kind" | "attackerDirection" | "defenderYaw">) {
  const profile = SHIELD_PROFILES[input.kind];
  const length = Math.hypot(input.attackerDirection.x, input.attackerDirection.z);
  if (length <= 0.0001) return true;
  const forwardX = -Math.sin(input.defenderYaw);
  const forwardZ = -Math.cos(input.defenderYaw);
  const dot = (input.attackerDirection.x / length) * forwardX + (input.attackerDirection.z / length) * forwardZ;
  return dot >= Math.cos(profile.frontalArcDegrees * Math.PI / 360);
}

export function resolveShieldHit(input: ShieldHitInput): ShieldHitResult {
  const incoming = Math.max(0, input.incomingDamage);
  const durability = Math.max(0, Math.floor(input.durability));
  if (!input.raised || durability <= 0 || !shieldFacesAttacker(input)) return { blocked: false, damage: incoming, absorbed: 0, durability, broken: durability <= 0 };
  const profile = SHIELD_PROFILES[input.kind];
  const absorbed = Math.min(incoming, incoming * profile.blockFraction);
  const spent = Math.max(1, Math.ceil(absorbed * profile.durabilityPerDamage));
  const nextDurability = Math.max(0, durability - spent);
  return {
    blocked: true,
    damage: Math.max(0, incoming - absorbed),
    absorbed,
    durability: nextDurability,
    broken: nextDurability <= 0,
  };
}

/** Interaction targets always win; shield use is deliberately last-priority right click. */
export function shouldRaiseOffhandShield(input: Readonly<{ hasShield: boolean; primaryInteractionHandled: boolean; rightHeld: boolean }>) {
  return input.hasShield && input.rightHeld && !input.primaryInteractionHandled;
}
