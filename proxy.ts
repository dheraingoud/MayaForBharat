import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

const isPublicRoute = createRouteMatcher([
  '/',
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api(.*)',
  '/_next/(.*)',
  '/favicon.ico',
])

const hasClerkKey = !!(
  process.env.CLERK_SECRET_KEY &&
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
)

/**
 * Check if the request is for a workbench route that needs COOP/COEP headers
 * for WebContainer (SharedArrayBuffer) support.
 */
function isWorkbenchRoute(pathname: string): boolean {
  return pathname === '/workbench' || pathname.startsWith('/workbench/')
}

/**
 * Add Cross-Origin Isolation headers required by WebContainer.
 * These enable SharedArrayBuffer which WebContainer needs for in-browser Node.js.
 */
function addCrossOriginHeaders(response: NextResponse): NextResponse {
  response.headers.set('Cross-Origin-Embedder-Policy', 'credentialless')
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin')
  return response
}

/**
 * Proxy (formerly middleware) — Next.js 16 convention.
 * - When Clerk keys are configured: protects all non-public routes
 * - When Clerk keys are NOT configured: passes through all requests
 * - For /workbench routes: always adds COOP/COEP headers for WebContainer
 */
export default hasClerkKey
  ? clerkMiddleware(async (auth, req) => {
      if (!isPublicRoute(req)) {
        const { userId, redirectToSignIn } = await auth()
        if (!userId) {
          return redirectToSignIn({ returnBackUrl: req.url })
        }
      }
      // Add COOP/COEP for workbench routes
      const url = new URL(req.url)
      if (isWorkbenchRoute(url.pathname)) {
        const response = NextResponse.next()
        return addCrossOriginHeaders(response)
      }
    })
  : (req: NextRequest) => {
      const url = new URL(req.url)
      const response = NextResponse.next()
      // Add COOP/COEP for workbench routes
      if (isWorkbenchRoute(url.pathname)) {
        return addCrossOriginHeaders(response)
      }
      return response
    }

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
