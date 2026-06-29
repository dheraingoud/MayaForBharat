import { NextResponse } from 'next/server'
import { getApp, removeApp, addApp } from '@/lib/store'
import { deleteVercelProject } from '@/lib/deploy'
import { readEpisodes, readSemantic } from '@/lib/memory/autoDream'
import { promises as fs } from 'fs'
import path from 'path'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const app = await getApp(id)
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 })
    }

    const { getBuildsDir } = await import('@/lib/path')
    const appDir = getBuildsDir(id)

    // Count evolution episodes
    let evolutionCount = 0
    try {
      const episodes = await readEpisodes(appDir)
      evolutionCount = episodes.reduce((sum, ep) => sum + (ep.merged || 0), 0)
    } catch {
      // No episodes yet
    }

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

    return NextResponse.json({
      app: {
        id: app.id,
        name: app.name,
        nameHindi: app.nameHindi,
        descriptionEn: app.descriptionEn,
        category: app.category,
        url: app.url,
        projectId: app.projectId,
        status: app.status,
        createdAt: app.createdAt,
        adminUsername: app.adminUsername,
        adminPin: app.adminPin,
        shownToOwner: app.shownToOwner,
        messages: app.messages || [],
        specJson: app.specJson || null,
        evolutionCount,
        hasPendingImprovements,
      }
    })
  } catch (error) {
    console.error('[get_app]', error)
    return NextResponse.json(
      { error: 'Failed to fetch app' },
      { status: 500 }
    )
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    let app = await getApp(id)

    if (!app) {
      // Upsert: create app if it doesn't exist yet
      // (incremental saves during streaming can race with the initial POST)
      app = {
        id,
        name: body.name?.trim() || 'New App',
        nameHindi: body.name?.trim() || 'New App',
        descriptionEn: '',
        category: body.category || 'other',
        url: '',
        projectId: '',
        createdAt: new Date().toISOString(),
        status: body.status || 'building',
        files: [],
        messages: [],
      }
    }

    // Update name
    if (body.name && typeof body.name === 'string') {
      app.name = body.name.trim()
      if (!app.nameHindi || app.nameHindi === app.name) {
        app.nameHindi = app.name
      }
    }
    if (body.nameHindi && typeof body.nameHindi === 'string') {
      app.nameHindi = body.nameHindi.trim()
    }
    if (body.status && typeof body.status === 'string') {
      app.status = body.status
    }

    // Update messages (for chat persistence)
    if (body.messages && Array.isArray(body.messages)) {
      app.messages = body.messages.map((m: any) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp || Date.now(),
      }))
    }

    await addApp(app)

    return NextResponse.json({ success: true, name: app.name })
  } catch (error) {
    console.error('[update_app]', error)
    return NextResponse.json(
      { error: 'Failed to update app' },
      { status: 500 }
    )
  }
}
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const app = await getApp(id)
    if (!app) {
      // App already gone — treat as success
      return NextResponse.json({ success: true })
    }

    // 1. Delete from Vercel (non-blocking — don't fail entire delete if Vercel is unreachable)
    if (app.projectId) {
      try {
        await deleteVercelProject(app.projectId)
      } catch (e) {
        console.warn('[delete_app] Vercel deletion failed (non-blocking):', e)
      }
    }

    // 2. Delete local build directory
    const { getBuildsDir } = await import('@/lib/path')
    const appDir = getBuildsDir(id)
    await fs.rm(appDir, { recursive: true, force: true }).catch(() => {})

    // 3. Remove from JSON DB
    await removeApp(id)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[delete_app]', error)
    return NextResponse.json(
      { error: 'Failed to delete app' },
      { status: 500 }
    )
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const app = await getApp(id)
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 })
    }

    // Mark credentials as shown
    app.shownToOwner = true
    await addApp(app)

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('[update_app]', error)
    return NextResponse.json(
      { error: 'Failed to update app' },
      { status: 500 }
    )
  }
}

