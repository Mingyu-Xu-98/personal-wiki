export interface ContentModel {
  id: string;
  hero: {
    entityId?: string;
    name: string;
    title: string;
    summary: string;
    tags: string[];
  };
  sections: SectionSpec[];
  sourceIds: string[];
}

export interface SectionSpec {
  id: string;
  kind: "hero" | "about" | "projects" | "timeline" | "skills" | "awards" | "publications" | "contact" | "custom";
  title: string;
  entityIds: string[];
  narrativeRole: string;
}

export interface SitePlan {
  id: string;
  narrative: string;
  visualDirection: string;
  interactionModel: "static" | "entity_drilldown" | "chat_assisted" | "knowledge_map";
  sections: SectionSpec[];
}

export interface SiteArtifact {
  id: string;
  path: string;
  planId: string;
  versionId: string;
  createdAt: string;
}
