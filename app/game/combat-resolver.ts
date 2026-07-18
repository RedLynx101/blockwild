import { CREATURE_REACTIONS, type CreatureMoveDefinition, type CreatureReactionId, type CreatureStatusId, type MoveChannel } from "./creature-moves";
import type { CreatureStats } from "./creature-stats";
import { resolveTypedPackets, type CreatureTypeId } from "./creature-types";
import type { MobTemperament } from "./mobs";

export type CombatActorKind = "player" | "creature" | "summon" | "sentient" | "construct" | "boss" | "projectile" | "spell" | "environment";
export type CombatActorRef = Readonly<{ kind: CombatActorKind; id: string | number }>;
export type CombatFactionStanding = "allied" | "neutral" | "unwelcome" | "hostile";
export type FriendlyFireRule = "off" | "party-only" | "on";

export type ActiveCombatStatus = Readonly<{
  id: CreatureStatusId;
  stacks: number;
  expiresAtSeconds: number;
  source: CombatActorRef | null;
  reactionReadyAt?: number;
}>;

export type CombatProfile = Readonly<{
  level: number;
  stats: CreatureStats;
  currentTypes: readonly CreatureTypeId[];
  factionId: string | null;
  ownerId: string | null;
  partyId: string | null;
  temperament: MobTemperament;
  statuses: readonly ActiveCombatStatus[];
  currentHealth: number;
  maximumHealth: number;
  downed?: boolean;
  invulnerable?: boolean;
  storyProtected?: boolean;
}>;

export type CombatActor = Readonly<{
  ref: CombatActorRef;
  profile: CombatProfile;
}>;

export type CombatAuthorityContext = Readonly<{
  isHost: boolean;
  nowSeconds: number;
  eventToken: string;
  friendlyFire: FriendlyFireRule;
  pvpEnabled: boolean;
  factionStanding?: (leftFaction: string, rightFaction: string) => CombatFactionStanding;
}>;

export type CombatRelationship = "self" | "allied" | "neutral" | "unwelcome" | "hostile";
export type CombatIntentKind = "damage" | "heal" | "control" | "capture" | "relocate" | "care" | "training";

export type CombatEffect = Readonly<{
  id: string;
  name: string;
  intent: CombatIntentKind;
  baseAmount: number;
  channel: MoveChannel;
  packets: CreatureMoveDefinition["packets"];
  appliesStatus?: CreatureStatusId;
  statusDurationSeconds?: number;
  modifierSteps?: number;
  signature?: boolean;
  cannotFaint?: boolean;
}>;

export type CombatMutation =
  | Readonly<{ kind: "health"; actor: CombatActorRef; delta: number; resultingHealth: number }>
  | Readonly<{ kind: "status-add"; actor: CombatActorRef; status: ActiveCombatStatus }>
  | Readonly<{ kind: "status-remove"; actor: CombatActorRef; statusId: CreatureStatusId; stacks: number }>
  | Readonly<{ kind: "threat"; actor: CombatActorRef; source: CombatActorRef; amount: number }>
  | Readonly<{ kind: "credit"; actor: CombatActorRef; source: CombatActorRef; amount: number; role: "damage" | "healing" | "control" | "guarding" | "rescue" }>
  | Readonly<{ kind: "reaction-cooldown"; actor: CombatActorRef; reactionId: CreatureReactionId; readyAtSeconds: number }>;

export type CombatEvent = Readonly<{
  token: string;
  attacker: CombatActorRef;
  defender: CombatActorRef;
  relationship: CombatRelationship;
  effectId: string;
  legal: boolean;
  deniedReason: string | null;
  rawAmount: number;
  resolvedAmount: number;
  absorbedAmount: number;
  reaction: CreatureReactionId | null;
  feedback: readonly string[];
  mutations: readonly CombatMutation[];
}>;

const sameRef = (left: CombatActorRef, right: CombatActorRef) => left.kind === right.kind && left.id === right.id;
const actorOwner = (actor: CombatActor) => actor.profile.ownerId ?? (actor.ref.kind === "player" ? String(actor.ref.id) : null);

export function combatRelationship(
  left: CombatActor,
  right: CombatActor,
  context: Pick<CombatAuthorityContext, "factionStanding">,
): CombatRelationship {
  if (sameRef(left.ref, right.ref)) return "self";
  const leftOwner = actorOwner(left);
  const rightOwner = actorOwner(right);
  if (leftOwner && rightOwner && leftOwner === rightOwner) return "allied";
  if (left.profile.partyId && left.profile.partyId === right.profile.partyId) return "allied";
  if (left.profile.factionId && left.profile.factionId === right.profile.factionId) return "allied";
  if (left.profile.factionId && right.profile.factionId && context.factionStanding) return context.factionStanding(left.profile.factionId, right.profile.factionId);
  return "neutral";
}

export function combatIntentIsHostile(intent: CombatIntentKind) {
  return intent === "damage" || intent === "control";
}

export function combatLegality(
  attacker: CombatActor,
  defender: CombatActor,
  effect: CombatEffect,
  context: CombatAuthorityContext,
): Readonly<{ legal: boolean; relationship: CombatRelationship; reason: string | null }> {
  const relationship = combatRelationship(attacker, defender, context);
  if (!context.isHost) return Object.freeze({ legal: false, relationship, reason: "Host authority required." });
  if (!combatIntentIsHostile(effect.intent)) return Object.freeze({ legal: true, relationship, reason: null });
  if (defender.profile.invulnerable) return Object.freeze({ legal: false, relationship, reason: "Target is protected." });
  if (relationship === "self") return Object.freeze({ legal: false, relationship, reason: "Cannot target self with a hostile effect." });
  const playerPair = attacker.ref.kind === "player" && defender.ref.kind === "player";
  if (playerPair && !context.pvpEnabled) return Object.freeze({ legal: false, relationship, reason: "PvP is disabled." });
  if (relationship === "allied") {
    if (context.friendlyFire === "off") return Object.freeze({ legal: false, relationship, reason: "Friendly fire is disabled." });
    if (context.friendlyFire === "party-only" && attacker.profile.partyId && attacker.profile.partyId === defender.profile.partyId) return Object.freeze({ legal: false, relationship, reason: "Party friendly fire is disabled." });
  }
  return Object.freeze({ legal: true, relationship, reason: null });
}

function mitigationFor(profile: CombatProfile, channel: MoveChannel, breach = false) {
  const physical = channel === "physical";
  const magical = channel === "magical" || channel === "healing" || channel === "control";
  const mixed = channel === "mixed";
  const guard = profile.stats.guard * (breach ? 0.45 : 1);
  const ward = profile.stats.ward;
  const defense = mixed ? (guard + ward) * 0.5 : physical ? guard : magical ? ward : 0;
  const guardedStacks = profile.statuses.find((status) => status.id === "guarded")?.stacks ?? 0;
  return Math.min(0.72, defense / (defense + 115) + guardedStacks * 0.06);
}

function activeStatus(profile: CombatProfile, id: CreatureStatusId, nowSeconds: number) {
  return profile.statuses.find((status) => status.id === id && status.expiresAtSeconds > nowSeconds);
}

function matchingReaction(defender: CombatActor, effect: CombatEffect, nowSeconds: number) {
  for (const reaction of CREATURE_REACTIONS) {
    const setup = activeStatus(defender.profile, reaction.setupStatus, nowSeconds);
    if (!setup || (setup.reactionReadyAt ?? 0) > nowSeconds) continue;
    const packetMatches = effect.packets.some((packet) => reaction.followupTypes.includes(packet.type));
    const channelMatches = !reaction.followupChannels?.length || reaction.followupChannels.includes(effect.channel);
    if (packetMatches && channelMatches && (reaction.id !== "concord" || effect.signature)) return { reaction, setup };
  }
  return null;
}

function statusModifierSteps(profile: CombatProfile, effect: CombatEffect, nowSeconds: number) {
  let steps = effect.modifierSteps ?? 0;
  if (activeStatus(profile, "soaked", nowSeconds) && effect.packets.some((packet) => packet.type === "storm")) steps += 1;
  if (activeStatus(profile, "soaked", nowSeconds) && effect.packets.some((packet) => packet.type === "flame")) steps -= 1;
  return steps;
}

export function effectFromMove(move: CreatureMoveDefinition, baseAmount: number): CombatEffect {
  return Object.freeze({
    id: move.id,
    name: move.name,
    intent: move.channel === "healing" ? "heal"
      : move.power > 0 ? "damage"
        : move.target === "self" || move.target === "ally" || move.channel === "stance" || move.channel === "field" ? "care" : "control",
    baseAmount: Math.max(0, baseAmount) * move.power,
    channel: move.channel,
    packets: move.packets,
    appliesStatus: move.appliesStatus,
    statusDurationSeconds: move.statusDurationSeconds,
    signature: move.aiTags.includes("signature"),
  });
}

export function resolveCombatEffect(
  attacker: CombatActor,
  defender: CombatActor,
  effect: CombatEffect,
  context: CombatAuthorityContext,
): CombatEvent {
  const legality = combatLegality(attacker, defender, effect, context);
  if (!legality.legal) return Object.freeze({
    token: context.eventToken, attacker: attacker.ref, defender: defender.ref, relationship: legality.relationship,
    effectId: effect.id, legal: false, deniedReason: legality.reason, rawAmount: effect.baseAmount,
    resolvedAmount: 0, absorbedAmount: 0, reaction: null, feedback: Object.freeze([legality.reason ?? "Effect denied."]), mutations: Object.freeze([]),
  });

  const mutations: CombatMutation[] = [];
  const feedback: string[] = [];
  if (effect.intent === "heal") {
    const healed = Math.min(Math.max(0, effect.baseAmount), Math.max(0, defender.profile.maximumHealth - defender.profile.currentHealth));
    if (healed > 0) {
      mutations.push({ kind: "health", actor: defender.ref, delta: healed, resultingHealth: defender.profile.currentHealth + healed });
      mutations.push({ kind: "credit", actor: defender.ref, source: attacker.ref, amount: healed, role: "healing" });
    }
    return Object.freeze({ token: context.eventToken, attacker: attacker.ref, defender: defender.ref, relationship: legality.relationship, effectId: effect.id,
      legal: true, deniedReason: null, rawAmount: effect.baseAmount, resolvedAmount: healed, absorbedAmount: 0, reaction: null,
      feedback: Object.freeze(healed ? [`Healed ${healed.toFixed(1)}`] : ["Already at full health"]), mutations: Object.freeze(mutations) });
  }

  const modifierSteps = statusModifierSteps(defender.profile, effect, context.nowSeconds);
  const packets = effect.packets.map((packet) => ({ ...packet, modifierSteps: (packet.modifierSteps ?? 0) + modifierSteps }));
  const typed = resolveTypedPackets(effect.baseAmount, packets, attacker.profile.currentTypes, defender.profile.currentTypes);
  const reactionMatch = matchingReaction(defender, effect, context.nowSeconds);
  const breach = reactionMatch?.reaction.id === "breach";
  const mitigation = mitigationFor(defender.profile, effect.channel, breach);
  const reactionMultiplier = reactionMatch?.reaction.id === "shatter" ? 1.08 : 1;
  const unboundedDamage = typed.amount * reactionMultiplier * (1 - mitigation);
  const faintFloor = effect.cannotFaint || defender.profile.storyProtected ? 1 : 0;
  const damage = Math.min(Math.max(0, unboundedDamage), Math.max(0, defender.profile.currentHealth - faintFloor));
  const resultingHealth = Math.max(faintFloor, defender.profile.currentHealth - damage);

  if (damage > 0) {
    mutations.push({ kind: "health", actor: defender.ref, delta: -damage, resultingHealth });
    mutations.push({ kind: "threat", actor: defender.ref, source: attacker.ref, amount: damage });
    mutations.push({ kind: "credit", actor: defender.ref, source: attacker.ref, amount: damage, role: effect.intent === "control" ? "control" : "damage" });
  }
  if (effect.appliesStatus && (effect.statusDurationSeconds ?? 0) > 0) {
    const previous = activeStatus(defender.profile, effect.appliesStatus, context.nowSeconds);
    mutations.push({ kind: "status-add", actor: defender.ref, status: Object.freeze({
      id: effect.appliesStatus,
      stacks: Math.min(3, (previous?.stacks ?? 0) + 1),
      expiresAtSeconds: Math.max(previous?.expiresAtSeconds ?? 0, context.nowSeconds + (effect.statusDurationSeconds ?? 0)),
      source: attacker.ref,
    }) });
  }
  if (reactionMatch) {
    const { reaction, setup } = reactionMatch;
    feedback.push(reaction.name);
    if (reaction.consumesSetup) mutations.push({ kind: "status-remove", actor: defender.ref, statusId: setup.id, stacks: setup.stacks });
    else if (setup.stacks > 1) mutations.push({ kind: "status-remove", actor: defender.ref, statusId: setup.id, stacks: 1 });
    mutations.push({ kind: "reaction-cooldown", actor: defender.ref, reactionId: reaction.id, readyAtSeconds: context.nowSeconds + reaction.cooldownSeconds });
  }
  for (const packet of typed.packets) if (packet.effectiveness.steps !== 0) feedback.push(`${packet.effectiveness.label}: ${packet.packet.type}`);
  feedback.push(`${damage.toFixed(1)} damage`);
  return Object.freeze({
    token: context.eventToken, attacker: attacker.ref, defender: defender.ref, relationship: legality.relationship, effectId: effect.id,
    legal: true, deniedReason: null, rawAmount: effect.baseAmount, resolvedAmount: damage,
    absorbedAmount: Math.max(0, typed.amount * reactionMultiplier - damage), reaction: reactionMatch?.reaction.id ?? null,
    feedback: Object.freeze(feedback), mutations: Object.freeze(mutations),
  });
}

export type ThreatEntry = Readonly<{ source: CombatActorRef; score: number; lastHostileAt: number; lastSeenAt: number }>;

export function updateThreatLedger(
  current: readonly ThreatEntry[],
  source: CombatActorRef,
  delta: number,
  nowSeconds: number,
  maximumEntries = 8,
): readonly ThreatEntry[] {
  const decayed = current
    .map((entry) => ({ ...entry, score: entry.score * Math.pow(0.5, Math.max(0, nowSeconds - entry.lastHostileAt) / 18) }))
    .filter((entry) => entry.score >= 0.08 && nowSeconds - entry.lastSeenAt <= 45);
  const existing = decayed.find((entry) => sameRef(entry.source, source));
  const merged = existing
    ? decayed.map((entry) => sameRef(entry.source, source) ? { ...entry, score: Math.min(10_000, entry.score + Math.max(0, delta)), lastHostileAt: nowSeconds, lastSeenAt: nowSeconds } : entry)
    : [...decayed, { source, score: Math.max(0, delta), lastHostileAt: nowSeconds, lastSeenAt: nowSeconds }];
  return Object.freeze(merged.sort((left, right) => right.score - left.score || String(left.source.id).localeCompare(String(right.source.id))).slice(0, maximumEntries).map((entry) => Object.freeze(entry)));
}

export function selectThreatTarget(entries: readonly ThreatEntry[]) {
  return entries.length ? entries.reduce((best, entry) => entry.score > best.score ? entry : best).source : null;
}
