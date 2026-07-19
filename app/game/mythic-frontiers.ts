import { BlockId } from "./data";
import type { LegendaryCreatureKind } from "./mobs";
import type { AdventureStructurePlan } from "./adventure-content";
import type { LegendarySiteRecoveryPolicy, LegendarySiteRole } from "./legendary-encounters";

export type MythicMaterialFamilyId = "nacre-tidework" | "windworn-alabaster" | "fossilroot-calcite" | "emberglass-archive" | "mirrorpeat-reedglass" | "moonfelt-mycelium";

export const MYTHIC_MATERIAL_FAMILIES = Object.freeze({
  "nacre-tidework": Object.freeze({ itemKey: "nacre-tidework", block: BlockId.NacreTidework, supportBlock: BlockId.Deepstone, accentBlock: BlockId.RivetedBrass, exceptionalBlock: BlockId.Glowstone, variants: Object.freeze(["sealed-wall", "arch", "drain", "garden-grate", "pearl-inset", "broken"]) }),
  "windworn-alabaster": Object.freeze({ itemKey: "windworn-alabaster", block: BlockId.WindwornAlabaster, supportBlock: BlockId.WildwoodLog, accentBlock: BlockId.RivetedBrass, exceptionalBlock: BlockId.Glowstone, variants: Object.freeze(["full", "slab", "stair", "cracked", "brace", "inset", "banner-socket"]) }),
  "fossilroot-calcite": Object.freeze({ itemKey: "fossilroot-calcite", block: BlockId.FossilrootCalcite, supportBlock: BlockId.Pillarstone, accentBlock: BlockId.MineralCrust, exceptionalBlock: BlockId.ResonantCrystal, variants: Object.freeze(["column", "spiral-fossil", "root-brace", "porous-floor", "cistern-lip", "damp"]) }),
  "emberglass-archive": Object.freeze({ itemKey: "emberglass-archive", block: BlockId.EmberglassArchive, supportBlock: BlockId.Basalt, accentBlock: BlockId.HeatCrackedRock, exceptionalBlock: BlockId.Whisperglass, variants: Object.freeze(["ash-brick", "kiln-plate", "vent", "shutter", "glass-pane", "heat-reveal-tablet"]) }),
  "mirrorpeat-reedglass": Object.freeze({ itemKey: "mirrorpeat", block: BlockId.Mirrorpeat, supportBlock: BlockId.WildwoodLog, accentBlock: BlockId.Reedglass, exceptionalBlock: BlockId.Glowstone, secondaryBlock: BlockId.Reedglass, variants: Object.freeze(["wet-face", "dry-face", "steps", "drain-grate", "reed-post", "reflective-tile"]) }),
  "moonfelt-mycelium": Object.freeze({ itemKey: "moonfelt-mycelium", block: BlockId.MoonfeltMycelium, supportBlock: BlockId.Deepstone, accentBlock: BlockId.StarbloomCap, exceptionalBlock: BlockId.LuminousGills, variants: Object.freeze(["quiet-tunnel", "memory-membrane", "pond-rim", "dormant-fan", "active-fan"]) }),
} satisfies Readonly<Record<MythicMaterialFamilyId, Readonly<{ itemKey: string; block: BlockId; supportBlock: BlockId; accentBlock: BlockId; exceptionalBlock: BlockId; secondaryBlock?: BlockId; variants: readonly string[] }>>>);

export type MythicFrontierSiteId =
  | "road-quiet-bells" | "cloudwhale-graveyard" | "mirrorfen-processional" | "emberglass-hatchery"
  | "drowned-moon-gate" | "titans-kettle" | "root-crown-menagerie" | "fossil-orchard"
  | "lanternroot-cistern" | "tideclock-wreck" | "palace-nine-winds" | "gorgon-quarry"
  | "sunken-court-namarra" | "ashen-library-salamander-kings" | "hollow-moon-menagerie";

export type MythicFrontierSiteDefinition = Readonly<{
  id: MythicFrontierSiteId;
  structureKind: string;
  encounterId: string;
  name: string;
  creature: LegendaryCreatureKind;
  role: LegendarySiteRole;
  layer: "surface" | "sky" | "underwater" | "underground";
  biomes: readonly string[];
  material: MythicMaterialFamilyId;
  minimumRooms: number;
  sealedUnderwater: boolean;
  explicitFloodedRooms: number;
  requiresDwarfClearance: boolean;
}>;

const site = (value: MythicFrontierSiteDefinition) => Object.freeze({ ...value, biomes: Object.freeze([...value.biomes]) });

export const MYTHIC_FRONTIER_SITES = Object.freeze({
  "road-quiet-bells": site({ id: "road-quiet-bells", structureKind: "road-of-quiet-bells", encounterId: "quiet-bells", name: "Road of Quiet Bells", creature: "bellstep-qilin", role: "regional", layer: "surface", biomes: ["desert", "badlands", "savanna"], material: "windworn-alabaster", minimumRooms: 3, sealedUnderwater: false, explicitFloodedRooms: 0, requiresDwarfClearance: false }),
  "cloudwhale-graveyard": site({ id: "cloudwhale-graveyard", structureKind: "cloudwhale-graveyard", encounterId: "cloudwhale-graveyard", name: "Cloudwhale Graveyard", creature: "aerolith-baleen", role: "sanctuary", layer: "sky", biomes: ["highlands", "snow", "glimmerwood"], material: "windworn-alabaster", minimumRooms: 3, sealedUnderwater: false, explicitFloodedRooms: 0, requiresDwarfClearance: false }),
  "mirrorfen-processional": site({ id: "mirrorfen-processional", structureKind: "mirrorfen-processional", encounterId: "mirrorfen-processional", name: "Mirrorfen Processional", creature: "mireglass-kelpie", role: "regional", layer: "surface", biomes: ["swamp", "forest"], material: "mirrorpeat-reedglass", minimumRooms: 3, sealedUnderwater: false, explicitFloodedRooms: 2, requiresDwarfClearance: false }),
  "emberglass-hatchery": site({ id: "emberglass-hatchery", structureKind: "emberglass-hatchery", encounterId: "emberglass-hatchery", name: "Emberglass Hatchery", creature: "cinderwing-pyrausta", role: "regional", layer: "underground", biomes: ["volcanic", "badlands"], material: "emberglass-archive", minimumRooms: 4, sealedUnderwater: false, explicitFloodedRooms: 0, requiresDwarfClearance: false }),
  "drowned-moon-gate": site({ id: "drowned-moon-gate", structureKind: "drowned-moon-gate", encounterId: "drowned-moon-gate", name: "Drowned Moon Gate", creature: "nacre-gatewyrm", role: "sanctuary", layer: "underwater", biomes: ["coast"], material: "nacre-tidework", minimumRooms: 4, sealedUnderwater: true, explicitFloodedRooms: 2, requiresDwarfClearance: false }),
  "titans-kettle": site({ id: "titans-kettle", structureKind: "titans-kettle", encounterId: "titans-kettle", name: "Titan's Kettle", creature: "frostcauldron-behemoth", role: "sanctuary", layer: "surface", biomes: ["snow", "highlands"], material: "windworn-alabaster", minimumRooms: 3, sealedUnderwater: false, explicitFloodedRooms: 0, requiresDwarfClearance: true }),
  "root-crown-menagerie": site({ id: "root-crown-menagerie", structureKind: "root-crown-menagerie", encounterId: "root-crown-menagerie", name: "Root-Crown Menagerie", creature: "briarcrown-manticore", role: "regional", layer: "surface", biomes: ["glimmerwood", "forest"], material: "moonfelt-mycelium", minimumRooms: 4, sealedUnderwater: false, explicitFloodedRooms: 1, requiresDwarfClearance: false }),
  "fossil-orchard": site({ id: "fossil-orchard", structureKind: "fossil-orchard", encounterId: "fossil-orchard", name: "Fossil Orchard", creature: "ammonarch", role: "sanctuary", layer: "underground", biomes: ["highlands", "mushroom"], material: "fossilroot-calcite", minimumRooms: 4, sealedUnderwater: false, explicitFloodedRooms: 1, requiresDwarfClearance: false }),
  "lanternroot-cistern": site({ id: "lanternroot-cistern", structureKind: "lanternroot-cistern", encounterId: "lanternroot-cistern", name: "Lanternroot Cistern", creature: "handtail-ahuizotl", role: "regional", layer: "underground", biomes: ["forest", "glimmerwood", "swamp"], material: "fossilroot-calcite", minimumRooms: 4, sealedUnderwater: false, explicitFloodedRooms: 2, requiresDwarfClearance: false }),
  "tideclock-wreck": site({ id: "tideclock-wreck", structureKind: "tideclock-wreck", encounterId: "tideclock-wreck", name: "Tideclock Wreck", creature: "tideclock-cetus", role: "regional", layer: "underwater", biomes: ["coast"], material: "nacre-tidework", minimumRooms: 3, sealedUnderwater: true, explicitFloodedRooms: 3, requiresDwarfClearance: false }),
  "palace-nine-winds": site({ id: "palace-nine-winds", structureKind: "palace-of-nine-winds", encounterId: "palace-nine-winds", name: "Palace of Nine Winds", creature: "anemoi-gryphon", role: "apex", layer: "sky", biomes: ["highlands", "snow"], material: "windworn-alabaster", minimumRooms: 6, sealedUnderwater: false, explicitFloodedRooms: 0, requiresDwarfClearance: false }),
  "gorgon-quarry": site({ id: "gorgon-quarry", structureKind: "gorgon-quarry", encounterId: "gorgon-quarry", name: "Gorgon Quarry", creature: "sable-gorgon", role: "apex", layer: "underground", biomes: ["badlands", "desert"], material: "fossilroot-calcite", minimumRooms: 6, sealedUnderwater: false, explicitFloodedRooms: 0, requiresDwarfClearance: false }),
  "sunken-court-namarra": site({ id: "sunken-court-namarra", structureKind: "sunken-court-of-namarra", encounterId: "sunken-court-namarra", name: "Sunken Court of Namarra", creature: "namarra-makara", role: "apex", layer: "underwater", biomes: ["coast"], material: "nacre-tidework", minimumRooms: 8, sealedUnderwater: true, explicitFloodedRooms: 6, requiresDwarfClearance: false }),
  "ashen-library-salamander-kings": site({ id: "ashen-library-salamander-kings", structureKind: "ashen-library-of-salamander-kings", encounterId: "ashen-library", name: "Ashen Library of the Salamander Kings", creature: "ashen-salamander-king", role: "apex", layer: "underground", biomes: ["volcanic", "badlands"], material: "emberglass-archive", minimumRooms: 7, sealedUnderwater: false, explicitFloodedRooms: 0, requiresDwarfClearance: false }),
  "hollow-moon-menagerie": site({ id: "hollow-moon-menagerie", structureKind: "hollow-moon-menagerie", encounterId: "hollow-moon-menagerie", name: "Hollow Moon Menagerie", creature: "mycelial-oneirophant", role: "apex", layer: "underground", biomes: ["mushroom", "glimmerwood"], material: "moonfelt-mycelium", minimumRooms: 7, sealedUnderwater: false, explicitFloodedRooms: 1, requiresDwarfClearance: false }),
} satisfies Readonly<Record<MythicFrontierSiteId, MythicFrontierSiteDefinition>>);

export const MYTHIC_FRONTIER_SITE_ORDER = Object.freeze(Object.keys(MYTHIC_FRONTIER_SITES) as MythicFrontierSiteId[]);

const RECOVERY_BY_ROLE = Object.freeze({
  regional: Object.freeze({ role: "regional", recoveryDays: 18, revisitCadenceDays: 3, reappearAfterOutcomes: Object.freeze(["release", "defeat"] as const) }),
  sanctuary: Object.freeze({ role: "sanctuary", recoveryDays: 10, revisitCadenceDays: 2, reappearAfterOutcomes: Object.freeze([]) }),
  apex: Object.freeze({ role: "apex", recoveryDays: 14, revisitCadenceDays: 4, reappearAfterOutcomes: Object.freeze([]) }),
} satisfies Readonly<Record<LegendarySiteRole, LegendarySiteRecoveryPolicy>>);

export function mythicRecoveryPolicyForSite(siteId: MythicFrontierSiteId): LegendarySiteRecoveryPolicy {
  return RECOVERY_BY_ROLE[MYTHIC_FRONTIER_SITES[siteId].role];
}

export function mythicSiteByEncounterId(encounterId: string) {
  return MYTHIC_FRONTIER_SITE_ORDER.map((id) => MYTHIC_FRONTIER_SITES[id]).find((entry) => entry.encounterId === encounterId) ?? null;
}

export function mythicSiteByStructureKind(kind: string) {
  return MYTHIC_FRONTIER_SITE_ORDER.map((id) => MYTHIC_FRONTIER_SITES[id]).find((entry) => entry.structureKind === kind) ?? null;
}

export type MythicPlacementContext = Readonly<{
  siteId: MythicFrontierSiteId;
  roadDistance: number;
  settlementDistance: number;
  dwarfSettlementDistance: number;
  connectedEntrance: boolean;
  waterShellCount: number;
  explicitFloodedRoomCount: number;
  returnPathConnected: boolean;
}>;

export function validateMythicSitePlacement(plan: AdventureStructurePlan, context: MythicPlacementContext) {
  const definition = MYTHIC_FRONTIER_SITES[context.siteId];
  const issues: string[] = [];
  if (!plan.placements.length) issues.push("empty-plan");
  if (plan.rooms.length < definition.minimumRooms) issues.push("insufficient-rooms");
  if (!context.connectedEntrance) issues.push("blocked-entrance");
  if (!context.returnPathConnected) issues.push("missing-return-path");
  if (context.roadDistance < 6) issues.push("road-overlap");
  if (context.settlementDistance < 20) issues.push("settlement-overlap");
  if (definition.requiresDwarfClearance && context.dwarfSettlementDistance < 56) issues.push("dwarven-settlement-clearance");
  if (definition.sealedUnderwater && context.waterShellCount <= 0) issues.push("unsealed-underwater-shell");
  if (definition.layer === "underground" && !definition.explicitFloodedRooms && context.waterShellCount > 0) issues.push("dry-underground-water-shell");
  if (context.explicitFloodedRoomCount !== definition.explicitFloodedRooms) issues.push("flooded-room-contract");
  const entrance = plan.markers.some((marker) => marker.type === "landmark" && /entrance|threshold/u.test(marker.tag));
  if (!entrance) issues.push("missing-entrance-marker");
  const spawn = plan.markers.find((marker) => marker.type === "spawn" && marker.mobKind === definition.creature);
  if (!spawn) issues.push("missing-resident");
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues) });
}

function hashUnit(value: string) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}

export type MythicLootPool = "site-material" | "expedition-supply" | "creature-knowledge" | "signature";
export type MythicSiteLootRoll = Readonly<{ pool: MythicLootPool; itemKey: string; count: number }>;

export const MYTHIC_SIGNATURE_REWARDS = Object.freeze({
  "road-quiet-bells": Object.freeze({ itemKey: "mythic-bellkeeper-tack", name: "Bellkeeper Tack", mechanic: "Marks safe road approaches while riding a trusted Qilin." }),
  "cloudwhale-graveyard": Object.freeze({ itemKey: "mythic-cloudwhale-map", name: "Cloudwhale Migration Map", mechanic: "Reveals one distant highland POI after a protected migration circuit." }),
  "mirrorfen-processional": Object.freeze({ itemKey: "mythic-stillwater-chime", name: "Stillwater Feint Chime", mechanic: "Distinguishes the true rescue wake from a hostile reflection." }),
  "emberglass-hatchery": Object.freeze({ itemKey: "mythic-emberglass-net", name: "Emberglass Net Upgrade", mechanic: "Protects one creature-net interaction from hatchery heat." }),
  "drowned-moon-gate": Object.freeze({ itemKey: "mythic-pressure-flask", name: "Deep-Pressure Flask", mechanic: "Extends a bounded moonwell pressure pocket." }),
  "titans-kettle": Object.freeze({ itemKey: "mythic-behemoth-harness", name: "Behemoth Hauling Harness", mechanic: "Unlocks marked hauling and avalanche-bracing work." }),
  "root-crown-menagerie": Object.freeze({ itemKey: "mythic-briarcrown-kit", name: "Briarcrown Antidote Kit", mechanic: "Cures measured menagerie venom without erasing its field lesson." }),
  "fossil-orchard": Object.freeze({ itemKey: "mythic-acoustic-coil", name: "Acoustic Survey Coil", mechanic: "Translates Stone Song into bounded unstable-rock marks." }),
  "lanternroot-cistern": Object.freeze({ itemKey: "mythic-tailgrip-charm", name: "Tail-Grip Retrieval Charm", mechanic: "Calls for one reachable rescue or object retrieval." }),
  "tideclock-wreck": Object.freeze({ itemKey: "mythic-tideclock-compass", name: "Tideclock Compass", mechanic: "Reads authored salvage windows without x-ray treasure detection." }),
  "palace-nine-winds": Object.freeze({ itemKey: "mythic-nine-wind-standard", name: "Nine-Wind Standard", mechanic: "Deploys a bounded mounted-flight wind marker." }),
  "gorgon-quarry": Object.freeze({ itemKey: "mythic-merciful-mirror", name: "Merciful Mirror Shield", mechanic: "Reverses one deliberately aimed staged-petrification flash." }),
  "sunken-court-namarra": Object.freeze({ itemKey: "mythic-pearl-regalia", name: "Pearl Court Regalia", mechanic: "Signals peaceful audience status in the restored court." }),
  "ashen-library-salamander-kings": Object.freeze({ itemKey: "mythic-heat-script-lens", name: "Heat-Script Lens", mechanic: "Reveals one thermal archive layer without igniting it." }),
  "hollow-moon-menagerie": Object.freeze({ itemKey: "mythic-remembered-path", name: "Remembered Path Spore", mechanic: "Highlights only the player's own recent route near a memory pond." }),
} satisfies Readonly<Record<MythicFrontierSiteId, Readonly<{ itemKey: string; name: string; mechanic: string }>>>);

export function rollMythicSiteLoot(siteId: MythicFrontierSiteId, seed: string, priorPity = 0, signatureAlreadyAwarded = false) {
  const definition = MYTHIC_FRONTIER_SITES[siteId];
  const material = MYTHIC_MATERIAL_FAMILIES[definition.material];
  const signatureChance = priorPity >= 11 ? 1 : Math.min(.5, .06 + priorPity * .035);
  const signature = !signatureAlreadyAwarded && hashUnit(`${seed}|${siteId}|signature|${priorPity}`) < signatureChance;
  const loot: MythicSiteLootRoll[] = [
    Object.freeze({ pool: "site-material", itemKey: material.itemKey, count: 3 + Math.floor(hashUnit(`${seed}|material-count`) * 6) }),
    Object.freeze({ pool: "expedition-supply", itemKey: definition.layer === "underwater" ? "water-breathing-potion" : definition.layer === "underground" ? "cave-gel" : "wayfarer-potion", count: 2 + Math.floor(hashUnit(`${seed}|supply`) * 3) }),
    Object.freeze({ pool: "creature-knowledge", itemKey: "bound-book", count: 1 }),
  ];
  if (signature) loot.push(Object.freeze({ pool: "signature", itemKey: MYTHIC_SIGNATURE_REWARDS[siteId].itemKey, count: 1 }));
  return Object.freeze({ loot: Object.freeze(loot), nextPity: signature || signatureAlreadyAwarded ? 0 : Math.min(12, priorPity + 1), signatureAwarded: signature });
}

export function mythicEncounterTypes(kind: LegendaryCreatureKind, moveId: string, baseTypes: readonly string[]) {
  if (kind === "bellstep-qilin" && /roadward-chime$/u.test(moveId)) return Object.freeze([...new Set([...baseTypes.filter((type) => type !== "wild"), "radiant"])]);
  if (kind === "sable-gorgon" && /sable-glance$/u.test(moveId)) return Object.freeze([...new Set([...baseTypes, "mirror"])]);
  return Object.freeze([...baseTypes]);
}
