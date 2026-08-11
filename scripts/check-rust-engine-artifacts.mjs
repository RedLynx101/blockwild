import path from "node:path";
import {
  RustEngineToolError,
  findRepositoryRoot,
  isDirectInvocation,
  parseCommandLine,
  sha256,
  validatePublishedArtifacts,
} from "./rust-engine-common.mjs";

const OPTIONS = {
  "repo-root": { type: "string", default: null },
  "public-dir": { type: "string", default: "public/engine" },
  "base-url": { type: "string", default: null },
  "timeout-ms": { type: "integer", default: 15_000 },
  "strict-http": { type: "boolean", default: false },
};

function contentTypeBase(value) {
  return (value ?? "").split(";", 1)[0].trim().toLowerCase();
}

async function verifyHttpFile({ url, expected, timeoutMilliseconds, strictHttp }) {
  let response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      signal: AbortSignal.timeout(timeoutMilliseconds),
    });
  } catch (error) {
    throw new RustEngineToolError(`Failed to fetch ${url}: ${error.message}`);
  }
  if (!response.ok) throw new RustEngineToolError(`HTTP ${response.status} while fetching ${url}.`);
  const expectedMime = contentTypeBase(expected.mimeType);
  const actualMime = contentTypeBase(response.headers.get("content-type"));
  if (actualMime !== expectedMime) {
    throw new RustEngineToolError(`Incorrect Content-Type for ${url}: expected ${expectedMime}, received ${actualMime || "missing"}.`);
  }
  const contents = Buffer.from(await response.arrayBuffer());
  const digest = sha256(contents);
  if (contents.byteLength !== expected.bytes || digest !== expected.sha256) {
    throw new RustEngineToolError(`Published HTTP bytes do not match the manifest for ${url}.`);
  }
  const cacheControl = response.headers.get("cache-control") ?? "";
  if (strictHttp && (!/\bimmutable\b/i.test(cacheControl) || !/\bmax-age=\d+/i.test(cacheControl))) {
    throw new RustEngineToolError(`Hashed artifact ${url} is missing immutable Cache-Control metadata.`);
  }
  return {
    url,
    bytes: contents.byteLength,
    sha256: digest,
    contentType: response.headers.get("content-type"),
    cacheControl,
  };
}

export async function checkRustEngineArtifacts(argv = process.argv) {
  const options = parseCommandLine(argv, OPTIONS);
  const repositoryRoot = findRepositoryRoot(options["repo-root"] ?? process.cwd());
  const publicEngineDirectory = path.resolve(repositoryRoot, options["public-dir"]);
  const verification = validatePublishedArtifacts(publicEngineDirectory);
  const http = [];
  if (options["base-url"]) {
    const baseUrl = new URL(options["base-url"]);
    for (const artifact of verification.artifacts) {
      for (const file of artifact.files) {
        const url = new URL(`/engine/${artifact.hash}/${file.path}`, baseUrl).href;
        http.push(await verifyHttpFile({
          url,
          expected: file,
          timeoutMilliseconds: options["timeout-ms"],
          strictHttp: options["strict-http"],
        }));
      }
    }
  }
  return {
    schema: 1,
    checkedAt: new Date().toISOString(),
    repositoryRoot,
    publicEngineDirectory,
    defaultVariant: verification.index.defaultVariant,
    variants: verification.artifacts.map((artifact) => ({
      variant: artifact.variant,
      hash: artifact.hash,
      fileCount: artifact.files.length,
      totalBytes: artifact.files.reduce((total, file) => total + file.bytes, 0),
    })),
    http,
  };
}

async function main() {
  try {
    process.stdout.write(`${JSON.stringify(await checkRustEngineArtifacts(), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`Rust engine artifact verification failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (isDirectInvocation(import.meta.url)) await main();
