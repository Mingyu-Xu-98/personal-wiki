import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/server/auth";
import {
  enqueueRun,
  getBuildJobState,
  getBuildJobs,
  getQuotaState,
  getRuns,
  prepareStudioState
} from "../../../lib/server/store";
import type { BuildIntent } from "@personal-wiki-harness/harness-core";

export async function GET(request: Request) {
  const user = await requireUser();
  await prepareStudioState(user.id);
  const searchParams = new URL(request.url).searchParams;
  const jobId = searchParams.get("jobId");
  if (jobId) {
    return NextResponse.json(getBuildJobState(user.id, jobId));
  }
  const runId = searchParams.get("runId");
  if (runId) {
    const run = getRuns(user.id).find((item) => item.id === runId) ?? null;
    return NextResponse.json({ run });
  }
  return NextResponse.json({
    runs: getRuns(user.id),
    jobs: getBuildJobs(user.id),
    quota: getQuotaState(user.id)
  });
}

export async function POST(request: Request) {
  const user = await requireUser();
  await prepareStudioState(user.id);
  const body = await request.json();
  const desiredArtifact = isDesiredArtifact(body.desiredArtifact) ? body.desiredArtifact : "site";
  const input: Omit<BuildIntent, "id" | "createdAt"> = {
    title: String(body.title || "Untitled Build"),
    prompt: String(body.prompt || ""),
    audience: String(body.audience || "self"),
    desiredArtifact,
    constraints: Array.isArray(body.constraints) ? body.constraints.map(String) : []
  };

  if (body.baseRunId) input.baseRunId = String(body.baseRunId);
  if (body.baseVersionId) input.baseVersionId = String(body.baseVersionId);
  if (body.revisionReason) input.revisionReason = String(body.revisionReason);
  if (body.knowledgeBaseId) input.knowledgeBaseId = String(body.knowledgeBaseId);
  if (body.knowledgeBaseName) input.knowledgeBaseName = String(body.knowledgeBaseName);

  try {
    const queued = await enqueueRun(user.id, input);
    return NextResponse.json({ run: null, ...queued }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 429 }
    );
  }
}

const isDesiredArtifact = (value: unknown): value is NonNullable<BuildIntent["desiredArtifact"]> =>
  value === "site" || value === "page" || value === "brief" || value === "wiki-update";
