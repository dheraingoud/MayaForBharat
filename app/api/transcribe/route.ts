import { NextResponse } from 'next/server'
import { transcribeHindi, extractIntent } from '@/lib/voice-pipeline'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request: Request) {
  try {
    // Fail fast if Groq keys are missing
    const hasGroq = [process.env.GROQ_KEY_1, process.env.GROQ_KEY_2, process.env.GROQ_API_KEY]
      .some(k => !!k && k.trim().length > 0 && !k.startsWith('YOUR_'))
    if (!hasGroq) {
      return NextResponse.json({
        error: 'Groq API key not configured. Add GROQ_KEY_1 or GROQ_KEY_2 to .env.local for voice transcription.',
        code: 'NO_GROQ_KEY'
      }, { status: 503 })
    }

    const formData = await request.formData()
    const audioFile = formData.get('audio') as File | null

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })
    }

    // Transcribe Hindi audio
    const transcript = await transcribeHindi(audioFile as unknown as Blob)

    if (!transcript) {
      return NextResponse.json({ error: 'Transcription failed — no text returned from Groq' }, { status: 500 })
    }

    // Extract app spec
    const spec = await extractIntent(transcript)

    return NextResponse.json({
      success: true,
      native: transcript,
      english: spec.descriptionEn,
      spec,
    })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[api/transcribe]', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}
