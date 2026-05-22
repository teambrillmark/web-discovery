/**
 * Server-only entry point for the Query Engine module.
 *
 * Importing 'server-only' causes a Next.js build error if this file is
 * transitively imported into a client component bundle. This is the
 * production-grade guard against accidentally shipping Prisma or
 * other Node.js-only dependencies to the browser.
 *
 * Usage:
 *   Server contexts  → import from '@/modules/query-engine/server'
 *   Client contexts  → import type { QueryEngineOutput } from '@/modules/query-engine/types'
 */
import 'server-only';

export * from './index';
