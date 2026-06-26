import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { SandboxResult } from "./types.js";

const execFileAsync = promisify(execFile);

export class SandboxRunner {
  constructor(
    private readonly workspaceRoot: string,
    private readonly mode: "local" | "docker" = process.env.SANDBOX_MODE === "docker" ? "docker" : "local",
  ) {}

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
    if (this.mode === "docker") return this.validateInDocker(artifactDir, requiredFiles);

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

  private async validateInDocker(artifactDir: string, requiredFiles: string[]): Promise<SandboxResult> {
    const checkedFiles = requiredFiles.map((file) => path.join(artifactDir, file));
    const testScript = requiredFiles.map((file) => `test -f /artifact/${shellQuote(file)}`).join(" && ");
    try {
      const { stdout, stderr } = await execFileAsync("docker", [
        "run",
        "--rm",
        "--network",
        "none",
        "--read-only",
        "--cap-drop",
        "ALL",
        "--pids-limit",
        "64",
        "--memory",
        "256m",
        "-v",
        `${path.resolve(artifactDir)}:/artifact:ro`,
        "alpine:3.20",
        "sh",
        "-lc",
        testScript,
      ], { timeout: 30_000 });
      return {
        status: "ok",
        logs: ["Docker sandbox validation passed.", stdout, stderr].filter(Boolean),
        artifactPath: artifactDir,
        checkedFiles,
      };
    } catch (err) {
      return {
        status: "error",
        logs: [err instanceof Error ? err.message : String(err)],
        artifactPath: artifactDir,
        checkedFiles,
      };
    }
  }
}

function shellQuote(input: string): string {
  if (input.startsWith("/") || input.includes("..") || input.includes("'")) {
    throw new Error(`Unsafe sandbox file path: ${input}`);
  }
  return `'${input}'`;
}
