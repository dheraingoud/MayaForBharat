import { NextResponse } from 'next/server'
import { quickVerify } from '@/lib/visual-verifier'
import { getApp, getAllApps, updateApp } from '@/lib/store'
import { rollbackToLastKnownGood } from '@/lib/deploy'
import { getBuildsDir } from '@/lib/path'

export const runtime = 'nodejs'

/**
 * POST /api/health-check
 * Runs health checks against all live apps (or a specific app).
 * Auto-rolls back to last known good deployment if health check fails.
 * 
 * Body: { appId?: string } — if omitted, checks ALL live apps
 * 
 * From MAYA-IMPORTANT.md Part 5/6:
 * "Build a scheduled action that pings every live app's homepage every 5 minutes.
 *  On failure, automatically call promoteToProduction() with the last known-good
 *  deployment ID."
 */
export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const { appId } = body as { appId?: string }

    let appsToCheck: Array<{ id: string; url: string; projectId: string; status: string }> = []

    if (appId) {
      const app = await getApp(appId)
      if (!app) return NextResponse.json({ error: 'App not found' }, { status: 404 })
      if (app.status !== 'live') return NextResponse.json({ error: 'App is not live' }, { status: 400 })
      appsToCheck.push({ id: app.id, url: app.url, projectId: app.projectId, status: app.status })
    } else {
      const allApps = await getAllApps()
      appsToCheck = allApps
        .filter(a => a.status === 'live' && a.url)
        .map(a => ({ id: a.id, url: a.url, projectId: a.projectId, status: a.status }))
    }

    const results: Array<{
      appId: string
      url: string
      healthy: boolean
      statusCode: number
      errors: string[]
      rolledBack: boolean
      rollbackUrl?: string
    }> = []

    for (const app of appsToCheck) {
      const health = await quickVerify(app.url)
      
      let rolledBack = false
      let rollbackUrl: string | undefined

      if (!health.healthy) {
        console.warn(`[health-check] App ${app.id} (${app.url}) is unhealthy:`, health.errors)
        
        // Attempt auto-rollback
        const appDir = getBuildsDir(app.id)
        const rollbackResult = await rollbackToLastKnownGood(appDir, app.projectId)
        
        if (rollbackResult.success && rollbackResult.url) {
          rolledBack = true
          rollbackUrl = rollbackResult.url
          
          // Update app URL to rolled-back version
          await updateApp(app.id, { url: rollbackResult.url })
          console.log(`[health-check] Auto-rolled back ${app.id} to ${rollbackUrl}`)
        } else {
          console.error(`[health-check] Rollback failed for ${app.id}:`, rollbackResult.error)
        }
      }

      results.push({
        appId: app.id,
        url: app.url,
        healthy: health.healthy,
        statusCode: health.statusCode,
        errors: health.errors,
        rolledBack,
        rollbackUrl,
      })
    }

    const allHealthy = results.every(r => r.healthy || r.rolledBack)
    const anyRollbacks = results.some(r => r.rolledBack)

    return NextResponse.json({
      success: true,
      checkedAt: new Date().toISOString(),
      totalApps: results.length,
      allHealthy,
      anyRollbacks,
      results,
    })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[api/health-check]', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}

/**
 * GET /api/health-check
 * Returns health status of all live apps without triggering rollback.
 */
export async function GET() {
  try {
    const allApps = await getAllApps()
    const liveApps = allApps.filter(a => a.status === 'live' && a.url)

    const results = await Promise.all(
      liveApps.map(async (app) => {
        const health = await quickVerify(app.url)
        return {
          appId: app.id,
          name: app.name,
          url: app.url,
          healthy: health.healthy,
          statusCode: health.statusCode,
          contentLength: health.contentLength,
          errors: health.errors,
        }
      })
    )

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      totalApps: results.length,
      healthyApps: results.filter(r => r.healthy).length,
      unhealthyApps: results.filter(r => !r.healthy).length,
      results,
    })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[api/health-check]', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}
