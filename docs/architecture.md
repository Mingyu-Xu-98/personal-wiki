# Architecture

Personal Wiki Harness is not a generic AI website builder. It is a compilation system where a personal wiki is the durable source of meaning and a public or private site is a versioned build artifact.

## Core Thesis

The model is only one component. Everything around it is harness:

- durable state and run history
- wiki and source access
- context selection
- tool registration and authorization
- planning and execution
- verification
- version records
- hooks and middleware

The harness should make long-running site construction inspectable, repeatable, and correctable.

## Layers

1. Raw sources are immutable evidence. They may be ingested, cited, and linked, but never rewritten by the harness.
2. The wiki is the persistent semantic layer. It is maintained incrementally through entity pages, topic pages, source summaries, indexes, logs, relations, and lint issues.
3. The harness runtime is the command layer. It converts a user intent into context, a plan, tool calls, verification, and a build version.
4. The site compiler converts wiki-backed meaning into a content model and site plan.
5. Studio will eventually provide a UI over the same primitives, but it is not the first dependency.

## Package Boundaries

- `wiki-core` owns wiki data shapes and wiki maintenance records.
- `agent-runtime` owns model messages, tool definitions, tool calls, and execution boundaries.
- `site-compiler` owns the intermediate site representation.
- `harness-core` coordinates the other packages without knowing UI details.

The first implementation keeps persistence in memory so the contracts can settle before choosing storage.
