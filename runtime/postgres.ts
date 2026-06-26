import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { Pool } from "pg";
import type { HarnessRun } from "../domain/index.js";
import type { Principal } from "./security/auth.js";

const scrypt = promisify(scryptCallback);

export interface RunSummary {
  id: string;
  status: string;
  step: string;
  versions: number;
  artifactPath?: string;
  updatedAt: string;
}

export class PostgresDatabase {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  static fromEnv(): PostgresDatabase | null {
    return process.env.DATABASE_URL ? new PostgresDatabase(process.env.DATABASE_URL) : null;
  }

  async migrate(): Promise<void> {
    const schema = await fs.readFile(path.join(process.cwd(), "db/schema.sql"), "utf8");
    const client = await this.pool.connect();
    try {
      await client.query("SELECT pg_advisory_lock($1)", [migrationLockId()]);
      await client.query(schema);
    } finally {
      await client.query("SELECT pg_advisory_unlock($1)", [migrationLockId()]).catch(() => undefined);
      client.release();
    }
  }

  async verifyApiKey(rawKey: string): Promise<Principal | null> {
    const keyHash = hashApiKey(rawKey);
    const result = await this.pool.query<{
      user_id: string;
      email: string;
      role: Principal["role"];
      scopes: string[];
    }>(`
      SELECT u.id AS user_id, u.email, u.role, ak.scopes
      FROM api_keys ak
      JOIN users u ON u.id = ak.user_id
      WHERE ak.key_hash = $1
        AND ak.revoked_at IS NULL
        AND u.status = 'active'
      LIMIT 1
    `, [keyHash]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      userId: row.user_id,
      email: row.email,
      role: row.role,
      scopes: row.scopes ?? [],
    };
  }

  async verifySessionToken(rawToken: string): Promise<Principal | null> {
    const tokenHash = hashSessionToken(rawToken);
    const result = await this.pool.query<{
      user_id: string;
      email: string;
      role: Principal["role"];
    }>(`
      SELECT u.id AS user_id, u.email, u.role
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > now()
        AND u.status = 'active'
      LIMIT 1
    `, [tokenHash]);
    const row = result.rows[0];
    if (!row) return null;
    return {
      userId: row.user_id,
      email: row.email,
      role: row.role,
      scopes: scopesForRole(row.role),
    };
  }

  async authenticatePassword(email: string, password: string): Promise<Principal | null> {
    const result = await this.pool.query<{
      user_id: string;
      email: string;
      role: Principal["role"];
      password_hash: string;
    }>(`
      SELECT u.id AS user_id, u.email, u.role, pc.password_hash
      FROM users u
      JOIN password_credentials pc ON pc.user_id = u.id
      WHERE lower(u.email) = lower($1)
        AND u.status = 'active'
      LIMIT 1
    `, [email]);
    const row = result.rows[0];
    if (!row || !await verifyPassword(password, row.password_hash)) return null;
    return {
      userId: row.user_id,
      email: row.email,
      role: row.role,
      scopes: scopesForRole(row.role),
    };
  }

  async createSession(principal: Principal, ttlDays = 14): Promise<{ token: string; expiresAt: Date }> {
    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    await this.pool.query(`
      INSERT INTO sessions (id, user_id, token_hash, expires_at)
      VALUES ($1, $2, $3, $4)
    `, [randomUUID(), principal.userId, hashSessionToken(token), expiresAt]);
    return { token, expiresAt };
  }

  async revokeSession(rawToken: string): Promise<void> {
    await this.pool.query("UPDATE sessions SET revoked_at = now() WHERE token_hash = $1", [hashSessionToken(rawToken)]);
  }

  async createUserApiKey(input: {
    email: string;
    role: Principal["role"];
    scopes: string[];
    name?: string;
    password?: string;
  }): Promise<{ userId: string; apiKey: string }> {
    const userId = randomUUID();
    const apiKey = generateApiKey();
    await this.pool.query(`
      INSERT INTO users (id, email, role, status)
      VALUES ($1, $2, $3, 'active')
      ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, status = 'active'
    `, [userId, input.email, input.role]);
    const userResult = await this.pool.query<{ id: string }>(
      "SELECT id FROM users WHERE email = $1",
      [input.email],
    );
    await this.pool.query(`
      INSERT INTO api_keys (id, user_id, name, key_hash, scopes)
      VALUES ($1, $2, $3, $4, $5)
    `, [randomUUID(), userResult.rows[0].id, input.name ?? "default", hashApiKey(apiKey), input.scopes]);
    if (input.password) await this.setUserPassword(input.email, input.password);
    return { userId: userResult.rows[0].id, apiKey };
  }

  async setUserPassword(email: string, password: string): Promise<string> {
    if (password.length < 8) throw new Error("Password must be at least 8 characters.");
    const userResult = await this.pool.query<{ id: string }>(
      "SELECT id FROM users WHERE lower(email) = lower($1) AND status = 'active'",
      [email],
    );
    const userId = userResult.rows[0]?.id;
    if (!userId) throw new Error(`No active user found for ${email}.`);
    await this.pool.query(`
      INSERT INTO password_credentials (user_id, password_hash, updated_at)
      VALUES ($1, $2, now())
      ON CONFLICT (user_id) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        updated_at = now()
    `, [userId, await hashPassword(password)]);
    return userId;
  }

  async getRunOwner(runId: string): Promise<string | null> {
    const result = await this.pool.query<{ user_id: string }>("SELECT user_id FROM harness_runs WHERE id = $1", [runId]);
    return result.rows[0]?.user_id ?? null;
  }

  async upsertRun(run: HarnessRun, principal: Principal): Promise<void> {
    await this.pool.query(`
      INSERT INTO harness_runs (id, user_id, status, step, artifact_path, version_count, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE SET
        status = EXCLUDED.status,
        step = EXCLUDED.step,
        artifact_path = EXCLUDED.artifact_path,
        version_count = EXCLUDED.version_count,
        updated_at = EXCLUDED.updated_at
    `, [
      run.id,
      principal.userId,
      run.status,
      run.currentStep,
      run.versions.at(-1)?.artifactPath ?? null,
      run.versions.length,
      run.createdAt,
      run.updatedAt,
    ]);
  }

  async listRuns(principal: Principal): Promise<RunSummary[]> {
    const params: string[] = [];
    const where = principal.role === "admin" ? "" : "WHERE user_id = $1";
    if (principal.role !== "admin") params.push(principal.userId);
    const result = await this.pool.query<{
      id: string;
      status: string;
      step: string;
      artifact_path: string | null;
      version_count: number;
      updated_at: Date;
    }>(`
      SELECT id, status, step, artifact_path, version_count, updated_at
      FROM harness_runs
      ${where}
      ORDER BY updated_at DESC
      LIMIT 100
    `, params);
    return result.rows.map((row) => ({
      id: row.id,
      status: row.status,
      step: row.step,
      versions: row.version_count,
      artifactPath: row.artifact_path ?? undefined,
      updatedAt: row.updated_at.toISOString(),
    }));
  }

  async canAccessRun(runId: string, principal: Principal): Promise<boolean> {
    if (principal.role === "admin") return true;
    const result = await this.pool.query("SELECT 1 FROM harness_runs WHERE id = $1 AND user_id = $2 LIMIT 1", [runId, principal.userId]);
    return result.rows.length > 0;
  }

  async recordDeploymentAuthorization(input: {
    runId: string;
    principal: Principal;
    environment: string;
    decision: "allow" | "deny" | "review";
    reason: string;
  }): Promise<void> {
    await this.pool.query(`
      INSERT INTO deployment_authorizations (id, run_id, user_id, environment, decision, reason)
      VALUES ($1, $2, $3, $4, $5, $6)
    `, [
      randomUUID(),
      input.runId,
      input.principal.userId,
      input.environment,
      input.decision,
      input.reason,
    ]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export function hashApiKey(rawKey: string): string {
  const secret = process.env.AUTH_SECRET ?? "";
  return createHash("sha256").update(`${secret}:${rawKey}`).digest("hex");
}

export function generateApiKey(): string {
  return `pwiki_${randomBytes(32).toString("base64url")}`;
}

export function generateSessionToken(): string {
  return `pws_${randomBytes(32).toString("base64url")}`;
}

export function hashSessionToken(rawToken: string): string {
  const secret = process.env.AUTH_SECRET ?? "";
  return createHash("sha256").update(`${secret}:session:${rawToken}`).digest("hex");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt:${salt}:${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, expected] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const expectedBuffer = Buffer.from(expected, "base64url");
  const actual = await scrypt(password, salt, expectedBuffer.length) as Buffer;
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

function scopesForRole(role: Principal["role"]): string[] {
  if (role === "admin") return ["*"];
  if (role === "builder") return ["runs:read", "runs:write", "artifacts:read", "deploy:preview"];
  return ["runs:read", "artifacts:read"];
}

function migrationLockId(): number {
  return 947201337;
}
