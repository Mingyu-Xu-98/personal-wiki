export interface ModelMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
}

export interface ModelGenerateInput {
  model: string;
  messages: ModelMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface ModelGenerateResult {
  content: string;
  provider: string;
  model: string;
}

export interface ModelAdapter {
  generate(input: ModelGenerateInput): Promise<ModelGenerateResult>;
}

export class DeterministicModelAdapter implements ModelAdapter {
  async generate(input: ModelGenerateInput): Promise<ModelGenerateResult> {
    return {
      content: "Deterministic model adapter response.",
      provider: "deterministic",
      model: input.model,
    };
  }
}

export class OpenAICompatibleModelAdapter implements ModelAdapter {
  constructor(private readonly config: {
    baseUrl: string;
    apiKey: string;
    provider: string;
  }) {}

  async generate(input: ModelGenerateInput): Promise<ModelGenerateResult> {
    const res = await fetch(`${this.config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: input.model,
        messages: input.messages,
        temperature: input.temperature ?? 0.2,
        max_tokens: input.maxTokens ?? 2048,
      }),
    });
    if (!res.ok) {
      throw new Error(`Model request failed: ${res.status} ${await res.text()}`);
    }
    const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> };
    return {
      content: json.choices?.[0]?.message?.content ?? "",
      provider: this.config.provider,
      model: input.model,
    };
  }
}

export function createModelAdapterFromEnv(): ModelAdapter {
  const siliconFlowKey = process.env.SILICONFLOW_API_KEY;
  if (siliconFlowKey) {
    return new OpenAICompatibleModelAdapter({
      baseUrl: process.env.SILICONFLOW_BASE_URL ?? "https://api.siliconflow.cn/v1",
      apiKey: siliconFlowKey,
      provider: "siliconflow",
    });
  }
  const openAICompatibleKey = process.env.OPENAI_COMPATIBLE_API_KEY;
  if (openAICompatibleKey) {
    return new OpenAICompatibleModelAdapter({
      baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL ?? "https://api.openai.com/v1",
      apiKey: openAICompatibleKey,
      provider: "openai-compatible",
    });
  }
  return new DeterministicModelAdapter();
}
