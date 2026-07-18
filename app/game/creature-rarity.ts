import type { MobKind } from "./mobs";
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
  const completed = [...new Set([...(state.completedClues ?? []), clue])].slice(0, PRIME_ROUTE_REQUIRED_CLUES);
  if (completed.length === (state.completedClues?.length ?? 0)) return state;
  return Object.freeze({
    ...state,
    status: state.status === "active" ? "observed" : state.status,
    completedClues: Object.freeze(completed),
    routeProgress: completed.length,
    lastUpdatedAt: Math.max(state.lastUpdatedAt, now),
  });
}

export function primeEncounterRouteComplete(state: PrimeEncounterState | null | undefined) {
  return (state?.routeProgress ?? state?.completedClues?.length ?? 0) >= PRIME_ROUTE_REQUIRED_CLUES;
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
      ...(clues.length ? { completedClues: Object.freeze(clues), routeProgress: clues.length } : {}),
    }));
  }
  return states;
}
