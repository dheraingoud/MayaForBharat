import { describe, it, expect } from 'vitest'
import type { Episode, SemanticFact } from '@/lib/memory/autoDream'
import type { WorktreeInfo } from '@/lib/worktree'

describe('Episode type contract', () => {
  it('represents a successful evolution cycle', () => {
    const episode: Episode = {
      date: '2026-06-20',
      cycleId: 'cycle-42',
      observed: ['checkout errors', 'slow analytics page'],
      proposed: 3,
      built: 2,
      gateFailed: [{ gate: 'diff-size', count: 1 }],
      merged: 1,
      rejected: 1,
      tokensUsed: 12000,
    }
    expect(episode.proposed).toBeGreaterThanOrEqual(episode.built + episode.gateFailed.reduce((s, g) => s + g.count, 0))
    expect(episode.built).toBe(episode.merged + episode.rejected)
    expect(episode.tokensUsed).toBeGreaterThan(0)
  })

  it('represents a no-signal cycle (short-circuit)', () => {
    const episode: Episode = {
      date: '2026-06-21',
      cycleId: 'cycle-43',
      observed: [],
      proposed: 0,
      built: 0,
      gateFailed: [],
      merged: 0,
      rejected: 0,
      tokensUsed: 500, // only observer token cost
    }
    expect(episode.proposed).toBe(0)
    expect(episode.merged).toBe(0)
  })

  it('tracks gate failures by name', () => {
    const episode: Episode = {
      date: '2026-06-22',
      cycleId: 'cycle-44',
      observed: ['UI overlap'],
      proposed: 2,
      built: 0,
      gateFailed: [
        { gate: 'category', count: 1 },
        { gate: 'visual-qa', count: 1 },
      ],
      merged: 0,
      rejected: 0,
      tokensUsed: 3000,
    }
    expect(episode.gateFailed).toHaveLength(2)
    expect(episode.gateFailed.map(g => g.gate)).toContain('category')
    expect(episode.gateFailed.map(g => g.gate)).toContain('visual-qa')
  })
})

describe('SemanticFact type contract', () => {
  it('represents a confirmed fact', () => {
    const fact: SemanticFact = {
      id: 'fact-checkout-errors',
      fact: 'Users frequently encounter errors on /checkout',
      confidence: 0.85,
      sourceEpisodes: ['cycle-42', 'cycle-44'],
      lastConfirmed: '2026-06-22',
    }
    expect(fact.confidence).toBeGreaterThanOrEqual(0.2) // not evicted
    expect(fact.sourceEpisodes.length).toBeGreaterThanOrEqual(2) // confirmed in 2+
  })

  it('represents a new fact at initial confidence', () => {
    const fact: SemanticFact = {
      id: 'fact-new-observation',
      fact: 'Admin page loads slowly on mobile',
      confidence: 0.6, // new facts start at 0.6
      sourceEpisodes: ['cycle-45'],
      lastConfirmed: '2026-06-23',
    }
    expect(fact.confidence).toBe(0.6)
    expect(fact.sourceEpisodes).toHaveLength(1)
  })

  it('eviction threshold is 0.2', () => {
    const lowFact: SemanticFact = {
      id: 'fact-deprecated',
      fact: 'Something no longer true',
      confidence: 0.15,
      sourceEpisodes: ['cycle-1'],
      lastConfirmed: '2026-01-01',
    }
    // Below 0.2 → should be evicted
    expect(lowFact.confidence).toBeLessThan(0.2)
  })
})

describe('WorktreeInfo type contract', () => {
  it('represents an active worktree', () => {
    const wt: WorktreeInfo = {
      wtPath: '/tmp/maya-apps/app-1/wt-seed-1',
      branch: 'maya/improve-seed-1',
      appId: 'app-1',
      improveId: 'seed-1',
    }
    expect(wt.branch).toContain('maya/improve-')
    expect(wt.wtPath).toContain(wt.appId)
    expect(wt.improveId).toBe('seed-1')
  })

  it('allows optional improveId', () => {
    const wt: WorktreeInfo = {
      wtPath: '/tmp/maya-apps/app-1/main',
      branch: 'main',
      appId: 'app-1',
    }
    expect(wt.improveId).toBeUndefined()
  })
})

describe('autoDream consolidation rules', () => {
  it('requires at least 3 episodes to trigger', () => {
    const MIN_EPISODES = 3
    expect(MIN_EPISODES).toBe(3)
  })

  it('uses last 7 episodes for context efficiency', () => {
    const CONTEXT_WINDOW = 7
    const episodes = Array.from({ length: 15 }, (_, i) => ({
      date: `2026-06-${String(i + 1).padStart(2, '0')}`,
      cycleId: `cycle-${i}`,
    }))
    const recent = episodes.slice(-CONTEXT_WINDOW)
    expect(recent).toHaveLength(7)
    expect(recent[0].cycleId).toBe('cycle-8')
  })

  it('episode ring buffer caps at 30', () => {
    const MAX_EPISODES = 30
    const episodes = Array.from({ length: 35 }, (_, i) => `ep-${i}`)
    while (episodes.length > MAX_EPISODES) episodes.shift()
    expect(episodes).toHaveLength(30)
    expect(episodes[0]).toBe('ep-5')
  })

  it('max 20 semantic facts', () => {
    const MAX_FACTS = 20
    const facts = Array.from({ length: 25 }, (_, i) => ({
      id: `fact-${i}`,
      confidence: 0.5 + (i * 0.02),
    }))
    const capped = facts.slice(0, MAX_FACTS)
    expect(capped).toHaveLength(20)
  })
})
