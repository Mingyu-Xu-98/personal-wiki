import { PostgresDatabase } from "./postgres.js";

const command = process.argv[2];
const db = PostgresDatabase.fromEnv();
if (!db) {
  console.error("DATABASE_URL is required.");
  process.exit(1);
}

if (command === "migrate") {
  await db.migrate();
  await db.close();
  console.log("Database migrated.");
} else if (command === "create-user") {
  const email = process.argv[3];
  const role = process.argv[4] ?? "builder";
  const scopes = (process.argv[5] ?? "runs:read,runs:write,artifacts:read,deploy:preview").split(",").filter(Boolean);
  const password = process.argv[6];
  if (!email) {
    console.error("Usage: npm run db:create-user -- <email> [role] [comma_scopes] [password]");
    process.exit(1);
  }
  if (!["admin", "builder", "viewer"].includes(role)) {
    console.error("role must be admin, builder, or viewer");
    process.exit(1);
  }
  await db.migrate();
  const created = await db.createUserApiKey({ email, role: role as "admin" | "builder" | "viewer", scopes, password });
  await db.close();
  console.log(JSON.stringify({ email, role, scopes, userId: created.userId, apiKey: created.apiKey, passwordSet: Boolean(password) }, null, 2));
} else if (command === "set-password") {
  const email = process.argv[3];
  const password = process.argv[4];
  if (!email || !password) {
    console.error("Usage: npm run db:set-password -- <email> <password>");
    process.exit(1);
  }
  await db.migrate();
  const userId = await db.setUserPassword(email, password);
  await db.close();
  console.log(JSON.stringify({ email, userId, passwordSet: true }, null, 2));
} else {
  console.error("Usage: db-admin migrate | create-user | set-password");
  process.exit(1);
}
