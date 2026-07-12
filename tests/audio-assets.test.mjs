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
