import { NextResponse } from 'next/server'
import { readEpisodes, readSemantic } from '@/lib/memory/autoDream'
import { getApp } from '@/lib/store'
import path from 'path'
import { promises as fs } from 'fs'

export const runtime = 'nodejs'

interface EvolutionEntry {
  id: string
  status: 'pending' | 'merged' | 'discarded'
  title: string
  description: string
  timestamp: string
  category?: string
  filesModified?: string[]
  gateFailure?: string
  testsPassed?: number
}

/**
 * GET /api/evolution-log?appId=xxx
 * Returns real evolution log entries for a specific app
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const appId = searchParams.get('appId')

    if (!appId) {
      return NextResponse.json({ error: 'Missing appId' }, { status: 400 })
    }

    const app = await getApp(appId)
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 })
    }

    const { getBuildsDir } = await import('@/lib/path')
    const appDir = getBuildsDir(appId)

    // Read episodes (evolution cycle results)
    const episodes = await readEpisodes(appDir).catch(() => [])
    const semanticFacts = await readSemantic(appDir).catch(() => [])

    // Read pending improvements file if it exists
    let pendingImprovements: EvolutionEntry[] = []
    try {
      const pendingPath = path.join(appDir, '.maya', 'pending-improvements.json')
      const raw = await fs.readFile(pendingPath, 'utf-8')
      pendingImprovements = JSON.parse(raw)
    } catch {
      // No pending improvements
    }

    // Convert episodes to timeline entries
    const entries: EvolutionEntry[] = []

    // Add pending improvements first
    for (const imp of pendingImprovements) {
      entries.push({
        id: imp.id || `pending-${Date.now()}`,
        status: 'pending',
        title: imp.title || 'Proposed Improvement',
        description: imp.description || '',
        timestamp: imp.timestamp || new Date().toISOString(),
        category: imp.category,
      })
    }

    // Convert episodes to entries
    for (const ep of episodes) {
      if (ep.merged > 0) {
        entries.push({
          id: ep.cycleId,
          status: 'merged',
          title: `Evolution Cycle — ${ep.merged} improvements merged`,
          description: ep.observed?.join(', ') || 'Automated improvement cycle',
          timestamp: ep.date,
          testsPassed: ep.merged,
        })
      }
      if (ep.gateFailed?.length > 0) {
        for (const gate of ep.gateFailed) {
          entries.push({
            id: `${ep.cycleId}-fail-${gate.gate}`,
            status: 'discarded',
            title: `Gate Failed: ${gate.gate}`,
            description: `Improvement discarded by safety gate`,
            timestamp: ep.date,
            gateFailure: gate.gate,
          })
        }
      }
    }

    // If no real data yet, provide one pre-seeded entry for demo
    if (entries.length === 0) {
      entries.push({
        id: 'seed-1',
        status: 'pending',
        title: 'सर्च बार जोड़ें — Add Search Bar',
        description: `${app.name} needs a search bar on the dashboard for quick item lookup. This will improve usability for shops with 50+ items.`,
        timestamp: new Date().toISOString(),
        category: 'new_feature',
      })
    }

    // Stats
    const stats = {
      total: entries.length,
      applied: entries.filter(e => e.status === 'merged').length,
      pending: entries.filter(e => e.status === 'pending').length,
      discarded: entries.filter(e => e.status === 'discarded').length,
    }

    return NextResponse.json({
      app: {
        id: app.id,
        name: app.name,
        nameHindi: app.nameHindi,
        category: app.category,
      },
      entries,
      stats,
      semanticFacts: semanticFacts.length,
    })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[api/evolution-log]', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}
