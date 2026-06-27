/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // TODO: Set back to false once all workbench porting type errors are resolved
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
      {
        // WebContainer COOP/COEP headers — REQUIRED for in-browser Node.js (SharedArrayBuffer)
        // Must cover BOTH the exact /workbench path AND all sub-paths
        source: '/workbench',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
      {
        source: '/workbench/:path*',
        headers: [
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
        ],
      },
    ]
  },
}

export default nextConfig
