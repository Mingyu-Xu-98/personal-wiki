# System Meta Skill Layer

System Meta Skills are product-level operating knowledge for the harness. They describe reusable procedures, not private user memory.

## Why This Layer Exists

During build testing, the harness should learn which procedures consistently improve output quality. Those lessons should become explicit, inspectable skills that future runs can apply before calling tools or models.

System skills answer questions such as:

- When must the harness read the wiki before drafting?
- When must raw sources be treated as evidence?
- When should a run be revised rather than versioned?
- Which model tier should handle command decisions?
- Which lower-cost tier is safe for bounded implementation or website assistant calls?

## Privacy Boundary

System skills must not contain private wiki content, personal facts, user-specific preferences, source excerpts, or private outputs. They can only contain generalized procedure.

Good:

- "Read the maintained wiki before compiling a site plan."
- "Use the strong tier for system-skill promotion."

Bad:

- "Mingyu prefers this exact homepage wording."
- "This user's private journal implies this audience."

## Promotion Flow

```text
RunReflection
  -> CandidateSystemMetaSkill
  -> evaluation
  -> human approval
  -> active SystemMetaSkill
```

In early development, manual approval is the default. Later, repeated helpful evidence can propose candidates automatically, but promotion should remain conservative because system skills affect every user.

## First Active Skills

The first library seeds two active skills:

- Compile from wiki meaning, not raw chat.
- Route strong models to command decisions.

These are intentionally broad. Build testing should add evidence before the system grows more specific skills.
