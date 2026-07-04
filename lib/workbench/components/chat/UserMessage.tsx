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

interface UserMessageProps {
  content: string | Array<{ type: string; text?: string; image?: string }>;
  parts:
    | (TextUIPart | ReasoningUIPart | ToolUIPart | SourceUrlUIPart | FileUIPart | StepStartUIPart)[]
    | undefined;
}

export function UserMessage({ content, parts }: UserMessageProps) {
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

    return (
      <div className="overflow-hidden flex flex-col gap-2 items-end">
        {/* User message bubble */}
        <div
          className="px-4 py-2.5 w-fit max-w-[85%] rounded-2xl rounded-br-md text-[14px] leading-relaxed"
          style={{
            background: 'rgba(232, 96, 26, 0.04)',
            border: '1px solid rgba(232, 96, 26, 0.10)',
            color: '#F5F4F0',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
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
    );
  }

  const textContent = stripMetadata(typeof resolvedContent === 'string' ? resolvedContent : '');

  return (
    <div
      className="px-4 py-2.5 w-fit rounded-2xl rounded-br-md ml-auto max-w-[85%] text-[14px] leading-relaxed"
      style={{
        background: 'rgba(232, 96, 26, 0.04)',
        border: '1px solid rgba(232, 96, 26, 0.10)',
        color: '#F5F4F0',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
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

function stripMetadata(content: string) {
  if (!content) return '';
  const artifactRegex = /<boltArtifact\s+[^>]*>[\s\S]*?<\/boltArtifact>/gm;
  // Defense-in-depth: strip any stray <boltAction>…</boltAction> tags so
  // bolt internals NEVER surface in the user's chat bubble. The auto-run
  // safety net now injects commands directly (BuilderPage) instead of
  // re-prompting with raw XML, but a model could still emit a stray tag.
  const actionRegex = /<boltAction\s+[^>]*>[\s\S]*?<\/boltAction>/gm;
  const selfClosingActionRegex = /<boltAction\s+[^>]*\/>/gm;
  const planContextRegex = /\n*---\s*APP PLAN.*?---\s*END PLAN\s*---.*?architecture\./gs;
  // Strip the hidden mandatory-pipeline instruction block if it ever leaks
  const pipelineRegex = /\n*---\s*MANDATORY BUILD PIPELINE.*?(?:render correctly\.)\n*/gs;
  return content
    .replace(MODEL_REGEX, '')
    .replace(PROVIDER_REGEX, '')
    .replace(artifactRegex, '')
    .replace(actionRegex, '')
    .replace(selfClosingActionRegex, '')
    .replace(planContextRegex, '')
    .replace(pipelineRegex, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
