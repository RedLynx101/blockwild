export type BlockwildDeployment = "vercel" | "sites" | "local" | "other";

export type BlockwildBuildIdentity = Readonly<{
  commitSha: string | null;
  deployment: BlockwildDeployment;
  origin: string | null;
  telemetrySchema: 3;
  generationWorkerProtocol: 1;
  terrainWorkerProtocol: 1;
}>;

const compiledCommitSha = process.env.NEXT_PUBLIC_BLOCKWILD_BUILD_SHA?.trim() ?? "";

export function classifyDeploymentOrigin(origin: string | null | undefined): BlockwildDeployment {
  if (!origin) return "local";
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    if (hostname === "blockwild.app" || hostname.endsWith(".vercel.app")) return "vercel";
    if (hostname.endsWith(".chatgpt.site")) return "sites";
    if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") return "local";
    return "other";
  } catch {
    return "other";
  }
}

/** Compile-time commit plus runtime origin, recorded in every downloadable performance log. */
export function currentBuildIdentity(origin = typeof window === "undefined" ? null : window.location.origin): BlockwildBuildIdentity {
  return Object.freeze({
    commitSha: compiledCommitSha && compiledCommitSha !== "unknown" && compiledCommitSha !== "local" ? compiledCommitSha : null,
    deployment: classifyDeploymentOrigin(origin),
    origin,
    telemetrySchema: 3,
    generationWorkerProtocol: 1,
    terrainWorkerProtocol: 1,
  });
}
