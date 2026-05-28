/**
 * MAYA autoDream — Memory Consolidation
 * Model: deepseek-ai/deepseek-v4-flash
 *
 * Adapted from Claude Code's autoDream (consolidationPrompt.ts):
 * 4-phase cycle: Orient -> Gather -> Consolidate -> Prune
 *
 * Gate order (cheapest first):
 * 1. Time: hours since lastConsolidation >= 24
 * 2. Episodes: at least 3 episodes to consolidate
 * 3. Run consolidation
 */

import { MODELS } from '../nim-client'
import { simpleChatJSON } from '../agent-loop'
import { promises as fs } from 'fs'
import path from 'path'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Episode {
  date: string
  cycleId: string
  observed: string[]
  proposed: number
  built: number
  gateFailed: { gate: string; count: number }[]
  merged: number
  rejected: number
  tokensUsed: number
}

export interface SemanticFact {
  id: string
  fact: string
  confidence: number
  sourceEpisodes: string[]
  lastConfirmed: string
}

// ─── Episode Ring Buffer ──────────────────────────────────────────────────────

const MAX_EPISODES = 30

export async function readEpisodes(appDir: string): Promise<Episode[]> {
  const filePath = path.join(appDir, '.maya', 'episodes.json')
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export async function appendEpisode(appDir: string, episode: Episode): Promise<void> {
  const episodes = await readEpisodes(appDir)
  episodes.push(episode)

  // Ring buffer: evict oldest when limit hit
  while (episodes.length > MAX_EPISODES) {
    episodes.shift()
  }

  const filePath = path.join(appDir, '.maya', 'episodes.json')
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(episodes, null, 2))
}

// ─── Semantic Facts ───────────────────────────────────────────────────────────

export async function readSemantic(appDir: string): Promise<SemanticFact[]> {
  const filePath = path.join(appDir, '.maya', 'semantic.json')
  try {
    const raw = await fs.readFile(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return []
  }
}

export async function writeSemantic(appDir: string, facts: SemanticFact[]): Promise<void> {
  const filePath = path.join(appDir, '.maya', 'semantic.json')
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(facts, null, 2))
}

// ─── autoDream Consolidation ──────────────────────────────────────────────────
// Claude Code's 4-phase pattern: Orient -> Gather -> Consolidate -> Prune

export async function autoDream(appDir: string): Promise<{
  updated: boolean
  factsCount: number
  evicted: number
}> {
  const episodes = await readEpisodes(appDir)
  const currentFacts = await readSemantic(appDir)

  // Gate: need at least 3 episodes
  if (episodes.length < 3) {
    return { updated: false, factsCount: currentFacts.length, evicted: 0 }
  }

  // Take last 7 episodes only (context efficiency)
  const recentEpisodes = episodes.slice(-7)

  const consolidationResult = await simpleChatJSON<{
    facts: SemanticFact[]
    evicted: string[]
  }>({
    model: MODELS.AUTO_DREAM,
    systemPrompt: `Consolidate observations into semantic facts.
You are performing a dream — a reflective pass over recent evolution episodes.

Phase 1 — Orient: Review existing facts
Phase 2 — Gather: Scan recent episodes for new signal
Phase 3 — Consolidate: Merge, resolve contradictions, update confidence
Phase 4 — Prune: Evict facts below 0.2 confidence

Rules:
- New facts: confidence starts at 0.6
- Confirmed in 2+ episodes: confidence -> 0.85
- Contradicted in latest episode: confidence x 0.5
- confidence < 0.2: evict
- Max 20 facts total
- Each fact: present tense, caveman-compressed
- Stable IDs: reuse existing fact IDs when updating

Output: {"facts": SemanticFact[], "evicted": string[]}
SemanticFact: {"id":string,"fact":string,"confidence":number,"sourceEpisodes":string[],"lastConfirmed":string}`,
    userInput: JSON.stringify({
      existingFacts: currentFacts,
      recentEpisodes,
    }),
    caveman: true,
    maxTokensOverride: 800,
  })

  // Write updated facts
  const newFacts = consolidationResult.facts
    .filter((f: SemanticFact) => f.confidence >= 0.2)
    .slice(0, 20)

  await writeSemantic(appDir, newFacts)

  return {
    updated: true,
    factsCount: newFacts.length,
    evicted: consolidationResult.evicted?.length ?? 0,
  }
}

// ─── MAYA.md Management ───────────────────────────────────────────────────────

export async function readMayaMd(appDir: string): Promise<string> {
  const filePath = path.join(appDir, 'MAYA.md')
  try {
    return await fs.readFile(filePath, 'utf-8')
  } catch {
    return '# App Memory\nCreated: ' + new Date().toISOString() + '\n'
  }
}

export async function writeMayaMd(appDir: string, content: string): Promise<void> {
  const filePath = path.join(appDir, 'MAYA.md')
  await fs.writeFile(filePath, content, 'utf-8')
}

export async function initAppMemory(
  appDir: string,
  appName: string,
  description: string,
  traderPhone: string
): Promise<void> {
  await fs.mkdir(path.join(appDir, '.maya'), { recursive: true })

  // MAYA.md — project memory (Claude Code's CLAUDE.md pattern)
  const mayaMd = `# ${appName} — App Memory

## Business Context
- Type: Small business app (Bharat)
- Description: ${description}
- Trader phone: ${traderPhone}
- Created: ${new Date().toISOString()}

## Locked Decisions
- Light theme only (background #EFEFEF, surface #ffffff)
- Accent #E8601A only
- Tailwind CSS only
- Mobile-first (iPhone 14 viewport)
- Hindi for user-facing text

## Agent-Mutable Preferences
(Updated by autoDream after each evolution cycle)
`

  await writeMayaMd(appDir, mayaMd)

  // Initialize empty episodes and semantic
  await fs.writeFile(path.join(appDir, '.maya', 'episodes.json'), '[]')
  await fs.writeFile(path.join(appDir, '.maya', 'semantic.json'), '[]')
}
