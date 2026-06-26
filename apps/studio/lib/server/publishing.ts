import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { BuildVersion } from "@personal-wiki-harness/harness-core";
import type { DeploymentRecord } from "./production.ts";

type LocalPublicationInput = {
  id: string;
  userId: string;
  version: BuildVersion;
  createdAt: string;
};

type PublishedSiteFile = {
  path: string;
  mediaType: "text/html";
  content: string;
};

const safeSegment = (value: string) =>
  value
    .trim()
    .replace(/[^\w.\-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "site";

const cleanRelativePath = (value: string) => {
  const normalized = path.posix.normalize(value || "index.html").replace(/^\/+/, "");
  if (!normalized || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error("Invalid site artifact path.");
  }
  return normalized;
};

export const getPublishedSiteRoot = () => process.env.PWH_PUBLISHED_SITE_PATH || path.join(".pwh-studio", "published-sites");

export const writeLocalPublishedSite = (input: LocalPublicationInput): DeploymentRecord => {
  const root = getPublishedSiteRoot();
  const relativeDir = path.join(safeSegment(input.userId), safeSegment(input.version.id));
  const outputDir = path.resolve(root, relativeDir);
  mkdirSync(outputDir, { recursive: true });

  const files = input.version.siteArtifact?.files?.length
    ? input.version.siteArtifact.files
    : [createFallbackIndexFile(input.version)];
  const writtenFiles: Array<{ path: string; mediaType: string }> = [];

  for (const file of files) {
    const relativePath = cleanRelativePath(file.path);
    const absolutePath = path.resolve(outputDir, ...relativePath.split("/"));
    if (!absolutePath.startsWith(outputDir)) {
      throw new Error("Invalid site artifact path.");
    }
    mkdirSync(path.dirname(absolutePath), { recursive: true });
    writeFileSync(absolutePath, file.content, "utf8");
    writtenFiles.push({ path: relativePath, mediaType: file.mediaType });
  }

  writeFileSync(
    path.join(outputDir, "pwh-site-manifest.json"),
    `${JSON.stringify(
      {
        publicationId: input.id,
        userId: input.userId,
        versionId: input.version.id,
        title: input.version.contentModel?.title ?? input.version.summary,
        files: writtenFiles,
        createdAt: input.createdAt
      },
      null,
      2
    )}\n`,
    "utf8"
  );

  return {
    id: input.id,
    provider: "local-artifact",
    status: "ready",
    url: `/api/site/artifact/${encodeURIComponent(input.id)}/index.html`,
    artifactPath: outputDir,
    createdAt: input.createdAt
  };
};

export const readLocalPublishedSiteFile = (
  deployment: DeploymentRecord | undefined,
  filePath: string
): { content: string; mediaType: string; absolutePath: string } => {
  if (!deployment || deployment.provider !== "local-artifact" || deployment.status !== "ready") {
    throw new Error("Published site artifact is not available.");
  }
  const relativePath = cleanRelativePath(filePath || "index.html");
  const outputDir = path.resolve(deployment.artifactPath);
  const absolutePath = path.resolve(outputDir, ...relativePath.split("/"));
  if (!absolutePath.startsWith(outputDir) || !existsSync(absolutePath)) {
    throw new Error("Published site file not found.");
  }
  return {
    content: readFileSync(absolutePath, "utf8"),
    mediaType: relativePath.endsWith(".html") ? "text/html; charset=utf-8" : "text/plain; charset=utf-8",
    absolutePath
  };
};

const createFallbackIndexFile = (version: BuildVersion): PublishedSiteFile => {
  const title = escapeHtml(version.contentModel?.title ?? "Published Site");
  const thesis = escapeHtml(version.contentModel?.thesis ?? version.summary);
  const sections = version.contentModel?.sections ?? [];
  const body = sections
    .map(
      (section) => `
        <section>
          <h2>${escapeHtml(section.title)}</h2>
          ${section.contentBlocks
            .map((block) => (block.kind === "markdown" ? `<p>${escapeHtml(block.markdown)}</p>` : ""))
            .join("\n")}
        </section>`
    )
    .join("\n");
  return {
    path: "index.html",
    mediaType: "text/html",
    content: `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #111827; background: #f8fafc; }
    main { max-width: 980px; margin: 0 auto; padding: 72px 24px; }
    h1 { font-size: clamp(40px, 7vw, 88px); line-height: .96; margin: 0 0 24px; }
    p { color: #4b5563; font-size: 17px; line-height: 1.8; }
    section { margin-top: 32px; padding: 28px; border: 1px solid #e5e7eb; background: white; border-radius: 18px; }
  </style>
</head>
<body>
  <main>
    <h1>${title}</h1>
    <p>${thesis}</p>
    ${body}
  </main>
</body>
</html>`
  };
};

const escapeHtml = (value: string | undefined) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
