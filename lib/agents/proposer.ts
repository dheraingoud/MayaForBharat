/**
 * MAYA Proposer Agent — Generates ranked improvement proposals
 * Model: moonshotai/kimi-k2.6 (deep reasoning planner)
 *
 * Takes combined signals from both observers (DOM + Visual).
 * Max 3 proposals per cycle. Category-constrained.
 */

import { MODELS } from '../nim-client'
import { simpleChatJSON } from '../agent-loop'
import type { ObserverSignals } from './observer-dom'
import type { VisualSignals } from './observer-visual'

export type ImprovementCategory =
  | 'copy'           // text/label changes only
  | 'new_display'    // add data visualization using existing components
  | 'new_page'       // new route using existing components
  | 'logic_fix'      // fix incorrect calculations or data handling
  | 'new_feature'    // new functionality using existing component primitives

export interface Proposal {
  titleEn: string
  titleHindi: string
  category: ImprovementCategory
  description: string
  filesToModify: string[]
  estimatedDiffLines: number
  priority: number // 1-3, 1 = highest
}

const ALLOWED_CATEGORIES: ImprovementCategory[] = [
  'copy', 'new_display', 'new_page', 'logic_fix', 'new_feature',
]

const BLOCKED_CATEGORIES = [
  'layout_change', 'schema_change', 'auth_change', 'component_modification',
]

export async function proposerAgent(
  appContext: {
    name: string
    description: string
    fileTree: string
    semanticFacts: string
    recentEpisodes: string
  },
  domSignals: ObserverSignals,
  visualSignals?: VisualSignals
): Promise<Proposal[]> {
  // Early exit — no signals means no proposals (saves tokens)
  if (!domSignals.hasSignal && (!visualSignals || !visualSignals.hasVisualIssues)) {
    return []
  }

  const proposals = await simpleChatJSON<Proposal[]>({
    model: MODELS.PROPOSER,
    systemPrompt: `Propose app improvements. JSON array only. Max 3 items.
Each item: {"titleEn":string,"titleHindi":string,"category":string,"description":string,"filesToModify":string[],"estimatedDiffLines":number,"priority":number}

Allowed categories: ${ALLOWED_CATEGORIES.join('|')}
BLOCKED (never propose): ${BLOCKED_CATEGORIES.join('|')}

Rules:
- Max 150 lines diff per proposal (Gate 2 limit)
- Use existing components only (Button, Card, Input, Table, Layout, Badge)
- Never modify components/ui/* or .interface-design/*
- titleHindi must be natural Hindi, not translation-ese
- Priority 1 = highest impact, 3 = lowest
- Sort by priority ascending
- If estimatedDiffLines > 120, split into smaller proposals`,
    userInput: `App: ${appContext.name} — ${appContext.description}
File tree: ${appContext.fileTree}
Semantic facts: ${appContext.semanticFacts}
Recent episodes: ${appContext.recentEpisodes}

DOM signals: ${JSON.stringify(domSignals)}
${visualSignals ? `Visual signals: ${JSON.stringify(visualSignals)}` : ''}`,
    caveman: true,
  })

  // Hard cap at 3 + validate categories
  return (Array.isArray(proposals) ? proposals : [])
    .filter(p => ALLOWED_CATEGORIES.includes(p.category))
    .filter(p => p.estimatedDiffLines <= 150)
    .slice(0, 3)
}
