# Model Routing

Studio uses one LLM client manager for model selection:

```txt
apps/studio/lib/server/llm-client.ts
```

It routes by use case instead of letting each feature read ad hoc environment variables.

## Providers

```txt
primary  -> PWH_LLM_BASE_URL / PWH_LLM_API_KEY
economy  -> PWH_ECONOMY_LLM_BASE_URL / PWH_ECONOMY_LLM_API_KEY
image    -> PWH_IMAGE_LLM_BASE_URL / PWH_IMAGE_LLM_API_KEY
```

Each provider also has a wire protocol:

```txt
PWH_LLM_WIRE_API=responses
PWH_ECONOMY_LLM_WIRE_API=chat-completions
PWH_IMAGE_LLM_WIRE_API=chat-completions
```

If the wire protocol is omitted, Studio infers `responses` for `code.memect.cn` and otherwise defaults to `chat-completions`.

## Use Cases

```txt
create-agent      primary, strong     user intent conversation
wiki-curator      primary, balanced   source-grounded wiki maintenance
site-builder      economy/primary     Builder Agent: content model, design usage plan, site plan, HTML artifact
site-chatbot      economy, small      future visitor chatbot
summarizer        economy, small      high-volume summarization
image-generation  image/economy       future image generation
```

The route table is exposed to the admin overview without API keys or raw base URLs.

## Cost Rule

Spend the stronger model where decisions compound:

- intent clarification
- wiki mutation judgment
- build-spec and major site direction changes
- reflection and system skill promotion

Use cheaper models where work is bounded and verifiable:

- bounded Builder Agent site drafting when design refs and verification are available
- website chatbot
- summarization
- structured rewrites

## Current Low-Cost Test

The economy endpoint was tested through the OpenAI-compatible `/models` and `/chat/completions` shape. `Kimi-K2.5-low` returned a successful chat response; `GLM-4.7-low` responded with rate limiting during the test.

## Current Primary Test

`https://code.memect.cn/v1` is a Codex/Claude Code style hub rather than a plain ChatCompletions gateway.

Tested shape:

```txt
GET  /v1/models      -> 200
POST /v1/responses   -> 200 with gpt-5.4
POST /v1/messages    -> 503 when the Claude upstream is unavailable
POST /v1/chat/completions -> not supported for gpt-5.4 on this hub
```

So the primary route should use:

```txt
PWH_LLM_BASE_URL=https://code.memect.cn/v1
PWH_LLM_WIRE_API=responses
PWH_CREATE_AGENT_MODEL=gpt-5.4
```

The local `.env.local` can set:

```txt
PWH_ECONOMY_LLM_BASE_URL=http://39.104.116.42:4000
PWH_ECONOMY_CHAT_MODEL=Kimi-K2.5-low
PWH_ECONOMY_SITE_BUILDER_MODEL=Kimi-K2.5-low
PWH_SITE_CHATBOT_MODEL=Kimi-K2.5-low
PWH_SUMMARIZER_MODEL=Kimi-K2.5-low
```

API keys stay in `.env.local` only.
