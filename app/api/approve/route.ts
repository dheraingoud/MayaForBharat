import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { improvementId, decision } = body

    if (!improvementId || !decision || !['approve', 'reject'].includes(decision)) {
      return NextResponse.json(
        { error: 'Missing improvementId or decision (approve/reject)' },
        { status: 400 }
      )
    }

    const status = decision === 'approve' ? 'approved' : 'rejected'

    // Wire to Convex if configured
    const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
    if (convexUrl) {
      try {
        // Call Convex mutation via HTTP action
        await fetch(`${convexUrl}/api/mutation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.CONVEX_DEPLOY_KEY || ''}`,
          },
          body: JSON.stringify({
            path: 'improvements:updateStatus',
            args: {
              id: improvementId,
              status,
            },
          }),
        })
      } catch (e) {
        console.warn('[api/approve] Convex update failed:', e)
        // Continue — still return success for local flow
      }
    }

    return NextResponse.json({
      success: true,
      improvementId,
      decision,
      status,
      message: `Improvement ${decision}d`,
    })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[api/approve]', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}
