import { AppError } from '../../../lib/errors';

export interface BusinessContext {
  companyType: string;
  category: string;
  industry: string;
  niche: string;
  // Competitive intelligence layer
  primaryCompetitiveIdentity: string;
  primarySpecialties: string[];
  secondaryCapabilities: string[];
  coreServices: string[];
  competitiveSurfaces: string[];
  competitorSearchQueries: string[];
  // Flat list retained for backward compatibility
  services: string[];
  targetAudience: string[];
  positioningSummary: string;
  confidence: 'high' | 'medium' | 'low';
}

export interface DiscoveryInput {
  normalizedDomain: string;
  exclusions: string[];
  queryId: string;
  businessContext?: BusinessContext;
}

export interface ProviderResult {
  domain: string;
  source: string;
  discoveryMethod: string;
}

export interface DiscoveredCompetitor {
  domain: string;
  source: string;
  discoveryMethod: string;
  discoveredAt: string;
  queryId: string;
}

export interface IDiscoveryProvider {
  readonly name: string;
  readonly discoveryMethod: string;
  discover(input: DiscoveryInput): Promise<ProviderResult[]>;
}

export class DiscoveryError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'DISCOVERY_ERROR', 500);
    if (cause) this.cause = cause;
  }
}

export class AIProviderError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'AI_PROVIDER_ERROR', 500);
    if (cause) this.cause = cause;
  }
}
