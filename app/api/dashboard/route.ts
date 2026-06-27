import { NextResponse } from 'next/server'
import { readStore } from '@/lib/store'
import { readEpisodes } from '@/lib/memory/autoDream'
import { promises as fs } from 'fs'
import path from 'path'
import type { BuiltApp } from '@/lib/store'
import { getBuildsDir } from '@/lib/path'

export const runtime = 'nodejs'

function categoryEmoji(category: string): string {
  const map: Record<string, string> = {
    kirana: '🛒',
    tailor: '🧵',
    dairy: '🥛',
    pharmacy: '💊',
    electronics: '📱',
    restaurant: '🍽️',
    other: '🏪',
  }
  return map[category] || '🏪'
}

/**
 * Build → Dashboard bridge.
 * Reads persisted built-app metadata from the JSON store.
 * Checks for pending improvements and evolution episodes.
 */
export async function GET() {
  const store = await readStore()

  const apps = await Promise.all(store.map(async (app: BuiltApp) => {
    const appDir = getBuildsDir(app.id)

    // Check for pending improvements
    let hasPendingImprovements = false
    try {
      const pendingPath = path.join(appDir, '.maya', 'pending-improvements.json')
      const raw = await fs.readFile(pendingPath, 'utf-8')
      const pending = JSON.parse(raw)
      hasPendingImprovements = Array.isArray(pending) && pending.length > 0
    } catch {
      // No pending improvements
    }

    // Count evolution episodes for updates count
    let updateCount = 0
    try {
      const episodes = await readEpisodes(appDir)
      updateCount = episodes.reduce((sum, ep) => sum + (ep.merged || 0), 0)
    } catch {
      // No episodes
    }

    return {
      id: app.id,
      nameKey: app.name,
      nameHindi: app.nameHindi || '',
      typeKey: app.category,
      updates: updateCount,
      status: app.status,
      emoji: categoryEmoji(app.category),
      hasImprovements: hasPendingImprovements,
      // Extended data for app detail pages
      url: app.url,
      projectId: app.projectId,
      descriptionEn: app.descriptionEn,
      createdAt: app.createdAt,
      adminUsername: app.adminUsername,
      adminPin: app.adminPin,
      shownToOwner: app.shownToOwner,
      messages: app.messages || [],
    }
  }))

  return NextResponse.json({ apps })
}
