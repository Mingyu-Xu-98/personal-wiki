import type { ContentModel, HarnessRun } from "../domain/index.js";
import type { ToolDefinition } from "./types.js";
import { ApprovalGate } from "./approval-gate.js";
import { SandboxRunner } from "./sandbox-runner.js";

export function createBuiltinTools(input: {
  workspaceRoot: string;
  approvalGate: ApprovalGate;
  sandbox: SandboxRunner;
}): ToolDefinition[] {
  const contentModel: ContentModel = {
    id: "demo-content-model",
    hero: {
      name: "Personal Wiki",
      title: "A living knowledge base compiled into websites",
      summary: "A recruiter-focused portfolio generated from durable wiki knowledge.",
      tags: ["wiki", "harness", "agent", "portfolio"],
    },
    sections: [
      {
        id: "hero",
        kind: "hero",
        title: "Identity",
        entityIds: [],
        narrativeRole: "establish identity and intent",
      },
      {
        id: "projects",
        kind: "projects",
        title: "Selected Work",
        entityIds: [],
        narrativeRole: "show proof through project artifacts",
      },
    ],
    sourceIds: [],
  };

  return [
    {
      name: "read_content_model",
      description: "Read the content model selected for this site build.",
      permissions: ["read_wiki"],
      execute: async () => JSON.stringify(contentModel, null, 2),
    },
    {
      name: "write_site_file",
      description: "Write a generated site artifact file into the isolated artifact workspace.",
      permissions: ["write_artifacts"],
      execute: async (rawInput: unknown, run: HarnessRun) => {
        const parsed = parseWriteSiteFileInput(rawInput);
        const filePath = await input.sandbox.writeArtifactFile(run.id, parsed.path, parsed.content);
        return `Wrote ${filePath}`;
      },
    },
    {
      name: "request_approval",
      description: "Create a human approval checkpoint for an artifact or workflow transition.",
      permissions: ["request_approval"],
      execute: async (rawInput: unknown, run: HarnessRun) => {
        const parsed = parseApprovalInput(rawInput);
        const approval = input.approvalGate.request({
          runId: run.id,
          reason: parsed.reason,
          artifactPath: parsed.artifactPath,
          autoApprove: parsed.autoApprove,
        });
        return JSON.stringify(approval, null, 2);
      },
    },
    {
      name: "run_build",
      description: "Validate the generated artifact in an isolated sandbox contract.",
      permissions: ["run_sandbox"],
      execute: async (rawInput: unknown, run: HarnessRun) => {
        const parsed = parseRunBuildInput(rawInput);
        const result = await input.sandbox.validate(run.id, parsed.requiredFiles);
        return JSON.stringify(result, null, 2);
      },
    },
  ];
}

function parseWriteSiteFileInput(input: unknown): { path: string; content: string } {
  if (!isRecord(input)) throw new Error("write_site_file input must be an object");
  const filePath = input.path;
  const content = input.content;
  if (typeof filePath !== "string" || typeof content !== "string") {
    throw new Error("write_site_file requires string path and content");
  }
  return { path: filePath, content };
}

function parseApprovalInput(input: unknown): { reason: string; artifactPath?: string; autoApprove: boolean } {
  if (!isRecord(input)) throw new Error("request_approval input must be an object");
  if (typeof input.reason !== "string") throw new Error("request_approval requires reason");
  return {
    reason: input.reason,
    artifactPath: typeof input.artifactPath === "string" ? input.artifactPath : undefined,
    autoApprove: input.autoApprove === true,
  };
}

function parseRunBuildInput(input: unknown): { requiredFiles: string[] } {
  if (!isRecord(input)) throw new Error("run_build input must be an object");
  if (!Array.isArray(input.requiredFiles) || !input.requiredFiles.every((file) => typeof file === "string")) {
    throw new Error("run_build requires requiredFiles: string[]");
  }
  return { requiredFiles: input.requiredFiles };
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null;
}
