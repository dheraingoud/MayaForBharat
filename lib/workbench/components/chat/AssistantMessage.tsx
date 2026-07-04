import { memo, Fragment, useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Markdown } from './Markdown';
import type { JSONValue } from 'ai';
import { workbenchStore } from '@/lib/workbench/stores/workbench';
import { WORK_DIR } from '@/lib/workbench/utils/constants';
import WithTooltip from '@/lib/workbench/components/ui/Tooltip';
import type { UIMessage } from 'ai';
import type { ProviderInfo } from '@/lib/workbench/types/model';
import type {
  TextUIPart,
  ReasoningUIPart,
  ToolUIPart,
  SourceUrlUIPart,
  FileUIPart,
  StepStartUIPart,
} from 'ai';
import { ToolInvocations } from './ToolInvocations';
import type { ToolCallAnnotation } from '@/lib/workbench/types/context';
import ThoughtBox from './ThoughtBox';

interface AssistantMessageProps {
  content: string;
  annotations?: JSONValue[];
  messageId?: string;
  onRewind?: (messageId: string) => void;
  append?: (UIMessage: UIMessage) => void;
  chatMode?: 'discuss' | 'build';
  setChatMode?: (mode: 'discuss' | 'build') => void;
  model?: string;
  provider?: ProviderInfo;
  parts:
    | (TextUIPart | ReasoningUIPart | ToolUIPart | SourceUrlUIPart | FileUIPart | StepStartUIPart)[]
    | undefined;
  addToolResult: ({ toolCallId, result }: { toolCallId: string; result: any }) => void;
  isStreaming?: boolean;
  language?: 'hi' | 'en';
}

function openArtifactInWorkbench(filePath: string) {
  filePath = normalizedFilePath(filePath);

  if (workbenchStore.currentView.get() !== 'code') {
    workbenchStore.currentView.set('code');
  }

  workbenchStore.setSelectedFile(`${WORK_DIR}/${filePath}`);
}

function normalizedFilePath(path: string) {
  let normalizedPath = path;

  if (normalizedPath.startsWith(WORK_DIR)) {
    normalizedPath = path.replace(WORK_DIR, '');
  }

  if (normalizedPath.startsWith('/')) {
    normalizedPath = normalizedPath.slice(1);
  }

  return normalizedPath;
}

/**
 * Derive a human-readable status message from the content being streamed.
 * This gives the user visibility into what the model is doing for ALL models,
 * not just reasoning models.
 */
type StreamStatusKey =
  | 'thinking'
  | 'writing'
  | 'running'
  | 'starting'
  | 'generating'
  | 'responding'
  | 'working';

function deriveStreamStatusKey(content: string): StreamStatusKey {
  if (!content || content.length === 0) return 'thinking';
  if (content.match(/<boltAction[^>]*filePath="([^"]+)"[^>]*>(?![\s\S]*<\/boltAction>)/)) return 'writing';
  if (content.match(/<boltAction[^>]*type="shell"[^>]*>(?![\s\S]*<\/boltAction>)/)) return 'running';
  if (content.match(/<boltAction[^>]*type="start"[^>]*>(?![\s\S]*<\/boltAction>)/)) return 'starting';
  if (content.includes('<boltArtifact') && !content.includes('</boltArtifact>')) return 'generating';
  if (content.trim().length > 0 && !content.includes('<boltArtifact')) return 'responding';
  return 'working';
}

const STATUS_LABEL: Record<'hi' | 'en', Record<StreamStatusKey, string>> = {
  en: {
    thinking: 'Thinking...',
    writing: 'Writing {file}...',
    running: 'Running command...',
    starting: 'Starting app...',
    generating: 'Generating code...',
    responding: 'Responding...',
    working: 'Working...',
  },
  hi: {
    thinking: 'Soch rahi hoon...',
    writing: '{file} likh rahi hoon...',
    running: 'Command chala rahi hoon...',
    starting: 'App shuru kar rahi hoon...',
    generating: 'Code bana rahi hoon...',
    responding: 'Jawaab de rahi hoon...',
    working: 'Kaam kar rahi hoon...',
  },
};

function statusLabel(key: StreamStatusKey, language: 'hi' | 'en', fileName?: string): string {
  const label = STATUS_LABEL[language][key];
  return fileName ? label.replace('{file}', fileName) : label;
}

function lastWritingFileName(content: string): string | undefined {
  const m = content.match(/<boltAction[^>]*filePath="([^"]+)"[^>]*>(?![\s\S]*<\/boltAction>)/);
  return m ? m[1].split('/').pop() : undefined;
}

export const AssistantMessage = memo(
  ({
    content,
    annotations,
    messageId,
    onRewind,
    append,
    chatMode,
    setChatMode,
    model,
    provider,
    parts,
    addToolResult,
    isStreaming = false,
    language = 'en',
  }: AssistantMessageProps) => {
    const filteredAnnotations = (annotations?.filter(
      (annotation: JSONValue) =>
        annotation && typeof annotation === 'object' && Object.keys(annotation).includes('type'),
    ) || []) as { type: string; value: any } & { [key: string]: any }[];

    const toolInvocations = parts?.filter((part) => part.type === 'tool-invocation');
    const reasoningParts = parts?.filter((part) => part.type === 'reasoning') as ReasoningUIPart[] | undefined;
    const toolCallAnnotations = filteredAnnotations.filter(
      (annotation) => annotation.type === 'toolCall',
    ) as ToolCallAnnotation[];

    // Progressive rendering: cache last non-empty content so it doesn't vanish
    // when model pauses between thinking/actions
    const cachedContentRef = useRef(content || '');
    if (content && content.trim().length > 0) {
      cachedContentRef.current = content;
    }
    // Use cached content if current is empty but we're still streaming
    const displayContent = (content && content.trim().length > 0)
      ? content
      : (isStreaming ? cachedContentRef.current : content);

    const hasContent = displayContent && displayContent.trim().length > 0;
    const hasReasoning = reasoningParts && reasoningParts.length > 0;

    // Track elapsed time during streaming
    const [elapsed, setElapsed] = useState(0);
    const startRef = useRef(Date.now());

    useEffect(() => {
      if (isStreaming) {
        startRef.current = Date.now();
        const interval = setInterval(() => {
          setElapsed(Math.round((Date.now() - startRef.current) / 1000));
        }, 1000);
        return () => clearInterval(interval);
      } else {
        setElapsed(0);
      }
    }, [isStreaming]);

    // Derive stable status key, then localize it to the user's chat language.
    // The 'writing' key also carries the live file name (e.g. "package.json").
    const streamStatusKey: StreamStatusKey | null = isStreaming ? deriveStreamStatusKey(displayContent) : null;
    const streamStatus = streamStatusKey
      ? statusLabel(streamStatusKey, language, streamStatusKey === 'writing' ? lastWritingFileName(displayContent) : undefined)
      : '';

    // Detect if the model is currently in a reasoning/thinking phase
    // (last part in the stream is a reasoning part) — ThoughtBox handles this UI
    const isActivelyReasoning = isStreaming && parts && parts.length > 0 &&
      parts[parts.length - 1].type === 'reasoning';

    return (
      <div className="overflow-hidden w-full">
        {/* ─── v0-style: MAYA avatar + content row ─── */}
        <div className="flex gap-3 items-start">
          {/* MAYA avatar — always visible; spring-breathes while streaming */}
          <motion.div
            className="w-6 h-6 rounded-full shrink-0 flex items-center justify-center mt-0.5"
            style={{
              background: 'linear-gradient(135deg, #E8601A 0%, #C94E12 100%)',
              boxShadow: isStreaming ? '0 0 10px rgba(232, 96, 26, 0.3)' : 'none',
            }}
            animate={{ scale: isStreaming ? 1.04 : 1 }}
            transition={{ type: 'spring', stiffness: 200, damping: 15 }}
          >
            <span className="text-white text-[9px] font-bold tracking-tight">M</span>
          </motion.div>

          {/* Message content area */}
          <div className="flex-1 min-w-0">
            {/* Rewind action — subtle, visible on hover, hidden during streaming */}
            {onRewind && messageId && !isStreaming && (
              <div className="flex items-center gap-1 mb-0.5 opacity-0 hover:opacity-100 transition-opacity">
                <WithTooltip tooltip="Revert to this message">
                  <button
                    onClick={() => onRewind(messageId)}
                    className="p-0.5 rounded text-[#4A4742] hover:text-[#E8601A] hover:bg-[#E8601A]/[0.06] transition-colors"
                  >
                    <div className="i-ph:arrow-u-up-left w-3 h-3" />
                  </button>
                </WithTooltip>
              </div>
            )}

            {/* ─── Streaming activity indicator ─── */}
            {/* Only shows when NOT actively reasoning (ThoughtBox handles reasoning state) */}
            {/* Shows status like "Writing file...", "Running command...", "Generating code..." */}
            {isStreaming && !isActivelyReasoning && streamStatusKey !== null && streamStatusKey !== 'thinking' && (
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium"
                  style={{
                    background: 'rgba(232, 96, 26, 0.06)',
                    border: '1px solid rgba(232, 96, 26, 0.12)',
                    color: '#E8601A',
                    boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.06)',
                  }}
                >
                  {/* Animated pulse dot */}
                  <span
                    className="w-[5px] h-[5px] rounded-full bg-[#E8601A]"
                    style={{
                      animation: 'pulse 1.2s ease-in-out infinite',
                      boxShadow: '0 0 4px rgba(232, 96, 26, 0.5)',
                    }}
                  />
                  <span>{streamStatus}</span>
                  {elapsed > 0 && (
                    <span className="text-[#6B6560] ml-0.5">{elapsed}s</span>
                  )}
                </div>
              </div>
            )}

            {/* ─── Interleaved rendering: thinking → response → thinking → response ─── */}
            {/* Renders parts in chronological order for a progressive experience */}
            {parts && parts.length > 0 ? (
              (() => {
                // Group consecutive same-type parts for cleaner rendering
                const groups: { type: 'reasoning' | 'text' | 'tool' | 'other'; items: typeof parts }[] = [];
                for (const part of parts) {
                  const partType = part.type === 'reasoning' ? 'reasoning'
                    : part.type === 'text' ? 'text'
                    : part.type === 'tool-invocation' ? 'tool'
                    : 'other';
                  const last = groups[groups.length - 1];
                  if (last && last.type === partType) {
                    last.items.push(part);
                  } else {
                    groups.push({ type: partType, items: [part] });
                  }
                }

                // Determine which group is the last reasoning group (for streaming indicator)
                let lastReasoningIdx = -1;
                groups.forEach((g, i) => { if (g.type === 'reasoning') lastReasoningIdx = i; });

                return groups.map((group, gi) => {
                  if (group.type === 'reasoning') {
                    const reasoningText = (group.items as ReasoningUIPart[])
                      .map(p => p.text)
                      .join('');
                    if (!reasoningText.trim()) return null;
                    // Only the last reasoning group gets isStreaming=true (shows "Thinking..")
                    const isActiveThinking = isStreaming && gi === lastReasoningIdx;
                    return (
                      <ThoughtBox key={`thought-${gi}`} isStreaming={isActiveThinking} language={language}>
                        {reasoningText}
                      </ThoughtBox>
                    );
                  }
                  if (group.type === 'text') {
                    const textContent = (group.items as TextUIPart[])
                      .map(p => p.text)
                      .join('');
                    if (!textContent.trim()) return null;
                    // Check if this is the last text group (for streaming cursor)
                    const isLastTextGroup = gi === groups.length - 1 ||
                      groups.slice(gi + 1).every(g => g.type !== 'text');
                    return (
                      <Fragment key={`text-${gi}`}>
                        <Markdown
                          append={append}
                          chatMode={chatMode}
                          setChatMode={setChatMode}
                          model={model}
                          provider={provider}
                          isStreaming={isStreaming && isLastTextGroup}
                          html
                        >
                          {textContent}
                        </Markdown>
                        {/* Streaming cursor on last text block */}
                        {isStreaming && isLastTextGroup && (
                          <span
                            className="inline-block w-[3px] h-[14px] ml-0.5 rounded-sm"
                            style={{
                              background: '#E8601A',
                              animation: 'blink 1s steps(2) infinite',
                              verticalAlign: 'text-bottom',
                            }}
                          />
                        )}
                      </Fragment>
                    );
                  }
                  if (group.type === 'tool') {
                    return (
                      <ToolInvocations
                        key={`tool-${gi}`}
                        toolInvocations={group.items}
                        toolCallAnnotations={toolCallAnnotations}
                        addToolResult={addToolResult}
                      />
                    );
                  }
                  return null;
                });
              })()
            ) : (
              <>
                {/* Fallback: legacy rendering when parts array is empty/missing */}
                {hasReasoning && (
                  <ThoughtBox isStreaming={isStreaming} language={language}>
                    {reasoningParts!.map((part, i) => (
                      <Fragment key={i}>{part.text}</Fragment>
                    ))}
                  </ThoughtBox>
                )}

                {hasContent && (
                  <Markdown
                    append={append}
                    chatMode={chatMode}
                    setChatMode={setChatMode}
                    model={model}
                    provider={provider}
                    isStreaming={isStreaming}
                    html
                  >
                    {displayContent}
                  </Markdown>
                )}

                {toolInvocations && toolInvocations.length > 0 && (
                  <ToolInvocations
                    toolInvocations={toolInvocations}
                    toolCallAnnotations={toolCallAnnotations}
                    addToolResult={addToolResult}
                  />
                )}

                {/* Streaming cursor */}
                {isStreaming && hasContent && (
                  <span
                    className="inline-block w-[3px] h-[14px] ml-0.5 rounded-sm"
                    style={{
                      background: '#E8601A',
                      animation: 'maya-blink 0.8s cubic-bezier(0.32, 0.72, 0, 1) infinite',
                      verticalAlign: 'text-bottom',
                    }}
                  />
                )}
              </>
            )}

            {/* Empty response warning — shows when streaming ended but no content was produced */}
            {!isStreaming && !hasContent && !hasReasoning && !(toolInvocations && toolInvocations.length > 0) && messageId && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-[12px]"
                style={{
                  background: 'rgba(248, 113, 113, 0.06)',
                  border: '1px solid rgba(248, 113, 113, 0.15)',
                  color: '#F87171',
                }}
              >
                <div className="i-ph:warning-circle w-3.5 h-3.5 shrink-0" />
                <span>{language === 'hi'
                  ? 'MAYA ne khaali jawaab diya. Dobara bhejiye ya doosra model try karein.'
                  : 'Model returned an empty response. Try sending the message again or switch to a different model.'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Animations */}
        <style jsx>{`
          @keyframes blink {
            0% { opacity: 1; }
            50% { opacity: 0; }
            100% { opacity: 1; }
          }
          @keyframes maya-blink {
            0% { opacity: 1; }
            50% { opacity: 0.2; }
            100% { opacity: 1; }
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.4; transform: scale(0.8); }
          }
        `}</style>
      </div>
    );
  },
);
