/**
 * Runtime environment detection.
 *
 * These checks work in any context — Next.js server components, API routes,
 * client components, standalone Node.js workers, and Vitest.
 *
 * For build-time enforcement in Next.js, pair with the `server-only` package.
 * See: src/modules/query-engine/server.ts
 */

export function isServer(): boolean {
  return typeof window === 'undefined';
}

export function isClient(): boolean {
  return typeof window !== 'undefined';
}

/**
 * Throws immediately if called outside a server context.
 * Use in constructors of classes that depend on Node.js-only APIs
 * (Prisma, BullMQ, file system, etc.) as a belt-and-suspenders guard.
 */
export function assertServerContext(moduleName: string): void {
  if (typeof window !== 'undefined') {
    throw new Error(
      `[${moduleName}] This module must only run in a server context. ` +
        `Use the API route instead, or import from '@/modules/query-engine/server' ` +
        `which enforces this at build time via the 'server-only' package.`,
    );
  }
}
