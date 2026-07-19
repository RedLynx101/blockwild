import type { LegendaryCreatureKind } from "./mobs";

export type LegendaryEncounterId =
  | "walking-spring"
  | "reef-that-swims"
  | "oath-under-stone"
  | "where-storms-run"
  | "red-banner"
  | "sovereign-feast"
  | "quiet-bells" | "cloudwhale-graveyard" | "mirrorfen-processional" | "emberglass-hatchery"
  | "drowned-moon-gate" | "titans-kettle" | "root-crown-menagerie" | "fossil-orchard"
  | "lanternroot-cistern" | "tideclock-wreck" | "palace-nine-winds" | "gorgon-quarry"
  | "sunken-court-namarra" | "ashen-library" | "hollow-moon-menagerie";
export type LegendaryOutcome = "capture" | "covenant" | "release" | "defeat";
export type LegendaryEventKind =
  | "observe-sign" | "restore-habitat" | "remove-hazard" | "repair-anchor" | "calm-creature"
  | "break-restraint" | "survive-phase" | "offer-crafted-item" | "travel-route" | "win-fair-contest";

export type LegendaryObjective = Readonly<{
  id: string;
  event: LegendaryEventKind;
  target: number;
  description: string;
}>;
export type LegendaryStageDefinition = Readonly<{
  id: string;
  name: string;
  description: string;
  objectives: readonly LegendaryObjective[];
}>;
export type LegendaryEncounterDefinition = Readonly<{
  id: LegendaryEncounterId;
  kind: LegendaryCreatureKind;
  title: string;
  guildId: "waykeeper" | "tideglass" | "deepgear" | "hearthroad" | "brassroot" | "sugarcourt-makers" | "mythic-frontiers";
  habitatKeys: readonly string[];
  stages: readonly LegendaryStageDefinition[];
  outcomes: Readonly<Record<LegendaryOutcome, string>>;
  worldEcho: string;
}>;

const objective = (id: string, event: LegendaryEventKind, target: number, description: string): LegendaryObjective => Object.freeze({ id, event, target, description });
const stage = (id: string, name: string, description: string, objectives: readonly LegendaryObjective[]): LegendaryStageDefinition => Object.freeze({ id, name, description, objectives: Object.freeze([...objectives]) });
const outcome = (capture: string, covenant: string, release: string, defeat: string) => Object.freeze({ capture, covenant, release, defeat });

const frontierEncounter = (input: Readonly<{
  id: LegendaryEncounterId; kind: LegendaryCreatureKind; title: string; habitats: readonly string[];
  signs: string; restoration: string; meeting: string; worldEcho: string;
}>): LegendaryEncounterDefinition => Object.freeze({
  id: input.id,
  kind: input.kind,
  title: input.title,
  guildId: "mythic-frontiers",
  habitatKeys: Object.freeze([...input.habitats]),
  stages: Object.freeze([
    stage("field-signs", "Read the Living Site", input.signs, [objective("signs", "observe-sign", 3, "Document three distinct signs without forcing the resident creature to react.")]),
    stage("ecological-center", "Restore the Ecological Center", input.restoration, [objective("restoration", "restore-habitat", 2, "Restore two site systems in their intended order."), objective("hazard", "remove-hazard", 1, "Remove the site's primary hazard without flattening its habitat.")]),
    stage("measured-meeting", "The Measured Meeting", input.meeting, [objective("calm", "calm-creature", 2, "Complete both readable calming windows."), objective("phase", "survive-phase", 2, "Read two dynamic encounter phases without lethal force.")]),
  ]),
  outcomes: outcome(
    `${input.title} accepts a purpose-built legendary habitat after custody is earned.`,
    `${input.title} keeps the restored site through a lasting covenant.`,
    `${input.title} resumes its migration while the restored site remains visitable.`,
    `A memorial ecology program preserves the site and records the cost of the loss.`,
  ),
  worldEcho: input.worldEcho,
});

const MYTHIC_FRONTIER_ENCOUNTERS = Object.freeze({
  "quiet-bells": frontierEncounter({ id: "quiet-bells", kind: "bellstep-qilin", title: "Bellstep Qilin of the Quiet Bells", habitats: ["desert", "badlands", "savanna"], signs: "Follow hoof-written bell intervals between windworn road shrines.", restoration: "Realign the buried bell road and clear the caravan refuge without rebuilding it into a settlement.", meeting: "Match the Qilin's patient circuit before asking it to sound the road.", worldEcho: "The Road of Quiet Bells again warns caravans before sandstorms." }),
  "cloudwhale-graveyard": frontierEncounter({ id: "cloudwhale-graveyard", kind: "aerolith-baleen", title: "Aerolith Baleen of the Cloudwhale Graveyard", habitats: ["cloudreed-glen", "highlands", "snowcap-range"], signs: "Read wind-shadow, floating baleen, and the careful spacing of ancient sky-bones.", restoration: "Return displaced aeroliths and reopen the graveyard's lift basin.", meeting: "Ride the rising basin without touching the herd's memorial bones.", worldEcho: "A protected cloudwhale migration crosses the restored high air." }),
  "mirrorfen-processional": frontierEncounter({ id: "mirrorfen-processional", kind: "mireglass-kelpie", title: "Mireglass Kelpie of the Mirrorfen", habitats: ["swamp", "siltfen", "rainveil-jungle"], signs: "Distinguish true processional hoofprints from reflected false wakes.", restoration: "Drain the blocked reedglass channels while retaining the fen's shallow pools.", meeting: "Complete the true mirrored canter without following the decoy route.", worldEcho: "The Mirrorfen processional channels remain clear and seasonally flooded." }),
  "emberglass-hatchery": frontierEncounter({ id: "emberglass-hatchery", kind: "cinderwing-pyrausta", title: "Cinderwing Pyrausta of the Emberglass Hatchery", habitats: ["ember-wastes", "emberdeep", "volcanic"], signs: "Read heat-script revealed only when the hatchery vents in sequence.", restoration: "Repair two heat cradles and reopen the safe chimney shutter.", meeting: "Stand through ashwing and glasswing phases while protecting the clutch.", worldEcho: "The Emberglass Hatchery resumes a safe, bounded migration cycle." }),
  "drowned-moon-gate": frontierEncounter({ id: "drowned-moon-gate", kind: "nacre-gatewyrm", title: "Nacre Gatewyrm of the Drowned Moon Gate", habitats: ["lumen-trench", "abyssal", "deep-ocean"], signs: "Trace nacre folds that distinguish sealed air gardens from drowned corridors.", restoration: "Restore the moonwell pocket and seal the breached garden threshold.", meeting: "Cross the threshold current without breaking the Gatewyrm's protective circuit.", worldEcho: "The Drowned Moon Gate shelters swimmers and two preserved air gardens." }),
  "titans-kettle": frontierEncounter({ id: "titans-kettle", kind: "frostcauldron-behemoth", title: "Frostcauldron Behemoth of Titan's Kettle", habitats: ["snowcap-range", "snowfield", "frostpine", "highlands"], signs: "Read warm snow hollows while keeping well clear of dwarven shafts and roads.", restoration: "Brace the kettle rim and reopen one avalanche-safe caravan shelter.", meeting: "Weather the snowplow and avalanche-brace phases without provoking a charge toward a settlement.", worldEcho: "Titan's Kettle becomes a warm refuge on one remote mountain route." }),
  "root-crown-menagerie": frontierEncounter({ id: "root-crown-menagerie", kind: "briarcrown-manticore", title: "Briarcrown Manticore of the Root-Crown Menagerie", habitats: ["glimmerwood", "wildwood", "forest", "rootweave"], signs: "Separate poacher marks from the Manticore's measured territorial signs.", restoration: "Reconnect two living habitat courts above the Rootweave without cutting the crown roots.", meeting: "Read pounce, venom measure, and menagerie roar as territorial language.", worldEcho: "The restored Root-Crown courts again shelter displaced forest predators." }),
  "fossil-orchard": frontierEncounter({ id: "fossil-orchard", kind: "ammonarch", title: "Ammonarch of the Fossil Orchard", habitats: ["pillarstone", "crystaldeep", "ancient-water"], signs: "Hear spiral resonance without mining occupied fossil strata.", restoration: "Rewater the porous orchard floor and brace its calcite roots.", meeting: "Answer Stone Song while leaving the first stratum undisturbed.", worldEcho: "The Fossil Orchard carries water through ancient, unmined strata." }),
  "lanternroot-cistern": frontierEncounter({ id: "lanternroot-cistern", kind: "handtail-ahuizotl", title: "Handtail Ahuizotl of the Lanternroot Cistern", habitats: ["rootweave", "glasswater", "underground"], signs: "Follow returned keepsakes and hand-shaped ripples through clean channels.", restoration: "Unblock the rescue channel and relight only the cistern's ecological center.", meeting: "Allow the Ahuizotl to test scent, backwash, and rescue intent before custody.", worldEcho: "The Lanternroot Cistern remains a clean rescue refuge in otherwise dark tunnels." }),
  "tideclock-wreck": frontierEncounter({ id: "tideclock-wreck", kind: "tideclock-cetus", title: "Tideclock Cetus of the Wreck", habitats: ["brightwater", "abyssal", "deep-ocean"], signs: "Map clock-rib soundings around a wreck without stripping its sheltering hull.", restoration: "Free the sounding chamber and redirect the dangerous wreck current.", meeting: "Complete a sounding roll and abyssal slipstream beside the Cetus pod.", worldEcho: "The Tideclock Wreck becomes a marked safe current and pod refuge." }),
  "palace-nine-winds": frontierEncounter({ id: "palace-nine-winds", kind: "anemoi-gryphon", title: "Anemoi Gryphon of the Nine Winds", habitats: ["cloudreed-glen", "highlands", "snowcap-range"], signs: "Read nine distinct drafts across the palace's five chambers and ascent.", restoration: "Retune two broken wind courts and clear the final landing crown.", meeting: "Fly the full palace circuit without skipping its grounded return route.", worldEcho: "The Palace of Nine Winds maintains a navigable but demanding updraft circuit." }),
  "gorgon-quarry": frontierEncounter({ id: "gorgon-quarry", kind: "sable-gorgon", title: "Sable Gorgon of the Quarry", habitats: ["badlands", "desert", "crystaldeep"], signs: "Identify mirrored gaze lines and victims still safe inside stone cocoons.", restoration: "Brace the quarry loop and uncover a nonlethal reversal chamber.", meeting: "Survive Quarry Rush and Sable Glance before performing Merciful Reversal.", worldEcho: "The quarry loop becomes a refuge and every recoverable victim is released." }),
  "sunken-court-namarra": frontierEncounter({ id: "sunken-court-namarra", kind: "namarra-makara", title: "Namarra Makara of the Sunken Court", habitats: ["lumen-trench", "deep-ocean", "brightwater"], signs: "Read court regalia across five flooded rooms and two sealed air gardens.", restoration: "Restore the procession current without opening either garden to the sea.", meeting: "Complete the Pearl Audience and answer Namarra's Decree without looting the court.", worldEcho: "Namarra's flooded procession and both sealed air gardens remain intact." }),
  "ashen-library": frontierEncounter({ id: "ashen-library", kind: "ashen-salamander-king", title: "Ashen Salamander King of the Library", habitats: ["ember-wastes", "emberdeep", "volcanic"], signs: "Reveal heat-memory tablets without saturating the archive with light.", restoration: "Open the chimney and stabilize the seven-room crown foundry route.", meeting: "Read royal temper and memory heat while protecting the last tablets.", worldEcho: "The Ashen Library safely reveals its heat-memory archive." }),
  "hollow-moon-menagerie": frontierEncounter({ id: "hollow-moon-menagerie", kind: "mycelial-oneirophant", title: "Mycelial Oneirophant of the Hollow Moon", habitats: ["mooncap", "starbloom", "mushroom"], signs: "Trace remembered habitats through six loops without illuminating the quiet tunnels between them.", restoration: "Restore the moonfelt pond and one missing habitat echo.", meeting: "Follow the remembered path until the Oneirophant recognizes a kindred menagerie.", worldEcho: "Six habitat loops and a quiet moonfelt pond persist beneath the Hollow Moon." }),
} satisfies Readonly<Record<Exclude<LegendaryEncounterId, "walking-spring" | "reef-that-swims" | "oath-under-stone" | "where-storms-run" | "red-banner" | "sovereign-feast">, LegendaryEncounterDefinition>>);

export const LEGENDARY_ENCOUNTERS: Readonly<Record<LegendaryEncounterId, LegendaryEncounterDefinition>> = Object.freeze({
  "walking-spring": Object.freeze({
    id: "walking-spring", kind: "ilyr-virebloom", title: "Ilyr Virebloom, the Walking Spring", guildId: "waykeeper",
    habitatKeys: Object.freeze(["meadow", "flower-meadow", "wildwood", "river", "glimmerwood"]),
    stages: Object.freeze([
      stage("spring-signs", "Where Water Walked", "Read bent reeds, drinking tracks, and flowers blooming against the season.", [objective("signs", "observe-sign", 3, "Document three non-invasive migration signs.")]),
      stage("wounded-waters", "The Wounded Waters", "Repair the springs Ilyr has been exhausting while fleeing ironroot snares.", [objective("springs", "restore-habitat", 3, "Restore three spring cells."), objective("snares", "remove-hazard", 2, "Remove both ironroot snares without harming Ilyr.")]),
      stage("walking-spring", "The Walking Spring", "Calm the moving bloom through patient fieldcraft before asking for custody.", [objective("calm", "calm-creature", 2, "Complete both behavioral calming windows."), objective("contest", "win-fair-contest", 1, "Meet Ilyr on equal terms.")]),
    ]),
    outcomes: outcome("Ilyr accepts a vast living sanctuary; captured springs remain public.", "Ilyr patrols a protected migration corridor.", "Ilyr departs and reseeds exhausted springs.", "A memorial wetland and restitution work replace the fallen spring."),
    worldEcho: "A chain of small flower springs persists along Ilyr's route.",
  }),
  "reef-that-swims": Object.freeze({
    id: "reef-that-swims", kind: "thalassene", title: "Thalassene, the Reef That Swims", guildId: "tideglass",
    habitatKeys: Object.freeze(["ocean", "deep-ocean", "lumen-trench"]),
    stages: Object.freeze([
      stage("reef-song", "The Reef's Missing Note", "Identify a living reef by the species sheltering in its wake.", [objective("reef-observations", "observe-sign", 3, "Record three mutualist behaviors.")]),
      stage("salvage-rigs", "Hooks in a Horizon", "Dismantle parasite cages and salvage rigs without rupturing the reef mantle.", [objective("parasites", "restore-habitat", 3, "Treat three parasite blooms."), objective("rigs", "remove-hazard", 3, "Disable three salvage anchors.")]),
      stage("open-current", "A Current Large Enough", "Survive the turning reef and prove a route that does not strand its passengers.", [objective("phases", "survive-phase", 3, "Read all three tidal phases."), objective("route", "travel-route", 1, "Complete the open-current passage.")]),
    ]),
    outcomes: outcome("Thalassene enters a purpose-built pelagic habitat.", "A protected reef route opens to Tideglass escorts.", "The repaired reef resumes migration.", "A reef nursery and named wreck-marker remain in restitution."),
    worldEcho: "Reefmender cleaning stations appear along the migration current.",
  }),
  "oath-under-stone": Object.freeze({
    id: "oath-under-stone", kind: "orichalc", title: "Orichalc, the Oath Under Stone", guildId: "deepgear",
    habitatKeys: Object.freeze(["highlands", "snowcap-range", "badlands", "glimmerwood"]),
    stages: Object.freeze([
      stage("listening-seam", "The Listening Seam", "Measure a rhythmic ore body without deciding what Veinmetal is.", [objective("resonance", "observe-sign", 4, "Record four separated resonance intervals.")]),
      stage("load-bearing-oath", "A Promise Must Bear Weight", "Brace the grand cavern before disturbing its walking oath.", [objective("braces", "repair-anchor", 4, "Place and test four structural braces."), objective("faults", "remove-hazard", 2, "Relieve both unstable faults.")]),
      stage("orichalc", "Oath Under Orichalc", "Break harmful resonance, then choose custody or covenant without defining the being away.", [objective("phases", "survive-phase", 3, "Survive three resonance phases."), objective("contest", "win-fair-contest", 1, "Finish the measured contest.")]),
    ]),
    outcomes: outcome("Orichalc enters a load-bearing construct bay by oath.", "Orichalc becomes guardian of a stabilized cavern.", "The oath retreats into an unmined listening seam.", "The Union seals the seam and funds permanent braces."),
    worldEcho: "The stabilized cavern retains working braces and an unresolved Veinmetal archive.",
  }),
  "where-storms-run": Object.freeze({
    id: "where-storms-run", kind: "varkesh-stormmane", title: "Varkesh Stormmane", guildId: "hearthroad",
    habitatKeys: Object.freeze(["highlands", "snowcap-range", "cloudreed-glen"]),
    stages: Object.freeze([
      stage("storm-trail", "Hoofprints in Thunder", "Follow grounded fulgurite and displaced aerie moss through a moving front.", [objective("signs", "observe-sign", 4, "Read four storm-trail signs."), objective("wayposts", "repair-anchor", 2, "Rebuild two high wayposts.")]),
      stage("aerie-line", "The Safe Line Through", "Cross the storm without cutting across nesting ledges.", [objective("route", "travel-route", 2, "Complete both wind-sheltered legs."), objective("nest", "restore-habitat", 1, "Restore the damaged Roclet aerie.")]),
      stage("stormmane", "Where Storms Run", "Match Varkesh's aerial charge and land safely before terms are offered.", [objective("phases", "survive-phase", 3, "Read gale, lightning, and clear-eye phases."), objective("contest", "win-fair-contest", 1, "Complete the landing contest.")]),
    ]),
    outcomes: outcome("Varkesh accepts a highland eyrie and flight bond.", "A storm-road pact opens rare safe crossings.", "Varkesh returns to a protected aerie.", "Roclet caretakers inherit a repaired memorial route."),
    worldEcho: "Storm wayposts forecast safe highland crossings without eliminating weather.",
  }),
  "red-banner": Object.freeze({
    id: "red-banner", kind: "kharza", title: "Kharza, the Red Banner Warg", guildId: "brassroot",
    habitatKeys: Object.freeze(["badlands", "savanna", "highlands"]),
    stages: Object.freeze([
      stage("banner-trail", "The Banner That Bites", "Separate Kharza's territory from the mercenary patrol forcing its path.", [objective("signs", "observe-sign", 3, "Distinguish three natural territorial signs."), objective("patrols", "remove-hazard", 2, "Disarm two coercive patrol posts.")]),
      stage("broken-harness", "No Contract Worn as a Collar", "Break the command harness in safe windows rather than damaging the warg beneath it.", [objective("buckles", "break-restraint", 3, "Break all three harness locks."), objective("calm", "calm-creature", 1, "Hold one calm interval after release.")]),
      stage("red-banner", "The Red Banner", "Survive a direct territorial challenge and offer terms with no hidden chain.", [objective("phases", "survive-phase", 2, "Meet pursuit and stand-ground phases."), objective("contest", "win-fair-contest", 1, "Complete the uncoerced duel.")]),
    ]),
    outcomes: outcome("Kharza joins as a willing war-warg with the harness destroyed.", "Kharza guards a neutral road territory.", "Kharza takes the banner and leaves the company behind.", "The Freeblades dissolve the coercive contract and mark the loss."),
    worldEcho: "Coercive war-warg patrols cease or reform according to the chosen charter.",
  }),
  "sovereign-feast": Object.freeze({
    id: "sovereign-feast", kind: "sugarwake-sovereign", title: "The Sugarwake Sovereign", guildId: "sugarcourt-makers",
    habitatKeys: Object.freeze(["sugarplum-vale"]),
    stages: Object.freeze([
      stage("seven-place-setting", "A Table With Room to Refuse", "Prepare varied offerings that remain useful food, not bait disguised as hospitality.", [objective("offerings", "offer-crafted-item", 4, "Present four high-quality offerings from different craft families.")]),
      stage("appetites", "What Hunger Changes", "Answer the Sovereign's brittle, syrup, steam, and quiet appetites without repeating one trick.", [objective("phases", "survive-phase", 4, "Resolve four changing appetite phases."), objective("kitchen", "repair-anchor", 1, "Keep the communal kitchen functioning.")]),
      stage("shared-table", "The Sovereign Wakes Hungry", "Complete a feast whose quality determines whether the final heart-form trusts the table.", [objective("feast", "offer-crafted-item", 3, "Serve a balanced three-course field feast."), objective("contest", "win-fair-contest", 1, "Meet the heart-form's final measure.")]),
    ]),
    outcomes: outcome("The heart-form joins a spacious confection habitat.", "The Sovereign anchors a communal feast station.", "The satisfied Sovereign returns to the syrup wake.", "The Makers preserve the table and end dangerous imitation recipes."),
    worldEcho: "A public feast station remembers the quality and ethics of the resolution.",
  }),
  ...MYTHIC_FRONTIER_ENCOUNTERS,
});

export const LEGENDARY_ENCOUNTER_ORDER = Object.freeze(Object.keys(LEGENDARY_ENCOUNTERS) as LegendaryEncounterId[]);

export type LegendaryBehaviorPhase = "wary" | "territorial" | "defending" | "frenzied" | "exhausted" | "trusting";
export type LegendarySiteRole = "regional" | "sanctuary" | "apex";
export type LegendarySiteRecoveryPolicy = Readonly<{
  role: LegendarySiteRole;
  recoveryDays: number;
  revisitCadenceDays: number;
  reappearAfterOutcomes: readonly LegendaryOutcome[];
}>;

export type LegendaryEncounterState = Readonly<{
  schema: 1;
  encounterId: LegendaryEncounterId;
  siteId: string;
  status: "dormant" | "active" | "resolved";
  stageIndex: number;
  objectiveProgress: Readonly<Record<string, number>>;
  eventProofIds: readonly string[];
  outcome: LegendaryOutcome | null;
  custodyEntityId: string | null;
  uniqueResolutionToken: string | null;
  worldChanges: readonly string[];
  /** Large-site AI remains explicit and persistent instead of resetting on unload. */
  behaviorPhase: LegendaryBehaviorPhase;
  activeBrains: 0 | 1 | 2;
  proxyMode: boolean;
  lootPity: Readonly<Record<string, number>>;
  /** Site recovery is day-based and advances only when the lair is revisited/loaded. */
  resolvedDay: number | null;
  lastVisitDay: number | null;
  revisitCount: number;
  ecologyRecovery: number;
  nextResidentReturnDay: number | null;
  signatureRewardIds: readonly string[];
  revision: number;
}>;

export function createLegendaryEncounterState(encounterId: LegendaryEncounterId, siteId: string): LegendaryEncounterState {
  return Object.freeze({ schema: 1, encounterId, siteId, status: "dormant", stageIndex: 0, objectiveProgress: Object.freeze({}), eventProofIds: Object.freeze([]), outcome: null, custodyEntityId: null, uniqueResolutionToken: null, worldChanges: Object.freeze([]), behaviorPhase: "wary", activeBrains: 0, proxyMode: true, lootPity: Object.freeze({}), resolvedDay: null, lastVisitDay: null, revisitCount: 0, ecologyRecovery: 0, nextResidentReturnDay: null, signatureRewardIds: Object.freeze([]), revision: 0 });
}

export function normalizeLegendaryEncounterState(value: unknown, encounterId: LegendaryEncounterId, siteId: string): LegendaryEncounterState {
  const raw = value && typeof value === "object" ? value as Partial<LegendaryEncounterState> : {};
  const definition = LEGENDARY_ENCOUNTERS[encounterId];
  const outcomeValue = raw.outcome && ["capture", "covenant", "release", "defeat"].includes(raw.outcome) ? raw.outcome : null;
  return Object.freeze({
    schema: 1, encounterId, siteId,
    status: raw.status === "active" || raw.status === "resolved" ? raw.status : "dormant",
    stageIndex: Math.max(0, Math.min(definition.stages.length - 1, Math.floor(Number(raw.stageIndex) || 0))),
    objectiveProgress: Object.freeze(Object.fromEntries(Object.entries(raw.objectiveProgress ?? {}).filter(([key]) => key.length <= 160).slice(-64).map(([key, count]) => [key, Math.max(0, Math.floor(Number(count) || 0))]))),
    eventProofIds: Object.freeze([...(raw.eventProofIds ?? [])].filter((entry): entry is string => typeof entry === "string" && entry.length > 0 && entry.length <= 192).slice(-128)),
    outcome: outcomeValue,
    custodyEntityId: typeof raw.custodyEntityId === "string" ? raw.custodyEntityId.slice(0, 128) : null,
    uniqueResolutionToken: typeof raw.uniqueResolutionToken === "string" ? raw.uniqueResolutionToken.slice(0, 192) : null,
    worldChanges: Object.freeze([...(raw.worldChanges ?? [])].filter((entry): entry is string => typeof entry === "string").slice(-32)),
    behaviorPhase: ["wary", "territorial", "defending", "frenzied", "exhausted", "trusting"].includes(raw.behaviorPhase ?? "") ? raw.behaviorPhase as LegendaryBehaviorPhase : "wary",
    activeBrains: Math.max(0, Math.min(2, Math.floor(Number(raw.activeBrains) || 0))) as 0 | 1 | 2,
    proxyMode: raw.proxyMode !== false,
    lootPity: Object.freeze(Object.fromEntries(Object.entries(raw.lootPity ?? {}).filter(([key]) => key.length <= 96).slice(-32).map(([key, count]) => [key, Math.max(0, Math.min(64, Math.floor(Number(count) || 0)))]))),
    resolvedDay: Number.isFinite(raw.resolvedDay) ? Math.max(0, Math.floor(Number(raw.resolvedDay))) : null,
    lastVisitDay: Number.isFinite(raw.lastVisitDay) ? Math.max(0, Math.floor(Number(raw.lastVisitDay))) : null,
    revisitCount: Math.max(0, Math.floor(Number(raw.revisitCount) || 0)),
    ecologyRecovery: Math.max(0, Math.min(1, Number(raw.ecologyRecovery) || 0)),
    nextResidentReturnDay: Number.isFinite(raw.nextResidentReturnDay) ? Math.max(0, Math.floor(Number(raw.nextResidentReturnDay))) : null,
    signatureRewardIds: Object.freeze([...(raw.signatureRewardIds ?? [])].filter((entry): entry is string => typeof entry === "string" && entry.length > 0 && entry.length <= 128).slice(-32)),
    revision: Math.max(0, Math.floor(Number(raw.revision) || 0)),
  });
}

/** Records one meaningful site visit per world day without introducing a per-frame scan. */
export function recordLegendarySiteVisit(state: LegendaryEncounterState, worldDay: number) {
  const day = Math.max(0, Math.floor(Number(worldDay) || 0));
  if (state.lastVisitDay === day) return state;
  return Object.freeze({ ...state, lastVisitDay: day, revisitCount: state.revisitCount + (state.lastVisitDay === null ? 0 : 1), revision: state.revision + 1 });
}

/** Advances ecology lazily. Regional residents released or defeated can return only after the authored recovery window; captured residents never duplicate. */
export function advanceLegendarySiteRecovery(state: LegendaryEncounterState, worldDay: number, policy: LegendarySiteRecoveryPolicy) {
  if (state.status !== "resolved" || state.resolvedDay === null) return state;
  const day = Math.max(state.resolvedDay, Math.floor(Number(worldDay) || 0));
  const recoveryDays = Math.max(1, Math.floor(policy.recoveryDays));
  const ecologyRecovery = Math.max(state.ecologyRecovery, Math.min(1, (day - state.resolvedDay) / recoveryDays));
  const canReturn = policy.role === "regional" && state.outcome !== null && policy.reappearAfterOutcomes.includes(state.outcome)
    && state.nextResidentReturnDay !== null && day >= state.nextResidentReturnDay;
  if (canReturn) return Object.freeze({
    ...state,
    status: "dormant" as const,
    stageIndex: 0,
    objectiveProgress: Object.freeze({}),
    eventProofIds: Object.freeze([]),
    outcome: null,
    custodyEntityId: null,
    uniqueResolutionToken: null,
    behaviorPhase: "wary" as const,
    activeBrains: 0 as const,
    proxyMode: true,
    resolvedDay: null,
    ecologyRecovery: 1,
    nextResidentReturnDay: null,
    revision: state.revision + 1,
  });
  if (ecologyRecovery === state.ecologyRecovery) return state;
  return Object.freeze({ ...state, ecologyRecovery, revision: state.revision + 1 });
}

/** Signature rewards are site identities, not a farmable global chest roll. */
export function recordLegendarySignatureReward(state: LegendaryEncounterState, rewardId: string) {
  const id = rewardId.trim().slice(0, 128);
  if (!id || state.signatureRewardIds.includes(id)) return state;
  return Object.freeze({ ...state, signatureRewardIds: Object.freeze([...state.signatureRewardIds, id].slice(-32)), revision: state.revision + 1 });
}

/** Distant sites use one cheap proxy; nearby sites may wake at most two large brains for the whole party. */
export function planLegendarySiteSimulation(state: LegendaryEncounterState, distance: number, requestedBrains: number) {
  const proxyMode = !Number.isFinite(distance) || distance > 72;
  const activeBrains = (proxyMode ? 0 : Math.max(1, Math.min(2, Math.floor(requestedBrains) || 1))) as 0 | 1 | 2;
  if (state.proxyMode === proxyMode && state.activeBrains === activeBrains) return state;
  return Object.freeze({ ...state, proxyMode, activeBrains, revision: state.revision + 1 });
}

export function transitionLegendaryBehavior(state: LegendaryEncounterState, phase: LegendaryBehaviorPhase) {
  if (state.status === "resolved" || state.behaviorPhase === phase) return state;
  const allowed: Readonly<Record<LegendaryBehaviorPhase, readonly LegendaryBehaviorPhase[]>> = Object.freeze({
    wary: ["territorial", "trusting"], territorial: ["defending", "wary", "trusting"], defending: ["frenzied", "exhausted"],
    frenzied: ["exhausted"], exhausted: ["trusting", "territorial"], trusting: ["wary", "territorial"],
  });
  return allowed[state.behaviorPhase].includes(phase) ? Object.freeze({ ...state, behaviorPhase: phase, revision: state.revision + 1 }) : state;
}

export function activateLegendaryEncounter(state: LegendaryEncounterState) {
  return state.status === "dormant" ? Object.freeze({ ...state, status: "active" as const, revision: state.revision + 1 }) : state;
}

export function legendaryStageProgress(state: LegendaryEncounterState) {
  const definition = LEGENDARY_ENCOUNTERS[state.encounterId];
  const current = definition.stages[state.stageIndex];
  const objectives = current.objectives.map((entry) => Object.freeze({ ...entry, current: Math.min(entry.target, state.objectiveProgress[`${current.id}:${entry.id}`] ?? 0) }));
  return Object.freeze({ definition, stage: current, objectives: Object.freeze(objectives), complete: objectives.every((entry) => entry.current >= entry.target) });
}

export function applyLegendaryEvent(state: LegendaryEncounterState, event: Readonly<{ kind: LegendaryEventKind; siteId: string; sourceId: string; amount?: number }>) {
  if (state.status === "resolved") return state;
  if (event.siteId !== state.siteId || !event.sourceId || event.sourceId.length > 192) return state;
  const active = activateLegendaryEncounter(state);
  const proofId = `${event.kind}:${event.sourceId}`;
  if (active.eventProofIds.includes(proofId)) return active;
  const progress = legendaryStageProgress(active);
  let changed = false;
  const objectiveProgress = { ...active.objectiveProgress };
  for (const entry of progress.stage.objectives) if (entry.event === event.kind) {
    const key = `${progress.stage.id}:${entry.id}`;
    objectiveProgress[key] = Math.min(entry.target, (objectiveProgress[key] ?? 0) + Math.max(0, event.amount ?? 1));
    changed = true;
  }
  if (!changed) return active;
  const next = Object.freeze({
    ...active,
    objectiveProgress: Object.freeze(objectiveProgress),
    eventProofIds: Object.freeze([...active.eventProofIds, proofId].slice(-128)),
    revision: active.revision + 1,
  });
  const completed = legendaryStageProgress(next).complete;
  if (!completed || next.stageIndex >= progress.definition.stages.length - 1) return next;
  return Object.freeze({ ...next, stageIndex: next.stageIndex + 1, revision: next.revision + 1 });
}

export function resolveLegendaryEncounter(state: LegendaryEncounterState, outcomeId: LegendaryOutcome, custodyEntityId: string | null = null, worldDay = 0, recoveryPolicy?: LegendarySiteRecoveryPolicy) {
  const progress = legendaryStageProgress(state);
  if (state.status === "resolved" || state.stageIndex !== progress.definition.stages.length - 1 || !progress.complete) return state;
  if (outcomeId === "capture" && !custodyEntityId) return state;
  const token = `${state.siteId}:${state.encounterId}:${outcomeId}`;
  return Object.freeze({
    ...state, status: "resolved" as const, outcome: outcomeId,
    custodyEntityId: outcomeId === "capture" ? custodyEntityId : null,
    uniqueResolutionToken: token,
    worldChanges: Object.freeze([...new Set([...state.worldChanges, progress.definition.worldEcho, progress.definition.outcomes[outcomeId]])]),
    resolvedDay: Math.max(0, Math.floor(Number(worldDay) || 0)),
    ecologyRecovery: 0,
    nextResidentReturnDay: recoveryPolicy?.role === "regional" && recoveryPolicy.reappearAfterOutcomes.includes(outcomeId)
      ? Math.max(0, Math.floor(Number(worldDay) || 0)) + Math.max(1, Math.floor(recoveryPolicy.recoveryDays)) : null,
    revision: state.revision + 1,
  });
}

export function legendaryCanManifest(state: LegendaryEncounterState) {
  // Captured custody is restored from the saved creature itself. A resolved
  // world marker must never manufacture a second body.
  return state.status !== "resolved";
}

export function transferLegendaryCustody(state: LegendaryEncounterState, currentEntityId: string, nextEntityId: string) {
  if (state.outcome !== "capture" || state.custodyEntityId !== currentEntityId || !nextEntityId.trim()) return state;
  return Object.freeze({ ...state, custodyEntityId: nextEntityId.slice(0, 128), revision: state.revision + 1 });
}

export const LEGENDARY_SITE_CELL_CHUNKS = 96;
export type LegendarySiteSample = Readonly<{ height: number; waterline: number; habitatKey: string }>;
export type LegendaryEncounterSite = Readonly<{
  id: string;
  encounterId: LegendaryEncounterId;
  kind: LegendaryCreatureKind;
  center: Readonly<{ x: number; y: number; z: number }>;
  radius: number;
  aquatic: boolean;
  underground: boolean;
  clueCount: number;
}>;

function hash32(value: string) { let result = 2166136261; for (const char of value) result = Math.imul(result ^ char.charCodeAt(0), 16777619); return result >>> 0; }
function unit(seed: string, salt: string) { return hash32(`${seed}|${salt}`) / 4294967296; }

/** One rare, lazy-authored site per 96x96-chunk cell. Up to 32 deterministic
 * probes find the right biome; failure leaves wilderness instead of forcing a
 * legendary into an ecologically incoherent location. */
export function planLegendaryEncounterSite(input: Readonly<{
  seed: string;
  cellX: number;
  cellZ: number;
  sample: (x: number, z: number) => LegendarySiteSample;
}>): LegendaryEncounterSite | null {
  const encounterId = LEGENDARY_ENCOUNTER_ORDER[hash32(`${input.seed}|legendary-kind|${input.cellX}|${input.cellZ}`) % LEGENDARY_ENCOUNTER_ORDER.length];
  const definition = LEGENDARY_ENCOUNTERS[encounterId];
  const cellBlocks = LEGENDARY_SITE_CELL_CHUNKS * 16;
  const originX = input.cellX * cellBlocks;
  const originZ = input.cellZ * cellBlocks;
  for (let probe = 0; probe < 32; probe += 1) {
    const x = originX + 96 + Math.floor(unit(input.seed, `${input.cellX}|${input.cellZ}|${encounterId}|x|${probe}`) * (cellBlocks - 192));
    const z = originZ + 96 + Math.floor(unit(input.seed, `${input.cellX}|${input.cellZ}|${encounterId}|z|${probe}`) * (cellBlocks - 192));
    const sample = input.sample(x, z);
    if (!definition.habitatKeys.includes(sample.habitatKey)) continue;
    const aquatic = encounterId === "reef-that-swims";
    const underground = encounterId === "oath-under-stone";
    if (aquatic && sample.height >= sample.waterline - 8) continue;
    if (!aquatic && sample.height <= sample.waterline + 3) continue;
    const y = aquatic ? sample.height + 3 : underground ? sample.height - 24 : sample.height + 1;
    return Object.freeze({ id: `legendary-site:${input.cellX}:${input.cellZ}:${encounterId}`, encounterId, kind: definition.kind, center: Object.freeze({ x, y, z }), radius: aquatic ? 18 : underground ? 15 : 13, aquatic, underground, clueCount: definition.stages[0].objectives.reduce((sum, entry) => sum + entry.target, 0) });
  }
  return null;
}

export function auditLegendaryEncounterDefinitions() {
  const issues: string[] = [];
  const kinds = new Set<string>();
  for (const id of LEGENDARY_ENCOUNTER_ORDER) {
    const definition = LEGENDARY_ENCOUNTERS[id];
    if (kinds.has(definition.kind)) issues.push(`${id}: duplicate legendary kind`); else kinds.add(definition.kind);
    if (definition.stages.length < 3) issues.push(`${id}: fewer than three encounter stages`);
    if (definition.stages.some((entry) => !entry.objectives.length)) issues.push(`${id}: empty stage`);
    if ((Object.keys(definition.outcomes) as LegendaryOutcome[]).length !== 4) issues.push(`${id}: missing outcome`);
  }
  return Object.freeze({ ok: issues.length === 0, issues: Object.freeze(issues), encounterCount: LEGENDARY_ENCOUNTER_ORDER.length, kindCount: kinds.size });
}
