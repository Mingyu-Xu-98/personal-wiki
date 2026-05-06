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

export type UserRole = "user" | "admin";

export type StudioUser = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  passwordHash: string;
  createdAt: string;
};

const SESSION_COOKIE = "pwh_session";
const SESSION_SECRET = process.env.PWH_SESSION_SECRET || "local-personal-wiki-harness-session-secret";

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

const users = new Map<string, StudioUser>();

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

const seedUser = (user: Omit<StudioUser, "id" | "createdAt" | "passwordHash"> & { password: string }) => {
  const now = new Date().toISOString();
  const id = createHash("sha256").update(user.email).digest("hex").slice(0, 16);
  users.set(id, {
    id,
    name: user.name,
    email: user.email,
    role: user.role,
    passwordHash: hashPassword(user.password, `seed-${user.email}`),
    createdAt: now
  });
};

if (users.size === 0) {
  seedUser({
    name: "Admin",
    email: "admin@personal.wiki",
    password: "admin123",
    role: "admin"
  });
  seedUser({
    name: "Mingyu",
    email: "mingyu@example.com",
    password: "demo123",
    role: "user"
  });
}

export const getPublicUser = (user: StudioUser) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  createdAt: user.createdAt
});

export const getAllUsers = () => Array.from(users.values()).map(getPublicUser);

export const registerUser = (input: {
  name: string;
  email: string;
  password: string;
}): ReturnType<typeof getPublicUser> => {
  const email = input.email.toLowerCase().trim();
  const existing = Array.from(users.values()).find((user) => user.email === email);
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
  users.set(user.id, user);
  return getPublicUser(user);
};

export const loginUser = async (emailInput: string, password: string) => {
  const email = emailInput.toLowerCase().trim();
  const user = Array.from(users.values()).find((entry) => entry.email === email);
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
  const cookieStore = await cookies();
  const userId = readSessionToken(cookieStore.get(SESSION_COOKIE)?.value);
  const user = userId ? users.get(userId) : undefined;
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
