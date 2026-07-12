import type { CoreMobKind } from "./mobs";

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

/**
 * Event metadata is deliberately independent from the browser audio loader so
 * generated WAV assets can be added without changing creature behavior.
 */
export const CREATURE_SOUND_EVENTS: Partial<Record<CoreMobKind, Partial<Record<CreatureSoundEvent, CreatureSoundCue>>>> = {
  "wild-horse": NATURAL_HORSE_EVENTS,
  "rimehoof-courser": NATURAL_HORSE_EVENTS,
  "sunscar-courser": NATURAL_HORSE_EVENTS,
  "mirestride-courser": NATURAL_HORSE_EVENTS,
  "starbough-courser": NATURAL_HORSE_EVENTS,
  mistmane: NATURAL_HORSE_EVENTS,
  "deepgear-courser-golem": DEEPGEAR_HORSE_EVENTS,
  ridgeback: {
    ambient: cue("ridgeback-warm-huff", "mob", 0.72, 0.06),
    hurt: cue("ridgeback-stone-bellow", "attack", 0.9, 0.05),
    breed: cue("ridgeback-herd-rumble", "mob", 0.68, 0.04),
  },
  woolhorn: {
    ambient: cue("woolhorn-soft-bleat", "mob", 0.64, 0.09),
    hurt: cue("woolhorn-braced-snort", "attack", 0.78, 0.07),
  },
  shadecrawler: {
    ambient: cue("shadecrawler-stone-chitter", "mob", 0.58, 0.12),
    hurt: cue("shadecrawler-echo-screech", "attack", 0.78, 0.09),
    feed: cue("shadecrawler-curious-clicks", "eat", 0.58, 0.08),
    tame: cue("shadecrawler-bonding-thrum", "craft", 0.8, 0.04),
    mount: cue("shadecrawler-saddle-rumble", "mob", 0.72, 0.04),
  },
  peelop: {
    ambient: cue("peelop-content-chirp", "mob", 0.52, 0.12),
    feed: cue("peelop-happy-nibble", "eat", 0.58, 0.08),
    breed: cue("peelop-pair-chitter", "mob", 0.62, 0.1),
  },
  "lanternshell": {
    ambient: cue("lanternshell-glass-purr", "mob", 0.46, 0.04),
    hurt: cue("lanternshell-shell-clack", "attack", 0.58, 0.05),
  },
  puddlehopper: {
    ambient: cue("puddlehopper-water-plonk", "mob", 0.52, 0.12),
    hurt: cue("puddlehopper-alarm-croak", "attack", 0.68, 0.09),
  },
  reedstrider: {
    ambient: cue("reedstrider-hollow-call", "mob", 0.62, 0.08),
    hurt: cue("reedstrider-wing-bark", "attack", 0.7, 0.08),
  },
};

export function creatureSoundCue(kind: CoreMobKind, event: CreatureSoundEvent): CreatureSoundCue {
  return CREATURE_SOUND_EVENTS[kind]?.[event] ?? cue(`creature-generic-${event}`, event === "hurt" ? "attack" : event === "feed" ? "eat" : "mob", 0.62, 0.1);
}
