/**
 * Shared verifier primitives — used by both /api/preview-verify (in-browser) and
 * /api/verify (deploy-time). Keeps the verifier prompt + types in one place.
 */

import { nimVision, MODELS } from './nim-client'

// ─── Verifier System Prompt ──────────────────────────────────────────────────
// Explicitly skeptical. Assumes something is wrong until proven otherwise.

export const VERIFIER_SYSTEM = `You are a SKEPTICAL UI reviewer. You did not write this code. Your only
job is to find problems. Assume something is wrong until proven otherwise.

For the screenshot provided, check:
1. Is any text overlapping or cut off?
2. Are any buttons or interactive elements missing or unreachable?
3. Are images broken, missing, or showing placeholder/alt text?
4. Does spacing look broken (elements touching edges, huge gaps, overlap)?
5. Is this usable on a 390px mobile screen — can a thumb reach key actions?
6. Does the page show what its name implies (e.g. "checkout" should show
   an order summary and payment action, not be blank or show unrelated content)?
7. Is the page completely blank or showing an error state?
8. Are navigation elements present and functional-looking?

Output JSON ONLY:
{
  "confidence": 0.0-1.0,
  "brokenElements": ["description of each broken thing found"],
  "matchesPurpose": true/false,
  "mobileUsable": true/false,
  "hasContent": true/false,
  "reasoning": "one sentence"
}

Be harsh. A 0.9+ confidence should be rare and earned.`

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PageFinding {
  page: string
  confidence: number
  brokenElements: string[]
  matchesPurpose: boolean
  mobileUsable: boolean
  hasContent: boolean
  reasoning: string
}

export interface VerificationResult {
  allPassed: boolean
  findings: PageFinding[]
  overallConfidence: number
}

// ─── Single-page vision verification ────────────────────────────────────────
// Takes a base64 PNG + route, sends it to the VERIFIER model, returns a PageFinding.

export async function verifySingleScreenshot(
  imageBase64: string,
  route: string,
): Promise<PageFinding> {
  const verdict = await nimVision({
    imageBase64,
    prompt: `${VERIFIER_SYSTEM}\n\nPage path: ${route}\nExpected content: This should be a functional page of the generated app.`,
    maxTokens: 2048,
    model: MODELS.VERIFIER.id,
  })

  try {
    const cleaned = verdict.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
    const firstBrace = cleaned.indexOf('{')
    const lastBrace = cleaned.lastIndexOf('}')
    if (firstBrace !== -1 && lastBrace !== -1) {
      const parsed = JSON.parse(cleaned.slice(firstBrace, lastBrace + 1))
      return {
        page: route,
        confidence: parsed.confidence ?? 0.5,
        brokenElements: parsed.brokenElements ?? [],
        matchesPurpose: parsed.matchesPurpose ?? true,
        mobileUsable: parsed.mobileUsable ?? true,
        hasContent: parsed.hasContent ?? true,
        reasoning: parsed.reasoning ?? 'No reasoning provided',
      }
    }
  } catch (e) {
    console.warn('[verifier-shared] Failed to parse verifier response:', e)
  }

  // Fallback: couldn't parse, assume failure
  return {
    page: route,
    confidence: 0,
    brokenElements: ['Verifier model returned unparseable response'],
    matchesPurpose: false,
    mobileUsable: false,
    hasContent: false,
    reasoning: 'Failed to parse verifier output',
  }
}
