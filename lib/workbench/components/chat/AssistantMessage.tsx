import { memo, Fragment, useState, useEffect, useRef } from 'react';
import { Markdown } from './Markdown';
import type { JSONValue } from 'ai';
import { workbenchStore } from '@/lib/workbench/stores/workbench';
import { WORK_DIR } from '@/lib/workbench/utils/constants';
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
import { BuildErrorCard } from './BuildErrorCard';
import { MessageActions } from './MessageActions';

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
  /** Phase B: when true (last assistant message), subscribe to buildErrorCard
   *  store and render <BuildErrorCard> in-stream instead of leaking the error
   *  as a synthetic user message. */
  showBuildError?: boolean;
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
    showBuildError = false,
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

    // ─── Phase B: subscribe to buildErrorCard store (last assistant msg only).
    //     The atom is set by BuilderPage's auto-fix loop at the same moment it
    //     injects the hidden pipelineInstructions; we render the styled card here
    //     so the user sees the error in-stream instead of in a synthetic user
    //     bubble. Cleared on unmount / when the store resets.
    const [buildError, setBuildError] = useState<{
      command: string; error: string; source: 'terminal' | 'preview';
      attempt: number; maxAttempts: number;
    } | undefined>(undefined);
    useEffect(() => {
      if (!showBuildError) return;
      return workbenchStore.buildErrorCard.subscribe((v) => setBuildError(v as any));
    }, [showBuildError]);

    return (
      <div className="group/message overflow-hidden w-full">
        {/* vercel-chatbot Message style: no avatar, content then actions below.
            group/message drives hover-reveal of MessageActions. */}
        <div className="flex-1 min-w-0">
            {/* ─── Interleaved rendering: thinking → response → thinking → response ─── */}
            {/* Renders parts in chronological order for a progressive experience */}
            {/* Phase R2: inline streaming status pill + cursor blink deleted — */}
            {/* the DynamicStatusPill at the end of the column owns all stream state. */}
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
                    // Render the FIRST text group from the StreamingMessageParser's
                    // parsed body (displayContent) — the parser converts <boltArtifact>
                    // XML into <div class="__boltArtifact__"> placeholders, which
                    // Markdown's div-router (Markdown.tsx:34-50) mounts as <Artifact>
                    // cards. Rendering raw `parts.text` instead hits rehypeStripBoltTags
                    // (markdown.ts:52-65) which strips raw bolt hast nodes → no cards.
                    // Subsequent text groups are skipped: displayContent is the FULL
                    // parsed message so it already contains their prose. Parser runs on
                    // a 50ms sampler (useMessageParser), so displayContent is at most
                    // ~50ms stale — fall back to raw textContent during that gap so
                    // streaming prose stays live.
                    const isFirstTextGroup = groups.slice(0, gi).every(g => g.type !== 'text');
                    if (!isFirstTextGroup) return null;
                    const renderContent = (displayContent && displayContent.trim().length > 0)
                      ? displayContent
                      : textContent;
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
                          {renderContent}
                        </Markdown>
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
              </>
            )}

            {/* ─── Phase B: in-chat styled build-error card (replaces leaked
                synthetic-user error dump). Live as a real assistant surface
                in the AIDA flow between Desire (tool cards) and Action. */}
            {!isStreaming && buildError ? <BuildErrorCard {...buildError} /> : null}

            {/* Empty response warning — double-bezel alert, bilingual.
                Fires when the model emitted no visible text answer, whether it
                produced only reasoning (thought-but-no-answer) or nothing at all.
                Tool-only turns don't trigger it — those are real build steps. */}
            {!isStreaming && !hasContent && !(toolInvocations && toolInvocations.length > 0) && messageId && (
              <div
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-[12px] ring-1 ring-red-400/15"
                style={{
                  background: 'rgba(248, 113, 113, 0.04)',
                  color: '#F87171',
                  boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
                }}
              >
                <div className="i-ph:warning-circle w-3.5 h-3.5 shrink-0" />
                <span>{language === 'hi'
                  ? (hasReasoning
                    ? 'MAYA ne sirf socha, lekin koi jawaab nahi diya. Dobara bhejiye ya doosra model try karein.'
                    : 'MAYA ne khaali jawaab diya. Dobara bhejiye ya doosra model try karein.')
                  : (hasReasoning
                    ? 'Model only produced reasoning and no final answer. Try sending again or switch to a different model.'
                    : 'Model returned an empty response. Try sending the message again or switch to a different model.')}</span>
              </div>
            )}

            {/* vercel-chatbot MessageToolbar pattern: actions BELOW content.
                mt-4 spacing, hover-reveal via group-message. Only after the
                response terminates (isStreaming false). Copy, rewind, cosmetic
                vote (no vote-table persistence in MAYA). */}
            {messageId && !isStreaming && (
              <div className="mt-4">
                <MessageActions
                  role="assistant"
                  messageId={messageId}
                  parts={parts}
                  isLoading={isStreaming}
                  onRewind={onRewind ? () => onRewind(messageId) : undefined}
                  language={language}
                />
              </div>
            )}
          </div>
      </div>
    );
  },
);
