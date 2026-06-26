import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";

const stateDir = await mkdtemp("/private/tmp/pwh-design-assets-smoke-");
const cacheDir = path.join(stateDir, "design-assets");
process.env.PWH_DESIGN_ASSET_CACHE_PATH = cacheDir;

await mkdir(cacheDir, { recursive: true });
await writeFile(
  path.join(cacheDir, "magic-ui.json"),
  JSON.stringify(
    {
      schemaVersion: 1,
      provider: "magic-ui",
      serverName: "magicuidesign-mcp",
      syncedAt: new Date().toISOString(),
      assets: [
        {
          id: "magic-test-orbiting-circles",
          name: "Magic UI Test Orbiting Circles",
          kind: "component",
          role: "motion",
          description: "Fixture asset that verifies external MCP-sourced assets enter the design registry.",
          capabilities: ["decorative motion", "visual polish"],
          recommendedFor: ["technical landing page"],
          avoidWhen: ["long reading page"],
          constraints: ["Respect reduced-motion preference"],
          source: {
            kind: "mcp-registry",
            provider: "magic-ui",
            serverName: "magicuidesign-mcp",
            registryItemName: "orbiting-circles"
          }
        }
      ]
    },
    null,
    2
  )
);

const {
  getSiteDesignAssetRegistry,
  readSiteDesignAsset,
  recommendSiteDesignAssets,
  searchSiteDesignAssets
} = await import("../apps/studio/lib/server/production.ts");

const registry = getSiteDesignAssetRegistry();
assert.ok(registry.some((asset) => asset.id === "magic-test-orbiting-circles"));

const searched = searchSiteDesignAssets({ query: "orbiting", provider: "magic-ui" });
assert.equal(searched.at(0)?.id, "magic-test-orbiting-circles");

const read = readSiteDesignAsset("orbiting-circles");
assert.equal(read?.source.provider, "magic-ui");

const recommended = recommendSiteDesignAssets({ siteType: "technical landing page", style: "motion" });
assert.ok(recommended.some((asset) => asset.id === "magic-test-orbiting-circles"));

console.log(
  JSON.stringify(
    {
      cacheDir,
      registryCount: registry.length,
      externalAsset: read?.id,
      recommended: recommended.slice(0, 3).map((asset) => asset.id)
    },
    null,
    2
  )
);
