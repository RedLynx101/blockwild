import { BlockId, Item, type InventorySlot, type ItemCode } from "./data";

/** Bridges the pure string-based simulation modules to stable numeric save ids. */
export const HEARTHROADS_RESOURCE_ITEMS: Readonly<Record<string, ItemCode>> = Object.freeze({
  "glass-bottle": Item.GlassBottle,
  "water-bottle": Item.WaterBottle,
  "apple": Item.Apple,
  "moonberry": Item.Berry,
  "sunberry": Item.Sunberry,
  "glow-scale": Item.GlowScale,
  "honey-jar": Item.HoneyJar,
  "cloudbell": BlockId.Cloudbell,
  "cave-gel": Item.CaveGel,
  "wild-wheat": Item.Wheat,
  "torch": BlockId.Torch,
  "raw-iron": Item.RawSunmetal,
  "raw-gold": Item.RawGold,
  "gold-ingot": Item.GoldIngot,
  "appleheart-potion": Item.HealthPotion,
  "wayfarer-draught": Item.WayfarerPotion,
  "hearthward-tonic": Item.HearthwardTonic,
  "gloamstep-elixir": Item.GloamstepElixir,
  "lumen-kelp-frond": Item.LumenKelpFrond,
  "abyss-bloom-nectar": Item.AbyssBloomNectar,
  "tidebreath-philter": Item.WaterBreathingPotion,
  "water-breathing-potion": Item.WaterBreathingPotion,
  "glow-kelp": BlockId.GlowKelp,
  "shellfruit": Item.Shellfruit,
  "reefglass": Item.Reefglass,
  "living-coral": Item.LivingCoral,
  "lumen-pearl": Item.LumenPearl,
  "prismatic-pearl": Item.PrismaticPearl,
  "tideglass-trident": Item.TideglassTrident,
  "glowmender-salve": Item.GlowmenderSalve,
  "tidevine-fiber": Item.TidevineFiber,
  "tempered-spear": Item.TemperedRootspike,
  "glow-root": Item.GlowRoot,
  "rare-seed-pouch": Item.RareSeedPouch,
  "warg-feed": Item.WargFeed,
  "honeymead": Item.Honeymead,
  "crossbow-bolt": Item.CrossbowBolt,
  "gumdrop": Item.Gumdrop,
  "lollipop-petal": Item.LollipopPetal,
  "cocoa-nib": Item.CocoaNib,
  "peppermint-cane": Item.PeppermintCane,
  "marshmallow-tuft": Item.MarshmallowTuft,
  "chocolate-bunny": Item.ChocolateBunny,
  "candied-alloy": Item.CandiedAlloy,
  "boiled-sugarbrick": Item.BoiledSugarbrickItem,
  "crystal-shard": Item.CrystalShard,
  "stick": Item.Stick,
  "rockcandy-saber": Item.RockcandySaber,
  "peppermint-pike": Item.PeppermintLance,
  "fondant-crown": Item.FondantCrown,
  "fondant-cuirass": Item.FondantCuirass,
  "fondant-greaves": Item.FondantGreaves,
  "fondant-boots": Item.FondantBoots,
  "peppermint-rush": Item.PeppermintRush,
  "marshmallow-ward": Item.MarshmallowWard,
  "dragon-heart": Item.FireDragonHeart,
  "fire-dragon-heart": Item.FireDragonHeart,
  "ice-dragon-heart": Item.IceDragonHeart,
  "steel-dragon-heart": Item.SteelDragonHeart,
  "gold-dragon-heart": Item.GoldDragonHeart,
  "silver-dragon-heart": Item.SilverDragonHeart,
  "manaheart-draught": Item.ManaheartDraught,
  "fire-dragon-scale": Item.FireDragonScale,
  "ice-dragon-scale": Item.IceDragonScale,
  "steel-dragon-scale": Item.SteelDragonScale,
  "gold-dragon-scale": Item.GoldDragonScale,
  "silver-dragon-scale": Item.SilverDragonScale,
  "dragon-bone": Item.DragonBone,
  "dragon-meal": Item.DragonMeal,
  "tome-flame-jet": Item.TomeFlameJet,
  "tome-frost-lance": Item.TomeFrostLance,
  "tome-steel-spear": Item.TomeSteelSpear,
  "tome-healing-light": Item.TomeHealingLight,
  "tome-blinkstep": Item.TomeBlinkstep,
  "tome-arcane-ward": Item.TomeArcaneWard,
  "rotten-flesh": Item.RottenFlesh,
  "moonpetal": Item.Moonpetal,
  "starfern": Item.StarfernFrond,
  "dreamcap": Item.Dreamcap,
  "lumenreed-frond": Item.LumenreedFrond,
  "moonstep-elixir": Item.MoonstepElixir,
  "verdant-renewal": Item.VerdantRenewal,
  "gear-cluster": Item.GearCluster,
  "deepgear-alloy": Item.DeepgearAlloy,
  "copper-ore": BlockId.CopperOre,
  "stone-brick": BlockId.StoneBrick,
  "sunmetal-ingot": Item.SunmetalIngot,
  "lead-ball": Item.FlintlockBall,
  "copper-scout-golem-orb": Item.CopperScoutOrb,
  "deepgear-courser-golem-orb": Item.DeepgearCourserOrb,
  "sea-dragon-egg": Item.SeaDragonEgg,
  "sea-dragon-scale": Item.SeaDragonScale,
  "sea-dragon-heart": Item.SeaDragonHeart,
  "sea-dragon-skull": Item.SeaDragonSkull,
  "sea-dragon-nest-chart": Item.SeaDragonNestChart,
  "tideglass-dragon-armor": Item.TideglassDragonArmorModule,
  "gold-dragon-egg": Item.GoldDragonEgg,
  "silver-dragon-egg": Item.SilverDragonEgg,
  "gold-dragon-skull": Item.GoldDragonSkull,
  "silver-dragon-skull": Item.SilverDragonSkull,
  "solar-regalia-dragon-armor": Item.GoldDragonArmorModule,
  "moonmirror-dragon-armor": Item.SilverDragonArmorModule,
  "sunlily-catalyst": Item.GoldBreedingCatalyst,
  "moonlily-catalyst": Item.SilverBreedingCatalyst,
  "gilded-dragonstone": Item.GildedDragonstoneItem,
  "argent-dragonstone": Item.ArgentDragonstoneItem,
});

const RESOURCE_BY_ITEM = new Map(Object.entries(HEARTHROADS_RESOURCE_ITEMS).map(([resource, item]) => [item, resource] as const));

// Several historical/public resource names intentionally decode to the same
// numeric item. Keep their encoder canonical so saves and station inventories
// always round-trip to the stable authored id instead of whichever alias was
// declared last in the lookup table.
RESOURCE_BY_ITEM.set(Item.WaterBreathingPotion, "tidebreath-philter");
RESOURCE_BY_ITEM.set(Item.FireDragonHeart, "fire-dragon-heart");

export function resourceItemCode(resourceId: string) {
  return HEARTHROADS_RESOURCE_ITEMS[resourceId] ?? null;
}

export function resourceIdForItem(item: ItemCode) {
  return RESOURCE_BY_ITEM.get(item) ?? null;
}

export function inventoryResourceCounts(inventory: readonly (InventorySlot | null)[], extras: Readonly<Record<string, number>> = {}) {
  const counts: Record<string, number> = { ...extras };
  for (const slot of inventory) {
    if (!slot) continue;
    const resource = resourceIdForItem(slot.item);
    if (resource) counts[resource] = (counts[resource] ?? 0) + slot.count;
  }
  return counts;
}

/** Returns only decreases; callers consume these counts from real inventory slots. */
export function consumedResourceDelta(before: Readonly<Record<string, number>>, after: Readonly<Record<string, number>>) {
  const consumed: Record<string, number> = {};
  for (const [resource, count] of Object.entries(before)) {
    const delta = Math.max(0, Math.trunc(count) - Math.max(0, Math.trunc(after[resource] ?? 0)));
    if (delta > 0 && resourceItemCode(resource) !== null) consumed[resource] = delta;
  }
  return consumed;
}

export const POTION_RECIPE_BY_ITEM: Readonly<Partial<Record<ItemCode, string>>> = Object.freeze({
  [Item.HealthPotion]: "appleheart-potion",
  [Item.WayfarerPotion]: "wayfarer-draught",
  [Item.HearthwardTonic]: "hearthward-tonic",
  [Item.GloamstepElixir]: "gloamstep-elixir",
  [Item.WaterBreathingPotion]: "tidebreath-philter",
  [Item.GlowmenderSalve]: "glowmender-salve",
  [Item.PeppermintRush]: "peppermint-rush",
  [Item.MarshmallowWard]: "marshmallow-ward",
  [Item.ManaheartDraught]: "manaheart-draught",
  [Item.MoonstepElixir]: "moonstep-elixir",
  [Item.VerdantRenewal]: "verdant-renewal",
});

export const COMMERCE_ITEM_CODES: Readonly<Record<string, ItemCode>> = Object.freeze({
  apple: Item.Apple,
  moonberry: Item.Berry,
  "honey-jar": Item.HoneyJar,
  "royal-jelly": Item.RoyalJelly,
  mead: Item.Honeymead,
  "raw-iron": Item.RawSunmetal,
  "raw-gold": Item.RawGold,
  "gold-ingot": Item.GoldIngot,
  "plant-fiber": Item.Fiber,
  crossbow: Item.HearthguardCrossbow,
  "fine-crossbow": Item.WayfarerCrossbow,
  bolt: Item.CrossbowBolt,
  "goblin-spear": Item.GoblinsmithSpear,
  "tempered-spear": Item.TemperedRootspike,
  "glow-root": Item.GlowRoot,
  "rare-seed-pouch": Item.RareSeedPouch,
  "warg-feed": Item.WargFeed,
  "health-potion": Item.HealthPotion,
  "goblin-tonic": Item.GloamstepElixir,
  "hobbit-potion": Item.HearthwardTonic,
  "blueprint-crossbow": Item.HobbitCrossbowBlueprint,
  "blueprint-fine-crossbow": Item.FineCrossbowBlueprint,
  "blueprint-spear": Item.GoblinSpearBlueprint,
  "blueprint-goblin-tonic": Item.GloamstepBlueprint,
  "blueprint-hobbit-potion": Item.HearthwardBlueprint,
  "blueprint-mead": Item.MeadBlueprint,
  "cloudglass-relic": Item.CloudglassRelic,
  "unaligned-warg-orb": Item.CaptureOrb,
  "glow-kelp": BlockId.GlowKelp,
  "shellfruit": Item.Shellfruit,
  "reefglass": Item.Reefglass,
  "living-coral": Item.LivingCoral,
  "lumen-pearl": Item.LumenPearl,
  "prismatic-pearl": Item.PrismaticPearl,
  "tideglass-trident": Item.TideglassTrident,
  "glowmender-salve": Item.GlowmenderSalve,
  "torch": BlockId.Torch,
  "tidevine-fiber": Item.TidevineFiber,
  "peppermint-cane": Item.PeppermintCane,
  "peppermint-starts": Item.PeppermintSeeds,
  "cocoa-nib": Item.CocoaNib,
  "cocoa-seeds": Item.CocoaSeeds,
  gumdrop: Item.Gumdrop,
  "lollipop-petal": Item.LollipopPetal,
  "marshmallow-tuft": Item.MarshmallowTuft,
  "chocolate-bunny": Item.ChocolateBunny,
  "candied-alloy": Item.CandiedAlloy,
  "boiled-sugarbrick": Item.BoiledSugarbrickItem,
  sugarworks: Item.SugarworksItem,
  "honey-bucket": Item.HoneyBucket,
  "syrup-bucket": Item.SyrupBucket,
  "rockcandy-saber": Item.RockcandySaber,
  "peppermint-pike": Item.PeppermintLance,
  "fondant-crown": Item.FondantCrown,
  "fondant-cuirass": Item.FondantCuirass,
  "fondant-greaves": Item.FondantGreaves,
  "fondant-boots": Item.FondantBoots,
  "peppermint-rush": Item.PeppermintRush,
  "marshmallow-ward": Item.MarshmallowWard,
  "blueprint-sugarcourt-arms": Item.SugarcourtArmsBlueprint,
  "blueprint-sugarcourt-armor": Item.FondantArmorBlueprint,
  "blueprint-peppermint-rush": Item.PeppermintRushBlueprint,
  "blueprint-marshmallow-ward": Item.MarshmallowWardBlueprint,
  "unaligned-taffy-hound-orb": Item.CaptureOrb,
  "unaligned-praline-cat-orb": Item.CaptureOrb,
  "fire-lair-survey": Item.FireLairSurvey,
  "ice-lair-survey": Item.IceLairSurvey,
  "steel-lair-survey": Item.SteelLairSurvey,
  "gold-lair-survey": Item.GoldLairSurvey,
  "silver-lair-survey": Item.SilverLairSurvey,
  "elder-fire-lair-survey": Item.FireElderLairSurvey,
  "elder-ice-lair-survey": Item.IceElderLairSurvey,
  "elder-steel-lair-survey": Item.SteelElderLairSurvey,
  "elder-gold-lair-survey": Item.GoldElderLairSurvey,
  "elder-silver-lair-survey": Item.SilverElderLairSurvey,
  "tome-flame-jet": Item.TomeFlameJet,
  "tome-frost-lance": Item.TomeFrostLance,
  "tome-steel-spear": Item.TomeSteelSpear,
  "tome-healing-light": Item.TomeHealingLight,
  "tome-blinkstep": Item.TomeBlinkstep,
  "tome-arcane-ward": Item.TomeArcaneWard,
  "blueprint-dragonbone-arms": Item.DragonboneArmsBlueprint,
  "blueprint-dragon-scale-armor": Item.DragonScaleArmorBlueprint,
  "blueprint-draconic-incubator": Item.DraconicIncubatorBlueprint,
  "blueprint-dragon-husbandry": Item.DragonHusbandryBlueprint,
  "manaheart-draught": Item.ManaheartDraught,
  "moonbough-staff": Item.MoonboughStaff,
  glimmerbow: Item.Glimmerbow,
  "glimmer-arrow": Item.GlimmerArrow,
  moonpetal: Item.Moonpetal,
  starfern: Item.StarfernFrond,
  dreamcap: Item.Dreamcap,
  "lumenreed-frond": Item.LumenreedFrond,
  "moonstep-elixir": Item.MoonstepElixir,
  "verdant-renewal": Item.VerdantRenewal,
  "tome-verdant-volley": Item.TomeVerdantVolley,
  "tome-starlight-snare": Item.TomeStarlightSnare,
  "blueprint-glimmerbow": Item.GlimmerbowBlueprint,
  "blueprint-moonstep": Item.MoonstepBlueprint,
  "blueprint-verdant-renewal": Item.VerdantRenewalBlueprint,
  "unaligned-glimmerhart-orb": Item.GlimmerhartOrb,
  "unaligned-runeowl-orb": Item.RuneowlOrb,
  "flintlock-pistol": Item.FlintlockPistol,
  "lead-ball": Item.FlintlockBall,
  "deepgear-lantern": Item.DeepgearLanternItem,
  "gear-cluster": Item.GearCluster,
  "deepgear-alloy": Item.DeepgearAlloy,
  "copper-ore": BlockId.CopperOre,
  "blueprint-flintlock": Item.FlintlockBlueprint,
  "blueprint-copper-scout": Item.CopperScoutBlueprint,
  "blueprint-stone-bulwark": Item.StoneBulwarkBlueprint,
  "blueprint-aetherforged-sentinel": Item.AetherforgedSentinelBlueprint,
  "blueprint-deepgear-courser": Item.DeepgearCourserBlueprint,
  "copper-scout-golem-orb": Item.CopperScoutOrb,
  "deepgear-courser-golem-orb": Item.DeepgearCourserOrb,
  "unaligned-copper-mole-orb": Item.CopperMoleOrb,
  "sea-dragon-nest-chart": Item.SeaDragonNestChart,
});

// Filled-orb offer keys are purchase templates, not safe reverse identities:
// inventory metadata decides which creature is actually inside an orb.
const COMMERCE_BY_ITEM = new Map(Object.entries(COMMERCE_ITEM_CODES)
  .filter(([key]) => !key.startsWith("unaligned-") || !key.endsWith("-orb"))
  .map(([key, item]) => [item, key] as const));

export function commerceItemCode(itemKey: string) {
  return COMMERCE_ITEM_CODES[itemKey] ?? null;
}

export function commerceKeyForItem(item: ItemCode) {
  return COMMERCE_BY_ITEM.get(item) ?? null;
}
