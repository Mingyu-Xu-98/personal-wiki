export type SiteStyle = "editorial" | "minimalist" | "portfolio" | "creative" | "";

export type SiteBrief = {
  title: string;
  siteType: string;
  goal: string;
  audience: string;
  memory: string;
  style: SiteStyle;
  sections: string[];
};

export type KnowledgeBaseSummary = {
  id: string;
  name: string;
  description: string;
  wikiIndex: string;
  fileCount: number;
  totalChars: number;
  updatedAt: string;
};

export type CreateAgentMessage = {
  id?: string;
  role: "user" | "assistant";
  content: string;
};

export type CreateAgentResponse = {
  conversationId: string;
  brief: SiteBrief;
  assistantMessage: CreateAgentMessage;
  canGenerate: boolean;
  modelBacked: boolean;
  fallbackReason?: string;
};
