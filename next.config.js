/** @type {import('next').NextConfig} */
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
    domains: ['your-supabase-project.supabase.co'],
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
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ]
  },

  // Optimize for Vercel's edge runtime
  poweredByHeader: false,
}

module.exports = nextConfig
