import { nimChat, MODELS } from '@/lib/nim-client'
import { sanitizeFiles } from '@/lib/voice-pipeline'
import { getApp, addApp } from '@/lib/store'
import { deployToVercel, getDeploymentLogs } from '@/lib/deploy'
import { getSkillsForContext } from '@/lib/skills'
import {
  detectLanguage, getStatusLine, inferStatusFromPath,
  stripThinking, shouldSummarize, buildSummaryPrompt,
  buildFileContext, estimateTokens,
} from '@/lib/status-map'
import { calcMultiDiff } from '@/lib/diff-calc'
import { promises as fs } from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const maxDuration = 300
export const dynamic = 'force-dynamic' // Prevent caching for SSE

// ─── File type priority weights (Research Doc §2: schema > page > component > util) ──
const FILE_PRIORITY: Record<string, number> = {
  'schema':     15,
  'convex/':    12,
  'page.tsx':   10,
  'page.jsx':   10,
  'layout.tsx':  9,
  'layout.jsx':  9,
  'app/page':    8,
  'components/': 5,
  'lib/':        3,
  'styles':      2,
  'config':      2,
  'package.json': 1,
}

function getFilePriority(filePath: string): number {
  const lower = filePath.toLowerCase()
  for (const [pattern, score] of Object.entries(FILE_PRIORITY)) {
    if (lower.includes(pattern)) return score
  }
  return 0
}

// ─── Token budget ────────────────────────────────────────────────────────────
const MAX_CONTEXT_TOKENS = 24000
const MAX_RESPONSE_TOKENS = 16384
const MAX_CONTEXT_FILES = 8

/**
 * POST /api/chat-edit — SSE Streaming Pipeline
 * 
 * Returns text/event-stream with real-time status events:
 *   data: {"type":"status","event":"reading_files","message":"..."}
 *   data: {"type":"file_change","path":"...","additions":N,"deletions":N,"action":"..."}
 *   data: {"type":"thinking","content":"..."} // preserved for model context, collapsible in UI
 *   data: {"type":"done","url":"...","summary":"...","changes":{...}}
 *   data: {"type":"error","message":"..."}
 */
export async function POST(request: Request) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      // Helper to send SSE events
      const send = (data: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch { /* controller might be closed */ }
      }

      try {
        const body = await request.json()
        const { appId, userMessage, attachedFiles } = body

        if (!appId || !userMessage) {
          send({ type: 'error', message: 'Missing appId or userMessage' })
          controller.close()
          return
        }

        const userLang = detectLanguage(userMessage)

        // ═══════════════════════════════════════════════════════════════════
        // STEP 1: Read files from disk
        // ═══════════════════════════════════════════════════════════════════

        send({ type: 'status', event: 'reading_files', message: getStatusLine('reading_files', userLang) })

        const app = await getApp(appId)
        if (!app) {
          send({ type: 'error', message: getStatusLine('error', userLang) })
          controller.close()
          return
        }

        const { getBuildsDir } = await import('@/lib/path')
        const buildDir = getBuildsDir(appId)

        let currentFiles: { path: string; content: string }[] = []
        try {
          const entries = await fs.readdir(buildDir, { recursive: true, withFileTypes: true })
          for (const entry of entries) {
            if (!entry.isFile()) continue
            const fullPath = path.join(entry.parentPath || buildDir, entry.name)
            const relPath = path.relative(buildDir, fullPath).replace(/\\/g, '/')
            if (relPath.includes('node_modules/') || relPath.includes('.next/') || relPath.startsWith('.')) continue
            if (/\.(tsx?|jsx?|css|json|md|html)$/.test(relPath)) {
              const content = await fs.readFile(fullPath, 'utf-8')
              currentFiles.push({ path: relPath, content })
            }
          }
        } catch { /* disk read failed */ }

        // Fallback: restore from DB
        if (currentFiles.length === 0 && app.files && app.files.length > 0) {
          currentFiles = app.files
          try {
            for (const file of currentFiles) {
              const filePath = path.join(buildDir, file.path)
              await fs.mkdir(path.dirname(filePath), { recursive: true })
              await fs.writeFile(filePath, file.content, 'utf-8')
            }
          } catch { /* restore failed */ }
        }

        if (currentFiles.length === 0) {
          send({ type: 'error', message: getStatusLine('error', userLang) })
          controller.close()
          return
        }

        // Build old files map for diff calculation
        const oldFilesMap = new Map<string, string>()
        for (const f of currentFiles) oldFilesMap.set(f.path, f.content)

        // ═══════════════════════════════════════════════════════════════════
        // STEP 2: Assemble context (Onlook FileContext pattern)
        // ═══════════════════════════════════════════════════════════════════

        send({ type: 'status', event: 'planner_start', message: getStatusLine('planner_start', userLang) })

        const queryWords = userMessage.toLowerCase().split(/\s+/).filter((w: string) => w.length > 2)
        
        const scoredFiles = currentFiles.map(f => {
          let score = getFilePriority(f.path)
          const pathLower = f.path.toLowerCase()
          const contentLower = f.content.toLowerCase().slice(0, 500)
          for (const word of queryWords) {
            if (pathLower.includes(word)) score += 8
            if (contentLower.includes(word)) score += 4
          }
          return { ...f, score }
        }).sort((a, b) => b.score - a.score)

        // Token-budget-aware file selection (limit to MAX_CONTEXT_FILES to reduce output)
        let totalTokens = 0
        const selectedFiles: typeof currentFiles = []
        
        for (const f of scoredFiles) {
          if (selectedFiles.length >= MAX_CONTEXT_FILES) break
          const fileTokens = estimateTokens(f.content)
          if (totalTokens + fileTokens > MAX_CONTEXT_TOKENS && selectedFiles.length >= 3) break
          selectedFiles.push({ path: f.path, content: f.content })
          totalTokens += fileTokens
        }

        const fileContext = buildFileContext(selectedFiles)

        // ═══════════════════════════════════════════════════════════════════
        // STEP 3: Conversation history (summarize if > 8 turns)
        // ═══════════════════════════════════════════════════════════════════

        let conversationContext = ''
        const existingMessages = app.messages || []
        
        if (existingMessages.length > 0) {
          if (shouldSummarize(existingMessages.map(m => ({ role: m.role, content: m.content })))) {
            // Only call summarization model for truly long conversations (>12 turns)
            if (existingMessages.length > 12) {
              const oldMessages = existingMessages.slice(0, -4)
              const recentMessages = existingMessages.slice(-4)
              
              try {
                const summaryPrompt = buildSummaryPrompt(oldMessages.map(m => ({ role: m.role, content: m.content })))
                const summary = await nimChat({
                  model: MODELS.PLANNER, // Use lighter model for summaries
                  messages: [{ role: 'user', content: summaryPrompt }],
                  maxTokensOverride: 1024,
                })
                
                conversationContext = `<conversation_summary>\n${summary.trim()}\n</conversation_summary>\n\n<recent_messages>\n${recentMessages.map(m => `${m.role}: ${m.content}`).join('\n')}\n</recent_messages>`
              } catch {
                // Fast fallback: just use last 6 messages, no model call needed
                conversationContext = `<recent_messages>\n${existingMessages.slice(-6).map(m => `${m.role}: ${m.content.slice(0, 500)}`).join('\n')}\n</recent_messages>`
              }
            } else {
              // 8-12 turns: just use last 6, no summarization call needed
              conversationContext = `<recent_messages>\n${existingMessages.slice(-6).map(m => `${m.role}: ${m.content.slice(0, 500)}`).join('\n')}\n</recent_messages>`
            }
          } else {
            conversationContext = `<conversation_history>\n${existingMessages.map(m => `${m.role}: ${m.content.slice(0, 500)}`).join('\n')}\n</conversation_history>`
          }
        }

        // Attached files context (injected from client-side file reads)
        let attachedContext = ''
        if (attachedFiles && Array.isArray(attachedFiles) && attachedFiles.length > 0) {
          attachedContext = '\n\n<attached_files>\n' + 
            attachedFiles.map((f: { name: string; content: string }) => 
              `<attached_file name="${f.name}">\n${f.content.slice(0, 5000)}\n</attached_file>`
            ).join('\n') + 
            '\n</attached_files>'
        }

        const skills = await getSkillsForContext('builder').catch(() => '')

        // ═══════════════════════════════════════════════════════════════════
        // STEP 4: AI generates edits
        // ═══════════════════════════════════════════════════════════════════

        send({ type: 'status', event: 'editing_code', message: getStatusLine('editing_code', userLang) })

        const editResult = await nimChat({
          model: MODELS.BUILDER,
          messages: [
            {
              role: 'system',
              content: `[CAVEMAN] You are MAYA's targeted app editor. User wants a specific change to their app.
          
DESIGN TOKENS (LOCKED):
accent: #E8601A. bg:#EFEFEF surface:#ffffff border:#e4e4e7
Fonts: Hind(Hindi) Noto Sans Devanagari(body). LIGHT ONLY. Mobile-first.
ALL text in HINDI. Numbers in Arabic numerals. ₹ for currency.

THINKING: You may wrap your reasoning in <maya-thinking>...</maya-thinking> tags. 
This content will be preserved for future context but NEVER shown to the user directly.
Only content OUTSIDE these tags will be displayed as the final answer.

Your task: Apply the user's requested changes FULLY. Edit ALL files needed to completely satisfy the request.
Do NOT regenerate files that don't need changes. Do NOT leave the job half-done.
Output ONLY valid JSON. No markdown. No code fences.

Output format:
{"files":[{"path":"relative/path.tsx","content":"full file content","action":"modify"|"create"}],"summary":"one-line summary in the SAME LANGUAGE as the user's message","summaryEn":"one-line English summary","filesRead":["list of files you analyzed"]}

CRITICAL OUTPUT RULES:
- Edit ALL files needed to fully satisfy the user's request — no artificial limit
- Keep ALL existing functionality intact unless the user asks to change it
- Output the COMPLETE file content for each modified file (not a diff)
- TypeScript strict. Tailwind only.
- summary field MUST be in the same language as the user's request
- IMPORTANT: Start with the JSON immediately. No preamble, no explanation.
${skills}`,
            },
            {
              role: 'user',
              content: `${conversationContext ? conversationContext + '\n\n' : ''}<app_files>\n${fileContext}\n</app_files>${attachedContext}\n\nUser's change request: "${userMessage}"`,
            },
          ],
          maxTokensOverride: MAX_RESPONSE_TOKENS,
          stream: true,
          onChunk: (chunk) => {
            // Stream partial tokens — send a writing_code status periodically
            // (we don't stream raw tokens to the user, just keep them informed the AI is working)
          },
        })

        // ═══════════════════════════════════════════════════════════════════
        // STEP 5: Parse result (strip thinking, send to client)
        // ═══════════════════════════════════════════════════════════════════

        // Check if client disconnected before expensive parsing
        if (request.signal.aborted) { controller.close(); return }

        const { display: cleanResult, thinking } = stripThinking(editResult)
        
        // Send thinking as a separate event (client renders as collapsible)
        if (thinking) {
          send({ type: 'thinking', content: thinking })
          console.log(`[chat-edit] Thinking (${thinking.length} chars)`)
        }

        let parsed: {
          files: Array<{ path: string; content: string; action: string }>
          summary: string
          summaryEn: string
        }
        let isPartialRecovery = false

        try {
          let cleaned = cleanResult.trim()
          if (cleaned.startsWith('```')) {
            cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
          }
          const firstBrace = cleaned.indexOf('{')
          const lastBrace = cleaned.lastIndexOf('}')
          if (firstBrace !== -1 && lastBrace !== -1) {
            cleaned = cleaned.slice(firstBrace, lastBrace + 1)
          }
          parsed = JSON.parse(cleaned)
        } catch (jsonErr) {
          // JSON parse failed — extract complete file objects via regex and deploy them
          console.warn(`[chat-edit] JSON parse failed, recovering files. Raw length: ${cleanResult.length}`)
          try {
            // Match complete file objects in any field order
            const fileMatches = cleanResult.match(/\{\s*"path"\s*:\s*"[^"]+"\s*,\s*"content"\s*:\s*"(?:[^"\\]|\\.)*"\s*,\s*"action"\s*:\s*"[^"]+"\s*\}/g)
            if (fileMatches && fileMatches.length > 0) {
              const recoveredFiles = fileMatches.map(m => {
                try { return JSON.parse(m) } catch { return null }
              }).filter(Boolean)
              if (recoveredFiles.length > 0) {
                console.log(`[chat-edit] Recovered ${recoveredFiles.length} complete files — deploying`)
                // Recovered files have complete path+content+action → they ARE valid, deploy them
                isPartialRecovery = false
                
                const summaryMatch = cleanResult.match(/"summaryEn"\s*:\s*"([^"]*)"/)
                const summaryHiMatch = cleanResult.match(/"summary"\s*:\s*"([^"]*)"/)
                parsed = {
                  files: recoveredFiles,
                  summary: summaryHiMatch?.[1] || (userLang === 'hi' ? 'बदलाव लागू किए गए' : 'Changes applied'),
                  summaryEn: summaryMatch?.[1] || 'Changes applied',
                }
              } else { throw jsonErr }
            } else { throw jsonErr }
          } catch {
            send({ type: 'error', message: userLang === 'hi' ? 'AI का जवाब अधूरा था। कृपया दोबारा प्रयास करें।' : 'AI response was truncated. Please try again with a simpler request.' })
            controller.close()
            return
          }
        }

        if (!parsed.files || !Array.isArray(parsed.files) || parsed.files.length === 0) {
          send({ type: 'error', message: userLang === 'hi' ? 'AI यह नहीं समझ पाई कि कौन सी फ़ाइलें बदलनी हैं।' : 'AI could not determine what files to change.' })
          controller.close()
          return
        }

        // ═══════════════════════════════════════════════════════════════════
        // STEP 5b: Validate files — non-empty, size cap, path safety
        // ═══════════════════════════════════════════════════════════════════

        const MAX_FILE_SIZE = 100 * 1024 // 100KB per file

        // Filter and validate files
        const validFiles = parsed.files.filter((f) => {
          if (!f.path || typeof f.path !== 'string') {
            console.warn(`[chat-edit] Skipping file with invalid path:`, f.path)
            return false
          }
          if (f.path.includes('..') || f.path.startsWith('/') || f.path.startsWith('\\')) {
            console.warn(`[chat-edit] Skipping file with unsafe path:`, f.path)
            return false
          }
          if (!f.content || typeof f.content !== 'string' || f.content.trim().length === 0) {
            console.warn(`[chat-edit] Skipping file with empty content:`, f.path)
            return false
          }
          if (f.content.length > MAX_FILE_SIZE) {
            console.warn(`[chat-edit] Truncating file ${f.path} from ${f.content.length} to ${MAX_FILE_SIZE} bytes`)
            f.content = f.content.slice(0, MAX_FILE_SIZE)
          }
          return true
        })

        if (validFiles.length === 0) {
          send({ type: 'error', message: userLang === 'hi' ? 'AI ने कोई वैध फ़ाइल नहीं बनाई।' : 'AI generated no valid files.' })
          controller.close()
          return
        }

        // ═══════════════════════════════════════════════════════════════════
        // STEP 6: Write files + calculate diffs + stream file changes
        // ═══════════════════════════════════════════════════════════════════

        if (request.signal.aborted) { controller.close(); return }

        const safeFiles = sanitizeFiles(validFiles)
        if (safeFiles.length === 0) {
          send({ type: 'error', message: getStatusLine('error', userLang) })
          controller.close()
          return
        }

        // Calculate diffs before writing
        const { diffs, totalAdditions, totalDeletions } = calcMultiDiff(oldFilesMap, safeFiles)

        send({ type: 'status', event: 'writing_files', message: userLang === 'hi' ? 'फ़ाइलें लिख रहे हैं...' : 'Writing files...' })

        // Stream each file change event + write to disk
        let writeErrors = 0
        for (let i = 0; i < safeFiles.length; i++) {
          if (request.signal.aborted) { controller.close(); return }

          const file = safeFiles[i]
          const diff = diffs[i]
          const statusEvent = inferStatusFromPath(file.path)
          
          send({
            type: 'file_change',
            path: file.path,
            additions: diff?.additions || 0,
            deletions: diff?.deletions || 0,
            action: diff?.action || 'modify',
          })

          console.log(`[chat-edit] ${getStatusLine(statusEvent, 'en')}: ${file.path} (+${diff?.additions || 0} -${diff?.deletions || 0})`)
          
          try {
            const filePath = path.join(buildDir, file.path)
            await fs.mkdir(path.dirname(filePath), { recursive: true })
            await fs.writeFile(filePath, file.content, 'utf-8')
          } catch (writeErr) {
            console.error(`[chat-edit] Failed to write ${file.path}:`, writeErr)
            writeErrors++
          }
        }

        if (writeErrors === safeFiles.length) {
          send({ type: 'error', message: userLang === 'hi' ? 'फ़ाइलें लिखने में विफल।' : 'Failed to write files to disk.' })
          controller.close()
          return
        }

        // Ensure vercel.json exists for iframe embedding
        try {
          const vercelConfigPath = path.join(buildDir, 'vercel.json')
          try { await fs.access(vercelConfigPath) } catch {
            const vercelConfig = {
              headers: [{ source: "/(.*)", headers: [
                { key: "X-Frame-Options", value: "ALLOWALL" },
                { key: "Content-Security-Policy", value: "frame-ancestors *" },
              ]}]
            }
            await fs.writeFile(vercelConfigPath, JSON.stringify(vercelConfig, null, 2), 'utf-8')
          }
        } catch { /* non-fatal */ }

        // ═══════════════════════════════════════════════════════════════════
        // STEP 7: Deploy (SKIP if partial recovery)
        // ═══════════════════════════════════════════════════════════════════

        let deployUrl = app.url // fallback to existing URL = safe default

        if (isPartialRecovery) {
          // CRITICAL: Partial files would break the live app.
          // Keep the existing deployment, only save files to disk for next attempt.
          console.warn(`[chat-edit] PARTIAL RECOVERY — skipping deploy, keeping live URL: ${app.url}`)
          send({ type: 'status', event: 'deploy_skipped', message: userLang === 'hi' 
            ? 'आंशिक बदलाव — लाइव ऐप सुरक्षित है' 
            : 'Partial changes saved. Live app unchanged.' })
        } else if (!request.signal.aborted) {
          send({ type: 'status', event: 'deploying', message: getStatusLine('deploying', userLang) })

          try {
            const deployResult = await deployToVercel({
              appId,
              projectName: app.name.toLowerCase().replace(/\s+/g, '-'),
              directory: buildDir,
              vercelProjectId: app.projectId,
              target: 'preview',
            })

            // ── Build failed → fetch logs, auto-fix, retry once ──
            if (!deployResult.success && deployResult.deploymentId) {
              console.warn(`[chat-edit] Build failed for ${appId}, fetching logs for auto-fix...`)
              send({ type: 'status', event: 'build_fix', message: userLang === 'hi' 
                ? 'बिल्ड विफल — त्रुटि ठीक कर रहे हैं...' 
                : 'Build failed — fixing errors...' })

              // Fetch build logs from Vercel
              const token = process.env.DEPLOY_TOKEN
              let buildLogs = ''
              if (token && deployResult.deploymentId) {
                try {
                  buildLogs = await getDeploymentLogs(deployResult.deploymentId, token)
                } catch { buildLogs = 'Failed to fetch build logs' }
              }

              // Extract the most relevant error lines (last 60 lines, max 3000 chars)
              const errorLines = buildLogs.split('\n').slice(-60).join('\n').slice(-3000)
              
              // Only attempt auto-fix if we have actual error content
              if (errorLines.length > 50) {
                try {
                  // Read the files that were just written (for context)
                  const failedFiles = validFiles.slice(0, 3).map((f: any) => 
                    `--- ${f.path} ---\n${typeof f.content === 'string' ? f.content.slice(0, 2000) : ''}`
                  ).join('\n\n')

                  const fixPrompt = `You are a Next.js build error fixer. The Vercel deployment failed with these build errors:

BUILD ERRORS:
${errorLines}

FILES THAT CAUSED THE ERROR:
${failedFiles}

Fix ALL build errors. Output valid JSON only — no markdown, no code fences.
Format: {"files":[{"path":"relative/path.tsx","content":"full fixed file content","action":"modify"}],"summary":"Fixed build errors","summaryEn":"Fixed build errors"}

RULES:
- Fix ONLY the build errors — don't change functionality
- Output the COMPLETE file content for each modified file
- TypeScript strict. Tailwind only.
- Common fixes: missing imports, type errors, incorrect module syntax, missing 'use client' directive`

                  const fixResult = await nimChat({
                    model: MODELS.FIX_ROUTER,
                    messages: [
                      { role: 'system', content: fixPrompt },
                      { role: 'user', content: 'Fix the build errors shown above.' },
                    ],
                    maxTokensOverride: 8192,
                    allowFallback: true,
                  })

                  // Parse the fix
                  let fixJson: any
                  try {
                    const cleaned = fixResult.trim()
                      .replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
                    const brace = cleaned.indexOf('{')
                    const lastBrace = cleaned.lastIndexOf('}')
                    fixJson = JSON.parse(cleaned.slice(brace, lastBrace + 1))
                  } catch { fixJson = null }

                  if (fixJson?.files?.length > 0) {
                    // Write fixed files
                    for (const file of fixJson.files) {
                      if (!file.path || !file.content || typeof file.content !== 'string') continue
                      const fixPath = path.join(buildDir, file.path)
                      try {
                        await fs.mkdir(path.dirname(fixPath), { recursive: true })
                        await fs.writeFile(fixPath, file.content, 'utf-8')
                        send({ type: 'file_change', path: file.path, action: 'modify', additions: 0, deletions: 0 })
                      } catch { /* skip individual file failures */ }
                    }

                    // Re-deploy with fixes
                    send({ type: 'status', event: 'deploying', message: userLang === 'hi' 
                      ? 'फिर से डिप्लॉय कर रहे हैं...' 
                      : 'Re-deploying with fixes...' })

                    const retryResult = await deployToVercel({
                      appId,
                      projectName: app.name.toLowerCase().replace(/\s+/g, '-'),
                      directory: buildDir,
                      vercelProjectId: app.projectId || deployResult.projectId,
                      target: 'preview',
                    })

                    if (retryResult.success) {
                      deployUrl = retryResult.url
                      await addApp({ ...app, url: retryResult.url, projectId: retryResult.projectId })
                    } else {
                      // Even retry failed — keep old URL
                      console.error(`[chat-edit] Auto-fix retry also failed for ${appId}`)
                      send({ type: 'status', event: 'deploy_warning', message: userLang === 'hi' 
                        ? 'बिल्ड ठीक नहीं हो सका — पिछला संस्करण सुरक्षित है' 
                        : 'Build fix failed — previous version is safe.' })
                    }
                  }
                } catch (fixErr) {
                  console.error('[chat-edit] Auto-fix failed:', fixErr)
                  send({ type: 'status', event: 'deploy_warning', message: userLang === 'hi' 
                    ? 'बिल्ड ठीक नहीं हो सका — पिछला संस्करण सुरक्षित है' 
                    : 'Build fix failed — previous version is safe.' })
                }
              } else {
                // No meaningful error logs — just report failure
                send({ type: 'status', event: 'deploy_warning', message: userLang === 'hi' 
                  ? 'डिप्लॉय विफल — पिछला संस्करण सुरक्षित है' 
                  : 'Deploy failed — previous version is safe.' })
              }
            } else if (deployResult.success) {
              // Build succeeded
              deployUrl = deployResult.url
              await addApp({
                ...app,
                url: deployResult.url,
                projectId: deployResult.projectId,
              })
            }
          } catch (deployErr) {
            console.warn('[chat-edit] Deploy failed (files saved to disk):', deployErr)
            send({ type: 'status', event: 'deploy_warning', message: userLang === 'hi' 
              ? 'फ़ाइलें सहेजी गईं, लेकिन डिप्लॉय नहीं हो सका। अगले अनुरोध पर पुनः प्रयास होगा।' 
              : 'Files saved, but deploy failed. Will retry on next request.' })
          }
        }

        // ═══════════════════════════════════════════════════════════════════
        // STEP 8: Log episode + persist messages (ALL non-fatal)
        // ═══════════════════════════════════════════════════════════════════

        // Episode log — non-fatal
        try {
          const mayaDir = path.join(buildDir, '.maya')
          await fs.mkdir(mayaDir, { recursive: true })
          
          const episodesPath = path.join(mayaDir, 'episodes.json')
          let episodes: any[] = []
          try {
            const raw = await fs.readFile(episodesPath, 'utf-8')
            episodes = JSON.parse(raw)
          } catch { /* */ }

          episodes.push({
            cycleId: `chat-edit-${Date.now()}`,
            date: new Date().toISOString(),
            source: 'chat-edit',
            observed: [userMessage],
            merged: 1,
            gateFailed: [],
            summary: parsed.summaryEn || 'Chat edit applied',
            summaryHi: parsed.summary || 'चैट से बदलाव किया',
            filesModified: safeFiles.map(f => f.path),
            thinking: thinking || undefined,
            diffs: { total: safeFiles.length, additions: totalAdditions, deletions: totalDeletions },
            isPartialRecovery,
          })

          await fs.writeFile(episodesPath, JSON.stringify(episodes, null, 2), 'utf-8')
        } catch (e) {
          console.warn('[chat-edit] Episode log failed:', e)
        }

        // Invalidate overlapping pending improvements — non-fatal
        try {
          const pendingPath = path.join(buildDir, '.maya', 'pending-improvements.json')
          const raw = await fs.readFile(pendingPath, 'utf-8')
          const pending = JSON.parse(raw)
          
          if (Array.isArray(pending) && pending.length > 0) {
            const changeSummary = (parsed.summaryEn || '').toLowerCase()
            const userMsg = userMessage.toLowerCase()
            const modifiedFiles = safeFiles.map(f => f.path.toLowerCase())
            
            const remaining = pending.filter((imp: any) => {
              const impTitle = (imp.title || '').toLowerCase()
              const titleWords = impTitle.split(/\s+/).filter((w: string) => w.length > 3)
              const overlapCount = titleWords.filter((w: string) => 
                changeSummary.includes(w) || userMsg.includes(w)
              ).length
              const overlapRatio = titleWords.length > 0 ? overlapCount / titleWords.length : 0
              const impFiles = (imp.filesModified || []).map((f: string) => f.toLowerCase())
              const fileOverlap = impFiles.some((f: string) => modifiedFiles.some(mf => mf.includes(f) || f.includes(mf)))
              return !(overlapRatio > 0.4 || (fileOverlap && overlapRatio > 0.2))
            })
            
            await fs.writeFile(pendingPath, JSON.stringify(remaining, null, 2), 'utf-8')
          }
        } catch { /* no pending */ }

        // Persist messages — non-fatal
        try {
          const { updateAppMessages } = await import('@/lib/store')
          const allMessages = [
            ...existingMessages,
            { role: 'user' as const, content: userMessage, timestamp: Date.now() - 1000 },
            { 
              role: 'assistant' as const, 
              content: (parsed.summary || parsed.summaryEn || getStatusLine('done', userLang)).slice(0, 2000),
              timestamp: Date.now() 
            },
          ]
          const toSave = allMessages.slice(-20).map(m => ({
            role: m.role,
            content: m.content.slice(0, 2000),
            timestamp: m.timestamp,
          }))
          await updateAppMessages(appId, toSave)
        } catch (e) {
          console.warn('[chat-edit] Message persistence failed:', e)
        }

        // Update semantic memory — non-fatal
        try {
          const { readSemantic, writeSemantic } = await import('@/lib/memory/autoDream')
          const facts = await readSemantic(buildDir)
          facts.push({
            id: `user-edit-${Date.now()}`,
            fact: `User changed: ${parsed.summaryEn || userMessage}. Files: ${safeFiles.map(f => f.path).join(', ')}`,
            confidence: 0.9,
            sourceEpisodes: [`chat-edit-${Date.now()}`],
            lastConfirmed: new Date().toISOString(),
          })
          if (facts.length > 20) {
            facts.sort((a: any, b: any) => b.confidence - a.confidence)
            facts.splice(20)
          }
          await writeSemantic(buildDir, facts)
        } catch { /* memory update failed — non-fatal */ }

        // ═══════════════════════════════════════════════════════════════════
        // DONE — Send final event
        // ═══════════════════════════════════════════════════════════════════

        send({
          type: 'done',
          url: deployUrl,
          summary: parsed.summary,
          summaryEn: parsed.summaryEn,
          filesModified: safeFiles.map(f => f.path),
          isPartialRecovery,
          changes: {
            total: safeFiles.length,
            additions: totalAdditions,
            deletions: totalDeletions,
            diffs,
          },
        })

        controller.close()
      } catch (e: unknown) {
        const error = e instanceof Error ? e.message : String(e)
        console.error('[api/chat-edit]', error)
        try {
          const errorData = `data: ${JSON.stringify({ type: 'error', message: error })}\n\n`
          controller.enqueue(encoder.encode(errorData))
        } catch { /* */ }
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  })
}
