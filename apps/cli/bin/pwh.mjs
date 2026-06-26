#!/usr/bin/env node
import { createHash } from "node:crypto";
import { appendFile, copyFile, mkdir, open, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  applyWikiMutationPlan,
  auditWorkspaceState,
  createEmptyWorkspaceSnapshot,
  createSourceDocumentToolRegistry,
  createWorkspaceEvent,
  createWikiMutationPlanHandoff,
  createWikiMutationPlanFromSourceDocuments,
  createWikiMutationPlanWithOntologyCurator,
  PersonalWikiEngine,
  sourceDocumentFromManifestEntry,
  summarizeWikiMutationPlan,
  verifyWorkspaceState
} from "../../../packages/engine-core/src/index.ts";
import { createOpenAICompatibleSubAgentExecutor } from "../../../packages/agent-runtime/src/index.ts";
import { createLocalWorkspaceAdapter } from "../src/local-workspace.ts";

const SOURCE_EXTENSIONS = new Set([
  ".md",
  ".markdown",
  ".txt",
  ".html",
  ".htm",
  ".csv",
  ".json",
  ".yaml",
  ".yml",
  ".rtf",
  ".pdf",
  ".docx",
  ".pptx"
]);

const SKIPPED_DIRS = new Set([".git", ".pwh", "node_modules"]);

const now = () => new Date().toISOString();

const hash = (value) => createHash("sha1").update(value).digest("hex");

const isTruthy = (value) => value === "1" || value === "true" || value === "yes" || value === "on";

const createOptionalWikiCuratorExecutor = (options, sources) => {
  const enabled = Boolean(options.modelCurator) || isTruthy(String(process.env.PWH_WIKI_CURATOR_ENABLED ?? "").toLowerCase());
  if (!enabled) return undefined;

  const baseUrl = process.env.PWH_LLM_BASE_URL?.trim();
  const apiKey = process.env.PWH_LLM_API_KEY?.trim();
  const model = process.env.PWH_WIKI_CURATOR_MODEL?.trim() || process.env.PWH_CREATE_AGENT_MODEL?.trim() || "gpt-5.4";
  if (!baseUrl || !apiKey) {
    throw new Error("Model wiki curator requires PWH_LLM_BASE_URL and PWH_LLM_API_KEY.");
  }

  return createOpenAICompatibleSubAgentExecutor({
    baseUrl,
    apiKey,
    model,
    toolRegistry: createSourceDocumentToolRegistry(sources),
    maxToolRounds: 3
  });
};

const usage = () => `Personal Wiki Harness local CLI

Usage:
  pwh init [workspace-root]
  pwh link <file-or-directory...> [--workspace <workspace-root>]
  pwh ingest [file-or-directory...] [--plan-only] [--model-curator] [--workspace <workspace-root>]
  pwh review-plan <plan-id-or-json-path> [--json] [--workspace <workspace-root>]
  pwh handoff-plan <plan-id-or-json-path> [--json] [--workspace <workspace-root>]
  pwh apply-plan <plan-id-or-json-path> [--workspace <workspace-root>]
  pwh query <question-or-keywords> [--json] [--workspace <workspace-root>]
  pwh lint [--json] [--workspace <workspace-root>]
  pwh plans [--workspace <workspace-root>]
  pwh events [--workspace <workspace-root>]
  pwh verify [--json] [--workspace <workspace-root>]
  pwh audit [--json] [--workspace <workspace-root>]
  pwh build --title <site-title> --prompt <site-intent> [--audience <audience>] [--workspace <workspace-root>]
  pwh export [--output <directory>] [--workspace <workspace-root>]
  pwh status [--workspace <workspace-root>]

Local mode keeps raw files in place and stores only references, metadata, wiki files, logs, and build outputs in .pwh/.
Ingest can run as a reviewable two-stage flow: create a WikiMutationPlan with --plan-only, then apply it with apply-plan.
--model-curator enables a model-backed wiki curator for ontology candidates. It always writes a pending plan first.
`;

const parseArgs = (argv) => {
  const args = [...argv];
  const command = args.shift() ?? "help";
  let workspaceRoot = process.cwd();
  const positionals = [];
  const options = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--workspace") {
      const value = args[index + 1];
      if (!value) throw new Error("--workspace requires a path.");
      workspaceRoot = path.resolve(value);
      index += 1;
    } else if (arg === "--title" || arg === "--prompt" || arg === "--audience" || arg === "--output") {
      const value = args[index + 1];
      if (!value) throw new Error(`${arg} requires a value.`);
      options[arg.slice(2)] = value;
      index += 1;
    } else if (arg === "--plan-only") {
      options.planOnly = true;
    } else if (arg === "--model-curator") {
      options.modelCurator = true;
    } else if (arg === "--json") {
      options.json = true;
    } else if (arg.startsWith("--")) {
      throw new Error(`Unknown option: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  return { command, workspaceRoot, positionals, options };
};

const workspacePaths = (workspaceRoot) => {
  const root = path.resolve(workspaceRoot);
  const pwh = path.join(root, ".pwh");
  return {
    root,
    pwh,
    manifest: path.join(pwh, "workspace.json"),
    events: path.join(pwh, "events.jsonl"),
    wiki: path.join(pwh, "wiki"),
    index: path.join(pwh, "wiki", "index.wiki"),
    log: path.join(pwh, "wiki", "log.wiki"),
    snapshot: path.join(pwh, "wiki", "snapshot.json"),
    sourcePages: path.join(pwh, "wiki", "sources"),
    plans: path.join(pwh, "plans"),
    builds: path.join(pwh, "builds"),
    dist: path.join(pwh, "dist"),
    export: path.join(pwh, "export"),
    cache: path.join(pwh, "cache"),
    excerpts: path.join(pwh, "cache", "excerpts")
  };
};

const defaultManifest = (workspaceRoot) => {
  const createdAt = now();
  return {
    id: `local_${hash(workspaceRoot).slice(0, 12)}`,
    kind: "local",
    title: path.basename(workspaceRoot) || "Personal Wiki Workspace",
    rootUri: pathToFileURL(workspaceRoot).href,
    createdAt,
    updatedAt: createdAt,
    sourcePolicy: {
      mode: "reference-only",
      maxInlineBytes: 131072,
      includePatterns: ["**/*.md", "**/*.txt", "**/*.pdf", "**/*.docx", "**/*.html"],
      excludePatterns: ["**/.git/**", "**/node_modules/**", "**/.pwh/**"],
      textExtraction: "on-demand",
      hashLargeFiles: "metadata-only"
    },
    sources: []
  };
};

const appendWorkspaceEvent = async (workspaceRoot, manifest, input) => {
  const paths = workspacePaths(workspaceRoot);
  await mkdir(paths.pwh, { recursive: true });
  const event = createWorkspaceEvent({
    occurredAt: now(),
    actor: {
      type: "cli",
      id: "pwh",
      name: "Personal Wiki Harness CLI"
    },
    workspaceId: manifest.id,
    knowledgeBaseId: manifest.id,
    ...input
  });
  await appendFile(paths.events, `${JSON.stringify(event)}\n`, "utf8");
  return event;
};

const readWorkspaceEvents = async (workspaceRoot) => {
  const paths = workspacePaths(workspaceRoot);
  const raw = await readFile(paths.events, "utf8").catch(() => "");
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .sort((a, b) => String(a.occurredAt).localeCompare(String(b.occurredAt)));
};

const ensureWorkspace = async (workspaceRoot) => {
  const paths = workspacePaths(workspaceRoot);
  await mkdir(paths.wiki, { recursive: true });
  await mkdir(paths.sourcePages, { recursive: true });
  await mkdir(paths.plans, { recursive: true });
  await mkdir(paths.builds, { recursive: true });
  await mkdir(paths.dist, { recursive: true });
  await mkdir(paths.excerpts, { recursive: true });

  try {
    const raw = await readFile(paths.manifest, "utf8");
    return JSON.parse(raw);
  } catch {
    const manifest = defaultManifest(paths.root);
    await writeFile(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
    await writeFile(paths.index, renderIndex(manifest), "utf8");
    await writeFile(paths.log, `# log.wiki\n\n## [${manifest.createdAt}] init | Local workspace created\n`, "utf8");
    await writeFile(paths.snapshot, `${JSON.stringify(createEmptyWorkspaceSnapshot(), null, 2)}\n`, "utf8");
    await appendWorkspaceEvent(paths.root, manifest, {
      kind: "workspace.created",
      occurredAt: manifest.createdAt,
      summary: `Created local workspace ${manifest.title}.`,
      payload: {
        rootUri: manifest.rootUri,
        sourcePolicy: manifest.sourcePolicy
      }
    });
    return manifest;
  }
};

const saveWorkspace = async (workspaceRoot, manifest, logLine) => {
  const paths = workspacePaths(workspaceRoot);
  manifest.updatedAt = now();
  await writeFile(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(paths.index, renderIndex(manifest), "utf8");
  if (logLine) {
    const currentLog = await readFile(paths.log, "utf8").catch(() => "# log.wiki\n\n");
    await writeFile(paths.log, `${currentLog.trimEnd()}\n\n${logLine}\n`, "utf8");
  }
};

const renderIndex = (manifest) => {
  const sources = manifest.sources
    .map((source) => {
      const size = typeof source.sizeBytes === "number" ? `${source.sizeBytes} bytes` : "unknown size";
      return `- file://${source.id} · ${source.title} · ${source.status} · ${size}`;
    })
    .join("\n");

  return [
    `# ${manifest.title}`,
    "",
    "> Local personal wiki workspace. Raw files are referenced in place; generated wiki pages are maintained here.",
    "",
    `Updated: ${manifest.updatedAt}`,
    `Source policy: ${manifest.sourcePolicy.mode}`,
    "",
    "## Sources",
    sources || "- No sources linked yet.",
    "",
    "## Wiki Pages",
    "- [[log.wiki]] · chronological workspace log"
  ].join("\n");
};

const readSnapshot = async (workspaceRoot) => {
  const paths = workspacePaths(workspaceRoot);
  try {
    const raw = await readFile(paths.snapshot, "utf8");
    return JSON.parse(raw);
  } catch {
    return createEmptyWorkspaceSnapshot();
  }
};

const discoverFiles = async (inputPath) => {
  const absolute = path.resolve(inputPath);
  const stats = await stat(absolute);
  if (stats.isFile()) {
    return SOURCE_EXTENSIONS.has(path.extname(absolute).toLowerCase()) ? [absolute] : [];
  }
  if (!stats.isDirectory()) return [];

  const files = [];
  const visit = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && SKIPPED_DIRS.has(entry.name)) continue;
      const absoluteEntryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await visit(absoluteEntryPath);
      } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        files.push(absoluteEntryPath);
      }
    }
  };
  await visit(absolute);
  return files;
};

const mediaTypeForPath = (filePath) => {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".md" || ext === ".markdown") return "text/markdown";
  if (ext === ".txt") return "text/plain";
  if (ext === ".html" || ext === ".htm") return "text/html";
  if (ext === ".csv") return "text/csv";
  if (ext === ".json") return "application/json";
  if (ext === ".yaml" || ext === ".yml") return "application/yaml";
  if (ext === ".rtf") return "application/rtf";
  if (ext === ".pdf") return "application/pdf";
  if (ext === ".docx") return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (ext === ".pptx") return "application/vnd.openxmlformats-officedocument.presentationml.presentation";
  return "application/octet-stream";
};

const createSourceEntry = async (filePath) => {
  const absolute = path.resolve(filePath);
  const stats = await stat(absolute);
  const fingerprint = hash(`${absolute}:${stats.size}:${stats.mtimeMs}`);
  return {
    id: `src_${hash(absolute).slice(0, 16)}`,
    title: path.basename(absolute),
    uri: pathToFileURL(absolute).href,
    mediaType: mediaTypeForPath(absolute),
    storageMode: "reference-only",
    status: "pending",
    indexedAt: now(),
    originalUri: pathToFileURL(absolute).href,
    sizeBytes: stats.size,
    modifiedAt: stats.mtime.toISOString(),
    fingerprint,
    metadata: {
      absolutePath: absolute
    }
  };
};

const linkSources = async (workspaceRoot, inputs) => {
  const manifest = await ensureWorkspace(workspaceRoot);
  const discovered = [];
  for (const input of inputs) {
    discovered.push(...(await discoverFiles(input)));
  }

  const entries = await Promise.all(discovered.map(createSourceEntry));
  const byId = new Map(manifest.sources.map((source) => [source.id, source]));
  for (const entry of entries) byId.set(entry.id, entry);
  manifest.sources = [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
  await saveWorkspace(
    workspaceRoot,
    manifest,
    `## [${now()}] ingest | Linked ${entries.length} local source reference${entries.length === 1 ? "" : "s"}`
  );
  await appendWorkspaceEvent(workspaceRoot, manifest, {
    kind: "source.linked",
    summary: `Linked ${entries.length} local source reference${entries.length === 1 ? "" : "s"}.`,
    sourceIds: entries.map((entry) => entry.id),
    payload: {
      inputCount: inputs.length,
      linkedTitles: entries.map((entry) => entry.title)
    }
  });
  return { manifest, count: entries.length };
};

const isTextLike = (entry) =>
  entry.mediaType === "text/markdown" ||
  entry.mediaType === "text/plain" ||
  entry.mediaType === "text/html" ||
  entry.mediaType === "text/csv" ||
  entry.mediaType === "application/json" ||
  entry.mediaType === "application/yaml" ||
  entry.mediaType === "application/rtf";

const sourcePathFromEntry = (entry) => {
  const uri = entry.originalUri ?? entry.uri;
  if (uri.startsWith("file://")) return fileURLToPath(uri);
  if (typeof entry.metadata?.absolutePath === "string") return entry.metadata.absolutePath;
  return uri;
};

const readTextExcerpt = async (filePath, maxBytes) => {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(maxBytes);
    const result = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, result.bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
};

const oneLine = (value, max = 160) => {
  const compact = value.replace(/\s+/g, " ").trim();
  return compact.length > max ? `${compact.slice(0, max - 1)}…` : compact;
};

const slugify = (value) =>
  value
    .toLowerCase()
    .trim()
    .replace(/\.[^.]+$/, "")
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
    .replace(/^-+|-+$/g, "") || "source";

const extractSourceDocument = async (workspaceRoot, entry, policy) => {
  const paths = workspacePaths(workspaceRoot);
  const filePath = sourcePathFromEntry(entry);
  const maxInlineBytes = policy.maxInlineBytes ?? 131072;
  const textLike = isTextLike(entry);
  const sizeBytes = entry.sizeBytes ?? (await stat(filePath).then((item) => item.size).catch(() => 0));
  let content = "";
  let contentMode = "metadata-only";
  let cacheUri;

  if (textLike && sizeBytes <= maxInlineBytes) {
    content = await readFile(filePath, "utf8");
    contentMode = "inline";
  } else if (textLike) {
    content = await readTextExcerpt(filePath, Math.min(maxInlineBytes, 32768));
    contentMode = "excerpt";
    const excerptPath = path.join(paths.excerpts, `${entry.id}.txt`);
    await mkdir(paths.excerpts, { recursive: true });
    await writeFile(excerptPath, content, "utf8");
    cacheUri = pathToFileURL(excerptPath).href;
  }

  const nextEntry = {
    ...entry,
    status: "indexed",
    indexedAt: now(),
    sourceDocumentId: entry.sourceDocumentId ?? entry.id,
    contentHash: content ? hash(content) : entry.fingerprint,
    summary: content
      ? oneLine(content, 180)
      : `Referenced ${entry.mediaType} source. Text extraction is pending or unavailable.`,
    metadata: {
      ...(entry.metadata ?? {}),
      contentMode,
      cacheUri
    }
  };

  const document = {
    ...sourceDocumentFromManifestEntry(nextEntry, content),
    contentMode,
    uri: entry.originalUri ?? entry.uri,
    byteSize: sizeBytes,
    extractedAt: nextEntry.indexedAt
  };

  return { entry: nextEntry, document };
};

const writeIngestResult = async (workspaceRoot, manifest, result) => {
  const paths = workspacePaths(workspaceRoot);
  await mkdir(paths.sourcePages, { recursive: true });
  await writeFile(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(paths.snapshot, `${JSON.stringify(result.snapshot, null, 2)}\n`, "utf8");
  await writeFile(path.join(paths.plans, `${result.mutationPlan.id}.json`), `${JSON.stringify(result.mutationPlan, null, 2)}\n`, "utf8");
  await writeFile(paths.index, result.indexPage.body, "utf8");
  await writeFile(paths.log, result.logPage.body, "utf8");
  for (const page of result.sourcePages) {
    await writeFile(path.join(paths.sourcePages, `${slugify(page.title)}.wiki`), page.body, "utf8");
  }
};

const writeMutationPlanOnly = async (workspaceRoot, manifest, mutationPlan) => {
  const paths = workspacePaths(workspaceRoot);
  await mkdir(paths.plans, { recursive: true });
  await writeFile(paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await writeFile(path.join(paths.plans, `${mutationPlan.id}.json`), `${JSON.stringify(mutationPlan, null, 2)}\n`, "utf8");
};

const readMutationPlan = async (workspaceRoot, planRef) => {
  if (!planRef) throw new Error("A mutation plan id or JSON path is required.");
  const paths = workspacePaths(workspaceRoot);
  const jsonRef = planRef.endsWith(".json") ? planRef : `${planRef}.json`;
  const candidates = path.isAbsolute(planRef)
    ? [planRef, jsonRef]
    : [
        path.resolve(planRef),
        path.resolve(jsonRef),
        path.join(paths.plans, planRef),
        path.join(paths.plans, jsonRef)
      ];

  for (const candidate of candidates) {
    try {
      return JSON.parse(await readFile(candidate, "utf8"));
    } catch {
      // Try the next candidate path.
    }
  }

  throw new Error(`Mutation plan not found: ${planRef}`);
};

const readMutationPlans = async (workspaceRoot) => {
  const paths = workspacePaths(workspaceRoot);
  const files = await readdir(paths.plans).catch(() => []);
  const plans = [];
  for (const file of files.filter((item) => item.endsWith(".json")).sort()) {
    try {
      plans.push(JSON.parse(await readFile(path.join(paths.plans, file), "utf8")));
    } catch {
      // Ignore malformed files so one broken plan does not hide the rest.
    }
  }
  return plans.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
};

const countOntologyItemsInPlan = (mutationPlan) =>
  mutationPlan.operations.reduce((sum, operation) => sum + (operation.ontologyExtraction?.items.length ?? 0), 0);

const countSourceModesInPlan = (mutationPlan) => {
  const counts = {
    inline: 0,
    excerpt: 0,
    metadataOnly: 0
  };
  for (const operation of mutationPlan.operations) {
    if (operation.kind !== "upsert-source" || !operation.source) continue;
    if (operation.source.contentMode === "inline") counts.inline += 1;
    else if (operation.source.contentMode === "excerpt") counts.excerpt += 1;
    else counts.metadataOnly += 1;
  }
  return counts;
};

const recordMutationPlanReviewAndHandoff = async (workspaceRoot, manifest, mutationPlan, options = {}) => {
  const existingEvents = options.skipExisting ? await readWorkspaceEvents(workspaceRoot) : [];
  const hasReview = existingEvents.some(
    (event) => event.kind === "mutation-plan.reviewed" && event.mutationPlanId === mutationPlan.id
  );
  const hasHandoff = existingEvents.some(
    (event) => event.kind === "mutation-plan.handoff-created" && event.mutationPlanId === mutationPlan.id
  );
  const review = summarizeWikiMutationPlan(mutationPlan);
  if (review.decision === "blocked") {
    throw new Error(`Mutation plan ${mutationPlan.id} is blocked and cannot be applied.`);
  }
  if (!hasReview) {
    await appendWorkspaceEvent(workspaceRoot, manifest, {
      kind: "mutation-plan.reviewed",
      summary: `Reviewed mutation plan ${mutationPlan.id}: ${review.decision}.`,
      mutationPlanId: mutationPlan.id,
      sourceIds: mutationPlan.sourceIds,
      artifactRefs: [`mutation-plan:${mutationPlan.id}`],
      payload: {
        decision: review.decision,
        reviewReasons: review.reviewReasons,
        blockedReasons: review.blockedReasons,
        ontologyCandidateCount: review.ontologyCandidateCount,
        automated: Boolean(options.automated)
      }
    });
  }

  const handoff = createWikiMutationPlanHandoff(mutationPlan);
  if (!hasHandoff) {
    await appendWorkspaceEvent(workspaceRoot, manifest, {
      kind: "mutation-plan.handoff-created",
      summary: `Created handoff ${handoff.id} for mutation plan ${mutationPlan.id}.`,
      mutationPlanId: mutationPlan.id,
      sourceIds: mutationPlan.sourceIds,
      artifactRefs: handoff.artifactRefs,
      payload: {
        decision: handoff.decision,
        batchCount: handoff.batches.length,
        evidenceRefs: handoff.evidenceRefs,
        mustCarryForwardRefs: handoff.mustCarryForwardRefs,
        automated: Boolean(options.automated)
      }
    });
  }
  return { review, handoff };
};

const formatCounts = (counts) => {
  const entries = Object.entries(counts).filter(([, count]) => count > 0);
  return entries.length ? entries.map(([key, count]) => `${key}: ${count}`).join(", ") : "none";
};

const renderPlanReview = (review) => {
  const candidateLines = review.ontologyCandidates
    .slice()
    .sort((a, b) => a.confidence - b.confidence)
    .slice(0, 12)
    .map(
      (candidate) =>
        `- ${candidate.kind} · ${candidate.label} · confidence ${candidate.confidence.toFixed(2)} · sources ${candidate.evidenceSourceIds.join(", ")}`
    );

  return [
    `${review.title} (${review.id})`,
    `Decision: ${review.decision}`,
    `Created: ${review.createdAt}`,
    `Human review state: ${review.humanReviewState}`,
    "",
    "Planned writes",
    `- sources: ${review.plannedSources.length}`,
    `- pages: ${review.plannedPages.length}`,
    `- entities: ${review.plannedEntities.length}`,
    `- operations: ${formatCounts(review.operationCounts)}`,
    `- source content modes: ${formatCounts(review.sourceContentModes)}`,
    "",
    "Ontology candidates",
    `- total: ${review.ontologyCandidateCount}`,
    `- by kind: ${formatCounts(review.ontologyCandidateCounts)}`,
    ...(candidateLines.length ? ["- lowest-confidence candidates:", ...candidateLines] : []),
    "",
    "Review notes",
    ...(review.blockedReasons.length ? review.blockedReasons.map((reason) => `- BLOCKED: ${reason}`) : []),
    ...(review.reviewReasons.length ? review.reviewReasons.map((reason) => `- ${reason}`) : ["- No review issues detected."]),
    ...(review.openQuestions.length ? ["", "Open questions", ...review.openQuestions.map((question) => `- ${question}`)] : []),
    "",
    `Next: ${review.recommendedNextAction}`
  ].join("\n");
};

const renderPlanHandoff = (handoff) => {
  const batchLines = handoff.batches.flatMap((batch) => [
    `- ${batch.title} · ${batch.kind} · priority ${batch.priority}`,
    `  operations: ${batch.operationIds.length} · sources: ${batch.sourceIds.length} · targets: ${batch.targetIds.length}`,
    `  review: ${batch.requiresHumanReview ? "required" : "not required"}`,
    ...batch.reasons.map((reason) => `  reason: ${reason}`)
  ]);

  return [
    `Plan handoff ${handoff.id}`,
    `Plan: ${handoff.planId}`,
    `Decision: ${handoff.decision}`,
    `Created: ${handoff.createdAt}`,
    "",
    handoff.summary,
    "",
    "Review batches",
    ...(batchLines.length ? batchLines : ["- No batches."]),
    "",
    "Must carry forward",
    ...formatRefs(handoff.mustCarryForwardRefs),
    "",
    "Evidence refs",
    ...formatRefs(handoff.evidenceRefs),
    "",
    "Artifact refs",
    ...formatRefs(handoff.artifactRefs),
    "",
    "Discardable context",
    ...handoff.discardableContext.map((item) => `- ${item}`),
    "",
    `Next: ${handoff.recommendedNextAction}`
  ].join("\n");
};

const formatRefs = (refs, limit = 16) => {
  const lines = refs.slice(0, limit).map((ref) => `- ${ref}`);
  if (refs.length > limit) lines.push(`- ... ${refs.length - limit} more`);
  return lines.length ? lines : ["- none"];
};

const renderVerificationReport = (report) => [
  `${report.kind === "audit" ? "Audit" : "Verification"} ${report.id}`,
  `Status: ${report.status}`,
  `Created: ${report.createdAt}`,
  report.summary,
  "",
  "Checks",
  ...report.checks.map((item) => {
    const refs = item.refs.length ? ` refs=${item.refs.join(",")}` : "";
    return `- ${item.status.toUpperCase()} ${item.id}: ${item.message}${refs}`;
  })
].join("\n");

const assertNoHardFailures = (report, stage) => {
  if (report.status === "fail") {
    const failures = report.checks
      .filter((item) => item.status === "fail")
      .map((item) => `${item.id}: ${item.message}`)
      .join("; ");
    throw new Error(`${stage} blocked by verification failure: ${failures}`);
  }
};

const escapeHtml = (value) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const renderStaticSite = (manifest, snapshot, run) => {
  const title = run.buildVersion?.contentModel?.title ?? run.intent.title;
  const thesis = run.buildVersion?.contentModel?.thesis ?? run.intent.prompt;
  const pages = snapshot.pages.filter((page) => page.kind === "source-summary");
  const pageItems = pages
    .map(
      (page) => `<article>
        <h2>${escapeHtml(page.title)}</h2>
        <p>${escapeHtml(oneLine(page.body, 260))}</p>
      </article>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #171717; background: #f7f3ec; }
    main { width: min(920px, calc(100% - 32px)); margin: 0 auto; padding: 56px 0; }
    header { border-bottom: 1px solid #d8d0c4; padding-bottom: 28px; margin-bottom: 28px; }
    h1 { font-size: clamp(34px, 7vw, 72px); line-height: 0.95; margin: 0 0 18px; letter-spacing: 0; }
    .lede { font-size: 18px; line-height: 1.7; max-width: 720px; }
    .meta { color: #6b6258; font-size: 14px; margin-top: 16px; }
    article { border-top: 1px solid #d8d0c4; padding: 22px 0; }
    h2 { font-size: 22px; margin: 0 0 10px; }
    p { line-height: 1.75; }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(title)}</h1>
      <p class="lede">${escapeHtml(thesis)}</p>
      <p class="meta">Compiled from ${snapshot.sources.length} sources in ${escapeHtml(manifest.title)}.</p>
    </header>
    <section>
      ${pageItems || "<p>No wiki pages have been generated yet.</p>"}
    </section>
  </main>
</body>
</html>`;
};

const build = async (workspaceRoot, options) => {
  const manifest = await ensureWorkspace(workspaceRoot);
  const snapshot = await readSnapshot(workspaceRoot);
  if (snapshot.sources.length === 0 || snapshot.pages.length === 0) {
    throw new Error("No wiki snapshot found. Run pwh ingest before pwh build.");
  }

  const preBuildReport = verifyWorkspaceState({
    manifest,
    snapshot,
    events: await readWorkspaceEvents(workspaceRoot),
    createdAt: now()
  });
  await appendWorkspaceEvent(workspaceRoot, manifest, {
    kind: "verification.completed",
    summary: `Pre-build verification ${preBuildReport.status}.`,
    artifactRefs: [`verification:${preBuildReport.id}`],
    payload: {
      stage: "pre-build",
      report: preBuildReport
    }
  });
  assertNoHardFailures(preBuildReport, "Build");

  await appendWorkspaceEvent(workspaceRoot, manifest, {
    kind: "site.build-started",
    summary: `Started site build for ${options.title ?? manifest.title}.`,
    sourceIds: snapshot.sources.map((source) => source.id),
    pageIds: snapshot.pages.map((page) => page.id),
    payload: {
      title: options.title ?? manifest.title,
      prompt: options.prompt,
      audience: options.audience
    }
  });

  const adapter = createLocalWorkspaceAdapter(workspaceRoot);
  const engine = new PersonalWikiEngine({ adapter });
  const prompt = options.prompt ?? `Create a personal website from the ${manifest.title} wiki.`;
  const plannedToolCalls = [
    {
      id: "tool_manifest",
      toolName: "readManifest",
      input: {}
    },
    {
      id: "tool_wiki_index",
      toolName: "readWikiIndex",
      input: {
        knowledgeBaseId: manifest.id
      }
    },
    {
      id: "tool_search_intent",
      toolName: "searchWiki",
      input: {
        knowledgeBaseId: manifest.id,
        query: prompt,
        limit: 5
      }
    }
  ];
  const firstSource = snapshot.sources[0];
  if (firstSource) {
    plannedToolCalls.push({
      id: "tool_read_first_source",
      toolName: "readSource",
      input: {
        knowledgeBaseId: manifest.id,
        sourceId: firstSource.id,
        maxBytes: 4096
      }
    });
  }

  const run = await engine.createBuildRun({
    title: options.title ?? manifest.title,
    prompt,
    audience: options.audience ?? "public visitors",
    desiredArtifact: "site",
    knowledgeBaseId: manifest.id,
    knowledgeBaseName: manifest.title,
    constraints: [
      "Use the local wiki snapshot as the source of meaning.",
      "Do not modify raw source files.",
      "Treat the generated site as a compiled artifact."
    ]
  }, {
    toolCalls: plannedToolCalls,
    persistBuildVersion: false
  });

  if (!run.buildVersion) throw new Error(run.error ?? "Build did not produce a version.");
  const paths = workspacePaths(workspaceRoot);
  await mkdir(paths.dist, { recursive: true });
  const html = renderStaticSite(manifest, snapshot, run);
  const htmlPath = path.join(paths.dist, "index.html");
  await writeFile(htmlPath, html, "utf8");
  await adapter.writeSiteArtifact?.(manifest.id, {
    versionId: run.buildVersion.id,
    createdAt: run.buildVersion.createdAt,
    format: "static-html",
    files: [
      {
        path: "index.html",
        mediaType: "text/html",
        content: html
      }
    ]
  });

  const buildCompletedEvent = createWorkspaceEvent({
    kind: "site.build-completed",
    occurredAt: now(),
    actor: {
      type: "cli",
      id: "pwh",
      name: "Personal Wiki Harness CLI"
    },
    workspaceId: manifest.id,
    knowledgeBaseId: manifest.id,
    summary: `Built site artifact ${run.buildVersion.id}.`,
    runId: run.id,
    versionId: run.buildVersion.id,
    sourceIds: snapshot.sources.map((source) => source.id),
    pageIds: snapshot.pages.map((page) => page.id),
    artifactRefs: [`site-artifact:${run.buildVersion.id}`, "dist:index.html"],
    payload: {
      toolCallCount: run.toolCalls.length,
      htmlPath
    }
  });
  const versionCreatedEvent = createWorkspaceEvent({
    kind: "version.created",
    occurredAt: now(),
    actor: {
      type: "cli",
      id: "pwh",
      name: "Personal Wiki Harness CLI"
    },
    workspaceId: manifest.id,
    knowledgeBaseId: manifest.id,
    summary: `Recorded build version ${run.buildVersion.id}.`,
    runId: run.id,
    versionId: run.buildVersion.id,
    artifactRefs: [`build-version:${run.buildVersion.id}`]
  });
  const preVersionReport = verifyWorkspaceState({
    manifest,
    snapshot,
    events: [...(await readWorkspaceEvents(workspaceRoot)), buildCompletedEvent, versionCreatedEvent],
    createdAt: now()
  });
  await appendWorkspaceEvent(workspaceRoot, manifest, {
    kind: "verification.completed",
    summary: `Pre-version verification ${preVersionReport.status}.`,
    artifactRefs: [`verification:${preVersionReport.id}`],
    payload: {
      stage: "pre-version",
      candidateEventIds: [buildCompletedEvent.id, versionCreatedEvent.id],
      report: preVersionReport
    }
  });
  assertNoHardFailures(preVersionReport, "Versioning");

  await adapter.writeBuildVersion?.(manifest.id, run.buildVersion);
  await appendWorkspaceEvent(workspaceRoot, manifest, {
    ...buildCompletedEvent,
    kind: "site.build-completed",
    summary: buildCompletedEvent.summary
  });
  await appendWorkspaceEvent(workspaceRoot, manifest, {
    ...versionCreatedEvent,
    kind: "version.created",
    summary: versionCreatedEvent.summary
  });

  console.log(`Built version ${run.buildVersion.id}.`);
  console.log(`Tool calls: ${run.toolCalls.length}`);
  console.log(`Static site: ${htmlPath}`);
};

const init = async (workspaceRoot) => {
  const manifest = await ensureWorkspace(workspaceRoot);
  console.log(`Initialized local workspace: ${workspacePaths(workspaceRoot).pwh}`);
  console.log(`Source policy: ${manifest.sourcePolicy.mode}`);
};

const link = async (workspaceRoot, inputs) => {
  if (inputs.length === 0) throw new Error("link requires at least one file or directory.");
  const { count } = await linkSources(workspaceRoot, inputs);
  console.log(`Linked ${count} source reference${count === 1 ? "" : "s"}.`);
  console.log("Raw files were not copied into .pwh.");
};

const ingest = async (workspaceRoot, inputs, options = {}) => {
  let manifest = await ensureWorkspace(workspaceRoot);
  if (inputs.length > 0) {
    const linked = await linkSources(workspaceRoot, inputs);
    manifest = linked.manifest;
  }
  if (manifest.sources.length === 0) throw new Error("No source references found. Run pwh link first or pass files to pwh ingest.");

  const extracted = [];
  for (const source of manifest.sources) {
    extracted.push(await extractSourceDocument(workspaceRoot, source, manifest.sourcePolicy));
  }

  manifest.sources = extracted.map((item) => item.entry).sort((a, b) => a.title.localeCompare(b.title));
  manifest.updatedAt = now();
  await appendWorkspaceEvent(workspaceRoot, manifest, {
    kind: "source.extracted",
    summary: `Extracted ${extracted.length} source document${extracted.length === 1 ? "" : "s"} for wiki ingest.`,
    sourceIds: extracted.map((item) => item.document.id),
    payload: {
      contentModes: extracted.reduce((counts, item) => {
        const mode = item.document.contentMode ?? "inline";
        counts[mode] = (counts[mode] ?? 0) + 1;
        return counts;
      }, {})
    }
  });
  const previousSnapshot = await readSnapshot(workspaceRoot);
  const sourceDocuments = extracted.map((item) => item.document);
  const subAgentExecutor = createOptionalWikiCuratorExecutor(options, sourceDocuments);
  const curatorResult = await createWikiMutationPlanWithOntologyCurator({
    title: manifest.title,
    sources: sourceDocuments,
    previousSnapshot,
    occurredAt: manifest.updatedAt,
    parentRunId: `cli_ingest_${manifest.id}`,
    ...(subAgentExecutor ? { subAgentExecutor } : {})
  });
  const mutationPlan = curatorResult.mutationPlan;
  await appendWorkspaceEvent(workspaceRoot, manifest, {
    kind: "mutation-plan.created",
    summary: `Created mutation plan ${mutationPlan.id}.`,
    mutationPlanId: mutationPlan.id,
    sourceIds: mutationPlan.sourceIds,
    artifactRefs: [`mutation-plan:${mutationPlan.id}`],
    payload: {
      operationCount: mutationPlan.operations.length,
      expectedPageIds: mutationPlan.expectedPageIds,
      expectedEntityIds: mutationPlan.expectedEntityIds,
      wikiCurator: {
        modelBacked: Boolean(subAgentExecutor),
        rejectedCandidateCount: curatorResult.rejectedCandidateCount,
        reviewQuestions: curatorResult.reviewQuestions
      }
    }
  });

  if (options.planOnly || subAgentExecutor) {
    await writeMutationPlanOnly(workspaceRoot, manifest, mutationPlan);
    const modeCounts = countSourceModesInPlan(mutationPlan);
    console.log(`Prepared mutation plan ${mutationPlan.id}.`);
    console.log(`Sources in plan: ${mutationPlan.sourceIds.length}`);
    console.log(`Ontology candidates: ${countOntologyItemsInPlan(mutationPlan)}`);
    if (subAgentExecutor) {
      console.log(`Wiki curator: model-backed · rejected candidates: ${curatorResult.rejectedCandidateCount}`);
      console.log("Model-backed ontology candidates require review before apply.");
    }
    console.log(`Inline: ${modeCounts.inline} · excerpts: ${modeCounts.excerpt} · metadata-only: ${modeCounts.metadataOnly}`);
    console.log("Wiki snapshot was not changed.");
    console.log(`Review with: pwh review-plan ${mutationPlan.id} --workspace ${workspaceRoot}`);
    console.log(`Apply with: pwh apply-plan ${mutationPlan.id} --workspace ${workspaceRoot}`);
    return;
  }

  await recordMutationPlanReviewAndHandoff(workspaceRoot, manifest, mutationPlan, {
    automated: true
  });
  const result = applyWikiMutationPlan({
    previousSnapshot,
    mutationPlan
  });
  await writeIngestResult(workspaceRoot, manifest, result);
  await appendWorkspaceEvent(workspaceRoot, manifest, {
    kind: "mutation-plan.applied",
    summary: `Applied mutation plan ${mutationPlan.id}.`,
    mutationPlanId: mutationPlan.id,
    sourceIds: result.snapshot.sources.map((source) => source.id),
    pageIds: result.snapshot.pages.map((page) => page.id),
    entityIds: result.snapshot.entities.map((entity) => entity.id),
    artifactRefs: [`mutation-plan:${mutationPlan.id}`, "wiki:snapshot.json", "wiki:index.wiki", "wiki:log.wiki"]
  });

  const inlineCount = result.snapshot.sources.filter((source) => source.contentMode === "inline").length;
  const excerptCount = result.snapshot.sources.filter((source) => source.contentMode === "excerpt").length;
  const metadataOnlyCount = result.snapshot.sources.filter((source) => source.contentMode === "metadata-only").length;
  const ontologyItemCount = result.snapshot.ontologyExtractions?.reduce((sum, extraction) => sum + extraction.items.length, 0) ?? 0;
  console.log(`Ingested ${result.snapshot.sources.length} source${result.snapshot.sources.length === 1 ? "" : "s"} into wiki.`);
  console.log(`Mutation plan: ${result.mutationPlan.id}`);
  console.log(`Ontology candidates: ${ontologyItemCount}`);
  console.log(`Inline: ${inlineCount} · excerpts: ${excerptCount} · metadata-only: ${metadataOnlyCount}`);
  console.log("Raw files stayed in place.");
};

const applyPlan = async (workspaceRoot, planRef) => {
  const manifest = await ensureWorkspace(workspaceRoot);
  const mutationPlan = await readMutationPlan(workspaceRoot, planRef);
  if (mutationPlan.humanReviewState === "rejected") {
    throw new Error(`Mutation plan ${mutationPlan.id} is rejected and cannot be applied.`);
  }
  await recordMutationPlanReviewAndHandoff(workspaceRoot, manifest, mutationPlan, {
    automated: true,
    skipExisting: true
  });

  const previousSnapshot = await readSnapshot(workspaceRoot);
  const result = applyWikiMutationPlan({
    previousSnapshot,
    mutationPlan
  });
  manifest.updatedAt = now();
  await writeIngestResult(workspaceRoot, manifest, result);
  await appendWorkspaceEvent(workspaceRoot, manifest, {
    kind: "mutation-plan.applied",
    summary: `Applied mutation plan ${mutationPlan.id}.`,
    mutationPlanId: mutationPlan.id,
    sourceIds: result.snapshot.sources.map((source) => source.id),
    pageIds: result.snapshot.pages.map((page) => page.id),
    entityIds: result.snapshot.entities.map((entity) => entity.id),
    artifactRefs: [`mutation-plan:${mutationPlan.id}`, "wiki:snapshot.json", "wiki:index.wiki", "wiki:log.wiki"]
  });

  console.log(`Applied mutation plan ${mutationPlan.id}.`);
  console.log(`Wiki pages: ${result.snapshot.pages.length}`);
  console.log(`Entities: ${result.snapshot.entities.length}`);
  console.log(`Ontology candidates: ${result.snapshot.ontologyExtractions?.reduce((sum, extraction) => sum + extraction.items.length, 0) ?? 0}`);
};

const reviewPlan = async (workspaceRoot, planRef, options = {}) => {
  const manifest = await ensureWorkspace(workspaceRoot);
  const mutationPlan = await readMutationPlan(workspaceRoot, planRef);
  const review = summarizeWikiMutationPlan(mutationPlan);
  await appendWorkspaceEvent(workspaceRoot, manifest, {
    kind: "mutation-plan.reviewed",
    summary: `Reviewed mutation plan ${mutationPlan.id}: ${review.decision}.`,
    mutationPlanId: mutationPlan.id,
    sourceIds: mutationPlan.sourceIds,
    artifactRefs: [`mutation-plan:${mutationPlan.id}`],
    payload: {
      decision: review.decision,
      reviewReasons: review.reviewReasons,
      blockedReasons: review.blockedReasons,
      ontologyCandidateCount: review.ontologyCandidateCount
    }
  });
  console.log(options.json ? JSON.stringify(review, null, 2) : renderPlanReview(review));
};

const handoffPlan = async (workspaceRoot, planRef, options = {}) => {
  const manifest = await ensureWorkspace(workspaceRoot);
  const mutationPlan = await readMutationPlan(workspaceRoot, planRef);
  const handoff = createWikiMutationPlanHandoff(mutationPlan);
  await appendWorkspaceEvent(workspaceRoot, manifest, {
    kind: "mutation-plan.handoff-created",
    summary: `Created handoff ${handoff.id} for mutation plan ${mutationPlan.id}.`,
    mutationPlanId: mutationPlan.id,
    sourceIds: mutationPlan.sourceIds,
    artifactRefs: handoff.artifactRefs,
    payload: {
      decision: handoff.decision,
      batchCount: handoff.batches.length,
      evidenceRefs: handoff.evidenceRefs,
      mustCarryForwardRefs: handoff.mustCarryForwardRefs
    }
  });
  console.log(options.json ? JSON.stringify(handoff, null, 2) : renderPlanHandoff(handoff));
};

const listPlans = async (workspaceRoot) => {
  await ensureWorkspace(workspaceRoot);
  const snapshot = await readSnapshot(workspaceRoot);
  const appliedIds = new Set((snapshot.mutationPlans ?? []).map((plan) => plan.id));
  const mutationPlans = await readMutationPlans(workspaceRoot);
  if (mutationPlans.length === 0) {
    console.log("No mutation plans found.");
    return;
  }
  for (const mutationPlan of mutationPlans) {
    const state = appliedIds.has(mutationPlan.id) ? "applied" : "pending";
    console.log(`${mutationPlan.id} · ${state} · ${mutationPlan.createdAt} · ${mutationPlan.title}`);
  }
};

const listEvents = async (workspaceRoot) => {
  await ensureWorkspace(workspaceRoot);
  const events = await readWorkspaceEvents(workspaceRoot);
  if (events.length === 0) {
    console.log("No workspace events found.");
    return;
  }
  for (const event of events.slice(-50)) {
    const refs = [
      event.mutationPlanId ? `plan=${event.mutationPlanId}` : "",
      event.runId ? `run=${event.runId}` : "",
      event.versionId ? `version=${event.versionId}` : ""
    ].filter(Boolean);
    console.log(`${event.occurredAt} · ${event.kind} · ${event.summary}${refs.length ? ` · ${refs.join(" ")}` : ""}`);
  }
};

const verifyWorkspace = async (workspaceRoot, options = {}) => {
  const manifest = await ensureWorkspace(workspaceRoot);
  const snapshot = await readSnapshot(workspaceRoot);
  const events = await readWorkspaceEvents(workspaceRoot);
  const report = verifyWorkspaceState({
    manifest,
    snapshot,
    events,
    createdAt: now()
  });
  await appendWorkspaceEvent(workspaceRoot, manifest, {
    kind: "verification.completed",
    summary: `Workspace verification ${report.status}.`,
    artifactRefs: [`verification:${report.id}`],
    payload: {
      report
    }
  });
  console.log(options.json ? JSON.stringify(report, null, 2) : renderVerificationReport(report));
  if (report.status === "fail") process.exitCode = 1;
};

const auditWorkspace = async (workspaceRoot, options = {}) => {
  const manifest = await ensureWorkspace(workspaceRoot);
  const snapshot = await readSnapshot(workspaceRoot);
  const events = await readWorkspaceEvents(workspaceRoot);
  const report = auditWorkspaceState({
    manifest,
    snapshot,
    events,
    createdAt: now()
  });
  await appendWorkspaceEvent(workspaceRoot, manifest, {
    kind: "audit.completed",
    summary: `Workspace audit ${report.status}.`,
    artifactRefs: [`audit:${report.id}`],
    payload: {
      report
    }
  });
  console.log(options.json ? JSON.stringify(report, null, 2) : renderVerificationReport(report));
  if (report.status === "fail") process.exitCode = 1;
};

const queryWorkspace = async (workspaceRoot, terms, options = {}) => {
  await ensureWorkspace(workspaceRoot);
  const snapshot = await readSnapshot(workspaceRoot);
  const query = terms.join(" ").trim();
  if (!query) throw new Error("query requires a question or keyword.");
  const needle = query.toLowerCase();
  const matches = {
    query,
    pages: snapshot.pages
      .filter((page) => `${page.title}\n${page.body}`.toLowerCase().includes(needle))
      .slice(0, 8)
      .map((page) => ({
        id: page.id,
        title: page.title,
        path: page.path,
        summary: oneLine(page.body, 220)
      })),
    entities: snapshot.entities
      .filter((entity) => `${entity.name}\n${entity.aliases.join(" ")}\n${entity.summary}`.toLowerCase().includes(needle))
      .slice(0, 12)
      .map((entity) => ({
        id: entity.id,
        name: entity.name,
        kind: entity.kind,
        summary: entity.summary
      })),
    sources: snapshot.sources
      .filter((source) => `${source.title}\n${source.uri}\n${source.content}`.toLowerCase().includes(needle))
      .slice(0, 8)
      .map((source) => ({
        id: source.id,
        title: source.title,
        uri: source.uri,
        contentMode: source.contentMode ?? "inline",
        summary: oneLine(source.content || source.uri, 220)
      }))
  };

  if (options.json) {
    console.log(JSON.stringify(matches, null, 2));
    return;
  }

  console.log(`Query: ${query}`);
  console.log("");
  console.log("Pages");
  for (const page of matches.pages) console.log(`- ${page.title} · ${page.path} · ${page.summary}`);
  if (!matches.pages.length) console.log("- none");
  console.log("");
  console.log("Entities");
  for (const entity of matches.entities) console.log(`- ${entity.kind} · ${entity.name} · ${entity.summary}`);
  if (!matches.entities.length) console.log("- none");
  console.log("");
  console.log("Sources");
  for (const source of matches.sources) console.log(`- ${source.title} · ${source.contentMode} · ${source.summary}`);
  if (!matches.sources.length) console.log("- none");
};

const exportSite = async (workspaceRoot, options = {}) => {
  const manifest = await ensureWorkspace(workspaceRoot);
  const paths = workspacePaths(workspaceRoot);
  const outputDir = path.resolve(options.output ?? paths.export);
  await mkdir(outputDir, { recursive: true });
  const sourceHtml = path.join(paths.dist, "index.html");
  const outputHtml = path.join(outputDir, "index.html");
  try {
    await copyFile(sourceHtml, outputHtml);
  } catch {
    const snapshot = await readSnapshot(workspaceRoot);
    const fallbackRun = {
      intent: {
        title: manifest.title,
        prompt: `Static export for ${manifest.title}`
      },
      buildVersion: {
        contentModel: {
          title: manifest.title,
          thesis: `Compiled from ${snapshot.sources.length} source${snapshot.sources.length === 1 ? "" : "s"}.`
        }
      }
    };
    await writeFile(outputHtml, renderStaticSite(manifest, snapshot, fallbackRun), "utf8");
  }
  await writeFile(
    path.join(outputDir, "pwh-export.json"),
    `${JSON.stringify(
      {
        workspaceId: manifest.id,
        title: manifest.title,
        exportedAt: now(),
        source: paths.dist,
        files: ["index.html"]
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  await appendWorkspaceEvent(workspaceRoot, manifest, {
    kind: "site.published",
    summary: `Exported static site to ${outputDir}.`,
    artifactRefs: [`export:${outputDir}`, "export:index.html"],
    payload: { outputDir }
  });
  console.log(`Exported static site: ${outputHtml}`);
};

const status = async (workspaceRoot) => {
  const manifest = await ensureWorkspace(workspaceRoot);
  const snapshot = await readSnapshot(workspaceRoot);
  const events = await readWorkspaceEvents(workspaceRoot);
  const totalBytes = manifest.sources.reduce((sum, source) => sum + (source.sizeBytes ?? 0), 0);
  console.log(`${manifest.title}`);
  console.log(`Workspace: ${workspacePaths(workspaceRoot).pwh}`);
  console.log(`Sources: ${manifest.sources.length}`);
  console.log(`Wiki pages: ${snapshot.pages.length}`);
  console.log(`Entities: ${snapshot.entities.length}`);
  console.log(`Ontology candidates: ${snapshot.ontologyExtractions?.reduce((sum, extraction) => sum + extraction.items.length, 0) ?? 0}`);
  console.log(`Events: ${events.length}`);
  console.log(`Referenced bytes: ${totalBytes}`);
  console.log(`Policy: ${manifest.sourcePolicy.mode}`);
};

const main = async () => {
  const { command, workspaceRoot, positionals, options } = parseArgs(process.argv.slice(2));
  if (command === "help" || command === "--help" || command === "-h") {
    console.log(usage());
    return;
  }
  if (command === "init") {
    await init(positionals[0] ? path.resolve(positionals[0]) : workspaceRoot);
    return;
  }
  if (command === "link") {
    await link(workspaceRoot, positionals);
    return;
  }
  if (command === "ingest") {
    await ingest(workspaceRoot, positionals, options);
    return;
  }
  if (command === "review-plan") {
    await reviewPlan(workspaceRoot, positionals[0], options);
    return;
  }
  if (command === "handoff-plan") {
    await handoffPlan(workspaceRoot, positionals[0], options);
    return;
  }
  if (command === "apply-plan") {
    await applyPlan(workspaceRoot, positionals[0]);
    return;
  }
  if (command === "query") {
    await queryWorkspace(workspaceRoot, positionals, options);
    return;
  }
  if (command === "lint") {
    await verifyWorkspace(workspaceRoot, options);
    return;
  }
  if (command === "plans") {
    await listPlans(workspaceRoot);
    return;
  }
  if (command === "events") {
    await listEvents(workspaceRoot);
    return;
  }
  if (command === "verify") {
    await verifyWorkspace(workspaceRoot, options);
    return;
  }
  if (command === "audit") {
    await auditWorkspace(workspaceRoot, options);
    return;
  }
  if (command === "build") {
    await build(workspaceRoot, options);
    return;
  }
  if (command === "export") {
    await exportSite(workspaceRoot, options);
    return;
  }
  if (command === "status") {
    await status(workspaceRoot);
    return;
  }
  throw new Error(`Unknown command: ${command}\n\n${usage()}`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
