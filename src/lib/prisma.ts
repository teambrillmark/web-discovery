import { PrismaClient } from '@prisma/client';

let client: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!client) {
    client = new PrismaClient({
      log: [
        { level: 'error', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
      ],
    });
  }
  return client;
}
