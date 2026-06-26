export interface BuildIntent {
  id: string;
  audience: "recruiter" | "client" | "reader" | "collaborator" | "general";
  purpose: "portfolio" | "resume" | "personal_brand" | "project_showcase" | "blog";
  goal: string;
  constraints: string[];
  createdAt: string;
}

export interface ContextLedger {
  wikiIndexPaths: string[];
  loadedEntityIds: string[];
  loadedSourceRefs: Array<{ sourceId: string; span?: string }>;
  visibleArtifacts: string[];
  notes: string[];
}

export interface ToolCallRecord {
  id: string;
  name: string;
  input: unknown;
  outputPreview: string;
  outputPath?: string;
  startedAt: string;
  finishedAt: string;
  status: "ok" | "error";
}

export interface BuildVersion {
  id: string;
  parentVersionId?: string;
  runId: string;
  artifactPath: string;
  summary: string;
  usedEntityIds: string[];
  usedSourceIds: string[];
  validationStatus: "pending" | "passed" | "failed";
  createdAt: string;
}

export type HarnessStep =
  | "analyze_intent"
  | "curate_wiki"
  | "compile_content"
  | "plan_site"
  | "build_site"
  | "validate"
  | "approval"
  | "repair"
  | "complete";

export interface HarnessRun {
  id: string;
  intent: BuildIntent;
  currentStep: HarnessStep;
  status: "running" | "paused" | "awaiting_approval" | "failed" | "completed";
  context: ContextLedger;
  toolTrace: ToolCallRecord[];
  versions: BuildVersion[];
  createdAt: string;
  updatedAt: string;
}

export interface PersistedRunBundle {
  run: HarnessRun;
  trace: unknown[];
  approvals: unknown[];
}
