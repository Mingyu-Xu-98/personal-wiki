import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { SourceDocument, WikiEntity, WikiEvent, WikiLintIssue, WikiPage, WikiRelation, WikiSnapshot } from "./types.js";

const TECH_TERMS = [
  "TypeScript",
  "JavaScript",
  "React",
  "Next.js",
  "Node.js",
  "Python",
  "PostgreSQL",
  "SQLite",
  "Docker",
  "Vercel",
  "OpenTelemetry",
  "LangChain",
  "ECharts",
  "D3.js",
  "WebGL",
  "Tailwind",
  "Redis",
  "Rust",
  "Go",
];

export interface IngestResult {
  snapshot: WikiSnapshot;
  indexPath: string;
  logPath: string;
}

export async function ingestWorkspaceSources(workspaceRoot: string): Promise<IngestResult> {
  const rawRoot = path.join(workspaceRoot, "raw");
  const wikiRoot = path.join(workspaceRoot, "wiki");
  await fs.mkdir(rawRoot, { recursive: true });
  await fs.mkdir(path.join(wikiRoot, "entities"), { recursive: true });

  await seedRawIfEmpty(rawRoot);
  const sourceFiles = await listSourceFiles(rawRoot);
  const generatedAt = new Date().toISOString();
  const sources: SourceDocument[] = [];
  const entityMap = new Map<string, WikiEntity>();
  const pages: WikiPage[] = [];
  const relations: WikiRelation[] = [];
  const events: WikiEvent[] = [];

  for (const sourcePath of sourceFiles) {
    const content = await fs.readFile(sourcePath, "utf8");
    const source = sourceFromFile(rawRoot, sourcePath, content, generatedAt);
    sources.push(source);

    const extracted = extractEntities(content, source.id, generatedAt);
    for (const entity of extracted) {
      const key = `${entity.type}:${entity.name.toLowerCase()}`;
      const existing = entityMap.get(key);
      if (existing) {
        existing.sourceIds = [...new Set([...existing.sourceIds, ...entity.sourceIds])];
        existing.importance = Math.max(existing.importance, entity.importance) as 1 | 2 | 3;
        existing.updatedAt = generatedAt;
      } else {
        entityMap.set(key, entity);
      }
    }

    events.push({
      id: stableId(`event:${source.id}`),
      type: "ingest",
      title: `Ingested ${source.title}`,
      summary: `Processed ${path.relative(rawRoot, sourcePath)} into wiki memory.`,
      createdAt: generatedAt,
    });
  }

  const entities = [...entityMap.values()].sort(sortEntities);
  for (const entity of entities) {
    const entityPagePath = `entities/${slugify(entity.name)}.md`;
    pages.push({
      id: stableId(`page:${entity.id}`),
      path: entityPagePath,
      entityId: entity.id,
      title: entity.name,
      summary: `${entity.type} mentioned in ${entity.sourceIds.length} source(s).`,
      sourceIds: entity.sourceIds,
      updatedAt: generatedAt,
    });
    await fs.writeFile(path.join(wikiRoot, entityPagePath), renderEntityPage(entity));
  }

  for (const source of sources) {
    const related = entities.filter((entity) => entity.sourceIds.includes(source.id));
    for (let i = 0; i < related.length; i++) {
      for (let j = i + 1; j < related.length; j++) {
        relations.push({
          id: stableId(`rel:${source.id}:${related[i].id}:${related[j].id}`),
          fromEntityId: related[i].id,
          toEntityId: related[j].id,
          type: "mentions",
          evidenceSourceIds: [source.id],
        });
      }
    }
  }

  const lintIssues = lintWiki({ sources, entities, pages });
  const snapshot: WikiSnapshot = { generatedAt, sources, entities, pages, relations, events, lintIssues };
  const indexPath = path.join(wikiRoot, "index.md");
  const logPath = path.join(wikiRoot, "log.md");
  await fs.writeFile(indexPath, renderWikiIndex(snapshot));
  await fs.writeFile(logPath, renderWikiLog(events));
  await fs.writeFile(path.join(wikiRoot, "state.json"), `${JSON.stringify(snapshot, null, 2)}\n`);

  return { snapshot, indexPath, logPath };
}

export async function loadWikiSnapshot(workspaceRoot: string): Promise<WikiSnapshot> {
  const json = await fs.readFile(path.join(workspaceRoot, "wiki", "state.json"), "utf8");
  return JSON.parse(json) as WikiSnapshot;
}

function sourceFromFile(rawRoot: string, sourcePath: string, content: string, now: string): SourceDocument {
  const relative = path.relative(rawRoot, sourcePath);
  return {
    id: stableId(`source:${relative}`),
    path: relative,
    kind: sourcePath.endsWith(".md") ? "markdown" : "text",
    title: titleFromContent(content) ?? path.basename(sourcePath),
    immutableHash: createHash("sha256").update(content).digest("hex"),
    createdAt: now,
  };
}

function extractEntities(content: string, sourceId: string, now: string): WikiEntity[] {
  const entities: WikiEntity[] = [];
  const title = titleFromContent(content);
  if (title) {
    entities.push(entity("project", title, sourceId, 3, now));
  }

  for (const term of TECH_TERMS) {
    if (containsWord(content, term)) entities.push(entity("skill", term, sourceId, 2, now));
  }

  const orgMatches = content.matchAll(/\b(?:at|from|with|for)\s+([A-Z][A-Za-z0-9&.-]*(?:\s+[A-Z][A-Za-z0-9&.-]*){0,3})/g);
  for (const match of orgMatches) {
    const name = match[1].trim();
    if (name.length > 2 && !TECH_TERMS.includes(name)) entities.push(entity("company", name, sourceId, 1, now));
  }

  return dedupeEntities(entities);
}

function entity(type: WikiEntity["type"], name: string, sourceId: string, importance: 1 | 2 | 3, now: string): WikiEntity {
  return {
    id: stableId(`entity:${type}:${name.toLowerCase()}`),
    type,
    name,
    aliases: [],
    sourceIds: [sourceId],
    importance,
    updatedAt: now,
  };
}

function dedupeEntities(entities: WikiEntity[]): WikiEntity[] {
  const map = new Map<string, WikiEntity>();
  for (const entity of entities) {
    const key = `${entity.type}:${entity.name.toLowerCase()}`;
    const existing = map.get(key);
    if (existing) {
      existing.sourceIds = [...new Set([...existing.sourceIds, ...entity.sourceIds])];
      existing.importance = Math.max(existing.importance, entity.importance) as 1 | 2 | 3;
    } else {
      map.set(key, entity);
    }
  }
  return [...map.values()];
}

function lintWiki(input: Pick<WikiSnapshot, "sources" | "entities" | "pages">): WikiLintIssue[] {
  const issues: WikiLintIssue[] = [];
  if (input.sources.length === 0) {
    issues.push({
      id: stableId("lint:no-sources"),
      severity: "warning",
      type: "missing_source",
      message: "No raw sources were found.",
    });
  }
  for (const entity of input.entities) {
    if (entity.sourceIds.length === 0) {
      issues.push({
        id: stableId(`lint:missing-source:${entity.id}`),
        severity: "error",
        type: "missing_source",
        message: `Entity ${entity.name} has no source evidence.`,
        targetId: entity.id,
      });
    }
  }
  return issues;
}

async function listSourceFiles(rawRoot: string): Promise<string[]> {
  const entries = await fs.readdir(rawRoot, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && [".md", ".txt"].includes(path.extname(entry.name)))
    .map((entry) => path.join(rawRoot, entry.name))
    .sort();
}

async function seedRawIfEmpty(rawRoot: string): Promise<void> {
  const files = await listSourceFiles(rawRoot);
  if (files.length > 0) return;
  await fs.writeFile(path.join(rawRoot, "profile.md"), [
    "# Personal Wiki Harness",
    "",
    "A project about compiling a personal wiki into audience-specific websites with TypeScript, React, OpenTelemetry, Vercel, and durable agent workflows.",
    "",
    "Built for recruiters and collaborators who need to understand the relationship between knowledge, tools, versions, and site artifacts.",
  ].join("\n"));
}

function renderWikiIndex(snapshot: WikiSnapshot): string {
  const byType = groupBy(snapshot.entities, (entity) => entity.type);
  const lines = [
    "# Personal Wiki Index",
    "",
    `Generated: ${snapshot.generatedAt}`,
    `Sources: ${snapshot.sources.length}`,
    `Entities: ${snapshot.entities.length}`,
    "",
  ];

  for (const [type, entities] of [...byType.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push(`## ${type}`);
    lines.push("");
    for (const entity of entities.sort(sortEntities)) {
      lines.push(`- [${entity.name}](entities/${slugify(entity.name)}.md) - ${"★".repeat(entity.importance)} (${entity.sourceIds.length} source)`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

function renderWikiLog(events: WikiEvent[]): string {
  return `${events.map((event) => `## [${event.createdAt}] ${event.type} | ${event.title}\n\n${event.summary}\n`).join("\n")}\n`;
}

function renderEntityPage(entity: WikiEntity): string {
  return [
    "---",
    `id: ${entity.id}`,
    `type: ${entity.type}`,
    `importance: ${entity.importance}`,
    `sources: [${entity.sourceIds.join(", ")}]`,
    "---",
    "",
    `# ${entity.name}`,
    "",
    `${entity.name} is a ${entity.type} in the personal wiki.`,
    "",
    "## Sources",
    "",
    ...entity.sourceIds.map((sourceId) => `- ${sourceId}`),
    "",
  ].join("\n");
}

function titleFromContent(content: string): string | undefined {
  const heading = content.match(/^#\s+(.+)$/m)?.[1]?.trim();
  return heading && heading.length > 0 ? heading : undefined;
}

function containsWord(content: string, word: string): boolean {
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9])${escaped}([^A-Za-z0-9]|$)`, "i").test(content);
}

function stableId(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 16);
}

function slugify(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "entity";
}

function sortEntities(a: WikiEntity, b: WikiEntity): number {
  return b.importance - a.importance || a.type.localeCompare(b.type) || a.name.localeCompare(b.name);
}

function groupBy<T>(items: T[], keyFn: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const bucket = map.get(key) ?? [];
    bucket.push(item);
    map.set(key, bucket);
  }
  return map;
}
