import "server-only";
import { cookies } from "next/headers";
import {
  createHash,
  createHmac,
  randomBytes,
  randomUUID,
  scryptSync,
  timingSafeEqual
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isPostgresConfigured, isPostgresStoreEnabled, queryPostgres } from "./postgres.ts";

export type UserRole = "user" | "admin";

export type StudioUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash: string;
  createdAt: string;
};

type PublicStudioUser = ReturnType<typeof getPublicUser>;

type SerializedAuthStore = {
  version: 1;
  users: StudioUser[];
};

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  password_hash: string;
  created_at: Date | string;
};

type AuthRepository = {
  listUsers(): Promise<StudioUser[]>;
  findUserById(id: string): Promise<StudioUser | undefined>;
  findUserByEmail(email: string): Promise<StudioUser | undefined>;
  insertUser(user: StudioUser): Promise<void>;
  countUsers(): Promise<number>;
};

const SESSION_COOKIE = "pwh_session";
const SESSION_SECRET = process.env.PWH_SESSION_SECRET || "local-personal-wiki-harness-session-secret";
const AUTH_STATE_PATH =
  process.env.PWH_STUDIO_AUTH_PATH || path.join(".pwh-studio", "users.json");

const jsonUsers = new Map<string, StudioUser>();
let jsonUsersLoaded = false;
let seedsEnsured = false;

const seedInputs: Array<Omit<StudioUser, "id" | "createdAt" | "passwordHash"> & { password: string }> = [
  {
    name: "Admin",
    email: "admin@personal.wiki",
    password: "admin123",
    role: "admin"
  },
  {
    name: "Mingyu",
    email: "mingyu@example.com",
    password: "demo123",
    role: "user"
  }
];

const hashPassword = (password: string, salt = randomBytes(16).toString("hex")): string => {
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
};

const verifyPassword = (password: string, stored: string): boolean => {
  const [, salt, hash] = stored.split(":");
  if (!salt || !hash) {
    return false;
  }
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};

const signSession = (userId: string): string =>
  createHmac("sha256", SESSION_SECRET).update(userId).digest("hex");

const createSessionToken = (userId: string): string => `${userId}.${signSession(userId)}`;

const readSessionToken = (token: string | undefined): string | null => {
  if (!token) {
    return null;
  }
  const [userId, signature] = token.split(".");
  if (!userId || !signature) {
    return null;
  }
  const expected = signSession(userId);
  return signature === expected ? userId : null;
};

const createSeedUser = (
  user: Omit<StudioUser, "id" | "createdAt" | "passwordHash"> & { password: string }
): StudioUser => {
  const now = new Date().toISOString();
  const id = createHash("sha256").update(user.email).digest("hex").slice(0, 16);
  return {
    id,
    name: user.name,
    email: user.email,
    role: user.role,
    passwordHash: hashPassword(user.password, `seed-${user.email}`),
    createdAt: now
  };
};

const loadJsonUsers = () => {
  if (jsonUsersLoaded) return;
  jsonUsersLoaded = true;
  if (!existsSync(AUTH_STATE_PATH)) return;

  try {
    const parsed = JSON.parse(readFileSync(AUTH_STATE_PATH, "utf8")) as Partial<SerializedAuthStore>;
    if (!Array.isArray(parsed.users)) return;
    for (const user of parsed.users) {
      if (user?.id && user.email && user.passwordHash) {
        jsonUsers.set(user.id, user);
      }
    }
  } catch (error) {
    console.warn("[studio-auth] Failed to load persisted users.", error);
  }
};

const saveJsonUsers = () => {
  loadJsonUsers();
  const payload: SerializedAuthStore = {
    version: 1,
    users: Array.from(jsonUsers.values())
  };
  mkdirSync(path.dirname(AUTH_STATE_PATH), { recursive: true });
  writeFileSync(AUTH_STATE_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const jsonAuthRepository: AuthRepository = {
  async listUsers() {
    loadJsonUsers();
    return Array.from(jsonUsers.values());
  },
  async findUserById(id) {
    loadJsonUsers();
    return jsonUsers.get(id);
  },
  async findUserByEmail(email) {
    loadJsonUsers();
    return Array.from(jsonUsers.values()).find((user) => user.email === email);
  },
  async insertUser(user) {
    loadJsonUsers();
    jsonUsers.set(user.id, user);
    saveJsonUsers();
  },
  async countUsers() {
    loadJsonUsers();
    return jsonUsers.size;
  }
};

const rowToUser = (row: UserRow): StudioUser => ({
  id: row.id,
  name: row.name,
  email: row.email,
  role: row.role === "admin" ? "admin" : "user",
  passwordHash: row.password_hash,
  createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString()
});

const postgresAuthRepository: AuthRepository = {
  async listUsers() {
    const rows = await queryPostgres<UserRow>(
      "select id, name, email, role, password_hash, created_at from users order by created_at asc"
    );
    return rows.map(rowToUser);
  },
  async findUserById(id) {
    const rows = await queryPostgres<UserRow>(
      "select id, name, email, role, password_hash, created_at from users where id = $1 limit 1",
      [id]
    );
    return rows[0] ? rowToUser(rows[0]) : undefined;
  },
  async findUserByEmail(email) {
    const rows = await queryPostgres<UserRow>(
      "select id, name, email, role, password_hash, created_at from users where email = $1 limit 1",
      [email]
    );
    return rows[0] ? rowToUser(rows[0]) : undefined;
  },
  async insertUser(user) {
    await queryPostgres(
      `insert into users (id, email, name, role, password_hash, created_at)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (id) do update set
         email = excluded.email,
         name = excluded.name,
         role = excluded.role,
         password_hash = excluded.password_hash`,
      [user.id, user.email, user.name, user.role, user.passwordHash, user.createdAt]
    );
  },
  async countUsers() {
    const rows = await queryPostgres<{ count: string }>("select count(*)::text as count from users");
    return Number(rows[0]?.count ?? 0);
  }
};

const getAuthRepository = (): AuthRepository => {
  if (isPostgresStoreEnabled("auth") && isPostgresConfigured()) {
    return postgresAuthRepository;
  }
  return jsonAuthRepository;
};

const ensureSeedUsers = async () => {
  if (seedsEnsured) return;
  seedsEnsured = true;
  const repository = getAuthRepository();
  if ((await repository.countUsers()) > 0) return;
  for (const seed of seedInputs) {
    await repository.insertUser(createSeedUser(seed));
  }
};

export const getPublicUser = (user: StudioUser) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt
});

export const getAllUsers = async (): Promise<PublicStudioUser[]> => {
  await ensureSeedUsers();
  return (await getAuthRepository().listUsers()).map(getPublicUser);
};

export const registerUser = async (input: {
  name: string;
  email: string;
  password: string;
}): Promise<PublicStudioUser> => {
  const email = input.email.toLowerCase().trim();
  await ensureSeedUsers();
  const repository = getAuthRepository();
  const existing = await repository.findUserByEmail(email);
  if (existing) {
    throw new Error("An account with this email already exists.");
  }

  const now = new Date().toISOString();
  const user: StudioUser = {
    id: randomUUID(),
    name: input.name || email.split("@")[0] || "User",
    email,
    role: "user",
    passwordHash: hashPassword(input.password),
    createdAt: now
  };
  await repository.insertUser(user);
  return getPublicUser(user);
};

export const loginUser = async (emailInput: string, password: string) => {
  const email = emailInput.toLowerCase().trim();
  await ensureSeedUsers();
  const user = await getAuthRepository().findUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return null;
  }
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createSessionToken(user.id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30
  });
  return getPublicUser(user);
};

export const logoutUser = async () => {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
};

export const getCurrentUser = async () => {
  await ensureSeedUsers();
  const cookieStore = await cookies();
  const userId = readSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const user = userId ? await getAuthRepository().findUserById(userId) : undefined;
  return user ? getPublicUser(user) : null;
};

export const requireUser = async () => {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
};

export const requireAdmin = async () => {
  const user = await requireUser();
  if (user.role !== "admin") {
    throw new Error("Admin access required");
  }
  return user;
};
