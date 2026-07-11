// MAYA message action bar. Architecture ported from vercel-chatbot
// message-actions.tsx (hover-reveal `opacity-0 group-hover/message:opacity-100`,
// per-role action set), painted with MAYA hex tokens + Phosphor icons.
//
// What we DO port: copy (real, via navigator.clipboard), rewind (MAYA-native —
// revert-to-message), edit affordance (user role only — opens MessageEditor).
// What we DO NOT port: the /api/vote SWR optimistic-patch (MAYA has no vote
// table — votes are a cosmetic tint + console log per the migration plan's
// "What NOT to port"). Thumbs up/down icons are missing in icons.css, so we
// render i-ph:check-circle / i-ph:x as the cosmetic vote affordance.
import { memo, useState } from 'react';

interface MessageActionsProps {
  role: 'user' | 'assistant';
  messageId?: string;
  parts?: any[];
  isLoading?: boolean;
  onEdit?: () => void;
  onRewind?: () => void;
  language?: 'hi' | 'en';
}

function MessageActionsImpl({
  role,
  messageId: _messageId,
  parts,
  isLoading = false,
  onEdit,
  onRewind,
  language = 'en',
}: MessageActionsProps) {
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<'up' | 'down' | null>(null);

  if (isLoading) return null;

  const textFromParts = (parts ?? [])
    .filter((p: any) => p.type === 'text' && 'text' in p)
    .map((p: any) => p.text as string)
    .join('\n')
    .trim();

  const handleCopy = async () => {
    if (!textFromParts) return;
    try {
      await navigator.clipboard.writeText(textFromParts);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // clipboard unavailable — silent no-op
    }
  };

  // ── User row: edit (left-most) + copy, right-aligned to match user bubbles
  if (role === 'user') {
    return (
      <div className="flex items-center justify-end gap-0.5 opacity-0 transition-opacity duration-150 group-hover/message:opacity-100">
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            title={language === 'hi' ? 'संपादित करें' : 'Edit'}
            className="p-1 rounded-md text-[#4A4742] hover:text-[#F5F4F0] hover:bg-white/[0.04] transition-colors"
          >
            <span className="i-ph:pencil-simple w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={handleCopy}
          title={language === 'hi' ? 'कॉपी' : 'Copy'}
          className="p-1 rounded-md text-[#4A4742] hover:text-[#F5F4F0] hover:bg-white/[0.04] transition-colors"
        >
          <span
            className={`w-3.5 h-3.5 ${copied ? 'i-ph:check-bold text-[#2D7A4F]' : 'i-ph:copy'}`}
          />
        </button>
      </div>
    );
  }

  // ── Assistant row: rewind + copy + upvote + downvote
  return (
    <div className="flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover/message:opacity-100">
      {onRewind && (
        <button
          type="button"
          onClick={onRewind}
          title={language === 'hi' ? 'यहाँ से वापस जाएं' : 'Revert to here'}
          className="p-1 rounded-md text-[#4A4742] hover:text-[#E8601A] hover:bg-[#E8601A]/[0.06] transition-colors"
        >
          <span className="i-ph:arrow-u-up-left w-3.5 h-3.5" />
        </button>
      )}
      <button
        type="button"
        onClick={handleCopy}
        title={language === 'hi' ? 'कॉपी' : 'Copy'}
        className="p-1 rounded-md text-[#4A4742] hover:text-[#F5F4F0] hover:bg-white/[0.04] transition-colors"
      >
        <span
          className={`w-3.5 h-3.5 ${copied ? 'i-ph:check-bold text-[#2D7A4F]' : 'i-ph:copy'}`}
        />
      </button>
      <button
        type="button"
        onClick={() => {
          setVote(vote === 'up' ? null : 'up');
          // cosmetic only — no /api/vote persistence (MAYA has no vote table)
        }}
        title={language === 'hi' ? 'अच्छा जवाब' : 'Good response'}
        className={`p-1 rounded-md transition-colors ${
          vote === 'up'
            ? 'text-[#2D7A4F]'
            : 'text-[#4A4742] hover:text-[#F5F4F0] hover:bg-white/[0.04]'
        }`}
      >
        <span className="i-ph:check-circle w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => {
          setVote(vote === 'down' ? null : 'down');
          // cosmetic only
        }}
        title={language === 'hi' ? 'खराब जवाब' : 'Bad response'}
        className={`p-1 rounded-md transition-colors ${
          vote === 'down'
            ? 'text-[#F87171]'
            : 'text-[#4A4742] hover:text-[#F5F4F0] hover:bg-white/[0.04]'
        }`}
      >
        <span className="i-ph:x w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export const MessageActions = memo(MessageActionsImpl);
