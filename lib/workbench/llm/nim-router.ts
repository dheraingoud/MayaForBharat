// @ts-nocheck
/**
 * MAYA NIM Router — Unified model router for NVIDIA NIM APIs
 *
 * Ported from free-claude-code's ProviderRegistry + KeyRotator pattern,
 * adapted for MAYA's bolt.diy provider architecture.
 *
 * This is the ONLY file you need to touch to add/change NIM models.
 * Everything else (provider, stream-text, maya-models API) reads from here.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  .env                                                          │
 * │  MAYA_MINI=stepfun-ai/step-3.7-flash                          │
 * │  MAYA_FAST=deepseek-ai/deepseek-v4-flash                      │
 * │  MAYA_MAX=minimaxai/minimax-m3                                │
 * │  NVIDIA_API_KEY_1=nvapi-xxx                                    │
 * │  NVIDIA_API_KEY_2=nvapi-yyy                                    │
 * └──────────────┬──────────────────────────────────────────────────┘
 *                │
 *                ▼
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  nim-router.ts (this file)                                     │
 * │                                                                │
 * │  NIM_MODEL_CATALOG ── known models + token limits              │
 * │  NimKeyRotator     ── 429-aware multi-key rotation             │
 * │  resolveModel()    ── any model name → ModelInfo               │
 * │  createNimModel()  ── model name → AI SDK LanguageModel        │
 * │  getMayaTiers()    ── MAYA_MINI/FAST/MAX env → model names     │
 * │  getStaticModels() ── full list for bolt.diy provider          │
 * └──────────────┬──────────────────────────────────────────────────┘
 *                │
 *        Used by │
 *                ├── nvidia-nim.ts (bolt.diy provider)
 *                ├── maya-models/route.ts (API)
 *                └── stream-text.ts (via provider.getModelInstance)
 */

import type { ModelInfo } from '@/lib/workbench/llm/types';
import type { LanguageModel } from 'ai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';

// ═══════════════════════════════════════════════════════════════════════════════
// 1. NIM ENDPOINT
// ═══════════════════════════════════════════════════════════════════════════════

export const NIM_BASE_URL =
  process.env.NVIDIA_NIM_BASE_URL?.replace(/\/$/, '') ||
  'https://integrate.api.nvidia.com/v1';

export const NIM_PROVIDER_NAME = 'NvidiaNIM';

// ═══════════════════════════════════════════════════════════════════════════════
// 2. KEY ROTATOR (ported from free-claude-code/providers/key_rotator.py)
// ═══════════════════════════════════════════════════════════════════════════════

interface KeySlot {
  key: string;
  blockedUntil: number; // Date.now() timestamp
}

const COOLDOWN_MS = 20_000; // 20s cooldown per rate-limited key

/**
 * NIM API key rotator with 429-aware cooldown.
 *
 * Reads NVIDIA_API_KEY_1 … NVIDIA_API_KEY_20 from env.
 * Falls back to NVIDIA_NIM_API_KEY (legacy single-key).
 *
 * When a key gets a 429, it's blocked for COOLDOWN_MS.
 * The rotator picks the next healthy key round-robin.
 * If ALL keys are blocked, it picks the one that unblocks soonest.
 */
class NimKeyRotator {
  private slots: KeySlot[] = [];
  private index = 0;

  constructor() {
    for (let i = 1; i <= 20; i++) {
      const key = process.env[`NVIDIA_API_KEY_${i}`]?.trim();
      if (key) this.slots.push({ key, blockedUntil: 0 });
    }

    if (this.slots.length === 0) {
      const legacy = process.env.NVIDIA_NIM_API_KEY?.trim();
      if (legacy) this.slots.push({ key: legacy, blockedUntil: 0 });
    }

    if (this.slots.length > 0) {
      console.log(`[NIM Router] KeyRotator initialized: ${this.slots.length} key(s)`);
    }
  }

  get size() { return this.slots.length; }
  get hasKeys() { return this.slots.length > 0; }

  /** Get the next healthy key, or the least-blocked key if all are cooling. */
  nextKey(): string {
    if (!this.hasKeys) return '';
    const now = Date.now();

    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[this.index % this.slots.length];
      this.index = (this.index + 1) % this.slots.length;
      if (now >= slot.blockedUntil) return slot.key;
    }

    const best = this.slots.reduce((a, b) => a.blockedUntil < b.blockedUntil ? a : b);
    const waitSec = Math.ceil((best.blockedUntil - now) / 1000);
    console.warn(`[NIM Router] All keys cooling, using …${best.key.slice(-6)} (${waitSec}s)`);
    return best.key;
  }

  /** Mark a key as rate-limited. */
  markRateLimited(key: string): void {
    const slot = this.slots.find(s => s.key === key);
    if (slot) {
      slot.blockedUntil = Date.now() + COOLDOWN_MS;
      console.warn(`[NIM Router] Key …${key.slice(-6)} rate-limited for ${COOLDOWN_MS / 1000}s`);
    }
  }

  /** Mark a key as healthy (clear cooldown). */
  markHealthy(key: string): void {
    const slot = this.slots.find(s => s.key === key);
    if (slot && slot.blockedUntil > 0) slot.blockedUntil = 0;
  }

  /** Get rotator status for monitoring/debugging. */
  getStatus() {
    const now = Date.now();
    return {
      totalKeys: this.slots.length,
      healthyKeys: this.slots.filter(s => now >= s.blockedUntil).length,
      slots: this.slots.map(s => ({
        keyTail: s.key.slice(-6),
        healthy: now >= s.blockedUntil,
        cooldownRemaining: Math.max(0, Math.ceil((s.blockedUntil - now) / 1000)),
      })),
    };
  }
}

/** Singleton key rotator — shared across the NIM provider and API routes. */
export const nimRotator = new NimKeyRotator();

// ═══════════════════════════════════════════════════════════════════════════════
// 3. MODEL CATALOG — Known NIM models with their token limits
//    (like free-claude-code's provider_catalog.py)
//
//    If a model is NOT in this catalog, it still works — we just use
//    sensible defaults (32k context, 8k completion). True plug-and-play.
// ═══════════════════════════════════════════════════════════════════════════════

interface NimModelEntry {
  maxTokenAllowed: number;
  maxCompletionTokens: number;
  /** Optional human-readable label override. If not set, derived from model ID. */
  label?: string;
}

/**
 * Known NIM model limits.
 *
 * Key = exact model ID as it appears on NIM (e.g. "deepseek-ai/deepseek-r1").
 * You can add new models here for optimal token limits, but it's NOT required —
 * unknown models get defaults and work fine.
 */
const NIM_MODEL_CATALOG: Record<string, NimModelEntry> = {
  // ── DeepSeek ──
  // maxCompletionTokens bumped 16384 → 28672: deepseek-v4-flash (MAYA_FAST
  // default) emits reasoning_content BEFORE the answer (hybrid reasoning mode),
  // mirroring the stepfun step-3.7-flash truncation pattern. With the prior
  // 16384 cap + reasoning budget subtraction (~floor(max/3) ≈ 5461), only
  // ~10.9k tokens were left for the bolt XML answer — a multi-file build needs
  // 12-15k → truncated mid-XML, no <boltArtifact> ever closed, zero file cards.
  // 28672 with the 1M context window leaves ample prompt room and gives the
  // answer ~21k after reasoning. Same class of fix as the stepfun bump at L181.
  'deepseek-ai/deepseek-v4-flash':       { maxTokenAllowed: 1048576, maxCompletionTokens: 28672 },
  'deepseek-ai/deepseek-r1':             { maxTokenAllowed: 131072, maxCompletionTokens: 8192,  label: 'DeepSeek R1 (Reasoning)' },
  'deepseek-ai/deepseek-v3':             { maxTokenAllowed: 131072, maxCompletionTokens: 8192 },

  // ── StepFun ──
  // maxCompletionTokens bumped 16384 → 28672: step-3.7-flash emits
  // delta.reasoning_content BEFORE the answer, and the prior 16384 cap with
  // reasoning_budget = floor(max/3) = 5461 left only ~10.9k tokens for the
  // bolt XML answer — a 5-file dashboard needs ~12-15k → truncated mid-XML,
  // no <boltArtifact> ever emitted, zero file cards. 28672 leaves 4k for the
  // prompt within the 32768 context, gives the answer ~21k after reasoning.
  'stepfun-ai/step-3.7-flash':           { maxTokenAllowed: 32768,  maxCompletionTokens: 28672 },

  // ── MiniMax ──
  // maxCompletionTokens bumped 16384 → 32768: minimax-m3 has a 1M context so
  // 32k completion leaves ample room for the prompt. reasoning_effort:'high'
  // is a SEPARATE budget on NIM (not subtracted from max_completion_tokens),
  // so the full 32k goes to the bolt XML answer — enough for a 5-file app.
  'minimaxai/minimax-m3':                { maxTokenAllowed: 1048576, maxCompletionTokens: 32768 },

  // ── Meta Llama ──
  'meta/llama-3.3-70b-instruct':         { maxTokenAllowed: 131072, maxCompletionTokens: 4096 },
  'meta/llama-3.1-405b-instruct':        { maxTokenAllowed: 131072, maxCompletionTokens: 4096 },
  'meta/llama-3.1-70b-instruct':         { maxTokenAllowed: 131072, maxCompletionTokens: 4096 },
  'meta/llama-4-maverick-17b-128e-instruct': { maxTokenAllowed: 131072, maxCompletionTokens: 8192 },
  'meta/llama-4-scout-17b-16e-instruct':    { maxTokenAllowed: 131072, maxCompletionTokens: 8192 },

  // ── Google ──
  'google/gemma-2-27b-it':               { maxTokenAllowed: 8192,   maxCompletionTokens: 4096 },
  'google/gemma-3-27b-it':               { maxTokenAllowed: 32768,  maxCompletionTokens: 8192 },

  // ── NVIDIA ──
  'nvidia/llama-3.1-nemotron-70b-instruct': { maxTokenAllowed: 131072, maxCompletionTokens: 4096 },
  'nvidia/nemotron-4-340b-instruct':     { maxTokenAllowed: 4096,   maxCompletionTokens: 4096 },

  // ── Qwen ──
  'qwen/qwen2.5-72b-instruct':          { maxTokenAllowed: 131072, maxCompletionTokens: 8192 },
  'qwen/qwen2.5-coder-32b-instruct':    { maxTokenAllowed: 32768,  maxCompletionTokens: 8192 },
  'qwen/qwen3-235b-a22b-fp8':           { maxTokenAllowed: 131072, maxCompletionTokens: 8192 },

  // ── Mistral ──
  'mistralai/mistral-large-2-instruct':  { maxTokenAllowed: 131072, maxCompletionTokens: 4096 },
  'mistralai/mixtral-8x22b-instruct-v0.1': { maxTokenAllowed: 65536, maxCompletionTokens: 4096 },
  'mistralai/codestral-25.01':           { maxTokenAllowed: 32768,  maxCompletionTokens: 8192 },

  // ── Microsoft ──
  'microsoft/phi-4':                     { maxTokenAllowed: 16384,  maxCompletionTokens: 4096 },

  // ── AI21 ──
  'ai21labs/jamba-1.5-large-instruct':   { maxTokenAllowed: 131072, maxCompletionTokens: 4096 },
};

/** Default limits for models NOT in the catalog — generous but safe. */
const DEFAULT_MODEL_LIMITS: NimModelEntry = {
  maxTokenAllowed: 32768,
  maxCompletionTokens: 8192,
};

// ═══════════════════════════════════════════════════════════════════════════════
// 4. MAYA TIERS — env-driven model mapping
// ═══════════════════════════════════════════════════════════════════════════════

export type MayaTier = 'mini' | 'fast' | 'max' | 'verifier';

const TIER_DEFAULTS: Record<MayaTier, string> = {
  mini:     'stepfun-ai/step-3.7-flash',
  fast:     'deepseek-ai/deepseek-v4-flash',
  max:      'minimaxai/minimax-m3',
  verifier: 'minimaxai/minimax-m3',
};

const TIER_ENV_KEYS: Record<MayaTier, string> = {
  mini:     'MAYA_MINI',
  fast:     'MAYA_FAST',
  max:      'MAYA_MAX',
  verifier: 'MAYA_VERIFIER',
};

/** Get the model name for a MAYA tier (reads from .env, falls back to defaults). */
export function getTierModel(tier: MayaTier): string {
  const raw = process.env[TIER_ENV_KEYS[tier]]?.trim() || TIER_DEFAULTS[tier];
  // Strip provider prefix if present (e.g. "nvidia-nim/deepseek-ai/deepseek-v4-flash" → "deepseek-ai/deepseek-v4-flash")
  return raw.replace(/^nvidia-nim\//i, '');
}

/** Get all MAYA tier configurations. */
export function getMayaTiers(): Record<MayaTier, { model: string; provider: string; label: string }> {
  // Map tier keys to display names (fast → Balanced)
  const tierDisplayNames: Record<string, string> = {
    mini: 'Mini',
    fast: 'Balanced',
    max: 'Max',
    verifier: 'Verifier',
  };

  const tiers = {} as Record<MayaTier, { model: string; provider: string; label: string }>;
  for (const tier of Object.keys(TIER_DEFAULTS) as MayaTier[]) {
    const model = getTierModel(tier);
    const displayName = tierDisplayNames[tier] || tier.charAt(0).toUpperCase() + tier.slice(1);
    tiers[tier] = {
      model,
      provider: NIM_PROVIDER_NAME,
      label: `${model} (Maya ${displayName})`,
    };
  }
  return tiers;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. MODEL RESOLUTION — the core plug-and-play function
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Resolve any model name to a full ModelInfo.
 *
 * - Known models get their exact token limits from the catalog
 * - Unknown models get sensible defaults and STILL WORK (plug-and-play)
 * - Generates a human-readable label from the model ID
 *
 * This is the key difference from the old static approach: you can put
 * ANY model available on NIM into your .env and it just works.
 */
export function resolveModel(modelId: string): ModelInfo {
  const catalogEntry = NIM_MODEL_CATALOG[modelId];
  const limits = catalogEntry || DEFAULT_MODEL_LIMITS;

  // Generate a clean label from model ID: "deepseek-ai/deepseek-v4-flash" → "DeepSeek V4 Flash"
  const label = catalogEntry?.label || humanizeModelId(modelId);

  // Check if this model is a MAYA tier model and annotate the label
  const tierLabel = getMayaTierLabel(modelId);

  return {
    name: modelId,
    label: tierLabel ? `${label} (${tierLabel})` : label,
    provider: NIM_PROVIDER_NAME,
    maxTokenAllowed: limits.maxTokenAllowed,
    maxCompletionTokens: limits.maxCompletionTokens,
  };
}

/** Generate a human-readable label from a NIM model ID. */
function humanizeModelId(modelId: string): string {
  // "deepseek-ai/deepseek-v4-flash" → "DeepSeek V4 Flash"
  const parts = modelId.split('/');
  const name = parts[parts.length - 1];
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\bAi\b/g, 'AI')
    .replace(/\bIt\b/g, 'IT');
}

/** Check if a model ID matches any MAYA tier and return the tier label. */
function getMayaTierLabel(modelId: string): string | null {
  for (const tier of Object.keys(TIER_DEFAULTS) as MayaTier[]) {
    if (getTierModel(tier) === modelId) {
      return `MAYA ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. STATIC MODEL LIST — for the bolt.diy provider's staticModels array
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Build the static model list for the NIM provider.
 *
 * Includes:
 * - All MAYA tier models (from .env)
 * - All known models from the catalog
 * - Deduped (MAYA tier models that are also in catalog appear once, with tier label)
 */
export function getStaticModels(): ModelInfo[] {
  const seen = new Set<string>();
  const models: ModelInfo[] = [];

  // 1. MAYA tier models first (they get the "(MAYA Mini)" label etc.)
  for (const tier of Object.keys(TIER_DEFAULTS) as MayaTier[]) {
    const modelId = getTierModel(tier);
    if (!seen.has(modelId)) {
      seen.add(modelId);
      models.push(resolveModel(modelId));
    }
  }

  // 2. All catalog models that aren't already tier models
  for (const modelId of Object.keys(NIM_MODEL_CATALOG)) {
    if (!seen.has(modelId)) {
      seen.add(modelId);
      models.push(resolveModel(modelId));
    }
  }

  return models;
}

/**
 * Create an AI SDK LanguageModel for any NIM model.
 *
 * Uses @ai-sdk/openai-compatible (NOT @ai-sdk/openai) because:
 * - Sends to /v1/chat/completions (not /v1/responses which NIM doesn't support)
 * - No provider prefix on model names in request body
 * - transformRequestBody for clean NIM param injection
 *
 * Matches free-claude-code's NvidiaNimProvider:
 * - transformRequestBody injects per-model reasoning params
 * - Custom fetch retries on 400 by stripping rejected fields
 * - Key rotation via nimRotator
 */
export function createNimModel(
  modelId: string,
  overrideKey?: string,
  overrideBaseUrl?: string,
): LanguageModel {
  const effectiveKey = overrideKey || nimRotator.nextKey();

  if (!effectiveKey) {
    throw new Error(
      '[NIM Router] No API keys configured. Set NVIDIA_API_KEY_1 in .env or provide via settings.'
    );
  }

  // Strip any accidental provider prefix (e.g. "nvidia-nim/deepseek-ai/..." → "deepseek-ai/...")
  const bareModelId = modelId.replace(/^nvidia-nim\//i, '');

  const isV4 = /deepseek-v4/i.test(bareModelId);
  const isR1 = /deepseek-r1/i.test(bareModelId);
  const isMinimax = /minimax-m3/i.test(bareModelId);
  const isQwen3 = /qwen3/i.test(bareModelId);
  // StepFun step-3 family: emits delta.reasoning_content BEFORE the answer.
  // Must run through the reasoning branch so chat_template_kwargs.thinking
  // gets injected + max_completion_tokens is used — otherwise the model burns
  // the whole text budget on reasoning and the bolt XML answer never streams.
  const isStepfun = /stepfun-ai\/step-3/i.test(bareModelId);
  const isReasoning = isV4 || isR1 || isMinimax || isQwen3 || isStepfun;

  /**
   * Custom fetch for retry-on-400/500 and key health tracking.
   * (mirrors free-claude-code's _get_retry_request_body in client.py)
   */
  const nimFetch: typeof globalThis.fetch = async (url, init) => {
    // ── Transform request body: strip SDK junk + inject NIM-specific params ──
    // (Moved here from transformRequestBody since createOpenAI doesn't support it)
    if (init?.body && typeof init.body === 'string') {
      try {
        const body = JSON.parse(init.body);

        // Step 1: Strip SDK-injected fields that NIM may not support (ALL models)
        delete body.stream_options;
        delete body.logprobs;
        delete body.top_logprobs;
        delete body.logit_bias;
        delete body.service_tier;

        // Step 2: Ensure max_tokens is always set (SDK may omit it for 'compatible' providers)
        if (!body.max_tokens && !body.max_completion_tokens) {
          body.max_tokens = 28672;
          console.log(`[NIM Router] Injected default max_tokens=28672 for ${bareModelId}`);
        }

        // Step 3: Add reasoning params for known reasoning models only
        if (isReasoning) {
          if (isV4 || isMinimax || isQwen3) {
            // V4, MiniMax M3, and Qwen3 use reasoning_effort
            body.reasoning_effort = body.reasoning_effort || 'high';
          } else {
            if (!body.chat_template_kwargs) {
              // Read max_completion_tokens too — reasoning models (stepfun)
              // set max_completion_tokens, NOT max_tokens, so the prior
              // `body.max_tokens || 16384` always fell back to 16384 and the
              // catalog bump never reached the reasoning_budget math.
              const maxTokens = body.max_tokens || body.max_completion_tokens || 16384;
              // Ratio 1/3 → 1/4: give the bolt XML answer more room. stepfun
              // with 28672 cap → reasoningBudget=7168, answer gets ~21.5k.
              const reasoningBudget = Math.min(Math.floor(maxTokens / 4), 16384);
              body.chat_template_kwargs = {
                thinking: true,
                enable_thinking: true,
                reasoning_budget: reasoningBudget,
              };
            }
          }
          if (body.temperature === undefined || body.temperature === null) {
            body.temperature = 1;
          }
          body.top_p = body.top_p ?? 0.95;
        } else {
          delete body.reasoning_effort;
          delete body.chat_template_kwargs;
        }

        // Debug log
        console.log(`[NIM Router] REQUEST to ${bareModelId}: keys=[${Object.keys(body).join(', ')}] max_tokens=${body.max_tokens} stream=${body.stream}`);

        // Re-serialize the modified body
        init = { ...init, body: JSON.stringify(body) };
      } catch { /* ignore parse errors */ }
    }

    // ── First attempt ──
    let response = await globalThis.fetch(url, init);

    // ── Retry on 400 — strip rejected fields (matches client.py L111-L176) ──
    if (response.status === 400 && init?.body && typeof init.body === 'string') {
      try {
        const errorText = await response.text();
        const errorLower = errorText.toLowerCase();
        const body = JSON.parse(init.body as string);
        let retryBody: Record<string, any> | null = null;

        if (errorLower.includes('reasoning_budget')) {
          if (body.chat_template_kwargs?.reasoning_budget !== undefined) {
            delete body.chat_template_kwargs.reasoning_budget;
            retryBody = body;
            console.warn('[NIM Router] Retrying without reasoning_budget after 400');
          }
        } else if (errorLower.includes('chat_template')) {
          delete body.chat_template_kwargs;
          retryBody = body;
          console.warn('[NIM Router] Retrying without chat_template_kwargs after 400');
        } else if (errorLower.includes('reasoning_content')) {
          if (Array.isArray(body.messages)) {
            for (const msg of body.messages) {
              if (msg && typeof msg === 'object') delete msg.reasoning_content;
            }
            retryBody = body;
            console.warn('[NIM Router] Retrying without reasoning_content after 400');
          }
        } else if (errorLower.includes('reasoning_effort')) {
          delete body.reasoning_effort;
          retryBody = body;
          console.warn('[NIM Router] Retrying without reasoning_effort after 400');
        }

        if (retryBody) {
          response = await globalThis.fetch(url, { ...init, body: JSON.stringify(retryBody) });
        } else {
          response = new Response(errorText, {
            status: 400, statusText: response.statusText, headers: response.headers,
          });
        }
      } catch { /* let original error propagate */ }
    }

    // ── Retry on 500 — NIM sometimes returns 500 for unsupported body params ──
    // Strip optional fields progressively and retry (especially for MiniMax, StepFun, etc.)
    if (response.status === 500 && init?.body && typeof init.body === 'string') {
      try {
        const errorText = await response.text();
        console.warn(`[NIM Router] 500 from NIM for model ${bareModelId}: ${errorText.slice(0, 300)}`);
        const body = JSON.parse(init.body as string);

        // Strip fields that non-standard NIM models may reject
        const fieldsToStrip = [
          'stream_options', 'reasoning_effort', 'chat_template_kwargs',
          'logprobs', 'top_logprobs', 'logit_bias', 'response_format',
          'seed', 'service_tier', 'user', 'n',
        ];
        let stripped = false;
        for (const field of fieldsToStrip) {
          if (body[field] !== undefined) {
            delete body[field];
            stripped = true;
          }
        }

        // Also strip reasoning_content from messages
        if (Array.isArray(body.messages)) {
          for (const msg of body.messages) {
            if (msg && typeof msg === 'object' && msg.reasoning_content !== undefined) {
              delete msg.reasoning_content;
              stripped = true;
            }
          }
        }

        if (stripped) {
          console.warn(`[NIM Router] Retrying ${bareModelId} after stripping: ${JSON.stringify(Object.keys(body))}`);
          response = await globalThis.fetch(url, { ...init, body: JSON.stringify(body) });

          // If still 500, try with absolute minimal params (only model, messages, max_tokens, stream)
          if (response.status === 500) {
            console.warn(`[NIM Router] Still 500, retrying ${bareModelId} with MINIMAL params`);
            const minimalBody: Record<string, any> = {
              model: body.model,
              messages: body.messages,
              max_tokens: Math.min(body.max_tokens || 28672, 28672),
              stream: true,
            };
            console.warn(`[NIM Router] Minimal body keys: [${Object.keys(minimalBody).join(', ')}]`);
            response = await globalThis.fetch(url, { ...init, body: JSON.stringify(minimalBody) });

            if (response.status === 500) {
              console.error(`[NIM Router] FATAL: ${bareModelId} still returns 500 even with minimal params`);
            }
          }
        }
      } catch { /* let original error propagate */ }
    }

    // ── Key health tracking ──
    if (response.status === 429) {
      nimRotator.markRateLimited(effectiveKey);
    } else if (response.ok) {
      nimRotator.markHealthy(effectiveKey);
    }

    return response;
  };

  // ⚠️ Use `createOpenAICompatible` from `@ai-sdk/openai-compatible`, NOT
  // `createOpenAI` from `@ai-sdk/openai`. `@ai-sdk/openai`'s chat model (even
  // in `compatibility:'compatible'` mode) does NOT parse NIM's streaming
  // `delta.reasoning_content` field — it drops every reasoning delta, so
  // reasoning models (stepfun step-3, deepseek-v4, minimax-m3, qwen3) never
  // surface a "Thinking…" phase and the vercel progressive-UI mandate breaks.
  // `createOpenAICompatible` parses `delta.reasoning_content` →
  // reasoning-start/delta/end frames → ReasoningUIPart → ThoughtBox streams.
  const nim = createOpenAICompatible({
    name: 'nvidia-nim',
    baseURL: overrideBaseUrl || NIM_BASE_URL,
    apiKey: effectiveKey,
    fetch: nimFetch as any,
    // NIM models don't support structured outputs
    supportsStructuredOutputs: false,
  });

  return nim.chatModel(bareModelId);
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. DYNAMIC MODEL DISCOVERY — fetch available models from NIM API
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Discover models available on the NIM API.
 * Returns ModelInfo[] for models NOT already in the static list.
 * On 429, marks the key as rate-limited in the rotator.
 */
export async function discoverNimModels(
  overrideKey?: string,
  overrideBaseUrl?: string,
  timeoutMs = 10_000,
): Promise<ModelInfo[]> {
  const effectiveKey = overrideKey || nimRotator.nextKey();
  if (!effectiveKey) return [];

  const baseUrl = overrideBaseUrl || NIM_BASE_URL;

  try {
    const response = await fetch(`${baseUrl}/models`, {
      headers: {
        Authorization: `Bearer ${effectiveKey}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
      if (response.status === 429) nimRotator.markRateLimited(effectiveKey);
      console.warn(`[NIM Router] Model discovery failed: HTTP ${response.status}`);
      return [];
    }

    nimRotator.markHealthy(effectiveKey);
    const res = await response.json() as any;
    if (!res.data || !Array.isArray(res.data)) return [];

    const staticIds = new Set(getStaticModels().map(m => m.name));

    return res.data
      .filter((m: any) => m.id && !staticIds.has(m.id))
      .map((m: any) => ({
        name: m.id,
        label: `${humanizeModelId(m.id)} (NIM)`,
        provider: NIM_PROVIDER_NAME,
        maxTokenAllowed: m.context_length || DEFAULT_MODEL_LIMITS.maxTokenAllowed,
        maxCompletionTokens: Math.min(
          m.context_length || DEFAULT_MODEL_LIMITS.maxCompletionTokens,
          16384,
        ),
      }));
  } catch (e) {
    console.warn(`[NIM Router] Model discovery error:`, e);
    return [];
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. ROUTER STATUS — for monitoring/debugging API routes
// ═══════════════════════════════════════════════════════════════════════════════

/** Get the full router status (for /api/maya-models or health checks). */
export function getRouterStatus() {
  const tiers = getMayaTiers();
  const rotatorStatus = nimRotator.getStatus();

  return {
    tiers,
    catalogSize: Object.keys(NIM_MODEL_CATALOG).length,
    endpoint: NIM_BASE_URL,
    keys: rotatorStatus,
  };
}
