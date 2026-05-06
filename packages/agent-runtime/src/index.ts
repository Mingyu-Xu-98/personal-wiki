export type AgentMessageRole = "system" | "user" | "assistant" | "tool";

export type AgentMessage = {
  role: AgentMessageRole;
  content: string;
  name?: string;
};

export type ToolDefinition<Input = unknown, Output = unknown> = {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execute: (input: Input) => Promise<Output>;
};

export type ModelRequest = {
  messages: AgentMessage[];
  tools: Array<Omit<ToolDefinition, "execute">>;
};

export type ModelResponse = {
  message: AgentMessage;
  requestedToolCalls: RequestedToolCall[];
};

export type RequestedToolCall = {
  id: string;
  toolName: string;
  input: unknown;
};

export type ToolResult = {
  callId: string;
  toolName: string;
  output: unknown;
};

export type ModelTier = "strong" | "balanced" | "small" | "embedding";

export type ModelRole =
  | "commander"
  | "planner"
  | "reflection"
  | "system-skill-promotion"
  | "coder"
  | "wiki-maintainer"
  | "site-assistant"
  | "summarizer"
  | "search";

export type ModelRoutingDecision = {
  role: ModelRole;
  tier: ModelTier;
  reason: string;
};

export type ModelRoutingPolicy = {
  defaultTier: ModelTier;
  decisions: ModelRoutingDecision[];
};

export const defaultModelRoutingPolicy: ModelRoutingPolicy = {
  defaultTier: "small",
  decisions: [
    {
      role: "commander",
      tier: "strong",
      reason: "The commander chooses intent, context, tool strategy, and recovery paths."
    },
    {
      role: "planner",
      tier: "strong",
      reason: "Planning controls the run shape and should spend intelligence before execution spends tokens."
    },
    {
      role: "reflection",
      tier: "strong",
      reason: "Reflection decides whether a run should be revised, shipped, or turned into reusable process knowledge."
    },
    {
      role: "system-skill-promotion",
      tier: "strong",
      reason: "System skills affect all users and require conservative judgment."
    },
    {
      role: "coder",
      tier: "balanced",
      reason: "Code writing is bounded by files, tests, and review, so it can use a cheaper specialist tier."
    },
    {
      role: "wiki-maintainer",
      tier: "balanced",
      reason: "Wiki maintenance needs synthesis but is usually constrained by source evidence."
    },
    {
      role: "site-assistant",
      tier: "small",
      reason: "In-site AI calls should be cheap, fast, and scoped to already-selected user context."
    },
    {
      role: "summarizer",
      tier: "small",
      reason: "Summarization is high-volume and can be verified against source snippets."
    },
    {
      role: "search",
      tier: "embedding",
      reason: "Search and recall should use retrieval or embedding systems before generative reasoning."
    }
  ]
};

export const selectModelTier = (
  policy: ModelRoutingPolicy,
  role: ModelRole
): ModelRoutingDecision => {
  const decision = policy.decisions.find((entry) => entry.role === role);
  return (
    decision ?? {
      role,
      tier: policy.defaultTier,
      reason: "No explicit routing rule matched, so the default model tier was selected."
    }
  );
};

export type AgentRuntime = {
  complete(request: ModelRequest): Promise<ModelResponse>;
};
