/**
 * MAYA Observer (DOM) — Lightweight log/signal analysis
 * Model: meta/llama-3.3-70b-instruct (saves GLM RPM)
 *
 * Fires first in the evolution cycle. If hasSignal === false,
 * the entire cycle short-circuits (saves all downstream tokens).
 */

import { MODELS } from '../nim-client'
import { simpleChatJSON } from '../agent-loop'

export interface ObserverSignals {
  hasSignal: boolean
  errors: string[]
  topPages: string[]
  dropoffs: string[]
  unusedFeatures: string[]
  suggestions: string[]
}

export async function observerDomAgent(
  appContext: {
    name: string
    description: string
    vercelUrl: string
    semanticFacts: string
    logs: string
    analytics: string
  }
): Promise<ObserverSignals> {
  return simpleChatJSON<ObserverSignals>({
    model: MODELS.OBSERVER_DOM,
    systemPrompt: `Analyze app signals. JSON only. No explanation.
Output schema: {"hasSignal":boolean,"errors":string[],"topPages":string[],"dropoffs":string[],"unusedFeatures":string[],"suggestions":string[]}
Set hasSignal=false if no actionable signals found (saves downstream processing).
Focus on: errors, performance issues, unused features, user drop-off points.
Max 5 items per array. Caveman-compressed strings.`,
    userInput: `App: ${appContext.name} — ${appContext.description}
URL: ${appContext.vercelUrl}
Logs (last 50 lines): ${appContext.logs}
Analytics: ${appContext.analytics}
Semantic facts: ${appContext.semanticFacts}`,
    caveman: true,
    maxTokensOverride: 512,
  })
}
