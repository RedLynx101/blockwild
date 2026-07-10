import { BLOCKS, BlockId } from "./data";

export type AudioSettings = { volume: number; muted: boolean };
export type SoundKind = "step" | "mine" | "break" | "place" | "pickup" | "jump" | "land" | "hurt" | "ui" | "attack" | "mob" | "craft" | "furnace" | "splash" | "eat";
export type MusicScene = "day" | "night" | "sea";

const MUSIC_TRACKS: Record<MusicScene, string> = {
  day: "/music/blockwild-theme.mp3",
  night: "/music/blockwild-night.mp3",
  sea: "/music/blockwild-sea.mp3",
};

export class SynthAudio {
  context: AudioContext | null = null;
  master: GainNode | null = null;
  ambienceGain: GainNode | null = null;
  ambience: AudioBufferSourceNode | null = null;
  noise: AudioBuffer | null = null;
  settings: AudioSettings;
  music = new Map<MusicScene, HTMLAudioElement>();
  musicScene: MusicScene = "day";
  musicStarted = false;
  musicPlayPending = new Set<MusicScene>();
  musicSuspended = false;

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

  setDepth(depth: number, raining: boolean) {
    if (!this.ambienceGain || !this.context) return;
    const target = (depth < 0 ? 0.012 : 0.018) + (raining ? 0.012 : 0);
    this.ambienceGain.gain.setTargetAtTime(target, this.context.currentTime, 0.4);
  }

  prepareMusic() {
    if (typeof Audio === "undefined" || this.music.size) return;
    for (const [scene, source] of Object.entries(MUSIC_TRACKS) as Array<[MusicScene, string]>) {
      const element = new Audio(source);
      element.loop = true;
      element.preload = scene === this.musicScene ? "auto" : "metadata";
      element.volume = 0;
      element.setAttribute("playsinline", "true");
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
    try { await element.play(); }
    catch { this.musicStarted = false; }
    finally { this.musicPlayPending.delete(scene); }
  }

  setMusicScene(scene: MusicScene, dt = 1 / 60) {
    const changed = scene !== this.musicScene;
    this.musicScene = scene;
    if (changed) void this.playMusicScene(scene);
    this.mixMusic(false, dt);
  }

  mixMusic(immediate: boolean, dt = 1 / 60) {
    const base = this.settings.muted ? 0 : Math.min(0.46, this.settings.volume * 0.44);
    const blend = immediate ? 1 : 1 - Math.exp(-Math.max(0, dt) * 1.55);
    for (const [scene, element] of this.music.entries()) {
      const target = scene === this.musicScene ? base : 0;
      if (target > 0 && this.musicStarted && element.paused) void this.playMusicScene(scene);
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
    const base = stoneLike ? 1240 : woodLike ? 680 : 400;
    if (kind === "step") this.noiseBurst(stoneLike ? 0.038 : 0.064, base * 0.64, 0.055, stoneLike);
    else if (kind === "mine") {
      this.noiseBurst(0.075, base, 0.085, stoneLike);
      this.tone(stoneLike ? 105 : 82, 0.045, 0.025, "sine");
    } else if (kind === "break") {
      for (let index = 0; index < 4; index += 1) this.noiseBurst(0.07, base * (0.8 + index * 0.12), 0.1, stoneLike, index * 0.026);
      this.tone(95, 0.11, 0.045, "sine", 0, 55);
    } else if (kind === "place") {
      this.noiseBurst(0.07, 510, 0.07);
      this.tone(115, 0.09, 0.06, "sine", 0, 64);
    } else if (kind === "pickup") {
      this.tone(660, 0.055, 0.045, "triangle");
      this.tone(990, 0.07, 0.04, "triangle", 0.052);
    } else if (kind === "jump") this.noiseBurst(0.075, 280, 0.045);
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

  dispose() {
    try {
      this.ambience?.stop();
      for (const element of this.music.values()) {
        element.pause();
        element.removeAttribute("src");
        element.load();
      }
      this.music.clear();
      this.musicPlayPending.clear();
      void this.context?.close();
    } catch {
      // Already closed.
    }
  }
}
