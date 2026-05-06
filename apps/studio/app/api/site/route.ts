import { NextResponse } from "next/server";
import { requireUser } from "../../../lib/server/auth";
import { getSiteState } from "../../../lib/server/store";

export async function GET() {
  await requireUser();
  return NextResponse.json(getSiteState());
}
