// POST /api/apps — Create or upsert an app in the database
// Used by the workbench to persist new projects on first LLM response

import { NextResponse } from 'next/server'
import { addApp, type BuiltApp } from '@/lib/store'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { id, name, category, status, descriptionEn, messages } = body

    if (!id || !name) {
      return NextResponse.json({ error: 'Missing id or name' }, { status: 400 })
    }

    const app: BuiltApp = {
      id,
      name,
      nameHindi: name,
      descriptionEn: descriptionEn || '',
      category: category || 'other',
      url: '',
      projectId: '',
      createdAt: new Date().toISOString(),
      status: status || 'building',
      files: [],
      messages: Array.isArray(messages) ? messages.map((m: any) => ({
        role: m.role,
        content: m.content,
        timestamp: m.timestamp || Date.now(),
      })) : [],
    }

    await addApp(app)

    return NextResponse.json({ success: true, id })
  } catch (error: any) {
    console.error('[POST /api/apps]', error)
    return NextResponse.json(
      { error: error.message || 'Failed to create app' },
      { status: 500 }
    )
  }
}
