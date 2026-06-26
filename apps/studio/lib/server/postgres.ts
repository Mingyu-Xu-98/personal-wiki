import pg from "pg";
import type { QueryResultRow } from "pg";

const { Pool } = pg;

type GlobalWithPg = typeof globalThis & {
  __pwhPgPool?: pg.Pool;
};

const globalForPg = globalThis as GlobalWithPg;

const clean = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed || undefined;
};

export const getDatabaseUrl = () => clean(process.env.DATABASE_URL);

export const isPostgresStoreEnabled = (storeName: "auth" | "studio" = "studio") => {
  const explicitStore = clean(process.env.PWH_STUDIO_STORE)?.toLowerCase();
  const authStore = clean(process.env.PWH_AUTH_STORE)?.toLowerCase();
  if (storeName === "auth" && authStore) return authStore === "postgres";
  return explicitStore === "postgres";
};

export const isPostgresConfigured = () => Boolean(getDatabaseUrl());

export const getPostgresPool = () => {
  const connectionString = getDatabaseUrl();
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.");
  }

  globalForPg.__pwhPgPool ??= new Pool({
    connectionString,
    max: Number(process.env.PWH_PG_POOL_MAX || 8),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000
  });

  return globalForPg.__pwhPgPool;
};

export const queryPostgres = async <Row extends QueryResultRow>(
  text: string,
  values: unknown[] = []
): Promise<Row[]> => {
  const result = await getPostgresPool().query<Row>(text, values);
  return result.rows;
};

export const checkPostgresConnection = async () => {
  const rows = await queryPostgres<{ database: string; user: string; now: Date }>(
    "select current_database() as database, current_user as user, now() as now"
  );
  return rows[0] ?? null;
};
