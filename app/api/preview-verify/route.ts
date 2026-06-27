/**
 * POST /api/preview-verify
 *
 * Receives a base64 PNG screenshot captured from the WebContainer preview iframe
 * (via cooperative in-iframe capture — maya-capture.js) and runs it through
 * the VERIFIER model (MiniMax M3) for visual correctness.
 *
 * This is the in-browser verification path — no external screenshot services.
 * The parent captures the image via postMessage from the preview's own origin.
 *
 * Body: { imageBase64: string, route: string }
 * Returns: { finding: PageFinding }
 */

import { NextResponse } from 'next/server'
import { verifySingleScreenshot, type PageFinding } from '@/lib/verifier-shared'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    const { imageBase64, route } = (await request.json()) as {
      imageBase64: string
      route: string
    }

    if (!imageBase64 || !route) {
      return NextResponse.json(
        { error: 'imageBase64 and route are required' },
        { status: 400 },
      )
    }

    console.log(`[api/preview-verify] Verifying route: ${route} (${Math.round(imageBase64.length / 1024)}KB base64)`)

    const finding: PageFinding = await verifySingleScreenshot(imageBase64, route)

    console.log(
      `[api/preview-verify] Route "${route}" → confidence: ${finding.confidence}, broken: ${finding.brokenElements.length}, passed: ${finding.confidence >= 0.6 && finding.brokenElements.length === 0}`,
    )

    return NextResponse.json({ finding })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[api/preview-verify]', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}
