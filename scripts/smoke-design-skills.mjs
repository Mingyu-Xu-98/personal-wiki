import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const stateDir = await mkdtemp("/private/tmp/pwh-design-skills-smoke-");
const sourceDir = path.join(stateDir, "fixture", "skills");
const cacheDir = path.join(stateDir, "design-assets");
const zipPath = path.join(stateDir, "skills.zip");
process.env.PWH_DESIGN_ASSET_CACHE_PATH = cacheDir;

await mkdir(path.join(sourceDir, "ui-skill"), { recursive: true });
await mkdir(path.join(sourceDir, "style-skills", "skills", "colorize"), { recursive: true });
await mkdir(path.join(sourceDir, "storytelling-for-user-experience-crafting-stories-for-better-design-skill.pdf", "visual-narrative-enhancement"), {
  recursive: true
});

await writeFile(
  path.join(sourceDir, "ui-skill", "SKILL.md"),
  `---
name: ui-skill
description: Design system generator for colors, fonts, product type, landing page, and UX rules.
---

# UI Skill

Use for design system generation, color palette, typography, layout, and professional UI checks.
`
);

await writeFile(
  path.join(sourceDir, "style-skills", "skills", "colorize", "SKILL.md"),
  `---
name: colorize
description: Add strategic color to monochromatic interfaces and preserve accessible contrast.
---

# Colorize

Introduce semantic color, accent hierarchy, tinted surfaces, and accessible contrast.
`
);

await writeFile(
  path.join(
    sourceDir,
    "storytelling-for-user-experience-crafting-stories-for-better-design-skill.pdf",
    "visual-narrative-enhancement",
    "SKILL.md"
  ),
  `---
name: 视觉叙事增强
description: Use visual narrative to turn abstract product or personal stories into concrete public-facing sections.
---

# 视觉叙事增强

Use images, diagrams, pacing, and story structure to improve understanding and emotional resonance.
`
);

await execFileAsync("zip", ["-qr", zipPath, "skills"], {
  cwd: path.join(stateDir, "fixture")
});

await execFileAsync("node", [
  path.join(process.cwd(), "scripts", "sync-design-skills-zip.mjs"),
  zipPath,
  "--output",
  path.join(cacheDir, "design-skills.json")
]);

const {
  getSiteDesignAssetRegistry,
  readSiteDesignAsset,
  recommendSiteDesignAssets,
  searchSiteDesignAssets
} = await import("../apps/studio/lib/server/production.ts");

const registry = getSiteDesignAssetRegistry();
assert.ok(registry.some((asset) => asset.source.kind === "skill-registry" && asset.source.skillId?.includes("ui-skill")));
assert.ok(registry.some((asset) => asset.role === "color" && asset.source.skillId?.includes("colorize")));
assert.ok(registry.some((asset) => asset.role === "copywriting" && asset.name.includes("视觉叙事")));

const searched = searchSiteDesignAssets({ query: "design system", kind: "skill", limit: 5 });
assert.ok(searched.some((asset) => asset.source.skillId?.includes("ui-skill")));

const read = readSiteDesignAsset("zip:skills/ui-skill/SKILL.md");
assert.equal(read?.source.kind, "skill-registry");

const recommended = recommendSiteDesignAssets({ siteType: "portfolio", style: "color narrative design system" });
assert.ok(recommended.some((asset) => asset.source.kind === "skill-registry"));

console.log(
  JSON.stringify(
    {
      stateDir,
      registryCount: registry.length,
      importedSkillAssets: registry.filter((asset) => asset.source.kind === "skill-registry" && asset.source.provider === "custom").length,
      searched: searched.slice(0, 3).map((asset) => asset.id)
    },
    null,
    2
  )
);
