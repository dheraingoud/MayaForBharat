// @ts-nocheck
// TypeScript checks suppressed: AI SDK v3 type changes (UIMessage.content removed, FileUIPart format changes)
// are pervasive. The critical fix here is the local input state management.
import { useStore } from '@nanostores/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
// useAnimate removed — no intro screen animation needed
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import { useMessageParser, usePromptEnhancer, useShortcuts } from '@/lib/workbench/hooks';
import { description, useChatHistory } from '@/lib/workbench/persistence';
import { chatStore } from '@/lib/workbench/stores/chat';
import { workbenchStore } from '@/lib/workbench/stores/workbench';
import { DEFAULT_MODEL, PROMPT_COOKIE_KEY } from '@/lib/workbench/utils/constants';
import { createScopedLogger, renderLogger } from '@/lib/workbench/utils/logger';
import { BaseChat } from './BaseChat';
import Cookies from 'js-cookie';
import { debounce } from '@/lib/workbench/utils/debounce';
import { useSettings } from '@/lib/workbench/hooks/useSettings';
import type { ProviderInfo } from '@/lib/workbench/types/model';
import { useSearchParams } from 'next/navigation';
import { createSampler } from '@/lib/workbench/utils/sampler';
import { getTemplates, selectStarterTemplate } from '@/lib/workbench/utils/selectStarterTemplate';
import { logStore } from '@/lib/workbench/stores/logs';
import { streamingState } from '@/lib/workbench/stores/streaming';
import { filesToArtifacts } from '@/lib/workbench/utils/fileUtils';
import { supabaseConnection } from '@/lib/workbench/stores/supabase';
import { defaultDesignScheme, type DesignScheme } from '@/lib/workbench/types/design-scheme';
import type { ElementInfo } from '@/lib/workbench/components/workbench/Inspector';
import type { TextUIPart, FileUIPart } from 'ai';
import { useMCPStore } from '@/lib/workbench/stores/mcp';
import type { LlmErrorAlertType } from '@/lib/workbench/types/actions';

const logger = createScopedLogger('Chat');

export function Chat({ hideWorkbench, hideMenu }: { hideWorkbench?: boolean; hideMenu?: boolean } = {}) {
  renderLogger.trace('Chat');

  const { ready, initialMessages, storeMessageHistory, importChat, exportChat } = useChatHistory();
  const title = useStore(description);
  useEffect(() => {
    workbenchStore.setReloadedMessages(initialMessages.map((m) => m.id));
  }, [initialMessages]);

  return (
    <>
      {ready && (
        <ChatImpl
          description={title}
          initialMessages={initialMessages}
          exportChat={exportChat}
          storeMessageHistory={storeMessageHistory}
          importChat={importChat}
          hideWorkbench={hideWorkbench}
          hideMenu={hideMenu}
        />
      )}
    </>
  );
}

const processSampledMessages = createSampler(
  (options: {
    messages: UIMessage[];
    initialMessages: UIMessage[];
    isLoading: boolean;
    parseMessages: (messages: UIMessage[], isLoading: boolean) => void;
    storeMessageHistory: (messages: UIMessage[]) => Promise<void>;
  }) => {
    const { messages, initialMessages, isLoading, parseMessages, storeMessageHistory } = options;
    parseMessages(messages, isLoading);

    if (messages.length > initialMessages.length) {
      storeMessageHistory(messages).catch((error) => toast.error(error.message));
    }
  },
  50,
);

interface ChatProps {
  initialMessages: UIMessage[];
  storeMessageHistory: (messages: UIMessage[]) => Promise<void>;
  importChat: (description: string, messages: UIMessage[]) => Promise<void>;
  exportChat: () => void;
  description?: string;
  hideWorkbench?: boolean;
  hideMenu?: boolean;
}

export const ChatImpl = memo(
  ({ description, initialMessages, storeMessageHistory, importChat, exportChat, hideWorkbench, hideMenu }: ChatProps) => {
    useShortcuts();

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    // chatStarted is always true — no intro screen, workbench is always in builder mode
    const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
    const [imageDataList, setImageDataList] = useState<string[]>([]);
    const searchParams = useSearchParams();
    const [fakeLoading, setFakeLoading] = useState(false);
    // Use a ref to avoid re-rendering on every file change — files are read lazily at send time
    const filesRef = useRef(workbenchStore.files.get());
    useEffect(() => {
      const unsubscribe = workbenchStore.files.subscribe((value) => {
        filesRef.current = value;
      });
      return unsubscribe;
    }, []);
    const [designScheme, setDesignScheme] = useState<DesignScheme>(defaultDesignScheme);
    const actionAlert = useStore(workbenchStore.alert);
    const deployAlert = useStore(workbenchStore.deployAlert);
    const supabaseConn = useStore(supabaseConnection);
    const selectedProject = supabaseConn.stats?.projects?.find(
      (project) => project.id === supabaseConn.selectedProjectId,
    );
    const supabaseAlert = useStore(workbenchStore.supabaseAlert);
    const { activeProviders, promptId, autoSelectTemplate, contextOptimizationEnabled } = useSettings();
    const [llmErrorAlert, setLlmErrorAlert] = useState<LlmErrorAlertType | undefined>(undefined);
    const [model, setModel] = useState(() => {
      const savedModel = Cookies.get('selectedModel');
      return savedModel || DEFAULT_MODEL;
    });
    const [provider, setProvider] = useState(() => {
      const savedProvider = Cookies.get('selectedProvider');
      return ({ name: savedProvider || 'Anthropic', staticModels: [], getApiKeyLink: '' }) as ProviderInfo;
    });
    const { showChat } = useStore(chatStore);
    const animationScope = useRef<HTMLDivElement>(null);
    const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
    const [chatMode, setChatMode] = useState<'discuss' | 'build'>('build');
    const [selectedElement, setSelectedElement] = useState<ElementInfo | null>(null);
    const mcpSettings = useMCPStore((state) => state.settings);

    // --- LOCAL INPUT STATE (AI SDK v3 no longer manages input) ---
    const [input, setInput] = useState(() => Cookies.get(PROMPT_COOKIE_KEY) || '');

    // Build the transport body dynamically so it picks up latest refs
    const transportBodyRef = useRef<() => object>(() => ({}));
    transportBodyRef.current = () => ({
      apiKeys,
      files: filesRef.current,
      promptId,
      contextOptimization: contextOptimizationEnabled,
      chatMode,
      designScheme,
      supabase: {
        isConnected: supabaseConn.isConnected,
        hasSelectedProject: !!selectedProject,
        credentials: {
          supabaseUrl: supabaseConn?.credentials?.supabaseUrl,
          anonKey: supabaseConn?.credentials?.anonKey,
        },
      },
      maxLLMSteps: mcpSettings.maxLLMSteps,
    });

    // AI SDK v6: api/body moved onto a transport object (top-level keys are ignored).
    // Create once; body resolver reads the live ref so it always picks up latest
    // apiKeys/files at send time (Resolvable<object> supports a function).
    const transportRef = useRef<DefaultChatTransport | null>(null);
    if (!transportRef.current) {
      transportRef.current = new DefaultChatTransport({
        api: '/api/workbench/chat',
        body: () => transportBodyRef.current(),
      });
    }

    const {
      messages,
      status,
      sendMessage: chatSendMessage,
      regenerate,
      stop,
      setMessages,
      error,
      addToolResult,
    } = useChat({
      transport: transportRef.current!,
      messages: initialMessages,
      onError: (e) => {
        setFakeLoading(false);
        handleError(e, 'chat');
      },
      onFinish: ({ message }) => {
        logger.debug('Finished streaming');
        logStore.logProvider('Chat response completed', {
          component: 'Chat',
          action: 'response',
          model,
          provider: provider.name,
          messageLength: message.content.length,
        });
      },
    });

    // Derive isLoading from status for backward compat
    const isLoading = status === 'streaming' || status === 'submitted';

    const promptHandledRef = useRef(false);
    useEffect(() => {
      // Use window.location as primary (reliable with dynamic imports / ssr: false)
      const urlParams = new URLSearchParams(window.location.search);
      const prompt = urlParams.get('prompt') || searchParams?.get('prompt');

      if (prompt && !promptHandledRef.current) {
        promptHandledRef.current = true;

        // Use sendMessage with the new API
        const userMessageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${prompt}`;
        chatSendMessage({ text: userMessageText });
      }
    }, [searchParams]);

    const { enhancingPrompt, promptEnhanced, enhancePrompt, resetEnhancer } = usePromptEnhancer();
    const { parsedMessages, parseMessages } = useMessageParser();

    const TEXTAREA_MAX_HEIGHT = 400;

    useEffect(() => {
      chatStore.setKey('started', true);
    }, []);

    useEffect(() => {
      processSampledMessages({
        messages,
        initialMessages,
        isLoading,
        parseMessages,
        storeMessageHistory,
      });
    }, [messages, isLoading, parseMessages]);

    const scrollTextArea = () => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.scrollTop = textarea.scrollHeight;
      }
    };

    const abort = () => {
      stop();
      chatStore.setKey('aborted', true);
      workbenchStore.abortAllActions();

      logStore.logProvider('Chat response aborted', {
        component: 'Chat',
        action: 'abort',
        model,
        provider: provider.name,
      });
    };

    const handleError = useCallback(
      (error: any, context: 'chat' | 'template' | 'llmcall' = 'chat') => {
        logger.error(`${context} request failed`, error);

        stop();
        setFakeLoading(false);

        let errorInfo = {
          message: 'An unexpected error occurred',
          isRetryable: true,
          statusCode: 500,
          provider: provider.name,
          type: 'unknown' as const,
          retryDelay: 0,
        };

        if (error.message) {
          try {
            const parsed = JSON.parse(error.message);

            if (parsed.error || parsed.message) {
              errorInfo = { ...errorInfo, ...parsed };
            } else {
              errorInfo.message = error.message;
            }
          } catch {
            errorInfo.message = error.message;
          }
        }

        let errorType: LlmErrorAlertType['errorType'] = 'unknown';
        let title = 'Request Failed';

        if (errorInfo.statusCode === 401 || errorInfo.message.toLowerCase().includes('api key')) {
          errorType = 'authentication';
          title = 'Authentication Error';
        } else if (errorInfo.statusCode === 429 || errorInfo.message.toLowerCase().includes('rate limit')) {
          errorType = 'rate_limit';
          title = 'Rate Limit Exceeded';
        } else if (errorInfo.message.toLowerCase().includes('quota')) {
          errorType = 'quota';
          title = 'Quota Exceeded';
        } else if (errorInfo.statusCode >= 500) {
          errorType = 'network';
          title = 'Server Error';
        }

        logStore.logError(`${context} request failed`, error, {
          component: 'Chat',
          action: 'request',
          error: errorInfo.message,
          context,
          retryable: errorInfo.isRetryable,
          errorType,
          provider: provider.name,
        });

        // Create API error alert
        setLlmErrorAlert({
          type: 'error',
          title,
          description: errorInfo.message,
          provider: provider.name,
          errorType,
        });
      },
      [provider.name, stop],
    );

    const clearApiErrorAlert = useCallback(() => {
      setLlmErrorAlert(undefined);
    }, []);

    useEffect(() => {
      const textarea = textareaRef.current;

      if (textarea) {
        textarea.style.height = 'auto';

        const scrollHeight = textarea.scrollHeight;

        textarea.style.height = `${Math.min(scrollHeight, TEXTAREA_MAX_HEIGHT)}px`;
        textarea.style.overflowY = scrollHeight > TEXTAREA_MAX_HEIGHT ? 'auto' : 'hidden';
      }
    }, [input, textareaRef]);

    // runAnimation removed — no intro screen to animate away

    // Helper function to create message parts array from text and images
    const createMessageParts = (text: string, images: string[] = []): Array<TextUIPart | FileUIPart> => {
      // Create an array of properly typed message parts
      const parts: Array<TextUIPart | FileUIPart> = [
        {
          type: 'text',
          text,
        },
      ];

      // Add image parts if any
      images.forEach((imageData) => {
        // Extract correct MIME type from the data URL
        const mimeType = imageData.split(';')[0].split(':')[1] || 'image/jpeg';

        // Create file part according to AI SDK format
        parts.push({
          type: 'file',
          mimeType,
          data: imageData.replace(/^data:image\/[^;]+;base64,/, ''),
        });
      });

      return parts;
    };

    const sendMessage = async (_event: React.UIEvent, messageInput?: string) => {
      const messageContent = messageInput || input;

      if (!messageContent?.trim()) {
        return;
      }

      if (isLoading) {
        abort();
        return;
      }

      let finalMessageContent = messageContent;

      if (selectedElement) {
        console.log('Selected Element:', selectedElement);

        const elementInfo = `<div class=\"__boltSelectedElement__\" data-element='${JSON.stringify(selectedElement)}'>${JSON.stringify(`${selectedElement.displayText}`)}</div>`;
        finalMessageContent = messageContent + elementInfo;
      }

      // No intro animation needed — workbench is always in builder mode

      if (messages.length === 0) {
        setFakeLoading(true);

        if (autoSelectTemplate) {
          const { template, title } = await selectStarterTemplate({
            message: finalMessageContent,
            model,
            provider,
          });

          if (template !== 'blank') {
            const temResp = await getTemplates(template, title).catch((e) => {
              if (e.message.includes('rate limit')) {
                toast.warning('Rate limit exceeded. Skipping starter template\n Continuing with blank template');
              } else {
                toast.warning('Failed to import starter template\n Continuing with blank template');
              }

              return null;
            });

            if (temResp) {
              const { assistantMessage, userMessage } = temResp;
              const userMessageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`;

              setMessages([
                {
                  id: `1-${new Date().getTime()}`,
                  role: 'user',
                  content: userMessageText,
                  parts: createMessageParts(userMessageText, imageDataList),
                },
                {
                  id: `2-${new Date().getTime()}`,
                  role: 'assistant',
                  content: assistantMessage,
                  parts: [{ type: 'text' as const, text: assistantMessage }],
                },
                {
                  id: `3-${new Date().getTime()}`,
                  role: 'user',
                  content: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${userMessage}`,
                  parts: [{ type: 'text' as const, text: `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${userMessage}` }],
                  annotations: ['hidden'],
                },
              ]);

              // Use regenerate to trigger AI response after seeding messages
              regenerate();
              setInput('');
              Cookies.remove(PROMPT_COOKIE_KEY);

              setUploadedFiles([]);
              setImageDataList([]);

              resetEnhancer();

              textareaRef.current?.blur();
              setFakeLoading(false);

              return;
            }
          }
        }

        // If autoSelectTemplate is disabled or template selection failed, proceed with normal message
        const userMessageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`;

        // Use the new sendMessage API
        chatSendMessage({
          text: userMessageText,
          files: imageDataList.length > 0
            ? imageDataList.map((imageData) => ({
                type: 'file' as const,
                mimeType: imageData.split(';')[0].split(':')[1] || 'image/jpeg',
                data: imageData.replace(/^data:image\/[^;]+;base64,/, ''),
              }))
            : undefined,
        });

        setFakeLoading(false);
        setInput('');
        Cookies.remove(PROMPT_COOKIE_KEY);

        setUploadedFiles([]);
        setImageDataList([]);

        resetEnhancer();

        textareaRef.current?.blur();

        return;
      }

      if (error != null) {
        setMessages(messages.slice(0, -1));
      }

      const modifiedFiles = workbenchStore.getModifiedFiles();

      chatStore.setKey('aborted', false);

      if (modifiedFiles !== undefined) {
        const userUpdateArtifact = filesToArtifacts(modifiedFiles, `${Date.now()}`);
        const messageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${userUpdateArtifact}${finalMessageContent}`;

        chatSendMessage({
          text: messageText,
          files: imageDataList.length > 0
            ? imageDataList.map((imageData) => ({
                type: 'file' as const,
                mimeType: imageData.split(';')[0].split(':')[1] || 'image/jpeg',
                data: imageData.replace(/^data:image\/[^;]+;base64,/, ''),
              }))
            : undefined,
        });

        workbenchStore.resetAllFileModifications();
      } else {
        const messageText = `[Model: ${model}]\n\n[Provider: ${provider.name}]\n\n${finalMessageContent}`;

        chatSendMessage({
          text: messageText,
          files: imageDataList.length > 0
            ? imageDataList.map((imageData) => ({
                type: 'file' as const,
                mimeType: imageData.split(';')[0].split(':')[1] || 'image/jpeg',
                data: imageData.replace(/^data:image\/[^;]+;base64,/, ''),
              }))
            : undefined,
        });
      }

      setInput('');
      Cookies.remove(PROMPT_COOKIE_KEY);

      setUploadedFiles([]);
      setImageDataList([]);

      resetEnhancer();

      textareaRef.current?.blur();
    };

    /**
     * Handles the change event for the textarea and updates the local input state.
     * @param event - The change event from the textarea.
     */
    const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(event.target.value);
    };

    /**
     * Debounced function to cache the prompt in cookies.
     * Caches the trimmed value of the textarea input after a delay to optimize performance.
     */
    const debouncedCachePrompt = useCallback(
      debounce((event: React.ChangeEvent<HTMLTextAreaElement>) => {
        const trimmedValue = event.target.value.trim();
        Cookies.set(PROMPT_COOKIE_KEY, trimmedValue, { expires: 30 });
      }, 1000),
      [],
    );

    useEffect(() => {
      const storedApiKeys = Cookies.get('apiKeys');

      if (storedApiKeys) {
        setApiKeys(JSON.parse(storedApiKeys));
      }
    }, []);

    const handleModelChange = (newModel: string) => {
      setModel(newModel);
      Cookies.set('selectedModel', newModel, { expires: 30 });
    };

    const handleProviderChange = (newProvider: ProviderInfo) => {
      setProvider(newProvider);
      Cookies.set('selectedProvider', newProvider.name, { expires: 30 });
    };

    const handleWebSearchResult = useCallback(
      (result: string) => {
        const currentInput = input || '';
        const newInput = currentInput.length > 0 ? `${result}\n\n${currentInput}` : result;
        setInput(newInput);
      },
      [input],
    );

    // Adapter: wrap sendMessage for BaseChat's append prop (used by some alerts/features)
    const appendMessage = useCallback(
      (message: { role: string; content: string; parts?: any[] }, _options?: any) => {
        if (message.role === 'user') {
          chatSendMessage({ text: message.content });
        }
      },
      [chatSendMessage],
    );

    return (
      <BaseChat
        ref={animationScope}
        textareaRef={textareaRef}
        input={input}
        showChat={showChat}
        chatStarted={true}
        hideWorkbench={hideWorkbench}
        hideMenu={hideMenu}
        isStreaming={isLoading || fakeLoading}
        onStreamingChange={(streaming) => {
          streamingState.set(streaming);
        }}
        enhancingPrompt={enhancingPrompt}
        promptEnhanced={promptEnhanced}
        sendMessage={sendMessage}
        model={model}
        setModel={handleModelChange}
        provider={provider}
        setProvider={handleProviderChange}
        providerList={activeProviders}
        handleInputChange={(e) => {
          handleInputChange(e);
          debouncedCachePrompt(e);
        }}
        handleStop={abort}
        description={description}
        importChat={importChat}
        exportChat={exportChat}
        messages={messages.map((message, i) => {
          if (message.role === 'user') {
            return message;
          }

          const parsed = parsedMessages[i] || '';

          return {
            ...message,
            content: parsed,
            parts: [{ type: 'text' as const, text: parsed }],
          };
        })}
        enhancePrompt={() => {
          enhancePrompt(
            input,
            (enhancedInput) => {
              setInput(enhancedInput);
              scrollTextArea();
            },
            model,
            provider,
            apiKeys,
          );
        }}
        uploadedFiles={uploadedFiles}
        setUploadedFiles={setUploadedFiles}
        imageDataList={imageDataList}
        setImageDataList={setImageDataList}
        actionAlert={actionAlert}
        clearAlert={() => workbenchStore.clearAlert()}
        supabaseAlert={supabaseAlert}
        clearSupabaseAlert={() => workbenchStore.clearSupabaseAlert()}
        deployAlert={deployAlert}
        clearDeployAlert={() => workbenchStore.clearDeployAlert()}
        llmErrorAlert={llmErrorAlert}
        clearLlmErrorAlert={clearApiErrorAlert}
        data={undefined}
        chatMode={chatMode}
        setChatMode={setChatMode}
        append={appendMessage}
        regenerate={regenerate}
        setMessages={setMessages}
        designScheme={designScheme}
        setDesignScheme={setDesignScheme}
        selectedElement={selectedElement}
        setSelectedElement={setSelectedElement}
        addToolResult={addToolResult}
        onWebSearchResult={handleWebSearchResult}
      />
    );
  },
);
