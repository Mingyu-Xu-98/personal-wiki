export type ContentModel = {
  id: string;
  title: string;
  thesis: string;
  audience: string;
  sourcePageIds: string[];
  sections: SectionSpec[];
};

export type SitePlan = {
  id: string;
  contentModelId: string;
  routes: SiteRoute[];
  navigation: SiteNavigationItem[];
  generatedAt: string;
};

export type SiteRoute = {
  path: string;
  title: string;
  sectionIds: string[];
};

export type SiteNavigationItem = {
  label: string;
  href: string;
};

export type SectionSpec = {
  id: string;
  title: string;
  purpose: "orient" | "explain" | "compare" | "evidence" | "timeline" | "call-to-action";
  sourceEntityIds: string[];
  sourcePageIds: string[];
  contentBlocks: ContentBlock[];
};

export type ContentBlock =
  | {
      kind: "markdown";
      markdown: string;
    }
  | {
      kind: "entity-list";
      entityIds: string[];
    }
  | {
      kind: "timeline";
      eventIds: string[];
    };

export const createEmptyContentModel = (id: string, title: string): ContentModel => ({
  id,
  title,
  thesis: "",
  audience: "self",
  sourcePageIds: [],
  sections: []
});
