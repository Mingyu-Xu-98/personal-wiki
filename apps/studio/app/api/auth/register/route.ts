import { NextResponse } from "next/server";
import { loginUser, registerUser } from "../../../../lib/server/auth";

export async function POST(request: Request) {
  const body = await request.json();
  const email = String(body.email || "");
  const password = String(body.password || "");
  const name = String(body.name || "");

  if (!email || !password) {
    return NextResponse.json({ error: "Email and password are required." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json({ error: "Password must be at least 6 characters." }, { status: 400 });
  }

  try {
    await registerUser({ name, email, password });
    const user = await loginUser(email, password);
    return NextResponse.json({ user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Registration failed.";
    const isDatabaseUnavailable =
      message.includes("ECONNREFUSED") || message.includes("connect") || message.includes("54322");
    return NextResponse.json(
      {
        error: isDatabaseUnavailable
          ? "PostgreSQL is not running. Start Docker/Postgres or switch Studio to local JSON mode."
          : message
      },
      { status: isDatabaseUnavailable ? 500 : 409 }
    );
  }
}
