import { existsSync, realpathSync, rmSync } from "node:fs";
import { relative, resolve } from "node:path";

const workspaceRoot = realpathSync(process.cwd());
const nextCache = resolve(workspaceRoot, ".next", "cache");
const cacheRelativeToWorkspace = relative(workspaceRoot, nextCache);

if (!cacheRelativeToWorkspace || cacheRelativeToWorkspace.startsWith("..") || resolve(nextCache) === workspaceRoot) {
  throw new Error(`Refusing to remove unsafe Next cache target: ${nextCache}`);
}

if (existsSync(nextCache)) rmSync(nextCache, { recursive: true, force: true });
console.log(`Prepared clean Next compiler cache: ${cacheRelativeToWorkspace}`);
