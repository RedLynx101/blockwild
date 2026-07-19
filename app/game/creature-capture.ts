import type { CaptureProfileId } from "./creature-profiles";
import type { LegendaryCreatureKind, LivingRosterKind, MobKind, SummonedCreatureKind } from "./mobs";

/** Capture never rolls a hidden chance. A lens opens an authored route. */
export type CaptureLensId = "gentle" | "gloam" | "tide" | "resonance";
export type CaptureConditionId =
  | "safe-approach" | "calm" | "fed" | "unaware" | "tired" | "intercepted"
  | "vulnerable" | "objective-resolved" | "subdued" | "submerged" | "tide-lens"
  | "resonance-matched" | "resonance-lens" | "rescued" | "anchor-window"
  | "encounter-complete" | "legendary-consent";

export type CaptureConditionDefinition = Readonly<{
  id: CaptureConditionId;
  label: string;
  hint: string;
}>;

export const CAPTURE_CONDITIONS: Readonly<Record<CaptureConditionId, CaptureConditionDefinition>> = Object.freeze({
  "safe-approach": { id: "safe-approach", label: "Safe approach", hint: "Approach without attacking or alarming the creature." },
  calm: { id: "calm", label: "Calm", hint: "Let its alarm settle or use a known calming interaction." },
  fed: { id: "fed", label: "Fed", hint: "Offer a preferred food and wait for it to accept." },
  unaware: { id: "unaware", label: "Unaware", hint: "Remain outside its alarm response until the orb is raised." },
  tired: { id: "tired", label: "Tired", hint: "Let the creature finish a pursuit or expend its escape burst." },
  intercepted: { id: "intercepted", label: "Safely intercepted", hint: "Block its route without trapping it against damaging terrain." },
  vulnerable: { id: "vulnerable", label: "Armor opened", hint: "Observe its action cycle and expose the protected body state." },
  "objective-resolved": { id: "objective-resolved", label: "Territory resolved", hint: "Remove the threat or disturbance it is defending." },
  subdued: { id: "subdued", label: "Subdued", hint: "Reduce its health below the visible capture threshold without defeating it." },
  submerged: { id: "submerged", label: "Keeper submerged", hint: "Remain in the creature's medium during capture." },
  "tide-lens": { id: "tide-lens", label: "Tide Lens fitted", hint: "Fit a Tide Lens to stabilize the orb underwater." },
  "resonance-matched": { id: "resonance-matched", label: "Resonance matched", hint: "Reproduce the creature's learned call, light, rhythm, or magical state." },
  "resonance-lens": { id: "resonance-lens", label: "Resonance Lens fitted", hint: "Fit a Resonance Lens so the orb can hold the matched pattern." },
  rescued: { id: "rescued", label: "Rescued", hint: "Free the creature from the danger shown in its field notes." },
  "anchor-window": { id: "anchor-window", label: "Trust window", hint: "Stay near after the rescue until it voluntarily holds position." },
  "encounter-complete": { id: "encounter-complete", label: "Encounter complete", hint: "Complete every authored phase of this legendary encounter." },
  "legendary-consent": { id: "legendary-consent", label: "Resolution chosen", hint: "Earn or choose the encounter's explicit capture resolution." },
});

export type CaptureRequirement = Readonly<{
  /** At least one condition in the group must be true. */
  anyOf: readonly CaptureConditionId[];
}>;

export type CaptureProfileDefinition = Readonly<{
  id: Exclude<CaptureProfileId, "uncapturable">;
  name: string;
  summary: string;
  requirements: readonly CaptureRequirement[];
  suggestedLens: CaptureLensId | null;
}>;

const requirement = (...anyOf: CaptureConditionId[]): CaptureRequirement => Object.freeze({ anyOf: Object.freeze(anyOf) });

export const CAPTURE_PROFILES: Readonly<Record<Exclude<CaptureProfileId, "uncapturable">, CaptureProfileDefinition>> = Object.freeze({
  open: Object.freeze({ id: "open", name: "Open", summary: "An ordinary, humane relocation.", requirements: [requirement("safe-approach")], suggestedLens: null }),
  gentle: Object.freeze({ id: "gentle", name: "Gentle", summary: "Earn a quiet approach instead of injuring a skittish animal.", requirements: [requirement("calm", "fed", "unaware")], suggestedLens: "gentle" }),
  pursuit: Object.freeze({ id: "pursuit", name: "Pursuit", summary: "Read its escape route and finish the chase safely.", requirements: [requirement("tired"), requirement("intercepted")], suggestedLens: null }),
  armored: Object.freeze({ id: "armored", name: "Armored", summary: "Wait for the protection to open.", requirements: [requirement("vulnerable")], suggestedLens: null }),
  territorial: Object.freeze({ id: "territorial", name: "Territorial", summary: "Resolve what it defends or subdue it without a kill.", requirements: [requirement("objective-resolved", "subdued")], suggestedLens: null }),
  aquatic: Object.freeze({ id: "aquatic", name: "Aquatic", summary: "Meet it in its own medium with a stabilized orb.", requirements: [requirement("submerged"), requirement("tide-lens")], suggestedLens: "tide" }),
  resonant: Object.freeze({ id: "resonant", name: "Resonant", summary: "Match its signature and preserve the pattern.", requirements: [requirement("resonance-matched"), requirement("resonance-lens")], suggestedLens: "resonance" }),
  rescue: Object.freeze({ id: "rescue", name: "Rescue", summary: "Rescue first; capture only during the voluntary trust window.", requirements: [requirement("rescued"), requirement("anchor-window")], suggestedLens: "gentle" }),
  legendary: Object.freeze({ id: "legendary", name: "Legendary", summary: "A complete authored encounter with an explicit resolution.", requirements: [requirement("encounter-complete"), requirement("legendary-consent")], suggestedLens: null }),
});

export type ExpansionCreatureKind = LivingRosterKind | LegendaryCreatureKind | SummonedCreatureKind;
export type AuthoredCreatureCaptureSheet = Readonly<{
  kind: ExpansionCreatureKind;
  profileId: CaptureProfileId;
  microHook: string;
  conditionRevealOrder: readonly CaptureConditionId[];
  careClues: readonly [primary: string, socialOrShelter: string];
  enclosureClue: string;
  releaseOutcome: string;
}>;

const captureSheet = <K extends ExpansionCreatureKind>(
  kind: K,
  profileId: CaptureProfileId,
  microHook: string,
  conditionRevealOrder: readonly CaptureConditionId[],
  careClues: readonly [string, string],
  enclosureClue: string,
  releaseOutcome: string,
): AuthoredCreatureCaptureSheet => Object.freeze({
  kind, profileId, microHook, conditionRevealOrder: Object.freeze([...conditionRevealOrder]),
  careClues: Object.freeze([...careClues]) as readonly [string, string], enclosureClue, releaseOutcome,
});

/** Deterministic capture and care completion sheets for the entire expansion. */
export const AUTHORED_CREATURE_CAPTURE_SHEETS = Object.freeze({
  "thornhide-trufflehog": captureSheet("thornhide-trufflehog", "gentle", "Complete its blackcap ring, then offer a ripe truffle without crossing the living mycelium.", ["fed", "calm"], ["Loose woodland soil with an intact fungal bed.", "Forages best beside one familiar rooter or a quiet keeper."], "A leaf-litter pen must retain diggable soil and shade.", "Replants truffle spores in a suitable woodland ecology cell."),
  "orchard-glider": captureSheet("orchard-glider", "gentle", "Return a fallen nest seed to the parent tree and wait beneath its next voluntary glide.", ["unaware", "fed", "calm"], ["Tall fruiting branches and clear glide lanes.", "Needs a high nest box rather than a ground hutch."], "An orchard canopy route must connect perch to food tree.", "Carries one viable seed into a compatible young orchard."),
  "petalmask-tanuki": captureSheet("petalmask-tanuki", "resonant", "Follow only the petal-bearing ecological trail, then mirror the real mask pattern with a Resonance Lens.", ["resonance-matched", "resonance-lens"], ["Leaf litter, moonlit cover, and scent puzzles.", "Becomes distressed if every hiding place is brightly lit."], "A woodland enclosure needs several real scent routes and one secluded den.", "Creates one harmless false trail away from a restored nesting patch."),
  "ironbeak-magpie": captureSheet("ironbeak-magpie", "gentle", "Trade a plain useful fastener for a stolen trinket; do not take from its active cache.", ["fed", "safe-approach"], ["A metal-free perch edge prevents beak abrasion.", "Provide a small legal cache and rotating puzzle objects."], "A tall aviary needs a lockable cache tray and message-tube perch.", "Returns one cached non-unique object before joining a wild rookery."),
  "hearthback-badger": captureSheet("hearthback-badger", "territorial", "Repair its collapsed warm burrow entrance, then stand clear while it inspects every exit.", ["objective-resolved", "calm"], ["Deep diggable soil with a dry warm chamber.", "Prefers a single stable den over frequent enclosure changes."], "Burrow walls need two exits and an unblocked turning chamber.", "Excavates a small den starter that later wildlife can occupy."),
  "sunfoil-pangolin": captureSheet("sunfoil-pangolin", "armored", "Clear predators from its feeding mound and raise the orb only during the fully animated uncurl window.", ["objective-resolved", "vulnerable"], ["Warm dry substrate and live insect mounds.", "Sun-basking time matters more than repeated feeding."], "A low rock shelf must provide direct morning sun and a shaded retreat.", "Reopens a dormant insect mound without damaging nearby crops."),
  "glassstep-jerboa": captureSheet("glassstep-jerboa", "gentle", "Trace its moonlit glass tracks to a burrow and wait motionless outside the escape lane.", ["unaware", "calm"], ["Deep dry sand and a cool underground chamber.", "Needs long unobstructed hopping lanes."], "Fine mesh must leave a full spring-length clear around the burrow.", "Seeds sparse desert grass along its departure route."),
  "stormcrest-ibex": captureSheet("stormcrest-ibex", "rescue", "Reach the storm cairn, repair the broken descent route, and catch a separated kid before the trust window.", ["rescued", "anchor-window"], ["Steep stone, high wind, and a dry overhang.", "Bond advances through safe climbs, not flat pen feeding."], "A highland range needs ledges of several heights and no sheer escape drop.", "Reopens an abstract highland migration anchor after release."),
  "cindercoil-gecko": captureSheet("cindercoil-gecko", "resonant", "Stabilize a dangerous wall heat gradient, then match its toe-pad pulse with a Resonance Lens.", ["objective-resolved", "resonance-matched", "resonance-lens"], ["Warm vertical stone with a cooler retreat seam.", "Feed small cave insects at dusk rather than raw meat."], "The habitat needs climbable heated wall panels and one unheated crevice.", "Occupies a safe fumarole wall and warns nearby wildlife of pressure."),
  "cloudkite-pika": captureSheet("cloudkite-pika", "resonant", "Repair three descending wind chimes and reproduce the flock's safe-route whistle.", ["resonance-matched", "resonance-lens"], ["Cool highland talus with constant clean airflow.", "Social calls require at least one echoing rock face."], "A cliff aviary needs soft landing nets below multiple ledges.", "Adds one safe abstract descent cue to a highland travel route."),
  "briarclaw-lynx": captureSheet("briarclaw-lynx", "pursuit", "Survive all stalking phases, reveal its final cover, then intercept without fire or damaging traps.", ["tired", "intercepted"], ["Dense real cover and elevated resting shelves.", "Needs solitary retreat space even when bonded."], "A forest range must break sightlines without trapping the lynx in corners.", "Temporarily suppresses overabundant small predators in a healthy forest cell."),
  "gravebell-jackal": captureSheet("gravebell-jackal", "resonant", "Cleanse a disturbed relic and answer its three-part bell howl without opening the reliquary.", ["objective-resolved", "resonance-matched", "resonance-lens"], ["Quiet shade beside a respectfully sealed memorial.", "Avoid loose bells that mask its warning phrases."], "A sanctuary cell needs a sealed relic alcove and an open patrol loop.", "Guards one undisturbed memorial from hostile undead for a world-day band."),
  "cragglass-basilisk": captureSheet("cragglass-basilisk", "armored", "Reflect three gaze beams into the Prime crown or flank scales, then capture during the transparent molt.", ["resonance-matched", "vulnerable"], ["Sun-warmed glass stone with broad turning room.", "Never place reflective panels where its resting gaze meets residents."], "A research range needs angled matte barriers and a separate basking shelf.", "Stabilizes one brittle glassland outcrop without petrifying wildlife."),
  "stormglass-roclet": captureSheet("stormglass-roclet", "rescue", "Free the grounded Roclet from storm debris and wait until it chooses the rescue gauntlet.", ["rescued", "anchor-window"], ["High open air, charged-stone perches, and flight exercise.", "Maturation requires completed flight training and Partnered bond."], "An aerie needs a full takeoff lane and a sheltered thunder perch.", "Returns to its aerie lineage and strengthens the regional rescue flock."),
  "brinewhisk-otter": captureSheet("brinewhisk-otter", "gentle", "Return its favorite shell through a play sequence, then let it offer the shell back.", ["fed", "calm"], ["Clean flowing water, smooth banks, and loose shell toys.", "Daily play can be short; social access matters more."], "A river enclosure needs both deep dive water and a dry communal holt.", "Rejoins a river family and clears one littered shallow."),
  "riverwright-beaver": captureSheet("riverwright-beaver", "rescue", "Deliver assigned logs to repair its breached lodge without placing blocks over the water exit.", ["rescued", "anchor-window"], ["Flowing water, chew-safe logs, and a dry lodge chamber.", "Work assignments must name exact anchors."], "The pond edge needs a protected swim-through entrance and legal log rack.", "Repairs one authored wetland lodge anchor and improves local shelter."),
  "mirecrown-crane": captureSheet("mirecrown-crane", "resonant", "Complete the dawn reed-court circle without entering it, then answer the final call.", ["unaware", "resonance-matched", "resonance-lens"], ["Shallow clean water with tall reeds and open sky.", "Seasonal solitude is normal and should not count as neglect."], "A wetland aviary needs a quiet courtship circle free of path traffic.", "Seeds reeds along one degraded wetland edge."),
  "inkveil-cuttle": captureSheet("inkveil-cuttle", "aquatic", "Restore the observatory's color lamps, match its emotional pattern, and remain submerged with a Tide Lens.", ["resonance-matched", "submerged", "tide-lens"], ["Complex reef cover, dim color lamps, and live hunting puzzles.", "Avoid blank bright tanks that offer no camouflage."], "A deep aquarium needs multiple textured hides and a dark retreat chamber.", "Adds one bounded cleaning-and-camouflage role to a healthy reef."),
  "prismclaw-mantis-shrimp": captureSheet("prismclaw-mantis-shrimp", "armored", "Open an authored cracked shell-bed, then present the orb while both striking clubs are folded.", ["objective-resolved", "vulnerable"], ["Deep burrow substrate and reinforced strike stones.", "Keep delicate glass and tiny tankmates out of its club reach."], "A species tank needs a deep burrow and replaceable impact block.", "Opens one clogged reef crevice for cleaner species."),
  "reefmender-shrimp": captureSheet("reefmender-shrimp", "aquatic", "Let it finish cleaning an injured wild fish, then approach underwater with the Tide Lens.", ["calm", "submerged", "tide-lens"], ["Living coral, gentle current, and compatible client fish.", "Cannot thrive as a solitary decorative specimen."], "A planted reef tank needs cleaning stations reachable by larger residents.", "Establishes a small cleaning station at a compatible reef anchor."),
  "currentweaver-eel": captureSheet("currentweaver-eel", "resonant", "Route a safe lamp current through its pool, match the lateral-line pattern, then use a Tide Lens.", ["resonance-matched", "submerged", "tide-lens"], ["Long current loop, insulated lamp link, and dark shelter tube.", "Discharge opportunities must never expose small residents."], "An aquarium needs a protected electrical loop and multiple retreat tunnels.", "Restores one dim lamp-link clue along an underwater route."),
  "shellcarrier-hermit": captureSheet("shellcarrier-hermit", "gentle", "Offer a clearly better empty shell and wait until it abandons the old one voluntarily.", ["fed", "calm"], ["Mixed shell sizes, loose clean substrate, and tidevine.", "Never glue equipment to its living shell choice."], "A shallow tank needs open shell-changing space and a low cargo rack.", "Leaves its prior shell as habitat for a smaller shore animal."),
  "wreckwhistle-porpoise": captureSheet("wreckwhistle-porpoise", "rescue", "Follow the descending wrecksong, clear debris from a trapped podmate, then accept the rising home call.", ["rescued", "anchor-window"], ["Large deep-water circuit and regular pod contact.", "A tide harness is fitted only after the rescue bond quest."], "A sea sanctuary needs an unobstructed breathing circuit and social pod slots.", "Guides its pod around one dangerous wreck route after release."),
  "kilnscale-salamander": captureSheet("kilnscale-salamander", "territorial", "Vent or cool its fumarole into a stable gradient, then approach the chosen basking shelf.", ["objective-resolved", "calm"], ["A continuous hot-to-cool stone gradient.", "Deep chill requires gradual rewarming, not repeated feeding."], "The habitat needs connected hot, warm, and cool shelves with no flame trap.", "Maintains a safe heat-gradient clue near a cave ecology center."),
  "sporeback-gardener": captureSheet("sporeback-gardener", "gentle", "Complete its broken mushroom ring and leave the center unharvested through one night.", ["fed", "safe-approach"], ["Prepared fungal beds, dim moisture, and spent compost.", "Its visible cap family should remain with its inherited garden."], "A grotto pen needs several prepared beds and an untouched central ring.", "Restarts one dormant fungal patch and leaves viable compost."),
  "voidmantle-ray": captureSheet("voidmantle-ray", "pursuit", "Follow its entire luminous feeding route without cutting across the school, then intercept at the resting arch.", ["tired", "intercepted"], ["Very large dark cavern volume and luminous plankton route.", "Partnered glides require a clear descending lane."], "A cavern sanctuary needs open three-dimensional volume, not a narrow pen.", "Rejoins an abstract plankton migration through a restored cavern."),
  "fossilback-trilobite": captureSheet("fossilback-trilobite", "aquatic", "Brush sediment from around the moving shell without mining it, then remain submerged with a Tide Lens.", ["safe-approach", "submerged", "tide-lens"], ["Deep undisturbed sediment and low current.", "Do not constantly rake the substrate it reads."], "A research aquarium needs layered sediment and protected resting patches.", "Settles into one suitable ancient-water stratum and reveals a history clue."),
  "ilyr-virebloom": captureSheet("ilyr-virebloom", "legendary", "Restore three dry centers, calm their spirits, survive the nonlethal charge, and offer a Sanctuary Seal while Ilyr drinks.", ["encounter-complete", "legendary-consent"], ["A sanctuary-scale migration between living springs.", "Care is ecological restoration, not stable chores."], "Ilyr remains a legendary-world resident except during an earned travel covenant.", "Restores the chosen watershed route and persists at its regional anchor."),
  thalassene: captureSheet("thalassene", "legendary", "Install three reef anchors and complete the trench rescue without striking the living reef.", ["encounter-complete", "legendary-consent"], ["A protected migration and bounded resident reef slots.", "Bleaching and parasite care resolve at authored sites."], "Thalassene is a mobile sanctuary, never a conventional aquarium captive.", "Reestablishes the protected reef migration and its resident schools."),
  orichalc: captureSheet("orichalc", "legendary", "Mine around the seam, rescue delvers, and choose bind, redirect, wake, or dormancy without resolving its nature.", ["encounter-complete", "legendary-consent"], ["An intact Veinmetal seam and non-destructive maintenance access.", "No food or breeding model applies."], "Any bound state remains at a purpose-built Deepgear anchor.", "Returns to dormancy or redirects its living seam according to the chosen oath."),
  "varkesh-stormmane": captureSheet("varkesh-stormmane", "legendary", "Rebuild highland wayposts, cross the storm, and protect the displaced flock before choosing bond, pact, or aerie.", ["encounter-complete", "legendary-consent"], ["A major aerie, storm frontage, and rebuilt beacons.", "Voluntary travel pact is as valid as capture."], "Varkesh requires an open regional aerie and cannot live in a roofed pen.", "Maintains the storm road or protects the lineage aerie."),
  kharza: captureSheet("kharza", "legendary", "Destroy every coercive harness anchor before offering capture or a free pack pact.", ["encounter-complete", "legendary-consent"], ["Open patrol ground and complete removal of control hardware.", "Trust cannot advance while any coercive rune remains."], "Kharza needs a broad pack range with no chain anchor props.", "Forms a free territorial pack that deters coercive camps."),
  "sugarwake-sovereign": captureSheet("sugarwake-sovereign", "legendary", "Contain syrup floods, cool the kiln-heart, protect guests, then choose guardian, heart-form, or communal station.", ["encounter-complete", "legendary-consent"], ["Cooling lanes, feast space, and supervised kiln access.", "Its forms are maintained through communal craft, not hunger."], "The full Sovereign remains a Sugarcourt guardian; only the separated heart-form uses creature storage.", "Stabilizes as the chosen communal guardian or crafting legacy."),
  "bellstep-qilin": captureSheet("bellstep-qilin", "legendary", "Tune the Road of Quiet Bells and finish the patient circuit before offering a road covenant.", ["encounter-complete", "legendary-consent"], ["An open road circuit with intact bells.", "Bond rises through repairs and calm travel."], "A covenant Qilin requires a connected road and an unsounded rest court.", "Keeps the quiet road safe and reveals lost approaches."),
  "aerolith-baleen": captureSheet("aerolith-baleen", "legendary", "Return the grave-bones and complete the Cloudwhale mourning turn without attacking.", ["encounter-complete", "legendary-consent"], ["Open sky volume and a protected graveyard shelf.", "Care centers on fallen-bone recovery."], "The Baleen remains a mobile sky sanctuary rather than a roofed captive.", "Carries the recovered dead back into the high currents."),
  "mireglass-kelpie": captureSheet("mireglass-kelpie", "legendary", "Resolve the Mirrorfen procession and approach only the wake that rescues lanterns.", ["encounter-complete", "legendary-consent"], ["Connected shallow water and reed cover.", "Trust depends on distinguishing decoy from distress."], "A broad fen range must contain both still mirror water and a dry bank.", "Guides lost travelers along the true fen path."),
  "cinderwing-pyrausta": captureSheet("cinderwing-pyrausta", "legendary", "Stabilize every heat cradle and protect the hatchery through a full cooling cycle.", ["encounter-complete", "legendary-consent"], ["A stable warm gradient and intact egg cradles.", "Never extinguish every nursery vent at once."], "A sanctuary aviary needs high thermal clearance and a cool refuge.", "Returns to guard a restored emberglass nursery."),
  "nacre-gatewyrm": captureSheet("nacre-gatewyrm", "legendary", "Restore the Drowned Moon Gate and both sealed air gardens before entering the moonwell.", ["encounter-complete", "legendary-consent"], ["Pressure-sealed tidework and a living-coral current.", "The air-pocket behavior must remain unobstructed."], "A Gatewyrm requires connected deep water and a sealed dry threshold.", "Patrols the repaired gate and opens safe moonwell pockets."),
  "frostcauldron-behemoth": captureSheet("frostcauldron-behemoth", "legendary", "Brace Titan's Kettle, warm the caravan, and accept the Behemoth's measured snowplow.", ["encounter-complete", "legendary-consent"], ["Cold open range with a dry sheltered lee.", "Care is caravan shelter and avalanche work."], "Its range cannot obstruct a Dwarven settlement approach.", "Maintains a safe winter caravan refuge."),
  "briarcrown-manticore": captureSheet("briarcrown-manticore", "legendary", "Release the menagerie habitats and survive a venom-free crown challenge.", ["encounter-complete", "legendary-consent"], ["A layered forest range with living root terraces.", "Venom care needs marked safe handling lanes."], "The range needs pounce height, solitude, and no trapped corners.", "Controls invasive briars around the restored menagerie."),
  ammonarch: captureSheet("ammonarch", "legendary", "Rewater the Fossil Orchard and return its spiral fossils without mining the mantle.", ["encounter-complete", "legendary-consent"], ["Deep sediment, mineral water, and resonant fossil fruit.", "Do not polish away the shell's living patina."], "A sanctuary basin must support the full spiral and a dry resonance shelf.", "Guards the orchard and reveals ancient strata."),
  "handtail-ahuizotl": captureSheet("handtail-ahuizotl", "legendary", "Return every keepsake and accept the final object from its tail-hand.", ["encounter-complete", "legendary-consent"], ["Running water, dry keepsake niches, and rescue ropes.", "Retrieval play replaces repetitive feeding."], "The cistern range needs a safe backwash loop and reachable dry shelf.", "Rescues swimmers and returns lost belongings."),
  "tideclock-cetus": captureSheet("tideclock-cetus", "legendary", "Reset all tide gears and follow the wreck's long current without taking memorial cargo.", ["encounter-complete", "legendary-consent"], ["A very large deep-water circuit and intact sounding bells.", "Tideclock care uses wreck surveys rather than enclosure chores."], "The Cetus remains pelagic and cannot use a conventional tank.", "Keeps the wreck route navigable and remembers lost cargo."),
  "anemoi-gryphon": captureSheet("anemoi-gryphon", "legendary", "Open nine wind shutters and complete the Palace Circuit without shortcuts.", ["encounter-complete", "legendary-consent"], ["A high open aerie with nine distinct draft lanes.", "Bond advances through safe flight circuits."], "The aerie needs unobstructed takeoff, landing, and storm shelter.", "Maintains the nine-wind palace and its rescue drafts."),
  "sable-gorgon": captureSheet("sable-gorgon", "legendary", "Free every quarry cocoon and reverse the final charge through the merciful mirrors.", ["encounter-complete", "vulnerable"], ["Matte stone, controlled mirrors, and a broad charge lane.", "Never point resting mirrors at residents."], "A research range needs cocoon-safe walls and multiple turn radii.", "Protects the quarry while preserving petrified workers."),
  "namarra-makara": captureSheet("namarra-makara", "legendary", "Restore both air gardens and complete the pearl audience without looting the court.", ["encounter-complete", "legendary-consent"], ["Deep court water and pressure-sealed air gardens.", "Regalia is maintained, never harvested."], "The Makara needs a flooded court loop and one ceremonial dry threshold.", "Reopens the Sunken Court to peaceful audiences."),
  "ashen-salamander-king": captureSheet("ashen-salamander-king", "legendary", "Recover seven heat-tablets and relight the archive chimney without burning a stack.", ["encounter-complete", "vulnerable"], ["A controlled kiln gradient and fireproof archive lanes.", "Memory heat cycles replace ordinary feeding."], "The range needs separate hot, warm, and archive-cool rooms.", "Keeps the thermal library readable and tempers local forges."),
  "mycelial-oneirophant": captureSheet("mycelial-oneirophant", "legendary", "Repair six habitat loops, refill the memory pond, and walk the remembered path quietly.", ["encounter-complete", "legendary-consent"], ["A sanctuary-scale fungal habitat and living memory pond.", "Dark ordinary tunnels must remain dark."], "Its range needs several habitat echoes connected without brightening every corridor.", "Restores bounded memories of lost habitats."),
  asterjaw: captureSheet("asterjaw", "uncapturable", "Asterjaw is bound by a stable summoning contract and becomes permanent only through a valid Worldpin grounding.", [], ["A mapped route back to its anchor.", "Grounded care uses travel and rescue work rather than feeding."], "A grounded Asterjaw needs an unobstructed Homeward Arc to its Worldpin.", "Returns to the Unwalked Meridian when dismissed; grounding is a separate permanent choice."),
  "vellum-warden": captureSheet("vellum-warden", "uncapturable", "The Warden is invoked through its Palimpsest contract and grounded only after the full Worldpin process.", [], ["Dry archive space and one intentionally blank page.", "Grounded maintenance uses ink and binding repair."], "A grounded Warden needs a quiet archive margin around its Worldpin.", "Returns to the Palimpsest Expanse with its contract memory intact."),
  "choir-of-one": captureSheet("choir-of-one", "uncapturable", "Choir-of-One answers a silence covenant; Capture Orbs cannot contain the Hush Between Bells.", [], ["A bounded quiet zone with no forced performance.", "Grounded care preserves periods of complete silence."], "A grounded Choir needs an acoustically separated Worldpin chamber.", "Returns through the final silent measure without rerolling identity."),
  "glasswake-stag": captureSheet("glasswake-stag", "uncapturable", "The Stag follows an unbroken reflection contract and becomes permanent only through Worldpin grounding.", [], ["Still water, clean reflective stone, and open running space.", "Grounded care requires both shore and air-route access."], "A grounded Stag needs a still pool aligned with its Worldpin and a clear rescue lane.", "Returns to the Sea Behind Mirrors along its stable second shore."),
} satisfies Readonly<Record<ExpansionCreatureKind, AuthoredCreatureCaptureSheet>>);

export function authoredCreatureCaptureSheet(kind: MobKind) {
  return AUTHORED_CREATURE_CAPTURE_SHEETS[kind as ExpansionCreatureKind] ?? null;
}

export type CaptureReadinessContext = Readonly<{
  profileId: CaptureProfileId;
  states: Readonly<Partial<Record<CaptureConditionId, boolean>>>;
  fittedLens?: CaptureLensId | null;
  learnedConditions?: readonly CaptureConditionId[];
}>;

export type CaptureConditionView = Readonly<{
  id: CaptureConditionId | null;
  label: string;
  hint: string;
  satisfied: boolean;
  learned: boolean;
}>;

export type CaptureReadiness = Readonly<{
  capturable: boolean;
  ready: boolean;
  profileId: CaptureProfileId;
  profileName: string;
  summary: string;
  conditions: readonly CaptureConditionView[];
  missingKnown: readonly CaptureConditionId[];
}>;

function conditionSatisfied(id: CaptureConditionId, context: CaptureReadinessContext) {
  if (id === "tide-lens") return context.fittedLens === "tide";
  if (id === "resonance-lens") return context.fittedLens === "resonance";
  return context.states[id] === true;
}
export function evaluateCaptureReadiness(context: CaptureReadinessContext): CaptureReadiness {
  if (context.profileId === "uncapturable") return Object.freeze({
    capturable: false, ready: false, profileId: context.profileId, profileName: "Uncapturable",
    summary: "This being must be recruited, built, defeated, or resolved through its authored system.",
    conditions: Object.freeze([]), missingKnown: Object.freeze([]),
  });
  const profile = CAPTURE_PROFILES[context.profileId];
  const learned = new Set(context.learnedConditions ?? []);
  const conditions: CaptureConditionView[] = [];
  const missingKnown: CaptureConditionId[] = [];
  let ready = true;
  for (const group of profile.requirements) {
    const satisfied = group.anyOf.some((id) => conditionSatisfied(id, context));
    ready &&= satisfied;
    const revealed = group.anyOf.filter((id) => learned.has(id));
    if (!revealed.length) {
      conditions.push(Object.freeze({ id: null, label: "Unknown condition", hint: "Observe this species or consult a guild naturalist.", satisfied, learned: false }));
      continue;
    }
    const preferred = revealed.find((id) => conditionSatisfied(id, context)) ?? revealed[0];
    if (!satisfied) missingKnown.push(...revealed);
    conditions.push(Object.freeze({ ...CAPTURE_CONDITIONS[preferred], satisfied, learned: true }));
  }
  return Object.freeze({
    capturable: true, ready, profileId: profile.id, profileName: profile.name, summary: profile.summary,
    conditions: Object.freeze(conditions), missingKnown: Object.freeze([...new Set(missingKnown)]),
  });
}

export type CreatureCaptureKnowledge = Readonly<{
  kind: MobKind;
  learnedConditions: readonly CaptureConditionId[];
  mastered: boolean;
  microHook: string | null;
  careClues: readonly string[];
}>;

/** Research reveals requirements in authored order; mastery never changes the rules. */
export function captureKnowledgeForResearch(kind: MobKind, profileId: CaptureProfileId, researchLevel: number): CreatureCaptureKnowledge {
  const authoredSheet = authoredCreatureCaptureSheet(kind);
  const details = {
    microHook: researchLevel >= 1 ? authoredSheet?.microHook ?? null : null,
    careClues: Object.freeze(researchLevel >= 2 ? [...(authoredSheet?.careClues ?? [])] : []),
  };
  if (profileId === "uncapturable") return Object.freeze({ kind, learnedConditions: Object.freeze([]), mastered: researchLevel >= 3, ...details });
  const ordered = authoredSheet?.conditionRevealOrder.length
    ? authoredSheet.conditionRevealOrder
    : CAPTURE_PROFILES[profileId].requirements.flatMap((group) => group.anyOf);
  const count = researchLevel <= 0 ? 0 : researchLevel === 1 ? 1 : researchLevel === 2 ? Math.max(1, Math.ceil(ordered.length / 2)) : ordered.length;
  return Object.freeze({ kind, learnedConditions: Object.freeze(ordered.slice(0, count)), mastered: researchLevel >= 3, ...details });
}
