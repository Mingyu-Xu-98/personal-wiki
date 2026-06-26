# Personal Wiki

Personal Wiki is an eve-style harness for compiling a living personal wiki into versioned website artifacts.

The project treats an agent as a directory and a website build as a durable workflow. The personal wiki is the long-term memory. The harness is the control plane that manages intent, context, tools, approvals, traces, retries, validation, and versions.

## Shape

```text
agents/                 file-system-first agent definitions
runtime/                durable workflow, tracing, tools, approvals, sandbox contracts
domain/                 wiki, build, and site domain models
workspace/              local raw sources, wiki pages, runs, and artifacts
docs/                   architecture and operating model
```

## First Demo

```sh
npm install
npm run check
npm run demo
```

The demo loads the `site-builder` agent from the file system, creates a durable run, records trace spans, and writes a site build version without calling an external model.

## Principle

Agents are workers. The harness is the project manager.
