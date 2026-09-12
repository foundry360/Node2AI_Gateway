/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  // Monorepo has a parent lockfile; keep tracing rooted here.
  outputFileTracingRoot: require('path').join(__dirname),
  experimental: {
    // Deployment packages (esp. air-gapped image tarballs) can be large.
    serverActions: {
      bodySizeLimit: '8gb',
    },
  },
};

module.exports = nextConfig;
