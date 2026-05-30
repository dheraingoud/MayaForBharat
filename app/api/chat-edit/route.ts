import { NextResponse } from 'next/server'
import { nimChat, MODELS } from '@/lib/nim-client'
import { sanitizeFiles } from '@/lib/voice-pipeline'
import { getApp, addApp } from '@/lib/store'
import { deployToVercel } from '@/lib/deploy'
import { getSkillsForContext } from '@/lib/skills'
import { promises as fs } from 'fs'
import path from 'path'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * POST /api/chat-edit
 * Targeted app edit from the Hindi chat editor.
 * Bypasses full evolution pipeline — directly modifies files and redeploys.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { appId, userMessage } = body

    if (!appId || !userMessage) {
      return NextResponse.json(
        { error: 'Missing appId or userMessage' },
        { status: 400 }
      )
    }

    // Load the app from store
    const app = await getApp(appId)
    if (!app) {
      return NextResponse.json({ error: 'App not found' }, { status: 404 })
    }

    const { getBuildsDir } = await import('@/lib/path')
    const buildDir = getBuildsDir(appId)

    // Read current files from disk
    let currentFiles: { path: string; content: string }[] = []
    try {
      const entries = await fs.readdir(buildDir, { recursive: true, withFileTypes: true })
      for (const entry of entries) {
        if (entry.isFile() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          const fullPath = path.join(entry.parentPath || buildDir, entry.name)
          const relPath = path.relative(buildDir, fullPath).replace(/\\/g, '/')
          // Only include source files, not binaries
          if (/\.(tsx?|jsx?|css|json|md|html)$/.test(relPath)) {
            const content = await fs.readFile(fullPath, 'utf-8')
            currentFiles.push({ path: relPath, content })
          }
        }
      }
    } catch {
      // If files don't exist on disk, use stored files
      currentFiles = app.files || []
    }

    if (currentFiles.length === 0) {
      return NextResponse.json(
        { error: 'No app files found. Build the app first.' },
        { status: 400 }
      )
    }

    // Load skills for builder context
    const skills = await getSkillsForContext('builder').catch(() => '')

    // Create a focused file list (max 10 most relevant files to keep context tight)
    const fileSummary = currentFiles
      .slice(0, 10)
      .map(f => `--- ${f.path} ---\n${f.content.slice(0, 2000)}${f.content.length > 2000 ? '\n... [truncated]' : ''}`)
      .join('\n\n')

    // Ask NIM to generate the targeted edit
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

Your task: Apply ONLY the user's requested change. Do NOT regenerate the whole app.
Output ONLY valid JSON. No markdown. No code fences.

Output format:
{"files":[{"path":"relative/path.tsx","content":"full file content","action":"modify"|"create"}],"summary":"one-line Hindi summary of what changed","summaryEn":"one-line English summary"}

Rules:
- Modify ONLY the files that need changing for the user's request
- Keep ALL existing functionality intact
- Output the COMPLETE file content for modified files (not a diff)
- Max 3 files modified per edit
- TypeScript strict. Tailwind only.
${skills}`,
        },
        {
          role: 'user',
          content: `Current app files:\n${fileSummary}\n\nUser's change request: "${userMessage}"`,
        },
      ],
      maxTokensOverride: 8192,
    })

    // Parse the edit result
    let parsed: {
      files: Array<{ path: string; content: string; action: string }>
      summary: string
      summaryEn: string
    }
    try {
      // Strip code fences
      let cleaned = editResult.trim()
      if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
      }
      const firstBrace = cleaned.indexOf('{')
      const lastBrace = cleaned.lastIndexOf('}')
      if (firstBrace !== -1 && lastBrace !== -1) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1)
      }
      parsed = JSON.parse(cleaned)
    } catch {
      return NextResponse.json(
        { error: 'AI returned invalid edit response. Try rephrasing your request.' },
        { status: 500 }
      )
    }

    if (!parsed.files || !Array.isArray(parsed.files) || parsed.files.length === 0) {
      return NextResponse.json(
        { error: 'AI could not determine what files to change. Try being more specific.' },
        { status: 500 }
      )
    }

    // Write modified files to disk
    const safeFiles = sanitizeFiles(parsed.files)
    if (safeFiles.length === 0) {
      return NextResponse.json(
        { error: 'AI generated invalid or restricted file paths. Change aborted.' },
        { status: 500 }
      )
    }

    for (const file of safeFiles) {
      const filePath = path.join(buildDir, file.path)
      await fs.mkdir(path.dirname(filePath), { recursive: true })
      await fs.writeFile(filePath, file.content, 'utf-8')
    }

    // Redeploy to Vercel
    const deployResult = await deployToVercel({
      appId,
      projectName: app.name.toLowerCase().replace(/\s+/g, '-'),
      directory: buildDir,
      vercelProjectId: app.projectId,
    })

    // Update the store with new URL
    await addApp({
      ...app,
      url: deployResult.url,
      projectId: deployResult.projectId,
    })

    return NextResponse.json({
      success: true,
      filesModified: safeFiles.map(f => f.path),
      summary: parsed.summary,
      summaryEn: parsed.summaryEn,
      url: deployResult.url,
    })
  } catch (e: unknown) {
    const error = e instanceof Error ? e.message : String(e)
    console.error('[api/chat-edit]', error)
    return NextResponse.json({ error }, { status: 500 })
  }
}
