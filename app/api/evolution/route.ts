import { NextResponse } from 'next/server'
import { runEvolutionCycle } from '@/lib/coordinator'
import { readMayaMd, readSemantic } from '@/lib/memory/autoDream'
import { readEpisodes } from '@/lib/memory/autoDream'
import path from 'path'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { appId, name, description, vercelUrl } = body

    if (!appId || !name || !vercelUrl) {
      return NextResponse.json(
        { error: 'Missing required fields: appId, name, vercelUrl' },
        { status: 400 }
      )
    }

    const appDir = path.join(process.cwd(), '.maya-builds', appId)

    // Read memory files
    const mayaMd = await readMayaMd(appDir).catch(() => '')
    const semanticFacts = await readSemantic(appDir).catch(() => [])
    const episodes = await readEpisodes(appDir).catch(() => [])

    const result = await runEvolutionCycle({
      id: appId,
      name,
      description: description || '',
      vercelUrl,
      fileTree: '',
      semanticFacts: JSON.stringify(semanticFacts),
      mayaMd,
      designSystem: 'light mobile-first, accent #E8601A, bg #EFEFEF',
      recentEpisodes: JSON.stringify(episodes.slice(-3)),
    })

    return NextResponse.json({
      success: true,
      signals: result.signals,
      proposals: result.proposals,
      built: result.built,
      merged: result.merged,
      gateFailures: result.gateFailures,
      errors: result.errors,
    })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[api/evolution]', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}
