import {
  checkAuthority,
  stampAuthority,
  type AuthorityCommand,
  type AuthorityStampedState,
  type FactionId,
  type NpcFactionId,
} from "./factions.ts";

/** Decimal-string ledgers stay exact, JSON-safe, and are not capped at 64. */
export type GoldAmount = string;

export type GoldWalletState = AuthorityStampedState & Readonly<{
  schema: 1;
  ownerId: string;
  balance: GoldAmount;
}>;

export type EconomyFailure =
  | "ok"
  | "duplicate"
  | "forbidden"
  | "stale"
  | "invalid-event"
  | "invalid-amount"
  | "insufficient-gold"
  | "insufficient-stock"
  | "merchant-cannot-pay"
  | "merchant-out-of-stock"
  | "inventory-full";

export type EconomyMutation<T> = Readonly<{
  state: T;
  applied: boolean;
  reason: EconomyFailure;
}>;

function parseGold(value: GoldAmount | number | bigint) {
  const zero = BigInt(0);
  if (typeof value === "bigint") return value < zero ? zero : value;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) return zero;
    return BigInt(value);
  }
  return /^\d+$/u.test(value) ? BigInt(value) : zero;
}

export function normalizeGold(value: GoldAmount | number | bigint): GoldAmount {
  return parseGold(value).toString();
}

export function addGold(a: GoldAmount, b: GoldAmount | number | bigint) {
  return (parseGold(a) + parseGold(b)).toString();
}

export function subtractGold(a: GoldAmount, b: GoldAmount | number | bigint): GoldAmount | null {
  const amount = parseGold(b);
  const balance = parseGold(a);
  return amount <= balance ? (balance - amount).toString() : null;
}

export function compareGold(a: GoldAmount, b: GoldAmount | number | bigint) {
  const left = parseGold(a);
  const right = parseGold(b);
  return left === right ? 0 : left > right ? 1 : -1;
}

export function createGoldWallet(authorityId: string, ownerId: string, startingGold: GoldAmount | number | bigint = 0): GoldWalletState {
  return {
    schema: 1,
    authorityId,
    revision: 0,
    recentEventIds: [],
    ownerId,
    balance: normalizeGold(startingGold),
  };
}

export function creditGold(wallet: GoldWalletState, amount: GoldAmount | number | bigint, command: AuthorityCommand): EconomyMutation<GoldWalletState> {
  const authority = checkAuthority(wallet, command);
  const parsed = parseGold(amount);
  if (authority !== "ok") return { state: wallet, applied: false, reason: authority };
  if (parsed <= BigInt(0)) return { state: wallet, applied: false, reason: "invalid-amount" };
  return {
    state: stampAuthority({ ...wallet, balance: addGold(wallet.balance, parsed) }, command),
    applied: true,
    reason: "ok",
  };
}

export function debitGold(wallet: GoldWalletState, amount: GoldAmount | number | bigint, command: AuthorityCommand): EconomyMutation<GoldWalletState> {
  const authority = checkAuthority(wallet, command);
  const parsed = parseGold(amount);
  if (authority !== "ok") return { state: wallet, applied: false, reason: authority };
  if (parsed <= BigInt(0)) return { state: wallet, applied: false, reason: "invalid-amount" };
  const balance = subtractGold(wallet.balance, parsed);
  if (balance === null) return { state: wallet, applied: false, reason: "insufficient-gold" };
  return { state: stampAuthority({ ...wallet, balance }, command), applied: true, reason: "ok" };
}

export type MerchantProfession =
  | "general"
  | "farmer"
  | "miner"
  | "brewer"
  | "alchemist"
  | "blacksmith"
  | "banker"
  | "warrior"
  | "mayor"
  | "atlantian-tidewarden"
  | "atlantian-kelpkeeper"
  | "atlantian-coralwright"
  | "atlantian-pearlbroker"
  | "atlantian-glowmender"
  | "atlantian-trident-guard"
  | "sugarcourt-crown-confectioner"
  | "sugarcourt-gumdrop-gardener"
  | "sugarcourt-sugarboiler"
  | "sugarcourt-candysmith"
  | "sugarcourt-sweetbroker"
  | "sugarcourt-kennelkeeper"
  | "sugarcourt-brittle-guard";

export type CommerceCategory =
  | "food"
  | "crop"
  | "drink"
  | "honey"
  | "material"
  | "ore"
  | "weapon"
  | "armor"
  | "ammunition"
  | "potion"
  | "blueprint"
  | "creature"
  | "treasure"
  | "misc";

export type CommerceItem = Readonly<{
  key: string;
  name: string;
  category: CommerceCategory;
  baseValue: number;
  stackLimit: number;
  tags?: readonly string[];
}>;

export type MerchantStack = Readonly<{
  itemKey: string;
  count: number;
}>;

export type MerchantState = AuthorityStampedState & Readonly<{
  schema: 1;
  id: string;
  factionId: Exclude<FactionId, "player">;
  profession: MerchantProfession;
  gold: GoldAmount;
  inventory: readonly MerchantStack[];
  customCatalog: Readonly<Record<string, CommerceItem>>;
  restockSeed: string;
  lastRestockDay: number;
}>;

export const COMMERCE_CATALOG: Readonly<Record<string, CommerceItem>> = Object.fromEntries(([
  { key: "apple", name: "Apple", category: "food", baseValue: 3, stackLimit: 64, tags: ["fruit"] },
  { key: "moonberry", name: "Moonberry", category: "crop", baseValue: 5, stackLimit: 64, tags: ["berry"] },
  { key: "honey-jar", name: "Honey Jar", category: "honey", baseValue: 14, stackLimit: 12 },
  { key: "royal-jelly", name: "Royal Jelly", category: "honey", baseValue: 55, stackLimit: 12 },
  { key: "mead", name: "Hearthgold Mead", category: "drink", baseValue: 24, stackLimit: 16, tags: ["mead"] },
  { key: "raw-iron", name: "Raw Iron", category: "ore", baseValue: 8, stackLimit: 64 },
  { key: "raw-gold", name: "Raw Gold", category: "ore", baseValue: 18, stackLimit: 64 },
  { key: "plant-fiber", name: "Plant Fiber", category: "material", baseValue: 2, stackLimit: 64 },
  { key: "crossbow", name: "Hearthguard Crossbow", category: "weapon", baseValue: 92, stackLimit: 1, tags: ["hobbit"] },
  { key: "fine-crossbow", name: "Freehold Arbalest", category: "weapon", baseValue: 260, stackLimit: 1, tags: ["hobbit", "tier-2"] },
  { key: "bolt", name: "Crossbow Bolt", category: "ammunition", baseValue: 2, stackLimit: 64 },
  { key: "goblin-spear", name: "Brassroot Spear", category: "weapon", baseValue: 74, stackLimit: 1, tags: ["goblin"] },
  { key: "tempered-spear", name: "Tempered Rootspike", category: "weapon", baseValue: 190, stackLimit: 1, tags: ["goblin", "tier-2"] },
  { key: "health-potion", name: "Health Potion", category: "potion", baseValue: 28, stackLimit: 16 },
  { key: "goblin-tonic", name: "Rootstep Tonic", category: "potion", baseValue: 64, stackLimit: 16, tags: ["goblin"] },
  { key: "hobbit-potion", name: "Hearthward Draught", category: "potion", baseValue: 72, stackLimit: 16, tags: ["hobbit"] },
  { key: "blueprint-crossbow", name: "Blueprint: Crossbow", category: "blueprint", baseValue: 330, stackLimit: 16 },
  { key: "blueprint-fine-crossbow", name: "Blueprint: Freehold Arbalest", category: "blueprint", baseValue: 920, stackLimit: 16 },
  { key: "blueprint-spear", name: "Blueprint: Brassroot Spear", category: "blueprint", baseValue: 280, stackLimit: 16 },
  { key: "blueprint-goblin-tonic", name: "Blueprint: Rootstep Tonic", category: "blueprint", baseValue: 440, stackLimit: 16 },
  { key: "blueprint-hobbit-potion", name: "Blueprint: Hearthward Draught", category: "blueprint", baseValue: 480, stackLimit: 16 },
  { key: "blueprint-mead", name: "Blueprint: Hearthgold Mead", category: "blueprint", baseValue: 360, stackLimit: 16 },
  { key: "unaligned-warg-orb", name: "Capture Orb: Young Warg", category: "creature", baseValue: 640, stackLimit: 1, tags: ["unaligned", "warg"] },
  { key: "cloudglass-relic", name: "Cloudglass Relic", category: "treasure", baseValue: 210, stackLimit: 1 },
  { key: "glow-kelp", name: "Glow Kelp Frond", category: "crop", baseValue: 7, stackLimit: 64, tags: ["aquatic", "atlantian", "kelp"] },
  { key: "shellfruit", name: "Shellfruit", category: "food", baseValue: 11, stackLimit: 32, tags: ["aquatic", "atlantian", "fruit"] },
  { key: "reefglass", name: "Reefglass", category: "material", baseValue: 19, stackLimit: 64, tags: ["aquatic", "atlantian", "craft"] },
  { key: "living-coral", name: "Living Coral", category: "material", baseValue: 16, stackLimit: 32, tags: ["aquatic", "atlantian", "coral"] },
  { key: "lumen-pearl", name: "Lumen Pearl", category: "treasure", baseValue: 48, stackLimit: 32, tags: ["aquatic", "atlantian", "pearl"] },
  { key: "prismatic-pearl", name: "Prismatic Pearl", category: "treasure", baseValue: 145, stackLimit: 16, tags: ["aquatic", "atlantian", "pearl", "rare"] },
  { key: "tideglass-trident", name: "Tideglass Trident", category: "weapon", baseValue: 168, stackLimit: 1, tags: ["aquatic", "atlantian"] },
  { key: "glowmender-salve", name: "Glowmender Salve", category: "potion", baseValue: 76, stackLimit: 16, tags: ["aquatic", "atlantian", "medicine"] },
  { key: "peppermint-cane", name: "Peppermint Cane", category: "crop", baseValue: 7, stackLimit: 64, tags: ["sugarcourt", "mint"] },
  { key: "peppermint-starts", name: "Peppermint Starts", category: "crop", baseValue: 9, stackLimit: 64, tags: ["sugarcourt", "seed"] },
  { key: "cocoa-nib", name: "Cocoa Puff Nib", category: "food", baseValue: 6, stackLimit: 64, tags: ["sugarcourt", "crop"] },
  { key: "cocoa-seeds", name: "Cocoa Puff Seeds", category: "crop", baseValue: 10, stackLimit: 64, tags: ["sugarcourt", "seed"] },
  { key: "gumdrop", name: "Wild Gumdrop", category: "food", baseValue: 6, stackLimit: 64, tags: ["sugarcourt", "candy"] },
  { key: "lollipop-petal", name: "Lollipop Orchid Petal", category: "crop", baseValue: 8, stackLimit: 64, tags: ["sugarcourt", "flower"] },
  { key: "marshmallow-tuft", name: "Marshmallow Tuft", category: "food", baseValue: 8, stackLimit: 64, tags: ["sugarcourt", "candy"] },
  { key: "candied-alloy", name: "Tempered Candy Alloy", category: "material", baseValue: 24, stackLimit: 64, tags: ["sugarcourt", "craft"] },
  { key: "boiled-sugarbrick", name: "Boiled Sugarbrick", category: "material", baseValue: 12, stackLimit: 64, tags: ["sugarcourt", "building"] },
  { key: "sugarworks", name: "Sugarworks", category: "misc", baseValue: 118, stackLimit: 16, tags: ["sugarcourt", "station"] },
  { key: "honey-bucket", name: "Honey Bucket", category: "honey", baseValue: 58, stackLimit: 1, tags: ["sugarcourt", "liquid"] },
  { key: "syrup-bucket", name: "Syrup Bucket", category: "drink", baseValue: 46, stackLimit: 1, tags: ["sugarcourt", "liquid"] },
  { key: "rockcandy-saber", name: "Rockcandy Saber", category: "weapon", baseValue: 245, stackLimit: 1, tags: ["sugarcourt", "tier-3"] },
  { key: "peppermint-pike", name: "Peppermint Pike", category: "weapon", baseValue: 178, stackLimit: 1, tags: ["sugarcourt", "tier-3"] },
  { key: "fondant-crown", name: "Sugarplate Crown", category: "armor", baseValue: 170, stackLimit: 1, tags: ["sugarcourt", "sugarplate"] },
  { key: "fondant-cuirass", name: "Sugarplate Cuirass", category: "armor", baseValue: 340, stackLimit: 1, tags: ["sugarcourt", "sugarplate"] },
  { key: "fondant-greaves", name: "Sugarplate Greaves", category: "armor", baseValue: 270, stackLimit: 1, tags: ["sugarcourt", "sugarplate"] },
  { key: "fondant-boots", name: "Sugarplate Boots", category: "armor", baseValue: 160, stackLimit: 1, tags: ["sugarcourt", "sugarplate"] },
  { key: "peppermint-rush", name: "Peppermint Rush", category: "potion", baseValue: 72, stackLimit: 8, tags: ["sugarcourt", "potion"] },
  { key: "marshmallow-ward", name: "Marshmallow Ward", category: "potion", baseValue: 84, stackLimit: 8, tags: ["sugarcourt", "potion"] },
  { key: "blueprint-sugarcourt-arms", name: "Blueprint: Sugarcourt Arms", category: "blueprint", baseValue: 620, stackLimit: 16, tags: ["sugarcourt"] },
  { key: "blueprint-sugarcourt-armor", name: "Pattern: Sugarplate Armor", category: "blueprint", baseValue: 980, stackLimit: 16, tags: ["sugarcourt"] },
  { key: "blueprint-peppermint-rush", name: "Formula: Peppermint Rush", category: "blueprint", baseValue: 430, stackLimit: 16, tags: ["sugarcourt"] },
  { key: "blueprint-marshmallow-ward", name: "Formula: Marshmallow Ward", category: "blueprint", baseValue: 520, stackLimit: 16, tags: ["sugarcourt"] },
  { key: "unaligned-taffy-hound-orb", name: "Capture Orb: Taffy Hound", category: "creature", baseValue: 590, stackLimit: 1, tags: ["sugarcourt", "unaligned", "taffy-hound"] },
  { key: "unaligned-praline-cat-orb", name: "Capture Orb: Praline Cat", category: "creature", baseValue: 520, stackLimit: 1, tags: ["sugarcourt", "unaligned", "praline-cat"] },
] satisfies CommerceItem[]).map((definition) => [definition.key, definition])) as Readonly<Record<string, CommerceItem>>;

export type MerchantOffer = Readonly<MerchantStack & { professions: readonly MerchantProfession[] }>;

export const HOBBIT_MERCHANT_OFFERS: readonly MerchantOffer[] = [
  { itemKey: "apple", count: 18, professions: ["farmer", "general"] },
  { itemKey: "honey-jar", count: 8, professions: ["brewer", "general"] },
  { itemKey: "mead", count: 12, professions: ["brewer", "general"] },
  { itemKey: "crossbow", count: 2, professions: ["blacksmith", "warrior"] },
  { itemKey: "bolt", count: 48, professions: ["blacksmith", "warrior"] },
  { itemKey: "blueprint-crossbow", count: 1, professions: ["blacksmith"] },
  { itemKey: "blueprint-fine-crossbow", count: 1, professions: ["blacksmith"] },
  { itemKey: "blueprint-mead", count: 1, professions: ["brewer"] },
  { itemKey: "blueprint-hobbit-potion", count: 1, professions: ["alchemist"] },
  { itemKey: "hobbit-potion", count: 3, professions: ["alchemist"] },
];

export const GOBLIN_MERCHANT_OFFERS: readonly MerchantOffer[] = [
  { itemKey: "raw-iron", count: 32, professions: ["miner", "general", "blacksmith"] },
  { itemKey: "raw-gold", count: 10, professions: ["miner", "general"] },
  { itemKey: "goblin-spear", count: 4, professions: ["blacksmith", "warrior"] },
  { itemKey: "tempered-spear", count: 1, professions: ["blacksmith"] },
  { itemKey: "blueprint-spear", count: 1, professions: ["blacksmith"] },
  { itemKey: "goblin-tonic", count: 5, professions: ["alchemist", "general"] },
  { itemKey: "blueprint-goblin-tonic", count: 1, professions: ["alchemist"] },
  { itemKey: "unaligned-warg-orb", count: 1, professions: ["mayor", "general"] },
];

export const ATLANTIAN_MERCHANT_OFFERS: readonly MerchantOffer[] = [
  { itemKey: "glow-kelp", count: 28, professions: ["atlantian-kelpkeeper", "atlantian-tidewarden"] },
  { itemKey: "shellfruit", count: 18, professions: ["atlantian-kelpkeeper", "atlantian-pearlbroker"] },
  { itemKey: "reefglass", count: 20, professions: ["atlantian-coralwright", "atlantian-pearlbroker"] },
  { itemKey: "living-coral", count: 14, professions: ["atlantian-coralwright"] },
  { itemKey: "lumen-pearl", count: 10, professions: ["atlantian-pearlbroker", "atlantian-tidewarden"] },
  { itemKey: "prismatic-pearl", count: 2, professions: ["atlantian-pearlbroker"] },
  { itemKey: "tideglass-trident", count: 3, professions: ["atlantian-coralwright", "atlantian-trident-guard"] },
  { itemKey: "glowmender-salve", count: 6, professions: ["atlantian-glowmender", "atlantian-tidewarden"] },
];

export const SUGARCOURT_MERCHANT_OFFERS: readonly MerchantOffer[] = [
  { itemKey: "peppermint-starts", count: 18, professions: ["sugarcourt-gumdrop-gardener"] },
  { itemKey: "peppermint-cane", count: 24, professions: ["sugarcourt-gumdrop-gardener", "sugarcourt-sugarboiler"] },
  { itemKey: "cocoa-seeds", count: 14, professions: ["sugarcourt-gumdrop-gardener"] },
  { itemKey: "cocoa-nib", count: 20, professions: ["sugarcourt-gumdrop-gardener", "sugarcourt-sweetbroker"] },
  { itemKey: "gumdrop", count: 24, professions: ["sugarcourt-gumdrop-gardener", "sugarcourt-sweetbroker", "sugarcourt-kennelkeeper"] },
  { itemKey: "lollipop-petal", count: 18, professions: ["sugarcourt-gumdrop-gardener", "sugarcourt-sugarboiler"] },
  { itemKey: "marshmallow-tuft", count: 18, professions: ["sugarcourt-sweetbroker", "sugarcourt-kennelkeeper"] },
  { itemKey: "boiled-sugarbrick", count: 24, professions: ["sugarcourt-sweetbroker", "sugarcourt-candysmith"] },
  { itemKey: "sugarworks", count: 2, professions: ["sugarcourt-sugarboiler", "sugarcourt-sweetbroker"] },
  { itemKey: "honey-bucket", count: 2, professions: ["sugarcourt-sugarboiler"] },
  { itemKey: "syrup-bucket", count: 3, professions: ["sugarcourt-sugarboiler", "sugarcourt-sweetbroker"] },
  { itemKey: "peppermint-rush", count: 5, professions: ["sugarcourt-sugarboiler"] },
  { itemKey: "marshmallow-ward", count: 4, professions: ["sugarcourt-sugarboiler"] },
  { itemKey: "blueprint-peppermint-rush", count: 1, professions: ["sugarcourt-sugarboiler"] },
  { itemKey: "blueprint-marshmallow-ward", count: 1, professions: ["sugarcourt-sugarboiler"] },
  { itemKey: "rockcandy-saber", count: 2, professions: ["sugarcourt-candysmith"] },
  { itemKey: "peppermint-pike", count: 3, professions: ["sugarcourt-candysmith", "sugarcourt-brittle-guard"] },
  { itemKey: "fondant-crown", count: 1, professions: ["sugarcourt-candysmith"] },
  { itemKey: "fondant-cuirass", count: 1, professions: ["sugarcourt-candysmith"] },
  { itemKey: "fondant-greaves", count: 1, professions: ["sugarcourt-candysmith"] },
  { itemKey: "fondant-boots", count: 1, professions: ["sugarcourt-candysmith"] },
  { itemKey: "blueprint-sugarcourt-arms", count: 1, professions: ["sugarcourt-candysmith"] },
  { itemKey: "blueprint-sugarcourt-armor", count: 1, professions: ["sugarcourt-candysmith"] },
  { itemKey: "unaligned-taffy-hound-orb", count: 1, professions: ["sugarcourt-kennelkeeper"] },
  { itemKey: "unaligned-praline-cat-orb", count: 1, professions: ["sugarcourt-kennelkeeper"] },
];

const MERCHANT_OFFERS_BY_FACTION: Readonly<Record<NpcFactionId, readonly MerchantOffer[]>> = {
  hobbits: HOBBIT_MERCHANT_OFFERS,
  goblins: GOBLIN_MERCHANT_OFFERS,
  atlantians: ATLANTIAN_MERCHANT_OFFERS,
  sugarcourt: SUGARCOURT_MERCHANT_OFFERS,
};

export function merchantOffersFor(factionId: Exclude<FactionId, "player">, profession: MerchantProfession) {
  const offers = MERCHANT_OFFERS_BY_FACTION[factionId];
  return offers.filter((offer) => offer.professions.includes(profession)).map(({ itemKey, count }) => ({ itemKey, count }));
}

function boundedMerchantInventory(stacks: readonly MerchantStack[], customCatalog: Readonly<Record<string, CommerceItem>> = {}) {
  const combined = new Map<string, number>();
  for (const stack of stacks.slice(0, 48)) {
    const definition = COMMERCE_CATALOG[stack.itemKey] ?? customCatalog[stack.itemKey];
    if (!definition) continue;
    const next = Math.max(0, Math.min(definition.stackLimit * 8, Math.floor(stack.count)));
    combined.set(stack.itemKey, Math.min(definition.stackLimit * 8, (combined.get(stack.itemKey) ?? 0) + next));
  }
  return [...combined].filter(([, count]) => count > 0).map(([itemKey, count]) => ({ itemKey, count }));
}

export function createMerchant(
  authorityId: string,
  id: string,
  factionId: Exclude<FactionId, "player">,
  profession: MerchantProfession,
  startingGold: GoldAmount | number = 240,
): MerchantState {
  return {
    schema: 1,
    authorityId,
    revision: 0,
    recentEventIds: [],
    id,
    factionId,
    profession,
    gold: normalizeGold(startingGold),
    inventory: boundedMerchantInventory(merchantOffersFor(factionId, profession)),
    customCatalog: {},
    restockSeed: `${factionId}:${id}:${profession}`,
    lastRestockDay: 0,
  };
}

function merchantDemandMultiplier(merchant: Pick<MerchantState, "factionId" | "profession">, item: CommerceItem) {
  let multiplier = 1;
  if (merchant.profession === "farmer" && ["food", "crop"].includes(item.category)) multiplier *= 1.28;
  if (merchant.profession === "miner" && ["ore", "material"].includes(item.category)) multiplier *= 1.35;
  if (merchant.profession === "brewer" && ["drink", "honey"].includes(item.category)) multiplier *= 1.38;
  if (merchant.profession === "alchemist" && ["potion", "crop"].includes(item.category)) multiplier *= 1.3;
  if (merchant.profession === "blacksmith" && ["weapon", "ore", "ammunition"].includes(item.category)) multiplier *= 1.25;
  if (merchant.profession === "banker" && ["treasure", "ore"].includes(item.category)) multiplier *= 1.2;
  if (merchant.profession === "atlantian-kelpkeeper" && ["crop", "food"].includes(item.category)) multiplier *= 1.34;
  if (merchant.profession === "atlantian-coralwright" && ["material", "weapon"].includes(item.category)) multiplier *= 1.3;
  if (merchant.profession === "atlantian-pearlbroker" && item.tags?.includes("pearl")) multiplier *= 1.42;
  if (merchant.profession === "atlantian-glowmender" && ["potion", "crop"].includes(item.category)) multiplier *= 1.3;
  if (merchant.profession === "atlantian-trident-guard" && item.category === "weapon") multiplier *= 1.2;
  if (merchant.profession === "sugarcourt-gumdrop-gardener" && ["food", "crop"].includes(item.category)) multiplier *= 1.34;
  if (merchant.profession === "sugarcourt-sugarboiler" && ["honey", "potion", "crop"].includes(item.category)) multiplier *= 1.35;
  if (merchant.profession === "sugarcourt-candysmith" && ["weapon", "armor", "material"].includes(item.category)) multiplier *= 1.32;
  if (merchant.profession === "sugarcourt-kennelkeeper" && item.category === "creature") multiplier *= 1.38;
  if (merchant.factionId === "hobbits" && item.tags?.includes("mead")) multiplier *= 1.8;
  if (merchant.factionId === "goblins" && item.tags?.includes("goblin")) multiplier *= 1.15;
  if (merchant.factionId === "atlantians" && item.tags?.includes("aquatic")) multiplier *= 1.14;
  if (merchant.factionId === "sugarcourt" && item.tags?.includes("sugarcourt")) multiplier *= 1.16;
  return multiplier;
}

export type MerchantTradeDirection = "player-buys" | "player-sells";

export function quoteMerchantTrade(
  merchant: Pick<MerchantState, "factionId" | "profession">,
  item: CommerceItem,
  count: number,
  direction: MerchantTradeDirection,
) {
  const quantity = Math.max(0, Math.min(999, Math.floor(count)));
  if (quantity === 0) return { unitPrice: 0, total: "0" as GoldAmount };
  const demand = merchantDemandMultiplier(merchant, item);
  const unitPrice = direction === "player-buys"
    ? Math.max(1, Math.ceil(item.baseValue * 1.22 * Math.max(0.9, demand * 0.94)))
    : Math.max(1, Math.floor(item.baseValue * 0.52 * demand));
  return { unitPrice, total: normalizeGold(BigInt(unitPrice) * BigInt(quantity)) };
}

export type AtomicEconomyCommand = Readonly<{
  authorityId: string;
  eventId: string;
  expectedWalletRevision: number;
  expectedCounterpartyRevision: number;
}>;

function atomicAuthorityCheck(wallet: GoldWalletState, counterparty: AuthorityStampedState, command: AtomicEconomyCommand): EconomyFailure {
  if (!command.eventId.trim()) return "invalid-event";
  if (wallet.authorityId !== command.authorityId || counterparty.authorityId !== command.authorityId) return "forbidden";
  if (wallet.recentEventIds.includes(command.eventId) || counterparty.recentEventIds.includes(command.eventId)) return "duplicate";
  if (wallet.revision !== command.expectedWalletRevision || counterparty.revision !== command.expectedCounterpartyRevision) return "stale";
  return "ok";
}

function stampAtomic<T extends AuthorityStampedState>(state: T, command: AtomicEconomyCommand): T {
  return stampAuthority(state, { authorityId: command.authorityId, eventId: command.eventId, expectedRevision: state.revision });
}

function removeMerchantStock(inventory: readonly MerchantStack[], itemKey: string, count: number) {
  return inventory.map((stack) => stack.itemKey === itemKey ? { ...stack, count: stack.count - count } : stack).filter((stack) => stack.count > 0);
}

function addMerchantStock(inventory: readonly MerchantStack[], itemKey: string, count: number, customCatalog: Readonly<Record<string, CommerceItem>>) {
  return boundedMerchantInventory([...inventory, { itemKey, count }], customCatalog);
}

export type MerchantTradeResult = Readonly<{
  wallet: GoldWalletState;
  merchant: MerchantState;
  item: MerchantStack | null;
  applied: boolean;
  reason: EconomyFailure;
  total: GoldAmount;
}>;

export function buyFromMerchant(
  wallet: GoldWalletState,
  merchant: MerchantState,
  itemKey: string,
  count: number,
  command: AtomicEconomyCommand,
): MerchantTradeResult {
  const authority = atomicAuthorityCheck(wallet, merchant, command);
  const definition = COMMERCE_CATALOG[itemKey] ?? merchant.customCatalog[itemKey];
  const quantity = Math.max(0, Math.floor(count));
  if (authority !== "ok" || !definition || quantity <= 0) {
    return { wallet, merchant, item: null, applied: false, reason: authority === "ok" ? "invalid-amount" : authority, total: "0" };
  }
  const available = merchant.inventory.find((stack) => stack.itemKey === itemKey)?.count ?? 0;
  if (available < quantity) return { wallet, merchant, item: null, applied: false, reason: "merchant-out-of-stock", total: "0" };
  const { total } = quoteMerchantTrade(merchant, definition, quantity, "player-buys");
  const walletBalance = subtractGold(wallet.balance, total);
  if (walletBalance === null) return { wallet, merchant, item: null, applied: false, reason: "insufficient-gold", total };
  const nextWallet = stampAtomic({ ...wallet, balance: walletBalance }, command);
  const nextMerchant = stampAtomic({
    ...merchant,
    gold: addGold(merchant.gold, total),
    inventory: removeMerchantStock(merchant.inventory, itemKey, quantity),
  }, command);
  return { wallet: nextWallet, merchant: nextMerchant, item: { itemKey, count: quantity }, applied: true, reason: "ok", total };
}

/** Merchants accept any registered item, not a fixed Minecraft-style trade. */
export function sellToMerchant(
  wallet: GoldWalletState,
  merchant: MerchantState,
  item: CommerceItem,
  count: number,
  command: AtomicEconomyCommand,
): MerchantTradeResult {
  const authority = atomicAuthorityCheck(wallet, merchant, command);
  const quantity = Math.max(0, Math.floor(count));
  if (authority !== "ok" || quantity <= 0 || !item.key.trim() || item.baseValue <= 0) {
    return { wallet, merchant, item: null, applied: false, reason: authority === "ok" ? "invalid-amount" : authority, total: "0" };
  }
  if (!COMMERCE_CATALOG[item.key] && !merchant.customCatalog[item.key] && Object.keys(merchant.customCatalog).length >= 64) {
    return { wallet, merchant, item: null, applied: false, reason: "inventory-full", total: "0" };
  }
  const { total } = quoteMerchantTrade(merchant, item, quantity, "player-sells");
  const merchantBalance = subtractGold(merchant.gold, total);
  if (merchantBalance === null) return { wallet, merchant, item: null, applied: false, reason: "merchant-cannot-pay", total };
  const nextWallet = stampAtomic({ ...wallet, balance: addGold(wallet.balance, total) }, command);
  const customCatalog = COMMERCE_CATALOG[item.key] ? merchant.customCatalog : { ...merchant.customCatalog, [item.key]: item };
  const nextMerchant = stampAtomic({
    ...merchant,
    gold: merchantBalance,
    inventory: addMerchantStock(merchant.inventory, item.key, quantity, customCatalog),
    customCatalog,
  }, command);
  return { wallet: nextWallet, merchant: nextMerchant, item: { itemKey: item.key, count: quantity }, applied: true, reason: "ok", total };
}

function hashUnit(seed: string) {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

export function restockMerchant(merchant: MerchantState, worldDay: number, command: AuthorityCommand): EconomyMutation<MerchantState> {
  const authority = checkAuthority(merchant, command);
  const day = Math.max(0, Math.floor(worldDay));
  if (authority !== "ok") return { state: merchant, applied: false, reason: authority };
  if (day - merchant.lastRestockDay < 2) return { state: merchant, applied: false, reason: "invalid-amount" };
  const base = merchantOffersFor(merchant.factionId, merchant.profession);
  const inventory = base.map((stack, index) => ({
    itemKey: stack.itemKey,
    count: Math.max(1, Math.round(stack.count * (0.75 + hashUnit(`${merchant.restockSeed}|${day}|${index}`) * 0.5))),
  }));
  const purse = 180 + Math.floor(hashUnit(`${merchant.restockSeed}|gold|${day}`) * 221);
  const state = stampAuthority({ ...merchant, inventory: boundedMerchantInventory(inventory), customCatalog: {}, gold: normalizeGold(purse), lastRestockDay: day }, command);
  return { state, applied: true, reason: "ok" };
}

const MICRO_GOLD = BigInt(1_000_000);

export type BankAccountState = AuthorityStampedState & Readonly<{
  schema: 1;
  ownerId: string;
  bankerFaction: "hobbits";
  balanceMicroGold: GoldAmount;
  lastInterestDay: number;
}>;

export function createBankAccount(authorityId: string, ownerId: string, worldDay = 0): BankAccountState {
  return {
    schema: 1,
    authorityId,
    revision: 0,
    recentEventIds: [],
    ownerId,
    bankerFaction: "hobbits",
    balanceMicroGold: "0",
    lastInterestDay: Math.max(0, Math.floor(worldDay)),
  };
}

export function bankBalanceWholeGold(account: BankAccountState) {
  return (parseGold(account.balanceMicroGold) / MICRO_GOLD).toString();
}

export type BankTransferResult = Readonly<{
  wallet: GoldWalletState;
  account: BankAccountState;
  applied: boolean;
  reason: EconomyFailure;
}>;

export function depositAtBank(
  wallet: GoldWalletState,
  account: BankAccountState,
  wholeGold: GoldAmount | number,
  command: AtomicEconomyCommand,
): BankTransferResult {
  const authority = atomicAuthorityCheck(wallet, account, command);
  const amount = parseGold(wholeGold);
  if (authority !== "ok") return { wallet, account, applied: false, reason: authority };
  if (amount <= BigInt(0)) return { wallet, account, applied: false, reason: "invalid-amount" };
  const walletBalance = subtractGold(wallet.balance, amount);
  if (walletBalance === null) return { wallet, account, applied: false, reason: "insufficient-gold" };
  return {
    wallet: stampAtomic({ ...wallet, balance: walletBalance }, command),
    account: stampAtomic({ ...account, balanceMicroGold: addGold(account.balanceMicroGold, amount * MICRO_GOLD) }, command),
    applied: true,
    reason: "ok",
  };
}

export function withdrawFromBank(
  wallet: GoldWalletState,
  account: BankAccountState,
  wholeGold: GoldAmount | number,
  command: AtomicEconomyCommand,
): BankTransferResult {
  const authority = atomicAuthorityCheck(wallet, account, command);
  const amount = parseGold(wholeGold);
  if (authority !== "ok") return { wallet, account, applied: false, reason: authority };
  if (amount <= BigInt(0)) return { wallet, account, applied: false, reason: "invalid-amount" };
  const microAmount = amount * MICRO_GOLD;
  const balance = subtractGold(account.balanceMicroGold, microAmount);
  if (balance === null) return { wallet, account, applied: false, reason: "insufficient-gold" };
  return {
    wallet: stampAtomic({ ...wallet, balance: addGold(wallet.balance, amount) }, command),
    account: stampAtomic({ ...account, balanceMicroGold: balance }, command),
    applied: true,
    reason: "ok",
  };
}

/** Applies exactly five percent for each missed world day; loops are bounded. */
export function compoundBankInterest(account: BankAccountState, worldDay: number, command: AuthorityCommand): EconomyMutation<BankAccountState> {
  const authority = checkAuthority(account, command);
  const targetDay = Math.max(account.lastInterestDay, Math.floor(worldDay));
  if (authority !== "ok") return { state: account, applied: false, reason: authority };
  const elapsed = Math.min(36_500, targetDay - account.lastInterestDay);
  if (elapsed <= 0) return { state: account, applied: false, reason: "invalid-amount" };
  let balance = parseGold(account.balanceMicroGold);
  for (let day = 0; day < elapsed; day += 1) balance = balance * BigInt(105) / BigInt(100);
  const state = stampAuthority({ ...account, balanceMicroGold: balance.toString(), lastInterestDay: account.lastInterestDay + elapsed }, command);
  return { state, applied: true, reason: "ok" };
}

export const STOCK_SYMBOLS = ["BURR", "MOSS", "TIDE", "LAMP"] as const;
export type StockSymbol = (typeof STOCK_SYMBOLS)[number];

export type StockDefinition = Readonly<{
  symbol: StockSymbol;
  name: string;
  description: string;
  initialPriceGold: number;
  driftBasisPoints: number;
}>;

export const STOCKS: Readonly<Record<StockSymbol, StockDefinition>> = {
  BURR: { symbol: "BURR", name: "Burr & Bolt Works", description: "Freehold tools and crossbow fittings.", initialPriceGold: 54, driftBasisPoints: 26 },
  MOSS: { symbol: "MOSS", name: "Mossway Caravans", description: "Overland produce and wool freight.", initialPriceGold: 37, driftBasisPoints: 22 },
  TIDE: { symbol: "TIDE", name: "Tideglass Shipping", description: "River and coast cargo service.", initialPriceGold: 68, driftBasisPoints: 18 },
  LAMP: { symbol: "LAMP", name: "Lamploom Cooperative", description: "Settlement lights, wax, and glass.", initialPriceGold: 43, driftBasisPoints: 24 },
};

export type StockQuote = Readonly<{
  priceGold: number;
  splitCount: number;
  lastChangeBasisPoints: number;
}>;

export type StockMarketState = AuthorityStampedState & Readonly<{
  schema: 1;
  ownerId: string;
  worldSeed: string;
  day: number;
  quotes: Readonly<Record<StockSymbol, StockQuote>>;
  holdings: Readonly<Record<StockSymbol, GoldAmount>>;
}>;

export function createStockMarket(authorityId: string, ownerId: string, worldSeed: string, day = 0): StockMarketState {
  return {
    schema: 1,
    authorityId,
    revision: 0,
    recentEventIds: [],
    ownerId,
    worldSeed,
    day: Math.max(0, Math.floor(day)),
    quotes: Object.fromEntries(STOCK_SYMBOLS.map((symbol) => [symbol, {
      priceGold: STOCKS[symbol].initialPriceGold,
      splitCount: 0,
      lastChangeBasisPoints: 0,
    }])) as Record<StockSymbol, StockQuote>,
    holdings: Object.fromEntries(STOCK_SYMBOLS.map((symbol) => [symbol, "0"])) as Record<StockSymbol, GoldAmount>,
  };
}

/** Daily noise is volatile but zero-centered; a modest positive drift wins over long horizons. */
export function stepStockMarket(market: StockMarketState, targetDay: number, command: AuthorityCommand): EconomyMutation<StockMarketState> {
  const authority = checkAuthority(market, command);
  if (authority !== "ok") return { state: market, applied: false, reason: authority };
  const elapsed = Math.min(36_500, Math.max(0, Math.floor(targetDay) - market.day));
  if (elapsed === 0) return { state: market, applied: false, reason: "invalid-amount" };
  const quotes = { ...market.quotes };
  const holdings = { ...market.holdings };
  for (let offset = 1; offset <= elapsed; offset += 1) {
    const day = market.day + offset;
    for (const symbol of STOCK_SYMBOLS) {
      const definition = STOCKS[symbol];
      const noise = Math.floor(hashUnit(`${market.worldSeed}|${symbol}|${day}`) * 761) - 380;
      const change = definition.driftBasisPoints + noise;
      let priceGold = Math.max(1, Math.round(quotes[symbol].priceGold * (10_000 + change) / 10_000));
      let splitCount = quotes[symbol].splitCount;
      if (priceGold >= 240) {
        priceGold = Math.max(1, Math.round(priceGold / 2));
        holdings[symbol] = (parseGold(holdings[symbol]) * BigInt(2)).toString();
        splitCount += 1;
      }
      quotes[symbol] = { priceGold, splitCount, lastChangeBasisPoints: change };
    }
  }
  const state = stampAuthority({ ...market, day: market.day + elapsed, quotes, holdings }, command);
  return { state, applied: true, reason: "ok" };
}

export type StockTradeResult = Readonly<{
  wallet: GoldWalletState;
  market: StockMarketState;
  applied: boolean;
  reason: EconomyFailure;
  total: GoldAmount;
}>;

export function buyStock(
  wallet: GoldWalletState,
  market: StockMarketState,
  symbol: StockSymbol,
  shares: GoldAmount | number,
  command: AtomicEconomyCommand,
): StockTradeResult {
  const authority = atomicAuthorityCheck(wallet, market, command);
  const quantity = parseGold(shares);
  const total = (quantity * BigInt(market.quotes[symbol].priceGold)).toString();
  if (authority !== "ok") return { wallet, market, applied: false, reason: authority, total: "0" };
  if (quantity <= BigInt(0)) return { wallet, market, applied: false, reason: "invalid-amount", total: "0" };
  const balance = subtractGold(wallet.balance, total);
  if (balance === null) return { wallet, market, applied: false, reason: "insufficient-gold", total };
  return {
    wallet: stampAtomic({ ...wallet, balance }, command),
    market: stampAtomic({ ...market, holdings: { ...market.holdings, [symbol]: addGold(market.holdings[symbol], quantity) } }, command),
    applied: true,
    reason: "ok",
    total,
  };
}

export function sellStock(
  wallet: GoldWalletState,
  market: StockMarketState,
  symbol: StockSymbol,
  shares: GoldAmount | number,
  command: AtomicEconomyCommand,
): StockTradeResult {
  const authority = atomicAuthorityCheck(wallet, market, command);
  const quantity = parseGold(shares);
  const total = (quantity * BigInt(market.quotes[symbol].priceGold)).toString();
  if (authority !== "ok") return { wallet, market, applied: false, reason: authority, total: "0" };
  if (quantity <= BigInt(0)) return { wallet, market, applied: false, reason: "invalid-amount", total: "0" };
  const remaining = subtractGold(market.holdings[symbol], quantity);
  if (remaining === null) return { wallet, market, applied: false, reason: "insufficient-stock", total };
  return {
    wallet: stampAtomic({ ...wallet, balance: addGold(wallet.balance, total) }, command),
    market: stampAtomic({ ...market, holdings: { ...market.holdings, [symbol]: remaining } }, command),
    applied: true,
    reason: "ok",
    total,
  };
}

export function stockPortfolioValueGold(market: StockMarketState) {
  return STOCK_SYMBOLS.reduce((total, symbol) => total + parseGold(market.holdings[symbol]) * BigInt(market.quotes[symbol].priceGold), BigInt(0)).toString();
}
