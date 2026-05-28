/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // Build-time type checking (CI will handle strict checks separately)
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Allow cross-origin during dev; production served via Vercel
  async headers() {
    return [
      {
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET,POST,PUT,DELETE,OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type,Authorization' },
        ],
      },
      {
        // Allow Vercel-deployed apps to be embedded in iframes for live preview
        source: '/app/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          {
            key: 'Content-Security-Policy',
            value: "frame-ancestors 'self' https://*.vercel.app https://*.vercel.sh http://localhost:*",
          },
        ],
      },
    ]
  },
}

export default nextConfig
