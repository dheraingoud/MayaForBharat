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
import { createNimModel } from '@/lib/workbench/llm/nim-router';
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
  // Strip <think>...</think> reasoning blocks if present.
  const stripped = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  // Find the first balanced {...} at top-level if it exists.
  const m = stripped.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
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

  // Resolve model + provider from env (mirrors /api/plan).
  const miniModelEnv = process.env.MAYA_MINI || 'stepfun-ai/step-3.7-flash';
  const bareModel = miniModelEnv.replace(/^nvidia-nim\//i, '');
  const provider = 'NvidiaNIM';

  let plan: any = null;
  try {
    const model = createNimModel(bareModel);
    const result = _streamText({
      model,
      messages: [
        { role: 'system', content: PLAN_SYSTEM_PROMPT },
        { role: 'user', content: prompt },
      ],
      maxTokens: 2048,
      temperature: 0.7,
    });
    const text = await result.text;
    plan = extractJsonObject(text);
  } catch (e: any) {
    logger.error('[plan] LLM call failed:', e?.message ?? e);
    return NextResponse.json(
      { error: `plan generation failed: ${e?.message ?? 'unknown'}` },
      { status: 502 },
    );
  }

  if (!plan || typeof plan.name !== 'string') {
    return NextResponse.json(
      { error: 'LLM produced no parseable plan' },
      { status: 502 },
    );
  }

  // Mint a stable appId and create the apps row so:
  //   a) /workbench/[appId] has something to subscribe to
  //   b) the worker can write to apps.fileTree on completion
  const appId = randomUUID();
  const convexUrl =
    process.env.NEXT_PUBLIC_CONVEX_URL ||
    process.env.CONVEX_URL ||
    'https://example.check.convex.cloud';
  const convex = new ConvexHttpClient(convexUrl);

  try {
    await convex.mutation(api.apps.create, {
      traderId: 'anonymous',
      appId,
      name: plan.name,
      nameHindi: plan.name,
      descriptionEn: plan.description ?? '',
      category: 'other',
      status: 'building',
      specJson: JSON.stringify(plan),
      messages: [],
    });
  } catch (e: any) {
    logger.error('[plan] apps.create failed:', e?.message ?? e);
    return NextResponse.json(
      {
        error: `could not create app shell: ${e?.message ?? 'unknown'}`,
        appId, // still return so the client can fall back
      },
      { status: 500 },
    );
  }

  return NextResponse.json({ plan, appId, model: bareModel, provider });
}
