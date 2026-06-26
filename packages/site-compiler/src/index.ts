export type ContentModel = {
  id: string;
  title: string;
  thesis: string;
  audience: string;
  sourcePageIds: string[];
  sections: SectionSpec[];
};

export type SitePlan = {
  id: string;
  contentModelId: string;
  routes: SiteRoute[];
  navigation: SiteNavigationItem[];
  generatedAt: string;
};

export type SiteArtifact = {
  id: string;
  title: string;
  format: "html";
  createdAt: string;
  sourceArtifactRefs: string[];
  files: SiteArtifactFile[];
};

export type SiteArtifactFile = {
  path: string;
  mediaType: "text/html";
  content: string;
};

export type SiteWorkspace = {
  id: string;
  siteId: string;
  versionId: string;
  createdAt: string;
  title: string;
  knowledgeBaseId?: string;
  knowledgeBaseName?: string;
  baseVersionId?: string;
  rootPath: string;
  artifactPath: string;
  graphId: string;
  notes: string[];
};

export type SiteGraphNodeKind =
  | "site"
  | "version"
  | "page"
  | "route"
  | "navigation-item"
  | "section"
  | "content-block"
  | "component"
  | "design-asset"
  | "wiki-page"
  | "wiki-entity"
  | "source-document"
  | "artifact-file"
  | "style-guide";

export type SiteGraphEdgeKind =
  | "contains"
  | "renders"
  | "navigates-to"
  | "uses"
  | "grounded-in"
  | "derived-from"
  | "revises"
  | "generates";

export type SiteGraphNode = {
  id: string;
  kind: SiteGraphNodeKind;
  label: string;
  summary: string;
  ref?: string;
  metadata?: Record<string, unknown>;
};

export type SiteGraphEdge = {
  id: string;
  from: string;
  to: string;
  kind: SiteGraphEdgeKind;
  label: string;
  metadata?: Record<string, unknown>;
};

export type SiteGraph = {
  id: string;
  siteId: string;
  versionId: string;
  createdAt: string;
  entryNodeIds: string[];
  nodes: SiteGraphNode[];
  edges: SiteGraphEdge[];
};

export type PatchOperation =
  | "update-content"
  | "update-style"
  | "reorder-sections"
  | "add-section"
  | "remove-section"
  | "replace-component"
  | "regenerate-artifact"
  | "verify";

export type PatchPlanStep = {
  id: string;
  operation: PatchOperation;
  targetNodeId: string;
  summary: string;
  rationale: string;
};

export type PatchPlan = {
  id: string;
  baseVersionId: string;
  targetVersionId: string;
  createdAt: string;
  userRequest: string;
  summary: string;
  affectedNodeIds: string[];
  preservedNodeIds: string[];
  steps: PatchPlanStep[];
  constraints: string[];
};

export type SiteRoute = {
  path: string;
  title: string;
  sectionIds: string[];
};

export type SiteNavigationItem = {
  label: string;
  href: string;
};

export type DesignAssetSource =
  | {
      kind: "local-registry";
      provider: "studio";
    }
  | {
      kind: "mcp-registry";
      provider: "magic-ui" | "shadcn" | "custom";
      serverName: string;
      registryItemName?: string;
    }
  | {
      kind: "skill-registry";
      provider: "studio" | "custom";
      skillId: string;
    }
  | {
      kind: "tool-registry";
      provider: "studio" | "custom";
      toolName: string;
    };

export type DesignAssetKind =
  | "component"
  | "pattern"
  | "template"
  | "design-token"
  | "style-guide"
  | "skill"
  | "tool"
  | "mcp-tool";

export type DesignAssetRole =
  | "layout"
  | "navigation"
  | "hero"
  | "background"
  | "motion"
  | "section"
  | "card"
  | "call-to-action"
  | "accessibility"
  | "visual-audit"
  | "copywriting"
  | "design-system"
  | "typography"
  | "color";

export type DesignAssetSpec = {
  id: string;
  name: string;
  kind: DesignAssetKind;
  role: DesignAssetRole;
  description: string;
  capabilities: string[];
  recommendedFor: string[];
  avoidWhen: string[];
  constraints: string[];
  examples?: string[];
  installHints?: string[];
  source: DesignAssetSource;
};

export type DesignComponentSource = DesignAssetSource;
export type DesignComponentSpec = DesignAssetSpec & {
  kind: "component" | "pattern" | "template";
};

export type DesignQualityProfile = {
  id: string;
  name: string;
  goals: string[];
  hardRules: string[];
  softRules: string[];
  allowedAssetRefs: string[];
  allowedComponentRefs: string[];
};

export type DesignUsagePlan = {
  id: string;
  createdAt: string;
  goal: string;
  selectedAssets: DesignUsageSelection[];
  rejectedAssets: DesignUsageRejection[];
  notes: string[];
};

export type DesignUsageSelection = {
  assetId: string;
  role: DesignAssetRole;
  targetSectionIds: string[];
  reason: string;
  constraints: string[];
};

export type DesignUsageRejection = {
  assetId: string;
  reason: string;
};

export type SectionSpec = {
  id: string;
  title: string;
  purpose: "orient" | "explain" | "compare" | "evidence" | "timeline" | "call-to-action";
  sourceEntityIds: string[];
  sourcePageIds: string[];
  designAssetRefs?: string[];
  componentRefs?: string[];
  contentBlocks: ContentBlock[];
};

export type ContentBlock =
  | {
      kind: "markdown";
      markdown: string;
    }
  | {
      kind: "entity-list";
      entityIds: string[];
    }
  | {
      kind: "timeline";
      eventIds: string[];
    };

export const createEmptyContentModel = (id: string, title: string): ContentModel => ({
  id,
  title,
  thesis: "",
  audience: "self",
  sourcePageIds: [],
  sections: []
});

export const createSiteWorkspace = (input: {
  id: string;
  siteId: string;
  versionId: string;
  createdAt: string;
  title: string;
  knowledgeBaseId?: string;
  knowledgeBaseName?: string;
  baseVersionId?: string;
  graphId: string;
}): SiteWorkspace => {
  const rootPath = `sites/${safePathPart(input.siteId)}/versions/${safePathPart(input.versionId)}`;
  const workspace: SiteWorkspace = {
    id: input.id,
    siteId: input.siteId,
    versionId: input.versionId,
    createdAt: input.createdAt,
    title: input.title,
    rootPath,
    artifactPath: `${rootPath}/artifact`,
    graphId: input.graphId,
    notes: [
      "Site workspace is the stable boundary for patch builds.",
      "Generated site files are compiled artifacts; meaning remains grounded in the selected wiki."
    ]
  };
  if (input.knowledgeBaseId) workspace.knowledgeBaseId = input.knowledgeBaseId;
  if (input.knowledgeBaseName) workspace.knowledgeBaseName = input.knowledgeBaseName;
  if (input.baseVersionId) workspace.baseVersionId = input.baseVersionId;
  return workspace;
};

export const createSiteGraph = (input: {
  id: string;
  siteId: string;
  versionId: string;
  createdAt: string;
  title: string;
  contentModel?: ContentModel;
  sitePlan?: SitePlan;
  siteArtifact?: SiteArtifact;
  designUsagePlan?: DesignUsagePlan;
  parentVersionId?: string;
}): SiteGraph => {
  const nodes = new Map<string, SiteGraphNode>();
  const edges = new Map<string, SiteGraphEdge>();
  const siteNodeId = `site:${input.siteId}`;
  const versionNodeId = `version:${input.versionId}`;

  addNode(nodes, {
    id: siteNodeId,
    kind: "site",
    label: input.title,
    summary: "Generated website boundary."
  });
  addNode(nodes, {
    id: versionNodeId,
    kind: "version",
    label: input.versionId,
    summary: input.parentVersionId ? `Revision of ${input.parentVersionId}.` : "Initial generated version."
  });
  addEdge(edges, siteNodeId, versionNodeId, "contains", "site contains version");
  if (input.parentVersionId) {
    addEdge(edges, versionNodeId, `version:${input.parentVersionId}`, "revises", "version revises previous version");
  }

  for (const pageId of input.contentModel?.sourcePageIds ?? []) {
    const nodeId = `wiki-page:${pageId}`;
    addNode(nodes, {
      id: nodeId,
      kind: "wiki-page",
      label: pageId,
      summary: "Wiki page used by the content model.",
      ref: pageId
    });
    addEdge(edges, versionNodeId, nodeId, "grounded-in", "version grounded in wiki page");
  }

  for (const route of input.sitePlan?.routes ?? []) {
    const routeNodeId = `route:${route.path}`;
    addNode(nodes, {
      id: routeNodeId,
      kind: "route",
      label: route.title,
      summary: `Route ${route.path}.`,
      ref: route.path
    });
    addEdge(edges, versionNodeId, routeNodeId, "renders", "version renders route");

    for (const sectionId of route.sectionIds) {
      addEdge(edges, routeNodeId, `section:${sectionId}`, "contains", "route contains section");
    }
  }

  for (const item of input.sitePlan?.navigation ?? []) {
    const navNodeId = `nav:${stableSiteGraphHash(`${item.label}:${item.href}`)}`;
    addNode(nodes, {
      id: navNodeId,
      kind: "navigation-item",
      label: item.label,
      summary: `Navigation item pointing to ${item.href}.`,
      ref: item.href
    });
    addEdge(edges, versionNodeId, navNodeId, "contains", "version contains navigation item");
    addEdge(edges, navNodeId, normalizeGraphRouteRef(item.href), "navigates-to", "navigation item points to route or anchor");
  }

  for (const section of input.contentModel?.sections ?? []) {
    const sectionNodeId = `section:${section.id}`;
    addNode(nodes, {
      id: sectionNodeId,
      kind: "section",
      label: section.title,
      summary: section.purpose,
      ref: section.id,
      metadata: {
        purpose: section.purpose
      }
    });
    addEdge(edges, versionNodeId, sectionNodeId, "contains", "version contains section");

    for (const pageId of section.sourcePageIds) {
      const nodeId = `wiki-page:${pageId}`;
      addNode(nodes, {
        id: nodeId,
        kind: "wiki-page",
        label: pageId,
        summary: "Wiki page used by a section.",
        ref: pageId
      });
      addEdge(edges, sectionNodeId, nodeId, "grounded-in", "section grounded in wiki page");
    }

    for (const entityId of section.sourceEntityIds) {
      const nodeId = `wiki-entity:${entityId}`;
      addNode(nodes, {
        id: nodeId,
        kind: "wiki-entity",
        label: entityId,
        summary: "Wiki entity used by a section.",
        ref: entityId
      });
      addEdge(edges, sectionNodeId, nodeId, "grounded-in", "section grounded in wiki entity");
    }

    for (const assetRef of section.designAssetRefs ?? []) {
      const nodeId = `design-asset:${assetRef}`;
      addNode(nodes, {
        id: nodeId,
        kind: "design-asset",
        label: assetRef,
        summary: "Design asset selected for this section.",
        ref: assetRef
      });
      addEdge(edges, sectionNodeId, nodeId, "uses", "section uses design asset");
    }

    for (const componentRef of section.componentRefs ?? []) {
      const nodeId = `component:${componentRef}`;
      addNode(nodes, {
        id: nodeId,
        kind: "component",
        label: componentRef,
        summary: "Component selected for this section.",
        ref: componentRef
      });
      addEdge(edges, sectionNodeId, nodeId, "uses", "section uses component");
    }

    section.contentBlocks.forEach((block, index) => {
      const blockNodeId = `content-block:${section.id}:${index + 1}`;
      addNode(nodes, {
        id: blockNodeId,
        kind: "content-block",
        label: `${section.title} block ${index + 1}`,
        summary: summarizeContentBlock(block),
        ref: `${section.id}:${index + 1}`,
        metadata: {
          kind: block.kind
        }
      });
      addEdge(edges, sectionNodeId, blockNodeId, "contains", "section contains content block");

      if (block.kind === "entity-list") {
        for (const entityId of block.entityIds) {
          const nodeId = `wiki-entity:${entityId}`;
          addNode(nodes, {
            id: nodeId,
            kind: "wiki-entity",
            label: entityId,
            summary: "Wiki entity used by a content block.",
            ref: entityId
          });
          addEdge(edges, blockNodeId, nodeId, "grounded-in", "content block grounded in wiki entity");
        }
      }
    });
  }

  for (const selection of input.designUsagePlan?.selectedAssets ?? []) {
    const nodeId = `design-asset:${selection.assetId}`;
    addNode(nodes, {
      id: nodeId,
      kind: "design-asset",
      label: selection.assetId,
      summary: selection.reason,
      ref: selection.assetId,
      metadata: {
        role: selection.role,
        constraints: selection.constraints
      }
    });
    addEdge(edges, versionNodeId, nodeId, "uses", "version uses selected design asset");

    for (const sectionId of selection.targetSectionIds) {
      addEdge(edges, `section:${sectionId}`, nodeId, "uses", "section uses selected design asset");
    }
  }

  for (const file of input.siteArtifact?.files ?? []) {
    const fileNodeId = `artifact-file:${file.path}`;
    addNode(nodes, {
      id: fileNodeId,
      kind: "artifact-file",
      label: file.path,
      summary: `${file.mediaType} artifact file.`,
      ref: file.path,
      metadata: {
        mediaType: file.mediaType,
        contentLength: file.content.length
      }
    });
    addEdge(edges, versionNodeId, fileNodeId, "generates", "version generates artifact file");
  }

  return {
    id: input.id,
    siteId: input.siteId,
    versionId: input.versionId,
    createdAt: input.createdAt,
    entryNodeIds: [siteNodeId, versionNodeId],
    nodes: [...nodes.values()],
    edges: [...edges.values()]
  };
};

export const createPatchPlan = (input: {
  id: string;
  baseVersionId: string;
  targetVersionId: string;
  createdAt: string;
  userRequest: string;
  baseGraph?: SiteGraph;
  targetGraph: SiteGraph;
}): PatchPlan => {
  const baseNodeIds = new Set(input.baseGraph?.nodes.map((node) => node.id) ?? []);
  const targetNodeIds = new Set(input.targetGraph.nodes.map((node) => node.id));
  const addedNodeIds = input.targetGraph.nodes
    .map((node) => node.id)
    .filter((nodeId) => !baseNodeIds.has(nodeId));
  const hintedNodeIds = selectHintedNodeIds(input.userRequest, input.targetGraph);
  const affectedNodeIds = uniqueSiteGraphIds([...hintedNodeIds, ...addedNodeIds]).slice(0, 24);
  const preservedNodeIds = [...targetNodeIds]
    .filter((nodeId) => !affectedNodeIds.includes(nodeId))
    .slice(0, 48);
  const fallbackTargetNodeId = input.targetGraph.entryNodeIds[1] ?? input.targetGraph.entryNodeIds[0] ?? `version:${input.targetVersionId}`;
  const effectiveAffectedNodeIds = affectedNodeIds.length ? affectedNodeIds : [fallbackTargetNodeId];
  const primaryAffectedNodeId = effectiveAffectedNodeIds[0] ?? fallbackTargetNodeId;

  return {
    id: input.id,
    baseVersionId: input.baseVersionId,
    targetVersionId: input.targetVersionId,
    createdAt: input.createdAt,
    userRequest: input.userRequest,
    summary: `Patch build from ${input.baseVersionId} to ${input.targetVersionId}.`,
    affectedNodeIds: effectiveAffectedNodeIds,
    preservedNodeIds,
    steps: [
      {
        id: `${input.id}_step_intent`,
        operation: "update-content",
        targetNodeId: primaryAffectedNodeId,
        summary: "Apply the user's requested edit to the targeted site graph nodes.",
        rationale: "Patch builds should avoid unrelated regeneration."
      },
      {
        id: `${input.id}_step_artifact`,
        operation: "regenerate-artifact",
        targetNodeId: `version:${input.targetVersionId}`,
        summary: "Regenerate only the compiled artifact for the new version.",
        rationale: "The website artifact is derived from the structured site model."
      },
      {
        id: `${input.id}_step_verify`,
        operation: "verify",
        targetNodeId: `version:${input.targetVersionId}`,
        summary: "Verify grounding, navigation, artifact health, and internal-language leaks.",
        rationale: "Every patch must be safe to publish or easy to reject."
      }
    ],
    constraints: [
      "Preserve selected knowledge base isolation.",
      "Keep unaffected site graph nodes stable unless the user explicitly requested broader changes.",
      "Maintain version lineage and base version references.",
      "Do not expose internal build implementation in the generated site."
    ]
  };
};

const addNode = (nodes: Map<string, SiteGraphNode>, node: SiteGraphNode) => {
  if (!nodes.has(node.id)) nodes.set(node.id, node);
};

const addEdge = (
  edges: Map<string, SiteGraphEdge>,
  from: string,
  to: string,
  kind: SiteGraphEdgeKind,
  label: string
) => {
  const id = `${kind}:${from}->${to}`;
  if (!edges.has(id)) {
    edges.set(id, {
      id,
      from,
      to,
      kind,
      label
    });
  }
};

const summarizeContentBlock = (block: ContentBlock): string => {
  if (block.kind === "markdown") return trimSiteGraphSummary(block.markdown);
  if (block.kind === "entity-list") return `${block.entityIds.length} linked entities.`;
  return `${block.eventIds.length} timeline events.`;
};

const selectHintedNodeIds = (request: string, graph: SiteGraph): string[] => {
  const compact = request.toLowerCase();
  const matches = graph.nodes.filter((node) => {
    const haystack = `${node.label}\n${node.summary}\n${node.kind}`.toLowerCase();
    return (
      (compact.includes("项目") && haystack.includes("项目")) ||
      (compact.includes("作品") && haystack.includes("作品")) ||
      (compact.includes("首页") && (haystack.includes("home") || haystack.includes("首页") || node.kind === "route")) ||
      (compact.includes("风格") && (node.kind === "design-asset" || node.kind === "component" || haystack.includes("style"))) ||
      (compact.includes("文案") && node.kind === "content-block") ||
      (compact.includes("导航") && node.kind === "navigation-item")
    );
  });
  return matches.map((node) => node.id);
};

const normalizeGraphRouteRef = (href: string): string => {
  if (href.startsWith("#")) return `section:${href.slice(1)}`;
  return `route:${href || "/"}`;
};

const trimSiteGraphSummary = (value: string): string => {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > 160 ? `${compact.slice(0, 159)}…` : compact;
};

const uniqueSiteGraphIds = (values: string[]): string[] => [...new Set(values.filter(Boolean))];

const safePathPart = (value: string): string => value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "site";

const stableSiteGraphHash = (value: string): string => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(31, hash) + value.charCodeAt(index) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, "0");
};
