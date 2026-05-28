import { NextResponse } from 'next/server'
import { buildWithRetry, type AppSpec, sanitizeFiles } from '@/lib/voice-pipeline'
import { deployToVercel } from '@/lib/deploy'
import { addApp } from '@/lib/store'
import path from 'path'
import { promises as fs } from 'fs'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const spec: AppSpec = body.spec
    const appId: string = body.appId || crypto.randomUUID()

    if (!spec) {
      return NextResponse.json({ error: 'No spec provided' }, { status: 400 })
    }

    // Fail fast if NIM keys are missing
    const hasNim = [process.env.NVIDIA_API_KEY_1, process.env.NVIDIA_API_KEY_2, process.env.NVIDIA_API_KEY_3]
      .some(k => !!k && k.length > 0 && !k.startsWith('YOUR_'))
    if (!hasNim) {
      return NextResponse.json({
        error: 'NVIDIA NIM API keys not configured. Add at least one NVIDIA_API_KEY_* to your .env.local file to enable app generation.',
        code: 'NO_NIM_KEYS'
      }, { status: 503 })
    }

    // Build the app (timeout and GLM-5.1 fallback handled internally)
    const raw = await buildWithRetry(spec, (step) => {
      console.log(`[api/build] Progress: ${step}`)
    })

    if (!raw) {
      return NextResponse.json({ error: 'Build failed after retries' }, { status: 500 })
    }

    // Parse the output JSON
    let parsed: { files: Array<{ path: string; content: string }> }
    try {
      parsed = JSON.parse(raw)
    } catch {
      return NextResponse.json({ error: 'Invalid build output (not valid JSON)' }, { status: 500 })
    }

    if (!parsed.files || !Array.isArray(parsed.files)) {
      return NextResponse.json({ error: 'Build output missing files array' }, { status: 500 })
    }

    const safeFiles = sanitizeFiles(parsed.files)
    if (safeFiles.length === 0) {
      return NextResponse.json({ error: 'Build generated no valid files' }, { status: 500 })
    }

    // Write files to temp directory
    const buildDir = path.join(process.cwd(), '.maya-builds', appId)
    await fs.mkdir(buildDir, { recursive: true })

    for (const file of safeFiles) {
      const filePath = path.join(buildDir, file.path)
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, file.content, 'utf-8')
    }

    // Deploy to Vercel
    const deployResult = await deployToVercel({
      appId,
      projectName: spec.name.toLowerCase().replace(/\s+/g, '-'),
      directory: buildDir,
    })

    // Persist app metadata so /api/dashboard can show it
    const builtApp = {
      id: appId,
      name: spec.name,
      nameHindi: spec.nameHindi,
      descriptionEn: spec.descriptionEn,
      category: spec.category,
      url: deployResult.url,
      projectId: deployResult.projectId,
      createdAt: new Date().toISOString(),
      status: 'live' as const,
      files: parsed.files,
    }
    await addApp(builtApp)

    // Initialize app memory for autoDream/evolution cycles
    const { initAppMemory } = await import('@/lib/memory/autoDream')
    await initAppMemory(buildDir, spec.name, spec.descriptionEn, '').catch((e) =>
      console.warn('[api/build] initAppMemory warning:', e)
    )

    // Trigger initial improvement ideation (async, don't block response)
    _triggerInitialImprovements(appId, spec, deployResult.url).catch((e) =>
      console.warn('[api/build] initial improvements warning:', e)
    )

    return NextResponse.json({
      success: true,
      appId,
      url: deployResult.url,
      projectId: deployResult.projectId,
      files: parsed.files.length,
    })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[api/build]', error)
    if (error === 'NIM_BUILD_TIMEOUT') {
      return NextResponse.json({
        error: 'NVIDIA NIM API timed out. The service may be temporarily unavailable or you need valid API keys in .env.local.',
        code: 'NIM_TIMEOUT',
      }, { status: 504 })
    }
    return NextResponse.json({ error }, { status: 500 })
  }
}

/**
 * After first build goes live, trigger the model to think about what the app
 * lacks and propose 2-3 initial improvements. This seeds the evolution pipeline
 * so the demo has something to show on the very first cron run.
 */
async function _triggerInitialImprovements(
  appId: string,
  spec: { name: string; descriptionEn: string; category: string },
  vercelUrl: string
): Promise<void> {
  // Small delay to let Vercel deploy propagate
  await new Promise(r => setTimeout(r, 5000))

  try {
    const res = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/evolution`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        appId,
        name: spec.name,
        description: spec.descriptionEn,
        vercelUrl,
        initialRun: true,
      }),
    })
    if (res.ok) {
      console.log(`[api/build] Initial improvements triggered for ${appId}`)
    } else {
      console.warn(`[api/build] Initial improvements failed: ${res.status}`)
    }
  } catch (e) {
    console.warn('[api/build] Initial improvements fetch error:', e)
  }
}
