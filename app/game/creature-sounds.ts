import type { CoreMobKind } from "./mobs";

export type CreatureSoundEvent = "ambient" | "hurt" | "feed" | "tame" | "breed" | "mount";
export type CreatureSoundCue = {
  /** Stable asset stem for generated audio, without an extension. */
  asset: string;
  fallback: "mob" | "attack" | "eat" | "craft";
  gain: number;
  pitchJitter: number;
};

const cue = (asset: string, fallback: CreatureSoundCue["fallback"], gain = 0.75, pitchJitter = 0.08): CreatureSoundCue => ({
  asset,
  fallback,
  gain,
  pitchJitter,
});

/**
 * Event metadata is deliberately independent from the browser audio loader so
 * generated WAV assets can be added without changing creature behavior.
 */
export const CREATURE_SOUND_EVENTS: Partial<Record<CoreMobKind, Partial<Record<CreatureSoundEvent, CreatureSoundCue>>>> = {
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
