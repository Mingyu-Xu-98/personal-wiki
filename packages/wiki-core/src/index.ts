export type WikiId = string;

export type SourceDocument = {
  id: WikiId;
  title: string;
  uri: string;
  mediaType: string;
  contentHash: string;
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type WikiEntityKind =
  | "person"
  | "project"
  | "concept"
  | "place"
  | "artifact"
  | "event"
  | "other";

export type WikiEntity = {
  id: WikiId;
  name: string;
  kind: WikiEntityKind;
  aliases: string[];
  summary: string;
  pageId?: WikiId;
  sourceIds: WikiId[];
  updatedAt: string;
};

export type WikiPageKind =
  | "index"
  | "log"
  | "source-summary"
  | "entity"
  | "concept"
  | "synthesis"
  | "query-answer";

export type WikiPage = {
  id: WikiId;
  kind: WikiPageKind;
  title: string;
  path: string;
  body: string;
  entityIds: WikiId[];
  sourceIds: WikiId[];
  updatedAt: string;
};

export type WikiRelation = {
  id: WikiId;
  fromEntityId: WikiId;
  toEntityId: WikiId;
  predicate: string;
  confidence: number;
  evidenceSourceIds: WikiId[];
  note?: string;
};

export type WikiEventKind = "ingest" | "query" | "lint" | "page-update" | "build";

export type WikiEvent = {
  id: WikiId;
  kind: WikiEventKind;
  occurredAt: string;
  title: string;
  pageIds: WikiId[];
  sourceIds: WikiId[];
  summary: string;
};

export type WikiLintSeverity = "info" | "warning" | "error";

export type WikiLintIssue = {
  id: WikiId;
  severity: WikiLintSeverity;
  code: string;
  message: string;
  pageId?: WikiId;
  entityId?: WikiId;
  sourceIds: WikiId[];
  createdAt: string;
};

export type WikiSnapshot = {
  sources: SourceDocument[];
  entities: WikiEntity[];
  pages: WikiPage[];
  relations: WikiRelation[];
  events: WikiEvent[];
  lintIssues: WikiLintIssue[];
};

export const emptyWikiSnapshot = (): WikiSnapshot => ({
  sources: [],
  entities: [],
  pages: [],
  relations: [],
  events: [],
  lintIssues: []
});
