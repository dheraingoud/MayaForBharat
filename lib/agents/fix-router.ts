/**
 * MAYA Fix Router — Routes fix task to appropriate model
 * GLM-5.1 for complex logic, DeepSeek V4 Flash for simple copy/CSS
 *
 * Design system locked to light theme — never mention dark or zinc colors.
 */

import { MODELS } from '../nim-client'
import { simpleChat } from '../agent-loop'
import type { ObserverSignals } from './observer-dom'
import type { VisualSignals } from './observer-visual'

export type FixComplexity = 'simple' | 'complex'

export function assessFixComplexity(
  domSignals: ObserverSignals,
  visualSignals?: VisualSignals
): FixComplexity {
  const hasErrors = domSignals.errors.length > 0
  const hasVisualIssues = visualSignals?.visualIssues?.length ?? 0 > 0

  if (hasErrors || (hasVisualIssues && (visualSignals?.visualIssues?.length ?? 0) > 2)) {
    return 'complex'
  }

  return 'simple'
}

export async function fixRouter(
  description: string,
  fileContext: string,
  complexity: FixComplexity
): Promise<string> {
  const model = complexity === 'complex' ? MODELS.FIX_ROUTER : MODELS.PROPOSER

  return simpleChat({
    model,
    systemPrompt: `Fix the described issue in the app code.
Output ONLY the corrected file content. No explanation.
Design tokens (LOCKED): accent #E8601A, bg #EFEFEF, surface #ffffff, border #e4e4e7, text #09090b, radius rounded-xl, font Hind / Noto Sans Devanagari. LIGHT ONLY. Tailwind only.
Minimal changes — fix the issue, nothing else.`,
    userInput: `Issue: ${description}\n\nCurrent file:\n${fileContext}`,
    caveman: true,
    maxTokensOverride: complexity === 'complex' ? 8192 : 2048,
  })
}
