import type { FactionId } from "./factions";
import type { SkillId } from "./skills";
import { Item, type ItemCode } from "./data";

export type GuildId = "waykeeper" | "tideglass" | "moonbough" | "brassroot" | "deepgear" | "hearthroad" | "sugarcourt-makers";
export type GuildMembership = "unknown" | "invited" | "member" | "suspended" | "honored";
export type GuildHallState = "lodge" | "established" | "charter";
export type GuildDoctrine = "stewardship" | "intervention" | "public-service" | "guarded-mastery" | "independence" | "shared-harvest" | "bold-experiment";
export type GuildObjectiveKind = "observeCreature" | "captureCreature" | "releaseCreature" | "trainMove" | "meetHabitatNeed" | "escortActor" | "defendArea" | "repairStructure" | "surveyLocation" | "mineSafely" | "groundSummon" | "travelRoad" | "resolveEncounter" | "choiceOutcome" | "craftUnderConstraint" | "negotiate";

export type GuildRankDefinition = Readonly<{ id: string; name: string; standing: number; demonstrationCount: number; questNumber: number }>;
export type GuildQuestObjective = Readonly<{ id: string; kind: GuildObjectiveKind; target: number; explanation: string }>;
export type GuildQuestDefinition = Readonly<{
  id: string; guildId: GuildId; number: number; name: string; summary: string;
  objectives: readonly GuildQuestObjective[]; solutionFamilies: readonly string[]; recovery: string; persistentChange: string;
}>;
export type GuildNpcDefinition = Readonly<{
  id: string; guildId: GuildId; name: string; role: string; philosophy: string; recruitable: boolean;
  homeSchedule: readonly string[]; combatRole: string; utility: string; weakness: string; companion: string | null;
  personalQuest: string | null; contextLines: readonly string[];
}>;
export type GuildDefinition = Readonly<{
  id: GuildId; factionId: FactionId | "player"; name: string; purpose: string; ranks: readonly GuildRankDefinition[];
  primarySkills: readonly SkillId[]; secondarySkills: readonly SkillId[]; perks: readonly string[];
  principalNpcIds: readonly string[]; questIds: readonly string[]; standaloneHall: string; doctrines: readonly string[];
}>;

const rank = (guild: GuildId, names: readonly string[]): readonly GuildRankDefinition[] => Object.freeze(names.map((name, index) => Object.freeze({
  id: `${guild}-rank-${index + 1}`, name, standing: [0, 10, 25, 45, 70, 90][index], demonstrationCount: [0, 1, 2, 3, 4, 5][index], questNumber: [1, 2, 3, 5, 7, 8][index],
})));
const objective = (kind: GuildObjectiveKind, explanation: string, target = 1): GuildQuestObjective => Object.freeze({ id: `${kind}:${explanation.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 36)}`, kind, target, explanation });
const quest = (guildId: GuildId, number: number, name: string, summary: string, kinds: readonly GuildObjectiveKind[], solutions: readonly string[], persistentChange: string): GuildQuestDefinition => Object.freeze({
  id: `${guildId}-${number}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`, guildId, number, name, summary,
  objectives: Object.freeze(kinds.map((kind, index) => objective(kind, `${name}: ${["first field proof", "system demonstration", "authored resolution"][index] ?? "resolution"}`))),
  solutionFamilies: Object.freeze([...solutions]), recovery: "Named anchors retreat or become incapacitated; lost tools can be reacquired and escaped encounters return after a bounded cooldown.", persistentChange,
});

const CAMPAIGN_ROWS: Readonly<Record<GuildId, readonly [string, string, readonly GuildObjectiveKind[], readonly string[], string][]>> = Object.freeze({
  waykeeper: [
    ["Open Hand, Empty Orb", "Observe without startling, then capture and release one healthy common creature in its home biome.", ["observeCreature", "captureCreature", "releaseCreature"], ["patient field observation", "habitat-assisted observation"], "The hall displays the released creature's welfare history."],
    ["Home Is Habitat", "Restore a real enclosure with shelter, food, space, and social needs.", ["meetHabitatNeed", "repairStructure"], ["repair an existing pen", "build a new sanctuary habitat"], "The restored habitat remains functional."],
    ["Teeth in the Ledger", "Determine whether livestock loss came from predation, fencing, or poaching.", ["surveyLocation", "resolveEncounter", "choiceOutcome"], ["relocate or deter", "compensate or fight"], "Farms retain the chosen protection and predator policy."],
    ["The Stolen Menagerie", "Break a mobile poacher operation and release badly housed creatures.", ["resolveEncounter", "releaseCreature", "choiceOutcome"], ["infiltration and sabotage", "direct rescue combat"], "Freed species recover around the dismantled camp."],
    ["Bloodline Without Chains", "Raise or adopt a juvenile, teach a move, and demonstrate safe recall or enclosure.", ["trainMove", "meetHabitatNeed"], ["adoption and training", "ethical breeding and training"], "A juvenile-care wing opens at the hall."],
    ["Prime Signs", "Follow multi-biome clues to document a rare migration without a map pin.", ["observeCreature", "surveyLocation", "travelRoad"], ["track signs on foot", "scout with a trained bird or mount"], "Ilyr's migration clues enter the Living Bestiary."],
    ["The Walking Spring", "Stabilize Ilyr's moving ecological disturbance before covenant, capture, or battle.", ["defendArea", "meetHabitatNeed", "resolveEncounter", "choiceOutcome"], ["heal and calm", "fair capture", "lethal containment with restitution"], "Ilyr's ecological echo route persists regardless of custody."],
    ["Charter of Living Roads", "Choose protected corridors, community stewardship, or active intervention.", ["choiceOutcome"], ["protected corridors", "community stewardship", "active intervention"], "Contracts, hall displays, and settlement wildlife responses follow the charter."],
  ],
  tideglass: [
    ["A Breathing Lesson", "Prepare a safe dive and capture a small aquatic creature without forcing it onto land.", ["surveyLocation", "captureCreature"], ["gear-led dive", "companion-assisted dive"], "Safe-return markers remain around the teaching reef."],
    ["The Cleaning Station", "Restore and defend a Reefmender colony.", ["meetHabitatNeed", "defendArea"], ["habitat restoration", "escort a Reefmender colony"], "The mutualist cleaning station remains active."],
    ["Lumen Losses", "Investigate missing Lanternshells across seed-dependent causes.", ["observeCreature", "resolveEncounter"], ["stop collectors", "repair water", "redirect migration"], "Lanternshell recovery changes local nocturnal light."],
    ["A Net of Ghosts", "Remove abandoned ruin nets while managing current and air.", ["repairStructure", "releaseCreature", "surveyLocation"], ["careful dismantling", "Currentweaver-assisted clearance"], "Freed species repopulate the wreck."],
    ["The Currentweaver", "Navigate an eel-made current maze and settle passage rights.", ["travelRoad", "resolveEncounter", "choiceOutcome"], ["capture the leader", "behavioral negotiation", "alternate channel"], "The chosen current channel remains navigable."],
    ["Wrecksong", "Resolve Sela's wreck and the fate of its dangerous relic.", ["surveyLocation", "defendArea", "choiceOutcome"], ["display", "seal", "share with Moonbough"], "Sela's behavior and wreck state change permanently."],
    ["The Reef That Swims", "Remove parasites and salvage rigs from Thalassene before a fair finale.", ["meetHabitatNeed", "defendArea", "resolveEncounter"], ["document and release", "prepared capture", "migration covenant"], "Thalassene's reef route or holding habitat remains visible."],
    ["The Open Current", "Charter preservation, shared harvest, or guarded research.", ["choiceOutcome"], ["preservation", "shared harvest", "guarded research"], "Marine licenses, trade, and patrol schedules follow the charter."],
  ],
  moonbough: [
    ["Proof of Three Laws", "Demonstrate damage, utility, and restraint across three spell schools.", ["resolveEncounter", "choiceOutcome"], ["protective casting", "controlled offense"], "The teaching court records nonviolent mastery."],
    ["Branches of Recommendation", "Assist three hall scholars in any order.", ["resolveEncounter", "surveyLocation"], ["research service", "field service"], "Three scholars join the shared archive."],
    ["The Summon That Stayed", "Contain a stranded manifestation and learn dismissal ethics.", ["groundSummon", "choiceOutcome"], ["restore its contract", "humane dismissal", "serious lethal failure"], "Summon concordance readouts unlock."],
    ["A Page That Guards Itself", "Resolve a Palimpsest room where repeated actions rewrite space.", ["surveyLocation", "resolveEncounter"], ["vary actions", "decode margin rules"], "The Vellum Warden contract enters the archive."],
    ["Between the Bells", "Cross a controlled Hush phenomenon and settle Orren's accident.", ["resolveEncounter", "choiceOutcome"], ["quiet negotiation", "counter-resonance contest"], "The Choir contract and Orren's recovery state persist."],
    ["The Sea in the Glass", "Investigate tidal reflections and learn Glasswake rescue riding.", ["surveyLocation", "escortActor", "groundSummon"], ["still-water ritual", "rescue through a reflected path"], "Mirror research and the Glasswake contract unlock."],
    ["Confluence Crisis", "Coordinate creatures, wards, residents, and environmental actions in real time.", ["defendArea", "meetHabitatNeed", "resolveEncounter"], ["ward-led evacuation", "creature-led containment"], "The settlement bears the repaired or scarred confluence state."],
    ["The First Bough's Margin", "Choose open teaching, careful stewardship, or guarded mastery.", ["choiceOutcome"], ["open teaching", "careful stewardship", "guarded mastery"], "Ritual travel and teaching services follow the doctrine."],
  ],
  brassroot: [
    ["A Measured Blow", "Learn guard, interrupt, dodge, friendly-fire, and surrender in a sparring circuit.", ["resolveEncounter"], ["weapon drill", "support and defense drill"], "The sparring yard retains readable windup markers."],
    ["Three Honest Contracts", "Complete three distinct jobs from escort, defense, hunt, rescue, or relocation.", ["escortActor", "defendArea", "resolveEncounter"], ["combat service", "rescue and relocation service"], "The ledger records three different contract families."],
    ["The Company in Green", "Expose or publicly defeat a rival that abandons clients.", ["surveyLocation", "negotiate", "resolveEncounter"], ["gather proof", "public contest"], "The rival's later behavior reflects humiliation or exposure."],
    ["Wheels Under Fire", "Defend a moving road caravan with separate cargo and life scores.", ["travelRoad", "escortActor", "defendArea"], ["mounted interception", "fortified convoy defense"], "Caravan frequency changes on the defended road."],
    ["Ink Before Blood", "Resolve a lawful but unethical contract.", ["negotiate", "choiceOutcome"], ["refuse", "rewrite", "expose", "fulfill with consequence"], "The Red Ledger preserves the reasoning and result."],
    ["Holdfast at Splitstone", "Defend a multi-entry POI with residents, creatures, and placed defenses.", ["repairStructure", "defendArea"], ["chokepoint construction", "mobile creature defense"], "Splitstone remains fortified or visibly damaged."],
    ["The Red Banner Warg", "Break Kharza's coercion harness before capture, accord, or duel.", ["observeCreature", "resolveEncounter", "choiceOutcome"], ["harness break and capture", "territorial accord", "lethal duel"], "Kharza's chosen outcome changes war-warg activity."],
    ["The Last Clause", "Rewrite the guild around mercy, public duty, or strict neutrality.", ["choiceOutcome"], ["mercy", "public duty", "strict neutrality"], "Contract eligibility and faction clients follow the charter."],
  ],
  deepgear: [
    ["Chalk and Breath", "Read cave hazards, brace a route, and distinguish iron from misleading stone.", ["mineSafely", "repairStructure", "surveyLocation"], ["manual survey", "Copper Mole assisted survey"], "Teaching braces and iron samples remain in the hall."],
    ["The Shift Below", "Rescue miners from a changing cave without causing secondary failures.", ["mineSafely", "escortActor", "repairStructure"], ["slow bracing route", "engineered bypass"], "Rescued miners return to schedule."],
    ["Color in the Vein", "Survey iron, gold, gemstone, and unresolved Veinmetal.", ["surveyLocation", "mineSafely"], ["sample and leave intact", "careful extraction"], "The archive records behavior without fixing Veinmetal's nature."],
    ["A Fair Measure", "Resolve unsafe quotas through evidence, negotiation, exposure, or service.", ["negotiate", "mineSafely", "choiceOutcome"], ["labor evidence", "expose sabotage", "take the shift"], "Mine schedules and safety signs change."],
    ["The Road Under Stone", "Repair a mine road and transport a delicate machine through a great cavern.", ["repairStructure", "travelRoad", "escortActor"], ["brace and haul", "golem-assisted transport"], "The underground road remains usable."],
    ["The Listening Seam", "Record rhythmic Veinmetal changes without declaring an origin.", ["observeCreature", "surveyLocation"], ["acoustic survey", "mechanical measurement"], "The unresolved-material archive gains append-only observations."],
    ["Oath Under Orichalc", "Support the cavern and break resonance before covenant or capture.", ["repairStructure", "resolveEncounter", "choiceOutcome"], ["resonance break and capture", "oath covenant", "stabilized retreat"], "Orichalc and the cavern retain the chosen state."],
    ["The Union Charter", "Choose safety stewardship, independent prospecting, or public works.", ["choiceOutcome"], ["safety stewardship", "independent prospecting", "public works"], "Dwarven services and mountain works follow the charter."],
  ],
  hearthroad: [
    ["The First Waystone", "Survey a settlement, landmark, and POI, then sign a safe junction.", ["surveyLocation", "travelRoad", "repairStructure"], ["walking survey", "mounted survey"], "The new signpost remains on the shared map."],
    ["Margins of the Map", "Correct three seed-derived map errors.", ["surveyLocation"], ["ground verification", "bird-scout verification"], "The map stores the corrected landmarks."],
    ["A Road Worth Taking", "Build or repair a bounded road and terrain-appropriate crossing.", ["repairStructure", "travelRoad"], ["bridge or causeway", "switchback or ferry"], "The road segment enters regional routing."],
    ["Company for the Mile", "Escort a traveler whose needs change expedition pacing.", ["escortActor", "travelRoad"], ["mount-assisted escort", "party and camp escort"], "The traveler joins later wayhouse schedules."],
    ["Below the Legend", "Lead a mixed dungeon expedition with ecology, history, and rescue objectives.", ["surveyLocation", "defendArea", "escortActor"], ["combat-led expedition", "research-and-rescue expedition"], "Optional findings expand the Bestiary and archive."],
    ["The Missing Expedition", "Follow camps and contradictory notes to recover survivors or explain loss.", ["surveyLocation", "resolveEncounter"], ["rescue survivors", "recover evidence and memorialize"], "Survivors or a named memorial persist."],
    ["Where Storms Run", "Rebuild highland wayposts and cross Varkesh's storm front.", ["repairStructure", "travelRoad", "resolveEncounter", "choiceOutcome"], ["capture and flight training", "travel pact", "protect aerie"], "Varkesh, a pact route, or Roclet lineage appears."],
    ["The Common Map", "Charter public roads, low-impact trails, or commerce arteries.", ["choiceOutcome"], ["public roads", "wild trails", "commerce arteries"], "Traffic and encounter weights respond without erasing wilderness."],
  ],
  "sugarcourt-makers": [
    ["A Matter of Temper", "Craft one useful item in workshop, field, and timed-repair constraints.", ["craftUnderConstraint"], ["tool-making route", "provisioning route"], "Constraint previews unlock at maker stations."],
    ["An Ingredient With Eyes", "Replace or ethically source a harmful recipe component.", ["observeCreature", "negotiate", "choiceOutcome"], ["substitute ingredient", "ethical renewable harvest"], "The recipe and local population reflect the choice."],
    ["Kitchen on Wheels", "Build and defend a mobile kitchen during a settlement event.", ["repairStructure", "defendArea", "craftUnderConstraint"], ["fortified kitchen", "mobile companion defense"], "Meals permanently alter the event schedule and morale."],
    ["The Counterfeit Crumb", "Trace unsafe imitation goods without blaming every merchant.", ["surveyLocation", "negotiate", "resolveEncounter"], ["evidence and recall", "workshop raid"], "Merchant inventories distinguish verified and counterfeit goods."],
    ["What the Batter Wanted", "Determine whether a living confection needs habitat, purpose, company, or release.", ["meetHabitatNeed", "choiceOutcome"], ["habitat", "purpose", "companion", "release"], "The confection's chosen life remains visible."],
    ["A Feast of Seven Roads", "Coordinate ingredients and guests from every faction.", ["travelRoad", "negotiate", "craftUnderConstraint"], ["trade network", "expedition gathering"], "Guest scenes and a seven-road feast display persist."],
    ["The Sovereign Wakes Hungry", "Meet a phase-changing legendary through hospitality, restraint, and craft quality.", ["craftUnderConstraint", "defendArea", "resolveEncounter", "choiceOutcome"], ["capture heart-form", "guardian covenant", "communal station"], "The Sovereign's chosen form changes the hall."],
    ["The Shared Table", "Charter public utility, guarded artistry, or bold experimentation.", ["choiceOutcome"], ["public utility", "guarded artistry", "bold experimentation"], "Recipes, risks, and hall appearance follow the charter."],
  ],
});

export const GUILD_QUESTS: readonly GuildQuestDefinition[] = Object.freeze((Object.keys(CAMPAIGN_ROWS) as GuildId[]).flatMap((guildId) => CAMPAIGN_ROWS[guildId].map((row, index) => quest(guildId, index + 1, ...row))));

const questAt = (guildId: GuildId, number: number) => GUILD_QUESTS.find((entry) => entry.guildId === guildId && entry.number === number)?.id ?? "";
/** Chapter rewards are separate from spell definitions so old completed quests can be recovered deterministically. */
export const GUILD_QUEST_REWARD_ITEMS: Readonly<Record<string, readonly ItemCode[]>> = Object.freeze({
  [questAt("waykeeper", 1)]: Object.freeze([Item.TomeKinmark]),
  [questAt("waykeeper", 5)]: Object.freeze([Item.TomeShepherdsThread]),
  [questAt("hearthroad", 7)]: Object.freeze([Item.TomeCallAsterjaw, Item.TomeStormstep]),
  [questAt("moonbough", 4)]: Object.freeze([Item.TomeFoldVellumWarden]),
  [questAt("moonbough", 5)]: Object.freeze([Item.TomeInvokeChoirOfOne]),
  [questAt("moonbough", 6)]: Object.freeze([Item.TomeOpenGlasswake]),
  [questAt("moonbough", 2)]: Object.freeze([Item.TomeRootbridge]),
  [questAt("deepgear", 1)]: Object.freeze([Item.TomeDeepLantern]),
  [questAt("deepgear", 3)]: Object.freeze([Item.TomeIronwake]),
  [questAt("tideglass", 2)]: Object.freeze([Item.TomeTidemend]),
  [questAt("hearthroad", 3)]: Object.freeze([Item.TomeHearthward]),
});
export function guildQuestRewardItems(questId: string): readonly ItemCode[] { return GUILD_QUEST_REWARD_ITEMS[questId] ?? Object.freeze([]); }

const npc = (guildId: GuildId, id: string, name: string, role: string, philosophy: string, recruitable: boolean, combatRole: string, utility: string, weakness: string, companion: string | null, personalQuest: string | null): GuildNpcDefinition => Object.freeze({
  id, guildId, name, role, philosophy, recruitable, combatRole, utility, weakness, companion, personalQuest,
  homeSchedule: Object.freeze(["dawn: hall preparation", "day: field or public service", "dusk: hall debrief", "night: home or watch"]),
  contextLines: Object.freeze([`At the hall, ${name} comments on unfinished guild work.`, `${name} notices the current road and weather.`, `${name} reacts to low health without overriding player control.`, `${name} acknowledges humane captures and named legendary outcomes.`, `${name} has specific remarks for settlements, major biomes, dungeons, and two fellow recruits.`]),
});

export const GUILD_NPCS: readonly GuildNpcDefinition[] = Object.freeze([
  npc("waykeeper", "odelia-fen", "Odelia Fen", "Guildmaster", "Ability never excuses poor husbandry.", false, "calm field command", "habitat assessment", "refuses reckless capture", null, null),
  npc("waykeeper", "garrick-coil", "Garrick Coil", "Capture engineer", "Instruments must be corrected by behavior.", false, "orb support", "capture-device calibration", "overtrusts measurements", null, null),
  npc("waykeeper", "pella-reedshoe", "Pella Reedshoe", "Field naturalist", "Tiny observations prevent large mistakes.", true, "threat marks and shelter", "behavioral field notes", "low direct damage", "Button the Burrowbell", "Button's Last Ring"),
  npc("tideglass", "neris-nine-lights", "Neris Nine-Lights", "Curator", "See a deep creature before naming it.", false, "lamp ward", "deep observation", "slow on land", null, null),
  npc("tideglass", "oru-kelpbraid", "Oru Kelpbraid", "Habitat handler", "Repair the relationship, not only the reef.", false, "reef defense", "habitat restoration", "impatient with bureaucracy", "Reefmender Shrimp", null),
  npc("tideglass", "sela-wakequiet", "Sela Wakequiet", "Diver", "A wreck is still dangerous after it stops sinking.", true, "ally currents", "submerged retrieval", "sealed-wreck anxiety", "Currentweaver Eel", "Wrecksong"),
  npc("moonbough", "saelith-veyr", "Saelith Veyr", "First Bough", "Concealed magical risk is unforgivable.", false, "structured wards", "spell analysis", "institutional caution", null, null),
  npc("moonbough", "fenna-glassleaf", "Fenna Glassleaf", "Conjuration scholar", "Every summon contract is negotiation.", false, "contract bindings", "concordance reading", "physically fragile", "Runeowl familiar", null),
  npc("moonbough", "orren-third-bell", "Orren Third-Bell", "Hush-scarred mage", "Silence is a condition, not obedience.", true, "interrupts and wards", "Hush navigation", "loud repeated casting", null, "The Measure After"),
  npc("brassroot", "korga-bent-spear", "Korga Bent-Spear", "Guildmaster", "Wording cannot absolve consequences.", false, "measured frontline", "contract ethics", "old injury", null, null),
  npc("brassroot", "nix-three-receipts", "Nix Three-Receipts", "Quartermaster", "Every cost belongs on the page.", false, "supply support", "appraisal and repair", "avoids field improvisation", null, null),
  npc("brassroot", "bram-coalgrin", "Bram Coalgrin", "Outrider", "Toll is the reasonable half.", true, "taunt and intercept", "mounted rescue pull", "overcommits", "Toll the Road Warg", "The Toll Not Taken"),
  npc("deepgear", "edda-rivetbraid", "Edda Rivetbraid", "Union keeper", "A collapse is a design failure until proven otherwise.", false, "brace command", "safety planning", "will not rush", null, null),
  npc("deepgear", "tovin-chalkmark", "Tovin Chalkmark", "Surveyor", "Veinmetal remains the unresolved material.", false, "resonance warning", "strata records", "analysis paralysis", null, null),
  npc("deepgear", "hessa-deepnote", "Hessa Deepnote", "Rescue engineer", "The retreat route is part of the route.", true, "temporary cover plate", "collapse sensing and bracing", "weak in open terrain", "Pipet the Copper Mole", "Pipet Hears Twice"),
  npc("hearthroad", "mara-bramblemap", "Mara Bramblemap", "League master", "A useful map remembers what went wrong.", false, "expedition command", "route planning", "distracted by stories", null, null),
  npc("hearthroad", "pip-underbridge", "Pip Underbridge", "Wayhouse keeper", "Slow watching sees fast trouble.", false, "perimeter warning", "camp recovery", "moves slowly", "Elder Burrowbell", null),
  npc("hearthroad", "rowan-mileglass", "Rowan Mileglass", "Cartographer", "Draw the road while it still surprises you.", true, "scent-trail support", "moving cartography", "misses obvious social cues", "Petalfox companion", "A Blank Mile"),
  npc("sugarcourt-makers", "dame-caramel-voss", "Dame Caramel Voss", "Steward", "Pretty food that cannot travel has failed.", false, "field provision", "temper appraisal", "unyielding standards", null, null),
  npc("sugarcourt-makers", "prill-snapcandy", "Prill Snapcandy", "Experimental maker", "Label the accident before admiring it.", false, "volatile utility", "recipe substitution", "accident-prone", null, null),
  npc("sugarcourt-makers", "taff-ribbons", "Taff Ribbons", "Courier-chef", "A meal arrives before the excuse.", true, "sticky restraint", "field meals and delivery", "low burst damage", "Knot the Taffy Hound", "Knot in the Recipe"),
]);

const guild = (id: GuildId, factionId: GuildDefinition["factionId"], name: string, purpose: string, ranks: readonly string[], primarySkills: readonly SkillId[], secondarySkills: readonly SkillId[], perks: readonly string[], standaloneHall: string, doctrines: readonly string[]): GuildDefinition => Object.freeze({
  id, factionId, name, purpose, ranks: rank(id, ranks), primarySkills, secondarySkills, perks, standaloneHall, doctrines,
  principalNpcIds: Object.freeze(GUILD_NPCS.filter((entry) => entry.guildId === id).map((entry) => entry.id)),
  questIds: Object.freeze(GUILD_QUESTS.filter((entry) => entry.guildId === id).map((entry) => entry.id)),
});

export const GUILDS: Readonly<Record<GuildId, GuildDefinition>> = Object.freeze({
  waykeeper: guild("waykeeper", "player", "Waykeeper Conservancy", "Field biology, humane capture, relocation, habitat repair, and surface legendary research.", ["Trail Listener", "Field Hand", "Habitat Warden", "Prime Tracker", "Conservator", "Living Roadkeeper"], ["husbandry", "survival"], ["exploration", "magic"], ["habitat preview", "rescue contracts", "capture discounts", "sanctuary transfer", "legendary trail clues"], "Waykeeper blind", ["protected corridors", "community stewardship", "active intervention"]),
  tideglass: guild("tideglass", "atlantians", "Tideglass Menagerie", "Aquatic capture, reef repair, diving, marine rescue, and deep-water research.", ["Shorehand", "Current Reader", "Reef Keeper", "Bluewater Handler", "Abyss Curator", "Keeper of the Open Current"], ["husbandry", "exploration"], ["survival", "magic"], ["breath preparation", "aquatic readouts", "capture stability", "reef nurseries", "research skiff"], "Tideglass research raft", ["preservation", "shared harvest", "guarded research"]),
  moonbough: guild("moonbough", "wood-elves", "Moonbough Arcanum", "Magical instruction, field research, summon ethics, spellcraft, and containment.", ["Petitioning Leaf", "Scribed Branch", "Lantern Adept", "Canopy Magister", "Root Archivist", "First Bough"], ["magic", "exploration"], ["husbandry", "crafting"], ["spell analysis", "safer interrupts", "utility wheel page", "concordance readouts", "costly hall ritual travel"], "Moonbough observatory", ["open teaching", "careful stewardship", "guarded mastery"]),
  brassroot: guild("brassroot", "goblins", "Brassroot Freeblades", "Martial contracts, escorts, defense, training, and ethical limits on paid force.", ["Chalk Name", "Paid Blade", "Shieldmate", "Contract Captain", "Brass Champion", "Keeper of the Red Ledger"], ["melee", "ranged"], ["survival", "bartering"], ["windup hints", "contract previews", "guard stamina", "hireling commands", "mounted drills", "equipment repair"], "Freeblade border lodge", ["mercy", "public duty", "strict neutrality"]),
  deepgear: guild("deepgear", "dwarves", "Deepgear Delvers' Union", "Safe delving, geology, rescue, underground construction, and labor responsibility.", ["Chalkhand", "Brace Setter", "Vein Reader", "Shift Warden", "Deepmaster", "Keeper Beneath the Mountain"], ["mining", "crafting"], ["survival", "exploration"], ["strata notes", "brace warnings", "sample appraisal", "specialist mining", "golem parts", "rescue caches"], "Deepgear survey camp", ["safety stewardship", "independent prospecting", "public works"]),
  hearthroad: guild("hearthroad", "hobbits", "Hearthroad League", "Exploration, maps, roads, mixed expeditions, rescue, and practical traveler knowledge.", ["Signpost", "Trail Companion", "Routekeeper", "Expedition Lead", "Far Cartographer", "Master of the Common Map"], ["exploration", "survival"], ["bartering", "husbandry"], ["annotated maps", "road warnings", "wayhouse discounts", "expedition contracts", "party regroup", "route clues"], "Hearthroad wayhouse", ["public roads", "wild trails", "commerce arteries"]),
  "sugarcourt-makers": guild("sugarcourt-makers", "sugarcourt", "Sugarcourt Makers' Confraternity", "Useful craft, food, confection creatures, field logistics, and product responsibility.", ["Wrapper", "Temperer", "Recipe Keeper", "Traveling Maker", "Master Confectioner", "Steward of the Shared Table"], ["crafting", "bartering"], ["husbandry", "survival"], ["recipe notes", "confirmed batch craft", "specialist repair", "substitution previews", "field kitchen", "ethical care recipes"], "Sugarcourt field kitchen", ["public utility", "guarded artistry", "bold experimentation"]),
});

export type PlayerGuildState = Readonly<{
  guildId: GuildId; membership: GuildMembership; standing: number; rankId: string | null;
  completedQuestIds: readonly string[]; activeQuestIds: readonly string[]; objectiveProgress: Readonly<Record<string, number>>;
  completedDemonstrationIds: readonly string[]; doctrineChoiceId: string | null; hallDiscoveryIds: readonly string[];
  serviceFlags: readonly string[]; restitutionState: Readonly<{ reason: string; progress: number }> | null;
}>;
export type GuildBookState = Readonly<{ schema: 1; guilds: Readonly<Record<GuildId, PlayerGuildState>>; worldQuestOutcomes: Readonly<Record<string, string>>; revision: number }>;

const blankGuild = (guildId: GuildId): PlayerGuildState => Object.freeze({ guildId, membership: "unknown", standing: 0, rankId: null, completedQuestIds: Object.freeze([]), activeQuestIds: Object.freeze([]), objectiveProgress: Object.freeze({}), completedDemonstrationIds: Object.freeze([]), doctrineChoiceId: null, hallDiscoveryIds: Object.freeze([]), serviceFlags: Object.freeze([]), restitutionState: null });
export function createGuildBook(): GuildBookState { return Object.freeze({ schema: 1, guilds: Object.freeze(Object.fromEntries((Object.keys(GUILDS) as GuildId[]).map((id) => [id, blankGuild(id)])) as Record<GuildId, PlayerGuildState>), worldQuestOutcomes: Object.freeze({}), revision: 0 }); }
export function normalizeGuildBook(value: unknown): GuildBookState {
  const raw = value && typeof value === "object" ? value as Partial<GuildBookState> : {};
  const guilds = {} as Record<GuildId, PlayerGuildState>;
  for (const id of Object.keys(GUILDS) as GuildId[]) {
    const input = raw.guilds?.[id] ?? blankGuild(id); const validQuests = new Set(GUILDS[id].questIds);
    guilds[id] = Object.freeze({ ...blankGuild(id), membership: ["unknown", "invited", "member", "suspended", "honored"].includes(input.membership) ? input.membership : "unknown", standing: Math.max(-100, Math.min(100, Number(input.standing) || 0)), rankId: GUILDS[id].ranks.some((rank) => rank.id === input.rankId) ? input.rankId : null, completedQuestIds: Object.freeze([...(input.completedQuestIds ?? [])].filter((quest) => validQuests.has(quest)).slice(-64)), activeQuestIds: Object.freeze([...(input.activeQuestIds ?? [])].filter((quest) => validQuests.has(quest)).slice(-8)), objectiveProgress: Object.freeze({ ...(input.objectiveProgress ?? {}) }), completedDemonstrationIds: Object.freeze([...(input.completedDemonstrationIds ?? [])].filter((entry): entry is string => typeof entry === "string").slice(-128)), doctrineChoiceId: typeof input.doctrineChoiceId === "string" ? input.doctrineChoiceId : null, hallDiscoveryIds: Object.freeze([...(input.hallDiscoveryIds ?? [])].filter((entry): entry is string => typeof entry === "string").slice(-64)), serviceFlags: Object.freeze([...(input.serviceFlags ?? [])].filter((entry): entry is string => typeof entry === "string").slice(-128)), restitutionState: input.restitutionState ? Object.freeze({ reason: String(input.restitutionState.reason).slice(0, 128), progress: Math.max(0, Math.min(1, Number(input.restitutionState.progress) || 0)) }) : null });
  }
  return Object.freeze({ schema: 1, guilds: Object.freeze(guilds), worldQuestOutcomes: Object.freeze({ ...(raw.worldQuestOutcomes ?? {}) }), revision: Math.max(0, Math.floor(Number(raw.revision) || 0)) });
}

export type GuildSemanticEvent = Readonly<{ kind: GuildObjectiveKind; amount?: number; demonstrationId?: string; outcomeId?: string }>;
export function applyGuildSemanticEvent(book: GuildBookState, event: GuildSemanticEvent) {
  let changed = false; const guilds = { ...book.guilds };
  for (const id of Object.keys(GUILDS) as GuildId[]) {
    const state = guilds[id]; if (!state.activeQuestIds.length) continue;
    let guildChanged = false;
    const progress = { ...state.objectiveProgress }; const demonstrations = new Set(state.completedDemonstrationIds);
    for (const questId of state.activeQuestIds) for (const entry of GUILD_QUESTS.find((quest) => quest.id === questId)?.objectives ?? []) if (entry.kind === event.kind) {
      progress[`${questId}:${entry.id}`] = Math.min(entry.target, (progress[`${questId}:${entry.id}`] ?? 0) + Math.max(0, event.amount ?? 1)); guildChanged = true;
    }
    if (event.demonstrationId && !demonstrations.has(event.demonstrationId)) { demonstrations.add(event.demonstrationId); guildChanged = true; }
    if (guildChanged) changed = true;
    guilds[id] = guildChanged ? Object.freeze({ ...state, objectiveProgress: Object.freeze(progress), completedDemonstrationIds: Object.freeze([...demonstrations]) }) : state;
  }
  return changed ? Object.freeze({ ...book, guilds: Object.freeze(guilds), revision: book.revision + 1 }) : book;
}

export function questProgress(book: GuildBookState, questId: string) {
  const quest = GUILD_QUESTS.find((entry) => entry.id === questId); if (!quest) return null;
  const state = book.guilds[quest.guildId]; const objectives = quest.objectives.map((entry) => ({ ...entry, current: Math.min(entry.target, state.objectiveProgress[`${questId}:${entry.id}`] ?? 0) }));
  const complete = objectives.every((entry) => entry.current >= entry.target);
  return Object.freeze({ quest, objectives: Object.freeze(objectives), complete, explanation: complete ? "All authored demonstrations are complete; return for the named resolution." : objectives.filter((entry) => entry.current < entry.target).map((entry) => `${entry.explanation} (${entry.current}/${entry.target})`).join("; ") });
}

export function promotionEligibility(book: GuildBookState, guildId: GuildId) {
  const state = book.guilds[guildId]; const definition = GUILDS[guildId]; const currentIndex = Math.max(-1, definition.ranks.findIndex((rank) => rank.id === state.rankId)); const next = definition.ranks[currentIndex + 1] ?? null;
  if (!next) return Object.freeze({ eligible: false, next: null, missing: Object.freeze(["Maximum rank reached."]) });
  const missing: string[] = []; if (state.standing < next.standing) missing.push(`${next.standing - state.standing} standing`); if (state.completedDemonstrationIds.length < next.demonstrationCount) missing.push(`${next.demonstrationCount - state.completedDemonstrationIds.length} relevant demonstration(s)`); if (state.completedQuestIds.length < next.questNumber) missing.push(`campaign quest ${next.questNumber}`);
  return Object.freeze({ eligible: missing.length === 0, next, missing: Object.freeze(missing) });
}

export function joinGuild(book: GuildBookState, guildId: GuildId) {
  const state = book.guilds[guildId];
  if (state.membership === "member" || state.membership === "honored") return book;
  const next = Object.freeze({ ...state, membership: "member" as const, rankId: GUILDS[guildId].ranks[0].id, standing: Math.max(0, state.standing) });
  return Object.freeze({ ...book, guilds: Object.freeze({ ...book.guilds, [guildId]: next }), revision: book.revision + 1 });
}

export function startGuildQuest(book: GuildBookState, questId: string) {
  const quest = GUILD_QUESTS.find((entry) => entry.id === questId); if (!quest) return book;
  const state = book.guilds[quest.guildId];
  if (!["member", "honored"].includes(state.membership) || state.completedQuestIds.includes(questId) || state.activeQuestIds.includes(questId)) return book;
  const priorRequired = quest.number <= 1 || state.completedQuestIds.includes(GUILD_QUESTS.find((entry) => entry.guildId === quest.guildId && entry.number === quest.number - 1)?.id ?? "");
  if (!priorRequired) return book;
  const next = Object.freeze({ ...state, activeQuestIds: Object.freeze([...state.activeQuestIds, questId].slice(-8)) });
  return Object.freeze({ ...book, guilds: Object.freeze({ ...book.guilds, [quest.guildId]: next }), revision: book.revision + 1 });
}

export function completeGuildQuest(book: GuildBookState, questId: string, outcomeId: string) {
  const progress = questProgress(book, questId); if (!progress?.complete) return book;
  const quest = progress.quest; const state = book.guilds[quest.guildId];
  const allowedOutcomes = quest.number === 8 ? [...quest.solutionFamilies, ...GUILDS[quest.guildId].doctrines] : [...quest.solutionFamilies];
  if (!allowedOutcomes.includes(outcomeId)) return book;
  const repeatedFamily = state.completedQuestIds.filter((id) => id.split("-").slice(0, 2).join("-") === questId.split("-").slice(0, 2).join("-")).length;
  const standingGain = Math.max(2, Math.round((quest.number === 8 ? 22 : 10) / (1 + repeatedFamily * .5)));
  const next = Object.freeze({
    ...state,
    membership: quest.number === 8 ? "honored" as const : state.membership,
    standing: Math.min(100, state.standing + standingGain),
    completedQuestIds: Object.freeze([...new Set([...state.completedQuestIds, questId])]),
    activeQuestIds: Object.freeze(state.activeQuestIds.filter((id) => id !== questId)),
    doctrineChoiceId: quest.number === 8 ? outcomeId : state.doctrineChoiceId,
    serviceFlags: Object.freeze([...new Set([...state.serviceFlags, `quest:${questId}`, `outcome:${questId}:${outcomeId}`])]),
  });
  return Object.freeze({ ...book, guilds: Object.freeze({ ...book.guilds, [quest.guildId]: next }), worldQuestOutcomes: Object.freeze({ ...book.worldQuestOutcomes, [questId]: outcomeId }), revision: book.revision + 1 });
}

export function promoteGuild(book: GuildBookState, guildId: GuildId) {
  const eligibility = promotionEligibility(book, guildId); if (!eligibility.eligible || !eligibility.next) return book;
  const state = book.guilds[guildId]; const next = Object.freeze({ ...state, rankId: eligibility.next.id });
  return Object.freeze({ ...book, guilds: Object.freeze({ ...book.guilds, [guildId]: next }), revision: book.revision + 1 });
}

export function guildHallStateForBook(book: GuildBookState, guildId: GuildId): GuildHallState {
  const rankId = book.guilds[guildId].rankId;
  const index = rankId ? GUILDS[guildId].ranks.findIndex((rank) => rank.id === rankId) : -1;
  return index >= 5 ? "charter" : index >= 2 ? "established" : "lodge";
}

export function recordGuildServiceFlag(book: GuildBookState, guildId: GuildId, flag: string) {
  const state = book.guilds[guildId];
  if (!flag || state.serviceFlags.includes(flag)) return book;
  const next = Object.freeze({ ...state, serviceFlags: Object.freeze([...state.serviceFlags, flag].slice(-128)) });
  return Object.freeze({ ...book, guilds: Object.freeze({ ...book.guilds, [guildId]: next }), revision: book.revision + 1 });
}

export function guildNpcScheduleAt(npc: GuildNpcDefinition, worldHour: number) {
  const hour = ((Math.floor(worldHour) % 24) + 24) % 24;
  const slot = hour < 6 ? 3 : hour < 9 ? 0 : hour < 18 ? 1 : hour < 22 ? 2 : 3;
  return npc.homeSchedule[slot];
}

export function compatibleGuildIdsForSettlement(factionId: FactionId, environment: "surface" | "underwater" | "underground") {
  const compatible = (Object.keys(GUILDS) as GuildId[]).filter((guildId) => GUILDS[guildId].factionId === factionId);
  // The player-aligned Conservancy keeps small blinds in hospitable surface
  // cultures without displacing the culture's own guild quota.
  if (environment === "surface" && (factionId === "hobbits" || factionId === "wood-elves")) compatible.push("waykeeper");
  return Object.freeze([...new Set(compatible)]);
}

export type GuildHallCandidate = Readonly<{ settlementId: string; factionId: FactionId; size: "hamlet" | "village" | "town" | "capital"; regionId: string; civicParcelId: string; compatibleGuildIds?: readonly GuildId[] }>;
export type GuildHallPlacement = Readonly<{ id: string; guildId: GuildId; settlementId: string; parcelId: string; state: GuildHallState; variantId: string; generatorVersion: 1 }>;
const hash = (value: string) => { let result = 2166136261; for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619); return result >>> 0; };
export function planGuildHalls(seed: string, candidates: readonly GuildHallCandidate[]): readonly GuildHallPlacement[] {
  const placements: GuildHallPlacement[] = []; const occupied = new Set<string>();
  const compatible = (guildId: GuildId, candidate: GuildHallCandidate) => (candidate.compatibleGuildIds?.includes(guildId) ?? GUILDS[guildId].factionId === candidate.factionId);
  const regions = [...new Set(candidates.map((candidate) => candidate.regionId))].sort();
  for (const regionId of regions) for (const guildId of Object.keys(GUILDS) as GuildId[]) {
    const pool = candidates.filter((candidate) => candidate.regionId === regionId && compatible(guildId, candidate) && !occupied.has(candidate.settlementId));
    if (!pool.length) continue;
    pool.sort((left, right) => hash(`${seed}|${guildId}|${left.settlementId}`) - hash(`${seed}|${guildId}|${right.settlementId}`));
    const candidate = pool.find((entry) => { const chance = entry.size === "hamlet" ? .08 : entry.size === "village" ? .3 : .6; return entry.size === "capital" || hash(`${seed}|chance|${guildId}|${entry.settlementId}`) / 0xffffffff < chance; }) ?? pool[0];
    occupied.add(candidate.settlementId);
    placements.push(Object.freeze({ id: `guild-hall:${regionId}:${guildId}`, guildId, settlementId: candidate.settlementId, parcelId: candidate.civicParcelId, state: "lodge", variantId: `${guildId}-${candidate.size}`, generatorVersion: 1 }));
  }
  return Object.freeze(placements);
}
