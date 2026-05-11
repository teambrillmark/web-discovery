export interface QueryObject {
  raw: string;
  intent: DiscoveryIntent;
  industry: string | null;
  entityType: EntityType;
  location: string | null;
  keywords: string[];
  objective: string;
}

export type DiscoveryIntent =
  | 'competitor_analysis'
  | 'market_discovery'
  | 'local_business_search'
  | 'product_discovery'
  | 'agency_search'
  | 'technology_search'
  | 'brand_discovery'
  | 'general_search';

export type EntityType = 'company' | 'product' | 'local_business' | 'person' | 'unknown';

export interface PersonInfo {
  name: string;
  role: string;
  linkedin?: string;
  twitter?: string;
}

export interface CompanyEntity {
  name: string;
  domain: string;
  description: string | null;
  services: string[];
  founders: PersonInfo[];
  linkedin: string | null;
  twitter: string | null;
  technologies: string[];
  locations: string[];
  emails: string[];
  phones: string[];
  category: string | null;
  confidenceScore: number;
  relevanceScore: number;
  source: string;
  metaTitle: string | null;
  metaDescription: string | null;
}

export interface ProductEntity {
  name: string;
  category: string;
  brand: string;
  pricing: string | null;
  source: string;
  domain: string;
  description: string | null;
  confidenceScore: number;
}

export interface LocalBusinessEntity {
  name: string;
  location: string;
  services: string[];
  rating: number | null;
  phone: string | null;
  website: string | null;
  domain: string;
  confidenceScore: number;
}

export interface CrawlResult {
  url: string;
  domain: string;
  html: string;
  metadata: PageMetadata;
  success: boolean;
  error?: string;
  duration: number;
  statusCode?: number;
}

export interface PageMetadata {
  title: string | null;
  description: string | null;
  keywords: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImage: string | null;
  canonicalUrl: string | null;
  headings: { level: number; text: string }[];
  links: string[];
  socialLinks: Record<string, string>;
  emails: string[];
  phones: string[];
  technologies: string[];
}

export interface ValidationResult {
  isValid: boolean;
  confidenceScore: number;
  relevanceScore: number;
  reasons: string[];
  flags: ValidationFlag[];
}

export type ValidationFlag =
  | 'low_quality'
  | 'spam'
  | 'irrelevant'
  | 'duplicate'
  | 'incomplete'
  | 'high_confidence'
  | 'verified'
  | 'tool_not_agency'
  | 'possible_tool_not_agency';

export interface ChangeDetectionResult {
  hasChanges: boolean;
  changes: EntityChange[];
  isNew: boolean;
}

export interface EntityChange {
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changeType: 'added' | 'removed' | 'modified';
}

export interface RankedEntity {
  entity: CompanyEntity;
  rank: number;
  score: number;
  freshness: number;
  isNew: boolean;
  recentChanges: number;
}

export interface DiscoverySearchResult {
  url: string;
  title: string;
  snippet: string;
  domain: string;
  rank: number;
}
