import { NextResponse } from "next/server";
import { loginUser } from "../../../../lib/server/auth";

export async function POST(request: Request) {
  const body = await request.json();
  const user = await loginUser(String(body.email || ""), String(body.password || ""));
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
  }
  return NextResponse.json({ user });
}
