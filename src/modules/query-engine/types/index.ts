import { AppError } from '../../../lib/errors';

export interface QueryEngineInput {
  query: string;
}

export interface QueryEngineOutput {
  normalizedDomain: string;
  exclusions: string[];
  excludedCount: number;
  queryId: string;
  requestedAt: string;
}

export interface ICompetitorRepository {
  findAllNormalizedDomains(): Promise<string[]>;
}

export class InvalidDomainError extends AppError {
  constructor(message: string) {
    super(message, 'INVALID_DOMAIN', 400);
  }
}

export class QueryEngineError extends AppError {
  constructor(message: string, cause?: Error) {
    super(message, 'QUERY_ENGINE_ERROR', 500);
    if (cause) {
      this.cause = cause;
    }
  }
}
