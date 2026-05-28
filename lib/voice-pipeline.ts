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
  const file = new File([audioBlob], 'voice.webm', { type: 'audio/webm' })

  for (let i = 0; i < GROQ_KEYS.length; i++) {
    try {
      const groq = new Groq({ apiKey: getGroqKey() })
      const result = await groq.audio.transcriptions.create({
        file,
        model: 'whisper-large-v3-turbo',
        language: 'hi',
        prompt: 'Small business app requirements. Hindi business vocabulary.',
      })
      return result.text
    } catch (e: unknown) {
      const status = (e as { status?: number }).status
      if (status === 429 && i < GROQ_KEYS.length - 1) {
        console.warn('[groq] 429 rate limit, rotating key')
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
  onProgress?: (step: string) => void,
  useFallback = false
): Promise<string> {
  onProgress?.('spec_ready')

  // Load business-specific prompt template
  const tpl = getPromptTemplate(spec.category)

  // Load GitHub skills for builder context
  const skills = await getSkillsForContext('builder').catch(() => '')

  const systemPrompt = `[CAVEMAN] Expert Next.js 15 App Router developer. Generate a COMPLETE production app in ONE file payload.

DESIGN TOKENS (LOCKED):
accent: #E8601A. bg:#EFEFEF surface:#ffffff surface2:#f4f4f5 border:#e4e4e7
text:#09090b text2:#3f3f46 text3:#71717a
Fonts: Hind(Hindi) Noto Sans Devanagari(body) JetBrains Mono(numbers)
radius: rounded-xl. LIGHT ONLY. Mobile-first 390x844.

QUALITY BAR: "Would a funded startup ship this?" If no -> more detail.

ALL TEXT IN HINDI. Numbers in Arabic numerals. ₹ for currency.
Bottom nav: 4 tabs, Hindi labels, 64px height.
Fixed header: 56px, shop name.
Min tap target: 44x44px.
Empty states: Hindi message + CTA.
Loading: skeleton shimmer (CSS animation).

OUTPUT FORMAT: Valid JSON object, no markdown, no code fences.
{"files":[{"path":"app/page.tsx","content":"..."},{"path":"app/layout.tsx","content":"..."}]}

MANDATORY FILES:
- app/layout.tsx (fonts, nav, light bg, CSS vars in globals.css or style tag)
- app/page.tsx (dashboard)
- app/globals.css (design tokens)
- app/stock/page.tsx (if inventory app)
- app/orders/page.tsx (if orders exist)

Each page MUST be COMPLETE inline components — no imports from nonexistent files.
Use Tailwind classes only. TypeScript strict.

---
${tpl.builderContext}

Suggested pages: ${tpl.suggestedPages.join(', ')}
Data fields: ${JSON.stringify(tpl.dataFieldHints)}
${skills}`

  onProgress?.('building_code')

  const result = await nimChat({
    model: useFallback ? FALLBACK_MODEL : MODELS.BUILDER,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Build app for: ${JSON.stringify(spec)}` }
    ],
    maxTokensOverride: 16384,
  })

  onProgress?.('code_complete')
  return result
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
      
      // Wrap buildApp in a timeout (120s for DeepSeek, 150s for GLM)
      let raw = await Promise.race([
        buildApp(spec, onProgress, useFallback),
        new Promise<string>((_, reject) => 
          setTimeout(() => reject(new Error('NIM_BUILD_TIMEOUT')), useFallback ? 150_000 : 120_000)
        )
      ])

      // Strip markdown code fences if model wrapped it
      raw = stripCodeFences(raw)

      // Validate JSON
      const parsed = JSON.parse(raw)
      if (parsed.files && Array.isArray(parsed.files) && parsed.files.length > 0) {
        onProgress?.('validated')
        return raw
      }
      lastError = 'Output must be JSON with "files" array containing {path, content} objects'
      console.warn(`[build] Attempt ${attempt + 1}: invalid structure`)
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
  })
}
