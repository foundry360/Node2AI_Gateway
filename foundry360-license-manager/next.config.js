/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Monorepo has a parent lockfile; keep tracing rooted here.
  outputFileTracingRoot: require('path').join(__dirname),
};

module.exports = nextConfig;
