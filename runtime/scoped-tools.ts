import type { LoadedAgent, ToolDefinition } from "./types.js";
import { ToolRegistry } from "./tool-registry.js";

export interface ScopedToolResult {
  registry: ToolRegistry;
  skipped: Array<{ name: string; reason: string }>;
}

export function createScopedToolRegistry(agent: LoadedAgent, tools: ToolDefinition[]): ScopedToolResult {
  const registry = new ToolRegistry();
  const skipped: Array<{ name: string; reason: string }> = [];
  const declaredTools = new Set(agent.definition.tools);
  const permissions = new Set(agent.definition.permissions);

  for (const tool of tools) {
    if (!declaredTools.has(tool.name)) {
      skipped.push({ name: tool.name, reason: "not declared by agent" });
      continue;
    }

    const missingPermission = tool.permissions.find((permission) => !permissions.has(permission));
    if (missingPermission) {
      skipped.push({ name: tool.name, reason: `missing permission ${missingPermission}` });
      continue;
    }

    registry.register(tool);
  }

  return { registry, skipped };
}
