import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    // TODO: Set back to false once all workbench porting type errors are resolved
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  // Pin turbopack's workspace root to this app dir. Without this, Next infers the
  // root from the nearest lockfile — and a stray ~/package-lock.json makes it
  // pick the home dir, which leaves vendored /api/workbench/* routes stuck on a
  // stale compile cache (they 404 until manually touched). Pinning here forces
  // correct invalidation and module resolution.
  turbopack: {
    root: __dirname,
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
