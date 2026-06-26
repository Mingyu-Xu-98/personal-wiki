export type WikiId = string;

export type SourceContentMode = "inline" | "referenced" | "excerpt" | "metadata-only";

export type SourceDocument = {
  id: WikiId;
  title: string;
  uri: string;
  mediaType: string;
  contentHash: string;
  content: string;
  contentMode?: SourceContentMode;
  originalUri?: string;
  byteSize?: number;
  extractedAt?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type WikiEntityKind =
  | "person"
  | "organization"
  | "project"
  | "concept"
  | "topic"
  | "place"
  | "artifact"
  | "document"
  | "event"
  | "skill"
  | "tool"
  | "claim"
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

export type WikiClaim = {
  id: WikiId;
  statement: string;
  subjectEntityIds: WikiId[];
  sourceIds: WikiId[];
  confidence: number;
  status: "candidate" | "accepted" | "contested" | "deprecated";
  updatedAt: string;
};

export type OntologySlotKind =
  | "entity"
  | "relation"
  | "event"
  | "claim"
  | "skill"
  | "topic"
  | "source-summary";

export type OntologySchema = {
  id: WikiId;
  name: string;
  description: string;
  entityKinds: WikiEntityKind[];
  relationPredicates: string[];
  requiredSlots: OntologySlotKind[];
  updatedAt: string;
};

export type OntologyExtractionItem = {
  id: WikiId;
  kind: OntologySlotKind;
  label: string;
  summary: string;
  confidence: number;
  evidenceSourceIds: WikiId[];
  evidencePageIds: WikiId[];
  candidateEntity?: WikiEntity;
  candidateRelation?: WikiRelation;
  candidateClaim?: WikiClaim;
};

export type OntologyExtraction = {
  id: WikiId;
  sourceIds: WikiId[];
  schemaId: WikiId;
  extractedAt: string;
  items: OntologyExtractionItem[];
  openQuestions: string[];
  humanReviewState: "not-required" | "pending" | "approved" | "rejected";
};

export type WikiMutationOperationKind =
  | "upsert-source"
  | "upsert-page"
  | "upsert-entity"
  | "upsert-relation"
  | "upsert-claim"
  | "upsert-index"
  | "upsert-log"
  | "append-event"
  | "record-ontology-extraction";

export type WikiMutationOperation = {
  id: WikiId;
  kind: WikiMutationOperationKind;
  summary: string;
  sourceIds: WikiId[];
  targetId?: WikiId;
  source?: SourceDocument;
  page?: WikiPage;
  entity?: WikiEntity;
  relation?: WikiRelation;
  claim?: WikiClaim;
  event?: WikiEvent;
  ontologyExtraction?: OntologyExtraction;
};

export type WikiMutationPlan = {
  id: WikiId;
  title: string;
  createdAt: string;
  sourceIds: WikiId[];
  operations: WikiMutationOperation[];
  expectedPageIds: WikiId[];
  expectedEntityIds: WikiId[];
  questionsForHuman: string[];
  humanReviewState: "not-required" | "pending" | "approved" | "rejected";
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
  claims?: WikiClaim[];
  ontologyExtractions?: OntologyExtraction[];
  mutationPlans?: WikiMutationPlan[];
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
