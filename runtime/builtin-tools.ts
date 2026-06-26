import fs from "node:fs/promises";
import path from "node:path";
import type { ContentModel, HarnessRun } from "../domain/index.js";
import {
  compileContentModelToSitePlan,
  compileWikiToContentModel,
  ingestWorkspaceSources,
  loadWikiSnapshot,
  renderSiteArtifacts,
} from "../domain/index.js";
import type { ToolDefinition } from "./types.js";
import { ApprovalGate } from "./approval-gate.js";
import { SandboxRunner } from "./sandbox-runner.js";

export function createBuiltinTools(input: {
  workspaceRoot: string;
  approvalGate: ApprovalGate;
  sandbox: SandboxRunner;
}): ToolDefinition[] {
  return [
    {
      name: "ingest_sources",
      description: "Ingest workspace raw sources into the durable personal wiki.",
      permissions: ["read_sources", "write_wiki"],
      execute: async () => {
        const result = await ingestWorkspaceSources(input.workspaceRoot);
        return JSON.stringify({
          sources: result.snapshot.sources.length,
          entities: result.snapshot.entities.length,
          pages: result.snapshot.pages.length,
          indexPath: result.indexPath,
          logPath: result.logPath,
        }, null, 2);
      },
    },
    {
      name: "create_content_model",
      description: "Compile the current wiki snapshot into a website-ready content model.",
      permissions: ["read_wiki", "write_artifacts"],
      execute: async (_rawInput: unknown, run: HarnessRun) => {
        const snapshot = await loadWikiSnapshot(input.workspaceRoot);
        const contentModel = compileWikiToContentModel(snapshot, run.intent);
        const runDir = path.join(input.workspaceRoot, "runs", run.id);
        await fs.mkdir(runDir, { recursive: true });
        await fs.writeFile(path.join(runDir, "content-model.json"), `${JSON.stringify(contentModel, null, 2)}\n`);
        run.context.loadedEntityIds = contentModel.sections.flatMap((section) => section.entityIds);
        run.context.loadedSourceRefs = contentModel.sourceIds.map((sourceId) => ({ sourceId }));
        return JSON.stringify(contentModel, null, 2);
      },
    },
    {
      name: "create_site_plan",
      description: "Compile a content model into a site plan.",
      permissions: ["read_wiki", "write_artifacts"],
      execute: async (_rawInput: unknown, run: HarnessRun) => {
        const contentModel = await loadRunJson<ContentModel>(input.workspaceRoot, run.id, "content-model.json");
        const sitePlan = compileContentModelToSitePlan(contentModel, run.intent);
        const runDir = path.join(input.workspaceRoot, "runs", run.id);
        await fs.writeFile(path.join(runDir, "site-plan.json"), `${JSON.stringify(sitePlan, null, 2)}\n`);
        return JSON.stringify(sitePlan, null, 2);
      },
    },
    {
      name: "read_content_model",
      description: "Read the content model selected for this site build.",
      permissions: ["read_wiki"],
      execute: async (_rawInput: unknown, run: HarnessRun) => {
        const contentModel = await loadRunJson<ContentModel>(input.workspaceRoot, run.id, "content-model.json");
        return JSON.stringify(contentModel, null, 2);
      },
    },
    {
      name: "render_site_artifacts",
      description: "Render site HTML and markdown artifacts from the current content model and site plan.",
      permissions: ["write_artifacts"],
      execute: async (_rawInput: unknown, run: HarnessRun) => {
        const contentModel = await loadRunJson<ContentModel>(input.workspaceRoot, run.id, "content-model.json");
        const sitePlan = await loadRunJson<ReturnType<typeof compileContentModelToSitePlan>>(input.workspaceRoot, run.id, "site-plan.json");
        const artifact = renderSiteArtifacts(contentModel, sitePlan, run.intent);
        const htmlPath = await input.sandbox.writeArtifactFile(run.id, "index.html", artifact.html);
        const markdownPath = await input.sandbox.writeArtifactFile(run.id, "site.md", artifact.markdown);
        return JSON.stringify({ htmlPath, markdownPath }, null, 2);
      },
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

async function loadRunJson<T>(workspaceRoot: string, runId: string, file: string): Promise<T> {
  const json = await fs.readFile(path.join(workspaceRoot, "runs", runId, file), "utf8");
  return JSON.parse(json) as T;
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
