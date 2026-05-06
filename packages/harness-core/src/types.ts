import type { WikiLintIssue, WikiSnapshot } from "../../wiki-core/src/index.ts";
import type { ContentModel, SitePlan } from "../../site-compiler/src/index.ts";

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
  | "versioned"
  | "failed";

export type ContextLedger = {
  id: string;
  intentId: string;
  createdAt: string;
  wikiSnapshotSummary: string;
  selectedPageIds: string[];
  selectedSourceIds: string[];
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
  kind: "context" | "wiki" | "compile" | "verify" | "version";
  status: "pending" | "running" | "completed" | "failed";
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
};

export type HarnessRun = {
  id: string;
  state: HarnessRunState;
  intent: BuildIntent;
  contextLedger?: ContextLedger;
  plan?: HarnessPlan;
  toolCalls: ToolCallRecord[];
  buildVersion?: BuildVersion;
  error?: string;
};

export type HarnessRuntimeState = {
  wiki: WikiSnapshot;
  runs: HarnessRun[];
  versions: BuildVersion[];
};

export type HarnessClock = {
  now(): string;
};

export type HarnessIdGenerator = {
  next(prefix: string): string;
};
