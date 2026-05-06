import "server-only";
import { randomUUID } from "node:crypto";
import { HarnessOrchestrator } from "@personal-wiki-harness/harness-core";
import type { BuildIntent, HarnessRun } from "@personal-wiki-harness/harness-core";
import type { SourceDocument, WikiEntity, WikiPage, WikiRelation } from "@personal-wiki-harness/wiki-core";

const now = () => new Date().toISOString();

const sources: SourceDocument[] = [
  {
    id: "source_001",
    title: "个人简介",
    uri: "file://raw/profile.md",
    mediaType: "text/markdown",
    contentHash: "demo_profile",
    content:
      "Mingyu enjoys building thoughtful AI tools, writing about knowledge systems, and turning scattered notes into durable personal artifacts.",
    createdAt: now(),
    metadata: { demo: true }
  },
  {
    id: "source_002",
    title: "项目经历",
    uri: "file://raw/projects.md",
    mediaType: "text/markdown",
    contentHash: "demo_projects",
    content:
      "Recent projects focus on personal websites, knowledge modeling, agent workflows, and tools that make complex thinking easier to revisit.",
    createdAt: now(),
    metadata: { demo: true }
  }
];

const pages: WikiPage[] = [
  {
    id: "page_index",
    kind: "index",
    title: "index.md",
    path: "wiki/index.md",
    body:
      "# Personal Wiki\n\n- [[个人简介]]: 个人背景、兴趣和表达方向。\n- [[项目经历]]: 最近项目、能力线索和可展示作品。",
    entityIds: ["entity_profile", "entity_projects"],
    sourceIds: ["source_001", "source_002"],
    updatedAt: now()
  },
  {
    id: "page_profile",
    kind: "concept",
    title: "个人简介",
    path: "wiki/profile.md",
    body:
      "Mingyu builds AI products around knowledge modeling, personal expression, and practical creative workflows.",
    entityIds: ["entity_profile"],
    sourceIds: ["source_001"],
    updatedAt: now()
  },
  {
    id: "page_projects",
    kind: "concept",
    title: "项目经历",
    path: "wiki/projects.md",
    body:
      "Project work centers on personal websites, structured knowledge bases, and AI-assisted creation tools.",
    entityIds: ["entity_projects"],
    sourceIds: ["source_002"],
    updatedAt: now()
  }
];

const entities: WikiEntity[] = [
  {
    id: "entity_profile",
    name: "个人简介",
    kind: "concept",
    aliases: ["Profile", "About"],
    summary: "个人背景、兴趣和网站首页可表达的核心信息。",
    pageId: "page_profile",
    sourceIds: ["source_001"],
    updatedAt: now()
  },
  {
    id: "entity_projects",
    name: "项目经历",
    kind: "concept",
    aliases: ["Projects", "Portfolio"],
    summary: "可以被个人网站展示的项目、作品和能力线索。",
    pageId: "page_projects",
    sourceIds: ["source_002"],
    updatedAt: now()
  }
];

const relations: WikiRelation[] = [
  {
    id: "relation_001",
    fromEntityId: "entity_projects",
    toEntityId: "entity_profile",
    predicate: "supports",
    confidence: 0.86,
    evidenceSourceIds: ["source_002"],
    note: "Project experience supports the personal narrative."
  }
];

const harness = new HarnessOrchestrator({
  wiki: {
    sources,
    entities,
    pages,
    relations,
    events: [],
    lintIssues: []
  }
});

const runs: HarnessRun[] = [];

export const getKnowledge = () => ({
  sources,
  pages,
  entities,
  relations,
  lintIssues: harness.getState().wiki.lintIssues
});

export const addSource = (input: { title: string; content: string; uri?: string }) => {
  const source: SourceDocument = {
    id: randomUUID(),
    title: input.title,
    uri: input.uri || `file://raw/${input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.md`,
    mediaType: "text/markdown",
    contentHash: `demo_${Date.now()}`,
    content: input.content,
    createdAt: now()
  };
  sources.unshift(source);
  return source;
};

export const createRun = async (input: Omit<BuildIntent, "id" | "createdAt">) => {
  const run = await harness.run(input);
  runs.unshift(run);
  return run;
};

export const getRuns = () => runs;

export const getSiteState = () => {
  const versions = harness.getState().versions;
  return {
    latest: versions.at(-1) ?? null,
    versions,
    runs
  };
};

export const getSystemState = () => {
  const state = harness.getState();
  return {
    skills: state.systemSkills.skills,
    modelRouting: state.modelRoutingPolicy.decisions,
    reflections: state.reflections
  };
};

export const getStats = () => {
  const state = harness.getState();
  return {
    projects: 1,
    sources: sources.length,
    wikiPages: pages.length,
    entities: entities.length,
    runs: runs.length,
    buildVersions: state.versions.length,
    systemSkills: state.systemSkills.skills.length,
    reflections: state.reflections.length
  };
};
