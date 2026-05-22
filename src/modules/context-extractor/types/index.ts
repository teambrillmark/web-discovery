import { AppError } from '../../../lib/errors';

export interface ContextExtractorInput {
  domain: string;
  queryId: string;
}

export interface ExtractedContent {
  title: string;
  metaDescription: string;
  headings: string[];
  heroText: string;
  servicesText: string;
  aboutText: string;
  navLabels: string[];
  bodyText: string;
  crawlMethod: 'fetch' | 'playwright';
  totalChars: number;
}

export interface BusinessContext {
  domain: string;
  companyType: string;
  industry: string;
  niche: string;
  services: string[];
  targetAudience: string[];
  positioningSummary: string;
  extractedContentSummary: string;
  confidence: 'high' | 'medium' | 'low';
  queryId: string;
  analyzedAt: string;
}

export interface CrawlResult {
  html: string;
  finalUrl: string;
  method: 'fetch' | 'playwright';
}

export class CrawlerError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'CRAWLER_ERROR', 503);
    if (cause) this.cause = cause;
  }
}

export class ExtractionError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'EXTRACTION_ERROR', 422);
    if (cause) this.cause = cause;
  }
}

export class ContextAnalysisError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'CONTEXT_ANALYSIS_ERROR', 500);
    if (cause) this.cause = cause;
  }
}
