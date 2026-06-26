import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { listAgentIds, loadAgent } from "./agent-loader.js";
import { PostgresDatabase } from "./postgres.js";
import { authenticateRequest, cookieValue, requireScope } from "./security/auth.js";
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
    if (url.pathname === "/login" && req.method === "GET") return html(res, renderLogin());
    if (url.pathname === "/login" && req.method === "POST") return login(req, res);
    if (url.pathname === "/logout" && req.method === "POST") return logout(req, res);

    const principal = await authenticateRequest(req, db);
    if (!principal) {
      if (acceptsHtml(req)) return redirect(res, "/login");
      return json(res, { error: "Unauthorized" }, 401);
    }

    if (url.pathname === "/" && req.method === "GET") return html(res, await renderDashboard(principal));
    if (url.pathname === "/agents" && req.method === "GET") return json(res, await listAgents());
    if (url.pathname === "/runs" && req.method === "GET") return json(res, await listRuns(principal));
    if (url.pathname === "/runs" && req.method === "POST") return createRun(req, res, principal);
    if (url.pathname.startsWith("/artifacts/") && req.method === "GET") return serveArtifact(url.pathname, res, principal);
    if (url.pathname.startsWith("/deployments/") && url.pathname.endsWith("/authorize") && req.method === "POST") {
      return authorizeDeployment(url.pathname, req, res, principal);
    }

    html(res, await renderDashboard(principal));
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
      artifactPath: run.versions?.at(-1)?.artifactPath,
      updatedAt: run.updatedAt,
    };
  }));
}

async function createRun(req: http.IncomingMessage, res: http.ServerResponse, principal: Principal) {
  if (!requireScope(principal, "runs:write")) return json(res, { error: "Missing scope runs:write" }, 403);
  const body = contentType(req).includes("application/x-www-form-urlencoded") ? await readForm(req) : await readJson(req);
  const agent = await loadAgent(path.join(root, "agents/commander"));
  const intent: BuildIntent = {
    id: crypto.randomUUID(),
    audience: parseEnum(body.audience, ["recruiter", "client", "reader", "collaborator", "general"], "general"),
    purpose: parseEnum(body.purpose, ["portfolio", "resume", "personal_brand", "project_showcase", "blog"], "portfolio"),
    goal: typeof body.goal === "string" ? body.goal : "Compile the personal wiki into a website.",
    constraints: parseConstraints(body.constraints),
    createdAt: new Date().toISOString(),
  };
  const result = await runSiteBuildWorkflow(agent, intent, { approvalMode: body.approvalMode === "manual" ? "manual" : "auto" });
  if (db) await db.upsertRun(result.run, principal);
  const response = {
    id: result.run.id,
    status: result.run.status,
    step: result.run.currentStep,
    runDir: result.runDir,
    artifactPath: result.run.versions.at(-1)?.artifactPath,
  };
  if (contentType(req).includes("application/x-www-form-urlencoded")) return redirect(res, "/");
  return json(res, response, 201);
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

async function readForm(req: http.IncomingMessage): Promise<Record<string, string | string[]>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  const params = new URLSearchParams(Buffer.concat(chunks).toString("utf8"));
  const form: Record<string, string | string[]> = {};
  for (const [key, value] of params) {
    const existing = form[key];
    if (Array.isArray(existing)) existing.push(value);
    else if (typeof existing === "string") form[key] = [existing, value];
    else form[key] = value;
  }
  return form;
}

function parseEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

function parseConstraints(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") return value.split(",").map((item) => item.trim()).filter(Boolean);
  return [];
}

async function login(req: http.IncomingMessage, res: http.ServerResponse) {
  if (!db) return html(res, renderLogin("Password login requires DATABASE_URL."), 500);
  const form = await readForm(req);
  const email = String(form.email ?? "");
  const password = String(form.password ?? "");
  const principal = await db.authenticatePassword(email, password);
  if (!principal) return html(res, renderLogin("邮箱或密码不正确。"), 401);
  const session = await db.createSession(principal);
  setCookie(res, "pwiki_session", session.token, session.expiresAt);
  return redirect(res, "/");
}

async function logout(req: http.IncomingMessage, res: http.ServerResponse) {
  const token = cookieValue(req, "pwiki_session");
  if (token && db) await db.revokeSession(token);
  clearCookie(res, "pwiki_session");
  return redirect(res, "/login");
}

function renderLogin(error?: string): string {
  return [
    "<!doctype html>",
    "<html><head><title>Sign in - Personal Wiki Harness</title>",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    `<style>${baseCss()}</style>`,
    "</head><body>",
    "<main class=\"login-shell\">",
    "<section class=\"card login-card\">",
    "<p class=\"eyebrow\">Personal Wiki Harness</p>",
    "<h1>登录你的个人 Wiki 构建台</h1>",
    "<p class=\"muted\">用邮箱和密码进入产品界面。API Key 仍然保留给自动化和工具调用。</p>",
    error ? `<p class=\"error\">${escapeHtml(error)}</p>` : "",
    "<form method=\"post\" action=\"/login\" class=\"stack\">",
    "<label>邮箱 <input name=\"email\" type=\"email\" autocomplete=\"email\" required /></label>",
    "<label>密码 <input name=\"password\" type=\"password\" autocomplete=\"current-password\" required /></label>",
    "<button type=\"submit\">登录</button>",
    "</form>",
    "</section>",
    "</main>",
    "</body></html>",
  ].join("");
}

async function renderDashboard(principal: Principal): Promise<string> {
  const runs = await listRuns(principal);
  const runRows = runs.length ? runs.map((run) => [
    "<tr>",
    `<td><code>${escapeHtml(run.id.slice(0, 8))}</code></td>`,
    `<td>${escapeHtml(run.status)}</td>`,
    `<td>${escapeHtml(run.step)}</td>`,
    `<td>${run.versions}</td>`,
    `<td>${run.artifactPath ? `<a href="/artifacts/${encodeURIComponent(run.id)}/index.html">打开网站</a>` : "暂无"}</td>`,
    `<td>${escapeHtml(new Date(run.updatedAt).toLocaleString("zh-CN"))}</td>`,
    "</tr>",
  ].join("")) : "<tr><td colspan=\"6\" class=\"muted\">还没有构建记录。</td></tr>";

  return [
    "<!doctype html>",
    "<html><head><title>Personal Wiki Harness</title>",
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\" />",
    `<style>${baseCss()}</style>`,
    "</head><body>",
    "<main class=\"app-shell\">",
    "<header class=\"topbar\">",
    "<div><p class=\"eyebrow\">Personal Wiki Harness</p><h1>个人 Wiki 网站构建台</h1></div>",
    `<form method="post" action="/logout"><button class="secondary" type="submit">退出</button></form>`,
    "</header>",
    "<section class=\"grid\">",
    "<article class=\"card\">",
    "<h2>新建一次构建</h2>",
    "<p class=\"muted\">Harness 会读取 workspace/wiki，形成内容模型，再生成一个可预览的网站版本。</p>",
    "<form method=\"post\" action=\"/runs\" class=\"stack\">",
    "<label>目标受众 <select name=\"audience\"><option value=\"recruiter\">招聘者</option><option value=\"client\">客户</option><option value=\"reader\">读者</option><option value=\"collaborator\">合作者</option><option value=\"general\">通用</option></select></label>",
    "<label>网站目的 <select name=\"purpose\"><option value=\"portfolio\">作品集</option><option value=\"resume\">简历</option><option value=\"personal_brand\">个人品牌</option><option value=\"project_showcase\">项目展示</option><option value=\"blog\">博客</option></select></label>",
    "<label>构建目标 <textarea name=\"goal\" rows=\"4\">把我的个人 Wiki 编译成一个清晰、美观、可继续迭代的个人网站。</textarea></label>",
    "<label>约束条件 <input name=\"constraints\" value=\"auth,docker,postgres\" /></label>",
    "<button type=\"submit\">开始构建</button>",
    "</form>",
    "</article>",
    "<article class=\"card profile-card\">",
    "<h2>当前用户</h2>",
    `<p><strong>${escapeHtml(principal.email)}</strong></p>`,
    `<p class=\"badge\">${escapeHtml(principal.role)}</p>`,
    "<p class=\"muted\">网页登录使用 cookie 会话；工具和自动化仍可使用 API Key。</p>",
    "</article>",
    "</section>",
    "<section class=\"card\">",
    "<h2>构建记录</h2>",
    "<div class=\"table-wrap\"><table><thead><tr><th>ID</th><th>状态</th><th>阶段</th><th>版本</th><th>产物</th><th>更新时间</th></tr></thead>",
    `<tbody>${runRows}</tbody></table></div>`,
    "</section>",
    "</main>",
    "</body></html>",
  ].join("");
}

function json(res: http.ServerResponse, data: unknown, status = 200) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(data, null, 2));
}

function html(res: http.ServerResponse, body: string, status = 200) {
  res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
}

function redirect(res: http.ServerResponse, location: string) {
  res.writeHead(303, { location });
  res.end();
}

function text(res: http.ServerResponse, body: string, status = 200) {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

function escapeHtml(input: string): string {
  return input.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;");
}

function contentType(req: http.IncomingMessage): string {
  const value = req.headers["content-type"];
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function acceptsHtml(req: http.IncomingMessage): boolean {
  const accept = req.headers.accept;
  const value = Array.isArray(accept) ? accept.join(",") : accept ?? "";
  return value.includes("text/html");
}

function setCookie(res: http.ServerResponse, name: string, value: string, expiresAt: Date) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader("set-cookie", `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Expires=${expiresAt.toUTCString()}${secure}`);
}

function clearCookie(res: http.ServerResponse, name: string) {
  res.setHeader("set-cookie", `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`);
}

function baseCss(): string {
  return `
    :root{color-scheme:light;--ink:#17211b;--muted:#65756b;--line:#d9e2d7;--paper:#fffdf7;--card:#fffffb;--accent:#3d6b45;--accent-2:#e6a23c;--danger:#a6423a}
    *{box-sizing:border-box} body{margin:0;min-height:100vh;font-family:Georgia,"Times New Roman",serif;color:var(--ink);background:radial-gradient(circle at 12% 8%,#f3d7a4 0,transparent 30%),linear-gradient(135deg,#f8f2df,#dfe9dd 52%,#cbd9cf);line-height:1.55}
    a{color:var(--accent);font-weight:700} h1,h2,p{margin-top:0} h1{font-size:clamp(2rem,5vw,4.3rem);line-height:.95;letter-spacing:-.05em} h2{font-size:1.35rem}
    button,input,select,textarea{font:inherit} input,select,textarea{width:100%;margin-top:6px;border:1px solid var(--line);border-radius:16px;padding:12px 14px;background:#fff;color:var(--ink)}
    button{border:0;border-radius:999px;padding:12px 18px;background:var(--accent);color:white;font-weight:700;cursor:pointer;box-shadow:0 10px 20px rgba(61,107,69,.18)} button.secondary{background:#fff;color:var(--accent);border:1px solid var(--line);box-shadow:none}
    table{width:100%;border-collapse:collapse;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:.92rem} th,td{text-align:left;border-bottom:1px solid var(--line);padding:12px 10px;vertical-align:top}
    .login-shell{min-height:100vh;display:grid;place-items:center;padding:28px}.app-shell{max-width:1180px;margin:0 auto;padding:38px 22px 72px}.topbar{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:26px}
    .grid{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(280px,.7fr);gap:18px;margin-bottom:18px}.card{background:rgba(255,255,251,.82);border:1px solid rgba(217,226,215,.9);border-radius:30px;padding:26px;box-shadow:0 22px 60px rgba(23,33,27,.08);backdrop-filter:blur(10px)}
    .login-card{max-width:520px}.stack{display:grid;gap:16px}.muted{color:var(--muted)}.eyebrow{text-transform:uppercase;letter-spacing:.16em;font:700 .76rem ui-sans-serif,system-ui,sans-serif;color:var(--accent)}
    .error{border:1px solid #efc1bb;background:#fff3f1;color:var(--danger);padding:12px 14px;border-radius:14px}.badge{display:inline-flex;border-radius:999px;background:#f0ead9;color:#795720;padding:7px 12px;font-weight:700}.table-wrap{overflow:auto}
    @media(max-width:760px){.topbar,.grid{display:block}.topbar form{margin:0 0 18px}.profile-card{margin-top:18px}.card{border-radius:22px;padding:20px} table{min-width:680px}}
  `;
}
