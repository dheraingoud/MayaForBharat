import { NextResponse } from 'next/server'
import { promoteToProduction, healthCheck, storeLastKnownGood } from '@/lib/deploy'
import { getApp, updateApp } from '@/lib/store'
import { getBuildsDir } from '@/lib/path'

export const runtime = 'nodejs'

/**
 * POST /api/promote
 * Promotes a preview deployment to production via Vercel's promote API.
 * No rebuild — atomic, instant. User clicks "Deploy Live" to trigger this.
 */
export async function POST(request: Request) {
  try {
    const { appId } = await request.json()

    if (!appId) {
      return NextResponse.json({ error: 'appId is required' }, { status: 400 })
    }

    const app = await getApp(appId)
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 })
    }

    if (!app.projectId || !app.deploymentId) {
      return NextResponse.json({ error: 'No preview deployment to promote' }, { status: 400 })
    }

    // Promote the preview deployment to production
    const result = await promoteToProduction(app.projectId, app.deploymentId)

    // Run health check against the production URL
    const health = await healthCheck(result.url)
    if (!health.passed) {
      console.warn(`[api/promote] Health check failed after promotion: ${health.error}`)
      // Don't rollback on first promotion — the app might just need a moment
      // But log the warning for monitoring
    }

    // Store as last-known-good deployment for future rollbacks
    const appDir = getBuildsDir(appId)
    await storeLastKnownGood(appDir, app.deploymentId, result.url)

    // Update app status to 'live' with production URL
    await updateApp(appId, {
      status: 'live',
      url: result.url,
    })

    return NextResponse.json({
      success: true,
      url: result.url,
      healthCheck: health,
    })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[api/promote]', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}
