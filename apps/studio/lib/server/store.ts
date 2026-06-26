import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  createContextPacket,
  createDryRunSubAgentExecutor,
  createToolRegistry,
  type ContextPacketInput,
  type SubAgentArtifact,
  type SubAgentExecutor,
  type SubAgentTrace,
  type ToolDefinition
} from "@personal-wiki-harness/agent-runtime";
import {
  applyWikiMutationPlan,
  createSourceDocumentToolRegistry,
  createWikiMutationPlanWithOntologyCurator,
  type WikiMutationPlanReview
} from "@personal-wiki-harness/engine-core";
import {
  createAutoApprovalForRun,
  createEveTraceFromHarnessRun,
  DurableRunStore,
  evaluateDeploymentPolicy,
  filesFromBuildVersion,
  HarnessOrchestrator,
  SandboxRunner,
  type ApprovalRequest,
  type EvePrincipal,
  type EveTraceSpan
} from "@personal-wiki-harness/harness-core";
import type { BuildIntent, BuildVersion, HarnessObservationEvent, HarnessRun } from "@personal-wiki-harness/harness-core";
import type { ContentModel, DesignUsagePlan, SitePlan } from "@personal-wiki-harness/site-compiler";
import type { SourceDocument, WikiEntity, WikiLintIssue, WikiMutationPlan, WikiPage, WikiRelation, WikiSnapshot } from "@personal-wiki-harness/wiki-core";
import type { KnowledgeBaseSummary } from "../create-agent-types";
import {
  createStudioSubAgentExecutor,
  getPublicStudioLlmRuntime,
  isStudioLlmUseCaseEnabled
} from "./llm-client.ts";
import { readStoredObjectExcerpt } from "./object-storage.ts";
import { isPostgresConfigured, isPostgresStoreEnabled, queryPostgres } from "./postgres.ts";
import { readLocalPublishedSiteFile, writeLocalPublishedSite } from "./publishing.ts";
import { compactStudioToolManifest } from "./tool-manifest.ts";
import {
  assertBuildQuota,
  createQuotaSnapshot,
  createUsageRecord,
  estimateBuildCostUnits,
  getSiteDesignAssetRegistry,
  getSiteDesignComponentRegistry,
  productionReadinessChecklist,
  readSiteDesignAsset,
  readSiteDesignComponent,
  recommendSiteDesignAssets,
  searchSiteDesignAssets,
  searchSiteDesignComponents,
  type BuildJob,
  type BuildLogEvent,
  type DeploymentRecord,
  type UsageRecord
} from "./production.ts";

const now = () => new Date().toISOString();

const getEveRuntimeRoot = () => process.env.PWH_EVE_RUNTIME_PATH || path.join(".pwh-studio", "eve-runtime");

type KnowledgeRuntime = {
  base: KnowledgeBaseSummary;
  sources: SourceDocument[];
  pages: WikiPage[];
  entities: WikiEntity[];
  relations: WikiRelation[];
  harness: HarnessOrchestrator;
};

type PublishedSiteVersion = {
  id: string;
  versionId: string;
  runId: string;
  versionNumber: number;
  title: string;
  summary: string;
  status: "published";
  createdAt: string;
  publishedAt: string;
  parentVersionId?: string | null;
  changeSummary?: string;
  knowledgeBaseId?: string;
  knowledgeBaseName?: string;
  deployment?: DeploymentRecord;
  version: BuildVersion;
};

type KnowledgeMutationReviewStatus = "pending" | "approved" | "rejected";

type KnowledgeMutationReview = {
  id: string;
  baseId: string;
  planId: string;
  status: KnowledgeMutationReviewStatus;
  source: SourceDocument;
  mutationPlan: WikiMutationPlan;
  review: WikiMutationPlanReview;
  modelBacked: boolean;
  rejectedCandidateCount: number;
  createdAt: string;
  updatedAt: string;
  decidedAt?: string;
};

type AddSourceInput = {
  userId: string;
  baseId?: string;
  title: string;
  content: string;
  uri?: string;
  mediaType?: string;
  contentHash?: string;
  contentMode?: SourceDocument["contentMode"];
  originalUri?: string;
  byteSize?: number;
  metadata?: Record<string, unknown>;
};

type StudioUserState = {
  runtimes: KnowledgeRuntime[];
  runs: HarnessRun[];
  publishedVersionIds: Set<string>;
  publishedSiteVersions: PublishedSiteVersion[];
  mutationReviews: KnowledgeMutationReview[];
  buildJobs: BuildJob[];
  buildLogs: BuildLogEvent[];
  usageRecords: UsageRecord[];
};

type SerializedKnowledgeRuntime = {
  base: KnowledgeBaseSummary;
  snapshot: WikiSnapshot;
};

type SerializedStudioUserState = {
  runtimes: SerializedKnowledgeRuntime[];
  runs: HarnessRun[];
  publishedSiteVersions: PublishedSiteVersion[];
  mutationReviews: KnowledgeMutationReview[];
  buildJobs?: BuildJob[];
  buildLogs?: BuildLogEvent[];
  usageRecords?: UsageRecord[];
};

type SerializedStudioStore = {
  version: 1;
  users: Record<string, SerializedStudioUserState>;
};

type KnowledgeBaseRow = {
  id: string;
  name: string;
  description: string;
  wiki_index: string;
  file_count: number;
  total_chars: number;
  updated_at: Date | string;
};

type SourceDocumentRow = {
  id: string;
  title: string;
  uri: string;
  media_type: string;
  content_hash: string;
  content_mode: string;
  content: string | null;
  object_key: string | null;
  metadata: unknown;
  created_at: Date | string;
  extracted_at: Date | string | null;
};

type WikiPageRow = {
  id: string;
  kind: string;
  title: string;
  path: string;
  body: string;
  source_ids: unknown;
  entity_ids: unknown;
  updated_at: Date | string;
};

type WikiEntityRow = {
  id: string;
  name: string;
  kind: string;
  aliases: unknown;
  summary: string;
  page_id: string | null;
  source_ids: unknown;
  updated_at: Date | string;
};

type WikiRelationRow = {
  id: string;
  from_entity_id: string;
  to_entity_id: string;
  predicate: string;
  confidence: string | number;
  evidence_source_ids: unknown;
  note: string;
};

type KnowledgeMutationReviewRow = {
  id: string;
  knowledge_base_id: string;
  plan_id: string;
  status: KnowledgeMutationReviewStatus;
  source: unknown;
  mutation_plan: unknown;
  review: unknown;
  model_backed: boolean;
  rejected_candidate_count: number;
  created_at: Date | string;
  updated_at: Date | string;
  decided_at: Date | string | null;
};

type BuildJobRow = {
  id: string;
  kind: "site-build";
  status: BuildJob["status"];
  intent: unknown;
  attempt: number;
  queue_position: number;
  run_id: string | null;
  version_id: string | null;
  error: string | null;
  created_at: Date | string;
  updated_at: Date | string;
  started_at: Date | string | null;
  finished_at: Date | string | null;
};

type BuildLogRow = {
  id: string;
  job_id: string;
  run_id: string | null;
  phase: BuildLogEvent["phase"];
  level: BuildLogEvent["level"];
  message: string;
  data: unknown;
  created_at: Date | string;
};

type HarnessRunRow = {
  id: string;
  state: HarnessRun["state"];
  intent: unknown;
  context_ledger: unknown;
  plan: unknown;
  commander_decisions: unknown;
  sub_agent_traces: unknown;
  observability_events: unknown;
  reflection: unknown;
  error: string | null;
  created_at: Date | string;
};

type BuildVersionRow = {
  id: string;
  run_id: string;
  parent_version_id: string | null;
  summary: string;
  content_model: unknown;
  design_usage_plan: unknown;
  site_plan: unknown;
  site_artifact: unknown;
  site_workspace: unknown;
  site_graph: unknown;
  patch_plan: unknown;
  run_context_manifest: unknown;
  lint_issues: unknown;
  change_summary: string | null;
  created_at: Date | string;
};

type PublishedSiteRow = {
  id: string;
  version_id: string;
  run_id: string;
  version_number: number;
  title: string;
  summary: string;
  status: "published";
  deployment: unknown;
  parent_version_id: string | null;
  change_summary: string | null;
  created_at: Date | string;
  published_at: Date | string;
};

type UsageRecordRow = {
  id: string;
  kind: UsageRecord["kind"];
  quantity: string | number;
  cost_units: string | number;
  model: string | null;
  ref_id: string | null;
  metadata: unknown;
  created_at: Date | string;
};

type DurableRunRecord = {
  run: HarnessRun;
  trace: EveTraceSpan[];
  approvals: ApprovalRequest[];
  paths: ReturnType<DurableRunStore["paths"]>;
};

const studioRoleToEvePrincipal = (
  userId: string,
  role: "admin" | "user" = "user",
  email?: string
): EvePrincipal => ({
  userId,
  ...(email ? { email } : {}),
  role: role === "admin" ? "admin" : "builder",
  scopes: role === "admin" ? ["*"] : ["runs:read", "runs:write", "artifacts:read", "deploy:preview"]
});

const createDurableRunStore = () => new DurableRunStore(getEveRuntimeRoot());

const persistEveRuntimeRun = async (input: {
  userId: string;
  jobId?: string;
  run: HarnessRun;
}): Promise<{
  runDir: string;
  tracePath: string;
  approvalsPath: string;
  artifactPath?: string;
  sandbox: Awaited<ReturnType<SandboxRunner["validate"]>>;
}> => {
  const store = createDurableRunStore();
  const sandbox = new SandboxRunner(getEveRuntimeRoot());
  const artifactPath = await sandbox.writeArtifactFiles(input.run.id, filesFromBuildVersion(input.run.buildVersion));
  const sandboxResult = await sandbox.validate(input.run.id, ["index.html"]);
  const approvals = createAutoApprovalForRun(input.run, artifactPath);
  const trace = createEveTraceFromHarnessRun(input.run, {
    userId: input.userId,
    ...(input.jobId ? { jobId: input.jobId } : {}),
    agentId: "commander",
    model: "studio-routing-policy"
  });
  const paths = store.paths(input.run.id);

  await store.saveRun(input.run);
  await store.saveTrace(input.run.id, trace);
  await store.saveApprovals(input.run.id, approvals);
  await store.saveManifest(input.run.id, {
    runId: input.run.id,
    userId: input.userId,
    jobId: input.jobId ?? null,
    versionId: input.run.buildVersion?.id ?? null,
    artifactPath,
    sandbox: sandboxResult,
    tracePath: paths.traceJson,
    approvalsPath: paths.approvalsJson,
    createdAt: now()
  });

  return {
    runDir: paths.runDir,
    tracePath: paths.traceJson,
    approvalsPath: paths.approvalsJson,
    artifactPath,
    sandbox: sandboxResult
  };
};

const loadDurableRunRecord = async (run: HarnessRun): Promise<DurableRunRecord> => {
  const store = createDurableRunStore();
  const paths = store.paths(run.id);
  return {
    run,
    trace: await readDurableOrDefault(() => store.loadTrace(run.id), []),
    approvals: await readDurableOrDefault(() => store.loadApprovals(run.id), []),
    paths
  };
};

const readDurableOrDefault = async <T>(read: () => Promise<T>, fallback: T): Promise<T> => {
  try {
    return await read();
  } catch {
    return fallback;
  }
};

function createHarnessForSnapshot(snapshot: WikiSnapshot, snapshotProvider?: () => WikiSnapshot): HarnessOrchestrator {
  const subAgentExecutor =
    createStudioSiteAgentExecutor(snapshotProvider ?? (() => snapshot)) ?? createDeterministicStudioSiteExecutor();
  return new HarnessOrchestrator({
    wiki: snapshot,
    subAgentExecutor
  });
}

const createRuntime = (input: {
  id: string;
  name: string;
  description: string;
  sources: SourceDocument[];
  pages: WikiPage[];
  entities: WikiEntity[];
  relations: WikiRelation[];
}): KnowledgeRuntime => {
  const snapshot: WikiSnapshot = {
    sources: input.sources,
    entities: input.entities,
    pages: input.pages,
    relations: input.relations,
    events: [],
    lintIssues: []
  };
  let runtime: KnowledgeRuntime;
  runtime = {
    base: {
      id: input.id,
      name: input.name,
      description: input.description,
      wikiIndex: "",
      fileCount: input.sources.length,
      totalChars: input.sources.reduce((sum, source) => sum + source.content.length, 0),
      updatedAt: now()
    },
    sources: input.sources,
    pages: input.pages,
    entities: input.entities,
    relations: input.relations,
    harness: createHarnessForSnapshot(snapshot, () => snapshotFromRuntime(runtime))
  };
  return runtime;
};

const createRuntimeFromSnapshot = (input: {
  base: KnowledgeBaseSummary;
  snapshot: WikiSnapshot;
}): KnowledgeRuntime => {
  let runtime: KnowledgeRuntime;
  runtime = {
    base: { ...input.base },
    sources: [...input.snapshot.sources],
    pages: [...input.snapshot.pages],
    entities: [...input.snapshot.entities],
    relations: [...input.snapshot.relations],
    harness: createHarnessForSnapshot(input.snapshot, () => snapshotFromRuntime(runtime))
  };
  return runtime;
};

const createSeedRuntimes = () => [
  createRuntime({
  id: "kb_personal_profile",
  name: "个人公开表达 Wiki",
  description: "用于生成个人主页、作品集、写作主页等面向公开访问者的网站。",
  sources: [
    {
      id: "personal_source_profile",
      title: "个人简介",
      uri: "file://raw/profile.md",
      mediaType: "text/markdown",
      contentHash: "demo_profile",
      content:
        "Mingyu enjoys building thoughtful AI tools, writing about knowledge systems, and turning scattered notes into durable personal artifacts.",
      createdAt: now(),
      metadata: { demo: true, baseId: "kb_personal_profile" }
    },
    {
      id: "personal_source_projects",
      title: "项目经历",
      uri: "file://raw/projects.md",
      mediaType: "text/markdown",
      contentHash: "demo_projects",
      content:
        "Recent projects focus on personal websites, knowledge modeling, agent workflows, and tools that make complex thinking easier to revisit.",
      createdAt: now(),
      metadata: { demo: true, baseId: "kb_personal_profile" }
    }
  ],
  pages: [
    {
      id: "personal_page_index",
      kind: "index",
      title: "index.wiki",
      path: "wiki/index.wiki",
      body: "",
      entityIds: ["personal_entity_profile", "personal_entity_projects"],
      sourceIds: ["personal_source_profile", "personal_source_projects"],
      updatedAt: now()
    },
    {
      id: "personal_page_profile",
      kind: "concept",
      title: "个人简介",
      path: "wiki/profile.wiki",
      body:
        "Mingyu builds AI products around knowledge modeling, personal expression, and practical creative workflows.",
      entityIds: ["personal_entity_profile"],
      sourceIds: ["personal_source_profile"],
      updatedAt: now()
    },
    {
      id: "personal_page_projects",
      kind: "concept",
      title: "项目经历",
      path: "wiki/projects.wiki",
      body:
        "Project work centers on personal websites, structured knowledge bases, and AI-assisted creation tools.",
      entityIds: ["personal_entity_projects"],
      sourceIds: ["personal_source_projects"],
      updatedAt: now()
    }
  ],
  entities: [
    {
      id: "personal_entity_profile",
      name: "个人简介",
      kind: "concept",
      aliases: ["Profile", "About"],
      summary: "个人背景、兴趣和网站首页可表达的核心信息。",
      pageId: "personal_page_profile",
      sourceIds: ["personal_source_profile"],
      updatedAt: now()
    },
    {
      id: "personal_entity_projects",
      name: "项目经历",
      kind: "concept",
      aliases: ["Projects", "Portfolio"],
      summary: "可以被个人网站展示的项目、作品和能力线索。",
      pageId: "personal_page_projects",
      sourceIds: ["personal_source_projects"],
      updatedAt: now()
    }
  ],
  relations: [
    {
      id: "personal_relation_projects_profile",
      fromEntityId: "personal_entity_projects",
      toEntityId: "personal_entity_profile",
      predicate: "supports",
      confidence: 0.86,
      evidenceSourceIds: ["personal_source_projects"],
      note: "Project experience supports the personal narrative."
    }
  ]
}),

  createRuntime({
  id: "kb_ai_research",
  name: "AI 产品研究 Wiki",
  description: "用于生成研究展示、产品方法论、专题说明类网站。",
  sources: [
    {
      id: "research_source_harness",
      title: "Agent Harness 研究",
      uri: "file://raw/agent-harness.md",
      mediaType: "text/markdown",
      contentHash: "demo_harness",
      content:
        "A harness coordinates intent, durable state, context, tools, execution, verification, versioning, and reflection around model calls.",
      createdAt: now(),
      metadata: { demo: true, baseId: "kb_ai_research" }
    },
    {
      id: "research_source_wiki_model",
      title: "LLM Wiki 方法论",
      uri: "file://raw/wiki-model.md",
      mediaType: "text/markdown",
      contentHash: "demo_wiki_model",
      content:
        "Raw sources stay immutable. A persistent wiki maintains index pages, logs, entities, relations, linting, and queryable meaning over time.",
      createdAt: now(),
      metadata: { demo: true, baseId: "kb_ai_research" }
    }
  ],
  pages: [
    {
      id: "research_page_index",
      kind: "index",
      title: "index.wiki",
      path: "wiki/index.wiki",
      body: "",
      entityIds: ["research_entity_harness", "research_entity_wiki"],
      sourceIds: ["research_source_harness", "research_source_wiki_model"],
      updatedAt: now()
    },
    {
      id: "research_page_harness",
      kind: "concept",
      title: "Agent Harness",
      path: "wiki/agent-harness.wiki",
      body:
        "Harness is the control layer around model calls: state, tools, workspace, context, verification, and long-horizon execution.",
      entityIds: ["research_entity_harness"],
      sourceIds: ["research_source_harness"],
      updatedAt: now()
    },
    {
      id: "research_page_wiki_model",
      kind: "concept",
      title: "LLM Wiki",
      path: "wiki/llm-wiki.wiki",
      body:
        "The wiki layer transforms raw notes into persistent meaning through index, log, entity pages, relations, and lint operations.",
      entityIds: ["research_entity_wiki"],
      sourceIds: ["research_source_wiki_model"],
      updatedAt: now()
    }
  ],
  entities: [
    {
      id: "research_entity_harness",
      name: "Agent Harness",
      kind: "concept",
      aliases: ["Harness", "Orchestration"],
      summary: "模型外部的总控层，负责状态、工具、上下文和执行。",
      pageId: "research_page_harness",
      sourceIds: ["research_source_harness"],
      updatedAt: now()
    },
    {
      id: "research_entity_wiki",
      name: "LLM Wiki",
      kind: "concept",
      aliases: ["Persistent Wiki", "Wiki Model"],
      summary: "把不可变原始资料维护成可查询、可编译的意义层。",
      pageId: "research_page_wiki_model",
      sourceIds: ["research_source_wiki_model"],
      updatedAt: now()
    }
  ],
  relations: [
    {
      id: "research_relation_wiki_harness",
      fromEntityId: "research_entity_wiki",
      toEntityId: "research_entity_harness",
      predicate: "feeds_context",
      confidence: 0.9,
      evidenceSourceIds: ["research_source_wiki_model", "research_source_harness"],
      note: "The maintained wiki feeds high-quality context into the harness."
    }
  ]
})
];

const userStates = new Map<string, StudioUserState>();
const STUDIO_STATE_PATH =
  process.env.PWH_STUDIO_STATE_PATH || path.join(".pwh-studio", "state.json");
let storeLoaded = false;
const postgresHydratedUserIds = new Set<string>();
const buildQueue: Array<{ userId: string; jobId: string }> = [];
let buildQueueRunning = false;
const buildJobMirrorPromises = new Map<string, Promise<void>>();
const externalBuildWorkerEnabled = () =>
  process.env.PWH_BUILD_WORKER_MODE?.toLowerCase() === "external" ||
  process.env.PWH_DISABLE_IN_PROCESS_WORKER?.toLowerCase() === "true" ||
  process.env.PWH_DISABLE_IN_PROCESS_WORKER === "1";

const defaultRuntime = (state: StudioUserState) => {
  const runtime = state.runtimes[0];
  if (!runtime) {
    throw new Error("No knowledge base runtime is available.");
  }
  return runtime;
};

const findRuntime = (state: StudioUserState, baseId?: string | null) =>
  state.runtimes.find((runtime) => runtime.base.id === baseId) ?? defaultRuntime(state);

const summarize = (text: string, max = 150) => {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
};

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "") || "source";

const sourceContentHash = (content: string) => createHash("sha256").update(content).digest("hex");

const createStudioWikiLintIssue = (input: {
  severity?: WikiLintIssue["severity"];
  code: string;
  message: string;
  pageId?: string;
  entityId?: string;
  sourceIds?: string[];
}): WikiLintIssue => {
  const issue: WikiLintIssue = {
    id: `wiki_lint_${sourceContentHash(`${input.code}:${input.message}`).slice(0, 12)}`,
    severity: input.severity ?? "warning",
    code: input.code,
    message: input.message,
    sourceIds: input.sourceIds ?? [],
    createdAt: now()
  };
  if (input.pageId) issue.pageId = input.pageId;
  if (input.entityId) issue.entityId = input.entityId;
  return issue;
};

const lintKnowledgeRuntime = (runtime: KnowledgeRuntime): WikiLintIssue[] => {
  const issues: WikiLintIssue[] = [];
  const sourceIds = new Set(runtime.sources.map((source) => source.id));
  const entityIds = new Set(runtime.entities.map((entity) => entity.id));
  const pageIds = new Set(runtime.pages.map((page) => page.id));
  const sourceHashOwner = new Map<string, SourceDocument>();

  for (const source of runtime.sources) {
    if (sourceHashOwner.has(source.contentHash)) {
      issues.push(
        createStudioWikiLintIssue({
          severity: "info",
          code: "duplicate-source-hash",
          message: `资料「${source.title}」与「${sourceHashOwner.get(source.contentHash)?.title}」内容 hash 相同。`,
          sourceIds: [source.id, sourceHashOwner.get(source.contentHash)?.id ?? ""].filter(Boolean)
        })
      );
    } else {
      sourceHashOwner.set(source.contentHash, source);
    }
    if ((source.contentMode ?? "inline") === "metadata-only") {
      issues.push(
        createStudioWikiLintIssue({
          severity: "warning",
          code: "source-needs-extraction",
          message: `资料「${source.title}」已保存但暂未提取到正文，需要后续重新处理或补充文本。`,
          sourceIds: [source.id]
        })
      );
    }
  }

  for (const page of runtime.pages) {
    const missingSources = page.sourceIds.filter((sourceId) => !sourceIds.has(sourceId));
    const missingEntities = page.entityIds.filter((entityId) => !entityIds.has(entityId));
    if (missingSources.length || missingEntities.length) {
      issues.push(
        createStudioWikiLintIssue({
          severity: "error",
          code: "page-broken-refs",
          message: `页面「${page.title}」存在失效引用。`,
          pageId: page.id,
          sourceIds: missingSources
        })
      );
    }
    if (page.kind !== "index" && page.kind !== "log" && !page.sourceIds.length && !page.entityIds.length) {
      issues.push(
        createStudioWikiLintIssue({
          severity: "warning",
          code: "orphan-wiki-page",
          message: `页面「${page.title}」没有连接到资料或实体。`,
          pageId: page.id
        })
      );
    }
  }

  for (const entity of runtime.entities) {
    const missingSources = entity.sourceIds.filter((sourceId) => !sourceIds.has(sourceId));
    if (!entity.sourceIds.length || missingSources.length || (entity.pageId && !pageIds.has(entity.pageId))) {
      issues.push(
        createStudioWikiLintIssue({
          severity: missingSources.length ? "error" : "warning",
          code: "entity-source-gap",
          message: `实体「${entity.name}」缺少有效资料证据或页面引用。`,
          entityId: entity.id,
          sourceIds: missingSources
        })
      );
    }
  }

  return issues;
};

const createStudioWikiCuratorExecutor = (sources: SourceDocument[]): SubAgentExecutor | undefined => {
  if (!isStudioLlmUseCaseEnabled("wiki-curator")) return undefined;
  const executor = createStudioSubAgentExecutor("wiki-curator", {
    toolRegistry: createSourceDocumentToolRegistry(sources),
    maxToolRounds: 3
  });
  if (!executor) {
    console.warn("[knowledge] Wiki curator model is enabled, but no configured LLM route is available. Falling back to deterministic wiki ingest.");
  }
  return executor;
};

const createDeterministicStudioSiteExecutor = (): SubAgentExecutor => {
  const fallbackExecutor = createDryRunSubAgentExecutor();
  const carriedArtifacts: SubAgentArtifact[] = [];

  return {
    async execute(trace: SubAgentTrace): Promise<SubAgentTrace> {
      if (trace.role === "builder-agent" || trace.role === "site-planner" || trace.role === "site-compiler") {
        const traceWithCarriedArtifacts =
          trace.role === "site-compiler" ? addPriorSiteArtifactsToTrace(trace, carriedArtifacts) : trace;
        const recoveredTrace = createDeterministicSiteFallbackTrace({
          trace: traceWithCarriedArtifacts,
          failedSummary: "No model-backed site agent was configured for this local run."
        });
        carriedArtifacts.push(...(recoveredTrace.result?.artifacts ?? []));
        return recoveredTrace;
      }
      return fallbackExecutor.execute(trace);
    }
  };
};

const createStudioSiteAgentExecutor = (snapshotProvider: () => WikiSnapshot): SubAgentExecutor | undefined => {
  if (!isStudioLlmUseCaseEnabled("site-planner") && !isStudioLlmUseCaseEnabled("site-builder")) return undefined;

  const toolRegistry = createStudioSiteToolRegistry(snapshotProvider);
  const builderAgentExecutor = createStudioSubAgentExecutor("site-builder", {
    toolRegistry,
    maxToolRounds: 6
  });
  const plannerExecutor = createStudioSubAgentExecutor("site-planner", {
    toolRegistry,
    maxToolRounds: 4
  });
  const builderExecutor = createStudioSubAgentExecutor("site-builder", {
    toolRegistry,
    maxToolRounds: 4
  });
  if (!builderAgentExecutor) {
    console.warn("[site-agents] Site agents are enabled, but the builder-agent LLM route is not configured. Falling back to deterministic site planning.");
    return undefined;
  }

  const fallbackExecutor = createDryRunSubAgentExecutor();
  const carriedArtifacts: SubAgentArtifact[] = [];

  return {
    async execute(trace: SubAgentTrace): Promise<SubAgentTrace> {
      const traceWithCarriedArtifacts =
        trace.role === "site-compiler" ? addPriorSiteArtifactsToTrace(trace, carriedArtifacts) : trace;
      const executor =
        trace.role === "builder-agent"
          ? builderAgentExecutor
          : trace.role === "site-planner" && plannerExecutor
            ? plannerExecutor
          : trace.role === "site-compiler"
            ? builderExecutor ?? builderAgentExecutor
            : fallbackExecutor;
      const executed = await executor.execute(traceWithCarriedArtifacts);
      if (
        executed.status === "failed" &&
        (trace.role === "builder-agent" || trace.role === "site-planner" || trace.role === "site-compiler")
      ) {
        console.warn(
          `[site-agents] ${trace.role} failed, falling back to deterministic site draft.`,
          executed.result?.summary ?? "unknown error"
        );
        const recoveredTrace = createDeterministicSiteFallbackTrace({
          trace: traceWithCarriedArtifacts,
          failedSummary: executed.result?.summary ?? ""
        });
        carriedArtifacts.push(...(recoveredTrace.result?.artifacts ?? []));
        return recoveredTrace;
      }
      carriedArtifacts.push(...(executed.result?.artifacts ?? []));
      return executed;
    }
  };
};

const createStudioSiteToolRegistry = (snapshotProvider: () => WikiSnapshot) => {
  const tools: ToolDefinition[] = [
    {
      name: "readWikiIndex",
      description: "Read the selected knowledge base index page.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      },
      execute: async () => {
        const snapshot = snapshotProvider();
        const indexPage = snapshot.pages.find((page) => page.kind === "index" || page.path.endsWith("index.wiki"));
        return {
          found: Boolean(indexPage),
          page: indexPage ? compactWikiPage(indexPage, snapshot) : null,
          wikiSummary: summarizeWikiSnapshot(snapshot)
        };
      }
    },
    {
      name: "searchWiki",
      description: "Search pages, entities, and source titles inside the selected knowledge base.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" }
        },
        required: ["query"],
        additionalProperties: false
      },
      execute: async (input) => {
        const snapshot = snapshotProvider();
        const query = getToolString(input, "query").toLowerCase();
        const matches = (value: string) => !query || value.toLowerCase().includes(query);
        return {
          query,
          pages: snapshot.pages
            .filter((page) => matches(`${page.title}\n${page.body}`))
            .slice(0, 8)
            .map((page) => compactWikiPage(page, snapshot)),
          entities: snapshot.entities
            .filter((entity) => matches(`${entity.name}\n${entity.aliases.join(" ")}\n${entity.summary}`))
            .slice(0, 12)
            .map(compactWikiEntity),
          sources: snapshot.sources
            .filter((source) => matches(`${source.title}\n${source.uri}\n${source.content}`))
            .slice(0, 8)
            .map(compactSourceDocument)
        };
      }
    },
    {
      name: "readWikiPage",
      description: "Read one wiki page by pageId, title, or path from the selected knowledge base.",
      inputSchema: {
        type: "object",
        properties: {
          pageId: { type: "string" },
          title: { type: "string" },
          path: { type: "string" }
        },
        additionalProperties: false
      },
      execute: async (input) => {
        const snapshot = snapshotProvider();
        const pageId = getToolString(input, "pageId");
        const title = getToolString(input, "title");
        const wikiPath = getToolString(input, "path");
        const page = snapshot.pages.find(
          (candidate) =>
            (pageId && candidate.id === pageId) ||
            (title && candidate.title.toLowerCase() === title.toLowerCase()) ||
            (wikiPath && candidate.path === wikiPath)
        );
        return {
          found: Boolean(page),
          page: page ? compactWikiPage(page, snapshot, 4_000) : null
        };
      }
    },
    {
      name: "readEntity",
      description: "Read one entity by entityId or name from the selected knowledge base.",
      inputSchema: {
        type: "object",
        properties: {
          entityId: { type: "string" },
          name: { type: "string" }
        },
        additionalProperties: false
      },
      execute: async (input) => {
        const snapshot = snapshotProvider();
        const entityId = getToolString(input, "entityId");
        const name = getToolString(input, "name");
        const entity = snapshot.entities.find(
          (candidate) =>
            (entityId && candidate.id === entityId) ||
            (name && candidate.name.toLowerCase() === name.toLowerCase()) ||
            (name && candidate.aliases.some((alias) => alias.toLowerCase() === name.toLowerCase()))
        );
        return {
          found: Boolean(entity),
          entity: entity ? compactWikiEntity(entity) : null,
          pages: entity
            ? snapshot.pages
                .filter((page) => page.entityIds.includes(entity.id) || page.id === entity.pageId)
                .slice(0, 4)
                .map((page) => compactWikiPage(page, snapshot))
            : [],
          sources: entity
            ? snapshot.sources
                .filter((source) => entity.sourceIds.includes(source.id))
                .slice(0, 6)
                .map(compactSourceDocument)
            : []
        };
      }
    },
    {
      name: "readSource",
      description: "Read a bounded source excerpt from the selected knowledge base, reopening object storage when available.",
      inputSchema: {
        type: "object",
        required: ["sourceId"],
        properties: {
          sourceId: { type: "string" },
          maxBytes: { type: "number" }
        },
        additionalProperties: false
      },
      execute: async (input) => {
        const snapshot = snapshotProvider();
        const sourceId = getToolString(input, "sourceId");
        const maxBytes = getToolNumber(input, "maxBytes") ?? 16_384;
        const source = snapshot.sources.find((candidate) => candidate.id === sourceId);
        if (!source) throw new Error(`Source not found: ${sourceId}`);
        const objectKey = typeof source.metadata?.objectKey === "string" ? source.metadata.objectKey : "";
        const stored = objectKey
          ? readStoredObjectExcerpt({
              objectKey,
              fileName: typeof source.metadata?.originalFileName === "string" ? source.metadata.originalFileName : source.title,
              mediaType: source.mediaType,
              maxBytes
            })
          : null;
        return {
          id: source.id,
          title: source.title,
          uri: source.uri,
          mediaType: source.mediaType,
          contentMode: source.contentMode ?? "inline",
          objectKey: objectKey || null,
          byteSize: source.byteSize ?? stored?.byteSize ?? null,
          content: (stored?.content || source.content).slice(0, maxBytes)
        };
      }
    },
    {
      name: "readToolManifest",
      description: "Read the shared tool manifest available to site planning, site building, and verification roles.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false
      },
      execute: async () => ({
        tools: compactStudioToolManifest()
      })
    },
    {
      name: "createSitePlan",
      description: "Stage a proposed ContentModel and SitePlan shape before returning final artifacts.",
      inputSchema: {
        type: "object",
        properties: {
          contentModel: { type: "object" },
          sitePlan: { type: "object" }
        },
        additionalProperties: true
      },
      execute: async (input) => ({
        accepted: true,
        reminder:
          "Return final artifacts in the assistant JSON: one kind=content-model with data, and one kind=site-plan with data.",
        received: compactToolPayload(input)
      })
    },
    {
      name: "searchDesignAssets",
      description: "Search all UI design assets: components, patterns, templates, skills, tools, and MCP-sourced candidates.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          kind: { type: "string" },
          role: { type: "string" },
          provider: { type: "string" },
          limit: { type: "number" }
        },
        additionalProperties: false
      },
      execute: async (input) => {
        const query = getToolString(input, "query");
        const kind = getToolString(input, "kind");
        const role = getToolString(input, "role");
        const provider = getToolString(input, "provider");
        const limit = getToolNumber(input, "limit");
        const searchInput: Parameters<typeof searchSiteDesignAssets>[0] = {};
        if (query) searchInput.query = query;
        if (kind) searchInput.kind = kind as NonNullable<Parameters<typeof searchSiteDesignAssets>[0]["kind"]>;
        if (role) searchInput.role = role as NonNullable<Parameters<typeof searchSiteDesignAssets>[0]["role"]>;
        if (provider) searchInput.provider = provider as NonNullable<Parameters<typeof searchSiteDesignAssets>[0]["provider"]>;
        if (limit !== undefined) searchInput.limit = limit;
        return { assets: searchSiteDesignAssets(searchInput) };
      }
    },
    {
      name: "readDesignAsset",
      description: "Read constraints, examples, install hints, and provider metadata for one UI design asset.",
      inputSchema: {
        type: "object",
        properties: {
          assetId: { type: "string" }
        },
        required: ["assetId"],
        additionalProperties: false
      },
      execute: async (input) => {
        const assetId = getToolString(input, "assetId");
        const asset = readSiteDesignAsset(assetId);
        if (!asset) throw new Error(`Design asset not found: ${assetId}`);
        return asset;
      }
    },
    {
      name: "recommendDesignAssets",
      description: "Recommend UI design assets for a site type, audience, and style brief.",
      inputSchema: {
        type: "object",
        properties: {
          siteType: { type: "string" },
          audience: { type: "string" },
          style: { type: "string" },
          limit: { type: "number" }
        },
        additionalProperties: false
      },
      execute: async (input) => {
        const recommendationInput: Parameters<typeof recommendSiteDesignAssets>[0] = {};
        const siteType = getToolString(input, "siteType");
        const audience = getToolString(input, "audience");
        const style = getToolString(input, "style");
        const limit = getToolNumber(input, "limit");
        if (siteType) recommendationInput.siteType = siteType;
        if (audience) recommendationInput.audience = audience;
        if (style) recommendationInput.style = style;
        if (limit !== undefined) recommendationInput.limit = limit;
        return { assets: recommendSiteDesignAssets(recommendationInput) };
      }
    },
    {
      name: "searchDesignComponents",
      description: "Search the curated design component registry, including MCP-sourced Magic UI candidates.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
          role: { type: "string" },
          limit: { type: "number" }
        },
        additionalProperties: false
      },
      execute: async (input) => {
        const query = getToolString(input, "query");
        const role = getToolString(input, "role");
        const limit = getToolNumber(input, "limit");
        const searchInput: Parameters<typeof searchSiteDesignComponents>[0] = {};
        if (query) searchInput.query = query;
        if (role) searchInput.role = role as NonNullable<Parameters<typeof searchSiteDesignComponents>[0]["role"]>;
        if (limit !== undefined) searchInput.limit = limit;
        return { components: searchSiteDesignComponents(searchInput) };
      }
    },
    {
      name: "readDesignComponent",
      description: "Read constraints, usage guidance, and MCP source metadata for a selected design component.",
      inputSchema: {
        type: "object",
        properties: {
          componentId: { type: "string" }
        },
        required: ["componentId"],
        additionalProperties: false
      },
      execute: async (input) => {
        const componentId = getToolString(input, "componentId");
        const component = readSiteDesignComponent(componentId);
        if (!component) throw new Error(`Design component not found: ${componentId}`);
        return component;
      }
    },
    {
      name: "compileSite",
      description: "Create a draft static HTML artifact from a content model and site plan.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string" },
          contentModel: { type: "object" },
          sitePlan: { type: "object" }
        },
        additionalProperties: true
      },
      execute: async (input) => {
        const title = getToolString(input, "title") || "Draft Site";
        return {
          artifactRef: `site-artifact:${slugify(title)}-${Date.now()}`,
          title,
          html: renderMinimalDraftHtml(title, input),
          note: "This draft artifact is still verified and versioned by the harness before publishing."
        };
      }
    },
    {
      name: "writeSiteArtifact",
      description: "Record the compiled site artifact reference for the current run.",
      inputSchema: {
        type: "object",
        properties: {
          artifactRef: { type: "string" },
          html: { type: "string" }
        },
        additionalProperties: true
      },
      execute: async (input) => ({
        recorded: true,
        artifactRef: getToolString(input, "artifactRef") || `site-artifact:${Date.now()}`,
        byteLength: JSON.stringify(input ?? {}).length
      })
    }
  ];

  return createToolRegistry(tools);
};

const createDeterministicSiteFallbackTrace = (input: {
  trace: SubAgentTrace;
  failedSummary: string;
}): SubAgentTrace => {
  const finishedAt = now();
  const artifacts =
    input.trace.role === "builder-agent"
      ? createDeterministicBuilderArtifacts(input.trace)
      : input.trace.role === "site-planner"
      ? createDeterministicPlanningArtifacts(input.trace)
      : input.trace.role === "site-compiler"
        ? createDeterministicCompilerArtifacts(input.trace)
        : [];
  const artifactRefs = uniqueList(artifacts.map((artifact) => artifact.ref ?? `${artifact.kind}:${artifact.id}`));
  const evidenceRefs = input.trace.packet.inputs
    .filter((entry) => entry.kind === "wiki-index" || entry.kind === "wiki-page" || entry.kind === "entity" || entry.kind === "source-excerpt")
    .map((entry) => `${entry.kind}:${entry.id}`);
  const mustCarryForwardRefs = uniqueList([
    `context-packet:${input.trace.packet.id}`,
    ...(input.trace.packet.requiredCarryForwardRefs ?? []),
    ...artifactRefs
  ]);

  return {
    ...input.trace,
    status: "completed",
    startedAt: input.trace.startedAt ?? finishedAt,
    finishedAt,
    result: {
      id: `${input.trace.id}_deterministic_result`,
      role: input.trace.role,
      status: "completed",
      summary: `${input.trace.role} model route failed; Studio produced a deterministic, publishable site artifact instead. ${input.failedSummary}`.trim(),
      decisions: [
        "Used selected wiki summaries and the user's build brief instead of dumping raw prompt text.",
        "Selected design asset refs from the local Studio/MCP design registry for the generated sections.",
        "Preserved source, wiki, design asset, and artifact refs for later patch builds."
      ],
      artifacts,
      evidenceRefs,
      artifactRefs,
      mustCarryForwardRefs,
      discardableContext: ["The failed model response can be discarded after the deterministic artifacts are versioned."],
      contextDeltas: [
        {
          action: "keep",
          targetId: `context-packet:${input.trace.packet.id}`,
          summary: "Keep the original packet for audit and future regeneration.",
          reason: "A later model-backed retry may need to inspect the exact bounded context."
        },
        ...artifactRefs.map((ref) => ({
          action: "keep" as const,
          targetId: ref,
          summary: `Keep deterministic artifact ${ref}.`,
          reason: "The published version and future patch builds depend on stable artifact refs."
        }))
      ],
      toolCalls: []
    }
  };
};

const createDeterministicPlanningArtifacts = (trace: SubAgentTrace): SubAgentArtifact[] => {
  const contentModel = createDeterministicContentModel(trace);
  const designUsagePlan = createDeterministicDesignUsagePlan(trace, contentModel);
  const sitePlan = createDeterministicSitePlan(trace, contentModel);
  return [
    {
      id: `${trace.id}_content_model`,
      kind: "content-model",
      title: `${contentModel.title} content model`,
      summary: "Deterministic content model assembled from selected wiki summaries and the user brief.",
      ref: `content-model:${trace.id}`,
      data: contentModel
    },
    {
      id: `${trace.id}_design_usage_plan`,
      kind: "design-usage-plan",
      title: `${contentModel.title} design usage plan`,
      summary: "Deterministic design usage plan assembled from selected section asset refs.",
      ref: `design-usage-plan:${trace.id}`,
      data: designUsagePlan
    },
    {
      id: `${trace.id}_site_plan`,
      kind: "site-plan",
      title: `${contentModel.title} site plan`,
      summary: "Deterministic single-page site plan with stable section and design asset refs.",
      ref: `site-plan:${trace.id}`,
      data: sitePlan
    }
  ];
};

const createDeterministicBuilderArtifacts = (trace: SubAgentTrace): SubAgentArtifact[] => {
  const planningArtifacts = createDeterministicPlanningArtifacts(trace);
  const compilerTrace = addPriorSiteArtifactsToTrace(trace, planningArtifacts);
  return [
    ...planningArtifacts,
    ...createDeterministicCompilerArtifacts(compilerTrace)
  ];
};

const createDeterministicCompilerArtifacts = (trace: SubAgentTrace): SubAgentArtifact[] => {
  const priorArtifacts = readPriorSiteArtifacts(trace);
  const contentModel =
    readPriorArtifactData<ContentModel>(priorArtifacts, "content-model") ?? createDeterministicContentModel(trace);
  const sitePlan = readPriorArtifactData<SitePlan>(priorArtifacts, "site-plan") ?? createDeterministicSitePlan(trace, contentModel);
  const intent = readBuildBriefFromPacket(trace);
  const html = renderMinimalDraftHtml(contentModel.title, {
    contentModel,
    sitePlan,
    style: intent.style,
    designAssetRefs: contentModel.sections.flatMap((section) => section.designAssetRefs ?? [])
  });

  return [
    {
      id: `${trace.id}_html`,
      kind: "html",
      title: `${contentModel.title} HTML`,
      summary: "Deterministic HTML artifact generated from the accepted content model and site plan.",
      ref: `site-artifact:${trace.id}`,
      data: {
        html
      }
    }
  ];
};

const createDeterministicDesignUsagePlan = (
  trace: SubAgentTrace,
  contentModel: ContentModel
): DesignUsagePlan => {
  const selectedAssets = uniqueList(
    contentModel.sections.flatMap((section) => [
      ...(section.designAssetRefs ?? []),
      ...(section.componentRefs ?? [])
    ])
  ).map((assetId) => {
    const targetSectionIds = contentModel.sections
      .filter((section) => (section.designAssetRefs ?? []).includes(assetId) || (section.componentRefs ?? []).includes(assetId))
      .map((section) => section.id);
    return {
      assetId,
      role: inferDesignAssetRole(assetId),
      targetSectionIds,
      reason: `Use ${assetId} to support the generated site's visual structure without changing wiki-grounded content.`,
      constraints: [
        "Keep content grounded in selected wiki pages.",
        "Do not expose internal build or model language.",
        "Keep layout responsive and text readable on mobile."
      ]
    };
  });

  return {
    id: `${trace.id}_design_usage_plan`,
    createdAt: now(),
    goal: "Select concrete design assets before generating the public website artifact.",
    selectedAssets,
    rejectedAssets: [],
    notes: [
      "This deterministic plan is a fallback contract; model-backed builder-agent runs should produce their own design reasoning."
    ]
  };
};

const inferDesignAssetRole = (assetId: string): DesignUsagePlan["selectedAssets"][number]["role"] => {
  if (/hero/i.test(assetId)) return "hero";
  if (/grid|background/i.test(assetId)) return "background";
  if (/blur|fade|motion|marquee/i.test(assetId)) return "motion";
  if (/card|bento/i.test(assetId)) return "card";
  if (/layout/i.test(assetId)) return "layout";
  if (/design-system|ui-skill|style-guide/i.test(assetId)) return "design-system";
  if (/type|font|typography/i.test(assetId)) return "typography";
  if (/color|palette/i.test(assetId)) return "color";
  if (/call|contact|cta/i.test(assetId)) return "call-to-action";
  return "section";
};

const createDeterministicContentModel = (trace: SubAgentTrace): ContentModel => {
  const brief = readBuildBriefFromPacket(trace);
  const wikiPages = trace.packet.inputs.filter((entry) => entry.kind === "wiki-page");
  const sourcePageIds = uniqueList(wikiPages.map((entry) => entry.id));
  const profilePage = findContextInput(wikiPages, ["简介", "profile", "关于"]);
  const projectPage = findContextInput(wikiPages, ["项目", "project", "作品"]);
  const writingPage = findContextInput(wikiPages, ["写作", "文章", "思考"]);
  const techStyle = /科技|炫酷|ai|未来|creative|tech/i.test(brief.style || brief.prompt);
  const heroAssets = techStyle ? ["magic-grid-background", "magic-blur-fade"] : ["hero-identity-thesis"];
  const proofAssets = techStyle ? ["magic-bento-grid", "card-project-proof"] : ["section-evidence-led", "card-project-proof"];
  const contactAssets = techStyle ? ["magic-vertical-marquee"] : ["section-evidence-led"];

  return {
    id: `${trace.id}_content`,
    title: brief.title,
    thesis: createPublicThesis(brief),
    audience: brief.audience,
    sourcePageIds,
    sections: [
      {
        id: "section-about",
        title: "关于我",
        purpose: "orient",
        sourceEntityIds: [],
        sourcePageIds: idsForInputs([profilePage, ...wikiPages.slice(0, 1)]),
        designAssetRefs: heroAssets,
        componentRefs: ["hero-identity-thesis"],
        contentBlocks: [
          {
            kind: "markdown",
            markdown: [
              profilePage?.summary || "围绕知识建模、AI 产品和个人表达构建工具，把分散的信息整理成可复用、可发布的作品。",
              `- 面向：${brief.audience}`,
              `- 目标：${brief.goal}`
            ].join("\n")
          }
        ]
      },
      {
        id: "section-projects",
        title: "项目与成果",
        purpose: "evidence",
        sourceEntityIds: [],
        sourcePageIds: idsForInputs([projectPage]),
        designAssetRefs: proofAssets,
        componentRefs: ["card-project-proof"],
        contentBlocks: [
          {
            kind: "markdown",
            markdown: [
              projectPage?.summary || "项目线索集中在个人网站、结构化知识库、agent workflow 和 AI 辅助创作工具。",
              "- 把个人 wiki 作为意义来源，把网站作为可发布的编译产物。",
              "- 关注可验证的项目经历、方法论和真实成果，而不是空泛标签。"
            ].join("\n")
          }
        ]
      },
      {
        id: "section-method",
        title: "方法与能力",
        purpose: "explain",
        sourceEntityIds: [],
        sourcePageIds: idsForInputs([projectPage, writingPage, profilePage]),
        designAssetRefs: ["section-evidence-led"],
        componentRefs: ["section-evidence-led"],
        contentBlocks: [
          {
            kind: "markdown",
            markdown: [
              "我更关注把复杂想法变成长期可维护的系统：从原始资料、wiki 建模、agent 流程，到最后可被访问者理解的网站表达。",
              "- 知识建模：把来源、实体、关系和事件组织成可追溯结构。",
              "- 产品构建：把需求、上下文、计划、执行和验证串成稳定流程。",
              "- 公开表达：让访问者快速理解我是谁、做过什么、适合为什么联系我。"
            ].join("\n")
          }
        ]
      },
      {
        id: "section-contact",
        title: "适合联系我的人",
        purpose: "call-to-action",
        sourceEntityIds: [],
        sourcePageIds: idsForInputs([profilePage, projectPage]),
        designAssetRefs: contactAssets,
        componentRefs: ["section-evidence-led"],
        contentBlocks: [
          {
            kind: "markdown",
            markdown: [
              `${brief.audience}如果需要一个能把知识结构、AI agent 和产品体验连接起来的人，可以从项目和方法两条线快速判断匹配度。`,
              "- 想了解项目细节：优先看「项目与成果」。",
              "- 想判断协作方式：优先看「方法与能力」。",
              "- 想继续沟通：围绕具体问题、岗位或项目场景联系。"
            ].join("\n")
          }
        ]
      }
    ]
  };
};

const createDeterministicSitePlan = (_trace: SubAgentTrace, contentModel: ContentModel): SitePlan => ({
  id: `${contentModel.id}_plan`,
  contentModelId: contentModel.id,
  generatedAt: now(),
  routes: [
    {
      path: "/",
      title: contentModel.title,
      sectionIds: contentModel.sections.map((section) => section.id)
    }
  ],
  navigation: contentModel.sections.map((section, index) => ({
    label: section.title,
    href: `#section-${index + 1}`
  }))
});

const readBuildBriefFromPacket = (trace: SubAgentTrace) => {
  const intent = trace.packet.inputs.find((entry) => entry.kind === "intent");
  const text = [intent?.summary, intent?.content, trace.packet.goal].filter(Boolean).join("\n");
  return {
    title: intent?.title || readLabeledLine(text, "网站名称") || "个人网站",
    goal: readLabeledLine(text, "目标") || "让访问者快速理解能力、项目和可信度。",
    audience: readLabeledLine(text, "受众") || "公开访问者",
    style: readLabeledLine(text, "视觉风格") || "清晰科技感",
    sections: readLabeledLine(text, "栏目").split(/[、,，]/).map((item) => item.trim()).filter(Boolean),
    prompt: text
  };
};

const readLabeledLine = (text: string, label: string) => {
  const match = text.match(new RegExp(`${label}：([^\\n]+)`));
  return match?.[1]?.trim() ?? "";
};

const createPublicThesis = (brief: ReturnType<typeof readBuildBriefFromPacket>) => {
  if (/招聘|面试|团队/.test(brief.audience)) {
    return "一个面向招聘方和未来团队的个人主页，用项目、方法和可验证成果说明我如何把知识建模与 AI 产品构建结合起来。";
  }
  return `${brief.goal} 这个网站从个人知识库中抽取公开表达线索，整理成访问者容易理解的个人介绍。`;
};

const findContextInput = (inputs: ContextPacketInput[], keywords: string[]) =>
  inputs.find((entry) => keywords.some((keyword) => entry.title.toLowerCase().includes(keyword.toLowerCase())));

const idsForInputs = (inputs: Array<ContextPacketInput | undefined>) => uniqueList(inputs.flatMap((input) => input?.id ? [input.id] : []));

const readPriorSiteArtifacts = (trace: SubAgentTrace): SubAgentArtifact[] => {
  const input = trace.packet.inputs.find((entry) => entry.id.startsWith("prior-site-artifacts:"));
  if (!input?.content) return [];
  try {
    const parsed: unknown = JSON.parse(input.content);
    return Array.isArray(parsed) ? parsed.filter(isSubAgentArtifactLike) : [];
  } catch {
    return [];
  }
};

const readPriorArtifactData = <T,>(artifacts: SubAgentArtifact[], kind: SubAgentArtifact["kind"]): T | undefined => {
  const artifact = artifacts.find((entry) => entry.kind === kind);
  return isPlainRecord(artifact?.data) ? artifact.data as T : undefined;
};

const isSubAgentArtifactLike = (value: unknown): value is SubAgentArtifact =>
  isPlainRecord(value) &&
  typeof value.id === "string" &&
  typeof value.kind === "string" &&
  typeof value.title === "string" &&
  typeof value.summary === "string";

const uniqueList = <T,>(values: T[]): T[] => [...new Set(values.filter(Boolean))];

const addPriorSiteArtifactsToTrace = (
  trace: SubAgentTrace,
  artifacts: SubAgentArtifact[]
): SubAgentTrace => {
  const relevantArtifacts = artifacts.filter(
    (artifact) =>
      artifact.kind === "content-model" ||
      artifact.kind === "design-usage-plan" ||
      artifact.kind === "site-plan" ||
      artifact.kind === "html"
  );
  if (!relevantArtifacts.length) return trace;

  const priorArtifactInput: ContextPacketInput = {
    kind: "tool-result",
    id: `prior-site-artifacts:${trace.id}`,
    title: "Prior Site Planning Artifacts",
    summary: "Structured content-model, site-plan, or html artifacts produced by earlier phases in this run.",
    content: JSON.stringify(relevantArtifacts.map(compactSubAgentArtifact))
  };
  const { inputCharCount: _inputCharCount, ...packet } = trace.packet;
  return {
    ...trace,
    packet: createContextPacket({
      ...packet,
      inputs: [...trace.packet.inputs, priorArtifactInput]
    })
  };
};

const compactWikiPage = (page: WikiPage, snapshot: WikiSnapshot, maxBodyChars = 1_600) => ({
  id: page.id,
  kind: page.kind,
  title: page.title,
  path: page.path,
  body: summarize(page.body, maxBodyChars),
  entityIds: page.entityIds,
  sourceIds: page.sourceIds,
  entities: snapshot.entities.filter((entity) => page.entityIds.includes(entity.id)).map(compactWikiEntity)
});

const compactWikiEntity = (entity: WikiEntity) => ({
  id: entity.id,
  name: entity.name,
  kind: entity.kind,
  aliases: entity.aliases,
  summary: entity.summary,
  pageId: entity.pageId ?? null,
  sourceIds: entity.sourceIds
});

const compactSourceDocument = (source: SourceDocument) => ({
  id: source.id,
  title: source.title,
  uri: source.uri,
  mediaType: source.mediaType,
  contentHash: source.contentHash,
  contentMode: source.contentMode ?? "inline",
  excerpt: summarize(source.content, 1_200)
});

const compactSubAgentArtifact = (artifact: SubAgentArtifact) => {
  const payload = {
    id: artifact.id,
    kind: artifact.kind,
    title: artifact.title,
    summary: artifact.summary,
    ref: artifact.ref,
    data: artifact.data
  };
  return compactToolPayload(payload, 12_000);
};

const summarizeWikiSnapshot = (snapshot: WikiSnapshot) => ({
  sourceCount: snapshot.sources.length,
  pageCount: snapshot.pages.length,
  entityCount: snapshot.entities.length,
  relationCount: snapshot.relations.length,
  pages: snapshot.pages.slice(0, 12).map((page) => ({
    id: page.id,
    title: page.title,
    kind: page.kind,
    path: page.path
  })),
  entities: snapshot.entities.slice(0, 16).map((entity) => ({
    id: entity.id,
    name: entity.name,
    kind: entity.kind,
    pageId: entity.pageId ?? null
  }))
});

const compactToolPayload = (value: unknown, maxChars = 6_000) => {
  const text = JSON.stringify(value ?? {});
  if (text.length <= maxChars) return value;
  return {
    truncated: true,
    preview: text.slice(0, maxChars)
  };
};

const getToolString = (input: unknown, field: string): string => {
  if (!isPlainRecord(input)) return "";
  const value = input[field];
  return typeof value === "string" ? value.trim() : "";
};

const getToolNumber = (input: unknown, field: string): number | undefined => {
  if (!isPlainRecord(input)) return undefined;
  const value = input[field];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const renderMinimalDraftHtml = (title: string, payload: unknown) => {
  const escapedTitle = escapeHtml(title);
  const payloadRecord = isPlainRecord(payload) ? payload : {};
  const contentModel = isPlainRecord(payloadRecord.contentModel) ? payloadRecord.contentModel : {};
  const sitePlan = isPlainRecord(payloadRecord.sitePlan) ? payloadRecord.sitePlan : {};
  const thesis = getRecordString(contentModel, "thesis") || getRecordString(payloadRecord, "thesis");
  const audience = getRecordString(contentModel, "audience") || "公开访问者";
  const sections = getRecordArray(contentModel, "sections");
  const navigation = getRecordArray(sitePlan, "navigation");
  const visualStyle = inferDraftVisualStyle(payload);
  const css = draftCssForStyle(visualStyle);
  const navItems = navigation.length
    ? navigation
    : sections.map((section, index) => ({
        label: getRecordString(section, "title") || `Section ${index + 1}`,
        href: `#section-${index + 1}`
      }));
  const fallbackPayload = summarize(JSON.stringify(compactToolPayload(payload, 1_200)), 1_200);
  const sectionHtml = sections.length
    ? sections.map((section, index) => renderDraftSection(section, index)).join("")
    : `<section class="section"><p class="eyebrow">Draft Brief</p><h2>网站草稿正在成形</h2><p>${escapeHtml(fallbackPayload)}</p></section>`;

  return [
    "<!doctype html>",
    '<html lang="zh-CN">',
    "<head>",
    '<meta charset="utf-8" />',
    '<meta name="viewport" content="width=device-width, initial-scale=1" />',
    `<title>${escapedTitle}</title>`,
    `<style>${css}</style>`,
    "</head>",
    "<body>",
    '<header class="topbar">',
    `<a class="brand" href="#">${escapedTitle}</a>`,
    '<nav aria-label="主导航">',
    ...navItems.slice(0, 6).map((item, index) => {
      const label = isPlainRecord(item) ? getRecordString(item, "label") : "";
      const href = isPlainRecord(item) ? getRecordString(item, "href") : "";
      return `<a href="${escapeAttribute(href || `#section-${index + 1}`)}">${escapeHtml(label || `Section ${index + 1}`)}</a>`;
    }),
    "</nav>",
    "</header>",
    "<main>",
    '<section class="hero">',
    '<div class="hero-copy">',
    `<p class="eyebrow">${escapeHtml(audience)}</p>`,
    `<h1>${escapedTitle}</h1>`,
    `<p class="thesis">${escapeHtml(thesis || "一个从个人 Wiki 编译出来的公开网站草稿。")}</p>`,
    "</div>",
    '<div class="hero-panel">',
    `<span>${escapeHtml(visualStyle)}</span>`,
    `<strong>${sections.length || 1}</strong>`,
    "<small>精选栏目</small>",
    "</div>",
    "</section>",
    sectionHtml,
    "</main>",
    '<footer class="footer">Generated from selected personal wiki.</footer>',
    "</body>",
    "</html>"
  ].join("");
};

const escapeHtml = (value: string) =>
  value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");

const escapeAttribute = (value: string) => escapeHtml(value).replaceAll("'", "&#39;");

const getRecordString = (record: Record<string, unknown>, field: string): string => {
  const value = record[field];
  return typeof value === "string" ? value.trim() : "";
};

const getRecordArray = (record: Record<string, unknown>, field: string): Record<string, unknown>[] => {
  const value = record[field];
  if (!Array.isArray(value)) return [];
  return value.filter(isPlainRecord);
};

const inferDraftVisualStyle = (payload: unknown) => {
  const text = JSON.stringify(payload ?? {}).toLowerCase();
  if (text.includes("科技") || text.includes("炫酷") || text.includes("tech") || text.includes("ai")) return "technology";
  if (text.includes("creative") || text.includes("创意") || text.includes("未来") || text.includes("大胆")) return "creative";
  if (text.includes("portfolio") || text.includes("作品集")) return "portfolio";
  if (text.includes("minimal") || text.includes("极简") || text.includes("简洁")) return "minimalist";
  return "editorial";
};

const renderDraftSection = (section: Record<string, unknown>, index: number) => {
  const title = getRecordString(section, "title") || `Section ${index + 1}`;
  const purpose = getRecordString(section, "purpose") || "evidence";
  const blocks = getRecordArray(section, "contentBlocks");
  const body = blocks.length
    ? blocks.map(renderDraftContentBlock).join("")
    : `<p>${escapeHtml(getRecordString(section, "summary") || "这一部分会从所选 Wiki 中抽取内容并形成公开表达。")}</p>`;

  return [
    `<section id="section-${index + 1}" class="section">`,
    `<p class="eyebrow">${escapeHtml(purpose)}</p>`,
    `<h2>${escapeHtml(title)}</h2>`,
    body,
    "</section>"
  ].join("");
};

const renderDraftContentBlock = (block: Record<string, unknown>) => {
  const kind = getRecordString(block, "kind");
  if (kind === "markdown") return markdownToDraftHtml(getRecordString(block, "markdown"));
  if (kind === "entity-list") {
    const entityIds = Array.isArray(block.entityIds) ? block.entityIds.map(String).slice(0, 8) : [];
    return `<ul class="chips">${entityIds.map((id) => `<li>${escapeHtml(id)}</li>`).join("")}</ul>`;
  }
  if (kind === "timeline") {
    const eventIds = Array.isArray(block.eventIds) ? block.eventIds.map(String).slice(0, 8) : [];
    return `<ol class="timeline">${eventIds.map((id) => `<li>${escapeHtml(id)}</li>`).join("")}</ol>`;
  }
  return "";
};

const markdownToDraftHtml = (markdown: string) => {
  const lines = markdown.split(/\n+/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return "";
  return lines
    .map((line) => {
      if (line.startsWith("- ")) return `<p class="bullet">${escapeHtml(line.slice(2))}</p>`;
      return `<p>${escapeHtml(line.replace(/^#+\s*/, ""))}</p>`;
    })
    .join("");
};

const draftCssForStyle = (style: string) => {
  const editorialTheme = { bg: "#f7f3ec", fg: "#161616", muted: "#6f675d", accent: "#b42318", panel: "#fffaf2" };
  const themes = {
    editorial: editorialTheme,
    minimalist: { bg: "#f8faf9", fg: "#10231d", muted: "#66756f", accent: "#116149", panel: "#ffffff" },
    portfolio: { bg: "#111827", fg: "#f9fafb", muted: "#cbd5e1", accent: "#7dd3fc", panel: "#1f2937" },
    technology: { bg: "#080a0f", fg: "#f4fbff", muted: "#a8b7c7", accent: "#64f4c4", panel: "#101826" },
    creative: { bg: "#fff7ed", fg: "#1f1b16", muted: "#7c6b5b", accent: "#ea580c", panel: "#ffffff" }
  };
  const theme = style in themes ? themes[style as keyof typeof themes] : editorialTheme;
  const techBackground = style === "technology"
    ? `body:before{content:"";position:fixed;inset:0;pointer-events:none;background-image:linear-gradient(color-mix(in srgb,${theme.accent} 22%,transparent) 1px,transparent 1px),linear-gradient(90deg,color-mix(in srgb,${theme.accent} 22%,transparent) 1px,transparent 1px),radial-gradient(circle at 80% 8%,color-mix(in srgb,${theme.accent} 18%,transparent),transparent 28%);background-size:44px 44px,44px 44px,100% 100%;mask-image:linear-gradient(to bottom,black,transparent 72%)}`
    : "";
  return `:root{color-scheme:${style === "technology" || style === "portfolio" ? "dark" : "light"}}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:${theme.bg};color:${theme.fg};font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.6}${techBackground}.topbar{position:sticky;top:0;z-index:5;display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px clamp(20px,5vw,72px);background:color-mix(in srgb,${theme.bg} 88%,transparent);backdrop-filter:blur(16px);border-bottom:1px solid color-mix(in srgb,${theme.fg} 12%,transparent)}.brand{color:${theme.fg};font-size:14px;font-weight:800;text-decoration:none;letter-spacing:0}nav{display:flex;gap:16px;flex-wrap:wrap}nav a{color:${theme.muted};font-size:13px;text-decoration:none}main{width:min(1120px,calc(100vw - 40px));margin:0 auto}.hero{min-height:58vh;display:grid;grid-template-columns:minmax(0,1fr) 240px;gap:40px;align-items:center;padding:72px 0 44px}.hero h1{margin:0;font-size:clamp(44px,8vw,96px);line-height:.95;letter-spacing:0}.thesis{max-width:760px;margin:24px 0 0;color:${theme.muted};font-size:clamp(18px,2.3vw,25px)}.eyebrow{margin:0 0 14px;color:${theme.accent};font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.hero-panel{min-height:220px;display:flex;flex-direction:column;justify-content:center;padding:28px;background:${theme.panel};border:1px solid color-mix(in srgb,${theme.fg} 12%,transparent);border-radius:8px;box-shadow:0 24px 80px color-mix(in srgb,${theme.accent} 12%,transparent)}.hero-panel span{color:${theme.muted};font-size:13px}.hero-panel strong{font-size:84px;line-height:1}.hero-panel small{color:${theme.muted};font-size:13px}.section{padding:46px 0;border-top:1px solid color-mix(in srgb,${theme.fg} 14%,transparent)}.section h2{max-width:840px;margin:0 0 20px;font-size:clamp(28px,4vw,52px);line-height:1.05;letter-spacing:0}.section p{max-width:820px;margin:0 0 14px;color:${theme.muted};font-size:17px}.section .bullet{position:relative;padding-left:22px;color:${theme.fg}}.section .bullet:before{content:"";position:absolute;left:0;top:.75em;width:8px;height:8px;background:${theme.accent};border-radius:999px}.chips{display:flex;flex-wrap:wrap;gap:10px;margin:0;padding:0;list-style:none}.chips li{border:1px solid color-mix(in srgb,${theme.fg} 14%,transparent);border-radius:999px;padding:8px 12px;color:${theme.muted};background:${theme.panel}}.timeline{display:grid;gap:12px;margin:0;padding-left:20px;color:${theme.muted}}.footer{width:min(1120px,calc(100vw - 40px));margin:28px auto 0;padding:30px 0 46px;color:${theme.muted};border-top:1px solid color-mix(in srgb,${theme.fg} 14%,transparent);font-size:13px}@media(max-width:760px){.topbar{align-items:flex-start;flex-direction:column}.hero{grid-template-columns:1fr;min-height:auto;padding-top:52px}.hero-panel{min-height:160px}.hero-panel strong{font-size:58px}nav{gap:10px}}`;
};

const isPlainRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const snapshotFromRuntime = (runtime: KnowledgeRuntime): WikiSnapshot => {
  const stateWiki = runtime.harness.getState().wiki;
  const snapshot: WikiSnapshot = {
    sources: runtime.sources,
    entities: runtime.entities,
    pages: runtime.pages,
    relations: runtime.relations,
    events: stateWiki.events,
    lintIssues: stateWiki.lintIssues
  };
  if (stateWiki.claims?.length) snapshot.claims = stateWiki.claims;
  if (stateWiki.ontologyExtractions?.length) snapshot.ontologyExtractions = stateWiki.ontologyExtractions;
  if (stateWiki.mutationPlans?.length) snapshot.mutationPlans = stateWiki.mutationPlans;
  return snapshot;
};

const applySnapshotToRuntime = (runtime: KnowledgeRuntime, snapshot: WikiSnapshot) => {
  runtime.sources = [...snapshot.sources];
  runtime.pages = [...snapshot.pages];
  runtime.entities = [...snapshot.entities];
  runtime.relations = [...snapshot.relations];
  refreshWikiIndex(runtime);
  runtime.harness.replaceWikiSnapshot({
    ...snapshot,
    sources: runtime.sources,
    pages: runtime.pages,
    entities: runtime.entities,
    relations: runtime.relations
  });
};

const shouldMirrorKnowledgeToPostgres = () =>
  isPostgresConfigured() &&
  (isPostgresStoreEnabled("studio") || process.env.PWH_KNOWLEDGE_STORE?.toLowerCase() === "postgres");

const shouldMirrorBuildRuntimeToPostgres = () =>
  isPostgresConfigured() &&
  (isPostgresStoreEnabled("studio") ||
    process.env.PWH_RUNTIME_STORE?.toLowerCase() === "postgres" ||
    process.env.PWH_BUILD_STORE?.toLowerCase() === "postgres");

const shouldHydrateStudioFromPostgres = () => isPostgresConfigured() && isPostgresStoreEnabled("studio");
const shouldUsePostgresBuildQueue = () =>
  isPostgresConfigured() &&
  (isPostgresStoreEnabled("studio") || process.env.PWH_BUILD_QUEUE?.toLowerCase() === "postgres");

const toJson = (value: unknown) => JSON.stringify(value ?? null);
const toJsonObject = (value: unknown) => JSON.stringify(value ?? {});
const toJsonArray = (value: unknown) => JSON.stringify(Array.isArray(value) ? value : []);
const postgresScopedId = (userId: string, id?: string | null) =>
  id ? (id.startsWith(`${userId}:`) ? id : `${userId}:${id}`) : null;
const unscopedPostgresId = (userId: string, id?: string | null) => {
  if (!id) return undefined;
  const prefix = `${userId}:`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
};
const postgresKnowledgeObjectId = (knowledgeBaseId: string, id?: string | null) =>
  id ? (id.startsWith(`${knowledgeBaseId}:`) ? id : `${knowledgeBaseId}:${id}`) : null;
const unscopedPostgresKnowledgeObjectId = (knowledgeBaseId: string, id?: string | null) => {
  if (!id) return undefined;
  const prefix = `${knowledgeBaseId}:`;
  return id.startsWith(prefix) ? id.slice(prefix.length) : id;
};
const postgresKnowledgeIdArray = (knowledgeBaseId: string, ids: string[]) =>
  JSON.stringify(ids.map((id) => postgresKnowledgeObjectId(knowledgeBaseId, id) ?? id));
const unscopedPostgresKnowledgeIdArray = (knowledgeBaseId: string, ids: unknown) =>
  asStringArray(ids).map((id) => unscopedPostgresKnowledgeObjectId(knowledgeBaseId, id) ?? id);
const dateToIso = (value: Date | string | null | undefined) =>
  value instanceof Date ? value.toISOString() : new Date(value ?? now()).toISOString();
const asRecord = (value: unknown): Record<string, unknown> => (isPlainRecord(value) ? value : {});
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asStringArray = (value: unknown) => asArray(value).map(String);
const sourceContentMode = (value: unknown): NonNullable<SourceDocument["contentMode"]> =>
  value === "referenced" || value === "excerpt" || value === "metadata-only" ? value : "inline";

const mirrorKnowledgeRuntimeToPostgres = async (userId: string, runtime: KnowledgeRuntime) => {
  if (!shouldMirrorKnowledgeToPostgres()) return;
  refreshWikiIndex(runtime);

  try {
    await queryPostgres(
      `insert into knowledge_bases (id, user_id, name, description, wiki_index, file_count, total_chars, updated_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (id) do update set
         name = excluded.name,
         description = excluded.description,
         wiki_index = excluded.wiki_index,
         file_count = excluded.file_count,
         total_chars = excluded.total_chars,
         updated_at = excluded.updated_at`,
      [
        runtime.base.id,
        userId,
        runtime.base.name,
        runtime.base.description,
        runtime.base.wikiIndex,
        runtime.base.fileCount,
        runtime.base.totalChars,
        runtime.base.updatedAt
      ]
    );

    await queryPostgres("delete from source_documents where knowledge_base_id = $1", [runtime.base.id]);
    await queryPostgres("delete from wiki_pages where knowledge_base_id = $1", [runtime.base.id]);
    await queryPostgres("delete from wiki_entities where knowledge_base_id = $1", [runtime.base.id]);
    await queryPostgres("delete from wiki_relations where knowledge_base_id = $1", [runtime.base.id]);

    for (const source of runtime.sources) {
      const metadata = source.metadata ?? {};
      const objectKey = typeof metadata.objectKey === "string" ? metadata.objectKey : null;
      await queryPostgres(
        `insert into source_documents (
          id, user_id, knowledge_base_id, title, uri, media_type, content_hash, content_mode, content, object_key, metadata, created_at, extracted_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13)
        on conflict (id) do update set
          user_id = excluded.user_id,
          knowledge_base_id = excluded.knowledge_base_id,
          title = excluded.title,
          uri = excluded.uri,
          media_type = excluded.media_type,
          content_hash = excluded.content_hash,
          content_mode = excluded.content_mode,
          content = excluded.content,
          object_key = excluded.object_key,
          metadata = excluded.metadata,
          created_at = excluded.created_at,
          extracted_at = excluded.extracted_at`,
        [
          postgresKnowledgeObjectId(runtime.base.id, source.id),
          userId,
          runtime.base.id,
          source.title,
          source.uri,
          source.mediaType,
          source.contentHash,
          source.contentMode ?? "inline",
          source.content,
          objectKey,
          JSON.stringify(metadata),
          source.createdAt,
          source.extractedAt ?? null
        ]
      );
    }

    for (const page of runtime.pages) {
      await queryPostgres(
        `insert into wiki_pages (id, knowledge_base_id, kind, title, path, body, source_ids, entity_ids, updated_at)
         values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9)
         on conflict (id) do update set
           knowledge_base_id = excluded.knowledge_base_id,
           kind = excluded.kind,
           title = excluded.title,
           path = excluded.path,
           body = excluded.body,
           source_ids = excluded.source_ids,
           entity_ids = excluded.entity_ids,
           updated_at = excluded.updated_at`,
        [
          postgresKnowledgeObjectId(runtime.base.id, page.id),
          runtime.base.id,
          page.kind,
          page.title,
          page.path,
          page.body,
          postgresKnowledgeIdArray(runtime.base.id, page.sourceIds),
          postgresKnowledgeIdArray(runtime.base.id, page.entityIds),
          page.updatedAt
        ]
      );
    }

    for (const entity of runtime.entities) {
      await queryPostgres(
        `insert into wiki_entities (id, knowledge_base_id, name, kind, aliases, summary, page_id, source_ids, updated_at)
         values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8::jsonb, $9)
         on conflict (id) do update set
           knowledge_base_id = excluded.knowledge_base_id,
           name = excluded.name,
           kind = excluded.kind,
           aliases = excluded.aliases,
           summary = excluded.summary,
           page_id = excluded.page_id,
           source_ids = excluded.source_ids,
           updated_at = excluded.updated_at`,
        [
          postgresKnowledgeObjectId(runtime.base.id, entity.id),
          runtime.base.id,
          entity.name,
          entity.kind,
          JSON.stringify(entity.aliases),
          entity.summary,
          postgresKnowledgeObjectId(runtime.base.id, entity.pageId),
          postgresKnowledgeIdArray(runtime.base.id, entity.sourceIds),
          entity.updatedAt
        ]
      );
    }

    for (const relation of runtime.relations) {
      await queryPostgres(
        `insert into wiki_relations (
          id, knowledge_base_id, from_entity_id, to_entity_id, predicate, confidence, evidence_source_ids, note
        )
        values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
        on conflict (id) do update set
          knowledge_base_id = excluded.knowledge_base_id,
          from_entity_id = excluded.from_entity_id,
          to_entity_id = excluded.to_entity_id,
          predicate = excluded.predicate,
          confidence = excluded.confidence,
          evidence_source_ids = excluded.evidence_source_ids,
          note = excluded.note`,
        [
          postgresKnowledgeObjectId(runtime.base.id, relation.id),
          runtime.base.id,
          postgresKnowledgeObjectId(runtime.base.id, relation.fromEntityId),
          postgresKnowledgeObjectId(runtime.base.id, relation.toEntityId),
          relation.predicate,
          relation.confidence,
          postgresKnowledgeIdArray(runtime.base.id, relation.evidenceSourceIds),
          relation.note
        ]
      );
    }
  } catch (error) {
    console.warn("[studio-store] Failed to mirror knowledge runtime to PostgreSQL.", error);
  }
};

const mirrorUserKnowledgeToPostgres = async (userId: string, state: StudioUserState) => {
  if (!shouldMirrorKnowledgeToPostgres()) return;
  for (const runtime of state.runtimes) {
    await mirrorKnowledgeRuntimeToPostgres(userId, runtime);
  }
  await mirrorMutationReviewsToPostgres(userId, state);
};

const mirrorMutationReviewToPostgres = async (userId: string, entry: KnowledgeMutationReview) => {
  if (!shouldMirrorKnowledgeToPostgres()) return;

  try {
    await queryPostgres(
      `insert into knowledge_mutation_reviews (
        id, user_id, knowledge_base_id, plan_id, status, source, mutation_plan, review,
        model_backed, rejected_candidate_count, created_at, updated_at, decided_at
      )
      values ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11, $12, $13)
      on conflict (id) do update set
        plan_id = excluded.plan_id,
        status = excluded.status,
        source = excluded.source,
        mutation_plan = excluded.mutation_plan,
        review = excluded.review,
        model_backed = excluded.model_backed,
        rejected_candidate_count = excluded.rejected_candidate_count,
        updated_at = excluded.updated_at,
        decided_at = excluded.decided_at`,
      [
        entry.id,
        userId,
        entry.baseId,
        entry.planId,
        entry.status,
        toJsonObject(entry.source),
        toJsonObject(entry.mutationPlan),
        toJsonObject(entry.review),
        entry.modelBacked,
        entry.rejectedCandidateCount,
        entry.createdAt,
        entry.updatedAt,
        entry.decidedAt ?? null
      ]
    );
  } catch (error) {
    console.warn("[studio-store] Failed to mirror knowledge mutation review to PostgreSQL.", error);
  }
};

const mirrorMutationReviewsToPostgres = async (userId: string, state: StudioUserState) => {
  if (!shouldMirrorKnowledgeToPostgres()) return;
  for (const entry of state.mutationReviews) {
    await mirrorMutationReviewToPostgres(userId, entry);
  }
};

const mirrorBuildJobToPostgres = async (userId: string, job: BuildJob) => {
  if (!shouldMirrorBuildRuntimeToPostgres()) return;
  const knowledgeBaseId = job.intent.knowledgeBaseId;
  if (!knowledgeBaseId) return;

  try {
    await queryPostgres(
      `insert into build_jobs (
        id, user_id, knowledge_base_id, kind, status, intent, attempt, queue_position,
        run_id, version_id, error, created_at, updated_at, started_at, finished_at
      )
      values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      on conflict (id) do update set
        status = excluded.status,
        intent = excluded.intent,
        attempt = excluded.attempt,
        queue_position = excluded.queue_position,
        run_id = excluded.run_id,
        version_id = excluded.version_id,
        error = excluded.error,
        updated_at = excluded.updated_at,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at`,
      [
        job.id,
        userId,
        knowledgeBaseId,
        job.kind,
        job.status,
        toJsonObject(job.intent),
        job.attempt,
        job.queuePosition,
        postgresScopedId(userId, job.runId),
        postgresScopedId(userId, job.versionId),
        job.error ?? null,
        job.createdAt,
        job.updatedAt,
        job.startedAt ?? null,
        job.finishedAt ?? null
      ]
    );
  } catch (error) {
    console.warn("[studio-store] Failed to mirror build job to PostgreSQL.", error);
  }
};

const queueBuildJobMirror = (userId: string, job: BuildJob) => {
  let promise: Promise<void>;
  promise = mirrorBuildJobToPostgres(userId, job).finally(() => {
    if (buildJobMirrorPromises.get(job.id) === promise) {
      buildJobMirrorPromises.delete(job.id);
    }
  });
  buildJobMirrorPromises.set(job.id, promise);
  return promise;
};

const mirrorBuildLogToPostgres = async (event: BuildLogEvent) => {
  if (!shouldMirrorBuildRuntimeToPostgres()) return;

  const pendingJobMirror = buildJobMirrorPromises.get(event.jobId);
  if (pendingJobMirror) {
    await pendingJobMirror.catch(() => undefined);
  }

  try {
    await queryPostgres(
      `insert into build_logs (id, user_id, job_id, run_id, phase, level, message, data, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       on conflict (id) do nothing`,
      [
        event.id,
        event.userId,
        event.jobId,
        postgresScopedId(event.userId, event.runId),
        event.phase,
        event.level,
        event.message,
        toJsonObject(event.data),
        event.createdAt
      ]
    );
  } catch (error) {
    console.warn("[studio-store] Failed to mirror build log to PostgreSQL.", error);
  }
};

const mirrorHarnessRunToPostgres = async (userId: string, run: HarnessRun) => {
  if (!shouldMirrorBuildRuntimeToPostgres()) return;
  const knowledgeBaseId = run.intent.knowledgeBaseId;
  if (!knowledgeBaseId) return;

  try {
    await queryPostgres(
      `insert into harness_runs (
        id, user_id, knowledge_base_id, state, intent, context_ledger, plan,
        commander_decisions, sub_agent_traces, observability_events, reflection, error, created_at
      )
      values ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12, $13)
      on conflict (id) do update set
        state = excluded.state,
        intent = excluded.intent,
        context_ledger = excluded.context_ledger,
        plan = excluded.plan,
        commander_decisions = excluded.commander_decisions,
        sub_agent_traces = excluded.sub_agent_traces,
        observability_events = excluded.observability_events,
        reflection = excluded.reflection,
        error = excluded.error`,
      [
        postgresScopedId(userId, run.id),
        userId,
        knowledgeBaseId,
        run.state,
        toJsonObject(run.intent),
        toJson(run.contextLedger ?? null),
        toJson(run.plan ?? null),
        toJsonArray(run.commanderDecisions ?? []),
        toJsonArray(run.subAgentTraces ?? []),
        toJsonArray(run.observabilityEvents ?? []),
        toJson(run.reflection ?? null),
        run.error ?? null,
        run.intent.createdAt
      ]
    );
  } catch (error) {
    console.warn("[studio-store] Failed to mirror harness run to PostgreSQL.", error);
  }
};

const mirrorBuildVersionToPostgres = async (userId: string, run: HarnessRun) => {
  if (!shouldMirrorBuildRuntimeToPostgres()) return;
  const version = run.buildVersion;
  const knowledgeBaseId = run.intent.knowledgeBaseId;
  if (!version || !knowledgeBaseId) return;

  try {
    await queryPostgres(
      `insert into build_versions (
        id, run_id, user_id, knowledge_base_id, parent_version_id, summary,
        content_model, design_usage_plan, site_plan, site_artifact, site_workspace, site_graph, patch_plan,
        run_context_manifest, lint_issues,
        change_summary, created_at
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16, $17)
      on conflict (id) do update set
        parent_version_id = excluded.parent_version_id,
        summary = excluded.summary,
        content_model = excluded.content_model,
        design_usage_plan = excluded.design_usage_plan,
        site_plan = excluded.site_plan,
        site_artifact = excluded.site_artifact,
        site_workspace = excluded.site_workspace,
        site_graph = excluded.site_graph,
        patch_plan = excluded.patch_plan,
        run_context_manifest = excluded.run_context_manifest,
        lint_issues = excluded.lint_issues,
        change_summary = excluded.change_summary`,
      [
        postgresScopedId(userId, version.id),
        postgresScopedId(userId, run.id),
        userId,
        knowledgeBaseId,
        postgresScopedId(userId, version.parentVersionId),
        version.summary,
        toJsonObject(version.contentModel),
        toJson(version.designUsagePlan ?? null),
        toJsonObject(version.sitePlan),
        toJson(version.siteArtifact ?? null),
        toJson(version.siteWorkspace ?? null),
        toJson(version.siteGraph ?? null),
        toJson(version.patchPlan ?? null),
        toJson(version.runContextManifest ?? null),
        toJsonArray(version.lintIssues),
        version.changeSummary ?? null,
        version.createdAt
      ]
    );
  } catch (error) {
    console.warn("[studio-store] Failed to mirror build version to PostgreSQL.", error);
  }
};

const mirrorRunArtifactsToPostgres = async (userId: string, run: HarnessRun) => {
  await mirrorHarnessRunToPostgres(userId, run);
  await mirrorBuildVersionToPostgres(userId, run);
};

const mirrorPublishedSiteToPostgres = async (userId: string, publication: PublishedSiteVersion) => {
  if (!shouldMirrorBuildRuntimeToPostgres()) return;

  try {
    await queryPostgres(
      `insert into published_sites (
        id, user_id, version_id, run_id, version_number, title, summary, status,
        deployment, parent_version_id, change_summary, created_at, published_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12, $13)
      on conflict (id) do update set
        version_number = excluded.version_number,
        title = excluded.title,
        summary = excluded.summary,
        status = excluded.status,
        deployment = excluded.deployment,
        parent_version_id = excluded.parent_version_id,
        change_summary = excluded.change_summary,
        published_at = excluded.published_at`,
      [
        publication.id,
        userId,
        postgresScopedId(userId, publication.versionId),
        postgresScopedId(userId, publication.runId),
        publication.versionNumber,
        publication.title,
        publication.summary,
        publication.status,
        toJson(publication.deployment ?? null),
        postgresScopedId(userId, publication.parentVersionId),
        publication.changeSummary ?? null,
        publication.createdAt,
        publication.publishedAt
      ]
    );
  } catch (error) {
    console.warn("[studio-store] Failed to mirror published site to PostgreSQL.", error);
  }
};

const mirrorUsageRecordToPostgres = async (record: UsageRecord) => {
  if (!shouldMirrorBuildRuntimeToPostgres()) return;

  try {
    await queryPostgres(
      `insert into usage_records (id, user_id, kind, quantity, cost_units, model, ref_id, metadata, created_at)
       values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       on conflict (id) do update set
         quantity = excluded.quantity,
         cost_units = excluded.cost_units,
         model = excluded.model,
         ref_id = excluded.ref_id,
         metadata = excluded.metadata`,
      [
        record.id,
        record.userId,
        record.kind,
        record.quantity,
        record.costUnits,
        record.model ?? null,
        record.refId ?? null,
        toJsonObject(record.metadata),
        record.createdAt
      ]
    );
  } catch (error) {
    console.warn("[studio-store] Failed to mirror usage record to PostgreSQL.", error);
  }
};

const mirrorPublicationArtifactsToPostgres = async (
  userId: string,
  run: HarnessRun,
  publication: PublishedSiteVersion,
  usageRecord: UsageRecord
) => {
  await mirrorRunArtifactsToPostgres(userId, run);
  await mirrorPublishedSiteToPostgres(userId, publication);
  await mirrorUsageRecordToPostgres(usageRecord);
};

const mirrorUserBuildRuntimeToPostgres = async (userId: string, state: StudioUserState) => {
  if (!shouldMirrorBuildRuntimeToPostgres()) return;
  for (const job of state.buildJobs) {
    await mirrorBuildJobToPostgres(userId, job);
  }
  for (const run of state.runs) {
    await mirrorRunArtifactsToPostgres(userId, run);
  }
  for (const publication of state.publishedSiteVersions) {
    await mirrorPublishedSiteToPostgres(userId, publication);
  }
  for (const record of state.usageRecords) {
    await mirrorUsageRecordToPostgres(record);
  }
  for (const event of state.buildLogs) {
    await mirrorBuildLogToPostgres(event);
  }
};

const claimBuildJobInPostgres = async (userId: string, jobId: string, startedAt: string) => {
  if (!shouldUsePostgresBuildQueue()) return true;
  try {
    const rows = await queryPostgres<{ id: string }>(
      `update build_jobs
       set status = 'running',
           started_at = $3,
           updated_at = $3,
           queue_position = 0,
           error = null
       where id = $1 and user_id = $2 and status = 'queued'
       returning id`,
      [jobId, userId, startedAt]
    );
    return rows.length > 0;
  } catch (error) {
    console.warn("[studio-store] Failed to claim build job in PostgreSQL.", error);
    return false;
  }
};

const recoverInterruptedBuildJobs = async (userId: string, state: StudioUserState) => {
  if (!shouldUsePostgresBuildQueue()) return;
  const recoverableJobs = state.buildJobs.filter((job) => job.status === "queued" || job.status === "running");
  if (!recoverableJobs.length) return;

  let queuePosition = 0;
  for (const job of [...recoverableJobs].reverse()) {
    queuePosition += 1;
    const wasRunning = job.status === "running";
    if (wasRunning) {
      job.status = "queued";
      job.attempt += 1;
      delete job.startedAt;
      delete job.finishedAt;
      delete job.error;
    }
    job.queuePosition = queuePosition;
    job.updatedAt = now();
    await mirrorBuildJobToPostgres(userId, job);
    if (wasRunning) {
      appendBuildLog(state, {
        userId,
        jobId: job.id,
        phase: "queued",
        level: "warn",
        message: "检测到上次未完成的生成任务，已恢复并重新排队。",
        data: {
          attempt: job.attempt,
          recoveredAt: job.updatedAt
        }
      });
    }
    enqueueBuildJobForProcessing(userId, job.id);
  }
  saveStoreState();
};

const loadPostgresKnowledgeRuntimes = async (userId: string): Promise<KnowledgeRuntime[]> => {
  const baseRows = await queryPostgres<KnowledgeBaseRow>(
    `select id, name, description, wiki_index, file_count, total_chars, updated_at
     from knowledge_bases
     where user_id = $1
     order by updated_at desc, created_at asc`,
    [userId]
  );

  const runtimes: KnowledgeRuntime[] = [];
  for (const baseRow of baseRows) {
    const [sourceRows, pageRows, entityRows, relationRows] = await Promise.all([
      queryPostgres<SourceDocumentRow>(
        `select id, title, uri, media_type, content_hash, content_mode, content, object_key, metadata, created_at, extracted_at
         from source_documents
         where user_id = $1 and knowledge_base_id = $2
         order by created_at asc`,
        [userId, baseRow.id]
      ),
      queryPostgres<WikiPageRow>(
        `select id, kind, title, path, body, source_ids, entity_ids, updated_at
         from wiki_pages
         where knowledge_base_id = $1
         order by updated_at desc, title asc`,
        [baseRow.id]
      ),
      queryPostgres<WikiEntityRow>(
        `select id, name, kind, aliases, summary, page_id, source_ids, updated_at
         from wiki_entities
         where knowledge_base_id = $1
         order by updated_at desc, name asc`,
        [baseRow.id]
      ),
      queryPostgres<WikiRelationRow>(
        `select id, from_entity_id, to_entity_id, predicate, confidence, evidence_source_ids, note
         from wiki_relations
         where knowledge_base_id = $1
         order by id asc`,
        [baseRow.id]
      )
    ]);

    const sources = sourceRows.map((row): SourceDocument => {
      const metadata: Record<string, unknown> = {
        ...asRecord(row.metadata),
        ...(row.object_key ? { objectKey: row.object_key } : {})
      };
      const source: SourceDocument = {
        id: unscopedPostgresKnowledgeObjectId(baseRow.id, row.id) ?? row.id,
        title: row.title,
        uri: row.uri,
        mediaType: row.media_type,
        contentHash: row.content_hash,
        contentMode: sourceContentMode(row.content_mode),
        content: row.content ?? "",
        createdAt: dateToIso(row.created_at),
        metadata
      };
      if (row.extracted_at) source.extractedAt = dateToIso(row.extracted_at);
      if (typeof metadata.originalUri === "string") source.originalUri = metadata.originalUri;
      const storedBytes = metadata.storedBytes ?? metadata.byteSize;
      if (typeof storedBytes === "number" && Number.isFinite(storedBytes)) source.byteSize = storedBytes;
      return source;
    });

    const pages = pageRows.map((row): WikiPage => ({
      id: unscopedPostgresKnowledgeObjectId(baseRow.id, row.id) ?? row.id,
      kind: row.kind as WikiPage["kind"],
      title: row.title,
      path: row.path,
      body: row.body,
      sourceIds: unscopedPostgresKnowledgeIdArray(baseRow.id, row.source_ids),
      entityIds: unscopedPostgresKnowledgeIdArray(baseRow.id, row.entity_ids),
      updatedAt: dateToIso(row.updated_at)
    }));

    const entities = entityRows.map((row): WikiEntity => {
      const entity: WikiEntity = {
        id: unscopedPostgresKnowledgeObjectId(baseRow.id, row.id) ?? row.id,
        name: row.name,
        kind: row.kind as WikiEntity["kind"],
        aliases: asStringArray(row.aliases),
        summary: row.summary,
        sourceIds: unscopedPostgresKnowledgeIdArray(baseRow.id, row.source_ids),
        updatedAt: dateToIso(row.updated_at)
      };
      if (row.page_id) entity.pageId = unscopedPostgresKnowledgeObjectId(baseRow.id, row.page_id) ?? row.page_id;
      return entity;
    });

    const relations = relationRows.map((row): WikiRelation => ({
      id: unscopedPostgresKnowledgeObjectId(baseRow.id, row.id) ?? row.id,
      fromEntityId: unscopedPostgresKnowledgeObjectId(baseRow.id, row.from_entity_id) ?? row.from_entity_id,
      toEntityId: unscopedPostgresKnowledgeObjectId(baseRow.id, row.to_entity_id) ?? row.to_entity_id,
      predicate: row.predicate,
      confidence: Number(row.confidence),
      evidenceSourceIds: unscopedPostgresKnowledgeIdArray(baseRow.id, row.evidence_source_ids),
      note: row.note
    }));

    runtimes.push(
      createRuntimeFromSnapshot({
        base: {
          id: baseRow.id,
          name: baseRow.name,
          description: baseRow.description,
          wikiIndex: baseRow.wiki_index,
          fileCount: baseRow.file_count,
          totalChars: baseRow.total_chars,
          updatedAt: dateToIso(baseRow.updated_at)
        },
        snapshot: {
          sources,
          pages,
          entities,
          relations,
          events: [],
          lintIssues: []
        }
      })
    );
  }

  return runtimes;
};

const loadPostgresBuildVersions = async (userId: string) => {
  const rows = await queryPostgres<BuildVersionRow>(
    `select id, run_id, parent_version_id, summary, content_model, design_usage_plan, site_plan, site_artifact,
            site_workspace, site_graph, patch_plan, run_context_manifest, lint_issues, change_summary, created_at
     from build_versions
     where user_id = $1
     order by created_at desc`,
    [userId]
  );
  const versionsById = new Map<string, BuildVersion>();
  const versionByRunId = new Map<string, BuildVersion>();

  for (const row of rows) {
    const id = unscopedPostgresId(userId, row.id) ?? row.id;
    const runId = unscopedPostgresId(userId, row.run_id) ?? row.run_id;
    const parentVersionId = unscopedPostgresId(userId, row.parent_version_id);
    const contentModel = asRecord(row.content_model) as NonNullable<BuildVersion["contentModel"]>;
    const sitePlan = asRecord(row.site_plan) as NonNullable<BuildVersion["sitePlan"]>;
    const version: BuildVersion = {
      id,
      runId,
      createdAt: dateToIso(row.created_at),
      summary: row.summary,
      contentModel,
      sitePlan,
      lintIssues: asArray(row.lint_issues) as BuildVersion["lintIssues"],
      appliedSystemSkillIds: []
    };
    if (parentVersionId) version.parentVersionId = parentVersionId;
    if (row.change_summary) version.changeSummary = row.change_summary;
    if (isPlainRecord(row.design_usage_plan)) {
      version.designUsagePlan = row.design_usage_plan as NonNullable<BuildVersion["designUsagePlan"]>;
    }
    if (isPlainRecord(row.site_artifact)) {
      version.siteArtifact = row.site_artifact as NonNullable<BuildVersion["siteArtifact"]>;
    }
    if (isPlainRecord(row.site_workspace)) {
      version.siteWorkspace = row.site_workspace as NonNullable<BuildVersion["siteWorkspace"]>;
    }
    if (isPlainRecord(row.site_graph)) {
      version.siteGraph = row.site_graph as NonNullable<BuildVersion["siteGraph"]>;
    }
    if (isPlainRecord(row.patch_plan)) {
      version.patchPlan = row.patch_plan as NonNullable<BuildVersion["patchPlan"]>;
    }
    if (isPlainRecord(row.run_context_manifest)) {
      version.runContextManifest = row.run_context_manifest as NonNullable<BuildVersion["runContextManifest"]>;
    }
    versionsById.set(id, version);
    versionByRunId.set(runId, version);
  }

  return { versionsById, versionByRunId };
};

const loadPostgresRuns = async (
  userId: string,
  versionByRunId: Map<string, BuildVersion>
): Promise<HarnessRun[]> => {
  const rows = await queryPostgres<HarnessRunRow>(
    `select id, state, intent, context_ledger, plan, commander_decisions, sub_agent_traces,
            observability_events, reflection, error, created_at
     from harness_runs
     where user_id = $1
     order by created_at desc`,
    [userId]
  );

  return rows.map((row): HarnessRun => {
    const id = unscopedPostgresId(userId, row.id) ?? row.id;
    const version = versionByRunId.get(id);
    const run: HarnessRun = {
      id,
      state: row.state,
      intent: asRecord(row.intent) as BuildIntent,
      toolCalls: []
    };
    if (isPlainRecord(row.context_ledger)) run.contextLedger = row.context_ledger as NonNullable<HarnessRun["contextLedger"]>;
    if (isPlainRecord(row.plan)) run.plan = row.plan as NonNullable<HarnessRun["plan"]>;
    if (Array.isArray(row.commander_decisions)) {
      run.commanderDecisions = row.commander_decisions as NonNullable<HarnessRun["commanderDecisions"]>;
    }
    if (Array.isArray(row.sub_agent_traces)) {
      run.subAgentTraces = row.sub_agent_traces as NonNullable<HarnessRun["subAgentTraces"]>;
    }
    if (Array.isArray(row.observability_events)) {
      run.observabilityEvents = row.observability_events as NonNullable<HarnessRun["observabilityEvents"]>;
    }
    if (isPlainRecord(row.reflection)) run.reflection = row.reflection as NonNullable<HarnessRun["reflection"]>;
    if (version) run.buildVersion = version;
    if (row.error) run.error = row.error;
    return run;
  });
};

const loadPostgresBuildJobs = async (userId: string): Promise<BuildJob[]> => {
  const rows = await queryPostgres<BuildJobRow>(
    `select id, kind, status, intent, attempt, queue_position, run_id, version_id, error,
            created_at, updated_at, started_at, finished_at
     from build_jobs
     where user_id = $1
     order by created_at desc`,
    [userId]
  );

  return rows.map((row): BuildJob => {
    const runId = unscopedPostgresId(userId, row.run_id);
    const versionId = unscopedPostgresId(userId, row.version_id);
    const job: BuildJob = {
      id: row.id,
      userId,
      kind: "site-build",
      status: row.status,
      intent: asRecord(row.intent) as BuildJob["intent"],
      createdAt: dateToIso(row.created_at),
      updatedAt: dateToIso(row.updated_at),
      attempt: row.attempt,
      queuePosition: row.queue_position
    };
    if (runId) job.runId = runId;
    if (versionId) job.versionId = versionId;
    if (row.error) job.error = row.error;
    if (row.started_at) job.startedAt = dateToIso(row.started_at);
    if (row.finished_at) job.finishedAt = dateToIso(row.finished_at);
    return job;
  });
};

const loadPostgresBuildLogs = async (userId: string): Promise<BuildLogEvent[]> => {
  const rows = await queryPostgres<BuildLogRow>(
    `select id, job_id, run_id, phase, level, message, data, created_at
     from build_logs
     where user_id = $1
     order by created_at asc`,
    [userId]
  );

  return rows.map((row): BuildLogEvent => {
    const runId = unscopedPostgresId(userId, row.run_id);
    const event: BuildLogEvent = {
      id: row.id,
      userId,
      jobId: row.job_id,
      phase: row.phase,
      level: row.level,
      message: row.message,
      createdAt: dateToIso(row.created_at),
      data: asRecord(row.data)
    };
    if (runId) event.runId = runId;
    return event;
  });
};

const loadPostgresPublications = async (
  userId: string,
  versionsById: Map<string, BuildVersion>
): Promise<PublishedSiteVersion[]> => {
  const rows = await queryPostgres<PublishedSiteRow>(
    `select id, version_id, run_id, version_number, title, summary, status, deployment,
            parent_version_id, change_summary, created_at, published_at
     from published_sites
     where user_id = $1
     order by version_number asc, published_at asc`,
    [userId]
  );

  return rows.flatMap((row): PublishedSiteVersion[] => {
    const versionId = unscopedPostgresId(userId, row.version_id) ?? row.version_id;
    const runId = unscopedPostgresId(userId, row.run_id) ?? row.run_id;
    const parentVersionId = unscopedPostgresId(userId, row.parent_version_id);
    const version = versionsById.get(versionId);
    if (!version) return [];
    const publication: PublishedSiteVersion = {
      id: row.id,
      versionId,
      runId,
      versionNumber: row.version_number,
      title: row.title,
      summary: row.summary,
      status: "published",
      createdAt: dateToIso(row.created_at),
      publishedAt: dateToIso(row.published_at),
      version
    };
    if (parentVersionId) publication.parentVersionId = parentVersionId;
    if (row.change_summary) publication.changeSummary = row.change_summary;
    if (isPlainRecord(row.deployment)) publication.deployment = row.deployment as DeploymentRecord;
    return [publication];
  });
};

const loadPostgresUsageRecords = async (userId: string): Promise<UsageRecord[]> => {
  const rows = await queryPostgres<UsageRecordRow>(
    `select id, kind, quantity, cost_units, model, ref_id, metadata, created_at
     from usage_records
     where user_id = $1
     order by created_at desc`,
    [userId]
  );

  return rows.map((row): UsageRecord => {
    const record: UsageRecord = {
      id: row.id,
      userId,
      kind: row.kind,
      quantity: Number(row.quantity),
      costUnits: Number(row.cost_units),
      createdAt: dateToIso(row.created_at),
      metadata: asRecord(row.metadata)
    };
    if (row.model) record.model = row.model;
    if (row.ref_id) record.refId = row.ref_id;
    return record;
  });
};

const loadPostgresMutationReviews = async (userId: string): Promise<KnowledgeMutationReview[]> => {
  const rows = await queryPostgres<KnowledgeMutationReviewRow>(
    `select id, knowledge_base_id, plan_id, status, source, mutation_plan, review,
            model_backed, rejected_candidate_count, created_at, updated_at, decided_at
     from knowledge_mutation_reviews
     where user_id = $1
     order by updated_at desc, created_at desc`,
    [userId]
  );

  return rows.flatMap((row): KnowledgeMutationReview[] => {
    const source = row.source as SourceDocument;
    const mutationPlan = row.mutation_plan as WikiMutationPlan;
    const review = row.review as WikiMutationPlanReview;
    if (!source?.id || !mutationPlan?.id || !review?.decision) return [];
    const entry: KnowledgeMutationReview = {
      id: row.id,
      baseId: row.knowledge_base_id,
      planId: row.plan_id,
      status: row.status === "approved" || row.status === "rejected" ? row.status : "pending",
      source,
      mutationPlan,
      review,
      modelBacked: row.model_backed,
      rejectedCandidateCount: row.rejected_candidate_count,
      createdAt: dateToIso(row.created_at),
      updatedAt: dateToIso(row.updated_at)
    };
    if (row.decided_at) entry.decidedAt = dateToIso(row.decided_at);
    return [entry];
  });
};

const loadPostgresUserState = async (userId: string): Promise<StudioUserState | null> => {
  if (!shouldHydrateStudioFromPostgres()) return null;

  try {
    const runtimes = await loadPostgresKnowledgeRuntimes(userId);
    if (!runtimes.length) return null;
    const { versionsById, versionByRunId } = await loadPostgresBuildVersions(userId);
    const [runs, publishedSiteVersions, buildJobs, buildLogs, usageRecords, mutationReviews] = await Promise.all([
      loadPostgresRuns(userId, versionByRunId),
      loadPostgresPublications(userId, versionsById),
      loadPostgresBuildJobs(userId),
      loadPostgresBuildLogs(userId),
      loadPostgresUsageRecords(userId),
      loadPostgresMutationReviews(userId)
    ]);

    return {
      runtimes,
      runs,
      publishedVersionIds: new Set(publishedSiteVersions.map((publication) => publication.versionId)),
      publishedSiteVersions,
      mutationReviews,
      buildJobs,
      buildLogs,
      usageRecords
    };
  } catch (error) {
    console.warn("[studio-store] Failed to hydrate Studio state from PostgreSQL.", error);
    return null;
  }
};

const serializeUserState = (state: StudioUserState): SerializedStudioUserState => ({
  runtimes: state.runtimes.map((runtime) => ({
    base: runtime.base,
    snapshot: snapshotFromRuntime(runtime)
  })),
  runs: state.runs,
  publishedSiteVersions: state.publishedSiteVersions,
  mutationReviews: state.mutationReviews,
  buildJobs: state.buildJobs,
  buildLogs: state.buildLogs,
  usageRecords: state.usageRecords
});

const createEmptyUserState = (): StudioUserState => ({
  runtimes: createSeedRuntimes(),
  runs: [],
  publishedVersionIds: new Set<string>(),
  publishedSiteVersions: [],
  mutationReviews: [],
  buildJobs: [],
  buildLogs: [],
  usageRecords: []
});

const deserializeUserState = (value: unknown): StudioUserState | null => {
  if (!value || typeof value !== "object") return null;
  const entry = value as Partial<SerializedStudioUserState>;
  if (!Array.isArray(entry.runtimes)) return null;

  const runtimes = entry.runtimes
    .filter((runtime): runtime is SerializedKnowledgeRuntime => Boolean(runtime?.base && runtime.snapshot))
    .map(createRuntimeFromSnapshot);
  if (!runtimes.length) return null;

  const publishedSiteVersions = Array.isArray(entry.publishedSiteVersions) ? entry.publishedSiteVersions : [];
  return {
    runtimes,
    runs: Array.isArray(entry.runs) ? entry.runs : [],
    publishedVersionIds: new Set(publishedSiteVersions.map((publication) => publication.versionId)),
    publishedSiteVersions,
    mutationReviews: Array.isArray(entry.mutationReviews) ? entry.mutationReviews : [],
    buildJobs: Array.isArray(entry.buildJobs) ? entry.buildJobs : [],
    buildLogs: Array.isArray(entry.buildLogs) ? entry.buildLogs : [],
    usageRecords: Array.isArray(entry.usageRecords) ? entry.usageRecords : []
  };
};

const loadStoreState = () => {
  if (storeLoaded) return;
  storeLoaded = true;
  if (!existsSync(STUDIO_STATE_PATH)) return;

  try {
    const parsed = JSON.parse(readFileSync(STUDIO_STATE_PATH, "utf8")) as Partial<SerializedStudioStore>;
    const users = parsed.users && typeof parsed.users === "object" ? parsed.users : {};
    for (const [userId, serializedState] of Object.entries(users)) {
      const state = deserializeUserState(serializedState);
      if (state) userStates.set(userId, state);
    }
  } catch (error) {
    console.warn("[studio-store] Failed to load persisted studio state.", error);
  }
};

const saveStoreState = () => {
  loadStoreState();
  const payload: SerializedStudioStore = {
    version: 1,
    users: Object.fromEntries(
      Array.from(userStates.entries()).map(([userId, state]) => [userId, serializeUserState(state)])
    )
  };
  mkdirSync(path.dirname(STUDIO_STATE_PATH), { recursive: true });
  writeFileSync(STUDIO_STATE_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const stateForUser = (userId: string): StudioUserState => {
  loadStoreState();
  const existing = userStates.get(userId);
  if (existing) return existing;

  const state = createEmptyUserState();
  userStates.set(userId, state);
  saveStoreState();
  return state;
};

export const prepareStudioState = async (userId: string) => {
  loadStoreState();
  if (!shouldHydrateStudioFromPostgres() || postgresHydratedUserIds.has(userId)) return;

  const hydratedState = await loadPostgresUserState(userId);
  if (hydratedState) {
    userStates.set(userId, hydratedState);
    postgresHydratedUserIds.add(userId);
    await recoverInterruptedBuildJobs(userId, hydratedState);
    return;
  }

  const fallbackState = userStates.get(userId) ?? createEmptyUserState();
  userStates.set(userId, fallbackState);
  await mirrorUserKnowledgeToPostgres(userId, fallbackState);
  await mirrorUserBuildRuntimeToPostgres(userId, fallbackState);
  postgresHydratedUserIds.add(userId);
  await recoverInterruptedBuildJobs(userId, fallbackState);
  saveStoreState();
};

const allUserStates = () => {
  loadStoreState();
  return Array.from(userStates.values());
};

const sourceCharsForState = (state: StudioUserState) =>
  state.runtimes.reduce(
    (sum, runtime) => sum + runtime.sources.reduce((sourceSum, source) => sourceSum + source.content.length, 0),
    0
  );

const quotaForUserState = (userId: string, state: StudioUserState) =>
  createQuotaSnapshot({
    userId,
    now: now(),
    sourceChars: sourceCharsForState(state),
    publishedSites: state.publishedSiteVersions.length,
    usageRecords: state.usageRecords
  });

export const recordUsage = async (
  userId: string,
  input: {
    kind: UsageRecord["kind"];
    quantity: number;
    costUnits: number;
    model?: string;
    refId?: string;
    metadata?: Record<string, unknown>;
  }
) => {
  const state = stateForUser(userId);
  const record = createUsageRecord({
    id: randomUUID(),
    userId,
    kind: input.kind,
    quantity: input.quantity,
    costUnits: input.costUnits,
    createdAt: now(),
    ...(input.model ? { model: input.model } : {}),
    ...(input.refId ? { refId: input.refId } : {}),
    ...(input.metadata ? { metadata: input.metadata } : {})
  });
  state.usageRecords.push(record);
  await mirrorUsageRecordToPostgres(record);
  saveStoreState();
  return record;
};

const appendBuildLog = (
  state: StudioUserState,
  input: Omit<BuildLogEvent, "id" | "createdAt">
): BuildLogEvent => {
  const event: BuildLogEvent = {
    id: randomUUID(),
    createdAt: now(),
    ...input
  };
  state.buildLogs.push(event);
  void mirrorBuildLogToPostgres(event);
  return event;
};

const logsForJob = (state: StudioUserState, jobId: string) =>
  state.buildLogs.filter((event) => event.jobId === jobId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));

const summarizeObservationEventTypes = (events: HarnessObservationEvent[]) => {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.type, (counts.get(event.type) ?? 0) + 1);
  }
  return [...counts.entries()].map(([type, count]) => ({ type, count }));
};

const findJob = (state: StudioUserState, jobId: string) => {
  const job = state.buildJobs.find((candidate) => candidate.id === jobId);
  if (!job) throw new Error("Build job not found.");
  return job;
};

const enqueueBuildJobForProcessing = (userId: string, jobId: string) => {
  if (!buildQueue.some((entry) => entry.userId === userId && entry.jobId === jobId)) {
    buildQueue.push({ userId, jobId });
  }
  if (externalBuildWorkerEnabled()) return;
  void processBuildQueue();
};

const processBuildQueue = async () => {
  if (buildQueueRunning) return;
  buildQueueRunning = true;
  try {
    while (buildQueue.length) {
      const next = buildQueue.shift();
      if (!next) continue;
      await processBuildJob(next.userId, next.jobId);
    }
  } finally {
    buildQueueRunning = false;
  }
};

const processBuildJob = async (userId: string, jobId: string) => {
  const state = stateForUser(userId);
  const job = findJob(state, jobId);
  if (job.status !== "queued") return;

  const startedAt = now();
  const claimed = await claimBuildJobInPostgres(userId, jobId, startedAt);
  if (!claimed) return;

  job.status = "running";
  job.startedAt = startedAt;
  job.updatedAt = startedAt;
  job.queuePosition = 0;
  await queueBuildJobMirror(userId, job);
  appendBuildLog(state, {
    userId,
    jobId,
    phase: "knowledge",
    level: "info",
    message: "已锁定本次使用的知识库，开始读取 Wiki 上下文。"
  });
  saveStoreState();

  try {
    const runtime = findRuntime(state, job.intent.knowledgeBaseId);
    appendBuildLog(state, {
      userId,
      jobId,
      phase: "planning",
      level: "info",
      message: "Harness 正在创建计划，并分发给规划与生成 worker。"
    });

    const run = await runtime.harness.run({
      ...job.intent,
      knowledgeBaseId: runtime.base.id,
      knowledgeBaseName: runtime.base.name
    });
    job.runId = run.id;
    if (run.buildVersion?.id) job.versionId = run.buildVersion.id;

    appendBuildLog(state, {
      userId,
      jobId,
      runId: run.id,
      phase: "planning",
      level: "info",
      message: `已确认 ${run.commanderDecisions?.length ?? 0} 个生成步骤。`,
      data: {
        decisions: run.commanderDecisions?.map((decision) => ({
          phase: decision.phase,
          summary: decision.summary,
          requiredToolNames: decision.requiredToolNames
        })) ?? []
      }
    });

    for (const trace of run.subAgentTraces ?? []) {
      appendBuildLog(state, {
        userId,
        jobId,
        runId: run.id,
        phase: "agent",
        level: trace.status === "failed" ? "error" : "info",
        message: `${trace.role} ${trace.status === "completed" ? "已完成" : trace.status}。`,
        data: {
          role: trace.role,
          status: trace.status,
          toolCalls: trace.result?.toolCalls.map((call) => call.toolName) ?? [],
          artifactRefs: trace.result?.artifactRefs ?? [],
          mustCarryForwardRefs: trace.result?.mustCarryForwardRefs ?? [],
          summary: trace.result?.summary ?? ""
        }
      });
    }
    appendBuildLog(state, {
      userId,
      jobId,
      runId: run.id,
      phase: "agent",
      level: "info",
      message: `Harness 行为监控已记录 ${run.observabilityEvents?.length ?? 0} 个事件。`,
      data: {
        eventTypes: summarizeObservationEventTypes(run.observabilityEvents ?? []),
        toolCalls: run.toolCalls.map((call) => ({
          toolName: call.toolName,
          status: call.status
        }))
      }
    });

    if (run.buildVersion) {
      appendBuildLog(state, {
        userId,
        jobId,
        runId: run.id,
        phase: "compile",
        level: "info",
        message: "页面内容、栏目和站点文件已经整理完成。",
        data: {
          versionId: run.buildVersion.id,
          title: run.buildVersion.contentModel?.title,
          sections: run.buildVersion.contentModel?.sections?.map((section) => section.title) ?? [],
          files: run.buildVersion.siteArtifact?.files?.map((file) => file.path) ?? []
        }
      });
      appendBuildLog(state, {
        userId,
        jobId,
        runId: run.id,
        phase: "verify",
        level: run.buildVersion.lintIssues.some((issue) => issue.severity === "error") ? "error" : "info",
        message: `已完成基础检查，发现 ${run.buildVersion.lintIssues.length} 个检查项。`,
        data: {
          lintIssues: run.buildVersion.lintIssues.map((issue) => ({
            severity: issue.severity,
            code: issue.code,
            message: issue.message
          }))
        }
      });
    }

    state.runs.unshift(run);
    const durable = await persistEveRuntimeRun({ userId, jobId, run });
    appendBuildLog(state, {
      userId,
      jobId,
      runId: run.id,
      phase: "verify",
      level: durable.sandbox.status === "ok" ? "info" : "warn",
      message: durable.sandbox.status === "ok"
        ? "已写入 eve-style durable trace，并在隔离 artifact 目录完成校验。"
        : "已写入 eve-style durable trace，但 artifact 校验需要复查。",
      data: {
        runDir: durable.runDir,
        tracePath: durable.tracePath,
        approvalsPath: durable.approvalsPath,
        artifactPath: durable.artifactPath,
        sandboxStatus: durable.sandbox.status,
        checkedFiles: durable.sandbox.checkedFiles
      }
    });
    await mirrorRunArtifactsToPostgres(userId, run);
    if (run.state === "failed") {
      job.status = "failed";
      job.error = run.error ?? "Build failed.";
      appendBuildLog(state, {
        userId,
        jobId,
        runId: run.id,
        phase: "failed",
        level: "error",
        message: job.error
      });
    } else {
      job.status = "completed";
      appendBuildLog(state, {
        userId,
        jobId,
        runId: run.id,
        phase: "version",
        level: "info",
        message: "网站草稿已生成并记录为一个可追溯版本。",
        data: {
          versionId: run.buildVersion?.id,
          lintIssues: run.buildVersion?.lintIssues.length ?? 0
        }
      });
    }

    const usageRecord = createUsageRecord({
      id: randomUUID(),
      userId,
      kind: "build",
      quantity: 1,
      costUnits: estimateBuildCostUnits(run),
      createdAt: now(),
      refId: run.id,
      metadata: {
        jobId,
        knowledgeBaseId: runtime.base.id,
        versionId: run.buildVersion?.id
      }
    });
    state.usageRecords.push(usageRecord);
    await mirrorUsageRecordToPostgres(usageRecord);
  } catch (error) {
    job.status = "failed";
    job.error = error instanceof Error ? error.message : String(error);
    appendBuildLog(state, {
      userId,
      jobId,
      phase: "failed",
      level: "error",
      message: job.error
    });
  } finally {
    job.finishedAt = now();
    job.updatedAt = job.finishedAt;
    await queueBuildJobMirror(userId, job);
    saveStoreState();
  }
};

const findNextQueuedBuildJob = async (): Promise<{ userId: string; jobId: string } | null> => {
  if (shouldUsePostgresBuildQueue()) {
    const rows = await queryPostgres<{ user_id: string; id: string }>(
      `select user_id, id
       from build_jobs
       where status = 'queued'
       order by created_at asc
       limit 1`
    );
    const row = rows[0];
    return row ? { userId: row.user_id, jobId: row.id } : null;
  }

  loadStoreState();
  for (const [userId, state] of userStates.entries()) {
    const job = [...state.buildJobs]
      .filter((candidate) => candidate.status === "queued")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
    if (job) return { userId, jobId: job.id };
  }
  return null;
};

export const runBuildWorkerOnce = async () => {
  const next = await findNextQueuedBuildJob();
  if (!next) return { processed: false as const };
  await prepareStudioState(next.userId);
  await processBuildJob(next.userId, next.jobId);
  const state = getBuildJobState(next.userId, next.jobId);
  return {
    processed: true as const,
    userId: next.userId,
    jobId: next.jobId,
    status: state.job.status,
    runId: state.job.runId,
    versionId: state.job.versionId
  };
};

const summarizeMutationReview = (entry: KnowledgeMutationReview) => ({
  id: entry.id,
  baseId: entry.baseId,
  planId: entry.planId,
  status: entry.status,
  sourceId: entry.source.id,
  sourceTitle: entry.source.title,
  sourceContent: entry.source.content,
  modelBacked: entry.modelBacked,
  rejectedCandidateCount: entry.rejectedCandidateCount,
  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,
  decision: entry.review.decision,
  candidateCount: entry.review.ontologyCandidateCount,
  reviewReasons: entry.review.reviewReasons,
  openQuestions: entry.review.openQuestions,
  ontologyCandidates: entry.review.ontologyCandidates.slice(0, 12)
});

const pendingReviewsForBase = (state: StudioUserState, baseId: string) =>
  state.mutationReviews
    .filter((entry) => entry.baseId === baseId && entry.status === "pending")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(summarizeMutationReview);

const findPendingMutationReview = (state: StudioUserState, baseId: string, reviewId: string) => {
  const entry = state.mutationReviews.find(
    (candidate) =>
      candidate.baseId === baseId &&
      candidate.status === "pending" &&
      (candidate.id === reviewId || candidate.planId === reviewId)
  );
  if (!entry) throw new Error("Pending knowledge review not found.");
  return entry;
};

const createPendingMutationReview = (input: {
  state: StudioUserState;
  runtime: KnowledgeRuntime;
  source: SourceDocument;
  mutationPlan: WikiMutationPlan;
  review: WikiMutationPlanReview;
  modelBacked: boolean;
  rejectedCandidateCount: number;
}) => {
  const createdAt = now();
  const entry: KnowledgeMutationReview = {
    id: randomUUID(),
    baseId: input.runtime.base.id,
    planId: input.mutationPlan.id,
    status: "pending",
    source: input.source,
    mutationPlan: input.mutationPlan,
    review: input.review,
    modelBacked: input.modelBacked,
    rejectedCandidateCount: input.rejectedCandidateCount,
    createdAt,
    updatedAt: createdAt
  };
  input.state.mutationReviews.unshift(entry);
  return entry;
};

function refreshWikiIndex(runtime: KnowledgeRuntime) {
  runtime.base.fileCount = runtime.sources.length;
  runtime.base.totalChars = runtime.sources.reduce((sum, source) => sum + source.content.length, 0);
  runtime.base.updatedAt = now();
  runtime.base.wikiIndex = [
    `# ${runtime.base.name}`,
    "",
    `> ${runtime.base.description}`,
    "",
    `更新：${runtime.base.updatedAt}`,
    `资料：${runtime.base.fileCount} 份 · ${runtime.base.totalChars} 字符`,
    "",
    "## 目录",
    ...runtime.pages
      .filter((page) => page.kind !== "index")
      .map((page) => `- [[${page.title}]] · ${page.body.slice(0, 90)}`),
    "",
    "## 原始资料",
    ...runtime.sources.map((source) => `- file://${source.id} · ${source.title} · ${summarize(source.content, 96)}`),
    "",
    "## 实体",
    ...runtime.entities.map((entity) => `- entity://${entity.id} · ${entity.name} · ${entity.summary}`)
  ].join("\n");

  const indexPage = runtime.pages.find((page) => page.kind === "index");
  if (indexPage) {
    indexPage.body = runtime.base.wikiIndex;
    indexPage.sourceIds = runtime.sources.map((source) => source.id);
    indexPage.entityIds = runtime.entities.map((entity) => entity.id);
    indexPage.updatedAt = runtime.base.updatedAt;
  }
}

export const getKnowledge = (userId: string, baseId?: string | null) => {
  const state = stateForUser(userId);
  state.runtimes.forEach(refreshWikiIndex);
  void mirrorUserKnowledgeToPostgres(userId, state);
  const runtime = findRuntime(state, baseId);
  return {
    bases: state.runtimes.map((entry) => entry.base),
    activeBase: runtime.base,
    sources: runtime.sources,
    pages: runtime.pages,
    entities: runtime.entities,
    relations: runtime.relations,
    lintIssues: [...runtime.harness.getState().wiki.lintIssues, ...lintKnowledgeRuntime(runtime)],
    pendingMutationReviews: pendingReviewsForBase(state, runtime.base.id)
  };
};

export const getKnowledgeBaseContext = (userId: string, baseId?: string | null) => {
  const runtime = findRuntime(stateForUser(userId), baseId);
  refreshWikiIndex(runtime);
  return runtime.base;
};

export const createKnowledgeBase = (userId: string, input: { name: string; description?: string }) => {
  const state = stateForUser(userId);
  const id = `kb_${randomUUID()}`;
  const runtime = createRuntime({
    id,
    name: input.name.trim() || "未命名知识库",
    description: input.description?.trim() || "用于创建网站的独立 Wiki 知识库。",
    sources: [],
    pages: [
      {
        id: `${id}_page_index`,
        kind: "index",
        title: "index.wiki",
        path: "wiki/index.wiki",
        body: "",
        entityIds: [],
        sourceIds: [],
        updatedAt: now()
      }
    ],
    entities: [],
    relations: []
  });
  refreshWikiIndex(runtime);
  state.runtimes.unshift(runtime);
  saveStoreState();
  void mirrorKnowledgeRuntimeToPostgres(userId, runtime);
  return runtime.base;
};

export const addSource = async (input: AddSourceInput) => {
  const state = stateForUser(input.userId);
  const runtime = findRuntime(state, input.baseId);
  const sourceId = randomUUID();
  const createdAt = now();
  const source: SourceDocument = {
    id: sourceId,
    title: input.title,
    uri: input.uri || `file://raw/${slugify(input.title)}.wiki`,
    mediaType: input.mediaType ?? "text/plain",
    contentHash: input.contentHash ?? sourceContentHash(input.content),
    content: input.content,
    contentMode: input.contentMode ?? "inline",
    createdAt,
    metadata: { ...(input.metadata ?? {}), baseId: runtime.base.id }
  };
  if (input.originalUri) source.originalUri = input.originalUri;
  if (typeof input.byteSize === "number") source.byteSize = input.byteSize;
  const previousSnapshot = snapshotFromRuntime(runtime);
  const subAgentExecutor = createStudioWikiCuratorExecutor([source]);
  const curatorResult = await createWikiMutationPlanWithOntologyCurator({
    title: runtime.base.name,
    sources: [source],
    previousSnapshot,
    occurredAt: createdAt,
    parentRunId: `studio_ingest_${runtime.base.id}`,
    ...(subAgentExecutor ? { subAgentExecutor } : {})
  });
  if (subAgentExecutor) {
    const pendingEntry = createPendingMutationReview({
      state,
      runtime,
      source,
      mutationPlan: curatorResult.mutationPlan,
      review: curatorResult.review,
      modelBacked: true,
      rejectedCandidateCount: curatorResult.rejectedCandidateCount
    });
    saveStoreState();
    await mirrorKnowledgeRuntimeToPostgres(input.userId, runtime);
    await mirrorMutationReviewToPostgres(input.userId, pendingEntry);
    if (input.byteSize) {
      await recordUsage(input.userId, {
        kind: "storage",
        quantity: input.byteSize,
        costUnits: Math.max(1, Math.ceil(input.byteSize / 1024 / 1024)),
        refId: source.id,
        metadata: {
          knowledgeBaseId: runtime.base.id,
          contentMode: source.contentMode,
          mediaType: source.mediaType,
          pendingReviewId: pendingEntry.id
        }
      });
    }
    return {
      source,
      mutationPlan: curatorResult.mutationPlan,
      review: curatorResult.review,
      pendingReview: summarizeMutationReview(pendingEntry),
      applied: false,
      modelBacked: true,
      rejectedCandidateCount: curatorResult.rejectedCandidateCount
    };
  }

  const result = applyWikiMutationPlan({
    previousSnapshot,
    mutationPlan: curatorResult.mutationPlan
  });
  applySnapshotToRuntime(runtime, result.snapshot);
  saveStoreState();
  await mirrorKnowledgeRuntimeToPostgres(input.userId, runtime);
  if (input.byteSize) {
    await recordUsage(input.userId, {
      kind: "storage",
      quantity: input.byteSize,
      costUnits: Math.max(1, Math.ceil(input.byteSize / 1024 / 1024)),
      refId: source.id,
      metadata: {
        knowledgeBaseId: runtime.base.id,
        contentMode: source.contentMode,
        mediaType: source.mediaType
      }
    });
  }
  return {
    source,
    mutationPlan: curatorResult.mutationPlan,
    review: curatorResult.review,
    applied: true,
    modelBacked: Boolean(subAgentExecutor),
    rejectedCandidateCount: curatorResult.rejectedCandidateCount
  };
};

export const approveKnowledgeMutationReview = (input: { userId: string; baseId?: string; reviewId: string }) => {
  const state = stateForUser(input.userId);
  const runtime = findRuntime(state, input.baseId);
  const entry = findPendingMutationReview(state, runtime.base.id, input.reviewId);
  const result = applyWikiMutationPlan({
    previousSnapshot: snapshotFromRuntime(runtime),
    mutationPlan: entry.mutationPlan
  });
  applySnapshotToRuntime(runtime, result.snapshot);
  entry.status = "approved";
  entry.decidedAt = now();
  entry.updatedAt = entry.decidedAt;
  saveStoreState();
  void mirrorKnowledgeRuntimeToPostgres(input.userId, runtime);
  void mirrorMutationReviewToPostgres(input.userId, entry);
  return {
    mutationReview: summarizeMutationReview(entry),
    source: entry.source,
    applied: true
  };
};

export const rejectKnowledgeMutationReview = (input: { userId: string; baseId?: string; reviewId: string }) => {
  const state = stateForUser(input.userId);
  const runtime = findRuntime(state, input.baseId);
  const entry = findPendingMutationReview(state, runtime.base.id, input.reviewId);
  entry.status = "rejected";
  entry.decidedAt = now();
  entry.updatedAt = entry.decidedAt;
  saveStoreState();
  void mirrorKnowledgeRuntimeToPostgres(input.userId, runtime);
  void mirrorMutationReviewToPostgres(input.userId, entry);
  return {
    mutationReview: summarizeMutationReview(entry),
    applied: false
  };
};

export const amendKnowledgeMutationReview = async (input: {
  userId: string;
  baseId?: string;
  reviewId: string;
  title?: string;
  content?: string;
}) => {
  const state = stateForUser(input.userId);
  const runtime = findRuntime(state, input.baseId);
  const entry = findPendingMutationReview(state, runtime.base.id, input.reviewId);
  const updatedAt = now();
  const title = input.title?.trim() || entry.source.title;
  const content = input.content?.trim() || entry.source.content;
  const source: SourceDocument = {
    ...entry.source,
    title,
    content,
    contentHash: sourceContentHash(content),
    uri: entry.source.uri || `file://raw/${slugify(title)}.wiki`,
    extractedAt: updatedAt,
    metadata: {
      ...(entry.source.metadata ?? {}),
      amendedFromReviewId: entry.id
    }
  };
  const subAgentExecutor = entry.modelBacked ? createStudioWikiCuratorExecutor([source]) : undefined;
  const curatorResult = await createWikiMutationPlanWithOntologyCurator({
    title: runtime.base.name,
    sources: [source],
    previousSnapshot: snapshotFromRuntime(runtime),
    occurredAt: updatedAt,
    parentRunId: `studio_amend_${runtime.base.id}`,
    ...(subAgentExecutor ? { subAgentExecutor } : {})
  });
  entry.source = source;
  entry.planId = curatorResult.mutationPlan.id;
  entry.mutationPlan = curatorResult.mutationPlan;
  entry.review = curatorResult.review;
  entry.modelBacked = Boolean(subAgentExecutor);
  entry.rejectedCandidateCount = curatorResult.rejectedCandidateCount;
  entry.updatedAt = updatedAt;
  saveStoreState();
  await mirrorKnowledgeRuntimeToPostgres(input.userId, runtime);
  await mirrorMutationReviewToPostgres(input.userId, entry);
  return {
    mutationReview: summarizeMutationReview(entry),
    applied: false
  };
};

export const createRun = async (userId: string, input: Omit<BuildIntent, "id" | "createdAt">) => {
  const state = stateForUser(userId);
  const runtime = findRuntime(state, input.knowledgeBaseId);
  const run = await runtime.harness.run({
    ...input,
    knowledgeBaseId: runtime.base.id,
    knowledgeBaseName: runtime.base.name
  });
  state.runs.unshift(run);
  await persistEveRuntimeRun({ userId, run });
  await mirrorRunArtifactsToPostgres(userId, run);
  saveStoreState();
  return run;
};

export const getRuns = (userId: string) => stateForUser(userId).runs;

export const getDurableRunRecord = async (userId: string, runId: string): Promise<DurableRunRecord> => {
  const run = stateForUser(userId).runs.find((item) => item.id === runId);
  if (!run) throw new Error("Run not found.");
  return loadDurableRunRecord(run);
};

export const enqueueRun = async (userId: string, input: Omit<BuildIntent, "id" | "createdAt">) => {
  const state = stateForUser(userId);
  const runtime = findRuntime(state, input.knowledgeBaseId);
  const quota = quotaForUserState(userId, state);
  assertBuildQuota(quota);
  await mirrorKnowledgeRuntimeToPostgres(userId, runtime);

  const queuedJobs = state.buildJobs.filter((job) => job.status === "queued");
  const job: BuildJob = {
    id: randomUUID(),
    userId,
    kind: "site-build",
    status: "queued",
    intent: {
      ...input,
      knowledgeBaseId: runtime.base.id,
      knowledgeBaseName: runtime.base.name
    },
    createdAt: now(),
    updatedAt: now(),
    attempt: 1,
    queuePosition: queuedJobs.length + 1
  };
  state.buildJobs.unshift(job);
  await queueBuildJobMirror(userId, job);
  appendBuildLog(state, {
    userId,
    jobId: job.id,
    phase: "queued",
    level: "info",
    message: "生成任务已进入队列，会在同一个知识库边界内执行。",
    data: {
      queuePosition: job.queuePosition,
      knowledgeBaseId: runtime.base.id,
      quota
    }
  });
  saveStoreState();
  enqueueBuildJobForProcessing(userId, job.id);
  return {
    job,
    logs: logsForJob(state, job.id),
    quota
  };
};

export const getBuildJobs = (userId: string) => {
  const state = stateForUser(userId);
  return state.buildJobs;
};

export const getBuildJobState = (userId: string, jobId: string) => {
  const state = stateForUser(userId);
  const job = findJob(state, jobId);
  return {
    job,
    run: job.runId ? state.runs.find((run) => run.id === job.runId) ?? null : null,
    logs: logsForJob(state, job.id),
    quota: quotaForUserState(userId, state)
  };
};

export const getQuotaState = (userId: string) => quotaForUserState(userId, stateForUser(userId));

export const publishRunToSite = (
  userId: string,
  runId: string,
  options: { role?: "admin" | "user"; email?: string; environment?: "preview" | "production" } = {}
) => {
  const state = stateForUser(userId);
  const run = state.runs.find((item) => item.id === runId);
  if (!run?.buildVersion) {
    throw new Error("Build draft not found.");
  }
  const deploymentDecision = evaluateDeploymentPolicy({
    principal: studioRoleToEvePrincipal(userId, options.role, options.email),
    run,
    environment: options.environment ?? "preview"
  });
  if (deploymentDecision.decision === "deny") {
    throw new Error(`Deployment denied: ${deploymentDecision.reason}`);
  }
  if (deploymentDecision.decision === "review" && options.environment === "production") {
    throw new Error(`Deployment requires review: ${deploymentDecision.reason}`);
  }
  const existing = state.publishedSiteVersions.find((item) => item.versionId === run.buildVersion?.id);
  if (existing) return existing;

  const latestPublished = state.publishedSiteVersions.at(-1);
  const requestedParentVersionId = run.buildVersion.parentVersionId;
  const parentVersionId = requestedParentVersionId && state.publishedSiteVersions.some((item) => item.versionId === requestedParentVersionId)
    ? requestedParentVersionId
    : latestPublished?.versionId ?? null;
  const publicationId = randomUUID();
  const publishedAt = now();
  const publication: PublishedSiteVersion = {
    id: publicationId,
    versionId: run.buildVersion.id,
    runId: run.id,
    versionNumber: state.publishedSiteVersions.length + 1,
    title: run.buildVersion.contentModel?.title ?? run.intent.title,
    summary: run.buildVersion.summary,
    status: "published",
    createdAt: run.buildVersion.createdAt,
    publishedAt,
    parentVersionId,
    deployment: writeLocalPublishedSite({
      id: publicationId,
      userId,
      version: run.buildVersion,
      createdAt: publishedAt
    }),
    version: run.buildVersion
  };
  if (run.buildVersion.changeSummary) publication.changeSummary = run.buildVersion.changeSummary;
  if (run.intent.knowledgeBaseId) publication.knowledgeBaseId = run.intent.knowledgeBaseId;
  if (run.intent.knowledgeBaseName) publication.knowledgeBaseName = run.intent.knowledgeBaseName;
  state.publishedSiteVersions.push(publication);
  state.publishedVersionIds.add(run.buildVersion.id);
  const usageRecord = createUsageRecord({
    id: randomUUID(),
    userId,
    kind: "publish",
    quantity: 1,
    costUnits: 1,
    createdAt: now(),
    refId: publication.id,
    metadata: {
      versionId: publication.versionId,
      provider: publication.deployment?.provider,
      deploymentDecision
    }
  });
  state.usageRecords.push(usageRecord);
  void mirrorPublicationArtifactsToPostgres(userId, run, publication, usageRecord);
  const publishJobId = state.buildJobs.find((job) => job.runId === run.id)?.id ?? run.id;
  appendBuildLog(state, {
    userId,
    jobId: publishJobId,
    runId: run.id,
    phase: "publish",
    level: "info",
    message: "网站版本已发布到当前配置的发布适配器。",
    data: {
      deployment: publication.deployment,
      deploymentDecision
    }
  });
  saveStoreState();
  return publication;
};

export const getPublishedSiteFile = (userId: string, publicationId: string, filePath: string) => {
  const state = stateForUser(userId);
  const publication = state.publishedSiteVersions.find(
    (candidate) => candidate.id === publicationId || candidate.versionId === publicationId
  );
  if (!publication) throw new Error("Published site not found.");
  return readLocalPublishedSiteFile(publication.deployment, filePath);
};

export const getSiteState = (userId: string) => {
  const state = stateForUser(userId);
  const versions = state.publishedSiteVersions.map((publication) => publication.version);
  const latestPublication = state.publishedSiteVersions.at(-1) ?? null;
  return {
    latest: latestPublication?.version ?? null,
    latestPublication,
    versions,
    publishedVersions: state.publishedSiteVersions,
    runs: state.runs
  };
};

export const getSystemState = (userId: string) => {
  const userState = stateForUser(userId);
  const state = defaultRuntime(userState).harness.getState();
  const llmRuntime = getPublicStudioLlmRuntime();
  const routeByUseCase = new Map(llmRuntime.routes.map((route) => [route.useCase, route]));
  const createAgentRoute = routeByUseCase.get("create-agent");
  const wikiCuratorRoute = routeByUseCase.get("wiki-curator");
  const siteBuilderRoute = routeByUseCase.get("site-builder");
  return {
    skills: state.systemSkills.skills,
    modelRouting: state.modelRoutingPolicy.decisions,
    modelRuntime: {
      createAgentModel: createAgentRoute?.model || "not configured",
      wikiCuratorEnabled: Boolean(wikiCuratorRoute?.enabled),
      wikiCuratorModel: wikiCuratorRoute?.model || "not configured",
      siteAgentsEnabled: Boolean(siteBuilderRoute?.enabled),
      builderAgentModel: siteBuilderRoute?.model || "not configured",
      siteBuilderModel: siteBuilderRoute?.model || "not configured",
      providers: llmRuntime.providers,
      routes: llmRuntime.routes
    },
    productionRuntime: {
      readinessChecklist: productionReadinessChecklist,
      quota: quotaForUserState(userId, userState),
      designAssetRegistry: getSiteDesignAssetRegistry(),
      componentRegistry: getSiteDesignComponentRegistry(),
      storageMode: shouldHydrateStudioFromPostgres() ? "postgres-with-local-json-fallback" : "local-json",
      queueMode: shouldUsePostgresBuildQueue() ? "postgres-claim-with-in-process-worker" : "in-process"
    },
    reflections: userState.runtimes.flatMap((runtime) => runtime.harness.getState().reflections)
  };
};

export const getStats = () => {
  const states = allUserStates();
  const runtimes = states.flatMap((state) => state.runtimes);
  const runs = states.flatMap((state) => state.runs);
  const buildJobs = states.flatMap((state) => state.buildJobs);
  const usageRecords = states.flatMap((state) => state.usageRecords);
  const publishedSiteVersions = states.flatMap((state) => state.publishedSiteVersions);
  const snapshots = runtimes.map((runtime) => runtime.harness.getState());
  const wiki = runtimes.reduce(
    (acc, runtime) => {
      acc.sources += runtime.sources.length;
      acc.pages += runtime.pages.length;
      acc.entities += runtime.entities.length;
      return acc;
    },
    { sources: 0, pages: 0, entities: 0 }
  );
  return {
    projects: publishedSiteVersions.length || 1,
    sources: wiki.sources,
    wikiPages: wiki.pages,
    entities: wiki.entities,
    runs: runs.length,
    buildJobs: buildJobs.length,
    activeBuildJobs: buildJobs.filter((job) => job.status === "queued" || job.status === "running").length,
    costUnits: usageRecords.reduce((sum, record) => sum + record.costUnits, 0),
    llmCalls: usageRecords.filter((record) => record.kind === "llm").length,
    storageBytes: usageRecords
      .filter((record) => record.kind === "storage")
      .reduce((sum, record) => sum + record.quantity, 0),
    publishActions: usageRecords.filter((record) => record.kind === "publish").length,
    buildVersions: snapshots.reduce((sum, state) => sum + state.versions.length, 0),
    systemSkills: snapshots[0]?.systemSkills.skills.length ?? 0,
    reflections: snapshots.reduce((sum, state) => sum + state.reflections.length, 0)
  };
};

export const getWikiSnapshotForBase = (userId: string, baseId?: string | null): WikiSnapshot => {
  const runtime = findRuntime(stateForUser(userId), baseId);
  return {
    sources: runtime.sources,
    entities: runtime.entities,
    pages: runtime.pages,
    relations: runtime.relations,
    events: [],
    lintIssues: []
  };
};
