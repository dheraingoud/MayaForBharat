import React from 'react';
import { ClientOnly } from '@/lib/workbench/components/ui/ClientOnly';
import { classNames } from '@/lib/workbench/utils/classNames';

import { ModelSelector } from '@/lib/workbench/components/chat/ModelSelector';
import { APIKeyManager } from './APIKeyManager';
import { LOCAL_PROVIDERS } from '@/lib/workbench/stores/settings';
import FilePreview from './FilePreview';
import { ScreenshotStateManager } from './ScreenshotStateManager';
import { SendButton } from './SendButton.client';
import { IconButton } from '@/lib/workbench/components/ui/IconButton';
import type { ProviderInfo } from '@/lib/workbench/types/model';
import type { DesignScheme } from '@/lib/workbench/types/design-scheme';
import type { ElementInfo } from '@/lib/workbench/components/workbench/Inspector';

interface ChatBoxProps {
  isModelSettingsCollapsed: boolean;
  setIsModelSettingsCollapsed: (collapsed: boolean) => void;
  provider: any;
  providerList: any[];
  modelList: any[];
  apiKeys: Record<string, string>;
  isModelLoading: string | undefined;
  onApiKeysChange: (providerName: string, apiKey: string) => void;
  uploadedFiles: File[];
  imageDataList: string[];
  textareaRef: React.RefObject<HTMLTextAreaElement> | undefined;
  input: string;
  handlePaste: (e: React.ClipboardEvent) => void;
  TEXTAREA_MIN_HEIGHT: number;
  TEXTAREA_MAX_HEIGHT: number;
  isStreaming: boolean;
  /** vercel ChatStatus enum — drives the 4-state submit button. Omitted →
   *  SendButton falls back to the legacy isStreaming boolean. */
  status?: 'ready' | 'submitted' | 'streaming' | 'error';
  handleSendMessage: (event: React.UIEvent, messageInput?: string) => void;
  isListening: boolean;
  startListening: () => void;
  stopListening: () => void;
  chatStarted: boolean;
  exportChat?: () => void;
  qrModalOpen: boolean;
  setQrModalOpen: (open: boolean) => void;
  handleFileUpload: () => void;
  setProvider?: ((provider: ProviderInfo) => void) | undefined;
  model?: string | undefined;
  setModel?: ((model: string) => void) | undefined;
  setUploadedFiles?: ((files: File[]) => void) | undefined;
  setImageDataList?: ((dataList: string[]) => void) | undefined;
  handleInputChange?: ((event: React.ChangeEvent<HTMLTextAreaElement>) => void) | undefined;
  handleStop?: (() => void) | undefined;
  enhancingPrompt?: boolean | undefined;
  enhancePrompt?: (() => void) | undefined;
  onWebSearchResult?: (result: string) => void;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  designScheme?: DesignScheme;
  setDesignScheme?: (scheme: DesignScheme) => void;
  selectedElement?: ElementInfo | null;
  setSelectedElement?: ((element: ElementInfo | null) => void) | undefined;
}

export const ChatBox: React.FC<ChatBoxProps> = (props) => {
  return (
    <div
      className={classNames(
        // ══ Outer shell — Double-Bezel: machined aluminum tray holding a glass plate ══
        'relative w-full max-w-chat mx-auto z-prompt rounded-2xl p-[3px]',
        'bg-[#1A1917]/60 ring-1 ring-white/[0.05]',
        'shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)]',
        // Focus-ring morph — orange hairline ignites when the field is engaged
        'focus-within:ring-[#E8601A]/25 focus-within:shadow-[0_0_0_1px_rgba(232,96,26,0.15),0_12px_40px_-8px_rgba(232,96,26,0.18)]',
        'transition-[box-shadow] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)]',
      )}
    >
      {/* ══ Inner core — the glass plate ══ */}
      <div className="relative rounded-[calc(1rem-3px)] overflow-hidden bg-[#111110]/85 backdrop-blur-xl">
        {/* Model settings disclosure — lives inside the plate */}
        <div>
          <ClientOnly>
            {() => (
              <div className={props.isModelSettingsCollapsed ? 'hidden' : ''}>
                <ModelSelector
                  key={props.provider?.name + ':' + (props.modelList?.length ?? 0)}
                  model={props.model}
                  setModel={props.setModel}
                  modelList={props.modelList}
                  provider={props.provider}
                  setProvider={props.setProvider}
                  providerList={props.providerList || []}
                  apiKeys={props.apiKeys}
                  modelLoading={props.isModelLoading}
                />
                {(props.providerList || []).length > 0 &&
                  props.provider &&
                  !LOCAL_PROVIDERS.includes(props.provider.name) && (
                    <APIKeyManager
                      provider={props.provider}
                      apiKey={props.apiKeys[props.provider.name] || ''}
                      setApiKey={(key) => {
                        props.onApiKeysChange(props.provider.name, key);
                      }}
                    />
                  )}
              </div>
            )}
          </ClientOnly>
        </div>

        <FilePreview
          files={props.uploadedFiles}
          imageDataList={props.imageDataList}
          onRemove={(index) => {
            props.setUploadedFiles?.(props.uploadedFiles.filter((_, i) => i !== index));
            props.setImageDataList?.(props.imageDataList.filter((_, i) => i !== index));
          }}
        />
        <ClientOnly>
          {() => (
            <ScreenshotStateManager
              setUploadedFiles={props.setUploadedFiles}
              setImageDataList={props.setImageDataList}
              uploadedFiles={props.uploadedFiles}
              imageDataList={props.imageDataList}
            />
          )}
        </ClientOnly>

        {props.selectedElement && (
          <div className="flex mx-3 mt-1 gap-2 items-center justify-between rounded-lg rounded-b-none border border-b-none border-bolt-elements-borderColor text-bolt-elements-textPrimary py-1 px-2.5 font-medium text-xs">
            <div className="flex gap-2 items-center lowercase">
              <code className="bg-accent-500 rounded-4px px-1.5 py-1 mr-0.5 text-white">
                {props?.selectedElement?.tagName}
              </code>
              selected for inspection
            </div>
            <button
              className="bg-transparent text-accent-500 pointer-auto"
              onClick={() => props.setSelectedElement?.(null)}
            >
              Clear
            </button>
          </div>
        )}

        {/* ══ Textarea field ══ */}
        <div className="relative">
          <textarea
            ref={props.textareaRef}
            className={classNames(
              'w-full block pl-4 pt-4 pr-14 pb-2 outline-none resize-none',
              'text-[#D4D0CA] placeholder-[#4A4742] bg-transparent text-sm leading-relaxed',
              'transition-[box-shadow] duration-200',
            )}
            onDragEnter={(e) => {
              e.preventDefault();
              e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(20,136,252,0.5)';
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.currentTarget.style.boxShadow = 'inset 0 0 0 1px rgba(20,136,252,0.5)';
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.currentTarget.style.boxShadow = '';
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.style.boxShadow = '';

              const files = Array.from(e.dataTransfer.files);
              files.forEach((file) => {
                if (file.type.startsWith('image/')) {
                  const reader = new FileReader();

                  reader.onload = (e) => {
                    const base64Image = e.target?.result as string;
                    props.setUploadedFiles?.([...props.uploadedFiles, file]);
                    props.setImageDataList?.([...props.imageDataList, base64Image]);
                  };
                  reader.readAsDataURL(file);
                }
              });
            }}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                if (event.shiftKey) {
                  return;
                }

                event.preventDefault();

                if (props.isStreaming) {
                  props.handleStop?.();
                  return;
                }

                // ignore if using input method engine
                if (event.nativeEvent.isComposing) {
                  return;
                }

                props.handleSendMessage?.(event);
              }
            }}
            value={props.input}
            onChange={(event) => {
              props.handleInputChange?.(event);
            }}
            onPaste={props.handlePaste}
            style={{
              minHeight: props.TEXTAREA_MIN_HEIGHT,
              maxHeight: props.TEXTAREA_MAX_HEIGHT,
            }}
            placeholder={props.chatMode === 'build' ? 'Describe your app idea…' : 'What would you like to discuss?'}
            translate="no"
          />
          {/* SendButton — spring-mounted, Maya orange */}
          <ClientOnly>
            {() => (
              <SendButton
                show={props.input.length > 0 || props.isStreaming || props.uploadedFiles.length > 0 || props.status === 'error'}
                status={props.status}
                isStreaming={props.isStreaming}
                disabled={(!props.providerList || props.providerList.length === 0) && props.status !== 'error'}
                onClick={(event) => {
                  if (props.isStreaming) {
                    props.handleStop?.();
                    return;
                  }

                  if (props.input.length > 0 || props.uploadedFiles.length > 0) {
                    props.handleSendMessage?.(event);
                  }
                }}
              />
            )}
          </ClientOnly>
        </div>

        {/* ══ Action rail — inset above a hairline divider ══ */}
        <div className="relative flex items-center justify-between px-3 pt-1.5 pb-1 select-none">
          <div className="absolute inset-x-0 top-0 h-px bg-white/[0.04]" />
          <div className="flex gap-0.5 items-center">
            <IconButton
              title="Upload file"
              className="transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-95 hover:text-[#D4D0CA]"
              onClick={() => props.handleFileUpload()}
            >
              <div className="i-ph:paperclip-regular text-[18px] text-[#9E9890]"></div>
            </IconButton>
            <IconButton
              title="Model Settings"
              className={classNames(
                'transition-all duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-95 flex items-center gap-1 px-1.5 rounded-md',
                props.isModelSettingsCollapsed
                  ? 'bg-[#E8601A]/10 text-[#E8601A] ring-1 ring-[#E8601A]/15'
                  : 'text-[#9E9890] hover:bg-white/[0.04] hover:text-[#D4D0CA]',
              )}
              onClick={() => props.setIsModelSettingsCollapsed(!props.isModelSettingsCollapsed)}
              disabled={!props.providerList || props.providerList.length === 0}
            >
              <div className={`i-ph:caret-${props.isModelSettingsCollapsed ? 'right' : 'down'}-bold text-xs`} />
              {props.isModelSettingsCollapsed ? (
                <span className="text-[11px] font-medium normal-case tracking-normal truncate max-w-[160px]">
                  {props.model}
                </span>
              ) : (
                <span />
              )}
            </IconButton>
          </div>
          {props.input.length > 3 ? (
            <div className="text-[11px] text-[#3A3835] font-mono">
              <kbd className="px-1.5 py-0.5 rounded bg-white/[0.04] ring-1 ring-white/[0.05] text-[#9E9890]">Shift</kbd>
              <span className="mx-1 text-[#3A3835]">+</span>
              <kbd className="px-1.5 py-0.5 rounded bg-white/[0.04] ring-1 ring-white/[0.05] text-[#9E9890]">
                Return
              </kbd>
              <span className="ml-1.5">new line</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};
