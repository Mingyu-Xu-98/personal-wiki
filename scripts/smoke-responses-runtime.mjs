import assert from "node:assert/strict";

const {
  createOpenAIResponsesAgentRuntime,
  createOpenAIResponsesSubAgentExecutor,
  createToolRegistry
} = await import("../packages/agent-runtime/src/index.ts");

const calls = [];
const fetchImplementation = async (url, init) => {
  calls.push({
    url: String(url),
    body: JSON.parse(init.body)
  });

  return new Response(
    JSON.stringify({
      output_text: "{\"ok\":true}",
      output: [
        {
          type: "message",
          content: [{ type: "output_text", text: "{\"ok\":true}" }]
        }
      ]
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }
  );
};

const runtime = createOpenAIResponsesAgentRuntime({
  baseUrl: "https://example.test/v1",
  apiKey: "test-key",
  model: "gpt-5.4",
  fetchImplementation,
  maxOutputTokens: 120
});

const response = await runtime.complete({
  messages: [
    { role: "system", content: "Return JSON only." },
    { role: "user", content: "Ping." }
  ],
  tools: [
    {
      name: "readFile",
      description: "Read a file.",
      inputSchema: {
        type: "object",
        properties: { path: { type: "string" } },
        required: ["path"]
      }
    }
  ],
  responseFormat: "json_object"
});

assert.equal(response.message.content, "{\"ok\":true}");
assert.equal(calls[0].url, "https://example.test/v1/responses");
assert.equal(calls[0].body.model, "gpt-5.4");
assert.equal(calls[0].body.store, false);
assert.equal(calls[0].body.max_output_tokens, 120);
assert.equal(calls[0].body.tools[0].type, "function");
assert.equal(calls[0].body.tools[0].name, "readFile");
assert.match(calls[0].body.input, /Return only one valid JSON object/);

const toolRegistry = createToolRegistry([
  {
    name: "readFile",
    description: "Read a file.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"]
    },
    execute: async () => ({ content: "hello" })
  }
]);

const executor = createOpenAIResponsesSubAgentExecutor({
  baseUrl: "https://example.test/v1",
  apiKey: "test-key",
  model: "gpt-5.4",
  fetchImplementation,
  toolRegistry
});

assert.equal(typeof executor.execute, "function");

console.log(JSON.stringify({ ok: true, endpoint: calls[0].url, toolType: calls[0].body.tools[0].type }, null, 2));
