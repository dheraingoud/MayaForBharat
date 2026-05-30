/**
 * MAYA NIM Client — 3-key rotation + model registry + claude-proxy patterns
 *
 * All agents use NIM Chat Completions via https://integrate.api.nvidia.com/v1
 *
 * Patterns ported from claude-proxy (providers/nvidia_nim/request.py):
 * - chat_template_kwargs for reasoning (DeepSeek V4: reasoning_effort, others: enable_thinking)
 * - TPM trimming per model (Kimi max 15 tools, DeepSeek max 25)
 * - Tool parameter aliasing for NIM safety (reserved param names like "type")
 * - Boolean JSON Schema subschema sanitization
 * - Fallback routing: primary → GLM-5.1 on specific failures
 * - Retry-on-timeout with reduced reasoning_budget
 * - Retry-on-400 stripping reasoning_budget/chat_template/reasoning_content
 */

import OpenAI from 'openai'
import type { ChatCompletionCreateParamsNonStreaming } from 'openai/resources/chat/completions'

// ─── 3-Key Rotation ───────────────────────────────────────────────────────────

const NIM_KEYS = [
  process.env.NVIDIA_API_KEY_1!,
  process.env.NVIDIA_API_KEY_2!,
  process.env.NVIDIA_API_KEY_3!,
].filter(Boolean)

let nimKeyIdx = 0

function getNextKey(): string {
  if (NIM_KEYS.length === 0) throw new Error('No NVIDIA API keys configured')
  const key = NIM_KEYS[nimKeyIdx % NIM_KEYS.length]!
  nimKeyIdx++
  return key
}

export function getNimClient(): OpenAI {
  return new OpenAI({
    baseURL: 'https://integrate.api.nvidia.com/v1',
    apiKey: getNextKey(),
    timeout: 300000, // 5 minutes read timeout (matches claude-proxy config)
    maxRetries: 2,
    fetch: (url, init) => {
      // Use proxy-style keepalive to prevent premature connection drops on long inferences
      return fetch(url, {
        ...init,
        keepalive: true,
      })
    }
  })
}

// ─── Model Registry ───────────────────────────────────────────────────────────
// Model routing is enforced here, never by agents

export type ModelConfig = {
  id: string
  maxTokens: number
  /** chat_template_kwargs — controls reasoning/thinking */
  thinking: Record<string, unknown> | null
  temperature?: number
  topP?: number
  /** Max tools allowed by this model (TPM safety) */
  maxTools?: number
}

export const MODELS = {
  /** Step 3.7 Flash — THE code writer. High-IQ model for drafting the architecture blueprint */
  BUILDER: {
    id: 'stepfun-ai/step-3.7-flash',
    maxTokens: 8192,
    thinking: null,
    temperature: 1,
    topP: 1,
    maxTools: 10,
  },

  /** Step 3.7 Flash — Fast, high-IQ model for drafting the architecture blueprint */
  PLANNER: {
    id: 'stepfun-ai/step-3.7-flash',
    maxTokens: 4096,
    thinking: null,
    temperature: 1,
    topP: 1,
    maxTools: 10,
  },

  /** Kimi K2.6 — Proposer. Reasons about what to improve */
  PROPOSER: {
    id: 'moonshotai/kimi-k2.6',
    maxTokens: 4096,
    thinking: { thinking: true },
    temperature: 1,
    topP: 1,
    maxTools: 15,
  },

  /** GLM-5.1 — Memory consolidation (autoDream). Reliable for structured JSON.
   *  High token budget so the model can deeply reason about cross-cycle patterns. */
  AUTO_DREAM: {
    id: 'z-ai/glm-5.1',
    maxTokens: 16384,
    thinking: { enable_thinking: true, clear_thinking: false },
    temperature: 0.7,
    topP: 0.9,
    maxTools: 25,
  },

  /** Llama 4 Maverick 17B — ONLY used for intent extraction from Hindi voice.
   *  Strong Hindi NLP, large context window, reliable structured JSON output. */
  INTENT: {
    id: 'meta/llama-3.3-70b-instruct',
    maxTokens: 4096,
    thinking: null, // Llama 3.3 does not use reasoning kwargs
    temperature: 0.5,
    topP: 0.9,
    maxTools: 20,
  },

  /** Step 3.7 Flash — DOM / structural analysis. Fast, accurate, no vision needed here */
  OBSERVER_DOM: {
    id: 'stepfun-ai/step-3.7-flash',
    maxTokens: 4096,
    thinking: null,
    temperature: 1,
    topP: 0.95,
    maxTools: 25,
  },

  /** Step 3.7 Flash — Multimodal screenshot / vision analysis. Fast vision at low cost */
  OBSERVER_VISUAL: {
    id: 'stepfun-ai/step-3.7-flash',
    maxTokens: 8192,
    thinking: null,
    temperature: 1,
    topP: 0.95,
    maxTools: 25,
  },

  /** Step 3.7 Flash — Multimodal QA and UI verification. Fast screenshot-based testing */
  TESTER: {
    id: 'stepfun-ai/step-3.7-flash',
    maxTokens: 8192,
    thinking: null,
    temperature: 1,
    topP: 0.95,
    maxTools: 15,
  },

  /** DeepSeek V4 Flash — Fix router. Writer that fixes build/test failures */
  FIX_ROUTER: {
    id: 'deepseek-ai/deepseek-v4-flash',
    maxTokens: 10000,
    thinking: { thinking: true, reasoning_effort: 'high' },
    temperature: 1,
    topP: 0.95,
    maxTools: 25,
  },
} as const satisfies Record<string, ModelConfig>

/** Fallback model used when primary model fails */
export const FALLBACK_MODEL: ModelConfig = {
  id: 'z-ai/glm-5.1',
  maxTokens: 16384,
  thinking: { enable_thinking: true, clear_thinking: false },
  temperature: 0.8,
  topP: 0.95,
  maxTools: 25,
}

/** Stepfun-specific fallback: if step-3.7-flash fails, try Llama then GLM */
const STEPFUN_FALLBACK: ModelConfig = {
  id: 'meta/llama-3.3-70b-instruct',
  maxTokens: 8192,
  thinking: null,
  temperature: 1,
  topP: 1,
  maxTools: 10,
}

/** Model-specific fallback chain. If a model ID matches a key, try those fallbacks in order before the global FALLBACK_MODEL. */
const MODEL_FALLBACK_CHAINS: Record<string, ModelConfig[]> = {
  'stepfun-ai/step-3.7-flash': [STEPFUN_FALLBACK, FALLBACK_MODEL],
}

export type ModelKey = keyof typeof MODELS

// ─── claude-proxy: Boolean JSON Schema Sanitization ───────────────────────────
// NIM rejects boolean subschemas in tool parameter JSON Schema.
// Port of _sanitize_nim_schema_node from providers/nvidia_nim/request.py

const SCHEMA_VALUE_KEYS = new Set([
  'additionalProperties', 'additionalItems', 'unevaluatedProperties',
  'unevaluatedItems', 'items', 'contains', 'propertyNames',
  'if', 'then', 'else', 'not',
])
const SCHEMA_LIST_KEYS = new Set(['allOf', 'anyOf', 'oneOf', 'prefixItems'])
const SCHEMA_MAP_KEYS = new Set(['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'])

function sanitizeNimSchemaNode(value: unknown): { keep: boolean; sanitized: unknown } {
  if (typeof value === 'boolean') return { keep: false, sanitized: null }
  if (Array.isArray(value)) {
    const items = value.map(v => sanitizeNimSchemaNode(v)).filter(r => r.keep).map(r => r.sanitized)
    return { keep: true, sanitized: items }
  }
  if (typeof value === 'object' && value !== null) {
    const obj = value as Record<string, unknown>
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(obj)) {
      if (SCHEMA_VALUE_KEYS.has(key)) {
        const { keep, sanitized } = sanitizeNimSchemaNode(item)
        if (keep) result[key] = sanitized
      } else if (SCHEMA_LIST_KEYS.has(key) && Array.isArray(item)) {
        const items = item.map(v => sanitizeNimSchemaNode(v)).filter(r => r.keep).map(r => r.sanitized)
        if (items.length > 0) result[key] = items
      } else if (SCHEMA_MAP_KEYS.has(key) && typeof item === 'object' && item !== null) {
        const map: Record<string, unknown> = {}
        for (const [mk, mv] of Object.entries(item as Record<string, unknown>)) {
          const { keep, sanitized } = sanitizeNimSchemaNode(mv)
          if (keep) map[mk] = sanitized
        }
        result[key] = map
      } else {
        result[key] = item
      }
    }
    return { keep: true, sanitized: result }
  }
  return { keep: true, sanitized: value }
}

// ─── claude-proxy: Tool Parameter Aliasing ────────────────────────────────────
// NIM safety: parameter names like "type" are reserved and cause errors.
// Port of _alias_nim_tool_parameters from providers/nvidia_nim/request.py

const NIM_UNSAFE_PARAM_NAMES = new Set(['type'])
const ALIAS_PREFIX = '_fcc_arg_'

function aliasToolParameters(tools: unknown[] | undefined): unknown[] | undefined {
  if (!tools) return undefined
  return tools.map((tool) => {
    if (typeof tool !== 'object' || tool === null) return tool
    const t = JSON.parse(JSON.stringify(tool)) // deep clone
    const fn = (t as Record<string, unknown>).function as Record<string, unknown> | undefined
    if (!fn?.parameters) return t
    const params = fn.parameters as Record<string, unknown>
    const props = (params as Record<string, unknown>).properties as Record<string, unknown> | undefined
    if (!props) return t

    const existingNames = new Set(Object.keys(props))
    const aliasMap: Record<string, string> = {}

    for (const key of Object.keys(props)) {
      if (NIM_UNSAFE_PARAM_NAMES.has(key)) {
        let alias = `${ALIAS_PREFIX}${key}`
        let suffix = 2
        while (existingNames.has(alias)) { alias = `${ALIAS_PREFIX}${key}_${suffix}`; suffix++ }
        existingNames.add(alias)
        aliasMap[key] = alias
        props[alias] = props[key]
        delete props[key]
      }
    }

    // Also rename in required array
    if (Object.keys(aliasMap).length > 0 && Array.isArray(params.required)) {
      params.required = (params.required as string[]).map(r => aliasMap[r] || r)
    }

    return t
  })
}

// ─── claude-proxy: TPM-Aware Tool Trimming ────────────────────────────────────
// Port of _trim_tools_for_tpm from providers/nvidia_nim/request.py

const PRIORITY_TOOL_NAMES = new Set([
  'readFile', 'writeFile', 'listFiles', 'runBuild', 'runTests',
  'gitDiff', 'gitCommit', 'Read', 'Write', 'Edit', 'MultiEdit',
  'bash', 'execute_command', 'Bash', 'list_directory', 'list_dir',
  'search_files', 'grep_search', 'Grep', 'Glob',
])

function trimToolsForModel(tools: unknown[] | undefined, model: ModelConfig): unknown[] | undefined {
  if (!tools || tools.length === 0) return undefined
  if (!model.maxTools) return tools
  if (tools.length <= model.maxTools) return tools

  const priority: unknown[] = []
  const others: unknown[] = []
  for (const t of tools) {
    const fn = (t as Record<string, unknown>)?.function as Record<string, unknown> | undefined
    const name = fn?.name as string || ''
    if (PRIORITY_TOOL_NAMES.has(name)) priority.push(t)
    else others.push(t)
  }

  const trimmed = [...priority, ...others].slice(0, model.maxTools)
  console.warn(`[nim] Trimmed ${tools.length} tools to ${trimmed.length} for ${model.id} TPM budget`)
  return trimmed
}

// ─── claude-proxy: Sanitize full tool list ────────────────────────────────────

function sanitizeNimToolSchemas(tools: unknown[] | undefined): unknown[] | undefined {
  if (!tools) return undefined
  return tools.map((tool) => {
    if (typeof tool !== 'object' || tool === null) return tool
    const t = JSON.parse(JSON.stringify(tool))
    const fn = (t as Record<string, unknown>).function as Record<string, unknown> | undefined
    if (!fn?.parameters) return t
    const { sanitized } = sanitizeNimSchemaNode(fn.parameters)
    fn.parameters = sanitized
    return t
  })
}

// ─── NIM Call with Retry ──────────────────────────────────────────────────────

export async function nimCallWithRetry<T>(
  fn: (client: OpenAI) => Promise<T>,
  maxRetries = Math.max(3, NIM_KEYS.length)
): Promise<T> {
  let lastError: Error | null = null

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn(getNimClient())
    } catch (e: unknown) {
      lastError = e as Error
      const status = (e as { status?: number }).status
      const errMsg = (e as Error).message || ''

      // Always rotate key on failure (next iteration gets a fresh client with next key)
      console.warn(`[nim] Attempt ${i + 1}/${maxRetries} failed (status: ${status || 'N/A'}): ${errMsg.slice(0, 150)}`)

      // Don't retry on 400 (bad request) — caller should handle
      if (status === 400) {
        throw e
      }

      // Rate limit (429) — backoff longer
      if (status === 429 && i < maxRetries - 1) {
        const backoffMs = 2000 * Math.pow(2, i) // 2s, 4s, 8s
        console.warn(`[nim] 429 rate limit, rotating key, backoff ${backoffMs}ms`)
        await new Promise(r => setTimeout(r, backoffMs))
        continue
      }

      // Server error (500+) — backoff and retry with next key
      if (status && status >= 500 && i < maxRetries - 1) {
        const backoffMs = 2000 * Math.pow(2, i)
        console.warn(`[nim] ${status} server error, rotating key, retry in ${backoffMs}ms`)
        await new Promise(r => setTimeout(r, backoffMs))
        continue
      }

      // Connection errors (ECONNREFUSED, ECONNRESET, fetch failed, etc.) — retry with next key
      const isConnectionError = errMsg.includes('ECONNRE') || errMsg.includes('fetch failed') || 
        errMsg.includes('socket hang up') || errMsg.includes('network') || errMsg.includes('ETIMEDOUT')
      if (isConnectionError && i < maxRetries - 1) {
        const backoffMs = 1000 * (i + 1)
        console.warn(`[nim] Connection error, rotating key, retry in ${backoffMs}ms`)
        await new Promise(r => setTimeout(r, backoffMs))
        continue
      }

      // Unknown error on non-last attempt — still retry with next key
      if (i < maxRetries - 1) {
        const backoffMs = 1500 * Math.pow(2, i)
        console.warn(`[nim] Unknown error, rotating key, retry in ${backoffMs}ms`)
        await new Promise(r => setTimeout(r, backoffMs))
        continue
      }

      throw e
    }
  }

  throw lastError ?? new Error('NIM call failed after retries')
}

// ─── Convenience: Chat Completion ─────────────────────────────────────────────

export type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string | Array<{ type: string; [key: string]: unknown }>
  tool_call_id?: string
  tool_calls?: unknown[]
}

export interface NimChatOptions {
  model: ModelConfig
  messages: ChatMessage[]
  responseFormat?: { type: 'json_object' | 'text' }
  maxTokensOverride?: number
  tools?: unknown[]
  stream?: boolean
  onChunk?: (text: string) => void
  /** When true, fallback to GLM-5.1 on failure */
  allowFallback?: boolean
}

// 10 minutes timeout — NIM models need time for large generations (Next.js full app)
const NIM_REQUEST_TIMEOUT_MS = 600_000

// claude-proxy pattern: reduced reasoning_budget for timeout retry
const TIMEOUT_RETRY_REASONING_BUDGET = 8192

/**
 * Single chat completion call via NIM.
 * Handles model-specific thinking params, temperature, tool trimming, aliasing.
 * claude-proxy retry patterns:
 * - Retry on timeout with reduced reasoning_budget
 * - Retry on 400 stripping reasoning_budget/chat_template/reasoning_content
 * - Retry on empty response with thinking disabled
 * Falls back to GLM-5.1 if allowFallback is true.
 */
export async function nimChat(options: NimChatOptions): Promise<string> {
  const { model, messages, responseFormat, maxTokensOverride, tools, stream, onChunk, allowFallback = true } = options

  let currentMessages = [...messages]
  let fullResult = ''
  let attempts = 0
  const maxContinuations = 3

  while (attempts <= maxContinuations) {
    try {
      const result = await _doNimChat({
        model,
        messages: currentMessages,
        responseFormat,
        maxTokensOverride,
        tools,
        stream,
        onChunk,
      })
      
      if (result && result.trim().length > 0) {
        fullResult += result
        return fullResult
      }
      return fullResult
      
    } catch (e: any) {
      if (e.message === 'max_tokens_reached' && attempts < maxContinuations) {
        console.log(`[nim] Model ${model.id} hit max tokens, auto-continuing (Attempt ${attempts + 1}/${maxContinuations})`)
        fullResult += e.partialContent || ''
        currentMessages.push({ role: 'assistant', content: e.partialContent || '' })
        currentMessages.push({ role: 'user', content: 'Continue exactly where you left off, without repeating anything. Start immediately with the next character.' })
        attempts++
        continue
      }
      
      if (e.message === 'max_tokens_reached') {
        console.warn(`[nim] Model ${model.id} hit max tokens and exhausted continuations. Returning partial output.`)
        fullResult += e.partialContent || ''
        return fullResult
      }

      const errStatus = e.status
      const errMsg = e.message || ''

      // On timeout/504 — try model-specific fallback chain, then global fallback
      if (errMsg.includes('timeout') || errMsg.includes('AbortError') || errStatus === 504) {
        if (allowFallback) {
          const chain = MODEL_FALLBACK_CHAINS[model.id] || [FALLBACK_MODEL]
          for (const fb of chain) {
            console.warn(`[nim] Timeout from ${model.id}, trying fallback ${fb.id}`)
            try {
              const fallbackResult = await _doNimChat({
                model: fb,
                messages,
                responseFormat,
                maxTokensOverride,
                tools,
              })
              if (fallbackResult && fallbackResult.trim().length > 0) return fullResult + fallbackResult
            } catch {
              continue // try next in chain
            }
          }
        }
        throw e
      }

      // claude-proxy: retry on 400 stripping problematic fields
      if (errStatus === 400) {
        if (errMsg.includes('reasoning_budget') || errMsg.includes('chat_template') || errMsg.includes('reasoning_content')) {
          console.warn(`[nim] 400 from ${model.id}, retrying without thinking params`)
          try {
            const retryResult = await _doNimChat({
              model: { ...model, thinking: null },
              messages: messages.map(m => {
                const cleaned = { ...m }
                delete (cleaned as Record<string, unknown>).reasoning_content
                return cleaned
              }),
              responseFormat,
              maxTokensOverride,
              tools,
              stream,
              onChunk,
            })
            if (retryResult && retryResult.trim().length > 0) return fullResult + retryResult
          } catch {
            // Fall through to fallback
          }
        }
      }

      // For 500+ or empty response, try model-specific fallback chain
      if (allowFallback && (errStatus === undefined || errStatus >= 500 || errStatus === 400)) {
        console.error(`[nim] Chat error with ${model.id}:`, e)
        const chain = MODEL_FALLBACK_CHAINS[model.id] || [FALLBACK_MODEL]
        for (const fb of chain) {
          console.warn(`[nim] Primary model ${model.id} failed, trying fallback ${fb.id}`)
          try {
            const fallbackResult = await _doNimChat({
              model: fb,
              messages,
              responseFormat,
              maxTokensOverride,
              tools,
              stream,
              onChunk,
            })
            if (fallbackResult && fallbackResult.trim().length > 0) return fullResult + fallbackResult
          } catch (fbErr) {
            console.error(`[nim] Fallback model ${fb.id} also failed:`, fbErr)
            continue // try next in chain
          }
        }
      }
      
      throw e
    }
  }

  // If we reach here, we exhausted attempts (should only happen if result is empty string without max_tokens error)
  console.warn(`[nim] Empty response from ${model.id}, retry without thinking`)
  const retryResult = await _doNimChat({
    model: { ...model, thinking: null },
    messages,
    responseFormat,
    maxTokensOverride,
    tools,
    stream,
    onChunk,
  })

  if (retryResult && retryResult.trim().length > 0) {
    return fullResult + retryResult
  }

  throw new Error(`[nim] Empty response from ${model.id} after retries`)
}

// Internal: perform the actual NIM chat call
interface _DoNimChatOptions {
  model: ModelConfig
  messages: ChatMessage[]
  responseFormat?: { type: 'json_object' | 'text' }
  maxTokensOverride?: number
  tools?: unknown[]
  stream?: boolean
  onChunk?: (text: string) => void
}

async function _doNimChat(options: _DoNimChatOptions): Promise<string> {
  const { model, messages, responseFormat, maxTokensOverride, tools, stream, onChunk } = options

  const t0 = performance.now()
  console.log(`[nim] 🚀 Requesting ${model.id} (stream: ${!!stream}, maxTokens: ${maxTokensOverride ?? model.maxTokens})`)
  
  let currentMessages = [...messages]
  let totalContent = ''
  let resumeCount = 0
  const MAX_RESUMES = 2

  while (resumeCount <= MAX_RESUMES) {
    try {
      const chunkResult = await nimCallWithRetry(async (client) => {
        const params: Record<string, unknown> = {
          model: model.id,
          messages: currentMessages,
        max_tokens: maxTokensOverride ?? model.maxTokens,
        temperature: model.temperature ?? 1,
        top_p: model.topP ?? 1,
      }

    // Model-specific thinking configuration (claude-proxy pattern)
    if (model.thinking) {
      params.chat_template_kwargs = model.thinking
    }

    // Only use response_format if explicitly requested AND not a thinking model
    if (responseFormat && !model.thinking) {
      params.response_format = responseFormat
    }

    // claude-proxy: Tool handling pipeline
    // 1. TPM-aware trimming (priority-based)
    // 2. Boolean schema sanitization
    // 3. Parameter aliasing (reserved names like "type")
    let processedTools = trimToolsForModel(tools, model)
    processedTools = sanitizeNimToolSchemas(processedTools)
    processedTools = aliasToolParameters(processedTools)
    if (processedTools && processedTools.length > 0) {
      params.tools = processedTools
    }

    // AbortController for timeout (claude-proxy: 90s)
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), NIM_REQUEST_TIMEOUT_MS)

    try {
      if (stream || onChunk) {
        const streamRes: any = await client.chat.completions.create({
          ...params as any,
          stream: true,
          signal: controller.signal as AbortSignal,
        })
        let thisChunkContent = ''
        let finishReason: any = null
        try {
          for await (const chunk of streamRes) {
            const content = chunk.choices[0]?.delta?.content || ''
            if (content) {
              thisChunkContent += content
              onChunk?.(content)
            }
            if (chunk.choices[0]?.finish_reason) {
              finishReason = chunk.choices[0].finish_reason
            }
          }
          if (finishReason === 'length' || finishReason === 'max_tokens') {
            throw new Error('max_tokens_reached')
          }
          return thisChunkContent
        } catch (streamErr) {
          throw Object.assign(streamErr as Error, { partialContent: thisChunkContent })
        }
      } else {
        const res = await client.chat.completions.create({
          ...params as any,
          signal: controller.signal as AbortSignal,
        })
        const finishReason: any = res.choices[0]?.finish_reason
        const content = res.choices[0]?.message?.content ?? ''
        if (finishReason === 'length' || finishReason === 'max_tokens') {
          throw Object.assign(new Error('max_tokens_reached'), { partialContent: content })
        }
        return content
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        throw Object.assign(new Error(`NIM timeout after ${NIM_REQUEST_TIMEOUT_MS}ms`), { status: 504 })
      }
      throw e
    } finally {
      clearTimeout(timeoutId)
    }
  })

      totalContent += chunkResult
      
      const duration = ((performance.now() - t0) / 1000).toFixed(2)
      console.log(`[NIM] Request to ${model.id} completed successfully in ${duration}s.`)
      return totalContent

    } catch (e) {
      const partial = (e as any).partialContent as string | undefined
      if (partial && partial.length > 0 && resumeCount < MAX_RESUMES) {
        totalContent += partial
        resumeCount++
        console.warn(`[nim] ⚠️ Stream interrupted. Resuming from partial content (${totalContent.length} chars) - attempt ${resumeCount}/${MAX_RESUMES}`)
        currentMessages.push({ role: 'assistant', content: totalContent })
        currentMessages.push({ role: 'user', content: 'Continue exactly where you left off, do not repeat yourself.' })
        continue
      }
      throw e
    }
  }

  throw new Error(`[nim] Failed after ${MAX_RESUMES} resumes`)
}

/**
 * JSON chat completion — enforces JSON via prompt, strips code fences.
 * Does NOT use response_format (unreliable on NIM thinking models).
 */
export async function nimChatJSON<T = unknown>(
  options: Omit<NimChatOptions, 'responseFormat'>
): Promise<T> {
  const raw = await nimChat(options)

  // Strip code fences if present
  let cleaned = raw.trim()
  if (cleaned.startsWith('```')) {
    cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '')
  }
  // Find JSON boundaries
  const firstBrace = cleaned.indexOf('{')
  const firstBracket = cleaned.indexOf('[')
  const lastBrace = cleaned.lastIndexOf('}')
  const lastBracket = cleaned.lastIndexOf(']')

  let jsonStr = cleaned
  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    if (lastBrace !== -1) jsonStr = cleaned.slice(firstBrace, lastBrace + 1)
  } else if (firstBracket !== -1) {
    if (lastBracket !== -1) jsonStr = cleaned.slice(firstBracket, lastBracket + 1)
  }

  try {
    return JSON.parse(jsonStr) as T
  } catch {
    throw new Error(`[nim] Invalid JSON from ${options.model.id}: ${raw.slice(0, 300)}`)
  }
}

// ─── Vision (Kimi K2.6 multimodal) ────────────────────────────────────────────

import axios from 'axios'
import sharp from 'sharp'

async function compressImageForVision(base64: string): Promise<{ base64: string; mimeType: string }> {
  try {
    const buffer = Buffer.from(base64, 'base64')
    // Resize to max 1024x1024 to dramatically reduce context window size
    // Use JPEG with high quality (mozjpeg) for visually lossless compression
    const compressedBuffer = await sharp(buffer)
      .resize(1024, 1024, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer()
    return { base64: compressedBuffer.toString('base64'), mimeType: 'image/jpeg' }
  } catch (error) {
    console.warn('[nimVision] Image compression failed, falling back to original', error)
    return { base64, mimeType: 'image/png' }
  }
}

export interface VisionOptions {
  imageBase64: string
  prompt: string
  maxTokens?: number
  /** override model (default: Kimi K2.6) */
  model?: string
}

/**
 * Kimi K2.6 multimodal call for screenshot / image analysis.
 * Falls back to GLM-5.1 if Kimi fails.
 */
export async function nimVision(options: VisionOptions): Promise<string> {
  const { imageBase64, prompt, maxTokens = 1024, model = MODELS.OBSERVER_VISUAL.id } = options

  // Compress the image before sending to preserve context window
  const compressed = await compressImageForVision(imageBase64)

  const payload = {
    model,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        {
          type: 'image_url',
          image_url: { url: `data:${compressed.mimeType};base64,${compressed.base64}` },
        },
      ],
    }],
    max_tokens: maxTokens,
    temperature: MODELS.OBSERVER_VISUAL.temperature,
    top_p: MODELS.OBSERVER_VISUAL.topP,
    chat_template_kwargs: MODELS.OBSERVER_VISUAL.thinking,
    stream: false,
  }

  let lastError: Error | null = null
  for (let i = 0; i < 3; i++) {
    try {
      const apiKey = getNextKey()
      const response = await axios.post(
        'https://integrate.api.nvidia.com/v1/chat/completions',
        payload,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          timeout: NIM_REQUEST_TIMEOUT_MS,
        }
      )
      return response.data.choices[0].message.content
    } catch (e: unknown) {
      lastError = e as Error
      if (axios.isAxiosError(e) && e.response?.status === 429 && i < 2) {
        await new Promise(r => setTimeout(r, 1000 * (i + 1)))
        continue
      }
      // On final failure, try fallback model
      if (i === 2) {
        console.warn(`[nim] Vision call with ${model} failed, trying fallback ${FALLBACK_MODEL.id}`)
        try {
          const fbPayload = {
            ...payload,
            model: FALLBACK_MODEL.id,
            chat_template_kwargs: FALLBACK_MODEL.thinking,
          }
          const apiKey = getNextKey()
          const response = await axios.post(
            'https://integrate.api.nvidia.com/v1/chat/completions',
            fbPayload,
            {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              timeout: NIM_REQUEST_TIMEOUT_MS,
            }
          )
          return response.data.choices[0].message.content
        } catch (fbErr: unknown) {
          throw fbErr
        }
      }
      throw e
    }
  }

  throw lastError ?? new Error('Vision call failed')
}

// Backwards compatibility: gemmaVision was the old function name
/** @deprecated Use nimVision instead */
export async function gemmaVision(options: VisionOptions): Promise<string> {
  return nimVision(options)
}
