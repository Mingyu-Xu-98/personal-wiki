import type { WikiLintIssue, WikiSnapshot } from "../../wiki-core/src/index.ts";
import type {
  ContentModel,
  DesignUsagePlan,
  PatchPlan,
  SiteArtifact,
  SiteGraph,
  SitePlan,
  SiteWorkspace
} from "../../site-compiler/src/index.ts";
import type { ModelRoutingDecision, ModelRoutingPolicy, SubAgentTrace } from "../../agent-runtime/src/index.ts";
import type { SystemSkillLibrary } from "../../meta-skill-core/src/index.ts";

export type ConstraintStrength = "hard" | "soft";

export type HarnessConstraint = {
  id: string;
  strength: ConstraintStrength;
  scope:
    | "workspace"
    | "knowledge-base"
    | "privacy"
    | "ontology"
    | "intent"
    | "content"
    | "design"
    | "code"
    | "publish"
    | "cost";
  statement: string;
  reason: string;
  source: "system" | "user" | "wiki" | "commander" | "policy";
  negotiable: boolean;
};

export type CommanderPhase =
  | "workspace-discovery"
  | "knowledge-base-selection"
  | "source-linking"
  | "ontology-ingest"
  | "mutation-plan-review"
  | "wiki-maintenance"
  | "intent-clarification"
  | "site-generation"
  | "site-planning"
  | "site-building"
  | "verification"
  | "versioning"
  | "reflection";

export type CommanderDecision = {
  id: string;
  phase: CommanderPhase;
  createdAt: string;
  summary: string;
  nextPhase?: CommanderPhase;
  requiredToolNames: string[];
  hardConstraintIds: string[];
  softConstraintIds: string[];
  contextPacketIds: string[];
  requiresHumanConfirmation: boolean;
};

export type CommanderPolicy = {
  id: string;
  name: string;
  phases: CommanderPhase[];
  defaultHardConstraints: HarnessConstraint[];
  defaultSoftConstraints: HarnessConstraint[];
};

export type BuildIntent = {
  id: string;
  createdAt: string;
  title: string;
  prompt: string;
  audience?: string;
  desiredArtifact?: "site" | "page" | "brief" | "wiki-update";
  knowledgeBaseId?: string;
  knowledgeBaseName?: string;
  baseRunId?: string;
  baseVersionId?: string;
  revisionReason?: string;
  constraints: string[];
  hardConstraints?: HarnessConstraint[];
  softConstraints?: HarnessConstraint[];
};

export type HarnessRegistryRefKind =
  | "wiki-snapshot"
  | "source-snapshot"
  | "design-system"
  | "component-registry"
  | "tool-registry"
  | "style-guide"
  | "build-intent"
  | "base-version";

export type HarnessRegistryRef = {
  kind: HarnessRegistryRefKind;
  id: string;
  title: string;
  summary: string;
  version?: string;
  uri?: string;
};

export type RunContextManifest = {
  id: string;
  createdAt: string;
  intentId: string;
  knowledgeBaseId?: string;
  knowledgeBaseName?: string;
  wikiSnapshotId: string;
  sourceSnapshotId: string;
  designSystemId: string;
  componentRegistryId: string;
  toolRegistryId: string;
  styleGuideId: string;
  buildIntentId: string;
  baseVersionId?: string;
  registryRefs: HarnessRegistryRef[];
  requiredCarryForwardRefs: string[];
};

export type HarnessRunState =
  | "created"
  | "planning"
  | "executing"
  | "verifying"
  | "reflecting"
  | "versioned"
  | "failed";

export type ContextLedger = {
  id: string;
  intentId: string;
  createdAt: string;
  wikiSnapshotSummary: string;
  selectedPageIds: string[];
  selectedSourceIds: string[];
  selectedSystemSkillIds: string[];
  modelRouting: ModelRoutingDecision[];
  runContextManifest: RunContextManifest;
  commanderDecisionIds?: string[];
  preservedReferenceIds?: string[];
  notes: string[];
};

export type HarnessPlan = {
  id: string;
  intentId: string;
  createdAt: string;
  workflowSpecId?: string;
  workflowPhaseIds?: CommanderPhase[];
  steps: HarnessPlanStep[];
};

export type HarnessPlanStep = {
  id: string;
  title: string;
  kind: "context" | "wiki" | "compile" | "verify" | "reflect" | "meta-skill" | "version";
  status: "pending" | "running" | "completed" | "failed";
  phase?: CommanderPhase;
  owner?: string;
  modelRole?: ModelRoutingDecision["role"];
  modelTier?: ModelRoutingDecision["tier"];
  toolName?: string;
  requiredToolNames?: string[];
  requiredOutputNames?: string[];
  requiresHumanConfirmation?: boolean;
};

export type ToolCallRecord = {
  id: string;
  runId: string;
  toolName: string;
  input: unknown;
  output: unknown;
  startedAt: string;
  finishedAt: string;
  status: "completed" | "failed";
};

export type HarnessObservationTarget =
  | "run"
  | "phase"
  | "agent"
  | "model"
  | "tool"
  | "mcp"
  | "skill"
  | "artifact"
  | "verification"
  | "version"
  | "reflection";

export type HarnessObservationEventType =
  | "run.started"
  | "run.completed"
  | "run.failed"
  | "phase.started"
  | "phase.completed"
  | "phase.failed"
  | "agent.dispatched"
  | "agent.started"
  | "agent.completed"
  | "agent.failed"
  | "model.routing.selected"
  | "tool.completed"
  | "tool.failed"
  | "mcp.synced"
  | "skill.selected"
  | "artifact.created"
  | "verification.completed"
  | "verification.failed"
  | "version.created"
  | "reflection.created";

export type HarnessObservationStatus = "started" | "completed" | "failed" | "blocked" | "skipped";

export type HarnessObservationEvent = {
  id: string;
  runId: string;
  intentId: string;
  createdAt: string;
  target: HarnessObservationTarget;
  type: HarnessObservationEventType;
  status?: HarnessObservationStatus | undefined;
  phase?: CommanderPhase | undefined;
  agentRole?: SubAgentTrace["role"] | undefined;
  traceId?: string | undefined;
  toolName?: string | undefined;
  modelRole?: ModelRoutingDecision["role"] | undefined;
  modelTier?: ModelRoutingDecision["tier"] | undefined;
  artifactRefs?: string[] | undefined;
  durationMs?: number | undefined;
  message: string;
  inputSummary?: string | undefined;
  outputSummary?: string | undefined;
  data?: Record<string, unknown> | undefined;
};

export type HarnessLifecycleHook = {
  name: string;
  handle(event: HarnessObservationEvent): void | Promise<void>;
};

export type HarnessObserver = {
  record(event: HarnessObservationEvent): void | Promise<void>;
};

export type BuildVersion = {
  id: string;
  runId: string;
  createdAt: string;
  parentVersionId?: string;
  changeSummary?: string;
  summary: string;
  contentModel?: ContentModel;
  designUsagePlan?: DesignUsagePlan;
  sitePlan?: SitePlan;
  siteArtifact?: SiteArtifact;
  siteWorkspace?: SiteWorkspace;
  siteGraph?: SiteGraph;
  patchPlan?: PatchPlan;
  runContextManifest?: RunContextManifest;
  toolCalls?: ToolCallRecord[];
  lintIssues: WikiLintIssue[];
  appliedSystemSkillIds: string[];
};

export type RunReflection = {
  id: string;
  runId: string;
  createdAt: string;
  summary: string;
  findings: ReflectionFinding[];
  candidateSystemSkillIds: string[];
};

export type ReflectionFinding = {
  id: string;
  severity: "info" | "warning" | "action";
  message: string;
  target: "intent" | "context" | "plan" | "tool" | "verification" | "model-routing";
};

export type HarnessRun = {
  id: string;
  state: HarnessRunState;
  intent: BuildIntent;
  contextLedger?: ContextLedger;
  commanderDecisions?: CommanderDecision[];
  subAgentTraces?: SubAgentTrace[];
  plan?: HarnessPlan;
  toolCalls: ToolCallRecord[];
  observabilityEvents?: HarnessObservationEvent[];
  reflection?: RunReflection;
  buildVersion?: BuildVersion;
  error?: string;
};

export type HarnessRuntimeState = {
  wiki: WikiSnapshot;
  systemSkills: SystemSkillLibrary;
  modelRoutingPolicy: ModelRoutingPolicy;
  runs: HarnessRun[];
  versions: BuildVersion[];
  reflections: RunReflection[];
};

export type HarnessClock = {
  now(): string;
};

export type HarnessIdGenerator = {
  next(prefix: string): string;
};
