import type { CreatureTypeId } from "../creature-types";

export const TCG_SCHEMA = 1 as const;
export const TCG_CATALOG_REVISION = "cardforge-3";
export const TCG_MAX_COUNT = 2_000_000_000;
export const TCG_MAX_DECKS = 24;
export const TCG_DECK_SIZE = 30;
export const TCG_MAX_HAND = 9;
export const TCG_MAX_BOARD = 3;
export const TCG_MAX_ENERGY = 10;

export type TcgCardClass = "creature" | "character" | "technique" | "relic" | "place";
export type TcgRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";
export type TcgVariant = "standard" | "showcase" | "full-art" | "capture" | "boss-signature" | "promo";
export type TcgFinish = "standard" | "foil" | "etched" | "signature";
export type TcgSetId = "wildroads-core" | "halls-and-hearths" | "vaults-below";
export type TcgKeyword = "guard" | "swift" | "ambush" | "bond" | "faint" | "forage" | "attune" | "rally" | "dive" | "prime";
export type TcgZone = "deck" | "hand" | "board" | "discard";
export type TcgLocation = "physical" | "archived";

export type TcgAbilityEffect =
  | Readonly<{ kind: "draw"; count: number }>
  | Readonly<{ kind: "damage"; amount: number; target: "enemy-resolve" | "enemy-being" | "any-being" }>
  | Readonly<{ kind: "heal"; amount: number; target: "self-resolve" | "friendly-being" }>
  | Readonly<{ kind: "gain-energy"; amount: number }>
  | Readonly<{ kind: "buff"; power: number; guard: number; target: "self" | "friendly-being" }>
  | Readonly<{ kind: "ready"; target: "friendly-being" }>;

export type TcgAbility = Readonly<{
  id: string;
  trigger: "play" | "start" | "end" | "attack" | "faint";
  text: string;
  effect: TcgAbilityEffect;
}>;

export type TcgCardDefinition = Readonly<{
  schema: 1;
  id: string;
  rulesRevision: number;
  name: string;
  class: TcgCardClass;
  source: Readonly<{
    kind: "mob" | "item" | "move" | "profession" | "guild" | "poi" | "authored";
    id: string;
  }>;
  rarity: TcgRarity;
  primaryType?: CreatureTypeId;
  secondaryTypes: readonly CreatureTypeId[];
  factions: readonly string[];
  guilds: readonly string[];
  traits: readonly string[];
  cost: number;
  power?: number;
  guard?: number;
  keywords: readonly TcgKeyword[];
  abilities: readonly TcgAbility[];
  flavorText?: string;
}>;

export type TcgPrinting = Readonly<{
  schema: 1;
  id: string;
  cardDefinitionId: string;
  setId: TcgSetId;
  collectorNumber: string;
  variant: TcgVariant;
  finish: TcgFinish;
  illustrationKey: string;
  frameKey: string;
  acquisitionTags: readonly string[];
  valueModifierPermille: number;
  released: boolean;
}>;

export type TcgSetDefinition = Readonly<{
  id: TcgSetId;
  name: string;
  symbol: string;
  description: string;
  artDirection: string;
}>;

export type TcgPackProduct = Readonly<{
  id: string;
  name: string;
  setIds: readonly TcgSetId[];
  themeTags: readonly string[];
  retailPrice: number;
  illustrationKey: string;
}>;

export type TcgCatalog = Readonly<{
  revision: string;
  definitions: Readonly<Record<string, TcgCardDefinition>>;
  printings: Readonly<Record<string, TcgPrinting>>;
  definitionOrder: readonly string[];
  printingOrder: readonly string[];
  printingsByDefinition: Readonly<Record<string, readonly string[]>>;
  sets: Readonly<Record<TcgSetId, TcgSetDefinition>>;
  packs: Readonly<Record<string, TcgPackProduct>>;
}>;

export type TcgHolding = Readonly<{ physical: number; archived: number }>;

export type TcgDexEntry = Readonly<{
  definitionId: string;
  everOwned: boolean;
  firstAcquiredAt: number;
  lastAcquiredAt: number;
  acquiredCount: number;
  variantsSeen: readonly TcgVariant[];
  finishesSeen: readonly TcgFinish[];
}>;

export type TcgDeck = Readonly<{
  id: string;
  name: string;
  format: "open" | "core";
  printingIds: readonly string[];
  createdAt: number;
  updatedAt: number;
}>;

export type TcgTutorialState = Readonly<{
  loanerAvailable: boolean;
  tutorialCompleted: boolean;
  starterClaimed: boolean;
}>;

export type TcgNpcProgress = Readonly<{
  opponentId: string;
  wins: number;
  losses: number;
  firstWinClaimed: boolean;
  lastRewardDay: number;
}>;

export type TcgPlayerState = Readonly<{
  schema: 1;
  revision: number;
  ownerId: string;
  holdings: Readonly<Record<string, TcgHolding>>;
  archiveTier: 1 | 2 | 3;
  dex: Readonly<Record<string, TcgDexEntry>>;
  decks: readonly TcgDeck[];
  activeDeckId: string | null;
  tutorial: TcgTutorialState;
  npcProgress: Readonly<Record<string, TcgNpcProgress>>;
  rewardClaims: readonly string[];
  recentEventIds: readonly string[];
}>;

export type TcgPackBatch = Readonly<{
  schema: 1;
  id: string;
  ownerId: string;
  productId: string;
  source: string;
  quantity: number;
  nextIndex: number;
  createdRevision: number;
}>;

export type TcgLooseCardBatch = Readonly<{
  schema: 1;
  id: string;
  ownerId: string;
  printingId: string;
  count: number;
  createdAt: number;
  status: "active" | "deposited" | "quarantined";
}>;

export type TcgMerchantEntry =
  | Readonly<{ id: string; kind: "pack"; productId: string; quantity: number; unitPrice: number; tags: readonly string[] }>
  | Readonly<{ id: string; kind: "card"; printingId: string; quantity: number; unitPrice: number; tags: readonly string[] }>;

export type TcgMerchantStock = Readonly<{
  schema: 1;
  merchantId: string;
  revision: number;
  restockDay: number;
  restockSeed: string;
  gold: string;
  entries: readonly TcgMerchantEntry[];
  recentEventIds: readonly string[];
}>;

export type TcgTradeAsset = Readonly<{
  printingId: string;
  count: number;
  location: TcgLocation;
}>;

export type TcgTradeEscrow = Readonly<{
  schema: 1;
  id: string;
  revision: number;
  initiatorId: string;
  recipientId: string;
  initiatorAssets: readonly TcgTradeAsset[];
  recipientAssets: readonly TcgTradeAsset[];
  initiatorGold: string;
  recipientGold: string;
  initiatorAccepted: boolean;
  recipientAccepted: boolean;
  expiresAt: number;
  status: "open" | "committed" | "cancelled" | "expired";
}>;

export type TcgMatchCard = Readonly<{
  instanceId: string;
  printingId: string;
  definitionId: string;
  generated: boolean;
  damage: number;
  exhausted: boolean;
  enteredTurn: number;
  temporaryPower: number;
  temporaryGuard: number;
  submergedUntilTurn?: number;
}>;

export type TcgMatchPlayerState = Readonly<{
  playerId: string;
  displayName: string;
  npc: boolean;
  resolve: number;
  maxEnergy: number;
  energy: number;
  deck: readonly TcgMatchCard[];
  hand: readonly TcgMatchCard[];
  board: readonly (TcgMatchCard | null)[];
  relics: readonly TcgMatchCard[];
  place: TcgMatchCard | null;
  discard: readonly TcgMatchCard[];
  mulliganComplete: boolean;
  failedDraw: boolean;
}>;

export type TcgMatchLogEntry = Readonly<{
  revision: number;
  turn: number;
  actorId: string;
  text: string;
}>;

export type TcgMatchActionRecord = Readonly<{
  actionId: string;
  actorId: string;
  expectedRevision: number;
  action: TcgMatchAction;
  appliedAt: number;
}>;

export type TcgMatchState = Readonly<{
  schema: 1;
  id: string;
  revision: number;
  seed: string;
  catalogRevision: string;
  format: "open" | "core";
  phase: "mulligan" | "playing" | "complete" | "cancelled";
  players: readonly [TcgMatchPlayerState, TcgMatchPlayerState];
  activePlayerIndex: 0 | 1;
  firstPlayerIndex: 0 | 1;
  turn: number;
  winnerId: string | null;
  reason: "resolve" | "deck-out" | "concede" | "timeout" | "cancelled" | null;
  createdAt: number;
  updatedAt: number;
  turnDeadlineAt: number | null;
  disconnectedAt: readonly [number | null, number | null];
  deckCommitments: readonly [readonly string[], readonly string[]];
  log: readonly TcgMatchLogEntry[];
  actionLog: readonly TcgMatchActionRecord[];
  processedActionIds: readonly string[];
}>;

export type TcgChallenge = Readonly<{
  id: string;
  revision: number;
  challengerId: string;
  recipientId: string;
  createdAt: number;
  expiresAt: number;
  status: "pending" | "accepted" | "declined" | "expired";
  matchId: string | null;
}>;

export type TcgWorldState = Readonly<{
  schema: 1;
  revision: number;
  authorityId: string;
  catalogRevision: string;
  players: Readonly<Record<string, TcgPlayerState>>;
  packBatches: Readonly<Record<string, TcgPackBatch>>;
  looseCardBatches: Readonly<Record<string, TcgLooseCardBatch>>;
  merchantStock: Readonly<Record<string, TcgMerchantStock>>;
  activeTrades: Readonly<Record<string, TcgTradeEscrow>>;
  activeMatches: Readonly<Record<string, TcgMatchState>>;
  challenges: Readonly<Record<string, TcgChallenge>>;
  worldGrantClaims: readonly string[];
  recentEventIds: readonly string[];
  recoveryIssues: readonly string[];
}>;

export type TcgDeckValidation = Readonly<{
  valid: boolean;
  errors: readonly string[];
  definitionCounts: Readonly<Record<string, number>>;
}>;

export type TcgPackOpenResult = Readonly<{
  applied: boolean;
  reason: string;
  state: TcgWorldState;
  player: TcgPlayerState;
  batch: TcgPackBatch | null;
  printingIds: readonly string[];
}>;

export type TcgMatchAction =
  | Readonly<{ kind: "mulligan"; handIndexes: readonly number[] }>
  | Readonly<{ kind: "play"; handIndex: number; boardSlot?: number; targetPlayerIndex?: 0 | 1; targetBoardSlot?: number }>
  | Readonly<{ kind: "attack"; boardSlot: number; target: "resolve" | "being"; targetBoardSlot?: number }>
  | Readonly<{ kind: "end-turn" }>
  | Readonly<{ kind: "concede" }>;

export type TcgPublicMatchPlayer = Readonly<{
  playerId: string;
  displayName: string;
  npc: boolean;
  resolve: number;
  maxEnergy: number;
  energy: number;
  deckCount: number;
  handCount: number;
  hand?: readonly TcgMatchCard[];
  board: readonly (TcgMatchCard | null)[];
  relics: readonly TcgMatchCard[];
  place: TcgMatchCard | null;
  discardCount: number;
  mulliganComplete: boolean;
}>;

export type TcgPublicMatchState = Readonly<{
  id: string;
  revision: number;
  phase: TcgMatchState["phase"];
  players: readonly [TcgPublicMatchPlayer, TcgPublicMatchPlayer];
  viewerPlayerIndex: 0 | 1;
  activePlayerIndex: 0 | 1;
  turn: number;
  turnDeadlineAt: number | null;
  winnerId: string | null;
  reason: TcgMatchState["reason"];
  log: readonly TcgMatchLogEntry[];
}>;

export type TcgNpcOpponent = Readonly<{
  id: string;
  name: string;
  title: string;
  factionId: string;
  difficulty: 1 | 2 | 3 | 4;
  themeTags: readonly string[];
  rewardGold: number;
}>;

export type TcgHudState = Readonly<{
  catalogRevision: string;
  player: TcgPlayerState;
  packBatches: readonly TcgPackBatch[];
  lastPackReveal: Readonly<{ batchId: string; printingIds: readonly string[]; openedAt: number }> | null;
  merchant: TcgMerchantStock | null;
  activeMatch: TcgPublicMatchState | null;
  opponents: readonly TcgNpcOpponent[];
  challenges: readonly TcgChallenge[];
  trades: readonly TcgTradeEscrow[];
  peers: readonly Readonly<{ id: string; name: string }>[];
  settlementName: string | null;
  challengerStatus: string;
  recoveryIssues: readonly string[];
}>;
