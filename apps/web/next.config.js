/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ['@discovery/shared'],
  env: {
    API_URL: process.env.API_URL || 'http://localhost:3001',
  },
};

module.exports = nextConfig;
