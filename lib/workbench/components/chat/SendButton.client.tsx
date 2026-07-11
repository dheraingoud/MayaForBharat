import { AnimatePresence, cubicBezier, motion } from 'framer-motion';
import { ArrowUp, Loader2, Square, X } from 'lucide-react';

interface SendButtonProps {
  /** floating = absolute ChatBox textarea overlay (AnimatePresence mount). inline = static 32×32 flex item for toolbar use (BuilderPage). Default 'floating'. */
  variant?: 'floating' | 'inline';
  /** floating only — controls mount/unmount. Inline ignores this (always mounted, use disabled). */
  show?: boolean;
  /** vercel 4-state — drives icon + palette. Falls back to isStreaming boolean. */
  status?: 'ready' | 'submitted' | 'streaming' | 'error';
  /** Legacy boolean (kept for callers that haven't wired status). */
  isStreaming?: boolean;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  onImagesSelected?: (images: File[]) => void;
}

const customEasingFn = cubicBezier(0.4, 0, 0.2, 1);

export const SendButton = ({ variant = 'floating', show = true, status, isStreaming, disabled, onClick }: SendButtonProps) => {
  // Resolve effective 4-state: explicit status wins; else derive from legacy boolean.
  const effective: 'ready' | 'submitted' | 'streaming' | 'error' =
    status ?? (isStreaming ? 'streaming' : 'ready');

  // vercel PromptInputSubmit palette per state.
  const palette = {
    ready: {
      bg: 'linear-gradient(135deg, #E8601A 0%, #C94E12 100%)',
      border: '1px solid rgba(232, 96, 26, 0.4)',
      shadow: '0 2px 8px rgba(232, 96, 26, 0.25)',
      color: '#111110',
    },
    submitted: {
      bg: 'linear-gradient(135deg, #E8601A 0%, #C94E12 100%)',
      border: '1px solid rgba(232, 96, 26, 0.4)',
      shadow: '0 2px 8px rgba(232, 96, 26, 0.25)',
      color: '#111110',
    },
    streaming: {
      bg: '#1A1917',
      border: '1px solid rgba(255, 255, 255, 0.06)',
      shadow: 'none',
      color: '#F5F4F0',
    },
    error: {
      bg: 'rgba(248, 113, 113, 0.1)',
      border: '1px solid rgba(248, 113, 113, 0.3)',
      shadow: 'none',
      color: '#F87171',
    },
  }[effective];

  const icon = {
    ready: <ArrowUp size={16} strokeWidth={2.5} />,
    submitted: <Loader2 size={16} strokeWidth={2.5} className="animate-spin" />,
    streaming: <Square size={14} strokeWidth={2.5} fill="currentColor" />,
    error: <X size={16} strokeWidth={2.5} />,
  }[effective];

  // Shared motion + click handler. Both variants use active:scale-95 tactile
  // + Maya cubic-bezier (no linear/ease-in-out). Inline = static 32×32 flex item
  // (no absolute, always mounted, disabled gates) for the BuilderPage toolbar.
  // Floating = absolute 34×34 ChatBox overlay with AnimatePresence mount/unmount.
  const buttonProps = {
    style: { background: palette.bg, border: palette.border, boxShadow: palette.shadow, color: palette.color },
    transition: { ease: customEasingFn, duration: 0.17 } as const,
    disabled,
    onClick: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      event.preventDefault();
      if (!disabled) onClick?.(event);
    },
  };

  if (variant === 'inline') {
    return (
      <motion.button
        className="flex items-center justify-center shrink-0 h-8 w-8 rounded-xl transition-all duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
        {...buttonProps}
      >
        {icon}
      </motion.button>
    );
  }

  return (
    <AnimatePresence>
      {show ? (
        <motion.button
          className="absolute flex justify-center items-center top-[18px] right-[22px] rounded-xl w-[34px] h-[34px] transition-all duration-200 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          {...buttonProps}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
        >
          {icon}
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
};
