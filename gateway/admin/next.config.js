/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Allow both localhost and 127.0.0.1 in dev (soft nav / _next assets).
  allowedDevOrigins: ['127.0.0.1', 'localhost'],
};

module.exports = nextConfig;
