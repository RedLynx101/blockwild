import { Item, type ItemCode } from "./data";

export const SHADECRAWLER_TRUST_FEEDS = 6;
export const SHADECRAWLER_GROWTH_FEEDS = 12;

export type ShadecrawlerState = {
  schema: 1;
  tamed: boolean;
  ownerId: string | null;
  trustFeeds: number;
  growthFeeds: number;
  growth: number;
  saddled: boolean;
};

export type ShadecrawlerFeedResult = {
  accepted: boolean;
  tamedNow: boolean;
  catalystNeeded: boolean;
  state: ShadecrawlerState;
};

export function createShadecrawlerState(): ShadecrawlerState {
  return {
    schema: 1,
    tamed: false,
    ownerId: null,
    trustFeeds: 0,
    growthFeeds: 0,
    growth: 0,
    saddled: false,
  };
}

export function normalizeShadecrawlerState(value: Partial<ShadecrawlerState> | null | undefined): ShadecrawlerState {
  if (value?.schema !== 1) return createShadecrawlerState();
  const trustFeeds = Math.max(0, Math.floor(Number(value.trustFeeds) || 0));
  const growthFeeds = Math.max(0, Math.floor(Number(value.growthFeeds) || 0));
  return {
    schema: 1,
    tamed: Boolean(value.tamed),
    ownerId: typeof value.ownerId === "string" ? value.ownerId : null,
    trustFeeds,
    growthFeeds,
    growth: Math.max(0, Math.min(1, Number(value.growth) || growthFeeds / SHADECRAWLER_GROWTH_FEEDS)),
    saddled: Boolean(value.saddled),
  };
}

export function shadecrawlerScale(state: ShadecrawlerState) {
  return 1 + Math.max(0, Math.min(1, state.growth)) * 2;
}

export function isFullGrownShadecrawler(state: ShadecrawlerState) {
  return state.tamed && state.growth >= 1;
}

export function canRideShadecrawler(state: ShadecrawlerState, ownerId: string) {
  return isFullGrownShadecrawler(state) && state.saddled && state.ownerId === ownerId;
}

export function equipShadecrawlerSaddle(state: ShadecrawlerState, ownerId: string) {
  if (!isFullGrownShadecrawler(state) || state.ownerId !== ownerId || state.saddled) return state;
  return { ...state, saddled: true };
}

export function feedShadecrawler(
  state: ShadecrawlerState,
  ownerId: string,
  item: ItemCode,
): ShadecrawlerFeedResult {
  const normalized = normalizeShadecrawlerState(state);
  if (!normalized.tamed) {
    if (item === Item.Berry) {
      return {
        accepted: true,
        tamedNow: false,
        catalystNeeded: normalized.trustFeeds + 1 >= SHADECRAWLER_TRUST_FEEDS,
        state: { ...normalized, trustFeeds: Math.min(SHADECRAWLER_TRUST_FEEDS, normalized.trustFeeds + 1) },
      };
    }
    if (item === Item.NocturneHeart && normalized.trustFeeds >= SHADECRAWLER_TRUST_FEEDS) {
      return {
        accepted: true,
        tamedNow: true,
        catalystNeeded: false,
        state: { ...normalized, tamed: true, ownerId },
      };
    }
    return { accepted: false, tamedNow: false, catalystNeeded: normalized.trustFeeds >= SHADECRAWLER_TRUST_FEEDS, state: normalized };
  }
  if (normalized.ownerId !== ownerId || !(item === Item.Berry || item === Item.RottenFlesh || item === Item.RawMeat)) {
    return { accepted: false, tamedNow: false, catalystNeeded: false, state: normalized };
  }
  const growthFeeds = Math.min(SHADECRAWLER_GROWTH_FEEDS, normalized.growthFeeds + 1);
  return {
    accepted: true,
    tamedNow: false,
    catalystNeeded: false,
    state: { ...normalized, growthFeeds, growth: growthFeeds / SHADECRAWLER_GROWTH_FEEDS },
  };
}
