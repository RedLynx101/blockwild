import type { LegendaryCreatureKind } from "./mobs";

export type LegendaryEncounterId =
  | "walking-spring"
  | "reef-that-swims"
  | "oath-under-stone"
  | "where-storms-run"
  | "red-banner"
  | "sovereign-feast";
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
  guildId: "waykeeper" | "tideglass" | "deepgear" | "hearthroad" | "brassroot" | "sugarcourt-makers";
  habitatKeys: readonly string[];
  stages: readonly LegendaryStageDefinition[];
  outcomes: Readonly<Record<LegendaryOutcome, string>>;
  worldEcho: string;
}>;

const objective = (id: string, event: LegendaryEventKind, target: number, description: string): LegendaryObjective => Object.freeze({ id, event, target, description });
const stage = (id: string, name: string, description: string, objectives: readonly LegendaryObjective[]): LegendaryStageDefinition => Object.freeze({ id, name, description, objectives: Object.freeze([...objectives]) });
const outcome = (capture: string, covenant: string, release: string, defeat: string) => Object.freeze({ capture, covenant, release, defeat });

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
});

export const LEGENDARY_ENCOUNTER_ORDER = Object.freeze(Object.keys(LEGENDARY_ENCOUNTERS) as LegendaryEncounterId[]);

export type LegendaryEncounterState = Readonly<{
  schema: 1;
  encounterId: LegendaryEncounterId;
  siteId: string;
  status: "dormant" | "active" | "resolved";
  stageIndex: number;
  objectiveProgress: Readonly<Record<string, number>>;
  outcome: LegendaryOutcome | null;
  custodyEntityId: string | null;
  uniqueResolutionToken: string | null;
  worldChanges: readonly string[];
  revision: number;
}>;

export function createLegendaryEncounterState(encounterId: LegendaryEncounterId, siteId: string): LegendaryEncounterState {
  return Object.freeze({ schema: 1, encounterId, siteId, status: "dormant", stageIndex: 0, objectiveProgress: Object.freeze({}), outcome: null, custodyEntityId: null, uniqueResolutionToken: null, worldChanges: Object.freeze([]), revision: 0 });
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
    outcome: outcomeValue,
    custodyEntityId: typeof raw.custodyEntityId === "string" ? raw.custodyEntityId.slice(0, 128) : null,
    uniqueResolutionToken: typeof raw.uniqueResolutionToken === "string" ? raw.uniqueResolutionToken.slice(0, 192) : null,
    worldChanges: Object.freeze([...(raw.worldChanges ?? [])].filter((entry): entry is string => typeof entry === "string").slice(-32)),
    revision: Math.max(0, Math.floor(Number(raw.revision) || 0)),
  });
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

export function applyLegendaryEvent(state: LegendaryEncounterState, event: Readonly<{ kind: LegendaryEventKind; amount?: number }>) {
  if (state.status === "resolved") return state;
  const active = activateLegendaryEncounter(state);
  const progress = legendaryStageProgress(active);
  let changed = false;
  const objectiveProgress = { ...active.objectiveProgress };
  for (const entry of progress.stage.objectives) if (entry.event === event.kind) {
    const key = `${progress.stage.id}:${entry.id}`;
    objectiveProgress[key] = Math.min(entry.target, (objectiveProgress[key] ?? 0) + Math.max(0, event.amount ?? 1));
    changed = true;
  }
  if (!changed) return active;
  const next = Object.freeze({ ...active, objectiveProgress: Object.freeze(objectiveProgress), revision: active.revision + 1 });
  const completed = legendaryStageProgress(next).complete;
  if (!completed || next.stageIndex >= progress.definition.stages.length - 1) return next;
  return Object.freeze({ ...next, stageIndex: next.stageIndex + 1, revision: next.revision + 1 });
}

export function resolveLegendaryEncounter(state: LegendaryEncounterState, outcomeId: LegendaryOutcome, custodyEntityId: string | null = null) {
  const progress = legendaryStageProgress(state);
  if (state.status === "resolved" || state.stageIndex !== progress.definition.stages.length - 1 || !progress.complete) return state;
  if (outcomeId === "capture" && !custodyEntityId) return state;
  const token = `${state.siteId}:${state.encounterId}:${outcomeId}`;
  return Object.freeze({
    ...state, status: "resolved" as const, outcome: outcomeId,
    custodyEntityId: outcomeId === "capture" ? custodyEntityId : null,
    uniqueResolutionToken: token,
    worldChanges: Object.freeze([...new Set([...state.worldChanges, progress.definition.worldEcho, progress.definition.outcomes[outcomeId]])]),
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
