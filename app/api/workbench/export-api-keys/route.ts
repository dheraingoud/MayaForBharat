// Source: bolt.diy/app/routes/api.export-api-keys.ts
// Ported: Remix → Next.js route handler

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import { LLMManager } from '@/lib/workbench/llm/manager';
import { getApiKeysFromCookie } from '@/lib/workbench/api/cookies';

// Remix loader converted to GET handler
export async function GET(request: NextRequest) {
  // Get API keys from cookie
  const cookieHeader = request.headers.get('Cookie');
  const apiKeysFromCookie = getApiKeysFromCookie(cookieHeader);

  // Initialize the LLM manager to access environment variables
  const llmManager = LLMManager.getInstance(process.env as any);

  // Get all provider instances to find their API token keys
  const providers = llmManager.getAllProviders();

  // Create a comprehensive API keys object
  const apiKeys: Record<string, string> = { ...apiKeysFromCookie };

  // For each provider, check all possible sources for API keys
  for (const provider of providers) {
    if (!provider.config.apiTokenKey) {
      continue;
    }

    const envVarName = provider.config.apiTokenKey;

    // Skip if we already have this provider's key from cookies
    if (apiKeys[provider.name]) {
      continue;
    }

    // Check environment variables in order of precedence
    const envValue =
      (process.env as Record<string, any>)?.[envVarName] ||
      process.env[envVarName] ||
      llmManager.env[envVarName];

    if (envValue) {
      apiKeys[provider.name] = envValue;
    }
  }

  return Response.json(apiKeys);
};
