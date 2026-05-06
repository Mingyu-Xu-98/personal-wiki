# Model Routing

The harness should use model tiers instead of binding core logic to one provider or one model name.

## Principle

Spend strong-model reasoning where mistakes shape the whole run. Use cheaper tiers where work is bounded, checkable, or high-volume.

## Default Routing

- `commander`: strong tier
- `planner`: strong tier
- `reflection`: strong tier
- `system-skill-promotion`: strong tier
- `coder`: balanced tier
- `wiki-maintainer`: balanced tier
- `site-assistant`: small tier
- `summarizer`: small tier
- `search`: embedding or retrieval tier

## Why This Matters

The commander decides intent, context, tools, and recovery. That role should use the best available reasoning. Website-internal AI calls are usually narrower: answer a visitor question, summarize selected wiki content, or help navigate a compiled site. Those should default to smaller, lower-cost models with strict context boundaries.

The routing decision is part of the run ledger so later reflection can tell whether the chosen tier was sufficient.
