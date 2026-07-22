import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = resolve(".agents/skills/blockwild-agent-player/scripts/agent-session.mjs");

function run(root: string, args: string[]) {
  return spawnSync(process.execPath, [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, BLOCKWILD_AGENT_NOTEBOOK_DIR: root },
  });
}

test("runner notebook is world-and-agent scoped, correctable, exportable, and secret rejecting", () => {
  const root = mkdtempSync(join(tmpdir(), "blockwild-agent-notebook-"));
  try {
    const base = ["--world", "worldfp_test", "--agent", "agent_test"];
    const pinned = run(root, ["notebook-pin", ...base, "--id", "west-field", "--text", "West field is beside the old well", "--source", "player", "--confidence", "0.9", "--x", "4", "--y", "30", "--z", "-2"]);
    assert.equal(pinned.status, 0, pinned.stderr);
    const corrected = run(root, ["notebook-correct", ...base, "--id", "west-field", "--text", "West field is north of the old well"]);
    assert.equal(corrected.status, 0, corrected.stderr);
    const listed = run(root, ["notebook-export", ...base]);
    assert.equal(listed.status, 0, listed.stderr);
    const notebook = JSON.parse(listed.stdout);
    assert.equal(notebook.pins.length, 1);
    assert.equal(notebook.pins[0].text, "West field is north of the old well");
    assert.deepEqual(notebook.pins[0].position, { x: 4, y: 30, z: -2 });

    const rejected = run(root, ["notebook-pin", ...base, "--text", "API key sk-secret", "--source", "agent", "--confidence", "0.5"]);
    assert.notEqual(rejected.status, 0);
    assert.match(rejected.stderr, /secret/iu);

    const disabled = run(root, ["notebook-disable", ...base]);
    assert.equal(disabled.status, 0, disabled.stderr);
    const blocked = run(root, ["notebook-pin", ...base, "--text", "Should not persist", "--source", "agent", "--confidence", "0.5"]);
    assert.notEqual(blocked.status, 0);
    assert.match(blocked.stderr, /disabled/iu);
    assert.match(readFileSync(join(root, "worldfp_test", "agent_test.json"), "utf8"), /"enabled": false/u);
  } finally {
    const canonicalRoot = realpathSync(root);
    const canonicalTemp = realpathSync(tmpdir());
    assert.ok(canonicalRoot.startsWith(`${canonicalTemp}${process.platform === "win32" ? "\\" : "/"}blockwild-agent-notebook-`));
    rmSync(canonicalRoot, { recursive: true, force: true });
  }
});
