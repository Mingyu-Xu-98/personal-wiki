import type { HarnessRun, ToolCallRecord } from "../domain/index.js";
import type { ToolDefinition } from "./types.js";

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  manifest(): Array<Pick<ToolDefinition, "name" | "description" | "permissions">> {
    return [...this.tools.values()].map((tool) => ({
      name: tool.name,
      description: tool.description,
      permissions: tool.permissions,
    }));
  }

  async call(name: string, input: unknown, run: HarnessRun, options: { maxAttempts?: number } = {}): Promise<ToolCallRecord> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);

    const startedAt = new Date().toISOString();
    const maxAttempts = Math.max(1, options.maxAttempts ?? 1);
    let lastError = "";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const output = await tool.execute(input, run);
        return {
          id: crypto.randomUUID(),
          name,
          input,
          outputPreview: output.slice(0, 240),
          attempts: attempt,
          startedAt,
          finishedAt: new Date().toISOString(),
          status: "ok",
        };
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    return {
      id: crypto.randomUUID(),
      name,
      input,
      outputPreview: lastError,
      attempts: maxAttempts,
      startedAt,
      finishedAt: new Date().toISOString(),
      status: "error",
    };
  }
}
