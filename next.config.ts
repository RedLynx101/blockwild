import type { NextConfig } from "next";

const buildSha = process.env.VERCEL_GIT_COMMIT_SHA
  ?? process.env.GITHUB_SHA
  ?? process.env.BLOCKWILD_BUILD_SHA
  ?? "local";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_BLOCKWILD_BUILD_SHA: buildSha,
  },
};

export default nextConfig;
