# Artifact Safety

Generated website code must be treated as an artifact, not as trusted application runtime.

The site builder should write into `workspace/artifacts/`, run validation through sandbox contracts, and request approval before publishing or overwriting a stable version.
