import { NextResponse } from 'next/server'
import { createWorktree, mergeWorktree, discardWorktree, listWorktrees, cleanupOrphanedWorktrees } from '@/lib/worktree'

export const runtime = 'nodejs'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action')
    const appId = searchParams.get('appId')

    if (action === 'list' && appId) {
      const trees = await listWorktrees(appId)
      return NextResponse.json({ trees })
    }

    if (action === 'cleanup' && appId) {
      await cleanupOrphanedWorktrees(appId)
      return NextResponse.json({ cleaned: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[api/worktree GET]', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { action, appId, worktreeId, branch } = body

    if (!action || !appId) {
      return NextResponse.json({ error: 'Missing action or appId' }, { status: 400 })
    }

    switch (action) {
      case 'create': {
        const wt = await createWorktree(appId, Date.now().toString())
        return NextResponse.json({ worktree: wt })
      }
      case 'merge': {
        if (!worktreeId || !branch) {
          return NextResponse.json({ error: 'Missing worktreeId or branch' }, { status: 400 })
        }
        // mergeWorktree takes the wtInfo object
        const result = await mergeWorktree({ wtPath: worktreeId, branch, appId }, branch)
        return NextResponse.json(result)
      }
      case 'discard': {
        if (!worktreeId) {
          return NextResponse.json({ error: 'Missing worktreeId' }, { status: 400 })
        }
        await discardWorktree({ wtPath: worktreeId, branch, appId })
        return NextResponse.json({ discarded: true })
      }
      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[api/worktree POST]', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}
