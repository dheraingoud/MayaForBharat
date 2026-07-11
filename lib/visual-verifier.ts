/**
 * MAYA Visual Verifier — Separate model evaluates screenshots of deployed apps
 * 
 * From MAYA-IMPORTANT.md Part 4:
 * "The Writer cannot grade its own work. A separate model with different
 *  instructions grades the output."
 * 
 * Uses MiniMax M3 (VERIFIER model) — a DIFFERENT model/prompt than the Writer.
 * The Writer (step-3.7-flash) builds. The Verifier (M3) judges.
 */

import { nimVision, MODELS } from './nim-client'
import { VERIFIER_SYSTEM, type PageFinding, type VerificationResult, verifySingleScreenshot } from './verifier-shared'

// Re-export for consumers that import from here
export type { PageFinding, VerificationResult }

// ─── Screenshot Capture (lightweight, no Playwright dependency) ──────────────
// Uses a headless fetch to check if the page is alive, then captures via
// an external screenshot API or falls back to content analysis.

async function captureScreenshot(url: string): Promise<string | null> {
  try {
    // Use a free screenshot API for basic capture
    // In production, replace with a self-hosted service
    const screenshotUrl = `https://api.screenshotone.com/take?url=${encodeURIComponent(url)}&viewport_width=390&viewport_height=844&format=png&block_cookie_banners=true&delay=3`
    
    const res = await fetch(screenshotUrl, { signal: AbortSignal.timeout(30000) })
    if (!res.ok) return null
    
    const buffer = await res.arrayBuffer()
    return Buffer.from(buffer).toString('base64')
  } catch {
    return null
  }
}

// ─── Fallback: Content-Based Verification ────────────────────────────────────
// When screenshots aren't available, analyze the HTML content directly.

async function verifyFromContent(url: string, pagePath: string): Promise<PageFinding> {
  try {
    const res = await fetch(`${url}${pagePath}`, { 
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': 'MAYA-Verifier/1.0' }
    })

    if (!res.ok) {
      return {
        page: pagePath,
        confidence: 0,
        brokenElements: [`HTTP ${res.status} error`],
        matchesPurpose: false,
        mobileUsable: false,
        hasContent: false,
        reasoning: `Page returned HTTP ${res.status}`,
      }
    }

    const html = await res.text()
    const brokenElements: string[] = []
    
    // Check for error markers
    const errorMarkers = [
      'Application error', 'Internal Server Error', 'MODULE_NOT_FOUND',
      'NEXT_NOT_FOUND', 'Unhandled Runtime Error', 'Cannot read properties',
      'TypeError', 'ReferenceError',
    ]
    for (const marker of errorMarkers) {
      if (html.includes(marker)) brokenElements.push(`Error: "${marker}" found in page`)
    }

    // Check if page has meaningful content
    const hasContent = html.length > 500 && !html.includes('Application error')
    const hasNav = html.includes('nav') || html.includes('Nav') || html.includes('header')
    const hasMainContent = html.includes('main') || html.includes('section') || html.includes('div')
    
    // Check for blank/empty page
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)
    const bodyContent = bodyMatch?.[1]?.replace(/<script[\s\S]*?<\/script>/gi, '').trim() || ''
    if (bodyContent.length < 100) brokenElements.push('Page appears mostly empty')

    // Check for meta viewport (mobile-ready)
    const hasMobileViewport = html.includes('viewport') && html.includes('width=device-width')
    if (!hasMobileViewport) brokenElements.push('Missing mobile viewport meta tag')

    const confidence = brokenElements.length === 0 ? 0.75 : Math.max(0.1, 0.75 - brokenElements.length * 0.15)

    return {
      page: pagePath,
      confidence,
      brokenElements,
      matchesPurpose: hasMainContent && hasContent,
      mobileUsable: hasMobileViewport,
      hasContent,
      reasoning: brokenElements.length === 0 
        ? 'Content analysis passed — page has content and no error markers'
        : `Found ${brokenElements.length} issue(s) in content analysis`,
    }
  } catch (e) {
    return {
      page: pagePath,
      confidence: 0,
      brokenElements: [`Failed to fetch: ${e instanceof Error ? e.message : String(e)}`],
      matchesPurpose: false,
      mobileUsable: false,
      hasContent: false,
      reasoning: 'Page unreachable',
    }
  }
}

// ─── Main Verification Function ──────────────────────────────────────────────

export async function verifyVisualCorrectness(
  previewUrl: string,
  changedPages: string[] = ['/'],
): Promise<VerificationResult> {
  const findings: PageFinding[] = []

  for (const pagePath of changedPages) {
    const fullUrl = `${previewUrl}${pagePath}`
    
    // Try screenshot-based verification first (vision model)
    const screenshot = await captureScreenshot(fullUrl)
    
    if (screenshot) {
      try {
        // Use shared verifier primitive
        const finding = await verifySingleScreenshot(screenshot, pagePath)
        findings.push(finding)
        continue
      } catch (e) {
        console.warn(`[visual-verifier] Vision model failed for ${pagePath}, falling back to content analysis:`, e)
      }
    }
    
    // Fallback: content-based verification
    const contentResult = await verifyFromContent(previewUrl, pagePath)
    findings.push(contentResult)
  }

  const overallConfidence = findings.length > 0
    ? findings.reduce((sum, f) => sum + f.confidence, 0) / findings.length
    : 0

  return {
    allPassed: findings.every(f => f.confidence >= 0.6 && f.brokenElements.length === 0),
    findings,
    overallConfidence,
  }
}

// ─── Quick Health Verification (lightweight, no vision) ──────────────────────
// Checks if a URL returns 200 with actual content. Used by health check cron.

export async function quickVerify(url: string): Promise<{
  healthy: boolean
  statusCode: number
  contentLength: number
  errors: string[]
}> {
  const errors: string[] = []
  
  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    
    const res = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { 'User-Agent': 'MAYA-HealthCheck/1.0' },
    })
    clearTimeout(timeout)

    if (!res.ok) {
      return { healthy: false, statusCode: res.status, contentLength: 0, errors: [`HTTP ${res.status}`] }
    }

    const html = await res.text()
    
    // Check for error markers
    const errorMarkers = ['Application error', 'Internal Server Error', 'MODULE_NOT_FOUND']
    for (const marker of errorMarkers) {
      if (html.includes(marker)) errors.push(marker)
    }

    // Check minimum content
    if (html.length < 200) errors.push('Page content suspiciously short')

    return {
      healthy: errors.length === 0,
      statusCode: res.status,
      contentLength: html.length,
      errors,
    }
  } catch (e) {
    return {
      healthy: false,
      statusCode: 0,
      contentLength: 0,
      errors: [e instanceof Error ? e.message : String(e)],
    }
  }
}
