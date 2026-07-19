import type { LegendaryCreatureKind, LivingRosterKind, MobKind, SummonedCreatureKind } from "./mobs";
import type { CreatureAptitudeId } from "./creature-progression";

export type PrimeVisualMotif =
  | "living-garden" | "triform-colony" | "storm-belly" | "walking-islet"
  | "fungal-crown" | "moon-mask" | "burrow-banner" | "glass-script"
  | "safe-descent" | "winter-mantle" | "mirror-crown" | "reed-court"
  | "observatory-veil" | "first-stratum" | "storm-cairn";

export type PrimeFormProfile = Readonly<{
  name: string;
  motif: PrimeVisualMotif;
  accent: number;
  sizeScale: number;
  condition: "bloom" | "mixed-habitat" | "sustained-rain" | "shore" | "fungal-night" | "moonlit-woodland"
    | "old-burrow" | "moonlit-desert" | "high-storm" | "highland" | "winter-cover" | "reflected-sun"
    | "wetland-dawn" | "abyssal-night" | "ancient-water";
  clue: string;
}>;

export type PrimeEligibleKind =
  | "petalfox" | "mossling" | "puddlehopper" | "pebbletortoise"
  | "thornhide-trufflehog" | "petalmask-tanuki" | "hearthback-badger" | "glassstep-jerboa"
  | "stormcrest-ibex" | "cloudkite-pika" | "briarclaw-lynx" | "cragglass-basilisk"
  | "mirecrown-crane" | "inkveil-cuttle" | "fossilback-trilobite";

export type PrimeRouteStep = Readonly<{ id: string; label: string; ecologicalVerb: string; clue: string }>;

const route = (
  first: readonly [string, string, string, string],
  second: readonly [string, string, string, string],
  third: readonly [string, string, string, string],
): readonly [PrimeRouteStep, PrimeRouteStep, PrimeRouteStep] => Object.freeze([first, second, third].map(([id, label, ecologicalVerb, clue]) => Object.freeze({ id, label, ecologicalVerb, clue }))) as readonly [PrimeRouteStep, PrimeRouteStep, PrimeRouteStep];

/** Prime routes use species-specific ecological actions, not a generic sight/call/study checklist. */
export const PRIME_ROUTE_PROFILES = Object.freeze({
  petalfox: route(["restore-spring-bloom", "Restore a spring bloom", "restore", "Repair one damaged bloom patch without harvesting it."], ["follow-seasonal-petals", "Follow seasonal petals", "track", "Keep the full living flower trail intact."], ["offer-den-flower", "Offer the den flower", "offer", "Present the trail's final flower at the den." ]),
  mossling: route(["link-three-habitats", "Link three habitats", "restore", "Create one compatible edge for each colony form."], ["observe-colony-exchange", "Observe colony exchange", "observe", "Watch each Mossling form pass material to the next."], ["plant-old-patch-spore", "Plant Old Patch's spore", "cultivate", "Prepare a mixed bed for the traveling colony." ]),
  puddlehopper: route(["map-rain-basin", "Map the rain basin", "survey", "Locate the basin after sustained rain."], ["answer-cloudbelly-croak", "Answer Cloudbelly's croak", "resonate", "Repeat the low three-part rain call."], ["shelter-tadpole-pool", "Shelter the tadpole pool", "protect", "Keep one rain-fed pool intact through the storm." ]),
  pebbletortoise: route(["catalog-shell-symbionts", "Catalog shell symbionts", "observe", "Identify the three ambient calls carried by the shell."], ["restore-islet-bed", "Restore the shell-bed", "cultivate", "Replace the missing plant family without overfilling it."], ["open-shore-passage", "Open the shore passage", "rescue", "Clear a broad route from water to resting bank." ]),
  "thornhide-trufflehog": route(["complete-blackcap-ring", "Complete the blackcap ring", "cultivate", "Restore the missing fungal arc without trampling the mycelium."], ["trace-rooter-route", "Trace the Rooter route", "track", "Follow its multi-day signs without digging them up."], ["share-ripe-truffle", "Share a ripe truffle", "offer", "Leave one ripe truffle at the rooted den." ]),
  "petalmask-tanuki": route(["separate-false-trails", "Separate the false trails", "interpret", "Reject the tracks whose petals face the wrong way."], ["recover-true-mask", "Recover the true mask", "restore", "Return the leaf mask to its moonlit shrine."], ["mirror-ecological-scent", "Mirror the ecological scent", "resonate", "Match the one trail that carries living pollen." ]),
  "hearthback-badger": route(["clear-emberburrow-exit", "Clear Emberburrow's exit", "rescue", "Open the smoke-low emergency tunnel."], ["brace-warm-chamber", "Brace the warm chamber", "build", "Repair one authored den support without sealing either exit."], ["leave-root-cache", "Leave a root cache", "offer", "Stock the den without entering the sleeping chamber." ]),
  "glassstep-jerboa": route(["read-moonletter-tracks", "Read the moonletter tracks", "interpret", "Follow glass-bright writing visible only at night."], ["quiet-burrow-mouth", "Quiet the burrow mouth", "protect", "Remove the source of vibration near the den."], ["cross-glassstep-line", "Cross the Glassstep line", "traverse", "Use the same safe landing sequence without breaking crust." ]),
  "stormcrest-ibex": route(["rebuild-storm-cairn", "Rebuild the storm cairn", "restore", "Replace three thunder-split stones."], ["follow-descent-hooves", "Follow descent hooves", "track", "Trace the path the Prime uses only in storms."], ["catch-separated-kid", "Catch the separated kid", "rescue", "Guide the kid onto the safe ledge without an orb." ]),
  "cloudkite-pika": route(["tune-descent-chimes", "Tune the descent chimes", "resonate", "Repair the flock's falling-stone phrase."], ["map-updraft-steps", "Map the updraft steps", "survey", "Record the full safe descent route."], ["escort-young-pika", "Escort a young pika", "rescue", "Use the route to return a stranded flockmate." ]),
  "briarclaw-lynx": route(["survive-first-stalk", "Survive the first stalk", "endure", "Do not attack during the first night phase."], ["reveal-winter-cover", "Reveal winter cover", "track", "Find the bowed branches where ordinary tracks disappear."], ["yield-hunt-corridor", "Yield the hunt corridor", "protect", "Move competing traps out of the Prime's route." ]),
  "cragglass-basilisk": route(["align-first-reflector", "Align the first reflector", "resonate", "Turn one sunbeam without meeting the gaze."], ["fracture-false-crown", "Fracture the false crown", "interpret", "Identify and break only the decoy crystal."], ["open-reflective-molt", "Open the reflective molt", "reveal", "Return the final beam during the molt window." ]),
  "mirecrown-crane": route(["restore-court-reeds", "Restore the court reeds", "cultivate", "Replant the missing dawn-lit arc before the flock arrives."], ["walk-outside-circle", "Walk outside the circle", "observe", "Complete the migration court without crossing it."], ["answer-first-reed-call", "Answer the First Reed call", "resonate", "Repeat the closing courtship phrase." ]),
  "inkveil-cuttle": route(["relight-observatory-lamps", "Relight observatory lamps", "restore", "Restore the dim color sequence without flooding the room."], ["read-emotion-pattern", "Read the emotion pattern", "interpret", "Identify the feeling shown before the body appears."], ["clear-escape-gallery", "Clear the escape gallery", "rescue", "Remove debris from the cuttle's unlit retreat." ]),
  "fossilback-trilobite": route(["brush-first-stratum", "Brush the First Stratum", "excavate", "Expose sediment without mining the occupied block."], ["record-ancestral-taps", "Record ancestral taps", "resonate", "Repeat the shell's slow historical rhythm."], ["protect-ancient-bed", "Protect the ancient bed", "protect", "Keep the lowest sediment undisturbed for a full cycle." ]),
} satisfies Readonly<Record<PrimeEligibleKind, readonly [PrimeRouteStep, PrimeRouteStep, PrimeRouteStep]>>);

/** Prime forms are authored ecological encounters, never the shiny palette roll. */
export const PRIME_FORM_PROFILES: Readonly<Partial<Record<MobKind, PrimeFormProfile>>> = Object.freeze({
  petalfox: { name: "The Garden-Tailed Fox", motif: "living-garden", accent: 0xf0b8ca, sizeScale: 1.08, condition: "bloom", clue: "Three restored bloom patches point toward one seasonal den." },
  mossling: { name: "Old Patch", motif: "triform-colony", accent: 0x8fbd72, sizeScale: 1.16, condition: "mixed-habitat", clue: "Three compatible Mossling habitats overlap around a slow traveling colony." },
  puddlehopper: { name: "Cloudbelly", motif: "storm-belly", accent: 0xa8d9ed, sizeScale: 1.13, condition: "sustained-rain", clue: "Its low croak repeats only after rain has soaked the same basin." },
  pebbletortoise: { name: "The Walking Islet", motif: "walking-islet", accent: 0x86b982, sizeScale: 1.2, condition: "shore", clue: "Tiny symbiotic calls drift from a shell-shaped shoreline." },
  "thornhide-trufflehog": { name: "Blackcap Rooter", motif: "fungal-crown", accent: 0x7d626f, sizeScale: 1.12, condition: "fungal-night", clue: "A multi-day blackcap ring closes around one rooted den." },
  "petalmask-tanuki": { name: "The Many-Pathed Mask", motif: "moon-mask", accent: 0xc9acd9, sizeScale: 1.1, condition: "moonlit-woodland", clue: "Several physical trails lie; only the ecological trail carries fallen petals." },
  "hearthback-badger": { name: "Old Emberburrow", motif: "burrow-banner", accent: 0xd89a67, sizeScale: 1.16, condition: "old-burrow", clue: "A warm, authored burrow keeps its smoke low and its exits clean." },
  "glassstep-jerboa": { name: "Moonletter", motif: "glass-script", accent: 0x9fd7e5, sizeScale: 1.08, condition: "moonlit-desert", clue: "Glass-bright tracks become readable script only under moonlight." },
  "stormcrest-ibex": { name: "Cairn Above Thunder", motif: "storm-cairn", accent: 0xe3cf6f, sizeScale: 1.18, condition: "high-storm", clue: "A high cairn answers thunder with a second, hoof-deep crack." },
  "cloudkite-pika": { name: "The Safe Descent Colony", motif: "safe-descent", accent: 0xc8e1ef, sizeScale: 1.12, condition: "highland", clue: "Wind chimes descend a cliff in a route no falling stone follows." },
  "briarclaw-lynx": { name: "The White Old Hunter", motif: "winter-mantle", accent: 0xe9f3ef, sizeScale: 1.14, condition: "winter-cover", clue: "Its stalking phases leave branches bowed without leaving ordinary tracks." },
  "cragglass-basilisk": { name: "The Crown in Reflection", motif: "mirror-crown", accent: 0xbde6df, sizeScale: 1.15, condition: "reflected-sun", clue: "Reflected beams meet at one glass crown without revealing a direct gaze." },
  "mirecrown-crane": { name: "The First Reed Court", motif: "reed-court", accent: 0xaacb7e, sizeScale: 1.12, condition: "wetland-dawn", clue: "A migratory court draws one complete circle in dawn-lit reeds." },
  "inkveil-cuttle": { name: "The Observatory Veil", motif: "observatory-veil", accent: 0x7fb8cb, sizeScale: 1.15, condition: "abyssal-night", clue: "One sunken observatory reflects an emotion before it reflects a body." },
  "fossilback-trilobite": { name: "First Stratum", motif: "first-stratum", accent: 0xc9b28d, sizeScale: 1.18, condition: "ancient-water", clue: "The lowest undisturbed sediment holds tracks older than the ruin above." },
});

export type ExpansionCreatureKind = LivingRosterKind | LegendaryCreatureKind | SummonedCreatureKind;
export type CreatureRarityPolicy = Readonly<{
  kind: ExpansionCreatureKind;
  shinyEligible: boolean;
  shinyTreatment: string;
  primeForm: string | null;
  specialVariant: string | null;
  rareAptitudePolicy: string;
  stableIdentityPolicy: string;
}>;

const rarity = <K extends ExpansionCreatureKind>(
  kind: K, shinyEligible: boolean, shinyTreatment: string, primeForm: string | null,
  specialVariant: string | null, rareAptitudePolicy: string, stableIdentityPolicy: string,
): CreatureRarityPolicy => Object.freeze({ kind, shinyEligible, shinyTreatment, primeForm, specialVariant, rareAptitudePolicy, stableIdentityPolicy });

/** Shiny, Prime, story, legendary, and summon identity are intentionally separate. */
export const EXPANSION_CREATURE_RARITY_POLICIES = Object.freeze({
  "thornhide-trufflehog": rarity("thornhide-trufflehog", true, "Rust-red thorns over a charcoal hide; no particle trail.", "Blackcap Rooter", null, "Prime guarantees Keen-Nosed; shiny remains cosmetic.", "Ecology-cell lineage fixes both ordinary and Prime candidates."),
  "orchard-glider": rarity("orchard-glider", true, "Autumn-leaf wing membranes with the same body colors.", null, "Nest-lineage membrane markings", "Rare Orchard Memory improves only fruitmark breadth.", "Nest anchor and lineage seed prevent unload rerolls."),
  "petalmask-tanuki": rarity("petalmask-tanuki", true, "Pale plum mask and silver-edged tail rings.", "The Many-Pathed Mask", null, "Prime guarantees Resonant; false trails grant no stat bonus.", "The true ecological trail is anchored to its moonlit shrine."),
  "ironbeak-magpie": rarity("ironbeak-magpie", true, "Pale brushed-metal feathers, explicitly without sparkle spam.", null, "Message-tube courier", "Rare Cachewise expands remembered legal caches.", "Rookery lineage fixes metal accent and cache preference."),
  "hearthback-badger": rarity("hearthback-badger", true, "Ash-gray face bars and copper hearth plates.", "Old Emberburrow", null, "Prime guarantees Strong-Back through its authored den route.", "The burrow POI owns the Prime identity."),
  "sunfoil-pangolin": rarity("sunfoil-pangolin", true, "Rose-gold foil edges over dark umber scales.", null, null, "Rare Sunwise lengthens warning, not combat output.", "Feeding-mound lineage fixes scale accent."),
  "glassstep-jerboa": rarity("glassstep-jerboa", true, "Moon-blue ear lining and translucent glass-dark feet.", "Moonletter", null, "Prime guarantees Sure-Footed after its track route.", "Moonlit burrow anchor fixes the candidate."),
  "stormcrest-ibex": rarity("stormcrest-ibex", true, "White quartz horns with muted violet charge seams.", "Cairn Above Thunder", null, "Prime guarantees Weatherwise; no raw damage bonus.", "Cairn, storm band, and lineage seed fix identity."),
  "cindercoil-gecko": rarity("cindercoil-gecko", true, "Blue-white toe pads and ember-orange eye rings.", null, "Deep-chilled Cooled Skin", "Rare Heatwise gives earlier pressure warnings.", "Fumarole wall and clutch lineage fix identity."),
  "cloudkite-pika": rarity("cloudkite-pika", true, "Sunset ear-sails and pearl whisker chimes.", "The Safe Descent Colony", null, "Prime guarantees Weatherwise to the flock anchor.", "Flock route fixes the Prime; individuals keep stable lineage seeds."),
  "briarclaw-lynx": rarity("briarclaw-lynx", true, "Blackberry rosettes across a dark green mantle.", "The White Old Hunter", "Regional Frost mantle", "Prime guarantees Keen-Scent; the white form has stalking phases.", "Hunt corridor and seasonal band fix the Prime identity."),
  "gravebell-jackal": rarity("gravebell-jackal", true, "Ivory bell and russet spirit markings.", null, "Purified Radiant story form", "Rare Relicwise distinguishes memorial from curse sooner.", "Relic anchor fixes story form and ordinary lineage fixes shiny."),
  "cragglass-basilisk": rarity("cragglass-basilisk", true, "Smoky glass crown with sea-green refraction edges.", "The Crown in Reflection", null, "Prime guarantees Resonant after the reflector route.", "Sun-reflector anchor fixes the Prime candidate."),
  "stormglass-roclet": rarity("stormglass-roclet", true, "Opal glass pinions with restrained rose lightning seams.", null, "Level-30 adult Roc", "Rare Rescuewise increases valid carry mass slightly.", "Aerie lineage persists through Roc maturation."),
  "brinewhisk-otter": rarity("brinewhisk-otter", true, "Cream mask, red-brown coat, and blue shell preference.", null, null, "Rare Strong Retriever changes legal item mass only.", "Holt family fixes markings and shell preference."),
  "riverwright-beaver": rarity("riverwright-beaver", true, "Silver bark coat and warm copper tail scales.", null, null, "Rare Lodgewise improves work diagnosis, not block speed.", "Lodge anchor and family seed fix identity."),
  "mirecrown-crane": rarity("mirecrown-crane", true, "Ink-black crown tips with pale rose flight feathers.", "The First Reed Court", null, "Prime guarantees Resonant after the court ritual.", "Migration court and dawn band fix the Prime."),
  "inkveil-cuttle": rarity("inkveil-cuttle", true, "Luminous cyan emotion bands on a deep violet mantle.", "The Observatory Veil", null, "Prime guarantees Resonant and a unique color-language note.", "Observatory anchor fixes the Prime; clutch seed fixes shiny."),
  "prismclaw-mantis-shrimp": rarity("prismclaw-mantis-shrimp", true, "Ultraviolet club bands and pearl carapace margins.", null, null, "Rare Crackwise reveals authored fractures sooner.", "Burrow anchor and clutch lineage fix identity."),
  "reefmender-shrimp": rarity("reefmender-shrimp", true, "Gold antenna tips and mint cleaning claws.", null, null, "Rare Gillwise adds one compatible client category.", "Cleaning-station lineage prevents tank rerolls."),
  "currentweaver-eel": rarity("currentweaver-eel", true, "White lateral-line knots against a cobalt body.", null, "Charged Storm form", "Rare Lampwise reports overload earlier.", "Current loop and lineage seed fix shiny; charge never rerolls it."),
  "shellcarrier-hermit": rarity("shellcarrier-hermit", true, "Lavender legs and pale tidevine knots; shell color is equipment.", null, "Equipped shell forms", "Rare Sure-Fitted reduces shell-swap recovery only.", "Individual identity survives every shell swap."),
  "wreckwhistle-porpoise": rarity("wreckwhistle-porpoise", true, "Pearl wake scars over a deep slate body.", null, "Pod-rescue harness form", "Rare Deep Diver extends rescue work time.", "Pod lineage and wreck route fix identity."),
  "kilnscale-salamander": rarity("kilnscale-salamander", true, "White-hot vent seams over blue-black scales.", null, "Cooled Skin Frost form", "Rare Heatwise broadens safe-gradient sensing.", "Fumarole clutch fixes shiny; thermal form is independent."),
  "sporeback-gardener": rarity("sporeback-gardener", true, "Pale luminous gills beneath a dark inherited cap garden.", null, "Cultivated fungal-family crowns", "Rare Nest-Tender adds one garden compatibility.", "Inherited garden family is stable through capture and work."),
  "voidmantle-ray": rarity("voidmantle-ray", true, "Star-flecked underside with muted teal fin edges.", null, null, "Rare Deep Diver lengthens safe glide work time.", "Plankton route and lineage seed fix identity."),
  "fossilback-trilobite": rarity("fossilback-trilobite", true, "Blue-green lobe edges over pale fossil copper.", "First Stratum", null, "Prime guarantees Sure-Footed and unique history notes.", "Ancient-water stratum fixes the Prime candidate."),
  "ilyr-virebloom": rarity("ilyr-virebloom", false, "Ilyr has one authored identity; optional seasonal blossoms are not shiny rolls.", null, "Dry-spring and restored-spring encounter phases", "Unique legendary aptitudes arise only from resolution.", "One stable identity per eligible restored migration anchor."),
  thalassene: rarity("thalassene", false, "Reef health changes visible color; it is not a collectible shiny palette.", null, "Bleached, cleaning, and restored reef phases", "Unique sanctuary aptitude follows the resolution.", "One stable identity per protected reef migration anchor."),
  orichalc: rarity("orichalc", false, "Contradictory Spirit or Arcane observations are states, never shiny rolls.", null, "Dormant, bound, redirected, and awakened states", "No aptitude resolves Veinmetal's nature.", "One stable identity per Deepgear living-seam anchor."),
  "varkesh-stormmane": rarity("varkesh-stormmane", false, "Storm charge and road-marker plumage are signature identity.", null, "Bond, pact, or protected-aerie resolutions", "Unique Roadwise aptitude follows an earned travel pact.", "One Varkesh identity per highland aerie."),
  kharza: rarity("kharza", false, "Harness damage and freed scars are story states, not shinies.", null, "Coerced, freed, pact, and captured resolutions", "Unique Packwise aptitude is unlocked only after freedom.", "One Kharza identity per Freeblades finale anchor."),
  "sugarwake-sovereign": rarity("sugarwake-sovereign", false, "Feast-memory and kiln-heart colors are combat phases.", null, "Guardian, heart-form, and communal-station resolutions", "Unique Makerwise aptitude belongs to stabilized forms.", "One Sovereign identity per eligible masterworks feast."),
  "bellstep-qilin": rarity("bellstep-qilin", false, "Bell patina and road dust are persistent journey states, not shiny rolls.", null, "Concordant road-guardian form", "Roadwise is earned by restoring the full procession.", "One Qilin identity belongs to each eligible Quiet Bells road."),
  "aerolith-baleen": rarity("aerolith-baleen", false, "Aerolith plates weather with altitude and herd memory; they are not random palettes.", null, "Gravekeeper and migration-leader mantles", "Rescuewise follows the completed graveyard circuit.", "The Cloudwhale Graveyard fixes its Baleen and herd identity."),
  "mireglass-kelpie": rarity("mireglass-kelpie", false, "Reflected colors depend on fen water and trust state.", null, "False-wake and true-processional forms", "Sure-Footed is earned by reading the real processional route.", "One Kelpie identity persists with its Mirrorfen channel."),
  "cinderwing-pyrausta": rarity("cinderwing-pyrausta", false, "Heat-cradle glow is a thermal state, never a shiny roll.", null, "Dormant ashwing and hatchery-vigil forms", "Heatwise follows safe incubation work.", "The Emberglass clutch anchor fixes its wing script."),
  "nacre-gatewyrm": rarity("nacre-gatewyrm", false, "Nacre sheen records gate state and water chemistry.", null, "Closed-threshold and moonwell-open forms", "Deep Diver follows a completed threshold covenant.", "One Gatewyrm identity is anchored to each Drowned Moon Gate."),
  "frostcauldron-behemoth": rarity("frostcauldron-behemoth", false, "Snow mantle and kettle steam respond to weather and exertion.", null, "Caravan-warmth and avalanche-brace forms", "Strong-Back follows a protected mountain passage.", "Titan's Kettle fixes the Behemoth and its scar pattern."),
  "briarcrown-manticore": rarity("briarcrown-manticore", false, "Crown bloom and venom measures are authored encounter states.", null, "Poacher-marked and restored-menagerie forms", "Keen-Scent follows a nonlethal menagerie resolution.", "The Root-Crown Menagerie fixes its sovereign predator identity."),
  ammonarch: rarity("ammonarch", false, "Fossil mantle moisture and resonance are environmental states.", null, "Dry-stratum and orchard-resonance forms", "Relicwise follows respectful fossil restoration.", "Each Fossil Orchard owns one ancient Ammonarch identity."),
  "handtail-ahuizotl": rarity("handtail-ahuizotl", false, "Keepsakes carried by the tail-hand are equipment, not variants.", null, "Cistern rescuer and keepsake-bearer forms", "Strong Retriever follows successful living rescue work.", "The Lanternroot Cistern fixes its Ahuizotl and remembered scent."),
  "tideclock-cetus": rarity("tideclock-cetus", false, "Clock-rib illumination tracks sounding and current state.", null, "Wreck-sounding and pod-guide forms", "Deep Diver follows completion of the wreck route.", "The Tideclock Wreck fixes pod lineage and the Cetus identity."),
  "anemoi-gryphon": rarity("anemoi-gryphon", false, "Wind-cloth and pinion posture encode the active palace draft.", null, "Ninefold-draft and palace-circuit forms", "Weatherwise follows mastery of all nine winds.", "One Anemoi identity belongs to each Palace circuit."),
  "sable-gorgon": rarity("sable-gorgon", false, "Mirror eyes and stone cocooning are readable combat states.", null, "Quarry-frenzied and merciful-reversal forms", "Relicwise follows a nonlethal quarry restoration.", "The Gorgon Quarry fixes the Sable Gorgon's identity and victims."),
  "namarra-makara": rarity("namarra-makara", false, "Pearl regalia changes with court restoration rather than rarity.", null, "Exiled-current and restored-court forms", "Deep Diver follows the Pearl Audience covenant.", "The Sunken Court fixes Namarra's Makara identity."),
  "ashen-salamander-king": rarity("ashen-salamander-king", false, "Crown heat and tablet script are foundry states, not palette rolls.", null, "Memory-heat and crown-foundry forms", "Makerwise follows safe archive restoration.", "The Ashen Library fixes one royal Salamander identity."),
  "mycelial-oneirophant": rarity("mycelial-oneirophant", false, "Fungal fans replay habitats as authored memory states.", null, "Dormant-memory and kindred-menagerie forms", "Nest-Tender follows restoration of every habitat echo.", "The Hollow Moon Menagerie fixes its Oneirophant and dream route."),
  asterjaw: rarity("asterjaw", false, "Contract constellation pattern is authored and stable, not rerolled.", null, "Temporary and Worldpin-grounded forms", "Grounding unlocks Routewise without a stat roll.", "The summoning contract fixes the specimen seed across every cast."),
  "vellum-warden": rarity("vellum-warden", false, "Margin notes change with memory; paper color is not a shiny roll.", null, "Temporary and Worldpin-grounded forms", "Grounding unlocks Archivewise through authored work.", "The summoning contract fixes the specimen seed across every cast."),
  "choir-of-one": rarity("choir-of-one", false, "Permitted faces are encounter tells, never collectible palettes.", null, "Temporary and Worldpin-grounded forms", "Grounding unlocks Resonant through a silence covenant.", "The summoning contract fixes the specimen seed across every cast."),
  "glasswake-stag": rarity("glasswake-stag", false, "Sea and sky-sail reflections are dynamic forms, not shiny rerolls.", null, "Water-wake, air-wake, and grounded forms", "Grounding unlocks Sure-Footed rescue behavior.", "The summoning contract fixes the specimen seed across every cast."),
} satisfies Readonly<Record<ExpansionCreatureKind, CreatureRarityPolicy>>);

export type PrimeEncounterContext = Readonly<{
  worldSeed: string;
  x: number;
  y: number;
  z: number;
  surfaceY: number;
  biomeName: string;
  weather: string;
  daylight: number;
}>;

export type PrimeEncounterPlan = Readonly<{
  anchorId: string;
  regionX: number;
  regionZ: number;
  profile: PrimeFormProfile;
  environmentEligible: boolean;
  anchorEligible: boolean;
  eligible: boolean;
}>;

function hashText(text: string) {
  let hash = 2166136261 >>> 0;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function environmentEligible(profile: PrimeFormProfile, context: PrimeEncounterContext) {
  const biome = context.biomeName.toLocaleLowerCase();
  const night = context.daylight < .2;
  const dawn = context.daylight >= .16 && context.daylight <= .42;
  const wetland = /bog|fen|marsh|swamp|reed|river/u.test(biome);
  const woodland = /forest|wood|grove|sakura|mushroom/u.test(biome);
  const highland = /mountain|highland|range|cloud|badland/u.test(biome);
  const shore = /coast|shore|ocean|reef|river/u.test(biome);
  const deep = context.y <= context.surfaceY - 8;
  switch (profile.condition) {
    case "bloom": return /meadow|forest|grove|sakura|glimmer/u.test(biome) && context.daylight > .35;
    case "mixed-habitat": return woodland || wetland || /ash|snow|cave/u.test(biome);
    case "sustained-rain": return ["rain", "thunder"].includes(context.weather) && wetland;
    case "shore": return shore;
    case "fungal-night": return night && /mushroom|forest|cave/u.test(biome);
    case "moonlit-woodland": return night && woodland;
    case "old-burrow": return /forest|highland|meadow/u.test(biome);
    case "moonlit-desert": return night && /desert|dune|badland/u.test(biome);
    case "high-storm": return context.weather === "thunder" && highland;
    case "highland": return highland;
    case "winter-cover": return /snow|frost|ice|range/u.test(biome);
    case "reflected-sun": return context.daylight > .7 && /desert|badland|glass/u.test(biome);
    case "wetland-dawn": return dawn && wetland;
    case "abyssal-night": return night && (deep || /trench|abyss|ocean/u.test(biome));
    case "ancient-water": return deep && shore;
  }
}

/** One stable, very rare 96-block regional anchor; all identity is derived from this key. */
export function planPrimeEncounter(kind: MobKind, context: PrimeEncounterContext): PrimeEncounterPlan | null {
  const profile = PRIME_FORM_PROFILES[kind];
  if (!profile) return null;
  const regionX = Math.floor(context.x / 96);
  const regionZ = Math.floor(context.z / 96);
  const anchorId = `prime:${kind}:${regionX}:${regionZ}`;
  const anchorEligible = hashText(`${context.worldSeed}|${anchorId}|prime-v1`) % 48 === 0;
  const environmental = environmentEligible(profile, context);
  return Object.freeze({ anchorId, regionX, regionZ, profile, environmentEligible: environmental, anchorEligible, eligible: environmental && anchorEligible });
}

export type PrimeEncounterStatus = "active" | "observed" | "captured" | "released" | "defeated";
export type PrimeEncounterState = Readonly<{
  schema: 1;
  anchorId: string;
  kind: MobKind;
  status: PrimeEncounterStatus;
  entityId: number | null;
  firstActivatedAt: number;
  lastUpdatedAt: number;
  /** Stable identity and custody are optional only for migration from the first Prime schema draft. */
  specimenId?: string;
  custodyId?: string | null;
  completedClues?: readonly string[];
  completedRouteVerbs?: readonly string[];
  routeProgress?: number;
}>;

export const PRIME_ROUTE_REQUIRED_CLUES = 3 as const;

export function primeAptitudeForMotif(motif: PrimeVisualMotif): CreatureAptitudeId {
  if (["storm-belly", "storm-cairn", "safe-descent"].includes(motif)) return "weatherwise";
  if (["observatory-veil", "moon-mask", "glass-script"].includes(motif)) return "resonant";
  if (["walking-islet", "first-stratum", "mirror-crown"].includes(motif)) return "sure-footed";
  if (["living-garden", "triform-colony", "fungal-crown", "reed-court"].includes(motif)) return "nest-tender";
  if (motif === "winter-mantle") return "keen-scent";
  return "strong-back";
}

export function createPrimeEncounterState(plan: PrimeEncounterPlan, kind: MobKind, entityId: number, now: number): PrimeEncounterState {
  return Object.freeze({ schema: 1, anchorId: plan.anchorId, kind, status: "active", entityId, firstActivatedAt: now, lastUpdatedAt: now });
}

export function transitionPrimeEncounter(state: PrimeEncounterState, status: PrimeEncounterStatus, entityId: number | null, now: number): PrimeEncounterState {
  if (["captured", "released", "defeated"].includes(state.status) && status === "active") return state;
  return Object.freeze({ ...state, status, entityId, lastUpdatedAt: Math.max(state.lastUpdatedAt, now) });
}

/** Prime capture requires three different field verbs; repeated targeting or damage cannot advance it. */
export function advancePrimeEncounterClue(state: PrimeEncounterState, clueId: string, now: number): PrimeEncounterState {
  const clue = clueId.trim().toLocaleLowerCase().replace(/[^a-z0-9-]+/gu, "-").slice(0, 64);
  if (!clue) return state;
  const routeSteps = PRIME_ROUTE_PROFILES[state.kind as PrimeEligibleKind];
  if (!routeSteps) return state;
  const legacyIndex = (["field-sighting", "distinctive-call", "kinmark-study"] as const).indexOf(clue as never);
  const routeVerb = legacyIndex >= 0 ? routeSteps[legacyIndex]?.id : routeSteps.find((step) => step.id === clue)?.id;
  if (!routeVerb) return state;
  const completedRouteVerbs = [...new Set([...(state.completedRouteVerbs ?? []), routeVerb])].slice(0, PRIME_ROUTE_REQUIRED_CLUES);
  if (completedRouteVerbs.length === (state.completedRouteVerbs?.length ?? 0)) return state;
  const completed = [...new Set([...(state.completedClues ?? []), clue])].slice(0, PRIME_ROUTE_REQUIRED_CLUES);
  return Object.freeze({
    ...state,
    status: state.status === "active" ? "observed" : state.status,
    completedClues: Object.freeze(completed),
    completedRouteVerbs: Object.freeze(completedRouteVerbs),
    routeProgress: completedRouteVerbs.length,
    lastUpdatedAt: Math.max(state.lastUpdatedAt, now),
  });
}

export function primeEncounterRouteComplete(state: PrimeEncounterState | null | undefined) {
  return (state?.routeProgress ?? state?.completedRouteVerbs?.length ?? state?.completedClues?.length ?? 0) >= PRIME_ROUTE_REQUIRED_CLUES;
}

export function transferPrimeEncounterCustody(
  state: PrimeEncounterState,
  status: Extract<PrimeEncounterStatus, "captured" | "released">,
  specimenId: string,
  custodyId: string | null,
  entityId: number | null,
  now: number,
) {
  if (state.specimenId && state.specimenId !== specimenId) return state;
  if (status === "released" && state.status === "captured" && state.custodyId && state.custodyId !== custodyId) return state;
  return Object.freeze({
    ...transitionPrimeEncounter(state, status, entityId, now),
    specimenId,
    custodyId: status === "captured" ? custodyId : null,
  });
}

export function transferPrimeCustodyReference(
  state: PrimeEncounterState,
  specimenId: string,
  fromCustodyId: string,
  toCustodyId: string,
  now: number,
) {
  if (state.status !== "captured" || state.specimenId && state.specimenId !== specimenId
    || state.custodyId && state.custodyId !== fromCustodyId || !toCustodyId.trim()) return state;
  return Object.freeze({
    ...state,
    specimenId,
    custodyId: toCustodyId.trim().slice(0, 192),
    lastUpdatedAt: Math.max(state.lastUpdatedAt, now),
  });
}

export function normalizePrimeEncounterStates(value: unknown) {
  const states = new Map<string, PrimeEncounterState>();
  if (!value || typeof value !== "object") return states;
  for (const [anchorId, candidate] of Object.entries(value as Record<string, unknown>).slice(0, 512)) {
    const anchor = /^prime:([a-z0-9-]+):(-?\d+):(-?\d+)$/u.exec(anchorId);
    if (!candidate || typeof candidate !== "object" || !anchor) continue;
    const raw = candidate as Partial<PrimeEncounterState>;
    if (raw.schema !== 1 || typeof raw.kind !== "string" || !PRIME_FORM_PROFILES[raw.kind as MobKind]
      || anchor[1] !== raw.kind
      || !["active", "observed", "captured", "released", "defeated"].includes(String(raw.status))) continue;
    const clues = Array.isArray(raw.completedClues)
      ? [...new Set(raw.completedClues.flatMap((clue) => {
        if (typeof clue !== "string") return [];
        const normalized = clue.trim().toLocaleLowerCase().replace(/[^a-z0-9-]+/gu, "-").slice(0, 64);
        return normalized ? [normalized] : [];
      }))].slice(0, PRIME_ROUTE_REQUIRED_CLUES)
      : [];
    const profileRoute = PRIME_ROUTE_PROFILES[raw.kind as PrimeEligibleKind] ?? [];
    const allowedRouteVerbs = new Set(profileRoute.map((step) => step.id));
    const routeVerbs = Array.isArray(raw.completedRouteVerbs)
      ? [...new Set(raw.completedRouteVerbs.filter((verb): verb is string => typeof verb === "string" && allowedRouteVerbs.has(verb)))].slice(0, PRIME_ROUTE_REQUIRED_CLUES)
      : clues.flatMap((clue) => {
        const legacyIndex = (["field-sighting", "distinctive-call", "kinmark-study"] as const).indexOf(clue as never);
        const translated = legacyIndex >= 0 ? profileRoute[legacyIndex]?.id : allowedRouteVerbs.has(clue) ? clue : null;
        return translated ? [translated] : [];
      });
    const firstActivatedAt = Math.max(0, Number(raw.firstActivatedAt) || 0);
    const lastUpdatedAt = Math.max(firstActivatedAt, Number(raw.lastUpdatedAt) || 0);
    const specimenId = typeof raw.specimenId === "string" ? raw.specimenId.trim().slice(0, 160) : "";
    const custodyId = typeof raw.custodyId === "string" ? raw.custodyId.trim().slice(0, 192) : raw.custodyId === null ? null : undefined;
    states.set(anchorId, Object.freeze({
      schema: 1, anchorId, kind: raw.kind as MobKind, status: raw.status as PrimeEncounterStatus,
      entityId: Number.isFinite(raw.entityId) && Number(raw.entityId) > 0 ? Math.floor(Number(raw.entityId)) : null,
      firstActivatedAt, lastUpdatedAt,
      ...(specimenId ? { specimenId } : {}),
      ...(custodyId !== undefined ? { custodyId } : {}),
      ...(clues.length ? { completedClues: Object.freeze(clues) } : {}),
      ...(routeVerbs.length ? { completedRouteVerbs: Object.freeze(routeVerbs), routeProgress: routeVerbs.length } : {}),
    }));
  }
  return states;
}
