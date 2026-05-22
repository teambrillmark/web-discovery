import pino from 'pino';

export type Logger = pino.Logger;

export function createLogger(module: string): Logger {
  const isDev = process.env['NODE_ENV'] === 'development';
  const level = process.env['LOG_LEVEL'] ?? 'info';

  if (isDev) {
    // pino transport uses worker_threads which Next.js can't resolve after HMR.
    // Use a plain stream with synchronous pretty-print instead.
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pretty = require('pino-pretty');
      return pino({ name: module, level }, pretty({ colorize: true }));
    } catch {
      // pino-pretty not available — fall through to plain pino
    }
  }

  return pino({ name: module, level });
}
