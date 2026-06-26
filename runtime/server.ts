import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { listAgentIds, loadAgent } from "./agent-loader.js";
import { PostgresDatabase } from "./postgres.js";
import { authenticateRequest, requireScope } from "./security/auth.js";
import { evaluateDeploymentPolicy } from "./security/deployment-policy.js";
import { runSiteBuildWorkflow } from "./workflow-runner.js";
import type { BuildIntent, HarnessRun } from "../domain/index.js";
import type { Principal } from "./security/auth.js";

const port = Number(process.env.PORT ?? 4317);
const root = process.cwd();
const db = PostgresDatabase.fromEnv();
if (db && process.env.DB_AUTO_MIGRATE !== "false") await db.migrate();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname === "/health") return json(res, { ok: true, db: db ? "postgres" : "dev-file" });

    const principal = await authenticateRequest(req, db);
    if (!principal) return json(res, { error: "Unauthorized" }, 401);

    if (url.pathname === "/agents" && req.method === "GET") return json(res, await listAgents());
    if (url.pathname === "/runs" && req.method === "GET") return json(res, await listRuns(principal));
    if (url.pathname === "/runs" && req.method === "POST") return createRun(req, res, principal);
    if (url.pathname.startsWith("/artifacts/") && req.method === "GET") return serveArtifact(url.pathname, res, principal);
    if (url.pathname.startsWith("/deployments/") && url.pathname.endsWith("/authorize") && req.method === "POST") {
      return authorizeDeployment(url.pathname, req, res, principal);
    }

    html(res, renderHome(principal));
  } catch (err) {
    json(res, { error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

server.listen(port, () => {
  console.log(`Personal Wiki harness server listening on http://localhost:${port}`);
});

async function listAgents() {
  const agentsRoot = path.join(root, "agents");
  const ids = await listAgentIds(agentsRoot);
  return Promise.all(ids.map(async (id) => {
    const agent = await loadAgent(path.join(agentsRoot, id));
    return {
      id: agent.definition.id,
      model: agent.definition.model,
      tools: agent.localTools,
      issues: agent.validationIssues,
    };
  }));
}

async function listRuns(principal: Principal) {
  if (db) return db.listRuns(principal);

  const runsRoot = path.join(root, "workspace/runs");
  let entries;
  try {
    entries = await fs.readdir(runsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  return Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const run = JSON.parse(await fs.readFile(path.join(runsRoot, entry.name, "run.json"), "utf8")) as HarnessRun;
    return {
      id: run.id,
      status: run.status,
      step: run.currentStep,
      versions: run.versions?.length ?? 0,
      updatedAt: run.updatedAt,
    };
  }));
}

async function createRun(req: http.IncomingMessage, res: http.ServerResponse, principal: Principal) {
  if (!requireScope(principal, "runs:write")) return json(res, { error: "Missing scope runs:write" }, 403);
  const body = await readJson(req);
  const agent = await loadAgent(path.join(root, "agents/commander"));
  const intent: BuildIntent = {
    id: crypto.randomUUID(),
    audience: parseEnum(body.audience, ["recruiter", "client", "reader", "collaborator", "general"], "general"),
    purpose: parseEnum(body.purpose, ["portfolio", "resume", "personal_brand", "project_showcase", "blog"], "portfolio"),
    goal: typeof body.goal === "string" ? body.goal : "Compile the personal wiki into a website.",
    constraints: Array.isArray(body.constraints) ? body.constraints.filter((item): item is string => typeof item === "string") : [],
    createdAt: new Date().toISOString(),
  };
  const result = await runSiteBuildWorkflow(agent, intent, { approvalMode: body.approvalMode === "manual" ? "manual" : "auto" });
  if (db) await db.upsertRun(result.run, principal);
  return json(res, {
    id: result.run.id,
    status: result.run.status,
    step: result.run.currentStep,
    runDir: result.runDir,
    artifactPath: result.run.versions.at(-1)?.artifactPath,
  }, 201);
}

async function serveArtifact(pathname: string, res: http.ServerResponse, principal: Principal) {
  if (!requireScope(principal, "artifacts:read")) return json(res, { error: "Missing scope artifacts:read" }, 403);
  const [, , runId, file = "index.html"] = pathname.split("/");
  if (!runId || runId.includes("..") || file.includes("..")) return text(res, "Bad artifact path", 400);
  if (db && !await db.canAccessRun(runId, principal)) return json(res, { error: "Not found" }, 404);
  const filePath = path.join(root, "workspace/artifacts", runId, file);
  const body = await fs.readFile(filePath);
  res.writeHead(200, { "content-type": file.endsWith(".html") ? "text/html" : "text/plain" });
  res.end(body);
}

async function authorizeDeployment(pathname: string, req: http.IncomingMessage, res: http.ServerResponse, principal: Principal) {
  const [, , runId] = pathname.split("/");
  if (!runId) return json(res, { error: "Missing run id" }, 400);
  if (db && !await db.canAccessRun(runId, principal)) return json(res, { error: "Not found" }, 404);
  const body = await readJson(req);
  const environment = body.environment === "production" ? "production" : "preview";
  const run = JSON.parse(await fs.readFile(path.join(root, "workspace/runs", runId, "run.json"), "utf8")) as HarnessRun;
  const approvals = JSON.parse(await fs.readFile(path.join(root, "workspace/runs", runId, "approvals.json"), "utf8")) as Array<{ status: "pending" | "approved" | "rejected" }>;
  const decision = evaluateDeploymentPolicy({
    principal,
    run,
    environment,
    approvalStatuses: approvals.map((approval) => approval.status),
  });
  if (db) {
    await db.recordDeploymentAuthorization({
      runId,
      principal,
      environment,
      decision: decision.decision,
      reason: decision.reason,
    });
  }
  return json(res, decision, decision.decision === "deny" ? 403 : 200);
}

async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

function parseEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function renderHome(principal: Principal): string {
  return [
    "<!doctype html>",
    "<html><head><title>Personal Wiki Harness</title>",
    "<style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:820px;margin:64px auto;padding:0 24px;line-height:1.6}</style>",
    "</head><body>",
    "<h1>Personal Wiki Harness</h1>",
    `<p>Signed in as ${escapeHtml(principal.email)} (${escapeHtml(principal.role)}).</p>`,
    "<p>Runtime endpoints: <a href=\"/health\">health</a>, <a href=\"/agents\">agents</a>, <a href=\"/runs\">runs</a>.</p>",
    "</body></html>",
  ].join("");
}

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data, null, 2));
}

function html(res: http.ServerResponse, body: string) {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(body);
}

function text(res: http.ServerResponse, body: string, status = 200) {
  res.writeHead(status, { "content-type": "text/plain" });
  res.end(body);
}

function escapeHtml(input: string): string {
  return input.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
