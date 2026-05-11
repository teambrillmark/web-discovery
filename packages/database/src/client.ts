import { PrismaClient } from '@prisma/client';

// DATABASE_URL must be set in .env — e.g. file:./data/discovery.db
declare global {
  var __prisma: PrismaClient | undefined;
}

export const db = globalThis.__prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
});

if (process.env.NODE_ENV !== 'production') {
  globalThis.__prisma = db;
}

export default db;
