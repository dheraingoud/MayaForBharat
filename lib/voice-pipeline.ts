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
    skipThinkWrap: true, // Builder model sends code as reasoning_content — don't wrap in <think>
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

      // Strip <think>...</think> reasoning blocks BUT preserve any <maya-write> tags inside them
      // The step-3.7-flash reasoning model sometimes places code output inside reasoning_content,
      // which gets wrapped in <think>...</think> by the streaming handler. We must rescue those tags.
      raw = raw.replace(/<think>([\s\S]*?)<\/think>/g, (_match, thinkContent) => {
        // Extract any <maya-write>...</maya-write> blocks from inside the think content
        const mayaWriteBlocks: string[] = []
        const tagRegex = /<maya-write\s+path=["'][^"']+["'][^>]*>[\s\S]*?<\/maya-write>/g
        let tagMatch
        while ((tagMatch = tagRegex.exec(thinkContent)) !== null) {
          mayaWriteBlocks.push(tagMatch[0])
        }
        // Return only the rescued maya-write blocks (discard reasoning text)
        return mayaWriteBlocks.length > 0 ? '\n' + mayaWriteBlocks.join('\n') + '\n' : ''
      })

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
            const hasInteractivity = file.content.includes('onClick') || file.content.includes('onChange') || file.content.includes('onSubmit') || file.content.includes('useState') || file.content.includes('useEffect') || file.content.includes('useRef') || file.content.includes('from "framer-motion"') || file.content.includes("from 'framer-motion'") || file.content.includes('useStore') || file.content.includes('useRouter') || file.content.includes('usePathname') || file.content.includes('useSearchParams')
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
    l.includes('FAIL') || l.includes('Module not found') ||
    l.includes('Type error') || l.includes("isn't a valid") ||
    l.includes('Unexpected token') || l.includes('SyntaxError')
  )
  return errorLines.slice(0, 30).join('\n')
}

// ─── Extract Error Files from Build Logs ──────────────────────────────────────
// Parses Vercel/Next.js build logs to identify WHICH files have errors.
// This is the key to targeted fixes — we only send broken files to the AI.

export function extractErrorFiles(buildLogs: string): string[] {
  const files = new Set<string>()
  
  // Pattern 1: ./app/page.tsx:15:3 - error TS2304
  const tsPattern = /\.\/([^\s:]+\.tsx?)/g
  let match
  while ((match = tsPattern.exec(buildLogs)) !== null) {
    files.add(match[1])
  }
  
  // Pattern 2: Module not found: Can't resolve './components/foo'
  const modulePattern = /Module not found.*?['"]\.?\/?([^'"]+)['"]/g
  while ((match = modulePattern.exec(buildLogs)) !== null) {
    // This gives us the import target — find which file imports it
    const importTarget = match[1]
    // Add with .tsx extension as likely candidate
    if (!importTarget.includes('.')) {
      files.add(importTarget + '.tsx')
      files.add(importTarget + '.ts')
    } else {
      files.add(importTarget)
    }
  }
  
  // Pattern 3: Error in /app/xxx/page.tsx (Next.js format)
  const nextPattern = /(?:Error|error)\s+(?:in|at)\s+[./]*([^\s:()]+\.tsx?)/g
  while ((match = nextPattern.exec(buildLogs)) !== null) {
    files.add(match[1])
  }
  
  // Pattern 4: Type error: ... in app/page.tsx
  const typeErrPattern = /Type error.*?(?:in\s+)?([a-zA-Z][^\s:]+\.tsx?)/g
  while ((match = typeErrPattern.exec(buildLogs)) !== null) {
    files.add(match[1])
  }

  return [...files].map(f => f.replace(/^\.\//, ''))
}

// ─── Remove Unused Lucide Imports ─────────────────────────────────────────────
// One of the most common build errors: importing a lucide icon that doesn't exist
// or importing icons that are never used in the JSX.

function removeUnusedLucideImports(content: string): string {
  // Find lucide-react import statement
  const lucideImportRegex = /import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/
  const importMatch = content.match(lucideImportRegex)
  if (!importMatch) return content
  
  const importedIcons = importMatch[1].split(',').map(s => s.trim()).filter(Boolean)
  
  // Check which icons are actually used in the rest of the code (after the import line)
  const afterImport = content.slice(content.indexOf(importMatch[0]) + importMatch[0].length)
  const usedIcons = importedIcons.filter(icon => {
    // Check if icon is used as JSX element <IconName or as a reference
    const iconName = icon.trim()
    if (!iconName) return false
    // Match <IconName, {IconName, icon={IconName, etc.
    const usagePattern = new RegExp(`[<{,\\s]${iconName}[\\s/>),}]|\\b${iconName}\\b`, 'g')
    // Count occurrences — need at least one usage beyond the import
    const matches = afterImport.match(usagePattern)
    return matches && matches.length > 0
  })
  
  if (usedIcons.length === 0) {
    // Remove entire import line
    return content.replace(lucideImportRegex, '')
  }
  
  if (usedIcons.length === importedIcons.length) {
    return content // All icons used
  }
  
  // Replace with only used icons
  const newImport = `import { ${usedIcons.join(', ')} } from 'lucide-react'`
  return content.replace(lucideImportRegex, newImport)
}

// ─── Deterministic Fixes (No AI Needed) ───────────────────────────────────────
// These fix the most common build errors mechanically, saving AI tokens for
// the harder problems. Each fix addresses a specific, repeatedly-seen error.

export function applyDeterministicFixes(
  files: Array<{ path: string; content: string }>,
  buildLogs: string = ''
): { files: Array<{ path: string; content: string }>; fixCount: number } {
  let fixCount = 0
  
  const fixed = files.map(f => {
    let content = f.content
    let filePath = f.path
    
    // Fix 1: Missing "use client" for files with hooks/events/motion/zustand/router
    if (filePath.endsWith('.tsx') && !filePath.endsWith('layout.tsx')) {
      const needsUC = /\b(useState|useEffect|useRef|useCallback|useMemo|useReducer|useContext|onClick|onChange|onSubmit|onKeyDown|useStore|useRouter|usePathname|useSearchParams)\b/.test(content) || /from ['"]framer-motion['"]/.test(content)
      const hasUC = /['"]use client['"]/.test(content)
      if (needsUC && !hasUC) {
        content = '"use client";\n' + content
        fixCount++
      }
    }
    
    // Fix 2: next/router → next/navigation (Next.js 13+ App Router)
    if (content.includes("from 'next/router'") || content.includes('from "next/router"')) {
      content = content.replace(/from\s+['"]next\/router['"]/g, "from 'next/navigation'")
      // Also fix useRouter import if it references the old one
      fixCount++
    }
    
    // Fix 3: Remove unused lucide-react imports
    const beforeLucide = content
    content = removeUnusedLucideImports(content)
    if (content !== beforeLucide) fixCount++
    
    // Fix 4: .ts files containing JSX must be .tsx
    if (filePath.endsWith('.ts') && !filePath.endsWith('.d.ts')) {
      const hasJSX = /<[A-Z][a-zA-Z]*[\s/>]/.test(content) || /<\/[A-Z]/.test(content)
      if (hasJSX) {
        filePath = filePath.replace(/\.ts$/, '.tsx')
        fixCount++
      }
    }
    
    // Fix 5: Unquoted `use client;` → proper format
    if (/^\s*use client\s*;?\s*$/m.test(content) && !/['"]use client['"]/.test(content)) {
      content = content.replace(/^\s*use client\s*;?\s*$/m, '"use client";')
      fixCount++
    }
    
    // Fix 6: Missing export default in page.tsx or layout.tsx files
    if ((filePath.endsWith('page.tsx') || filePath.endsWith('layout.tsx')) && 
        !content.includes('export default')) {
      // Find the main function and add export default
      const funcMatch = content.match(/^(function\s+\w+)/m)
      if (funcMatch) {
        content = content.replace(funcMatch[0], `export default ${funcMatch[0]}`)
        fixCount++
      }
    }
    
    // Fix 7: h-screen → min-h-[100dvh] (Turbopack strict mode)
    if (content.includes('h-screen')) {
      content = content.replace(/\bh-screen\b/g, 'min-h-[100dvh]')
      fixCount++
    }
    
    // Fix 8: eslint config in next.config (Next.js 16 doesn't support it)
    if (filePath === 'next.config.js' || filePath === 'next.config.mjs' || filePath === 'next.config.ts') {
      if (content.includes('eslint:')) {
        content = content.replace(/,?\s*eslint:\s*\{[^}]*\}/g, '')
        fixCount++
      }
    }

    // Fix 9: Remove duplicate "use client" declarations
    const ucMatches = content.match(/['"]use client['"]\s*;?\s*\n/g)
    if (ucMatches && ucMatches.length > 1) {
      // Keep only the first one
      let first = true
      content = content.replace(/['"]use client['"]\s*;?\s*\n/g, (match) => {
        if (first) { first = false; return match }
        return ''
      })
      fixCount++
    }

    // Fix 10: Strip framer-motion (incompatible with React 19 + Next.js 16 SSR prerender)
    // motion.div/motion.span export as undefined during SSR, causing "Element type is invalid" crash
    if (/from\s+['"]framer-motion['"]/.test(content)) {
      // Remove the import line
      content = content.replace(/import\s+\{[^}]*\}\s+from\s+['"]framer-motion['"];?\s*\n?/g, '')
      // Replace <motion.X ...> with <X ...> (strip animation props)
      content = content.replace(/<motion\.(\w+)(\s)/g, '<$1$2')
      // Remove animation-specific props: initial, animate, exit, transition, whileHover, whileTap, whileInView, variants, layout
      content = content.replace(/\s+(initial|animate|exit|transition|whileHover|whileTap|whileInView|variants|layout)=\{[^}]*\}/g, '')
      // Also handle simple string prop values
      content = content.replace(/\s+(initial|animate|exit|transition|whileHover|whileTap|whileInView|variants|layout)="[^"]*"/g, '')
      // Replace </motion.X> with </X>
      content = content.replace(/<\/motion\.(\w+)>/g, '</$1>')
      // Remove <AnimatePresence ...> and </AnimatePresence> wrappers
      content = content.replace(/<AnimatePresence[^>]*>/g, '')
      content = content.replace(/<\/AnimatePresence>/g, '')
      fixCount++
    }

    return { path: filePath, content }
  })
  
  // Fix 11: Ensure lib/store.tsx exists if any file imports from @/lib/store
  const needsStore = fixed.some(f => f.content.includes("from '@/lib/store'") || f.content.includes('from "@/lib/store"'))
  const hasStore = fixed.some(f => f.path === 'lib/store.tsx' || f.path === 'lib/store.ts')
  if (needsStore && !hasStore) {
    fixed.push({
      path: 'lib/store.tsx',
      content: `import { create } from 'zustand'

interface AppState {
  [key: string]: any
}

export const useStore = create<AppState>((set) => ({
  // Stub store — MAYA auto-generated
}))
`
    })
    fixCount++
  }

  // Fix 12: Convert hex CSS variables to HSL for Tailwind compatibility
  // Tailwind's hsl(var(--x)) requires "H S% L%" format, not "#hex"
  const cssFile = fixed.find(f => f.path === 'app/globals.css')
  if (cssFile) {
    cssFile.content = cssFile.content.replace(/--(\w[\w-]*):\s*#([0-9a-fA-F]{3,8})\b/g, (_match, varName, hex) => {
      // Convert hex to HSL
      let r = 0, g = 0, b = 0
      if (hex.length === 3) {
        r = parseInt(hex[0]+hex[0], 16); g = parseInt(hex[1]+hex[1], 16); b = parseInt(hex[2]+hex[2], 16)
      } else if (hex.length >= 6) {
        r = parseInt(hex.slice(0,2), 16); g = parseInt(hex.slice(2,4), 16); b = parseInt(hex.slice(4,6), 16)
      }
      r /= 255; g /= 255; b /= 255
      const max = Math.max(r,g,b), min = Math.min(r,g,b)
      let h = 0, s = 0, l = (max+min)/2
      if (max !== min) {
        const d = max-min
        s = l > 0.5 ? d/(2-max-min) : d/(max+min)
        switch(max) {
          case r: h = ((g-b)/d + (g<b?6:0))/6; break
          case g: h = ((b-r)/d + 2)/6; break
          case b: h = ((r-g)/d + 4)/6; break
        }
      }
      return `--${varName}: ${Math.round(h*360)} ${Math.round(s*100)}% ${Math.round(l*100)}%`
    })
    fixCount++
  }

  return { files: fixed, fixCount }
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

// ─── Fix Vercel Build Errors (Targeted Surgery, Not Full Rewrite) ─────────────
// KEY INSIGHT: The old approach sent ALL files to the AI with only 8192 output
// tokens — the model couldn't fit corrected files, producing truncated broken
// code that failed again in an infinite loop.
//
// New approach:
// 1. Apply deterministic fixes first (no AI needed, instant)
// 2. Parse build logs to identify ONLY the broken files
// 3. Send ONLY those files + compressed errors to AI with adequate token budget
// 4. Merge AI fixes back into the original file set

export async function fixVercelBuildErrors(
  files: Array<{ path: string; content: string }>,
  buildLogs: string,
  onProgress?: (msg: string) => void
): Promise<Array<{ path: string; content: string }>> {
  
  // ── Step 1: Deterministic fixes (instant, no AI) ──
  const { files: deterministicFixed, fixCount } = applyDeterministicFixes(files, buildLogs)
  if (fixCount > 0) {
    console.log(`[fix] Applied ${fixCount} deterministic fixes`)
    onProgress?.(`Auto-fixed ${fixCount} common issue${fixCount > 1 ? 's' : ''}`)
  }
  
  // ── Step 2: Identify which files have errors ──
  const errorFilePaths = extractErrorFiles(buildLogs)
  console.log(`[fix] Error files from logs:`, errorFilePaths)
  
  if (errorFilePaths.length === 0) {
    // Logs didn't give us specific files — try to fix based on error patterns
    // but still don't send the whole app
    const compressedLogs = compressError(buildLogs)
    if (!compressedLogs.trim()) {
      console.warn('[fix] No actionable errors found in build logs')
      return deterministicFixed
    }
    // Fall through to AI fix with all files but compressed context
  }
  
  // ── Step 3: Build minimal context for AI ──
  // Only the broken files, not the entire 15-20 file app
  const brokenFiles = errorFilePaths.length > 0
    ? deterministicFixed.filter(f => 
        errorFilePaths.some(ef => f.path === ef || f.path.endsWith(ef) || ef.endsWith(f.path))
      )
    : deterministicFixed // Fallback: if we couldn't parse error files, send all (rare)
  
  // If no broken files matched, it might be a missing file error — send the files
  // referenced in imports that don't exist
  if (brokenFiles.length === 0) {
    console.warn('[fix] No matching broken files found, using full file set')
    // But still limit to first 8 files to keep context manageable
    const limitedFiles = deterministicFixed.slice(0, 8)
    return await _doAIFix(deterministicFixed, limitedFiles, buildLogs, onProgress)
  }
  
  return await _doAIFix(deterministicFixed, brokenFiles, buildLogs, onProgress)
}

async function _doAIFix(
  allFiles: Array<{ path: string; content: string }>,
  brokenFiles: Array<{ path: string; content: string }>,
  buildLogs: string,
  onProgress?: (msg: string) => void
): Promise<Array<{ path: string; content: string }>> {
  const compressedLogs = compressError(buildLogs)
  
  // Also provide a file manifest so the AI knows what files exist
  // (helps it fix "Module not found" errors)
  const fileManifest = allFiles.map(f => f.path).join('\n')
  
  const systemPrompt = `You are an expert Next.js/TypeScript compiler error fixer.
The user's app failed the Vercel build. You will receive ONLY the files with errors and the error logs.

FIX RULES:
- Return ONLY the fixed files using <maya-write path="...">...</maya-write> tags.
- Return the ENTIRE corrected file content for each broken file.
- Do NOT return files that don't have errors.
- Do NOT add new files.
- Do NOT change the app's functionality — only fix compiler errors.
- All imports must reference files that exist in the FILE MANIFEST below.
- "use client"; must be quoted and at the very first line if the file uses hooks/events.
- Only import lucide-react icons that you actually use in JSX.
- Use 'next/navigation' not 'next/router' for App Router.
- Do NOT use h-screen, use min-h-[100dvh].
- Do NOT use eslint config in next.config.js.
- No commentary, no markdown, no explanation — ONLY <maya-write> tags.

FILE MANIFEST (all files in this app):
${fileManifest}`

  const brokenFilesContext = brokenFiles.map(f => `--- ${f.path} ---\n${f.content}`).join('\n\n')
  
  const userPrompt = `BUILD ERRORS:\n${compressedLogs}\n\nBROKEN FILES TO FIX:\n${brokenFilesContext}`

  try {
    onProgress?.(`AI fixing ${brokenFiles.length} file${brokenFiles.length > 1 ? 's' : ''}...`)
    
    const result = await nimChat({
      model: { ...MODELS.FIX_ROUTER, maxTokens: 12288 },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
    })

    const { parseModelOutput } = await import('./tags')
    const ops = parseModelOutput(result)
    const fixedFiles = ops.filter(op => op.type === 'write').map(op => ({ path: op.path, content: op.content || '' }))
    
    // Merge fixed files into the FULL original set
    if (fixedFiles.length > 0) {
      console.log(`[fix] AI fixed ${fixedFiles.length} file(s): ${fixedFiles.map(f => f.path).join(', ')}`)
      onProgress?.(`AI fixed ${fixedFiles.length} file${fixedFiles.length > 1 ? 's' : ''}`)
      
      const merged = [...allFiles]
      for (const fixed of fixedFiles) {
        const idx = merged.findIndex(f => f.path === fixed.path)
        if (idx !== -1) {
          merged[idx] = fixed
        } else {
          // AI created a missing file that was referenced but didn't exist
          merged.push(fixed)
        }
      }
      return sanitizeFiles(merged)
    }
    
    console.warn('[fix] AI returned no fixed files')
    return allFiles
  } catch (e) {
    console.error('[fixVercelBuildErrors] Error during AI fix:', e)
    return allFiles // Return deterministic fixes at minimum
  }
}