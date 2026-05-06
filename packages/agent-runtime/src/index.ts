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

export type AgentRuntime = {
  complete(request: ModelRequest): Promise<ModelResponse>;
};
