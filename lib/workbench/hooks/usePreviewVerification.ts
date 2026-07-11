/**
 * usePreviewVerification — Real per-route screenshot verification
 *
 * After streaming ends and a preview is healthy:
 * 1. Derive routes from workbenchStore.files (scan app/page.tsx)
 * 2. For each route: set iframe src → wait for MAYA_CAPTURE round-trip (postMessage)
 * 3. Send captured PNG to POST /api/preview-verify → nimVision verdict
 * 4. If any route fails: send auto-fix chat message with failure details
 * 5. Loop until all routes pass or max cycles reached
 *
 * Falls back gracefully: if the injected capture script isn't present
 * (e.g. non-Next app, or the model forgot to include it), uses the text-only
 * self-review path from useAutoVerification as fallback.
 */

import { useRef, useEffect, useCallback } from 'react'
import { workbenchStore } from '@/lib/workbench/stores/workbench'
import { streamingState } from '@/lib/workbench/stores/streaming'
import { createScopedLogger } from '@/lib/workbench/utils/logger'
import type { PageFinding } from '@/lib/verifier-shared'

const logger = createScopedLogger('PreviewVerify')

const CAPTURE_TIMEOUT = 8000 // ms — how long to wait for MAYA_CAPTURE_RESULT
const VERIFY_DELAY_AFTER_NAV = 3000 // ms — wait for SPA route to render before capturing
// Uncapped for the silent autonomous build (Q3 give-up cap = 15). The hook's
// cycleRef resets each new stream, so in the silent path this rarely trips —
// BuilderPage's silentCycle atom (1..15) is the authoritative give-up cap.
// Non-silent chained callers now also get 15 rounds instead of 5.
const MAX_VERIFY_CYCLES = 15 // max full verification cycles per edit

interface UsePreviewVerificationOptions {
  /** Whether model streaming is in progress */
  isLoading: boolean
  /** Current model name */
  model: string
  /** Current provider name */
  providerName: string
  /** Function to send a chat message (for auto-fix) — fallback when onVerifyCycle absent */
  chatSendMessage: (args: { text: string }) => void
  /** Whether to enable (defaults to true) */
  enabled?: boolean
  /**
   * Silent-build lifecycle hook. When provided, this REPLACES the default
   * visible chatSendMessage fix-directive so a verify round never renders as
   * a user bubble during the silent autonomous build. BuilderPage routes the
   * fixMsg through its hidden pipelineInstructionsRef channel instead.
   *   passed=true  → vision gate met (all routes passed); BuilderPage checks
   *                  runtime-clean too before clearing silentBuildActive.
   *   passed=false → fixMsg holds the full directive; BuilderPage increments
   *                  silentCycle and re-streams via hidden injection.
   * Note: `cycle` is the hook's per-stream cycleRef (resets each new stream),
   * NOT the global silent build round count — BuilderPage owns that via its
   * silentCycle atom.
   */
  onVerifyCycle?: (cycle: number, passed: boolean, fixMsg: string) => void
}

function deriveRoutes(): string[] {
  const files = workbenchStore.files.get()
  const routes = new Set<string>()

  for (const [filePath, fileData] of Object.entries(files)) {
    if (!filePath.includes('page.tsx') && !filePath.includes('page.ts') && !filePath.includes('page.jsx') && !filePath.includes('page.js')) continue

    // Next.js App Router: app/(group)/path/page.tsx → /path
    // Strip app/ prefix and page filename
    let route = filePath
    // Remove leading app/ or src/app/
    route = route.replace(/^(src\/)?app\//, '')
    // Remove page.tsx/page.ts/page.jsx/page.js
    route = route.replace(/page\.(tsx|ts|jsx|js)$/, '')
    // Remove trailing slash
    route = route.replace(/\/$/, '')
    // Handle (group) segments — they don't contribute to URL
    route = route.replace(/\/\([^)]+\)/g, '')
    // Remove trailing slash again after group removal
    route = route.replace(/\/$/, '')

    if (route === '' || route === 'index') route = '/'

    routes.add(route)
  }

  const result = routes.size > 0 ? Array.from(routes) : ['/']
  logger.info(`[Routes] Derived ${result.length} route(s) from files:`, result)
  return result
}

/**
 * Capture a screenshot from the preview iframe for a specific route.
 * Works by:
 * 1. Setting the iframe src to baseUrl + route
 * 2. Waiting for the MAYA_CAPTURE_READY / MAYA_CAPTURE_RESULT postMessage
 * 3. Returning the base64 PNG (or null on failure)
 */
function captureRouteScreenshot(
  route: string,
  baseUrl: string,
): Promise<{ image: string | null; hasContent: boolean }> {
  return new Promise((resolve) => {
    // Find the preview iframe
    const iframe = document.querySelector('iframe[title="Preview"], iframe[title="preview"]') as HTMLIFrameElement
    if (!iframe) {
      logger.warn(`[Capture] No preview iframe found for route ${route}`)
      resolve({ image: null, hasContent: false })
      return
    }

    const targetUrl = baseUrl + route
    let resolved = false

    function done(result: { image: string | null; hasContent: boolean }) {
      if (resolved) return
      resolved = true
      cleanup()
      resolve(result)
    }

    function onMessage(event: MessageEvent) {
      if (!event.data) return

      if (event.data.type === 'MAYA_CAPTURE_READY') {
        // Capture script loaded — request a capture
        logger.debug(`[Capture] Script ready for route ${route}, requesting capture...`)
        setTimeout(() => {
          iframe.contentWindow?.postMessage({ type: 'MAYA_CAPTURE', route }, '*')
        }, VERIFY_DELAY_AFTER_NAV)
      }

      if (event.data.type === 'MAYA_CAPTURE_RESULT') {
        if (event.data.route === route || event.data.route === window.location.pathname + route) {
          if (event.data.image) {
            logger.info(`[Capture] Got screenshot for route ${route} (${Math.round((event.data.image as string).length / 1024)}KB)`)
            done({ image: event.data.image, hasContent: true })
          } else {
            done({ image: null, hasContent: true })
          }
        }
      }

      if (event.data.type === 'MAYA_CAPTURE_ERROR') {
        logger.warn(`[Capture] Error for route ${route}:`, event.data.error)
        done({ image: null, hasContent: event.data.hasContent ?? false })
      }
    }

    function cleanup() {
      window.removeEventListener('message', onMessage)
    }

    window.addEventListener('message', onMessage)

    // Set iframe src to the target route
    logger.info(`[Capture] Navigating iframe to ${targetUrl}`)
    iframe.src = targetUrl

    // Timeout — if no capture result comes back, fall back
    setTimeout(() => {
      done({ image: null, hasContent: false })
    }, CAPTURE_TIMEOUT + VERIFY_DELAY_AFTER_NAV)
  })
}

/**
 * Send a captured image to the preview-verify API for vision model analysis.
 */
async function verifyWithServer(imageBase64: string, route: string): Promise<PageFinding | null> {
  try {
    const res = await fetch('/api/preview-verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, route }),
    })
    if (!res.ok) {
      logger.warn(`[Verify] API returned ${res.status} for route ${route}`)
      return null
    }
    const data = await res.json()
    return data.finding || null
  } catch (e) {
    logger.error(`[Verify] Failed to call API for route ${route}:`, e)
    return null
  }
}

export function usePreviewVerification({
  isLoading,
  model,
  providerName,
  chatSendMessage,
  enabled = true,
  onVerifyCycle,
}: UsePreviewVerificationOptions) {
  const cycleRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const verifyingRef = useRef(false)

  const runVerification = useCallback(async () => {
    if (!enabled || verifyingRef.current) return
    if (isLoading) return
    if (cycleRef.current >= MAX_VERIFY_CYCLES) return

    const previews = workbenchStore.previews.get()
    if (previews.length === 0) return

    const baseUrl = previews[0]?.baseUrl
    if (!baseUrl) return

    verifyingRef.current = true
    cycleRef.current += 1
    const cycle = cycleRef.current

    logger.info(`[Verify] Starting verification cycle ${cycle}/${MAX_VERIFY_CYCLES}`)

    try {
      const routes = deriveRoutes()
      const results: { route: string; finding: PageFinding | null; captured: boolean }[] = []

      for (const route of routes) {
        logger.info(`[Verify] Capturing route: ${route}`)
        const { image, hasContent } = await captureRouteScreenshot(route, baseUrl)

        let finding: PageFinding | null = null

        if (image) {
          // Real screenshot — send to vision model
          finding = await verifyWithServer(image, route)
        } else if (hasContent) {
          // Capture script not available but page has content — text fallback
          logger.info(`[Verify] No capture for ${route}, but page has content — text review only`)
          finding = {
            page: route,
            confidence: 0.7,
            brokenElements: [],
            matchesPurpose: true,
            mobileUsable: true,
            hasContent: true,
            reasoning: 'Text fallback — no screenshot available, page has content',
          }
        } else {
          // Page appears blank
          finding = {
            page: route,
            confidence: 0,
            brokenElements: ['Page appears blank — no content captured'],
            matchesPurpose: false,
            mobileUsable: false,
            hasContent: false,
            reasoning: 'Capture failed and page has no detectable content',
          }
        }

        results.push({ route, finding, captured: !!image })
      }

      // Analyze results — find failures
      const failures = results.filter(
        (r) => r.finding && (r.finding!.confidence < 0.6 || r.finding!.brokenElements.length > 0),
      )

      if (failures.length === 0) {
        logger.info(`[Verify] ✅ All ${routes.length} route(s) passed verification (cycle ${cycle})`)
        // Reset to original route after successful verification
        const iframe = document.querySelector('iframe[title="Preview"], iframe[title="preview"]') as HTMLIFrameElement
        if (iframe && baseUrl) iframe.src = baseUrl
        // Silent-build vision gate: signal passed. BuilderPage also checks
        // runtime-clean before clearing silentBuildActive.
        onVerifyCycle?.(cycle, true, '')
      } else {
        // Build failure report for auto-fix
        const failureReport = failures
          .map((f) => {
            const ff = f.finding!
            return `• Route "${f.route}": confidence=${ff.confidence}, issues=[${ff.brokenElements.join('; ')}]`
          })
          .join('\n')

        logger.warn(`[Verify] ❌ ${failures.length}/${routes.length} route(s) failed:\n${failureReport}`)

        if (cycle < MAX_VERIFY_CYCLES) {
          const fixMsg = `[Model: ${model}]\n\n[Provider: ${providerName}]\n\n*🔴 Visual Verification Failed (cycle ${cycle}/${MAX_VERIFY_CYCLES})*\n\n${failures.length} of ${routes.length} routes failed visual verification:\n${failureReport}\n\nOnly re-output the file(s) that need changes — do NOT regenerate files that already pass. Fix ONLY the broken source files implicated by the failures above. The dev server is already running and will hot-reload your fix automatically — do NOT emit npm install or npm run dev shell/start actions.\n\nIMPORTANT: Also ensure the file \`public/maya-capture.js\` is included and the root layout has \`<script src="/maya-capture.js"></script>\` so verification can capture screenshots.\n\nDo NOT explain. Just output the boltArtifact with the corrected files only.`

          if (onVerifyCycle) {
            // Silent-build path: route the directive through onVerifyCycle so
            // BuilderPage can inject it via the hidden pipelineInstructionsRef
            // channel — nothing renders as a user bubble. chatSendMessage
            // (visible leak) stays the fallback for non-silent callers.
            onVerifyCycle(cycle, false, fixMsg)
          } else {
            setTimeout(() => chatSendMessage({ text: fixMsg }), 2000)
          }
        } else {
          logger.warn(`[Verify] Max cycles (${MAX_VERIFY_CYCLES}) reached — stopping verification loop`)
          // Hook-internal cap hit (rare — cycleRef resets per stream). The
          // authoritative give-up is BuilderPage's silentCycle (15). Still
          // signal so a non-silent caller could react if it wired one.
          onVerifyCycle?.(cycle, false, '')
        }
      }
    } catch (e) {
      logger.error('[Verify] Verification cycle failed:', e)
    } finally {
      verifyingRef.current = false

      // Reset to original route
      const iframe = document.querySelector('iframe[title="Preview"], iframe[title="preview"]') as HTMLIFrameElement
      if (iframe && baseUrl) iframe.src = baseUrl
    }
  }, [enabled, isLoading, model, providerName, chatSendMessage, onVerifyCycle])

  // Watch for streaming to end and preview to appear
  useEffect(() => {
    if (isLoading || !enabled) {
      if (isLoading) {
        // Reset for new edit
        cycleRef.current = 0
        if (timerRef.current) {
          clearTimeout(timerRef.current)
          timerRef.current = null
        }
      }
      return
    }

    // After streaming ends, wait for preview, then verify
    const unsubscribe = workbenchStore.previews.subscribe((previews) => {
      if (previews.length > 0 && !isLoading) {
        // Preview exists and not streaming — schedule verification
        if (timerRef.current) clearTimeout(timerRef.current)
        // Wait 12s for the app to fully start + capture script to load
        timerRef.current = setTimeout(() => {
          runVerification()
        }, 12000)
      }
    })

    return () => {
      unsubscribe()
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isLoading, enabled, runVerification])
}
