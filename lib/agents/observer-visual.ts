/**
 * MAYA Observer (Visual) — Multimodal screenshot analysis
 * Model: stepfun-ai/step-3.7-flash (fast vision at low cost)
 *
 * Takes a screenshot of the live app and analyzes it for visual issues,
 * layout problems, and accessibility concerns.
 *
 * Supports two modes:
 * 1. Direct base64 screenshot (for pre-captured images)
 * 2. URL mode: uses Microlink public API to capture a live screenshot automatically
 */

import { nimVision, MODELS } from '../nim-client'

export interface VisualSignals {
  hasVisualIssues: boolean
  visualIssues: string[]
  layoutProblems: string[]
  accessibilityNotes: string[]
  suggestedFixes: string[]
}

const VISUAL_PROMPT_PREFIX = `[CAVEMAN] Analyze this app screenshot for a mobile-first Indian small business app.`

const VISUAL_PROMPT_RULES = `Focus on:
- Mobile layout issues (designed for 390x844 viewport)
- Text readability and contrast
- Missing or broken UI elements
- Hindi text rendering issues
- Touch target sizes (min 44px)

Set hasVisualIssues=false if everything looks good.
Max 3 items per array. Be specific about what and where.`

function buildPrompt(appContext: { name: string; description: string; designSystem: string }): string {
  return `${VISUAL_PROMPT_PREFIX}

App: ${appContext.name} — ${appContext.description}
Design system: ${appContext.designSystem}

Respond in JSON only:
{"hasVisualIssues":boolean,"visualIssues":string[],"layoutProblems":string[],"accessibilityNotes":string[],"suggestedFixes":string[]}

${VISUAL_PROMPT_RULES}`
}

function parseVisualSignals(raw: string): VisualSignals {
  try {
    return JSON.parse(raw) as VisualSignals
  } catch {
    const jsonMatch = raw.match(/\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/)
    if (jsonMatch?.[1]) {
      return JSON.parse(jsonMatch[1].trim()) as VisualSignals
    }
    // Fallback: no visual issues detected
    return {
      hasVisualIssues: false,
      visualIssues: [],
      layoutProblems: [],
      accessibilityNotes: [],
      suggestedFixes: [],
    }
  }
}

/**
 * Analyze a pre-captured screenshot (base64 mode).
 */
export async function observerVisualAgent(
  screenshotBase64: string,
  appContext: {
    name: string
    description: string
    designSystem: string
  }
): Promise<VisualSignals> {
  const raw = await nimVision({
    imageBase64: screenshotBase64,
    prompt: buildPrompt(appContext),
    maxTokens: 1024,
    model: MODELS.OBSERVER_VISUAL.id,
  })

  return parseVisualSignals(raw)
}

/**
 * Analyze a live URL by capturing a screenshot with Microlink first.
 * Falls back to returning no-issues if agent-browser is unavailable.
 */
export async function observerVisualFromUrl(
  url: string,
  appContext: {
    name: string
    description: string
    designSystem: string
  }
): Promise<VisualSignals> {
  // Dynamically import to avoid circular deps
  const { takeScreenshotTool } = await import('../tools/screenshot')

  const result = await takeScreenshotTool.execute({ url, waitMs: 3000, viewport: '390x844' }) as {
    base64?: string | null
    error?: string
  }

  if (!result.base64) {
    console.warn('[observer-visual] Screenshot capture failed:', result.error)
    return {
      hasVisualIssues: false,
      visualIssues: [],
      layoutProblems: [],
      accessibilityNotes: [],
      suggestedFixes: [],
    }
  }

  return observerVisualAgent(result.base64, appContext)
}
