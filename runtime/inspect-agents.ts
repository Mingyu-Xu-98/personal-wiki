import path from "node:path";
import { listAgentIds, loadAgent } from "./agent-loader.js";

const agentsRoot = path.join(process.cwd(), "agents");
const agentIds = await listAgentIds(agentsRoot);

const rows = [];
for (const id of agentIds) {
  const agent = await loadAgent(path.join(agentsRoot, id));
  rows.push({
    id: agent.definition.id,
    model: agent.definition.model,
    tools: agent.localTools.length,
    skills: agent.localSkills.length,
    evals: agent.localEvals.length,
    issues: agent.validationIssues.length,
  });
}

console.log(JSON.stringify(rows, null, 2));
