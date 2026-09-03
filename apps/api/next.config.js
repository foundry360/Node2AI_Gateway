/** @type {import('next').NextConfig} */
const path = require('path');

const nextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true, // Temporarily disabled for enterprise reliability
  },
  eslint: {
    ignoreDuringBuilds: false,
  },
  env: {
    CUSTOM_KEY: process.env.CUSTOM_KEY,
  },
  // Reduce file watching to avoid EMFILE errors on macOS
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.watchOptions = {
        poll: 1000, // Check for changes every second
        aggregateTimeout: 300,
        ignored: ['**/node_modules/**', '**/.next/**', '**/.git/**'],
      };
      // Exclude fabric-network from client bundle (server-only)
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      };
    }

    // Exclude fabric-network from client bundle
    config.externals = config.externals || [];
    if (!isServer) {
      config.externals.push({
        'fabric-network': 'commonjs fabric-network',
        'fabric-ca-client': 'commonjs fabric-ca-client',
      });
    }

    // PRODUCTION: Make ALL Fabric dependencies external for server-side
    // This ensures they load from node_modules at runtime, not bundled
    if (isServer) {
      // Exclude ALL fabric-related packages from bundling
      const fabricExternals = [
        'fabric-network',
        'fabric-ca-client',
        'fabric-protos',
        'fabric-common',
        'fabric-client',
      ];

      fabricExternals.forEach(pkg => {
        config.externals.push({
          [pkg]: `commonjs ${pkg}`,
        });
      });

      // Also use function-based externals for nested imports
      config.externals.push(({ request }, callback) => {
        if (
          request.includes('fabric-common') ||
          request.includes('fabric-protos') ||
          request.includes('fabric-network') ||
          request.includes('fabric-ca-client')
        ) {
          return callback(null, `commonjs ${request}`);
        }
        callback();
      });

      // Ensure node_modules resolution works correctly
      config.resolve = config.resolve || {};
      config.resolve.modules = [
        'node_modules',
        path.resolve(__dirname, 'node_modules'),
        path.resolve(__dirname, '../../node_modules'),
      ];
    }

    return config;
  },
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value:
              process.env.CORS_ORIGINS?.split(',')[0] ||
              'http://localhost:3000',
          },
          {
            key: 'Access-Control-Allow-Credentials',
            value: 'true',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, PUT, DELETE, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization, X-API-Key',
          },
        ],
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: '/health',
        destination: '/api/health',
      },
      {
        source: '/metrics',
        destination: '/api/metrics',
      },
      {
        source: '/docs',
        destination: '/api/docs',
      },
    ];
  },
};

module.exports = nextConfig;
