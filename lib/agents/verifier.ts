/**
 * MAYA Visual Verifier Agent — Skeptical reviewer of generated UI
 *
 * THE WRITER CANNOT GRADE ITS OWN WORK.
 * This agent uses MiniMax M3 (NOT step-3.7-flash which wrote the code)
 * to evaluate screenshots of generated apps.
 *
 * Input: Base64 screenshot of the app
 * Output: JSON verdict with pass/fail + specific issues found
 *
 * Prompt principle: Assume something is wrong until proven otherwise.
 */

import { nimChat, MODELS } from '@/lib/nim-client'

// ── Types ────────────────────────────────────────────────────────────────────

export interface VerifierResult {
  passed: boolean
  score: number // 0-100
  issues: VerifierIssue[]
  summary: string
}

export interface VerifierIssue {
  severity: 'critical' | 'major' | 'minor'
  category: string
  description: string
}

// ── Verifier System Prompt ───────────────────────────────────────────────────
// This is deliberately SKEPTICAL. The model's job is to find problems.

const VERIFIER_SYSTEM = `You are a SKEPTICAL UI quality reviewer for a web application builder called MAYA.
Your job is to find problems, NOT to praise. Assume something is wrong until proven otherwise.

You will receive a screenshot of a generated web app. Evaluate it against these criteria:

CRITICAL FAILURES (auto-fail, score 0-30):
- Text overlapping other text or cut off
- Buttons/links that are invisible or look broken
- Missing images shown as broken img icons
- Page is blank or shows only an error message
- Mobile layout is completely unusable (elements stacked incorrectly)
- White text on white background or similar contrast failures

MAJOR ISSUES (score 30-60):
- Inconsistent spacing or alignment
- Font sizes too small or too large
- Color scheme is garish or clashing
- Navigation is confusing or missing
- Forms without labels or error states
- Generic "Lorem ipsum" placeholder text visible

MINOR ISSUES (score 60-85):
- Slightly inconsistent border radius
- Missing hover states
- Could use better whitespace
- Icons could be better aligned

GOOD (score 85-100):
- Clean, professional appearance
- Consistent design language
- Good use of whitespace and typography
- Functional-looking UI elements

OUTPUT JSON ONLY:
{
  "passed": boolean (true if score >= 60),
  "score": number (0-100),
  "issues": [
    { "severity": "critical|major|minor", "category": "string", "description": "string" }
  ],
  "summary": "One sentence overall assessment"
}

REMEMBER: Your job is to FIND PROBLEMS. Do not say "looks good" unless it genuinely does.
If you cannot see the image clearly, report it as a critical issue.`

// ── Verify Screenshot ────────────────────────────────────────────────────────

export async function verifyScreenshot(
  screenshotBase64: string,
  appDescription: string
): Promise<VerifierResult> {
  try {
    const result = await nimChat({
      model: MODELS.VERIFIER,
      messages: [
        { role: 'system', content: VERIFIER_SYSTEM },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `This app should be: "${appDescription}". Evaluate the screenshot below. Output JSON only.`,
            },
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${screenshotBase64}` },
            },
          ],
        },
      ],
      responseFormat: { type: 'json_object' },
      allowFallback: false, // Don't fallback — we need M3 specifically
    })

    // Parse JSON from response
    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return {
        passed: false,
        score: 0,
        issues: [{ severity: 'critical', category: 'parse_error', description: 'Verifier returned non-JSON response' }],
        summary: 'Verification failed — could not parse response',
      }
    }

    const parsed = JSON.parse(jsonMatch[0])
    return {
      passed: parsed.passed ?? false,
      score: parsed.score ?? 0,
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      summary: parsed.summary ?? 'No summary provided',
    }
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[verifier] Verification failed:', error)
    return {
      passed: true, // Soft-pass: don't block deploys if verifier is down
      score: -1,
      issues: [{ severity: 'minor', category: 'verifier_error', description: error }],
      summary: `Verifier unavailable: ${error}`,
    }
  }
}

// ── Verify Multiple Pages ────────────────────────────────────────────────────

export async function verifyMultiplePages(
  screenshots: Array<{ page: string; base64: string }>,
  appDescription: string
): Promise<{ overall: VerifierResult; perPage: Record<string, VerifierResult> }> {
  const perPage: Record<string, VerifierResult> = {}
  let totalScore = 0
  const allIssues: VerifierIssue[] = []

  for (const { page, base64 } of screenshots) {
    const result = await verifyScreenshot(base64, appDescription)
    perPage[page] = result
    totalScore += result.score
    allIssues.push(...result.issues)
  }

  const avgScore = screenshots.length > 0 ? Math.round(totalScore / screenshots.length) : 0
  const hasCritical = allIssues.some(i => i.severity === 'critical')

  return {
    overall: {
      passed: avgScore >= 60 && !hasCritical,
      score: avgScore,
      issues: allIssues,
      summary: hasCritical
        ? `Critical UI issues found across ${screenshots.length} pages`
        : avgScore >= 85
          ? `All ${screenshots.length} pages look professional`
          : `Average score ${avgScore}/100 across ${screenshots.length} pages`,
    },
    perPage,
  }
}
