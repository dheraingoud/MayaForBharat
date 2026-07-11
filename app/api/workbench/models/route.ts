// Source: bolt.diy/app/routes/api.models.ts
// Ported: Remix loader → Next.js GET route handler
// Ported: process.env → process.env

import { NextRequest, NextResponse } from 'next/server';
import { LLMManager } from '@/lib/workbench/llm/manager';
import type { ModelInfo } from '@/lib/workbench/llm/types';
import type { ProviderInfo, IProviderSetting } from '@/lib/workbench/types/model';

export const dynamic = 'force-dynamic';

interface ModelsResponse {
  modelList: ModelInfo[];
  providers: ProviderInfo[];
  defaultProvider: ProviderInfo;
}

let cachedProviders: ProviderInfo[] | null = null;
let cachedDefaultProvider: ProviderInfo | null = null;

function parseCookies(cookieHeader: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  cookieHeader.split(';').map((c) => c.trim()).forEach((item) => {
    const [name, ...rest] = item.split('=');
    if (name && rest) {
      cookies[decodeURIComponent(name.trim())] = decodeURIComponent(rest.join('=').trim());
    }
  });
  return cookies;
}

function getProviderInfo(llmManager: LLMManager) {
  if (!cachedProviders) {
    cachedProviders = llmManager.getAllProviders().map((provider) => ({
      name: provider.name,
      staticModels: provider.staticModels,
      getApiKeyLink: provider.getApiKeyLink,
      labelForGetApiKey: provider.labelForGetApiKey,
      icon: provider.icon,
    }));
  }

  if (!cachedDefaultProvider) {
    const defaultProvider = llmManager.getDefaultProvider();
    cachedDefaultProvider = {
      name: defaultProvider.name,
      staticModels: defaultProvider.staticModels,
      getApiKeyLink: defaultProvider.getApiKeyLink,
      labelForGetApiKey: defaultProvider.labelForGetApiKey,
      icon: defaultProvider.icon,
    };
  }

  return { providers: cachedProviders, defaultProvider: cachedDefaultProvider };
}

export async function GET(request: NextRequest) {
  const llmManager = LLMManager.getInstance(process.env as Record<string, string>);

  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = parseCookies(cookieHeader);

  let apiKeys: Record<string, string> = {};
  let providerSettings: Record<string, IProviderSetting> = {};

  try { apiKeys = JSON.parse(cookies.apiKeys || '{}'); } catch { /* ignore */ }
  try { providerSettings = JSON.parse(cookies.providers || '{}'); } catch { /* ignore */ }

  const { providers, defaultProvider } = getProviderInfo(llmManager);

  const { searchParams } = new URL(request.url);
  const providerName = searchParams.get('provider');

  let modelList: ModelInfo[] = [];

  if (providerName) {
    const provider = llmManager.getProvider(providerName);

    if (provider) {
      modelList = await llmManager.getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv: process.env as Record<string, string>,
      });
    }
  } else {
    modelList = await llmManager.updateModelList({
      apiKeys,
      providerSettings,
      serverEnv: process.env as Record<string, string>,
    });
  }

  return NextResponse.json<ModelsResponse>({
    modelList,
    providers,
    defaultProvider,
  });
}
