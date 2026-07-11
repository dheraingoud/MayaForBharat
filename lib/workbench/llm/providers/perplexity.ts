import { BaseProvider } from '@/lib/workbench/llm/base-provider';
import type { ModelInfo } from '@/lib/workbench/llm/types';
import type { IProviderSetting } from '@/lib/workbench/types/model';
import type { LanguageModel } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

export default class PerplexityProvider extends BaseProvider {
  name = 'Perplexity';
  getApiKeyLink = 'https://www.perplexity.ai/settings/api';

  config = {
    apiTokenKey: 'PERPLEXITY_API_KEY',
  };

  staticModels: ModelInfo[] = [
    {
      name: 'sonar',
      label: 'Sonar',
      provider: 'Perplexity',
      maxTokenAllowed: 8192,
    },
    {
      name: 'sonar-pro',
      label: 'Sonar Pro',
      provider: 'Perplexity',
      maxTokenAllowed: 8192,
    },
    {
      name: 'sonar-reasoning-pro',
      label: 'Sonar Reasoning Pro',
      provider: 'Perplexity',
      maxTokenAllowed: 8192,
    },
  ];

  getModelInstance(options: {
    model: string;
    serverEnv: Record<string, string>;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModel {
    const { model, serverEnv, apiKeys, providerSettings } = options;

    const { apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: '',
      defaultApiTokenKey: 'PERPLEXITY_API_KEY',
    });

    if (!apiKey) {
      throw new Error(`Missing API key for ${this.name} provider`);
    }

    const perplexity = createOpenAI({
      baseURL: 'https://api.perplexity.ai/',
      apiKey,
    });

    return perplexity(model);
  }
}
