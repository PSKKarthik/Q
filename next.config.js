/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs')

const nextConfig = {
  // Prevent webpack from bundling Node.js-only packages used in API routes.
  // pdf-parse reads test files via fs at module init; jszip uses Node Buffers.
  // Without this they fail silently when Next.js bundles them for the edge.
  // Enable experimental features compatible with latest Vercel
  experimental: {
    // Enable faster builds with SWC
    swcMinify: true,
    serverComponentsExternalPackages: ['pdf-parse', 'jszip'],
  },

  // Optimize images for Vercel
  images: {
    // Allow images from Supabase storage
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'udfzxrmvbyfesxutklof.supabase.co',
        pathname: '/storage/v1/object/**',
      },
    ],
    // Enable modern image formats
    formats: ['image/webp', 'image/avif'],
  },

  // Headers for service worker and security
  async headers() {
    return [
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
      // Security headers
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "worker-src blob: 'self'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' blob: data: https://udfzxrmvbyfesxutklof.supabase.co",
              "font-src 'self'",
              "connect-src 'self' https://udfzxrmvbyfesxutklof.supabase.co wss://udfzxrmvbyfesxutklof.supabase.co https://api.groq.com",
              "media-src 'self' https://udfzxrmvbyfesxutklof.supabase.co blob:",
              "frame-src 'self' https://udfzxrmvbyfesxutklof.supabase.co meet.jit.si www.youtube-nocookie.com www.youtube.com docs.google.com",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
              "upgrade-insecure-requests",
            ].join('; '),
          },
        ],
      },
    ]
  },

  // Optimize for Vercel's edge runtime
  poweredByHeader: false,
}

module.exports = withSentryConfig(nextConfig, {
  // Sentry webpack plugin options
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // Suppress source map upload logs in CI
  silent: !process.env.CI,
  // Upload source maps only when SENTRY_AUTH_TOKEN is present
  authToken: process.env.SENTRY_AUTH_TOKEN,
  // Disable source map upload if auth token is absent (local dev)
  sourcemaps: {
    disable: !process.env.SENTRY_AUTH_TOKEN,
  },
  // Tree-shake Sentry debug logging in production bundles
  webpack: {
    treeshake: {
      removeDebugLogging: true,
    },
  },
})
