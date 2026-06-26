import assert from "node:assert/strict";

process.env.PWH_LLM_BASE_URL = "https://primary.example/v1";
process.env.PWH_LLM_API_KEY = "primary-key";
process.env.PWH_LLM_WIRE_API = "responses";
process.env.PWH_CREATE_AGENT_MODEL = "strong-chat";
process.env.PWH_WIKI_CURATOR_ENABLED = "true";
process.env.PWH_WIKI_CURATOR_MODEL = "balanced-wiki";
process.env.PWH_SITE_AGENTS_ENABLED = "true";
process.env.PWH_SITE_PLANNER_MODEL = "strong-planner";

process.env.PWH_ECONOMY_LLM_BASE_URL = "https://economy.example/v1";
process.env.PWH_ECONOMY_LLM_API_KEY = "economy-key";
process.env.PWH_ECONOMY_LLM_WIRE_API = "chat-completions";
process.env.PWH_ECONOMY_CHAT_MODEL = "small-chat";
process.env.PWH_ECONOMY_SITE_BUILDER_MODEL = "small-builder";
process.env.PWH_SUMMARIZER_MODEL = "small-summary";

process.env.PWH_IMAGE_GENERATION_ENABLED = "true";
process.env.PWH_IMAGE_LLM_BASE_URL = "https://image.example/v1";
process.env.PWH_IMAGE_LLM_API_KEY = "image-key";
process.env.PWH_IMAGE_MODEL = "image-model";

const {
  getPublicStudioLlmRuntime,
  resolveStudioLlmRoute
} = await import("../apps/studio/lib/server/llm-client.ts");

const createRoute = resolveStudioLlmRoute("create-agent");
assert.equal(createRoute?.providerId, "primary");
assert.equal(createRoute?.model, "strong-chat");
assert.equal(createRoute?.wireApi, "responses");

const plannerRoute = resolveStudioLlmRoute("site-planner");
assert.equal(plannerRoute?.providerId, "primary");
assert.equal(plannerRoute?.model, "strong-planner");

const builderRoute = resolveStudioLlmRoute("site-builder");
assert.equal(builderRoute?.providerId, "economy");
assert.equal(builderRoute?.model, "small-builder");
assert.equal(builderRoute?.wireApi, "chat-completions");

const chatbotRoute = resolveStudioLlmRoute("site-chatbot");
assert.equal(chatbotRoute?.providerId, "economy");
assert.equal(chatbotRoute?.model, "small-chat");

const summarizerRoute = resolveStudioLlmRoute("summarizer");
assert.equal(summarizerRoute?.providerId, "economy");
assert.equal(summarizerRoute?.model, "small-summary");

const imageRoute = resolveStudioLlmRoute("image-generation");
assert.equal(imageRoute?.providerId, "image");
assert.equal(imageRoute?.model, "image-model");

const publicRuntime = getPublicStudioLlmRuntime();
assert.ok(publicRuntime.providers.every((provider) => !("apiKey" in provider)));
assert.ok(publicRuntime.routes.every((route) => !("apiKey" in route)));
assert.ok(publicRuntime.routes.every((route) => !("baseUrl" in route)));

console.log(
  JSON.stringify(
    {
      providers: publicRuntime.providers,
      routes: publicRuntime.routes.map((route) => ({
        useCase: route.useCase,
        providerId: route.providerId,
        model: route.model,
        wireApi: route.wireApi,
        enabled: route.enabled
      }))
    },
    null,
    2
  )
);
