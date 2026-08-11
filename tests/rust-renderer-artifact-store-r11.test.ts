import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  pruneRendererArtifacts,
  rendererArtifactDirectories,
  resolveRendererArtifactDirectory,
} from "../scripts/renderer-artifact-store.ts";

test("renderer artifact pruning removes only unreferenced content-addressed directories", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "blockwild-renderer-store-"));
  const retained = "a".repeat(64), stale = "b".repeat(64);
  try {
    await Promise.all([
      mkdir(path.join(root, retained)),
      mkdir(path.join(root, stale)),
      mkdir(path.join(root, "human-notes")),
    ]);
    await writeFile(path.join(root, stale, "payload"), "stale");
    const removed = await pruneRendererArtifacts(root, new Set([retained]));
    assert.deepEqual(removed, [stale]);
    assert.deepEqual(await rendererArtifactDirectories(root), [retained]);
    assert.throws(() => resolveRendererArtifactDirectory(root, "../outside"), /invalid renderer artifact/);
    assert.throws(() => resolveRendererArtifactDirectory(root, ""), /invalid renderer artifact/);
  } finally {
    const canonicalRoot = path.resolve(root), canonicalTemp = path.resolve(tmpdir());
    if (path.dirname(canonicalRoot) !== canonicalTemp || !path.basename(canonicalRoot).startsWith("blockwild-renderer-store-")) {
      throw new Error(`refusing to clean unexpected test directory ${canonicalRoot}`);
    }
    await rm(canonicalRoot, { recursive: true, force: true });
  }
});
