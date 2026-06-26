export type StudioToolManifestEntry = {
  name: string;
  purpose: string;
  availableTo: Array<
    | "wiki-curator"
    | "conversation-agent"
    | "builder-agent"
    | "review-agent"
    | "site-planner"
    | "site-compiler"
    | "verifier"
  >;
  carriesRefs: string[];
};

export const studioToolManifest: StudioToolManifestEntry[] = [
  {
    name: "readWikiIndex",
    purpose: "Read the selected knowledge base index and compact wiki summary.",
    availableTo: ["conversation-agent", "builder-agent", "review-agent", "site-planner", "site-compiler", "verifier"],
    carriesRefs: ["wiki-page", "source", "entity"]
  },
  {
    name: "searchWiki",
    purpose: "Search pages, entities, and sources inside the selected knowledge base.",
    availableTo: ["conversation-agent", "builder-agent", "review-agent", "site-planner", "site-compiler", "verifier"],
    carriesRefs: ["wiki-page", "source", "entity"]
  },
  {
    name: "readWikiPage",
    purpose: "Read a specific wiki page by id, title, or path.",
    availableTo: ["builder-agent", "review-agent", "site-planner", "site-compiler", "verifier"],
    carriesRefs: ["wiki-page", "source", "entity"]
  },
  {
    name: "readEntity",
    purpose: "Read a specific entity by id or name, including linked source and page refs.",
    availableTo: ["builder-agent", "review-agent", "site-planner", "site-compiler", "verifier"],
    carriesRefs: ["entity", "source", "wiki-page"]
  },
  {
    name: "readSource",
    purpose: "Read a bounded source excerpt, reopening object storage when available.",
    availableTo: ["wiki-curator", "builder-agent", "review-agent", "site-planner", "site-compiler", "verifier"],
    carriesRefs: ["source", "object"]
  },
  {
    name: "createSitePlan",
    purpose: "Stage content-model and site-plan structures before final artifact return.",
    availableTo: ["builder-agent", "site-planner"],
    carriesRefs: ["content-model", "site-plan", "source", "wiki-page", "entity"]
  },
  {
    name: "searchDesignAssets",
    purpose: "Search all curated UI design assets, including components, patterns, templates, skills, tools, and MCP-sourced candidates.",
    availableTo: ["builder-agent", "review-agent", "site-planner", "site-compiler", "verifier"],
    carriesRefs: ["design-asset", "component", "skill", "tool", "mcp-registry"]
  },
  {
    name: "readDesignAsset",
    purpose: "Read constraints, examples, install hints, provider metadata, and usage rules for one UI design asset.",
    availableTo: ["builder-agent", "review-agent", "site-planner", "site-compiler", "verifier"],
    carriesRefs: ["design-asset", "design-system", "mcp-registry", "skill", "tool"]
  },
  {
    name: "recommendDesignAssets",
    purpose: "Recommend UI design assets from site type, audience, and style while preserving provider refs.",
    availableTo: ["builder-agent", "site-planner"],
    carriesRefs: ["design-asset", "component", "skill", "tool"]
  },
  {
    name: "searchDesignComponents",
    purpose: "Compatibility alias for searching component-like UI design assets.",
    availableTo: ["builder-agent", "review-agent", "site-planner", "site-compiler", "verifier"],
    carriesRefs: ["component", "design-system", "design-asset"]
  },
  {
    name: "readDesignComponent",
    purpose: "Compatibility alias for reading a component-like UI design asset.",
    availableTo: ["builder-agent", "review-agent", "site-planner", "site-compiler", "verifier"],
    carriesRefs: ["component", "design-system", "design-asset", "mcp-registry"]
  },
  {
    name: "compileSite",
    purpose: "Compile a draft HTML artifact from the plan and content model.",
    availableTo: ["builder-agent", "site-compiler"],
    carriesRefs: ["site-artifact", "content-model", "site-plan"]
  },
  {
    name: "writeSiteArtifact",
    purpose: "Record compiled site artifact references for versioning and publishing.",
    availableTo: ["builder-agent", "site-compiler"],
    carriesRefs: ["site-artifact"]
  }
];

export const compactStudioToolManifest = () =>
  studioToolManifest.map((tool) => ({
    name: tool.name,
    purpose: tool.purpose,
    availableTo: tool.availableTo,
    carriesRefs: tool.carriesRefs
  }));
