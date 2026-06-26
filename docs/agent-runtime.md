# Agent Runtime

`packages/agent-runtime` defines the model and sub-agent execution boundary.

The goal is to keep model execution replaceable while preserving the same harness contract.

## Core Contracts

- `AgentRuntime` is the minimal model interface: `complete({ messages, tools })`.
- `ToolRegistry` owns executable tools and records tool execution.
- `ContextPacket` is the bounded input a sub-agent receives.
- `SubAgentTrace` records packet, status, timing, result, and tool calls.
- `SubAgentResult` must preserve `evidenceRefs`, `artifactRefs`, and `mustCarryForwardRefs`.
- `SubAgentArtifact.data` can carry structured outputs such as `BuildSpec`, `ContentModel`, `DesignUsagePlan`, `SitePlan`, `SiteArtifact`, `ReviewReport`, or `OntologyExtraction` candidates.

## Executors

The default executor is safe and deterministic:

```ts
createDryRunSubAgentExecutor()
```

It marks traces as skipped and keeps packet refs. This is the default used by `HarnessOrchestrator`.

The model-backed executor is opt-in:

```ts
createModelBackedSubAgentExecutor({
  agentRuntime,
  toolRegistry
})
```

It exposes only `packet.allowedToolNames`, executes bounded tool calls through `ToolRegistry`, and parses the final model message into `SubAgentResult`.

Role-based routing is also available:

```ts
createRoleBasedSubAgentExecutor({
  executors: {
    "builder-agent": builderExecutor,
    "review-agent": reviewExecutor
  },
  fallback: createDryRunSubAgentExecutor()
})
```

This is the hook for model tiers: expensive judgment roles can use a stronger executor, while bounded build or assistant roles can use cheaper executors behind the same packet/result contract.

For OpenAI-compatible endpoints, app layers can use the convenience wrapper:

```ts
createOpenAICompatibleSubAgentExecutor({
  baseUrl,
  apiKey,
  model,
  toolRegistry
})
```

This keeps endpoint/key configuration outside core packages while reusing the same executor contract.

## OpenAI-Compatible Runtime

The generic adapter is:

```ts
createOpenAICompatibleAgentRuntime({
  baseUrl,
  apiKey,
  model
})
```

It calls `/chat/completions`, converts local tool definitions to OpenAI-style function tools, and converts returned tool calls back into `RequestedToolCall`.

For Codex-style OpenAI Responses endpoints, app layers can use:

```ts
createOpenAIResponsesAgentRuntime({
  baseUrl,
  apiKey,
  model
})
```

It calls `/responses`, sends `store: false` by default, maps local tools to Responses function tools, and reads both text output and `function_call` items back into the same `ModelResponse` contract.

The matching sub-agent wrapper is:

```ts
createOpenAIResponsesSubAgentExecutor({
  baseUrl,
  apiKey,
  model,
  toolRegistry
})
```

No core package hardcodes a vendor, endpoint, or key.

## Reference Discipline

Sub-agent summaries may be compressed. References should not be.

Every model-backed sub-agent should return:

- `summary`
- `decisions`
- `artifacts`
- `evidenceRefs`
- `artifactRefs`
- `mustCarryForwardRefs`
- `discardableContext`
- `contextDeltas`

Later phases should re-read referenced artifacts or wiki/source pages through tools instead of relying on lossy prose.

## Structured Artifact Consumption

`HarnessOrchestrator` now consumes these artifact kinds:

- `content-model`
- `design-usage-plan`
- `site-plan`
- `html`

`engine-core` also consumes `ontology-extraction` artifacts from the `wiki-curator` path when creating a `WikiMutationPlan`.

Consumption is conservative. The orchestrator sanitizes model-provided refs against the current wiki snapshot:

- unknown page refs are dropped and recorded as lint warnings
- unknown entity refs are dropped and recorded as lint warnings
- route section refs must point to accepted sections
- unsupported content block kinds are dropped and recorded as lint warnings

This allows a model-backed `builder-agent` to shape the compiled version while keeping source boundaries and verifier-friendly warnings.

The model prompt now gives `builder-agent` an explicit artifact schema: return `content-model`, `design-usage-plan`, `site-plan`, and `html` artifacts in one build handoff. Legacy `site-planner` and `site-compiler` role instructions remain for compatibility, but the canonical site-build path is Builder Agent.

`BuildVersion` can now retain sanitized `designUsagePlan` and `siteArtifact` output when the builder returns those artifacts. The artifact is still gated by `harness-core`: missing design usage plan, malformed HTML artifacts, or user-facing internal system language block versioning.

For `ontology-extraction`, consumption is also conservative:

- candidates must have a known ontology kind
- candidates must preserve valid source evidence refs
- unknown source refs are rejected
- valid model candidates are merged with heuristic candidates so baseline wiki maintenance is not lost
- model-backed ontology plans are marked pending human review before apply
