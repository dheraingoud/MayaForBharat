/**
 * MAYA NIM Provider — bolt.diy-compatible wrapper around nim-router.ts
 *
 * This is a THIN WRAPPER. All the intelligence lives in nim-router.ts:
 * - Model catalog + token limits
 * - Key rotation with 429-awareness
 * - Plug-and-play model resolution
 * - MAYA tier mapping
 *
 * This file just adapts it to bolt.diy's BaseProvider interface so it
 * appears as "NvidiaNIM" in the 22-provider registry. The other 21
 * providers are completely untouched.
 */

import { BaseProvider } from '@/lib/workbench/llm/base-provider';
import type { ModelInfo } from '@/lib/workbench/llm/types';
import type { IProviderSetting } from '@/lib/workbench/types/model';
import type { LanguageModel } from 'ai';
import {
  NIM_BASE_URL,
  NIM_PROVIDER_NAME,
  nimRotator,
  getStaticModels,
  createNimModel,
  discoverNimModels,
} from '@/lib/workbench/llm/nim-router';

export default class NvidiaNIMProvider extends BaseProvider {
  name = NIM_PROVIDER_NAME;
  getApiKeyLink = 'https://build.nvidia.com/explore/discover';
  labelForGetApiKey = 'Get NVIDIA API Key';
  icon = 'i-ph:gpu';

  config = {
    baseUrlKey: 'NVIDIA_NIM_BASE_URL',
    apiTokenKey: 'NVIDIA_API_KEY_1',
    baseUrl: NIM_BASE_URL,
  };

  // Delegate to nim-router for the full static model list
  staticModels: ModelInfo[] = getStaticModels();

  /**
   * Dynamic model discovery — delegate to nim-router.
   */
  async getDynamicModels(
    apiKeys?: Record<string, string>,
    settings?: IProviderSetting,
    serverEnv?: Record<string, string>,
  ): Promise<ModelInfo[]> {
    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: settings,
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: 'NVIDIA_NIM_BASE_URL',
      defaultApiTokenKey: 'NVIDIA_API_KEY_1',
    });

    return discoverNimModels(apiKey, baseUrl);
  }

  /**
   * Create an AI SDK LanguageModel — delegate to nim-router.
   * Key rotation + 429 handling happens inside createNimModel().
   */
  getModelInstance(options: {
    model: string;
    serverEnv?: Record<string, string>;
    apiKeys?: Record<string, string>;
    providerSettings?: Record<string, IProviderSetting>;
  }): LanguageModel {
    const { model, apiKeys, providerSettings, serverEnv } = options;

    const { baseUrl, apiKey } = this.getProviderBaseUrlAndKey({
      apiKeys,
      providerSettings: providerSettings?.[this.name],
      serverEnv: serverEnv as any,
      defaultBaseUrlKey: 'NVIDIA_NIM_BASE_URL',
      defaultApiTokenKey: 'NVIDIA_API_KEY_1',
    });

    return createNimModel(model, apiKey, baseUrl);
  }
}

// Re-export router essentials for direct access
export { nimRotator } from '@/lib/workbench/llm/nim-router';
