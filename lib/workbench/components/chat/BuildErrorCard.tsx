'use client';

/*
 * BuildErrorCard — styled in-chat surface for build/preview runtime errors.
 *
 * Phase B: instead of leaking the raw terminal dump as a synthetic `user`
 * message (Phase L leak vector), the action-runner sets
 * `workbenchStore.buildErrorCard` and AssistantMessage renders ONE of these
 * cards on the last assistant message. The model still receives the error
 * context server-side via the hidden `pipelineInstructions` transport field
 * (chat/route.ts L178-192); the user only ever sees this card + the terminal
 * pane (two surfaces, one source of truth).
 *
 * Double-bezel per the design language: outer ring (ring-red-400/15) + inner
 * inset hairline (inset 0 1px 0 rgba(255,255,255,0.05)). Mono error dump on
 * the terminal token (#0A0A09). No emoji, no neon.
 */

import { memo } from 'react';
import { motion } from 'framer-motion';
import { useLanguage } from '@/app/providers';

export interface BuildErrorCardProps {
  command: string;
  error: string;
  source: 'terminal' | 'preview';
  attempt: number;
  maxAttempts: number;
}

/**
 * Strip ANSI escape codes + HTML tags from a raw error dump so a leaky
 * WebContainer / NIM payload renders as clean mono text and never as
 * rendered internals. Cap at 1500 chars.
 */
function cleanError(raw: string): string {
  if (!raw) return '';
  const noAnsi = raw.replace(/\x1b\[[0-9;]*m/g, '');
  const noHtml = noAnsi.replace(/<[^>]+>/g, '');
  const collapsed = noHtml.replace(/\n{3,}/g, '\n\n').trim();
  return collapsed.length > 1500 ? `${collapsed.slice(0, 1500)}…` : collapsed;
}

export const BuildErrorCard = memo(({ command, error, source, attempt, maxAttempts }: BuildErrorCardProps) => {
  const { language } = useLanguage();
  const isHindi = language === 'hi';
  const title = isHindi ? 'Build mein error' : 'Build error';
  const sourceLabel = source === 'preview' ? 'preview' : 'terminal';
  const showFixing = attempt > 0 && maxAttempts > 0;
  const fixing = isHindi
    ? `MAYA ise fix kar rahi hoo… (koshish ${attempt}/${maxAttempts})`
    : `MAYA is fixing this… (attempt ${attempt}/${maxAttempts})`;
  const cleaned = cleanError(error);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 120, damping: 22 }}
      className="mt-3 rounded-2xl p-0 ring-1 ring-red-400/15 bg-red-500/[0.04] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
    >
      <div className="rounded-[calc(1rem-2px)] p-3">
        <div className="flex items-center gap-2">
          <span className="i-ph:warning-octagon w-4 h-4 shrink-0 text-red-400/80" />
          <span className="text-[12px] font-medium text-red-200/90">{title}</span>
          {command && command !== '(build)' ? (
            <code className="ml-2 text-[11px] text-red-200/50 font-mono truncate min-w-0">{command}</code>
          ) : null}
          <span className="ml-auto text-[10px] uppercase tracking-[0.15em] text-red-300/40">{sourceLabel}</span>
        </div>
        {cleaned ? (
          <pre className="mt-2 max-h-[280px] overflow-auto rounded-lg bg-[#0A0A09] p-2 font-mono text-[11.5px] leading-relaxed text-red-100/70 whitespace-pre-wrap break-words">
{cleaned}
          </pre>
        ) : null}
        {showFixing ? (
          <div className="mt-2 flex items-center gap-1.5 text-[11px] text-[#E8601A]/80">
            <span
              className="inline-block h-1.5 w-1.5 rounded-full bg-[#E8601A]"
              style={{ animation: 'maya-pulse-dot 1.4s cubic-bezier(0.32,0.72,0,1) infinite' }}
            />
            {fixing}
          </div>
        ) : (
          // No attempts left (maxAttempts=0) → this is a terminal build failure
          // the model can't auto-fix (e.g. provider entitlement / config error).
          // Surface a labeled fallback so the user knows to act, per CLAUDE.md
          // "never 502 the user; fallback labeled fallback:true".
          <div className="mt-2 text-[11px] text-red-300/60">
            {isHindi
              ? 'Auto-fix is seem nahi ho saka. Niche retry button dabaayein.'
              : 'Auto-fix was unable to resolve this. Use the retry button below.'}
          </div>
        )}
      </div>
    </motion.div>
  );
});

BuildErrorCard.displayName = 'BuildErrorCard';
export default BuildErrorCard;
