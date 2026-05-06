import type { WikiLintIssue, WikiSnapshot } from "../../wiki-core/src/index.ts";
import type { ContentModel, SitePlan } from "../../site-compiler/src/index.ts";
import type { ModelRoutingDecision, ModelRoutingPolicy } from "../../agent-runtime/src/index.ts";
import type { SystemSkillLibrary } from "../../meta-skill-core/src/index.ts";

export type BuildIntent = {
  id: string;
  createdAt: string;
  title: string;
  prompt: string;
  audience?: string;
  desiredArtifact?: "site" | "page" | "brief" | "wiki-update";
  constraints: string[];
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
  notes: string[];
};

export type HarnessPlan = {
  id: string;
  intentId: string;
  createdAt: string;
  steps: HarnessPlanStep[];
};

export type HarnessPlanStep = {
  id: string;
  title: string;
  kind: "context" | "wiki" | "compile" | "verify" | "reflect" | "meta-skill" | "version";
  status: "pending" | "running" | "completed" | "failed";
  modelRole?: ModelRoutingDecision["role"];
  modelTier?: ModelRoutingDecision["tier"];
  toolName?: string;
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

export type BuildVersion = {
  id: string;
  runId: string;
  createdAt: string;
  summary: string;
  contentModel?: ContentModel;
  sitePlan?: SitePlan;
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
  plan?: HarnessPlan;
  toolCalls: ToolCallRecord[];
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
