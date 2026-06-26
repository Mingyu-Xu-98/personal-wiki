import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/server/auth";
import { getSiteState, prepareStudioState, publishRunToSite } from "../../../lib/server/store";

export async function GET() {
  const user = await requireUser();
  await prepareStudioState(user.id);
  return NextResponse.json(getSiteState(user.id));
}

export async function POST(request: Request) {
  const user = await requireUser();
  await prepareStudioState(user.id);
  const body = await request.json();
  const runId = String(body.runId || "");
  const publication = publishRunToSite(user.id, runId, { role: user.role, email: user.email });
  return NextResponse.json({ publication, version: publication.version, site: getSiteState(user.id) });
}
