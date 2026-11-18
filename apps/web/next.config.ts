import type { NextConfig } from "next";

/**
 * Configuration for the single deployable (`architecture.md`: one application, public record plus
 * role-scoped console in the same release).
 *
 * Two choices here are load-bearing for the area manifests:
 *
 * - `transpilePackages` lists every workspace package that `apps/web` imports. Area packages export
 *   their TypeScript source (see each `packages/*\/package.json` `exports` field) so that the
 *   monorepo has one copy of each module and no stale build output can be served; Next compiles
 *   them as if they were first-party code.
 * - `output: "standalone"` produces the self-contained server bundle the container image ships,
 *   which is what makes the deployable reproducible outside the workspace (`architecture.md`,
 *   Deployment Topology: Docker containers, single Nigerian region).
 */
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ["@odp/ui", "@odp/domain", "@odp/db", "@odp/inference", "@odp/platform"],
};

export default nextConfig;
