import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/server/auth";
import { createRun, getRuns } from "../../../lib/server/store";
import type { BuildIntent } from "@personal-wiki-harness/harness-core";

export async function GET() {
  await requireUser();
  return NextResponse.json({ runs: getRuns() });
}

export async function POST(request: Request) {
  await requireUser();
  const body = await request.json();
  const desiredArtifact = isDesiredArtifact(body.desiredArtifact) ? body.desiredArtifact : "site";
  const run = await createRun({
    title: String(body.title || "Untitled Build"),
    prompt: String(body.prompt || ""),
    audience: String(body.audience || "self"),
    desiredArtifact,
    constraints: Array.isArray(body.constraints) ? body.constraints.map(String) : []
  });
  return NextResponse.json({ run });
}

const isDesiredArtifact = (value: unknown): value is NonNullable<BuildIntent["desiredArtifact"]> =>
  value === "site" || value === "page" || value === "brief" || value === "wiki-update";
