import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Groq from 'groq-sdk';
import { GroqAIProvider } from '../providers/ai/groq.provider';
import type { DiscoveryInput } from '../types';
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

const makeGroqClient = (content: string | null): Groq =>
  ({
    chat: {
      completions: {
        create: vi.fn().mockResolvedValue({
          choices: [{ message: { content } }],
        }),
      },
    },
  }) as unknown as Groq;

const makeFailingGroqClient = (error: Error): Groq =>
  ({
    chat: {
      completions: {
        create: vi.fn().mockRejectedValue(error),
      },
    },
  }) as unknown as Groq;

const makeFlakeyGroqClient = (failTimes: number, successContent: string): Groq => {
  let calls = 0;
  return {
    chat: {
      completions: {
        create: vi.fn().mockImplementation(() => {
          calls++;
          if (calls <= failTimes) return Promise.reject(new Error('rate limited'));
          return Promise.resolve({ choices: [{ message: { content: successContent } }] });
        }),
      },
    },
  } as unknown as Groq;
};

const validInput: DiscoveryInput = {
  normalizedDomain: 'brillmark.com',
  exclusions: ['convertcart.com'],
  queryId: '550e8400-e29b-41d4-a716-446655440000',
};

const makeProvider = (groq: Groq, logger: Logger): GroqAIProvider =>
  new GroqAIProvider(groq, logger, { retryDelayMs: 0, maxRetries: 3 });

describe('GroqAIProvider', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = makeLogger();
  });

  describe('discover — happy path', () => {
    it('returns discovered competitors from valid JSON response', async () => {
      const groq = makeGroqClient('{"competitors": ["speero.com", "cro.media", "experimentnation.com"]}');
      const provider = makeProvider(groq, logger);

      const results = await provider.discover(validInput);

      expect(results).toHaveLength(3);
      expect(results[0]).toEqual(
        expect.objectContaining({ source: 'groq', discoveryMethod: 'ai-discovery' }),
      );
    });

    it('returns normalized domains', async () => {
      const groq = makeGroqClient('{"competitors": ["https://www.speero.com", "CRO.MEDIA"]}');
      const provider = makeProvider(groq, logger);

      const results = await provider.discover(validInput);

      const domains = results.map((r) => r.domain);
      expect(domains).toContain('speero.com');
      expect(domains).toContain('cro.media');
    });

    it('filters out the input domain if AI returns it', async () => {
      const groq = makeGroqClient('{"competitors": ["brillmark.com", "speero.com"]}');
      const provider = makeProvider(groq, logger);

      const results = await provider.discover(validInput);

      expect(results.map((r) => r.domain)).not.toContain('brillmark.com');
    });

    it('filters out exclusions even if AI returns them', async () => {
      const groq = makeGroqClient('{"competitors": ["convertcart.com", "speero.com"]}');
      const provider = makeProvider(groq, logger);

      const results = await provider.discover(validInput);

      expect(results.map((r) => r.domain)).not.toContain('convertcart.com');
    });

    it('filters out invalid domain-like strings from AI output', async () => {
      const groq = makeGroqClient('{"competitors": ["just-a-word", "speero.com", ""]}');
      const provider = makeProvider(groq, logger);

      const results = await provider.discover(validInput);

      expect(results).toHaveLength(1);
      expect(results[0]?.domain).toBe('speero.com');
    });

    it('returns empty array when AI returns empty competitors list', async () => {
      const groq = makeGroqClient('{"competitors": []}');
      const provider = makeProvider(groq, logger);

      const results = await provider.discover(validInput);
      expect(results).toHaveLength(0);
    });
  });

  describe('discover — malformed AI responses', () => {
    it('returns empty array for malformed JSON', async () => {
      const groq = makeGroqClient('this is not json at all');
      const provider = makeProvider(groq, logger);

      const results = await provider.discover(validInput);
      expect(results).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalled();
    });

    it('returns empty array when JSON structure is wrong (no competitors field)', async () => {
      const groq = makeGroqClient('{"domains": ["speero.com"]}');
      const provider = makeProvider(groq, logger);

      const results = await provider.discover(validInput);
      expect(results).toHaveLength(0);
    });

    it('returns empty array when Groq returns null content', async () => {
      const groq = makeGroqClient(null);
      const provider = makeProvider(groq, logger);

      const results = await provider.discover(validInput);
      expect(results).toHaveLength(0);
      expect(logger.error).toHaveBeenCalled();
    });
  });

  describe('discover — retry behavior', () => {
    it('retries on transient failure and succeeds', async () => {
      const groq = makeFlakeyGroqClient(2, '{"competitors": ["speero.com"]}');
      const provider = makeProvider(groq, logger);

      const results = await provider.discover(validInput);

      expect(results).toHaveLength(1);
      expect(logger.warn).toHaveBeenCalledTimes(2);
    });

    it('returns empty array after all retries are exhausted', async () => {
      const groq = makeFailingGroqClient(new Error('API unavailable'));
      const provider = makeProvider(groq, logger);

      const results = await provider.discover(validInput);

      expect(results).toHaveLength(0);
      expect(logger.error).toHaveBeenCalled();
    });
  });
});
