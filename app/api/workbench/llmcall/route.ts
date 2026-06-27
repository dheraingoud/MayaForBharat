// @ts-nocheck
// Source: bolt.diy/app/routes/api.llmcall.ts
// Ported: Remix action → Next.js POST handler

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import { streamText } from '@/lib/workbench/llm/stream-text';
import type { IProviderSetting, ProviderInfo } from '@/lib/workbench/types/model';
import { generateText } from 'ai';
import { MAX_TOKENS, PROVIDER_COMPLETION_LIMITS, isReasoningModel } from '@/lib/workbench/llm/server-constants';
import { LLMManager } from '@/lib/workbench/llm/manager';
import type { ModelInfo } from '@/lib/workbench/llm/types';
import { getApiKeysFromCookie, getProviderSettingsFromCookie } from '@/lib/workbench/api/cookies';
import { createScopedLogger } from '@/lib/workbench/utils/logger';

const logger = createScopedLogger('api.llmcall');

async function getModelList(options: {
  apiKeys?: Record<string, string>;
  providerSettings?: Record<string, IProviderSetting>;
  serverEnv?: Record<string, string>;
}) {
  const llmManager = LLMManager.getInstance(process.env as Record<string, string>);
  return llmManager.updateModelList(options);
}

function getCompletionTokenLimit(modelDetails: ModelInfo): number {
  if (modelDetails.maxCompletionTokens && modelDetails.maxCompletionTokens > 0) {
    return modelDetails.maxCompletionTokens;
  }

  const providerDefault = PROVIDER_COMPLETION_LIMITS[modelDetails.provider];
  if (providerDefault) {
    return providerDefault;
  }

  return Math.min(MAX_TOKENS, 16384);
}

function validateTokenLimits(modelDetails: ModelInfo, requestedTokens: number): { valid: boolean; error?: string } {
  const modelMaxTokens = modelDetails.maxTokenAllowed || 128000;
  const maxCompletionTokens = getCompletionTokenLimit(modelDetails);

  if (requestedTokens > modelMaxTokens) {
    return {
      valid: false,
      error: `Requested tokens (${requestedTokens}) exceed model's context window (${modelMaxTokens}).`,
    };
  }

  if (requestedTokens > maxCompletionTokens) {
    return {
      valid: false,
      error: `Requested tokens (${requestedTokens}) exceed model's completion limit (${maxCompletionTokens}).`,
    };
  }

  return { valid: true };
}

export async function POST(request: NextRequest) {
  const { system, message, model, provider, streamOutput } = (await request.json()) as {
    system: string;
    message: string;
    model: string;
    provider: ProviderInfo;
    streamOutput?: boolean;
  };

  const { name: providerName } = provider;

  if (!model || typeof model !== 'string') {
    return NextResponse.json({ error: 'Invalid or missing model' }, { status: 400 });
  }

  if (!providerName || typeof providerName !== 'string') {
    return NextResponse.json({ error: 'Invalid or missing provider' }, { status: 400 });
  }

  const cookieHeader = request.headers.get('Cookie');
  const apiKeys = getApiKeysFromCookie(cookieHeader);
  const providerSettings = getProviderSettingsFromCookie(cookieHeader);
  const serverEnv = process.env as Record<string, string>;

  if (streamOutput) {
    try {
      const result = await streamText({
        options: { system },
        messages: [{ role: 'user', content: `${message}` }],
        env: serverEnv,
        apiKeys,
        providerSettings,
      });

      return new Response(result.textStream, {
        status: 200,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      });
    } catch (error: unknown) {
      console.log(error);

      if (error instanceof Error && error.message?.includes('API key')) {
        return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
      }

      if (
        error instanceof Error &&
        (error.message?.includes('max_tokens') ||
          error.message?.includes('token') ||
          error.message?.includes('exceeds'))
      ) {
        return NextResponse.json(
          { error: `Token limit error: ${error.message}` },
          { status: 400 },
        );
      }

      return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
  } else {
    try {
      const models = await getModelList({ apiKeys, providerSettings, serverEnv });
      const modelDetails = models.find((m: ModelInfo) => m.name === model);

      if (!modelDetails) {
        return NextResponse.json({ error: 'Model not found' }, { status: 404 });
      }

      const dynamicMaxTokens = getCompletionTokenLimit(modelDetails);
      const validation = validateTokenLimits(modelDetails, dynamicMaxTokens);

      if (!validation.valid) {
        return NextResponse.json({ error: validation.error }, { status: 400 });
      }

      // Get provider from LLMManager instead of empty PROVIDER_LIST
      const llmManager = LLMManager.getInstance(serverEnv);
      const providerInstance = llmManager.getProvider(provider.name);

      if (!providerInstance) {
        return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
      }

      logger.info(`Generating response Provider: ${provider.name}, Model: ${modelDetails.name}`);

      const isReasoning = isReasoningModel(modelDetails.name);
      const tokenParams = isReasoning ? { maxCompletionTokens: dynamicMaxTokens } : { maxTokens: dynamicMaxTokens };

      const baseParams = {
        system,
        messages: [{ role: 'user' as const, content: `${message}` }],
        model: providerInstance.getModelInstance({
          model: modelDetails.name,
          serverEnv,
          apiKeys,
          providerSettings,
        }),
        ...tokenParams,
        toolChoice: 'none' as const,
      };

      const finalParams = isReasoning
        ? { ...baseParams, temperature: 1 }
        : { ...baseParams, temperature: 0 };

      const result = await generateText(finalParams);
      logger.info(`Generated response`);

      return NextResponse.json(result);
    } catch (error: unknown) {
      console.log(error);

      const errorResponse = {
        error: true,
        message: error instanceof Error ? error.message : 'An unexpected error occurred',
        statusCode: (error as any).statusCode || 500,
        isRetryable: (error as any).isRetryable !== false,
        provider: (error as any).provider || 'unknown',
      };

      if (error instanceof Error && error.message?.includes('API key')) {
        return NextResponse.json(
          { ...errorResponse, message: 'Invalid or missing API key', statusCode: 401, isRetryable: false },
          { status: 401 },
        );
      }

      return NextResponse.json(errorResponse, { status: errorResponse.statusCode });
    }
  }
}
