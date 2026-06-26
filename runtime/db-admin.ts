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
  if (!email) {
    console.error("Usage: npm run db:create-user -- <email> [role] [comma_scopes]");
    process.exit(1);
  }
  if (!["admin", "builder", "viewer"].includes(role)) {
    console.error("role must be admin, builder, or viewer");
    process.exit(1);
  }
  await db.migrate();
  const created = await db.createUserApiKey({ email, role: role as "admin" | "builder" | "viewer", scopes });
  await db.close();
  console.log(JSON.stringify({ email, role, scopes, userId: created.userId, apiKey: created.apiKey }, null, 2));
} else {
  console.error("Usage: db-admin migrate | create-user");
  process.exit(1);
}
