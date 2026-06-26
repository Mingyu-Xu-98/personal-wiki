import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { AgentDefinition, AgentValidationIssue, LoadedAgent } from "./types.js";

export async function loadAgent(agentDir: string): Promise<LoadedAgent> {
  const agentModulePath = path.join(agentDir, "agent.ts");
  const instructionsPath = path.join(agentDir, "instructions.md");

  const mod = await import(pathToFileURL(agentModulePath).href) as { agent: AgentDefinition };
  const instructions = await fs.readFile(instructionsPath, "utf8");
  const localTools = await listBasenames(path.join(agentDir, "tools"), ".ts");
  const localSkills = await listBasenames(path.join(agentDir, "skills"), ".md");
  const localEvals = await listBasenames(path.join(agentDir, "evals"), ".json");
  const validationIssues = await validateAgentDirectory(agentDir, mod.agent, localTools);

  return {
    definition: mod.agent,
    rootDir: agentDir,
    instructions,
    localTools,
    localSkills,
    localEvals,
    validationIssues,
  };
}

export async function listAgentIds(agentsRoot: string): Promise<string[]> {
  const entries = await fs.readdir(agentsRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function listBasenames(dir: string, extension: string): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => entry.name.slice(0, -extension.length))
    .sort();
}

async function validateAgentDirectory(agentDir: string, agent: AgentDefinition, localTools: string[]): Promise<AgentValidationIssue[]> {
  const issues: AgentValidationIssue[] = [];
  const localToolSet = new Set(localTools);

  for (const tool of agent.tools) {
    if (!localToolSet.has(tool)) {
      issues.push({
        severity: "warning",
        message: `Declared tool '${tool}' has no local tools/${tool}.ts file.`,
      });
    }
  }

  for (const subagent of agent.subagents) {
    const subagentDir = path.join(agentDir, "subagents", subagent);
    try {
      await fs.access(path.join(subagentDir, "agent.ts"));
      await fs.access(path.join(subagentDir, "instructions.md"));
    } catch {
      issues.push({
        severity: "error",
        message: `Declared subagent '${subagent}' is missing agent.ts or instructions.md.`,
      });
    }
  }

  return issues;
}
