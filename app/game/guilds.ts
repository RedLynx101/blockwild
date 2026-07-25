import type { FactionId } from "./factions";
import type { SkillId } from "./skills";
import { Item, type ItemCode } from "./data";

export type GuildId = "waykeeper" | "tideglass" | "moonbough" | "brassroot" | "deepgear" | "hearthroad" | "sugarcourt-makers" | "cardwright" | "waytable";
export type GuildMembership = "unknown" | "invited" | "member" | "suspended" | "honored";
export type GuildHallState = "lodge" | "established" | "charter";
export type GuildDoctrine = "stewardship" | "intervention" | "public-service" | "guarded-mastery" | "independence" | "shared-harvest" | "bold-experiment";
export type GuildObjectiveKind = "observeCreature" | "captureCreature" | "releaseCreature" | "trainMove" | "meetHabitatNeed" | "escortActor" | "defendArea" | "repairStructure" | "surveyLocation" | "mineSafely" | "groundSummon" | "travelRoad" | "resolveEncounter" | "choiceOutcome" | "craftUnderConstraint" | "negotiate";

export type GuildRankDefinition = Readonly<{ id: string; name: string; standing: number; demonstrationCount: number; questNumber: number }>;
export type GuildObjectiveContextKey = "creatureKind" | "locationId" | "itemId" | "encounterId" | "actorId";
export type GuildObjectivePredicate = Readonly<{
  /** A semantic event must opt into one authored target instead of broadcasting by verb. */
  targetIds: readonly string[];
  creatureKinds: readonly string[];
  locationIds: readonly string[];
  itemIds: readonly string[];
  encounterIds: readonly string[];
  actorIds: readonly string[];
  requiredContext: readonly GuildObjectiveContextKey[];
}>;
export type GuildQuestObjective = Readonly<{
  id: string;
  kind: GuildObjectiveKind;
  target: number;
  explanation: string;
  blockedText: string;
  failureText: string;
  recoveryText: string;
  predicate: GuildObjectivePredicate;
}>;
export type GuildQuestDefinition = Readonly<{
  id: string; guildId: GuildId; number: number; name: string; summary: string;
  giverId: string; recoveryGiverId: string; locationIds: readonly string[]; creatureKinds: readonly string[];
  itemIds: readonly string[]; encounterIds: readonly string[]; actorIds: readonly string[];
  objectives: readonly GuildQuestObjective[]; solutionFamilies: readonly string[]; failure: string; recovery: string; persistentChange: string;
}>;
export type GuildNpcDefinition = Readonly<{
  id: string; guildId: GuildId; name: string; role: string; philosophy: string; recruitable: boolean;
  homeSchedule: readonly string[]; combatRole: string; utility: string; weakness: string; companion: string | null;
  personalQuest: string | null; personalConcern: string; recruitCondition: string | null; recoveryProtocol: string;
  contextLines: readonly string[];
}>;
export type GuildDefinition = Readonly<{
  id: GuildId; factionId: FactionId | "player"; name: string; purpose: string; ranks: readonly GuildRankDefinition[];
  primarySkills: readonly SkillId[]; secondarySkills: readonly SkillId[]; perks: readonly string[];
  principalNpcIds: readonly string[]; questIds: readonly string[]; standaloneHall: string; doctrines: readonly string[];
}>;

const rank = (guild: GuildId, names: readonly string[]): readonly GuildRankDefinition[] => Object.freeze(names.map((name, index) => Object.freeze({
  id: `${guild}-rank-${index + 1}`, name, standing: [0, 10, 25, 45, 70, 90][index], demonstrationCount: [0, 1, 2, 3, 4, 5][index], questNumber: [1, 2, 3, 5, 7, 8][index],
})));
type GuildQuestRuntimeSeed = Readonly<{
  giverId: string; recoveryGiverId: string; locationId: string; creatureKind: string; itemId: string; encounterId: string;
  failure: string; recovery: string;
}>;
const semanticTargetId = (questId: string, kind: GuildObjectiveKind, index: number) => `${questId}:${index + 1}:${kind}`;
const objectiveContextKeys = (kind: GuildObjectiveKind): readonly GuildObjectiveContextKey[] => {
  if (["observeCreature", "captureCreature", "releaseCreature", "trainMove", "meetHabitatNeed"].includes(kind)) return Object.freeze(["creatureKind", "locationId"]);
  if (kind === "escortActor") return Object.freeze(["actorId", "locationId"]);
  if (["defendArea", "repairStructure", "surveyLocation", "mineSafely", "travelRoad"].includes(kind)) return Object.freeze(["locationId"]);
  if (["groundSummon", "resolveEncounter", "choiceOutcome"].includes(kind)) return Object.freeze(["encounterId"]);
  if (kind === "craftUnderConstraint") return Object.freeze(["itemId", "locationId"]);
  return Object.freeze(["actorId", "locationId"]);
};
const objectiveVerb = (kind: GuildObjectiveKind, runtime: GuildQuestRuntimeSeed) => {
  if (kind === "observeCreature") return `Observe ${runtime.creatureKind} at ${runtime.locationId}.`;
  if (kind === "captureCreature") return `Secure ${runtime.creatureKind} at ${runtime.locationId} under the chapter's welfare conditions.`;
  if (kind === "releaseCreature") return `Release ${runtime.creatureKind} into the matching habitat at ${runtime.locationId}.`;
  if (kind === "trainMove") return `Train ${runtime.creatureKind} during the authored exercise at ${runtime.locationId}.`;
  if (kind === "meetHabitatNeed") return `Meet the habitat needs of ${runtime.creatureKind} at ${runtime.locationId}.`;
  if (kind === "escortActor") return `Escort ${runtime.giverId} through ${runtime.locationId}.`;
  if (kind === "defendArea") return `Defend ${runtime.locationId} during ${runtime.encounterId}.`;
  if (kind === "repairStructure") return `Repair the authored structure at ${runtime.locationId} with ${runtime.itemId}.`;
  if (kind === "surveyLocation") return `Verify the field evidence at ${runtime.locationId}.`;
  if (kind === "mineSafely") return `Perform the safe-delving proof at ${runtime.locationId}.`;
  if (kind === "groundSummon") return `Resolve the grounded manifestation in ${runtime.encounterId}.`;
  if (kind === "travelRoad") return `Travel the chapter route through ${runtime.locationId}.`;
  if (kind === "resolveEncounter") return `Resolve ${runtime.encounterId} by an authored solution family.`;
  if (kind === "choiceOutcome") return `Record a stable consequence for ${runtime.encounterId}.`;
  if (kind === "craftUnderConstraint") return `Use ${runtime.itemId} under the field constraint at ${runtime.locationId}.`;
  return `Reach an agreement with ${runtime.giverId} at ${runtime.locationId}.`;
};
const objectiveTargetOverrides: Readonly<Record<string, number>> = Object.freeze({
  "waykeeper:1:observeCreature": 3,
  "moonbough:2:resolveEncounter": 3,
  "brassroot:2:resolveEncounter": 3,
  "deepgear:3:surveyLocation": 4,
  "hearthroad:2:surveyLocation": 3,
  "sugarcourt-makers:1:craftUnderConstraint": 3,
  "sugarcourt-makers:6:negotiate": 7,
  "cardwright:5:surveyLocation": 3,
  "waytable:3:resolveEncounter": 3,
  "waytable:5:craftUnderConstraint": 5,
});
const objective = (questId: string, guildId: GuildId, questNumber: number, index: number, kind: GuildObjectiveKind, runtime: GuildQuestRuntimeSeed): GuildQuestObjective => {
  const explanation = objectiveVerb(kind, runtime);
  return Object.freeze({
    id: `${index + 1}-${kind}`,
    kind,
    target: objectiveTargetOverrides[`${guildId}:${questNumber}:${kind}`] ?? 1,
    explanation,
    blockedText: `No matching proof yet: ${explanation}`,
    failureText: runtime.failure,
    recoveryText: runtime.recovery,
    predicate: Object.freeze({
      targetIds: Object.freeze([semanticTargetId(questId, kind, index)]),
      creatureKinds: Object.freeze([runtime.creatureKind]),
      locationIds: Object.freeze([runtime.locationId]),
      itemIds: Object.freeze([runtime.itemId]),
      encounterIds: Object.freeze([runtime.encounterId]),
      actorIds: Object.freeze([runtime.giverId, runtime.recoveryGiverId]),
      requiredContext: objectiveContextKeys(kind),
    }),
  });
};
const quest = (guildId: GuildId, number: number, name: string, summary: string, kinds: readonly GuildObjectiveKind[], solutions: readonly string[], persistentChange: string): GuildQuestDefinition => Object.freeze({
  ...(() => {
    const id = `${guildId}-${number}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
    const runtime = GUILD_QUEST_RUNTIME[`${guildId}:${number}`];
    return {
      id, guildId, number, name, summary,
      giverId: runtime.giverId, recoveryGiverId: runtime.recoveryGiverId,
      locationIds: Object.freeze([runtime.locationId]), creatureKinds: Object.freeze([runtime.creatureKind]),
      itemIds: Object.freeze([runtime.itemId]), encounterIds: Object.freeze([runtime.encounterId]),
      actorIds: Object.freeze([runtime.giverId, runtime.recoveryGiverId]),
      objectives: Object.freeze(kinds.map((kind, index) => objective(id, guildId, number, index, kind, runtime))),
      solutionFamilies: Object.freeze([...solutions]), failure: runtime.failure, recovery: runtime.recovery, persistentChange,
    };
  })(),
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
  cardwright: [
    ["The Empty Sleeve", "Register a Cardforge case and preserve its first provenance record.", ["surveyLocation"], ["inspect the physical case", "verify its custody ledger"], "The Collegium recognizes the player's collection ledger."],
    ["Copies Have Histories", "Archive duplicate cards without erasing their physical provenance.", ["surveyLocation"], ["deposit one duplicate", "compare physical and archived copies"], "Archive sorting and duplicate views unlock."],
    ["Five Seals, One Proof", "Open a sealed booster and verify all five ordered reveals.", ["resolveEncounter"], ["open a found booster", "open a purchased booster"], "The reveal ledger becomes available at Cardwright counters."],
    ["The Honest Exchange", "Complete a custody-safe exchange whose terms survive host validation.", ["negotiate"], ["trade a physical copy", "trade an archived copy"], "Trade receipts and provenance inspection unlock."],
    ["A Page Becomes a Set", "Document collection milestones across three different set records.", ["surveyLocation"], ["complete set thresholds", "record three new set discoveries"], "Set checklists and completion summaries appear in the binder."],
    ["Frames and Finishes", "Authenticate a normal, foil, showcase, or full-art printing without changing its rules.", ["surveyLocation"], ["compare finish records", "verify a Wildlight full-art scene"], "Variant and finish filters unlock."],
    ["Counter of Record", "Buy or sell through a Cardwright counter with a revision-safe receipt.", ["negotiate"], ["purchase a sealed product", "sell an unlocked duplicate"], "Price-history hints and old-set stock unlock."],
    ["The Grand Binder", "Charter the Collegium around public catalogs, guarded provenance, or open exchange.", ["choiceOutcome"], ["public catalogs", "guarded provenance", "open exchange"], "The archive hall and Cardwright services follow the charter."],
  ],
  waytable: [
    ["Take a Seat", "Complete a teaching match and account for every turn through the host ledger.", ["resolveEncounter"], ["play the loaner lesson", "win with a validated starter deck"], "Town challengers and the tutorial reward claim unlock."],
    ["Thirty With a Reason", "Validate a legal thirty-card deck from owned copies.", ["craftUnderConstraint"], ["build around one type", "build around one faction"], "Additional deck slots and legality explanations unlock."],
    ["Three Town Styles", "Resolve matches against three distinct town challengers.", ["resolveEncounter"], ["adapt one deck", "bring three decks"], "Intermediate challengers join town Waytables."],
    ["Second Thought", "Use the mulligan deliberately and finish the match.", ["resolveEncounter"], ["keep a stable hand", "replace a risky hand"], "Opening-hand guidance unlocks."],
    ["Five Ways to Play", "Validate five decks or revisions that demonstrate different card identities.", ["craftUnderConstraint"], ["type-led archetypes", "faction-led archetypes"], "Deck tags and matchup notes unlock."],
    ["Across the Table", "Complete a peer match whose concealed information remains private.", ["defendArea"], ["friendly challenge", "ranked circuit exhibition"], "Peer challenge tables and spectator-safe summaries unlock."],
    ["Master's Circuit", "Defeat an expert challenger through legal play rather than rarity advantage.", ["resolveEncounter"], ["tempo contest", "resource contest"], "Master challengers and seasonal circuit rewards unlock."],
    ["The Last Turn", "Charter the Circuit around teaching, open competition, or guarded mastery.", ["choiceOutcome"], ["teaching tables", "open competition", "guarded mastery"], "Waytable schedules, rewards, and hall displays follow the charter."],
  ],
});

const runtime = (
  giverId: string,
  recoveryGiverId: string,
  locationId: string,
  creatureKind: string,
  itemId: string,
  encounterId: string,
  failure: string,
  recovery: string,
): GuildQuestRuntimeSeed => Object.freeze({ giverId, recoveryGiverId, locationId, creatureKind, itemId, encounterId, failure, recovery });

/**
 * Compact authored campaign staging. These IDs are deliberately gameplay-facing:
 * engines can route a proof from an exact encounter without parsing UI prose.
 */
const GUILD_QUEST_RUNTIME: Readonly<Record<string, GuildQuestRuntimeSeed>> = Object.freeze({
  "waykeeper:1": runtime("odelia-fen", "pella-reedshoe", "fen-teaching-meadow", "common-surface-creature", "care-field-kit", "unstirred-field-study", "Startling, injuring, or releasing the specimen outside its home biome invalidates that proof.", "Pella reopens the meadow at dawn and Garrick replaces one lost care field kit."),
  "waykeeper:2": runtime("pella-reedshoe", "garrick-coil", "waykeeper-west-sanctuary", "enclosure-resident", "habitat-repair-kit", "sanctuary-restoration", "A decorative pen without shelter, food, space, and social fit remains incomplete.", "Garrick returns reclaimed habitat parts; the west sanctuary can be inspected and repaired again."),
  "waykeeper:3": runtime("odelia-fen", "garrick-coil", "reedshoe-pasture", "suspected-predator", "fence-trace-sample", "livestock-loss-inquiry", "Destroying the evidence forces the guild to treat the cause as unresolved.", "Garrick reconstructs the ledger from witness notes and marks replacement evidence sites."),
  "waykeeper:4": runtime("garrick-coil", "odelia-fen", "poacher-wagon-route", "captive-menagerie-creature", "confiscated-calibrator", "stolen-menagerie-raid", "A wagon that escapes carries its captives away and closes that camp instance.", "Odelia's scouts locate the wagon again after one dawn; Garrick replaces the entry tool."),
  "waykeeper:5": runtime("pella-reedshoe", "odelia-fen", "juvenile-care-yard", "adopted-juvenile", "training-whistle", "juvenile-training-trial", "Unsafe confinement or abandoning the juvenile pauses training without erasing its bond.", "Odelia shelters the juvenile and Pella restarts the recall exercise when its welfare is restored."),
  "waykeeper:6": runtime("pella-reedshoe", "garrick-coil", "virebloom-migration-corridor", "ilyr-virebloom", "migration-field-notebook", "prime-signs-trail", "Following a false sign resets only the current clue chain, not earlier field notes.", "Pella annotates the last verified sign and Garrick reissues a weatherproof notebook."),
  "waykeeper:7": runtime("odelia-fen", "pella-reedshoe", "walking-spring-route", "ilyr-virebloom", "sanctuary-seal", "walking-spring-encounter", "A forced kill suspends conservation rewards and an escaped Ilyr ends the current attempt.", "Pella begins restitution for a lethal result; otherwise Ilyr returns to its echo route after the habitat cools."),
  "waykeeper:8": runtime("odelia-fen", "pella-reedshoe", "waykeeper-charter-hall", "ilyr-ecological-echo", "living-roads-charter", "living-roads-charter-council", "Leaving the council postpones the charter but does not choose a doctrine by default.", "Odelia reconvenes the named principals at the charter table at the next dusk."),

  "tideglass:1": runtime("neris-nine-lights", "sela-wakequiet", "tideglass-teaching-reef", "small-aquatic-creature", "reef-care-field-kit", "breathing-lesson-dive", "Running out of air or beaching the specimen ends the dive proof.", "Sela recovers the marker line and Neris offers another reef-care field kit at the teaching raft."),
  "tideglass:2": runtime("oru-kelpbraid", "neris-nine-lights", "reefmender-cleaning-station", "reefmender-shrimp", "coral-transplant", "cleaning-station-surge", "Losing every transplant disperses the colony from this station.", "Oru cultivates replacement coral and the shrimp return on the next calm tide."),
  "tideglass:3": runtime("neris-nine-lights", "oru-kelpbraid", "lumen-lanternshell-nursery", "lanternshell", "sealed-water-sample", "lumen-losses-inquiry", "Removing Lanternshells before identifying the seed-specific cause destroys the clean comparison.", "Oru restores a control pool and Neris marks a second evidence route for the same cause."),
  "tideglass:4": runtime("sela-wakequiet", "oru-kelpbraid", "ghostnet-wreck", "net-trapped-creature", "reef-cutter", "ghostnet-clearance", "Cutting load-bearing wreck lines can collapse the route or exhaust the player's air window.", "Sela resets the safety line and Oru replaces a lost cutter from recovered net metal."),
  "tideglass:5": runtime("oru-kelpbraid", "sela-wakequiet", "currentweaver-maze", "currentweaver-eel", "channel-marker", "currentweaver-passage-parley", "Attacking before reading the current closes negotiation for that tide.", "Sela charts an alternate entry and the eel leader returns after the next current change."),
  "tideglass:6": runtime("sela-wakequiet", "neris-nine-lights", "wakequiet-sealed-wreck", "currentweaver-eel", "wreck-relic", "wrecksong-memory", "Losing the relic or leaving Sela downed seals the memory chamber.", "Neris retrieves the relic to the raft and Sela names a dry fallback entrance after recovery."),
  "tideglass:7": runtime("neris-nine-lights", "oru-kelpbraid", "thalassene-migration-reef", "thalassene", "parasite-lance", "reef-that-swims", "Damaging Thalassene before removing the rigs makes capture unfair and breaks the current attempt.", "Oru regrows parasite tools; Thalassene returns on its migration circuit after a bounded cooldown."),
  "tideglass:8": runtime("neris-nine-lights", "sela-wakequiet", "tideglass-charter-raft", "thalassene-reef-echo", "open-current-charter", "open-current-council", "Abandoning the vote leaves licenses unchanged and records no implicit choice.", "Neris relights the nine council lamps and Sela recalls the principals at dusk."),

  "moonbough:1": runtime("saelith-veyr", "fenna-glassleaf", "three-laws-court", "runeowl-familiar", "three-laws-focus", "proof-of-three-laws", "Repeating raw damage cannot substitute for utility and a nonviolent restraint proof.", "Fenna resets the practice wards and replaces a cracked focus without changing completed schools."),
  "moonbough:2": runtime("saelith-veyr", "fenna-glassleaf", "three-branch-halls", "runeowl-familiar", "scholar-folio", "branches-of-recommendation", "Failing one scholar's field task closes only that branch for the day.", "Fenna records completed recommendations and offers another task from the missing scholar."),
  "moonbough:3": runtime("fenna-glassleaf", "saelith-veyr", "abandoned-summoning-ring", "stranded-manifestation", "contract-shard", "summon-that-stayed", "Killing the manifestation is a recorded institutional failure rather than silent success.", "Saelith begins a restitution hearing; a dispersed manifestation reforms once its contract shard is repaired."),
  "moonbough:4": runtime("fenna-glassleaf", "saelith-veyr", "palimpsest-chamber", "vellum-warden", "living-margin", "guarded-page-anomaly", "Repeating the same action rewrites the room and ejects the reader.", "Fenna preserves learned margin rules and Saelith reopens the chamber in its initial stanza."),
  "moonbough:5": runtime("orren-third-bell", "saelith-veyr", "hush-cloister", "choir-of-one", "resonance-bell", "between-the-bells", "Repeated loud casting overwhelms Orren and collapses the negotiated silence.", "Saelith wards Orren's recovery room; the Choir returns when a quieter counter-pattern is prepared."),
  "moonbough:6": runtime("orren-third-bell", "fenna-glassleaf", "glasswake-reflection-pool", "glasswake-stag", "mirror-shard", "sea-in-the-glass", "Breaking the still surface strands the rescue route for the current moon phase.", "Fenna restores the pool from a clean shard and Orren retains every completed rescue marker."),
  "moonbough:7": runtime("saelith-veyr", "orren-third-bell", "confluence-settlement", "runeowl-familiar", "ward-anchor", "confluence-crisis", "A failed ward can scar one district, but evacuation keeps the campaign recoverable.", "Orren establishes a quiet triage ward and Saelith restages unresolved anchors, preserving rescued residents."),
  "moonbough:8": runtime("saelith-veyr", "fenna-glassleaf", "first-bough-archive", "vellum-warden", "margin-charter", "first-bough-council", "Walking away records no doctrine and unlocks no ritual service.", "Fenna bookmarks the debate and Saelith reconvenes the archive council at nightfall."),

  "brassroot:1": runtime("korga-bent-spear", "bram-coalgrin", "brassroot-sparring-yard", "toll-road-warg", "chalk-baton", "measured-blow-circuit", "Ignoring surrender or striking a friendly invalidates the current circuit.", "Bram resets the chalk targets and Korga restarts only the failed drill."),
  "brassroot:2": runtime("korga-bent-spear", "nix-three-receipts", "five-contract-road", "road-warg", "honest-contract-ledger", "three-honest-contracts", "Repeating one job family cannot satisfy three distinct public services.", "Nix preserves distinct receipts and posts a replacement from an unfinished family."),
  "brassroot:3": runtime("nix-three-receipts", "korga-bent-spear", "green-company-camp", "abandoned-pack-warg", "abandoned-client-receipt", "company-in-green", "Destroying the receipts removes the evidence route and makes the rival more violent.", "Nix reconstructs one receipt from client copies; Korga schedules a public contest as the fallback."),
  "brassroot:4": runtime("bram-coalgrin", "nix-three-receipts", "splitstone-caravan-road", "toll-road-warg", "wheel-brace", "wheels-under-fire", "Losing every passenger ends the run even if cargo survives; cargo and lives score separately.", "Nix rebuilds the manifest and Bram forms a smaller replacement convoy after dawn."),
  "brassroot:5": runtime("korga-bent-spear", "nix-three-receipts", "red-ledger-court", "road-warg", "disputed-contract", "ink-before-blood", "Destroying the contract hides its legal harm and closes the rewrite option.", "Nix produces the signed duplicate; Korga records restitution if the harmful clause was fulfilled."),
  "brassroot:6": runtime("bram-coalgrin", "korga-bent-spear", "splitstone-holdfast", "toll-road-warg", "barricade-kit", "holdfast-siege", "If the command post falls, defenders retreat and Splitstone keeps visible damage.", "Korga recalls survivors and Bram reopens one damaged entrance for a staged counter-defense."),
  "brassroot:7": runtime("korga-bent-spear", "bram-coalgrin", "kharza-highland-trail", "kharza-red-banner-warg", "harness-cutter", "red-banner-warg", "Defeating Kharza before breaking the harness records a lethal outcome and closes capture.", "Bram tracks Kharza after a retreat; Nix replaces the cutter, while a lethal result opens named restitution."),
  "brassroot:8": runtime("korga-bent-spear", "nix-three-receipts", "red-ledger-hall", "toll-road-warg", "red-ledger-charter", "last-clause-council", "No unsigned draft can silently become the guild's doctrine.", "Nix keeps the last agreed clauses and Korga reconvenes the signatories at dusk."),

  "deepgear:1": runtime("edda-rivetbraid", "hessa-deepnote", "deepgear-teaching-adit", "pipet-copper-mole", "brace-kit", "chalk-and-breath", "Mining past an unread hazard or losing the retreat route invalidates safe-delving proof.", "Hessa replaces a brace kit and Edda reopens the adit from the last safe chalk mark."),
  "deepgear:2": runtime("hessa-deepnote", "edda-rivetbraid", "broken-shift-mine", "pipet-copper-mole", "support-brace", "shift-below-collapse", "Reckless mining creates a secondary collapse and moves survivors to an emergency pocket.", "Hessa marks the miners' new air pocket and Edda supplies replacement braces from the union cache."),
  "deepgear:3": runtime("tovin-chalkmark", "edda-rivetbraid", "four-vein-gallery", "orichalc-living-seam", "sealed-sample-case", "color-in-the-vein", "Declaring Veinmetal's nature or contaminating samples invalidates the comparative survey.", "Tovin relabels surviving samples as unresolved and Edda authorizes replacement collection sites."),
  "deepgear:4": runtime("edda-rivetbraid", "tovin-chalkmark", "quota-office-and-shaft", "pipet-copper-mole", "quota-ledger", "fair-measure-dispute", "Sabotage or an unsafe shift can injure workers and closes easy negotiation.", "Tovin preserves testimony and Edda offers a restitution shift with explicit safety limits."),
  "deepgear:5": runtime("hessa-deepnote", "edda-rivetbraid", "road-under-stone", "pipet-copper-mole", "delicate-machine-crate", "machine-haul", "Dropping the machine or collapsing the route returns it damaged to the start depot.", "Hessa repairs the crate overnight; every completed road brace remains in place."),
  "deepgear:6": runtime("tovin-chalkmark", "hessa-deepnote", "listening-seam", "orichalc-living-seam", "resonance-recorder", "listening-seam-study", "Forcing a conclusion or striking the seam corrupts the current observation interval.", "Tovin restores the neutral wording and Hessa recalibrates the recorder at the last quiet station."),
  "deepgear:7": runtime("edda-rivetbraid", "hessa-deepnote", "orichalc-vault", "orichalc-living-seam", "resonance-breaker", "oath-under-orichalc", "Raw combat destabilizes supports; a collapse ends the encounter before custody is decided.", "Hessa restores authored support groups and Orichalc returns after the resonance settles."),
  "deepgear:8": runtime("edda-rivetbraid", "tovin-chalkmark", "union-charter-hall", "orichalc-living-seam", "union-charter", "union-charter-council", "An interrupted vote changes no mine schedule or public work.", "Tovin preserves testimony and Edda recalls the shift delegates after the next bell."),

  "hearthroad:1": runtime("mara-bramblemap", "rowan-mileglass", "first-waystone-circuit", "rowan-petalfox", "signpost-kit", "first-waystone-survey", "A sign at an unsafe or unverified junction does not complete the route.", "Rowan preserves surveyed sites and Mara replaces the signpost kit at the wayhouse."),
  "hearthroad:2": runtime("rowan-mileglass", "mara-bramblemap", "seed-outdated-map-route", "rowan-petalfox", "outdated-field-map", "margins-map-correction", "Guessing an error without visiting its seed-derived site marks that correction unverified.", "Mara restores the original map layer and Rowan retains every field-verified correction."),
  "hearthroad:3": runtime("mara-bramblemap", "pip-underbridge", "floodplain-road-crossing", "elder-burrowbell", "roadwright-kit", "road-worth-taking", "A crossing inappropriate to the terrain washes out or blocks local travel.", "Pip salvages road materials and Mara reopens the bounded segment from its last stable anchor."),
  "hearthroad:4": runtime("pip-underbridge", "rowan-mileglass", "long-mile-escort-route", "rowan-petalfox", "traveler-camp-pack", "company-for-the-mile", "Outpacing the traveler or teleporting away breaks the escort without harming them.", "Pip shelters the traveler at the last wayhouse and Rowan marks a shorter restart leg."),
  "hearthroad:5": runtime("mara-bramblemap", "rowan-mileglass", "old-legend-dungeon", "rowan-petalfox", "expedition-folio", "below-the-legend", "A boss victory without accounting for stranded people cannot satisfy the expedition.", "Mara recalls surviving members; Rowan preserves completed ecology and history notes for the next descent."),
  "hearthroad:6": runtime("rowan-mileglass", "pip-underbridge", "missing-expedition-camp-trail", "rowan-petalfox", "signal-flare", "missing-expedition", "Destroying camps or contradictory notes closes some explanations of the expedition's fate.", "Pip recovers duplicate notes from wayhouses and Rowan starts from the last confirmed camp."),
  "hearthroad:7": runtime("mara-bramblemap", "rowan-mileglass", "stormmane-highlands", "varkesh-stormmane", "waypost-repair-kit", "where-storms-run", "Entering the finale before repairing wayposts leaves no safe retreat and forces Varkesh away.", "Rowan restores the last repaired waypost; Varkesh returns with the next authored storm front."),
  "hearthroad:8": runtime("mara-bramblemap", "pip-underbridge", "common-map-hall", "roclet-lineage", "common-map-charter", "common-map-council", "Closing the map records no route doctrine and preserves existing traffic weights.", "Pip keeps the hall open and Mara reconvenes route delegates over the next evening meal."),

  "sugarcourt-makers:1": runtime("dame-caramel-voss", "taff-ribbons", "three-temper-worksites", "knot-taffy-hound", "tempering-kit", "matter-of-temper", "Repeating the workshop recipe cannot replace field and timed-repair constraints.", "Taff returns the workpiece and Dame resets only the failed constraint station."),
  "sugarcourt-makers:2": runtime("prill-snapcandy", "dame-caramel-voss", "ingredient-marsh", "living-ingredient-creature", "substitution-ledger", "ingredient-with-eyes", "Taking the harmful component damages the local population and closes the clean-source proof.", "Dame opens a restitution recipe and Prill marks a renewable source or tested substitute."),
  "sugarcourt-makers:3": runtime("taff-ribbons", "dame-caramel-voss", "mobile-kitchen-route", "knot-taffy-hound", "field-kitchen-crate", "kitchen-on-wheels", "Losing the kitchen ends meal service and lowers event morale for that attempt.", "Taff recovers the axle and Dame issues a smaller pantry; fed residents remain helped."),
  "sugarcourt-makers:4": runtime("prill-snapcandy", "taff-ribbons", "counterfeit-workshop", "knot-taffy-hound", "marked-counterfeit-crumb", "counterfeit-crumb-inquiry", "Accusing merchants without evidence scatters the workshop and harms innocent trade.", "Taff finds another marked delivery while Prill preserves verified shop testimony."),
  "sugarcourt-makers:5": runtime("prill-snapcandy", "dame-caramel-voss", "living-batter-care-kitchen", "living-confection", "habitat-serving-tray", "what-batter-wanted", "Forcing a purpose or confinement records distress and pauses the choice.", "Dame shelters the confection without assigning it; Prill restarts observation once it is calm."),
  "sugarcourt-makers:6": runtime("taff-ribbons", "dame-caramel-voss", "seven-roads-feast", "knot-taffy-hound", "faction-feast-crates", "feast-of-seven-roads", "A missing faction changes optional scenes but never makes the feast impossible.", "Taff preserves delivered crates and Dame posts a substitute route for each missing guest."),
  "sugarcourt-makers:7": runtime("dame-caramel-voss", "taff-ribbons", "sovereign-feast-hall", "sugarwake-sovereign", "sovereign-tempering-ladle", "sovereign-wakes-hungry", "Poor craft or uncontrolled damage advances a hostile phase and can end the feast attempt.", "Taff rebuilds the communal table; the Sovereign wakes again after its kiln-heart cools."),
  "sugarcourt-makers:8": runtime("dame-caramel-voss", "prill-snapcandy", "shared-table-charter-hall", "sugarwake-sovereign", "shared-table-charter", "shared-table-council", "An unsigned recipe charter changes neither services nor contract risk.", "Prill preserves tested clauses and Dame reconvenes the makers after the ovens cool."),

  "cardwright:1": runtime("lysa-proofmark", "oren-sleeve", "cardwright-intake-counter", "petalfox", "cardforge-case", "empty-sleeve-audit", "A copied or missing provenance record cannot establish custody.", "Oren reissues an empty sleeve while Lysa preserves the last valid ledger revision."),
  "cardwright:2": runtime("oren-sleeve", "lysa-proofmark", "cardwright-archive-stack", "petalfox", "duplicate-card", "duplicate-archive-proof", "Depositing a locked or unowned copy is rejected without changing the collection.", "Lysa restores the last valid holding counts and Oren repeats the archive lesson."),
  "cardwright:3": runtime("tamsin-setmark", "lysa-proofmark", "cardwright-reveal-table", "runeowl", "sealed-booster", "five-seal-opening", "A replayed pack claim yields no new cards and cannot satisfy the proof twice.", "Tamsin compares the saved reveal order and Lysa supplies another earned seal if needed."),
  "cardwright:4": runtime("lysa-proofmark", "oren-sleeve", "cardwright-exchange-counter", "warg", "trade-receipt", "honest-exchange", "Stale terms or insufficient custody cancel the exchange atomically.", "Oren preserves the offer while Lysa helps both parties draft a new revision."),
  "cardwright:5": runtime("tamsin-setmark", "oren-sleeve", "cardwright-set-gallery", "lanternshell", "set-checklist", "page-becomes-set", "Unverified or duplicated discovery events do not advance the checklist.", "Tamsin keeps every valid set mark and points to a different missing page."),
  "cardwright:6": runtime("tamsin-setmark", "lysa-proofmark", "cardwright-finish-lab", "glasswing", "finish-loupe", "frames-and-finishes", "Finish authentication changes collectibility but never card rules.", "Lysa rolls back the disputed label and Tamsin stages a known comparison printing."),
  "cardwright:7": runtime("oren-sleeve", "lysa-proofmark", "cardwright-market-counter", "goldback-beetle", "merchant-receipt", "counter-of-record", "A stale stock or wallet revision rejects the entire transaction.", "Oren refreshes visible stock while Lysa retains the player's last committed balances."),
  "cardwright:8": runtime("lysa-proofmark", "tamsin-setmark", "grand-binder-hall", "runeowl", "grand-binder-charter", "grand-binder-council", "Leaving the table records no doctrine and changes no archive service.", "Tamsin preserves agreed clauses and Lysa reconvenes the Cardwright council."),

  "waytable:1": runtime("orra-last-turn", "mira-cardhand", "waytable-teaching-table", "petalfox", "loaner-deck", "take-a-seat-tutorial", "Abandoning the lesson grants no repeatable reward and preserves no hidden state.", "Mira resets the loaner deck from its immutable list and Orra restarts the lesson."),
  "waytable:2": runtime("mira-cardhand", "orra-last-turn", "waytable-deck-bench", "warg", "thirty-card-list", "thirty-with-reason", "An illegal deck remains saved only as a draft and cannot enter a match.", "Mira explains the first legality error while preserving all owned cards."),
  "waytable:3": runtime("jon-waytable", "mira-cardhand", "three-town-waytables", "lanternshell", "challenger-ledger", "three-town-styles", "Repeating the same challenger cannot substitute for three distinct styles.", "Jon keeps distinct wins and posts another available town challenger."),
  "waytable:4": runtime("mira-cardhand", "orra-last-turn", "waytable-opening-bench", "runeowl", "mulligan-marker", "second-thought-match", "A stale or repeated mulligan request is rejected by the match revision.", "Mira restores the authoritative opening state and Orra restarts the demonstration."),
  "waytable:5": runtime("jon-waytable", "mira-cardhand", "waytable-archetype-wall", "petalfox", "deck-tag-set", "five-ways-to-play", "Renaming the same unchanged list cannot manufacture a new archetype proof.", "Jon retains distinct validated lists and suggests a missing card identity."),
  "waytable:6": runtime("jon-waytable", "orra-last-turn", "peer-waytable", "warg", "challenge-token", "across-the-table", "Disconnect or invalid custody ends the exhibition without exposing concealed hands.", "Orra records the public match state and offers a clean rematch challenge."),
  "waytable:7": runtime("orra-last-turn", "jon-waytable", "master-circuit-table", "emberhorn", "master-circuit-token", "masters-circuit", "An invalid action or conceded match cannot be reported as a victory.", "Jon preserves legal turns and Orra schedules the challenger again."),
  "waytable:8": runtime("orra-last-turn", "mira-cardhand", "grand-waytable-hall", "runeowl", "last-turn-charter", "last-turn-council", "An unfinished vote changes neither rewards nor challenger schedules.", "Mira keeps the agreed rules and Orra calls the Circuit back to the table."),
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

type GuildNpcLife = Readonly<{
  schedule: readonly [string, string, string, string];
  personalConcern: string;
  recoveryProtocol: string;
  hallLine: string;
  fieldLine: string;
  crisisLine: string;
}>;
const npcLife = (
  schedule: readonly [string, string, string, string],
  personalConcern: string,
  recoveryProtocol: string,
  hallLine: string,
  fieldLine: string,
  crisisLine: string,
): GuildNpcLife => Object.freeze({ schedule: Object.freeze([...schedule]) as unknown as GuildNpcLife["schedule"], personalConcern, recoveryProtocol, hallLine, fieldLine, crisisLine });

const GUILD_NPC_LIVES: Readonly<Record<string, GuildNpcLife>> = Object.freeze({
  "odelia-fen": npcLife(["dawn: inspects sanctuary releases", "day: walks the teaching meadow", "dusk: hears welfare cases", "night: writes corridor orders"], "Keep the Conservancy from mistaking possession for care.", "Retreats to the west sanctuary; Pella assumes field command until Odelia recovers.", "An empty orb can be a successful day.", "Read the animal before you read your tools.", "Get the creatures clear; then we argue about blame."),
  "garrick-coil": npcLife(["dawn: calibrates care instruments", "day: repairs instruments at the public bench", "dusk: compares field notes to readings", "night: tests quiet mechanisms"], "Build instruments that admit when animal behavior disproves them.", "Locks down unstable gear and returns at dawn with a documented replacement.", "A number is evidence, not permission.", "If the reading and the tracks disagree, follow the tracks.", "Name the failed mechanism before touching it again."),
  "pella-reedshoe": npcLife(["dawn: listens beside Button's burrow", "day: surveys migration signs", "dusk: sketches shelter plans", "night: shelters at the field blind"], "Learn why Button's warning call has become faint.", "Button rings for Odelia, who shelters Pella until the next field window.", "Button found three details I missed, which is rude and useful.", "Small tracks are still a whole decision.", "Shelter first. Heroics after everyone can breathe."),
  "neris-nine-lights": npcLife(["dawn: trims nine observation lamps", "day: catalogs the teaching reef", "dusk: names only verified sightings", "night: descends with the blue lamps"], "Make deep-water research visible without turning it into spectacle.", "Extinguishes eight lamps and follows the ninth to the research raft.", "A name earned before a sighting is only a rumor.", "Dark water is not empty water.", "Keep one lamp for the route home."),
  "oru-kelpbraid": npcLife(["dawn: feeds the Reefmender colony", "day: repairs coral stations", "dusk: scrubs tools the shrimp rearranged", "night: checks nursery currents"], "Prove habitat repair can outlast one guild expedition.", "The Reefmenders tow Oru to the nursery pocket; Neris covers the next tide.", "The reef is a relationship, not masonry.", "Current carried the damage here; current can carry repair too.", "Defend the cleaners, not the scenery."),
  "sela-wakequiet": npcLife(["dawn: checks safety lines from shore", "day: retrieves submerged losses", "dusk: maps sealed wreck exits", "night: rests beside her Currentweaver"], "Return to the wreck she survived and choose what its relic should become.", "Her eel pulls her to the nearest marked air bell; Neris holds her recovered gear.", "A closed hatch is a question I answer slowly.", "Follow my current if the wreck starts talking.", "Drops can be replaced. People cannot."),
  "saelith-veyr": npcLife(["dawn: audits interrupted rituals", "day: teaches at the Three Laws court", "dusk: hears concealed-risk reports", "night: seals unstable archive wings"], "Keep the Arcanum accountable without making caution a private monopoly.", "Withdraws through the nearest ward and delegates containment to Fenna in writing.", "Ignorance can be repaired. Concealment has victims.", "A spell's consequence begins where its glow ends.", "Evacuate first; the archive can lose an argument."),
  "fenna-glassleaf": npcLife(["dawn: reviews summon clauses", "day: interviews manifested parties", "dusk: feeds the Runeowl and revises contracts", "night: observes the Palimpsest chamber"], "Write concordances that treat summoned beings as parties, not ammunition.", "Her Runeowl carries the contract shard to Saelith and maintains a holding ward.", "A signature from only one world is not consent.", "The margin changed because we repeated ourselves.", "Containment is time for negotiation, not a verdict."),
  "orren-third-bell": npcLife(["dawn: practices one quiet ward", "day: guides Hush crossings", "dusk: rests between measured bells", "night: records tolerable resonance"], "Revisit the failed ritual without letting the Choir define his recovery.", "Falls back to the quiet cloister; Fenna uses written signals until his hearing settles.", "One bell. Then space.", "Silence can shelter you or erase you. Check which.", "Stop casting. Listen for the people still moving."),
  "korga-bent-spear": npcLife(["dawn: inspects surrender chalk", "day: arbitrates public contracts", "dusk: drills measured force", "night: annotates the Red Ledger"], "Ensure contract wording can never hide who bears its consequences.", "Retires behind the surrender line; Bram commands the withdrawal and Nix records it.", "A legal order can still be a rotten one.", "Know who profits if this road stays dangerous.", "Hold the line only while it protects someone."),
  "nix-three-receipts": npcLife(["dawn: balances the repair purse", "day: prices contracts in public", "dusk: audits damage claims", "night: files three signed copies"], "Make every material and human cost visible before ink becomes blood.", "Locks the ledger in the iron drawer; Korga names a bonded clerk for urgent work.", "If it has no line item, someone is hiding the cost.", "This wheel broke before the ambush. I have the receipt.", "Count survivors before cargo."),
  "bram-coalgrin": npcLife(["dawn: runs Toll beside the caravan gate", "day: escorts exposed road legs", "dusk: practices rescue pulls", "night: sleeps in the border stable"], "Find the traveler whose toll Bram accepted but never delivered.", "Toll drags Bram behind cover and returns him to Korga's border lodge.", "Toll says the plan needs fewer speeches.", "Road's too quiet on the left. Toll agrees.", "I pull people out; you decide what deserves chasing."),
  "edda-rivetbraid": npcLife(["dawn: reads the overnight brace log", "day: inspects active shifts", "dusk: hears safety refusals", "night: marks tomorrow's retreat routes"], "Make preventable collapse a governance failure, not a miner's private bad luck.", "Seals the unsafe shift and names Hessa acting rescue lead until cleared.", "A deadline cannot hold a ceiling up.", "Chalk the retreat before you praise the vein.", "Nobody mines while somebody is missing."),
  "tovin-chalkmark": npcLife(["dawn: listens to cold rock", "day: surveys the four-vein gallery", "dusk: labels unresolved samples", "night: compares resonance intervals"], "Preserve uncertainty around Veinmetal until evidence earns a conclusion.", "Leaves the recorder in place and retreats to the last quiet chalk station.", "Unresolved is a result, not an embarrassment.", "That rhythm changed after our third step.", "Do not let urgency become a theory."),
  "hessa-deepnote": npcLife(["dawn: checks Pipet's collapse marks", "day: braces rescue routes", "dusk: repairs cover plates", "night: sleeps beside the union cache"], "Learn why Pipet hears a second collapse that instruments miss.", "Pipet leads her to a union air pocket; Edda dispatches the named replacement crew.", "The way out belongs in every plan.", "Pipet heard the roof before the gauge did.", "Cover up. Then move on my chalk."),
  "mara-bramblemap": npcLife(["dawn: updates road-event notes", "day: walks one disputed route", "dusk: debriefs expeditions over supper", "night: redraws the Common Map"], "Keep the shared map useful to travelers whose journeys differ from hers.", "Returns to the nearest marked meal-stop; Rowan inherits the expedition folio.", "A map should remember what went wrong.", "The shortcut costs more daylight than it saves.", "Mark the missing. A boss can wait."),
  "pip-underbridge": npcLife(["dawn: listens to the old Burrowbell", "day: tends wayhouse beds", "dusk: counts late travelers", "night: watches the storm gate"], "Keep wayhouses dependable for people who arrive slowly or injured.", "The Burrowbell calls Rowan; Pip waits safely in the storm cellar.", "Slow arrivals still deserve a hot place.", "Bell says weather. My knees say bridge.", "Beds first, stories second."),
  "rowan-mileglass": npcLife(["dawn: checks yesterday's ink", "day: draws while walking", "dusk: compares Petalfox scent marks", "night: copies maps at the wayhouse"], "Fill the blank mile where a failed expedition disappeared from every map.", "The Petalfox follows Rowan's scent back to Pip; the unfinished map remains pinned.", "I drew that turn before noticing we took it.", "The fox says the ink trail is lying.", "I marked three exits. Please use one."),
  "dame-caramel-voss": npcLife(["dawn: tests oven temper by sound", "day: inspects traveling provisions", "dusk: hears maker failures", "night: writes durable recipes"], "Keep beauty subordinate to safe, useful craft without killing experimentation.", "Closes the hot line, delegates service to Taff, and reopens only after a temper audit.", "Pretty is allowed after useful.", "If it cannot survive the road, it is tableware.", "Feed the shelter before the centerpiece."),
  "prill-snapcandy": npcLife(["dawn: labels yesterday's accidents", "day: tests substitutions", "dusk: traces counterfeit batches", "night: observes living batter"], "Learn when an experiment has become a creature with its own needs.", "Triggers the labeled shutdown sequence; Dame contains the bench and preserves notes.", "The label goes on before the spark.", "This crumb remembers a different oven.", "Good news: I know which mistake this is."),
  "taff-ribbons": npcLife(["dawn: packs road meals with Knot", "day: runs deliveries between factions", "dusk: repairs the kitchen axle", "night: feeds late arrivals"], "Untangle the recipe obligation that keeps Knot working after exhaustion.", "Knot pulls Taff and the delivery satchel to the mobile kitchen; Dame assigns a relief courier.", "Food late is sometimes food lost.", "Knot smelled the washed-out crossing first.", "I can bring tools or supper. Choose quickly."),
  "lysa-proofmark": npcLife(["dawn: audits overnight custody changes", "day: authenticates cards at the public counter", "dusk: hears disputed provenance", "night: seals the Grand Binder"], "Keep authentication useful without turning collecting into gatekeeping.", "Freezes only the disputed ledger entry and returns after an independent comparison.", "A rare finish is not a license to invent history.", "The card and its custody record travel together.", "Stop the exchange. Preserve both ledgers."),
  "oren-sleeve": npcLife(["dawn: sorts empty sleeves", "day: teaches archive deposits", "dusk: balances the singles counter", "night: repairs binders"], "Make duplicate cards useful without making physical collections disposable.", "Closes the affected drawer and reopens from its last signed inventory.", "A duplicate is another choice, not another problem.", "Count what is locked before offering what is free.", "Hands off the drawer until the revision agrees."),
  "tamsin-setmark": npcLife(["dawn: updates set checklists", "day: compares frames and finishes", "dusk: catalogs new discoveries", "night: prepares the reveal table"], "Record completion honestly while leaving room for future sets.", "Quarantines the disputed printing and keeps every verified checklist mark.", "Completion is a snapshot, not the end of collecting.", "Five reveals, five positions, one saved order.", "Preserve the evidence before chasing the error."),
  "orra-last-turn": npcLife(["dawn: reviews finished match logs", "day: runs the teaching table", "dusk: hosts master challenges", "night: writes circuit rulings"], "Keep competition legible enough that a newcomer can learn from losing.", "Ends the table on the last authoritative revision and appoints Jon as judge.", "A good ruling explains the next legal move.", "Play the board you have, not the draw you wanted.", "Freeze the clock. Public state only."),
  "mira-cardhand": npcLife(["dawn: shuffles immutable loaner lists", "day: teaches deck construction", "dusk: reviews mulligans", "night: annotates archetypes"], "Teach deck craft without prescribing a single correct list.", "Returns every loaner card to its manifest and resumes from a fresh seed.", "Thirty choices should have thirty reasons.", "A mulligan is a plan, not an apology.", "Show me the first illegal card, not thirty accusations."),
  "jon-waytable": npcLife(["dawn: posts town challengers", "day: maintains public tables", "dusk: records peer exhibitions", "night: tallies first-win claims"], "Keep rewards tied to mastery instead of repeatable collusion.", "Closes the challenged table, saves its public transcript, and offers a clean rematch.", "A result counts once; the lesson can count forever.", "Hidden hands stay hidden even from the crowd.", "Save the public board and clear the table."),
});

const npc = (guildId: GuildId, id: string, name: string, role: string, philosophy: string, recruitable: boolean, combatRole: string, utility: string, weakness: string, companion: string | null, personalQuest: string | null): GuildNpcDefinition => Object.freeze({
  ...(() => {
    const life = GUILD_NPC_LIVES[id];
    return {
      id, guildId, name, role, philosophy, recruitable, combatRole, utility, weakness, companion, personalQuest,
      personalConcern: life.personalConcern,
      recruitCondition: recruitable ? `Complete chapter 6 (${questAt(guildId, 6)}) and speak at this NPC's home hall.` : null,
      recoveryProtocol: life.recoveryProtocol,
      homeSchedule: life.schedule,
      contextLines: Object.freeze([
        `Hall — ${life.hallLine}`,
        `Road or biome — ${life.fieldLine}`,
        `Bad weather — ${life.fieldLine}`,
        `Low health — ${life.crisisLine}`,
        `Creature capture — ${life.hallLine}`,
        `Dungeon or named encounter — ${life.crisisLine}`,
      ]),
    };
  })(),
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
  npc("cardwright", "lysa-proofmark", "Lysa Proofmark", "First Registrar", "Provenance is a promise about custody, not prestige.", false, "ledger ward", "authentication and dispute resolution", "refuses undocumented shortcuts", null, null),
  npc("cardwright", "oren-sleeve", "Oren Sleeve", "Archive keeper", "Duplicates should create choices, not clutter.", false, "protective filing", "archive sorting and market receipts", "overprotective of physical copies", null, null),
  npc("cardwright", "tamsin-setmark", "Tamsin Setmark", "Cataloger", "A set is complete only at a named revision.", true, "reveal sequencing", "set and finish analysis", "chases edge cases", "Runeowl familiar", "The Missing Number"),
  npc("waytable", "orra-last-turn", "Orra Last-Turn", "Circuit marshal", "Every ruling should teach the next legal move.", false, "tempo command", "match adjudication", "slow to accept house rules", null, null),
  npc("waytable", "mira-cardhand", "Mira Cardhand", "Deck tutor", "A list is strongest when its player understands every inclusion.", false, "resource coaching", "deck construction and mulligans", "avoids high-variance lines", null, null),
  npc("waytable", "jon-waytable", "Jon Waytable", "Town challenger", "The public board is enough to tell an honest story.", true, "lane control", "peer challenges and town schedules", "telegraphs ambitious turns", "Petalfox companion", "Three Empty Chairs"),
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
  cardwright: guild("cardwright", "player", "Cardwrights' Collegium", "Card authentication, duplicate-aware collecting, provenance, archive stewardship, and fair exchange.", ["Empty Sleeve", "Copy Clerk", "Setmarker", "Finish Reader", "Master Registrar", "Keeper of the Grand Binder"], ["bartering", "crafting"], ["exploration", "magic"], ["duplicate sorting", "set checklists", "finish filters", "receipt history", "old-set stock", "archive cosmetics"], "Cardwright registry counter", ["public catalogs", "guarded provenance", "open exchange"]),
  waytable: guild("waytable", "player", "Waytable Circuit", "Deck teaching, town challenges, fair matches, public rulings, and mastery rewards.", ["Table Guest", "Deckhand", "Town Challenger", "Circuit Judge", "Master of Lanes", "Keeper of the Last Turn"], ["exploration", "bartering"], ["melee", "magic"], ["legality hints", "deck slots", "challenger tiers", "match notes", "table cosmetics", "circuit formats"], "Waytable teaching hall", ["teaching tables", "open competition", "guarded mastery"]),
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

export type GuildSemanticEventContext = Readonly<{
  creatureKind?: string;
  locationId?: string;
  itemId?: string;
  encounterId?: string;
  actorId?: string;
}>;
export type GuildSemanticEvent = Readonly<{
  kind: GuildObjectiveKind;
  /** Required routing. Legacy kind-only broadcasts intentionally earn no proof. */
  guildId?: GuildId;
  questId?: string;
  objectiveId?: string;
  targetId?: string;
  context?: GuildSemanticEventContext;
  amount?: number;
  demonstrationId?: string;
  outcomeId?: string;
}>;
const predicateContextValues: Readonly<Record<GuildObjectiveContextKey, keyof GuildSemanticEventContext>> = Object.freeze({
  creatureKind: "creatureKind",
  locationId: "locationId",
  itemId: "itemId",
  encounterId: "encounterId",
  actorId: "actorId",
});
function semanticEventMatchesObjective(event: GuildSemanticEvent, objective: GuildQuestObjective) {
  if (!event.targetId || !objective.predicate.targetIds.includes(event.targetId)) return false;
  if (event.objectiveId && event.objectiveId !== objective.id) return false;
  const context = event.context ?? {};
  for (const key of objective.predicate.requiredContext) {
    const value = context[predicateContextValues[key]];
    if (!value || !objective.predicate[`${key}s` as "creatureKinds" | "locationIds" | "itemIds" | "encounterIds" | "actorIds"].includes(value)) return false;
  }
  return true;
}
export function applyGuildSemanticEvent(book: GuildBookState, event: GuildSemanticEvent) {
  if (!event.guildId || !event.questId || !event.demonstrationId) return book;
  const quest = GUILD_QUESTS.find((entry) => entry.id === event.questId && entry.guildId === event.guildId);
  if (!quest) return book;
  const state = book.guilds[event.guildId];
  if (!state.activeQuestIds.includes(quest.id)) return book;
  const progress = { ...state.objectiveProgress };
  const demonstrations = new Set(state.completedDemonstrationIds);
  let changed = false;
  for (const entry of quest.objectives) {
    if (entry.kind !== event.kind || !semanticEventMatchesObjective(event, entry)) continue;
    const scopedProofId = `${event.guildId}:${quest.id}:${entry.id}:${event.demonstrationId}`;
    if (demonstrations.has(scopedProofId)) continue;
    const requestedAmount = event.amount ?? 1;
    const amount = Math.max(0, Math.min(64, Number.isFinite(requestedAmount) ? requestedAmount : 0));
    if (amount <= 0) continue;
    const key = `${quest.id}:${entry.id}`;
    const nextValue = Math.min(entry.target, (progress[key] ?? 0) + amount);
    if (nextValue === (progress[key] ?? 0)) continue;
    progress[key] = nextValue;
    demonstrations.add(scopedProofId);
    changed = true;
  }
  if (!changed) return book;
  const next = Object.freeze({ ...state, objectiveProgress: Object.freeze(progress), completedDemonstrationIds: Object.freeze([...demonstrations].slice(-128)) });
  return Object.freeze({ ...book, guilds: Object.freeze({ ...book.guilds, [event.guildId]: next }), revision: book.revision + 1 });
}

export function questProgress(book: GuildBookState, questId: string) {
  const quest = GUILD_QUESTS.find((entry) => entry.id === questId); if (!quest) return null;
  const state = book.guilds[quest.guildId]; const objectives = quest.objectives.map((entry) => ({ ...entry, current: Math.min(entry.target, state.objectiveProgress[`${questId}:${entry.id}`] ?? 0) }));
  const complete = objectives.every((entry) => entry.current >= entry.target);
  return Object.freeze({ quest, objectives: Object.freeze(objectives), complete, explanation: complete ? "All authored demonstrations are complete; return for the named resolution." : objectives.filter((entry) => entry.current < entry.target).map((entry) => `${entry.blockedText} (${entry.current}/${entry.target}) Recovery: ${entry.recoveryText}`).join("; ") });
}

export function promotionEligibility(book: GuildBookState, guildId: GuildId) {
  const state = book.guilds[guildId]; const definition = GUILDS[guildId]; const currentIndex = Math.max(-1, definition.ranks.findIndex((rank) => rank.id === state.rankId)); const next = definition.ranks[currentIndex + 1] ?? null;
  if (!next) return Object.freeze({ eligible: false, next: null, missing: Object.freeze(["Maximum rank reached."]) });
  const missing: string[] = []; if (!["member", "honored"].includes(state.membership)) missing.push("guild oath"); if (state.standing < next.standing) missing.push(`${next.standing - state.standing} standing`); if (state.completedDemonstrationIds.length < next.demonstrationCount) missing.push(`${next.demonstrationCount - state.completedDemonstrationIds.length} relevant demonstration(s)`); if (state.completedQuestIds.length < next.questNumber) missing.push(`campaign quest ${next.questNumber}`);
  return Object.freeze({ eligible: missing.length === 0, next, missing: Object.freeze(missing) });
}

export function discoverGuildHall(book: GuildBookState, guildId: GuildId, hallId: string) {
  const normalizedHallId = hallId.trim().slice(0, 128);
  const state = book.guilds[guildId];
  if (!normalizedHallId || state.hallDiscoveryIds.includes(normalizedHallId)) return book;
  const next = Object.freeze({ ...state, hallDiscoveryIds: Object.freeze([...state.hallDiscoveryIds, normalizedHallId].slice(-64)) });
  return Object.freeze({ ...book, guilds: Object.freeze({ ...book.guilds, [guildId]: next }), revision: book.revision + 1 });
}

export function inviteToGuild(book: GuildBookState, guildId: GuildId, inviterNpcId: string) {
  const state = book.guilds[guildId];
  const inviter = GUILD_NPCS.find((entry) => entry.id === inviterNpcId && entry.guildId === guildId);
  if (!inviter || state.membership !== "unknown") return book;
  const next = Object.freeze({
    ...state,
    membership: "invited" as const,
    serviceFlags: Object.freeze([...new Set([...state.serviceFlags, `invited-by:${inviterNpcId}`])]),
  });
  return Object.freeze({ ...book, guilds: Object.freeze({ ...book.guilds, [guildId]: next }), revision: book.revision + 1 });
}

export function guildJoinEligibility(book: GuildBookState, guildId: GuildId) {
  const state = book.guilds[guildId];
  if (state.membership === "member" || state.membership === "honored") return Object.freeze({ eligible: false, reason: "Already sworn." });
  if (state.membership === "suspended") return Object.freeze({ eligible: false, reason: "Resolve restitution before renewing the oath." });
  if (state.membership === "invited") return Object.freeze({ eligible: true, reason: "A named guild principal invited you to take the oath." });
  if (state.hallDiscoveryIds.length > 0) return Object.freeze({ eligible: true, reason: "You discovered a guild hall and may ask its principals for the oath." });
  return Object.freeze({ eligible: false, reason: `Discover ${GUILDS[guildId].standaloneHall} or earn a principal's invitation.` });
}

export function joinGuild(book: GuildBookState, guildId: GuildId) {
  const state = book.guilds[guildId];
  if (state.membership === "member" || state.membership === "honored") return book;
  if (!guildJoinEligibility(book, guildId).eligible) return book;
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
  if (!state.activeQuestIds.includes(questId)) return book;
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
