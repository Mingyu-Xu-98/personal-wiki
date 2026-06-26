export type WikiEntityType =
  | "person"
  | "project"
  | "skill"
  | "company"
  | "school"
  | "award"
  | "publication"
  | "concept";

export interface SourceDocument {
  id: string;
  path: string;
  kind: "markdown" | "text" | "pdf" | "docx" | "image" | "link";
  title: string;
  immutableHash?: string;
  createdAt: string;
}

export interface WikiEntity {
  id: string;
  type: WikiEntityType;
  name: string;
  aliases: string[];
  sourceIds: string[];
  importance: 1 | 2 | 3;
  updatedAt: string;
}

export interface WikiPage {
  id: string;
  path: string;
  entityId?: string;
  title: string;
  summary: string;
  sourceIds: string[];
  updatedAt: string;
}

export interface WikiRelation {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  type: "mentions" | "built_with" | "worked_at" | "studied_at" | "related_to" | "contradicts";
  evidenceSourceIds: string[];
}

export interface WikiEvent {
  id: string;
  type: "ingest" | "query" | "lint" | "entity_update" | "site_build";
  title: string;
  summary: string;
  createdAt: string;
}

export interface WikiLintIssue {
  id: string;
  severity: "info" | "warning" | "error";
  type: "orphan_page" | "missing_source" | "possible_duplicate" | "contradiction" | "stale_claim";
  message: string;
  targetId?: string;
}

export interface WikiSnapshot {
  generatedAt: string;
  sources: SourceDocument[];
  entities: WikiEntity[];
  pages: WikiPage[];
  relations: WikiRelation[];
  events: WikiEvent[];
  lintIssues: WikiLintIssue[];
}
