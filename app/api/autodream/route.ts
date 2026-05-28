import { NextResponse } from 'next/server'
import { autoDream } from '@/lib/memory/autoDream'
import path from 'path'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { appId } = body

    if (!appId) {
      return NextResponse.json(
        { error: 'Missing appId' },
        { status: 400 }
      )
    }

    const appDir = path.join(process.cwd(), '.maya-builds', appId)
    const result = await autoDream(appDir)

    return NextResponse.json({
      success: true,
      updated: result.updated,
      factsCount: result.factsCount,
      evicted: result.evicted,
    })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[api/autodream]', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}
