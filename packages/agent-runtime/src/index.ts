export type AgentMessageRole = "system" | "user" | "assistant" | "tool";

export type AgentPermission =
  | "read_wiki"
  | "write_wiki"
  | "read_sources"
  | "write_artifacts"
  | "run_sandbox"
  | "request_approval"
  | "deploy_preview"
  | "deploy_production";

export type FileSystemAgentDefinition = {
  id: string;
  name: string;
  model: string;
  description: string;
  permissions: AgentPermission[];
  tools: string[];
  subagents: string[];
};

export type AgentValidationIssue = {
  severity: "warning" | "error";
  message: string;
};

export type LoadedFileSystemAgent = {
  definition: FileSystemAgentDefinition;
  rootDir: string;
  instructions: string;
  localTools: string[];
  localSkills: string[];
  localEvals: string[];
  validationIssues: AgentValidationIssue[];
};

export type AgentMessage = {
  role: AgentMessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: RequestedToolCall[];
};

export type ToolDefinition<Input = unknown, Output = unknown> = {
  name: string;
  description: string;
  permissions?: AgentPermission[];
  inputSchema: Record<string, unknown>;
  execute: (input: Input) => Promise<Output>;
};

export type ModelRequest = {
  messages: AgentMessage[];
  tools: Array<Omit<ToolDefinition, "execute">>;
  responseFormat?: "json_object";
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

export type ToolExecutionStatus = "completed" | "failed";

export type ToolExecutionRecord = {
  callId: string;
  toolName: string;
  input: unknown;
  output: unknown;
  error?: string;
  startedAt: string;
  finishedAt: string;
  status: ToolExecutionStatus;
};

export type ToolRegistry = {
  list(): Array<Omit<ToolDefinition, "execute">>;
  get(name: string): ToolDefinition | undefined;
  execute(call: RequestedToolCall): Promise<ToolExecutionRecord>;
};

export type ScopedToolRegistryResult = {
  registry: ToolRegistry;
  skipped: Array<{ name: string; reason: string }>;
};

export type ToolClock = {
  now(): string;
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

export type OpenAICompatibleAgentRuntimeOptions = {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImplementation?: typeof fetch;
  extraHeaders?: Record<string, string>;
};

export type OpenAIResponsesAgentRuntimeOptions = OpenAICompatibleAgentRuntimeOptions & {
  maxOutputTokens?: number;
  store?: boolean;
};

export type SubAgentRole =
  | "conversation-agent"
  | "builder-agent"
  | "review-agent"
  | "intent-analyst"
  | "wiki-curator"
  | "site-planner"
  | "content-writer"
  | "site-compiler"
  | "verifier"
  | "reflection";

export type SubAgentStatus = "queued" | "running" | "completed" | "failed" | "skipped";

export type ContextRetentionPolicy =
  | "summary-only"
  | "artifact-only"
  | "bounded-transcript"
  | "full-record";

export type ContextPacketInputKind =
  | "instruction"
  | "run-context-manifest"
  | "intent"
  | "wiki-index"
  | "wiki-page"
  | "entity"
  | "source-excerpt"
  | "tool-result"
  | "build-version"
  | "system-skill"
  | "design-system"
  | "component-registry"
  | "tool-registry"
  | "style-guide";

export type ContextPacketInput = {
  kind: ContextPacketInputKind;
  id: string;
  title: string;
  summary: string;
  content?: string;
  uri?: string;
};

export type ContextBudget = {
  maxInputChars: number;
  maxOutputChars: number;
  maxToolCalls: number;
};

export type ContextPacket = {
  id: string;
  role: SubAgentRole;
  createdAt: string;
  workflowPhaseId?: string;
  goal: string;
  instructions: string[];
  inputs: ContextPacketInput[];
  budget: ContextBudget;
  allowedToolNames?: string[];
  requiredOutputNames?: string[];
  requiredCarryForwardRefs?: string[];
  outputContract: string[];
  retentionPolicy: ContextRetentionPolicy;
  inputCharCount: number;
};

export type SubAgentArtifact = {
  id: string;
  kind:
    | "summary"
    | "build-spec"
    | "content-model"
    | "design-usage-plan"
    | "site-plan"
    | "ontology-extraction"
    | "html"
    | "lint-report"
    | "review-report"
    | "tool-trace";
  title: string;
  summary: string;
  ref?: string;
  data?: unknown;
};

export type ContextDelta = {
  action: "keep" | "drop" | "replace-with-summary" | "promote-to-wiki" | "promote-to-system-skill";
  targetId: string;
  summary: string;
  reason: string;
};

export type SubAgentResult = {
  id: string;
  role: SubAgentRole;
  status: Exclude<SubAgentStatus, "queued" | "running">;
  summary: string;
  decisions: string[];
  artifacts: SubAgentArtifact[];
  evidenceRefs: string[];
  artifactRefs: string[];
  mustCarryForwardRefs: string[];
  discardableContext: string[];
  contextDeltas: ContextDelta[];
  toolCalls: ToolExecutionRecord[];
};

export type SubAgentTrace = {
  id: string;
  parentRunId: string;
  role: SubAgentRole;
  status: SubAgentStatus;
  packet: ContextPacket;
  result?: SubAgentResult;
  startedAt?: string;
  finishedAt?: string;
};

export type SubAgentExecutor = {
  execute(trace: SubAgentTrace): Promise<SubAgentTrace>;
};

export type RoleBasedSubAgentExecutorOptions = {
  executors: Partial<Record<SubAgentRole, SubAgentExecutor>>;
  fallback?: SubAgentExecutor;
};

export type ModelBackedSubAgentExecutorOptions = {
  agentRuntime: AgentRuntime;
  toolRegistry?: ToolRegistry;
  clock?: ToolClock;
  maxToolRounds?: number;
};

export type OpenAICompatibleSubAgentExecutorOptions = OpenAICompatibleAgentRuntimeOptions &
  Omit<ModelBackedSubAgentExecutorOptions, "agentRuntime">;

export type OpenAIResponsesSubAgentExecutorOptions = OpenAIResponsesAgentRuntimeOptions &
  Omit<ModelBackedSubAgentExecutorOptions, "agentRuntime">;

export const createContextPacket = (input: Omit<ContextPacket, "inputCharCount">): ContextPacket => ({
  ...input,
  inputCharCount: estimateContextPacketChars(input)
});

export const estimateContextPacketChars = (
  packet: Pick<
    ContextPacket,
    | "goal"
    | "instructions"
    | "inputs"
    | "outputContract"
    | "allowedToolNames"
    | "requiredOutputNames"
    | "requiredCarryForwardRefs"
  >
): number =>
  [
    packet.goal,
    ...packet.instructions,
    ...(packet.allowedToolNames ?? []),
    ...(packet.requiredOutputNames ?? []),
    ...(packet.requiredCarryForwardRefs ?? []),
    ...packet.outputContract,
    ...packet.inputs.flatMap((input) => [
      input.kind,
      input.id,
      input.title,
      input.summary,
      input.content ?? "",
      input.uri ?? ""
    ])
  ].reduce((sum, value) => sum + value.length, 0);

export const trimContextPacketToBudget = (packet: ContextPacket): ContextPacket => {
  if (packet.inputCharCount <= packet.budget.maxInputChars) return packet;

  const requiredInputs = packet.inputs.filter((input) =>
    input.kind === "intent" ||
    input.kind === "wiki-index" ||
    input.kind === "run-context-manifest" ||
    input.kind === "design-system" ||
    input.kind === "component-registry" ||
    input.kind === "tool-registry" ||
    input.kind === "style-guide"
  );
  const optionalInputs = packet.inputs.filter((input) => !requiredInputs.includes(input));
  const trimmedInputs: ContextPacketInput[] = [...requiredInputs];

  for (const input of optionalInputs) {
    const candidate = createContextPacket({
      ...packet,
      inputs: [...trimmedInputs, input]
    });
    if (candidate.inputCharCount > packet.budget.maxInputChars) {
      const compactInput: ContextPacketInput = {
        kind: input.kind,
        id: input.id,
        title: input.title,
        summary: input.summary || `Omitted long ${input.kind} content. Re-read by tool if needed.`
      };
      if (input.uri) compactInput.uri = input.uri;
      trimmedInputs.push({
        ...compactInput
      });
    } else {
      trimmedInputs.push(input);
    }
  }

  return createContextPacket({
    ...packet,
    inputs: trimmedInputs,
    retentionPolicy:
      packet.retentionPolicy === "full-record" ? "bounded-transcript" : packet.retentionPolicy
  });
};

export const createDryRunSubAgentExecutor = (
  options: { clock?: ToolClock } = {}
): SubAgentExecutor => {
  const clock = options.clock ?? systemClock;
  return {
    async execute(trace: SubAgentTrace): Promise<SubAgentTrace> {
      const startedAt = trace.startedAt ?? clock.now();
      const finishedAt = clock.now();
      return {
        ...trace,
        status: "skipped",
        startedAt,
        finishedAt,
        result: trace.result ?? createSkippedSubAgentResult(trace, finishedAt)
      };
    }
  };
};

export const createRoleBasedSubAgentExecutor = (
  options: RoleBasedSubAgentExecutorOptions
): SubAgentExecutor => {
  const fallback = options.fallback ?? createDryRunSubAgentExecutor();
  return {
    execute(trace) {
      const executor = options.executors[trace.role] ?? fallback;
      return executor.execute(trace);
    }
  };
};

export const createModelBackedSubAgentExecutor = (
  options: ModelBackedSubAgentExecutorOptions
): SubAgentExecutor => ({
  execute: (trace) => executeModelBackedSubAgentTrace(trace, options)
});

export const createOpenAICompatibleSubAgentExecutor = (
  options: OpenAICompatibleSubAgentExecutorOptions
): SubAgentExecutor => {
  const {
    toolRegistry,
    clock,
    maxToolRounds,
    ...runtimeOptions
  } = options;
  const executorOptions: ModelBackedSubAgentExecutorOptions = {
    agentRuntime: createOpenAICompatibleAgentRuntime(runtimeOptions)
  };
  if (toolRegistry) executorOptions.toolRegistry = toolRegistry;
  if (clock) executorOptions.clock = clock;
  if (maxToolRounds !== undefined) executorOptions.maxToolRounds = maxToolRounds;
  return createModelBackedSubAgentExecutor(executorOptions);
};

export const createOpenAIResponsesSubAgentExecutor = (
  options: OpenAIResponsesSubAgentExecutorOptions
): SubAgentExecutor => {
  const {
    toolRegistry,
    clock,
    maxToolRounds,
    ...runtimeOptions
  } = options;
  const executorOptions: ModelBackedSubAgentExecutorOptions = {
    agentRuntime: createOpenAIResponsesAgentRuntime(runtimeOptions)
  };
  if (toolRegistry) executorOptions.toolRegistry = toolRegistry;
  if (clock) executorOptions.clock = clock;
  if (maxToolRounds !== undefined) executorOptions.maxToolRounds = maxToolRounds;
  return createModelBackedSubAgentExecutor(executorOptions);
};

export const createOpenAICompatibleAgentRuntime = (
  options: OpenAICompatibleAgentRuntimeOptions
): AgentRuntime => ({
  async complete(request: ModelRequest): Promise<ModelResponse> {
    const fetchImplementation = options.fetchImplementation ?? fetch;
    const body: Record<string, unknown> = {
      model: options.model,
      messages: request.messages.map(toOpenAIMessage),
      stream: false
    };
    if (request.tools.length > 0) body.tools = request.tools.map(toOpenAITool);
    if (request.responseFormat === "json_object") body.response_format = { type: "json_object" };

    const response = await fetchImplementation(`${options.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
        ...(options.extraHeaders ?? {})
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Model request failed with HTTP ${response.status}: ${text.slice(0, 240)}`);
    }

    const data = (await response.json()) as OpenAIChatCompletionResponse;
    const choice = data.choices?.[0];
    const message = choice?.message;
    const requestedToolCalls = (message?.tool_calls ?? []).flatMap((toolCall, index) => {
      if (toolCall.type !== "function") return [];
      return [
        {
          id: toolCall.id || `tool_call_${index + 1}`,
          toolName: toolCall.function.name,
          input: parseToolArguments(toolCall.function.arguments)
        }
      ];
    });

    return {
      message: {
        role: "assistant",
        content: readOpenAIMessageContent(message?.content),
        toolCalls: requestedToolCalls
      },
      requestedToolCalls
    };
  }
});

export const createOpenAIResponsesAgentRuntime = (
  options: OpenAIResponsesAgentRuntimeOptions
): AgentRuntime => ({
  async complete(request: ModelRequest): Promise<ModelResponse> {
    const fetchImplementation = options.fetchImplementation ?? fetch;
    const body: Record<string, unknown> = {
      model: options.model,
      input: toOpenAIResponsesInput(request),
      stream: false,
      store: options.store ?? false
    };
    if (request.tools.length > 0) body.tools = request.tools.map(toOpenAIResponsesTool);
    if (options.maxOutputTokens !== undefined) body.max_output_tokens = options.maxOutputTokens;

    const response = await fetchImplementation(`${options.baseUrl.replace(/\/+$/, "")}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${options.apiKey}`,
        ...(options.extraHeaders ?? {})
      },
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Responses model request failed with HTTP ${response.status}: ${text.slice(0, 240)}`);
    }

    const data = (await response.json()) as OpenAIResponsesResponse;
    const requestedToolCalls = readOpenAIResponsesToolCalls(data);

    return {
      message: {
        role: "assistant",
        content: readOpenAIResponsesText(data),
        toolCalls: requestedToolCalls
      },
      requestedToolCalls
    };
  }
});

export const executeModelBackedSubAgentTrace = async (
  trace: SubAgentTrace,
  options: ModelBackedSubAgentExecutorOptions
): Promise<SubAgentTrace> => {
  const clock = options.clock ?? systemClock;
  const startedAt = clock.now();
  const maxToolRounds = options.maxToolRounds ?? 4;
  const allowedToolNames = new Set(trace.packet.allowedToolNames ?? []);
  const availableTools = options.toolRegistry
    ? options.toolRegistry
        .list()
        .filter((tool) => allowedToolNames.size === 0 || allowedToolNames.has(tool.name))
    : [];
  const messages = createSubAgentMessages(trace.packet);
  const toolCalls: ToolExecutionRecord[] = [];
  let finalMessage: AgentMessage | undefined;

  try {
    for (let round = 0; round < maxToolRounds; round += 1) {
      const response = await options.agentRuntime.complete({
        messages,
        tools: availableTools
      });
      finalMessage = response.message;
      messages.push(response.message);

      if (response.requestedToolCalls.length === 0) break;

      const remainingToolCalls = Math.max(0, trace.packet.budget.maxToolCalls - toolCalls.length);
      const requestedCalls = response.requestedToolCalls.slice(0, remainingToolCalls);
      if (requestedCalls.length === 0) break;

      for (const call of requestedCalls) {
        const toolOptions: {
          allowedToolNames: Set<string>;
          toolRegistry?: ToolRegistry;
          clock: ToolClock;
        } = {
          allowedToolNames,
          clock
        };
        if (options.toolRegistry) toolOptions.toolRegistry = options.toolRegistry;
        const record = await executeBoundedToolCall(call, toolOptions);
        toolCalls.push(record);
        messages.push({
          role: "tool",
          name: call.toolName,
          toolCallId: call.id,
          content: JSON.stringify({
            callId: record.callId,
            status: record.status,
            output: record.output,
            error: record.error
          })
        });
      }
    }

    const result = createSubAgentResultFromMessage({
      trace,
      content: finalMessage?.content ?? "",
      status: "completed",
      toolCalls
    });
    return {
      ...trace,
      status: "completed",
      startedAt,
      finishedAt: clock.now(),
      result
    };
  } catch (error) {
    return {
      ...trace,
      status: "failed",
      startedAt,
      finishedAt: clock.now(),
      result: {
        id: `${trace.id}_result`,
        role: trace.role,
        status: "failed",
        summary: error instanceof Error ? error.message : String(error),
        decisions: [],
        artifacts: [],
        evidenceRefs: [],
        artifactRefs: [],
        mustCarryForwardRefs: uniqueStrings([
          `context-packet:${trace.packet.id}`,
          ...(trace.packet.requiredCarryForwardRefs ?? [])
        ]),
        discardableContext: [],
        contextDeltas: [
          {
            action: "keep",
            targetId: `context-packet:${trace.packet.id}`,
            summary: "Keep the input packet because model-backed execution failed.",
            reason: "A later recovery pass needs the exact delegated context."
          }
        ],
        toolCalls
      }
    };
  }
};

function createSkippedSubAgentResult(trace: SubAgentTrace, observedAt: string): SubAgentResult {
  const mustCarryForwardRefs = uniqueStrings([
    `context-packet:${trace.packet.id}`,
    ...(trace.packet.requiredCarryForwardRefs ?? [])
  ]);
  return {
    id: `${trace.id}_result`,
    role: trace.role,
    status: "skipped",
    summary:
      "Sub-agent execution is in dry-run mode. The packet is preserved as the bounded context contract for a future worker.",
    decisions: [],
    artifacts: [
      {
        id: `${trace.id}_packet_artifact`,
        kind: "summary",
        title: `${trace.packet.role} packet`,
        summary: `Prepared context packet ${trace.packet.id} at ${observedAt}.`,
        ref: `context-packet:${trace.packet.id}`
      }
    ],
    evidenceRefs: trace.packet.inputs
      .filter((input) => input.kind === "source-excerpt" || input.kind === "wiki-page" || input.kind === "wiki-index")
      .map((input) => `${input.kind}:${input.id}`),
    artifactRefs: uniqueStrings([`context-packet:${trace.packet.id}`, ...(trace.packet.requiredCarryForwardRefs ?? [])]),
    mustCarryForwardRefs,
    discardableContext: ["Dry-run execution result can be replaced when a real sub-agent executor runs."],
    contextDeltas: [
      {
        action: "keep",
        targetId: `context-packet:${trace.packet.id}`,
        summary: `Keep packet ${trace.packet.id}.`,
        reason: "Future execution should use packet refs instead of relying on full conversation memory."
      }
    ],
    toolCalls: []
  };
}

function createSubAgentMessages(packet: ContextPacket): AgentMessage[] {
  return [
    {
      role: "system",
      content: [
        "You are a bounded sub-agent inside Personal Wiki Harness.",
        "Work only from the provided context packet and allowed tools.",
        "Do not invent hidden context. Preserve evidenceRefs, artifactRefs, and mustCarryForwardRefs.",
        "Return a JSON object with summary, decisions, artifacts, evidenceRefs, artifactRefs, mustCarryForwardRefs, discardableContext, and contextDeltas.",
        "Artifacts may include data for structured outputs such as build-spec, content-model, design-usage-plan, site-plan, review-report, or html.",
        ...createRoleOutputInstructions(packet)
      ].join("\n")
    },
    {
      role: "user",
      content: JSON.stringify({
        id: packet.id,
        role: packet.role,
        workflowPhaseId: packet.workflowPhaseId,
        goal: packet.goal,
        instructions: packet.instructions,
        allowedToolNames: packet.allowedToolNames ?? [],
        requiredOutputNames: packet.requiredOutputNames ?? [],
        requiredCarryForwardRefs: packet.requiredCarryForwardRefs ?? [],
        outputContract: packet.outputContract,
        inputs: packet.inputs,
        budget: packet.budget,
        retentionPolicy: packet.retentionPolicy
      })
    }
  ];
}

function createRoleOutputInstructions(packet: ContextPacket): string[] {
  if (packet.role === "conversation-agent") {
    return [
      "For conversation-agent, clarify the user's site goal, audience, style, selected knowledge base, and hard constraints.",
      "If the packet already contains a complete build intent, summarize it as a build-spec artifact instead of asking more questions.",
      "Do not expose internal harness, model, or agent topology language to the end user."
    ];
  }

  if (packet.role === "builder-agent") {
    return [
      "For builder-agent, produce the full build handoff in one pass when possible: content-model, design-usage-plan, site-plan, and html artifacts.",
      "Before final planning, use readWikiIndex or searchWiki to ground content in the selected knowledge base.",
      "Before final design decisions, use recommendDesignAssets or searchDesignAssets when those tools are allowed.",
      "If you select a UI design asset, use readDesignAsset when available so constraints and provider refs are understood.",
      "The design-usage-plan artifact must explain selectedAssets with assetId, role, targetSectionIds, reason, and constraints.",
      "The content-model artifact must use kind \"content-model\" and data with: title, thesis, audience, sourcePageIds, sections.",
      "Each section must include: id, title, purpose, sourceEntityIds, sourcePageIds, contentBlocks, and may include designAssetRefs/componentRefs.",
      "The site-plan artifact must use kind \"site-plan\" and data with: routes and navigation.",
      "The html artifact must include a complete public-facing HTML document.",
      "Only reference page, entity, section, and design asset ids that appeared in the packet or tool results.",
      "Do not expose internal harness, agent, workflow, or model-routing language in user-facing HTML."
    ];
  }

  if (packet.role === "review-agent") {
    return [
      "For review-agent, inspect grounding, design asset usage, public-facing language, responsive layout risk, and publish readiness.",
      "Return a review-report artifact with status, blockingIssues, warnings, and patchRequest when useful.",
      "Block missing site artifacts, missing knowledge grounding, missing design-usage-plan, unknown design refs, or internal system-language leaks."
    ];
  }

  if (packet.role === "site-planner") {
    return [
      "For site-planner, include a content-model artifact and a site-plan artifact when possible.",
      "Before final planning, use recommendDesignAssets or searchDesignAssets when those tools are allowed.",
      "If you select a UI design asset, readDesignAsset should be used when available so constraints and provider refs are understood.",
      "The content-model artifact must use kind \"content-model\" and data with: title, thesis, audience, sourcePageIds, sections.",
      "Each section must include: id, title, purpose, sourceEntityIds, sourcePageIds, contentBlocks, and may include designAssetRefs/componentRefs.",
      "Content block kinds are markdown, entity-list, or timeline.",
      "The site-plan artifact must use kind \"site-plan\" and data with: routes and navigation.",
      "Only reference page, entity, section, and design asset ids that appeared in the packet or tool results."
    ];
  }

  if (packet.role === "site-compiler") {
    return [
      "For site-compiler, produce an html artifact when possible, and preserve refs to the content-model and site-plan artifacts you used.",
      "When content-model or site-plan includes designAssetRefs/componentRefs, use readDesignAsset when allowed before implementing the HTML.",
      "Use selected design assets as presentation constraints and implementation hints; do not let them invent content.",
      "Do not expose internal harness, agent, or model-routing language in user-facing HTML."
    ];
  }

  return [];
}

async function executeBoundedToolCall(
  call: RequestedToolCall,
  options: {
    allowedToolNames: Set<string>;
    toolRegistry?: ToolRegistry;
    clock: ToolClock;
  }
): Promise<ToolExecutionRecord> {
  const startedAt = options.clock.now();
  if (options.allowedToolNames.size > 0 && !options.allowedToolNames.has(call.toolName)) {
    return {
      callId: call.id,
      toolName: call.toolName,
      input: call.input,
      output: null,
      error: `Tool ${call.toolName} is not allowed by this context packet.`,
      startedAt,
      finishedAt: options.clock.now(),
      status: "failed"
    };
  }

  if (!options.toolRegistry) {
    return {
      callId: call.id,
      toolName: call.toolName,
      input: call.input,
      output: null,
      error: "No tool registry was provided for sub-agent execution.",
      startedAt,
      finishedAt: options.clock.now(),
      status: "failed"
    };
  }

  return options.toolRegistry.execute(call);
}

function createSubAgentResultFromMessage(input: {
  trace: SubAgentTrace;
  content: string;
  status: Exclude<SubAgentStatus, "queued" | "running">;
  toolCalls: ToolExecutionRecord[];
}): SubAgentResult {
  const parsed = parseStructuredSubAgentOutput(input.content);
  const summary = parsed.summary || input.content.trim() || "Sub-agent completed without a prose summary.";
  const mustCarryForwardRefs = uniqueStrings([
    `context-packet:${input.trace.packet.id}`,
    ...(input.trace.packet.requiredCarryForwardRefs ?? []),
    ...parsed.mustCarryForwardRefs
  ]);

  return {
    id: `${input.trace.id}_result`,
    role: input.trace.role,
    status: input.status,
    summary,
    decisions: parsed.decisions,
    artifacts: parsed.artifacts,
    evidenceRefs: parsed.evidenceRefs,
    artifactRefs: parsed.artifactRefs,
    mustCarryForwardRefs,
    discardableContext: parsed.discardableContext,
    contextDeltas: parsed.contextDeltas.length
      ? parsed.contextDeltas
      : [
          {
            action: "keep",
            targetId: `context-packet:${input.trace.packet.id}`,
            summary: `Keep packet ${input.trace.packet.id}.`,
            reason: "The model output did not provide a replacement context delta."
          }
        ],
    toolCalls: input.toolCalls
  };
}

type ParsedSubAgentOutput = {
  summary: string;
  decisions: string[];
  artifacts: SubAgentArtifact[];
  evidenceRefs: string[];
  artifactRefs: string[];
  mustCarryForwardRefs: string[];
  discardableContext: string[];
  contextDeltas: ContextDelta[];
};

function parseStructuredSubAgentOutput(content: string): ParsedSubAgentOutput {
  const object = parseJsonObject(content);
  if (!object) {
    return emptyParsedSubAgentOutput();
  }

  return {
    summary: getStringField(object, "summary"),
    decisions: getStringArrayField(object, "decisions"),
    artifacts: getArtifactArrayField(object, "artifacts"),
    evidenceRefs: getStringArrayField(object, "evidenceRefs"),
    artifactRefs: getStringArrayField(object, "artifactRefs"),
    mustCarryForwardRefs: getStringArrayField(object, "mustCarryForwardRefs"),
    discardableContext: getStringArrayField(object, "discardableContext"),
    contextDeltas: getContextDeltaArrayField(object, "contextDeltas")
  };
}

function emptyParsedSubAgentOutput(): ParsedSubAgentOutput {
  return {
    summary: "",
    decisions: [],
    artifacts: [],
    evidenceRefs: [],
    artifactRefs: [],
    mustCarryForwardRefs: [],
    discardableContext: [],
    contextDeltas: []
  };
}

function parseJsonObject(content: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(content);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace < 0 || lastBrace <= firstBrace) return undefined;
    try {
      const parsed: unknown = JSON.parse(content.slice(firstBrace, lastBrace + 1));
      return isRecord(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
}

type OpenAIChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
      tool_calls?: Array<{
        id?: string;
        type?: string;
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
  }>;
};

type OpenAIResponsesResponse = {
  output_text?: string;
  output?: unknown[];
};

function toOpenAIMessage(message: AgentMessage): Record<string, unknown> {
  const output: Record<string, unknown> = {
    role: message.role,
    content: message.content
  };
  if (message.name) output.name = message.name;
  if (message.toolCallId) output.tool_call_id = message.toolCallId;
  if (message.toolCalls?.length) {
    output.tool_calls = message.toolCalls.map((toolCall) => ({
      id: toolCall.id,
      type: "function",
      function: {
        name: toolCall.toolName,
        arguments: JSON.stringify(toolCall.input ?? {})
      }
    }));
  }
  return output;
}

function toOpenAITool(tool: Omit<ToolDefinition, "execute">): Record<string, unknown> {
  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema
    }
  };
}

function toOpenAIResponsesInput(request: ModelRequest): string {
  const transcript = request.messages.map(toOpenAIResponsesTranscriptMessage).join("\n\n");
  if (request.responseFormat !== "json_object") return transcript;
  return [
    transcript,
    "Return only one valid JSON object. Do not wrap it in Markdown and do not add prose before or after it."
  ].join("\n\n");
}

function toOpenAIResponsesTranscriptMessage(message: AgentMessage): string {
  const label = message.role.toUpperCase();
  const toolCalls = message.toolCalls?.length
    ? `\nRequested tool calls: ${JSON.stringify(message.toolCalls)}`
    : "";
  if (message.role === "tool") {
    const name = message.name ? ` ${message.name}` : "";
    const callId = message.toolCallId ? ` call_id=${message.toolCallId}` : "";
    return `[TOOL_RESULT${name}${callId}]\n${message.content}`;
  }
  return `[${label}]\n${message.content}${toolCalls}`;
}

function toOpenAIResponsesTool(tool: Omit<ToolDefinition, "execute">): Record<string, unknown> {
  return {
    type: "function",
    name: tool.name,
    description: tool.description,
    parameters: tool.inputSchema
  };
}

function readOpenAIMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!isRecord(part)) return "";
      return typeof part.text === "string" ? part.text : "";
    })
    .join("");
}

function readOpenAIResponsesText(data: OpenAIResponsesResponse): string {
  if (typeof data.output_text === "string") return data.output_text;
  if (!Array.isArray(data.output)) return "";
  return data.output.map(readOpenAIResponsesOutputText).join("");
}

function readOpenAIResponsesOutputText(item: unknown): string {
  if (!isRecord(item)) return "";
  if (typeof item.text === "string") return item.text;
  const content = item.content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!isRecord(part)) return "";
      if (typeof part.text === "string") return part.text;
      if (typeof part.content === "string") return part.content;
      return "";
    })
    .join("");
}

function readOpenAIResponsesToolCalls(data: OpenAIResponsesResponse): RequestedToolCall[] {
  if (!Array.isArray(data.output)) return [];
  return data.output.flatMap((item, index) => readOpenAIResponsesToolCall(item, index));
}

function readOpenAIResponsesToolCall(item: unknown, index: number): RequestedToolCall[] {
  if (!isRecord(item)) return [];
  if (item.type !== "function_call") return [];
  const name = typeof item.name === "string" ? item.name : "";
  if (!name) return [];
  const rawArguments = item.arguments;
  const callId =
    typeof item.call_id === "string" ? item.call_id : typeof item.id === "string" ? item.id : `response_call_${index + 1}`;
  return [
    {
      id: callId,
      toolName: name,
      input: typeof rawArguments === "string" ? parseToolArguments(rawArguments) : rawArguments ?? {}
    }
  ];
}

function parseToolArguments(value: string): unknown {
  if (!value.trim()) return {};
  try {
    return JSON.parse(value);
  } catch {
    return {
      raw: value
    };
  }
}

function getStringField(object: Record<string, unknown>, field: string): string {
  const value = object[field];
  return typeof value === "string" ? value : "";
}

function getStringArrayField(object: Record<string, unknown>, field: string): string[] {
  const value = object[field];
  if (!Array.isArray(value)) return [];
  return uniqueStrings(value.filter((item): item is string => typeof item === "string"));
}

function getArtifactArrayField(object: Record<string, unknown>, field: string): SubAgentArtifact[] {
  const value = object[field];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const kind = getArtifactKind(item.kind);
    const title = typeof item.title === "string" ? item.title : `Artifact ${index + 1}`;
    const summary = typeof item.summary === "string" ? item.summary : "";
    const artifact: SubAgentArtifact = {
      id: typeof item.id === "string" ? item.id : `artifact_${index + 1}`,
      kind,
      title,
      summary
    };
    if (typeof item.ref === "string") artifact.ref = item.ref;
    if ("data" in item) artifact.data = item.data;
    return [artifact];
  });
}

function getContextDeltaArrayField(object: Record<string, unknown>, field: string): ContextDelta[] {
  const value = object[field];
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!isRecord(item)) return [];
    const action = getContextDeltaAction(item.action);
    const targetId = typeof item.targetId === "string" ? item.targetId : `context-delta-target-${index + 1}`;
    const summary = typeof item.summary === "string" ? item.summary : "";
    const reason = typeof item.reason === "string" ? item.reason : "";
    return [
      {
        action,
        targetId,
        summary,
        reason
      }
    ];
  });
}

function getArtifactKind(value: unknown): SubAgentArtifact["kind"] {
  if (
    value === "summary" ||
    value === "build-spec" ||
    value === "content-model" ||
    value === "design-usage-plan" ||
    value === "site-plan" ||
    value === "ontology-extraction" ||
    value === "html" ||
    value === "lint-report" ||
    value === "review-report" ||
    value === "tool-trace"
  ) {
    return value;
  }
  return "summary";
}

function getContextDeltaAction(value: unknown): ContextDelta["action"] {
  if (
    value === "keep" ||
    value === "drop" ||
    value === "replace-with-summary" ||
    value === "promote-to-wiki" ||
    value === "promote-to-system-skill"
  ) {
    return value;
  }
  return "keep";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.trim()))];
}

const systemClock: ToolClock = {
  now: () => new Date().toISOString()
};

export const createToolRegistry = (
  tools: ToolDefinition[],
  options: { clock?: ToolClock } = {}
): ToolRegistry => {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  const clock = options.clock ?? systemClock;

  return {
    list() {
      return tools.map(({ execute: _execute, ...definition }) => definition);
    },
    get(name: string) {
      return byName.get(name);
    },
    async execute(call: RequestedToolCall): Promise<ToolExecutionRecord> {
      const startedAt = clock.now();
      const tool = byName.get(call.toolName);
      if (!tool) {
        return {
          callId: call.id,
          toolName: call.toolName,
          input: call.input,
          output: null,
          error: `Unknown tool: ${call.toolName}`,
          startedAt,
          finishedAt: clock.now(),
          status: "failed"
        };
      }

      try {
        const output = await tool.execute(call.input);
        return {
          callId: call.id,
          toolName: call.toolName,
          input: call.input,
          output,
          startedAt,
          finishedAt: clock.now(),
          status: "completed"
        };
      } catch (error) {
        return {
          callId: call.id,
          toolName: call.toolName,
          input: call.input,
          output: null,
          error: error instanceof Error ? error.message : String(error),
          startedAt,
          finishedAt: clock.now(),
          status: "failed"
        };
      }
    }
  };
};

export const loadFileSystemAgent = async (agentDir: string): Promise<LoadedFileSystemAgent> => {
  const [{ promises: fs }, pathModule, urlModule] = await Promise.all([
    import("node:fs"),
    import("node:path"),
    import("node:url")
  ]);
  const agentModulePath = pathModule.join(agentDir, "agent.ts");
  const instructionsPath = pathModule.join(agentDir, "instructions.md");
  const mod = (await import(urlModule.pathToFileURL(agentModulePath).href)) as {
    agent: FileSystemAgentDefinition;
  };
  const instructions = await fs.readFile(instructionsPath, "utf8");
  const localTools = await listAgentLocalBasenames(pathModule.join(agentDir, "tools"), ".ts");
  const localSkills = await listAgentLocalBasenames(pathModule.join(agentDir, "skills"), ".md");
  const localEvals = await listAgentLocalBasenames(pathModule.join(agentDir, "evals"), ".json");
  const validationIssues = await validateFileSystemAgentDirectory(agentDir, mod.agent, localTools);

  return {
    definition: mod.agent,
    rootDir: agentDir,
    instructions,
    localTools,
    localSkills,
    localEvals,
    validationIssues
  };
};

export const listFileSystemAgentIds = async (agentsRoot: string): Promise<string[]> => {
  const { promises: fs } = await import("node:fs");
  const entries = await fs.readdir(agentsRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
};

export const createScopedToolRegistry = (
  agent: LoadedFileSystemAgent,
  tools: ToolDefinition[]
): ScopedToolRegistryResult => {
  const skipped: ScopedToolRegistryResult["skipped"] = [];
  const declaredTools = new Set(agent.definition.tools);
  const permissions = new Set(agent.definition.permissions);
  const scopedTools = tools.filter((tool) => {
    if (!declaredTools.has(tool.name)) {
      skipped.push({ name: tool.name, reason: "not declared by agent" });
      return false;
    }
    const missingPermission = (tool.permissions ?? []).find((permission) => !permissions.has(permission));
    if (missingPermission) {
      skipped.push({ name: tool.name, reason: `missing permission ${missingPermission}` });
      return false;
    }
    return true;
  });

  return {
    registry: createToolRegistry(scopedTools),
    skipped
  };
};

const listAgentLocalBasenames = async (dir: string, extension: string): Promise<string[]> => {
  const { promises: fs } = await import("node:fs");
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
};

const validateFileSystemAgentDirectory = async (
  agentDir: string,
  agent: FileSystemAgentDefinition,
  localTools: string[]
): Promise<AgentValidationIssue[]> => {
  const pathModule = await import("node:path");
  const issues: AgentValidationIssue[] = [];
  const localToolSet = new Set(localTools);

  for (const tool of agent.tools) {
    if (!localToolSet.has(tool)) {
      issues.push({
        severity: "warning",
        message: `Declared tool '${tool}' has no local tools/${tool}.ts file.`
      });
    }
  }

  for (const subagent of agent.subagents) {
    const nestedSubagentDir = pathModule.join(agentDir, "subagents", subagent);
    const siblingSubagentDir = pathModule.join(pathModule.dirname(agentDir), subagent);
    if (!(await hasAgentFiles(nestedSubagentDir)) && !(await hasAgentFiles(siblingSubagentDir))) {
      issues.push({
        severity: "error",
        message: `Declared subagent '${subagent}' is missing agent.ts or instructions.md.`
      });
    }
  }

  return issues;
};

const hasAgentFiles = async (agentDir: string): Promise<boolean> => {
  const [{ promises: fs }, pathModule] = await Promise.all([import("node:fs"), import("node:path")]);
  try {
    await fs.access(pathModule.join(agentDir, "agent.ts"));
    await fs.access(pathModule.join(agentDir, "instructions.md"));
    return true;
  } catch {
    return false;
  }
};
