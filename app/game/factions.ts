/**
 * Pure, save-friendly faction rules for Hearthroads.
 *
 * The host owns every authoritative state. Mutations carry an expected revision
 * and an event id, which makes reconnect/retry traffic idempotent without an
 * unbounded command log.
 */

export const FACTION_IDS = ["player", "hobbits", "goblins"] as const;

export type FactionId = (typeof FACTION_IDS)[number];
export type FactionRace = "wayfarer" | "hearthkin" | "goblin";
export type DiplomacyStance = "allied" | "neutral" | "war";
export type FactionStanding = "revered" | "friendly" | "neutral" | "unwelcome" | "hostile";

export type FactionDefinition = Readonly<{
  id: FactionId;
  name: string;
  race: FactionRace;
  sentient: true;
  homeBiomes: readonly string[];
  warriorWeapons: readonly string[];
  values: readonly string[];
}>;

export const FACTIONS: Readonly<Record<FactionId, FactionDefinition>> = {
  player: {
    id: "player",
    name: "Wayfarers",
    race: "wayfarer",
    sentient: true,
    homeBiomes: [],
    warriorWeapons: [],
    values: ["self-determination", "building", "exploration"],
  },
  hobbits: {
    id: "hobbits",
    name: "Hearthkin Freeholds",
    race: "hearthkin",
    sentient: true,
    homeBiomes: ["forest", "meadow", "flower-meadow", "wildwood", "river-valley"],
    warriorWeapons: ["hearth-hammer", "crossbow", "fine-crossbow"],
    values: ["hospitality", "harvest", "trade"],
  },
  goblins: {
    id: "goblins",
    name: "Brassroot Clans",
    race: "goblin",
    sentient: true,
    homeBiomes: ["highlands", "badlands", "cloudreed-glen", "rocky-forest"],
    warriorWeapons: ["goblin-spear", "tempered-spear"],
    values: ["craft", "clever bargains", "clan strength"],
  },
};

export type AuthorityCommand = Readonly<{
  authorityId: string;
  expectedRevision: number;
  eventId: string;
}>;

export type AuthorityStampedState = Readonly<{
  authorityId: string;
  revision: number;
  recentEventIds: readonly string[];
}>;

export type AuthorityCheck = "ok" | "duplicate" | "forbidden" | "stale" | "invalid-event";

export const AUTHORITY_EVENT_LEDGER_LIMIT = 64;

export function checkAuthority(state: AuthorityStampedState, command: AuthorityCommand): AuthorityCheck {
  if (!command.eventId.trim()) return "invalid-event";
  if (command.authorityId !== state.authorityId) return "forbidden";
  if (state.recentEventIds.includes(command.eventId)) return "duplicate";
  if (command.expectedRevision !== state.revision) return "stale";
  return "ok";
}

/** Stamp a mutation after `checkAuthority` returns `ok`. */
export function stampAuthority<T extends AuthorityStampedState>(state: T, command: AuthorityCommand): T {
  return {
    ...state,
    revision: state.revision + 1,
    recentEventIds: [...state.recentEventIds, command.eventId].slice(-AUTHORITY_EVENT_LEDGER_LIMIT),
  };
}

export type FactionRelationKey = "goblins|hobbits" | "goblins|player" | "hobbits|player";

export type FactionRelationsState = AuthorityStampedState & Readonly<{
  schema: 1;
  alignments: Readonly<Record<FactionId, number>>;
  diplomacy: Readonly<Record<FactionRelationKey, DiplomacyStance>>;
}>;

export type FactionMutationResult = Readonly<{
  state: FactionRelationsState;
  applied: boolean;
  reason: AuthorityCheck;
}>;

export function factionRelationKey(a: FactionId, b: FactionId): FactionRelationKey | null {
  if (a === b) return null;
  return [a, b].sort().join("|") as FactionRelationKey;
}

export function createFactionRelations(authorityId: string): FactionRelationsState {
  return {
    schema: 1,
    authorityId,
    revision: 0,
    recentEventIds: [],
    alignments: { player: 100, hobbits: 0, goblins: 0 },
    diplomacy: {
      "goblins|hobbits": "neutral",
      "goblins|player": "neutral",
      "hobbits|player": "neutral",
    },
  };
}

export function clampAlignment(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-100, Math.min(100, Math.round(value)));
}

export function factionStanding(alignment: number): FactionStanding {
  if (alignment >= 75) return "revered";
  if (alignment >= 25) return "friendly";
  if (alignment > -20) return "neutral";
  if (alignment > -50) return "unwelcome";
  return "hostile";
}

export function alignmentFor(state: FactionRelationsState, faction: FactionId) {
  return state.alignments[faction];
}

export function diplomacyBetween(state: FactionRelationsState, a: FactionId, b: FactionId): DiplomacyStance {
  const key = factionRelationKey(a, b);
  return key ? state.diplomacy[key] : "allied";
}

export function factionsAreHostile(state: FactionRelationsState, a: FactionId, b: FactionId) {
  if (a === b) return false;
  if (diplomacyBetween(state, a, b) === "war") return true;
  if (a === "player") return state.alignments[b] <= -50;
  if (b === "player") return state.alignments[a] <= -50;
  return false;
}

export function applyAlignmentChange(
  state: FactionRelationsState,
  faction: Exclude<FactionId, "player">,
  amount: number,
  command: AuthorityCommand,
): FactionMutationResult {
  const reason = checkAuthority(state, command);
  if (reason !== "ok") return { state, applied: false, reason };
  const next: FactionRelationsState = {
    ...state,
    alignments: {
      ...state.alignments,
      [faction]: clampAlignment(state.alignments[faction] + amount),
    },
  };
  return { state: stampAuthority(next, command), applied: true, reason: "ok" };
}

export type FactionMemberRole =
  | "civilian"
  | "farmer"
  | "miner"
  | "merchant"
  | "brewer"
  | "banker"
  | "warrior"
  | "mayor"
  | "aligned-beast";

export const FACTION_KILL_PENALTIES: Readonly<Record<FactionMemberRole, number>> = {
  civilian: -18,
  farmer: -18,
  miner: -18,
  merchant: -22,
  brewer: -20,
  banker: -24,
  warrior: -12,
  mayor: -35,
  "aligned-beast": -8,
};

export function applyFactionMemberKill(
  state: FactionRelationsState,
  faction: Exclude<FactionId, "player">,
  role: FactionMemberRole,
  command: AuthorityCommand,
) {
  return applyAlignmentChange(state, faction, FACTION_KILL_PENALTIES[role], command);
}

export function applyQuestAlignmentReward(
  state: FactionRelationsState,
  faction: Exclude<FactionId, "player">,
  reward: number,
  command: AuthorityCommand,
) {
  return applyAlignmentChange(state, faction, Math.max(0, Math.min(30, Math.round(reward))), command);
}

export function setDiplomacy(
  state: FactionRelationsState,
  a: FactionId,
  b: FactionId,
  stance: DiplomacyStance,
  command: AuthorityCommand,
): FactionMutationResult {
  const key = factionRelationKey(a, b);
  const reason = checkAuthority(state, command);
  if (!key || reason !== "ok") return { state, applied: false, reason: key ? reason : "invalid-event" };
  const next: FactionRelationsState = { ...state, diplomacy: { ...state.diplomacy, [key]: stance } };
  return { state: stampAuthority(next, command), applied: true, reason: "ok" };
}

export type TownCaptureRequest = Readonly<{
  townId: string;
  currentOwner: FactionId;
  claimant: FactionId;
  livingWarriors: number;
  livingMayor: boolean;
  mayorThreatened: boolean;
  claimantPresent: boolean;
}>;

export type TownCaptureReceipt = Readonly<{
  schema: 1;
  id: string;
  townId: string;
  from: FactionId;
  to: FactionId;
  transferNonWarriors: boolean;
  alignmentPenalty: number;
  diplomacyAfter: "war";
}>;

export type TownCaptureDecision = Readonly<{
  allowed: boolean;
  reason: "ready" | "same-owner" | "claimant-absent" | "warriors-remain" | "mayor-missing" | "mayor-not-threatened" | "not-at-war";
  receipt: TownCaptureReceipt | null;
}>;

function smallStableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Player seizures deliberately require the mayor to survive and yield. AI
 * factions may only capture while formally at war, preserving a diplomacy hook
 * for later raids rather than allowing incidental ownership flips.
 */
export function evaluateTownCapture(state: FactionRelationsState, request: TownCaptureRequest): TownCaptureDecision {
  if (request.claimant === request.currentOwner) return { allowed: false, reason: "same-owner", receipt: null };
  if (!request.claimantPresent) return { allowed: false, reason: "claimant-absent", receipt: null };
  if (request.livingWarriors > 0) return { allowed: false, reason: "warriors-remain", receipt: null };
  if (!request.livingMayor) return { allowed: false, reason: "mayor-missing", receipt: null };
  if (!request.mayorThreatened) return { allowed: false, reason: "mayor-not-threatened", receipt: null };
  if (request.claimant !== "player" && diplomacyBetween(state, request.currentOwner, request.claimant) !== "war") {
    return { allowed: false, reason: "not-at-war", receipt: null };
  }
  const id = `capture-${smallStableHash(`${request.townId}|${request.currentOwner}|${request.claimant}|${state.revision}`)}`;
  return {
    allowed: true,
    reason: "ready",
    receipt: {
      schema: 1,
      id,
      townId: request.townId,
      from: request.currentOwner,
      to: request.claimant,
      transferNonWarriors: request.claimant === "player",
      alignmentPenalty: request.claimant === "player" ? -70 : 0,
      diplomacyAfter: "war",
    },
  };
}

export function applyTownCaptureConsequences(
  state: FactionRelationsState,
  receipt: TownCaptureReceipt,
  command: AuthorityCommand,
): FactionMutationResult {
  const reason = checkAuthority(state, command);
  if (reason !== "ok" || command.eventId !== receipt.id) return { state, applied: false, reason: reason === "ok" ? "invalid-event" : reason };
  const key = factionRelationKey(receipt.from, receipt.to);
  const alignments = receipt.to === "player" && receipt.from !== "player"
    ? { ...state.alignments, [receipt.from]: clampAlignment(state.alignments[receipt.from] + receipt.alignmentPenalty) }
    : state.alignments;
  const diplomacy = key ? { ...state.diplomacy, [key]: receipt.diplomacyAfter } : state.diplomacy;
  return {
    state: stampAuthority({ ...state, alignments, diplomacy }, command),
    applied: true,
    reason: "ok",
  };
}

/** Faction-aligned creatures (including patrol Wargs) cannot be tamed. */
export function canTameAlignedCreature(alignedFaction: FactionId | null) {
  return alignedFaction === null;
}
