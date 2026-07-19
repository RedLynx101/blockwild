import { Item, type ItemCode } from "./data";
import type { LegendaryCreatureKind } from "./mobs";
import type { MythicFrontierSiteId } from "./mythic-frontiers";

export const MYTHIC_FRONTIER_CREATURE_KINDS = Object.freeze([
  "bellstep-qilin", "aerolith-baleen", "mireglass-kelpie", "cinderwing-pyrausta", "nacre-gatewyrm",
  "frostcauldron-behemoth", "briarcrown-manticore", "ammonarch", "handtail-ahuizotl", "tideclock-cetus",
  "anemoi-gryphon", "sable-gorgon", "namarra-makara", "ashen-salamander-king", "mycelial-oneirophant",
] as const satisfies readonly LegendaryCreatureKind[]);

export type MythicFrontierCreatureKind = (typeof MYTHIC_FRONTIER_CREATURE_KINDS)[number];

export type MythicReferenceRecord = Readonly<{
  sourceTradition: string;
  definingRelationship: string;
  blockwildAdaptation: string;
  writingGuardrail: string;
  reviewStatus: "internal-reference-reviewed" | "external-cultural-review-recommended";
}>;

const reference = (sourceTradition: string, definingRelationship: string, blockwildAdaptation: string, writingGuardrail: string, reviewStatus: MythicReferenceRecord["reviewStatus"] = "internal-reference-reviewed"): MythicReferenceRecord => Object.freeze({ sourceTradition, definingRelationship, blockwildAdaptation, writingGuardrail, reviewStatus });

/** Explicit source/adaptation ledger. This keeps mythic names tied to behavior and ecology rather than treating traditions as interchangeable silhouettes. */
export const MYTHIC_REFERENCE_RECORDS = Object.freeze({
  "bellstep-qilin": reference("Chinese qilin traditions", "An auspicious, restrained being whose appearance reflects just conduct.", "A road guardian that answers patient travel and protects caravans rather than serving as a trophy mount.", "Do not frame the Qilin as a generic horned deer, evil boss, or collectible exotic."),
  "aerolith-baleen": reference("Original Blockwild sky-whale ecology, informed by widespread world-whale motifs", "A vast migratory animal whose body and route support smaller lives.", "A living grave-tender returning to mineralized kin and maintaining highland currents.", "Do not attribute this comparative motif to one culture or turn the graveyard into harvest scenery."),
  "mireglass-kelpie": reference("Scottish kelpie folklore", "A dangerous water-horse relationship built around deceptive water and unsafe crossing.", "An amphibious horse-otter whose false wakes test observation; trust comes through restoring the true channel.", "Keep the lure and water-crossing logic; do not reduce the kelpie to a recolored horse."),
  "cinderwing-pyrausta": reference("Classical Greek and later European pyrausta accounts", "A small winged creature bound to sustaining fire and vulnerable away from heat.", "A moth-drake hatchery custodian that regulates heat for many species.", "Its fire dependence should create care and risk, not justify a generic flame monster."),
  "nacre-gatewyrm": reference("Original Blockwild tidework guardian with broad temple-dragon influence", "A liminal serpent that protects a threshold and the life supported by it.", "A nacre-plated current engineer maintaining sealed moonwell refuges.", "Avoid copying sacred dragon regalia or presenting an unsourced pan-Asian costume."),
  "frostcauldron-behemoth": reference("Hebrew Bible Behemoth, mediated through later fantasy usage", "An immense land creature defined by strength, place, and resistance to human mastery.", "A glacier kettle custodian whose strength shelters caravans and stabilizes avalanches.", "Do not claim scriptural fidelity or treat the name as permission for a mindless raid boss.", "external-cultural-review-recommended"),
  "briarcrown-manticore": reference("Persian mardkhora traditions transmitted through Greek and later bestiaries", "A feared composite predator with an uncanny face and dangerous tail.", "A load-bearing feline predator with a bark mask, scorpion tail, cub territory, and measured venom.", "Acknowledge the Persian lineage; avoid a pasted human face or generic lion-with-parts."),
  ammonarch: reference("Original Blockwild fossil ecology based on ammonites and living cephalopods", "Ancient shell growth records environmental history.", "A land-swimming calcite grazer whose Stone Song reveals unstable strata.", "Do not attach invented ceremonial claims to real cultures or living cephalopod behavior."),
  "handtail-ahuizotl": reference("Mexica/Nahua ahuizotl accounts preserved in colonial-era sources", "A water-associated being identified by a handlike tail and dangerous retrieval from waterways.", "A cistern keeper that retrieves memorial objects and tests reciprocal return rather than functioning as a generic water dog.", "Keep the working name and lore flagged for specialist review; do not sanitize or villainize the source figure.", "external-cultural-review-recommended"),
  "tideclock-cetus": reference("Ancient Greek and Latin ketos/cetus sea-monster traditions", "A great sea being associated with dangerous coasts and human passage.", "A whale-serpent whose age plates and sounding routes govern safe salvage windows.", "Do not imply one canonical ancient anatomy; the tideclock is site technology, not a mechanical animal."),
  "anemoi-gryphon": reference("Ancient Near Eastern and Mediterranean gryphon traditions; Greek Anemoi wind naming", "A powerful guardian combining raptor vigilance and feline force.", "A nine-banner wind custodian that tests flight stewardship at a ruined palace.", "Keep the two source strands explicit and avoid presenting the hybrid as a single culture's exact sacred figure."),
  "sable-gorgon": reference("Greek Gorgon traditions with later catoblepas and bestiary motifs", "A terrifying gaze relationship that changes how observers approach and protect themselves.", "A bovine-serpent quarry guardian whose staged mineral gaze can be read and mercifully reversed.", "Do not call the design a faithful Medusa depiction or replace the creature's ecology with misogynistic monster shorthand."),
  "namarra-makara": reference("South and Southeast Asian makara traditions across Hindu, Buddhist, and regional art", "An aquatic threshold guardian associated with water, procession, and protective architecture.", "A courtly crocodile-fish custodian of currents, regalia, and sealed air gardens.", "Do not mix sacred attributes as decorative loot; final names, regalia, and quest prose merit specialist review.", "external-cultural-review-recommended"),
  "ashen-salamander-king": reference("European classical, medieval, and alchemical salamander traditions", "A creature associated with living in or enduring fire.", "A six-legged archive keeper whose heat reveals and preserves written memory.", "Keep the alchemical archive relationship; avoid a generic oversized lizard with fire particles."),
  "mycelial-oneirophant": reference("Original Blockwild dream-elephant informed by Greek oneiroi terminology", "Dreams carry memory, warning, and routes between states rather than simple illusion magic.", "A fungal elephant that reconstructs bounded habitat memories and the player's own traveled path.", "Do not claim this is a traditional Greek creature; oneiroi is a transparent linguistic influence on an original ecology."),
} satisfies Readonly<Record<MythicFrontierCreatureKind, MythicReferenceRecord>>);

export type MythicCreatureProductionRecord = Readonly<{
  kind: MythicFrontierCreatureKind;
  siteId: MythicFrontierSiteId;
  visualBrief: Readonly<{
    primaryMass: string;
    connectedLoadPath: string;
    silhouetteAnchors: readonly [string, string, string];
    localizedMagic: string;
  }>;
  actionProfile: Readonly<{
    locomotion: string;
    turn: string;
    attackTell: string;
    hitReaction: string;
    capture: string;
  }>;
  fieldUtility: string;
  aiLoadout: readonly [string, string, string, string];
  customSoundCategory: string;
  nonlethalReward: string;
  shed: Readonly<{
    item: ItemCode;
    min: number;
    max: number;
    intervalTicks: number;
    trigger: string;
  }>;
}>;

const record = (
  kind: MythicFrontierCreatureKind,
  siteId: MythicFrontierSiteId,
  visualBrief: MythicCreatureProductionRecord["visualBrief"],
  actionProfile: MythicCreatureProductionRecord["actionProfile"],
  fieldUtility: string,
  aiLoadout: MythicCreatureProductionRecord["aiLoadout"],
  customSoundCategory: string,
  nonlethalReward: string,
  shed: MythicCreatureProductionRecord["shed"],
): MythicCreatureProductionRecord => Object.freeze({
  kind, siteId,
  visualBrief: Object.freeze({ ...visualBrief, silhouetteAnchors: Object.freeze([...visualBrief.silhouetteAnchors]) as unknown as readonly [string, string, string] }),
  actionProfile: Object.freeze({ ...actionProfile }), fieldUtility,
  aiLoadout: Object.freeze(aiLoadout.map((moveId) => `${kind}--${moveId}`)) as unknown as readonly [string, string, string, string],
  customSoundCategory, nonlethalReward, shed: Object.freeze({ ...shed }),
});

const action = (locomotion: string, turn: string, attackTell: string, hitReaction: string, capture: string): MythicCreatureProductionRecord["actionProfile"] => ({ locomotion, turn, attackTell, hitReaction, capture });
const brief = (primaryMass: string, connectedLoadPath: string, silhouetteAnchors: readonly [string, string, string], localizedMagic: string): MythicCreatureProductionRecord["visualBrief"] => ({ primaryMass, connectedLoadPath, silhouetteAnchors, localizedMagic });
const shed = (item: ItemCode, min: number, max: number, intervalTicks: number, trigger: string): MythicCreatureProductionRecord["shed"] => ({ item, min, max, intervalTicks, trigger });

/**
 * Release contract for the fifteen creatures. This is deliberately concrete:
 * it gives model, animation, AI, audio, field-use, and renewable-reward work a
 * single source of truth instead of letting a stat entry masquerade as a
 * finished creature.
 */
export const MYTHIC_CREATURE_PRODUCTION = Object.freeze({
  "bellstep-qilin": record("bellstep-qilin", "road-quiet-bells",
    brief("deep road-deer barrel", "split hooves through four-segment legs into a continuous shoulder and pelvis", ["layered bell mane", "swept road antlers", "brass-shod hooves"], "only hoof chimes and antler route knots answer"),
    action("measured four-beat walk into a long gallop", "plants the inside rear hoof before the chest follows", "mane bells answer rear-to-front before a nonlethal charge", "shoulder dip with one staggered chime", "kneels and lets the route knots dim in sequence"),
    "Reads safe roads and settlement approaches without revealing arbitrary map content.", ["bellstep", "patient-circuit", "roadward-chime", "concordant-gallop"], "layered hoof chime and breath", "A tuned road circuit yields a renewable bell-mane fiber knot.", shed(Item.Fiber, 1, 2, 28_000, "Finish one peaceful processional circuit after the site is restored.")),
  "aerolith-baleen": record("aerolith-baleen", "cloudwhale-graveyard",
    brief("broad manta-whale torso", "six steering fins root beneath one load-bearing stone baleen keel", ["mineral back shelves", "luminous throat combs", "forked steering tail"], "only throat combs pulse during lift"),
    action("slow buoyant fin wave with storm-weighted banking", "outer fins flare before the massive body yaws", "throat comb contracts before the baleen sweep", "whole keel rolls rather than twitching", "settles into a low hover while every fin cups inward"),
    "Carries expedition cargo and creates a bounded safe descent through storms.", ["baleen-sweep", "lift-basin", "graveyard-turn", "carry-the-fallen"], "deep filtered whale call and aerolith resonance", "Lichen grooming loosens a renewable aerolith nodule.", shed(Item.MineralCrustItem, 1, 2, 36_000, "Groom grave-lichen without mining a fossil rib.")),
  "mireglass-kelpie": record("mireglass-kelpie", "mirrorfen-processional",
    brief("heavy horse-otter barrel", "webbed hooves carry through articulated hocks into load-bearing shoulders", ["reed-layer mane", "otter rudder tail", "mirrored brow plate"], "only the inner mane and true wake glint"),
    action("weighty canter on land and tail-led swimming", "inside forehoof anchors before the reed mane follows", "false wake diverges a full beat before the fen kick", "mane collapses toward the struck side", "lowers both mirrored brow plates and stills the false wake"),
    "Creates a decoy wake that draws danger away from swimmers.", ["fen-kick", "false-wake", "mirror-canter", "drown-the-reflection"], "wet hoof suction, horse breath, and reed hiss", "Cleaning the true lane yields a renewable mirror-reed braid.", shed(Item.LumenreedFrond, 1, 3, 24_000, "Cleanse the processional and follow the true wake.")),
  "cinderwing-pyrausta": record("cinderwing-pyrausta", "emberglass-hatchery",
    brief("large velvet moth-drake thorax", "glassy forewing braces and six jointed legs root visibly into the thorax", ["soot panel wings", "braced forewings", "segmented ember abdomen"], "one abdomen seam carries all sustained emission"),
    action("rapid wingbeat with thermal glide rests", "banking begins at the forewing braces", "abdomen seam narrows before cinder dust releases", "wings snap closed around the egg-facing side", "lands over the cradles and folds four wings in pairs"),
    "Regulates one prepared heat cradle and safely vents a marked kiln.", ["cinder-dust", "heat-cradle", "glasswing-shear", "hatchery-vigil"], "moth-wing thrum, glass tick, and kiln chirr", "A protected clutch cycle sheds a tempered emberglass scale.", shed(Item.HeatCrackedRockItem, 1, 2, 30_000, "Protect every clutch through one cooling cycle.")),
  "nacre-gatewyrm": record("nacre-gatewyrm", "drowned-moon-gate",
    brief("long shell-plated serpent trunk", "four short paddle limbs and a segmented neck remain rooted through the belly keel", ["nacre neck gates", "four paddle limbs", "crescent tail blade"], "moonwell light remains inside folded neck plates"),
    action("body wave follows the head while paddles counter-steer", "outside paddles brake before the spine bends", "neck plates close in sequence before Gate Ram", "paddles flare and the neck absorbs impact", "coils through the restored arch and opens its moonwell pocket"),
    "Creates brief breathing pockets and opens validated tidework thresholds.", ["gate-ram", "nacre-fold", "moonwell-pocket", "threshold-current"], "deep aquatic growl, shell knock, and pressure exhale", "Removing hook-lines yields one naturally released nacre scute.", shed(Item.LivingCoral, 1, 1, 38_000, "Clear every hook-line and leave the sealed garden intact.")),
  "frostcauldron-behemoth": record("frostcauldron-behemoth", "titans-kettle",
    brief("vast musk-ox elephant rib cage", "column legs stack beneath a continuous shoulder shelf and pelvis", ["rectangular lock coat", "vented warm rib mantle", "avalanche horns"], "warmth appears only behind the side vents"),
    action("slow planted trudge with visible weight transfer", "rear pair braces before the forequarters pivot", "steam vents open before Snowplow commits", "coat and belly lag behind a shoulder recoil", "kneels into the kettle lee and lowers both horns"),
    "Hauls marked heavy blocks, braces one avalanche barrier, and breaks only brittle ice.", ["snowplow", "kettle-guard", "avalanche-brace", "warm-the-caravan"], "deep growl, emu-like boom, and steam snort", "Gentle combing after a caravan rescue yields insulating wool locks.", shed(Item.Wool, 2, 4, 40_000, "Shelter a caravan and groom the outer coat while calm.")),
  "briarcrown-manticore": record("briarcrown-manticore", "root-crown-menagerie",
    brief("feline rib cage and sloped shoulder mantle", "segmented cat legs and continuous scorpion tail root into one pelvis", ["bark mask face", "measured briar crown", "scorpion tail fan"], "venom lights only in readied crown tips"),
    action("feline prowl with a heavy tail counterbalance", "hips turn before the chest and mask", "crown fans to measured spacing before pounce", "mask tucks while shoulder briars absorb the hit", "tail uncoils and the bark mask opens to a calm four-plane face"),
    "Marks venom-safe paths and disperses only tagged invasive thickets.", ["crown-pounce", "briar-fan", "venom-measure", "menagerie-roar"], "feline growl, thorn scrape, and mask rattle", "Restoring migration gaps yields a naturally cast crown thorn.", shed(Item.Fiber, 1, 2, 34_000, "Reopen every migration gap without harming cub tracks.")),
  ammonarch: record("ammonarch", "fossil-orchard",
    brief("great segmented ammonite shell", "eight short weight-sharing mantle limbs connect beneath the shell around one beaked head", ["spiral shell mass", "eight mantle feet", "paired sensory ribbons"], "gold seams remain mineral and non-emissive"),
    action("slow eight-beat land swim", "outer four limbs brace before shell rotation", "sensory ribbons withdraw before Mantle Shove", "shell rolls a fraction while limbs spread load", "settles into orchard silt and extends both ribbons"),
    "Reveals unstable fossil strata and braces a prepared cave room.", ["mantle-shove", "spiral-bastion", "stone-song", "orchard-resonance"], "low shell resonance and stone-song pulse", "A healthy orchard produces a cast-off fossil shell lamina.", shed(Item.FossilStoneItem, 1, 2, 44_000, "Rewater the orchard and remove crystal parasites.")),
  "handtail-ahuizotl": record("handtail-ahuizotl", "lanternroot-cistern",
    brief("long otter-canine swimming torso", "four short jointed legs and five-part hand tail connect through a flexible pelvis", ["layered cheek whiskers", "retrieval tail hand", "broad swimmer paws"], "keepsake glints stay in the closed tail pad"),
    action("otter bound on land and torso-led swim", "tail hand braces the outside wall before turning", "whiskers point to the target before Channel Bite", "torso curls and the tail protects the head", "offers the last keepsake with an open tail palm"),
    "Fetches one reachable object or pulls one swimmer from an authored current.", ["channel-bite", "backwash-fetch", "keepsake-scent", "rescue-hand"], "little-animal chirrup, wet bark, and whisker clicks", "A completed retrieval circuit yields a braided tidevine grip fiber.", shed(Item.TidevineFiber, 1, 2, 22_000, "Return a lost keepsake to its dry niche.")),
  "tideclock-cetus": record("tideclock-cetus", "tideclock-wreck",
    brief("long whale-serpent pressure body", "layered side plates and fins share one continuous spine into the tail fluke", ["age-ring side plates", "sounding brow", "wide pressure fluke"], "one sounding line glows only during route calls"),
    action("slow cetacean body wave with plate breathing", "inside fins cup before the head and plates follow", "plates close from tail to brow before Sounding Roll", "fluke drops while side plates ripple outward", "circles the tideclock once and rests beneath its arm"),
    "Carries two riders, forms a bounded slipstream, and locates authored wreck markers.", ["long-current", "sounding-roll", "wreck-sense", "abyssal-slipstream"], "leviathan growl, whale pulse, and plate clack", "Freeing entangled fauna yields a naturally loosened tide pearl.", shed(Item.LumenPearl, 1, 1, 48_000, "Complete one salvage window without taking memorial cargo.")),
  "anemoi-gryphon": record("anemoi-gryphon", "palace-nine-winds",
    brief("deep eagle sternum into feline rear barrel", "wing shoulders, eagle forelegs, and cat haunches share one connected chest bridge", ["nine banner feathers", "hooked crown beak", "feline landing haunches"], "wind glass appears only in feather sockets during a draft"),
    action("glide-first flight and planted feline landing", "tail and outside wing counter the sternum turn", "all nine feathers align before Crown Talon", "one wing shields while rear legs absorb recoil", "lands at the crown and lowers every banner feather"),
    "Provides controlled mounted flight, crosswind shielding, and vertical rescue.", ["crown-talon", "crosswind-mantle", "ninefold-draft", "palace-circuit"], "owl-gryphon call, wing buffet, and banner snap", "A completed palace circuit leaves one naturally molted banner feather.", shed(Item.Feather, 1, 2, 32_000, "Fly the complete circuit and return the fledgling bells.")),
  "sable-gorgon": record("sable-gorgon", "gorgon-quarry",
    brief("connected bull shoulders and scaled haunches", "four heavy legs carry one bovine-serpent trunk beneath a rooted crown plate", ["six horn-serpents", "black-glass throat mirror", "mineral haunch scales"], "reflection narrows only inside the throat tile and eyes"),
    action("measured bovine walk into a low quarry rush", "inside foreleg plants before the haunches swing", "throat mirror narrows through three visible stages", "horn serpents recoil after the shoulder", "all six serpents face away while the mirror clouds"),
    "Raises temporary cover and reverses one staged petrification effect.", ["quarry-rush", "sable-glance", "cocoon-wall", "merciful-reversal"], "stone bull growl, glass resonance, and serpent hiss", "Merciful reversal sheds one harmless polished mirror scale.", shed(Item.MirrorstoneItem, 1, 1, 42_000, "Free every living cocoon through the reversal chamber.")),
  "namarra-makara": record("namarra-makara", "sunken-court-namarra",
    brief("continuous fish-crocodile court body", "crocodile skull, trunk barbels, side fins, and peacock-shell tail flow through one aquatic keel", ["crocodile crown jaw", "paired trunk barbels", "peacock-shell tail fan"], "pearl light remains in regalia sockets, not the body"),
    action("courtly body roll with tail-fan steering", "barbels lead while opposite fins brake", "regalia sockets answer before Court Roll", "tail fan cups forward and body rolls away", "folds the fan and places its brow beneath returned regalia"),
    "Grants rider breathing, pressure safety, and pearl-current commands.", ["court-roll", "regalia-current", "pearl-audience", "namarra-s-decree"], "crocodile rumble, elephantine water note, and shell fan", "A peaceful audience yields one renewed court pearl.", shed(Item.PrismaticPearl, 1, 1, 46_000, "Restore both air gardens and return the complete regalia.")),
  "ashen-salamander-king": record("ashen-salamander-king", "ashen-library-salamander-kings",
    brief("low six-legged furnace-drake torso", "six overlapping jointed legs carry a continuous spine beneath bookplate fins", ["bookplate dorsal crown", "six armored legs", "single jaw heat sac"], "only the jaw heat sac brightens"),
    action("low six-beat crawl with kiln-weighted pauses", "three legs brace while the opposite three index the turn", "jaw sac expands before Kiln Lash", "dorsal plates close and all six feet widen", "cools the jaw sac and arranges the crown plates like closed books"),
    "Heats a forge, reveals thermal text, and tempers one marked crafted item.", ["kiln-lash", "royal-temper", "memory-heat", "crown-foundry"], "salamander rasp, deep dragon growl, and kiln crack", "A correctly cooled archive cycle sheds one heat-script scale.", shed(Item.HeatCrackedRockItem, 1, 2, 34_000, "Reveal all seven tablets without igniting a stack.")),
  "mycelial-oneirophant": record("mycelial-oneirophant", "hollow-moon-menagerie",
    brief("great tapir-elephant barrel and low domed skull", "four column legs, segmented trunk, ear mushrooms, and moss saddle share a continuous spine", ["segmented muscular trunk", "broad ear mushrooms", "close moss saddleback"], "only under-ear spore fans glow during memory projection"),
    action("slow elephantine walk with trunk counter-swing", "outside column legs plant before the barrel follows", "ear fans open one-by-one before Dream Tread", "trunk curls and mushrooms lag softly", "rests at the pond, folds its fans, and offers the trunk"),
    "Recreates bounded habitat echoes, calms wildlife, and shows only the player's recent route.", ["dream-tread", "remembered-path", "habitat-echo", "kindred-menagerie"], "deep dream breath, soft elephant note, and spore-fan rustle", "An accurate habitat memory produces one renewable dream spore pod.", shed(Item.SporePodItem, 1, 2, 40_000, "Restore one accurate memory in every habitat loop.")),
} satisfies Readonly<Record<MythicFrontierCreatureKind, MythicCreatureProductionRecord>>);

export type MythicShedState = Readonly<{ nextShedAgeTicks: number; shedCount: number }>;

function hashUnit(seed: string | number, salt: string) {
  const text = `${seed}|${salt}`; let hash = 2166136261;
  for (const char of text) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) / 4294967296;
}

export function isMythicFrontierCreature(kind: string): kind is MythicFrontierCreatureKind {
  return (MYTHIC_FRONTIER_CREATURE_KINDS as readonly string[]).includes(kind);
}

export function createMythicShedState(kind: MythicFrontierCreatureKind, seed: string | number): MythicShedState {
  const policy = MYTHIC_CREATURE_PRODUCTION[kind].shed;
  return Object.freeze({ nextShedAgeTicks: Math.round(policy.intervalTicks * (.85 + hashUnit(seed, `${kind}:first-shed`) * .3)), shedCount: 0 });
}

/** At most one renewable reward is emitted per simulation step, preventing offline burst drops. */
export function stepMythicShed(kind: MythicFrontierCreatureKind, state: MythicShedState, ageTicks: number, peacefulSiteResolved: boolean, healthRatio = 1) {
  const policy = MYTHIC_CREATURE_PRODUCTION[kind].shed;
  if (!peacefulSiteResolved || healthRatio < .8 || ageTicks < state.nextShedAgeTicks) return Object.freeze({ state, drop: null });
  const count = policy.min + Math.floor(hashUnit(state.shedCount, `${kind}:shed-count`) * (policy.max - policy.min + 1));
  const interval = Math.round(policy.intervalTicks * (.9 + hashUnit(ageTicks, `${kind}:shed-interval:${state.shedCount}`) * .2));
  return Object.freeze({
    state: Object.freeze({ nextShedAgeTicks: Math.max(ageTicks + 1, state.nextShedAgeTicks + interval), shedCount: state.shedCount + 1 }),
    drop: Object.freeze({ item: policy.item, count }),
  });
}
