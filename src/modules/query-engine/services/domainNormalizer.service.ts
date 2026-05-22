import type { Logger } from '../../../lib/logger';
import { normalizeDomain } from '../utils/domainUtils';
import { InvalidDomainError } from '../types';

export class DomainNormalizerService {
  constructor(private readonly logger: Logger) {}

  normalize(input: string): string {
    this.logger.debug({ input }, 'Normalizing domain');

    try {
      const normalized = normalizeDomain(input);
      this.logger.debug({ input, normalized }, 'Domain normalized successfully');
      return normalized;
    } catch (error) {
      if (error instanceof InvalidDomainError) {
        this.logger.warn({ input, error: error.message }, 'Domain normalization failed — invalid domain');
        throw error;
      }
      this.logger.error({ input, error }, 'Unexpected error during domain normalization');
      throw error;
    }
  }
}
