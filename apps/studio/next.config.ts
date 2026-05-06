import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@personal-wiki-harness/harness-core",
    "@personal-wiki-harness/agent-runtime",
    "@personal-wiki-harness/meta-skill-core",
    "@personal-wiki-harness/site-compiler",
    "@personal-wiki-harness/wiki-core"
  ]
};

export default nextConfig;
