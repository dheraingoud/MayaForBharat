/*
 * @ts-nocheck
 * Preventing TS checks with files presented in the video for a better presentation.
 */
import { MODEL_REGEX, PROVIDER_REGEX } from '@/lib/workbench/utils/constants';
import { useStore } from '@nanostores/react';
import { profileStore } from '@/lib/workbench/stores/profile';
import type {
  TextUIPart,
  ReasoningUIPart,
  ToolUIPart,
  SourceUrlUIPart,
  FileUIPart,
  StepStartUIPart,
} from 'ai';
import { MessageActions } from './MessageActions';
import { MessageEditor } from './MessageEditor';

interface UserMessageProps {
  content: string | Array<{ type: string; text?: string; image?: string }>;
  parts:
    | (TextUIPart | ReasoningUIPart | ToolUIPart | SourceUrlUIPart | FileUIPart | StepStartUIPart)[]
    | undefined;
  messageId?: string;
  /** M2 in-place edit — driven by editingId state in Messages.client. */
  isEditing?: boolean;
  onStartEdit?: () => void;
  onSaveEdit?: (text: string) => void;
  onCancelEdit?: () => void;
  language?: 'hi' | 'en';
  /** M4: bubble-group position — sender-side corners collapse into a cluster. */
  position?: 'single' | 'first' | 'middle' | 'last';
}

export function UserMessage({
  content,
  parts,
  messageId,
  isEditing = false,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  language = 'en',
  position = 'single',
}: UserMessageProps) {
  // M4: collapse sender-side (right) corners between same-sender bubbles.
  // Tail corner is BR; TR tucks toward the prev bubble, BR tucks toward next.
  const cornerVariant =
    position === 'first' ? 'rounded-br-sm'
    : position === 'middle' ? 'rounded-tr-sm rounded-br-sm'
    : position === 'last' ? 'rounded-tr-sm rounded-br-md'
    : 'rounded-br-md';
  // AI SDK v4: content may be empty, actual text lives in parts[].text
  // Normalize: extract text from parts if content is empty
  const resolvedContent = resolveContent(content, parts);
  const profile = useStore(profileStore);

  // Extract images from parts - look for file parts with image media types
  const images =
    parts?.filter(
      (part): part is FileUIPart => part.type === 'file' && part.mediaType.startsWith('image/'),
    ) || [];

  if (Array.isArray(resolvedContent)) {
    const textItem = resolvedContent.find((item) => item.type === 'text');
    const textContent = stripMetadata(textItem?.text || '');

    // F2: if the bubble text was fully stripped (auto-fix breadcrumb that the
    // model/auto-fix loop sent as a role:'user' message) and there are no
    // images, render NOTHING — no fake user bubble, no actions. This is the
    // "user only sees what they type" contract. The auto-fix still runs; its
    // status surfaces via toast + BuildErrorCard, not a user bubble.
    if (!textContent && images.length === 0) return null;

    // M2: in-place edit swap — editor replaces the bubble while editing.
    if (isEditing) {
      return (
        <div className="w-full">
          <MessageEditor
            initialText={textContent}
            onSave={(t) => onSaveEdit?.(t)}
            onCancel={() => onCancelEdit?.()}
            language={language}
          />
        </div>
      );
    }

    return (
      <div className="overflow-hidden flex flex-col gap-1.5 items-end">
        {/* User message bubble — double-bezel (outer ring shell + inner core) */}
        <div
          className={`p-[1px] w-fit max-w-[85%] rounded-2xl ${cornerVariant} ring-1 ring-[#E8601A]/10`}
          style={{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }}
        >
          <div
            className={`px-4 py-2.5 rounded-[calc(1rem-1px)] ${cornerVariant} text-[14px] leading-relaxed`}
            style={{
              background: 'rgba(232, 96, 26, 0.04)',
              color: '#F5F4F0',
            }}
          >
            {textContent && <span>{textContent}</span>}
            {images.map((item, index) => (
              <img
                key={index}
                src={item.url}
                alt={`Image ${index + 1}`}
                className="max-w-full h-auto rounded-lg mt-2"
                style={{ maxHeight: '512px', objectFit: 'contain' }}
              />
            ))}
          </div>
        </div>
        {onStartEdit && (
          <MessageActions
            role="user"
            messageId={messageId}
            parts={parts}
            onEdit={onStartEdit}
            language={language}
          />
        )}
      </div>
    );
  }

  const textContent = stripMetadata(typeof resolvedContent === 'string' ? resolvedContent : '');

  // F2: stripped-empty (auto-fix breadcrumb) + no images → render nothing.
  if (!textContent && images.length === 0) return null;

  // M2: in-place edit swap — editor replaces the bubble while editing.
  if (isEditing) {
    return (
      <div className="w-full">
        <MessageEditor
          initialText={textContent}
          onSave={(t) => onSaveEdit?.(t)}
          onCancel={() => onCancelEdit?.()}
          language={language}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1.5 items-end w-full">
      <div
        className={`p-[1px] w-fit rounded-2xl ${cornerVariant} ml-auto max-w-[85%] ring-1 ring-[#E8601A]/10`}
        style={{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.05)' }}
      >
        <div
          className={`px-4 py-2.5 rounded-[calc(1rem-1px)] ${cornerVariant} text-[14px] leading-relaxed`}
          style={{
            background: 'rgba(232, 96, 26, 0.04)',
            color: '#F5F4F0',
          }}
        >
          {images.length > 0 && (
            <div className="flex gap-3.5 mb-2">
              {images.map((item, index) => (
                <div className="relative flex rounded-lg border border-white/[0.08] overflow-hidden">
                  <div className="h-16 w-16 bg-transparent outline-none">
                    <img
                      key={index}
                      src={item.url}
                      alt={`Image ${index + 1}`}
                      className="h-full w-full rounded-lg"
                      style={{ objectFit: 'fill' }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
          <span>{textContent}</span>
        </div>
      </div>
      {onStartEdit && (
        <MessageActions
          role="user"
          messageId={messageId}
          parts={parts}
          onEdit={onStartEdit}
          language={language}
        />
      )}
    </div>
  );
}

/**
 * Resolve content from either the content prop or parts array.
 * AI SDK v4's chatSendMessage({ text }) stores text in parts but may leave content empty.
 */
function resolveContent(
  content: string | Array<{ type: string; text?: string; image?: string }>,
  parts: UserMessageProps['parts'],
): string | Array<{ type: string; text?: string; image?: string }> {
  // If content is a non-empty string, use it directly
  if (typeof content === 'string' && content.trim()) return content;

  // If content is a non-empty array, use it directly
  if (Array.isArray(content) && content.length > 0) return content;

  // Content is empty — extract from parts
  if (parts && parts.length > 0) {
    const textParts = parts.filter((p): p is { type: 'text'; text: string } => p.type === 'text' && 'text' in p);
    if (textParts.length > 0) {
      return textParts.map((p) => p.text).join('');
    }
  }

  // Fallback — return original
  return content;
}

// Exported for unit-testing the auto-fix breadcrumb / bolt-tag strip contract
// (F2 regression guard: a breadcrumb must collapse to '' so UserMessage renders
// nothing — no fake user bubble during auto-fix).
export function stripMetadata(content: string) {
  if (!content) return '';
  const artifactRegex = /<boltArtifact\s+[^>]*>[\s\S]*?<\/boltArtifact>/gm;
  // Defense-in-depth: strip any stray <boltAction>…</boltAction> tags so
  // bolt internals NEVER surface in the user's chat bubble. The auto-run
  // safety net now injects commands directly (BuilderPage) instead of
  // re-prompting with raw XML, but a model could still emit a stray tag.
  const actionRegex = /<boltAction\s+[^>]*>[\s\S]*?<\/boltAction>/gm;
  const selfClosingActionRegex = /<boltAction\s+[^>]*\/>/gm;
  // Truncation guard: a streaming/auto-fix tag may arrive WITHOUT its closing
  // counterpart (e.g. the model was cut mid-emit). Run AFTER the paired
  // regexes so complete artifacts die first, then any leftover opening-only
  // tags are stripped — never reaching the bubble as raw visible XML.
  const openArtifactRegex = /<boltArtifact\s+[^>]*>/gm;
  const openActionRegex = /<boltAction\s+[^>]*>/gm;
  const selfClosingArtifactRegex = /<boltArtifact\s+[^>]*\/>/gm;
  // Strip the auto-fix breadcrumb preamble if it ever leaks into a user msg.
  // Covers ALL breadcrumb formats the auto-fix/continue loops emit:
  //   "*Auto-fix attempt 1/15 — Fix this terminal error*"  (legacy asterisked)
  //   "MAYA is fixing a terminal error (attempt 1/15)…"
  //   "MAYA is fixing a preview error (attempt 1/15)…"
  //   "MAYA is continuing the build (attempt 1/15)…"
  // Without this, the auto-fix subscriber (BuilderPage) sends these as a
  // role:'user' message → they rendered as a FAKE USER BUBBLE ("a message
  // going from the user without the user typing anything"). Stripping them
  // here collapses the bubble to empty → UserMessage renders nothing (see
  // the empty-textContent guards in the render paths below). The LLM still
  // sees the real error context via pipelineInstructionsRef (server-injected),
  // so the fix loop still triggers; only the visible bubble dies.
  const autoFixPreambleRegex = /(?:\*Auto-fix attempt\s+\d+\/\d+[^*]*\*|MAYA is (?:fixing a (?:terminal|preview)(?: error| that didn't load)?|continuing the build) \(attempt\s+\d+\/\d+\)[^]*?(?:…|\.)\s*)/g;
  // Strip ANSI color escapes that WebContainer terminal dumps can carry.
  const ansiRegex = /\x1b\[[0-9;]*[A-Za-z]/g;
  const planContextRegex = /\n*---\s*APP PLAN.*?---\s*END PLAN\s*---.*?architecture\./gs;
  // Strip the hidden mandatory-pipeline instruction block if it ever leaks
  const pipelineRegex = /\n*---\s*MANDATORY BUILD PIPELINE.*?(?:render correctly\.)\n*/gs;
  return content
    .replace(MODEL_REGEX, '')
    .replace(PROVIDER_REGEX, '')
    .replace(artifactRegex, '')
    .replace(actionRegex, '')
    .replace(selfClosingArtifactRegex, '')
    .replace(selfClosingActionRegex, '')
    .replace(openArtifactRegex, '')
    .replace(openActionRegex, '')
    .replace(autoFixPreambleRegex, '')
    .replace(ansiRegex, '')
    .replace(planContextRegex, '')
    .replace(pipelineRegex, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
