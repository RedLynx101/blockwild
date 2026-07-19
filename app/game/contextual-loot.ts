import { BlockId, Item, ITEMS, type InventorySlot, type ItemCode } from "./data";
import type { GuildId } from "./guilds";
import type { FactionId } from "./factions";

export const CONTEXTUAL_LOOT_GENERATOR_VERSION = 2 as const;
export type LootArchetype = "crate" | "chest" | "barrel" | "urn" | "satchel" | "locker" | "rack" | "cache" | "reliquary";
export type LootDepthBand = "surface" | "shallow" | "deep" | "abyssal";
export type LootOwnership = "abandoned" | "public" | "private" | "hostile" | "quest";
export type LootRarity = "common" | "uncommon" | "rare" | "very-rare";
export type LootFamilyId = "prospector" | "witch-garden" | "rattlekin" | "skywatch" | "aqueduct" | "wreck" | "toll-camp" | "listening-tree" | "dungeon-staging" | "dungeon-specialist" | "dungeon-vault" | "guild-hall" | "settlement" | "wilderness-cache";

export type LootContext = Readonly<{
  generatorVersion: number; containerId: string; archetype: LootArchetype; structureKind: string; roomRole: string;
  biomeId: number; depthBand: LootDepthBand; dangerTier: number; factionId?: FactionId; guildId?: GuildId;
  ownership?: LootOwnership; lockTier?: number; progressionTags: readonly string[]; seed: number;
  criticalItems?: readonly ItemCode[]; acquiredUniqueIds?: ReadonlySet<string>; luck?: number;
}>;
export type LootEntry = Readonly<{ item: ItemCode; min: number; max: number; weight: number; rarity: LootRarity; uniqueId?: string; fallbackItem?: ItemCode }>;
export type LootFamily = Readonly<{ id: LootFamilyId; aliases: readonly string[]; purpose: Readonly<Record<string, readonly LootEntry[]>>; optional: readonly LootEntry[]; signatureItems: readonly ItemCode[]; ownership: LootOwnership }>;
export type ResolvedLoot = Readonly<{ slots: readonly (InventorySlot | null)[]; familyId: LootFamilyId; guaranteedCount: number; optionalCount: number; uniqueIds: readonly string[]; ownership: LootOwnership; theft: boolean; valueBand: "survival" | "useful" | "valuable" | "exceptional" }>;
export type LootContainerRecord = Readonly<{
  generatorVersion: number;
  familyId: LootFamilyId;
  ownership: LootOwnership;
  theft: boolean;
  theftReported: boolean;
}>;
export type ContextualLootWorldState = Readonly<{
  schema: 1;
  acquiredUniqueIds: readonly string[];
  containers: Readonly<Record<string, LootContainerRecord>>;
}>;

export function normalizeContextualLootWorldState(value: unknown): ContextualLootWorldState {
  const input = value && typeof value === "object" ? value as Partial<ContextualLootWorldState> : {};
  const acquiredUniqueIds = Object.freeze([...new Set((input.acquiredUniqueIds ?? [])
    .filter((id): id is string => typeof id === "string" && id.length > 0 && id.length <= 128))].slice(-512));
  const containers = Object.fromEntries(Object.entries(input.containers ?? {}).flatMap(([id, record]) => {
    if (!record || typeof record !== "object" || !(record.familyId in LOOT_FAMILIES)) return [];
    const ownership: LootOwnership = ["abandoned", "public", "private", "hostile", "quest"].includes(record.ownership)
      ? record.ownership : LOOT_FAMILIES[record.familyId].ownership;
    return [[id.slice(0, 192), Object.freeze({
      generatorVersion: Math.max(1, Math.floor(Number(record.generatorVersion) || 1)),
      familyId: record.familyId,
      ownership,
      theft: Boolean(record.theft),
      theftReported: Boolean(record.theftReported),
    })]];
  }).slice(-4096));
  return Object.freeze({ schema: 1, acquiredUniqueIds, containers: Object.freeze(containers) });
}

const e = (item: ItemCode, min = 1, max = min, weight = 1, rarity: LootRarity = "common", uniqueId?: string, fallbackItem?: ItemCode): LootEntry => Object.freeze({ item, min, max, weight, rarity, ...(uniqueId ? { uniqueId } : {}), ...(fallbackItem ? { fallbackItem } : {}) });
const tools = [e(Item.StonePickaxe), e(Item.IronPickaxe, 1, 1, .35, "rare"), e(Item.Rope, 2, 6), e(Item.PitonItem, 2, 5)];
const food = [e(Item.Bread, 1, 3), e(Item.Berry, 2, 5), e(Item.CookedMeat, 1, 2, .5, "uncommon")];
const care = [e(Item.HealthPotion, 1, 2, .65, "uncommon"), e(Item.GlowmenderSalve, 1, 2, .5, "uncommon"), e(BlockId.Torch, 3, 8)];

export const LOOT_FAMILIES: Readonly<Record<LootFamilyId, LootFamily>> = Object.freeze({
  prospector: { id: "prospector", aliases: ["prospector", "survey", "mine-camp"], purpose: { provisions: food, survey: [e(Item.RawIron, 2, 5), e(Item.RawCopper, 2, 5), e(Item.Flint, 1, 3), ...tools] }, optional: [e(Item.GoldIngot, 1, 2, .28, "rare"), e(Item.CrystalShard, 1, 2, .16, "very-rare"), e(Item.VeinmetalFlake, 1, 1, .08, "very-rare")], signatureItems: [Item.RawIron, Item.RawCopper], ownership: "abandoned" },
  "witch-garden": { id: "witch-garden", aliases: ["witch", "garden", "brew"], purpose: { ingredients: [e(Item.Moonpetal, 1, 3), e(Item.StarfernFrond, 1, 3), e(Item.GlowDust, 1, 4)], hazard: [e(Item.HealthPotion), e(Item.WaterBottle, 1, 2)] }, optional: [e(Item.ManaheartDraught, 1, 1, .18, "rare"), e(Item.LivingInk, 1, 2, .35, "uncommon"), e(Item.BoundBook, 1, 1, .12, "very-rare")], signatureItems: [Item.Moonpetal, Item.StarfernFrond], ownership: "private" },
  rattlekin: { id: "rattlekin", aliases: ["rattlekin", "bone", "ossuary"], purpose: { armory: [e(Item.BoneShard, 3, 8), e(Item.CrossbowBolt, 4, 12), e(Item.RottenFlesh, 1, 3)] }, optional: [e(Item.IronSword, 1, 1, .25, "rare"), e(Item.Hide, 1, 3, .6, "uncommon"), e(Item.GoblinsmithSpear, 1, 1, .08, "very-rare")], signatureItems: [Item.BoneShard, Item.CrossbowBolt], ownership: "hostile" },
  skywatch: { id: "skywatch", aliases: ["skywatch", "observatory", "stormglass"], purpose: { signal: [e(Item.CrystalShard, 1, 3), e(Item.GlowDust, 2, 5), e(Item.WindSilk, 1, 2)] }, optional: [e(Item.SunwardCompass, 1, 1, .3, "rare"), e(Item.CloudglassRelic, 1, 1, .12, "very-rare"), e(Item.FineCrossbowBlueprint, 1, 1, .08, "very-rare")], signatureItems: [Item.WindSilk, Item.CloudglassRelic], ownership: "abandoned" },
  aqueduct: { id: "aqueduct", aliases: ["aqueduct", "bathhouse", "cistern"], purpose: { machinery: [e(Item.IronIngot, 1, 3), e(Item.CopperIngot, 1, 3), e(Item.WaterBottle, 1, 3)], guest: [e(Item.Honeymead), e(Item.GlowmenderSalve)] }, optional: [e(Item.Reefglass, 1, 2, .4, "uncommon"), e(Item.LumenPearl, 1, 1, .18, "rare"), e(Item.TideglassTrident, 1, 1, .025, "very-rare")], signatureItems: [Item.WaterBottle, Item.Reefglass], ownership: "public" },
  wreck: { id: "wreck", aliases: ["wreck", "sunken", "caravan"], purpose: { locker: [e(Item.WaterBreathingPotion), e(Item.Rope, 2, 5), e(Item.CookedFish, 1, 3)], cargo: [e(Item.Hide, 1, 4), e(Item.IronIngot, 1, 4)] }, optional: [e(Item.PrismaticPearl, 1, 1, .12, "very-rare"), e(Item.BreatherCharm, 1, 1, .22, "rare"), e(Item.GoldIngot, 1, 3, .35, "rare")], signatureItems: [Item.Rope, Item.WaterBreathingPotion], ownership: "abandoned" },
  "toll-camp": { id: "toll-camp", aliases: ["toll", "road-ambush", "checkpoint"], purpose: { rations: food, repair: [e(BlockId.Planks, 4, 10), e(Item.IronIngot, 1, 3), e(Item.Rope, 2, 5)] }, optional: [e(Item.GoldIngot, 1, 4, .5, "uncommon"), e(Item.WargFeed, 1, 3, .4, "uncommon"), e(Item.WayfarerPotion, 1, 1, .25, "rare")], signatureItems: [Item.Bread, Item.Rope], ownership: "hostile" },
  "listening-tree": { id: "listening-tree", aliases: ["tea", "listening-tree", "hospitality"], purpose: { pantry: [e(Item.HoneyJar), e(Item.Berry, 2, 5), e(Item.Apple, 1, 3)], stories: [e(Item.BoundBook), e(Item.RareSeedPouch)] }, optional: [e(Item.LivingInk, 1, 2, .4, "uncommon"), e(Item.Moonpetal, 1, 2, .45, "uncommon"), e(Item.PrismaticPearl, 1, 1, .05, "very-rare")], signatureItems: [Item.HoneyJar, Item.BoundBook], ownership: "private" },
  "dungeon-staging": { id: "dungeon-staging", aliases: ["staging", "anteroom", "camp"], purpose: { recovery: care, provisions: food }, optional: [e(Item.IronSword, 1, 1, .18, "rare"), e(Item.WayfarerPotion, 1, 2, .4, "uncommon"), e(Item.CrossbowBolt, 5, 12, .6, "uncommon")], signatureItems: [Item.HealthPotion, BlockId.Torch], ownership: "abandoned" },
  "dungeon-specialist": { id: "dungeon-specialist", aliases: ["specialist", "trap", "laboratory"], purpose: { fieldkit: [e(Item.PitonItem, 2, 5), e(Item.Rope, 2, 5), e(Item.CaveMarkerItem, 1, 3)] }, optional: [e(Item.ResonantCrystalItem, 1, 2, .3, "rare"), e(Item.LivingInk, 1, 2, .3, "rare"), e(Item.GearCluster, 1, 2, .25, "rare")], signatureItems: [Item.CaveMarkerItem, Item.PitonItem], ownership: "abandoned" },
  "dungeon-vault": { id: "dungeon-vault", aliases: ["vault", "reliquary", "boss"], purpose: { reward: [e(Item.GoldIngot, 2, 6, 1, "rare"), e(Item.CrystalShard, 2, 4, 1, "rare")] }, optional: [e(Item.PrismaticPearl, 1, 1, .35, "very-rare", "vault-prismatic-pearl", Item.LumenPearl), e(Item.NocturneHeart, 1, 1, .18, "very-rare", "vault-nocturne-heart", Item.ShadowShard), e(Item.Worldpin, 1, 1, .05, "very-rare", "vault-worldpin", Item.VeinmetalFlake)], signatureItems: [Item.GoldIngot, Item.CrystalShard], ownership: "hostile" },
  "guild-hall": { id: "guild-hall", aliases: ["guild", "hall", "quartermaster", "member-locker"], purpose: { public: [e(Item.Bread), e(BlockId.Torch, 2, 4)], rescue: care, survey: tools }, optional: [e(Item.CaptureOrb, 1, 2, .35, "uncommon"), e(Item.Worldpin, 1, 1, .025, "very-rare"), e(Item.GoldIngot, 1, 2, .25, "rare")], signatureItems: [Item.Bread, BlockId.Torch], ownership: "private" },
  settlement: { id: "settlement", aliases: ["home", "shop", "settlement", "pantry"], purpose: { pantry: food, workshop: [e(Item.Stick, 2, 6), e(BlockId.Planks, 2, 6), e(Item.IronIngot, 1, 2)] }, optional: [e(Item.HoneyJar, 1, 2, .35, "uncommon"), e(Item.GoldIngot, 1, 2, .16, "rare"), e(Item.HealthPotion, 1, 1, .18, "rare")], signatureItems: [Item.Bread, BlockId.Planks], ownership: "private" },
  "wilderness-cache": { id: "wilderness-cache", aliases: ["cache", "wilderness", "adventure"], purpose: { supplies: [e(BlockId.Torch, 3, 8), e(Item.Bread, 1, 3), e(Item.Rope, 1, 4)] }, optional: [e(Item.IronIngot, 1, 3, .5, "uncommon"), e(Item.GlowDust, 1, 4, .45, "uncommon"), e(Item.GoldIngot, 1, 2, .18, "rare"), e(Item.CrystalShard, 1, 2, .07, "very-rare")], signatureItems: [BlockId.Torch, Item.Bread], ownership: "abandoned" },
});

function familyFor(context: LootContext) {
  const text = `${context.structureKind} ${context.roomRole}`.toLowerCase();
  return Object.values(LOOT_FAMILIES).find((family) => family.aliases.some((alias) => text.includes(alias))) ?? LOOT_FAMILIES["wilderness-cache"];
}
function rng(seed: number) { let state = seed >>> 0; return () => { state += 0x6d2b79f5; let value = state; value = Math.imul(value ^ value >>> 15, value | 1); value ^= value + Math.imul(value ^ value >>> 7, value | 61); return ((value ^ value >>> 14) >>> 0) / 4294967296; }; }
function choose(random: () => number, entries: readonly LootEntry[]) { const total = entries.reduce((sum, entry) => sum + Math.max(0, entry.weight), 0); let roll = random() * total; for (const entry of entries) { roll -= Math.max(0, entry.weight); if (roll <= 0) return entry; } return entries.at(-1) ?? null; }
function rollStack(entry: LootEntry, random: () => number, acquired: ReadonlySet<string>) { const item = entry.uniqueId && acquired.has(entry.uniqueId) ? entry.fallbackItem ?? entry.item : entry.item; return { item, count: entry.min + Math.floor(random() * Math.max(1, entry.max - entry.min + 1)), ...(ITEMS[item]?.maxDurability ? { durability: ITEMS[item].maxDurability } : {}) } as InventorySlot; }

export function resolveContextualLoot(context: LootContext): ResolvedLoot {
  const family = familyFor(context); const random = rng(context.seed ^ context.containerId.length * 2654435761); const slots = Array.from({ length: 27 }, () => null as InventorySlot | null); const acquired = context.acquiredUniqueIds ?? new Set<string>(); const uniques: string[] = [];
  const issued = new Set(acquired);
  const roomEntries = family.purpose[context.roomRole] ?? Object.values(family.purpose)[0] ?? [];
  const guaranteed = [...(context.criticalItems ?? []).map((item) => e(item)), ...(roomEntries.length ? [roomEntries[Math.floor(random() * roomEntries.length)]] : [])];
  const stacks: InventorySlot[] = guaranteed.map((entry) => rollStack(entry, random, acquired));
  const depthBonus = context.depthBand === "abyssal" ? 2 : context.depthBand === "deep" ? 1 : 0; const optionalRolls = Math.min(6, 1 + Math.floor(Math.max(0, context.dangerTier) / 2) + Math.floor(Math.max(0, context.lockTier ?? 0) / 2) + depthBonus);
  for (let index = 0; index < optionalRolls; index += 1) { const entry = choose(random, family.optional); if (!entry) continue; const rarityGate = entry.rarity === "very-rare" ? .16 : entry.rarity === "rare" ? .42 : entry.rarity === "uncommon" ? .72 : 1; const luck = Math.max(0, Math.min(1000, context.luck ?? 0)); if (random() > Math.min(.92, rarityGate + luck * .00018)) continue; stacks.push(rollStack(entry, random, issued)); if (entry.uniqueId && !issued.has(entry.uniqueId)) { uniques.push(entry.uniqueId); issued.add(entry.uniqueId); } }
  // Local material identity without turning every chest into a biome sampler.
  if (context.depthBand === "deep" || context.depthBand === "abyssal") stacks.push({ item: context.depthBand === "abyssal" ? Item.ResonantCrystalItem : Item.RawIron, count: 1 + Math.floor(random() * 2) });
  for (let index = 0; index < stacks.length && index < 27; index += 1) slots[(index * 7 + 3) % 27] = stacks[index];
  const score = context.dangerTier + (context.lockTier ?? 0) + depthBonus * 2; const valueBand = score >= 12 ? "exceptional" : score >= 7 ? "valuable" : score >= 3 ? "useful" : "survival";
  const ownership = context.ownership ?? family.ownership;
  return Object.freeze({ slots: Object.freeze(slots), familyId: family.id, guaranteedCount: guaranteed.length, optionalCount: Math.max(0, stacks.length - guaranteed.length), uniqueIds: Object.freeze(uniques), ownership, theft: ownership === "private", valueBand });
}

export function lootPoolJaccard(left: LootFamilyId, right: LootFamilyId) { const a = new Set(LOOT_FAMILIES[left].optional.map((entry) => entry.item)); const b = new Set(LOOT_FAMILIES[right].optional.map((entry) => entry.item)); const union = new Set([...a, ...b]); return union.size ? [...a].filter((item) => b.has(item)).length / union.size : 0; }
export function auditLootFamilies() {
  const errors: string[] = []; const unrelated = Object.keys(LOOT_FAMILIES) as LootFamilyId[];
  for (const family of Object.values(LOOT_FAMILIES)) if (!Object.values(family.purpose).some((entries) => entries.length)) errors.push(`${family.id} has no guaranteed purpose slot.`);
  for (let left = 0; left < unrelated.length; left += 1) for (let right = left + 1; right < unrelated.length; right += 1) if (lootPoolJaccard(unrelated[left], unrelated[right]) > .6) errors.push(`${unrelated[left]} and ${unrelated[right]} optional pools overlap above 60%.`);
  return Object.freeze(errors);
}
