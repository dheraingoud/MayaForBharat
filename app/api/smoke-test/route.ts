import { NextResponse } from 'next/server'
import { quickVerify } from '@/lib/visual-verifier'
import { healthCheck, storeLastKnownGood } from '@/lib/deploy'
import { getApp, updateApp } from '@/lib/store'
import { getBuildsDir } from '@/lib/path'

export const runtime = 'nodejs'

/**
 * POST /api/smoke-test
 * Runs a comprehensive smoke test against a deployed app.
 * Combines health check + visual verification + page crawl.
 * 
 * From MAYA-IMPORTANT.md Part 5:
 * "Unit tests remain the foundation, but E2E tests have grown in proportion."
 * 
 * Body: { appId: string, url?: string }
 */
export async function POST(request: Request) {
  try {
    const { appId, url: overrideUrl } = await request.json()

    if (!appId) {
      return NextResponse.json({ error: 'appId is required' }, { status: 400 })
    }

    const app = await getApp(appId)
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 })
    }

    const testUrl = overrideUrl || app.url
    if (!testUrl) {
      return NextResponse.json({ error: 'No URL available for testing' }, { status: 400 })
    }

    const results: Array<{
      test: string
      passed: boolean
      duration: number
      details: string
    }> = []

    // ── Test 1: Health Check (homepage returns 200) ──
    const t1Start = Date.now()
    const health = await healthCheck(testUrl)
    results.push({
      test: 'Homepage Health Check',
      passed: health.passed,
      duration: Date.now() - t1Start,
      details: health.passed ? `HTTP ${health.statusCode} — page loaded` : `Failed: ${health.error}`,
    })

    // ── Test 2: Quick Content Verification ──
    const t2Start = Date.now()
    const contentCheck = await quickVerify(testUrl)
    results.push({
      test: 'Content Verification',
      passed: contentCheck.healthy,
      duration: Date.now() - t2Start,
      details: contentCheck.healthy 
        ? `Page has ${contentCheck.contentLength} bytes of content` 
        : `Issues: ${contentCheck.errors.join(', ')}`,
    })

    // ── Test 3: Admin Route Check ──
    const t3Start = Date.now()
    try {
      const adminRes = await fetch(`${testUrl}/admin`, {
        redirect: 'follow',
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'MAYA-SmokeTest/1.0' },
      })
      const adminPassed = adminRes.ok || adminRes.status === 401 || adminRes.status === 403
      results.push({
        test: 'Admin Route Exists',
        passed: adminPassed,
        duration: Date.now() - t3Start,
        details: adminPassed ? `Admin route responded (${adminRes.status})` : `Admin route returned ${adminRes.status}`,
      })
    } catch (e) {
      results.push({
        test: 'Admin Route Exists',
        passed: false,
        duration: Date.now() - t3Start,
        details: `Failed: ${e instanceof Error ? e.message : String(e)}`,
      })
    }

    // ── Test 4: Static Assets Check (CSS/JS loading) ──
    const t4Start = Date.now()
    try {
      const res = await fetch(testUrl, { 
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'MAYA-SmokeTest/1.0' }
      })
      const html = await res.text()
      
      // Check for CSS/JS references
      const hasStylesheet = html.includes('stylesheet') || html.includes('.css')
      const hasScript = html.includes('<script') || html.includes('.js')
      const hasReact = html.includes('__next') || html.includes('_next')
      
      const staticsPassed = hasStylesheet && hasScript && hasReact
      results.push({
        test: 'Static Assets Present',
        passed: staticsPassed,
        duration: Date.now() - t4Start,
        details: `CSS: ${hasStylesheet}, JS: ${hasScript}, Next.js: ${hasReact}`,
      })
    } catch (e) {
      results.push({
        test: 'Static Assets Present',
        passed: false,
        duration: Date.now() - t4Start,
        details: `Failed to check: ${e instanceof Error ? e.message : String(e)}`,
      })
    }

    // ── Test 5: Response Time Check ──
    const t5Start = Date.now()
    try {
      await fetch(testUrl, { 
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'MAYA-SmokeTest/1.0' }
      })
      const responseTime = Date.now() - t5Start
      const timePassed = responseTime < 5000 // Under 5 seconds
      results.push({
        test: 'Response Time',
        passed: timePassed,
        duration: responseTime,
        details: timePassed ? `${responseTime}ms (under 5s threshold)` : `${responseTime}ms (over 5s threshold)`,
      })
    } catch (e) {
      results.push({
        test: 'Response Time',
        passed: false,
        duration: Date.now() - t5Start,
        details: `Timeout: ${e instanceof Error ? e.message : String(e)}`,
      })
    }

    // ── Test 6: Console Error Check (via HTML error markers) ──
    const t6Start = Date.now()
    try {
      const res = await fetch(testUrl, {
        signal: AbortSignal.timeout(10000),
        headers: { 'User-Agent': 'MAYA-SmokeTest/1.0' }
      })
      const html = await res.text()
      
      const jsErrors = [
        'Unhandled Runtime Error',
        'TypeError:',
        'ReferenceError:',
        'SyntaxError:',
        'Cannot read properties',
        'is not defined',
        'is not a function',
      ]
      
      const foundErrors = jsErrors.filter(err => html.includes(err))
      const noErrors = foundErrors.length === 0
      
      results.push({
        test: 'No JS Runtime Errors',
        passed: noErrors,
        duration: Date.now() - t6Start,
        details: noErrors ? 'No runtime errors in page HTML' : `Found: ${foundErrors.join(', ')}`,
      })
    } catch (e) {
      results.push({
        test: 'No JS Runtime Errors',
        passed: false,
        duration: Date.now() - t6Start,
        details: `Check failed: ${e instanceof Error ? e.message : String(e)}`,
      })
    }

    const totalPassed = results.filter(r => r.passed).length
    const totalTests = results.length
    const allPassed = totalPassed === totalTests
    const totalDuration = results.reduce((sum, r) => sum + r.duration, 0)

    // If all tests pass and this is a preview, store as last known good candidate
    if (allPassed && app.projectId && app.deploymentId) {
      const appDir = getBuildsDir(appId)
      await storeLastKnownGood(appDir, app.deploymentId, testUrl).catch(() => {})
    }

    return NextResponse.json({
      success: true,
      testedAt: new Date().toISOString(),
      url: testUrl,
      appId,
      allPassed,
      score: `${totalPassed}/${totalTests}`,
      totalDuration: `${totalDuration}ms`,
      results,
    })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[api/smoke-test]', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}
