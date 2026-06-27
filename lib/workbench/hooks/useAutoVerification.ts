/**
 * useAutoVerification — MANDATORY E2E visual sweep
 *
 * Strategy: After EVERY edit/chat where streaming produces or changes code,
 * wait for the preview to load, then send an aggressive verification prompt
 * to the model asking it to enumerate visible sections, check for blanks,
 * broken routes, missing CSS, and fix anything wrong.
 *
 * This fires ALWAYS — no opt-out, no "only on new messages" guard.
 * Every time the model finishes streaming and a preview exists, we verify.
 *
 * Cross-origin safe: We can't screenshot WebContainer iframes,
 * so we use text-based self-review with a comprehensive 7-point checklist.
 */
import { useRef, useEffect, useCallback } from 'react'
import { workbenchStore } from '@/lib/workbench/stores/workbench'
import { createScopedLogger } from '@/lib/workbench/utils/logger'

const logger = createScopedLogger('AutoVerify')

interface AutoVerifyOptions {
  /** Whether model streaming is in progress */
  isLoading: boolean
  /** Current model name */
  model: string
  /** Current provider name */
  providerName: string
  /** Function to send a chat message */
  chatSendMessage: (args: { text: string }) => void
  /** Whether to enable auto-verification (defaults to true) */
  enabled?: boolean
  /** Max verification attempts per preview URL */
  maxVerifications?: number
}

/**
 * Monitors the preview iframe and sends mandatory verification requests
 * after EVERY edit/chat that produces a preview.
 */
export function useAutoVerification({
  isLoading,
  model,
  providerName,
  chatSendMessage,
  enabled = true,
  maxVerifications = 1,
}: AutoVerifyOptions) {
  const verificationCountRef = useRef(0)
  const lastVerifiedPreviewRef = useRef<string | null>(null)
  const verifyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blankCheckTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /**
   * Check if the preview iframe appears to be showing content.
   * Since we can't access cross-origin iframe DOM, we check:
   * 1. iframe exists and has loaded (onLoad fired)
   * 2. iframe has non-zero dimensions
   * 3. No error messages received via postMessage
   */
  const checkPreviewHealth = useCallback((): 'healthy' | 'blank' | 'missing' => {
    const iframe = document.querySelector('iframe[title="Preview"], iframe[title="preview"]') as HTMLIFrameElement
    if (!iframe) return 'missing'

    const rect = iframe.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return 'blank'

    // Check if iframe src is set and loaded
    if (!iframe.src || iframe.src === 'about:blank') return 'blank'

    return 'healthy'
  }, [])

  /**
   * Listen for error messages from the preview iframe via postMessage.
   * WebContainer apps can post errors to parent window.
   */
  useEffect(() => {
    if (!enabled) return

    const errorMessages: string[] = []

    const handleMessage = (event: MessageEvent) => {
      // Collect error reports from preview
      if (
        event.data?.type === 'PREVIEW_ERROR' ||
        event.data?.type === 'bolt:runtime-error' ||
        event.data?.type === 'error'
      ) {
        const msg = event.data.message || event.data.error || 'Unknown error'
        errorMessages.push(msg)
        logger.warn('[AutoVerify] Received error from preview:', msg)
      }

      // Some frameworks send 'ready' or similar messages
      if (event.data?.type === 'PREVIEW_READY' || event.data?.type === 'bolt:ready') {
        logger.info('[AutoVerify] Preview reported ready')
      }
    }

    window.addEventListener('message', handleMessage)

    // Expose error collector for the verification function
    ;(window as any).__PREVIEW_ERRORS__ = errorMessages

    return () => {
      window.removeEventListener('message', handleMessage)
      delete (window as any).__PREVIEW_ERRORS__
    }
  }, [enabled])

  /**
   * Send an aggressive E2E verification sweep.
   * Fires after EVERY edit — mandatory, no skipping.
   */
  const sendVerificationMessage = useCallback(async () => {
    if (!enabled || verificationCountRef.current >= maxVerifications) return
    if (isLoading) return

    // Check if preview is actually showing
    const previews = workbenchStore.previews.get()
    if (previews.length === 0) return

    const previewUrl = previews[0]?.baseUrl
    if (!previewUrl || previewUrl === lastVerifiedPreviewRef.current) return

    // Check iframe health
    const health = checkPreviewHealth()
    if (health === 'missing') return

    verificationCountRef.current += 1
    lastVerifiedPreviewRef.current = previewUrl

    // Check for collected preview errors
    const previewErrors = (window as any).__PREVIEW_ERRORS__ as string[] | undefined
    const hasErrors = previewErrors && previewErrors.length > 0

    if (hasErrors) {
      // There ARE runtime errors — send them to the model for fixing
      const errorSummary = previewErrors!.slice(-5).join('\n')
      logger.info(`[AutoVerify] MANDATORY: Sending error-based fix (${previewErrors!.length} errors)`)

      const verifyMsg = `[Model: ${model}]\n\n[Provider: ${providerName}]\n\n*🔴 MANDATORY Auto-Verification: Runtime errors detected in preview.*\n\nThe app loaded but reported these runtime errors:\n\`\`\`\n${errorSummary}\n\`\`\`\n\nFix ALL errors immediately. After fixing, ALWAYS include the FULL build pipeline:\n1. \`<boltAction type="shell">npm install</boltAction>\`\n2. \`<boltAction type="shell">npm run build</boltAction>\`\n3. \`<boltAction type="shell">npx vitest run --reporter=verbose 2>&1 || true</boltAction>\`\n4. \`<boltAction type="start">npm run dev</boltAction>\`\nDo NOT explain. Just output the boltArtifact with fixed files.`

      setTimeout(() => chatSendMessage({ text: verifyMsg }), 1500)

      // Clear collected errors
      if (previewErrors) previewErrors.length = 0
    } else if (health === 'blank') {
      // Iframe exists but may be blank
      logger.info('[AutoVerify] MANDATORY: Preview blank — sending fix request')

      const verifyMsg = `[Model: ${model}]\n\n[Provider: ${providerName}]\n\n*🔴 MANDATORY Auto-Verification: Preview is showing a BLANK screen.*\n\nThe preview iframe loaded but nothing is visible. This MUST be fixed.\n\nCommon causes:\n1. React root not rendering (missing ReactDOM.render/createRoot)\n2. CSS hiding content (display:none, opacity:0, zero height)\n3. Router not matching "/" route\n4. JavaScript errors preventing render\n5. Missing default export in page component\n\nReview and fix the main entry file, App component, and router. After fixing, ALWAYS include the FULL build pipeline:\n1. \`<boltAction type="shell">npm install</boltAction>\`\n2. \`<boltAction type="shell">npm run build</boltAction>\`\n3. \`<boltAction type="shell">npx vitest run --reporter=verbose 2>&1 || true</boltAction>\`\n4. \`<boltAction type="start">npm run dev</boltAction>\`\n\nDo NOT explain. Just output the boltArtifact with fixed files.`

      setTimeout(() => chatSendMessage({ text: verifyMsg }), 1500)
    } else {
      // Preview looks healthy — send the aggressive E2E visual sweep
      logger.info('[AutoVerify] MANDATORY: Preview healthy — sending E2E visual sweep')

      const verifyMsg = `[Model: ${model}]\n\n[Provider: ${providerName}]\n\n*✅ MANDATORY Auto-Verification: E2E Visual Sweep*\n\nThe preview has loaded. Perform a thorough self-review of ALL generated code:\n\n1. **Route check**: Does "/" render visible, styled content? Not blank?\n2. **Component check**: Are all imported components defined and exported?\n3. **CSS check**: Is styling applied? No unstyled raw HTML elements?\n4. **Image check**: Do all images have valid src attributes?\n5. **Layout check**: No horizontal overflow or broken flexbox/grid?\n6. **Interactive check**: Do buttons and links have proper onClick/href?\n7. **Import check**: Are all imports resolving to existing files?\n\nIf ANY issues found, fix them immediately with a boltArtifact.\nIf everything looks correct, respond ONLY with: "✅ Visual sweep complete — app verified."\n\nDo NOT add unnecessary explanations or re-describe the app.`

      setTimeout(() => chatSendMessage({ text: verifyMsg }), 1500)
    }
  }, [enabled, maxVerifications, isLoading, model, providerName, chatSendMessage, checkPreviewHealth])

  // Watch for preview appearing after streaming ends
  useEffect(() => {
    if (isLoading || !enabled) {
      // Reset when new streaming starts — allow re-verification for next edit
      if (isLoading) {
        verificationCountRef.current = 0
        lastVerifiedPreviewRef.current = null
      }
      if (verifyTimerRef.current) {
        clearTimeout(verifyTimerRef.current)
        verifyTimerRef.current = null
      }
      if (blankCheckTimerRef.current) {
        clearTimeout(blankCheckTimerRef.current)
        blankCheckTimerRef.current = null
      }
      return
    }

    // After streaming ends, watch for preview to appear
    const unsubscribe = workbenchStore.previews.subscribe((previews) => {
      if (previews.length > 0 && !isLoading) {
        // Preview just appeared — wait 10s for full render, then verify
        if (verifyTimerRef.current) clearTimeout(verifyTimerRef.current)
        verifyTimerRef.current = setTimeout(() => {
          sendVerificationMessage()
        }, 10000) // 10s delay to let SPA routers settle and collect errors
      }
    })

    return () => {
      unsubscribe()
      if (verifyTimerRef.current) {
        clearTimeout(verifyTimerRef.current)
        verifyTimerRef.current = null
      }
      if (blankCheckTimerRef.current) {
        clearTimeout(blankCheckTimerRef.current)
        blankCheckTimerRef.current = null
      }
    }
  }, [isLoading, enabled, sendVerificationMessage])

  return {
    checkPreviewHealth,
    sendVerificationMessage,
    verificationCount: verificationCountRef.current,
  }
}
