import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
  CompiledSiteArtifact,
  WikiWorkspaceManifest,
  WorkspaceAdapter,
  WorkspaceSourceEntry
} from "../../../packages/engine-core/src/index.ts";
import { createEmptyWorkspaceSnapshot } from "../../../packages/engine-core/src/index.ts";
import type { BuildVersion } from "../../../packages/harness-core/src/index.ts";
import type { WikiEvent, WikiSnapshot } from "../../../packages/wiki-core/src/index.ts";

export type LocalWorkspacePaths = {
  root: string;
  pwh: string;
  manifest: string;
  wiki: string;
  snapshot: string;
  log: string;
  plans: string;
  builds: string;
  dist: string;
};

export const getLocalWorkspacePaths = (workspaceRoot: string): LocalWorkspacePaths => {
  const root = path.resolve(workspaceRoot);
  const pwh = path.join(root, ".pwh");
  return {
    root,
    pwh,
    manifest: path.join(pwh, "workspace.json"),
    wiki: path.join(pwh, "wiki"),
    snapshot: path.join(pwh, "wiki", "snapshot.json"),
    log: path.join(pwh, "wiki", "log.wiki"),
    plans: path.join(pwh, "plans"),
    builds: path.join(pwh, "builds"),
    dist: path.join(pwh, "dist")
  };
};

export class LocalWorkspaceAdapter implements WorkspaceAdapter {
  readonly kind = "local" as const;
  private readonly paths: LocalWorkspacePaths;

  constructor(workspaceRoot: string) {
    this.paths = getLocalWorkspacePaths(workspaceRoot);
  }

  async readManifest(): Promise<WikiWorkspaceManifest> {
    const raw = await readFile(this.paths.manifest, "utf8");
    return JSON.parse(raw) as WikiWorkspaceManifest;
  }

  async writeManifest(manifest: WikiWorkspaceManifest): Promise<void> {
    await mkdir(this.paths.pwh, { recursive: true });
    await writeFile(this.paths.manifest, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  }

  async readWikiSnapshot(): Promise<WikiSnapshot> {
    try {
      const raw = await readFile(this.paths.snapshot, "utf8");
      return JSON.parse(raw) as WikiSnapshot;
    } catch {
      return createEmptyWorkspaceSnapshot();
    }
  }

  async writeWikiSnapshot(_knowledgeBaseId: string | undefined, snapshot: WikiSnapshot): Promise<void> {
    await mkdir(this.paths.wiki, { recursive: true });
    await writeFile(this.paths.snapshot, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  }

  async appendWikiEvent(_knowledgeBaseId: string | undefined, event: WikiEvent): Promise<void> {
    await mkdir(this.paths.wiki, { recursive: true });
    const current = await readFile(this.paths.log, "utf8").catch(() => "# log.wiki\n");
    await writeFile(
      this.paths.log,
      `${current.trimEnd()}\n\n## [${event.occurredAt}] ${event.kind} | ${event.title}\n${event.summary}\n`,
      "utf8"
    );
  }

  async readSourceText(entry: WorkspaceSourceEntry, options: { maxBytes?: number } = {}): Promise<string> {
    const sourcePath = sourcePathFromEntry(entry);
    const raw = await readFile(sourcePath);
    return raw.subarray(0, options.maxBytes ?? raw.byteLength).toString("utf8");
  }

  async writeBuildVersion(_knowledgeBaseId: string | undefined, version: BuildVersion): Promise<void> {
    await mkdir(this.paths.builds, { recursive: true });
    await writeFile(
      path.join(this.paths.builds, `${version.id}.json`),
      `${JSON.stringify(version, null, 2)}\n`,
      "utf8"
    );
  }

  async writeSiteArtifact(_knowledgeBaseId: string | undefined, artifact: CompiledSiteArtifact): Promise<void> {
    await mkdir(this.paths.dist, { recursive: true });
    await writeFile(
      path.join(this.paths.dist, `${artifact.versionId}.json`),
      `${JSON.stringify(artifact, null, 2)}\n`,
      "utf8"
    );
  }
}

export const createLocalWorkspaceAdapter = (workspaceRoot: string): LocalWorkspaceAdapter =>
  new LocalWorkspaceAdapter(workspaceRoot);

const sourcePathFromEntry = (entry: WorkspaceSourceEntry): string => {
  const uri = entry.originalUri ?? entry.uri;
  if (uri.startsWith("file://")) return fileURLToPath(uri);
  const absolutePath = entry.metadata?.absolutePath;
  if (typeof absolutePath === "string") return absolutePath;
  return uri;
};
