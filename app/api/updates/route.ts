import { NextResponse } from 'next/server'
import { readStore } from '@/lib/store'
import { readEpisodes } from '@/lib/memory/autoDream'
import { getBuildsDir } from '@/lib/path'

export const runtime = 'nodejs'

/**
 * GET /api/updates
 * Aggregated update feed across all apps.
 * Returns real evolution episodes + chat edits, sorted by date desc.
 */
export async function GET() {
  try {
    const store = await readStore()

    const allUpdates: Array<{
      id: string
      appId: string
      appName: string
      appNameHindi: string
      message: string
      messageHi: string
      type: 'improvement' | 'gate_fail' | 'observation'
      filesModified: string[]
      createdAt: string
    }> = []

    for (const app of store) {
      const appDir = getBuildsDir(app.id)

      try {
        const episodes = await readEpisodes(appDir)

        for (const ep of episodes) {
          const extEp = ep as any // Chat-edit episodes have extra fields (summary, filesModified)
          
          // Skip chat-edit episodes — only show overnight evolution cycles in updates
          if (extEp.source === 'chat-edit') continue
          
          if (ep.merged > 0) {
            allUpdates.push({
              id: ep.cycleId,
              appId: app.id,
              appName: app.name,
              appNameHindi: app.nameHindi || app.name,
              message: extEp.summary || `${ep.merged} improvements merged`,
              messageHi: extEp.summaryHi || `${ep.merged} सुधार लागू किए`,
              type: 'improvement',
              filesModified: extEp.filesModified || [],
              createdAt: ep.date,
            })
          }
          if (ep.gateFailed?.length > 0) {
            for (const gate of ep.gateFailed) {
              allUpdates.push({
                id: `${ep.cycleId}-fail-${gate.gate}`,
                appId: app.id,
                appName: app.name,
                appNameHindi: app.nameHindi || app.name,
                message: `Gate failed: ${gate.gate}`,
                messageHi: `गेट विफल: ${gate.gate}`,
                type: 'gate_fail',
                filesModified: [],
                createdAt: ep.date,
              })
            }
          }
        }
      } catch {
        // No episodes for this app
      }
    }

    // Sort by date descending (newest first)
    allUpdates.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

    return NextResponse.json({
      updates: allUpdates.slice(0, 50), // Max 50 updates
      total: allUpdates.length,
    })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[api/updates]', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}
