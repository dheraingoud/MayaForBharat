import { NextResponse } from 'next/server'
import { buildWithRetry, type AppSpec, sanitizeFiles, reviewAndFixCode } from '@/lib/voice-pipeline'
import { deployToVercel } from '@/lib/deploy'
import { addApp } from '@/lib/store'
import { deriveAppDesign, generateGlobalsCss, FEATURE_TIERS } from '@/lib/design'
import { getBuildsDir } from '@/lib/path'
import path from 'path'
import { promises as fs } from 'fs'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  const body = await request.json()
  const spec: AppSpec = body.spec
  const appId: string = body.appId || crypto.randomUUID()
  const partialContent: string = body.partialContent || ''

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

        // ── Pre-save App as "building" so it appears in Dashboard even if client disconnects ──
        if (!partialContent) {
          try {
            await addApp({
              id: appId,
              name: spec.name,
              nameHindi: spec.nameHindi,
              descriptionEn: spec.descriptionEn,
              category: spec.category,
              url: '',
              projectId: '',
              createdAt: new Date().toISOString(),
              status: 'building',
              adminUsername: spec.adminUsername,
              adminPin: spec.adminPin,
              files: [],
            })
          } catch (e) {
            console.warn('[api/build] Failed to pre-save app', e)
          }
        }

        // Build the app
        const raw = await buildWithRetry(
          spec, 
          (step) => {
            console.log(`[api/build] Progress: ${step}`)
            sendEvent('progress', { message: step })
          },
          partialContent,
          (text) => sendEvent('chunk', { text })
        )

        if (!raw) throw new Error('Build failed after retries')

        sendEvent('progress', { message: 'Parsing built files...' })
        const { parseModelOutput } = await import('@/lib/tags')
        const ops = parseModelOutput(raw)
        const rawFiles = ops.filter(op => op.type === 'write').map(op => ({ path: op.path, content: op.content || '' }))
        
        if (rawFiles.length === 0) {
          throw new Error('Build generated no valid files')
        }

        const safeFiles = sanitizeFiles(rawFiles)
        if (safeFiles.length === 0) {
          throw new Error('Build generated no valid files after sanitization')
        }

        let finalFiles = safeFiles

        sendEvent('progress', { message: 'Applying unified design system...' })
        // ── Inject Dynamic Design Tokens (globals.css) ──
        const appDesign = deriveAppDesign(spec.category, spec.name, 'Mumbai')
        const globalsCssContent = generateGlobalsCss(appDesign)
        
        const filteredFiles = finalFiles.filter(f => f.path !== 'app/globals.css' && f.path !== 'styles/globals.css')
        filteredFiles.push({ path: 'app/globals.css', content: globalsCssContent })

        const buildDir = getBuildsDir(appId)
        await fs.mkdir(buildDir, { recursive: true })

        sendEvent('progress', { message: 'Writing files to disk...' })
        for (const file of filteredFiles) {
          const filePath = path.join(buildDir, file.path)
          await fs.mkdir(path.dirname(filePath), { recursive: true })
          await fs.writeFile(filePath, file.content, 'utf-8')
        }

        sendEvent('stage', { stage: 'deploying' })
        sendEvent('progress', { message: 'Scaffolding Next.js app and deploying to Vercel Preview...' })

        const projectName = spec.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
        const token = process.env.DEPLOY_TOKEN

        let previewDeployResult: any = null
        let deployAttempts = 0
        const MAX_DEPLOY_RETRIES = 2

        while (deployAttempts <= MAX_DEPLOY_RETRIES) {
          deployAttempts++
          
          // 1. Deploy to preview (with strict typescript config)
          previewDeployResult = await deployToVercel({
            appId,
            projectName,
            directory: buildDir,
            target: 'preview',
          })
          
          if (previewDeployResult.success) {
            break // Success!
          }
          
          // It failed
          if (deployAttempts > MAX_DEPLOY_RETRIES || !token || !previewDeployResult.deploymentId) {
            throw new Error(`Preview build failed after ${MAX_DEPLOY_RETRIES} retries.`)
          }
          
          sendEvent('progress', { message: `Vercel preview build failed (Attempt ${deployAttempts}/${MAX_DEPLOY_RETRIES}). Fetching compiler logs...` })
          
          const { getDeploymentLogs } = await import('@/lib/deploy')
          const logs = await getDeploymentLogs(previewDeployResult.deploymentId, token)
          
          sendEvent('progress', { message: 'Analyzing build errors and rewriting code...' })
          
          const { fixVercelBuildErrors } = await import('@/lib/voice-pipeline')
          const newFiles = await fixVercelBuildErrors(filteredFiles, logs)
          
          sendEvent('progress', { message: 'Applying AI fixes and redeploying...' })
          
          // Update filteredFiles so the final builtApp has the updated code
          filteredFiles.length = 0
          filteredFiles.push(...newFiles)
          
          // Write updated files to disk for Vercel deploy
          for (const file of filteredFiles) {
            const filePath = path.join(buildDir, file.path)
            await fs.mkdir(path.dirname(filePath), { recursive: true })
            await fs.writeFile(filePath, file.content, 'utf-8')
          }
        }

        sendEvent('progress', { message: 'Preview build passed. Promoting to Production...' })

        // 2. Deploy to production (with prod config)
        let existingVercelProjectId: string | undefined = undefined
        try {
          const { getApp } = await import('@/lib/store')
          const existingApp = await getApp(appId)
          if (existingApp?.projectId) {
            existingVercelProjectId = existingApp.projectId
          }
        } catch (e) {
          console.warn('Failed to fetch existing app for vercelProjectId', e)
        }

        const deployResult = await deployToVercel({
          appId,
          projectName,
          directory: buildDir,
          target: 'production',
          vercelProjectId: existingVercelProjectId,
        })

        // 3. Generate a quick chat summary
        sendEvent('progress', { message: 'Generating app summary...' })
        let summaryText = 'I have built your app! It includes all the requested features and is deployed live.'
        try {
          const { nimChat, MODELS } = await import('@/lib/nim-client')
          const sumRes = await nimChat({
            model: MODELS.PLANNER, // Use fast model
            messages: [
              { role: 'system', content: 'You are MAYA, an AI app builder. The user just asked you to build an app. Summarize what you built in 2-3 short, friendly sentences. Be extremely concise. Start with "I have built your app!" or similar.' },
              { role: 'user', content: `App Name: ${spec.name}\nDescription: ${spec.descriptionEn}` }
            ]
          })
          if (sumRes) summaryText = sumRes
        } catch (e) {
          console.warn('[api/build] Failed to generate summary', e)
        }

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
          messages: [
            { role: 'user' as const, content: spec.descriptionEn, timestamp: Date.now() - 60000 },
            { role: 'assistant' as const, content: summaryText, timestamp: Date.now() }
          ],
          files: filteredFiles,
        }
        await addApp(builtApp)

        sendEvent('progress', { message: 'Initializing background intelligence...' })
        const { initAppMemory } = await import('@/lib/memory/autoDream')
        await initAppMemory(buildDir, spec.name, spec.descriptionEn, '').catch(e => console.warn('[api/build] initAppMemory warning:', e))
        
        // Trigger initial background improvements
        _triggerInitialImprovements(appId, spec, deployResult.url).catch(e => console.warn('[api/build] initial improvements warning:', e))

        sendEvent('done', { appId, url: deployResult.url })
        try { controller.close() } catch (ignore) {}
      } catch (e: unknown) {
        const errorMsg = e instanceof Error ? e.message : String(e)
        console.error('[api/build]', errorMsg)
        
        if (errorMsg === 'NIM_BUILD_TIMEOUT') {
          sendEvent('error', { message: 'NVIDIA NIM API timed out. Service may be unavailable.', code: 'NIM_TIMEOUT' })
        } else {
          sendEvent('error', { message: errorMsg })
        }
        try { controller.close() } catch (ignore) {}
      } finally {
        try { controller.close() } catch (ignore) {}
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
