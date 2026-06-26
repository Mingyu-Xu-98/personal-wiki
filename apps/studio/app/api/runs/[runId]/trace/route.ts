import { NextResponse } from "next/server";
import { requireUser } from "../../../../../lib/server/auth";
import { getDurableRunRecord, prepareStudioState } from "../../../../../lib/server/store";

type RouteContext = {
  params: Promise<{ runId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireUser();
  await prepareStudioState(user.id);
  const { runId } = await context.params;
  const record = await getDurableRunRecord(user.id, runId);
  return NextResponse.json(record);
}
