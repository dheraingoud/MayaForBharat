import { NextResponse } from 'next/server'
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
 * Clerk middleware:
 * - When Clerk keys are configured: protects all non-public routes
 * - When Clerk keys are NOT configured: still requires auth, sign-in page shows config error
 */
export default hasClerkKey
  ? clerkMiddleware(async (auth, req) => {
      if (!isPublicRoute(req)) {
        const { userId, redirectToSignIn } = await auth()
        if (!userId) {
          return redirectToSignIn({ returnBackUrl: req.url })
        }
      }
    })
  : (req: Request) => {
      // Clerk not configured — block non-public routes so they go to sign-in page
      const url = new URL(req.url)
      const path = url.pathname
      const isPublic =
        path === '/' ||
        path.startsWith('/sign-in') ||
        path.startsWith('/sign-up') ||
        path.startsWith('/api') ||
        path.startsWith('/_next') ||
        path === '/favicon.ico'
      if (!isPublic && path !== '/sign-in' && path !== '/sign-up') {
        return NextResponse.redirect(new URL('/sign-in', url))
      }
      return NextResponse.next()
    }

export const config = {
  matcher: [
    // Skip Next.js internals and static files
    '/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
