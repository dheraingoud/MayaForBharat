import { AnimatePresence, cubicBezier, motion } from 'framer-motion';

// vercel-chatbot PromptInputSubmit 4-state machine (components/ai-elements/prompt-input.tsx:1089-1141)
//   ready     → arrow-up-bold   (type=submit, onClick)   MAYA orange gradient
//   submitted → circle-notch    (type=button, onStop)    dim neutral, spinning
//   streaming → stop-circle-bold(type=button, onStop)    red tint
//   error     → warning-circle  (type=submit, onClick)   red — re-submit / retry
// Painted in MAYA hex tokens (no vercel oklch). `status` preferred; fall back to
// isStreaming for callers that haven't threaded the ChatStatus enum yet.
type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error';

interface SendButtonProps {
  show: boolean;
  status?: ChatStatus;
  /** Legacy boolean — used only when `status` is omitted. */
  isStreaming?: boolean;
  disabled?: boolean;
  onClick?: (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => void;
  /** vercel: when provided + generating, click stops instead of submitting. */
  onStop?: () => void;
  onImagesSelected?: (images: File[]) => void;
}

const customEasingFn = cubicBezier(0.4, 0, 0.2, 1);

export const SendButton = ({ show, status, isStreaming, disabled, onClick, onStop }: SendButtonProps) => {
  const eff: ChatStatus = status ?? (isStreaming ? 'streaming' : 'ready');
  const isGenerating = eff === 'submitted' || eff === 'streaming';

  const palette = ({
    ready: {
      bg: 'linear-gradient(135deg, #E8601A 0%, #C94E12 100%)',
      border: '1px solid rgba(232, 96, 26, 0.4)',
      boxShadow: '0 2px 8px rgba(232, 96, 26, 0.25)',
      color: '#ffffff',
    },
    submitted: {
      bg: 'rgba(255, 255, 255, 0.04)',
      border: '1px solid rgba(255, 255, 255, 0.08)',
      boxShadow: 'none',
      color: '#9E9890',
    },
    streaming: {
      bg: 'rgba(248, 113, 113, 0.15)',
      border: '1px solid rgba(248, 113, 113, 0.3)',
      boxShadow: 'none',
      color: '#F87171',
    },
    error: {
      bg: 'rgba(248, 113, 113, 0.15)',
      border: '1px solid rgba(248, 113, 113, 0.35)',
      boxShadow: '0 2px 8px rgba(248, 113, 113, 0.18)',
      color: '#F87171',
    },
  } as const)[eff];

  const iconClass = 'w-4 h-4';
  const Icon =
    eff === 'ready' ? <div className={`i-ph:arrow-up-bold ${iconClass}`} />
    : eff === 'submitted' ? <div className={`i-ph:circle-notch ${iconClass} animate-spin`} />
    : eff === 'streaming' ? <div className={`i-ph:stop-circle-bold ${iconClass}`} />
    : <div className={`i-ph:warning-circle ${iconClass}`} />;

  return (
    <AnimatePresence>
      {show ? (
        <motion.button
          aria-label={isGenerating ? 'Stop' : 'Submit'}
          className="absolute flex justify-center items-center top-[18px] right-[22px] rounded-lg w-[34px] h-[34px] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            background: palette.bg,
            border: palette.border,
            boxShadow: palette.boxShadow,
            color: palette.color,
          }}
          transition={{ ease: customEasingFn, duration: 0.17 }}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          disabled={disabled}
          type={isGenerating && onStop ? 'button' : 'submit'}
          onClick={(event) => {
            event.preventDefault();
            if (disabled) return;
            if (isGenerating && onStop) {
              onStop();
              return;
            }
            onClick?.(event);
          }}
        >
          <div className="text-lg flex justify-center items-center">{Icon}</div>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
};
