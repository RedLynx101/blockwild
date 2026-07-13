import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

const tracks = [
  "blockwild-ironbloom-skirmish-a.mp3",
  "blockwild-ironbloom-skirmish-b.mp3",
  "blockwild-hearthroad-home-a.mp3",
  "blockwild-hearthroad-home-b.mp3",
  "blockwild-brassroot-market-a.mp3",
  "blockwild-brassroot-market-b.mp3",
  "blockwild-tidelight-shelf-a.mp3",
  "blockwild-tidelight-shelf-b.mp3",
  "blockwild-lantern-sea-a.mp3",
  "blockwild-lantern-sea-b.mp3",
];

test("Suno combat, settlement, coast, and deep-sea scores are present and complete", () => {
  for (const name of tracks) {
    const path = resolve("public", "music", name);
    assert.ok(statSync(path).size > 2_000_000, `${name} should be a complete music track`);
    const bytes = readFileSync(path).subarray(0, 10);
    const id3 = bytes.subarray(0, 3).toString("ascii") === "ID3";
    const mpegFrame = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    assert.ok(id3 || mpegFrame, `${name} should begin with an MP3 container or frame header`);
  }
});

test("natural and Deepgear horse calls are lossless PCM WAV assets", () => {
  for (const [name, minimumBytes] of [
    ["horse-whinny-a.wav", 300_000],
    ["horse-whinny-b.wav", 500_000],
    ["deepgear-courser-whinny.wav", 500_000],
  ]) {
    const path = resolve("public", "sfx", name);
    assert.ok(statSync(path).size > minimumBytes, `${name} should contain the complete supplied call`);
    const bytes = readFileSync(path).subarray(0, 12);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WAVE");
  }
});

test("species bird calls are complete lossless PCM WAV assets", () => {
  for (const [name, minimumBytes] of [
    ["emberjay-squawk.wav", 300_000],
    ["bird-chirp.wav", 300_000],
    ["canopy-lark-call.wav", 300_000],
    ["tidewing-gull-call-a.wav", 300_000],
    ["tidewing-gull-call-b.wav", 400_000],
  ]) {
    const path = resolve("public", "sfx", name);
    assert.ok(statSync(path).size > minimumBytes, `${name} should contain the complete supplied call`);
    const bytes = readFileSync(path).subarray(0, 12);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WAVE");
  }
});

test("cat, hound, and crab calls are complete lossless PCM WAV assets", () => {
  for (const name of ["cat-call-a.wav", "cat-call-b.wav", "hound-call-a.wav", "hound-call-b.wav", "crab-chitter.wav"]) {
    const path = resolve("public", "sfx", name);
    assert.ok(statSync(path).size > 300_000, `${name} should contain the complete supplied call`);
    const bytes = readFileSync(path).subarray(0, 12);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WAVE");
  }
});

test("v1.3 spatial, environment, movement, creature, magic, and interface sounds preserve the supplied WAVs", () => {
  const supplied = [
    ["ambient-light-rain.wav", 1_500_000],
    ["ambient-night-crickets.wav", 850_000],
    ["ambient-wind.wav", 1_870_000],
    ["step-snow.wav", 380_000],
    ["step-dirt.wav", 380_000],
    ["ambient-winter-wind.wav", 2_320_000],
    ["ambient-cave.wav", 460_000],
    ["water-splash.wav", 460_000],
    ["water-swimming.wav", 380_000],
    ["dragon-attack-a.wav", 380_000],
    ["dragon-attack-b.wav", 380_000],
    ["dragon-wing-flap.wav", 380_000],
    ["magic-attack.wav", 380_000],
    ["achievement-unlocked.wav", 910_000],
    ["ui-tap.wav", 380_000],
    ["ambient-ocean-soft.wav", 610_000],
    ["creature-scary-grumble.wav", 780_000],
    ["humanoid-sigh.wav", 380_000],
    ["step-grass-soft.wav", 380_000],
    ["block-hit-default.wav", 380_000],
  ];
  for (const [name, minimumBytes] of supplied) {
    const path = resolve("public", "sfx", name);
    assert.ok(statSync(path).size > minimumBytes, `${name} should preserve the complete supplied sound`);
    const bytes = readFileSync(path).subarray(0, 12);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF", `${name} should be a RIFF container`);
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WAVE", `${name} should be a WAVE asset`);
  }
});

test("new wildlife and passive growl calls are complete lossless PCM WAV assets", () => {
  for (const [name, minimumBytes] of [
    ["puddlehopper-croak.wav", 300_000],
    ["copper-mole-sniff.wav", 300_000],
    ["reedstrider-call.wav", 300_000],
    ["dragon-ambient-deep-growl.wav", 400_000],
    ["warg-deep-growl.wav", 300_000],
  ]) {
    const path = resolve("public", "sfx", name);
    assert.ok(statSync(path).size > minimumBytes, `${name} should contain the complete supplied call`);
    const bytes = readFileSync(path).subarray(0, 12);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WAVE");
  }
});

test("rabbit, small-animal, owl, and underwater leviathan calls are complete PCM WAV assets", () => {
  for (const [name, minimumBytes] of [
    ["rabbit-squeak.wav", 300_000],
    ["little-animal-squeak.wav", 300_000],
    ["leviathan-growl-underwater-a.wav", 2_000_000],
    ["leviathan-growl-underwater-b.wav", 900_000],
    ["owl-call-a.wav", 2_000_000],
    ["owl-call-b.wav", 300_000],
  ]) {
    const path = resolve("public", "sfx", name);
    assert.ok(statSync(path).size > minimumBytes, `${name} should contain the complete supplied call`);
    const bytes = readFileSync(path).subarray(0, 36);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WAVE");
    assert.equal(bytes.readUInt16LE(20), 1, `${name} should remain PCM`);
    assert.equal(bytes.readUInt16LE(22), 2, `${name} should remain stereo`);
    assert.equal(bytes.readUInt32LE(24), 48_000, `${name} should remain 48 kHz`);
    assert.equal(bytes.readUInt16LE(34), 16, `${name} should remain 16-bit`);
  }
});

test("mechanical creature cues preserve the supplied PCM masters and safe headroom", () => {
  const supplied = [
    ["dwarven-automaton-metal-breath.wav", 460_972, 2.4],
    ["clockwork-hound-metallic-bark.wav", 384_172, 2],
    ["dwarven-automaton-steam-release-a.wav", 384_172, 2],
    ["dwarven-automaton-steam-release-b.wav", 384_172, 2],
  ];
  for (const [name, expectedBytes, expectedDuration] of supplied) {
    const bytes = readFileSync(resolve("public", "sfx", name));
    assert.equal(bytes.length, expectedBytes, `${name} should preserve the complete supplied file`);
    assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString("ascii"), "WAVE");
    assert.equal(bytes.readUInt16LE(20), 1, `${name} should remain PCM`);
    assert.equal(bytes.readUInt16LE(22), 2, `${name} should remain stereo`);
    assert.equal(bytes.readUInt32LE(24), 48_000, `${name} should remain 48 kHz`);
    assert.equal(bytes.readUInt16LE(34), 16, `${name} should remain 16-bit`);

    let offset = 12;
    let dataOffset = -1;
    let dataBytes = 0;
    while (offset + 8 <= bytes.length) {
      const id = bytes.subarray(offset, offset + 4).toString("ascii");
      const size = bytes.readUInt32LE(offset + 4);
      if (id === "data") {
        dataOffset = offset + 8;
        dataBytes = size;
        break;
      }
      offset += 8 + size + (size & 1);
    }
    assert.ok(dataOffset > 0, `${name} should contain an audio data chunk`);
    assert.equal(dataBytes / (48_000 * 2 * 2), expectedDuration, `${name} should preserve its authored duration`);

    let peak = 0;
    let sumSquares = 0;
    const sampleCount = dataBytes / 2;
    for (let index = 0; index < sampleCount; index += 1) {
      const sample = bytes.readInt16LE(dataOffset + index * 2) / 32_768;
      peak = Math.max(peak, Math.abs(sample));
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / sampleCount);
    assert.ok(peak > 0.45 && peak < 0.9, `${name} should remain audible without clipping`);
    assert.ok(rms > 0.03 && rms < 0.1, `${name} should retain its authored one-shot level`);
  }
});

test("the supplied player damage cue remains a complete stereo PCM master", () => {
  const bytes = readFileSync(resolve("public", "sfx", "player-direct-damage.wav"));
  assert.equal(bytes.length, 384_172);
  assert.equal(bytes.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(bytes.subarray(8, 12).toString("ascii"), "WAVE");
  assert.equal(bytes.readUInt16LE(20), 1);
  assert.equal(bytes.readUInt16LE(22), 2);
  assert.equal(bytes.readUInt32LE(24), 48_000);
  assert.equal(bytes.readUInt16LE(34), 16);
});
