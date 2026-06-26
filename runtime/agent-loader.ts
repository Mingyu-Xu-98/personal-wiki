import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AgentDefinition, LoadedAgent } from "./types.js";

export async function loadAgent(agentDir: string): Promise<LoadedAgent> {
  const agentModulePath = path.join(agentDir, "agent.ts");
  const instructionsPath = path.join(agentDir, "instructions.md");

  const mod = await import(pathToFileURL(agentModulePath).href) as { agent: AgentDefinition };
  const instructions = await fs.readFile(instructionsPath, "utf8");

  return {
    definition: mod.agent,
    rootDir: agentDir,
    instructions,
  };
}

export async function listAgentIds(agentsRoot: string): Promise<string[]> {
  const entries = await fs.readdir(agentsRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}
