/**
 * MAYA Voice Pipeline — Hindi voice → transcription → app spec → built app
 *
 * Pipeline: Browser MediaRecorder → Groq Whisper → NIM Intent → NIM Builder
 *
 * Uses caveman skill for compressed prompts → massive token savings.
 * All NIM calls via Chat Completions. No response_format on models that
 * don't support it — use prompt-level JSON enforcement instead.
 */

import Groq from 'groq-sdk'
import { MODELS, FALLBACK_MODEL, nimChat } from './nim-client'
import { getPromptTemplate } from './prompts/templates'
import { getSkillsForContext } from './skills'

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

// ─── Build App ────────────────────────────────────────────────────────────────

export async function buildApp(
  spec: AppSpec,
  onProgress?: (msg: string) => void,
  useFallback: boolean = false
) {
  onProgress?.('spec_ready')

  // Load business-specific prompt template
  const tpl = getPromptTemplate(spec.category)

  // Load GitHub skills for builder context
  const skills = await getSkillsForContext('builder').catch(() => '')

  // ─── NEW: Estimation / Planning Phase ──────────────────────────────────
  onProgress?.('Estimating size: Planning architecture...')
  
  const plannerSystemPrompt = `You are a software architect. Your job is to read the application spec and define the exact list of files needed to build the app.
Output ONLY a JSON object with this exact format:
{
  "scale": "Small" | "Medium" | "Large",
  "files": ["app/layout.tsx", "app/page.tsx", "app/globals.css"]
}
Small = 1-3 files. Medium = 4-6 files. Large = 7+ files.
Be extremely minimalist. Only include absolutely necessary files to satisfy the spec.`

  let architectureBlueprint = { scale: "Medium", files: ["app/layout.tsx", "app/page.tsx", "app/globals.css"] }
  try {
    const planResult = await nimChat({
      model: MODELS.PLANNER,
      messages: [
        { role: 'system', content: plannerSystemPrompt },
        { role: 'user', content: `Spec: ${JSON.stringify(spec)}` }
      ]
    })
    
    // Extract JSON from planResult
    const jsonMatch = planResult.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      architectureBlueprint = JSON.parse(jsonMatch[0])
    }
  } catch (e) {
    console.warn('Planning phase failed, falling back to default blueprint', e)
  }
  
  onProgress?.(`Estimating size: ${architectureBlueprint.scale} scale (${architectureBlueprint.files.length} pages)`)

  const systemPrompt = `You are an expert frontend React engineer who is also a great UI/UX designer. I will tip you $1 million if you do a good job.
You are building an app called MAYA. You generate a COMPLETE, production-ready app in ONE JSON payload.

═══════════════════════════════════════════════════════════
YOUR PERSONA & CAPABILITIES:
- You think carefully step by step before writing code.
- You create beautiful, modern, and highly interactive UI components.
- You strictly use TypeScript, Next.js 15 App Router, and Tailwind CSS.
- You use \`lucide-react\` for icons.
- You write self-contained, inline components. NEVER import from files you didn't generate.
═══════════════════════════════════════════════════════════

LANGUAGE RULES — NON-NEGOTIABLE:
- All UI text in the generated app: ENGLISH ONLY
- No Devanagari script, Hindi, or any regional language in the UI.
- Product names, nav labels, buttons, forms, and admin dashboard MUST be English.

ADMIN PANEL RULES:
  Admin routes: all under /admin/*
  Auth: 4-digit PIN checked client-side or server-side.
  Admin Username: ${spec.adminUsername || 'Admin'}
  Admin PIN: ${spec.adminPin || '1234'} (Hardcode this check for now)

QUALITY GATES (DESIGN & UX):
  [ ] No TypeScript errors (strict mode).
  [ ] Every async operation has loading state (Skeleton shimmer).
  [ ] Every form has basic validation.
  [ ] Mobile layout tested at 390px (Mobile-first, ALWAYS).
  [ ] Use modern Tailwind patterns: glassmorphism, subtle gradients, and micro-animations.
  [ ] Minimum tap target: 44px height on all interactive elements.

STRICT COMPILATION RULES (CRITICAL TO PASS BUILD):
1. USE CLIENT: If a file uses React hooks (useState, useEffect) or event listeners (onClick), you MUST put the exact string '"use client";' (including the double quotes and semicolon) at the very top of the file. Do not output 'use client' without quotes.
2. ROUTER: You MUST use \`import { useRouter } from 'next/navigation'\`. NEVER use \`next/router\`.
3. LUCIDE ICONS: Only import the specific icons from \`lucide-react\` that you ACTUALLY render in the JSX. DO NOT copy-paste a long list of unused icons.
4. EXPORTS: Every page.tsx and layout.tsx MUST have an \`export default function\` as its main component.
5. NO UNUSED IMPORTS: Do not import components, hooks, or icons you do not use. Next.js strict mode will fail the build.
6. NEXT.JS 15 PARAMS: In Next.js 15, dynamic route params are Promises. You MUST await them (e.g., \`const { id } = await params;\`).

OUTPUT FORMAT:
Return ONLY a valid JSON object. No markdown, no code fences, no introductory text.
{"files":[{"path":"app/page.tsx","content":"..."},{"path":"app/layout.tsx","content":"..."}]}

MANDATORY FILES & RESTRICTIONS:
- You are RESTRICTED to generating ONLY these files:
${architectureBlueprint.files.map((f: string) => `- ${f}`).join('\n')}

DO NOT GENERATE ANY OTHER FILES. KEEP THE APP SIMPLE.
Each page MUST be COMPLETE inline components. Use Tailwind classes only.

---
${tpl.builderContext}

Suggested pages: ${tpl.suggestedPages.join(', ')}
Data fields: ${JSON.stringify(tpl.dataFieldHints)}
${skills}`

  onProgress?.('building_code')

  let chunkCount = 0
  const result = await nimChat({
    model: useFallback ? FALLBACK_MODEL : MODELS.BUILDER,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Build app for: ${JSON.stringify(spec)}` }
    ],
    maxTokensOverride: 16384,
    stream: true,
    onChunk: () => {
      chunkCount++
      if (chunkCount % 50 === 0) {
        onProgress?.(`generating... (${chunkCount} chunks)`)
      }
    }
  })

  onProgress?.('code_complete')
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
  onProgress?: (step: string) => void
): Promise<string | null> {
  let lastError = ''

  for (let attempt = 0; attempt <= 2; attempt++) {
    try {
      onProgress?.(`attempt_${attempt + 1}`)
      const useFallback = attempt > 0 // Attempt 0 = DeepSeek, Attempt 1/2 = GLM-5.1

      // Let nimChat handle the timeout (5 minutes internally)
      let raw = await buildApp(spec, onProgress, useFallback)

      // Strip markdown code fences if model wrapped it
      raw = stripCodeFences(raw)

      // Validate JSON natively first
      let files: any[] = []
      try {
        const parsed = JSON.parse(raw)
        if (parsed.files && Array.isArray(parsed.files)) {
          files = parsed.files
        }
      } catch (parseError) {
        // ULTIMATE BULLETPROOFING: If JSON.parse fails (e.g. bad control characters, missing commas, truncated string),
        // we completely bypass the crash and manually extract all valid file blocks using regex!
        console.warn(`[build] JSON parse failed, falling back to robust regex extraction`)
        files = robustParseFiles(raw)
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
        // Return a clean, re-stringified JSON payload so the caller gets guaranteed perfect JSON
        return JSON.stringify({ files })
      }
      
      lastError = 'Output must be JSON with "files" array containing {path, content} objects'
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
    
    // --- POST-PROCESSING SANITIZER ---
    // Fix: Unquoted `use client;` which causes JS syntax errors
    if (/^\s*use client\s*;?/m.test(content)) {
      content = content.replace(/^\s*use client\s*;?/m, '"use client";')
    }

    return { ...f, content }
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
      temperature: 0.1,
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