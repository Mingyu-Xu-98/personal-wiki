import {
  createOpenAICompatibleAgentRuntime,
  createOpenAICompatibleSubAgentExecutor,
  createOpenAIResponsesAgentRuntime,
  createOpenAIResponsesSubAgentExecutor,
  type AgentRuntime,
  type ModelRequest,
  type ModelResponse,
  type OpenAICompatibleSubAgentExecutorOptions,
  type OpenAIResponsesSubAgentExecutorOptions,
  type SubAgentExecutor,
  type ToolRegistry
} from "@personal-wiki-harness/agent-runtime";

export type StudioLlmUseCase =
  | "create-agent"
  | "wiki-curator"
  | "site-planner"
  | "site-builder"
  | "site-chatbot"
  | "summarizer"
  | "image-generation";

export type StudioLlmTier = "strong" | "balanced" | "small" | "image";

export type StudioLlmCapability = "chat" | "json" | "tool-use" | "image";

export type StudioLlmProviderId = "primary" | "economy" | "image";

export type StudioLlmWireApi = "chat-completions" | "responses";

export type StudioLlmRoute = {
  useCase: StudioLlmUseCase;
  label: string;
  tier: StudioLlmTier;
  providerId: StudioLlmProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
  wireApi: StudioLlmWireApi;
  enabled: boolean;
  capabilities: StudioLlmCapability[];
  reason: string;
};

export type PublicStudioLlmRoute = Omit<StudioLlmRoute, "apiKey" | "baseUrl"> & {
  providerConfigured: boolean;
  baseUrlConfigured: boolean;
};

export type PublicStudioLlmProvider = {
  id: StudioLlmProviderId;
  label: string;
  configured: boolean;
  baseUrlConfigured: boolean;
  wireApi: StudioLlmWireApi;
};

export type PublicStudioLlmRuntime = {
  providers: PublicStudioLlmProvider[];
  routes: PublicStudioLlmRoute[];
};

type ProviderConfig = {
  id: StudioLlmProviderId;
  label: string;
  baseUrl: string | undefined;
  apiKey: string | undefined;
  wireApi: StudioLlmWireApi;
};

const truthy = (value: string | undefined) =>
  value?.toLowerCase() === "1" ||
  value?.toLowerCase() === "true" ||
  value?.toLowerCase() === "yes" ||
  value?.toLowerCase() === "on";

const readPositiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const timeoutForUseCase = (useCase: StudioLlmUseCase) => {
  if (useCase === "site-planner" || useCase === "site-builder") {
    return readPositiveInt(process.env.PWH_SITE_AGENT_TIMEOUT_MS, readPositiveInt(process.env.PWH_LLM_TIMEOUT_MS, 20000));
  }
  return readPositiveInt(process.env.PWH_LLM_TIMEOUT_MS, 20000);
};

const maxOutputTokensForUseCase = (useCase: StudioLlmUseCase) => {
  if (useCase === "site-builder") return readPositiveInt(process.env.PWH_SITE_BUILDER_MAX_OUTPUT_TOKENS, 6000);
  if (useCase === "site-planner") return readPositiveInt(process.env.PWH_SITE_PLANNER_MAX_OUTPUT_TOKENS, 3000);
  return readPositiveInt(process.env.PWH_LLM_MAX_OUTPUT_TOKENS, 800);
};

const createTimeoutFetch =
  (timeoutMs: number): typeof fetch =>
  async (input, init) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal
      });
    } catch (error) {
      if (controller.signal.aborted) {
        throw new Error(`Model request timed out after ${timeoutMs}ms.`);
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  };

const createAgentRuntimeForRoute = (route: StudioLlmRoute, useCase: StudioLlmUseCase): AgentRuntime => {
  const commonOptions = {
    baseUrl: route.baseUrl,
    apiKey: route.apiKey,
    model: route.model,
    fetchImplementation: createTimeoutFetch(timeoutForUseCase(useCase))
  };
  if (route.wireApi === "responses") {
    return createOpenAIResponsesAgentRuntime({
      ...commonOptions,
      maxOutputTokens: maxOutputTokensForUseCase(useCase)
    });
  }
  return createOpenAICompatibleAgentRuntime(commonOptions);
};

export const isStudioLlmUseCaseEnabled = (useCase: StudioLlmUseCase): boolean => {
  if (useCase === "wiki-curator") return truthy(process.env.PWH_WIKI_CURATOR_ENABLED);
  if (useCase === "site-planner" || useCase === "site-builder") return truthy(process.env.PWH_SITE_AGENTS_ENABLED);
  if (useCase === "image-generation") return truthy(process.env.PWH_IMAGE_GENERATION_ENABLED);
  return true;
};

export const resolveStudioLlmRoute = (useCase: StudioLlmUseCase): StudioLlmRoute | undefined => {
  const providers = readProviders();
  const routeSpec = routeSpecs[useCase];
  const provider = chooseProvider(routeSpec.providerPreference, providers);
  return provider ? createRouteForProvider(useCase, routeSpec, provider) : undefined;
};

const resolveStudioLlmRoutes = (useCase: StudioLlmUseCase): StudioLlmRoute[] => {
  const providers = readProviders();
  const routeSpec = routeSpecs[useCase];
  return routeSpec.providerPreference.flatMap((providerId) => {
    const provider = providers[providerId];
    return provider ? createRouteForProvider(useCase, routeSpec, provider) ?? [] : [];
  });
};

const createRouteForProvider = (
  useCase: StudioLlmUseCase,
  routeSpec: (typeof routeSpecs)[StudioLlmUseCase],
  provider: ProviderConfig
): StudioLlmRoute | undefined => {
  if (!provider.baseUrl || !provider.apiKey) return undefined;
  const model = resolveModel(useCase, provider.id);
  if (!model) return undefined;

  return {
    useCase,
    label: routeSpec.label,
    tier: routeSpec.tier,
    providerId: provider.id,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model,
    wireApi: provider.wireApi,
    enabled: isStudioLlmUseCaseEnabled(useCase),
    capabilities: routeSpec.capabilities,
    reason: routeSpec.reason
  };
};

export const createStudioAgentRuntime = (useCase: StudioLlmUseCase): AgentRuntime | undefined => {
  const route = resolveStudioLlmRoute(useCase);
  if (!route?.enabled) return undefined;
  return createAgentRuntimeForRoute(route, useCase);
};

export const completeStudioChat = async (
  useCase: StudioLlmUseCase,
  request: ModelRequest
): Promise<ModelResponse | undefined> => {
  const routes = resolveStudioLlmRoutes(useCase).filter((route) => route.enabled);
  if (!routes.length) return undefined;

  let lastError: unknown;
  for (const route of routes) {
    const runtime = createAgentRuntimeForRoute(route, useCase);
    try {
      return await completeWithJsonRetry(runtime, useCase, request);
    } catch (error) {
      lastError = error;
      console.warn(
        `[llm-client] ${useCase} route ${route.providerId}/${route.model} failed; trying next configured route if available.`,
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError ?? "LLM request failed"));
};

const completeWithJsonRetry = async (
  runtime: AgentRuntime,
  useCase: StudioLlmUseCase,
  request: ModelRequest
): Promise<ModelResponse> => {
  try {
    return await runtime.complete(request);
  } catch (error) {
    if (!request.responseFormat) throw error;
    console.warn(
      `[llm-client] ${useCase} JSON-preferred request failed; retrying without the JSON preference.`,
      error instanceof Error ? error.message : String(error)
    );
    const retryRequest: ModelRequest = {
      messages: request.messages,
      tools: request.tools
    };
    return runtime.complete(retryRequest);
  }
};

export const createStudioSubAgentExecutor = (
  useCase: Extract<StudioLlmUseCase, "wiki-curator" | "site-planner" | "site-builder">,
  options: {
    toolRegistry?: ToolRegistry;
    maxToolRounds?: number;
  } = {}
): SubAgentExecutor | undefined => {
  const route = resolveStudioLlmRoute(useCase);
  if (!route?.enabled) return undefined;

  const commonOptions = {
    baseUrl: route.baseUrl,
    apiKey: route.apiKey,
    model: route.model,
    fetchImplementation: createTimeoutFetch(timeoutForUseCase(useCase))
  };
  if (route.wireApi === "responses") {
    const executorOptions: OpenAIResponsesSubAgentExecutorOptions = {
      ...commonOptions,
      maxOutputTokens: maxOutputTokensForUseCase(useCase)
    };
    if (options.toolRegistry) executorOptions.toolRegistry = options.toolRegistry;
    if (options.maxToolRounds !== undefined) executorOptions.maxToolRounds = options.maxToolRounds;
    return createOpenAIResponsesSubAgentExecutor(executorOptions);
  }

  const executorOptions: OpenAICompatibleSubAgentExecutorOptions = commonOptions;
  if (options.toolRegistry) executorOptions.toolRegistry = options.toolRegistry;
  if (options.maxToolRounds !== undefined) executorOptions.maxToolRounds = options.maxToolRounds;
  return createOpenAICompatibleSubAgentExecutor(executorOptions);
};

export const getPublicStudioLlmRuntime = (): PublicStudioLlmRuntime => {
  const providers = readProviders();
  const providerStates = Object.values(providers).map((provider) => ({
    id: provider.id,
    label: provider.label,
    configured: Boolean(provider.baseUrl && provider.apiKey),
    baseUrlConfigured: Boolean(provider.baseUrl),
    wireApi: provider.wireApi
  }));
  const routes = (Object.keys(routeSpecs) as StudioLlmUseCase[]).map((useCase) => {
    const spec = routeSpecs[useCase];
    const provider = chooseProvider(spec.providerPreference, providers);
    const providerId = provider?.id ?? spec.providerPreference[0] ?? "primary";
    const model = provider ? resolveModel(useCase, provider.id) : "";
    return {
      useCase,
      label: spec.label,
      tier: spec.tier,
      providerId,
      model: model || "",
      wireApi: provider?.wireApi ?? "chat-completions",
      enabled: Boolean(provider?.baseUrl && provider.apiKey && model && isStudioLlmUseCaseEnabled(useCase)),
      capabilities: spec.capabilities,
      reason: spec.reason,
      providerConfigured: Boolean(provider?.baseUrl && provider.apiKey),
      baseUrlConfigured: Boolean(provider?.baseUrl)
    };
  });

  return {
    providers: providerStates,
    routes
  };
};

const readProviders = (): Record<StudioLlmProviderId, ProviderConfig> => ({
  primary: {
    id: "primary",
    label: "Primary",
    baseUrl: clean(process.env.PWH_LLM_BASE_URL),
    apiKey: clean(process.env.PWH_LLM_API_KEY),
    wireApi: resolveWireApi(clean(process.env.PWH_LLM_WIRE_API), clean(process.env.PWH_LLM_BASE_URL))
  },
  economy: {
    id: "economy",
    label: "Economy",
    baseUrl: clean(process.env.PWH_ECONOMY_LLM_BASE_URL),
    apiKey: clean(process.env.PWH_ECONOMY_LLM_API_KEY),
    wireApi: resolveWireApi(clean(process.env.PWH_ECONOMY_LLM_WIRE_API), clean(process.env.PWH_ECONOMY_LLM_BASE_URL))
  },
  image: {
    id: "image",
    label: "Image",
    baseUrl: clean(process.env.PWH_IMAGE_LLM_BASE_URL),
    apiKey: clean(process.env.PWH_IMAGE_LLM_API_KEY),
    wireApi: resolveWireApi(clean(process.env.PWH_IMAGE_LLM_WIRE_API), clean(process.env.PWH_IMAGE_LLM_BASE_URL))
  }
});

const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed || undefined;
};

const resolveWireApi = (configured: string | undefined, baseUrl: string | undefined): StudioLlmWireApi => {
  const normalized = configured?.trim().toLowerCase().replace(/_/g, "-");
  if (normalized === "responses" || normalized === "response") return "responses";
  if (
    normalized === "chat" ||
    normalized === "chat-completions" ||
    normalized === "chat-completion" ||
    normalized === "openai-compatible"
  ) {
    return "chat-completions";
  }
  if (baseUrl && /code\.memect\.cn/i.test(baseUrl)) return "responses";
  return "chat-completions";
};

const chooseProvider = (
  preferences: StudioLlmProviderId[],
  providers: Record<StudioLlmProviderId, ProviderConfig>
): ProviderConfig | undefined =>
  preferences.map((id) => providers[id]).find((provider) => provider.baseUrl && provider.apiKey) ??
  (preferences[0] ? providers[preferences[0]] : undefined);

const resolveModel = (useCase: StudioLlmUseCase, providerId: StudioLlmProviderId): string => {
  if (useCase === "create-agent") {
    return firstValue(
      providerId === "economy" ? process.env.PWH_ECONOMY_CREATE_AGENT_MODEL : undefined,
      providerId === "economy" ? process.env.PWH_ECONOMY_CHAT_MODEL : undefined,
      process.env.PWH_CREATE_AGENT_MODEL,
      process.env.PWH_DEFAULT_CHAT_MODEL,
      "gpt-5.4"
    );
  }
  if (useCase === "wiki-curator") return firstValue(process.env.PWH_WIKI_CURATOR_MODEL, process.env.PWH_CREATE_AGENT_MODEL, "gpt-5.4");
  if (useCase === "site-planner") {
    return firstValue(
      providerId === "economy" ? process.env.PWH_ECONOMY_SITE_PLANNER_MODEL : undefined,
      providerId === "economy" ? process.env.PWH_ECONOMY_CHAT_MODEL : undefined,
      process.env.PWH_SITE_PLANNER_MODEL,
      process.env.PWH_CREATE_AGENT_MODEL,
      "gpt-5.4"
    );
  }
  if (useCase === "site-builder") {
    return firstValue(
      process.env.PWH_SITE_BUILDER_MODEL,
      providerId === "economy" ? process.env.PWH_ECONOMY_SITE_BUILDER_MODEL : undefined,
      providerId === "economy" ? process.env.PWH_ECONOMY_CHAT_MODEL : undefined,
      process.env.PWH_CREATE_AGENT_MODEL,
      "gpt-5.4"
    );
  }
  if (useCase === "site-chatbot") {
    return firstValue(
      process.env.PWH_SITE_CHATBOT_MODEL,
      providerId === "economy" ? process.env.PWH_ECONOMY_CHAT_MODEL : undefined,
      process.env.PWH_CREATE_AGENT_MODEL,
      "gpt-5.4"
    );
  }
  if (useCase === "summarizer") {
    return firstValue(
      process.env.PWH_SUMMARIZER_MODEL,
      providerId === "economy" ? process.env.PWH_ECONOMY_CHAT_MODEL : undefined,
      process.env.PWH_CREATE_AGENT_MODEL,
      "gpt-5.4"
    );
  }
  return firstValue(process.env.PWH_IMAGE_MODEL, "");
};

const firstValue = (...values: Array<string | undefined>): string => {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) return trimmed;
  }
  return "";
};

const routeSpecs: Record<
  StudioLlmUseCase,
  {
    label: string;
    tier: StudioLlmTier;
    providerPreference: StudioLlmProviderId[];
    capabilities: StudioLlmCapability[];
    reason: string;
  }
> = {
  "create-agent": {
    label: "Create Chat",
    tier: "strong",
    providerPreference: ["primary", "economy"],
    capabilities: ["chat", "json"],
    reason: "The create conversation decides user intent, audience, and style, so it uses the primary model first and falls back when that route is unavailable."
  },
  "wiki-curator": {
    label: "Wiki Curator",
    tier: "balanced",
    providerPreference: ["primary"],
    capabilities: ["chat", "json", "tool-use"],
    reason: "Wiki updates need source-grounded synthesis and stay behind human review."
  },
  "site-planner": {
    label: "Legacy Site Planner",
    tier: "strong",
    providerPreference: ["primary", "economy"],
    capabilities: ["chat", "json", "tool-use"],
    reason: "Compatibility route for older two-step site planning experiments. The canonical site build path now uses Builder Agent through the site-builder route."
  },
  "site-builder": {
    label: "Builder Agent",
    tier: "small",
    providerPreference: ["economy", "primary"],
    capabilities: ["chat", "json", "tool-use"],
    reason: "Builder Agent creates the content model, design usage plan, site plan, and HTML artifact behind deterministic verification, so it can use a cheaper model when quality is acceptable."
  },
  "site-chatbot": {
    label: "In-site Chatbot",
    tier: "small",
    providerPreference: ["economy", "primary"],
    capabilities: ["chat", "json"],
    reason: "Visitor chat should be fast, cheap, and scoped to already-selected site context."
  },
  summarizer: {
    label: "Summarizer",
    tier: "small",
    providerPreference: ["economy", "primary"],
    capabilities: ["chat", "json"],
    reason: "Summaries are high-volume and can be checked against source snippets."
  },
  "image-generation": {
    label: "Image Generation",
    tier: "image",
    providerPreference: ["image", "economy", "primary"],
    capabilities: ["image"],
    reason: "Image generation is isolated as a media capability so it can use a specialized low-cost provider."
  }
};
