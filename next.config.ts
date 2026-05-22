import type { NextConfig } from 'next';
import path from 'path';

const projectRoot = path.join(__dirname);

const config: NextConfig = {
  // Prevent Next.js from bundling Node.js-only packages server-side.
  // These are required() at runtime by the Node.js server, not inlined by webpack.
  serverExternalPackages: ['pino', 'pino-pretty', '@prisma/client'],

  // Pin workspace root to this app. Required when a package-lock.json exists in a
  // parent directory (e.g. ~/package-lock.json); otherwise Next walks up and treats
  // the home directory as the monorepo root, which hangs dev/build file watching.
  outputFileTracingRoot: projectRoot,
  turbopack: {
    root: projectRoot,
  },
};

export default config;
