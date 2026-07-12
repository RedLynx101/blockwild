import { BLOCKS, BlockId } from "./data";

export type AudioSettings = { volume: number; muted: boolean; musicVolume?: number };
export type SoundKind = "step" | "mine" | "break" | "place" | "pickup" | "jump" | "fall" | "land" | "hurt" | "ui" | "attack" | "mob" | "craft" | "furnace" | "splash" | "eat";
export type MusicScene =
  | "day"
  | "hoppin"
  | "night"
  | "sea"
  | "deepSea"
  | "skyboss"
  | "combatA"
  | "combatB"
  | "wildwoodA"
  | "wildwoodB"
  | "fernlight"
  | "meadowglass"
  | "emberdeepA"
  | "emberdeepB"
  | "hobbitSettlement"
  | "goblinSettlement"
  | "atlantianSettlement"
  | "woodElfSettlement"
  | "dwarfSettlement";
export type SampleKind =
  | "swordSwing"
  | "zombieMoan1"
  | "zombieMoan2"
  | "chestOpen"
  | "chestClose"
  | "ridgebackWarmHuff"
  | "shadecrawlerStoneChitter"
  | "horseWhinnyA"
  | "horseWhinnyB"
  | "deepgearCourserWhinny"
  | "emberjaySquawk"
  | "birdChirp"
  | "canopyLarkCall"
  | "tidewingGullCallA"
  | "tidewingGullCallB"
  | "catCallA"
  | "catCallB"
  | "houndCallA"
  | "houndCallB"
  | "crabChitter";
export type SamplePlaybackOptions = { gain?: number; playbackRate?: number; detune?: number; when?: number };
export type DragonSoundType = "fire" | "ice" | "steel" | "sea";
export type DragonSoundEvent = "ambient" | "roar" | "hurt" | "death" | "wing" | "melee" | "breath" | "projectile" | "egg-crack";
export type SpellSoundSchool = "destruction" | "restoration" | "alteration" | "conjuration" | "utility";

const MUSIC_TRACKS: Record<MusicScene, string | readonly string[]> = {
  day: "/music/blockwild-theme.mp3",
  hoppin: "/music/blockwild-hoppin.mp3",
  night: "/music/blockwild-night.mp3",
  sea: [
    "/music/blockwild-sea.mp3",
    "/music/blockwild-tidelight-shelf-a.mp3",
    "/music/blockwild-tidelight-shelf-b.mp3",
  ],
  deepSea: [
    "/music/blockwild-lantern-sea-a.mp3",
    "/music/blockwild-lantern-sea-b.mp3",
  ],
  skyboss: "/music/blockwild-skyboss.mp3",
  combatA: "/music/blockwild-ironbloom-skirmish-a.mp3",
  combatB: "/music/blockwild-ironbloom-skirmish-b.mp3",
  wildwoodA: "/music/blockwild-wildwood-dawn-a.mp3",
  wildwoodB: "/music/blockwild-wildwood-dawn-b.mp3",
  fernlight: "/music/blockwild-fernlight-ramble.mp3",
  meadowglass: "/music/blockwild-meadowglass-morning.mp3",
  emberdeepA: "/music/blockwild-emberdeep-a.mp3",
  emberdeepB: "/music/blockwild-emberdeep-b.mp3",
  hobbitSettlement: [
    "/music/blockwild-hearthroad-home-a.mp3",
    "/music/blockwild-hearthroad-home-b.mp3",
  ],
  goblinSettlement: [
    "/music/blockwild-brassroot-market-a.mp3",
    "/music/blockwild-brassroot-market-b.mp3",
  ],
  atlantianSettlement: [
    "/music/blockwild-lantern-sea-a.mp3",
    "/music/blockwild-lantern-sea-b.mp3",
  ],
  woodElfSettlement: "/music/13_blockwild_moonbough_lanterns.mp3",
  dwarfSettlement: "/music/14_blockwild_deepgear_hearth.mp3",
};

const SAMPLES: Record<SampleKind, { source: string; gain: number }> = {
  swordSwing: { source: "/sfx/sword-swing-1.wav", gain: 0.72 },
  zombieMoan1: { source: "/sfx/zombie-moan-1.wav", gain: 0.5 },
  zombieMoan2: { source: "/sfx/zombie-moan-2.wav", gain: 0.28 },
  chestOpen: { source: "/sfx/chest-open.wav", gain: 0.72 },
  chestClose: { source: "/sfx/chest-close.wav", gain: 0.58 },
  ridgebackWarmHuff: { source: "/sfx/ridgeback-warm-huff.mp3", gain: 0.62 },
  shadecrawlerStoneChitter: { source: "/sfx/shadecrawler-stone-chitter.mp3", gain: 0.52 },
  horseWhinnyA: { source: "/sfx/horse-whinny-a.wav", gain: 0.74 },
  horseWhinnyB: { source: "/sfx/horse-whinny-b.wav", gain: 0.78 },
  deepgearCourserWhinny: { source: "/sfx/deepgear-courser-whinny.wav", gain: 0.72 },
  emberjaySquawk: { source: "/sfx/emberjay-squawk.wav", gain: 0.76 },
  birdChirp: { source: "/sfx/bird-chirp.wav", gain: 0.7 },
  canopyLarkCall: { source: "/sfx/canopy-lark-call.wav", gain: 0.72 },
  tidewingGullCallA: { source: "/sfx/tidewing-gull-call-a.wav", gain: 0.68 },
  tidewingGullCallB: { source: "/sfx/tidewing-gull-call-b.wav", gain: 0.72 },
  catCallA: { source: "/sfx/cat-call-a.wav", gain: 0.72 },
  catCallB: { source: "/sfx/cat-call-b.wav", gain: 0.75 },
  houndCallA: { source: "/sfx/hound-call-a.wav", gain: 0.7 },
  houndCallB: { source: "/sfx/hound-call-b.wav", gain: 0.73 },
  crabChitter: { source: "/sfx/crab-chitter.wav", gain: 0.68 },
};
const MUSIC_FALLBACKS: Partial<Record<MusicScene, string>> = {
  combatA: "/music/blockwild-skyboss.mp3",
  combatB: "/music/blockwild-skyboss.mp3",
};

export function effectiveMusicVolume(settings: AudioSettings) {
  const music = Number.isFinite(settings.musicVolume) ? Math.max(0, Math.min(1, settings.musicVolume!)) : 0.72;
  return settings.muted ? 0 : Math.min(0.46, Math.max(0, Math.min(1, settings.volume)) * music * 0.61);
}

export class SynthAudio {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  ambienceGain: GainNode | null = null;
  ambience: AudioBufferSourceNode | null = null;
  rainGain: GainNode | null = null;
  rainAmbience: AudioBufferSourceNode | null = null;
  noise: AudioBuffer | null = null;
  settings: AudioSettings;
  music = new Map<MusicScene, HTMLAudioElement>();
  musicScene: MusicScene = "day";
  musicStarted = false;
  musicPlayPending = new Set<MusicScene>();
  musicRetryAfter = new Map<MusicScene, number>();
  musicSuspended = false;
  samples = new Map<SampleKind, AudioBuffer>();
  sampleLoads = new Map<SampleKind, Promise<AudioBuffer | null>>();
  activeSamples = new Map<AudioBufferSourceNode, GainNode>();
  sampleAbort: AbortController | null = null;
  disposed = false;

  constructor(settings: AudioSettings) {
    this.settings = settings;
  }

  async unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = -12;
        compressor.ratio.value = 8;
        this.master.connect(compressor).connect(this.context.destination);
        this.noise = this.createNoiseBuffer(1.5);
        this.startAmbience();
        this.prepareMusic();
        this.preloadSamples();
        this.applyVolume();
      }
      if (this.context.state !== "running") await this.context.resume();
      await this.startMusic();
    } catch {
      // Audio is optional in restrictive embedded browsers.
    }
  }

  createNoiseBuffer(seconds: number) {
    if (!this.context) return null;
    const length = Math.floor(this.context.sampleRate * seconds);
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * 0.76 + white * 0.24;
      data[index] = previous;
    }
    return buffer;
  }

  startAmbience() {
    if (!this.context || !this.master || !this.noise || this.ambience) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noise;
    source.loop = true;
    filter.type = "lowpass";
    filter.frequency.value = 360;
    gain.gain.value = 0.018;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    this.ambience = source;
    this.ambienceGain = gain;

    const rainSource = this.context.createBufferSource();
    const rainFilter = this.context.createBiquadFilter();
    const rainGain = this.context.createGain();
    rainSource.buffer = this.noise;
    rainSource.loop = true;
    rainFilter.type = "bandpass";
    rainFilter.frequency.value = 2_850;
    rainFilter.Q.value = 0.42;
    rainGain.gain.value = 0;
    rainSource.connect(rainFilter).connect(rainGain).connect(this.master);
    rainSource.start();
    this.rainAmbience = rainSource;
    this.rainGain = rainGain;
  }

  applyVolume() {
    if (!this.master || !this.context) return;
    this.master.gain.setTargetAtTime(this.settings.muted ? 0 : this.settings.volume, this.context.currentTime, 0.02);
    this.mixMusic(true);
  }

  setSettings(settings: AudioSettings) {
    this.settings = settings;
    this.applyVolume();
  }

  setDepth(depth: number, rainLevel: boolean | number) {
    if (!this.ambienceGain || !this.context) return;
    const rain = typeof rainLevel === "number" ? Math.max(0, Math.min(1, rainLevel)) : rainLevel ? 1 : 0;
    const target = depth < 0 ? 0.012 : 0.018;
    this.ambienceGain.gain.setTargetAtTime(target, this.context.currentTime, 0.4);
    this.rainGain?.gain.setTargetAtTime(rain * 0.135, this.context.currentTime, rain > 0 ? 0.55 : 1.25);
  }

  prepareMusic() {
    if (typeof Audio === "undefined" || this.music.size) return;
    for (const [scene, source] of Object.entries(MUSIC_TRACKS) as Array<[MusicScene, string | readonly string[]]>) {
      const playlist = typeof source === "string" ? [source] : [...source];
      const element = new Audio(playlist[0]);
      const fallback = MUSIC_FALLBACKS[scene];
      if (fallback) element.addEventListener("error", () => {
        if (element.dataset.fallbackActive === "1") return;
        element.dataset.fallbackActive = "1";
        element.src = fallback;
        element.loop = true;
        element.load();
        if (scene === this.musicScene && !this.musicSuspended) window.setTimeout(() => {
          this.musicStarted = true;
          void this.playMusicScene(scene);
        }, 0);
      });
      element.dataset.playlistIndex = "0";
      element.loop = playlist.length === 1;
      if (playlist.length > 1) element.addEventListener("ended", () => {
        const current = Number.parseInt(element.dataset.playlistIndex ?? "0", 10);
        const next = (Number.isFinite(current) ? current + 1 : 1) % playlist.length;
        element.dataset.playlistIndex = String(next);
        element.src = playlist[next];
        element.load();
        if (scene === this.musicScene && this.musicStarted && !this.musicSuspended) {
          void this.playMusicScene(scene);
        }
      });
      element.preload = scene === this.musicScene ? "auto" : "metadata";
      element.volume = 0;
      element.setAttribute("playsinline", "true");
      const scheduleRetry = () => {
        if (scene !== this.musicScene || this.musicSuspended || !this.musicStarted) return;
        this.musicRetryAfter.set(scene, Date.now() + 1_500);
      };
      element.addEventListener("stalled", scheduleRetry);
      element.addEventListener("waiting", scheduleRetry);
      this.music.set(scene, element);
    }
  }

  async startMusic() {
    if (!this.music.size || this.musicSuspended) return;
    this.musicStarted = true;
    await this.playMusicScene(this.musicScene);
    this.mixMusic(true);
  }

  async playMusicScene(scene: MusicScene) {
    if (!this.musicStarted || this.musicSuspended || this.musicPlayPending.has(scene)) return;
    const element = this.music.get(scene);
    if (!element || !element.paused) return;
    this.musicPlayPending.add(scene);
    try {
      await element.play();
      this.musicRetryAfter.delete(scene);
    } catch {
      // A transient network stall must not permanently silence the soundtrack.
      // Autoplay failures are naturally retried after the next user unlock.
      this.musicRetryAfter.set(scene, Date.now() + 3_000);
    }
    finally { this.musicPlayPending.delete(scene); }
  }

  setMusicScene(scene: MusicScene, dt = 1 / 60) {
    const changed = scene !== this.musicScene;
    this.musicScene = scene;
    if (changed) void this.playMusicScene(scene);
    this.mixMusic(false, dt);
  }

  mixMusic(immediate: boolean, dt = 1 / 60) {
    const base = effectiveMusicVolume(this.settings);
    const blend = immediate ? 1 : 1 - Math.exp(-Math.max(0, dt) * 1.55);
    for (const [scene, element] of this.music.entries()) {
      const target = scene === this.musicScene ? base : 0;
      const retryReady = Date.now() >= (this.musicRetryAfter.get(scene) ?? 0);
      if (target > 0 && this.musicStarted && element.paused && retryReady) void this.playMusicScene(scene);
      element.volume += (target - element.volume) * blend;
      if (target === 0 && element.volume < 0.001) {
        element.volume = 0;
        if (!element.paused) element.pause();
      }
    }
  }

  suspendMusic() {
    this.musicSuspended = true;
    for (const element of this.music.values()) element.pause();
  }

  resumeMusic() {
    this.musicSuspended = false;
    this.musicStarted = false;
    void this.startMusic();
  }

  preloadSamples() {
    for (const kind of Object.keys(SAMPLES) as SampleKind[]) void this.loadSample(kind);
  }

  loadSample(kind: SampleKind): Promise<AudioBuffer | null> {
    const cached = this.samples.get(kind);
    if (cached) return Promise.resolve(cached);
    const pending = this.sampleLoads.get(kind);
    if (pending) return pending;
    const context = this.context;
    if (!context || context.state === "closed" || this.disposed) return Promise.resolve(null);
    this.sampleAbort ??= new AbortController();
    const signal = this.sampleAbort.signal;
    const load = (async () => {
      try {
        const response = await fetch(SAMPLES[kind].source, { signal });
        if (!response.ok) return null;
        const encoded = await response.arrayBuffer();
        if (this.disposed || signal.aborted || this.context !== context) return null;
        const decoded = await context.decodeAudioData(encoded);
        if (this.disposed || signal.aborted || this.context !== context || context.state === "closed") return null;
        this.samples.set(kind, decoded);
        return decoded;
      } catch {
        return null;
      }
    })();
    this.sampleLoads.set(kind, load);
    void load.finally(() => {
      if (this.sampleLoads.get(kind) === load) this.sampleLoads.delete(kind);
    });
    return load;
  }

  playSample(kind: SampleKind, options: SamplePlaybackOptions = {}) {
    if (this.settings.muted || this.disposed) return;
    const buffer = this.samples.get(kind);
    if (buffer) {
      this.startSample(kind, buffer, options);
      return;
    }
    void this.loadSample(kind).then((loaded) => {
      if (loaded && !this.disposed) this.startSample(kind, loaded, options);
    });
  }

  startSample(kind: SampleKind, buffer: AudioBuffer, options: SamplePlaybackOptions) {
    const context = this.context;
    const master = this.master;
    if (!context || !master || context.state === "closed" || this.settings.muted || this.disposed) return;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.playbackRate.value = Math.max(0.25, Math.min(4, options.playbackRate ?? 1));
    source.detune.value = Math.max(-2400, Math.min(2400, options.detune ?? 0));
    gain.gain.value = SAMPLES[kind].gain * Math.max(0, Math.min(2, options.gain ?? 1));
    source.connect(gain).connect(master);
    source.onended = () => {
      this.activeSamples.delete(source);
      source.disconnect();
      gain.disconnect();
    };
    this.activeSamples.set(source, gain);
    source.start(context.currentTime + Math.max(0, options.when ?? 0));
  }

  noiseBurst(duration: number, frequency: number, gainValue: number, highpass = false, when = 0) {
    if (!this.context || !this.master || !this.noise || this.settings.muted) return;
    const now = this.context.currentTime + when;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noise;
    source.playbackRate.value = 0.88 + Math.random() * 0.24;
    filter.type = highpass ? "highpass" : "bandpass";
    filter.frequency.value = frequency * (0.9 + Math.random() * 0.2);
    filter.Q.value = 0.8;
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(now, Math.random() * 0.4, duration);
    source.stop(now + duration + 0.02);
  }

  tone(frequency: number, duration: number, gainValue: number, type: OscillatorType = "triangle", when = 0, endFrequency?: number) {
    if (!this.context || !this.master || this.settings.muted) return;
    const now = this.context.currentTime + when;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, now + duration);
    gain.gain.setValueAtTime(gainValue, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.02);
  }

  play(kind: SoundKind, material: BlockId = BlockId.Grass) {
    const definition = BLOCKS[material];
    const stoneLike = definition?.preferredTool === "pickaxe";
    const woodLike = definition?.preferredTool === "axe";
    const sandLike = material === BlockId.Sand || material === BlockId.RedSand || material === BlockId.SunbakedClay;
    const softLike = material === BlockId.Grass || material === BlockId.Dirt || material === BlockId.MeadowGrass
      || material === BlockId.TallGrass || definition?.shape === "cross";
    const base = stoneLike ? 1240 : woodLike ? 680 : 400;
    if (kind === "step") {
      if (sandLike) {
        this.noiseBurst(0.082, 520, 0.046);
        this.noiseBurst(0.045, 880, 0.022, true, 0.025);
      } else if (softLike) {
        this.noiseBurst(0.072, 300, 0.052);
        this.tone(72 + Math.random() * 12, 0.045, 0.012, "sine");
      } else if (woodLike) {
        this.noiseBurst(0.047, 720, 0.048, true);
        this.tone(118, 0.055, 0.022, "triangle", 0, 84);
      } else {
        // Crisp stone/ore steps and a neutral fallback share one compact path.
        this.noiseBurst(stoneLike ? 0.038 : 0.064, base * 0.64, 0.055, stoneLike);
      }
    }
    else if (kind === "mine") {
      this.noiseBurst(0.075, base, 0.085, stoneLike);
      this.tone(stoneLike ? 105 : 82, 0.045, 0.025, "sine");
    } else if (kind === "break") {
      for (let index = 0; index < 4; index += 1) this.noiseBurst(0.07, base * (0.8 + index * 0.12), 0.1, stoneLike, index * 0.026);
      this.tone(95, 0.11, 0.045, "sine", 0, 55);
    } else if (kind === "place") {
      this.noiseBurst(0.085, 560, 0.105);
      this.tone(122, 0.1, 0.09, "sine", 0, 68);
    } else if (kind === "pickup") {
      this.tone(660, 0.055, 0.045, "triangle");
      this.tone(990, 0.07, 0.04, "triangle", 0.052);
    } else if (kind === "jump") this.noiseBurst(0.075, 280, 0.045);
    else if (kind === "fall") {
      // A brief airy rush communicates that a fall has become dangerous
      // without looping a sample or masking nearby creature sounds.
      this.noiseBurst(0.42, 1040, 0.05, true);
      this.tone(210, 0.38, 0.018, "sine", 0, 92);
    }
    else if (kind === "land") {
      this.noiseBurst(0.11, 210, 0.09);
      this.tone(74, 0.08, 0.03, "sine");
    } else if (kind === "hurt") this.tone(150, 0.18, 0.09, "sawtooth", 0, 72);
    else if (kind === "ui") this.tone(430, 0.035, 0.025, "square");
    else if (kind === "attack") {
      this.noiseBurst(0.11, 920, 0.08, true);
      this.tone(180, 0.09, 0.035, "sawtooth", 0, 95);
    } else if (kind === "mob") {
      this.tone(180 + Math.random() * 80, 0.18, 0.04, "square", 0, 120);
    } else if (kind === "craft") {
      this.tone(520, 0.06, 0.04, "triangle");
      this.tone(780, 0.09, 0.045, "triangle", 0.055);
    } else if (kind === "furnace") {
      this.noiseBurst(0.12, 380, 0.04);
      this.tone(110, 0.08, 0.025, "sine", 0, 74);
    } else if (kind === "splash") this.noiseBurst(0.17, 760, 0.08, true);
    else if (kind === "eat") {
      for (let index = 0; index < 3; index += 1) this.noiseBurst(0.05, 520 + index * 100, 0.05, false, index * 0.055);
    }
  }

  /**
   * Layered procedural dragon audio.  Keeping these cues synthesized makes
   * every age tier pitch correctly without loading nine large sample banks,
   * while the three families remain audibly distinct: fire crackles, ice
   * rings, and steel carries a struck-metal transient under its steam.
   */
  playDragon(type: DragonSoundType, event: DragonSoundEvent, stage = 1) {
    if (!this.context || !this.master || this.settings.muted) return;
    const age = Math.max(1, Math.min(5, Math.round(stage)));
    const depth = 1 - (age - 1) * 0.095;
    const base = (type === "fire" ? 92 : type === "ice" ? 128 : type === "sea" ? 104 : 108) * depth;
    const weight = 0.58 + age * 0.105;
    const texture = type === "fire" ? 420 : type === "ice" ? 1380 : type === "sea" ? 690 : 860;

    if (event === "wing") {
      this.noiseBurst(0.18 + age * 0.025, 210 + age * 24, 0.025 * weight);
      this.tone(base * 0.72, 0.12, 0.012 * weight, "sine", 0, base * 0.48);
      return;
    }
    if (event === "melee") {
      this.noiseBurst(0.14, 760, 0.075 * weight, true);
      this.tone(base * 1.55, 0.13, 0.047 * weight, "sawtooth", 0, base * 0.72);
      return;
    }
    if (event === "breath") {
      this.noiseBurst(0.62 + age * 0.07, texture, 0.075 * weight, type !== "fire");
      if (type === "sea") this.noiseBurst(0.44 + age * 0.04, 1180, 0.042 * weight, true, 0.02);
      this.noiseBurst(0.48, type === "steel" ? 2300 : texture * 0.55, 0.038 * weight, true, 0.035);
      this.tone(base * (type === "ice" ? 2.4 : 0.88), 0.58, 0.031 * weight, type === "ice" ? "triangle" : "sawtooth", 0, base * 0.46);
      return;
    }
    if (event === "projectile") {
      if (type === "steel") {
        this.tone(1180, 0.085, 0.065 * weight, "square", 0, 420);
        this.tone(176, 0.22, 0.045 * weight, "triangle", 0.025, 92);
      } else {
        this.noiseBurst(0.24, texture * 1.25, 0.062 * weight, true);
        this.tone(base * 2.2, 0.21, 0.04 * weight, "sawtooth", 0, base * 0.8);
      }
      return;
    }
    if (event === "egg-crack") {
      for (let index = 0; index < 3; index += 1) {
        this.noiseBurst(0.055, 960 + index * 370, 0.043, true, index * 0.085);
        if (type === "steel") this.tone(1320 - index * 220, 0.07, 0.024, "triangle", index * 0.085);
      }
      return;
    }

    const duration = event === "death" ? 1.48 : event === "roar" ? 1.05 : event === "ambient" ? 0.64 : 0.32;
    const gain = (event === "death" || event === "roar" ? 0.078 : event === "hurt" ? 0.052 : 0.036) * weight;
    this.noiseBurst(duration * 0.88, texture * (event === "hurt" ? 1.25 : 0.64), gain * 0.72, type === "ice");
    this.tone(
      base * (event === "hurt" ? 1.42 : 1),
      duration,
      gain,
      type === "ice" ? "triangle" : type === "steel" ? "square" : "sawtooth",
      0,
      base * (event === "death" ? 0.27 : event === "roar" ? 0.48 : 0.72),
    );
    if (type === "fire") this.noiseBurst(duration * 0.48, 2600, gain * 0.31, true, duration * 0.18);
    if (type === "ice") this.tone(base * 3.01, duration * 0.44, gain * 0.28, "sine", 0.035, base * 1.65);
    if (type === "steel") this.tone(base * 4.3, 0.11, gain * 0.56, "triangle", 0.015, base * 1.8);
  }

  /** Compact, layered casting signatures shared by learned spells in a school. */
  playSpell(school: SpellSoundSchool) {
    if (!this.context || !this.master || this.settings.muted) return;
    if (school === "destruction") {
      this.noiseBurst(0.31, 1_420, 0.055, true);
      this.tone(138, 0.28, 0.052, "sawtooth", 0, 76);
    } else if (school === "restoration") {
      this.tone(392, 0.3, 0.035, "sine", 0, 587);
      this.tone(659, 0.2, 0.024, "triangle", 0.08, 784);
    } else if (school === "alteration") {
      this.noiseBurst(0.18, 2_800, 0.025, true);
      this.tone(244, 0.24, 0.041, "triangle", 0, 976);
    } else if (school === "conjuration") {
      this.tone(104, 0.32, 0.046, "square", 0, 208);
      this.tone(1_180, 0.09, 0.032, "triangle", 0.19, 470);
    } else {
      this.tone(174, 0.38, 0.03, "sine", 0, 348);
      this.tone(523, 0.26, 0.022, "triangle", 0.06, 392);
    }
  }

  /** Procedural storm strike with a close crack and a longer, lower roll. */
  playThunder(distance = 0) {
    if (!this.context || !this.master || this.settings.muted) return;
    const delay = Math.max(0, Math.min(2.4, distance / 170));
    const weight = Math.max(0.28, 1 - distance / 260);
    this.noiseBurst(0.16, 2_150, 0.16 * weight, true, delay);
    this.noiseBurst(1.35, 92, 0.115 * weight, false, delay + 0.07);
    this.tone(58, 1.12, 0.055 * weight, "sawtooth", delay + 0.08, 31);
    this.noiseBurst(0.82, 150, 0.054 * weight, false, delay + 0.65);
  }

  dispose() {
    this.disposed = true;
    this.sampleAbort?.abort();
    try {
      this.ambience?.stop();
      this.rainAmbience?.stop();
      for (const [source, gain] of this.activeSamples) {
        source.onended = null;
        try { source.stop(); } catch { /* The source may already have ended. */ }
        try { source.disconnect(); } catch { /* Already disconnected. */ }
        try { gain.disconnect(); } catch { /* Already disconnected. */ }
      }
      this.activeSamples.clear();
      this.samples.clear();
      this.sampleLoads.clear();
      for (const element of this.music.values()) {
        element.pause();
        element.removeAttribute("src");
        element.load();
      }
      this.music.clear();
      this.musicPlayPending.clear();
      this.musicRetryAfter.clear();
      void this.context?.close();
    } catch {
      // Already closed.
    }
  }
}
