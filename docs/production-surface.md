# Production Surface

The current implementation is a local production-shaped runtime, not yet a hosted multi-user product.

It includes:

- file-system-first agents
- durable run persistence
- scoped tools and permission checks
- approval pause and resume
- sandbox artifact writing and validation
- retry metadata for tool calls
- regression evals
- HTTP health, agents, and runs endpoints
- Dockerfile
- GitHub Actions CI

## Runtime Commands

```sh
npm run check
npm run build
npm run inspect:agents
npm run demo:approval
npm run inspect:runs
npm run serve
```

## HTTP Endpoints

- `GET /health`
- `GET /agents`
- `GET /runs`
- `GET /artifacts/:runId/index.html`

## Remaining Production Hardening

Before public multi-user hosting, add real authentication, persistent database-backed storage, stronger sandbox isolation, OpenTelemetry export, secrets management, and deployment-specific authorization policy.
