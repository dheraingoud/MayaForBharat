// @ts-nocheck
// Source: bolt.diy/app/routes/api.enhancer.ts
// Ported: Remix action → Next.js POST handler

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import { streamText } from '@/lib/workbench/llm/stream-text';
import { stripIndents } from '@/lib/workbench/utils/stripIndent';
import type { ProviderInfo } from '@/lib/workbench/types/model';
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '@/lib/workbench/api/cookies';
import { createScopedLogger } from '@/lib/workbench/utils/logger';

const logger = createScopedLogger('api.enhancer');

export async function POST(request: NextRequest) {
  const { message, model, provider } = (await request.json()) as {
    message: string;
    model: string;
    provider: ProviderInfo;
    apiKeys?: Record<string, string>;
  };

  const { name: providerName } = provider ?? {};

  // validate 'model' and 'provider' fields
  if (!model || typeof model !== 'string') {
    return NextResponse.json({ error: 'Invalid or missing model' }, { status: 400 });
  }

  if (!providerName || typeof providerName !== 'string') {
    return NextResponse.json({ error: 'Invalid or missing provider' }, { status: 400 });
  }

  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = getApiKeysFromCookie(cookieHeader);
  const providerSettings = getProviderSettingsFromCookie(cookieHeader);

  try {
    const result = await streamText({
      messages: [
        {
          role: 'user',
          content:
            `[Model: ${model}]\n\n[Provider: ${providerName}]\n\n` +
            stripIndents`
            You are a professional prompt engineer specializing in crafting precise, effective prompts.
            Your task is to enhance prompts by making them more specific, actionable, and effective.

            I want you to improve the user prompt that is wrapped in \`<original_prompt>\` tags.

            For valid prompts:
            - Make instructions explicit and unambiguous
            - Add relevant context and constraints
            - Remove redundant information
            - Maintain the core intent
            - Ensure the prompt is self-contained
            - Use professional language

            For invalid or unclear prompts:
            - Respond with clear, professional guidance
            - Keep responses concise and actionable
            - Maintain a helpful, constructive tone
            - Focus on what the user should provide
            - Use a standard template for consistency

            IMPORTANT: Your response must ONLY contain the enhanced prompt text.
            Do not include any explanations, metadata, or wrapper tags.

            <original_prompt>
              ${message}
            </original_prompt>
          `,
        },
      ],
      env: process.env as Record<string, string>,
      apiKeys,
      providerSettings,
      options: {
        system:
          'You are a senior software principal architect, you should help the user analyse the user query and enrich it with the necessary context and constraints to make it more specific, actionable, and effective. You should also ensure that the prompt is self-contained and uses professional language. Your response should ONLY contain the enhanced prompt text. Do not include any explanations, metadata, or wrapper tags.',
      },
    });

    // The enhancer client reads raw text chunks (not AI SDK data stream protocol)
    // so we pipe textStream through a TextEncoder to get ReadableStream<Uint8Array>
    const encoder = new TextEncoder();
    const readableStream = result.textStream.pipeThrough(
      new TransformStream<string, Uint8Array>({
        transform(chunk, controller) {
          controller.enqueue(encoder.encode(chunk));
        },
      }),
    );

    return new Response(readableStream, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error: unknown) {
    console.log(error);

    if (error instanceof Error && error.message?.includes('API key')) {
      return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
    }

    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
