import { readdir, rm } from "node:fs/promises";
import path from "node:path";

const CONTENT_HASH = /^[a-f0-9]{64}$/u;

export function resolveRendererArtifactDirectory(publicRoot: string, directoryName: string) {
  if (!CONTENT_HASH.test(directoryName)) throw new TypeError(`invalid renderer artifact directory '${directoryName}'`);
  const canonicalRoot = path.resolve(publicRoot);
  const candidate = path.resolve(canonicalRoot, directoryName);
  if (path.dirname(candidate) !== canonicalRoot || path.basename(candidate) !== directoryName || candidate === canonicalRoot) {
    throw new Error(`renderer artifact directory escaped its public root: ${candidate}`);
  }
  return candidate;
}

export async function rendererArtifactDirectories(publicRoot: string) {
  const names: string[] = [];
  for (const entry of await readdir(path.resolve(publicRoot), { withFileTypes: true })) {
    if (entry.isDirectory() && CONTENT_HASH.test(entry.name)) names.push(entry.name);
  }
  return names.sort();
}

export async function pruneRendererArtifacts(publicRoot: string, retainedHashes: ReadonlySet<string>) {
  for (const hash of retainedHashes) resolveRendererArtifactDirectory(publicRoot, hash);
  const removed: string[] = [];
  for (const hash of await rendererArtifactDirectories(publicRoot)) {
    if (retainedHashes.has(hash)) continue;
    // Resolve again immediately before mutation; never delete from a derived
    // path that has not independently passed canonical containment checks.
    const target = resolveRendererArtifactDirectory(publicRoot, hash);
    await rm(target, { recursive: true, force: true });
    removed.push(hash);
  }
  return Object.freeze(removed);
}
