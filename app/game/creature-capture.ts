import type { CaptureProfileId } from "./creature-profiles";
import type { MobKind } from "./mobs";

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
}>;

/** Research reveals requirements in authored order; mastery never changes the rules. */
export function captureKnowledgeForResearch(kind: MobKind, profileId: CaptureProfileId, researchLevel: number): CreatureCaptureKnowledge {
  if (profileId === "uncapturable") return Object.freeze({ kind, learnedConditions: Object.freeze([]), mastered: researchLevel >= 3 });
  const ordered = CAPTURE_PROFILES[profileId].requirements.flatMap((group) => group.anyOf);
  const count = researchLevel <= 0 ? 0 : researchLevel === 1 ? 1 : researchLevel === 2 ? Math.max(1, Math.ceil(ordered.length / 2)) : ordered.length;
  return Object.freeze({ kind, learnedConditions: Object.freeze(ordered.slice(0, count)), mastered: researchLevel >= 3 });
}

