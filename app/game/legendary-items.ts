import { BlockId, Item, type ItemCode } from "./data";

/**
 * Release-stable identities and mechanics for authored legendary treasure.
 *
 * The catalogue is deliberately renderer-independent: generation, combat,
 * mining, tooltips and audit tooling all consume the same values. Infinite
 * durability is a semantic flag rather than a huge sentinel number, so saves
 * cannot accidentally turn an heirloom into a nearly-broken ordinary tool.
 */
export type LegendaryItemId = "dawnthread-saber" | "deepdelvers-promise" | "briarheart-crook";

export type LegendaryProvenance = Readonly<{
  dungeon: "rootbound-labyrinth" | "starless-observatory" | "brassdeep-foundry" | "stormglass-citadel" | "bloomrot-cathedral";
  lootTable: "rootbound-vault" | "starless-vault" | "brassdeep-vault" | "stormglass-vault" | "bloomrot-vault";
  note: string;
}>;

export type LegendaryItemContract = Readonly<{
  id: LegendaryItemId;
  item: ItemCode;
  name: string;
  epithet: string;
  infiniteDurability: boolean;
  mechanic: string;
  provenance: readonly LegendaryProvenance[];
}>;

export const LEGENDARY_ITEMS: Readonly<Record<LegendaryItemId, LegendaryItemContract>> = Object.freeze({
  "dawnthread-saber": Object.freeze({
    id: "dawnthread-saber",
    item: Item.DawnthreadSaber,
    name: "Dawnthread Saber",
    epithet: "The edge that remembers sunrise",
    infiniteDurability: true,
    mechanic: "Never loses durability and deals 35% more damage to undead and constructs.",
    provenance: Object.freeze([
      Object.freeze({ dungeon: "rootbound-labyrinth", lootTable: "rootbound-vault", note: "Rare in the Heartroot Reliquary." }),
      Object.freeze({ dungeon: "bloomrot-cathedral", lootTable: "bloomrot-vault", note: "Rare beneath the Dawn Rose altar." }),
    ]),
  }),
  "deepdelvers-promise": Object.freeze({
    id: "deepdelvers-promise",
    item: Item.DeepdelversPromise,
    name: "Deepdelver's Promise",
    epithet: "No honest stone bars the road",
    infiniteDurability: true,
    mechanic: "Never loses durability and mines stone, ore, crystal and deepstone 50% faster.",
    provenance: Object.freeze([
      Object.freeze({ dungeon: "brassdeep-foundry", lootTable: "brassdeep-vault", note: "Rare in the quenched master-vault." }),
    ]),
  }),
  "briarheart-crook": Object.freeze({
    id: "briarheart-crook",
    item: Item.BriarheartCrook,
    name: "Briarheart Crook",
    epithet: "A living focus bound in stormglass",
    infiniteDurability: false,
    mechanic: "Deals 20% more damage to hostile creatures and carries 6,000 durability.",
    provenance: Object.freeze([
      Object.freeze({ dungeon: "starless-observatory", lootTable: "starless-vault", note: "Rare in the sealed astrolabe archive." }),
      Object.freeze({ dungeon: "stormglass-citadel", lootTable: "stormglass-vault", note: "Rare in the crown observatory." }),
    ]),
  }),
});

const INFINITE_ITEMS = new Set<ItemCode>(Object.values(LEGENDARY_ITEMS)
  .filter((item) => item.infiniteDurability)
  .map((item) => item.item));

export function isInfiniteDurabilityItem(item: ItemCode | undefined | null) {
  return item !== undefined && item !== null && INFINITE_ITEMS.has(item);
}

export function legendaryCombatMultiplier(item: ItemCode | undefined, target: Readonly<{ hostile: boolean; family?: string }>) {
  if (item === Item.DawnthreadSaber && (target.family === "undead" || target.family === "construct")) return 1.35;
  if (item === Item.BriarheartCrook && target.hostile) return 1.2;
  return 1;
}

const DEEPDELVER_BLOCKS = new Set<BlockId>([
  BlockId.Stone,
  BlockId.Deepstone,
  BlockId.Cobblestone,
  BlockId.Limestone,
  BlockId.MoonSlate,
  BlockId.SnowcapStone,
  BlockId.CoalOre,
  BlockId.IronOre,
  BlockId.CopperOre,
  BlockId.GoldOre,
  BlockId.CrystalOre,
]);

export function legendaryMiningMultiplier(item: ItemCode | undefined, block: BlockId) {
  return item === Item.DeepdelversPromise && DEEPDELVER_BLOCKS.has(block) ? 1.5 : 1;
}

export function legendaryContractForItem(item: ItemCode | undefined | null) {
  return Object.values(LEGENDARY_ITEMS).find((entry) => entry.item === item) ?? null;
}
