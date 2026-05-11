export interface CompanyProfile {
  name: string;
  domain: string;
  description: string;
  industry: string | null;       // AI-identified industry key (e.g. 'cro_agency')
  primaryServices: string[];     // prominently featured: H1/H2, meta desc, 4+ occurrences
  secondaryServices: string[];   // mentioned but not the focus
  techStack: string[];
  businessModel: 'agency' | 'tool' | 'platform' | 'brand' | 'unknown';
  engagement: {
    hasCaseStudies: boolean;
    hasTeamPage: boolean;
    hasPortfolio: boolean;
    hasTestimonials: boolean;
  };
}

export interface CandidateResult {
  domain: string;
  name: string;
  description: string;
  services: string[];
  matchedServices: string[];   // overlap with profile.primaryServices
  matchScore: number;           // 0-1: fraction of profile primary services also offered
  businessModel: 'agency' | 'tool' | 'platform' | 'brand' | 'unknown';
  techStack: string[];
  source: 'groq' | 'ddg' | 'wiki' | 'seed' | 'directory' | 'secondary';
  rawPageData: any;             // PageData from crawler — passed to extractor later
  competitorTier?: 'direct' | 'partial' | 'broader';  // AI-classified tier vs query company
}

// Structured profile built by AI for a crawled competitor (batch Groq call)
export interface CandidateAIProfile {
  domain: string;
  industry: string | null;
  primaryServices: string[];
  businessModel: 'agency' | 'tool' | 'platform' | 'brand' | 'unknown';
}

// Function type for emitting progress log lines from an agent
export type EmitFn = (message: string, extra?: Record<string, unknown>) => void;

export interface AgentEvent {
  type: 'log' | 'stage_start' | 'stage_done' | 'done' | 'error';
  stage: 'profile' | 'search' | 'match' | 'filter' | 'save' | 'complete';
  agent: string;
  message: string;
  progress: number;  // 0-100
  data?: Record<string, unknown>;
}
