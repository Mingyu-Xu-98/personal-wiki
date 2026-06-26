import { NextResponse } from "next/server";
import { getAllUsers, requireAdmin } from "../../../../lib/server/auth";
import { getStats, getSystemState, prepareStudioState } from "../../../../lib/server/store";

export async function GET() {
  const user = await requireAdmin();
  await prepareStudioState(user.id);
  const users = await getAllUsers();
  const system = getSystemState(user.id);
  return NextResponse.json({
    stats: {
      users: users.length,
      ...getStats()
    },
    users,
    skills: system.skills,
    modelRouting: system.modelRouting,
    modelRuntime: system.modelRuntime
  });
}
