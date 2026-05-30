import { NextRequest, NextResponse } from 'next/server'
import { updateAppMessages } from '@/lib/store'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Next.js 15: params is a promise
    const { id } = await params
    const body = await req.json()
    
    if (!body.messages || !Array.isArray(body.messages)) {
      return NextResponse.json({ error: 'Invalid messages array' }, { status: 400 })
    }

    await updateAppMessages(id, body.messages)
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    console.error('Failed to update messages:', error)
    return NextResponse.json({ error: 'Failed to update messages' }, { status: 500 })
  }
}
