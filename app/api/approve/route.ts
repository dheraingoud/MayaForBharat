import { NextResponse } from 'next/server'
import { promises as fs } from 'fs'
import path from 'path'
import { mergeWorktree, discardWorktree } from '@/lib/worktree'
import { deployToVercel } from '@/lib/deploy'
import { getApp, addApp } from '@/lib/store'

export const runtime = 'nodejs'

// Trigger rebuild
export async function POST(request: Request) {
  try {
    const body = await request.json()
    console.log('[api/approve] Received body:', body)
    const { appId, improvementId, decision } = body

    if (!appId || !improvementId || !decision || !['accept', 'reject'].includes(decision)) {
      console.log(`[api/approve] 400 Bad Request. appId: ${appId}, improvementId: ${improvementId}, decision: ${decision}`)
      return NextResponse.json(
        { error: 'Missing appId, improvementId or decision (accept/reject)' },
        { status: 400 }
      )
    }

    if (improvementId === 'seed-1') {
      console.log(`[api/approve] Intercepting mock seed-1 approval for ${appId}`)
      return NextResponse.json({
        success: true,
        improvementId,
        decision,
        message: `Mock improvement ${decision}ed successfully`,
      })
    }

    const { getBuildsDir } = await import('@/lib/path')
    const appDir = getBuildsDir(appId)
    const pendingPath = path.join(appDir, '.maya', 'pending-improvements.json')
    
    let pending = []
    try {
      const raw = await fs.readFile(pendingPath, 'utf-8')
      pending = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'No pending improvements found' }, { status: 404 })
    }

    const imp = pending.find((p: any) => p.id === improvementId)
    if (!imp) {
      return NextResponse.json({ error: 'Improvement not found' }, { status: 404 })
    }

    if (decision === 'accept') {
      console.log(`[api/approve] Accepting improvement ${improvementId} for ${appId}`)
      
      if (imp.wtInfo) {
        // Merge the worktree
        const mergeResult = await mergeWorktree(imp.wtInfo, `maya: ${imp.title}`)
        if (!mergeResult.success) {
          throw new Error(`Merge failed: ${mergeResult.error}`)
        }
        
        // Trigger a new deployment
        const app = await getApp(appId)
        if (app) {
          console.log(`[api/approve] Redeploying app ${appId}...`)
          const deployRes = await deployToVercel({
            appId,
            projectName: app.name,
            directory: getBuildsDir(appId),
            target: 'production'
          })
          
          if (deployRes.url) {
            app.status = 'live'
            app.url = deployRes.url
            await addApp(app)
          }
        }
      }
    } else {
      console.log(`[api/approve] Rejecting improvement ${improvementId} for ${appId}`)
      if (imp.wtInfo) {
        await discardWorktree(imp.wtInfo).catch(() => {})
      }
    }

    // Remove the improvement from pending list
    const updatedPending = pending.filter((p: any) => p.id !== improvementId)
    if (updatedPending.length > 0) {
      await fs.writeFile(pendingPath, JSON.stringify(updatedPending, null, 2))
    } else {
      // If none left, delete the file to completely clear dashboard notification
      await fs.unlink(pendingPath).catch(() => {})
    }

    return NextResponse.json({
      success: true,
      improvementId,
      decision,
      message: `Improvement ${decision}ed successfully`,
    })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[api/approve]', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}
