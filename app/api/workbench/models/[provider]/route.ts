// Dynamic route: /api/workbench/models/[provider]
// Returns model list for a specific provider

import { NextRequest, NextResponse } from 'next/server';
import { LLMManager } from '@/lib/workbench/llm/manager';
import type { ModelInfo } from '@/lib/workbench/llm/types';
import type { IProviderSetting } from '@/lib/workbench/types/model';

export const dynamic = 'force-dynamic';

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider: providerName } = await params;
  const llmManager = LLMManager.getInstance(process.env as Record<string, string>);

  const cookieHeader = request.headers.get('Cookie') || '';
  const cookies = parseCookies(cookieHeader);

  let apiKeys: Record<string, string> = {};
  let providerSettings: Record<string, IProviderSetting> = {};

  try {
    apiKeys = JSON.parse(cookies.apiKeys || '{}');
  } catch { /* ignore parse errors */ }

  try {
    providerSettings = JSON.parse(cookies.providers || '{}');
  } catch { /* ignore parse errors */ }

  const provider = llmManager.getProvider(decodeURIComponent(providerName));

  if (!provider) {
    return NextResponse.json({ modelList: [] });
  }

  let modelList: ModelInfo[] = [];

  try {
    modelList = await llmManager.getModelListFromProvider(provider, {
      apiKeys,
      providerSettings,
      serverEnv: process.env as Record<string, string>,
    });
  } catch (error) {
    console.error(`Error getting models for ${providerName}:`, error);
    modelList = provider.staticModels || [];
  }

  return NextResponse.json({ modelList });
}
