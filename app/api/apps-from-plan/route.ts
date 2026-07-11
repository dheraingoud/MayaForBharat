// @ts-nocheck
// POST /api/apps-from-plan — Plan generation + apps row creation in one round-trip.
//
// Replaces the older `/api/plan` SSE flow for the "approve plan" path. Streams
// the plan JSON from the LLM, parses it, creates an `apps` row in Convex with
// status='building' + a fresh appId, and returns { plan, appId, model, provider }
// so the client can redirect to `/workbench/[appId]?...` (the new detached flow).
//
// Cost: 1 LLM call. Trailing SSE consumers (`/api/plan`) remain untouched for
// streaming plan UI (the user sees it on the landing page before approving).

import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '@/convex/_generated/api';
import { randomUUID } from 'crypto';
import { streamText as _streamText } from 'ai';
import { createNimModel, resolveModel } from '@/lib/workbench/llm/nim-router';
import { createScopedLogger } from '@/lib/workbench/utils/logger';

export const dynamic = 'force-dynamic';

const logger = createScopedLogger('api.apps-from-plan');

const PLAN_SYSTEM_PROMPT = `You are MAYA, an expert app architect. Given a user's app idea, produce a structured build plan.

Respond ONLY with valid JSON in this exact format:
{
  "name": "Short app name (2-4 words)",
  "description": "One sentence summary of what the app does",
  "features": [
    "Feature 1 — brief description",
    "Feature 2 — brief description",
    "Feature 3 — brief description"
  ],
  "techStack": ["React", "TypeScript", "Tailwind CSS"],
  "pages": ["Home", "Dashboard", "Settings"],
  "dataModel": [
    { "entity": "User", "fields": ["name", "email", "role"] },
    { "entity": "Order", "fields": ["id", "status", "total", "items"] }
  ],
  "estimatedComplexity": "simple" | "moderate" | "complex"
}

Rules:
- Keep features list to 3-6 items
- Tech stack should be realistic for a single-page app (React/Next.js)
- Data model should list 2-5 entities with key fields
- Be specific — avoid generic features like "user authentication" unless the prompt asks for it
- estimatedComplexity: "simple" = 1-2 pages, "moderate" = 3-5 pages, "complex" = 6+ pages
- Output ONLY the JSON, no markdown, no explanation`;

function extractJsonObject(text: string): any | null {
  if (!text) return null;
  // Strip /* reasoning-style */ blocks if present (used by several NIM models).
  const stripped = text
    .replace(/<think>[\s\S]*?<\/think>/g, '')
    .replace(/```json\s*[\s\S]*?```/g, '')
    .trim();
  // Anchor on the FIRST `{` after any leading prose: walk forward, tracking
  // string boundaries so we don't get confused by `{` inside literal strings
  // or nested braces. Bail out if the candidate doesn't fully parse.
  const start = stripped.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < stripped.length; i++) {
    const ch = stripped[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (inString) {
      if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const candidate = stripped.slice(start, i + 1);
        try {
          return JSON.parse(candidate);
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

/**
 * Strip markdown chars, control chars, lower-case, collapse whitespace, cap at 60.
 * Used as the sanitizer for LLM-generated names before saving them.
 */
function sanitizeName(name: string, fallback = 'Untitled app'): string {
  const cleaned = String(name ?? '')
    .replace(/[*_~`#>]+/g, '')
    .replace(/[\u0000-\u001f]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return fallback;
  return cleaned.length > 60 ? cleaned.slice(0, 60).trimEnd() : cleaned;
}

/**
 * Try to pull an app name straight from the user's natural-language prompt.
 * Recognized patterns (case-insensitive):
 *   - "called/name it/title/name my app ... <X>"
 *   - "an app called/name/titled <X>"
 *   - "<X> builder/app/tool"  (when the prompt opens with that noun phrase)
 *   - "build me <X>"  (when <X> looks like a short noun phrase)
 * Returns null if no high-confidence name is found — the caller then falls
 * back to whatever the LLM produced.
 */
export function extractAppNameFromPrompt(prompt: string): string | null {
  if (typeof prompt !== 'string') return null;
  const p = prompt.trim();
  if (!p) return null;

  // Use ASCII straight quotes only. Avoid curly quotes / unicode in char classes —
  // some transpilers (and some shell-history tools) substitute characters that JS
  // regex chokes on with "unterminated character class".
  const QUOTE = String.raw`["']`; // class of two ASCII chars only
  const NAME_GUTTER = String.raw`[A-Za-z0-9][A-Za-z0-9 \-_./&]{0,59}`;

  const patterns: RegExp[] = [
    // "called X" / "named X" / "titled X" / "name it X" / "name the app X"
    new RegExp(
      String.raw`\b(?:called|named|titled|name\s+it|name\s+the\s+app)\s+` +
      `${QUOTE}?(${NAME_GUTTER})${QUOTE}?`,
      'i',
    ),
    // "build [me|a|an|the] X [app|builder|tool|...]"
    new RegExp(
      String.raw`\bbuild\s+(?:me\s+|a\s+|an\s+|the\s+)?` +
      `${QUOTE}?([A-Za-z][A-Za-z0-9 \-_./&]{0,59}?(?:\s+(?:app|builder|tool|website|game|tracker|board|planner|dashboard))?)${QUOTE}?$`,
      'i',
    ),
  ];

  for (const re of patterns) {
    const m = p.match(re);
    if (!m) continue;
    const raw = (m[1] ?? '').trim().replace(/^[""']|[""']$/g, '');
    if (raw.length >= 2 && raw.length <= 60) {
      return sanitizeName(raw, raw);
    }
  }
  return null;
}

/**
 * Extract a short one-sentence description from the prompt by taking the first
 * sentence and trimming it. Used as a fallback when the LLM is silent on the
 * description field.
 */
function extractDescription(prompt: string): string {
  const p = prompt.trim();
  if (!p) return '';
  const first = p.split(/[.!?\n]+/)[0]?.trim() ?? '';
  return first.length > 160 ? first.slice(0, 160).trimEnd() + '…' : first;
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON body' }, { status: 400 });
  }
  const prompt: string = body?.prompt ?? '';
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return NextResponse.json({ error: 'missing prompt' }, { status: 400 });
  }

  // The client may have allocated the appId so the redirect can land
  // instantly on /workbench/[id]. When provided, accept it; otherwise
  // mint our own (legacy / fallback path).
  const preallocatedAppId: string | undefined =
    typeof body?.preallocatedAppId === 'string' && body.preallocatedAppId.trim()
      ? body.preallocatedAppId.trim()
      : undefined;

  // DURABILITY: apps row BEFORE LLM plan — survives fetch abort (Task #28).
  // handleApprove does fire-and-forget + navigate; keepalive lets the POST
  // survive navigation, but a tab/process tear-down mid-LLM would erase the
  // build entirely if apps.create ran AFTER the ~90s plan. Create the row NOW
  // (heuristic name from the prompt, no specJson yet) so /workbench/[id] has
  // something to subscribe to the instant the redirect lands, then repatch
  // specJson idempotently once the LLM plan resolves lower down.
  const appId = preallocatedAppId ?? randomUUID();
  const convexUrl =
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    process.env.CONVEX_URL ||
    'https://example.check.convex.cloud';
  const convex = new ConvexHttpClient(convexUrl);
  const eagerName = sanitizeName(extractAppNameFromPrompt(prompt) ?? prompt, 'New App');
  const eagerDesc = extractDescription(prompt);
  try {
    await convex.mutation(api.apps.create, {
      traderId: 'anonymous',
      appId,
      name: eagerName,
      nameHindi: eagerName,
      descriptionEn: eagerDesc,
      category: 'other',
      status: 'building',
      messages: [],
    });
  } catch (e: any) {
    logger.error('[plan] apps.create (eager) failed:', e?.message ?? e);
    return NextResponse.json(
      { error: `could not create app shell: ${e?.message ?? 'unknown'}`, appId },
      { status: 500 },
    );
  }

  // Resolve model + provider from env (mirrors /api/plan).
  const miniModelEnv = process.env.MAYA_MINI || 'stepfun-ai/step-3.7-flash';
  const bareModel = miniModelEnv.replace(/^nvidia-nim\//i, '');
  const provider = 'NvidiaNIM';
  // Budget maxOutputTokens from the nim-router catalog caps — same fix the
  // CLAUDE.md "empty LLM output" note mandates. stepfun-3.7-flash cap=16384,
  // minimax-m3 cap=16384. The plan JSON is small but reasoning models emit
  // many reasoning tokens BEFORE the answer; 6.5s + 2048 truncated both
  // attempts to length=0. Budget generously + give the model time to finish.
  const catalogCap = resolveModel(bareModel).maxCompletionTokens; // 16384 for stepfun/minimax
  const planBudget = Math.min(catalogCap, 16384);

  let plan: any = null;
  let rawText = '';
  let usedFallback = false;
  try {
    // Each attempt: returns the (text or fall-back reasoning) response.
    // Each attempt races a hard timeout — if the provider stalls we abort and
    // fall through to the next attempt (or to a heuristic fallback plan).
    const tryOnce = async (
      overrides: { temperature?: number; reminder?: string; timeoutMs?: number; maxOutputTokens?: number },
      signal: AbortSignal,
    ) => {
      const model = createNimModel(bareModel);
      const userContent = overrides.reminder
        ? `${prompt}\n\n[SYSTEM REMINDER] ${overrides.reminder}`
        : prompt;
      const result = _streamText({
        model,
        messages: [
          { role: 'system', content: PLAN_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        // Reasoning models (stepfun-3.7-flash, minimax-m3, deepseek-v4 et al)
        // emit many reasoning tokens BEFORE the answer; small budgets + a 6.5s
        // timeout truncated both attempts to length=0 -> heuristic fallback
        // -> "Model returned no files" on the workbench. Budget from the catalog
        // cap (16384) and let the call run to completion. The race still
        // cancels whichever attempt loses — just no longer aborts the winner.
        maxOutputTokens: overrides.maxOutputTokens ?? planBudget,
        temperature: overrides.temperature ?? 0.7,
        abortSignal: signal,
      });
      let text: string | null = await result.text;
      if (!text || text.length === 0) {
        try {
          const reasoning: unknown = await result.reasoningText;
          if (typeof reasoning === 'string' && reasoning.trim().length > 0) {
            text = reasoning;
          }
        } catch {
          /* reasoning field may not exist on this provider */
        }
      }
      return text ?? '';
    };

    const withTimeout = async <T,>(
      p: Promise<T>,
      ms: number,
      label: string,
      onAbort?: () => void,
    ): Promise<T | null> => {
      let timer: any;
      try {
        return await new Promise<T | null>((resolve, reject) => {
          timer = setTimeout(() => {
            try {
              onAbort?.();
            } catch {
              /* */
            }
            resolve(null);
          }, ms);
          p.then(
            (v) => {
              clearTimeout(timer);
              resolve(v);
            },
            (e) => {
              clearTimeout(timer);
              reject(e);
            },
          );
        });
      } catch {
        return null;
      } finally {
        if (timer) clearTimeout(timer);
      }
    };

    // Parallel attempts: race the original prompt (default temp, generous
    // budget) against the temperature=0 + reminder retry. Whichever finishes
    // first wins. Each gets its own AbortController so the loser is torn
    // down instead of leaking tokens/seconds. Total wall time is `ms` not
    // `ms*2` — this is the biggest win over the prior serial design.
    const firstAbort = new AbortController();
    const secondAbort = new AbortController();

    const firstP = withTimeout(
      tryOnce({}, firstAbort.signal),
      90000,
      'first-attempt',
      () => firstAbort.abort(),
    );
    const secondP = withTimeout(
      tryOnce(
        {
          temperature: 0,
          reminder:
            'Reply with ONLY a single raw JSON object matching the system schema. ' +
            'No prose, no markdown fences, no commentary, no trailing text.',
          maxOutputTokens: planBudget,
        },
        secondAbort.signal,
      ),
      90000,
      'second-attempt',
      () => secondAbort.abort(),
    );

    // Race them; whichever resolves first wins. If the first one wins we
    // immediately abort the second attempt (it'll still resolve to null but
    // the network call has been cancelled).
    const racers = await Promise.allSettled([firstP, secondP]);
    const winner =
      racers.find((r) => r.status === 'fulfilled' && r.value && r.value.length > 0)?.value ??
      (await firstP) ??
      (await secondP) ??
      '';
    rawText = winner;
    plan = extractJsonObject(rawText);
    if (typeof plan?.name !== 'string') {
      logger.error(
        '[plan] failed to parse raw LLM output (length=' + (rawText?.length ?? 0) + '): ' +
          String(rawText ?? '').slice(0, 400),
      );
    }
  } catch (e: any) {
    logger.error('[plan] LLM call failed:', e?.message ?? e);
    return NextResponse.json(
      { error: `plan generation failed: ${e?.message ?? 'unknown'}` },
      { status: 502 },
    );
  }
  // Surface any parse failure with the captured raw text (still in scope here).
  // Fall back to a heuristic plan derived from the prompt itself so the user
  // never sees a 502 — the workbench still gets a usable plan + appId and the
  // build can proceed without a phantom feature/deliverable list.
  if (!plan || typeof plan.name !== 'string') {
    logger.warn('[plan] LLM returned no parseable plan; building heuristic fallback');
    usedFallback = true;
    const fallbackName = extractAppNameFromPrompt(prompt) ?? sanitizeName(prompt);
    plan = {
      name: fallbackName || 'New App',
      description: extractDescription(prompt) || 'AI-generated app — building now.',
      features: [
        'Auth + private dashboard',
        'Real-time data sync',
        'Responsive UI with keyboard shortcuts',
      ],
      techStack: ['React', 'TypeScript', 'Tailwind CSS'],
      pages: ['Home', 'Dashboard', 'Settings'],
      dataModel: [
        { entity: 'User', fields: ['name', 'email', 'role', 'joinedAt'] },
        { entity: 'Item', fields: ['id', 'name', 'status', 'createdAt'] },
      ],
      estimatedComplexity: 'moderate',
    };
  }

  // Extract a name from the user's prompt if they phrased one. User's wording
  // wins over the LLM's; we still let the LLM name when the user didn't.
  const extractedName = extractAppNameFromPrompt(prompt);
  const finalName = extractedName ?? sanitizeName(plan.name);
  const finalDescription = extractedName
    ? (plan.description ?? extractDescription(prompt))
    : (plan.description ?? '');
  // Tell the LLM (next time) to use the user-supplied name if any. Kept simple.
  void finalDescription;

  // DURABILITY: idempotent repatch of specJson + final name.
  // The eager apps.create above already wrote a building row with a heuristic
  // name; apps.create is Upsert-by-appId (convex/apps.ts), so this call PATCHes
  // specJson + the LLM-derived name. Non-fatal: the row already exists and
  // BuilderPageWithJob Effect#1 owns generation spawn from the prompt, so a
  // repatch failure must not break the build — the heuristic row is enough.
  try {
    await convex.mutation(api.apps.create, {
      traderId: 'anonymous',
      appId,
      name: finalName,
      nameHindi: finalName,
      descriptionEn: finalDescription,
      category: 'other',
      status: 'building',
      specJson: JSON.stringify(plan),
      messages: [],
    });
  } catch (e: any) {
    logger.error('[plan] apps.create (repatch) failed:', e?.message ?? e);
  }

  return NextResponse.json({ plan, appId, model: bareModel, provider, fallback: usedFallback });
}
