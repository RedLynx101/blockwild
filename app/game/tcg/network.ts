import type { GoldWalletState } from "../economy";
import type {
  TcgHudState,
  TcgLocation,
  TcgMatchAction,
  TcgTradeAsset,
} from "./types";

export const TCG_NETWORK_PROTOCOL_VERSION = 1;

export type TcgNetworkIntent =
  | Readonly<{ kind: "refresh" }>
  | Readonly<{ kind: "claim-starter" }>
  | Readonly<{ kind: "start-tutorial" }>
  | Readonly<{ kind: "redeem-booster" }>
  | Readonly<{ kind: "archive-duplicates" }>
  | Readonly<{ kind: "upgrade-archive" }>
  | Readonly<{ kind: "open-pack"; batchId: string }>
  | Readonly<{ kind: "move-cards"; printingId: string; count: number; from: TcgLocation; to: TcgLocation }>
  | Readonly<{ kind: "withdraw-loose"; printingId: string; count: number }>
  | Readonly<{ kind: "deposit-loose" }>
  | Readonly<{ kind: "save-deck"; id?: string; name: string; printingIds: readonly string[]; format?: "open" | "core" }>
  | Readonly<{ kind: "set-active-deck"; deckId: string }>
  | Readonly<{ kind: "start-npc"; opponentId: string }>
  | Readonly<{ kind: "match-action"; matchId: string; action: TcgMatchAction; expectedRevision: number }>
  | Readonly<{ kind: "buy"; entryId: string; quantity: number }>
  | Readonly<{ kind: "sell"; printingId: string; quantity: number; location: TcgLocation }>
  | Readonly<{ kind: "create-trade"; recipientId: string; assets: readonly TcgTradeAsset[]; requestedAssets?: readonly TcgTradeAsset[] }>
  | Readonly<{ kind: "accept-trade" | "cancel-trade"; tradeId: string }>
  | Readonly<{ kind: "challenge"; recipientId: string }>
  | Readonly<{ kind: "accept-challenge" | "decline-challenge"; challengeId: string }>;

export type TcgNetworkAction = Readonly<{
  protocolVersion: number;
  requestId: string;
  actorId: string;
  tick: number;
  status: "request" | "accepted" | "rejected";
  intent?: TcgNetworkIntent;
  projection?: TcgHudState;
  walletState?: GoldWalletState;
  message?: string;
  reason?: string;
}>;

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const isString = (value: unknown, maximum = 192) => typeof value === "string" && value.length > 0 && value.length <= maximum;
const isInteger = (value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) => (
  typeof value === "number" && Number.isSafeInteger(value) && value >= minimum && value <= maximum
);
const isLocation = (value: unknown): value is TcgLocation => value === "physical" || value === "archived";

function validateMatchAction(value: unknown): value is TcgMatchAction {
  if (!isRecord(value)) return false;
  if (value.kind === "mulligan") return Array.isArray(value.handIndexes)
    && value.handIndexes.length <= 9
    && value.handIndexes.every((entry) => isInteger(entry, 0, 8));
  if (value.kind === "play") return isInteger(value.handIndex, 0, 8)
    && (value.boardSlot === undefined || isInteger(value.boardSlot, 0, 2))
    && (value.targetPlayerIndex === undefined || value.targetPlayerIndex === 0 || value.targetPlayerIndex === 1)
    && (value.targetBoardSlot === undefined || isInteger(value.targetBoardSlot, -1, 2));
  if (value.kind === "attack") return isInteger(value.boardSlot, 0, 2)
    && (value.target === "resolve" || value.target === "being")
    && (value.targetBoardSlot === undefined || isInteger(value.targetBoardSlot, 0, 2));
  return value.kind === "end-turn" || value.kind === "concede";
}

function validateAssets(value: unknown): value is readonly TcgTradeAsset[] {
  return Array.isArray(value) && value.length > 0 && value.length <= 64 && value.every((asset) => (
    isRecord(asset)
    && isString(asset.printingId, 192)
    && isInteger(asset.count, 1, 4_096)
    && isLocation(asset.location)
  ));
}

export function validateTcgNetworkIntent(value: unknown): value is TcgNetworkIntent {
  if (!isRecord(value) || !isString(value.kind, 32)) return false;
  switch (value.kind) {
    case "refresh":
    case "claim-starter":
    case "start-tutorial":
    case "redeem-booster":
    case "archive-duplicates":
    case "upgrade-archive":
    case "deposit-loose":
      return true;
    case "open-pack":
      return isString(value.batchId, 192);
    case "move-cards":
      return isString(value.printingId, 192) && isInteger(value.count, 1, 100_000) && isLocation(value.from) && isLocation(value.to) && value.from !== value.to;
    case "withdraw-loose":
      return isString(value.printingId, 192) && isInteger(value.count, 1, 64);
    case "save-deck":
      return (value.id === undefined || isString(value.id, 96))
        && isString(value.name, 48)
        && Array.isArray(value.printingIds)
        && value.printingIds.length <= 30
        && value.printingIds.every((entry) => isString(entry, 192))
        && (value.format === undefined || value.format === "open" || value.format === "core");
    case "set-active-deck":
      return isString(value.deckId, 96);
    case "start-npc":
      return isString(value.opponentId, 96);
    case "match-action":
      return isString(value.matchId, 160) && validateMatchAction(value.action) && isInteger(value.expectedRevision);
    case "buy":
      return isString(value.entryId, 192) && isInteger(value.quantity, 1, 4_096);
    case "sell":
      return isString(value.printingId, 192) && isInteger(value.quantity, 1, 4_096) && isLocation(value.location);
    case "create-trade":
      return isString(value.recipientId, 160)
        && validateAssets(value.assets)
        && (value.requestedAssets === undefined || validateAssets(value.requestedAssets));
    case "accept-trade":
    case "cancel-trade":
      return isString(value.tradeId, 192);
    case "challenge":
      return isString(value.recipientId, 160);
    case "accept-challenge":
    case "decline-challenge":
      return isString(value.challengeId, 192);
    default:
      return false;
  }
}

function validateWallet(value: unknown): value is GoldWalletState {
  return isRecord(value)
    && value.schema === 1
    && isString(value.authorityId, 192)
    && isString(value.ownerId, 160)
    && isInteger(value.revision)
    && typeof value.balance === "string"
    && /^\d{1,80}$/u.test(value.balance)
    && Array.isArray(value.recentEventIds)
    && value.recentEventIds.length <= 1_024
    && value.recentEventIds.every((entry) => isString(entry, 192));
}

function validateProjection(value: unknown): value is TcgHudState {
  if (!isRecord(value) || !isString(value.catalogRevision, 80) || !isRecord(value.player)) return false;
  const player = value.player;
  if (player.schema !== 1 || !isString(player.ownerId, 160) || !isInteger(player.revision)) return false;
  if (!isRecord(player.holdings) || Object.keys(player.holdings).length > 32_768) return false;
  if (!Array.isArray(player.decks) || player.decks.length > 24) return false;
  if (!Array.isArray(value.packBatches) || value.packBatches.length > 8_192) return false;
  if (value.lastPackReveal !== null && (!isRecord(value.lastPackReveal)
    || !isString(value.lastPackReveal.batchId, 192)
    || !isInteger(value.lastPackReveal.openedAt)
    || !Array.isArray(value.lastPackReveal.printingIds)
    || value.lastPackReveal.printingIds.length !== 5
    || !value.lastPackReveal.printingIds.every((entry) => isString(entry, 192)))) return false;
  if (!Array.isArray(value.opponents) || value.opponents.length > 64) return false;
  if (!Array.isArray(value.challenges) || value.challenges.length > 64) return false;
  if (!Array.isArray(value.trades) || value.trades.length > 64) return false;
  if (!Array.isArray(value.peers) || value.peers.length > 64) return false;
  if (!(value.settlementName === null || (typeof value.settlementName === "string" && value.settlementName.length <= 96))) return false;
  if (typeof value.challengerStatus !== "string" || value.challengerStatus.length > 240) return false;
  if (!Array.isArray(value.recoveryIssues) || value.recoveryIssues.length > 64 || !value.recoveryIssues.every((entry) => isString(entry, 192))) return false;
  if (value.activeMatch !== null && (!isRecord(value.activeMatch) || !isInteger(value.activeMatch.revision))) return false;
  return value.merchant === null || (isRecord(value.merchant) && Array.isArray(value.merchant.entries) && value.merchant.entries.length <= 24);
}

export function validateTcgNetworkAction(value: unknown): value is TcgNetworkAction {
  if (!isRecord(value)
    || !isInteger(value.protocolVersion, 1, 64)
    || !isString(value.requestId, 192)
    || !isString(value.actorId, 160)
    || !isInteger(value.tick)
    || !["request", "accepted", "rejected"].includes(value.status as string)
    || (value.message !== undefined && !isString(value.message, 240))
    || (value.reason !== undefined && !isString(value.reason, 160))) return false;
  if (value.status === "request") {
    return validateTcgNetworkIntent(value.intent) && value.projection === undefined && value.walletState === undefined;
  }
  return value.intent === undefined
    && (value.status === "rejected" ? value.projection === undefined : validateProjection(value.projection))
    && (value.walletState === undefined || validateWallet(value.walletState));
}
