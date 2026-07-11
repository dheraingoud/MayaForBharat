// Source: bolt.diy/app/lib/.server/llm/stream-text.ts
// Ported: ~/lib → @/lib/workbench, ~/utils → @/lib/workbench/utils
// Ported: Env (Cloudflare) → Record<string, string>
// Ported: DEFAULT_PROVIDER from LLMManager (lazy init)

import { convertToModelMessages, streamText as _streamText, type UIMessage } from 'ai';
import { MAX_TOKENS, PROVIDER_COMPLETION_LIMITS, isReasoningModel, type FileMap } from './constants';
import { DEFAULT_MODEL, MODIFICATIONS_TAG_NAME, WORK_DIR } from '@/lib/workbench/utils/constants';
import type { IProviderSetting } from '@/lib/workbench/types/model';
import { PromptLibrary } from '@/lib/workbench/prompts/prompt-library';
import { allowedHTMLElements } from '@/lib/workbench/utils/markdown';
import { LLMManager } from '@/lib/workbench/llm/manager';
import { createScopedLogger } from '@/lib/workbench/utils/logger';
import { createFilesContext, extractPropertiesFromMessage } from './utils';
import { discussPrompt } from '@/lib/workbench/prompts/discuss-prompt';
import type { DesignScheme } from '@/lib/workbench/types/design-scheme';

export type Messages = UIMessage[];

export interface StreamingOptions extends Omit<Parameters<typeof _streamText>[0], 'model'> {
  supabaseConnection?: {
    isConnected: boolean;
    hasSelectedProject: boolean;
    credentials?: {
      anonKey?: string;
      supabaseUrl?: string;
    };
  };
}

const logger = createScopedLogger('stream-text');

function getCompletionTokenLimit(modelDetails: any): number {
  if (modelDetails.maxCompletionTokens && modelDetails.maxCompletionTokens > 0) {
    return modelDetails.maxCompletionTokens;
  }

  const providerDefault = PROVIDER_COMPLETION_LIMITS[modelDetails.provider];

  if (providerDefault) {
    return providerDefault;
  }

  return Math.min(MAX_TOKENS, 16384);
}

function sanitizeText(text: string): string {
  let sanitized = text.replace(/<div class=\\\\"__boltThought__\\\\">(.*?)<\/div>/s, '');
  sanitized = sanitized.replace(/<think>.*?<\/think>/s, '');
  sanitized = sanitized.replace(/<boltAction type="file" filePath="package-lock\.json">[\s\S]*?<\/boltAction>/g, '');

  return sanitized.trim();
}

export async function streamText(props: {
  messages: Omit<UIMessage, 'id'>[];
  env?: Record<string, string>;
  options?: StreamingOptions;
  apiKeys?: Record<string, string>;
  files?: FileMap;
  providerSettings?: Record<string, IProviderSetting>;
  promptId?: string;
  contextOptimization?: boolean;
  contextFiles?: FileMap;
  summary?: string;
  messageSliceId?: number;
  chatMode?: 'discuss' | 'build';
  designScheme?: DesignScheme;
}) {
  const {
    messages,
    env: serverEnv,
    options,
    apiKeys,
    files,
    providerSettings,
    promptId,
    contextOptimization,
    contextFiles,
    summary,
    chatMode,
    designScheme,
  } = props;

  const llmManager = LLMManager.getInstance(serverEnv);
  const allProviders = llmManager.getAllProviders();
  const defaultProvider = llmManager.getDefaultProvider();

  let currentModel = DEFAULT_MODEL;
  let currentProvider = defaultProvider.name;

  let processedMessages = messages.map((message) => {
    const newMessage = { ...message };

    if (message.role === 'user') {
      const { model, provider, content } = extractPropertiesFromMessage(message);
      currentModel = model;
      currentProvider = provider;
      (newMessage as any).content = sanitizeText(content);
    } else if (message.role == 'assistant') {
      (newMessage as any).content = sanitizeText(String((message as any).content || ''));
    }

    if (Array.isArray((message as any).parts)) {
      (newMessage as any).parts = (message as any).parts.map((part: any) =>
        part.type === 'text' ? { ...part, text: sanitizeText(part.text) } : part,
      );
    }

    return newMessage;
  });

  const provider = allProviders.find((p) => p.name === currentProvider) || defaultProvider;

  // Strip AI SDK provider prefixes from model name (e.g. "nvidia-nim/deepseek-ai/..." → "deepseek-ai/...")
  // These can sneak in from cookies or stale message tags
  currentModel = currentModel.replace(/^nvidia-nim\//i, '');

  const staticModels = llmManager.getStaticModelListFromProvider(provider);
  let modelDetails = staticModels.find((m) => m.name === currentModel);

  if (!modelDetails) {
    const modelsList = [
      ...(provider.staticModels || []),
      ...(await llmManager.getModelListFromProvider(provider, {
        apiKeys,
        providerSettings,
        serverEnv: serverEnv as any,
      })),
    ];

    if (!modelsList.length) {
      throw new Error(`No models found for provider ${provider.name}`);
    }

    modelDetails = modelsList.find((m) => m.name === currentModel);

    if (!modelDetails) {
      if (provider.name === 'Google' && currentModel.includes('2.5')) {
        throw new Error(
          `Model "${currentModel}" not found. Available Gemini models include: gemini-1.5-pro, gemini-2.0-flash, gemini-1.5-flash. Please select a valid model.`,
        );
      }

      logger.warn(
        `MODEL [${currentModel}] not found in provider [${provider.name}]. Falling back to first model. ${modelsList[0].name}`,
      );
      modelDetails = modelsList[0];
    }
  }

  const dynamicMaxTokens = modelDetails ? getCompletionTokenLimit(modelDetails) : Math.min(MAX_TOKENS, 16384);
  const safeMaxTokens = dynamicMaxTokens;

  logger.info(
    `Token limits for model ${modelDetails.name}: maxTokens=${safeMaxTokens}, maxTokenAllowed=${modelDetails.maxTokenAllowed}, maxCompletionTokens=${modelDetails.maxCompletionTokens}`,
  );

  let systemPrompt =
    PromptLibrary.getPromptFromLibrary(promptId || 'default', {
      cwd: WORK_DIR,
      allowedHtmlElements: allowedHTMLElements,
      modificationTagName: MODIFICATIONS_TAG_NAME,
      designScheme,
      supabase: {
        isConnected: options?.supabaseConnection?.isConnected || false,
        hasSelectedProject: options?.supabaseConnection?.hasSelectedProject || false,
        credentials: options?.supabaseConnection?.credentials || undefined,
      },
    }) ?? '';

  if (chatMode === 'build' && contextFiles) {
    const codeContext = createFilesContext(contextFiles, true);

    systemPrompt = `${systemPrompt}

    Below is the artifact containing the context loaded into context buffer for you to have knowledge of and might need changes to fulfill current user request.
    CONTEXT BUFFER:
    ---
    ${codeContext}
    ---
    `;

    // Only apply summarization/message slicing when contextOptimization is enabled
    if (contextOptimization && summary) {
      systemPrompt = `${systemPrompt}
      below is the chat history till now
      CHAT SUMMARY:
      ---
      ${props.summary}
      ---
      `;

      if (props.messageSliceId) {
        processedMessages = processedMessages.slice(props.messageSliceId);
      } else {
        const lastMessage = processedMessages.pop();

        if (lastMessage) {
          processedMessages = [lastMessage];
        }
      }
    }
  }

  const effectiveLockedFilePaths = new Set<string>();

  if (files) {
    for (const [filePath, fileDetails] of Object.entries(files)) {
      if (fileDetails?.isLocked) {
        effectiveLockedFilePaths.add(filePath);
      }
    }
  }

  if (effectiveLockedFilePaths.size > 0) {
    const lockedFilesListString = Array.from(effectiveLockedFilePaths)
      .map((filePath) => `- ${filePath}`)
      .join('\n');
    systemPrompt = `${systemPrompt}

    IMPORTANT: The following files are locked and MUST NOT be modified in any way. Do not suggest or make any changes to these files:
    ${lockedFilesListString}
    ---
    `;
  }

  logger.info(`Sending llm call to ${provider.name} with model ${modelDetails.name}`);

  const isReasoning = isReasoningModel(modelDetails.name);
  logger.info(
    `Model "${modelDetails.name}" is reasoning model: ${isReasoning}, using ${isReasoning ? 'maxCompletionTokens' : 'maxTokens'}: ${safeMaxTokens}`,
  );

  const tokenParams = isReasoning ? { maxCompletionTokens: safeMaxTokens } : { maxTokens: safeMaxTokens };

  // Keys that must NEVER leak from options into streamText params
  const RESERVED_KEYS = new Set([
    'messages', 'model', 'system', 'maxTokens', 'maxCompletionTokens',
    // Also strip sampling params for reasoning models
    ...(isReasoning ? ['temperature', 'topP', 'presencePenalty', 'frequencyPenalty', 'logprobs', 'topLogprobs', 'logitBias'] : []),
  ]);

  const safeOptions = options
    ? Object.fromEntries(Object.entries(options).filter(([key]) => !RESERVED_KEYS.has(key)))
    : {};

  // Build the final model messages array — MUST be awaited (returns Promise in AI SDK v6)
  const modelMessages = await convertToModelMessages(processedMessages as any);

  // For NIM reasoning models, we don't use providerOptions (NIM uses extra_body)
  // The createOpenAI provider handles this via the NIM API's own parameters

  const streamParams = {
    ...safeOptions,
    model: provider.getModelInstance({
      model: modelDetails.name,
      serverEnv,
      apiKeys,
      providerSettings,
    }),
    system: chatMode === 'build' ? systemPrompt : discussPrompt(),
    ...tokenParams,
    ...(isReasoning ? { temperature: 1 } : {}),
    // messages LAST — must never be overwritten
    messages: modelMessages,
  };

  return await _streamText(streamParams);
}
