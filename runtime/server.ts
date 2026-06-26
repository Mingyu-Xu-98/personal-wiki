import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { listAgentIds, loadAgent } from "./agent-loader.js";

const port = Number(process.env.PORT ?? 4317);
const root = process.cwd();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    if (url.pathname === "/health") return json(res, { ok: true });
    if (url.pathname === "/agents") return json(res, await listAgents());
    if (url.pathname === "/runs") return json(res, await listRuns());
    if (url.pathname.startsWith("/artifacts/")) return serveArtifact(url.pathname, res);
    html(res, renderHome());
  } catch (err) {
    res.writeHead(500, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }));
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

async function listRuns() {
  const runsRoot = path.join(root, "workspace/runs");
  let entries;
  try {
    entries = await fs.readdir(runsRoot, { withFileTypes: true });
  } catch {
    return [];
  }
  return Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const run = JSON.parse(await fs.readFile(path.join(runsRoot, entry.name, "run.json"), "utf8"));
    return {
      id: run.id,
      status: run.status,
      step: run.currentStep,
      versions: run.versions?.length ?? 0,
      updatedAt: run.updatedAt,
    };
  }));
}

async function serveArtifact(pathname: string, res: http.ServerResponse) {
  const [, , runId, file = "index.html"] = pathname.split("/");
  if (!runId || runId.includes("..") || file.includes("..")) {
    res.writeHead(400);
    res.end("Bad artifact path");
    return;
  }
  const filePath = path.join(root, "workspace/artifacts", runId, file);
  const body = await fs.readFile(filePath);
  res.writeHead(200, { "content-type": file.endsWith(".html") ? "text/html" : "text/plain" });
  res.end(body);
}

function renderHome(): string {
  return [
    "<!doctype html>",
    "<html><head><title>Personal Wiki Harness</title>",
    "<style>body{font-family:ui-sans-serif,system-ui,sans-serif;max-width:820px;margin:64px auto;padding:0 24px;line-height:1.6}</style>",
    "</head><body>",
    "<h1>Personal Wiki Harness</h1>",
    "<p>Runtime endpoints: <a href=\"/health\">health</a>, <a href=\"/agents\">agents</a>, <a href=\"/runs\">runs</a>.</p>",
    "</body></html>",
  ].join("");
}

function json(res: http.ServerResponse, data: unknown) {
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify(data, null, 2));
}

function html(res: http.ServerResponse, body: string) {
  res.writeHead(200, { "content-type": "text/html" });
  res.end(body);
}
