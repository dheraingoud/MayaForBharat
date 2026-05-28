/**
 * MAYA Observer (Visual) — Multimodal screenshot analysis
 * Model: moonshotai/kimi-k2.6 (multimodal vision model)
 *
 * Takes a Playwright screenshot of the live app and analyzes it
 * for visual issues, layout problems, and accessibility concerns.
 */

import { nimVision } from '../nim-client'

export interface VisualSignals {
  hasVisualIssues: boolean
  visualIssues: string[]
  layoutProblems: string[]
  accessibilityNotes: string[]
  suggestedFixes: string[]
}

export async function observerVisualAgent(
  screenshotBase64: string,
  appContext: {
    name: string
    description: string
    designSystem: string
  }
): Promise<VisualSignals> {
  const prompt = `[CAVEMAN] Analyze this app screenshot for a mobile-first Indian small business app.

App: ${appContext.name} — ${appContext.description}
Design system: ${appContext.designSystem}

Respond in JSON only:
{"hasVisualIssues":boolean,"visualIssues":string[],"layoutProblems":string[],"accessibilityNotes":string[],"suggestedFixes":string[]}

Focus on:
- Mobile layout issues (designed for 390x844 viewport)
- Text readability and contrast
- Missing or broken UI elements
- Hindi text rendering issues
- Touch target sizes (min 44px)

Set hasVisualIssues=false if everything looks good.
Max 3 items per array. Be specific about what and where.`

  const raw = await nimVision({
    imageBase64: screenshotBase64,
    prompt,
    maxTokens: 1024,
  })

  // Parse JSON from response (may be wrapped in markdown)
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
