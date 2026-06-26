import type { IncomingMessage } from "node:http";
import type { PostgresDatabase } from "../postgres.js";

export interface Principal {
  userId: string;
  email: string;
  role: "admin" | "builder" | "viewer";
  scopes: string[];
}

export const DEV_PRINCIPAL: Principal = {
  userId: "dev-user",
  email: "dev@local",
  role: "admin",
  scopes: ["*"],
};

export async function authenticateRequest(req: IncomingMessage, db: PostgresDatabase | null): Promise<Principal | null> {
  const authMode = process.env.AUTH_MODE ?? (db ? "api-key" : "dev");
  if (authMode === "disabled") return DEV_PRINCIPAL;
  if (authMode === "dev" && !db) return DEV_PRINCIPAL;

  const token = bearerToken(req) ?? headerValue(req, "x-api-key");
  if (token && db) return db.verifyApiKey(token);
  const sessionToken = cookieValue(req, "pwiki_session");
  if (sessionToken && db) return db.verifySessionToken(sessionToken);
  return null;
}

export function requireScope(principal: Principal, scope: string): boolean {
  return principal.scopes.includes("*") || principal.scopes.includes(scope) || principal.role === "admin";
}

function bearerToken(req: IncomingMessage): string | null {
  const value = headerValue(req, "authorization");
  if (!value?.startsWith("Bearer ")) return null;
  return value.slice("Bearer ".length).trim() || null;
}

function headerValue(req: IncomingMessage, name: string): string | null {
  const value = req.headers[name];
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export function cookieValue(req: IncomingMessage, name: string): string | null {
  const cookie = headerValue(req, "cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rawValue.join("="));
  }
  return null;
}
