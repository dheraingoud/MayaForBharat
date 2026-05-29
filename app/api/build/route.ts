import { NextResponse } from 'next/server'
import { buildWithRetry, type AppSpec, sanitizeFiles, reviewAndFixCode } from '@/lib/voice-pipeline'
import { deployToVercel } from '@/lib/deploy'
import { addApp } from '@/lib/store'
import { deriveAppDesign, generateGlobalsCss, FEATURE_TIERS } from '@/lib/design'
import path from 'path'
import { promises as fs } from 'fs'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  const body = await request.json()
  const spec: AppSpec = body.spec
  const appId: string = body.appId || crypto.randomUUID()

  if (!spec) {
    return NextResponse.json({ error: 'No spec provided' }, { status: 400 })
  }

  // ── Apply Tier 0 Features Only ──
  const tiers = FEATURE_TIERS[spec.category?.toLowerCase() || 'other'] || FEATURE_TIERS.default
  spec.features = tiers.tier0

  // ── Generate Admin Credentials ──
  const initials = spec.name.split(' ').map(w => w[0]?.toUpperCase()).join('').slice(0, 3) || 'ADM'
  const suffix = Math.floor(1000 + Math.random() * 9000).toString()
  spec.adminUsername = `${initials}${suffix}`
  spec.adminPin = Math.floor(1000 + Math.random() * 9000).toString()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      let clientDisconnected = request.signal.aborted
      request.signal.addEventListener('abort', () => {
        clientDisconnected = true
      })

      function sendEvent(type: string, data: any) {
        if (clientDisconnected) return
        
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type, ...data })}\n\n`))
        } catch (e) {
          clientDisconnected = true
        }
      }

      try {
        const hasNim = [process.env.NVIDIA_API_KEY_1, process.env.NVIDIA_API_KEY_2, process.env.NVIDIA_API_KEY_3]
          .some(k => !!k && k.length > 0 && !k.startsWith('YOUR_'))
        
        if (!hasNim) {
          sendEvent('error', { message: 'NVIDIA NIM API keys not configured. Add at least one NVIDIA_API_KEY_* to your .env.local file to enable app generation.', code: 'NO_NIM_KEYS' })
          controller.close()
          return
        }

        sendEvent('stage', { stage: 'generating' })
        sendEvent('progress', { message: 'Initializing AI builder...' })

        // Build the app
        const raw = await buildWithRetry(spec, (step) => {
          console.log(`[api/build] Progress: ${step}`)
          sendEvent('progress', { message: step })
        })

        if (!raw) throw new Error('Build failed after retries')

        sendEvent('progress', { message: 'Parsing built files...' })
        let parsed: { files: Array<{ path: string; content: string }> }
        try {
          parsed = JSON.parse(raw)
        } catch {
          throw new Error('Invalid build output (not valid JSON)')
        }

        if (!parsed.files || !Array.isArray(parsed.files)) {
          throw new Error('Build output missing files array')
        }

        const safeFiles = sanitizeFiles(parsed.files)
        if (safeFiles.length === 0) {
          throw new Error('Build generated no valid files')
        }

        sendEvent('progress', { message: 'Running AI Code Review...' })
        const reviewResult = await reviewAndFixCode(safeFiles)
        
        let finalFiles = safeFiles
        if (reviewResult.status === 'fail' && reviewResult.fixedFiles) {
          sendEvent('progress', { message: 'Review complete. Applying AI fixes...' })
          const fixedSanitized = sanitizeFiles(reviewResult.fixedFiles)
          finalFiles = [...safeFiles]
          for (const fixed of fixedSanitized) {
            const idx = finalFiles.findIndex(f => f.path === fixed.path)
            if (idx !== -1) finalFiles[idx] = fixed
            else finalFiles.push(fixed)
          }
        }

        sendEvent('progress', { message: 'Applying unified design system...' })
        // ── Inject Dynamic Design Tokens (globals.css) ──
        const appDesign = deriveAppDesign(spec.category, spec.name, 'Mumbai')
        const globalsCssContent = generateGlobalsCss(appDesign)
        
        const filteredFiles = finalFiles.filter(f => f.path !== 'app/globals.css' && f.path !== 'styles/globals.css')
        filteredFiles.push({ path: 'app/globals.css', content: globalsCssContent })

        const buildDir = path.join(process.cwd(), '.maya-builds', appId)
        await fs.mkdir(buildDir, { recursive: true })

        sendEvent('progress', { message: 'Writing files to disk...' })
        for (const file of filteredFiles) {
          const filePath = path.join(buildDir, file.path)
          await fs.mkdir(path.dirname(filePath), { recursive: true })
          await fs.writeFile(filePath, file.content, 'utf-8')
        }

        sendEvent('stage', { stage: 'deploying' })
        sendEvent('progress', { message: 'Scaffolding Next.js app and deploying to Vercel...' })

        const deployResult = await deployToVercel({
          appId,
          projectName: spec.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-'),
          directory: buildDir,
        })

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
          adminUsername: spec.adminUsername,
          adminPin: spec.adminPin,
          shownToOwner: false,
          files: filteredFiles,
        }
        await addApp(builtApp)

        sendEvent('progress', { message: 'Initializing background intelligence...' })
        const { initAppMemory } = await import('@/lib/memory/autoDream')
        await initAppMemory(buildDir, spec.name, spec.descriptionEn, '').catch(e => console.warn('[api/build] initAppMemory warning:', e))
        
        // Disabled automatic evolution loop as requested by the user
        // _triggerInitialImprovements(appId, spec, deployResult.url).catch(e => console.warn('[api/build] initial improvements warning:', e))

        sendEvent('done', { appId, url: deployResult.url })
        controller.close()
      } catch (e: unknown) {
        const errorMsg = e instanceof Error ? e.message : String(e)
        console.error('[api/build]', errorMsg)
        
        if (errorMsg === 'NIM_BUILD_TIMEOUT') {
          sendEvent('error', { message: 'NVIDIA NIM API timed out. Service may be unavailable.', code: 'NIM_TIMEOUT' })
        } else {
          sendEvent('error', { message: errorMsg })
        }
        controller.close()
      }
    }
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive'
    }
  })
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
