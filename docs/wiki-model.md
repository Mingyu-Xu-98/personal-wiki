# Wiki Model

The wiki is the long-term memory layer.

Raw sources are immutable. Wiki pages, entities, relations, events, and lint issues are maintained artifacts.

## Core Objects

- `SourceDocument`: immutable source metadata.
- `WikiEntity`: stable person, project, skill, organization, school, award, publication, or concept.
- `WikiPage`: markdown page maintained by the wiki curator.
- `WikiRelation`: typed links between entities with evidence.
- `WikiEvent`: chronological log entry.
- `WikiLintIssue`: health check result.

## Relationship to Websites

The wiki is not the website. A site is compiled from a subset and interpretation of wiki knowledge under a specific build intent.
