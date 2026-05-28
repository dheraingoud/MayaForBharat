import { NextResponse } from 'next/server'
import { listSkills, refreshSkill, getSkillsForContext } from '@/lib/skills'

export const runtime = 'nodejs'

/** GET /api/skills — list all skills with cache status */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const context = searchParams.get('context') as 'builder' | 'proposer' | 'observer' | 'evolution' | null

    if (context) {
      // Return combined skills for a specific agent context
      const skills = await getSkillsForContext(context)
      return NextResponse.json({ context, skills, chars: skills.length })
    }

    // List all skills with cache status
    const skills = await listSkills()
    return NextResponse.json({ skills })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[api/skills]', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}

/** POST /api/skills — force-refresh a skill */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name } = body

    if (!name) {
      return NextResponse.json({ error: 'Missing skill name' }, { status: 400 })
    }

    const result = await refreshSkill(name)
    return NextResponse.json(result)
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[api/skills]', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}
