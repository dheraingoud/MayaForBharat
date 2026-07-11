// Source: bolt.diy/app/routes/api.configured-providers.ts
// Ported: Remix → Next.js route handler

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import { LLMManager } from '@/lib/workbench/llm/manager';
import { LOCAL_PROVIDERS } from '@/lib/workbench/stores/provider-constants';

interface ConfiguredProvider {
  name: string;
  isConfigured: boolean;
  configMethod: 'environment' | 'none';
}

/**
 * API endpoint that detects which providers are configured via environment variables
 * This helps auto-enable providers that have been set up by the user
 */
export async function GET(request: NextRequest) {
  try {
    const llmManager = LLMManager.getInstance(process.env as any);
    const configuredProviders: ConfiguredProvider[] = [];

    for (const providerName of LOCAL_PROVIDERS) {
      const providerInstance = llmManager.getProvider(providerName);
      let isConfigured = false;
      let configMethod: 'environment' | 'none' = 'none';

      if (providerInstance) {
        const config = providerInstance.config;

        if (config.baseUrlKey) {
          const baseUrlEnvVar = config.baseUrlKey;
          const envBaseUrl =
            (process.env as Record<string, any>)?.[baseUrlEnvVar] ||
            process.env[baseUrlEnvVar] ||
            llmManager.env[baseUrlEnvVar];

          const isValidEnvValue =
            envBaseUrl &&
            typeof envBaseUrl === 'string' &&
            envBaseUrl.trim().length > 0 &&
            !envBaseUrl.includes('your_') &&
            !envBaseUrl.includes('_here') &&
            envBaseUrl.startsWith('http');

          if (isValidEnvValue) {
            isConfigured = true;
            configMethod = 'environment';
          }
        }

        if (config.apiTokenKey && !isConfigured) {
          const apiTokenEnvVar = config.apiTokenKey;
          const envApiToken =
            (process.env as Record<string, any>)?.[apiTokenEnvVar] ||
            process.env[apiTokenEnvVar] ||
            llmManager.env[apiTokenEnvVar];

          const isValidApiToken =
            envApiToken &&
            typeof envApiToken === 'string' &&
            envApiToken.trim().length > 0 &&
            !envApiToken.includes('your_') &&
            !envApiToken.includes('_here') &&
            envApiToken.length > 10;

          if (isValidApiToken) {
            isConfigured = true;
            configMethod = 'environment';
          }
        }
      }

      configuredProviders.push({
        name: providerName,
        isConfigured,
        configMethod,
      });
    }

    return NextResponse.json({ providers: configuredProviders });
  } catch (error) {
    console.error('Error detecting configured providers:', error);

    return NextResponse.json({
      providers: LOCAL_PROVIDERS.map((name) => ({
        name,
        isConfigured: false,
        configMethod: 'none' as const,
      })),
    });
  }
}
