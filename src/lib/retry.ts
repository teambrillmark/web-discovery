import type { Logger } from './logger';

export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  backoffMultiplier?: number;
  logger: Logger;
  context: string;
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const { maxAttempts, baseDelayMs, backoffMultiplier = 2, logger, context } = options;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxAttempts) {
        const delayMs = baseDelayMs * Math.pow(backoffMultiplier, attempt - 1);
        logger.warn(
          { context, attempt, maxAttempts, delayMs, error: lastError.message },
          'Attempt failed — retrying',
        );
        await sleep(delayMs);
      }
    }
  }

  logger.error({ context, maxAttempts, error: lastError?.message }, 'All retry attempts exhausted');
  throw lastError ?? new Error(`${context}: all ${maxAttempts} attempts failed`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
