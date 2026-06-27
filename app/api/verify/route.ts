import { NextResponse } from 'next/server'
import { verifyVisualCorrectness } from '@/lib/visual-verifier'

export const runtime = 'nodejs'

/**
 * POST /api/verify
 * Runs visual verification against a deployed preview URL.
 * Uses a SEPARATE model (MiniMax M3 VERIFIER) from the Writer (step-3.7-flash).
 * 
 * From MAYA-IMPORTANT.md Part 4:
 * "The Writer cannot grade its own work. A separate model with different
 *  instructions that grades the output."
 * 
 * Body: { url: string, pages?: string[] }
 */
export async function POST(request: Request) {
  try {
    const { url, pages } = await request.json()

    if (!url) {
      return NextResponse.json({ error: 'url is required' }, { status: 400 })
    }

    const pagesToCheck = pages && pages.length > 0 ? pages : ['/']
    
    console.log(`[api/verify] Starting visual verification for ${url} — pages: ${pagesToCheck.join(', ')}`)
    
    const result = await verifyVisualCorrectness(url, pagesToCheck)
    
    console.log(`[api/verify] Verification complete — overall confidence: ${result.overallConfidence.toFixed(2)}, passed: ${result.allPassed}`)
    
    return NextResponse.json({
      success: true,
      verifiedAt: new Date().toISOString(),
      url,
      ...result,
    })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[api/verify]', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}
