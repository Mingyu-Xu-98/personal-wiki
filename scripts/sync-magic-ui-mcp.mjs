import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const outputPath = args.output || path.join(".pwh-studio", "design-assets", "magic-ui.json");
  const queries = args.query.length ? args.query : ["grid background", "blur fade", "vertical marquee", "hero", "marquee"];
  const limit = Number(args.limit || 12);

  if (args.fixture) {
    await writeAssetCache(outputPath, {
      provider: "magic-ui",
      serverName: "magicuidesign-mcp",
      syncedAt: new Date().toISOString(),
      mode: "fixture",
      sourceToolNames: [],
      assets: fixtureAssets()
    });
    console.log(JSON.stringify({ outputPath, assets: fixtureAssets().length, mode: "fixture" }, null, 2));
    return;
  }

  const command = args.command || "npx";
  const commandArgs = args.commandArgs.length ? args.commandArgs : ["-y", "@magicuidesign/mcp@latest"];
  const client = new McpStdioClient(command, commandArgs, {
    timeoutMs: Number(args.timeout || 45_000)
  });

  try {
    await client.start();
    await client.initialize();
    const tools = await client.listTools();
    const toolNames = tools.map((tool) => tool.name);
    const searchTool = findTool(tools, ["search", "registry"]) || findTool(tools, ["list", "registry"]);
    const listTool = findTool(tools, ["list", "registry"]);
    const getTool = findTool(tools, ["get", "registry"]) || findTool(tools, ["read", "registry"]);

    if (!searchTool && !listTool) {
      throw new Error(`Magic UI MCP did not expose a searchable registry tool. Tools: ${toolNames.join(", ")}`);
    }

    const registryItems = [];
    for (const query of queries) {
      const tool = searchTool || listTool;
      const result = await client.callTool(tool.name, buildToolArguments(tool, { query, limit }));
      registryItems.push(...extractRegistryItems(result));
    }

    const uniqueItems = uniqueByRegistryName(registryItems).slice(0, limit);
    const detailedItems = [];
    for (const item of uniqueItems) {
      if (!getTool) {
        detailedItems.push(item);
        continue;
      }
      try {
        const result = await client.callTool(getTool.name, buildToolArguments(getTool, item));
        const details = extractRegistryItems(result);
        detailedItems.push(details[0] ? { ...item, ...details[0] } : item);
      } catch {
        detailedItems.push(item);
      }
    }

    const assets = uniqueAssets(detailedItems.map(toMagicUiAsset).filter(Boolean));
    await writeAssetCache(outputPath, {
      provider: "magic-ui",
      serverName: "magicuidesign-mcp",
      syncedAt: new Date().toISOString(),
      mode: "mcp",
      sourceToolNames: toolNames,
      queries,
      assets
    });
    console.log(JSON.stringify({ outputPath, assets: assets.length, tools: toolNames }, null, 2));
  } finally {
    client.close();
  }
}

function parseArgs(rawArgs) {
  const parsed = {
    query: [],
    commandArgs: []
  };
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index];
    if (arg === "--fixture") parsed.fixture = true;
    else if (arg === "--output") parsed.output = rawArgs[++index];
    else if (arg === "--query") parsed.query.push(rawArgs[++index]);
    else if (arg === "--limit") parsed.limit = rawArgs[++index];
    else if (arg === "--timeout") parsed.timeout = rawArgs[++index];
    else if (arg === "--command") parsed.command = rawArgs[++index];
    else if (arg === "--") parsed.commandArgs = rawArgs.slice(index + 1);
  }
  return parsed;
}

class McpStdioClient {
  constructor(command, args, options) {
    this.command = command;
    this.args = args;
    this.timeoutMs = options.timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.buffer = "";
    this.stderr = "";
  }

  async start() {
    this.child = spawn(this.command, this.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env
    });
    this.child.stdout.on("data", (chunk) => this.onData(chunk));
    this.child.stderr.on("data", (chunk) => {
      this.stderr += chunk.toString("utf8");
      if (process.env.PWH_MCP_DEBUG === "1") process.stderr.write(chunk);
    });
    this.child.on("exit", (code, signal) => {
      const error = new Error(`MCP server exited with code ${code ?? "null"} signal ${signal ?? "null"}`);
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });
  }

  async initialize() {
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "personal-wiki-harness",
        version: "0.1.0"
      }
    });
    this.notify("notifications/initialized", {});
  }

  async listTools() {
    const result = await this.request("tools/list", {});
    return Array.isArray(result.tools) ? result.tools : [];
  }

  async callTool(name, args) {
    return this.request("tools/call", {
      name,
      arguments: args
    });
  }

  request(method, params) {
    const id = this.nextId++;
    const message = { jsonrpc: "2.0", id, method, params };
    const promise = new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        const stderrTail = this.stderr.trim().slice(-800);
        reject(
          new Error(
            `Timed out calling MCP method ${method}${stderrTail ? `\nMCP stderr:\n${stderrTail}` : ""}`
          )
        );
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
    this.write(message);
    return promise;
  }

  notify(method, params) {
    this.write({ jsonrpc: "2.0", method, params });
  }

  write(message) {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  onData(chunk) {
    this.buffer += chunk.toString("utf8");
    while (true) {
      const newlineIndex = this.buffer.indexOf("\n");
      if (newlineIndex === -1) return;
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line) continue;
      this.handleMessage(JSON.parse(line));
    }
  }

  handleMessage(message) {
    if (!Object.hasOwn(message, "id")) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(message.id);
    if (message.error) pending.reject(new Error(message.error.message || JSON.stringify(message.error)));
    else pending.resolve(message.result ?? {});
  }

  close() {
    this.child?.kill();
  }
}

function findTool(tools, requiredParts) {
  return tools.find((tool) => {
    const haystack = `${tool.name} ${tool.description || ""}`.toLowerCase();
    return requiredParts.every((part) => haystack.includes(part));
  });
}

function buildToolArguments(tool, input) {
  const properties = tool.inputSchema?.properties || {};
  const keys = Object.keys(properties);
  if (!keys.length) return {};
  const args = {};
  const name = registryName(input);
  for (const key of keys) {
    const lower = key.toLowerCase();
    if (lower.includes("query") || lower.includes("search")) args[key] = input.query || name || "";
    else if (lower.includes("limit") || lower.includes("count")) args[key] = input.limit || limit;
    else if (lower.includes("name")) args[key] = name;
    else if (lower === "id" || lower.includes("item")) args[key] = input.id || name;
    else if (lower.includes("slug")) args[key] = slugify(name);
  }
  return args;
}

function extractRegistryItems(result) {
  const values = [];
  for (const content of result.content || []) {
    if (content?.type === "text" && typeof content.text === "string") values.push(parseTextContent(content.text));
  }
  return values.flatMap(collectItems);
}

function parseTextContent(text) {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
    if (match) {
      try {
        return JSON.parse(match[1]);
      } catch {
        return { text: trimmed };
      }
    }
    return { text: trimmed };
  }
}

function collectItems(value) {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return [];
  for (const key of ["items", "registryItems", "results", "components", "data"]) {
    if (Array.isArray(value[key])) return value[key];
  }
  if (registryName(value)) return [value];
  return [];
}

function toMagicUiAsset(item) {
  if (!isRecord(item)) return null;
  const name = registryName(item);
  if (!name) return null;
  const text = JSON.stringify(item).toLowerCase();
  const role = inferRole(`${name} ${item.description || ""} ${item.text || ""} ${text}`);
  return {
    id: `magic-${slugify(name)}`,
    name: titleCase(String(item.title || item.name || name)),
    kind: "component",
    role,
    description: String(item.description || item.summary || item.text || `Magic UI component: ${name}`).slice(0, 480),
    capabilities: inferCapabilities(role, name),
    recommendedFor: recommendedForRole(role),
    avoidWhen: avoidWhenRole(role),
    constraints: constraintsForRole(role),
    examples: extractExamples(item),
    installHints: [`Synced from Magic UI MCP registry item "${name}". Use readDesignAsset before implementation.`],
    source: {
      kind: "mcp-registry",
      provider: "magic-ui",
      serverName: "magicuidesign-mcp",
      registryItemName: name
    }
  };
}

function registryName(item) {
  if (!isRecord(item)) return "";
  return String(item.name || item.title || item.id || item.slug || item.registryItemName || "").trim();
}

function inferRole(text) {
  const lower = text.toLowerCase();
  if (lower.includes("background") || lower.includes("grid") || lower.includes("beam")) return "background";
  if (lower.includes("blur") || lower.includes("fade") || lower.includes("marquee") || lower.includes("animation")) return "motion";
  if (lower.includes("hero")) return "hero";
  if (lower.includes("card")) return "card";
  if (lower.includes("nav") || lower.includes("menu")) return "navigation";
  if (lower.includes("button") || lower.includes("cta")) return "call-to-action";
  return "section";
}

function inferCapabilities(role, name) {
  const base = ["ui composition", "visual polish", `magic-ui:${name}`];
  if (role === "background") return [...base, "background texture", "page atmosphere"];
  if (role === "motion") return [...base, "decorative motion", "progressive reveal"];
  if (role === "hero") return [...base, "first viewport signal", "brand introduction"];
  if (role === "card") return [...base, "scannable content", "proof grouping"];
  return base;
}

function recommendedForRole(role) {
  if (role === "background") return ["technical landing page", "portfolio", "AI product page"];
  if (role === "motion") return ["hero reveal", "launch page", "section intro"];
  if (role === "hero") return ["personal homepage", "product landing page", "portfolio"];
  if (role === "card") return ["project list", "capability overview", "case studies"];
  return ["public website", "personal site", "content section"];
}

function avoidWhenRole(role) {
  if (role === "motion") return ["long reading page", "accessibility-sensitive dense content"];
  if (role === "background") return ["image-led page", "already visually dense page"];
  return ["unrelated site style", "content without enough evidence"];
}

function constraintsForRole(role) {
  const shared = ["Do not invent content", "Preserve selected wiki/source refs", "Keep mobile text readable"];
  if (role === "motion") return [...shared, "Respect reduced-motion preference", "Content must be readable without animation"];
  if (role === "background") return [...shared, "Keep contrast readable", "Use as a supporting surface"];
  return shared;
}

function extractExamples(item) {
  const examples = [];
  for (const key of ["example", "examples", "code", "content", "text"]) {
    const value = item[key];
    if (typeof value === "string" && value.trim()) examples.push(value.trim().slice(0, 1200));
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === "string" && entry.trim()) examples.push(entry.trim().slice(0, 1200));
      }
    }
  }
  return examples.slice(0, 3);
}

function uniqueByRegistryName(items) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const name = registryName(item).toLowerCase();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(item);
  }
  return result;
}

function uniqueAssets(assets) {
  const seen = new Set();
  const result = [];
  for (const asset of assets) {
    if (seen.has(asset.id)) continue;
    seen.add(asset.id);
    result.push(asset);
  }
  return result;
}

async function writeAssetCache(filePath, payload) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify({ schemaVersion: 1, ...payload }, null, 2)}\n`);
}

function fixtureAssets() {
  return [
    toMagicUiAsset({ name: "grid-background", description: "Grid background for technical landing pages." }),
    toMagicUiAsset({ name: "blur-fade", description: "Blur fade entrance animation." }),
    toMagicUiAsset({ name: "vertical-marquee", description: "Vertical marquee for repeated proof points." })
  ];
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";
}

function titleCase(value) {
  return String(value)
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

await main();
