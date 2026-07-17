import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";
import {
  ENVIRONMENT_LOOP_SAMPLES,
  MAX_ACTIVE_SAMPLE_VOICES,
  SAMPLE_ASSETS,
  SynthAudio,
  audioTargetChanged,
  effectiveMusicVolume,
  environmentCrossfadeTimeConstant,
  environmentLoopMix,
  spatialAttenuation,
  spatialVoiceEvictionIndex,
} from "../app/game/audio.ts";

test("music has an independent normalized slider while master and mute remain authoritative", () => {
  assert.equal(effectiveMusicVolume({ volume: 1, musicVolume: 0, muted: false }), 0);
  assert.equal(effectiveMusicVolume({ volume: 1, musicVolume: 1, muted: true }), 0);
  assert.ok(effectiveMusicVolume({ volume: 0.5, musicVolume: 1, muted: false }) < effectiveMusicVolume({ volume: 1, musicVolume: 1, muted: false }));
  assert.equal(effectiveMusicVolume({ volume: 1, muted: false }), effectiveMusicVolume({ volume: 1, musicVolume: 0.72, muted: false }));
});

test("every authored sound has a stable public asset mapping and every environment loop is wired", () => {
  const mappedSources = new Set(Object.values(SAMPLE_ASSETS).map(({ source }) => source));
  for (const [kind, definition] of Object.entries(SAMPLE_ASSETS)) {
    assert.ok(definition.source.startsWith("/sfx/"), `${kind} should stay in the semantic sfx namespace`);
    assert.ok(existsSync(resolve("public", definition.source.slice(1))), `${kind} should resolve to ${definition.source}`);
    assert.ok(definition.gain > 0 && definition.gain <= 1, `${kind} should use a normalized base gain`);
  }
  assert.equal(mappedSources.size, Object.keys(SAMPLE_ASSETS).length, "sound mappings should not accidentally alias assets");
  const authoredFiles = readdirSync(resolve("public", "sfx"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.(?:wav|mp3)$/i.test(entry.name))
    .map((entry) => `/sfx/${entry.name}`);
  assert.deepEqual(new Set(mappedSources), new Set(authoredFiles), "every pushed sound asset should be wired into the runtime manifest");
  assert.deepEqual(new Set(Object.keys(ENVIRONMENT_LOOP_SAMPLES)), new Set(["rain", "crickets", "wind", "winterWind", "cave", "ocean", "swimming"]));
});

test("night cricket ambience uses the requested half-volume mix", () => {
  assert.equal(SAMPLE_ASSETS.nightCrickets.gain, 0.12);
});

test("rain and direct player damage use their requested quieter authored mixes", () => {
  assert.equal(SAMPLE_ASSETS.lightRain.gain, 0.357, "rain should be exactly fifteen percent below the previous 0.42 mix");
  assert.deepEqual(SAMPLE_ASSETS.playerDirectDamage, {
    source: "/sfx/player-direct-damage.wav",
    gain: 0.64,
  });
});

test("mechanical creature sample keys resolve to balanced semantic one-shots", () => {
  assert.deepEqual({
    metalBreath: SAMPLE_ASSETS.dwarvenAutomatonMetalBreath,
    metallicBark: SAMPLE_ASSETS.clockworkHoundMetallicBark,
    steamA: SAMPLE_ASSETS.dwarvenAutomatonSteamReleaseA,
    steamB: SAMPLE_ASSETS.dwarvenAutomatonSteamReleaseB,
  }, {
    metalBreath: { source: "/sfx/dwarven-automaton-metal-breath.wav", gain: 0.5 },
    metallicBark: { source: "/sfx/clockwork-hound-metallic-bark.wav", gain: 0.56 },
    steamA: { source: "/sfx/dwarven-automaton-steam-release-a.wav", gain: 0.62 },
    steamB: { source: "/sfx/dwarven-automaton-steam-release-b.wav", gain: 0.64 },
  });
});

test("inverse spatial rolloff is stable, clamped, and monotonic", () => {
  assert.equal(spatialAttenuation(0, 2, 48, 1.15), 1);
  assert.equal(spatialAttenuation(2, 2, 48, 1.15), 1);
  const near = spatialAttenuation(8, 2, 48, 1.15);
  const far = spatialAttenuation(32, 2, 48, 1.15);
  assert.ok(near > far && far > 0);
  assert.equal(spatialAttenuation(999, 2, 48, 1.15), spatialAttenuation(48, 2, 48, 1.15));
});

test("bounded voice lifecycle retires a far spatial call before a recent local cue", () => {
  assert.equal(MAX_ACTIVE_SAMPLE_VOICES, 32);
  const index = spatialVoiceEvictionIndex([
    { distance: 0, startedAt: 3, spatial: false },
    { distance: 8, startedAt: 1, spatial: true },
    { distance: 44, startedAt: 2, spatial: true },
  ]);
  assert.equal(index, 2);
  assert.equal(spatialVoiceEvictionIndex([]), -1);
});

test("spatial PannerNodes return to a bounded pool and the runtime caps active one-shots", () => {
  const parameter = () => ({
    value: 0,
    setValueAtTime(value: number) { this.value = value; },
  });
  const node = () => ({
    connect<T>(destination: T) { return destination; },
    disconnect() { /* tracked by the audio runtime */ },
  });
  const sources: AudioBufferSourceNode[] = [];
  let pannersCreated = 0;
  const context = {
    currentTime: 2,
    state: "running",
    createBufferSource() {
      const source = {
        ...node(),
        buffer: null,
        playbackRate: { value: 1 },
        detune: { value: 0 },
        onended: null,
        start() { /* deterministic no-op */ },
        stop() { /* cleanup is owned by SynthAudio */ },
      } as unknown as AudioBufferSourceNode;
      sources.push(source);
      return source;
    },
    createGain() { return { ...node(), gain: parameter() } as unknown as GainNode; },
    createPanner() {
      pannersCreated += 1;
      return {
        ...node(),
        panningModel: "equalpower",
        distanceModel: "inverse",
        refDistance: 1,
        maxDistance: 10_000,
        rolloffFactor: 1,
        coneInnerAngle: 360,
        coneOuterAngle: 360,
        positionX: parameter(),
        positionY: parameter(),
        positionZ: parameter(),
      } as unknown as PannerNode;
    },
  } as unknown as AudioContext;
  const audio = new SynthAudio({ volume: 1, muted: false });
  audio.context = context;
  audio.master = { ...node(), gain: parameter() } as unknown as GainNode;
  audio.startSample("birdChirp", {} as AudioBuffer, { position: [4, 0, 0] });
  assert.equal(audio.activeSamples.size, 1);
  sources[0].onended?.(new Event("ended"));
  assert.equal(audio.activeSamples.size, 0);
  assert.equal(audio.spatialVoicePool.length, 1);
  audio.startSample("birdChirp", {} as AudioBuffer, { position: [5, 0, 0] });
  assert.equal(pannersCreated, 1, "the second positional cue should reuse its PannerNode");
  for (let index = 0; index < MAX_ACTIVE_SAMPLE_VOICES + 6; index += 1) {
    audio.startSample("uiTap", {} as AudioBuffer, {});
  }
  assert.equal(audio.activeSamples.size, MAX_ACTIVE_SAMPLE_VOICES);
});

test("environment selection crossfades coherent outdoor, cave, ocean, and winter beds", () => {
  const rainyNight = environmentLoopMix({ rain: 0.8, skyExposure: 1, night: 1, wind: 0.5, winter: 0, cave: 0, ocean: 0, swimming: 0 });
  assert.equal(rainyNight.rain, 0.8);
  assert.ok(rainyNight.crickets > 0 && rainyNight.crickets < 0.5, "rain should naturally duck, not hard-cut, crickets");
  const cave = environmentLoopMix({ rain: 1, skyExposure: 0, night: 0, wind: 1, winter: 0, cave: 1, ocean: 0, swimming: 0 });
  assert.deepEqual(cave, { rain: 0, crickets: 0, wind: 0, winterWind: 0, cave: 1, ocean: 0, swimming: 0 });
  const winterCoast = environmentLoopMix({ rain: 0, skyExposure: 1, night: 0, wind: 0.7, winter: 1, cave: 0, ocean: 0.8, swimming: 0.6 });
  assert.equal(winterCoast.wind, 0);
  assert.ok(winterCoast.winterWind > 0 && winterCoast.ocean > 0 && winterCoast.swimming > 0);
  assert.ok(environmentCrossfadeTimeConstant(0.1, 0.8) < environmentCrossfadeTimeConstant(0.8, 0.1), "ambience should arrive faster than it fades away");
});

test("steady ambience and depth targets do not reschedule WebAudio automation", () => {
  const scheduled: Array<{ channel: string; target: number }> = [];
  const parameter = (channel: string) => ({
    value: 0,
    setTargetAtTime(target: number) { scheduled.push({ channel, target }); },
  }) as unknown as AudioParam;
  const gain = (channel: string) => ({ gain: parameter(channel) }) as GainNode;
  const audio = new SynthAudio({ volume: 1, muted: false });
  audio.context = { currentTime: 3, state: "running" } as AudioContext;
  audio.ambienceGain = gain("depth");
  audio.rainGain = gain("rain");
  audio.environmentGains.set("wind", gain("wind"));
  audio.environmentSources.set("wind", {} as AudioBufferSourceNode);

  audio.setDepth(12, 0.5);
  audio.setDepth(12, 0.5);
  audio.setDepth(12, 0.5005);
  assert.equal(scheduled.filter(({ channel }) => channel === "depth").length, 1);
  assert.equal(scheduled.filter(({ channel }) => channel === "rain").length, 1);

  const environment = (wind: number) => ({ rain: 0, skyExposure: 1, night: 0, wind, winter: 0, cave: 0, ocean: 0, swimming: 0 });
  audio.setEnvironment(environment(0.8));
  audio.setEnvironment(environment(0.8));
  audio.setEnvironment(environment(0.8005));
  audio.setEnvironment(environment(0.9));
  assert.equal(scheduled.filter(({ channel }) => channel === "wind").length, 2);
  assert.equal(audioTargetChanged(0.8, 0.8005), false);
  assert.equal(audioTargetChanged(0.8, 0.9), true);
});

test("music mixing touches only the active or fading scene", () => {
  const audio = new SynthAudio({ volume: 1, musicVolume: 1, muted: false });
  const base = effectiveMusicVolume(audio.settings);
  const element = (initialVolume: number, initiallyPaused: boolean) => {
    let volume = initialVolume;
    let paused = initiallyPaused;
    let writes = 0;
    const value = {
      get volume() { return volume; },
      set volume(next: number) { writes += 1; volume = next; },
      get paused() { return paused; },
      pause() { paused = true; },
    } as unknown as HTMLAudioElement;
    return { value, writes: () => writes };
  };
  const active = element(base, false);
  const fading = element(0.2, false);
  const dormant = element(0, true);
  audio.music.set("day", active.value);
  audio.music.set("night", fading.value);
  audio.music.set("sea", dormant.value);

  audio.mixMusic(false, 0.25);
  assert.equal(active.writes(), 0, "an active scene already at target should not receive a redundant media write");
  assert.equal(dormant.writes(), 0, "a silent paused scene should stay outside the mix loop");
  assert.equal(fading.writes(), 1, "the outgoing scene must continue its fade");
});

test("engine integration updates the listener and routes authored cues through world events", () => {
  const engine = readFileSync(resolve("app", "game", "engine.ts"), "utf8");
  for (const hook of [
    "this.audio.setListenerPose?.(this.camera.position, listenerForward, listenerUp)",
    "this.audio.setEnvironment?.({",
    "this.audio.playAchievement?.()",
    "position: mob.group.position",
    'this.audio.playSample("humanoidSigh"',
    'this.audio.playSample("scaryGrumble"',
    'this.audio.playDragon(state.type, plan.kind, state.stage, origin)',
    'this.playCreatureEvent(mob, "attack")',
  ]) assert.ok(engine.includes(hook), `engine should retain the ${hook} audio integration`);
});
