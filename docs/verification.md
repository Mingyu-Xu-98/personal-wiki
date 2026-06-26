# Verification

Verification is the first completion gate for the harness.

The current verifier is deterministic. It reads:

- `workspace.json`
- `wiki/snapshot.json`
- `events.jsonl`

It does not ask a model to judge its own work.

## CLI Commands

```sh
pwh verify --workspace /path/to/workspace
pwh audit --workspace /path/to/workspace
```

Both commands support `--json`.

## Current Checks

`verify` checks:

- workspace manifest is readable
- local source policy is reference-only
- snapshot sources preserve ids, uri, hash, and manifest refs
- wiki snapshot includes index and log pages once sources exist
- applied mutation plans have prior review and handoff events
- completed site builds have version records
- workspace events map to allowed workflow phase/tool gates

`audit` includes all verification checks and adds:

- event log exists
- snapshot mutation plans have event coverage
- completed builds preserve artifact refs

## Status

Reports use:

- `pass`
- `warning`
- `fail`

`fail` indicates a hard gate violation. CLI exits with a non-zero status on failed verify or audit.

`pwh build` also runs verification before build work begins and again before the build version is recorded. Hard failures block the build/version step instead of creating a broken version record.

## Next Checks

Next verifier work should add:

- selected knowledge base boundary checks for Studio
- publish requires explicit user action
- preview exists only after a build artifact
- version graph integrity
- source grounding for generated site sections
- workflow phase/tool gating checks for hosted Studio runs
