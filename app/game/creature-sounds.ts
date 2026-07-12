import type { CoreMobKind } from "./mobs";
import type { SampleKind } from "./audio";

export type CreatureSoundEvent = "ambient" | "hurt" | "feed" | "tame" | "breed" | "mount";
export type CreatureSoundCue = {
  /** Stable asset stem for generated audio, without an extension. */
  asset: string;
  /** Alternate stems chosen per call so repeated wildlife does not sound cloned. */
  variants?: readonly string[];
  fallback: "mob" | "attack" | "eat" | "craft";
  gain: number;
  pitchJitter: number;
};

const cue = (asset: string, fallback: CreatureSoundCue["fallback"], gain = 0.75, pitchJitter = 0.08, variants?: readonly string[]): CreatureSoundCue => ({
  asset,
  ...(variants?.length ? { variants } : {}),
  fallback,
  gain,
  pitchJitter,
});

const NATURAL_HORSE_EVENTS = Object.freeze({
  ambient: cue("horse-whinny-a", "mob", 0.78, 0.045, ["horse-whinny-b"]),
  hurt: cue("horse-whinny-b", "attack", 0.82, 0.035, ["horse-whinny-a"]),
  feed: cue("horse-whinny-a", "eat", 0.52, 0.055, ["horse-whinny-b"]),
  tame: cue("horse-whinny-b", "craft", 0.8, 0.025, ["horse-whinny-a"]),
  breed: cue("horse-whinny-a", "mob", 0.68, 0.04, ["horse-whinny-b"]),
  mount: cue("horse-whinny-b", "mob", 0.62, 0.03, ["horse-whinny-a"]),
} satisfies Partial<Record<CreatureSoundEvent, CreatureSoundCue>>);

const DEEPGEAR_HORSE_EVENTS = Object.freeze({
  ambient: cue("deepgear-courser-whinny", "mob", 0.74, 0.025),
  hurt: cue("deepgear-courser-whinny", "attack", 0.82, 0.018),
  feed: cue("deepgear-courser-whinny", "craft", 0.5, 0.012),
  tame: cue("deepgear-courser-whinny", "craft", 0.78, 0.012),
  mount: cue("deepgear-courser-whinny", "mob", 0.62, 0.016),
} satisfies Partial<Record<CreatureSoundEvent, CreatureSoundCue>>);

const GRAZER_EVENTS = Object.freeze({
  ambient: cue("ridgeback-warm-huff", "mob", 0.58, 0.13),
  hurt: cue("horse-whinny-b", "attack", 0.68, 0.11),
  feed: cue("ridgeback-warm-huff", "eat", 0.42, 0.14),
  breed: cue("horse-whinny-a", "mob", 0.52, 0.12),
} satisfies Partial<Record<CreatureSoundEvent, CreatureSoundCue>>);

const SMALL_CRITTER_EVENTS = Object.freeze({
  ambient: cue("bird-chirp", "mob", 0.42, 0.18),
  hurt: cue("bird-chirp", "attack", 0.52, 0.14),
  feed: cue("bird-chirp", "eat", 0.36, 0.2),
  breed: cue("bird-chirp", "mob", 0.4, 0.18),
} satisfies Partial<Record<CreatureSoundEvent, CreatureSoundCue>>);

const WILDCAT_EVENTS = Object.freeze({
  ambient: cue("cat-call-a", "mob", 0.58, 0.1, ["cat-call-b"]),
  hurt: cue("cat-call-b", "attack", 0.7, 0.08, ["cat-call-a"]),
  feed: cue("cat-call-a", "eat", 0.4, 0.12),
  breed: cue("cat-call-b", "mob", 0.48, 0.1),
} satisfies Partial<Record<CreatureSoundEvent, CreatureSoundCue>>);

const DEEP_CREATURE_EVENTS = Object.freeze({
  ambient: cue("dragon-ambient-deep-growl", "mob", 0.46, 0.12),
  hurt: cue("dragon-ambient-deep-growl", "attack", 0.6, 0.09),
} satisfies Partial<Record<CreatureSoundEvent, CreatureSoundCue>>);

/**
 * Event metadata is deliberately independent from the browser audio loader so
 * generated WAV assets can be added without changing creature behavior.
 */
export const CREATURE_SOUND_EVENTS: Partial<Record<CoreMobKind, Partial<Record<CreatureSoundEvent, CreatureSoundCue>>>> = {
  mossling: SMALL_CRITTER_EVENTS,
  "boglantern-mossling": SMALL_CRITTER_EVENTS,
  "cindercone-mossling": SMALL_CRITTER_EVENTS,
  "moonbloom-mossling": SMALL_CRITTER_EVENTS,
  "meadow-cottontail": SMALL_CRITTER_EVENTS,
  "russet-rabbit": SMALL_CRITTER_EVENTS,
  "frost-hare": SMALL_CRITTER_EVENTS,
  "chocolate-bunny": SMALL_CRITTER_EVENTS,
  burrowbell: SMALL_CRITTER_EVENTS,
  sakurakit: SMALL_CRITTER_EVENTS,
  "pebbletortoise": { ambient: cue("crab-chitter", "mob", 0.32, 0.16), hurt: cue("crab-chitter", "attack", 0.46, 0.12) },
  "reefglide-terrapin": { ambient: cue("crab-chitter", "mob", 0.28, 0.13), hurt: cue("crab-chitter", "attack", 0.44, 0.1) },
  "sunstep-grazer": GRAZER_EVENTS,
  "meadow-cow": GRAZER_EVENTS,
  "sunbloom-longhorn": GRAZER_EVENTS,
  taffalo: GRAZER_EVENTS,
  brambleboar: GRAZER_EVENTS,
  "dewback-tapir": GRAZER_EVENTS,
  thimbledeer: NATURAL_HORSE_EVENTS,
  "frostlace-hart": NATURAL_HORSE_EVENTS,
  "reedcrown-deer": NATURAL_HORSE_EVENTS,
  glimmerhart: NATURAL_HORSE_EVENTS,
  petalfox: WILDCAT_EVENTS,
  "emberbrush-fox": WILDCAT_EVENTS,
  "moonpetal-fox": WILDCAT_EVENTS,
  "deepwater-shark": DEEP_CREATURE_EVENTS,
  dreadcoil: DEEP_CREATURE_EVENTS,
  "worldshell-leviathan": DEEP_CREATURE_EVENTS,
  "aetherbell-larva": DEEP_CREATURE_EVENTS,
  "aetherbell-leviathan": DEEP_CREATURE_EVENTS,
  "wild-horse": NATURAL_HORSE_EVENTS,
  "rimehoof-courser": NATURAL_HORSE_EVENTS,
  "sunscar-courser": NATURAL_HORSE_EVENTS,
  "mirestride-courser": NATURAL_HORSE_EVENTS,
  "starbough-courser": NATURAL_HORSE_EVENTS,
  mistmane: NATURAL_HORSE_EVENTS,
  "deepgear-courser-golem": DEEPGEAR_HORSE_EVENTS,
  emberjay: {
    ambient: cue("emberjay-squawk", "mob", 0.78, 0.055),
    hurt: cue("emberjay-squawk", "attack", 0.86, 0.035),
    feed: cue("bird-chirp", "eat", 0.5, 0.08),
    breed: cue("bird-chirp", "mob", 0.62, 0.07),
  },
  "canopy-lark": {
    ambient: cue("canopy-lark-call", "mob", 0.74, 0.075),
    hurt: cue("canopy-lark-call", "attack", 0.82, 0.045),
    feed: cue("bird-chirp", "eat", 0.5, 0.08),
    breed: cue("bird-chirp", "mob", 0.62, 0.07),
  },
  "tidewing-gull": {
    ambient: cue("tidewing-gull-call-a", "mob", 0.72, 0.045, ["tidewing-gull-call-b"]),
    hurt: cue("tidewing-gull-call-b", "attack", 0.8, 0.03, ["tidewing-gull-call-a"]),
    feed: cue("bird-chirp", "eat", 0.46, 0.06),
    breed: cue("bird-chirp", "mob", 0.58, 0.06),
  },
  frostquill: {
    ambient: cue("bird-chirp", "mob", 0.66, 0.09),
    hurt: cue("bird-chirp", "attack", 0.76, 0.06),
    feed: cue("bird-chirp", "eat", 0.48, 0.08),
    breed: cue("bird-chirp", "mob", 0.6, 0.08),
  },
  "sunwash-crab": {
    ambient: cue("crab-chitter", "mob", 0.64, 0.07),
    hurt: cue("crab-chitter", "attack", 0.76, 0.05),
  },
  "tideglass-crab": {
    ambient: cue("crab-chitter", "mob", 0.58, 0.045),
    hurt: cue("crab-chitter", "attack", 0.72, 0.035),
  },
  "praline-cat": {
    ambient: cue("cat-call-a", "mob", 0.72, 0.045, ["cat-call-b"]),
    hurt: cue("cat-call-b", "attack", 0.8, 0.03, ["cat-call-a"]),
    feed: cue("cat-call-a", "eat", 0.5, 0.06, ["cat-call-b"]),
    tame: cue("cat-call-b", "craft", 0.7, 0.035, ["cat-call-a"]),
    breed: cue("cat-call-a", "mob", 0.6, 0.05, ["cat-call-b"]),
  },
  "bramblewhisk-cat": {
    ambient: cue("cat-call-a", "mob", 0.68, 0.06, ["cat-call-b"]),
    hurt: cue("cat-call-b", "attack", 0.78, 0.04, ["cat-call-a"]),
    feed: cue("cat-call-a", "eat", 0.48, 0.07, ["cat-call-b"]),
    tame: cue("cat-call-b", "craft", 0.68, 0.045, ["cat-call-a"]),
    breed: cue("cat-call-a", "mob", 0.58, 0.06, ["cat-call-b"]),
  },
  "taffy-hound": {
    ambient: cue("hound-call-a", "mob", 0.72, 0.045, ["hound-call-b"]),
    hurt: cue("hound-call-b", "attack", 0.82, 0.03, ["hound-call-a"]),
    feed: cue("hound-call-a", "eat", 0.5, 0.055, ["hound-call-b"]),
    tame: cue("hound-call-b", "craft", 0.72, 0.035, ["hound-call-a"]),
    breed: cue("hound-call-a", "mob", 0.62, 0.045, ["hound-call-b"]),
  },
  "rimecoat-hound": {
    ambient: cue("hound-call-a", "mob", 0.7, 0.055, ["hound-call-b"]),
    hurt: cue("hound-call-b", "attack", 0.8, 0.04, ["hound-call-a"]),
    feed: cue("hound-call-a", "eat", 0.48, 0.065, ["hound-call-b"]),
    tame: cue("hound-call-b", "craft", 0.7, 0.045, ["hound-call-a"]),
    breed: cue("hound-call-a", "mob", 0.6, 0.055, ["hound-call-b"]),
  },
  ridgeback: {
    ambient: cue("ridgeback-warm-huff", "mob", 0.72, 0.06),
    hurt: cue("ridgeback-stone-bellow", "attack", 0.9, 0.05),
    breed: cue("ridgeback-herd-rumble", "mob", 0.68, 0.04),
  },
  woolhorn: {
    ambient: cue("ridgeback-warm-huff", "mob", 0.56, 0.16),
    hurt: cue("horse-whinny-b", "attack", 0.66, 0.13),
  },
  shadecrawler: {
    ambient: cue("shadecrawler-stone-chitter", "mob", 0.58, 0.12),
    hurt: cue("shadecrawler-echo-screech", "attack", 0.78, 0.09),
    feed: cue("shadecrawler-curious-clicks", "eat", 0.58, 0.08),
    tame: cue("shadecrawler-bonding-thrum", "craft", 0.8, 0.04),
    mount: cue("shadecrawler-saddle-rumble", "mob", 0.72, 0.04),
  },
  peelop: {
    ambient: cue("bird-chirp", "mob", 0.44, 0.18),
    feed: cue("bird-chirp", "eat", 0.38, 0.2),
    breed: cue("bird-chirp", "mob", 0.46, 0.17),
  },
  "lanternshell": {
    ambient: cue("crab-chitter", "mob", 0.3, 0.12),
    hurt: cue("crab-chitter", "attack", 0.44, 0.1),
  },
  puddlehopper: {
    ambient: cue("puddlehopper-croak", "mob", 0.66, 0.1),
    hurt: cue("puddlehopper-croak", "attack", 0.76, 0.065),
  },
  reedstrider: {
    ambient: cue("reedstrider-call", "mob", 0.66, 0.055),
    hurt: cue("reedstrider-call", "attack", 0.74, 0.04),
  },
  "copper-mole": {
    ambient: cue("copper-mole-sniff", "mob", 0.54, 0.08),
    hurt: cue("copper-mole-sniff", "attack", 0.64, 0.06),
  },
  warg: {
    ambient: cue("warg-deep-growl", "mob", 0.58, 0.045),
    hurt: cue("warg-deep-growl", "attack", 0.72, 0.035),
  },
};

/** Only mapped stems resolve to loaded audio files; other cues use synth fallbacks. */
export const CREATURE_SAMPLE_BY_ASSET = Object.freeze({
  "ridgeback-warm-huff": "ridgebackWarmHuff",
  "shadecrawler-stone-chitter": "shadecrawlerStoneChitter",
  "horse-whinny-a": "horseWhinnyA",
  "horse-whinny-b": "horseWhinnyB",
  "deepgear-courser-whinny": "deepgearCourserWhinny",
  "emberjay-squawk": "emberjaySquawk",
  "bird-chirp": "birdChirp",
  "canopy-lark-call": "canopyLarkCall",
  "tidewing-gull-call-a": "tidewingGullCallA",
  "tidewing-gull-call-b": "tidewingGullCallB",
  "cat-call-a": "catCallA",
  "cat-call-b": "catCallB",
  "hound-call-a": "houndCallA",
  "hound-call-b": "houndCallB",
  "crab-chitter": "crabChitter",
  "puddlehopper-croak": "puddlehopperCroak",
  "copper-mole-sniff": "copperMoleSniff",
  "reedstrider-call": "reedstriderCall",
  "warg-deep-growl": "wargDeepGrowl",
  "dragon-ambient-deep-growl": "dragonAmbientGrowl",
} as const satisfies Readonly<Record<string, SampleKind>>);

export function creatureHasCustomSound(kind: CoreMobKind) {
  const events = CREATURE_SOUND_EVENTS[kind];
  return Object.values(events ?? {}).some((sound) => [sound.asset, ...(sound.variants ?? [])]
    .some((asset) => asset in CREATURE_SAMPLE_BY_ASSET));
}

export function creatureSoundCue(kind: CoreMobKind, event: CreatureSoundEvent): CreatureSoundCue {
  return CREATURE_SOUND_EVENTS[kind]?.[event] ?? cue(`creature-generic-${event}`, event === "hurt" ? "attack" : event === "feed" ? "eat" : "mob", 0.62, 0.1);
}
