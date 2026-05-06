import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/server/auth";
import { addSource, getKnowledge } from "../../../lib/server/store";

export async function GET() {
  await requireUser();
  return NextResponse.json(getKnowledge());
}

export async function POST(request: Request) {
  await requireUser();
  const body = await request.json();
  const sourceInput = {
    title: String(body.title || "Untitled Source"),
    content: String(body.content || "")
  };
  const source = addSource(body.uri ? { ...sourceInput, uri: String(body.uri) } : sourceInput);
  return NextResponse.json({ source });
}
