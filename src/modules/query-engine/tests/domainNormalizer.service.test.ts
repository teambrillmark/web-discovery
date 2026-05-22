import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DomainNormalizerService } from '../services/domainNormalizer.service';
import { InvalidDomainError } from '../types';
import type { Logger } from '../../../lib/logger';

const makeLogger = (): Logger =>
  ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    trace: vi.fn(),
    child: vi.fn(),
  }) as unknown as Logger;

describe('DomainNormalizerService', () => {
  let service: DomainNormalizerService;
  let logger: Logger;

  beforeEach(() => {
    logger = makeLogger();
    service = new DomainNormalizerService(logger);
  });

  it('returns normalized domain for valid URL', () => {
    expect(service.normalize('https://www.example.com')).toBe('example.com');
  });

  it('returns normalized domain for bare domain input', () => {
    expect(service.normalize('example.com')).toBe('example.com');
  });

  it('logs debug on successful normalization', () => {
    service.normalize('example.com');
    expect(logger.debug).toHaveBeenCalledTimes(2);
  });

  it('throws InvalidDomainError and logs warn for invalid domain', () => {
    expect(() => service.normalize('not-valid')).toThrow(InvalidDomainError);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ input: 'not-valid' }),
      expect.any(String),
    );
  });

  it('throws InvalidDomainError and logs warn for empty input', () => {
    expect(() => service.normalize('')).toThrow(InvalidDomainError);
    expect(logger.warn).toHaveBeenCalled();
  });

  it('throws InvalidDomainError for IP address', () => {
    expect(() => service.normalize('192.168.1.1')).toThrow(InvalidDomainError);
  });

  it('does not call warn on successful normalization', () => {
    service.normalize('example.com');
    expect(logger.warn).not.toHaveBeenCalled();
  });
});
