// @ts-nocheck
// POST /api/plan — Streams a structured app plan from NIM (Maya Mini)
// Used by the planning-first UX on the landing page.

import { NextRequest, NextResponse } from 'next/server';
import { createNimModel } from '@/lib/workbench/llm/nim-router';
import { streamText as _streamText } from 'ai';
import { createScopedLogger } from '@/lib/workbench/utils/logger';

export const dynamic = 'force-dynamic';

const logger = createScopedLogger('api.plan');

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

export async function POST(request: NextRequest) {
  try {
    const { prompt } = await request.json() as { prompt: string };

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json({ error: 'Missing prompt' }, { status: 400 });
    }

    logger.info(`[Plan] Generating plan for: "${prompt.slice(0, 100)}..."`);

    // Use Maya Mini for fast plan generation
    const miniModelEnv = process.env.MAYA_MINI || 'stepfun-ai/step-3.7-flash';
    const bareModel = miniModelEnv.replace(/^nvidia-nim\//i, '');

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

    // Return as SSE stream
    return result.toTextStreamResponse({
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error: any) {
    logger.error('[Plan] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Plan generation failed' },
      { status: 500 }
    );
  }
}
