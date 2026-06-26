import fs from "node:fs/promises";
import path from "node:path";
import type { SandboxResult } from "./types.js";

export class SandboxRunner {
  constructor(private readonly workspaceRoot: string) {}

  artifactDir(runId: string): string {
    return path.join(this.workspaceRoot, "artifacts", runId);
  }

  async writeArtifactFile(runId: string, relativePath: string, content: string): Promise<string> {
    if (relativePath.startsWith("/") || relativePath.includes("..")) {
      throw new Error(`Unsafe artifact path: ${relativePath}`);
    }

    const artifactDir = this.artifactDir(runId);
    const filePath = path.join(artifactDir, relativePath);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, content);
    return filePath;
  }

  async validate(runId: string, requiredFiles: string[]): Promise<SandboxResult> {
    const artifactDir = this.artifactDir(runId);
    const logs: string[] = [];
    const checkedFiles: string[] = [];

    for (const file of requiredFiles) {
      const filePath = path.join(artifactDir, file);
      checkedFiles.push(filePath);
      try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) logs.push(`Missing file: ${file}`);
      } catch {
        logs.push(`Missing file: ${file}`);
      }
    }

    return {
      status: logs.length === 0 ? "ok" : "error",
      logs: logs.length === 0 ? ["Artifact validation passed."] : logs,
      artifactPath: artifactDir,
      checkedFiles,
    };
  }
}
