import assert from "node:assert/strict";
import { readFileSync, statSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

const tracks = [
  "blockwild-ironbloom-skirmish-a.mp3",
  "blockwild-ironbloom-skirmish-b.mp3",
];

test("v0.5 Suno combat cues are present and complete", () => {
  for (const name of tracks) {
    const path = resolve("public", "music", name);
    assert.ok(statSync(path).size > 3_000_000, `${name} should be a complete music track`);
    const bytes = readFileSync(path).subarray(0, 10);
    const id3 = bytes.subarray(0, 3).toString("ascii") === "ID3";
    const mpegFrame = bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
    assert.ok(id3 || mpegFrame, `${name} should begin with an MP3 container or frame header`);
  }
});
