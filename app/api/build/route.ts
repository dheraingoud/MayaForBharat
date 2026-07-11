import { NextResponse } from 'next/server'
import { buildWithRetry, type AppSpec, sanitizeFiles, reviewAndFixCode } from '@/lib/voice-pipeline'
import { deployToVercel } from '@/lib/deploy'
import { addApp } from '@/lib/store'
import { deriveAppDesign, generateGlobalsCss, FEATURE_TIERS } from '@/lib/design'
import { getBuildsDir } from '@/lib/path'
import { checkRateLimit, getRateLimitKey, BUILD_LIMIT } from '@/lib/rate-limit'
import path from 'path'
import { promises as fs } from 'fs'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: Request) {
  // Rate limit: 3 builds per 10 minutes per IP
  const rlKey = getRateLimitKey(request, 'build')
  const rl = checkRateLimit(rlKey, BUILD_LIMIT)
  if (!rl.allowed) {
    return NextResponse.json(
      { error: `Rate limited. Try again in ${rl.retryAfterSeconds}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } }
    )
  }

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

        // ── Scope Contract: Post-Build Violation Scan ──
        try {
          const { scanForScopeViolations, scanPackageJson } = await import('@/lib/scope-contract')
          const violations = scanForScopeViolations(safeFiles)
          const bannedDeps = scanPackageJson(safeFiles)
          if (violations.length > 0) {
            console.warn(`[api/build] Scope violations detected (${violations.length}):`, violations.slice(0, 5))
            sendEvent('progress', { message: `Warning: ${violations.length} scope violations detected (non-blocking)` })
          }
          if (bannedDeps.length > 0) {
            console.warn(`[api/build] Banned dependencies found:`, bannedDeps)
          }
        } catch (e) {
          console.warn('[api/build] Scope scan failed (non-fatal):', e)
        }

        let finalFiles = safeFiles

        sendEvent('progress', { message: 'Applying unified design system...' })
        // ── Inject Dynamic Design Tokens (globals.css) ──
        const appDesign = deriveAppDesign(spec.category, spec.name, 'Mumbai')
        const globalsCssContent = generateGlobalsCss(appDesign)
        
        const filteredFiles = finalFiles.filter(f => f.path !== 'app/globals.css' && f.path !== 'styles/globals.css')
        filteredFiles.push({ path: 'app/globals.css', content: globalsCssContent })

        // ── Pre-Deploy Hardening: Deterministic fixes before first deploy ──
        // Catches 'use client' missing, wrong imports, unused lucide icons, etc.
        // This prevents the first deploy from failing on easily-fixable issues.
        try {
          const { applyDeterministicFixes } = await import('@/lib/voice-pipeline')
          const { files: hardened, fixCount } = applyDeterministicFixes(filteredFiles)
          filteredFiles.length = 0
          filteredFiles.push(...hardened)
          if (fixCount > 0) {
            sendEvent('progress', { message: `Pre-deploy: auto-fixed ${fixCount} potential issue${fixCount > 1 ? 's' : ''}` })
          }
        } catch (e) {
          console.warn('[api/build] Pre-deploy hardening skipped:', e)
        }

        const buildDir = getBuildsDir(appId)
        await fs.mkdir(buildDir, { recursive: true })

        sendEvent('progress', { message: 'Writing files to disk...' })
        for (const file of filteredFiles) {
          const filePath = path.join(buildDir, file.path)
          await fs.mkdir(path.dirname(filePath), { recursive: true })
          await fs.writeFile(filePath, file.content, 'utf-8')
        }

        // Add vercel.json to allow iframe embedding from MAYA dashboard
        const vercelConfig = {
          headers: [
            {
              source: "/(.*)",
              headers: [
                { key: "X-Frame-Options", value: "ALLOWALL" },
                { key: "Content-Security-Policy", value: "frame-ancestors *" },
              ]
            }
          ]
        }
        await fs.writeFile(path.join(buildDir, 'vercel.json'), JSON.stringify(vercelConfig, null, 2), 'utf-8')

        sendEvent('stage', { stage: 'deploying' })
        sendEvent('progress', { message: 'Deploying preview to Vercel...' })

        const projectName = spec.name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-')
        const token = process.env.DEPLOY_TOKEN

        let previewDeployResult: any = null
        let deployAttempts = 0
        const MAX_DEPLOY_RETRIES = 3

        while (deployAttempts <= MAX_DEPLOY_RETRIES) {
          deployAttempts++
          
          // Deploy to preview first — user clicks "Go Live" to promote
          previewDeployResult = await deployToVercel({
            appId,
            projectName,
            directory: buildDir,
            target: 'preview',
          })
          
          if (previewDeployResult.success) {
            break // Success!
          }
          
          if (deployAttempts > MAX_DEPLOY_RETRIES) break // Don't try to fix after last attempt
          
          // Fast auto-fixer: deterministic fixes first, then targeted AI fix
          const { getDeploymentLogs } = await import('@/lib/deploy')
          const logs = await getDeploymentLogs(previewDeployResult.deploymentId || '', token || '')
          
          sendEvent('progress', { message: `Build error detected (attempt ${deployAttempts}/${MAX_DEPLOY_RETRIES + 1}). Fixing...` })
          const { fixVercelBuildErrors } = await import('@/lib/voice-pipeline')
          const newFiles = await fixVercelBuildErrors(
            filteredFiles, 
            logs,
            (msg) => sendEvent('progress', { message: msg })
          )
          
          // Update filteredFiles so the final builtApp has the updated code
          filteredFiles.length = 0
          filteredFiles.push(...newFiles)
          
          // Write updated files to disk for next Vercel deploy attempt
          for (const file of filteredFiles) {
            const filePath = path.join(buildDir, file.path)
            await fs.mkdir(path.dirname(filePath), { recursive: true })
            await fs.writeFile(filePath, file.content, 'utf-8')
          }
          sendEvent('progress', { message: 'Re-deploying with fixes...' })
          continue // loop around and deploy again!
        }

        if (!previewDeployResult?.success) {
          throw new Error('Vercel build failed after maximum retries. The AI could not resolve all compiler errors automatically.')
        }

        sendEvent('progress', { message: 'Preview ready! Running visual verification...' })

        // ── Visual Verification Gate (MAYA-IMPORTANT.md Part 4) ──
        // Separate VERIFIER model (MiniMax M3) checks the deployed preview.
        // The Writer (step-3.7-flash) cannot grade its own work.
        let verificationPassed = true
        let verificationFindings: unknown[] = []
        try {
          const { quickVerify } = await import('@/lib/visual-verifier')
          const health = await quickVerify(previewDeployResult.url)
          verificationPassed = health.healthy
          if (!health.healthy) {
            verificationFindings = health.errors
            console.warn(`[api/build] Visual verification flagged issues:`, health.errors)
            sendEvent('progress', { message: `⚠️ Verification found ${health.errors.length} issue(s) — preview may have problems.` })
          } else {
            sendEvent('progress', { message: '✅ Visual verification passed!' })
          }
        } catch (e) {
          console.warn('[api/build] Visual verification skipped:', e)
        }

        sendEvent('progress', { message: 'Generating summary...' })

        // Generate a quick chat summary
        let summaryText = 'Your app preview is ready! Review it and click "Go Live" when you\'re happy.'
        try {
          const { nimChat, MODELS } = await import('@/lib/nim-client')
          const sumRes = await nimChat({
            model: MODELS.PLANNER,
            messages: [
              { role: 'system', content: 'You are MAYA, an AI app builder. The user just asked you to build an app. Summarize what you built in 2-3 short, friendly sentences. Be extremely concise. Start with "I have built your app!" or similar.' },
              { role: 'user', content: `App Name: ${spec.name}\nDescription: ${spec.descriptionEn}` }
            ]
          })
          if (sumRes) summaryText = sumRes
        } catch (e) {
          console.warn('[api/build] Failed to generate summary', e)
        }

        // Save as 'preview' — user must click "Go Live" to promote to production
        const builtApp = {
          id: appId,
          name: spec.name,
          nameHindi: spec.nameHindi,
          descriptionEn: spec.descriptionEn,
          category: spec.category,
          url: previewDeployResult.url,
          projectId: previewDeployResult.projectId,
          deploymentId: previewDeployResult.deploymentId,
          createdAt: new Date().toISOString(),
          status: 'preview' as const,
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

        // Send preview_ready — builder page redirects to app detail with "Go Live" button
        sendEvent('preview_ready', {
          appId,
          url: previewDeployResult.url,
          deploymentId: previewDeployResult.deploymentId,
          projectId: previewDeployResult.projectId,
          verificationPassed,
          verificationFindings,
        })
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

