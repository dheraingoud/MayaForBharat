// @ts-nocheck
// Source: bolt.diy/app/routes/api.models.$provider.ts
// Ported: provider-specific model listing

import { NextRequest, NextResponse } from 'next/server';
export const dynamic = 'force-dynamic';

import { LLMManager } from '@/lib/workbench/llm/manager';

const llmManager = LLMManager.getInstance(process.env as any);

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const provider = url.searchParams.get('provider') || '';
    
    const providerObj = llmManager.getProvider(provider);
    if (!providerObj) {
      return NextResponse.json({ error: 'Provider not found' }, { status: 404 });
    }

    const staticModels = providerObj.staticModels || [];
    let dynamicModels: any[] = [];
    
    try {
      dynamicModels = await providerObj.getDynamicModels?.(
        providerObj.config,
        process.env,
        providerObj.config,
      ) || [];
    } catch (e) {
      console.warn('Failed to load dynamic models for', provider, e);
    }

    return NextResponse.json({ models: [...staticModels, ...dynamicModels] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}