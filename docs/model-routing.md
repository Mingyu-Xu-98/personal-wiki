# Model Routing

Agents declare a symbolic model route instead of a hard-coded provider:

```ts
model: "router/code"
```

Initial routes:

- `router/knowledge`: source ingestion and wiki maintenance.
- `router/reasoning`: intent, content compilation, editing, QA.
- `router/design`: site planning and visual direction.
- `router/code`: artifact generation.

The runtime will later map these routes to concrete providers, costs, latency classes, and fallback chains.
