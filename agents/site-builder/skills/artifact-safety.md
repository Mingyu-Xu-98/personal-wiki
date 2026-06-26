# Artifact Safety

- Write only into the assigned artifact workspace.
- Keep generated public HTML free of internal harness prompts, private source paths, and secret values.
- Validate required files before versioning.
- Preserve content refs so later edits can patch rather than regenerate blindly.
