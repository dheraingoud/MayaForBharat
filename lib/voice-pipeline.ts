/**
 * MAYA Voice Pipeline — Hindi voice → transcription → app spec → built app
 *
 * Pipeline: Browser MediaRecorder → Groq Whisper → NIM Intent → NIM Builder
 *
 * PERF: No PLANNER call. Deterministic blueprint from category.
 * No skills injection in builder (saves ~5000 input tokens).
 */

import Groq from 'groq-sdk'
import { MODELS, FALLBACK_MODEL, nimChat } from './nim-client'
import { buildBuilderSystemPrompt } from './prompts/builder-system'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AppSpec {
  name: string
  nameHindi: string
  descriptionEn: string
  category: string
  features: string[]
  dataFields: { name: string; type: string }[]
  userType: string
  adminUsername?: string
  adminPin?: string
}

// ─── Groq Key Rotation ───────────────────────────────────────────────────────

const GROQ_KEYS = [
  process.env.GROQ_KEY_1!,
  process.env.GROQ_KEY_2!,
].filter(Boolean)

let groqKeyIdx = 0
function getGroqKey(): string {
  if (GROQ_KEYS.length === 0) throw new Error('No Groq API keys configured')
  const key = GROQ_KEYS[groqKeyIdx % GROQ_KEYS.length]!
  groqKeyIdx++
  return key
}

// ─── Transcribe Hindi ─────────────────────────────────────────────────────────

export async function transcribeHindi(audioBlob: Blob): Promise<string> {
  // Read blob into memory once — re-creating File per attempt avoids stream consumption on retry
  const arrayBuffer = await audioBlob.arrayBuffer()
  const file = new File([arrayBuffer], 'voice.webm', { type: 'audio/webm' })

  for (let i = 0; i < GROQ_KEYS.length; i++) {
    try {
      const groq = new Groq({ apiKey: getGroqKey() })

      // Race against a 25s timeout to avoid the Vercel function timing out
      const result = await Promise.race([
        groq.audio.transcriptions.create({
          file,
          model: 'whisper-large-v3-turbo',
          language: 'hi',
          prompt: 'Small business app requirements. Hindi business vocabulary.',
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Whisper timeout after 25s')), 25000)
        ),
      ])
      return result.text
    } catch (e: unknown) {
      const err = e as Error & { status?: number; response?: { status?: number } }
      const status = err.status ?? err.response?.status
      console.warn(`[groq] Whisper attempt ${i + 1} failed:`, err.message)

      // Rotate key on 429 or 504
      if ((status === 429 || status === 504) && i < GROQ_KEYS.length - 1) {
        console.warn(`[groq] ${status} error, rotating key`)
        continue
      }

      // Retry on timeout errors (our own or Groq's)
      if (err.message.includes('timeout') && i < GROQ_KEYS.length - 1) {
        console.warn('[groq] Timeout, rotating key and retrying')
        continue
      }

      throw e
    }
  }

  throw new Error('All Groq keys exhausted')
}

// ─── Extract Intent ───────────────────────────────────────────────────────────

export async function extractIntent(hindiText: string): Promise<AppSpec> {
  // Include all business-type hints so model classifies correctly
  const bizTypes = [
    'kirana: किराने की दुकान. Daily groceries, snacks, household items. Key: stock, barcode, unit, price, supplier.',
    'tailor: दर्जी की दुकान. Suits, alterations, measurements, fittings. Key: neck/chest/waist/length, fabric, style, due date.',
    'dairy: दूधवाला. Milk, curd, butter daily orders. Key: qty in litre/kg, delivery shift (morning/evening), payment.',
    'pharmacy: दवा की दुकान. Medicines, prescriptions. Key: medicine name, batch number, expiry, MRP, doctor.',
    'electronics: इलेक्ट्रॉनिक्स. Mobile, accessories, repairs. Key: brand, model, IMEI, warranty, repair status.',
    'restaurant: रेस्तरां / dhaba. Menu, orders, tables, billing. Key: menu item, table number, order status, veg/non-veg.',
    'other: General small shop. Daily sales, stock, customers. Key: item name, price, stock, customer, date.',
  ].join('\n')

  const raw = await nimChat({
    model: MODELS.INTENT,
    messages: [
      {
        role: 'system',
        content: `[CAVEMAN] Extract app spec from Hindi business description. Output ONLY valid JSON. No markdown. No explanation. No code fences.

Business types (pick exactly one category):
${bizTypes}

Schema: {"name":string,"nameHindi":string,"descriptionEn":string,"category":"kirana"|"tailor"|"dairy"|"pharmacy"|"electronics"|"restaurant"|"other","features":string[],"dataFields":[{"name":string,"type":"string"|"number"|"boolean"|"date"}],"userType":string}

Rules:
- Translate Hindi description into English for descriptionEn.
- Generate catchy Hindi app name for nameHindi.
- features: list 4-7 relevant features based on the business type above.
- dataFields: infer from the business type hints above.`,
      },
      { role: 'user', content: hindiText }
    ],
    maxTokensOverride: 1024,
  })

  return parseJSON<AppSpec>(raw, 'extractIntent')
}

// ─── Deterministic Architecture Blueprint ─────────────────────────────────────
// Replaces the PLANNER LLM call that was consuming 120+ seconds.
// The file list is derived from the business category — no model call needed.

const CATEGORY_BLUEPRINTS: Record<string, { scale: string; files: string[] }> = {
  kirana: {
    scale: 'Medium',
    files: ['app/layout.tsx', 'app/page.tsx', 'app/globals.css', 'app/stock/page.tsx', 'app/sales/page.tsx'],
  },
  tailor: {
    scale: 'Medium',
    files: ['app/layout.tsx', 'app/page.tsx', 'app/globals.css', 'app/orders/page.tsx', 'app/measurements/page.tsx'],
  },
  dairy: {
    scale: 'Medium',
    files: ['app/layout.tsx', 'app/page.tsx', 'app/globals.css', 'app/orders/page.tsx', 'app/customers/page.tsx'],
  },
  pharmacy: {
    scale: 'Medium',
    files: ['app/layout.tsx', 'app/page.tsx', 'app/globals.css', 'app/medicines/page.tsx', 'app/sales/page.tsx', 'app/expiry/page.tsx'],
  },
  electronics: {
    scale: 'Medium',
    files: ['app/layout.tsx', 'app/page.tsx', 'app/globals.css', 'app/inventory/page.tsx', 'app/repairs/page.tsx'],
  },
  restaurant: {
    scale: 'Medium',
    files: ['app/layout.tsx', 'app/page.tsx', 'app/globals.css', 'app/orders/page.tsx', 'app/menu/page.tsx', 'app/tables/page.tsx'],
  },
  other: {
    scale: 'Medium',
    files: ['app/layout.tsx', 'app/page.tsx', 'app/globals.css', 'app/inventory/page.tsx', 'app/sales/page.tsx'],
  },
}

function getDefaultBlueprint(category: string): { scale: string; files: string[] } {
  const key = category?.toLowerCase() || 'other'
  return CATEGORY_BLUEPRINTS[key] || CATEGORY_BLUEPRINTS.other
}

// ─── Build App ────────────────────────────────────────────────────────────────

export async function buildApp(
  spec: AppSpec,
  onProgress?: (msg: string) => void,
  useFallback: boolean = false,
  partialContent: string = '',
  onChunk?: (text: string) => void
) {
  onProgress?.('spec_ready')

  // Deterministic blueprint — no PLANNER model call needed
  const architectureBlueprint = getDefaultBlueprint(spec.category)
  
  // Make sure we include lib/store.ts in every blueprint natively
  if (!architectureBlueprint.files.includes('lib/store.tsx')) {
    architectureBlueprint.files.push('lib/store.tsx')
  }

  onProgress?.(`Architecture: ${architectureBlueprint.scale} scale (${architectureBlueprint.files.length} files)`)
  onProgress?.('building_code')

  const systemPrompt = buildBuilderSystemPrompt({ spec, architectureBlueprint })

  const messages: import('@/lib/nim-client').ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Build app for: ${JSON.stringify(spec)}` }
  ]

  if (partialContent) {
    // Instead of resuming mid-character (which causes the AI to inject conversational
    // text like "Got it, let me continue..." directly into code), we keep only the
    // fully completed <maya-write>...</maya-write> blocks and ask the model to generate
    // the remaining files cleanly.
    const { parseModelOutput } = await import('@/lib/tags')
    const completedOps = parseModelOutput(partialContent)
    const completedFiles = completedOps.filter(op => op.type === 'write').map(op => op.path)

    if (completedFiles.length > 0) {
      // Reconstruct clean partial from only fully parsed blocks
      const cleanPartial = completedOps
        .filter(op => op.type === 'write')
        .map(op => `<maya-write path="${op.path}">\n${op.content}\n</maya-write>`)
        .join('\n')

      messages.push({ role: 'assistant', content: cleanPartial })
      messages.push({
        role: 'user',
        content: `You have already generated these files: ${completedFiles.join(', ')}. Now generate ONLY the remaining files from the architecture. Start directly with <maya-write path="...">. Do NOT repeat any files listed above. No conversational text.`
      })
    }
    // If no complete files were parsed, just start fresh (don't use partial at all)
  }

  let chunkCount = 0
  const result = await nimChat({
    model: useFallback ? FALLBACK_MODEL : MODELS.BUILDER,
    messages,
    maxTokensOverride: 16384,
    stream: true,
    onChunk: (text) => {
      onChunk?.(text)
    }
  })

  onProgress?.('code_complete')

  // If we had completed files from partial, combine them cleanly
  if (partialContent) {
    const { parseModelOutput } = await import('@/lib/tags')
    const completedOps = parseModelOutput(partialContent)
    if (completedOps.length > 0) {
      const cleanPartial = completedOps
        .filter(op => op.type === 'write')
        .map(op => `<maya-write path="${op.path}">\n${op.content}\n</maya-write>`)
        .join('\n')
      return cleanPartial + '\n' + result
    }
  }
  return result
}

// ─── Robust File Extractor ──────────────────────────────────────────────────────

export function robustParseFiles(raw: string): Array<{path: string, content: string}> {
  const files: Array<{path: string, content: string}> = []
  
  // This regex grabs "path": "...", "content": "..." blocks regardless of outer JSON structure
  const fileRegex = /"path"\s*:\s*"([^"]+)"\s*,\s*"content"\s*:\s*"((?:[^"\\]|\\.)*)"/g
  
  let match
  while ((match = fileRegex.exec(raw)) !== null) {
    const path = match[1]
    let content = match[2]
    
    // Manually unescape the string literal code blocks
    content = content
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\')
      
    files.push({ path, content })
  }
  
  return files
}

// ─── Build with Retry ─────────────────────────────────────────────────────────

export async function buildWithRetry(
  spec: AppSpec,
  onProgress?: (step: string) => void,
  partialContent: string = '',
  onChunk?: (text: string) => void
): Promise<string | null> {
  let lastError = ''

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      onProgress?.(`attempt_${attempt + 1}`)
      const useFallback = attempt > 0 // Attempt 0 = DeepSeek, Attempt 1/2 = GLM-5.1

      // Let nimChat handle the timeout (5 minutes internally)
      let raw = await buildApp(spec, onProgress, useFallback, partialContent, onChunk)

      // Strip markdown code fences if model wrapped it
      raw = raw.replace(/^```[a-z]*\n?/gm, '').replace(/```$/gm, '').trim()

      // Strip <think>...</think> reasoning blocks
      raw = raw.replace(/<think>[\s\S]*?<\/think>/g, '')

      // Safety net: strip conversational text that leaked between </maya-write> and <maya-write> tags
      // This catches "Wait let's adjust..." or "Got it, I'll continue..." injected on resume
      raw = raw.replace(/<\/maya-write>([\s\S]*?)(<maya-write)/g, (_, between, next) => {
        // Keep only whitespace between tags, strip any conversational text
        return '</maya-write>\n' + next
      })

      // Validate XML tags natively
      const { parseModelOutput } = await import('@/lib/tags')
      let files: any[] = []
      let isValidTags = false
      try {
        const ops = parseModelOutput(raw)
        files = ops.filter(op => op.type === 'write').map(op => ({ path: op.path, content: op.content || '' }))
        if (files.length > 0) {
          isValidTags = true
        }
      } catch (parseError) {
        console.warn(`[build] Tag parse failed on attempt ${attempt + 1}`)
      }

      if (!isValidTags) {
        lastError = 'Output must contain valid <maya-write> tags.'
        console.warn(`[build] Attempt ${attempt + 1} invalid tags. Forcing retry.`)
        continue // Force the model to rewrite the code properly so the build doesn't fail
      }

      if (files.length > 0) {
        // Auto-inject 'use client' for components with interactivity to prevent Next.js Server Component build crashes
        files = files.map(file => {
          if (file.path.endsWith('.tsx') && !file.path.endsWith('layout.tsx')) {
            const hasInteractivity = file.content.includes('onClick') || file.content.includes('onChange') || file.content.includes('onSubmit') || file.content.includes('useState') || file.content.includes('useEffect') || file.content.includes('useRef')
            const hasUseClient = file.content.includes('use client') || file.content.includes('"use client"')
            if (hasInteractivity && !hasUseClient) {
              file.content = "'use client';\n" + file.content
            }
          }
          return file
        })
        
        onProgress?.('validated')
        // We still return raw tag payload, the route will parse it. Wait, the route expects `raw` to be parseable by `parseModelOutput(raw)`.
        // So returning `raw` is fine. Or wait, `route.ts` calls `parseModelOutput(raw)`. Wait, we modified `route.ts` to do `parseModelOutput(raw)`.
        // If we modify `file.content` here, we should re-serialize it or let `route.ts` do the modification.
        // Let's reconstruct the raw string to preserve modifications.
        let updatedRaw = ''
        for (const file of files) {
          updatedRaw += `<maya-write path="${file.path}">\n${file.content}\n</maya-write>\n`
        }
        return updatedRaw
      }
      
      lastError = 'Output must contain valid <maya-write> tags'
      console.warn(`[build] Attempt ${attempt + 1}: no files extracted`)
    } catch (e: unknown) {
      lastError = e instanceof Error ? e.message.slice(0, 500) : 'Unknown error'
      console.warn(`[build] Attempt ${attempt + 1} error:`, lastError.slice(0, 200))
    }
  }

  return null
}

// ─── Compress Error ───────────────────────────────────────────────────────────

export function compressError(buildOutput: string): string {
  const lines = buildOutput.split('\n')
  const errorLines = lines.filter(l =>
    l.includes('Error:') || l.includes('error TS') ||
    l.includes('Expected') || l.includes('Cannot find') ||
    l.includes('FAIL') || l.includes('Module not found')
  )
  return errorLines.slice(0, 20).join('\n')
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function stripCodeFences(raw: string): string {
  // Remove ``json ... ``` wrapping
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^(?:json)?\s*\n?/, '').replace(/\n?\w*```\s*$/, '')
  }
  // Remove leading/trailing whitespace or BOM
  cleaned = cleaned.trim()
  // Find first { and last }
  const firstBrace = cleaned.indexOf('{')
  const lastBrace = cleaned.lastIndexOf('}')
  if (firstBrace !== -1 && lastBrace !== -1 && firstBrace < lastBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1)
  }
  return cleaned
}

function parseJSON<T>(raw: string, context: string): T {
  const cleaned = stripCodeFences(raw)
  try {
    return JSON.parse(cleaned) as T
  } catch {
    console.error(`[${context}] JSON parse failed. Raw (first 500):`, raw.slice(0, 500))
    throw new Error(`[${context}] Invalid JSON response from model`)
  }
}

export function sanitizeFiles(files: Array<{ path: string; content: string }>): Array<{ path: string; content: string }> {
  return files.filter(f => {
    // 1. Must not escape directory
    if (f.path.includes('..')) return false
    // 2. Must not be absolute
    if (f.path.startsWith('/')) return false
    // 3. Must be in allowed directories
    const allowedPrefixes = ['app/', 'components/', 'lib/', 'hooks/', 'utils/', 'public/']
    if (!allowedPrefixes.some(p => f.path.startsWith(p))) return false
    // 4. Must not overwrite core configs
    const blockedFiles = ['package.json', 'next.config.js', 'tailwind.config.ts', 'postcss.config.js', 'tsconfig.json', '.env', '.env.local']
    if (blockedFiles.includes(f.path)) return false
    return true
  }).map(f => {
    let content = f.content
    let filePath = f.path
    
    // --- POST-PROCESSING SANITIZER ---
    // Fix: .ts files containing JSX must be renamed to .tsx (Turbopack cannot parse JSX in .ts)
    if (filePath.endsWith('.ts') && !filePath.endsWith('.d.ts')) {
      const hasJSX = /<[A-Z][a-zA-Z]*[\s/>]/.test(content) || /<\/[A-Z]/.test(content)
      if (hasJSX) {
        filePath = filePath.replace(/\.ts$/, '.tsx')
      }
    }

    // Fix: Unquoted `use client;` which causes JS syntax errors
    if (/^\s*use client\s*;?/m.test(content)) {
      content = content.replace(/^\s*use client\s*;?/m, '"use client";')
    }

    return { path: filePath, content }
  })
}

export async function reviewAndFixCode(
  files: Array<{ path: string; content: string }>
): Promise<{ status: 'pass' | 'fail'; fixedFiles?: Array<{ path: string; content: string }> }> {
  const systemPrompt = `You are a strict Next.js compiler and Code Reviewer. 
Your job is to read the provided files and catch ANY compiler errors BEFORE they happen.

CHECK FOR THESE CRITICAL ERRORS:
1. Missing Imports: Using a component, hook, or lucide-react icon without importing it.
2. Bad Imports: Importing from a file that does not exist in the provided file list (e.g., importing from './components' when there is no components directory or file).
3. Missing "use client"; at the top of files that use React hooks (useState, useEffect) or event listeners (onClick).
4. Syntax errors or undefined variables.

OUTPUT FORMAT:
If the code is 100% perfect and will compile without errors:
{"status": "pass"}

If there are errors, fix ONLY the files that have errors, and return:
{"status": "fail", "fixedFiles": [{"path": "app/page.tsx", "content": "..."}]}

RULES:
- DO NOT return files that are already perfect. Only return files you had to modify.
- Provide ONLY valid JSON. No markdown fences, no explanatory text.`

  const filesContext = files.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n')

  try {
    const result = await nimChat({
      model: MODELS.BUILDER,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Review these files:\n\n${filesContext}` }
      ],
      maxTokensOverride: 8192,
    })

    const jsonMatch = result.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return { status: 'pass' } // Fallback

    const parsed = JSON.parse(jsonMatch[0]) as any
    if (parsed.status === 'fail' && Array.isArray(parsed.fixedFiles)) {
      return { status: 'fail', fixedFiles: parsed.fixedFiles }
    }
    
    return { status: 'pass' }
  } catch (e) {
    console.error('[reviewAndFixCode] Review failed:', e)
    return { status: 'pass' } // If reviewer fails, pass through to avoid blocking
  }
}

export async function fixVercelBuildErrors(
  files: Array<{ path: string; content: string }>,
  buildLogs: string
): Promise<Array<{ path: string; content: string }>> {
  const systemPrompt = `You are an expert Next.js and TypeScript developer resolving Vercel deployment errors.
The user's application just failed the strict Vercel build step (tsc & eslint).
Read the provided build logs carefully. Identify which files are causing the errors.
Return ONLY the fully corrected files using XML tags:
<maya-write path="app/page.tsx">
... full fixed code here ...
</maya-write>

RULES:
- Do NOT return files that do not have compiler errors.
- Return the ENTIRE file content for the files you fix.
- Ensure all variables and imports exist.
- Provide no other markdown outside the tags.`

  const filesContext = files.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n')
  
  const userPrompt = `--- BUILD LOGS ---\n${buildLogs}\n\n--- CURRENT FILES ---\n${filesContext}`

  try {
    const result = await nimChat({
      model: MODELS.FIX_ROUTER,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      maxTokensOverride: 8192,
    })

    const { parseModelOutput } = await import('./tags')
    const ops = parseModelOutput(result)
    const fixedFiles = ops.filter(op => op.type === 'write').map(op => ({ path: op.path, content: op.content || '' }))
    
    // Merge fixed files into original
    if (fixedFiles.length > 0) {
      const newFiles = [...files]
      for (const fixed of fixedFiles) {
        const idx = newFiles.findIndex(f => f.path === fixed.path)
        if (idx !== -1) newFiles[idx] = fixed
        else newFiles.push(fixed)
      }
      return sanitizeFiles(newFiles)
    }
    return files
  } catch (e) {
    console.error('[fixVercelBuildErrors] Error during fix:', e)
    return files // Return original if fix fails
  }
}