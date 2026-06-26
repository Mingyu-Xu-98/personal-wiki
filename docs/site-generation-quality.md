# Site Generation Quality

The site generation quality module turns component libraries, UI MCP servers, design tools, and design skills into a controlled harness resource. The goal is better generated websites without letting the build agent depend on hidden IDE state or unbounded external tools.

## Position

Magic UI MCP is useful, but it should not be called directly as a required step for every user build. It is best used as one UI design asset provider:

```txt
Magic UI MCP / Figma / shadcn / design skills / verifier tools
  -> curated design asset registry snapshot
  -> Builder Agent asset selection
  -> DesignUsagePlan
  -> Builder Agent implementation
  -> Review Agent checks refs, constraints, and artifact quality
```

The user site remains a compiled artifact. The wiki remains the source of meaning. The design asset registry is only a design/material/tool source.

## Provider Shape

Every provider should map into the same internal shape:

```ts
type DesignAssetSpec = {
  id: string;
  name: string;
  kind: "component" | "pattern" | "template" | "design-token" | "style-guide" | "skill" | "tool" | "mcp-tool";
  role: "layout" | "hero" | "background" | "motion" | "section" | "card" | "accessibility" | "visual-audit";
  description: string;
  capabilities: string[];
  recommendedFor: string[];
  avoidWhen: string[];
  constraints: string[];
  examples?: string[];
  installHints?: string[];
  source: {
    kind: "local-registry" | "mcp-registry" | "skill-registry" | "tool-registry";
    provider: "studio" | "magic-ui" | "shadcn" | "figma" | "21st-dev" | "custom";
    serverName?: string;
    registryItemName?: string;
    skillId?: string;
    toolName?: string;
  };
};
```

Magic UI MCP maps cleanly because it exposes a small registry-oriented surface: list registry items, search registry items, and read a registry item. Figma tools, shadcn registries, internal design skills, and visual QA tools should also enter through this same asset protocol.

## Runtime Tools

The active Studio tool manifest now includes:

- `recommendDesignAssets`
- `searchDesignAssets`
- `readDesignAsset`
- `searchDesignComponents`
- `readDesignComponent`

The component tools are compatibility aliases. New work should use the design asset tools. These tools are available to the `builder-agent` and `review-agent` roles, with legacy aliases kept for `site-planner`, `site-compiler`, and `verifier`. A selected design asset id is a carry-forward ref, just like a wiki page, source, entity, content model, design usage plan, or site artifact.

## Hard Rules

- Design asset choices must preserve source refs from the selected knowledge base.
- Design assets are allowed to improve presentation, not invent content.
- External MCP output must be cached or summarized into the internal registry before durable build records rely on it.
- Builder Agent may use only selected asset refs and must record those refs in `DesignUsagePlan` and the relevant `SectionSpec.designAssetRefs` or `SectionSpec.componentRefs`.
- Review Agent should flag unknown asset refs, inaccessible provider metadata, internal system language, missing responsive constraints, and motion-heavy choices without fallback.

## Magic UI MCP Strategy

For local alpha, seed a few Magic UI-inspired component candidates in `siteDesignAssetRegistry` and expose them through the same tools. This makes the workflow testable without requiring network access.

For developer sync, a later script can start:

```json
{
  "mcpServers": {
    "magicuidesign-mcp": {
      "command": "npx",
      "args": ["-y", "@magicuidesign/mcp@latest"]
    }
  }
}
```

The sync script should call the MCP registry tools, write a versioned cache, and never store API keys or user knowledge inside the asset cache.

The current local command is:

```sh
npm run sync:magic-ui
```

It starts `@magicuidesign/mcp@latest` over MCP stdio, discovers registry tools, searches common Magic UI component queries, normalizes the result into `DesignAssetSpec`, and writes:

```txt
.pwh-studio/design-assets/magic-ui.json
```

Studio reads `.pwh-studio/design-assets/*.json` dynamically, so synced Magic UI assets become visible to `recommendDesignAssets`, `searchDesignAssets`, and `readDesignAsset`.

For an offline smoke test of the same cache path:

```sh
npm run sync:magic-ui -- --fixture
npm run smoke:design-assets
```

## Design Skill Zip Strategy

Design/UI style skills can also enter the same registry as `skill-registry` assets. This is useful for style guidance that is not a component library: design-system generation, color strategy, typography, layout rhythm, motion, visual audit, and narrative presentation.

To sync a skill archive:

```sh
npm run sync:design-skills -- /path/to/skills.zip
```

This writes:

```txt
.pwh-studio/design-assets/design-skills.json
```

The importer currently recognizes:

- `ui-skill/SKILL.md`
- `style-skills/skills/*/SKILL.md`
- `storytelling-for-user-experience-crafting-stories-for-better-design-skill.pdf/*/SKILL.md`
- `mattpocock-skills/design-an-interface/SKILL.md`

It normalizes each skill into `DesignAssetSpec` with `kind: "skill"` and `source.kind: "skill-registry"`. The Builder Agent can then find those skills through `recommendDesignAssets`, `searchDesignAssets`, and `readDesignAsset`, and must preserve selected skill refs in `DesignUsagePlan`.

For importer verification:

```sh
npm run smoke:design-skills
```

## Quality Loop

1. Builder Agent asks `recommendDesignAssets` based on site type, audience, and style.
2. Builder Agent reads selected asset constraints.
3. Builder Agent writes a `DesignUsagePlan` and mirrors selected refs into `SectionSpec.designAssetRefs` or `SectionSpec.componentRefs`.
4. Builder Agent uses those refs to compose HTML/CSS and tool-specific implementation notes.
5. Review Agent checks that selected assets are known, appropriate, responsive, and grounded in the site plan.
6. Reflection records reusable lessons only when the same pattern succeeds across builds.

This keeps Magic UI MCP useful as a high-quality design source while keeping Personal Wiki Harness deterministic, auditable, and local-alpha friendly.
