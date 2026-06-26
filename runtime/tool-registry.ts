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

  async call(name: string, input: unknown, run: HarnessRun): Promise<ToolCallRecord> {
    const tool = this.tools.get(name);
    if (!tool) throw new Error(`Unknown tool: ${name}`);

    const startedAt = new Date().toISOString();
    try {
      const output = await tool.execute(input, run);
      return {
        id: crypto.randomUUID(),
        name,
        input,
        outputPreview: output.slice(0, 240),
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "ok",
      };
    } catch (err) {
      return {
        id: crypto.randomUUID(),
        name,
        input,
        outputPreview: err instanceof Error ? err.message : String(err),
        startedAt,
        finishedAt: new Date().toISOString(),
        status: "error",
      };
    }
  }
}
