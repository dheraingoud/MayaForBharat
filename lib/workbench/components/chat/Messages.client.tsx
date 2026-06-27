import type {
  UIMessage,
  TextUIPart,
  ReasoningUIPart,
  ToolUIPart,
  SourceUrlUIPart,
  FileUIPart,
  StepStartUIPart,
} from 'ai';
import { classNames } from '@/lib/workbench/utils/classNames';
import { AssistantMessage } from './AssistantMessage';
import { UserMessage } from './UserMessage';
import { toast } from 'react-toastify';
import { forwardRef } from 'react';
import type { ForwardedRef } from 'react';
import type { ProviderInfo } from '@/lib/workbench/types/model';

// Match the parts union expected by UserMessage / AssistantMessage props.
// `ai` v6's UIMessage.parts uses the generic `ToolUIPart<TOOLS>` (matched as
// `tool-${string}` in the child props). Casting to this concrete union lets us
// pass parts straight through without changing runtime behavior.
type MessageParts =
  | TextUIPart
  | ReasoningUIPart
  | ToolUIPart
  | SourceUrlUIPart
  | FileUIPart
  | StepStartUIPart;

interface MessagesProps {
  id?: string;
  className?: string;
  isStreaming?: boolean;
  messages?: UIMessage[];
  setMessages?: (messages: UIMessage[]) => void;
  append?: (UIMessage: UIMessage) => void;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  model?: string;
  provider?: ProviderInfo;
  addToolResult: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
}

export const Messages = forwardRef<HTMLDivElement, MessagesProps>(
  (props: MessagesProps, ref: ForwardedRef<HTMLDivElement> | undefined) => {
    const { id, isStreaming = false, messages = [] } = props;

    const handleRewind = (messageId: string) => {
      // Find the index of this message
      const idx = messages.findIndex((m) => m.id === messageId);

      if (idx < 0) {
        toast.error('Could not find message to revert to');
        return;
      }

      // Keep messages up to and including this one
      const truncated = messages.slice(0, idx + 1);

      if (props.setMessages) {
        props.setMessages(truncated);
        toast.success('Reverted to selected message');
      } else {
        toast.error('Cannot revert: setMessages not available');
      }
    };

    return (
      <div id={id} className={props.className} ref={ref}>
        {messages.length > 0
          ? messages.map((UIMessage, index) => {
              const { role, id: messageId, parts } = UIMessage;
              const isUserMessage = role === 'user';
              const isFirst = index === 0;

              // AI SDK v6: UIMessage no longer carries `content` or `annotations`.
              // Text lives in `parts` (each part has optional `.text`); the children
              // normalize from parts when content is empty, so derive a string here.
              const content = (parts ?? [])
                .filter((p): p is TextUIPart => p.type === 'text' && 'text' in p)
                .map((p) => p.text)
                .join('');

              // Cast parts to the children's declared parts union. Runtime shape is
              // identical — only the generic ToolUIPart<TOOLS> vs ToolUIPart<UITools>
              // template literal differs, and both children accept every part kind.
              const childParts = parts as MessageParts[] | undefined;

              return (
                <div
                  key={index}
                  className={classNames('flex w-full', {
                    'mt-4': !isFirst,
                    'justify-end': isUserMessage,
                    'justify-start': !isUserMessage,
                  })}
                >
                  <div className={classNames('', {
                    'max-w-[85%] ml-auto': isUserMessage,
                    'w-full': !isUserMessage,
                  })}>
                    {isUserMessage ? (
                      <UserMessage content={content} parts={childParts} />
                    ) : (
                      <AssistantMessage
                        content={content}
                        messageId={messageId}
                        onRewind={handleRewind}
                        append={props.append}
                        chatMode={props.chatMode}
                        setChatMode={props.setChatMode}
                        model={props.model}
                        provider={props.provider}
                        parts={childParts}
                        addToolResult={props.addToolResult}
                        isStreaming={isStreaming && index === messages.length - 1}
                      />
                    )}
                  </div>
                </div>
              );
            })
          : null}
        {/* Streaming indicator: only show when streaming AND the last message hasn't started rendering yet */}
        {isStreaming && (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
          <div className="flex items-center gap-3 w-full mt-4 px-1">
            {/* MAYA logo shimmer */}
            <div
              className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, #E8601A 0%, #C94E12 100%)',
                boxShadow: '0 0 12px rgba(232, 96, 26, 0.3)',
              }}
            >
              <span className="text-white text-[9px] font-bold">M</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span
                className="w-1.5 h-1.5 rounded-full bg-[#E8601A] animate-bounce"
                style={{ animationDelay: '0ms', animationDuration: '0.8s' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-[#E8601A] animate-bounce"
                style={{ animationDelay: '150ms', animationDuration: '0.8s' }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-[#E8601A] animate-bounce"
                style={{ animationDelay: '300ms', animationDuration: '0.8s' }}
              />
            </div>
          </div>
        )}
      </div>
    );
  },
);
