import {
  createContextPacket,
  createToolRegistry,
  type RequestedToolCall,
  type SubAgentArtifact,
  type SubAgentExecutor,
  type SubAgentTrace,
  type ToolDefinition,
  type ToolExecutionRecord,
  type ToolRegistry
} from "../../agent-runtime/src/index.ts";
import {
  defaultWorkflowSpec,
  HarnessOrchestrator,
  listAllowedToolsForPhase,
  validateWorkflowToolGate,
  type CommanderPhase,
  type WorkflowToolName
} from "../../harness-core/src/index.ts";
import type { BuildIntent, BuildVersion, HarnessRun, ToolCallRecord } from "../../harness-core/src/index.ts";
import {
  emptyWikiSnapshot,
  type OntologyExtraction,
  type OntologyExtractionItem,
  type OntologySlotKind,
  type SourceDocument,
  type WikiClaim,
  type WikiEntity,
  type WikiEvent,
  type WikiMutationOperation,
  type WikiMutationPlan,
  type WikiPage,
  type WikiRelation,
  type WikiSnapshot
} from "../../wiki-core/src/index.ts";

export type WorkspaceKind = "hosted" | "local";

export type SourceStorageMode = "inline" | "copy-small-files" | "reference-only";

export type SourceIndexStatus = "pending" | "indexed" | "skipped" | "failed";

export type WorkspaceSourcePolicy = {
  mode: SourceStorageMode;
  maxInlineBytes: number;
  includePatterns: string[];
  excludePatterns: string[];
  textExtraction: "on-ingest" | "on-demand";
  hashLargeFiles: "never" | "metadata-only" | "full-read";
};

export type WorkspaceSourceEntry = {
  id: string;
  title: string;
  uri: string;
  mediaType: string;
  storageMode: SourceStorageMode;
  status: SourceIndexStatus;
  indexedAt: string;
  originalUri?: string;
  workspaceUri?: string;
  sizeBytes?: number;
  modifiedAt?: string;
  contentHash?: string;
  fingerprint?: string;
  summary?: string;
  sourceDocumentId?: string;
  metadata?: Record<string, unknown>;
};

export type WikiWorkspaceManifest = {
  id: string;
  kind: WorkspaceKind;
  title: string;
  rootUri: string;
  createdAt: string;
  updatedAt: string;
  sourcePolicy: WorkspaceSourcePolicy;
  sources: WorkspaceSourceEntry[];
};

export type WorkspaceEventKind =
  | "workspace.created"
  | "source.linked"
  | "source.extracted"
  | "mutation-plan.created"
  | "mutation-plan.reviewed"
  | "mutation-plan.handoff-created"
  | "mutation-plan.applied"
  | "intent.updated"
  | "site-plan.created"
  | "site.build-started"
  | "site.build-completed"
  | "verification.completed"
  | "audit.completed"
  | "version.created"
  | "site.published"
  | "reflection.recorded";

export type WorkspaceEventActor = {
  type: "user" | "system" | "commander" | "sub-agent" | "cli";
  id?: string;
  name?: string;
};

export type WorkspaceEvent = {
  id: string;
  kind: WorkspaceEventKind;
  occurredAt: string;
  summary: string;
  actor: WorkspaceEventActor;
  workspaceId?: string;
  knowledgeBaseId?: string;
  runId?: string;
  versionId?: string;
  mutationPlanId?: string;
  sourceIds?: string[];
  pageIds?: string[];
  entityIds?: string[];
  artifactRefs?: string[];
  workflowPhaseId?: CommanderPhase;
  workflowToolName?: WorkflowToolName;
  allowedWorkflowToolNames?: WorkflowToolName[];
  payload?: Record<string, unknown>;
};

export type CreateWorkspaceEventInput = Omit<WorkspaceEvent, "id"> & {
  id?: string;
};

export type WorkspaceEventWorkflowGate = {
  phase: CommanderPhase;
  toolName: WorkflowToolName;
};

const WORKSPACE_EVENT_WORKFLOW_GATES = {
  "workspace.created": { phase: "workspace-discovery", toolName: "readManifest" },
  "source.linked": { phase: "source-linking", toolName: "linkSource" },
  "source.extracted": { phase: "ontology-ingest", toolName: "readSource" },
  "mutation-plan.created": { phase: "ontology-ingest", toolName: "createMutationPlan" },
  "mutation-plan.reviewed": { phase: "mutation-plan-review", toolName: "reviewPlan" },
  "mutation-plan.handoff-created": { phase: "mutation-plan-review", toolName: "handoffPlan" },
  "mutation-plan.applied": { phase: "wiki-maintenance", toolName: "applyPlan" },
  "intent.updated": { phase: "intent-clarification", toolName: "searchWiki" },
  "site-plan.created": { phase: "site-planning", toolName: "createSitePlan" },
  "site.build-started": { phase: "site-building", toolName: "compileSite" },
  "site.build-completed": { phase: "site-building", toolName: "writeSiteArtifact" },
  "verification.completed": { phase: "verification", toolName: "verifySite" },
  "audit.completed": { phase: "verification", toolName: "auditWorkspace" },
  "version.created": { phase: "versioning", toolName: "writeBuildVersion" },
  "site.published": { phase: "versioning", toolName: "publishVersion" },
  "reflection.recorded": { phase: "reflection", toolName: "recordReflection" }
} satisfies Record<WorkspaceEventKind, WorkspaceEventWorkflowGate>;

export const resolveWorkspaceEventWorkflowGate = (
  kind: WorkspaceEventKind
): WorkspaceEventWorkflowGate => WORKSPACE_EVENT_WORKFLOW_GATES[kind];

export const createWorkspaceEvent = (input: CreateWorkspaceEventInput): WorkspaceEvent => {
  const { id, ...rest } = input;
  const resolvedGate = resolveWorkspaceEventWorkflowGate(rest.kind);
  const workflowPhaseId = rest.workflowPhaseId ?? resolvedGate.phase;
  const workflowToolName = rest.workflowToolName ?? resolvedGate.toolName;
  const allowedWorkflowToolNames =
    rest.allowedWorkflowToolNames ?? listAllowedToolsForPhase(defaultWorkflowSpec, workflowPhaseId);
  const gate = validateWorkflowToolGate({
    spec: defaultWorkflowSpec,
    phase: workflowPhaseId,
    toolName: workflowToolName
  });

  if (!gate.allowed) {
    throw new Error(`Workflow tool gate violation: ${gate.reason}`);
  }

  return {
    ...rest,
    workflowPhaseId,
    workflowToolName,
    allowedWorkflowToolNames,
    id:
      id ??
      `workspace_event_${stableHash(
        `${rest.kind}:${rest.occurredAt}:${rest.workspaceId ?? ""}:${rest.mutationPlanId ?? ""}:${rest.summary}`
      ).slice(0, 16)}`
  };
};

export type WorkspaceVerificationStatus = "pass" | "warning" | "fail";

export type WorkspaceVerificationCheck = {
  id: string;
  title: string;
  status: WorkspaceVerificationStatus;
  message: string;
  refs: string[];
};

export type WorkspaceVerificationReport = {
  id: string;
  kind: "verify" | "audit";
  createdAt: string;
  status: WorkspaceVerificationStatus;
  summary: string;
  hardFailureCount: number;
  warningCount: number;
  checks: WorkspaceVerificationCheck[];
};

export const verifyWorkspaceState = (input: {
  manifest: WikiWorkspaceManifest;
  snapshot: WikiSnapshot;
  events?: WorkspaceEvent[];
  createdAt?: string;
}): WorkspaceVerificationReport => {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const events = input.events ?? [];
  const checks: WorkspaceVerificationCheck[] = [
    verifyManifest(input.manifest),
    verifyLocalSourcePolicy(input.manifest),
    verifySnapshotSourceRefs(input.manifest, input.snapshot),
    verifyWikiIndexAndLog(input.snapshot),
    verifyMutationPlanReviewSequence(events),
    verifyBuildVersionSequence(events),
    verifyWorkflowEventGates(events)
  ];

  return createVerificationReport({
    kind: "verify",
    createdAt,
    checks,
    summary: "Workspace verification completed."
  });
};

export const auditWorkspaceState = (input: {
  manifest: WikiWorkspaceManifest;
  snapshot: WikiSnapshot;
  events?: WorkspaceEvent[];
  createdAt?: string;
}): WorkspaceVerificationReport => {
  const createdAt = input.createdAt ?? new Date().toISOString();
  const events = input.events ?? [];
  const verification = verifyWorkspaceState({ ...input, events, createdAt });
  const checks: WorkspaceVerificationCheck[] = [
    ...verification.checks,
    auditEventLogPresence(events),
    auditMutationPlanCoverage(input.snapshot, events),
    auditBuildArtifacts(events)
  ];

  return createVerificationReport({
    kind: "audit",
    createdAt,
    checks,
    summary: "Harness audit completed."
  });
};

export type SiteArtifactFile = {
  path: string;
  mediaType: string;
  content?: string;
  sourceUri?: string;
};

export type CompiledSiteArtifact = {
  versionId: string;
  createdAt: string;
  format: "static-html" | "site-plan";
  files: SiteArtifactFile[];
};

export type WikiIngestResult = {
  snapshot: WikiSnapshot;
  mutationPlan: WikiMutationPlan;
  indexPage: WikiPage;
  logPage: WikiPage;
  sourcePages: WikiPage[];
  entities: WikiEntity[];
  event: WikiEvent;
};

export type WikiCuratorMutationPlanResult = {
  mutationPlan: WikiMutationPlan;
  ontologyExtraction: OntologyExtraction;
  subAgentTrace?: SubAgentTrace;
  review: WikiMutationPlanReview;
  rejectedCandidateCount: number;
  reviewQuestions: string[];
};

export type WikiMutationPlanReviewDecision =
  | "ready-to-apply"
  | "needs-human-review"
  | "blocked";

export type WikiMutationPlanReviewItem = {
  id: string;
  title: string;
  kind: string;
  summary: string;
};

export type WikiMutationPlanOntologyCandidateReview = {
  id: string;
  kind: OntologySlotKind;
  label: string;
  confidence: number;
  evidenceSourceIds: string[];
  evidencePageIds: string[];
  summary: string;
};

export type WikiMutationPlanReview = {
  id: string;
  title: string;
  createdAt: string;
  decision: WikiMutationPlanReviewDecision;
  recommendedNextAction: string;
  humanReviewState: WikiMutationPlan["humanReviewState"];
  sourceCount: number;
  operationCounts: Record<string, number>;
  sourceContentModes: Record<string, number>;
  expectedPageIds: string[];
  expectedEntityIds: string[];
  plannedSources: WikiMutationPlanReviewItem[];
  plannedPages: WikiMutationPlanReviewItem[];
  plannedEntities: WikiMutationPlanReviewItem[];
  ontologyCandidateCount: number;
  ontologyCandidateCounts: Record<string, number>;
  ontologyCandidates: WikiMutationPlanOntologyCandidateReview[];
  openQuestions: string[];
  reviewReasons: string[];
  blockedReasons: string[];
};

export type WikiMutationPlanReviewBatchKind =
  | "raw-sources"
  | "wiki-maintenance"
  | "ontology-candidates"
  | "navigation-log"
  | "other";

export type WikiMutationPlanReviewPriority = "low" | "normal" | "high";

export type WikiMutationPlanReviewBatch = {
  id: string;
  kind: WikiMutationPlanReviewBatchKind;
  title: string;
  summary: string;
  operationIds: string[];
  sourceIds: string[];
  targetIds: string[];
  priority: WikiMutationPlanReviewPriority;
  requiresHumanReview: boolean;
  reasons: string[];
};

export type WikiMutationPlanHandoff = {
  id: string;
  planId: string;
  createdAt: string;
  decision: WikiMutationPlanReviewDecision;
  summary: string;
  recommendedNextAction: string;
  batches: WikiMutationPlanReviewBatch[];
  evidenceRefs: string[];
  artifactRefs: string[];
  mustCarryForwardRefs: string[];
  discardableContext: string[];
};

export type WorkspaceToolRun = {
  records: ToolCallRecord[];
  outputs: Record<string, unknown>;
};

export type WorkspaceAdapter = {
  kind: WorkspaceKind;
  readManifest(): Promise<WikiWorkspaceManifest>;
  writeManifest(manifest: WikiWorkspaceManifest): Promise<void>;
  readWikiSnapshot(knowledgeBaseId?: string): Promise<WikiSnapshot>;
  writeWikiSnapshot(knowledgeBaseId: string | undefined, snapshot: WikiSnapshot): Promise<void>;
  appendWikiEvent(knowledgeBaseId: string | undefined, event: WikiEvent): Promise<void>;
  readSourceText?(entry: WorkspaceSourceEntry, options?: { maxBytes?: number }): Promise<string>;
  writeBuildVersion?(knowledgeBaseId: string | undefined, version: BuildVersion): Promise<void>;
  writeSiteArtifact?(knowledgeBaseId: string | undefined, artifact: CompiledSiteArtifact): Promise<void>;
};

export type PersonalWikiEngineOptions = {
  adapter: WorkspaceAdapter;
};

export class PersonalWikiEngine {
  private readonly adapter: WorkspaceAdapter;

  constructor(options: PersonalWikiEngineOptions) {
    this.adapter = options.adapter;
  }

  getWorkspaceKind(): WorkspaceKind {
    return this.adapter.kind;
  }

  async getManifest(): Promise<WikiWorkspaceManifest> {
    return this.adapter.readManifest();
  }

  async recordSource(entry: WorkspaceSourceEntry): Promise<WikiWorkspaceManifest> {
    const manifest = await this.adapter.readManifest();
    const nextSources = manifest.sources.some((source) => source.id === entry.id)
      ? manifest.sources.map((source) => (source.id === entry.id ? entry : source))
      : [entry, ...manifest.sources];
    const nextManifest: WikiWorkspaceManifest = {
      ...manifest,
      updatedAt: entry.indexedAt,
      sources: nextSources
    };
    await this.adapter.writeManifest(nextManifest);
    return nextManifest;
  }

  async getWikiSnapshot(knowledgeBaseId?: string): Promise<WikiSnapshot> {
    return this.adapter.readWikiSnapshot(knowledgeBaseId);
  }

  async saveWikiSnapshot(knowledgeBaseId: string | undefined, snapshot: WikiSnapshot): Promise<void> {
    await this.adapter.writeWikiSnapshot(knowledgeBaseId, snapshot);
  }

  createWorkspaceToolRegistry(): ToolRegistry {
    return createWorkspaceToolRegistry(this.adapter);
  }

  async runWorkspaceTools(input: {
    runId?: string;
    toolCalls: RequestedToolCall[];
  }): Promise<WorkspaceToolRun> {
    const registry = this.createWorkspaceToolRegistry();
    const records: ToolCallRecord[] = [];
    const outputs: Record<string, unknown> = {};

    for (const call of input.toolCalls) {
      const record = await registry.execute(call);
      records.push(toHarnessToolCallRecord(input.runId ?? "preflight", record));
      outputs[call.id] = record.status === "completed" ? record.output : { error: record.error };
    }

    return { records, outputs };
  }

  async ingestSourceDocuments(input: {
    knowledgeBaseId?: string;
    title: string;
    sources: SourceDocument[];
    previousSnapshot?: WikiSnapshot;
    occurredAt?: string;
  }): Promise<WikiIngestResult> {
    const previousSnapshot =
      input.previousSnapshot ?? (await this.adapter.readWikiSnapshot(input.knowledgeBaseId));
    const result = createWikiSnapshotFromSourceDocuments({
      ...input,
      previousSnapshot
    });
    await this.adapter.writeWikiSnapshot(input.knowledgeBaseId, result.snapshot);
    await this.adapter.appendWikiEvent(input.knowledgeBaseId, result.event);
    return result;
  }

  async createBuildRun(
    input: Omit<BuildIntent, "id" | "createdAt">,
    options: {
      toolCalls?: RequestedToolCall[];
      persistBuildVersion?: boolean;
      subAgentExecutor?: SubAgentExecutor;
    } = {}
  ): Promise<HarnessRun> {
    const snapshot = await this.adapter.readWikiSnapshot(input.knowledgeBaseId);
    const orchestratorOptions: ConstructorParameters<typeof HarnessOrchestrator>[0] = {
      wiki: snapshot
    };
    if (options.subAgentExecutor) orchestratorOptions.subAgentExecutor = options.subAgentExecutor;
    const orchestrator = new HarnessOrchestrator(orchestratorOptions);
    const toolRun = options.toolCalls?.length
      ? await this.runWorkspaceTools({ toolCalls: options.toolCalls })
      : undefined;
    const run = await orchestrator.run(input);
    if (toolRun) {
      run.toolCalls = toolRun.records.map((record) => ({
        ...record,
        runId: run.id
      }));
      if (run.buildVersion) {
        run.buildVersion.toolCalls = run.toolCalls;
      }
    }
    if (run.buildVersion && options.persistBuildVersion !== false && this.adapter.writeBuildVersion) {
      await this.adapter.writeBuildVersion(input.knowledgeBaseId, run.buildVersion);
    }
    return run;
  }
}

export const createDefaultSourcePolicy = (kind: WorkspaceKind): WorkspaceSourcePolicy => {
  if (kind === "local") {
    return {
      mode: "reference-only",
      maxInlineBytes: 128 * 1024,
      includePatterns: ["**/*.md", "**/*.txt", "**/*.pdf", "**/*.docx", "**/*.html"],
      excludePatterns: ["**/.git/**", "**/node_modules/**", "**/.pwh/**"],
      textExtraction: "on-demand",
      hashLargeFiles: "metadata-only"
    };
  }

  return {
    mode: "inline",
    maxInlineBytes: 1024 * 1024,
    includePatterns: ["**/*"],
    excludePatterns: [],
    textExtraction: "on-ingest",
    hashLargeFiles: "full-read"
  };
};

export const createWorkspaceToolRegistry = (adapter: WorkspaceAdapter): ToolRegistry => {
  const tools: ToolDefinition[] = [
    {
      name: "readManifest",
      description: "Read workspace metadata, source policy, and linked source records.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {}
      },
      execute: async () => adapter.readManifest()
    },
    {
      name: "readWikiIndex",
      description: "Read the generated wiki index page for the active workspace.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          knowledgeBaseId: { type: "string" }
        }
      },
      execute: async (input) => {
        const knowledgeBaseId = getString(input, "knowledgeBaseId");
        const snapshot = await adapter.readWikiSnapshot(knowledgeBaseId);
        const indexPage = snapshot.pages.find((page) => page.kind === "index");
        return {
          pageId: indexPage?.id ?? null,
          path: indexPage?.path ?? "wiki/index.wiki",
          body: indexPage?.body ?? "",
          sourceCount: snapshot.sources.length,
          entityCount: snapshot.entities.length,
          pageCount: snapshot.pages.length
        };
      }
    },
    {
      name: "searchWiki",
      description: "Search generated wiki pages, entities, and source summaries.",
      inputSchema: {
        type: "object",
        required: ["query"],
        additionalProperties: false,
        properties: {
          knowledgeBaseId: { type: "string" },
          query: { type: "string" },
          limit: { type: "number" }
        }
      },
      execute: async (input) => {
        const query = getRequiredString(input, "query");
        const limit = getNumber(input, "limit") ?? 8;
        const knowledgeBaseId = getString(input, "knowledgeBaseId");
        const snapshot = await adapter.readWikiSnapshot(knowledgeBaseId);
        return searchWikiSnapshot(snapshot, query, limit);
      }
    },
    {
      name: "readWikiPage",
      description: "Read one generated wiki page by page id, path, or title.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          knowledgeBaseId: { type: "string" },
          pageId: { type: "string" },
          path: { type: "string" },
          title: { type: "string" }
        }
      },
      execute: async (input) => {
        const knowledgeBaseId = getString(input, "knowledgeBaseId");
        const pageId = getString(input, "pageId");
        const path = getString(input, "path");
        const title = getString(input, "title");
        const snapshot = await adapter.readWikiSnapshot(knowledgeBaseId);
        const page = snapshot.pages.find(
          (candidate) =>
            (pageId && candidate.id === pageId) ||
            (path && candidate.path === path) ||
            (title && candidate.title === title)
        );
        if (!page) throw new Error("Wiki page not found.");
        return page;
      }
    },
    {
      name: "readSource",
      description: "Read a linked source document or bounded local source text when the adapter permits it.",
      inputSchema: {
        type: "object",
        required: ["sourceId"],
        additionalProperties: false,
        properties: {
          knowledgeBaseId: { type: "string" },
          sourceId: { type: "string" },
          maxBytes: { type: "number" }
        }
      },
      execute: async (input) => {
        const knowledgeBaseId = getString(input, "knowledgeBaseId");
        const sourceId = getRequiredString(input, "sourceId");
        const maxBytes = getNumber(input, "maxBytes") ?? 16_384;
        const manifest = await adapter.readManifest();
        const snapshot = await adapter.readWikiSnapshot(knowledgeBaseId);
        const source = snapshot.sources.find((candidate) => candidate.id === sourceId);
        if (!source) throw new Error(`Source not found: ${sourceId}`);
        const entry = manifest.sources.find(
          (candidate) => candidate.id === sourceId || candidate.sourceDocumentId === sourceId
        );
        const adapterText =
          entry && adapter.readSourceText ? await adapter.readSourceText(entry, { maxBytes }) : undefined;
        return {
          id: source.id,
          title: source.title,
          uri: source.uri,
          mediaType: source.mediaType,
          contentMode: source.contentMode ?? "inline",
          content: adapterText ?? source.content.slice(0, maxBytes)
        };
      }
    }
  ];

  return createToolRegistry(tools);
};

export const createSourceDocumentToolRegistry = (sources: SourceDocument[]): ToolRegistry => {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  return createToolRegistry([
    {
      name: "readSource",
      description: "Read a bounded source document excerpt from the current ontology ingest batch.",
      inputSchema: {
        type: "object",
        required: ["sourceId"],
        additionalProperties: false,
        properties: {
          sourceId: { type: "string" },
          maxBytes: { type: "number" }
        }
      },
      execute: async (input) => {
        const sourceId = getRequiredString(input, "sourceId");
        const maxBytes = getNumber(input, "maxBytes") ?? 16_384;
        const source = sourceById.get(sourceId);
        if (!source) throw new Error(`Source not found in current ingest batch: ${sourceId}`);
        return {
          id: source.id,
          title: source.title,
          uri: source.uri,
          mediaType: source.mediaType,
          contentMode: source.contentMode ?? "inline",
          content: source.content.slice(0, maxBytes)
        };
      }
    }
  ]);
};

const toHarnessToolCallRecord = (
  runId: string,
  record: ToolExecutionRecord
): ToolCallRecord => ({
  id: record.callId,
  runId,
  toolName: record.toolName,
  input: record.input,
  output: record.status === "completed" ? record.output : { error: record.error },
  startedAt: record.startedAt,
  finishedAt: record.finishedAt,
  status: record.status
});

export const createWorkspaceManifest = (input: {
  id: string;
  kind: WorkspaceKind;
  title: string;
  rootUri: string;
  createdAt: string;
  sourcePolicy?: WorkspaceSourcePolicy;
}): WikiWorkspaceManifest => ({
  id: input.id,
  kind: input.kind,
  title: input.title,
  rootUri: input.rootUri,
  createdAt: input.createdAt,
  updatedAt: input.createdAt,
  sourcePolicy: input.sourcePolicy ?? createDefaultSourcePolicy(input.kind),
  sources: []
});

export const createReferencedSourceEntry = (input: {
  id: string;
  title: string;
  uri: string;
  mediaType: string;
  indexedAt: string;
  sizeBytes?: number;
  modifiedAt?: string;
  fingerprint?: string;
  metadata?: Record<string, unknown>;
}): WorkspaceSourceEntry => {
  const entry: WorkspaceSourceEntry = {
    id: input.id,
    title: input.title,
    uri: input.uri,
    mediaType: input.mediaType,
    storageMode: "reference-only",
    status: "pending",
    indexedAt: input.indexedAt,
    originalUri: input.uri
  };
  if (input.sizeBytes !== undefined) entry.sizeBytes = input.sizeBytes;
  if (input.modifiedAt) entry.modifiedAt = input.modifiedAt;
  if (input.fingerprint) entry.fingerprint = input.fingerprint;
  if (input.metadata) entry.metadata = input.metadata;
  return entry;
};

export const shouldInlineSource = (policy: WorkspaceSourcePolicy, sizeBytes: number): boolean =>
  policy.mode === "inline" || (policy.mode === "copy-small-files" && sizeBytes <= policy.maxInlineBytes);

export const describeSourceStorage = (policy: WorkspaceSourcePolicy): string => {
  if (policy.mode === "reference-only") {
    return "Raw files stay in place. The workspace stores source metadata, stable file URIs, wiki pages, logs, and build artifacts.";
  }
  if (policy.mode === "copy-small-files") {
    return `Files at or below ${policy.maxInlineBytes} bytes can be copied into the workspace cache; larger files stay referenced in place.`;
  }
  return "Raw source text is captured inline, which is appropriate for hosted uploads and small controlled corpora.";
};

export const createEmptyWorkspaceSnapshot = (): WikiSnapshot => emptyWikiSnapshot();

export const sourceDocumentFromManifestEntry = (
  entry: WorkspaceSourceEntry,
  content: string
): SourceDocument => {
  const document: SourceDocument = {
    id: entry.sourceDocumentId ?? entry.id,
    title: entry.title,
    uri: entry.workspaceUri ?? entry.originalUri ?? entry.uri,
    mediaType: entry.mediaType,
    contentHash: entry.contentHash ?? entry.fingerprint ?? entry.id,
    content,
    contentMode: content ? "inline" : "metadata-only",
    originalUri: entry.originalUri ?? entry.uri,
    extractedAt: entry.indexedAt,
    createdAt: entry.indexedAt,
    metadata: {
      workspaceSourceId: entry.id,
      storageMode: entry.storageMode,
      originalUri: entry.originalUri ?? entry.uri
    }
  };
  if (entry.sizeBytes !== undefined) document.byteSize = entry.sizeBytes;
  return document;
};

export const createWikiSnapshotFromSourceDocuments = (input: {
  title: string;
  sources: SourceDocument[];
  previousSnapshot?: WikiSnapshot;
  occurredAt?: string;
}): WikiIngestResult => {
  const mutationPlan = createWikiMutationPlanFromSourceDocuments(input);
  return applyWikiMutationPlan(
    input.previousSnapshot
      ? {
          previousSnapshot: input.previousSnapshot,
          mutationPlan
        }
      : { mutationPlan }
  );
};

export const createWikiMutationPlanFromSourceDocuments = (input: {
  title: string;
  sources: SourceDocument[];
  previousSnapshot?: WikiSnapshot;
  occurredAt?: string;
  ontologyExtraction?: OntologyExtraction;
  forceHumanReview?: boolean;
  questionsForHuman?: string[];
}): WikiMutationPlan => {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const previous = input.previousSnapshot ?? emptyWikiSnapshot();
  const sourceById = new Map(previous.sources.map((source) => [source.id, source]));
  for (const source of input.sources) sourceById.set(source.id, source);
  const sources = [...sourceById.values()].sort((a, b) => a.title.localeCompare(b.title));

  const sourcePages = sources.map((source) => sourcePageFromSource(source, occurredAt));
  const entities = sources.map((source) => entityFromSource(source, occurredAt));
  const entityIds = entities.map((entity) => entity.id);
  const sourceIds = sources.map((source) => source.id);
  const ontologyExtraction =
    input.ontologyExtraction ??
    createCandidateOntologyExtraction({
      sources: input.sources,
      sourcePages,
      occurredAt
    });

  const indexPage: WikiPage = {
    id: "wiki_index",
    kind: "index",
    title: "index.wiki",
    path: "wiki/index.wiki",
    body: renderWikiIndex(input.title, sources, sourcePages, entities, occurredAt),
    entityIds,
    sourceIds,
    updatedAt: occurredAt
  };

  const event: WikiEvent = {
    id: `event_${stableHash(`ingest:${occurredAt}:${sourceIds.join(":")}`).slice(0, 16)}`,
    kind: "ingest",
    occurredAt,
    title: `Ingested ${input.sources.length} source${input.sources.length === 1 ? "" : "s"}`,
    pageIds: sourcePages.map((page) => page.id),
    sourceIds: input.sources.map((source) => source.id),
    summary: `Updated wiki from ${input.sources.length} source document${input.sources.length === 1 ? "" : "s"}.`
  };

  const events = [...previous.events.filter((item) => item.id !== event.id), event].sort((a, b) =>
    a.occurredAt.localeCompare(b.occurredAt)
  );

  const logPage: WikiPage = {
    id: "wiki_log",
    kind: "log",
    title: "log.wiki",
    path: "wiki/log.wiki",
    body: renderWikiLog(events),
    entityIds: [],
    sourceIds,
    updatedAt: occurredAt
  };

  return {
    id: `mutation_${stableHash(`mutation:${occurredAt}:${sourceIds.join(":")}`).slice(0, 16)}`,
    title: `Ingest ${input.sources.length} source${input.sources.length === 1 ? "" : "s"}`,
    createdAt: occurredAt,
    sourceIds: input.sources.map((source) => source.id),
    operations: [
      ...sources.map((source): WikiMutationOperation => ({
        id: `op_source_${stableHash(source.id).slice(0, 16)}`,
        kind: "upsert-source",
        targetId: source.id,
        sourceIds: [source.id],
        source,
        summary: `Upsert source document ${source.title}.`
      })),
      ...sourcePages.map((page): WikiMutationOperation => ({
        id: `op_page_${stableHash(page.id).slice(0, 16)}`,
        kind: "upsert-page",
        targetId: page.id,
        sourceIds: page.sourceIds,
        page,
        summary: `Upsert source summary page ${page.title}.`
      })),
      ...entities.map((entity): WikiMutationOperation => ({
        id: `op_entity_${stableHash(entity.id).slice(0, 16)}`,
        kind: "upsert-entity",
        targetId: entity.id,
        sourceIds: entity.sourceIds,
        entity,
        summary: `Upsert entity ${entity.name}.`
      })),
      {
        id: "op_index_wiki",
        kind: "upsert-index",
        targetId: indexPage.id,
        sourceIds,
        page: indexPage,
        summary: "Update index.wiki."
      },
      {
        id: "op_log_wiki",
        kind: "upsert-log",
        targetId: logPage.id,
        sourceIds,
        page: logPage,
        summary: "Update log.wiki."
      },
      {
        id: `op_ontology_${stableHash(ontologyExtraction.id).slice(0, 16)}`,
        kind: "record-ontology-extraction",
        targetId: ontologyExtraction.id,
        sourceIds: ontologyExtraction.sourceIds,
        ontologyExtraction,
        summary: `Record ${ontologyExtraction.items.length} candidate ontology item${ontologyExtraction.items.length === 1 ? "" : "s"}.`
      },
      {
        id: `op_event_${stableHash(event.id).slice(0, 16)}`,
        kind: "append-event",
        targetId: event.id,
        sourceIds: event.sourceIds,
        event,
        summary: event.summary
      }
    ],
    expectedPageIds: [indexPage.id, logPage.id, ...sourcePages.map((page) => page.id)],
    expectedEntityIds: entities.map((entity) => entity.id),
    questionsForHuman: uniqueStrings([
      ...(input.questionsForHuman ?? []),
      ...ontologyExtraction.openQuestions
    ]),
    humanReviewState: input.forceHumanReview || ontologyExtraction.humanReviewState === "pending"
      ? "pending"
      : "not-required"
  };
};

export const createWikiMutationPlanWithOntologyCurator = async (input: {
  title: string;
  sources: SourceDocument[];
  previousSnapshot?: WikiSnapshot;
  occurredAt?: string;
  subAgentExecutor?: SubAgentExecutor;
  parentRunId?: string;
}): Promise<WikiCuratorMutationPlanResult> => {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const previous = input.previousSnapshot ?? emptyWikiSnapshot();
  const mergedSources = mergeSources(previous.sources, input.sources);
  const sourcePages = mergedSources.map((source) => sourcePageFromSource(source, occurredAt));
  const fallbackExtraction = createCandidateOntologyExtraction({
    sources: input.sources,
    sourcePages,
    occurredAt
  });

  let subAgentTrace: SubAgentTrace | undefined;
  let ontologyExtraction = fallbackExtraction;
  let rejectedCandidateCount = 0;
  const reviewQuestions: string[] = [];

  if (input.subAgentExecutor) {
    const trace = createWikiCuratorOntologyTrace({
      parentRunId: input.parentRunId ?? "wiki-curator",
      title: input.title,
      sources: input.sources,
      sourcePages,
      occurredAt
    });
    subAgentTrace = await input.subAgentExecutor.execute(trace);
    const artifact = findLastSubAgentArtifact(subAgentTrace, "ontology-extraction");
    if (artifact) {
      const modelExtraction = createOntologyExtractionFromArtifact({
        artifact,
        fallbackExtraction,
        sources: input.sources,
        sourcePages,
        occurredAt
      });
      ontologyExtraction = modelExtraction.ontologyExtraction;
      rejectedCandidateCount = modelExtraction.rejectedCandidateCount;
      reviewQuestions.push(...modelExtraction.reviewQuestions);
    } else if (subAgentTrace.status === "completed") {
      reviewQuestions.push("Wiki curator completed without an ontology-extraction artifact; heuristic candidates were used.");
    } else if (subAgentTrace.status === "failed") {
      reviewQuestions.push("Wiki curator execution failed; heuristic ontology candidates were used.");
    }
  }

  const mutationPlan = createWikiMutationPlanFromSourceDocuments({
    title: input.title,
    sources: input.sources,
    occurredAt,
    ontologyExtraction,
    forceHumanReview: Boolean(input.subAgentExecutor),
    questionsForHuman: reviewQuestions,
    ...(input.previousSnapshot ? { previousSnapshot: input.previousSnapshot } : {})
  });

  return {
    mutationPlan,
    ontologyExtraction,
    review: summarizeWikiMutationPlan(mutationPlan),
    rejectedCandidateCount,
    reviewQuestions: uniqueStrings(reviewQuestions),
    ...(subAgentTrace ? { subAgentTrace } : {})
  };
};

const mergeSources = (
  previousSources: SourceDocument[],
  nextSources: SourceDocument[]
): SourceDocument[] => {
  const sourceById = new Map(previousSources.map((source) => [source.id, source]));
  for (const source of nextSources) sourceById.set(source.id, source);
  return [...sourceById.values()].sort((a, b) => a.title.localeCompare(b.title));
};

const createWikiCuratorOntologyTrace = (input: {
  parentRunId: string;
  title: string;
  sources: SourceDocument[];
  sourcePages: WikiPage[];
  occurredAt: string;
}): SubAgentTrace => {
  const pageBySourceId = new Map(
    input.sourcePages.flatMap((page) => page.sourceIds.map((sourceId) => [sourceId, page]))
  );
  const packet = createContextPacket({
    id: `packet_wiki_curator_${stableHash(`${input.parentRunId}:${input.occurredAt}:${input.sources.map((source) => source.id).join(":")}`).slice(0, 16)}`,
    role: "wiki-curator",
    createdAt: input.occurredAt,
    workflowPhaseId: "ontology-ingest",
    goal: `Extract ontology candidates for ${input.title}.`,
    instructions: [
      "Extract ontology candidates from the provided source excerpts only.",
      "Treat every output as candidate data for human review; do not apply wiki changes.",
      "Preserve evidenceSourceIds and evidencePageIds for every candidate whenever possible.",
      "Prefer durable ontology slots: entities, relations, events, claims, skills, topics, and source summaries.",
      "Return a structured ontology-extraction artifact with data.items and data.openQuestions."
    ],
    inputs: [
      {
        kind: "instruction",
        id: "ontology-extraction-contract",
        title: "Ontology extraction contract",
        summary: "Expected artifact schema for wiki-curator.",
        content: [
          "Return JSON with artifacts containing one ontology-extraction artifact.",
          "Artifact data shape:",
          "{ items: [{ kind, label, summary, confidence, evidenceSourceIds, evidencePageIds, candidateEntity?, candidateRelation?, candidateClaim? }], openQuestions: [] }.",
          "Allowed item kinds: entity, relation, event, claim, skill, topic, source-summary.",
          "Candidate entities should include name, kind, aliases, summary, sourceIds.",
          "Candidate relations should include fromEntityId, toEntityId, predicate, confidence, evidenceSourceIds.",
          "Candidate claims should include statement, subjectEntityIds, sourceIds, confidence."
        ].join("\n")
      },
      ...input.sources.map((source, index) => {
        const page = pageBySourceId.get(source.id);
        const excerpt =
          index < 8
            ? source.content.trim().slice(0, 2200) ||
              "No extracted text is available; use metadata only."
            : undefined;
        const sourceInput: {
          kind: "source-excerpt";
          id: string;
          title: string;
          summary: string;
          content?: string;
          uri: string;
        } = {
          kind: "source-excerpt" as const,
          id: source.id,
          title: source.title,
          summary: [
            `mediaType=${source.mediaType}`,
            `contentMode=${source.contentMode ?? "inline"}`,
            `sourceId=${source.id}`,
            page ? `pageId=${page.id}` : undefined
          ]
            .filter(Boolean)
            .join(" · "),
          uri: source.uri
        };
        if (excerpt) sourceInput.content = excerpt;
        return sourceInput;
      })
    ],
    budget: {
      maxInputChars: 18000,
      maxOutputChars: 6000,
      maxToolCalls: 8
    },
    allowedToolNames: ["readSource"],
    requiredOutputNames: ["ontology-extraction"],
    outputContract: [
      "Return a single JSON object. Do not wrap it in Markdown.",
      "The JSON object must include artifacts with exactly one artifact whose kind is ontology-extraction.",
      "The ontology-extraction artifact data must include candidate items plus openQuestions.",
      "Use evidence refs from the provided sourceId/pageId values; never invent source ids."
    ],
    retentionPolicy: "bounded-transcript"
  });

  return {
    id: `trace_wiki_curator_${stableHash(packet.id).slice(0, 16)}`,
    parentRunId: input.parentRunId,
    role: "wiki-curator",
    status: "queued",
    packet
  };
};

const findLastSubAgentArtifact = (
  trace: SubAgentTrace,
  kind: SubAgentArtifact["kind"]
): SubAgentArtifact | undefined => trace.result?.artifacts.filter((artifact) => artifact.kind === kind).at(-1);

const createOntologyExtractionFromArtifact = (input: {
  artifact: SubAgentArtifact;
  fallbackExtraction: OntologyExtraction;
  sources: SourceDocument[];
  sourcePages: WikiPage[];
  occurredAt: string;
}): {
  ontologyExtraction: OntologyExtraction;
  rejectedCandidateCount: number;
  reviewQuestions: string[];
} => {
  const data = unwrapOntologyExtractionArtifactData(input.artifact.data);
  const sourceIds = new Set(input.sources.map((source) => source.id));
  const sourcePageBySourceId = new Map(
    input.sourcePages.flatMap((page) => page.sourceIds.map((sourceId) => [sourceId, page]))
  );
  const pageIds = new Set(input.sourcePages.map((page) => page.id));
  const rawItems = data ? readArrayField(data, "items") : [];
  const openQuestions = data ? readStringArrayFromFields(data, ["openQuestions", "questions"]) : [];
  const reviewQuestions: string[] = [];
  let rejectedCandidateCount = 0;

  if (!data || rawItems.length === 0) {
    reviewQuestions.push(
      "Wiki curator ontology artifact did not contain data.items; heuristic candidates were kept for review."
    );
    return {
      ontologyExtraction: {
        ...input.fallbackExtraction,
        openQuestions: uniqueStrings([...input.fallbackExtraction.openQuestions, ...reviewQuestions]),
        humanReviewState: "pending"
      },
      rejectedCandidateCount,
      reviewQuestions
    };
  }

  const modelItems: OntologyExtractionItem[] = [];
  for (const rawItem of rawItems) {
    const item = createOntologyItemFromModelRecord({
      rawItem,
      sourceIds,
      sourcePageBySourceId,
      pageIds,
      occurredAt: input.occurredAt
    });
    if (item) {
      modelItems.push(item);
    } else {
      rejectedCandidateCount += 1;
    }
  }

  if (rejectedCandidateCount > 0) {
    reviewQuestions.push(
      `${rejectedCandidateCount} ontology candidate${rejectedCandidateCount === 1 ? "" : "s"} from the wiki curator lacked valid kind, label, or evidence refs and ${rejectedCandidateCount === 1 ? "was" : "were"} rejected.`
    );
  }
  if (modelItems.length === 0) {
    reviewQuestions.push(
      "Wiki curator ontology artifact had no valid candidates after validation; heuristic candidates were kept for review."
    );
  }

  const items = dedupeOntologyItems([
    ...modelItems,
    ...input.fallbackExtraction.items
  ]);

  const ontologyExtraction: OntologyExtraction = {
    id: `ontology_model_${stableHash(`${input.artifact.id}:${input.occurredAt}`).slice(0, 16)}`,
    sourceIds: uniqueStrings([
      ...input.fallbackExtraction.sourceIds,
      ...items.flatMap((item) => item.evidenceSourceIds)
    ]),
    schemaId: DEFAULT_ONTOLOGY_SCHEMA_ID,
    extractedAt: input.occurredAt,
    items,
    openQuestions: uniqueStrings([
      ...input.fallbackExtraction.openQuestions,
      ...openQuestions,
      ...reviewQuestions,
      ...createOntologyOpenQuestions(items)
    ]),
    humanReviewState: "pending"
  };

  return {
    ontologyExtraction,
    rejectedCandidateCount,
    reviewQuestions: uniqueStrings([...openQuestions, ...reviewQuestions])
  };
};

const unwrapOntologyExtractionArtifactData = (
  data: unknown
): Record<string, unknown> | undefined => {
  if (!isRecord(data)) return undefined;
  const nested = data.ontologyExtraction;
  if (isRecord(nested)) return nested;
  return data;
};

const createOntologyItemFromModelRecord = (input: {
  rawItem: unknown;
  sourceIds: Set<string>;
  sourcePageBySourceId: Map<string, WikiPage>;
  pageIds: Set<string>;
  occurredAt: string;
}): OntologyExtractionItem | undefined => {
  if (!isRecord(input.rawItem)) return undefined;
  const item = input.rawItem;
  const entityRecord = readRecordField(item, "candidateEntity");
  const relationRecord = readRecordField(item, "candidateRelation");
  const claimRecord = readRecordField(item, "candidateClaim");
  const kind =
    readOntologySlotKind(item.kind) ??
    inferOntologySlotKind({ item, entityRecord, relationRecord, claimRecord });
  if (!kind) return undefined;

  const evidenceSourceIds = validEvidenceSourceIds({
    item,
    entityRecord,
    relationRecord,
    claimRecord,
    validSourceIds: input.sourceIds
  });
  if (evidenceSourceIds.length === 0) return undefined;

  const evidencePageIds = validEvidencePageIds({
    item,
    entityRecord,
    relationRecord,
    claimRecord,
    validPageIds: input.pageIds,
    evidenceSourceIds,
    sourcePageBySourceId: input.sourcePageBySourceId
  });

  if (kind === "relation") {
    return createModelRelationOntologyItem({
      item,
      relationRecord,
      evidenceSourceIds,
      evidencePageIds
    });
  }
  if (kind === "claim") {
    return createModelClaimOntologyItem({
      item,
      claimRecord,
      evidenceSourceIds,
      evidencePageIds,
      occurredAt: input.occurredAt
    });
  }

  return createModelEntityOntologyItem({
    item,
    entityRecord,
    kind,
    evidenceSourceIds,
    evidencePageIds,
    occurredAt: input.occurredAt
  });
};

const createModelEntityOntologyItem = (input: {
  item: Record<string, unknown>;
  entityRecord?: Record<string, unknown> | undefined;
  kind: Exclude<OntologySlotKind, "relation" | "claim">;
  evidenceSourceIds: string[];
  evidencePageIds: string[];
  occurredAt: string;
}): OntologyExtractionItem | undefined => {
  const candidate = input.entityRecord ?? input.item;
  const label =
    readStringField(input.item, "label") ??
    readStringField(candidate, "name") ??
    readStringField(candidate, "title");
  if (!label) return undefined;
  const summary =
    readStringField(input.item, "summary") ??
    readStringField(candidate, "summary") ??
    `Candidate ${input.kind} extracted by wiki curator.`;
  const entityKind = normalizeEntityKind(
    readStringField(candidate, "kind") ?? readStringField(input.item, "entityKind"),
    entityKindForOntologySlot(input.kind)
  );
  const entity: WikiEntity = {
    id:
      readStringField(candidate, "id") ??
      `candidate_${entityKind}_${stableHash(`${entityKind}:${label}:${input.evidenceSourceIds.join(":")}`).slice(0, 16)}`,
    name: label,
    kind: entityKind,
    aliases: readStringArrayFromFields(candidate, ["aliases", "alternateNames"]),
    summary,
    sourceIds: input.evidenceSourceIds,
    updatedAt: input.occurredAt
  };
  const pageId = readStringField(candidate, "pageId");
  if (pageId && input.evidencePageIds.includes(pageId)) entity.pageId = pageId;
  else if (input.evidencePageIds[0]) entity.pageId = input.evidencePageIds[0];

  const ontologyItem: OntologyExtractionItem = {
    id:
      readStringField(input.item, "id") ??
      `onto_model_${stableHash(`${input.kind}:${label}:${input.evidenceSourceIds.join(":")}`).slice(0, 16)}`,
    kind: input.kind,
    label,
    summary,
    confidence: readConfidence(input.item, candidate),
    evidenceSourceIds: input.evidenceSourceIds,
    evidencePageIds: input.evidencePageIds,
    candidateEntity: entity
  };
  return ontologyItem;
};

const createModelRelationOntologyItem = (input: {
  item: Record<string, unknown>;
  relationRecord?: Record<string, unknown> | undefined;
  evidenceSourceIds: string[];
  evidencePageIds: string[];
}): OntologyExtractionItem | undefined => {
  const candidate = input.relationRecord ?? input.item;
  const fromEntityId =
    readStringField(candidate, "fromEntityId") ??
    readStringField(candidate, "sourceEntityId") ??
    readStringField(candidate, "from");
  const toEntityId =
    readStringField(candidate, "toEntityId") ??
    readStringField(candidate, "targetEntityId") ??
    readStringField(candidate, "to");
  const predicate =
    readStringField(candidate, "predicate") ??
    readStringField(candidate, "relation") ??
    readStringField(candidate, "type");
  if (!fromEntityId || !toEntityId || !predicate) return undefined;
  const label =
    readStringField(input.item, "label") ??
    readStringField(candidate, "label") ??
    `${fromEntityId} ${predicate} ${toEntityId}`;
  const summary =
    readStringField(input.item, "summary") ??
    readStringField(candidate, "note") ??
    `Candidate relation: ${label}.`;
  const relation: WikiRelation = {
    id:
      readStringField(candidate, "id") ??
      `relation_${stableHash(`${fromEntityId}:${predicate}:${toEntityId}`).slice(0, 16)}`,
    fromEntityId,
    toEntityId,
    predicate,
    confidence: readConfidence(input.item, candidate),
    evidenceSourceIds: input.evidenceSourceIds
  };
  const note = readStringField(candidate, "note") ?? readStringField(input.item, "summary");
  if (note) relation.note = note;

  return {
    id:
      readStringField(input.item, "id") ??
      `onto_model_${stableHash(`relation:${fromEntityId}:${predicate}:${toEntityId}`).slice(0, 16)}`,
    kind: "relation",
    label,
    summary,
    confidence: relation.confidence,
    evidenceSourceIds: input.evidenceSourceIds,
    evidencePageIds: input.evidencePageIds,
    candidateRelation: relation
  };
};

const createModelClaimOntologyItem = (input: {
  item: Record<string, unknown>;
  claimRecord?: Record<string, unknown> | undefined;
  evidenceSourceIds: string[];
  evidencePageIds: string[];
  occurredAt: string;
}): OntologyExtractionItem | undefined => {
  const candidate = input.claimRecord ?? input.item;
  const statement =
    readStringField(candidate, "statement") ??
    readStringField(input.item, "summary") ??
    readStringField(input.item, "label");
  if (!statement) return undefined;
  const summary = readStringField(input.item, "summary") ?? statement;
  const claim: WikiClaim = {
    id:
      readStringField(candidate, "id") ??
      `claim_${stableHash(`${statement}:${input.evidenceSourceIds.join(":")}`).slice(0, 16)}`,
    statement,
    subjectEntityIds: readStringArrayFromFields(candidate, ["subjectEntityIds", "entityIds"]),
    sourceIds: input.evidenceSourceIds,
    confidence: readConfidence(input.item, candidate),
    status: readClaimStatus(candidate.status),
    updatedAt: input.occurredAt
  };

  return {
    id:
      readStringField(input.item, "id") ??
      `onto_model_${stableHash(`claim:${statement}:${input.evidenceSourceIds.join(":")}`).slice(0, 16)}`,
    kind: "claim",
    label: readStringField(input.item, "label") ?? oneLine(statement, 80),
    summary,
    confidence: claim.confidence,
    evidenceSourceIds: input.evidenceSourceIds,
    evidencePageIds: input.evidencePageIds,
    candidateClaim: claim
  };
};

const readArrayField = (object: Record<string, unknown>, field: string): unknown[] => {
  const value = object[field];
  return Array.isArray(value) ? value : [];
};

const readRecordField = (
  object: Record<string, unknown>,
  field: string
): Record<string, unknown> | undefined => {
  const value = object[field];
  return isRecord(value) ? value : undefined;
};

const readStringField = (
  object: Record<string, unknown> | undefined,
  field: string
): string | undefined => {
  if (!object) return undefined;
  const value = object[field];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
};

const readStringArrayFromFields = (
  object: Record<string, unknown> | undefined,
  fields: string[]
): string[] => {
  if (!object) return [];
  return uniqueStrings(
    fields.flatMap((field) => readStringArrayValue(object[field])).map((value) => value.trim()).filter(Boolean)
  );
};

const readStringArrayValue = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return value.flatMap((item) => (typeof item === "string" && item.trim() ? [item.trim()] : []));
  }
  return typeof value === "string" && value.trim() ? [value.trim()] : [];
};

const readOntologySlotKind = (value: unknown): OntologySlotKind | undefined => {
  if (
    value === "entity" ||
    value === "relation" ||
    value === "event" ||
    value === "claim" ||
    value === "skill" ||
    value === "topic" ||
    value === "source-summary"
  ) {
    return value;
  }
  return undefined;
};

const inferOntologySlotKind = (input: {
  item: Record<string, unknown>;
  entityRecord?: Record<string, unknown> | undefined;
  relationRecord?: Record<string, unknown> | undefined;
  claimRecord?: Record<string, unknown> | undefined;
}): OntologySlotKind | undefined => {
  if (input.relationRecord) return "relation";
  if (input.claimRecord) return "claim";
  const rawKind =
    readStringField(input.entityRecord, "kind") ??
    readStringField(input.item, "entityKind") ??
    readStringField(input.item, "type");
  if (rawKind === "skill") return "skill";
  if (rawKind === "topic") return "topic";
  if (rawKind === "event") return "event";
  if (rawKind === "document") return "source-summary";
  if (input.entityRecord) return "entity";
  return undefined;
};

const validEvidenceSourceIds = (input: {
  item: Record<string, unknown>;
  entityRecord?: Record<string, unknown> | undefined;
  relationRecord?: Record<string, unknown> | undefined;
  claimRecord?: Record<string, unknown> | undefined;
  validSourceIds: Set<string>;
}): string[] => {
  const candidateIds = uniqueStrings([
    ...readStringArrayFromFields(input.item, ["evidenceSourceIds", "sourceIds"]),
    ...readStringArrayFromFields(input.entityRecord, ["evidenceSourceIds", "sourceIds"]),
    ...readStringArrayFromFields(input.relationRecord, ["evidenceSourceIds", "sourceIds"]),
    ...readStringArrayFromFields(input.claimRecord, ["evidenceSourceIds", "sourceIds"]),
    ...(readStringField(input.item, "sourceId") ? [readStringField(input.item, "sourceId") as string] : [])
  ]);
  const validIds = candidateIds.filter((sourceId) => input.validSourceIds.has(sourceId));
  if (validIds.length) return validIds;
  if (input.validSourceIds.size === 1) return [...input.validSourceIds];
  return [];
};

const validEvidencePageIds = (input: {
  item: Record<string, unknown>;
  entityRecord?: Record<string, unknown> | undefined;
  relationRecord?: Record<string, unknown> | undefined;
  claimRecord?: Record<string, unknown> | undefined;
  validPageIds: Set<string>;
  evidenceSourceIds: string[];
  sourcePageBySourceId: Map<string, WikiPage>;
}): string[] => {
  const candidateIds = uniqueStrings([
    ...readStringArrayFromFields(input.item, ["evidencePageIds", "pageIds"]),
    ...readStringArrayFromFields(input.entityRecord, ["evidencePageIds", "pageIds"]),
    ...readStringArrayFromFields(input.relationRecord, ["evidencePageIds", "pageIds"]),
    ...readStringArrayFromFields(input.claimRecord, ["evidencePageIds", "pageIds"]),
    ...(readStringField(input.item, "pageId") ? [readStringField(input.item, "pageId") as string] : []),
    ...(readStringField(input.entityRecord, "pageId") ? [readStringField(input.entityRecord, "pageId") as string] : [])
  ]);
  const explicitIds = candidateIds.filter((pageId) => input.validPageIds.has(pageId));
  if (explicitIds.length) return explicitIds;
  return uniqueStrings(
    input.evidenceSourceIds.flatMap((sourceId) => {
      const page = input.sourcePageBySourceId.get(sourceId);
      return page ? [page.id] : [];
    })
  );
};

const normalizeEntityKind = (
  value: string | undefined,
  fallback: WikiEntity["kind"]
): WikiEntity["kind"] => {
  if (
    value === "person" ||
    value === "organization" ||
    value === "project" ||
    value === "concept" ||
    value === "topic" ||
    value === "place" ||
    value === "artifact" ||
    value === "document" ||
    value === "event" ||
    value === "skill" ||
    value === "tool" ||
    value === "claim" ||
    value === "other"
  ) {
    return value;
  }
  return fallback;
};

const entityKindForOntologySlot = (
  kind: Exclude<OntologySlotKind, "relation" | "claim">
): WikiEntity["kind"] => {
  if (kind === "skill") return "skill";
  if (kind === "topic") return "topic";
  if (kind === "event") return "event";
  if (kind === "source-summary") return "document";
  return "concept";
};

const readConfidence = (...objects: Array<Record<string, unknown> | undefined>): number => {
  for (const object of objects) {
    if (!object) continue;
    const value = object.confidence;
    if (typeof value === "number" && Number.isFinite(value)) {
      return Math.min(1, Math.max(0, value));
    }
  }
  return 0.5;
};

const readClaimStatus = (value: unknown): WikiClaim["status"] => {
  if (
    value === "candidate" ||
    value === "accepted" ||
    value === "contested" ||
    value === "deprecated"
  ) {
    return value;
  }
  return "candidate";
};

export const summarizeWikiMutationPlan = (
  mutationPlan: WikiMutationPlan
): WikiMutationPlanReview => {
  const operationCounts: Record<string, number> = {};
  const sourceContentModes: Record<string, number> = {};
  const ontologyCandidateCounts: Record<string, number> = {};
  const plannedSources: WikiMutationPlanReviewItem[] = [];
  const plannedPages: WikiMutationPlanReviewItem[] = [];
  const plannedEntities: WikiMutationPlanReviewItem[] = [];
  const ontologyCandidates: WikiMutationPlanOntologyCandidateReview[] = [];
  const openQuestions = [...mutationPlan.questionsForHuman];
  const reviewReasons: string[] = [];
  const blockedReasons: string[] = [];

  for (const operation of mutationPlan.operations) {
    operationCounts[operation.kind] = (operationCounts[operation.kind] ?? 0) + 1;

    if (operation.source) {
      const contentMode = operation.source.contentMode ?? "inline";
      sourceContentModes[contentMode] = (sourceContentModes[contentMode] ?? 0) + 1;
      plannedSources.push({
        id: operation.source.id,
        title: operation.source.title,
        kind: contentMode,
        summary: `${operation.source.mediaType} · ${operation.source.uri}`
      });
    }

    if (operation.page) {
      plannedPages.push({
        id: operation.page.id,
        title: operation.page.title,
        kind: operation.page.kind,
        summary: operation.page.path
      });
    }

    if (operation.entity) {
      plannedEntities.push({
        id: operation.entity.id,
        title: operation.entity.name,
        kind: operation.entity.kind,
        summary: operation.entity.summary
      });
    }

    if (operation.ontologyExtraction) {
      openQuestions.push(...operation.ontologyExtraction.openQuestions);
      for (const item of operation.ontologyExtraction.items) {
        ontologyCandidateCounts[item.kind] = (ontologyCandidateCounts[item.kind] ?? 0) + 1;
        ontologyCandidates.push({
          id: item.id,
          kind: item.kind,
          label: item.label,
          confidence: item.confidence,
          evidenceSourceIds: item.evidenceSourceIds,
          evidencePageIds: item.evidencePageIds,
          summary: item.summary
        });
      }
    }
  }

  const lowConfidenceCandidates = ontologyCandidates.filter((item) => item.confidence < 0.6);
  if (lowConfidenceCandidates.length > 0) {
    reviewReasons.push(
      `${lowConfidenceCandidates.length} ontology candidate${lowConfidenceCandidates.length === 1 ? "" : "s"} ${lowConfidenceCandidates.length === 1 ? "is" : "are"} below 0.6 confidence.`
    );
  }
  if ((sourceContentModes["metadata-only"] ?? 0) > 0) {
    const metadataOnlyCount = sourceContentModes["metadata-only"] ?? 0;
    reviewReasons.push(
      `${metadataOnlyCount} source${metadataOnlyCount === 1 ? "" : "s"} ${metadataOnlyCount === 1 ? "has" : "have"} metadata-only content.`
    );
  }
  if (openQuestions.length > 0) {
    const openQuestionCount = uniqueStrings(openQuestions).length;
    reviewReasons.push(`${openQuestionCount} open question${openQuestionCount === 1 ? "" : "s"} should be checked.`);
  }
  if (mutationPlan.humanReviewState === "pending") {
    reviewReasons.push("The plan is explicitly marked pending human review.");
  }
  if (mutationPlan.humanReviewState === "rejected") {
    blockedReasons.push("The plan is rejected.");
  }

  const decision: WikiMutationPlanReviewDecision =
    blockedReasons.length > 0
      ? "blocked"
      : reviewReasons.length > 0
        ? "needs-human-review"
        : "ready-to-apply";

  return {
    id: mutationPlan.id,
    title: mutationPlan.title,
    createdAt: mutationPlan.createdAt,
    decision,
    recommendedNextAction: recommendationForPlanDecision(decision, mutationPlan.id),
    humanReviewState: mutationPlan.humanReviewState,
    sourceCount: mutationPlan.sourceIds.length,
    operationCounts,
    sourceContentModes,
    expectedPageIds: mutationPlan.expectedPageIds,
    expectedEntityIds: mutationPlan.expectedEntityIds,
    plannedSources,
    plannedPages,
    plannedEntities,
    ontologyCandidateCount: ontologyCandidates.length,
    ontologyCandidateCounts,
    ontologyCandidates,
    openQuestions: uniqueStrings(openQuestions),
    reviewReasons: uniqueStrings(reviewReasons),
    blockedReasons: uniqueStrings(blockedReasons)
  };
};

export const createWikiMutationPlanReviewBatches = (
  mutationPlan: WikiMutationPlan
): WikiMutationPlanReviewBatch[] => {
  const review = summarizeWikiMutationPlan(mutationPlan);
  const groups: Record<WikiMutationPlanReviewBatchKind, WikiMutationOperation[]> = {
    "raw-sources": [],
    "wiki-maintenance": [],
    "ontology-candidates": [],
    "navigation-log": [],
    other: []
  };

  for (const operation of mutationPlan.operations) {
    groups[batchKindForOperation(operation)].push(operation);
  }

  return (Object.entries(groups) as Array<[WikiMutationPlanReviewBatchKind, WikiMutationOperation[]]>)
    .filter(([, operations]) => operations.length > 0)
    .map(([kind, operations]) => createReviewBatch(kind, operations, review));
};

export const createWikiMutationPlanHandoff = (
  mutationPlan: WikiMutationPlan
): WikiMutationPlanHandoff => {
  const review = summarizeWikiMutationPlan(mutationPlan);
  const batches = createWikiMutationPlanReviewBatches(mutationPlan);
  const evidenceRefs = uniqueStrings([
    ...mutationPlan.sourceIds.map((sourceId) => `source:${sourceId}`),
    ...review.ontologyCandidates.flatMap((candidate) => [
      ...candidate.evidenceSourceIds.map((sourceId) => `source:${sourceId}`),
      ...candidate.evidencePageIds.map((pageId) => `page:${pageId}`)
    ])
  ]);
  const mustCarryForwardRefs = uniqueStrings([
    `mutation-plan:${mutationPlan.id}`,
    ...mutationPlan.sourceIds.map((sourceId) => `source:${sourceId}`),
    ...mutationPlan.expectedPageIds.map((pageId) => `page:${pageId}`),
    ...mutationPlan.expectedEntityIds.map((entityId) => `entity:${entityId}`),
    ...batches.map((batch) => `review-batch:${batch.id}`)
  ]);
  const discardableContext = [
    "Full source text after bounded extraction, unless a later step explicitly reads the source again.",
    "Intermediate CLI transcript lines after tool calls are recorded.",
    "Duplicate ontology candidate wording once source/page evidence refs are preserved."
  ];

  return {
    id: `handoff_${stableHash(`${mutationPlan.id}:handoff`).slice(0, 16)}`,
    planId: mutationPlan.id,
    createdAt: mutationPlan.createdAt,
    decision: review.decision,
    summary: `${mutationPlan.title}: ${review.sourceCount} source${review.sourceCount === 1 ? "" : "s"}, ${review.ontologyCandidateCount} ontology candidate${review.ontologyCandidateCount === 1 ? "" : "s"}, ${batches.length} review batch${batches.length === 1 ? "" : "es"}.`,
    recommendedNextAction: review.recommendedNextAction,
    batches,
    evidenceRefs,
    artifactRefs: [`mutation-plan:${mutationPlan.id}`],
    mustCarryForwardRefs,
    discardableContext
  };
};

export const applyWikiMutationPlan = (input: {
  previousSnapshot?: WikiSnapshot;
  mutationPlan: WikiMutationPlan;
}): WikiIngestResult => {
  const previous = input.previousSnapshot ?? emptyWikiSnapshot();
  const sourceById = new Map(previous.sources.map((source) => [source.id, source]));
  const pageById = new Map(previous.pages.map((page) => [page.id, page]));
  const entityById = new Map(previous.entities.map((entity) => [entity.id, entity]));
  const relationById = new Map(previous.relations.map((relation) => [relation.id, relation]));
  const claimById = new Map((previous.claims ?? []).map((claim) => [claim.id, claim]));
  const extractionById = new Map(
    (previous.ontologyExtractions ?? []).map((extraction) => [extraction.id, extraction])
  );
  const eventById = new Map(previous.events.map((event) => [event.id, event]));

  for (const operation of input.mutationPlan.operations) {
    if (operation.kind === "upsert-source" && operation.source) {
      sourceById.set(operation.source.id, operation.source);
    }
    if ((operation.kind === "upsert-page" || operation.kind === "upsert-index" || operation.kind === "upsert-log") && operation.page) {
      pageById.set(operation.page.id, operation.page);
    }
    if (operation.kind === "upsert-entity" && operation.entity) {
      entityById.set(operation.entity.id, operation.entity);
    }
    if (operation.kind === "upsert-relation" && operation.relation) {
      relationById.set(operation.relation.id, operation.relation);
    }
    if (operation.kind === "upsert-claim" && operation.claim) {
      claimById.set(operation.claim.id, operation.claim);
    }
    if (operation.kind === "record-ontology-extraction" && operation.ontologyExtraction) {
      extractionById.set(operation.ontologyExtraction.id, operation.ontologyExtraction);
    }
    if (operation.kind === "append-event" && operation.event) {
      eventById.set(operation.event.id, operation.event);
    }
  }

  const sources = [...sourceById.values()].sort((a, b) => a.title.localeCompare(b.title));
  const pages = [...pageById.values()].sort(compareWikiPages);
  const entities = [...entityById.values()].sort((a, b) => a.name.localeCompare(b.name));
  const sourceIds = sources.map((source) => source.id);
  const entityIds = entities.map((entity) => entity.id);
  const relations = preserveValidRelations([...relationById.values()], entityIds, sourceIds);
  const events = [...eventById.values()].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const indexPage = pages.find((page) => page.kind === "index") ?? createMissingPage("wiki_index", "index.wiki", input.mutationPlan.createdAt);
  const logPage = pages.find((page) => page.kind === "log") ?? createMissingPage("wiki_log", "log.wiki", input.mutationPlan.createdAt);
  const sourcePages = pages.filter((page) => page.kind === "source-summary");
  const event =
    input.mutationPlan.operations.find((operation) => operation.kind === "append-event")?.event ??
    events.at(-1) ??
    {
      id: `event_${stableHash(input.mutationPlan.id).slice(0, 16)}`,
      kind: "ingest",
      occurredAt: input.mutationPlan.createdAt,
      title: input.mutationPlan.title,
      pageIds: input.mutationPlan.expectedPageIds,
      sourceIds: input.mutationPlan.sourceIds,
      summary: `Applied mutation plan ${input.mutationPlan.id}.`
    };

  const snapshot: WikiSnapshot = {
    sources,
    entities,
    pages,
    relations,
    events,
    lintIssues: previous.lintIssues
  };
  const claims = [...claimById.values()];
  if (claims.length) snapshot.claims = claims;
  const ontologyExtractions = [...extractionById.values()];
  if (ontologyExtractions.length) snapshot.ontologyExtractions = ontologyExtractions;
  snapshot.mutationPlans = [
    ...(previous.mutationPlans ?? []).filter((plan) => plan.id !== input.mutationPlan.id),
    input.mutationPlan
  ];

  return {
    snapshot,
    mutationPlan: input.mutationPlan,
    indexPage,
    logPage,
    sourcePages,
    entities,
    event
  };
};

const recommendationForPlanDecision = (
  decision: WikiMutationPlanReviewDecision,
  mutationPlanId: string
): string => {
  if (decision === "blocked") return "Do not apply this plan. Create a corrected plan first.";
  if (decision === "needs-human-review") {
    return `Review the flagged candidates and questions, then apply with pwh apply-plan ${mutationPlanId}.`;
  }
  return `Apply with pwh apply-plan ${mutationPlanId}.`;
};

const uniqueStrings = (values: string[]): string[] => [...new Set(values.filter((value) => value.trim()))];

const createVerificationReport = (input: {
  kind: WorkspaceVerificationReport["kind"];
  createdAt: string;
  checks: WorkspaceVerificationCheck[];
  summary: string;
}): WorkspaceVerificationReport => {
  const hardFailureCount = input.checks.filter((check) => check.status === "fail").length;
  const warningCount = input.checks.filter((check) => check.status === "warning").length;
  const status: WorkspaceVerificationStatus =
    hardFailureCount > 0 ? "fail" : warningCount > 0 ? "warning" : "pass";

  return {
    id: `${input.kind}_${stableHash(`${input.kind}:${input.createdAt}:${input.checks.map((check) => `${check.id}:${check.status}`).join("|")}`).slice(0, 16)}`,
    kind: input.kind,
    createdAt: input.createdAt,
    status,
    summary: `${input.summary} ${hardFailureCount} failure${hardFailureCount === 1 ? "" : "s"}, ${warningCount} warning${warningCount === 1 ? "" : "s"}.`,
    hardFailureCount,
    warningCount,
    checks: input.checks
  };
};

const check = (input: {
  id: string;
  title: string;
  status: WorkspaceVerificationStatus;
  message: string;
  refs?: string[];
}): WorkspaceVerificationCheck => ({
  id: input.id,
  title: input.title,
  status: input.status,
  message: input.message,
  refs: input.refs ?? []
});

const verifyManifest = (manifest: WikiWorkspaceManifest): WorkspaceVerificationCheck => {
  if (!manifest.id || !manifest.rootUri) {
    return check({
      id: "manifest-present",
      title: "Workspace manifest",
      status: "fail",
      message: "Workspace manifest is missing an id or rootUri."
    });
  }
  return check({
    id: "manifest-present",
    title: "Workspace manifest",
    status: "pass",
    message: `Workspace ${manifest.id} is readable.`,
    refs: [`workspace:${manifest.id}`]
  });
};

const verifyLocalSourcePolicy = (manifest: WikiWorkspaceManifest): WorkspaceVerificationCheck => {
  if (manifest.kind !== "local") {
    return check({
      id: "local-source-policy",
      title: "Local source policy",
      status: "pass",
      message: "Workspace is not local, so local reference-only source policy does not apply."
    });
  }
  const nonReferenceSources = manifest.sources.filter((source) => source.storageMode !== "reference-only");
  if (manifest.sourcePolicy.mode !== "reference-only" || nonReferenceSources.length > 0) {
    return check({
      id: "local-source-policy",
      title: "Local source policy",
      status: "fail",
      message: "Local workspaces must keep raw sources as reference-only by default.",
      refs: nonReferenceSources.map((source) => `source:${source.id}`)
    });
  }
  return check({
    id: "local-source-policy",
    title: "Local source policy",
    status: "pass",
    message: "Local raw sources are referenced in place."
  });
};

const verifySnapshotSourceRefs = (
  manifest: WikiWorkspaceManifest,
  snapshot: WikiSnapshot
): WorkspaceVerificationCheck => {
  const manifestSourceIds = new Set(
    manifest.sources.flatMap((source) => [source.id, source.sourceDocumentId].filter((value): value is string => Boolean(value)))
  );
  const missingRefs = snapshot.sources.filter(
    (source) => !source.id || !source.uri || !source.contentHash || !manifestSourceIds.has(source.id)
  );
  if (missingRefs.length > 0) {
    return check({
      id: "source-refs-preserved",
      title: "Source refs preserved",
      status: "fail",
      message: `${missingRefs.length} snapshot source${missingRefs.length === 1 ? "" : "s"} lack manifest refs, uri, or contentHash.`,
      refs: missingRefs.map((source) => `source:${source.id || "unknown"}`)
    });
  }
  return check({
    id: "source-refs-preserved",
    title: "Source refs preserved",
    status: "pass",
    message: `${snapshot.sources.length} snapshot source${snapshot.sources.length === 1 ? "" : "s"} preserve ids, uri, hash, and manifest refs.`
  });
};

const verifyWikiIndexAndLog = (snapshot: WikiSnapshot): WorkspaceVerificationCheck => {
  if (snapshot.sources.length === 0 && snapshot.pages.length === 0) {
    return check({
      id: "wiki-index-log",
      title: "Wiki index and log",
      status: "warning",
      message: "No wiki sources or pages exist yet."
    });
  }
  const hasIndex = snapshot.pages.some((page) => page.kind === "index" || page.path.endsWith("index.wiki"));
  const hasLog = snapshot.pages.some((page) => page.kind === "log" || page.path.endsWith("log.wiki"));
  if (!hasIndex || !hasLog) {
    return check({
      id: "wiki-index-log",
      title: "Wiki index and log",
      status: "fail",
      message: "A maintained wiki snapshot must include index.wiki and log.wiki pages."
    });
  }
  return check({
    id: "wiki-index-log",
    title: "Wiki index and log",
    status: "pass",
    message: "Wiki snapshot includes index and log pages."
  });
};

const verifyMutationPlanReviewSequence = (events: WorkspaceEvent[]): WorkspaceVerificationCheck => {
  const appliedEvents = events.filter((event) => event.kind === "mutation-plan.applied" && event.mutationPlanId);
  if (appliedEvents.length === 0) {
    return check({
      id: "mutation-plan-review-sequence",
      title: "Mutation plan review sequence",
      status: "warning",
      message: "No applied mutation plan events exist yet."
    });
  }

  const violations = appliedEvents.filter((appliedEvent) => {
    const beforeApply = events.filter((event) => event.occurredAt <= appliedEvent.occurredAt);
    const hasReview = beforeApply.some(
      (event) => event.kind === "mutation-plan.reviewed" && event.mutationPlanId === appliedEvent.mutationPlanId
    );
    const hasHandoff = beforeApply.some(
      (event) => event.kind === "mutation-plan.handoff-created" && event.mutationPlanId === appliedEvent.mutationPlanId
    );
    return !hasReview || !hasHandoff;
  });

  if (violations.length > 0) {
    return check({
      id: "mutation-plan-review-sequence",
      title: "Mutation plan review sequence",
      status: "fail",
      message: `${violations.length} applied mutation plan${violations.length === 1 ? "" : "s"} lack prior review or handoff events.`,
      refs: violations.map((event) => `mutation-plan:${event.mutationPlanId}`)
    });
  }

  return check({
    id: "mutation-plan-review-sequence",
    title: "Mutation plan review sequence",
    status: "pass",
    message: `${appliedEvents.length} applied mutation plan${appliedEvents.length === 1 ? "" : "s"} have prior review and handoff events.`
  });
};

const verifyBuildVersionSequence = (events: WorkspaceEvent[]): WorkspaceVerificationCheck => {
  const completedBuilds = events.filter((event) => event.kind === "site.build-completed");
  if (completedBuilds.length === 0) {
    return check({
      id: "build-version-sequence",
      title: "Build version sequence",
      status: "warning",
      message: "No completed site build events exist yet."
    });
  }
  const violations = completedBuilds.filter(
    (buildEvent) =>
      !buildEvent.versionId ||
      !events.some(
        (event) =>
          event.kind === "version.created" &&
          event.versionId === buildEvent.versionId &&
          event.occurredAt >= buildEvent.occurredAt
      )
  );
  if (violations.length > 0) {
    return check({
      id: "build-version-sequence",
      title: "Build version sequence",
      status: "fail",
      message: `${violations.length} completed build${violations.length === 1 ? "" : "s"} lack version.created events.`,
      refs: violations.map((event) => `version:${event.versionId ?? "unknown"}`)
    });
  }
  return check({
    id: "build-version-sequence",
    title: "Build version sequence",
    status: "pass",
    message: `${completedBuilds.length} completed build${completedBuilds.length === 1 ? "" : "s"} have version records.`
  });
};

const verifyWorkflowEventGates = (events: WorkspaceEvent[]): WorkspaceVerificationCheck => {
  if (events.length === 0) {
    return check({
      id: "workflow-event-gates",
      title: "Workflow event gates",
      status: "warning",
      message: "No events exist yet, so workflow phase/tool gates have not been exercised."
    });
  }

  const violations = events.filter((event) => {
    const expected = resolveWorkspaceEventWorkflowGate(event.kind);
    const phase = event.workflowPhaseId ?? expected.phase;
    const toolName = event.workflowToolName ?? expected.toolName;
    return !validateWorkflowToolGate({
      spec: defaultWorkflowSpec,
      phase,
      toolName
    }).allowed;
  });

  if (violations.length > 0) {
    return check({
      id: "workflow-event-gates",
      title: "Workflow event gates",
      status: "fail",
      message: `${violations.length} event${violations.length === 1 ? "" : "s"} use tools outside their workflow phase.`,
      refs: violations.map((event) => `event:${event.id}`)
    });
  }

  return check({
    id: "workflow-event-gates",
    title: "Workflow event gates",
    status: "pass",
    message: `${events.length} event${events.length === 1 ? "" : "s"} resolve to allowed workflow phase/tool gates.`
  });
};

const auditEventLogPresence = (events: WorkspaceEvent[]): WorkspaceVerificationCheck => {
  if (events.length === 0) {
    return check({
      id: "event-log-present",
      title: "Event log",
      status: "fail",
      message: "No workspace events were found."
    });
  }
  return check({
    id: "event-log-present",
    title: "Event log",
    status: "pass",
    message: `${events.length} workspace event${events.length === 1 ? "" : "s"} found.`
  });
};

const auditMutationPlanCoverage = (
  snapshot: WikiSnapshot,
  events: WorkspaceEvent[]
): WorkspaceVerificationCheck => {
  const snapshotPlanIds = new Set((snapshot.mutationPlans ?? []).map((plan) => plan.id));
  if (snapshotPlanIds.size === 0) {
    return check({
      id: "mutation-plan-event-coverage",
      title: "Mutation plan event coverage",
      status: "warning",
      message: "No mutation plans are recorded in the snapshot yet."
    });
  }
  const eventPlanIds = new Set(
    events
      .filter((event) => event.kind === "mutation-plan.created" || event.kind === "mutation-plan.applied")
      .map((event) => event.mutationPlanId)
      .filter((value): value is string => Boolean(value))
  );
  const missing = [...snapshotPlanIds].filter((planId) => !eventPlanIds.has(planId));
  if (missing.length > 0) {
    return check({
      id: "mutation-plan-event-coverage",
      title: "Mutation plan event coverage",
      status: "warning",
      message: `${missing.length} snapshot mutation plan${missing.length === 1 ? "" : "s"} lack created/applied events.`,
      refs: missing.map((planId) => `mutation-plan:${planId}`)
    });
  }
  return check({
    id: "mutation-plan-event-coverage",
    title: "Mutation plan event coverage",
    status: "pass",
    message: `${snapshotPlanIds.size} snapshot mutation plan${snapshotPlanIds.size === 1 ? "" : "s"} have event coverage.`
  });
};

const auditBuildArtifacts = (events: WorkspaceEvent[]): WorkspaceVerificationCheck => {
  const buildEvents = events.filter((event) => event.kind === "site.build-completed");
  if (buildEvents.length === 0) {
    return check({
      id: "build-artifact-refs",
      title: "Build artifact refs",
      status: "warning",
      message: "No completed build artifact events exist yet."
    });
  }
  const missingRefs = buildEvents.filter((event) => !event.artifactRefs || event.artifactRefs.length === 0);
  if (missingRefs.length > 0) {
    return check({
      id: "build-artifact-refs",
      title: "Build artifact refs",
      status: "fail",
      message: `${missingRefs.length} completed build${missingRefs.length === 1 ? "" : "s"} lack artifact refs.`,
      refs: missingRefs.map((event) => `version:${event.versionId ?? "unknown"}`)
    });
  }
  return check({
    id: "build-artifact-refs",
    title: "Build artifact refs",
    status: "pass",
    message: `${buildEvents.length} completed build${buildEvents.length === 1 ? "" : "s"} preserve artifact refs.`
  });
};

const batchKindForOperation = (operation: WikiMutationOperation): WikiMutationPlanReviewBatchKind => {
  if (operation.kind === "upsert-source") return "raw-sources";
  if (
    operation.kind === "upsert-page" ||
    operation.kind === "upsert-entity" ||
    operation.kind === "upsert-relation" ||
    operation.kind === "upsert-claim"
  ) {
    return "wiki-maintenance";
  }
  if (operation.kind === "record-ontology-extraction") return "ontology-candidates";
  if (operation.kind === "upsert-index" || operation.kind === "upsert-log" || operation.kind === "append-event") {
    return "navigation-log";
  }
  return "other";
};

const createReviewBatch = (
  kind: WikiMutationPlanReviewBatchKind,
  operations: WikiMutationOperation[],
  review: WikiMutationPlanReview
): WikiMutationPlanReviewBatch => {
  const reasons = batchReviewReasons(kind, operations, review);
  return {
    id: `batch_${kind.replace(/[^a-z0-9]+/g, "_")}`,
    kind,
    title: titleForBatchKind(kind),
    summary: summaryForBatch(kind, operations),
    operationIds: operations.map((operation) => operation.id),
    sourceIds: uniqueStrings(operations.flatMap((operation) => operation.sourceIds)),
    targetIds: uniqueStrings(operations.flatMap((operation) => operation.targetId ? [operation.targetId] : [])),
    priority: priorityForBatch(kind, reasons),
    requiresHumanReview: reasons.length > 0,
    reasons
  };
};

const batchReviewReasons = (
  kind: WikiMutationPlanReviewBatchKind,
  operations: WikiMutationOperation[],
  review: WikiMutationPlanReview
): string[] => {
  const reasons: string[] = [];
  if (kind === "raw-sources") {
    const metadataOnlySources = operations.filter((operation) => operation.source?.contentMode === "metadata-only");
    if (metadataOnlySources.length > 0) {
      reasons.push(`${metadataOnlySources.length} source${metadataOnlySources.length === 1 ? "" : "s"} only have metadata.`);
    }
  }
  if (kind === "ontology-candidates") {
    const lowConfidenceCount = review.ontologyCandidates.filter((candidate) => candidate.confidence < 0.6).length;
    if (lowConfidenceCount > 0) {
      reasons.push(`${lowConfidenceCount} low-confidence ontology candidate${lowConfidenceCount === 1 ? "" : "s"} should be reviewed.`);
    }
    if (review.openQuestions.length > 0) {
      reasons.push(`${review.openQuestions.length} open question${review.openQuestions.length === 1 ? "" : "s"} should be answered or accepted.`);
    }
  }
  if (kind === "navigation-log" && review.decision === "blocked") {
    reasons.push("Navigation and log updates should wait until blockers are resolved.");
  }
  return uniqueStrings(reasons);
};

const priorityForBatch = (
  kind: WikiMutationPlanReviewBatchKind,
  reasons: string[]
): WikiMutationPlanReviewPriority => {
  if (reasons.length > 0) return "high";
  if (kind === "ontology-candidates") return "normal";
  if (kind === "navigation-log") return "low";
  return "normal";
};

const titleForBatchKind = (kind: WikiMutationPlanReviewBatchKind): string => {
  if (kind === "raw-sources") return "Raw source boundary";
  if (kind === "wiki-maintenance") return "Wiki maintenance writes";
  if (kind === "ontology-candidates") return "Ontology candidates";
  if (kind === "navigation-log") return "Index, log, and event updates";
  return "Other plan operations";
};

const summaryForBatch = (
  kind: WikiMutationPlanReviewBatchKind,
  operations: WikiMutationOperation[]
): string => {
  const counts: Record<string, number> = {};
  for (const operation of operations) counts[operation.kind] = (counts[operation.kind] ?? 0) + 1;
  return `${titleForBatchKind(kind)}: ${formatCountRecord(counts)}.`;
};

const formatCountRecord = (counts: Record<string, number>): string =>
  Object.entries(counts)
    .filter(([, count]) => count > 0)
    .map(([key, count]) => `${key} ${count}`)
    .join(", ") || "no operations";

const sourcePageFromSource = (source: SourceDocument, updatedAt: string): WikiPage => ({
  id: `page_${stableHash(source.id).slice(0, 16)}`,
  kind: "source-summary",
  title: source.title,
  path: `wiki/sources/${slugify(source.title)}.wiki`,
  body: renderSourcePage(source),
  entityIds: [`entity_${stableHash(source.id).slice(0, 16)}`],
  sourceIds: [source.id],
  updatedAt
});

const entityFromSource = (source: SourceDocument, updatedAt: string): WikiEntity => ({
  id: `entity_${stableHash(source.id).slice(0, 16)}`,
  name: source.title.replace(/\.[^.]+$/, ""),
  kind: "artifact",
  aliases: [source.title],
  summary: summarizeSource(source),
  pageId: `page_${stableHash(source.id).slice(0, 16)}`,
  sourceIds: [source.id],
  updatedAt
});

const createCandidateOntologyExtraction = (input: {
  sources: SourceDocument[];
  sourcePages: WikiPage[];
  occurredAt: string;
}): OntologyExtraction => {
  const pageBySourceId = new Map(
    input.sourcePages.flatMap((page) => page.sourceIds.map((sourceId) => [sourceId, page]))
  );
  const items = input.sources.flatMap((source) =>
    createOntologyItemsForSource(source, pageBySourceId.get(source.id), input.occurredAt)
  );

  return {
    id: `ontology_${stableHash(`ontology:${input.occurredAt}:${input.sources.map((source) => source.id).join(":")}`).slice(0, 16)}`,
    sourceIds: input.sources.map((source) => source.id),
    schemaId: DEFAULT_ONTOLOGY_SCHEMA_ID,
    extractedAt: input.occurredAt,
    items,
    openQuestions: createOntologyOpenQuestions(items),
    humanReviewState: "not-required"
  };
};

const createOntologyItemsForSource = (
  source: SourceDocument,
  page: WikiPage | undefined,
  updatedAt: string
): OntologyExtractionItem[] => {
  const pageIds = page ? [page.id] : [];
  const items: OntologyExtractionItem[] = [
    {
      id: `onto_${stableHash(`${source.id}:source-summary`).slice(0, 16)}`,
      kind: "source-summary",
      label: source.title,
      summary: summarizeSource(source),
      confidence: source.content ? 0.82 : 0.45,
      evidenceSourceIds: [source.id],
      evidencePageIds: pageIds
    },
    ontologyEntityItem({
      source,
      page,
      updatedAt,
      kind: "topic",
      label: source.title.replace(/\.[^.]+$/, ""),
      summary: summarizeSource(source),
      confidence: 0.68
    })
  ];

  const firstClaim = extractFirstClaim(source.content);
  if (firstClaim) {
    items.push(ontologyClaimItem(source, page, firstClaim, updatedAt));
  }

  for (const skill of extractKeywordList(source.content, ["skills include", "skills:", "技能包括", "能力包括", "擅长"])) {
    items.push(
      ontologyEntityItem({
        source,
        page,
        updatedAt,
        kind: "skill",
        label: skill,
        summary: `Candidate skill mentioned in ${source.title}.`,
        confidence: 0.72
      })
    );
  }

  for (const tool of extractKnownTools(source.content)) {
    items.push(
      ontologyEntityItem({
        source,
        page,
        updatedAt,
        kind: "tool",
        label: tool,
        summary: `Candidate tool or technology mentioned in ${source.title}.`,
        confidence: 0.7
      })
    );
  }

  for (const year of extractYears(source.content)) {
    items.push(
      ontologyEntityItem({
        source,
        page,
        updatedAt,
        kind: "event",
        label: `${year} event`,
        summary: `Candidate dated event mentioned in ${source.title}.`,
        confidence: 0.55
      })
    );
  }

  return dedupeOntologyItems(items);
};

const ontologyEntityItem = (input: {
  source: SourceDocument;
  page: WikiPage | undefined;
  updatedAt: string;
  kind: WikiEntity["kind"];
  label: string;
  summary: string;
  confidence: number;
}): OntologyExtractionItem => {
  const entity: WikiEntity = {
    id: `candidate_${input.kind}_${stableHash(`${input.source.id}:${input.kind}:${input.label}`).slice(0, 16)}`,
    name: input.label,
    kind: input.kind,
    aliases: [],
    summary: input.summary,
    sourceIds: [input.source.id],
    updatedAt: input.updatedAt
  };
  if (input.page) entity.pageId = input.page.id;

  return {
    id: `onto_${stableHash(`${input.source.id}:${input.kind}:${input.label}`).slice(0, 16)}`,
    kind: input.kind === "skill" ? "skill" : input.kind === "topic" ? "topic" : input.kind === "event" ? "event" : "entity",
    label: input.label,
    summary: input.summary,
    confidence: input.confidence,
    evidenceSourceIds: [input.source.id],
    evidencePageIds: input.page ? [input.page.id] : [],
    candidateEntity: entity
  };
};

const ontologyClaimItem = (
  source: SourceDocument,
  page: WikiPage | undefined,
  statement: string,
  updatedAt: string
): OntologyExtractionItem => {
  const claim: WikiClaim = {
    id: `claim_${stableHash(`${source.id}:${statement}`).slice(0, 16)}`,
    statement,
    subjectEntityIds: [],
    sourceIds: [source.id],
    confidence: 0.6,
    status: "candidate",
    updatedAt
  };

  return {
    id: `onto_${stableHash(`${source.id}:claim:${statement}`).slice(0, 16)}`,
    kind: "claim",
    label: oneLine(statement, 80),
    summary: statement,
    confidence: 0.6,
    evidenceSourceIds: [source.id],
    evidencePageIds: page ? [page.id] : [],
    candidateClaim: claim
  };
};

const createOntologyOpenQuestions = (items: OntologyExtractionItem[]): string[] => {
  const weakItems = items.filter((item) => item.confidence < 0.6);
  if (weakItems.length === 0) return [];
  return [
    `Review ${weakItems.length} low-confidence ontology candidate${weakItems.length === 1 ? "" : "s"} before promoting them into durable wiki pages.`
  ];
};

const renderWikiIndex = (
  title: string,
  sources: SourceDocument[],
  pages: WikiPage[],
  entities: WikiEntity[],
  updatedAt: string
): string =>
  [
    `# ${title}`,
    "",
    "> This wiki is generated from immutable raw sources. Source files may be referenced in place; this wiki is the maintained semantic layer.",
    "",
    `Updated: ${updatedAt}`,
    `Sources: ${sources.length}`,
    `Pages: ${pages.length + 2}`,
    `Entities: ${entities.length}`,
    "",
    "## Source Summaries",
    ...pages.map((page) => `- [[${page.title}]] · ${oneLine(page.body, 120)}`),
    "",
    "## Raw Sources",
    ...sources.map((source) => `- file://${source.id} · ${source.title} · ${source.contentMode ?? "inline"} · ${source.uri}`),
    "",
    "## Entities",
    ...entities.map((entity) => `- entity://${entity.id} · ${entity.name} · ${entity.summary}`)
  ].join("\n");

const renderWikiLog = (events: WikiEvent[]): string =>
  [
    "# log.wiki",
    "",
    ...events
      .slice()
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
      .map((event) => `## [${event.occurredAt}] ${event.kind} | ${event.title}\n${event.summary}`)
  ].join("\n\n");

const renderSourcePage = (source: SourceDocument): string =>
  [
    `# ${source.title}`,
    "",
    `Source: ${source.uri}`,
    `Content mode: ${source.contentMode ?? "inline"}`,
    source.byteSize === undefined ? undefined : `Size: ${source.byteSize} bytes`,
    "",
    "## Summary",
    summarizeSource(source),
    "",
    "## Extract",
    source.content.trim() || "No text has been extracted yet. The raw source is linked and can be opened on demand."
  ]
    .filter((line) => line !== undefined)
    .join("\n");

const summarizeSource = (source: SourceDocument): string => {
  const content = oneLine(source.content, 220);
  if (content) return content;
  const size = source.byteSize === undefined ? "unknown size" : `${source.byteSize} bytes`;
  return `Referenced ${source.mediaType} source (${size}). Text extraction is pending or unavailable.`;
};

const preserveValidRelations = (
  relations: WikiRelation[],
  entityIds: string[],
  sourceIds: string[]
): WikiRelation[] => {
  const entitySet = new Set(entityIds);
  const sourceSet = new Set(sourceIds);
  return relations.filter(
    (relation) =>
      entitySet.has(relation.fromEntityId) &&
      entitySet.has(relation.toEntityId) &&
      relation.evidenceSourceIds.every((sourceId) => sourceSet.has(sourceId))
  );
};

const DEFAULT_ONTOLOGY_SCHEMA_ID = "ontology_schema_personal_wiki_default";

const KNOWN_TOOL_TERMS = [
  "AI",
  "CLI",
  "LLM",
  "Markdown",
  "Next.js",
  "Obsidian",
  "React",
  "TypeScript",
  "Wiki",
  "agent",
  "harness"
];

const extractFirstClaim = (content: string): string | undefined => {
  const compact = oneLine(content, 500);
  if (!compact) return undefined;
  const [firstSentence] = compact.split(/(?<=[.!?。！？])\s+/);
  const claim = (firstSentence ?? compact).trim();
  if (claim.length < 18) return undefined;
  return oneLine(claim, 220);
};

const extractKeywordList = (content: string, markers: string[]): string[] => {
  const lower = content.toLowerCase();
  const marker = markers.find((candidate) => lower.includes(candidate.toLowerCase()));
  if (!marker) return [];
  const index = lower.indexOf(marker.toLowerCase());
  const afterMarker = content.slice(index + marker.length);
  const firstLine = afterMarker.split(/\n|。|；|;/)[0] ?? "";
  return firstLine
    .split(/,|，|、|\band\b/)
    .map((item) => item.trim().replace(/^[：:\-\s]+/, ""))
    .filter((item) => item.length >= 2)
    .slice(0, 8);
};

const extractKnownTools = (content: string): string[] => {
  const lower = content.toLowerCase();
  return KNOWN_TOOL_TERMS.filter((term) => lower.includes(term.toLowerCase()));
};

const extractYears = (content: string): string[] => {
  const years = content.match(/\b(?:19|20)\d{2}\b/g) ?? [];
  return [...new Set(years)].slice(0, 8);
};

const dedupeOntologyItems = (items: OntologyExtractionItem[]): OntologyExtractionItem[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.kind}:${item.label.toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const compareWikiPages = (a: WikiPage, b: WikiPage): number => {
  const rank = (page: WikiPage) => {
    if (page.kind === "index") return 0;
    if (page.kind === "log") return 1;
    if (page.kind === "source-summary") return 2;
    return 3;
  };
  return rank(a) - rank(b) || a.title.localeCompare(b.title);
};

const createMissingPage = (id: string, title: string, updatedAt: string): WikiPage => ({
  id,
  kind: title === "log.wiki" ? "log" : "index",
  title,
  path: `wiki/${title}`,
  body: "",
  entityIds: [],
  sourceIds: [],
  updatedAt
});

const searchWikiSnapshot = (snapshot: WikiSnapshot, query: string, limit: number) => {
  const tokens = query
    .toLowerCase()
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const scored = [
    ...snapshot.pages.map((page) => ({
      kind: "page" as const,
      id: page.id,
      title: page.title,
      path: page.path,
      summary: oneLine(page.body, 220),
      score: scoreText(`${page.title}\n${page.body}`, tokens)
    })),
    ...snapshot.entities.map((entity) => ({
      kind: "entity" as const,
      id: entity.id,
      title: entity.name,
      path: entity.pageId,
      summary: entity.summary,
      score: scoreText(`${entity.name}\n${entity.aliases.join(" ")}\n${entity.summary}`, tokens)
    })),
    ...snapshot.sources.map((source) => ({
      kind: "source" as const,
      id: source.id,
      title: source.title,
      path: source.uri,
      summary: summarizeSource(source),
      score: scoreText(`${source.title}\n${source.content}\n${source.uri}`, tokens)
    }))
  ];

  return scored
    .filter((item) => item.score > 0 || tokens.length === 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    .slice(0, Math.max(1, limit));
};

const scoreText = (text: string, tokens: string[]): number => {
  if (tokens.length === 0) return 1;
  const lower = text.toLowerCase();
  return tokens.reduce((score, token) => score + (lower.includes(token) ? 1 : 0), 0);
};

const getString = (input: unknown, key: string): string | undefined => {
  if (!isRecord(input)) return undefined;
  const value = input[key];
  return typeof value === "string" && value.trim() ? value : undefined;
};

const getRequiredString = (input: unknown, key: string): string => {
  const value = getString(input, key);
  if (!value) throw new Error(`Missing required string: ${key}`);
  return value;
};

const getNumber = (input: unknown, key: string): number | undefined => {
  if (!isRecord(input)) return undefined;
  const value = input[key];
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
};

const isRecord = (input: unknown): input is Record<string, unknown> =>
  typeof input === "object" && input !== null;

const oneLine = (value: string, max = 160): string => {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
};

const slugify = (value: string): string =>
  value
    .toLowerCase()
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "") || "source";

const stableHash = (value: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
};
