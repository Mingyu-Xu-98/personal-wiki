import { NextResponse } from "next/server";
import { loginUser } from "../../../../lib/server/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const user = await loginUser(String(body.email || ""), String(body.password || ""));
    if (!user) {
      return NextResponse.json({ error: "Invalid email or password." }, { status: 401 });
    }
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Login failed.";
    const isDatabaseUnavailable =
      message.includes("ECONNREFUSED") || message.includes("connect") || message.includes("54322");
    return NextResponse.json(
      {
        error: isDatabaseUnavailable
          ? "PostgreSQL is not running. Start Docker/Postgres or switch Studio to local JSON mode."
          : message
      },
      { status: 500 }
    );
  }
}
