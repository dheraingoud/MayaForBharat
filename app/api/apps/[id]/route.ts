import { NextResponse } from 'next/server'
import { getApp, removeApp, addApp } from '@/lib/store'
import { deleteVercelProject } from '@/lib/deploy'
import { promises as fs } from 'fs'
import path from 'path'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const app = await getApp(id)
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 })
    }

    // 1. Delete from Vercel
    if (app.projectId) {
      await deleteVercelProject(app.projectId)
    }

    // 2. Delete local build directory
    const appDir = path.join(process.cwd(), '.maya-builds', id)
    await fs.rm(appDir, { recursive: true, force: true }).catch(console.warn)

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

