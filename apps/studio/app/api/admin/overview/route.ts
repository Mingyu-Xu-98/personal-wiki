import { NextResponse } from "next/server";
import { getAllUsers, requireAdmin } from "../../../../lib/server/auth";
import { getStats, getSystemState } from "../../../../lib/server/store";

export async function GET() {
  await requireAdmin();
  const system = getSystemState();
  return NextResponse.json({
    stats: {
      users: getAllUsers().length,
      ...getStats()
    },
    users: getAllUsers(),
    skills: system.skills,
    modelRouting: system.modelRouting
  });
}
