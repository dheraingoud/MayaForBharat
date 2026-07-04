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
import { DynamicStatusPill } from './DynamicStatusPill';
import { Greeting } from './Greeting';
import { toast } from 'react-toastify';
import { forwardRef, useState } from 'react';
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
  /** Re-roll the last assistant turn (from useChat). Surfaced as a composer
   *  Regenerate button in BuilderPage; threaded but optional here. */
  regenerate?: () => void;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  model?: string;
  provider?: ProviderInfo;
  addToolResult: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
}

export const Messages = forwardRef<HTMLDivElement, MessagesProps>(
  (props: MessagesProps, ref: ForwardedRef<HTMLDivElement> | undefined) => {
    const { id, isStreaming = false, messages = [] } = props;

    // ── M2: in-place user-message edit. Idempotent client-side
    //    deleteTrailingMessages approximation — drop edited msg + trailing,
    //    then append the edited text as a fresh user turn. append() (from
    //    useChat via BaseChat/BuilderPage) triggers the assistant re-roll,
    //    mirroring Chat.client's lander-first-prompt seed+send at :415-438.
    const [editingId, setEditingId] = useState<string | null>(null);
    const startEdit = (mid: string) => setEditingId(mid);
    const cancelEdit = () => setEditingId(null);
    const saveUserEdit = (mid: string, newText: string) => {
      const idx = messages.findIndex((m) => m.id === mid);
      if (idx < 0) return;
      const truncated = messages.slice(0, idx); // drop edited msg + trailing
      if (props.setMessages) props.setMessages(truncated);
      if (props.append) {
        props.append({
          id: `${mid}-${Date.now()}`,
          role: 'user',
          content: newText,
          parts: [{ type: 'text' as const, text: newText }],
        } as UIMessage);
      }
      setEditingId(null);
    };

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
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 relative">
        {/* M2: empty-state greeting — ported vercel greeting.tsx overlay.
            Absolute centered, pointer-events-none so the composer keeps focus. */}
        {messages.length === 0 && !isStreaming && (
          <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
            <Greeting language="en" />
          </div>
        )}
        {messages.length > 0
          ? messages.map((UIMessage, index) => {
              const { role, id: messageId, parts } = UIMessage;
              const isUserMessage = role === 'user';
              const isFirst = index === 0;

              // ── M4: bubble grouping (astryx/vercel pattern). Compute position
              //    from same-role neighbors so sender-side corners collapse into
              //    a single cluster (not N identical bubbles). Also tighten the
              //    top margin between same-sender msgs for a contiguous stack.
              const prevMsg = messages[index - 1];
              const nextMsg = messages[index + 1];
              const prevSame = !!prevMsg && prevMsg.role === role;
              const nextSame = !!nextMsg && nextMsg.role === role;
              const position: 'single' | 'first' | 'middle' | 'last' =
                prevSame && nextSame ? 'middle'
                : prevSame && !nextSame ? 'last'
                : !prevSame && nextSame ? 'first'
                : 'single';

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
                  className={classNames('flex w-full group/message', {
                    'mt-6': !isFirst && !prevSame,
                    'mt-1.5': !isFirst && prevSame,
                    'justify-end': isUserMessage,
                    'justify-start': !isUserMessage,
                  })}
                  initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
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
                      <UserMessage
                        content={content}
                        parts={childParts}
                        messageId={messageId}
                        position={position}
                        isEditing={editingId === messageId}
                        onStartEdit={() => startEdit(messageId)}
                        onSaveEdit={(text) => saveUserEdit(messageId, text)}
                        onCancelEdit={cancelEdit}
                        language={language}
                      />
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
                        showBuildError={index === messages.length - 1}
                      />
                    )}
                  </div>
                </motion.div>
              );
            })
          : null}
        {/* Phase R2: single authoritative DynamicIsland status pill — owns
            reading/thinking/writing/running/done. Folds in the old 3-dot
            reading placeholder + the duplicate inline status pill (deleted
            from AssistantMessage). Mounts once at end of assistant column. */}
        <DynamicStatusPill isStreaming={isStreaming} messages={messages} />
        </div>
      </div>
    );
  },
);
