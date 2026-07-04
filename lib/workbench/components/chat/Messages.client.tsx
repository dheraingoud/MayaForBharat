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
import { detectLanguage } from '@/lib/workbench/utils/detectLanguage';
import { AssistantMessage } from './AssistantMessage';
import { UserMessage } from './UserMessage';
import { toast } from 'react-toastify';
import { forwardRef } from 'react';
import type { ForwardedRef } from 'react';
import { motion } from 'framer-motion';
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
        {/* Phase R: centered reading column. Breathing room, fade-up enter. */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
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

              // MAYA speaks the user's language. For each assistant reply, detect
              // the language of the nearest preceding USER message (Devanagari→hi
              // else en) and thread it down so chrome labels match the conversation.
              // Not a static toggle — re-derived per message as the user switches.
              const language = isUserMessage ? 'en' : (() => {
                for (let j = index; j >= 0; j--) {
                  if (messages[j].role === 'user') {
                    const uc = (messages[j].parts ?? [])
                      .filter((p): p is TextUIPart => p.type === 'text' && 'text' in p)
                      .map((p) => p.text)
                      .join('');
                    return detectLanguage(uc);
                  }
                }
                return 'en' as const;
              })();

              return (
                <motion.div
                  key={index}
                  className={classNames('flex w-full', {
                    'mt-6': !isFirst,
                    'justify-end': isUserMessage,
                    'justify-start': !isUserMessage,
                  })}
                  initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{
                    type: 'spring',
                    stiffness: 120,
                    damping: 22,
                    duration: 0.6,
                    delay: Math.min(index * 0.04, 0.4),
                  }}
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
                        language={language}
                      />
                    )}
                  </div>
                </motion.div>
              );
            })
          : null}
        {/* Streaming indicator: only show when streaming AND the last message hasn't started rendering yet */}
        {isStreaming && (messages.length === 0 || messages[messages.length - 1]?.role === 'user') && (
          <motion.div
            className="flex items-center gap-3 w-full mt-6"
            initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ type: 'spring', stiffness: 120, damping: 22, duration: 0.6 }}
          >
            {/* MAYA avatar — double-bezel (hairline ring + inset highlight, no neon glow) */}
            <div
              className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center ring-1 ring-[#E8601A]/20"
              style={{
                background: 'linear-gradient(135deg, #E8601A 0%, #C94E12 100%)',
                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.18)',
              }}
            >
              <span className="text-white text-[9px] font-bold tracking-tight">M</span>
            </div>
            {/* Bilingual reading pill — double-bezel glass, no emoji */}
            <div
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#E8601A]/[0.04] ring-1 ring-[#E8601A]/12 text-[12px] text-[#6B6560] font-medium"
              style={{ boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06)' }}
            >
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E8601A] animate-bounce" style={{ animationDelay: '0ms', animationDuration: '0.8s' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#E8601A] animate-bounce" style={{ animationDelay: '150ms', animationDuration: '0.8s' }} />
                <span className="w-1.5 h-1.5 rounded-full bg-[#E8601A] animate-bounce" style={{ animationDelay: '300ms', animationDuration: '0.8s' }} />
              </span>
              <span>{'MAYA is reading your prompt…'}</span>
            </div>
          </motion.div>
        )}
        </div>
      </div>
    );
  },
);
