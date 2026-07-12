import assert from "node:assert/strict";
import test from "node:test";
import { effectiveMusicVolume } from "../app/game/audio.ts";

test("music has an independent normalized slider while master and mute remain authoritative", () => {
  assert.equal(effectiveMusicVolume({ volume: 1, musicVolume: 0, muted: false }), 0);
  assert.equal(effectiveMusicVolume({ volume: 1, musicVolume: 1, muted: true }), 0);
  assert.ok(effectiveMusicVolume({ volume: 0.5, musicVolume: 1, muted: false }) < effectiveMusicVolume({ volume: 1, musicVolume: 1, muted: false }));
  assert.equal(effectiveMusicVolume({ volume: 1, muted: false }), effectiveMusicVolume({ volume: 1, musicVolume: 0.72, muted: false }));
});
